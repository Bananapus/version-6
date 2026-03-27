# Feynman Audit — Verified Findings

## Scope
- Language: Solidity 0.8.26
- Modules analyzed:
  - `src/JBAddressRegistry.sol`
  - `src/interfaces/IJBAddressRegistry.sol`
  - `script/Deploy.s.sol`
  - `script/helpers/AddressRegistryDeploymentLib.sol`
- Functions analyzed: 10

## Verification Summary

| ID | Original Severity | Verdict | Final Severity |
|----|-------------------|---------|----------------|
| FF-001 | LOW | TRUE POSITIVE | LOW |

## Function-State Matrix

| Function | Reads | Writes | Guards | Calls |
|----------|-------|--------|--------|-------|
| `registerAddress(address,uint256)` | params | `deployerOf[computed]` | none | `_addressFrom`, `_registerAddress` |
| `registerAddress(address,bytes32,bytes)` | params | `deployerOf[computed]` | none | `_registerAddress` |
| `_addressFrom(address,uint256)` | params | none | `nonce <= uint64.max` | none |
| `_registerAddress(address,address)` | none | `deployerOf[addr]` | none | none |
| `configureSphinx()` | none | `sphinxConfig` | none | none |
| `run()` | `_isDeployed()` | deployment side effects | `sphinx` | `_isDeployed` |
| `_isDeployed(...)` | computed address code length | none | none | `vm.computeCreate2Address` |
| `getDeployment(string)` | `block.chainid` | none | none | overloaded `getDeployment` |
| `getDeployment(string,string)` | deployment artifact JSON | none | none | `_getDeploymentAddress` |
| `_getDeploymentAddress(...)` | deployment artifact JSON | none | none | `vm.readFile`, `stdJson.readAddress` |

## Guard Consistency Analysis

- No missing authorization guards in the registry contract. The permissionless registration model matches `RISKS.md`.
- No inconsistent state-writing guards between the CREATE and CREATE2 registration paths.

## Inverse Operation Parity

- No inverse-operation pairs exist in the registry contract.
- CREATE and CREATE2 registration paths both converge on `_registerAddress` and stay behaviorally aligned for mapping writes and event emission.

## Verified Findings

### Finding FF-001: `Deploy._isDeployed()` checks the wrong CREATE2 address under Sphinx
**Severity:** LOW
**Module:** `script/Deploy.s.sol`
**Function:** `run()` / `_isDeployed(...)`
**Lines:** `script/Deploy.s.sol:19-37`
**Verification:** Code trace

**Feynman Question that exposed this:**
> Why does the preflight compute a CREATE2 address from the Arachnid deterministic deployment proxy when the actual deployment body runs under Sphinx?

**The code:**
```solidity
function run() public sphinx {
    if (!_isDeployed({
            salt: ADDRESS_REGISTRY_SALT, creationCode: type(JBAddressRegistry).creationCode, arguments: ""
        })) {
        new JBAddressRegistry{salt: ADDRESS_REGISTRY_SALT}();
    }
}

function _isDeployed(bytes32 salt, bytes memory creationCode, bytes memory arguments) internal view returns (bool) {
    address _deployedTo = vm.computeCreate2Address({
        salt: salt,
        initCodeHash: keccak256(abi.encodePacked(creationCode, arguments)),
        deployer: address(0x4e59b44847b379578588920cA78FbF26c0B4956C)
    });
    return address(_deployedTo).code.length != 0;
}
```

**Why this is wrong:**
- Sphinx's `sphinx` modifier does `vm.startPrank(safeAddress())` before executing `run()`.
- That means `new JBAddressRegistry{salt: ...}()` is executed from the Gnosis Safe context, not from `0x4e59...`.
- CREATE2 addresses depend on the deployer address. A precheck against the Arachnid proxy therefore tests a different address than the one the script will actually deploy to.

**Verification evidence:**
- `script/Deploy.s.sol:19-24` executes the deployment inside `run()`.
- `node_modules/@sphinx-labs/contracts/contracts/foundry/Sphinx.sol:276-306` shows the `sphinx` modifier pranking `safeAddress()` for the script body.
- `script/Deploy.s.sol:29-33` hardcodes the Arachnid proxy as the precheck deployer.
- I independently computed the Arachnid-proxy CREATE2 result for this salt/init code as `0x8233ecab4ab653aa6eE8103f1838e03a8d010e59`, which already differs from the README's published deployment address `0x2d9b78cb37ca724cfb9b32cd8e9a5dc1c88bc7bb`.

**Attack / failure scenario:**
1. The registry is already deployed through the Sphinx-managed Safe path.
2. An operator reruns the deployment script expecting idempotent behavior.
3. `_isDeployed()` checks the wrong CREATE2 address and returns `false`.
4. The script attempts `new JBAddressRegistry{salt: ...}()` again.
5. The actual CREATE2 deployment path collides at the already-used Safe-based address and the rerun reverts instead of skipping cleanly.

**Impact:**
- Deployment retries and recovery flows are brittle.
- This is an operational denial-of-service issue for deployment automation, not a live on-chain fund-loss issue.

**Suggested fix:**
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

- Permissionless spoofable registrations were not reported; `RISKS.md` explicitly documents that the registry proves a deployment *could* map to a deployer, not that the caller is trusted.
- Overwrite behavior in `deployerOf` was not reported; this is documented and no cheaper-than-keccak collision path exists.
- No CREATE/CREATE2 math or nonce-boundary bug survived verification; unit and edge tests cover the critical transitions.

## Downgraded Findings

- None.

## LOW Findings (verified by inspection)

| ID | Summary |
|----|---------|
| FF-001 | Sphinx deploy script idempotence check uses the wrong deployer address for CREATE2 preflight. |

## Summary
- Total functions analyzed: 10
- Raw findings (pre-verification): 0 CRITICAL | 0 HIGH | 0 MEDIUM | 1 LOW
- After verification: 1 TRUE POSITIVE | 0 FALSE POSITIVE | 0 DOWNGRADED
- Final: 0 HIGH | 0 MEDIUM | 1 LOW
