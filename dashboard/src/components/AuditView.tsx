import type { MitigationEvent, MitigationStep } from "../types";
import { LAX_CONFIG } from "../types";
import { fmtDate, fmtDurationFromSteps, statusIcon, statusColor } from "../utils/format";

function firstTxHash(steps: MitigationStep[]): string | null {
  return steps.find((step) => step.txHash)?.txHash ?? null;
}

/** Local-fork txs exist only on the local chain — no public explorer has them. */
function isForkRpc(rpcUrl?: string): boolean {
  const url = rpcUrl ?? "http://127.0.0.1:18545";
  return /localhost|127\.0\.0\.1/.test(url);
}

// ---- Step Row ----
function StepRow({ step }: { step: MitigationStep }) {
  return (
    <tr className="border-b border-bordercol">
      <td className="py-2 px-3 text-xs text-primary">{step.label}</td>
      <td className={`py-2 px-3 text-xs ${statusColor(step.status)}`}>
        {statusIcon(step.status)} {step.status.toUpperCase()}
      </td>
      <td className="py-2 px-3 text-xs text-secondary font-mono">
        {step.txHash ? (
          <a
            href={LAX_CONFIG.TX_EXPLORER_URL(step.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan underline hover:text-green transition-colors"
          >
            {step.txHash.slice(0, 10)}...{step.txHash.slice(-6)}
          </a>
        ) : (
          "--"
        )}
      </td>
      <td className="py-2 px-3 text-xs text-secondary">
        {step.gasUsed ?? "--"}
      </td>
      <td className="py-2 px-3 text-xs text-secondary">
        {step.retries > 0 ? step.retries : "--"}
      </td>
      <td className="py-2 px-3 text-xs text-secondary">
        {step.error ? (
          <span className="text-red break-words" title={step.error}>
            {step.error.length > 80
              ? step.error.slice(0, 80) + "..."
              : step.error}
          </span>
        ) : (
          "--"
        )}
      </td>
    </tr>
  );
}

// ---- Summary Card ----
function SummaryCard({
  label,
  value,
  color = "text-primary",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-surface border border-bordercol p-3 sm:p-4 flex-1 min-w-0 basis-[120px] sm:basis-[140px] text-center animate-scale-in overflow-hidden">
      <div className="text-xs text-secondary mb-1 truncate">{label}</div>
      <div className={`font-projector-value-sm leading-none ${color} truncate overflow-hidden min-w-0`}>{value}</div>
    </div>
  );
}

// ---- Main Component ----
interface AuditViewProps {
  event: MitigationEvent;
  onReset: () => void;
}

export default function AuditView({ event, onReset }: AuditViewProps) {
  const allSuccess = event.steps.length > 0 && event.steps.every((s) => s.status === "success");
  const hasSteps = event.steps.length > 0;
  const anyPending = event.steps.some((s) => s.status === "pending" || s.status === "running");
  const finalHf = event.finalHF ?? 0;
  const hfRestored = finalHf >= LAX_CONFIG.HF_TARGET;
  const totalRetries = event.steps.reduce((acc, s) => acc + s.retries, 0);
  const txHash = firstTxHash(event.steps);

  let headerText = "MITIGATION FAILED";
  let headerColor = "text-red";
  let outcomeText = "FAILED";
  let outcomeColor = "text-red";
  if (!hasSteps || anyPending) {
    headerText = "MITIGATION INCOMPLETE";
    headerColor = "text-yellow";
    outcomeText = "INCOMPLETE";
    outcomeColor = "text-yellow";
  } else if (allSuccess) {
    headerText = "POSITION SECURED";
    headerColor = "text-green";
    outcomeText = "SAFE";
    outcomeColor = "text-green";
  }

  return (
    <div className="flex flex-col gap-4 p-6 max-w-4xl mx-auto w-full min-h-screen animate-fade-in">
      {/* Header */}
      <div className="border-b border-bordercol pb-4 animate-slide-up">
        <div
          className={`font-projector-title tracking-widest ${headerColor}`}
        >
          {headerText}
        </div>
        <div className="text-xs text-secondary mt-1">
          {fmtDate(event.triggeredAt)} · Execution ID: {event.executionId.slice(0, 16)}...
        </div>
      </div>

      {/* Outcome summary cards */}
      <div className="flex gap-4 flex-wrap">
        <SummaryCard
          label="HF at Trigger"
          value={event.hfAtTrigger.toFixed(4)}
          color="text-yellow"
        />
        <SummaryCard
          label="HF After Mitigation"
          value={finalHf > 0 ? finalHf.toFixed(4) : "--"}
          color={hfRestored ? "text-green" : "text-red"}
        />
        <SummaryCard
          label="Total Time"
          value={fmtDurationFromSteps(event.triggeredAt, event.steps)}
        />
        <SummaryCard
          label="Retries"
          value={totalRetries > 0 ? String(totalRetries) : "0"}
          color={totalRetries > 0 ? "text-yellow" : "text-green"}
        />
        <SummaryCard
          label="Outcome"
          value={outcomeText}
          color={outcomeColor}
        />
      </div>

      {/* Degraded notice when no steps */}
      {!hasSteps && (
        <div className="bg-yellow/10 border border-yellow p-3 text-xs text-yellow animate-slide-up">
          No step evidence available — run appears incomplete. Check KeeperHub for details.
        </div>
      )}
      {hasSteps && anyPending && !allSuccess && (
        <div className="bg-yellow/10 border border-yellow p-3 text-xs text-yellow animate-slide-up">
          Some steps are still pending — mitigation may still be in progress.
        </div>
      )}

      {/* Step Detail Table */}
      <div className="bg-surface border border-bordercol p-4 animate-slide-up animate-stagger-1">
        <div className="text-sm text-secondary mb-2">Execution Steps</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-bordercol text-xs text-secondary">
                <th className="py-2 px-3 font-medium">Step</th>
                <th className="py-2 px-3 font-medium">Status</th>
                <th className="py-2 px-3 font-medium">Tx Hash</th>
                <th className="py-2 px-3 font-medium">Gas Used</th>
                <th className="py-2 px-3 font-medium">Retries</th>
                <th className="py-2 px-3 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {event.steps.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-xs text-secondary">
                    No step data available.
                  </td>
                </tr>
              )}
              {event.steps.map((step) => (
                <StepRow key={step.stepId} step={step} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Submission proof */}
      <div className="bg-surface border border-bordercol p-4 animate-slide-up animate-stagger-2">
        <div className="text-sm text-secondary mb-3">Submission Proof</div>
        <div className="grid md:grid-cols-2 gap-3">
          <a
            href={LAX_CONFIG.KEEPERHUB_WORKFLOW_URL(LAX_CONFIG.WORKFLOW_ID)}
            target="_blank"
            rel="noopener noreferrer"
            title="Opens the workflow's runs page on KeeperHub — the execution ID below is listed there"
            className="border border-bordercol p-3 hover:border-cyan transition-colors"
          >
            <div className="text-[10px] text-secondary uppercase">KeeperHub Audit Trail</div>
            <div className="text-xs text-cyan mt-1 font-mono break-all">
              {event.executionId || "pending"}
            </div>
            <div className="text-[10px] text-secondary mt-1">view on the workflow's runs page ↗</div>
          </a>
          {txHash ? (
            isForkRpc(event.rpcUrl) ? (
              // Local-fork txs only exist on the local chain — no explorer has
              // them, so rendering a basescan link would just 404 the user
              <div className="border border-bordercol p-3">
                <div className="text-[10px] text-secondary uppercase">On-chain Transaction (local fork)</div>
                <div className="text-xs text-cyan mt-1 font-mono break-all">{txHash}</div>
                <div className="text-[10px] text-secondary mt-1">
                  fork-local — verify with <span className="font-mono">lax tx {txHash.slice(0, 10)}…</span>
                </div>
              </div>
            ) : (
              <a
                href={LAX_CONFIG.TX_EXPLORER_URL(txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-bordercol p-3 hover:border-cyan transition-colors"
              >
                <div className="text-[10px] text-secondary uppercase">On-chain Transaction</div>
                <div className="text-xs text-cyan mt-1 font-mono break-all">
                  {txHash}
                </div>
              </a>
            )
          ) : (
            <div className="border border-bordercol p-3">
              <div className="text-[10px] text-secondary uppercase">On-chain Transaction</div>
              <div className="text-xs text-secondary mt-1">Waiting for submitted tx hash</div>
            </div>
          )}
        </div>
      </div>

      {/* Failure reason */}
      {event.failureReason && (
        <div className="bg-red/10 border border-red p-3 text-xs text-red animate-slide-up break-words">
          <span className="font-bold">Failure Reason:</span> {event.failureReason}
        </div>
      )}

      {/* Reset / Return */}
      <div className="flex justify-center mt-4 animate-fade-in">
        <button
          onClick={onReset}
          className="border border-bordercol px-6 py-2 text-xs text-primary hover:border-green hover:text-green transition-colors bg-surface cursor-pointer"
        >
          Back to Monitor
        </button>
      </div>
    </div>
  );
}
