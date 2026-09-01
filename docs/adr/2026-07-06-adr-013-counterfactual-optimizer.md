# ADR-013: Counterfactual Portfolio Optimization — Min-Capital Path Selection

**Number**: ADR-013
**Title**: Counterfactual Portfolio Optimization — Min-Capital Path Selection
**Date**: 2026-07-06
**Status**: Accepted
**Relates To**: ADR-005 (Aave V3 Path — HF math and thresholds), ADR-012 (Critique Agent — Stage 1 incorporates optimizer result), `docs/phase4/Onchain Agent Strategy Metaplan.md:68-137`, `docs/phase4/P4-PLAN.md` WS4
**Supersedes**: Nothing

---

## Context

The current mitigation pipeline (`scripts/hf-listener.ts:82-83`) always repays debt when HF drops below trigger. Repaying is the default path. However, the user may hold multiple collateral assets with different liquidation thresholds, and supplying additional collateral instead of repaying debt may require less capital to restore the position to HF target.

From the Strategy Metaplan (line 73-78): "Rather than relying on basic stablecoin debt repayment, the LAX agent evaluates multiple collateral and debt assets to determine the optimal action that minimizes capital outlay."

For example: if the user's collateral is WETH (LT = 83%) and their debt is USDC (LT = 0%), repaying $100 of debt might restore HF to 1.10 while supplying only $80 of additional WETH would achieve the same result. The path with minimal capital outlay is the better choice.

The optimizer is a pure function — no RPC calls, no state reads. It reads the position state that the hf-listener already fetched and computes both paths locally. This means it can run inside the critique agent (Stage 1) without adding network latency.

## Decision

LAX will implement a pure function module `src/counterfactual-optimizer.ts` that computes two mitigation paths and returns the one requiring less capital.

### Math

**Path 1 — Repay debt:**

```
exactRepayAmount = totalDebt * (1 - HF_current / HF_target)
```

This is the same formula already implemented in `src/repay-math.ts`. The optimizer reuses `computeRepayAmount()` directly.

**Path 2 — Supply collateral:**

```
weightedCollateral = Σ(collateral[i] * LT[i])   // risk-adjusted collateral
supplyRequired = (totalDebt * HF_target - weightedCollateral) / max(LT)
```

The capital required to supply is the amount needed to bring the risk-adjusted collateral up to the level where `HF = (weightedCollateral + supplyRequired * maxLT) / totalDebt = HF_target`. Since the new collateral can be deposited in the asset with the highest LT (lowest capital requirement), we divide by `max(LT)` across all held collaterals.

**Selection:**

```
if repayRequired <= supplyRequired AND repayRequired > 0  →  choose REPAY
if supplyRequired < repayRequired AND supplyRequired > 0  →  choose SUPPLY
if both equal (within 0.1%)                                →  default to REPAY (safer)
```

### API surface

```ts
// src/counterfactual-optimizer.ts

export type MitigationPath = 'REPAY' | 'SUPPLY'

export interface AssetData {
  tokenAddress: string
  usdValue: number       // in USD (8 decimals from getUserAccountData, already divided by 1e8)
  liquidationThreshold: number  // e.g., 0.83 for WETH on Base Aave V3
}

export interface OptimizationResult {
  recommendedAction: MitigationPath
  targetToken: string
  requiredCapitalUSD: number
  requiredCapitalWei: bigint     // in token's native decimals
  repayCost: number              // USD cost of repay path (for display)
  supplyCost: number             // USD cost of supply path (for display)
  alternativeAction: MitigationPath
  alternativeCost: number
}

export function computeOptimalMitigation(
  collaterals: AssetData[],
  debts: AssetData[],
  currentHf: bigint,
  targetHf: bigint,
  totalDebtBase: bigint,
): OptimizationResult
```

### Single-collateral demo scenario

In LAX's demo (position: 1 WETH collateral, 480 USDC debt), there is one collateral (WETH, LT=83%) and one debt (USDC). The two paths simplify to:

| Path | Formula | Demo Value |
|------|---------|------------|
| REPAY | `debt * (1 - HF_current/HF_target)` | ~$0.55 USDC |
| SUPPLY | `(debt * HF_target - coll * LT) / LT` | ~$0.66 WETH |

The optimizer will choose REPAY ($0.55 < $0.66) and display both costs to the judge. Even in this simple case, the optimizer demonstrates the thinking: "We computed both paths. REPAY is $0.11 cheaper." For a multi-collateral demo (future scope), the optimizer would be even more impressive.

### Integration

The optimizer is called as part of Stage 1 in the critique agent (ADR-012). The critique agent's HF math verification now also checks that the chosen path is optimal:

```ts
// In critique-agent.ts Stage 1:
const optResult = computeOptimalMitigation(collaterals, debts, ctx.currentHf, ctx.targetHf, ctx.totalDebtBase)
const repayRequired = optResult.repayCost
const supplyRequired = optResult.supplyCost

log(`[OPTIMIZER] REPAY costs $${repayRequired.toFixed(4)}, SUPPLY costs $${supplyRequired.toFixed(4)}`)
log(`[OPTIMIZER] Recommended: ${optResult.recommendedAction} at $${optResult.requiredCapitalUSD.toFixed(4)}`)

if (optResult.recommendedAction !== expectedAction) {
  log(`[OPTIMIZER] Warning: expected ${expectedAction} but optimal is ${optResult.recommendedAction}`)
  // Stage 1 still passes — the optimizer is advisory, not blocking.
  // The warning is surfaced in the dashboard so the judge sees the analysis.
}
```

