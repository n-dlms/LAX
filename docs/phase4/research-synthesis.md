# Research Synthesis — Winning the KeeperHub Agents Onchain Hackathon

Sourced from: KeeperHub blog (ETHGlobal Open Agents wrap-up), DoraHacks page, docs.phase4 strategy metaplan, KeeperHub docs.

---

## The Single Most Important Document — KeeperHub's Own Post-Mortem

The KeeperHub team reviewed **all 180 submissions** from their ETHGlobal Open Agents hackathon. They published exactly what they valued. This is the highest-signal document we have.

### What They Said About Winners

> "The bar was: is this something KeeperHub can merge, adopt, or build on directly? A compelling demo that does not survive contact with a real codebase is not a winner. A shallow integration with a polished pitch is not a winner."

**They read all code.** "We read your code. We watched your demo. We looked at your README."

### Winner #1: Tradewise Agentlab ($2,500)
**What stood out:**
- 125 tests (we have 40)
- Live deployment, not a demo
- Webhook-driven architecture wiring real x402 payment flows into real KeeperHub execution
- **Submitted detailed, reproducible bug reports** — "That is not what you do if you are trying to look good. That is what you do if you actually plan to ship."
- iNFT model for agent ownership (novel direction)

### Winner #2: Keeper-Gate  
**What stood out:**
- Clean abstraction: `@keepergate/core` + per-framework adapters (~100 lines each)
- Universal logic lives once. Framework-specific adapters are thin.
- "The right abstraction. It is also the abstraction that the team discovered, not the one we suggested."

### Winner #3: ZW.ARM
**What stood out:**
- **Real money, real protocol, real results.** 450 confirmed transactions over the hackathon period.
- 98.4% optimal decision rate, 12,559 cycles across 6.9 days, 5.07% APY
- **Three-agent swarm:** alpha executor (pulls APYs, triggers rebalance), beta (manages subscriber wallets), **gamma (independent LLM critique of every decision before execution)**
  - "The critique agent is worth calling out specifically. Adding an independent agent whose job is to challenge every decision before execution is the kind of failure-mode thinking that most hackathon projects skip."
- **Per-user wallet provisioning**: automated KeeperHub-managed wallet per subscriber, isolated from everyone else's. "That means ZW.ARM used KeeperHub as wallet infrastructure for their end users, not just as an execution layer for their own agent."

### What the Numbers Showed

Of 180 projects:
- 52 integrated via MCP — "the one actually pointing somewhere"
- 40 integrated via x402 — same cohort
- 17 called HTTP endpoints directly — "More work, shallower integration"
- 25 used webhook pattern — "Legitimate, but passive: KeeperHub as a settlement layer rather than a reasoning surface"
- 30 surface integrations — "one workflow created, rarely executed meaningfully, no real agent loop"

### The Multi-Agent Swarm Pattern

> "Several teams did not just connect an agent to a protocol. They built multi-agent swarms where KeeperHub served as the shared execution primitive across all agents in the system. One agent decides. Another critiques. KeeperHub executes. That architectural pattern showed up independently in enough projects that it is no longer an edge case."

---

## Strategic Implications for LAX

### What We Should Double Down On

| Action | Source | Impact | Effort |
|--------|--------|--------|--------|
| **Add a critique agent** (like ZW.ARM's gamma) that validates every decision before execution | KeeperHub blog explicitly called this out as failure-mode thinking | HIGH | ~3 days |
| **Expand to 100+ tests** (current: 40) | Winner #1 had 125 tests, KeeperHub team reads code | HIGH | ~2 days |
| **FEEDBACK.md** — structured friction log for the KeeperHub SDK | Winner #1 did this, KeeperHub team valued it explicitly, DX bounty requirement | HIGH | ~1 day |
| **Pre-flight simulation** using `cast call` before submitting to KeeperHub | Strategy metaplan, shows production seriousness | HIGH | ~1.5 days |
| **Real mainnet Base transaction** (even $0.01 USDC) as proof of execution | ALL winners had live deployments | HIGH | ~1 day |
| **Counterfactual optimizer** (repay vs supply math) | Strategy metaplan, technical differentiation | MEDIUM | ~2.5 days |

### What We Should Be Cautious About

| Action | Reason |
|--------|--------|
| x402/MPP integration | Only 40/180 projects used it. Winners didn't necessarily use it. The KeeperHub team already saw it. Differentiator risk: lower than novelty features |
| Docker compose | Reduces "wow" — KeeperHub team values code quality and tests over infra packaging |
| Otterscan | Anvil compatibility issues (#7881). Risk of demo crash. Low ROI — judge won't care about local block explorer as much as working transactions |

### The Critique Agent (Highest ROI Move)

ZW.ARM's gamma agent was specifically called out. We can implement this as:

1. **Before executing mitigation**, the agent simulates the transaction on the fork using `cast call`
2. **Validates**: will the approve succeed? Will the repay succeed? Will HF actually restore to ≥ 1.10?
3. **If simulation fails**, the dashboard shows "SIMULATION FAILED — aborting" with the revert reason
4. **If simulation passes**, the agent proceeds to execute via KeeperHub
5. **Log every step** to the dashboard's event log with "[CRITIQUE]" prefix

This doesn't require a separate LLM call — the critique is a deterministic simulation. But we can frame it as the "gamma agent" in the narrative.

### FEEDBACK.md for DX Bounty

Per the KeeperHub blog, the feedback bounty ($250 x2) went to projects that submitted "structured, actionable reports with reproducible issues and specific documentation gaps." We've hit enough KeeperHub friction to write a solid FEEDBACK.md:
- `tokenConfig` JSON field confusion (we hit this in S4)
- `onBehalfOf` required field undocumented
- Aave V3 `getUserAccountData` returns 6 fields but docs show 9
- Webhook URL format differences between versions

### Test Expansion Strategy

Current: 40 tests. Target: 100+.

Add tests for:
- Counterfactual optimizer (10+)
- Pre-flight simulator (10+)
- Critique agent rules (10+)
- Edge cases: empty wallet, zero debt, max HF, overflow (10+)
- Dashboard component tests (10+)
- E2E integration test for full pipeline (3+)

---

## Key Quotes to Remember

> "A compelling demo that does not survive contact with a real codebase is not a winner."

> "We read your code. We watched your demo. We looked at your README."

> "The critique agent... the kind of failure-mode thinking that most hackathon projects skip."

> "That is not what you do if you are trying to look good. That is what you do if you actually plan to ship."

> "KeeperHub as a settlement layer rather than a reasoning surface" — the lower tier. We must be in the "reasoning surface" tier.

> "The MCP and x402 cohort is the one actually pointing somewhere."
