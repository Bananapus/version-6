# Feynman Audit — Verified Findings

## Scope
- Language: Solidity
- Modules analyzed:
  - `src/JBOmnichainDeployer.sol`
  - `src/interfaces/IJBOmnichainDeployer.sol`
  - `src/structs/*.sol`
  - `script/Deploy.s.sol`
  - `script/helpers/DeployersDeploymentLib.sol`
- Functions analyzed: 31 executable functions
- Lines interrogated: 1,266

## Verification Summary
| ID | Original Severity | Verdict | Final Severity |
|----|-------------------|---------|----------------|
| FF-001 | HIGH | FALSE POSITIVE | — |
| FF-002 | HIGH | FALSE POSITIVE | — |
| FF-003 | MEDIUM | FALSE POSITIVE | — |
| FF-004 | MEDIUM | FALSE POSITIVE | — |

## Function-State Matrix
| Function | Reads | Writes | Guards | Calls |
|---|---|---|---|---|
| `beforeCashOutRecordedWith` | ruleset hook configs, sucker registry | none | none | registry, 721 hook, extra hook |
| `beforePayRecordedWith` | ruleset hook configs | none | none | 721 hook, extra hook |
| `hasMintPermissionFor` | ruleset hook config, sucker registry | none | none | registry, extra hook |
| `deploySuckersFor` | project owner | none | `DEPLOY_SUCKERS` | registry |
| `launchProjectFor` / `_launchProjectFor` | `PROJECTS.count()` | hook mappings | none | hook deployer, controller, registry, projects |
| `launchRulesetsFor` / `_launchRulesetsFor` | project owner, controller directory | hook mappings | `LAUNCH_RULESETS`, `SET_TERMINALS` | controller, hook deployer, ownable |
| `queueRulesetsOf` / `_queueRulesetsOf` | project owner, latest ruleset ID | hook mappings | `QUEUE_RULESETS` | controller, hook deployer, ownable |
| `_setup721` | incoming ruleset metadata | both hook mappings, outgoing metadata | none | none |
| `script/Deploy.deploy` | deployment registries | none | Sphinx-controlled | constructor |
| `DeployersDeploymentLib.getDeployment*` | chain ID, network info, deployment JSON | none | none | local helper only |

## Guard Consistency Analysis
- `launchRulesetsFor` correctly requires both `LAUNCH_RULESETS` and `SET_TERMINALS`, matching `core-v6` controller requirements.
- `queueRulesetsOf` correctly requires `QUEUE_RULESETS` only.
- `launchProjectFor` is intentionally permissionless because the project does not yet exist; no inconsistent access-control gap found.

## Inverse Operation Parity
- `launchRulesetsFor` and `queueRulesetsOf` both validate the supplied controller against the directory before mutating hook mappings.
- `queueRulesetsOf` has an additional same-block predictability guard because it may follow an existing ruleset chain; `launchRulesetsFor` does not need it because `core-v6` only permits it when no prior rulesets exist.

## Verified Findings (TRUE POSITIVES only)

No verified true positives.

## False Positives Eliminated

### FF-001: Ruleset ID prediction can desync hook storage
- Verification: deep code trace
- Result: false positive
- Why eliminated:
  - `core-v6` allocates ruleset IDs as `latestId >= block.timestamp ? latestId + 1 : block.timestamp`.
  - `queueRulesetsOf` guards `latestRulesetIdOf(projectId) < block.timestamp` before `_setup721`, so the first predicted ID equals `block.timestamp` and subsequent IDs increment by one.
  - `launchRulesetsFor` can only succeed when `latestRulesetIdOf(projectId) == 0`, which preserves the same alignment.

### FF-002: Malicious controller can bind hooks to the wrong project in `launchProjectFor`
- Verification: deep code trace
- Result: false positive
- Why eliminated:
  - `_launchProjectFor` predicts `PROJECTS.count() + 1` and reverts with `ProjectIdMismatch` unless the controller returns exactly that ID.
  - Any mismatch reverts the whole transaction, rolling back hook deployment, mapping writes, and NFT minting.

### FF-003: Wildcard `MAP_SUCKER_TOKEN` permission grants broad registry escalation
- Verification: deep code trace
- Result: false positive
- Why eliminated:
  - The permission is granted for `account = address(this)` and `projectId = 0`, which lets the registry act on behalf of the deployer account only.
  - It does not grant the registry blanket project-owner rights.

### FF-004: Carry-forward path silently disables 721 handling when no prior hook exists
- Verification: deep code trace + test validation
- Result: false positive
- Why eliminated:
  - `_queueRulesetsOf` explicitly reverts with `JBOmnichainDeployer_InvalidHook()` if the carried-forward hook slot is zero.
  - The failure is loud and atomic rather than a silent misconfiguration.

## Downgraded Findings
- None.

## LOW Findings (verified by inspection)
- None reported.

## Summary
- Total functions analyzed: 31
- Raw findings (pre-verification): 0 CRITICAL | 2 HIGH | 2 MEDIUM | 0 LOW
- After verification: 0 TRUE POSITIVE | 4 FALSE POSITIVE | 0 DOWNGRADED
- Final: 0 HIGH | 0 MEDIUM | 0 LOW
