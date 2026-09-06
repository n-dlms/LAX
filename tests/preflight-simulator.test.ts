import { describe, it, expect, vi, beforeEach } from 'vitest'

// The simulator shells out to process.execPath with a JSON spec, so we mock
// child_process.execFileSync and assert on the spec / return contract.
const mockExecFileSync = vi.fn()
vi.mock('child_process', () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}))

import { simulateApprove, simulateRepay, simulateFullMitigation } from '../src/preflight-simulator.js'

const TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const POOL = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5'
const WALLET = '0x8Bb7870242e75132Fd62265cA8ABF771d49C821C'
const BORROWER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const RPC_URL = 'http://127.0.0.1:18545'

function specOf(callIndex = 0): {
  rpcUrl: string; from: string; to: string; data: string; timeoutMs: number
} {
  const args = mockExecFileSync.mock.calls[callIndex]!
  // execFileSync(execPath, [helperPath, specJson], options)
  return JSON.parse((args[1] as string[])[1]!)
}

function helperReturn(value: { ok: boolean; reason?: string; result?: string }): void {
  mockExecFileSync.mockReturnValue(JSON.stringify(value))
}

beforeEach(() => {
  mockExecFileSync.mockReset()
})

describe('simulateApprove', () => {
  it('returns success when approve call succeeds', () => {
    helperReturn({ ok: true, result: '0x1' })
    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)
    expect(result.success).toBe(true)
    expect(result.stage).toBe('APPROVE')
  })

  it('sends the wallet address as from', () => {
    helperReturn({ ok: true })
    simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)
    expect(specOf().from.toLowerCase()).toBe(WALLET.toLowerCase())
  })

  it('uses default CONFIG.WALLET_ADDRESS when no from provided', () => {
    helperReturn({ ok: true })
    simulateApprove(TOKEN, POOL, 1000000n, RPC_URL)
    expect(specOf().from.toLowerCase()).toBe(WALLET.toLowerCase())
  })

  it('encodes approve(address,uint256) with spender and amount', () => {
    helperReturn({ ok: true })
    simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)
    const data = specOf().data
    expect(data.startsWith('0x095ea7b3')).toBe(true)
    expect(data.slice(10, 74)).toBe(POOL.toLowerCase().slice(2).padStart(64, '0'))
    expect(BigInt('0x' + data.slice(74, 138))).toBe(1000000n)
  })

  it('targets the token contract', () => {
    helperReturn({ ok: true })
    simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)
    expect(specOf().to.toLowerCase()).toBe(TOKEN.toLowerCase())
  })

  it('passes the rpc url through in the spec', () => {
    helperReturn({ ok: true })
    simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)
    expect(specOf().rpcUrl).toBe(RPC_URL)
  })

  it('returns INVALID_RPC_URL for malformed RPC strings', () => {
    for (const bad of ['127.0.0.1:18545', 'HTTP://127.0.0.1', 'ftp://x', '']) {
      const result = simulateApprove(TOKEN, POOL, 1000n, bad, WALLET)
      expect(result.success).toBe(false)
      expect(result.revertReason).toBe('INVALID_RPC_URL')
      expect(mockExecFileSync).not.toHaveBeenCalled()
      mockExecFileSync.mockClear()
    }
  })

  it('surfaces helper revert reasons', () => {
    helperReturn({ ok: false, reason: 'ERC20: insufficient allowance' })
    const result = simulateApprove(TOKEN, POOL, 1000n, RPC_URL, WALLET)
    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('ERC20: insufficient allowance')
    expect(result.rawOutput).toBe('ERC20: insufficient allowance')
  })

  it('captures duration', () => {
    helperReturn({ ok: true })
    const result = simulateApprove(TOKEN, POOL, 1000n, RPC_URL, WALLET)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })
})

