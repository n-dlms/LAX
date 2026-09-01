# ADR-009: Tailwind v3 → v4 Migration Strategy (CSS `@theme` Replaces `tw-colors`)

**Number**: ADR-009
**Title**: Tailwind v3 → v4 Migration Strategy
**Date**: 2026-07-05
**Status**: Accepted
**Relates To**: ADR-008 (template fork), `dashboard/package.json` (currently Tailwind v3.3.3), P3-PLAN.md (S5)
**Supersedes**: Nothing

---

## Context

`thtauhid/terminal-portfolio` (the forked dashboard base from ADR-008) ships with Tailwind CSS v3.3.3 and the `tw-colors` plugin for multi-theme support. The rest of LAX's codebase does not use Tailwind — the `package.json` at the LAX root is a CLI tool, not a frontend project. The dashboard will have its own `dashboard/package.json`.

Tailwind v4 (released early 2025) changes the configuration model:
- **v3**: `tailwind.config.js` with `theme.extend`, plugins via `require('tw-colors')`
- **v4**: CSS-driven configuration via `@import "tailwindcss"` and `@theme {}` block. No `tailwind.config.js`. No plugin-based theming.

`tw-colors` is a v3 plugin that generates color utility classes from a theme object at build time. It does not work with v4's CSS-first approach. Multi-theme switching (matrix/ubuntu/arch) was useful for a portfolio but unnecessary for LAX — we need exactly one theme: our locked 10-color palette from the research prompt.

## Decision

Migrate `dashboard/` from Tailwind v3 (with `tw-colors`) to Tailwind v4 (with CSS `@theme`).

### Migration Steps

1. **Update `tailwindcss` in `dashboard/package.json`**: `^3.3.3` → `^4.0.0`
2. **Install v4 Vite plugin**: `npm install @tailwindcss/vite` (v4 requires this instead of postcss plugin)
3. **Add plugin to `vite.config.ts`**:
   ```ts
   import tailwindcss from '@tailwindcss/vite'
   export default defineConfig({
     plugins: [react(), tailwindcss()],
   })
   ```
4. **Remove `tailwind.config.js` and `postcss.config.js`** — configuration is now in CSS
5. **Replace `src/index.css`** content:
   - v3: `@tailwind base; @tailwind components; @tailwind utilities;`
   - v4: `@import "tailwindcss";`
6. **Define colors in CSS via `@theme`** (replaces `tw-colors` theme object):
   ```css
   @import "tailwindcss";

   @theme {
     --color-bgcol: #0a0a0a;
     --color-surface: #1a1a1a;
     --color-border: #2a2a2a;
     --color-primary: #e0e0e0;
     --color-secondary: #808080;
     --color-green: #22c55e;
     --color-yellow: #eab308;
     --color-orange: #f97316;
     --color-red: #ef4444;
     --color-amber: #ffb000;
     --color-cyan: #06b6d4;
   }
   ```
7. **Replace `tw-colors` class references** across all components:
   - `bg-bgcol` → `bg-bgcol` (name preserved via `@theme`)
   - `text-shebang` → `text-green` (forced green accent)
   - `text-command` → `text-primary` (white text)
   - Remove dynamic `data-theme` switching logic — pin to matrix-like theme

8. **Update `vite.config.ts`**: Remove postcss plugin, add `@tailwindcss/vite`

### Class Name Mapping (Old → New)

| v3 + tw-colors | v4 @theme | Notes |
|---|---|---|
| `bg-bgcol` | `bg-bgcol` | Same name, works |
| `text-shebang` | `text-green` | "shebang" is green in matrix theme |
| `text-symbol` | `text-cyan` | "symbol" is blue in ubuntu, we use cyan |
| `text-command` | `text-primary` | "command" is white |
| `bg-ubuntu`, `bg-arch` | removed | No multi-theme |

## Consequences

**Positive:**
- Eliminates the `tw-colors` plugin dependency (one fewer package to audit)
- Vite 6 + Tailwind v4 is the modern stack — better build performance, smaller CSS output
- CSS-driven theme is more transparent — colors are visible in one file, not hidden in `tailwind.config.js`
- Our locked 10-color palette maps cleanly to `@theme` variables

**Negative:**
- Class name changes may cause build errors until all tw-colors references are replaced. Mitigation: `tsc --noEmit` pre-build check catches all invalid class names.
- Some v3 utility classes behave differently in v4 (e.g., `shadow`, `ring`, `outline`). Mitigation: We don't use shadows, rings, or outlines in the terminal aesthetic.
- Risk: if migration takes >2 hours, we pause and pin to v3. The tradeoff (v3 vs v4) is invisible to the judge.

## Alternatives Considered

1. **Pin to Tailwind v3 + keep `tw-colors`**: Safer, but we inherit an unmaintained plugin (`tw-colors` last updated 2023) and miss v4's smaller CSS output. Rejected because the migration risk is low (our CSS surface is small).

2. **Inline CSS variables (no Tailwind)**: We'd lose the utility-first workflow that makes Tailwind fast for UI iteration. Rejected — Tailwind's responsive breakpoints (`lg:`, `xl:`) are essential for projector tuning.

## Open Questions

- None. Migration plan is straightforward. Execute it during S5 build, before writing custom screen components.

## Checklist

- [x] Decision communicated
- [ ] README updated
- [ ] Implementation planned in current phase (P3.S5)
- [x] This ADR saved to `docs/adr/YYYY-MM-DD-adr-NNN-short-title.md`
