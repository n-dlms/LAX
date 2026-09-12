# LAX CLI — Complete Command Reference

Every command LAX understands, explained in depth: what it does, **why it
exists**, what you'll see, and what to watch out for. If you're new to DeFi
terms (HF, WETH, collateral…), read [`GLOSSARY.md`](GLOSSARY.md) first — this
document assumes those basics.

Companion documents: [`CLI-GUIDE.md`](CLI-GUIDE.md) (the tour, safety model,
daemon, configuration) · [`ALERTS.md`](ALERTS.md) (optional notifications).

> **Conventions** — `$` is your shell, `lax>` is the interactive terminal
> (`npm run lax`). Bracketed parts are optional. **Confirm** means the command
> asks for `y` or accepts `--confirm` up front. Aliases are alternate names for
> the same command.

---

## Contents

1. [Seeing your position](#1-seeing-your-position)
2. [Analyzing risk before it happens](#2-analyzing-risk-before-it-happens)
3. [Guarding — controlling the autopilot](#3-guarding--controlling-the-autopilot)
4. [Simulating market disasters](#4-simulating-market-disasters)
5. [Executing — commands that move funds](#5-executing--commands-that-move-funds)
6. [Evidence — proving what happened](#6-evidence--proving-what-happened)
7. [Live views and demos](#7-live-views-and-demos)
8. [Sessions, connections, and housekeeping](#8-sessions-connections-and-housekeeping)
9. [The autopilot daemon (background mode)](#9-the-autopilot-daemon-background-mode)

---

## 1. Seeing your position

These commands are **read-only** — they can never move funds. They all read
live chain state through the RPC (the local fork, or any Aave V3 network in
your config). Use them to answer "where do I stand right now?"

---

### `lax status` — the one-screen answer
*Aliases: `st`*

The command you'll use most. One call gives you the health factor with its
gauge, collateral, debt, current block, and whether the guardian is armed:

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

**How to read the gauge:** the `▮` marker is you. Red cells are the
liquidation zone (HF below 1.00), yellow is where LAX acts (1.00–1.05), green
is safety. The marker sits *inside* a colored band — if your marker is in
yellow, LAX is about to act; in red, you're liquidatable *right now*.

**Why it exists:** one command that answers "am I safe, and is my guardian
awake?" If you only learn one command, learn this one.

---

### `lax hf` — just the number
*Aliases: `health`, `health-factor`*

Prints only the health factor and gauge. Fastest thing to put on screen during
a demo, and the cleanest output to script against.

**Why it exists:** status is rich; sometimes you want one glanceable number —
e.g. watching it fall during `lax crash`.

---

### `lax position` — the full breakdown
*Aliases: `pos`, `portfolio`*

Collateral, debt, net position, and the block it was read at. This is the
same `getUserAccountData` call Aave itself uses — the data is authoritative,
not an estimate.

**Why it exists:** `status` summarizes; `position` itemizes. Use it when
numbers look odd and you want the raw sides of the balance sheet.

---

### `lax debt [token]` — what you owe
Details of your borrowing: total debt and, with a token argument, the
per-asset breakdown. LAX's defense repays **USDC** debt, so `lax debt` shows
exactly what a mitigation will attack.

**Why it exists:** the repay formula is `debt × (1 − HF/target)` — this shows
the `debt` input, so you can sanity-check any repay amount LAX computes.

---

### `lax collateral [token]` — what you pledged
*Alias: `coll`*

What you've supplied to Aave and its current value. Collateral value is the
numerator of your HF — when this number falls (a price crash), everything else
follows.

---

### `lax oracle [token]` — the price feed
Reads the price oracle that Aave's Pool actually consults (resolved live
through the pool's addresses provider). Default token is WETH.

**Why it exists:** your HF only changes when the oracle changes. During
simulation commands (`shock`, `crash`), this shows the *cause* while `lax hf`
shows the *effect*. If oracle and HF ever disagree, this tells you which one
is lying.

---

### `lax ltv` — loan-to-value
Plain LTV: `debt / collateral` as a percentage. Different from HF (no
liquidation-threshold weighting) but the number most lending apps display, so
it's useful when cross-checking against the Aave UI.

---

### `lax liquidation-price` — how close the cliff is
*Aliases: `liq-price`, `liqprice`*

Computes the collateral price at which your HF would hit exactly 1.0 — the
price where bots can liquidate you.

**Why it exists:** it converts an abstract ratio into a concrete sentence:
*"at WETH $2,450, I'm liquidatable."* Pair it mentally with `lax whatif`,
which answers "what happens if the price drops X%?"

---

### `lax block` — where the chain head is
Current block number and timestamp. Mostly diagnostic: if the block number
isn't advancing, your RPC is stalled (see `lax ping`, `lax reconnect`).

---

### `lax reserves` — the Aave market
Lists the pool's reserves with their status (active/frozen) and configuration.
Context for power users: a *frozen* reserve can't be borrowed against — useful
to know when debugging why a repay or supply misbehaves.

---

### `lax pool` — the contract addresses
The Aave V3 Pool and addresses-provider this CLI is bound to, plus key config.
Compare it against `lax.config.json` when wiring up a new network.

---

### `lax config` — LAX's own settings
The parameters LAX enforces: trigger threshold, target HF, spend caps, fork
RPC, workflow binding. This is the effective configuration *after* env vars
and `lax.config.json` — when in doubt about why LAX behaved a certain way,
start here.

---

### `lax whoami` — which wallet am I
Shows the resolved **borrower** (the position being defended) and its
resolution source: CLI argument, `LAX_BORROWER_ADDRESS`, self-defense mode
(`LAX_SELF_DEFENSE=true` — the wallet defends its own position), or config
default.

**Why it exists:** "which position am I actually looking at?" is the #1 source
of confusion when switching between the fork demo and a live wallet. This
command answers it in one line.

---

### `lax keeper` — is KeeperHub reachable
Whether an API key is configured and which workflow is bound. If `lax engage`
or the daemon can't fire, this is the first diagnostic: no key here means no
execution path.

---

## 2. Analyzing risk before it happens

### `lax whatif` — the crash simulator for *your* real position
```text
lax whatif [--shock PCT] [--lt LT] [--json]
```

Asks the question every borrower cares about: **if collateral drops P% right
now, what happens to me?** It scales your live position, recomputes HF, and
prices the defense *today* versus *after the crash*:

```console
$ lax whatif --shock 25
  HF now:       1.0978  ░░░  caution — close to the trigger
  HF shocked:   0.8234  ░░░  LIQUIDATABLE — bots can close the position

Defense cost — restore HF to 1.1:
  REPAY debt:   $0.95 today → $120.72 after the shock  (defending early saves $119.76)
  SUPPLY col.:  $161.25 at LT 0.8
  Comparator:   recommends REPAY
```

**How to read it:**
- `REPAY` — pay down debt with USDC. The "defending early saves" line is the
  whole LAX thesis in one number: the same safety costs far less *before* the
  crash (see GLOSSARY §4 for the arithmetic).
- `SUPPLY` — the alternative: deposit more collateral instead. Its cost uses
  an assumed liquidation threshold (`--lt`, default 0.8 — WETH-grade on Base),
  because the chain's position summary doesn't expose per-asset thresholds.
- `--json` — machine-readable version for scripts and dashboards.

**Why it exists:** conviction. Nothing explains proactive defense better than
watching the same repair triple in price on the other side of a crash.

---

## 3. Guarding — controlling the autopilot

These commands control *when LAX is allowed to act on its own*. The guardian
is off by default — nothing auto-fires until you explicitly arm it, and arm
state **persists across restarts** (stored in `~/.lax/state.json`).

---

### `lax arm` / `lax disarm`
The master switch for autonomous defense. Armed, the daemon will fire (through
the full gate) whenever a position crosses its threshold. Disarmed, it will
*watch and log* but never fire.

**Why two commands for on/off?** Intent clarity: `arm` is a deliberate,
memorable act — like arming a security system. The dashboard shows the same
state; the daemon refuses to auto-fire when disarmed and says so.

---

### `lax guardian on|off|status`
*Aliases: `guard-on`, `guard-off`, `guard-status`*

The same switch as arm/disarm with explicit words. `guardian status` shows
armed state, threshold, and target in one line. `guardian off` requires
**Confirm** — turning protection *off* is the dangerous direction.

---

### `lax threshold <value>` — where LAX acts
*Alias: `thresh`*

Set the trigger HF (e.g. `lax threshold 1.04`). Constraints: must be **above
1.0** (below that, you're already liquidatable — nothing to defend) and below
the target. Persisted per guardian state.

**Choosing a value:** higher (1.08) = acts earlier, costs slightly more per
repair, tolerates sharper crashes; lower (1.03) = cheaper repairs but less
headroom. 1.05 is the tested default.

---

### `lax target <value>` — where LAX restores you
The HF a mitigation repairs *to* (default 1.10). The repay formula aims exactly
here: `repay = debt × (1 − HF/target)`. Setting it higher (1.15) buys more
distance from the cliff at the cost of more repaid debt.

---

### `lax engage` — fire the defense *now*
*Alias: `trigger` · **Confirm***

Manually trigger a full mitigation through the KeeperHub workflow — gate and
all. Use it when you don't want to wait for HF to cross the threshold, or to
exercise the whole path deliberately.

**Why it exists:** the autopilot is for emergencies; `engage` is for *I want
that debt reduced now*. It never bypasses the gate — if the preflight
simulation would revert, engage is blocked like anything else.

---

### `lax autopilot` — one manual scan
*Alias: `auto`*

Runs a single poll pass over every configured position: reads each HF, applies
trigger logic, and reports what it *would* do. Add `demo` (`lax autopilot
demo`) for a narrated version. This is the daemon's inner loop, run once, in
the foreground — perfect for verifying configuration before leaving the daemon
in charge.

---

### `lax cooldown <minutes>` — re-fire pacing
Minimum time between fires for the same position (the daemon's default is 5
minutes; this command sets the session value). Prevents rapid re-triggering
while a position hovers at the threshold — each fire needs the previous repair
to be visible on-chain first.

---

### `lax schedule <seconds>` — a timed check
Schedules a protection check N seconds from now. Handy mid-demo ("in 30
seconds it'll scan again") or as a poor-man's cron for a single planned scan.

---

## 4. Simulating market disasters

These commands manipulate the **fork's** oracle to create repeatable
scenarios. They are how you *exercise* the defense without waiting for a real
crash — and the reason the fork demo is deterministic. Most require
**Confirm** because they deliberately damage the simulated position.

> These are fork-only by nature: they write to the local chain's oracle. On a
> public network, prices come from real markets and these commands have
> nothing to push.

---

### `lax shock <token> <percent>` — instant move **Confirm**
```console
$ lax shock weth -25%
```
Drops (or raises, with a positive number) the oracle price immediately. The
classic move: shock, watch `lax hf` fall, watch the defense respond. The
dashboard's "Trigger Price Shock" button does the same thing.

---

### `lax crash weth <percent>` — a *realistic* crash **Confirm**
*Alias: `crash`*

Multi-step price collapse spread over ~3 seconds — closer to how real crashes
unfold than a single instant step, and it produces a satisfying falling
sparkline in `lax watch`.

---

### `lax drip <token> <percent> [ticks]` — the slow bleed
A small move repeated every N blocks (default `lax drip weth -2% 10`).
Models the *other* failure mode: not a crash, but a grinding decline that
erodes HF until the trigger trips. Good for watching the cooldown and
re-fire logic work.

---

### `lax panic` — everything at once **Confirm**
An instant −90% WETH crash. The name is honest: this is the "wow moment"
scenario that drives HF straight through the liquidation line. After a panic,
only a fast mitigation (or `lax reset-price`) saves the demo position.

---

### `lax recovery <token> <percent>` — prices heal
Gradual price recovery — the counterpart to `drip`. Useful for showing the
*end* of a story: crash → rescue → recovery → position healthier than ever.

---

### `lax reset-price` — undo the damage
Restores oracle prices to their defaults. The "let's go again" button between
scenario runs. Note: it resets prices, not debt already repaid — full scenario
reset is `./scripts/demo-up.sh`.

---

### `lax freeze-oracle` / `lax unfreeze-oracle`
*Aliases: `freeze` / `unfreeze`*

Pins the oracle at its current price (or releases it). Freezing gives you a
stable position to configure thresholds against, without the mock engine
moving prices underneath you.

---

### `lax simulate-hf <target>` — force an exact HF **Confirm**
*Alias: `sim-hf`*

Reverse-solves the oracle price needed to put your position at an exact HF
(e.g. `lax simulate-hf 1.05`) and sets it. **Why it exists:** testing the
trigger *boundary* precisely — instead of guessing a price drop that lands
near 1.05, you land exactly on it.

---

### `lax mock-start` / `lax mock-stop` — the simulation sandbox
*Aliases: `mock-on` / `mock-off`*

Enters/exits simulation mode (an overlay indicator makes it obvious which mode
you're in). In mock mode, scenario commands and `simulate-hf` operate against
a controlled overlay; `mock-stop` restores real oracle prices. Use it when you
want to experiment freely and guarantee a clean exit.

---

### `lax scenario <name>` — curated disasters **Confirm**
Prepackaged storylines:

| Name | What happens |
|------|--------------|
| `flash-crash-2022` | WETH −70% — modeled on a real historical crash |
| `slow-bleed` | −2% every 10 ticks — the grinding decline |

**Why it exists:** one word, reproducible disaster — no typing percentages
mid-demo.

---

## 5. Executing — commands that move funds

Every command in this section requires **Confirm** and passes the **mitigation
gate** (math verification → preflight simulation → safety bounds → spend caps)
before anything touches the chain. A block is the safety system working; see
CLI-GUIDE §7.

Two execution routes exist:

- **`--local`** — executes directly on the local fork with its unlocked dev
  account: deterministic, instant, no KeeperHub involved. Fork-only by design;
  it fails on any public RPC.
- **default (no flag)** — routes through your **KeeperHub workflow**: the
  agentic wallet signs, execution is MEV-protected, and a full audit trail
  is listed on the workflow's runs page at `app.keeperhub.com/workflows/<workflow-id>` (the platform has no per-execution UI route — the execution ID is the searchable identifier). This is the production path.

---

### `lax repay <amount> [--local]` — pay down debt
*Alias: `paydown`*

Repays the given amount of USDC debt — the core operation of every mitigation.
`lax repay 5` pays $5 of USDC. The autopilot computes this amount itself from
the closed-form formula; this command lets you specify it manually.

**Typical use:** nudging HF up deliberately, or demonstrating the repay path
with a known amount.

---

### `lax approve <token> <amount> [--local]`
Grants the Aave Pool permission to spend your token — the ERC-20 `approve`
that must precede any repay. Normally invisible (the workflow approves and
repays in one flow), but available standalone for debugging allowance issues.
Preflight failures mentioning *"allowance"* are this command's domain.

---

### `lax supply <token> <amount> [--local]`
Deposits a token into Aave as collateral. The building block of the SUPPLY
strategy that `lax whatif` prices as the alternative to repaying.

---

### `lax withdraw <token> <amount> [--local]`
Withdraws supplied collateral. The inverse of supply — and the operation that
*lowers* your HF, so use it knowingly.

---

### `lax boost <amount> [--local]`
Supplies additional collateral specifically to raise HF. Where `repay` attacks
the denominator of the HF ratio, `boost` strengthens the numerator. The
`whatif` comparator tells you which is cheaper for your situation.

---

### `lax rebalance [--local]`
Combined move: withdraw excess collateral and repay debt in one step —
improving capital efficiency while restoring HF. A tidy-up command for
positions that grew lopsided.

---

### `lax transfer <token> <amount> <address> [--local]`
Moves tokens from the agentic wallet to any address — plain wallet plumbing
(funding a position, returning funds). Gated and confirmed like everything
else in this section.

---

### `lax swap <from> <amount> <to> [--local]`
Token swap (WETH/USDC). Reserved for the workflow swap path — listed for
completeness; the liquidation-defense story doesn't need it today.

---

## 6. Evidence — proving what happened

LAX treats every action as something you may later need to *prove*. These
commands read two stores: the **persistent mitigation log**
(`~/.lax/mitigations.jsonl` — survives restarts, written by the daemon and
every fire path) and the **session** (this terminal visit only).

---

### `lax runs [--limit N] [--json]` — the permanent record
Every trigger, gate decision, fire, failure, and dry-run — newest last, with
health factors, repay amounts, KeeperHub permalinks, and per-stage verdicts:

```console
$ lax runs
Mitigation log — /home/you/.lax/mitigations.jsonl
────────────────────────────────────────────────────────────────────────
  09:40:22  ⛔ BLOCKED   HF 1.0265  repay 32.40 USDC  stages [hf-math:ok,preflight:FAIL,spend-caps:ok]
  10:02:13  ⚡ FIRED     HF 1.0431  repay 32.32 USDC  exec 9bc31ofdfca1m6…
                          https://app.keeperhub.com/workflows/l4pbmt6jdek9c3lwt0y3b · execution 9bc31ofdfca1m62b2v29t
```

Row icons: ▲ trigger · ⛔ gate-blocked · ⚡ fired · ✖ failed · ◌ dry-run ·
■ shutdown. `--json` dumps the full log machine-readable.

**Why it exists:** trust. When someone asks *"did it really do that?"*, this
is the answer — and it survives restarts because it's an append-only file.

---

### `lax explain <execution-id | runs-index>` — the "why"
Replays one decision **stage by stage** — what was checked, what passed or
failed, and the verdict:

```console
$ lax explain 1
  Gate stages:
    ✓ hf-math — Repay 32.32 USDC reaches target 1.10 within tolerance
    ✗ preflight — eth_call reverted: ERC-20 allowance insufficient
  Verdict: blocked at preflight — nothing touched the chain.
```

Accepts a 1-based index counting from the most recent `lax runs` entry, or a
full execution ID. **Why it exists:** a blocked fire *should* raise the
question "why?" — this command answers it line by line, and doubles as the
audit answer for judges and teammates.

---

### `lax run <id>` — one KeeperHub execution
Details of a single workflow execution (ID, command, time, status, tx hashes).
The session-scoped counterpart to `lax runs`.

---

### `lax tx <hash>` — on-chain receipt
*Alias: `transaction`*

Looks up any transaction by hash: block, success/failure, gas, and an explorer
link. Use it to confirm a repay actually landed — the ground truth beneath
every log entry.

---

### `lax snapshot [label]` · `lax snapshots` · `lax compare <id>`
*Aliases: `snap`, `snaps`, `diff`*

Capture the full position (HF, collateral, debt, oracle prices, block) at a
moment, then diff any later moment against it:

```console
lax> snapshot before
lax> ...crash, mitigation...
lax> compare snap-001
  HF:    1.0978 → 1.1009  (+0.0031)
```

**Why it exists:** before/after proof. One command pair turns "trust me, it
repaired the position" into numbers. Snapshots are session-scoped.

---

### `lax history [--limit N]` · `lax tail [--lines N]` · `lax audit`
*Alias: `hist`*

Your own session trail: every command you ran with duration and success
(`history`), the latest entries (`tail`), and a session summary (commands,
executions, entries — `audit`). For "what did I just do?" moments.

---

### `lax export` — everything, machine-readable
*Alias: `dump`*

JSON dump of the session: state, history, executions, snapshots. Pipe it to a
file for reports or CI artifacts:

```bash
npm run lax -- export > lax-session.json
```

---

## 7. Live views and demos

### `lax watch [--interval SEC]` — the live monitor
Redraws the HF gauge plus a **sparkline trend** every interval (default 2s),
with collateral, debt, and the persisted guardian state:

```console
HF 1.0484  LAX TRIGGER ZONE
   ██████████▮──────────────
   trend ▼ ███▆▄▂  (last 8 samples)
   collateral $639.84   debt $480.00   guardian ARMED
   Ctrl-C to stop
```

The sparkline makes the trend *visible* — falling bars mean falling HF.
`Ctrl-C` stops cleanly. In piped (non-interactive) runs it prints one sample
and exits, so scripts never hang (use `--once` to be explicit).

**Why it exists:** `status` is a photograph; `watch` is a video. During a
crash scenario it's the most compelling screen in the repo.

---

### `lax demo [--shock PCT] [--yes] [--webhook]` — the whole story, one command
A self-running, narrated demonstration against the fork:

1. Shows the healthy position — and **auto-heals the scenario** if a previous
   run left it crashed (raises the price back until HF is safe again)
2. Crashes the WETH oracle (default −25%)
3. Watches HF fall, live
4. Runs the **full mitigation gate**, printing each stage's verdict
5. Default: dry-run (nothing moves). `--yes`: executes the exact approve →
   repay on the fork. `--webhook`: additionally fires the KeeperHub workflow
   for the audit trail
6. Verifies HF restored, prints a summary box with evidence pointers

**Why it exists:** the fastest possible answer to "what does LAX do?" — one
command, sixty seconds, complete story. Verified live end-to-end; see
VERIFIED-TESTING §5b.

---

### `lax alert [--test]` — operator notifications
Status and test send for the optional Discord/Slack webhook alerts. Full setup,
security notes, and troubleshooting: [`ALERTS.md`](ALERTS.md). Alerts are
best-effort — they can inform a mitigation but never block one.

---

## 8. Sessions, connections, and housekeeping

### Help and discovery

| Command | What it does |
|---------|--------------|
| `lax help [command]` (alias `?`) | List everything, or detailed help for one command |
| `lax man <command>` | The full manual page: usage, arguments, examples |
| `lax aliases` (alias `alias`) | Every alias → command mapping |
| `lax guide` (aliases `tutorial`, `walkthrough`) | The in-terminal fast tour — the demo path in a few lines |

**Habit worth building:** `lax man <anything>` before using an unfamiliar
command for the first time. Every command in this document has a man page.

### Session control

| Command | What it does |
|---------|--------------|
| `lax clear` (alias `cls`) | Wipe the screen (scrollback too, in the dashboard) |
| `lax reset` **Confirm** | Fresh session: clears logs, history, position cache |
| `lax echo <text…>` | Print text — for annotating scripted demos |
| `lax theme <name>` | Color theme: `dark`, `light`, `matrix` |
| `lax version` (aliases `v`, `--version`) | Version |
| `lax uptime` | Time since this session started |
| `lax debug on\|off` | Verbose mode: raw RPC payloads and internal decisions — turn it on before reporting a bug |

### Connectivity

| Command | What it does |
|---------|--------------|
| `lax connect` | Test the RPC connection and report what's reachable |
| `lax ping` | Latency check — a high number explains "slow" everything |
| `lax reconnect` | Drop and re-establish the RPC connection |
| `lax rpc <url>` | Point the CLI at a different RPC endpoint (e.g. a different fork port) |

**When things feel broken:** `lax ping` → `lax block` (is the head advancing?)
→ `lax reconnect`. That trio resolves 90% of connectivity weirdness; the rest
is usually "the fork isn't running" → `./scripts/demo-up.sh`.

---

## 9. The autopilot daemon (background mode)

Not a registry command but a long-running mode of the binary — the guardian
that never sleeps. It polls every configured position, applies thresholds and
cooldowns, and fires (when armed) through the full gate:

```bash
npm run lax -- autopilot daemon               # continuous defense
npm run lax -- autopilot daemon --dry-run     # full pipeline, never fires
npm run lax -- autopilot once                 # one poll pass, then exit
npm run lax -- autopilot daemon --only lax-fork --interval 1
```

| Flag | Meaning | Default |
|------|---------|---------|
| `daemon` (alias `start`) | Continuous monitor loop | — |
| `dry-run` / `--dry-run` | Everything except firing | — |
| `once` / `--once` | One pass, then exit | — |
| `--only <name>` | One named position from `lax.config.json` | all |
| `--interval <sec>` | Seconds between polls | 2 |
| `--cooldown <sec>` | Min seconds between fires per position | 300 |
| `--help` | Flag reference | — |

Every trigger prints the four gate stages live; every decision lands in the
persistent log (`lax runs`). `Ctrl-C` shuts down gracefully — current poll
finishes, a shutdown record is written, then it exits.

---

*Every command also has `lax man <command>` built in. Setup:
[`SETUP.md`](SETUP.md) · concepts: [`GLOSSARY.md`](GLOSSARY.md) ·
tour and safety model: [`CLI-GUIDE.md`](CLI-GUIDE.md).*
