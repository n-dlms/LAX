# ADR-025: CLI Polish — Error Display, Progress, Animations

**Number**: ADR-025
**Title**: CLI Polish — Error Display, Progress, Animations
**Date**: 2026-07-06
**Status**: Proposed
**Relates To**: ADR-019, ADR-024, ADR-020
**Supersedes**: Nothing

---

## Context

The CLI needs polish: clear error messages, visual progress during long commands, and smooth animations. Per the hackathon mission, the last 20% of time goes to polish.

---

## Decision

### Error Display

Errors render with visual distinction:

```
err lax repay: KeeperHub returned 401
   Check API key: run lax keeper
```

- Prefix marker in red text
- Error message in yellow/red
- Suggestion line indented below (gray text)
- No stack traces

Implemented in OutputRenderer: if result.error is set, render with text-red styling.

### Progress Indicator

Commands taking >500ms show a compact spinner:

```
lax@keeperhub ~ $ lax repay 480
  O Executing... (3.2s)
```

Implemented via setTimeout(500ms) to show spinner, setInterval(200ms) to cycle through spinner states. On completion, spinner replaced with checkmark and duration.

### Exit Code Display

Inline strip shows exit code after each command:
- checkmark + "42ms" for success (green)
- cross + "1.2s" for failure (red)
- Cleared when user starts typing next command

### Modal Scrollback

- New entries fade in with animate-log-entry
- Auto-scroll to bottom unless user has scrolled up
- Command blocks separated by CSS border-top line
- Scrollbar: thin, dark, hover-only visibility

### Theme Consistency

- Modal background: bg-black/95
- Text: text-green with text-secondary for dimmed elements
- Input caret: blink animation (existing)

---

## Consequences

**Positive:**
- Spinner makes CLI feel responsive during slow RPC calls
- Exit codes give immediate feedback
- Error display follows Rule 10

**Negative:**
- Spinner adds timer management complexity

**Mitigation:**
- Spinner logic extracted into useCommandStatus() hook

---

## Alternatives Considered

1. **Loading bar** — Rejected. Not terminal-authentic.
2. **No exit code** — Rejected. Every shell shows exit status.

---

## Checklist

- [ ] Decision communicated
- [ ] README updated (if applicable)
- [ ] Implementation planned in current phase
- [x] This ADR saved to docs/adr/2026-07-06-adr-025-cli-polish.md