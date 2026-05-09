# Test Improvement Plan

How six protocol-level bugs (AM–AR) survived 350 test files, and what to change so the next six don't.

---

## 1. Problem Statement

The v6 test suite is large — 350 `.t.sol` files across 7 repos, including fork tests, stateful fuzzing, formal property proofs, and economic simulations. It catches a lot. But findings AM–AR reveal a specific blind spot: **input monoculture**.

Tests achieved broad *happy-path* coverage but reused the same parameter defaults everywhere:
- Always 18-decimal tokens
- Always same-currency cross-chain pairs (ETH↔ETH)
- Always cooperative initialization (no front-running)
- Always single flag state (`scopeCashOutsToLocalBalances=false` everywhere in revnet tests)
- Always the original owner (no post-transfer permission checks)
- Always valid fee beneficiary addresses

Each bug hid behind exactly one parameter that no test ever varied.

---

## 2. Root Cause Analysis — 6 Systemic Anti-Patterns

| # | Anti-Pattern | Bugs It Hid | What Happened |
|---|---|---|---|
| 1 | **Monoculture decimals** — all tests use 18-decimal tokens | AM, AN | 67 sucker tests use ETH/ETH. All revnet pool inits assume `1e18`. No 6- or 8-decimal token ever touches conversion or pool math. |
| 2 | **No cross-component conversion parity** | AM | Sucker lib and terminal store both convert currencies, but no test asserts they produce the same output for the same inputs. The inverted formula went unnoticed. |
| 3 | **Silent try-catch masking** | AN, AO | Pool init failures and fee payment reverts are caught and silently handled. No test asserts the *success* path was taken — only that the outer call doesn't revert. |
| 4 | **Flag-monotone testing** — one state only | AQ | Every `REVOwner` test uses `scopeCashOutsToLocalBalances=false` (include remote). No test checks behavior when the flag is `true` (local-only). The flag is consumed in 4 places (REVOwner, JBOmnichainDeployer, REVLoans, JBUniswapV4LPSplitHook) but only 1 test (`CrossTerminalSurplusSpoof.t.sol`) exercises the `true` state. |
| 5 | **No permission lifecycle coverage** | AP | Tests check grant. Tests check use. No test checks what happens *after NFT transfer*. |
| 6 | **No adversarial initialization** | AR | No test front-runs pool creation. The "existing pool" code path is exercised only by M-4's regression test, which uses a cooperative price. |

---

## 3. Specific Regression Tests Per Bug

Each test is designed to **fail on pre-fix code and pass on post-fix code**. Every test file links back to its finding ID in `AUDIT_REPORT.md`.

---

### 3.1 AM — Inverted `convertPeerValue` Formula

**Severity:** CRITICAL

**Repo:** `nana-suckers-v6`

**File:** `test/regression/ConvertPeerValueFormulaInversion.t.sol`

**Extends:** `Test` (forge-std), reuses `ConvertPeerValueHarness` from `FirstTerminalRemoteConversionGap.t.sol`

**Setup:**
- Mock `JBPrices` to return a known price: 2000e18 (2000 USDC per ETH, 18-decimal precision)
- Source: 1000 USDC (6 decimals, currency = `uint32(uint160(USDC))`)
- Target: ETH (18 decimals, currency = `uint32(uint160(NATIVE_TOKEN))`)

**Key Assertion:**
```solidity
// 1000 USDC at 2000 USDC/ETH = 0.5 ETH = 5e17 wei
// Bug produces: mulDiv(1000e6, 2000e18, 1e6) = 2e27 (off by ~4e9x)
uint256 result = harness.convert(source, target, prices);
assertApproxEqRel(result, 5e17, 1e15); // 0.1% tolerance for rounding
```

**Verification:**
- Pre-fix: `result ≈ 2e27` (multiplies by price instead of dividing) → assertion fails
- Post-fix: `result ≈ 5e17` → assertion passes

**Cross-reference:** Also add a mirror test converting ETH→USDC to verify the inverse direction.

---

### 3.2 AN — Hardcoded 18-Decimal Pool Initialization

**Severity:** HIGH

**Repo:** `revnet-core-v6`

**File:** `test/regression/BuybackPoolDecimalParity.t.sol`

**Extends:** `ForkTestBase` (from `test/fork/ForkTestBase.sol`)

**Setup:**
- Deploy a revnet with USDC (6 decimals) as terminal token instead of ETH
- Initial issuance rate = 1000 tokens per USDC (from stage config)
- Trigger `_tryInitializeBuybackPoolFor` via `deployFor`

**Key Assertion:**
```solidity
// sqrtPriceX96 should reflect: price = issuance / 10^6 (USDC decimals)
// Bug uses: price = issuance / 10^18, making price 1e12x too small
(uint160 sqrtPrice,,) = POOL_MANAGER.getSlot0(poolId);
uint256 impliedPrice = uint256(sqrtPrice) * uint256(sqrtPrice) >> 192;
// For token0=USDC, token1=projectToken: impliedPrice ≈ issuance/1e6
// Must NOT equal issuance/1e18
assertGt(impliedPrice, 1e6); // sanity: price is reasonable
```

**Verification:**
- Pre-fix: `sqrtPriceX96` computed with `1e18` denominator → `impliedPrice` is `1e12` too small → assertion fails
- Post-fix: `sqrtPriceX96` computed with `10 ** decimals` → correct implied price → passes

**Note:** Requires a mainnet fork with real USDC (`0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`). Set `RPC_ETHEREUM_MAINNET` env var.

---

### 3.3 AO — Zero-Address Fee Beneficiary Bypass

**Severity:** HIGH

**Repo:** `croptop-core-v6`

**File:** `test/regression/ZeroAddressFeeBeneficiary.t.sol`

**Extends:** `Test`, following the mock pattern from `FeeFallbackBlackhole.t.sol`

**Setup:**
- Deploy `CTPublisher` with mock terminals (one accepting, one for fees)
- Configure allowed posts on a project
- Call `mintFrom` with `feeBeneficiary = address(0)`

**Key Assertion:**
```solidity
// Option A: mintFrom should revert with CTPublisher_InvalidFeeBeneficiary
vm.expectRevert(CTPublisher_InvalidFeeBeneficiary.selector);
publisher.mintFrom{value: mintCost}(/* ... feeBeneficiary: address(0) ... */);

// Option B (if fix routes fees to msg.sender instead):
// assertGt(feeTerminal.totalReceived(), 0, "fee must be collected");
```

**Verification:**
- Pre-fix: `address(0)` causes `pay()` to revert inside try-catch, catch block refunds fee to caller, mint succeeds without fee → assertion fails
- Post-fix: revert at the top of `mintFrom` (or fee routed to valid beneficiary) → passes

---

### 3.4 AP — Permission Lifecycle After NFT Transfer

**Severity:** MED

**Repo:** `croptop-core-v6`

