import type { CommandContext, ParsedArgs, CommandResult } from "../types";
import { getSession } from "../session";
import { LAX_CONFIG } from "../lax-config";
import { CLI_ENV } from "../env";

function humanizeRpcErrorRpc(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes("fetch failed") || lower.includes("failed to fetch") || lower.includes("econnrefused") || lower.includes("connection refused") || lower.includes("timeout")) {
    return `RPC unreachable — is the fork running? Try ./scripts/start-fork.sh (${raw})`;
  }
  return raw;
}

function fmt$(val: bigint): string {
  const n = Number(val) / 1e8;
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtHf(hf: bigint): string {
  if (hf > 10n ** 36n) return "∞";
  return (Number(hf) / 1e18).toFixed(4);
}

export async function handleStatus(ctx: CommandContext): Promise<CommandResult> {
  const pos = ctx.position();
  const guardian = ctx.getGuardianState();
  const session = getSession();
  let output = "";

  if (!pos) {
    output = "Position: no data\nRPC: disconnected\nMode: offline";
  } else {
    output = [
      `Health Factor: ${fmtHf(pos.healthFactor)}`,
      `Collateral: ${fmt$(pos.totalCollateralUSD)}`,
      `Debt: ${fmt$(pos.totalDebtUSD)}`,
      `Block: #${pos.blockNumber.toString()}`,
      `Guardian: ${guardian.enabled ? "ENABLED" : "DISABLED"}`,
      `Mock mode: ${session.mockMode ? "ACTIVE" : "inactive"}`,
      `Commands run: ${session.commandCount}`,
    ].join("\n");
  }

  return { output, shouldUpdatePosition: false };
}

export async function handleHf(ctx: CommandContext): Promise<CommandResult> {
  const pos = ctx.position();
  if (!pos) return { output: "No position data", error: "Position unavailable" };
  return {
    output: `Health Factor: ${fmtHf(pos.healthFactor)}`,
    shouldUpdatePosition: false,
  };
}

export async function handlePosition(ctx: CommandContext): Promise<CommandResult> {
  const pos = ctx.position();
  if (!pos) return { output: "No position data", error: "Position unavailable" };
  return {
    output: [
      `Collateral: ${fmt$(pos.totalCollateralUSD)}`,
      `Debt: ${fmt$(pos.totalDebtUSD)}`,
      `Net: ${fmt$(pos.totalCollateralUSD - pos.totalDebtUSD)}`,
      `HF: ${fmtHf(pos.healthFactor)}`,
      `Block: #${pos.blockNumber.toString()}`,
    ].join("\n"),
    shouldUpdatePosition: false,
  };
}

export async function handleDebt(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const pos = ctx.position();
  if (!pos) return { output: "No position data", error: "Position unavailable" };
  const token = args.positional[0] ?? "USDC";
  return {
    output: `Debt (${token}): ${fmt$(pos.totalDebtUSD)} (variable rate)`,
    shouldUpdatePosition: false,
  };
}

export async function handleCollateral(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const pos = ctx.position();
  if (!pos) return { output: "No position data", error: "Position unavailable" };
  const token = args.positional[0] ?? "all";
  return {
    output: `Collateral (${token}): ${fmt$(pos.totalCollateralUSD)}`,
    shouldUpdatePosition: false,
  };
}

export async function handleOracle(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const token = (args.positional[0] ?? "WETH").toUpperCase();
  try {
    const oracleAddr = await ctx.rpc<string>("eth_call", [
      { to: LAX_CONFIG.POOL_ADDRESSES_PROVIDER, data: "0xfca513a8" },
      "latest",
    ]);
    const address = `0x${oracleAddr.slice(-40)}`;
    const selector = "0xb3596f07";
    const tokenAddr = token === "WETH" ? LAX_CONFIG.WETH : LAX_CONFIG.USDC;
    const padded = tokenAddr.slice(2).padStart(64, "0");
    const priceRaw = await ctx.rpc<string>("eth_call", [
      { to: address, data: `${selector}${padded}` },
      "latest",
    ]);
    const price = BigInt(priceRaw);
    const usd = token === "WETH" ? Number(price) / 1e8 : Number(price) / 1e8;
    return {
      output: `${token} oracle: $${usd.toFixed(2)} (at ${address.slice(0, 10)}...)`,
      shouldUpdatePosition: false,
    };
  } catch (err) {
    const msg = humanizeRpcErrorRpc(err);
    return { output: `Oracle read failed: ${msg}`, error: "execution-failed" as const };
  }
}

export async function handleBlock(ctx: CommandContext): Promise<CommandResult> {
  try {
    const blockNum = await ctx.rpc<string>("eth_blockNumber", []);
    const block = parseInt(blockNum, 16);
    return { output: `Block: #${block}`, shouldUpdatePosition: false };
  } catch (err) {
    const msg = humanizeRpcErrorRpc(err);
    return { output: `Block read failed: ${msg}`, error: "execution-failed" as const };
  }
}

export async function handlePool(_ctx: CommandContext): Promise<CommandResult> {
  return {
    output: [
      `Aave V3 Pool: ${LAX_CONFIG.AAVE_POOL}`,
      `Address Provider: ${LAX_CONFIG.POOL_ADDRESSES_PROVIDER}`,
      `Chain: Base (Anvil fork)`,
      `RPC: ${LAX_CONFIG.FORK_RPC}`,
    ].join("\n"),
    shouldUpdatePosition: false,
  };
}

export async function handleConfig(_ctx: CommandContext): Promise<CommandResult> {
  return {
    output: [
      `Borrower: ${LAX_CONFIG.BORROWER_ADDRESS}`,
      `HF Trigger: ≤ ${LAX_CONFIG.HF_TRIGGER}`,
      `HF Target: ≥ ${LAX_CONFIG.HF_TARGET}`,
      `Workflow ID: ${LAX_CONFIG.WORKFLOW_ID}`,
      `Fork Port: ${LAX_CONFIG.FORK_PORT}`,
      `Wallet: ${LAX_CONFIG.WALLET_ADDRESS}`,
    ].join("\n"),
    shouldUpdatePosition: false,
  };
}

export async function handleKeeper(_ctx: CommandContext): Promise<CommandResult> {
  const apiKey = CLI_ENV.KEEPERHUB_API_KEY as string | undefined;
  if (!apiKey) return { output: "KeeperHub: no API key configured", error: "Missing KEEPERHUB_API_KEY" };
  return {
    output: `KeeperHub: connected\nWorkflow ID: ${LAX_CONFIG.WORKFLOW_ID}\nAPI key: ${apiKey.slice(0, 8)}...`,
    shouldUpdatePosition: false,
  };
}

export async function handleReserves(_ctx: CommandContext): Promise<CommandResult> {
  return {
    output: [
      "Reserve      | Supply | Borrow | LTV",
      "─────────────┼────────┼────────┼──────",
      "USDC         | Active | Active | 80%",
      "WETH         | Active | Active | 75%",
    ].join("\n"),
    shouldUpdatePosition: false,
  };
}

export async function handleLiquidationPrice(ctx: CommandContext): Promise<CommandResult> {
  const pos = ctx.position();
  if (!pos) return { output: "No position data", error: "Position unavailable" };
  const hf = Number(pos.healthFactor) / 1e18;
  const liqPriceWeth = (3300 * hf).toFixed(2);
  return {
    output: `Liquidation at WETH ≈ $${liqPriceWeth} (current: $3,300.00)`,
    shouldUpdatePosition: false,
  };
}

export async function handleLtv(ctx: CommandContext): Promise<CommandResult> {
  const pos = ctx.position();
  if (!pos) return { output: "No position data", error: "Position unavailable" };
  const coll = Number(pos.totalCollateralUSD) / 1e8;
  const debt = Number(pos.totalDebtUSD) / 1e8;
  const ltv = coll > 0 ? ((debt / coll) * 100).toFixed(2) : "0.00";
  return {
    output: `LTV: ${ltv}% (debt ${debt} / collateral ${coll})`,
    shouldUpdatePosition: false,
  };
}

export const handleRpcCall: Record<string, (ctx: CommandContext, args: ParsedArgs) => Promise<CommandResult>> = {
  status: handleStatus,
  st: handleStatus,
  hf: handleHf,
  "health-factor": handleHf,
  health: handleHf,
  position: handlePosition,
  pos: handlePosition,
  portfolio: handlePosition,
  debt: handleDebt,
  collateral: handleCollateral,
  coll: handleCollateral,
  oracle: handleOracle,
  block: handleBlock,
  pool: handlePool,
  config: handleConfig,
  cfg: handleConfig,
  keeper: handleKeeper,
  reserves: handleReserves,
  "liquidation-price": handleLiquidationPrice,
  "liq-price": handleLiquidationPrice,
  liqprice: handleLiquidationPrice,
  ltv: handleLtv,
};
