import { useEffect, useRef, useState } from "react";
import type { MitigationEvent, MitigationStep } from "../types";

function keeperHubApi(path: string): string {
  return import.meta.env.DEV ? `/keeperhub${path}` : `https://app.keeperhub.com${path}`;
}

function parseExecutionSteps(json: Record<string, unknown>, startedAt: number): MitigationStep[] {
  const steps = (json.steps ?? []) as Array<Record<string, unknown>>;
  const out: MitigationStep[] = [];
  const stepIdMap: Record<string, "approve" | "repay" | "verify"> = {
    approve_usdc: "approve",
    repay: "repay",
    verify_hf: "verify",
  };

  for (const s of steps) {
    const nodeId = (s.nodeId ?? s.id ?? "") as string;
    const stepId = stepIdMap[nodeId];
    if (!stepId) continue;

    const output = s.output as Record<string, unknown> | null;
    const rawStatus = (s.status as string) ?? "pending";
    const status: MitigationStep["status"] =
      rawStatus === "success" || rawStatus === "completed"
        ? "success"
        : rawStatus === "error" || rawStatus === "failed"
          ? "failed"
          : rawStatus === "running" || rawStatus === "processing"
            ? "running"
            : "pending";

    out.push({
      stepId,
      label: stepId === "approve" ? "Approve USDC" : stepId === "repay" ? "Repay Aave" : "Verify HF",
      status,
      txHash: ((output?.transactionHash ?? output?.txHash ?? s.transactionHash) as string) ?? null,
      gasUsed: ((output?.gasUsed ?? s.gasUsed) as string) ?? null,
      error: (s.error as string) ?? null,
      retries: ((s.retries ?? s.retryCount ?? 0) as number),
      startedAt: startedAt,
      finishedAt: status === "success" || status === "failed" ? Date.now() : null,
    });
  }
  return out;
}

export interface UseExecutionPollerResult {
  event: MitigationEvent | null;
  error: string | null;
}

// Polls KeeperHub execution status when an execution is active.
// Calls /api/v0/executions/{executionId} via fetch.
export function useExecutionPoller(
  executionId: string | null,
  pollMs: number = 1000,
): UseExecutionPollerResult {
  const [event, setEvent] = useState<MitigationEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!executionId) {
      setEvent(null);
      setError(null);
      return;
    }

    const execId: string = executionId;
    mountedRef.current = true;
    stoppedRef.current = false;
    let cancelled = false;
    const startedAt = Date.now();
    let intervalId: ReturnType<typeof setInterval> | null = null;

    // Emit a "running" event immediately so the UI shows the execution ID
    setEvent({
      executionId: execId,
      triggeredAt: startedAt,
      hfAtTrigger: 0,
      debtBase: 0n,
      exactRepayAmount: 0n,
      steps: [],
      finalHF: null,
      status: "pending",
      failureReason: null,
    });
    setError(null);

    async function pollOnce() {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);

        const resp = await fetch(
          keeperHubApi(`/api/workflows/executions/${execId}/status`),
          { signal: controller.signal },
        );
        clearTimeout(timer);

        if (resp.status === 401 || resp.status === 403) {
          // Status endpoint is session-only; stop polling gracefully
          if (!cancelled && mountedRef.current) {
            stoppedRef.current = true;
            if (intervalId) clearInterval(intervalId);
          }
          return;
        }
        if (!resp.ok) {
          throw new Error(`KeeperHub ${resp.status}: ${await resp.text()}`);
        }

        const json = (await resp.json()) as Record<string, unknown>;
        const status = (json.status as string) ?? "running";
        const steps = parseExecutionSteps(json, startedAt);
        const rawFinalHF = json.finalHealthFactor;
        const finalHF = typeof rawFinalHF === "number"
          ? rawFinalHF
          : typeof rawFinalHF === "string"
            ? Number(rawFinalHF)
            : null;

        let mitigationStatus: MitigationEvent["status"] = "pending";
        if (status === "success") mitigationStatus = "resolved";
        else if (status === "error" || status === "failed") mitigationStatus = "failed";
        else if (steps.some((s) => s.stepId === "repay" && s.status === "success")) mitigationStatus = "repaying";
        else if (steps.some((s) => s.stepId === "approve" && s.status === "success")) mitigationStatus = "approving";

        const ev: MitigationEvent = {
          executionId: execId,
          triggeredAt: startedAt,
          hfAtTrigger: 0,
          debtBase: 0n,
          exactRepayAmount: 0n,
          steps,
          finalHF,
          status: mitigationStatus,
          failureReason: (json.error as string) ?? null,
        };

        if (!cancelled && mountedRef.current) {
          setEvent(ev);
          setError(null);
        }

        if (status === "success" || status === "error" || status === "failed") {
          if (intervalId) clearInterval(intervalId);
        }
      } catch (err) {
        if (!cancelled && mountedRef.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    if (!stoppedRef.current) {
      intervalId = setInterval(pollOnce, pollMs);
    }

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [executionId, pollMs]);

  return { event, error };
}
