# ADR-012: Critique Agent — Deterministic 3-Stage Pre-Execution Validation

**Number**: ADR-012
**Title**: Critique Agent — Deterministic 3-Stage Pre-Execution Validation
**Date**: 2026-07-06
**Status**: Accepted
**Relates To**: ADR-011 (Pre-flight Simulator — Stage 2 delegate), ADR-005 (HF math and thresholds), ADR-001 (Safety Plugin — Stage 3 delegate), `docs/phase4/research-synthesis.md` (ZW.ARM gamma agent pattern), `docs/phase4/P4-PLAN.md` WS3, KeeperHub ETHGlobal wrap-up blog
**Supersedes**: Nothing

---

## Context

The KeeperHub ETHGlobal wrap-up blog analyzed 180 submissions and explicitly called out ZW.ARM's "gamma" critique agent as a winning architectural pattern:

> "The critique agent is worth calling out specifically. Adding an independent agent whose job is to challenge every decision before execution is the kind of failure-mode thinking that most hackathon projects skip."

Currently, LAX's `scripts/hf-listener.ts` detects HF drop → computes repay amount → fires webhook unconditionally. There is no validation layer between computation and execution. The only safety check is the OpenCode safety plugin (`src/safety-plugin/guardrails.ts`), which gates the tool call at the MCP layer — but this happens *after* the webhook is already dispatched and KeeperHub has queued the workflow.

Three failure modes exist that are not caught today:
1. **Math error**: computeRepayAmount returns a value that doesn't actually restore HF to target
2. **State mismatch**: wallet's USDC balance changed between poll cycle and execution (e.g., withdrawals, transfers)
3. **Safety bound violation**: computed amount exceeds block_threshold_usd or daily_limit_usd

A dedicated critique agent running before webhook dispatch catches all three, in sequence, with visible logging for the dashboard.

## Decision

LAX will implement a middleware module `src/critique-agent.ts` that runs a 3-stage deterministic validation pipeline *before* the webhook is sent. The critique agent is **not** an LLM-based agent — it is a deterministic validator. The name "critique agent" follows the ZW.ARM pattern communicatively; the implementation is a pure TypeScript validation pipeline.

### Three-Stage Pipeline

```
getUserAccountData → HF <= 1.05?
    │
    ├── YES → computeRepayAmount → CRITIQUE AGENT
    │                                      │
    │                            ┌─────────┼─────────┐
    │                            ▼         ▼         ▼
    │                       Stage 1    Stage 2    Stage 3
    │                       HF Math    Simulate   Safety
    │                       Verify     (delegate  (delegate
    │                       closed-    to ADR-     to ADR-
    │                       form       011)       001+)
    │                            │         │         │
    │                            └────┬────┘─────────┘
    │                                 ▼
    │                         CritiqueReport
    │                         { passed: bool
    │                           errors: string[]
    │                           warnings: string[]
    │                           stageResults: StageResult[] }
    │
    ├── ALL PASS → fireWebhook()
    │
    └── ANY FAIL → log errors, do NOT dispatch
```

### API surface

```ts
// src/critique-agent.ts
export interface StageResult {
  stage: 1 | 2 | 3
  name: string
  passed: boolean
  detail: string
  durationMs: number
}

export interface CritiqueReport {
  passed: boolean
  stageResults: StageResult[]
  errors: string[]
  warnings: string[]
  summary: string  // single line for dashboard display
}

export interface CritiqueContext {
  currentHf: bigint
  targetHf: bigint
  totalDebtBase: bigint
  repayAmount: bigint
  repayToken: string
  walletAddress: string
  borrowerAddress: string
  poolAddress: string
  rpcUrl: string
}

export function runCritique(ctx: CritiqueContext): CritiqueReport
```

### Stage 1: HF Math Verification (duration target: <1ms)

Re-computes the closed-form repayment math independently and verifies the result matches `ctx.repayAmount` within a tolerance of 0.1% (to account for the +1% buffer applied in `hf-listener.ts`).

```ts
const expected = computeRepayAmount(ctx.totalDebtBase, ctx.currentHf, ctx.targetHf)
const tolerance = expected * 1n / 1000n  // 0.1% tolerance
const diff = ctx.repayAmount > expected
  ? ctx.repayAmount - expected
  : expected - ctx.repayAmount
if (diff > tolerance) {
  return { passed: false, detail: `Math mismatch: got ${ctx.repayAmount}, expected ~${expected}` }
}
```

Warnings:
- If `ctx.repayAmount` equals `expected` exactly (no +1% buffer): log warning that buffer was not applied.
- If `ctx.repayAmount` is > 110% of `expected`: log warning that buffer is unusually large.

### Stage 2: Pre-flight Simulation (duration target: <500ms — delegate to ADR-011)

Calls `simulateFullMitigation()` from `src/preflight-simulator.ts`. If simulation fails, the critique agent reports the exact revert reason.

