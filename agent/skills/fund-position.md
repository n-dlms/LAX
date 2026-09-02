# Skill: Fund Position (Base Sepolia)

Set up a real Aave V3 position on Base Sepolia so the guardian has something to
protect. This is the exact sequence used to produce the submission transaction
(see `docs/zero-cost-testnet-plan.md`).

## When to use

Before the live demo / submission run — the wallet needs a collateralized debt
position with a health factor, and gas.

## Prereqs

- Wallet funded with faucet ETH on Base Sepolia (the execution wallet is
  `0x26833b05be49036d4de306b1f4fba7713cc84de5` — check with `kh wallet balance`).
- `kh` CLI authenticated.

## Steps

1. **Wrap ETH → WETH** (auto-wrap on the Base WETH predeploy):
   `kh execute transfer --chain 84532 --to 0x4200000000000000000000000000000000000006 --amount 0.002 --wait`
2. **Approve the Pool for WETH**:
   `kh execute cc --chain 84532 --contract 0x4200000000000000000000000000000000000006 --method approve --args '["0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27","2000000000000000"]' --wait`
3. **Supply WETH as collateral**:
   `kh execute cc --chain 84532 --contract 0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27 --method supply --args '["0x4200000000000000000000000000000000000006","2000000000000000","0x26833b05be49036d4de306b1f4fba7713cc84de5",0]' --wait`
4. **Borrow USDC** (Aave's testnet USDC, `0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f`):
   `kh execute cc --chain 84532 --contract 0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27 --method borrow --args '["0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f","1000000",2,0,"0x26833b05be49036d4de306b1f4fba7713cc84de5"]' --wait`
5. **Verify**: `getUserAccountData` shows collateral ≈ $4.89, debt ≈ $1.00,
   HF ≈ 4.14 (healthy).

## Output

A funded position ready for the monitor/trigger loop.

## Notes

- The USDC here is **Aave's** testnet token — Circle USDC is a different address
  and cannot repay Aave.
- All amounts are base units (WETH 18 decimals, USDC 6 decimals).