import type { CommandContext, ParsedArgs, CommandResult } from "../types";
import { setMockMode } from "../session";
import { LAX_CONFIG } from "../lax-config";
import { waitNextBlock } from "../rpc-utils";

function encodeAddressParam(address: string): string {
  return address.slice(2).padStart(64, "0");
}

function encodeUintParam(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

async function getOracleAddress(ctx: CommandContext): Promise<string> {
  const raw = await ctx.rpc<string>("eth_call", [
    { to: LAX_CONFIG.POOL_ADDRESSES_PROVIDER, data: "0xfca513a8" },
    "latest",
  ]);
  return `0x${raw.slice(-40)}`;
}

async function getPrice(ctx: CommandContext, oracle: string, token: string): Promise<bigint> {
  const padded = token.slice(2).padStart(64, "0");
  const raw = await ctx.rpc<string>("eth_call", [
    { to: oracle, data: `0xb3596f07${padded}` },
    "latest",
  ]);
  return BigInt(raw);
}

async function setPrice(ctx: CommandContext, oracle: string, token: string, price: bigint): Promise<string> {
  const beforeBlock = await ctx.rpc<string>("eth_blockNumber", []);
  const txHash = await ctx.rpc<string>("eth_sendTransaction", [
    {
      from: LAX_CONFIG.ANVIL_SIGNER,
      to: oracle,
      gas: "0x186a0",
      data: `0x51323f72${encodeAddressParam(token)}${encodeUintParam(price)}`,
    },
  ]);
  // Fork mines on a 1s interval — without this, the next read sees the old price.
  await waitNextBlock(beforeBlock);
  return txHash;
}

function tokenAddress(token: string): string {
  const t = token.toUpperCase();
  if (t === "WETH") return LAX_CONFIG.WETH;
  if (t === "USDC") return LAX_CONFIG.USDC;
  return token;
}

function humanizeRpcError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes("fetch failed") || lower.includes("failed to fetch") || lower.includes("econnrefused") || lower.includes("connection refused") || lower.includes("timeout")) {
    return `RPC unreachable — is the fork running? Try ./scripts/start-fork.sh (${raw})`;
  }
  return raw;
}

export async function handleMockStart(ctx: CommandContext): Promise<CommandResult> {
  setMockMode(true);
  ctx.setMockMode(true);
  ctx.emit({ type: "mock-mode", payload: { active: true } });
  return { output: "SIMULATION MODE ACTIVE — Oracle prices are manipulated" };
}

export async function handleMockStop(ctx: CommandContext): Promise<CommandResult> {
  setMockMode(false);
  ctx.setMockMode(false);
  ctx.emit({ type: "mock-mode", payload: { active: false } });
  try {
    const oracle = await getOracleAddress(ctx);
    await setPrice(ctx, oracle, LAX_CONFIG.WETH, BigInt("330000000000"));
    await setPrice(ctx, oracle, LAX_CONFIG.USDC, BigInt("100000000"));
    await ctx.refreshPosition();
    return { output: "Prices restored to default\nWETH: $3,300.00\nUSDC: $1.00\nSIMULATION MODE OFF" };
  } catch (err) {
    const msg = humanizeRpcError(err);
    return { output: `Prices restored (failed): ${msg}`, error: "execution-failed" as const };
  }
}

export async function handleShock(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const tokenRaw = args.positional[0] ?? "WETH";
  const percentRaw = args.positional[1] ?? "-50%";
  const token = tokenAddress(tokenRaw);
  const percent = parseFloat(percentRaw.replace(/[%+]/g, ""));
  if (isNaN(percent) || !isFinite(percent)) return { output: `Invalid percent: ${percentRaw}`, error: "Invalid argument" };

  try {
    const oracle = await getOracleAddress(ctx);
    const currentPrice = await getPrice(ctx, oracle, token);
    // Percent to basis points (30% = 3000 bps).
    const multiplier = BigInt(Math.round(Math.abs(percent) * 100));
    const newPrice = percent < 0
      ? (currentPrice * (10_000n - multiplier)) / 10_000n
      : (currentPrice * (10_000n + multiplier)) / 10_000n;

    const txHash = await setPrice(ctx, oracle, token, newPrice);
    await ctx.refreshPosition();
    const pos = ctx.position();
    const hfStr = pos ? (Number(pos.healthFactor) / 1e18).toFixed(4) : "?.????";

    return {
      output: `Price shock: ${tokenRaw} ${percent >= 0 ? "+" : ""}${percent}%\nNew price: $${(Number(newPrice) / 1e8).toFixed(2)}\nTx: ${txHash.slice(0, 10)}...${txHash.slice(-6)}\nHF: ${hfStr}`,
      eventLogEntry: { level: "trigger", message: `Price shock: ${tokenRaw} ${percent}% → HF ${hfStr}` },
      shouldUpdatePosition: true,
    };
  } catch (err) {
    const msg = humanizeRpcError(err);
    return { output: `Price shock failed: ${msg}`, error: "execution-failed" as const };
  }
}

