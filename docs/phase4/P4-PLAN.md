# Phase 4 Execution Plan — The Final Push

**Active Phase:** Phase 4 (Polish)
**Date:** 2026-07-06
**Deadline:** Sunday 2026-07-12 (6 days)
**Target:** Grand Prize + Onboarding DX Bounty
**Test Target:** 200 tests (current: 40)

---

## Authority Files Read

| File | Status | Notes |
|------|--------|-------|
| AGENTS.md | Read (322 lines) | All 13 rules, Phase 4 active, Scope Lock, Verify Before Done |
| docs/MISSION.md | Read (31 lines) | "Demo or die", "Polish the show", "Time is non-renewable" |
| docs/SCOPE.md | Read (47 lines) | In scope: OpenCode+NIM, KeeperHub MCP, Aave V3, wallet, Base fork. Out of scope: x402, multi-protocol, reactive defense |
| docs/THREAT_MODEL.md | Missing | Not found — flag gap |
| docs/RISK_REGISTER.md | Read (13 lines) | R-005 (wifi), R-006 (HF movement), R-007 (bounty conflict) still active |
| docs/legal/ETHICS.md | Missing | Not found — flag gap |
| docs/testing/TEST_PLAN.md | Missing | Not found — flag gap |
| ADR-001 through ADR-010 | All previously read in S0-S3 | Stack, MCP, wallet, chains, Aave, gas, demo env, dashboard template, Tailwind, dependency policy |
| docs/phase4/Onchain Agent Strategy Metaplan.md | Read (648 lines) | 50+ page strategic analysis — contains counterfactual optimizer, pre-flight sim, x402, Otterscan, demo script |
| docs/phase4/research-synthesis.md | Written this session | KeeperHub blog analysis, winner patterns, 35 friction points catalogued |

---

## Guiding Principles (from AGENTS.md + MISSION.md)

1. **Verify Before Done** (Rule 4) — every change must run, build, not break existing tests
2. **Scope Lock** (Rule 7) — nothing beyond what helps the 3-minute demo
3. **Demo Flow Tests** (Rule 9) — happy path + error states + empty states + loading states + offline
4. **Explicit Error Handling** (Rule 10) — no silent discarding of failures
5. **Pattern Matching** (Rule 8) — examine 2+ existing files before writing new ones
6. **Dependency Discipline** (Rule 5) — no new deps without checking existing ones
7. **No Hallucinated APIs** (Rule 6) — verify every API call against actual dependency tree
8. **Demo or die** (MISSION.md) — every feature must be visible in the 3-minute pitch
9. **Time is non-renewable** (MISSION.md) — cut scope, not sleep

---

## Workstream 1: FEEDBACK.md — DX Bounty Deliverable

**Priority:** HIGH — quickest win, required for DX bounty, we have 35 friction points catalogued
**Effort:** ~4 hours
**Depends on:** Nothing
**Verification:** Lint, no code to test, manual review

### Tasks

1. Review the 35 friction points from research synthesis, categorize into severity levels
2. Write FEEDBACK.md with:
   - Executive summary (top 5 blockers for new developers)
   - Structured table: issue, file/endpoint, severity, steps to reproduce, suggested fix
   - Sections: Documentation gaps, API inconsistencies, SDK bugs, Platform feature gaps
   - Attach code snippets showing workarounds
3. Submit to KeeperHub DX bounty channel

### Test targets: 0 (documentation only)

---

## Workstream 2: Pre-Flight Simulation Engine

**Priority:** HIGH — directly visible in demo, judges see simulation-before-execution
**Effort:** ~1.5 days
**Depends on:** Understanding of current cast call patterns in scripts/
**Verification:** 20+ unit tests + demo visual verification

### Architecture Decision (needs ADR)

- **Approach**: TypeScript module `src/preflight-simulator.ts` that shells out to `cast call` on the local Anvil fork
- **Why not ethers/ethers**: ADR-010 forbids ethers in production code. `cast call` is already available via Foundry
- **Why not execute directly**: Separates simulation from execution — simulation runs on the fork, execution goes through KeeperHub

### Tasks

