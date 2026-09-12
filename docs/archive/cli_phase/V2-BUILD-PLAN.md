# LAX V2 Build Plan — Liquidation CLI + Autopilot

**Event:** KeeperHub — The Agent Economy (build Sep 6 → Sep 18, 12:00 CEST)
**Direction (decided):** CLI + autopilot combined · standalone binary extracted from dashboard · full daemon · fork demo + Base Sepolia submission tx.

---

## 1. Positioning

LAX v2 keeps the same thesis (act at HF 1.05, above the liquidation threshold, because reactive agents cannot outrun Flashblocks MEV bots) but upgrades the product shape:

| Surface | What it is | Why it wins rubric points |
|---|---|---|
| **Standalone `lax` CLI** | `npm i -g` style binary (`lax status`, `lax defend`, `lax dry-run`, `lax arm`, `lax autopilot`, `lax runs`) | DX & code quality — "could another team pick this up?" |
| **`lax autopilot` daemon** | Long-running monitor: continuous HF polling, critique gate in the fire path, persisted state, structured logs | Reliability & observability; "execution through KeeperHub, and can we see it?" |
| **Embedded dashboard terminal** | Same CLI backend, still rendered in the React terminal UI | Originality — one backend, two surfaces |

The core CLI (`dashboard/src/cli/`: parser, registry, executor, actions — ~2,500 lines) is already cleanly decoupled behind `CommandContext`. Extraction is re-plumbing, not rewriting.

## 2. Target architecture

```
src/cli/                  # extracted, framework-free CLI core
  parser.ts registry.ts executor.ts history.ts session.ts types.ts
  actions/{rpc,onchain,guardian,audit,system,mock,help}.ts
  node-context.ts         # CommandContext impl for Node: ethers RPC, file-persisted
                          # guardian state + mitigation log, KeeperHub webhook client
bin/lax.ts                # shebang entry → `npm run lax` / global bin
  lax status | hf | position | defend | dry-run | arm | autopilot | runs | audit | ...
src/autopilot/
  daemon.ts               # continuous monitor loop (evolves scripts/hf-listener.ts)
  state.ts                # JSONL mitigation history + crash-safe state file
  gate.ts                 # critique-agent + preflight-simulator wired INTO fire path
  alerts.ts               # webhook/Discord alerting on trigger, execution, failure
dashboard/                # imports the same src/cli core (path alias) — no fork
```

Keep `dashboard/src/cli` as a thin re-export shim during migration so the React app never breaks.

## 3. Phases

### Phase A — Extract the CLI (day 1–2)
1. Copy `dashboard/src/cli/**` → `src/cli/`, strip React imports, replace `LAX_CONFIG` import with root `src/config.ts`.
2. Implement `node-context.ts` (Node `CommandContext`): JSON-RPC via ethers, `setGuardianState`/`getGuardianState` backed by `~/.lax/state.json`, execution records appended to `~/.lax/history.jsonl`, KeeperHub webhook via `KEEPERHUB_API_KEY`.
3. Add `bin/lax.ts` + `package.json` `"bin": {"lax": "./bin/lax.ts"}` and `npm run lax` script.
4. Stub `dispatcher` with a stdout event emitter; make `execute()` print `CommandResult.output`.
5. Wire the 3 existing agent skills (`agent/skills/*`) to call `npm run lax --` instead of raw scripts.
6. Acceptance: `lax status`, `lax hf`, `lax dry-run`, `lax runs` work against a live fork; `npm test` still green.

### Phase B — Autopilot daemon (day 2–4)
1. `src/autopilot/daemon.ts`: poll loop (configurable interval, default 2s), HF classification reused from `hf-listener`, hysteresis (no re-fire until HF recovers above trigger + 0.02 or cooldown expires).
2. Wire `critique-agent` + `preflight-simulator` into the fire path (currently the listener bypasses them — the single biggest safety gap).
3. Persist every attempt (fired / blocked-by-gate / executed / failed) to `~/.lax/mitigations.jsonl`; `lax autopilot --status` replays it.
4. Graceful shutdown (SIGINT → finish in-flight execution, write state), startup self-check (RPC reachable, workflow ID resolvable, gas sponsorship fallback logged).
5. Acceptance: fork demo — drop oracle price, daemon fires, KeeperHub execution ID captured, `lax runs` shows it, `lax audit <id>` pulls logs.

