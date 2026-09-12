import type { CommandDefinition, CommandContext, ParsedArgs, CommandResult } from "./types";
import { handleRpcCall } from "./actions/rpc";
import { handleMock } from "./actions/mock";
import { handleGuardian } from "./actions/guardian";
import { handleOnchain } from "./actions/onchain";
import { handleAudit } from "./actions/audit";
import { handleWhatif } from "./actions/whatif";
import { handleSystem } from "./actions/system";
import { handleHelp, handleMan, handleAliases } from "./actions/help";

type Handler = (ctx: CommandContext, args: ParsedArgs) => Promise<CommandResult>;

const handlers: Record<string, Handler> = {};

function reg(handlersMap: Record<string, Handler>): void {
  Object.assign(handlers, handlersMap);
}

reg(handleRpcCall);
reg(handleMock);
reg(handleGuardian);
reg(handleOnchain);
reg(handleAudit);
reg({ whatif: handleWhatif });
reg(handleSystem);
handlers["help"] = handleHelp;
handlers["?"] = handleHelp;
handlers["man"] = handleMan;
handlers["aliases"] = handleAliases;
handlers["alias"] = handleAliases;

// Commands that need Node APIs (local fork, persisted state) register through
// src/cli/node-commands.ts at binary startup — the browser dashboard shares
// this registry without pulling node:fs/node:child_process into its bundle.
export function registerNodeHandler(name: string, handler: Handler): void {
  handlers[name] = handler;
}

function def(name: string, syntax: string, description: string, category: CommandDefinition["category"], routing: CommandDefinition["routing"], opts?: {
  fallback?: CommandDefinition["fallback"];
  confirmRequired?: boolean;
  examples?: string[];
  aliases?: string[];
  handlerName?: string;
}): CommandDefinition {
  return {
    name,
    syntax,
    description,
    category,
    routing,
    fallback: opts?.fallback,
    confirmRequired: opts?.confirmRequired,
    examples: opts?.examples,
    aliases: opts?.aliases,
    handler: handlers[opts?.handlerName ?? name]!,
  };
}

export const COMMANDS: Record<string, CommandDefinition> = {};

function add(cmd: CommandDefinition): void {
  COMMANDS[cmd.name] = cmd;
  for (const alias of cmd.aliases ?? []) {
    COMMANDS[alias] = cmd;
  }
}

/** Register a Node-only command (handler + definition) from src/cli/node-commands.ts. */
export function registerNodeCommand(cmd: CommandDefinition): void {
  add(cmd);
}

/** Build a CommandDefinition — exposed for node-commands.ts registration. */
export function buildDef(name: string, syntax: string, description: string, category: CommandDefinition["category"], routing: CommandDefinition["routing"], opts?: {
  fallback?: CommandDefinition["fallback"];
  confirmRequired?: boolean;
  examples?: string[];
  aliases?: string[];
}): CommandDefinition {
  return {
    name,
    syntax,
    description,
    category,
    routing,
    fallback: opts?.fallback,
    confirmRequired: opts?.confirmRequired,
    examples: opts?.examples,
    aliases: opts?.aliases,
    handler: handlers[name]!,
  };
}

// ── Monitor ──
add(def("status", "lax status", "Overall system status (HF, block, oracle, connection)", "monitor", "rpc-read", {
  aliases: ["st"],
}));
add(def("hf", "lax hf", "Current health factor", "monitor", "rpc-read", {
  aliases: ["health", "health-factor"],
}));
add(def("position", "lax position", "Full position breakdown (collateral, debt, HF)", "monitor", "rpc-read", {
  aliases: ["pos", "portfolio"],
}));
add(def("debt", "lax debt [token]", "Debt details (amount, USD value)", "monitor", "rpc-read", {
  examples: ["lax debt", "lax debt USDC"],
}));
add(def("whatif", "lax whatif [--shock PCT] [--lt LT] [--json]", "What-if: collateral drops PCT% — shocked HF and defense cost", "monitor", "rpc-read", {
  examples: ["lax whatif", "lax whatif --shock 30", "lax whatif --shock 10 --lt 0.85", "lax whatif --json"],
}));
add(def("collateral", "lax collateral [token]", "Collateral details (supplied, deposited)", "monitor", "rpc-read", {
  aliases: ["coll"],
  examples: ["lax collateral", "lax collateral WETH"],
}));
add(def("oracle", "lax oracle [token]", "Oracle price for WETH or USDC", "monitor", "rpc-read", {
  examples: ["lax oracle", "lax oracle WETH"],
}));
add(def("block", "lax block", "Current fork block number and timestamp", "monitor", "rpc-read"));
add(def("pool", "lax pool", "Aave V3 pool address and config", "monitor", "rpc-read"));
add(def("config", "lax config", "Show LAX configuration parameters", "monitor", "rpc-read", {
  aliases: ["cfg"],
}));
add(def("keeper", "lax keeper", "KeeperHub connection status and key validity", "monitor", "rpc-read"));
add(def("reserves", "lax reserves", "List Aave V3 reserve status for all assets", "monitor", "rpc-read"));
add(def("liquidation-price", "lax liquidation-price", "Calculate price at which position gets liquidated", "monitor", "rpc-read", {
  aliases: ["liq-price", "liqprice"],
}));
add(def("ltv", "lax ltv", "Current loan-to-value ratio", "monitor", "rpc-read"));

