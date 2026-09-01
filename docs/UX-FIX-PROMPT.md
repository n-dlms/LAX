# LAX Dashboard UX Remediation — Agent Brief

You are working on the LAX project at `/home/dlaminin/LAX` — a proactive Aave V3 liquidation-defense agent demoing for the KeeperHub Agent Economy hackathon (Dorahacks). The product story is "your loan protects itself while you sleep": a dashboard watches an Aave V3 position's health factor (HF), and when HF drops to the trigger threshold (1.05), it executes a repay-through-KeeperHub mitigation before MEV liquidators can act.

The terminal aesthetic, colors, and layout are FINE. Do not redesign, re-theme, or introduce a UI library. Every fix below is about **flow, truthfulness, and recoverability** — making sure a first-time user (and a hackathon judge) never gets stuck, never sees a false claim, and always sees real evidence. You are fixing the dashboard only: files under `/home/dlaminin/LAX/dashboard/src/`.

Read this whole brief before writing any code. Each item tells you WHAT is broken, WHERE it is (file:line as of the current code — verify the lines still match before editing), WHY it hurts the user, and HOW to fix it. Then follow the VERIFICATION section at the end exactly — you are not done until every check passes.

---

## P0 FIXES — demo-killers, do these first

### P0-1. Failures during mitigation are silently swallowed

- **Where:** `dashboard/src/components/MitigationView.tsx`, the `executeLocal()` function (~line 301–413), specifically the `catch (err)` block at ~line 410 which only does `console.error("Local execution error:", err)`.
- **What happens:** the approve or repay RPC call to the Anvil fork throws (fork not running, impersonation fails, tx reverted). Nothing is written to `localSteps`, no `setLocalError` is called. The step cards freeze: "Start KeeperHub Run" may show success but "Approve USDC" stays `[···]` pending forever, the header spinner spins forever, and the status text says "Executing mitigation pipeline..." forever. The only escape is the tiny "← Back" button, which silently discards the entire run.
- **Why it matters:** this is the single worst failure mode a demo can have — an infinite spinner with no error. A judge who sees it concludes the product is broken; a real user would have no idea their protection just failed to fire.
- **How to fix:**
  1. In the `catch`, determine which step failed. Track a variable like `currentStepId: "approve" | "repay" | "verify"` that you set before each phase begins; on throw, set `localSteps` (or a dedicated failure state) with that step marked `status: "failed"`, `error: <message>`, `finishedAt: Date.now()`, and mark later steps appropriately (leave them pending, or mark them skipped — pending is fine).
  2. Also call `setLocalError(...)` so the existing red error banner renders the message in full (not truncated).
  3. The header/status area must show `[ !! ] Mitigation Failed` (the component already has this branch — it activates via `anyFailed`, so populating a failed step is enough to light it up).
  4. Add a **Retry button** visible when `anyFailed === true`: "Retry Mitigation". It must re-run the whole pipeline cleanly: reset `localSteps` to null, clear `localError`, keep the existing `executionId` if the KeeperHub trigger already succeeded (do NOT trigger a second KeeperHub run — restructure the trigger effect so it only runs once per mount and is not re-fired by retry; only the local Anvil steps re-run). If the KeeperHub trigger itself failed (`localError` set before any `executionId`), Retry should re-attempt the trigger too.
  5. Ensure the `useEffect` cleanup (`cancelled`) can't cause stale-state writes after unmount — keep the existing pattern.
- **Acceptance:** kill the Anvil fork mid-mitigation (or point FORK_RPC at a dead port) and the UI shows a red failed step with the real error text within seconds, the failure banner appears, and Retry works once the fork is back.

### P0-2. Audit screen shows "POSITION SECURED" with zero evidence

Two compounding bugs — fix BOTH.

- **Bug A — steps are thrown away.** `MitigationView.tsx` ~line 400–408: the `finalEv` built on success hardcodes `steps: []`. `AuditView` therefore always renders "No step data available" in its execution-steps table: no tx hashes, no gas, no durations, no retries — the exact evidence hackathon judges are told to look for.
  - **Fix:** pass the accumulated `localSteps` into the completion event: `steps: localSteps ?? []` (capture the latest value — since `setLocalSteps` was called just before, read from state carefully: prefer maintaining a ref like `localStepsRef` kept in sync, or build the final steps array from the same values you just passed to `setLocalSteps`). Same for the polled-completion path at ~line 420–435: merge polled steps rather than dropping local ones.
