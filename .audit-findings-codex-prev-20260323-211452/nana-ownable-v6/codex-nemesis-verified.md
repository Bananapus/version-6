# N E M E S I S — Verified Findings

## Scope
- Language: Solidity 0.8.26
- Modules analyzed: `src/JBOwnable.sol`, `src/JBOwnableOverrides.sol`, `src/interfaces/IJBOwnable.sol`, `src/structs/JBOwner.sol`
- Functions analyzed: 11 concrete functions/modifiers
- Coupled state pairs mapped: 3
- Mutation paths traced: 10
- Nemesis loop iterations: 4 passes total
- `script/`: no Solidity files present in this repo

## Nemesis Map (Phase 1 Cross-Reference)
| Function | Writes A | Writes B | A↔B Pair | Sync Status |
|----------|----------|----------|----------|-------------|
| constructor → `_transferOwnership` | `owner/projectId` | `permissionId=0` | ownership ↔ permission | ✓ SYNCED |
| `transferOwnership` | `owner/projectId` | `permissionId=0` | ownership ↔ permission | ✓ SYNCED |
| `transferOwnershipToProject` | `owner/projectId` | `permissionId=0` | ownership ↔ permission | ✓ SYNCED |
| `renounceOwnership` | `owner/projectId` | `permissionId=0` | ownership ↔ permission | ✓ SYNCED |
| `_setPermissionId` | `permissionId` | — | permission ↔ owner identity | ✓ BY DESIGN |
| `owner` | reads resolved owner | — | `owner()` ↔ `_checkOwner()` | ✓ SYNCED |
| `_checkOwner` | reads resolved owner | — | `owner()` ↔ `_checkOwner()` | ✓ SYNCED |
| `_emitTransferEvent` | — | event audit trail | auth path ↔ emitted caller | ✗ Feynman-only issue |

## Verification Summary
| ID | Source | Coupled Pair | Breaking Op | Severity | Verdict |
|----|--------|-------------|-------------|----------|---------|
| NM-001 | Feynman-only | — | `_emitTransferEvent`, `_setPermissionId` | LOW | TRUE POS |

## Verified Findings (TRUE POSITIVES only)

### Finding NM-001: LOW — ERC-2771 inheritors emit the forwarder as `caller`
**Severity:** LOW
**Source:** Feynman-only
**Verification:** Code trace

**Coupled Pair:** none on storage; this is an authorization/event-boundary mismatch
**Invariant:** the event-reported caller should match the principal that passed owner authorization

**Feynman Question that exposed it:**
> What does this event line assume about the caller, and does that assumption match the authorization path?

**State Mapper gap that confirmed it:**
> No storage gap existed; the issue survives only at the boundary between authorization state and emitted audit metadata.

**Breaking Operation:** privileged calls that emit `OwnershipTransferred` or `PermissionIdChanged`
- Affected code:
  - `src/JBOwnable.sol:L73-L76`
  - `src/JBOwnableOverrides.sol:L207-L209`
- Modifies state correctly, but records `caller: msg.sender` instead of the meta-tx-aware `_msgSender()`

**Trigger Sequence:**
1. A downstream contract inherits `JBOwnable` and also overrides `_msgSender()` via `ERC2771Context`.
2. The owner or an authorized operator signs a forwarded meta-transaction.
3. `_checkOwner()` succeeds because `JBPermissioned` uses `_msgSender()`.
4. The emitted event records the forwarder as `caller`.

**Consequence:**
- On-chain state remains correct.
- Off-chain systems can misattribute who performed a privileged action.

**Verification Evidence:**
- Authorization path:
  - `src/JBOwnableOverrides.sol:L118-L135`
  - `node_modules/@bananapus/core-v6/src/abstract/JBPermissioned.sol:L42-L54`
- Event path:
  - `src/JBOwnable.sol:L73-L76`
  - `src/JBOwnableOverrides.sol:L207-L209`
- Real downstream ERC-2771 inheritor:
  - `../nana-721-hook-v6/src/JB721TiersHook.sol:L39`
  - `../nana-721-hook-v6/src/JB721TiersHook.sol:L565-L566`

**Fix:**
```solidity
caller: _msgSender()
```

## Feedback Loop Discoveries
- None. The state pass did not surface new coupled pairs or mutation gaps beyond the Feynman event-boundary suspect.

## False Positives Eliminated
- No bypass exists when `PROJECTS.ownerOf(projectId)` reverts. Both `owner()` and `_checkOwner()` degrade to `address(0)`, and `JBPermissioned` still rejects normal callers.
- No stale permission survives ownership transfer. Every transfer path overwrites the packed `JBOwner` struct with `permissionId = 0`.
- No storage packing inconsistency exists. `forge inspect JBOwnableOverrides storage-layout` shows `jbOwner` occupies a single 32-byte slot.

## Downgraded Findings
- None.

## Summary
- Total functions analyzed: 11
- Coupled state pairs mapped: 3
- Nemesis loop iterations: 4 passes total
- Raw findings (pre-verification): 0 C | 0 H | 0 M | 1 L
- Feedback loop discoveries: 0
- After verification: 1 TRUE POSITIVE | 0 FALSE POSITIVE | 0 DOWNGRADED
- Final: 0 CRITICAL | 0 HIGH | 0 MEDIUM | 1 LOW
