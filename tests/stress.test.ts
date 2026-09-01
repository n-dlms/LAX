import { describe, it, expect, beforeEach } from 'vitest'
import { computeRepayAmount, hfToBigint, hfToNumber } from '../src/repay-math.js'
import { checkSafety, resetDailyCap, getDailySpend } from '../src/safety-plugin/guardrails.js'
import { computeOptimalMitigation } from '../src/counterfactual-optimizer.js'

function debtBase(usd: number): bigint {
  return BigInt(Math.round(usd * 1e8))
}

describe('stress tests', () => {
  describe('rapid HF poll simulation', () => {
    it('handles 1000 rapid computeRepayAmount calls without error', () => {
      for (let i = 0; i < 1000; i++) {
        const hf = 0.9 + (i % 200) / 1000
        const repay = computeRepayAmount(debtBase(1000), hfToBigint(hf), hfToBigint(1.10))
        expect(repay).toBeGreaterThanOrEqual(0n)
      }
    })

    it('handles varying debt amounts without error', () => {
      for (let i = 1; i <= 500; i++) {
        const repay = computeRepayAmount(debtBase(i), hfToBigint(1.04), hfToBigint(1.10))
        expect(repay).toBeGreaterThan(0n)
      }
    })
  })

  describe('safety plugin stress', () => {
    beforeEach(() => resetDailyCap())

    it('handles 1000 rapid safety checks without error', () => {
      for (let i = 0; i < 1000; i++) {
        const result = checkSafety('web3/write-contract', {
          data: `0x095ea7b3${i.toString(16).padStart(56, '0')}`,
        })
        expect(result.allowed).toBe(true)
      }
    })

    it('tracks daily spend across many small transfers', () => {
      for (let i = 0; i < 50; i++) {
        checkSafety('transfer', { value: (0.01e18).toString() })
      }
      expect(getDailySpend()).toBeCloseTo(0.5, 10)
    })

    it('resets daily cap correctly', () => {
      checkSafety('transfer', { value: (3.0e18).toString() })
      expect(getDailySpend()).toBeCloseTo(3.0, 10)
      resetDailyCap()
      expect(getDailySpend()).toBe(0)
    })
  })

  describe('multi-module Monte Carlo stress', () => {
    it('generates 1000 random valid positions and computes repay for each', () => {
      for (let i = 0; i < 1000; i++) {
        const hf = 0.95 + Math.random() * 0.25
        const debt = 100 + Math.random() * 9900
        const repay = computeRepayAmount(debtBase(debt), hfToBigint(hf), hfToBigint(1.10))
        expect(repay).toBeGreaterThanOrEqual(0n)
      }
    })

    it('verifies cross-consistency: computeRepayAmount matches formula for 500 random positions', () => {
      for (let i = 0; i < 500; i++) {
        const hfCurrent = 0.95 + Math.random() * 0.15
        const hfTargetVal = 1.10
        const debt = 100 + Math.random() * 9900
        const debtVal = debtBase(debt)
        const hfCurr = hfToBigint(hfCurrent)
        const hfTgt = hfToBigint(hfTargetVal)

        const result = computeRepayAmount(debtVal, hfCurr, hfTgt)

        const debt18 = debtVal * 10n ** 10n
        const hfDelta = hfTgt - hfCurr
        const repay18 = (debt18 * hfDelta) / hfTgt
        const expected = repay18 / 10n ** 12n

        expect(result).toBe(expected)
      }
    })

    it('agrees on repayCost between repay-math and counterfactual-optimizer for 500 random positions', () => {
      for (let i = 0; i < 500; i++) {
        const debtUSD = 1000 + Math.random() * 9000
        const totalDebtBase = debtBase(debtUSD)
        const hf = hfToBigint(0.98 + Math.random() * 0.15)
        const target = hfToBigint(1.10)

        const collaterals = [
          { tokenAddress: '0x1111111111111111111111111111111111111111', usdValue: debtUSD * 1.5, liquidationThreshold: 0.8 },
        ]
        const debts = [
          { tokenAddress: '0x2222222222222222222222222222222222222222', usdValue: debtUSD, liquidationThreshold: 0 },
        ]

        const result = computeOptimalMitigation(collaterals, debts, hf, target, totalDebtBase)
        const directRepay = computeRepayAmount(totalDebtBase, hf, target)
        const expectedRepayCost = Number(directRepay) / 1e6

        expect(result.repayCost).toBeCloseTo(expectedRepayCost, 10)
      }
    })

    it('verifies all repay costs are non-negative and finite for 200 random positions', () => {
      for (let i = 0; i < 200; i++) {
        const hf = 0.95 + Math.random() * 0.25
        const debt = 100 + Math.random() * 9900
        const totalDebtBase = debtBase(debt)

        const repay = computeRepayAmount(totalDebtBase, hfToBigint(hf), hfToBigint(1.10))
        expect(repay).toBeGreaterThanOrEqual(0n)

        const collaterals = [
          { tokenAddress: '0x1111111111111111111111111111111111111111', usdValue: debt * 1.5, liquidationThreshold: 0.8 },
        ]
        const debts = [
          { tokenAddress: '0x2222222222222222222222222222222222222222', usdValue: debt, liquidationThreshold: 0 },
        ]
        const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hf), hfToBigint(1.10), totalDebtBase)
        expect(result.repayCost).toBeGreaterThanOrEqual(0)
        expect(isFinite(result.repayCost)).toBe(true)
      }
    })

    it('verifies repay is positive for 200 random positions with tiny HF differences', () => {
      for (let i = 0; i < 200; i++) {
        const debt = 100 + Math.random() * 9900
        const hfDiff = 0.0001 + Math.random() * 0.0099
        const hfCurrent = 1.10 - hfDiff
        const hfTarget = 1.10

        const repay = computeRepayAmount(debtBase(debt), hfToBigint(hfCurrent), hfToBigint(hfTarget))
        expect(repay).toBeGreaterThan(0n)
      }
    })
  })

  describe('extreme numeric stress', () => {
    it('handles all BigInt params at MAX_SAFE_INTEGER without crashing', () => {
      const maxSafe = BigInt(Number.MAX_SAFE_INTEGER)
      const repay = computeRepayAmount(maxSafe, maxSafe, maxSafe)
      expect(repay).toBeGreaterThanOrEqual(0n)
    })

    it('handles all BigInt params at 0n without crashing and returns 0', () => {
      const repay = computeRepayAmount(0n, 0n, 0n)
      expect(repay).toBe(0n)
    })

    it('handles astronomically large debt (10^30)', () => {
      const hugeDebt = 10n ** 30n
      const hf = hfToBigint(1.05)
      const target = hfToBigint(1.10)
      const repay = computeRepayAmount(hugeDebt, hf, target)
      expect(repay).toBeGreaterThan(0n)
    })

    it('handles 10,000 sequential computeRepayAmount calls with varying params', () => {
      for (let i = 0; i < 10000; i++) {
        const debt = debtBase(100 + (i % 1000))
        const hf = 0.95 + (i % 200) / 1000
        const repay = computeRepayAmount(debt, hfToBigint(hf), hfToBigint(1.10))
        expect(repay).toBeGreaterThanOrEqual(0n)
      }
    }, 30000)

    it('hfToBigint roundtrips correctly for 1000 random HF values in [0.5, 5.0]', () => {
      for (let i = 0; i < 1000; i++) {
        const hf = 0.5 + Math.random() * 4.5
        const hfBig = hfToBigint(hf)
        const hfBack = hfToNumber(hfBig)
        expect(hfBack).toBeCloseTo(hf, 14)
      }
    })
  })

  describe('safety plugin additional stress', () => {
    beforeEach(() => resetDailyCap())

    it('tracks daily spend correctly across 500 rapid transfer approvals under threshold', () => {
      for (let i = 0; i < 500; i++) {
        const result = checkSafety('transfer', { value: (0.01e18).toString() })
        expect(result.allowed).toBe(true)
      }
      expect(getDailySpend()).toBeCloseTo(5.0, 10)
    })

    it('handles 100 rapid deny-list selector checks with different data', () => {
      for (let i = 0; i < 100; i++) {
        const selector = i % 2 === 0 ? '0x23b872dd' : '0x42842e0e'
        const result = checkSafety('web3/write-contract', {
          data: `${selector}${i.toString(16).padStart(56, '0')}`,
        })
        expect(result.allowed).toBe(false)
        expect(result.reason).toContain('DENIED')
      }
    })

    it('handles 50 rapid approve-list selector checks', () => {
      for (let i = 0; i < 50; i++) {
        const result = checkSafety('web3/write-contract', {
          data: `0x095ea7b3${i.toString(16).padStart(56, '0')}`,
        })
        expect(result.allowed).toBe(true)
      }
    })

    it('mixes allowed and denied operations — dailySpend only tracks transfers', () => {
      checkSafety('transfer', { value: (1.0e18).toString() })
      checkSafety('transfer', { value: (2.0e18).toString() })
      checkSafety('transfer', { value: (15.0e18).toString() })
      checkSafety('web3/write-contract', { data: `0x23b872dd${'0'.repeat(56)}` })
      checkSafety('web3/write-contract', { data: `0x095ea7b3${'0'.repeat(56)}` })
      expect(getDailySpend()).toBeCloseTo(3.0, 10)
    })
  })

  describe('repay math invariance stress', () => {
    it('gives the same result across 1000 calls for fixed debt and HF (deterministic)', () => {
      const debt = debtBase(5000)
      const hf = hfToBigint(1.05)
      const target = hfToBigint(1.10)
      const expected = computeRepayAmount(debt, hf, target)
      for (let i = 0; i < 1000; i++) {
        const repay = computeRepayAmount(debt, hf, target)
        expect(repay).toBe(expected)
      }
    })

    it('repay is monotonic with increasing debt for fixed HF', () => {
      const hf = hfToBigint(1.05)
      const target = hfToBigint(1.10)
      let prev = 0n
      for (let usdCents = 1; usdCents <= 100000; usdCents++) {
        const debt = debtBase(usdCents * 0.01)
        const repay = computeRepayAmount(debt, hf, target)
        expect(repay).toBeGreaterThanOrEqual(prev)
        prev = repay
      }
    }, 120000)

    it('verifies roundtrip property: two-step sum >= one-step and neither exceeds debt', () => {
      for (let i = 0; i < 100; i++) {
        const debt = debtBase(500 + Math.random() * 9500)
        const hfLow = 1.00 + Math.random() * 0.07
        const hfMid = hfLow + 0.02 + Math.random() * 0.03
        const hfHigh = hfMid + 0.01 + Math.random() * 0.02

        const R1 = computeRepayAmount(debt, hfToBigint(hfLow), hfToBigint(hfMid))
        const R2 = computeRepayAmount(debt, hfToBigint(hfMid), hfToBigint(hfHigh))
        const RDirect = computeRepayAmount(debt, hfToBigint(hfLow), hfToBigint(hfHigh))

        const debt6 = debt / 100n
        expect(R1 + R2).toBeGreaterThanOrEqual(RDirect)
        expect(R1 + R2).toBeLessThanOrEqual(debt6)
        expect(R1).toBeLessThanOrEqual(debt6)
        expect(R2).toBeLessThanOrEqual(debt6)
      }
    })
  })

  describe('edge-case stress', () => {
    it('returns 0n for 500 calls where hfCurrent equals hfTarget', () => {
      const target = hfToBigint(1.10)
      for (let i = 0; i < 500; i++) {
        const debt = debtBase(100 + Math.random() * 9900)
        const repay = computeRepayAmount(debt, target, target)
        expect(repay).toBe(0n)
      }
    })

    it('returns 0n for 500 calls where hfCurrent > hfTarget', () => {
      for (let i = 0; i < 500; i++) {
        const debt = debtBase(100 + Math.random() * 9900)
        const hfHigh = hfToBigint(1.15 + Math.random() * 0.30)
        const target = hfToBigint(1.10)
        const repay = computeRepayAmount(debt, hfHigh, target)
        expect(repay).toBe(0n)
      }
    })

    it('returns 0n for 500 calls where totalDebtBase is 0n', () => {
      for (let i = 0; i < 500; i++) {
        const hf = hfToBigint(0.95 + Math.random() * 0.25)
        const target = hfToBigint(1.10)
        const repay = computeRepayAmount(0n, hf, target)
        expect(repay).toBe(0n)
      }
    })
  })
})