// ── Mock & Stress ──
add(def("mock-start", "lax mock-start", "Enter simulation mode (overlay indicator shown)", "mock", "simulation", {
  aliases: ["mock-on"],
}));
add(def("mock-stop", "lax mock-stop", "Exit simulation mode, restore oracle prices", "mock", "simulation", {
  aliases: ["mock-off"],
}));
add(def("shock", "lax shock <token> <percent>", "Drop/raise asset price by percent", "mock", "simulation", {
  examples: ["lax shock weth -50%", "lax shock weth +25%", "lax shock usdc -10%"],
  confirmRequired: true,
}));
add(def("flash-crash", "lax crash weth <percent>", "Multi-step price crash over 3 seconds", "mock", "simulation", {
  aliases: ["crash"],
  examples: ["lax crash weth -70%"],
  confirmRequired: true,
}));
add(def("drip", "lax drip <token> <percent> [ticks]", "Slow price bleed per tick", "mock", "simulation", {
  examples: ["lax drip weth -1% 5"],
}));
add(def("recovery", "lax recovery <token> <percent>", "Gradual price recovery", "mock", "simulation", {
  examples: ["lax recovery weth +5%"],
}));
add(def("reset-price", "lax reset-price", "Reset oracle to default prices", "mock", "simulation", {
  aliases: ["reset-price"],
}));
add(def("simulate-hf", "lax simulate-hf <target>", "Manipulate oracle to achieve exact HF", "mock", "simulation", {
  aliases: ["sim-hf"],
  examples: ["lax simulate-hf 1.02"],
  confirmRequired: true,
}));
add(def("freeze-oracle", "lax freeze-oracle", "Freeze oracle at current price", "mock", "simulation", {
  aliases: ["freeze"],
}));
add(def("unfreeze-oracle", "lax unfreeze-oracle", "Unfreeze oracle (allow price changes)", "mock", "simulation", {
  aliases: ["unfreeze"],
}));
add(def("scenario", "lax scenario <name>", "Load predefined stress scenario", "mock", "simulation", {
  examples: ["lax scenario flash-crash-2022", "lax scenario slow-bleed"],
  confirmRequired: true,
}));
add(def("panic", "lax panic", "Emergency: crash WETH -90% instantly (demo wow moment)", "mock", "simulation", {
  confirmRequired: true,
}));

// ── Guardian / Autopilot ──
add(def("guardian-on", "lax guardian on", "Enable auto-protection monitoring", "guardian", "local-only", {
  aliases: ["guard-on"],
}));
add(def("guardian-off", "lax guardian off", "Disable auto-protection monitoring", "guardian", "local-only", {
  aliases: ["guard-off"],
  confirmRequired: true,
}));
add(def("guardian-status", "lax guardian status", "Show guardian state (armed, threshold, target)", "guardian", "local-only", {
  aliases: ["gstatus", "guard-status"],
}));
add(def("threshold", "lax threshold <value>", "Set HF trigger threshold", "guardian", "local-only", {
  aliases: ["thresh"],
  examples: ["lax threshold 1.05", "lax threshold 1.02"],
}));
add(def("target", "lax target <value>", "Set target HF after repayment", "guardian", "local-only", {
  examples: ["lax target 1.15", "lax target 1.10"],
}));
add(def("arm", "lax arm", "Arm the guardian (enable auto-trigger)", "guardian", "local-only"));
add(def("disarm", "lax disarm", "Disarm guardian (prevent auto-trigger)", "guardian", "local-only"));
add(def("engage", "lax engage", "Manually trigger protection now", "guardian", "local-only", {
  aliases: ["trigger"],
  confirmRequired: true,
}));
add(def("autopilot", "lax autopilot [demo]", "Scan HF and let LAX decide whether to trigger protection", "guardian", "local-only", {
  aliases: ["auto"],
  examples: ["lax autopilot", "lax autopilot demo"],
}));
add(def("schedule", "lax schedule <seconds>", "Schedule protection check in N seconds", "guardian", "local-only", {
  examples: ["lax schedule 30", "lax schedule 60"],
}));
add(def("cooldown", "lax cooldown <minutes>", "Set cooldown between re-triggers", "guardian", "local-only", {
  examples: ["lax cooldown 15"],
}));