The optimizer is **advisory**, not blocking. Even if supply is cheaper but the agent is configured to always repay, the critique agent logs the alternative but does not block execution. Rationale: the demo flow is designed around the repay path (ADR-005 beats 5-6). Forcing a supply path mid-demo would break the narrative. The optimizer's value is in showing the analysis, not in overriding the demo script.

### No new dependencies

The module is pure TypeScript math. `AssetData` is a simple interface — no classes, no external types. The `computeOptimalMitigation` function is deterministic and testable. Zero new npm packages.

## Consequences

**Positive**
- Technical differentiator: most Aave V3 integrations pick one strategy. Showing both computed paths signals engineering sophistication.
- The optimizer output is a visible UI element: "Optimal: REPAY $0.55 (supply would cost $0.66)" is clear to any DeFi-literate judge.
- Uses the same closed-form math as `src/repay-math.ts` (already verified by 13 passing tests) — no new math to validate.
- Pure function with no side effects → trivially testable (25 planned tests in WS4).
- Reuse in the critique agent (ADR-012) means the optimizer is in the execution path automatically — no separate orchestration needed.

**Negative**
- Adds complexity for a demo that always picks REPAY (single collateral demo). The optimizer is over-engineered for the demo case. However, the 25 tests and the visible dashboard element justify the complexity.
- `AssetData.usdValue` assumes the caller has already converted from getUserAccountData's 8-decimal format. If the caller passes raw 8-decimal values, the math breaks silently. Mitigation: input validation in the optimizer — any value > 1e12 is rejected as "likely raw 8-decimal, not USD."
- The optimizer assumes `liquidationThreshold` values are known. For the demo, WETH LT=0.83 on Base Aave V3. If Aave changes LT via governance, the optimizer would produce suboptimal results until config updated. Acceptable: demo uses pinned fork block, LT cannot change.

## Alternatives Considered

### Alternative 1: Always repay (no optimizer — current behavior)
- Pros: Zero work. The existing pipeline works without change.
- Cons: Misses the technical differentiation. No visible "we considered both paths" element in the demo. The KeeperHub blog explicitly praised ZW.ARM's multi-asset thinking. Leaving this out means we have the 3-stage critique but not the optimization layer — still strong, but the metaplan called this out as HIGH ROI for a reason.
- Rejected because: the optimizer's engineering signal-to-noise ratio is high (25 tests proving "we did the math") and the dashboard element is quick to build.

### Alternative 2: Onchain query for LT values at runtime
- Pros: Always up-to-date, no hardcoded LT assumptions.
- Cons: Adds RPC calls at mitigation time (two more `getUserAccountData`-style queries). The demo uses a pinned fork block — LTs are fixed. The extra complexity serves no purpose for the demo.
- Rejected because: over-engineering for a demo where LTs don't change.

### Alternative 3: Supply-only (no repay — alternative to the whole approach)
- Pros: Simpler approval path (approve WETH, supply WETH, never touch USDC).
- Cons: If the user has zero supply capacity, supply does nothing. Repay is the canonical mitigation. Supply-only is a weaker technical story.
- Rejected because: the optimizer should show both paths, not pick one permanently.

### Alternative 4: Include third path — withdraw collateral (convert to USDC, repay more)
- Pros: Maximally capital-efficient — doesn't require new external funds.
- Cons: Adds a third transaction to the pipeline (withdraw → swap → repay). The approve → repay demo already has 2 txs at ~175K gas each. A third tx adds latency and complexity without proportional demo benefit.
- Rejected because: Complexity exceeds demo value. The two-path optimizer already signals "we thought about optimization."

## Open Questions

- **`ASSUMPTION`:** WETH liquidation threshold on Base Aave V3 is 83% (0.83). Verified at the pinned fork block 48,236,883. If this changes between the fork block and a future demo rebuild, the optimizer's supply math will be off. Mitigation: the supply path is never chosen in the demo (repay is always optimal); the optimizer is advisory only.
- **`ASSUMPTION`:** The optimizer does not account for gas cost differences between paths. Repay costs ~100K gas, while supply costs ~90K gas (approve is the same for both). The gas difference ($0.00005 at Base prices) is negligible vs. the capital outlay ($0.55). Not worth modeling.
- **`ASSUMPTION`:** The optimizer is not integrated into the demo flow as a blocking gate. It runs inside the critique agent's Stage 1 and logs results only. If the critique agent blocks the webhook for a Stage 2 or Stage 3 failure, the optimizer result is not surfaced. Acceptable: the user can see the optimization in the dashboard's MitigationView regardless of whether mitigation proceeds.

## Checklist

- [x] Decision communicated (this ADR)
- [ ] README updated (mention optimizer in architecture overview — WS8 task)
- [x] Implementation planned in current phase (P4 WS4 — see `docs/phase4/P4-PLAN.md`)
- [x] This ADR saved to `docs/adr/2026-07-06-adr-013-counterfactual-optimizer.md`