1. Create `src/preflight-simulator.ts`:
   - `simulateApprove(tokenAddress, spender, amount, rpcUrl): SimulationResult`
   - `simulateRepay(poolAddress, token, amount, rateMode, onBehalfOf, rpcUrl): SimulationResult`
   - `simulateFullMitigation(userAddress, repayToken, repayAmount, anvilRpcUrl): SimulationResult`
   - Each returns `{ success: boolean, revertReason?: string, gasEstimate?: string }`
   - Parse `cast call` stderr for revert reasons (e.g., "execution reverted: ERC20: insufficient allowance")
2. Create `src/simulation-types.ts`:
   - `SimulationResult` interface, `SimulationError` enum
3. Wire into dashboard:
   - Add `useSimulation` hook to dashboard that calls a new endpoint or runs the simulator
   - Show `[SIMULATION] Passed ✓` or `[SIMULATION] FAILED — ${reason}` in MitigationView
4. Wire into hf-listener:
   - Before dispatching webhook, run simulation. If simulation fails, log warning but still dispatch (simulation failure != execution failure on live)
5. Handle edge cases:
   - `cast` not installed → graceful error
   - Fork not running → clear error message
   - Revert with reason → parse and display

### Test targets: 25
| Suite | Tests | What they cover |
|-------|-------|-----------------|
| `tests/preflight-simulator.test.ts` | 15 | Happy: approve succeeds, repay succeeds, full flow. Negative: insufficient balance, insufficient allowance, wrong spender, invalid token. Edge: zero amount, max uint256, token not deployed, cast not found, RPC down |
| Integration in `tests/hf-listener.test.ts` | 5 | Simulation before webhook dispatch, simulation failure doesn't block execution |
| Dashboard hook tests | 5 | State transitions: idle → simulating → passed/failed |

---

## Workstream 3: Critique Agent (Gamma Agent)

**Priority:** HIGH — highest judge visibility per KeeperHub blog (ZW.ARM pattern)
**Effort:** ~2 days
**Depends on:** Preflight simulator (WS2) — critique agent uses simulation results
**Verification:** 15+ unit tests + demo visual verification

### Architecture Decision (needs ADR)

- **Approach**: Middleware module `src/critique-agent.ts` that wraps the mitigation pipeline
- **Why not a separate LLM agent**: Deterministic simulation is faster, cheaper, and more reliable. The "critique" is a structured validation pass, not open-ended reasoning
- **How it works**: Before every webhook dispatch or workflow execution, the critique agent runs 3 checks:
  1. Pre-flight simulation (delegates to WS2)
  2. HF math verification (re-computes target HF from live data)
  3. Safety bounds check (repay amount < wallet cap, asset on allowlist, etc.)

### Tasks

1. Create `src/critique-agent.ts`:
   - `runCritique(context: CritiqueContext): CritiqueReport`
   - Three-stage pipeline:
     - Stage 1: `verifyHfMath(currentHF, targetHF, totalDebt, computedRepay)` — verifies the closed-form math is correct
     - Stage 2: `verifySimulation()` — delegates to preflight simulator
     - Stage 3: `verifySafetyBounds()` — checks repay amount < block_threshold_usd, token on allowlist, wallet has sufficient balance
   - Returns `{ passed: boolean, warnings: string[], errors: string[], stageResults: StageResult[] }`
2. Wire into mitigation flow:
   - hf-listener calls `runCritique()` before webhook POST
   - If critique fails → log `[CRITIQUE] BLOCKED: ${error}` to dashboard, do NOT dispatch
   - If critique passes → log `[CRITIQUE] All 3 checks passed ✓`, dispatch
3. Wire into dashboard:
   - Add `CritiqueView` stage in MitigationView or show critique results inline
   - Animate: `[CRITIQUE] Stage 1: HF math... ✓` → `[CRITIQUE] Stage 2: Simulation... ✓` → `[CRITIQUE] Stage 3: Safety bounds... ✓` → `[CRITIQUE] All clear. Executing.`
4. Handle edge cases:
   - Fork down → "CRITIQUE: Cannot verify — fork unreachable. Proceeding with caution."
   - Math mismatch → "CRITIQUE: HF target will not be reached. Computed: 1.08, Target: 1.10. Adjusting repay amount."
   - Safety bounds exceeded → "CRITIQUE: BLOCKED — $X.XX exceeds $1.00 safety cap."

