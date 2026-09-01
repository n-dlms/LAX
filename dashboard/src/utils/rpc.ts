import { LAX_CONFIG } from "../types";

export async function rpcRequest<T>(method: string, params: unknown[], rpcUrl: string = LAX_CONFIG.FORK_RPC): Promise<T> {
  const resp = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  if (!resp.ok) {
    throw new Error(`RPC ${resp.status}: ${await resp.text()}`);
  }
  const json = (await resp.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  if (json.result == null) throw new Error(`RPC returned no result for ${method}`);
  return json.result;
}
