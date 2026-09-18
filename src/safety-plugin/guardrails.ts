import { CONFIG } from '../config.js'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

interface SafetyConfig {
  block_threshold_usd: number
  daily_limit_usd: number
  denied_selectors: readonly string[]
}

const SELECTOR_LENGTH = 10

// Daily spend persists to disk so a restart cannot reset the cap.
const SAFETY_STATE_FILE = join(
  process.env.LAX_STATE_DIR || join(homedir(), '.lax'),
  'safety.json',
)

let dailySpend = 0
let dailyResetAt = Date.now()

try {
  const persisted = JSON.parse(readFileSync(SAFETY_STATE_FILE, 'utf8')) as { dailySpend?: number; dailyResetAt?: number }
  if (typeof persisted.dailySpend === 'number') dailySpend = persisted.dailySpend
  if (typeof persisted.dailyResetAt === 'number') dailyResetAt = persisted.dailyResetAt
} catch {
  /* first run or unreadable state — start fresh */
}

function persistDailySpend(): void {
  try {
    mkdirSync(join(SAFETY_STATE_FILE, '..'), { recursive: true })
    writeFileSync(SAFETY_STATE_FILE, JSON.stringify({ dailySpend, dailyResetAt }))
  } catch {
    /* best-effort persistence */
  }
}

// Env overrides size the caps to the deployment's positions; defaults keep
// the wallet-ops posture (same overrides as critique-agent stage 3).
function loadSafetyConfig(): SafetyConfig {
  return {
    block_threshold_usd: Number(process.env.LAX_BLOCK_THRESHOLD_USD) || CONFIG.SAFETY.BLOCK_THRESHOLD_USD,
    daily_limit_usd: Number(process.env.LAX_DAILY_LIMIT_USD) || CONFIG.SAFETY.DAILY_LIMIT_USD,
    denied_selectors: CONFIG.SAFETY.DENIED_SELECTORS,
  }
}

function resetDailyCapIfNeeded(): void {
  const now = Date.now()
  if (now - dailyResetAt > 86_400_000) {
    dailySpend = 0
    dailyResetAt = now
    persistDailySpend()
  }
}

export function resetDailyCap(): void {
  dailySpend = 0
  dailyResetAt = Date.now()
  persistDailySpend()
}

interface SafetyCheckResult {
  allowed: boolean
  reason: string | null
}

export function checkSafety(
  toolName: string,
  args: Record<string, unknown>,
  opts?: { record?: boolean },
): SafetyCheckResult {
  const safety = loadSafetyConfig()
  resetDailyCapIfNeeded()

  if (toolName === 'web3/write-contract') {
    const data = args.data as string | undefined
    if (data && data.length >= SELECTOR_LENGTH) {
      const selector = data.slice(0, SELECTOR_LENGTH)

      const denied = safety.denied_selectors.some((s) => s.toLowerCase() === selector.toLowerCase())
      if (denied) {
        return { allowed: false, reason: `SELECTOR_DENIED: ${selector}` }
      }

      if (selector.toLowerCase() !== CONFIG.SAFETY.ALLOWLIST_SELECTOR.toLowerCase()) {
        return { allowed: false, reason: `SELECTOR_NOT_ALLOWLISTED: ${selector}` }
      }
    }
    return { allowed: true, reason: null }
  }

  if (toolName === 'transfer') {
    const valueWei = BigInt(typeof args.value === 'string' ? args.value : '0')
    const usdValue = Number(valueWei) / 1e18

    if (usdValue > safety.block_threshold_usd) {
      return { allowed: false, reason: `BLOCK_THRESHOLD_EXCEEDED: $${usdValue.toFixed(2)} > $${safety.block_threshold_usd.toFixed(2)}` }
    }

    if (dailySpend + usdValue > safety.daily_limit_usd) {
      return { allowed: false, reason: `DAILY_CAP_EXCEEDED: $${(dailySpend + usdValue).toFixed(2)} > $${safety.daily_limit_usd.toFixed(2)} (spent $${dailySpend.toFixed(2)})` }
    }

    // dry-runs and gate checks may verify the cap without consuming budget
    if (opts?.record !== false) {
      dailySpend += usdValue
      persistDailySpend()
    }
    return { allowed: true, reason: null }
  }

  return { allowed: true, reason: null }
}

export function getDailySpend(): number {
  resetDailyCapIfNeeded()
  return dailySpend
}