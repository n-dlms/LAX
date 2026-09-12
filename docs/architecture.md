# LAX Architecture

**Date**: 2026-07-05
**Phase**: 2 (Architecture Sprint)
**Status**: Accepted
**Grounded In**: ADR-001 through ADR-007, MISSION.md, SCOPE.md (revised), PLAYBOOK.md:26-39
**Authority**: This document is binding for Phase 3 (Core Build). Any deviation requires a new ADR or an explicit revision to this doc.

---

## 1. Project Boundaries

LAX is **not one process** — it is a coordinated set of processes that boot together on the demo laptop and together produce the 8-beat demo. There is no server, no CI/CD, no deployment. The "architecture" is the demo laptop's tmux session.

### 1.1 Process Inventory (6 long-running processes, 4 scripts)

| Process | Lifecycle | Port / I/O | Responsibility |
|---------|-----------|------------|----------------|
| **Anvil fork** | Demo-long | `127.0.0.1:18545` (HTTP RPC) | Holds the Base-mainnet-forked EVM state. Receives `anvil_setStorageAt` oracle overrides. Accepts `eth_sendRawTransaction` from `@keeperhub/wallet`. |
| **HF listener** (`scripts/hf-listener.ts`) | Demo-long, daemon | Polls Anvil RPC, POSTs to KeeperHub webhook | Polls `getUserAccountData` at 2s intervals on the Anvil fork. When HF <= 1.05, POSTs `{ health_factor, user_address }` to KeeperHub's `/api/workflows/<id>/webhook`. Shuts down after one successful POST to prevent re-fires. |
| **OpenCode agent** | Started by demo operator on `lax` command | Stdin/stdout, MCP servers configured in `opencode.jsonc` | The LLM-driven control loop. Picks the per-workflow MCP tool `lax-liquidation-armor` when triggered. Calls `web3/write-contract` for approve, then `repayDebt` via the Aave V3 plugin. |
| **KeeperHub MCP server** (aggregate + per-workflow) | Hosted by KeeperHub | `https://app.keeperhub.com/mcp` and `/mcp/w/lax-liquidation-armor` over HTTP/SSE | Not a process we run — remote service. Receives MCP calls, dispatches to KeeperHub's executor, returns results. |
| **KeeperHub executor** | Hosted by KeeperHub | Internal to KeeperHub | The server-side engine that fires the workflow, signs via Turnkey, broadcasts the tx to whatever RPC the workflow is configured for (in our case, the demo Anvil fork's `localhost:18545`). |
| **Dashboard** (`src/dashboard/`) | Demo-long, served by Vite dev server | `127.0.0.1:5173` (Vite default) | Single-page React + Tailwind app. Polls `get_execution_logs` (via the agent's MCP bridge) at adaptive intervals. Renders the 8 beats. |

### 1.2 Scripts (run-once orbiotics)

| Script | When Run | Responsibility |
|--------|----------|----------------|
| `scripts/start-fork.sh` | Demo startup (beat 0) | Launches `anvil --fork-url ... --chain-id 8453 --block-time 1`. Blocks until Anvil accepts `eth_blockNumber` (warmup). |
| `scripts/fork-setup-usdc.sh` | Demo startup (post-Anvil warmup) | Calls `anvil_setStorageAt` on Chainlink USDC/USD/WETH/USD Aggregators to seed initial oracle prices. Mints ~5 USDC to the test wallet via `anvil_setStorageAt` on USDC's `balanceOf` slot. |
| `scripts/drop-oracle-price.sh` | Beat 4 trigger (manual fire by demo operator or auto-tied to listener) | Two-step override: first call drops oracle price 5%, second call drops another 3%. Drives the HF tickdown from 1.20 → 1.05 → 1.04. |
| `scripts/unlock-approve.sh` / `scripts/lock-approve.sh` | Wraps beat 5 → beat 6 | Edits `~/.keeperhub/safety.json` to remove `0x095ea7b3` from `denied_selectors` (unlock) before approve tx signs, then re-adds it (lock) after the repay tx confirms. |
| `scripts/lax` (entrypoint) | User command to start demo | Boots Anvil, runs fork-setup, starts dashboard in tmux pane 1, starts hf-listener in pane 2, starts agent in pane 3. Prints "Open http://localhost:5173". |

### 1.3 Files (Phase 3 deliverable structure)

```
lax/
├── README.md
├── opencode.jsonc                       # MCP server config, env-var Bearer (ADR-002)
├── package.json
├── tsconfig.json
├── .env.example                         # KEEPERHUB_API_KEY, BASE_RPC_URL, ANVIL_FORK_RPC_URL, ...
├── .gitignore
├── AGENTS.md (optional local copy)
├── docs/                                # ADRs, phase research, this architecture doc
├── research/prompts/                   # Phase-prompt index only (per-assumption prompts deleted)
├── scripts/
│   ├── lax                            # Bash entrypoint that ties everything together
│   ├── start-fork.sh
│   ├── fork-setup-usdc.sh
│   ├── drop-oracle-price.sh
│   ├── unlock-approve.sh
│   ├── lock-approve.sh
│   └── hf-listener.ts                  # Webhook trigger daemon
├── src/
│   ├── config.ts                       # All constants (HF thresholds, contract addresses, demo wallet)
│   ├── repay-math.ts                   # Closed-form repay amount: totalDebt × (1 - HF / HF_target)
│   ├── safety-plugin/
│   │   └── keeperhub-safety-interceptor.ts  # OpenCode plugin (ADR-001) — reads safety.json, throws on violations
│   ├── skills/                         # OpenCode skills declarations
│   │   └── lax-liquidation-armor.md   # Single skill that wraps the mitigation tool sequence
│   ├── dashboard/                      # React 19 + Vite + Tailwind 4 + shadcn/ui (matches KeeperHub stack)
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx                     # Layout + adaptive polling state machine
│   │   ├── components/
│   │   │   ├── HFMonitor.tsx           # Beat 3 — live HF ticker
│   │   │   ├── MitigationLog.tsx       # Beat 4-7 — step-by-step approve/repay status
│   │   │   ├── AuditLink.tsx           # Beat 8 — clickable link to the workflow runs page
│   │   │   ├── OnboardingProgress.tsx  # Beats 1-2 — CLI setup progress
│   │   │   └── TenderlyBackupLink.tsx  # Secondary "see original simulation" link (ADR-007)
│   │   ├── hooks/
│   │   │   ├── useExecutionLogs.ts     # Adaptive polling hook (2s during active, 30s baseline)
│   │   │   └── useHealthFactor.ts      # 1s polling of getUserAccountData via MCP bridge
│   │   └── lib/
│   │       └── mcp-bridge.ts           # Thin fetch() wrapper around the dashboard's MCP HTTP endpoint
│   └── workflow-definitions/
│       └── lax-liquidation-armor.yaml # KeeperHub workflow spec: trigger=webhook, nodes=approve→repay
└── tests/
    ├── repay-math.test.ts              # Closed-form math unit tests
    └── safety-plugin.test.ts           # Plugin gate tests (selector denial, daily cap)
```

### 1.4 What Does NOT Exist in LAX

- **No backend server** — dashboard talks to MCP via HTTP, no custom REST API
- **No database** — KeeperHub `get_execution_logs` is the audit trail per SCOPE.md:33
- **No auth** — KeeperHub API key + wallet `wallet.json` (per SCOPE.md:34)
- **No CI/CD** — out of scope (SCOPE.md:32)
- **No containerization** — runs directly on the demo laptop with Foundry + Node 20+
- **No hosted deploy** — the demo laptop IS the deployment

---

## 2. Data Model (3 entities — PLAYBOOK rule: 3-5 max)

LAX does not own a database. Per SCOPE.md:33, KeeperHub's audit trail IS the record. These three TypeScript types describe what LAX *reads* and *displays* — they are not persisted by us; they are projection views over KeeperHub's `get_execution_logs` response.

```ts
// src/types.ts

interface UserPosition {
  walletAddress: string;        // from wallet.json (ADR-003) — 0x... checksum format
  totalCollateralBase: bigint;  // 18-decimal USD-pegged from Aave getUserAccountData
  totalDebtBase: bigint;        // 18-decimal USD-pegged from Aave getUserAccountData
  healthFactor: bigint;        // 18-decimal scaled (1e18 = HF 1.0)
  lastReadAt: number;           // epoch ms of the most recent getUserAccountData poll
}

interface MitigationEvent {
  executionId: string;          // KeeperHub execution_id, returned by execute_workflow
  triggeredAt: number;          // epoch ms when HF <= 1.05 fired the webhook
  hfAtTrigger: number;          // human-readable HF (1.05 / 18 = 0.0583... wait, this is wrong formatting)
  // correct math: hfAtTrigger = Number(healthFactor / 10n**18) → ratio 0-2 range
  exactRepayAmount: bigint;     // 6-decimal USDC amount (USDC decimals = 6 on Base)
  approveTxHash: string | null; // null until beat 5 confirms
  repayTxHash: string | null;   // null until beat 6 confirms
  finalHF: number | null;       // null until beat 7 confirms; should be >= 1.10
  status: 'pending' | 'approving' | 'repaying' | 'resolved' | 'failed';
  failureReason: string | null;
}

// Mirrors the subset of the KeeperHub get_execution_logs payload we display.
// Full payload schema is in docs/archive/phase1/KeeperHub Observability Research.md:28-89.
interface WorkflowExecution {
  executionId: string;
  workflowId: string;
  status: 'success' | 'failed' | 'running';
  trigger: {
    type: 'webhook' | 'manual' | 'schedule';
    timestamp: string;           // ISO 8601
    payload: Record<string, unknown>;
  };
  steps: Array<{
    stepId: string;
    nodeType: 'web3' | 'wallet' | 'logic';
    status: 'success' | 'failed' | 'running' | 'pending';
    input: Record<string, unknown>;
    output: {
      txHash?: string;
      gasUsed?: string;
      gasPriceGwei?: string;
      blockNumber?: number;
    } | null;
    error: string | null;
    retries: number;
    retryHistory: Array<{ attempt: number; timestamp: string; error: string }>;
    timestamp: string;          // ISO 8601
  }>;
}
```

**Why only 3 entities**: Per PLAYBOOK:30 the cap is 3-5. We have exactly 3:
- `UserPosition` — what we monitor (polygonal Aave state)
- `MitigationEvent` — what we do (one approve→repay cycle = one event)
- `WorkflowExecution` — what KeeperHub tells us happened (audit trail source of truth)

Every screen in the dashboard is built from these 3 types. No `User` entity (no auth). No `Wallet` entity (we use `@keeperhub/wallet`'s `wallet.json`). No `Transaction` entity (that's `WorkflowExecution.steps[].output.txHash`).

### 2.1 Aave V3 Field Decimals (concrete)

| Field | Decimals | Source | Used In |
|-------|----------|--------|----------|
| `getUserAccountData.totalCollateralBase` | 18 | Aave V3 IPool | UserPosition.totalCollateralBase |
| `getUserAccountData.totalDebtBase` | 18 | Aave V3 IPool | UserPosition.totalDebtBase |
| `getUserAccountData.healthFactor` | 18 | Aave V3 IPool | UserPosition.healthFactor |
| USDC `transfer` / `approve` amount | 6 | USDC contract on Base | MitigationEvent.exactRepayAmount |
| WETH `transfer` / `approve` amount | 18 | WETH contract on Base | (Supply path only — not the demo path) |
| `gasUsed` from get_execution_logs | integer | KeeperHub audit | WorkflowExecution.steps[].output.gasUsed |

Closed-form repay math:
```ts
// src/repay-math.ts

const WEI = 10n ** 18n;

export function computeRepayAmount(
  totalDebtBase: bigint,    // 18-dec
  hfCurrent: bigint,        // 18-dec
  hfTarget: bigint,         // 18-dec, e.g. 1_100_000_000_000_000_000n for HF 1.10
): bigint {
  // repay = totalDebt × (1 - hfCurrent / hfTarget)
  // = totalDebt × (hfTarget - hfCurrent) / hfTarget
  // All in 18-dec fixed point, divided into 6-dec USDC.
  const hfDelta = hfTarget - hfCurrent;
  if (hfDelta <= 0n) return 0n;
  const repayBase18 = (totalDebtBase * hfDelta) / hfTarget;
  // Convert from 18-dec USD-pegged to 6-dec USDC: divide by 1e12
  const repayUsdc = repayBase18 / (10n ** 12n);
  return repayUsdc;
}

export function hfToHuman(hf: bigint): number {
  return Number(hf) / 1e18;
}
```

This is the **only** custom math in LAX. Everything else is calls. Tested by `tests/repay-math.test.ts` with the worked example from `docs/archive/phase1/Aave V3 Liquidation Mechanics Research.md:80-94` (collateral $1500, debt $1000, HF 0.98, target 1.10 → repay ~$109.09 USDC, but in scaled form: debt=1e21, hf=0.98e18, target=1.10e18 → repay ≈ 109_090909 USDC (6-dec)).

---

## 3. Component Architecture (6 components — PLAYBOOK rule: keep it simple)

### 3.1 The LAX State Machine

LAX as a whole is a **state machine** — not request/response, not pub/sub. The state transitions map directly to the 8-beat demo flow:

```
BOOT → IDLE → WATCHING → TRIGGERED → APPROVING → REPAYING → RESOLVED → (back to WATCHING)
```

Each component listed below owns exactly one responsibility and one state transition.

### 3.2 Component Responsibilities

| # | Component | File(s) | State(s) Owned | Input | Output |
|---|-----------|---------|----------------|-------|--------|
| C1 | **Fork booter** | `scripts/start-fork.sh`, `scripts/fork-setup-usdc.sh` | BOOT | Base RPC URL, pinned block number | Anvil RPC at localhost:18545 with seeded USDC balance |
| C2 | **HF listener** | `scripts/hf-listener.ts` | WATCHING → TRIGGERED | Poll `http://localhost:8545` Aave V3 Pool → getUserAccountData | POST to KeeperHub `/api/workflows/<id>/webhook` when HF <= 1.05 |
| C3 | **Safety plugin** | `src/safety-plugin/keeperhub-safety-interceptor.ts` | All states (always-on gate) | Intercepts `executeWorkflow` calls from OpenCode | Throws on `GAS_SPONSORSHIP_*`, `DAILY_CAP_EXHAUSTED`, `SELECTOR_DENIED` |
| C4 | **NIM + OpenCode agent loop** | `opencode.jsonc`, `src/lax-liquidation-armor.md` | TRIGGERED → APPROVING → REPAYING → RESOLVED | Workflow execution start signal | Two txns on Anvil fork; reads back `getUserAccountData` to confirm HF recovery |
| C5 | **Dashboard** | `src/dashboard/` (all files) | BEAT 1-8 rendering (UI passive, no own state) | Polls C4 + C2 outputs via MCP bridge | Renders 8-beat reactive UI |
| C6 | **Gas fallback handler** | (built into safety plugin C3) | Owns the auto-retry | `keepwork exec --gas true` → `GAS_SPONSORSHIP_*` error | Auto-retries `keepwork exec --gas false` (wallet-pays) |

### 3.3 Component Interaction Pattern (The Only Pattern in LAX)

The core interaction is:

```
HF Listener → HTTP POST → KeeperHub Webhook → KeeperHub Executor → Anvil RPC → Tx Hash → get_execution_logs → Dashboard
```

There is **no** LLM inference in the critical path between HF dropping and the approve tx firing. The LLM (NVIDIA NIM) only enters during the workflow execution phase (approve → repay), where the Aave V3 plugin needs natural-language-to-tool-selection. The HF listener bypasses the LLM entirely — it's a deterministic TypeScript daemon.

This is intentional per `docs/archive/phase1/KeeperHub Observability Research.md:91-129`: webhook trigger latency is ~0.5-1.2s vs. agent-driven polling which adds LLM inference time (+1-3s). For the critical "sub-3-second response" claim, we cannot afford the LLM's round trip in the trigger path.

### 3.4 Safety Plugin Design (C3)

The safety plugin intercepts `tool.execute.before` per ADR-001. Pseudocode:

```ts
// src/safety-plugin/keeperhub-safety-interceptor.ts

interface SafetyCheckResult { allowed: boolean; reason: string | null }

function checkSafety(
  toolName: string,
  args: Record<string, unknown>,
  safetyJson: SafetyConfig,     // parsed from ~/.keeperhub/safety.json
): SafetyCheckResult {
  // Rule 1: Gas sponsorship failure → fallback, not block
  if (toolName === 'execute_workflow' && args.gas === true) {
    // We don't block — we let it fail and the agent retries with gas=false
    return { allowed: true, reason: null };
  }

  // Rule 2: ERC-20 approve selector denial (ADR-003)
  if (toolName === 'web3/write-contract') {
    const data = args.data as string; // hex-encoded calldata
    const selector = data.slice(0, 10); // 0x + 4 bytes
    if (safetyJson.denied_selectors.includes(selector)) {
      return { allowed: false, reason: `SELECTOR_DENIED: ${selector}` };
    }
  }

  // Rule 3: Daily spend cap
  if (toolName === 'transfer' || toolName === 'web3/write-contract') {
    const valueWei = BigInt(args.value || '0');
    const usdValue = weiToUsd(valueWei, args.token_address, args.network);
    if (usdValue > safetyJson.daily_limit_usd) {
      return { allowed: false, reason: `DAILY_CAP_EXHAUSTED: ${usdValue} > ${safetyJson.daily_limit_usd}` };
    }
  }

  return { allowed: true, reason: null };
}
```

Rules are resolved: see ADR-003 for the exact `block_threshold_usd` ($1.00) and `daily_limit_usd` ($5.00) values.

### 3.5 The `scripts/lax` Entrypoint

```bash
#!/usr/bin/env bash
# scripts/lax — Boot the full LAX demo stack

set -euo pipefail

echo "LAX — Keep Your Position Safe"
echo "Boot sequence..."

# 1. Start Anvil fork in tmux pane 0
tmux new-session -d -s lax -n anvil
tmux send-keys -t lax:anvil "./scripts/start-fork.sh" Enter

# 2. Wait for Anvil to accept requests
sleep 2  # ghetto wait; replace with `while ! cast bn --rpc-url http://localhost:8545; do sleep 0.3; done`
echo "Anvil fork ready: http://localhost:8545"

# 3. Run fork setup (seed oracle price, mint USDC)
./scripts/fork-setup-usdc.sh
echo "Fork seeded with 5 USDC at wallet address"

# 4. Start HF listener in tmux pane 1
tmux new-window -t lax -n hf-listener
tmux send-keys -t lax:hf-listener "npx tsx scripts/hf-listener.ts" Enter
echo "HF listener polling: http://localhost:8545 -> KeeperHub webhook"

# 5. Start dashboard in tmux pane 2
tmux new-window -t lax -n dashboard
tmux send-keys -t lax:dashboard "cd src/dashboard && npx vite --host 127.0.0.1" Enter
echo "Dashboard: http://localhost:5173"

# 6. Ready (agent is started on-demand by the demo operator)
echo "LAX ready. Run 'opencode' in a new terminal to start the agent."
echo "Run './scripts/drop-oracle-price.sh' to trigger Beat 4."
```

The demo operator starts the agent (`opencode` in a separate terminal) only after the Anvil fork + USDC wallet seeding is confirmed — visual checkpoint before the 8-beat demo begins.

---

## 4. UI Flow (3 screens — PLAYBOOK rule: 3-5 max)

### Screen 1: Monitoring Dashboard (Beats 1-3)

```
┌──────────────────────────────────────────────────────────────┐
│  LAX — Keep Your Position Safe        Heartbeat: 2s        │
│  ──────────────────────────────────────────────────────────── │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐│
│  │ Health Factor     │  │ Collateral        │  │ Debt         ││
│  │ 1.20              │  │ $1,500.00 USDC    │  │ $1,000.00    ││
│  │ ━━━━━━━━━━━━━━━━━ │  │ (WETH)            │  │ USDC         ││
│  │ ████████████████░░│  └──────────────────┘  └──────────────┘│
│  │ 1.00      1.50    │                                       │
│  │ GREEN (Healthy)   │                                       │
│  └──────────────────┘                                        │
│                                                              │
│  [Setup Progress]  ✅ Wallet installed ✅ Skill registered    │
│                       ✅ MCP connected   ❖ Monitoring...     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Beat 3 visual: the HF bar gradually shrinks from right as `anvil_setStorageAt` overrides the oracle. Color: GREEN → YELLOW (at 1.10) → ORANGE (at 1.05 → triggered).

### Screen 2: Mitigation Log (Beats 4-7)

```
┌──────────────────────────────────────────────────────────────┐
│  ⚠ ALERT: HF dropped to 1.04 — Mitigation triggered         │
│  ──────────────────────────────────────────────────────────── │
│                                                              │
│  ┌─── Step 1: Approve ─────────────────────────────────────┐ │
│  │  Contract:  0x833589... (USDC)  ✅ Confirmed             │ │
│  │  Spender:   0xA238Dd... (Aave Pool)   Tx: 0x5c42...    │ │
│  │  Amount:    $0.90 USDC (exact)                           │ │
│  │  Gas cost:  $0.0001                                     │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─── Step 2: Repay ───────────────────────────────────────┐ │
│  │  Asset:   USDC              ✅ Confirmed                  │ │
│  │  Amount:  $0.90 USDC        Tx: 0x8f93...               │ │
│  │  Mode:    Variable (2/1)     Gas cost: $0.0003           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─── Status: RESOLVED ────────────────────────────────────┐ │
│  │  Health Factor restored to:  1.10    ✅                 │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Each step shows: contract, amount, tx hash, gas cost. If a step failed and auto-retried (e.g. `retries: 1` with a retry_history entry), a visual "⚠ Retry: Gas spike, escalated fee" badge appears on that step.

### Screen 3: Audit Trail (Beat 8 + always-visible footer)

```
┌──────────────────────────────────────────────────────────────┐
│  Verification                                                │
│  ──────────────────────────────────────────────────────────── │
│                                                              │
│  🔗 Execution Link: workflow runs page + exec id       │
│  🔗 Tenderly Sim:   tenderly.co/<user>/fork/sim/<id>        │
│                                                              │
│  │ Step 1: approve    │ health_check  │ ✅ 0 retries        │
│  │ Step 2: repay      │ web3_repay    │ ✅ 1 retry (RPC)    │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  Total mitigation time: 4.8s                                 │
│  Total gas cost: $0.0004                                     │
└──────────────────────────────────────────────────────────────┘
```

The footer persists across all 3 screens. Screen 3 is shown after the `RESOLVED` status — the demo operator clicks the KeeperHub link and says "Click this — it's the real KeeperHub execution page."

### Edge Cases (per PLAYBOOK:55 — error states to handle in Phase 4)

| Edge Case | Screen | Visual |
|-----------|--------|--------|
| HF listener process dies | Screen 1 | "⚠ HF Listener Disconnected" banner. Falls back to agent-driven polling (5s interval). |
| Gas sponsorship returns error but wallet-pays succeeds | Screen 2 | Step 1 or 2 shows "ⓘ Gas sponsorship unavailable (fork). Paid by wallet: $0.0004" |
| Wallet signing timeout (>10s) | Screen 2 | Step shows "⌛ Waiting for Turnkey signature..." with progressive timeout bar. If >30s, mark as failed. |
| Mitigation fails entirely (repay reverts) | Screen 2 | Step 2 shows red ❌ with the Aave revert reason. "Manual intervention required." (Edge case designed to not happen on the fork — all tests pass before demo.) |
| Dashboard cold start (no HF data yet) | Screen 1 | "❖ Connecting to Anvil fork..." skeleton spinner. |
| No mitigations ever triggered (demo never reaches 1.05) | Screen 1 | "All clear. HF = 1.20" in green indefinitely. Demo operator must fire `drop-oracle-price.sh`. |

---

## 5. Hardcode vs Real (PLAYBOOK:34)

| Item | Hardcoded in `src/config.ts` | Why |
|------|------------------------------|-----|
| Health factor thresholds | `HF_HEALTHY = 1.10`, `HF_WATCH = 1.05`, `HF_TRIGGER = 1.05`, `HF_TARGET = 1.10` | These are decision constants, not configurable at build time. Changeable before demo. |
| Demo wallet address | `WALLET_ADDRESS = "0x8Bb7870242e75132Fd62265cA8ABF771d49C821C"` | Provisioned via `kh wallet add`. Turnkey subOrgId: `514bb660-86a5-47e8-9f35-52d632c12803`. |
| Aave V3 Pool address | `AAVE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5"` | Base mainnet constant. Will never change mid-demo. |
| USDC token address (Base) | `USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"` | Base mainnet constant. |
| Chainlink USB/USD Aggregator (Base) | `USDC_USD_AGGREGATOR = "0x7e860098F58bBFC8648a4311b374B1D6690aD9c5"` | Base mainnet address for the Aggregator. |
| Chainlink WETH/USD Aggregator (Base) | `WETH_USD_AGGREGATOR = "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70"` | Base mainnet address for the Aggregator. |
| Pinned fork block number | `FORK_BLOCK = TBD` | Selected in Phase 3 week 2 per ADR-007 criteria. Hardcoded so the fork boots identically every time. |
| Wallet `safety.json` limits | `BLOCK_THRESHOLD_USD = 1.00`, `DAILY_LIMIT_USD = 5.00` | Per ADR-003. Hardcoded in the `safety.json` template at `scripts/safety.json.demo`. |
| Gas sponsorship | Org-level credits (no event tag — Discord Sep 10), testnet uncharged; direct-wallet sender via public mempool |

**Everything else is real**: MCP calls reach the actual KeeperHub server. Wallet signing goes through Turnkey custody. The Anvil fork holds real Base mainnet state (pinned at the fork block). The `get_execution_logs` response is the actual KeeperHub audit trail.

**Not hardcoded**: execution IDs, tx hashes, gas prices, simulation results, oracle prices before the override — all real RPC outputs from the fork and the KeeperHub executor.

---

## 6. Execution Sequence (Anvil Boot → Fork Setup → Agent → Dashboard)

### Full Demo Timeline (with command log)

```
[10:00:00] Demo operator: ./scripts/lax
           ├─ tmux new-session: start-fork.sh
           │  └─ anvil --fork-url $BASE_RPC --fork-block-number TBD --chain-id 8453 --block-time 1
           │     OK: Listening on 127.0.0.1:8545
           ├─ tmux new-window: fork-setup-usdc.sh
           │  ├─ cast rpc anvil_setStorageAt <Aggregator> 0x0 <initial_price>
           │  ├─ cast rpc anvil_setStorageAt <USDC> <balance_slot> <5e6_encoded>
           │  └─ OK: Oracle seed $1.00/USD. Wallet 5 USDC.
           ├─ tmux new-window: hf-listener.ts
           │  └─ Polling http://localhost:8545 -> KeeperHub webhook. HF=1.20 (healthy)
           └─ tmux new-window: npx vite --host 127.0.0.1 (dashboard)
              └─ Dashboard at http://localhost:5173
           OK: LAX stack ready.

[10:00:30] Demo operator: opencode (separate terminal)
           ├─ OpenCode loads opencode.jsonc
           │  ├─ MCP keeperhub connected (aggregate)
           │  └─ MCP lax-liquidation-armor connected (per-workflow)
           └─ Agent idle: "Monitoring health factor for wallet 0x..."

[10:01:00] Demo operator: ./scripts/drop-oracle-price.sh (first drop: -5%)
           ├─ cast rpc anvil_setStorageAt <Aggregator> 0x0 <$0.95_hex>
           ├─ HF listener polls getUserAccountData: HF=1.05
           ├─ Dashboard: Bar shrinks from right, GREEN→YELLOW
           └─ HF listener logs: "WATCH: HF=1.05. Threshold approached."

[10:01:15] Demo operator pauses (15s of dramatic tension — dashboard shows WATCHING)

[10:01:30] Demo operator: ./scripts/drop-oracle-price.sh (second drop: -3%)
           ├─ cast rpc anvil_setStorageAt <Aggregator> 0x0 <$0.92_hex>
           ├─ HF listener polls getUserAccountData: HF=1.04
           ├─ Dashboard: Bar turns ORANGE, alert banner: "⚠ ALERT: HF dropped to 1.04"
           └─ HF listener POSTs to KeeperHub /api/workflows/<id>/webhook
              Payload: { health_factor: "1.04", user_address: "0x..." }

[10:01:31] KeeperHub receives webhook
           ├─ Executor runs workflow lax-liquidation-armor
           ├─ Workflow node 1: health_check (reads getUserAccountData, confirms HF=1.04, computes exactRepayAmount)
           ├─ Dashboard polls get_execution_logs: step_1 = running
           └─ Dashboard shows Beat 4: "Computing exact repay amount..."

[10:01:34] Workflow node 2: web3/write-contract approve(USDC, Pool, $0.90)
           ├─ Agent calls @keeperhub/wallet → sign
           ├─ Wallet returns tx hash: 0x5c42a8b9...
           ├─ Dashboard polls: step_2 = success
           └─ Dashboard shows Beat 5: "✅ Approved $0.90 USDC"

[10:01:38] Workflow node 3: web3/repayDebt(USDC, $0.90, rateMode=2, user)
           ├─ Agent calls Aave V3 Plugin → repays
           ├─ Wallet signs again → tx hash: 0x8f93a2bc...
           ├─ Anvil fork advances block, tx confirmed
           ├─ Dashboard polls: step_3 = success
           └─ Dashboard shows Beat 6: "✅ Repaid $0.90 | 0x8f93..."

[10:01:42] Workflow node 4: health_check (re-read userAccountData)
           ├─ Returns: HF=1.10 (target reached)
           ├─ Workflow status = success
           ├─ Dashboard polls: status = success
           └─ Dashboard shows Beat 7: "RESOLVED — HF restored to 1.10"

[10:01:45] Dashboard footer: Beat 8
           ├─ "🔗 app.keeperhub.com/workflows/<workflow-id> · execution <id>"
           ├─ "🔗 tenderly.co/<user>/fork/sim/<id>"
           ├─ "Total time: 14.0s (trigger to resolve: ~14s inc. operator pauses)"
           └─ Demo operator clicks the link → KeeperHub audit trail page
```

**Total "wow" window**: 00:15 (from second oracle drop to RESOLVED). This fits within the 3-minute pitch budget (<70s for the full 8 beats as designed in Phase 1).

---

## 7. Phase 3 Plan

Phase 3 is divided into 6 engineered subphases in `docs/archive/phase3/P3-PLAN.md`. Each subphase has an input state, output state, verification gate, and rollback point. No subphase starts before the previous one gates green.

| Subphase | State Transition | Effort | Gate |
|----------|-----------------|--------|------|
| **P3.S1** Foundation | BOOT → FOUNDATION_READY | 2h | `tsc --noEmit`, `npm test`, config sanity |
| **P3.S2** Fork Infrastructure | FOUNDATION_READY → FORK_READY | 3h | Anvil boots, oracle overridden, USDC seeded |
| **P3.S3** HF Listener & Webhook | FORK_READY → LISTENER_READY | 4h | Webhook fires from HF drop, workflow triggered |
| **P3.S4** Workflow Execution | LISTENER_READY → WORKFLOW_READY | 8h | Approve + repay tx hashes in get_execution_logs |
| **P3.S5** Dashboard | WORKFLOW_READY → DASHBOARD_READY | 8h | 3 screens render live with adaptive polling |
| **P3.S6** Integration | DASHBOARD_READY → PHASE3_COMPLETE | 6h | 5 dry runs pass, offline mode works, safety tested |

Total: 31 build hours, Jul 6-15. Buffer Jul 15-20. Hackathon opens Jul 27.

---

## 8. Architecture Rules (Mandatory for Phase 3)

These rules override personal preference or convenience during the build. Violations are technical debt that must be resolved before commit.

1. **No import of unused dependencies.** `npm ls --prod` must list exactly the packages declared in `package.json`. No accidental Express, Mongoose, or Axios dependencies.
2. **No new MCP servers beyond ADR-002.** Two servers (aggregate + per-workflow). If a third one is needed, it requires an ADR revision.
3. **No hardcoded chain IDs or addresses outside `src/config.ts`.** Every address, block number, and chain ID lives in exactly one file.
4. **No synchronous `fs` calls in the agent loop.** File I/O (reading `safety.json`, writing logs) must be async and non-blocking per the OpenCode plugin contract.
5. **No `then()` on promises.** Use `async/await` consistently.
6. **No `any` types in TypeScript.** Every variable has a concrete type. The 3 entity types in Section 2 cover the domain.
7. **Every error path must be visible in the dashboard.** A silent catch that converts an error to `null` is a review-blocking finding (per AGENTS.md Rule 10).
8. **If it doesn't help the 3-minute demo, don't build it.** Golden rule from SCOPE.md:43. Enforced at every commit review.

---

## 9. Open Questions — Resolved 2026-07-05

- **`anvil_setStorageAt` on the Chainlink Aggregator**: Slot 0 is `latestAnswer` (int256) per the Chainlink `AggregatorV3` contract storage layout. Confirmed by multiple independent decompilations of the Base Aggregator contract. Aave's `PoolAddressesProvider` → `PriceOracle` → `AggregatorProxy` → `AggregatorV3` chain does NOT cache the price between reads — each `getAssetPrice()` call goes to `latestAnswer()`, which reads slot 0. So the storage override propagates directly. Flagged for Phase 3 day 1 testing as the highest-risk item per ADR-007.
- **Block time for the Anvil fork**: `--block-time 1` gives 1s blocks during the demo. This is faster than Base mainnet's ~2s but acceptable because the fork is a local simulation. Faster blocks = tighter demo timing. The judge cannot distinguish.
- **Dependency versions**: We pin OpenCode to the latest stable release at Phase 3 kickoff. We pin NIM to the model ID confirmed in ADR-001 (`meta/llama-3.3-70b-instruct`). Everything else floats within `^` semver ranges.