# Claude Nemesis Audit — Aggregated Findings

**Run:** 2026-03-23 (run ID `20260323-211448`)
**Repos audited:** 17
**Total findings:** 54 verified true positives
**Breakdown:** 0 Critical | 0 High | 4 Medium | 47 Low | 7 Informational
**Clean repos:** 1 (nana-permission-ids-v6)
**No Claude findings:** 1 (deploy-all-v6 — only Codex findings produced)

---

## Summary by Severity

| Severity | Count | Repos affected |
|----------|-------|----------------|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 4 | univ4-lp-split-hook-v6 (1), nana-721-hook-v6 (1), croptop-core-v6 (1 known), banny-retail-v6 (1) |
| Low | 47 | nana-core-v6 (4), univ4-lp-split-hook-v6 (2), revnet-core-v6 (2), nana-router-terminal-v6 (6), nana-721-hook-v6 (5), univ4-router-v6 (8), nana-buyback-hook-v6 (3), nana-suckers-v6 (3), defifa-collection-deployer-v6 (7), croptop-core-v6 (4), banny-retail-v6 (1), nana-omnichain-deployers-v6 (3), nana-ownable-v6 (2), nana-address-registry-v6 (2), nana-fee-project-deployer-v6 (2) |
| Informational | 7 | nana-buyback-hook-v6 (2), nana-suckers-v6 (1), banny-retail-v6 (2), nana-omnichain-deployers-v6 (2) |

## Summary by Repo

| # | Repo | C | H | M | L | I | Total |
|---|------|---|---|---|---|---|-------|
| 1 | nana-core-v6 | 0 | 0 | 0 | 4 | 0 | 4 |
| 2 | univ4-lp-split-hook-v6 | 0 | 0 | 1 | 2 | 0 | 3 |
| 3 | revnet-core-v6 | 0 | 0 | 0 | 2 | 0 | 2 |
| 4 | nana-router-terminal-v6 | 0 | 0 | 0 | 6 | 0 | 6 |
| 5 | nana-721-hook-v6 | 0 | 0 | 1 | 5 | 0 | 6 |
| 6 | univ4-router-v6 | 0 | 0 | 0 | 8 | 0 | 8 |
| 7 | nana-buyback-hook-v6 | 0 | 0 | 0 | 3 | 2 | 5 |
| 8 | nana-suckers-v6 | 0 | 0 | 0 | 3 | 1 | 4 |
| 9 | defifa-collection-deployer-v6 | 0 | 0 | 0 | 7 | 0 | 7 |
| 10 | croptop-core-v6 | 0 | 0 | 1 | 4 | 0 | 5 |
| 11 | banny-retail-v6 | 0 | 0 | 1 | 1 | 2 | 4 |
| 12 | nana-omnichain-deployers-v6 | 0 | 0 | 0 | 3 | 2 | 5 |
| 13 | nana-ownable-v6 | 0 | 0 | 0 | 2 | 0 | 2 |
| 14 | nana-address-registry-v6 | 0 | 0 | 0 | 2 | 0 | 2 |
| 15 | nana-permission-ids-v6 | 0 | 0 | 0 | 0 | 0 | 0 |
| 16 | nana-fee-project-deployer-v6 | 0 | 0 | 0 | 2 | 0 | 2 |
| 17 | deploy-all-v6 | — | — | — | — | — | — |

---

## MEDIUM Findings

### M-1: `_mintRebalancedPosition` includes fee tokens in LP balance calculation (univ4-lp-split-hook-v6)

**Severity:** MEDIUM
**File:** `src/JBUniswapV4LPSplitHook.sol:1324`

`_mintRebalancedPosition` reads raw `IERC20(projectToken).balanceOf(address(this))` without subtracting `_totalOutstandingFeeTokenClaims[projectToken]`. All three other functions that read this balance DO subtract. When fee tokens exist, `rebalanceLiquidity()` computes inflated liquidity, consumes fee tokens into the LP position, and then `_handleLeftoverTokens` underflows and reverts.

**Impact:** `rebalanceLiquidity` is DoS'd whenever `_totalOutstandingFeeTokenClaims[tokenP] > 0`. No fund loss (atomic revert). Workaround: call `claimFeeTokensFor` for all projects with outstanding claims before rebalancing.

**Fix:**
```solidity
// Line 1324 — add subtraction:
uint256 projectTokenBalance = IERC20(projectToken).balanceOf(address(this)) - _totalOutstandingFeeTokenClaims[projectToken];
```

