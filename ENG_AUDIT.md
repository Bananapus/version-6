# Engineering Audit Findings — Juicebox V6 Test Hardening

**Date:** 2026-03-22
**Scope:** Cross-repo hook composition tests across 15 repos
**Total new tests:** 30 (across 8 phases, all passing)

---

## Phase 1: LP Split Hook Reentrancy (univ4-lp-split-hook-v6)

### INFO-01: State ordering provides sufficient reentrancy protection
**Affected:** `JBUniswapV4LPSplitHook.sol` — `deployPool`, `processSplitWith`, `rebalanceLiquidity`, `collectAndRouteLPFees`
**Status:** SAFE — no ReentrancyGuard needed

Three reentrancy vectors tested:

1. **Double-accumulation via re-entrant processSplitWith during deployPool:** `deployedPoolCount++` at line 582 executes BEFORE `_addUniswapLiquidity` (which makes external calls at line 745). Re-entry into `processSplitWith` sees `deployedPoolCount > 0` and takes the burn path instead of accumulating. No double-accumulation possible.

2. **Re-entrant rebalanceLiquidity during fee collection:** `rebalanceLiquidity` requires `SET_BUYBACK_POOL` permission. A re-entering fee terminal would not have this permission. Additionally, `_burnExistingPosition` does NOT zero `tokenIdOf`, but permission checks block unauthorized re-entry.

3. **Double fee collection via re-entrant collectAndRouteLPFees:** After the first `collectAndRouteLPFees` call collects fees from the PositionManager, `collectableAmount0/1` are cleared. A re-entrant second call collects 0 fees. Idempotent.

**Recommendation:** No production code change needed. State ordering + permission checks + idempotent fee collection provide layered defense.

---

## Phase 2: Hook Composition with Fee Verification (deploy-all-v6)

### INFO-02: Dual fee path — terminal-level + hook-level
**Affected:** `JBMultiTerminal.cashOutTokensOf()` lines 1096-1144, `REVDeployer.afterCashOutRecordedWith()` lines 614-669
**Status:** By design

During cashout, fees flow through TWO independent paths:
1. **Terminal fee:** `_takeFeeFrom()` → `_processFee()` → internal `_pay()` (lines 1138-1144)
2. **REVDeployer hook fee:** `afterCashOutRecordedWith()` → external `feeTerminal.pay()` (line 637)

Both independently credit the fee project. If the hook fee fails (try-catch at line 646), funds return to the project via `addToBalanceOf`. Terminal fee is unaffected.

**Implication:** External mocking of `pay()` only blocks path 2. Path 1 always succeeds via internal call.

### INFO-03: Weight scaling with 721 tier splits is mathematically correct
**Affected:** `REVDeployer.beforePayRecordedWith()` lines 378-382
**Status:** SAFE

Verified: `weight = weight * projectAmount / totalAmount` where `projectAmount = totalAmount - splitAmount`. With 30% tier split, payer receives exactly 70% of no-split tokens. No token credit for the split portion.

### INFO-04: Zero cashOutTaxRate correctly bypasses all fee logic
**Affected:** `REVDeployer.beforeCashOutRecordedWith()` line 275
**Status:** SAFE

When `cashOutTaxRate == 0`, REVDeployer proxies directly to buyback hook. No fee spec is created. Fee project balance is unchanged. Verified with 0% tax on both stages.

### INFO-05: Fee project balance monotonically increases across cashouts
**Affected:** `JBMultiTerminal`, `REVDeployer`
**Status:** INVARIANT HOLDS

Tested across multiple sequential cashouts from different holders. Fee project balance never decreases. Holds regardless of bonding curve position or cashout size.

### MEDIUM-01: Post-pool sell-side cashouts vulnerable to TWAP/slippage mismatch
**Affected:** `JBBuybackHook.afterCashOutRecordedWith()`, `REVDeployer._tryInitializeBuybackPoolFor()`
**Status:** Fixed

**Root cause:** `REVDeployer` initialized buyback pools at a hardcoded 1:1 price (`sqrtPriceX96 = 1 << 96`) regardless of the project's issuance rate. For a 1000 tokens/ETH project, the pool priced each token at 1 ETH (1000x overvalued). The TWAP oracle inherited this price, computing impossibly high minimum swap outputs that caused `JBBuybackHook_SpecifiedSlippageExceeded` on sell-side cashouts.

