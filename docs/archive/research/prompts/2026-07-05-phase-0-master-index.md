# Phase 0 Research Master Index

**Status**: Active
**Phase**: 0 — Research & Setup
**Hackathon**: The Last Mile (KeeperHub)
**Dates**: Jul 5 – Jul 27, 2026 (pre-hackathon window)

## Rule

Per `AGENTS.md:164-185` (Rule 12, Deep Research Before Phases) and the user directive:
**Research first, exhaustively. ADRs are written only AFTER every Phase 0 ASSUMPTION is resolved.**

No code, no ADRs, no architecture decisions until research closes. This is a phase boundary.

## What Phase 0 Must Resolve

Eight ASSUMPTIONS must each be either VERIFIED or replaced with a verified alternative before we earn the right to write a single ADR:

| # | ASSUMPTION | Owner prompt file |
|---|-----------|-------------------|
| 1 | The KeeperHub MCP endpoint and CLI cost nothing to call. | `phase0-01-keeperhub-cost-and-terms.md` |
| 2 | A free agent client can talk to KeeperHub MCP (we don't need a paid Claude subscription). | `phase0-02-agent-framework-cost.md` |
| 3 | The KeeperHub Aave V3 plugin can both READ health factor and EXECUTE repay/supply. | `phase0-03-aave-v3-plugin.md` |
| 4 | Sepolia ETH can be obtained for free without KYC that we can't pass. | `phase0-04-sepolia-faucet-and-funding.md` |
| 5 | KeeperHub mainnet gas sponsorship is real and reachable for a hackathon submission. | `phase0-05-gas-sponsorship.md` |
| 6 | The `@keeperhub/wallet` agentic wallet installs without a paid Coinbase Developer Platform account. | `phase0-06-agentic-wallet-install.md` |
| 7 | The 200 USDC/day cap on the agentic wallet is sufficient for our demo call pattern. | `phase0-07-x402-cost-model.md` |
| 8 | The judging rewards live mainnet tx far above simulated ones — single real tx beats 10 mocks. | `phase0-08-judging-criteria-strict-reading.md` |

## How to Use the Prompts

Each prompt file below is the deep research prompt for one ASSUMPTION. The agent must investigate (web docs, GitHub source, npm registry, sample scripts) and write its findings back into the file's **Research Result** section.

A prompt is only "closed" when:
- all its research questions are answered, with citations (URLs or file paths)
- the **Recommendation** is concrete (specific tool name + version, exact command, or specific dollar figure)
- known unknowns are explicitly listed as "OPEN — needs human tester" rather than glossed over

ADRs may only be written after all 8 prompts are closed AND the human has done any "OPEN — needs human tester" steps in real environment.

## Phase 0 Deliverable (not code)

A single `docs/phase-0-results.md` summarizing each ASSUMPTION's verdict. From that, Phase 0 ADRs get written in one batch.

## Phase 0 Exit Gate

- [ ] All 8 prompts closed with citations in their Research Result sections
- [ ] Human has run any marked "OPEN — needs human tester" steps
- [ ] `docs/phase-0-results.md` written (one paragraph per ASSUMPTION)
- [ ] All 8 ASSUMPTIONS marked VERIFIED or REPLACED in `phase-0-research-setup.md`
- [ ] Only THEN: write Phase 0 ADRs (framework, chain, wallet, payment) in one batch into `docs/adr/`

Then transition to Phase 1.
