// Operator alerts — push notifications to Discord/Slack/generic webhooks when
// LAX triggers, fires, is blocked, or fails. Best-effort by design: an alert
// outage must never block or fail a mitigation. Configure with
// LAX_ALERT_WEBHOOK=<url>; Discord and Slack URLs are auto-detected and get
// native formatting, anything else receives a { text } payload.
export type AlertEvent =
  | "trigger"
  | "gate-blocked"
  | "webhook-fired"
  | "fire-failed";

export interface AlertPayload {
  event: AlertEvent;
  position?: string;
  network?: string;
  hf?: number;
  repayHuman?: string;
  executionId?: string;
  /** extra context, e.g. blocking reason or error message */
  detail?: string;
}

const COLORS: Record<AlertEvent, number> = {
  trigger: 0xf1c40f,       // yellow
  "gate-blocked": 0xe74c3c, // red
  "webhook-fired": 0x2ecc71, // green
  "fire-failed": 0x9b59b6,  // purple
};

const TITLES: Record<AlertEvent, string> = {
  trigger: "🔔 LAX trigger — position entered the danger zone",
  "gate-blocked": "🛡 LAX gate blocked a fire (safety system working)",
  "webhook-fired": "⚡ LAX executed a mitigation",
  "fire-failed": "❌ LAX mitigation failed",
};

export function alertWebhookUrl(): string | undefined {
  const url = process.env.LAX_ALERT_WEBHOOK?.trim();
  return url ? url : undefined;
}

export function formatAlertText(p: AlertPayload): string {
  const parts: string[] = [];
  if (p.position) parts.push(`position ${p.position}@${p.network ?? "?"}`);
  if (p.hf !== undefined) parts.push(`HF ${p.hf.toFixed(4)}`);
  if (p.repayHuman) parts.push(`repay ${p.repayHuman} USDC`);
  if (p.executionId) parts.push(`execution ${p.executionId}`);
  if (p.detail) parts.push(p.detail);
  return parts.join(" · ");
}

export function alertRequestBody(p: AlertPayload, url: string): Record<string, unknown> {
  const text = formatAlertText(p);
  if (/discord(app)?\.com/.test(url)) {
    return {
      username: "LAX Guardian",
      embeds: [{ title: TITLES[p.event], description: text, color: COLORS[p.event] }],
    };
  }
  if (/hooks\.slack\.com/.test(url)) {
    return { text: `${TITLES[p.event]}\n${text}` };
  }
  return { text: `${TITLES[p.event]} ${text}` };
}

/** Fire-and-forget an operator alert. Resolves { sent: false } on any failure —
 *  callers must not branch mitigation behavior on this. */
export async function sendAlert(p: AlertPayload): Promise<{ sent: boolean; reason?: string }> {
  const url = alertWebhookUrl();
  if (!url) return { sent: false, reason: "LAX_ALERT_WEBHOOK not set" };
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(alertRequestBody(p, url)),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return { sent: false, reason: `alert endpoint ${resp.status}` };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: `alert unreachable: ${(err as Error).message}` };
  }
}

/** Non-blocking alert: logs failures to stderr, never throws, never delays. */
export function sendAlertAsync(p: AlertPayload): void {
  void sendAlert(p).then((r) => {
    if (!r.sent && r.reason !== "LAX_ALERT_WEBHOOK not set") {
      console.error(`[lax] alert not delivered: ${r.reason}`);
    }
  });
}
