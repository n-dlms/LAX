# Phase 0 — Research & Setup

**Status**: Active
**Dates**: Jul 5 – Jul 27, 2026 (pre-hackathon window)
**Goal**: Lock down every uncertain fact before the hackathon opens Jul 27. Zero unwelcome surprises during the build phase.

## What Phase 0 Must Resolve

1. **Agent framework choice grounded in verified cost** — Claude Code requires a paid Claude subscription (Pro $17/mo, Max $100/mo) per anthropic.com/pricing. Verify that OR pick a free alternative that can still talk to KeeperHub's MCP server.
2. **Every KeeperHub surface we plan to use must be verified** with exact command/tool name and behavior — not training-data assumptions.
3. **Fallback plans documented** so a single broken piece does not sink the demo.
4. **Hackathon account + wallet + API key established** before Day 1.
5. **First-tx milestone plan**: know exactly what the first real Sepolia tx through KeeperHub looks like and how to demo it on Jul 27.

Phase 0 deliverable is a short "go/no-go" doc, not code. Code in Phase 0 is a violation unless it is a verification script.

## Phase 0 Open Questions (ASSUMPTIONS to be confirmed)

These assumptions must be confirmed before Phase 1:

- **ASSUMPTION-1**: KeeperHub's remote MCP endpoint (`https://app.keeperhub.com/mcp`) is free to call, only the agent client (Claude Code, etc.) may cost money — UNVERIFIED.
- **ASSUMPTION-2**: Free alternatives can talk to MCP over HTTP. Candidates: OpenCode (this tool, npx entry), Cline, Cursor free trial, Continue.dev, Aider, or a custom Python client using `mcp` SDK. All need verification.
- **ASSUMPTION-3**: The KeeperHub Aave V3 plugin can read health factor and execute repay/supply. Need exact actionType names. UNVERIFIED — fetch the plugin docs page.
- **ASSUMPTION-4**: Sepolia faucet works without social verification KYC. UNVERIFIED.
- **ASSUMPTION-5**: KeeperHub gas sponsorship on Ethereum mainnet is one-click or near-zero config. UNVERIFIED.
- **ASSUMPTION-6**: The agentic wallet (`@keeperhub/wallet`) install works without a paid CDP account. UNVERIFIED.
- **ASSUMPTION-7**: 200 USDC/day cap is more than enough for demo. UNVERIFIED given call counts.
- **ASSUMPTION-8**: Live tx execution is judged; a single non-simulated tx on mainnet scores higher than 10 simulated ones. UNVERIFIED — inferable from rules but confirm.

## Phase 0 Exit Criteria

- [ ] Free agent framework confirmed, install steps tested
- [ ] KeeperHub account created, `kh_` API key saved in `.env` (gitignored)
- [ ] Sepolia wallet funded with at least 0.1 ETH
- [ ] Agentic wallet provisioned, address recorded
- [ ] Per-workflow MCP install for a "mcp-test" workflow confirmed working
- [ ] Aave V3 plugin docs read; exact actionType names recorded
- [ ] Gas sponsorship mechanics confirmed
- [ ] First-tx milestone plan written (`docs/plan-first-tx.md`)

Phase 0 → Phase 1 transition: when every ASSUMPTION above is marked VERIFIED or replaced by a verified alternative.
