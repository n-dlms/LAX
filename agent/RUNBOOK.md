# LAX Demo Runbook

The live sequence for the demo laptop. The centerpiece is `lax autopilot`:
boot the daemon, crash the oracle on the fork, and watch the gate approve and
KeeperHub execute — nothing typed during the crash. Fits in ~90 seconds.

## Setup (before the demo)

1. `./scripts/demo-up.sh` — one command: boot fork, seed position, fund wallet, health check
   (idempotent; re-running is always safe)
2. `export KEEPERHUB_API_KEY=<key>` (in `.env`) — so the daemon can fire the workflow
3. Optional: `npx tsx bin/lax.ts` — the interactive CLI REPL for manual beats

Optional fallback (legacy one-shot): `npx tsx scripts/hf-listener.ts`

## Beats

| Beat | Action | Expected |
|---|---|---|
| 0 | `npm run lax -- status` | Banner, HF gauge green (`SAFE — LAX ARMED ZONE`), box border cyan |
| 1 | `npm run lax -- arm` | `ARMED — auto-trigger enabled` (persisted in `~/.lax/state.json`) |
| 2 | `npm run lax -- autopilot daemon` | Daemon header: LIVE mode, position list, cooldown |
| 3 | `./scripts/drop-oracle-price.sh -28` (2nd terminal) | Oracle drops → HF falls toward 1.05 |
| 4 | Watch daemon log flip | `✔ HF 1.0xxx — above trigger` → `⚡ TRIGGER HF ≤ 1.05 — repay 32.40 USDC` |
| 5 | Gate stages print | `✔ HF Math Verification` → `✔ Pre-flight Simulation` → `✔ Safety Bounds` → `✔ spend-caps` |
| 6 | Fire | `🗲 fired → execution <id>` + `audit trail: app.keeperhub.com/runs/<id>` |
| 7 | `npm run lax -- status` (3rd terminal) | Yellow `LAX TRIGGER ZONE`/border during execution; HF restored toward 1.10 |

Dry-run variant (no API key needed): run beat 2 as
`npm run lax -- autopilot daemon --dry-run` — the full pipeline runs and the
daemon stops at "gate approved, webhook NOT fired".

**Real-transaction beat** (the submission evidence): after the fork beats, run
`./scripts/fire-sepolia.sh` — one real webhook fire on Base Sepolia producing
approve + repay transactions and the audit trail. The verified run is logged in
[`docs/VERIFIED-TESTING.md`](../docs/VERIFIED-TESTING.md).

## Failure modes

- **Anvil not up** → daemon logs `position read failed` each poll; rerun `./scripts/start-fork.sh`.
- **Gate blocked (spend-caps)** → the fork demo repays ~$32, but default caps are
  $10 block / $5 daily (wallet-ops posture). Run the demo sized up:
  `LAX_BLOCK_THRESHOLD_USD=50 LAX_DAILY_LIMIT_USD=100 npm run lax -- autopilot daemon`.
  The daily spend persists across restarts (by design); reset it with `rm ~/.lax/safety.json`.
- **Wallet not funded** → preflight fails with an ERC-20 allowance revert; run `./scripts/fund-demo-wallet.sh`.
- **KeeperHub API key missing** → live mode fails at fire; use `--dry-run` or export the key.
- **Workflow error** → check the audit-trail link in the daemon output; template-reference
  errors are the known platform gap — report, don't silently work around.

## Recording

- Capture the daemon terminal + the `lax status` gauge + the audit-trail link.
- The submission requires a demo video + a tx link; both come from this run.
- `~/.lax/mitigations.jsonl` is the append-only local log of every trigger,
  gate decision, and fire — show it with `lax runs` or `tail ~/.lax/mitigations.jsonl`.
