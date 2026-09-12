# ADR-007: Demo Environment — Anvil Fork of Base Mainnet (Live) + Tenderly Fork Recording (Backup Link)

**Number**: ADR-007
**Title**: Demo Environment — Anvil Fork of Base Mainnet (Live) + Tenderly Fork Recording (Backup Link)
**Date**: 2026-07-05
**Status**: Accepted
**Relates To**: ADR-004 (Chain Strategy), ADR-005 (Aave V3 Path), ADR-006 (Gas Sponsorship), `docs/phase1/Aave V3 Liquidation Mechanics Research.md`, `docs/phase1/KeeperHub Observability Research.md`
**Supersedes**: Nothing

---

## Revision History

| Date | Change | Source |
|------|--------|--------|
| 2026-07-05 (initial) | First ADR. Anvil for live demo, Tenderly for recorded backup link. | `docs/phase1/Aave V3 Liquidation Mechanics Research.md:32-46` (all mainnet HF degradation trigger methods revert) |

---

## Context

LAX's demo requires a health factor degradation trigger — an oracle price drop that pushes the demo position's HF from 1.20 down to 1.04, where LAX fires the proactive defense.

Per `docs/phase1/Aave V3 Liquidation Mechanics Research.md:32-46`, every programmatic HF degradation method on **real Base mainnet** is infeasible:

| Trigger Method | Result | Why |
|----------------|--------|-----|
| `borrow()` to increase debt | REVERTS | Aave's `ValidationLogic.sol` enforces post-borrow HF >= 1.0 |
| `withdraw()` to reduce collateral | REVERTS | Same validation — cannot leave HF < 1.0 |
| Flash loan to borrow + withdraw | REVERTS | Atomic intermediate state never committed to chain; keepers never see a liquidatable state |
| Disable collateral via `setUserUseAsCollateral(false)` | REVERTS | Same — cannot leave collateral insufficient to support debt |
| Real Chainlink oracle price drop | Only plausible path | BUT uncontrollable for a reproducible demo — we cannot time or guarantee a $-denominated price movement |

