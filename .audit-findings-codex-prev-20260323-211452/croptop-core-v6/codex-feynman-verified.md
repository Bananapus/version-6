# Feynman Audit — Verified Findings

## Scope
- Language: Solidity 0.8.26
- Modules analyzed: 14 Solidity files in `src/` and `script/`
- Functions analyzed: 34
- Lines interrogated: focused review of all concrete contracts/scripts plus interface and struct assumptions

## Verification Summary
| ID | Original Severity | Verdict | Final Severity |
|----|-------------------|---------|----------------|
| FF-001 | MEDIUM | TRUE POSITIVE | MEDIUM |
| FF-002 | LOW | TRUE POSITIVE | LOW |

## Function-State Matrix
| Function | Reads | Writes | Guards | Calls |
|----|----|----|----|----|
| `CTPublisher.configurePostingCriteriaFor` | hook owner, hook projectId | `_packedAllowanceFor`, `_allowedAddresses` | `ADJUST_721_TIERS` via hook owner | `JBOwnable.owner`, `IJB721TiersHook.PROJECT_ID` |
| `CTPublisher.mintFrom` | `FEE_PROJECT_ID`, hook/store state, directory terminals | `tierIdForEncodedIPFSUriOf` via `_setupPosts` | allowance + allowlist checks | `hook.adjustTiers`, `terminal.pay` |
| `CTDeployer.claimCollectionOwnershipOf` | `hook.PROJECT_ID`, `PROJECTS.ownerOf` | none directly | project NFT owner check | `transferOwnershipToProject` |
| `CTDeployer.deployProjectFor` | `PROJECTS.count`, controller/project config | `dataHookOf[projectId]` | controller/projects consistency | hook deployer, controller launch, publisher config, sucker registry |
| `CTProjectOwner.onERC721Received` | `msg.sender`, `tokenId` | permission bitmap in `JBPermissions` | caller must be `PROJECTS` | `setPermissionsFor` |
| `DeployScript.deploy` | deployment state, `FEE_PROJECT_ID` | `FEE_PROJECT_ID` in-script | none | `createFor`, constructors |

## Guard Consistency Analysis
- Hook ownership changes are not accompanied by a matching publisher permission migration. `deployProjectFor()` grants `CTPublisher` authority from `CTDeployer`, while `claimCollectionOwnershipOf()` switches future authorization checks to the project owner.
- Posting-criteria docs advertise `maximumTotalSupply == 0` as “unlimited”, but `configurePostingCriteriaFor()` rejects every such config because `minimumTotalSupply` must be non-zero.

## Inverse Operation Parity
- Deploy path: `deployProjectFor()` establishes `CTDeployer` as hook owner and permission granter.
- Claim path: `claimCollectionOwnershipOf()` moves hook ownership to the project without re-establishing the permissions that `mintFrom()` and `configurePostingCriteriaFor()` still require.

## Verified Findings

### Finding FF-001: `claimCollectionOwnershipOf` breaks Croptop posting until the project owner manually re-grants publisher permissions
**Severity:** MEDIUM
**Module:** `CTDeployer` / `CTPublisher`
**Function:** `claimCollectionOwnershipOf`, `configurePostingCriteriaFor`, `mintFrom`
**Lines:** `src/CTDeployer.sol:224-235`, `src/CTDeployer.sol:339-346`, `src/CTPublisher.sol:256-260`, `src/CTPublisher.sol:358`, `src/CTPublisher.sol:517-549`
**Verification:** Hybrid — code trace + existing Foundry test `test/ClaimCollectionOwnership.t.sol::test_postClaim_publisherNeedsNewPermissions`

**Feynman Question that exposed this:**
> Why does the claim path move hook ownership without also moving the permission source that the publisher relies on?

**The code:**
```solidity
// CTDeployer.deployProjectFor
PERMISSIONS.setPermissionsFor({
    account: address(this),
    permissionsData: JBPermissionsData({
        operator: address(owner),
        projectId: uint64(projectId),
        permissionIds: permissionIds
    })
});

// CTDeployer.claimCollectionOwnershipOf
JBOwnable(address(hook)).transferOwnershipToProject(projectId);

// CTPublisher.configurePostingCriteriaFor
_requirePermissionFrom({
    account: JBOwnable(allowedPost.hook).owner(),
    projectId: IJB721TiersHook(allowedPost.hook).PROJECT_ID(),
    permissionId: JBPermissionIds.ADJUST_721_TIERS
});
```

**Why this is wrong:**
`deployProjectFor()` grants Croptop-related permissions from `CTDeployer` as the authority account. After `claimCollectionOwnershipOf()`, the hook owner is no longer `CTDeployer`; `JBOwnable.owner()` resolves to `PROJECTS.ownerOf(projectId)`. Every later publisher permission check is therefore evaluated against the project owner’s permission bitmap, but no permission migration happens during `claimCollectionOwnershipOf()`. The posting flow silently changes trust domains without synchronizing the dependent authorization state.

