// Browser-safe JSON-RPC helpers shared by the CLI core.
// (node-context.ts holds the Node-only pieces: state persistence, webhook
// firing with the mitigation gate; keep those out of the browser graph.)
import { LAX_CONFIG } from "./lax-config";

interface RpcResponse {
  result?: string;
  error?: { message: string };
}

export async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const resp = await fetch(LAX_CONFIG.FORK_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    // A stalled endpoint must never hang the daemon loop
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`RPC ${resp.status} from ${LAX_CONFIG.FORK_RPC}`);
  const json = (await resp.json()) as RpcResponse;
  if (json.error) throw new Error(json.error.message);
  return json.result as T;
}

/** Fork blocks mine on a 1s interval (--block-time). After a state-changing tx,
 *  wait until a new block is visible on `latest` so subsequent reads are fresh. */
export async function waitNextBlock(beforeBlock: string, timeoutMs = 4000): Promise<void> {
  const before = BigInt(beforeBlock);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (BigInt(await rpc<string>("eth_blockNumber", [])) > before) return;
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}
