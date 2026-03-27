# N E M E S I S — Raw Working Notes

## Scope
- Language: Solidity 0.8.26
- Files in scope:
  - `src/JBOmnichainDeployer.sol`
  - `src/interfaces/IJBOmnichainDeployer.sol`
  - `src/structs/JBDeployerHookConfig.sol`
  - `src/structs/JBOmnichain721Config.sol`
  - `src/structs/JBSuckerDeploymentConfig.sol`
  - `src/structs/JBTiered721HookConfig.sol`
  - `script/Deploy.s.sol`
  - `script/helpers/DeployersDeploymentLib.sol`

## Phase 0 — Recon

### Attack Goals
1. Break hook routing so 721/sucker behavior silently disables and users lose mint/cash-out invariants.
2. Escalate sucker privileges into unauthorized 0% cash-out tax or mint rights.
3. Misconfigure deployment so a canonical omnichain deployer is deployed with wrong dependency addresses or wrong deterministic salt.
4. Desync predicted ruleset IDs from stored hook mappings so pay/cash-out routing hits stale or zero config.

### Novel Code
- `src/JBOmnichainDeployer.sol`
  - Custom wrapper over core ruleset data hooks, 721 hook composition, sucker mint/tax bypass, and ruleset ID prediction.
- `script/Deploy.s.sol`
  - Deterministic CREATE2 deployment path that wires three external deployment registries together.

### Value Stores / Couplings
- `_tiered721HookOf[projectId][rulesetId]` ↔ actual ruleset IDs allocated by `core-v6`.
- `_extraDataHookOf[projectId][rulesetId]` ↔ the original per-ruleset custom hook metadata.
- `context.amount.value` ↔ 721 split amount ↔ forwarded `projectAmount` ↔ scaled mint `weight`.
- `cashOutTaxRate / cashOutCount / totalSupply` ↔ sequential 721-hook then extra-hook cash-out composition.
- project ownership NFT temporarily held by deployer ↔ later `transferOwnershipToProject` / `PROJECTS.transferFrom`.
- deterministic salts ↔ `_msgSender()` under ERC-2771 forwarding.

### Priority Targets
1. `_setup721`, `_queueRulesetsOf`, `_launchRulesetsFor`
2. `beforePayRecordedWith`, `beforeCashOutRecordedWith`, `hasMintPermissionFor`
3. `launchProjectFor` controller trust and ownership-transfer ordering
4. `script/Deploy.s.sol` dependency wiring and CREATE2 deploy guard

## Pass 1 — Feynman Suspects

### Function-State Matrix (condensed)
| Function | Reads | Writes | External Calls | Notes |
|---|---|---|---|---|
| `beforeCashOutRecordedWith` | hook mappings, sucker registry | none | registry + 721 hook + custom hook | Sequential hook composition |
| `beforePayRecordedWith` | hook mappings | none | 721 hook + custom hook | Weight scaling after tier splits |
| `hasMintPermissionFor` | hook mappings, sucker registry | none | registry + custom hook | Sucker override first |
| `deploySuckersFor` | project owner | none | projects + sucker registry | Permissioned |
| `_launchProjectFor` | project count | hook mappings | hook deployer + controller + ownable + registry + projects | Most complex path |
| `_launchRulesetsFor` | project owner, directory | hook mappings | projects + controller + hook deployer + ownable | Launch path for existing project |
| `_queueRulesetsOf` | latest ruleset ID, prior hook | hook mappings | projects + controller + hook deployer + ownable | Same-block prediction guard |
| `_setup721` | incoming metadata | `_tiered721HookOf`, `_extraDataHookOf` | none | Prediction keying at `block.timestamp + i` |
| `script/Deploy.deploy` | dependency deployment structs | none | constructor only | CREATE2 guard via `_isDeployed` |
| `DeployersDeploymentLib.getDeployment` | Sphinx network info, JSON files | none | local file reads | Off-chain helper only |

### Raw Hypotheses
1. `src/JBOmnichainDeployer.sol`
   - Hypothesis: `block.timestamp + i` ruleset-key prediction can drift from `core-v6` ruleset IDs and orphan hook mappings.
   - Status after trace: narrowed to a design assumption; no reachable mismatch in this repo's allowed call paths.
2. `src/JBOmnichainDeployer.sol`
   - Hypothesis: `launchProjectFor` trusts an arbitrary controller and could wire hooks onto the wrong project.
   - Status after trace: false positive for in-scope threat model; post-call `ProjectIdMismatch` check and atomic revert block silent misbinding.
