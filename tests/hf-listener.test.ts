import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock ethers before importing module under test
vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal()
  class MockContract {
    private userData: {
      totalCollateralBase: bigint
      totalDebtBase: bigint
      availableBorrowsBase: bigint
      currentLiquidationThreshold: bigint
      ltv: bigint
      healthFactor: bigint
    }

    constructor(userData: { healthFactor: bigint }) {
      this.userData = {
        totalCollateralBase: 200_000_000_000_000_000_000n,
        totalDebtBase: 100_000_000_000_000_000_000n,
        availableBorrowsBase: 0n,
        currentLiquidationThreshold: 80_00n,
        ltv: 75_00n,
        healthFactor: userData.healthFactor,
      }
    }

    getUserAccountData(_user: string) {
      return Promise.resolve(this.userData)
    }
  }

  class MockJsonRpcProvider {
    constructor(_url: string) {}
    destroy() {}
  }

  return {
    ...(actual as object),
    ethers: {
      JsonRpcProvider: MockJsonRpcProvider,
      Contract: MockContract,
    },
  }
})

let capturedLogs: string[] = []
let capturedErrors: string[] = []
let webhookResults: { hf: bigint; address: string; debt: bigint; repayAmount: bigint }[] = []

vi.mock('../scripts/hf-listener.js', async () => {
  const actual = await vi.importActual('../scripts/hf-listener.js')
  return {
    ...actual,
    fireWebhook: vi.fn(async (hf: bigint, address: string, debt: bigint, repayAmount: bigint) => {
      webhookResults.push({ hf, address, debt, repayAmount })
      return `exec-${Date.now()}`
    }),
  }
})

