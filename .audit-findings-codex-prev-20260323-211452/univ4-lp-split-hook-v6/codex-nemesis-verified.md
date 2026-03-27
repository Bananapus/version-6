# N E M E S I S — Verified Findings

## Scope
- Language: Solidity 0.8.26
- Modules analyzed:
  - `src/JBUniswapV4LPSplitHook.sol`
  - `src/JBUniswapV4LPSplitHookDeployer.sol`
  - `src/interfaces/IJBUniswapV4LPSplitHook.sol`
  - `src/interfaces/IJBUniswapV4LPSplitHookDeployer.sol`
  - `script/Deploy.s.sol`
- Functions analyzed: 46
- Coupled state pairs mapped: 4 high-signal pairs
- Mutation paths traced: 14
- Nemesis loop iterations: 4 passes (Feynman full → State full → Feynman targeted → State targeted/converged)

## Nemesis Map (Phase 1 Cross-Reference)

| Function | Writes A | Writes B | Coupled Pair | Sync Status |
|----------|----------|----------|--------------|-------------|
| `_routeFeesToProject` | fee-project token balance | `claimableFeeTokens[projectId]` | claimable fee accounting ↔ backing balance | `✓` on accrual |
| `claimFeeTokensFor` | `claimableFeeTokens[projectId]` | fee-project token balance | claimable fee accounting ↔ backing balance | `✓` if backing still exists |
| `_addUniswapLiquidity` for `FEE_PROJECT_ID` | fee-project token balance | `claimableFeeTokens[*]` | claimable fee accounting ↔ backing balance | `✗ GAP` |
| `_burnReceivedTokens` for `FEE_PROJECT_ID` | fee-project token balance | `claimableFeeTokens[*]` | claimable fee accounting ↔ backing balance | `✗ GAP` |
| `_handleLeftoverTokens` for `FEE_PROJECT_ID` | fee-project token balance | `claimableFeeTokens[*]` | claimable fee accounting ↔ backing balance | `✗ GAP` |

## Verification Summary
| ID | Source | Coupled Pair | Breaking Op | Severity | Verdict |
|----|--------|-------------|-------------|----------|---------|
| NM-001 | Cross-feed P2→P3 | `claimableFeeTokens[project]` ↔ fee-project token balance in hook | `deployPool()` / `processSplitWith()` / leftover burn for `FEE_PROJECT_ID` | HIGH | TRUE POSITIVE |

## Verified Findings

### Finding NM-001: HIGH — Fee-project operations can consume fee tokens already owed to other projects
**Severity:** HIGH
**Source:** Cross-feed P2→P3
**Verification:** Hybrid

**Coupled Pair:** `claimableFeeTokens[projectId]` ↔ fee-project ERC-20 balance held by the hook

**Invariant:** The hook must retain enough fee-project ERC-20 tokens to satisfy every outstanding `claimableFeeTokens[projectId]` balance until each project claims.

**Feynman Question that exposed it:**
> Why does the fee project later treat `IERC20(projectToken).balanceOf(address(this))` as entirely its own inventory when the same contract also escrows fee-project tokens for unrelated projects?

**State Mapper gap that confirmed it:**
> `_routeFeesToProject()` increments `claimableFeeTokens[projectId]`, but fee-project `deployPool()` / burn paths later mutate the same ERC-20 balance without touching any claimant accounting.

**Breaking Operations:**
- `deployPool()` path via `_addUniswapLiquidity()` at [src/JBUniswapV4LPSplitHook.sol:758](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L758)
  - Modifies State A: consumes the entire fee-project token balance in the hook when `projectId == FEE_PROJECT_ID`
  - Does NOT update State B: leaves `claimableFeeTokens[otherProject]` unchanged
- `processSplitWith()` post-deploy via `_burnReceivedTokens()` at [src/JBUniswapV4LPSplitHook.sol:624](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L624) and [src/JBUniswapV4LPSplitHook.sol:860](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L860)
  - Modifies State A: burns the entire fee-project token balance in the hook
  - Does NOT update State B: leaves `claimableFeeTokens[otherProject]` unchanged
