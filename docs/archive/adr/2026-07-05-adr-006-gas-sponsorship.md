# ADR-006: Gas Sponsorship — KeeperHub Workflow Tag `AgentsOnchain2026` + Wallet-Pays-Gas Fork Fallback

**Number**: ADR-006
**Title**: Gas Sponsorship — KeeperHub Workflow Tag `AgentsOnchain2026` + Wallet-Pays-Gas Fork Fallback
**Date**: 2026-07-05 (updated 2026-07-05 — see Revision History)
**Status**: Accepted
**Relates To**: ADR-004 (Chain Strategy), ADR-005 (Aave V3 Path), ADR-007 (Demo Environment — Tenderly/Anvil Hybrid Fork), `docs/phase0/KeeperHub Gas Sponsorship Analysis.md`, `docs/phase0/Sepolia Faucet and Gas Analysis.md`
**Supersedes**: Nothing

---

## Revision History

| Date | Change | Source |
|------|--------|--------|
| 2026-07-05 (initial) | Gas sponsorship as primary; faucet ETH as Sepolia build backup. Demo on Base mainnet. | Phase 0 research |
| 2026-07-05 (revision) | Demo runs on Anvil fork of Base mainnet per ADR-004. Sponsorship paymaster is a KeeperHub-server-side concept that likely won't recognize the fork's RPC, so wallet-pays-gas becomes the **demo-primary** path. Sponsorship remains primary for any *real Base mainnet* execution (e.g. the Sepolia build phase). | ADR-004 revision, ADR-007 |

---

## Context

Every onchain transaction by LAX costs gas (ETH or native token). LAX operates under a hard $0 budget (`SCOPE.md`). There are two sources of free gas:

1. **KeeperHub Gas Sponsorship** per `https://docs.keeperhub.com/gas-sponsorship`: Tag a workflow with `AgentsOnchain2026`, and KeeperHub pays the tx fee. Unlimited during the hackathon. Reset with a new tag monthly post-hackathon. 5M gas per-tx cap; `docs/phase0/KeeperHub Gas Sponsorship Analysis.md:18-24` confirms Aave repay on Base is ~175K gas, well under 5M.
2. **Faucet ETH** (Sepolia only) per `docs/phase0/Sepolia Faucet and Gas Analysis.md`: Coinbase CDP gives 0.1 ETH/24h. Alchemy gives 0.5 ETH/24h. Both free.

Research report `KeeperHub Gas Sponsorship Analysis.md:30-35` covers the human conversation with DoraHacks support confirming:
> "The gas limit per call is 5M (quite generous). For the hackathon, gas is unlimited (for tagged workflows)."
> "The 5M gas per-call cap resets per transaction, not per day." (paraphrase)

## Decision

Gas strategy is **environment-dependent**:

| Environment | Primary gas path | Reason |
|-------------|------------------|--------|
| **Sepolia (Phase 3 build)** | Faucet ETH (Coinbase CDP, 0.1 ETH/24h) | Test net, sponsorship unnecessary |
| **Base mainnet (Sepolia→Base migration tests)** | Sponsorship via `AgentsOnchain2026` tag | Real Base mainnet paymaster recognizes tagged workflows |
| **Anvil fork of Base (live demo, Phase 4-5)** | **Wallet-pays-gas via `@keeperhub/wallet`'s Turnkey custody** | Fork's RPC is `http://localhost:8545`; KeeperHub's hosted paymaster cannot reach a local Anvil fork and likely refuses the fork's block hash signature |
| **Tenderly fork of Base (recorded demo backup)** | Sponsorship via `AgentsOnchain2026` if Tenderly is recognized; else wallet-pays | TBD at fork setup time |

### Why wallet-pays-gas on the Anvil fork is acceptable

Per `docs/phase1/Adoption and Cost Analysis` extrapolation and `docs/phase0/KeeperHub Gas Sponsorship Analysis.md`, gas cost on Base L2 is tiny:

- Mitigation total (approve + repay) ≈ 175K gas
- At Base base fee of ~0.05 Gwei + priority fee of ~0.1 Gwei → ~$0.0004 per mitigation cycle (well under $0.001)
- `safety.json` daily cap is **$5.00** per ADR-003, which absorbs ~12,500 mitigation cycles per demo day at Base fork prices
- Demo total cycles expected: <10 → cost < $0.004 for the whole demo

This is well within the $0 budget constraint — wallet pays trivial gas on the fork.

### Implementation

1. **Tagged Workflow**: All LAX workflows (approve + repay/supply) are tagged `AgentsOnchain2026` at `keepwork workflow create` time. Cost: $0. Enabled for any environment where the paymaster is reachable.

