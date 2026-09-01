#!/usr/bin/env bash
set -euo pipefail

echo "Shutting down Anvil fork..."
pkill anvil 2>/dev/null || true
sleep 1
echo "Anvil stopped."