### Phase C — Guardrails & polish (day 4–7)
1. Persist guardrails' daily cap (`safety-plugin/guardrails.ts` is in-memory — daemon restart must not reset the $5/day limit).
2. Alerting: optional Discord/Telegram webhook on trigger + outcome.
3. Replace `cast` shell-outs in `preflight-simulator` with ethers `call` (drops Foundry as a runtime dependency for the CLI; keep `cast` path for fork scripts).
4. Refresh stale docs: dashboard README (still the forked template's), demo README path fix (`src/dashboard` → `dashboard/`), RUNBOOK rewritten around the new CLI.
5. `bootstrap/` (lax-starter) re-based onto `src/cli` so another team can scaffold in minutes.

### Phase D — Submission (day 8–10, by Sep 16 → buffer to Sep 18)
1. Fresh demo video: `lax autopilot` boot → oracle crash → critique gate logs → KeeperHub run link on screen → `lax runs` showing the resolved mitigation.
2. Verify one real Base Sepolia tx through KeeperHub; link in BUIDL.
3. BUIDL for main track + separate BUIDL for bounty PR (#2268 already filed).
4. Form answers drafted (surfaces used, testnet/mainnet, candid "what still breaks").

## 4. Recommended fixes & upgrades (ranked)

Rubric keys: **ID** integration depth · **EX** execution through KeeperHub · **RO** reliability & observability · **UO** usefulness & originality · **DX** developer experience.

| # | Fix / upgrade | Rubric | Effort | Why it's interesting |
|---|---|---|---|---|
| 1 | **Critique gate in the daemon fire path** — every auto-fire passes HF-math verification, preflight sim, and $ caps before the webhook | RO | S | Today the listener can fire with zero checks. This is the "survives non-happy-path" story, and it's already built — just unwired. |
| 2 | **Fire-time exact repay** — daemon computes the exact repay amount at trigger time (+1% buffer already in the math) and passes it in the webhook payload | EX | S | Neutralizes the "static repay amount" platform limitation documented in the trigger skill; the workflow's static amount is always fresh at fire time. |
| 3 | **Persistent guardrails** — daily cap + denylist survive daemon restarts | RO | S | A restart resetting the spend cap is a judge-findable hole. |
| 4 | **`lax dry-run` end-to-end mode** — full trigger pipeline (HF read → math → preflight → critique verdict) with the webhook call skipped, exit code reflects verdict | RO/DX | S | Makes the critique gate visible in the demo video and testable in CI without a fork. |
| 5 | **Hysteresis + cooldown in the daemon** | RO | S | Prevents webhook spam in a sustained crash (re-fire loop) — exactly the "conditions that are not the happy path" rubric line. |
| 6 | **Execution records enrichment** — store KeeperHub run ID + tx hash per mitigation; `lax runs` prints `app.keeperhub.com/runs/<id>` links | EX | S | Judges asked for a tx link; make every run one command away from its permalink. |
| 7 | **Discord/Telegram alert channel** | RO | M | Real user value: humans learn their position was defended. Optional flag, off by default. |
| 8 | **Multi-position config** — `lax.config.json` with N positions, per-position thresholds; daemon monitors all, CLI takes `--position <name>` | UO/ID | M | Upgrades from "one demo wallet" to a real product; still one KeeperHub workflow per position. |
| 9 | **x402 pay-per-defense mode** — autopilot optionally charges (or pays) a micro-fee per mitigation via KeeperHub's x402 surface | UO | L | The event is *The Agent Economy* — an autopilot that settles its own execution cost onchain is the most on-theme upgrade possible. Spec'd already in `docs/cli_phase`. Ship only if A–C land early. |
| 10 | **ethers-based preflight** (drop `cast` runtime dep) | DX | S | Another team shouldn't need Foundry to run the guard. |
| 11 | **Webhook HMAC signing** — listener signs payloads; workflow/proxy verifies | RO | M | Closes an obvious "anyone who finds the URL can move funds" hole; also a good FEEDBACK.md-style finding for the bounty narrative. |

**Explicit non-goals for v2:** real contracts (MockOracle stays demo-only), multi-chain support, rebalancing engine, replacing the React dashboard.

**Decided scope (Sep 6):** core plan (extraction, daemon, critique gate, fire-time repay, persistent guardrails, dry-run mode) + **webhook HMAC signing** (#11). Deferred: multi-position (#8), x402 mode (#9), alerts (#7).

## 5. Risks

- **Sponsorship** — resolved Sep 10 (Discord): no event tag, org-level credits, testnet uncharged.
- **Static workflow repay amount** — mitigated by fix #2; note it honestly in the "what still breaks" form answer either way.
- **Extracting the CLI may churn the dashboard** — keep the shim re-exports; run `npm run dev` in `dashboard/` as a smoke test per phase.
- **Fork demo flakiness** — `fork-state.json` already snapshots the seeded position; re-dump after any fork-setup change.
