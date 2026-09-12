# Bounty PR — Gas Sponsorship Fallback Documentation

**Title:** `docs: document gas-sponsorship fallback and the insufficient_balance failure`
**Repo:** `KeeperHub/keeperhub` → branch `staging`
**Local branch:** `docs/gas-sponsorship-fork` at `/tmp/keeperhub` (patch: `docs/bounty-pr-gas-sponsorship-fallback.patch` in this repo)
**Verified against:** staging commit `d249519c5d7dcf66b8405e065cd7988a647ac442` (2026-09-02)
**Type:** docs → issue-first gate **exempt** (per CONTRIBUTING.md)

## PR description (paste into GitHub)

---

### Summary

Sponsorship falls back silently to direct signing whenever an eligibility
condition is not met — gas credits exhausted, unsupported network, Safe sender,
private mempool route, or a blocked RPC. The operator's only signal is the
downstream failure:

```
Insufficient ETH balance. Have: 0.0, Need: 0.000000231. Fund
0x26833b05be49036d4de306b1f4fba7713cc84de5 with at least 0.000000231 ETH
on this chain and retry.
```

(code `insufficient_balance`, from `lib/execute/native-balance.ts`
`describeNativeShortfall`) — and nothing in the docs connected that error to
the fallback. First-hand hit during a live integration on Base Sepolia.

### Changes

- `docs/wallet-management/gas.md`: new "When sponsorship falls back" — the
  fallback conditions, the two observable outcomes (wallet-pays success vs the
  `insufficient_balance` failure), and both remedies (fund the named address /
  restore sponsorship conditions).
- `docs/keeper-runs/error-codes.md`: document the structured
  `insufficient_balance` action failure (not a PREFIX-NNNN code), its
  sponsorship-fallback cause, and the fix.
- `docs/keeper-runs/troubleshooting.md`: cross-link from Transaction Failures.

### Verification

- Behavior read from `lib/web3/sponsored-transaction-manager.ts`
  (`executeSponsoredTransaction` returns `null` on every ineligible condition,
  triggering the direct-signing fallback) and `lib/execute/native-balance.ts`
  (`describeNativeShortfall` message + `insufficient_balance` code), at commit
  `d249519c5d7dcf66b8405e065cd7988a647ac442`.
- Reproduced live on Base Sepolia: funded-position workflow failed with exactly
  this error until the named address was funded.

Docs-only change; no behavior touched. Part of the "KeeperHub — The Agent
Economy" hackathon bounty submission (DoraHacks), filed as a separate BUIDL.

---

## 🔄 REVIEW ROUND 1 (suisuss) — changes requested, addressed in a417e00

PR: https://github.com/KeeperHub/keeperhub/pull/2268 (branch `n-dlms:docs/gas-sponsorship-fallback` → `KeeperHub:staging`)

Review verdict: "Changes requested — the insufficient_balance code is not present on the run path these pages describe, and three of the other four claims contradict what the code does." CI green (`check-issue-link` passed = docs exemption worked).

All 6 findings verified against code and fixed (commit a417e00):
1. `insufficient_balance` code is simulate-path ONLY (gas-preflight discards it; write-contract-core returns message string) → re-scoped to /api/execute simulate + MCP simulate; run path keys on message text
2. A "Gas sponsored" badge EXISTS (workflow-runs.tsx:876) → corrected to "fallback run simply lacks the badge"
3. Preflight runs BEFORE broadcast (no tx hash exists) → "before the transaction was broadcast"
4. Message ≠ fallback proof (emitted on every direct-signing path) → inverted framing
5. Conditions insufficient: sponsored-client.ts also requires turnkeySubOrgId ≠ null (Turnkey-managed wallet) → condition added, list framed as user-controllable subset
6. Real address → 0x...orgWallet placeholder; frequency claim dropped

Lesson for the next PR: cite the exact function/line for every behavioral claim; the maintainers review docs against code line-by-line (cross-repo callers too).

<details><summary>Original filing notes</summary>

https://github.com/KeeperHub/keeperhub/pull/2268 (branch `n-dlms:docs/gas-sponsorship-fallback` → `KeeperHub:staging`)

Watch for: CI checks (`pr-title-check`, `check-issue-link` should be skipped for docs), maintainer review, merge.

<details><summary>Original push instructions</summary>

```bash
cd /tmp/keeperhub
git remote set-url origin git@github.com:<your-username>/keeperhub.git  # or https
git push -u origin docs/gas-sponsorship-fallback
# then open the PR against KeeperHub:staging with the description above
```

Note: CONTRIBUTING says docs PRs are issue-exempt, so this can go straight to a PR.
If the maintainers ask for an issue first (per the "restricted" issue-creation
banner seen during research), raise it in Discord referencing this patch.

## Bounty checklist status

- [x] Mergeability: docs-only, exempt from issue gate, one change per PR (3 files, one topic)
- [x] Value to platform: sponsorship is the agent-economy pitch; the fallback confusion is real (we hit it live)
- [x] Scope/completeness: eligibility conditions + both observable outcomes + both remedies + cross-links
- [~] Code quality/tests: docs-only (no test surface) — precision is the substitute (exact error strings, code file references, commit hash cited)
</details>
