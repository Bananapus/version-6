# N E M E S I S — Verified Findings

## Scope
- Language: Solidity 0.8.26
- Modules analyzed: all Solidity files under `src/` and `script/`
- Functions analyzed: 398
- Coupled state pairs mapped: 10 major protocol invariants
- Mutation paths traced: 60+
- Nemesis loop iterations: 1 full back-and-forth cycle after recon

## Nemesis Map
- **Funds:** `JBMultiTerminal` actual balances ↔ `JBTerminalStore.balanceOf`
- **Limits:** `usedPayoutLimitOf` / `usedSurplusAllowanceOf` ↔ fund access limit tables
- **Supply:** ERC20 supply + credit supply + pending reserved supply
- **Routing:** terminal membership ↔ primary terminal pointers
- **Fee lifecycle:** held-fee array ↔ next-held-fee index ↔ fee processing path
- **Deployment state:** Sphinx namespace ↔ deployment-address loader ↔ periphery mutators

## Verification Summary
| ID | Source | Coupled Pair | Breaking Op | Severity | Verdict |
|----|--------|-------------|-------------|----------|---------|
| NM-001 | Feynman-only | permission bitmap ↔ wildcard scope invariant | `JBPermissions.setPermissionsFor()` | MEDIUM | TRUE POS |
| NM-002 | Feynman-only | deployment namespace ↔ deployment loader | `configureSphinx()` / `CoreDeploymentLib.getDeployment()` | MEDIUM | TRUE POS |
| NM-003 | Feynman-only | chain selector ↔ oracle address | `_deployUSDCFeed()` | LOW | TRUE POS |

## Verified Findings

### Finding NM-001: MEDIUM — Wildcard `ROOT` can still be granted even though the protocol documents that it must revert
**Severity:** MEDIUM
**Source:** Feynman-only
**Verification:** Hybrid

**Coupled Pair:** permission bitmap ↔ wildcard-scope safety invariant
**Invariant:** `ROOT` must never be grantable with `projectId = 0`.

**Feynman question that exposed it:**
> Where is the unconditional check that forbids `ROOT + wildcard`, not just operator-mediated forwarding?

**State Mapper confirmation:**
The dangerous state written is `permissionsOf[operator][account][0]`, and `hasPermission(... includeWildcardProjectId=true)` treats that slot as a cross-project fallback for every project.

**Breaking Operation:** `setPermissionsFor()` at [`src/JBPermissions.sol:62`](src/JBPermissions.sol#L62)
- Writes wildcard permission storage for the operator.
- Does not reject `ROOT` when `msgSender == account`.

**Trigger Sequence:**
1. The account calls `setPermissionsFor(account, { operator, projectId: 0, permissionIds: [ROOT] })`.
2. The write succeeds.
3. The operator now passes permission checks on any project owned by that account whenever `includeRoot` and `includeWildcardProjectId` are enabled.

**Consequence:**
- One signature creates an all-project super-operator.
- The operator can perform privileged actions across every project owned by the account and can further delegate specific non-ROOT permissions project by project.

**Verification Evidence:**
- Code trace: [`src/JBPermissions.sol:74-86`](src/JBPermissions.sol#L74) only enforces the restriction for `msgSender != account`.
- PoC: `test/audit/CodexPermissionsWildcardRoot.t.sol`
  - `forge test --match-path test/audit/CodexPermissionsWildcardRoot.t.sol -vvv`
  - Passed: the wildcard-ROOT operator successfully changed metadata on two separate projects.

**Fix:**
```solidity
if (
    permissionsData.projectId == WILDCARD_PROJECT_ID
        && _includesPermission({permissions: packed, permissionId: JBPermissionIds.ROOT})
) revert JBPermissions_CantSetRootPermissionForWildcardProject();
```

---

### Finding NM-002: MEDIUM — v6 deployment scripts still use the v5 Sphinx project namespace, so periphery operations can resolve the wrong deployment set
**Severity:** MEDIUM
**Source:** Feynman-only
**Verification:** Code trace

**Coupled Pair:** deployment namespace ↔ deployment-address resolution
**Invariant:** the deploy script, periphery script, and deployment loader must target the same v6 namespace.

**Breaking Operation:** namespace selection at:
- [`script/Deploy.s.sol:46`](script/Deploy.s.sol#L46)
- [`script/DeployPeriphery.s.sol:50`](script/DeployPeriphery.s.sol#L50)
- [`script/helpers/CoreDeploymentLib.sol:43`](script/helpers/CoreDeploymentLib.sol#L43)

**Trigger Sequence:**
1. Operator runs the v6 deployment repo.
2. Core and periphery scripts use `nana-core-v5` as the Sphinx project name / deployment path.
3. `DeployPeriphery.run()` loads addresses from the v5 namespace.
4. Privileged writes execute against whatever deployment files are found there.

**Consequence:**
- If v5 deployment artifacts exist, the periphery script can mutate the wrong live contracts.
- If tooling uses the v6 namespace elsewhere, artifact lookup becomes inconsistent and brittle.

**Verification Evidence:**
- Scripts hardcode `nana-core-v5`.
- Repo metadata and artifacts tooling identify the repo as `nana-core-v6`.

**Fix:**
Rename the Sphinx project name and helper constant to `nana-core-v6` everywhere, and keep the package/tooling namespace aligned.

---

### Finding NM-003: LOW — Base Sepolia USDC/USD periphery deployment uses a feed address the script already flags as likely incorrect
**Severity:** LOW
**Source:** Feynman-only
**Verification:** Code trace

**Coupled Pair:** selected chain ID ↔ selected price feed
**Invariant:** the Base Sepolia USDC/USD branch must use the correct Chainlink feed for that pair.

**Breaking Operation:** `_deployUSDCFeed()` at [`script/DeployPeriphery.s.sol:255`](script/DeployPeriphery.s.sol#L255)

**Trigger Sequence:**
1. Run `DeployPeriphery` on Base Sepolia (`chainid == 84532`).
2. The script reaches the Base Sepolia branch.
3. It deploys `JBChainlinkV3PriceFeed` with `0xd30e2101...`, even though the inline comment says this is likely the wrong address.

**Consequence:**
- Base Sepolia price-dependent flows can be mispriced or broken.
- This is testnet-only, so impact is limited to deployments on that network.

**Verification Evidence:**
- The comment at [`script/DeployPeriphery.s.sol:257-259`](script/DeployPeriphery.s.sol#L257) explicitly states the address is likely incorrect.
- The very next lines still use that address.

**Fix:**
Replace the placeholder with the correct Base Sepolia USDC/USD Chainlink feed before deployment.

## Feedback Loop Discoveries
- No verified cross-feed findings emerged after the state pass. The round converged with one runtime permission flaw and two deployment-script flaws.

## False Positives Eliminated
- Allowance persistence after terminal forwarding was traced and rejected as a true positive because the callee could only defer collection of value already allocated to it.
- Suspected ruleset-cycle desync in `JBRulesets` did not survive control-flow tracing.

## Summary
- Total functions analyzed: 398
- Coupled state pairs mapped: 10
- Nemesis loop iterations: 1
- Raw findings (pre-verification): 0 C | 0 H | 2 M | 1 L
- Feedback loop discoveries: 0
- After verification: 3 TRUE POSITIVE | 0 FALSE POSITIVE | 0 DOWNGRADED
- Final: 0 CRITICAL | 0 HIGH | 2 MEDIUM | 1 LOW
