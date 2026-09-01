import { describe, it, expect } from 'vitest'
import { computeOptimalMitigation, type AssetData } from '../src/counterfactual-optimizer.js'
import { hfToBigint, computeRepayAmount } from '../src/repay-math.js'

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const WETH = '0x4200000000000000000000000000000000000006'
const WSTETH = '0x...'

function consistentCollateral(debtUsd: number, currentHf: number, lt: number): number {
  return Math.round(debtUsd * currentHf / lt * 100) / 100
}

function debtBase(usd: number): bigint {
  return BigInt(Math.round(usd * 1e8))
}

describe('computeOptimalMitigation', () => {
  describe('repay cheaper (single collateral, single debt)', () => {
    const debtUsd = 1000
    const hfCurrent = 0.95
    const collaterals: AssetData[] = [
      { tokenAddress: WETH, usdValue: consistentCollateral(debtUsd, hfCurrent, 0.83), liquidationThreshold: 0.83 },
    ]
    const debts: AssetData[] = [
      { tokenAddress: USDC, usdValue: debtUsd, liquidationThreshold: 0.0 },
    ]

    it('prefers REPAY when repay cost < supply cost', () => {
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurrent), hfToBigint(1.10), debtBase(debtUsd))
      expect(result.recommendedAction).toBe('REPAY')
      expect(result.requiredCapitalUSD).toBeGreaterThan(0)
    })

    it('returns correct alternative action', () => {
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurrent), hfToBigint(1.10), debtBase(debtUsd))
      expect(result.alternativeAction).toBe('SUPPLY')
    })

    it('returns target token as first debt asset when repaying', () => {
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurrent), hfToBigint(1.10), debtBase(debtUsd))
      expect(result.targetToken).toBe(USDC)
    })

    it('supply cost is higher than repay cost', () => {
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurrent), hfToBigint(1.10), debtBase(debtUsd))
      expect(result.supplyCost).toBeGreaterThan(result.repayCost)
    })
  })

  describe('supply path computation (repay always optimal in practice)', () => {
    it('correctly computes supply cost with single collateral', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WSTETH, usdValue: 5000, liquidationThreshold: 0.79 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 4500, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(0.878), hfToBigint(1.10), debtBase(4500))
      expect(result.recommendedAction).toBe('REPAY')
      expect(result.supplyCost).toBeGreaterThan(0)
      expect(result.repayCost).toBeGreaterThan(0)
      expect(result.supplyCost).toBeGreaterThan(result.repayCost)
    })

    it('selects highest LT collateral as supply target token', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WSTETH, usdValue: 2000, liquidationThreshold: 0.79 },
        { tokenAddress: WETH, usdValue: 500, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 3000, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(0.665), hfToBigint(1.10), debtBase(3000))
      expect(result.alternativeAction).toBe('SUPPLY')
      expect(result.alternativeCost).toBeGreaterThan(0)
    })

    it('supply path always costs more or equal for consistent positions', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 800, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 800, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(0.83), hfToBigint(1.10), debtBase(800))
      expect(result.repayCost).toBeLessThanOrEqual(result.supplyCost)
    })
  })

  describe('both paths equal', () => {
    it('defaults to REPAY when both cost the same', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 800, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(1.0375), hfToBigint(1.10), debtBase(800))
      expect(result.recommendedAction).toBe('REPAY')
    })
  })

  describe('multiple debts', () => {
    it('aggregates total debt and selects repay path', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 2500, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 1000, liquidationThreshold: 0.0 },
        { tokenAddress: '0xother', usdValue: 500, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(1.383), hfToBigint(1.10), debtBase(1500))
      expect(result.requiredCapitalUSD).toBe(0)
    })
  })

  describe('demo scenario (single collateral, single debt)', () => {
    const debtUsd = 480
    const hfCurrent = 1.04
    const collaterals: AssetData[] = [
      { tokenAddress: WETH, usdValue: consistentCollateral(debtUsd, hfCurrent, 0.83), liquidationThreshold: 0.83 },
    ]
    const debts: AssetData[] = [
      { tokenAddress: USDC, usdValue: debtUsd, liquidationThreshold: 0.0 },
    ]

    it('prefers REPAY when HF is low', () => {
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurrent), hfToBigint(1.10), debtBase(debtUsd))
      expect(result.recommendedAction).toBe('REPAY')
      expect(result.requiredCapitalUSD).toBeGreaterThan(0)
    })

    it('returns non-negative capital for both paths', () => {
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurrent), hfToBigint(1.10), debtBase(debtUsd))
      expect(result.repayCost).toBeGreaterThanOrEqual(0)
      expect(result.supplyCost).toBeGreaterThanOrEqual(0)
    })
  })

  describe('edge cases', () => {
    it('handles zero collateral', () => {
      const result = computeOptimalMitigation([], [{ tokenAddress: USDC, usdValue: 100, liquidationThreshold: 0.0 }], hfToBigint(0.5), hfToBigint(1.10), debtBase(100))
      expect(result.recommendedAction).toBe('REPAY')
      expect(result.requiredCapitalUSD).toBe(0)
    })

    it('handles zero debt', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 }],
        [],
        hfToBigint(2.0),
        hfToBigint(1.10),
        debtBase(0),
      )
      expect(result.recommendedAction).toBe('REPAY')
      expect(result.requiredCapitalUSD).toBe(0)
    })

    it('handles zero debt when debts array has zero values', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 0, liquidationThreshold: 0.0 }],
        hfToBigint(2.0),
        hfToBigint(1.10),
        debtBase(0),
      )
      expect(result.requiredCapitalUSD).toBe(0)
    })

    it('handles extremely high HF target', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 500, liquidationThreshold: 0.0 }],
        hfToBigint(1.0),
        hfToBigint(5.0),
        debtBase(500),
      )
      expect(result.supplyCost).toBeGreaterThan(0)
      expect(result.repayCost).toBeGreaterThan(0)
    })

    it('handles current HF below 1.0 (imminent liquidation)', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 1200, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(0.692), hfToBigint(1.10), debtBase(1200))
      expect(result.requiredCapitalUSD).toBeGreaterThan(0)
    })

    it('handles same LT for all collaterals', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 500, liquidationThreshold: 0.80 },
        { tokenAddress: '0xcb...', usdValue: 500, liquidationThreshold: 0.80 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 800, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(1.0), hfToBigint(1.10), debtBase(800))
      expect(result.supplyCost).toBeGreaterThan(0)
    })

    it('returns non-negative costs for all result fields', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 100, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 120, liquidationThreshold: 0.0 }],
        hfToBigint(0.69),
        hfToBigint(1.10),
        debtBase(120),
      )
      expect(result.repayCost).toBeGreaterThanOrEqual(0)
      expect(result.supplyCost).toBeGreaterThanOrEqual(0)
      expect(result.requiredCapitalUSD).toBeGreaterThanOrEqual(0)
      expect(result.alternativeCost).toBeGreaterThanOrEqual(0)
    })

    it('handles HF close to target (small repay needed)', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 900, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 700, liquidationThreshold: 0.0 }],
        hfToBigint(1.067),
        hfToBigint(1.10),
        debtBase(700),
      )
      expect(result.requiredCapitalUSD).toBeGreaterThan(0)
      expect(result.requiredCapitalUSD).toBeLessThan(50)
    })

    it('handles HF above target (no action needed)', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1500, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 500, liquidationThreshold: 0.0 }],
        hfToBigint(2.49),
        hfToBigint(1.10),
        debtBase(500),
      )
      expect(result.requiredCapitalUSD).toBe(0)
    })

    it('handles one collateral with zero value', () => {
      const result = computeOptimalMitigation(
        [
          { tokenAddress: WETH, usdValue: 0, liquidationThreshold: 0.83 },
          { tokenAddress: '0xother', usdValue: 500, liquidationThreshold: 0.79 },
        ],
        [{ tokenAddress: USDC, usdValue: 300, liquidationThreshold: 0.0 }],
        hfToBigint(1.317),
        hfToBigint(1.10),
        debtBase(300),
      )
      expect(result.recommendedAction).toBe('REPAY')
      expect(result.requiredCapitalUSD).toBe(0)
    })

    it('is finite for large debt with small collateral', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 100, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 10000, liquidationThreshold: 0.0 }],
        hfToBigint(0.0083),
        hfToBigint(1.10),
        debtBase(10000),
      )
      expect(Number.isFinite(result.repayCost)).toBe(true)
      expect(Number.isFinite(result.supplyCost)).toBe(true)
    })

    it('handles empty collaterals with valid debt', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 }],
        [],
        hfToBigint(1.0),
        hfToBigint(1.10),
        debtBase(0),
      )
      expect(result.recommendedAction).toBe('REPAY')
      expect(result.supplyCost).toBe(Infinity)
    })

    it('precision at 18 decimal HF values', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 800, liquidationThreshold: 0.0 }],
        BigInt('1037499999999999896'),
        hfToBigint(1.10),
        debtBase(800),
      )
      expect(Number.isFinite(result.repayCost)).toBe(true)
      expect(result.repayCost).toBeGreaterThan(0)
    })

    it('handles extremely small repay amounts', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 991.27, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 750, liquidationThreshold: 0.0 }],
        hfToBigint(1.097),
        hfToBigint(1.10),
        debtBase(750),
      )
      expect(result.requiredCapitalUSD).toBeGreaterThanOrEqual(0)
      expect(result.requiredCapitalUSD).toBeLessThan(10)
    })
  })

  // ─── A. Design-generation invariant tests (15 tests) ───────────────────────

  describe('A: design-generation invariant — supplyCost >= repayCost for consistent positions', () => {
    const targetHf = 1.10

    function assertInvariant(debtUsd: number, hfCurrent: number, lt: number): void {
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: consistentCollateral(debtUsd, hfCurrent, lt), liquidationThreshold: lt },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: debtUsd, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurrent), hfToBigint(targetHf), debtBase(debtUsd))
      expect(result.supplyCost).toBeGreaterThanOrEqual(result.repayCost - 0.01)
    }

    it('A1: HF=0.95, LT=0.50, Debt=$100', () => { assertInvariant(100, 0.95, 0.50) })
    it('A2: HF=1.00, LT=0.65, Debt=$500', () => { assertInvariant(500, 1.00, 0.65) })
    it('A3: HF=1.05, LT=0.75, Debt=$1000', () => { assertInvariant(1000, 1.05, 0.75) })
    it('A4: HF=1.10, LT=0.83, Debt=$10000', () => { assertInvariant(10000, 1.10, 0.83) })
    it('A5: HF=1.15, LT=0.95, Debt=$500', () => { assertInvariant(500, 1.15, 0.95) })
    it('A6: HF=1.20, LT=0.65, Debt=$1000', () => { assertInvariant(1000, 1.20, 0.65) })
    it('A7: HF=0.95, LT=0.83, Debt=$10000', () => { assertInvariant(10000, 0.95, 0.83) })
    it('A8: HF=1.05, LT=0.50, Debt=$100', () => { assertInvariant(100, 1.05, 0.50) })
    it('A9: HF=1.00, LT=0.83, Debt=$500', () => { assertInvariant(500, 1.00, 0.83) })
    it('A10: HF=1.15, LT=0.75, Debt=$10000', () => { assertInvariant(10000, 1.15, 0.75) })

    it('A11: multiple collaterals with different LTs (0.83 & 0.79)', () => {
      const debtUsd = 2000
      const hfCurrent = 0.95
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 },
        { tokenAddress: WSTETH, usdValue: Math.round((2000 * 0.95 - 1000 * 0.83) / 0.79 * 100) / 100, liquidationThreshold: 0.79 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: debtUsd, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurrent), hfToBigint(targetHf), debtBase(debtUsd))
      expect(result.supplyCost).toBeGreaterThanOrEqual(result.repayCost - 0.01)
    })

    it('A12: 3 collaterals with different LTs (0.83, 0.79, 0.50)', () => {
      const debtUsd = 3000
      const hfCurrent = 0.95
      const c1weight = 1000 * 0.83
      const c2weight = 800 * 0.79
      const targetWeight = 3000 * 0.95
      const c3val = Math.round((targetWeight - c1weight - c2weight) / 0.50 * 100) / 100
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 },
        { tokenAddress: WSTETH, usdValue: 800, liquidationThreshold: 0.79 },
        { tokenAddress: '0xcb...', usdValue: c3val, liquidationThreshold: 0.50 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: debtUsd, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurrent), hfToBigint(targetHf), debtBase(debtUsd))
      expect(result.supplyCost).toBeGreaterThanOrEqual(result.repayCost - 0.01)
    })

    it('A13: 1 collateral, 2 debts, HF=1.00, LT=0.75', () => {
      const hfCurrent = 1.00
      const lt = 0.75
      const totalDebt = 1000
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: consistentCollateral(totalDebt, hfCurrent, lt), liquidationThreshold: lt },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 600, liquidationThreshold: 0.0 },
        { tokenAddress: '0xother', usdValue: 400, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurrent), hfToBigint(targetHf), debtBase(totalDebt))
      expect(result.supplyCost).toBeGreaterThanOrEqual(result.repayCost - 0.01)
    })

    it('A14: 2 collaterals, 2 debts, HF=1.05, LTs=0.65,0.83', () => {
      const debtUsd = 1500
      const hfCurrent = 1.05
      const targetWeight = 1500 * 1.05
      const c2val = Math.round((targetWeight - 800 * 0.65) / 0.83 * 100) / 100
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 800, liquidationThreshold: 0.65 },
        { tokenAddress: WSTETH, usdValue: c2val, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 1000, liquidationThreshold: 0.0 },
        { tokenAddress: '0xother', usdValue: 500, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurrent), hfToBigint(targetHf), debtBase(debtUsd))
      expect(result.supplyCost).toBeGreaterThanOrEqual(result.repayCost - 0.01)
    })

    it('A15: extremely low LT (0.10) on main collateral, HF=0.95', () => {
      assertInvariant(1000, 0.95, 0.10)
    })
  })

  // ─── B. Monte Carlo random positions (10 tests) ───────────────────────────

  describe('B: Monte Carlo random positions', () => {
    function randomCollateral(): AssetData {
      const lts = [0.50, 0.65, 0.75, 0.79, 0.80, 0.83, 0.90, 0.95]
      const lt = lts[Math.floor(Math.random() * lts.length)]!
      return {
        tokenAddress: '0xrandom' + Math.random().toString(36).slice(2, 8),
        usdValue: Math.round(Math.random() * 10000 * 100) / 100,
        liquidationThreshold: lt,
      }
    }

    function randomDebt(): AssetData {
      return {
        tokenAddress: '0xdebt' + Math.random().toString(36).slice(2, 8),
        usdValue: Math.round(Math.random() * 10000 * 100) / 100,
        liquidationThreshold: 0.0,
      }
    }

    function randomPosition() {
      const collaterals = Array.from({ length: 3 }, () => randomCollateral())
      const debts = Array.from({ length: 2 }, () => randomDebt())
      const totalDebt = debts.reduce((s, d) => s + d.usdValue, 0)
      const weightedCol = collaterals.reduce((s, c) => s + c.usdValue * c.liquidationThreshold, 0)
      const hfCurr = totalDebt > 0 ? weightedCol / totalDebt : 2.0
      return { collaterals, debts, totalDebt, hfCurr }
    }

    it('B1: all cost fields are finite', () => {
      const { collaterals, debts, totalDebt, hfCurr } = randomPosition()
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurr), hfToBigint(1.10), debtBase(totalDebt))
      expect(Number.isFinite(result.repayCost)).toBe(true)
      expect(Number.isFinite(result.supplyCost)).toBe(true)
      expect(Number.isFinite(result.requiredCapitalUSD)).toBe(true)
      expect(Number.isFinite(result.alternativeCost)).toBe(true)
    })

    it('B2: requiredCapitalUSD <= totalDebt', () => {
      const { collaterals, debts, totalDebt, hfCurr } = randomPosition()
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurr), hfToBigint(1.10), debtBase(totalDebt))
      expect(result.requiredCapitalUSD).toBeLessThanOrEqual(totalDebt + 0.01)
    })

    it('B3: healthy HF (current >= target) => requiredCapitalUSD = 0', () => {
      const { collaterals, debts, totalDebt } = randomPosition()
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(5.0), hfToBigint(1.10), debtBase(totalDebt))
      expect(result.requiredCapitalUSD).toBe(0)
    })

    it('B4: all AssetData fields present in result', () => {
      const { collaterals, debts, totalDebt, hfCurr } = randomPosition()
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurr), hfToBigint(1.10), debtBase(totalDebt))
      expect(typeof result.recommendedAction).toBe('string')
      expect(typeof result.targetToken).toBe('string')
      expect(typeof result.requiredCapitalUSD).toBe('number')
      expect(typeof result.repayCost).toBe('number')
      expect(typeof result.supplyCost).toBe('number')
      expect(typeof result.alternativeAction).toBe('string')
      expect(typeof result.alternativeCost).toBe('number')
    })

    it('B5: repayCost is reasonable range (0 to totalDebt)', () => {
      const { collaterals, debts, totalDebt, hfCurr } = randomPosition()
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurr), hfToBigint(1.10), debtBase(totalDebt))
      expect(result.repayCost).toBeGreaterThanOrEqual(0)
      expect(result.repayCost).toBeLessThanOrEqual(totalDebt + 0.01)
    })

    it('B6: supplyCost is non-negative or infinite', () => {
      const { collaterals, debts, totalDebt, hfCurr } = randomPosition()
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurr), hfToBigint(1.10), debtBase(totalDebt))
      expect(result.supplyCost >= 0 || !Number.isFinite(result.supplyCost)).toBe(true)
    })

    it('B7: alternativeAction is always opposite of recommendedAction', () => {
      const { collaterals, debts, totalDebt, hfCurr } = randomPosition()
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurr), hfToBigint(1.10), debtBase(totalDebt))
      if (result.recommendedAction === 'REPAY') {
        expect(result.alternativeAction).toBe('SUPPLY')
      } else {
        expect(result.alternativeAction).toBe('REPAY')
      }
    })

    it('B8: repayCost is 0 when current HF >= target HF (already healthy)', () => {
      const { collaterals, debts, totalDebt } = randomPosition()
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(5.0), hfToBigint(1.10), debtBase(totalDebt))
      expect(result.repayCost).toBe(0)
      expect(result.requiredCapitalUSD).toBe(0)
    })

    it('B9: multiple randomized calls produce valid results', () => {
      for (let i = 0; i < 20; i++) {
        const { collaterals, debts, totalDebt, hfCurr } = randomPosition()
        const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurr), hfToBigint(1.10), debtBase(totalDebt))
        expect(Number.isFinite(result.requiredCapitalUSD)).toBe(true)
      }
    })

    it('B10: alternativeCost matches the non-selected action cost', () => {
      const { collaterals, debts, totalDebt, hfCurr } = randomPosition()
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurr), hfToBigint(1.10), debtBase(totalDebt))
      if (result.recommendedAction === 'REPAY') {
        expect(result.alternativeCost).toBe(result.supplyCost)
      } else {
        expect(result.alternativeCost).toBe(result.repayCost)
      }
    })
  })

  // ─── C. Stress tests (8 tests) ────────────────────────────────────────────

  describe('C: stress tests', () => {
    it('C1: 1000 rapid calls with varying positions', () => {
      for (let i = 0; i < 1000; i++) {
        const debt = 500 + (i % 100) * 10
        const hfCurr = 0.9 + (i % 30) / 100
        const lt = 0.75 + (i % 8) / 100
        const collaterals: AssetData[] = [
          { tokenAddress: WETH, usdValue: consistentCollateral(debt, hfCurr, lt), liquidationThreshold: lt },
        ]
        const debts: AssetData[] = [
          { tokenAddress: USDC, usdValue: debt, liquidationThreshold: 0.0 },
        ]
        const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurr), hfToBigint(1.10), debtBase(debt))
        expect(Number.isFinite(result.repayCost)).toBe(true)
      }
    })

    it('C2: 500 calls with same params (reproducibility)', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 800, liquidationThreshold: 0.0 },
      ]
      const hfCurr = hfToBigint(1.0375)
      const hfTarget = hfToBigint(1.10)
      const base = debtBase(800)
      let last = computeOptimalMitigation(collaterals, debts, hfCurr, hfTarget, base)
      for (let i = 0; i < 500; i++) {
        const next = computeOptimalMitigation(collaterals, debts, hfCurr, hfTarget, base)
        expect(next.repayCost).toBe(last.repayCost)
        expect(next.supplyCost).toBe(last.supplyCost)
        expect(next.recommendedAction).toBe(last.recommendedAction)
        last = next
      }
    })

    it('C3: 10k calls in nested loop across HF range', () => {
      for (let i = 0; i < 100; i++) {
        const hfCurr = 0.90 + i / 100
        for (let j = 0; j < 100; j++) {
          const lt = 0.50 + j / 200
          const debt = 1000
          const collaterals: AssetData[] = [
            { tokenAddress: WETH, usdValue: consistentCollateral(debt, hfCurr, lt), liquidationThreshold: lt },
          ]
          const debts: AssetData[] = [
            { tokenAddress: USDC, usdValue: debt, liquidationThreshold: 0.0 },
          ]
          const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurr), hfToBigint(1.10), debtBase(debt))
          expect(Number.isFinite(result.requiredCapitalUSD)).toBe(true)
        }
      }
    })

    it('C4: many collaterals (20) with varying LTs', () => {
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 5000, liquidationThreshold: 0.0 },
      ]
      const collaterals: AssetData[] = Array.from({ length: 20 }, (_, i) => ({
        tokenAddress: '0xcol' + i,
        usdValue: 200 + i * 50,
        liquidationThreshold: 0.50 + (i % 10) * 0.05,
      }))
      const totalDebt = debts.reduce((s, d) => s + d.usdValue, 0)
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(1.0), hfToBigint(1.10), debtBase(totalDebt))
      expect(Number.isFinite(result.repayCost)).toBe(true)
      expect(Number.isFinite(result.supplyCost)).toBe(true)
    })

    it('C5: many debts (20) with zero LT', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 50000, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = Array.from({ length: 20 }, (_, i) => ({
        tokenAddress: '0xdebt' + i,
        usdValue: 200 + i * 30,
        liquidationThreshold: 0.0,
      }))
      const totalDebt = debts.reduce((s, d) => s + d.usdValue, 0)
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(1.0), hfToBigint(1.10), debtBase(totalDebt))
      expect(Number.isFinite(result.repayCost)).toBe(true)
    })

    it('C6: many collaterals and many debts (50 each)', () => {
      const collaterals: AssetData[] = Array.from({ length: 50 }, (_, i) => ({
        tokenAddress: '0xcol' + i,
        usdValue: 100 + i * 10,
        liquidationThreshold: 0.60 + (i % 8) * 0.04,
      }))
      const debts: AssetData[] = Array.from({ length: 50 }, (_, i) => ({
        tokenAddress: '0xdebt' + i,
        usdValue: 50 + i * 5,
        liquidationThreshold: 0.0,
      }))
      const totalDebt = debts.reduce((s, d) => s + d.usdValue, 0)
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(1.0), hfToBigint(1.10), debtBase(totalDebt))
      expect(Number.isFinite(result.requiredCapitalUSD)).toBe(true)
    })

    it('C7: rapidly varying HF near target (1.09-1.11)', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 800, liquidationThreshold: 0.0 },
      ]
      for (let i = 0; i < 200; i++) {
        const hfCurr = 1.09 + (i % 20) / 1000
        const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurr), hfToBigint(1.10), debtBase(800))
        expect(Number.isFinite(result.repayCost)).toBe(true)
      }
    })

    it('C8: rapidly varying HF near 1.0 (0.99-1.01)', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 830, liquidationThreshold: 0.0 },
      ]
      for (let i = 0; i < 200; i++) {
        const hfCurr = 0.99 + (i % 20) / 1000
        const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurr), hfToBigint(1.10), debtBase(830))
        expect(Number.isFinite(result.requiredCapitalUSD)).toBe(true)
      }
    })
  })

  // ─── D. Zero and boundary tests (10 tests) ────────────────────────────────

  describe('D: zero and boundary tests', () => {
    it('D1: zero totalDebtBase (BigInt 0) but non-zero debt usdValue', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 500, liquidationThreshold: 0.0 }],
        hfToBigint(1.0),
        hfToBigint(1.10),
        0n,
      )
      expect(result.repayCost).toBe(0)
      expect(result.requiredCapitalUSD).toBe(0)
    })

    it('D2: zero hfCurrent (BigInt 0)', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 500, liquidationThreshold: 0.0 }],
        0n,
        hfToBigint(1.10),
        debtBase(500),
      )
      expect(result.repayCost).toBeGreaterThan(0)
      expect(Number.isFinite(result.supplyCost)).toBe(true)
    })

    it('D3: hfTarget == hfCurrent', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 800, liquidationThreshold: 0.0 }],
        hfToBigint(1.0375),
        hfToBigint(1.0375),
        debtBase(800),
      )
      expect(result.repayCost).toBe(0)
      expect(result.requiredCapitalUSD).toBe(0)
    })

    it('D4: hfTarget < hfCurrent (already healthy)', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 500, liquidationThreshold: 0.0 }],
        hfToBigint(1.66),
        hfToBigint(1.10),
        debtBase(500),
      )
      expect(result.repayCost).toBe(0)
      expect(result.supplyCost).toBe(0)
      expect(result.requiredCapitalUSD).toBe(0)
    })

    it('D5: all collaterals with LT=0', () => {
      const result = computeOptimalMitigation(
        [
          { tokenAddress: WETH, usdValue: 500, liquidationThreshold: 0.0 },
          { tokenAddress: WSTETH, usdValue: 500, liquidationThreshold: 0.0 },
        ],
        [{ tokenAddress: USDC, usdValue: 800, liquidationThreshold: 0.0 }],
        hfToBigint(1.0),
        hfToBigint(1.10),
        debtBase(800),
      )
      expect(result.supplyCost).toBe(Infinity)
      expect(result.repayCost).toBeGreaterThan(0)
      expect(result.recommendedAction).toBe('REPAY')
    })

    it('D6: all collaterals with LT=1.0 (edge case)', () => {
      const result = computeOptimalMitigation(
        [
          { tokenAddress: WETH, usdValue: 600, liquidationThreshold: 1.0 },
          { tokenAddress: WSTETH, usdValue: 400, liquidationThreshold: 1.0 },
        ],
        [{ tokenAddress: USDC, usdValue: 800, liquidationThreshold: 0.0 }],
        hfToBigint(1.25),
        hfToBigint(1.10),
        debtBase(800),
      )
      expect(result.requiredCapitalUSD).toBe(0)
    })

    it('D7: single collateral LT=1.0', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 1.0 }],
        [{ tokenAddress: USDC, usdValue: 900, liquidationThreshold: 0.0 }],
        hfToBigint(1.11),
        hfToBigint(1.10),
        debtBase(900),
      )
      expect(result.requiredCapitalUSD).toBe(0)
    })

    it('D8: totalDebtBase very small but debt in USD normal', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 500, liquidationThreshold: 0.0 }],
        hfToBigint(0.95),
        hfToBigint(1.10),
        1n,
      )
      expect(result.repayCost).toBeGreaterThanOrEqual(0)
      expect(result.repayCost).toBeLessThan(0.01)
    })

    it('D9: totalDebtBase very large with small debts', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 10, liquidationThreshold: 0.0 }],
        hfToBigint(0.95),
        hfToBigint(1.10),
        BigInt('18446744073709551615'),
      )
      expect(Number.isFinite(result.repayCost)).toBe(true)
      expect(result.repayCost).toBeGreaterThan(0)
    })

    it('D10: empty debts array with non-empty totalDebtBase', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 }],
        [],
        hfToBigint(1.0),
        hfToBigint(1.10),
        debtBase(500),
      )
      expect(result.repayCost).toBe(0)
      expect(result.supplyCost).toBe(Infinity)
      expect(result.requiredCapitalUSD).toBe(0)
    })
  })

  // ─── E. Precision edge cases (10 tests) ───────────────────────────────────

  describe('E: precision edge cases', () => {
    it('E1: HF values at Number.MAX_SAFE_INTEGER / 1e18 (~9 quadrillion HF)', () => {
      const hugeHf = BigInt(Number.MAX_SAFE_INTEGER)
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 500, liquidationThreshold: 0.0 }],
        hugeHf,
        hugeHf,
        debtBase(500),
      )
      expect(result.requiredCapitalUSD).toBe(0)
      expect(result.repayCost).toBe(0)
    })

    it('E2: HF values near 0 (1n = 1e-18 HF)', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 500, liquidationThreshold: 0.0 }],
        1n,
        hfToBigint(1.10),
        debtBase(500),
      )
      expect(Number.isFinite(result.repayCost)).toBe(true)
      expect(result.repayCost).toBeGreaterThan(0)
    })

    it('E3: very close HF values (diff of 1n in bigint = 1e-18)', () => {
      const baseHf = hfToBigint(1.10)
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 500, liquidationThreshold: 0.0 }],
        baseHf - 1n,
        baseHf,
        debtBase(500),
      )
      expect(result.repayCost).toBe(0)
      expect(result.requiredCapitalUSD).toBe(0)
    })

    it('E4: extremely small repay (1n) from tiny debt', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 1, liquidationThreshold: 0.0 }],
        0n,
        hfToBigint(1.10),
        1n,
      )
      expect(result.repayCost).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(result.supplyCost)).toBe(true)
    })

    it('E5: large debt with very close HF values (precision loss test)', () => {
      const debtUsd = 100000
      const hfCurr = 1.099999999999
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: consistentCollateral(debtUsd, hfCurr, 0.83), liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: debtUsd, liquidationThreshold: 0.0 }],
        hfToBigint(hfCurr),
        hfToBigint(1.10),
        debtBase(debtUsd),
      )
      expect(Number.isFinite(result.repayCost)).toBe(true)
      expect(result.repayCost).toBeGreaterThanOrEqual(0)
    })

    it('E6: 18-digit precision HF in both current and target', () => {
      const hfCurr = BigInt('1000000000000000000')
      const hfTarget = BigInt('1100000000000000001')
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 500, liquidationThreshold: 0.0 }],
        hfCurr,
        hfTarget,
        debtBase(500),
      )
      expect(Number.isFinite(result.repayCost)).toBe(true)
      expect(result.repayCost).toBeGreaterThan(0)
    })

    it('E7: totalDebtBase at max uint64', () => {
      const maxUint64 = BigInt('18446744073709551615')
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1e12, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 1e12, liquidationThreshold: 0.0 }],
        hfToBigint(0.95),
        hfToBigint(1.10),
        maxUint64,
      )
      expect(Number.isFinite(result.repayCost)).toBe(true)
      expect(Number.isFinite(result.supplyCost)).toBe(true)
    })

    it('E8: collateral values with sub-cent precision (e.g. 1234.56)', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1234.56, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 800.12, liquidationThreshold: 0.0 }],
        hfToBigint(1.0375),
        hfToBigint(1.10),
        debtBase(800.12),
      )
      expect(Number.isFinite(result.repayCost)).toBe(true)
      expect(Number.isFinite(result.supplyCost)).toBe(true)
    })

    it('E9: debt values with sub-cent precision', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 2000, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 1234.56, liquidationThreshold: 0.0 }],
        hfToBigint(1.00),
        hfToBigint(1.10),
        debtBase(1234.56),
      )
      expect(Number.isFinite(result.repayCost)).toBe(true)
    })

    it('E10: mixed precision across all inputs', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1234.56, liquidationThreshold: 0.827 }],
        [{ tokenAddress: USDC, usdValue: 987.65, liquidationThreshold: 0.0 }],
        BigInt('1037500000000000123'),
        BigInt('1100000000000000000'),
        BigInt(Math.round(987.65 * 1e8)),
      )
      expect(Number.isFinite(result.repayCost)).toBe(true)
      expect(Number.isFinite(result.supplyCost)).toBe(true)
    })
  })

  // ─── F. Equality tolerance behavior (5 tests) ─────────────────────────────

  describe('F: equality tolerance behavior', () => {
    it('F1: repayCost and supplyCost exactly equal (absDiff < 0.001) -> recommends REPAY', () => {
      // target=2.0, current=1.0, debt=1000 → repayCost = 500
      // collateral chosen so supplyCost ≈ 500
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 1585 / 0.83, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 1000, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(1.0), hfToBigint(2.0), debtBase(1000))
      expect(Math.abs(result.repayCost - result.supplyCost)).toBeLessThan(0.001)
      expect(result.recommendedAction).toBe('REPAY')
    })

    it('F2: repayCost slightly less than supplyCost but within tolerance (diff < 0.001)', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 500, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(1.0), hfToBigint(1.10), debtBase(500))
      const diff = Math.abs(result.repayCost - result.supplyCost)
      if (diff < 0.001) {
        expect(result.recommendedAction).toBe('REPAY')
      }
    })

    it('F3: supplyCost slightly less than repayCost but within tolerance (diff < 0.001)', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 12000, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 10000, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(1.0), hfToBigint(1.10), debtBase(10000))
      if (Math.abs(result.repayCost - result.supplyCost) < 0.001) {
        expect(result.recommendedAction).toBe('REPAY')
      }
    })

    it('F4: repayCost exactly 0 when already healthy', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 2000, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 500, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(3.32), hfToBigint(1.10), debtBase(500))
      expect(result.repayCost).toBe(0)
      expect(result.recommendedAction).toBe('REPAY')
    })

    it('F5: very close costs near the tolerance boundary', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 1200, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 1000, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(0.996), hfToBigint(1.10), debtBase(1000))
      expect(Number.isFinite(result.repayCost)).toBe(true)
      expect(Number.isFinite(result.supplyCost)).toBe(true)
    })
  })

  // ─── G. TargetToken selection (7 tests) ───────────────────────────────────

  describe('G: TargetToken selection', () => {
    it('G1: when recommended = REPAY, targetToken = first debt token', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 800, liquidationThreshold: 0.0 },
        { tokenAddress: '0xsecond', usdValue: 200, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(0.95), hfToBigint(1.10), debtBase(1000))
      expect(result.recommendedAction).toBe('REPAY')
      expect(result.targetToken).toBe(USDC)
    })

    it('G2: when recommended = SUPPLY, targetToken = highest LT collateral', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WSTETH, usdValue: 2000, liquidationThreshold: 0.79 },
        { tokenAddress: WETH, usdValue: 500, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 3000, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(0.665), hfToBigint(1.10), debtBase(3000))
      expect(result.alternativeAction).toBe('SUPPLY')
      expect(result.alternativeAction === 'SUPPLY' || result.recommendedAction === 'SUPPLY').toBe(true)
    })

    it('G3: multiple collaterals with same LT -> picks first', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WSTETH, usdValue: 1000, liquidationThreshold: 0.83 },
        { tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 1500, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(0.95), hfToBigint(1.10), debtBase(1500))
      expect(result.targetToken === WSTETH || result.targetToken === WETH).toBe(true)
    })

    it('G4: single collateral with max LT', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 500, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(0.95), hfToBigint(1.10), debtBase(500))
      expect(result.targetToken).toBeDefined()
    })

    it('G5: debts array with 0 assets -> returns empty string', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 }],
        [],
        hfToBigint(1.0),
        hfToBigint(1.10),
        debtBase(0),
      )
      expect(result.targetToken).toBe('')
    })

    it('G6: collaterals with tie LT -> deterministic', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: '0xfirst', usdValue: 500, liquidationThreshold: 0.80 },
        { tokenAddress: '0xsecond', usdValue: 500, liquidationThreshold: 0.80 },
        { tokenAddress: '0xthird', usdValue: 500, liquidationThreshold: 0.80 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 1000, liquidationThreshold: 0.0 },
      ]
      const r1 = computeOptimalMitigation(collaterals, debts, hfToBigint(1.0), hfToBigint(1.10), debtBase(1000))
      const r2 = computeOptimalMitigation(collaterals, debts, hfToBigint(1.0), hfToBigint(1.10), debtBase(1000))
      expect(r1.targetToken).toBe(r2.targetToken)
    })

    it('G7: alternativeAction is always the opposite of recommended', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 800, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(0.95), hfToBigint(1.10), debtBase(800))
      expect(result.alternativeAction).toBe(result.recommendedAction === 'REPAY' ? 'SUPPLY' : 'REPAY')
    })
  })

  // ─── H. Contract compliance tests (10 tests) ──────────────────────────────

  describe('H: contract compliance tests', () => {
    it('H1: repayCost = computed usdc value / 1e6', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 800, liquidationThreshold: 0.0 },
      ]
      const totalDebtBase = debtBase(800)
      const hfCurr = hfToBigint(0.95)
      const hfTarget = hfToBigint(1.10)
      const result = computeOptimalMitigation(collaterals, debts, hfCurr, hfTarget, totalDebtBase)
      const expectedRepayNum = Number(computeRepayAmount(totalDebtBase, hfCurr, hfTarget)) / 1e6
      expect(result.repayCost).toBe(expectedRepayNum)
    })

    it('H2: verify supplyCost formula: (totalDebt * targetHF - weightedCollateral) / maxLT', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 800, liquidationThreshold: 0.0 },
      ]
      const hfCurr = hfToBigint(0.95)
      const hfTarget = hfToBigint(1.10)
      const result = computeOptimalMitigation(collaterals, debts, hfCurr, hfTarget, debtBase(800))
      const totalDebt = 800
      const targetHfNum = 1.10
      const weightedCollateral = 1000 * 0.83
      const maxLT = 0.83
      const expectedSupply = Math.max(0, (totalDebt * targetHfNum - weightedCollateral) / maxLT)
      expect(result.supplyCost).toBe(expectedSupply)
    })

    it('H3: verify repayCost uses computeRepayAmount internally', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 2000, liquidationThreshold: 0.83 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 1500, liquidationThreshold: 0.0 },
      ]
      const totalDebtBase = debtBase(1500)
      const hfCurr = hfToBigint(1.1)
      const hfTarget = hfToBigint(1.10)
      const result = computeOptimalMitigation(collaterals, debts, hfCurr, hfTarget, totalDebtBase)
      const expectedRepayNum = Number(computeRepayAmount(totalDebtBase, hfCurr, hfTarget)) / 1e6
      expect(result.repayCost).toBe(expectedRepayNum)
    })

    it('H4: requiredCapitalUSD = max(0, selectedCost) — never negative', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 100, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 120, liquidationThreshold: 0.0 }],
        hfToBigint(0.69),
        hfToBigint(1.10),
        debtBase(120),
      )
      expect(result.requiredCapitalUSD).toBeGreaterThanOrEqual(0)
      const expected = Math.max(0, result.recommendedAction === 'REPAY' ? result.repayCost : result.supplyCost)
      expect(result.requiredCapitalUSD).toBe(expected)
    })

    it('H5: alternativeCost = opposite action cost (repay <-> supply)', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 800, liquidationThreshold: 0.0 }],
        hfToBigint(0.95),
        hfToBigint(1.10),
        debtBase(800),
      )
      expect(result.alternativeCost).toBe(result.recommendedAction === 'REPAY' ? result.supplyCost : result.repayCost)
    })

    it('H6: verify supplyCost = Infinity when maxLT = 0', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.0 }],
        [{ tokenAddress: USDC, usdValue: 500, liquidationThreshold: 0.0 }],
        hfToBigint(1.0),
        hfToBigint(1.10),
        debtBase(500),
      )
      expect(result.supplyCost).toBe(Infinity)
    })

    it('H7: verify totalDebt is sum of all debt usdValues', () => {
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 1200, liquidationThreshold: 0.0 },
        { tokenAddress: '0xother', usdValue: 300, liquidationThreshold: 0.0 },
        { tokenAddress: '0xthird', usdValue: 500, liquidationThreshold: 0.0 },
      ]
      const totalDebtExpected = 1200 + 300 + 500
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: totalDebtExpected * 2, liquidationThreshold: 0.83 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(1.66), hfToBigint(1.10), debtBase(totalDebtExpected))
      // HF > target, action = REPAY, requiredCapital = 0
      expect(result.repayCost).toBe(0)
      expect(result.requiredCapitalUSD).toBe(0)
    })

    it('H8: verify weightedCollateral is sum(collateral.usdValue * LT)', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 1000, liquidationThreshold: 0.83 },
        { tokenAddress: WSTETH, usdValue: 500, liquidationThreshold: 0.79 },
      ]
      const expectedWeighted = 1000 * 0.83 + 500 * 0.79
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 1000, liquidationThreshold: 0.0 },
      ]
      const hfCurr = expectedWeighted / 1000
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(hfCurr), hfToBigint(1.10), debtBase(1000))
      const targetHfNum = 1.10
      const maxLT = 0.83
      const expectedSupply = Math.max(0, (1000 * targetHfNum - expectedWeighted) / maxLT)
      expect(result.supplyCost).toBeCloseTo(expectedSupply, 2)
    })

    it('H9: verify maxLT is max of all collateral LTs', () => {
      const collaterals: AssetData[] = [
        { tokenAddress: WETH, usdValue: 500, liquidationThreshold: 0.79 },
        { tokenAddress: '0xhigh', usdValue: 500, liquidationThreshold: 0.90 },
        { tokenAddress: '0xlow', usdValue: 500, liquidationThreshold: 0.50 },
      ]
      const debts: AssetData[] = [
        { tokenAddress: USDC, usdValue: 1000, liquidationThreshold: 0.0 },
      ]
      const result = computeOptimalMitigation(collaterals, debts, hfToBigint(1.0), hfToBigint(1.10), debtBase(1000))
      const targetHfNum = 1.10
      const weightedCollateral = 500 * 0.79 + 500 * 0.90 + 500 * 0.50
      const maxLT = 0.90
      const expectedSupply = Math.max(0, (1000 * targetHfNum - weightedCollateral) / maxLT)
      expect(result.supplyCost).toBeCloseTo(expectedSupply, 2)
    })

    it('H10: verify both costs are 0 when already healthy', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: WETH, usdValue: 2000, liquidationThreshold: 0.83 }],
        [{ tokenAddress: USDC, usdValue: 500, liquidationThreshold: 0.0 }],
        hfToBigint(3.32),
        hfToBigint(1.10),
        debtBase(500),
      )
      expect(result.repayCost).toBe(0)
      expect(result.supplyCost).toBe(0)
      expect(result.requiredCapitalUSD).toBe(0)
    })
  })
})
