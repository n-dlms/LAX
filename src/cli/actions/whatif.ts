// `lax whatif` — counterfactual risk analysis on the live position.
// Answers: "if the market drops X% right now, what happens to my health
// factor, what would the defense cost, and why is defending early cheaper?"
// Uses the same closed-form repay math as the daemon (tests/repay-math.test.ts)
// and the optimal-mitigation comparator from src/counterfactual-optimizer.ts.
import type { CommandContext, ParsedArgs, CommandResult } from "../types";
import { computeRepayAmount, hfToBigint } from "../../repay-math";
import { computeOptimalMitigation, type AssetData } from "../../counterfactual-optimizer";

/** Assumed liquidation threshold for the SUPPLY alternative (WETH-grade
 *  collateral on Aave V3 Base ≈ 0.80). getUserAccountData does not expose
 *  per-asset LTs; override with --lt when the collateral differs. */
const DEFAULT_LT = 0.8;

function bar(pct: number, width = 24): string {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 2) * width))); // 0..2.0 scale
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function hfVerdict(hf: number): string {
  if (hf <= 1.0) return "LIQUIDATABLE — bots can close the position";
  if (hf <= 1.05) return "LAX TRIGGER ZONE — autopilot defends here";
  if (hf <= 1.1) return "caution — close to the trigger";
  return "healthy";
}

export async function handleWhatif(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const shockPct = parseFloat(args.flags["shock"] ?? "20");
  const lt = parseFloat(args.flags["lt"] ?? String(DEFAULT_LT));
  if (!Number.isFinite(shockPct) || shockPct < 0 || shockPct > 100) {
    return { output: `lax whatif: --shock must be a percent drop 0–100 (got "${args.flags["shock"] ?? "20"}")`, error: "Invalid argument" };
  }
  if (!Number.isFinite(lt) || lt <= 0 || lt > 1) {
    return { output: `lax whatif: --lt must be a liquidation threshold in (0, 1] (got ${lt})`, error: "Invalid argument" };
  }

  let pos = ctx.position();
  if (!pos) {
    await ctx.refreshPosition();
    pos = ctx.position();
  }
  if (!pos) {
    return { output: "Position unavailable — is the node reachable? (./scripts/start-fork.sh)", error: "Position unavailable" };
  }
  if (pos.totalDebtUSD === 0n) {
    return { output: "No debt — nothing to defend. A price shock cannot liquidate a debt-free position." };
  }

  const hfNow = Number(pos.healthFactor) / 1e18;
  const collateralNow = Number(pos.totalCollateralUSD) / 1e8;
  const debtNow = Number(pos.totalDebtUSD) / 1e8;

  // Collateral prices scale linearly → HF scales with the shock
  const hfShocked = hfNow * (1 - shockPct / 100);
  const collateralShocked = collateralNow * (1 - shockPct / 100);

  const targetHf = ctx.config.HF_TARGET;
  const repayNow = computeRepayAmount(pos.totalDebtUSD, pos.healthFactor, hfToBigint(targetHf));
  const repayAfterShock = computeRepayAmount(pos.totalDebtUSD, hfToBigint(Math.min(hfShocked, 0.999)), hfToBigint(targetHf));

  // SUPPLY alternative at the shocked state (uses the comparator's formula)
  const shockedAssets: AssetData[] = [{
    tokenAddress: "collateral",
    usdValue: collateralShocked,
    liquidationThreshold: lt,
  }];
  const optimal = computeOptimalMitigation(shockedAssets, [{ tokenAddress: "debt", usdValue: debtNow, liquidationThreshold: 1 }], hfToBigint(Math.min(hfShocked, 0.999)), hfToBigint(targetHf), pos.totalDebtUSD);

  const usd = (v: bigint) => `$${(Number(v) / 1e6).toFixed(2)}`;
  const proactiveSaving = Number(repayAfterShock - repayNow) / 1e6;

  const lines = [
    `What-if: collateral drops ${shockPct.toFixed(0)}% right now`,
    "─".repeat(60),
    `  HF now:       ${hfNow.toFixed(4)}  ${bar(hfNow)}  ${hfVerdict(hfNow)}`,
    `  HF shocked:   ${hfShocked.toFixed(4)}  ${bar(hfShocked)}  ${hfVerdict(hfShocked)}`,
    "",
    `  Collateral:   $${collateralNow.toFixed(2)} → $${collateralShocked.toFixed(2)}`,
    `  Debt:         $${debtNow.toFixed(2)} (unchanged)`,
    "",
    `Defense cost — restore HF to ${targetHf}:`,
    `  REPAY debt:   ${usd(repayNow)} today → ${usd(repayAfterShock)} after the shock` +
      (proactiveSaving > 0.005 ? `  (defending early saves $${proactiveSaving.toFixed(2)})` : ""),
    `  SUPPLY col.:  ${optimal.supplyCost === Infinity ? "impossible (no eligible collateral)" : `$${optimal.supplyCost.toFixed(2)} at LT ${lt}`}`,
    `  Comparator:   recommends ${optimal.recommendedAction} (alternative ${optimal.alternativeAction}: ${optimal.alternativeCost === Infinity ? "impossible" : `$${optimal.alternativeCost.toFixed(2)}`})`,
  ];

  if (hfShocked <= 1.0) {
    lines.push("", `  ⚠ At ${shockPct.toFixed(0)}% the position is liquidatable. Defending BEFORE the drop is the whole point of LAX.`);
  } else if (hfShocked <= 1.05 && hfNow > 1.05) {
    lines.push("", `  → A ${shockPct.toFixed(0)}% drop pushes you into the LAX trigger zone; the autopilot would fire within one poll.`);
  }
  lines.push("", `  Assumptions: HF scales linearly with collateral price; SUPPLY cost uses LT ${lt} (--lt to override).`);

  return { output: lines.join("\n") };
}
