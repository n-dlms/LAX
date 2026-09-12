// Reliability + observability tests: state durability, mitigation log reading,
// and the persisted `lax runs` / `lax explain` commands.
// Uses a temp LAX_STATE_DIR so the real ~/.lax is never touched.
import { describe, it, expect, beforeAll, vi } from "vitest";
import { writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Runs before the static imports initialize, so state.ts sees the temp dir
const STATE_DIR = vi.hoisted(() => {
  const dir = `/tmp/lax-state-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  process.env.LAX_STATE_DIR = dir;
  return dir;
});

import { loadState, saveState, appendMitigation, readMitigations, STATE_FILE, mitigationLogPath } from "../src/autopilot/state";
import { handleRuns, handleExplain } from "../src/cli/actions/audit";
import type { CommandContext, ParsedArgs } from "../src/cli/types";

function ctx(): CommandContext {
  return {
    rpc: (() => Promise.resolve("0x")) as unknown as CommandContext["rpc"],
    position: () => null,
    config: {} as CommandContext["config"],
    appendLog: () => {},
    refreshPosition: async () => {},
    setGuardianState: () => {},
    getGuardianState: () => ({ enabled: false, blocked: false, threshold: 1.05, target: 1.1 }),
    setMockMode: () => {},
    getMockMode: () => false,
    clearLogs: () => {},
    engageProtection: () => {},
    emit: () => {},
    getSnapshot: () => undefined,
    addSnapshot: () => {},
    listSnapshots: () => [],
    addExecutionRecord: () => {},
    getExecutionRecords: () => [],
    readMitigations: (limit?: number) => readMitigations(limit),
    mitigationLogPath: () => mitigationLogPath(),
  };
}

const args = (flags: Record<string, string> = {}, positional: string[] = []): ParsedArgs => ({ flags, positional });

beforeAll(() => {
  // Three well-formed records + a corrupt line that must be skipped, not fatal
  appendMitigation({ kind: "trigger", hf: 1.0431, repayUsdc: "32320000", repayHuman: "32.32 USDC", position: "fork", network: "base-fork" });
  appendMitigation({
    kind: "gate-blocked", hf: 1.0501, repayUsdc: "31000000", reason: "blocked by gate",
    stages: "hf-math:ok,preflight:FAIL,spend-caps:ok",
    stagesDetail: [
      { name: "hf-math", passed: true, detail: "Repay 31.00 USDC reaches target 1.10 within tolerance" },
      { name: "preflight", passed: false, detail: "eth_call reverted: ERC-20 allowance insufficient" },
      { name: "spend-caps", passed: true, detail: "Repays $31.00 within block/daily caps" },
    ],
  });
  appendMitigation({
    kind: "webhook-fired", hf: 1.0431, repayUsdc: "32320000", repayHuman: "32.32 USDC",
    executionId: "9bc31ofdfca1m62b2v29t", stages: "hf-math:ok,preflight:ok,spend-caps:ok",
    stagesDetail: [
      { name: "hf-math", passed: true, detail: "Repay 32.32 USDC reaches target 1.10 within tolerance" },
      { name: "preflight", passed: true, detail: "simulation ok" },
      { name: "spend-caps", passed: true, detail: "Repays $32.32 within block/daily caps" },
    ],
  });
  const log = readFileSync(mitigationLogPath(), "utf8");
  writeFileSync(mitigationLogPath(), log + "{corrupt truncated line\n");
});

describe("state durability", () => {
  it("readMitigations skips corrupt JSONL lines instead of throwing", () => {
    const recs = readMitigations(100);
    expect(recs).toHaveLength(3);
    expect(recs.map((r) => r.kind)).toEqual(["trigger", "gate-blocked", "webhook-fired"]);
  });

  it("loadState backs up a corrupt state.json and starts fresh", () => {
    writeFileSync(STATE_FILE, "{not valid json");
    const state = loadState(1.05, 1.1);
    expect(state.guardian.enabled).toBe(false);
    const backups = readdirSync(STATE_DIR).filter((f) => f.includes(".corrupt-"));
    expect(backups.length).toBeGreaterThanOrEqual(1);
    expect(readFileSync(join(STATE_DIR, backups[backups.length - 1]!), "utf8")).toBe("{not valid json");
  });

  it("loadState preserves daemon fields written by saveState", () => {
    const state = loadState(1.05, 1.1);
    state.lastFiredBy = { fork: 12345 };
    state.spend24hUsd = 12.5;
    saveState(state);
    const reloaded = loadState(1.05, 1.1);
    expect(reloaded.lastFiredBy).toEqual({ fork: 12345 });
    expect(reloaded.spend24hUsd).toBe(12.5);
  });
});

describe("lax runs (persisted)", () => {
  it("lists mitigation records with kind, HF, repay, and permalink", async () => {
    const res = await handleRuns(ctx(), args({ limit: "10" }));
    expect(res.error).toBeUndefined();
    expect(res.output).toContain("TRIGGER");
    expect(res.output).toContain("BLOCKED");
    expect(res.output).toContain("FIRED");
    expect(res.output).toContain("HF 1.0431");
    expect(res.output).toContain("app.keeperhub.com/runs/9bc31ofdfca1m62b2v29t");
    expect(res.output).toContain("stages [hf-math:ok,preflight:FAIL,spend-caps:ok]");
  });

  it("supports --json machine-readable output", async () => {
    const res = await handleRuns(ctx(), args({ json: "" }));
    const parsed = JSON.parse(res.output!) as { mitigations: { kind: string }[]; mitigationLog: string };
    expect(parsed.mitigations).toHaveLength(3);
    expect(parsed.mitigationLog).toContain("mitigations.jsonl");
  });

  it("reports an empty log gracefully", async () => {
    vi.resetModules();
    process.env.LAX_STATE_DIR = `/tmp/lax-empty-test-${Date.now()}`;
    const { readMitigations: freshRead, mitigationLogPath: freshPath } = await import("../src/autopilot/state");
    const { handleRuns: freshRuns } = await import("../src/cli/actions/audit");
    const freshCtx = { ...ctx(), readMitigations: (limit?: number) => freshRead(limit), mitigationLogPath: () => freshPath() } as CommandContext;
    const res = await freshRuns(freshCtx, args({}));
    expect(res.output).toContain("No mitigations recorded yet");
  });
});

describe("lax explain", () => {
  it("explains by 1-based index from the most recent entry", async () => {
    const res = await handleExplain(ctx(), args({}, ["1"]));
    expect(res.error).toBeUndefined();
    expect(res.output).toContain("FIRED");
    expect(res.output).toContain("Gate stages:");
    expect(res.output).toContain("✓ hf-math");
    expect(res.output).toContain("Verdict: all stages passed — fire was authorized.");
  });

  it("explains a blocked decision with the failing stage", async () => {
    const res = await handleExplain(ctx(), args({}, ["2"]));
    expect(res.output).toContain("BLOCKED");
    expect(res.output).toContain("✗ preflight");
    expect(res.output).toContain("blocked at preflight — nothing touched the chain");
  });

  it("explains by execution id", async () => {
    const res = await handleExplain(ctx(), args({}, ["9bc31ofdfca1m62b2v29t"]));
    expect(res.error).toBeUndefined();
    expect(res.output).toContain("FIRED");
  });

  it("returns a helpful error for unknown keys", async () => {
    const res = await handleExplain(ctx(), args({}, ["nonexistent-id"]));
    expect(res.error).toBe("Not found");
    expect(res.output).toContain("try lax runs");
  });

  it("requires an argument", async () => {
    const res = await handleExplain(ctx(), args({}));
    expect(res.error).toBe("Missing argument");
  });
});

describe("mitigation log path", () => {
  it("respects LAX_STATE_DIR", () => {
    expect(mitigationLogPath()).toBe(join(STATE_DIR, "mitigations.jsonl"));
    expect(existsSync(mitigationLogPath())).toBe(true);
  });
});
