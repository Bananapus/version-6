# N E M E S I S — Raw Findings

## Phase 0 Recon
- Language: Solidity
- Attack goals:
  1. Turn treasury-side fees into user-side value during cash-out / borrow flows.
  2. Break loan accounting so borrowers can overdraw or avoid fee accrual.
  3. Misdeploy revnet infrastructure so new treasuries or fee sinks are silently miswired.
- Novel / high-density code:
  - `src/REVDeployer.sol`: custom pay/cash-out composition across 721 hook, buyback hook, and fee hook.
  - `src/REVLoans.sol`: loan accounting around virtual surplus/supply and multi-source debt normalization.
  - `script/Deploy.s.sol`: one-shot ecosystem deployment with hardwired fee project creation.
- Value stores:
  - Revnet terminal balances in `JBMultiTerminal` / `JBTerminalStore`
  - Loan accounting in `totalBorrowedFrom`, `totalCollateralOf`, `_loanOf`
  - Fee sink revnet configured by deployment script
- Priority targets:
  1. `REVDeployer.beforeCashOutRecordedWith`
  2. `REVLoans._adjust`, `_addTo`, `_totalBorrowedFrom`
  3. `DeployScript.deploy`

## Pass 1 — Feynman Suspects
1. `REVDeployer.beforeCashOutRecordedWith` splits `cashOutCount` for fee accounting, but core hooks may still consume the original count.
2. `REVLoans._adjust` refunds source fees on `terminal.pay` failure; candidate borrower fee bypass.
3. `DeployScript._isDeployed` appears incompatible with Sphinx runtime deployment.

## Pass 2 — State Cross-Check
1. Confirmed gap: reduced count passed into buyback route is not the same count consumed in the callback path.
2. Confirmed deployment-state mismatch: fee project creation is not synchronized with deployment reuse detection.
3. Source-fee refund path appears dependent on already-broken source-terminal behavior, not an unprivileged state gap.

## Targeted Re-Interrogation
- Why is the cash-out fee gap real?
  - Because `REVDeployer` mutates the count at the data-hook boundary, but `JBMultiTerminal` later forwards the original function argument into the hook callback boundary.
- What breaks downstream?
  - `JBBuybackHook.afterCashOutRecordedWith` remints and sells the full original count.

## Raw Finding Set
| ID | Severity | Status | Notes |
|----|----------|--------|-------|
| NM-RAW-001 | HIGH | Verified | Buyback cash-out fee tranche sold for beneficiary due callback-count mismatch |
| NM-RAW-002 | LOW | Verified | Sphinx deployment idempotence broken; fresh fee project always created |
| NM-RAW-003 | MEDIUM | Eliminated | Source-fee refund path requires trusted/broken source-terminal configuration |
