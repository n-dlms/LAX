// KeeperHub client abstraction — the one module that talks to the platform.
// Used by the CLI, the autopilot daemon, and scripts/hf-listener.ts.
// Webhook payloads are optionally HMAC-signed (LAX_WEBHOOK_SECRET) and verified
// by api/keeperhub-proxy.ts before reaching KeeperHub.
import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_BASE = process.env.KEEPERHUB_API_URL || "https://app.keeperhub.com/api";

export interface KeeperHubOptions {
  apiKey?: string;
  baseUrl?: string;
  workflowId?: string;
  hmacSecret?: string;
  timeoutMs?: number;
}

function opts(o?: KeeperHubOptions): Required<Pick<KeeperHubOptions, "baseUrl" | "timeoutMs">> & KeeperHubOptions {
  return {
    apiKey: o?.apiKey ?? process.env.LAX_WEBHOOK_KEY ?? process.env.KEEPERHUB_WEBHOOK_KEY ?? process.env.KEEPERHUB_API_KEY,
    baseUrl: o?.baseUrl ?? DEFAULT_BASE,
    workflowId: o?.workflowId ?? (process.env.LAX_WORKFLOW_ID || "7gdt0ty7zk1orq1j4wc74"),
    hmacSecret: o?.hmacSecret ?? process.env.LAX_WEBHOOK_SECRET,
    timeoutMs: o?.timeoutMs ?? 10_000,
  };
}

// HMAC signing for webhook payloads.
export function signBody(timestamp: string, body: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifySignature(timestamp: string, body: string, secret: string, signature: string): boolean {
  const expected = signBody(timestamp, body, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

// --- webhook trigger ---
export interface FireResult {
  ok: boolean;
  executionId: string;
  status: number;
  raw: string;
}

export async function fireWorkflowWebhook(payload: unknown, o?: KeeperHubOptions): Promise<FireResult> {
  const { apiKey, baseUrl, workflowId, hmacSecret, timeoutMs } = opts(o);
  if (!apiKey) throw new Error("KEEPERHUB_API_KEY not set — cannot fire workflow webhook");

  const body = JSON.stringify(payload);
  const timestamp = Date.now().toString();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (hmacSecret) {
    headers["x-lax-timestamp"] = timestamp;
    headers["x-lax-signature"] = signBody(timestamp, body, hmacSecret);
  }

  const resp = await fetch(`${baseUrl}/workflows/${workflowId}/webhook`, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await resp.text();
  let executionId = "";
  try {
    const json = JSON.parse(raw) as { executionId?: string; id?: string };
    executionId = json.executionId ?? json.id ?? "";
  } catch {
    /* non-JSON response */
  }
  return { ok: resp.ok, executionId, status: resp.status, raw };
}

export function runUrl(executionId: string, workflowId?: string): string {
  if (workflowId) return `https://app.keeperhub.com/workflows/${workflowId}`;
  return `https://app.keeperhub.com/workflows (execution ${executionId})`;
}
