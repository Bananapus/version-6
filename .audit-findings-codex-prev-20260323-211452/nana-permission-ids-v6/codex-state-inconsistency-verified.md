# State Inconsistency Audit — Verified Findings

## Coupled State Dependency Map
- No mutable storage exists in `src/JBPermissionIds.sol`.
- The only meaningful couplings are semantic, at the dependency boundary:
  - constant name ↔ numeric ID
  - numeric ID ↔ downstream permission check site
  - holder-scoped constant ↔ holder-based `account` argument
  - dual-purpose constant ↔ paired set/lock call sites

## Mutation Matrix
| State Variable | Mutating Function | Type of Mutation |
|----------------|-------------------|------------------|
| None | None | Library is immutable constants-only code |

## Parallel Path Comparison
| Coupled State | Path A | Path B | Result |
|---------------|--------|--------|--------|
| `SET_BUYBACK_HOOK` usage | `setHookFor` | `lockHookFor` | Same permission ID enforced |
| `SET_ROUTER_TERMINAL` usage | `setTerminalFor` | `lockTerminalFor` | Same permission ID enforced |
| holder-scoped IDs | `burn/claim/transfer/cashOut` | owner-scoped admin flows | Correctly split by `account` target |

## Verification Summary
| ID | Coupled Pair | Breaking Op | Original Severity | Verdict | Final Severity |
|----|-------------|-------------|-------------------|---------|----------------|
| — | — | — | — | No findings verified | — |

## Verified Findings
- None.

## False Positives Eliminated
- None. No missing synchronization or semantic drift was found between the constants library and the downstream permission checks reviewed.

## Summary
- Coupled state pairs mapped: 4 semantic pair classes
- Mutation paths analyzed: 0 in-repo, boundary-only verification
- Raw findings (pre-verification): 0
- After verification: 0 TRUE POSITIVE | 0 FALSE POSITIVE
- Final: 0 CRITICAL | 0 HIGH | 0 MEDIUM | 0 LOW

## Verification Evidence
- `ROOT` cannot be set for wildcard projects and cannot be forwarded by a ROOT operator:
  - `../nana-core-v6/src/JBPermissions.sol:62`
  - validated by `test/TestPermissionsEdge.sol` and `test/PermissionEscalation.t.sol`
- Holder-scoped permissions are checked against `holder`, not project owner:
  - `../nana-core-v6/src/JBController.sol:246`
  - `../nana-core-v6/src/JBController.sol:280`
  - `../nana-core-v6/src/JBController.sol:701`
  - `../nana-core-v6/src/JBMultiTerminal.sol:277`
- Owner-scoped permissions are checked against project owner:
  - `../nana-core-v6/src/JBController.sol:177`
  - `../nana-core-v6/src/JBController.sol:435`
  - `../nana-core-v6/src/JBDirectory.sol:99`
  - `../nana-core-v6/src/JBMultiTerminal.sol:197`
- Dual-purpose IDs are consistently enforced on both paired paths:
  - `../nana-buyback-hook-v6/src/JBBuybackHookRegistry.sol:125`
  - `../nana-buyback-hook-v6/src/JBBuybackHookRegistry.sol:172`
  - `../nana-router-terminal-v6/src/JBRouterTerminalRegistry.sol:304`
  - `../nana-router-terminal-v6/src/JBRouterTerminalRegistry.sol:405`
