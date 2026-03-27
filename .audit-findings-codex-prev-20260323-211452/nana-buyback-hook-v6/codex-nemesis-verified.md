# N E M E S I S — Verified Findings

## Scope
- Language: Solidity 0.8.26
- Modules analyzed: `JBBuybackHook`, `JBBuybackHookRegistry`, `JBSwapLib`, interfaces/structs, `DeployScript`, `BuybackDeploymentLib`
- Solidity files analyzed: 9
- Functions analyzed: 77 total definitions in scope
- Coupled state pairs mapped: 8
- Mutation paths traced: 18
- Nemesis passes: 3 total
  - Pass 1: Feynman full
  - Pass 2: State full
  - Pass 3: targeted Feynman re-interrogation

## Nemesis Map (Phase 1 Cross-Reference)
| Function | Writes A | Writes B | A↔B Pair | Sync Status |
|----|----|----|----|----|
| `_setPoolFor` | `_poolKeyOf` | `_poolIsSet`, `twapWindowOf`, `projectTokenOf` | pool config | synced |
| `setTwapWindowOf` | `twapWindowOf` | — | pool key ↔ window | designed standalone update |
| `afterPayRecordedWith` | hook token balance delta | terminal refund, beneficiary mint count | leftover ↔ refund/mint | synced |
| `_swap` | project token balance via burn | remint in caller | bought tokens ↔ supply | synced |
| `afterCashOutRecordedWith` | remint count | sell proceeds | burned amount ↔ sell size | synced |
| `setHookFor` | `_hookOf` | — | hook ↔ lock/default | synced |
| `lockHookFor` | `hasLockedHook` | `_hookOf` default snapshot if needed | hook ↔ lock | synced |
| `setDefaultHook` | `defaultHook` | `isHookAllowed` | default ↔ allowlist | synced |

## Verification Summary
| ID | Source | Coupled Pair | Breaking Op | Severity | Verdict |
|----|--------|-------------|-------------|----------|---------|
| NM-001 | Feynman-only | `_poolKeyOf` ↔ `_poolIsSet` | `beforePayRecordedWith()` | LOW | FALSE POSITIVE |
| NM-002 | Feynman-only | `_hookOf` ↔ `defaultHook` | registry pool forwarders | LOW | FALSE POSITIVE |

## Verified Findings (TRUE POSITIVES only)
None.

## Feedback Loop Discoveries
None. The State pass did not expose any new broken coupled pairs beyond the two Feynman-originated suspects, and the targeted re-pass eliminated both on verification.

## False Positives Eliminated

### Finding NM-001: Explicit quote branch can emit a hook spec even when no pool is configured
**Severity:** LOW
**Source:** Feynman-only
**Verification:** Code trace

**Coupled Pair:** `_poolKeyOf[projectId][terminalToken]` ↔ `_poolIsSet[projectId][terminalToken]`
**Invariant:** A pool route is only executable when the configured pool is marked active.

**Feynman question that exposed it:**
> Why does `beforePayRecordedWith()` trust raw pool metadata before `_getQuote()` enforces `_poolIsSet`?

**State Mapper gap that checked it:**
> The explicit-quote path reads `poolId` from `_poolKeyOf` without consulting `_poolIsSet`.

**Breaking operation candidate:** [src/JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol#L746)

**Verification evidence:**
- The actual execution path still uses the stored pool key in `_swap()`.
- With no configured pool, `POOL_MANAGER.unlock(...)` reverts and `_swap()` returns `(0, true)`.
- `afterPayRecordedWith()` then skips the slippage check, computes the real leftover delta, returns value to the terminal, and mints from the recovered balance delta only.
- No attacker-controlled sequence produces fund loss, stale state, or a worse-than-mint outcome.

**Verdict:** FALSE POSITIVE. The branch is a self-griefing gas inefficiency at most, not a security issue.

### Finding NM-002: Registry pool-forwarding does not locally reject a missing resolved hook
**Severity:** LOW
**Source:** Feynman-only
**Verification:** Code trace

**Coupled Pair:** `_hookOf[projectId]` ↔ `defaultHook`
**Invariant:** The registry should forward only to a concrete resolved hook.

**Feynman question that exposed it:**
> Why do `initializePoolFor()` and `setPoolFor()` forward blindly after resolving `_hookOf` and `defaultHook`?

**State Mapper gap that checked it:**
> Pool-forwarding paths do not have the same explicit zero-hook passthrough used by `beforeCashOutRecordedWith()`.

**Breaking operation candidate:** [src/JBBuybackHookRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHookRegistry.sol#L196)

**Verification evidence:**
- The only unsafe case is an operator deploying or using the registry before assigning either a project-specific hook or a default hook.
- The shipped deployment flow sets the default hook immediately in [script/Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/script/Deploy.s.sol#L80).
- The earlier default-clearing route was already fixed; `disallowHook` cannot clear the active default.
- No attacker can move a correctly configured deployment into this state.

**Verdict:** FALSE POSITIVE. This is a setup precondition, not an exploitable protocol vulnerability.

## Downgraded Findings
None.

## Summary
- Total functions analyzed: 77
- Coupled state pairs mapped: 8
- Nemesis loop iterations: 1 targeted re-pass after the baseline passes
- Raw findings (pre-verification): 0 C | 0 H | 0 M | 2 L
- Feedback loop discoveries: 0
- After verification: 0 TRUE POSITIVE | 2 FALSE POSITIVE | 0 DOWNGRADED
- Final: 0 CRITICAL | 0 HIGH | 0 MEDIUM | 0 LOW

## Verification Notes
- Local verification passed on the non-fork suite:
  - `forge test --match-contract Registry`
  - `forge test --match-contract JBSwapLibTest`
  - `forge test --match-contract TestAuditGaps`
- Full `forge test` run: 148 tests passed.
- Remaining 5 failures were fork-only tests blocked by an unavailable RPC provider (`rpc.ankr.com` returned HTTP 401), not by local logic regressions.
