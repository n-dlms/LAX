# LAX CLI — The Complete User Guide

Everything you need to run the Liquidation CLI confidently — from your first
command to scripting the autopilot in production. No prior DeFi experience
assumed; every term is explained the first time it appears.

---

## Table of Contents

1. [LAX in 60 seconds](#1-lax-in-60-seconds)
2. [Words you'll see everywhere](#2-words-youll-see-everywhere)
3. [Getting started](#3-getting-started)
4. [Three ways to run it](#4-three-ways-to-run-it)
5. [The fastest tour: `lax demo`](#5-the-fastest-tour-lax-demo)
6. [Watching your position](#6-watching-your-position)
7. [The safety model](#7-the-safety-model)
8. [Command reference](#8-command-reference)
9. [The autopilot daemon](#9-the-autopilot-daemon)
10. [Operator alerts (Discord & Slack)](#10-operator-alerts-discord--slack)
11. [History and evidence](#11-history-and-evidence)
12. [Configuration](#12-configuration)
13. [Scripting, exit codes, and automation](#13-scripting-exit-codes-and-automation)
14. [Troubleshooting](#14-troubleshooting)
15. [Command index](#15-command-index)

---

## 1. LAX in 60 seconds

LAX is a guardian for Aave lending positions. It watches your **health factor**
continuously and repairs the position *before* it can be liquidated — instead
of racing bots after the fact.

Two things make it trustworthy:

- **Nothing fires without passing a safety gate.** Every mitigation is verified
  by math, simulated on-chain, and checked against spending limits first.
- **Everything is recorded.** Every trigger, decision, and transaction lands in
  a log you can read with `lax runs` and replay with `lax explain`.

You interact with LAX three ways: the interactive terminal, one-shot commands,
and the background daemon that defends positions around the clock.

---

## 2. Words you'll see everywhere

| Term | What it means |
|------|---------------|
| **Collateral** | What you deposited into Aave (e.g. $665 of WETH) |
| **Debt** | What you borrowed (e.g. $480 of USDC) |
| **Health factor (HF)** | The ratio of collateral to debt. High = safe, low = danger. Falls when the price of your collateral drops |
| **Liquidation** | If HF reaches **1.0**, anyone can repay your debt and take your collateral at a discount. That's the emergency LAX prevents |
| **Trigger threshold** | The HF where LAX acts — default **1.05**, safely above liquidation |
| **Target HF** | Where LAX repairs you to — default **1.10** |
| **Mitigation** | The repair itself: repaying just enough USDC debt to restore your HF |
| **The gate** | Four independent safety checks that must all pass before anything fires |
| **Dry-run** | Executing the full pipeline *except* the part that moves money |

---

## 3. Getting started

### What you need

- **Node.js 20+** and npm
- **A running node to talk to.** For the demo that's a local fork of Base
  mainnet — one command starts it (below). LAX also connects to any Aave V3
  chain, live or local.
- **KeeperHub keys** (optional — only needed for firing the KeeperHub workflow
  and the autopilot daemon, not for reading your position)

### Install and boot the demo

```bash
git clone <repo-url> && cd LAX
npm install
cp .env.example .env        # then edit .env with your keys (see §12)
./scripts/demo-up.sh        # forks Base mainnet, seeds a vulnerable position, funds the wallet
npm run lax                 # opens the LAX terminal
```

`demo-up.sh` is idempotent and self-healing — run it again any time something
looks wrong. It is safe to re-run.

### Your first 30 seconds in the terminal

```console
$ lax            # from the repo root; or: npm run lax
lax> status
lax> watch
```

If `status` shows a health factor and a gauge, everything works.

---

## 4. Three ways to run it

**1. Interactive terminal** — what most people use:

```bash
npm run lax
```

You get command history (↑/↓), tab completion, and `help` at any time.

**2. One-shot commands** — for quick checks and shell scripts:

```bash
npm run lax -- status
npm run lax -- hf
```

**3. Piped scripting** — feed a whole session through stdin:

```bash
printf 'status\nruns\nexit\n' | npm run lax
```

> 💡 **Tip** — exit code **0** means success (including healthy checks),
> **1** means something failed. Safe to chain in CI.

---

## 5. The fastest tour: `lax demo`

One command plays the whole story — no setup, nothing to click:

```bash
lax demo            # dry-run by default: nothing moves
lax demo --yes      # the same story, with the repay executed for real on the fork
```

What you'll see, step by step:

1. **Your position, healthy** — the gauge shows where you stand
2. **A market crash** — the WETH oracle price drops 25%
3. **Your HF falls** — LAX polls and watches it drop
4. **The gate decides** — all four safety stages print their verdicts
5. **The repair executes** — approve + repay on-chain (with `--yes`)
6. **Verification** — HF restored above target, before any liquidation

Real output from a verified run:

```console
$ lax demo
1 · The position we're defending
HF 1.0894  SAFE — LAX ARMED ZONE
   ██████████▮──────────────
   0.8                    2.0   liq 1.00 · trigger 1.05
   collateral $660.13 · debt $480.00

2 · Market crashes — WETH drops 25%
▲ WETH/USD $3202.52 → $2401.89

4 · TRIGGER — the mitigation gate decides
⚡ HF 1.0202 ≤ 1.05 → repay 35.186300 USDC (exact amount, computed at fire time)
✔ PASS HF Math Verification — Passed (0ms)
✔ PASS Pre-flight Simulation — Passed (243ms)
✔ PASS Safety Bounds Check — Passed (0ms)
✔ PASS spend-caps — Repays $35.19 within block/daily caps
🛡 Gate approved 4/4 — execution authorized

6 · Verify — the position is repaired
✔ HF restored: 1.0199 → 1.1009 (target 1.1) — before any liquidation.
```

> 💡 **Tip** — run `lax demo` as many times as you like. If a previous run left
> the fork crashed, the demo notices and *heals the scenario first*.
>
> ⚠️ **Note** — `--yes` moves funds on the **local fork only** (worth nothing).
> Add `--webhook` to also fire the KeeperHub workflow for a real audit trail.

---

## 6. Watching your position

### The one-screen summary: `lax status`

```console
$ lax status
HF 1.0978  SAFE — LAX ARMED ZONE
   ████████▮────────────────
   0.8                    2.0   liq 1.00 · trigger 1.05
Collateral: $665.00
Debt: $480.00
Block: #48237611
Guardian: ENABLED
```

The gauge is your whole risk picture in one line: the marker `▮` is you, red is
the liquidation zone, yellow is where LAX acts, green is calm water.

### The live view: `lax watch`

```console
$ lax watch
HF 1.0484  LAX TRIGGER ZONE
   ██████████▮──────────────
   0.8                    2.0   liq 1.00 · trigger 1.05
   trend ▼ ███▆▄▂  (last 8 samples)
   collateral $639.84   debt $480.00   guardian ARMED
   Ctrl-C to stop
```

`lax watch` redraws every 2 seconds (`--interval 1` to speed it up) and draws a
sparkline so you can *see* the trend — falling bars mean falling HF. `Ctrl-C`
stops it cleanly. In piped (non-interactive) runs, it prints one sample and
exits so scripts never hang.

### The "what if" view: `lax whatif`

Ask the question every borrower actually cares about:

```console
$ lax whatif --shock 25
What-if: collateral drops 25% right now
────────────────────────────────────────────────────────────
  HF now:       1.0978  █████████████░░░░░░░░░░░  caution — close to the trigger
  HF shocked:   0.8234  ██████████░░░░░░░░░░░░░░  LIQUIDATABLE — bots can close the position

  Collateral:   $665.00 → $498.75
  Debt:         $480.00 (unchanged)

Defense cost — restore HF to 1.1:
  REPAY debt:   $0.95 today → $120.72 after the shock  (defending early saves $119.76)
  SUPPLY col.:  $161.25 at LT 0.8
  Comparator:   recommends REPAY (alternative SUPPLY: $161.25)
```

Read that "defending early saves" line twice — it is LAX's whole reason to
exist in one number. Options:

| Flag | Meaning |
|------|---------|
| `--shock 30` | Size of the hypothetical price drop (default 20%) |
| `--lt 0.85` | Assumed liquidation threshold of your collateral for the SUPPLY comparison (default 0.8) |
| `--json` | The same analysis as machine-readable JSON |

---

## 7. The safety model

Nothing moves funds without passing every layer below, in order:

| Layer | Guarantee | Where you see it |
|-------|-----------|------------------|
| 1. Confirmation | Destructive commands require `--confirm` or an interactive `y` | every onchain/mock command |
| 2. HF math check | The computed repay amount provably reaches the target HF | `HF Math Verification` |
| 3. Preflight simulation | The approve+repay pair is *simulated* against the chain before anything real | `Pre-flight Simulation` |
| 4. Safety bounds | Selector allowlist + per-transaction and daily spend caps | `Safety Bounds Check` · `spend-caps` |

> 📌 **The most important sentence in this guide:** a blocked fire is a
> *successful* safety outcome. The gate prints each stage's verdict and nothing
> touches the chain.

Default caps are deliberately small — they protect a demo wallet ($10 per
transaction, $5 per day). The fork demo repays ~$30–47, so the demo sizes its
own caps to $50/$100 automatically. For real positions, set:

```bash
LAX_BLOCK_THRESHOLD_USD=200   # max per transaction
LAX_DAILY_LIMIT_USD=500       # max per 24h window (persisted across restarts)
```

---

## 8. Command reference

Conventions: `$` marks your shell, `lax>` marks the interactive terminal.
Bracketed parts are optional. Commands marked **Confirm** need `--confirm`.

### Read — see where you stand

| Command | What it does |
|---------|--------------|
| `lax status` | The full picture: HF gauge, collateral, debt, block, guardian |
| `lax hf` | Just the health factor with the gauge |
| `lax position` (alias `pos`) | Position breakdown: collateral, debt, net |
| `lax debt [token]` · `lax collateral [token]` | Sides of the position in detail |
| `lax oracle [token]` | The Aave price oracle feed for a token |
| `lax ltv` · `lax liquidation-price` | Loan-to-value, and the collateral price at which you'd be liquidatable |
| `lax block` · `lax reserves` · `lax pool` | Chain head, Aave reserve list, pool addresses |
| `lax config` · `lax whoami` | LAX's own parameters; the resolved borrower/wallet |
| `lax keeper` | KeeperHub connectivity and workflow binding |
| `lax watch [--interval SEC]` | Live monitor with sparkline — see §6 |

### Analyze — think before it happens

| Command | What it does |
|---------|--------------|
| `lax whatif [--shock PCT] [--lt LT] [--json]` | Crash scenario: shocked HF and defense cost — see §6 |

### Guard — control the autopilot

| Command | What it does |
|---------|--------------|
| `lax arm` / `lax disarm` | Enable/disable auto-defense. **The daemon only fires when armed.** State persists across restarts |
| `lax guardian on/off/status` | Same idea, explicit form |
| `lax threshold 1.04` | Set your trigger HF (must be above 1.0) |
| `lax target 1.15` | Set the HF to restore to |
| `lax engage` | Fire a mitigation *now* through the gate (no waiting for HF to drop) |
| `lax autopilot` | One manual scan of all positions |
| `lax cooldown 15` | Minimum seconds between fires per position |

### Simulate — exercise the whole pipeline (fork only)

| Command | What it does |
|---------|--------------|
| `lax shock weth -30%` **Confirm** | Instant oracle price drop |
| `lax crash weth -40%` **Confirm** | Multi-block crash |
| `lax drip weth -2% 5` | Slow bleed: −2% every 5 blocks |
| `lax panic` **Confirm** | Everything crashes at once |
| `lax recovery weth +5%` | Price recovery |
| `lax reset-price` | Restore oracle prices |
| `lax simulate-hf 1.03` **Confirm** | Force a specific HF (mock mode) |
| `lax mock-start` / `lax mock-stop` | Freeze the position so scenarios are repeatable |

### Execute — move funds (gated, confirmed)

All execution commands require **Confirm**. With `--local` they run directly
against the fork's funded dev account (deterministic, no KeeperHub). Without
it, they route through your KeeperHub workflow.

| Command | What it does |
|---------|--------------|
| `lax repay 5` (alias `paydown`) | Repay 5 USDC of debt |
| `lax approve usdc 10` | Approve a token spend |
| `lax supply usdc 5` | Supply collateral |
| `lax boost 100` | Supply extra collateral to raise HF |
| `lax swap weth 1 usdc` | Reserved for the workflow swap path |

> ⚠️ **Careful** — `--local` works only on the local fork (it uses the fork's
> unlocked dev account). On a public network, let the KeeperHub workflow
> execute; it signs with your agentic wallet.

### Audit — prove what happened

| Command | What it does |
|---------|--------------|
| `lax runs [--limit N] [--json]` | The persistent mitigation log — see §11 |
| `lax explain <id \| index>` | Replay a gate decision stage by stage — see §11 |
| `lax run <id>` | One KeeperHub execution's details |
| `lax tx <hash>` | Receipt lookup: block, status, gas, explorer link |
| `lax snapshot [label]` · `lax snapshots` · `lax compare <id>` | Capture the position now, diff it later |
| `lax history [--limit N]` · `lax tail [--lines N]` | Your command history this session |
| `lax audit` · `lax export` | Session summary; full JSON dump |

### Manage — sessions and help

| Command | What it does |
|---------|--------------|
| `lax help [command]` · `lax man <command>` · `lax aliases` | Built-in docs |
| `lax clear` · `lax reset` | Wipe the screen / fresh session |
| `lax connect [url]` · `lax ping` · `lax block` | RPC health |
| `lax version` · `lax uptime` · `lax debug on/off` | Housekeeping |
| `lax guide` · `lax tutorial` | In-terminal versions of this guide's tour |

---

## 9. The autopilot daemon

The daemon is LAX standing guard: it polls every configured position and
defends automatically. Nothing fires unless the guardian is **armed** (`lax arm`).

```bash
npm run lax -- autopilot daemon               # continuous defense
npm run lax -- autopilot daemon --dry-run     # full pipeline, never fires
npm run lax -- autopilot once                 # one poll pass, then exit
```

Every trigger prints the four gate stages as they're decided:

```console
[lax-fork] HF 1.0265 ≤ 1.05 — repay 32.40 USDC → target 1.1
· [lax-fork] ✔ hf-math: Repay 32.40 USDC reaches target 1.10 within tolerance
· [lax-fork] ✔ preflight: approve+repay simulated ok (233ms)
· [lax-fork] ✔ spend-caps: Repays $32.40 within block/daily caps
⚡ [lax-fork] fired → execution 9bc31ofdfca1m62b2v29t
     audit trail: https://app.keeperhub.com/runs/9bc31ofdfca1m62b2v29t
```

### Flags

| Flag | Meaning | Default |
|------|---------|---------|
| `daemon` (alias `start`) | Continuous monitor loop | — |
| `dry-run` | Full pipeline, never fires | — |
| `once` | One poll pass, then exit (CI/demo scripts) | — |
| `--only <name>` | Monitor one named position from `lax.config.json` | all |
| `--interval <sec>` | Seconds between polls | 2 |
| `--cooldown <sec>` | Minimum seconds between fires per position | 300 |
| `--dry-run` | Same as the `dry-run` mode flag | — |

> 📌 **Note** — `Ctrl-C` shuts down gracefully: it finishes the current poll,
> writes a shutdown record to the log, then exits. A daily-cap reset is
> intentional persistence, not a bug — see troubleshooting.

---

## 10. Operator alerts (Discord & Slack)

LAX can message you the moment something happens: a trigger, a gate block, a
fire, or a failure. This is what you enable when the daemon runs unattended.

### Setup takes two minutes (Discord)

1. In your Discord server, open the target channel → **Edit Channel**
2. **Integrations → Webhooks → New Webhook**
3. **Copy Webhook URL**
4. Add it to `.env`: `LAX_ALERT_WEBHOOK=https://discord.com/api/webhooks/…`
5. Test it:

```console
$ lax alert --test
Test alert delivered to Discord — check the channel.
```

Slack works the same way (Incoming Webhooks; LAX auto-detects both and formats
native embeds). Any other URL that accepts `{"text": "…"}` works too.

### What you'll receive

Each alert names the position, the health factor, the repay amount, and the
KeeperHub execution link. Blocked fires arrive in red, executions in green.

> 💡 **Tip** — alerts are *best-effort by design*. If your webhook is down,
> LAX logs it and the mitigation proceeds. Safety never depends on the messenger.

---

## 11. History and evidence

LAX keeps an append-only log of everything it does:
`~/.lax/mitigations.jsonl`. It survives restarts — it is your permanent record.

### `lax runs` — the log, human-readable

```console
$ lax runs
Mitigation log — /home/you/.lax/mitigations.jsonl
────────────────────────────────────────────────────────────────────────
  09:40:22  ⛔ BLOCKED     HF 1.0265  repay 32.40 USDC  stages [hf-math:ok,preflight:FAIL,spend-caps:ok]
  10:02:13  ⚡ FIRED       HF 1.0431  repay 32.32 USDC  exec 9bc31ofdfca1m6…
                          https://app.keeperhub.com/runs/9bc31ofdfca1m62b2v29t
```

Each row is one decision: triggers (▲), gate blocks (⛔), fires (⚡),
failures (✖), dry-runs (◌). Fires carry the KeeperHub audit permalink and the
on-chain transaction hashes.

### `lax explain` — the "why" behind any decision

```console
$ lax explain 1
  Gate stages:
    ✓ hf-math — Repay 32.32 USDC reaches target 1.10 within tolerance
    ✗ preflight — eth_call reverted: ERC-20 allowance insufficient
  Verdict: blocked at preflight — nothing touched the chain.
```

Use a 1-based index (counting from the most recent entry in `lax runs`) or a
full execution ID. This is the command to reach for when you want to *show*
someone why LAX did — or refused to do — something.

> 💡 **Tip** — `lax runs --json` gives the whole log machine-readable, and
> `tail -f ~/.lax/mitigations.jsonl` follows it live.

---

## 12. Configuration

### Files LAX keeps (in `~/.lax/`, override with `LAX_STATE_DIR`)

| File | What it is |
|------|------------|
| `state.json` | Guardian arm state, cooldowns, spend ledger. Auto-backed-up if it's ever corrupt |
| `mitigations.jsonl` | The append-only evidence log (`lax runs`) |
| `safety.json` | Daily-cap ledger — persists across restarts by design |

### `lax.config.json` — positions and networks

Copy `lax.config.example.json` as a starting point. Each position is an
address on a named network, and the daemon defends all of them in one loop:

```json
{
  "networks": {
    "base-fork": {
      "rpc": "http://127.0.0.1:18545",
      "aavePool": "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
      "usdc": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "workflowId": "7gdt0ty7zk1orq1j4wc74"
    }
  },
  "positions": [
    { "name": "lax-fork", "network": "base-fork",
      "borrower": "0xf39F…92266", "threshold": 1.05, "target": 1.10 }
  ]
}
```

Any Aave V3 deployment works: add a network (RPC + pool + USDC + workflow) and
point positions at it.

### Wallet resolution

The executing wallet is never hardcoded. LAX resolves it, in order:

1. `LAX_WALLET_ADDRESS` environment variable
2. `~/.keeperhub/wallet.json` (the KeeperHub agentic wallet)
3. The address in `src/config.ts`

The defended borrower resolves: CLI argument → `LAX_BORROWER_ADDRESS` → the
wallet itself when `LAX_SELF_DEFENSE=true`.

### `.env` keys

| Key | Used for |
|---|---|
| `KEEPERHUB_API_KEY` (`kh_*`) | org API: workflow management, executions, MCP |
| `KEEPERHUB_WEBHOOK_KEY` (`wfb_*`) | webhook fires — the daemon prefers it automatically |
| `LAX_WORKFLOW_ID` / `LAX_WORKFLOW_ID_SEPOLIA` | workflow binding (per network in config works too) |
| `LAX_BORROWER_ADDRESS`, `LAX_WALLET_ADDRESS`, `LAX_SELF_DEFENSE` | who is defended / who executes |
| `LAX_BLOCK_THRESHOLD_USD`, `LAX_DAILY_LIMIT_USD` | spend caps |
| `LAX_ALERT_WEBHOOK` | operator alerts (Discord/Slack) — see §10 |
| `LAX_FORK_RPC`, `LAX_ENV_FILE`, `LAX_STATE_DIR`, `LAX_CONFIG_PATH` | endpoints and file locations |

---

## 13. Scripting, exit codes, and automation

- Exit code **0** — success, including healthy scans and needs-confirmation.
- Exit code **1** — any error, blocked command, or failed check.
- Piped input runs strictly in order, one command at a time:

```bash
printf 'arm\nshock weth -25%% --confirm\nstatus\nexit\n' | npm run lax
```

- CI-friendly dry-run — the exit code reflects the gate verdict:

```bash
LAX_BLOCK_THRESHOLD_USD=50 LAX_DAILY_LIMIT_USD=100 npm run lax -- autopilot once
```

- Machine-readable output where you need it: `lax export`, `lax runs --json`,
  `lax whatif --json`.

---

## 14. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Mode: offline` / `position read failed` | RPC unreachable | `./scripts/demo-up.sh` (boots the fork) |
| Gate blocks with `BLOCK_THRESHOLD_EXCEEDED` | repay > block cap | size caps: `LAX_BLOCK_THRESHOLD_USD=50 LAX_DAILY_LIMIT_USD=100` |
| Gate blocks with `DAILY_CAP_EXCEEDED` | 24 h ledger full | intentional — reset with `rm ~/.lax/safety.json` |
| Preflight: `transfer amount exceeds allowance` | executing wallet not funded on the fork | `./scripts/fund-demo-wallet.sh` |
| `KEEPERHUB_API_KEY not set` | `.env` missing keys | copy from `.env.example`, re-run |
| `wrong_key_type` on a fire | org key used for webhook | add `KEEPERHUB_WEBHOOK_KEY` (`wfb_*`) to `.env` |
| Stale HF right after a fork tx | 1 s block time | reads retry; wait one block |
| HF 1.10 forever on Sepolia | healthy position, no risk | expected — lower `threshold` in config to exercise the trigger |
| Guardian disarmed warning | daemon won't auto-fire | `lax arm` |
| `lax demo` starts with "healing the scenario" | a previous run left the fork crashed | it heals itself — let it finish; worst case `./scripts/demo-up.sh` |
| Demo repay reverts on the fork | USDC not seeded | `./scripts/fund-demo-wallet.sh` |
| `lax alert --test` fails | wrong webhook URL or network down | recreate the channel webhook; alerts never block mitigations |
| `lax watch` prints once and exits | piped (non-interactive) run | expected — scripts get one sample; run it in a terminal for live updates |

---

## 15. Command index

| Command | Syntax | Confirm | Category |
|---|---|---|---|
| status | `lax status` | — | monitor |
| hf | `lax hf` | — | monitor |
| watch | `lax watch [--interval SEC]` | — | monitor |
| position | `lax position` | — | monitor |
| debt / collateral | `lax debt [token]` | — | monitor |
| oracle | `lax oracle [token]` | — | monitor |
| ltv / liquidation-price | `lax ltv` | — | monitor |
| whatif | `lax whatif [--shock PCT] [--lt LT] [--json]` | — | monitor |
| demo | `lax demo [--shock PCT] [--yes] [--webhook]` | — | monitor |
| block / reserves / pool / config / whoami | `lax block` | — | monitor |
| keeper | `lax keeper` | — | monitor |
| arm / disarm | `lax arm` | — | guardian |
| guardian on/off/status | `lax guardian off` | — | guardian |
| threshold / target | `lax threshold 1.04` | — | guardian |
| engage / trigger | `lax engage` | — | guardian |
| autopilot (scan) | `lax autopilot` | — | guardian |
| cooldown / schedule | `lax cooldown 15` | — | guardian |
| shock | `lax shock weth -30%` | ✔ | mock |
| flash-crash / crash | `lax crash weth -40%` | ✔ | mock |
| drip | `lax drip weth -2% 5` | — | mock |
| panic | `lax panic` | ✔ | mock |
| simulate-hf | `lax simulate-hf 1.03` | ✔ | mock |
| recovery | `lax recovery weth +5%` | — | mock |
| reset-price | `lax reset-price` | — | mock |
| freeze/unfreeze-oracle | `lax freeze-oracle` | — | mock |
| mock-start / mock-stop | `lax mock-start` | — | mock |
| repay / paydown | `lax repay 5 --local` | ✔ | onchain |
| approve | `lax approve usdc 10` | ✔ | onchain |
| supply / withdraw | `lax supply usdc 5` | ✔ | onchain |
| boost / rebalance | `lax boost 100` | ✔ | onchain |
| swap | `lax swap weth 1 usdc` | ✔ | onchain (reserved) |
| runs | `lax runs [--limit N] [--json]` | — | audit |
| explain | `lax explain <id \| index>` | — | audit |
| run | `lax run <id>` | — | audit |
| audit / history / tail | `lax audit` | — | audit |
| snapshot / snapshots / compare | `lax snapshot before` | — | audit |
| tx | `lax tx 0x…` | — | audit |
| export | `lax export` | — | audit |
| alert | `lax alert [--test]` | — | system |
| daemon modes | `lax autopilot daemon [--dry-run] [--once]` | — | autopilot |
| help / man / aliases | `lax help repay` | — | system |
| clear / reset / connect / ping / version / uptime / guide | `lax clear` | — | system |

---

*Commands marked "Confirm" require a `y` reply or `--confirm`. The embedded
terminal in the dashboard (`http://localhost:5173`) supports the same command
core with identical semantics. Full setup walkthrough: [`SETUP.md`](SETUP.md) ·
architecture details: [`architecture.md`](architecture.md).*
