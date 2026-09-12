# Phase 3: Core Build — Engineered to Win

**Date**: 2026-07-05
**Phase Authority**: docs/architecture.md (binding), docs/SCOPE.md, docs/adr/ADR-001 through ADR-007
**Architecture Rules**: Section 8 of docs/architecture.md — every subphase checks all 8 rules.
**Timeline**: Jul 6 – Jul 26 (21 days pre-hackathon). Jul 27 – Aug 13 (17 days hackathon window).

---

## Engineering Philosophy

We have time to build real infrastructure, not demo scaffolding. Every component must be:
- **Tested** — unit tests + integration tests pass before the subphase gates
- **Idempotent** — scripts can be re-run without side effects
- **Observable** — every failure is logged, every success is visible in the dashboard
- **Offline-capable** — no network dependency during the pitch

No "skip to next subphase" fallbacks. If a component fails, we fix it, not work around it.

---

## Judging Criteria (from README.md:37-45)

| # | Criterion | Weight | What the Judge Sees |
|---|-----------|--------|---------------------|
| C1 | Executes onchain via KeeperHub | Highest | "Two tx hashes on Base — approve and repay — both through KeeperHub." |
| C2 | Use of KeeperHub surfaces | High | "MCP, webhook, Aave plugin, audit trail, wallet, gas tag — they used every surface." |
| C3 | Reliability & observability | High | "Dashboard picked up the trigger in 2s. Audit trail shows each step with gas used." |
| C4 | Originality & usefulness | Medium | "Proactive at HF=1.05, not reactive at 1.0. The math is closed-form, not estimated." |
| C5 | Integration quality & DX | Bounty | "60-second setup. Clean TypeScript. Every error path handled." |

---

## Subphase Overview

```
Jul 6   Jul 9   Jul 13  Jul 17  Jul 21  Jul 26  Jul 27
  │       │       │       │       │       │       │
  S1      S2      S3      S4      S5      S6    HACKATHON
  Fndtn   Fork    Listnr  Workfl  Dashbrd Harden  OPENS
  ◄──────►◄─────►◄─────►◄─────►◄─────►◄─────►
   3d      4d      4d      4d      4d      5d     = 24d build
```

Each subphase is 3-5 days with concrete deliverables, tests, and a gate. Subphases are sequential — no parallelism — to minimize context switches and ensure each layer is solid before the next depends on it.

---

## P3.S1: Foundation (Jul 6-8, 3 days)

**State**: BOOT → FOUNDATION_READY
**Depends on**: Nothing

### Why First

Every subphase downstream reads from `src/config.ts`, imports from `src/types.ts`, and uses the safety plugin. Get these wrong and everything breaks. Also: the "hello tx" is integrated into S4 (Workflow) where it belongs — a transaction without the full pipeline proves nothing to the judge.

### Deliverables

#### 1.1 Type System (`src/types.ts`)

The 3 entity types from `docs/architecture.md:101-153`:

```typescript
// UserPosition — snapshot of an Aave V3 position at one point in time
interface UserPosition {
  walletAddress: string
  totalCollateralBase: bigint      // 18-dec
  totalDebtBase: bigint            // 18-dec
  healthFactor: bigint             // 18-dec
  lastReadAt: number               // epoch ms
}

// MitigationEvent — one full approve→repay cycle
interface MitigationEvent {
  executionId: string
  triggeredAt: number              // epoch ms
  hfAtTrigger: number              // human-readable 0.00–2.00
  exactRepayAmount: bigint         // 6-dec USDC
  approveTxHash: string | null
  repayTxHash: string | null
  finalHF: number | null
  status: 'pending' | 'approving' | 'repaying' | 'resolved' | 'failed'
  failureReason: string | null
}

// WorkflowExecution — mirrors KeeperHub's get_execution_logs subset
interface WorkflowExecution {
  executionId: string
  workflowId: string
  status: 'success' | 'failed' | 'running'
  trigger: { type: string; timestamp: string; payload: Record<string, unknown> }
  steps: Array<{
    stepId: string
    nodeType: 'web3' | 'wallet' | 'logic'
    status: string
    input: Record<string, unknown>
    output: { txHash?: string; gasUsed?: string; gasPriceGwei?: string; blockNumber?: number } | null
    error: string | null
    retries: number
    retryHistory: Array<{ attempt: number; timestamp: string; error: string }>
    timestamp: string
  }>
}
```

Each type has a factory function that validates at construction time — no partial objects floating around.

#### 1.2 Configuration (`src/config.ts`)

Must be the single source of truth for:
- Chain IDs (8453 Base, 84532 Base Sepolia)
- Contract addresses (Aave Pool, USDC, WETH, Aggregators)
- HF thresholds (HEALTHY=1.10, WATCH=1.05, TRIGGER=1.05, TARGET=1.10)
- Wallet address + subOrgId (from provisioning)
- Workflow ID (will be populated after S4 deploys it)
- Safety limits (block_threshold=$1.00, daily_limit=$5.00, denied_selectors)
- Gas tag name (`AgentsOnchain2026`)
- Fork block number (pinned after S2 testing)

A `validateConfig()` function runs at startup and throws if any address is zero, any chain ID is missing from the RPC map, or any HF threshold is logically invalid (e.g. TRIGGER > TARGET).

#### 1.3 Repay Math (`src/repay-math.ts`)

Already exists with tests (11 tests, all passing). Verified against the research report's worked example: $1,000 debt, HF 0.98 → target 1.10 → repay $109.09 USDC.

Add two more test cases:
- Edge: HF exactly at trigger (1.05) → target (1.10) → repay = debt × (1 - 1.05/1.10) = debt × 0.0454...
- Edge: extremely small debt ($0.01) → verify no underflow

