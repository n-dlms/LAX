/**
 * KeeperHub webhook proxy — free edge function (Vercel/Netlify/Cloudflare)
 * Holds KEEPERHUB_API_KEY server-side so the static bundle never ships it.
 * Forwards POST /api/keeperhub-proxy/workflows/:id/webhook to KeeperHub.
 * Deploy on Vercel: put this file in `api/` at project root or `dashboard/api/`.
 * Env vars: KEEPERHUB_API_KEY (required), LAX_WEBHOOK_SECRET (optional HMAC).
 *
 * NOTE: this dashboard copy is stale — it lacks the HMAC verification in the
 * canonical `api/keeperhub-proxy.ts` (V2 plan fix #11: `x-lax-timestamp` +
 * `x-lax-signature: sha256=<hex>`, 5-minute replay window). Deploy the root
 * copy; this file is kept only so the dashboard typechecks standalone.
 */
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
