# Audit Report 2 — Amendment

Amendments and follow-on findings layered on top of `AUDIT_REPORT_2.md`.

Date started: 2026-05-20

## AMEND-01. `nana-core-v6`: pay-hook diversion on internal split destination bypasses `_feeFreeSurplusOf` round-trip prevention

Status: VERIFIED STRUCTURAL FINDING / FIXED IN WORKTREE

Severity: `MED` (protocol fee revenue leak; not a holder-fund loss)

Source: User-prompted adversarial review of `_feeFreeSurplusOf` round-trip prevention (2026-05-20). Audit row Z in
`AUDIT_REPORT.md` framed an adjacent bypass via a globally feeless router, which is no longer canonical
(see `deploy-all-v6/script/Verify.s.sol:1039-1046` — the router was explicitly removed from global feeless). This
amendment documents a different bypass that survives the current canonical wiring.

Affected code:

- [JBMultiTerminal.sol](nana-core-v6/src/JBMultiTerminal.sol:400) — `_feeFreeSurplusOf` increment in `executePayout`
- [JBMultiTerminal.sol](nana-core-v6/src/JBMultiTerminal.sol:425) — `_efficientPay` invocation
- [JBMultiTerminal.sol](nana-core-v6/src/JBMultiTerminal.sol:439) — `_capFeeFreeSurplus` post-pay cap
- [JBMultiTerminal.sol](nana-core-v6/src/JBMultiTerminal.sol:1132) — `_capFeeFreeSurplus` definition
- [JBMultiTerminal.sol](nana-core-v6/src/JBMultiTerminal.sol:1536) — `_fulfillPayHookSpecificationsFor`
- [JBMultiTerminal.sol](nana-core-v6/src/JBMultiTerminal.sol:1219) — zero-tax cashout consumes counter
- [JBTerminalStore.sol](nana-core-v6/src/JBTerminalStore.sol:1079) — `_computePayFrom` deducts hook spec amounts from
  `balanceDiff`
- [JBTerminalStore.sol](nana-core-v6/src/JBTerminalStore.sol:1098) — `balanceDiff -= specifiedAmount` per pay hook spec

Root cause:

- Same-terminal project-to-project split payouts skip the source-side fee. The protocol's only defense is
  `_feeFreeSurplusOf[B][token]`: a counter incremented at `executePayout` line 405-407 with the gross
  `netPayoutAmount`, intended to charge a 2.5% fee when project B later cashes out at zero tax.
- The pay path invoked by `_efficientPay` runs B's data hook. The data hook can return `JBPayHookSpecification[]`
  whose amounts are subtracted from `balanceDiff` in `_computePayFrom` (line 1098). The remaining hook-spec funds are
  delivered to the hook contract by `_fulfillPayHookSpecificationsFor`, bypassing B's `STORE.balanceOf` entry.
- `_capFeeFreeSurplus` then caps the counter at the project's *current* balance. When B had no prior balance, the
  counter is capped down to just `balanceDiff` (the un-diverted residue). The diverted portion is permanently
  off-counter and off-balance — it lives at the hook address with no fee liability tracked anywhere.
