# Audit Instructions

Juicebox V6: programmable treasuries on EVM. Projects collect funds through terminals, issue tokens, cash out along bonding curves, and compose features through hooks. Your goal: find bugs that lose funds, break invariants, or enable unauthorized access.

**Context:** [ARCHITECTURE.md](./ARCHITECTURE.md) (how it works) | [RISKS.md](./RISKS.md) (trust model) | [USER_JOURNEYS.md](./USER_JOURNEYS.md) (user paths)

## Scope

**In scope — all Solidity in these directories:**
```
nana-core-v6/src/                    # Core protocol (~11,200 lines)
nana-721-hook-v6/src/                # NFT hooks (~5,100 lines)
nana-suckers-v6/src/                 # Cross-chain bridging (~5,000 lines)
defifa-collection-deployer-v6/src/   # Prediction games (~3,900 lines)
revnet-core-v6/src/                  # Revnets + loans (~3,400 lines)
nana-router-terminal-v6/src/         # Payment routing (~2,200 lines)
nana-buyback-hook-v6/src/            # DEX buyback (~1,900 lines)
deploy-all-v6/script/Deploy.s.sol    # Ecosystem deployment (~1,600 lines)
banny-retail-v6/src/                 # Banny NFTs (~1,600 lines)
univ4-lp-split-hook-v6/src/          # UniV4 LP management (~1,600 lines)
univ4-router-v6/src/                 # UniV4 hook (~1,400 lines)
croptop-core-v6/src/                 # NFT publishing (~1,400 lines)
nana-omnichain-deployers-v6/src/     # Multi-chain deploy (~1,000 lines)
```

**Also in scope:** All deployment scripts (`*/script/*.sol`). Hardcoded addresses, initialization parameters, and deployment ordering are real attack surface.

**Out of scope:** Test files (`*/test/`), OpenZeppelin/Solady/Uniswap dependencies (assume correct), forge-std.

## The Protocol in 60 Seconds

Every project is an ERC-721 NFT. The NFT owner governs the project.

**Money in**: Users pay a project via `JBMultiTerminal.pay()`. The terminal records the payment in `JBTerminalStore`, then asks `JBController` to mint project tokens to the payer. A data hook can override the mint rate. Pay hooks execute afterward (e.g., mint NFTs).

**Money out — three paths**:
1. **Cash out** (`cashOutTokensOf`): Burn tokens, reclaim surplus via bonding curve. Tax rate controls how much goes back.
2. **Payouts** (`sendPayoutsOf`): Owner distributes funds to splits (addresses, other projects, hooks). Bounded by payout limits.
3. **Surplus allowance** (`useAllowanceOf`): Owner withdraws from surplus. Bounded by allowance limits.

All three paths pay a 2.5% fee to project #1.

**Rulesets** govern economics per time period: mint weight, tax rate, reserved percent, hook configuration. They form a linked list — when one expires, the next queued one takes effect (or the current one cycles with decayed weight).

**Hooks** are the composition layer. Five extension points:
- Data hooks: override payment weight or cash out parameters (absolute control)
- Pay hooks: execute after payment (mint NFTs, swap tokens)
- Cash out hooks: execute after cash out
- Split hooks: execute during payout distribution
- Approval hooks: approve/reject ruleset transitions

## Where the Money Is

All project funds are held by `JBMultiTerminal`. Accounting lives in `JBTerminalStore`. The terminal holds real tokens; the store tracks per-project balances.

**Value extraction paths (ordered by blast radius):**

| Path | Entry Point | What to Verify |
|------|------------|----------------|
| Cash out | `cashOutTokensOf()` | Bonding curve math, surplus calculation, data hook overrides |
| Payouts | `sendPayoutsOf()` | Payout limit enforcement, split distribution, fee calculation |
| Surplus allowance | `useAllowanceOf()` | Allowance limit enforcement, surplus calculation |
| Fee processing | `_processFee()` / `processHeldFeesOf()` | Fee arithmetic, held fee lifecycle, try-catch fallback |
| Loans | `REVLoans.borrowFrom()` | Collateral valuation, liquidation schedule, surplus manipulation |
| Cross-chain bridge | `JBSucker.prepare()` → `claim()` | Merkle proof verification, double-claim prevention, amount conservation |
| NFT cash out | `JB721TiersHook.afterCashOutRecordedWith()` | Cash out weight calculation, tier price vs discount |

If you can extract more value than the protocol intends through any of these paths, that's a critical finding.

## Domain-Specific Attack Vectors

These are the attack patterns most likely to yield findings in this codebase. They're ordered by estimated likelihood of undiscovered bugs.

