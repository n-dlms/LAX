# ADR-003: Agentic Wallet — First-Party `@keeperhub/wallet` (Turnkey Custody, No CDP)

**Number**: ADR-003
**Title**: Agentic Wallet — First-Party `@keeperhub/wallet` (Turnkey Custody, No CDP)
**Date**: 2026-07-05
**Status**: Accepted
**Relates To**: MISSION.md, SCOPE.md, ADR-001, `docs/phase0/KeeperHub Wallet Technical Review.md`, `docs/legal/ETHICS.md`
**Supersedes**: Nothing

---

## Context

The hackathon judges credit "use of KeeperHub surfaces" — the agentic wallet is one of those surfaces. LAX must pay for any paid marketplace workflow call and must hold the asset used in the demo Aave V3 repay/supply actions (or rely on gas sponsorship per ADR-006). Either way, an onchain wallet must be wired into the agent.

Three wallet candidates per `docs/phase0/KeeperHub Wallet Technical Review.md:145-156`:
- First-party `@keeperhub/wallet` (Turnkey server-side custody, three-tier safety hook).
- `agentcash` (plaintext key on disk, "do not custody real funds" warning).
- Coinbase agentic-wallet-skills (requires paid CDP account).

`docs/SCOPE.md` enforces $0 hard cap. `docs/legal/ETHICS.md` forbids "hardcoded credentials or secrets in source code" and demands minimal data custody.

## Decision

LAX will install the **first-party `@keeperhub/wallet`** with NO CDP account, NO plaintext keys on disk, NO Coinbase Developer Platform dependency.

Install sequence:
```bash
npx -p @keeperhub/wallet keeperhub-wallet skill install
npx -p @keeperhub/wallet keeperhub-wallet add
```

Outputs at `~/.keeperhub/`:
- `wallet.json` — public metadata only: `address`, `subOrgId`, `walletId`, `apiPublicKey`, `organizationId`, `environment`. **No private key on disk** (per `KeeperHub Wallet Technical Review.md:67-77`).
- `safety.json` — local policy gate: `block_threshold_usd`, `daily_limit_usd`, `enforce_limits`, `allowed_domains`, `denied_selectors`. Modifiable; we tighten defaults.

Tightened `~/.keeperhub/safety.json` defaults for the demo:
```json
{
  "block_threshold_usd": 1.00,
  "daily_limit_usd": 5.00,
  "enforce_limits": true,
  "allowed_domains": [
    "https://api.keeperhub.com",
    "https://app.keeperhub.com"
  ],
  "denied_selectors": ["0x095ea7b3"]
}
```
- `block_threshold_usd: 1.00` — any single tx above $1 USD-equivalent blocked locally before reaching the signer.
- `daily_limit_usd: 5.00` — rolling 24h spend cap below the server-side 200 USDC/day cap, leaves safety margin.
- `denied_selectors` includes `0x095ea7b3` (ERC-20 `approve`) by default for the demo phase, because the Aave V3 plugin requires a separate approve step (per ADR-005) and we want every approve to require explicit human sanity-check rather than autonomous LLM autocalls. During Phase 3 we'll **temporarily remove this entry** for the one approval tx needed for the demo and re-add it afterward.

OpenCode's lack of native `PreToolUse` is compensated by the custom plugin from ADR-001 — that plugin reads `safety.json` and throws on violations per `docs/phase0/OpenCode KeeperHub Compatibility Analysis.md:101-159`.

Server-side hard limit fallback (cannot be edited, enforced by Turnkey itself):
- `transfer()` / `transferFrom()` above 100 USDC denied.
- `approve()` above 100 USDC denied.
- EIP-712 signing restricted to chain IDs 8453 (Base), 4217 (Tempo mainnet), 42431 (Tempo testnet).
- Aggregate signed payments capped at 200 USDC per UTC day.

## Consequences

