# ADR-010: Dashboard Dependency Policy & LTC/SOL Tip Jar

**Number**: ADR-010
**Title**: Dashboard Dependency Policy & LTC/SOL Tip Jar
**Date**: 2026-07-05
**Status**: Accepted
**Relates To**: ADR-008 (template fork), ADR-009 (Tailwind v4), `dashboard/package.json`, P3-PLAN.md (S5)
**Supersedes**: Nothing

---

## Context

The dashboard inherits a set of dependencies from `thtauhid/terminal-portfolio`. Some must be removed (routing, analytics, command queue), some are kept (React, Vite, Tailwind), and a few must be added for LAX-specific features (QR code generation for sponsor tip jar).

LAX's overall dependency discipline (Rule 5 from AGENTS.md) applies: no new dependency without checking existing codebase for equivalent functionality, and documenting why the new dependency was chosen.

The research prompt specified "No Axios, No React Query, No SWR — native `fetch()` only" for data fetching. That constraint still holds — we use `fetch()` with `setInterval` for polling, not a fetching library.

## Decision

### Dashboard `package.json` — Final State

**Keep from template:**

| Dependency | Version | Reason |
|---|---|---|
| `react` | `^18.2.0` | Core UI framework. Plan to upgrade to 19.x during S5 if time permits |
| `react-dom` | `^18.2.0` | Core rendering |
| `@vitejs/plugin-react` | devDep | Vite React plugin (already on v4+) |
| `typescript` | devDep | Strict TypeScript |
| `vite` | devDep | Build tool (upgrade to 6.x during migration) |
| `@types/react`, `@types/react-dom` | devDep | Type bindings |
| `tailwindcss` | devDep | Migrate to v4 per ADR-009 |
| `@tailwindcss/vite` | devDep | Vite plugin for Tailwind v4 |
| `postcss` | devDep | Only if v3 fallback needed (remove on v4 success) |

**Remove from template:**

| Dependency | Size (KB) | Reason |
|---|---|---|
| `react-router-dom` | ~50 KB gzipped | No routing — single-page state machine |
| `queue-typescript` | ~3 KB | Only used for command history in the simulator |
| `@vercel/analytics` | ~5 KB | No analytics — not useful for a demo |
| `tw-colors` | ~2 KB | Replaced by CSS `@theme` per ADR-009 |
| `husky` (devDep) | — | Git hooks, irrelevant for a dashboard |
| `lint-staged` (devDep) | — | Same — template CI tooling |
| `prettier` (devDep) | — | Formatter, not needed for build |
| `eslint`, `eslint-*` (devDeps) | — | We use `tsc --noEmit` as our linter |

**Add for LAX:**

| Dependency | Size (KB) | Reason |
|---|---|---|
| `qrcode` | ~20 KB gzipped | Client-side QR generation for LTC/SOL tip jar. No installation, no DOM dependency. Pure JS canvas rendering. |
| `@types/qrcode` | devDep | Type bindings for QR code |

All other features use native browser APIs: `fetch()` for RPC polling, `setInterval` for timers, CSS transitions for animations, `import.meta.env` for config.

### QR Code Package Decision (`qrcode`)

**Why `qrcode` and not an alternative:**
- `qrcode.react` (24 KB): Requires React fiber integration, more surface area for version conflicts
- `qrcode.js` (30 KB): Heavier, older, unmaintained
- Inline SVG approach: We'd need to implement QR matrix math from scratch — error-prone and unnecessary
- Embedded image: Can't use static QR images because LTC/SOL addresses may change

**`qrcode`** is the lightest option, pure JS, no DOM dependency. Rendered via `<canvas>` element, 20 KB gzipped. MIT license.

### What We DO NOT Add

The following are explicitly excluded, per the research prompt constraints:
- **No React Router** — use state-based screen switching
- **No framer-motion / GSAP / react-spring** — CSS transitions only
- **No Recharts / Chart.js / D3** — HF bar is a CSS `<div>` with dynamic width
- **No React Query / SWR / Axios** — native `fetch()` + `setInterval` only
- **No Zustand / Jotai / Redux** — React `useState` + `useContext` only
- **No Radix UI / shadcn/ui** — no component library, all UI is styled Tailwind `<div>`s

## Consequences

**Positive:**
- Final `dashboard/package.json` has ≤ 8 production dependencies (React + React-DOM + qrcode), down from 13 in the template
- Bundle size target ≤ 200 KB gzipped (excluding React runtime)
- Every dependency has a documented reason for inclusion — no "we might need it later" cruft
- The QR tip jar is a judge-visible feature (hackathons love crypto donation footers) and costs only 20 KB

**Negative:**
- Without a component library, every UI element (button, card, input, table) is a custom `<div>` with Tailwind classes. This is more verbose but lighter and more controllable than importing `@radix-ui/react-card` + `@radix-ui/react-button`, etc.
- `qrcode` canvas rendering may have inconsistent appearance across browsers at 1920x1080 projector resolution. Mitigation: test with Chrome incognito on the demo laptop before each dry run.
- Without React Router, URL-based state (e.g., `?screen=audit`) is not available. Not needed for the demo — the state machine is driven by data events, not navigation.

## Alternatives Considered

1. **No QR code at all**: LTC/SOL addresses shown as plain text. Rejected because QR codes are visually interesting on a projector — judges can actually scan them. Plain addresses are not scannable and look like noise.

2. **Pre-generated QR images**: Static PNG files. Rejected because we may want to change addresses per demo session (e.g., different LTC wallet per run). Dynamic generation via `qrcode` package is more flexible.

3. **Remove ALL template dependencies and build from clean Vite scaffold**: Safer but loses 4 hours of terminal styling setup. Rejected per ADR-008 — the template's visual shell is worth keeping.

## Open Questions

- None. Dependency policy is locked until S6 if we discover missing functionality.

## Checklist

- [x] Decision communicated
- [ ] README updated
- [ ] Implementation planned in current phase (P3.S5)
- [x] This ADR saved to `docs/adr/YYYY-MM-DD-adr-NNN-short-title.md`
