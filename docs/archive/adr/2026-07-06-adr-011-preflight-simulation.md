# ADR-011: Pre-Flight Simulation via `cast call` on Anvil Fork

**Number**: ADR-011
**Title**: Pre-Flight Simulation via `cast call` on Anvil Fork
**Date**: 2026-07-06
**Status**: Accepted
**Relates To**: ADR-005 (Aave V3 Onchain Path — two-step approve→repay), ADR-007 (Tenderly/Anvil fork demo env), ADR-010 (Dashboard dependency policy — no ethers in dashboard), `docs/phase4/Onchain Agent Strategy Metaplan.md:139-174`, `docs/phase4/P4-PLAN.md` WS2, `docs/phase4/research-synthesis.md` (ZW.ARM gamma pattern)
**Supersedes**: Nothing

---

## Context

The KeeperHub wrap-up blog (research-synthesis.md) called out the "critique agent" pattern as a winning differentiator: an independent agent whose job is to challenge every mitigation decision *before* execution. Per ZW.ARM's gamma agent: "the kind of failure-mode thinking that most hackathon projects skip." The Strategy Metaplan (line 139-174) specified a pre-flight transaction simulation engine to verify on the local Anvil fork that the proposed approve → repay sequence will succeed before submitting the workflow to KeeperHub.

Current pipeline (`scripts/hf-listener.ts:71-104`) detects HF drop, computes repay amount via closed-form math (`src/repay-math.ts`), adds +1% buffer (line 83), and fires the webhook unconditionally. There is no simulation step. If the computed amount is wrong (math error, decimal mismatch, allowance already consumed), the failure surfaces *after* KeeperHub has queued the workflow — too late to recover gracefully in a demo.

The demo flow (ADR-005 beat 5–6) requires two visible onchain transactions: `approve(USDC, aavePool, exactRepayAmount)` then `repay(USDC, exactRepayAmount, 2, onBehalfOf)`. A failed tx in the demo is unrecoverable in real-time without a recording fallback. Pre-flight simulation on the fork avoids this.

## Decision

LAX will implement a TypeScript module `src/preflight-simulator.ts` that uses **`cast call`** (via `child_process.execSync`) to simulate the approve → repay sequence on the local Anvil fork *before* the webhook is dispatched.

### API surface

```ts
// src/preflight-simulator.ts
export interface SimulationResult {
  success: boolean
  stage: 'APPROVE' | 'REPAY' | 'FULL'
  gasEstimate?: string
  revertReason?: string
  rawOutput?: string
  durationMs: number
}

export function simulateApprove(
  tokenAddress: string,
  spender: string,
  amountWei: bigint,
  rpcUrl: string,
): SimulationResult

export function simulateRepay(
  poolAddress: string,
  tokenAddress: string,
  amountWei: bigint,
  interestRateMode: 1 | 2,
  onBehalfOf: string,
  rpcUrl: string,
): SimulationResult

export function simulateFullMitigation(
  userAddress: string,
  repayToken: string,
  repayAmount: bigint,
  rpcUrl: string,
): SimulationResult
```

### Implementation constraints

1. **No new dependencies.** Uses Node.js built-in `child_process.execSync` (already available via `@types/node@^22.0.0` in root `package.json`). `cast` binary ships with Foundry which is already installed at `~/.foundry/bin/`.
2. **cast call, not cast send.** `cast call` simulates via `eth_call` — does not mine a tx, does not consume gas, does not mutate state. This is the correct primitive for pre-flight check.
3. **FROM/impersonation.** `cast call` accepts `--from <address>` to simulate from the wallet's address. We pass `--from ${CONFIG.WALLET_ADDRESS}` so the simulation reflects the wallet's actual USDC balance and allowance state.
4. **Timeout.** Each `execSync` call passes `{ timeout: 5000 }` — if the fork is unresponsive (Anvil killed by bash time-out), the simulator returns `{ success: false, revertReason: 'SIMULATION_TIMEOUT' }` instead of hanging the listener.
5. **No silent failures (Rule 10).** Every non-zero exit from `cast` is parsed and surfaced. Empty `revertReason` is forbidden — if we cannot parse a reason, we surface `'UNKNOWN_REVERT'` with the raw stderr in `rawOutput` so the dashboard can render it.
6. **Sync not async.** `execSync` blocks the listener loop while simulating. Acceptable: the listener polls at 2-second intervals (POLL_MS in `src/config.ts`), and `cast call` on a local Anvil fork returns in ~50-150ms. Blocking for ~300ms total (approve + repay) is well under one poll cycle.