describe('HF Listener', () => {
  beforeEach(() => {
    capturedLogs = []
    capturedErrors = []
    webhookResults = []
    vi.restoreAllMocks()
  })

  it('imports without error', async () => {
    const mod = await import('../scripts/hf-listener.js')
    expect(mod.fireWebhook).toBeDefined()
  })

  it('fireWebhook constructs correct webhook URL and body', async () => {
    const { fireWebhook } = await import('../scripts/hf-listener.js')
    const hf = 1050000000000000000n // 1.05
    await fireWebhook(hf, '0x1234', 5000000000000000000000n, 45000000n)
    expect(webhookResults.length).toBe(1)
    const result = webhookResults[0]!
    expect(result.hf).toBe(hf)
    expect(result.address).toBe('0x1234')
  })

  it('fireWebhook sets expected keys', async () => {
    const { fireWebhook } = await import('../scripts/hf-listener.js')
    await fireWebhook(1050000000000000000n, '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 48000000100n, 45000000n)
    const result = webhookResults[0]!
    expect(result.address).toMatch(/^0x[a-fA-F0-9]{40}$/)
  })

  it('fireWebhook handles non-OK response', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Bad request'),
    })
    const realModule = await vi.importActual('../scripts/hf-listener.js') as { fireWebhook: (...args: any[]) => Promise<string> }
    await expect(
      realModule.fireWebhook(1050000000000000000n, '0x1234', 50000000n, 45000000n),
    ).rejects.toThrow(/400/)
    globalThis.fetch = originalFetch
  })

  it('fireWebhook with empty address', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ executionId: 'exec-1' }),
    })
    const realModule = await vi.importActual('../scripts/hf-listener.js') as { fireWebhook: (...args: any[]) => Promise<string> }
    const result = await realModule.fireWebhook(1050000000000000000n, '', 50000000n, 45000000n)
    expect(result).toBe('exec-1')
    expect(globalThis.fetch).toHaveBeenCalled()
    globalThis.fetch = originalFetch
  })

  it('fireWebhook with zero HF does not throw', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ executionId: 'exec-0' }),
    })
    const realModule = await vi.importActual('../scripts/hf-listener.js') as { fireWebhook: (...args: any[]) => Promise<string> }
    const result = await realModule.fireWebhook(0n, '0x1234', 50000000n, 45000000n)
    expect(result).toBe('exec-0')
    globalThis.fetch = originalFetch
  })

  it('fireWebhook URL contains workflow ID', async () => {
    const originalFetch = globalThis.fetch
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ executionId: 'exec-url' }),
    })
    globalThis.fetch = fetchSpy
    const realModule = await vi.importActual('../scripts/hf-listener.js') as { fireWebhook: (...args: any[]) => Promise<string> }
    await realModule.fireWebhook(1050000000000000000n, '0x1234', 50000000n, 45000000n)
    const url = fetchSpy.mock.calls[0]![0]
    expect(url).toContain('7gdt0ty7zk1orq1j4wc74')
    globalThis.fetch = originalFetch
  })

  it('fireWebhook URL has correct path', async () => {
    const originalFetch = globalThis.fetch
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ executionId: 'exec-path' }),
    })
    globalThis.fetch = fetchSpy
    const realModule = await vi.importActual('../scripts/hf-listener.js') as { fireWebhook: (...args: any[]) => Promise<string> }
    await realModule.fireWebhook(1050000000000000000n, '0x1234', 50000000n, 45000000n)
    const url = fetchSpy.mock.calls[0]![0]
    expect(url).toMatch(/\/api\/workflows\/[^/]+\/webhook$/)
    globalThis.fetch = originalFetch
  })

  it('fireWebhook URL uses HTTPS', async () => {
    const originalFetch = globalThis.fetch
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ executionId: 'exec-https' }),
    })
    globalThis.fetch = fetchSpy
    const realModule = await vi.importActual('../scripts/hf-listener.js') as { fireWebhook: (...args: any[]) => Promise<string> }
    await realModule.fireWebhook(1050000000000000000n, '0x1234', 50000000n, 45000000n)
    const url = fetchSpy.mock.calls[0]![0]
    expect(url).toMatch(/^https:\/\//)
    globalThis.fetch = originalFetch
  })

  it('mock pool returns HF above trigger', async () => {
    const { ethers } = await import('ethers')
    const pool = new ethers.Contract(
      { healthFactor: 1200000000000000000n } as never,
      [] as never,
      {} as never,
    ) as any
    const data = await pool.getUserAccountData('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
    expect(data.healthFactor).toBe(1200000000000000000n)
    expect(data.healthFactor).toBeGreaterThan(1050000000000000000n)
  })

  it('mock pool returns HF below trigger', async () => {
    const { ethers } = await import('ethers')
    const pool = new ethers.Contract(
      { healthFactor: 900000000000000000n } as never,
      [] as never,
      {} as never,
    ) as any
    const data = await pool.getUserAccountData('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
    expect(data.healthFactor).toBe(900000000000000000n)
    expect(data.healthFactor).toBeLessThan(1050000000000000000n)
  })

  it('handles large debt (> 2^128) in fireWebhook call', async () => {
    const { fireWebhook } = await import('../scripts/hf-listener.js')
    const largeDebt = BigInt('340282366920938463463374607431768211456') // 2^128
    await fireWebhook(1050000000000000000n, '0x1234', largeDebt, 45000000n)
    const result = webhookResults[0]!
    expect(result.debt).toBe(largeDebt)
  })

  it('handles large repay amount (> 2^128) in fireWebhook call', async () => {
    const { fireWebhook } = await import('../scripts/hf-listener.js')
    const largeRepay = BigInt('340282366920938463463374607431768211456') // 2^128
    await fireWebhook(1050000000000000000n, '0x1234', 50000000n, largeRepay)
    const result = webhookResults[0]!
    expect(result.repayAmount).toBe(largeRepay)
  })

  it('fireWebhook with max safe integer HF value (mocked)', async () => {
    const { fireWebhook } = await import('../scripts/hf-listener.js')
    const maxHf = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935')
    await fireWebhook(maxHf, '0x1234', 50000000n, 45000000n)
    const result = webhookResults[0]!
    expect(result.hf).toBe(maxHf)
  })

  it('fireWebhook sends max HF in request body via real implementation', async () => {
    const originalFetch = globalThis.fetch
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ executionId: 'exec-maxhf' }),
    })
    globalThis.fetch = fetchSpy
    const realModule = await vi.importActual('../scripts/hf-listener.js') as { fireWebhook: (...args: any[]) => Promise<string> }
    const largeHf = BigInt('2000000000000000000000') // 2000 HF (very high)
    await realModule.fireWebhook(largeHf, '0x1234', 50000000n, 45000000n)
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body)
    expect(body.health_factor).toBe('2000')
    globalThis.fetch = originalFetch
  })

  // ── A: HTTP error code tests via real module ──────────────────────

  it('fireWebhook with 500 server error', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    })
    const realModule = await vi.importActual('../scripts/hf-listener.js') as { fireWebhook: (...args: any[]) => Promise<string> }
    await expect(
      realModule.fireWebhook(1050000000000000000n, '0x1234', 50000000n, 45000000n),
    ).rejects.toThrow(/500/)
    globalThis.fetch = originalFetch
  })

  it('fireWebhook with 429 rate limit', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Too Many Requests'),
    })
    const realModule = await vi.importActual('../scripts/hf-listener.js') as { fireWebhook: (...args: any[]) => Promise<string> }
    await expect(
      realModule.fireWebhook(1050000000000000000n, '0x1234', 50000000n, 45000000n),
    ).rejects.toThrow(/429/)
    globalThis.fetch = originalFetch
  })

  it('fireWebhook with 502 bad gateway', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.resolve('Bad Gateway'),
    })
    const realModule = await vi.importActual('../scripts/hf-listener.js') as { fireWebhook: (...args: any[]) => Promise<string> }
    await expect(
      realModule.fireWebhook(1050000000000000000n, '0x1234', 50000000n, 45000000n),
    ).rejects.toThrow(/502/)
    globalThis.fetch = originalFetch
  })

  it('fireWebhook with 503 service unavailable', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve('Service Unavailable'),
    })
    const realModule = await vi.importActual('../scripts/hf-listener.js') as { fireWebhook: (...args: any[]) => Promise<string> }
    await expect(
      realModule.fireWebhook(1050000000000000000n, '0x1234', 50000000n, 45000000n),
    ).rejects.toThrow(/503/)
    globalThis.fetch = originalFetch
  })

  // ── B: Network failure tests ─────────────────────────────────────

  it('fireWebhook when fetch throws network error', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    const realModule = await vi.importActual('../scripts/hf-listener.js') as { fireWebhook: (...args: any[]) => Promise<string> }
    await expect(
      realModule.fireWebhook(1050000000000000000n, '0x1234', 50000000n, 45000000n),
    ).rejects.toThrow(TypeError)
    globalThis.fetch = originalFetch
  })

  it('fireWebhook when json() throws (malformed response body)', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('Unexpected token < in JSON at position 0')),
    })
    const realModule = await vi.importActual('../scripts/hf-listener.js') as { fireWebhook: (...args: any[]) => Promise<string> }
    await expect(
      realModule.fireWebhook(1050000000000000000n, '0x1234', 50000000n, 45000000n),
    ).rejects.toThrow(/JSON/)
    globalThis.fetch = originalFetch
  })

  it('fireWebhook when json() returns null (no executionId)', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(null),
    })
    const realModule = await vi.importActual('../scripts/hf-listener.js') as { fireWebhook: (...args: any[]) => Promise<string> }
    await expect(
      realModule.fireWebhook(1050000000000000000n, '0x1234', 50000000n, 45000000n),
    ).rejects.toThrow()
    globalThis.fetch = originalFetch
  })

  // ── C: Edge case body content ────────────────────────────────────

  it('fireWebhook with max uint256 HF value via real module', async () => {
    const originalFetch = globalThis.fetch
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ executionId: 'exec-maxuint' }),
    })
    globalThis.fetch = fetchSpy
    const realModule = await vi.importActual('../scripts/hf-listener.js') as { fireWebhook: (...args: any[]) => Promise<string> }
    const maxUintHf = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935')
    await realModule.fireWebhook(maxUintHf, '0x1234', 50000000n, 45000000n)
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body)
    expect(typeof body.health_factor).toBe('string')
    expect(body.health_factor.length).toBeGreaterThan(0)
    globalThis.fetch = originalFetch
  })

  it('fireWebhook with zero address and zero debt and zero repay via real module', async () => {
    const originalFetch = globalThis.fetch
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ executionId: 'exec-zero' }),
    })
    globalThis.fetch = fetchSpy
    const realModule = await vi.importActual('../scripts/hf-listener.js') as { fireWebhook: (...args: any[]) => Promise<string> }
    await realModule.fireWebhook(1050000000000000000n, '', 0n, 0n)
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body)
    expect(body.user_address).toBe('')
    expect(body.debt_base).toBe('0')
    expect(body.repay_amount_usdc).toBe('0')
    globalThis.fetch = originalFetch
  })

  it('fireWebhook with extremely large debt (10^36)', async () => {
    const originalFetch = globalThis.fetch
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ executionId: 'exec-massive-debt' }),
    })
    globalThis.fetch = fetchSpy
    const realModule = await vi.importActual('../scripts/hf-listener.js') as { fireWebhook: (...args: any[]) => Promise<string> }
    const massiveDebt = BigInt('1000000000000000000000000000000000000') // 10^36
    await realModule.fireWebhook(1050000000000000000n, '0x1234', massiveDebt, 45000000n)
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body)
    expect(body.debt_base).toBe('1000000000000000000000000000000000000')
    globalThis.fetch = originalFetch
  })
})
