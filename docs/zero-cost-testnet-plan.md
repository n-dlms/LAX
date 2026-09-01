# Zero-Cost Testnet Execution Plan — Submission Tx via KeeperHub

**Goal**: produce the submission requirement "link to a transaction executed through KeeperHub"
on a real testnet (Base Sepolia) with **$0.00 total spend**.
**Researched**: 2026-09-01 (live web sources verified by research agent).
**Fallbacks**: Ethereum Sepolia → Arbitrum Sepolia → sponsored USDC transfer.

---

## Verdict

YES — achievable at $0. KeeperHub's gas sponsorship (Turnkey Gas Station) explicitly covers
Base Sepolia and **testnet usage is not charged**. Faucets for gas are ungated. Aave V3 has a
real Base Sepolia deployment, and its testnet USDC can be obtained without any faucet via a
supply → borrow → repay flow — which itself exercises more KeeperHub Aave V3 plugin surface.

## Key model changes vs. our ADRs (stale assumptions)

| Old assumption | Current reality |
|---|---|
| ADR-006: hackathon sponsorship **tag** (`AgentsOnchain2026`) | **Retired.** Sponsorship is an org-level toggle in Settings → Billing (gas credits). Free tier: 5,000 executions/mo, no card. |
| ADR-004: Turnkey wallet only signs on chains 8453/4217/42431 | Docs: wallets work on **all supported EVM chains plus their testnets**. |
| Need ETH in the wallet for gas | On the sponsored route the Turnkey EOA can hold **zero native balance** — a relayer submits and pays. |

⚠️ Private-mempool routing and Safe-Sender disable sponsorship. Test with a trivial sponsored
transfer before the real flow.

## Recommended path (Base Sepolia, chainId 84532)

1. **Confirm chain enablement**: `GET https://app.keeperhub.com/api/chains` with the `kh_` key.
   Pick the entry with `chainId: 84532`, `isEnabled: true`, `isTestnet: true`.
   Reference guide: https://docs.keeperhub.com/guides/first-verified-transaction
   ("Zero to a Verified Onchain Transaction" — written for exactly this requirement).
2. **Enable sponsorship**: Settings → Billing → gas sponsorship toggle (free on testnet).
3. **Faucet gas ETH** — Coinbase Developer Platform faucet:
   https://www.coinbase.com/developer-platform/products/faucet
   0.0001 ETH per claim, up to 1,000 claims/24h, free account, no card.
   Also dispenses ~1 testnet USDC ×10/24h.
4. **Aave V3 Base Sepolia contracts** (official Aave address book,
   https://aave-dao.github.io/aave-address-book/api/v1/modules/AaveV3BaseSepolia.json):
   - `AaveV3BaseSepolia.POOL` = `0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27`
   - Aave's testnet USDC = `0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f`
     (⚠️ NOT Circle USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` — Circle USDC cannot repay Aave)
   - WETH = `0x4200000000000000000000000000000000000006`
5. **Fund the position (no USDC faucet needed)** — all steps via KeeperHub workflow
   (Aave V3 plugin / `web3/write-contract`):
   wrap a sliver of ETH → WETH → `supply(WETH)` → `borrow(1 Aave-USDC)`.
6. **The submission tx**: `approve(POOL, USDC)` → `repay(USDC, amount, 2, onBehalfOf)`
   through the KeeperHub workflow. Proof = explorer link + `app.keeperhub.com/runs/<id>`.
   Remember FEEDBACK.md C1 (`tokenConfig` must be `JSON.stringify`'d) and C2 (`onBehalfOf`
   is required).

Public RPC (free): `https://sepolia.base.org` (official, per docs.base.org).

## Backup paths

1. **Ethereum Sepolia**: Chainlink faucet https://faucets.chain.link/ethereum-sepolia
   (0.5 ETH + 25 LINK, wallet-connect) + Circle faucet https://faucet.circle.com
   (20 USDC/2h, no account, Circle USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`)
   + Aave V3 Sepolia deployment.
2. **Arbitrum Sepolia**: sponsorship-supported; Aave V3 exists (`AaveV3ArbitrumSepolia`,
   chainId 421614; USDC `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`).
3. **Last resort**: sponsored transfer of 1 Circle USDC — zero native balance needed, still a
   real value-moving tx through KeeperHub (satisfies the form, weaker Aave story).

## Gated / dead options (do not waste time)

| Option | Status |
|---|---|
| Alchemy Base Sepolia faucet | Gated: needs ≥0.001 ETH on Ethereum mainnet + mainnet activity |
| QuickNode faucet | Requires tweet/share + wallet connect, 1 drip/12h |
| Google Cloud Web3 faucet | Auth-gated; historically requires mainnet balance |
| Chainlink Base Sepolia faucet | Live but wallet-connect/login gated (unverified) |
| `AgentsOnchain2026` tag | Retired — see model changes above |
| Official Base faucet page | Points to third parties; no standalone official faucet |

## Uncertainties (live-test first)

1. Is Base Sepolia `isEnabled` for new orgs in `GET /api/chains`? (5-min check, do first)
2. Aave testnet faucet for its USDC via app.aave.com testnet mode — if unavailable, the
   supply→borrow route above makes it irrelevant.
3. Sponsorship toggle location/eligibility quirks — validate with a trivial sponsored transfer.
4. CDP faucet "USDC" identity (irrelevant for the recommended path — repay uses Aave's USDC).