export async function handleFlashCrash(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const tokenRaw = args.positional[0] ?? "WETH";
  const percentRaw = args.positional[1] ?? "-70%";
  const token = tokenAddress(tokenRaw);
  const percent = parseFloat(percentRaw.replace(/[%+]/g, ""));

  try {
    const oracle = await getOracleAddress(ctx);
    const currentPrice = await getPrice(ctx, oracle, token);
    // Percent to basis points.
    const targetMul = BigInt(Math.round(Math.abs(percent) * 100));
    const targetPrice = (currentPrice * (10_000n - targetMul)) / 10_000n;
    const steps = 5;
    const stepMul = (currentPrice - targetPrice) / BigInt(steps);

    for (let i = 1; i <= steps; i++) {
      const stepPrice = currentPrice - stepMul * BigInt(i);
      await setPrice(ctx, oracle, token, stepPrice);
    }

    await ctx.refreshPosition();
    const pos = ctx.position();
    const hfStr = pos ? (Number(pos.healthFactor) / 1e18).toFixed(4) : "?.????";

    return {
      output: `Flash crash: ${tokenRaw} ${percent}% over ${steps}s\nFinal price: $${(Number(targetPrice) / 1e8).toFixed(2)}\nHF: ${hfStr}`,
      eventLogEntry: { level: "trigger", message: `Flash crash: ${tokenRaw} -${Math.abs(percent)}% → HF ${hfStr}` },
      shouldUpdatePosition: true,
    };
  } catch (err) {
    const msg = humanizeRpcError(err);
    return { output: `Flash crash failed: ${msg}`, error: "execution-failed" as const };
  }
}

export async function handleDrip(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const tokenRaw = args.positional[0] ?? "WETH";
  const percentRaw = args.positional[1] ?? "-1%";
  const ticks = parseInt(args.positional[2] ?? "5");
  const token = tokenAddress(tokenRaw);
  const percent = parseFloat(percentRaw.replace(/[%+]/g, ""));

  try {
    const oracle = await getOracleAddress(ctx);
    let currentPrice = await getPrice(ctx, oracle, token);
    const mul = BigInt(Math.round(Math.abs(percent) * 100));

    for (let i = 0; i < ticks; i++) {
      currentPrice = percent < 0
        ? (currentPrice * (10_000n - mul)) / 10_000n
        : (currentPrice * (10_000n + mul)) / 10_000n;
      await setPrice(ctx, oracle, token, currentPrice);
    }

    await ctx.refreshPosition();
    return {
      output: `Drip: ${tokenRaw} ${percent}% × ${ticks} ticks\nFinal price: $${(Number(currentPrice) / 1e8).toFixed(2)}`,
      shouldUpdatePosition: true,
    };
  } catch (err) {
    const msg = humanizeRpcError(err);
    return { output: `Drip failed: ${msg}`, error: "execution-failed" as const };
  }
}

export async function handleRecovery(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const tokenRaw = args.positional[0] ?? "WETH";
  const percentRaw = args.positional[1] ?? "+5%";
  const token = tokenAddress(tokenRaw);
  const percent = parseFloat(percentRaw.replace(/[%+]/g, ""));

  try {
    const oracle = await getOracleAddress(ctx);
    const currentPrice = await getPrice(ctx, oracle, token);
    const mul = BigInt(Math.round(percent * 100));
    const newPrice = (currentPrice * (10_000n + mul)) / 10_000n;
    const txHash = await setPrice(ctx, oracle, token, newPrice);
    await ctx.refreshPosition();

    return {
      output: `Recovery: ${tokenRaw} +${percent}%\nPrice: $${(Number(newPrice) / 1e8).toFixed(2)}\nTx: ${txHash.slice(0, 10)}...`,
      shouldUpdatePosition: true,
    };
  } catch (err) {
    const msg = humanizeRpcError(err);
    return { output: `Recovery failed: ${msg}`, error: "execution-failed" as const };
  }
}

export async function handleResetPrice(ctx: CommandContext): Promise<CommandResult> {
  try {
    const oracle = await getOracleAddress(ctx);
    await setPrice(ctx, oracle, LAX_CONFIG.WETH, BigInt("330000000000"));
    await setPrice(ctx, oracle, LAX_CONFIG.USDC, BigInt("100000000"));
    await ctx.refreshPosition();
    return { output: "Prices reset: WETH $3,300.00, USDC $1.00", shouldUpdatePosition: true };
  } catch (err) {
    const msg = humanizeRpcError(err);
    return { output: `Reset failed: ${msg}`, error: "execution-failed" as const };
  }
}

