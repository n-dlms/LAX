import type { CommandContext, CommandResult } from "./types";
import { findCommand, fuzzyFind } from "./registry";
import { parseInput } from "./parser";
import { pushHistory, resetHistoryIndex } from "./history";
import { incrementCommandCount } from "./session";
import { cliDispatcher } from "./dispatcher";

// No debounce — every command executes immediately (P2 paper cut: 500ms lag)
let pendingConfirm: { name: string; parsed: ReturnType<typeof parseInput>; raw: string; timestamp: number } | null = null;
const PENDING_TTL_MS = 60_000;

function isConfirmationRaw(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  return t === "y" || t === "yes" || t === "confirm" || t === "lax y" || t === "lax yes" || t === "lax confirm";
}

function hasConfirmFlag(parsed: NonNullable<ReturnType<typeof parseInput>>): boolean {
  return parsed.args.flags["confirm"] === "true" || parsed.args.flags["y"] === "true" || parsed.args.flags["yes"] === "true" || parsed.args.flags["c"] === "true";
}

function humanizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes("nan") && lower.includes("bigint")) {
    return `amount must be a number`;
  }
  if (lower.includes("infinity") && lower.includes("bigint")) {
    return `amount is too large or not finite`;
  }
  if (lower.includes("fetch failed") || lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("load failed")) {
    return `RPC unreachable — is the fork running? Try ./scripts/start-fork.sh`;
  }
  if (lower.includes("connection refused") || lower.includes("econnrefused")) {
    return `RPC unreachable — is the fork running? Try ./scripts/start-fork.sh`;
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return `RPC timed out — is the fork running? Try ./scripts/start-fork.sh`;
  }
  // Strip leading "Error: " etc.
  if (raw.startsWith("Error: ")) return raw.slice(7);
  return raw;
}

function normalizeDoubleLax(raw: string): string {
  const trimmed = raw.trim();
  // lax lax help repay -> lax help repay
  if (/^lax\s+lax(\s+|$)/i.test(trimmed)) {
    return trimmed.replace(/^lax\s+lax(\s+|$)/i, "lax$1");
  }
  return raw;
}

export async function execute(raw: string): Promise<CommandResult> {
  resetHistoryIndex();

  if (!raw.trim()) return { output: "" };

  // Handle pending confirmation — y / yes / confirm
  if (pendingConfirm && isConfirmationRaw(raw)) {
    const pending = pendingConfirm;
    pendingConfirm = null;
    if (Date.now() - pending.timestamp > PENDING_TTL_MS) {
      return { output: `Confirmation expired for "${pending.name}". Run the command again to retry.`, error: "timeout" };
    }
    // Re-execute pending command as if confirmed
    const cmd = findCommand(pending.parsed!.name);
    if (!cmd || !cmd.handler) {
      return { output: `lax ${pending.name}: handler not implemented`, error: "internal-error" };
    }
    try {
      const result = await cmd.handler(createContext(), pending.parsed!.args);
      const duration = 0;
      pushHistory(pending.raw, pending.parsed, result, duration);
      incrementCommandCount();
      if (result.eventLogEntry) cliDispatcher.log(result.eventLogEntry.level, result.eventLogEntry.message);
      if (result.shouldUpdatePosition) cliDispatcher.dispatch({ type: "position-update", payload: null });
      return result;
    } catch (err) {
      const message = humanizeError(err);
      const result = { output: `lax ${cmd.name}: ${message}`, error: "execution-failed" as const };
      pushHistory(pending.raw, pending.parsed, result, 0);
      cliDispatcher.error(message);
      return result;
    }
  }

  // Clear stale pending if user moved on to a different command
  if (pendingConfirm && raw.trim().toLowerCase() !== pendingConfirm.raw.trim().toLowerCase() && !isConfirmationRaw(raw)) {
    // If new command is not the same pending, expire pending after timeout or immediately clear on new command
    if (Date.now() - pendingConfirm.timestamp > PENDING_TTL_MS) pendingConfirm = null;
    else {
      // Keep pending only if new command is unrelated — clear to avoid confusion after 1 new command
      // But don't clear if user is just typing help etc — we clear on any non-confirmation new command
      // To avoid surprise, clear pending
      pendingConfirm = null;
    }
  }

  const normalizedRaw = normalizeDoubleLax(raw);
  const start = performance.now();
  const parsed = parseInput(normalizedRaw);

  if (!parsed) {
    pushHistory(raw, null, null, 0);
    return { output: `lax: unrecognized input. Type "lax help" to see commands.`, error: "command-not-found" };
  }

  const cmd = findCommand(parsed.name);

  if (!cmd) {
    const suggestions = fuzzyFind(parsed.name);
    let output = `lax: command not found: "${parsed.name}"`;
    if (suggestions.length > 0) {
      output += `\nDid you mean:`;
      for (const s of suggestions) {
        output += `\n  ${s.syntax.padEnd(30)} ${s.description}`;
      }
    }
    const duration = performance.now() - start;
    pushHistory(raw, parsed, { output, error: "command-not-found" }, Math.round(duration));
    return { output, error: "command-not-found" };
  }

  const requiredCount = countRequiredArgs(cmd.syntax);
  if (parsed.args.positional.length < requiredCount) {
    const duration = performance.now() - start;
    const result = { output: `lax ${cmd.name}: missing required argument(s).\nUsage: ${cmd.syntax}`, error: "missing-arg" as const };
    pushHistory(raw, parsed, result, Math.round(duration));
    return result;
  }

  // Pre-validate onchain amounts before asking for confirmation — show error immediately
  const preError = preValidate(cmd, parsed);
  if (preError) {
    const duration = performance.now() - start;
    const result = { output: preError, error: "Invalid argument" as const };
    pushHistory(raw, parsed, result, Math.round(duration));
    return result;
  }

  // Enforce confirmRequired — intercept before handler
  if (cmd.confirmRequired && !hasConfirmFlag(parsed)) {
    pendingConfirm = { name: cmd.name, parsed, raw, timestamp: Date.now() };
    const stakes = getStakes(cmd.name);
    const output = [
      `lax ${cmd.name}: confirmation required.`,
      stakes ? `This will: ${stakes}` : `This action moves funds or changes state.`,
      `Reply with "y" or re-run as "lax ${cmd.name} --confirm" to proceed.`,
    ].join("\n");
    const duration = performance.now() - start;
    pushHistory(raw, parsed, { output, error: "needs-confirmation" as const }, Math.round(duration));
    return { output, error: "needs-confirmation" as const };
  }

  // If confirm flag was supplied, strip it before handler sees it (handler shouldn't see --confirm as positional)
  // Flags already parsed, handler will ignore extra flag.

  const handler = cmd.handler;
  if (!handler) {
    return { output: `lax ${cmd.name}: handler not implemented`, error: "internal-error" };
  }

  try {
    const result = await handler(createContext(), parsed.args);

    const duration = performance.now() - start;
    pushHistory(raw, parsed, result, Math.round(duration));
    incrementCommandCount();

    if (result.eventLogEntry) {
      cliDispatcher.log(result.eventLogEntry.level, result.eventLogEntry.message);
    }
    if (result.shouldUpdatePosition) {
      cliDispatcher.dispatch({ type: "position-update", payload: null });
    }

    // Clear pending on success
    if (pendingConfirm && pendingConfirm.name === cmd.name) pendingConfirm = null;

    return result;
  } catch (err) {
    const duration = performance.now() - start;
    const message = humanizeError(err);
    const result = { output: `lax ${cmd.name}: ${message}`, error: "execution-failed" as const };
    pushHistory(raw, parsed, result, Math.round(duration));
    cliDispatcher.error(message);
    return result;
  }
}

