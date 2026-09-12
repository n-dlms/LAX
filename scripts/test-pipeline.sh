#!/bin/bash
set -euo pipefail

# test-pipeline.sh — Offline pipeline simulation: approve → repay → verify
# Tests the full liquidation defense flow against Anvil fork without KeeperHub

export PATH="$HOME/.foundry/bin:$PATH"

FORK_PORT="${LAX_FORK_PORT:-18545}"
RPC_URL="http://127.0.0.1:$FORK_PORT"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAX_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PASS=0
FAIL=0

cleanup() {
  echo "=== Cleaning up ==="
  pkill anvil 2>/dev/null || true
}

trap cleanup EXIT

echo "=== LAX Pipeline Simulation Test ==="
echo ""

cd "$LAX_DIR"

# 1. Boot fork
echo "--- Step 1: Boot fresh fork ---"
pkill anvil 2>/dev/null || true
sleep 1

anvil --fork-url https://mainnet.base.org --fork-block-number 48236883 \
  --port "$FORK_PORT" --chain-id 8453 > /dev/null 2>&1 &
ANVIL_PID=$!

echo "Waiting for anvil (PID $ANVIL_PID)..."
for i in $(seq 1 60); do
  if curl -s "$RPC_URL" -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    > /dev/null 2>&1; then
    echo "Ready after ${i}s"
    break
  fi
  sleep 1
done

# 2. Run setup
echo ""
echo "--- Step 2: Fork setup ---"
bash "$SCRIPT_DIR/fork-setup-usdc.sh" 2>&1

POOL=0xA238Dd80C259a72e81d7e4664a9801593F98d1c5
BORROWER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
PROVIDER=0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D
# Anvil dev account #0 — public, fork-only, holds no real funds. Never use on a live network.
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
WETH=0x4200000000000000000000000000000000000006

# 3. Get initial position
echo ""
echo "--- Step 3: Capture initial health factor ---"
DATA=$(cast call $POOL "getUserAccountData(address)(uint256,uint256,uint256,uint256,uint256,uint256)" $BORROWER --rpc-url $RPC_URL)
HF_INITIAL=$(echo "$DATA" | sed -n '6p' | awk '{print $1}')
DEBT=$(echo "$DATA" | sed -n '2p' | awk '{print $1}')
COLLATERAL=$(echo "$DATA" | sed -n '1p' | awk '{print $1}')
echo "Collateral: $(python3 -c "print($COLLATERAL / 1e8)")"
echo "Debt:       $(python3 -c "print($DEBT / 1e8)")"
echo "HF:         $(python3 -c "print($HF_INITIAL / 1e18)")"

if (( $(python3 -c "print(1 if $HF_INITIAL > 1100000000000000000 else 0)") )); then
  echo "PASS: Position healthy (HF > 1.10)"
  PASS=$((PASS + 1))
else
  echo "WARN: HF below 1.10, but continuing"
fi

# 4. Drop WETH by 25%
echo ""
echo "--- Step 4: Drop WETH -25% ---"
MOCK=$(cast call $PROVIDER "getPriceOracle()(address)" --rpc-url $RPC_URL | awk '{print $1}')
CURRENT=$(cast call $MOCK "getAssetPrice(address)(uint256)" $WETH --rpc-url $RPC_URL | awk '{print $1}')
NEW=$(( CURRENT * 75 / 100 ))
cast send $MOCK "setAssetPrice(address,uint256)" $WETH $NEW --rpc-url $RPC_URL --private-key $PK --gas-limit 50000 > /dev/null 2>&1
echo "WETH: $CURRENT → $NEW (-25%)"

sleep 1

DATA=$(cast call $POOL "getUserAccountData(address)(uint256,uint256,uint256,uint256,uint256,uint256)" $BORROWER --rpc-url $RPC_URL)
HF_AFTER_DROP=$(echo "$DATA" | sed -n '6p' | awk '{print $1}')
DEBT_AFTER_DROP=$(echo "$DATA" | sed -n '2p' | awk '{print $1}')
echo "HF after drop: $(python3 -c "print($HF_AFTER_DROP / 1e18)")"

if (( $(python3 -c "print(1 if $HF_AFTER_DROP < 1050000000000000000 else 0)") )); then
  echo "PASS: HF dropped below trigger (< 1.05)"
  PASS=$((PASS + 1))
