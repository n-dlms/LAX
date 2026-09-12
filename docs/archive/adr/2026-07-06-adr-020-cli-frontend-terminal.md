# ADR-020: CLI Frontend — Terminal Component Architecture

**Number**: ADR-020
**Title**: CLI Frontend — Terminal Component Architecture
**Date**: 2026-07-06
**Status**: Proposed
**Relates To**: ADR-014, ADR-017, ADR-019
**Supersedes**: Nothing

---

## Context

The CLI backend (`src/cli/`) is built and wired into `MonitorView.tsx`. The frontend needs an interactive terminal UI that replaces the static `PromptBar` component. Two modes are required per earlier decision: an inline terminal strip (always visible at bottom) and a modal overlay (toggled with a key such as backtick).

Current state:
- `PromptBar.tsx` shows `lax@keeperhub ~ $ ▍` as static text with a CSS blink cursor
- The terminal is rendered as a `<span>` — not interactive
- `cliDispatcher` and `setCommandContext` are already wired in `MonitorView`
- `execute()` from `src/cli/executor.ts` takes a raw string and returns `CommandResult`

We need a single `Terminal` component that supports both modes.

---

## Decision

### Architecture

```
Terminal (container)
├── TerminalInput (inline mode — replaces PromptBar)
├── TerminalOverlay (modal mode — full screen)
└── OutputRenderer (shared — renders CommandResult)
```

- `Terminal` receives an `onExecute` callback prop (or uses `execute` directly)
- `TerminalInput` handles keydown, autocomplete, history, and rendering the current input line
- `TerminalOverlay` wraps `TerminalInput` in a full-screen modal with scrollback
- `OutputRenderer` formats `CommandResult.output` and `CommandResult.error` into styled terminal output

### Input Model

```typescript
interface TerminalState {
  input: string;           // current line being typed
  cursorPos: number;       // cursor position within input
  historyIndex: number;    // current position in history (for ↑↓)
  mode: "inline" | "modal";
  visible: boolean;        // for modal toggle
}
```

State managed with `useRef` (not `useState` — to avoid re-render on every keystroke). A `forceUpdate` counter triggers re-render only when needed.

### Key Handler

A single `handleKeyDown(e: React.KeyboardEvent)` in `TerminalInput`:
- `Enter` → call `execute(input)`, clear input, append output to log/terminal
- `ArrowUp/Down` → navigate history
- `Tab` → autocomplete
- `Escape` → close modal (if modal mode)
- `Backtick` → global key listener in `MonitorView` toggles modal
- `Ctrl+L` → clear
- All other keys → update input string

### Component Tree

```tsx
// In MonitorView.tsx
<Terminal
  mode="inline"
  onExecute={(raw) => execute(raw)}
/>
<TerminalOverlay
  visible={showOverlay}
  onExecute={(raw) => execute(raw)}
  onClose={() => setShowOverlay(false)}
/>
```

---

## Consequences

**Positive:**
- Single component handles both modes with shared logic
- `useRef`-based state avoids React re-render overhead on every keystroke
- Keyboard handling centralized, not scattered across handlers

**Negative:**
- `useRef` pattern requires explicit `forceUpdate` — more boilerplate than `useState`
- Two `Terminal` instances mean duplicated DOM when both visible

**Mitigation:**
- Extract shared input logic into a `useTerminalInput()` hook that both modes reuse
- Modal and inline never need to be visible simultaneously — modal closes inline

---

## Alternatives Considered

1. **xterm.js integration** — Rejected. Adds 100+ KB for full terminal emulator when we only need a styled input line. Rule 5 (Dependency Discipline) prohibits.
2. **Single component, CSS-switch modes** — Rejected. Inline and modal have very different DOM structures (one-line vs full-screen scrollback).
3. **No terminal, static buttons only** — Rejected. 50+ commands cannot be exposed as buttons. CLI is the differentiator.

---

## Open Questions

- **OPEN**: Should `Terminal` accept a ref to expose `execute()` for parent callers?
- **OPEN**: Does the modal need its own output scrollback separate from the Event Log?

---

## Checklist

- [ ] Decision communicated
- [ ] README updated (if applicable)
- [ ] Implementation planned in current phase
- [x] This ADR saved to `docs/adr/2026-07-06-adr-020-cli-frontend-terminal.md`