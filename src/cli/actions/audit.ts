import type { CommandContext, ParsedArgs, CommandResult } from "../types";
import { LAX_CONFIG } from "../lax-config";
import { getHistory } from "../history";
import { getSession, getExecutionRecords, listSnapshots, getSnapshot } from "../session";
import { MITIGATION_KIND_LABEL, type MitigationRecord } from "../../mitigation-record";

const KIND_LABEL = MITIGATION_KIND_LABEL;

function fmtRepay(rec: MitigationRecord): string {
  if (rec.repayHuman) return rec.repayHuman;
  if (rec.repayUsdc) return `${(Number(rec.repayUsdc) / 1e6).toFixed(2)} USDC`;
  return "—";
}

function fmtTime(ts?: number): string {
  return ts ? new Date(ts).toLocaleTimeString("en-GB") : "—";
}

/** Mitigation records from the context (persisted log on node, session in browser). */
function mitigationRecords(ctx: CommandContext, limit: number): MitigationRecord[] {
  if (ctx.readMitigations) return ctx.readMitigations(limit);
  // Browser fallback: session-local executions rendered as records
  return getExecutionRecords().map((e) => ({
    ts: e.timestamp,
    kind: "webhook-fired" as const,
    executionId: e.id,
    reason: e.command,
  }));
}

function logPathLabel(ctx: CommandContext): string {
  return ctx.mitigationLogPath?.() ?? "(session records)";
}

export async function handleRuns(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const isJson = args.flags["json"] !== undefined;
  const limit = parseInt(args.flags["limit"] ?? "15");
  const usingPersistedLog = Boolean(ctx.readMitigations);
  const mitigations = mitigationRecords(ctx, Math.max(limit, 1));
  const sessionExecs = getExecutionRecords();

  if (isJson) {
    return {
      output: JSON.stringify(
        { mitigationLog: logPathLabel(ctx), mitigations: mitigationRecords(ctx, 1000), sessionExecutions: sessionExecs },
        null,
        2,
      ),
    };
  }

  if (mitigations.length === 0 && sessionExecs.length === 0) {
    return { output: `No mitigations recorded yet (log: ${logPathLabel(ctx)}) and no KeeperHub executions this session` };
  }

  const lines: string[] = [`Mitigation log — ${logPathLabel(ctx)}`, "─".repeat(72)];
  if (mitigations.length === 0) {
    lines.push("  (empty — the daemon appends here on every trigger, gate decision, and fire)");
  }
  for (const rec of mitigations) {
    const label = (KIND_LABEL[rec.kind] ?? rec.kind).padEnd(12);
    const parts = [`  ${fmtTime(rec.ts)}  ${label}`];
    if (rec.hf !== undefined) parts.push(`HF ${rec.hf.toFixed(4)}`);
    if (rec.kind !== "shutdown") parts.push(`repay ${fmtRepay(rec)}`);
    if (rec.position) parts.push(`${rec.position}@${rec.network ?? "?"}`);
    if (rec.executionId) parts.push(`exec ${rec.executionId.slice(0, 14)}…`);
    if (rec.kind === "gate-blocked" && rec.stages) parts.push(`stages [${rec.stages}]`);
    else if (rec.kind === "gate-blocked" && rec.reason) parts.push(rec.reason);
    lines.push(parts.join("  "));
    if (rec.executionId) lines.push(`${" ".repeat(26)}${LAX_CONFIG.KEEPERHUB_RUN_URL(rec.executionId)}`);
  }

  if (sessionExecs.length > 0 && usingPersistedLog) {
    lines.push("", `KeeperHub executions (this session):`);
    for (const e of sessionExecs.slice(-limit)) {
      lines.push(`  ${new Date(e.timestamp).toLocaleTimeString()}  ${e.command.padEnd(12)}  ${e.id.slice(0, 16)}…  ${e.status}`);
    }
  }
  return { output: lines.join("\n") };
}

