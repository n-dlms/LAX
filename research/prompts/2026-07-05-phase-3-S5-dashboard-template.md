# Deep Research: Terminal-Themed React Dashboard Template for LAX (Liquidation Autopilot)

## Executive Summary

We are building a **real-time proactive liquidation defense dashboard** for an Aave V3 position on Base mainnet. The system monitors a borrower's health factor (HF) via a local Anvil fork, triggers a KeeperHub workflow when HF ≤ 1.05, executes an automatic USDC repay to restore HF to 1.10, and displays the entire flow on a dashboard that judges will watch for 3 minutes during a hackathon pitch.

The dashboard must have a **terminal/CLI aesthetic** — monospace font, dark background, green/amber cursor-like indicators, minimal chrome, text-priority. Think `htop` meets `glances` meets a Bloomberg terminal but for DeFi. The live demo runs on a projector at 1920x1080 — every pixel must be readable from 10 feet away.

**We need you to find 3-5 open-source React dashboard templates that we can fork and adapt. We do not want to build from scratch.**

---

## 1. Project Context

### What is LAX?

LAX (Keep Your Position Safe) is a proactive Aave V3 liquidation defender. It:
1. Polls `getUserAccountData()` on an Anvil fork of Base mainnet every 2 seconds
2. When health factor drops to ≤ 1.05, it fires a webhook to KeeperHub
3. KeeperHub executes a 5-node workflow: read HF → approve USDC → repay Aave debt → verify HF recovery
4. A dashboard displays the entire flow to the hackathon judge in real-time

### Target Audience
- **Primary**: Hackathon judges (3-5 technical people watching a projector at 1920x1080)
- **Secondary**: Demo operators (us, running the demo)
- **Tertiary**: Open-source community (if we open-source after the hackathon)

### Demo Flow (The 8 Beats)
The dashboard must support these 8 beats in sequence:
1. **Setup complete**: Dashboard shows wallet connected, fork running, workflow deployed — all green checkmarks
2. **HF monitoring**: Horizontal bar shows HF=1.20 (green), collateral=$165, debt=$480
3. **Market drop**: Judge sees WETH price drop -25% in real-time, HF bar shrinks, turns yellow then red
4. **Alert triggers**: Screen slides in showing "⚠ TRIGGERED at HF=1.04"
5. **Mitigation steps animate**: Approve → Repay → Verify, each step transitioning from pending→running→success with tx hashes
6. **HF restored**: Final HF shown as 1.10+, bar turns green again, total time and gas cost displayed
7. **Audit trail**: Clickable link to KeeperHub execution page — judge clicks and sees the real audit trail
8. **Recovery summary**: Total mitigation time (seconds), total gas cost (USD cents), retry count

### Demo Environment
- **Hardware**: Laptop running Ubuntu, connected to projector (HDMI)
- **Resolution**: 1920x1080 minimum, potentially scaled to 2560x1440
- **Network**: WiFi at hackathon venue (unreliable — must work offline for core flow)
- **Browser**: Chrome 120+ (incognito mode — no extensions interfering)
- **Audio**: None — dashboard is visual only

---

## 2. Technical Requirements

### Non-Negotiable Constraints