!!! Admin note: ok, fix.

---

### M-2: ERC-20 beneficiary split uses raw `transfer()` — bricks payments for USDT (nana-721-hook-v6)

**Severity:** MEDIUM
**File:** `src/libraries/JB721TiersHookLib.sol:608-612`

```solidity
try IERC20(token).transfer(split.beneficiary, amount) returns (bool success) {
```

Non-standard ERC-20 tokens like USDT return `void` instead of `bool`. The ABI decoder failure happens INSIDE the try success handler, NOT in the try expression — so the catch block does NOT catch it. Per Solidity 0.8.28 docs, ABI decode errors inside try/catch success handlers propagate as uncaught reverts.

Lines 503, 537, 550, 577, 591 in the same file all correctly use `SafeERC20.safeTransfer`. Line 608 is the sole exception.

**Impact:** Any project using this hook with ERC-20 tier splits to beneficiary addresses is permanently unable to receive USDT payments.

**Fix:**
```solidity
if (!SafeERC20.trySafeTransfer(IERC20(token), split.beneficiary, amount)) return false;
```

!!! Admin note: ok, fix. Adding USDT tests throughout all repo's test suites would actually be super helpful if it is a unique coin in some respects. Anything else that would break with USDT in the mix?

---

### M-3: `claimCollectionOwnershipOf` breaks all `mintFrom()` calls (croptop-core-v6)

**Severity:** MEDIUM (KNOWN/ACCEPTED — documented in NatSpec, tested)
**File:** `src/CTDeployer.sol:226-237`

`claimCollectionOwnershipOf()` transfers hook ownership from CTDeployer to the project NFT owner. CTPublisher's existing `ADJUST_721_TIERS` permission (granted from CTDeployer) becomes inert because the hook now resolves its owner via `PROJECTS.ownerOf(projectId)`, not CTDeployer.

**Impact:** All new-tier minting via `mintFrom()` is blocked. Existing-tier minting (reusing URIs) still works. Recovery: project owner grants CTPublisher `ADJUST_721_TIERS` permission via `JBPermissions.setPermissionsFor()`.

**Status:** Documented in NatSpec at `CTDeployer.sol:219-224`. Test file `test/ClaimCollectionOwnership.t.sol` covers this (6 tests).

---

### M-4: Failed-return retention breaks outfit category exclusivity (banny-retail-v6)

**Severity:** MEDIUM
**File:** `src/Banny721TokenUriResolver.sol:1435-1465`

When a NonReceiverContract owns a body and outfit return fails, `_storeOutfitsWithRetained` merges new outfits + retained old outfits WITHOUT revalidating category exclusivity. The conflict check at L1321-1337 only validates NEW outfits in isolation.

**Trigger:**
1. NonReceiverContract owns body B, equips HEAD outfit H
2. Redecorates with EYES outfit E — conflict check passes (only checks new outfits)
3. H return fails → retained. Final state: `[E, H]` — HEAD and EYES coexist, violating category exclusivity

**Impact:** Breaks the contract's explicit category exclusivity guarantee. Visual artifact in SVG rendering. No fund loss.

**Fix:** Revalidate category exclusivity on the merged set after retention:
```solidity
_validateCategoryExclusivity(hook, mergedOutfitIds);
```

Admin note: ok, fix

---

## LOW Findings

### L-1: `_feeFreeSurplusOf` unbounded accumulation via payout-to-self cycles (nana-core-v6)

**Severity:** LOW
**File:** `src/JBMultiTerminal.sol:370-371`

When a project's payout splits pay itself back via the same terminal, `_feeFreeSurplusOf` increments with no cap relative to actual balance. After N ruleset cycles, the counter reaches N×balance while balance stays constant. All future zero-tax cash outs get the 2.5% fee applied. No fund extraction — fee goes to project #1.

Admin note: ok, fix?

---

### L-2: `_feeFreeSurplusOf` not cleared on terminal migration (nana-core-v6)

**Severity:** LOW
**File:** `src/JBMultiTerminal.sol:474-519`

`migrateBalanceOf` zeroes `balanceOf` but leaves `_feeFreeSurplusOf` untouched. If the project returns to the same terminal, stale values cause unexpected fees on zero-tax cash outs.

Admin note: ok, fix? idk, wyt?

---

