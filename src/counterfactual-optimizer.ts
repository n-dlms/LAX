import { computeRepayAmount } from './repay-math.js'

export type MitigationPath = 'REPAY' | 'SUPPLY'

export interface AssetData {
  tokenAddress: string
  usdValue: number
  liquidationThreshold: number
}

export interface OptimizationResult {
  recommendedAction: MitigationPath
  targetToken: string
  requiredCapitalUSD: number
  repayCost: number
  supplyCost: number
  alternativeAction: MitigationPath
  alternativeCost: number
}

const EQUALITY_TOLERANCE = 0.001

export function computeOptimalMitigation(
  collaterals: AssetData[],
  debts: AssetData[],
  currentHf: bigint,
  targetHf: bigint,
  totalDebtBase: bigint,
): OptimizationResult {
  if (collaterals.length === 0) {
    return {
      recommendedAction: 'REPAY',
      targetToken: debts[0]?.tokenAddress ?? '',
      requiredCapitalUSD: 0,
      repayCost: 0,
      supplyCost: Infinity,
      alternativeAction: 'SUPPLY',
      alternativeCost: Infinity,
    }
  }

  const totalDebt = debts.reduce((acc, d) => acc + d.usdValue, 0)
  if (totalDebt <= 0) {
    return {
      recommendedAction: 'REPAY',
      targetToken: '',
      requiredCapitalUSD: 0,
      repayCost: 0,
      supplyCost: Infinity,
      alternativeAction: 'SUPPLY',
      alternativeCost: Infinity,
    }
  }

  const weightedCollateral = collaterals.reduce(
    (acc, c) => acc + c.usdValue * c.liquidationThreshold,
    0,
  )
  const maxLT = Math.max(...collaterals.map((c) => c.liquidationThreshold))
  const maxLTCollateral = collaterals.find((c) => c.liquidationThreshold === maxLT)!
  const targetHfNum = Number(targetHf) / 1e18
  const currentHfNum = Number(currentHf) / 1e18

  const repayAmountBigint = computeRepayAmount(totalDebtBase, currentHf, targetHf)
  const repayUSD = Number(repayAmountBigint) / 1e6

  const supplyUSD = targetHfNum > 0 && maxLT > 0
    ? Math.max(0, (totalDebt * targetHfNum - weightedCollateral) / maxLT)
    : Infinity

  const absDiff = Math.abs(repayUSD - supplyUSD)
  const bothEqual = absDiff < EQUALITY_TOLERANCE
  const repayCheaper = repayUSD < supplyUSD && !bothEqual

  const selectedAction: MitigationPath = repayCheaper || bothEqual ? 'REPAY' : 'SUPPLY'
  const selectedToken = selectedAction === 'REPAY'
    ? (debts[0]?.tokenAddress ?? '')
    : maxLTCollateral.tokenAddress
  const selectedCost = selectedAction === 'REPAY' ? repayUSD : supplyUSD

  return {
    recommendedAction: selectedAction,
    targetToken: selectedToken,
    requiredCapitalUSD: Math.max(0, selectedCost),
    repayCost: repayUSD,
    supplyCost: supplyUSD,
    alternativeAction: selectedAction === 'REPAY' ? 'SUPPLY' : 'REPAY',
    alternativeCost: selectedAction === 'REPAY' ? supplyUSD : repayUSD,
  }
}
