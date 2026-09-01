import { execSync } from 'child_process'
import { CONFIG } from './config.js'

export interface SimulationResult {
  success: boolean
  stage: 'APPROVE' | 'REPAY' | 'FULL'
  gasEstimate?: string
  revertReason?: string
  rawOutput?: string
  durationMs: number
}

function parseRevertReason(stderr: string): string {
  const patterns: RegExp[] = [
    /execution reverted: (.+)/i,
    /execution reverted with reason: (.+)/i,
    /execution reverted with custom error '(.+?)'/i,
    /\(code: -32000\)[^]*?message: (.+)/i,
  ]
  for (const pattern of patterns) {
    const match = stderr.match(pattern)
    if (match?.[1]) {
      return match[1].trim()
    }
  }
  return 'UNKNOWN_REVERT'
}

function extractGasEstimate(stdout: string): string | undefined {
  const match = stdout.match(/"gasUsed":\s*"(\d+)"/)
  return match?.[1]
}

function runCastCall(args: string[], rpcUrl: string, from?: string, timeoutMs = 5000): { stdout: string; durationMs: number } {
  const fromFlag = from ? ` --from ${from}` : ''
  const cmd = `cast call ${args.join(' ')} --rpc-url ${rpcUrl}${fromFlag}`
  const start = Date.now()
  try {
    const stdout = execSync(cmd, { encoding: 'utf-8', timeout: timeoutMs })
    return { stdout: stdout.trim(), durationMs: Date.now() - start }
  } catch (err: unknown) {
    const durationMs = Date.now() - start
    if (err instanceof Error) {
      const stderr = (err as { stderr?: string }).stderr ?? err.message
      throw { stderr, durationMs }
    }
    throw { stderr: String(err), durationMs }
  }
}

function isLocalFork(rpcUrl: string): boolean {
  return rpcUrl.startsWith('http://127.0.0.1') || rpcUrl.startsWith('http://localhost')
}

export function simulateApprove(
  tokenAddress: string,
  spender: string,
  amountWei: bigint,
  rpcUrl: string,
  from?: string,
): SimulationResult {
  const effectiveFrom = from ?? CONFIG.WALLET_ADDRESS
  const start = Date.now()

  if (!isLocalFork(rpcUrl)) {
    return {
      success: false,
      stage: 'APPROVE',
      revertReason: 'FORK_REQUIRED',
      durationMs: 0,
    }
  }

  try {
    const { stdout, durationMs } = runCastCall(
      [tokenAddress, `"approve(address,uint256)"`, spender, amountWei.toString()],
      rpcUrl,
      effectiveFrom,
    )
    const gasEstimate = extractGasEstimate(stdout)
    return {
      success: true,
      stage: 'APPROVE',
      gasEstimate,
      durationMs,
    }
  } catch (err: unknown) {
    const e = err as { stderr: string; durationMs: number }
    return {
      success: false,
      stage: 'APPROVE',
      revertReason: parseRevertReason(e.stderr),
      rawOutput: e.stderr,
      durationMs: e.durationMs,
    }
  }
}

export function simulateRepay(
  poolAddress: string,
  tokenAddress: string,
  amountWei: bigint,
  interestRateMode: 1 | 2,
  onBehalfOf: string,
  rpcUrl: string,
  from?: string,
): SimulationResult {
  const effectiveFrom = from ?? CONFIG.WALLET_ADDRESS
  const start = Date.now()

  if (!isLocalFork(rpcUrl)) {
    return {
      success: false,
      stage: 'REPAY',
      revertReason: 'FORK_REQUIRED',
      durationMs: 0,
    }
  }

  try {
    const { stdout, durationMs } = runCastCall(
      [poolAddress, `"repay(address,uint256,uint256,address)"`, tokenAddress, amountWei.toString(), interestRateMode.toString(), onBehalfOf],
      rpcUrl,
      effectiveFrom,
    )
    const gasEstimate = extractGasEstimate(stdout)
    return {
      success: true,
      stage: 'REPAY',
      gasEstimate,
      durationMs,
    }
  } catch (err: unknown) {
    const e = err as { stderr: string; durationMs: number }
    return {
      success: false,
      stage: 'REPAY',
      revertReason: parseRevertReason(e.stderr),
      rawOutput: e.stderr,
      durationMs: e.durationMs,
    }
  }
}

export function simulateFullMitigation(
  userAddress: string,
  repayToken: string,
  repayAmount: bigint,
  rpcUrl: string,
  from?: string,
): SimulationResult {
  const start = Date.now()
  const effectiveFrom = from ?? CONFIG.WALLET_ADDRESS
  const poolAddress = CONFIG.AAVE_POOL
  const rateMode: 1 | 2 = 2 as const

  if (!isLocalFork(rpcUrl)) {
    return {
      success: false,
      stage: 'FULL',
      revertReason: 'FORK_REQUIRED',
      durationMs: 0,
    }
  }

  const approveSim = simulateApprove(repayToken, poolAddress, repayAmount, rpcUrl, effectiveFrom)
  if (!approveSim.success) {
    return {
      success: false,
      stage: 'FULL',
      revertReason: `APPROVE_FAILED: ${approveSim.revertReason}`,
      rawOutput: approveSim.rawOutput,
      durationMs: approveSim.durationMs,
    }
  }

  const repaySim = simulateRepay(poolAddress, repayToken, repayAmount, rateMode, userAddress, rpcUrl, effectiveFrom)
  if (!repaySim.success) {
    return {
      success: false,
      stage: 'FULL',
      revertReason: `REPAY_FAILED: ${repaySim.revertReason}`,
      rawOutput: repaySim.rawOutput,
      durationMs: Date.now() - start,
    }
  }

  return {
    success: true,
    stage: 'FULL',
    gasEstimate: repaySim.gasEstimate,
    durationMs: Date.now() - start,
  }
}
