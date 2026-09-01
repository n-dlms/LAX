# ADR-008: Dashboard Template — Fork `thtauhid/terminal-portfolio`

**Number**: ADR-008
**Title**: Dashboard Template — Fork `thtauhid/terminal-portfolio`
**Date**: 2026-07-05
**Status**: Accepted
**Relates To**: P3-PLAN.md (S5), `research/prompts/2026-07-05-phase-3-S5-dashboard-template.md`, `docs/phase3/Terminal Dashboard Template Research.md`
**Supersedes**: Nothing

---

## Context

P3.S5 (Dashboard) requires a real-time terminal-themed UI that judges will watch for 3 minutes on a 1920x1080 projector. The dashboard must feel like a CLI — monospace font, dark background, green/amber indicators, text-priority layout.

Two paths: build from scratch (estimated 13 hours per research report) or adapt an existing terminal-themed React template.

The deep research report (`docs/phase3/Terminal Dashboard Template Research.md`) evaluated 5 candidates and recommended building from scratch, citing that all candidates required heavy modification. However, re-examination of the highest-rated candidate (`thtauhid/terminal-portfolio`, terminal score 8/10) reveals the research was overly pessimistic:

- Research claimed "last commit December 2023" — actual last commit is March 2025 (actively maintained)
- Research claimed `react-hook-form` as a dependency — not present in `package.json`
- The command-line simulator (the heaviest component) is a single file (`src/pages/Homepage.tsx`) that can be gutted entirely
- The underlying scaffold (Vite + TypeScript + React 18 + Tailwind + MIT license) matches every non-negotiable constraint from the research prompt

## Decision

LAX will fork `github.com/thtauhid/terminal-portfolio` into `dashboard/` as the starting point for P3.S5.

### What We Keep

- **Vite config** (`vite.config.ts`, `index.html`) — clean, already working
- **TypeScript scaffold** (`tsconfig.json`, `src/main.tsx`) — strict mode, ready
- **Terminal CSS globals** (`src/index.css`) — monospace font stack, cursor blink keyframes, dark background
- **`PromptBar.tsx` component** — the green input cursor/bar at the bottom, reusable for our log panel
- **Theme infrastructure** — multiple dark color schemes (matrix, ubuntu, arch) via `tw-colors`; we pin to "matrix" (black bg + neon green) and replace the palette with LAX's locked colors

### What We Strip

- `react-router-dom` — delete from `package.json`, delete `src/router/`, delete `src/pages/`, rewrite `App.tsx` to a state-based render (3-screen toggle, no routes)
- `queue-typescript` — delete from `package.json` (only used for command history in the simulator)
- `@vercel/analytics` — delete from `package.json` and `src/main.tsx`
- `src/api.ts`, `src/service-worker.ts`, `src/serviceWorkerRegistration.ts` — portfolio-specific, delete
- `src/pages/Homepage.tsx`, `src/pages/Profile.tsx` — the command simulator + profile page, delete
- `data.json`, `data/`, `src/commands.json` — static portfolio data, delete
- `src/assets/` — portfolio images, delete

### What We Replace (Our 3 Screens)

- `src/pages/` (after deletion) → replaced with 3 components: `MonitorView.tsx`, `MitigationView.tsx`, `AuditView.tsx`
- `App.tsx` → becomes a state machine with `type Screen = 'monitoring' | 'mitigating' | 'complete'`
- `src/hooks/` → add `usePositionPoller.ts` and `useExecutionPoller.ts` (custom polling hooks for Anvil fork RPC)

## Consequences

**Positive:**
- Saves ~4 hours of CSS setup (monospace stack, cursor animation, dark theme chrome, responsive breakpoints) that would be built from scratch
- The terminal-look is already proven by the template's demo site — no guesswork on whether "terminal aesthetic" works at 1920x1080
- MIT license means we can fork, modify, and close-source for the hackathon without restrictions
- No router to fight — the template's route layer is 2 pages and trivially removed

**Negative:**
- Tailwind v3 in the template — we must migrate to v4 (see ADR-009). Estimated 1 hour.
- `tw-colors` plugin (v3-only) — must be replaced with CSS `@theme` color definitions in v4. Estimated 30 minutes.
- Some terminal CSS classes may reference Tailwind v3 utility names that changed in v4. Risk of build failures during migration.
- The template was designed as a portfolio, not a real-time dashboard. The data flow architecture (static JSON → render) is the opposite of what we need (live RPC polling → render). Fortunately, data flow is entirely controlled by our custom hooks — the template only provides the visual shell.

**Mitigation for migration risk:** If Tailwind v3 → v4 migration proves unstable (build errors > 2 hours), we pin to Tailwind v3. The v3 → v4 class changes are cosmetic and won't affect our custom screens.

## Alternatives Considered

1. **Build from scratch** (Tailwind + custom CSS, no template). Estimated 13 hours. Rejected because the template saves 4+ hours on terminal chrome, and our bottleneck is time — we want the dashboard done and polished before the hackathon opens.

2. **`firasel/Terminal-Portfolio`** (Next.js 16, React 19, Tailwind v4, score 9/10). Rejected because Next.js Server Components require stripping the entire App Router, which is more work than building from scratch. The template's terminal styling is excellent but the framework migration cost outweighs the benefit.

3. **`fzed51/green-terminal`** (npm component library, score 8/10). Rejected because it's a component library, not a template — we'd still build all 3 screens and layout from scratch. The "keep what you use" advantage is negated by the need to create every structural component.

## Open Questions

- None. Template decision is settled. Migration details are in ADR-009.

## Checklist

- [x] Decision communicated
- [ ] README updated
- [ ] Implementation planned in current phase (P3.S5)
- [x] This ADR saved to `docs/adr/YYYY-MM-DD-adr-NNN-short-title.md`
