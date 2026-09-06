#!/bin/bash
# fire-sepolia.sh — one-shot REAL fire of the LAX workflow on Base Sepolia.
# This is the judge-safe live path: real testnet transactions, sponsored gas,
# tiny amounts. Produces the audit trail + tx links required by the submission.
#
# Usage: ./scripts/fire-sepolia.sh
# Requires in .env: KEEPERHUB_WEBHOOK_KEY (wfb_*) and LAX_WORKFLOW_ID_SEPOLIA.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

if [ -f .env ]; then set -a; source .env; set +a; fi
: "${KEEPERHUB_WEBHOOK_KEY:?Set KEEPERHUB_WEBHOOK_KEY (wfb_*) in .env}"
: "${LAX_WORKFLOW_ID_SEPOLIA:?Set LAX_WORKFLOW_ID_SEPOLIA in .env}"

API="https://app.keeperhub.com/api"
WF="$LAX_WORKFLOW_ID_SEPOLIA"

echo "=== LAX live fire — Base Sepolia workflow $WF ==="
RESP=$(curl -s -m 15 -X POST "$API/workflows/$WF/webhook" \
  -H "Authorization: Bearer $KEEPERHUB_WEBHOOK_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"reason\":\"live-fire\",\"triggeredAt\":\"$(date -u +%FT%TZ)\"}")
echo "$RESP"
EXEC=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('executionId',''))")
[ -n "$EXEC" ] || { echo "FIRE FAILED"; exit 1; }
echo ""
echo "Execution: $EXEC"
echo "Audit:     https://app.keeperhub.com/runs/$EXEC"

echo ""
echo "Waiting for completion..."
for i in $(seq 1 24); do
  ST=$(kh run status "$EXEC" 2>/dev/null | head -1 || true)
  echo "$ST" | grep -q "running\|pending" || { echo "$ST"; break; }
  sleep 5
done
kh run status "$EXEC" 2>&1 | sed -n '1,12p'
echo ""
echo "Done. Submission links above."