### L-3: Phantom balance on post-migration held fee processing revert (nana-core-v6)

**Severity:** LOW
**File:** `src/JBMultiTerminal.sol:594-641`

After migration, if `processHeldFeesOf` reverts during fee processing, the catch block credits `balanceOf` without tokens arriving — creating a phantom balance bounded by 2.5% of held fees. Documented as accepted trade-off at L581-587.

---

### L-4: Weight decay DoS for projects with tiny duration (nana-core-v6)

**Severity:** LOW
**File:** `src/JBRulesets.sol:613-686`

Projects with `duration=1` and `weightCutPercent!=0` hit `WeightCacheRequired` revert after ~5.5 hours without interaction. Fixable via permissionless `updateRulesetWeightCache` calls.

Admin note: ok, fix? what do you suggest?

---

### L-5: `processSplitWith` balance check inflated by fee tokens (univ4-lp-split-hook-v6)

**Severity:** LOW
**File:** `src/JBUniswapV4LPSplitHook.sol:644`

When `projectToken == feeProjectToken`, fee tokens inflate `balanceOf(this)`. Defense-in-depth check passes even if the controller didn't transfer enough tokens.

Admin note: ok, fix

---

### L-6: Constructor missing zero-address checks for `permit2` and `oracleHook` (univ4-lp-split-hook-v6)

**Severity:** LOW
**File:** `src/JBUniswapV4LPSplitHook.sol:199-221`

Constructor validates `directory`, `tokens`, `poolManager`, `positionManager` for address(0) but not `permit2` or `oracleHook`. In practice, deployment script uses hardcoded canonical addresses.

Admin note: ok, fix? do we really need to validate in constructor? can we assume we'll pass in correct values?

---

### L-7: Deploy.s.sol non-idempotent deployment — fee project created before singleton check (revnet-core-v6)

**Severity:** LOW
**File:** `script/Deploy.s.sol:344-382`

`deploy()` creates a fresh fee project before checking if singletons exist. Retry after partial failure creates a different fee project ID and cannot rediscover the original singleton. Sphinx mitigates in practice.

---

### L-8: Loan-ID namespace cap not enforced in three minting paths (revnet-core-v6)

**Severity:** LOW
**File:** `src/REVLoans.sol:584, 1183, 1312`

`totalLoansBorrowedFor[revnetId]` increment paths don't check against `_ONE_TRILLION`. Requires 1 trillion loans — beyond realistic usage.

---

### L-9: Missing `accountingContextsOf` guard in NATIVE/WETH equivalence path (nana-router-terminal-v6)

**Severity:** LOW
**File:** `src/JBRouterTerminal.sol:1685-1690`

Step 2b (NATIVE/WETH equivalence) lacks the `accountingContextsOf().length != 0` guard that step 2 has. If a project owner sets the router as primary terminal for WETH, self-referential routing causes gas exhaustion. Requires owner misconfiguration.

Admin note: ok, fix?

---

### L-10: Registry `_acceptFundsFor` returns nominal amount instead of balance delta (nana-router-terminal-v6)

**Severity:** LOW
**File:** `src/JBRouterTerminalRegistry.sol:478-480`

Fee-on-transfer tokens through the registry revert cleanly. Documented as intentional at L466-468.

---

### L-11: Registry Permit2 `catch{}` lacks event emission (nana-router-terminal-v6)

**Severity:** LOW
**File:** `src/JBRouterTerminalRegistry.sol:470-471`

Router emits `Permit2AllowanceFailed` on Permit2 failure; registry has silent `catch {}`. Operational observability gap.

Admin note: ok, fix.

---

### L-12: `discoverPool()` V3-only wrapper returns address(0) when V4 pool wins (nana-router-terminal-v6)

**Severity:** LOW
**File:** `src/JBRouterTerminal.sol:196-206`

View function only. Internal routing correctly uses both V3+V4 via `_discoverPool()`. External integrators should use `discoverBestPool()`.

Admin note: ok, fix?

---

### L-13: Default terminal DoS after `disallowTerminal` (nana-router-terminal-v6)

**Severity:** LOW
**File:** `src/JBRouterTerminalRegistry.sol:297-304`

When owner disallows the current default terminal, `defaultTerminal` set to address(0). Unlocked projects relying on default get DoS'd. Recoverable by `setDefaultTerminal()`. Admin trust assumption.

Admin note: probably shouldnt be allowed to disallow current default terminal without first replacing it. fix. also make sure this is accounted for in buyback registry too 

