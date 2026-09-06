// Sync-friendly preflight helper: performs ONE eth_call via JSON-RPC and prints
// a JSON result. Invoked with process.execPath by src/preflight-simulator.ts so
// the simulator stays synchronous without shelling out to Foundry's `cast`
// (Node itself is the only runtime dependency — V2 plan fix #10).
// Usage: node preflight-call.mjs '{"rpcUrl":"...","from":"0x..","to":"0x..","data":"0x.."}'

const spec = JSON.parse(process.argv[2] ?? "{}")

function fail(reason) {
  console.log(JSON.stringify({ ok: false, reason }))
  process.exit(0)
}

if (!/^https?:\/\/.+/.test(spec.rpcUrl ?? "")) fail("INVALID_RPC_URL")

let resp
try {
  resp = await fetch(spec.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ from: spec.from, to: spec.to, data: spec.data }, "latest"],
    }),
    signal: AbortSignal.timeout(spec.timeoutMs ?? 5000),
  })
} catch (err) {
  fail(`RPC_UNREACHABLE: ${String(err?.cause?.code ?? err?.message ?? err)}`)
}

if (!resp.ok) fail(`RPC_HTTP_${resp.status}`)

const json = await resp.json().catch(() => null)
if (!json) fail("RPC_BAD_RESPONSE")

if (json.error) {
  let reason = json.error.message ?? "EXECUTION_REVERTED"
  const data = typeof json.error.data === "string" ? json.error.data : ""
  if (data?.startsWith("0x08c379a0")) {
    // Error(string) — decode the ABI-encoded message:
    // selector(10) + offset word + string-length word + utf8 payload
    try {
      const offset = Number(BigInt(`0x${data.slice(10, 74)}`))
      const pos = 10 + offset * 2
      const len = Number(BigInt(`0x${data.slice(pos, pos + 64)}`))
      reason = Buffer.from(data.slice(pos + 64, pos + 64 + len * 2), "hex").toString("utf8")
    } catch {
      /* keep raw message */
    }
  }
  fail(reason)
}

console.log(JSON.stringify({ ok: true, result: json.result }))
