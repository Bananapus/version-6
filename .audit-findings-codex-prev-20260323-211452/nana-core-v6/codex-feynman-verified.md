# Feynman Audit — Verified Findings

## Scope
- Language: Solidity 0.8.26
- Files analyzed: 89 Solidity files under `src/` and `script/`
- Functions analyzed: 398
- Primary focus: `JBMultiTerminal`, `JBTerminalStore`, `JBController`, `JBRulesets`, `JBDirectory`, `JBPermissions`, payout/fee helpers, and both deployment scripts

## Verification Summary
| ID | Original Severity | Verdict | Final Severity |
|----|-------------------|---------|----------------|
| FF-001 | MEDIUM | TRUE POSITIVE | MEDIUM |
| FF-002 | MEDIUM | TRUE POSITIVE | MEDIUM |
| FF-003 | LOW | TRUE POSITIVE | LOW |

## Verified Findings

### Finding FF-001: MEDIUM — `JBPermissions` allows wildcard `ROOT` grants despite the documented safety rail forbidding them
**Module:** `src/JBPermissions.sol`
**Lines:** `62-96`
**Verification:** Hybrid — code trace plus PoC test `test/audit/CodexPermissionsWildcardRoot.t.sol`

**Feynman question that exposed this:**
> If wildcard `projectId = 0` and `ROOT` are explicitly documented as incompatible, where is that incompatibility enforced for the account itself?