2. **`gas` flag handling**: The agent loop attempts `keepwork exec --gas true` first (sponsorship path). If the workflow executor returns `GAS_SPONSORSHIP_*` error (per taxonomy below), the agent retries with `keepwork exec --gas false` (wallet-pays). Both paths land the same tx — the gas-cost difference is invisible to the Aave V3 Pool state.

3. **Budget safety plugin check** (ADR-001): before `executeWorkflow` for any untagged workflow, the plugin computes the estimated gas × current base fee and checks against the wallet's `daily_limit_usd`. If the projected spend exceeds the daily cap, the plugin rejects the call with `DAILY_CAP_EXHAUSTED` and logs visible dashboard error.

4. **Sepolia build phase**: Sponsorship attempts on real Base mainnet (Sepolia has no mainnet-style paymaster). Sepolia builds use faucet ETH directly via Anvil/`web3` calls — wallet holds faucet ETH and pays gas natively. No tag, no paymaster. Simple.

### Gas budget analysis (Base L2 / Anvil fork)

| Action | Est. Gas | Sponsor Cap (real Base) | Wallet-Pays Cost (Anvil fork) |
|--------|----------|--------------------------|-------------------------------|
| `approve(USDC, aavePool, amount)` | ~45K | 5M ✅ | $0.0001 |
| `Repay(USDC, amount, rateMode=2)` | ~130K | 5M ✅ | $0.0003 |
| `Supply(USDC, amount)` | ~80K | 5M ✅ | $0.0002 |
| **Mitigation total (approve + repay)** | ~175K | 5M ✅ | **$0.0004** |
| **Mitigation total (approve + supply)** | ~125K | 5M ✅ | **$0.0003** |

175K gas on Base ≈ $0.0004 at current base fees. The wallet's 200 USDC/day server-side cap (per ADR-003) absorbs this trivially — even 100 consecutive demo mitigations stay under $0.05.

### Demo day gas readiness