- Leftover burn via `_handleLeftoverTokens()` at [src/JBUniswapV4LPSplitHook.sol:1173](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L1173)
  - Same coupling failure

**Trigger Sequence:**
1. Project A accrues LP fees.
2. `_routeFeesToProject()` pays `FEE_PROJECT_ID`, mints fee-project ERC-20s to the hook, and records them as `claimableFeeTokens[A]` at [src/JBUniswapV4LPSplitHook.sol:1402](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L1402) through [src/JBUniswapV4LPSplitHook.sol:1442](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L1442).
3. The same hook instance is used by the fee project itself.
4. The fee project deploys/rebalances a pool, or receives a post-deployment reserved split.
5. The hook consumes or burns the shared fee-project token balance.
6. Project A later calls `claimFeeTokensFor(A, beneficiary)` at [src/JBUniswapV4LPSplitHook.sol:497](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L497) through [src/JBUniswapV4LPSplitHook.sol:502](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L502), but the promised backing tokens are gone.

**Consequence:**
- Cross-project fee theft or permanent claim failure.
- The affected project’s accounting remains nonzero even though the claim is no longer backed by tokens.
- The consumed value is either:
  - moved into the fee project’s LP position, or
  - destroyed by a burn path.

**Verification Evidence:**
- Code trace:
  - Fee-token accrual and accounting: [src/JBUniswapV4LPSplitHook.sol:1402](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L1402) to [src/JBUniswapV4LPSplitHook.sol:1442](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L1442)
  - Shared-balance consumption: [src/JBUniswapV4LPSplitHook.sol:758](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L758), [src/JBUniswapV4LPSplitHook.sol:861](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L861), [src/JBUniswapV4LPSplitHook.sol:1173](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L1173)
  - Claim path that trusts stale accounting: [src/JBUniswapV4LPSplitHook.sol:497](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L497) to [src/JBUniswapV4LPSplitHook.sol:502](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol#L502)
- PoC:
  - Added `test/audit/FeeProjectSelfBurnPoC.t.sol`
  - Command: `forge test --match-path test/audit/FeeProjectSelfBurnPoC.t.sol -vvv`
  - Result: PASS
  - The PoC accrues claimable fee tokens for project 1, then deploys a pool for `FEE_PROJECT_ID`.
  - During deployment, the fee project consumes more fee-project tokens than it accumulated for itself, proving it also absorbed project 1’s claimable fee inventory.
  - `claimFeeTokensFor(PROJECT_ID, user)` then reverts because the accounting stayed nonzero while the backing balance was drained.

**Fix:**
```solidity
// Keep third-party claim inventory segregated from fee-project operational inventory.
mapping(uint256 projectId => uint256) public claimableFeeTokens;
uint256 public totalOutstandingFeeClaims;

uint256 usableFeeProjectBalance =
    IERC20(projectToken).balanceOf(address(this)) - totalOutstandingFeeClaims;
```

Every fee-project operational path must use `usableFeeProjectBalance`, not the raw contract balance. Alternatively, escrow each project’s claimable fee tokens in isolated per-project vaults or transfer them out immediately on accrual.

## Feedback Loop Discoveries
- The key bug only became obvious after combining:
  - Feynman’s “why is the whole balance safe to burn/use?” interrogation, and
  - the state mapper’s explicit coupling of `claimableFeeTokens[projectId]` to the shared fee-project token balance.

## False Positives Eliminated
- No verified exploit was found in `src/JBUniswapV4LPSplitHookDeployer.sol`.
- No verified constructor/deployment-ordering bug was found in `script/Deploy.s.sol` from local evidence.
- Reentrancy concerns around fee collection did not produce a separate verified invariant break.

## Downgraded Findings
- None.

## Summary
- Total functions analyzed: 46
- Coupled state pairs mapped: 4
- Nemesis loop iterations: 4 passes
- Raw findings (pre-verification): 0 C | 1 H | 0 M | 0 L
- Feedback loop discoveries: 1
- After verification: 1 TRUE POSITIVE | 0 FALSE POSITIVE | 0 DOWNGRADED
- Final: 0 CRITICAL | 1 HIGH | 0 MEDIUM | 0 LOW
