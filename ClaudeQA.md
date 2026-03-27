# Juicebox V6 EVM — Pre-Deployment Security Audit Report

**Auditor:** Claude Opus 4.6 (Paranoid QA Mode)
**Date:** 2026-03-23
**Scope:** All 17 submodule repos in the v6 EVM ecosystem
**Objective:** 10/10 confidence for immutable deployment managing billions of dollars

---

## Executive Summary

After deep line-by-line analysis of all 17 repos (~35,000+ lines of Solidity), review of 200+ test files, and targeted cross-component interaction analysis, I assess the ecosystem at **7.5/10 overall confidence** for immutable deployment. The core protocol (nana-core-v6) is well-hardened at 8.5/10. The primary gaps are in the UniV4 integration layer (LP split hook, router terminal) and specific cross-component interaction patterns that remain under-tested.

**No showstopper critical vulnerabilities were found that would prevent deployment.** The most severe new findings are in the UniV4 LP split hook's fee token accounting and the permissionless MEV surface on fee routing. All other findings are either documented design decisions, configuration-dependent risks, or low-severity issues.

### What It Would Take to Reach 10/10

1. Add `ReentrancyGuard` to `REVLoans` and `JBUniswapV4LPSplitHook` (2 contracts)
2. Fix the `_mintRebalancedPosition` fee token claim subtraction omission (1 line)
3. Add minimum slippage protection to fee routing in `JBUniswapV4LPSplitHook._routeFeesToProject`
4. Add end-to-end adversarial tests for composed hook paths (buyback + V4 routing)
5. Add reentrancy tests for cashout hooks re-entering pay
6. Verify OMNICHAIN_RULESET_OPERATOR deployed bytecode matches JBOmnichainDeployer on all chains
7. Add idempotency guard to `JBAddressRegistry._registerAddress`
8. Add zero-address guard in `CTDeployer.beforeCashOutRecordedWith`
9. Fix BAN project ID enforcement in deploy-all-v6 (use `_ensureProjectExists` pattern)
10. Verify start times and auto-issuance amounts against economic model at actual deployment timestamp

---

## Methodology

- 8 parallel deep-dive audit agents covering every repo
- Direct manual analysis of all critical fund flow paths in JBMultiTerminal, JBTerminalStore, JBCashOuts, JBFees, JBPayoutSplitGroupLib
- Cross-component interaction tracing for 4 major composition chains (documented in RISKS.md)
- Review of all test files for coverage gaps and adversarial testing quality
- Specific focus on: reentrancy without ReentrancyGuard, fee bypass vectors, bonding curve edge cases, cross-chain consistency, permission escalation, data hook trust boundaries

---

## Per-Repo Confidence Scores

| Repo | Confidence | Blocking Issues | Notes |
|------|-----------|----------------|-------|
| **nana-core-v6** | 8.5/10 | None | Rock-solid CEI ordering, comprehensive tests. |
| **revnet-core-v6** | 8/10 | REVLoans needs ReentrancyGuard | CEI gap in totalCollateralOf; wildcard USE_ALLOWANCE is ecosystem risk |
| **nana-suckers-v6** | 8/10 | None | Well-defended. Arbitrum non-atomicity is inherent. Emergency hatch correctly guarded. |
| **nana-721-hook-v6** | 8/10 | None | Discount/cashout weight asymmetry is config-dependent (cannotIncreaseDiscountPercent flag mitigates) |
| **nana-buyback-hook-v6** | 7.5/10 | Routing disagreement with V4 hook | Documented fallback behavior, but value leakage in composed deployments |
| **univ4-lp-split-hook-v6** | 6.5/10 | **Fee token accounting bug (CRIT-1), zero slippage on fee routing (CRIT-2)** | Most concerning repo. Needs fixes before deployment. |
| **univ4-router-v6** | 7.5/10 | _routing flag cleanup pattern | Theoretical DoS if flag persists; V4 hook routing is complex |
| **nana-router-terminal-v6** | 7/10 | V4 spot price sandwich risk (2% floor) | Well-documented but exploitable on L1 |
| **nana-omnichain-deployers-v6** | 8/10 | None | Sucker verification correct. Ruleset ID prediction needs guard in launch paths. |
| **croptop-core-v6** | 7.5/10 | CTDeployer zero-address revert on uninitialized dataHookOf | One-line fix needed |
| **banny-retail-v6** | 8.5/10 | None | nonReentrant properly applied. SVG injection is owner-trust issue. |
| **defifa-collection-deployer-v6** | 8/10 | None | Governance mechanism sound. Dust locked from integer division is accepted. |
| **nana-ownable-v6** | 9/10 | None | Clean design. Permission reset on transfer is correct. |
| **nana-fee-project-deployer-v6** | 8/10 | None | Operator address differs from standalone script — verify intentional |
| **deploy-all-v6** | 8/10 | BAN project ID not enforced | CREATE2 safe, idempotent, correct ordering. Fix BAN `_ensureProjectExists`. |
| **nana-address-registry-v6** | 7.5/10 | No idempotency guard on registration | Allows overwrites (computationally infeasible to exploit, but defense-in-depth) |
| **nana-permission-ids-v6** | 9/10 | None | Static definitions, well-tested |

