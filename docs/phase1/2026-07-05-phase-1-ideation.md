# Phase 1 — Ideation: Pitch, Wow Moment, and Demo Flow

**Date**: 2026-07-05
**Phase**: 1 (Ideation)
**Status**: Locked
**Grounded In**:
- `docs/phase1/Aave V3 Liquidation Mechanics Research.md`
- `docs/phase1/KeeperHub Observability Research.md`
- `docs/adr/2026-07-05-adr-001-agent-stack-opencode-nim.md` through ADR-006

---

## 1. Pitch Narrative (LOCKED)

**One-paragraph pitch**:

> LAX is an autonomous liquidation defender for Aave V3. MEV bots on Base use Flashblocks to liquidate undercollateralized positions in the same block as the oracle update — no human, and no reactive agent, can outrace them. LAX doesn't try. Instead, it monitors your health factor continuously and acts at HF = 1.05 — *above* the 1.0 liquidation threshold — programmatically repaying just enough debt to restore the position to HF = 1.1 before the vultures ever see an opportunity. Every action flows through KeeperHub's MCP server, signs via the Turnkey-custodied agentic wallet, and is gas-sponsored by the `AgentsOnchain2026` tag. Judges click `https://app.keeperhub.com/runs/<id>` and see the full audit trail.

**Tagline**: *"We do not race the vultures; we lock them out of the coop."* — directly quoted from `docs/phase1/Aave V3 Liquidation Mechanics Research.md:152`.

**Why this pitch survives judge scrutiny**:
- Reactive "race the bots" framing is a **technical falsehood** per the research report — judges who know DeFi would dock us immediately.
- Proactive framing is **honest**: at HF=1.05, the position is legally unliquidatable (`Aave.com/docs`, cited in report).
- The math is **closed-form and verifiable**: `repay_amount = debt × (1 - HF_current / HF_target)`.
- The demo shows **real onchain action** (Tenderly fork of Base mainnet with programmable oracle).

---

## 2. The Wow Moment (LOCKED)

**The 10-second jaw-dropper**:

The judge watches a live dashboard. Health factor ticks down from 1.20 → 1.10 → 1.07 → 1.05. At 1.05, LAX fires. Within ~3 seconds, the dashboard lights up: agent detected → computed exact repay amount → approved via wallet → repay tx submitted → tx hash appears on screen → HF recovers to 1.10. A single clickable link appears: `app.keeperhub.com/runs/exec_8f93a2bc0d41e77f`. The judge clicks it and sees the full audit trail on KeeperHub's own UI.

**Why this wows**:
1. **Visually dramatic** — the HF tickdown is the countdown timer, ~3-second recovery is the payoff.
2. **Mathematically grounded** — the repay amount is computed, not hardcoded; judges see the formula in the dashboard.
3. **Click-to-verify** — the audit trail link is the trump card. "Don't take our word for it, click this."
4. **Proactive, not reactive** — the framing instantly differentiates us from every "MEV race" project the judges have seen before.

---

## 3. Demo Flow Outline (LOCKED) — 8 Beats

Based on the 8-beat sequence recommended in `docs/phase1/KeeperHub Observability Research.md:311-320`, adapted to LAX.

| Beat | Time | Visual Indicator | Source Event | Narrative |
|------|------|------------------|--------------|-----------|
| **1. Onboarding** | 0:00–0:18 | CLI: `git clone` → wallet installed → MCP connected | `agentic-wallet-skills initialized` log | "60-second setup. This is the onboarding DX bounty play." |
| **2. Skill registration** | 0:18–0:25 | Aave V3 rebalance skill loaded, contract allowlist populated | `plugin_install` event in audit trail | "Agent now knows the Aave Pool on Base." |
| **3. Monitoring** | 0:25–0:40 | Live HF dashboard, oracle price ticking down (Tenderly fork) | `getUserAccountData` polled at adaptive interval | "LAX is watching. Position is healthy at HF=1.20." |
| **4. Trigger** | 0:40–0:45 | HF crosses 1.05 threshold, dashboard flashes yellow→orange | Oracle price override in fork pushes HF to 1.04 | "Threshold breached. LAX computes exact repay: $107.14." |
| **5. Approve** | 0:45–0:50 | Wallet signs approve tx, hash appears on dashboard | `web3/write-contract` approve call | "Safety plugin approves exact amount — not unlimited, not 1¢ more." |
| **6. Repay** | 0:50–0:55 | Repay tx submitted, dashboard shows pending → confirmed | Aave V3 Pool `repay(USDC, 107.14e6, 2, user)` | "Sponsored gas. Tx lands in 2 seconds on Base fork." |
| **7. Recovered** | 0:55–1:00 | HF springs back to 1.10, dashboard green, "Vultures denied" toast | `getUserAccountData` re-read post-repay | "Position restored. Liquidation bots saw nothing." |
| **8. Verify** | 1:00–1:10 | Clickable link: `app.keeperhub.com/runs/<id>` | `get_execution_logs` returns full audit trail | "Click this. Every step is on KeeperHub. Don't take our word for it." |

