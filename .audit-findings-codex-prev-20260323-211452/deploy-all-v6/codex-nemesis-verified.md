# N E M E S I S — Verified Findings

## Scope
- Language: Solidity
- Modules analyzed: `script/Deploy.s.sol`
- Functions analyzed: 33
- Coupled state pairs mapped: 3
- Mutation paths traced: 4
- Nemesis loop iterations: 2 targeted re-passes after the two baseline passes

## Verification Summary
| ID | Source | Coupled Pair | Breaking Op | Severity | Verdict |
|----|--------|-------------|-------------|----------|---------|
| NM-001 | Cross-feed P1→P2 | `_suckerRegistry` ↔ singleton `REGISTRY` | `_deploySuckers()` | HIGH | TRUE POS |
| NM-002 | Cross-feed P1→P2 | skip-Uniswap flag ↔ revnet dependency wiring | `_deployRevnet()` + revnet config builders | HIGH | TRUE POS |
| NM-003 | Feynman-only, then state-confirmed | expected project IDs ↔ actual owned project IDs | `_ensureProjectExists()` / `_deployBanny()` | MEDIUM | TRUE POS |

## Verified Findings

### Finding NM-001: Sucker singleton deployment order permanently zeroes the registry used by every future clone
**Severity:** HIGH
**Source:** Cross-feed Pass 1 → Pass 2
**Verification:** Code trace

**Coupled Pair:** `_suckerRegistry` ↔ `JBSucker.REGISTRY`
**Invariant:** The singleton implementation’s immutable registry must match the live registry used for cross-chain fee lookups.

**Feynman Question that exposed it:**
> Why is the registry deployed after the singleton constructors that already consume it?

**State Mapper gap that confirmed it:**
> `_deploySuckers()` mutates the singleton/deployer set before `_suckerRegistry` exists, so the constructor-time immutable and the later stored registry diverge.

**Breaking Operation:** `_deploySuckers()` at `script/Deploy.s.sol:856`
- Modifies State A: deploys all singleton implementations and their deployers first.
- Does NOT update State B: only deploys `_suckerRegistry` afterward at `script/Deploy.s.sol:862-872`.

**Trigger Sequence:**
1. Run the deployment script on a fresh chain.
2. `_deploySuckersOptimism()` / `_deployCCIPSuckerFor()` construct singleton implementations with `_suckerRegistry == address(0)`.
3. The registry is deployed only after those constructors finish.
4. A deployer later clones the singleton.
5. The clone executes `toRemote()` and tries to read `REGISTRY.toRemoteFee()`.

**Consequence:**
- All future suckers created from those deployers revert on bridge-out.
- Cross-chain operations are unavailable until governance redeploys the affected singleton/deployer stack.

**Verification Evidence:**
- Ordering: `script/Deploy.s.sol:856-872`
- Zero-registry constructor args:
  - `script/Deploy.s.sol:911-920`
  - `script/Deploy.s.sol:1219-1228`
- Immutable assignment: `node_modules/@bananapus/suckers-v6/src/JBSucker.sol:161-175`
- Clone flow: `node_modules/@bananapus/suckers-v6/src/deployers/JBSuckerDeployer.sol:133-150`
- Runtime failure point: `node_modules/@bananapus/suckers-v6/src/JBSucker.sol:682-683`

**Fix:**
Deploy `JBSuckerRegistry` before constructing any singleton implementation, or move registry binding out of constructor immutables and into post-clone initialization.

---

### Finding NM-002: Optimism Sepolia’s “non-Uniswap rollout” still injects zero buyback/router dependencies into revnets
**Severity:** HIGH
**Source:** Cross-feed Pass 1 → Pass 2
**Verification:** Code trace

**Coupled Pair:** `_shouldDeployUniswapStack()` result ↔ `_buybackRegistry` / `_routerTerminalRegistry` consumers
**Invariant:** If the stack is skipped, every downstream dependency consumer must also be skipped or replaced.

**Feynman Question that exposed it:**
> If Uniswap deployment is disabled on Optimism Sepolia, what code prevents later revnet phases from dereferencing the skipped contracts?

**State Mapper gap that confirmed it:**
> The skip branch leaves `_buybackRegistry` and `_routerTerminalRegistry` unset, but revnet deployment still consumes both values in constructors and terminal arrays.

**Breaking Operation:** Optimism Sepolia path in `_shouldDeployUniswapStack()` at `script/Deploy.s.sol:471-472`
- Leaves `_buybackRegistry` unset before `_deployRevnet()` at `script/Deploy.s.sol:1529-1553`
- Leaves `_routerTerminalRegistry` unset before revnet terminal config builders at:
  - `script/Deploy.s.sol:1570-1575`
  - `script/Deploy.s.sol:1670-1675`
  - `script/Deploy.s.sol:1841-1845`
  - `script/Deploy.s.sol:1940-1945`

