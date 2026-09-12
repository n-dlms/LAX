# LAX Mission

## Core Mission

Ship an AI agent that executes real onchain transactions through KeeperHub to protect Aave V3 positions from liquidation. Win the Main Track (Best Integration into a Live Project) with a verified Aave V3 integration and a live tx through KeeperHub, and the Best KeeperHub Feature bounty with a mergeable PR from the FEEDBACK.md findings.

## Operating Principles (per parent PLAYBOOK.md)

1. **Demo or die** — every feature must be visible in the 3-minute pitch
2. **Simple beats clever** — one working tx on Sepolia beats three half-built mainnet flows
3. **Story first** — "your loan protects itself while you sleep" is the narrative
4. **Ship fast** — hello-tx by end of day 1, core loop by end of week 1
5. **Know the room** — judges are scoring execution, not reasoning. KeeperHub surfaces used, audit trail shown, tx linked.
6. **Polish the show** — last 20% time goes to error states, offline cache, backup demo video
7. **Time is non-renewable** — cut scope, not sleep

## Target Outcomes

| Outcome | Must Have |
|---------|-----------|
| Main track (1st-3rd, $4,000) | Working integration into Aave V3 + real tx through KeeperHub + audit trail in demo + demo video |
| Best KeeperHub Feature bounty ($1,000) | Mergeable PR to keeperhub/keeperhub from FEEDBACK.md findings (C1, C2, L3, or M3) — separate BUIDL |
| Both | Stackable — do not trade one for the other |

## Success Metrics

- Demo runs end-to-end: agent detects HF drop → executes tx → shows tx hash in audit trail
- Demo works offline (cached previous state, recorded tx data)
- 3-minute pitch script fits within time
- Judge understands "my position protects itself" in 30 seconds
- Transaction hashes linked for verification
