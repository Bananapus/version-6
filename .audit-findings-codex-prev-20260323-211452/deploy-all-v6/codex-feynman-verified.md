# Feynman Audit — Verified Findings

## Scope
- Language: Solidity 0.8.26
- In-scope files analyzed: `script/Deploy.s.sol`
- `src/` Solidity files found: 0
- Functions analyzed: 33

## Verification Summary
| ID | Original Severity | Verdict | Final Severity |
|----|-------------------|---------|----------------|
| FF-001 | HIGH | TRUE POSITIVE | HIGH |
| FF-002 | HIGH | TRUE POSITIVE | HIGH |
| FF-003 | MEDIUM | TRUE POSITIVE | MEDIUM |

## Verified Findings

### Finding FF-001: Sucker singleton constructors bake `REGISTRY = address(0)` into every clone
**Severity:** HIGH
**Module:** `script/Deploy.s.sol`
**Function:** `_deploySuckers`
**Lines:** `script/Deploy.s.sol:856-872`, `script/Deploy.s.sol:911-920`, `script/Deploy.s.sol:1219-1228`
**Verification:** Code trace

**Feynman Question that exposed this:**
> Why are the sucker singletons deployed before the registry they receive in their constructor?

**Why this is wrong:**
`_deploySuckers()` deploys all sucker singletons first, then deploys `_suckerRegistry` afterward. Both `JBOptimismSucker` and `JBCCIPSucker` constructors receive `_suckerRegistry` while it is still zero. In `JBSucker`, `REGISTRY` is immutable and set only in the constructor (`node_modules/@bananapus/suckers-v6/src/JBSucker.sol:107-108`, `:161-175`). `JBSuckerDeployer.createForSender()` then clones that singleton (`node_modules/@bananapus/suckers-v6/src/deployers/JBSuckerDeployer.sol:133-150`), so every deployed sucker inherits the zero-valued immutable forever.

**Verification evidence:**
- Deployment order: `script/Deploy.s.sol:856-872`
- Zero registry passed into singleton constructor:
  - `script/Deploy.s.sol:911-920`
  - `script/Deploy.s.sol:1219-1228`
- Immutable assignment: `node_modules/@bananapus/suckers-v6/src/JBSucker.sol:161-175`
- Runtime use: `REGISTRY.toRemoteFee()` in `node_modules/@bananapus/suckers-v6/src/JBSucker.sol:682-683`

**Attack scenario:**
1. Governance runs this deploy script on a fresh chain.
2. The script deploys sucker singletons before `_suckerRegistry` exists.
3. A project later deploys a sucker clone from one of those deployers.
4. The clone calls `toRemote()`.
5. `REGISTRY.toRemoteFee()` executes against `address(0)` and the bridge-out flow reverts.

**Impact:**
Every sucker deployed from these singletons is permanently misconfigured. Cross-chain bridging is unavailable until the entire singleton/deployer stack is redeployed with the correct constructor argument.

**Suggested fix:**
Deploy `_suckerRegistry` before any sucker singleton constructor runs, or redesign the sucker to read the registry from mutable storage initialized after cloning rather than from an immutable constructor argument.

---

### Finding FF-002: Optimism Sepolia skips the Uniswap stack but still wires zero-address buyback and router dependencies into revnets
**Severity:** HIGH
**Module:** `script/Deploy.s.sol`
**Function:** `_shouldDeployUniswapStack`, `_deployRevnet`, `_deployRevFeeProject`, `_deployCpnRevnet`, `_deployNanaRevnet`, `_deployBanny`
**Lines:** `script/Deploy.s.sol:471-472`, `:1529-1553`, `:1570-1575`, `:1670-1675`, `:1841-1845`, `:1940-1945`
**Verification:** Code trace

**Feynman Question that exposed this:**
> If the script intentionally skips the Uniswap stack on Optimism Sepolia, why do later phases still consume `_buybackRegistry` and `_routerTerminalRegistry` unconditionally?

**Why this is wrong:**
`_shouldDeployUniswapStack()` returns false on Optimism Sepolia, so the script never deploys `_buybackRegistry` or `_routerTerminalRegistry`. Later phases still pass `IJBBuybackHookRegistry(address(_buybackRegistry))` into the `REVDeployer` constructor and still append `IJBTerminal(address(_routerTerminalRegistry))` to every revnet’s terminal config. `REVDeployer` then unconditionally calls `BUYBACK_HOOK.beforePayRecordedWith`, `BUYBACK_HOOK.beforeCashOutRecordedWith`, and `BUYBACK_HOOK.hasMintPermissionFor` (`node_modules/@rev-net/core-v6/src/REVDeployer.sol:275-277`, `:371`, `:409-410`). On Optimism Sepolia those calls target `address(0)`.

