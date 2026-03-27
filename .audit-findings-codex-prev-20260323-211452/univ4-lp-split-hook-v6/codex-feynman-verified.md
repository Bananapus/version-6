# Feynman Audit — Verified Findings

## Scope
- Language: Solidity 0.8.26
- Modules analyzed: `src/JBUniswapV4LPSplitHook.sol`, `src/JBUniswapV4LPSplitHookDeployer.sol`, `script/Deploy.s.sol`
- Functions analyzed: 46
- Lines interrogated: 1803

## Verification Summary
| ID | Original Severity | Verdict | Final Severity |
|----|-------------------|---------|----------------|
| FF-001 | HIGH | TRUE POSITIVE | HIGH |

## Function-State Matrix
High-signal write paths:

| Function | Writes | Notes |
|----------|--------|-------|
| `collectAndRouteLPFees` | `claimableFeeTokens`, fee-project token balance, project terminal balance | Permissionless fee harvest path |
| `deployPool` | `deployedPoolCount`, `_poolKeys`, `tokenIdOf`, `accumulatedProjectTokens` | First-stage to live-pool transition |
| `processSplitWith` | `accumulatedProjectTokens` or fee-project token burn path | Switches from accumulate to burn mode |
| `rebalanceLiquidity` | `tokenIdOf` via burn/remint, fee routing side effects | Reuses shared balances mid-flight |
| `claimFeeTokensFor` | `claimableFeeTokens` | Assumes fee-token backing is still present |

## Verified Findings

### Finding FF-001: HIGH — Fee project operations can destroy or consume fee tokens owed to other projects
**Severity:** HIGH
**Module:** `JBUniswapV4LPSplitHook`
**Function:** `deployPool`, `processSplitWith`, `_burnReceivedTokens`, `_handleLeftoverTokens`, `_routeFeesToProject`, `claimFeeTokensFor`
**Lines:** `src/JBUniswapV4LPSplitHook.sol:497`, `src/JBUniswapV4LPSplitHook.sol:758`, `src/JBUniswapV4LPSplitHook.sol:861`, `src/JBUniswapV4LPSplitHook.sol:1173`, `src/JBUniswapV4LPSplitHook.sol:1442`
**Verification:** Hybrid — code trace + Foundry PoC (`test/audit/FeeProjectSelfBurnPoC.t.sol`)

**Feynman Question that exposed this:**
> Why is it safe for fee tokens owed to project A to live in the same ERC-20 balance that project B later treats as “all of my project tokens”?

**The code:**
```solidity
claimableFeeTokens[projectId] += beneficiaryTokenCount;

uint256 projectTokenAmount = IERC20(projectToken).balanceOf(address(this));

uint256 projectTokenBalance = IERC20(projectToken).balanceOf(address(this));

uint256 projectTokenLeftover = IERC20(projectToken).balanceOf(address(this));
```

**Why this is wrong:**
`_routeFeesToProject()` books per-project entitlements in `claimableFeeTokens[projectId]`, but the actual ERC-20 fee tokens are stored in one shared wallet: `address(this)`. Later, whenever the fee project itself uses the hook, `deployPool()` and the post-deploy burn paths read the entire on-contract balance for that token and treat it as fee-project inventory. There is no segregation between:

1. fee-project tokens owed to some other project as claimable fees, and
2. fee-project tokens legitimately belonging to the fee project’s own LP lifecycle.

That means the fee project can accidentally absorb those claimable tokens into a new LP position, or burn them outright, while `claimableFeeTokens[otherProject]` still says they are withdrawable.

**Verification evidence:**
- Code trace:
  - `_routeFeesToProject()` credits `claimableFeeTokens[projectId]` from the change in `IERC20(feeProjectToken).balanceOf(address(this))` at [src/JBUniswapV4LPSplitHook.sol:1402](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L1402) through [src/JBUniswapV4LPSplitHook.sol:1442](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L1442).
  - `claimFeeTokensFor()` later assumes those tokens are still present and blindly transfers `claimableFeeTokens[projectId]` at [src/JBUniswapV4LPSplitHook.sol:497](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L497) through [src/JBUniswapV4LPSplitHook.sol:502](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L502).
  - But fee-project lifecycle paths reuse the full token balance:
    - pre-mint LP sizing at [src/JBUniswapV4LPSplitHook.sol:758](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L758)
    - post-deploy burn mode at [src/JBUniswapV4LPSplitHook.sol:624](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L624) and [src/JBUniswapV4LPSplitHook.sol:860](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L860)
    - leftover burn at [src/JBUniswapV4LPSplitHook.sol:1173](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L1173)
- PoC:
  - `forge test --match-path test/audit/FeeProjectSelfBurnPoC.t.sol -vvv`
  - Result: pass
  - The PoC first accrues claimable fee-project tokens for project 1, then deploys a pool for `FEE_PROJECT_ID`.
  - During that deployment, the fee project’s LP mint consumes more fee-project tokens than the fee project accumulated for itself, proving it also pulled in project 1’s claimable balance.
  - A subsequent `claimFeeTokensFor(PROJECT_ID, user)` reverts because `claimableFeeTokens[PROJECT_ID]` remains nonzero while the backing token balance has already been drained.

**Attack scenario:**
1. Project A collects LP fees, causing `_routeFeesToProject()` to mint fee-project ERC-20s to the hook and increase `claimableFeeTokens[A]`.
2. The same hook instance is also used by the fee project itself (`projectId == FEE_PROJECT_ID`).
3. The fee project deploys or rebalances its own pool, or receives a post-deployment reserved-token split.
4. The hook reads `IERC20(feeProjectToken).balanceOf(address(this))` and consumes or burns the entire balance, including project A’s claimable fee tokens.
5. Project A later calls `claimFeeTokensFor(A, beneficiary)` and the transfer fails or the beneficiary receives less than accounting promised.

**Impact:**
- Cross-project theft / permanent claim failure of fee tokens.
- The blast radius is all projects sharing a hook instance where the configured fee project also uses that hook for its own LP lifecycle.
- Because fee claims are user-facing accounting, this breaks the invariant that `claimableFeeTokens[projectId]` is fully backed by tokens held by the hook.

**Suggested fix:**
```solidity
// Track fee-project tokens reserved for third-party claims separately,
// and never include them in fee-project operational balances.
mapping(uint256 projectId => uint256 reservedFeeProjectTokens) public reservedFeeProjectTokens;

// When sizing/burning fee-project inventory:
uint256 usableProjectTokenBalance =
    IERC20(projectToken).balanceOf(address(this)) - totalReservedFeeProjectTokens;
```

At minimum, all fee-project operational paths must exclude tokens already reserved by `claimableFeeTokens` from LP sizing, leftover burns, and post-deployment burns.

## False Positives Eliminated
- Reentrancy through `collectAndRouteLPFees()` did not yield a verified accounting break under the current CEI ordering and existing tests.
- Permissionless `deployPool()` after 10x weight decay is intentional and matched the documented design.
- Deployment script review did not produce a verified address or ordering bug from local evidence.

## Downgraded Findings
- None.

## Summary
- Total functions analyzed: 46
- Raw findings (pre-verification): 0 CRITICAL | 1 HIGH | 0 MEDIUM | 0 LOW
- After verification: 1 TRUE POSITIVE | 0 FALSE POSITIVE | 0 DOWNGRADED
- Final: 1 HIGH | 0 MEDIUM | 0 LOW