---

### L-14: Short TWAP window silent degradation (nana-router-terminal-v6)

**Severity:** LOW
**File:** `src/JBRouterTerminal.sol:1261-1265`

`MIN_TWAP_WINDOW` of 120s allows a 2-minute TWAP which offers less manipulation resistance than the intended 10-minute window. Sigmoid slippage formula provides additional protection (2% floor).

Admin note: fix?

---

### L-15: `useReserveBeneficiaryAsDefault` retroactively inflates `totalCashOutWeight` (nana-721-hook-v6)

**Severity:** LOW
**File:** `src/JB721TiersHookStore.sol:914-921`

Setting `useReserveBeneficiaryAsDefault = true` via `adjustTiers` retroactively creates pending reserves for existing tiers that previously had no beneficiary. 50 NFTs minted from a tier with reserveFrequency=5 suddenly gain 10 pending reserves, diluting cash-out value by ~17%.

---

### L-16: ERC-20 tokens stuck in hook with no recovery path (nana-721-hook-v6)

**Severity:** LOW
**File:** `src/libraries/JB721TiersHookLib.sol:374-380`

When `_sendPayoutToSplit` returns false AND `_addToBalance` reverts, ERC-20 tokens remain in the hook with no built-in recovery mechanism.

---

### L-17: Code comment falsely claims ERC-20 tokens can be recovered by project owner (nana-721-hook-v6)

**Severity:** LOW
**File:** `src/libraries/JB721TiersHookLib.sol:378-380`

No `recover` or `sweep` function exists. Comment is inaccurate.

Admin note: fix

---

### L-18: `recordSetDiscountPercentOf` does not check tier removal bitmap (nana-721-hook-v6)

**Severity:** LOW
**File:** `src/JB721TiersHookStore.sol:1190-1212`

Owner can set a discount on a removed tier. No economic impact — removed tiers can't be minted from.

Admin note: might as well fix?

---

### L-19: Implementation contract can be initialized (nana-721-hook-v6)

**Severity:** LOW
**File:** `src/JB721TiersHook.sol`

Anyone can call `initialize()` on the implementation contract. No impact — clones have separate storage, implementation holds no funds.

Admin note: might as well fix?

---

### L-20: `FEE()` call inside try success handler — uncaught revert path (univ4-router-v6)

**Severity:** LOW
**File:** `src/JBUniswapV4Hook.sol:228`

`FEE()` is called inside the try success handler, not the try expression. If a non-standard terminal doesn't implement `IJBFeeTerminal`, the revert propagates uncaught. Standard `JBMultiTerminal` always implements `FEE` as a constant — not affected.

Admin note: fix?

---

### L-21: Persistent storage for `_routing` flag — gas optimization (univ4-router-v6)

**Severity:** LOW
**File:** `src/JBUniswapV4Hook.sol:144, 950, 1004`

Uses persistent storage instead of EIP-1153 transient storage (available on Cancun). ~22,700 gas overhead per JB-routed swap. Functionally correct.

Admin note: fix?

---

### L-22: int56 `tickCumulative` overflow after ~1.4 years (univ4-router-v6)

**Severity:** LOW
**File:** `src/libraries/Oracle.sol:56`

At max tick (887,272) with continuous accumulation, overflow occurs after ~1.4 years. Documented in code comments and RISKS.md. Matches Uniswap V3's oracle design.

---

### L-23: `hookData` length check inconsistency (univ4-router-v6)

**Severity:** LOW
**File:** `src/JBUniswapV4Hook.sol:625 vs 573`

`_beforeSwap` uses strict `== 32`, `_afterSwap` uses permissive `>= 32`. Safe because `_beforeSwap` executes first. Cosmetic inconsistency.

Admin note: fix?

---

### L-24: Static weight estimation divergence (univ4-router-v6)

**Severity:** LOW
**File:** `src/JBUniswapV4Hook.sol:260-266`

Estimation uses static ruleset `weight`, not data-hook-adjusted weight. Documented in NatSpec and RISKS.md.

Admin note: fix?

---

### L-25: Conservative sell-side estimation (univ4-router-v6)

**Severity:** LOW
**File:** `src/JBUniswapV4Hook.sol:226-229`

Always deducts protocol fee (even for feeless addresses). Biases routing toward V4. Intentionally conservative.

---

