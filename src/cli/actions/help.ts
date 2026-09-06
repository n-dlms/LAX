import type { CommandContext, ParsedArgs, CommandResult, CommandDefinition } from "../types";
import { COMMANDS, getCommandNames } from "../registry";
import { APP_NAME } from "../lax-config";

function showCommandHelp(cmd: CommandDefinition): string {
  const lines = [
    `Name: ${cmd.name}`,
    `Usage: ${cmd.syntax}`,
    `Category: ${cmd.category}`,
    `Routing: ${cmd.routing}`,
    ``,
    cmd.description,
  ];
  if (cmd.examples && cmd.examples.length > 0) {
    lines.push("", "Examples:");
    for (const ex of cmd.examples) lines.push(`  ${ex}`);
  }
  if (cmd.aliases && cmd.aliases.length > 0) {
    lines.push("", `Aliases: ${cmd.aliases.join(", ")}`);
  }
  if (cmd.confirmRequired) {
    lines.push("", "⚠  Confirmation required before execution");
  }
  return lines.join("\n");
}

export async function handleHelp(_ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const cmdName = args.positional[0] ?? "";
  if (cmdName) {
    const cmd = COMMANDS[cmdName];
    if (!cmd) return { output: `No help for "${cmdName}"`, error: "command-not-found" };
    return { output: showCommandHelp(cmd) };
  }

  const categories: { name: string; key: CommandDefinition["category"] }[] = [
    { name: "Monitor & Read", key: "monitor" },
    { name: "Mock & Stress", key: "mock" },
    { name: "Guardian / Autopilot", key: "guardian" },
    { name: "Onchain Actions", key: "onchain" },
    { name: "Audit & Obs.", key: "audit" },
    { name: "System", key: "system" },
  ];

  const lines: string[] = [`${APP_NAME} Commands:`, "".padStart(50, "─")];
  for (const cat of categories) {
    lines.push(`\n  ${cat.name}:`);
    const names = getCommandNames();
    let count = 0;
    for (const name of names) {
      if (count >= 6) break;
      const cmd = COMMANDS[name];
      if (cmd && cmd.category === cat.key && cmd.name === name) {
        lines.push(`    ${cmd.syntax.padEnd(30)} ${cmd.description}`);
        count++;
      }
    }
  }
  lines.push("\n  lax help <command>  — detailed help for a specific command");
  lines.push("  lax man <command>   — full manual with examples");
  lines.push("  Tab / ↑↓           — autocomplete / history");

  return { output: lines.join("\n") };
}

export async function handleMan(_ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const cmdName = args.positional[0] ?? "";
  if (!cmdName) return { output: "Usage: lax man <command>", error: "Missing argument" };
  const cmd = COMMANDS[cmdName];
  if (!cmd) return { output: `No manual for "${cmdName}"`, error: "command-not-found" };
  return { output: showCommandHelp(cmd) };
}

export async function handleAliases(_ctx: CommandContext): Promise<CommandResult> {
  const aliasMap: [string, string][] = [];
  const seen = new Set<string>();
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    if (cmd.aliases?.includes(name) && !seen.has(cmd.name)) {
      seen.add(cmd.name);
      aliasMap.push([cmd.name, cmd.aliases.filter((a) => a !== cmd.name).join(", ")]);
    }
  }
  return {
    output: ["Aliases:", "─".repeat(40), ...aliasMap.map(([n, a]) => `  ${n.padEnd(16)} → ${a}`)].join("\n"),
  };
}