### 1. Hook Composition Attacks

The hook system is the largest attack surface. Individual hooks may work correctly in isolation, but their **composition** — where one hook's output feeds into another's input, or where hooks re-enter the protocol during execution — is where bugs hide.

**The composition model:**
```
Data hook called during RECORDING (store) → Pay/cashout hooks called during FULFILLMENT (terminal)
                                          → Split hooks called during PAYOUT (terminal)
```

Data hooks see the raw payment context. They return modified weights and hook specifications. The terminal then calls those hooks with funds. Hooks can themselves interact with the protocol.

**Specific compositions to test:**
- REVDeployer (data hook) + JB721TiersHook (pay hook) + JBBuybackHook (nested data hook call): What happens when the buyback hook returns empty specifications vs. non-empty? Does the REVDeployer handle both cases?
- JBOmnichainDeployer (data hook overrides cash out tax to 0%) + any cash out hook: Can the 0% tax override be exploited outside of legitimate sucker operations?
- JB721TiersHook (pay hook) minting NFTs during a payment where JBBuybackHook is swapping tokens: Does the swap callback interact safely with the NFT mint?
- JBUniswapV4LPSplitHook receiving payout during `sendPayoutsOf` while the same project is being paid into: Cross-function reentrancy through split hook.

**What to look for:** State that's partially committed when hooks execute. The terminal updates the store, then mints tokens, then calls hooks. At hook execution time, the store has the new balance but the hook might be able to manipulate other state.

### 2. Bonding Curve Economic Attacks

The cash out formula in `JBCashOuts.cashOutFrom()`:
```
reclaimAmount = (surplus * count / supply) * [(MAX - tax) + tax * (count / supply)] / MAX
```

**Key inputs an attacker controls:**
- `count` — how many tokens to cash out (directly)
- `surplus` — by paying into the project or manipulating via data hooks
- `supply` — indirectly, via pending reserved tokens

**Attack sequences to try:**
1. Pay → immediate cash out in same block: should never profit after fees (invariant tested, but test with different hook configurations)
2. Pay with data hook that inflates weight → cash out before reserved tokens are distributed: pending reserved tokens inflate supply, reducing your share — but what if you time it right?
3. Multi-project attack: pay into project A (which has a split to project B), then cash out from project B before the split executes
4. Cash out with `cashOutCount >= totalSupply` returns entire surplus (known, by design). Can you engineer this condition without being the actual last holder? (e.g., front-running a burn)
5. Cross-terminal surplus aggregation: `useTotalSurplusForCashOuts` flag aggregates surplus across all terminals via `JBSurplus`. Can you manipulate surplus in one terminal to inflate cash out value in another?

### 3. Currency and Price Feed Manipulation

The protocol has **two currency systems** that interact at conversion boundaries:
- **Abstract**: `baseCurrency` in rulesets (1=ETH, 2=USD). Used for surplus calculations.
- **Concrete**: `uint32(uint160(tokenAddress))` in accounting contexts. Identifies payment tokens.

`JBPrices` mediates between them. Price feeds are immutable once set.

**Attack vectors:**
- A price feed that returns a manipulated price could inflate/deflate surplus calculations. Chainlink feeds have staleness checks, but project-specific feeds don't have to.
- `JBMatchingPriceFeed` returns 1:1 — if deployed for the wrong pair, all conversions are wrong.
- `normalizePaymentValue` in `JB721TiersHookLib` converts payment amounts to tier pricing denomination. If the price feed returns an extreme value, NFTs could be minted for effectively free.
- Rounding compounds through conversion chains: pay in token A → normalize to pricing currency → compute split → convert back. Each step rounds via `mulDiv`. Can N payments each rounding in the attacker's favor compound to a meaningful loss?

### 4. Reentrancy Through Hooks

No contract uses `ReentrancyGuard`. The protocol relies on CEI ordering.

**The critical reentrancy surfaces (in order of risk):**

1. **LP Split Hook** (no protection at all): `deployPool`, `collectAndRouteLPFees`, `rebalanceLiquidity`, and `claimFeeTokensFor` all make external calls without any reentrancy protection. The hook calls `terminal.pay()` (which triggers pay hooks), `POSITION_MANAGER.modifyLiquidities`, and `controller.burnTokensOf`. If any of these re-enter the hook, state corruption is possible.

2. **Pay hook → cash out reentrancy**: When a pay hook executes, tokens have been minted and the store balance is updated. The hook could call `cashOutTokensOf` on the same project. Tokens are burned, reclaim is computed against the post-payment surplus. Is this profitable?

