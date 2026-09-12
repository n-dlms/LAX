# ADR-019: CLI Error Handling & Security Boundaries

**Number**: ADR-019
**Title**: CLI Error Handling & Security Boundaries
**Date**: 2026-07-06
**Status**: Proposed
**Relates To**: ADR-014, ADR-015, RISK_REGISTER.md, AGENTS.md Rule 10
**Supersedes**: Nothing

---

## Context

The CLI must handle errors visibly (Rule 10: Explicit Error Handling) and prevent dangerous commands from causing damage. Specific risks:

- **User types a typo** → should show `lax: command not found` with suggestions
- **User types `lax repay` without amount** → missing arg error with usage hint
- **Anvil RPC down** → connection error, readable, not a stack trace
- **KeeperHub 401/403** → graceful fallback (per ADR-015) or clear message
- **User types `lax -rm -rf /`** (malicious input) → no shell injection risk (browser JS, not shell), but still validate
- **User types dangerous price manipulation** → confirmation prompt for state-changing commands?
- **Rapid repeated commands** → rate limiting / debounce?
- **`anvil_impersonateAccount` fails** → the fork may reject impersonation

---

## Decision

### 1. Error Shape

Every error follows a structured format:

```typescript
interface CliError {
  type: ErrorType;
  message: string;        // Human-readable, terminal-friendly
  suggestion?: string;    // "Did you mean: lax shock weth -50%?"
  command?: string;       // The input that caused the error
  details?: string;       // Technical detail (only shown in debug mode)
}

type ErrorType =
  | "command-not-found"
  | "missing-arg"
  | "invalid-flag"
  | "rpc-error"
  | "keeperhub-error"
  | "execution-failed"
  | "network-error"
  | "timeout"
  | "guardian-blocked"
  | "internal-error";
```

### 2. Display in Terminal

Errors render in the terminal with color:
- `⛔ lax: command not found: "repy". Did you mean "repay"?` (yellow/bold)
- `⛔ lax repay: missing required argument: <amount>. Usage: lax repay <amount> [--local]` (yellow)
- `⛔ RPC connection refused at http://127.0.0.1:18545. Run lax connect to test.` (red)
- `⛔ KeeperHub returned 401. Run lax keeper to check API key.` (red, with fallback info)

No stack traces. Ever. Debug details only shown if `lax debug` is on.

### 3. Autocomplete Suggestions

When `command-not-found`, compute Levenshtein distance against registered commands:

```
lax: command not found: "repy"
Did you mean:
  lax repay [amount]          — repay USDC debt via KeeperHub
  lax repay --local           — repay directly on fork
  lax reset                   — reset dashboard state
```

Run fuzzy match against all command names + aliases. Show top 3 suggestions.

### 4. Confirmation for Dangerous Commands

Commands that mutate state require a confirmation prompt:

```typescript
interface CommandDefinition {
  confirmRequired?: boolean; // true for repay, supply, withdraw, shock, guardian-off
}
```

When `confirmRequired`, the executor prints:
```
⚠️  lax repay 480 — this will repay 480 USDC on Aave V3
Type "yes" to confirm or Ctrl+C to cancel: _
```

After confirmation, command executes. The terminal component captures the "yes" input and passes it back.

### 5. Guardian Block

If `autoTriggerBlockedRef` is true, certain commands (guardian on, engage) are blocked:

```
⛔ lax guardian on: Guardian is locked. Auto-protection was previously triggered.
   Use `lax disarm` to unlock (manual protection only).
```

### 6. Rate Limiting

CLI commands are debounced at the executor level:

```typescript
const EXECUTION_DEBOUNCE_MS = 500; // Prevent rapid-fire commands
```

If a user types commands faster than 500ms apart, the execution is queued (not dropped). The terminal shows `... previous command still executing` and buffers.

### 7. Input Sanitization

- Input is parsed, NOT eval'd
- No shell execution (browser JS context — impossible to shell inject)
- Flag values are validated as strings only — no object/array injection
- Command names are matched against registry — any non-matching name = `command-not-found`

---

## Consequences

**Positive:**
- Every error is visible, readable, and actionable per Rule 10
- Fuzzy suggestions make the CLI feel polished (judge-visible)
- Confirmations prevent demo disasters (accidental large repay)
- Guardian block enforces the auto-trigger safety lock

**Negative:**
- Confirmation prompts add UX friction for power users
- Debounce may feel laggy during rapid typing

**Mitigation:**
- Confirmation only for state-changing commands (not `lax status`, `lax help`)
- Debounce only delays execution, not input capture — typing stays snappy

---

## Alternatives Considered

1. **No confirmation, just execute** — Rejected. Too risky during demo. One mis-type could mess up the position.
2. **Silent catch, return null** — Rejected. Violates Rule 10. All errors must be visible.
3. **Stack traces in terminal** — Rejected. Ugly, intimidating. Not a debug console.
4. **No fuzzy suggestions** — Rejected. This is a key UX differentiator for judges.

---

## Open Questions

- **OPEN**: Should `Ctrl+C` cancel the current executing command? (Complex — Promises can't be truly cancelled)
- **OPEN**: Should the terminal show a progress indicator during long commands (spinner)?

---

## Checklist

- [ ] Decision communicated
- [ ] README updated (if applicable)
- [ ] Implementation planned in current phase
- [x] This ADR saved to `docs/adr/2026-07-06-adr-019-cli-error-handling-security.md`