**Total demo time**: ~70 seconds. Within the 3-minute pitch budget with 2x buffer.

---

## 4. Validation Against PLAYBOOK Questions (from `PLAYBOOK.md:16-20`)

| Question | Answer |
|----------|--------|
| Can we demo this in the time available? | **YES** — 70-second demo, all on a Tenderly fork with deterministic oracle price drops. |
| Is the problem real and relatable? | **YES** — Aave V3 liquidations are a daily DeFi event. Per report: Oct 10 2025, 38 speculative liquidators active across Base+Arb+Op. |
| Can a judge understand it in 30 seconds? | **YES** — "Your Aave position rescues itself before liquidation bots can touch it." |
| What's the one "wow" moment? | **YES** — The HF-tickdown → 3-second recovery → clickable KeeperHub audit link. |

All four PASS. Per `PLAYBOOK.md:21`: "Pick ONE idea. Commit hard. No second-guessing." We commit.

---

## 5. ADR Updates Required (Flagged for Sign-off)

The research reports changed three Phase 0 decisions. These need ADR updates:

| ADR | Update | Why |
|-----|--------|-----|
| ADR-004 (Chain Strategy) | Add Tenderly fork as the demo environment, not mainnet Base | Mainnet cannot trigger HF degradation programmatically (per Aave V3 Analysis report, all `borrow`/`withdraw`/`flash loan`/`disable collateral` paths revert). |
| ADR-005 (Aave V3 Path) | Threshold changed from 1.0 → 1.05 (proactive, not reactive). Add webhook trigger pathway alongside polling (lower latency per observability report). | Reactive race is unwinnable vs. MEV bots with Flashblocks. |
| ADR-006 (Gas Sponsorship) | Confirm sponsorship works on Tenderly fork (or document fallback: wallet-pays-gas on fork since it's free anyway) | Sponsorship tagged workflows on a fork may not have the same paymaster coverage. |

A 7th mini-ADR (ADR-007) needed: **Demo Environment — Tenderly Fork with Programmable Oracle**.

---

## 6. Demo Surface Coverage (Judging Criteria Trace)

| Judging Criterion | LAX Demo Surface |
|-------------------|-------------------|
| Executes onchain via KeeperHub | Beat 6 — repay tx via `web3/write-contract` |
| Use of KeeperHub surfaces | MCP (Beat 4), wallet (Beat 5), gas sponsorship (Beat 6), audit trail (Beat 8), per-workflow MCP (ADR-002), x402 (stretch — see below) |
| Reliability & observability | Beat 8 — clickable `app.keeperhub.com/runs/<id>` link, retry history visible in audit |
| Originality & usefulness | Proactive-not-reactive framing, no competitor does this for retail Aave users |
| Integration quality & DX | 60-second onboarding (Beats 1-2), every surface used correctly |

**Stretch goal — x402 surface**: Per `docs/phase1/KeeperHub Observability Research.md:243-250`, we can call a marketplace workflow that returns a 402 challenge, sign a 0.01 USDC payment via wallet, settle onchain, and show the entry on x402scan.com. Adds the "x402 / MPP" criterion. **Decision**: include as a stretch goal if build time permits; do not block the main demo flow on it.

---

## 7. Commitment

Per `PLAYBOOK.md:21`: "Pick ONE idea. Commit hard. No second-guessing."

LAX is committed as: **Proactive Aave V3 liquidation defender, demoed on a Tenderly fork of Base mainnet, with click-to-verify KeeperHub audit trail.**

No second-guessing. Phase 1 is locked. Proceeding to ADR updates (1.4) and README pitch paragraph (1.5) before transitioning to Phase 2 (Architecture Sprint).
