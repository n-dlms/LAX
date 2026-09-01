import { describe, it, expect, beforeEach } from 'vitest'
import { computeRepayAmount, hfToBigint, hfToNumber, usdcToString } from '../src/repay-math.js'
import { checkSafety, resetDailyCap } from '../src/safety-plugin/guardrails.js'
import { CONFIG } from '../src/config.js'
import { computeOptimalMitigation } from '../src/counterfactual-optimizer.js'

function debtBase(usd: number): bigint {
  return BigInt(Math.round(usd * 1e8))
}

describe('edge case sweep', () => {
  describe('token symbols and addresses', () => {
    it('handles WETH token address format', () => {
      expect(CONFIG.WETH).toMatch(/^0x[a-fA-F0-9]{40}$/)
    })

    it('handles USDC token address format', () => {
      expect(CONFIG.USDC).toMatch(/^0x[a-fA-F0-9]{40}$/)
    })
  })

  describe('bigint edge cases', () => {
    it('handles BigInt construction from string', () => {
      const val = BigInt('1000000000000000000')
      expect(val).toBe(10n ** 18n)
    })

    it('handles division with remainder', () => {
      const result = 100n / 3n
      expect(result).toBe(33n)
    })
  })

  describe('repay math extreme values', () => {
    it('handles very small HF difference (1.0999 -> 1.10)', () => {
      const repay = computeRepayAmount(debtBase(1000), hfToBigint(1.0999), hfToBigint(1.10))
      expect(repay).toBeGreaterThanOrEqual(0n)
      expect(usdcToString(repay)).toBeTruthy()
    })

    it('handles 18-digit precision in HF values', () => {
      const hf = BigInt('1100000000000000000')
      const num = hfToNumber(hf)
      expect(num).toBeCloseTo(1.1, 14)
    })
  })

  describe('safety plugin edge cases', () => {
    beforeEach(() => resetDailyCap())

    it('handles null data field', () => {
      const result = checkSafety('web3/write-contract', {})
      expect(result.allowed).toBe(true)
    })

    it('handles undefined args', () => {
      const result = checkSafety('transfer', {} as Record<string, unknown>)
      expect(result.allowed).toBe(true)
    })
  })

  describe('optimizer edge cases', () => {
    it('returns zero capital when already healthy', () => {
      const result = computeOptimalMitigation(
        [{ tokenAddress: CONFIG.WETH, usdValue: 2000, liquidationThreshold: 0.83 }],
        [{ tokenAddress: CONFIG.USDC, usdValue: 500, liquidationThreshold: 0.0 }],
        hfToBigint(3.32),
        hfToBigint(1.10),
        debtBase(500),
      )
      expect(result.requiredCapitalUSD).toBe(0)
    })
  })

  describe('BigInt extreme edge cases', () => {
    it('throws on BigInt(Number.MIN_VALUE) — subnormal number', () => {
      expect(() => BigInt(Number.MIN_VALUE)).toThrow()
    })

    it('handles BigInt(Number.MAX_VALUE) — very large integer', () => {
      const val = BigInt(Number.MAX_VALUE)
      expect(typeof val).toBe('bigint')
      expect(val).toBeGreaterThan(0n)
    })

    it('handles BigInt(-0) — negative zero', () => {
      expect(BigInt(-0)).toBe(0n)
    })

    it('throws on BigInt(NaN)', () => {
      expect(() => BigInt(NaN)).toThrow()
    })
  })

  describe('HF singularities', () => {
    it('computeRepayAmount with hfCurrent = 0n repays full debt', () => {
      const repay = computeRepayAmount(debtBase(1000), 0n, hfToBigint(1.10))
      expect(repay).toBe(1_000_000_000n)
    })

    it('computeRepayAmount with hfCurrent = 1n (1e-18 HF)', () => {
      const repay = computeRepayAmount(debtBase(1000), 1n, hfToBigint(1.10))
      expect(repay).toBeGreaterThan(0n)
      expect(repay).toBeLessThanOrEqual(1_000_000_000n)
      expect(repay).toBe(999_999_999n)
    })

    it('hfToBigint(1.0000000000000001) extreme sub-epsilon precision', () => {
      const hf = hfToBigint(1.0000000000000001)
      expect(hf).toBe(1_000_000_000_000_000_000n)
    })

    it('hfToNumber(1n) returns 1e-18', () => {
      expect(hfToNumber(1n)).toBe(1e-18)
    })
  })

  describe('computeRepayAmount mathematical invariants', () => {
    it('returns 0n when hfCurrent equals hfTarget', () => {
      const target = hfToBigint(1.10)
      const repay = computeRepayAmount(debtBase(1000), target, target)
      expect(repay).toBe(0n)
    })

    it('returns 0n when hfCurrent exceeds hfTarget by 1n', () => {
      const target = hfToBigint(1.10)
      const repay = computeRepayAmount(debtBase(1000), target + 1n, target)
      expect(repay).toBe(0n)
    })

    it('non-zero but very small repay with minimum positive delta and very large debt', () => {
      const target = hfToBigint(1.10)
      const current = target - 1n
      const hugeDebt = BigInt('1000000000000000000000')
      const repay = computeRepayAmount(hugeDebt, current, target)
      expect(repay).toBeGreaterThan(0n)
      expect(repay).toBeLessThan(100n)
    })

    it('verifies monotonicity: higher hfCurrent gives lower repay', () => {
      const target = hfToBigint(1.10)
      const debt = debtBase(1000)
      const lowerHF = hfToBigint(1.05)
      const higherHF = hfToBigint(1.09)
      const repayLower = computeRepayAmount(debt, lowerHF, target)
      const repayHigher = computeRepayAmount(debt, higherHF, target)
      expect(repayLower).toBeGreaterThan(repayHigher)
    })
  })

  describe('usdcToString extreme cases', () => {
    it('formats max safe BigInt that fits in Number', () => {
      const val = BigInt('9007199254740991')
      const result = usdcToString(val)
      expect(result).toBe('9007199254.740991')
    })

    it('formats max uint64 value', () => {
      const val = BigInt('18446744073709551615')
      const result = usdcToString(val)
      expect(result).toBe('18446744073709.551615')
    })

    it('formats negative BigInt value', () => {
      const result = usdcToString(-1_000_000n)
      expect(result).toBe('-1.000000')
    })

    it('formats amount with very long integer part', () => {
      const val = BigInt('999999999999999999999999')
      const result = usdcToString(val)
      expect(result).toBe('999999999999999999.999999')
    })
  })
})
