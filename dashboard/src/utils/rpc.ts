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
  // Anvil helper methods (impersonateAccount, stopImpersonatingAccount, …)
  // return `result: null` on success by convention — only treat null as an
  // error for calls that must return data (eth_call, eth_sendTransaction, …).
  if (json.result == null && !method.startsWith("anvil_") && !method.startsWith("evm_")) {
    throw new Error(`RPC returned no result for ${method}`);
  }
  return json.result as T;
}
