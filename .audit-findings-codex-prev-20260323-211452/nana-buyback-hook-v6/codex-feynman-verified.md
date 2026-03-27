# Feynman Audit — Verified Findings

## Scope
- Language: Solidity 0.8.26
- Files analyzed: 9 Solidity files under `src/` and `script/`
- Primary logic modules: `JBBuybackHook`, `JBBuybackHookRegistry`, `JBSwapLib`, `DeployScript`, `BuybackDeploymentLib`
- Functions interrogated: 77 total function definitions in scope

## Verification Summary
| ID | Original Severity | Verdict | Final Severity |
|----|-------------------|---------|----------------|
| FF-001 | LOW | FALSE POSITIVE | — |
| FF-002 | LOW | FALSE POSITIVE | — |

## Function-State Matrix
| Function | Reads | Writes | Guards | External Calls |
|----|----|----|----|----|
| `JBBuybackHook.beforePayRecordedWith` | ruleset, price feed, pool key, TWAP window, project token | none | none | controller, prices |
| `JBBuybackHook.afterPayRecordedWith` | hook metadata, terminal balances, ruleset | terminal balance via `addToBalanceOf`, project token supply via controller | terminal-only | terminal, controller, pool manager, ERC20 |
| `JBBuybackHook.beforeCashOutRecordedWith` | project token, pool config, protocol reclaim inputs | none | none | none |
| `JBBuybackHook.afterCashOutRecordedWith` | pool config, hook metadata | project token supply via remint, pool-side settlement | terminal-only | controller, pool manager, ERC20/native transfer |
| `JBBuybackHook.initializePoolFor` / `setPoolFor` | project ownership, token registry, pool state | `_poolKeyOf`, `_poolIsSet`, `twapWindowOf`, `projectTokenOf` | `SET_BUYBACK_POOL` | pool manager |
| `JBBuybackHook.setTwapWindowOf` | ownership, current window | `twapWindowOf` | `SET_BUYBACK_TWAP` | none |
| `JBBuybackHook.unlockCallback` | swap callback params | none in hook storage | pool-manager-only | pool manager, ERC20 |
| `JBBuybackHookRegistry.beforePayRecordedWith` | `_hookOf`, `defaultHook` | none | none | resolved hook |
| `JBBuybackHookRegistry.beforeCashOutRecordedWith` | `_hookOf`, `defaultHook` | none | none | resolved hook |
| `JBBuybackHookRegistry.setHookFor` / `lockHookFor` / `setDefaultHook` | project ownership, allowlist | `_hookOf`, `hasLockedHook`, `defaultHook`, `isHookAllowed` | owner or `SET_BUYBACK_HOOK` | none |
| `DeployScript.run` / `deploy` | deployment registries, chain id | deploys registry + hook, sets default hook | Sphinx / script-only | core deployment libs, router deployment libs |

## Guard Consistency Analysis
- Pool mutation paths are consistently gated by `SET_BUYBACK_POOL` in both the registry and the hook.
- TWAP mutation is consistently gated by `SET_BUYBACK_TWAP`.
- Execution callbacks are consistently gated:
  - `afterPayRecordedWith` and `afterCashOutRecordedWith` require a valid project terminal.
  - `unlockCallback` requires `msg.sender == POOL_MANAGER`.
- Registry owner-only admin functions (`allowHook`, `disallowHook`, `setDefaultHook`) remain isolated from project-operator permissions.

## Inverse Operation Parity
- Buy side:
  - `beforePayRecordedWith` chooses route, `afterPayRecordedWith` executes it.
  - Swap success burns purchased project tokens before reminting with reserved-percent logic.
  - Swap failure falls back to minting on the terminal balance delta, preserving the no-worse-than-mint invariant.
- Sell side:
  - `beforeCashOutRecordedWith` chooses route, `afterCashOutRecordedWith` remints burned tokens and sells them.
  - No silent fallback exists on sell-side execution, so a bad swap reverts the whole cash-out instead of creating partial state.
- Registry:
  - `setHookFor` remains mutable until `lockHookFor`.
  - `lockHookFor` pins the resolved hook, including the default hook when no project-specific hook was set.

## Verified Findings (TRUE POSITIVES only)
None.

## False Positives Eliminated

### FF-001: Explicit quote path can fabricate a pool route when no pool is configured
**Original severity:** LOW
**Verdict:** FALSE POSITIVE
**Verification:** Code trace + invariant/test review

**Suspicious code:** [src/JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol#L746)

Reasoning:
- When the payer supplies explicit quote metadata, `beforePayRecordedWith` skips `_getQuote` and initializes `poolId` from the raw stored `PoolKey`.
- With no configured pool, that raw `PoolKey` is zeroed, so `toId()` yields a deterministic non-zero hash and the function can emit a pay-hook specification.
- This looked like a route-selection bug, but the execution path does not create a value-loss condition:
  - The actual swap uses `_poolKeyOf[...]` again in `_swap`, so the zeroed key is reused.
  - `POOL_MANAGER.unlock(...)` then reverts and `_swap` catches it, returning `(0, true)`.
  - `afterPayRecordedWith` skips the slippage check on `swapFailed`, computes the true leftover balance delta, returns the tokens to the terminal with `addToBalanceOf`, and mints only from the recovered balance delta.
- Result: the payer can at worst self-grief on gas by supplying an unusable explicit quote when no pool exists; they cannot extract funds, bypass slippage, or worsen other users' outcomes.
- Supporting evidence:
  - `swapFailed` fallback path in [src/JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol#L902)
  - Regression and invariant coverage for fallback + no-worse-than-mint behavior in `SwapFailureMintFallback.t.sol` and `BuybackHookInvariant.t.sol`

### FF-002: Registry pool-forwarders silently call address(0) if no hook is resolved
**Original severity:** LOW
**Verdict:** FALSE POSITIVE
**Verification:** Code trace + deployment-path review

**Suspicious code:** [src/JBBuybackHookRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHookRegistry.sol#L196)

Reasoning:
- `initializePoolFor` and `setPoolFor` resolve `_hookOf[projectId]` and then `defaultHook`, but they do not explicitly revert when both are zero.
- As isolated code, that is a misconfiguration footgun: the forwarding call can target `address(0)`.
- It is not a protocol vulnerability in the audited deployment model:
  - The production deployment script sets the default hook in the same deployment flow at [script/Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/script/Deploy.s.sol#L80).
  - The earlier default-clearing regression has already been fixed: `disallowHook` now reverts if asked to remove the current default.
  - The payment path regression coverage confirms the intended invariant that the default hook cannot be cleared into `address(0)`.
- Impact is limited to operator misconfiguration before initial setup, not attacker-controlled state corruption or fund loss.

## Downgraded Findings
None.

## LOW Findings (verified by inspection)
None.

## Summary
- Total functions analyzed: 77
- Raw findings (pre-verification): 0 CRITICAL | 0 HIGH | 0 MEDIUM | 2 LOW hypotheses
- After verification: 0 TRUE POSITIVE | 2 FALSE POSITIVE | 0 DOWNGRADED
- Final: 0 HIGH | 0 MEDIUM | 0 LOW
