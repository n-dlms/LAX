# Zero-Cost Testnet Execution Plan — Submission Tx via KeeperHub

> **Build journal — 2026-09-01. Retained for context.** The current verified
> submission transaction is documented in [`VERIFIED-TESTING.md`](VERIFIED-TESTING.md) §1
> (execution `9bc31ofdfca1m62b2v29t`, tx `0x9184…8bac`, workflow `l4pbmt6jdek9c3lwt0y3b`).
> This document records the research path that produced the first live tx
> (`0x1979…ff1a`, execution `2aylk89k…`) and the platform learnings that followed.

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
   through the KeeperHub workflow. Proof = explorer link + the execution ID on the workflow's runs page (`app.keeperhub.com/workflows/<workflow-id>`).
   Remember docs/FEEDBACK.md C1 (`tokenConfig` must be `JSON.stringify`'d) and C2 (`onBehalfOf`
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

---

## Live findings (checked 2026-09-01, local machine)

| Check | Result |
|---|---|
| `GET /api/chains` | ⚠️ **Public endpoint** (200 without auth) — not proof of key validity |
| API key in `.env` (`kh_K2...`) | **INVALID / REVOKED** — 401 on `GET /api/workflows`, `kh auth status`, `kh billing status`. → create a new key at app.keeperhub.com (free, manual step) |
| Base Sepolia (84532) enabled | ✅ `id=tqwfqleepzicpldtpomcf`; Ethereum Sepolia (11155111) and Arbitrum Sepolia (421614) also enabled as backups |
| kh CLI | Was 0.10.0 (below minimum 0.11.1) → updated to **0.15.0** |
| Agentic wallet (`~/.keeperhub/wallet.json`) | ✅ alive: `0x8Bb787...C21C`, subOrg `514bb660-...` (matches `src/config.ts`) |
| Old workflow `7gdt0ty7zk1orq1j4wc74` | 404 — gone; fresh deploy required |
| `kh w info` exec-format-error | kh's npx shim hits this machine's native-binary issue; workaround: `node node_modules/@keeperhub/wallet/bin/keeperhub-wallet.js info` (package ships JS bins, v0.1.15) |
| New CLI behavior | `kh workflow create` makes workflows **DISABLED** — enable via PATCH `{"enabled": true}` (handled in `scripts/deploy-workflow-sepolia.sh`); direct ops via `kh execute contract-call --chain 84532 ...` |
| Cloudflare bot rule | Blocks python-urllib on app.keeperhub.com (403); curl works — pipe curl output to python scripts |

### Deployment tooling added
- `scripts/deploy-workflow-sepolia.sh` — creates/enables the `lax-liquidation-armor-sepolia`
  workflow (trigger → read HF → approve → repay → verify) on 84532 with the Aave address-book
  addresses. Borrower defaults to the agentic wallet (it holds the self-funded position).
  Optional tag via `LAX_SPONSORSHIP_TAG` (tags retired → skipped by default).
- `scripts/list-chains.py` — chain-table formatter (curl | python3).
- Base Sepolia constants in `src/config.ts` (`SEPOLIA_AAVE_POOL`, `SEPOLIA_USDC`, `SEPOLIA_WETH`).

## Deployed (2026-09-01) — first live workflow

- **Workflow `lax-liquidation-armor-sepolia` is live and enabled**:
  ID `l4pbmt6jdek9c3lwt0y3b` (org `141337c2-836f-4adb-a3c2-bce160b7f015`)
  → `https://app.keeperhub.com/api/workflows/l4pbmt6jdek9c3lwt0y3b/webhook` (webhook trigger)
- Read path validated through `kh read --chain 84532`:
  `getUserAccountData` on `0x8bAB...aE27` returns live data — **Aave V3 Base Sepolia Pool address confirmed correct**.
- Auth notes learned live:
  - `kh` CLI stores its own credential — `printf '%s' "$KEY" | kh auth login --with-token`
    (does not read `.env`). Fresh key must be logged-in per machine.
  - New key 401'd for ~a minute after creation before turning 200.
  - Webhook triggers accept only `wfb_` user-scoped keys — `kh_` org keys are rejected
    with 401 on `POST /api/workflows/{id}/webhook`.

### First submission tx (2026-09-01)

**Execution `2aylk89kfhkpl6x7qgtx2` → status SUCCESS, verified on-chain:**

- **Approve USDC** tx `0x19790184b8b1a688bf8b2b50dcacaaf0a7b23648d0519914c8df3e433209ff1a`
  (chain 84532, block 46255232, gasUsed 48639, receiptStatus success)
- Explorer: `https://sepolia.basescan.org/tx/0x19790184b8b1a688bf8b2b50dcacaaf0a7b23648d0519914c8df3e433209ff1a`
- This was the first successful live tx. The current submission evidence is the
  later execution `9bc31ofdfca1m62b2v29t` (approve `0xd15c…2e88` + repay `0x9184…8bac`,
  0.3 USDC) documented in [`VERIFIED-TESTING.md`](VERIFIED-TESTING.md) §1 and
  [`../README.md`](../README.md).

Detected platform gaps (documented in [`FEEDBACK.md`](FEEDBACK.md)):
1. `aave-v3/repay` uint256 `amount` rejects `{{...}}` templates at save-time (422).
2. `web3/write-contract` `functionArgs` array elements do not resolve templates at runtime.
3. The intended dynamic-amount (agent-computed per-trigger) is static 0.3 USDC on Sepolia.

### Full onchain history on 84532 from wallet `0x26833b05be...de5` (first funding)
| action | tx hash |
|---|---|
| wrap 0.002 ETH → WETH | 0x1785bb3f...e12 |
| approve WETH → Pool | 0xa8c0568a...938c |
| supply 0.002 WETH | 0xc0250c19...8391 |
| borrow 1 USDC | 0xa79f8af3...a8a3 |
| workflow: approve 0.3 USDC → Pool | 0x19790184...ff1a (first live execution) |

### Live-learned platform gotchas (July → Sep 2026 drift)
- **Templating syntax changed**: `{{trigger.body.X}}` is dead. Node references are now
  label-based: `{Trigger.body.X}` — nodes need explicit `label` fields for refs to resolve.
- **`kh workflow create` accepts configs that `PATCH` update rejects** (create skips
  validation; update runs INVALID_ACTION_CONFIG checks). Always PATCH after create to
  validate, and never silence update failures.
- **`aave-v3/repay` amount (uint256) rejects template references at save-time** — use
  `web3/write-contract` with `abi` (stringified), `abiFunction`, and `functionArgs` as a
  **real JSON array** (not a stringified one) containing the reference as an element.
- **`kh wallet balance` reveals the true executor address** (per-org creator wallet);
  `wallet.json`'s address is not what signs/broadcasts on the platform.

