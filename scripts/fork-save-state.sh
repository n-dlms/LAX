#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-18545}"
OUTPUT="${OUTPUT:-fork-state.json}"
RPC="http://127.0.0.1:$PORT"

STATE=$(cast rpc anvil_dumpState --rpc-url $RPC)
echo "$STATE" > "$OUTPUT"
echo "Saved fork state to $OUTPUT ($(wc -c < "$OUTPUT") bytes)"