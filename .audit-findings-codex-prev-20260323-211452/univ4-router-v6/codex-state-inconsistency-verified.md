# State Inconsistency Audit — Verified Findings

## Coupled State Dependency Map

Mapped pairs:
1. `observations[poolId]` ↔ `states[poolId]`
2. `poolManager.take(...)` ↔ `_settleOutput(...)` ↔ returned `BeforeSwapDelta`
3. `_beforeSwap` route decision ↔ `_afterSwap` slippage enforcement
4. token normalization ↔ terminal-facing token selection
5. deployment flags ↔ mined hook address

## Mutation Matrix

| State Variable | Mutating Function | Coupled State Updated? |
|---|---|---|
| `states[poolId]` | `_afterInitialize` | yes |
| `states[poolId]` | `_recordObservation` | yes |
| `observations[poolId]` | `_afterInitialize` | yes |
| `observations[poolId]` | `_recordObservation` | yes |
| `_routing` | `_routeThroughJuicebox` | yes, revert-safe |

## Parallel Path Comparison

| Coupled State | Path A | Path B | Result |
|---|---|---|---|
| slippage enforcement | JB route in terminal call | V4 route in `_afterSwap` | coherent |
| oracle write cadence | after swap | after add/remove liquidity | coherent |
| flash-accounting settlement | JB route | V4 passthrough | coherent |

## Verification Summary

No verified state inconsistency findings.

## Verified Findings

None.

## False Positives Eliminated

- suspected desync between `cardinalityNext` and actual cardinality:
  - intended transitional state; no stale-read exploit identified.
- suspected slippage-state mismatch between `_beforeSwap` and `_afterSwap`:
  - split by route type, not a missing synchronization.
- suspected `_routing` state leak across terminal reverts:
  - reverted atomically.

## Summary
- Coupled state pairs mapped: 5
- Mutation paths analyzed: 9
- Raw findings: 0 surviving candidates
- Verified true positives: 0
- Final: 0 critical, 0 high, 0 medium, 0 low
