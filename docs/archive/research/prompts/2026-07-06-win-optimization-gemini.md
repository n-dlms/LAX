# Deep Research: Maximizing Grand Prize Win Probability — KeeperHub Agents Onchain Hackathon

## Context

I am a solo builder in the **KeeperHub "Agents Onchain"** hackathon on DoraHacks (judging Aug 13-20, 2026, $5,000 prize pool). My project is **LAX — Keep Your Position Safe**, a proactive Aave V3 liquidation defender. The core idea: an AI agent (powered by OpenCode CLI + NVIDIA NIM `meta/llama-3.3-70b-instruct`) that continuously monitors an Aave V3 position's health factor on a local Anvil fork of Base mainnet, and when HF drops to 1.05 (proactive, not reactive at 1.0), triggers a KeeperHub workflow that approves USDC → repays debt → verifies HF restored to 1.10. Every action flows through KeeperHub MCP, signs via Turnkey-custodied `@keeperhub/wallet`, and the full audit trail is visible at `app.keeperhub.com/runs/<id>`.

The hackathon is about "the last mile" — agents that actually execute onchain, not just decide. Judging criteria (with implied weights):

| Criterion | Weight | What the judge sees |
|-----------|--------|---------------------|
| C1: Executes onchain via KeeperHub | Highest | Working transaction hashes on a real chain |
| C2: Use of KeeperHub surfaces | High | MCP, webhook, Aave plugin, audit trail, wallet, gas tag |
| C3: Reliability & observability | High | Dashboard picks up trigger in 2s, audit trail shows each step with gas |
| C4: Originality & usefulness | Medium | Proactive HF=1.05, closed-form math, not reactive at 1.0 |
| C5: Integration quality & DX | Bounty | 60-second setup, clean TypeScript, every error path handled |

There is also an **Onboarding DX bounty** ($500) for the best contribution that improves the new-builder experience on KeeperHub.

## What We Have (Already Built, Working)

### Core Infrastructure
- **Anvil fork scripts**: `start-fork.sh`, `fork-setup-usdc.sh` (deploys LAXMockOracle, sets WETH price, seeds USDC), `drop-oracle-price.sh` (drops oracle by X%), `fork-save-state.sh`/`fork-restore-state.sh` (offline state cache via anvil_dumpState/loadState)
- **HF listener** (`scripts/hf-listener.ts`): ethers-based polling daemon, polls `getUserAccountData` every 2s, one-shot (exits after first trigger), fires KeeperHub webhook with repay amount computed from closed-form math, includes +1% buffer for rounding
- **Workflow deployed**: 5-node KeeperHub workflow (webhook → read HF → approve USDC → repay Aave → verify HF), tag `AgentsOnchain2026` attached, gas sponsorship tag set
- **Offline pipeline test** (`scripts/test-pipeline.sh`): approves, repays, verifies HF recovery directly on the fork (proves the flow works without KeeperHub dependency)

### Math & Safety
- `src/repay-math.ts`: closed-form `computeRepayAmount(totalDebtBase, hfCurrent, hfTarget)` — 13 tests, all passing
- `src/safety-plugin/guardrails.ts`: `checkSafety()` — denies non-approve selectors, enforces $1.00 block threshold and $5.00 daily cap — 11 tests
- KeeperHub workflow includes `tokenConfig` JSON field and `onBehalfOf` required field for Aave repay

### Dashboard (React 19 + Vite 6 + Tailwind 4, 195 KB JS gzipped to 64 KB)
- **MonitorView**: HF bar with color zones (green/yellow/red), collateral/debt cards formatted in USD, setup checklist, auto-scrolling log panel, real QR code rendering via `qrcode` package, cached position from localStorage when fork offline, reconnection detection (2 consecutive errors → "OFFLINE" banner)
- **MitigationView**: 3 animated step cards (approve → repay → verify), staggered entry animations, elapsed timer, auto-triggers KeeperHub execution on mount, polls execution status
- **AuditView**: outcome summary cards (HF at trigger, final HF, total time, retries), step detail table, clickable KeeperHub audit trail link, LTC/SOL QR tip jar, reset button
- **Hooks**: `usePositionPoller` (raw JSON-RPC to Anvil, localStorage cache, no ethers), `useExecutionPoller` (polls KeeperHub API every 1s)
- Animations: 6 CSS keyframes (fade-in, slide-up, slide-in-right, scale-in, stagger delays)

