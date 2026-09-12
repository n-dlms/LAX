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
- Multi-position, multi-network monitoring via `lax.config.json` (`src/autopilot/positions.ts` —
  any Aave V3 chain: borrower + rpc + pool + usdc + workflow per position) — shipped in V2,
  supersedes the old single-position scope
- OpenCode (free OSS CLI) + NVIDIA NIM (free model endpoint) — see ADR-001
- KeeperHub MCP remote HTTP transport (aggregate + per-workflow servers) — see ADR-002
- KeeperHub Aave V3 plugin for health factor reads (`getUserAccountData`) — see ADR-005
- KeeperHub `web3/write-contract` for ERC-20 approve + Aave Pool `repay()` — see ADR-005
- First-party `@keeperhub/wallet` (Turnkey custody, no CDP) — see ADR-003
- Sepolia for Phase 3 build, Anvil fork of Base mainnet for demo, Tenderly fork recording as backup link — see ADR-004 + ADR-007
- Gas sponsorship: org-level gas credits (free on testnet, confirmed no event tag in
  Discord Sep 10; direct-wallet sender via public mempool, no Safe) + wallet-pays-gas
  fallback (Anvil fork) — see ADR-006, `docs/zero-cost-testnet-plan.md`
- TypeScript for all custom glue code

## Out Of Scope

- Custom smart contracts (`contracts/MockOracle.sol` is fork-demo scaffolding only, never deployed live)
- Multiple DeFi protocols (Aave V3 only — the named live integration: Base Pool
  `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5`, Base Sepolia Pool
  `0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27`)
- Mobile app or web frontend beyond the single-page demo dashboard
- ML predictions or price forecasting
- CI/CD or production infrastructure
- Database (KeeperHub `get_execution_logs` audit trail is the record — see ADR-002)
- Auth beyond KeeperHub API key + wallet `wallet.json`
- x402 / MPP autonomous payment (cut in Phase 1 — concentrates narrative, reuses the time for core-loop polish; **not used in the submission — do not claim it**)
- Reactive "race the bots" defense (cut in Phase 1 — HF < 1.0 trigger is unwinnable vs. Flashblocks; we act proactively at HF = 1.05 per ADR-005)

## Scope Change Process

Adding anything to In Scope requires:
1. Justification: how does this help the demo?
2. Time check: is there enough time remaining?
3. Decision recorded in an ADR

Golden rule: if it doesn't help the 3-minute demo, don't build it.
