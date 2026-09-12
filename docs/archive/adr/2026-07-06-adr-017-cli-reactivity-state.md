# ADR-017: CLI Reactivity & State Integration

**Number**: ADR-017
**Title**: CLI Reactivity & State Integration — How Command Results Flow Back to UI
**Date**: 2026-07-06
**Status**: Proposed
**Relates To**: ADR-014, ADR-015, ADR-013, Mission.md
**Supersedes**: Nothing

---

## Context

When a CLI command executes, its results must update the dashboard UI in real time:
- **Event Log**: New log entries appear with animated entry
- **Agent Insights**: Health factor, position data, oracle price update
- **Liquidation Gauge**: HF bar re-renders
- **Terminal output**: Command output displayed in the modal/panel
- **State flags**: `autoTriggerBlockedRef`, guardian state, simulation mode toggle

Currently, state flows through React props and callbacks:
- `usePositionPoller` → `position` state → passed as props to child components
- `handleStressEvent` → mutates position, appends logs, updates oracle
- `autoTriggerBlockedRef` shared via `App.tsx` ref

The CLI backend is a separate module (`src/cli/`). It cannot directly call React state setters. We need a clean bridge.

---

## Decision

### 1. CLI Event Dispatcher (`src/cli/dispatcher.ts`)

A callback-based dispatcher that the CLI backend calls after each command execution. The UI component subscribes to it.

```typescript
// src/cli/dispatcher.ts
type CliEvent = {
  type: "log" | "position-update" | "oracle-update" | "guardian-toggle" | "error" | "clear";
  payload: unknown;
};

type CliEventListener = (event: CliEvent) => void;

class CliEventDispatcher {
  private listeners: Set<CliEventListener> = new Set();
  
  subscribe(fn: CliEventListener): () => void;
  dispatch(event: CliEvent): void;
}

export const cliDispatcher = new CliEventDispatcher();
```

### 2. CommandContext Integration

The `CommandContext` passed to every handler includes dispatch methods:

```typescript
interface CommandContext {
  // ... existing deps (rpc, position, config)
  
  // Dispatch methods
  emit: (event: CliEvent) => void;
  appendLog: (msg: string, level?: "info" | "warn" | "error") => void;
  refreshPosition: () => Promise<void>;
  setGuardianState: (state: Partial<GuardianState>) => void;
  setMockMode: (active: boolean) => void;
  clearLogs: () => void;
}
```

### 3. Subscription in MonitorView

`MonitorView.tsx` subscribes to `cliDispatcher` in a `useEffect`:

```typescript
useEffect(() => {
  const unsub = cliDispatcher.subscribe((event) => {
    switch (event.type) {
      case "log":
        setLogs(prev => [...prev, event.payload]);
        break;
      case "position-update":
        setPosition(event.payload);
        break;
      case "guardian-toggle":
        autoTriggerBlockedRef.current = event.payload.blocked;
        break;
      case "clear":
        setLogs([]);
        break;
    }
  });
  return unsub;
}, []);
```

### 4. Reactive Position Re-read

Commands that change position (repay, supply, shock) set `shouldUpdatePosition: true` in their `CommandResult`. The executor then calls `ctx.refreshPosition()` which fires a batch JSON-RPC call (`getUserAccountData`) and dispatches a `position-update` event.

### 5. Terminal State Persistence

The CLI backend also exposes synchronous state readers for the terminal autocomplete:

```typescript
// Non-reactive, for autocomplete suggestions
export const cliState = {
  commands: () => Object.keys(COMMANDS), // + aliases
  recentHistory: (n: number) => history.slice(-n),
  currentGuardianState: () => ({ ...guardianState }),
};
```

---

## Consequences

**Positive:**
- CLI backend stays pure and testable (no React imports)
- `MonitorView` is the single convergence point for all state flows
- Adding new reactive paths is a one-line dispatch call

**Negative:**
- Global singleton dispatcher (could cause memory leaks if not cleaned)
- Two-way sync risk: CLI dispatches → React re-renders → React re-renders CLI state

**Mitigation:**
- `cliDispatcher.subscribe` returns an unsubscribe function — always call in `useEffect` cleanup
- State flows one direction: CLI → Dispatcher → React
- CLI does NOT read React state directly; it reads `CommandContext` data that was injected at construction

---

## Alternatives Considered

1. **Direct React state passing into handlers** — Rejected. Creates circular dependency (React → CLI → React), untestable.
2. **Custom event bus (mitt, EventEmitter)** — Rejected. Adds dependency for 50 lines of code. Rule 5 forbids unnecessary deps.
3. **Redux/Zustand global store** — Rejected. Way overkill for this. Single purpose event dispatcher is sufficient.

---

## Open Questions

- **OPEN**: Should `refreshPosition()` debounce rapid calls? If user types `lax repay 1` then `lax repay 2` quickly, we don't want 2 RPC calls.
- **OPEN**: How does simulation mode visual indicator work — does CLI dispatch a `mock-mode` event that MonitorView renders as a banner?

---

## Checklist

- [ ] Decision communicated
- [ ] README updated (if applicable)
- [ ] Implementation planned in current phase
- [x] This ADR saved to `docs/adr/2026-07-06-adr-017-cli-reactivity-state.md`