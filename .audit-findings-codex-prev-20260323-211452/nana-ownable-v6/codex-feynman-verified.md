# Feynman Audit — Verified Findings

## Scope
- Language: Solidity 0.8.26
- Modules analyzed: `src/JBOwnable.sol`, `src/JBOwnableOverrides.sol`, `src/interfaces/IJBOwnable.sol`, `src/structs/JBOwner.sol`
- Functions analyzed: 11 concrete functions/modifiers
- Lines interrogated: all in-scope Solidity under `src/`
- `script/`: no Solidity files present in this repo

## Verification Summary
| ID | Original Severity | Verdict | Final Severity |
|----|-------------------|---------|----------------|
| FF-001 | LOW | TRUE POSITIVE | LOW |

## Function-State Matrix
| Function | Reads | Writes | Guards | Calls |
|----------|-------|--------|--------|-------|
| `JBOwnable.onlyOwner` | `jbOwner`, `PROJECTS.ownerOf`, `PERMISSIONS` | — | — | `_checkOwner` |
| `JBOwnable._emitTransferEvent` | `PROJECTS.ownerOf`, `msg.sender` | — | — | `PROJECTS.ownerOf` |
| `JBOwnableOverrides.owner` | `jbOwner`, `PROJECTS.ownerOf` | — | — | `PROJECTS.ownerOf` |
| `JBOwnableOverrides._checkOwner` | `jbOwner`, `PROJECTS.ownerOf`, `PERMISSIONS` | — | — | `PROJECTS.ownerOf`, `_requirePermissionFrom` |
| `JBOwnableOverrides.renounceOwnership` | `jbOwner`, `PROJECTS.ownerOf`, `PERMISSIONS` | `jbOwner` | owner-only via `_checkOwner` | `_checkOwner`, `_transferOwnership` |
| `JBOwnableOverrides.setPermissionId` | `jbOwner`, `PROJECTS.ownerOf`, `PERMISSIONS` | `jbOwner.permissionId` | owner-only via `_checkOwner` | `_checkOwner`, `_setPermissionId` |
| `JBOwnableOverrides.transferOwnership` | `jbOwner`, `PROJECTS.ownerOf`, `PERMISSIONS` | `jbOwner` | owner-only via `_checkOwner` | `_checkOwner`, `_transferOwnership` |
| `JBOwnableOverrides.transferOwnershipToProject` | `jbOwner`, `PROJECTS.ownerOf`, `PROJECTS.count`, `PERMISSIONS` | `jbOwner` | owner-only via `_checkOwner` | `_checkOwner`, `PROJECTS.count`, `_transferOwnership` |
| `JBOwnableOverrides._setPermissionId` | — | `jbOwner.permissionId` | — | emits `PermissionIdChanged` |
| `JBOwnableOverrides._transferOwnership(address)` | — | — | — | `_transferOwnership(address,uint88)` |
| `JBOwnableOverrides._transferOwnership(address,uint88)` | `jbOwner`, `PROJECTS.ownerOf` | `jbOwner` | — | `PROJECTS.ownerOf`, `_emitTransferEvent` |

## Guard Consistency Analysis
- All externally reachable mutators (`renounceOwnership`, `setPermissionId`, `transferOwnership`, `transferOwnershipToProject`) gate access through `_checkOwner()`.
- `_checkOwner()` and `owner()` use the same resolution branches for direct ownership and project ownership.
- No path mutates ownership state without going through `_transferOwnership(...)`.

## Inverse Operation Parity
- `transferOwnership(address)` and `transferOwnershipToProject(uint256)` both funnel into `_transferOwnership(...)`, preserving mutual exclusivity and resetting `permissionId` to `0`.
- `renounceOwnership()` is the only terminal path and also uses `_transferOwnership(...)`, so the same reset semantics apply.

## Verified Findings (TRUE POSITIVES only)