**Verification evidence:**
- Uniswap stack skip: `script/Deploy.s.sol:471-472`
- Zero buyback registry injected into `REVDeployer`: `script/Deploy.s.sol:1529-1553`
- Zero router terminal injected into revnet configs:
  - `script/Deploy.s.sol:1570-1575`
  - `script/Deploy.s.sol:1670-1675`
  - `script/Deploy.s.sol:1841-1845`
  - `script/Deploy.s.sol:1940-1945`
- `REVDeployer` direct hook calls:
  - `node_modules/@rev-net/core-v6/src/REVDeployer.sol:275-277`
  - `node_modules/@rev-net/core-v6/src/REVDeployer.sol:371`
  - `node_modules/@rev-net/core-v6/src/REVDeployer.sol:409-410`
- Terminal configs are consumed without zero-address filtering in `JBController._configureTerminals`: `node_modules/@bananapus/core-v6/src/JBController.sol:887-907`

**Attack scenario:**
1. Governance deploys on Optimism Sepolia.
2. Uniswap-related phases are skipped by design.
3. Revnets are still deployed with zero buyback/router addresses.
4. First payment, cash-out, or mint-permission check hits `REVDeployer`.
5. The hook path calls the zero address and the revnet flow reverts.

**Impact:**
The advertised “non-Uniswap rollout” is not actually deployable on Optimism Sepolia. Newly deployed revnets can be bricked on basic pay/cash-out paths, and terminal configuration may also persist a zero terminal address into project directory state.

**Suggested fix:**
Gate revnet deployment on non-zero `_buybackRegistry` / `_routerTerminalRegistry`, or provide explicit no-op alternatives for the non-Uniswap rollout path.

---

### Finding FF-003: Public project-ID squatting can halt deployment or shift Banny off canonical project ID 4
**Severity:** MEDIUM
**Module:** `script/Deploy.s.sol`
**Function:** `_ensureProjectExists`, `_deployBanny`
**Lines:** `script/Deploy.s.sol:1908-1910`, `:2185-2191`
**Verification:** Code trace

**Feynman Question that exposed this:**
> What guarantees that the next public Juicebox project IDs are still 2, 3, and 4 when this script runs?

**Why this is wrong:**
`JBProjects.createFor()` is public and increments the global project counter for any caller (`node_modules/@bananapus/core-v6/src/JBProjects.sol:66-78`). `_ensureProjectExists()` only checks `count >= expectedProjectId`, then blindly returns that ID without verifying ownership or reserving gaps. `_deployBanny()` is stricter in the wrong place: it only returns early if project 4 already has a controller, otherwise it calls into `REVDeployer` with `revnetId: 0`, which creates the next available project instead of forcing ID 4.

**Verification evidence:**
- Public project creation: `node_modules/@bananapus/core-v6/src/JBProjects.sol:66-78`
- Weak reservation helper: `script/Deploy.s.sol:2185-2191`
- Banny path only checks `controllerOf(4) != 0`: `script/Deploy.s.sol:1908-1910`

**Attack scenario:**
1. An external user front-runs governance by calling `JBProjects.createFor()` before this script.
2. `_ensureProjectExists(2)` or `_ensureProjectExists(3)` returns an ID that governance does not own.
3. Later `_projects.approve(address(_revDeployer), projectId)` reverts, halting deployment.
4. Separately, if project 4 exists but is still controller-less, `_deployBanny()` will mint the next project ID instead of canonical ID 4.

**Impact:**
A public outsider can grief deployment determinism, force full deployment failure, or break the script’s canonical project-ID assumptions across chains.

**Suggested fix:**
Reserve IDs by actually creating missing projects in sequence and verifying ownership/controller state, or stop hard-coding public project IDs altogether.

## False Positives Eliminated
- Did not report general “partial deploy is not resumable” observations because the repository documentation already treats reruns on partially deployed chains as operationally unsafe rather than as an unaccounted logic flaw in scope.

## Summary
- Total functions analyzed: 33
- Raw findings (pre-verification): 3
- After verification: 3 TRUE POSITIVE
- Final: 2 HIGH, 1 MEDIUM
