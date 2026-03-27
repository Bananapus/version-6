# N E M E S I S — Raw Findings

## Scope
- Solidity files analyzed:
  - `src/JBAddressRegistry.sol`
  - `src/interfaces/IJBAddressRegistry.sol`
  - `script/Deploy.s.sol`
  - `script/helpers/AddressRegistryDeploymentLib.sol`
- Ignored by instruction: `.audit/findings/*` from parallel audits

## Phase 0 — Nemesis Recon

**Language:** Solidity 0.8.26

**Attack goals**
1. Corrupt deployer attribution so integrators trust a malicious contract.
2. Break deterministic address computation so legitimate deployments cannot be registered or are mis-attributed.
3. Break deployment automation so deterministic multi-chain rollout can be blocked or retried incorrectly.

**Novel code**
- `src/JBAddressRegistry.sol` — custom RLP-based CREATE address derivation with manual nonce-range encoding.
- `script/Deploy.s.sol` — custom deployment-idempotence check around Sphinx deployment flow.

**Value stores + initial coupling hypothesis**
- `deployerOf[addr]` holds trust metadata.
  - Outflows: none.
  - Suspected coupled state: computed address formula, emitted `AddressRegistered` event, deployment artifact resolution.

**Complex paths**
- `Deploy.run()` under the `sphinx` modifier: Sphinx execution context -> Safe-pranked CREATE2 deployment -> local `_isDeployed()` precheck.
- `registerAddress(create)` path: nonce-range branch selection -> RLP bytes assembly -> keccak truncation -> mapping write.

**Priority order**
1. `JBAddressRegistry._addressFrom()` — only nontrivial protocol logic; a boundary bug silently corrupts registry output.
2. `Deploy.run()` / `_isDeployed()` — deployment-script logic may check a different address than the one actually deployed by Sphinx.
3. `registerAddress(create2)` — EIP-1014 exactness and overwrite/event behavior.

## Phase 1 — Function-State Matrix

| Function | Reads | Writes | Guards | Internal Calls | External Calls |
|----------|-------|--------|--------|----------------|----------------|
| `JBAddressRegistry.registerAddress(address,uint256)` | none | `deployerOf[computed]` | none | `_addressFrom`, `_registerAddress` | none |
| `JBAddressRegistry.registerAddress(address,bytes32,bytes)` | none | `deployerOf[computed]` | none | `_registerAddress` | none |
| `JBAddressRegistry._addressFrom(address,uint256)` | params | none | `nonce <= uint64.max` | none | none |
| `JBAddressRegistry._registerAddress(address,address)` | none | `deployerOf[addr]` | none | none | none |
| `Deploy.configureSphinx()` | none | `sphinxConfig` | none | none | none |
| `Deploy.run()` | `_isDeployed(...)` result | deployment side effects | `sphinx` modifier | `_isDeployed` | CREATE2 deployment of `JBAddressRegistry` |
| `Deploy._isDeployed(...)` | code length at computed address | none | none | none | `vm.computeCreate2Address` cheatcode |
| `AddressRegistryDeploymentLib.getDeployment(string)` | `block.chainid` | none | none | overloaded `getDeployment` | deploys `new SphinxConstants()` |
| `AddressRegistryDeploymentLib.getDeployment(string,string)` | deployment artifact JSON | none | none | `_getDeploymentAddress` | `vm.readFile` cheatcode |
| `AddressRegistryDeploymentLib._getDeploymentAddress(...)` | deployment artifact JSON | none | none | none | `vm.readFile`, `stdJson.readAddress` |

## Phase 1 — Coupled State Dependency Map

