# ADR-016: KeeperHub CLI Workflow Strategy — Single Parameterized Workflow vs Many

**Number**: ADR-016
**Title**: KeeperHub CLI Workflow Strategy — Single Parameterized Workflow vs Many
**Date**: 2026-07-06
**Status**: Proposed
**Relates To**: ADR-002, ADR-005, ADR-015, SCOPE.md
**Supersedes**: Nothing

---

## Context

The CLI needs to support 10+ `onchain` commands (repay, supply, withdraw, approve, swap, rebalance, boost, paydown, transfer). Each of these must execute through KeeperHub as the onchain execution layer.

Current state:
- We have ONE KeeperHub workflow ID (`WORKFLOW_ID`) that does approve → repay → verify
- We POST to `/api/workflows/{WORKFLOW_ID}/run` with a JSON body containing params
- Execution status polling at `/api/workflows/executions/{id}/status` is session-only (401)

Open question: Do we create one workflow per command (10+ workflows) or one parameterized workflow that dispatches internally?

Research considerations:
- Can KeeperHub workflows accept arbitrary input parameters?
- Can a single workflow branch based on parameters?
- How many workflows can a free-tier account create?
- What's the workflow creation path — UI only or API too?
- Execution history/audit: do separate workflows give better traceability?

---

## Decision

### 1. Single "LAX Command Router" Workflow + Per-Operation Workflows

Adopt a hybrid approach:

**One LAX Router Workflow** (`lax-router`) that accepts a JSON payload:
```json
{
  "operation": "repay",
  "token": "USDC",
  "amount": "480000000",
  "borrower": "0x..."
}
```

The router workflow contains conditional steps:
- If `operation == "repay"` → call Aave Pool `repay()` via web3/write-contract
- If `operation == "supply"` → call Aave Pool `supply()` via web3/write-contract
- If `operation == "approve"` → call ERC-20 `approve()` via web3/write-contract
- etc.

**Plus individual "Named" Workflows** for the 4 most common demo operations:
- `lax-repay` (approve USDC → repay Aave → verify HF)
- `lax-supply` (approve token → supply Aave → verify)
- `lax-withdraw` (withdraw Aave → verify balance)
- `lax-price-shock` (mock oracle setPrice → verify HF change)

Named workflows are used for `lax repay`, `lax supply`, `lax withdraw`, `lax shock`. The router handles all other onchain commands.

### 2. CLI Routing to Workflows

```typescript
interface WorkflowMap {
  routerWorkflowId: string;   // "lax-router" — generic dispatch
  namedWorkflows: Record<string, string>;  // { repay: "lax-repay", shock: "lax-price-shock", ... }
}
```

- If a command has a dedicated workflow → use it (better audit trail, named executions)
- If no dedicated workflow → use `lax-router` with `operation` param
- The `lax-router` is also the fallback if a named workflow run fails

### 3. Workflow Parameterization

KeeperHub workflow steps receive workflow input variables. The router workflow defines an `operation` input and branches accordingly.

We need to test empirically:
- Does KeeperHub support conditional steps (if/else) based on input?
- Can we pass arrays or nested objects as workflow input?
- Are there limits on input payload size?

### 4. Execution ID Handling

The POST response returns `{ executionId, status }`. We store it:
- In memory for current command: `lastExecutionId`
- In a `Map<string, ExecutionRecord>` for `lax runs` / `lax run <id>`

Since status polling is session-only, we cannot get per-step results from KeeperHub. Instead:
- After triggering, fall back to local `eth_getTransactionReceipt` to verify
- Display local receipt as "verification" alongside KeeperHub execution ID

### 5. Execution Audit Trail

```typescript
interface ExecutionRecord {
  id: string;
  command: string;
  timestamp: number;
  workflowType: "router" | "named";
  status: "triggered" | "verified-onchain" | "failed";
  txHashes: string[];
  localReceipt?: TxReceipt;
}
```

Stored in memory during session. Displayed via `lax runs` and `lax run <id>`.

---

## Consequences

**Positive:**
- Router workflow covers all commands without creating 10+ workflows (workflow creation bottleneck avoided)
- Named workflows for demo-critical commands give clean audit trail
- Hybrid approach is pragmatic — named workflows for polished demo, router for completeness

**Negative:**
- Router workflow KeeperHub UI is complex (5+ conditional branches)
- If KeeperHub doesn't support conditional steps, router is unworkable
- Without status polling, execution detail is limited

**Mitigation:**
- Start with 1 named workflow (`lax-repay`) and the router. Add more named workflows as time permits.
- Local verification via `eth_getTransactionReceipt` fills the audit gap

---

## Alternatives Considered

1. **All named workflows (10+)** — Rejected. Workflow creation is UI-only (no API), too slow to maintain.
2. **Single router only** — Rejected. All executions would show the same workflow name in KeeperHub UI. Judges can't distinguish operations.
3. **No KeeperHub routing (local only)** — Rejected. Violates hackathon constraint.

---

## Open Questions

- **OPEN — requires empirical testing**: Does KeeperHub support conditional workflow steps?
- **OPEN**: What is the max workflow input payload size?
- **OPEN**: Can we create workflows via API or only via KeeperHub UI?

---

## Checklist

- [ ] Decision communicated
- [ ] README updated (if applicable)
- [ ] Implementation planned in current phase
- [x] This ADR saved to `docs/adr/2026-07-06-adr-016-keeperhub-cli-workflow-strategy.md`