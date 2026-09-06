# LAX — Verified Testing Log

**Date:** 2026-09-06 · **Environment:** Linux x64, Node v24.16.0, Anvil fork of Base mainnet @ block 48236883, Base Sepolia (84532) live testnet.
Every claim below was executed against a live chain or a real KeeperHub deployment on this date. Nothing in this document is aspirational.

---

## 1. Live fire through KeeperHub (the submission evidence)

The workflow `lax-liquidation-armor-sepolia` (id `l4pbmt6jdek9c3lwt0y3b`, chain 84532) was
triggered via its webhook (`POST /api/workflows/{id}/webhook`, `Authorization: Bearer wfb_…`)
and completed **5/5 steps, status success**:

| Node | Result | Evidence |
|---|---|---|
| Webhook trigger | accepted, `status: running` | executionId `9bc31ofdfca1m62b2v29t` |
| read_hf (aave-v3/get-user-account-data) | success | 0x2683… position read on 84532 |
| approve_usdc (web3/approve-token) | **tx mined** | [0xd15cc2c8…2e88](https://sepolia.basescan.org/tx/0xd15cc2c844ea4a0dd50e0878d6819dcff116f48e98f7e2489e6d96679fca2e88) |
| repay (aave-v3/repay, 0.3 USDC, mode 2, onBehalfOf) | **tx mined, status 1** | [0x918441fc…8bac](https://sepolia.basescan.org/tx/0x918441fcd4d2071733afc139ed0b5c29cba34ddeefc2ca1583499b10827c8bac) |
| verify_hf | success | post-trade position read |

**On-chain before/after** (verified via `cast call` against `https://sepolia.base.org`):

- variable debt: `70020374` → `40023470` (0.7002 → 0.4002 USDC — exactly the repaid 0.3)
- health factor: `6.067 → 10.615`
- executed by KeeperHub's signing relayer `0xDcF4bac4…` (the platform's agentic wallet — LAX never touches a private key)

Audit trail: https://app.keeperhub.com/runs/9bc31ofdfca1m62b2v29t

Reproduce: `./scripts/fire-sepolia.sh`

## 2. Mitigation gate — every fire path checked, blocking verified

The gate (HF math verification → preflight simulation → safety bounds → spend caps)
is wired into **all** fire paths: `lax autopilot` daemon, CLI `engage`, and the legacy listener.

Real outcomes observed during testing:

- **Approved path** (fork, price −25%, `LAX_BLOCK_THRESHOLD_USD=50`):
  `TRIGGER HF 1.0265 ≤ 1.05 — repay 32.40 USDC` → all 4 stages pass → `dry-run-approved`.
- **Blocked: spend caps** — with default caps, the $32.40 repay was blocked
  (`BLOCK_THRESHOLD_EXCEEDED: $32.40 > $10.00`) and **nothing fired**. The safety system working.
- **Blocked: daily budget persisted across restarts** — accumulated spend ($97.21) survived
  dozens of process restarts via `~/.lax/safety.json` and blocked further fires. A daemon
  restart cannot reset the budget.
- **Caught a real on-chain failure before firing**: an unfunded executing wallet made the
  preflight simulation revert (`ERC20: transfer amount exceeds allowance`) — the gate blocked
  the fire instead of producing a failed on-chain execution.
- **Dry-runs do not consume budget**: `recordSpend` is off in dry-run mode; two consecutive
  dry-runs both passed with an empty spend ledger (verified: no `safety.json` written).

## 3. CLI command battery (all commands executed live)

Executed against the Anvil fork (HTTP 200 path) and the offline path:

- **Monitor/read**: `status` (HF gauge + danger-colored border), `hf`, `position`, `oracle`,
  `debt`, `collateral`, `ltv`, `block`, `reserves`, `pool`, `config`, `keeper`, `whoami`,
  `ping`, `connect` — all return live fork data (HF 1.0978, $665 collateral, $480 debt).
- **Guardian**: `arm`/`disarm`/`guardian on|off|status` persist across processes via
  `~/.lax/state.json` (verified: armed in one process, `ENABLED` in a fresh process);
  threshold/target validation rejects <1.0, ≥target, and invalid input.
- **Mock/stress**: `shock`, `drip`, `flash-crash`, `simulate-hf`, `scenario`, `panic`,
  `freeze/unfreeze-oracle`, `mock-start/stop`, `reset-price` — all execute real fork
  transactions and restore cleanly. Verified HF states: 1.0978 (green SAFE), 1.0407
  (yellow TRIGGER ZONE), 0.9523 (red LIQUIDATABLE).
- **Onchain actions** (`--local`, real fork txs): `approve`, `supply`, `withdraw`, `repay`,
  `paydown`, `boost` — all mined; tx hashes printed.
- **Audit**: `runs`, `run`, `history`, `audit`, `export`, `snapshot`/`snapshots`/`compare`
  (session-scoped, verified inside one REPL session), `tx <hash>`, `tail`.
- **Confirmation gates**: `repay`/`approve`/`supply`/`withdraw`/`crash`/`scenario`/`panic`
  without `--confirm` are intercepted before execution (verified per-command).
- **Input validation**: NaN/zero/negative amounts, malformed addresses/hashes, unknown
  commands (with fuzzy suggestions), missing args — all rejected with exit code 1.
- **Offline behavior**: with the RPC unreachable, commands degrade to a clean
  `Mode: offline` panel (exit 0) and the daemon reports `rpc-unreachable` and keeps polling.
- **REPL & scripting**: interactive REPL, piped scripting (`echo "status\nruns" | lax`),
  `lax clear` wipes the scrollback, Ctrl+L shortcut.

## 4. Autopilot daemon

- `once`, `once --dry-run` (full pipeline, never fires), continuous `daemon` mode with
  2s polling, SIGINT graceful shutdown (finishes the poll, writes the shutdown record).
- Cooldown: with `lastFiredBy` set, a second trigger logs `cooldown active — not re-firing`.
- Multi-position: `lax.config.json` (`lax.config.example.json`) — verified `[main]` (HF 1.0978)
  and `[treasury]` (no debt) monitored in one pass with per-position thresholds and cooldowns;
  `--only <name>` filtering verified (including the not-found error).
- Interval/cooldown flags parse (`--interval 1` → `polling every 1.0s`).
- Append-only log `~/.lax/mitigations.jsonl` records trigger / gate-blocked / dry-run /
  webhook-fired / shutdown events.

## 5. Test suite & static checks

- `npx tsc --noEmit` — clean (root + dashboard).
- `npx vitest run` — **14 files, 464/464 passing** (2 fork-live helper tests skip when no
  fork is running and pass when it is — verified both states).
- Covers: repay math (closed-form HF targeting), critique gate stages, preflight simulator
  contract + live helper subprocess tests, safety plugin (caps, persistence), multi-position
  config parsing, wallet resolution, listener, e2e integration, config validation.
- Dashboard production build (`vite build`) succeeds with the shared CLI core.

## 6. Demo infrastructure (judge reliability)

- `./scripts/demo-up.sh` — idempotent, self-healing; verified by three consecutive runs
  converging to HF 1.0978 and by recovery from a deliberately corrupted state.
- `fork-setup-usdc.sh` made idempotent (re-running supply/borrow on a seeded fork
  over-leveraged the position until `getUserAccountData` panicked — now guarded).
- `dry-run.sh` 5× — full pipeline (fork restart → seed → −28% oracle drop → HF
  1.0978 → 1.0212 → offline approve→repay→verify) passed 5/5.
- `fund-demo-wallet.sh` — idempotent (balance/allowance checks skip when funded).

## 7. Real bugs found and fixed during verification

These were found *because* the battery exercised real chains, not mocks:

1. **Wrong selector for `getUserAccountData`** (`0x2dfdf0b5` → `0xbf92857c`) — the original
   dashboard CLI had never actually read a live position.
2. **Wrong selector for `repay`** (`0x57372581` → `0x573ade81`) — every preflight repay
   simulation reverted.
3. **Price-shock math bug** — percent→basis-points used ×10,000 instead of ×100, so any
   shock ≥1% computed a *negative* price (invalid calldata revert).
4. **HMAC verification always failed** — the proxy compared bare hex against the
   client's `sha256=<hex>` (length mismatch).
5. **Spend-cap reset on restart** — daily budget was in-memory; now persisted.
6. **Dry-runs consumed the daily budget** — now check-only.
7. **Webhook key type** — webhook triggers require `wfb_*` keys; the fire path now
   prefers them automatically.
8. **`--only` not wired** from the binary into the daemon's position filter.
9. **Dashboard auto-fired on page load** with the guardian disarmed — now requires `arm`.

## 8. Multi-network monitoring (verified live, two chains, one loop)

With `lax.config.json` declaring `base-fork` (local RPC) and `base-sepolia`
(public Sepolia RPC), the daemon monitored both positions in a single pass —
live output:

```
✔ 21:05:24 [main]    HF 1.0978  — above trigger 1.05    (Anvil fork of Base)
✔ 21:05:25 [sepolia] HF 10.6227 — above trigger 1.2    (live Base Sepolia)
```

The Sepolia row is a real on-chain read of the same position whose debt the
live fire (§1) reduced. On trigger, each position fires its own network's
KeeperHub workflow with its own pool/USDC — nothing is hardcoded to a chain.

## 9. Known transients (by design, not bugs)

- The first read right after an Anvil boot can race the fork warm-up (~1–2 s);
  the daemon retries and `demo-up.sh` waits for a real position read.
- Fork blocks mine on a 1 s interval; reads immediately after a state-changing
  transaction may see the prior block (the CLI waits for inclusion on price writes).
- Snapshot/compare/history are session-scoped by design (verified within one REPL session).
