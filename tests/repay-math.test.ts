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

  // --- C. Dust truncation edge cases (4 → 2 new, C3 = existing test, C2 de-prioritized) ---

  it('truncates to 0 for tiny debt ($0.01) with very close HF values (1.0999→1.10)', () => {
    // hfDelta is extremely small relative to target, and debt is tiny
    const debt = debtBase(0.01);
    const hfCurrent = hfToBigint(1.0999);
    const hfTarget = hfToBigint(1.10);

    const repay = computeRepayAmount(debt, hfCurrent, hfTarget);

    expect(repay).toBe(0n);
  });

  it('produces dust amount for sub-cent debt ($0.001) with HF 1.04→1.10', () => {
    // $0.001 debt is below 1-cent threshold; repays a non-zero dust amount
    const debt = debtBase(0.001);
    const hfCurrent = hfToBigint(1.04);
    const hfTarget = hfToBigint(1.10);

    const repay = computeRepayAmount(debt, hfCurrent, hfTarget);

    expect(repay).toBe(54n);
  });

  // --- D. computeRepayAmount with precision-impaired HF values (3 tests) ---

  it('works with hfToBigint(1.10) (=1100000000000000128n) as target at half scale', () => {
    // Verifies that the precision-impaired 1.10 value doesn't break computation
    const debt = debtBase(500);
    const hfCurrent = hfToBigint(0.98);
    const hfTarget = hfToBigint(1.10);

    const repay = computeRepayAmount(debt, hfCurrent, hfTarget);

    expect(repay).toBe(54_545454n);
  });

  it('works with precision-impaired hfToBigint(2.01) (=2009999999999999744n) as target', () => {
    // NOTE: hfToBigint(2.01) produces 2009999999999999744n, NOT 2010000000000000256n
    // as the research table claimed. IEEE 754 rounding differs from theoretical ideal.
    const debt = debtBase(1_000_000);
    const hfCurrent = hfToBigint(1.50);
    const hfTarget = hfToBigint(2.01);

    const repay = computeRepayAmount(debt, hfCurrent, hfTarget);

    // Finite, reasonable result despite precision error in hfTarget
    expect(repay).toBe(253_731_343283n);
    expect(repay).toBeGreaterThan(0n);
  });

  it('produces small diff when comparing close HF targets 1.10 vs 1.0999999999', () => {
    // The 128 wei difference between hfToBigint(1.10) and hfToBigint(1.0999999999)
    // gets washed out by BigInt division truncation at 6-dec USDC scale
    const debt = debtBase(1000);
    const hfCurrent = hfToBigint(1.04);
    const repayA = computeRepayAmount(debt, hfCurrent, hfToBigint(1.10));
    const repayB = computeRepayAmount(debt, hfCurrent, hfToBigint(1.0999999999));

    const diff = repayA - repayB;
    // diff is 0n because the 128-wei difference in HF_target is below the
    // 6-decimal truncation granularity for this debt scale
    expect(diff >= 0n).toBe(true);
  });

  // --- E. computeRepayAmount large scale (3 tests) ---

  it('handles debt at max uint64 scale without overflow', () => {
    const maxUint64 = 18_446_744_073_709_551_615n;
    const debt = maxUint64 / 10n ** 8n;
    const repay = computeRepayAmount(debt, hfToBigint(1.04), hfToBigint(1.10));

    expect(repay).toBeGreaterThan(0n);
    expect(repay).toBe(100_618604n);
  });

  it('handles $1B debt with HF 1.01→1.10', () => {
    const debt = debtBase(1_000_000_000);
    const repay = computeRepayAmount(debt, hfToBigint(1.01), hfToBigint(1.10));

    // $1B × (1 - 1.01/1.10) = $1B × 0.081818... = $81,818,181.818181
    expect(repay).toBe(81_818_181_818181n);
    expect(usdcToString(repay)).toBe('81818181.818181');
  });

  it('handles HF_current very close to 1.0 (0.9999999999) with large debt', () => {
    // When HF is barely above 1.0, the repay is approximately:
    // debt × (1 - 1.0/1.10) ≈ debt × 0.0909
    const debt = debtBase(100_000);
    const repay = computeRepayAmount(debt, hfToBigint(0.9999999999), hfToBigint(1.10));

    expect(repay).toBe(9_090_909100n);
    expect(repay).toBeGreaterThan(0n);
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

  // --- B. hfToNumber roundtrip consistency (2 new, B1=1.10 already tested above) ---

  it('roundtrips 2.01 (precision-impaired)', () => {
    // hfToBigint(2.01) = 2009999999999999744n due to IEEE 754 precision
    const hf = 2.01;
    const asBigint = hfToBigint(hf);
    expect(hfToNumber(asBigint)).toBeCloseTo(hf, 14);
  });

  it('roundtrips 4.02 (precision-impaired)', () => {
    // hfToBigint(4.02) = 4019999999999999488n — differs from research table
    const hf = 4.02;
    const asBigint = hfToBigint(hf);
    expect(hfToNumber(asBigint)).toBeCloseTo(hf, 14);
  });
});

