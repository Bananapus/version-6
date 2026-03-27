# State Inconsistency Audit — Verified Findings

## Coupled State Dependency Map
- `cashOutCount` selected by the data hook ↔ `cashOutCount` consumed later by the cash-out hook callback
  - Invariant: the callback must execute against the same token count the data hook priced.
- `feeCashOutCount` / `nonFeeCashOutCount` split ↔ beneficiary-facing execution path
  - Invariant: the fee tranche must not be sold for the beneficiary after being carved out of the priced count.
- `script` deployment existence check ↔ fee project identity
  - Invariant: idempotence logic must refer to the same deployer/address derivation the script actually uses.

## Mutation Matrix
| State / Derived Value | Mutating Function | Expected Coupled Update |
|---|---|---|
| `buybackHookContext.cashOutCount` | `REVDeployer.beforeCashOutRecordedWith` | Downstream callback must use the same reduced count |
| terminal burn count / callback context count | `JBMultiTerminal._cashOutTokensOf` | Must stay synchronized with the hook-priced count |
| fee project ID in script | `DeployScript.deploy` | Must stay synchronized with actual deployment reuse logic |

## Verification Summary
| ID | Coupled Pair | Breaking Op | Original Severity | Verdict | Final Severity |
|----|-------------|-------------|-------------------|---------|----------------|
| SI-001 | reduced hook count ↔ callback count | cash out via buyback route | HIGH | TRUE POSITIVE | HIGH |
| SI-002 | deployment reuse check ↔ fee project creation | `DeployScript.deploy()` | LOW | TRUE POSITIVE | LOW |

## Verified Findings

### Finding SI-001: REVDeployer prices only the non-fee cash-out tranche, but the buyback callback executes on the full burn amount
**Severity:** HIGH  
**Verification:** Hybrid

**Coupled Pair:** reduced `cashOutCount` ↔ callback `context.cashOutCount`  
**Invariant:** the hook callback must consume the same token count that the data hook priced after removing the fee tranche.

**Breaking Operation:** `REVDeployer.beforeCashOutRecordedWith()` in `src/REVDeployer.sol:302-331`
- Modifies state/flow A: passes only `nonFeeCashOutCount` into the buyback hook decision path.
- Does not update coupled state B: the later callback path in `JBMultiTerminal` still forwards the original `cashOutCount`.

**Trigger Sequence:**
1. User holds revnet tokens and the revnet has a configured buyback sell path.
2. User cashes out through a route where the buyback hook chooses pool execution over direct reclaim.
3. REVDeployer computes `feeCashOutCount`, `nonFeeCashOutCount`, and `feeAmount`.
4. Core terminal burns the full original count and calls the buyback callback with the full original count.
5. Buyback hook remints/sells the full amount even though fee accounting only priced the non-fee amount.

**Consequence:**
- The beneficiary receives execution on the fee tranche that should have been excluded.
- The fee project still receives `feeAmount`.
- Treasury-side value is consumed while the user escapes the intended fee haircut.

**Verification evidence:**
- Code trace across:
  - `src/REVDeployer.sol:302-331`
  - `node_modules/@bananapus/core-v6/src/JBMultiTerminal.sol:1074-1086`
  - `node_modules/@bananapus/core-v6/src/JBMultiTerminal.sol:1118-1133`
  - `node_modules/@bananapus/buyback-hook-v6/src/JBBuybackHook.sol:210-226`
- PoC:
  - `forge test --match-path test/regression/TestCashOutBuybackFeeBypass.t.sol -vvv`
  - Pass result confirms: reduced count before routing, full original count in the callback.

### Finding SI-002: The deployment script’s existence check is desynchronized from the deployer it actually uses
**Severity:** LOW  
**Verification:** Code trace

**Coupled Pair:** `_isDeployed` prediction ↔ actual Sphinx deployment path  
**Invariant:** the idempotence check must derive addresses from the same deployer that the script uses at runtime.

**Breaking Operation:** `_isDeployed()` in `script/Deploy.s.sol:413-425`
- Modifies state/flow A: uses Arachnid’s deterministic deployment proxy for address prediction.
- Does not update coupled state B: `deploy()` runs under Sphinx and creates a fresh fee project before checking reuse.

**Consequence:**
- Re-running the deployment script creates new fee-project state and new contract instances instead of reusing the existing deployment.

## False Positives Eliminated
- Loan-source fee refund path in `REVLoans` as a standalone unprivileged exploit.

## Summary
- Coupled pairs mapped: 3
- Mutation paths analyzed: 8
- Verified: 2 true positives
- Final: 1 HIGH, 1 LOW
