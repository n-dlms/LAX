import { describe, it, expect, beforeEach } from 'vitest'
import { checkSafety, resetDailyCap, getDailySpend } from '../src/safety-plugin/guardrails.js'

beforeEach(() => {
  resetDailyCap()
})

describe('checkSafety', () => {
  it('allows ERC-20 approve (0x095ea7b3) for any spender', () => {
    const result = checkSafety('web3/write-contract', {
      data: '0x095ea7b3000000000000000000000000a238dd80c259a72e81d7e4664a9801593f98d1c50000000000000000000000000000000000000000000000000000000000000001',
    })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeNull()
  })

  it('denies transferFrom (0x23b872dd)', () => {
    const result = checkSafety('web3/write-contract', {
      data: '0x23b872dd0000000000000000000000000000000000000000000000000000000000000001',
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('SELECTOR_DENIED')
  })

  it('denies safeTransferFrom (0x42842e0e)', () => {
    const result = checkSafety('web3/write-contract', {
      data: '0x42842e0e0000000000000000000000000000000000000000000000000000000000000001',
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('SELECTOR_DENIED')
  })

  it('denies transfer (0xa9059cbb)', () => {
    const result = checkSafety('web3/write-contract', {
      data: '0xa9059cbb0000000000000000000000000000000000000000000000000000000000000001',
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('SELECTOR_NOT_ALLOWLISTED')
  })

  it('allows calls with no data field', () => {
    const result = checkSafety('web3/write-contract', {})
    expect(result.allowed).toBe(true)
  })

  it('allows unknown tools without checking', () => {
    const result = checkSafety('aave-v3/get-user-account-data', { network: '8453' })
    expect(result.allowed).toBe(true)
  })

  it('blocks transfer over block threshold', () => {
    const result = checkSafety('transfer', { value: (20e18).toString() })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('BLOCK_THRESHOLD_EXCEEDED')
  })

  it('allows transfer under block threshold', () => {
    const result = checkSafety('transfer', { value: (0.5e18).toString() })
    expect(result.allowed).toBe(true)
  })

  it('blocks transfer that exceeds daily limit cumulatively', () => {
    const first = checkSafety('transfer', { value: (4.0e18).toString() })
    expect(first.allowed).toBe(true)

    const second = checkSafety('transfer', { value: (1.5e18).toString() })
    expect(second.allowed).toBe(false)
    expect(second.reason).toContain('DAILY_CAP_EXCEEDED')
  })

  it('tracks daily spend correctly', () => {
    checkSafety('transfer', { value: (1.0e18).toString() })
    checkSafety('transfer', { value: (2.0e18).toString() })
    expect(getDailySpend()).toBeCloseTo(3.0, 10)
  })

  it('resets daily cap', () => {
    checkSafety('transfer', { value: (4.0e18).toString() })
    expect(getDailySpend()).toBeCloseTo(4.0, 10)
    resetDailyCap()
    expect(getDailySpend()).toBe(0)
  })

  it('allows write-contract with empty data field', () => {
    const result = checkSafety('web3/write-contract', { data: '' })
    expect(result.allowed).toBe(true)
  })

  it('rejects write-contract with malformed hex data (no valid selector prefix)', () => {
    const result = checkSafety('web3/write-contract', { data: '0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ' })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('SELECTOR_NOT_ALLOWLISTED')
  })

  it('catches denied selector before checking other args on write-contract', () => {
    const result = checkSafety('web3/write-contract', {
      data: '0x23b872dd0000000000000000000000000000000000000000000000000000000000000001',
      value: (999e18).toString(),
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('SELECTOR_DENIED')
  })

  it('allows transfer at block threshold boundary (4.0, under daily cap)', () => {
    const result = checkSafety('transfer', { value: (4.0e18).toString() })
    expect(result.allowed).toBe(true)
  })

  it('allows transfer with zero value', () => {
    const result = checkSafety('transfer', { value: '0' })
    expect(result.allowed).toBe(true)
  })

  it('returns 0 daily spend with no prior calls', () => {
    expect(getDailySpend()).toBe(0)
  })

  it('blocks transfer exceeding both block threshold and daily cap simultaneously', () => {
    const result = checkSafety('transfer', { value: (20e18).toString() })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('BLOCK_THRESHOLD_EXCEEDED')
  })

  it('clears daily spend tracking after resetDailyCap, allowing new transfers', () => {
    checkSafety('transfer', { value: (3.0e18).toString() })
    expect(getDailySpend()).toBeCloseTo(3.0, 10)
    resetDailyCap()
    expect(getDailySpend()).toBe(0)
    const result = checkSafety('transfer', { value: (1.0e18).toString() })
    expect(result.allowed).toBe(true)
    expect(getDailySpend()).toBeCloseTo(1.0, 10)
  })

  it('rejects write-contract with large data without valid selector prefix', () => {
    const result = checkSafety('web3/write-contract', {
      data: '0xdeadbeef0000000000000000000000000000000000000000000000000000000000000000',
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('SELECTOR_NOT_ALLOWLISTED')
  })

  // A. Selector edge cases (8 tests)

  it('allows selector at exact 10-char boundary matching allowlist', () => {
    const result = checkSafety('web3/write-contract', {
      data: '0x095ea7b300000000000000000000000000000000000000000000000000000000000000ff',
    })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeNull()
  })

  it('passes selector shorter than 10 chars (no valid selector to check)', () => {
    const result = checkSafety('web3/write-contract', { data: '0x095ea7' })
    expect(result.allowed).toBe(true)
  })

  it('passes selector exactly 9 chars', () => {
    const result = checkSafety('web3/write-contract', { data: '0x095ea7b' })
    expect(result.allowed).toBe(true)
  })

  it('passes selector with odd-length hex', () => {
    const result = checkSafety('web3/write-contract', { data: '0x12345' })
    expect(result.allowed).toBe(true)
  })

  it('rejects selector with leading zeros that is not allowlisted', () => {
    const result = checkSafety('web3/write-contract', {
      data: '0x0000000100000000000000000000000000000000000000000000000000000000000000',
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('SELECTOR_NOT_ALLOWLISTED')
  })

  it('matches allowlist selector with uppercase 0X prefix and hex', () => {
    const result = checkSafety('web3/write-contract', {
      data: '0X095EA7B30000000000000000000000000000000000000000000000000000000000000001',
    })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeNull()
  })

  it('rejects data field starting with non-hex characters after 0x', () => {
    const result = checkSafety('web3/write-contract', {
      data: '0xGGGGGGGG00000000000000000000000000000000000000000000000000000000000000',
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('SELECTOR_NOT_ALLOWLISTED')
  })

  it('allows data field that is exactly the allowlisted selector with no args', () => {
    const result = checkSafety('web3/write-contract', { data: '0x095ea7b3' })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeNull()
  })

  // B. Value parsing edge cases (8 tests)

  it('allows transfer with value string "0"', () => {
    const result = checkSafety('transfer', { value: '0' })
    expect(result.allowed).toBe(true)
  })

  it('allows transfer with empty string value (BigInt("") = 0n)', () => {
    const result = checkSafety('transfer', { value: '' })
    expect(result.allowed).toBe(true)
  })

  it('allows transfer with hex format value', () => {
    const result = checkSafety('transfer', { value: '0xff' })
    expect(result.allowed).toBe(true)
  })

  it('throws for scientific notation value', () => {
    expect(() => checkSafety('transfer', { value: '1e18' })).toThrow()
  })

  it('blocks transfer with very large BigInt string value', () => {
    const result = checkSafety('transfer', { value: '999999999999999999999999999999999999' })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('BLOCK_THRESHOLD_EXCEEDED')
  })

  it('throws for value with commas', () => {
    expect(() => checkSafety('transfer', { value: '1,000' })).toThrow()
  })

  it('parses transfer value with leading zeros correctly', () => {
    const result = checkSafety('transfer', { value: '000000000000000000000000000000001000' })
    expect(result.allowed).toBe(true)
  })

  it('allows transfer with undefined value field', () => {
    const result = checkSafety('transfer', {})
    expect(result.allowed).toBe(true)
  })

  // C. Daily cap boundary tests (6 tests)

  it('allows transfer that exactly hits the daily limit ($5)', () => {
    const result = checkSafety('transfer', { value: '5000000000000000000' })
    expect(result.allowed).toBe(true)
    expect(getDailySpend()).toBeCloseTo(5.0, 5)
  })

  it('blocks transfer when cumulative spend exceeds daily limit', () => {
    checkSafety('transfer', { value: '5000000000000000000' })
    const result = checkSafety('transfer', { value: '10000000000000000' })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('DAILY_CAP_EXCEEDED')
  })

  it('blocks second transfer when $4.99 + $0.02 exceeds daily limit', () => {
    checkSafety('transfer', { value: '4990000000000000000' })
    const result = checkSafety('transfer', { value: '20000000000000000' })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('DAILY_CAP_EXCEEDED')
  })

  it('blocks single transfer of $5.01 via daily cap (not block threshold)', () => {
    const result = checkSafety('transfer', { value: '5010000000000000000' })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('DAILY_CAP_EXCEEDED')
    expect(result.reason).not.toContain('BLOCK_THRESHOLD')
  })

  it('resumes spending after resetDailyCap clears spend tracker', () => {
    checkSafety('transfer', { value: '4000000000000000000' })
    expect(getDailySpend()).toBeCloseTo(4.0, 5)
    resetDailyCap()
    expect(getDailySpend()).toBe(0)
    const result = checkSafety('transfer', { value: '2000000000000000000' })
    expect(result.allowed).toBe(true)
    expect(getDailySpend()).toBeCloseTo(2.0, 5)
  })

  it('handles two resetDailyCap calls in a row as a no-op', () => {
    resetDailyCap()
    resetDailyCap()
    expect(getDailySpend()).toBe(0)
    const result = checkSafety('transfer', { value: '1000000000000000000' })
    expect(result.allowed).toBe(true)
    expect(getDailySpend()).toBeCloseTo(1.0, 5)
  })

  // D. Tool name edge cases (3 tests)

  it('passes unknown tool with empty string name', () => {
    const result = checkSafety('', { some: 'arg' })
    expect(result.allowed).toBe(true)
  })

  it('passes unknown tool with uppercase TRANSFER name (case-sensitive match)', () => {
    const result = checkSafety('TRANSFER', { value: '1000000000000000000' })
    expect(result.allowed).toBe(true)
  })

  it('passes unknown tool with special characters in name', () => {
    const result = checkSafety('tool@#$%', {})
    expect(result.allowed).toBe(true)
  })
})
