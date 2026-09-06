#!/usr/bin/env bash
# Fund the agentic wallet on the fork with USDC + pool allowance so the
# preflight simulation (and the KeeperHub repay) can move funds from it.
# Safe to re-run: each step is idempotent.
set -euo pipefail
export PATH="$HOME/.foundry/bin:${PATH}"

if ! command -v cast >/dev/null 2>&1; then
  echo "ERROR: Foundry is not installed. Install: curl -L https://foundry.paradigm.xyz | bash && foundryup" >&2
  exit 1
fi

RPC="${RPC:-http://127.0.0.1:18545}"
W=0x8Bb7870242e75132Fd62265cA8ABF771d49C821C          # agentic (Turnkey) wallet
USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913       # Base USDC
POOL=0xA238Dd80C259a72e81d7e4664a9801593F98d1c5       # Aave V3 Pool
USDC_SLOT=9                                           # FiatToken V2 balance mapping slot
FUND_AMOUNT_WEI=100000000                             # 100 USDC (6 decimals)

echo "=== LAX demo wallet funding ==="

echo "[1/3] ETH for gas (1 ETH)..."
cast rpc anvil_setBalance "$W" 0x3635C9ADC5DEA00000 --rpc-url "$RPC" >/dev/null

BALANCE=$(cast call "$USDC" "balanceOf(address)(uint256)" "$W" --rpc-url "$RPC" | awk '{print $1}')
if [ "$BALANCE" -ge "$FUND_AMOUNT_WEI" ]; then
  echo "  USDC balance already ${BALANCE} — skipping top-up"
else
  echo "[2/3] Setting USDC balance to 100 via storage slot $USDC_SLOT..."
  SLOT=$(cast index address "$W" "$USDC_SLOT")
  cast rpc anvil_setStorageAt "$USDC" "$SLOT" \
    0x0000000000000000000000000000000000000000000000000000000005f5e100 --rpc-url "$RPC" >/dev/null
fi

ALLOWANCE=$(cast call "$USDC" "allowance(address,address)(uint256)" "$W" "$POOL" --rpc-url "$RPC" | awk '{print $1}')
if [ "$ALLOWANCE" -ge "$FUND_AMOUNT_WEI" ]; then
  echo "[3/3] Pool allowance already ${ALLOWANCE} — skipping approve"
else
  echo "[3/3] Approving Pool spend..."
  cast rpc anvil_impersonateAccount "$W" --rpc-url "$RPC" >/dev/null
  cast send "$USDC" "approve(address,uint256)" "$POOL" 100000000000 \
    --rpc-url "$RPC" --from "$W" --unlocked >/dev/null
  cast rpc anvil_stopImpersonatingAccount "$W" --rpc-url "$RPC" >/dev/null || true
fi

echo ""
echo "Wallet $W funded:"
echo "  USDC:      $(cast call "$USDC" "balanceOf(address)(uint256)" "$W" --rpc-url "$RPC")"
echo "  allowance: $(cast call "$USDC" "allowance(address,address)(uint256)" "$W" "$POOL" --rpc-url "$RPC")"
echo "=== done ==="