### L-26: Both-JB-tokens buy-side-only evaluation (univ4-router-v6)

**Severity:** LOW
**File:** `src/JBUniswapV4Hook.sol:668-671`

When both tokens are JB project tokens, only buy-side evaluated. Gas optimization. Both-JB-token pools are uncommon.

Admin note: fixable? worth it?

---

### L-27: Deployment script address verification (univ4-router-v6)

**Severity:** LOW
**File:** `script/Deploy.s.sol:62-76`

All addresses verified correct for this repo. Noted that other repos have incorrect PoolManager addresses.

---

### L-28: Registry pay path reverts when no hook configured (nana-buyback-hook-v6)

**Severity:** LOW
**File:** `src/JBBuybackHookRegistry.sol:304-321`

`beforePayRecordedWith` calls `hook.beforePayRecordedWith()` on address(0) when no default hook is set. Cash-out path has the address(0) guard but pay path doesn't. Intentional — no safe fallback for pay path. Deploy.s.sol always calls `setDefaultHook()`.

---

### L-29: `setPoolFor(PoolKey)` allows non-oracle hooks (nana-buyback-hook-v6)

**Severity:** LOW
**File:** `src/JBBuybackHook.sol:431-462`

The PoolKey overload doesn't validate `poolKey.hooks == ORACLE_HOOK`. Pool is permanently set (one-shot). Result: permanent mint-only mode. Self-inflicted by project owner. The simplified overload always uses the correct oracle hook.

---

### L-30: `setTwapWindowOf` does not validate `_poolIsSet` (nana-buyback-hook-v6)

**Severity:** LOW
**File:** `src/JBBuybackHook.sol:493-516`

Allows setting TWAP window for a non-existent pool. Value is harmless — overwritten by `_setPoolFor`. Could cause operator confusion.

Admin note: ok, fix?

---

### L-31: ERC2771 `_msgSender()` in bridge authentication paths (nana-suckers-v6)

**Severity:** LOW
**File:** `src/JBSucker.sol:478-480`, `src/JBCCIPSucker.sol:131-133`

