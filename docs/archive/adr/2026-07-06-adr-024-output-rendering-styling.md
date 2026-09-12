# ADR-024: Terminal Output Rendering & Styling

**Number**: ADR-024
**Title**: Terminal Output Rendering & Styling
**Date**: 2026-07-06
**Status**: Proposed
**Relates To**: ADR-020, ADR-017, ADR-022
**Supersedes**: Nothing

---

## Context

CLI command output must be rendered in both the inline mode (via Event Log) and the modal mode (via scrollback buffer). The styling must match the cinematic terminal aesthetic already established: green-on-black, monospace, compact.

---

## Decision

### Output Format

`CommandResult.output` is a plain string with `\n` line breaks. The renderer splits on `\n` and renders each line:

```tsx
{output.split("\n").map((line, i) => (
  <div key={i} className="text-xs leading-4 font-mono whitespace-pre-wrap">
    {line}
  </div>
))}
```

### Color Coding

- `output` → `text-green` (default green terminal text)
- `error` → `text-red` (error messages)
- Timestamps → `text-secondary` (dimmed gray)

### Cinematic Animations

Reuse existing animations from `index.css`:
- `animate-log-entry` (0.7s ease-out)
- `animate-fade-in` for modal overlay

### Scrollback Buffer

Modal scrollback stores entries in a `useRef<OutputEntry[]>`:

```typescript
interface OutputEntry {
  raw: string;
  output: CommandResult;
  timestamp: number;
}
```

Maximum 200 entries. Auto-scroll to bottom on new output.

### Font

- `font-mono` throughout
- `text-xs` for output lines
- `text-sm` for the input prompt line
- `leading-4` for compact spacing

---

## Consequences

**Positive:**
- Consistent styling with existing Event Log
- Reuses existing CSS animations
- Plain string output keeps backend simple

**Negative:**
- No rich text within output lines

**Mitigation:**
- Future support for ANSI-style escape codes

---

## Alternatives Considered

1. **Markdown output** — Rejected. Overkill for CLI output.
2. **React nodes as output** — Rejected. Couples backend to frontend.

---

## Checklist

- [ ] Decision communicated
- [ ] README updated (if applicable)
- [ ] Implementation planned in current phase
- [x] This ADR saved to `docs/adr/2026-07-06-adr-024-output-rendering-styling.md`