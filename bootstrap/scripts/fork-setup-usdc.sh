#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.foundry/bin:$PATH"

PORT="${PORT:-18545}"
RPC="http://127.0.0.1:$PORT"

USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
WETH=0x4200000000000000000000000000000000000006
POOL=0xA238Dd80C259a72e81d7e4664a9801593F98d1c5
PROVIDER=0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D
PROVIDER_OWNER=0x9390B1735def18560c509E2d0bc090E9d6BA257a

WALLET=0x8Bb7870242e75132Fd62265cA8ABF771d49C821C
BORROWER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
# Anvil dev account #0 — public, fork-only, holds no real funds. Never use on a live network.
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

echo "=== LAX Fork Setup ==="

echo ""
echo "[1/5] Deploying mock price oracle..."
cd "$(dirname "$0")/.."
MOCK=$(forge create contracts/MockOracle.sol:LAXMockOracle \
  --private-key "$PK" --rpc-url "$RPC" --broadcast 2>&1 | grep "Deployed to:" | awk '{print $3}')
echo "  MockOracle deployed: $MOCK"

echo ""
echo "[2/5] Updating PoolAddressesProvider price oracle pointer..."
cast rpc anvil_impersonateAccount $PROVIDER_OWNER --rpc-url $RPC > /dev/null
cast send $PROVIDER "setPriceOracle(address)" $MOCK \
  --rpc-url $RPC --from $PROVIDER_OWNER --gas-limit 100000 --unlocked > /dev/null 2>&1
cast rpc anvil_stopImpersonatingAccount $PROVIDER_OWNER --rpc-url $RPC > /dev/null

ORACLE=$(cast call $PROVIDER "getPriceOracle()(address)" --rpc-url $RPC)
echo "  Price oracle now: $ORACLE"

echo ""
echo "[3/5] Setting oracle prices..."
cast send $MOCK "setAssetPrice(address,uint256)" $USDC 100000000 \
  --rpc-url $RPC --private-key $PK --gas-limit 50000 > /dev/null 2>&1
cast send $MOCK "setAssetPrice(address,uint256)" $WETH 330000000000 \
  --rpc-url $RPC --private-key $PK --gas-limit 50000 > /dev/null 2>&1

echo "  USDC price: $(cast call $MOCK "getAssetPrice(address)(uint256)" $USDC --rpc-url $RPC | awk '{print $1}')"
echo "  WETH price: $(cast call $MOCK "getAssetPrice(address)(uint256)" $WETH --rpc-url $RPC | awk '{print $1}')"

echo ""
echo "[4/5] Seeding USDC balances..."

# Seed wallet with 80 USDC
WALLET_SLOT=$(cast keccak256 $(cast abi-encode "x(address,uint256)" $WALLET 9))
cast rpc anvil_setStorageAt $USDC $WALLET_SLOT \
  "0x$(python3 -c "print(f'{80000000:064x}')")" \
  --rpc-url $RPC > /dev/null
echo "  Wallet USDC: $(cast call $USDC "balanceOf(address)(uint256)" $WALLET --rpc-url $RPC | awk '{print $1}')"

# Seed borrower with 10000 USDC
BORROWER_SLOT=$(cast keccak256 $(cast abi-encode "x(address,uint256)" $BORROWER 9))
cast rpc anvil_setStorageAt $USDC $BORROWER_SLOT \
  "0x$(python3 -c "print(f'{10000000000:064x}')")" \
  --rpc-url $RPC > /dev/null
echo "  Borrower USDC: $(cast call $USDC "balanceOf(address)(uint256)" $BORROWER --rpc-url $RPC | awk '{print $1}')"

echo ""
echo "[5/5] Creating Aave V3 position (HF ≈ 1.10 at \$3,300 WETH)..."

# Approve 500 USDC for pool supply (adds liquidity so we can borrow)
echo "  Approving 500 USDC for pool supply..."
cast send $USDC "approve(address,uint256)" $POOL 500000000 \
  --rpc-url $RPC --private-key $PK --gas-limit 100000 > /dev/null 2>&1

# Supply 500 USDC to pool (adds liquidity)
echo "  Supplying 500 USDC to pool..."
cast send $POOL "supply(address,uint256,address,uint16)" $USDC 500000000 $BORROWER 0 \
  --rpc-url $RPC --private-key $PK --gas-limit 300000 > /dev/null 2>&1

# Wrap 0.05 ETH to WETH
echo "  Wrapping 0.05 ETH to WETH..."
cast send $WETH --value 50000000000000000 "deposit()" \
  --rpc-url $RPC --private-key $PK --gas-limit 100000 > /dev/null 2>&1

# Approve WETH for Aave Pool
echo "  Approving WETH for Aave Pool..."
cast send $WETH "approve(address,uint256)" $POOL 50000000000000000 \
  --rpc-url $RPC --private-key $PK --gas-limit 100000 > /dev/null 2>&1

# Deposit 0.05 WETH as collateral
echo "  Depositing 0.05 WETH as collateral (≈\$165 at \$3,300)..."
cast send $POOL "deposit(address,uint256,address,uint16)" $WETH 50000000000000000 $BORROWER 0 \
  --rpc-url $RPC --private-key $PK --gas-limit 300000 > /dev/null 2>&1

# Borrow 480 USDC (variable rate) → HF ≈ 1.10
echo "  Borrowing 480 USDC (variable rate mode 2, HF target ≈ 1.10)..."
cast send $POOL "borrow(address,uint256,uint256,uint16,address)" $USDC 480000000 2 0 $BORROWER \
  --rpc-url $RPC --private-key $PK --gas-limit 300000 > /dev/null 2>&1

echo ""
echo "=== Position summary ==="
POS=$(cast call $POOL "getUserAccountData(address)(uint256,uint256,uint256,uint256,uint256,uint256)" $BORROWER --rpc-url $RPC)
COLL=$(echo "$POS" | sed -n '1p' | awk '{print $1}')
DEBT=$(echo "$POS" | sed -n '2p' | awk '{print $1}')
HF_RAW=$(echo "$POS" | sed -n '6p' | awk '{print $1}')
echo "Collateral base: $COLL"
echo "Debt base:       $DEBT"
echo "Health Factor:   $(echo "scale=4; $HF_RAW / 10^18" | bc)"

echo ""
echo "=== Fork setup complete ==="