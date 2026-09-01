# LAX Setup Guide

Get LAX running in 5 commands. Total time: ~5 minutes.

## Prerequisites

- **Node.js** >= 18 (`node --version`)
- **Foundry** (anvil/forge/cast) — `curl -L https://foundry.paradigm.xyz | bash`
- **kh CLI** >= 0.10.0 — `npm install -g @keeperhub/cli`
- **KeeperHub API key** — create at [app.keeperhub.com/settings/api](https://app.keeperhub.com/settings/api)
- **Python 3** (for state restoration)

## Quick Start

```bash
# 1. Clone and enter
git clone <your-repo-url> lax
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

## Manual Setup

If you prefer step-by-step:

```bash
# 1. Install dependencies
npm install

# 2. Configure API key
cp .env.example .env
# Edit .env with your KEEPERHUB_API_KEY

# 3. Authenticate
kh auth login --with-token "$(grep KEEPERHUB_API_KEY .env | cut -d= -f2)"

# 4. Provision wallet
kh wallet add --name "lax-bot"

# 5. Deploy workflow
./scripts/deploy-workflow.sh

# 6. Start fork + seed
./scripts/start-fork.sh
./scripts/fork-setup-usdc.sh

# 7. Start dashboard (separate terminal)
cd dashboard && npm install && npx vite --host 0.0.0.0 --port 5173

# 8. Start HF listener (separate terminal)
npx tsx scripts/hf-listener.ts
```

## Demo Flow

1. Open `http://localhost:5173` — MonitorView shows HF ~1.10
2. Simulate a price crash: `./scripts/drop-oracle-price.sh -28`
3. Watch the HF bar drop from green → yellow → red
4. At HF ≤ 1.05, the dashboard auto-switches to MitigationView
5. Steps animate: Approve → Repay → Verify HF restored to ≥ 1.10
6. AuditView shows execution summary + KeeperHub link

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
npm test          # 27 tests, all pass
npm run typecheck # 0 errors
```
