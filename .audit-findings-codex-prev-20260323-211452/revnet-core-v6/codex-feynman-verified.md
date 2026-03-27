# Feynman Audit — Verified Findings

## Scope
- Language: Solidity 0.8.26
- Files analyzed: 17
- Functions analyzed: 117
- Priority targets: `src/REVDeployer.sol`, `src/REVLoans.sol`, `script/Deploy.s.sol`

## Verification Summary
| ID | Original Severity | Verdict | Final Severity |
|----|-------------------|---------|----------------|
| FF-001 | HIGH | TRUE POSITIVE | HIGH |
| FF-002 | LOW | TRUE POSITIVE | LOW |

## Verified Findings

### Finding FF-001: Buyback cash-out path remints and sells the fee tranche that REVDeployer intended to burn
**Severity:** HIGH  
**Module:** `src/REVDeployer.sol` + dependency boundary with core/buyback hook  
**Functions:** `REVDeployer.beforeCashOutRecordedWith`, `JBMultiTerminal._cashOutTokensOf`, `JBBuybackHook.afterCashOutRecordedWith`  
**Lines:** `src/REVDeployer.sol:302-331`, `node_modules/@bananapus/core-v6/src/JBMultiTerminal.sol:1074-1086`, `node_modules/@bananapus/core-v6/src/JBMultiTerminal.sol:1118-1133`, `node_modules/@bananapus/buyback-hook-v6/src/JBBuybackHook.sol:210-226`  
**Verification:** Hybrid  
PoC: `forge test --match-path test/regression/TestCashOutBuybackFeeBypass.t.sol -vvv`

**Feynman question that exposed this:**  
Why does the data hook reduce `cashOutCount` for the buyback path, but the downstream cash-out hook still receive the original count?

**Why this is wrong:**  
`REVDeployer.beforeCashOutRecordedWith` splits the user’s burn into:
- a non-fee tranche, passed to the buyback hook via `buybackHookContext.cashOutCount = nonFeeCashOutCount`
- a fee tranche, converted into a treasury-side `feeAmount` hook spec

That logic assumes the buyback hook callback will only execute on the non-fee tranche. But the core terminal does not propagate the modified `cashOutCount` into the callback. `JBMultiTerminal` burns and forwards the original function argument `cashOutCount`, and `JBBuybackHook.afterCashOutRecordedWith` remints and sells `context.cashOutCount`.

So when the buyback route is chosen:
1. REVDeployer computes fees as if only `nonFeeCashOutCount` should benefit the user.
2. JBMultiTerminal still burns the full original count.
3. JBBuybackHook remints and sells the full original count for the beneficiary.
4. The fee hook separately still extracts `feeAmount` from project surplus.

The user therefore monetizes the fee tranche through the pool sale, while the project still pays the fee to the fee revnet. The fee stops being user-paid and becomes treasury-paid.

**Verification evidence:**  
- Code trace:
  - `REVDeployer` shrinks the count before delegating to buyback: `src/REVDeployer.sol:302-309`
  - `JBMultiTerminal` burns the original `cashOutCount`: `node_modules/@bananapus/core-v6/src/JBMultiTerminal.sol:1083-1086`
  - `JBMultiTerminal` passes the original `cashOutCount` into cash-out hook fulfillment: `node_modules/@bananapus/core-v6/src/JBMultiTerminal.sol:1121-1125`
  - `JBBuybackHook` remints and swaps `context.cashOutCount`: `node_modules/@bananapus/buyback-hook-v6/src/JBBuybackHook.sol:210-226`
- PoC:
  - `test/regression/TestCashOutBuybackFeeBypass.t.sol`
  - The test proves `REVDeployer.beforeCashOutRecordedWith` returns the reduced non-fee count, but the downstream hook callback receives the full original count.

**Impact:**  
- Conditional value loss for any revnet using the buyback sell path on cash-out.
- The cash-out fee is effectively charged to project surplus instead of to the exiting holder.
- Repeated sell-side exits leak extra value to exiting users and erode the treasury beyond intended fee semantics.

**Suggested fix:**  
Either:
- make the fee logic operate on forwarded reclaim value instead of on a split token count, or
- ensure the downstream sell hook receives the reduced non-fee `cashOutCount`, not the original terminal argument.

### Finding FF-002: Sphinx deployment script always misses prior deployments and always creates a fresh fee project
**Severity:** LOW  
**Module:** `script/Deploy.s.sol`  
**Function:** `deploy`, `_isDeployed`  
**Lines:** `script/Deploy.s.sol:344-410`, `script/Deploy.s.sol:413-425`  
**Verification:** Code trace

**Feynman question that exposed this:**  
Why does `deploy()` create a new fee project before the script has proven whether the contracts already exist?

**Why this is wrong:**  
`deploy()` eagerly executes `core.projects.createFor(...)` at line 347, then uses `_isDeployed` to decide whether to reuse or redeploy `REVLoans` and `REVDeployer`. But `_isDeployed` deliberately computes the address against Arachnid’s deterministic deployer, while the script actually runs under Sphinx. The script itself documents that this prediction “will always return false when deploying via Sphinx.”

That means rerunning the script is not idempotent:
1. A fresh fee project NFT is always created.
2. Both contracts are treated as undeployed.
3. A new fee sink can be introduced even when an older deployment already exists.

**Verification evidence:**  
- Project creation happens before any deployment check: `script/Deploy.s.sol:344-355`
- The helper explicitly states `_isDeployed` is always false under Sphinx: `script/Deploy.s.sol:422-425`

**Impact:**  
- Operational deployment risk in-scope for `script/`.
- Replay/reproposal can silently fork fee routing into a new fee project and a new contract set.

## False Positives Eliminated
- “Source-fee refund in `REVLoans._adjust` is borrower-controlled and trivially exploitable” was eliminated. The refund path is real, but the testable control point is an already-broken or malicious source terminal configuration, which is a trusted setup issue rather than an unprivileged exploit path in this repo.

## Summary
- Raw findings reviewed: 3
- After verification: 2 true positives, 1 false positive
- Final: 1 HIGH, 1 LOW
