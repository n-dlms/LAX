import { describe, it, expect } from 'vitest';
import { computeRepayAmount, hfToBigint, hfToNumber, usdcToString } from '../src/repay-math.js';

// totalDebtBase from Aave getUserAccountData is 8 decimals
function debtBase(usd: number): bigint {
  return BigInt(Math.round(usd * 1e8));
}

// Worked example from Aave V3 Liquidation Mechanics Research.md:80-94:
// Collateral: $1,500 WETH, Debt: $1,000 USDC, HF_current: 0.98, HF_target: 1.10
// LT for WETH on Base: 80% → risk-adjusted collateral = $1,200
// exactRepayAmount = $1,000 × (1 - 0.98/1.10) = $1,000 × 0.1091 = ~$109.09 USDC
// In 6-dec USDC: 109_090909

describe('computeRepayAmount', () => {
  it('computes the exact repay amount from the research report worked example', () => {
    const debt = debtBase(1000);             // $1,000.00 (8-dec)
    const hfCurrent = hfToBigint(0.98);      // HF 0.98
    const hfTarget = hfToBigint(1.10);       // HF 1.10

    const repay = computeRepayAmount(debt, hfCurrent, hfTarget);

    expect(repay).toBe(109_090909n);
    expect(usdcToString(repay)).toBe('109.090909');
  });

  it('returns 0 when current HF >= target HF', () => {
    const debt = debtBase(1000);
    const repay = computeRepayAmount(debt, hfToBigint(1.10), hfToBigint(1.05));
    expect(repay).toBe(0n);
  });

  it('handles small positions (demo-scale)', () => {
    // Demo scenario: debt = $10 USDC, HF = 1.04 → target = 1.10
    // repay = $10 × (1 - 1.04/1.10) = $10 × 0.0545 = ~$0.545 USDC
    const debt = debtBase(10);               // $10.00 (8-dec)
    const hfCurrent = hfToBigint(1.04);
    const hfTarget = hfToBigint(1.10);

    const repay = computeRepayAmount(debt, hfCurrent, hfTarget);

    expect(repay).toBe(545_454n);
    expect(usdcToString(repay)).toBe('0.545454');
  });

  it('computes repay when HF is exactly at trigger (1.05 → 1.10)', () => {
    // Edge case: HF = trigger = 1.05, target = 1.10
    // repay = $1000 × (1 - 1.05/1.10) = $1000 × 0.04545 = $45.45
    const debt = debtBase(1000);             // $1,000.00 (8-dec)
    const hfCurrent = hfToBigint(1.05);
    const hfTarget = hfToBigint(1.10);

    const repay = computeRepayAmount(debt, hfCurrent, hfTarget);

    expect(repay).toBe(45_454545n);
    expect(usdcToString(repay)).toBe('45.454545');
    expect(repay > 0n).toBe(true);
  });

  it('handles extremely small debt ($0.01) with no underflow', () => {
    // Edge case: HF = 1.04, target = 1.10, debt = $0.01
    // repay = 0.01 × (1 - 1.04/1.10) = 0.01 × 0.0545 = $0.000545
    // In 6-dec USDC: 545
    const debt = debtBase(0.01);             // $0.01 (8-dec)
    const hfCurrent = hfToBigint(1.04);
    const hfTarget = hfToBigint(1.10);

    const repay = computeRepayAmount(debt, hfCurrent, hfTarget);

    expect(repay).toBe(545n);
    expect(repay > 0n).toBe(true);
  });

  it('handles extremely large debt (real-world scale)', () => {
    // $500,000 debt, HF = 1.02 → target 1.10
    // repay = 500_000 × (1 - 1.02/1.10) = 500_000 × 0.0727 = $36,363.64
    const debt = debtBase(500_000);
    const repay = computeRepayAmount(debt, hfToBigint(1.02), hfToBigint(1.10));

    expect(repay).toBe(36_363_636363n);
    expect(usdcToString(repay)).toBe('36363.636363');
  });
});

describe('hfToBigint / hfToNumber roundtrip', () => {
  it('roundtrips 1.10', () => {
    const hf = 1.10;
    const asBigint = hfToBigint(hf);
    expect(hfToNumber(asBigint)).toBeCloseTo(hf, 15);
  });

  it('roundtrips 0.98', () => {
    const hf = 0.98;
    const asBigint = hfToBigint(hf);
    expect(hfToNumber(asBigint)).toBeCloseTo(hf, 15);
  });

  it('roundtrips 1.0042', () => {
    const hf = 1.0042;
    const asBigint = hfToBigint(hf);
    expect(hfToNumber(asBigint)).toBeCloseTo(hf, 15);
  });
});

describe('usdcToString', () => {
  it('formats 109_090909 USDC (6-dec)', () => {
    expect(usdcToString(109_090909n)).toBe('109.090909');
  });

  it('formats 0 USDC', () => {
    expect(usdcToString(0n)).toBe('0.000000');
  });

  it('formats 500 USDC (no fraction)', () => {
    expect(usdcToString(500_000_000n)).toBe('500.000000');
  });

  it('formats 1 USDC (1e6)', () => {
    expect(usdcToString(1_000_000n)).toBe('1.000000');
  });
});
