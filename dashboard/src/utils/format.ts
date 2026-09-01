import type { MitigationStep } from "../types";

export const FORK_GAS_NOTE = "~$0.00 fork — no cost";
export const FORK_GAS_QUEUED = `queued (${FORK_GAS_NOTE})`;

export function fmtTime(ts: number | null): string {
  if (ts == null) return "--:--:--";
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false });
}

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function fmtDuration(start: number | null, end: number | null): string {
  if (start == null) return "--";
  const ms = (end ?? Date.now()) - start;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function fmtDurationFromSteps(start: number, steps: MitigationStep[]): string {
  const finishTimes = steps
    .map((s) => s.finishedAt)
    .filter((t): t is number => t !== null);
  if (finishTimes.length === 0) return "--";
  const end = Math.max(...finishTimes);
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function fmtUSDC(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac = amount % 1_000_000n;
  return `${whole.toString()}.${frac.toString().padStart(6, "0")}`;
}

export function fmtUSDCWithSymbol(amount: bigint): string {
  return `${fmtUSDC(amount)} USDC`;
}

export function statusIcon(status: MitigationStep["status"]): string {
  switch (status) {
    case "pending": return "[···]";
    case "running": return "[>>>]";
    case "success": return "[OK]";
    case "failed": return "[!!]";
    default: return "[···]";
  }
}

export function statusColor(status: MitigationStep["status"]): string {
  switch (status) {
    case "pending": return "text-secondary";
    case "running": return "text-cyan";
    case "success": return "text-green";
    case "failed": return "text-red";
    default: return "text-secondary";
  }
}

function padHex(value: string, bytes: number): string {
  return value.replace(/^0x/, "").padStart(bytes * 2, "0");
}

export function encodeAddress(addr: string): string {
  return padHex(addr, 32);
}

export function encodeUint(value: bigint): string {
  return padHex(value.toString(16), 32);
}

export function strip0x(value: string): string {
  return value.replace(/^0x/, "");
}

export function encodeAddressParam(address: string): string {
  return strip0x(address).padStart(64, "0");
}

export function encodeUintParam(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

export function decodeAddress(value: string): string {
  return `0x${strip0x(value).slice(-40)}`;
}

export function fmtBlock(blockNumber: bigint): string {
  if (blockNumber === 0n) return "pending";
  return `#${blockNumber.toString()}`;
}

export const MAX_HF = BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639935");

export function hfToNumber(hf: bigint): number {
  return Number(hf) / 1e18;
}

export function fmtHf(hf: bigint): string {
  if (hf >= MAX_HF / 2n) return "∞";
  return hfToNumber(hf).toFixed(4);
}

export function fmtHfShort(hf: bigint): string {
  if (hf >= MAX_HF / 2n) return "∞";
  return hfToNumber(hf).toFixed(2);
}

export function fmtTimeShort(ts: number): string {
  const ago = Date.now() - ts;
  if (ago < 1000) return "just now";
  if (ago < 60000) return Math.floor(ago / 1000) + "s ago";
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false });
}

export function calcLiquidationPct(hf: bigint): number | null {
  if (hf >= MAX_HF / 2n) return null;
  const val = hfToNumber(hf);
  if (val <= 1.0) return 0;
  return ((val - 1.0) / val) * 100;
}

export function logLevelClass(level: "info" | "warn" | "error" | "trigger"): string {
  switch (level) {
    case "info": return "text-primary";
    case "warn": return "text-yellow";
    case "error": return "text-red";
    case "trigger": return "text-amber font-bold";
    default: return "text-primary";
  }
}

export function fmtDollars(val: bigint): string {
  const n = Number(val) / 1e8;
  if (n >= 1000) return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return "$" + n.toFixed(2);
}
