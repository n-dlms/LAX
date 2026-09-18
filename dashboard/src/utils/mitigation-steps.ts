// Mitigation step merging — pure logic, kept in a .ts module so the root test
// suite can type-check and exercise it without the dashboard's JSX config.
import type { MitigationStep } from "../types";
import { FORK_GAS_QUEUED } from "./format";

/** The fork-only repair path impersonates an Anvil account, so it only ever
 *  runs against a local node — never a public network. */
export function isLocalRpc(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(:\d+)?/i.test(url);
}

/**
 * @param localInFlight true while the local fork repair is mid-flight. A
 *   relayer-reported step failure (its wallet has no fork gas) must not paint
 *   a step red while the local pipeline is still executing it — the local
 *   outcome is the fork truth and replaces the display when it lands.
 */
export function mergeSteps(
  base: MitigationStep[],
  polled: MitigationStep[] | null,
  localSteps: MitigationStep[] | null,
  executionId: string | null,
  localError: string | null,
  localInFlight = false,
): MitigationStep[] {
  const byId = new Map((polled ?? []).map((step) => [step.stepId, step]));
  const localById = new Map((localSteps ?? []).map((step) => [step.stepId, step]));

  return base.map((step) => {
    if (step.stepId === "start") {
      const hasLocalEvidence = (localSteps ?? []).length > 0;
      // A KeeperHub trigger failure is only a hard failure when there is no
      // local repair to show — on a fork the visible fix is the local one.
      if (localError && !executionId && !hasLocalEvidence) {
        return {
          ...step,
          status: "failed",
          error: localError,
          startedAt: step.startedAt ?? Date.now(),
          finishedAt: Date.now(),
        };
      }
      if (executionId || hasLocalEvidence) {
        return {
          ...step,
          status: "success",
          txHash: null,
          gasUsed: FORK_GAS_QUEUED,
          startedAt: step.startedAt ?? Date.now(),
          finishedAt: step.finishedAt ?? Date.now(),
        };
      }
      return { ...step, status: "running", startedAt: step.startedAt ?? Date.now() };
    }

    const local = localById.get(step.stepId);
    if (local) return local;
    const polledStep = byId.get(step.stepId);
    if (polledStep?.status === "failed" && localInFlight) {
      // Local repair owns this step's verdict while it is mid-flight.
      return { ...step, status: "running", error: null };
    }
    return polledStep ?? step;
  });
}