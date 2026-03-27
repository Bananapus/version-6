# State Inconsistency Audit — Verified Findings

## Coupled State Dependency Map
- `_suckerRegistry` address ↔ sucker singleton constructor arguments
  Invariant: every singleton cloned by a deployer must embed the live registry address it later queries for `toRemoteFee`.
- “Non-Uniswap rollout” flag ↔ revnet dependency injection
  Invariant: if the Uniswap stack is skipped, later revnet deployments must not consume buyback/router addresses that were never deployed.
- Expected canonical project IDs ↔ actual `JBProjects.count()` / project ownership
  Invariant: hard-coded project IDs must either be reserved by the deployer or verified to belong to the deployer before later configuration depends on them.

## Mutation Matrix
| State Variable / Assumption | Mutating Function | Updates Coupled State? |
|-----------------------------|-------------------|------------------------|
| `_suckerRegistry` | `_deploySuckers()` | `✗` singleton constructors run before registry exists |
| `_buybackRegistry` | `_shouldDeployUniswapStack()` gates deployment | `✗` later revnet deploys still consume it |
| `_routerTerminalRegistry` | `_shouldDeployUniswapStack()` gates deployment | `✗` later terminal configs still consume it |
| Expected project ID ownership | `_ensureProjectExists()` | `✗` returns ID once `count` is high enough without ownership validation |

## Parallel Path Comparison
| Coupled State | Path A | Path B | Result |
|---------------|--------|--------|--------|
| Registry address propagation | Deploy registry first, then singleton | Singleton first, registry later | Path B breaks every clone |
| Non-Uniswap deployment | Skip stack and skip dependent wiring | Skip stack but still wire dependencies | Path B bricks revnets |
| Canonical project reservation | Create/verify ID before configure | Assume `count >= expectedId` is enough | Path B allows squatting/drift |

## Verification Summary
| ID | Coupled Pair | Breaking Op | Original Severity | Verdict | Final Severity |
|----|-------------|-------------|-------------------|---------|----------------|
| SI-001 | `_suckerRegistry` ↔ singleton immutables | `_deploySuckers()` | HIGH | TRUE POSITIVE | HIGH |
| SI-002 | Uniswap-stack flag ↔ revnet dependency wiring | `_deployRevnet()` and revnet config builders | HIGH | TRUE POSITIVE | HIGH |
| SI-003 | expected project IDs ↔ actual owned project IDs | `_ensureProjectExists()` / `_deployBanny()` | MEDIUM | TRUE POSITIVE | MEDIUM |

## Verified Findings

### Finding SI-001: Registry deployment ordering desynchronizes sucker deployers from the registry they later read
**Severity:** HIGH
**Verification:** Code trace

**Coupled Pair:** `_suckerRegistry` ↔ `JBSucker.REGISTRY`
**Invariant:** The singleton implementation must be constructed with the same registry that future clones depend on for `toRemote()`.

**Breaking Operation:** `_deploySuckers()` in `script/Deploy.s.sol:856-872`
- Modifies State A: deploys sucker singletons and deployers
- Does NOT update State B: the singleton constructors still receive `_suckerRegistry == address(0)`

**Trigger Sequence:**
1. Run `_deploySuckers()` on a fresh chain.
2. `_deploySuckersOptimism()` / `_deployCCIPSuckerFor()` instantiate singleton implementations with `_suckerRegistry`.
3. Only afterward does `_deploySuckers()` deploy `JBSuckerRegistry`.
4. Deployer clones the singleton later.
5. Clone executes `toRemote()` and reads `REGISTRY.toRemoteFee()` from the wrong immutable.

**Consequence:**
- All deployed suckers revert on bridge-out.
- Cross-chain state can never progress because the singleton/deployer pair is permanently tied to the wrong registry.

**Fix:**
Deploy `JBSuckerRegistry` first and only then construct singleton implementations.

---

### Finding SI-002: The “skip Uniswap stack” branch leaves revnet deployments coupled to zero buyback/router addresses
**Severity:** HIGH
**Verification:** Code trace

**Coupled Pair:** `_shouldDeployUniswapStack()` result ↔ `_buybackRegistry` / `_routerTerminalRegistry` consumers
**Invariant:** Any branch that skips deployment of these addresses must also skip or replace every downstream consumer.

**Breaking Operation:** Optimism Sepolia deployment path
- Modifies State A: leaves `_buybackRegistry` and `_routerTerminalRegistry` unset
- Does NOT update State B: later revnet constructors and terminal configs still consume those values

**Trigger Sequence:**
1. Deploy on chain `11_155_420`.
2. `_shouldDeployUniswapStack()` returns false.
3. `_deployRevnet()` still passes `address(_buybackRegistry)` into `REVDeployer`.
4. Revnet terminal configs still append `address(_routerTerminalRegistry)`.
5. Payment/cash-out/mint-permission paths call the zero-address hook or store a zero terminal.

**Consequence:**
- Revnets on Optimism Sepolia are not internally consistent with the intended “non-Uniswap rollout”.
- Core interaction paths revert.

**Fix:**
Use an explicit non-Uniswap revnet configuration that avoids both dependencies entirely, or require those addresses to be present before revnet deployment proceeds.

---

### Finding SI-003: Hard-coded project IDs are not synchronized with the public project counter
**Severity:** MEDIUM
**Verification:** Code trace

**Coupled Pair:** expected project IDs `2/3/4` ↔ actual `JBProjects.count()` / owner of those IDs
**Invariant:** A deployment script that later configures hard-coded IDs must first reserve them or prove ownership.

**Breaking Operation:** `_ensureProjectExists()` in `script/Deploy.s.sol:2185-2191`
- Modifies State A: accepts the current public counter as sufficient
- Does NOT update State B: does not verify that the deployer owns the returned project ID

**Trigger Sequence:**
1. External user mints one or more project IDs before governance runs this script.
2. `_ensureProjectExists()` returns the occupied ID because `count >= expectedProjectId`.
3. Later approval/configuration assumes the deployer owns that project.
4. Deployment reverts or Banny is created at the next available project ID instead of 4.

**Consequence:**
- Deployment can be griefed.
- Canonical cross-chain project-ID assumptions can drift.

**Fix:**
Validate ownership/controller state for expected IDs before reuse, or stop depending on globally public sequential IDs.

## False Positives Eliminated
- Did not report ordinary constructor sequencing where the later state is not read back by the earlier deployment artifact.

## Summary
- Coupled state pairs mapped: 3
- Mutation paths analyzed: 4
- Raw findings (pre-verification): 3
- After verification: 3 TRUE POSITIVE
- Final: 2 HIGH, 1 MEDIUM
