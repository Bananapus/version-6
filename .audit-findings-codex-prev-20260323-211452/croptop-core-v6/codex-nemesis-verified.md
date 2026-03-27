# N E M E S I S — Verified Findings

## Scope
- Language: Solidity 0.8.26
- Modules analyzed: 14 Solidity files
- Functions analyzed: 34
- Coupled state pairs mapped: 4
- Mutation paths traced: 8
- Nemesis loop iterations: 2 targeted feedback iterations after the initial full Feynman and State passes

## Nemesis Map (Phase 1 Cross-Reference)
| Function | Writes A | Writes B | A↔B Pair | Sync Status |
|----|----|----|----|----|
| `deployProjectFor()` | hook owner authority source | publisher permission source | owner↔permission | `SYNCED` |
| `claimCollectionOwnershipOf()` | hook owner authority source | publisher permission source | owner↔permission | `GAP` |
| `_setupPosts()` | URI cache | tier liveness coherence | uri↔tier | `SYNCED` |
| `configurePostingCriteriaFor()` | numeric thresholds | allowlist | packed↔allowlist | `SYNCED` |

## Verification Summary
| ID | Source | Coupled Pair | Breaking Op | Severity | Verdict |
|----|----|----|----|----|----|
| NM-001 | Cross-feed P2→P3 | hook owner ↔ publisher permission authority | `claimCollectionOwnershipOf()` | MEDIUM | TRUE POSITIVE |
| NM-002 | Feynman-only | config docs ↔ validation semantics | `configurePostingCriteriaFor()` | LOW | TRUE POSITIVE |

## Verified Findings

### Finding NM-001: Ownership claims desynchronize hook ownership from the publisher permission authority
**Severity:** MEDIUM
**Source:** Cross-feed P2→P3
**Verification:** Hybrid

**Coupled Pair:** hook owner ↔ permission authority for `CTPublisher`
**Invariant:** The authority account returned by `JBOwnable(hook).owner()` must also be the account whose permission bitmap allows `CTPublisher` to adjust tiers.

**Feynman Question that exposed it:**
> Why does `claimCollectionOwnershipOf()` move the hook owner but leave every Croptop permission grant anchored to `CTDeployer`?

**State Mapper gap that confirmed it:**
> `deployProjectFor()` updates both sides of the owner/permission pair, while `claimCollectionOwnershipOf()` updates only the owner side.

**Breaking Operation:** `claimCollectionOwnershipOf()` at [`src/CTDeployer.sol:224`](./src/CTDeployer.sol)
- Modifies State A: `JBOwnable(address(hook)).transferOwnershipToProject(projectId)` switches hook ownership to the project.
- Does NOT update State B: no new `PERMISSIONS.setPermissionsFor(...)` grant is created from the project owner to `CTPublisher`.

**Trigger Sequence:**
1. Deploy a project via `deployProjectFor()`. This grants Croptop permissions from `CTDeployer` at [`src/CTDeployer.sol:339`](./src/CTDeployer.sol).
2. Project owner calls `claimCollectionOwnershipOf()`.
3. `JBOwnable(hook).owner()` now resolves to `PROJECTS.ownerOf(projectId)`.
4. A later `configurePostingCriteriaFor()` or `mintFrom()` authorizes against the new owner at [`src/CTPublisher.sol:256`](./src/CTPublisher.sol), but no matching permission exists.
5. Publishing reverts until the owner manually re-grants `ADJUST_721_TIERS` to the publisher.

**Consequence:**
- Croptop publishing enters a broken state on the normal ownership-claim path.
- The failure is not self-healing and affects both new-tier publication and any `mintFrom()` call that traverses `adjustTiers`.

**Verification Evidence:**
- Code trace:
  - Permission grant from the deployer authority: [`src/CTDeployer.sol:339`](./src/CTDeployer.sol)
  - Ownership handoff with no coupled permission update: [`src/CTDeployer.sol:224`](./src/CTDeployer.sol)
  - Authorization check against current hook owner: [`src/CTPublisher.sol:256`](./src/CTPublisher.sol)
  - Posting flow always reaches `hook.adjustTiers(...)`: [`src/CTPublisher.sol:358`](./src/CTPublisher.sol)
- PoC result:
  - `forge test --match-contract ClaimCollectionOwnershipTest -vvv`
  - `test_postClaim_publisherNeedsNewPermissions()` passes, confirming the post-claim revert scenario.

**Fix:**
```solidity
// When claiming ownership, atomically grant CTPublisher the required permission
// from the new authority account or preserve an equivalent owner-independent auth path.
```

---

### Finding NM-002: The advertised “0 means unlimited max supply” sentinel is non-functional
**Severity:** LOW
**Source:** Feynman-only
**Verification:** Code trace

**Coupled Pair:** Public configuration semantics ↔ on-chain validation
**Invariant:** The documented meaning of `maximumTotalSupply` must match what `configurePostingCriteriaFor()` accepts.

**Feynman Question that exposed it:**
> If `0` is meant to mean “no limit”, what execution path actually accepts it?

**Breaking Operation:** `configurePostingCriteriaFor()` at [`src/CTPublisher.sol:262`](./src/CTPublisher.sol)
- Modifies State A: validates and stores posting criteria.
- Does NOT preserve State B: docs/interfaces still advertise `0` as unlimited even though the validator rejects it.

**Trigger Sequence:**
1. Caller follows the documented API and sets `maximumTotalSupply = 0`.
2. `minimumTotalSupply` must still be positive.
3. Validation reverts because `minimumTotalSupply > maximumTotalSupply`.

**Consequence:**
- Integrators and deployment scripts can fail unexpectedly when using the documented sentinel value.
- No direct exploit or fund loss.

**Verification Evidence:**
- Rejection path:
  - non-zero minimum required at [`src/CTPublisher.sol:262`](./src/CTPublisher.sol)
  - `min > max` revert at [`src/CTPublisher.sol:267`](./src/CTPublisher.sol)
- Conflicting docs:
  - interface comment at [`src/interfaces/ICTPublisher.sol:43`](./src/interfaces/ICTPublisher.sol)
  - struct comments at [`src/structs/CTAllowedPost.sol:6`](./src/structs/CTAllowedPost.sol) and [`src/structs/CTDeployerAllowedPost.sol:6`](./src/structs/CTDeployerAllowedPost.sol)

**Fix:**
```solidity
// Either implement 0 as "unlimited" everywhere, or remove the sentinel from the public API/docs.
```

## Feedback Loop Discoveries
- `NM-001` required both passes:
  - State pass found the missing counterpart update in the owner↔permission pair.
  - Feynman re-interrogation traced why the gap becomes a user-visible DoS only after `claimCollectionOwnershipOf()`.

## False Positives Eliminated
- Permanent bricking via reverting `dataHookOf[projectId]` target: operationally escapable through ruleset changes, so not reported as a verified vulnerability in this repo.

## Downgraded Findings
- `script/Deploy.s.sol` creates an orphan fee project on reruns when `FEE_PROJECT_ID` remains zero. This is a deployment hygiene issue, not a live-contract exploit.

## Summary
- Total functions analyzed: 34
- Coupled state pairs mapped: 4
- Nemesis loop iterations: 2
- Raw findings (pre-verification): 0 C | 0 H | 1 M | 2 L
- Feedback loop discoveries: 1
- After verification: 2 TRUE POSITIVE | 1 FALSE POSITIVE | 1 DOWNGRADED
- Final: 0 CRITICAL | 0 HIGH | 1 MEDIUM | 1 LOW