function getStakes(name: string): string | null {
  switch (name) {
    case "repay": return "repay debt on-chain";
    case "approve": return "approve token spend";
    case "supply": return "supply collateral to Aave";
    case "withdraw": return "withdraw collateral from Aave";
    case "swap": return "swap tokens";
    case "rebalance": return "rebalance position";
    case "boost": return "supply additional collateral";
    case "paydown": return "repay debt";
    case "transfer": return "transfer tokens";
    case "engage": return "trigger protection now (repay)";
    case "panic": return "crash WETH -90% instantly";
    case "shock": return "change oracle price";
    case "simulate-hf": return "manipulate oracle to target HF";
    case "scenario": return "run stress scenario";
    case "crash": return "multi-step crash";
    case "flash-crash": return "multi-step crash";
    case "guardian-off": return "disable auto-protection";
    case "reset": return "reset dashboard state (logs, cache)";
    default: return null;
  }
}

function preValidate(cmd: { name: string }, parsed: { args: { positional: string[] } }): string | null {
  const name = cmd.name;
  const pos = parsed.args.positional;
  const getAmountError = (raw: string, prefix: string): string | null => {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) return `${prefix}: amount must be a number (got "${raw}")`;
    if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) return `${prefix}: amount must be a number (got "${raw}")`;
    const num = parseFloat(trimmed);
    if (isNaN(num)) return `${prefix}: amount must be a number (got "${raw}")`;
    if (!isFinite(num)) return `${prefix}: amount is too large or not finite (got "${raw}")`;
    if (num <= 0) return `${prefix}: amount must be positive (got "${raw}")`;
    return null;
  };
  // onchain amount validation before confirmation
  if (name === "repay" || name === "paydown" || name === "boost") {
    const err = getAmountError(pos[0] ?? "", `lax ${name}`);
    if (err) return err;
  }
  if (name === "approve" || name === "supply" || name === "withdraw") {
    const err = getAmountError(pos[1] ?? "", `lax ${name}`);
    if (err) return err;
  }
  if (name === "swap") {
    const err = getAmountError(pos[1] ?? "", `lax swap`);
    if (err) return err;
  }
  if (name === "transfer") {
    const err = getAmountError(pos[1] ?? "", `lax transfer`);
    if (err) return err;
    const to = pos[2] ?? "";
    if (!to || !/^0x[0-9a-fA-F]{40}$/.test(to)) return `lax transfer: invalid address (got "${to}")`;
  }
  return null;
}

function countRequiredArgs(syntax: string): number {
  const matches = syntax.match(/<\w+(?:\s+\w+)*>/g);
  return matches ? matches.length : 0;
}

let ctxRef: CommandContext | null = null;

export function setCommandContext(ctx: CommandContext): void {
  ctxRef = ctx;
}

function createContext(): CommandContext {
  if (!ctxRef) throw new Error("CommandContext not set — call setCommandContext first");
  return ctxRef;
}
