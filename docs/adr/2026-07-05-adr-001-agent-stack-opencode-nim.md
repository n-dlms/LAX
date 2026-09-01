# ADR-001: Agent Stack — OpenCode + NVIDIA NIM + Custom Safety Plugin

**Number**: ADR-001
**Title**: Agent Stack — OpenCode + NVIDIA NIM + Custom Safety Plugin
**Date**: 2026-07-05
**Status**: Accepted
**Relates To**: MISSION.md, SCOPE.md, AGENTS.md (Rule 5 — Dependency Discipline), `docs/phase0/OpenCode KeeperHub Compatibility Analysis.md`
**Supersedes**: Nothing

---

## Context

The hackathon requires an agent that talks to KeeperHub's MCP at `https://app.keeperhub.com/mcp` to execute workflows onchain. The default reference client is Claude Code, gated behind Anthropic Pro ($17/mo) / Max ($100/mo) / Team ($20/seat/mo) per `anthropic.com/pricing` fetched 2026-07-05. The LAX project operates under a hard $0 cost constraint (`docs/SCOPE.md`), so any agent requiring a paid subscription is disqualifying — unless we deviate with documented justification.

Beyond cost, the agent must satisfy three functional requirements pulled from the research reports:
1. Connect to remote HTTP MCP transports with Bearer auth (`OpenCode KeeperHub Compatibility Analysis.md:6-13`).
2. Auto-discover the KeeperHub wallet skill so the LLM knows about wallet tools (`OpenCode KeeperHub Compatibility Analysis.md:60-77`).
3. Provide a safety gate equivalent to Claude Code's `PreToolUse` hook so the agent cannot sign a malicious or overspend transaction (`OpenCode KeeperHub Compatibility Analysis.md:88-99`).

## Decision

LAX will run on **OpenCode + NVIDIA NIM** with a custom OpenCode plugin handling safety. No Claude Code dependency.

Specifically:
- **OpenCode** as the agent runtime (open-source CLI).
- **NVIDIA NIM** as the model inference backend (free model endpoint). NIM must support native tool-calling for MCP dispatch to work; verification of that's required during Phase 3 setup.
- **Custom OpenCode plugin** at `.opencode/plugins/keeperhub-safety-interceptor.ts` using `tool.execute.before` hook that reads `~/.keeperhub/safety.json` and throws on violations (per `OpenCode KeeperHub Compatibility Analysis.md:101-159`).
- **Configuration** at `opencode.json`/`opencode.jsonc` declares the KeeperHub MCP server with `"Authorization": "Bearer {env:KEEPERHUB_API_KEY}"` env-var injection — no hardcoded keys.

## Consequences

**Positive**
- $0 over the full build phase. No subscription. No credit card.
- Model-flexible: we can swap NIM models without re-architecting if tool-calling breaks or quality drops.
- OpenCode auto-discovers skills from `.claude/skills/`, `.opencode/skills/`, and `~/.agents/skills/`, so `@keeperhub/wallet skill install` works unmodified.
- Custom plugin = explicit safety gate that can be unit-tested in isolation and shown in the demo (judging criterion: "reliability and observability").

**Negative**
- One more file to maintain (the safety plugin).net cost ~1 day in week 1.
- NIM tool-calling is the single largest integration risk; if NIM returns malformed tool-call JSON, MCP dispatch fails. Mitigation: early smoke test (week 1, day 1) verifying `list_workflows` round-trip.
- OpenCode plugin API is subject to change across versions. We pin OpenCode version in `package.json` to avoid silent breakage.
- PreToolUse-equivalent only runs when the plugin is loaded. If someone runs the agent with `--no-plugins`, safety bypasses. Acceptable for a hackathon since the wallet itself has server-side hard limits (per `KeeperHub Wallet Technical Review.md` — Turnkey server enforces contract allowlist + 100 USDC/transfer cap + 200 USDC/day cap), but documented as a residual risk.

## Alternatives Considered

### Alternative 1: Claude Code with API key metering
- Pros: First-class `PreToolUse`, official KeeperHub plugin, best-in-class tool-calling.
- Cons: Anthropic Console API bills per token; hackathon build could cost $5–$20 depending on agent loops. Even though "free for our purposes" is plausible, it's not $0 guaranteed. Violates `docs/SCOPE.md` strict $0 budget.
- Rejected because: hard $0 budget constraint.

### Alternative 2: agentcash
- Pros: Free, plaintext wallet, no Turnkey dependency.
- Cons: Plaintext key on disk per `KeeperHub Wallet Technical Review.md:152-156`, "do not custody real funds" warning. PreToolUse hook not bundled. Loses any "integration quality" signal that the official wallet provides.
- Rejected because: weaker on judging criterion (use of KeeperHub surfaces — agentcash is third-party, not a KeeperHub-native integration).

### Alternative 3: Custom Python client + `mcp` SDK + Ollama
- Pros: Maximum control, no MCP client version drift.
- Cons: We'd reimplement skill discovery + safety hook + tool-call dispatch. Estimated 3-4 extra days. Violates `docs/MISSION.md` Principle 2 (simple beats clever).
- Rejected because: too much engineering for hackathon window.

## Open Questions — Resolved 2026-07-05

- **NIM model identifier**: `meta/llama-3.3-70b-instruct` via NVIDIA NIM. Chosen for strongest tool-calling record in the Llama 3.3 family and broad OpenAI-compatible endpoint surface. If tool-call JSON malfunctions, fallback to `nvidia/llama-3.1-nemotron-70b-instruct` (NVIDIA's flavor with extra function-call tuning).
- **OpenAI-compatible `tools` field**: NVIDIA NIM endpoints expose an OpenAI-compatible REST surface with native `tools` / `tool_choice` support per the NIM API docs. No shim needed. Smoke test on Phase 3 day 1 verifies round-trip with `list_workflows`.
- **Minimum OpenCode version**: Pin to the latest stable tag referenced in OpenCode's changelog at the time of Phase 3 kickoff. Concretely, we will pin to the version where `tool.execute.before` plugin hook is documented in the OpenCode plugin guide. Recorded in `package.json` at install time; we will not depend on a bleeding-edge commit.

## Checklist

- [x] Decision communicated (in this ADR)
- [ ] README updated with stack reference
- [ ] Implementation planned for Phase 3 week 1 (smoke test before building on top)
- [x] This ADR saved to `docs/adr/2026-07-05-agent-stack-opencode-nim.md`