3. **Split hook → pay reentrancy**: During `sendPayoutsOf`, split hooks receive funds. A split hook could call `pay()` on the same project. The payout limit is already consumed, but the payment adds to balance and mints tokens. Does this create a value loop?

4. **Fee processing → re-entry**: `_processFee` calls `terminal.pay()` on project #1's terminal. If project #1 has a pay hook that calls back into the originating terminal, what happens? The fee amount is already deducted.

### 5. Ruleset Transition Timing

Rulesets transition at exact block timestamps. Transaction ordering at boundaries matters.

**What to test:**
- A payment landing in the last second of a ruleset vs. the first second of the next: do both execute with correct weights?
- Approval hook rejection at boundary: if the approval hook says "not yet approved," the protocol falls back to the basedOnId chain and simulates cycling from the last approved ruleset. Is this fallback always equivalent to the intended behavior?
- `duration = 0` rulesets never expire — they're immediately replaced when a new one is queued. Can you pay and queue a ruleset in the same transaction to get the old weight but the new parameters?
- Weight decay across 20,000+ cycles without cache: `WeightCacheRequired` revert. This is a DoS — can an attacker force a project into this state?

### 6. REVLoans Collateral Manipulation

Borrowers lock project tokens and borrow against their bonding curve value.

**The key insight**: Loan collateral value depends on the bonding curve, which depends on the project surplus, which changes with every payment and cash out.

**Attack sequences:**
1. Inflate surplus (pay) → borrow max → deflate surplus (large cash out from another account) → collateral is now worth less than borrowed amount → wait for liquidation to release collateral at a loss to the protocol
2. Borrow → stage transition changes bonding curve parameters → collateral value drops below loan → effectively an unsecured loan
3. Collateral reallocation between loans: is it atomic? Can you reallocate and borrow in a single transaction to temporarily have both the old and new collateral active?
4. Can you manipulate the `prepaidFee` calculation for early repayment to pay less than intended?

### 7. Cross-Chain Bridge Exploits

`JBSucker` uses incremental merkle trees (eth2-style) for cross-chain token movement.

**What to verify:**
- **Double claim**: Leaf hash includes `(token, beneficiary, amount, index)`. Claimed leaves are tracked in a bitmap. Can you construct a valid proof for a different beneficiary using the same leaf data?
- **Cross-sucker replay**: Suckers are 1:1 pairs. Can you prepare on chain A, then somehow claim on chain C (not the paired chain)?
- **Race between deprecation and claim**: SENDING_DISABLED means new prepares are blocked, but existing outbox entries should still be claimable. Verify this works correctly.
- **Emergency hatch**: Project owner can enable `emergencyHatchOf` instantly — no timelock, no multisig. This is a known trust assumption. But verify: can emergency hatch drain tokens that are in transit (prepared but not yet claimed)?
- **CCIP amount mismatch**: The protocol intentionally skips amount validation to prevent lockup. Can an attacker exploit this to mint more tokens than were prepared?

### 8. NFT Economics Exploits (721 Hook + Defifa)

**721 Hook:**
- `discountPercent` denominator is 200 (not 100). `200 = 100% discount`. Does cash out weight use original (undiscounted) price or effective (discounted) price? If original, 100% discounted NFTs carry free arbitrage.
- `splitPercent` — is it validated against `SPLITS_TOTAL_PERCENT` (1,000,000,000)? If uncapped, a `splitPercent` of 4e9 would forward 4x the payment amount.
- Reserve mints are based on frequency, not time. Can you time reserve mints to get more than intended?
- Tier category ordering: `recordAddTiers` reverts with `InvalidCategorySortOrder` if categories aren't ascending. Can this be exploited to prevent legitimate tier additions?

**Defifa:**
- Whale attack: buy majority of 6+ tiers out of 10, accumulate 6e9 of 10e9 attestation power, exceed 50% quorum, ratify self-serving scorecard. Cost? Risk?
- `computeCashOutWeight` uses integer division (`weight / tokens`). Dust is permanently locked. At what scale does this become meaningful?
- Grace period: is `gracePeriodEnds` calculated from scorecard submission time or from when attestations actually begin? If submission time, can a scorecard's grace period expire before anyone can attest?
- Fee token dilution: reserved mints get fee tokens proportional to tier price (not amount paid). How much does this dilute real payers in realistic scenarios?
- Can a `fulfillCommitmentsOf` revert block scorecard ratification permanently?

### 9. Deployment Script Verification

