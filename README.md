# LAX — Keep Your Position Safe

**LAX** is a proactive Aave V3 liquidation defender. MEV bots with Flashblocks can liquidate positions in the same block as the oracle update — no reactive agent can outrace them. LAX doesn't try. It monitors your health factor continuously and acts at HF = 1.05, *above* the 1.0 liquidation threshold, repaying exactly enough debt to restore the position to HF = 1.10 before the bots ever see an opportunity. Every action flows through KeeperHub MCP, signs via the Turnkey-custodied agentic wallet, and auto-retries gas sponsorship → wallet-pays fallback. `app.keeperhub.com/runs/<id>` shows the full audit trail.

| Field | Detail |
|-------|--------|
| **Hackathon** | KeeperHub — The Agent Economy (DoraHacks) |
| **Team** | Solo |
| **Build Phase** | Sep 6 – Sep 18, 2026 · Submissions close Sep 18, 12:00 CEST · Winners Sep 24/25 |
| **Tracks** | Main: Best Integration into a Live Project ($4,000) · Bounty: Best KeeperHub Feature ($1,000, stacks) |
| **Stack** | OpenCode + NVIDIA NIM + KeeperHub MCP + Aave V3 Plugin |
| **Phase** | V2 — standalone Liquidation CLI + autopilot daemon (build log: `docs/archive/cli_phase/V2-BUILD-PLAN.md`) |

> **Gas sponsorship note:** no event tag for The Agent Economy (confirmed in Discord Sep 10).
> Org-level gas credits in Settings → Billing, testnet uncharged. Direct-wallet sender
> via public mempool only (no Safe). Fork demo is wallet-pays-gas (free local ETH).

## What It Does

1. `lax autopilot` monitors the health factor of every position in `lax.config.json` (multi-position, per-position thresholds)
2. When HF drops to the trigger threshold, the **mitigation gate** runs three independent checks — HF-math verification, a preflight simulation of approve+repay, and safety bounds (block/daily spend caps) — nothing fires unless all pass
3. The exact repay amount is computed **at fire time** and passed in the HMAC-signed webhook payload; KeeperHub executes deterministically — read HF → approve → repay → verify — with the Turnkey agentic wallet, MEV-protected private routing, and a full audit trail
4. Every trigger, gate decision, and fire is appended to `~/.lax/mitigations.jsonl` and visible via `lax runs` / `app.keeperhub.com/runs/<id>`

## Repository Map

| Path | What lives there |
|------|------------------|
| `bin/lax.ts` | The `lax` binary entrypoint (REPL, one-shot, piped scripting) |
| `src/cli/` | The command core — parser, registry, executor, UI rendering (shared with the dashboard) |
| `src/autopilot/` | The daemon: multi-position monitor loop, mitigation gate, persisted state |
| `src/keeperhub.ts` | Webhook firing + HMAC signing + run permalinks |
| `src/config.ts` | Every address, threshold, and cap in one file |
| `dashboard/` | Web terminal — same command core in the browser, monitoring + audit views |
| `agent/` | The AI layer: `lax-guardian` system prompt, skills, demo runbook (OpenCode + NVIDIA NIM) |
| `scripts/` | Demo lifecycle: `setup.sh`, `demo-up.sh`, `fire-sepolia.sh`, fork start/stop/seed |
| `bootstrap/` | Minimal starter template (fork demo only) for teams building their own guardian |
| `contracts/MockOracle.sol` | Fork-demo scaffolding to shock the price oracle (never deployed live) |
| `api/` | Edge proxy example so the browser never holds your API key (HMAC-verified) |
| `docs/` | Curated docs — start at [`docs/README.md`](docs/README.md) |
| `tests/` | Vitest suite (13 files) — repay math, gate stages, preflight, safety, config; `bootstrap/tests/` adds a 14th for the starter template |

## The Liquidation CLI

One zero-dependency binary, two surfaces (standalone terminal + the dashboard's
embedded terminal share the same command core):

```bash
npm run lax -- status     # HF gauge + position + guardian state, color-coded danger border
npm run lax -- arm        # arm the autopilot (persisted across restarts)
npm run lax -- autopilot daemon        # continuous defense
npm run lax -- autopilot daemon --dry-run   # full pipeline, never fires
lax repay 5 --local       # onchain actions via the agentic wallet
lax runs / lax audit      # execution records + audit trail
```

Interactive REPL: `npm run lax`. Piped scripting works too: `echo "status\nruns" | npm run lax`.
Safety state, spend caps, and the mitigation log persist in `~/.lax/`.

**Full CLI reference** — every command, flags, expected output, the safety model,
scripting, and troubleshooting — is in [`docs/CLI-GUIDE.md`](docs/CLI-GUIDE.md).

**One command brings the whole demo up** (fork, seeded position, funded wallet,
health check — idempotent and self-healing if saved fork state is corrupt):

```bash
./scripts/demo-up.sh
```

## Live Fire (Base Sepolia — judge-safe, real transactions)

The deterministic fork demo never touches real funds. The **live path** runs on
Base Sepolia (chain 84532) with free testnet gas — a real
webhook-triggered workflow executing read HF → approve → repay → verify:

```bash
./scripts/fire-sepolia.sh     # one real fire, prints audit trail + tx links
```