// ── Onchain via KeeperHub ──
add(def("repay", "lax repay <amount> [--local]", "Repay USDC debt via KeeperHub workflow", "onchain", "keeperhub-workflow", {
  fallback: { strategy: "keepers-fail-local", altRouting: "rpc-write" },
  confirmRequired: true,
  examples: ["lax repay 480", "lax repay 100 --local"],
}));
add(def("approve", "lax approve <token> <amount> [--local]", "Approve token spend via KeeperHub", "onchain", "keeperhub-workflow", {
  fallback: { strategy: "keepers-fail-local", altRouting: "rpc-write" },
  confirmRequired: true,
  examples: ["lax approve USDC 500", "lax approve WETH 1"],
}));
add(def("withdraw", "lax withdraw <token> <amount> [--local]", "Withdraw supplied token from Aave", "onchain", "keeperhub-workflow", {
  fallback: { strategy: "keepers-fail-local", altRouting: "rpc-write" },
  confirmRequired: true,
  examples: ["lax withdraw USDC 100"],
}));
add(def("supply", "lax supply <token> <amount> [--local]", "Supply token to Aave", "onchain", "keeperhub-workflow", {
  fallback: { strategy: "keepers-fail-local", altRouting: "rpc-write" },
  confirmRequired: true,
  examples: ["lax supply USDC 500"],
}));
add(def("swap", "lax swap <from> <amount> <to> [--local]", "Swap tokens (WETH/USDC)", "onchain", "keeperhub-workflow", {
  fallback: { strategy: "keepers-fail-local", altRouting: "rpc-write" },
  confirmRequired: true,
  examples: ["lax swap WETH 1 USDC"],
}));
add(def("rebalance", "lax rebalance [--local]", "Withdraw excess collateral, repay debt", "onchain", "keeperhub-workflow", {
  fallback: { strategy: "keepers-fail-local", altRouting: "rpc-write" },
  confirmRequired: true,
}));
add(def("boost", "lax boost <amount> [--local]", "Supply additional collateral to improve HF", "onchain", "keeperhub-workflow", {
  fallback: { strategy: "keepers-fail-local", altRouting: "rpc-write" },
  confirmRequired: true,
  examples: ["lax boost 100"],
}));
add(def("paydown", "lax paydown <amount> [--local]", "Repay specific USDC debt amount", "onchain", "keeperhub-workflow", {
  fallback: { strategy: "keepers-fail-local", altRouting: "rpc-write" },
  confirmRequired: true,
  examples: ["lax paydown 50"],
}));
add(def("transfer", "lax transfer <token> <amount> <address> [--local]", "Transfer tokens via KeeperHub wallet", "onchain", "keeperhub-workflow", {
  fallback: { strategy: "keepers-fail-local", altRouting: "rpc-write" },
  confirmRequired: true,
  examples: ["lax transfer USDC 100 0x..."],
}));

