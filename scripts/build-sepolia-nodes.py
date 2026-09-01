#!/usr/bin/env python3
"""Build the LAX Base Sepolia workflow nodes+edges JSON.

Emits {nodes, edges} to stdout (redirect to /tmp/lax-workflow-deploy-sepolia.json).
Kept as a standalone file so bash quoting can't corrupt the template references.
"""
import json
import os
import sys

NETWORK = "84532"
AAVE_POOL = "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27"
USDC = "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f"  # Aave's testnet USDC (NOT Circle's)

wallet_path = os.path.expanduser("~/.keeperhub/wallet.json")
default_borrower = json.load(open(wallet_path))["walletAddress"]
BORROWER = os.environ.get("LAX_BORROWER_ADDRESS", default_borrower)

nodes = [
    {
        "id": "trigger",
        "type": "trigger",
        "position": {"x": 0, "y": 50},
        "data": {"type": "trigger", "label": "Trigger", "config": {"triggerType": "Webhook"}},
    },
    {
        "id": "read_hf",
        "type": "action",
        "position": {"x": 250, "y": 50},
        "data": {
            "type": "action",
            "label": "Read HF",
            "config": {
                "actionType": "aave-v3/get-user-account-data",
                "network": NETWORK,
                "user": BORROWER,
            },
        },
    },
    {
        "id": "approve_usdc",
        "type": "action",
        "position": {"x": 500, "y": 50},
        "data": {
            "type": "action",
            "label": "Approve USDC",
            "config": {
                "actionType": "web3/approve-token",
                "network": NETWORK,
                "tokenConfig": json.dumps(
                    {"mode": "custom", "customToken": {"address": USDC, "symbol": "USDC"}}
                ),
                "spenderAddress": AAVE_POOL,
                "amount": "0.3",
            },
        },
    },
    {
        # Dynamic ({{...}}) amounts for aave-v3/repay are rejected at save-time
        # (uint256) and never resolve inside web3/write-contract functionArgs arrays
        # at runtime — so a static amount is used for the submission tx. HF reads stay
        # dynamic. Detected platform gaps (bounty candidates):
        #   1. aave-v3/repay uint256 amount rejects {{trigger.data.X}} templates on save.
        #   2. web3/write-contract functionArgs array elements don't resolve templates.
        "id": "repay",
        "type": "action",
        "position": {"x": 750, "y": 50},
        "data": {
            "type": "action",
            "label": "Repay",
            "config": {
                "actionType": "aave-v3/repay",
                "network": NETWORK,
                "asset": USDC,
                # 300000 base units = 0.3 USDC (6 decimals). Static — the platform can't
                # accept dynamic uint256 refs today. The approve_usdc node covers allowance.
                "amount": "300000",
                "interestRateMode": "2",
                "onBehalfOf": BORROWER,
            },
        },
    },
    {
        "id": "verify_hf",
        "type": "action",
        "position": {"x": 1000, "y": 50},
        "data": {
            "type": "action",
            "label": "Verify HF",
            "config": {
                "actionType": "aave-v3/get-user-account-data",
                "network": NETWORK,
                "user": BORROWER,
            },
        },
    },
]

edges = [
    {"id": "e1", "source": "trigger", "target": "read_hf"},
    {"id": "e2", "source": "read_hf", "target": "approve_usdc"},
    {"id": "e3", "source": "approve_usdc", "target": "repay"},
    {"id": "e4", "source": "repay", "target": "verify_hf"},
]

print(json.dumps({"nodes": nodes, "edges": edges}))