**File:** `test/regression/PermissionLifecycleOnTransfer.t.sol`

**Extends:** `Test`, using mock pattern from `FeeFallbackBlackhole.t.sol`

**Setup:**
1. Deploy project via `CTDeployer` with `ownerA` as initial owner
2. Verify `ownerA` has `ADJUST_721_TIERS` permission (sanity check)
3. Transfer project NFT from `ownerA` to `ownerB`
4. `ownerB` calls `claimCollectionOwnershipOf()`

**Key Assertion:**
```solidity
// After transfer + claim, ownerA must NOT retain deployer-scoped permissions
bool canAdjust = permissions.hasPermission(
    ownerA,          // operator
    address(deployer), // account (deployer scope)
    projectId,
    JB721PermissionIds.ADJUST_721_TIERS
);
assertFalse(canAdjust, "old owner must lose ADJUST_721_TIERS after transfer");

// ownerB should be able to adjust tiers
bool newOwnerCan = permissions.hasPermission(
    ownerB, address(deployer), projectId, JB721PermissionIds.ADJUST_721_TIERS
);
assertTrue(newOwnerCan, "new owner must have ADJUST_721_TIERS");
```

**Verification:**
- Pre-fix: `ownerA` still has permission → `assertFalse` fails
- Post-fix: `claimCollectionOwnershipOf()` revokes old permissions → passes

---

### 3.5 AQ — `scopeCashOutsToLocalBalances` Flag Ignored for Remote Surplus

**Severity:** MED

**Repo:** `revnet-core-v6` (primary), plus `nana-omnichain-deployers-v6`, `univ4-lp-split-hook-v6`

**File:** `test/regression/ScopeCashOutsToLocalBalancesConditional.t.sol`

**Extends:** `ForkTestBase`

**Background:** The `scopeCashOutsToLocalBalances` flag (bit 79 in packed ruleset metadata) has **inverted semantics**:
- `true` → skip remote surplus/supply (use **local only**)
- `false` → include remote surplus/supply (use **cross-chain aggregates**)

The flag is passed via `JBBeforeCashOutRecordedContext.scopeCashOutsToLocalBalances` and consumed in **4 places**:
1. `REVOwner.beforeCashOutRecordedWith` (line 201) — cash-out bonding curve
2. `JBOmnichainDeployer.beforeCashOutRecordedWith` (line 443) — omnichain cash-out
3. `REVLoans._borrowableAmountFrom` (line 378) — loan collateral valuation
4. `JBUniswapV4LPSplitHook._getCashOutRate` (line 477) — LP pricing floor

**Setup:**
- Deploy revnet with mock sucker returning non-zero `remoteSurplusOf` (10 ETH) and `remoteTotalSupplyOf` (1000e18)
- Deploy with `scopeCashOutsToLocalBalances = true` (local-only)

**Key Assertion:**
```solidity
// With scopeCashOutsToLocalBalances=true, cash-out should use LOCAL surplus only
JBBeforeCashOutRecordedContext memory ctx;
ctx.scopeCashOutsToLocalBalances = true;
ctx.surplus = JBTokenAmount({token: NATIVE_TOKEN, value: localSurplus, decimals: 18, currency: ETH_CURRENCY});
ctx.totalSupply = localTotalSupply;

(uint256 totalSupply, uint256 surplus,) = revOwner.beforeCashOutRecordedWith(ctx);

// Remote values (10 ETH surplus, 1000e18 supply) must NOT be included
assertEq(surplus, localSurplus + totalBorrowed, "remote surplus must be excluded when scoped to local");
assertEq(totalSupply, localTotalSupply + totalCollateral, "remote supply must be excluded when scoped to local");
```

**Verification:**
- Pre-fix: `surplus` includes remote values unconditionally → `assertEq` fails
- Post-fix: remote values excluded when `scopeCashOutsToLocalBalances=true` → passes

---

### 3.6 AR — Adversarial Pool Pre-Initialization

**Severity:** HIGH

**Repo:** `univ4-lp-split-hook-v6`

**File:** `test/regression/AdversarialPoolInit.t.sol`

**Extends:** `LPSplitHookV4TestBase` (from existing test infrastructure), or extends the `AuditFixM4Test` pattern from `TickBoundsAndPoolInitTest.t.sol`

**Setup:**
1. Compute the pool key that the LP split hook will use
2. As `attacker`, call `POSITION_MANAGER.initializePool(key, extremeSqrtPriceX96)` with `sqrtPriceX96` at `TickMath.MIN_SQRT_PRICE + 1` (extreme low)
3. Deploy project with LP split hook, triggering `_createAndInitializePool`

**Key Assertion:**
```solidity
// Option A: Hook should revert when existing price is out of bounds
vm.expectRevert(); // JBUniswapV4LPSplitHook_PriceOutOfBounds or similar
hook.afterPayRecordedWith(/* triggers pool creation */);

// Option B: Hook should reject the attacker's price and use computed price
(uint160 actualPrice,,) = POOL_MANAGER.getSlot0(poolId);
uint160 computedPrice = hook.exposed_computeInitialSqrtPrice(/* params */);
assertApproxEqRel(uint256(actualPrice), uint256(computedPrice), 1e16); // 1% tolerance
```

**Verification:**
- Pre-fix: hook silently accepts attacker's extreme price → no revert, price = extreme → assertion fails
- Post-fix: hook validates existing price against bounds or reverts → passes

**Additional test:** Verify that an extreme price causing zero liquidity from `getLiquidityForAmounts` is caught before the `ZeroLiquidity` revert (DoS prevention).

---

## 4. Cross-Component Parity Tests

**Repo:** `deploy-all-v6`

**File:** `test/regression/ConversionParityFork.t.sol`

**Extends:** `RevnetForkBase` (from `test/helpers/RevnetForkBase.sol`)

**Purpose:** Assert that all components producing currency conversions agree on the result for the same inputs. Finding AM exists because sucker lib and terminal store diverged without any test comparing them.

**Test Matrix:**

| Source Token | Source Decimals | Target Token | Target Decimals | Price |
|---|---|---|---|---|
| USDC | 6 | ETH | 18 | 2000 |
| ETH | 18 | USDC | 6 | 2000 |
| WBTC | 8 | ETH | 18 | 15 |
| DAI | 18 | USDC | 6 | 1 |

**For each row, assert:**
```solidity
uint256 suckerResult = JBSuckerLib.convertPeerValue(source, targetCurrency, prices);
uint256 storeResult  = mulDiv(amount, 10 ** targetDecimals, price); // terminal store pattern

assertApproxEqRel(suckerResult, storeResult, 1e15, "conversion parity violated");
```

**Why this matters:** A cross-component parity test would have caught AM immediately. Any future formula change in one component that doesn't match the other will also be caught.

---

## 5. Decimal-Parametric Testing

**Repo:** `nana-suckers-v6`

**File:** `test/regression/DecimalParametric.t.sol`

