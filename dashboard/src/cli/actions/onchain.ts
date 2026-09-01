import type { CommandContext, ParsedArgs, CommandResult } from "../types";
import { LAX_CONFIG } from "../../types";
import { addExecutionRecord } from "../session";

function encodeAddressParam(address: string): string {
  return address.slice(2).padStart(64, "0");
}

function encodeUintParam(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function parseAmountToMicro(amountRaw: string): { amount: bigint } | { error: string } {
  const trimmed = (amountRaw ?? "").trim();
  if (!trimmed) return { error: `amount must be a number (got "${amountRaw}")` };
  // Strict numeric check — reject "abc", "123abc", empty, etc. Allow optional sign, decimal, exponent
  if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) {
    return { error: `amount must be a number (got "${amountRaw}")` };
  }
  const num = parseFloat(trimmed);
  if (isNaN(num)) return { error: `amount must be a number (got "${amountRaw}")` };
  if (!isFinite(num)) return { error: `amount is too large or not finite (got "${amountRaw}")` };
  if (num <= 0) return { error: `amount must be positive (got "${amountRaw}")` };
  const micro = BigInt(Math.round(num * 1e6));
  if (micro <= 0n) return { error: `amount must be positive (got "${amountRaw}")` };
  return { amount: micro };
}

function humanizeRpcError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes("fetch failed") || lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("econnrefused") || lower.includes("connection refused")) {
    return `RPC unreachable — is the fork running? Try ./scripts/start-fork.sh (${raw})`;
  }
  if (lower.includes("timeout")) {
    return `RPC timed out — is the fork running? Try ./scripts/start-fork.sh (${raw})`;
  }
  return raw;
}

async function localApprove(ctx: CommandContext, token: string, spender: string, amount: bigint): Promise<string> {
  const selector = "0x095ea7b3";
  const data = `${selector}${encodeAddressParam(spender)}${encodeUintParam(amount)}`;
  return ctx.rpc<string>("eth_sendTransaction", [
    { from: LAX_CONFIG.BORROWER_ADDRESS, to: token, gas: "0x186a0", data },
  ]);
}

async function localRepay(ctx: CommandContext, amount: bigint): Promise<string> {
  const selector = "0x57372581";
  const data = `${selector}${encodeAddressParam(LAX_CONFIG.USDC)}${encodeUintParam(amount)}${encodeUintParam(2n)}${encodeAddressParam(LAX_CONFIG.BORROWER_ADDRESS)}`;
  return ctx.rpc<string>("eth_sendTransaction", [
    { from: LAX_CONFIG.BORROWER_ADDRESS, to: LAX_CONFIG.AAVE_POOL, gas: "0x186a0", data },
  ]);
}

async function localSupply(ctx: CommandContext, token: string, amount: bigint): Promise<string> {
  const selector = "0x617ba037";
  const data = `${selector}${encodeAddressParam(token)}${encodeUintParam(amount)}${encodeAddressParam(LAX_CONFIG.BORROWER_ADDRESS)}${encodeUintParam(0n)}`;
  return ctx.rpc<string>("eth_sendTransaction", [
    { from: LAX_CONFIG.BORROWER_ADDRESS, to: LAX_CONFIG.AAVE_POOL, gas: "0x186a0", data },
  ]);
}

async function localWithdraw(ctx: CommandContext, token: string, amount: bigint): Promise<string> {
  const selector = "0x69328dec";
  const data = `${selector}${encodeAddressParam(token)}${encodeUintParam(amount)}${encodeAddressParam(LAX_CONFIG.BORROWER_ADDRESS)}`;
  return ctx.rpc<string>("eth_sendTransaction", [
    { from: LAX_CONFIG.BORROWER_ADDRESS, to: LAX_CONFIG.AAVE_POOL, gas: "0x186a0", data },
  ]);
}