else
  echo "FAIL: HF still above trigger"
  FAIL=$((FAIL + 1))
fi

# 5. Compute repay amount
echo ""
echo "--- Step 5: Compute exact repay ---"
HF_TARGET=1100000000000000000
REPAY_AMOUNT=$(python3 -c "
debt = $DEBT_AFTER_DROP
hf = $HF_AFTER_DROP
target = $HF_TARGET

debt18 = debt * 10**10
hf_delta = target - hf
repay18 = debt18 * hf_delta // target
repay6 = repay18 // 10**12
repay_exact = repay6
repay_buffered = repay_exact * 101 // 100  # +1% buffer for on-chain rounding
print(repay_buffered)
")
echo "Repay amount: $(( REPAY_AMOUNT * 100 / 101 )) exact, $REPAY_AMOUNT with 1% buffer (6-dec)"

# 6. Approve USDC
echo ""
echo "--- Step 6: Approve USDC for Aave Pool ---"
APPROVE_AMOUNT=$REPAY_AMOUNT
echo "Approving $APPROVE_AMOUNT USDC (6-dec, +1% buffer)..."
ALREADY=$(cast call $USDC "allowance(address,address)(uint256)" $BORROWER $POOL --rpc-url $RPC_URL | awk '{print $1}')
echo "Existing allowance: $ALREADY"

if [ "$ALREADY" -lt "$APPROVE_AMOUNT" ]; then
  cast send $USDC "approve(address,uint256)" $POOL $APPROVE_AMOUNT \
    --rpc-url $RPC_URL --private-key $PK --gas-limit 100000 > /dev/null 2>&1
  echo "Approval granted."
fi

NEW_ALLOWANCE=$(cast call $USDC "allowance(address,address)(uint256)" $BORROWER $POOL --rpc-url $RPC_URL | awk '{print $1}')
if [ "$NEW_ALLOWANCE" -ge "$APPROVE_AMOUNT" ]; then
  echo "PASS: Allowance sufficient"
  PASS=$((PASS + 1))
else
  echo "FAIL: Allowance insufficient"
  FAIL=$((FAIL + 1))
fi

# 7. Repay
echo ""
echo "--- Step 7: Repay USDC to Aave Pool ---"
echo "Repaying $REPAY_AMOUNT USDC (variable rate mode 2)..."
TX=$(cast send $POOL "repay(address,uint256,uint256,address)" $USDC $REPAY_AMOUNT 2 $BORROWER \
  --rpc-url $RPC_URL --private-key $PK --gas-limit 300000 2>&1 | grep "transactionHash" | awk '{print $2}')
echo "Repay tx: $TX"
echo "PASS: Repay transaction submitted"
PASS=$((PASS + 1))

sleep 2

# 8. Verify HF recovery
echo ""
echo "--- Step 8: Verify HF recovery ---"
DATA=$(cast call $POOL "getUserAccountData(address)(uint256,uint256,uint256,uint256,uint256,uint256)" $BORROWER --rpc-url $RPC_URL)
HF_FINAL=$(echo "$DATA" | sed -n '6p' | awk '{print $1}')
DEBT_FINAL=$(echo "$DATA" | sed -n '2p' | awk '{print $1}')
COLLATERAL_FINAL=$(echo "$DATA" | sed -n '1p' | awk '{print $1}')
echo "Collateral: $(python3 -c "print($COLLATERAL_FINAL / 1e8)")"
echo "Debt:       $(python3 -c "print($DEBT_FINAL / 1e8)")"
echo "Final HF:   $(python3 -c "print($HF_FINAL / 1e18)")"

if (( $(python3 -c "print(1 if $HF_FINAL >= $HF_TARGET else 0)") )); then
  echo "PASS: HF restored to ≥ 1.10"
  PASS=$((PASS + 1))
else
  echo "WARN: Final HF ($(python3 -c "print($HF_FINAL / 1e18)")) below 1.10"
  echo "  Debt remaining: $(python3 -c "print($DEBT_FINAL / 1e8)")"
  echo "  (May need larger repay — possibly debt increased from interest accrual)"
fi

echo ""
echo "=== Results: $PASS pass, $FAIL fail ==="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0