#### 1.4 Safety Plugin Skeleton (`src/safety-plugin/`)

A TypeScript module with the `checkSafety()` function from `docs/architecture.md:241-278`. Three rules:

1. **Gas fallback** (Rule 1): `execute_workflow` with `gas=true` is allowed — let it fail and the agent retries with `gas=false`. We don't pre-emptively block.
2. **Selector denial** (Rule 2): `web3/write-contract` calls with `data` starting with `0x095ea7b3` (ERC-20 approve) are allowed. Any other selector (e.g. `0x23b872dd` = transferFrom) is denied.
3. **Daily cap** (Rule 3): Track cumulative USD spent across all `transfer` and `web3/write-contract` calls. If the running total for the day exceeds `DAILY_LIMIT_USD` ($5.00), deny.

The plugin reads `~/.keeperhub/safety.json` at startup and caches it. It exposes a `resetDailyCap()` for demo operator use.

#### 1.5 Entrypoint Skeleton (`scripts/lax`)

A bash script that:
1. Validates prerequisites (`which anvil`, `which cast`, `which kh`, `node --version`)
2. Sources `.env` and validates config
3. Prints "LAX — Keep Your Position Safe"
4. Exits with a clear error message listing what's missing

#### 1.6 NPM + TypeScript Hygiene

- `npm ls --prod` must list exactly: `tsx`, `@keeperhub/wallet`, `vitest` (dev), `typescript` (dev), `@types/node` (dev)
- `tsc --noEmit` must pass with 0 errors
- Path alias `@/*` → `./src/*` must resolve in both `tsc` and `tsx`

### Verification Gate

```
npm run lint                     # tsc --noEmit, 0 errors
npm test                         # 13+ tests (11 existing + 2 new), all pass
npx tsx -e "
  import { CONFIG, validateConfig } from './src/config';
  validateConfig();
  console.log('OK:', CONFIG.WALLET_ADDRESS);
"
kh tag get AgentsOnchain2026       # must return the tag
npm ls --prod                     # must be clean
```

### Gate Failure

If `tsc --noEmit` fails: fix type errors. If `validateConfig()` throws: fix config. If tag missing: re-create via `kh tag create`.

---

## P3.S2: Fork Infrastructure (Jul 9-12, 4 days)

**State**: FOUNDATION_READY → FORK_READY
**Depends on**: P3.S1 gate green

### Why Here

The fork is the sandbox where every subsequent subphase runs. Without it, S3 (listener) has nothing to poll, S4 (workflow) has nowhere to write, S5 (dashboard) has nothing to show. Get the fork right — pin the block, prove the oracle override propagates, prove Aave behaves correctly — and everything downstream is grounded in reality.

### Deliverables

#### 2.1 Block Pinning Research

Not all Base mainnet blocks are equal. The fork must pin a block that:
- Has active Aave V3 Pool with known positions
- Has no mid-reorg or uncle risk (age > 100 confirmations)
- Has recent enough oracle data (Chainlink aggregator is live)

Procedure:
```
# 1. Find the latest finalized block on Base
cast block-number --rpc-url https://mainnet.base.org
# 2. Subtract 100 (safety margin for reorgs)
# 3. Verify Aave Pool is active at that block
cast call 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5 \
  "getReserveData(address)" 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
  --block <candidate_block> --rpc-url https://mainnet.base.org
# 4. Verify oracle responds
cast call 0x7e860098F58bBFC8648a4311b374B1D6690aD9c5 \
  "latestAnswer()(int256)" --block <candidate_block> --rpc-url https://mainnet.base.org
# 5. Pin block in config.ts
```

If no Base block has a healthy Aave V3 state (unlikely but possible), use the `anvil_loadState` / `anvil_dumpState` path: fork at any recent block, dump the state, then restore from dump for reproducibility.

#### 2.2 Fork Boot Script (`scripts/start-fork.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail

FORK_BLOCK=${FORK_BLOCK:-$(grep FORK_BLOCK src/config.ts | grep -oP '\d+')}
RPC_URL=$(grep BASE_RPC_URL .env | cut -d= -f2)
PORT=${PORT:-18545}

echo "Booting Anvil fork at block $FORK_BLOCK..."
anvil \
  --fork-url "$RPC_URL" \
  --fork-block-number "$FORK_BLOCK" \
  --chain-id 8453 \
  --block-time 1 \
  --port "$PORT" \
  --compute-units-per-second 600 \
  > /tmp/lax-anvil.log 2>&1 &
ANVIL_PID=$!

# Wait for Anvil to accept RPC calls (with timeout)
for i in {1..30}; do
  if cast block-number --rpc-url "http://127.0.0.1:$PORT" > /dev/null 2>&1; then
    echo "Anvil ready at http://127.0.0.1:$PORT"
    echo "Block: $(cast block-number --rpc-url http://127.0.0.1:$PORT)"
    exit 0
  fi
  sleep 1
done

echo "ERROR: Anvil failed to start within 30s"
cat /tmp/lax-anvil.log
exit 1
```

Key requirements:
- Idempotent: kills existing Anvil before starting a new one
- Logs to `/tmp/lax-anvil.log` with timestamps
- Pings until Anvil accepts `eth_blockNumber`, with 30s timeout and clear error message
- Compatible with offline mode (uses `anvil_loadState` if `FORK_BLOCK` is a state dump path)

#### 2.3 Oracle Override Script (`scripts/fork-setup-usdc.sh`)

This is the highest-risk item per ADR-007:19. Two approaches, tested in order:

**Primary: `anvil_setStorageAt`**

Chainlink AggregatorV3 storage layout: Slot 0 = `latestAnswer` (int256, 8 decimals). Slot 1 = `latestTimestamp`. The call chain:
```
Aave PoolAddressesProvider → PriceOracleProxy → AggregatorProxy → AggregatorV3.latestAnswer()
```

Each `getAssetPrice()` call reads `latestAnswer()` which reads slot 0. No caching.

```bash
# Set USDC/USD price to $1.00 (100000000 with 8 decimals)
cast rpc anvil_setStorageAt \
  0x7e860098F58bBFC8648a4311b374B1D6690aD9c5 \
  0x0 \
  0x0000000000000000000000000000000000000000000000000000000005f5e100 \
  --rpc-url http://127.0.0.1:18545

