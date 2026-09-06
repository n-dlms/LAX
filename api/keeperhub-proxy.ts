/**
 * KeeperHub webhook proxy — free edge function (Vercel/Netlify/Cloudflare)
 * Holds KEEPERHUB_API_KEY server-side so the static bundle never ships it.
 * Forwards POST /api/keeperhub-proxy/workflows/:id/webhook to KeeperHub.
 * Deploy on Vercel: put this file in `api/` at project root or `dashboard/api/`.
 * Env vars: KEEPERHUB_API_KEY (required), LAX_WEBHOOK_SECRET (optional HMAC).
 *
 * HMAC verification (V2 plan fix #11): when LAX_WEBHOOK_SECRET is set, the
 * proxy rejects unsigned or stale requests. Clients sign `${timestamp}.${body}`
 * with HMAC-SHA256 and send `x-lax-timestamp` + `x-lax-signature: sha256=<hex>`
 * (see src/keeperhub.ts signBody). Replay window: 5 minutes.
 */
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

async function verifyHmac(timestamp: string, body: string, secret: string, signature: string): Promise<boolean> {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) return false;
  // clients send "sha256=<hex>" (see src/keeperhub.ts signBody) — strip the scheme
  const raw = signature.startsWith("sha256=") ? signature.slice("sha256=".length) : signature;
  const expected = await hmacHex(secret, `${timestamp}.${body}`);
  if (expected.length !== raw.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ raw.charCodeAt(i);
  return diff === 0; // constant-time compare (edge-safe: no node:crypto)
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }
  const apiKey = process.env.KEEPERHUB_API_KEY ?? (process.env as Record<string, string>).VITE_KEEPERHUB_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing KEEPERHUB_API_KEY env var" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  const url = new URL(req.url);
  // Expect /api/keeperhub-proxy/workflows/:id/webhook or /api/keeperhub/workflows/:id/webhook
  const match = url.pathname.match(/\/workflows\/([^/]+)\/webhook/);
  const workflowId = match?.[1];
  if (!workflowId) {
    return new Response(JSON.stringify({ error: "Missing workflow ID in path" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  const body = await req.text();

  const secret = process.env.LAX_WEBHOOK_SECRET;
  if (secret) {
    const timestamp = req.headers.get("x-lax-timestamp") ?? "";
    const signature = req.headers.get("x-lax-signature") ?? "";
    const valid = await verifyHmac(timestamp, body, secret, signature);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid or missing HMAC signature" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }
  }

  const upstream = `https://app.keeperhub.com/api/workflows/${workflowId}/webhook`;
  try {
    const resp = await fetch(upstream, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    });
    const text = await resp.text();
    return new Response(text, { status: resp.status, headers: { "Content-Type": resp.headers.get("Content-Type") ?? "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
}
