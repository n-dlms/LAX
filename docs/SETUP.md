# LAX Setup Guide

Get LAX running in 5 commands. Total time: ~5 minutes.

## Prerequisites

- **Node.js** >= 20 (`node --version`)
- **Foundry** (anvil/forge/cast), `curl -L https://foundry.paradigm.xyz | bash`
- **kh CLI** >= 0.10.0, `npm install -g @keeperhub/cli`
- **KeeperHub API key**, create at [app.keeperhub.com/settings/api](https://app.keeperhub.com/settings/api)
- **Python 3** (for state restoration)

## Quick Start

```bash
# 1. Clone and enter
git clone https://github.com/n-dlms/LAX.git lax
cd lax

# 2. One-click setup (handles everything)
./scripts/setup.sh
```

You'll be prompted for your KeeperHub API key. Paste it in, and the script handles:

1. Installing npm dependencies
2. Authenticating with KeeperHub
3. Provisioning a Turnkey wallet
4. Deploying the LAX workflow
5. Booting an Anvil fork of Base mainnet
6. Seeding mock oracle + USDC
7. Opening the dashboard at `http://localhost:5173`

## Daily Demo Boot (one command)

```bash
./scripts/demo-up.sh
```

Idempotent and self-healing: boots the Anvil fork of Base (or reuses a live one),
seeds the Aave position (skips if already seeded), funds the agentic wallet, and
health-checks the position read. If saved fork state is corrupt it rebuilds
automatically.

## Manual Setup

If you prefer step-by-step:

```bash
# 1. Install dependencies
npm install

# 2. Configure keys
cp .env.example .env
# Edit .env: KEEPERHUB_API_KEY (kh_*), KEEPERHUB_WEBHOOK_KEY (wfb_*, for live fires)

# 3. Boot the fork, seed the position, fund the wallet
./scripts/demo-up.sh

# 4. The Liquidation CLI (loads .env automatically)
npm run lax -- status        # HF gauge, live fork data
npm run lax                  # interactive REPL

# 5. Autopilot daemon (dry-run needs no keys; live fires the workflow)
npm run lax -- autopilot daemon --dry-run
npm run lax -- autopilot daemon

# 6. Dashboard (separate terminal)
cd dashboard && npm install && node node_modules/vite/bin/vite.js --host 0.0.0.0 --port 5173
```

## Demo Flow

1. Open `http://localhost:5173`. MonitorView shows HF ~1.10 (green)
2. `npm run lax -- arm`, arm the guardian
3. `npm run lax -- autopilot daemon`, boot the daemon (second terminal)
4. Simulate a price crash: `./scripts/drop-oracle-price.sh -28`
5. Watch the gate stages approve the fire, then the KeeperHub execution ID print
6. `./scripts/fire-sepolia.sh`, one real transaction on Base Sepolia (submission evidence)

The full verified-testing log (what was executed and what worked, with on-chain
evidence) is in [VERIFIED-TESTING.md](VERIFIED-TESTING.md). The complete CLI
reference is in [CLI-GUIDE.md](CLI-GUIDE.md).

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Dashboard shows "OFFLINE" | Anvil fork not running | `./scripts/start-fork.sh` |
| RPC error "connect ECONNREFUSED" | Anvil port 18545 in use | Kill existing: `pkill anvil`, then restart |
| "KEEPERHUB_API_KEY not set" | Missing .env file | `cp .env.example .env` and add your key |
| Workflow not found | Not deployed | `./scripts/deploy-workflow.sh` |
| HF listener exits immediately | One-shot mode (expected after trigger) | Re-run: `npx tsx scripts/hf-listener.ts` |
| Dashboard blank page | Missing npm install | `cd dashboard && npm install` |

## Offline Mode

If wifi drops during the demo:

```bash
# 1. Restore cached fork state (no RPC needed)
./scripts/fork-restore-state.sh

# 2. Dashboard shows cached position with "OFFLINE" banner
# 3. Oracle drops still work (local fork)
./scripts/drop-oracle-price.sh -28
```

## Running Tests

```bash
npm test              # 518 tests, 21 files (2 fork-live tests skip without a fork)
npm run lint          # tsc --noEmit (root)
npm run lint:dashboard  # tsc --noEmit -p dashboard
```
