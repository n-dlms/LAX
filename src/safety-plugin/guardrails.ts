import { CONFIG } from '../config.js'

interface SafetyConfig {
  block_threshold_usd: number
  daily_limit_usd: number
  denied_selectors: readonly string[]
}

let dailySpend = 0
let dailyResetAt = 0

const SELECTOR_LENGTH = 10

function loadSafetyConfig(): SafetyConfig {
  return {
    block_threshold_usd: CONFIG.SAFETY.BLOCK_THRESHOLD_USD,
    daily_limit_usd: CONFIG.SAFETY.DAILY_LIMIT_USD,
    denied_selectors: CONFIG.SAFETY.DENIED_SELECTORS,
  }
}

function resetDailyCapIfNeeded(): void {
  const now = Date.now()
  if (now - dailyResetAt > 86_400_000) {
    dailySpend = 0
    dailyResetAt = now
  }
}

export function resetDailyCap(): void {
  dailySpend = 0
  dailyResetAt = Date.now()
}

interface SafetyCheckResult {
  allowed: boolean
  reason: string | null
}

export function checkSafety(
  toolName: string,
  args: Record<string, unknown>,
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

    dailySpend += usdValue
    return { allowed: true, reason: null }
  }

  return { allowed: true, reason: null }
}

export function getDailySpend(): number {
  resetDailyCapIfNeeded()
  return dailySpend
}