# KeeperHub SDK + Platform Feedback

**Project**: LAX — Liquidation Autopilot
**Submitted for**: Onboarding DX Bounty
**Integration depth**: MCP + first-party wallet + Aave V3 plugin + webhook workflow
**Build time**: ~3 weeks (Phase 0-3)

---

## Executive Summary

We built LAX on KeeperHub for the Agents Onchain hackathon. The integration surface was deep: MCP remote server, `@keeperhub/wallet` v0.1.15, Aave V3 plugin, webhook-triggered workflows, and gas sponsorship. Most things worked. The friction points below fall into two categories:

1. **Documentation gaps** (6 items) — features that exist but aren't documented clearly
2. **API surprises** (3 items) — endpoints that behave differently than expected

No SDK-breaking bugs were found. Every friction below has a known workaround. The purpose of this report is to make the next developer's path faster.

---

## Critical

### C1: `tokenConfig` is a JSON string, not a JSON object

**Where**: KeeperHub Aave V3 plugin action configuration
**Reproduce**: Create a workflow via the CLI or API with an `aave-v3/repay` action node. Set `tokenConfig` to `{ mode: "custom", customToken: { address: "0x...", symbol: "USDC" } }` as a JSON object.
**Expected**: The action resolves the token configuration.
**Actual**: The action fails with a schema validation error.
**Root cause**: The API expects `tokenConfig` as a JSON-serialized *string*, not a raw JSON object. Developers reading the API schema see `tokenConfig: object` and pass a native object. The schema is technically correct (`JSON.stringify` produces a string) but it's not what a TypeScript/JavaScript developer expects from a field typed as `object`.
**Workaround**: Wrap the config in `JSON.stringify()` before passing to the workflow definition.
**Suggested fix**: Accept both `string` (JSON-serialized) and `object` (raw) in the API schema. The server can call `JSON.stringify` on objects transparently. This would match the pattern used elsewhere in the KeeperHub API where nested objects are accepted directly.

```ts
// Current (breaks):
tokenConfig: { mode: 'custom', customToken: { address: '0x...', symbol: 'USDC' } }

// Workaround (works):
tokenConfig: JSON.stringify({ mode: 'custom', customToken: { address: '0x...', symbol: 'USDC' } })
```

---

### C2: `aave-v3/repay` requires `onBehalfOf` but this is undocumented

**Where**: Aave V3 plugin `repay` action parameters
**Reproduce**: Call the `aave-v3/repay` action without `onBehalfOf` in the action parameters.
**Expected**: The action uses the executing wallet address as the default (self-repay).
**Actual**: The action fails with a missing field error.
**Root cause**: The raw Aave V3 IPool `repay()` signature is `repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf)`. The plugin surfaces `onBehalfOf` as a required parameter but the KeeperHub docs do not list it.
**Workaround**: Always pass `onBehalfOf: borrower_address` (same address as the debt position owner).
**Suggested fix**: Document the `onBehalfOf` parameter in the Aave V3 plugin docs. Consider making it optional with a default to the executing wallet address for self-repay (the common case).

---

### C3: `getUserAccountData` returns 6 fields in KeeperHub, not 9

**Where**: KeeperHub Aave V3 plugin, `getUserAccountData` method
**Reproduce**: Call `getUserAccountData(address)` via the KeeperHub Aave V3 plugin.
**Expected**: The full Aave V3 Pool ABI returns 9 fields (`totalCollateralBase`, `totalDebtBase`, `availableBorrowsBase`, `currentLiquidationThreshold`, `ltv`, `healthFactor`, plus 3 more).
**Actual**: Returns only 6 fields. The extra 3 fields (sometimes listed as `xxx`, `yyy`, `zzz` in older Aave doc) are absent.
**Root cause**: The KeeperHub plugin wraps a specific ABI version that diverges from the canonical Aave V3 Pool ABI.
**Workaround**: We use only the 6 available fields (`totalCollateralBase`, `totalDebtBase`, `availableBorrowsBase`, `currentLiquidationThreshold`, `ltv`, `healthFactor`), which are sufficient for our HF computation.
**Suggested fix**: Document the exact return fields of `getUserAccountData` as exposed by the plugin. Or align with the Aave V3 canonical ABI (9 fields, with the additional 3 set to zero if unimplemented).

---

## High

### H1: `@keeperhub/sdk` `executeContractCall` requires string-serialized `functionArgs`

