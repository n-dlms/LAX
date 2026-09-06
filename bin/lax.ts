#!/usr/bin/env node
// lax — standalone Liquidation CLI binary.
//   lax                 interactive REPL
//   lax <command...>    one-shot (e.g. lax status, lax hf, lax repay 5 --local)
// Exit code 1 on command errors, so scripts and the autopilot can rely on it.
import * as readline from "node:readline/promises";
import { stdin, stdout, exit } from "node:process";

import "./env-load";
import { execute, setCommandContext } from "../src/cli/executor";
import { createNodeContext, refreshLatestPosition } from "../src/cli/node-context";
import { renderBanner, renderCommandOutput, style, box, TOKENS, Spinner } from "../src/cli/ui";
import { getExecutionRecords } from "../src/cli/session";
import { LAX_CONFIG } from "../src/cli/lax-config";

const ctx = createNodeContext();
setCommandContext(ctx);

const REPL_PROMPT = `${style.cyan(style.bold("lax"))} ${style.gray("❯")} `;

async function runOne(raw: string): Promise<{ errored: boolean }> {
  // Best-effort live position refresh so status/hf/position show current data.
  const spin = new Spinner("reading position");
  spin.start();
  const pos = await refreshLatestPosition();
  spin.stop(Boolean(pos), pos ? style.dim(`HF ${(Number(pos.healthFactor) / 1e18 > 1e9 ? "∞" : (Number(pos.healthFactor) / 1e18).toFixed(4))}`) : style.dim("offline"));

  const start = performance.now();
  const result = await execute(raw);
  const ms = Math.round(performance.now() - start);
  const errored = Boolean(result.error) && result.error !== "needs-confirmation";

  if (result.output) {
    const title = raw.trim();
    // Border reflects position danger: red ≤ 1.0, yellow in trigger band 1.0–1.05.
    const border = errored
      ? style.red
      : result.error === "needs-confirmation"
        ? style.yellow
        : pos && Number(pos.healthFactor) < 10n ** 18n
          ? style.red
          : pos && Number(pos.healthFactor) <= 1.05 * 1e18
            ? style.yellow
            : style.cyan;
    const framed = box(renderCommandOutput(result.output), { title, color: border });
    console.log("");
    console.log(framed);
    console.log(
      style.dim(`  ${errored ? TOKENS.fail + " failed" : TOKENS.ok + " ok"} ${TOKENS.dot} ${ms}ms`)
    );
  }

  // Surface KeeperHub permalinks after successful executions.
  const execs = getExecutionRecords();
  const last = execs[execs.length - 1];
  if (last && last.id && last.status === "triggered") {
    console.log(`  ${style.gray(TOKENS.arrow)} audit trail: ${style.underline(style.blue(LAX_CONFIG.KEEPERHUB_RUN_URL(last.id)))}`);
  }
  return { errored };
}

async function repl(): Promise<void> {
  console.clear();
  console.log(renderBanner());
  console.log("");
  console.log(style.gray(`  type ${style.cyan("help")} for commands ${TOKENS.dot} ${style.cyan("guide")} for the demo walkthrough ${TOKENS.dot} ${style.cyan("exit")} to quit`));
  const rl = readline.createInterface({ input: stdin, output: stdout, prompt: REPL_PROMPT });

  // Lines are processed strictly in order — interactive typing and piped
  // scripting (echo "status\nruns" | lax) both behave identically.
  let queue: Promise<void> = Promise.resolve();
  const handleLine = async (line: string): Promise<void> => {
    const raw = line.trim();
    if (!raw) {
      rl.prompt();
      return;
    }
    if (["exit", "quit", "q"].includes(raw.toLowerCase())) {
      rl.close();
      return;
    }
    try {
      const { errored } = await runOne(raw.startsWith("lax") ? raw : `lax ${raw}`);
      if (errored) console.log(style.red(style.dim(`  (exit 1)`)));
    } catch (err) {
      console.log(style.red(`  ${TOKENS.fail} ${(err as Error).message}`));
    }
    rl.prompt();
  };
  rl.on("line", (line) => {
    queue = queue.then(() => handleLine(line)).catch(() => undefined);
  });
  rl.on("close", () => {
    void queue.then(() => {
      console.log(style.gray(`\n  ${TOKENS.shield} stay above 1.05`));
      exit(0);
    });
  });
  rl.prompt();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Daemon modes bypass the command registry — they are long-running processes.
  if (args[0] === "autopilot" && ["daemon", "start", "dry-run", "once"].includes(args[1] ?? "")) {
    const { runAutopilot } = await import("../src/autopilot/daemon");
    console.log(renderBanner());
    await runAutopilot({
      dryRun: args[1] === "dry-run" || args.includes("--dry-run"),
      once: args[1] === "once",
      only: args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined,
      intervalMs: args.includes("--interval") ? parseInt(args[args.indexOf("--interval") + 1] ?? "2000") * 1000 : undefined,
      cooldownMs: args.includes("--cooldown") ? parseInt(args[args.indexOf("--cooldown") + 1] ?? "300") * 1000 : undefined,
    });
    return;
  }

  if (args.length === 0) {
    await repl();
    return;
  }
  console.log(renderBanner());
  const { errored } = await runOne(`lax ${args.join(" ")}`);
  exit(errored ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(style.red(`lax: ${(err as Error).message}`));
  exit(1);
});