The only feasible path is a **fork** of Base mainnet with programmatic oracle storage override via `anvil_setStorageAt` (or Tenderly's equivalent). The fork preserves:
- Chain ID 8453 (Base) → wallet signing works identically
- Aave V3 Pool contract at the mainnet address (`0xA238Dd80C259a72e81d7e4664a9801593F98d1c5`)
- All mainnet state (existing Aave positions, liquidity, oracles)

Per `docs/phase1/KeeperHub Observability Research.md:278-280`, KeeperHub doesn't expose embeddable widgets — we build our own dashboard polling `get_execution_logs`. The fork's RPC is where the agent and wallet point.

## Decision

LAX will build a **two-tier demo environment**:

### Tier 1: Anvil fork (live demo — primary)

Startup script `scripts/start-fork.sh`:

```bash
anvil \
  --fork-url "$BASE_RPC_URL" \
  --fork-block-number 12345678 \
  --chain-id 8453 \
  --block-time 1 \
  --host 127.0.0.1 \
  --port 8545
```

Configuration:
- **Pinned block**: TBD at Phase 3 kickoff. Requirements: (a) Aave V3 Pool has stable reserves on that block, (b) Chainlink USDC/USD and WETH/USD Aggregators have NOT pushed a new answer in the prior 5 blocks (so we can cleanly override without conflicting with a real upcoming update), (c) our test wallet address (pre-funded via `anvil_setStorageAt` during fork boot) has ~5 USDC.
- **`--block-time 1`**: 1s block time for the demo (Base mainnet is ~2s). Faster blocks = less wait time between approve and repay confirmations. Acceptable because it's a fork — block time is a simulation parameter, not a chain consensus value.
- **`--chain-id 8453`**: Matches Base mainnet chain ID. Required for `@keeperhub/wallet` to recognize the chain in its Turnkey policy allowlist (per ADR-003).

Post-fork-setup script `scripts/fork-setup-usdc.sh`:

```bash
# 1. Get the Chainlink USDC/USD Aggregator address for Base
cast call 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5 "getAssetPrice(address)(uint256)" 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
  --rpc-url http://localhost:8545
# Returns the Aggregator address used by Aave's PriceOracle

# 2. Override the Aggregator's `latestAnswer` storage slot to simulate a price drop
# This is the Chainlink Aggregator's storage layout: slot 0 = latestAnswer (int256)
# The price drop amount depends on the target HF change.
cast rpc anvil_setStorageAt \
  <aggregator_address> \
  0x0 \
  <new_price_hex_encoded_32_bytes> \
  --rpc-url http://localhost:8545
```

Override strategy:
- Initial price: real Chainlink price at the pinned block (e.g. $1.00 for USDC/USD)
- First override: drop price 5% → $0.95 → HF goes from 1.20 to ~1.05 (watch threshold, yellow)
- Second override (after demo pause): drop price another 3% → $0.92 → HF goes from 1.05 to ~1.04 (TRIGGER)
- Agent fires, repays, HF recovers to 1.10.

The two-step override gives the demo a "the price dropped 5%... we're watching... it dropped another 3%... NOW we act" narrative — more dramatic than a single drop.

All Anvil processes run in a `tmux` session on the demo laptop so the judge can see the Anvil logs scroll (a subtle "this is real infrastructure" signal).

### Tier 2: Tenderly fork recording (backup link — pre-recorded)

Workflow:
1. Create a Tenderly fork of the same Base mainnet block (from Tenderly web UI or API).
2. Execute the identical flow (same oracle override sequence, same agent, same wallet).
3. Capture the shareable URL (`https://dashboard.tenderly.co/simulator/<sim_id>` or similar).
4. Embed the link in the dashboard as "See the original simulation on Tenderly →"

The Tenderly link gives judges:
- Visual storage inspector showing the oracle override
- Block trace showing each tx (approve → repay) in order
- Gas profiler showing actual gas consumption per tx
- A recognizable DeFi-tooling brand (credibility signal)

Tier 2 replaces Tier 1 ONLY if the Anvil live demo fails (laptop crash, RPC connection lost, wallet signing timeout). During a normal demo, Tier 2 is shown as the "you can verify this later" link.

### Oracle storage slot selection

The Chainlink Aggregator v3 contract stores `latestAnswer` in storage slot 0 (int256 per the Chainlink source). Some Aave deployments use a `DefaultReserveInterestRateStrategy` or `PoolAddressesProvider` that wraps the oracle call — but the upstream Aggregator is what powers `getUserAccountData`. Exact storage slot and Aggregator address confirmed in Phase 3 by reading the Aave V3 Pool's `getAssetPrice()` and tracing back to the underlying Aggregator contract.

If `anvil_setStorageAt` on the Aggregator does not propagate to Aave's `getUserAccountData` (because Aave caches the price in a secondary contract), fallback: override the `PriceOracle` contract's `getAssetPrice()` return by deploying a mock price oracle via `anvil_setCode` on the `PoolAddressesProvider.getPriceOracle()` address. Simpler but riskier — requires `setCode` which Anvil supports.

Decision: try `anvil_setStorageAt` on the Aggregator first (simpler, no contract redeployment). If `getUserAccountData` does not reflect the override, fallback to `anvil_setCode` mock oracle. Confirmed in Phase 3 Sepolia build week.

### Demo laptop specification

- OS: Ubuntu 22.04+ or macOS 14+
- RAM: 16GB+ (Anvil fork of Base mainnet consumes ~4-8GB for the pinned state)
- Storage: 20GB free (Anvil state cache grows to ~2-5GB for a newer Base block)
- Network: Required for Phase 3 build, NOT required for live demo (Anvil is local)
- Software: Foundry (`anvil`, `cast`), Node.js 20+, `@keeperhub/wallet`, KeeperHub CLI, tmux

## Consequences

**Positive**
- **Deterministic demo**: Every run starts from the same pinned block, same positions, same oracle price. No variance, no "the price didn't move this time" failure mode.
- **Zero network dependency**: The live demo runs on the laptop's localhost. Bad venue wifi = fine. No RPC provider rate limits.
- **Wallet integration preserved**: Chain ID 8453 is preserved → `@keeperhub/wallet` signs as if it's real base. Turnkey's server-side contract allowlist recognizes Base USDC address.
- **Tenderly recording as credible fallback**: The pre-recorded Tenderly simulation is NOT "the real demo" — it's a supplementary "click and verify" link. If the live demo works (which it should), the Tenderly link is a nice bonus. If the live demo breaks, the Tenderly link is a backup that was recorded under the same conditions.
- **Two-stage oracle override = built-in dramatic tension**: "The price dropped 5%... we're watching... it dropped another 3%... NOW." This is a better narrative beat than a single drop.

**Negative**
- **`anvil_setStorageAt` may not propagate**: The Aggregator's storage slot may not be the direct source of Aave's `getAssetPrice()` value. If Aave uses a `PriceOracle` wrapper that caches prices independently, overriding the Aggregator has no effect. Mitigation: fallback to `anvil_setCode` mock oracle path documented above, tested in Phase 3 week 1.
- **Fork state size**: Base mainnet block at the pinned block number may require significant RAM/disk for the Anvil fork. Mitigation: pin to a relatively early Base block number (if a block with stable Aave state exists) and use `--fork-block-number` to limit state load. Test fork speed with the chosen block in Phase 3 Sepolia → Base fork migration week.
- **Demo laptop must have 16GB+ RAM**: If the LAX builder's laptop only has 8GB, the Anvil fork may OOM. Mitigation: use `--no-storage-caching` and reduce the state layer, or fallback to Tenderly-only demo (Tier 2 as the live demo). Verify before build.
- **Tenderly free tier**: Tenderly free tier allows limited fork simulations. If we exceed 100 simulations/month (generous — we expect <10), we'd need to upgrade or use Tenderly's pay-as-you-go. For the recording, we need exactly 1 simulation. Fine.

## Alternatives Considered

### Alternative 1: Tenderly-only demo (no Anvil)
- Pros: Simpler setup, one environment to maintain, Tenderly's visual dashboards are ready-made.
- Cons: Tenderly is a hosted service. If it's rate-limited or down at demo time, the live demo dies. No local fallback.
- Rejected because: hackathon demos fail on third-party infra dependencies. The PLAYBOOK Rule "demo must work offline" demands local-first.

### Alternative 2: Hardcode HF and skip the fork entirely
- Pros: Simplest possible. No Anvil, no Tenderly, no storage overrides. Just render "HF = 1.04" on a dashboard.
- Cons: The demo is entirely fake. Judges see no real txns, no real contract calls, no real wallet signing. LAX is an *onchain* agent — showing nothing onchain defeats the purpose.
- Rejected because: the demo loses all technical credibility.

### Alternative 3: Sepolia fork only (no Base state)
- Pros: Simpler Aave V3 deployment (Sepolia testnet Aave Pool exists).
- Cons: Sepolia Aave Pool has no real liquidity by default — we'd deploy mock tokens. Chain ID is 11155111, which `@keeperhub/wallet` cannot sign for (Turnkey allowlist limited to Base 8453, Tempo chains). No wallet integration possible.
- Rejected because: doesn't exercise wallet signing → loses a KeeperHub surface credit.

### Alternative 4: No orchestrated HF trigger — wait for a real price move
- Pros: 100% real — the demo fires on an actual mainnet oracle update.
- Cons: The demo cannot be scheduled. Wait time could be 5 minutes or 5 hours. A hackathon pitch slot is 3 minutes.
- Rejected because: impossible to time within a judged session.

## Open Questions — Resolved 2026-07-05

- **Will `anvil_setStorageAt` on the Aggregator storage slot 0 propagate to `getUserAccountData`?**: Unknown until tested in Phase 3. The Aggregator's `latestAnswer` feeds into Aave's `PriceOracle.getAssetPrice()`, which `getUserAccountData` calls under the hood. Three possible outcomes: (1) it works directly (slot 0 is the Aggregator's `latestAnswer` and Aave reads it fresh each call — best case), (2) the Aggregator stores price in a different slot (unlikely — Chainlink's `AggregatorV3` stores `latestAnswer` in slot 0 per the Chainlink storage layout), (3) Aave's `PriceOracle` implementation caches or wraps the Aggregator call in a way that `setStorageAt` doesn't reach. Decision: test in Phase 3 week 1 on Anvil fork. If path (1) works, done. If (3), fallback to `anvil_setCode` mock oracle redeployment (another 2-hour build cycle). Flagged as highest-risk onboarding item for Phase 3 day 1.
- **Which Base block number to pin?**: Selected during Phase 3 week 2 (after Sepolia shake-out but before demo recording). Criteria: (a) block where `getUserAccountData` responds with non-zero values, (b) no Chainlink oracle update in prior 5 blocks, (c) Aave V3 Pool has at least $1M WETH and $1M USDC reserves (so the demo position looks real). Use Tenderly's block explorer or Dune Analytics to find a qualifying block in the August 2026 range.
- **Demo laptop specs**: Met by the builder's hardware (verified early in Phase 3). If RAM < 16GB, switch to `--prune-state server` mode or Tenderly-only fallback.
- **Tenderly recording URL format**: `https://dashboard.tenderly.co/<user>/<fork-name>/simulator/<sim-id>`. Exact format confirmed at Tenderly fork creation time in Phase 3.

## Checklist

- [x] Decision communicated
- [x] Two-tier environment documented (Anvil live + Tenderly recording)
- [ ] `scripts/start-fork.sh` written and tested on Phase 3 day 1
- [ ] `scripts/fork-setup-usdc.sh` written (oracle override logic)
- [ ] Phase 3 week 1: Test `anvil_setStorageAt` → verify `getUserAccountData` reflects new price
- [ ] Phase 3 week 2: Select pinned block number per criteria above
- [ ] Phase 3 week 2: Run Tenderly recording of the identical flow, capture shareable URL
- [ ] Dashboard embeds the Tenderly URL as "Click to verify"
- [ ] `scripts/start-fork.sh` integrated into the demo startup sequence
- [ ] Demo laptop verified: 16GB+ RAM, Foundry installed, Node.js 20+
- [ ] Idle-demo failure backup: if `anvil_setStorageAt` fails, fallback to `anvil_setCode` mock oracle path
- [x] This ADR saved to `docs/adr/2026-07-05-adr-007-demo-environment-tenderly-anvil-fork.md`
