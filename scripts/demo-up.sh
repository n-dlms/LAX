#!/usr/bin/env bash
# One command to bring the LAX demo up — idempotent, self-healing, safe to re-run.
#   fork up → position seeded → agentic wallet funded → health verified
# If the fork state is corrupt (unrecoverable position reads), it automatically
# wipes the saved state and re-boots from a fresh Base fork.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RPC="http://127.0.0.1:18545"
POOL=0xA238Dd80C259a72e81d7e4664a9801593F98d1c5
BORROWER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
export PATH="$HOME/.foundry/bin:${PATH}"

banner() { echo ""; echo "━━━ $1 ━━━"; }

fork_alive() {
  curl -s -m 2 -X POST "$RPC" -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' | grep -q result
}

# Position read works (fork warmed up and state not corrupt)
position_ok() {
  local raw
  raw=$(cast call $POOL "getUserAccountData(address)(uint256,uint256,uint256,uint256,uint256,uint256)" \
    $BORROWER --rpc-url "$RPC" 2>/dev/null | sed -n '6p' | awk '{print $1}')
  [ -n "$raw" ]
}

banner "LAX demo up"

echo "[1/4] Fork..."
if ! fork_alive; then
  echo "  booting Anvil fork of Base..."
  bash "$SCRIPT_DIR/start-fork.sh" | tail -1
fi

# Warm-up: freshly booted forks answer eth_blockNumber before forking is usable.
# Progress dots stream so the wait never looks like a hang.
WARM_OK=0
printf "  warming fork "
for i in $(seq 1 15); do
  if position_ok; then WARM_OK=1; break; fi
  printf "."
  sleep 2
done
printf "\n"

# Self-heal: if the position read never comes back, the saved anvil state is
# corrupt — wipe it and reboot from a fresh Base fork.
if [ "$WARM_OK" != "1" ]; then
  echo "  position unreadable — saved fork state is corrupt; rebuilding..."
  bash "$SCRIPT_DIR/fork-shutdown.sh" >/dev/null 2>&1 || true
  rm -rf /tmp/lax-anvil-state
  bash "$SCRIPT_DIR/start-fork.sh" | tail -1
  printf "  re-warming fork "
  for i in $(seq 1 20); do position_ok && break; printf "."; sleep 2; done
  printf "\n"
fi
echo "  fork healthy"

echo "[2/4] Seeding position... (deploys MockOracle + funds the position — ~15s)"
bash "$SCRIPT_DIR/fork-setup-usdc.sh" | tail -1

echo "[3/4] Funding agentic wallet... (impersonates + approves — ~5s)"
bash "$SCRIPT_DIR/fund-demo-wallet.sh" | tail -4

echo "[4/4] Health check..."
HF_RAW=$(cast call $POOL "getUserAccountData(address)(uint256,uint256,uint256,uint256,uint256,uint256)" $BORROWER --rpc-url "$RPC" | sed -n '6p' | awk '{print $1}')
HF=$(python3 -c "print(f'{$HF_RAW/10**18:.4f}')")
echo "  HF: $HF"
python3 -c "import sys; sys.exit(0 if $HF > 1.0 else 1)" || {
  echo "WARNING: HF $HF is at/below liquidation — run 'lax reset-price' or re-seed." >&2
}

banner "demo ready — fork $RPC · HF $HF"
echo "  dashboard:  cd dashboard && node node_modules/vite/bin/vite.js --host 0.0.0.0 --port 5173"
echo "  autopilot:  npm run lax -- autopilot daemon"