### Test targets: 20
| Suite | Tests | What they cover |
|-------|-------|-----------------|
| `tests/critique-agent.test.ts` | 15 | Happy: all 3 stages pass. Negative: stage 1 fails (math error), stage 2 fails (simulation revert), stage 3 fails (safety bound), all 3 fail. Edge: empty wallet, zero debt, max HF, token not allowlisted, fork RPC down |
| `tests/hf-listener.test.ts` addition | 5 | Critique blocks webhook when stage 2 fails, critique allows webhook when all pass, critique partial failure (stage 1 warn + stage 2 pass) |

---

## Workstream 4: Counterfactual Optimization

**Priority:** MEDIUM — technical differentiation, shows engineering depth
**Effort:** ~2.5 days
**Depends on:** Nothing architecturally, but benefits from critique agent patterns
**Verification:** 20+ unit tests

### Architecture Decision (needs ADR)

- **Approach**: Pure function module `src/counterfactual-optimizer.ts` that computes optimal mitigation path
- **Why**: Shows Aave V3 math expertise. Judges who know DeFi will understand the LT-based optimization
- **Two paths**: Repay debt (default) vs Supply collateral (fallback). Choose min capital outlay.

### Tasks

1. Create `src/counterfactual-optimizer.ts`:
   - `computeOptimalMitigation(collaterals, debts, targetHF): OptimizationResult`
   - Path 1: `repayRequired = totalDebt * (1 - HF_current / HF_target)`
   - Path 2: `supplyRequired = (totalDebt * targetHF - weightedCollateral) / highestLT`
   - Select path with lower capital requirement
2. Create `src/counterfactual-types.ts`:
   - `AssetData`, `OptimizationResult`, `MitigationPath` enum
3. Wire into critique agent:
   - Critique agent runs optimizer before Stage 1 to verify the chosen path is optimal
   - If repaying but supply would be cheaper → log `[CRITIQUE] Warning: supply path uses $X.XX less capital`
4. Wire into dashboard:
   - Show optimization result in MitigationView: `Optimal: REPAY $X.XX USDC (supply would cost $Y.YY)`
5. Edge cases:
   - No debt → `No debt to repay. HF is infinite. No action needed.`
   - No collateral → `No collateral supplied. Position cannot be defended.`
   - Both paths equal → `Both paths cost $X.XX. Defaulting to REPAY.`
   - Multiple collateral types → Select highest LT for supply path

### Test targets: 25
| Suite | Tests | What they cover |
|-------|-------|-----------------|
| `tests/counterfactual-optimizer.test.ts` | 20 | Happy: repay cheaper, supply cheaper, both equal. Single collateral, multiple collaterals, single debt, multiple debts. Negative: zero collateral, zero debt, negative values, extremely high HF target. Edge: same LT for all collaterals, token address formatting, precision at 18 decimals |
| Integration in `tests/critique-agent.test.ts` | 5 | Critique agent calls optimizer, optimizer failure handled gracefully, suboptimal path warned |

---

## Workstream 5: Test Expansion (40 → 200)

**Priority:** HIGH — KeeperHub judges read code, Winner #1 had 125 tests
**Effort:** ~2 days (can overlap with WS2-WS4)
**Depends on:** WS2-WS4 deliverables (tests for new code)
**Verification:** `npm test` passes, 200+ it() calls counted

### Test Distribution Plan