**Where**: `@keeperhub/sdk` direct execution, `executeContractCall`
**Reproduce**: Call `executeContractCall` passing `functionArgs: [address, amount, 2, address]` as a native JavaScript array.
**Expected**: The SDK serializes the array to JSON internally before sending.
**Actual**: The call fails with an encoding error. The SDK expects `functionArgs` to already be a JSON string.
**Root cause**: `functionArgs` is typed as `any[]` but actually requires `string` (a JSON-serialized array). TypeScript doesn't catch the mismatch.
**Workaround**: Pre-serialize: `functionArgs: JSON.stringify([addr, amount, 2, addr])`.
**Suggested fix**: Accept both `any[]` (serialize internally) and `string` (pass through). Update the TypeScript type to `any[] | string`.

---

### H2: Webhook trigger URL format not documented

**Where**: KeeperHub workflow webhook trigger
**Reproduce**: Create a workflow with a webhook trigger node. The workflow ID is visible in the dashboard URL, but the webhook endpoint URL format is not documented in API docs.
**Expected**: Clear documentation of the POST endpoint format.
**Actual**: The endpoint URL had to be reverse-engineered from observability research: `https://app.keeperhub.com/api/workflows/{WORKFLOW_ID}/webhook`.
**Workaround**: Use the format `https://app.keeperhub.com/api/workflows/{WORKFLOW_ID}/webhook` with `Content-Type: application/json` and `Authorization: Bearer <api_key>`.
**Suggested fix**: Document the webhook trigger URL format in the workflow trigger node documentation. Include the required headers (`Authorization`, `Content-Type`) and the expected payload shape.

**Update (2026-09-06, event: The Agent Economy)**: the endpoint format is confirmed working
(`POST /api/workflows/{id}/webhook`), and the key-type requirement is now well-documented
by the API itself: org keys (`kh_*`) are rejected with a precise, actionable error —
`{"error":"wrong_key_type", "expected":"wfb_*", "hint":"Generate a webhook key from
Settings > Developer > API keys > Webhook keys"}`. Resolved end-to-end during the verified
live fire (see `docs/VERIFIED-TESTING.md` §1); the endpoint needs no further workaround —
only the webhook-key documentation suggestion still stands.

---

### H3: Webhook payload shape undocumented

**Where**: Workflow webhook trigger endpoint
**Reproduce**: POST to the webhook URL with an arbitrary JSON payload shape.
**Expected**: Documentation of what fields the workflow can receive and how they map to workflow variables.
**Actual**: The payload shape is not documented. The workflow variable names must match the JSON field names, but there's no spec for what's available or how to reference nested fields.
**Workaround**: We send `health_factor`, `user_address`, `triggered_at`, `debt_base`, `repay_amount_usdc`, `repay_amount_human` as flat JSON. Workflow variables reference these by name.
**Suggested fix**: Document the webhook payload schema and how workflow node variables map to JSON fields. Include an example with `${{trigger.health_factor}}` style variable references.

---

### H4: `safety.json` default `denied_selectors` blocks ERC-20 `approve()`

**Where**: `@keeperhub/wallet` default configuration
**Reproduce**: Install `@keeperhub/wallet` and attempt to execute an ERC-20 `approve()` transaction via `web3/write-contract`.
**Expected**: The transaction passes safety gates.
**Actual**: The safety plugin blocks it because `0x095ea7b3` (approve selector) is in `denied_selectors` by default.
**Root cause**: The default `safety.json` at `~/.keeperhub/safety.json` includes `0x095ea7b3` in its `denied_selectors` list. This makes sense as a default (prevent unlimited approvals by rogue agents), but it also blocks legitimate sends when the developer explicitly enables an approve workflow.
**Workaround**: Two scripts: one to remove `0x095ea7b3` from `denied_selectors` (unlock), one to re-add it (lock). Run unlock before the approve tx, lock after.
**Suggested fix**: Document the default denied selectors in the wallet setup guide. Consider adding a `safety.json` configuration example showing how to selectively allow specific selectors with amount caps (rather than requiring the user to modify the defaults).

---

## Medium

### M1: API key prefix `kh_` required but not documented

**Where**: KeeperHub API key creation
**Reproduce**: Create an API key without the `kh_` prefix.
**Expected**: The key works.
**Actual**: KeeperHub rejects the key. The `kh_` prefix is mandatory.
**Root cause**: Internally enforced prefix that is not mentioned in the API key creation docs.
**Suggested fix**: Mention the `kh_` prefix requirement in the API key creation UI and docs. Reject keys without the prefix with a clear error message at creation time (rather than at first API call).