Bridge auth uses `_msgSender()` which resolves through trusted forwarder. Current OZ `ERC2771Forwarder` requires ECDSA signatures from the `from` address (contracts can't produce these). Defense-in-depth concern — bridge messengers never use meta-transactions.

**Fix:** Use `msg.sender` directly in bridge auth paths.

Admin note: ok, verify, and if fixed add comments so future auditors dont revert.

---

### L-32: `mapTokens()` ETH permanently stuck when no root flush needed (nana-suckers-v6)

**Severity:** LOW
**File:** `src/JBSucker.sol:542-572`

ETH stuck when `numberToDisable == 0` (all enables, or disables with already-flushed outboxes). NatSpec warns about scenario 1 but not scenario 2.

---

### L-33: Fee payment best-effort bypass (nana-suckers-v6)

**Severity:** LOW
**File:** `src/JBSucker.sol:711-727`

When fee terminal reverts, fee silently redirected to bridge transport. Not attacker-controllable. Availability-over-correctness design choice.

---

### L-34: Quorum uses live tier supply, not snapshotted (defifa-collection-deployer-v6)

**Severity:** LOW
**File:** `src/DefifaGovernor.sol:423-443`

Currently safe — SCORING phase blocks all supply changes. Fragile: relies on implicit coupling between cash-out weight system and governance.

Admin note: should we improve? how so?

---

### L-35: Zero slippage protection on fulfillment payouts (defifa-collection-deployer-v6)

**Severity:** LOW
**File:** `src/DefifaDeployer.sol:335`

`sendPayoutsOf()` called with `minTokensPaidOut: 0`. Safe for native ETH games (no swap). Theoretical risk for ERC-20 games.

Admin note: only thing we could do here is first call previewPay. but might be overkill. recipient should have their own slippage protection in their pay hook.

---

### L-36: Integer division dust permanently locked (defifa-collection-deployer-v6)

**Severity:** LOW
**File:** `src/DefifaHookLib.sol:132`

Max 128 wei per game locked from rounding. Economically insignificant.

---

### L-37: Sentinel value (1 wei) accounting error after failed fulfillment (defifa-collection-deployer-v6)

**Severity:** LOW
**File:** `src/DefifaDeployer.sol:340`

`fulfilledCommitmentsOf[gameId] = 1` sentinel causes `currentGamePotOf(true)` to overstate by 1 wei. Display-only.

---

### L-38: No reentrancy guards — CEI-only defense (defifa-collection-deployer-v6)

**Severity:** LOW
**File:** Multiple in `src/DefifaDeployer.sol`

All reentrancy protection relies on CEI ordering and idempotency guards. Currently correct. Fragile for future refactoring.

Admin note: prefer sound function order design without slapping modifier reentrency protection just because.

---

### L-39: External calls in view function — token URI resolver (defifa-collection-deployer-v6)

**Severity:** LOW
**File:** `src/DefifaTokenUriResolver.sol`

`tokenUriOf()` makes external view calls. Only affects off-chain metadata reads.

---

### L-40: `_opsOf` written before project ID assertion (defifa-collection-deployer-v6)

**Severity:** LOW
**File:** `src/DefifaDeployer.sol`

Predicted game ID used before assertion. `assert` reverts entire transaction atomically, so stale writes are rolled back. Uses all remaining gas on failure.

Admin note: fix?

---

### L-41: Fee terminal address(0) reverts all `mintFrom()` calls (croptop-core-v6)

**Severity:** LOW
**File:** `src/CTPublisher.sol:413-428`

If fee project's primary ETH terminal is removed, all paid minting across all Croptop projects is blocked. Recoverable by re-adding terminal.

Admin note: should we try catch? worth it?

---

### L-42: Old owner retains 4 permissions after project NFT transfer (croptop-core-v6)

**Severity:** LOW
**File:** `src/CTDeployer.sol:335-349`

Permissions granted from CTDeployer persist after NFT transfer. Effectively inert after `claimCollectionOwnershipOf()`. Documented.

---

### L-43: `tiersFor()` view returns stale data for removed tiers (croptop-core-v6)

**Severity:** LOW
**File:** `src/CTPublisher.sol`

Off-chain UIs see tier data for URIs no longer mintable. `_setupPosts()` correctly detects removed tiers at mint time. Documented.

Admin note: anything to do here to improve?

---

### L-44: Cannot fully disable a configured posting category (croptop-core-v6)

**Severity:** LOW
**File:** `src/CTPublisher.sol`

`configurePostingCriteriaFor()` requires `minimumTotalSupply > 0`. No separate disable function. Workaround: empty allowlist. Documented.

Admin note: anything to do here?

---

### L-45: Deployment CREATE2 address mismatch in `_isDeployed` (banny-retail-v6)

**Severity:** LOW
**File:** `script/Deploy.s.sol:430-448`

`_isDeployed` uses Arachnid proxy as deployer but actual deployment uses Solidity's `new {salt}` (different deployer). Idempotence check broken.

Admin note: this isnt true. it works.

---

### L-46: Reflexive controller validation can be spoofed (nana-omnichain-deployers-v6)

**Severity:** LOW
**File:** `src/JBOmnichainDeployer.sol:872-876`

`_validateController` queries `controller.DIRECTORY()` — a malicious controller can return a fake directory. Requires `LAUNCH_RULESETS`/`QUEUE_RULESETS` permission. Real project state unaffected.

Admin note: anything to do here?

---

### L-47: `_launchRulesetsFor` lacks ruleset ID prediction guard (nana-omnichain-deployers-v6)

**Severity:** LOW
**File:** `src/JBOmnichainDeployer.sol:715-757`

`_queueRulesetsOf` has the `latestRulesetId >= block.timestamp` guard; `_launchRulesetsFor` doesn't. Unreachable in practice — `launchRulesetsFor` requires no existing rulesets.

---

### L-48: No post-hoc validation of returned ruleset IDs (nana-omnichain-deployers-v6)

**Severity:** LOW
**File:** `src/JBOmnichainDeployer.sol:751, 817`

Project ID is validated post-hoc but ruleset IDs are not. Safe under current core protocol ID assignment logic.

---

### L-49: Constructor lacks explicit project existence check (nana-ownable-v6)

**Severity:** LOW
**File:** `src/JBOwnableOverrides.sol:53-83`

If `initialProjectIdOwner` refers to a non-existent project, `PROJECTS.ownerOf()` reverts with opaque ERC-721 error instead of clear `ProjectDoesNotExist`. Documented as intentional in NatSpec.

---

### L-50: `_emitTransferEvent` asymmetric try-catch behavior (nana-ownable-v6)

**Severity:** LOW
**File:** `src/JBOwnable.sol:64-78`

Read paths (`owner()`, `_checkOwner()`) use try-catch; write path (`_emitTransferEvent`) does not. Intentional — strict failure on writes prevents event/state inconsistency. Documented in NatSpec.

---

### L-51: Deploy script idempotency check uses wrong CREATE2 deployer (nana-address-registry-v6)

**Severity:** LOW
**File:** `script/Deploy.s.sol:28-38`

`_isDeployed` uses Arachnid deterministic-deployment-proxy address but `run()` deploys via Sphinx (different deployer). Sphinx handles idempotency at framework level.

Admin note: not true.

---

### L-52: Missing Sphinx emergency developer configuration (nana-address-registry-v6)

**Severity:** LOW
**File:** `script/Deploy.s.sol:13`

TODO comment indicates JB Emergency Developers should be configured but haven't been added. Near-zero impact for this permissionless registry with no admin functions.

---

### L-53: `NANA_START_TIME` is in the past with no functional effect (nana-fee-project-deployer-v6)

**Severity:** LOW
**File:** `script/Deploy.s.sol:52`

`NANA_START_TIME = 1,740,089,444` (Feb 2025) passed as `startsAtOrAfter`. JBRulesets uses `max(block.timestamp, mustStartAtOrAfter)` — constant has zero effect. Potentially misleading for token economics planning.

---

### L-54: Operator split is unlocked (`lockedUntil: 0`) (nana-fee-project-deployer-v6)

**Severity:** LOW
**File:** `script/Deploy.s.sol:115-123`

Operator split directs 100% of reserved tokens to the Sphinx multisig with `lockedUntil: 0`. Multisig can change split at any time. Documented trust assumption in RISKS.md.

---

## INFORMATIONAL Findings

### I-1: Cash-out swap path has no try/catch — unlike pay path (nana-buyback-hook-v6)

**File:** `src/JBBuybackHook.sol`

Pay path uses try/catch with mint fallback; cash-out path does not. Intentional — cash-out mints tokens BEFORE swap, so a silent failure would inflate supply. Hard revert is correct.

---

### I-2: Empty `hookMetadata` yields zero slippage protection (nana-buyback-hook-v6)

**File:** `src/JBBuybackHook.sol:210-214`

When `hookMetadata.length == 0`, `minimumSwapAmountOut = 0`. Only occurs if a different data hook returns a specification pointing to the buyback hook. Normal flow always populates metadata.

---

### I-3: Arbitrum cross-batch token fungibility (nana-suckers-v6)

**File:** `src/JBSucker.sol`

On Arbitrum, leftover tokens from a previous batch can satisfy claims from a new batch whose tokens haven't arrived. Economically sound (tokens fungible). May confuse off-chain monitoring.

---

### I-4: Event emission reflects intent, not final state (banny-retail-v6)

**File:** `src/Banny721TokenUriResolver.sol:1005-1007`

`DecorateBanny` event emitted BEFORE execution. Background abort or outfit retention causes event/state divergence. Off-chain indexers should re-read `assetIdsOf()`.

Admin note: anything to fix here?

---

### I-5: Retained outfits accumulate in attachment array (banny-retail-v6)

**File:** `src/Banny721TokenUriResolver.sol:1451-1463`

Repeated redecorations by NonReceiverContract grow the array by +1 per failed return. Self-inflicted gas grief bounded by actual NFTs equipped.

Admin note: anything to fix here?

---

### I-6: Simplified overloads set `useDataHookForCashOut = false` by default (nana-omnichain-deployers-v6)

**File:** `src/JBOmnichainDeployer.sol`

By design — simplified path for projects without 721 cashout support. Explicit overloads with `JBOmnichain721Config` allow setting the flag.

---

### I-7: Cash out spec merge hardcodes 721 hook to single specification (nana-omnichain-deployers-v6)

**File:** `src/JBOmnichainDeployer.sol:204-206`

Takes only `tiered721HookSpecifications[0]`. `JB721TiersHook` always returns exactly 0 or 1 spec. Documented.

---

## Clean Repos

### nana-permission-ids-v6

All 33 permission ID constants verified: unique (1-33, no gaps), correctly typed (`uint8 internal constant`), properly documented, and consistently used across the ecosystem. 5 invariants verified. Cross-repo verification confirmed correct usage across 7 consuming repos.

### deploy-all-v6

No Claude nemesis findings were produced for this repo (only Codex findings exist in the findings directory).
