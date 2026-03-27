# Feynman Audit — Verified Findings

## Scope
- Language: Solidity
- Modules analyzed:
  - `src/JBUniswapV4Hook.sol`
  - `src/libraries/Oracle.sol`
  - `script/Deploy.s.sol`
  - `script/helpers/Univ4RouterDeploymentLib.sol`
- Functions analyzed: 34

## Verification Summary

No verified true-positive findings.

## Function-State Matrix

Key high-risk functions reviewed:
- `calculateExpectedTokensWithCurrency`
  - Reads ruleset weight, reserved percent, price feed, token decimals.
- `_beforeSwap`
  - Reads token/project mapping, route estimates, terminal availability, hookData.
  - Calls `_routeThroughJuicebox(...)` only when JB output is strictly better.
- `_routeThroughJuicebox`
  - Writes `_routing`, takes tokens from PoolManager, calls terminal, settles output.
- `_recordObservation`
  - Updates oracle ring-buffer state and cardinality growth.
- `Oracle.write` / `Oracle.observeSingle`
  - Maintain observation ordering and TWAP interpolation.

## Guard Consistency Analysis

No missing sibling guard produced a verified issue.

Reviewed specifically:
- `_beforeSwap` exact-input restriction versus `_afterSwap` post-check behavior.
- `_routing` guard on recursive re-entry.
- oracle cardinality zero checks in `observe(...)` and `grow(...)`.

## Inverse Operation Parity

No broken inverse pair was confirmed.

Reviewed specifically:
- `_afterInitialize` versus `_recordObservation`
- JB-routed swap path versus V4 passthrough path
- buy-path approval/pay flow versus sell-path cashout flow

## Verified Findings

None.

## False Positives Eliminated

- Static pay-side weight estimation divergence:
  - Repo-documented composition limit with pay-side data hooks, not a newly uncovered bug.
- `_routing` persistence on revert:
  - Reverts unwind the storage flag.
- oracle growth / same-block write drift:
  - Ring-buffer state remains coherent by design.

## Downgraded Findings

None.

## LOW Findings (verified by inspection)

None promoted to a reportable low-severity finding in this round.

## Summary
- Raw Feynman candidates: 5
- Verified true positives: 0
- False positives / documented accepted behaviors: 5
- Final: 0 critical, 0 high, 0 medium, 0 low
