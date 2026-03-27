# N E M E S I S — Verified Findings

## Scope
- Language: Solidity
- Modules analyzed:
  - `src/JBUniswapV4Hook.sol`
  - `src/libraries/Oracle.sol`
  - `script/Deploy.s.sol`
  - `script/helpers/Univ4RouterDeploymentLib.sol`
- Functions analyzed: 34
- Coupled state pairs mapped: 5
- Mutation paths traced: 9
- Nemesis loop iterations: 4 passes total

## Nemesis Map

| Function / Area | Primary Coupling | Status |
|---|---|---|
| `_beforeSwap` | route estimate ↔ terminal availability/output min | cleared |
| `_routeThroughJuicebox` | flash-accounting take ↔ settle ↔ delta | cleared |
| `_afterSwap` | realized V4 output ↔ `amountOutMin` | cleared |
| `_recordObservation` / `Oracle.write` | observation buffer ↔ state metadata | cleared |
| deployment script | hook flags ↔ mined address | cleared internally |

## Verification Summary

No verified true-positive findings.

## Verified Findings

None.

## Feedback Loop Discoveries

The only cross-feed items worth re-interrogating were:
- pay-side route estimation versus data-hook overrides
- oracle same-block dedup versus cardinality growth
- `_routing` mutation versus external-call failure

All three collapsed to documented behavior or false positive after trace review.

## False Positives Eliminated

| ID | Source | Reason Eliminated |
|---|---|---|
| NM-FP-1 | Feynman | pay-side static weight divergence is explicitly documented and accepted |
| NM-FP-2 | State | oracle growth transition is intentional and keeps invariants intact |
| NM-FP-3 | Cross-feed | `_routing` does not persist across revert paths |

## Downgraded Findings

None.

## Summary
- Raw findings: 0 critical, 0 high, 0 medium, 0 low that survived initial screening
- Feedback loop discoveries: 0
- After verification: 0 true positives, 0 downgraded, 3 closed false positives/documented behaviors
- Final: 0 critical, 0 high, 0 medium, 0 low

## Residual Risk / Testing Gap

- Hardcoded PoolManager addresses in `script/Deploy.s.sol` were reviewed for branching correctness, but not independently re-validated against external deployment records during this audit round.
