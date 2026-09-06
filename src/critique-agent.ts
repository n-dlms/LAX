import { CONFIG } from './config.js'
import { computeRepayAmount } from './repay-math.js'
import { simulateFullMitigation, simulateApprove } from './preflight-simulator.js'

export interface StageResult {
  stage: 1 | 2 | 3
  name: string
  passed: boolean
  detail: string
  durationMs: number
}

export interface CritiqueReport {
  passed: boolean
  stageResults: StageResult[]
  errors: string[]
  warnings: string[]
  summary: string
}

export interface CritiqueContext {
  currentHf: bigint
  targetHf: bigint
  totalDebtBase: bigint
  repayAmount: bigint
  repayToken: string
  walletAddress: string
  borrowerAddress: string
  poolAddress: string
  rpcUrl: string
}

const TOLERANCE_BPS = 10n
const STAGE_TIMEOUTS = {
  1: 500,
  2: 6000,
  3: 500,
} as const

const WALLET_ADDR_RE = /^0x[a-fA-F0-9]{40}$/

function stageResult(stage: 1 | 2 | 3, name: string, passed: boolean, detail: string, durationMs: number): StageResult {
  return { stage, name, passed, detail, durationMs }
}

function failOpenEnabled(): boolean {
  if (typeof process !== 'undefined' && process.env) {
    return process.env.LAX_CRITIQUE_FAIL_OPEN === 'true'
  }
  return false
}

function runStage<T>(stage: 1 | 2 | 3, name: string, fn: () => T, timeoutMs: number): { result: StageResult; value?: T } {
  const start = Date.now()
  let timedOut = false
  // A bare `throw` inside setTimeout is an uncaught exception that crashes the
  // process and can never be caught by the surrounding try/catch — so we set a
  // flag and check elapsed time after fn() returns instead.
  const timer = setTimeout(() => { timedOut = true }, timeoutMs)
  timer.unref?.()

  try {
    const value = fn()
    clearTimeout(timer)
    const durationMs = Date.now() - start
    if (timedOut) {
      return { result: stageResult(stage, name, false, `${name} timed out after ${timeoutMs}ms`, durationMs) }
    }
    return {
      result: stageResult(stage, name, true, `Passed (${durationMs}ms)`, durationMs),
      value,
    }
  } catch (err) {
    clearTimeout(timer)
    const durationMs = Date.now() - start
    const detail = err instanceof Error ? err.message : String(err)
    return {
      result: stageResult(stage, name, false, detail, durationMs),
    }
  }
}

export function runCritique(ctx: CritiqueContext): CritiqueReport {
  const errors: string[] = []
  const warnings: string[] = []
  const stageResults: StageResult[] = []

  const failOpen = failOpenEnabled()

  // Stage 1: HF Math Verification
  const stage1 = runStage(1, 'HF Math Verification', () => {
    const expected = computeRepayAmount(ctx.totalDebtBase, ctx.currentHf, ctx.targetHf)
    const tolerance = expected > 0n ? expected * TOLERANCE_BPS / 1000n : 1n

    if (expected === 0n && ctx.repayAmount > 0n) {
      warnings.push('Math: HF already above target but repayAmount > 0 — possible stale data')
      return
    }

    const diff = ctx.repayAmount > expected ? ctx.repayAmount - expected : expected - ctx.repayAmount
    if (diff > tolerance) {
      throw new Error(`Math mismatch: got ${ctx.repayAmount}, expected ~${expected} (diff ${diff} > tolerance ${tolerance})`)
    }
  }, STAGE_TIMEOUTS[1])

  stageResults.push(stage1.result)

  // Stage 2: Pre-flight Simulation
  const stage2 = runStage(2, 'Pre-flight Simulation', () => {
    const sim = simulateFullMitigation(
      ctx.borrowerAddress,
      ctx.repayToken,
      ctx.repayAmount,
      ctx.rpcUrl,
      ctx.walletAddress,
    )
    if (!sim.success) {
      throw new Error(`Simulation failed: ${sim.revertReason} (${sim.durationMs}ms)`)
    }
  }, STAGE_TIMEOUTS[2])

  stageResults.push(stage2.result)

  // Stage 3: Safety Bounds Check
  const stage3 = runStage(3, 'Safety Bounds Check', () => {
    if (ctx.repayAmount <= 0n) {
      throw new Error('Safety: repayAmount must be > 0')
    }

    if (!WALLET_ADDR_RE.test(ctx.walletAddress)) {
      throw new Error(`Safety: invalid wallet address: ${ctx.walletAddress}`)
    }

    if (!WALLET_ADDR_RE.test(ctx.borrowerAddress)) {
      throw new Error(`Safety: invalid borrower address: ${ctx.borrowerAddress}`)
    }

    const usdValue = Number(ctx.repayAmount) / 1e6
    if (usdValue > 1_000_000) {
      throw new Error('Safety: repay amount exceeds sanity cap of $1,000,000 — possible decimal overflow')
    }

    // Env overrides let a deployment size the caps to its positions (e.g. a
    // fork demo needs ~$32 repays); defaults keep the wallet-ops posture.
    const blockThreshold = Number(process.env.LAX_BLOCK_THRESHOLD_USD) || CONFIG.SAFETY.BLOCK_THRESHOLD_USD
    const dailyLimit = Number(process.env.LAX_DAILY_LIMIT_USD) || CONFIG.SAFETY.DAILY_LIMIT_USD

    if (usdValue > blockThreshold) {
      throw new Error(`Safety: $${usdValue.toFixed(2)} exceeds block threshold $${blockThreshold.toFixed(2)}`)
    }

    if (usdValue > dailyLimit) {
      warnings.push(`Safety: $${usdValue.toFixed(2)} exceeds daily limit $${dailyLimit.toFixed(2)}`)
    }
  }, STAGE_TIMEOUTS[3])

  stageResults.push(stage3.result)

  for (const w of warnings) {
    const stage = w.startsWith('Math') ? 1 : w.startsWith('Safety') ? 3 : 2
    stageResults.push(stageResult(stage as 1 | 2 | 3, 'Warning', true, w, 0))
  }

  const allPassed = stageResults.every((s) => s.passed)
  if (allPassed) {
    return {
      passed: true,
      stageResults,
      errors: [],
      warnings,
      summary: 'All 3 stages passed. Proceed with execution.',
    }
  }

  for (const s of stageResults) {
    if (!s.passed) {
      errors.push(`Stage ${s.stage} (${s.name}): ${s.detail}`)
    }
  }

  if (failOpen) {
    return {
      passed: true,
      stageResults,
      errors,
      warnings,
      summary: `FAIL_OPEN: ${errors.length} failure(s) ignored. Would have blocked: ${errors.join('; ')}`,
    }
  }

  return {
    passed: false,
    stageResults,
    errors,
    warnings,
    summary: `BLOCKED: ${errors.length} stage(s) failed. ${errors.join('; ')}`,
  }
}
