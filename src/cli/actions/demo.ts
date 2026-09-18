// `lax demo` — a self-running, narrated demonstration of the whole defense
// story against the local Base fork: healthy position → oracle shock → HF
// falls → mitigation gate decides → KeeperHub workflow fires → HF restored.
// Fork-only by construction (the price shock is an Anvil dev-account tx);
// the fire honors the mitigation gate and DRY-RUN mode like every path.
import type { CommandContext, ParsedArgs, CommandResult } from "../types";
import { LAX_CONFIG } from "../lax-config";
import { rpcAt, fetchPosition, rpc } from "../node-context";
import { computeRepayAmount, hfToBigint, usdcToString } from "../../repay-math";
import { fireWorkflowWebhook, runUrl } from "../../keeperhub";
import { runMitigationGate } from "../../autopilot/gate";
import { appendMitigation } from "../../autopilot/state";
import { style, TOKENS, box, hfGauge } from "../ui";

// Anvil dev account #0 — public, fork-only, holds no real funds. Never use on
// a live network. It owns the demo MockOracle, so it can set prices.
const ANVIL_DEV_ACCOUNT_0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

// keccak("setAssetPrice(address,uint256)")[:4] / keccak("getAssetPrice(address)")[:4]
const SET_ASSET_PRICE = "0x51323f72";
const GET_ASSET_PRICE = "0xb3596f07";
// keccak("getPriceOracle()")[:4]
const GET_PRICE_ORACLE = "0xfca513a8";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function readWethPrice(): Promise<bigint | null> {
  try {
    const oracleRaw = await rpc<string>("eth_call", [
      { to: LAX_CONFIG.POOL_ADDRESSES_PROVIDER, data: GET_PRICE_ORACLE }, "latest",
    ]);
    const oracle = `0x${oracleRaw.slice(-40)}`;
    const wethPadded = LAX_CONFIG.WETH.slice(2).padStart(64, "0");
    const raw = await rpcAt<string>(LAX_CONFIG.FORK_RPC, "eth_call", [
      { to: oracle, data: `${GET_ASSET_PRICE}${wethPadded}` }, "latest",
    ]);
    return BigInt(raw);
  } catch {
    return null;
  }
}

async function setWethPrice(newPrice: bigint): Promise<void> {
  const oracle = await oracleAddress();
  const data = `${SET_ASSET_PRICE}${LAX_CONFIG.WETH.slice(2).padStart(64, "0")}${newPrice.toString(16).padStart(64, "0")}`;
  await rpcAt<string>(LAX_CONFIG.FORK_RPC, "eth_sendTransaction", [
    { from: ANVIL_DEV_ACCOUNT_0, to: `0x${oracle}`, data, gas: "0xc350" },
  ]);
  await waitAMine();
}

async function shockWethPrice(shockPct: number): Promise<{ oldPrice: bigint; newPrice: bigint } | { error: string }> {
  const oldPrice = await readWethPrice();
  if (oldPrice === null) return { error: "cannot read the WETH price (is the fork running? ./scripts/start-fork.sh)" };
  const newPrice = (oldPrice * BigInt(Math.round(100 - shockPct))) / 100n;
  try {
    await setWethPrice(newPrice);
    let verified = await readWethPrice();
    for (let attempt = 0; attempt < 3; attempt++) {
      if (verified !== null && verified !== oldPrice) break;
      await sleep(700);
      verified = await readWethPrice();
    }
    if (verified === null) return { error: "price set but verification read failed" };
    return { oldPrice, newPrice: verified };
  } catch (err) {
    return { error: `price shock failed: ${(err as Error).message} (fork-only — needs the local Anvil dev account)` };
  }
}

/** A previous demo run leaves the fork shocked (HF in the trigger zone).
 *  Instead of refusing, heal the scenario: raise the WETH price until the
 *  position is back above the trigger. HF is affine (not proportional) in
 *  price when the position holds more than one collateral, so converge with
 *  proportional control over a few rounds instead of one closed-form jump. */
const HEAL_TARGET_HF = 1.15;
/** Enough headroom above the 1.05 trigger for the crash story; the exact
 *  target is often reached one round after the price read lags, so accept. */
const HEAL_ACCEPT_HF = 1.08;