Actual verified run (submission evidence):

| Artifact | Link |
|---|---|
| Audit trail | https://app.keeperhub.com/runs/9bc31ofdfca1m62b2v29t |
| Repay tx (debt 0.7002 → 0.4002 USDC) | https://sepolia.basescan.org/tx/0x918441fcd4d2071733afc139ed0b5c29cba34ddeefc2ca1583499b10827c8bac |
| Approve tx | https://sepolia.basescan.org/tx/0xd15cc2c844ea4a0dd50e0878d6819dcff116f48e98f7e2489e6d96679fca2e88 |

**Any network works too** — `lax.config.json` declares named networks (rpc +
Aave pool + USDC + workflow) and each position lives on one; the daemon
monitors and defends positions across chains in a single loop (the example
config ships with the Base fork and Base Sepolia presets used in this repo).
See `lax.config.example.json`.

**Any Turnkey agentic wallet works** — LAX resolves the executing wallet from
`LAX_WALLET_ADDRESS` → `~/.keeperhub/wallet.json` → config, never a hardcoded
address. By default the wallet defends its own position
(`LAX_SELF_DEFENSE=true`) or any address via `LAX_BORROWER_ADDRESS`.
The live-fire autopilot daemon:

```bash
LAX_WORKFLOW_ID=<sepolia-workflow-id> LAX_BORROWER_ADDRESS=<position-owner> \
  npm run lax -- autopilot daemon
```

## The Agent

LAX is an **AI agent** (OpenCode + NVIDIA NIM) that decides *when* to act and lets
KeeperHub execute *deterministically* — nothing is inferred at execution time. The
agent's brain lives in [`agent/`](agent/):

- [`agent/SYSTEM_PROMPT.md`](agent/SYSTEM_PROMPT.md) — the guardian's standing orders and hard constraints
- [`agent/skills/`](agent/skills/) — runnable procedures: monitor health factor, trigger mitigation, fund position
- [`agent/RUNBOOK.md`](agent/RUNBOOK.md) — the live demo sequence built around `lax autopilot`

Wired into [`.opencode.jsonc`](opencode.jsonc) as the `lax-guardian` agent (system prompt + skills).

## Bounty Track — Best KeeperHub Feature (separate BUIDL)

Ship a PR to `github.com/keeperhub/keeperhub` from the [`docs/FEEDBACK.md`](docs/FEEDBACK.md) findings — all are
mergeable-scoped, tested workarounds today:

| Candidate | FEEDBACK ref | Scope |
|-----------|-------------|-------|
| `tokenConfig` accepts raw JSON objects | C1 | API schema fix, transparent `JSON.stringify` server-side |
| Document / default `onBehalfOf` in Aave V3 repay | C2 | Docs + optional param defaulting to executing wallet |
| `autoApprove` option on Supply/RepayDebt actions | L3 | Collapses 2-node workflows to 1 |
| Gas sponsorship error code reference | M3 | Docs for `GAS_SPONSORSHIP_*` variants |

## Verified Testing

Everything claimed in this README was executed and verified — see
[`docs/VERIFIED-TESTING.md`](docs/VERIFIED-TESTING.md) for the full log: the live-fire
evidence (on-chain before/after), the gate's real blocking outcomes, the CLI command
battery, daemon modes, the 465-test suite (2 fork-live skipped without a fork), and the nine real bugs the verification
found and fixed.

## Judging Criteria Trace (The Agent Economy — main track rubric)

| Criterion | How LAX hits it |
|-----------|-----------------|
| Integration depth | Aave V3 is the named live project — integration targets the actual Pool contract (`repay()`, `getUserAccountData`), not a generic wrapper |
| Execution through KeeperHub | Real value movement: USDC approve → Aave debt repayment executed through the KeeperHub workflow, verifiable via tx hash + `app.keeperhub.com/runs/<id>` |
| Reliability and observability | 465-test suite (14 files, 2 fork-live skip without a fork), preflight dry-run simulation, safety plugin (block/daily caps, selector allowlist), KeeperHub execution polling, offline position cache |
| Usefulness and originality | Proactive-not-reactive liquidation defense at HF=1.05 — retail Aave users have no autonomous defender above the MEV-bot threshold |
| Developer experience and code quality | `scripts/setup.sh` one-command bootstrap, `bootstrap/` starter template, zero `any` types, every address in one `src/config.ts`, candid limitations documented |

## Architecture Decision Records

The 25 decisions behind this design — agent stack, wallet custody, the HF 1.05
proactive trigger, chain strategy, gas-sponsorship fallback — are documented in
[`docs/archive/adr/`](docs/archive/adr/). Highlights:

- ADR-001: Agent stack (OpenCode + NVIDIA NIM + custom safety plugin)
- ADR-003: Agentic wallet (first-party `@keeperhub/wallet`, Turnkey custody)
- ADR-005: Aave V3 onchain path (proactive defense at HF=1.05, two-step approve → repay, closed-form math)
- ADR-006: Gas sponsorship (org-level credits, testnet uncharged — no event tag per Discord Sep 10; wallet-pays-gas fork fallback)
- ADR-011: Preflight simulation (eth_call the approve+repay before any real fire)