**The code:**
- [`src/JBPermissions.sol:62`](src/JBPermissions.sol#L62) gates the `ROOT`/wildcard restriction only inside `if (msgSender != account)`.
- When `msgSender == account`, the function writes `permissionsOf[operator][account][projectId] = packed` with no `ROOT + projectId == 0` check.

**Why this is wrong:**
The repo’s own security model says `ROOT` must not be grantable on wildcard scope because that creates an all-project super-operator. The implementation only blocks existing operators from doing this, but the account itself can still create that forbidden grant in one call.

**Verification evidence:**
- Code trace: the only guard is the branch at [`src/JBPermissions.sol:74-86`](src/JBPermissions.sol#L74), which is skipped when `msgSender == account`.
- PoC: `forge test --match-path test/audit/CodexPermissionsWildcardRoot.t.sol -vvv`
  - Passed: `test_ownerCanGrantWildcardRootAndOperatorGetsAllProjectPermissions()`
  - The owner granted `ROOT` on project `0`, and the operator successfully called `JBController.setUriOf(...)` on two distinct projects.

**Attack / misuse scenario:**
1. A project owner signs what they believe is a normal operator grant.
2. The transaction grants `ROOT` with `projectId = 0`.
3. The operator now has every permission on every current and future project owned by that account.
4. The operator can also delegate non-ROOT permissions onward on specific projects because wildcard `ROOT` satisfies the `hasPermission(... includeRoot=true, includeWildcardProjectId=true)` check.

**Impact:**
This collapses the intended project-by-project permission boundary into one global super-admin grant. The owner is still the source of the grant, so this is not a permissionless takeover, but it defeats an explicitly documented safety rail meant to prevent exactly this class of catastrophic over-delegation.

**Suggested fix:**
Add an unconditional check before the operator branch:

```solidity
if (
    permissionsData.projectId == WILDCARD_PROJECT_ID
        && _includesPermission({permissions: packed, permissionId: JBPermissionIds.ROOT})
) revert JBPermissions_CantSetRootPermissionForWildcardProject();
```

### Finding FF-002: MEDIUM — The v6 deployment scripts are still hardwired to the v5 Sphinx project namespace
**Modules:** `script/Deploy.s.sol`, `script/DeployPeriphery.s.sol`, `script/helpers/CoreDeploymentLib.sol`
**Lines:** `Deploy.s.sol:45-48`, `DeployPeriphery.s.sol:49-52`, `CoreDeploymentLib.sol:43`
**Verification:** Code trace

**Feynman question that exposed this:**
> Why does a v6 repo deploy under the `nana-core-v5` Sphinx project name, and why does the periphery loader read deployments from the same v5 namespace?

**The code:**
- [`script/Deploy.s.sol:46`](script/Deploy.s.sol#L46) sets `sphinxConfig.projectName = "nana-core-v5";`
- [`script/DeployPeriphery.s.sol:50`](script/DeployPeriphery.s.sol#L50) does the same.
- [`script/helpers/CoreDeploymentLib.sol:43`](script/helpers/CoreDeploymentLib.sol#L43) hardcodes `PROJECT_NAME = "nana-core-v5";`
- The repo metadata is v6: [`package.json`](package.json) points at `nana-core-v6`, and the artifacts script uses `--project-name 'nana-core-v6'`.

**Why this is wrong:**
The core deploy, periphery deploy, and deployment-address loader are all keyed to the wrong namespace. In the best case this causes operational confusion and artifact lookup failures. In the worst case, if v5 deployment JSON exists in the shared path, `DeployPeriphery.run()` loads those addresses and mutates the wrong live contracts when it adds price feeds or allowlists a controller.

**Verification evidence:**
- `DeployPeriphery.run()` loads `core = CoreDeploymentLib.getDeployment(...)`, and that helper always reads from `deployments/nana-core-v5/...`.
- `package.json`’s artifacts command uses `nana-core-v6`, proving the repo’s own tooling is internally inconsistent.

**Impact:**
Operators can silently target the wrong deployment set or fail to find the deployment they just created. Because `DeployPeriphery` performs privileged writes (`addPriceFeedFor`, `setIsAllowedToSetFirstController`), a namespace collision can mutate an unrelated deployment rather than merely failing closed.

**Suggested fix:**
Rename all three constants to `nana-core-v6` and keep the package/tooling namespace consistent end to end.

### Finding FF-003: LOW — Base Sepolia USDC/USD deployment is wired to a feed address the script itself marks as likely wrong
**Module:** `script/DeployPeriphery.s.sol`
**Lines:** `255-263`
**Verification:** Code trace

**Feynman question that exposed this:**
> Why is the Base Sepolia USDC/USD branch shipping a feed address that the script comments already identify as the Arbitrum Sepolia ETH/USD feed?

**The code:**
- [`script/DeployPeriphery.s.sol:257-261`](script/DeployPeriphery.s.sol#L257) contains a TODO stating `0xd30e2101...` is likely the wrong feed for Base Sepolia USDC/USD, then immediately deploys `JBChainlinkV3PriceFeed` with that address anyway.

**Why this is wrong:**
The script acknowledges the address is probably not the intended oracle and still uses it. A periphery deployment on Base Sepolia will therefore register a price feed that may revert, price the wrong asset pair, or otherwise make testnet price-dependent flows invalid.

**Impact:**
Testnet-only mispricing / DoS for Base Sepolia deployments. This does not affect the audited mainnet branches in the same script.

**Suggested fix:**
Replace the placeholder with the correct Base Sepolia USDC/USD Chainlink feed before allowing this branch to deploy.

## False Positives Eliminated
- The ERC-20 allowance persistence after hook/split forwarding in `JBMultiTerminal` initially looked like a cross-project drain. After tracing the accounting and pull model end to end, the callee could only delay collection of funds it was already entitled to receive, so I did not report it.
- The `JBRulesets._simulateCycledRulesetBasedOn(...)` mid-cycle start calculation looked suspicious on first read, but the `currentOf(...)` control flow returns the live stored ruleset whenever one is active, so the suspicious branch is only used for simulated rollover and did not produce a reachable bug in this round.

## Summary
- Raw findings (pre-verification): 0 CRITICAL | 0 HIGH | 2 MEDIUM | 1 LOW
- After verification: 3 TRUE POSITIVE | 0 FALSE POSITIVE | 0 DOWNGRADED
- Final: 0 HIGH | 2 MEDIUM | 1 LOW
