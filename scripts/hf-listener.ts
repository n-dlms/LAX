// Legacy one-shot listener — kept for the 8-beat runbook and CI pipelines.
// The primary trigger path is now `lax autopilot` (src/autopilot/daemon.ts),
// which adds hysteresis, cooldown, the mitigation gate, and persistent logs.
// This listener routes through the same gate and KeeperHub client, so every
// fire path shares identical safety checks.
import { CONFIG, getBorrowerAddress } from '../src/config.js'
import { hfToBigint, hfToNumber, computeRepayAmount, usdcToString } from '../src/repay-math.js'
import { runMitigationGate } from '../src/autopilot/gate.js'
import { ethers } from 'ethers'

const POOL_ABI = [
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
]

const POLL_MS = CONFIG.LISTENER_POLL_MS
const ONE_SHOT = true

interface UserAccountData {
  totalCollateralBase: bigint
  totalDebtBase: bigint
  availableBorrowsBase: bigint
  currentLiquidationThreshold: bigint
  ltv: bigint
  healthFactor: bigint
}

interface AavePoolInterface {
  getUserAccountData(user: string): Promise<UserAccountData>
}

async function fireWebhook(
  hf: bigint,
  address: string,
  debt: bigint,
  repayAmount: bigint,
): Promise<string> {
  const response = await fetch(
    `https://app.keeperhub.com/api/workflows/${CONFIG.WORKFLOW_ID}/webhook`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.KEEPERHUB_API_KEY}`,
      },
      body: JSON.stringify({
        health_factor: hfToNumber(hf).toString(),
        user_address: address,
        triggered_at: new Date().toISOString(),
        debt_base: debt.toString(),
        repay_amount_usdc: repayAmount.toString(),
        repay_amount_human: usdcToString(repayAmount),
      }),
    },
  )

  if (!response.ok) {
    throw new Error(`Webhook ${response.status}: ${await response.text()}`)
  }

  const data = (await response.json()) as { executionId: string }
  console.log(`Webhook accepted. Execution ID: ${data.executionId}`)
  return data.executionId
}

async function fireAfterGate(
  hf: bigint,
  address: string,
  debt: bigint,
  repayAmount: bigint,
  rpcUrl: string,
): Promise<string> {
  const gate = runMitigationGate({
    totalDebtBase: debt,
    currentHf: hf,
    targetHf: hfToBigint(CONFIG.HF.TARGET),
    repayAmount,
    borrowerAddress: address,
    poolAddress: CONFIG.AAVE_POOL,
    repayToken: CONFIG.USDC,
    rpcUrl,
  })

  for (const stage of gate.stages) {
    console.error(`  gate ${stage.passed ? '✓' : '✗'} ${stage.name}: ${stage.detail}`)
  }
  if (!gate.approved) {
    throw new Error(`Mitigation gate blocked the fire (${gate.summary}) — nothing was executed`)
  }

  return fireWebhook(hf, address, debt, repayAmount)
}

async function main(): Promise<void> {
  const rpcUrl = `http://127.0.0.1:${CONFIG.FORK_PORT}`
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const rawContract = new ethers.Contract(CONFIG.AAVE_POOL, POOL_ABI, provider)
  const pool = rawContract as unknown as AavePoolInterface
  const triggerBigint = hfToBigint(CONFIG.HF.TRIGGER)
  // CLI arg overrides env LAX_BORROWER_ADDRESS, then the config default.
  // Run a second instance with a different address to monitor a second position.
  const borrower = getBorrowerAddress(process.argv[2])

  console.log(`HF listener started. Polling ${rpcUrl} every ${POLL_MS}ms`)
  console.log(`Monitoring borrower: ${borrower}`)
  console.log(`Trigger at HF <= ${hfToNumber(triggerBigint)}`)
  console.log(`---`)

  while (true) {
    try {
      const data = await pool.getUserAccountData(borrower)
      const hf: bigint = data.healthFactor

      if (hf <= triggerBigint && hf > 0n) {
        console.error(
          `TRIGGERED: HF=${hfToNumber(hf).toFixed(4)} at ${new Date().toISOString()}`,
        )

        const targetBigint = hfToBigint(CONFIG.HF.TARGET)
        const exactAmount = computeRepayAmount(data.totalDebtBase, hf, targetBigint)
        const repayAmount = exactAmount * 101n / 100n  // +1% buffer for on-chain rounding
        console.error(`Repay: ${exactAmount} exact, ${repayAmount} with 1% buffer (${usdcToString(repayAmount)} USDC)`)

        if (CONFIG.WORKFLOW_ID) {
          await fireAfterGate(hf, borrower, data.totalDebtBase, repayAmount, rpcUrl)
        } else {
          console.error('WORKFLOW_ID not configured — webhook not fired')
        }

        if (ONE_SHOT) {
          console.error('One-shot mode: exiting. Re-run to re-arm.')
          process.exit(0)
        }
      } else {
        console.error(`IDLE: HF=${hfToNumber(hf).toFixed(4)}`)
      }
    } catch (err) {
      console.error(`ERROR: ${err instanceof Error ? err.message : err}`)
      if (ONE_SHOT) process.exit(1)
    }

    await new Promise((r) => setTimeout(r, POLL_MS))
  }
}

export { fireWebhook, fireAfterGate }

if (process.argv[1]?.endsWith('hf-listener.ts') || process.argv[1]?.endsWith('hf-listener.js')) {
  main().catch((err) => {
    console.error(`Listener fatal: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  })
}