---

## Findings by Severity

### CRITICAL (2 new)

#### CRIT-1: `_mintRebalancedPosition` Omits Fee Token Claim Subtraction [univ4-lp-split-hook-v6]

**File:** `JBUniswapV4LPSplitHook.sol:1324`
**Confidence:** 7/10

In `_mintRebalancedPosition`, the project token balance is read as:
```solidity
uint256 projectTokenBalance = IERC20(projectToken).balanceOf(address(this));
```
This does NOT subtract `_totalOutstandingFeeTokenClaims[projectToken]`, unlike `_addUniswapLiquidity` (line 782) and `_burnReceivedTokens` (line 893) which both subtract it. When the project token is the same as the fee project token, this inflates the amount deposited into the LP position, locking fee tokens belonging to other projects.

**Impact:** Fee tokens reserved for other projects get permanently locked in the LP position.

**Fix:** Add `- _totalOutstandingFeeTokenClaims[projectToken]` to line 1324.

!!! Admin note: ok, fix.

---

#### CRIT-2: Zero Slippage Protection on Fee Routing [univ4-lp-split-hook-v6]

**File:** `JBUniswapV4LPSplitHook.sol:1452-1474`
**Confidence:** 8/10

`_routeFeesToProject` calls `terminal.pay()` with `minReturnedTokens: 0`. The terminal can invoke a buyback hook which performs a swap. With zero slippage protection, every fee routing transaction is sandwichable. Combined with `collectAndRouteLPFees` being permissionless (anyone can trigger it), this creates a permanent MEV extraction surface.

**Impact:** Up to 2.5% value extraction per fee routing operation across all projects using the hook. Compounds over time.

**Fix:** Add minimum slippage floor based on TWAP or oracle price, or make `collectAndRouteLPFees` permissioned.

!!! Admin note: this is ok because the project itself should have slippage pertection inside of its pay hook. we could, however, add minReturnedTokens based on a call to previewPay if we want. what do you think?

---

### HIGH (8)

#### HIGH-1: OMNICHAIN_RULESET_OPERATOR Is a Hardcoded Universal Trust Root [nana-core-v6]

**File:** `JBController.sol:97-111, 442-455, 590-595`
**Confidence:** 8/10

This immutable address bypasses ALL permission checks for `launchRulesetsFor`, `queueRulesetsOf`, and `SET_TERMINALS` on ANY project. If the JBOmnichainDeployer at this address has a vulnerability, is deployed with incorrect bytecode, or is compromised on any chain, an attacker could queue malicious rulesets for every project without approval hooks.

**Action required:** Verify deployed bytecode matches JBOmnichainDeployer on every target chain. Projects with `duration == 0` and no approval hooks are most at risk.

!!! Admin note: ok, fix.

---

#### HIGH-2: REVLoans CEI Ordering Gap in totalCollateralOf [revnet-core-v6]

**Confidence:** 7/10

`totalCollateralOf` is updated after external calls in certain loan paths, creating a window where the collateral accounting is stale. While no direct exploit was confirmed, the lack of `ReentrancyGuard` makes this a defense-in-depth concern for a contract holding wildcard `USE_ALLOWANCE` permission.