// ── Audit & Observability ──
add(def("runs", "lax runs [--limit N] [--json]", "Mitigation history — every trigger, gate decision, and fire (persisted)", "audit", "local-only", {
  examples: ["lax runs", "lax runs --limit 30", "lax runs --json"],
}));
add(def("explain", "lax explain <execution-id | runs-index>", "Replay a gate decision stage by stage", "audit", "local-only", {
  examples: ["lax explain 1", "lax explain 9bc31ofdfca1m62b2v29t"],
}));
add(def("run", "lax run <id>", "Show details of a specific execution", "audit", "local-only", {
  examples: ["lax run exec-xyz-789"],
}));
add(def("tx", "lax tx <hash>", "Look up onchain transaction (block, gas, status)", "audit", "rpc-read", {
  aliases: ["transaction"],
  examples: ["lax tx 0xabc..."],
}));
add(def("history", "lax history [--limit N]", "Full history of all commands this session", "audit", "local-only", {
  aliases: ["hist"],
  examples: ["lax history", "lax history --limit 20"],
}));
add(def("audit", "lax audit", "Export audit trail (session summary)", "audit", "local-only"));
add(def("tail", "lax tail [--lines N]", "Tail recent event log entries", "audit", "local-only", {
  examples: ["lax tail", "lax tail --lines 50"],
}));
add(def("export", "lax export", "Export session data as JSON", "audit", "local-only", {
  aliases: ["dump"],
}));
add(def("snapshot", "lax snapshot [label]", "Take a position snapshot", "audit", "local-only", {
  aliases: ["snap"],
  examples: ["lax snapshot", "lax snapshot before-repay"],
}));
add(def("compare", "lax compare <id>", "Compare current position against a snapshot", "audit", "local-only", {
  aliases: ["diff"],
  examples: ["lax compare snap-001"],
}));
add(def("snapshots", "lax snapshots", "List all saved snapshots", "audit", "local-only", {
  aliases: ["snaps", "snap-list"],
}));

// ── System & Meta ──
add(def("help", "lax help [command]", "List all commands or show help for a specific command", "system", "local-only", {
  aliases: ["?"],
  examples: ["lax help", "lax help repay"],
}));
add(def("man", "lax man <command>", "Detailed manual for a command (usage, args, examples)", "system", "local-only", {
  examples: ["lax man shock", "lax man repay"],
}));
add(def("version", "lax version", "Show LAX version", "system", "local-only", {
  aliases: ["v", "--version"],
}));
add(def("clear", "lax clear", "Clear terminal screen", "system", "local-only", {
  aliases: ["cls"],
}));
add(def("reset", "lax reset", "Reset dashboard state (logs, position cache)", "system", "local-only", {
  confirmRequired: true,
}));
add(def("connect", "lax connect", "Test RPC connection to Anvil fork", "system", "local-only"));
add(def("reconnect", "lax reconnect", "Force reconnection to RPC", "system", "local-only"));
add(def("rpc", "lax rpc <url>", "Switch RPC endpoint", "system", "local-only", {
  examples: ["lax rpc http://127.0.0.1:18545"],
}));
add(def("theme", "lax theme <name>", "Switch color theme (dark/light/matrix)", "system", "local-only", {
  examples: ["lax theme dark", "lax theme matrix"],
}));
add(def("uptime", "lax uptime", "Time since dashboard started", "system", "local-only"));
add(def("whoami", "lax whoami", "Show borrower wallet address", "system", "local-only"));
add(def("debug", "lax debug [on|off]", "Toggle debug mode (verbose output)", "system", "local-only", {
  examples: ["lax debug on", "lax debug off"],
}));
add(def("ping", "lax ping", "Ping RPC endpoint, show latency", "system", "local-only"));
add(def("echo", "lax echo <text...>", "Print text (useful for demo scripting)", "system", "local-only", {
  examples: ["lax echo Starting demo sequence..."],
}));
add(def("guide", "lax guide", "Show the fastest liquidation autopilot demo path", "system", "local-only", {
  aliases: ["tutorial", "walkthrough"],
  examples: ["lax guide", "lax help repay"],
}));
add(def("aliases", "lax aliases", "List all command aliases", "system", "local-only", {
  aliases: ["alias"],
}));

export function findCommand(name: string): CommandDefinition | undefined {
  return COMMANDS[name];
}

export function fuzzyFind(input: string): CommandDefinition[] {
  const lower = input.toLowerCase();
  const candidates: { cmd: CommandDefinition; score: number }[] = [];

  for (const [name, cmd] of Object.entries(COMMANDS)) {
    if (name.startsWith(lower)) {
      candidates.push({ cmd, score: 100 });
      continue;
    }
    const dist = levenshtein(lower, name);
    if (dist <= 3) {
      candidates.push({ cmd, score: 100 - dist * 20 });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 3).map((c) => c.cmd);
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!) + 1;
    }
  }
  return dp[m]![n]!;
}

export function getCommandNames(): string[] {
  const names = new Set<string>();
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    if (cmd.name === name) names.add(name);
  }
  return [...names].sort();
}

export function getAutocompleteSuggestions(prefix: string): string[] {
  const lower = prefix.toLowerCase();
  return getCommandNames()
    .filter((n) => n.startsWith(lower))
    .slice(0, 10);
}
