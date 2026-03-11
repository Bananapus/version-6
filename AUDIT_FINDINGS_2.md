# Juicebox V6 — Nemesis Audit Findings

Automated deep audit of all 17 V6 repositories using the Nemesis auditor (iterative Feynman + State Inconsistency analysis). Each finding was independently verified against source code. Only confirmed true positives appear below.

**Scope:** All 17 V6 EVM repos | **Date:** March 2026 | **Tool:** Nemesis (claude -p)

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 2 |
| Medium | 8 |
| Low | 44 |
| Informational | 13 |

**False positives eliminated:** 3 (revnet NM-001 was HIGH, buyback NM-001 was MEDIUM, revnet NM-004 was LOW)

**Repos with zero findings:** nana-core-v6

---

## High Severity

### H-1: Unvalidated Loan Source Terminal Enables Permanent DoS of Lending

**Repo:** revnet-core-v6 | **File:** `REVLoans.sol`

`borrowFrom()` accepts any `source.terminal` without validating it against `DIRECTORY.terminalsOf(revnetId)`. A fake terminal gets permanently appended to `_loanSourcesOf[revnetId]` (append-only, no removal). Subsequent calls to `_totalBorrowedFrom()` iterate all sources and call `source.terminal.accountingContextForTokenOf()` on the fake terminal, which returns a garbage currency causing `PRICES.pricePerUnitOf` to revert with `JBPrices_PriceFeedNotFound`.

**Impact:** Blocks new borrows, partial repayments, and collateral reallocations for up to 10 years (until the fake loan is liquidated after `LOAN_LIQUIDATION_DURATION`). Full repayments and liquidations remain functional.

**Attack cost:** 1 wei of revnet tokens + gas + trivial fake terminal contract. Repeatable.

**Fix:** Validate `source.terminal` against `DIRECTORY.isTerminalOf(revnetId, source.terminal)` in `borrowFrom()`.

---

### H-2: Permissionless Rebalance Can Permanently Brick Project LP

**Repo:** univ4-lp-split-hook-v6 | **File:** `UniV4DeploymentSplitHook.sol`

`rebalanceLiquidity()` has no access control (unlike `deployPool()` and `claimFeeTokensFor()` which require `SET_BUYBACK_POOL` permission). An attacker can:

1. Swap in the UniV4 pool to push price outside the tick range (making position single-sided)
2. Call `rebalanceLiquidity()` with all slippage params = 0
3. After burn, one token balance is 0. `getLiquidityForAmounts` returns 0.
4. The else-branch sets `tokenIdOf[projectId][terminalToken] = 0`
5. `projectDeployed[projectId]` remains `true` (one-way latch, never reset)

Now `processSplitWith()` burns all incoming project tokens (because `projectDeployed == true`), but `deployPool()` requires `accumulatedProjectTokens != 0`, which can never accumulate. Permanent, irrecoverable circular dependency.

**Fix:** Add `SET_BUYBACK_POOL` permission check to `rebalanceLiquidity()`, AND/OR reset `projectDeployed` when `tokenIdOf` is zeroed.

---

## Medium Severity

### M-1: Placeholder Fee Routing Disables Fee Collection During Rebalance

**Repo:** univ4-lp-split-hook-v6 | **File:** `UniV4DeploymentSplitHook.sol`

`_getAmountForCurrency()` is a `pure` function that always returns 0 (lines 949-961). Called during `rebalanceLiquidity()` at lines 576-577, it passes `(0, 0)` to `_routeCollectedFees()`, which short-circuits at line 1058. Fees collected during every rebalance are never routed to the fee project.

Dead variables at lines 568-569 (`projectTokenBalance`, `terminalTokenBalance`) confirm incomplete implementation.

---

### M-2: Per-Project `projectDeployed` Flag Prevents Multi-Terminal-Token Pools

**Repo:** univ4-lp-split-hook-v6 | **File:** `UniV4DeploymentSplitHook.sol`

`projectDeployed` is keyed by `[projectId]` only, but `tokenIdOf` and `_poolKeys` are keyed by `[projectId][terminalToken]`. After deploying a pool for terminal token A, `projectDeployed[p] = true` causes all subsequent `processSplitWith()` calls to burn tokens, preventing accumulation for a second pool with terminal token B.

---

