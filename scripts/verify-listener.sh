#!/bin/bash
set -euo pipefail

# verify-listener.sh — End-to-end verification of HF listener
# Does NOT use --state caching (Aave V3 time-dependent calcs break on restore)
# Runs entirely within one anvil session

export PATH="$HOME/.foundry/bin:$PATH"

FORK_PORT=18545
RPC_URL="http://127.0.0.1:$FORK_PORT"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAX_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LISTENER_LOG=$(mktemp /tmp/lax-listener-verify-XXXXXX.log)
PASS=0
FAIL=0

cleanup() {
  echo "=== Cleaning up ==="
  pkill -f "hf-listener.ts" 2>/dev/null || true
  pkill anvil 2>/dev/null || true
  rm -f "$LISTENER_LOG"
}

trap cleanup EXIT

echo "=== LAX HF Listener Verification Gate ==="
echo ""

cd "$LAX_DIR"

# Step 1: Kill any existing fork
echo "--- Step 1: Kill existing anvil ---"
pkill anvil 2>/dev/null || true
sleep 1

# Step 2: Start fresh fork (no state cache)
echo "--- Step 2: Boot fresh fork ---"
anvil \
  --fork-url https://mainnet.base.org \
  --fork-block-number 48236883 \
  --port "$FORK_PORT" \
  --chain-id 8453 \
  > /dev/null 2>&1 &
ANVIL_PID=$!

echo "Waiting for anvil (PID $ANVIL_PID) to start..."
ANVIL_READY=false
for i in $(seq 1 60); do
  if curl -s "$RPC_URL" -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    > /dev/null 2>&1; then
    echo "Anvil ready after ${i}s"
    ANVIL_READY=true
    break
  fi
  sleep 1
done

if [ "$ANVIL_READY" != "true" ]; then
  echo "FAIL: Anvil did not start within 60s"
  FAIL=$((FAIL + 1))
  exit 1
fi

# Step 3: Run full setup (deploy mock oracle, seed, create position)
echo ""
echo "--- Step 3: Run fork setup ---"
bash "$SCRIPT_DIR/fork-setup-usdc.sh" 2>&1

# Step 4: Verify position with healthy HF
echo ""
echo "--- Step 4: Verify position ---"
POOL="0xA238Dd80C259a72e81d7e4664a9801593F98d1c5"
BORROWER="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

get_hf_data() {
  cast call "$POOL" "getUserAccountData(address)(uint256,uint256,uint256,uint256,uint256,uint256)" \
    "$BORROWER" --rpc-url "$RPC_URL" 2>/dev/null || echo ""
}

DATA=$(get_hf_data)
FIELD1=$(echo "$DATA" | sed -n '1p' | awk '{print $1}')
FIELD6=$(echo "$DATA" | sed -n '6p' | awk '{print $1}')

if [ -z "$FIELD6" ] || [ "$FIELD6" = "0" ]; then
  echo "FAIL: Position not found after setup"
  FAIL=$((FAIL + 1))
  exit 1
fi

HF_NUM=$(python3 -c "print($FIELD6 / 1e18)")
echo "Collateral: $(python3 -c "print($FIELD1 / 1e8)") USD"
echo "Debt:       $(echo "$DATA" | sed -n '2p' | awk '{print $1}')"
echo "Initial HF: $HF_NUM"

if (( $(echo "$HF_NUM > 1.05" | bc -l) )); then
  echo "PASS: Position healthy (HF=$HF_NUM > 1.05)"
  PASS=$((PASS + 1))
else
  echo "FAIL: Position already unhealthy"
  FAIL=$((FAIL + 1))
fi

# Step 5: Start listener in background
echo ""
echo "--- Step 5: Start HF listener ---"
source .env 2>/dev/null || true
npx tsx "$SCRIPT_DIR/hf-listener.ts" > "$LISTENER_LOG" 2>&1 &
LISTENER_PID=$!
echo "Listener PID: $LISTENER_PID"

sleep 4
if grep -q "IDLE:" "$LISTENER_LOG"; then
  echo "PASS: Listener started and shows IDLE"
  PASS=$((PASS + 1))
  grep "IDLE:" "$LISTENER_LOG" | tail -1
else
  echo "FAIL: Listener did not show IDLE"
  cat "$LISTENER_LOG"
  FAIL=$((FAIL + 1))
fi

# Step 6: Drop oracle price by 25%
echo ""
echo "--- Step 6: Drop WETH price -25% ---"
PORT="$FORK_PORT" bash "$SCRIPT_DIR/drop-oracle-price.sh" -25 2>&1

echo "Price dropped. Waiting for listener to detect trigger..."
sleep 5

# Step 7: Verify TRIGGERED
echo ""
echo "--- Step 7: Check for TRIGGERED ---"
if grep -q "TRIGGERED:" "$LISTENER_LOG"; then
  echo "PASS: Listener detected trigger"
  PASS=$((PASS + 1))
  grep -E "(TRIGGERED|IDLE|ERROR)" "$LISTENER_LOG"
else
  echo "--- Listener log ---"
  cat "$LISTENER_LOG"
  echo ""
  # Check HF after drop manually
  echo "Manual HF check after drop:"
  DATA=$(get_hf_data)
  HF_CHECK=$(echo "$DATA" | sed -n '6p' | awk '{print $1}')
  if [ -n "$HF_CHECK" ] && [ "$HF_CHECK" != "0" ]; then
    echo "  HF: $(python3 -c "print($HF_CHECK / 1e18)")"
  else
    echo "  getUserAccountData reverted"
  fi
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Results: $PASS pass, $FAIL fail ==="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0