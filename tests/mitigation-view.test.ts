// The dashboard's mitigation view decision logic — regression-tested because a
// KeeperHub trigger failure used to blank the whole mitigation screen: the
// local fork repair was gated behind the webhook's execution id, so with no
// API key (fresh clone) the user saw an error and no repair at all.
import { describe, it, expect } from "vitest";
import { isLocalRpc, mergeSteps } from "../dashboard/src/utils/mitigation-steps";
import type { MitigationStep } from "../dashboard/src/types";

function step(partial: Partial<MitigationStep> & { stepId: MitigationStep["stepId"] }): MitigationStep {
  return {
    label: partial.stepId,
    status: "pending",
    txHash: null,
    gasUsed: null,
    error: null,
    retries: 0,
    startedAt: null,
    finishedAt: null,
    ...partial,
  };
}

const BASE: MitigationStep[] = [
  step({ stepId: "start" }),
  step({ stepId: "approve" }),
  step({ stepId: "repay" }),
  step({ stepId: "verify" }),
];

describe("isLocalRpc", () => {
  it("accepts local fork endpoints (with and without a port)", () => {
    expect(isLocalRpc("http://127.0.0.1:18545")).toBe(true);
    expect(isLocalRpc("http://localhost:8545")).toBe(true);
    expect(isLocalRpc("http://0.0.0.0:18545")).toBe(true);
  });

  it("rejects public networks — impersonation must never touch them", () => {
    expect(isLocalRpc("https://sepolia.base.org")).toBe(false);
    expect(isLocalRpc("https://mainnet.base.org")).toBe(false);
    expect(isLocalRpc("")).toBe(false);
  });
});

describe("mergeSteps — fork repair is visible without a KeeperHub run", () => {
  it("start step SUCCEEDS when the local repair has evidence but there is no execution id", () => {
    const local = [step({ stepId: "approve", status: "success", txHash: "0xapprove" })];
    const merged = mergeSteps(BASE, null, local, null, null);
    expect(merged.find((s) => s.stepId === "start")!.status).toBe("success");
  });

  it("regression: a webhook error no longer fails the start step when the fork repair ran", () => {
    // Before the fix this combination rendered "Mitigation Failed" with no steps.
    const local = [
      step({ stepId: "approve", status: "success", txHash: "0xapprove" }),
      step({ stepId: "repay", status: "success", txHash: "0xrepay" }),
      step({ stepId: "verify", status: "success" }),
    ];
    const merged = mergeSteps(BASE, null, local, null, "Failed to trigger: 404");
    const start = merged.find((s) => s.stepId === "start")!;
    expect(start.status).toBe("success");
    expect(merged.filter((s) => s.status === "success")).toHaveLength(4);
  });

  it("still fails when there is an error AND no local evidence AND no execution id", () => {
    const merged = mergeSteps(BASE, null, null, null, "Failed to trigger: 404");
    expect(merged.find((s) => s.stepId === "start")!.status).toBe("failed");
  });

  it("is running while neither the webhook nor the local path has reported", () => {
    const merged = mergeSteps(BASE, null, null, null, null);
    expect(merged.find((s) => s.stepId === "start")!.status).toBe("running");
  });

  it("prefers the local success over a polled failure for the same step (fork evidence wins)", () => {
    const polled = [step({ stepId: "repay", status: "failed", error: "Insufficient BASE balance" })];
    const local = [step({ stepId: "repay", status: "success", txHash: "0xrepay" })];
    const merged = mergeSteps(BASE, polled, local, "exec123", null);
    expect(merged.find((s) => s.stepId === "repay")!.status).toBe("success");
  });

  it("falls back to the polled step when there is no local equivalent", () => {
    const polled = [step({ stepId: "approve", status: "success", txHash: "0xremote" })];
    const merged = mergeSteps(BASE, polled, null, "exec123", null);
    expect(merged.find((s) => s.stepId === "approve")!.txHash).toBe("0xremote");
  });
});