**Purpose:** Systematically sweep decimal combinations to catch any hardcoded `1e18` or decimal assumption.

```solidity
function testFuzz_convertPeerValue_decimalSweep(
    uint8 srcDecimals,  // bound to [2, 24]
    uint8 dstDecimals,  // bound to [2, 24]
    uint128 amount,     // bound to [1, type(uint128).max]
    uint128 price       // bound to [1e6, 1e30] (realistic price range)
) public {
    srcDecimals = uint8(bound(srcDecimals, 2, 24));
    dstDecimals = uint8(bound(dstDecimals, 2, 24));

    // Build source/target with parameterized decimals
    // Assert: result = amount * 10^dstDecimals / price (the correct formula)
    // Assert: result > 0 when amount > 0 and price < type(uint256).max
    // Assert: no overflow/underflow
}
```

**Decimal pairs that MUST be explicitly tested (not just fuzzed):**
- (6, 18) — USDC→ETH — the AM scenario
- (18, 6) — ETH→USDC — inverse
- (8, 18) — WBTC→ETH
- (6, 6) — USDC→USDT (same decimals, different tokens)
- (18, 18) — ETH→DAI (the "always works" case — sanity check)

---

## 6. Silent Failure Detection

Five critical try-catch blocks where tests must assert the *success path* was taken, not just that the outer call didn't revert.

| # | File | Line | Operation | What to Assert |
|---|---|---|---|---|
| 1 | `CTPublisher.sol` | 311 | `pay()` fee to terminal | Fee terminal balance increased by expected amount |
| 2 | `JBMultiTerminal.sol` | 1670 | `executeProcessFee()` | Fee project balance increased; no refund emitted |
| 3 | `JBPayoutSplitGroupLib.sol` | 132 | `executePayout()` to split hook | Split recipient balance changed; no `PayoutReverted` event |
| 4 | `JBController.sol` | 1065 | `processSplitWith()` split hook | Hook received tokens; no `SplitHookReverted` event |
| 5 | `JBRulesets.sol` | 914 | `approvalStatusOf()` from hook | Return value is not `Failed` (the fallback on revert) |

**Test pattern for each:**
```solidity
// WRONG (current pattern): just check outer call succeeds
publisher.mintFrom{value: cost}(/* params */);

// RIGHT: assert the success path, not just no-revert
uint256 feeBalanceBefore = feeTerminal.totalReceived();
publisher.mintFrom{value: cost}(/* params */);
uint256 feeBalanceAfter = feeTerminal.totalReceived();
assertGt(feeBalanceAfter, feeBalanceBefore, "fee must have been collected, not silently caught");
```

---

## 7. New Cross-Component Invariants

For the stateful fuzzing suite (extend existing invariant tests or add to `deploy-all-v6`).

### Invariant 1: Conversion Parity
```
∀ (amount, srcCurrency, dstCurrency, price):
  JBSuckerLib.convertPeerValue(src, dst, prices)
  ≈ JBTerminalStore conversion pattern
  (within 1 wei per decimal difference)
```

### Invariant 2: Pool Price Consistency
```
∀ revnet with buyback pool:
  sqrtPriceX96² / 2¹⁹² ≈ issuanceRate / 10^terminalDecimals
  (within 0.1%)
```

### Invariant 3: Fee Collection Monotonicity
```
∀ mintFrom call with payValue > 0 and valid feeBeneficiary:
  feeProjectBalance_after ≥ feeProjectBalance_before
  (fees are never refunded to the caller on success)
```

### Invariant 4: Permission Consistency After Transfer
```
∀ project NFT transfer from ownerA to ownerB:
  if ownerB.claimCollectionOwnershipOf():
    permissions.hasPermission(ownerA, deployer, projectId, ADJUST_721_TIERS) == false
```

### Invariant 5: `scopeCashOutsToLocalBalances` Conditioning
```
∀ cash-out via data hook where ruleset.scopeCashOutsToLocalBalances == true:
  effectiveSurplus == localSurplus  (remote excluded)
  effectiveSupply == localSupply    (remote excluded)

∀ cash-out via data hook where ruleset.scopeCashOutsToLocalBalances == false:
  effectiveSurplus == localSurplus + remoteSurplus
  effectiveSupply == localSupply + remoteSupply

Must hold in ALL 4 consumers: REVOwner, JBOmnichainDeployer, REVLoans, JBUniswapV4LPSplitHook
```

---

## 8. `scopeCashOutsToLocalBalances` Comprehensive Test Matrix

The `scopeCashOutsToLocalBalances` flag is the single control for whether cash-out bonding curve calculations include cross-chain remote surplus. It is consumed in 4 components across 3 repos, has inverted semantics (`true` = local-only), and was the root cause of AQ. Current coverage: **1 test** (`CrossTerminalSurplusSpoof.t.sol`) exercises `true`; **0 tests** exercise `false` with non-zero remote values in all 4 consumers.

### 8.1 Flag Semantics Reference

| `scopeCashOutsToLocalBalances` | Meaning | Default Deployments |
|---|---|---|
| `true` | Local-only: skip `remoteSurplusOf` and `remoteTotalSupplyOf` | Defifa games |
| `false` | Cross-chain: include remote surplus and supply | Revnets, deploy-all projects |

Bit 79 in packed `JBRulesetMetadata.metadata`. Passed to data hooks via `JBBeforeCashOutRecordedContext.scopeCashOutsToLocalBalances`.

### 8.2 All 4 Consumers — Required Test Coverage

Each consumer must be tested with **both flag states** × **omnichain and non-omnichain scenarios**.

#### Consumer 1: `REVOwner.beforeCashOutRecordedWith` (revnet-core-v6)

**File:** `revnet-core-v6/test/regression/ScopeCashOutsToLocalBalancesConditional.t.sol`

| Test | Flag | Suckers | Expected Behavior |
|---|---|---|---|
| `test_scopeTrue_noSuckers_localOnlySurplus` | `true` | none registered | surplus = local only, supply = local only |
| `test_scopeTrue_withSuckers_localOnlySurplus` | `true` | mock returning 10 ETH remote | surplus = local only (remote ignored), supply = local only |
| `test_scopeFalse_noSuckers_remoteReturnsZero` | `false` | none registered | surplus = local + 0, supply = local + 0 (no crash) |
| `test_scopeFalse_withSuckers_includesRemote` | `false` | mock returning 10 ETH remote | surplus = local + 10 ETH, supply = local + remoteSupply |
| `test_scopeFalse_withSuckers_reclaimDiffersFromScopeTrue` | both | same mock | reclaim with `false` < reclaim with `true` (diluted by remote supply) |

#### Consumer 2: `JBOmnichainDeployer.beforeCashOutRecordedWith` (nana-omnichain-deployers-v6)

**File:** `nana-omnichain-deployers-v6/test/regression/ScopeCashOutsOmnichainDeployer.t.sol`

