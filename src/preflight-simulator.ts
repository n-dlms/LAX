// Dry-run simulations for the mitigation gate via JSON-RPC helper.
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { CONFIG } from './config.js'

export interface SimulationResult {
  success: boolean
  stage: 'APPROVE' | 'REPAY' | 'FULL'
  gasEstimate?: string
  revertReason?: string
  rawOutput?: string
  durationMs: number
}

const HELPER_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'preflight-call.mjs')

interface HelperResult {
  ok: boolean
  reason?: string
  result?: string
}

function runEthCall(to: string, data: string, from: string, rpcUrl: string, timeoutMs = 5000): { stdout: HelperResult; durationMs: number } {
  const start = Date.now()
  const spec = JSON.stringify({ rpcUrl, from, to, data, timeoutMs })
  try {
    const stdout = execFileSync(process.execPath, [HELPER_PATH, spec], {
      encoding: 'utf-8',
      timeout: timeoutMs + 2000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { stdout: JSON.parse(stdout) as HelperResult, durationMs: Date.now() - start }
  } catch (err: unknown) {
    // helper crashed / timed out — surface as an unreachable RPC
    const message = err instanceof Error ? err.message.split('\n')[0] : String(err)
    return { stdout: { ok: false, reason: `SIMULATION_ERROR: ${message}` }, durationMs: Date.now() - start }
  }
}

function isValidRpc(url: string): boolean {
  return /^https?:\/\/.+/.test(url.trim())
}

function encodeFunction(selector: string, params: string[]): string {
  return selector + params.map((p) => p.replace(/^0x/, '').toLowerCase().padStart(64, '0')).join('')
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

  if (!isValidRpc(rpcUrl)) {
    return { success: false, stage: 'APPROVE', revertReason: 'INVALID_RPC_URL', durationMs: 0 }
  }

  // approve(address,uint256)
  const data = encodeFunction('0x095ea7b3', [spender, amountWei.toString(16)])
  const { stdout, durationMs } = runEthCall(tokenAddress, data, effectiveFrom, rpcUrl)

  if (!stdout.ok) {
    return { success: false, stage: 'APPROVE', revertReason: stdout.reason ?? 'UNKNOWN_REVERT', rawOutput: stdout.reason, durationMs }
  }
  return { success: true, stage: 'APPROVE', durationMs }
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

  if (!isValidRpc(rpcUrl)) {
    return { success: false, stage: 'REPAY', revertReason: 'INVALID_RPC_URL', durationMs: 0 }
  }

  // repay(address,uint256,uint256,address)
  const data = encodeFunction('0x573ade81', [
    tokenAddress,
    amountWei.toString(16),
    interestRateMode.toString(16),
    onBehalfOf,
  ])
  const { stdout, durationMs } = runEthCall(poolAddress, data, effectiveFrom, rpcUrl)

  if (!stdout.ok) {
    return { success: false, stage: 'REPAY', revertReason: stdout.reason ?? 'UNKNOWN_REVERT', rawOutput: stdout.reason, durationMs }
  }
  return { success: true, stage: 'REPAY', durationMs }
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

  if (!isValidRpc(rpcUrl)) {
    return {
      success: false,
      stage: 'FULL',
      revertReason: 'INVALID_RPC_URL',
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
    durationMs: Date.now() - start,
  }
}
