#!/usr/bin/env python3
"""List KeeperHub chains relevant to LAX (Base Sepolia primary).

Reads JSON from stdin (pipe curl output — Cloudflare blocks python-urllib directly):
  curl -s https://app.keeperhub.com/api/chains -H "Authorization: Bearer $KEEPERHUB_API_KEY" | python3 scripts/list-chains.py
"""
import json
import sys

chains = json.load(sys.stdin)

relevant = {84532, 8453, 11155111, 421614}
print(f"total chains: {len(chains)}")
for c in sorted(chains, key=lambda x: (not x["isTestnet"], x["chainId"])):
    mark = "  <== relevant" if c["chainId"] in relevant else ""
    kind = "TESTNET" if c["isTestnet"] else "MAINNET"
    enabled = str(c["isEnabled"]).lower()
    print(f"{c['chainId']:>10}  {kind}  enabled={enabled:<5}  {c['name']:<22} id={c['id']}{mark}")
