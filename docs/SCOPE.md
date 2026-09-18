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
- Multi-position, multi-network monitoring via `lax.config.json`
  (borrower + rpc + pool + usdc + workflow per position), shipped in V2,
  extensible to any Aave V3 deployment
- OpenCode agent framework with `lax-guardian` agent
- KeeperHub MCP remote HTTP transport (aggregate + per-workflow servers)
- KeeperHub Aave V3 plugin for health factor reads (`getUserAccountData`)
- KeeperHub `web3/write-contract` for ERC-20 approve + Aave Pool `repay()`
- First-party `@keeperhub/wallet` (Turnkey custody)
- Base Sepolia for live testnet, Anvil fork of Base mainnet for demo
- Gas sponsorship: org-level gas credits (free on testnet, confirmed no event tag
  Sep 10; direct-wallet sender via public mempool) + wallet-pays-gas
  fallback on the Anvil fork, see `docs/zero-cost-testnet-plan.md`
- TypeScript for all custom glue code

## Out Of Scope

- Custom smart contracts (`contracts/MockOracle.sol` is fork-demo scaffolding only, never deployed live)
- Multiple DeFi protocols (Aave V3 only, the named live integration: Base Pool
  `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5`, Base Sepolia Pool
  `0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27`)
- Mobile app or web frontend beyond the single-page demo dashboard
- ML predictions or price forecasting
- CI/CD or production infrastructure
- Database (KeeperHub execution history is the audit record)
- Auth beyond KeeperHub API key + wallet `wallet.json`
- x402 / MPP autonomous payment (not used in this submission)
- Reactive defense at HF < 1.0 (we act proactively at HF 1.05)

## Scope Change Process

Adding anything to In Scope requires:
1. Justification: how does this help the demo?
2. Time check: is there enough time remaining?
3. Decision recorded in an ADR

Golden rule: if it doesn't help the 3-minute demo, don't build it.
