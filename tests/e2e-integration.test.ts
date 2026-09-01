import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { hfToBigint, computeRepayAmount } from '../src/repay-math.js'
import { runCritique } from '../src/critique-agent.js'

const mockSimulateFull = vi.fn()
const mockExecSync = vi.fn()

vi.mock('../src/preflight-simulator.js', () => ({
  simulateFullMitigation: (...args: unknown[]) => mockSimulateFull(...args),
  simulateApprove: vi.fn(),
}))

vi.mock('child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}))

const RPC = 'http://127.0.0.1:18545'
const WALLET = '0x8Bb7870242e75132Fd62265cA8ABF771d49C821C'
const BORROWER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const POOL = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5'

function debtBase(usd: number): bigint {
  return BigInt(Math.round(usd * 1e8))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSimulateFull.mockReturnValue({ success: true, stage: 'FULL', durationMs: 150 })
})

afterEach(() => {
  delete process.env.LAX_CRITIQUE_FAIL_OPEN
})

describe('E2E pipeline integration', () => {
  it('full pipeline: HF drops → critique passes → simulation invoked', () => {
    const simulationDebt = debtBase(90)
    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: simulationDebt,
      repayAmount: computeRepayAmount(simulationDebt, hfToBigint(1.04), hfToBigint(1.10)) * 101n / 100n,
      repayToken: TOKEN,
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: RPC,
    })

    expect(critique.passed).toBe(true)
    expect(mockSimulateFull).toHaveBeenCalledOnce()
  })

  it('full pipeline: HF drops → simulation fails → critique blocks', () => {
    mockSimulateFull.mockReturnValue({ success: false, stage: 'FULL', revertReason: 'APPROVE_FAILED: ERC20: insufficient balance', durationMs: 50 })

    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: debtBase(480),
      repayAmount: computeRepayAmount(debtBase(480), hfToBigint(1.04), hfToBigint(1.10)) * 101n / 100n,
      repayToken: TOKEN,
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: RPC,
    })

    expect(critique.passed).toBe(false)
    expect(critique.stageResults[1]!.passed).toBe(false)
  })

  it('full pipeline: math error → critique blocks before simulation', () => {
    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: debtBase(480),
      repayAmount: BigInt(999999999),
      repayToken: TOKEN,
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: RPC,
    })

    expect(critique.passed).toBe(false)
    expect(critique.stageResults[0]!.passed).toBe(false)
  })

  it('full pipeline: safety bound exceeded → critique blocks', () => {
    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: debtBase(480),
      repayAmount: BigInt(20_000_000), // $20 > $10 block threshold
      repayToken: TOKEN,
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: RPC,
    })

    expect(critique.passed).toBe(false)
    expect(critique.stageResults[2]!.passed).toBe(false)
  })

  it('full pipeline: RPC not local → critique reports FORK_REQUIRED', () => {
    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: debtBase(480),
      repayAmount: BigInt(545454),
      repayToken: TOKEN,
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: 'https://mainnet.base.org',
    })

    expect(critique.passed).toBe(false)
  })

  it('full pipeline: zero repay amount blocked at safety stage', () => {
    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: debtBase(480),
      repayAmount: 0n,
      repayToken: TOKEN,
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: RPC,
    })

    expect(critique.passed).toBe(false)
  })

  it('full pipeline: fail-open mode bypasses critique block', () => {
    process.env.LAX_CRITIQUE_FAIL_OPEN = 'true'
    mockSimulateFull.mockReturnValue({ success: false, stage: 'FULL', revertReason: 'APPROVE_FAILED', durationMs: 50 })

    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: debtBase(480),
      repayAmount: computeRepayAmount(debtBase(480), hfToBigint(1.04), hfToBigint(1.10)) * 101n / 100n,
      repayToken: TOKEN,
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: RPC,
    })

    expect(critique.passed).toBe(true)
    expect(critique.errors.length).toBeGreaterThan(0)
    expect(critique.summary).toContain('FAIL_OPEN')
    delete process.env.LAX_CRITIQUE_FAIL_OPEN
  })

  it('full pipeline: all stages report durations', () => {
    const durationDebt = debtBase(90)
    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: durationDebt,
      repayAmount: computeRepayAmount(durationDebt, hfToBigint(1.04), hfToBigint(1.10)) * 101n / 100n,
      repayToken: TOKEN,
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: RPC,
    })

    expect(critique.passed).toBe(true)
    for (const stage of critique.stageResults) {
      expect(stage.durationMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('full pipeline: invalid wallet address blocked at safety', () => {
    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: debtBase(480),
      repayAmount: BigInt(545454),
      repayToken: TOKEN,
      walletAddress: 'not-a-valid-address',
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: RPC,
    })

    expect(critique.passed).toBe(false)
  })

  // ---- NEW TESTS (A) Stage ordering and data flow ----

  it('stage results are in order [math, simulation, safety] with stage numbers 1, 2, 3', () => {
    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: debtBase(90),
      repayAmount: computeRepayAmount(debtBase(90), hfToBigint(1.04), hfToBigint(1.10)) * 101n / 100n,
      repayToken: TOKEN,
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: RPC,
    })

    expect(critique.stageResults[0]!.stage).toBe(1)
    expect(critique.stageResults[0]!.name).toBe('HF Math Verification')
    expect(critique.stageResults[1]!.stage).toBe(2)
    expect(critique.stageResults[1]!.name).toBe('Pre-flight Simulation')
    expect(critique.stageResults[2]!.stage).toBe(3)
    expect(critique.stageResults[2]!.name).toBe('Safety Bounds Check')
  })

  it('when stage 1 fails, stage 2 still runs and stage 3 still runs', () => {
    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: debtBase(90),
      repayAmount: 1_000_000n, // ~$1 — won't match expected ~$4.91, so stage 1 fails
      repayToken: TOKEN,
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: RPC,
    })

    // Stage 1 failed, but stages 2 and 3 still executed
    expect(critique.stageResults[0]!.passed).toBe(false)
    expect(critique.stageResults[1]!.passed).toBe(true)
    expect(critique.stageResults[2]!.passed).toBe(true)
    // All 3 stage results present
    expect(critique.stageResults.length).toBeGreaterThanOrEqual(3)
  })

  it('same repayAmount passed from critique input to simulateFullMitigation', () => {
    const repayAmount = computeRepayAmount(debtBase(90), hfToBigint(1.04), hfToBigint(1.10)) * 101n / 100n
    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: debtBase(90),
      repayAmount,
      repayToken: TOKEN,
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: RPC,
    })

    expect(critique.passed).toBe(true)
    expect(mockSimulateFull).toHaveBeenCalled()
    const callArgs = mockSimulateFull.mock.calls[0]!
    expect(callArgs[2]).toBe(repayAmount)
    expect(callArgs[0]).toBe(BORROWER)
    expect(callArgs[1]).toBe(TOKEN)
  })

  it('gasEstimate from mock simulation does not break critique', () => {
    mockSimulateFull.mockReturnValue({ success: true, stage: 'FULL', durationMs: 150, gasEstimate: 185000 })
    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: debtBase(90),
      repayAmount: computeRepayAmount(debtBase(90), hfToBigint(1.04), hfToBigint(1.10)) * 101n / 100n,
      repayToken: TOKEN,
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: RPC,
    })

    expect(critique.passed).toBe(true)
    expect(critique.stageResults[1]!.passed).toBe(true)
  })

  // ---- NEW TESTS (B) Comprehensive failure combinations ----

  it('all 3 stages pass with debt at $10 block threshold boundary', () => {
    const debt = debtBase(183.33)
    const repayAmount = computeRepayAmount(debt, hfToBigint(1.04), hfToBigint(1.10))
    // repayAmount should be ~$10 (at the boundary but not exceeding)
    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: debt,
      repayAmount,
      repayToken: TOKEN,
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: RPC,
    })

    expect(critique.passed).toBe(true)
    expect(critique.stageResults[0]!.passed).toBe(true)
    expect(critique.stageResults[1]!.passed).toBe(true)
    expect(critique.stageResults[2]!.passed).toBe(true)
    // Verify it's right at the boundary
    expect(Number(repayAmount) / 1e6).toBeLessThanOrEqual(10.0)
  })

  it('stage 1 passes, stage 2 fails (simulation revert), stage 3 passes', () => {
    mockSimulateFull.mockReturnValue({ success: false, stage: 'FULL', revertReason: 'EXECUTION_REVERTED', durationMs: 50 })
    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: debtBase(90),
      repayAmount: computeRepayAmount(debtBase(90), hfToBigint(1.04), hfToBigint(1.10)) * 101n / 100n,
      repayToken: TOKEN,
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: RPC,
    })

    expect(critique.stageResults[0]!.passed).toBe(true)
    expect(critique.stageResults[1]!.passed).toBe(false)
    expect(critique.stageResults[2]!.passed).toBe(true)
    expect(critique.passed).toBe(false)
  })

  it('all stages pass with daily limit warning ($6 repay amount)', () => {
    const debt = debtBase(110)
    const repayAmount = computeRepayAmount(debt, hfToBigint(1.04), hfToBigint(1.10))
    // With these params repayAmount should be exactly 6,000,000 ($6.00 > $5 daily limit)
    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: debt,
      repayAmount,
      repayToken: TOKEN,
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: RPC,
    })

    expect(critique.passed).toBe(true)
    expect(critique.warnings.length).toBeGreaterThan(0)
    expect(critique.warnings[0]).toContain('daily limit')
  })

  // ---- NEW TESTS (C) Summary string format ----

  it('summary contains "All 3 stages passed" when all pass', () => {
    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: debtBase(90),
      repayAmount: computeRepayAmount(debtBase(90), hfToBigint(1.04), hfToBigint(1.10)) * 101n / 100n,
      repayToken: TOKEN,
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: RPC,
    })

    expect(critique.summary).toContain('All 3 stages passed')
  })

  it('summary contains BLOCKED and stage error details when blocked', () => {
    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: debtBase(480),
      repayAmount: BigInt(20_000_000), // $20 > $10 block threshold
      repayToken: TOKEN,
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: RPC,
    })

    expect(critique.summary).toContain('BLOCKED')
    expect(critique.summary).toContain('Safety')
    expect(critique.summary).toContain('exceeds block threshold')
  })

  // ---- NEW TESTS (D) Fail-open edge cases ----

  it('fail-open with all stages passing — passed=true, errors=[], summary is not fail-open', () => {
    process.env.LAX_CRITIQUE_FAIL_OPEN = 'true'
    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: debtBase(90),
      repayAmount: computeRepayAmount(debtBase(90), hfToBigint(1.04), hfToBigint(1.10)) * 101n / 100n,
      repayToken: TOKEN,
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: RPC,
    })

    expect(critique.passed).toBe(true)
    expect(critique.errors.length).toBe(0)
    expect(critique.summary).not.toContain('FAIL_OPEN')
    expect(critique.summary).toContain('All 3 stages passed')
  })

  it('fail-open with exactly 1 stage failing — passed=true, errors has 1 entry, summary contains FAIL_OPEN', () => {
    process.env.LAX_CRITIQUE_FAIL_OPEN = 'true'
    mockSimulateFull.mockReturnValue({ success: false, stage: 'FULL', revertReason: 'EXECUTION_REVERTED', durationMs: 50 })
    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: debtBase(90),
      repayAmount: computeRepayAmount(debtBase(90), hfToBigint(1.04), hfToBigint(1.10)) * 101n / 100n,
      repayToken: TOKEN,
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: RPC,
    })

    expect(critique.passed).toBe(true)
    expect(critique.errors.length).toBe(1)
    expect(critique.summary).toContain('FAIL_OPEN')
  })
})
