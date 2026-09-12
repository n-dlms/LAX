// useExecutionPoller's parser — regression-tested against the REAL KeeperHub
// workflow-status response shape (captured 2026-09-12 from a verified
// execution; see docs/VERIFIED-TESTING.md).
import { describe, it, expect } from "vitest";
import { parseExecutionSteps } from "../dashboard/src/hooks/useExecutionPoller";

// Verbatim shape from GET /api/workflows/executions/{id}/status
const REAL_SUCCESS = {
  status: "success",
  nodeStatuses: [
    { nodeId: "trigger", status: "success" },
    { nodeId: "read_hf", status: "success" },
    { nodeId: "approve_usdc", status: "success" },
    { nodeId: "repay", status: "success" },
    { nodeId: "verify_hf", status: "success" },
  ],
  progress: { totalSteps: 5, completedSteps: 5, runningSteps: 0, currentNodeId: null, currentNodeName: null, percentage: 100 },
  errorContext: null,
  transactionHashes: [
    {
      hash: "0xd15cc2c844ea4a0dd50e0878d6819dcff116f48e98f7e2489e6d96679fca2e88",
      nodeId: "approve_usdc",
      chainId: 84532,
      gasUsed: "68539",
      nodeName: "Approve USDC",
      verified: true,
      blockNumber: 46458569,
      receiptStatus: "success",
    },
    {
      hash: "0x918441fcd4d2071733afc139ed0b5c29cba34ddeefc2ca1583499b10827c8bac",
      nodeId: "repay",
      chainId: 84532,
      gasUsed: "176139",
      nodeName: "Repay",
      verified: true,
      blockNumber: 46458573,
      receiptStatus: "success",
    },
  ],
};

const REAL_ERROR = {
  status: "error",
  nodeStatuses: [
    { nodeId: "trigger", status: "success" },
    { nodeId: "read_hf", status: "success" },
    { nodeId: "approve_usdc", status: "success" },
    { nodeId: "repay", status: "error" },
  ],
  progress: { totalSteps: 5, completedSteps: 3, runningSteps: 0, currentNodeId: null, currentNodeName: null, percentage: 60 },
  errorContext: { error: "Insufficient BASE balance. Have: 0.0, Need: 0.000000231." },
  transactionHashes: [],
};

describe("parseExecutionSteps (real KeeperHub response shape)", () => {
  it("maps nodeStatuses to UI steps with tx hashes and gas", () => {
    const steps = parseExecutionSteps(REAL_SUCCESS, 1000);
    expect(steps.map((s) => s.stepId)).toEqual(["approve", "repay", "verify"]);
    expect(steps.every((s) => s.status === "success")).toBe(true);
    const approve = steps.find((s) => s.stepId === "approve")!;
    expect(approve.txHash).toBe("0xd15cc2c844ea4a0dd50e0878d6819dcff116f48e98f7e2489e6d96679fca2e88");
    expect(approve.gasUsed).toBe("68539");
    const repay = steps.find((s) => s.stepId === "repay")!;
    expect(repay.gasUsed).toBe("176139");
  });

  it("surfaces failures and the errorContext message", () => {
    const steps = parseExecutionSteps(REAL_ERROR, 1000);
    const repay = steps.find((s) => s.stepId === "repay")!;
    expect(repay.status).toBe("failed");
    expect(repay.error).toContain("Insufficient BASE balance");
    const approve = steps.find((s) => s.stepId === "approve")!;
    expect(approve.status).toBe("success");
    expect(approve.txHash).toBeNull(); // no txs in the error response
  });

  it("ignores nodes that are not UI steps (trigger, read_hf)", () => {
    const steps = parseExecutionSteps(REAL_SUCCESS, 1000);
    expect(steps.some((s) => s.stepId === ("trigger" as never))).toBe(false);
  });

  it("returns empty (not a crash) for an unrecognized shape", () => {
    expect(parseExecutionSteps({}, 1000)).toEqual([]);
  });
});