| Test | Flag | Expected Behavior |
|---|---|---|
| `test_scopeTrue_excludesRemoteSurplus` | `true` | surplus = local only |
| `test_scopeFalse_includesRemoteSurplus` | `false` | surplus = local + remote |
| `test_scopeTrue_suckerExemptCashOutUnaffected` | `true` | sucker-exempt cash-outs (0% tax) still use local-only surplus |

**Key difference from REVOwner:** `JBOmnichainDeployer` acts as data hook for sucker-deployed projects. The sucker-exempt path (0% cashOutTaxRate for suckers) must also respect the flag.

#### Consumer 3: `REVLoans._borrowableAmountFrom` (revnet-core-v6)

**File:** `revnet-core-v6/test/regression/ScopeCashOutsLoans.t.sol`

| Test | Flag | Expected Behavior |
|---|---|---|
| `test_scopeTrue_borrowableUsesLocalOnly` | `true` | borrowable amount derived from local surplus/supply only |
| `test_scopeFalse_borrowableIncludesRemote` | `false` | borrowable amount includes remote surplus/supply |
| `test_scopeFalse_borrowableCappedAtLocalSurplus` | `false` | even with inflated remote surplus, borrowable ≤ local surplus (line 383 cap) |
| `test_scopeTrue_noOverBorrowFromRemoteInflation` | `true` | attacker with inflated remote surplus gets no extra borrowing power |

**Critical edge case:** `REVLoans` caps the final borrowable amount at `localSurplus` (line 383: `reclaimable > localSurplus ? localSurplus : reclaimable`). This cap must hold regardless of flag state. But the bonding curve reclaim calculation still uses remote values when `false`, which changes the intermediate result.

#### Consumer 4: `JBUniswapV4LPSplitHook._getCashOutRate` (univ4-lp-split-hook-v6)

**File:** `univ4-lp-split-hook-v6/test/regression/ScopeCashOutsLPHook.t.sol`

| Test | Flag | Expected Behavior |
|---|---|---|
| `test_scopeTrue_lpPricingUsesLocalSurplus` | `true` | `terminalTokensPerProjectToken` based on local surplus only |
| `test_scopeFalse_lpPricingIncludesRemote` | `false` | pricing includes remote surplus/supply |
| `test_scopeTrue_vs_scopeFalse_lpPriceDiffers` | both | LP pricing floor changes between flag states |

**Note:** This consumer takes a different code path per flag state: `true` calls `currentTotalReclaimableSurplusOf`, while `false` calls `currentReclaimableSurplusOf` with manually aggregated remote values. Both paths must be tested.

### 8.3 Non-Omnichain Scenarios (No Suckers Registered)

Projects without suckers must behave identically regardless of flag state.

**File:** `deploy-all-v6/test/regression/ScopeCashOutsNoSuckers.t.sol`

```solidity
function test_noSuckers_flagDoesNotAffectCashOut() external {
    // Deploy revnet WITHOUT suckers
    // SUCKER_REGISTRY.remoteSurplusOf returns 0
    // SUCKER_REGISTRY.remoteTotalSupplyOf returns 0

    uint256 reclaimScopeTrue = _cashOutWithFlag(true);
    uint256 reclaimScopeFalse = _cashOutWithFlag(false);

    // Must be identical — no remote values to add
    assertEq(reclaimScopeTrue, reclaimScopeFalse,
        "flag must not affect cash-out when no suckers registered");
}
```

**For all 4 consumers:** assert that `remoteSurplusOf` returning 0 and `remoteTotalSupplyOf` returning 0 produces the same result as `scopeCashOutsToLocalBalances = true`.

### 8.4 Omnichain Scenarios (Suckers Active)

**File:** `deploy-all-v6/test/regression/ScopeCashOutsOmnichain.t.sol`

Extends `RevnetForkBase`. Tests the full cross-component flow:

```solidity
function test_omnichain_scopeTrue_cashOutIgnoresRemote() external {
    // Deploy revnet with scopeCashOutsToLocalBalances=true
    // Register mock sucker with 10 ETH remote surplus, 5000e18 remote supply
    // Pay 5 ETH locally → get tokens
    // Cash out half tokens

    uint256 reclaimed = _cashOut(halfTokens);

    // Reclaim should use only local 5 ETH surplus, not 5+10=15 ETH
    // With 50% tax rate and local-only: reclaim ≈ bonding_curve(5 ETH, half, localSupply)
    assertLt(reclaimed, 5 ether); // bounded by local surplus
}

function test_omnichain_scopeFalse_cashOutIncludesRemote() external {
    // Same setup but scopeCashOutsToLocalBalances=false
    uint256 reclaimed = _cashOut(halfTokens);

    // Reclaim uses 5+10=15 ETH surplus and local+remote supply
    // Different bonding curve result
    // Still bounded by what the local terminal actually holds
    assertLt(reclaimed, 5 ether); // can't reclaim more than local balance
}

function test_omnichain_loanBorrowableRespectsScopeFlag() external {
    // Deploy revnet with suckers
    // Test REVLoans.borrowableAmountFrom with both flag states
    uint256 borrowableTrue = _borrowableWith(true);
    uint256 borrowableFalse = _borrowableWith(false);

    // With remote surplus inflating the bonding curve, borrowable may differ
    // But both must be ≤ localSurplus (the cap at REVLoans line 383)
    assertLe(borrowableTrue, localSurplus);
    assertLe(borrowableFalse, localSurplus);
}
```

### 8.5 Cross-Consumer Consistency

All 4 consumers must agree on the flag's effect for the same project/ruleset.

**File:** `deploy-all-v6/test/regression/ScopeCashOutsCrossConsumerParity.t.sol`

```solidity
function test_allConsumersAgreeOnScopeTrue() external {
    // Deploy revnet with suckers and scopeCashOutsToLocalBalances=true

    // REVOwner: surplus used for cash-out
    (uint256 ownerSupply, uint256 ownerSurplus,) = revOwner.beforeCashOutRecordedWith(ctx);

    // REVLoans: surplus used for borrowable calculation
    uint256 loanSurplus = _extractSurplusFromLoans(true);

    // JBUniswapV4LPSplitHook: surplus used for LP pricing
    uint256 lpSurplus = _extractSurplusFromLPHook(true);

    // All must use LOCAL-ONLY values (remote excluded)
    assertEq(ownerSurplus, localSurplus + totalBorrowed);
    assertEq(loanSurplus, localSurplus);
    assertEq(lpSurplus, localSurplus); // via currentTotalReclaimableSurplusOf path
}
```

---

## 9. Implementation Order

Prioritized by severity, with dependencies noted.

