import { useEffect, useRef, useState } from "react";
import type { MitigationEvent, MitigationStep } from "../types";

/** Vite env access that also typechecks outside the dashboard (root tsc has no
 *  vite/client types) — returns {} in plain tsc/node contexts. */
function viteEnv(): Record<string, string | boolean | undefined> {
  return (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env ?? {};
}

function keeperHubApi(path: string): string {
  return viteEnv().DEV ? `/keeperhub${path}` : `https://app.keeperhub.com${path}`;
}

/** The execution-status endpoint requires an Authorization header — without it
 *  the API answers 404 "Execution not found" even for real executions. The
 *  org key (kh_*) is accepted for reads; the webhook key works as fallback. */
function keeperHubAuthHeaders(): Record<string, string> {
  const key = (viteEnv().VITE_KEEPERHUB_API_KEY ?? viteEnv().VITE_KEEPERHUB_WEBHOOK_KEY ?? "") as string;
  return key ? { Authorization: `Bearer ${key}` } : {};
}

interface NodeStatus {
  nodeId: string;
  status: string;
}

interface ChainTx {
  hash: string;
  nodeId: string;
  gasUsed?: string;
}

/** Parse the real workflow-status response shape:
 *  { status, nodeStatuses: [{nodeId, status}], progress, errorContext,
 *    transactionHashes: [{hash, nodeId, gasUsed, ...}] } */
export function parseExecutionSteps(json: Record<string, unknown>, startedAt: number): MitigationStep[] {
  const nodes = (json.nodeStatuses ?? []) as NodeStatus[];
  const txs = (json.transactionHashes ?? []) as ChainTx[];
  const stepIdMap: Record<string, "approve" | "repay" | "verify"> = {
    approve_usdc: "approve",
    repay: "repay",
    verify_hf: "verify",
  };

  const out: MitigationStep[] = [];
  for (const s of nodes) {
    const stepId = stepIdMap[s.nodeId];
    if (!stepId) continue;

    const tx = txs.find((t) => t.nodeId === s.nodeId);
    const rawStatus = s.status ?? "pending";
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
      txHash: tx?.hash ?? null,
      gasUsed: tx?.gasUsed ?? null,
      // errorContext is workflow-global — only meaningful on the failed step;
      // showing it on successful steps reads as a contradiction
      error: status === "failed" ? ((json.errorContext as { error?: string } | null)?.error ?? null) : null,
      retries: 0,
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
          { signal: controller.signal, headers: keeperHubAuthHeaders() },
        );
        clearTimeout(timer);

        if (resp.status === 401 || resp.status === 403) {
          // No usable key configured — stop polling gracefully
          if (!cancelled && mountedRef.current) {
            stoppedRef.current = true;
            if (intervalId) clearInterval(intervalId);
          }
          return;
        }
        if (resp.status === 404) {
          // Not indexed yet (fire just happened) or not visible without auth —
          // keep polling either way
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
          failureReason: (json.errorContext as { error?: string } | null)?.error ?? (json.error as string) ?? null,
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
