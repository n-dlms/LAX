# Skill: Monitor Health Factor

Poll Aave V3 `getUserAccountData` for the borrower and classify the position.

## When to use

- On startup and periodically (every 2s in the demo, per `LISTENER_POLL_MS`).
- After any mitigation, to verify recovery.

## Inputs

- `user` — the borrower address (resolved via `getBorrowerAddress()`: CLI arg >
  `LAX_BORROWER_ADDRESS` env > config default).
- RPC — the Anvil fork (`http://127.0.0.1:18545`) or remote testnet RPC.

## Steps

1. Call `getUserAccountData(user)` on the Aave V3 Pool.
   - Mainnet Pool: `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5`
   - Base Sepolia Pool: `0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27`
2. Read the 6 returned fields:
   `totalCollateralBase`, `totalDebtBase`, `availableBorrowsBase`,
   `currentLiquidationThreshold`, `ltv`, `healthFactor`.
3. Interpret `healthFactor` (18 decimals):
   - `0xfff...f` (max uint) → **no debt** (empty position). Healthy.
   - `> 1.10` → healthy.
   - `1.05 < HF ≤ 1.10` → **watch**.
   - `1.0 < HF ≤ 1.05` → **act** (trigger mitigation).
   - `≤ 1.0` → liquidatable — out of scope, escalate immediately.
4. Log the read with a timestamp and block number.

## Output

`{ hf, totalDebtBase, collateralBase, classification: healthy|watch|act|liquidatable }`

## Notes

- The HF sentinel for "no debt" is the max-uint value; treat it as healthy.
- If the RPC read fails, retry once, then report the error — never guess the HF.