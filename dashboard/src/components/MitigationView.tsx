import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import type { MitigationEvent, MitigationStep } from "../types";
import { LAX_CONFIG } from "../types";
import { useExecutionPoller } from "../hooks/useExecutionPoller";
import { rpcRequest } from "../utils/rpc";
import { fmtTime, fmtDuration, fmtUSDC, statusIcon, statusColor, encodeAddress, encodeUint, FORK_GAS_NOTE } from "../utils/format";
import { isLocalRpc, mergeSteps } from "../utils/mitigation-steps";
import { POLL_INTERVAL_MS, encodeGetUserAccountData, decodeUint256Array } from "../hooks/usePositionPoller";

function keeperHubApi(path: string): string {
  return import.meta.env.DEV ? `/keeperhub${path}` : `https://app.keeperhub.com${path}`;
}

function makeInitialSteps(): MitigationStep[] {
  const ids: MitigationStep["stepId"][] = ["start", "approve", "repay", "verify"];
  const labels: Record<string, string> = {
    start: "Start KeeperHub Run",
    approve: "Approve USDC",
    repay: "Repay Aave",
    verify: "Verify HF",
  };
  return ids.map((id) => ({
    stepId: id,
    label: labels[id],
    status: "pending" as const,
    txHash: null,
    gasUsed: null,
    error: null,
    retries: 0,
    startedAt: null,
    finishedAt: null,
  }));
}

