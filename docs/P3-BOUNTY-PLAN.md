# P3 — Bounty PR Plan (Best KeeperHub Feature, $1,000)

Research: 2026-09-02 subagent scan of docs.keeperhub.com + github.com/KeeperHub/keeperhub.

## The bounty, per the hackathon

> Ship a feature as a pull request to the KeeperHub repository. Judged on
> **Mergeability, Value to the platform, Code quality and tests, Scope and completeness**.
> Stacks with the main track — **separate BUIDL required**.

## Repo mechanics (verified)

- Repo: `KeeperHub/keeperhub`, PRs target **`staging`** (default branch, moves fast —
  confirm behavior on the current commit before filing and cite the commit hash).
- Stack: Next.js 16 / TypeScript 5 / Drizzle / Playwright. Tests: `pnpm test`,
  `test:unit`, `test:integration`, `test:e2e`. Lint: Ultracite/Biome.
- **Issue-first gate**: behavior-changing PRs need a pre-approved issue
  (`accepted` label; CI `check-issue-link` + `pr-title-check` enforce it).
  **`docs`/`chore`/`style` PRs are issue-exempt** — the fast lane.
- One change per PR; split anything independently shippable.
- No hackathon label/branch exists; prior hackathon referenced in-repo: "Agents Onchain" (PR #1863).

## Candidate scorecard (post-scan)

| # | Candidate | Status | Verdict |
|---|---|---|---|
| 1 | `onBehalfOf` docs (C2) | Now documented in `docs/plugins/aave-v3.md` | Dead as scoped |
| 2 | `tokenConfig` string/object (C1) | Fixed by merged PR #1863 | Dead |
| 3a/3b | Template refs: uint256 fields reject `{{...}}` at save; functionArgs array elements never resolve ("G.trim is not a function") | Templating docs have a "What is NOT supported" table — may be by design. Re-verify on current staging (executor PRs merged Sep 2, after our Sep 1 observation) | Possible, needs issue-first (slow) |
| 4 | **Gas sponsorship error codes undocumented** (`GAS_SPONSORSHIP_*`: TAG_MISSING / QUOTA_EXCEEDED / DISABLED) | Verified: absent from `docs/wallet-management/gas.md` and `/keeper-runs/error-codes.md` | ✅ **Primary pick** — docs-only = issue-exempt; precedent #2039 merged in ~1 week |
| 5 | Workflow versioning (M4) | Real gap, engine-level | Too big for the window |

## ⚠️ Primary-pick risk (resolve on day 1)

The July codes were **tag-based**; sponsorship has since moved to org-level credits
(tags retired). If `GAS_SPONSORSHIP_TAG_*` no longer exists in code, documenting those
codes documents dead behavior → rejected.

**Day-1 checklist:**
1. Clone the repo; `grep -rn "GAS_SPONSORSHIP" --type ts` — enumerate the codes that
   exist in code **today** (executor/`keeperhub-executor` service).
2. Re-verify candidates 3a/3b on current `staging` (cite the commit hash) — if they
   reproduce, the runtime-error-handling fix (structured unresolved-reference error
   instead of "G.trim is not a function") is a small, testable behavior PR.
3. Confirm in Discord: issue-creation access (repo shows a "restricted" banner, yet
   external issues exist — e.g. #2229, Sep 1) + whether the bounty requires
   merged-to-staging or open-PR at deadline.

## Execution plan

**Plan A (primary): gas sponsorship error-codes documentation PR**
- Scope: `docs/wallet-management/gas.md` + `docs/keeper-runs/error-codes.md` —
  document every `GAS_SPONSORSHIP_*` code that exists in code today, trigger
  conditions, and exact reproduction payloads (we have first-hand repro from July +
  Sep: tag missing, quota exceeded, org toggle off).
- Why it wins the rubric: mergeability (docs lane, no gate), platform value
  (sponsorship is central to the agent-economy pitch), completeness (we document
  trigger conditions AND repro, not just codes).
- Weakness: docs-only scores lower on "code quality and tests" — mitigate by adding
  a docs test if the repo has one (check how `docs/` changes are validated).

**Plan B (backup / stretch): runtime error-handling for unresolved templates in
functionArgs**
- File an issue with a minimal repro (workflow JSON + error), request `accepted`,
  then fix: resolve per-element or raise a structured "Unresolved template reference:
  available fields: …" error instead of the opaque "G.trim is not a function".
- Small diff, clear test, high DX value — but gated on the issue-first process, so
  file the issue **immediately** on day 1 if chosen.

**Plan C (only if 4 and B die): cross-link PR** — templating docs ↔ schema-reference
dead-link fixes + "what is NOT supported" clarifications for typed fields (docs lane).

## Logistics

- **Separate BUIDL** for the bounty (main track BUIDL ≠ bounty BUIDL).
- PR title: conventional commit; behavior changes reference the issue number.
- Timeline: file Plan A by **Sep 8–10** to match the ~1-week merge precedent before
  the Sep 18 close; note "The Agent Economy hackathon" in the PR description (no
  hackathon label exists — say it in prose).
- Every claim in the PR must cite the staging commit hash it was verified against.