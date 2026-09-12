// Node implementation of the CLI CommandContext (see dashboard/src/cli/types.ts).
// This is what makes the extracted cli/ core a standalone binary: raw JSON-RPC
// to the fork/testnet, guardian state persisted to ~/.lax/state.json, and the
// KeeperHub webhook trigger with fire-time exact repay (V2 plan, fix #2).
import { LAX_CONFIG } from "./lax-config";
import type { CliEvent, GuardianState, Snapshot } from "./types";
import { cliDispatcher } from "./dispatcher";
import { addExecutionRecord } from "./session";
import { computeRepayAmount, hfToBigint, usdcToString } from "../repay-math";
import { fireWorkflowWebhook } from "../keeperhub";
import { runMitigationGate } from "../autopilot/gate";
import { sendAlertAsync } from "../alerts";
import { rpc as sharedRpc, waitNextBlock } from "./rpc-utils";

export { waitNextBlock };

// keccak("getUserAccountData(address)")[:4] — verified live against the Pool
// (the dashboard copy shipped selector 0x2dfdf0b5, which reverts: it never
// actually read a live position, only mock data).
const GET_USER_ACCOUNT_DATA_SELECTOR = "0xbf92857c";

interface RpcResponse {
  result?: string;
  error?: { message: string };
}

export const rpc = sharedRpc;

/** Same JSON-RPC call against an arbitrary endpoint (per-position networks). */
export async function rpcAt<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  if (!resp.ok) throw new Error(`RPC ${resp.status} from ${url}`);
  const json = (await resp.json()) as RpcResponse;
  if (json.error) throw new Error(json.error.message);
  return json.result as T;
}

export interface PositionData {
  healthFactor: bigint;
  totalCollateralUSD: bigint;
  totalDebtUSD: bigint;
  availableBorrowsUSD: bigint;
  blockNumber: bigint;
}

/** Read the Aave position via Pool.getUserAccountData — same call the workflow
 *  uses. Pool and RPC are per-position (multi-network); defaults to the fork. */
export async function fetchPosition(
  borrower: string = LAX_CONFIG.BORROWER_ADDRESS,
  pool: string = LAX_CONFIG.AAVE_POOL,
  rpcUrl: string = LAX_CONFIG.FORK_RPC,
): Promise<PositionData | null> {
  try {
    const blockNum = await rpc<string>("eth_blockNumber", []);
    const padded = borrower.slice(2).padStart(64, "0");
    const raw = await rpcAt<string>(
      rpcUrl,
      "eth_call",
      [{ to: pool, data: `${GET_USER_ACCOUNT_DATA_SELECTOR}${padded}` }, "latest"],
    );
    if (!raw || raw === "0x") return null;
    const data = raw.slice(2);
    const word = (i: number) => BigInt(`0x${data.slice(i * 64, (i + 1) * 64)}`);
    return {
      totalCollateralUSD: word(0),
      totalDebtUSD: word(1),
      availableBorrowsUSD: word(2),
      healthFactor: word(5),
      blockNumber: BigInt(blockNum),
    };
  } catch {
    return null;
  }
}

// --- persisted guardian state (~/.lax/state.json) ---
// Shared with the daemon (src/autopilot/state.ts): same file, same log. The
// CLI merges its guardian fields into the existing state instead of rewriting
// the file, so `lax arm` cannot clobber daemon fields (lastFiredBy, spend).
import { LAX_CONFIG as CFG } from "./lax-config";
import {
  loadState as loadDaemonState,
  saveState as saveDaemonState,
  appendMitigation,
  readMitigations as readPersistedMitigations,
  mitigationLogPath as sharedLogPath,
  type MitigationRecord,
} from "../autopilot/state";

let guardianState: GuardianState = loadDaemonState(CFG.HF_TRIGGER, CFG.HF_TARGET).guardian;

function persistState(): void {
  const merged = loadDaemonState(CFG.HF_TRIGGER, CFG.HF_TARGET);
  merged.guardian = { ...merged.guardian, ...guardianState };
  saveDaemonState(merged);
}

export function appendMitigationLog(entry: Record<string, unknown>): void {
  appendMitigation(entry as unknown as MitigationRecord);
}

export function mitigationLogPath(): string {
  return sharedLogPath();
}