### M-3: V4 Swaps Use Manipulable Spot Price for Slippage Calculation

**Repo:** nana-router-terminal-v6 | **File:** `JBRouterTerminal.sol`

At lines 1110-1133, V4 swaps compute `minAmountOut` from `POOL_MANAGER.getSlot0(id)` — an instantaneous spot tick manipulable within the same block. Attackers can sandwich transactions. Mitigated by sigmoid slippage (minimum 2% floor) and user-provided `quoteForSwap` metadata override, but base price remains manipulable for users who don't provide custom quotes.

---

### M-4: Arbitrum Non-Atomic Token+Message Bridging Allows Temporary Underbacked Minting

**Repo:** nana-suckers-v6 | **File:** `JBArbitrumSucker.sol`

`_toL2()` creates two independent Arbitrum retryable tickets: one for ERC-20 bridging (line 243) and one for the `fromRemote` message (line 274). In MANUAL mode, if the message ticket is redeemed before the token ticket, `claim()` mints project tokens without terminal backing. ON_CLAIM mode is protected (reverts if tokens haven't arrived).

---

### M-5: Attestation Units Permanently Lost on Token Transfer to Undelegated Recipients

**Repo:** defifa-collection-deployer-v6 | **File:** `DefifaHook.sol`

`_transferTierAttestationUnits()` (line 999) passes `_tierDelegation[_to][_tierId]` to `_moveTierDelegateAttestations`. When the recipient has no delegate, this resolves to `address(0)`. The decrement at line 887 fires (sender's delegate loses units), but the increment at line 897 is skipped (`address(0)` check). Units vanish. Phase-lock prevents recipients from fixing delegation during REFUND/SCORING.

**Impact:** Attestation power below quorum can trigger NO_CONTEST via `scorecardTimeout` safety mechanism.

---

### M-6: Duplicate encodedIPFSUri in Single mintFrom Batch Enables Fee Evasion

**Repo:** croptop-core-v6 | **File:** `CTPublisher.sol`

`_setupPosts()` writes `tierIdForEncodedIPFSUriOf` at line 544 BEFORE `adjustTiers` is called at line 337. When a second post in the same batch has the same URI, it reads a non-zero `tierId` at line 455, but `store.tierOf()` returns `price = 0` for a tier that doesn't exist in the store yet. The fee at line 327 is computed on only 1x the price instead of 2x.

---

### M-7: Missing Optimism Chain in Auto-Issuance Configuration

**Repo:** croptop-core-v6 | **File:** `ConfigureFeeProject.s.sol`

`sphinxConfig.mainnets` targets 4 chains (Ethereum, Optimism, Base, Arbitrum), but auto-issuance array at line 148 only has 3 entries — Optimism (chain ID 10) is absent. No `CPN_OP_AUTO_ISSUANCE_` constant is defined.

---

### M-8: Removed Tier Causes Outfit State Desynchronization

**Repo:** banny-retail-v6 | **File:** `Banny721TokenUriResolver.sol`

When a previously equipped outfit's tier is removed, `_productOfTokenId` returns `.category = 0`. The first while loop at line 1294 exits immediately (`previousOutfitProductCategory != 0` fails), and `previousOutfitIndex` never advances. The second while loop at line 1334 transfers out ALL remaining previous outfits — including ones being re-equipped in the new array — because it lacks the `previousOutfitId != outfitId` guard from the first loop.

Self-correcting via try-catch on the next `decorateBannyWith` call. No permanent fund loss, but creates a temporary visual inconsistency.

---

## Low Severity

### revnet-core-v6

**L-1: RepayLoan Event Emits Zeroed Loan Values on Full Repayment.** `loan` is a storage pointer zeroed by `_adjust` before the snapshot at line 1232. The emitted event contains `amount = 0` and `collateral = 0`. Other event parameters correctly capture the actual amounts. Fix: take snapshot before `_adjust`.

### nana-suckers-v6

**L-2: Transient `amountToAddToBalanceOf` Inflation During `_sendRoot`.** Between zeroing `outbox.balance` (line 956) and the external bridge call (line 980), `amountToAddToBalanceOf` is inflated. Exploitation requires reentrancy through trusted bridge contracts — practically infeasible.

**L-3: CCIP `ccipReceive` Intentionally Skips Delivered Amount Validation.** Documented design trade-off at lines 141-145. Reverting would strand tokens. MANUAL mode has underbacking risk.

**L-4: `fromRemote` Nonce-Skip Documentation Overstates Impact.** Comment at line 426 claims skipped nonces make claims "permanently unclaimable." The append-only merkle tree means leaves ARE provable against later roots — users need regenerated proofs, not lost funds. Misleading documentation.

**L-5: `_sendRoot` Underflow Revert on Empty Tree with `minBridgeAmount=0`.** `count - 1` at line 966 underflows when `outbox.tree.count == 0`. Clean revert, no state corruption. Fix: early return when `count == 0`.

**L-6: `exitThroughEmergencyHatch` Does Not Emit Event.** Safety-critical operation invisible to off-chain monitoring. `claim()` emits `Claimed`, but emergency exits emit nothing.

**L-7: `fromRemote` Accepts Roots for Unmapped Tokens.** No `isMapped` check. Requires project owner misconfiguration on the remote chain. Defense-in-depth gap.

**L-8: Broken Controller on Destination Chain Permanently Blocks Claims.** `mintTokensOf` at line 761 reverts if controller is broken. No inbox-side fallback. Project owner must fix controller.

### univ4-lp-split-hook-v6

**L-9: Implementation Contract Initializable by Anyone.** Constructor doesn't set `initialized = true`. No impact on clones (separate storage).

**L-10: Dead Variables in `rebalanceLiquidity()`.** Lines 568-569 compute then shadow at 583-584. Symptom of M-1.

**L-11: `_poolKeys` Not Cleared When `tokenIdOf` Is Zeroed.** Only affects `poolKeyOf()` public view — stale data returned. No on-chain impact.

### nana-buyback-hook-v6

**L-12: `disallowHook` Clears `defaultHook`, Breaking Payments for Default-Reliant Projects.** Owner-only, self-healing via `setDefaultHook(newHook)`. Operational risk.

**L-13: Pre-existing WETH Balance Inflates Native ETH Leftover Calculations.** Blanket WETH unwrap at line 237 includes donations. No profit motive for attacker.

**L-14: `allowHook(address(0))` Enables Clearing Project Hooks.** No address(0) guard. Owner-only governance footgun.

**L-15: Shared TWAP Window Across Terminal Tokens.** `twapWindowOf[projectId]` is per-project, not per-pool. Design limitation.

**L-16: Operator Can Atomically Set and Lock Hooks.** Both operations use same permission. Within trust model.

### nana-router-terminal-v6

**L-17: Registry Does Not Handle Fee-on-Transfer Tokens.** `_acceptFundsFor` returns nominal `amount` instead of balance delta. Causes revert, not fund loss.

**L-18: Multi-Step Cashout Lacks Intermediate Slippage Protection.** `minTokensReclaimed = 0` after first iteration. Limited attack surface.

**L-19: `setDefaultTerminal` Accepts `address(0)`.** DoS for projects using default. Admin-only, self-healing.

**L-20: Permit2 `transferFrom` uint160 Silent Truncation.** `type(uint160).max` ≈ 1.46e48 — exceeds any real token supply. Practically unreachable.

### nana-721-hook-v6

**L-21: Discount Percent Allows 100% Discount (Free Minting).** `discountPercent = 200` passes `> DISCOUNT_DENOMINATOR` check. Free-minted NFTs retain cashout weight. Owner-only. Documented in SKILLS.md.

**L-22: Pending Reserves Dilute Cash-Out Weight.** By design — documented in code comments as dilution protection.

**L-23: Default Reserve Beneficiary Overwritten on Tier Addition.** Adding a tier with `useReserveBeneficiaryAsDefault = true` overwrites global default. Documented warning in code.

**L-24: `address(this)` Sentinel Pattern in `setMetadata`.** Unconventional but functional. `address(0)` already means "clear resolver."

### defifa-collection-deployer-v6

**L-25: Integer Division Truncation in `computeCashOutWeight`.** Standard truncation. Max loss < 0.0001% of pot. Residual stays in treasury.

**L-26: Order-Dependent Rounding in Fee Token Distribution.** Last claimer gets dust. Few wei at most.

**L-27: Fulfillment Failure Allows Cash-Out from Pre-Fee Pot.** Intentional try-catch design trade-off. Propagating the revert would permanently block ratification.

### croptop-core-v6

**L-28: L2 Sucker Deployer Fallback Cascade Is Fragile.** Works correctly in practice — each L2 only has its own deployer in deployment artifacts.

**L-29: Force-Sent ETH Routed to Fee Project.** No `receive()`/`fallback()`. Only `selfdestruct` can force-send. Benefits fee project, not harmful.

**L-30: `uint56` vs `uint64` Project ID Cast Inconsistency.** `CTProjectOwner.sol` uses `uint56(tokenId)`, `CTDeployer.sol` uses `uint64(projectId)`. No practical truncation. Should be `uint64`.

**L-31: No Mechanism to Fully Disable Posting for a Category.** `minimumTotalSupply == 0` reverts in both config and mint paths. Once enabled, cannot be disabled.

### banny-retail-v6

**L-32: NFTs Force-Sent via Non-Safe Transfer Are Permanently Stuck.** `onERC721Received` only guards `safeTransferFrom`. No rescue function for `transferFrom`-sent NFTs.

### univ4-router-v6

**L-33: Dead Constants `MIN_ABS_TICK_MOVE`, `LIMIT_ABS_TICK_MOVE`.** Declared but never referenced in Oracle.sol.

**L-34: Dead Field `prevTick` in `Oracle.Observation`.** Written but never read by any function.

**L-35: Duplicate Identical Functions `_normalizeToken` / `_normalizeTokenForTerminal`.** Identical bodies. NatSpec differs slightly.

**L-36: `observeTWAP` Missing Negative Tick Rounding.** Plain division vs `_consult`'s rounding toward negative infinity. At most 1 tick difference.

**L-37: V3 Pool Selection by Liquidity May Miss Better Output.** Design trade-off — high liquidity ≠ best price for small swaps.

**L-38: Both-JB-Tokens Scenario Only Evaluates Buy-Side.** Design simplification.

**L-39: `hookData.length == 32` Strict in `_beforeSwap`.** `_afterSwap` uses `>= 32`. Inconsistency limits composability.

**L-40: `this.observeTWAP()` Without Try-Catch.** Guard at line 1054 makes the revert path unreachable. Downgraded from MEDIUM.

**L-41: Conservative JB Sell Estimate When Feeless.** Fee always deducted from `grossReclaim`. Documented as intentional.

**L-42: Dead Variable `jbTerminalStore` in Deploy Script.** Read from env, logged, but never used in constructor.

**L-43: Development Scripts Use Hardcoded Hardhat Addresses.** Development-only. Not shipped.

### nana-omnichain-deployers-v6

**L-44: Project NFTs Sent to Deployer Are Permanently Trapped.** `onERC721Received` accepts any project NFT. No rescue function. Self-inflicted only.

**L-45: Deploy Script `_isDeployed` May Compute Incorrect CREATE2 Address.** Hardcodes Arachnid proxy. Mitigated — Sphinx uses same proxy.

### nana-ownable-v6

**L-46: Constructor Missing Explicit Project Existence Check.** Implicitly mitigated by `PROJECTS.ownerOf(newProjectId)` revert.

**L-47: `permissionId` Persists Across External NFT Transfers.** When project NFT is externally transferred, JBOwnable retains old `permissionId`. Requires independent permission grant to exploit.

### nana-permission-ids-v6

**L-48: `SET_BUYBACK_HOOK` (ID 27) NatSpec Claims to Gate Functions It Does Not Gate.** Misleading documentation about which registry functions ID 27 controls.

**L-49: `SET_BUYBACK_POOL` (ID 26) NatSpec Is Incomplete.** Doesn't mention that it also gates `setHookFor` and `lockHookFor` in the registry.

### nana-fee-project-deployer-v6

**L-50: Unresolved TODO in Sphinx Config.** `sphinxConfig.owners` contains `// TODO: Update to contain revnet devs.`

### deploy-all-v6

**L-51: Incomplete CPN Revnet Deployment.** `_deployCpnRevnet()` is a no-op — `deployFor()` call is entirely commented out. CPN (project 2) deploys as a blank shell.

**L-52: Missing Salt for USDC Price Feed Deployments.** ETH/USD feeds use `{salt: USD_NATIVE_FEED_SALT}`. USDC/USD feeds use no salt. Inconsistent deployment determinism.

---

## Informational

**I-1:** defifa — Inconsistent overflow protection (`mulDiv` vs raw `*`). (defifa NM-004)
**I-2:** nana-omnichain-deployers-v6 — Unused error `JBOmnichainDeployer_UnexpectedNFT()`. (omnichain NM-002)
**I-3:** nana-omnichain-deployers-v6 — Library naming mismatch: file `DeployersDeploymentLib.sol` contains `SuckerDeploymentLib`. (omnichain NM-004)
**I-4:** nana-address-registry-v6 — TODO in production deployment config. (registry NM-001)
**I-5:** nana-fee-project-deployer-v6 — `cashOutTaxRate: 1000` comment says "0.1" (ambiguous). (fee-project NM-002)
**I-6:** nana-fee-project-deployer-v6 — No testnet auto-issuances configured. (fee-project NM-003)
**I-7:** nana-fee-project-deployer-v6 — `NANA_START_TIME` is in the past (Feb 2025). Intentional. (fee-project NM-004)
**I-8:** nana-fee-project-deployer-v6 — No test coverage for deployment script. (fee-project NM-005)
**I-9:** deploy-all-v6 — L2 sucker configs only include native bridge (no cross-L2). Design decision. (deploy NM-003)
**I-10:** deploy-all-v6 — BAN stage 2 `splitPercent` drops to 0. Appears intentional. (deploy NM-004)
**I-11:** nana-721-hook-v6 — `address(this)` sentinel pattern in `setMetadata`. (721 NM-004)
**I-12:** defifa — Fulfillment failure allows cashout from pre-fee pot. Intentional design trade-off. (defifa NM-008)
**I-13:** nana-suckers-v6 — CCIP `ccipReceive` skips amount validation. Intentional design trade-off. (suckers NM-003)

---

## False Positives Eliminated

### FP-1: Auto-Issuance Timing Guard Bypass for Non-First Stages (was HIGH)

**Repo:** revnet-core-v6 | **Original ID:** NM-001

The auditor assumed `block.timestamp + i` are synthetic IDs that don't correspond to real rulesets. This is incorrect — `JBRulesets.queueFor()` assigns IDs as `block.timestamp`, `block.timestamp + 1`, `block.timestamp + 2` etc. when multiple rulesets are queued in one transaction. `getRulesetOf(revnetId, block.timestamp + i)` retrieves the actual ruleset with its correct `startsAtOrAfter` time. The guard `ruleset.start > block.timestamp` correctly prevents early minting.

### FP-2: Stale `projectTokenOf` Cache After Token Migration (was MEDIUM)

**Repo:** nana-buyback-hook-v6 | **Original ID:** NM-001

The auditor assumed token migration is possible. In v6, `JBTokens.deployERC20For()` and `JBTokens.setTokenFor()` both revert with `JBTokens_ProjectAlreadyHasToken` if a token is already set. Once a project has a token, it cannot be changed. The cache can never become stale.

### FP-3: `repayLoan` Reverts When Remaining Collateral Supports More Than Loan Amount (was LOW)

**Repo:** revnet-core-v6 | **Original ID:** NM-004

The revert at lines 777-779 is correct behavior — preventing underflow in `loan.amount - newBorrowAmount`. Users should use `reallocateCollateralFromLoan` to extract excess collateral.

---

## Priority Fixes

| Priority | Finding | Effort |
|----------|---------|--------|
| 1 | H-1: Validate loan source terminal | One-line check |
| 2 | H-2: Add access control to `rebalanceLiquidity()` | One-line `_requirePermissionFrom` |
| 3 | M-1: Implement fee routing in rebalance | Replace placeholder with balance-delta tracking |
| 4 | M-5: Auto-delegate on NFT transfer receipt | Add `_tierDelegation[_to][_tierId] = _to` fallback |
| 5 | M-6: Deduplicate URIs in batch or check price != 0 | Input validation |
| 6 | M-7: Add Optimism to auto-issuance array | Config fix |
| 7 | M-8: Handle category 0 in outfit while loop | Loop guard |
| 8 | L-1: Take loan snapshot before `_adjust` | Move one line |
| 9 | L-5: Early return when `outbox.tree.count == 0` | One-line check |
| 10 | L-6: Emit event in `exitThroughEmergencyHatch` | Add emit |