export async function handleExplain(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const key = args.positional[0] ?? "";
  if (!key) return { output: "Usage: lax explain <execution-id | runs-index>", error: "Missing argument" };
  const all = mitigationRecords(ctx, 1000);

  let rec: MitigationRecord | undefined;
  if (/^\d+$/.test(key)) {
    // 1-based from the most recent entry (matches the order `lax runs` prints)
    rec = all[all.length - parseInt(key)];
  } else {
    rec = [...all].reverse().find((r) => r.executionId === key || key.startsWith(r.executionId ?? "\u0000"));
  }
  if (!rec) {
    return { output: `No mitigation record matches "${key}" — try lax runs, then explain by index`, error: "Not found" };
  }

  const lines: string[] = [
    `Mitigation record — ${KIND_LABEL[rec.kind] ?? rec.kind} at ${new Date(rec.ts ?? Date.now()).toLocaleString("en-GB")}`,
    "─".repeat(72),
  ];
  if (rec.position) lines.push(`  position:  ${rec.position}@${rec.network ?? "?"}`);
  if (rec.hf !== undefined) lines.push(`  HF at decision: ${rec.hf.toFixed(4)}`);
  if (rec.kind !== "shutdown") lines.push(`  repay amount:   ${fmtRepay(rec)}`);
  if (rec.executionId) lines.push(`  execution:      ${rec.executionId}`, `  audit trail:    ${LAX_CONFIG.KEEPERHUB_RUN_URL(rec.executionId)}`);
  if (rec.reason) lines.push(`  reason:         ${rec.reason}`);

  if (rec.stagesDetail && rec.stagesDetail.length > 0) {
    lines.push("", "  Gate stages:");
    for (const st of rec.stagesDetail) {
      lines.push(`    ${st.passed ? "✓" : "✗"} ${st.name} — ${st.detail}`);
    }
    const failed = rec.stagesDetail.filter((st) => !st.passed);
    lines.push("", failed.length === 0
      ? "  Verdict: all stages passed — fire was authorized."
      : `  Verdict: blocked at ${failed.map((f) => f.name).join(", ")} — nothing touched the chain.`);
  } else if (rec.stages) {
    lines.push("", `  Gate stages (compact): ${rec.stages}`);
  } else if (rec.kind === "trigger") {
    lines.push("", "  Trigger record — the gate decision follows in the next entries.");
  }
  return { output: lines.join("\n") };
}

export async function handleRun(_ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const id = args.positional[0] ?? "";
  if (!id) return { output: "Usage: lax run <id>", error: "Missing argument" };
  const executions = getExecutionRecords();
  const exec = executions.find((e) => e.id === id);
  if (!exec) return { output: `Execution not found: ${id}`, error: "Not found" };
  return {
    output: [
      `Execution: ${exec.id}`,
      `Command: ${exec.command}`,
      `Time: ${new Date(exec.timestamp).toLocaleTimeString()}`,
      `Status: ${exec.status}`,
      ...(exec.txHashes.length > 0 ? [`Tx hashes: ${exec.txHashes.map((t) => `${t.slice(0, 10)}...${t.slice(-6)}`).join(", ")}`] : []),
    ].join("\n"),
  };
}

function humanizeRpcErrorAudit(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes("fetch failed") || lower.includes("failed to fetch") || lower.includes("econnrefused") || lower.includes("connection refused") || lower.includes("timeout")) {
    return `RPC unreachable — is the fork running? Try ./scripts/start-fork.sh (${raw})`;
  }
  return raw;
}

