# State Inconsistency Audit — Verified Findings

## Coupled State Dependency Map
| Coupled Pair | Invariant |
|---|---|
| predicted ruleset ID ↔ `_tiered721HookOf[projectId][rulesetId]` | each ruleset must resolve to the correct 721 hook config |
| predicted ruleset ID ↔ `_extraDataHookOf[projectId][rulesetId]` | each ruleset must resolve to the correct extra hook config |
| payment amount ↔ total tier split amount ↔ custom-hook amount ↔ final weight | only project-retained funds may influence mint weight |
| 721 cash-out outputs ↔ extra-hook cash-out inputs | later hook must receive already-updated tax/count/supply values |
| latest ruleset ID ↔ carried-forward 721 hook | queueing without new tiers must inherit the actual latest hook or revert |

## Mutation Matrix
| State Variable / Derived State | Mutating Function | Updates Coupled State? |
|---|---|---|
| `_tiered721HookOf[projectId][predictedId]` | `_setup721` | Yes |
| `_extraDataHookOf[projectId][predictedId]` | `_setup721` | Yes |
| carried-forward hook selection | `_queueRulesetsOf` | Yes, or loud revert |
| `projectAmount` / scaled weight | `beforePayRecordedWith` | Yes |
| composed cash-out tuple | `beforeCashOutRecordedWith` | Yes |

## Parallel Path Comparison
| Coupled State | `launchProjectFor` | `launchRulesetsFor` | `queueRulesetsOf` |
|---|---|---|---|
| ruleset ID prediction ↔ hook mapping | synced | synced | synced, guarded by same-block check |
| 721 hook ownership transfer | synced | synced | synced when new hook deployed |
| carry-forward hook validity | n/a | n/a | synced, zero-address blocked |

## Verification Summary
| ID | Coupled Pair | Breaking Op | Original Severity | Verdict | Final Severity |
|----|-------------|-------------|-------------------|---------|----------------|
| SI-001 | ruleset ID ↔ hook mappings | `_setup721` | HIGH | FALSE POSITIVE | — |
| SI-002 | latest ruleset ID ↔ carried hook | `_queueRulesetsOf` | MEDIUM | FALSE POSITIVE | — |
| SI-003 | split amount ↔ custom-hook amount ↔ weight | `beforePayRecordedWith` | MEDIUM | FALSE POSITIVE | — |

## Verified Findings

No verified true positives.

## False Positives Eliminated

### SI-001: `_setup721` can store hook configs under the wrong ruleset ID
- Verification: code trace
- Why eliminated:
  - `core-v6` ruleset allocation matches `block.timestamp + i` exactly in the only reachable launch/queue states this contract permits.
  - `queueRulesetsOf` rejects the conflicting same-block state that would otherwise desync the first predicted ID.

### SI-002: `queueRulesetsOf` can carry forward a stale zero-address hook
- Verification: code trace
- Why eliminated:
  - The function reverts when the carried-forward hook is zero instead of storing broken state.

### SI-003: `beforePayRecordedWith` can mint on the split-routed portion of a payment
- Verification: code trace + existing test coverage
- Why eliminated:
  - The custom hook receives `projectAmount` only.
  - Returned weight is rescaled by `projectAmount / totalAmount`.
  - When the split consumes the whole payment, the wrapper forces `weight = 0`.

## Summary
- Coupled state pairs mapped: 5
- Mutation paths analyzed: 10
- Raw findings (pre-verification): 3
- After verification: 0 TRUE POSITIVE | 3 FALSE POSITIVE
- Final: 0 CRITICAL | 0 HIGH | 0 MEDIUM | 0 LOW