**Positive**
- $0 cost. Turnkey fees subsidized by KeeperHub's parent tenant per `KeeperHub Wallet Technical Review.md:58-60`.
- No plaintext key on disk → satisfies `ETHICS.md` and `THREAT_MODEL.md` R-004 (API key leak) — although `wallet.json` itself contains subOrgId/walletId/apiPublicKey, none of those alone are sufficient to sign.
- Listed as a KeeperHub-native integration → "use of KeeperHub surfaces" judging criterion.
- Defense in depth: client-side plugin gate, local `safety.json` gate, AND server-side Turnkey policy gate. Three independent layers.
- Sub-60-second onboarding provides a great onboarding DX bounty contribution (per `KeeperHub Wallet Technical Review.md:153` — "~30 seconds; automates Turnkey sub-org provisioning on first run").

**Negative**
- Wallet is custodial — KeeperHub controls the Turnkey root. We trust KeeperHub to honor declared policy. Acceptable for a hackathon demo holding <$5 USDC.
- Recovery: if `wallet.json` is lost, the wallet is unrecoverable per `docs.keeperhub.com/ai-tools/agentic-wallet` "What happens if I lose wallet.json". Mitigation: back up `wallet.json` like an SSH key (encrypted volume, not in git).
- OpenCode plugin (ADR-001) duplicates the `safety.json` gate that Claude Code's PreToolUse would have done natively. Maintenance burden is one TypeScript file plus its tests, ~1 day.
- Server-side policy is not user-editable. If we need >$100 USDC/transfer or contracts outside Base USDC + Tempo USDC.e allowlist, we must contact KeeperHub support. Mitigation: demo stays <$5 and uses Base USDC.

## Alternatives Considered

### Alternative 1: agentcash
- Pros: 10s install, no KeeperHub-side dependencies.
- Cons: Plaintext private key in `~/.agentcash/wallet.json` (`Wallet Technical Review.md:152`), "do not custody real funds" warning. Loses any KeeperHub-integration signal — agentcash is third-party.
- Rejected because: violates `ETHICS.md` "no credentials in source" spirit (plaintext key file in user home is one process read away from compromise) AND forfeits a KeeperHub-surface judging point.

### Alternative 2: Coinbase agentic-wallet-skills
- Pros: Battle-tested CDP wallet.
- Cons: Requires paid Coinbase Developer Platform account per `docs.keeperhub.com/ai-tools/agentic-wallet` "Coinbase agentic wallet skills". Hard $0 violation.
- Rejected because: violates `docs/SCOPE.md`.

### Alternative 3: No wallet — use only the org wallet from `get_wallet_integration`
- Pros: Zero install steps. Aave V3 plugin write-actions already need this walletId anyway.
- Cons: No autonomous payment path. If any marketplace-listed workflow returns 402, the agent cannot pay and the call fails. Cannot demo x402 surface.
- Rejected because: loses "x402 / MPP" judging criterion credit.

## Open Questions — Resolved 2026-07-05

- **Non-interactive wallet install**: Use the documented env-var overrides — `KEEPERHUB_WALLET_ENV=demo`, `KEEPERHUB_WALLET_NONINTERACTIVE=1`. Documented at `docs.keeperhub.com/ai-tools/agentic-wallet` "Non-interactive mode". Script `scripts/setup-wallet.sh` will use these env vars so the demo laptop setup runs in <60s and is fully scripted for the Onboarding DX bounty.
- **Double-block on demo approvals**: Will not double-block. Order of evaluation is (1) native plugin → reads `safety.json` → if `0x095ea7b3` in `denied_selectors`, reject with local error; if not denied, forward; (2) Turnkey server enforces 100 USDC/transfer cap. During the demo we temporarily remove `0x095ea7b3` from `denied_selectors` via `scripts/unlock-approve.sh` for the single required approval tx, then `scripts/lock-approve.sh` re-adds it. Server-side cap not triggered because approve amount = exact repay amount (~5 USDC demo), well under 100 USDC.

## Checklist

- [x] Decision communicated
- [ ] README updated with `@keeperhub/wallet` install steps
- [ ] Tightened `safety.json` template stored at `scripts/safety.json.demo`
- [x] This ADR saved to `docs/adr/2026-07-05-adr-003-agentic-wallet-first-party.md`
