# State Inconsistency Audit — Verified Findings

## Coupled State Dependency Map

| Pair | Invariant | Mutation points |
|------|-----------|-----------------|
| `deployerOf[computedAddress]` ↔ CREATE-derived address from `(deployer, nonce)` | stored key must exactly match deterministic CREATE derivation | `registerAddress(address,uint256)` |
| `deployerOf[computedAddress]` ↔ CREATE2-derived address from `(deployer, salt, bytecodeHash)` | stored key must exactly match deterministic CREATE2 derivation | `registerAddress(address,bytes32,bytes)` |
| `deployerOf[addr]` ↔ `AddressRegistered(addr,deployer,caller)` | event must mirror the mapping write and caller context | `_registerAddress` |
| deploy-script precheck target ↔ actual Sphinx deployment target | idempotence check must observe the same address later deployed | `Deploy.run`, `Deploy._isDeployed` |

## Mutation Matrix

| State Variable | Mutating Function | Updates Coupled State? |
|----------------|-------------------|-------------------------|
| `deployerOf[computed]` | `registerAddress(address,uint256)` | yes |
| `deployerOf[computed]` | `registerAddress(address,bytes32,bytes)` | yes |
| deploy-script idempotence assumption | `Deploy.run()` | no, precheck target differs from deployment target |

## Parallel Path Comparison

| Coupled State | CREATE path | CREATE2 path | Script deployment path |
|---------------|-------------|--------------|------------------------|
| mapping key ↔ deterministic formula | synced | synced | n/a |
| mapping write ↔ emitted event | synced | synced | n/a |
| precheck target ↔ actual deployment target | n/a | n/a | gap |

## Verification Summary

| ID | Coupled Pair | Breaking Op | Original Severity | Verdict | Final Severity |
|----|-------------|-------------|-------------------|---------|----------------|
| SI-001 | precheck target ↔ actual deployment target | `Deploy.run()` | LOW | TRUE POSITIVE | LOW |

## Verified Findings

### Finding SI-001: Sphinx deploy precheck desynchronizes from the real CREATE2 deployment path
**Severity:** LOW
**Verification:** Code trace

**Coupled Pair:** deployment precheck target ↔ actual CREATE2 deployment target
**Invariant:** the address checked for existing code must be the same address later used by `new JBAddressRegistry{salt: ...}()`

**Breaking Operation:** `run()` in `script/Deploy.s.sol:19-24`
- Modifies the deployment state by attempting a CREATE2 deployment from the Sphinx-pranked Safe.
- Does **not** check the Safe-based target first; `_isDeployed()` instead checks a DDP-based target in `script/Deploy.s.sol:29-33`.

**Trigger Sequence:**
1. Deploy `JBAddressRegistry` once through the Sphinx flow.
2. Rerun the deploy script expecting it to skip because the contract already exists.
3. `_isDeployed()` checks `vm.computeCreate2Address(..., deployer = 0x4e59...)`.
4. The actual deployment still occurs from `safeAddress()` because the `sphinx` modifier pranks the Safe.
5. The second run sees a stale/incorrect precheck result and attempts a duplicate deployment.

**Consequence:**
- The deployment script is not truly idempotent under its own execution model.
- Operators can hit an avoidable redeploy revert during retries or recovery operations.

**Fix:**
```solidity
function _isDeployed(bytes32 salt, bytes memory creationCode, bytes memory arguments) internal returns (bool) {
    address deployedTo = vm.computeCreate2Address({
        salt: salt,
        initCodeHash: keccak256(abi.encodePacked(creationCode, arguments)),
        deployer: safeAddress()
    });
    return deployedTo.code.length != 0;
}
```

## False Positives Eliminated

- No storage desynchronization exists inside `JBAddressRegistry`; both registration paths funnel through `_registerAddress`.
- No partial-update or stale-event issue exists; event emission occurs immediately after the mapping write and uses identical values.
- No lazy reconciliation pattern was missed; the contract maintains no secondary accounting state beyond `deployerOf`.

## Summary
- Coupled state pairs mapped: 4
- Mutation paths analyzed: 3
- Raw findings (pre-verification): 1
- After verification: 1 TRUE POSITIVE | 0 FALSE POSITIVE
- Final: 0 CRITICAL | 0 HIGH | 0 MEDIUM | 1 LOW
