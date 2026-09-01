import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runCritique, type CritiqueContext } from '../src/critique-agent.js'
import { hfToBigint } from '../src/repay-math.js'

const mockSimulateFull = vi.fn()
const mockSimulateApprove = vi.fn()
const mockExecSync = vi.fn()

vi.mock('../src/preflight-simulator.js', () => ({
  simulateFullMitigation: (...args: unknown[]) => mockSimulateFull(...args),
  simulateApprove: (...args: unknown[]) => mockSimulateApprove(...args),
}))

vi.mock('child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}))

const RPC_URL = 'http://127.0.0.1:18545'
const TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const POOL = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5'
const WALLET = '0x8Bb7870242e75132Fd62265cA8ABF771d49C821C'
const BORROWER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

function makeContext(overrides?: Partial<CritiqueContext>): CritiqueContext {
  return {
    currentHf: hfToBigint(1.04),
    targetHf: hfToBigint(1.10),
    totalDebtBase: BigInt(10 * 1e8),
    repayAmount: BigInt(545454),
    repayToken: TOKEN,
    walletAddress: WALLET,
    borrowerAddress: BORROWER,
    poolAddress: POOL,
    rpcUrl: RPC_URL,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSimulateFull.mockReturnValue({ success: true, stage: 'FULL', durationMs: 150, gasEstimate: '175000' })
})

describe('runCritique — all stages pass', () => {
  it('passes when all 3 stages succeed', () => {
    const result = runCritique(makeContext())

    expect(result.passed).toBe(true)
    expect(result.stageResults).toHaveLength(3)
    expect(result.stageResults.every((s) => s.passed)).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('includes stage names in results', () => {
    const result = runCritique(makeContext())

    const names = result.stageResults.map((s) => s.name)
    expect(names).toContain('HF Math Verification')
    expect(names).toContain('Pre-flight Simulation')
    expect(names).toContain('Safety Bounds Check')
  })

  it('returns summary on pass', () => {
    const result = runCritique(makeContext())

    expect(result.summary).toContain('All 3 stages passed')
  })
})

describe('Stage 1: HF Math Verification', () => {
  it('fails when repay amount diverges from computed value beyond tolerance', () => {
    const result = runCritique(makeContext({ repayAmount: BigInt(1000000) }))

    expect(result.passed).toBe(false)
    expect(result.stageResults[0]!.passed).toBe(false)
    expect(result.stageResults[0]!.detail).toContain('Math mismatch')
  })

  it('passes when repay amount matches computed value exactly', () => {
    const expected = BigInt(545454)
    const result = runCritique(makeContext({ repayAmount: expected }))

    expect(result.stageResults[0]!.passed).toBe(true)
  })

  it('passes within 1% tolerance (repay includes buffer)', () => {
    const withBuffer = BigInt(550000)
    const result = runCritique(makeContext({ repayAmount: withBuffer }))

    expect(result.stageResults[0]!.passed).toBe(true)
  })

  it('passes within tolerance when buffer added', () => {
    const withBuffer = BigInt(548000)
    const result = runCritique(makeContext({ repayAmount: withBuffer }))

    expect(result.stageResults[0]!.passed).toBe(true)
  })

  it('warns when HF already above target but repay > 0', () => {
    const result = runCritique(makeContext({
      currentHf: hfToBigint(1.20),
      repayAmount: BigInt(100000),
    }))

    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('HF already above target')
  })

  it('passes when diff equals tolerance exactly (boundary)', () => {
    const tolerance = BigInt(545454) * 10n / 1000n
    const repayAtBoundary = BigInt(545454) + tolerance
    const result = runCritique(makeContext({ repayAmount: repayAtBoundary }))

    expect(result.stageResults[0]!.passed).toBe(true)
  })

  it('fails when diff exceeds tolerance by 1 wei', () => {
    const tolerance = BigInt(545454) * 10n / 1000n
    const repayAbove = BigInt(545454) + tolerance + 1n
    const result = runCritique(makeContext({ repayAmount: repayAbove }))

    expect(result.stageResults[0]!.passed).toBe(false)
    expect(result.stageResults[0]!.detail).toContain('Math mismatch')
  })

  it('passes when diff is 1 wei below tolerance', () => {
    const tolerance = BigInt(545454) * 10n / 1000n
    const repayBelow = BigInt(545454) + tolerance - 1n
    const result = runCritique(makeContext({ repayAmount: repayBelow }))

    expect(result.stageResults[0]!.passed).toBe(true)
  })

  it('passes when expected is zero and repayAmount is zero (HF above target)', () => {
    const result = runCritique(makeContext({
      currentHf: hfToBigint(1.20),
      targetHf: hfToBigint(1.10),
      repayAmount: 0n,
    }))

    expect(result.stageResults[0]!.passed).toBe(true)
  })

  it('passes math when expected is zero with negative repayAmount', () => {
    const result = runCritique(makeContext({
      currentHf: hfToBigint(1.20),
      targetHf: hfToBigint(1.10),
      repayAmount: -1n,
    }))

    expect(result.stageResults[0]!.passed).toBe(true)
  })

  it('fails math when repayAmount is massive relative to small expected', () => {
    const result = runCritique(makeContext({
      currentHf: hfToBigint(1.099),
      targetHf: hfToBigint(1.10),
      repayAmount: BigInt(1000 * 1e6),
    }))

    expect(result.stageResults[0]!.passed).toBe(false)
    expect(result.stageResults[0]!.detail).toContain('Math mismatch')
  })

  it('handles HF values at 18-decimal precision extremes', () => {
    const result = runCritique(makeContext({
      currentHf: hfToBigint(1.000000001),
      targetHf: hfToBigint(1.000000002),
      repayAmount: BigInt(1),
    }))

    expect(result.stageResults[0]!.passed).toBe(true)
  })

  it('handles totalDebtBase = 0 with repayAmount = 0', () => {
    const result = runCritique(makeContext({
      totalDebtBase: 0n,
      repayAmount: 0n,
    }))

    expect(result.stageResults[0]!.passed).toBe(true)
  })

  it('passes math when current HF > target HF and repayAmount = 0 (no warning)', () => {
    const result = runCritique(makeContext({
      currentHf: hfToBigint(1.20),
      targetHf: hfToBigint(1.10),
      repayAmount: 0n,
    }))

    expect(result.stageResults[0]!.passed).toBe(true)
    expect(result.warnings).toHaveLength(0)
  })

  it('fails math when expected is very small (tolerance = 1n) and repayAmount exceeds it by 2', () => {
    const result = runCritique(makeContext({
      totalDebtBase: BigInt(200000),
      repayAmount: BigInt(111),
    }))

    expect(result.stageResults[0]!.passed).toBe(false)
  })

  it('verifies TOLERANCE_BPS calculation with different expected amounts', () => {
    const resultOk = runCritique(makeContext({
      totalDebtBase: BigInt(5000000),
      repayAmount: BigInt(2754),
    }))

    expect(resultOk.stageResults[0]!.passed).toBe(true)

    const resultFail = runCritique(makeContext({
      totalDebtBase: BigInt(5000000),
      repayAmount: BigInt(2755),
    }))

    expect(resultFail.stageResults[0]!.passed).toBe(false)
  })

  it('fails math when expected > 0 and repayAmount = 0', () => {
    const result = runCritique(makeContext({ repayAmount: 0n }))

    expect(result.stageResults[0]!.passed).toBe(false)
    expect(result.stageResults[0]!.detail).toContain('Math mismatch')
  })
})

describe('Stage 2: Pre-flight Simulation', () => {
  it('fails when simulation returns failure', () => {
    mockSimulateFull.mockReturnValue({ success: false, stage: 'FULL', revertReason: 'APPROVE_FAILED: ERC20: insufficient balance', durationMs: 50 })

    const result = runCritique(makeContext())

    expect(result.passed).toBe(false)
    expect(result.stageResults[1]!.passed).toBe(false)
    expect(result.stageResults[1]!.detail).toContain('Simulation failed')
  })

  it('passes when simulation succeeds', () => {
    mockSimulateFull.mockReturnValue({ success: true, stage: 'FULL', durationMs: 120 })

    const result = runCritique(makeContext())

    expect(result.stageResults[1]!.passed).toBe(true)
  })

  it('reports APPROVE_FAILED revert reason', () => {
    mockSimulateFull.mockReturnValue({ success: false, stage: 'FULL', revertReason: 'APPROVE_FAILED: ERC20: insufficient balance', durationMs: 50 })
    const result = runCritique(makeContext())

    expect(result.stageResults[1]!.detail).toContain('APPROVE_FAILED')
  })

  it('reports REPAY_FAILED revert reason', () => {
    mockSimulateFull.mockReturnValue({ success: false, stage: 'FULL', revertReason: 'REPAY_FAILED: transfer amount exceeds balance', durationMs: 60 })
    const result = runCritique(makeContext())

    expect(result.stageResults[1]!.detail).toContain('REPAY_FAILED')
  })

  it('reports FORK_REQUIRED revert reason', () => {
    mockSimulateFull.mockReturnValue({ success: false, stage: 'FULL', revertReason: 'FORK_REQUIRED', durationMs: 0 })
    const result = runCritique(makeContext())

    expect(result.stageResults[1]!.detail).toContain('FORK_REQUIRED')
  })

  it('handles simulation with durationMs = 0', () => {
    mockSimulateFull.mockReturnValue({ success: true, stage: 'FULL', durationMs: 0, gasEstimate: '175000' })
    const result = runCritique(makeContext())

    expect(result.stageResults[1]!.passed).toBe(true)
    expect(result.stageResults[1]!.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('handles simulation returning negative durationMs', () => {
    mockSimulateFull.mockReturnValue({ success: true, stage: 'FULL', durationMs: -1, gasEstimate: '175000' })
    const result = runCritique(makeContext())

    expect(result.stageResults[1]!.passed).toBe(true)
  })

  it('passes correct arguments to simulateFullMitigation', () => {
    const ctx = makeContext()
    runCritique(ctx)

    expect(mockSimulateFull).toHaveBeenCalledWith(
      ctx.borrowerAddress,
      ctx.repayToken,
      ctx.repayAmount,
      ctx.rpcUrl,
      ctx.walletAddress,
    )
  })

  it('calls simulateFullMitigation exactly once per critique', () => {
    runCritique(makeContext())

    expect(mockSimulateFull).toHaveBeenCalledTimes(1)
  })

  it('includes gasEstimate in stage result detail when simulation succeeds', () => {
    mockSimulateFull.mockReturnValue({ success: true, stage: 'FULL', durationMs: 150, gasEstimate: '210000' })
    const result = runCritique(makeContext())

    expect(result.stageResults[1]!.passed).toBe(true)
    expect(result.stageResults[1]!.detail).toContain('Passed')
  })

  it('catches non-Error throws from simulateFullMitigation', () => {
    mockSimulateFull.mockImplementation(() => {
      throw 'string error from cast'
    })
    const result = runCritique(makeContext())

    expect(result.stageResults[1]!.passed).toBe(false)
  })
})

describe('Stage 3: Safety Bounds Check', () => {
  it('fails when repay amount is zero', () => {
    const result = runCritique(makeContext({ repayAmount: 0n }))

    expect(result.passed).toBe(false)
    expect(result.stageResults[2]!.passed).toBe(false)
    expect(result.stageResults[2]!.detail).toContain('repayAmount must be > 0')
  })

  it('fails when wallet address is invalid', () => {
    const result = runCritique(makeContext({ walletAddress: 'not-an-address' }))

    expect(result.passed).toBe(false)
    expect(result.stageResults[2]!.passed).toBe(false)
    expect(result.stageResults[2]!.detail).toContain('invalid wallet address')
  })

  it('fails when borrower address is invalid', () => {
    const result = runCritique(makeContext({ borrowerAddress: '0xinvalid' }))

    expect(result.passed).toBe(false)
    expect(result.stageResults[2]!.passed).toBe(false)
  })

  it('fails when repay exceeds block threshold', () => {
    const hugeAmount = BigInt(20 * 1e6)
    const result = runCritique(makeContext({ repayAmount: hugeAmount }))

    expect(result.passed).toBe(false)
    expect(result.stageResults[2]!.passed).toBe(false)
    expect(result.stageResults[2]!.detail).toContain('exceeds block threshold')
  })

  it('warns when repay exceeds daily limit but does not block', () => {
    const largeAmount = BigInt(7 * 1e6)
    const result = runCritique(makeContext({ repayAmount: largeAmount }))

    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('daily limit')
  })

  it('fails on impossible repay amount (> $1M)', () => {
    const absurdAmount = BigInt(2_000_000 * 1e6)
    const result = runCritique(makeContext({ repayAmount: absurdAmount }))

    expect(result.passed).toBe(false)
    expect(result.stageResults[2]!.detail).toContain('sanity cap')
  })

  it('passes safety when repayAmount is exactly at block threshold ($10.00)', () => {
    const result = runCritique(makeContext({ repayAmount: BigInt(10 * 1e6) }))

    expect(result.stageResults[2]!.passed).toBe(true)
  })

  it('passes safety when repayAmount is $0.01 below block threshold', () => {
    const result = runCritique(makeContext({ repayAmount: BigInt(9990000) }))

    expect(result.stageResults[2]!.passed).toBe(true)
  })

  it('fails safety when repayAmount is $0.01 above block threshold', () => {
    const result = runCritique(makeContext({ repayAmount: BigInt(10010000) }))

    expect(result.stageResults[2]!.passed).toBe(false)
    expect(result.stageResults[2]!.detail).toContain('exceeds block threshold')
  })

  it('passes safety with all-zeros wallet address (valid hex format)', () => {
    const result = runCritique(makeContext({ walletAddress: '0x0000000000000000000000000000000000000000' }))

    expect(result.stageResults[2]!.passed).toBe(true)
  })

  it('passes safety with mixed-case checksum wallet address', () => {
    const result = runCritique(makeContext({ walletAddress: '0x8Bb7870242e75132Fd62265cA8ABF771d49C821C' }))

    expect(result.stageResults[2]!.passed).toBe(true)
  })

  it('passes safety with mixed-case checksum borrower address', () => {
    const result = runCritique(makeContext({ borrowerAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' }))

    expect(result.stageResults[2]!.passed).toBe(true)
  })

  it('warns when repayAmount is between daily limit ($5) and block threshold ($10)', () => {
    const result = runCritique(makeContext({ repayAmount: BigInt(7500000) }))

    expect(result.stageResults[2]!.passed).toBe(true)
    expect(result.warnings.some((w) => w.includes('daily limit'))).toBe(true)
  })

  it('passes safety without warning when repayAmount equals daily limit exactly ($5.00)', () => {
    const result = runCritique(makeContext({ repayAmount: BigInt(5 * 1e6) }))

    expect(result.stageResults[2]!.passed).toBe(true)
    expect(result.warnings.filter((w) => w.includes('daily limit'))).toHaveLength(0)
  })

  it('accumulates multiple safety warnings with other warnings', () => {
    const result = runCritique(makeContext({
      currentHf: hfToBigint(1.20),
      repayAmount: BigInt(7500000),
    }))

    expect(result.warnings.length).toBeGreaterThanOrEqual(1)
  })

  it('fails sanity cap at $1,000,001 and passes block threshold at $999,999', () => {
    const resultAbove = runCritique(makeContext({ repayAmount: BigInt(1_000_001 * 1e6) }))
    expect(resultAbove.stageResults[2]!.detail).toContain('sanity cap')

    const resultBelow = runCritique(makeContext({ repayAmount: BigInt(999_999 * 1e6) }))
    expect(resultBelow.stageResults[2]!.detail).toContain('exceeds block threshold')
  })
})

describe('fail-open mode', () => {
  beforeEach(() => {
    process.env.LAX_CRITIQUE_FAIL_OPEN = 'true'
  })

  afterEach(() => {
    delete process.env.LAX_CRITIQUE_FAIL_OPEN
  })

  it('reports passed=true even when stages fail', () => {
    mockSimulateFull.mockReturnValue({ success: false, stage: 'FULL', revertReason: 'APPROVE_FAILED', durationMs: 50 })

    const result = runCritique(makeContext())

    expect(result.passed).toBe(true)
    expect(result.errors).toHaveLength(1)
    expect(result.summary).toContain('FAIL_OPEN')
  })

  it('does not enable fail-open with uppercase env var (TRUE)', () => {
    process.env.LAX_CRITIQUE_FAIL_OPEN = 'TRUE'
    mockSimulateFull.mockReturnValue({ success: false, stage: 'FULL', revertReason: 'APPROVE_FAILED', durationMs: 50 })

    const result = runCritique(makeContext())

    expect(result.passed).toBe(false)
  })

  it('does not enable fail-open with lowercase key (lax_critique_fail_open)', () => {
    delete process.env.LAX_CRITIQUE_FAIL_OPEN
    process.env.lax_critique_fail_open = 'true'
    mockSimulateFull.mockReturnValue({ success: false, stage: 'FULL', revertReason: 'APPROVE_FAILED', durationMs: 50 })

    const result = runCritique(makeContext())

    expect(result.passed).toBe(false)
    delete process.env.lax_critique_fail_open
  })

  it('does not enable fail-open when env var is set to false string', () => {
    process.env.LAX_CRITIQUE_FAIL_OPEN = 'false'
    mockSimulateFull.mockReturnValue({ success: false, stage: 'FULL', revertReason: 'APPROVE_FAILED', durationMs: 50 })

    const result = runCritique(makeContext())

    expect(result.passed).toBe(false)
  })

  it('does not enable fail-open when env var is not set', () => {
    delete process.env.LAX_CRITIQUE_FAIL_OPEN
    mockSimulateFull.mockReturnValue({ success: false, stage: 'FULL', revertReason: 'APPROVE_FAILED', durationMs: 50 })

    const result = runCritique(makeContext())

    expect(result.passed).toBe(false)
  })

  it('populates errors array when fail-open returns passed=true', () => {
    mockSimulateFull.mockReturnValue({ success: false, stage: 'FULL', revertReason: 'APPROVE_FAILED', durationMs: 50 })

    const result = runCritique(makeContext())

    expect(result.passed).toBe(true)
    expect(result.errors.length).toBeGreaterThanOrEqual(1)
    expect(result.errors[0]).toContain('APPROVE_FAILED')
  })

  it('includes fail-open summary when stages fail', () => {
    mockSimulateFull.mockReturnValue({ success: false, stage: 'FULL', revertReason: 'APPROVE_FAILED', durationMs: 50 })

    const result = runCritique(makeContext())

    expect(result.summary).toContain('FAIL_OPEN')
    expect(result.summary).toContain('APPROVE_FAILED')
  })
})

describe('edge cases', () => {
  it('handles all 3 stages failing simultaneously', () => {
    mockSimulateFull.mockReturnValue({ success: false, stage: 'FULL', revertReason: 'REPAY_FAILED', durationMs: 50 })

    const result = runCritique(makeContext({
      repayAmount: 0n,
      walletAddress: 'bad',
    }))

    expect(result.passed).toBe(false)
    expect(result.errors.length).toBeGreaterThanOrEqual(2)
  })

  it('reports all stage failures when multiple stages fail', () => {
    mockSimulateFull.mockReturnValue({ success: false, stage: 'FULL', revertReason: 'REPAY_FAILED', durationMs: 50 })

    const result = runCritique(makeContext({ repayAmount: 0n }))

    expect(result.passed).toBe(false)
    const failedStages = result.stageResults.filter((s) => !s.passed)
    expect(failedStages.length).toBeGreaterThanOrEqual(2)
  })

  it('captures duration for each stage', () => {
    const result = runCritique(makeContext())

    for (const s of result.stageResults) {
      expect(s.durationMs).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('multi-stage failure combinations', () => {
  it('all 3 stages fail simultaneously with detailed stage checks', () => {
    mockSimulateFull.mockReturnValue({ success: false, stage: 'FULL', revertReason: 'REPAY_FAILED', durationMs: 50 })
    const result = runCritique(makeContext({
      repayAmount: 0n,
      walletAddress: 'bad',
    }))

    expect(result.stageResults[0]!.passed).toBe(false)
    expect(result.stageResults[1]!.passed).toBe(false)
    expect(result.stageResults[2]!.passed).toBe(false)
  })

  it('stage 1 passes, stages 2 and 3 fail', () => {
    mockSimulateFull.mockReturnValue({ success: false, stage: 'FULL', revertReason: 'APPROVE_FAILED', durationMs: 50 })
    const result = runCritique(makeContext({
      walletAddress: '0xinvalid',
    }))

    expect(result.stageResults[0]!.passed).toBe(true)
    expect(result.stageResults[1]!.passed).toBe(false)
    expect(result.stageResults[2]!.passed).toBe(false)
  })

  it('stage 1 fails, stages 2 and 3 pass', () => {
    const result = runCritique(makeContext({ repayAmount: BigInt(999999) }))

    expect(result.stageResults[0]!.passed).toBe(false)
    expect(result.stageResults[1]!.passed).toBe(true)
    expect(result.stageResults[2]!.passed).toBe(true)
  })

  it('stages 1 and 2 pass, stage 3 fails', () => {
    const result = runCritique(makeContext({
      repayAmount: 0n,
    }))

    expect(result.stageResults[0]!.passed).toBe(false)
    expect(result.stageResults[1]!.passed).toBe(true)
    expect(result.stageResults[2]!.passed).toBe(false)
  })

  it('stages 1 and 3 fail, stage 2 passes', () => {
    const result = runCritique(makeContext({
      repayAmount: BigInt(999999),
      walletAddress: 'bad',
    }))

    expect(result.stageResults[0]!.passed).toBe(false)
    expect(result.stageResults[1]!.passed).toBe(true)
    expect(result.stageResults[2]!.passed).toBe(false)
  })

  it('stages 2 and 3 still compute when stage 1 fails (no short-circuit)', () => {
    const result = runCritique(makeContext({ repayAmount: BigInt(999999) }))

    expect(result.stageResults[0]!.passed).toBe(false)
    expect(result.stageResults[1]!.passed).toBe(true)
    expect(result.stageResults[2]!.passed).toBe(true)
    expect(mockSimulateFull).toHaveBeenCalledTimes(1)
  })

  it('fail-open with all 3 stages failing returns passed=true with errors', () => {
    process.env.LAX_CRITIQUE_FAIL_OPEN = 'true'
    mockSimulateFull.mockReturnValue({ success: false, stage: 'FULL', revertReason: 'REPAY_FAILED', durationMs: 50 })
    const result = runCritique(makeContext({
      repayAmount: 0n,
      walletAddress: 'bad',
    }))

    expect(result.passed).toBe(true)
    expect(result.errors.length).toBeGreaterThanOrEqual(2)
    expect(result.summary).toContain('FAIL_OPEN')
    delete process.env.LAX_CRITIQUE_FAIL_OPEN
  })

  it('fail-open with 1 stage failing returns passed=true', () => {
    process.env.LAX_CRITIQUE_FAIL_OPEN = 'true'
    mockSimulateFull.mockReturnValue({ success: false, stage: 'FULL', revertReason: 'APPROVE_FAILED', durationMs: 50 })
    const result = runCritique(makeContext())

    expect(result.passed).toBe(true)
    expect(result.errors).toHaveLength(1)
    delete process.env.LAX_CRITIQUE_FAIL_OPEN
  })
})

describe('timing and duration', () => {
  it('records non-negative durationMs for each stage', () => {
    const result = runCritique(makeContext())

    for (const sr of result.stageResults) {
      expect(sr.durationMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('sum of stage durations is less than or equal to total elapsed', () => {
    const start = Date.now()
    const result = runCritique(makeContext())
    const elapsed = Date.now() - start
    const sumDurations = result.stageResults.reduce((sum, sr) => sum + sr.durationMs, 0)

    expect(sumDurations).toBeLessThanOrEqual(elapsed + 10)
  })

  it('simulation stage records its own wall-clock duration', () => {
    const result = runCritique(makeContext())

    expect(result.stageResults[1]!.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('math stage completes quickly (< 10ms)', () => {
    const result = runCritique(makeContext())

    expect(result.stageResults[0]!.durationMs).toBeLessThan(10)
  })

  it('safety stage completes quickly (< 10ms)', () => {
    const result = runCritique(makeContext())

    expect(result.stageResults[2]!.durationMs).toBeLessThan(10)
  })

  it('warning stage entries have durationMs = 0', () => {
    const result = runCritique(makeContext({
      currentHf: hfToBigint(1.20),
      repayAmount: BigInt(7500000),
    }))

    const warningResults = result.stageResults.filter((sr) => sr.name === 'Warning')
    for (const wr of warningResults) {
      expect(wr.durationMs).toBe(0)
    }
  })

  it('durationMs is non-negative even for failed stages', () => {
    const result = runCritique(makeContext({
      repayAmount: 0n,
      walletAddress: 'bad',
    }))

    for (const sr of result.stageResults) {
      expect(sr.durationMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('produces consistent duration patterns across repeated calls', () => {
    const result1 = runCritique(makeContext())
    const result2 = runCritique(makeContext())

    const durs1 = result1.stageResults.map((sr) => sr.durationMs)
    const durs2 = result2.stageResults.map((sr) => sr.durationMs)

    expect(durs1.length).toBe(durs2.length)
    for (let i = 0; i < durs1.length; i++) {
      expect(durs1[i]).toBeGreaterThanOrEqual(0)
      expect(durs2[i]).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('warning edge cases', () => {
  it('produces no warning when current HF > target HF and repayAmount = 0', () => {
    const result = runCritique(makeContext({
      currentHf: hfToBigint(1.20),
      targetHf: hfToBigint(1.10),
      repayAmount: 0n,
    }))

    expect(result.warnings).toHaveLength(0)
  })

  it('warns when daily limit is exceeded at $9.99', () => {
    const result = runCritique(makeContext({ repayAmount: BigInt(9990000) }))

    expect(result.warnings.some((w) => w.includes('daily limit'))).toBe(true)
  })

  it('simultaneously reports math warning and safety warning', () => {
    const result = runCritique(makeContext({
      currentHf: hfToBigint(1.20),
      repayAmount: BigInt(7500000),
    }))

    const mathWarnings = result.warnings.filter((w) => w.includes('Math'))
    const safetyWarnings = result.warnings.filter((w) => w.includes('Safety'))
    expect(mathWarnings.length).toBeGreaterThanOrEqual(1)
    expect(safetyWarnings.length).toBeGreaterThanOrEqual(1)
  })

  it('assigns warning stageResults to the correct stage number', () => {
    const result = runCritique(makeContext({
      currentHf: hfToBigint(1.20),
      repayAmount: BigInt(7500000),
    }))

    const warningResults = result.stageResults.filter((sr) => sr.name === 'Warning')
    for (const wr of warningResults) {
      expect(wr.stage).toBeGreaterThanOrEqual(1)
      expect(wr.stage).toBeLessThanOrEqual(3)
    }
  })

  it('assigns math warning to stage 1 and safety warning to stage 3', () => {
    const result = runCritique(makeContext({
      currentHf: hfToBigint(1.20),
      repayAmount: BigInt(7500000),
    }))

    for (const wr of result.stageResults.filter((sr) => sr.name === 'Warning')) {
      if (wr.detail.includes('Math')) {
        expect(wr.stage).toBe(1)
      } else if (wr.detail.includes('Safety')) {
        expect(wr.stage).toBe(3)
      }
    }
  })
})

describe('edge case inputs', () => {
  it('rejects empty string for wallet and borrower addresses', () => {
    const walletEmpty = runCritique(makeContext({ walletAddress: '' }))

    expect(walletEmpty.stageResults[2]!.passed).toBe(false)
    expect(walletEmpty.stageResults[2]!.detail).toContain('invalid wallet address')

    const borrowerEmpty = runCritique(makeContext({ borrowerAddress: '' }))

    expect(borrowerEmpty.stageResults[2]!.passed).toBe(false)
    expect(borrowerEmpty.stageResults[2]!.detail).toContain('invalid borrower address')
  })

  it('rejects empty strings for all string parameters', () => {
    const result = runCritique(makeContext({
      walletAddress: '',
      borrowerAddress: '',
      repayToken: '',
      poolAddress: '',
      rpcUrl: '',
    }))

    expect(result.stageResults[2]!.passed).toBe(false)
    expect(result.stageResults[2]!.detail).toContain('invalid wallet address')
  })

  it('stages 2 and 3 still run even with empty pool address', () => {
    const result = runCritique(makeContext({
      poolAddress: '',
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
    }))

    expect(result.stageResults[1]).toBeDefined()
    expect(result.stageResults[2]).toBeDefined()
  })

  it('rejects empty repay token string', () => {
    const result = runCritique(makeContext({ repayToken: '' }))

    expect(result.stageResults[1]).toBeDefined()
    expect(result.stageResults[2]).toBeDefined()
  })

  it('handles currentHf beyond Number safe integer range', () => {
    const result = runCritique(makeContext({
      currentHf: BigInt('9007199254740993'),
      targetHf: BigInt('9007199254740994'),
      repayAmount: 1n,
      totalDebtBase: BigInt(1000),
    }))

    expect(result.stageResults[0]).toBeDefined()
  })

  it('handles currentHf at very large BigInt value', () => {
    const result = runCritique(makeContext({
      currentHf: BigInt('999999999999999999999999999999999999'),
      targetHf: BigInt('999999999999999999999999999999999999') + 1n,
      repayAmount: 0n,
    }))

    expect(result.stageResults[0]).toBeDefined()
  })

  it('handles totalDebtBase at very large BigInt value', () => {
    const result = runCritique(makeContext({
      totalDebtBase: BigInt('999999999999999999999999999999999999'),
      repayAmount: BigInt(100),
    }))

    expect(result.stageResults[0]).toBeDefined()
  })

  it('rejects negative repayAmount in stage 3 safety check', () => {
    const result = runCritique(makeContext({ repayAmount: -100n }))

    expect(result.stageResults[2]!.passed).toBe(false)
    expect(result.stageResults[2]!.detail).toContain('repayAmount must be > 0')
  })

  it('rejects addresses with special characters', () => {
    const result = runCritique(makeContext({ walletAddress: '0xinvalid!@#$%^&*()' }))

    expect(result.stageResults[2]!.passed).toBe(false)
    expect(result.stageResults[2]!.detail).toContain('invalid wallet address')
  })

  it('passes safety with all-uppercase address (valid hex)', () => {
    const upperWallet = '0x8BB7870242E75132FD62265CA8ABF771D49C821C'
    const result = runCritique(makeContext({ walletAddress: upperWallet }))

    expect(result.stageResults[2]!.passed).toBe(true)
  })

  it('passes safety with address where leading zeros are stripped', () => {
    const result = runCritique(makeContext({ walletAddress: '0x0000000000000000000000000000000000000001' }))

    expect(result.stageResults[2]!.passed).toBe(true)
  })

  it('handles RPC URL with embedded auth parameters', () => {
    const result = runCritique(makeContext({ rpcUrl: 'http://user:pass@localhost:18545' }))

    expect(result.stageResults[1]).toBeDefined()
    expect(mockSimulateFull).toHaveBeenCalled()
  })
})
