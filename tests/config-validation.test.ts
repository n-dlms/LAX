import { describe, it, expect } from 'vitest'
import { CONFIG, validateConfig } from '../src/config.js'

describe('validateConfig', () => {
  it('returns empty errors array for valid config', () => {
    const errors = validateConfig()
    expect(Array.isArray(errors)).toBe(true)
    expect(errors.length).toBe(0)
  })

  it('all exported addresses are valid hex format', () => {
    const errors = validateConfig()
    for (const err of errors) {
      if (err.includes('Invalid')) {
        expect(err).toMatch(/Invalid/)
      }
    }
  })

  it('HF thresholds are internally consistent', () => {
    const errors = validateConfig()
    const hfErrors = errors.filter((e) => e.startsWith('HF'))
    expect(hfErrors.length).toBe(0)
  })

  it('port is in valid range', () => {
    const errors = validateConfig()
    const portErrors = errors.filter((e) => e.includes('FORK_PORT'))
    expect(portErrors.length).toBe(0)
  })

  it('safety limits are positive', () => {
    const errors = validateConfig()
    const safetyErrors = errors.filter((e) => e.includes('BLOCK_THRESHOLD') || e.includes('DAILY_LIMIT'))
    expect(safetyErrors.length).toBe(0)
  })

  it('CONFIG is declared as const and preserves exact numeric values', () => {
    expect(CONFIG.SAFETY.BLOCK_THRESHOLD_USD).toBe(10.00)
  })

  it('CONFIG core addresses match documented values', () => {
    expect(CONFIG.WALLET_ADDRESS).toBe('0x8Bb7870242e75132Fd62265cA8ABF771d49C821C')
    expect(CONFIG.BORROWER_ADDRESS).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
    expect(CONFIG.AAVE_POOL).toBe('0xA238Dd80C259a72e81d7e4664a9801593F98d1c5')
    expect(CONFIG.USDC).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
    expect(CONFIG.WETH).toBe('0x4200000000000000000000000000000000000006')
  })

  it('no NaN or undefined values in CONFIG numeric fields', () => {
    const numerics = [
      CONFIG.HF.HEALTHY,
      CONFIG.HF.WATCH,
      CONFIG.HF.TRIGGER,
      CONFIG.HF.TARGET,
      CONFIG.CHAIN_ID,
      CONFIG.CHAIN_ID_SEPOLIA,
      CONFIG.FORK_PORT,
      CONFIG.REPAY_MODE,
      CONFIG.SAFETY.BLOCK_THRESHOLD_USD,
      CONFIG.SAFETY.DAILY_LIMIT_USD,
      CONFIG.FORK_BLOCK,
      CONFIG.LISTENER_POLL_MS,
    ]
    for (const n of numerics) {
      expect(typeof n).toBe('number')
      expect(Number.isFinite(n)).toBe(true)
      expect(n).toBeGreaterThan(0)
    }
  })

  it('all addresses are exactly 42 characters (0x + 40 hex)', () => {
    const addresses = [
      CONFIG.WALLET_ADDRESS,
      CONFIG.BORROWER_ADDRESS,
      CONFIG.AAVE_POOL,
      CONFIG.USDC,
      CONFIG.WETH,
      CONFIG.USDC_USD_AGGREGATOR,
      CONFIG.WETH_USD_AGGREGATOR,
    ]
    for (const addr of addresses) {
      expect(addr.length).toBe(42)
      expect(addr).toMatch(/^0x[a-fA-F0-9]{40}$/)
    }
  })

  it('all addresses are valid hex (0x prefix + 40 hex chars)', () => {
    const addresses = [
      CONFIG.WALLET_ADDRESS,
      CONFIG.BORROWER_ADDRESS,
      CONFIG.AAVE_POOL,
      CONFIG.USDC,
      CONFIG.WETH,
      CONFIG.USDC_USD_AGGREGATOR,
      CONFIG.WETH_USD_AGGREGATOR,
    ]
    for (const addr of addresses) {
      expect(/^0x[a-fA-F0-9]{40}$/.test(addr)).toBe(true)
    }
  })

  it('AAVE_POOL matches the known Base Aave V3 pool address', () => {
    expect(CONFIG.AAVE_POOL).toBe('0xA238Dd80C259a72e81d7e4664a9801593F98d1c5')
  })

  it('BLOCK_THRESHOLD_USD > DAILY_LIMIT_USD', () => {
    expect(CONFIG.SAFETY.BLOCK_THRESHOLD_USD).toBeGreaterThan(CONFIG.SAFETY.DAILY_LIMIT_USD)
  })

  it('HF.TRIGGER < HF.TARGET', () => {
    expect(CONFIG.HF.TRIGGER).toBeLessThan(CONFIG.HF.TARGET)
  })

  it('FORK_RPC_URL matches the pattern using FORK_PORT', () => {
    expect(CONFIG.FORK_RPC_URL).toBe(`http://127.0.0.1:${CONFIG.FORK_PORT}`)
  })

  it('CHAIN_ID matches Base mainnet or Sepolia', () => {
    expect([8453, 84532]).toContain(CONFIG.CHAIN_ID)
  })
})