3. `src/JBOmnichainDeployer.sol`
   - Hypothesis: constructor wildcard `MAP_SUCKER_TOKEN` grant lets the registry escalate privileges outside deployer-managed projects.
   - Status after trace: false positive; permission is scoped to `account = address(this)`, not arbitrary project owners.
4. `src/JBOmnichainDeployer.sol`
   - Hypothesis: carrying forward the prior 721 hook in `_queueRulesetsOf` can resolve to zero and silently disable 721 behavior.
   - Status after trace: false positive; explicit `InvalidHook` revert prevents silent carry-forward of zero.
5. `src/JBOmnichainDeployer.sol`
   - Hypothesis: pay/cash-out hook composition can double-count split amounts or mis-scale custom hook weights.
   - Status after trace + tests: false positive; 721 split amount is excluded from `projectAmount` before custom hook routing and weight rescaling preserves `weight=0`.
6. `src/JBOmnichainDeployer.sol`
   - Hypothesis: sucker bypass could suppress reverting hooks for arbitrary callers.
   - Status after trace + tests: false positive; bypass is gated strictly by `SUCKER_REGISTRY.isSuckerOf(projectId, addr)`.
7. `script/Deploy.s.sol`
   - Hypothesis: deterministic deploy guard could mis-detect deployment due to mismatched constructor args or deployer address.
   - Status after trace: false positive; `_isDeployed` hashes the exact creation code + constructor args + Sphinx safe address.

## Pass 2 — State Inconsistency Map

### Coupled State Dependency Map
| Pair | Invariant | Mutation Paths |
|---|---|---|
| predicted ruleset ID ↔ `_tiered721HookOf` entry | every queued/launched ruleset must resolve to the hook stored under its actual ID | `_setup721`, `_queueRulesetsOf`, `_launchRulesetsFor`, `_launchProjectFor` |
| predicted ruleset ID ↔ `_extraDataHookOf` entry | custom hook config must be retrievable under the same ruleset ID core uses | `_setup721` |
| total payment ↔ 721 split amount ↔ custom hook amount ↔ final weight | tokens minted must correspond only to the project-retained value | `beforePayRecordedWith` |
| 721 cash-out override ↔ extra hook override | later hook must receive already-updated values, not stale originals | `beforeCashOutRecordedWith` |
| project NFT held by deployer ↔ hook ownership transfer ↔ final owner transfer | deployer must not strand project or hook ownership on success | `_launchProjectFor` |
| queue carry-forward hook ↔ latest ruleset ID | new rulesets without new tiers must inherit the previous hook, not a stale/zero slot | `_queueRulesetsOf` |

### Mutation Matrix / Gaps Checked
- `_setup721` writes both `_tiered721HookOf` and `_extraDataHookOf` consistently for the same predicted key.
- `_queueRulesetsOf` either writes a fresh hook mapping or reuses a validated non-zero prior mapping.
- `_launchProjectFor` predicts `projectId`, writes hook mappings, then verifies the controller returned the same `projectId` before any success path completes.
- `beforeCashOutRecordedWith` feeds the 721-adjusted values into the extra hook via a mutable memory context, preventing stale-state composition.
- `beforePayRecordedWith` computes `projectAmount = total - tierSplits`, forwards only `projectAmount` to the custom hook, and rescales the hook-returned weight accordingly.

No state-gap candidate survived into a verified exploit.

## Targeted Loop Deltas

### Pass 3 — Feynman Re-Interrogation
- Re-checked why `_launchRulesetsFor` lacks the same-block `latestRulesetId` guard.
- Verified against `core-v6` that `launchRulesetsFor` is only callable when `latestRulesetIdOf(projectId) == 0`, so `block.timestamp + i` remains aligned with `JBRulesets.queueFor`.
- Re-checked whether `hasMintPermissionFor` should honor the extra hook only when pay/cash-out flags are enabled.
- No exploit path found: hook-side mint permission is intentionally independent of pay/cash-out flags.

### Pass 4 — State Re-Analysis
- Re-traced all paths touching the predicted ruleset ID coupling after the Pass 3 controller/ruleset review.
- No new coupled pairs or missing update paths surfaced.

## Convergence
- New findings after Pass 4: 0
- New coupled pairs after Pass 4: 0
- New suspects after Pass 4: 0

Audit converged with no verified true positives.