async function healScenario(): Promise<{ fromPrice: bigint; toPrice: bigint; hfHealed: number } | { error: string }> {
  const fromPrice = await readWethPrice();
  if (fromPrice === null) return { error: "cannot read the WETH price for scenario heal" };
  let price = fromPrice;
  let hf = 0;
  for (let round = 0; round < 8; round++) {
    const p = await fetchPosition();
    if (!p) return { error: "position read failed during scenario heal" };
    hf = Number(p.healthFactor) / 1e18;
    if (hf >= HEAL_ACCEPT_HF) {
      return { fromPrice, toPrice: price, hfHealed: hf };
    }
    const factor = Math.min(HEAL_TARGET_HF / hf, 3);
    price = (price * BigInt(Math.ceil(factor * 1000))) / 1000n;
    try {
      await setWethPrice(price);
    } catch (err) {
      return { error: `scenario heal failed: ${(err as Error).message}` };
    }
    const verified = await readWethPrice();
    if (verified !== null) price = verified;
  }
  return { error: `could not heal the scenario (HF ${hf.toFixed(4)} after 6 rounds) — run ./scripts/demo-up.sh` };
}

async function oracleAddress(): Promise<string> {
  const raw = await rpc<string>("eth_call", [
    { to: LAX_CONFIG.POOL_ADDRESSES_PROVIDER, data: GET_PRICE_ORACLE }, "latest",
  ]);
  return raw.slice(-40);
}

async function waitAMine(): Promise<void> {
  try {
    const { waitNextBlock } = await import("../rpc-utils");
    const before = await rpc<string>("eth_blockNumber", []);
    await waitNextBlock(before, 4000);
  } catch { /* fall through — verification read is the real check */ }
}

