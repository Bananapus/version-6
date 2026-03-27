# N E M E S I S — Verified Findings

## Scope
- Language: Solidity
- Modules analyzed: `src/JBPermissionIds.sol`
- Functions analyzed: 0
- Coupled state pairs mapped: 4 semantic pair classes
- Mutation paths traced: 0 in-repo; boundary verification only
- Nemesis loop iterations: 2 baseline passes, 0 targeted re-passes (converged immediately after Pass 2)

## Nemesis Map (Phase 1 Cross-Reference)
| Constant | ID | Boundary invariant | Verification result |
|----------|----|--------------------|---------------------|
| `ROOT` | 1 | Cannot be granted by an operator to others or on wildcard project `0` | Verified in `JBPermissions` code and tests |
| `CASH_OUT_TOKENS` / `BURN_TOKENS` / `CLAIM_TOKENS` / `TRANSFER_CREDITS` | 4 / 11 / 12 / 13 | Must be checked against holder, not project owner | Verified at all core call sites |
| `SET_TERMINALS` | 15 | Must gate `setTerminalsOf`; `launchRulesetsFor` must also require it | Verified |
| `SET_BUYBACK_HOOK` | 28 | Intentionally gates both set and lock | Verified |
| `SET_ROUTER_TERMINAL` | 29 | Intentionally gates both set and lock | Verified |
| `SUCKER_SAFETY` / `SET_SUCKER_DEPRECATION` | 32 / 33 | Must remain separated between emergency hatch and deprecation | Verified |
| All constants | 1-33 | Unique, sequential, `uint8`, non-zero | Verified |

## Verification Summary
| ID | Source | Coupled Pair | Breaking Op | Severity | Verdict |
|----|--------|-------------|-------------|----------|---------|
| — | — | — | — | — | No verified findings |

## Verified Findings (TRUE POSITIVES only)
- None.

## Feedback Loop Discoveries
- None. The full Feynman pass exposed no executable-logic suspect inside this repo, and the state pass found no boundary desynchronization between constant definitions and downstream permission checks.

## False Positives Eliminated
- None.

## Downgraded Findings
- None.

## Summary
- Total functions analyzed: 0
- Coupled state pairs mapped: 4 semantic pair classes
- Nemesis loop iterations: 2 total passes
- Raw findings (pre-verification): 0 C | 0 H | 0 M | 0 L
- Feedback loop discoveries: 0
- After verification: 0 TRUE POSITIVE | 0 FALSE POSITIVE | 0 DOWNGRADED
- Final: 0 CRITICAL | 0 HIGH | 0 MEDIUM | 0 LOW

## Verification Evidence

### Library integrity
- All constants are `uint8 internal constant` values from `1` through `33` in [`src/JBPermissionIds.sol`](/Users/jango/Documents/jb/v6/evm/nana-permission-ids-v6/src/JBPermissionIds.sol#L9).
- Sequential uniqueness check passed on `2026-03-23`:
  - `PASS: All 33 IDs are unique and sequential (1-33)`
- Local compilation passed on `2026-03-23`:
  - `forge build`

### ROOT safety
- `JBPermissions.setPermissionsFor` forbids operator-granted ROOT and wildcard-project permission sets via the same gate at [`JBPermissions.sol`](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBPermissions.sol#L62).
- `JBPermissions.hasPermission` and `hasPermissions` only treat ROOT as an override during reads, not writes, at [`JBPermissions.sol`](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBPermissions.sol#L122) and [`JBPermissions.sol`](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBPermissions.sol#L193).
- Runtime confirmation passed:
  - `forge test --match-path test/TestPermissionsEdge.sol`
  - `forge test --match-path test/PermissionEscalation.t.sol`

### Holder-scoped permissions
- `BURN_TOKENS` is checked against `holder` in [`JBController.sol`](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBController.sol#L236).
- `CLAIM_TOKENS` is checked against `holder` in [`JBController.sol`](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBController.sol#L270).
- `TRANSFER_CREDITS` is checked against `holder` in [`JBController.sol`](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBController.sol#L691).
- `CASH_OUT_TOKENS` is checked against `holder` in [`JBMultiTerminal.sol`](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol#L263).

### Owner-scoped and dual-purpose permissions
- `LAUNCH_RULESETS` and `SET_TERMINALS` are both required in [`JBController.sol`](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBController.sol#L418).
- `SET_CONTROLLER`, `SET_PRIMARY_TERMINAL`, and `SET_TERMINALS` map correctly in [`JBDirectory.sol`](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBDirectory.sol#L94), [`JBDirectory.sol`](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBDirectory.sol#L175), and [`JBDirectory.sol`](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBDirectory.sol#L204).
- `SET_BUYBACK_HOOK` gates both lock and set in [`JBBuybackHookRegistry.sol`](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHookRegistry.sol#L125) and [`JBBuybackHookRegistry.sol`](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHookRegistry.sol#L172).
- `SET_ROUTER_TERMINAL` gates both lock and set in [`JBRouterTerminalRegistry.sol`](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/src/JBRouterTerminalRegistry.sol#L304) and [`JBRouterTerminalRegistry.sol`](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/src/JBRouterTerminalRegistry.sol#L405).
- `SUCKER_SAFETY`, `SET_SUCKER_DEPRECATION`, `MAP_SUCKER_TOKEN`, and `DEPLOY_SUCKERS` map correctly in [`JBSucker.sol`](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol#L404), [`JBSucker.sol`](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol#L631), [`JBSucker.sol`](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol#L881), and [`JBSuckerRegistry.sol`](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSuckerRegistry.sol#L195).
