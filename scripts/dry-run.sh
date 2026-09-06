#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# LAX — Dry Run
# Runs the full pipeline 5 times to verify
# idempotency and measure timing.
# ──────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN_LOG="/tmp/lax-dry-run.log"
PASS=0
FAIL=0

echo "LAX Dry Run — $(date)" | tee "$DRY_RUN_LOG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$DRY_RUN_LOG"

for i in {1..5}; do
  echo "" | tee -a "$DRY_RUN_LOG"
  echo "═══ Dry run $i/5 ═══" | tee -a "$DRY_RUN_LOG"
  START=$(date +%s)

  # 1. Kill any existing fork
  bash "$SCRIPT_DIR/fork-shutdown.sh" 2>/dev/null || true
  sleep 1

  # 2. Start fork
  bash "$SCRIPT_DIR/start-fork.sh" 2>&1 | tail -1 | tee -a "$DRY_RUN_LOG"

  # 3. Seed oracle + USDC (retry: the first setup right after boot can race
  #    the RPC readiness of the freshly forked node)
  SETUP_OK=0
  for setup_attempt in 1 2 3; do
    if bash "$SCRIPT_DIR/fork-setup-usdc.sh" 2>&1 | tail -1 | tee -a "$DRY_RUN_LOG"; then
      SETUP_OK=1
      break
    fi
    echo "  setup attempt $setup_attempt failed — retrying..." | tee -a "$DRY_RUN_LOG"
    sleep 3
  done
  [ "$SETUP_OK" = "1" ] || { echo "  setup failed 3x — aborting iteration" | tee -a "$DRY_RUN_LOG"; FAIL=$((FAIL+1)); continue; }

  # 4. Verify initial position (HF should be ~1.10)
  POOL=0xA238Dd80C259a72e81d7e4664a9801593F98d1c5
  BORROWER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  HF_RAW=""
  for attempt in $(seq 1 10); do
    HF_RAW=$(cast call $POOL "getUserAccountData(address)(uint256,uint256,uint256,uint256,uint256,uint256)" $BORROWER --rpc-url http://127.0.0.1:18545 2>/dev/null | sed -n '6p' | awk '{print $1}')
    [ -n "$HF_RAW" ] && break
    sleep 1
  done
  HF=$(echo "scale=4; $HF_RAW / 10^18" | bc)
  echo "  Initial HF: $HF" | tee -a "$DRY_RUN_LOG"

  # 5. Drop price by 5% (should move HF down but not trigger)
  bash "$SCRIPT_DIR/drop-oracle-price.sh" -5 2>&1 | tail -1 | tee -a "$DRY_RUN_LOG"

  # 6. Drop by another 23% (total -28%, should trigger HF < 1.05)
  bash "$SCRIPT_DIR/drop-oracle-price.sh" -23 2>&1 | tail -1 | tee -a "$DRY_RUN_LOG"

  # 7. Verify HF dropped
  HF_RAW2=""
  for attempt in $(seq 1 10); do
    HF_RAW2=$(cast call $POOL "getUserAccountData(address)(uint256,uint256,uint256,uint256,uint256,uint256)" $BORROWER --rpc-url http://127.0.0.1:18545 2>/dev/null | sed -n '6p' | awk '{print $1}')
    [ -n "$HF_RAW2" ] && break
    sleep 1
  done
  HF2=$(echo "scale=4; $HF_RAW2 / 10^18" | bc)
  echo "  HF after -28% drop: $HF2" | tee -a "$DRY_RUN_LOG"

  # 8. Run offline pipeline simulation
  echo "  Running offline pipeline simulation..." | tee -a "$DRY_RUN_LOG"
  bash "$SCRIPT_DIR/test-pipeline.sh" 2>&1 | tail -3 | tee -a "$DRY_RUN_LOG"
  PIPELINE_RESULT=${PIPESTATUS[0]}

  # 9. Cleanup
  bash "$SCRIPT_DIR/fork-shutdown.sh" 2>/dev/null || true

  END=$(date +%s)
  DURATION=$((END - START))

  if [ "$PIPELINE_RESULT" -eq 0 ]; then
    echo "  ✅ Dry run $i passed (${DURATION}s)" | tee -a "$DRY_RUN_LOG"
    PASS=$((PASS + 1))
  else
    echo "  ❌ Dry run $i FAILED (${DURATION}s)" | tee -a "$DRY_RUN_LOG"
    FAIL=$((FAIL + 1))
  fi
done

echo "" | tee -a "$DRY_RUN_LOG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$DRY_RUN_LOG"
echo "Results: $PASS passed, $FAIL failed" | tee -a "$DRY_RUN_LOG"
echo "Log: $DRY_RUN_LOG"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