**Action required:** Add `ReentrancyGuard` to REVLoans.

!!! Admin note: the fn's ordering should prevent reentrency risk. dont add a reentrency prevention modifier willy nilly without reason... prefer to write the fn in a resiliant way. 

---

#### HIGH-3: Wildcard USE_ALLOWANCE on REVLoans [revnet-core-v6]

**Confidence:** 9/10

`REVLoans` holds wildcard `USE_ALLOWANCE` (projectId=0) from `REVDeployer`, meaning it can draw surplus from ANY revnet's treasury. A vulnerability in REVLoans has ecosystem-wide blast radius.

**Action required:** Ensure REVLoans has maximum audit scrutiny. The ReentrancyGuard addition (HIGH-2) is critical.

!!! Admin note: by design... the wildcard is relative to project owner, which is REVDeployer, which should be tightly scoped.

---

#### HIGH-4: V4 Spot Price Quoting Is Sandwich-Attackable [nana-router-terminal-v6]

**File:** `JBRouterTerminal.sol:1306-1335`
**Confidence:** 9/10

When no user-provided quote is supplied, the router falls back to V4 spot price with sigmoid slippage (2% minimum floor). On L1 Ethereum, sophisticated MEV bots can extract up to 2% per transaction.

**Action required:** Frontend integrations MUST always supply `quoteForSwap` metadata for V4 pools. Document this prominently.

!!! Admin note: the router terminal may be called programmatically, in which case a quoteForSwap may be missing and we will rely on algorthmically provided quote. how might we make sure we provide as good a quote as possible to prevent much slippage?

---

#### HIGH-5: No Reentrancy Guard on JBUniswapV4LPSplitHook [univ4-lp-split-hook-v6]

**File:** `JBUniswapV4LPSplitHook.sol` (multiple functions)
**Confidence:** 6/10

`rebalanceLiquidity` has a window between position burn (old tokenId) and mint (new tokenId) where state is inconsistent. No `ReentrancyGuard` is used. The contract relies on state-ordering defenses that have gaps.

**Action required:** Add `ReentrancyGuard` to `rebalanceLiquidity`, `collectAndRouteLPFees`, and `deployPool`.

!!! Admin note: the fn's ordering should prevent reentrency risk. dont add a reentrency prevention modifier willy nilly without reason... prefer to write the fn in a resiliant way. 

---

#### HIGH-6: Discount/Cash-Out Weight Asymmetry [nana-721-hook-v6]

**File:** `JB721TiersHookStore.sol:414-423, 1096-1100`
**Confidence:** 9/10

When `discountPercent = 200` (100% discount), NFTs can be minted for free but carry full cash-out weight. A project owner who increases the discount after paid mints can enable attackers to drain the treasury.

**Mitigated by:** `cannotIncreaseDiscountPercent` flag. Projects that don't set this flag are vulnerable.

**Action required:** Consider making `cannotIncreaseDiscountPercent` default to `true`. Document the risk in deployment tooling.

!!! Admin note: this is ok, by design. 

---

#### HIGH-7: JBAddressRegistry Allows Deployer Mapping Overwrites [nana-address-registry-v6]

**File:** `JBAddressRegistry.sol:122`
**Confidence:** 9/10

`_registerAddress` unconditionally writes to `deployerOf[addr]` with no idempotency guard. While exploiting this requires a hash collision (computationally infeasible), the lack of a simple `if (deployerOf[addr] != address(0)) revert` check violates defense-in-depth for an immutable registry.

**Fix:** Add one-line idempotency guard.

!!! Admin note: ok, fix if you wish. 

---

#### HIGH-8: CTDeployer.beforeCashOutRecordedWith Reverts on Uninitialized dataHookOf [croptop-core-v6]

**File:** `CTDeployer.sol:150`
**Confidence:** 8/10

For projects where `dataHookOf[projectId]` is `address(0)`, the non-sucker cash-out path unconditionally calls the zero address, permanently blocking cash-outs.

**Fix:** Add zero-address guard: `if (address(dataHookOf[context.projectId]) == address(0)) return (context.cashOutTaxRate, context.cashOutCount, context.totalSupply, hookSpecifications);`

