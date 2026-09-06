// Zero-dependency terminal UI for the standalone lax CLI.
// ANSI truecolor + box drawing only — no chalk/picomatch so `npm i lax` stays lean.
// All helpers are no-ops when stdout is not a TTY (piped/CI output stays clean).

const isTTY = process.stdout.isTTY === true;
const TRUECOLOR = isTTY;

function code(open: string, close = "0"): (s: string) => string {
  return (s: string) => (isTTY && TRUECOLOR ? `\x1b[${open}m${s}\x1b[${close}m` : s);
}

export const style = {
  bold: code("1"),
  dim: code("2"),
  italic: code("3"),
  red: code("31"),
  green: code("32"),
  yellow: code("33"),
  blue: code("34"),
  magenta: code("35"),
  cyan: code("36"),
  white: code("97"),
  gray: code("90"),
  black: code("30"),
  underline: code("4", "24"),
  bgRed: code("41", "49"),
  bgGreen: code("42", "49"),
  bgYellow: code("43", "49"),
  bgGray: code("100", "49"),
  bgCyan: code("46", "49"),
};

// --- tokens -------------------------------------------------------------
export const TOKENS = {
  ok: "✔",
  fail: "✘",
  warn: "▲",
  info: "◆",
  trigger: "⚡",
  arrow: "→",
  dot: "·",
  heart: "♥",
  shield: "🛡",
  bolt: "🗲",
};

// --- banner -------------------------------------------------------------
const BANNER_ART = [
  "██╗      █████╗ ██╗  ██╗",
  "╚██╗    ██╔══██╗╚██╗██╔╝",
  " ╚██╗   ███████║ ╚███╔╝ ",
  " ██╔╝   ██╔══██║ ██╔██╗ ",
  "██╔╝___ ██║  ██║██╔╝ ██╗",
  "╚═╝'    ╚═╝  ╚═╝╚═╝  ╚═╝",
];

export function renderBanner(): string {
  if (!isTTY) return "LAX — Liquidation Autopilot (KeeperHub execution layer)";
  const colors = [style.cyan, style.cyan, style.white, style.white, style.blue, style.blue];
  const art = BANNER_ART.map((line, i) => colors[i]!(style.bold(line))).join("\n");
  return [
    art,
    "",
    `  ${style.gray("proactive liquidation defense")}${style.dim("  ·  ")}${style.gray("act at HF 1.05, never chase")}`,
    `  ${style.dim("deterministic execution by")}${style.bold(style.cyan(" KeeperHub"))}${style.dim(" — nothing inferred at execution time")}`,
  ].join("\n");
}