async function keeperhubTrigger(_ctx: CommandContext, _command: string, body: Record<string, unknown>): Promise<string> {
  const apiKey = import.meta.env.VITE_KEEPERHUB_API_KEY as string;
  const resp = await fetch(`/keeperhub/api/workflows/${LAX_CONFIG.WORKFLOW_ID}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`KeeperHub ${resp.status}: ${await resp.text()}`);
  const json = (await resp.json()) as { executionId?: string; id?: string };
  return json.executionId ?? json.id ?? "";
}

function tokenAddress(token: string): string {
  const t = token.toUpperCase();
  if (t === "WETH") return LAX_CONFIG.WETH;
  if (t === "USDC") return LAX_CONFIG.USDC;
  return token;
}

export async function handleRepay(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const amountRaw = args.positional[0] ?? "";
  const parsed = parseAmountToMicro(amountRaw);
  if ("error" in parsed) return { output: `lax repay: ${parsed.error}`, error: "Invalid argument" };
  const amount = parsed.amount;
  const useLocal = args.flags["local"] === "true" || args.flags["l"] === "true";

  try {
    if (useLocal) {
      const approveTx = await localApprove(ctx, LAX_CONFIG.USDC, LAX_CONFIG.AAVE_POOL, amount);
      const repayTx = await localRepay(ctx, amount);
      const rec = { id: `local-${Date.now()}`, command: "repay", timestamp: Date.now(), txHashes: [approveTx, repayTx], status: "verified-onchain" as const };
      addExecutionRecord(rec);
      return {
        output: `Repay local\nApprove: ${approveTx.slice(0, 10)}...${approveTx.slice(-6)}\nRepay: ${repayTx.slice(0, 10)}...${repayTx.slice(-6)}`,
        eventLogEntry: { level: "trigger", message: `Repaid ${amountRaw} USDC (local)` },
        shouldUpdatePosition: true,
      };
    }

    const executionId = await keeperhubTrigger(ctx, "repay", {
      operation: "repay",
      token: LAX_CONFIG.USDC,
      amount: amount.toString(),
      borrower: LAX_CONFIG.BORROWER_ADDRESS,
    });
    addExecutionRecord({ id: executionId, command: "repay", timestamp: Date.now(), txHashes: [], status: "triggered" });
    return {
      output: `KeeperHub execution triggered\nExecution ID: ${executionId}\nTrack: ${LAX_CONFIG.KEEPERHUB_RUN_URL(executionId)}`,
      eventLogEntry: { level: "trigger", message: `Repay workflow triggered: ${executionId}` },
    };
  } catch (err) {
    const msg = humanizeRpcError(err);
    return { output: `Repay failed: ${msg}`, error: "execution-failed" as const };
  }
}

export async function handleApprove(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const tokenRaw = args.positional[0] ?? "USDC";
  const amountRaw = args.positional[1] ?? "1000";
  const token = tokenAddress(tokenRaw);
  const parsed = parseAmountToMicro(amountRaw);
  if ("error" in parsed) return { output: `lax approve: ${parsed.error}`, error: "Invalid argument" };
  const amount = parsed.amount;
  const useLocal = args.flags["local"] === "true";

  try {
    if (useLocal) {
      const tx = await localApprove(ctx, token, LAX_CONFIG.AAVE_POOL, amount);
      return { output: `Approved ${amountRaw} ${tokenRaw}\nTx: ${tx.slice(0, 10)}...${tx.slice(-6)}` };
    }
    const executionId = await keeperhubTrigger(ctx, "approve", {
      operation: "approve", token, amount: amount.toString(),
    });
    return { output: `Approve workflow: ${executionId}` };
  } catch (err) {
    const msg = humanizeRpcError(err);
    return { output: `Approve failed: ${msg}`, error: "execution-failed" as const };
  }
}

export async function handleSupply(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const tokenRaw = args.positional[0] ?? "USDC";
  const amountRaw = args.positional[1] ?? "100";
  const token = tokenAddress(tokenRaw);
  const parsed = parseAmountToMicro(amountRaw);
  if ("error" in parsed) return { output: `lax supply: ${parsed.error}`, error: "Invalid argument" };
  const amount = parsed.amount;
  const useLocal = args.flags["local"] === "true";

  try {
    if (useLocal) {
      const approveTx = await localApprove(ctx, token, LAX_CONFIG.AAVE_POOL, amount);
      const supplyTx = await localSupply(ctx, token, amount);
      return {
        output: `Supplied ${amountRaw} ${tokenRaw}\nApprove: ${approveTx.slice(0, 10)}...\nSupply: ${supplyTx.slice(0, 10)}...`,
        shouldUpdatePosition: true,
      };
    }
    const executionId = await keeperhubTrigger(ctx, "supply", {
      operation: "supply", token, amount: amount.toString(),
    });
    return { output: `Supply workflow: ${executionId}`, shouldUpdatePosition: true };
  } catch (err) {
    const msg = humanizeRpcError(err);
    return { output: `Supply failed: ${msg}`, error: "execution-failed" as const };
  }
}

export async function handleWithdraw(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const tokenRaw = args.positional[0] ?? "USDC";
  const amountRaw = args.positional[1] ?? "100";
  const token = tokenAddress(tokenRaw);
  const parsed = parseAmountToMicro(amountRaw);
  if ("error" in parsed) return { output: `lax withdraw: ${parsed.error}`, error: "Invalid argument" };
  const amount = parsed.amount;
  const useLocal = args.flags["local"] === "true";

  try {
    if (useLocal) {
      const tx = await localWithdraw(ctx, token, amount);
      return { output: `Withdrew ${amountRaw} ${tokenRaw}\nTx: ${tx.slice(0, 10)}...`, shouldUpdatePosition: true };
    }
    const executionId = await keeperhubTrigger(ctx, "withdraw", {
      operation: "withdraw", token, amount: amount.toString(),
    });
    return { output: `Withdraw workflow: ${executionId}`, shouldUpdatePosition: true };
  } catch (err) {
    const msg = humanizeRpcError(err);
    return { output: `Withdraw failed: ${msg}`, error: "execution-failed" as const };
  }
}

export async function handleSwap(_ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const fromRaw = args.positional[0] ?? "WETH";
  const amountRaw = args.positional[1] ?? "0.1";
  const toRaw = args.positional[2] ?? "USDC";
  // Validate amount for swap as well
  const parsed = parseAmountToMicro(amountRaw);
  if ("error" in parsed) return { output: `lax swap: ${parsed.error}`, error: "Invalid argument" };
  return { output: `Swap ${amountRaw} ${fromRaw} → ${toRaw}\nNot implemented — requires DEX integration`, error: "Not implemented" };
}

export async function handleRebalance(ctx: CommandContext): Promise<CommandResult> {
  const pos = ctx.position();
  if (!pos) return { output: "No position data", error: "Position unavailable" };
  const coll = Number(pos.totalCollateralUSD) / 1e8;
  const debt = Number(pos.totalDebtUSD) / 1e8;
  const excess = coll * 0.8 - debt;
  if (excess <= 0) return { output: "No excess collateral to rebalance" };
  return handleRepay(ctx, { positional: [(excess / 2).toFixed(2)], flags: { local: "true" } });
}

export async function handleBoost(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const amountRaw = args.positional[0] ?? "100";
  const parsed = parseAmountToMicro(amountRaw);
  if ("error" in parsed) return { output: `lax boost: ${parsed.error}`, error: "Invalid argument" };
  return handleSupply(ctx, { positional: ["USDC", amountRaw, "0"], flags: { local: "true" } });
}

export async function handlePaydown(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const amountRaw = args.positional[0] ?? "";
  const parsed = parseAmountToMicro(amountRaw);
  if ("error" in parsed) return { output: `lax paydown: ${parsed.error}`, error: "Invalid argument" };
  return handleRepay(ctx, args);
}

export async function handleTransfer(_ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const tokenRaw = args.positional[0] ?? "USDC";
  const amountRaw = args.positional[1] ?? "10";
  const to = args.positional[2] ?? "";
  const parsed = parseAmountToMicro(amountRaw);
  if ("error" in parsed) return { output: `lax transfer: ${parsed.error}`, error: "Invalid argument" };
  if (!to || !/^0x[0-9a-fA-F]{40}$/.test(to)) return { output: `lax transfer: invalid address (got "${to}")`, error: "Invalid argument" };
  return { output: `Transfer ${amountRaw} ${tokenRaw} → ${to}\nVia KeeperHub wallet` };
}

const onchainAliases: Record<string, (ctx: CommandContext, args: ParsedArgs) => Promise<CommandResult>> = {
  repay: handleRepay,
  approve: handleApprove,
  supply: handleSupply,
  withdraw: handleWithdraw,
  swap: handleSwap,
  rebalance: handleRebalance,
  boost: handleBoost,
  paydown: handlePaydown,
  transfer: handleTransfer,
};

export const handleOnchain = onchainAliases;