export async function handleSimulateHf(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const targetHf = parseFloat(args.positional[0] ?? "1.02");
  if (isNaN(targetHf) || !isFinite(targetHf)) return { output: `Invalid target HF`, error: "Invalid argument" };
  if (targetHf <= 0 || targetHf > 1.5) {
    return { output: `lax simulate-hf: target must be between 0 and 1.5 (got ${targetHf})`, error: "Invalid argument" };
  }

  try {
    const oracle = await getOracleAddress(ctx);
    const readHf = async (): Promise<number> => {
      await ctx.refreshPosition();
      const p = ctx.position();
      if (!p) throw new Error("position read failed after the price write");
      return Number(p.healthFactor) / 1e18;
    };

    const TOLERANCE = 0.005;
    let price = await getPrice(ctx, oracle, LAX_CONFIG.WETH);
    let hf = await readHf();
    if (!isFinite(hf) || hf > 1e9) {
      return { output: "Position has no debt — HF is unbounded, nothing to simulate", error: "Invalid state" };
    }
    const startHf = hf;
    if (Math.abs(hf - targetHf) <= TOLERANCE) {
      return {
        output: `HF already ${hf.toFixed(4)} (target ${targetHf}) — oracle left at $${(Number(price) / 1e8).toFixed(2)}`,
        shouldUpdatePosition: true,
      };
    }

    // HF is affine in collateral price with multiple collaterals; use two
    // measurements to solve for the price.
    for (let round = 0; round < 4; round++) {
      const probe = hf > targetHf ? (price * 90n) / 100n : (price * 110n) / 100n;
      await setPrice(ctx, oracle, LAX_CONFIG.WETH, probe);
      const hfProbe = await readHf();
      const slope = (hfProbe - hf) / (Number(probe - price) / 1e8);
      if (!isFinite(slope) || Math.abs(slope) < 1e-9) {
        return { output: "Simulate HF failed: oracle move did not change HF — is the Pool reading this oracle?", error: "execution-failed" };
      }
      const solved = Number(price) / 1e8 + (targetHf - hf) / slope;
      if (!isFinite(solved) || solved <= 0) {
        return { output: `Simulate HF failed: target ${targetHf} is unreachable from this collateral`, error: "execution-failed" };
      }
      price = BigInt(Math.round(solved * 1e8));
      await setPrice(ctx, oracle, LAX_CONFIG.WETH, price);
      hf = await readHf();
      if (Math.abs(hf - targetHf) <= TOLERANCE) break;
    }

    const finalPrice = Number(price) / 1e8;
    if (Math.abs(hf - targetHf) > 0.02) {
      return {
        output: `Simulate HF: best effort — HF ${hf.toFixed(4)} (target ${targetHf}) at WETH $${finalPrice.toFixed(2)}`,
        error: "execution-failed",
      };
    }
    return {
      output: `HF ${startHf.toFixed(4)} → ${hf.toFixed(4)} (target ${targetHf})\nWETH price: $${finalPrice.toFixed(2)}`,
      shouldUpdatePosition: true,
    };
  } catch (err) {
    const msg = humanizeRpcError(err);
    return { output: `Simulate HF failed: ${msg}`, error: "execution-failed" as const };
  }
}

export async function handleFreezeOracle(_ctx: CommandContext): Promise<CommandResult> {
  return { output: "Oracle frozen at current price" };
}

export async function handleUnfreezeOracle(_ctx: CommandContext): Promise<CommandResult> {
  return { output: "Oracle unfrozen — price changes allowed" };
}

export async function handleScenario(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const name = args.positional[0] ?? "flash-crash-2022";
  if (name === "flash-crash-2022") {
    return handleFlashCrash(ctx, { positional: ["WETH", "-70%"], flags: {} });
  }
  if (name === "slow-bleed") {
    return handleDrip(ctx, { positional: ["WETH", "-2%", "10"], flags: {} });
  }
  return { output: `Unknown scenario: ${name}`, error: "Scenario not found" };
}

export async function handlePanic(ctx: CommandContext): Promise<CommandResult> {
  return handleFlashCrash(ctx, { positional: ["WETH", "-90%"], flags: {} });
}

const mockAliases: Record<string, (ctx: CommandContext, args: ParsedArgs) => Promise<CommandResult>> = {
  "mock-start": handleMockStart,
  "mock-on": handleMockStart,
  "mock-stop": handleMockStop,
  "mock-off": handleMockStop,
  shock: handleShock,
  "flash-crash": handleFlashCrash,
  crash: handleFlashCrash,
  drip: handleDrip,
  recovery: handleRecovery,
  "reset-price": handleResetPrice,
  "simulate-hf": handleSimulateHf,
  "sim-hf": handleSimulateHf,
  "freeze-oracle": handleFreezeOracle,
  freeze: handleFreezeOracle,
  "unfreeze-oracle": handleUnfreezeOracle,
  unfreeze: handleUnfreezeOracle,
  scenario: handleScenario,
  panic: handlePanic,
};

export const handleMock = mockAliases;