describe('simulateRepay', () => {
  it('returns success when repay call succeeds', () => {
    helperReturn({ ok: true, result: '0x1' })
    const result = simulateRepay(POOL, TOKEN, 50000000n, 2, BORROWER, RPC_URL, WALLET)
    expect(result.success).toBe(true)
    expect(result.stage).toBe('REPAY')
  })

  it('encodes repay(address,uint256,uint256,address) correctly', () => {
    helperReturn({ ok: true })
    simulateRepay(POOL, TOKEN, 50000000n, 2, BORROWER, RPC_URL, WALLET)
    const data = specOf().data
    expect(data.startsWith('0x573ade81')).toBe(true)
    expect(data.slice(10, 74)).toBe(TOKEN.toLowerCase().slice(2).padStart(64, '0'))
    expect(BigInt('0x' + data.slice(74, 138))).toBe(50000000n)
    expect(BigInt('0x' + data.slice(138, 202))).toBe(2n)
    expect(data.slice(202, 266)).toBe(BORROWER.toLowerCase().slice(2).padStart(64, '0'))
  })

  it('targets the pool contract', () => {
    helperReturn({ ok: true })
    simulateRepay(POOL, TOKEN, 50000000n, 2, BORROWER, RPC_URL, WALLET)
    expect(specOf().to.toLowerCase()).toBe(POOL.toLowerCase())
  })

  it('handles repay revert', () => {
    helperReturn({ ok: false, reason: 'ERC20: transfer amount exceeds allowance' })
    const result = simulateRepay(POOL, TOKEN, 50000000n, 2, BORROWER, RPC_URL, WALLET)
    expect(result.success).toBe(false)
    expect(result.revertReason).toContain('exceeds allowance')
  })

  it('returns INVALID_RPC_URL without spawning the helper', () => {
    const result = simulateRepay(POOL, TOKEN, 1n, 2, BORROWER, 'no-protocol', WALLET)
    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('INVALID_RPC_URL')
    expect(mockExecFileSync).not.toHaveBeenCalled()
  })
})

describe('simulateFullMitigation', () => {
  it('returns success when approve and repay both pass', () => {
    helperReturn({ ok: true })
    const result = simulateFullMitigation(BORROWER, TOKEN, 50000000n, RPC_URL, WALLET)
    expect(result.success).toBe(true)
    expect(result.stage).toBe('FULL')
    expect(mockExecFileSync).toHaveBeenCalledTimes(2)
  })

  it('fails early when approve simulation fails', () => {
    helperReturn({ ok: false, reason: 'TOKEN_NOT_DEPLOYED' })
    const result = simulateFullMitigation(BORROWER, TOKEN, 50000000n, RPC_URL, WALLET)
    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('APPROVE_FAILED: TOKEN_NOT_DEPLOYED')
    expect(mockExecFileSync).toHaveBeenCalledTimes(1)
  })

  it('fails when repay fails despite approve passing', () => {
    mockExecFileSync
      .mockReturnValueOnce(JSON.stringify({ ok: true }))
      .mockReturnValueOnce(JSON.stringify({ ok: false, reason: 'ERC20: transfer amount exceeds balance' }))
    const result = simulateFullMitigation(BORROWER, TOKEN, 50000000n, RPC_URL, WALLET)
    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('REPAY_FAILED: ERC20: transfer amount exceeds balance')
    expect(mockExecFileSync).toHaveBeenCalledTimes(2)
  })

  it('captures total duration across both calls', () => {
    helperReturn({ ok: true })
    const result = simulateFullMitigation(BORROWER, TOKEN, 50000000n, RPC_URL, WALLET)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('handles zero repay amount by still simulating (gate rejects zero separately)', () => {
    helperReturn({ ok: true })
    const result = simulateFullMitigation(BORROWER, TOKEN, 0n, RPC_URL, WALLET)
    expect(result.success).toBe(true)
    const second = specOf(1)
    expect(BigInt('0x' + second.data.slice(74, 138))).toBe(0n)
  })

  it('returns INVALID_RPC_URL for protocol-less urls', () => {
    const result = simulateFullMitigation(BORROWER, TOKEN, 1n, '127.0.0.1:18545', WALLET)
    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('INVALID_RPC_URL')
  })
})

describe('bigint and encoding boundaries', () => {
  it.each([
    ['max uint256', BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935')],
    ['minimum non-zero', 1n],
    ['2^128 - 1', BigInt('340282366920938463463374607431768211455')],
    ['10^18', 10n ** 18n],
    ['10^30', 10n ** 30n],
    ['> Number.MAX_SAFE_INTEGER', BigInt('900719925474099312345')],
  ])('round-trips %s amounts exactly', (_name, amount) => {
    helperReturn({ ok: true })
    simulateApprove(TOKEN, POOL, amount, RPC_URL, WALLET)
    const data = specOf().data
    expect(BigInt('0x' + data.slice(74, 138))).toBe(amount)
  })

  it('passes negative bigint through (invalid uint — the chain rejects it, we do not clamp)', () => {
    helperReturn({ ok: true })
    simulateApprove(TOKEN, POOL, -5n, RPC_URL, WALLET)
    const data = specOf().data
    expect(data.startsWith('0x095ea7b3')).toBe(true)
    expect(data.slice(74)).toContain('-5')
  })
})

describe('helper crash handling', () => {
  it('maps execFileSync throw to SIMULATION_ERROR', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('spawn failed\n  at ...') })
    const result = simulateApprove(TOKEN, POOL, 1000n, RPC_URL, WALLET)
    expect(result.success).toBe(false)
    expect(result.revertReason).toContain('SIMULATION_ERROR')
    expect(result.revertReason).toContain('spawn failed')
  })

  it('maps helper timeout (execFileSync abort) to SIMULATION_ERROR', () => {
    const err = new Error('Command timed out') as Error & { status?: unknown }
    err.status = null
    mockExecFileSync.mockImplementation(() => { throw err })
    const result = simulateApprove(TOKEN, POOL, 1000n, RPC_URL, WALLET)
    expect(result.success).toBe(false)
    expect(result.revertReason).toContain('SIMULATION_ERROR')
  })
})

