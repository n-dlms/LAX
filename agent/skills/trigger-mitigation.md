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
   simulate approve + repay via a pure Node JSON-RPC helper (no Foundry needed)
   against the RPC. If the simulation reverts, do NOT proceed.
3. **Mitigation gate** (`src/autopilot/gate.ts` wrapping `src/critique-agent.ts`):
   verify the math, the simulation, and the safety bounds (block/daily spend
   caps, only the `approve` selector allowed; size caps via
   `LAX_BLOCK_THRESHOLD_USD` / `LAX_DAILY_LIMIT_USD`).
   **The gate is now wired into every fire path** — `lax autopilot`, `lax engage`,
   and the legacy listener all call `runMitigationGate()` before any webhook.
   If any stage fails, the fire is blocked and logged; escalate.
4. **Trigger the KeeperHub workflow** via webhook (use `src/keeperhub.ts` —
   it signs the payload when `LAX_WEBHOOK_SECRET` is set and is verified by
   `api/keeperhub-proxy.ts`):
   `POST https://app.keeperhub.com/api/workflows/{id}/webhook`
   with `Authorization: Bearer <wfb_ key>` and body:
   `{ health_factor, user_address, repay_amount_usdc, repay_amount_human }`.
   - The workflow then runs: read HF → approve USDC → repay → verify HF.
   - The exact amount is computed at fire time and passed in the payload
     (`repayAmount`), so the workflow's static amount is always fresh at trigger
     (V2 fix #2 for the dynamic `{{...}}` uint256 platform limitation).
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