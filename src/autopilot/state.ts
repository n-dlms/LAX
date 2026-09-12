// Autopilot state — persisted guardian state and append-only mitigation log.
// Lives in ~/.lax (override with LAX_STATE_DIR). The daily-cap in the safety
// plugin is in-memory by design for the MCP path; the daemon's own spend
// accounting persists here so a restart cannot reset it.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const LAX_DIR = process.env.LAX_STATE_DIR || join(homedir(), ".lax");
export const STATE_FILE = join(LAX_DIR, "state.json");
export const MITIGATION_LOG = join(LAX_DIR, "mitigations.jsonl");

export interface GuardianState {
  enabled: boolean;
  blocked: boolean;
  threshold: number;
  target: number;
}

export interface DaemonState {
  guardian: GuardianState;
  lastFiredAt?: number;
  /** Per-position last-fire epoch ms (multi-position support). */
  lastFiredBy?: Record<string, number>;
  lastExecutionId?: string;
  /** Rolling spend for the current 24h window (USD), mirrors guardrails cap. */
  spend24hUsd?: number;
  spendWindowStart?: number;
}

export function defaultDaemonState(threshold: number, target: number): DaemonState {
  return { guardian: { enabled: false, blocked: false, threshold, target } };
}

export function loadState(threshold: number, target: number): DaemonState {
  const fresh = defaultDaemonState(threshold, target);
  let raw: string;
  try {
    raw = readFileSync(STATE_FILE, "utf8");
  } catch {
    return fresh;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<DaemonState>;
    return { ...fresh, ...parsed, guardian: { ...fresh.guardian, ...parsed.guardian } };
  } catch {
    // A corrupt state must not silently reset cooldown/spend memory — preserve
    // the file for inspection and start fresh.
    const backup = `${STATE_FILE}.corrupt-${Date.now()}`;
    try {
      writeFileSync(backup, raw);
      console.error(`[lax] ${STATE_FILE} is not valid JSON — backed up to ${backup}, starting fresh`);
    } catch {
      console.error(`[lax] ${STATE_FILE} is not valid JSON and could not be backed up — starting fresh`);
    }
    return fresh;
  }
}

export function saveState(state: DaemonState): void {
  mkdirSync(LAX_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export interface MitigationRecord {
  /** Epoch ms — set by appendMitigation when omitted. */
  ts?: number;
  kind: "trigger" | "gate-blocked" | "webhook-fired" | "fire-failed" | "dry-run" | "cooldown" | "shutdown";
  hf?: number;
  repayUsdc?: string;
  repayHuman?: string;
  executionId?: string;
  reason?: string;
  /** Compact per-stage verdicts, e.g. "hf-math:ok,preflight:FAIL". */
  stages?: string;
  /** Full gate stage detail — what `lax explain` replays. */
  stagesDetail?: { name: string; passed: boolean; detail: string }[];
  position?: string;
  network?: string;
}

export function appendMitigation(record: MitigationRecord): void {
  mkdirSync(LAX_DIR, { recursive: true });
  appendFileSync(MITIGATION_LOG, JSON.stringify({ ts: Date.now(), ...record }) + "\n");
}

export function readMitigations(limit = 50): MitigationRecord[] {
  if (!existsSync(MITIGATION_LOG)) return [];
  const lines = readFileSync(MITIGATION_LOG, "utf8").trim().split("\n").filter(Boolean);
  const records: MitigationRecord[] = [];
  for (const line of lines.slice(-limit)) {
    try {
      records.push(JSON.parse(line) as MitigationRecord);
    } catch {
      // one corrupt line (e.g. truncated by a crash mid-write) must not hide the rest
      console.error(`[lax] skipping corrupt line in ${MITIGATION_LOG}`);
    }
  }
  return records;
}

export function mitigationLogPath(): string {
  return MITIGATION_LOG;
}

export function resetMitigationLog(): void {
  if (existsSync(MITIGATION_LOG)) unlinkSync(MITIGATION_LOG);
}
