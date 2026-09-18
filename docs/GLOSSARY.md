# Understanding LAX: Every Term Explained

If terms like *health factor*, *WETH*, or *liquidation* are new to you, start
here. By the end you'll understand not just the vocabulary but *why LAX does
what it does*, and why defending a position before a crash beats racing bots
after one.

Nothing here assumes prior DeFi knowledge. Each term links to where it appears
in the CLI, so you can connect words to what you see on screen.

---

## Part 1: The setting

### Blockchain
A shared database that thousands of computers maintain together, where every
change is a **transaction** with a unique hash (like `0x918441fc…`). Once
included, a transaction is permanent and publicly verifiable, that's why LAX
can *prove* what it did with links to `basescan.org`.

### DeFi (decentralized finance)
Financial services, lending, borrowing, trading, running as open programs on
a blockchain instead of inside a bank. No office hours, no loan officer: the
rules are code, and anyone can inspect them.

### Aave
The largest DeFi lending protocol, live on many blockchains including **Base**
(an Ethereum network built by Coinbase). In Aave you can deposit tokens to earn
yield, and borrow against them. LAX is built directly on Aave's Pool contract, not a wrapper, not a simulation. When LAX defends you, it calls the *same
`repay()` function* you would call from the Aave app.

### Wallet
Your account on the blockchain. It holds funds and signs transactions. LAX uses
an **agentic wallet**, a wallet whose keys are held by Turnkey (a professional
custody service) and used only through rules you control. LAX never touches a
private key; it asks KeeperHub, and KeeperHub signs. That's auditable by
design.

---

## Part 2: Borrowing, the mechanics

### Supplying (depositing collateral)
You deposit tokens into Aave to use as security for a loan. Typical example:
deposit WETH worth $1,500.

### USDC
A **stablecoin**, a token designed to always be worth $1 (issued by Circle,
redeemable for real dollars). Borrowing in USDC means your *debt* doesn't swing
around with the market; only your collateral's value does.

### WETH
"Wrapped ETH." Ethereum's native token (ETH) predates the modern token
standard, so protocols wrap it 1:1 into an ERC-20 token. WETH, that
everything else can handle uniformly. 1 WETH = 1 ETH in value; on Base its
price is whatever ETH trades at (~$3,300 at the time of this demo). When your
collateral is WETH and ETH's price falls, your collateral is worth less, that's the scenario LAX defends against.

### Borrowing (taking on debt)
Against your $1,500 of collateral, Aave lets you borrow, say, **$1,000 USDC**.
You now have collateral on one side and debt on the other, and you pay interest
on the debt.

### Why borrow at all?
Common reasons: accessing cash without selling your tokens (and without a tax
event in many jurisdictions), leveraged positions, or short-term liquidity.
Millions of positions like this exist right now on Aave.

---

## Part 3: Risk: how loans can blow up

### Oracle (price feed)
Aave doesn't guess token prices, it reads them from **oracles**, which publish
market prices on-chain (the mock/real Chainlink feeds). When the market moves,
the oracle updates, and *that update* is what changes your risk in an instant.

### Health factor (HF): the number everything revolves around
Aave compresses your whole position into one number:

> **HF ≈ (collateral value × liquidation threshold) ÷ debt**

(see *liquidation threshold* just below for the extra factor). Intuition:

- **HF = 2.0** → your collateral is double what's needed. Calm.
- **HF = 1.2** → comfortable, but a market dip moves you fast.
- **HF = 1.0** → your collateral exactly covers the debt. *This is the cliff.*
- **HF < 1.0** → underwater. Anyone can close your position (see next term).

A worked example, with Aave's WETH liquidation threshold of ~0.80 on Base:
deposit $1,500 of WETH, borrow $1,000 USDC →
HF = (1,500 × 0.80) / 1,000 = **1.20**. If WETH drops 25%, collateral is worth
$1,125 → HF = (1,125 × 0.80) / 1,000 = **0.90**, below 1.0. That's a
liquidation, and it can happen in the same block the price moved.

The LAX CLI renders your HF as a gauge between 0.8 and 2.0, with the danger
zones marked:

```
HF 1.0978  SAFE — LAX ARMED ZONE
   ████████▮────────────────
   0.8        1.00      1.05      2.0
   (red)     liquidation          (green)
```

### Liquidation
If your HF hits 1.0, **anyone**, usually automated bots, can repay part of
your debt and take an equivalent chunk of your collateral *at a discount*
(typically ~5%). It's their profit; it's your loss. Liquidations aren't
punishment, they're how Aave protects depositors, but for the borrower they're
the single worst outcome.

