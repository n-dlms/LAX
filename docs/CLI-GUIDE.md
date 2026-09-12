# The LAX CLI — Complete User Guide

Everything you can do with `lax`, how to do it, and what you'll see.

LAX is a proactive Aave V3 liquidation defender. MEV bots can liquidate positions in the same block as an oracle update — no reactive script can outrace them. LAX doesn't try. It watches your health factor continuously and acts **at HF 1.05, above the 1.0 liquidation threshold**, repaying exactly enough debt to restore the position to HF 1.10 before the bots ever see an opportunity. Every execution is deterministic — performed by a KeeperHub workflow — with an audit trail behind every run.

The CLI is one binary with two homes: your terminal (`npm run lax`) and the dashboard's embedded terminal (`http://localhost:5173`). Both run the exact same command core.

---

## Table of Contents

1. [Getting started](#1-getting-started)
2. [Three ways to run it](#2-three-ways-to-run-it)
3. [Safety model — what happens before anything moves](#3-safety-model)
4. [Command reference](#4-command-reference)
   - Monitor & Read
   - Guardian / Autopilot
   - Mock & Stress (fork simulation)
   - Onchain Actions
   - Audit & Observability
   - System
5. [The autopilot daemon](#5-the-autopilot-daemon)
6. [Configuration](#6-configuration)
7. [Scripting, exit codes, and automation](#7-scripting-exit-codes-and-automation)
8. [Troubleshooting](#8-troubleshooting)
9. [Command index](#9-command-index)

---

## 1. Getting started

Prerequisites: Node ≥ 18. For the local fork demo you also need
[Foundry](https://book.getfoundry.sh/) (`anvil`/`cast`) — the CLI itself no longer
requires it at runtime.

```bash
# one-time: install dependencies and configure keys
npm install
cp .env.example .env        # fill in KEEPERHUB_API_KEY (+ KEEPERHUB_WEBHOOK_KEY for live fires)

# bring the demo environment up (fork, seeded position, funded wallet)
./scripts/demo-up.sh

# run the CLI
npm run lax
```

`.env` is loaded automatically — you never need to export keys by hand.
Everything persists in `~/.lax/`:

| File | Contents |
|---|---|
| `state.json` | guardian arm/blocked state, last-fired cooldowns |
| `safety.json` | rolling 24 h spend ledger (survives restarts) |
| `mitigations.jsonl` | append-only log of every trigger, gate decision, and fire |

---

## 2. Three ways to run it

**Interactive REPL** — best for exploring and demos:

```console
$ npm run lax
  ██╗      █████╗ ██╗  ██╗
  ...
  type help for commands · guide for the demo walkthrough · exit to quit
lax ❯ status
```

Type commands without the `lax` prefix (`status`, `hf 5`); ↑↓ walks command
history, Tab autocompletes, `exit` quits.

**One-shot** — best for scripts and quick checks. Each invocation prints a
framed result and exits (exit code 1 on failure):

```console
$ npm run lax -- status
```

**Piped scripting** — the REPL reads stdin, so full sequences run unattended
(in order, same behavior as typing):

```console
$ printf 'arm\nshock weth -25%% --confirm\nstatus\nexit\n' | npm run lax
```

> In one-shot mode, prefix commands with `--` after `run`: `npm run lax -- hf`.
> Flags like `--confirm` belong to the command itself.

---

## 3. Safety model

Nothing moves funds without passing every layer below, in order:

| Layer | What it checks | Where it lives |
|---|---|---|
| **Confirmation** | Interactive commands (`repay`, `approve`, `supply`, `withdraw`, `crash`, `panic`, …) require a bare `y` reply or a `--confirm` flag | the CLI |
| **Mitigation gate** | ① HF math: does the repay amount actually reach the target HF? ② Preflight: a real `eth_call` simulation of approve + repay against the chain — a revert blocks the fire ③ Safety bounds: amount sanity, block threshold ④ Spend caps: per-block and rolling 24 h caps | `src/autopilot/gate.ts` |
| **Spend persistence** | The 24 h ledger lives in `~/.lax/safety.json`. Restarting the daemon does **not** reset it. Dry-runs check the caps but don't consume budget | `~/.lax/safety.json` |
| **Arm gating** | The daemon only auto-fires when the guardian is **armed** (`lax arm`). Disarmed, it reports the risk and holds. | the daemon |

A blocked fire is a *successful* safety outcome: the gate prints each stage's
verdict and nothing touches the chain.

Default caps are deliberately small (they protect a demo wallet: $10 block / $5 daily).
The fork demo repays ~$32, so size them to your positions with `LAX_BLOCK_THRESHOLD_USD`
and `LAX_DAILY_LIMIT_USD` environment variables — e.g. `LAX_BLOCK_THRESHOLD_USD=50
LAX_DAILY_LIMIT_USD=100` for the seeded fork demo.

---

## 4. Command reference

Output is framed in a panel whose border color reflects your position:
**cyan** (healthy), **yellow** (HF ≤ 1.05 — trigger zone), **red** (HF ≤ 1.0 —
liquidatable), red on errors.

### Monitor & Read

Safe, read-only commands. All read live chain state through the configured RPC.

#### `lax status`
Full snapshot — health factor (with a gauge showing where you sit between
0.8 and 2.0, marked at liquidation 1.00 and trigger 1.05), collateral, debt,
block, guardian state.

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

#### `lax hf`
Just the number, with the gauge. The fastest thing to put on screen in a demo.

#### `lax position` · `lax debt [token]` · `lax collateral [token]`
Position breakdowns (collateral, debt, net, block).

#### `lax oracle [token]`
Reads the Aave price oracle for WETH/USDC through the pool's addresses provider.

#### `lax ltv` · `lax liquidation-price`
Derived risk metrics: current LTV and the approximate collateral price at which
you become liquidatable.

#### `lax block` · `lax reserves` · `lax pool` · `lax config` · `lax whoami`
Chain head, reserve listing, pool/provider addresses, the LAX configuration
parameters, and the resolved borrower/wallet.

#### `lax keeper`
KeeperHub connectivity: whether an API key is configured and which workflow is
bound.

### Guardian / Autopilot

#### `lax arm` / `lax disarm`
Arm/disarm the guardian. **Armed is required for auto-triggers** — disarmed,
the daemon reports low HF but holds. Persisted across restarts.

#### `lax guardian on|off|status`
Aliases of arm/disarm plus an explicit status readout.

#### `lax threshold <1.0–2.0>` · `lax target <1.05–3.0>`
Set your trigger and target health factors. Validation enforces
`1.0 < threshold < target`.

#### `lax engage` (alias: `lax trigger`)
Manual trigger — runs the full mitigation pipeline **now**: computes the exact
repay needed to reach the target HF (+1 % buffer), passes the mitigation gate,
fires the KeeperHub workflow, and prints the audit-trail link. Blocked safely
if the gate rejects.

#### `lax autopilot`
One scan: reads HF, decides, prints its decision (`hold` / `trigger`). The
daemon (§5) is this in a loop.

#### `lax cooldown <minutes>`
Set the minimum spacing between auto re-triggers.

### Mock & Stress — fork simulation

These manipulate the fork's mock oracle to create (and then recover from)
liquidation-risk scenarios. They are demo/simulation tools, disabled outside a
local RPC. All except `freeze` require `--confirm`.

#### `lax shock <token> <-30%>`
Instant single-step price change. The bread and butter of the demo:

```console
$ lax shock weth -25% --confirm
Price shock: weth -25%
New price: $2475.00
Tx: 0xeb621c…b28b34
HF: 1.0265
```

#### `lax flash-crash <token> <-70%>` (alias `crash`)
Five rapid steps down — simulates a cascading collapse rather than a jump.

#### `lax drip <token> <-2%> [ticks]`
Slow bleed, N ticks — for watching the gauge transition green → yellow → red.

#### `lax panic`
`flash-crash -90%`. The emergency button.

#### `lax simulate-hf <target>`
Sets the oracle price to land your HF exactly on the target — useful to demo
the trigger zone deterministically (`lax simulate-hf 1.03`).

#### `lax recovery <token> <+5%>` · `lax reset-price`
Push the price back up / restore the seeded prices (WETH $3,300, USDC $1.00).

#### `lax freeze-oracle` / `lax unfreeze-oracle` · `lax mock-start` / `lax mock-stop`
Freeze prices at current values; simulation-mode toggle that restores prices on
stop.

### Onchain Actions

Real transactions. `--local` executes directly against the **local Anvil fork only**
(the borrower is Anvil dev account #0, unlocked by default — `eth_sendTransaction`
needs no key there; it fails on any public RPC). Without the flag, the action is
routed through your KeeperHub workflow. All require `--confirm`.

#### `lax repay <amount> [--local]` (alias `paydown`)
Approve (if needed) + repay that much USDC debt.

#### `lax approve <token> <amount> [--local]`
ERC-20 approval to the Aave pool.

#### `lax supply <token> <amount> [--local]` · `lax withdraw <token> <amount> [--local]`
Supply collateral to / withdraw from the pool.

#### `lax boost <amount>` · `lax rebalance`
Improve HF by supplying more collateral / withdraw excess and repay.

#### `lax swap <from> <amount> <to>`
Reserved — requires a DEX integration, prints a clear not-implemented notice.

### Audit & Observability

#### `lax runs [--limit N]` · `lax run <id>`
Recent KeeperHub executions with IDs; details for one execution.

```console
$ lax runs
Executions:
──────────────────────────────────────────────────────────────
9bc31ofdfca1m62b2v  autopilot-mitigate  21:05:24  triggered
```

#### `lax audit` · `lax history [--limit N]` · `lax tail [--lines N]`
Session summary, per-command history with durations, recent events.

#### `lax snapshot [label]` · `lax snapshots` · `lax compare <id>`
Capture the position (HF, collateral, debt, oracle prices, block) and diff a
later state against it — before/after proof for a mitigation.

#### `lax tx <hash>`
Receipt lookup: block, status, gas, explorer link.

#### `lax export`
Machine-readable JSON of the whole session (state, history, executions,
snapshots) — pipe it to a file for reports.

### System

`help [command]`, `man <command>`, `aliases`, `version`, `uptime`, `ping`,
`connect`, `rpc <url>`, `echo`, `debug on|off`, `theme dark|light|matrix`,
`clear`, `reset`, `guide`, `tutorial`.

---

## 5. The autopilot daemon

`lax autopilot` is the product: the scan loop with teeth.

```console
$ lax autopilot daemon                          # live: monitors and fires
$ lax autopilot daemon --dry-run                # full pipeline, never fires
$ lax autopilot once --dry-run                  # single scan, CI-friendly
```

What one trigger looks like (annotated):

```text
⚡ 21:05:24 TRIGGER [main] HF 1.0265 ≤ 1.05 — repay 32.40 USDC → target 1.1
· 21:05:24 [main] ✔ HF Math Verification: Passed (0ms)      ← does the math reach target?
· 21:05:24 [main] ✔ Pre-flight Simulation: Passed (229ms)   ← approve+repay simulate clean
· 21:05:24 [main] ✔ Safety Bounds Check: Passed (0ms)       ← sanity + block threshold
· 21:05:24 [main] ✔ spend-caps: Repays $32.40 within caps   ← 24 h ledger check
🗲 21:05:25 fired → execution kh_9bc31ofdfca1m62b2v29t
     audit trail: https://app.keeperhub.com/runs/kh_9bc31ofdfca1m62b2v29t
```

Flags:

| Flag | Meaning |
|---|---|
| `daemon` / `start` | continuous loop (default interval 2 s) |
| `--dry-run` | run everything, never fire |
| `once` | one pass and exit (exit code reflects the decision) |
| `--interval <seconds>` | poll interval |
| `--cooldown <seconds>` | minimum spacing between fires, per position |
| `--only <name>` | monitor a single named position from `lax.config.json` |

Behavioral details worth knowing:

- **Hysteresis**: after a fire, that position cools down (default 5 min) — a
  sustained crash cannot spam webhooks.
- **Blocked ≠ broken**: a gate rejection logs `GATE BLOCKED — nothing was
  fired` and keeps polling. That is the safety system working.
- **SIGINT-safe**: Ctrl+C finishes the in-flight poll, writes the shutdown
  record, exits.
- **Multi-network**: each position in `lax.config.json` carries its own RPC,
  pool, token, and KeeperHub workflow — one loop defends positions on
  different chains simultaneously.

---

## 6. Configuration

### `lax.config.json` — positions and networks

```json
{
  "networks": {
    "base-fork":    { "rpc": "http://127.0.0.1:18545",   "aavePool": "0xA238…", "usdc": "0x8335…", "workflowId": "7gdt…" },
    "base-sepolia": { "rpc": "https://sepolia.base.org", "aavePool": "0x8bAB…", "usdc": "0xba50…", "workflowId": "l4pb…" }
  },
  "positions": [
    { "name": "main",    "borrower": "0xf39F…", "network": "base-fork" },
    { "name": "sepolia", "borrower": "0x2683…", "network": "base-sepolia", "threshold": 1.2, "target": 1.5 }
  ]
}
```

Any Aave V3 network works — a network is (RPC, pool, USDC, workflow). Per
position you can override `threshold` and `target`. See
`lax.config.example.json` for a working two-network setup.

### Wallet resolution

LAX works with **any Turnkey agentic wallet**. The executing wallet resolves as
`LAX_WALLET_ADDRESS` → `~/.keeperhub/wallet.json` (`walletAddress`) → bundled
config. The defended position defaults to the configured demo borrower; set
`LAX_SELF_DEFENSE=true` to have the wallet protect **its own** position, or
`LAX_BORROWER_ADDRESS=0x…` to defend any address.

### `.env` keys

| Key | Used for |
|---|---|
| `KEEPERHUB_API_KEY` (`kh_*`) | org API: workflow management, `/api/execute/*`, MCP |
| `KEEPERHUB_WEBHOOK_KEY` (`wfb_*`) | webhook fires — the daemon/engage path prefers it automatically |
| `LAX_WORKFLOW_ID` / `LAX_WORKFLOW_ID_SEPOLIA` | workflow binding (per network in config works too) |
| `LAX_BORROWER_ADDRESS`, `LAX_WALLET_ADDRESS`, `LAX_SELF_DEFENSE` | who is defended / who executes |
| `LAX_BLOCK_THRESHOLD_USD`, `LAX_DAILY_LIMIT_USD` | spend caps |
| `LAX_FORK_RPC`, `LAX_ENV_FILE`, `LAX_STATE_DIR`, `LAX_CONFIG_PATH` | endpoints and file locations |

---

## 7. Scripting, exit codes, and automation

- Exit code **0** on success (including needs-confirmation and healthy
  scans), **1** on any error or failed command — safe to chain in CI.
- Piped input is processed strictly in order:

```bash
printf 'arm\nshock weth -25%% --confirm\nstatus\nexit\n' | npm run lax
```

- Dry-run in CI — the exit code reflects the gate verdict:

```bash
lax autopilot once --dry-run || echo "gate would block this fire"
```

- Every autonomous action leaves evidence:

```bash
tail -f ~/.lax/mitigations.jsonl     # triggers, gate verdicts, fires
lax runs --limit 5                   # KeeperHub execution IDs + permalinks
```

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Mode: offline` / `position read failed` | RPC unreachable | `./scripts/demo-up.sh` (boots the fork) |
| Gate blocks with `BLOCK_THRESHOLD_EXCEEDED` | repay > block cap | size caps: `LAX_BLOCK_THRESHOLD_USD=50 LAX_DAILY_LIMIT_USD=100` |
| Gate blocks with `DAILY_CAP_EXCEEDED` | 24 h ledger full | intentional — reset with `rm ~/.lax/safety.json` |
| Preflight: `transfer amount exceeds allowance` | executing wallet not funded on the fork | `./scripts/fund-demo-wallet.sh` |
| `KEEPERHUB_API_KEY not set` | `.env` missing keys | copy from `.env.example`, re-run |
| `wrong_key_type` on a fire | org key used for webhook | add `KEEPERHUB_WEBHOOK_KEY` (`wfb_*`) to `.env` |
| Stale HF right after a fork tx | 1 s block time | CLI waits for inclusion on price writes; other reads retry |
| HF 1.10 forever on Sepolia | healthy position, no risk | expected — lower `threshold` in config to exercise the trigger |
| Guardian disarmed warning | daemon won't auto-fire | `lax arm` |

---

## 9. Command index

| Command | Syntax | Confirm | Category |
|---|---|---|---|
| status | `lax status` | — | monitor |
| hf | `lax hf` | — | monitor |
| position | `lax position` | — | monitor |
| debt / collateral | `lax debt [token]` | — | monitor |
| oracle | `lax oracle [token]` | — | monitor |
| ltv / liquidation-price | `lax ltv` | — | monitor |
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
| runs / run | `lax runs --limit 5` | — | audit |
| audit / history / tail | `lax audit` | — | audit |
| snapshot / snapshots / compare | `lax snapshot before` | — | audit |
| tx | `lax tx 0x…` | — | audit |
| export | `lax export` | — | audit |
| daemon modes | `lax autopilot daemon [--dry-run] [once]` | — | autopilot |
| help / man / aliases | `lax help repay` | — | system |
| clear / reset / connect / ping / version / uptime / guide | `lax clear` | — | system |

---

*Commands marked "Confirm" require a `y` reply or `--confirm`. The embedded
terminal in the dashboard (`http://localhost:5173`) supports all of the above
with the same semantics.*
