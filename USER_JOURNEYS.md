# User Journeys

How to use Juicebox V6. Three paths, one protocol.

## Start a Project

### Path 1: Omnichain Project

Use `JBOmnichainDeployer.launchProjectFor()`. This deployer bundles 721 tiers, cross-chain bridging, and custom data hooks into a single call. The project owner retains full control over rulesets after launch.

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

**Result:** The project owner can queue new rulesets, change economics, and reconfigure terminals. More power, more responsibility.

**Entry point:** `JBOmnichainDeployer.launchProjectFor(owner, projectUri, rulesetConfigurations, terminalConfigurations, memo, suckerDeploymentConfiguration, controller)`

See [nana-omnichain-deployers-v6/USER_JOURNEYS.md](./nana-omnichain-deployers-v6/USER_JOURNEYS.md) for full parameter reference.

---

### Path 2: Revnet (autonomous economics)

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

**Parameters**:
- `projectId` — The project to pay.
- `token` — Token address (`JBConstants.NATIVE_TOKEN` for ETH). Must be registered in the terminal's accounting contexts.
- `amount` — Amount of tokens. Ignored for native token (uses `msg.value`).
- `beneficiary` — Address to receive minted project tokens.
- `minReturnedTokens` — Slippage protection; reverts if fewer tokens minted.
- `memo` — Arbitrary string emitted in the event.
- `metadata` — Variable-length key-value payload encoded via `JBMetadataResolver`. Common uses: Permit2 approval data (gasless ERC-20 payments), buyback hook quotes (TWAP tick, pool selection), 721 tier IDs to mint, and custom data hook payloads.