**Verification evidence:**
- Code trace:
  - `CTPublisher.configurePostingCriteriaFor()` authorizes against `JBOwnable(hook).owner()` at [`src/CTPublisher.sol:256`](./src/CTPublisher.sol).
  - `mintFrom()` always calls `hook.adjustTiers(...)` at [`src/CTPublisher.sol:358`](./src/CTPublisher.sol), so even batches that only reuse existing tiers still traverse the hook-owner permission surface.
  - `claimCollectionOwnershipOf()` only calls `transferOwnershipToProject(projectId)` and performs no `setPermissionsFor` call at [`src/CTDeployer.sol:224`](./src/CTDeployer.sol).
- PoC-equivalent test:
  - `forge test --match-contract ClaimCollectionOwnershipTest -vvv`
  - `test_postClaim_publisherNeedsNewPermissions()` passes and demonstrates the exact revert after claim.

**Attack scenario:**
1. A project is deployed through `CTDeployer`, making `CTDeployer` the hook owner and the source of Croptop permissions.
2. The project owner calls `claimCollectionOwnershipOf()` to transfer hook ownership to the project.
3. No new permission grant is made from the project owner to `CTPublisher`.
4. The next Croptop post or posting-criteria update reverts because authorization is now checked against the project owner instead of `CTDeployer`.

**Impact:**
- Post-claim, Croptop publishing is DoSed until the owner performs an undocumented extra permission grant.
- This is reachable on the canonical ownership-claim path and affects normal project lifecycle, so it is more than an informational footgun.

**Suggested fix:**
```solidity
// In claimCollectionOwnershipOf(), grant CTPublisher permission from the new authority
// before or atomically with the ownership transfer.
```

---

### Finding FF-002: `maximumTotalSupply == 0` is documented as “unlimited” but is impossible to configure
**Severity:** LOW
**Module:** `CTPublisher`
**Function:** `configurePostingCriteriaFor`
**Lines:** `src/CTPublisher.sol:262-271`, `src/interfaces/ICTPublisher.sol:43-55`, `src/structs/CTAllowedPost.sol:6-11`, `src/structs/CTDeployerAllowedPost.sol:6-11`
**Verification:** Code trace

**Feynman Question that exposed this:**
> What exact behavior is protected by the `min <= max` check, and does it match the documented “0 means no limit” sentinel?

**Why this is wrong:**
The public docs and struct comments say `maximumTotalSupply == 0` means “no limit”. The implementation requires `minimumTotalSupply > 0` and then reverts whenever `minimumTotalSupply > maximumTotalSupply`. That makes `maximumTotalSupply == 0` unreachable for every valid configuration.

**Verification evidence:**
- `minimumTotalSupply == 0` reverts at [`src/CTPublisher.sol:262`](./src/CTPublisher.sol).
- `minimumTotalSupply > maximumTotalSupply` reverts at [`src/CTPublisher.sol:267`](./src/CTPublisher.sol).
- Therefore a zero max can never pass because `minimumTotalSupply` must be positive.

**Impact:**
- Configuration and deployment tooling that relies on the advertised sentinel value will revert unexpectedly.
- No direct fund loss; this is a configuration/API mismatch.

**Suggested fix:**
```solidity
// Either implement 0 as "unlimited" in configurePostingCriteriaFor/_setupPosts,
// or remove the sentinel from the docs and interfaces.
```

## False Positives Eliminated
- `dataHookOf[projectId]` being unset can make proxy calls revert, but the deploy path sets it immediately after project launch and no in-scope flow exposes an attacker-controlled path to leave a deployed project permanently stuck on `address(0)`.
- Underlying data-hook reverts can brick pay/cashout for a ruleset, but this repo’s own project lifecycle can escape by queueing a new ruleset without the Croptop data hook; that is an operational risk, not a permanent logic lock in this codebase.

## Downgraded Findings
- Re-running `script/Deploy.s.sol` with `FEE_PROJECT_ID == 0` creates an extra orphan fee project before checking whether contracts already exist. This wastes a project ID and gas, but it does not compromise deployed Croptop contracts because `CTPublisher` retains the original immutable fee-project reference.

## Summary
- Total functions analyzed: 34
- Raw findings (pre-verification): 0 CRITICAL | 0 HIGH | 1 MEDIUM | 2 LOW
- After verification: 2 TRUE POSITIVE | 1 FALSE POSITIVE | 1 DOWNGRADED
- Final: 0 HIGH | 1 MEDIUM | 1 LOW