**Trigger Sequence:**
1. Run deployment on Optimism Sepolia.
2. `_shouldDeployUniswapStack()` returns false.
3. Revnets are still deployed with `BUYBACK_HOOK = address(0)` and terminal config entry `address(_routerTerminalRegistry) = address(0)`.
4. First pay/cash-out/mint-permission flow calls into `REVDeployer`.
5. `REVDeployer` dereferences the zero-address buyback hook and reverts.

**Consequence:**
- The advertised non-Uniswap deployment path is not internally valid.
- Revnet payment and cash-out flows can be bricked immediately after deployment.
- The project directory may also store a zero terminal because controller terminal configuration does not filter it out.

**Verification Evidence:**
- Skip branch: `script/Deploy.s.sol:471-472`
- Zero buyback injection: `script/Deploy.s.sol:1529-1553`
- Zero terminal injection:
  - `script/Deploy.s.sol:1570-1575`
  - `script/Deploy.s.sol:1670-1675`
  - `script/Deploy.s.sol:1841-1845`
  - `script/Deploy.s.sol:1940-1945`
- Direct hook dereferences:
  - `node_modules/@rev-net/core-v6/src/REVDeployer.sol:275-277`
  - `node_modules/@rev-net/core-v6/src/REVDeployer.sol:371`
  - `node_modules/@rev-net/core-v6/src/REVDeployer.sol:409-410`
- Terminal arrays accepted without zero-address filtering:
  - `node_modules/@bananapus/core-v6/src/JBController.sol:887-907`
  - `node_modules/@bananapus/core-v6/src/JBDirectory.sol:225-236`

**Fix:**
Either require the Uniswap stack before any revnet deployment, or add a dedicated non-Uniswap configuration that substitutes safe no-op implementations and omits the router terminal entry.

---

### Finding NM-003: Canonical project IDs are publicly squattable and the script does not verify ownership before reuse
**Severity:** MEDIUM
**Source:** Feynman-only, later state-confirmed
**Verification:** Code trace

**Coupled Pair:** expected IDs `2/3/4` ↔ actual `JBProjects.count()` / owner/controller of those IDs
**Invariant:** A hard-coded project ID must be reserved or proven to belong to the deployer before downstream configuration depends on it.

**Feynman Question that exposed it:**
> Why does `count >= expectedProjectId` prove that the expected project belongs to this deployment?

**State Mapper gap that confirmed it:**
> `_ensureProjectExists()` advances only the public counter relationship, not the ownership relationship the rest of the script relies on.

**Breaking Operation:** `_ensureProjectExists()` at `script/Deploy.s.sol:2185-2191`
- Accepts any pre-existing `expectedProjectId` once the public count is high enough.
- `_deployBanny()` only exits early if `controllerOf(4) != 0` at `script/Deploy.s.sol:1908-1910`, so a pre-created but unconfigured project 4 still causes project-ID drift.

**Trigger Sequence:**
1. An external user calls `JBProjects.createFor()` before governance runs this deployment.
2. The public counter reaches or passes one of the script’s expected IDs.
3. `_ensureProjectExists()` returns that ID without proving governance owns it.
4. Approval/configuration later reverts, or Banny is deployed to the next ID instead of 4.

**Consequence:**
- Anyone can grief deployment.
- Cross-chain canonical project-ID assumptions can diverge from the script’s documented numbering.

**Verification Evidence:**
- Public project creation: `node_modules/@bananapus/core-v6/src/JBProjects.sol:66-78`
- Weak helper: `script/Deploy.s.sol:2185-2191`
- Banny controller-only check: `script/Deploy.s.sol:1908-1910`

**Fix:**
Reserve project IDs in sequence before any dependent deployment, and verify ownership/controller state before reusing any existing ID.

## Feedback Loop Discoveries
- NM-001 required both passes: the Feynman pass surfaced the suspicious ordering, and the state pass confirmed the actual broken coupling between deployment-time immutables and runtime registry lookups.
- NM-002 also required both passes: the Feynman pass exposed the contradictory branching, and the state pass mapped the precise zero-address consumers that make the non-Uniswap path invalid.

## False Positives Eliminated
- Did not elevate generic resumability concerns because the repository already documents partial reruns as an operational limitation rather than an untracked logic break.

## Downgraded Findings
- None.

## Summary
- Total functions analyzed: 33
- Coupled state pairs mapped: 3
- Nemesis loop iterations: 2
- Raw findings (pre-verification): 0 C | 2 H | 1 M | 0 L
- Feedback loop discoveries: 2
- After verification: 3 TRUE POSITIVE | 0 FALSE POSITIVE | 0 DOWNGRADED
- Final: 0 CRITICAL | 2 HIGH | 1 MEDIUM | 0 LOW
