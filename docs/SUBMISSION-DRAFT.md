# LAX — Submission Draft (KeeperHub — The Agent Economy)

Fill the DoraHacks form from this. Three required artifacts: source link + demo
video + KeeperHub tx link. Incomplete submissions cannot be judged.

## Which project did you integrate with, and what does the integration do?

Aave V3 (live, deployed protocol — not a wrapper):
- Base mainnet Pool `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` (demoed via Anvil
  fork at block 48236883, port 18545)
- Base Sepolia Pool `0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27` (live testnet path)

LAX is a proactive liquidation defender: it monitors `getUserAccountData` health
factor continuously and, at HF ≤ 1.05 (above the 1.0 liquidation threshold),
repays exactly `debt × (1 − HF_cur / HF_tgt)` USDC to restore HF 1.10 — before
MEV bots can act. KeeperHub is the execution layer: the daemon computes the
amount at fire time, passes it in the HMAC-signed webhook payload, and the
`lax-liquidation-armor(-sepolia)` workflow executes read HF → approve USDC →
repay → verify HF with the Turnkey agentic wallet. Every fire prints
`app.keeperhub.com/runs/<id>`.

## Which KeeperHub surfaces did you use?

- MCP servers (aggregate + per-workflow `lax-liquidation-armor`) — `opencode.jsonc`
- Aave V3 plugin (`get-user-account-data`, `repay`) + `web3/approve-token`
- Webhook trigger (`POST /api/workflows/{id}/webhook`, `wfb_*` key, HMAC-signed
  via `src/keeperhub.ts`, verified by `api/keeperhub-proxy.ts`)
- Agentic wallet (Turnkey; LAX never touches a private key)
- Gas sponsorship: org-level credits on testnet (free, no event tag — confirmed in
  Discord Sep 10; direct-wallet sender via public mempool, no Safe). Fork demo is
  wallet-pays-gas (free local ETH)
- Audit trail (`kh run status`, dashboard `useExecutionPoller`, `lax runs`)
- NOT used: x402 / MPP (cut in Phase 1, see `docs/SCOPE.md`)

## Testnet or mainnet?

- Live value movement: Base Sepolia (84532), real testnet txs, sponsored gas.
- Deterministic demo: Anvil fork of Base mainnet (local, HF ~1.10 → shock −28% →
  trigger → repay → verify). No mainnet funds touched.

## Canonical tx / run links (verify before submitting)

- Workflow `lax-liquidation-armor-sepolia` `l4pbmt6jdek9c3lwt0y3b`
- 2026-09-06 verified fire: execution `9bc31ofdfca1m62b2v29t`,
  audit `https://app.keeperhub.com/runs/9bc31ofdfca1m62b2v29t`
- Approve `https://sepolia.basescan.org/tx/0xd15cc2c844ea4a0dd50e0878d6819dcff116f48e98f7e2489e6d96679fca2e88`
- Repay `https://sepolia.basescan.org/tx/0x918441fcd4d2071733afc139ed0b5c29cba34ddeefc2ca1583499b10827c8bac`
  (0.3 USDC, mode 2, onBehalfOf; debt 0.7002 → 0.4002, HF 6.067 → 10.615)
- Re-verify both links the day before Sep 18 12:00 CEST; re-fire via
  `./scripts/fire-sepolia.sh` if anything 404s. Full log: `docs/VERIFIED-TESTING.md`.

## Confirmed logistics (Luca | KeeperHub, Discord)

- **Gas**: no event tag — org credits under Settings > Billing only. Testnet is
  not charged at all; mainnet meters against the cap. Sponsorship only applies
  on a direct wallet sender (not Safe) via the public mempool.
- **Bounty**: an **open PR by the deadline** is enough, merge not required;
  PRs reviewed after submission. Feature → go straight to PR; issue first only
  for bugs/sanity checks. Our PR #2268 is already merged, so this is covered.
- **BUIDLs**: separate BUIDL per track — a BUIDL can only go to one track.
  Bounty BUIDL should **link the PR** (not the merge commit).
- **Tx requirement**: a testnet tx + `app.keeperhub.com/runs` link satisfies it.
  Judges do **not** re-run workflows — they read the repo, watch the video, then
  open the explorer link and **match the tx against their own execution records**.
  Video + tx hash is enough. Run history persists in the account through judging.
- **Repo**: must be **public by Sep 18** — private links cannot be judged.
  Push/edit the BUIDL right up to 12:00 CEST Sep 18; whatever is there at the
  deadline is what they look at.
- **Video**: no length rule but keep it **under 3 min**, just show it running.
  Unlisted YouTube is fine — verify it plays **without a login**. Show the tx
  hash on screen. Live pitch only if we make the finalist panel.
- **Repo requirements**: none hard, but "could another team pick this up" is
  part of the rubric → README with real setup steps (have it) and a license
  (good practice, not required).
- Credits reset monthly and have nothing to do with judging.

## Pre-deadline checklist (all before Sep 18 12:00 CEST)

1. **Push repo to a PUBLIC GitHub remote** ← only blocking item, need repo URL
2. Create main-track BUIDL (source = repo, video, tx links above)
3. Create separate bounty BUIDL linking PR `KeeperHub/keeperhub#2268`
4. Record demo video (<3 min, RUNBOOK beats 0–7 + `fire-sepolia.sh`), upload
   unlisted YouTube, confirm it plays logged-out, tx hash visible on screen
5. Re-verify tx/run links resolve; re-fire via `./scripts/fire-sepolia.sh` if not
6. Fill BUIDL contact fields (email / X / Discord below)

## What still breaks or is unfinished?

1. The Sepolia workflow repays a static 0.3 USDC: `aave-v3/repay` uint256
   `amount` rejects `{{...}}` template refs at save-time, and
   `web3/write-contract` `functionArgs` array elements don't resolve templates
   at runtime. Mitigated: the daemon computes the exact amount at fire time and
   sends it in the webhook payload; the workflow amount stays fresh per fire
   only by redeploying the static value. Honest limitation, bounty candidate.
2. Gas sponsorship is org-level credits (no event tag, confirmed Discord Sep 10);
   testnet uncharged. Fork path is wallet-pays (free).
3. `--local` CLI onchain actions are fork-only (Anvil unlocked dev account);
   public RPCs need the KeeperHub workflow path.
4. Bounty PR `KeeperHub/keeperhub#2268` (docs: gas-sponsorship fallback) —
   MERGED Sep 9 (`b3d1953`); open PR is enough per Discord, separate BUIDL required.

## Contact

- Email: [FILL]
- X / Discord: [FILL]
