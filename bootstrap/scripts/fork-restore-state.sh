#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.foundry/bin:$PATH"

PORT="${PORT:-18545}"
STATE_FILE="${1:-fork-state.json}"
LOG_FILE="/tmp/lax-anvil-offline.log"

if [ ! -f "$STATE_FILE" ]; then
  echo "ERROR: State file $STATE_FILE not found."
  echo "Run ./scripts/fork-save-state.sh first."
  exit 1
fi

echo "Killing existing anvil (if any)..."
pkill anvil 2>/dev/null || true
sleep 1

echo "Starting Anvil in offline mode (no fork) on port $PORT..."
anvil --chain-id 8453 --block-time 1 --port "$PORT" > "$LOG_FILE" 2>&1 &
ANVIL_PID=$!

echo "Waiting for Anvil..."
for i in $(seq 1 30); do
  if cast block-number --rpc-url "http://127.0.0.1:$PORT" > /dev/null 2>&1; then
    echo "Anvil ready."
    break
  fi
  sleep 1
done

echo "Loading fork state from $STATE_FILE..."
python3 -c "
import json, sys
with open('$STATE_FILE') as f:
    state = f.read()
rpc = {
    'jsonrpc': '2.0',
    'method': 'anvil_loadState',
    'params': [state],
    'id': 1
}
print(json.dumps(rpc))
" | curl -s -X POST -H "Content-Type: application/json" -d @- "http://127.0.0.1:$PORT" > /dev/null

echo ""
echo "Verifying restored state..."
echo "Block: $(cast block-number --rpc-url "http://127.0.0.1:$PORT")"

PROVIDER=0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D
MOCK=$(cast call $PROVIDER "getPriceOracle()(address)" --rpc-url "http://127.0.0.1:$PORT")
echo "Price oracle: $MOCK"

RPC_URL="http://127.0.0.1:$PORT"

if [ "$MOCK" != "0x0000000000000000000000000000000000000000" ]; then
  WETH_PRICE=$(cast call $MOCK "getAssetPrice(address)(uint256)" 0x4200000000000000000000000000000000000006 --rpc-url $RPC_URL | awk '{print $1}')
  echo "WETH price: $WETH_PRICE ($(echo "scale=2; $WETH_PRICE / 100000000" | bc) USD)"
fi

POOL=0xA238Dd80C259a72e81d7e4664a9801593F98d1c5
BORROWER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
HF_RAW=$(cast call $POOL "getUserAccountData(address)(uint256,uint256,uint256,uint256,uint256,uint256)" $BORROWER --rpc-url $RPC_URL | sed -n '6p' | awk '{print $1}')
echo "Borrower HF: $(echo "scale=4; $HF_RAW / 10^18" | bc)"

echo ""
echo "Offline mode ready. PID: $ANVIL_PID"