import type { CommandContext, ParsedArgs, CommandResult } from "../types";
import { setGuardianState } from "../session";

export async function handleGuardianOn(ctx: CommandContext): Promise<CommandResult> {
  const state = ctx.getGuardianState();
  if (state.blocked) {
    return { output: "Guardian is locked. Previously triggered. Use disarm for manual mode.", error: "guardian-blocked" };
  }
  setGuardianState({ enabled: true });
  ctx.setGuardianState({ enabled: true });
  ctx.emit({ type: "guardian-toggle", payload: { enabled: true } });
  return {
    output: "Guardian ENABLED — monitoring active",
    eventLogEntry: { level: "info", message: "Guardian enabled — auto-protection active" },
  };
}

export async function handleGuardianOff(ctx: CommandContext): Promise<CommandResult> {
  setGuardianState({ enabled: false });
  ctx.setGuardianState({ enabled: false });
  ctx.emit({ type: "guardian-toggle", payload: { enabled: false } });
  return {
    output: "Guardian DISABLED",
    eventLogEntry: { level: "warn", message: "Guardian disabled — auto-protection off" },
  };
}

export async function handleGuardianStatus(ctx: CommandContext): Promise<CommandResult> {
  const s = ctx.getGuardianState();
  return {
    output: [
      `Guardian: ${s.enabled ? "ENABLED" : "DISABLED"}`,
      `Blocked: ${s.blocked ? "YES (auto-triggered)" : "No"}`,
      `Threshold: ≤ ${s.threshold}`,
      `Target: ≥ ${s.target}`,
    ].join("\n"),
  };
}

export async function handleThreshold(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const raw = args.positional[0] ?? "";
  const val = parseFloat(raw);
  if (!raw || isNaN(val) || !isFinite(val) || val < 1.0 || val > 2.0) {
    return { output: `Invalid threshold: ${raw || args.positional[0]}. Use 1.0-2.0`, error: "Invalid argument" };
  }
  const curr = ctx.getGuardianState();
  if (val >= curr.target) {
    return { output: `Invalid threshold: ${val.toFixed(2)} must be below target ${curr.target.toFixed(2)}`, error: "Invalid argument" };
  }
  setGuardianState({ threshold: val });
  ctx.setGuardianState({ threshold: val });
  return { output: `Trigger threshold set to ${val.toFixed(2)}` };
}

export async function handleTarget(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const raw = args.positional[0] ?? "";
  const val = parseFloat(raw);
  if (!raw || isNaN(val) || !isFinite(val) || val < 1.05 || val > 3.0) {
    return { output: `Invalid target: ${raw || args.positional[0]}. Use 1.05-3.0`, error: "Invalid argument" };
  }
  const curr = ctx.getGuardianState();
  if (val <= curr.threshold) {
    return { output: `Invalid target: ${val.toFixed(2)} must be above threshold ${curr.threshold.toFixed(2)}`, error: "Invalid argument" };
  }
  setGuardianState({ target: val });
  ctx.setGuardianState({ target: val });
  return { output: `Target HF set to ${val.toFixed(2)}` };
}

export async function handleArm(ctx: CommandContext): Promise<CommandResult> {
  const state = ctx.getGuardianState();
  if (state.blocked) {
    return { output: "Cannot arm — guardian is locked after auto-trigger", error: "guardian-blocked" };
  }
  setGuardianState({ enabled: true });
  ctx.setGuardianState({ enabled: true });
  return { output: "ARMED — auto-trigger enabled" };
}

export async function handleDisarm(ctx: CommandContext): Promise<CommandResult> {
  setGuardianState({ enabled: false });
  ctx.setGuardianState({ enabled: false });
  return { output: "DISARMED — manual mode only" };
}

export async function handleEngage(ctx: CommandContext): Promise<CommandResult> {
  const pos = ctx.position();
  if (!pos) return { output: "No position data", error: "Position unavailable" };
  ctx.appendLog("trigger", `Manual trigger @ HF ${(Number(pos.healthFactor) / 1e18).toFixed(4)}`);
  ctx.engageProtection();
  return {
    output: "Engaged — protection workflow opened",
    eventLogEntry: { level: "trigger", message: "Manual engage command executed" },
  };
}

