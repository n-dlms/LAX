#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.foundry/bin:${PATH}"

if ! command -v anvil >/dev/null 2>&1 || ! command -v cast >/dev/null 2>&1; then
  echo "ERROR: Foundry is not installed or not on PATH." >&2
  echo "Install it with: curl -L https://foundry.paradigm.xyz | bash && foundryup" >&2
  exit 1
fi

RPC_URL="${BASE_RPC_URL:-https://mainnet.base.org}"
FORK_BLOCK="${FORK_BLOCK:-48236883}"
PORT="${PORT:-18545}"
LOG_FILE="${LOG_FILE:-/tmp/lax-anvil.log}"

echo "Killing existing anvil (if any)..."
pkill anvil 2>/dev/null || true
sleep 1

echo "Booting Anvil fork of Base at block $FORK_BLOCK on port $PORT..."
mkdir -p /tmp/lax-anvil-state /tmp/lax-anvil-cache
anvil \
  --fork-url "$RPC_URL" \
  --fork-block-number "$FORK_BLOCK" \
  --chain-id 8453 \
  --block-time 1 \
  --port "$PORT" \
  --compute-units-per-second 600 \
  --state /tmp/lax-anvil-state \
  --max-persisted-states 5 \
  --cache-path /tmp/lax-anvil-cache \
  > "$LOG_FILE" 2>&1 &
ANVIL_PID=$!

echo "Waiting for Anvil to accept RPC calls (30s timeout)..."
for i in $(seq 1 30); do
  if cast block-number --rpc-url "http://127.0.0.1:$PORT" > /dev/null 2>&1; then
    echo "Anvil ready at http://127.0.0.1:$PORT"
    echo "Block: $(cast block-number --rpc-url "http://127.0.0.1:$PORT")"
    echo "PID: $ANVIL_PID"
    exit 0
  fi
  sleep 1
done

echo "ERROR: Anvil failed to start within 30s"
tail -20 "$LOG_FILE"
exit 1