#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# LAX Minimal Starter — config
# Copy this directory into your project:
#   cp -r bootstrap/* .
# ──────────────────────────────────────────────

# Copy root-level files
cp bootstrap/package.json .
cp bootstrap/tsconfig.json .
cp bootstrap/.env.example .env

# Copy source files
cp -r bootstrap/src/* src/
cp -r bootstrap/scripts/* scripts/
cp -r bootstrap/contracts/* contracts/

echo "LAX starter copied. Run: npm install && ./scripts/setup.sh"