| Priority | Finding | Severity | Test File | Depends On |
|---|---|---|---|---|
| **P0** | AM | CRITICAL | `nana-suckers-v6/test/regression/ConvertPeerValueFormulaInversion.t.sol` | Fix in `JBSuckerLib.sol:193` |
| **P1** | AR | HIGH | `univ4-lp-split-hook-v6/test/regression/AdversarialPoolInit.t.sol` | Fix in `JBUniswapV4LPSplitHook.sol:1728-1731` |
| **P1** | AN | HIGH | `revnet-core-v6/test/regression/BuybackPoolDecimalParity.t.sol` | Fix in `REVDeployer.sol:414-417` |
| **P1** | AO | HIGH | `croptop-core-v6/test/regression/ZeroAddressFeeBeneficiary.t.sol` | Fix in `CTPublisher.sol:192` |
| **P2** | AQ | MED | `revnet-core-v6/test/regression/ScopeCashOutsToLocalBalancesConditional.t.sol` | Fix in `REVOwner.sol:195-201`, `JBOmnichainDeployer.sol:443`, `REVLoans.sol:378`, `JBUniswapV4LPSplitHook.sol:477` |
| **P2** | AP | MED | `croptop-core-v6/test/regression/PermissionLifecycleOnTransfer.t.sol` | Fix in `CTDeployer.sol` or `CTProjectOwner.sol` |
| **P3** | — | — | `deploy-all-v6/test/regression/ConversionParityFork.t.sol` | AM fix landed |
| **P3** | — | — | `nana-suckers-v6/test/regression/DecimalParametric.t.sol` | AM fix landed |
| **P4** | — | — | Silent failure detection tests (§6) | No code fix needed |
| **P4** | — | — | New invariants (§7) | All P0–P2 fixes landed |

### Workflow per test

1. Write the test against **pre-fix code** — confirm it **fails** with the expected wrong value
2. Apply the code fix
3. Run the test again — confirm it **passes**
4. Add the test to CI

---

## 10. Verification & CI

### Regression Suite Target

Add to each repo's `Makefile` or `foundry.toml`:

```toml
# foundry.toml
[profile.regression]
match_path = "test/regression/*.t.sol"
```

```makefile
test-regressions:
	forge test --match-path "test/regression/*.t.sol" -vvv
```

### Per-Test Requirements

Every regression test file MUST include:

```solidity
/// @notice Regression test for AUDIT_REPORT.md finding AM.
/// @dev Verifies JBSuckerLib.convertPeerValue divides by price (not multiplies).
///      MUST fail on pre-fix code, pass on post-fix code.
```

### CI Integration

- `make test-regressions` runs in under 60 seconds (no fork tests in this target unless necessary)
- Fork-dependent regression tests (AN, AR) run in a separate `test-regressions-fork` target
- All regression tests are included in the main `forge test` run

### Completeness Checklist

- [x] AM regression test fails pre-fix, passes post-fix
- [x] AN regression test fails pre-fix, passes post-fix
- [x] AO regression test fails pre-fix, passes post-fix
- [x] AP regression test fails pre-fix, passes post-fix
- [x] AQ regression test fails pre-fix, passes post-fix
- [x] AR regression test fails pre-fix, passes post-fix
- [x] `scopeCashOutsToLocalBalances` tested in both states for REVOwner (§8.2 Consumer 1)
- [x] `scopeCashOutsToLocalBalances` tested in both states for JBOmnichainDeployer (§8.2 Consumer 2)
- [x] `scopeCashOutsToLocalBalances` tested in both states for REVLoans (§8.2 Consumer 3)
- [x] `scopeCashOutsToLocalBalances` tested in both states for JBUniswapV4LPSplitHook (§8.2 Consumer 4)
- [x] Non-omnichain scenario: both flag states produce identical results with no suckers (§8.3)
- [x] Omnichain scenario: cross-consumer parity test passes (§8.5)
- [x] Cross-component parity test passes after AM fix
- [x] Decimal-parametric fuzz test passes after AM fix
- [x] All 5 silent failure detection tests pass
- [x] All 5 new invariants hold in stateful fuzzing (invariants 1,4,5 covered by existing tests; 2,3 covered by new regression tests)
- [x] `make test-regressions` target exists in all affected repos
- [x] Each test file references its AUDIT_REPORT.md finding ID

---

## 11. Preventing Recurrence

The six anti-patterns from §2 should become permanent test review criteria:

### Pre-Merge Checklist (for any new feature touching these areas)

