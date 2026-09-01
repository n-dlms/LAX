#!/bin/bash
set -euo pipefail

# deploy-workflow-sepolia.sh — Create the LAX workflow on Base Sepolia (84532)
# for the real-transaction submission requirement. Zero-cost path per
# docs/zero-cost-testnet-plan.md: gas via sponsorship (org billing toggle),
# USDC position funded via wrap -> supply -> borrow (kh execute), then this
# workflow executes approve -> repay -> verify on the real testnet.
#
# Prereqs:
#   1. Fresh KEEPERHUB_API_KEY in .env (old one revoked — create at app.keeperhub.com)
#   2. Gas sponsorship enabled: Settings -> Billing (free on testnet)
#   3. Faucet ETH on the wallet: coinbase.com/developer-platform/products/faucet
#   4. Position funded: see docs/zero-cost-testnet-plan.md step 5 (kh execute contract-call)
#
# NOTE: new workflows are created DISABLED; this script enables via PATCH.

KEEPERHUB_API_KEY="${KEEPERHUB_API_KEY:?Set KEEPERHUB_API_KEY in .env}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

WORKFLOW_NAME="lax-liquidation-armor-sepolia"
WORKFLOW_ID="${LAX_WORKFLOW_ID_SEPOLIA:-}"

# Base Sepolia (84532) contracts — official Aave address book (AaveV3BaseSepolia)
NETWORK="84532"
AAVE_POOL="0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27"
USDC="0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f"   # Aave's testnet USDC (NOT Circle's)

# Borrower defaults to the agentic wallet itself — the wallet holds the Aave
# position it funds via supply/borrow, so it repays its own debt.
BORROWER="${LAX_BORROWER_ADDRESS:-$(cat ~/.keeperhub/wallet.json | python3 -c "import json,sys; print(json.load(sys.stdin)['walletAddress'])")}"

echo '=== LAX workflow deployment (Base Sepolia 84532) ==='
echo "Pool:    $AAVE_POOL"
echo "USDC:    $USDC"
echo "Borrower: $BORROWER"

NODES=$(python3 -c "
import json

network = '$NETWORK'
pool = '$AAVE_POOL'
usdc = '$USDC'
borrower = '$BORROWER'

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
        'network': network,
        'user': borrower
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
        'network': network,
        'tokenConfig': json.dumps({
          'mode': 'custom',
          'customToken': {'address': usdc, 'symbol': 'USDC'}
        }),
        'spenderAddress': pool,
        'amount': '{{trigger.body.repay_amount_human}}'
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
        'network': network,
        'asset': usdc,
        'amount': '{{trigger.body.repay_amount_usdc}}',
        'interestRateMode': '2',
        'onBehalfOf': borrower
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
        'network': network,
        'user': borrower
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

echo "$NODES" > /tmp/lax-workflow-deploy-sepolia.json

if [ -z "$WORKFLOW_ID" ]; then
  echo "--- Creating new workflow ---"
  RESULT=$(kh workflow create \
    --name "$WORKFLOW_NAME" \
    --nodes-file /tmp/lax-workflow-deploy-sepolia.json \
    --json 2>&1)
  WORKFLOW_ID=$(echo "$RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
  echo "Created workflow ID: $WORKFLOW_ID"
else
  echo "--- Updating existing workflow $WORKFLOW_ID ---"
  kh workflow update "$WORKFLOW_ID" --nodes-file /tmp/lax-workflow-deploy-sepolia.json > /dev/null 2>&1
  echo "Updated workflow $WORKFLOW_ID"
fi

# New workflows are created DISABLED (kh 0.15+ behavior) — enable it.
echo '=== Enabling workflow ==='
curl -sf -X PATCH "https://app.keeperhub.com/api/workflows/$WORKFLOW_ID" \
  -H "Authorization: Bearer $KEEPERHUB_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}' && echo "Enabled: yes" || echo "Enable PATCH failed — enable manually in the web app"

# Sponsorship tags are retired (org-level billing toggle now) — only attach if
# explicitly provided: LAX_SPONSORSHIP_TAG=<tag> ./scripts/deploy-workflow-sepolia.sh
if [ -n "${LAX_SPONSORSHIP_TAG:-}" ]; then
  echo "=== Attaching $LAX_SPONSORSHIP_TAG tag ==="
  TAG_JSON=$(kh tag create "$LAX_SPONSORSHIP_TAG" --json 2>/dev/null || kh tag get "$LAX_SPONSORSHIP_TAG" --json 2>&1)
  TAG_ID=$(echo "$TAG_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['id'] if isinstance(d, dict) else d[0]['id'])")
  curl -sf -X PATCH "https://app.keeperhub.com/api/workflows/$WORKFLOW_ID" \
    -H "Authorization: Bearer $KEEPERHUB_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"tagId\":\"$TAG_ID\"}" > /dev/null 2>&1 || echo "Tag attach skipped"
  echo "Tag: $LAX_SPONSORSHIP_TAG ($TAG_ID)"
else
  echo '=== Tag: skipped (sponsorship is org-level now; set LAX_SPONSORSHIP_TAG to override) ==='
fi

echo '=== Done ==='
echo "export LAX_WORKFLOW_ID_SEPOLIA=$WORKFLOW_ID"
echo "Webhook URL: https://app.keeperhub.com/api/workflows/$WORKFLOW_ID/webhook"