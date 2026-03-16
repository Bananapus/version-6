# User Journeys

How to use Juicebox V6. Three paths, one protocol.

## Start a Project

### Path 1: Revnet (recommended for most projects)

Use `REVDeployer.deployFor()`. A revnet is an autonomous project with predetermined economics — no owner key needed after launch. The deployer bundles everything: staged issuance, bonding curve, buyback hook, cross-chain bridging, and optional NFT tiers.

**What you configure:**
- **Stages** — Each stage sets an issuance rate, decay schedule, cash-out tax, and operator splits. Stages activate at predetermined timestamps and are immutable once deployed.
- **Terminals** — Which tokens your project accepts (ETH, USDC, etc.).
- **Operator** — A single address (usually a multisig) that can adjust splits, NFT tiers, and sucker mappings after deployment.
- **NFT tiers** (optional) — Tiered NFT rewards minted on payment.
- **Suckers** (optional) — Cross-chain token bridges. Set a deterministic salt to deploy suckers; leave it zero to skip.

**What the deployer handles for you:**
- Creates the project and queues all stage rulesets
- Deploys an ERC-20 token
- Sets up buyback hook pools for each accepted token
- Deploys a 721 hook (even if no tiers — enables adding them later)
- Configures cross-chain suckers if requested
- Stores a config hash so future sucker deployments stay consistent

**Result:** An autonomous project with no owner key. Economics are locked at deploy time. The operator can adjust splits and tiers within the bounds each stage allows, but cannot change issuance rates, tax rates, or stage timing.

**Entry point:** `REVDeployer.deployFor(revnetId, configuration, terminalConfigurations, suckerDeploymentConfiguration)`

See [revnet-core-v6/USER_JOURNEYS.md](./revnet-core-v6/USER_JOURNEYS.md) for full parameter reference.

---

### Path 2: Omnichain Project (for custom hook compositions)

Use `JBOmnichainDeployer.launchProjectFor()`. This is for projects that need custom data hooks (beyond what revnets offer) while still getting 721 tiers and cross-chain bridging out of the box.

**What you configure:**
- **Owner** — The final project owner (receives the project NFT).
- **Rulesets** — Standard Juicebox rulesets with full control over weight, duration, tax rate, and custom data hooks.
- **Terminals** — Which tokens your project accepts.
- **721 tiers** (optional) — NFT rewards with per-tier pricing, supply caps, and categories.
- **Custom data hooks** (optional) — Specify a buyback hook or any custom data hook per ruleset. The deployer wraps it so the 721 hook and suckers still work.
- **Suckers** (optional) — Cross-chain bridges.

**What the deployer handles for you:**
- Deploys a 721 hook and wires it as the project's data hook
- Wraps your custom data hooks so they compose with the 721 hook and suckers
- Deploys suckers if configured
- Transfers hook and project ownership to the final owner

**Key difference from revnets:** You control the rulesets directly. The project owner can queue new rulesets, change economics, and reconfigure terminals. More power, more responsibility.

**Entry point:** `JBOmnichainDeployer.launchProjectFor(owner, projectUri, rulesetConfigurations, terminalConfigurations, memo, suckerDeploymentConfiguration, controller)`

See [nana-omnichain-deployers-v6/USER_JOURNEYS.md](./nana-omnichain-deployers-v6/USER_JOURNEYS.md) for full parameter reference.

---

### Path 3: Direct Controller (for full control)

Use `JBController.launchProjectFor()`. This is the raw protocol — no bundled hooks, no suckers, no deployer magic. You wire everything yourself.

**What you configure:**
- **Owner** — Receives the project NFT.
- **Rulesets** — Complete control over every parameter.
- **Terminals** — Which tokens to accept.

**What you handle yourself:**
- Deploying and configuring data hooks
- Deploying and configuring pay/cashout hooks
- Setting up 721 tiers (via `JB721TiersHookProjectDeployer`)
- Cross-chain bridging (via `JBSuckerRegistry`)
- Buyback hook registration (via `JBBuybackHookRegistry`)
- ERC-20 token deployment

**When to use this:** When you need hook compositions that no deployer supports, when you're building a custom deployer, or when you want to understand exactly what's happening at every step.

**Entry point:** `JBController.launchProjectFor(owner, projectUri, rulesetConfigurations, terminalConfigurations, memo)`

See [nana-core-v6/USER_JOURNEYS.md](./nana-core-v6/USER_JOURNEYS.md) for full parameter reference.

---

## After Launch

### Pay a Project

Send funds to any project via its terminal:

```
JBMultiTerminal.pay(projectId, token, amount, beneficiary, minReturnedTokens, memo, metadata)
```

The terminal records the payment, mints project tokens to the beneficiary (at the current ruleset's weight), and executes any pay hooks (NFT minting, buyback swaps). If the project uses a router terminal, you can pay with any token — it swaps to the project's accepted token automatically.

### Cash Out

Burn project tokens to reclaim a share of the surplus:

```
JBMultiTerminal.cashOutTokensOf(holder, projectId, cashOutCount, token, minTokensReclaimed, beneficiary, metadata)
```

The amount returned follows the bonding curve: `surplus * (count/supply) * [(1-tax) + tax*(count/supply)]`. Higher tax = steeper curve = more penalty for partial cash outs. Tax of 0 = linear (proportional share). Tax of 100% = no cash outs.

Always set `minTokensReclaimed` to protect against slippage.

### Borrow Against Tokens (revnets only)

Lock project tokens as collateral and borrow their bonding curve value:

```
REVLoans.borrowFrom(revnetId, terminal, token, amount, collateral, beneficiary, prepaidFeePercent)
```

Loans are 100% LTV against current bonding curve value. The collateral gradually unlocks over 10 years (linear liquidation). Borrowing is more capital-efficient than cashing out when the cash-out tax exceeds ~39%.

### Bridge Tokens Cross-Chain

Move project tokens between chains via suckers:

```
JBSucker.prepare(amount, beneficiary, minTokensReclaimed, token)  // source chain
JBSucker.claim(proof)                                              // destination chain
```

Tokens are cashed out on the source chain (inserted into an outbox merkle tree), the tree root is bridged via the chain's native messenger (OP, Arbitrum, CCIP), and tokens are minted on the destination chain after merkle proof verification.

### Distribute Payouts

Send funds to configured split recipients:

```
JBMultiTerminal.sendPayoutsOf(projectId, token, amount, currency, minTokensPaidOut)
```

Bounded by the ruleset's payout limit. Funds go to splits (addresses, other projects, or hooks). A 2.5% fee goes to project #1.

### Queue New Rulesets (owner-controlled projects only)

```
JBController.queueRulesetsOf(projectId, rulesetConfigurations, memo)
```

Queue future rulesets to change economics. Takes effect when the current ruleset expires (or immediately if `duration = 0`). If an approval hook is set, it must approve the transition. Revnets cannot queue rulesets — their stages are immutable.

---

## Which Path Should I Choose?

| I want... | Use |
|-----------|-----|
| An autonomous project with locked economics | **Revnet** — no owner key, predetermined stages |
| A project I can reconfigure over time | **Omnichain Deployer** — owner controls rulesets |
| NFT tiers + cross-chain + buyback out of the box | **Revnet** or **Omnichain Deployer** — both bundle these |
| Full control over every hook and parameter | **Direct Controller** — wire it all yourself |
| A simple NFT collection with community publishing | **CTDeployer** (Croptop) — built on top of omnichain deployer |
| A prediction game with governance | **DefifaDeployer** — built on top of 721 hook |