export async function handleAutopilot(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const mode = args.positional[0] ?? "scan";
  if (mode === "demo" || mode === "plan") {
    return {
      output: [
        "Liquidation Autopilot demo path:",
        "1. lax status              - read current position and guardian state",
        "2. lax guardian on         - arm auto-protection",
        "3. lax snapshot before     - capture pre-event state",
        "4. lax shock weth -50%     - simulate collateral crash on fork",
        "5. lax autopilot           - scan HF and trigger protection if unsafe",
        "6. lax runs                - show KeeperHub/local execution records",
      ].join("\n"),
    };
  }

  const pos = ctx.position();
  const guardian = ctx.getGuardianState();
  if (!pos) {
    return {
      output: [
        "Autopilot scan unavailable: no live position data.",
        "What LAX will do when RPC is live:",
        `- monitor HF against threshold ${guardian.threshold.toFixed(2)}`,
        "- detect oracle-driven liquidation risk",
        "- route repay protection through KeeperHub or local fork fallback",
        "- write an audit trail of execution ids and tx hashes",
      ].join("\n"),
      error: "Position unavailable",
    };
  }

  const hf = Number(pos.healthFactor) / 1e18;
  const lines = [
    "Autopilot scan:",
    `- HF observed: ${hf.toFixed(4)}`,
    `- Trigger threshold: ${guardian.threshold.toFixed(2)}`,
    `- Target HF: ${guardian.target.toFixed(2)}`,
    `- Guardian: ${guardian.enabled ? "armed" : "manual"}${guardian.blocked ? " / locked" : ""}`,
  ];

  if (guardian.blocked) {
    lines.push("- Decision: blocked after prior trigger; use lax disarm for manual mode");
    return { output: lines.join("\n"), error: "guardian-blocked" };
  }

  if (hf <= guardian.threshold) {
    ctx.appendLog("trigger", `Autopilot trigger @ HF ${hf.toFixed(4)}`);
    ctx.setGuardianState({ blocked: true });
    ctx.engageProtection();
    lines.push("- Decision: trigger protection now");
    lines.push("- Action: mitigation workflow opened");
    return {
      output: lines.join("\n"),
      eventLogEntry: { level: "trigger", message: `Autopilot triggered at HF ${hf.toFixed(4)}` },
    };
  }

  lines.push("- Decision: hold; position is above trigger");
  lines.push("- Next action: keep polling and wait for HF deterioration");
  return {
    output: lines.join("\n"),
    eventLogEntry: { level: "info", message: `Autopilot scan held at HF ${hf.toFixed(4)}` },
  };
}

export async function handleSchedule(_ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const raw = args.positional[0] ?? "30";
  const secs = parseInt(raw);
  if (!raw || isNaN(secs) || !isFinite(secs) || secs <= 0) return { output: `Invalid seconds: ${raw}. Use a positive number`, error: "Invalid argument" };
  const scheduledTime = Date.now() + secs * 1000;
  return {
    output: `Scheduled: protection check in ${secs}s (at ${new Date(scheduledTime).toLocaleTimeString()})`,
    eventLogEntry: { level: "info", message: `Guardian check scheduled in ${secs}s` },
  };
}

export async function handleCooldown(_ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const raw = args.positional[0] ?? "15";
  const mins = parseInt(raw);
  if (!raw || isNaN(mins) || !isFinite(mins) || mins <= 0) return { output: `Invalid minutes: ${raw}. Use a positive number`, error: "Invalid argument" };
  return { output: `Cooldown set to ${mins} minutes between re-triggers` };
}

const guardianAliases: Record<string, (ctx: CommandContext, args: ParsedArgs) => Promise<CommandResult>> = {
  "guardian-on": handleGuardianOn,
  "guard-on": handleGuardianOn,
  "guardian-off": handleGuardianOff,
  "guard-off": handleGuardianOff,
  "guardian-status": handleGuardianStatus,
  gstatus: handleGuardianStatus,
  "guard-status": handleGuardianStatus,
  threshold: handleThreshold,
  thresh: handleThreshold,
  target: handleTarget,
  arm: handleArm,
  disarm: handleDisarm,
  engage: handleEngage,
  trigger: handleEngage,
  autopilot: handleAutopilot,
  auto: handleAutopilot,
  schedule: handleSchedule,
  cooldown: handleCooldown,
};

export const handleGuardian = guardianAliases;
