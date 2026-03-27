# State Inconsistency Audit — Verified Findings

## Coupled State Dependency Map
| Pair | Invariant | Mutation Points |
|----|----|----|
| `_poolKeyOf[projectId][terminalToken]` ↔ `_poolIsSet[projectId][terminalToken]` | A non-zero configured pool must only be considered active once the one-shot flag is set | `_setPoolFor` |
| `_poolKeyOf[...]` ↔ `twapWindowOf[...]` | Pool configuration and TWAP window must be initialized together for a new pair | `_setPoolFor` |
| `projectTokenOf[projectId]` ↔ `_poolKeyOf[...]` | Cached project token must match the token embedded in every configured pool key | `_setPoolFor` |
| Hook terminal-token balance delta ↔ `addToBalanceOf` refund ↔ `partialMintTokenCount` | Unswapped leftovers must be returned to terminal accounting before minting from the same balance delta | `afterPayRecordedWith` |
| Swap output amount ↔ `burnTokensOf` ↔ `mintTokensOf(..., useReservedPercent=true)` | Buyback path must apply the same reserved-percent economics as direct minting | `_swap`, `afterPayRecordedWith` |
| Burned cash-out amount ↔ remint-to-hook ↔ pool sell proceeds | Sell-side cash-out must remint exactly the burned amount before swapping | `afterCashOutRecordedWith` |
| `_hookOf[projectId]` ↔ `hasLockedHook[projectId]` | Once locked, a project's resolved hook cannot be changed | `setHookFor`, `lockHookFor` |
| `defaultHook` ↔ `isHookAllowed[defaultHook]` | Active default must remain allowlisted | `setDefaultHook`, `disallowHook` |

## Mutation Matrix
| State Variable | Mutating Function | Updates Coupled State? |
|----|----|----|
| `_poolKeyOf` | `_setPoolFor` | Yes: sets `_poolIsSet`, `twapWindowOf`, `projectTokenOf` |
| `_poolIsSet` | `_setPoolFor` | Yes: written alongside `_poolKeyOf` |
| `twapWindowOf` | `_setPoolFor` | Yes: initial sync with pool config |
| `twapWindowOf` | `setTwapWindowOf` | Intended standalone update after pool setup |
| `projectTokenOf` | `_setPoolFor` | Yes: synchronized with configured pool |
| Hook token balance | `afterPayRecordedWith`, `unlockCallback`, `_swap` | Yes: refunded via `addToBalanceOf`, then minted from delta |
| `_hookOf` | `setHookFor`, `lockHookFor` | Yes: lock path snapshots default into project slot |
| `defaultHook` | `setDefaultHook` | Yes: also marks allowlist entry |
| `isHookAllowed` | `allowHook`, `disallowHook`, `setDefaultHook` | Yes: default hook cannot be disallowed |

## Parallel Path Comparison
| Coupled State | Path A | Path B | Verdict |
|----|----|----|----|
| Pool config | `initializePoolFor` | `setPoolFor` | Both end in `_setPoolFor`; synchronized |
| Buy execution | Successful V4 swap | Failed V4 swap | Both preserve token conservation; failure path returns leftovers then mints |
| Cash-out routing | Protocol reclaim | Pool sell | Sell path remints exact burned amount; no partial-state gap |
| Registry resolution | Project hook set | Default hook fallback | `hookOf`, `beforePayRecordedWith`, and `hasMintPermissionFor` resolve consistently |

## Verification Summary
| ID | Coupled Pair | Breaking Op | Original Severity | Verdict | Final Severity |
|----|-------------|-------------|-------------------|---------|----------------|
| SI-001 | `_poolKeyOf` ↔ `_poolIsSet` | `beforePayRecordedWith` explicit quote path | LOW | FALSE POSITIVE | — |
| SI-002 | `_hookOf` ↔ `defaultHook` ↔ `hasLockedHook` | registry forwarding with no hook | LOW | FALSE POSITIVE | — |

## Verified Findings
None.

## False Positives Eliminated

### SI-001: Explicit quote path desynchronizes pool activation from stored pool metadata
**Severity:** LOW hypothesis
**Verification:** Code trace

**Coupled Pair:** `_poolKeyOf[projectId][terminalToken]` ↔ `_poolIsSet[projectId][terminalToken]`
**Invariant:** A pool should only be executable when the one-shot activation flag is set.

**Breaking operation candidate:** [src/JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol#L746)

Why it is not a true positive:
- The explicit-quote branch reads a `poolId` from raw storage before `_getQuote` enforces `_poolIsSet`.
- That creates an informational mismatch in `beforePayRecordedWith`, but execution still uses the stored `PoolKey` in `_swap`.
- Without `_poolIsSet`, the stored key is zeroed, `POOL_MANAGER.unlock(...)` reverts, and `_swap` falls back safely.
- The downstream balance-delta/refund logic keeps terminal accounting synchronized.

### SI-002: Registry can resolve no hook on pool-forwarding paths
**Severity:** LOW hypothesis
**Verification:** Code trace + deployment review

**Coupled Pair:** `_hookOf[projectId]` ↔ `defaultHook`
**Invariant:** Registry forwarding should only call a concrete resolved hook.

**Breaking operation candidate:** [src/JBBuybackHookRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHookRegistry.sol#L196)

Why it is not a true positive:
- The state relationship is only unsafe in an uninitialized operator configuration where neither a project hook nor a default hook exists.
- The shipped deployment flow sets the default hook immediately after deploying both contracts.
- The previously dangerous path where an admin could clear the default hook has already been blocked by `disallowHook`.
- No attacker-controlled transition can desynchronize these states after normal deployment.

## Summary
- Coupled state pairs mapped: 8
- Mutation paths analyzed: 18
- Raw findings (pre-verification): 2 low-confidence hypotheses
- After verification: 0 TRUE POSITIVE | 2 FALSE POSITIVE
- Final: 0 CRITICAL | 0 HIGH | 0 MEDIUM | 0 LOW
