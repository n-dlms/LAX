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

REPAY_ABI = [
    "function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) returns (uint256)"
]

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
                "amount": "{Trigger.body.repay_amount_human}",
            },
        },
    },
    {
        # aave-v3/repay rejects template refs in its uint256 amount at save-time
        # (422 INVALID_ACTION_CONFIG), so repay via raw contract call instead —
        # functionArgs templates are officially supported and resolve before JSON.parse.
        # The webhook body must send repay_amount_usdc as a JSON NUMBER.
        "id": "repay",
        "type": "action",
        "position": {"x": 750, "y": 50},
        "data": {
            "type": "action",
            "label": "Repay",
            "config": {
                "actionType": "web3/write-contract",
                "network": NETWORK,
                "contractAddress": AAVE_POOL,
                "abi": json.dumps(REPAY_ABI),
                "abiFunction": "repay",
                # functionArgs must be a real JSON array (API rejects stringified form);
                # the reference element resolves at run time to the webhook body value.
                "functionArgs": [USDC, "{Trigger.body.repay_amount_usdc}", 2, BORROWER],
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