# Set WETH/USD price to $3,300 (330000000000 with 8 decimals)
cast rpc anvil_setStorageAt \
  0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70 \
  0x0 \
  0x0000000000000000000000000000000000000000000000000000004c0d0f6c00 \
  --rpc-url http://127.0.0.1:18545
```

**Fallback: `anvil_setCode` mock oracle**

If `anvil_setStorageAt` doesn't propagate (unlikely but possible per ADR-007:15-16):
1. Deploy a minimal oracle contract that implements `latestAnswer()` returning a mutable storage value
2. Use `anvil_setCode` to replace the Aggregator's bytecode
3. Use `anvil_setStorageAt` on the mock's slot 0
4. Update Aave's PriceOracle to point at the mock

#### 2.4 USDC Seeding (`scripts/fork-setup-usdc.sh` continued)

The wallet needs USDC balance to repay. On the fork, we mint USDC via storage override.

USDC (Base) uses OpenZeppelin's ERC20Upgradeable with the transparent proxy pattern. The balance slot is computed as:
```
keccak256(abi.encode(address, uint256(9)))  // OpenZeppelin slot for ERC20 balances
```

```bash
USER_SLOT=$(cast keccak256 \
  $(cast abi-encode "x(address,uint256)" 0x8Bb7870242e75132Fd62265cA8ABF771d49C821C 9))
cast rpc anvil_setStorageAt \
  0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
  $USER_SLOT \
  $(cast to-hex 5000000) \  # 5.00 USDC (6 decimals)
  --rpc-url http://127.0.0.1:18545

# Also mint to a second wallet (backup for demo)
USER_SLOT_2=$(cast keccak256 \
  $(cast abi-encode "x(address,uint256)" 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 9))
cast rpc anvil_setStorageAt \
  0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
  $USER_SLOT_2 \
  $(cast to-hex 5000000) \
  --rpc-url http://127.0.0.1:18545
```

#### 2.5 Oracle Drop Script (`scripts/drop-oracle-price.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail

PCT_CHANGE=${1:--5}  # default -5%
AGGREGATOR=0x7e860098F58bBFC8648a4311b374B1D6690aD9c5
PORT=${PORT:-18545}

