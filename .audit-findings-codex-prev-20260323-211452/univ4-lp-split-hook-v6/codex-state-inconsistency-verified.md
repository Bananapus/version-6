# State Inconsistency Audit — Verified Findings

## Coupled State Dependency Map

| Coupled State | Invariant |
|---------------|-----------|
| `claimableFeeTokens[projectId]` ↔ fee-project ERC-20 balance held by the hook | Every project’s claimable fee-token accounting must be fully backed by tokens actually custodied by the hook |
| `tokenIdOf[projectId][terminalToken]` ↔ `_poolKeys[projectId][terminalToken]` | A live LP position must have consistent pool metadata |
| `deployedPoolCount[projectId]` ↔ `processSplitWith()` mode | Before first deployment reserved splits accumulate; after deployment they burn |
| `accumulatedProjectTokens[projectId]` ↔ pre-deploy project-token balance | Deployment should only use that project’s accumulated inventory |

## Mutation Matrix

| State Variable | Mutating Function | Updates Coupled State? |
|----------------|-------------------|-------------------------|
| `claimableFeeTokens[projectId]` | `_routeFeesToProject()` | Writes accounting only |
| fee-project ERC-20 balance in hook | `_routeFeesToProject()` | Yes, via `terminal.pay()` mint |
| fee-project ERC-20 balance in hook | `deployPool()` / `_addUniswapLiquidity()` when `projectId == FEE_PROJECT_ID` | No, consumes entire balance without checking `claimableFeeTokens` |
| fee-project ERC-20 balance in hook | `processSplitWith()` post-deploy via `_burnReceivedTokens()` when `projectId == FEE_PROJECT_ID` | No, burns entire balance without checking `claimableFeeTokens` |
| fee-project ERC-20 balance in hook | `_handleLeftoverTokens()` when `projectId == FEE_PROJECT_ID` | No, burns leftovers without checking `claimableFeeTokens` |
| `claimableFeeTokens[projectId]` | `claimFeeTokensFor()` | Zeroes accounting and transfers tokens, assuming balance still exists |

## Parallel Path Comparison

| Coupled State | Fee accrual path | Fee-project deploy path | Fee-project post-deploy split path |
|---------------|------------------|-------------------------|------------------------------------|
| `claimableFeeTokens[projectId]` backing | `✓` credited | `✗` backing consumed into LP | `✗` backing burned wholesale |

## Verification Summary
| ID | Coupled Pair | Breaking Op | Original Severity | Verdict | Final Severity |
|----|-------------|-------------|-------------------|---------|----------------|
| SI-001 | `claimableFeeTokens[project]` ↔ fee-project ERC-20 balance in hook | `deployPool()` / `processSplitWith()` for `FEE_PROJECT_ID` | HIGH | TRUE POSITIVE | HIGH |

## Verified Findings

### Finding SI-001: HIGH — Fee-project lifecycle paths desynchronize `claimableFeeTokens` from the tokens that back them
**Severity:** HIGH
**Verification:** Hybrid

**Coupled Pair:** `claimableFeeTokens[projectId]` ↔ fee-project ERC-20 balance held by the hook

**Invariant:** For every project, the fee-project ERC-20 tokens promised in `claimableFeeTokens[projectId]` must remain custodied by the hook until `claimFeeTokensFor(projectId, ...)` transfers them out.

**Breaking Operation:** fee-project `deployPool()` and post-deploy burn paths in `JBUniswapV4LPSplitHook`
- Modifies backing token balance: consumes or burns all fee-project ERC-20 tokens held by the hook
- Does NOT update `claimableFeeTokens` for the projects whose fee tokens were consumed

**Code references:**
- Accounting credit: [src/JBUniswapV4LPSplitHook.sol:1402](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L1402) to [src/JBUniswapV4LPSplitHook.sol:1442](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L1442)
- LP sizing from full balance: [src/JBUniswapV4LPSplitHook.sol:758](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L758)
- Post-deploy burn from full balance: [src/JBUniswapV4LPSplitHook.sol:624](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L624) and [src/JBUniswapV4LPSplitHook.sol:860](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L860)
- Leftover burn from full balance: [src/JBUniswapV4LPSplitHook.sol:1173](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L1173)
- Claim assumes backing still exists: [src/JBUniswapV4LPSplitHook.sol:497](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L497) to [src/JBUniswapV4LPSplitHook.sol:502](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L502)

**Trigger Sequence:**
1. Project A accrues LP fees; `_routeFeesToProject()` mints fee-project ERC-20s to the hook and increments `claimableFeeTokens[A]`.
2. The hook instance is also used by the fee project itself.
3. The fee project deploys a pool or later receives a reserved-token split after deployment.
4. The fee-project path reads `IERC20(projectToken).balanceOf(address(this))` and uses or burns the entire fee-project token balance.
5. `claimableFeeTokens[A]` remains unchanged even though its backing tokens are gone.
6. `claimFeeTokensFor(A, beneficiary)` reverts or underpays.

**Consequence:**
- Fee-token claims for unrelated projects become unbacked.
- Depending on which path consumes the tokens, they are either:
  - moved into the fee project’s LP position, or
  - burned outright.

**Verification Evidence:**
- Code trace confirmed there is no hidden segregation or lazy reconciliation between `claimableFeeTokens` and the actual ERC-20 balance.
- PoC test: `forge test --match-path test/audit/FeeProjectSelfBurnPoC.t.sol -vvv`
  - Passed.
  - Demonstrated that deploying a pool for `FEE_PROJECT_ID` consumed more fee-project tokens than the fee project accumulated for itself, then left `claimableFeeTokens[PROJECT_ID]` stale and unclaimable.

**Fix:**
```solidity
// Exclude reserved fee-claim inventory from fee-project operational flows.
uint256 backingReservedForClaims = totalClaimableFeeProjectTokens();
uint256 usableBalance = IERC20(projectToken).balanceOf(address(this)) - backingReservedForClaims;
```

All fee-project operational paths must use `usableBalance`, not the raw ERC-20 balance.

## False Positives Eliminated
- No hidden reconciliation path updates `claimableFeeTokens` when fee-project tokens are later consumed.
- This is not lazy evaluation: `claimFeeTokensFor()` performs an immediate transfer and therefore requires live backing.

## Summary
- Coupled state pairs mapped: 4 high-signal pairs
- Mutation paths analyzed: 14
- Raw findings (pre-verification): 1
- After verification: 1 TRUE POSITIVE | 0 FALSE POSITIVE
- Final: 0 CRITICAL | 1 HIGH | 0 MEDIUM | 0 LOW
