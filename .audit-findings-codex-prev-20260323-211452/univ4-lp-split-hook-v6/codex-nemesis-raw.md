# N E M E S I S — Raw Findings

## Scope
- Fresh round, no prior findings used
- Solidity files analyzed:
  - `src/JBUniswapV4LPSplitHook.sol`
  - `src/JBUniswapV4LPSplitHookDeployer.sol`
  - `src/interfaces/IJBUniswapV4LPSplitHook.sol`
  - `src/interfaces/IJBUniswapV4LPSplitHookDeployer.sol`
  - `script/Deploy.s.sol`

## Phase 0 — Recon

### Attack Goals
1. Misroute or steal terminal/project tokens during pool deployment, fee collection, or rebalance.
2. Break fee-token accounting so projects cannot claim what the hook says they earned.
3. Abuse a deployment/configuration mistake to point the hook at the wrong V4 or Juicebox infrastructure.

### Novel Code
- `src/JBUniswapV4LPSplitHook.sol`
  - Custom LP lifecycle built on top of Juicebox reserved-token flows plus Uniswap V4 position management.
- `script/Deploy.s.sol`
  - Hardcoded infra addresses and chain branching.

### Value Stores + Initial Coupling Hypothesis
- Hook-held project tokens
  - Outflows: `deployPool`, `processSplitWith` post-deploy, `_handleLeftoverTokens`
  - Must stay consistent with: `accumulatedProjectTokens`, `deployedPoolCount`, `tokenIdOf`
- Hook-held terminal tokens
  - Outflows: `_mintPosition`, `_addToProjectBalance`, fee routing
  - Must stay consistent with: fee split math and project terminal balances
- Hook-held fee-project ERC-20 tokens
  - Outflows: `claimFeeTokensFor`
  - Must stay consistent with: `claimableFeeTokens[projectId]`

### Priority Targets
1. `collectAndRouteLPFees` / `_routeFeesToProject` / `claimFeeTokensFor`
2. `deployPool` / `_addUniswapLiquidity` / `_handleLeftoverTokens`
3. `processSplitWith` post-deploy burn mode
4. `rebalanceLiquidity`
5. `script/Deploy.s.sol`

## Phase 1 — Cross-Reference Map

| Function | Writes | Coupled State | Initial Status |
|----------|--------|---------------|----------------|
| `_routeFeesToProject` | `claimableFeeTokens[projectId]`, fee-project token balance | claimable accounting ↔ actual hook balance | suspect |
| `claimFeeTokensFor` | zeroes `claimableFeeTokens[projectId]` and transfers tokens | claimable accounting ↔ actual hook balance | suspect |
| `_addUniswapLiquidity` | consumes raw `IERC20(projectToken).balanceOf(address(this))` | fee-project operational balance ↔ third-party claim backing | suspect |
| `_burnReceivedTokens` | burns raw `IERC20(projectToken).balanceOf(address(this))` | fee-project operational balance ↔ third-party claim backing | suspect |
| `_handleLeftoverTokens` | burns raw `IERC20(projectToken).balanceOf(address(this))` | fee-project operational balance ↔ third-party claim backing | suspect |

## Pass 1 — Feynman (full)

### Raw suspect F-1
- Question:
  - Why is `IERC20(projectToken).balanceOf(address(this))` treated as entirely owned by `projectId` after the same hook also escrows fee-project tokens on behalf of other projects?
- Suspect lines:
  - `src/JBUniswapV4LPSplitHook.sol:758`
  - `src/JBUniswapV4LPSplitHook.sol:861`
  - `src/JBUniswapV4LPSplitHook.sol:1173`
- Hypothesis:
  - If `projectId == FEE_PROJECT_ID`, fee-project deploy/burn paths can consume fee tokens already promised to some other project.

## Pass 2 — State Inconsistency (full, enriched)

### Coupled pair S-1
- `claimableFeeTokens[projectId]` ↔ fee-project ERC-20 balance held by hook
- Required invariant:
  - Sum of unclaimed fee entitlements must remain backed by live fee-project tokens in the hook wallet.

### Gap S-1
- `_routeFeesToProject` creates per-project claims, but later fee-project operational paths consume the shared balance without decrementing those claims.

## Pass 3 — Feynman re-interrogation

### Root cause confirmed
- The hook has one shared fee-project token wallet and no reserved sub-balance for claimants.
- `claimFeeTokensFor` trusts accounting that can be invalidated by unrelated fee-project operations.

### Candidate finding NM-001
- Severity: HIGH
- Title:
  - Fee-project LP lifecycle can consume fee tokens owed to unrelated projects

## Pass 4 — State re-analysis

### Additional affected mutation paths
- `deployPool()` for `FEE_PROJECT_ID`
- `processSplitWith()` after `deployedPoolCount[FEE_PROJECT_ID] > 0`
- `_handleLeftoverTokens()` for `FEE_PROJECT_ID`

### Delta
- No second independent root cause surfaced beyond the same shared-balance coupling failure.

## Phase 5/6 — Verification notes
- Hybrid verification selected.
- Added PoC:
  - `test/audit/FeeProjectSelfBurnPoC.t.sol`
- Command:
  - `forge test --match-path test/audit/FeeProjectSelfBurnPoC.t.sol -vvv`
- Result:
  - PASS

## Raw Findings Summary
| ID | Source | Severity | Status |
|----|--------|----------|--------|
| NM-001 | Cross-feed P2→P3 | HIGH | Verified |
