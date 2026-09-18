import type { CommandContext, ParsedArgs, CommandResult } from "../types";
import { resetSession } from "../session";
import { getSession } from "../session";
import { handleHelp, handleMan, handleAliases } from "./help";
import { LAX_CONFIG, APP_NAME } from "../lax-config";
import { CLI_ENV } from "../env";

export async function handleVersion(_ctx: CommandContext): Promise<CommandResult> {
  return { output: `${APP_NAME} v2.0.0 — Liquidation Autopilot` };
}

export async function handleClear(ctx: CommandContext): Promise<CommandResult> {
  ctx.clearLogs();
  ctx.emit({ type: "clear", payload: null });
  return { output: "" };
}

export async function handleReset(ctx: CommandContext): Promise<CommandResult> {
  resetSession();
  ctx.clearLogs();
  ctx.emit({ type: "clear", payload: null });
  ctx.setGuardianState({ enabled: false, blocked: false, threshold: 1.05, target: 1.1 });
  return { output: "Session reset — logs cleared, guardian disarmed" };
}

function humanizeRpcError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes("fetch failed") || lower.includes("failed to fetch") || lower.includes("econnrefused") || lower.includes("connection refused") || lower.includes("timeout")) {
    return `RPC unreachable — is the fork running? Try ./scripts/start-fork.sh (${raw})`;
  }
  return raw;
}

export async function handleConnect(ctx: CommandContext): Promise<CommandResult> {
  try {
    const blockNum = await ctx.rpc<string>("eth_blockNumber", []);
    const block = parseInt(blockNum, 16);
    const chainIdRaw = await ctx.rpc<string>("eth_chainId", []);
    const chainId = parseInt(chainIdRaw, 16);
    return { output: `RPC connected (${ctx.config.FORK_RPC})\nBlock: #${block}\nChain ID: ${chainId}` };
  } catch (err) {
    const msg = humanizeRpcError(err);
    return { output: `RPC connection failed: ${msg}`, error: "execution-failed" as const };
  }
}

export async function handleReconnect(ctx: CommandContext): Promise<CommandResult> {
  return handleConnect(ctx);
}

export async function handleRpc(_ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const url = args.positional[0] ?? "";
  if (!url) return { output: `Current RPC: ${CLI_ENV.LAX_FORK_RPC ?? LAX_CONFIG.FORK_RPC}`, error: "Missing argument" };
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("invalid protocol");
    if (!parsed.host) throw new Error("missing host");
  } catch {
    return { output: `lax rpc: invalid URL (got "${url}")`, error: "Invalid argument" };
  }
  return { output: `RPC URL changed to: ${url}\n(Note: requires restart to take effect in poller)` };
}

export async function handleTheme(_ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const name = args.positional[0] ?? "dark";
  const valid = ["dark", "light", "matrix"];
  if (!valid.includes(name)) return { output: `Invalid theme: ${name}. Use: ${valid.join(", ")}`, error: "Invalid argument" };
  return { output: `Theme set to "${name}"` };
}

export async function handleUptime(_ctx: CommandContext): Promise<CommandResult> {
  const session = getSession();
  const elapsed = Date.now() - session.startTime;
  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);
  return { output: `${APP_NAME} running for ${mins}m ${secs}s\nCommands executed: ${session.commandCount}` };
}

export async function handleWhoami(ctx: CommandContext): Promise<CommandResult> {
  return { output: `Borrower: ${ctx.config.BORROWER_ADDRESS}\nWallet: ${ctx.config.WALLET_ADDRESS}` };
}

export async function handleDebug(_ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const val = args.positional[0] ?? "toggle";
  const on = val === "on" ? true : val === "off" ? false : null;
  return { output: `Debug mode: ${on === true ? "ON" : on === false ? "OFF" : "toggle"}` };
}

export async function handlePing(ctx: CommandContext): Promise<CommandResult> {
  const start = performance.now();
  try {
    await ctx.rpc<string>("eth_blockNumber", []);
    const ms = (performance.now() - start).toFixed(1);
    return { output: `pong (${ms}ms)` };
  } catch (err) {
    const msg = humanizeRpcError(err);
    return { output: `ping failed: ${msg}`, error: "execution-failed" as const };
  }
}

export async function handleEcho(_ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  return { output: args.positional.join(" ") || "" };
}

export async function handleGuide(_ctx: CommandContext): Promise<CommandResult> {
  return {
    output: [
      `=== ${APP_NAME} Demo Walkthrough ===`,
      "",
      "1. lax status              — check system health",
      "2. lax hf                  — view health factor",
      "3. lax oracle              — check WETH/USDC prices",
      "4. lax shock weth -50%    — simulate price crash",
      "5. lax hf                  — verify HF dropped",
      "6. lax guardian on         — enable autopilot",
      "7. lax engage              — trigger protection",
      "8. lax audit               — review audit trail",
      "9. lax compare snap-001    — before/after comparison",
      "",
      "Full command list: lax help",
    ].join("\n"),
  };
}

const systemAliases: Record<string, (ctx: CommandContext, args: ParsedArgs) => Promise<CommandResult>> = {
  help: handleHelp,
  "?": handleHelp,
  man: handleMan,
  version: handleVersion,
  v: handleVersion,
  "--version": handleVersion,
  clear: handleClear,
  cls: handleClear,
  reset: handleReset,
  connect: handleConnect,
  reconnect: handleReconnect,
  rpc: handleRpc,
  theme: handleTheme,
  uptime: handleUptime,
  whoami: handleWhoami,
  debug: handleDebug,
  ping: handlePing,
  echo: handleEcho,
  guide: handleGuide,
  tutorial: handleGuide,
  walkthrough: handleGuide,
  aliases: handleAliases,
  alias: handleAliases,
};

export const handleSystem = systemAliases;