| Module | Current | Target | New | Source |
|--------|---------|--------|-----|--------|
| `repay-math.test.ts` | 13 | 20 | +7 | Edge cases: max uint256, zero debt, HF > target (should return 0), decimal overflow, negative debt (should throw), precision at 18 decimals, RAY vs WAD conversion |
| `safety-plugin.test.ts` | 11 | 20 | +9 | Negative: all safety gates trigger simultaneously, empty config, malformed config, token not allowlisted, amount exceeds block threshold, multiple violations in one check. Edge: exactly at boundary, zero values |
| `hf-listener.test.ts` | 3 | 15 | +12 | Pre-flight sim integration (5), critique agent integration (5), edge: RPC error recovery, webhook timeout, HF oscillation (trigger → recover → re-trigger) |
| `preflight-simulator.test.ts` | 0 | 15 | +15 | New module |
| `critique-agent.test.ts` | 0 | 15 | +15 | New module |
| `counterfactual-optimizer.test.ts` | 0 | 20 | +20 | New module |
| `bootstrap/tests/repay-math.test.ts` | 13 | 13 | 0 | Copy of root — keep in sync |
| Dashboard tests | 0 | 12 | +12 | Component rendering: MonitorView renders HF, MitigationView shows steps, AuditView renders QR. Animation: fade-in on mount, stagger delay on steps. State: loading skeleton, error state, empty state, cached state, reconnection banner |
| E2E integration | 0 | 10 | +10 | Full pipeline: fork → setup → deploy workflow → drop oracle → listener detects → webhook → KeeperHub executes → verify HF restored (mocked). Partial: single-step failures (approve succeeds, repay fails → recovery) |
| Stress/performance | 0 | 5 | +5 | 1000 rapid HF polls (no crash), 60s continuous monitoring (no memory leak), 10 concurrent mitigations (no race), rapid oracle price swings (no instability) |
| Config validation | 0 | 5 | +5 | Valid config passes, invalid configs (missing field, wrong type, out of range) all fail with clear errors |
| cast/shell integration | 0 | 5 | +5 | cast not found → graceful error, cast returns unexpected output → handled, cast timeout → handled |
| Edge case sweep | 0 | 10 | +10 | Unicode in token symbols, extremely long revert reasons, empty RPC responses, binary data in error messages, very large numbers (10^30), very small numbers (10^-18), concurrent RPC calls, rapid fork restart, wallet file missing, HF not a number |

**Total target: 200 tests**
**Incremental: +160 tests from current 40**

### Test Infrastructure Tasks

1. Ensure `ts-jest` or equivalent handles any new module formats
2. Add test for `tests/__fixtures__/` with mock data (mock position data, mock config, mock forge/cast outputs)
3. Add `test:coverage` script to package.json
4. Ensure dashboard tests can run in the `dashboard/` directory (may need jest-dom, testing-library)
5. Add `test:all` script that runs root + dashboard tests in sequence

---

## Workstream 6: Dashboard Enhancements for Phase 4

**Priority:** MEDIUM — polishing existing dashboard, not building new features
**Effort:** ~1 day
**Depends on:** WS2-WS4 for new data to display
**Verification:** `npx vite build` succeeds, visual check of all states

### Tasks

1. Critique Agent UI: Show 3-stage critique pass/fail inline in MitigationView with terminal-style animation
2. Counterfactual Optimizer UI: Show `Optimal: REPAY $X.XX` vs `Supply would cost $Y.YY` in mitigation details
3. Simulation indicator: Show `[SIMULATION]` status badge on each step in MitigationView
4. Error state polish: Ensure all error messages are human-readable, not raw JSON
5. Loading states: Ensure all async operations show loading indicator within 200ms
6. Offline mode: Test that cached position data renders without RPC connection
7. Empty state: Dashboard with no position loaded shows "Connect to an Anvil fork to begin monitoring"

### Test targets: 12 (dashboard component tests)

---

## Workstream 7: Demo Video + Tenderly Recording

**Priority:** MEDIUM — needed for submission, but depends on working code
**Effort:** ~1 day
**Depends on:** All WS1-WS6 (code must be stable before recording)
**Verification:** Video uploaded, Tenderly link works

### Tasks

1. Tenderly fork recording: Record the full fork session (fork Base → deploy mock oracle → seed → drop price → observe auto-mitigation → verify HF restored). Export as shareable link.
2. OBS recording: Record 3-minute demo following the 8-beat script from ADR-005
3. YouTube upload: Unlisted upload, add to README
4. Video requirements: 1080p, clear narration, transaction hashes visible, KeeperHub audit trail shown
5. Script practice: 3+ dry runs before final take

---

## Workstream 8: Final Build + Release

**Priority:** HIGH — submission packaging
**Effort:** ~4 hours
**Depends on:** All WS1-WS7
**Verification:** Fresh clone → setup.sh → npm test → tsc --noEmit → vite build

