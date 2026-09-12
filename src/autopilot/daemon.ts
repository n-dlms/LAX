// lax autopilot daemon — continuous proactive liquidation defense.
// Replaces the one-shot scripts/hf-listener.ts as the primary trigger path:
//   poll HF (all positions from lax.config.json) → cooldown → mitigation gate
//   (math + preflight + caps) → KeeperHub webhook (HMAC-signed) → append-only log.
// Nothing is inferred at execution time: the exact repay amount is computed at
// fire time and passed in the payload (V2 plan fix #2).
import { LAX_CONFIG } from "../cli/lax-config";
import { fetchPosition } from "../cli/node-context";
import { style, TOKENS } from "../cli/ui";
import { computeRepayAmount, hfToBigint, usdcToString } from "../repay-math";
import { fireWorkflowWebhook, runUrl } from "../keeperhub";
import { runMitigationGate } from "./gate";
import { loadPositions, type ResolvedPosition } from "./positions";
import { loadState, saveState, appendMitigation, mitigationLogPath, type DaemonState } from "./state";

export interface DaemonOptions {
  /** Poll interval in ms (default: CONFIG.LISTENER_POLL_MS = 2000) */
  intervalMs?: number;
  /** Minimum ms between fires per position (hysteresis; default 5 min) */
  cooldownMs?: number;
  /** Run the full pipeline but never fire the webhook */
  dryRun?: boolean;
  /** Exit after one poll pass (CI / demo script) */
  once?: boolean;
  /** Monitor only the named position from lax.config.json */
  only?: string;
}

interface PollOutcome {
  decision: string;
  fired: boolean;
}

function ts(): string {
  return new Date().toLocaleTimeString("en-GB");
}

function log(icon: string, color: (s: string) => string, message: string): void {
  console.log(`${color(icon)} ${style.gray(ts())} ${message}`);
}

function dryRunLabel(o: DaemonOptions): string {
  return o.dryRun ? style.bgYellow(style.red(" DRY-RUN — will not fire ")) : style.bgGreen(style.black(" LIVE "));
}

export async function runAutopilot(daemonOpts: DaemonOptions = {}): Promise<void> {
  const intervalMs = daemonOpts.intervalMs ?? 2000;
  const cooldownMs = daemonOpts.cooldownMs ?? 300_000;

  const { positions, errors } = loadPositions();
  const monitored = daemonOpts.only ? positions.filter((p) => p.name === daemonOpts.only) : positions;
  for (const e of errors) log(TOKENS.warn, style.yellow, `config: ${e}`);
  if (!process.env.LAX_CONFIG_PATH && !daemonOpts.only) {
    try {
      const { existsSync } = await import("node:fs");
      if (!existsSync("lax.config.json")) {
        log(TOKENS.info, style.cyan, `no lax.config.json — using built-in default position (copy lax.config.example.json to customize)`);
      }
    } catch { /* best-effort hint only */ }
  }
  if (monitored.length === 0) {
    log(TOKENS.fail, style.red, `no positions to monitor${daemonOpts.only ? ` for name "${daemonOpts.only}" — check names in lax.config.json` : ""}`);
    return;
  }

  const state: DaemonState = loadState(LAX_CONFIG.HF_TRIGGER, LAX_CONFIG.HF_TARGET);
  state.guardian = {
    enabled: true,
    blocked: state.guardian.blocked,
    threshold: monitored[0]!.threshold,
    target: monitored[0]!.target,
  };
  saveState(state);

  console.log(renderDaemonHeader(daemonOpts, monitored, cooldownMs));
  log(TOKENS.info, style.cyan, `mitigation log: ${mitigationLogPath()}`);
  log(TOKENS.info, style.cyan, `polling every ${(intervalMs / 1000).toFixed(1)}s — cooldown ${(cooldownMs / 1000).toFixed(0)}s per position`);

  let running = true;
  const onSignal = (): void => {
    running = false;
    log(TOKENS.warn, style.yellow, "SIGINT — finishing current poll, then shutting down");
  };
  process.on("SIGINT", onSignal);

  while (running) {
    let anyFired = false;
    let decision = "healthy";
    for (const position of monitored) {
      try {
        const outcome = await pollOnce(position, state, daemonOpts, cooldownMs);
        if (outcome.fired) {
          anyFired = true;
          decision = outcome.decision;
          state.lastFiredBy = { ...(state.lastFiredBy ?? {}), [position.name]: Date.now() };
          saveState(state);
        } else if (outcome.decision !== "healthy" && decision === "healthy") {
          decision = outcome.decision;
        }
      } catch (err) {
        log(TOKENS.fail, style.red, `[${position.name}] poll error: ${(err as Error).message}`);
        decision = "error";
      }
    }

    if (daemonOpts.once) {
      log(TOKENS.info, style.cyan, `once mode — decision: ${decision}`);
      return;
    }
    await sleep(intervalMs);
  }

  appendMitigation({ kind: "shutdown" });
  log(TOKENS.shield, style.gray, "autopilot stopped");
}

