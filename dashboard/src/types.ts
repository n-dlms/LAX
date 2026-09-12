// Type definitions for LAX dashboard (mirrors docs/architecture.md:101-153)

export interface UserPosition {
  walletAddress: string;
  totalCollateralBase: bigint; // 8-dec (Aave V3 base currency)
  totalDebtBase: bigint; // 8-dec
  healthFactor: bigint; // 18-dec (1e18 = 1.0)
  lastReadAt: number; // epoch ms
  readLatencyMs: number;
  blockNumber: bigint;
}

export type StepStatus = "pending" | "running" | "success" | "failed";

export type MitigationState =
  | "monitoring"
  | "mitigating"
  | "complete";

export interface MitigationStep {
  stepId: "start" | "approve" | "repay" | "verify";
  label: string;
  status: StepStatus;
  txHash: string | null;
  gasUsed: string | null;
  error: string | null;
  retries: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface MitigationEvent {
  executionId: string;
  triggeredAt: number; // epoch ms
  hfAtTrigger: number; // human-readable 0.00-2.00
  debtBase: bigint; // 8-dec Aave base currency at trigger
  exactRepayAmount: bigint; // 6-dec USDC
  steps: MitigationStep[];
  finalHF: number | null;
  status: "pending" | "approving" | "repaying" | "resolved" | "failed";
  failureReason: string | null;
  borrowerAddress?: string; // M1: parameterized position
  rpcUrl?: string; // M2: configurable RPC
}

export interface LogEntry {
  ts: number; // epoch ms
  level: "info" | "warn" | "error" | "trigger";
  message: string;
}

export const APP_NAME = "Project LAX";

// Demo config — pinned from src/config.ts in the root project
export const LAX_CONFIG = {
  BORROWER_ADDRESS: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  HF_TRIGGER: 1.05,
  HF_TARGET: 1.1,
  FORK_PORT: 18545,
  FORK_RPC: "http://127.0.0.1:18545",
  PUBLIC_RPC: "https://mainnet.base.org",
  AAVE_POOL: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
  POOL_ADDRESSES_PROVIDER: "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D",
  WORKFLOW_ID: "7gdt0ty7zk1orq1j4wc74",
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  WETH: "0x4200000000000000000000000000000000000006",
  WALLET_ADDRESS: "0x8Bb7870242e75132Fd62265cA8ABF771d49C821C",
  ANVIL_SIGNER: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  // No per-execution UI route exists (app.keeperhub.com/runs/{id} is gone) —
  // the runs list lives on the workflow page (verified 2026-09-12).
  KEEPERHUB_WORKFLOW_URL: (workflowId: string) =>
    `https://app.keeperhub.com/workflows/${workflowId}`,
  KEEPERHUB_RUN_URL: (executionId: string) =>
    `https://app.keeperhub.com/workflows/7gdt0ty7zk1orq1j4wc74 (execution ${executionId})`,
  TX_EXPLORER_URL: (txHash: string) =>
    `https://basescan.org/tx/${txHash}`,
} as const;