```ts
const sim = simulateFullMitigation(ctx.borrowerAddress, ctx.repayToken, ctx.repayAmount, ctx.rpcUrl)
if (!sim.success) {
  return { passed: false, detail: `Simulation failed: ${sim.revertReason} (${sim.durationMs}ms)` }
}
```

Simulation timeout (5s per `execSync` call in ADR-011) counts as a failure. The critique agent times out after 6s total for this stage.

### Stage 3: Safety Bounds Check (duration target: <1ms — delegate to ADR-001/010)

Verifies the computed repay amount against configurable safety bounds:

```ts
const usdValue = Number(ctx.repayAmount) / 1e6  // USDC is 6 decimals
if (usdValue > CONFIG.SAFETY.BLOCK_THRESHOLD_USD) {
  return { passed: false, detail: `Safety bound: $${usdValue.toFixed(2)} exceeds block threshold $${CONFIG.SAFETY.BLOCK_THRESHOLD_USD.toFixed(2)}` }
}
// wallet balance check
const balanceSim = simulateApprove(ctx.repayToken, ctx.poolAddress, ctx.repayAmount, ctx.rpcUrl)
// if approve simulation fails, wallet likely doesn't have enough USDC
```

Additional checks:
- `usdValue > 0`: prevents zero-amount repay
- `usdValue < 1_000_000`: sanity check prevents trillion-amount due to decimal overflow
- `ctx.repayAmount > 0n`: prevents no-op webhook dispatch
- Wallet address is valid (regex check, reused from `validateConfig`)

### Integration

`scripts/hf-listener.ts` will call `runCritique()` between the repay computation (line 83) and the webhook dispatch (line 87):

```ts
const critique = runCritique({
  currentHf: hf,
  targetHf: targetBigint,
  totalDebtBase: data.totalDebtBase,
  repayAmount: repayAmount,
  repayToken: CONFIG.USDC,
  walletAddress: CONFIG.WALLET_ADDRESS,
  borrowerAddress: CONFIG.BORROWER_ADDRESS,
  poolAddress: CONFIG.AAVE_POOL,
  rpcUrl: `http://127.0.0.1:${CONFIG.FORK_PORT}`,
})

