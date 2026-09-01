# LAX Scope

## Primary Goal

Ship one working agent that monitors an Aave V3 health factor and executes a mitigation transaction via KeeperHub, demonstrated live with real transaction hashes.

## In Scope

### Demo Flow
- Setup: create KeeperHub account, fund wallet, install MCP + agentic wallet
- Monitor: agent reads Aave V3 health factor via KeeperHub Aave plugin
- Trigger: health factor drops below threshold (simulated or real)
- Execute: agent calls KeeperHub workflow to repay debt or supply collateral
- Verify: audit trail shows tx hash, gas used, status
- Bounty: starter template with step-by-step setup guide

### Tech
- OpenCode (free OSS CLI) + NVIDIA NIM (free model endpoint) — see ADR-001
- KeeperHub MCP remote HTTP transport (aggregate + per-workflow servers) — see ADR-002
- KeeperHub Aave V3 plugin for health factor reads (`getUserAccountData`) — see ADR-005
- KeeperHub `web3/write-contract` for ERC-20 approve + Aave Pool `repay()` — see ADR-005
- First-party `@keeperhub/wallet` (Turnkey custody, no CDP) — see ADR-003
- Sepolia for Phase 3 build, Anvil fork of Base mainnet for demo, Tenderly fork recording as backup link — see ADR-004 + ADR-007
- Gas sponsorship tag (**TBD — confirm the Agent Economy event tag in Discord**) + wallet-pays-gas fallback (Anvil fork) — see ADR-006
- TypeScript for all custom glue code

## Out Of Scope

- Multi-position or portfolio dashboard
- Custom smart contracts
- Multiple DeFi protocols (Aave V3 only)
- Mobile app or web frontend beyond the single-page demo dashboard
- ML predictions or price forecasting
- CI/CD or production infrastructure
- Database (KeeperHub `get_execution_logs` audit trail is the record — see ADR-002)
- Auth beyond KeeperHub API key + wallet `wallet.json`
- x402 / MPP autonomous payment (cut in Phase 1 — concentrates narrative, reuses the time for core-loop polish)
- Reactive "race the bots" defense (cut in Phase 1 — HF < 1.0 trigger is unwinnable vs. Flashblocks; we act proactively at HF = 1.05 per ADR-005)

## Scope Change Process

Adding anything to In Scope requires:
1. Justification: how does this help the demo?
2. Time check: is there enough time remaining?
3. Decision recorded in an ADR

Golden rule: if it doesn't help the 3-minute demo, don't build it.