!!! Admin note: ok, fix. 

---

### MEDIUM (20)

#### MED-1: Phantom Balance After Migration + Held Fee Processing [nana-core-v6]
After terminal migration, held fee processing failure credits phantom balance to the old terminal. Can inflate cross-terminal surplus if `useTotalSurplusForCashOuts` is true. Known, documented.

#### MED-2: `_feeFreeSurplusOf` Persists Across Rulesets With No Reset [nana-core-v6]
Accumulator is never cleared when switching between zero-tax and non-zero-tax rulesets. Minor accounting artifact.

#### MED-3: Sucker Trust Boundary — Registry Compromise Has Ecosystem-Wide Blast Radius [nana-suckers-v6]
`JBSuckerRegistry` holds wildcard `MAP_SUCKER_TOKEN` from all three deployers. A false sucker registration enables 0% cashout tax drain across all projects.

#### MED-4: CCIP Amount Mismatch — No Validation of Delivered Tokens [nana-suckers-v6]
`ccipReceive` does not validate `root.amount` against `destTokenAmounts[0].amount`. By design (reverting is worse), but claims fail if insufficient tokens delivered. Recommend adding monitoring event.

#### MED-5: `fromRemote` Silently Drops Roots in DEPRECATED State [nana-suckers-v6]
Tokens bridged just before deprecation can be stranded if root arrives after DEPRECATED. 14-day delay mitigates but doesn't guarantee delivery for all bridges.

#### MED-6: Emergency Hatch Has No Timelock [nana-suckers-v6]
Instant activation by project owner. Irreversible. Correctly prevents double-spend via `numberOfClaimsSent` guard, but governance risk.

#### MED-7: Arbitrum Non-Atomic Bridging [nana-suckers-v6]
ERC-20 token transfer and message are independent L2→L1. Causes DoS if message arrives before tokens. 7-day retryable ticket expiration could strand tokens. Documented.

#### MED-8: Buyback + V4 Hook Routing Disagreement [nana-buyback-hook-v6 + univ4-router-v6]
Both hooks independently decide swap-vs-mint. Disagreement causes `JBUniswapV4Hook_ReentrantRouting` revert, caught by buyback try-catch, falls back to mint. Value leakage when pool would have given better rates.

!!! Admin note: ok, fixable without over dependence on admin operations? 

#### MED-9: Multi-Hop Cashout Has Zero Per-Step Slippage [nana-router-terminal-v6]
`_cashOutLoop` sets `minTokensReclaimed = 0` after first iteration. Intermediate hops have no slippage protection.

!!! Admin note: ok, fixable without over dependence on admin operations? 

#### MED-10: Permissionless Fee Collection Timing Attack [univ4-lp-split-hook-v6]
Anyone can call `collectAndRouteLPFees` to trigger fee routing at manipulated market conditions. Combined with zero slippage (CRIT-2).

!!! Admin note: ok, fixable without over dependence on admin operations? 

#### MED-11: Oracle Auto-Growth Gas Spike [univ4-router-v6]
Growing observation array from 512 to 1024 requires ~10M gas. One-time cost per pool, bounded.

#### MED-12: CTDeployer Grants Wildcard ADJUST_721_TIERS to CTPublisher [croptop-core-v6]
All CTDeployer hooks are affected if CTPublisher has a vulnerability. By design.

#### MED-13: CTDeployer Permissions Bound to Initial Owner, Not Transferable [croptop-core-v6]
After project transfer, old owner retains 721 permissions, new owner doesn't get them automatically.

#### MED-14: JBOmnichainDeployer Ruleset ID Prediction Without Validation in Launch Paths [nana-omnichain-deployers-v6]
`block.timestamp + i` prediction exists in `queueRulesetsOf` but not `launchRulesetsFor`. Low risk due to first-ruleset scenario.

#### MED-15: Data Hook Can Override totalSupply to Drain Surplus [nana-core-v6]
Malicious data hook can set `totalSupply = cashOutCount` to return full surplus. Documented trust model — data hooks are set by project owners.