The terminal records the payment, mints project tokens to the beneficiary (at the current ruleset's weight), and executes any pay hooks (NFT minting, buyback swaps). If the project uses a router terminal, you can pay with any token — it swaps to the project's accepted token automatically.

**Edge cases**:
- Reverts with `JBTerminalStore_RulesetPaymentPaused` if the current ruleset has `pausePay` enabled.
- Reverts with `JBMultiTerminal_UnderMinReturnedTokens` if minted tokens < `minReturnedTokens`.
- Reverts with `JBMultiTerminal_TokenNotAccepted` if the token is not registered on the terminal.
- Reverts with `JBMultiTerminal_NoMsgValueAllowed` if `msg.value > 0` for an ERC-20 payment.
- `amount = 0` is valid — records a zero payment, mints 0 tokens.
- If the ruleset's `weight = 0`, no tokens are minted (payment still recorded).
- A data hook can override the weight to 0, suppressing minting while still recording the payment.
- Fee-on-transfer tokens: the terminal measures actual amount received via balance diff, not the `amount` parameter.

**Preview**: Call `JBTerminalStore.previewPayFrom(terminal, payer, amount, projectId, beneficiary, metadata)` to simulate the full payment on-chain — including data hook effects on weight and hook specifications. This is a `view` function that does not modify state.

---

### Cash Out

Burn project tokens to reclaim a share of the surplus:

```
JBMultiTerminal.cashOutTokensOf(holder, projectId, cashOutCount, tokenToReclaim, minTokensReclaimed, beneficiary, metadata)
```

**Parameters**:
- `holder` — Address whose tokens are being cashed out.
- `projectId` — The project to cash out from.
- `cashOutCount` — Number of project tokens to burn (18 decimals).
- `tokenToReclaim` — Terminal token to receive back.
- `minTokensReclaimed` — Slippage protection; always set this.
- `beneficiary` — Address to receive reclaimed tokens.
- `metadata` — Hook-specific data.

**Who can call**: The token holder, or an address with the holder's `CASH_OUT_TOKENS` permission.

The amount returned follows the bonding curve: `surplus * (count/supply) * [(1-tax) + tax*(count/supply)]`. Higher tax = steeper curve = more penalty for partial cash outs. Tax of 0 = linear (proportional share). Tax of 100% = no cash outs. A 2.5% fee is taken on the reclaimed amount (unless the beneficiary is feeless).

**Edge cases**:
- Reverts with `JBMultiTerminal_UnderMinTokensReclaimed` if `reclaimAmount < minTokensReclaimed`.
- Reverts with `JBTerminalStore_InsufficientTokens` if `cashOutCount > totalSupply`.
- If `cashOutCount = 0` and `totalSupply = 0`, the entire surplus is returned (known behavior, documented as C-5).
- Pending reserved tokens inflate `totalSupply`, reducing cashout value — in extreme cases by 50%+. Call `sendReservedTokensToSplitsOf` first to settle pending reserves.
- When `cashOutTaxRate = 0`, the fee applies only up to the project's unconsumed fee-free surplus from intra-terminal payouts — once depleted, cashouts are fee-free.
- Credits are burned first, then ERC-20 tokens.
- A data hook can override `cashOutTaxRate`, `cashOutCount`, and `totalSupply`, giving it full control over bonding curve economics.

**Preview**: Call `JBTerminalStore.previewCashOutFrom(terminal, holder, projectId, cashOutCount, tokenToReclaim, beneficiaryIsFeeless, metadata)` to simulate the full cash out on-chain — including data hook effects on tax rate, supply, and hook specifications. This is a `view` function that does not modify state. For a simpler estimate without data hook effects, use `currentTotalReclaimableSurplusOf(projectId, cashOutCount, decimals, currency)`.

---

### Borrow Against Tokens (revnets only)

Lock project tokens as collateral and borrow their bonding curve value:

```
REVLoans.borrowFrom(revnetId, source, minBorrowAmount, collateralCount, beneficiary, prepaidFeePercent)
```

**Parameters**:
- `revnetId` — The revnet project ID.
- `source` — A `REVLoanSource` struct specifying the terminal and token to borrow against.
- `minBorrowAmount` — Minimum amount to receive; reverts if the bonding curve value is lower.
- `collateralCount` — Number of project tokens to lock as collateral.
- `beneficiary` — Address to receive borrowed funds.
- `prepaidFeePercent` — Upfront fee (between `MIN_PREPAID_FEE_PERCENT` and `MAX_PREPAID_FEE_PERCENT`). Higher prepaid fee = lower ongoing cost.

Loans are 100% LTV against current bonding curve value. The collateral gradually unlocks over 10 years (linear liquidation). Borrowing is more capital-efficient than cashing out when the cash-out tax exceeds ~39%.

**Edge cases**:
- Reverts with `REVLoans_ZeroCollateralLoanIsInvalid` if `collateralCount = 0`.
- Reverts with `REVLoans_InvalidTerminal` if the source terminal is not registered for the revnet.
- Reverts with `REVLoans_InvalidPrepaidFeePercent` if the prepaid fee is outside the allowed range.
- Reverts with `REVLoans_ZeroBorrowAmount` if the bonding curve value rounds to 0.
- Reverts with `REVLoans_UnderMinBorrowAmount` if the computed borrow amount < `minBorrowAmount`.
- Expired loans (past the 10-year liquidation window) can be liquidated by anyone via `liquidateExpiredLoansFrom`, permanently destroying the remaining collateral.

---

### Bridge Tokens Cross-Chain

Move project tokens between chains via suckers. This is a three-step process:

```
JBSucker.prepare(projectTokenCount, beneficiary, minTokensReclaimed, token)  // 1. source chain: cash out + queue
JBSucker.toRemote(token)                                                     // 2. source chain: bridge root
JBSucker.claim(claimData)                                                    // 3. destination chain: mint
```

**Parameters** (prepare):
- `projectTokenCount` — Number of project tokens to cash out.
- `beneficiary` — Destination chain recipient (`bytes32` for cross-VM compatibility, e.g. Solana).
- `minTokensReclaimed` — Slippage protection on the source-chain cash out.
- `token` — Terminal token to cash out into (must be mapped to a remote token).

Tokens are cashed out on the source chain (inserted into an outbox merkle tree), the tree root is bridged via the chain's native messenger (OP, Arbitrum, CCIP), and tokens are minted on the destination chain after merkle proof verification.

**Edge cases**:
- Reverts with `JBSucker_ZeroBeneficiary` if `beneficiary` is `bytes32(0)`.
- Reverts with `JBSucker_TokenNotMapped` if the token has no remote mapping configured.
- Reverts with `JBSucker_Deprecated` if the sucker has been deprecated.
- Reverts with `JBSucker_LeafAlreadyExecuted` if a claim proof is replayed.
- Reverts with `JBSucker_ZeroERC20Token` if the project has no ERC-20 token deployed.
- Amounts are capped at `uint128` for cross-VM (Solana) compatibility.
- Token mappings are immutable once the outbox tree has entries — can only be disabled, not remapped.

---

### Distribute Payouts

Send funds to configured split recipients:

```
JBMultiTerminal.sendPayoutsOf(projectId, token, amount, currency, minTokensPaidOut)
```

**Parameters**:
- `projectId` — The project distributing funds.
- `token` — Terminal token to distribute.
- `amount` — Amount to distribute (denominated in `currency`). Must not exceed the ruleset's payout limit.
- `currency` — Currency the `amount` is denominated in. Converted to the token's currency via `JBPrices` if different.
- `minTokensPaidOut` — Slippage protection on the total amount distributed.

Bounded by the ruleset's payout limit. Funds go to splits (addresses, other projects, or hooks). A 2.5% fee goes to project #1. Leftover (amount not covered by splits) goes to the project owner.

**Edge cases**:
- Reverts with `JBTerminalStore_InadequateControllerPayoutLimit` if `amount` exceeds the remaining payout limit for this cycle. The terminal does NOT auto-cap to the limit — it reverts.
- Reverts with `JBTerminalStore_InadequateTerminalStoreBalance` if the project's balance is insufficient.
- Reverts with `JBMultiTerminal_UnderMinTokensPaidOut` if the distributed amount < `minTokensPaidOut`.
- Empty `fundAccessLimitGroups` in the ruleset means zero payouts (NOT unlimited). Use `type(uint224).max` for an unlimited payout limit.
- Split hook failures are caught via try-catch — the failed amount is returned to the project's balance and can be retried.
- Price feed reverts (stale Chainlink data, sequencer down) will cause the entire payout to revert if the `currency` differs from the token's currency.

---

### Queue New Rulesets (owner-controlled projects only)

```
JBController.queueRulesetsOf(projectId, rulesetConfigurations, memo)
```

**Parameters**:
- `projectId` — The project to queue rulesets for.
- `rulesetConfigurations` — Array of `JBRulesetConfig` structs. Each defines weight, duration, tax rate, splits, fund access limits, and metadata.
- `memo` — Arbitrary string emitted in the event.

Queue future rulesets to change economics. Takes effect when the current ruleset expires (or immediately if `duration = 0`). If an approval hook is set, it must approve the transition. Revnets cannot queue rulesets — their stages are immutable.

**Edge cases**:
- Reverts with `JBController_RulesetsArrayEmpty` if `rulesetConfigurations` is empty.
- Reverts with `JBPermissions_Unauthorized` if the caller is not the project owner and lacks the `QUEUE_RULESETS` permission.
- If an approval hook rejects the queued ruleset, the protocol falls back to the `basedOnId` chain, simulating cycling from the last approved ruleset.
- A ruleset with `duration = 0` never expires and must be explicitly replaced by queuing a new one.
- Do not queue multiple identical rulesets — a ruleset with a duration auto-cycles. Queuing duplicates creates unnecessary linked-list entries.
- `weight = 1` means "inherit decayed weight from the previous ruleset." `weight = 0` means "no issuance."
- If a ruleset's `weightCutPercent` causes more than 20,000 weight-decay iterations to derive the current weight, the transaction reverts with `JBRulesets_WeightCacheRequired`. Call `updateRulesetWeightCache(projectId, rulesetId)` first.

---

## Which Path Should I Choose?

| I want... | Use |
|-----------|-----|
| A project I can reconfigure over time | **Omnichain Deployer** — owner controls rulesets |
| An autonomous project with locked economics | **Revnet** — no owner key, predetermined stages |
| NFT tiers + cross-chain + buyback out of the box | **Omnichain Deployer** or **Revnet** — both bundle these |
| Full control over every hook and parameter | **Direct Controller** — wire it all yourself |
| A simple NFT collection with community publishing | **CTDeployer** (Croptop) — built on top of omnichain deployer |
| A prediction game with governance | **DefifaDeployer** — built on top of 721 hook |
