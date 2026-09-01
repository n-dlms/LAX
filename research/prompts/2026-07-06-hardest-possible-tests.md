# Deep Research: Hardest Possible Tests for LAX (KeeperHub Integration Protection Node)

**Project Phase**: Phase 4 — Polish / Test Hardening  
**Target**: Push test suite from 391 → 515+ with the hardest, most adversarial tests imaginable  
**Hackathon**: The Last Mile — KeeperHub (Aug 13 2026). Judging criteria includes "Integration quality & DX" — judges inspect source code (structure, error handling, type safety, readability), NOT the test suite. The tests exist purely to guarantee demo reliability: no mid-demo crashes from edge cases. Hard tests prevent embarrassment on stage.  
**Repository**: `/home/dlamini/Desktop/LAX` (Full Node.js/TypeScript project, vitest, BigInt arithmetic, Aave V3 DeFi mitigation simulation)

---

## Context

We are building an automated liquidation-avoidance system for Aave V3 positions on Base (L2). The system:

1. **Monitors HF** (Health Factor) via polling an Aave V3 pool contract (ethers.js)
2. **Detects drops** below trigger threshold → computes exact repay amount using closed-form math
3. **Runs a critique agent** that validates the math, simulates the transaction via `cast call` (preflight), and checks safety bounds
4. **Fires a webhook** to KeeperHub to execute the mitigation

**Test infrastructure**: vitest with vi.mock for child_process and preflight-simulator. All execSync calls are mocked. All ethers calls are mocked.

---

## Files Already At Target (no more changes needed)

- `tests/preflight-simulator.test.ts` — **100 tests** ✅
- `tests/counterfactual-optimizer.test.ts` — **100 tests** ✅
- `tests/critique-agent.test.ts` — **90 tests** ✅

---

## Files Needing Expansion

### 1. `tests/safety-plugin.test.ts` — Currently 20 tests, need 45+ (need +25)

**Source**: `src/safety-plugin/guardrails.ts`
- Exports: `checkSafety(toolName, args)`, `resetDailyCap()`, `getDailySpend()`
- Two main tools: 'web3/write-contract' (checks 4-byte selectors against allowlist/denylist) and 'transfer' (checks value in wei against thresholds)
- `CONFIG.SAFETY`: BLOCK_THRESHOLD_USD=10, DAILY_LIMIT_USD=5, DENIED_SELECTORS=['0x23b872dd','0x42842e0e'], ALLOWLIST_SELECTOR='0x095ea7b3'
- Daily cap resets after 86,400,000ms (24h)
- Selector matching is case-insensitive

**Questions for Gemini — what are the HARDEST tests?**:

1. **griefing attacks**: What adversarial write-contract selectors could bypass the allowlist? Consider 0x selector collisions, partial prefix matches, data fields shorter than 10 chars, data fields beginning with 0x but containing non-hex characters, data with leading whitespace or BOM characters
2. **daily cap race conditions**: What happens if checkSafety is called concurrently? In Node.js single-threaded this is serial, but what about interleaving with resetDailyCap? What if `dailyResetAt` is set in the future?
3. **BigInt overflow in transfers**: value field is parsed via `BigInt()` from a string — what if value is 'NaN', 'Infinity', '-1', '0x' (non-decimal), extremely long string? What if value exceeds Number.MAX_SAFE_INTEGER?
4. **Edge cases with toolName**: empty string, null, undefined, very long strings, strings with special chars — how does guardrails handle unknown tools?
5. **dailySpend mutation**: verify that dailySpend tracks correctly across thousands of micro-transactions, verify precision with very small values (1 wei = 1e-18 USD), verify that `dailySpend + usdValue` can overflow JavaScript's safe integer range
6. **denied_selectors**: are the selectors in the deny list exactly 10 chars (0x + 8 hex)? What if they're shorter/longer? What about mixed-case matching when the input data has different case?
7. **Temporal edge cases**: what if resetDailyCap is called from a different timezone? What about the 24h window boundary — does it drift? What happens with daylight saving time?
8. **Concurrent daily reset**: if resetDailyCap and checkSafety happen at nearly the same time, can dailySpend go negative or get into an inconsistent state?

### 2. `tests/repay-math.test.ts` — Currently 13 tests, need 35+ (need +22)

**Source**: `src/repay-math.ts`
- `computeRepayAmount(totalDebtBase, hfCurrent, hfTarget) → bigint (6-dec USDC)`
  - Formula: (totalDebtBase * 10^10) * (hfTarget - hfCurrent) / hfTarget / 10^12
  - Returns 0n when hfTarget <= hfCurrent
- `hfToBigint(hf: number) → bigint` — Math.round(hf * 1e18) — loses precision above ~2^53
- `hfToNumber(hf: bigint) → number` — Number(hf) / 1e18 — loses precision above ~2^53
- `usdcToString(amount: bigint) → string` — `intPart.fracPart` padded to 6 decimals