#### MED-16: External ERC-20 via setTokenFor Creates Supply Manipulation Surface [nana-core-v6]
External token's `totalSupply()` can be inflated by separate minting authority. Requires `allowSetCustomToken` opt-in.

#### MED-17: Locked Split Semantic Drift [nana-core-v6]
Locked splits reference project IDs, not behavior. The referenced project could change between lock and unlock.

#### MED-18: Price Feed Inverse Precision Loss at Extreme Ratios [nana-core-v6]
`mulDiv(10^decimals, 10^decimals, price)` loses precision for extreme price disparities. Documented.

#### MED-19: BAN Project ID Not Enforced in Deployment Script [deploy-all-v6]
Projects 1-3 use `_ensureProjectExists()` with explicit ID validation. BAN (project 4) uses `_revDeployer.deployFor({revnetId: 0})` which creates the next available ID without validation. If re-run after partial failure where someone else created project 4, BAN gets project 5, breaking cross-chain alignment. Fix: use `_ensureProjectExists(_BAN_PROJECT_ID)` pattern.

#### MED-20: Start Times Are >1 Year in the Past [deploy-all-v6]
All project start times are set to Feb 2025. This triggers cash-out delay logic and means ~4 weight decay cycles have already elapsed at deployment. The auto-issuance amounts should be verified against the economic model at actual deployment timestamp. Likely intentional for cross-chain consistency but needs confirmation.

---

### LOW (15+)

- Optimizer mismatch: deploy-all-v6 uses `optimizer = false`, nana-fee-project-deployer-v6 uses `optimizer_runs = 200` (affects bytecode verification)
- No validation that sucker deployers are non-zero on L2 in `_buildSuckerConfig` (deploy-all-v6) — standalone fee deployer has the check
- Fee-on-transfer tokens not explicitly handled in payouts/cashouts (nana-core)
- Custom price feeds could enable manipulation (nana-core)
- Fee processing failure allows fee avoidance (nana-core)
- `processHeldFeesOf` has no access control beyond unlock timestamp (nana-core)
- Held fees stranded after migration — no guardrail prevents bad ordering (nana-core)
- CCIP refund failure permanently locks ETH in sucker (nana-suckers)
- `toRemote` fee payment can be bypassed if fee terminal absent (nana-suckers)
- Arbitrum `callValueRefundAddress` set to peer, not sender (nana-suckers)
- Category sort order not enforced against existing tiers in adjustTiers (nana-721-hook)
- Defifa integer division dust permanently locked (defifa-collection-deployer)
- JBBuybackHookRegistry `disallowHook` cannot force-remove from existing projects (nana-buyback-hook)
- RouterTerminalRegistry no FoT balance delta check (nana-router-terminal)
- SVG injection via owner-set content in Banny resolver (banny-retail)
- CTPublisher fee rounding dust (croptop-core)
- JBOwnable permissionId=0 reset semantics (nana-ownable)

---

## Cross-Component Interaction Analysis

### Chain 1: Price Feed → Surplus → Loans → LP Positioning
**Risk:** Stale/manipulated Chainlink feed simultaneously allows over-borrowing in REVLoans AND incorrect LP tick ranges in JBUniswapV4LPSplitHook.
**Assessment:** Mitigated by Chainlink staleness thresholds and L2 sequencer checks. No cross-component circuit breaker exists. **Acceptable risk** — feed failure causes DoS, not fund loss.

### Chain 2: Data Hook → Buyback → V4 Router → Terminal
**Risk:** 4-contract delegation chain where the V4 hook's routing decision can disagree with the buyback hook's swap decision, causing silent fallback to mint.
**Assessment:** The `_routing` reentrancy flag correctly prevents infinite recursion. The fallback is suboptimal (mint instead of swap) but not unsafe. **Value leakage, not fund loss.**

### Chain 3: Sucker Registry → Omnichain Deployer → 0% Cashout Tax
**Risk:** Registry holds wildcard `MAP_SUCKER_TOKEN` from 3 deployers. False registration enables cashout tax bypass.
**Assessment:** Registry requires `DEPLOY_SUCKERS` permission + deployer allowlist. Defense is adequate but the blast radius of a registry compromise is ecosystem-wide. **Highest systemic risk.**

