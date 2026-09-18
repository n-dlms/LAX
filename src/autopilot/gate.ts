// Mitigation gate — four stages must pass before any transaction.
import { runCritique, type CritiqueReport } from "../critique-agent";
import { checkSafety } from "../safety-plugin/guardrails";
import { getWalletAddress } from "../wallet";

export interface GateInput {
  totalDebtBase: bigint;
  currentHf: bigint;
  targetHf: bigint;
  /** USDC amount, 6 decimals */
  repayAmount: bigint;
  borrowerAddress: string;
  /** executing wallet — defaults to the resolved agentic wallet (env/wallet.json) */
  walletAddress?: string;
  poolAddress: string;
  repayToken: string;
  rpcUrl: string;
}

export interface GateStage {
  name: string;
  passed: boolean;
  detail: string;
  durationMs: number;
}

export interface GateDecision {
  approved: boolean;
  stages: GateStage[];
  report: CritiqueReport;
  summary: string;
}

export interface GateOptions {
  /** dry-runs check the caps without consuming budget (default: record) */
  recordSpend?: boolean
}

export function runMitigationGate(input: GateInput, opts: GateOptions = {}): GateDecision {
  const wallet = input.walletAddress ?? getWalletAddress().walletAddress;
  const report = runCritique({
    currentHf: input.currentHf,
    targetHf: input.targetHf,
    totalDebtBase: input.totalDebtBase,
    repayAmount: input.repayAmount,
    repayToken: input.repayToken,
    walletAddress: wallet,
    borrowerAddress: input.borrowerAddress,
    poolAddress: input.poolAddress,
    rpcUrl: input.rpcUrl,
  });

  const stages: GateStage[] = report.stageResults.map((r) => ({
    name: r.name,
    passed: r.passed,
    detail: r.detail,
    durationMs: r.durationMs,
  }));

  const usd = Number(input.repayAmount) / 1e6;
  const cap = checkSafety("transfer", { value: BigInt(Math.round(usd * 1e18)).toString() }, { record: opts.recordSpend !== false });
  stages.push({
    name: "spend-caps",
    passed: cap.allowed,
    detail: cap.allowed ? `Repays $${usd.toFixed(2)} within block/daily caps` : cap.reason ?? "cap rejected",
    durationMs: 0,
  });

  const approved = report.passed && cap.allowed;
  return {
    approved,
    stages,
    report,
    summary: approved ? `approved: ${stages.length}/${stages.length} stages passed` : "blocked by gate",
  };
}