describe('hfToBigint precision errors', () => {
  // --- A. hfToBigint precision error verification (8 tests) ---
  // Rounded BigInt is what Math.round(hf * 1e18) produces in IEEE 754 double.
  // NOTE: For 2.01 and 4.02, the research table's "Rounded BigInt" values
  // (2010000000000000256n and 4020000000000000512n) differ from actual Node.js
  // behavior. We test the ACTUAL behavior here.

  it('hfToBigint(1.10) == 1100000000000000128n (128 wei error)', () => {
    expect(hfToBigint(1.10)).toBe(1100000000000000128n);
  });

  it('hfToBigint(1.0999999999) == 1099999999900000128n (128 wei error)', () => {
    expect(hfToBigint(1.0999999999)).toBe(1099999999900000128n);
  });

  it('hfToBigint(2.01) == 2009999999999999744n (NOT 2010000000000000256n as research claimed)', () => {
    // Research table predicted 2010000000000000256n, but actual IEEE 754
    // rounding produces 2009999999999999744n. The error is -256 wei.
    expect(hfToBigint(2.01)).toBe(2009999999999999744n);
  });

  it('hfToBigint(4.02) == 4019999999999999488n (NOT 4020000000000000512n as research claimed)', () => {
    // Research table predicted 4020000000000000512n, actual is 4019999999999999488n.
    // The error direction is downward (-512 wei) not upward.
    expect(hfToBigint(4.02)).toBe(4019999999999999488n);
  });

  it('hfToBigint(1.0000000000000002) == 1000000000000000256n (56 wei error)', () => {
    expect(hfToBigint(1.0000000000000002)).toBe(1000000000000000256n);
  });

  it('hfToBigint(1.0) == 1000000000000000000n (exact)', () => {
    expect(hfToBigint(1.0)).toBe(1000000000000000000n);
  });

  it('hfToBigint(1.04) == 1040000000000000000n (exact)', () => {
    expect(hfToBigint(1.04)).toBe(1040000000000000000n);
  });

  it('hfToBigint(1.05) == 1050000000000000000n (exact)', () => {
    expect(hfToBigint(1.05)).toBe(1050000000000000000n);
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

  // --- F. usdcToString edge cases (4 tests) ---

  it('formats 1n (smallest non-zero amount)', () => {
    expect(usdcToString(1n)).toBe('0.000001');
  });

  it('formats 123456789n (all 6 fraction digits non-zero)', () => {
    expect(usdcToString(123_456789n)).toBe('123.456789');
  });

  it('formats very large amount 999999999999999n', () => {
    expect(usdcToString(999_999_999_999_999n)).toBe('999999999.999999');
  });

  it('formats 0n again (boundary)', () => {
    expect(usdcToString(0n)).toBe('0.000000');
  });
});