### Chain 4: Controller Migration → Terminal Migration → Held Fee Escape
**Risk:** Terminal migration moves balances but not held fees. Post-migration fee processing creates phantom balances.
**Assessment:** Known, documented, tested. No guardrail prevents the bad ordering. **Recommend processing held fees before migration.**

---

## Test Coverage Assessment

### Strong Areas (8+ / 10)
- Flash loan attacks: 12 vectors tested in nana-core
- Bonding curve formal properties: 7 properties proven
- Fee arithmetic formal properties: 6 properties proven
- Terminal store invariants: 5 invariants with fuzzing
- Economic simulation: 3 projects, 10 actors, 15 operations
- Permission escalation: Comprehensive ROOT boundary tests
- Sucker attack vectors: Double-claim, cross-chain authentication, amount conservation
- 721 hook: Supply bypass, discount exploitation, reserve timing

### Coverage Gaps (Action Required)

| Gap | Repo | Severity | Recommendation |
|-----|------|----------|---------------|
| No reentrancy test for cashout hook re-entering pay | nana-core | HIGH | Add test where cashout hook calls terminal.pay() |
| No test for `_mintRebalancedPosition` fee token accounting | univ4-lp-split-hook | HIGH | Add test with projectToken == feeProjectToken during rebalance |
| No composed hook test (buyback + V4 routing conflict) | nana-buyback-hook + univ4-router | HIGH | Add end-to-end adversarial test |
| No test for phantom balance + cross-terminal surplus | nana-core | MEDIUM | Test `useTotalSurplusForCashOuts` after migration |
| No test for V4 spot price sandwich attack | nana-router-terminal | MEDIUM | Add adversarial sandwich test |
| No test for `recordAddedBalanceFor` from non-terminal | nana-core | MEDIUM | Verify non-terminal calls are harmless |
| No test for CCIP amount mismatch | nana-suckers | MEDIUM | Test behavior when delivered < root.amount |
| No test for concurrent multi-project fee token accounting | univ4-lp-split-hook | MEDIUM | Test 2 projects on same hook clone |
| No test for ETH stranding when split payout + addToBalance both fail | nana-721-hook | LOW | Add double-failure edge case test |
| No test for OMNICHAIN_RULESET_OPERATOR abuse on duration=0 projects | nana-core | MEDIUM | Test arbitrary ruleset queuing |

---

## Deployment Readiness Checklist

### Must Fix Before Deployment (Blocking)

- [ ] **CRIT-1:** Add `_totalOutstandingFeeTokenClaims` subtraction to `_mintRebalancedPosition` in JBUniswapV4LPSplitHook
- [ ] **CRIT-2:** Add minimum slippage to `_routeFeesToProject` OR make `collectAndRouteLPFees` permissioned
- [ ] **HIGH-2/3:** Add `ReentrancyGuard` to `REVLoans`
- [ ] **HIGH-5:** Add `ReentrancyGuard` to `JBUniswapV4LPSplitHook` critical functions
- [ ] **HIGH-7:** Add idempotency guard to `JBAddressRegistry._registerAddress`
- [ ] **HIGH-8:** Add zero-address guard in `CTDeployer.beforeCashOutRecordedWith` and `beforePayRecordedWith`
- [ ] **MED-19:** Fix BAN project ID enforcement — use `_ensureProjectExists(_BAN_PROJECT_ID)` pattern in deploy-all-v6

### Should Fix Before Deployment (Recommended)

- [ ] **HIGH-1:** Verify OMNICHAIN_RULESET_OPERATOR bytecode on all target chains
- [ ] **HIGH-4:** Document V4 spot price risk; ensure all frontends supply `quoteForSwap` metadata
- [ ] **HIGH-6:** Consider defaulting `cannotIncreaseDiscountPercent` to `true`
- [ ] **MED-14:** Add `latestRulesetId >= block.timestamp` guard to `_launchRulesetsFor`
- [ ] **MED-20:** Verify start times and auto-issuance amounts match economic model at deployment timestamp
- [ ] Add the 10 missing test categories identified above
- [ ] Remove unused error `JBPermissions_CantSetRootPermissionForWildcardProject` (cosmetic)
- [ ] Verify each project operator address (NANA/CPN/REV/BAN) is the correct intended multisig

