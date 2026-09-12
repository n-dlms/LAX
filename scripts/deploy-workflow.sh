#!/bin/bash
set -euo pipefail

# deploy-workflow.sh — Create or update the LAX KeeperHub workflow
#
# NOTE on amounts: the platform rejects `{{trigger.body.*}}` template refs at
# runtime (unresolved-reference abort), so the workflow carries a STATIC repay
# amount (default 40 USDC — sized to over-repair the seeded fork scenario).
# LAX's exact fire-time amount is computed in the payload and verified by the
# gate; the static/workflow-amount limitation is documented in
# docs/SUBMISSION-DRAFT.md ("what still breaks").

KEEPERHUB_API_KEY="${KEEPERHUB_API_KEY:?}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

WORKFLOW_NAME="lax-liquidation-armor"
WORKFLOW_ID="${LAX_WORKFLOW_ID:-}"

echo '=== LAX workflow deployment ==='

# Build nodes JSON using python for reliable JSON construction
NODES=$(python3 -c "
import json

nodes = [
  {
    'id': 'trigger', 'type': 'trigger',
    'position': {'x': 0, 'y': 50},
    'data': {'type': 'trigger', 'config': {'triggerType': 'Webhook'}}
  },
  {
    'id': 'read_hf', 'type': 'action',
    'position': {'x': 250, 'y': 50},
    'data': {
      'type': 'action',
      'config': {
        'actionType': 'aave-v3/get-user-account-data',
        'network': '8453',
        'user': '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      }
    }
  },
  {
    'id': 'approve_usdc', 'type': 'action',
    'position': {'x': 500, 'y': 50},
    'data': {
      'type': 'action',
      'config': {
        'actionType': 'web3/approve-token',
        'network': '8453',
        'tokenConfig': json.dumps({
          'mode': 'custom',
          'customToken': {
            'address': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            'symbol': 'USDC'
          }
        }),
        'spenderAddress': '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
        'amount': '${LAX_STATIC_REPAY_HUMAN:-40}'
      }
    }
  },
  {
    'id': 'repay', 'type': 'action',
    'position': {'x': 750, 'y': 50},
    'data': {
      'type': 'action',
      'config': {
        'actionType': 'aave-v3/repay',
        'network': '8453',
        'asset': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        'amount': '${LAX_STATIC_REPAY_USDC:-40000000}',
        'interestRateMode': '2',
        'onBehalfOf': '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      }
    }
  },
  {
    'id': 'verify_hf', 'type': 'action',
    'position': {'x': 1000, 'y': 50},
    'data': {
      'type': 'action',
      'config': {
        'actionType': 'aave-v3/get-user-account-data',
        'network': '8453',
        'user': '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      }
    }
  }
]

edges = [
  {'id': 'e1', 'source': 'trigger', 'target': 'read_hf'},
  {'id': 'e2', 'source': 'read_hf', 'target': 'approve_usdc'},
  {'id': 'e3', 'source': 'approve_usdc', 'target': 'repay'},
  {'id': 'e4', 'source': 'repay', 'target': 'verify_hf'}
]

print(json.dumps({'nodes': nodes, 'edges': edges}))
")

echo "$NODES" > /tmp/lax-workflow-deploy.json

if [ -z "$WORKFLOW_ID" ]; then
  echo "--- Creating new workflow ---"
  RESULT=$(kh workflow create \
    --name "$WORKFLOW_NAME" \
    --nodes-file /tmp/lax-workflow-deploy.json \
    --json 2>&1)
  WORKFLOW_ID=$(echo "$RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
  echo "Created workflow ID: $WORKFLOW_ID"
else
  echo "--- Updating existing workflow $WORKFLOW_ID ---"
  kh workflow update "$WORKFLOW_ID" --nodes-file /tmp/lax-workflow-deploy.json > /dev/null 2>&1
  echo "Updated workflow $WORKFLOW_ID"
fi

# Gas sponsorship is org-level credits (Settings → Billing), testnet uncharged —
# confirmed in Discord Sep 10, no event tag. Only attach a tag if explicitly
# provided: LAX_SPONSORSHIP_TAG=<tag> ./scripts/deploy-workflow.sh
if [ -n "${LAX_SPONSORSHIP_TAG:-}" ]; then
  SPONSORSHIP_TAG="${LAX_SPONSORSHIP_TAG}"
  echo "=== Attaching $SPONSORSHIP_TAG tag ==="
  TAG_JSON=$(kh tag create "$SPONSORSHIP_TAG" --json 2>/dev/null || kh tag get "$SPONSORSHIP_TAG" --json 2>&1)
  TAG_ID=$(echo "$TAG_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['id'] if isinstance(d, dict) else d[0]['id'])")

  curl -sf -X PATCH "https://app.keeperhub.com/api/workflows/$WORKFLOW_ID" \
    -H "Authorization: Bearer $KEEPERHUB_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"tagId\":\"$TAG_ID\"}" > /dev/null 2>&1 || echo "Tag attach skipped"

  echo "Tag: $SPONSORSHIP_TAG ($TAG_ID)"
else
  echo '=== Tag: skipped (sponsorship is org-level now; testnet uncharged) ==='
fi

echo '=== Done ==='
echo "export LAX_WORKFLOW_ID=$WORKFLOW_ID"