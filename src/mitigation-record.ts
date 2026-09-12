// Mitigation record — the shared shape of the append-only evidence log.
// Pure module (no node/browser-specific imports) so both the standalone CLI
// and the browser dashboard can type against it.
export interface GateStageResult {
  name: string;
  passed: boolean;
  detail: string;
  durationMs?: number;
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
  stagesDetail?: GateStageResult[];
  position?: string;
  network?: string;
}

export const MITIGATION_KIND_LABEL: Record<MitigationRecord["kind"], string> = {
  trigger: "▲ TRIGGER",
  "gate-blocked": "⛔ BLOCKED",
  "webhook-fired": "⚡ FIRED",
  "fire-failed": "✖ FAILED",
  "dry-run": "◌ DRY-RUN",
  cooldown: "⏱ COOLDOWN",
  shutdown: "■ SHUTDOWN",
};