**Fix:** `_tryInitializeBuybackPoolFor` now accepts `initialIssuance` and computes the correct `sqrtPriceX96` from the first stage's issuance rate using `sqrt(mulDiv(issuance, 2^192, 1e18))`. Pools start at fair value, eliminating the early DoS window for new revnets.

**Key asymmetry (still by design):** Pay-side uses try-catch with fallback to minting. Sell-side has NO fallback — entire tx reverts. This is inherent (can't "un-burn" tokens), but with correct pool init price the slippage window is dramatically narrowed.

**Mitigation:** Users can still force the bonding curve path by passing explicit `cashOutMinReclaimed` metadata to bypass the buyback hook.

---

## Phase 4: Fee Project Deployer (nana-fee-project-deployer-v6)

### INFO-06: Recursive fee on fee project cashout terminates correctly
**Affected:** `REVDeployer.afterCashOutRecordedWith()`, `JBMultiTerminal._pay()`
**Status:** SAFE

When cashing out from fee project #1, the 2.5% fee routes back to project #1 via `feeTerminal.pay()`. This does NOT cause infinite recursion because the fee payment through `_pay` does not itself generate further fees. The recursive fee mints additional tokens to the cashout beneficiary.

### INFO-07: Fee project issuance cut applies correctly after one year
**Affected:** `REVDeployer` ruleset configuration
**Status:** VERIFIED

After 361 days past the `issuanceCutFrequency`, the second payment yields ~62% of the first payment's token rate, matching the 38% decay formula.

---

## Phase 7: Approval Hook Weight Cache Boundary (nana-core-v6)

### INFO-08: Weight cache boundary at 20,000 iterations works correctly
**Affected:** `JBRulesets.currentOf()`, `updateRulesetWeightCache()`
**Status:** VERIFIED

- Under threshold (19,999 cycles): `currentOf()` succeeds with correct decayed weight, gas < 30M.
- Past threshold (20,001 cycles) without cache: reverts with `JBRulesets_WeightCacheRequired`.
- After `updateRulesetWeightCache()`: succeeds with correct weight.
- Far past (40,001 cycles): requires TWO sequential cache updates (each handles up to 20,000 iterations).

### INFO-09: Approval hook rejection falls back correctly with cached weight
**Affected:** `JBRulesets.currentOf()`
**Status:** VERIFIED

When a queued ruleset's approval hook rejects it, `currentOf()` falls back to the original ruleset using cached weight values. This works correctly across both within-threshold and past-threshold scenarios.

---

## Findings Summary

| ID | Severity | Component | Finding |
|----|----------|-----------|---------|
| INFO-01 | Info | LP Split Hook | State ordering reentrancy protection sufficient |
| INFO-02 | Info | Terminal + REVDeployer | Dual fee path (terminal + hook) |
| INFO-03 | Info | REVDeployer | Weight scaling with tier splits correct |
| INFO-04 | Info | REVDeployer | Zero tax bypasses fees correctly |
| INFO-05 | Info | Terminal + REVDeployer | Fee monotonicity invariant holds |
| MEDIUM-01 | Medium | BuybackHook + REVDeployer | Pool init price fixed; sell-side asymmetry remains by design |
| INFO-06 | Info | Fee Project | Recursive fee terminates correctly |
| INFO-07 | Info | Fee Project | Issuance cut applies correctly |
| INFO-08 | Info | JBRulesets | Weight cache boundary works correctly |
| INFO-09 | Info | JBRulesets | Approval rejection + cache fallback correct |
| INFO-10 | Info | BuybackHook | Sell-side remint does not inflate supply |
| INFO-11 | Info | BuybackHook | Bonding curve noop path works correctly |
| INFO-12 | Info | BuybackHook + 721 Hook | Fungible cashout routes to buyback, not 721 |
| INFO-13 | Info | BuybackHook | Sandwich attack is temporary DoS only |
| INFO-14 | Info | JBTerminalStore | Pending reserved tokens included in totalSupply |
| INFO-15 | Info | JBTerminalStore | Distribution ordering does not affect reclaim |
| HIGH-01 | High | JBTerminalStore + REVDeployer | Reserved inflation reduces cashout by 89%+ at 80% reserved |
| INFO-16 | Info | JBMultiTerminal | Payout limit prevents split hook reentrancy |
| INFO-17 | Info | JBMultiTerminal | addToBalanceOf safe during split hook re-entry |
| INFO-18 | Info | REVDeployer | Sucker exemption bypasses all fees and hooks |
| INFO-19 | Info | REVDeployer | Sucker gets more ETH than non-sucker for same tokens |

---

## Phase 2B: Sell-Side Buyback Hook Composition (deploy-all-v6)

### INFO-10: Sell-side remint does not permanently inflate supply
**Affected:** `JBBuybackHook.afterCashOutRecordedWith()`
**Status:** SAFE

When the buyback hook routes a cashout through the pool, it burns tokens, remints them to itself, swaps through Uniswap V4, and sends proceeds to the beneficiary. The reminted tokens end up in the pool (not held permanently). Post-cashout `totalSupply <= pre-cashout totalSupply`. No permanent inflation.

### INFO-11: Bonding curve noop path works correctly
**Affected:** `JBBuybackHook.beforeCashOutRecordedWith()`
**Status:** SAFE

When pool liquidity is insufficient (bonding curve gives better deal), the buyback hook correctly returns `noop=true`. The terminal uses the bonding curve reclaim path. Standard REVDeployer fee flow applies.

### INFO-12: Fungible cashout correctly routes to buyback hook, not 721 hook
**Affected:** `REVDeployer.beforeCashOutRecordedWith()`
**Status:** SAFE

When a project has BOTH a 721 tier hook AND a buyback hook, fungible token cashouts correctly route through the buyback hook. The 721 hook's `beforeCashOutRecordedWith` (which would revert on `cashOutCount > 0`) is NOT called.

### INFO-13: Sandwich attack on sell-side is temporary DoS only
**Affected:** `JBBuybackHook.afterCashOutRecordedWith()`
**Status:** By design (see MEDIUM-01)

A sandwich attacker can front-run to move the pool price, causing the TWAP slippage check to fail. The cashout reverts but the user retains all tokens. Retrying with a smaller cashout succeeds. This is a temporary, self-correcting DoS — not a fund loss vector.

---

## Phase 3: Reserved Token Inflation + Hook Composition (deploy-all-v6)

### HIGH-01: Reserved inflation reduces cashout value by 89%+ at 80% reserved
**Affected:** `JBTerminalStore.recordCashOutFor()` — `totalTokenSupplyWithReservedTokensOf`
**Status:** CONFIRMED (known as H-4)

With 80% reserved tokens and 70% cashOutTaxRate:
- Payer holds 20% of actual minted supply but the bonding curve sees them as 20% of the INFLATED total supply (which includes pending reserved)
- Result: 89.21% reduction in reclaim value compared to 0% reserved
- This is by design — pending reserved tokens ARE part of the economic total supply — but the magnitude is severe

**Recommendation:** Document prominently for project deployers. Consider adding a warning when `splitPercent > 5000` (50%).

### INFO-14: Pending reserved tokens correctly included in totalSupply for bonding curve
**Affected:** `JBTerminalStore.recordCashOutFor()`
**Status:** VERIFIED

The `totalTokenSupplyWithReservedTokensOf` function includes pending (undistributed) reserved tokens in the total supply used for bonding curve calculations. This is consistent whether or not reserved tokens have been distributed.

### INFO-15: Distribution ordering does not affect reclaim amounts
**Affected:** `JBController.sendReservedTokensToSplitsOf()`, `JBTerminalStore.recordCashOutFor()`
**Status:** INVARIANT HOLDS

Reclaim amounts are identical whether reserved tokens are distributed before or after cashout. The `totalTokenSupplyWithReservedTokensOf` function correctly accounts for pending tokens in both cases, making the bonding curve output ordering-independent.

---

## Phase 5: Payout Split Reentrancy (deploy-all-v6)

### INFO-16: Payout limits prevent split hook reentrancy double-spend
**Affected:** `JBTerminalStore.recordPayoutFor()`, `JBMultiTerminal.sendPayoutsOf()`
**Status:** SAFE — no ReentrancyGuard needed

`recordPayoutFor()` increments `usedPayoutLimitOf` BEFORE any external calls to split hooks. When a malicious split hook re-enters `sendPayoutsOf()`, the re-entry fails with `JBTerminalStore_InadequateControllerPayoutLimit` because the payout limit is already consumed.

**Security property proven:** State-before-external-call pattern provides reentrancy protection without explicit ReentrancyGuard.

### INFO-17: addToBalanceOf is safe during split hook re-entry
**Affected:** `JBMultiTerminal.addToBalanceOf()`
**Status:** SAFE

A split hook that re-enters via `addToBalanceOf()` succeeds harmlessly — it just increases the project's recorded balance. No double-payout is possible because payout limits are already consumed.

---

## Phase 6: Sucker + Buyback Composition (deploy-all-v6)

### INFO-18: Sucker exemption correctly bypasses all fees and hooks
**Affected:** `REVDeployer.beforeCashOutRecordedWith()` lines 258-259
**Status:** VERIFIED

When `_isSuckerOf(revnetId, holder)` returns true, the REVDeployer returns `(0, cashOutCount, totalSupply, [])` — zero tax, full pro-rata reclaim, no hook specs. The buyback hook is NOT called. Fee project balance does NOT increase.

### INFO-19: Sucker gets strictly more ETH than non-sucker for same token count
**Affected:** `REVDeployer.beforeCashOutRecordedWith()`
**Status:** VERIFIED

Cashing out the same number of tokens: sucker receives full pro-rata share (0% tax, 0% fee), while non-sucker receives bonding-curve-adjusted reclaim minus 2.5% fee. The difference is significant at high tax rates (70%+ cashOutTaxRate).

---

## Test Inventory

| Phase | Repo | File | Tests | Gas (max) |
|-------|------|------|-------|-----------|
| 1 | univ4-lp-split-hook-v6 | `test/ReentrancyTest.t.sol` | 3 | 2.4M |
| 2 | deploy-all-v6 | `test/fork/HookCompositionFork.t.sol` | 5 | 5.5M |
| 2B | deploy-all-v6 | `test/fork/SellSideBuybackFork.t.sol` | 7 | 7.9M |
| 3 | deploy-all-v6 | `test/fork/ReservedInflationFork.t.sol` | 3 | 4.9M |
| 4 | nana-fee-project-deployer-v6 | `test/FeeProjectEdgeCases.t.sol` | 4 | 7.1M |
| 5 | deploy-all-v6 | `test/fork/PayoutReentrancyFork.t.sol` | 2 | 1.8M |
| 6 | deploy-all-v6 | `test/fork/SuckerBuybackFork.t.sol` | 2 | 5.4M |
| 7 | nana-core-v6 | `test/TestApprovalHookWeightCacheBoundary.t.sol` | 4 | 0.9M |
| **Total** | | | **30** | **< 30M** |

## Pre-existing Issues

- `test_eco_fullLifecycle` in `EcosystemFork.t.sol` previously failed with `JBBuybackHook_SpecifiedSlippageExceeded` due to oracle mock at tick=0 (1:1) vs 1000:1 issuance. **Fixed** — oracle mock now uses tick 69078 (≈1000 tokens/ETH), matching `INITIAL_ISSUANCE`. Pool init price in `REVDeployer` also fixed to compute fair `sqrtPriceX96` from `initialIssuance`.
- `CrossCurrencyFork.t.sol:981` had a type mismatch (`JBAccountingContext[]` vs `address[]` for `currentSurplusOf`). Fixed as part of this work.

## Confidence Assessment

| Area | Before | After | Rating |
|------|--------|-------|--------|
| LP Split Hook reentrancy | 0 tests | 3 tests | 9/10 |
| Hook composition fees | 0 tests | 5 tests | 9/10 |
| Sell-side buyback | 0 tests | 7 tests | 8/10 |
| Reserved inflation | 0 tests | 3 tests | 9/10 |
| Fee project edge cases | 1 test | 5 tests | 9/10 |
| Payout reentrancy | 0 tests | 2 tests | 9/10 |
| Sucker exemption | 0 tests | 2 tests | 9/10 |
| Weight cache boundary | 0 tests | 4 tests | 9/10 |
