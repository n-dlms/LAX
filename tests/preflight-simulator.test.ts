import { describe, it, expect, vi, beforeEach } from 'vitest'
import { simulateApprove, simulateRepay, simulateFullMitigation, type SimulationResult } from '../src/preflight-simulator.js'

const mockExecSync = vi.fn()
vi.mock('child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}))

const RPC_URL = 'http://127.0.0.1:18545'
const TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const POOL = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5'
const WALLET = '0x8Bb7870242e75132Fd62265cA8ABF771d49C821C'
const BORROWER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

beforeEach(() => {
  vi.clearAllMocks()
})

function successResult(stdout = '') {
  return stdout
}

function errorResult(stderr: string) {
  const err = new Error(stderr)
  Object.defineProperty(err, 'stderr', { value: stderr })
  throw err
}

describe('simulateApprove', () => {
  it('returns success when approve call succeeds', () => {
    mockExecSync.mockReturnValueOnce(successResult(''))

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(true)
    expect(result.stage).toBe('APPROVE')
    expect(result.revertReason).toBeUndefined()
    expect(mockExecSync).toHaveBeenCalledOnce()
  })

  it('includes --from flag with wallet address', () => {
    mockExecSync.mockReturnValueOnce(successResult(''))

    simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    const call = mockExecSync.mock.calls[0]![0] as string
    expect(call).toContain('--rpc-url')
    expect(call).toContain(RPC_URL)
    expect(call).toContain(`--from ${WALLET}`)
  })

  it('uses default CONFIG.WALLET_ADDRESS when no from provided', () => {
    mockExecSync.mockReturnValueOnce(successResult(''))

    simulateApprove(TOKEN, POOL, 1000000n, RPC_URL)

    const call = mockExecSync.mock.calls[0]![0] as string
    expect(call).toContain('--from 0x8Bb7870242e75132Fd62265cA8ABF771d49C821C')
  })

  it('simulates against remote RPCs (no local-fork gate)', () => {
    mockExecSync.mockReturnValueOnce(successResult(''))

    const result = simulateApprove(TOKEN, POOL, 1000000n, 'https://mainnet.base.org', WALLET)

    expect(result.success).toBe(true)
    expect(mockExecSync).toHaveBeenCalledOnce()
  })

  it('returns INVALID_RPC_URL for malformed RPC strings', () => {
    const result = simulateApprove(TOKEN, POOL, 1000000n, '', WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('INVALID_RPC_URL')
  })

  it('parses revert reason from stderr', () => {
    mockExecSync.mockImplementationOnce(() =>
      errorResult('error: execution reverted: ERC20: insufficient balance'),
    )

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('ERC20: insufficient balance')
  })

  it('handles custom error revert reasons', () => {
    mockExecSync.mockImplementationOnce(() =>
      errorResult("error: execution reverted with custom error 'InvalidAllowance()'"),
    )

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe("InvalidAllowance()")
  })

  it('returns UNKNOWN_REVERT for unparseable stderr', () => {
    mockExecSync.mockImplementationOnce(() =>
      errorResult('some random error without a revert pattern'),
    )

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('UNKNOWN_REVERT')
  })

  it('captures duration on success', () => {
    mockExecSync.mockReturnValueOnce(successResult(''))

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('includes rawOutput on failure', () => {
    const stderr = 'error: execution reverted: ERC20: insufficient allowance'
    mockExecSync.mockImplementationOnce(() => errorResult(stderr))

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.rawOutput).toBe(stderr)
  })
})

describe('simulateRepay', () => {
  it('returns success when repay call succeeds', () => {
    mockExecSync.mockReturnValueOnce(successResult(''))

    const result = simulateRepay(POOL, TOKEN, 1000000n, 2, BORROWER, RPC_URL, WALLET)

    expect(result.success).toBe(true)
    expect(result.stage).toBe('REPAY')
  })

  it('passes correct repay parameters', () => {
    mockExecSync.mockReturnValueOnce(successResult(''))

    simulateRepay(POOL, TOKEN, 500000n, 2, BORROWER, RPC_URL, WALLET)

    const call = mockExecSync.mock.calls[0]![0] as string
    expect(call).toContain(POOL)
    expect(call).toContain('"repay(address,uint256,uint256,address)"')
    expect(call).toContain(TOKEN)
    expect(call).toContain('500000')
    expect(call).toContain('2')
    expect(call).toContain(BORROWER)
  })

  it('simulates repay against remote RPCs (no local-fork gate)', () => {
    mockExecSync.mockReturnValueOnce(successResult(''))

    const result = simulateRepay(POOL, TOKEN, 1000000n, 2, BORROWER, 'https://mainnet.base.org', WALLET)

    expect(result.success).toBe(true)
    expect(mockExecSync).toHaveBeenCalledOnce()
  })

  it('handles repay revert', () => {
    mockExecSync.mockImplementationOnce(() =>
      errorResult('error: execution reverted: ERC20: insufficient allowance'),
    )

    const result = simulateRepay(POOL, TOKEN, 1000000n, 2, BORROWER, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('ERC20: insufficient allowance')
  })
})

describe('simulateFullMitigation', () => {
  it('returns success when approve and repay both pass', () => {
    mockExecSync.mockReturnValueOnce(successResult())
      .mockReturnValueOnce(successResult())

    const result = simulateFullMitigation(BORROWER, TOKEN, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(true)
    expect(result.stage).toBe('FULL')
    expect(mockExecSync).toHaveBeenCalledTimes(2)
  })

  it('fails early when approve simulation fails', () => {
    mockExecSync.mockImplementationOnce(() =>
      errorResult('error: execution reverted: ERC20: insufficient balance'),
    )

    const result = simulateFullMitigation(BORROWER, TOKEN, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toContain('APPROVE_FAILED')
    expect(mockExecSync).toHaveBeenCalledTimes(1)
  })

  it('fails when repay simulation fails despite approve passing', () => {
    mockExecSync.mockReturnValueOnce(successResult())
      .mockImplementationOnce(() =>
        errorResult('error: execution reverted: ERC20: insufficient allowance'),
      )

    const result = simulateFullMitigation(BORROWER, TOKEN, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toContain('REPAY_FAILED')
    expect(mockExecSync).toHaveBeenCalledTimes(2)
  })

  it('simulates full mitigation against remote RPCs', () => {
    mockExecSync.mockReturnValueOnce(successResult())
      .mockReturnValueOnce(successResult())

    const result = simulateFullMitigation(BORROWER, TOKEN, 1000000n, 'https://mainnet.base.org', WALLET)

    expect(result.success).toBe(true)
    expect(mockExecSync).toHaveBeenCalledTimes(2)
  })

  it('captures total duration across both calls', () => {
    mockExecSync.mockReturnValueOnce(successResult())
      .mockReturnValueOnce(successResult())

    const result = simulateFullMitigation(BORROWER, TOKEN, 1000000n, RPC_URL, WALLET)

    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('handles zero repay amount', () => {
    mockExecSync.mockReturnValueOnce(successResult())
      .mockReturnValueOnce(successResult())

    const result = simulateFullMitigation(BORROWER, TOKEN, 0n, RPC_URL, WALLET)

    expect(result.success).toBe(true)
  })
})

describe('edge cases', () => {
  it('handles max uint256 amount', () => {
    const maxUint = (1n << 256n) - 1n
    mockExecSync.mockReturnValueOnce(successResult())
      .mockReturnValueOnce(successResult())

    const result = simulateFullMitigation(BORROWER, TOKEN, maxUint, RPC_URL, WALLET)

    expect(result.success).toBe(true)
    const call = mockExecSync.mock.calls[0]![0] as string
    expect(call).toContain(maxUint.toString())
  })

  it('handles connection refused error', () => {
    mockExecSync.mockImplementationOnce(() =>
      errorResult('Error: connect ECONNREFUSED 127.0.0.1:18545'),
    )

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('UNKNOWN_REVERT')
  })

  it('handles timeout error', () => {
    mockExecSync.mockImplementationOnce(() => {
      const err = new Error('Command timed out after 5000ms')
      Object.defineProperty(err, 'stderr', { value: 'Timeout\n' })
      throw err
    })

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
  })

  it('handles localhost prefix as local fork', () => {
    mockExecSync.mockReturnValueOnce(successResult())

    const result = simulateApprove(TOKEN, POOL, 1000000n, 'http://localhost:8545', WALLET)

    expect(result.success).toBe(true)
  })

  it('detects token not deployed (revert from cast)', () => {
    mockExecSync.mockImplementationOnce(() =>
      errorResult('error: execution reverted: ERC20: token not found at address 0xdead'),
    )

    const result = simulateApprove('0x0000000000000000000000000000000000000001', POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toContain('token not found')
  })

  it('simulates against any reachable remote RPC address', () => {
    mockExecSync.mockReturnValueOnce(successResult(''))
      .mockReturnValueOnce(successResult(''))

    const result = simulateFullMitigation(BORROWER, TOKEN, 1000000n, 'http://192.168.1.1:8545', WALLET)

    expect(result.success).toBe(true)
    expect(result.revertReason).toBeUndefined()
  })
})

describe('gas estimation edge cases', () => {
  it('extracts gasUsed from JSON stdout', () => {
    mockExecSync.mockReturnValueOnce(successResult('{"gasUsed": "21000"}'))

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(true)
    expect(result.gasEstimate).toBe('21000')
  })

  it('handles gasUsed without whitespace after colon', () => {
    mockExecSync.mockReturnValueOnce(successResult('{"gasUsed":"31000"}'))

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.gasEstimate).toBe('31000')
  })

  it('handles gasUsed with multiple spaces after colon', () => {
    mockExecSync.mockReturnValueOnce(successResult('{"gasUsed":  "41000"}'))

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.gasEstimate).toBe('41000')
  })

  it('returns undefined gasEstimate when gasUsed field is missing', () => {
    mockExecSync.mockReturnValueOnce(successResult('{"blockNumber": "123"}'))

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(true)
    expect(result.gasEstimate).toBeUndefined()
  })

  it('returns undefined gasEstimate when stdout is empty', () => {
    mockExecSync.mockReturnValueOnce(successResult(''))

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(true)
    expect(result.gasEstimate).toBeUndefined()
  })

  it('extracts gasEstimate from first gasUsed when multiple matches exist', () => {
    mockExecSync.mockReturnValueOnce(successResult('{"gasUsed": "51000"}{"gasUsed": "61000"}'))

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.gasEstimate).toBe('51000')
  })

  it('extracts gasEstimate from non-JSON text containing gasUsed pattern', () => {
    mockExecSync.mockReturnValueOnce(successResult('some text "gasUsed": "71000" more text'))

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.gasEstimate).toBe('71000')
  })

  it('handles very large gasUsed values', () => {
    mockExecSync.mockReturnValueOnce(successResult('{"gasUsed": "18446744073709551615"}'))

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.gasEstimate).toBe('18446744073709551615')
  })

  it('propagates gasEstimate from repay in simulateFullMitigation', () => {
    mockExecSync.mockReturnValueOnce(successResult('{"gasUsed": "10000"}'))
      .mockReturnValueOnce(successResult('{"gasUsed": "81000"}'))

    const result = simulateFullMitigation(BORROWER, TOKEN, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(true)
    expect(result.gasEstimate).toBe('81000')
  })

  it('does not include gasEstimate from approve when repay fails', () => {
    mockExecSync.mockReturnValueOnce(successResult('{"gasUsed": "10000"}'))
      .mockImplementationOnce(() =>
        errorResult('error: execution reverted: insufficient funds'),
      )

    const result = simulateFullMitigation(BORROWER, TOKEN, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.gasEstimate).toBeUndefined()
  })
})

describe('RPC URL edge cases', () => {
  it('accepts localhost with different port (8545)', () => {
    mockExecSync.mockReturnValueOnce(successResult())

    const result = simulateApprove(TOKEN, POOL, 1000000n, 'http://localhost:8545', WALLET)

    expect(result.success).toBe(true)
  })

  it('accepts 127.0.0.1 without explicit port', () => {
    mockExecSync.mockReturnValueOnce(successResult())

    const result = simulateApprove(TOKEN, POOL, 1000000n, 'http://127.0.0.1', WALLET)

    expect(result.success).toBe(true)
  })

  it('accepts 127.0.0.1 with trailing slash', () => {
    mockExecSync.mockReturnValueOnce(successResult())

    const result = simulateApprove(TOKEN, POOL, 1000000n, 'http://127.0.0.1:18545/', WALLET)

    expect(result.success).toBe(true)
  })

  it('accepts 127.0.0.1 with query parameter', () => {
    mockExecSync.mockReturnValueOnce(successResult())

    const result = simulateApprove(TOKEN, POOL, 1000000n, 'http://127.0.0.1:18545?foo=bar', WALLET)

    expect(result.success).toBe(true)
  })

  it('accepts 127.0.0.1 with URL path', () => {
    mockExecSync.mockReturnValueOnce(successResult())

    const result = simulateApprove(TOKEN, POOL, 1000000n, 'http://127.0.0.1/test', WALLET)

    expect(result.success).toBe(true)
  })

  it('rejects localhost:18545 without protocol prefix', () => {
    const result = simulateApprove(TOKEN, POOL, 1000000n, 'localhost:18545', WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('INVALID_RPC_URL')
  })

  it('accepts http://localhost without port', () => {
    mockExecSync.mockReturnValueOnce(successResult())

    const result = simulateApprove(TOKEN, POOL, 1000000n, 'http://localhost', WALLET)

    expect(result.success).toBe(true)
  })

  it('accepts https://127.0.0.1 as a remote RPC', () => {
    mockExecSync.mockReturnValueOnce(successResult())

    const result = simulateApprove(TOKEN, POOL, 1000000n, 'https://127.0.0.1:18545', WALLET)

    expect(result.success).toBe(true)
  })

  it('rejects uppercase HTTP://LOCALHOST (scheme must be lowercase)', () => {
    const result = simulateApprove(TOKEN, POOL, 1000000n, 'HTTP://LOCALHOST:8545', WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('INVALID_RPC_URL')
  })

  it('rejects empty RPC URL string', () => {
    const result = simulateApprove(TOKEN, POOL, 1000000n, '', WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('INVALID_RPC_URL')
  })
})

describe('error edge cases', () => {
  it('handles stderr with emoji characters', () => {
    mockExecSync.mockImplementationOnce(() =>
      errorResult('error: execution reverted: ❌ insufficient balance'),
    )

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('❌ insufficient balance')
  })

  it('handles stderr with JSON error format', () => {
    mockExecSync.mockImplementationOnce(() =>
      errorResult('{"error": {"code": -32000, "message": "execution reverted"}}'),
    )

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('UNKNOWN_REVERT')
  })

  it('handles stderr with HTML error page', () => {
    mockExecSync.mockImplementationOnce(() =>
      errorResult('<html><body><h1>502 Bad Gateway</h1></body></html>'),
    )

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('UNKNOWN_REVERT')
  })

  it('handles Error without stderr property by falling back to message', () => {
    mockExecSync.mockImplementationOnce(() => {
      throw new Error('execution reverted: not enough funds')
    })

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('not enough funds')
  })

  it('handles Error with null stderr by falling back to message', () => {
    mockExecSync.mockImplementationOnce(() => {
      const err = new Error('execution reverted: gas limit exceeded')
      Object.defineProperty(err, 'stderr', { value: null })
      throw err
    })

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('gas limit exceeded')
  })

  it('handles empty string stderr', () => {
    mockExecSync.mockImplementationOnce(() =>
      errorResult(''),
    )

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('UNKNOWN_REVERT')
  })

  it('handles mixed case revert reason with /i flag', () => {
    mockExecSync.mockImplementationOnce(() =>
      errorResult('error: EXECUTION REVERTED: ERC20: insufficient allowance'),
    )

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('ERC20: insufficient allowance')
  })

  it('handles custom error with dollar signs and special regex characters', () => {
    mockExecSync.mockImplementationOnce(() =>
      errorResult("error: execution reverted with custom error 'TransferFailed(0x$dead,100.5%)'"),
    )

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('TransferFailed(0x$dead,100.5%)')
  })

  it('handles -32000 code error with simple message', () => {
    mockExecSync.mockImplementationOnce(() =>
      errorResult('(code: -32000) message: out of gas'),
    )

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('out of gas')
  })

  it('handles -32000 code error with multi-line message', () => {
    mockExecSync.mockImplementationOnce(() =>
      errorResult('(code: -32000)\nmessage: execution reverted\nreason: insufficient balance'),
    )

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('execution reverted')
  })

  it('handles multiple error lines in stderr', () => {
    mockExecSync.mockImplementationOnce(() =>
      errorResult('Error: call failed\n\nerror: execution reverted: call depth exceeded'),
    )

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('call depth exceeded')
  })

  it('handles execSync throwing a plain object', () => {
    mockExecSync.mockImplementationOnce(() => {
      throw { code: 1, message: 'something broke' }
    })

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('UNKNOWN_REVERT')
  })

  it('handles execSync throwing a string', () => {
    mockExecSync.mockImplementationOnce(() => {
      throw 'cast call failed unexpectedly'
    })

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('UNKNOWN_REVERT')
  })

  it('trims surrounding whitespace from revert reason', () => {
    mockExecSync.mockImplementationOnce(() =>
      errorResult('error: execution reverted:   insufficient balance   '),
    )

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('insufficient balance')
  })

  it('handles stderr with tab characters in revert reason', () => {
    mockExecSync.mockImplementationOnce(() =>
      errorResult('error: execution reverted: \tinsufficient\tbalance'),
    )

    const result = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('insufficient\tbalance')
  })
})

describe('BigInt boundary tests', () => {
  it('passes max uint256 amount to approve simulation', () => {
    const maxUint = (1n << 256n) - 1n
    mockExecSync.mockReturnValueOnce(successResult())

    simulateApprove(TOKEN, POOL, maxUint, RPC_URL, WALLET)

    const call = mockExecSync.mock.calls[0]![0] as string
    expect(call).toContain(maxUint.toString())
  })

  it('passes max uint256 amount to repay simulation', () => {
    const maxUint = (1n << 256n) - 1n
    mockExecSync.mockReturnValueOnce(successResult())

    simulateRepay(POOL, TOKEN, maxUint, 2, BORROWER, RPC_URL, WALLET)

    const call = mockExecSync.mock.calls[0]![0] as string
    expect(call).toContain(maxUint.toString())
  })

  it('passes minimum non-zero amount (1n) to approve', () => {
    mockExecSync.mockReturnValueOnce(successResult())

    simulateApprove(TOKEN, POOL, 1n, RPC_URL, WALLET)

    const call = mockExecSync.mock.calls[0]![0] as string
    expect(call).toContain('1')
  })

  it('passes zero amount to repay simulation', () => {
    mockExecSync.mockReturnValueOnce(successResult())

    simulateRepay(POOL, TOKEN, 0n, 2, BORROWER, RPC_URL, WALLET)

    const call = mockExecSync.mock.calls[0]![0] as string
    expect(call).toContain(' 0 ')
  })

  it('passes negative bigint amount to approve simulation', () => {
    mockExecSync.mockReturnValueOnce(successResult())

    simulateApprove(TOKEN, POOL, -1n, RPC_URL, WALLET)

    const call = mockExecSync.mock.calls[0]![0] as string
    expect(call).toContain('-1')
  })

  it('passes amount exceeding Number.MAX_SAFE_INTEGER to approve', () => {
    const unsafe = BigInt(Number.MAX_SAFE_INTEGER) + 2n
    mockExecSync.mockReturnValueOnce(successResult())

    simulateApprove(TOKEN, POOL, unsafe, RPC_URL, WALLET)

    const call = mockExecSync.mock.calls[0]![0] as string
    expect(call).toContain(unsafe.toString())
  })

  it('passes 2^128 - 1 amount to repay simulation', () => {
    const amount = (1n << 128n) - 1n
    mockExecSync.mockReturnValueOnce(successResult())

    simulateRepay(POOL, TOKEN, amount, 2, BORROWER, RPC_URL, WALLET)

    const call = mockExecSync.mock.calls[0]![0] as string
    expect(call).toContain(amount.toString())
  })

  it('passes 10^18 amount (1 token with 18 decimals) to approve', () => {
    const amount = 10n ** 18n
    mockExecSync.mockReturnValueOnce(successResult())

    simulateApprove(TOKEN, POOL, amount, RPC_URL, WALLET)

    const call = mockExecSync.mock.calls[0]![0] as string
    expect(call).toContain('1000000000000000000')
  })

  it('passes 10^30 huge amount to repay simulation', () => {
    const amount = 10n ** 30n
    mockExecSync.mockReturnValueOnce(successResult())

    simulateRepay(POOL, TOKEN, amount, 2, BORROWER, RPC_URL, WALLET)

    const call = mockExecSync.mock.calls[0]![0] as string
    expect(call).toContain(amount.toString())
  })

  it('passes negative bigint to repay and preserves minus sign in command', () => {
    mockExecSync.mockReturnValueOnce(successResult())

    simulateRepay(POOL, TOKEN, -1000000n, 2, BORROWER, RPC_URL, WALLET)

    const call = mockExecSync.mock.calls[0]![0] as string
    expect(call).toContain('-1000000')
  })
})

describe('simulateRepay specific', () => {
  it('works with interestRateMode 1 (stable)', () => {
    mockExecSync.mockReturnValueOnce(successResult())

    const result = simulateRepay(POOL, TOKEN, 1000000n, 1, BORROWER, RPC_URL, WALLET)

    expect(result.success).toBe(true)
    const call = mockExecSync.mock.calls[0]![0] as string
    expect(call).toContain(' 1 ')
  })

  it('passes invalid interestRateMode as cast argument without validation', () => {
    mockExecSync.mockReturnValueOnce(successResult())

    simulateRepay(POOL, TOKEN, 1000000n, 3 as 1 | 2, BORROWER, RPC_URL, WALLET)

    const call = mockExecSync.mock.calls[0]![0] as string
    expect(call).toContain(' 3 ')
  })

  it('handles very long onBehalfOf address', () => {
    const longAddress = '0x' + 'a'.repeat(40)
    mockExecSync.mockReturnValueOnce(successResult())

    simulateRepay(POOL, TOKEN, 1000000n, 2, longAddress, RPC_URL, WALLET)

    const call = mockExecSync.mock.calls[0]![0] as string
    expect(call).toContain(longAddress)
  })

  it('handles empty token address', () => {
    mockExecSync.mockReturnValueOnce(successResult())

    simulateRepay(POOL, '', 1000000n, 2, BORROWER, RPC_URL, WALLET)

    const call = mockExecSync.mock.calls[0]![0] as string
    expect(call).toContain('repay')
  })

  it('captures gasEstimate from repay stdout', () => {
    mockExecSync.mockReturnValueOnce(successResult('{"gasUsed": "91000"}'))

    const result = simulateRepay(POOL, TOKEN, 1000000n, 2, BORROWER, RPC_URL, WALLET)

    expect(result.success).toBe(true)
    expect(result.gasEstimate).toBe('91000')
  })

  it('handles custom error in repay simulation', () => {
    mockExecSync.mockImplementationOnce(() =>
      errorResult("error: execution reverted with custom error 'RepayNotAllowed()'"),
    )

    const result = simulateRepay(POOL, TOKEN, 1000000n, 2, BORROWER, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.revertReason).toBe('RepayNotAllowed()')
  })

  it('captures duration on successful repay', () => {
    mockExecSync.mockReturnValueOnce(successResult())

    const result = simulateRepay(POOL, TOKEN, 1000000n, 2, BORROWER, RPC_URL, WALLET)

    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('uses default CONFIG.WALLET_ADDRESS when no from provided for repay', () => {
    mockExecSync.mockReturnValueOnce(successResult())

    simulateRepay(POOL, TOKEN, 1000000n, 2, BORROWER, RPC_URL)

    const call = mockExecSync.mock.calls[0]![0] as string
    expect(call).toContain('--from 0x8Bb7870242e75132Fd62265cA8ABF771d49C821C')
  })
})

describe('simulateFullMitigation specific', () => {
  it('captures duration from approve failure', () => {
    mockExecSync.mockImplementationOnce(() =>
      errorResult('error: execution reverted: ERC20: insufficient balance'),
    )

    const result = simulateFullMitigation(BORROWER, TOKEN, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('captures total duration when repay fails after approve passes', () => {
    mockExecSync.mockReturnValueOnce(successResult())
      .mockImplementationOnce(() =>
        errorResult('error: execution reverted: insufficient funds'),
      )

    const result = simulateFullMitigation(BORROWER, TOKEN, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('propagates gasEstimate from repay on full success', () => {
    mockExecSync.mockReturnValueOnce(successResult())
      .mockReturnValueOnce(successResult('{"gasUsed": "101000"}'))

    const result = simulateFullMitigation(BORROWER, TOKEN, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(true)
    expect(result.gasEstimate).toBe('101000')
  })

  it('includes rawOutput from approve failure in full result', () => {
    const stderr = 'error: execution reverted: ERC20: insufficient balance'
    mockExecSync.mockImplementationOnce(() => errorResult(stderr))

    const result = simulateFullMitigation(BORROWER, TOKEN, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.rawOutput).toBe(stderr)
  })

  it('includes rawOutput from repay failure in full result', () => {
    const stderr = 'error: execution reverted: ERC20: insufficient allowance'
    mockExecSync.mockReturnValueOnce(successResult())
      .mockImplementationOnce(() => errorResult(stderr))

    const result = simulateFullMitigation(BORROWER, TOKEN, 1000000n, RPC_URL, WALLET)

    expect(result.success).toBe(false)
    expect(result.rawOutput).toBe(stderr)
  })

  it('uses same from address for both approve and repay calls', () => {
    mockExecSync.mockReturnValueOnce(successResult())
      .mockReturnValueOnce(successResult())

    simulateFullMitigation(BORROWER, TOKEN, 1000000n, RPC_URL, WALLET)

    const approveCall = mockExecSync.mock.calls[0]![0] as string
    const repayCall = mockExecSync.mock.calls[1]![0] as string
    expect(approveCall).toContain(`--from ${WALLET}`)
    expect(repayCall).toContain(`--from ${WALLET}`)
  })

  it('passes same repay amount to both approve and repay calls', () => {
    mockExecSync.mockReturnValueOnce(successResult())
      .mockReturnValueOnce(successResult())

    simulateFullMitigation(BORROWER, TOKEN, 7777777n, RPC_URL, WALLET)

    const approveCall = mockExecSync.mock.calls[0]![0] as string
    const repayCall = mockExecSync.mock.calls[1]![0] as string
    expect(approveCall).toContain('7777777')
    expect(repayCall).toContain('7777777')
  })

  it('passes execSync with encoding utf-8 option', () => {
    mockExecSync.mockReturnValueOnce(successResult())
      .mockReturnValueOnce(successResult())

    simulateFullMitigation(BORROWER, TOKEN, 1000000n, RPC_URL, WALLET)

    const options1 = mockExecSync.mock.calls[0]![1] as { encoding: string }
    const options2 = mockExecSync.mock.calls[1]![1] as { encoding: string }
    expect(options1.encoding).toBe('utf-8')
    expect(options2.encoding).toBe('utf-8')
  })

  it('passes timeout option to execSync calls', () => {
    mockExecSync.mockReturnValueOnce(successResult())
      .mockReturnValueOnce(successResult())

    simulateFullMitigation(BORROWER, TOKEN, 1000000n, RPC_URL, WALLET)

    const options1 = mockExecSync.mock.calls[0]![1] as { timeout: number }
    const options2 = mockExecSync.mock.calls[1]![1] as { timeout: number }
    expect(options1.timeout).toBe(5000)
    expect(options2.timeout).toBe(5000)
  })

  it('returns stage FULL on full success', () => {
    mockExecSync.mockReturnValueOnce(successResult())
      .mockReturnValueOnce(successResult())

    const result = simulateFullMitigation(BORROWER, TOKEN, 1000000n, RPC_URL, WALLET)

    expect(result.stage).toBe('FULL')
  })
})

describe('stress tests', () => {
  it('handles 1000 rapid simulateApprove calls in a loop', () => {
    mockExecSync.mockImplementation(() => successResult())

    for (let i = 0; i < 1000; i++) {
      const result = simulateApprove(TOKEN, POOL, BigInt(i) * 1000n, RPC_URL, WALLET)
      expect(result.success).toBe(true)
    }

    expect(mockExecSync).toHaveBeenCalledTimes(1000)
  })

  it('handles 500 rapid simulateRepay calls in a loop', () => {
    mockExecSync.mockImplementation(() => successResult())

    for (let i = 0; i < 500; i++) {
      const result = simulateRepay(POOL, TOKEN, BigInt(i) * 1000n, 2, BORROWER, RPC_URL, WALLET)
      expect(result.success).toBe(true)
    }

    expect(mockExecSync).toHaveBeenCalledTimes(500)
  })

  it('handles 500 rapid simulateFullMitigation calls in a loop', () => {
    mockExecSync.mockImplementation(() => successResult())

    for (let i = 0; i < 500; i++) {
      const result = simulateFullMitigation(BORROWER, TOKEN, BigInt(i) * 1000n, RPC_URL, WALLET)
      expect(result.success).toBe(true)
    }

    expect(mockExecSync).toHaveBeenCalledTimes(1000)
  })

  it('handles 1000 calls with different amounts each', () => {
    mockExecSync.mockImplementation(() => successResult())

    for (let i = 0; i < 1000; i++) {
      const amount = BigInt(i + 1) * 1000000n
      const result = simulateApprove(TOKEN, POOL, amount, RPC_URL, WALLET)
      expect(result.success).toBe(true)
    }

    const firstCall = mockExecSync.mock.calls[0]![0] as string
    const lastCall = mockExecSync.mock.calls[999]![0] as string
    expect(firstCall).toContain('1000000')
    expect(lastCall).toContain('1000000000')
  })

  it('handles mixed success and failure patterns in a loop', () => {
    for (let i = 0; i < 300; i++) {
      if (i % 3 === 0) {
        mockExecSync.mockImplementationOnce(() =>
          errorResult('error: execution reverted: insufficient balance'),
        )
      } else {
        mockExecSync.mockImplementationOnce(() => successResult())
      }
    }

    for (let i = 0; i < 300; i++) {
      const result = simulateApprove(TOKEN, POOL, BigInt(i) * 1000n, RPC_URL, WALLET)
      if (i % 3 === 0) {
        expect(result.success).toBe(false)
        expect(result.revertReason).toBe('insufficient balance')
      } else {
        expect(result.success).toBe(true)
      }
    }

    expect(mockExecSync).toHaveBeenCalledTimes(300)
  })

  it('rapidly switches between approve, repay, and full mitigation', () => {
    mockExecSync.mockImplementation(() => successResult())

    for (let i = 0; i < 200; i++) {
      if (i % 3 === 0) {
        const r = simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)
        expect(r.stage).toBe('APPROVE')
      } else if (i % 3 === 1) {
        const r = simulateRepay(POOL, TOKEN, 1000000n, 2, BORROWER, RPC_URL, WALLET)
        expect(r.stage).toBe('REPAY')
      } else {
        const r = simulateFullMitigation(BORROWER, TOKEN, 1000000n, RPC_URL, WALLET)
        expect(r.stage).toBe('FULL')
      }
    }
  })

  it('verifies execSync call count integrity across many simulations', () => {
    mockExecSync.mockImplementation(() => successResult())

    for (let i = 0; i < 100; i++) {
      simulateApprove(TOKEN, POOL, 1000000n, RPC_URL, WALLET)
    }
    expect(mockExecSync).toHaveBeenCalledTimes(100)
    vi.clearAllMocks()

    mockExecSync.mockImplementation(() => successResult())
    for (let i = 0; i < 100; i++) {
      simulateRepay(POOL, TOKEN, 1000000n, 2, BORROWER, RPC_URL, WALLET)
    }
    expect(mockExecSync).toHaveBeenCalledTimes(100)
  })
})

describe('architecture invariants', () => {
  it('simulateFullMitigation calls approve before repay', () => {
    mockExecSync.mockReturnValueOnce(successResult())
      .mockReturnValueOnce(successResult())

    simulateFullMitigation(BORROWER, TOKEN, 1000000n, RPC_URL, WALLET)

    const firstCall = mockExecSync.mock.calls[0]![0] as string
    const secondCall = mockExecSync.mock.calls[1]![0] as string
    expect(firstCall).toContain('"approve(address,uint256)"')
    expect(secondCall).toContain('"repay(address,uint256,uint256,address)"')
  })

  it('simulateFullMitigation passes same from address to both approve and repay', () => {
    mockExecSync.mockReturnValueOnce(successResult())
      .mockReturnValueOnce(successResult())

    simulateFullMitigation(BORROWER, TOKEN, 1000000n, RPC_URL, WALLET)

    const firstCall = mockExecSync.mock.calls[0]![0] as string
    const secondCall = mockExecSync.mock.calls[1]![0] as string
    const fromPattern = new RegExp(`--from ${WALLET}$`)
    expect(firstCall).toMatch(fromPattern)
    expect(secondCall).toMatch(fromPattern)
  })

  it('simulateFullMitigation passes same amount to approve and repay', () => {
    mockExecSync.mockReturnValueOnce(successResult())
      .mockReturnValueOnce(successResult())

    simulateFullMitigation(BORROWER, TOKEN, 123456789n, RPC_URL, WALLET)

    const firstCall = mockExecSync.mock.calls[0]![0] as string
    const secondCall = mockExecSync.mock.calls[1]![0] as string
    const amountStr = '123456789'
    expect(firstCall).toContain(amountStr)
    expect(secondCall).toContain(amountStr)
  })

  it('simulateFullMitigation uses rateMode 2 for repay (hardcoded constant)', () => {
    mockExecSync.mockReturnValueOnce(successResult())
      .mockReturnValueOnce(successResult())

    simulateFullMitigation(BORROWER, TOKEN, 1000000n, RPC_URL, WALLET)

    const approveCall = mockExecSync.mock.calls[0]![0] as string
    const repayCall = mockExecSync.mock.calls[1]![0] as string
    const rateModePortion = repayCall.split('--rpc-url')[0] as string
    expect(rateModePortion).toContain(' 2 ')
    expect(approveCall).not.toContain(' 2 ')
  })

  it('INVALID_RPC_URL guard prevents execSync for malformed URLs only', () => {
    // Remote/valid RPCs proceed to the simulator (no fork ceiling anymore).
    simulateApprove(TOKEN, POOL, 1000000n, 'localhost:18545', WALLET)
    expect(mockExecSync).not.toHaveBeenCalled()
    vi.clearAllMocks()

    simulateRepay(POOL, TOKEN, 1000000n, 2, BORROWER, 'not-a-url', WALLET)
    expect(mockExecSync).not.toHaveBeenCalled()
    vi.clearAllMocks()

    simulateFullMitigation(BORROWER, TOKEN, 1000000n, '', WALLET)
    expect(mockExecSync).not.toHaveBeenCalled()
  })
})
