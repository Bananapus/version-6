# N E M E S I S — Verified Findings

## Scope
- Language: Solidity 0.8.26
- Modules analyzed:
  - `src/JBAddressRegistry.sol`
  - `src/interfaces/IJBAddressRegistry.sol`
  - `script/Deploy.s.sol`
  - `script/helpers/AddressRegistryDeploymentLib.sol`
- Functions analyzed: 10
- Coupled state pairs mapped: 4
- Mutation paths traced: 3
- Nemesis loop iterations: 4 passes total (`Feynman -> State -> Feynman -> State`)

## Nemesis Map (Phase 1 Cross-Reference)

| Function | Writes A | Writes B | A↔B Pair | Sync Status |
|----------|----------|----------|----------|-------------|
| `registerAddress(address,uint256)` | `deployerOf[computed]` | `AddressRegistered` fields | stored deployer ↔ event | synced |
| `registerAddress(address,bytes32,bytes)` | `deployerOf[computed]` | `AddressRegistered` fields | stored deployer ↔ event | synced |
| `_registerAddress(address,address)` | `deployerOf[addr]` | `AddressRegistered` fields | stored deployer ↔ event | synced |
| `Deploy.run()` | deployment attempt | none | precheck target ↔ actual deployment target | gap |

## Verification Summary

| ID | Source | Coupled Pair | Breaking Op | Severity | Verdict |
|----|--------|-------------|-------------|----------|---------|
| NM-001 | Cross-feed P1→P2→P3 | precheck target ↔ actual deployment target | `Deploy.run()` | LOW | TRUE POSITIVE |

## Verified Findings

### Finding NM-001: Sphinx deploy script checks the wrong CREATE2 target before deployment
**Severity:** LOW
**Source:** Cross-feed P1→P2→P3
**Verification:** Code trace

**Coupled Pair:** deployment precheck target ↔ actual deployment target
**Invariant:** the address queried for existing code must be the same address the script later deploys to

**Feynman Question that exposed it:**
> Why does the preflight use the Arachnid deterministic deployment proxy when the Sphinx modifier executes the deployment body from the Safe context?

**State Mapper gap that confirmed it:**
> `Deploy.run()` mutates the deployment state through Safe-pranked CREATE2, while `_isDeployed()` observes a DDP-based CREATE2 address instead.

**Breaking Operation:** `run()` at `script/Deploy.s.sol:19`
- Modifies deployment state by executing `new JBAddressRegistry{salt: ADDRESS_REGISTRY_SALT}()`
- Does **not** update/check the matching Safe-based target first; `_isDeployed()` instead computes a DDP-based target at `script/Deploy.s.sol:29-33`

**Trigger Sequence:**
1. Deploy the registry once using the Sphinx flow.
2. Re-run the script expecting a no-op because the contract already exists.
3. `_isDeployed()` checks the wrong address and returns `false`.
4. The script attempts a second CREATE2 deployment from the Safe path.
5. The deployment collides and reverts instead of skipping cleanly.

**Consequence:**
- Deployment retries are brittle.
- The script's idempotence assumption is false under Sphinx's real execution model.
- This is an operational issue, not a live-funds exploit in the registry contract.

**Verification Evidence:**
- `script/Deploy.s.sol:19-24` performs the deployment.
- `script/Deploy.s.sol:29-33` computes the precheck target from `0x4e59b44847b379578588920cA78FbF26c0B4956C`.
- `node_modules/@sphinx-labs/contracts/contracts/foundry/Sphinx.sol:298-306` shows the `sphinx` modifier pranks `safeAddress()` around the script body.
- Independent recomputation of the DDP-based CREATE2 target for this salt/init code produced `0x8233ecab4ab653aa6eE8103f1838e03a8d010e59`, which does not match the published deployed address `0x2d9b78cb37ca724cfb9b32cd8e9a5dc1c88bc7bb`.

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

## Feedback Loop Discoveries

- The only verified finding required cross-feed:
  - Feynman flagged a purpose/order mismatch in `Deploy._isDeployed()`.
  - State analysis reframed it as a desync between the prechecked target and the actual deployment target.
  - Targeted Feynman re-interrogation confirmed Sphinx's Safe-pranked execution context as the root cause.

## False Positives Eliminated

- Permissionless registration spoofing is documented design, not a bug.
- Mapping overwrite semantics are documented design, not a cheaper collision vector.
- No CREATE/CREATE2 formula bug survived boundary and regression verification.
- No state inconsistency exists inside `JBAddressRegistry` storage paths.

## Downgraded Findings

- None.

## Summary
- Total functions analyzed: 10
- Coupled state pairs mapped: 4
- Nemesis loop iterations: 4 passes
- Raw findings (pre-verification): 0 C | 0 H | 0 M | 1 L
- Feedback loop discoveries: 1
- After verification: 1 TRUE POSITIVE | 0 FALSE POSITIVE | 0 DOWNGRADED
- Final: 0 CRITICAL | 0 HIGH | 0 MEDIUM | 1 LOW