# Read current price
CURRENT=$(cast call $AGGREGATOR "latestAnswer()(int256)" \
  --rpc-url http://127.0.0.1:$PORT)
echo "Current oracle price: $(echo "scale=2; $CURRENT / 100000000" | bc) USD"

# Compute new price: CURRENT × (100 + PCT_CHANGE) / 100
NEW=$(( CURRENT * (100 + PCT_CHANGE) / 100 ))
HEX_NEW=$(cast to-hex $NEW)

cast rpc anvil_setStorageAt $AGGREGATOR 0x0 \
  0x00000000000000000000000000000000000000000000000000000000$HEX_NEW \
  --rpc-url http://127.0.0.1:$PORT

echo "New oracle price:  $(echo "scale=2; $NEW / 100000000" | bc) USD (${PCT_CHANGE}%)"
```

#### 2.6 Aave V3 Position Verification

After the fork is seeded, verify a realistic Aave V3 position exists:

```
# Check a known position on Base (from a block explorer query)
cast call 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5 \
  "getUserAccountData(address)(,,,,uint256,,,)" 0x<SOME_AAVE_USER> \
  --rpc-url http://127.0.0.1:18545
# Must return a health factor > 0
```

If no real position exists at the pinned block, create one: deposit WETH via `deposit()`, borrow USDC via `borrow()`, all through `cast send` with Anvil's pre-funded account #0.

#### 2.7 Fork State Caching (Offline Preparation)

Two commands:
- `scripts/fork-save-state.sh` — calls `anvil_dumpState` on the seeded fork, writes the hex-encoded state JSON to `fork-state.json`
- `scripts/fork-restore-state.sh` — calls `anvil_loadState` with the cached state, no RPC needed

This guarantees offline demo capability. The cached state is ~50-200 MB (compressed).

### Verification Gate

```
# 1. Boot fork
./scripts/start-fork.sh
# 2. Verify block
[ "$(cast block-number --rpc-url http://127.0.0.1:18545)" -gt 0 ] || exit 1
# 3. Seed oracle + USDC
./scripts/fork-setup-usdc.sh
# 4. Verify oracle price
[ "$(cast call 0x7e860098F58bBFC8648a4311b374B1D6690aD9c5 \
  "latestAnswer()(int256)" --rpc-url http://127.0.0.1:18545)" = "100000000" ] || exit 1
# 5. Verify wallet USDC balance
[ "$(cast call 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
  "balanceOf(address)(uint256)" 0x8Bb7870242e75132Fd62265cA8ABF771d49C821C \
  --rpc-url http://127.0.0.1:18545)" = "5000000" ] || exit 1
# 6. Drop oracle
./scripts/drop-oracle-price.sh -5
# 7. Verify new price
[ "$(cast call 0x7e860098F58bBFC8648a4311b374B1D6690aD9c5 \
  "latestAnswer()(int256)" --rpc-url http://127.0.0.1:18545)" = "95000000" ] || exit 1
# 8. Verify HF movement (must be lower than before drop)
# 9. Save state for offline use
./scripts/fork-save-state.sh
[ -f fork-state.json ] || exit 1
# 10. Shutdown
./scripts/fork-shutdown.sh
```

### Gate Failure

If `anvil_setStorageAt` on the Aggregator fails: implement the `anvil_setCode` fallback (adds ~1 day). If USDC slot computation is wrong: dump USDC storage layout via `cast storage` to find the correct balance slot. If no Aave V3 position exists at the pinned block: create one via `cast send deposit` + `cast send borrow`.

---

## P3.S3: HF Listener (Jul 13-16, 4 days)

**State**: FORK_READY → LISTENER_READY
**Depends on**: P3.S2 gate green (fork runs and oracle responds)

### Why Here

The HF listener is the critical path component. It bridges the fork (where HF changes happen) and KeeperHub (where the workflow executes). If the listener is unreliable, the demo feels scripted. If it's fast (2s polls), the judge sees real-time responsiveness.

### Deliverables

#### 3.1 HF Listener Daemon (`scripts/hf-listener.ts`)

A single-file TypeScript script, not a framework.

```typescript
// scripts/hf-listener.ts
import { CONFIG } from '../src/config.js';
import { hfToBigint, hfToNumber } from '../src/repay-math.js';

const ABI = ['function getUserAccountData(address) view returns (...all fields...)'];
const POLL_MS = 2000;
const ONE_SHOT = true;  // exit after first trigger (per architecture.md:20)

async function main() {
  const rpcUrl = `http://127.0.0.1:${CONFIG.FORK_PORT}`;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const pool = new ethers.Contract(CONFIG.AAVE_POOL, ABI, provider);

  console.log(`HF listener started. Polling ${rpcUrl} every ${POLL_MS}ms`);
  console.log(`Wallet: ${CONFIG.WALLET_ADDRESS}`);
  console.log(`Trigger at HF <= ${hfToNumber(hfToBigint(CONFIG.HF.TRIGGER))}`);
  console.log(`---`);

  while (true) {
    try {
      const data = await pool.getUserAccountData(CONFIG.WALLET_ADDRESS);
      const hf = data.healthFactor;  // bigint, 18-dec

      if (hf <= hfToBigint(CONFIG.HF.TRIGGER) && hf > 0n) {
        console.log(`TRIGGERED: HF=${hfToNumber(hf)} at ${new Date().toISOString()}`);
        await fireWebhook(hf, CONFIG.WALLET_ADDRESS);
        if (ONE_SHOT) {
          console.log(`One-shot mode: exiting. Re-run to re-arm.`);
          process.exit(0);
        }
      } else {
        console.log(`IDLE: HF=${hfToNumber(hf)}`);
      }
    } catch (err) {
      console.error(`ERROR: ${err instanceof Error ? err.message : err}`);
    }

    await new Promise(r => setTimeout(r, POLL_MS));
  }
}
```

Key design decisions:
- Uses `ethers` JsonRpcProvider directly (no `kh read` dependency — the listener must work without the CLI)
- `ONE_SHOT = true`: exits after one trigger. Prevents infinite re-fires. Demo operator re-runs the script for a second trigger.
- All errors logged to stderr with timestamps
- Webhook payload includes every field the workflow needs: `health_factor` (string), `user_address` (string), `triggered_at` (ISO 8601)

#### 3.2 Webhook Client

```typescript
async function fireWebhook(hf: bigint, address: string): Promise<string> {
  const response = await fetch(
    `https://app.keeperhub.com/api/workflows/${CONFIG.WORKFLOW_ID}/webhook`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.KEEPERHUB_API_KEY}`,
      },
      body: JSON.stringify({
        health_factor: hfToNumber(hf).toString(),
        user_address: address,
        triggered_at: new Date().toISOString(),
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Webhook ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  console.log(`Webhook accepted. Execution ID: ${data.executionId}`);
  return data.executionId;
}
```

#### 3.3 KeeperHub Workflow Skeleton

Created via KeeperHub API (not UI — must be reproducible):

```
POST /api/workflows
{
  name: "lax-liquidation-armor",
  tagId: "<AgentsOnchain2026 tag ID>",
  nodes: [
    { id: "trigger", type: "trigger", data: { config: { triggerType: "Webhook" } } },
    { id: "read_hf", type: "action", data: { config: { actionType: "aave-v3/get-user-account-data" } } },
    // Placeholder for approve + repay nodes (filled in S4)
  ],
  edges: [...]
}
```

The workflow is "enabled" but has placeholder nodes. In S4, we push the full node definition via PATCH.

#### 3.4 Listener Integration Test (`tests/hf-listener.test.ts`)

An integration test that:
1. Boots the Anvil fork (via `child_process.spawn`)
2. Seeds oracle + USDC
3. Starts the HF listener
4. Calls `drop-oracle-price.sh -5`
5. Waits for the listener to print "TRIGGERED"
6. Verifies the webhook was received (by checking local log)
7. Shuts everything down

This is a heavyweight test but it's the only integration test for the critical trigger path.

### Verification Gate

```
# 1. Boot fork + seed
./scripts/start-fork.sh && ./scripts/fork-setup-usdc.sh
# 2. Deploy workflow skeleton
./scripts/deploy-workflow.sh --skeleton
# 3. Start listener
npx tsx scripts/hf-listener.ts &
LISTENER_PID=$!
# 4. Verify idle log
sleep 4
# Must see: "IDLE: HF=..."
# 5. Trigger drop
./scripts/drop-oracle-price.sh -5
sleep 4
# Must see: "TRIGGERED: HF=1.04"
# Must see: "Webhook accepted. Execution ID: ..."
# 6. Listener exits (one-shot)
wait $LISTENER_PID || true
# 7. Verify execution exists in KeeperHub
kh r l <execution_id>  # must show status=success
# 8. Cleanup
./scripts/fork-shutdown.sh
```

### Gate Failure

If webhook endpoint doesn't exist: verify workflow has webhook trigger node (not manual). If KeeperHub API rejects the POST: check Authorization header, check workflow is enabled. If `ethers` RPC calls fail: verify fork is running, verify Aave Pool address is correct.

---

## P3.S4: Workflow Pipeline (Jul 17-20, 4 days)

**State**: LISTENER_READY → WORKFLOW_READY
**Depends on**: P3.S3 gate green (listener triggers, webhook fires)

### Why Here

This is the core engineering challenge. The workflow must execute `approve()` then `repay()` on Aave V3, with proper error handling, retries, and gas management. Every other subphase supports this one.

### Deliverables

#### 4.1 Full Workflow Definition

The workflow has 5 nodes:

1. **Webhook trigger** — receives POST from HF listener
2. **GetUserAccountData** — reads current HF, confirms ≤ 1.05, computes `exactRepayAmount` via the closed-form math
3. **Approve** — calls `web3/write-contract` on USDC: `approve(spender=Pool, amount=repayAmount + 1%)`
4. **Repay** — calls `aave-v3/repay`: `repay(asset=USDC, amount=repayAmount, rateMode=2, onBehalfOf=user)`
5. **Verify** — calls `getUserAccountData` again, checks `healthFactor >= 1.10`

Node-to-edge wiring:
```
trigger → read_hf → approve → repay → verify
                              └─→ (if verify fails) → read_hf (retry loop)
```

#### 4.2 Workflow Deployment Script (`scripts/deploy-workflow.sh`)

Reads `workflow-definition.json` (generated from TypeScript), calls PATCH `/api/workflows/<id>` with the full node+edge payload, enables the workflow, tags it.

The script is idempotent — re-running it updates the workflow in place.

```typescript
// src/workflow/definition.ts
export function workflowDefinition(config: typeof CONFIG): WorkflowPayload {
  return {
    nodes: [
      {
        id: 'trigger',
        type: 'trigger',
        data: { config: { triggerType: 'Webhook' } },
      },
      {
        id: 'read_hf',
        type: 'action',
        data: {
          config: {
            actionType: 'aave-v3/get-user-account-data',
            network: config.CHAIN_ID.toString(),
            user: config.WALLET_ADDRESS,
          },
        },
      },
      // ... approve, repay, verify nodes
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'read_hf' },
      { id: 'e2', source: 'read_hf', target: 'approve' },
      { id: 'e3', source: 'approve', target: 'repay' },
      { id: 'e4', source: 'repay', target: 'verify' },
    ],
    tagId: '<AgentsOnchain2026>',
    enabled: true,
  };
}
```

#### 4.3 Wallet Integration

The workflow's onchain action nodes reference `get_wallet_integration` output as the `walletId` parameter. This is handled automatically by KeeperHub's workflow engine — the user does not need to configure it.

For the safety plugin (running on the OpenCode side, not in the workflow), the `walletId` from the workflow is irrelevant. The safety plugin intercepts MCP calls from OpenCode, not internal workflow steps.

#### 4.4 Offline Workflow Simulation (`tests/workflow-pipeline.test.ts`)

A TypeScript integration test that simulates the full pipeline against the Anvil fork without needing KeeperHub at all:

```typescript
// 1. Boot Anvil fork
// 2. Seed oracle + USDC
// 3. Call getUserAccountData → get HF
// 4. Compute exactRepayAmount
// 5. Approve USDC via cast send
// 6. Repay via cast send
// 7. Verify HF recovery ≥ 1.10
// 8. Log all tx hashes
```

This test proves the math + contract interaction work correctly. If the KeeperHub workflow fails for an API reason, the pipeline still works — we can demo it via `cast send`.

#### 4.5 Gas Fallback Test

Two scenarios:
1. **Anvil fork (demo)**: The fork's pre-funded accounts have 10,000 ETH. Gas costs zero. Verify a transfer succeeds with `--gas false` (wallet-pays-gas).
2. **Simulated mainnet**: The wallet has 0 ETH on Base mainnet. If the `AgentsOnchain2026` tag is active, the paymaster covers gas. If not, the tx fails with "Insufficient BASE balance" — confirmed earlier via `kh execute transfer`.

The demo only uses scenario 1. Scenario 2 is documented for the judging criteria (proving we understand the gas sponsorship surface).

#### 4.6 Workflow Error Handling

The workflow must handle:
- **RPC timeout**: Retry with exponential backoff (1s, 2s, 4s, max 3 retries)
- **Gas spike**: On failure with `maxFeePerGas` exceeded, retry with 1.5x multiplier
- **Approve missing**: If `approve` wasn't called before `repay`, the Aave Pool reverts. The workflow should call `approve` first (guaranteed by edge ordering).
- **Revert reason**: If `repay` reverts, capture the revert string and include it in the execution log.

All errors visible in the dashboard.

### Verification Gate

```
# 1. Boot fork + seed
./scripts/start-fork.sh && ./scripts/fork-setup-usdc.sh
# 2. Deploy full workflow
./scripts/deploy-workflow.sh
# 3. Manual webhook trigger
curl -X POST <WEBHOOK_URL> \
  -H "Authorization: Bearer $KEEPERHUB_API_KEY" \
  -d '{"health_factor": "1.04", "user_address": "0x8Bb7870242e75132Fd62265cA8ABF771d49C821C"}'
# 4. Wait for completion
sleep 15
# 5. Check execution logs
kh r l <execution_id>
#    Step 1: read_hf → success, hf=1.04
#    Step 2: approve → success, tx hash = 0x...
#    Step 3: repay → success, tx hash = 0x...
#    Step 4: verify → success, final HF >= 1.10
# 6. Verify on-chain via fork
cast call 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5 \
  "getUserAccountData(address)(,,,,uint256,,,)" 0x8Bb7870242e75132Fd62265cA8ABF771d49C821C \
  --rpc-url http://127.0.0.1:18545
#    Must show HF >= 1.10
# 7. Offline simulation test
npx vitest run tests/workflow-pipeline.test.ts
# 8. Cleanup
./scripts/fork-shutdown.sh
```

### Gate Failure

If KeeperHub PATCH API doesn't accept the full workflow definition: deploy a simplified two-node version (webhook → web3/write-contract that calls `repay()` directly with ABI-encoded calldata). This skips the Aave plugin but still proves C1 (onchain tx through KeeperHub). Fix the full definition in parallel.

If Aave plugin's `repay` action doesn't work on Anvil fork: use `web3/write-contract` with manual ABI encoding. The demo narrative is identical — only the implementation detail changes.

---

## P3.S5: Dashboard (Jul 21-24, 4 days)

**State**: WORKFLOW_READY → DASHBOARD_READY
**Depends on**: P3.S4 gate green (workflow produces tx hashes and execution logs)

### Why Here

The dashboard is what the judge stares at for 3 minutes. It must be polished, responsive, and show the 8-beat demo flow exactly as designed in Phase 1. Every data point comes from real KeeperHub API calls or direct fork RPC reads — nothing is mocked.

### Visual Direction

The dashboard should look and feel like a terminal/CLI interface — monospace font, dark background, green/amber cursor-like indicators, minimal chrome. This reinforces the "engineer-built" narrative and makes the real-time data updates feel authentic. Think `htop` meets `glances` — data-heavy, text-priority, no gratuitous gradients or rounded corners.

### Deep Research (Before Build)

Before writing any dashboard code, research existing terminal-themed React dashboard templates on GitHub. Evaluate against:
- **Monospace-first design**: terminal aesthetic (dark bg, green/amber text, cursor indicators)
- **Tailwind CSS 4 compatibility**: easy to theme, no conflicting utility classes
- **Sponsor/Donate**: Accept Litecoin (LTC) and Solana (SOL) payments where possible. For the hackathon context, a simple "tip jar" footer with QR codes for LTC/SOL addresses satisfies this. If the template has a built-in payment component, adapt it.
- **Minimal deps**: no heavy animation libraries, no Three.js, no bloated component sets
- **Data polling built-in**: websocket or SSE support preferred over raw polling
- **MIT or Apache 2.0 license**: must be usable in a hackathon project without restrictions

Target: find 3-5 candidates, pick the best fit, fork it as `dashboard/` in the LAX repo. Fallback: build from scratch with Tailwind CSS + terminal theme (no template dependency).

### Deliverables

#### 5.1 Tech Stack

- React 19 + Vite 6 + TypeScript 5.7
- Tailwind CSS 4 + shadcn/ui (component library) — themed for terminal look (monospace, dark bg, green accents)
- Recharts (for the HF bar visualization — themed terminal-green)
- No React Router (single page, 3 screens toggled by state)
- No state management library (React context + custom hooks are sufficient)

#### 5.2 Screen Architecture

**Screen 1: Monitoring Dashboard** (Beats 1-3)

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

Key behaviors:
- HF bar is a horizontal bar that fills from 1.00 (empty) to 1.50 (full). Color transitions: GREEN (#22c55e) → YELLOW (#eab308) at 1.10 → ORANGE (#f97316) at 1.05 → RED (#ef4444) below 1.00
- Collateral/debt cards show USD values with the token icon
- Setup progress shows a checklist that turns green as each component confirms
- Heartbeat indicator pulses green every 2s when the HF listener is alive, turns red if no poll for 5s

**Screen 2: Mitigation Log** (Beats 4-7)

```
┌──────────────────────────────────────────────────────────────┐
│  ⚠ ALERT: HF dropped to 1.04 — Mitigation triggered         │
│  ──────────────────────────────────────────────────────────── │
│                                                              │
│  ┌─── Step 1: Approve ─────────────────────────────────────┐ │
│  │  Asset:    USDC                      ✅ 0x5c42a8b9...   │ │
│  │  Amount:   $0.90                     Gas: 0.0001 BASE   │ │
│  │  Spender:  Aave Pool (0xA238...)                        │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─── Step 2: Repay ───────────────────────────────────────┐ │
│  │  Asset:    USDC                      ✅ 0x8f93a2bc...   │ │
│  │  Amount:   $0.90                     Gas: 0.0003 BASE   │ │
│  │  Mode:     Variable (2)              Retries: 1         │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─── Step 3: Verify ──────────────────────────────────────┐ │
│  │  Health Factor restored to:  1.10    ✅ Resolved         │ │
│  │  Total time: 4.8s                    Total gas: $0.0004  │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

Key behaviors:
- Appears as a slide-in overlay when trigger fires
- Each step transitions from pending (gray) → running (blue spinner) → success (green checkmark with tx hash) → failure (red X with revert reason)
- Steps animate in sequence: Step 1 completes before Step 2 starts
- Retries shown as a small badge on the step (e.g., "⚠ 1 retry: gas spike")

**Screen 3: Audit Trail** (Beat 8 + persistent footer)

```
┌──────────────────────────────────────────────────────────────┐
│  Verification                                                │
│  ──────────────────────────────────────────────────────────── │
│                                                              │
│  🔗 Execution Link: app.keeperhub.com/runs/exec_8f93a2...   │
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

The KeeperHub link is clickable and opens `app.keeperhub.com/runs/<id>` in a new tab — this is the "wow" moment (beat 8). The judge clicks and sees the real KeeperHub audit trail page.

#### 5.3 Polling Architecture

Two custom hooks:

**`useExecutionPoller(executionId: string | null)`**

- Polls at 1s intervals while `status === 'running'`
- Polls at 5s intervals while `status === 'success' | 'failed'`
- Stops polling when `status === 'success'` (data is cached)
- Returns `WorkflowExecution | null`

The poller hits a local proxy that calls KeeperHub's `get_execution_logs` via `kh r st --json` (wraps the CLI for simplicity).

**`usePositionPoller(walletAddress: string)`**

- Polls every 2s via direct RPC call to the Anvil fork
- Returns `UserPosition`
- On error (fork down), returns last known position + sets a "Fork disconnected" state

#### 5.4 Edge Case Handling (from architecture.md:401-410)

| Edge Case | Implementation | Visual |
|-----------|---------------|--------|
| HF listener died | `usePositionPoller` sets `listenerAlive = false` if no poll response in 5s | "⚠ HF Listener Disconnected" banner, fallback to manual trigger button |
| Gas fallback | `WorkflowExecution.steps[].output.gasPriceGwei` shows 0 if fork | "ⓘ Gas: wallet-pays-gas (fork, no cost)" |
| Wallet timeout | Timer starts when step 2/3 goes to running. If >30s, mark failed. | Progress bar on step, red X after 30s |
| Mitigation revert | `WorkflowExecution.steps[].error` contains revert string | Step shows red ❌ with the exact Aave revert reason |
| Cold start | No `UserPosition` data yet | Skeleton spinner + "❖ Connecting to Anvil fork..." |
| No trigger | `MitigationEvent` is null | "All clear. HF = 1.20" in green |

#### 5.5 Responsive Layout

Dashboard must be readable on a projector (1920x1080 minimum). Font sizes are at least 16px. The 3 screens are vertical in the DOM — no horizontal scroll.

### Verification Gate

```
# 1. Boot full stack
./scripts/lax
# 2. Open http://localhost:5173
# Screen 1: HF bar shows > 1.00, collateral/debt non-zero, setup 6/6 green
# 3. Drop oracle price by 5%
./scripts/drop-oracle-price.sh -5
# Bar shrinks, turns YELLOW (if HF < 1.10) or maintains GREEN
# 4. Drop by another 3% (triggers)
./scripts/drop-oracle-price.sh -3
# Screen 2 slides in: Steps animate one by one
# Each step shows tx hash when confirmed
# Final: "RESOLVED — HF restored to 1.10"
# 5. Screen 3 shows clickable KeeperHub link
# Click link → opens app.keeperhub.com/runs/<id>
# 6. Record full flow with OBS
```

### Gate Failure

If shadcn/ui setup takes >1 day: use plain Tailwind CSS without a component library. The visual quality difference is negligible on a projector. If Recharts doesn't work for the HF bar: use a simple div with CSS transitions. The bar is a visual metaphor, not a technical challenge.

---

## P3.S6: Hardening, Bounty, & Demo Prep (Jul 25-26 + hackathon window)

**State**: DASHBOARD_READY → PHASE3_COMPLETE
**Depends on**: P3.S5 gate green

### Why Here

Everything works. Now make it bulletproof and package it for the judges. This subphase has two tracks that run in parallel:

- **Hardening**: offline mode, safety plugin full test, 5 dry runs, Tenderly recording
- **DX Bounty**: `scripts/setup.sh`, `docs/SETUP.md`, starter template

### Track A: Hardening (3 days)

#### 6.1 Offline Mode

The demo must work without network. Two approaches:

1. **Fork state cache**: `anvil_dumpState` after seeding → `anvil_loadState` at demo time. Scripts: `fork-save-state.sh`, `fork-restore-state.sh`. The state dump is ~50-200 MB.

2. **Dashboard state cache**: The dashboard's `usePositionPoller` and `useExecutionPoller` persist the last known state to `localStorage`. On startup, if no fork is reachable, the dashboard shows the cached state with a "📡 Offline — showing cached data" banner.

#### 6.2 Tenderly Recording

Per ADR-007, Tenderly is the backup demo link. A Tenderly fork of Base mainnet at the pinned block, recorded with the full mitigation flow, produces a shareable simulation URL.

Steps:
1. Create a Tenderly fork of Base mainnet at the pinned block
2. Use Tenderly's dashboard to override the oracle price
3. Run the HF listener against the Tenderly fork
4. Execute the workflow
5. Copy the Tenderly simulation URL for Screen 3

#### 6.3 Full Dry Run

```
for i in {1..5}; do
  echo "=== Dry run $i ==="
  ./scripts/lax
  sleep 3
  ./scripts/drop-oracle-price.sh -5
  sleep 2
  ./scripts/drop-oracle-price.sh -3
  sleep 15
  # Verify RESOLVED status in dashboard
  ./scripts/fork-shutdown.sh
  sleep 2
done
echo "All 5 dry runs passed"
```

Each dry run timing is recorded. The slowest run dictates the demo script timing.

#### 6.4 Safety Plugin Full Test

```typescript
import { checkSafety } from '../src/safety-plugin/guardrails';

// Test 1: Approve is allowed (not denied)
assert(checkSafety('web3/write-contract', { data: '0x095ea7b3...' }).allowed === true);

// Test 2: transferFrom is denied
assert(checkSafety('web3/write-contract', { data: '0x23b872dd...' }).allowed === false);

// Test 3: Unknown selector is denied
assert(checkSafety('web3/write-contract', { data: '0xaabbccdd...' }).allowed === false);

// Test 4: Under daily cap is allowed
assert(checkSafety('transfer', { value: '1000000000000000' }).allowed === true);  // 0.001 ETH

// Test 5: Over daily cap is denied
// (after accumulating $5.00 in prior calls)
assert(checkSafety('transfer', { value: '5000000000000000000' }).allowed === false);
```

#### 6.5 Edge Case Walkthrough

Manually walk through each edge case from architecture.md:401-410:

1. Kill HF listener → verify dashboard shows warning banner
2. Kill anvil → verify dashboard shows "Fork disconnected"
3. Trigger with no USDC balance → verify workflow fails gracefully
4. Trigger twice → verify one-shot listener exits after first

### Track B: DX Bounty (2 days)

#### 6.6 One-Click Setup (`scripts/setup.sh`)

A single bash script that:
1. Checks prerequisites (Node, Foundry, `kh` CLI)
2. Runs `npm install`
3. Prompts for `KEEPERHUB_API_KEY` (or reads from `.env`)
4. Runs `kh auth login --with-token`
5. Runs `kh wallet add` (provisions Turnkey wallet)
6. Deploys the workflow via `scripts/deploy-workflow.sh`
7. Boots the fork via `scripts/start-fork.sh`
8. Seeds oracle + USDC via `scripts/fork-setup-usdc.sh`
9. Starts the dashboard
10. Prints the dashboard URL

Total commands for the user: `git clone <url> && cd lax && ./scripts/setup.sh`

#### 6.7 Setup Documentation (`docs/SETUP.md`)

Five numbered commands. Screenshot of each command's terminal output. Troubleshooting table for the 3 most common failures (API key not set, Foundry not found, port in use).

#### 6.8 Starter Template

A separate branch or directory (`bootstrap/`) that contains the minimum viable LAX without the dashboard: just the HF listener, the workflow definition, and the fork scripts. The user can `cp -r bootstrap/* .` to have a working CLI-only version in 5 minutes.

### Verification Gate

```
# Fresh clone test
cd /tmp
git clone <url> lax-fresh
cd lax-fresh
./scripts/setup.sh
# Must print: "LAX ready. Open http://localhost:5173"
# No manual steps beyond pasting the API key

# Offline test
killall anvil
./scripts/fork-restore-state.sh  # loads cached fork state
npx tsx scripts/hf-listener.ts &  # must work without network
./scripts/drop-oracle-price.sh -3  # must override price
# Dashboard shows "📡 Offline" banner but data is live

# Safety test
npx vitest run src/safety-plugin/guardrails.test.ts
# Must pass all 5 tests

# 5 dry runs pass
for i in {1..5}; do
  ./scripts/lax && sleep 3 && \
  ./scripts/drop-oracle-price.sh -5 && sleep 2 && \
  ./scripts/drop-oracle-price.sh -3 && sleep 15 && \
  ./scripts/fork-shutdown.sh || exit 1
done

# Final commit
git status  # must show no staged changes
npm run lint  # 0 errors
npm test  # all pass
```

---

## Time Budget Summary

| Subphase | Days | Hours/Day | Total Hours | Calendar |
|----------|------|-----------|-------------|----------|
| S1 Foundation | 3 | 4 | 12 | Jul 6-8 |
| S2 Fork | 4 | 5 | 20 | Jul 9-12 |
| S3 Listener | 4 | 5 | 20 | Jul 13-16 |
| S4 Workflow | 4 | 5 | 20 | Jul 17-20 |
| S5 Dashboard | 4 | 5 | 20 | Jul 21-24 |
| S6 Hardening | 2 | 5 | 10 | Jul 25-26 |
| **Build complete** | **21** | | **102** | **Jul 6-26** |
| S6 Bounty | 3 | 5 | 15 | Jul 27-29 |
| S6 Polish | 5 | 5 | 25 | Jul 30 - Aug 13 |
| **Hackathon complete** | **17** | | **40** | **Jul 27 - Aug 13** |

Each day assumes 4-5 hours of focused engineering. This is a solo project — no meetings, no code reviews, no QA bottleneck.

---

## Architecture Rules (Enforced at every gate)

From docs/architecture.md:528-538:

1. **No unused deps** — `npm ls --prod` must be clean
2. **No new MCP servers** — aggregate + per-workflow only
3. **No hardcoded addresses outside `src/config.ts`** — every chain ID, address, block number in exactly one file
4. **No sync `fs` in agent loop** — all file I/O through `fs.promises`
5. **No `.then()`** — `async/await` everywhere
6. **No `any` types** — every variable typed concretely
7. **Every error visible in dashboard** — no silent `null`
8. **Only what helps the 3-minute demo** — golden rule

---

## Stop Conditions

Halt and request review if:

1. **S2 oracle override fails**: `anvil_setStorageAt` + `anvil_setCode` both fail on the Chainlink Aggregator. The demo loses live HF manipulation. Fall back to pre-recorded video.

2. **S4 workflow deployment fails**: KeeperHub API rejects the 5-node workflow definition. Use the simplified two-node version. Still proves C1 and C2.

3. **S5 dashboard takes >6 days**: Cut to CLI-only output. Judge still sees tx hashes and execution IDs in the terminal. Less impressive but the core claim is provable.

4. **Any component exceeds 2x time budget**: Stop and ask for scope decisions. The hackathon has 38 more days — time is on our side if we learn the right lesson from the failure.

5. **Offline mode fails**: Anvil state dump is corrupted or too large. Cut offline mode. The demo must have wifi. Record backup video.

6. **Foundry/OpenCode/NIM version change breaks compatibility**: Pin all versions in `package.json` and `.tool-versions`. Test upgrades separately.