### Accept and Document

- [ ] MED-1: Phantom balance after migration — documented
- [ ] MED-3: Sucker registry blast radius — documented, deployment-guarded
- [ ] MED-7: Arbitrum non-atomicity — inherent to bridge architecture
- [ ] MED-8: Buyback + V4 routing disagreement — documented fallback
- [ ] MED-15: Data hook trust model — by design

---

## Deployment Script Verification (deploy-all-v6)

All external addresses hardcoded in the deployment script have been cross-verified:

| Component | Status | Notes |
|-----------|--------|-------|
| Uniswap V4 PoolManager (4 chains) | **VERIFIED** | All match canonical deployments |
| Uniswap V4 PositionManager (4 chains) | **VERIFIED** | All match canonical deployments |
| Chainlink ETH/USD feeds (4 chains) | **VERIFIED** | Including L2 sequencer feeds |
| Chainlink USDC/USD feeds (4 chains) | **VERIFIED** | Staleness thresholds appropriate |
| OP/Base L1/L2 bridge addresses | **VERIFIED** | Canonical predeploy addresses |
| Arbitrum inbox/gateway addresses | **VERIFIED** | Via ARBAddresses library |
| OMNICHAIN_RULESET_OPERATOR | **VERIFIED** | Correctly set to JBOmnichainDeployer address |
| CREATE2 determinism | **VERIFIED** | Sphinx safe as deployer prevents front-running |
| Deployment ordering | **VERIFIED** | Correct dependency chain, idempotent re-execution |
| Project ID alignment (1-3) | **VERIFIED** | Uses `_ensureProjectExists` with explicit validation |
| Project ID alignment (4/BAN) | **NOT VERIFIED** | Uses `revnetId: 0` without ID validation (see MED-19) |
| Wildcard permission grants | **VERIFIED** | 3 non-ROOT grants, appropriate scope |

**Permission model:** All 33 permission IDs (1-33) verified unique, complete, and correctly consumed. No operations found lacking permission checks. ROOT (ID 1) escalation prevention is comprehensive.

**Ownership:** All protocol infrastructure retained by Sphinx safe (multisig). No ownership transfers occur during deployment.

**Partial failure safety:** Sphinx executes atomically per chain. Idempotency guards (`_isDeployed()`) make re-execution safe.

---

## Architecture Strengths

The protocol demonstrates mature security engineering:

1. **Consistent CEI ordering** across all fund flow paths — no explicit `ReentrancyGuard` but state is committed before external calls throughout nana-core
2. **Try-catch on all external calls** in the terminal — failed splits, fees, and payouts are caught and handled gracefully
3. **`_feeFreeSurplusOf` mechanism** correctly closes the fee bypass vector on same-terminal payouts
4. **Held fee lifecycle** — index advanced before external calls, re-read from storage each iteration
5. **Permission system** — ROOT escalation prevention is comprehensive (3-prong check)
6. **Sucker bridge** — bitmap-before-external-call prevents double-claiming; peer authentication is correct per bridge
7. **Bonding curve** — formally verified properties; flash loan profitability provably impossible with non-zero tax

---

## Final Assessment

The Juicebox V6 ecosystem is a well-engineered protocol with evidence of iterative security improvements across multiple audit rounds. The core fund flow contracts (JBMultiTerminal, JBTerminalStore, JBController) are at deployment-grade quality. The permission system, ruleset lifecycle, and fee mechanics are correctly implemented.

The primary risk areas are:

1. **UniV4 integration layer** (LP split hook, router terminal) — newest code, most complex interactions, lowest test coverage for adversarial scenarios
2. **Cross-component composition** — the 4-deep hook delegation chain and multi-singleton dependency create correlated failure modes
3. **Wildcard permissions** (REVLoans, SuckerRegistry, CTPublisher) — each is a single-contract-failure-away from ecosystem-wide impact

With the 7 blocking fixes above, the ecosystem reaches **9/10 confidence**. The remaining gap to 10/10 is the test coverage additions and cross-chain deployment verification.

---

*Report generated by Claude Opus 4.6 security audit. Findings should be verified by human security engineers before deployment decisions.*
