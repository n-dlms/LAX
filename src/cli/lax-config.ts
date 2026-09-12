// Node-side config for the standalone lax CLI.
// Mirrors the dashboard's LAX_CONFIG shape (dashboard/src/types.ts) so the
// extracted cli/ core runs unmodified, but sources every value from the root
// CONFIG (src/config.ts) with env overrides for fork/RPC/KeeperHub endpoints.
import { CONFIG } from "../config";
import { CLI_ENV } from "./env";

const forkRpc = CLI_ENV.LAX_FORK_RPC || CONFIG.FORK_RPC_URL;
const keeperhubApi =
  CLI_ENV.KEEPERHUB_API_URL || "https://app.keeperhub.com/api";

export const LAX_CONFIG = {
  BORROWER_ADDRESS: CONFIG.BORROWER_ADDRESS,
  HF_TRIGGER: CONFIG.HF.TRIGGER,
  HF_TARGET: CONFIG.HF.TARGET,
  FORK_PORT: CONFIG.FORK_PORT,
  FORK_RPC: forkRpc,
  PUBLIC_RPC: "https://mainnet.base.org",
  AAVE_POOL: CONFIG.AAVE_POOL,
  POOL_ADDRESSES_PROVIDER: "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D",
  WORKFLOW_ID: CONFIG.WORKFLOW_ID,
  USDC: CONFIG.USDC,
  WETH: CONFIG.WETH,
  WALLET_ADDRESS: CONFIG.WALLET_ADDRESS,
  ANVIL_SIGNER: CONFIG.BORROWER_ADDRESS,
  KEEPERHUB_API: keeperhubApi,
  // The platform has no per-execution UI route (app.keeperhub.com/runs/{id} is
  // gone) — the runs list lives on the workflow page, where the execution ID
  // is visible. Route verified HTTP 200 on 2026-09-12.
  KEEPERHUB_WORKFLOW_URL: (workflowId: string) =>
    `https://app.keeperhub.com/workflows/${workflowId}`,
  KEEPERHUB_RUN_URL: (executionId: string) =>
    `https://app.keeperhub.com/workflows/${CONFIG.WORKFLOW_ID} (execution ${executionId})`,
  TX_EXPLORER_URL: (txHash: string) => `https://basescan.org/tx/${txHash}`,
} as const;

export const APP_NAME = "Project LAX";