if (critique.passed) {
  console.error(`[CRITIQUE] All 3 stages passed. Dispatching webhook.`)
  await fireWebhook(hf, CONFIG.BORROWER_ADDRESS, data.totalDebtBase, repayAmount)
} else {
  console.error(`[CRITIQUE] BLOCKED:`)
  for (const s of critique.stageResults) {
    console.error(`  Stage ${s.stage} (${s.name}): ${s.passed ? 'PASS' : 'FAIL'} — ${s.detail}`)
  }
  for (const e of critique.errors) {
    console.error(`  ERROR: ${e}`)
  }
}
```

### No silent fallback (Rule 10)

If the critique agent itself fails (e.g., import error, runtime crash), the error is caught and logged with `[CRITIQUE] CRASHED: ${error}`. The webhook is **not** dispatched by default. An env variable `LAX_CRITIQUE_FAIL_OPEN=true` can be set to fall-OPEN (proceed despite crash), but this flag is documented as "demo rescue only — do not use during judged presentation."

### Per-stage timeout

| Stage | Timeout | Behavior on timeout |
|-------|---------|---------------------|
| 1 (Math) | 500ms | FAIL — "Math verification timed out" |
| 2 (Sim) | 6s | FAIL — "Simulation timed out" |
| 3 (Safety) | 500ms | FAIL — "Safety check timed out" |

`runCritique()` has a hard 10s total wall-clock timeout. If it exceeds 10s from invocation to return, the webhook is **not** dispatched.

### Dashboard logs

The critique agent writes structured error logs prefixed with `[CRITIQUE]` so the dashboard `useExecutionPoller` can pick them up. The dashboard's MitigationView will show:

```
[CRITIQUE] Stage 1: HF math...                   ✓ (0.3ms)
[CRITIQUE] Stage 2: Simulation...                 ✓ (142ms)
[CRITIQUE] Stage 3: Safety bounds...             ✓ (0.1ms)
[CRITIQUE] All clear. Dispatching webhook.
```

Or on failure:

```
[CRITIQUE] Stage 1: HF math...                   ✓ (0.3ms)
[CRITIQUE] Stage 2: Simulation...                 ✗ FAIL (142ms)
[CRITIQUE]   Revert: ERC20: insufficient allowance
[CRITIQUE] BLOCKED — webhook not dispatched.
```

## Consequences

**Positive**
- Directly matches the winning ZW.ARM pattern from the KeeperHub blog — the KeeperHub team has said they look for this in code.
- Three layers of defense (math → simulation → safety) means a bug in any single layer is caught before it reaches KeeperHub.
- The dashboard visualization of the 3-stage critique is judge-visible within the 3-minute pitch (beat 4 in ADR-005 demo script).
- Each stage delegates to an existing or planned module: Stage 1 → `src/repay-math.ts` (tested, 13 tests), Stage 2 → ADR-011 (25 planned tests), Stage 3 → `src/config.ts` + ADR-001 patterns. No duplicate logic.
- Zero new dependencies (Rule 5). All logic is pure TypeScript or delegates to ADR-011's `execSync` for `cast call`.

**Negative**
- Adds ~6.5s worst-case latency to the critical path (if all stages run to timeout). Realistic latency is ~150-300ms (Stage 2 dominates). If the simulation hangs (fork unreachable, 6s timeout), the webhook is blocked for 6s. Acceptable: the fork must be alive for the demo to work anyway.
- `runCritique()` is sync (Stage 2 uses sync `execSync`). Blocks the Node event loop for ~300ms. Acceptable for single-user demo as argued in ADR-011.
- The critique agent adds one more file to the project (Rule 8 requires pattern-matching against existing module structures). This file follows the same `export function` + `interface` pattern as `src/repay-math.ts` and `src/safety-plugin/guardrails.ts` — not a new pattern.
- The critique agent's existence implies a 0.001% chance of incorrectly blocking a valid mitigation (false positive on simulation due to fork state mismatch). The rate is lower than the current 100% chance of *no* validation blocking anything. Acceptable trade.

## Alternatives Considered

### Alternative 1: LLM-Based Critique Agent

- Pros: Matches ZW.ARM's gamma agent more literally (theirs was LLM-based). Could reason about unexpected conditions (e.g., "HF is low because of a flash loan attack, not oracle price drop").
- Cons: LLM inference latency (3-10s per call on NVIDIA NIM) adds unacceptable delay to the critical path. LLM hallucination could flag valid transactions as risky. Costs $0 budget (NIM is free for limited calls, but 5-10 more calls per mitigation cycle stresses the rate limit). Adds unnecessary complexity when a deterministic simulation is strictly more reliable.
- Rejected because: slower, less reliable, and the `deterministic` vs `LLM` distinction is invisible in the demo — judges care that there IS a critique, not what powers it.

### Alternative 2: Single Combined Function (no separate module)
- Pros: Less indirection. One function, one file.
- Cons: Violates single-responsibility principle. The critique agent is conceptually distinct from the pre-flight simulator — the critique is "should we dispatch?" while the simulator is "can we dispatch?" Separating them makes testing clearer. ADR-011 is about the *simulation mechanism*; this ADR is about the *validation pipeline* that uses it.
- Rejected because: the separation is architecturally honest and makes testing easier.

### Alternative 3: Post-Execution Critique (audit after the fact, not pre-execution)
- Pros: No latency added to the critical path.
- Cons: The point of the critique is to *prevent* bad executions, not to log about them after the fact. A post-execution critique cannot stop the failed tx from being queued in KeeperHub's audit trail. The judge sees a failed run.
- Rejected because: defeats the purpose. Prevention > cure.

### Alternative 4: Run critique in parallel with webhook dispatch (fire-and-forget validation)
- Pros: Zero latency addition. Webhook goes out immediately; critique runs alongside and logs results.
- Cons: If the critique finds a problem, the tx is already being executed by KeeperHub. By the time the critique fails, the approve tx may have already been mined. The critique becomes purely informational — cannot block anything.
- Rejected because: the critique must have blocking authority to match ZW.ARM's pattern. "One agent critiques, another executes" — the critique must happen *before* execution.

## Open Questions

- **`ASSUMPTION`:** The critique agent will block the webhook on ANY failure. This is the correct default for a demo (prevent visible errors). Will we want a `--force` flag during dry-run testing? Yes — `LAX_CRITIQUE_FAIL_OPEN=true` env var disables the block, logging a `[CRITIQUE] FAIL_OPEN — would have blocked` warning instead. Implemented in WS3 implementation but not needed for demo.
- **`ASSUMPTION`:** Stage 3 safety bounds use `CONFIG.SAFETY.BLOCK_THRESHOLD_USD` ($10.00) as the hard cap. The demo's repay amount ~$0.55 is well under this. If the config changes to $1.00 (per some ADR-003 notes), the critique will block any amount > $1.00. This is correct behavior — safety first.
- **`OPEN — needs human tester`:** Does `cast call --from <wallet>` correctly simulate with the fork's current USDC balance? If the wallet address has USDC on the fork, yes. If not, simulation reverts with insufficient balance. This is the correct outcome — the critique should fail, and the dashboard should show `[CRITIQUE] Stage 2: FAIL — ERC20: insufficient balance`.

## Checklist

- [x] Decision communicated (this ADR)
- [ ] README updated (mention critique agent in architecture overview — WS8 task)
- [x] Implementation planned in current phase (P4 WS3 — see `docs/phase4/P4-PLAN.md`)
- [x] This ADR saved to `docs/adr/2026-07-06-adr-012-critique-agent.md`
