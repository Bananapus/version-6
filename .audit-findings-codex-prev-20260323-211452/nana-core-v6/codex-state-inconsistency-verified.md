# State Inconsistency Audit — Verified Findings

## Coupled State Dependency Map
- `JBTerminalStore.balanceOf` ↔ actual terminal token balances
- `usedPayoutLimitOf` ↔ `JBFundAccessLimits.payoutLimitOf`
- `usedSurplusAllowanceOf` ↔ `JBFundAccessLimits.surplusAllowanceOf`
- `JBTokens.totalCreditSupplyOf + token.totalSupply()` ↔ `JBTokens.totalSupplyOf`
- `JBController.pendingReservedTokenBalanceOf` ↔ `totalTokenSupplyWithReservedTokensOf`
- `JBDirectory._terminalsOf` ↔ `JBDirectory._primaryTerminalOf`
- `JBSplits._splitCountOf` ↔ packed split storage slots
- `JBRulesets.latestRulesetIdOf` ↔ packed intrinsic/user/metadata slots
- `JBMultiTerminal._heldFeesOf` ↔ `_nextHeldFeeIndexOf`
- `JBMultiTerminal._feeFreeSurplusOf` ↔ zero-tax cash-out fee accounting

## Mutation Matrix
- Reviewed every mutator touching the pairs above in:
  - `JBMultiTerminal`
  - `JBTerminalStore`
  - `JBController`
  - `JBDirectory`
  - `JBTokens`
  - `JBSplits`
  - `JBRulesets`
  - `JBFundAccessLimits`

## Parallel Path Comparison
- `sendPayoutsOf` vs `useAllowanceOf`: both reconcile terminal store balance before external transfers.
- `pay` vs `addToBalanceOf`: both update terminal-store balance through the same accounting context path.
- `mintTokensOf` vs `sendReservedTokensToSplitsOf`: reserved supply bookkeeping remained synchronized in traced paths.
- `setPrimaryTerminalOf` vs `setTerminalsOf`: primary-terminal fallback correctly checks membership before returning an explicit primary.

## Verification Summary
| ID | Coupled Pair | Breaking Op | Original Severity | Verdict | Final Severity |
|----|-------------|-------------|-------------------|---------|----------------|

No verified state-inconsistency findings in this round.

## False Positives Eliminated
- `JBMultiTerminal._heldFeesOf` / `_nextHeldFeeIndexOf`: re-read and pre-increment in `processHeldFeesOf(...)` prevents the obvious double-processing reentrancy path.
- `JBSplits` packed storage / `_splitCountOf`: stale slots are cleaned when split counts shrink, so I did not confirm a stale-read desync there.
- `JBDirectory._primaryTerminalOf` / `_terminalsOf`: explicit primary entries are ignored if the terminal is no longer in `_terminalsOf`, preventing the obvious dangling-primary inconsistency.

## Summary
- Coupled state pairs mapped: 10
- Mutation paths analyzed: 60+
- Raw findings (pre-verification): 0
- After verification: 0 TRUE POSITIVE | 0 FALSE POSITIVE
- Final: 0 CRITICAL | 0 HIGH | 0 MEDIUM | 0 LOW