### Testing & Build
- 40 tests passing (repay-math 13, safety-plugin 11, hf-listener integration 3, bootstrap copy 13)
- `tsc --noEmit` clean on both root project and dashboard
- `scripts/dry-run.sh`: 5-iteration full pipeline test with timing
- `scripts/setup.sh`: one-click setup (prerequisites → npm install → API key → auth → wallet → workflow deploy → fork boot → seed → dashboard)
- `docs/SETUP.md`: quick-start + manual + demo flow + troubleshooting table
- `bootstrap/` starter template: minimal CLI-only LAX without dashboard

### Architecture Docs
- 10 ADRs (ADR-001 through ADR-010)
- `docs/architecture.md`: 546-line architecture document covering 9 sections, 6-process inventory, data model, 8-beat demo timing, error catalog
- `docs/MISSION.md`, `docs/SCOPE.md`, `docs/RISK_REGISTER.md`
- Phase 0 research: 7 deep research reports in `research/prompts/`

## Constraints (Non-Negotiable)

1. **$0 budget** — no paid APIs, no cloud credits, no paid CDP. Everything is open-source or free-tier.
2. **Solo builder** — no team. Maximum ~5 effective hours/day.
3. **TypeScript only** — per SCOPE.md, no Rust/Go/Python for new components.
4. **KeeperHub is the execution layer** — the hackathon requires this. No building our own tx broadcaster.
5. **Anvil fork for demo** — fake Base mainnet fork on local machine. No real mainnet funds.
6. **OpenCode + NVIDIA NIM** — agent stack locked per ADR-001. No switching to LangChain/ElizaOS/CrewAI.
7. **Dashboard is React 19 + Vite 6 + Tailwind 4** — no Next.js, no Remix, no backend.

## What I Need From You

Given all this context, I want a **deep, comprehensive, specific, actionable strategy** to maximize my chances of winning the **Grand Prize (1st place, $2,000)** and the **DX Bounty ($500)**.

**Key advantage: I have time.** The hackathon opens July 27 and submissions close August 13. But I've already done 3+ weeks of pre-build (the entire Phase 0-3). So I have roughly **5 weeks** (now to Aug 13) to invest in whatever gives the highest ROI on judge perception.

Do NOT give me generic advice. I need **specific, engineer-grade recommendations** in these categories:

### Category A: Demo Experience & Judge Wow-Factor

The live demo is the single highest-leverage activity. The judge stares at my screen for 3 minutes. What specific demo decisions, script timing, visual cues, and narrative beats separate "nice project" from "clear winner"?

