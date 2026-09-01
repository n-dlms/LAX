#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# LAX — One-Click Setup
# ──────────────────────────────────────────────
# Usage: ./scripts/setup.sh
# First time? Just run this script — it handles everything.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "  ╔══════════════════════════════════════╗"
echo "  ║   LAX — One-Click Setup             ║"
echo "  ║   Keep Your Position Safe            ║"
echo "  ╚══════════════════════════════════════╝"
echo -e "${NC}"

# ── Step 1: Prerequisites ─────────────────────
echo -e "\n${YELLOW}[1/7] Checking prerequisites...${NC}"

PREREQ_OK=true

if ! command -v node &>/dev/null; then
  echo -e "  ${RED}✗ node not found. Install Node.js >=18 from https://nodejs.org${NC}"
  PREREQ_OK=false
else
  NODE_VER=$(node --version)
  echo -e "  ${GREEN}✓ Node${NC} $NODE_VER"
fi

if ! command -v anvil &>/dev/null && ! command -v ~/.foundry/bin/anvil &>/dev/null; then
  echo -e "  ${RED}✗ anvil not found. Install Foundry: curl -L https://foundry.paradigm.xyz | bash${NC}"
  PREREQ_OK=false
else
  echo -e "  ${GREEN}✓ Foundry (anvil/forge/cast)${NC}"
fi

if ! command -v kh &>/dev/null; then
  echo -e "  ${RED}✗ kh CLI not found. Install: npm install -g @keeperhub/cli${NC}"
  PREREQ_OK=false
else
  KH_VER=$(kh --version 2>&1 || echo "installed")
  echo -e "  ${GREEN}✓ kh CLI${NC} $KH_VER"
fi

if ! command -v python3 &>/dev/null; then
  echo -e "  ${RED}✗ python3 not found. Install Python 3.${NC}"
  PREREQ_OK=false
else
  echo -e "  ${GREEN}✓ python3${NC}"
fi

if [ "$PREREQ_OK" = false ]; then
  echo -e "\n${RED}Please install missing prerequisites and re-run.${NC}"
  exit 1
fi

# ── Step 2: NPM Install ───────────────────────
echo -e "\n${YELLOW}[2/7] Installing dependencies...${NC}"
npm install --loglevel=warn 2>&1 | tail -1
echo -e "  ${GREEN}✓ npm install complete${NC}"

# ── Step 3: API Key ───────────────────────────
echo -e "\n${YELLOW}[3/7] Configuring KeeperHub API key...${NC}"

if [ -f .env ] && grep -q KEEPERHUB_API_KEY .env 2>/dev/null; then
  echo -e "  ${GREEN}✓ Using existing .env${NC}"
else
  if [ -n "${KEEPERHUB_API_KEY:-}" ]; then
    echo "KEEPERHUB_API_KEY=$KEEPERHUB_API_KEY" > .env
    echo -e "  ${GREEN}✓ Using KEEPERHUB_API_KEY from environment${NC}"
  else
    echo -n "  Paste your KeeperHub API key (kh_K2...): "
    read -r API_KEY
    if [ -z "$API_KEY" ]; then
      echo -e "  ${RED}No API key provided. Create one at https://app.keeperhub.com/settings/api${NC}"
      exit 1
    fi
    echo "KEEPERHUB_API_KEY=$API_KEY" > .env
    echo -e "  ${GREEN}✓ API key saved to .env${NC}"
  fi
fi

# ── Step 4: KeeperHub Auth ────────────────────
echo -e "\n${YELLOW}[4/7] Authenticating with KeeperHub...${NC}"
source .env
kh auth login --with-token "$KEEPERHUB_API_KEY" 2>&1 | tail -1
echo -e "  ${GREEN}✓ Authenticated${NC}"

# ── Step 5: Wallet Provisioning ───────────────
echo -e "\n${YELLOW}[5/7] Provisioning wallet...${NC}"

# Check if wallet already exists
WALLET_ADDR=$(kh wallet list 2>/dev/null | grep -o '0x[0-9a-fA-F]\{40\}' | head -1 || true)
if [ -n "$WALLET_ADDR" ]; then
  echo -e "  ${GREEN}✓ Wallet exists: $WALLET_ADDR${NC}"
else
  echo "  Creating Turnkey wallet..."
  kh wallet add --name "lax-bot" 2>&1 | tail -1
  WALLET_ADDR=$(kh wallet list 2>/dev/null | grep -o '0x[0-9a-fA-F]\{40\}' | head -1)
  echo -e "  ${GREEN}✓ Wallet created: $WALLET_ADDR${NC}"
fi

# ── Step 6: Deploy Workflow ───────────────────
echo -e "\n${YELLOW}[6/7] Deploying KeeperHub workflow...${NC}"
if [ -f "$SCRIPT_DIR/deploy-workflow.sh" ]; then
  bash "$SCRIPT_DIR/deploy-workflow.sh" 2>&1 | tail -2
  echo -e "  ${GREEN}✓ Workflow deployed${NC}"
else
  echo -e "  ${YELLOW}⚠ deploy-workflow.sh not found — skipping.${NC}"
  echo "  Deploy manually: kh workflow create --file workflow-definition.json"
fi

# ── Step 7: Start Fork + Seed + Dashboard ─────
echo -e "\n${YELLOW}[7/7] Starting demo environment...${NC}"

echo "  Starting Anvil fork..."
bash "$SCRIPT_DIR/start-fork.sh" 2>&1 | tail -1

echo "  Seeding oracle + USDC..."
bash "$SCRIPT_DIR/fork-setup-usdc.sh" 2>&1 | tail -1

echo "  Opening dashboard..."
cd "$PROJECT_DIR/dashboard"
npx vite --host 0.0.0.0 --port 5173 &
DASHBOARD_PID=$!
echo "  Dashboard PID: $DASHBOARD_PID"

echo ""
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  LAX is ready!${NC}"
echo -e "  Dashboard: ${CYAN}http://localhost:5173${NC}"
echo -e "  HF listener: ${CYAN}npx tsx scripts/hf-listener.ts${NC}"
echo -e "  Trigger drop: ${CYAN}./scripts/drop-oracle-price.sh -28${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo ""
echo "  Press Ctrl+C to stop the dashboard."
echo "  Run ./scripts/fork-shutdown.sh to stop the Anvil fork."

# Wait for dashboard
wait $DASHBOARD_PID