export async function handleTx(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const hash = args.positional[0] ?? "";
  if (!hash) return { output: "Usage: lax tx <hash>", error: "Missing argument" };
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    return { output: `lax tx: invalid hash (got "${hash}")`, error: "Invalid argument" };
  }
  try {
    const receipt = await ctx.rpc<{
      blockNumber: string; status: string; gasUsed: string; transactionHash: string;
    }>("eth_getTransactionReceipt", [hash]);
    if (!receipt) return { output: `Transaction not found: ${hash}`, error: "Not found" };
    const blockNum = parseInt(receipt.blockNumber, 16);
    const status = receipt.status === "0x1" ? "Success" : "Failed";
    const gasUsed = parseInt(receipt.gasUsed, 16);
    return {
      output: [
        `Tx: ${receipt.transactionHash.slice(0, 10)}...${receipt.transactionHash.slice(-6)}`,
        `Block: #${blockNum}`,
        `Status: ${status}`,
        `Gas: ${gasUsed.toLocaleString()}`,
        `Explorer: ${LAX_CONFIG.TX_EXPLORER_URL(receipt.transactionHash)}`,
      ].join("\n"),
    };
  } catch (err) {
    const msg = humanizeRpcErrorAudit(err);
    return { output: `Tx lookup failed: ${msg}`, error: "execution-failed" as const };
  }
}

export async function handleHistory(_ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const limit = parseInt(args.flags["limit"] ?? "20");
  const entries = getHistory().slice(-limit);
  if (entries.length === 0) return { output: "No commands executed this session" };
  const lines = entries.map((e, i) =>
    `#${(entries.length - i).toString().padStart(3)}  ${e.success ? "✓" : "✗"}  ${e.duration}ms  ${e.raw}`
  );
  return { output: ["Command History:", "─".repeat(60), ...lines].join("\n") };
}

export async function handleAuditCmd(_ctx: CommandContext): Promise<CommandResult> {
  const session = getSession();
  const history = getHistory();
  const executions = getExecutionRecords();
  return {
    output: [
      "=== LAX Audit Trail ===",
      `Session started: ${new Date(session.startTime).toISOString()}`,
      `Commands executed: ${session.commandCount}`,
      `KeeperHub executions: ${executions.length}`,
      `History entries: ${history.length}`,
      "",
      "Last 5 commands:",
      ...history.slice(-5).map((h) => `  ${h.raw} (${h.success ? "OK" : "FAIL"} ${h.duration}ms)`),
      "",
      executions.length > 0 ? "Executions:" : "",
      ...executions.slice(-5).map((e) => `  ${e.id.slice(0, 16)}... ${e.command} ${e.status}`),
    ].join("\n"),
  };
}

export async function handleTail(_ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const limit = parseInt(args.flags["lines"] ?? "20");
  const entries = getHistory().slice(-limit);
  if (entries.length === 0) return { output: "No recent events" };
  return {
    output: entries.map((e) => `${e.raw} (${e.success ? "OK" : "FAIL"})`).join("\n"),
  };
}

export async function handleExport(_ctx: CommandContext): Promise<CommandResult> {
  const session = getSession();
  const history = getHistory();
  const executions = getExecutionRecords();
  const snapshots = listSnapshots();
  const exportObj = {
    session: {
      startTime: session.startTime,
      commandCount: session.commandCount,
      guardianState: session.guardianState,
      mockMode: session.mockMode,
    },
    history: history.map((h) => ({
      raw: h.raw, timestamp: h.timestamp, duration: h.duration, success: h.success,
    })),
    executions,
    snapshots: snapshots.map((s) => ({
      id: s.id, timestamp: s.timestamp, label: s.label,
      hf: (Number(s.position.hf) / 1e18).toFixed(4),
      collateralUSD: (Number(s.position.totalCollateralUSD) / 1e8).toFixed(2),
      debtUSD: (Number(s.position.totalDebtUSD) / 1e8).toFixed(2),
    })),
  };
  return { output: JSON.stringify(exportObj, null, 2) };
}

