import { describe, it, expect } from 'vitest'
import { simulateApprove, simulateFullMitigation } from '../src/preflight-simulator.js'
import { runCritique } from '../src/critique-agent.js'
import { hfToBigint } from '../src/repay-math.js'

const RPC_URL = 'http://127.0.0.1:18545'
const WALLET = '0x8Bb7870242e75132Fd62265cA8ABF771d49C821C'
const BORROWER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const POOL = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5'

describe('shell integration boundaries', () => {
  it('attempts connection for non-local RPC URL (no fork ceiling)', () => {
    // The pre-validation gate is gone; a valid RPC is actually tried (this may
    // succeed if the endpoint is reachable). We only assert it is not short-circuited.
    const result = simulateApprove(TOKEN, POOL, 1000n, 'https://mainnet.base.org', WALLET)
    expect(result.revertReason).not.toBe('INVALID_RPC_URL')
    expect(result.revertReason).not.toBe('FORK_REQUIRED')
    expect(['APPROVE', 'REPAY', 'FULL']).toContain(result.stage)
  })

  it('attempts connection for https URL in simulateFullMitigation', () => {
    const result = simulateFullMitigation(BORROWER, TOKEN, 1000n, 'https://api.example.com', WALLET)
    expect(result.success).toBe(false)
    expect(result.revertReason).not.toBe('INVALID_RPC_URL')
  })

  it('detects non-local IP in simulation context', () => {
    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: BigInt(10 * 1e8),
      repayAmount: BigInt(545454),
      repayToken: TOKEN,
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: 'http://192.168.1.1:8545',
    })
    expect(critique.passed).toBe(false)
  })

  it('handles empty string as RPC URL', () => {
    const result = simulateApprove(TOKEN, POOL, 1000n, '', WALLET)
    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('INVALID_RPC_URL')
  })

  it('handles port-only localhost URL', () => {
    const result = simulateApprove(TOKEN, POOL, 1000n, 'http://localhost:8545', WALLET)
    expect(result.success).toBe(false)
  })

  // --- RPC URL fork detection edge cases (5 tests) ---

  it('accepts http://127.0.0.1 with no port', () => {
    const result = simulateApprove(TOKEN, POOL, 1000n, 'http://127.0.0.1', WALLET)
    expect(result.success).toBe(false)
    expect(result.revertReason).not.toBe('FORK_REQUIRED')
  })

  it('accepts http://127.0.0.1:8545/ with trailing slash', () => {
    const result = simulateApprove(TOKEN, POOL, 1000n, 'http://127.0.0.1:8545/', WALLET)
    expect(result.success).toBe(false)
    expect(result.revertReason).not.toBe('FORK_REQUIRED')
  })

  it('accepts http://127.0.0.1:18545 with query params', () => {
    const result = simulateApprove(TOKEN, POOL, 1000n, 'http://127.0.0.1:18545?foo=bar', WALLET)
    expect(result.success).toBe(false)
    expect(result.revertReason).not.toBe('FORK_REQUIRED')
  })

  it('accepts http://localhost with no port', () => {
    const result = simulateApprove(TOKEN, POOL, 1000n, 'http://localhost', WALLET)
    expect(result.success).toBe(false)
    expect(result.revertReason).not.toBe('FORK_REQUIRED')
  })

  it('accepts http://127.0.0.1:18545/path with path', () => {
    const result = simulateApprove(TOKEN, POOL, 1000n, 'http://127.0.0.1:18545/path', WALLET)
    expect(result.success).toBe(false)
    expect(result.revertReason).not.toBe('FORK_REQUIRED')
  })

  // --- Non-fork URL variants (3 tests) ---

  it('rejects 127.0.0.1:18545 with no protocol', () => {
    const result = simulateApprove(TOKEN, POOL, 1000n, '127.0.0.1:18545', WALLET)
    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('INVALID_RPC_URL')
  })

  it('rejects HTTP://127.0.0.1:18545 (uppercase)', () => {
    const result = simulateApprove(TOKEN, POOL, 1000n, 'HTTP://127.0.0.1:18545', WALLET)
    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('INVALID_RPC_URL')
  })

  it('attempts connection for http://192.168.1.1:18545 (private IP, now allowed)', () => {
    const result = simulateApprove(TOKEN, POOL, 1000n, 'http://192.168.1.1:18545', WALLET)
    expect(result.success).toBe(false)
    expect(result.revertReason).not.toBe('INVALID_RPC_URL')
    expect(result.revertReason).not.toBe('FORK_REQUIRED')
  })

  // --- Critique-specific RPC boundary (2 tests) ---

  it('runCritique with protocol-less URL fails', () => {
    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: BigInt(10 * 1e8),
      repayAmount: BigInt(545454),
      repayToken: TOKEN,
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: '127.0.0.1:18545',
    })
    expect(critique.passed).toBe(false)
  })

  it('runCritique with http://0.0.0.0:18545 fails', () => {
    const critique = runCritique({
      currentHf: hfToBigint(1.04),
      targetHf: hfToBigint(1.10),
      totalDebtBase: BigInt(10 * 1e8),
      repayAmount: BigInt(545454),
      repayToken: TOKEN,
      walletAddress: WALLET,
      borrowerAddress: BORROWER,
      poolAddress: POOL,
      rpcUrl: 'http://0.0.0.0:18545',
    })
    expect(critique.passed).toBe(false)
  })
})
