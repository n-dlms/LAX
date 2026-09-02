# LAX — Keep Your Position Safe

**LAX** is a proactive Aave V3 liquidation defender. MEV bots with Flashblocks can liquidate positions in the same block as the oracle update — no reactive agent can outrace them. LAX doesn't try. It monitors your health factor continuously and acts at HF = 1.05, *above* the 1.0 liquidation threshold, repaying exactly enough debt to restore the position to HF = 1.10 before the bots ever see an opportunity. Every action flows through KeeperHub MCP, signs via the Turnkey-custodied agentic wallet, and auto-retries gas sponsorship → wallet-pays fallback. `app.keeperhub.com/runs/<id>` shows the full audit trail.

| Field | Detail |
|-------|--------|
| **Hackathon** | KeeperHub — The Agent Economy (DoraHacks) |
| **Team** | Solo |
| **Build Phase** | Sep 6 – Sep 18, 2026 · Submissions close Sep 18, 12:00 CEST · Winners Sep 24/25 |
| **Tracks** | Main: Best Integration into a Live Project ($4,000) · Bounty: Best KeeperHub Feature ($1,000, stacks) |
| **Stack** | OpenCode + NVIDIA NIM + KeeperHub MCP + Aave V3 Plugin |
| **Phase** | Core build complete (Agents Onchain 2026) — retargeting to The Agent Economy |

> **Gas sponsorship note:** the `AgentsOnchain2026` tag from the previous event is retired.
> The new event's sponsorship tag is not yet published — confirm it in the KeeperHub
> Discord / office hours and set it via `LAX_SPONSORSHIP_TAG=<tag> ./scripts/deploy-workflow.sh`
> (placeholder `TBD_AGENT_ECONOMY_2026` is wired in `src/config.ts` until then).

## What It Does

1. Listens for health factor changes on your Aave V3 positions
2. When health factor drops below your configured threshold, triggers a mitigation action (repay debt / supply more collateral)
3. Executes the transaction onchain through KeeperHub — gas-optimized, MEV-protected, audited
4. Logs every action to the audit trail with transaction hashes, gas used, and outcome

## The Agent

LAX is an **AI agent** (OpenCode + NVIDIA NIM) that decides *when* to act and lets
KeeperHub execute *deterministically* — nothing is inferred at execution time. The
agent's brain lives in [`agent/`](agent/):

- [`agent/SYSTEM_PROMPT.md`](agent/SYSTEM_PROMPT.md) — the guardian's standing orders and hard constraints
- [`agent/skills/`](agent/skills/) — runnable procedures: monitor health factor, trigger mitigation, fund position
- [`agent/RUNBOOK.md`](agent/RUNBOOK.md) — the 8-beat live demo sequence

Wired into [`.opencode.jsonc`](opencode.jsonc) as the `lax-guardian` agent (system prompt + skills).

## Submission (Main Track — separate BUIDL from bounty)

- [ ] GitHub Repo (this repo — replace placeholder link)
- [ ] Demo video showing the integration working
- [ ] Link to a transaction executed through KeeperHub
- [ ] Form: integrated project = **Aave V3** (live, deployed protocol on Base + 20+ networks)
- [ ] Form: KeeperHub surfaces used — MCP (aggregate + per-workflow), agentic wallet, Aave V3 plugin, webhook trigger, `get_execution_logs` audit trail, gas sponsorship + wallet-pays fallback
- [ ] Form: candid "what still breaks" answer
- [ ] Contact: email + X/Discord handle

## Bounty Track — Best KeeperHub Feature (separate BUIDL)

Ship a PR to `github.com/keeperhub/keeperhub` from the `FEEDBACK.md` findings — all are
mergeable-scoped, tested workarounds today:

| Candidate | FEEDBACK ref | Scope |
|-----------|-------------|-------|
| `tokenConfig` accepts raw JSON objects | C1 | API schema fix, transparent `JSON.stringify` server-side |
| Document / default `onBehalfOf` in Aave V3 repay | C2 | Docs + optional param defaulting to executing wallet |
| `autoApprove` option on Supply/RepayDebt actions | L3 | Collapses 2-node workflows to 1 |
| Gas sponsorship error code reference | M3 | Docs for `GAS_SPONSORSHIP_*` variants |

## Judging Criteria Trace (The Agent Economy — main track rubric)

| Criterion | How LAX hits it |
|-----------|-----------------|
| Integration depth | Aave V3 is the named live project — integration targets the actual Pool contract (`repay()`, `getUserAccountData`), not a generic wrapper |
| Execution through KeeperHub | Real value movement: USDC approve → Aave debt repayment executed through the KeeperHub workflow, verifiable via tx hash + `app.keeperhub.com/runs/<id>` |
| Reliability and observability | 508-test suite, preflight dry-run simulation, safety plugin (block/daily caps, selector allowlist), step-level retry history, adaptive audit-trail polling, offline fork-state cache |
| Usefulness and originality | Proactive-not-reactive liquidation defense at HF=1.05 — retail Aave users have no autonomous defender above the MEV-bot threshold |
| Developer experience and code quality | `scripts/setup.sh` one-command bootstrap, `bootstrap/` starter template, zero `any` types, every address in one `src/config.ts`, candid limitations documented |

## ADRs

Phase 0 decisions documented in `docs/adr/`:
- ADR-001: Agent stack (OpenCode + NVIDIA NIM + custom safety plugin)
- ADR-002: KeeperHub MCP connection (aggregate + per-workflow servers)
- ADR-003: Agentic wallet (first-party `@keeperhub/wallet`, Turnkey custody)
- ADR-004: Chain strategy (Sepolia build, Anvil fork demo, Tenderly backup recording)
- ADR-005: Aave V3 onchain path (proactive defense at HF=1.05, two-step approve → repay, closed-form math)
- ADR-006: Gas sponsorship (event tag primary — **tag TBD for The Agent Economy**, wallet-pays-gas fork fallback)
- ADR-007: Demo environment (Anvil fork live + Tenderly recording backup link)
- ADR-008: Dashboard template — fork `thtauhid/terminal-portfolio`
- ADR-009: Tailwind v3 → v4 migration (CSS `@theme` replaces `tw-colors`)
- ADR-010: Dashboard dependency policy (`qrcode` for LTC/SOL tip jar)

## Judging Criteria Trace

| Criterion | How LAX hits it |
|-----------|-----------------|
| Executes onchain via KeeperHub | Auto-repay workflow triggered by HF=1.05 proactive threshold |
| Use of KeeperHub surfaces | MCP (aggregate + per-workflow servers), Aave V3 plugin, `get_execution_logs` audit trail, webhook trigger, agentic wallet signing, gas sponsorship (Base mainnet) + wallet-pays-gas (Anvil fork) |
| Reliability & observability | Adaptive `get_execution_logs` polling, auto-retry on `GAS_SPONSORSHIP_*` errors, step-level retry_history in audit trail, clickable `app.keeperhub.com/runs/<id>` link per mitigation |
| Originality & usefulness | Proactive-not-reactive liquidation defense — retail Aave users currently have no autonomous defender below the MEV-bot threshold; existing solutions (DeFiSave, Gelato) target reactive keepers |
| Integration quality & DX | 60-second setup from `git clone` → wallet installed → MCP connected → first mitigation, Onboarding DX bounty play, every KeeperHub surface used correctly |

*(Pre-event rubric from Agents Onchain 2026 — kept for history. The Agent Economy rubric trace is at the top of this file.)*