### Integration point

`scripts/hf-listener.ts:86-90` calls `fireWebhook()` unconditionally. After WS2, the flow becomes:

```ts
if (CONFIG.WORKFLOW_ID) {
  const sim = simulateFullMitigation(
    CONFIG.BORROWER_ADDRESS,
    CONFIG.USDC,
    repayAmount,
    `http://127.0.0.1:${CONFIG.FORK_PORT}`,
  )
  if (!sim.success) {
    console.error(`[SIMULATION] FAILED — ${sim.revertReason}. Aborting webhook.`)
    // Do NOT fire webhook. The error is visible in the dashboard.
  } else {
    console.error(`[SIMULATION] Passed ✓ (gas ~${sim.gasEstimate}). Dispatching webhook.`)
    await fireWebhook(hf, CONFIG.BORROWER_ADDRESS, data.totalDebtBase, repayAmount)
  }
}
```

### Revert reason parsing

`cast call` exits non-zero on revert. The stderr contains the revert reason in one of these formats observed in actual Foundry output:

- `error: execution reverted: ERC20: insufficient allowance`
- `error: execution reverted with reason: Custom error message`
- `error: execution reverted with custom error 'InvalidArgument()'`
- `Error: ... (code: -32000)`

The parser (in `parseRevertReason(stderr: string): string`) handles all four cases. If none match, returns `'UNKNOWN_REVERT'` with the full stderr attached in `rawOutput` for debugging.

### Gas estimate

`cast call --gas <estimate>` is not used because eth_estimateGas on simulated state can be misleading. Instead, `gasEstimate` is captured from `cast call`'s `--json` output where available, otherwise left undefined. The dashboard shows the estimate as a range ("~175K") not a precise number.

## Consequences

**Positive**
- Demo becomes robust: a computed repay amount that would revert is caught before KeeperHub queues the workflow, keeping the position intact and the audit trail clean.
- Provides the foundation for the critique agent (ADR-012). The critique agent reuses `simulateFullMitigation()` as its Stage 2 check.
- The terminal log line `[SIMULATION] Passed ✓` is judge-visible in the dashboard console — directly maps to the "reliability & observability" criterion.
- Zero new dependencies (Rule 5). Uses only Node built-ins and the already-installed Foundry toolchain.
- Closed-form math module (`src/repay-math.ts`) validates input numbers; pre-flight simulator validates the actual onchain state. Defense in depth — the math can be correct and the simulation can still fail if the wallet has insufficient USDC.

**Negative**
- Adds ~300ms to the webhook dispatch latency on the critical path. With webhook base latency of 500-1200ms (per ADR-005), total time-to-dispatch rises from ~1s to ~1.3s. Still well under the "sub-3-second response" pitch claim — the budget is fine.
- Sync `execSync` blocks the Node event loop. Acceptable for a single-user demo listener. Would be wrong for a production multi-tenant system — flagged as a known limitation, not refactored.
- `cast` must be in PATH when the listener runs. The demo laptop MUST have Foundry installed. Mitigation: `scripts/setup.sh` already checks for Foundry at install time and prints install instructions if missing.
- Fork must be alive. If the listener is running against real Sepolia or Base mainnet (non-fork), `cast call --from <wallet>` cannot simulate from an address that doesn't sign. Mitigation: env-gated. `simulateFullMitigation` checks if `rpcUrl` starts with `http://127.0.0.1` — if not, returns `{ success: false, revertReason: 'FORK_REQUIRED' }` and the listener proceeds without simulation (with a warning log). Non-fork execution falls back to closed-form math + safety plugin (ADR-001) only.

