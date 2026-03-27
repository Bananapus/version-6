# N E M E S I S — Verified Findings

## Scope
- Language: Solidity
- Modules analyzed: `src/**/*.sol`, `script/**/*.sol`
- Files analyzed: 17
- Functions analyzed: 117
- Coupled state pairs mapped: 3 high-signal pairs
- Mutation paths traced: 8
- Nemesis loop iterations: 2 full passes + 1 targeted re-pass to convergence

## Verification Summary
| ID | Source | Coupled Pair | Breaking Op | Severity | Verdict |
|----|--------|-------------|-------------|----------|---------|
| NM-001 | Cross-feed P2→P3 | reduced hook count ↔ callback count | `beforeCashOutRecordedWith()` | HIGH | TRUE POSITIVE |
| NM-002 | Feynman-only | deploy existence check ↔ fee project identity | `DeployScript.deploy()` | LOW | TRUE POSITIVE |

## Verified Findings

### Finding NM-001: Buyback cash-out fee bypass turns a user fee into a treasury fee
**Severity:** HIGH  
**Source:** Cross-feed P2→P3  
**Verification:** Hybrid

**Coupled Pair:** reduced `cashOutCount` ↔ callback `context.cashOutCount`  
**Invariant:** once REVDeployer excludes the fee tranche from the routed count, no later hook path should execute on that excluded tranche.

**Feynman question that exposed it:**  
Why does the cash-out callback see a different token count than the count REVDeployer just priced?

**State gap that confirmed it:**  
- `src/REVDeployer.sol:302-309` rewrites the buyback path to `nonFeeCashOutCount`
- `node_modules/@bananapus/core-v6/src/JBMultiTerminal.sol:1121-1125` still forwards the original `cashOutCount`

**Breaking Operation:** `REVDeployer.beforeCashOutRecordedWith()` at `src/REVDeployer.sol:302`
- Modifies State/Flow A: fee split into `feeCashOutCount` and `nonFeeCashOutCount`
- Does NOT keep State/Flow B in sync: downstream callback still uses the original burn amount

**Trigger Sequence:**
1. A revnet enables the buyback sell route on cash-out.
2. A holder cashes out when the buyback route is selected.
3. REVDeployer computes the fee as if only `nonFeeCashOutCount` benefits the holder.
4. Core burns the full original count and invokes the buyback callback with that original count.
5. Buyback hook remints and sells the full amount for the holder, while the fee hook still charges the treasury-side `feeAmount`.

**Consequence:**
- Exiting holder monetizes the fee tranche through the pool route.
- Fee revnet still receives `feeAmount`.
- The revnet treasury pays the fee instead of the exiting holder.

**Verification Evidence:**
- Code trace:
  - `src/REVDeployer.sol:302-331`
  - `node_modules/@bananapus/core-v6/src/JBMultiTerminal.sol:1074-1086`
  - `node_modules/@bananapus/core-v6/src/JBMultiTerminal.sol:1118-1133`
  - `node_modules/@bananapus/buyback-hook-v6/src/JBBuybackHook.sol:210-226`
- PoC:
  - `test/regression/TestCashOutBuybackFeeBypass.t.sol`
  - `forge test --match-path test/regression/TestCashOutBuybackFeeBypass.t.sol -vvv`
  - Result: pass

**Fix:**
```solidity
// One safe direction: ensure the downstream sell hook uses the non-fee count,
// not the terminal's original cashOutCount.
```

### Finding NM-002: Sphinx deploy script is non-idempotent and always creates a fresh fee project
**Severity:** LOW  
**Source:** Feynman-only  
**Verification:** Code trace

**Coupled Pair:** deployment reuse check ↔ fee project identity  
**Invariant:** the script must not mint a fresh fee project before it has correctly established whether the deployment already exists.

**Breaking Operation:** `deploy()` at `script/Deploy.s.sol:344`
- Creates `FEE_PROJECT_ID` immediately via `core.projects.createFor(...)`
- Relies on `_isDeployed()`, which the script itself documents as always returning false under Sphinx

**Trigger Sequence:**
1. Operator reruns or reproposes the deployment.
2. Script mints a new fee project ID.
3. `_isDeployed` misses prior deployments because it predicts addresses against Arachnid’s proxy, not Sphinx’s runtime path.
4. Fresh contract instances are deployed/configured against the new fee project.

**Consequence:**
- Fee routing can fragment across multiple fee projects and contract generations.
- Prior deployments are not safely reused.

**Verification Evidence:**
- `script/Deploy.s.sol:347`
- `script/Deploy.s.sol:422-425`

## Feedback Loop Discoveries
- `NM-001` required both perspectives:
  - State pass identified the count desynchronization at the hook boundary.
  - Feynman re-interrogation traced the downstream consequence into `JBBuybackHook.afterCashOutRecordedWith`.

## False Positives Eliminated
- Candidate fee-bypass via `REVLoans` source-fee refund path was rejected as a trusted/broken-source-terminal scenario, not an unprivileged exploit in this repo.

## Summary
- Total functions analyzed: 117
- Coupled state pairs mapped: 3
- Nemesis loop iterations: 3
- Raw findings (pre-verification): 0 critical, 2 high/medium candidates, 1 low candidate
- After verification: 2 true positives, 1 false positive
- Final: 0 CRITICAL, 1 HIGH, 0 MEDIUM, 1 LOW