// --- fire-time exact repay (V2 fix #2) + gate (fix #1) ---
// Computes the exact repay amount at trigger time so the workflow's static
// amount is always fresh (platform limitation: dynamic {{...}} refs rejected).
// Every fire passes the mitigation gate first — same pipeline as the daemon.
export async function fireMitigationWebhook(reason: string): Promise<{ executionId: string; repayUsdc: bigint; hfAtTrigger: number; gate: string } | { error: string }> {
  const pos = await fetchPosition();
  if (!pos) return { error: "position read failed at trigger time" };
  if (pos.totalDebtUSD === 0n) return { error: "no debt to repay" };

  // exact amount for HF target, +1% buffer (same math as the daemon)
  const hfTarget18 = hfToBigint(LAX_CONFIG.HF_TARGET);
  const exact = computeRepayAmount(pos.totalDebtUSD, pos.healthFactor, hfTarget18);
  const repayUsdc = (exact * 101n) / 100n;
  if (repayUsdc === 0n) return { error: "computed repay amount is zero" };

  const gate = runMitigationGate({
    totalDebtBase: pos.totalDebtUSD,
    currentHf: pos.healthFactor,
    targetHf: hfTarget18,
    repayAmount: repayUsdc,
    borrowerAddress: LAX_CONFIG.BORROWER_ADDRESS,
    poolAddress: LAX_CONFIG.AAVE_POOL,
    repayToken: LAX_CONFIG.USDC,
    rpcUrl: LAX_CONFIG.FORK_RPC,
  });
  if (!gate.approved) {
    appendMitigationLog({ kind: "gate-blocked", reason, repayUsdc: repayUsdc.toString(), repayHuman: usdcToString(repayUsdc), gateSummary: gate.summary, stagesDetail: gate.stages });
    sendAlertAsync({ event: "gate-blocked", hf: Number(pos.healthFactor) / 1e18, repayHuman: usdcToString(repayUsdc), detail: gate.summary });
    return { error: `mitigation gate blocked the fire (${gate.summary}) — nothing was executed` };
  }

  let fire;
  try {
    fire = await fireWorkflowWebhook({
      reason,
      borrower: LAX_CONFIG.BORROWER_ADDRESS,
      repayAmount: repayUsdc.toString(),
      repayAmountHuman: usdcToString(repayUsdc),
      hfAtTrigger: (Number(pos.healthFactor) / 1e18).toFixed(4),
      targetHf: LAX_CONFIG.HF_TARGET,
      triggeredAt: new Date().toISOString(),
    });
  } catch (err) {
    return { error: `webhook failed: ${(err as Error).message}` };
  }
  if (!fire.ok) return { error: `KeeperHub ${fire.status}: ${fire.raw.slice(0, 200)}` };

  addExecutionRecord({ id: fire.executionId, command: "autopilot-mitigate", timestamp: Date.now(), txHashes: [], status: "triggered" });
  appendMitigationLog({
    kind: "webhook-fired",
    reason,
    executionId: fire.executionId,
    repayUsdc: repayUsdc.toString(),
    repayHuman: usdcToString(repayUsdc),
    hfAtTrigger: (Number(pos.healthFactor) / 1e18).toFixed(4),
    workflowId: LAX_CONFIG.WORKFLOW_ID,
    stagesDetail: gate.stages,
  });
  sendAlertAsync({ event: "webhook-fired", hf: Number(pos.healthFactor) / 1e18, repayHuman: usdcToString(repayUsdc), executionId: fire.executionId });
  return { executionId: fire.executionId, repayUsdc, hfAtTrigger: Number(pos.healthFactor) / 1e18, gate: gate.summary };
}

// --- CommandContext factory ---
function print(level: string, message: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${level.toUpperCase()} ${message}`);
}

let latestPosition: PositionData | null = null;

/** Refresh the cached position served to command handlers. Call before each
 *  command execution (bin/lax.ts) or each daemon poll (autopilot). */
export async function refreshLatestPosition(borrower?: string): Promise<PositionData | null> {
  latestPosition = await fetchPosition(borrower);
  return latestPosition;
}

export function createNodeContext(): import("./types").CommandContext {
  return {
    rpc,
    position: () => latestPosition,
    config: LAX_CONFIG,
    appendLog: (level, message) => print(level, message),
    refreshPosition: async () => {
      await refreshLatestPosition();
    },
    setGuardianState: (state) => {
      guardianState = { ...guardianState, ...state };
      persistState();
    },
    getGuardianState: () => ({ ...guardianState }),
    setMockMode: (active) => {
      if (active) console.log("(mock mode not supported in standalone CLI — use the dashboard)");
    },
    getMockMode: () => false,
    clearLogs: () => {
      if (process.stdout.isTTY) console.clear();
    },
    engageProtection: () => {
      // Async fire is intentional: handlers are sync-blocking; the daemon path
      // uses fireMitigationWebhook() directly with full logging.
      void fireMitigationWebhook("cli-engage").then((r) => {
        if ("error" in r) print("error", `Engage failed: ${r.error}`);
        else print("info", `KeeperHub execution ${r.executionId} — ${LAX_CONFIG.KEEPERHUB_RUN_URL(r.executionId)}`);
      });
    },
    emit: (event: CliEvent) => {
      if (event.type === "log") {
        const p = event.payload as { level?: string; message?: string };
        if (p?.message) print(p.level ?? "info", p.message);
      }
    },
    getSnapshot: () => undefined,
    addSnapshot: (_snap: Snapshot) => undefined,
    listSnapshots: () => [],
    addExecutionRecord: (rec) => addExecutionRecord(rec),
    getExecutionRecords: () => [],
    readMitigations: (limit?: number) => readPersistedMitigations(limit),
    mitigationLogPath: () => sharedLogPath(),
  };
}

export { cliDispatcher };
