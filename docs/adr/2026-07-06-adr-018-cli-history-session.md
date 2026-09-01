# ADR-018: CLI History, Session, and Snapshot Storage

**Number**: ADR-018
**Title**: CLI History, Session, and Snapshot Storage
**Date**: 2026-07-06
**Status**: Proposed
**Relates To**: ADR-014, ADR-017
**Supersedes**: Nothing

---

## Context

The CLI needs to support:

1. **Command history** (↑↓ arrow keys to recall previous commands) — essential UX, judges expect it
2. **Session persistence** — `lax runs`, `lax history`, `lax tail` need to recall past commands across the session
3. **Snapshots** — `lax snapshot` captures position state, `lax compare <id>` diffs against current state
4. **Export** — `lax export` dumps session data for audit (demo judges can verify)

Requirements:
- History must survive React re-renders (useRef, not useState)
- Session data must survive tab refresh? (Nice-to-have, not required for demo)
- Snapshots in memory only (demo scope, no DB per SCOPE.md)
- Export produces JSON — copy-paste to judge

---

## Decision

### 1. Command History (`src/cli/history.ts`)

In-memory circular buffer stored in a module-level variable (not React state):

```typescript
const MAX_HISTORY = 200;
const history: string[] = [];
let historyIndex = -1; // For ↑↓ navigation

// Called by executor after successful parse (regardless of execution success)
export function pushHistory(raw: string): void;

// Called by terminal component for arrow key navigation
export function navigateHistory(direction: "up" | "down"): string | null;

// Called by terminal component for autocomplete matching
export function historySearch(prefix: string): string[];

// Called by `lax history` and `lax export`
export function getHistory(): HistoryEntry[];
```

Each entry stores:
```typescript
interface HistoryEntry {
  raw: string;           // "lax repay 480"
  parsed: ParsedCommand | null; // null if parse error
  timestamp: number;
  duration: number;      // ms
  result: CommandResult | null;
  success: boolean;
}
```

### 2. Session Store (`src/cli/session.ts`)

Module-level singleton storing runtime data:

```typescript
interface CliSession {
  startTime: number;
  commandCount: number;
  lastCommandTime: number;
  executions: ExecutionRecord[];   // KeeperHub execution IDs
  snapshots: Record<string, Snapshot>;
  guardianState: {
    enabled: boolean;
    threshold: number;
    target: number;
    blocked: boolean;
  };
  mockMode: boolean;
  originalPrices: { weth: bigint; usdc: bigint };
}
```

Functions:
```typescript
export function resetSession(): void;
export function getSession(): CliSession;
export function updateSession(partial: Partial<CliSession>): void;
```

### 3. Snapshots (`src/cli/snapshot.ts`)

```typescript
interface Snapshot {
  id: string;           // auto-generated: "snap-001"
  timestamp: number;
  label?: string;       // optional user label via `lax snapshot "before-repay"`
  position: {
    hf: bigint;
    totalCollateralUSD: bigint;
    totalDebtUSD: bigint;
    availableBorrowsUSD: bigint;
  };
  oracle: {
    wethPrice: bigint;
    usdcPrice: bigint;
  };
  blockNumber: number;
}
```

`lax snapshot ["label"]` — captures current position + oracle prices.
`lax compare <id>` — shows diff between snapshot and current:

```
Position difference from snap-001:
  HF:  1.0978 → 1.1500  (+0.0522)
  Collateral: $665 → $665  (no change)
  Debt:       $480 → $460  (-$20 repaid)
```

### 4. Export (`lax export`)

Produces a JSON blob displayed in terminal. Copy-pasteable:

```json
{
  "session": { "startTime": "...", "commandCount": 12 },
  "history": [ ... ],
  "executions": [ ... ],
  "snapshots": { ... }
}
```

No file download — just terminal output. Simple, demo-visible.

### 5. Refresh Behavior

- Full page refresh loses all in-memory state. That's acceptable for demo scope (SCOPE.md).
- If we want refresh persistence later, implement `serializeSession()` → `localStorage` → `deserializeSession()` on load. Not needed for MVP.

---

## Consequences

**Positive:**
- History navigation works immediately (no API calls)
- Snapshots create a shareable "before/after" narrative for demo
- Export gives judges verifiable JSON evidence
- All in-memory, no dependencies, no backend

**Negative:**
- Session lost on refresh (acceptable per SCOPE.md — demo is single-session)
- `MAX_HISTORY = 200` is arbitrary — may need tuning

**Mitigation:**
- `lax export` before refresh preserves audit trail
- 200-entry limit is generous (50 commands × 4 attempts each)

---

## Alternatives Considered

1. **localStorage persistence** — Rejected. Adds serialization complexity. Not needed for demo flow. Can add later as 10-minute enhancement.
2. **Backend data store** — Rejected. SCOPE.md explicitly excludes database. KeeperHub execution logs are the canonical audit trail.
3. **React state only (useState)** — Rejected. History would be lost on re-render cycle. Closures would break.

---

## Open Questions

- **OPEN**: Should `lax export` produce a download link (blob URL + `<a download>`) or just text in terminal?
- **OPEN**: Maximum snapshot count before we warn/auto-delete?

---

## Checklist

- [ ] Decision communicated
- [ ] README updated (if applicable)
- [ ] Implementation planned in current phase
- [x] This ADR saved to `docs/adr/2026-07-06-adr-018-cli-history-session.md`