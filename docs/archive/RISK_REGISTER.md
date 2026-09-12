# LAX Risk Register

| ID | Risk | L | I | Mitigation | Status |
|----|------|---|---|------------|--------|
| R-001 | KeeperHub Aave V3 plugin API changes during hackathon | Med | Critical | Test plugin early (day 1). Fall back to manual web3/read-contract with Aave pool ABI. | Active |
| R-002 | Sepolia testnet ETH faucet unavailable | High | High | Request funds from multiple faucets. Have a wallet with pre-funded Sepolia ETH ready. KeeperHub gas sponsorship on mainnet is backup. | Active |
| R-003 | KeeperHub agentic wallet daily cap (200 USDC) insufficient | Low | High | Most workflows <$0.05. 200 USDC = 4,000 calls/day. More than enough for demo. Contact support if higher cap needed. | Active |
| R-004 | Per-workflow MCP registration doesn't work as expected | Med | Medium | Fall back to aggregate MCP server with call_workflow dispatcher. Multi-turn but works. | Active |
| R-004a | MCP aggregate server (`/mcp`) connectivity | Med | Medium | ✅ Confirmed alive (keeperhub v1.2.0, MCP 2024-11-05). Tools+resources capabilities advertised. | Tested |
| R-005 | Demo wifi fails during pitch | High | Critical | Record backup video. Cache audit trail screenshots. Prepare offline script reading real tx hashes from block explorer. | Active |
| R-006 | Aave V3 health factor doesn't move during demo window | Med | High | Simulate via flash loan or direct debt tx. Or pre-record HF drop + recovery, show agent responding in real time to a test scenario. | Active |
| R-007 | Onboarding DX bounty conflicts with Grand Prize scope | Low | Medium | Bounty deliverable is a separate concern: starter template + friction doc. Does not compete with agent code. Block 2 days for it. | Active |
| R-008 | KeeperHub gas sponsorship requires specific setup not yet documented | Med | High | ✅ `AgentsOnchain2026` tag created and attached to test workflow via PATCH `/api/workflows/:id`. Wallet provisioned (`0x8Bb787...`). Gas write test pending onchain workflow creation. | Partial |
