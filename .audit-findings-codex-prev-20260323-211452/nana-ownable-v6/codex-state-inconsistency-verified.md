# State Inconsistency Audit — Verified Findings

## Coupled State Dependency Map
| Pair | Invariant | Mutation points |
|------|-----------|-----------------|
| `jbOwner.owner` ↔ `jbOwner.projectId` | Exactly one ownership mode is active, unless explicitly renounced | constructor, `transferOwnership`, `transferOwnershipToProject`, `renounceOwnership`, internal `_transferOwnership` |
| `jbOwner.permissionId` ↔ ownership identity | delegated owner permission must be cleared whenever ownership changes | constructor, `transferOwnership`, `transferOwnershipToProject`, `renounceOwnership`, internal `_transferOwnership` |
| `owner()` resolution ↔ `_checkOwner()` resolution | read path and authorization path must resolve the same owner from identical stored state | `owner`, `_checkOwner` |

## Mutation Matrix
| State Variable | Mutating Function | Type of Mutation | Updates Coupled State? |
|----------------|-------------------|------------------|------------------------|
| `jbOwner.owner` | constructor via `_transferOwnership` | set | Yes |
| `jbOwner.owner` | `transferOwnership` via `_transferOwnership` | set | Yes |
| `jbOwner.owner` | `transferOwnershipToProject` via `_transferOwnership` | zeroed | Yes |
| `jbOwner.owner` | `renounceOwnership` via `_transferOwnership` | zeroed | Yes |
| `jbOwner.projectId` | constructor via `_transferOwnership` | set | Yes |
| `jbOwner.projectId` | `transferOwnership` via `_transferOwnership` | zeroed | Yes |
| `jbOwner.projectId` | `transferOwnershipToProject` via `_transferOwnership` | set | Yes |
| `jbOwner.projectId` | `renounceOwnership` via `_transferOwnership` | zeroed | Yes |
| `jbOwner.permissionId` | `_setPermissionId` | set | Not an ownership change |
| `jbOwner.permissionId` | `_transferOwnership` | reset to `0` | Yes |

## Parallel Path Comparison
| Coupled State | `transferOwnership` | `transferOwnershipToProject` | `renounceOwnership` |
|---------------|---------------------|------------------------------|---------------------|
| `owner/projectId` mutual exclusivity | ✓ | ✓ | ✓ |
| `permissionId` reset on ownership change | ✓ | ✓ | ✓ |
| owner-resolution parity with `owner()` / `_checkOwner()` | ✓ | ✓ | ✓ |

## Verification Summary
| ID | Coupled Pair | Breaking Op | Original Severity | Verdict | Final Severity |
|----|-------------|-------------|-------------------|---------|----------------|
| — | — | — | — | No verified state inconsistency findings | — |

## Verified Findings
- None.

## False Positives Eliminated
- No mutation path updates `jbOwner.owner` without also updating `jbOwner.projectId` and resetting `jbOwner.permissionId`. The packed-struct overwrite in `src/JBOwnableOverrides.sol:L244` preserves the intended coupling atomically.
- `owner()` and `_checkOwner()` both resolve project ownership through the same `try PROJECTS.ownerOf(projectId) ... catch { address(0) }` pattern, so no read/auth divergence was found.
- `forge inspect JBOwnableOverrides storage-layout` confirms `jbOwner` occupies one 32-byte slot, eliminating partial-slot coupling concerns.

## Summary
- Coupled state pairs mapped: 3
- Mutation paths analyzed: 10
- Raw findings (pre-verification): 0
- After verification: 0 TRUE POSITIVE | 0 FALSE POSITIVE
- Final: 0 CRITICAL | 0 HIGH | 0 MEDIUM | 0 LOW
