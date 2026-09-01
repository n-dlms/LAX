# ADR-004: Chain Strategy — Sepolia Build, Base Mainnet Demo via Anvil Fork, Tenderly Recording Fallback

**Number**: ADR-004
**Title**: Chain Strategy — Sepolia Build, Base Mainnet Demo via Anvil Fork, Tenderly Recording Fallback
**Date**: 2026-07-05 (updated 2026-07-05 — see Revision History)
**Status**: Accepted
**Relates To**: MISSION.md, SCOPE.md, ADR-005, ADR-006, ADR-007 (Demo Environment), `docs/phase0/Sepolia Faucet and Gas Analysis.md`, `docs/phase0/KeeperHub Wallet Technical Review.md`, `docs/phase1/Aave V3 Liquidation Mechanics Research.md`
**Supersedes**: Nothing

---

## Revision History

| Date | Change | Source |
|------|--------|--------|
| 2026-07-05 (initial) | Three-chain strategy: Sepolia → Base → Arbitrum | Phase 0 research |
| 2026-07-05 (revision) | Demo trigger cannot run on Base mainnet (Aave's ValidationLogic.sol reverts all programmatic HF degradation paths). Added Anvil fork of Base mainnet as the live demo environment, with Tenderly recording as click-to-verify backup link. Removed Arbitrum fallback (cannot be signed by wallet anyway per ADR-003). | `docs/phase1/Aave V3 Liquidation Mechanics Research.md:32-46` |

---

## Context

LAX must deploy and demo on some EVM chain. The constraints from research:

- **Aave V3 is available on**: Ethereum mainnet, Base, Arbitrum, Polygon, Avalanche, Optimism, Metis, zkSync Era, Scroll, Linea, Gnosis (`docs/phase0/KeeperHub Aave V3 Analysis.md:26-31`).
- **Sepolia Aave V3 Pool**: `0x6Ae43d3271ffe43ae11119e5cde0c50b7efbe56b` (not `0x6A676b1e566c...` — confirmed via research).
- **Sepolia faucet**: Coinbase CDP faucet gives 0.1 ETH/24h, no mainnet balance needed (`docs/phase0/Sepolia Faucet and Gas Analysis.md:10-15`). Alternative: Alchemy Sepolia faucet (0.5 ETH/24h).
- **Gas sponsorship** via `AgentsOnchain2026` tag works on any chain KeeperHub supports (`docs/phase0/KeeperHub Gas Sponsorship Analysis.md:18-24`).
- **Wallet smart contract** at `0x12345...DEAD` only on Base + Tempo chains per server-side allowlist (`docs/phase0/KeeperHub Wallet Technical Review.md:82-88`). Can only sign for chain IDs 8453 (Base), 4217 (Tempo mainnet), 42431 (Tempo testnet).
- **Demo requirement**: judges will not run Sepolia — the demo must "work" on a live chain they can see block explorers for. Report says the hackathon expects mainnet submissions.
- **Hard $0 constraint**: all chain interactions must be cost-free.

## Decision

LAX will operate a **two-chain strategy + one fork environment**:

| Environment | Phase | Purpose |
|-------------|-------|---------|
| **Sepolia** | Build (Phase 3) | Iteration, debugging, first-tx milestone. Use Coinbase CDP faucet for 0.1 ETH/24h. |
| **Anvil fork of Base mainnet** | Demo (Phase 4-5) | Live demo environment. Forked locally on the demo laptop. Wallet signs on Base (chain ID 8453 preserved by Anvil). Programmatic oracle price override drives HF degradation deterministically. |
| **Tenderly recording of the Anvil fork** | Demo (Phase 4-5) | Pre-recorded fallback. Shareable `tenderly.co/sim/<id>` link. Embedded in dashboard as "Click to see the original fork simulation." Used only if live demo breaks. |

**Why Base mainnet (via fork) is the demo environment**:

1. `@keeperhub/wallet` can sign on Base — chain ID 8453 is in the allowlist (per ADR-003). Anvil preserves the fork's chain ID, so wallet signing works identically to mainnet.
2. Gas is cheap on Base (~0.001 USD per tx) — even on the fork where sponsorship may not work (see ADR-006), the wallet pays trivial gas.
3. KeeperHub's Turnkey server-side contract allowlist includes Base USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) per `KeeperHub Wallet Technical Review.md:84-86`.
4. **The HF degradation cannot be triggered on real Base mainnet** — Aave's `ValidationLogic.sol` reverts every programmatic path (`borrow`, `withdraw`, `flash loan`, `disable collateral`) per `docs/phase1/Aave V3 Liquidation Mechanics Research.md:32-46`. Only a fork with oracle storage override can simulate the price drop.

**Why Anvil for live demo, Tenderly for the recording**:

- **Anvil is local**: zero wifi/cloud dependency, no rate limits, no third-party downtime risk during the live demo. The demo laptop runs `anvil --fork-url <BASE_RPC> --fork-block-number <pinned> --chain-id 8453` and the agent + wallet + KeeperHub RPC all point to `http://localhost:8545`.
- **Tenderly is the credibility link**: we record the identical flow once on a Tenderly fork of the same pinned block, get a shareable simulation URL, and embed it in the dashboard as "see the original simulation at tenderly.co/sim/<id>." Judges who want to verify can click through and see Tenderly's visual storage inspector + block trace.

**Why not Ethereum mainnet directly**: wallet chain ID 1 not on Turnkey allowlist (only Base, Tempo). Cannot sign with `@keeperhub/wallet`. Plus, the demo HF degradation is impossible on mainnet per the research report.

**Sepolia financial flow (Phase 3 build)**: Use Coinbase CDP faucet for 0.1 ETH/24h across all Sepolia iteration. Deploy `USDCSepoliaMock` on build day 1 for test USDC. Sepolia is for *shaking out the agent loop* before replicating the flow on the Base fork.

## Consequences

**Positive**
- Clear phase-to-environment mapping. Sepolia shake-out → Anvil fork of Base for live demo → Tenderly fork for click-to-verify backup.
- Anvil = zero external infra dependency for the live demo. Survives bad venue wifi, Tenderly outages, RPC provider rate limits.
- Tenderly link gives judges a recognizable "professional tooling" credibility signal — any DeFi judge knows Tenderly.
- Chain ID 8453 preserved by Anvil means `@keeperhub/wallet` signs identically to mainnet — no special wallet config for the fork.
- The oracle storage override (via `anvil_setStorageAt` writing the Chainlink Aggregator's `latestAnswer` slot) makes the HF tickdown deterministic — same demo every time, no flakiness.
- Wallet signing on the fork exercises real Turnkey custody — the demo is a faithful mainnet simulation, not a mock.

**Negative**
- Gas sponsorship via KeeperHub's `AgentsOnchain2026` tag **may not work on a local Anvil fork** — the paymaster is a KeeperHub-server-side concept; if the fork's RPC isn't recognized, sponsorship returns `GAS_SPONSORSHIP_DISABLED`. Mitigation: wallet pays gas on the fork directly (~$0.001/t x, well under the $5 daily cap in `safety.json`). See ADR-006 for full fallback analysis.
- The Tenderly recording is a *static artifact* — judges can't re-run it live, only watch the recorded simulation. This is acceptable because Anvil is the live demo.
- Pinned block number means the Aave state on the fork is fixed. If we want to demo with a fresh-onchain USDC balance, we must either (a) find a block where our test wallet already has USDC, or (b) supply USDC to the wallet on the fork via a one-time `anvil_setStorageAt` write at fork boot. Decision: supply via storage write at boot — see ADR-007 for the exact script.
- Arbitrum fallback is removed entirely. If Base mainnet Aave Pool experiences an issue on the *fork's pinned block* (unlikely — block is chosen for stability), we re-pin to an earlier stable block. No Arbitrum escape hatch.

## Alternatives Considered

### Alternative 1: Sepolia-only demo
- Pros: Zero financial risk, faucet tokens.
- Cons: Judges cannot verify on a live mainnet fork (Sepolia has different contract deployments, no recognizable Aave V3 Pool at the Base address). Lost points on demo impact + "use of KeeperHub surfaces" judges Sepolia differently from Base.
- Rejected because: judged hackathon — demo must show live mainnet-fork action with the Base Aave Pool.

### Alternative 2: Tenderly-only demo (no Anvil)
- Pros: Built-in visualizations, shareable simulation URL, professional credibility.
- Cons: Tenderly is a hosted service — if it's rate-limited or down at demo time, we lose the live demo. Anvil gives us the Tenderly recording as a fallback without the cross-dependency in the critical path.
- Rejected because: hackathon demos fail on infra dependencies all the time; we want the live demo to be local-first.

### Alternative 3: Real Base mainnet demo with external price movement trigger
- Pros: It's the "most real" demo possible — actual mainnet, actual liquidation race.
- Cons: Aave's `ValidationLogic.sol` reverts every programmatic HF degradation path (`borrow`, `withdraw`, `flash loan`, `disable collateral`) per `docs/phase1/Aave V3 Liquidation Mechanics Research.md:32-46`. The only way HF drops on mainnet is a real Chainlink price update, which we cannot control or time. The demo would either (a) wait minutes for a real price move (boring, not reproducible) or (b) never fire (demo dies on stage).
- Rejected because: cannot reproduce. The fork is the only honest path.

### Alternative 4: Arbitrum fork instead of Base fork
- Pros: Similar L2 gas economics, established Aave V3 deployment.
- Cons: `@keeperhub/wallet` cannot sign on Arbitrum (chain ID 42161 not in Turnkey allowlist per ADR-003). Anvil can fork Arbitrum and preserve chain ID 42161, but the wallet will refuse to sign — server-side hard policy enforced by Turnkey itself.
- Rejected because: wallet integration breaks.

## Open Questions — Resolved 2026-07-05 (initial) + 2026-07-05 (revision)

- **Obtaining Base USDC without a mainnet bridge (initial)**: Use the Coinbase Onramp sandbox (free, no KYC for sandbox) to acquire a small amount of Base USDC during Phase 3. Fallback: use Aerodrome (Base native DEX) to swap a small amount of Base ETH (acquired from a Base ETH faucet like `base.org/faucet`) to USDC. Target: 5 USDC for the demo, well under any faucet cap. Decision: try Coinbase Onramp sandbox first during Phase 3 build day 1; if blocked, fall back to Aerodemo swap path.
- **Sponsorship covers ERC-20 approve (initial)**: Yes. Gas sponsorship tags apply per-workflow, not per-action-type. Both the approve workflow and the repay/supply workflow are tagged `AgentsOnchain2026`, so both are sponsored independently. Confirm during first sponsored transaction in Phase 3 day 1; if approve is unexpectedly not sponsored, fallback path is wallet-pays-gas at ~$0.0001 on Base (still well under daily cap).
- **Does gas sponsorship work on the Anvil fork? (revision)**: Per ADR-006 update — assumed **NO**. The `AgentsOnchain2026` paymaster is a KeeperHub-server-side construct requiring the workflow execution request to flow through KeeperHub's hosted executor. If that executor refuses to relay on a fork RPC (because it inspects the RPC's parent block hash for mainnet consistency and detects the Anvil fork), sponsorship returns `GAS_SPONSORSHIP_DISABLED`. Mitigation is wallet-pays-gas directly via the `@keeperhub/wallet`'s Turnkey custody — at ~$0.001/tx on Base (even forked), the $5 daily cap in `safety.json` allows ~5,000 mitigation cycles per demo day. Acceptable. _Verify this in Phase 3 day 1 by pointing KeeperHub's executor at the Anvil fork RPC and observing sponsorship success/failure._
- **Pinned block selection for the fork (revision)**: Pin to a Base mainnet block from the first week of August 2026 where (a) the Aave V3 Pool has stable reserves, (b) the Chainlink USDC/USD and WETH/USD oracles have not pushed an update in the prior 5 blocks (so we can override cleanly), and (c) our test wallet holds ~5 USDC after the fork storage write. Exact block number TBD at Phase 3 kickoff.

## Checklist

- [x] Decision communicated
- [ ] README updated with chain-table
- [ ] .env.example includes `SEPOLIA_RPC_URL`, `BASE_RPC_URL`, `ANVIL_FORK_RPC_URL`
- [ ] Phase 3 day 1: Confirm wallet signs on Anvil fork of Base (chain ID 8453 preserved)
- [ ] Phase 3 day 1: Confirm `@keeperhub/wallet` pays gas on Anvil fork when sponsorship is `GAS_SPONSORSHIP_DISABLED`
- [ ] Phase 3 day 1: Pin the demo block number (criteria documented above)
- [ ] Phase 3 day 1: Tune `anvil_setStorageAt` oracle override script for deterministic HF tickdown
- [ ] Phase 3 week 2: Record Tenderly simulation of the same flow, capture `tenderly.co/sim/<id>` URL for dashboard embedding
- [x] This ADR saved to `docs/adr/2026-07-05-adr-004-chain-strategy.md`