- Exact demo script timing (down to the second — what happens at :00, :15, :30, :45, 1:00, 1:30, 2:00, 2:30, 3:00)
- What the judge should see on screen at each moment
- How to handle failure gracefully mid-demo (the "oh shit" recovery plan)
- Dashboard UI decisions that signal engineering maturity (specific: should I show raw JSON from KeeperHub API? Should I show the terminal with `kh r l` command output? Should the HF bar have tick marks?)
- How to make a local Anvil fork feel like "real mainnet" to the judge (fake block explorers? transaction links that don't 404?)

### Category B: Technical Differentiation

There will be 50+ submissions. Most will be "agent that does X on KeeperHub." What specifically makes LAX stand out technically?

- What's the single most impressive technical addition I could make in the remaining time?
- Should I add real-time gas price estimation from Base mainnet (even though we're on Anvil)?
- Should I build a transaction simulator (preview the approve+repay before executing)?
- Should I add multi-step error recovery (if approve succeeds but repay fails, retry with 1.5x gas)?
- What about a "demo mode" that runs the full cycle on a loop without manual intervention?
- How much should I invest in the safety plugin vs the demo experience vs documentation?

### Category C: KeeperHub Surface Exploitation

C2 (use of KeeperHub surfaces) is weighted High. We currently use: MCP server, webhook trigger, Aave V3 plugin, audit trail (`get_execution_logs`), agentic wallet (`@keeperhub/wallet`), gas sponsorship tag.

- What KeeperHub surfaces are we **not** using that would impress the judges?
- Should we integrate x402 or MPP for autonomous payments?
- Should we build a workflow in the KeeperHub UI and screenshot the builder view?
- Should we use the KeeperHub CLI (`kh`) in the dashboard itself to show command output?
- What does the KeeperHub team consider "advanced" usage of the audit trail?
- How can we make our `app.keeperhub.com/runs/<id>` link tell a compelling story when the judge clicks it?

### Category D: DX Bounty

The bounty is for "Best Onboarding UX Improvement." We already have `scripts/setup.sh` (one-click), `docs/SETUP.md`, and `bootstrap/` starter.

- What's missing from our DX package that would clearly win this bounty?
- Should we create a Docker image for zero-dependency setup?
- Should we create a video tutorial (screen recording)?
- Should we create a PR to the actual KeeperHub repo (per the rules)?
- Should we create a "friction log" of where we got stuck?

### Category E: Offline & Reliability Engineering

C3 (reliability & observability) is weighted High. We have fork state caching, dashboard localStorage, reconnection detection.

- What failure modes have we NOT addressed that would impress a judge if handled?
- Should we show a "degraded mode" indicator on the dashboard?
- Should we log every state transition to a file for post-demo review?
- How do we prove reliability in a 3-minute window?

### Category F: The Narrative

The winning story matters as much as the code.

- What's the single most compelling sentence the judge should remember?
- Should I lean into "DeFi for retail" or "agent infrastructure" or "MEV defense"?
- What analogies work best for a non-DeFi-native judge?
- Should the submission video be live-recorded (with mistakes) or polished (with edits)?

### Category G: Timeline & Prioritization

Given 5 weeks of effective solo work:

- What should I do in week 1 (Jul 6-12)?
- What should I do in week 2 (Jul 13-19)?
- What should I do in week 3 (Jul 20-26)?
- What should I do in week 4 (Jul 27-Aug 2 — hackathon starts)?
- What should I do in week 5 (Aug 3-9)?
- What should I do in the final days (Aug 10-13)?
- What should I **stop doing** (features we already have that are good enough)?

### Category H: Risks to Avoid

What are the most common ways projects lose this specific hackathon?

- Should I worry about KeeperHub API being down during the demo?
- Should I worry about Anvil crashing mid-demo?
- Should I worry about the judge not understanding what they're seeing?
- Should I worry about disqualification for pre-built work (since I started before Jul 27)?
- Should I worry about my OpenCode MCP failing to connect mid-demo?

---

## Format

Please structure your response in these 8 categories (A through H), with each recommendation labeled by **impact level** (HIGH / MEDIUM / LOW) and **effort estimate** (hours or days). Within each category, order recommendations by ROI (impact ÷ effort).

Be as specific as possible. Instead of "improve error handling," say "add a retry with exponential backoff to the webhook POST in hf-listener.ts, starting at 2s, max 3 retries, log each attempt to stderr."

If you recommend building something, give me the high-level architecture — what files to create/modify, what the API contract looks like, and how it integrates with existing components.

Assume I have full access to:
- KeeperHub API (app.keeperhub.com)
- KeeperHub CLI (`kh` v0.10.0)
- OpenCode + NVIDIA NIM (`meta/llama-3.3-70b-instruct`)
- Foundry (anvil, forge, cast)
- Node.js 24, TypeScript 5.7
- React 18, Vite 6, Tailwind 4
- The Anvil fork of Base mainnet at a recent pinned block
- Our KeeperHub workflow (deployed via `scripts/deploy-workflow.sh`)
- Gas sponsorship tag on the workflow
- Anvil pre-funded wallet (we control the private key)

Go as deep as possible. Don't worry about being too verbose — I need the level of detail that would take weeks to execute. The more specific, the better.