**Questions for Gemini**:

1. **Precision loss attacks**: The `computeRepayAmount` formula does BigInt arithmetic in 18-dec then divides by 10^12 to get 6-dec USDC. What edge cases cause the most precision loss? Consider very small debts ($0.01) with very close HF values (1.0999999999 → 1.10)? What about debts at 8 decimals with HF at 18 decimals — what does the rounding chain look like?
2. **Integer division truncation**: BigInt division truncates. When does this truncation cause the largest absolute error? When totalDebtBase * 10^10 * hfDelta overflows memory? What about debt values near max uint256?
3. **hfToBigint floating-point corruption**: `Math.round(1.04 * 1e18)` doesn't give `1040000000000000000n` due to IEEE 754 double precision. What's the exact error for key HF values (1.0, 1.04, 1.05, 1.10, 0.95, 0.98)? What's the worst-case relative error across the range [0.5, 5.0]?
4. **hfToNumber precision above 2^53**: When HF values exceed ~9 quadrillion, `Number(hf)` loses integer precision. What does this mean for output formatting? Can `usdcToString` produce incorrect strings for very large amounts?
5. **Zero and negative edge cases**: hfCurrent=0 (divide by zero? check the code), hfDelta overflow (what if hfTarget is less than hfCurrent in BigInt?), totalDebtBase=0, negative totalDebtBase (BigInt can be negative)
6. **Roundtrip consistency**: For what range of HF values does hfToBigint(hfToNumber(n)) == n? Where does the roundtrip break? What's the fix if we need exact roundtrips?
7. **usdcToString edge cases**: amounts like 0n, 5n (sub-cent), 1000000n (exactly $1), 123456789n ($123.456789), huge amounts where toString() might use scientific notation for the integer part
8. **Cross-consistency**: Verify that for key positions, computeRepayAmount gives the same result when computed differently (e.g., using different intermediate representations)

### 3. `tests/stress.test.ts` — Currently 5 tests, need 25+ (need +20)

**Current structure**: Simple loop stress for repay math and safety checks.

**Questions for Gemini — hardest stress scenarios**:

1. **Memory leak stress**: Run 100,000 iterations of the critique agent pipeline — does memory grow? Any closure-based leaks in the stage/runStage pattern?
2. **BigInt GC pressure**: 100,000 rapid BigInt allocations from repay math — any performance cliffs?
3. **Module import stress**: Import each module 1000 times in a loop — does caching work? Any side effects at import time?
4. **Concurrent-except-singlethread**: Even though Node is single-threaded, what about async operations? Simulate interleaved async/await patterns even though our code is sync?
5. **Date.now() resolution**: The critique agent uses Date.now() for duration tracking. What happens during rapid successive calls where ms don't advance? What about negative durations?
6. **Math consistency under stress**: Run Monte Carlo with random valid positions — verify cross-module consistency (critique, counterfactual, repay-math all agree)
7. **Extreme input combinations**: Stress with all BigInt parameters at max safe values, all at zero, all negative, all mixed
8. **Rapid env var toggling**: Toggle fail-open, toggle RPC URL, toggle safety config — does the system handle env changes mid-operation?

### 4. `tests/edge-sweep.test.ts` — Currently 9 tests, need 25+ (need +16)

**Current structure**: token addresses, very small HF diff, 18-digit precision, safety edge cases, optimizer returns zero.

**Questions for Gemini**:

1. What edge cases are we completely missing? Think about: addresses with invalid checksums, BigInt parsing from non-numeric strings, division rounding that produces zero for non-zero inputs, roundtrip precision for values near Number.EPSILON
2. Are there edge cases at protocol boundaries? Aave pool address as zero address, USDC token address as zero address, extremely old or future block numbers
3. What about async error edge cases? Promise rejections in ethers mock, fetch network failures, JSON parse errors
4. Are there mathematical singularities? HF = 1.0 exactly, LT = 0, totalDebt = 0, weightedCollateral = 0 — what divides by what?
5. What about string→BigInt edge cases? Leading zeros, plus sign, whitespace, hex format, underscore separators

### 5. `tests/hf-listener.test.ts` — Currently 15 tests, need 25+ (need +10)

**Source**: `scripts/hf-listener.ts`
- `fireWebhook(hf, address, debt, repayAmount)` — POST to KeeperHub, reads CONFIG.WORKFLOW_ID
- Main `main()` function polls Aave pool, calls fireWebhook, supports ONE_SHOT mode

**Questions for Gemini**:

