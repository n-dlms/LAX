# LAX Documentation

Everything you need to run, understand, and verify LAX.

| Doc | What it is |
|-----|------------|
| [`SETUP.md`](SETUP.md) | Full setup from `git clone` to a running demo (prereqs, .env, fork, dashboard) |
| [`../README.md`](../README.md) | Project overview and quick start |
| [`CLI-GUIDE.md`](CLI-GUIDE.md) | Complete Liquidation CLI user manual — every command, mode, and flag |
| [`CLI-REFERENCE.md`](CLI-REFERENCE.md) | Deep per-command reference — all 77 commands, purpose, examples, and gotchas |
| [`GLOSSARY.md`](GLOSSARY.md) | New to DeFi? Every term explained — HF, WETH, liquidation, MEV — with worked numbers |
| [`architecture.md`](architecture.md) | System architecture: daemon, mitigation gate, webhook path, dashboard |
| [`VERIFIED-TESTING.md`](VERIFIED-TESTING.md) | Evidence log: what was really tested and what worked (live fire, gate outcomes, CLI battery) |
| [`SCOPE.md`](SCOPE.md) | What is and isn't in scope (and why) |
| [`ALERTS.md`](ALERTS.md) | Optional: Discord/Slack operator alerts — setup, security notes, troubleshooting |
| [`zero-cost-testnet-plan.md`](zero-cost-testnet-plan.md) | The Base Sepolia live-testnet submission path |
| [`SUBMISSION-DRAFT.md`](SUBMISSION-DRAFT.md) | DoraHacks BUIDL form answers + pre-deadline checklist |
| [`FEEDBACK.md`](FEEDBACK.md) | Onboarding-DX bounty report: KeeperHub platform friction points and workarounds |

Internal build journal (ADRs, phase research, plans) is in [`archive/`](archive/README.md).

## Quick start (30 seconds)

```bash
./scripts/demo-up.sh            # fork Base mainnet, seed a vulnerable position
npm run lax                     # open the Liquidation CLI
lax watch                       # see the live health factor
```

Full walkthrough: [`SETUP.md`](SETUP.md).
