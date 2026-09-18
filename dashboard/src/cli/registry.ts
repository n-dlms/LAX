// Canonical CLI core lives in ../../src/cli — this shim keeps the dashboard
// importing the same code the standalone lax binary runs (no divergent copies).
export * from "../../../src/cli/registry";
import { COMMANDS } from "../../../src/cli/registry";

// Node-only commands (demo, watch, alert) are registered in src/cli/node-commands.ts
// via registerNodeCommands() at binary startup. The browser never imports that
// module, so `lax demo` etc. would otherwise be "command not found". Provide
// a helpful stub so the web terminal guides users to the terminal.
if (!COMMANDS["demo"]) {
  COMMANDS["demo"] = {
    name: "demo",
    syntax: "lax demo [--shock PCT] [--yes] [--webhook]",
    description: "Self-running demo: shock → gate → execute → verify (terminal only)",
    category: "monitor",
    routing: "local-only",
    examples: ["lax demo", "lax demo --yes"],
    aliases: [],
    handler: async () => ({
      output:
        "lax demo runs in a terminal, not in the browser.\n" +
        "Run: npm run lax -- demo        # dry-run\n" +
        "     npm run lax -- demo --yes  # execute on the fork\n" +
        "Or: npx tsx bin/lax.ts demo",
    }),
  } as unknown as typeof COMMANDS["demo"];
  COMMANDS["watch"] = {
    name: "watch",
    syntax: "lax watch [--interval SEC]",
    description: "Live monitor: HF gauge + sparkline (terminal only — dashboard has its own live view)",
    category: "monitor",
    routing: "local-only",
    examples: ["lax watch", "lax watch --interval 1"],
    aliases: [],
    handler: async () => ({
      output:
        "lax watch runs in a terminal.\n" +
        "Run: npm run lax -- watch\n" +
        "In the browser, the Monitor view already shows the live gauge.",
    }),
  } as unknown as typeof COMMANDS["watch"];
  COMMANDS["alert"] = {
    name: "alert",
    syntax: "lax alert [--test]",
    description: "Operator alerts (terminal only)",
    category: "system",
    routing: "local-only",
    examples: ["lax alert", "lax alert --test"],
    aliases: [],
    handler: async () => ({
      output:
        "lax alert runs in a terminal.\n" +
        "Run: npm run lax -- alert --test",
    }),
  } as unknown as typeof COMMANDS["alert"];
}
