// `lax watch` — live position monitor: HF gauge + sparkline trend, refreshed
// every interval. In a TTY it redraws in place until Ctrl-C; piped runs print
// one sample and exit (so scripts never hang).
import type { CommandContext, ParsedArgs, CommandResult } from "../types";
import { LAX_CONFIG } from "../lax-config";
import { fetchPosition } from "../node-context";
import { style, TOKENS, hfGauge } from "../ui";
import { loadState } from "../../autopilot/state";

const SPARK_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

/** Render a value series as a sparkline string (min/max normalized). */
export function sparkline(values: number[], width = 40): string {
  const sample = values.slice(-width);
  if (sample.length === 0) return "";
  const min = Math.min(...sample);
  const max = Math.max(...sample);
  const span = max - min;
  return sample.map((v) => {
    if (span < 1e-12) return SPARK_CHARS[SPARK_CHARS.length - 1]!;
    const idx = Math.min(SPARK_CHARS.length - 1, Math.max(0, Math.round(((v - min) / span) * (SPARK_CHARS.length - 1))));
    return SPARK_CHARS[idx];
  }).join("");
}

export async function handleWatch(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const intervalSec = (() => {
    const raw = parseFloat(args.flags["interval"] ?? "2");
    return Number.isFinite(raw) && raw >= 0.5 && raw <= 60 ? raw : 2;
  })();
  const isTTY = Boolean(process.stdout.isTTY);
  const once = args.flags["once"] !== undefined || !isTTY;

  const samples: number[] = [];
  const deadlinePrint = (msg: string): CommandResult => ({ output: msg });

  // Ctrl-C exits cleanly instead of killing the redraw mid-frame
  let stopped = false;
  const onSignal = (): void => { stopped = true; };
  if (!once) process.on("SIGINT", onSignal);

  const readOnce = async (): Promise<CommandResult | null> => {
    const pos = (await fetchPosition()) ?? ctx.position();
    if (!pos) {
      return deadlinePrint(`No position data — is the node reachable? (./scripts/start-fork.sh)`);
    }
    const hf = Number(pos.healthFactor) / 1e18;
    samples.push(hf);
    // Persisted arm state (~/.lax/state.json) — the same file the daemon reads
    const guardian = loadState(LAX_CONFIG.HF_TRIGGER, LAX_CONFIG.HF_TARGET).guardian;
    const debt = Number(pos.totalDebtUSD) / 1e8;
    const coll = Number(pos.totalCollateralUSD) / 1e8;

    const lines: string[] = [];
    lines.push(hfGauge(hf));
    if (samples.length >= 2) {
      const trend = samples[samples.length - 1]! >= samples[samples.length - 2]! ? style.green("▲") : style.red("▼");
      lines.push(`   ${style.gray("trend")} ${trend} ${sparkline(samples, 40)}  ${style.gray(`(last ${samples.length} samples)`)}`);
    }
    lines.push(`   ${style.gray("collateral")} $${coll.toFixed(2)}   ${style.gray("debt")} $${debt.toFixed(2)}   ${style.gray("guardian")} ${guardian.enabled ? style.green("ARMED") : style.yellow("disarmed")}`);
    lines.push(style.gray("   Ctrl-C to stop"));
    return deadlinePrint(lines.join("\n"));
  };

  if (once) {
    const res = await readOnce();
    return res ?? deadlinePrint("watch: read failed");
  }

  console.log(`${style.bold("WATCH")} ${style.gray("— live position monitor")} ${style.gray(`(every ${intervalSec}s)`)}\n`);
  while (!stopped) {
    const res = await readOnce();
    if (!isTTY) break;
    if (res) {
      if (process.stdout.isTTY) console.clear();
      console.log(res.output);
    }
    const slept = await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), intervalSec * 1000);
      const check = setInterval(() => {
        if (stopped) { clearTimeout(t); clearInterval(check); resolve(true); }
      }, 100);
      setTimeout(() => clearInterval(check), intervalSec * 1000 + 50);
    });
    if (slept) break;
  }
  process.off("SIGINT", onSignal);
  return deadlinePrint(stopped ? `${TOKENS.shield} watch stopped — ${samples.length} samples taken` : "watch: read failed");
}