- **Bug B — empty array passes as success.** `AuditView.tsx` line 117: `const allSuccess = event.steps.every((s) => s.status === "success");` — `Array.prototype.every` on an empty array returns `true`. So an event with no steps is declared "POSITION SECURED". Also check `MitigationView.tsx` line 439 (`allSuccess = displaySteps.every(...)`) — there `displaySteps` is never empty because it's seeded from `makeInitialSteps()`, but make the logic robust anyway.
  - **Fix:** define success as `event.steps.length > 0 && event.steps.every(s => s.status === "success")`. Apply the same length guard everywhere `.every()` is used to derive a success claim.
- **Acceptance:** complete a successful mitigation; AuditView shows a populated step table with clickable tx hashes for approve and repay, real durations, and the outcome card derived from real step data. Simulate an event with `steps: []` (you can do this in a quick unit render or by temporarily breaking the flow) and confirm it can NOT render "POSITION SECURED".

### P0-3. "Fork connected" banner never dismisses

- **Where:** `MonitorView.tsx` ~line 861: `const justConnected = position !== null && cachedPosition !== null && listenerAlive;` and its banner at ~line 907–911.
- **What happens:** after the very first successful read, `position` and `cachedPosition` are both non-null and `listenerAlive` is true — and stay that way forever. The green "Fork connected — live data resumed" banner renders permanently, taking space and crying wolf.
- **Why:** `justConnected` is meant to describe a *transition* (offline → online), but it's computed as a *state*.
- **Fix:** make it transition-based. Keep refs of the previous `listenerAlive` value; set a `showReconnected` state to true only when `listenerAlive` flips false→true (and skip the very first connect, or show it — your call, but skip-on-first-load is cleaner); auto-hide after ~5 seconds with a timeout, and clear the timeout on unmount. Same treatment applies to the reconnect log entry effect at ~line 763–770 if needed (that one is log-based and fine).
- **Acceptance:** load dashboard with fork running → no permanent green banner. Kill fork → offline banner appears. Restart fork → green "reconnected" banner appears once, then disappears after ~5s.

### P0-4. Offline banner references a script that does not exist

- **Where:** `MonitorView.tsx` `OfflineBanner` component, ~line 569: tells the user to run `./scripts/start-fork.sh`.
- **Reality:** `ls /home/dlaminin/LAX/scripts/` contains `fork-setup-usdc.sh`, `setup.sh`, `hf-listener.ts` — there is no `start-fork.sh`.
- **Fix:** check what the correct command to (re)start the Anvil fork actually is, by reading `scripts/fork-setup-usdc.sh`, `scripts/setup.sh`, `dashboard/README.md`, `docs/SETUP.md`, and `package.json` / `dashboard/package.json` scripts. Point the banner at the real command. If no single "start the fork" command exists, create one (a small `scripts/start-fork.sh` that launches anvil with the right fork settings, chaining whatever `fork-setup-usdc.sh` needs) so the instruction is truthful — then reference it. Also make the banner copy the actual RPC host/port from `LAX_CONFIG.FORK_RPC` rather than any hardcoded port.
- **Acceptance:** copy the command from the banner, run it in a fresh shell against a stopped fork, and the dashboard reconnects.

### P0-5. "Execute Test Run" is not a test; Execute fires with no confirmation