1. **fireWebhook HTTP scenarios**: 2xx non-200 (202 Accepted, 204 No Content), 3xx redirect, 429 rate limit, 5xx server error, DNS failure, connection refused, TLS/cert errors, timeout
2. **JSON response edge cases**: response.json() that returns null, returns non-object, returns object without executionId, returns huge JSON, returns JSON with circular reference, malformed JSON
3. **fetch API compatibility**: The real module uses globalThis.fetch which may not exist in all Node versions — what happens when fetch is undefined?
4. **env var sensitivity**: What if `process.env.KEEPERHUB_API_KEY` is not set? What if it's set to empty string? What if it contains special characters that break the Authorization header?
5. **Polling edge cases**: ONE_SHOT=true + HF never drops → infinite loop? What about process.exit(0) preventing cleanup? What if getUserAccountData throws after the trigger fires — does the retry loop handle it?
6. **Async main loop**: The infinite while(true) loop — what happens on unhandled promise rejections? What about SIGINT/SIGTERM handling?
7. **Precision in webhook body**: `hfToNumber(hf).toString()` for hf values > 2^53 produces imprecise strings. Is this acceptable? What about `repay_amount_human` formatting?
8. **Multi-instance safety**: What if two listeners run simultaneously for the same borrower? Could both trigger and both fire webhooks, leading to double mitigation?

### 6. `tests/config-validation.test.ts` — Currently 5 tests, need 15+ (need +10)

**Source**: `src/config.ts` — all configuration as const, plus validateConfig()

**Questions for Gemini**:

1. **Consistency rules**: What invariants should hold across the config? (e.g., CHAIN_ID and addresses must match, FORK_PORT and FORK_RPC_URL must agree, WALLET_ADDRESS should be valid for the chain)
2. **Safety-downgrade detection**: What if BLOCK_THRESHOLD < DAILY_LIMIT? What if either is zero or negative? What if thresholds are so high they're meaningless?
3. **Network mismatch detection**: USDC on Base is 0x8335... — what if someone swaps the USDC address with an Ethereum mainnet USDC address?
4. **Config immutability**: The CONFIG is declared `as const` — verify that no runtime code can mutate it, verify that tests importing CONFIG see the same values
5. **Workflow ID format**: What format should WORKFLOW_ID follow? Does validateConfig check it?
6. **Default values**: What config values have defaults? What happens when they're missing?

### 7. `tests/cast-integration.test.ts` — Currently 5 tests, need 15+ (need +10)

**Source**: indirectly tests `src/preflight-simulator.ts` (simulateApprove, simulateFullMitigation)

**Questions for Gemini**:

1. **URL parsing robustness**: What invalid URL formats could bypass isLocalFork? IPv6 localhost (::1, [::1]), unix sockets, file:// protocol, data: URIs, URLs with auth (user:pass@), URLs with fragments, URLs with non-ASCII chars (Punycode/IPv6)
2. **Token address validation**: What invalid token addresses could cause execSync to crash? Addresses with spaces, shell metacharacters (`;`, `|`, `$()`, backtick), very long strings, non-hex characters
3. **FORK_REQUIRED false positives**: Are there any valid fork URLs that would be incorrectly rejected? What about 0.0.0.0, 0.0.0.0:18545, 10.x.x.x, 172.x.x.x, 192.168.x.x with different ports?
4. **cast call construction**: Could the shell command be broken by special characters in addresses or amounts? What about `amountWei.toString()` for negative BigInts, or BigInts with scientific notation in string form?

### 8. `tests/e2e-integration.test.ts` — Currently 9 tests, need 20+ (need +11)

**Questions for Gemini**:

1. **Pipeline ordering**: Verify the critique runs math → simulation → safety in order. What if simulation returns success but safety fails — is the position actually safe?
2. **Data propagation**: Does the repayAmount from math stage correctly reach the simulation stage? Does the simulation result flow back to the critique report?
3. **Fail-open edge cases**: What if fail-open is enabled but ALL stages pass? What if fail-open is enabled but no errors exist?
4. **Stage interaction**: Does a stage 1 failure prevent stage 2 from running? (From code: NO — all stages always run). Is this the right behavior?
5. **Cross-config consistency**: What if CONFIG.HF.TARGET changes between stages? (Not possible in sync code, but worth documenting)
6. **Gas estimation end-to-end**: Does gasEstimate from the simulation mock propagate to the critique report?
7. **Address validation priority**: If wallet AND borrower addresses are both invalid, does the error message mention both or just the first one?

---

## Research Goal

For each file above, Gemini should:

1. **Identify 3-5 categories of ultra-hard tests** that an adversarial judge/examiner would run
2. **For each category, list 3-5 specific test cases** with concrete inputs and expected outputs
3. **Flag any architectural weaknesses** the tests would expose
4. **Suggest edge cases unique to DeFi math** that a generic test harness would miss
5. **Prioritize by "embarrassment potential"** — which test would make the system look the worst if it failed

The research should be **specific, concrete, and actionable** — not "test more edge cases" but "test that `computeRepayAmount` with a debt of $UNKNOWN and HF diff of 18 decimals at precisely the tolerance boundary produces a value that, when roundtripped through the critique agent, causes a false positive/negative."

Return a prioritized list of test implementations with inputs, expected outputs, and the category/attack vector they target.