1. **Pre-demo checklist**: `keepwork exec lax-mitigation --gas true` on the Anvil fork. Expected: returns `GAS_SPONSORSHIP_DISABLED` (because paymaster can't see fork). The plugin auto-retries `--gas false`. Expected: success.
2. **Tenderly recording run**: Try sponsorship first on the Tenderly fork. If Tenderly's hosted Base fork is recognized by KeeperHub's paymaster (Tenderly has a public Base fork endpoint, so it's possible), sponsorship succeeds and we get one more "use of KeeperHub surfaces" beat. If not, wallet-pays — fine either way; the recording is just for the click-to-verify link, gas economics are invisible to the judge.
3. **Per-mitigation verify**: After every mitigation, `get_execution_logs` returns `gas_used` and `gas_price_gwei` fields per `docs/phase1/KeeperHub Observability Research.md:73-74`. The dashboard surfaces the actual tx cost (sub-cent on the fork) — visible honesty.

## Consequences

**Positive**
- $0 demo gas cost — wallet-pays-gas on Anvil fork totals <$0.01 across the whole demo day, well under the daily cap.
- $0 real-Base-mainnet gas cost — sponsorship via `AgentsOnchain2026` works whenever the paymaster can see a real Base RPC URL (Sepolia build sims, Base-mainnet integration tests during Phase 3).
- 5M gas per-tx is ~28x the estimated 175K → no risk of hitting the cap in either path.
- Tag-based = no per-action configuration, easy to toggle.
- The agent's automatic `--gas true` → `--gas false` retry means **no demo-day human intervention needed** when sponsorship is unavailable. The fallback fires silently — the judge only sees a successful mitigation tx.
- Dashboard surfaces the actual `gas_used` and `gas_price_gwei` per the observability report → visible honesty about cost.

**Negative**
- If `AgentsOnchain2026` tag is auto-removed by KeeperHub (e.g. tag rotation post-hackathon-window) and we forget to re-tag, sponsorship is silently unavailable. Mitigation: the agent always attempts sponsorship first then falls back to wallet-pays — robustness built into the loop, no demo-day surprise.
- If KeeperHub ends their public beta during our 2.5-week build window, the unlimited-gas benefit goes away AND metering kicks in at 5K executions/month. LAX's expected cycles during build: Sepolia iterations (~300 executions), Anvil fork tests (~50 executions), Tenderly recordings (~10 executions), live demo (~10 executions) = ~370 executions.comfortably under 5K. So even post-beta metering is fine.
- The agent's two-step mitigation (approve → repay) consumes two gas budgets per cycle, not one. Anvil fork handles trivially. On real Base mainnet (if we ever demo there), each step is sponsored independently per the "tag applies per-workflow" confirmation in the DoraHacks report. Fine in practice.

## Alternatives Considered

### Alternative 1: Sponsorship-only on the Anvil fork (no wallet-pays fallback)
- Pros: Cleaner code path — only one gas strategy.
- Cons: We assume KeeperHub's paymaster accepts a local Anvil RPC. It almost certainly doesn't (paymaster is server-side hosted and inspects the chain it's paying on). Demo would die at the first mitigation tx.
- Rejected because: hard $0 budget depends on the fallback working when sponsorship can't.

### Alternative 2: Wallet-only gas (no sponsorship attempt at all)
- Pros: Fewer moving parts — skip `--gas true` attempt entirely.
- Cons: We lose the "use of KeeperHub surfaces" judging credit for the sponsorship surface (when it does work, e.g. on real Base or Tenderly). Also noisier on the dashboard — the `gas_sponsorship_working` flag is a visible KPI judges can see.
- Rejected because: we want the surface-usage credit when it's available.

### Alternative 3: Faucet ETH on Sepolia for demo
- Pros: Zero sponsorship/wallet dependency.
- Cons: Not on Base mainnet fork — judges can't see a recognizable block explorer / Aave Pool address. Loses KeeperHub wallet signing credit (wallet can sign on Sepolia, but the demo's Base identity is lost).
- Rejected because: demo impact suffers per ADR-004.

### Alternative 4: x402 / MPP (agent-pays for compute)
- Pros: Demonstrates the "x402 / MPP" judging criterion.
- Cons: x402 is a *payment* protocol for compute, not a gas-payment mechanism. x402 doesn't pay for L1/L2 gas — it pays for marketplace workflow access. Different code path entirely.
- Rejected because: conflates two unrelated concepts. x402 is cut entirely per our ideation decision (not in the demo flow).

## Open Questions — Resolved 2026-07-05 (initial) + 2026-07-05 (revision)

- **`keepwork exec --gas true` behavior (initial)**: Tag-based auto-sponsorship. Workflow tagged `AgentsOnchain2026` is auto-sponsored at execution time — no manual `gas_sponsorship` dashboard toggle is needed. The `--gas true` flag is the only required signal; KeeperHub's executor inspects the workflow's tags and forwards the gas request to its internal paymaster. Verified approach: tag the workflow at `keepwork workflow create` time, then `keepwork exec --gas true` succeeds without further dashboard configuration.
- **Sponsorship denial error messages (initial)**: Three known error variants — `GAS_SPONSORSHIP_TAG_MISSING` (workflow not tagged), `GAS_SPONSORSHIP_QUOTA_EXCEEDED` (post-beta metering), `GAS_SPONSORSHIP_DISABLED` (org-level toggle off OR fork-RPC unrecognized). Safety plugin will match on the `GAS_SPONSORSHIP_*` prefix and surface a structured error rather than swallowing it. For the demo, if any GAS_SPONSORSHIP_* error fires, the plugin automatically retries `--gas false` (wallet-pays) at ~$0.0004/tx on Base — still under daily cap.
- **Does sponsorship work on the Anvil fork? (revision)**: Assume **NO** as the safe default. The paymaster is KeeperHub-server-side hosted; it inspects the target RPC and almost certainly refuses to pay gas for a fork whose block hashes don't match Base mainnet's canonical chain. The agent's automatic `--gas true` → `--gas false` retry absorbs this gracefully. If sponsorship *does* work on the fork during Phase 3 testing (unexpected positive surprise), we get the surface-usage credit for free.
- **Does sponsorship work on the Tenderly fork? (revision)**: Probably yes for Tenderly's hosted fork (Tenderly has a public Base fork endpoint that may be paymaster-recognized). Worth attempting during the recording. Either outcome is acceptable — the recording is for the click-to-verify link, not for gas economics.

## Checklist

- [x] Decision communicated
- [x] Two-path strategy documented (sponsorship primary, wallet-pays-gas fork fallback)
- [x] Gas budget table updated for Anvil fork cost
- [x] Demo day readiness procedure specifies both `--gas true` attempt AND `--gas false` auto-retry
- [ ] Tag `AgentsOnchain2026` set on all LAX workflows at deployment time
- [ ] Phase 3 Sepolia: confirm agent loop auto-retries from `--gas true` failure to `--gas false` success
- [ ] Phase 3 on Anvil Base fork: confirm wallet-pays-gas path costs <$0.001 per mitigation cycle
- [ ] Phase 3 on Tenderly fork: attempt sponsorship once, record outcome (likely yes — Tenderly fork may be paymaster-recognized)
- [ ] `.env.example` documents no gas-related env vars needed (tag is KeeperHub-side, fallback is automatic)
- [x] This ADR saved to `docs/adr/2026-07-05-adr-006-gas-sponsorship.md`
