# ADR-022: Inline Terminal Strip vs Modal Overlay Layout

**Number**: ADR-022
**Title**: Inline Terminal Strip vs Modal Overlay Layout
**Date**: 2026-07-06
**Status**: Proposed
**Relates To**: ADR-020, ADR-017, ADR-015
**Supersedes**: Nothing

---

## Context

Per the user's earlier decision, the CLI terminal must support both an inline strip (always visible at the bottom) and a modal overlay (full-screen, toggled by backtick). These two modes coexist but only one is active at a time.

---

## Decision

### Inline Strip (Default)

- Replaces the current `PromptBar` at the bottom of `MonitorView.tsx`
- Single line, no scrollback
- Shows `lax@keeperhub ~ $ ▍` prompt + text input
- Output from CLI commands appears in the **Event Log** panel above (not in the strip)
- The strip also shows a status indicator: last command exit code (✓/✗) and duration

Layout:
```tsx
<div className="flex items-center text-sm border-t border-bordercol pt-4 mt-auto">
  <span className="text-green font-bold">lax@keeperhub</span>
  <span className="text-secondary"> ~ $ </span>
  <TerminalInput className="flex-1" />
  <span className="text-[10px] text-secondary ml-auto">{status}</span>
</div>
```

### Modal Overlay (Backtick)

- Press `` ` `` (backtick/grave) anywhere in the dashboard → opens full-screen terminal
- Full viewport, z-50, dark backdrop
- Has its own scrollback buffer showing all previous commands and their output
- The same `lax@keeperhub ~ $ ▍` prompt at the bottom
- Scrollable output area above the input line
- Press Escape or Backtick again → closes modal, returns to dashboard
- Dashboard state is unchanged (position still polls, logs accumulate)

Layout:
```tsx
{showOverlay && (
  <div className="fixed inset-0 z-50 bg-black/95 flex flex-col p-4">
    <div className="flex-1 overflow-y-auto font-mono text-sm text-green">...scrollback...</div>
    <div className="flex items-center border-t border-green/30 pt-2">
      <span className="text-green font-bold">lax@keeperhub</span>
      <span className="text-secondary"> ~ $ </span>
      <TerminalInput className="flex-1" />
    </div>
    <div className="text-[10px] text-secondary mt-1 text-center">ESC to close</div>
  </div>
)}
```

### Activation

- Backtick key listener is mounted in `MonitorView` (top-level `useEffect` with `keydown` event)
- Press once → open modal, focus input
- Press again (or Escape) → close modal, return focus to dashboard
- Inline strip is hidden when modal is open (add/remove a CSS class)

---

## Consequences

**Positive:**
- Both modes satisfy the user's earlier requirement
- Modal is immersive for demo walkthroughs
- Inline is always available for quick commands

**Negative:**
- Two separate DOM trees for the input (duplicate `TerminalInput`)
- Backtick key is stolen from the browser (prevents default)

**Mitigation:**
- `TerminalInput` component is the same, just rendered in different parents
- Backtick is not commonly used in web apps — low conflict risk

---

## Alternatives Considered

1. **Modal only** — Rejected. User explicitly asked for both.
2. **Inline only** — Rejected. Modal is needed for deep-dive demos.
3. **Slide-up panel** — Rejected. More complex animation, no UX benefit over modal.

---

## Checklist

- [ ] Decision communicated
- [ ] README updated (if applicable)
- [ ] Implementation planned in current phase
- [x] This ADR saved to `docs/adr/2026-07-06-adr-022-terminal-strip-modal.md`