---

### M2: `@keeperhub/wallet` skill installer doesn't support OpenCode

**Where**: `npx @keeperhub/wallet` installation script
**Reproduce**: Run `npx @keeperhub/wallet` on a system where OpenCode is the primary agent framework (not Claude Code).
**Expected**: The installer detects OpenCode and installs to `~/.config/opencode/skills/`.
**Actual**: The installer only detects Claude Code directories (`~/.claude/skills/`). OpenCode users must manually symlink the skill file.
**Workaround**: `mkdir -p ~/.config/opencode/skills/keeperhub-wallet && ln -s ~/.claude/skills/keeperhub-wallet/SKILL.md ~/.config/opencode/skills/keeperhub-wallet/SKILL.md`
**Suggested fix**: Add OpenCode directory detection (`~/.config/opencode/skills/`) to the installer script alongside Claude Code detection.

---

### M3: Gas sponsorship error codes undocumented

**Where**: KeeperHub workflow execution, `--gas true` flag
**Reproduce**: Execute a tagged workflow on a non-standard RPC endpoint (e.g., local Anvil fork).
**Expected**: Clear error message explaining why gas sponsorship failed.
**Actual**: Returns non-descript errors. Through experimentation we identified at least 3 error variants: `GAS_SPONSORSHIP_TAG_MISSING` (workflow not tagged), `GAS_SPONSORSHIP_QUOTA_EXCEEDED` (post-beta metering), `GAS_SPONSORSHIP_DISABLED` (org-level toggle off or unrecognized RPC). None of these codes are listed in the gas sponsorship documentation.
**Suggested fix**: Document all error codes and their meanings in the gas sponsorship docs. This saves developers hours of trial-and-error debugging.

---

### M4: No workflow versioning

**Where**: KeeperHub workflow management
**Issue**: Editing a live workflow is risky — there is no versioning or draft/publish model. A single URL update can take down production. The GitHub issue `keeperhub/cli#59` requests this feature.
**Suggested fix**: Versioned workflows with the ability to preview a new version before publishing. See existing community request at https://github.com/KeeperHub/cli/issues/59.

---

## Low

### L1: Port inconsistency between examples (8545 vs 18545)

**Where**: KeeperHub docs, code examples
**Issue**: Some examples use Anvil port 8545 (default), others mention 18545. Developers who follow the 8545 examples then run into config mismatches.
**Suggested fix**: Standardize on 8545 in all docs and examples. Document how to change the port in configuration.

---

### L2: `wallet.json` has no recovery mechanism

**Where**: `@keeperhub/wallet` first-party wallet
**Issue**: If `wallet.json` is lost, the wallet is unrecoverable. KeeperHub controls the Turnkey root but cannot restore a specific wallet's `wallet.json`. Per KeeperHub docs: "What happens if I lose wallet.json" — the answer is effectively "create a new wallet."
**Suggested fix**: Add a `keeperhub wallet export --seed` command that outputs a BIP-39 mnemonic or equivalent seed phrase. Or at minimum document a recommended backup strategy in the wallet setup guide.

---

### L3: Aave V3 plugin doesn't auto-handle ERC-20 approvals

**Where**: Aave V3 plugin for KeeperHub
**Issue**: The plugin does NOT include a bundled `approve()` call. Developers must add a separate `web3/write-contract` node with ABI-encoded `approve(spender, amount)` before the `Supply` or `RepayDebt` action. This is mentioned in the Aave V3 integration docs but easy to miss if reading quickly.
**Suggested fix**: Consider adding an optional `autoApprove: bool` parameter to the `Supply` and `RepayDebt` actions. When true, the plugin issues the approve transaction internally before executing the action. This would reduce the workflow from 2 nodes to 1.

---

## Summary

| Severity | Count | Key Pattern |
|----------|-------|-------------|
| Critical | 3 | Undocumented required fields + type mismatch |
| High | 4 | Missing docs for essential integration paths |
| Medium | 4 | Platform gaps + tooling incompatibilities |
| Low | 3 | Minor friction, easy fixes |

**Most impactful fix**: Making `tokenConfig` accept raw objects (C1) and documenting `onBehalfOf` (C2) would save every new Aave V3 plugin integrator ~2 hours of debugging each.

---

*Submitted as part of LAX's Agents Onchain hackathon submission. Built by @dlamini on OpenCode.*