### Tasks

1. `.env` audit: Ensure no secrets in source, `.env.example` is up to date
2. `git secrets` scan: Run `git diff --check` for any hardcoded keys
3. Fresh clone test: Clone to separate directory, run `setup.sh`, confirm one-command setup works
4. Build verification: `npm test && tsc --noEmit && cd dashboard && npm test && npx vite build`
5. README update: Add submission links (video, Tenderly, KeeperHub workflow), update screenshots
6. Tagged release: `git tag v1.0.0 && git push origin v1.0.0`
7. DoraHacks submission: Fill in all fields, upload video, attach FEEDBACK.md

---

## Timeline

| Day | Date | WS | Focus | Tests |
|-----|------|----|-------|-------|
| Mon | 7/6 | 1 | FEEDBACK.md + DS research prep | 0 |
| Tue | 7/7 | 2 | Pre-flight simulator | 25 |
| Wed | 7/8 | 3 | Critique agent | 45 |
| Thu | 7/9 | 4 | Counterfactual optimizer | 70 |
| Fri | 7/10 | 5+6 | Test expansion + dashboard polish | 140 |
| Sat | 7/11 | 7+8 | Demo video + final build | 200 |
| Sun | 7/12 | 8 | Release + submission | — |

**Buffer:** 0.5 days per workstream for unexpected blockers.

---

## Risk Register (Phase 4 additions)

| ID | Risk | L | I | Mitigation |
|----|------|---|---|------------|
| R-P4-01 | `cast call` not available in PATH on demo laptop | Low | High | Check at setup.sh time, print clear install instructions. Fall back to ethers.JsonRpcProvider for simulation only (single dep, not bundled) |
| R-P4-02 | 200 tests creates >30s test suite runtime | Med | Low | Split into `npm test` (core) and `npm run test:full` (all 200). CI runs full only on release |
| R-P4-03 | Critique agent adds latency to mitigation path | Med | Med | Each stage has 500ms timeout. If any stage times out, it fails open (log warning, proceed). Timer starts before simulation |
| R-P4-04 | Counterfactual optimizer math diverges from live Aave | Low | High | All formulas are closed-form from Aave V3 whitepaper. Validate against live fork data before demo |
| R-P4-05 | FEEDBACK.md rejected by KeeperHub (formatting, duplicates) | Med | Low | Review existing DX bounty discussions on GitHub. Use exact template from KeeperHub docs if available |
| R-P4-06 | Demo video recording fails (OBS crash, audio sync, etc.) | Low | High | Record 3 takes. Keep the best. Have backup Tenderly link. README must be complete even without video |
| R-P4-07 | Dashboard bundle size grows beyond acceptable limit | Med | Med | Monitor `vite build` output. If >300 KB JS, audit for unnecessary deps. Dashboard is a static SPA — no new npm packages permitted without ADR |
| R-P4-08 | `anvil_setStorageAt` still doesn't propagate to Aave price | Low | High | Already have fallback: deploy mock oracle via `anvil_setCode`. If neither works, use flash loan to manipulate HF directly |

---

## ADRs Needed

Before implementing, these architecture decisions need ADRs:

1. **ADR-011: Pre-flight Simulation Approach** — `cast call` vs ethers direct RPC vs custom simulator. Decision: `cast call` (already installed, no new deps, ADR-010 compliant).
2. **ADR-012: Critique Agent Architecture** — deterministic simulation-based critique vs LLM-based critique. Decision: deterministic (faster, cheaper, more reliable).
3. **ADR-013: Counterfactual Optimizer Integration** — pure function module vs KeeperHub-integrated. Decision: pure function (testable, no deps).

---

## Stop Conditions (from AGENTS.md)

I will stop and ask for review if:
- Any workstream takes >4 hours in a single session
- A new dependency is needed (check existing ones first per Rule 5)
- An API or feature cannot be verified against actual source code (Rule 6)
- I'm about to build something not explicitly in this plan (Scope Lock, Rule 7)
- A bug takes >30 minutes to debug
- The plan conflicts with SCOPE.md or MISSION.md
- An assumption is needed to proceed (Rule 11)
- Error handling would silently discard failures (Rule 10)