**What to verify:**
- **Every hardcoded address** in `deploy-all-v6/script/Deploy.s.sol` and all per-repo deploy scripts. Cross-reference against canonical contract addresses for each target chain (Ethereum, Optimism, Base, Arbitrum + testnets). Uniswap V4 PoolManager and PositionManager addresses differ per chain.
- **Constructor parameter correctness**: Do permission grants match intended access control? Are initial rulesets configured correctly?
- **Deployment ordering**: Can a partially-deployed state be exploited? Sphinx proposals are atomic per phase, but between phases?
- **Sphinx project name consistency**: Do v5 vs v6 naming mismatches cause artifact resolution failures?
- **Salt determinism for CREATE2**: Can an attacker front-run a deterministic deployment to squat the address?

### 10. Permit2 Metadata Edge Cases

`JBMultiTerminal._pay()` supports Permit2 for gasless token approvals. The metadata encoding path:

```
metadata bytes → JBMetadataResolver.getDataFor(PERMIT2_METADATA_ID) → decode JBSingleAllowance → call permit2
```

**What to test:**
- Malformed metadata: What if the metadata claims to be Permit2 but has wrong length?
- Replayed permit: Does the nonce mechanism prevent reuse?
- Signature deadline manipulation: `sigDeadline` is attacker-controlled. Can a stale permit be used after intended expiry?
- Amount mismatch: The permit amount vs. the actual payment amount — are these validated against each other?

## Invariants to Verify

These MUST hold. If you can break any of them, it's a finding:

1. **Balance conservation**: `terminal.balance(token) >= sum(store.balanceOf(projectId, terminal, token))` for all projects
2. **Inflow >= Outflow**: Total funds received by a project >= total funds distributed
3. **Fee monotonicity**: Project #1's balance only increases over time
4. **Token supply consistency**: `JBTokens.totalSupplyOf(projectId) == creditSupply + erc20.totalSupply()`
5. **Ruleset existence**: After `launchProjectFor()`, `currentOf(projectId)` always returns a valid ruleset
6. **No flash-loan profit**: Pay + cashout in same block should never yield more than was paid (minus fees)
7. **Payout limits**: A project cannot extract more than its configured payout limit per ruleset cycle
8. **Surplus allowance**: A project cannot withdraw more than its configured surplus allowance per ruleset cycle
9. **Cross-chain conservation**: Tokens prepared on source == tokens claimable on destination (for a given tree root)
10. **NFT supply caps**: Minted count per tier never exceeds tier's initial supply
11. **Defifa prize pool conservation**: Total cashout value across all tiers == total project surplus (minus fees)

## Anti-Patterns to Hunt

These code patterns are where bugs hide in this codebase:

| Pattern | Where to look | Why it's dangerous |
|---------|--------------|-------------------|
| `try-catch` swallowing errors | JBMultiTerminal (hooks, fees, splits) | Failed external calls silently change control flow. The fee try-catch can be used for temporary fee avoidance. |
| `mulDiv` rounding direction | JBCashOuts, JBFees, JBTerminalStore, JB721TiersHookLib | Rounding in attacker's favor compounds over many transactions. |
| Hardcoded 0 / placeholder functions | JBUniswapV4LPSplitHook | A function that should compute real values but returns 0. Are there other placeholders? |
| Currency type confusion | JBTerminalStore, JB721TiersHookLib, JBFundAccessLimits | Abstract (1=ETH, 2=USD) vs concrete (`uint32(address)`) currencies. `groupId` (`uint256`) vs `currency` (`uint32`) truncation. |
| Uncapped input parameters | JB721TiersHookStore | Parameters that accept `uint32` but should be bounded by protocol constants. What other parameters lack bounds checks? |
| Silent fund drops | JB721TiersHookLib | Funds consumed from accounting but never sent when target address is `address(0)`. Any other path where funds disappear without revert? |
| Undiscounted price usage | JB721TiersHookLib, JB721TiersHookStore | Cash out weight and split amounts use original tier price instead of discounted price. Is this consistent across all code paths? |
| Sign convention mismatch | JBUniswapV4Hook | V4 uses a credit/debit convention where output amounts are negative. Slippage checks expecting positive values never fire. Any other V4 integration paths with this issue? |
| Missing ownership transfer | Deployer contracts | Hooks or contracts deployed by a deployer but never transferred to the project owner. Any deployers that forget `transferOwnershipToProject`? |
| Stale references after mutation | JBUniswapV4LPSplitHook | Stored IDs or addresses that become dangling after the referenced object is burned or destroyed. |
| Re-initialization after ownership renounce | Clone patterns | `initialize()` guard that checks `owner != address(0)` passes again after `renounceOwnership`. Any other clone patterns with this issue? |
| Array OOB from conditional returns | REVDeployer, hook compositions | Unconditional `[0]` access on arrays that may be empty depending on which code path a hook takes. Scan for all array index accesses after hook/external calls. |
| External call in loop | JBMultiTerminal (payout splits), processHeldFeesOf | Gas griefing by making external calls revert. Each revert is caught by try-catch but still costs gas. |