// --- live helper tests against a real chain ---
// NOTE: the helper is a separate process, and sandboxed environments may forbid
// loopback between ancestor/pro descendant trees, so we do NOT host a fake
// JSON-RPC server here. When a real fork (anvil) is reachable — the normal
// local demo setup — the helper is exercised end-to-end against it; otherwise
// these tests skip. The two tests at the bottom run everywhere.
// Probed at collection time — skipIf() reads it before hooks run.
const FORK_URL = process.env.LAX_FORK_RPC ?? 'http://127.0.0.1:18545'
const forkLive = await fetch(FORK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
  signal: AbortSignal.timeout(2000),
}).then((r) => r.ok).catch(() => false)

describe('preflight-call.mjs helper (live subprocess)', () => {
  function runHelper(spec: object): string {
    // direct import so the child_process mock above does not intercept this
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
    const { fileURLToPath } = require('node:url') as typeof import('node:url')
    const { dirname, join } = require('node:path') as typeof import('node:path')
    const helper = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'preflight-call.mjs')
    return execFileSync(process.execPath, [helper, JSON.stringify(spec)], { encoding: 'utf-8', timeout: 10_000 })
  }

  it.skipIf(!forkLive)('returns a hex result for a live view call', () => {
    // getUserAccountData on the live Aave fork — real end-to-end helper run
    const calldata = '0xbf92857c' + 'f39fd6e51aad88f6f4ce6ab8827279cfffb92266'.padStart(64, '0')
    const out = runHelper({ rpcUrl: FORK_URL, from: WALLET, to: POOL, data: calldata })
    const parsed = JSON.parse(out) as { ok: boolean; result?: string }
    expect(parsed.ok).toBe(true)
    expect(parsed.result).toMatch(/^0x[0-9a-f]+$/)
    expect(parsed.result!.length).toBe(2 + 6 * 64)
  })

  it.skipIf(!forkLive)('surfaces a real revert reason from the chain', () => {
    // repay with onBehalfOf = the wallet (which has no debt) reverts on-chain
    const repayData = '0x573ade81'
      + '833589fcd6edb6e08f4c7c32d4f71b54bda02913'.padStart(64, '0')
      + (32401283n).toString(16).padStart(64, '0')
      + (2n).toString(16).padStart(64, '0')
      + WALLET.toLowerCase().slice(2).padStart(64, '0')
    const out = runHelper({ rpcUrl: FORK_URL, from: WALLET, to: POOL, data: repayData })
    const parsed = JSON.parse(out) as { ok: boolean; reason?: string }
    expect(parsed.ok).toBe(false)
    expect(parsed.reason).toBeTruthy()
  })

  it('flags unreachable RPCs as RPC_UNREACHABLE', () => {
    const out = runHelper({ rpcUrl: 'http://127.0.0.1:1', from: WALLET, to: TOKEN, data: '0x095ea7b3' + '0'.repeat(128), timeoutMs: 2000 })
    const parsed = JSON.parse(out) as { ok: boolean; reason?: string }
    expect(parsed.ok).toBe(false)
    expect(parsed.reason).toContain('RPC_UNREACHABLE')
  })

  it('rejects protocol-less rpc urls', () => {
    const out = runHelper({ rpcUrl: '127.0.0.1:18545', from: WALLET, to: TOKEN, data: '0x095ea7b3' + '0'.repeat(128) })
    const parsed = JSON.parse(out) as { ok: boolean; reason?: string }
    expect(parsed.ok).toBe(false)
    expect(parsed.reason).toBe('INVALID_RPC_URL')
  })
})