export async function handleSnapshot(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const pos = ctx.position();
  if (!pos) return { output: "No position data", error: "Position unavailable" };
  const label = args.positional[0] ?? "";
  const sessionModule = await import("../session");
  const snapshots = listSnapshots();
  const id = `snap-${String(snapshots.length + 1).padStart(3, "0")}`;
  try {
    const oracleAddr = await ctx.rpc<string>("eth_call", [
      { to: ctx.config.POOL_ADDRESSES_PROVIDER, data: "0xfca513a8" }, "latest",
    ]);
    const address = `0x${oracleAddr.slice(-40)}`;
    const wethPadded = ctx.config.WETH.slice(2).padStart(64, "0");
    const wethRaw = await ctx.rpc<string>("eth_call", [
      { to: address, data: `0xb3596f07${wethPadded}` }, "latest",
    ]);
    const usdcPadded = ctx.config.USDC.slice(2).padStart(64, "0");
    const usdcRaw = await ctx.rpc<string>("eth_call", [
      { to: address, data: `0xb3596f07${usdcPadded}` }, "latest",
    ]);
    sessionModule.addSnapshot({
      id, timestamp: Date.now(), label,
      position: {
        hf: pos.healthFactor,
        totalCollateralUSD: pos.totalCollateralUSD,
        totalDebtUSD: pos.totalDebtUSD,
        availableBorrowsUSD: pos.totalCollateralUSD - pos.totalDebtUSD,
      },
      oracle: { wethPrice: BigInt(wethRaw), usdcPrice: BigInt(usdcRaw) },
      blockNumber: Number(pos.blockNumber),
    });
    return { output: `Snapshot saved: ${id}${label ? ` ("${label}")` : ""}` };
  } catch (err) {
    return { output: "Snapshot saved (partial)", error: String(err) };
  }
}

export async function handleCompare(_ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const id = args.positional[0] ?? "";
  const snap = getSnapshot(id);
  if (!snap) return { output: `Snapshot not found: ${id}`, error: "Not found" };
  const pos = _ctx.position();
  if (!pos) return { output: "No current position", error: "Position unavailable" };
  const hfOld = Number(snap.position.hf) / 1e18;
  const hfCurr = Number(pos.healthFactor) / 1e18;
  const collOld = Number(snap.position.totalCollateralUSD) / 1e8;
  const collCurr = Number(pos.totalCollateralUSD) / 1e8;
  const debtOld = Number(snap.position.totalDebtUSD) / 1e8;
  const debtCurr = Number(pos.totalDebtUSD) / 1e8;
  return {
    output: [
      `Difference from ${id}${snap.label ? ` ("${snap.label}")` : ""}:`,
      `  HF:    ${hfOld.toFixed(4)} → ${hfCurr.toFixed(4)}  (${(hfCurr - hfOld) >= 0 ? "+" : ""}${(hfCurr - hfOld).toFixed(4)})`,
      `  Coll:  $${collOld.toFixed(2)} → $${collCurr.toFixed(2)}  (${collCurr >= collOld ? "+" : ""}${(collCurr - collOld).toFixed(2)})`,
      `  Debt:  $${debtOld.toFixed(2)} → $${debtCurr.toFixed(2)}  (${debtCurr >= debtOld ? "+" : ""}${(debtCurr - debtOld).toFixed(2)})`,
    ].join("\n"),
  };
}

export async function handleSnapshots(_ctx: CommandContext): Promise<CommandResult> {
  const snaps = listSnapshots();
  if (snaps.length === 0) return { output: "No snapshots" };
  const lines = snaps.map((s) => {
    const hf = Number(s.position.hf) / 1e18;
    return `${s.id.padEnd(10)}  ${s.label ?? "(no label)".padEnd(20)}  HF ${hf.toFixed(4)}  Block #${s.blockNumber}`;
  });
  return { output: ["Snapshots:", "─".repeat(60), ...lines].join("\n") };
}

export const auditAliases: Record<string, (ctx: CommandContext, args: ParsedArgs) => Promise<CommandResult>> = {
  runs: handleRuns,
  run: handleRun,
  explain: handleExplain,
  tx: handleTx,
  transaction: handleTx,
  history: handleHistory,
  hist: handleHistory,
  audit: handleAuditCmd,
  tail: handleTail,
  export: handleExport,
  dump: handleExport,
  snapshot: handleSnapshot,
  snap: handleSnapshot,
  compare: handleCompare,
  diff: handleCompare,
  snapshots: handleSnapshots,
  snaps: handleSnapshots,
  "snap-list": handleSnapshots,
};

export const handleAudit = auditAliases;
