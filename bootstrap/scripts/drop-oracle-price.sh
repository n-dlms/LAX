#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.foundry/bin:$PATH"

PCT_CHANGE="${1:--50}"
PORT="${PORT:-18545}"
RPC="http://127.0.0.1:$PORT"
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

POOL=0xA238Dd80C259a72e81d7e4664a9801593F98d1c5
PROVIDER=0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D
BORROWER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
WETH=0x4200000000000000000000000000000000000006

MOCK=$(cast call $PROVIDER "getPriceOracle()(address)" --rpc-url $RPC)

# Read current WETH price
CURRENT=$(cast call $MOCK "getAssetPrice(address)(uint256)" $WETH --rpc-url $RPC | awk '{print $1}')

echo "Current WETH price: $(echo "scale=2; $CURRENT / 100000000" | bc) USD"

NEW=$(( CURRENT * (100 + PCT_CHANGE) / 100 ))

echo "Dropping WETH by ${PCT_CHANGE}%..."
echo "  WETH/USD → $(echo "scale=2; $NEW / 100000000" | bc) USD"

cast send $MOCK "setAssetPrice(address,uint256)" $WETH $NEW \
  --rpc-url $RPC --private-key $PK --gas-limit 50000 > /dev/null 2>&1

echo ""
echo "Verifying..."
VERIFIED=$(cast call $MOCK "getAssetPrice(address)(uint256)" $WETH --rpc-url $RPC | awk '{print $1}')
echo "  WETH/USD = $VERIFIED ($(echo "scale=2; $VERIFIED / 100000000" | bc) USD)"

echo ""
echo "Borrower health factor..."
HF_RAW=$(cast call $POOL "getUserAccountData(address)(uint256,uint256,uint256,uint256,uint256,uint256)" $BORROWER --rpc-url $RPC | sed -n '6p' | awk '{print $1}')
echo "  HF: $(echo "scale=4; $HF_RAW / 10^18" | bc)"