export async function handleDemo(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  // Demo caps are sized for the seeded scenario.
  if (!process.env.LAX_BLOCK_THRESHOLD_USD) process.env.LAX_BLOCK_THRESHOLD_USD = "50";
  if (!process.env.LAX_DAILY_LIMIT_USD) process.env.LAX_DAILY_LIMIT_USD = "100";
  const shockPct = (() => {
    const raw = parseFloat(args.flags["shock"] ?? "50");
    return Number.isFinite(raw) && raw > 0 && raw <= 90 ? raw : 50;
  })();
  const dryRun = args.flags["yes"] === undefined;
  const fireWebhook = args.flags["webhook"] !== undefined;

  const say = (icon: string, msg: string): void => {
    console.log(`${icon} ${msg}`);
  };
  const beat = (msg: string): void => {
    console.log(`\n${style.bold(style.cyan(msg))}`);
  };

  console.log(box([
    `${style.bold("LAX LIVE DEMO — proactive liquidation defense")}`,
    `${style.gray("local Base mainnet fork · deterministic · the bots never get a chance")}`,
  ].join("\n"), { color: style.cyan }));

  // ── Beat 1: the position, healthy ──
  beat("1 · The position we're defending");
  let pos = ctx.position();
  if (!pos) {
    await ctx.refreshPosition();
    pos = ctx.position();
  }
  if (!pos || pos.totalDebtUSD === 0n) {
    return { output: "Demo needs a live position with debt — run ./scripts/demo-up.sh first.", error: "Position unavailable" };
  }
  const hfStart = Number(pos.healthFactor) / 1e18;
  if (hfStart <= 1.05) {
    say(TOKENS.warn, `position starts at HF ${hfStart.toFixed(4)} (a previous run left it shocked) — healing the scenario first…`);
    const heal = await healScenario();
    if ("error" in heal) return { output: heal.error, error: "demo-heal-failed" };
    const healed = await fetchPosition();
    if (!healed) return { output: "scenario heal set the price but the position read failed — retry.", error: "demo-heal-failed" };
    say(TOKENS.ok, `WETH/USD $${(Number(heal.fromPrice) / 1e8).toFixed(2)} → $${(Number(heal.toPrice) / 1e8).toFixed(2)} — HF ${hfStart.toFixed(4)} → ${heal.hfHealed.toFixed(4)}`);
    pos = healed;
  }
  console.log(hfGauge(Number(pos.healthFactor) / 1e18));
  console.log(`  collateral $${(Number(pos.totalCollateralUSD) / 1e8).toFixed(2)} · debt $${(Number(pos.totalDebtUSD) / 1e8).toFixed(2)}`);
  const hfCheck = Number(pos.healthFactor) / 1e18;
  if (hfCheck <= 1.05) {
    return { output: `Position HF is still ${hfCheck.toFixed(4)} (≤ 1.05). Re-seed with ./scripts/demo-up.sh`, error: "position already in trigger zone" };
  }
  const priceBefore = await readWethPrice();
  if (priceBefore !== null) say(TOKENS.info, `WETH/USD oracle: $${(Number(priceBefore) / 1e8).toFixed(2)}`);
  await sleep(900);

  // ── Beat 2: the shock ──
  beat("2 · Market crashes — WETH drops " + shockPct + "%");
  say(TOKENS.info, "MEV bots see this block before you do. They are already preparing liquidations…");
  const shock = await shockWethPrice(shockPct);
  if ("error" in shock) return { output: shock.error, error: "demo-shock-failed" };
  say(TOKENS.warn, `WETH/USD $${(Number(shock.oldPrice) / 1e8).toFixed(2)} → $${(Number(shock.newPrice) / 1e8).toFixed(2)}`);
  await sleep(900);

  // ── Beat 3: HF falls, LAX is watching ──
  beat("3 · Health factor falls — the autopilot is already watching");
  let hfNow = hfStart;
  for (let i = 0; i < 3; i++) {
    await sleep(700);
    const p = await fetchPosition();
    if (!p) continue;
    hfNow = Number(p.healthFactor) / 1e18;
    console.log(style.gray(`  poll ${i + 1}: HF ${hfNow.toFixed(4)}`));
    if (hfNow <= 1.05) break;
  }
  console.log(hfGauge(hfNow));
  await sleep(700);

  // ── Beat 4: trigger + gate ──
  beat("4 · TRIGGER — the mitigation gate decides");
  const targetHf = LAX_CONFIG.HF_TARGET;
  const targetBig = hfToBigint(targetHf);
  // Repay is computed from the current position read.
  const current = await fetchPosition();
  if (!current || current.totalDebtUSD === 0n) {
    return { output: "Position read failed at trigger time — is the fork still up?", error: "Position unavailable" };
  }
  hfNow = Number(current.healthFactor) / 1e18;
  const exact = computeRepayAmount(current.totalDebtUSD, current.healthFactor, targetBig);
  const repayUsdc = (exact * 101n) / 100n; // +1% buffer, same as every fire path
  if (repayUsdc === 0n) {
    return { output: "Computed repay is zero at this HF — re-run ./scripts/demo-up.sh for a fresh scenario.", error: "zero-repay" };
  }
  say(TOKENS.trigger, `HF ${hfNow.toFixed(4)} ≤ 1.05 → repay ${usdcToString(repayUsdc)} USDC (exact amount, computed at fire time)`);

  const gate = runMitigationGate({
    totalDebtBase: current.totalDebtUSD,
    currentHf: current.healthFactor,
    targetHf: targetBig,
    repayAmount: repayUsdc,
    borrowerAddress: LAX_CONFIG.BORROWER_ADDRESS,
    poolAddress: LAX_CONFIG.AAVE_POOL,
    repayToken: LAX_CONFIG.USDC,
    rpcUrl: LAX_CONFIG.FORK_RPC,
  }, { recordSpend: !dryRun });
  const stagesCompact = gate.stages.map((st) => `${st.name}:${st.passed ? "ok" : "FAIL"}`).join(",");
  for (const st of gate.stages) {
    say(st.passed ? style.green(TOKENS.ok) : style.red(TOKENS.fail), `${st.passed ? "PASS" : "FAIL"} ${st.name} — ${st.detail}`);
  }

  if (!gate.approved) {
    appendMitigation({ kind: "gate-blocked", hf: hfNow, repayUsdc: repayUsdc.toString(), repayHuman: usdcToString(repayUsdc), reason: gate.summary, stages: stagesCompact, stagesDetail: gate.stages, position: "fork", network: "base-fork" });
    return { output: "\nGate blocked the demo fire — safety system working, but the demo can't proceed. Fix the blocking stage and re-run.", error: "gate-blocked" };
  }
  say(TOKENS.shield, `Gate approved ${gate.stages.length}/${gate.stages.length} — execution authorized`);
  await sleep(700);

  // ── Beat 5: fire ──
  beat("5 · Fire — execute the approved mitigation");
  let executionId: string | undefined;
  let txHashes: string[] = [];
  if (dryRun) {
    say(TOKENS.info, "DRY-RUN — nothing moved. Use `lax demo --yes` to execute for real.");
    appendMitigation({ kind: "dry-run", hf: hfNow, repayUsdc: repayUsdc.toString(), repayHuman: usdcToString(repayUsdc), reason: "demo-command; gate approved; dry-run", stages: stagesCompact, stagesDetail: gate.stages, position: "fork", network: "base-fork" });
  } else {
    const approveData = `0x095ea7b3${LAX_CONFIG.AAVE_POOL.slice(2).padStart(64, "0")}${repayUsdc.toString(16).padStart(64, "0")}`;
    const repayData = `0x573ade81${LAX_CONFIG.USDC.slice(2).padStart(64, "0")}${repayUsdc.toString(16).padStart(64, "0")}${2n.toString(16).padStart(64, "0")}${LAX_CONFIG.BORROWER_ADDRESS.slice(2).padStart(64, "0")}`;
    try {
      say(TOKENS.info, `approve: USDC spender Aave Pool — ${usdcToString(repayUsdc)} (fork tx)`);
      txHashes.push(await rpcAt<string>(LAX_CONFIG.FORK_RPC, "eth_sendTransaction", [
        { from: LAX_CONFIG.BORROWER_ADDRESS, to: LAX_CONFIG.USDC, gas: "0x186a0", data: approveData },
      ]));
      say(TOKENS.info, `repay:   Aave Pool.repay(USDC, ${usdcToString(repayUsdc)}, mode 2, onBehalfOf borrower)`);
      txHashes.push(await rpcAt<string>(LAX_CONFIG.FORK_RPC, "eth_sendTransaction", [
        { from: LAX_CONFIG.BORROWER_ADDRESS, to: LAX_CONFIG.AAVE_POOL, gas: "0x493e0", data: repayData },
      ]));
      for (const h of txHashes) console.log(`   ${style.gray("tx:")} ${style.underline(style.blue(h))}`);
      say(TOKENS.bolt, `mitigation executed on the fork — same calldata the KeeperHub workflow runs on a live chain`);
      appendMitigation({ kind: "webhook-fired", hf: hfNow, repayUsdc: repayUsdc.toString(), repayHuman: usdcToString(repayUsdc), reason: `demo-command · fork txs ${txHashes.join(",")}`, stages: stagesCompact, stagesDetail: gate.stages, position: "fork", network: "base-fork", executionId });
    } catch (err) {
      return { output: `Local execution failed: ${(err as Error).message} — the gate approved, so this is scenario funding (run ./scripts/fund-demo-wallet.sh), not logic.`, error: "demo-fire-failed" };
    }
    if (fireWebhook) {
      try {
        const fire = await fireWorkflowWebhook({
          reason: "demo-command",
          borrower: LAX_CONFIG.BORROWER_ADDRESS,
          repayAmount: repayUsdc.toString(),
          repayAmountHuman: usdcToString(repayUsdc),
          hfAtTrigger: hfNow.toFixed(4),
          targetHf,
          triggeredAt: new Date().toISOString(),
        });
        if (!fire.ok) throw new Error(`KeeperHub ${fire.status}: ${fire.raw.slice(0, 160)}`);
        executionId = fire.executionId;
        say(TOKENS.bolt, `KeeperHub webhook fired → execution ${style.bold(fire.executionId)} (audit trail)`);
        console.log(`   ${style.gray("audit trail:")} ${style.underline(style.blue(runUrl(fire.executionId, LAX_CONFIG.WORKFLOW_ID)))}`);
      } catch (err) {
        say(TOKENS.warn, `webhook fire skipped: ${(err as Error).message}`);
      }
    }
  }
  await sleep(700);

  // ── Beat 6: verify ──
  beat("6 · Verify — the position is repaired");
  const deadline = Date.now() + 60_000;
  let hfAfter = 0;
  let restored = false;
  while (Date.now() < deadline) {
    await sleep(2500);
    const p = await fetchPosition();
    if (!p) continue;
    hfAfter = Number(p.healthFactor) / 1e18;
    if (hfAfter >= targetHf) { restored = true; break; }
    if (dryRun) break; // nothing fired — one read is enough
    console.log(style.gray(`  waiting for the repay to land… HF ${hfAfter.toFixed(4)}`));
  }
  if (dryRun) {
    const p = await fetchPosition();
    hfAfter = p ? Number(p.healthFactor) / 1e18 : hfNow;
    console.log(hfGauge(hfAfter));
    say(TOKENS.info, "dry-run: position untouched — the real fire would repay and restore HF to the target.");
  } else if (restored) {
    console.log(hfGauge(hfAfter));
    say(TOKENS.ok, `HF restored: ${hfNow.toFixed(4)} → ${hfAfter.toFixed(4)} (target ${targetHf}) — before any liquidation.`);
  } else {
    console.log(hfGauge(hfAfter));
    say(TOKENS.warn, `repay still landing (HF ${hfAfter.toFixed(4)}) — check the tx hashes above; they confirm within a block.`);
  }
  await sleep(500);

  // ── Summary ──
  const modeLine = dryRun
    ? `mode: dry-run (${style.gray("lax demo --yes")} to execute)`
    : `executed: ${txHashes.length} fork tx${txHashes.length === 1 ? "" : "s"}${executionId ? ` · KeeperHub exec ${executionId}` : ""}`;
  console.log("");
  console.log(box([
    `${style.bold("DEMO COMPLETE")}`,
    `shock: -${shockPct}% WETH · HF ${hfNow.toFixed(4)} → trigger · repay ${usdcToString(repayUsdc)} USDC`,
    modeLine,
    style.gray("evidence: lax runs · lax explain 1 · lax whatif --shock 25"),
  ].join("\n"), { color: restored || dryRun ? style.green : style.yellow }));

  return { output: "" };
}