### MEV bots and Flashblocks
**MEV** (maximal extractable value) is profit from being first to act on
public blockchain information. Liquidation bots monitor oracle updates and can
submit liquidation transactions in the same block the price changes, on Base,
Flashblocks shorten block times, reducing the window for manual intervention.
A reactive alert at HF 1.0 leaves little time to act. This is why LAX acts
proactively at HF 1.05.

### Liquidation threshold
The safety margin Aave applies per collateral type, how much borrowing power
$1 of collateral gives you. WETH on Base ≈ 0.80: $1 of WETH backs at most $0.80
of debt. Higher thresholds = safer collateral. It's the "×0.80" in the HF
formula.

---

## Part 4: What LAX does about it

### Proactive, not reactive
Bots can act when HF ≤ 1.0. LAX is configured to act at HF 1.05, before the
position becomes liquidatable, so the repair is submitted before liquidation
is profitable.

### The trigger and the target
LAX's defaults: **trigger at HF 1.05**, **restore to HF 1.10**. Both are
configurable (`lax threshold`, `lax target`).

### The exact-repay math
How much debt to repay to go from HF 1.05 to HF 1.10? Not a guess, a
closed-form formula from Aave's own accounting:

> **repay = debt × (1 − HF_current / HF_target)**

Worked: debt $1,000, HF 1.05, target 1.10 → repay = 1,000 × (1 − 1.05/1.10) =
**$45.45 USDC**. Too much repayment wastes your money; too little leaves you
exposed. LAX computes this *at fire time* from the live position, and adds a
1% buffer for interest accruing between trigger and execution.

### The mitigation gate
Before anything moves, four independent checks must pass:

1. **HF math verification**, the computed amount provably reaches the target
2. **Pre-flight simulation**, the exact approve + repay is *rehearsed* against
   the chain via `eth_call`; if it would revert, nothing fires
3. **Safety bounds**, only known-safe contract calls are allowed
4. **Spend caps**, hard limits per transaction and per day, persisted across
   restarts

A blocked fire is a *success* of this system. You can replay any decision with
`lax explain`.

### KeeperHub
The automation platform LAX runs on. LAX computes *when* and *how much*;
KeeperHub executes deterministically, read HF → approve → repay → verify, through the workflow, with a full **audit trail** at
the workflow's runs page (`app.keeperhub.com/workflows/<workflow-id>`, where each execution ID is listed) you can open and inspect.

### Webhook
How LAX tells KeeperHub "execute now": an authenticated HTTP POST carrying the
computed repay amount, HMAC-signed so it cannot be forged.

### Why defending early is cheaper
Here's the arithmetic that justifies the whole project (try `lax whatif` to see
it for your live position):

| | Defend at HF 1.05 (before crash) | Defend at HF 0.95 (after crash) |
|---|---|---|
| Debt | $1,000 | $1,000 |
| HF target | 1.10 | 1.10 |
| Repay needed | debt × (1 − 1.05/1.10) = **$45.45** | debt × (1 − 0.95/1.10) = **$136.36** |

Three times the capital for the same safety, if you get the chance at all,
because below 1.0 the bots get there first.

---

## Part 5: Reading LAX output, translated

```console
$ lax whatif --shock 25
  HF now:       1.0978   ← your position today
  HF shocked:   0.8234   ← if WETH drops 25% right now: LIQUIDATABLE
  REPAY debt:   $0.95 today → $120.72 after the shock
                (defending early saves $119.76)
  SUPPLY col.:  $161.25   ← the alternative: deposit more collateral instead
  Comparator:   recommends REPAY
```

- **REPAY**, pay down debt with USDC (cheaper, if you hold USDC)
- **SUPPLY**, add collateral (uses more capital up front; the comparison
  assumes a liquidation threshold, shown as `LT 0.8`)
- **`lax runs`**, your permanent decision log; **`lax explain`**, the "why"
  behind any single decision, stage by stage.

---

## Quick reference

| Term | One-line definition |
|------|---------------------|
| Collateral | What you deposited as security |
| Debt | What you borrowed |
| HF | (collateral × threshold) ÷ debt: 1.0 is the liquidation cliff |
| Liquidation | Bots repay your debt and take discounted collateral when HF ≤ 1.0 |
| MEV / bots | Automated traders competing to be first on public information |
| Oracle | The on-chain price feed Aave reads |
| WETH | Wrapped ETH: ETH as a standard token; your volatile collateral |
| USDC | Dollar stablecoin: your (stable) debt |
| Trigger / target | Where LAX acts (1.05) / where it restores you (1.10) |
| The gate | Four checks that must all pass before anything fires |
| KeeperHub | The platform that executes mitigations, with an audit trail |
| Dry-run | The whole pipeline except the part that moves money |

---

*Ready to see it live? `lax demo` plays the entire crash-and-rescue story in
one command (dry-run by default). Then [docs/CLI-GUIDE.md](CLI-GUIDE.md) is the
complete manual.*
