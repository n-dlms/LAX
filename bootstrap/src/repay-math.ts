/**
 * Closed-form Health Factor repayment math per ADR-005.
 *
 * Formula (from Aave V3 Liquidation Mechanics Research.md:67-94):
 *   exactRepayAmount = totalDebt × (1 - HF_current / HF_target)
 *
 * Inputs:
 *   totalDebtBase — from Aave getUserAccountData (8 decimals, base currency)
 *   hfCurrent — from Aave getUserAccountData (18 decimals)
 *   hfTarget — configured LAX target HF (18 decimals)
 *
 * Returns: USDC amount in 6 decimals (for USDC transfer/repay)
 */

const USDC_DECIMALS = 6n;

export function computeRepayAmount(
  totalDebtBase: bigint,
  hfCurrent: bigint,
  hfTarget: bigint,
): bigint {
  const hfDelta = hfTarget - hfCurrent;
  if (hfDelta <= 0n) return 0n;

  // Convert debt from 8 decimals (Aave base currency) to 18 decimals
  const debt18 = totalDebtBase * 10n ** 10n;

  // repay = debt × hfDelta / hfTarget (18-dec intermediate)
  const repay18 = (debt18 * hfDelta) / hfTarget;

  // Convert from 18 decimals to 6-dec USDC
  const repayUSDC = repay18 / 10n ** 12n;

  return repayUSDC;
}

export function hfToBigint(hf: number): bigint {
  return BigInt(Math.round(hf * 1e18));
}

export function hfToNumber(hf: bigint): number {
  return Number(hf) / 1e18;
}

export function usdcToString(amount: bigint): string {
  const intPart = amount / 10n ** USDC_DECIMALS;
  const fracPart = amount % 10n ** USDC_DECIMALS;
  return `${intPart.toString()}.${fracPart.toString().padStart(6, '0')}`;
}
