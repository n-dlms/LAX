# ADR-021: Autocomplete & History Navigation UX

**Number**: ADR-021
**Title**: Autocomplete & History Navigation UX
**Date**: 2026-07-06
**Status**: Proposed
**Relates To**: ADR-020, ADR-018, ADR-019
**Supersedes**: Nothing

---

## Context

The CLI backend provides `getAutocompleteSuggestions(prefix)` and `navigateHistory(direction)`. The frontend needs to invoke these on user keypresses and display the results inline without obscuring the terminal input.

---

## Decision

### Autocomplete (Tab)

1. User types `lax rep` and presses Tab
2. `TerminalInput` intercepts Tab (`e.preventDefault()`)
3. Calls `getAutocompleteSuggestions("rep")` from registry
4. If exactly 1 suggestion → complete the input: `lax repay`
5. If multiple suggestions → show a dropdown list below the input line
6. Press Tab again → cycle through suggestions
7. Press Enter or continue typing → dropdown disappears

The dropdown renders as an absolutely positioned `<div>` below the prompt with monospace text and the same green-on-black styling.

### History Navigation (↑↓)

1. ArrowUp → calls `navigateHistory("up")` → replaces current input with historical command
2. ArrowDown → calls `navigateHistory("down")` → restores newer command or clears to empty
3. The current in-progress input (before pressing ↑) is saved to a temporary buffer so ↓ can restore it
4. History index resets to end after `Enter` is pressed

### Fuzzy Suggestions on Error

When a command fails with `command-not-found`, run `fuzzyFind` and display suggestions inline in the output, not as a dropdown:

```
lax: command not found: "repy"
Did you mean:
  lax repay [amount]          — repay USDC debt via KeeperHub
  lax reset                   — reset dashboard state
```

This is handled by the executor `handleCommandNotFound`, not by the frontend.

### Display

- Autocomplete dropdown: `z-50`, positioned above the input line
- Suggestion items: clickable (optional, nice-to-have)
- Max 8 suggestions shown at once

---

## Consequences

**Positive:**
- Tab autocomplete feels professional (judge-visible)
- History navigation is familiar shell behavior
- Fuzzy suggestions reduce frustration

**Negative:**
- Autocomplete dropdown can overlap with Event Log if positioned poorly

**Mitigation:**
- Dropdown positioned above the input (negative top), not below

---

## Alternatives Considered

1. **Inline completion (ghost text)** — Rejected. Harder to implement, less discoverable than dropdown.
2. **No autocomplete** — Rejected. 70 commands are too many to memorize.

---

## Checklist

- [ ] Decision communicated
- [ ] README updated (if applicable)
- [ ] Implementation planned in current phase
- [x] This ADR saved to `docs/adr/2026-07-06-adr-021-autocomplete-history.md`