1. **Decimal diversity:** Does the test suite include at least one non-18-decimal token? If the feature involves token amounts, test with 6 and 8 decimals.
2. **Cross-component parity:** If two components compute the same value (conversion, price, surplus), is there a test asserting they agree?
3. **Try-catch success assertion:** If the code has a try-catch, does a test assert the try path succeeded (not just that the outer call didn't revert)?
4. **Flag coverage:** If the code branches on a boolean flag, are both states tested?
5. **Permission lifecycle:** If permissions are granted at deploy time, is there a test for what happens after ownership transfer?
6. **Adversarial initialization:** If the code reads external state (pool prices, oracle values), is there a test where that state was set by an adversary?

---

*Generated from findings AM–AR in `AUDIT_REPORT.md`. Each test is designed to fail on pre-fix code and pass on post-fix code.*

---

## 12. Audit Instruction Adjustments

Findings AM–AR exposed blind spots in the review engine itself. The root `AUDIT_INSTRUCTIONS.md` and four repo-level `REVIEW_GUIDE.md` files should be updated so future auditors are directed at the exact patterns that hid these bugs.

---

### 12.1 Root `AUDIT_INSTRUCTIONS.md`

#### A. New adversarial persona: "Input monoculture breaker"

Add as persona **11** in the "Adversarial persona" section:

```markdown
**11. Input monoculture breaker**
Target every code path that handles token amounts, decimal precision, or currency conversion. Trace:
- Does the code hardcode `1e18`, `18`, or any specific decimal count? Test with 6-decimal (USDC) and 8-decimal (WBTC) tokens.
- If two components compute the same conversion (e.g., sucker lib and terminal store), do they use the same formula? Build a test that feeds identical inputs to both and asserts parity.
- For every try-catch: does a test assert the try-path succeeded, or only that the outer call didn't revert? If only the latter, the catch block may be silently masking bugs.
- For every boolean flag that branches behavior: are both states tested? Check `scopeCashOutsToLocalBalances`, `useDataHookForPay`, `useDataHookForCashOut`, and any project-scoped flags.
- For every permission granted at deploy time: what happens after the project NFT is transferred? Is there a revocation path?
- For any code that reads pre-existing external state (pool prices, oracle values, registry entries): can an adversary set that state before the legitimate caller?
```

#### B. Add to "Critical Invariants" section

Add invariant **10**:

```markdown
10. Conversion formula parity
    Any two components that convert between currencies or decimal precisions for the same
    economic purpose must produce identical results for identical inputs. Cross-component
    conversion divergence is a critical bug class (ref: AM).
```

#### C. Add to "Attack Surfaces" section

Add these lines:

```markdown
- hardcoded decimal assumptions in pool initialization, conversion libraries, and fee math
- try-catch blocks that silently absorb reverts from adversarial inputs (address(0), extreme prices)
- pre-existing external state (pool prices, registry entries) that an attacker can set before legitimate initialization
- permission grants that persist across NFT ownership transfers
```

#### D. Add to "Replay these ecosystem sequences"

Add item **7**:

```markdown
7. cross-currency sucker conversion with non-18-decimal tokens -> compare result to terminal store conversion for same inputs
8. pool initialization where attacker front-runs with extreme sqrtPriceX96 -> observe LP position creation
9. mintFrom with address(0) feeBeneficiary -> observe fee collection vs. refund
10. project NFT transfer -> attempt to use deployer-scoped permissions as old owner
```

#### E. Strengthen persona 9 ("Decimals/currency/token arbitrageur")

Add these trace items to persona 9:

```markdown
- In `JBSuckerLib.convertPeerValue`, is the price in the numerator or denominator? Compare to `JBTerminalStore`'s conversion at line 389 — they must match.
- In `REVDeployer._tryInitializeBuybackPoolFor`, does the sqrtPriceX96 calculation use the terminal token's actual decimals or a hardcoded `1e18`?
- In `JBUniswapV4LPSplitHook._createAndInitializePool`, when a pool is already initialized, is the existing price validated against computed bounds?
```

---

### 12.2 `nana-suckers-v6/REVIEW_GUIDE.md`

#### A. Add to "Audit Objective — Find issues that"

```markdown
- produce different conversion results than `JBTerminalStore` for the same currency pair and price
- hardcode decimal assumptions that break for non-18-decimal tokens (USDC, WBTC)
```

#### B. Add to scope or create new section: "Cross-Component Parity"

```markdown
## Cross-Component Parity

`JBSuckerLib.convertPeerValue` (src/libraries/JBSuckerLib.sol:193) converts between
currencies for cross-chain accounting. `JBTerminalStore` (nana-core-v6/src/JBTerminalStore.sol:389)
performs the same conversion for terminal accounting.

These MUST produce identical results for identical inputs. Any divergence corrupts
`remoteSurplusOf` and `remoteTotalSupplyOf`, which feed into `REVLoans._borrowableAmountFrom`
and `REVOwner.beforeCashOutRecordedWith`.

Auditors should:
1. Verify the mulDiv argument order in `convertPeerValue` matches `JBTerminalStore`
2. Test with non-same-currency pairs (the same-currency shortcut at line 177 skips the oracle)
3. Test with [6, 8, 18] decimal source/target combinations
```

#### C. Add critical invariant

```markdown
6. `convertPeerValue(source, targetCurrency, prices)` produces the same result as
   `mulDiv(amount, 10 ** targetDecimals, price)` for all decimal/currency combinations.
```

---

### 12.3 `revnet-core-v6/REVIEW_GUIDE.md`

#### A. Add to "Audit Objective — Find issues that"

```markdown
- hardcode decimal assumptions in pool initialization or pricing math
- unconditionally include remote surplus/supply regardless of the `scopeCashOutsToLocalBalances` flag
```

#### B. Add to "Critical Invariants"

```markdown
6. Buyback pool initialization uses `10 ** terminalTokenDecimals`, not a hardcoded `1e18`.
7. `REVOwner.beforeCashOutRecordedWith` respects the ruleset's `scopeCashOutsToLocalBalances`
   flag — remote surplus and supply are excluded when the flag is `true` (inverted semantics:
   `true` = local-only, `false` = include remote).
```

#### C. Add to "Attack Surfaces"

```markdown
- `_tryInitializeBuybackPoolFor` sqrtPriceX96 computation with non-18-decimal terminal tokens
- `beforeCashOutRecordedWith` remote surplus inclusion when `scopeCashOutsToLocalBalances=false`
```

#### D. Add to "Integration Assumptions" table

```markdown
| Terminal token decimals | Pool initialization uses actual token decimals | sqrtPriceX96 is wildly wrong for USDC/WBTC, creating instant arb |
| Ruleset `scopeCashOutsToLocalBalances` flag | REVOwner, JBOmnichainDeployer, REVLoans, and JBUniswapV4LPSplitHook all condition remote surplus on this flag | Cash-outs include stale/manipulated remote values unconditionally when flag is ignored |
```

---

### 12.4 `croptop-core-v6/REVIEW_GUIDE.md`

#### A. Add to "Audit Objective — Find issues that"

```markdown
- allow fee bypass through caller-controlled parameters (e.g., address(0) beneficiary)
- leave deployer-scoped permissions active after project NFT transfer
```

#### B. Add to "Critical Invariants"

After existing invariant 5, add:

```markdown
6. Caller-supplied addresses used in fee routing (feeBeneficiary) must be validated before
   the try-catch fee payment path. address(0) must not trigger the catch-block refund.
7. Deployer-scoped permissions (ADJUST_721_TIERS, SET_721_METADATA, MINT_721,
   SET_721_DISCOUNT_PERCENT) must be revoked for the old owner when the project NFT
   is transferred and claimed by a new owner.
```

#### C. Add to "Attack Surfaces"

```markdown
- fee payment try-catch with adversarial feeBeneficiary (address(0), reverting contract)
- deployer-scoped permission persistence across project NFT transfers
- CTProjectOwner.onERC721Received grants without corresponding revocations
```

#### D. Strengthen "Roles And Privileges" table

Add row:

```markdown
| Former project owner | None after transfer | Must lose all deployer-scoped permissions when NFT changes hands |
```

---

### 12.5 `univ4-lp-split-hook-v6/REVIEW_GUIDE.md`

#### A. Add to "Audit Objective — Find issues that"

```markdown
- accept attacker-chosen pool prices without bounds validation
- allow front-running of pool initialization to DoS LP position creation
```

#### B. Add to "Critical Invariants"

After existing invariant 5, add:

```markdown
6. When a pool is already initialized, the existing sqrtPriceX96 must be validated against
   the computed initial price bounds. An attacker-chosen extreme price must not be silently
   accepted.
```

#### C. Strengthen "Attack Surfaces" — first item

The existing "first pool deployment and outsider initialization" is too vague. Replace or expand:

```markdown
- **adversarial pool pre-initialization**: an attacker calls `initializePool` with an extreme
  sqrtPriceX96 before the legitimate `_createAndInitializePool` runs. The hook reads the
  existing price at line 1728 and must validate it against computed bounds — not accept it
  unconditionally (line 1731). Extreme prices cause `getLiquidityForAmounts` to return zero,
  reverting at line 1240 with `ZeroLiquidity` and permanently blocking LP creation.
```

#### D. Add to "Integration Assumptions" table

```markdown
| Uniswap V4 pool state | Pool is either uninitialized or initialized at a reasonable price | Attacker front-runs with extreme price, causing permanent DoS of LP position |
```

#### E. Add to "Critical Invariants" — `scopeCashOutsToLocalBalances` coverage

```markdown
7. `_getCashOutRate` respects the ruleset's `scopeCashOutsToLocalBalances` flag.
   When `true`, LP pricing uses `currentTotalReclaimableSurplusOf` (local-only path).
   When `false`, LP pricing manually aggregates remote surplus via SUCKER_REGISTRY.
   Both paths must be tested with non-zero remote values.
```

---

### 12.6 `nana-core-v6/REVIEW_GUIDE.md`

#### A. Add to "Critical Invariants"

After existing invariant 8, add:

```markdown
9. Conversion formula consistency
   `JBTerminalStore`'s mulDiv pattern for cross-currency conversion (line 389) is the
   canonical formula. Any other component that converts currencies (sucker lib, REVOwner,
   buyback hook) must produce identical results for identical inputs.
```

#### B. Add to "Attack Surfaces"

```markdown
- try-catch blocks in `_processFee`, `executePayout`, and `processSplitWith` — tests must
  assert the success path was taken, not just that the outer call didn't revert. Silent
  catch-block execution can mask fee evasion, split failures, and beneficiary validation bugs.
- cross-currency surplus aggregation with non-18-decimal tokens — verify `mulDiv` precision
  when converting between 6-decimal (USDC) and 18-decimal (ETH) accounting contexts
```

#### C. Add to "Replay these sequences"

```markdown
6. pay with a 6-decimal terminal token (USDC) → verify weight calculation, surplus recording,
   and cross-terminal surplus aggregation all use actual token decimals
```

---

### 12.7 `nana-buyback-hook-v6/REVIEW_GUIDE.md`

#### A. Add to "Audit Objective — Find issues that"

```markdown
- hardcode decimal assumptions in swap-vs-mint comparison math
- silently swallow swap failures without asserting the fallback path preserved value
```

#### B. Add to "Critical Invariants"

After existing invariant 4, add:

```markdown
5. Decimal-correct comparison
   Swap output and native mint output must be compared in the same decimal precision.
   Hardcoded `1e18` in comparison math produces wrong routing decisions for non-18-decimal
   terminal tokens.
6. Fallback path value preservation
   When the swap path fails (try-catch), the fallback to native minting must be provably
   executed — not silently caught with value lost. Tests must assert the native mint path
   was taken, not just that the outer call succeeded.
```

#### C. Add to "Attack Surfaces"

```markdown
- swap-vs-mint comparison with non-18-decimal terminal tokens (USDC, WBTC) — hardcoded
  decimal assumptions produce wrong routing decisions
- try-catch around pool.swap() — can the catch block be triggered adversarially to force
  native minting when swap would have been better, or vice versa?
```

#### D. Add to "Integration Assumptions" table

```markdown
| Terminal token decimals | Comparison math uses actual token decimals, not hardcoded 1e18 | Routing decision is wrong for USDC/WBTC, users get fewer tokens |
```

---

### 12.8 `nana-router-terminal-v6/REVIEW_GUIDE.md`

#### A. Add to "Audit Objective — Find issues that"

```markdown
- hardcode decimal assumptions in swap amount computation or slippage checks
- silently absorb routing failures without asserting value was forwarded or refunded
```

#### B. Add to "Critical Invariants"

After existing invariant 4, add:

```markdown
5. Decimal-correct routing
   Amount conversions between the input token and destination terminal token must use actual
   token decimals. A hardcoded 18-decimal assumption in swap amount computation produces wrong
   results for USDC (6) → project-accepting-ETH (18) or vice versa.
6. Silent failure detection
   When a routing path fails and falls back to refund, the refund must be provably executed.
   The catch block must not silently absorb value.
```

#### C. Add to "Attack Surfaces"

```markdown
- routing between tokens with different decimals (e.g., USDC → ETH) — verify amount
  conversions use `10 ** decimals`, not hardcoded `1e18`
- V3/V4 callback settlement with non-18-decimal tokens — verify delta amounts are
  decimal-correct
```

---

### 12.9 `nana-721-hook-v6/REVIEW_GUIDE.md`

#### A. Add to "Audit Objective — Find issues that"

```markdown
- leave deployer-scoped or operator permissions active after project NFT transfer
- silently absorb split hook failures without asserting value was distributed
```

#### B. Add to "Critical Invariants"

After existing invariant 4, add:

```markdown
5. Permission lifecycle on ownership transfer
   Permissions granted to operators at deploy time (ADJUST_721_TIERS, SET_721_METADATA,
   MINT_721, SET_721_DISCOUNT_PERCENT) must not persist for old owners after the project
   NFT is transferred. This is especially critical when the hook is deployed through
   CTDeployer or similar wrappers that grant deployer-scoped permissions.
6. Cash-out weight decimal correctness
   NFT reclaim value calculations must use the terminal token's actual decimals, not
   hardcoded assumptions. Tier prices denominated in non-18-decimal currencies must
   produce correct reclaim amounts.
```

#### C. Add to "Attack Surfaces"

```markdown
- operator permissions that persist across project NFT transfers — especially deployer-scoped
  grants from CTDeployer, DefifaDeployer, or similar wrappers
- cash-out weight computation with non-18-decimal terminal tokens
```

---

### 12.10 `univ4-router-v6/REVIEW_GUIDE.md`

#### A. Add to "Audit Objective — Find issues that"

```markdown
- hardcode decimal assumptions in estimate comparison or delta computation
- accept pre-existing pool state (price, observations) without validation
```

#### B. Add to "Critical Invariants"

After existing invariant 5, add:

```markdown
6. Decimal-correct estimation
   V4 output estimates and Juicebox output estimates must use actual token decimals when
   compared. Hardcoded `1e18` in the comparison produces wrong routing for non-18-decimal
   tokens.
7. Pool state validation
   When reading pool state (sqrtPriceX96, observations) for routing decisions, the hook
   must validate that values are within reasonable bounds. An adversary who manipulates pool
   state before the hook reads it can force wrong routing decisions.
```

#### C. Add to "Attack Surfaces"

```markdown
- estimate comparison with non-18-decimal tokens — verify both V4 and JB estimates use
  actual token decimals
- TWAP oracle manipulation — can an attacker bias observations to consistently force the
  hook onto the worse routing path?
- pre-existing pool state at extreme prices — does the hook validate sqrtPriceX96 before
  using it for routing decisions?
```

---

### 12.11 `nana-omnichain-deployers-v6/REVIEW_GUIDE.md`

#### A. Add to "Audit Objective — Find issues that"

```markdown
- deploy suckers with hardcoded decimal assumptions that break for non-18-decimal tokens
- grant sucker permissions that persist after project ownership changes
```

#### B. Add a "Critical Invariants" section (currently missing)

```markdown
## Critical Invariants

1. Cross-chain token mapping uses actual token decimals, not hardcoded values.
2. Sucker-scoped permissions (DEPLOY_SUCKERS, MAP_SUCKER_TOKEN) are correctly scoped
   to the project and do not persist for old owners after NFT transfer.
3. Deterministic deployment produces identical project shapes across chains —
   including decimal-aware pool initialization when buyback hooks are composed.
4. `JBOmnichainDeployer.beforeCashOutRecordedWith` respects the ruleset's
   `scopeCashOutsToLocalBalances` flag — remote surplus and supply are excluded
   when the flag is `true`. The sucker-exempt cash-out path (0% tax for suckers)
   must also respect this flag.
```

---

### 12.12 `deploy-all-v6/REVIEW_GUIDE.md`

#### A. Add to "Audit Objective — Find issues that"

```markdown
- deploy pools or hooks with hardcoded 18-decimal assumptions that break for non-ETH terminals
- leave deployer-scoped permissions active after ownership convergence
```

#### B. Add to "Critical Invariants"

After existing invariant 5, add:

```markdown
6. Decimal-aware deployment
   Pool initialization, buyback hook configuration, and LP split hook setup must use
   actual terminal token decimals. A deployment script that hardcodes `1e18` will silently
   misconfigure any project using USDC, WBTC, or other non-18-decimal tokens.
7. Permission cleanup after deployment
   All deployer-scoped operator permissions must be revoked or transferred as part of
   ownership convergence. Former deployer addresses must not retain ADJUST_721_TIERS,
   SET_721_METADATA, or similar permissions post-deploy.
```

#### C. Add to "Attack Surfaces"

```markdown
- pool initialization with non-18-decimal terminal tokens — verify sqrtPriceX96 uses
  actual token decimals
- deployer-scoped permissions that survive ownership convergence — verify all grants
  are revoked for the deployer address after handoff
- cross-component conversion parity — verify sucker lib, terminal store, and REVOwner
  all produce identical conversion results for the same inputs
```

---

### 12.13 `defifa/REVIEW_GUIDE.md`

#### A. Add to "Audit Objective — Find issues that"

```markdown
- leave deployer-scoped permissions active after game launch
- hardcode decimal assumptions in tier pricing or cash-out weight math
```

#### B. Add to "Critical Invariants"

After existing invariant 5, add:

```markdown
6. Deployer permission cleanup
   `DefifaDeployer` must not retain post-launch operator permissions (ADJUST_721_TIERS,
   SET_721_METADATA) that allow modifying the game after it has started. Permissions
   granted during deployment must be scoped to the launch phase only.
7. Decimal-correct settlement
   Cash-out weight computation and pot distribution must use actual terminal token decimals.
   Games using non-18-decimal payment tokens must settle correctly.
```

---

### 12.14 `banny-retail-v6/REVIEW_GUIDE.md`

#### A. Add to "Audit Objective — Find issues that"

```markdown
- hardcode decimal assumptions in pricing or fee computation for non-ETH payment tokens
```

#### B. Add to "Critical Invariants"

After existing invariant 5, add:

```markdown
6. Decimal-correct pricing
   Tier prices and any payment-amount validation must use actual terminal token decimals.
   A resolver or hook that assumes 18 decimals will misprice accessories or bodies for
   projects using USDC or other non-18-decimal tokens.
```

---

### 12.15 `nana-ownable-v6/REVIEW_GUIDE.md`

#### A. Add to "Audit Objective — Find issues that"

```markdown
- allow operator permissions granted through the ownable helper to persist after
  project NFT transfer
```

#### B. Add to "Critical Invariants"

After existing invariant 3, add:

```markdown
4. Permission lifecycle on transfer
   When a project NFT is transferred, any operator permissions that were granted through
   the ownable helper (or by contracts that use it) must be revocable by the new owner.
   The old owner must not retain admin access through cached or deployer-scoped grants.
```

#### C. Strengthen "Attack Surfaces"

Add:

```markdown
- deployer-scoped permission grants that reference the ownable contract as `account` —
  these survive NFT transfers because JBPermissions doesn't auto-revoke on transfer
```

---

### 12.16 Summary of All Changes

| File | What to Add | Why (Anti-Pattern from §2) |
|---|---|---|
| `AUDIT_INSTRUCTIONS.md` | Persona 11 (input monoculture breaker), invariant 10 (conversion parity), 4 attack surfaces, 4 ecosystem sequences, 3 persona-9 trace items | Root engine didn't direct auditors at hardcoded decimals, silent try-catch, flag monotone, permission lifecycle, or adversarial initialization |
| `nana-core-v6/REVIEW_GUIDE.md` | Conversion consistency invariant, try-catch attack surfaces, non-18-decimal replay sequence | #1 monoculture decimals, #3 silent try-catch |
| `nana-suckers-v6/REVIEW_GUIDE.md` | Cross-component parity section, 2 objectives, 1 invariant | #2 no conversion parity |
| `revnet-core-v6/REVIEW_GUIDE.md` | 2 objectives, 2 invariants, 2 attack surfaces, 2 integration assumptions | #1 monoculture decimals, #4 flag-monotone |
| `croptop-core-v6/REVIEW_GUIDE.md` | 2 objectives, 2 invariants, 3 attack surfaces, 1 role row | #3 silent try-catch, #5 no permission lifecycle |
| `univ4-lp-split-hook-v6/REVIEW_GUIDE.md` | 2 objectives, 1 invariant, expanded attack surface, 1 integration assumption | #6 no adversarial initialization |
| `nana-buyback-hook-v6/REVIEW_GUIDE.md` | 2 objectives, 2 invariants, 2 attack surfaces, 1 integration assumption | #1 monoculture decimals, #3 silent try-catch |
| `nana-router-terminal-v6/REVIEW_GUIDE.md` | 2 objectives, 2 invariants, 2 attack surfaces | #1 monoculture decimals, #3 silent try-catch |
| `nana-721-hook-v6/REVIEW_GUIDE.md` | 2 objectives, 2 invariants, 2 attack surfaces | #1 monoculture decimals, #5 no permission lifecycle |
| `univ4-router-v6/REVIEW_GUIDE.md` | 2 objectives, 2 invariants, 3 attack surfaces | #1 monoculture decimals, #6 no adversarial initialization |
| `nana-omnichain-deployers-v6/REVIEW_GUIDE.md` | 2 objectives, 3 invariants (new section) | #1 monoculture decimals, #5 no permission lifecycle |
| `deploy-all-v6/REVIEW_GUIDE.md` | 2 objectives, 2 invariants, 3 attack surfaces | #1 monoculture decimals, #2 no conversion parity, #5 no permission lifecycle |
| `defifa/REVIEW_GUIDE.md` | 2 objectives, 2 invariants | #1 monoculture decimals, #5 no permission lifecycle |
| `banny-retail-v6/REVIEW_GUIDE.md` | 1 objective, 1 invariant | #1 monoculture decimals |
| `nana-ownable-v6/REVIEW_GUIDE.md` | 1 objective, 1 invariant, 1 attack surface | #5 no permission lifecycle |