// --- boxes --------------------------------------------------------------
export interface BoxOptions {
  title?: string;
  color?: (s: string) => string;
  width?: number;
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function displayWidth(s: string): number {
  return stripAnsi(s).length;
}

export function box(content: string, opts: BoxOptions = {}): string {
  if (!isTTY) return content;
  const color = opts.color ?? style.cyan;
  const width = opts.width ?? Math.max(...content.split("\n").map((l) => displayWidth(l)), opts.title ? displayWidth(opts.title) + 4 : 0) + 2;
  const top = `╭─${opts.title ? ` ${opts.title} ` : ""}${"─".repeat(Math.max(1, width - displayWidth(opts.title ?? "") - (opts.title ? 4 : 2)))}╮`;
  const bottom = `╰${"─".repeat(width)}╯`;
  const body = content
    .split("\n")
    .map((line) => `│ ${line}${" ".repeat(Math.max(0, width - displayWidth(line) - 2))} │`)
    .join("\n");
  return color([top, body, bottom].join("\n"));
}

// --- health factor gauge -------------------------------------------------
// Scale 0.80 – 2.00 across GAUGE_CELLS cells; markers at liquidation (1.0)
// and the trigger (1.05). Colors: red < 1.0, yellow 1.0–1.10, green above.
const GAUGE_CELLS = 26;
const GAUGE_MIN = 0.8;
const GAUGE_MAX = 2.0;

export function hfGauge(hf: number): string {
  const clamp = Math.min(GAUGE_MAX, Math.max(GAUGE_MIN, hf));
  const pos = Math.round(((clamp - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)) * (GAUGE_CELLS - 1));
  const liqPos = Math.round(((1.0 - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)) * (GAUGE_CELLS - 1));
  const trigPos = Math.round(((1.05 - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)) * (GAUGE_CELLS - 1));

  const cells: string[] = [];
  for (let i = 0; i < GAUGE_CELLS; i++) {
    if (i < pos) cells.push(i < liqPos ? style.bgRed(" ") : i < trigPos ? style.bgYellow(" ") : style.bgGreen(" "));
    else if (i === pos) cells.push(style.white(style.bold("▮")));
    else cells.push(style.gray("─"));
  }
  const state = hf > 1.10 ? style.green("HEALTHY") : hf > 1.05 ? style.green("SAFE — LAX ARMED ZONE") : hf > 1.0 ? style.yellow("LAX TRIGGER ZONE") : style.red("LIQUIDATABLE");
  const hfLabel = hf > 1e9 ? "∞" : hf.toFixed(4);

  const left = style.gray("0.8");
  const right = style.gray("2.0");
  const mid = style.gray(`liq ${style.red("1.00")} · trigger ${style.yellow("1.05")}`);
  const midCol = Math.floor((GAUGE_CELLS - 26) / 2);
  const scale = `${left}${" ".repeat(GAUGE_CELLS - left.length - right.length)}${right}   ${mid}`;
  return [
    `${style.gray("HF")} ${style.bold(hfLabel)}  ${state}`,
    `   ${cells.join("")}`,
    `   ${scale}`,
  ].join("\n");
}

// --- semantic formatting -------------------------------------------------
const HF_LINE = /Health Factor:\s*(∞|[\d.]+)/;

/** Renders raw command output with semantic highlighting (gauge, badges, links). */
export function renderCommandOutput(output: string): string {
  return output
    .split("\n")
    .map((line) => {
      const hf = line.match(HF_LINE);
      if (hf && hf[1]) {
        const value = hf[1] === "∞" ? Infinity : parseFloat(hf[1]);
        const gauge = hfGauge(value);
        const prefix = line.replace(HF_LINE, "").trimEnd();
        return prefix ? `${prefix}\n${gauge}` : gauge;
      }
      if (line.includes("Collateral:") || line.includes("Debt:") || line.includes("Net:")) {
        return line.replace(/^(Collateral|Debt|Net):/, (_m, w) => `${style.gray(w + ":")}`).replace(/\$[\d,]+\.\d{2}/, (m) => style.white(style.bold(m)));
      }
      if (line.startsWith("Block:")) return line.replace("Block:", style.gray("Block:"));
      if (line.includes("Guardian:")) return line.replace("Guardian:", style.gray("Guardian:")).replace("ENABLED", style.green(style.bold("ENABLED"))).replace("DISABLED", style.gray("DISABLED"));
      if (/Execution ID:|workflow:|execution \w+/i.test(line)) return line.replace(/([A-Za-z0-9]{12,})/, style.cyan("$1"));
      if (/Track:|app\.keeperhub\.com/.test(line)) return style.underline(style.blue(line));
      if (/^\s*Approve:|^\s*Repay:|^\s*Tx:/.test(line)) return line.replace(/(0x[a-fA-F0-9]{6})[a-fA-F0-9]*\.\.\.([a-fA-F0-9]{6})/, style.cyan("$1…$2"));
      if (line.includes("Trigger threshold:") || line.includes("Target HF:")) return line.replace(/(\d\.\d+)$/, style.bold("$1"));
      if (/Mock mode:|Commands run:/.test(line)) return style.dim(line);
      return line;
    })
    .join("\n");
}

function colorizeHf(hf: number): string {
  if (hf > 1.10) return style.green(style.bold(hf.toFixed(4)));
  if (hf > 1.05) return style.yellow(style.bold(hf.toFixed(4)));
  return style.red(style.bold(hf.toFixed(4)));
}

// --- spinner (daemon / REPL long ops) ------------------------------------
export class Spinner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private i = 0;
  constructor(private readonly label: string) {}
  start(): void {
    if (!isTTY || this.timer) return;
    this.timer = setInterval(() => {
      process.stdout.write(`\r${style.cyan(this.frames[this.i]!)} ${this.label}   `);
      this.i = (this.i + 1) % this.frames.length;
    }, 80);
  }
  stop(ok = true, note = ""): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    process.stdout.write(`\r${ok ? style.green(TOKENS.ok) : style.red(TOKENS.fail)} ${this.label}${note ? ` ${style.dim(note)}` : ""}\n`);
  }
}