| Constraint | Value | Reason |
|---|---|---|
| **React version** | 18.x or 19.x | Must be compatible with latest ecosystem |
| **TypeScript** | 5.x required | Whole project is Strict TypeScript — no JavaScript files |
| **Build tool** | Vite 6+ | Must use Vite, NOT Create React App, NOT Next.js, NOT Remix, NOT Gatsby |
| **CSS framework** | Tailwind CSS 4+ | Already used in project — no plain CSS, no styled-components, no CSS modules, no Emotion |
| **Bundle size** | ≤ 500 KB gzipped | Projector demo — must load instantly even on slow venue WiFi |
| **Router** | NONE | Single page, 3 screens toggled by state — no React Router, no Reach Router, no wouter |
| **State management** | NONE | React context + custom hooks only — no Redux, no Zustand, no Jotai, no Recoil |
| **License** | MIT or Apache 2.0 ONLY | No GPL, AGPL, MPL, BSD-3-Clause — this is a closed-source hackathon project |
| **Animation libs** | NONE | No framer-motion, no GSAP, no react-spring, no auto-animate — CSS transitions only |
| **Chart lib** | NONE required | HF bar is a simple horizontal `<div>` with CSS width transition — no Recharts, no Chart.js, no D3 |
| **Data fetching** | Native `fetch()` + `setInterval` | No Apollo, no React Query, no SWR, no Axios — keep it dependency-free |
| **Node version** | 20 LTS | CI runs on Node 20 |
| **Package manager** | npm | Not pnpm, not yarn — root project uses npm |
| **Theme** | Dark mode ONLY | No light mode toggle — wastes code and adds complexity |
| **Font** | Monospace ONLY | System font stack: `ui-monospace, 'SF Mono', 'Fira Code', 'Cascadia Code', 'Source Code Pro', monospace` |
| **Reading distance** | 10 feet (3 meters) | Minimum font size 16px, ideally 18-20px for body text, 24-32px for HF value |
| **Accessibility** | WCAG 2.1 AA | Color contrast ≥ 4.5:1. Green (#22c55e) on dark bg (#0a0a0a) = 5.8:1 ✓ |
| **Offline** | Must work without internet | All data from local Anvil fork (localhost:18545) — no CDN dependencies |
| **Dependencies** | Minimize | `npm ls --prod` should show ≤ 5 top-level deps (react, react-dom, @types/react, @types/react-dom, vite, tailwindcss) |

### Color Palette (Locked)

```
Background:       #0a0a0a (near-black)
Surface:          #1a1a1a (card backgrounds)
Border:           #2a2a2a (subtle dividers)
Text primary:     #e0e0e0 (body text)
Text secondary:   #808080 (labels, metadata)
Green (safe):     #22c55e (HF ≥ 1.10)
Yellow (watch):   #eab308 (HF 1.05-1.10)
Orange (danger):  #f97316 (HF 1.00-1.05)
Red (critical):   #ef4444 (HF < 1.00)
Amber accent:     #ffb000 (cursor, selection, active elements)
Cyan accent:      #06b6d4 (links, interactive elements)
```

### Layout Constraints
- **Single column vertical layout** (3 screens stacked, scroll or state-toggle)
- **No sidebar navigation** — all 3 screens visible in order
- **No header bar** with profile/avatar/settings — the only header is "LAX — Keep Your Position Safe"
- **No footer** except a small tip jar row with LTC and SOL QR codes
- **Full viewport height** — no body scroll on the main monitoring screen
- **Center-aligned** content column, max-width 1200px, centered on 1920x1080

### Screen 1: Monitoring Dashboard (Beats 1-3)
```
┌──────────────────────────────────────────────────────────────┐
│  LAX — Keep Your Position Safe        ❖ Heartbeat: 2s      │
│  ──────────────────────────────────────────────────────────── │
│                                                               │
│  ┌────────────────────┐  ┌──────────────┐  ┌────────────────┐│
│  │ Health Factor      │  │ Collateral   │  │ Debt           ││
│  │ 1.20               │  │ $165.00 WETH │  │ $480.00 USDC   ││
│  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░ │  └──────────────┘  └────────────────┘│
│  │ 1.00        1.50   │                                       │
│  │ ✓ Healthy          │                                       │
│  └────────────────────┘                                       │
│                                                               │
│  Setup: ✓ Wallet ✓ Fork ✓ Oracle ✓ Workflow ✓ Listener       │
│                                                               │
│  [Log] 12:00:01 IDLE    HF=1.20                               │
│  [Log] 12:00:03 IDLE    HF=1.20                               │
│  [Log] 12:00:05 IDLE    HF=1.20                               │
└──────────────────────────────────────────────────────────────┘
```

Required behavior:
- HF bar is a horizontal bar, height ~40px, width = `((HF - 1.0) / 0.5) * 100%` of container
- Bar background is the 4-color gradient (red→orange→yellow→green) visible as the unfilled portion
- Color of the filled portion changes: green ≥ 1.10, yellow 1.05-1.10, orange 1.00-1.05, red < 1.00
- HF value in large monospace digits (48px font minimum)
- Setup checklist: 5 items, each with ✓/✗ status
- Scrollable log panel on bottom showing last ~20 status lines, auto-scrolls to bottom
- Heartbeat indicator in header: green dot that pulses every 2s when listener is alive

### Screen 2: Mitigation in Progress (Beats 4-6)
```
┌──────────────────────────────────────────────────────────────┐
│  ⚠ ALERT: HF dropped to 1.04 — Mitigation triggered         │
│  ──────────────────────────────────────────────────────────── │
│                                                               │
│  ┌─── Step 1: Approve ─────────────────────────────────────┐ │
│  │  Asset:    USDC                     ✓ 0x5c42a8b9...     │ │
│  │  Amount:   $32.40                   Gas: 0.0001 BASE    │ │
│  │  Spender:  Aave Pool (0xA238...)                        │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─── Step 2: Repay ────────────────────────────────────────┐│
│  │  Asset:    USDC                     ◌ Pending...         │ │
│  │  Amount:   $32.40                   Retries: 0           │ │
│  │  Mode:     Variable (2)                                  │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─── Step 3: Verify ───────────────────────────────────────┐│
│  │  Status:   Waiting for Step 2                             │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  Elapsed: 2.4s                                                │
└──────────────────────────────────────────────────────────────┘
```

Required behavior:
- Slides in as overlay (or replaces Screen 1 content)
- Steps animate sequentially: Step 1 must complete (show green ✓ + tx hash) before Step 2 starts
- Each step shows: status icon ( ◌ pending / ⟳ running / ✓ success / ✗ failed ), gas cost, retry count
- On failure: step shows red ✗ with the exact revert reason from Aave
- Elapsed timer counts up in real-time
- Credit: "Sponsored by KeeperHub Gas — AgentsOnchain2026" at bottom

### Screen 3: Audit Trail (Beat 7-8)
```
┌──────────────────────────────────────────────────────────────┐
│  ✓ Mitigation Complete                                       │
│  ──────────────────────────────────────────────────────────── │
│                                                               │
│  🔗 KeeperHub Execution: app.keeperhub.com/runs/exec_...     │
│                                                               │
│  │ Step  |  Action  |  Status  |  Tx Hash         |  Gas    ││
│  │───────|──────────|──────────|──────────────────|─────────││
│  │ 1     |  Approve | ✓ Done  | 0x5c42...b9      | 0.0001  ││
│  │ 2     |  Repay   | ✓ Done  | 0x8f93...bc      | 0.0003  ││
│  │ 3     |  Verify  | ✓ Done  | (read-only)       | —       ││
│                                                               │
│  Total time: 4.8s                                            │
│  Total gas:  USDC 0.0004  ($0.000012 at 0.03 gwei)          │
│  HF before: 1.04      HF after: 1.10                         │
│  Repay amount: 32.40 USDC                                    │
│                                                               │
│  ═══════════════════════════════════════════════════════════  │
│  Donate:  LTC ltc1...qrCode   SOL Solana...qrCode            │
└──────────────────────────────────────────────────────────────┘
```

Required behavior:
- Clickable KeeperHub link opens in new tab (this is beat 8 — the "wow" moment)
- Table layout for step details
- Summary stats at bottom
- Tip jar row with two QR codes (LTC and SOL) — small, unobtrusive, at bottom
- QR codes generated client-side with `qrcode` npm package (only new dependency allowed)

---

## 3. Template Search Strategy

### Search Queries (try all)
1. `react terminal dashboard tailwind github stars:>100`
2. `react monospace dashboard template`
3. `retro terminal react ui`
4. `react hacker news dashboard`
5. `terminal inspired react template`
6. `react dashboard minimal dark theme`
7. `cli inspired web dashboard react`
8. `react green monospace dashboard`
9. `keyboard-first react dashboard`
10. `text-mode react dashboard github`

### Sources to Check
- **GitHub**: Search with language:TypeScript, sort by stars
- **Awesome Lists**: awesome-react, awesome-tailwindcss, awesome-react-components
- **shadcn/ui community**: terminal themes, custom themes on github.com/shadcn-ui/ui/discussions
- **Product Hunt**: "terminal dashboard" category
- **React Status** newsletter archives
- **Tailwind UI** (paid — only if free alternatives are terrible)
- **Cruip** (paid templates — skip if free options exist)
- **Mosaic** by tailwindtoolbox

### What to Look For in a Winning Template

Beyond the must-have criteria in Section 2, a winning template has:

**Architecture**
- Clean component tree, not a monolithic God component
- `src/` directory with `components/`, `hooks/`, `utils/`, `styles/` or similar
- TypeScript interfaces for all props, not `any` or `PropTypes`
- Tailwind classes used consistently (no inline styles except dynamic values)
- No barrel exports (`index.ts` re-exports everything)

**Data Flow**
- Custom hooks for data fetching (easy to replace with our `setInterval` + `fetch` polling)
- No hardcoded mock data in components — data comes from hook return values
- Loading/error/empty states already handled (or easy to add)

**Design**
- Dark theme is the default, not toggled on via JS
- Monospace is the primary font, not a secondary option
- Colors are CSS variables, not hardcoded hex values everywhere
- No avatars, no profile pictures, no thumbnail images — text only

**Bundle**
- `vite build` output < 200 KB uncompressed (excluding React + React DOM)
- No images, no SVGs (or minimal, small SVGs only)
- No webfonts loaded from Google Fonts or CDN

### What to Avoid
- Next.js projects (SSR, routing, file-system routing — too much to strip out)
- Templates with authentication pages (login, signup, forgot password)
- E-commerce or SaaS admin panels (too many CRUD tables, charts, and widgets)
- Templates using CSS-in-JS (styled-components, emotion, linaria)
- Templates with dark mode toggle (wastes code)
- Templates with sidebar navigation or multi-level menus
- Templates using any version of Bootstrap
- Templates that need a backend (even a simple JSON server)
- Templates with built-in mock APIs that are deeply coupled to the UI
- Any template that doesn't have a LICENSE file
- Any template with fewer than 50 GitHub stars (likely not maintained)
- Any template last updated before 2024 (React ecosystem moves fast)

---

## 4. Adaptation Plan (How We'll Use the Template)

Once chosen, we will:

1. **Fork the repo** into `/home/dlamini/Desktop/LAX/dashboard/` with full git history + LICENSE preserved
2. **Remove** all existing pages, routes, and demo data
3. **Strip** React Router, state management, animation libraries if present
4. **Replace** hardcoded colors with our 10-color palette (Section 2)
5. **Replace** fonts with monospace system stack
6. **Build 3 custom components**: `HealthFactorBar`, `MitigationSteps`, `AuditTrail`
7. **Write 2 custom hooks**: `usePositionPoller`, `useExecutionPoller`
8. **Add** a `Dashboard` parent component that toggles between 3 states: `monitoring | mitigating | complete`
9. **Add** the heartbeat animation (CSS keyframes)
10. **Add** QR code generation for LTC/SOL (using `qrcode` package)
11. **Add** a small CSS file for terminal-specific styles (scanner line, cursor blink, etc.)

Total estimated effort after template selection: **8-12 hours**

---

## 5. Specific Questions for the Researcher

For each candidate template found, answer these questions definitively:

### General
- **Name** and **GitHub URL** (exact URL to the repository)
- **License** (full text of license file — not just "MIT" but verify the file exists)
- **Stars**, **last commit date**, **open issues count**
- **Is it actively maintained?** (last commit within 6 months? issues being addressed?)
- **npm package name** (if published) and **downloads per week**

### Tech Stack Verification
- **React version** in package.json (exact semver range)
- **TypeScript present?** (tsconfig.json exists? files are .tsx not .js?)
- **Build tool** (Vite? CRA? Next.js? Parcel? TurboPack?)
- **Tailwind version** (v3? v4? not present?)
- **Dependencies** list (top 10 by bundle size impact)
- **Can Vite be swapped in?** (if not already Vite, how hard?)
- **Node version required** (engines field in package.json)

### Bundle Analysis
- **Production build size** (run `npm run build` and check `dist/` size)
- **Gzipped size** of the main JS bundle
- **Unused components estimate** (how many files would we delete?)
- **CSS size** (Tailwind output + any custom CSS)

### Design Fitness
- **Dark mode by default?** (Y/N — if light mode first, how much work to flip?)
- **Monospace font used?** (Y/N — if not, how hard to switch?)
- **Typography scale** (what font sizes for h1, h2, body?)
- **Color scheme** (is it close to our palette, or completely different?)
- **Component quality** (rate 1-10: are components cleanly separated, typed, and reusable?)

### Terminal Aesthetic Score (1-10)
Rate how much the template already looks like a terminal:
- Uses monospace font throughout (3 pts)
- Dark background with green/amber accents (3 pts)
- Text-priority UI (no unnecessary icons/images) (2 pts)
- Keyboard-navigable (1 pt)
- Terminal-like scrollback or log panel (1 pt)

### Adaptation Effort
- **Estimated hours** to strip down to bare skeleton (remove routes, mock data, unused components)
- **Estimated hours** to integrate our 3 custom screen components
- **Estimated hours** to theme colors/fonts
- **Total estimated effort** (low: 2-4h / medium: 4-8h / high: 8-16h)
- **Risk factors**: what could go wrong during adaptation?

### Comparison to Building from Scratch
- **Template is faster than scratch?** (Y/N — if template needs heavy modification, scratch may be better)
- **What does the template give us that scratch doesn't?** (layout grid, responsive breakpoints, typography scale, button/input components, glassmorphism, etc.)

---

## 6. Fallback Plan

If no template meets the criteria:

**Build from scratch** with:
- React 19 + Vite 6 + TypeScript 5.7
- Tailwind CSS 4 (theming via `tailwind.config.ts` custom colors)
- Custom `terminal.css` (~100 lines) for: scanner line animation, cursor blink, scrollbar styling, selection colors
- Custom hooks for polling (no third-party data fetching)
- CSS Grid for layout (3 cards on Screen 1, 3 step cards on Screen 2)
- `<qrcode>` package for QR generation (only new dependency)
- No component library — every UI element is a styled `<div>` with Tailwind

Estimated build time: **12-16 hours** for complete 3-screen dashboard with all states (loading, empty, error, success).

---

## 7. Output Format

Return a markdown report with this exact structure:

```markdown
# Dashboard Template Research Results

## Recommendation
[Top pick name] — brief 1-sentence verdict

## Candidate 1: [name]
- URL: [GitHub URL]
- License: [MIT/Apache-2.0/other]
- Stars: [count] | Last commit: [date] | Issues: [count]
- React: [version] | TypeScript: [Y/N] | Vite: [Y/N] | Tailwind: [version]
- Bundle: [size] KB gzipped
- Terminal score: [1-10]
- Adaptation effort: [2-4h / 4-8h / 8-16h]
- Verdict: [go / maybe / skip]

### Strengths
### Weaknesses
### What must be removed
### What must be added
### Files to keep (for our fork)

## Candidate 2: [name]
...same structure...

## Candidate 3: [name]
...same structure...

## Candidate 4: [name]
...same structure...

## Candidate 5: [name]
...same structure...

## Build-from-Scratch Estimate
- Total hours: 12-16
- Files needed: ~15 (App.tsx, 3 screen components, 2 hooks, 1 CSS file, config)
- Key risks: responsive layout on projector, animation timing, polling edge cases

## Final Recommendation
[pick one candidate OR fallback to scratch, with justification]
```

---

## 8. Context: Screenshots of Comparable Designs

The dashboard should feel like:
- **htop** (terminal process monitor) — color-coded bars, live-updating numbers
- **glances** (terminal system monitor) — multi-panel layout, monospace grid
- **Bloomberg Terminal** — dense data, color-coded status, no wasted whitespace
- **Terminus** or **Hyper** terminal emulators — dark glassmorphism with monospace
- **Netdata** dashboard — real-time charts, minimal chrome, dark theme

If you find a template that looks like any of these, flag it even if it doesn't meet all criteria.

---

## 9. After We Pick

Once you return your report, we will:
1. Clone the chosen template
2. Remove all demo code
3. Integrate our 3 screens
4. Theme colors/fonts
5. Add polling hooks
6. Connect to Anvil fork
7. Test on projector

The template should save us **6-10 hours** over building from scratch. If the savings are less than 4 hours, we build from scratch.

---

*Thank you. Be thorough. We are trusting your research to make a time-sensitive decision — a wrong pick costs us 8 hours of wasted adaptation. Every detail matters.*