// ---- Step Card ----
function StepCard({
  step,
  active,
  index,
}: {
  step: MitigationStep;
  active: boolean;
  index: number;
}) {
  const isActive = active && step.status === "pending";
  const staggerDelay = `${index * 0.12}s`;
  return (
    <div
      className={`border p-4 transition-all duration-500 animate-slide-up ${
        step.status === "success"
          ? "border-green"
          : step.status === "failed"
            ? "border-red"
            : isActive
              ? "border-cyan"
              : "border-bordercol"
      } ${step.status === "running" ? "bg-green/5" : "bg-surface"}`}
      style={{ animationDelay: staggerDelay }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold font-projector-body ${statusColor(step.status)}`}>
            {statusIcon(step.status)}
          </span>
          <span className="text-sm text-primary font-bold">{step.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {step.retries > 0 && (
            <span className="text-xs text-yellow border border-yellow/30 px-1">retry #{step.retries}</span>
          )}
          {step.startedAt && (
            <span className="text-xs text-secondary">{fmtDuration(step.startedAt, step.finishedAt)}</span>
          )}
        </div>
      </div>

      {step.status === "running" && (
        <div className="text-xs text-cyan heartbeat-pulse flex items-center gap-2">
          <span className="w-2 h-2 bg-cyan rounded-full inline-block animate-ping" />
          Executing...
        </div>
      )}

      {step.txHash && (
        <div className="text-xs text-secondary font-mono break-all">
          tx:{" "}
          <a
            href={LAX_CONFIG.TX_EXPLORER_URL(step.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan underline hover:text-green transition-colors"
          >
            {step.txHash.slice(0, 10)}...{step.txHash.slice(-6)}
          </a>
        </div>
      )}

      {step.gasUsed && (
        <div className="text-xs text-secondary">
          gas: {step.gasUsed.includes(FORK_GAS_NOTE) ? step.gasUsed : `${step.gasUsed} (${FORK_GAS_NOTE})`}
        </div>
      )}

      {step.error && (
        <div className="text-xs text-red mt-1 bg-red/5 p-1 border border-red/20 break-words">
          Error: {step.error}
        </div>
      )}

      <div className="text-xs text-secondary mt-1">
        {step.startedAt && `Started: ${fmtTime(step.startedAt)}`}
        {step.finishedAt && ` · Finished: ${fmtTime(step.finishedAt)}`}
      </div>
    </div>
  );
}

// ---- Separator ----
function StepSeparator({ status, index }: { status: MitigationStep["status"]; index: number }) {
  const color = status === "success" ? "bg-green" : status === "failed" ? "bg-red" : "bg-bordercol";
  const staggerDelay = `${index * 0.12 + 0.06}s`;
  return (
    <div className="flex justify-center py-1 animate-fade-in" style={{ animationDelay: staggerDelay }}>
      <div className={`w-0.5 h-6 transition-colors duration-500 ${color}`} />
    </div>
  );
}

// ---- Elapsed Timer ----
function ElapsedTimer({ startAt }: { startAt: number }) {
  const [elapsed, setElapsed] = useState("0.0s");
  useEffect(() => {
    const id = setInterval(() => {
      const ms = Date.now() - startAt;
      setElapsed(ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);
    }, 100);
    return () => clearInterval(id);
  }, [startAt]);
  return <span className="text-xs text-secondary">{elapsed}</span>;
}

// ---- Position Snapshot Strip (P2-3) ----
function PositionSnapshotStrip({ hfAtTrigger, borrowerAddress, rpcUrl }: { hfAtTrigger: number; borrowerAddress: string; rpcUrl: string }) {
  const [snapshot, setSnapshot] = useState<{ hf: number; collateral: bigint; debt: bigint } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchSnapshot() {
      try {
        const data = encodeGetUserAccountData(borrowerAddress);
        const hex = await rpcRequest<string>("eth_call", [{ to: LAX_CONFIG.AAVE_POOL, data }, "latest"], rpcUrl);
        const fields = decodeUint256Array(hex, 6);
        const hfRaw = fields[5];
        const hf = hfRaw >= (BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639935") / 2n) ? Infinity : Number(hfRaw) / 1e18;
        if (!cancelled) setSnapshot({ hf, collateral: fields[0], debt: fields[1] });
      } catch {
        // ignore snapshot errors while mitigating
      }
    }
    fetchSnapshot();
    const id = setInterval(fetchSnapshot, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [borrowerAddress, rpcUrl]);

  const currentHfStr = snapshot ? (snapshot.hf === Infinity ? "∞" : snapshot.hf.toFixed(4)) : "…";
  const delta = snapshot && snapshot.hf !== Infinity ? (snapshot.hf - hfAtTrigger).toFixed(4) : null;
  const fmtDollars = (val: bigint) => {
    const n = Number(val) / 1e8;
    if (n >= 1000) return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return "$" + n.toFixed(2);
  };

  return (
    <div className="border border-cyan/30 bg-surface p-3 flex flex-wrap gap-4 items-center text-xs animate-slide-up">
      <span className="text-secondary">HF at trigger: <span className="text-primary font-bold">{hfAtTrigger.toFixed(4)}</span></span>
      <span className="text-secondary">→ Current: <span className={`font-bold ${snapshot && snapshot.hf < LAX_CONFIG.HF_TARGET ? "text-red" : "text-green"}`}>{currentHfStr}</span>{delta && <span className="text-secondary"> ({Number(delta) >= 0 ? "+" : ""}{delta})</span>}</span>
      {snapshot && (
        <>
          <span className="text-secondary">Collateral: <span className="text-primary">{fmtDollars(snapshot.collateral)}</span></span>
          <span className="text-secondary">Debt: <span className="text-primary">{fmtDollars(snapshot.debt)}</span></span>
        </>
      )}
      {!snapshot && <span className="text-secondary heartbeat-pulse">Fetching live position…</span>}
    </div>
  );
}

// ---- Main Component ----
interface MitigationViewProps {
  event: MitigationEvent;
  onComplete: (ev: MitigationEvent) => void;
  onBack: () => void;
}

export default function MitigationView({ event, onComplete, onBack }: MitigationViewProps) {
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [webhookNote, setWebhookNote] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSteps, setLocalSteps] = useState<MitigationStep[] | null>(null);
  const [localInFlight, setLocalInFlight] = useState(false);
  const localFinalRef = useRef<MitigationEvent | null>(null);
  const localDoneRef = useRef(false);
  const localRunTokenRef = useRef<number | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const borrowerAddress = event.borrowerAddress ?? LAX_CONFIG.BORROWER_ADDRESS;
  const rpcUrl = event.rpcUrl ?? LAX_CONFIG.FORK_RPC;
  const startedAt = useRef(Date.now());
  const localStepsRef = useRef<MitigationStep[] | null>(null);
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    localStepsRef.current = localSteps;
  }, [localSteps]);

  const { event: polledEvent, error: pollError } = useExecutionPoller(executionId);

  const displaySteps = useMemo(() => {
    return mergeSteps(makeInitialSteps(), polledEvent?.steps ?? null, localSteps, executionId, localError, localInFlight);
  }, [executionId, localError, localSteps, localInFlight, polledEvent]);

  const triggerWorkflow = useCallback(async () => {
    try {
      // M4: try edge proxy first (holds API key server-side), fallback to direct key.
      // The webhook endpoint requires the wfb_* webhook key — the kh_* org key is
      // rejected (wrong_key_type). Same preference order as src/keeperhub.ts.
      const proxyUrl = `/api/keeperhub-proxy/workflows/${LAX_CONFIG.WORKFLOW_ID}/webhook`;
      const apiKey = import.meta.env.VITE_KEEPERHUB_WEBHOOK_KEY ?? import.meta.env.VITE_KEEPERHUB_API_KEY ?? "";
      const useProxy = !apiKey; // if no VITE key, try proxy
      let resp: Response;
      const payload = {
        health_factor: event.hfAtTrigger.toFixed(6),
        user_address: borrowerAddress,
        triggered_at: new Date(event.triggeredAt).toISOString(),
        debt_base: event.debtBase.toString(),
        repay_amount_usdc: event.exactRepayAmount.toString(),
        repay_amount_human: fmtUSDC(event.exactRepayAmount),
        source: "lax-dashboard-button",
        rpc_url: rpcUrl,
        triggered_by: borrowerAddress,
        hf_trigger: LAX_CONFIG.HF_TRIGGER,
        hf_target: LAX_CONFIG.HF_TARGET,
        session_id: `${borrowerAddress.slice(0,6)}-${Date.now()}`,
      };
      if (useProxy) {
        resp = await fetch(proxyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        // fallback to direct if proxy 404 (not deployed yet)
        if (resp.status === 404 && apiKey) {
          resp = await fetch(keeperHubApi(`/api/workflows/${LAX_CONFIG.WORKFLOW_ID}/webhook`), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(payload),
          });
        }
      } else {
        if (!apiKey) throw new Error("VITE_KEEPERHUB_API_KEY is not configured");
        resp = await fetch(keeperHubApi(`/api/workflows/${LAX_CONFIG.WORKFLOW_ID}/webhook`), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
        });
      }
      if (!resp.ok) {
        throw new Error(`Failed to trigger: ${resp.status} ${await resp.text()}`);
      }
      const json = (await resp.json()) as { executionId?: string; id?: string };
      const id = json.executionId ?? json.id ?? "";
      if (!id) throw new Error("No executionId in response");
      setExecutionId(id);
      setWebhookNote(null);
    } catch (err) {
      // Non-blocking: the KeeperHub run is the audit trail, the local fork
      // repair below is the visible mitigation. A missing key or an
      // undeployed edge proxy must not blank the dashboard.
      setWebhookNote(err instanceof Error ? err.message : String(err));
    }
  }, [event, borrowerAddress, rpcUrl]);

  // Trigger KeeperHub workflow on mount - only once
  useEffect(() => {
    if (!hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      triggerWorkflow();
    }
  }, [triggerWorkflow]);

  // Local Anvil execution steps — the visible repair. Runs for a local RPC
  // independently of the KeeperHub trigger: if the webhook is unavailable (no
  // key, undeployed edge proxy) or the relayer can't reach the fork, the user
  // still watches approve → repay → verify complete on-chain here.
  // Deps are intentionally narrowed to rpcUrl + retryNonce: the trigger event
  // object is rebuilt on every position poll and the KeeperHub execution id
  // arrives mid-repair — either re-running this effect would cancel the
  // in-flight repay (approve lands, repay never does) and the token guard
  // below would block the restart. Retry is the only legitimate restart.
  useEffect(() => {
    if (!isLocalRpc(rpcUrl)) return;
    // Run at most once per attempt — the effect re-runs when the KeeperHub
    // execution id arrives, which would otherwise double-fire the repay.
    if (localRunTokenRef.current === retryNonce) return;
    localRunTokenRef.current = retryNonce;
    let cancelled = false;

    async function executeLocal() {
      setLocalInFlight(true);
      const borrowAddr = borrowerAddress;
      const poolAddr = LAX_CONFIG.AAVE_POOL;
      const usdcAddr = LAX_CONFIG.USDC;
      const repayAmount = event.exactRepayAmount;

      let currentStepId: MitigationStep["stepId"] = "approve";
      const stepsAcc: MitigationStep[] = [];

      try {
        // --- Step 2: Approve USDC for Aave Pool ---
        currentStepId = "approve";
        await rpcRequest("anvil_impersonateAccount", [borrowAddr], rpcUrl);

        const approveData = "0x095ea7b3" +
          encodeAddress(poolAddr) +
          encodeUint(repayAmount);

        const approveTx = await rpcRequest<string>("eth_sendTransaction", [{
          from: borrowAddr,
          to: usdcAddr,
          data: approveData,
          gas: "0x100000",
        }], rpcUrl);

        await rpcRequest("anvil_stopImpersonatingAccount", [borrowAddr], rpcUrl);

        if (cancelled) return;
        const approveStep: MitigationStep = {
          stepId: "approve",
          label: "Approve USDC",
          status: "success",
          txHash: approveTx,
          gasUsed: null,
          error: null,
          retries: 0,
          startedAt: Date.now(),
          finishedAt: Date.now(),
        };
        stepsAcc.push(approveStep);
        setLocalSteps([...stepsAcc]);
        localStepsRef.current = [...stepsAcc];

        // --- Step 3: Repay Aave (variable rate mode 2) ---
        currentStepId = "repay";
        await rpcRequest("anvil_impersonateAccount", [borrowAddr], rpcUrl);

        const repayData = "0x573ade81" +
          encodeAddress(usdcAddr) +
          encodeUint(repayAmount) +
          encodeUint(2n) +
          encodeAddress(borrowAddr);

        const repayTx = await rpcRequest<string>("eth_sendTransaction", [{
          from: borrowAddr,
          to: poolAddr,
          data: repayData,
          gas: "0x300000",
        }], rpcUrl);

        await rpcRequest("anvil_stopImpersonatingAccount", [borrowAddr], rpcUrl);

        if (cancelled) return;
        const repayStep: MitigationStep = {
          stepId: "repay",
          label: "Repay Aave",
          status: "success",
          txHash: repayTx,
          gasUsed: null,
          error: null,
          retries: 0,
          startedAt: Date.now(),
          finishedAt: Date.now(),
        };
        stepsAcc.push(repayStep);
        setLocalSteps([...stepsAcc]);
        localStepsRef.current = [...stepsAcc];

        // --- Step 4: Verify HF improved ---
        currentStepId = "verify";
        await new Promise((r) => setTimeout(r, 2000));

        // A read immediately after the repay tx can race block settlement and
        // return a transient 0 — retry before declaring the verify failed.
        let newHf = 0;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (cancelled) return;
          const accountData = await rpcRequest<string>("eth_call", [{
            to: poolAddr,
            data: "0xbf92857c" + encodeAddress(borrowAddr),
          }, "latest"], rpcUrl);
          newHf = Number(BigInt("0x" + accountData.slice(2 + 32 * 5, 2 + 32 * 6))) / 1e18;
          if (newHf > 0) break;
          await new Promise((r) => setTimeout(r, 1500));
        }
        const hfOk = newHf >= LAX_CONFIG.HF_TARGET;

        if (cancelled) return;
        const verifyStep: MitigationStep = {
          stepId: "verify",
          label: "Verify HF",
          status: hfOk ? "success" : "failed",
          txHash: null,
          gasUsed: null,
          error: hfOk ? null : `HF ${newHf.toFixed(4)} below target ${LAX_CONFIG.HF_TARGET}`,
          retries: 0,
          startedAt: Date.now(),
          finishedAt: Date.now(),
        };
        stepsAcc.push(verifyStep);
        setLocalSteps([...stepsAcc]);
        localStepsRef.current = [...stepsAcc];

        if (hfOk) {
          const finalEv: MitigationEvent = {
            ...event,
            executionId: executionId ?? "",
            steps: [...stepsAcc],
            finalHF: newHf,
            status: "resolved",
            failureReason: null,
          };
          localFinalRef.current = finalEv;
          setTimeout(() => { if (!cancelled) onComplete(finalEv); }, 1500);
        } else {
          setLocalError(verifyStep.error);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        const failedStep: MitigationStep = {
          stepId: currentStepId,
          label: currentStepId === "approve" ? "Approve USDC" : currentStepId === "repay" ? "Repay Aave" : "Verify HF",
          status: "failed",
          txHash: null,
          gasUsed: null,
          error: msg,
          retries: 0,
          startedAt: Date.now(),
          finishedAt: Date.now(),
        };
        const merged = [...stepsAcc, failedStep];
        setLocalSteps(merged);
        localStepsRef.current = merged;
        setLocalError(msg);
      }
    }

    executeLocal().finally(() => {
      localDoneRef.current = true;
      setLocalInFlight(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- narrow deps by design; see comment above
  }, [rpcUrl, retryNonce]);

  // Monitor completion via KeeperHub polling - merge steps
  useEffect(() => {
    if (polledEvent && (polledEvent.status === "resolved" || polledEvent.status === "failed")) {
      // The relayer can report "failed" while the local fork repair is still
      // running (it executes on the real network, the fork locally). Wait for
      // the local path to finish before letting a remote failure decide.
      if (polledEvent.status === "failed" && !localDoneRef.current) return;
      const timeout = setTimeout(() => {
        const local = localStepsRef.current;
        const localFinal = localFinalRef.current;
        let mergedSteps: MitigationStep[] = [];
        if (polledEvent.steps.length > 0 && (!local || local.length === 0)) {
          mergedSteps = polledEvent.steps;
        } else if (local && local.length > 0 && polledEvent.steps.length === 0) {
          mergedSteps = local;
        } else if (local && local.length > 0 && polledEvent.steps.length > 0) {
          // merge both, prefer local successes
          const byId = new Map(polledEvent.steps.map(s => [s.stepId, s] as const));
          for (const ls of local) {
            const existing = byId.get(ls.stepId);
            if (!existing || ls.status === "success" || existing.status !== "success") {
              byId.set(ls.stepId, ls);
            }
          }
          mergedSteps = Array.from(byId.values());
        } else {
          mergedSteps = [];
        }
        const localArr = local ?? [];
        const localAllSuccess = localFinal?.status === "resolved"
          || (localFinal === null && localArr.length > 0 && localArr.every((s) => s.status === "success"));
        // Fork evidence wins: the relayer's "failed" cannot override a local
        // on-chain success, and the locally read final HF is the real one.
        const finalStatus = localAllSuccess ? "resolved" : polledEvent.status;
        onComplete({
          ...event,
          ...polledEvent,
          triggeredAt: event.triggeredAt,
          hfAtTrigger: event.hfAtTrigger,
          debtBase: event.debtBase,
          exactRepayAmount: event.exactRepayAmount,
          status: finalStatus,
          steps: mergedSteps.length > 0 ? mergedSteps : (local ?? []),
          finalHF: localFinal?.finalHF ?? polledEvent.finalHF ?? event.finalHF,
          failureReason: finalStatus === "resolved" ? null : (polledEvent.failureReason ?? null),
        });
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [event, polledEvent, onComplete, localSteps]);

  const handleRetry = useCallback(() => {
    setLocalError(null);
    setLocalSteps(null);
    localStepsRef.current = null;
    localFinalRef.current = null;
    localDoneRef.current = false;
    if (!executionId) {
      // No execution id: re-fire the webhook trigger (direct call), and the
      // nonce bump below restarts the local repair in every case.
      hasTriggeredRef.current = true;
      triggerWorkflow();
    }
    setRetryNonce((n) => n + 1);
  }, [executionId, triggerWorkflow]);

  const currentHf = polledEvent?.finalHF ?? event.hfAtTrigger;
  const displayError = localError ?? pollError;
  const allSuccess = displaySteps.length > 0 && displaySteps.every((s) => s.status === "success");
  const anyFailed = displaySteps.some((s) => s.status === "failed");

  return (
    <div className="flex flex-col gap-4 p-6 max-w-3xl mx-auto w-full min-h-screen animate-fade-in relative">
      {/* Fixed back button */}
      <button
        onClick={onBack}
        className="fixed top-2 left-2 z-50 text-xs text-secondary hover:text-cyan transition-colors bg-surface/80 px-2 py-1 rounded border border-bordercol"
        title="Back to dashboard"
      >
        ← Back
      </button>
      {/* Header */}
      <div className="border-b border-bordercol pb-4 animate-slide-up">
        <div className="font-projector-title text-amber tracking-widest flex items-center gap-3 pl-14">
          MITIGATING
          {!allSuccess && !anyFailed && (
            <span className="w-3 h-3 border-2 border-amber border-t-transparent rounded-full animate-spin inline-block" />
          )}
          {anyFailed && <span className="text-red text-sm">[ !! ] Mitigation Failed</span>}
        </div>
        <div className="text-xs text-secondary mt-1 flex items-center gap-3">
          <span>HF at trigger: {event.hfAtTrigger.toFixed(4)}</span>
          <span>·</span>
          <span>
            Execution: {executionId ? executionId.slice(0, 12) + "..." : isLocalRpc(rpcUrl) ? "fork-local" : "pending"}
          </span>
          <span>·</span>
          <ElapsedTimer startAt={startedAt.current} />
        </div>
      </div>

      {/* Position snapshot strip - P2-3 */}
      <PositionSnapshotStrip hfAtTrigger={event.hfAtTrigger} borrowerAddress={borrowerAddress} rpcUrl={rpcUrl} />

      {/* Error banner */}
      {displayError && (
        <div className="bg-red/10 border border-red p-2 text-xs text-red animate-slide-up break-words">
          {displayError}
        </div>
      )}

      {/* KeeperHub trigger note — informational; the local repair still runs */}
      {webhookNote && !displayError && (
        <div className="bg-yellow/10 border border-yellow p-2 text-xs text-yellow animate-slide-up break-words">
          KeeperHub run unavailable ({webhookNote}) — repairing this position on the fork.
          Add <span className="font-mono">VITE_KEEPERHUB_WEBHOOK_KEY</span> for the audit trail.
        </div>
      )}

      {/* Current HF */}
      {currentHf > 0 && (
        <div className="text-center py-4 animate-scale-in">
          <span className="text-sm text-secondary">Current HF </span>
          <span className={`font-projector-value ${allSuccess ? "text-green" : anyFailed ? "text-red" : "text-cyan"}`}>
            {currentHf.toFixed(4)}
          </span>
        </div>
      )}

      {/* Pipeline Steps */}
      <div className="flex flex-col gap-0">
        {displaySteps.map((step, i) => (
          <div key={step.stepId}>
            <StepCard
              step={step}
              active={i === displaySteps.findIndex((s) => s.status === "pending")}
              index={i}
            />
            {i < displaySteps.length - 1 && (
              <StepSeparator status={step.status} index={i} />
            )}
          </div>
        ))}
      </div>

      {/* Retry button - P0-1 */}
      {anyFailed && (
        <div className="flex justify-center mt-2 animate-slide-up">
          <button
            type="button"
            onClick={handleRetry}
            className="border border-yellow text-yellow bg-yellow/10 hover:bg-yellow hover:text-bgcol px-6 py-2 text-sm font-bold transition-colors"
          >
            Retry Mitigation
          </button>
        </div>
      )}

      {/* Status text */}
      <div className="text-center text-xs text-secondary mt-2 animate-fade-in">
        {allSuccess
          ? "All steps completed. Proceeding to audit..."
          : anyFailed
            ? "A step failed. Check details above or retry."
            : "Executing mitigation pipeline..."}
      </div>

      {/* Spinner or success check */}
      {allSuccess && (
        <div className="flex justify-center animate-scale-in">
          <span className="text-2xl text-green">[ OK ] Position Secured</span>
        </div>
      )}
      {anyFailed && (
        <div className="flex justify-center animate-scale-in">
          <span className="text-2xl text-red">[ !! ] Mitigation Failed</span>
        </div>
      )}
    </div>
  );
}