### Finding FF-001: LOW — Event `caller` fields bypass `_msgSender()` and misattribute meta-transactions
**Severity:** LOW
**Module:** `JBOwnable`, `JBOwnableOverrides`
**Function:** `_emitTransferEvent`, `_setPermissionId`
**Lines:** `src/JBOwnable.sol:L73-L76`, `src/JBOwnableOverrides.sol:L207-L209`
**Verification:** Code trace

**Feynman Question that exposed this:**
> What does this line assume about the caller, and is that assumption consistent with the access-control path?

**The code:**
```solidity
emit OwnershipTransferred({
    previousOwner: previousOwner,
    newOwner: newProjectId == 0 ? newOwner : PROJECTS.ownerOf(newProjectId),
    caller: msg.sender
});

emit PermissionIdChanged({newId: permissionId, caller: msg.sender});
```

**Why this is wrong:**
Access control is resolved through `_checkOwner()`, which delegates to `JBPermissioned._requirePermissionFrom(...)`, and that path uses `_msgSender()`. Inheritors can override `_msgSender()` for ERC-2771 meta-transactions. A real downstream inheritor already does this: `JB721TiersHook` inherits `JBOwnable` and overrides `_msgSender()` with `ERC2771Context._msgSender()`.

That means a forwarded admin call can be authorized using the original signer, while the emitted `caller` field records the trusted forwarder instead. The state transition is correct, but the audit trail is not.

**Verification evidence:**
- `JBOwnableOverrides._checkOwner()` resolves authorization via `_requirePermissionFrom(...)`, which reads `_msgSender()` in `JBPermissioned`: `node_modules/@bananapus/core-v6/src/abstract/JBPermissioned.sol:L42-L54`.
- `JB721TiersHook` is a concrete inheritor that overrides `_msgSender()` to `ERC2771Context._msgSender()`: `../nana-721-hook-v6/src/JB721TiersHook.sol:L39`, `../nana-721-hook-v6/src/JB721TiersHook.sol:L565-L566`.
- The event emitters in this repo use raw `msg.sender`, not `_msgSender()`: `src/JBOwnable.sol:L73-L76`, `src/JBOwnableOverrides.sol:L207-L209`.

**Attack scenario:**
1. A project-owned or directly owned contract inherits `JBOwnable` and also uses ERC-2771, like `JB721TiersHook`.
2. The owner signs a meta-transaction to call `transferOwnership(...)` or `setPermissionId(...)`.
3. `_checkOwner()` authorizes the call using `_msgSender()` and therefore sees the signer.
4. The event records `caller = msg.sender`, which is the forwarder, not the signer.

**Impact:**
- Off-chain monitoring, admin dashboards, and incident review can misattribute privileged actions.
- No on-chain privilege bypass or state corruption occurs.

**Suggested fix:**
```solidity
emit OwnershipTransferred({
    previousOwner: previousOwner,
    newOwner: newProjectId == 0 ? newOwner : PROJECTS.ownerOf(newProjectId),
    caller: _msgSender()
});

emit PermissionIdChanged({newId: permissionId, caller: _msgSender()});
```

## False Positives Eliminated
- Constructor acceptance of an unminted initial project ID is a deployer-controlled configuration trap, not an exploitable authorization bypass. The contract becomes unreachable until the referenced project exists, but no third party gains access.
- Project-ownership resolution falling back to `address(0)` on `ownerOf` revert does not create a bypass because `_requirePermissionFrom(address(0), ...)` still rejects ordinary callers, and permissions for `account = address(0)` cannot be bootstrapped by a nonzero sender.

## Downgraded Findings
- None.

## LOW Findings (verified by inspection)
| ID | Summary | Verdict |
|----|---------|---------|
| FF-001 | Meta-transaction event `caller` uses `msg.sender` instead of `_msgSender()` | TRUE POSITIVE |

## Summary
- Total functions analyzed: 11
- Raw findings (pre-verification): 0 CRITICAL | 0 HIGH | 0 MEDIUM | 1 LOW
- After verification: 1 TRUE POSITIVE | 0 FALSE POSITIVE | 0 DOWNGRADED
- Final: 0 HIGH | 0 MEDIUM | 1 LOW
