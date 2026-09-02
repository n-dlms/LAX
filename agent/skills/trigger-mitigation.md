# Skill: Trigger Mitigation (Repay)

When the health factor drops to the watch threshold, repay the minimum debt that
restores HF to the target — deterministically, through KeeperHub.

## When to use

HF ≤ 1.05 (classification `act`), with a real debt position.

## Inputs

- `user` (borrower), `totalDebtBase`, `currentHf` (from the monitor skill).
- Target HF = 1.10, watch/trigger HF = 1.05.

## Steps

1. **Compute the repay amount** (closed-form, `src/repay-math.ts`):
   `exactRepay = totalDebtBase × (1 − currentHf / targetHf)`, then apply a +1%
   buffer for on-chain rounding. Convert to USDC (6 decimals).
   - `computeRepayAmount(totalDebtBase, hfCurrent, hfTarget)`
2. **Dry-run / preflight** (`src/preflight-simulator.ts`):
   simulate approve + repay via `cast call` against the RPC. This now works on
   remote RPCs too (P1 fix). If the simulation reverts, do NOT proceed.
3. **Critique gate** (`src/critique-agent.ts`):
   verify the math, the simulation, and the safety bounds (repay ≤ $10 block
   threshold, ≤ $5 daily limit, only `approve` selector allowed). If any stage
   fails, block execution and escalate.
4. **Trigger the KeeperHub workflow** via webhook:
   `POST https://app.keeperhub.com/api/workflows/{id}/webhook`
   with `Authorization: Bearer <wfb_ key>` and body:
   `{ health_factor, user_address, repay_amount_usdc, repay_amount_human }`.
   - The workflow then runs: read HF → approve USDC → repay → verify HF.
   - ⚠️ Platform limitation: the repay amount is currently **static** in the
     workflow (dynamic `{{...}}` uint256 refs are rejected). Set the amount to
     the computed value before triggering, or trigger with the amount the
     workflow expects.
5. **Poll the audit trail**: `GET /api/workflows/executions/{id}/logs` (or
   `kh run status`). Confirm `status: success` and a verified `transactionHashes`
   entry. Record the basescan link.

## Output

`{ executionId, txHash, finalHf, status }` — plus the audit-trail link.

## Notes

- Never fire the webhook without a passing critique gate.
- If the workflow errors on a template reference, it is the known platform gap
  (documented in `docs/zero-cost-testnet-plan.md`); report it, don't work around
  it silently.