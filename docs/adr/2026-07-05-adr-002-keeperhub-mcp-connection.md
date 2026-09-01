# ADR-002: KeeperHub MCP Connection — Remote HTTP + Bearer Auth + Per-Workflow Registration

**Number**: ADR-002
**Title**: KeeperHub MCP Connection — Remote HTTP + Bearer Auth + Per-Workflow Registration
**Date**: 2026-07-05
**Status**: Accepted
**Relates To**: MISSION.md, SCOPE.md, ADR-001
**Supersedes**: Nothing

---

## Context

LAX's agent must talk to KeeperHub via MCP. The MCP server supports two transports per `2026-07-05` fetched `https://docs.keeperhub.com/ai-tools/mcp-server`:
- **Aggregate server** at `https://app.keeperhub.com/mcp` — exposes ~46 tools including `list_workflows`, `execute_workflow`, `get_execution_logs`, `call_workflow(slug, inputs)` dispatcher. Multi-turn for workflow that's not in tool list.
- **Per-workflow server** at `https://app.keeperhub.com/mcp/w/<slug>` — exposes exactly one typed tool with the workflow's real input schema. Single-turn tool selection. Better for LLM tool-picking accuracy per `docs.keeperhub.com/ai-tools/mcp-server` "Per-Workflow MCP Servers" section.

Authentication: OAuth 2.1 (browser flow) OR `kh_` API key as Bearer header (`KeeperHub Cost Analysis.md:21-24` confirms remote MCP free to call).

Per the cost report (`KeeperHub Cost Analysis.md:30-35`), `list_workflows`, `validate_workflow`, and `get_execution_logs` are unmetered. Only `execute_workflow` consumes the org's monthly quota (5000/month post-beta; unlimited during beta).

## Decision

LAX will register **two MCP servers in `opencode.json`**:

1. **Aggregate `keeperhub`** at `https://app.keeperhub.com/mcp` — for workflow CRUD, search, audit-trail fetches (`get_execution_logs`), and AI workflow generation (`ai_generate_workflow`).
2. **Per-workflow `lax-liquidation-armor`** at `https://app.keeperhub.com/mcp/w/<slug>` — for runtime monitoring/repay/supply execution. Single-turn tool selection by the LLM.

Both use Bearer auth with the env-var injection pattern:

```json
{
  "mcp": {
    "keeperhub": {
      "type": "remote",
      "url": "https://app.keeperhub.com/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer {env:KEEPERHUB_API_KEY}"
      }
    },
    "lax-liquidation-armor": {
      "type": "remote",
      "url": "https://app.keeperhub.com/mcp/w/lax-liquidation-armor",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer {env:KEEPERHUB_API_KEY}"
      }
    }
  }
}
```

- The `KEEPERHUB_API_KEY` is sourced from the shell environment, never hardcoded.
- API key created in KeeperHub org at Settings → API Keys → Organisation tab per `https://docs.keeperhub.com/ai-tools/overview "Getting Your API Key"`. The `kh_` prefix is mandatory.
- `.gitignore` excludes `.env`, `opencode.json` (if local), and any file containing the raw key.
- Only `.env.example` is committed, listing `KEEPERHUB_API_KEY=` as a placeholder.

## Consequences

**Positive**
- Two surfaces used → "Use of KeeperHub surfaces" judging criterion gets credit for both aggregate + per-workflow MCP variants.
- Per-workflow MCP = single-turn → demo shows the agent picking LAX's tool directly without `search_workflows` round trip. This is the "integration quality and developer experience" judging criterion's strongest play.
- Env-var isolation: shipping the repo as-is cannot leak the key.
- Unmetered tools (`list_workflows`, `get_execution_logs`) we use in observability/dashboard portions of the demo do not consume quota.

**Negative**
- Two MCP server entries means duplicate Bearer headers in config. Acceptable — `opencode.json` is small.
- If the per-workflow slug is renamed in KeeperHub mid-build, the per-workflow MCP breaks. Mitigation: pin the slug as `lax-liquidation-armor` from day 1 and do not rename.
- Cross-org permissions: per-workflow MCP requires the workflow to be **listed** in marketplace (`docs.keeperhub.com/ai-tools/mcp-server` "Cross-organization calls" — any valid bearer can call any listed workflow). Listing our workflow publicly means competitors can call it. Acceptable since it's free to call from our own org anyway; we set price to 0 USDC.

## Alternatives Considered

### Alternative 1: Local `kh serve --mcp` stdio MCP
- Pros: stdio has lower latency than HTTP, no OAuth/Bearer.
- Cons: Deprecated per `https://docs.keeperhub.com/ai-tools/mcp-server` "Local via kh CLI (deprecated)". Will be removed.
- Rejected because: deprecated path will not survive hackathon judging scrutiny.

### Alternative 2: Aggregate MCP only (no per-workflow)
- Pros: One config block, simpler.
- Cons: LLM must do `list_workflows` → `call_workflow(slug, inputs)` two-step. Lower tool-selection accuracy per KeeperHub docs.
- Rejected because: we lose the per-workflow DX judging bonus, and Claude/NIM takes 2 turns for what should take 1.

### Alternative 3: OAuth browser flow instead of Bearer
- Pros: No API key to manage.
- Cons: Cannot run headless (CI, demo laptop without browser auth session).
- Rejected because: demo laptop reliability requirement.

## Open Questions — Resolved 2026-07-05

- **Workflow slug**: Self-assigned as `lax-liquidation-armor` when we create the workflow via `keepwork workflow create --slug lax-liquidation-armor`. KeeperHub does not auto-assign slugs for org-authored workflows — we control it. Per-workflow MCP URL becomes `https://app.keeperhub.com/mcp/w/lax-liquidation-armor`.
- **Two remote MCP servers in parallel**: OpenCode loads every `mcp.*` block in `opencode.json` at startup and surfaces all tool definitions to the LLM in a single tool palette. Two remote servers = two tool namespaces (`keeperhub_*` and `lax-liquidation-armor_*`). Confirmed by OpenCode MCP loader contract. Smoke test on Phase 3 day 1 will assert both tool namespaces appear in `list Workflows` round-trip.

## Checklist

- [x] Decision communicated
- [ ] README updated with install + auth steps
- [ ] Implementation planned for Phase 3 week 1
- [x] This ADR saved to `docs/adr/2026-07-05-adr-002-keeperhub-mcp-connection.md`