- Effect: a same-terminal split payout to a controlled project B can launder the source fee through a pay-hook
  diversion. A direct split recipient at `executePayout` line 449 would have paid the 2.5% fee; the pay-hook
  diversion variant pays ~0% (only on whatever fraction B's data hook chose to leave in `balanceDiff`).

Attack scenario (canonical):

- Eve creates project B on the same terminal as victim project A. B's ruleset uses Eve's data hook and pay hook H.
- A's owner configures a split with `split.projectId = B` (e.g., a payee designated as a JB project).
- `sendPayoutsOf(A, ...)` enters `executePayout` for the B split with `terminal == this`.
  - Line 405-407: `_feeFreeSurplusOf[B][token] += 100`.
  - Line 425-432: `_efficientPay(this, B, 100)` → `this.pay(B, 100)`.
  - In `_computePayFrom`, B's data hook returns `[{hook: H, amount: 99}]`. `balanceDiff = 1`. STORE credits B's
    balance by 1. `_fulfillPayHookSpecificationsFor` transfers 99 to H. H forwards to Eve.
  - Line 439: `_capFeeFreeSurplus(B)` reads `STORE.balanceOf(B) = 1`, caps counter from 100 to 1.
- Counter "owes" only 1 of fee-free liability. Eve has extracted 99 with zero protocol fee. A direct split to
  `split.beneficiary = Eve EOA` would have paid `_feeAmountFrom(100) = ~2.5`.

Compounding paths:

- **Chained drainage**: H pays into a third Eve-owned project C with 0% cashout tax. C's `_feeFreeSurplusOf` is not
  incremented by generic `pay()` (only `executePayout` writes the counter). C's surplus is now a fee-free pool.
- **Inflated-counter side effect when B has prior balance**: if B held balance `P > 0` before the split-pay,
  `_capFeeFreeSurplus` finds `min(counter, P + balanceDiff)` does not cap counter down. Counter stays at 100 even
  though only 1 is traceable to this internal pay. Innocent B-holders who later cash out at zero tax pay fee
  attributable to Eve's leak.
- **Cross-terminal variant**: same mechanism if the destination terminal is feeless for the source project
  (`isFeelessFor(to, A) == true`) at line 371. With per-project feeless wiring, this is owner-sanctioned, but the
  pay-hook drain on the destination terminal still leaks fees the source side skipped.

Asymmetry note (why cashout hooks are not the same):

- `_fulfillCashOutHookSpecificationsFor` at line 1481 takes `_feeAmountFrom(specification.amount)` from each spec
  unless the hook is per-project-feeless. So a non-feeless cashout hook on B pays fee on its spec amount — symmetric
  to a direct recipient. The pay path has no equivalent fee deduction on hook specs because pays are normally
  inbound (outside money), so the protocol does not charge a fee on hook-routed inflow. The bypass is precisely the
  edge where an inbound pay was internal-split-induced and the source fee was deferred to the counter.

Why it is real (not a misconfig):

- B's data hook is set by B's ruleset, controllable by anyone willing to deploy a project. The bypass does not
  require any sanctioned grant from FEELESS_ADDRESSES, any owner-only role on the source project A, or any
  governance flip. The only thing the attacker needs is to be the recipient of a same-terminal split payout from any
  honest project willing to use them as a payee.
- A direct payee (EOA or non-project contract) at line 441-454 pays the fee. Routing the same economic flow through
  a pay-hook-diverting project does not. The protocol's invariant "fee is paid once on any fund egress" is broken
  for this path.

Impact:

- Protocol fee revenue leak. Bounded above by 2.5% of every payout split that lands on a pay-hook-diverting
  destination project. Not a direct theft of holder principal.
- Inflated-counter side effect transfers fee burden onto innocent B-token holders during zero-tax cashout when B has
  prior balance.
- Pre-existing audit row Z framed a similar economic problem via the now-retired global-feeless router. This
  amendment shows the structural problem outlives that specific mitigation.

Hardening — recommended fix (Option 1 + Option 5 combined):

1. **Charge fee inline on pay-hook spec amounts when the pay was internal-split-induced.** Introduce a transient
   flag in `executePayout` set before `_efficientPay` and cleared after:

   ```solidity
   uint256 constant _INTERNAL_SPLIT_PAY_SLOT = uint256(keccak256("jb.internal-split-pay")) - 1;
   assembly { tstore(_INTERNAL_SPLIT_PAY_SLOT, 1) }
   _efficientPay(...);
   assembly { tstore(_INTERNAL_SPLIT_PAY_SLOT, 0) }
   ```

   In `_fulfillPayHookSpecificationsFor`, if the flag is set and the hook is not per-project-feeless, deduct
   `_feeAmountFrom(spec.amount)` from each spec, forward only the net to the hook, and route the fee to the fee
   beneficiary on the same path `_takeFeeFrom` already uses.

2. **Increment the counter by the actual `balanceDiff`, not the gross `netPayoutAmount`.** Change line 405-407 to
   capture `balanceBefore = STORE.balanceOf(this, B, token)`, run `_efficientPay`, then increment by
   `STORE.balanceOf(this, B, token) - balanceBefore`. Removes the inflated-counter side effect that punishes
   innocent B-holders, and eliminates the need for the post-pay `_capFeeFreeSurplus` call in this branch.

Combined effect: pay-hook diversion during internal split pay charges the same fee as a direct recipient, and the
counter never carries phantom liability for funds that already left.

Alternative fixes considered and rejected:

- **Ban pay-hook diversion during internal split pay** (revert if `hookSpecifications.length != 0` when the flag is
  set): too strict, breaks legitimate data-hook behavior on destination projects.
- **Take source fee inline on every internal split, retire the counter entirely**: structurally cleanest but
  changes economics — projects relying on fee-free internal routing pay the standard 2.5% on every split. Out of
  scope for a fix that preserves the existing UX promise.
- **Propagate fee-free liability to the pay-hook recipient address** (track `_feeFreeSurplusOf` keyed on hook
  contract, settle on later JB ingress): too invasive, requires hook-author cooperation.

Verification — recommended regression:

- `nana-core-v6/test/regression/RegressionPayHookSplitDrainBypass.t.sol`:
  - Deploy projects A and B on the same `JBMultiTerminal`.
  - B's data hook returns a single `JBPayHookSpecification` routing 99% of pay amount to a test pay hook contract H
    that records receipts.
  - Pay project A surplus; configure split with `split.projectId = B` for the full payout amount.
  - Assert: after `sendPayoutsOf(A)`, `H.received() ≈ 99% * payoutAmount`,
    `STORE.balanceOf(this, B, token) ≈ 1% * payoutAmount`, `_feeFreeSurplusOf(B, token) ≈ 1% * payoutAmount`.
  - Assert: total protocol fee paid (fee-beneficiary project balance delta) on `sendPayoutsOf(A)` plus subsequent
    B 0%-cashout-tax full cashout is *strictly less than* `_feeAmountFrom(payoutAmount)` (the fee a direct-recipient
    split would have paid).
  - Post-fix variant: with Option 1 applied, assert equality (within rounding) between the two paths.

Also re-check while in this area:

- `recordAddedBalanceFor` cannot invoke a data hook that diverts (confirm `_efficientAddToBalance` branch is safe).
- Sucker inbound `addToBalanceOf` does not need to settle stale `_feeFreeSurplusOf` cross-chain (confirm cross-chain
  surplus arrives via `recordAddedBalanceFor` and is treated as outside money).
- Migration delete at `JBMultiTerminal.sol:546` correctly settles the counter by charging the 2.5% fee on the full
  balance when migrating to a non-feeless terminal (already verified during this review — migration is not a bypass
  under current code; GEM_AUDIT_REPORT 4.6's framing is stale relative to lines 560-574).

Fix applied:

- `JBMultiTerminal.executePayout(...)` now marks same-terminal split pays before `_efficientPay(...)`.
- `_pay(...)` consumes and clears that transient marker before untrusted destination hooks can reenter ordinary pay
  flows, starts the fee-free surplus counter at the gross internal pay amount, and passes the source project into pay
  hook fulfillment.
- `_fulfillPayHookSpecificationsFor(...)` nets non-feeless pay-hook forwards during internal split pays, records their
  gross amounts as source-side fee-eligible value, and exposes the net forwarded amount in both hook context and event
  data.
- After `_efficientPay(...)`, the split payout path adds the hook-forward gross amounts to the current payout's
  protocol-fee basis and caps `_feeFreeSurplusOf` to the destination balance that actually remains.

Verification:

- `forge test --root nana-core-v6 --match-path test/TestFeeFreeCashOutBypass.sol --fail-fast --summary --detailed`:
  11 passed, including `testPayHookForwardFromInternalSplitPaysFeeAndTracksOnlyResidue`.
- `forge test --root nana-core-v6 --match-path test/regression/FeeFreeSurplusLifecycle.t.sol --fail-fast --summary --detailed`:
  2 passed.
- `forge test --root nana-core-v6 --match-path test/invariants/Phase3DeepInvariant.t.sol --match-test invariant_P3_4_tokenSupplyBoundedByBalance --fail-fast --summary --detailed`:
  1 invariant passed at 1024 runs and 102400 calls after scoping the stale invariant to the pre-outflow phase.
- `forge test --root nana-core-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`: full suite
  passed.
- `halmos --root nana-core-v6 --contract HalmosSmoke --solver-threads 1 --solver-timeout-assertion 30s --statistics`:
  5 symbolic fee checks passed.
- `forge build --root nana-core-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**'`: passed; note
  `JBMultiTerminal` is tight at 24,566 runtime bytes with 10 bytes of margin.
