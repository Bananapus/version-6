# State Inconsistency Audit — Verified Findings

## Coupled State Dependency Map
- `hook owner` ↔ `who must authorize `ADJUST_721_TIERS` for `CTPublisher``
  - Invariant: whenever hook ownership changes, the authority bitmap that `CTPublisher` checks must change with it.
  - Mutation points: `CTDeployer.deployProjectFor`, `CTDeployer.claimCollectionOwnershipOf`.
- `dataHookOf[projectId]` ↔ ruleset metadata `dataHook/useDataHookForPay/useDataHookForCashOut`
  - Invariant: Croptop proxy forwarding only works when both the ruleset and `dataHookOf` point to the same hook.
- `tierIdForEncodedIPFSUriOf[hook][uri]` ↔ tier liveness in `JB721TiersHookStore`
  - Invariant: cached tier IDs must either resolve to a live tier or be cleared before reuse.
- `_packedAllowanceFor[hook][category]` ↔ `_allowedAddresses[hook][category]`
  - Invariant: category policy is the combination of numeric thresholds and address allowlist.

## Mutation Matrix
| State Variable | Mutating Function | Updates Coupled State? |
|----|----|----|
| Hook owner / authority source | `CTDeployer.deployProjectFor` | `YES` — owner is `CTDeployer`, publisher permission is also granted from `CTDeployer` |
| Hook owner / authority source | `CTDeployer.claimCollectionOwnershipOf` | `NO` — owner changes to project, publisher permission source is not migrated |
| `dataHookOf[projectId]` | `CTDeployer.deployProjectFor` | `YES` |
| `tierIdForEncodedIPFSUriOf` | `CTPublisher._setupPosts` | `YES` on new tier and stale-tier cleanup |
| Packed allowance + allowlist | `CTPublisher.configurePostingCriteriaFor` | `YES` |

## Parallel Path Comparison
| Coupled State | Deploy path | Claim path |
|----|----|----|
| Hook owner ↔ publisher permission source | `deployProjectFor()` sets owner authority and grants permissions from the same authority | `claimCollectionOwnershipOf()` changes owner authority only |

## Verification Summary
| ID | Coupled Pair | Breaking Op | Original Severity | Verdict | Final Severity |
|----|----|----|----|----|----|
| SI-001 | hook owner ↔ publisher permission authority | `claimCollectionOwnershipOf()` | MEDIUM | TRUE POSITIVE | MEDIUM |

## Verified Findings

### Finding SI-001: Ownership claim updates the hook owner without updating the publisher’s dependent permission authority
**Severity:** MEDIUM
**Verification:** Hybrid

**Coupled Pair:** hook owner ↔ permission authority for `CTPublisher`
**Invariant:** The account returned by `JBOwnable(hook).owner()` must be the same account whose permission bitmap authorizes `CTPublisher` to adjust tiers.

**Breaking Operation:** `claimCollectionOwnershipOf()` in [`src/CTDeployer.sol:224`](./src/CTDeployer.sol)
- Modifies State A: moves hook ownership from `CTDeployer` to `projectId`.
- Does NOT update State B: no `setPermissionsFor` call gives `CTPublisher` `ADJUST_721_TIERS` permission from the new owner.

**Trigger Sequence:**
1. Deploy a project through `deployProjectFor()`, which leaves `CTDeployer` as hook owner and permission account.
2. Owner calls `claimCollectionOwnershipOf()`.
3. `CTPublisher.configurePostingCriteriaFor()` or `mintFrom()` runs later.
4. Authorization is now checked against the project owner and fails unless the owner manually grants the publisher permission.

**Consequence:**
- Croptop posting stops working after the ownership-claim path.
- This is a state-coupling bug between ownership resolution in `JBOwnable` and delegated authorization in `JBPermissions`.

**Fix:**
```solidity
// When ownership is transferred to the project, atomically grant the publisher
// the matching permission from the new authority account.
```

## False Positives Eliminated
- `tierIdForEncodedIPFSUriOf` stale-cache risk is actively reconciled by the removal check at [`src/CTPublisher.sol:493`](./src/CTPublisher.sol).
- `dataHookOf[projectId]` unset state is observable but not reachable through the intended deployment lifecycle for a live Croptop project.

## Summary
- Coupled state pairs mapped: 4
- Mutation paths analyzed: 8
- Raw findings (pre-verification): 1
- After verification: 1 TRUE POSITIVE | 0 FALSE POSITIVE
- Final: 0 CRITICAL | 0 HIGH | 1 MEDIUM | 0 LOW
