# ADR-014: CLI Backend Architecture — Command Registry, Parser, Executor

**Number**: ADR-014
**Title**: CLI Backend Architecture — Command Registry, Parser, Executor
**Date**: 2026-07-06
**Status**: Proposed
**Relates To**: MISSION.md, SCOPE.md, ADR-005, ADR-002
**Supersedes**: Nothing

---

## Context

The LAX dashboard needs an interactive terminal CLI (`lax <verb> <noun> [--flags] [args]`) with 50+ commands. The current codebase has no existing CLI infrastructure. Existing handlers (`handleStressEvent`, `handleExecuteClick`, `rpcRequest`, `usePositionPoller`) are embedded in React components. We need a reusable, testable backend layer that:

- Registers all commands with metadata (usage, description, category, permission)
- Parses user input into structured command calls
- Executes commands with proper error handling and return values
- Integrates with existing Aave/KeeperHub/RPC state
- Supports both read-only and state-changing commands

Per SCOPE.md, every feature must be demo-visible. The CLI backend must produce output that appears in the Event Log and updates Agent Insights in real time.

---

## Decision

### 1. Command Registry (`src/cli/registry.ts`)

A centralized, typed registry exported as `COMMANDS: Record<string, CommandDefinition>`.

```typescript
type CommandCategory = 
  | "monitor"      // read-only, RPC only
  | "mock"         // price manipulation, simulation
  | "guardian"     // autopilot control
  | "onchain"      // KeeperHub-routed transactions
  | "audit"        // KeeperHub execution history
  | "system";      // shell utilities

interface CommandDefinition {
  // Canonical name: "status", "shock", "guardian-on", "repay", "runs", "help"
  name: string;
  // Full syntax for help: "lax status" or "lax shock weth -50%"
  syntax: string;
  // One-line description
  description: string;
  // Category determines routing/permission
  category: CommandCategory;
  // Whether command changes onchain state
  mutatesState: boolean;
  // Handler returns output string (or Promise<string>)
  handler: (ctx: CommandContext, args: ParsedArgs) => Promise<CommandResult>;
  // Usage examples for `lax man <cmd>`
  examples?: string[];
  // Aliases: ["hf", "health-factor"]
  aliases?: string[];
}

interface ParsedArgs {
  positional: string[];      // ["weth", "-50%"]
  flags: Record<string, string>; // { "percent": "50" } from --percent=50
}

interface CommandResult {
  output: string;           // Human-readable output for terminal
  eventLogEntries?: string[]; // Entries to append to Event Log
  shouldUpdatePosition?: boolean; // Trigger position re-read
  shouldRefreshAudit?: boolean;   // Trigger audit fetch
  error?: string;           // If set, command failed (shown in red)
}
```

### 2. Parser (`src/cli/parser.ts`)

Tokenizes raw input string into `{ commandName, args }`.

- Splits on whitespace, respecting quoted strings
- Recognizes flags: `--flag value`, `--flag=value`, `-f value`, `-f=value`
- Boolean flags: `--dry-run` → `{ dryRun: "true" }`
- Returns structured `ParsedArgs` for handler consumption

### 3. Executor (`src/cli/executor.ts`)

Single entry point: `execute(rawInput: string): Promise<CommandResult>`

Flow:
1. Parse input → command name + args
2. Look up in registry (support aliases)
3. Validate required positional args
4. Build `CommandContext` with current state (position, config, RPC client, KeeperHub client)
5. Call handler
6. Return `CommandResult` for UI to render

### 4. Context (`src/cli/context.ts`)

`CommandContext` provides handlers access to:
- `rpc` — typed JSON-RPC client (re-uses existing `rpcRequest`)
- `position` — latest Aave position from `usePositionPoller`
- `config` — `LAX_CONFIG`
- `keeperhub` — KeeperHub API client (POST workflows)
- `eventLog` — append entries to Event Log
- `setGuardianState` — modify `autoTriggerBlockedRef`, threshold, target
- `mockOracle` — price manipulation functions

---

## Consequences

**Positive:**
- Commands are pure functions → unit-testable without React
- Registry is the single source of truth for `lax help` and autocomplete
- Categories enforce routing discipline (read vs write vs sim)
- Context injection allows mocking for tests
- New commands added in one place, immediately available everywhere

**Negative:**
- Adds ~6 new files before any UI work
- Handlers must be async — slightly more boilerplate than inline

**Mitigation:**
- Keep handlers thin; delegate to existing logic in `MonitorView`/`MitigationView`
- Extract shared logic into `src/cli/actions/` modules

---

## Alternatives Considered

1. **Inline handlers in React component** — Rejected. Couples CLI to UI, untestable, 50+ `if/else` branches.
2. **External CLI library (commander, yargs)** — Rejected. Browser-incompatible, heavy bundle, designed for Node process.argv not interactive terminal.
3. **Single monolithic handler with big switch** — Rejected. Violates single responsibility, hard to extend, poor type safety.

---

## Open Questions

- **OPEN**: Should `CommandContext` be a class with methods or plain object?
- **OPEN**: Where does the command history live — backend (executor) or frontend (terminal component)?
- **OPEN**: Do we need a `preExecute` hook for auth/validation before every command?

---

## Checklist

- [ ] Decision communicated
- [ ] README updated (if applicable)
- [ ] Implementation planned in current phase
- [x] This ADR saved to `docs/adr/2026-07-06-adr-014-cli-backend-architecture.md`