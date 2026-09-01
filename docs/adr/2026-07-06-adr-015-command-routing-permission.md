# ADR-015: Command Routing & Permission Model

**Number**: ADR-015
**Title**: CLI Command Routing & Permission Model
**Date**: 2026-07-06
**Status**: Proposed
**Relates To**: ADR-014, ADR-002, ADR-005, SCOPE.md
**Supersedes**: Nothing

---

## Context

The CLI backend must route commands to the correct execution channel based on what the command does. Three execution channels exist:

1. **Anvil JSON-RPC (direct)** — `eth_call`, `eth_sendTransaction`, `anvil_impersonateAccount` for fork ops
2. **KeeperHub REST API** — `POST /api/workflows/{id}/run` for workflow-triggered onchain actions
3. **KeeperHub MCP** — Tool calls via `/mcp` aggregate server for read/write contract ops

Additionally, the hackathon owner's constraint: "everything must use KeeperHub as its onchain execution layer." This means state-changing commands must route through KeeperHub. Read-only commands may hit Anvil directly.

We need a clear permission/routing model that:
- Prevents accidentally executing write commands directly on Anvil (bypassing KeeperHub)
- Makes the routing decision explicit in each command definition
- Supports fallback (KeeperHub down → local Anvil execution as backup)
- Is transparent to the user (terminal shows where the command executed)

---

## Decision

### 1. Command Routing Tier

Every `CommandDefinition` gets a `routing: RoutingTier` field:

```typescript
type RoutingTier =
  | "rpc-read"      // eth_call / JSON-RPC reads — no KeeperHub needed
  | "rpc-write"     // eth_sendTransaction / anvil_* — direct fork writes
  | "keeperhub-workflow" // POST /api/workflows/{id}/run — KeeperHub-managed
  | "keeperhub-mcp"     // MCP tool call for contract operations
  | "local-only"        // Pure UI state changes (guardian on/off, theme)
  | "simulation";       // Price shock, mock — affects fork state, marked SIM
```

### 2. Category → Default Routing Map

| Category | Default Routing | Description |
|----------|----------------|-------------|
| monitor | `rpc-read` | Reads HF, position, block, oracle |
| mock | `simulation` | Price manipulation via oracle RPC |
| guardian | `local-only` | Toggles refs, state — no chain interaction |
| onchain | `keeperhub-workflow` | Repay, supply, withdraw → KeeperHub |
| audit | `rpc-read` | Reads tx receipts, execution logs |
| system | `local-only` | Help, version, clear, theme |

### 3. Fallback Chain

```typescript
type FallbackStrategy = "no-fallback" | "keepers-fail-local" | "local-fail-keepers";

interface CommandDefinition {
  routing: RoutingTier;
  fallback?: {
    strategy: FallbackStrategy;
    altRouting: RoutingTier;
  };
}
```

- `onchain` commands default to `keeperhub-workflow` with fallback `keepers-fail-local` (if KeeperHub 4xx/5xx, fall back to `rpc-write` via `anvil_impersonateAccount`)
- `simulation` commands are `rpc-write` with no fallback (KeeperHub doesn't know about local oracle)
- `monitor` commands are `rpc-read` with fallback to cached position (offline mode)

### 4. Transparency

Each command output must show where it executed:
```
lax repay 480
→ Routing via KeeperHub workflow (ID: wx-abc-123)
→ Execution ID: exec-xyz-789
→ Tx hash: 0x...
```

```
lax repay 480 --local
→ Routing via local Anvil fork (impersonated: 0xfA8f...)
→ Tx hash: 0x...
```

A `--local` flag overrides routing to `rpc-write` for any `onchain` command (used for testing/debugging).

### 5. Validation Before Execution

The executor checks before calling handler:
- Is the command's routing tier available? (RPC connection alive? KeeperHub API key present?)
- If required tier is down and no fallback, return early error
- If `--dry-run` flag set, print what WOULD happen without executing

---

## Consequences

**Positive:**
- Clear compile-time routing decisions per command
- Fallback prevents demo failures when KeeperHub is down
- `--local` flag enables side-by-side comparison for demos ("see, KeeperHub produces the same result")
- `--dry-run` makes commands safe to explore during demo

**Negative:**
- More fields per command definition (boilerplate)
- Fallback logic adds complexity to executor

**Mitigation:**
- Default fallback strategy is `no-fallback` — only opt in where needed
- Fallback routing exposed in `lax help output`

---

## Alternatives Considered

1. **Single routing (all commands through KeeperHub)** — Rejected. Read-only ops (HF polling, block number) would create unnecessary KeeperHub workflow executions, burning rate limits and adding latency.
2. **No routing, all inline handlers decide** — Rejected. Violates separation of concerns, routing logic duplicated across 50+ commands.
3. **Only RPC (bypass KeeperHub entirely)** — Rejected. Violates hackathon "must use KeeperHub" rule.

---

## Open Questions

- **OPEN**: Should `--local` be a CLI flag or a config toggle (`lax config local-execution on`)?
- **OPEN**: When KeeperHub falls back to local, should the terminal show a warning?
- **OPEN**: Does KeeperHub MCP require a different auth header than REST API?

---

## Checklist

- [ ] Decision communicated
- [ ] README updated (if applicable)
- [ ] Implementation planned in current phase
- [x] This ADR saved to `docs/adr/2026-07-06-adr-015-command-routing-permission.md`