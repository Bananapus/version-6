# N E M E S I S — Raw Findings

## Scope
- Language: Solidity 0.8.26
- In-scope files:
  - `src/JBOwnable.sol`
  - `src/JBOwnableOverrides.sol`
  - `src/interfaces/IJBOwnable.sol`
  - `src/structs/JBOwner.sol`
- `script/`: no Solidity files present in this repo

## Phase 0 — Nemesis Recon

### Attack Goals
1. Gain unauthorized owner access over downstream hooks/extensions that rely on `JBOwnable`.
2. Permanently brick owner-only administration through an ownership-resolution or transition bug.
3. Preserve stale delegated access after ownership transfer.
4. Desynchronize the reported owner from the authorization owner so integrations trust the wrong principal.

### Novel Code
- `src/JBOwnableOverrides.sol` — custom two-mode ownership state machine (`address` or `projectId`) layered onto Juicebox permissions.
- `src/JBOwnable.sol` — custom event-emission path that resolves the new owner dynamically for project-based transfers.

### Value Stores + Initial Coupling Hypothesis
- `jbOwner` stores access-control authority.
  - Outflows: `transferOwnership`, `transferOwnershipToProject`, `renounceOwnership`, constructor initialization.
  - Suspected coupled state:
    - `jbOwner.owner` ↔ `jbOwner.projectId`
    - ownership identity ↔ `jbOwner.permissionId`
    - `owner()` resolution ↔ `_checkOwner()` resolution

### Complex Paths
- Project-based ownership resolution:
  - `onlyOwner`/`_checkOwner` → `PROJECTS.ownerOf(projectId)` → `_requirePermissionFrom(...)` → `PERMISSIONS.hasPermission(...)`
- Ownership transfer to project:
  - `transferOwnershipToProject` → `PROJECTS.count()` → `_transferOwnership` → `_emitTransferEvent` → `PROJECTS.ownerOf(newProjectId)`

### Priority Order
1. `src/JBOwnableOverrides.sol` — holds the entire ownership state machine and access checks.
2. `src/JBOwnable.sol` — controls event emission and concrete `onlyOwner` behavior.
3. Dependency boundary with `JBPermissioned` / `JBPermissions` / `JBProjects`.

## Phase 1 — Unified Nemesis Map
| Function | Writes A | Writes B | Coupled Pair | Sync Status |
|----------|----------|----------|--------------|-------------|
| constructor → `_transferOwnership` | `owner/projectId` | `permissionId=0` | ownership ↔ permission | ✓ SYNCED |
| `transferOwnership` | `owner/projectId` | `permissionId=0` | ownership ↔ permission | ✓ SYNCED |
| `transferOwnershipToProject` | `owner/projectId` | `permissionId=0` | ownership ↔ permission | ✓ SYNCED |
| `renounceOwnership` | `owner/projectId` | `permissionId=0` | ownership ↔ permission | ✓ SYNCED |
| `_setPermissionId` | `permissionId` | — | permission ↔ owner identity | ✓ allowed independent update |
| `owner` | reads resolved owner | — | `owner()` ↔ `_checkOwner()` | ✓ same resolution logic |
| `_checkOwner` | reads resolved owner | — | `owner()` ↔ `_checkOwner()` | ✓ same resolution logic |
| `_emitTransferEvent` | — | event caller/new owner projection | off-chain audit trail ↔ auth path | SUSPECT |

## Pass 1 — Feynman (Full)

### Suspects
1. `src/JBOwnable.sol:L73-L76`
   - Question: Why does the event use `msg.sender` when authorization uses `_msgSender()` through `JBPermissioned`?
   - Suspect: meta-transaction inheritors log the forwarder as `caller`.

2. `src/JBOwnableOverrides.sol:L207-L209`
   - Question: Is the `PermissionIdChanged` caller field consistent with the access-control path?
   - Suspect: same meta-transaction mismatch.

### Cleared During Pass 1
- `_checkOwner()` cannot be bypassed when project resolution returns `address(0)` because `JBPermissioned` still requires either `sender == account` or a permission recorded against that exact `account`.
- Wildcard permissions do not create a bypass from the renounced state because `_checkOwner()` would still check permissions against `account = address(0)`, and permissions for `account = address(0)` cannot be bootstrapped by a nonzero sender.
- Ownership transfers all route through `_transferOwnership(...)`, which enforces mutual exclusivity and resets delegated permission state.

## Pass 2 — State Inconsistency (Full, enriched)

### Coupled Pairs Confirmed
1. `jbOwner.owner` ↔ `jbOwner.projectId`
2. ownership identity ↔ `jbOwner.permissionId`
3. `owner()` resolution ↔ `_checkOwner()` resolution

### Gaps
- No storage-coupling gaps found.
- No parallel-path mismatch found between `transferOwnership`, `transferOwnershipToProject`, and `renounceOwnership`.

### Masking Code
- None relevant. The `try/catch` around `PROJECTS.ownerOf(...)` is a deliberate graceful-degradation mechanism and both read/auth paths use it consistently.

## Pass 3 — Feynman Re-Interrogation (Targeted)

### Delta
- Confirmed the event mismatch is real in downstream ERC-2771 inheritors:
  - `../nana-721-hook-v6/src/JB721TiersHook.sol:L39`
  - `../nana-721-hook-v6/src/JB721TiersHook.sol:L565-L566`
- No new root-cause state bugs emerged from the state pass.

## Pass 4 — State Re-Analysis (Targeted)

### Delta
- No new coupled pairs.
- No new mutation paths.
- No state inconsistency caused by the event mismatch; impact remains off-chain attribution only.

## Convergence
- Pass 4 produced no new findings or new coupled pairs.
- Nemesis loop converged after 4 passes total: Feynman full → State full → Feynman targeted → State targeted.

## Raw Findings

### RF-001: LOW — Event caller fields misattribute ERC-2771 admin actions
- Source: Feynman-only
- Affected code:
  - `src/JBOwnable.sol:L73-L76`
  - `src/JBOwnableOverrides.sol:L207-L209`
- Trigger sequence:
  1. Inherit `JBOwnable` in an ERC-2771-aware contract.
  2. Submit a forwarded call that passes `_checkOwner()` via `_msgSender()`.
  3. Observe `caller` in `OwnershipTransferred` / `PermissionIdChanged` records the forwarder, not the signer.
- Consequence:
  - Off-chain monitoring and admin attribution can be wrong.
- Preliminary severity: LOW

## Verification Queue
- RF-001: code trace sufficient; no C/H/M findings identified, so no PoC required by the verification gate.