## How to Report Findings

For each finding:

1. **Title** — one line, starts with severity (CRITICAL/HIGH/MEDIUM/LOW)
2. **Affected contract(s)** — exact file path and line numbers
3. **Description** — what's wrong, in plain language
4. **Trigger sequence** — step-by-step, minimal steps to reproduce
5. **Impact** — what an attacker gains, what a user loses (with numbers if possible)
6. **Proof** — code trace showing the exact execution path, or a Foundry test
7. **Fix** — minimal code change that resolves the issue

**Severity guide:**
- **CRITICAL**: Direct fund loss, permanent DoS, or system insolvency. Exploitable with no preconditions.
- **HIGH**: Conditional fund loss, privilege escalation, or broken core invariant. Requires specific but realistic setup.
- **MEDIUM**: Value leakage, griefing with cost to attacker, incorrect accounting, degraded functionality.
- **LOW**: Informational, cosmetic inconsistency, edge-case-only with no material impact.

**Before reporting — verify it's not a false positive:**
- Is there a modifier, hook, or internal call that reconciles the state you think is inconsistent?
- Is the "stale" state intentionally lazily evaluated (updated on next read)?
- Does the protocol's try-catch fallback handle the failure case you're worried about?
- Is the economic attack actually profitable after gas costs and 2.5% fees?
- Does Solidity 0.8.26's built-in overflow protection prevent the arithmetic issue?
- Has this already been reported or documented in [RISKS.md](./RISKS.md)?

## Testing Setup

```bash
# Clone everything
git clone --recursive https://github.com/Bananapus/version-6.git
cd version-6

# Build and test a single repo
cd nana-core-v6
npm install
forge build
forge test

# Run with high verbosity for debugging
forge test -vvvv --match-test testExploitName

# Write a PoC
forge test --match-path test/audit/ExploitPoC.t.sol -vvv

# Run invariant tests
forge test --match-contract Invariant

# Gas analysis
forge test --gas-report
```

Each repo's tests are self-contained. For cross-repo interactions, write tests in the downstream repo (e.g., test a buyback hook exploit in `nana-buyback-hook-v6/test/`).

The existing test suite is extensive (165 files in nana-core-v6 alone). Review the invariant tests to understand what's already been proven — then try to break those invariants with configurations the tests don't cover.

## Priority Order

Audit in this order. Earlier items have higher blast radius:

| Priority | Target | Why |
|----------|--------|-----|
| 1 | **Hook composition** (REVDeployer + JBBuybackHook + JB721TiersHook) | Hooks compose in ways that aren't tested end-to-end. Conditional array returns, nested hook calls, and re-entrant hook → protocol interactions are the most likely source of undiscovered bugs. |
| 2 | **JBMultiTerminal + JBTerminalStore** | All funds flow through here. No reentrancy guard — CEI ordering is the only defense. |
| 3 | **JBUniswapV4LPSplitHook** | Complex contract with Uniswap V4 integration, permissionless entry points, no reentrancy protection, and placeholder code. |
| 4 | **REVLoans** | Lending against a bonding curve whose parameters change with stage transitions. Collateral manipulation surface is large. |
| 5 | **JB721TiersHookLib + JB721TiersHookStore** | NFT discount/split/price economics have multiple interacting parameters (discountPercent, splitPercent, cash out weight, reserve frequency). |
| 6 | **JBRulesets** | Weight decay, approval hooks, ruleset transitions — timing-dependent logic with 20k-cycle cache thresholds. |
| 7 | **JBSucker** | Cross-chain merkle tree bridge. Bridge bugs have outsized impact. |
| 8 | **DefifaDeployer + DefifaHook + DefifaGovernor** | Governance quorum manipulation, phase timing, scorecard attacks. |
| 9 | **Deployment scripts** | Hardcoded addresses per chain. Verify every address against canonical deployments. |
| 10 | **JBController** | Token minting, reserved distribution, ruleset lifecycle. |
| 11 | **JBBuybackHook** | TWAP manipulation, swap failure handling, spot price fallback. |
| 12 | **JBRouterTerminal** | Multi-hop routing, slippage across swap steps. |
| 13 | **Everything else** | Utilities, registries, constants. |

Go break it.
