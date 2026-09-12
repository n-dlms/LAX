// Node-only command registration. The standalone `lax` binary calls
// registerNodeCommands() at startup; the browser dashboard never imports this
// module, keeping node:fs / node:child_process out of its bundle.
import { registerNodeCommand, registerNodeHandler, buildDef } from "./registry";
import { handleDemo } from "./actions/demo";
import { handleWatch } from "./actions/watch";
import { handleAlert } from "./actions/alerts";

let registered = false;

export function registerNodeCommands(): void {
  if (registered) return;
  registered = true;

  registerNodeHandler("demo", handleDemo);
  registerNodeHandler("watch", handleWatch);
  registerNodeHandler("alert", handleAlert);

  registerNodeCommand(buildDef("watch", "lax watch [--interval SEC]", "Live monitor: HF gauge + sparkline trend, redraws every interval", "monitor", "rpc-read", {
    examples: ["lax watch", "lax watch --interval 1"],
  }));
  registerNodeCommand(buildDef("alert", "lax alert [--test]", "Operator alerts (Discord/Slack webhook) — status and test send", "system", "local-only", {
    examples: ["lax alert", "lax alert --test"],
  }));
  registerNodeCommand(buildDef("demo", "lax demo [--shock PCT] [--yes] [--webhook]", "Self-running demo: shock → gate → execute → verify (dry-run by default; --yes executes on the fork, --webhook also fires KeeperHub)", "monitor", "rpc-read", {
    examples: ["lax demo", "lax demo --shock 15", "lax demo --yes"],
  }));
}
