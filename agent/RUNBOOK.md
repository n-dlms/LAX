# LAX Demo Runbook

The 8-beat live sequence for the demo laptop. Each beat is a step the operator
(or the agent) drives; the whole thing fits in ~70 seconds.

## Setup (before the demo)

1. `./scripts/start-fork.sh` — boot the Anvil fork of Base mainnet (`127.0.0.1:18545`)
2. `./scripts/fork-setup-usdc.sh` — seed oracle prices + USDC
3. `npx tsx scripts/hf-listener.ts [borrower]` — start the HF monitor (CLI arg =
   position; default from `LAX_BORROWER_ADDRESS`/config)
4. `cd src/dashboard && npx vite --host 127.0.0.1` — dashboard at `http://localhost:5173`
5. Ensure the KeeperHub workflow `lax-liquidation-armor` is deployed and enabled.

## Beats

| Beat | Action | Expected |
|---|---|---|
| 0 | Boot all processes | Dashboard shows HF ~1.10, listener IDLE |
| 1 | `./scripts/drop-oracle-price.sh -28` | Oracle drops → HF falls toward 1.05 |
| 2 | Watch the HF bar green → yellow → red | Listener logs IDLE → watch |
| 3 | HF ≤ 1.05 | Listener fires the KeeperHub webhook |
| 4 | Workflow runs: read HF → approve → repay → verify | Execution ID returned |
| 5 | `kh run status <id>` / audit trail | `status: success`, verified tx hash |
| 6 | Dashboard AuditView | Shows execution summary + `app.keeperhub.com/runs/<id>` link |
| 7 | Re-read HF | HF restored to ≥ 1.10 (position secured) |

## Failure modes

- **Anvil not up** → `connect ECONNREFUSED`; rerun `./scripts/start-fork.sh`.
- **Gas** → fund the execution wallet (see `agent/skills/fund-position.md`).
- **Workflow error** → check `kh run logs`; template-reference errors are the
  known platform gap — report, don't silently work around.

## Recording

- Capture the terminal + dashboard + the basescan tx link.
- The submission requires a demo video + the tx link; both come from this run.