| Pair | Invariant | Mutation points |
|------|-----------|-----------------|
| `deployerOf[computedAddress]` ↔ address computed from `(deployer, nonce)` | mapping key must equal EVM CREATE derivation for the provided pair | `registerAddress(address,uint256)` |
| `deployerOf[computedAddress]` ↔ address computed from `(deployer, salt, bytecodeHash)` | mapping key must equal EVM CREATE2 derivation for the provided triple | `registerAddress(address,bytes32,bytes)` |
| `deployerOf[addr]` ↔ `AddressRegistered(addr,deployer,caller)` event | event must reflect the exact mapping write and caller context | `_registerAddress` |
| Sphinx deployment context ↔ `_isDeployed` precheck target | precheck must compute the same address that `run()` will deploy to | `Deploy.run`, `Deploy._isDeployed` |

## Pass 1 — Feynman Full Run

### Cleared areas
- `JBAddressRegistry._addressFrom()` nonce branches align with RLP length transitions from `0` through `uint64.max`.
- Assembly extraction `mstore(0, hash); addr := mload(0)` is equivalent to taking the low 160 bits of the hash in this context.
- `registerAddress(create2)` matches EIP-1014 formula exactly.
- `_registerAddress()` only mutates `deployerOf[addr]` and emits one event with `caller = msg.sender`.

### Raw suspect
1. **SUSPECT:** `script/Deploy.s.sol`
   - `run()` executes under Sphinx's `sphinx` modifier, which pranks the Gnosis Safe before the body runs.
   - `_isDeployed()` computes a CREATE2 address using the Arachnid deterministic deployment proxy (`0x4e59...`).
   - Question: why is the precheck using the deterministic deployment proxy if the actual deployment is executed from the Safe context?

## Pass 2 — State Full Run

### Mutation Matrix

| State Variable | Mutating Function | Updates Coupled State? |
|----------------|-------------------|-------------------------|
| `deployerOf[computed]` | `registerAddress(address,uint256)` | yes, computed key and event are synchronized through `_registerAddress` |
| `deployerOf[computed]` | `registerAddress(address,bytes32,bytes)` | yes, computed key and event are synchronized through `_registerAddress` |
| script deployment idempotence assumption | `Deploy.run()` | **gap**: precheck target and actual deployment context differ |

### Parallel path comparison

| Coupled State | CREATE path | CREATE2 path | Status |
|---------------|-------------|--------------|--------|
| computed address ↔ stored deployer | synced | synced | cleared |
| stored deployer ↔ emitted event | synced | synced | cleared |
| precheck target ↔ actual deployment target | n/a | gap in script path | escalated |

## Pass 3 — Feynman Re-interrogation

### Confirmed root cause
- `Deploy.run()` is wrapped by Sphinx's `sphinx` modifier.
- The modifier calls `vm.startPrank(safeAddress())` before executing the script body.
- Therefore `new JBAddressRegistry{salt: ADDRESS_REGISTRY_SALT}()` is executed as the Safe, not as the Arachnid proxy.
- `_isDeployed()` therefore checks a different CREATE2 preimage from the actual deployment path.

## Pass 4 — State Re-analysis

- No additional coupled-state gaps in registry storage.
- No hidden reconciliation logic needed; the deploy-script issue is independent and remains.

## Convergence

- Pass 1 produced 1 suspect.
- Pass 2 confirmed 1 script-state gap.
- Pass 3 confirmed root cause.
- Pass 4 found no new pairs or gaps.
- Converged after 4 passes.

## Raw Findings

### NM-RAW-001
- **Title:** `Deploy._isDeployed()` checks a different CREATE2 deployer than the Sphinx-managed deployment path
- **Severity (raw):** LOW
- **Source:** Cross-feed P1->P2->P3
- **Affected code:**
  - `script/Deploy.s.sol:19-37`
  - `node_modules/@sphinx-labs/contracts/contracts/foundry/Sphinx.sol:276-306`
- **Hypothesis:** Once the registry is already deployed at the real Safe-based CREATE2 address, rerunning the deploy script still returns false from `_isDeployed()` and attempts a second deployment, causing a CREATE2 collision revert instead of a clean no-op.