- **Where:** `MonitorView.tsx` `ExecutionPanel` ~lines 328–331 (label logic) and ~line 358–371 (button); handler `handleExecuteClick` ~line 777 fires `onTrigger` immediately.
- **What happens:** when HF is above trigger, the button reads "Execute Test Run" but performs the exact same real repay transaction as the live trigger. A user clicking it expecting a dry run moves real funds (fork funds, but in the story it's real). And when it DOES read "Execute Protection", a single misclick sends a transaction with zero confirmation.
- **Why:** buttons that move money must never be mislabeled, and must ask once.
- **Fix:**
  1. Rename the safe-HF label to "Force Protection Run" (or "Run Protection Now") — anything but "Test".
  2. Add a confirmation modal (match the existing bordered-box terminal style — plain div overlay, no new deps) shown on click of EITHER execute path, containing: current HF, repay amount (`fmtUSDC(computeRepayAmount(...))` — the same number shown in the panel subtitle), target HF (`LAX_CONFIG.HF_TARGET`), the borrower address, and two buttons: "Confirm — Repay & Restore HF" (danger-styled when `needsAction`) and "Cancel". Esc key and backdrop click cancel. Only on Confirm do you log the manual-trigger log line and call `onTrigger`.
  3. "Trigger Price Shock" already implies destructive action; leave it unconfirmed but keep it disabled when offline (already is).
- **Acceptance:** clicking Execute never sends anything directly — modal appears with correct live numbers; Cancel does nothing; Confirm proceeds exactly as before.

---

## P1 FIXES — trust and clarity

### P1-1. Autopilot locks itself with no unlock path in the UI

- **Where:** `MonitorView.tsx` — `autoTriggerBlockedRef` set true in `onTrigger` (App.tsx line 13) and in `engageProtection` (~line 677) and via CLI `setGuardianState`; rendered in `AutopilotStrip` as "LOCKED" (~line 441).
- **What happens:** after an auto-trigger, the defender is disarmed (`blocked: true`) forever — no UI element re-arms it. If the mitigation failed (see P0-1), the user is left with a LOCKED autopilot and their position still unsafe, and the only re-arm path is a CLI command most users will never find.
- **Fix:** in `AutopilotStrip` (or directly beneath it), when `blocked` is true render a small yellow "Re-arm Autopilot" button. Clicking it sets `autoTriggerBlocked.current = false`, updates the CLI guardian state (`setCliGuardianState`) and the view state, and logs a `warn`-level log line "Autopilot re-armed by user". Re-arming must also reset `prevTriggeredRef.current = false` in MonitorView so the auto-trigger effect can fire again on the next HF breach (check the dependency flow — you may need to lift this into a callback passed down, or handle it inside MonitorView where the strip lives).
- **Acceptance:** trigger a mitigation, see LOCKED, click Re-arm, strip returns to ARMED, drop HF below trigger via price shock, auto-trigger fires again.

### P1-2. Event log drowns signal in noise

- **Where:** `MonitorView.tsx` — periodic read logging at ~line 740–747 (a new "Aave HF x.xx · block · latency" line every 2s poll), log cap of 28 entries via `.slice(-28)` used in several places.
- **What happens:** within about a minute the 28-entry buffer contains nothing but routine HF reads; the trigger lines, error lines, and reconnection notices — the things a user (and judge) actually needs — scroll away.
- **Fix (do all three):**
  1. **Collapse periodic reads:** instead of appending a new line per poll, maintain a single pinned "live" line at the top of the log area that updates in place with the latest HF/block/latency (e.g. rendered as its own element above the scroll list, styled subtly, updated from `position`). Only transitions get appended as real log entries: state changes (safe→warning→danger→triggered), errors, reconnections, manual actions, price shocks.
  2. **Log HF *changes*, not reads:** append a log entry only when HF crosses a band (e.g. moves across 1.5 / 1.1 / 1.05 boundaries) or changes by more than ~1% since last logged value.
  3. **Pin important entries:** raise the cap (e.g. 200) and/or render trigger/error entries with a sticky style so they survive routine noise. At minimum, never let periodic lines evict error lines within the first screenful.
- **Acceptance:** leave dashboard running 5 minutes with fork up; trigger/error lines from minute one are still readable; the live HF line shows current values.

### P1-3. Log lines truncate their most important content

- **Where:** `MonitorView.tsx` `LogPanel` ~line 422: `className={... + " truncate min-w-0"}` on the message span.
- **What happens:** long messages — invariably error messages, the one thing a user must read in full — are clipped with ellipsis and there is no tooltip, no click-to-expand, nothing.
- **Fix:** switch from `truncate` to `break-words` (or wrap normally). Optionally add `title={entry.message}` as a belt-and-braces tooltip. If vertical growth is a concern, add a click-to-expand per entry (max-height with overflow-hidden + "expand" affordance) — but full display by default is the priority.
- **Acceptance:** produce a long error (dead RPC port gives a long fetch error); the entire message is readable in the log panel.

### P1-4. Backtick terminal shortcut swallows backticks typed in inputs

- **Where:** `MonitorView.tsx` global keydown handler ~lines 607–616: fires on "`" unless `terminalExecuting`.
- **What happens:** the listener is attached to `window` and does `e.preventDefault()` unconditionally — including when the user is typing a backtick INTO the terminal prompt or any other input. The character is eaten and, worse, the overlay toggles mid-typing.
- **Fix:** ignore the event when `document.activeElement` is an input/textarea/contenteditable (except when the overlay is closed and focus is on body — i.e., allow toggle only when NOT typing in a text field), and don't preventDefault when you're not handling it.
- **Acceptance:** focus the terminal prompt, type a backtick — the character appears, overlay does not toggle. Press backtick with focus on the page background — overlay toggles.

### P1-5. "Next poll in ~2s" is hardcoded and duplicated — make it live and truthful

- **Where:** `MonitorView.tsx` `AgentInsights` ~lines 286–294: two hardcoded strings "Next poll in ~2s · ...". The poll interval is actually the `pollMs = 2000` default parameter of `usePositionPoller` (`hooks/usePositionPoller.ts` line 88) — nothing imports or reflects it in the UI. (Note the same "2s" claim style appears anywhere else it shows up — grep for "Next poll" and "~2s" across `dashboard/src` and fix every occurrence.)
- **What happens:** it *looks* hardcoded because it is. If anyone changes the poll interval (config, offline backoff), the UI lies. It also reads as static, dead text rather than a live countdown — a small but very visible credibility detail on the main screen.
- **Fix:**
  1. Export a named constant (e.g. `POLL_INTERVAL_MS = 2000`) from `hooks/usePositionPoller.ts` (or from `types.ts` next to `LAX_CONFIG` — pick one source of truth) and use it as the default in the hook AND consume it in `AgentInsights`. Zero duplication.
  2. Upgrade it to a **live countdown**: a small component that, given `pollMs` and the position's `lastReadAt`, shows the actual seconds remaining until the next scheduled read (`next = lastReadAt + pollMs`), ticking down and resetting on each read. This is cheap (one `setInterval(…, 250)` or a requestAnimationFrame-free 500ms tick — mind re-render cost; keep it inside the small component so only it re-renders) and instantly makes the panel feel alive instead of pasted-in.
  3. If RPC is offline (`listenerAlive === false`), the same line must NOT show a countdown — show "Retrying connection…" or similar, consistent with the disconnected state text already in `AgentInsights`.
- **Acceptance:** the countdown visibly ticks down and resets every read; changing the exported constant to e.g. 5000 changes both the actual poll rate and the displayed text with no other edits; grep confirms no remaining literal "~2s".

---

## P2 FIXES — polish (do these, but after everything above)

### P2-1. De-duplicate hardcoded display strings

- `MitigationView.tsx` line 115: `gasUsed: "queued (~$0.00 fork — no cost)"` and line 191–194: the StepCard renders `gas: {step.gasUsed}` followed by a second hardcoded `<span>(~$0.00 fork — no cost)</span>` — so the parenthetical can appear twice on one card ("gas: queued (~$0.00 fork — no cost) (~$0.00 fork — no cost)"). Extract one `FORK_GAS_NOTE` constant (or better: only render the note when `step.gasUsed` doesn't already contain it), and use it in exactly one place per card. Grep for other duplicated display strings while you're in there (`fmtUSDC`, status icon maps, etc., are duplicated across MitigationView/AuditView — consolidate the shared helpers `fmtTime`, `fmtDuration`, `statusIcon`, `statusColor`, `encodeAddress`, `encodeUint`, `rpcRequest`, `fmtUSDC` into a shared module like `dashboard/src/utils/format.ts` + `dashboard/src/utils/rpc.ts` (rpc.ts already exists — reuse it in MitigationView instead of its private `rpcRequest` copy) and import from both views).

### P2-2. Error banner hardcodes port

- `MonitorView.tsx` ~line 916: "Is Anvil running at port 18545?" — derive from `LAX_CONFIG.FORK_RPC` (parse the URL, print host:port or full URL). One line, do it.

### P2-3. Don't blind the user during mitigation

- `MitigationView` fully replaces the monitor: the user loses sight of collateral/debt/HF trend at the exact moment they most want it. Do NOT attempt a full split-screen redesign. Minimal version: add a compact "position snapshot" strip at the top of MitigationView showing HF-at-trigger → current HF (poll `eth_call getUserAccountData` once every ~2s while mitigating — the code to encode/decode it already exists in `usePositionPoller.ts`; reuse the helpers) plus collateral/debt readout. Keep it to one row; this is reassurance, not a dashboard.

### P2-4. Responsive pass

- `MonitorView` value cards use `grid-cols-3` fixed (~line 933) — make it `grid-cols-1 sm:grid-cols-3` so they stack on narrow screens. AuditView's step table already has `overflow-x-auto` — verify it scrolls rather than overflows the page. MitigationView's back button is `fixed top-2 left-2` — on mobile it can overlap the header; add `pl-14` is already on the title (line 454), verify it holds at 360px width. Test the monitor, mitigation, and audit screens at 360px and 1366px widths.

### P2-5. Keyboard/focus accessibility

- All custom buttons must be reachable and usable via Tab + Enter (they're real `<button>`s — verify none have `tabIndex={-1}` or swallow keydown). Give the confirmation modal (P0-5) proper focus handling: focus Confirm (or Cancel — prefer the safe action) on open, trap Tab within the modal, restore focus to the invoking button on close, close on Escape.

### P2-6. Truthful disabled-button tooltips

- `ExecutionPanel` disabled states say nothing about WHY. Add `title` attributes: offline → "RPC offline — waiting for fork", loading → "Waiting for first position read". Cheap trust win.

### P2-7. Naming overhaul — one name, everywhere, no leftovers

The project currently has THREE identities visible to anyone who looks: "LAX" (the codename), "LAX" (a leftover from a previous project, still in `usePositionPoller.ts` line 26 as the localStorage key `lax_position_cache_v1` and in the README's placeholder repo link `github.com/your-org/lax`), and "PROJECT LAX" (dashboard header). A judge or user who spots a dead codename in the cache key will assume the rest of the codebase is equally stale. Fix it completely.

- **Single source of truth for the product name.** Create one constant, e.g. in `dashboard/src/types.ts` next to `LAX_CONFIG`:
  ```ts
  export const APP_NAME = "LAX"; // one place to rename the whole product
  ```
  ("LAX" is the chosen default — it says exactly what the product does: acts *before* the fall/liquidation. If the owner later changes their mind, editing this ONE string rebrands everything.) `LAX_CONFIG` itself may stay as an internal variable name, but every USER-VISIBLE string must come from `APP_NAME`.
- **Apply `APP_NAME` to every user-visible surface:** dashboard header (replace `PROJECT LAX` — "project" screams prototype; render `APP_NAME.toUpperCase()` with the existing title font), the HTML `<title>` and any meta tags in `dashboard/index.html`, the CLI prompt prefix and help/guide text (`dashboard/src/cli/actions/help.ts`, `guide` output — grep for `lax ` prefixes in user-facing strings; the literal command `lax` may remain as the CLI verb, but the product name in prose must be `APP_NAME`), the OfflineBanner and any other prose mentioning LAX, and the README heading (`# LAX — Keep Your Position Safe` becomes the new name with LAX mentioned once as former codename, or dropped entirely — check the README's placeholder `lax` repo link too and leave a clear `TODO` if the real repo URL is unknown).
- **Kill `lax` completely.** Rename the localStorage key to `lax_position_cache_v2` (derive from `APP_NAME`, and bump the version suffix so stale `lax` caches are simply ignored rather than loaded). Grep the whole repo (excluding `node_modules`, `out`, `fork-state.json`, `cache/`) for `lax` case-insensitively and eliminate every hit that isn't a build artifact.
- **Human-facing state labels (AutopilotStrip, ~line 441):** rename `LOCKED` → `STANDBY` with subtitle "action taken" (paired with the Re-arm button from P1-1 — "standby" says "I did my job and I'm waiting", where "locked" reads as "broken"), `ARMED` → `PROTECTING`, `MANUAL` → `MANUAL` is acceptable but add a `title` tooltip ("you control when protection runs"). Every state must be self-explaining to a non-crypto person in one glance; none should be interpretable as an error when it isn't.
- **Acceptance (add to V6):** `grep -rni "lax" . --exclude-dir=node_modules --exclude-dir=out --exclude-dir=cache --exclude=fork-state.json` returns zero hits; `grep -rn "PROJECT LAX" dashboard/` returns zero hits; the header, page title, CLI help, and README all show the same name sourced from one constant.

---

## NON-NEGOTIABLE CONSTRAINTS

1. **No new runtime dependencies.** No UI kit, no modal library, no state library. React + existing Tailwind-style classes only.
2. **Preserve the terminal aesthetic** — same colors (`text-cyan`, `bg-surface`, `border-bordercol`, `heartbeat-pulse`, `animate-slide-up`, etc.), same typography classes. New UI (modal, countdown, snapshot strip, re-arm button) must look native to the existing design.
3. **Don't break the CLI surface.** `dashboard/src/cli/**` exports used by MonitorView (`setCommandContext`, `cliDispatcher`, guardian state, snapshots, execution records) must keep working; run the existing checks below to confirm. The CLI verb `lax` may stay as the command word even after the P2-7 rename.
4. **Don't change protocol/RPC semantics** — selectors, encodings, and the Aave math stay exactly as they are. This is a UI/UX pass. The one exception: wiring the correct fork-start script reference (P0-4), which may ADD a script but not change existing ones' behavior.
5. **BigInt hygiene:** all onchain values are bigint — never route them through `Number` for math; existing helpers show the pattern. New code follows it.

---

## VERIFICATION — you are NOT done until all of this passes

Work through every item; do not skip one because "it obviously works." Where a check needs the Anvil fork, start it (see `docs/SETUP.md` / `scripts/fork-setup-usdc.sh`); where it needs the dashboard, run the dev server (`dashboard/package.json` — typically `npm run dev` inside `dashboard/`) and verify in a real browser, not just by reading code.

### V1. Static checks
- [ ] `cd /home/dlaminin/LAX/dashboard && npx tsc --noEmit` (or the repo's typecheck script) passes with zero errors.
- [ ] `npm run build` (or `vite build`) succeeds.
- [ ] `cd /home/dlaminin/LAX && npm test` — all 11 existing test suites still pass (these cover the backend logic; you shouldn't have touched it, so any failure means you broke something — find and fix it).
- [ ] `grep -rn "start-fork.sh\|~2s\|18545\|Execute Test Run\|POSITION SECURED" dashboard/src` — every hit is either intentionally correct (e.g. a script name that now exists) or eliminated.
- [ ] `grep -rn "steps: \[\]" dashboard/src` — no completion path discards steps anymore.

### V2. Monitor screen, live fork
- [ ] Load the dashboard: HF gauge populates, live HF line in the log updates every poll WITHOUT spamming new log lines, no permanent green "connected" banner.
- [ ] The "next poll" indicator visibly counts down to the next read and resets on each read; shows connection status (not a countdown) when RPC is down.
- [ ] Stop the fork (`Ctrl-C` or kill the anvil process): within ~2 polls the status flips to RPC OFFLINE, the offline banner appears and its command is copy-paste runnable; the banner text contains the ACTUAL RPC host:port from config, not a hardcoded one.
- [ ] Restart the fork using the exact command the banner gives you: dashboard reconnects, green reconnected banner appears ONCE and auto-hides within ~5s.
- [ ] With RPC down, long error messages render in FULL in the event log (no ellipsis truncation).
- [ ] Type a backtick into the terminal prompt: the character appears and the overlay does not toggle. Press backtick with focus on the page background: the overlay toggles.

### V3. Execution flow
- [ ] Click "Execute Protection" (safe HF shows the renamed label — confirm it is NOT "Execute Test Run"): confirmation modal appears showing the SAME repay amount as the panel subtitle, current HF, and target HF. Cancel closes it with zero side effects (no log line, no trigger).
- [ ] Confirm: mitigation screen appears, steps progress Approve → Repay → Verify with real tx hashes visible and clickable.
- [ ] **The audit screen shows a populated step table** — tx hashes, durations, gas notes appearing at most once per card — and the outcome banner reflects actual step statuses.
- [ ] **Failure path:** stop the fork, then trigger mitigation. The failing step turns red with the real error message within seconds; the red failure banner shows; the status area shows `[ !! ] Mitigation Failed`; NO infinite spinner. Restart the fork, click Retry: the pipeline re-runs and completes; the retry did NOT create a second KeeperHub execution (check the displayed execution ID is unchanged when the original trigger had succeeded).

### V4. Autopilot
- [ ] Trigger a price shock that drops HF below 1.05: auto-trigger fires, autopilot strip shows LOCKED.
- [ ] A "Re-arm Autopilot" affordance is visible; clicking it returns the strip to ARMED and logs the re-arm event.
- [ ] Shock again: auto-trigger fires a second time (proving `prevTriggeredRef` was reset, not just the label).

### V5. Empty/edge rendering
- [ ] Construct (in a test or temporary dev tweak) a `MitigationEvent` with `steps: []` and confirm AuditView renders a neutral/degraded state — NEVER "POSITION SECURED".
- [ ] Same for an event whose steps are all pending.
- [ ] Check all three screens at 360px width: nothing overflows horizontally, no overlapping fixed elements, tables scroll.

### V6. Consistency sweep (leave no stone unturned)
- [ ] Shared helpers (`fmtTime`, `fmtDuration`, `fmtUSDC`, `statusIcon`, `statusColor`, encoding helpers, `rpcRequest`) now live in one place and both MitigationView and AuditView (and MonitorView where applicable) import them; grep for duplicate definitions and remove them.
- [ ] Every `.every()` used to derive a success/safe claim is guarded against empty arrays — grep `\.every\(` across `dashboard/src` and audit each use.
- [ ] Every `setTimeout`/`setInterval` you added has a matching cleanup — grep your new code for them and check each component's cleanup path.
- [ ] Every new button has visible disabled-state styling when its action is unavailable, and a `title` explaining why when disabled.
- [ ] No new console errors or React key warnings in the browser console across a full session: load → offline → reconnect → shock → mitigate → audit → reset. The console must be CLEAN (one full cycle).
- [ ] Full-cycle smoke test end-to-end: `npm run dev` in dashboard, fork running — monitor 10s → price shock → auto-mitigation → audit with real tx links → Back to Monitor → re-arm → manual execute via modal → audit again. Both cycles clean, console clean, evidence visible both times.

### V7. Report
When all checks pass, produce a summary listing: each fix (P0-1 … P2-6) with the files changed, each verification checkbox with pass/fail and how you verified it (command run or manual browser step), and anything you intentionally did NOT do with the reason. If any check fails and you cannot fix it, say so explicitly in the report — do not silently drop it.

---

## ORDER OF WORK

1. P0-1 → P0-2 (failure visibility and evidence — these two are the demo)
2. P0-3, P0-4, P0-5 (banners, truthful instructions, confirmation)
3. P1-1 → P1-5 (re-arm, log hygiene, truncation, backtick, live countdown)
4. P2-1 … P2-7 (consolidation, responsive, a11y, tooltips, naming overhaul)
5. Full V1–V7 verification pass
6. Report

Commit (or stage) logically per phase if the environment allows it, so diffs stay reviewable. Do not refactor beyond what the items require. When in doubt between "clever" and "obvious," choose obvious — this must survive a live demo on a projector.

---

# PART B — THE WINNING MOVE: TURN LAX INTO A MULTI-USER SERVICE (BUDGET: $0)

This part is NOT part of the UX fix pass above. It is a separate, larger workstream. Read it fully, understand WHY it wins, then implement it in the phased order given. The hard constraint is **zero spend**: no paid APIs, no paid hosting, no database bills, no gas the user doesn't already have. Every element below is free-tier or client-side. If a step seems to require money, stop and find the free path (one is always listed).

## B0. Why this adjustment wins the hackathon — the argument you must internalize

The DoraHacks page says it in plain words: they want integration into **"a live project that exists and is running, with users"**, and they'd rather see one working integration into a real project than another standalone demo. Read the room:

1. **Most competitors will bring exactly what LAX is today**: a polished single-position demo with a hardcoded borrower address (`LAX_CONFIG.BORROWER_ADDRESS`) watching one wallet on one fork. Judges will see a dozen of these. A single-user demo can be *good*; it can never be *live with users*.
2. **The moment any Aave user can protect their own position through your UI, you stop being a demo of an integration and start being the live project itself.** "Here are 5 real wallets currently being protected" is a sentence no single-position competitor can say. It reframes your entire submission from "hackathon project" to "deployed product that happened to be built at this hackathon" — which is precisely what the $4,000 main track rewards.
3. **It directly multiplies your evidence.** One user = one tx receipt. Five users = five KeeperHub run links, five tx hashes, five different positions with different risk profiles — your audit-trail story becomes a *portfolio* of real interventions instead of one canned run.
4. **It's the honest reading of "Agent Economy."** An agent protecting only its own operator is a script. An agent serving arbitrary users on demand, with each action executed through KeeperHub and auditable per-user, is an economy participant. The strongest pitch line this unlocks: "Connect your wallet — your Aave position protects itself while you sleep. It already does for these people."
5. **Zero dollars is not a handicap here — it's a forcing function.** Everything below runs on public RPCs, free static hosting, KeeperHub's own execution/audit infrastructure (which IS your backend — that's the whole point of the hackathon), and testnet gas. Your only real costs are the mainnet txs you choose to make yourself as receipts, and gas sponsorship via KeeperHub is the designed answer to that.

The strategic risk to manage: multi-user adds surface area, and reliability is a judging criterion. That's why the phasing below makes "single-user demo stays rock solid" a hard invariant at every phase.

## B1. Phase M1 — Parameterize the position (pure refactor, zero infra)

Today `usePositionPoller` and the whole Monitor screen are welded to `LAX_CONFIG.BORROWER_ADDRESS` and `LAX_CONFIG.FORK_RPC`. Make the monitored address a piece of **state**, not config:

- Add a small address-entry state at the top of the monitor flow: text input + "Watch this position" button. Validate (checksummed or lowercase 0x + 40 hex chars) client-side. Persist the last-watched address in `localStorage` (per the P2-7 key scheme).
- Thread the address through `usePositionPoller(rpcUrl, borrower)` — it already takes parameters; the bug is that MonitorView never passes them. Same for the CLI `CommandContext.position()` and the mitigation flow (`MitigationView` reads `LAX_CONFIG.BORROWER_ADDRESS` directly — receive the address as a prop instead).
- HF trigger/target thresholds become per-session user settings (already half-true via guardian state) with sane defaults 1.05/1.10, persisted per address.
- **Invariant:** with the default address filled in, behavior is byte-for-byte identical to today's single-user demo. Do not break the P0–P2 demo path.
- **Free by construction** — no backend, no API keys, just refactoring.

## B2. Phase M2 — Read-any-position, trustless (public RPC, $0)

- Swap the hardcoded fork RPC for a configurable RPC endpoint with a default of a **free public endpoint** (e.g. a public Base/Arbitrum/mainnet RPC; no API key required). Keep the Anvil fork as a selectable "demo network" option so the offline/demo story survives intact.
- All position reads are plain `eth_call`s to the Aave Pool — already true in `usePositionPoller`. Any address, any network, zero cost, nothing to trust but the chain. Show network name + RPC host in the header so users always know what they're looking at.
- **Free:** public RPCs are rate-limited but fine at 2s polling for a handful of users; if rate-limited, exponential backoff (you already have a consecutive-errors counter in the poller — extend it).

## B3. Phase M3 — Wallet connect, no backend (window.ethereum, $0)

- Add "Connect wallet" using the browser's injected provider (`window.ethereum` — MetaMask/Rabby/etc.) **only**; do NOT add WalletConnect (it needs a paid relay/Cloud project for reliable operation). Read-only flow: fetch the connected address, feed it into M1's state. No signature, no transaction signing in the browser — remember, **execution happens through KeeperHub**, which is both your $0 answer to execution and exactly what the judges want to see used.
- User "registration" = signing a free EIP-712-style message (or even just connecting — decide based on time) authorizing the agent to act for that address via the KeeperHub workflow. The signed message is what you show in the UI as "protection active."
- **Free:** injected-provider reads and message signatures cost nothing.

## B4. Phase M4 — Per-user protection via KeeperHub webhooks ($0)

- The mitigation trigger already POSTs to the KeeperHub workflow webhook (`MitigationView`'s `triggerWorkflow`) — it just always sends the hardcoded borrower. Extend the payload to carry the watched address and the user's chosen thresholds; keep `source: "lax-dashboard"` plus a per-session id so runs are attributable in the audit trail.
- Per-user secrets: the `VITE_KEEPERHUB_API_KEY` must NOT ship in the static bundle in the multi-user build — route the webhook through a free edge function (Vercel/Netlify/Cloudflare Pages functions are all free-tier; pick whichever you deploy on in M5) that holds the key as an env var and forwards to KeeperHub. This is the only "backend" you need, it's ~20 lines, and it's free.
- **Free:** KeeperHub webhook triggering is the product surface the hackathon is about; the edge function is free tier.

## B5. Phase M5 — Ship it where users are ($0 hosting + $0 users)

- Host the dashboard on a free static tier (GitHub Pages / Vercel / Netlify / Cloudflare Pages — all free). Custom domain is unnecessary; `<name>.vercel.app` is fine.
- Recruit 3–5 real beta users during the build window (Sep 6–18) from the hackathon's own Discord/Telegram — other participants with Aave testnet positions are your warmest audience and cost nothing. A testnet (Base Sepolia etc.) position costs users nothing, so "try it" is a zero-friction ask.
- Record real runs from these users into the dashboard's audit section: "Protected positions" list showing address (truncated), network, HF, and last action with KeeperHub run + explorer links. This list, populated with strangers' wallets, is your single most persuasive slide at the live finalist panel.
- **Free:** hosting free tier; users are volunteers; testnet gas is free; the ONE mainnet tx you make yourself as the flagship receipt can use KeeperHub gas sponsorship (the `AgentsOnchain2026`-style tag / sponsorship flow — verify what the current hackathon's sponsorship arrangement is before demo day).

## B6. What NOT to do (scope discipline)

- No database. No user accounts, passwords, or email. Per-user state lives in the user's own browser (localStorage) and on-chain — that's not a shortcut, it's the DeFi-native answer, and it's $0 forever.
- No notification system (email/push needs paid infra) — in-app + the dashboard being open is enough for the demo. Mention "notifications" as roadmap, not a missing feature.
- No multi-position portfolio view, no liquidation-history charts, no token/governance anything. One position, one button, one receipt, done well.
- Do not let Part B touch the P0–P2 work until that pass is fully verified — the demo's reliability is worth more than every feature in this section combined.

## B7. Order and gates

1. M1 (parameterize) → verify single-user demo unchanged.
2. M2 (public RPC) → verify reads work for an arbitrary address on a real network.
3. M3 (wallet connect) → verify connect → watch → protect flow on testnet, $0.
4. M4 (per-user webhook via edge function) → verify a real KeeperHub run attributable to a second address.
5. M5 (host + recruit users) → verify 3+ real protected positions visible in the UI with live links.
Gate at every step: if the phase breaks the single-user fork demo, fix or revert before proceeding. The Anvil demo path must ALWAYS work offline for the live panel.
