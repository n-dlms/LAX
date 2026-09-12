// `lax alert` — verify the operator-alert channel. Sends a test message to
// LAX_ALERT_WEBHOOK (Discord / Slack / generic) and reports the result.
import type { CommandContext, ParsedArgs, CommandResult } from "../types";
import { alertWebhookUrl, sendAlert } from "../../alerts";

export async function handleAlert(_ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const url = alertWebhookUrl();
  const kind = url
    ? /discord(app)?\.com/.test(url)
      ? "Discord"
      : /hooks\.slack\.com/.test(url)
        ? "Slack"
        : "generic webhook"
    : undefined;

  if (args.flags["test"] !== undefined) {
    if (!url) {
      return { output: "LAX_ALERT_WEBHOOK is not set — alerts are disabled. Add it to .env (Discord channel → Integrations → Webhooks).", error: "not-configured" };
    }
    const res = await sendAlert({ event: "webhook-fired", position: "alert-test", hf: 1.2345, repayHuman: "0.00", detail: "If you can read this, LAX alerts work." });
    return res.sent
      ? { output: `Test alert delivered to ${kind} — check the channel.` }
      : { output: `Test alert failed: ${res.reason}`, error: "delivery-failed" };
  }

  return {
    output: [
      `Alerts: ${url ? `enabled (${kind})` : "disabled"}`,
      `  endpoint: ${url ? url.replace(/(https:\/\/discord\.com\/api\/webhooks\/\d+\/).+/, "$1…") + (kind === "Discord" ? " (token hidden)" : "") : "set LAX_ALERT_WEBHOOK"}`,
      "",
      "Events alerted: trigger · gate-blocked · webhook-fired · fire-failed",
      "Test the channel: lax alert --test",
    ].join("\n"),
  };
}
