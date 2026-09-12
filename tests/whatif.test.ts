// `lax whatif` — counterfactual command: pure math paths (no fork required).
import { describe, it, expect } from "vitest";
import { handleWhatif } from "../src/cli/actions/whatif";
import type { CommandContext, ParsedArgs } from "../src/cli/types";
import { computeRepayAmount, hfToBigint } from "../src/repay-math";

function ctxWith(hf: number, collateralUsd: number, debtUsd: number): CommandContext {
  const e18 = (v: number) => BigInt(Math.round(v * 1e18));
  const usd8 = (v: number) => BigInt(Math.round(v * 1e8));
  return {
    rpc: (() => Promise.resolve("0x")) as unknown as CommandContext["rpc"],
    position: () => ({
      healthFactor: e18(hf),
      totalCollateralUSD: usd8(collateralUsd),
      totalDebtUSD: usd8(debtUsd),
      availableBorrowsUSD: 0n,
      blockNumber: 1n,
    }),
    config: { HF_TARGET: 1.1 } as unknown as CommandContext["config"],
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
  };
}

const args = (flags: Record<string, string> = {}): ParsedArgs => ({ flags, positional: [] });

describe("lax whatif", () => {
  it("shows a healthy position surviving a 20% shock", async () => {
    const res = await handleWhatif(ctxWith(2.0, 1500, 700), args({}));
    expect(res.error).toBeUndefined();
    expect(res.output).toContain("drops 20%");
    expect(res.output).toContain("HF now:       2.0000");
    expect(res.output).toContain("HF shocked:   1.6000");
    expect(res.output).toContain("healthy");
    // healthy before AND after → no repay needed either way
    expect(res.output).not.toContain("Defending early saves");
  });

  it("quantifies the proactive discount: defending early is cheaper", async () => {
    // HF 1.09, shock 20% → shocked HF 0.872; repay today $9.09 vs $207.27 after
    const res = await handleWhatif(ctxWith(1.09, 1200, 1000), args({ shock: "20" }));
    expect(res.output).toContain("$9.09 today → $207.27 after the shock");
    expect(res.output).toContain("(defending early saves $198.18)");
  });

  it("puts a marginal position into the trigger zone after a shock", async () => {
    // HF 1.15, shock 10% → 1.035 (trigger zone)
    const res = await handleWhatif(ctxWith(1.15, 1200, 1000), args({ shock: "10" }));
    expect(res.output).toContain("HF shocked:   1.0350");
    expect(res.output).toContain("LAX TRIGGER ZONE");
    expect(res.output).toContain("the autopilot would fire");
  });

  it("warns when the shock is liquidatable", async () => {
    const res = await handleWhatif(ctxWith(1.1, 1200, 1000), args({ shock: "30" }));
    expect(res.output).toContain("HF shocked:   0.7700");
    expect(res.output).toContain("LIQUIDATABLE");
    expect(res.output).toContain("liquidatable");
  });

  it("computes defense cost consistent with the closed-form repay math", async () => {
    const ctx = ctxWith(1.08, 1500, 1000);
    const res = await handleWhatif(ctx, args({ shock: "10" }));
    // HF shocked = 0.972 → repay = debt × (1 − 0.972/1.10)
    const expected = (Number(computeRepayAmount(1000n * 10n ** 8n, hfToBigint(1.08 * 0.9), hfToBigint(1.1))) / 1e6).toFixed(2);
    expect(res.output).toContain(`$${expected} after the shock`);
  });

  it("rejects out-of-range shock and lt", async () => {
    const badShock = await handleWhatif(ctxWith(1.5, 100, 50), args({ shock: "150" }));
    expect(badShock.error).toBe("Invalid argument");
    const badLt = await handleWhatif(ctxWith(1.5, 100, 50), args({ lt: "1.5" }));
    expect(badLt.error).toBe("Invalid argument");
  });

  it("handles a debt-free position", async () => {
    const res = await handleWhatif(ctxWith(1e18, 1500, 0), args({}));
    expect(res.output).toContain("No debt");
  });
});
