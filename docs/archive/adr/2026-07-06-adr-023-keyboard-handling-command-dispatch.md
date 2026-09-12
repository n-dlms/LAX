# ADR-023: Keyboard Event Handling & Command Dispatch

**Number**: ADR-023
**Title**: Keyboard Event Handling & Command Dispatch
**Date**: 2026-07-06
**Status**: Proposed
**Relates To**: ADR-020, ADR-021, ADR-019
**Supersedes**: Nothing

---

## Context

The terminal input must handle a variety of key events: typing, navigation, autocomplete, special commands. Keyboard handling must work consistently in both inline and modal modes.

---

## Decision

### Key Map

| Key | Action | Edge Cases |
|-----|--------|------------|
| `Enter` | Execute command (call `execute()`) | Empty input → no-op. Execution debounced (500ms) |
| `ArrowUp` | History navigate up | Save current input to temp buffer |
| `ArrowDown` | History navigate down | Restore temp buffer when at newest |
| `Tab` | Autocomplete | Prevent default. Cycle suggestions on repeat Tab |
| `Escape` | Close modal (if modal) | Also blur input |
| `` ` `` | Toggle modal (global listener) | Only if not already typing in input |
| `Ctrl+L` | Clear terminal / logs | Dispatch `clear` event |
| `Ctrl+C` | Cancel (no-op, but don't copy) | Show "(interrupted)" if command running |
| `Backspace` | Delete char before cursor | Prevent navigation back in browser |
| All printable | Append to input string | Normal `keydown` → input update |

### Implementation: `useTerminalInput` Hook

```typescript
function useTerminalInput(options: {
  onExecute: (raw: string) => Promise<CommandResult>;
  history: { navigateUp, navigateDown, saveBuffer, restoreBuffer };
  autocomplete: (prefix: string) => string[];
  onToggleModal?: () => void;
}): {
  input: string;
  setInput: (s: string) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  suggestions: string[];
  selectedSuggestion: number;
};
```

### Global Key Listener

In `MonitorView.tsx`:

```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === "`" && document.activeElement?.tagName !== "INPUT") {
      e.preventDefault();
      setShowOverlay(prev => !prev);
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, []);
```

### Preventing Browser Defaults

- `e.preventDefault()` for Tab, ArrowUp/Down (to avoid scroll), Backtick, Ctrl+L
- Input element uses `type="text"` with `autoComplete="off"` and `spellCheck={false}`

---

## Consequences

**Positive:**
- Single hook handles all key logic — reusable across inline and modal
- Global listener only for backtick — minimal footprint
- Prevents browser's default Tab (focus change) and ArrowUp/Down (scroll)

**Negative:**
- `Ctrl+C` cannot actually cancel a running Promise — only a cosmetic interruption

**Mitigation:**
- Future enhancement: `AbortController` for long-running commands

---

## Alternatives Considered

1. **Inline event handlers on every component** — Rejected. Duplication between modes.
2. **Using `<textarea>` instead of `<input>`** — Rejected. Single-line input is simpler.

---

## Checklist

- [ ] Decision communicated
- [ ] README updated (if applicable)
- [ ] Implementation planned in current phase
- [x] This ADR saved to `docs/adr/2026-07-06-adr-023-keyboard-handling.md`