## Alternatives Considered

### Alternative 1: Use ethers `provider.call(transaction)` directly
- Pros: No shell-out. Pure TypeScript. Already used elsewhere in the codebase (`scripts/hf-listener.ts:61` uses `ethers.JsonRpcProvider`).
- Cons: ADR-010 explicitly forbids ethers in the dashboard but allows it in the root project (where `ethers` is a declared dependency). However, ethers `provider.call()` does not support `from` simulation cleanly — `eth_call`'s `from` field is widely supported but ethers abstracts it via `TransactionRequest.from` which is inconsistently honored. `cast call --from` is cleaner and unambiguous. Also, raw ethers would require us to ABI-encode the calldata ourselves; `cast call` does signature-based encoding inline.
- Rejected because: more code, more places to make encoding mistakes, and `from` simulation has fewer surprises with `cast` than with ethers' transaction request normalization.

### Alternative 2: Tenderly Simulation API
- Pros: Production-grade, supports mainnet state without a fork, gives detailed trace data.
- Cons: Requires Tenderly API key (violates ADR-006's $0 budget constraint if paid tier needed). Free tier has limits. Adds a network dependency to the demo (R-005 wifi risk). The Anvil fork is already alive for the demo — running simulation on it is free and offline-capable.
- Rejected because: violates $0 budget, adds external dependency, and the Anvil fork already gives us everything Tenderly would.

### Alternative 3: Anvil's `eth_simulateV1` direct RPC
- Pros: Single RPC call, no shell-out, no `cast` dependency.
- Cons: `eth_simulateV1` is not enabled in all Anvil versions — version-dependent support. Harder to debug: errors come back as opaque RPC `error.code` objects without the nice human-readable `cast` formatting. More complex TypeScript encoding.
- Rejected because: version drift risk and worse error messages.

### Alternative 4: Skip simulation entirely; rely on closed-form math only
- Pros: Zero work. The closed-form math in `src/repay-math.ts` already generates 13 passing tests.
- Cons: Per research-synthesis.md, the critique agent pattern was *the* specific call-out from the KeeperHub team as winning failure-mode thinking. Skipping it leaves us in the "shallow integration" tier that 30 of 180 projects fell into. The demo also has no second line of defense against a wrong computeRepayAmount bug.
- Rejected because: leaves a high-value judging criterion on the table and exposes the demo to a single point of failure in the math module.

## Open Questions

- **`OPEN — needs human tester`:** Does `cast call --from <wallet>` on the Anvil fork correctly report revert reasons when the underlying tx would revert? Foundry docs say yes, but we need to assert this in the actual test suite (WS2 tests will cover this).
- **`OPEN — needs human tester`:** What is the actual `cast call` exit code on revert? Some versions return 1, others return non-zero with stderr only. The parser must accept *any* non-zero exit as a failure (Rule 10: no silent errors) and treat parse failure as `'UNKNOWN_REVERT'` with raw stderr attached.
- **`ASSUMPTION`:** `cast` is installed and in PATH on the demo laptop. Verified at `scripts/setup.sh` install time. If absent, the listener still runs (simulation skipped with warning) — fallback to closed-form math only, matching Alternative 4. The dashboard shows `[SIMULATION] Skipped — cast not found` so the judge sees the degradation, not a silent fallback.

## Checklist

- [x] Decision communicated (this ADR)
- [ ] README updated (mention simulation requirement in setup section — WS8 task)
- [x] Implementation planned in current phase (P4 WS2 — see `docs/phase4/P4-PLAN.md`)
- [x] This ADR saved to `docs/adr/2026-07-06-adr-011-preflight-simulation.md`
