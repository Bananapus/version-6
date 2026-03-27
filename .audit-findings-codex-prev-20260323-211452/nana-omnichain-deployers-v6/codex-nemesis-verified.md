# N E M E S I S — Verified Findings

## Scope
- Language: Solidity
- Modules analyzed:
  - `src/JBOmnichainDeployer.sol`
  - `src/interfaces/IJBOmnichainDeployer.sol`
  - `src/structs/*.sol`
  - `script/Deploy.s.sol`
  - `script/helpers/DeployersDeploymentLib.sol`
- Functions analyzed: 31 executable functions
- Coupled state pairs mapped: 5
- Mutation paths traced: 10
- Nemesis loop iterations: 4 passes total (Feynman full, State full, Feynman targeted, State targeted)

## Nemesis Map (Phase 1 Cross-Reference)
| Function | Writes / Controls A | Writes / Controls B | A↔B Pair | Sync Status |
|---|---|---|---|---|
| `_setup721` | `_tiered721HookOf[projectId][predictedId]` | `_extraDataHookOf[projectId][predictedId]` | predicted ruleset ID ↔ hook configs | SYNCED |
| `_queueRulesetsOf` | carried-forward `hook` selection | predicted ruleset IDs in `_setup721` | latest ruleset ID ↔ current hook | SYNCED |
| `beforePayRecordedWith` | `projectAmount` | scaled `weight` + merged hook specs | payment amount ↔ split amount ↔ mint weight | SYNCED |
| `beforeCashOutRecordedWith` | 721-adjusted tuple | extra-hook-adjusted tuple | cash-out values ↔ sequential hook composition | SYNCED |
| `_launchProjectFor` | predicted `projectId` | post-launch hook ownership / NFT transfer | project creation ↔ ownership finalization | SYNCED |

## Verification Summary
| ID | Source | Coupled Pair | Breaking Op | Severity | Verdict |
|----|--------|-------------|-------------|----------|---------|
| NM-001 | Feynman→State | predicted ruleset ID ↔ hook mappings | `_setup721` | HIGH | FALSE POSITIVE |
| NM-002 | Feynman-only | projectId prediction ↔ controller return | `_launchProjectFor` | HIGH | FALSE POSITIVE |
| NM-003 | State-only | latest ruleset ID ↔ carried hook | `_queueRulesetsOf` | MEDIUM | FALSE POSITIVE |
| NM-004 | Cross-feed P1→P2 | split amount ↔ custom-hook amount ↔ weight | `beforePayRecordedWith` | MEDIUM | FALSE POSITIVE |

## Verified Findings (TRUE POSITIVES only)

No verified true positives.

## Feedback Loop Discoveries
- The highest-value cross-feed candidate was the interaction between 721 split routing and custom-hook mint weight in `beforePayRecordedWith`.
- Targeted re-interrogation showed the wrapper’s `projectAmount` reduction and post-hook rescaling preserve the intended invariant, so the candidate was eliminated.

## False Positives Eliminated
- `NM-001`: ruleset ID prediction desync rejected by reachable-state analysis against `core-v6`.
- `NM-002`: malicious controller misbinding rejected by `ProjectIdMismatch` and atomic revert.
- `NM-003`: carry-forward zero hook rejected by explicit revert.
- `NM-004`: split-induced overmint rejected by code trace and test verification.

## Downgraded Findings
- None.

## Summary
- Total functions analyzed: 31
- Coupled state pairs mapped: 5
- Nemesis loop iterations: 4 passes
- Raw findings (pre-verification): 0 C | 2 H | 2 M | 0 L
- Feedback loop discoveries: 1 candidate, 0 surviving
- After verification: 0 TRUE POSITIVE | 4 FALSE POSITIVE | 0 DOWNGRADED
- Final: 0 CRITICAL | 0 HIGH | 0 MEDIUM | 0 LOW