function renderDaemonHeader(o: DaemonOptions, positions: ResolvedPosition[], cooldownMs: number): string {
  const lines = [
    "",
    `  ${style.bold(style.cyan("LAX AUTOPILOT"))} ${dryRunLabel(o)}`,
    `  ${style.gray("positions")} ${positions.map((p) => `${p.name}@${p.network} ${style.gray(p.borrower.slice(0, 8) + "…")} ${style.gray(`≤${p.threshold}`)}`).join("  ")}`,
    `  ${style.gray("execution")} KeeperHub workflow (deterministic) ${style.gray("·")} ${style.gray("cooldown")} ${(cooldownMs / 1000).toFixed(0)}s`,
    "",
  ];
  return lines.join("\n");
}

async function pollOnce(
  position: ResolvedPosition,
  state: DaemonState,
  daemonOpts: DaemonOptions,
  cooldownMs: number,
): Promise<PollOutcome> {
  const tag = style.bold(style.cyan(`[${position.name}]`));

  const pos = await fetchPosition(position.borrower, position.aavePool, position.rpc);
  if (!pos) {
    log(TOKENS.warn, style.yellow, `${tag} position read failed — RPC unreachable? retrying next poll`);
    return { decision: "rpc-unreachable", fired: false };
  }
  const hf = Number(pos.healthFactor) / 1e18;

  if (pos.totalDebtUSD === 0n) {
    log(TOKENS.ok, style.green, `${tag} HF ∞ (no debt) — healthy`);
    return { decision: "no-debt", fired: false };
  }

  if (hf > position.threshold) {
    log(TOKENS.ok, style.green, `${tag} HF ${hf.toFixed(4)} — above trigger ${position.threshold}`);
    return { decision: "healthy", fired: false };
  }

  // --- trigger conditions met ---
  const lastFired = state.lastFiredBy?.[position.name] ?? 0;
  const sinceLast = lastFired ? Date.now() - lastFired : Infinity;
  if (sinceLast < cooldownMs) {
    log(TOKENS.warn, style.yellow, `${tag} HF ${hf.toFixed(4)} ≤ trigger but cooldown active (${Math.ceil((cooldownMs - sinceLast) / 1000)}s left) — not re-firing`);
    return { decision: "cooldown", fired: false };
  }

  const targetHf = hfToBigint(position.target);
  const exact = computeRepayAmount(pos.totalDebtUSD, pos.healthFactor, targetHf);
  const repayUsdc = (exact * 101n) / 100n; // +1% buffer, same as hf-listener
  if (repayUsdc === 0n) {
    log(TOKENS.warn, style.yellow, `${tag} HF ${hf.toFixed(4)} ≤ trigger but computed repay is zero — skipping`);
    return { decision: "zero-repay", fired: false };
  }

  log(TOKENS.trigger, style.yellow, `TRIGGER ${tag} HF ${hf.toFixed(4)} ≤ ${position.threshold} — repay ${usdcToString(repayUsdc)} USDC → target ${position.target}`);

  const gate = runMitigationGate({
    totalDebtBase: pos.totalDebtUSD,
    currentHf: pos.healthFactor,
    targetHf,
    repayAmount: repayUsdc,
    borrowerAddress: position.borrower,
    poolAddress: position.aavePool,
    repayToken: position.usdc,
    rpcUrl: position.rpc,
  }, { recordSpend: !daemonOpts.dryRun });

  for (const stage of gate.stages) {
    const icon = stage.passed ? style.green(TOKENS.ok) : style.red(TOKENS.fail);
    log(style.gray(TOKENS.dot), style.gray, `${tag} ${icon} ${stage.name}: ${stage.detail}`);
  }

  if (!gate.approved) {
    appendMitigation({ kind: "gate-blocked", hf, repayUsdc: repayUsdc.toString(), reason: gate.summary, stages: gate.stages.map((st) => `${st.name}:${st.passed ? "ok" : "FAIL"}`).join(",") });
    log(TOKENS.fail, style.red, `GATE BLOCKED — nothing was fired. This is the safety system working.`);
    return { decision: "gate-blocked", fired: false };
  }

  if (daemonOpts.dryRun) {
    appendMitigation({ kind: "dry-run", hf, repayUsdc: repayUsdc.toString(), reason: "gate approved; dry-run mode" });
    log(TOKENS.info, style.cyan, `DRY-RUN complete — gate approved, webhook NOT fired`);
    return { decision: "dry-run-approved", fired: false };
  }

  try {
    const fire = await fireWorkflowWebhook({
      reason: "autopilot-trigger",
      position: position.name,
      network: position.network,
      borrower: position.borrower,
      repayAmount: repayUsdc.toString(),
      repayAmountHuman: usdcToString(repayUsdc),
      hfAtTrigger: hf.toFixed(4),
      targetHf: position.target,
      triggeredAt: new Date().toISOString(),
    }, { workflowId: position.workflowId });
    if (!fire.ok) throw new Error(`KeeperHub ${fire.status}: ${fire.raw.slice(0, 200)}`);

    appendMitigation({ kind: "webhook-fired", hf, repayUsdc: repayUsdc.toString(), executionId: fire.executionId });
    log(TOKENS.bolt, style.cyan, `fired → execution ${style.bold(fire.executionId)}`);
    console.log(`     ${style.gray("audit trail:")} ${style.underline(style.blue(runUrl(fire.executionId)))}`);
    return { decision: "fired", fired: true };
  } catch (err) {
    appendMitigation({ kind: "fire-failed", hf, repayUsdc: repayUsdc.toString(), reason: (err as Error).message });
    log(TOKENS.fail, style.red, `fire failed: ${(err as Error).message}`);
    return { decision: "fire-failed", fired: false };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
