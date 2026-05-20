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
  flows, tracks only the post-hook retained amount as fee-free surplus, and passes the source project into pay hook
  fulfillment.
- `_fulfillPayHookSpecificationsFor(...)` nets non-feeless pay-hook forwards during internal split pays, records their
  gross amounts as source-side fee-eligible value, and exposes the net forwarded amount in both hook context and event
  data.
- After `_efficientPay(...)`, the split payout path adds the hook-forward gross amounts to the current payout's
  protocol-fee basis. The pay branch no longer needs a post-hoc cap because the counter is residue-only.

Verification:

- `forge test --root nana-core-v6 --match-path test/TestFeeFreeCashOutBypass.sol --fail-fast --summary --detailed`:
  13 passed, including `testPayHookForwardFromInternalSplitPaysFeeAndTracksOnlyResidue`,
  `testPayHookReentryCannotClobberInternalSplitFeeBasis`, and
  `testPayHookForwardOnlyTracksResidueWhenRecipientHasPriorBalance`.
- `forge test --root nana-core-v6 --match-path test/regression/FeeFreeSurplusLifecycle.t.sol --fail-fast --summary --detailed`:
  2 passed.
- `forge test --root nana-core-v6 --match-path test/invariants/Phase3DeepInvariant.t.sol --match-test invariant_P3_4_tokenSupplyBoundedByBalance --fail-fast --summary --detailed`:
  1 invariant passed at 1024 runs and 102400 calls after scoping the stale invariant to the pre-outflow phase.
- `forge test --root nana-core-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`: full suite
  passed.
- `halmos --root nana-core-v6 --contract HalmosSmoke --solver-threads 1 --solver-timeout-assertion 30s --statistics`:
  5 symbolic fee checks passed.
- `forge build --root nana-core-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**'`: passed; note
  `JBMultiTerminal` is tight at 24,552 runtime bytes with 24 bytes of margin.

Post-fix assessment (read-only review, 2026-05-20):

The in-tree implementation closes the original bypass and is structurally sound on the data-hook reentrancy
side. Specifically:

- `_internalSplitPayProjectId` (transient, `JBMultiTerminal.sol:154`) is cleared at the entry of `_pay`
  (line 1654-1655) before `STORE.recordPaymentFrom` invokes the destination data hook. A reentrant `pay()` from
  inside the data hook cannot inherit the split context.
- `_feeFreeSurplusOf[B][token]` starts at the gross same-terminal split pay amount in `_pay`, then the post-pay
  `_capFeeFreeSurplus` call trims the counter back to the destination balance that actually remains after pay-hook
  forwards. This avoids carrying liability for hook-diverted funds.
- `_fulfillPayHookSpecificationsFor:1579-1588` withholds `_feeAmountFrom(spec.amount)` from `forwardedAmount` when
  the pay is split-induced and the hook is not per-project-feeless for the source project. Hooks now receive net of
  fee, mirroring direct-recipient behavior at `executePayout:449`.
- Per-project feeless is keyed on the source project id (line 1682), which is the correct scope — A's owner can
  still designate specific hooks as fee-exempt for A.
- Cross-terminal pays remain unaffected because the destination terminal's transient slots are uncoupled from
  the source; the source-side fee at `executePayout:374-379` is still taken on the gross amount before egress.

Residual issue — fee-accumulator reentrancy in the former `_internalSplitPayFeeEligibleAmount` slot:

Status: FIXED IN WORKTREE

Severity: `LOW` (protocol fee revenue griefing; not theft)

The initial fix accumulated source-fee-eligible amounts in a separate transient slot,
`_internalSplitPayFeeEligibleAmount`, which was written before the untrusted pay-hook calls finished and later read
back by `executePayout`.

Attack:

- B's pay hook H (called during `_fulfillPayHookSpecificationsFor` as `afterPayRecordedWith`) reenters this terminal
  with any call that ultimately enters `executePayout` — e.g., `sendPayoutsOf` on a dummy project H controls.
- The nested `executePayout` at line 431 executes `_internalSplitPayFeeEligibleAmount = 0`, clobbering the outer
  scope's accumulated value.
- When control returns to the outer `executePayout:444`, it reads `_internalSplitPayFeeEligibleAmount` and sees `0`.
  Nothing is rolled into `feeEligibleAmount`, and the lib never delivers the source-fee for this pay to
  `_takeFeeFrom`.
- The `_feeAmountFrom(forwardedAmount)` already withheld at `_fulfillPayHookSpecificationsFor:1587` remains in the
  terminal's raw ERC-20 / native balance as orphaned dust — not credited to project 1, not stolen by the attacker.

Impact:

- Protocol fee revenue lost per occurrence (roughly the fee that would have been charged on the diverted hook
  amounts in that split-induced pay).
- Withheld fee becomes untracked terminal-contract dust. Slowly inflates the gap between
  `STORE.balanceOf(this, *, token)` and the terminal's raw token balance.
- Attacker incentive: griefing only — H already received its net of fee and gains nothing extra by zeroing the
  accumulator.

Why the source-side guarantee is broken but the destination-side guarantee is intact:

- The data-hook reentrancy hardening at `_pay:1654-1655` covers the destination-side flag (clears
  `_internalSplitPayProjectId` before recordPaymentFrom).
- The fee-eligible accumulator has no equivalent guard. It is written in `_pay` after the loop at 1671-1693, and
  the subsequent `_fulfillPayHookSpecificationsFor` call exposes it to reentrant overwrite.

Recommended fix (Option A — surgical):

- Stop routing the accumulator through a transient slot. Have `_pay` return `amountEligibleForFees` as a function
  return value; have `_efficientPay`'s same-terminal branch propagate the return up to `executePayout`; have
  `executePayout` accumulate it locally into `feeEligibleAmount`.
- The cross-boundary transient slot only exists because the call appeared to cross `this.pay(...)` in the original
  shape. In the current implementation `_efficientPay`'s same-terminal branch already invokes `_pay` directly
  (line 1369), so a plain return value is sufficient and is reentrancy-safe (lives on the caller's stack).

Alternative fix (Option B — keep the transient slot, add a guard):

- In `_pay`, after the accumulation loop (1671-1693), copy `_internalSplitPayFeeEligibleAmount` into a local, zero
  the slot, then restore-and-add the local value after `_fulfillPayHookSpecificationsFor` returns. Nested
  reentrancy that zeroes the slot mid-fulfillment is harmless because the outer scope re-adds the cached value.
- Less clean than Option A; preserves the transient-slot architecture if there's a reason to keep it.

Verification — recommended regression:

- `nana-core-v6/test/regression/RegressionInternalSplitPayFeeAccumulatorReentrancy.t.sol`:
  - Deploy projects A, B, and dummy project D (Eve-owned) on the same terminal.
  - B's data hook returns a pay hook spec routing X to malicious hook H.
  - H's `afterPayRecordedWith` triggers `sendPayoutsOf(D, ...)` on the same terminal (no funds needed; can revert
    inside the try-catch in the lib, just need to enter `executePayout` to hit the `= 0` write at line 431).
  - Pay project A surplus and configure split with `split.projectId = B` for the full payout amount.
  - Pre-fix assertion: project 1 (fee beneficiary) balance delta on this `sendPayoutsOf(A)` is strictly less than
    `_feeAmountFrom(diverted hook amount)`; terminal raw token balance includes the orphaned withheld fee dust.
  - Post-fix assertion (Option A applied): project 1 balance delta equals `_feeAmountFrom(diverted hook amount)`
    regardless of whether H reenters; terminal raw token balance matches sum of recorded project balances.

Also re-check while in this area:

- Any other transient-slot communication across hook-call boundaries (`_fulfillCashOutHookSpecificationsFor`,
  `executeProcessFee`, owner-leftover payout at `_sendPayoutsOf`) has the same shape. The cash-out hook fulfillment
  uses local-variable accumulation rather than transient slots; confirm by inspection of
  `_fulfillCashOutHookSpecificationsFor` that `amountEligibleForFees` is purely local-return.

Resolution applied:

- Option A, returning the value through `_pay`, hit Solidity stack pressure in `JBMultiTerminal` under the existing
  non-IR build constraints.
- The implemented fix uses the Option B shape but tightens it further for contract size: `_pay` consumes and clears
  `_internalSplitPayProjectId` before destination hooks, `_fulfillPayHookSpecificationsFor` keeps the gross
  hook-forward fee basis in a local variable while calling hooks, then reuses the already-cleared transient slot to
  return the fee basis to `executePayout` only after all untrusted hook calls finish.
- Added `testPayHookReentryCannotClobberInternalSplitFeeBasis` to `nana-core-v6/test/TestFeeFreeCashOutBypass.sol`.
  The hook performs a real nested `sendPayoutsOf(...)` while the outer pay hook is running, and the test asserts that
  the outer hook-forward fee still reaches project 1.

Verification after the residual fix:

- `forge fmt --root nana-core-v6 --check`: passed.
- `forge test --root nana-core-v6 --match-path test/TestFeeFreeCashOutBypass.sol --fail-fast --summary --detailed`:
  13 passed.
- `forge build --root nana-core-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**'`: passed;
  `JBMultiTerminal` is at 24,552 runtime bytes, 24 bytes under EIP-170.

Second-pass read-only review (2026-05-20):

Re-read the actual in-tree implementation including `_pay`, `_fulfillPayHookSpecificationsFor`,
`_capFeeFreeSurplus`, and the existing regressions. Two updates to the prior assessment:

1. **Reentrancy concern: not a real issue (already correctly handled).** The implementation accumulates
   `amountEligibleForFees` as a *stack-local* variable inside `_fulfillPayHookSpecificationsFor` (line 1560), keeps
   it there during all untrusted hook calls, and writes it to the transient slot `_internalSplitPayProjectId` only
   after the loop returns (line 1640). The same transient slot is reused: source-project id on the way in (consumed
   and cleared by `_pay:1668-1669` before any untrusted call) and post-fulfillment fee basis on the way out
   (read+deleted by `executePayout:443-444`). Nested reentrant `executePayout` performs the same write-after-loop
   pattern and deletes the slot before returning, so any value the inner left in the slot is overwritten by the
   outer's `_internalSplitPayProjectId = amountEligibleForFees`. `testPayHookReentryCannotClobberInternalSplitFeeBasis`
   in `nana-core-v6/test/TestFeeFreeCashOutBypass.sol:472` directly exercises this — a real nested `sendPayoutsOf`
   during the outer hook fulfillment — and asserts the outer hook-forward fee still reaches project 1. Confirmed
   passing. The earlier draft's "Residual issue — fee-accumulator reentrancy" section reflects a misread of the
   write site (assumed in `_pay`'s spec loop instead of post-fulfillment), and the slot-reuse trick is what makes
   the design reentrancy-safe.

2. **New residual issue: inflated `_feeFreeSurplusOf` when destination has prior balance** (replaces the retracted
   reentrancy concern).

Residual issue — gross-increment + post-hoc cap can leave the counter inflated when destination has prior balance:

Status: FIXED IN WORKTREE (source re-checked 2026-05-20; superseded my open-issue draft above)

Severity: `LOW` (would have over-charged innocent B-holders by up to ~2.5% of the diverted hook amount)

`_pay:1684` increments `_feeFreeSurplusOf[projectId][token] += tokenAmount.value` (the *gross* internal pay
amount), even when the destination data hook diverts most of the amount to non-feeless pay hooks. The fee on the
diverted portion is already paid inline via `_fulfillPayHookSpecificationsFor:1597-1599`, so the counter only needs
to track the residue (`balanceDiff = tokenAmount.value - Σ hookSpec.amount`).

`executePayout:449` calls `_capFeeFreeSurplus(split.projectId, token)`, which caps the counter at
`STORE.balanceOf(this, projectId, token)`. The cap only fires when `counter > balance`. When B has prior balance
`P > 0` from outside pays (which never increment the counter — those are outside money), the cap can fail to
reduce:

- Internal split A → B of 100. Hook H diverts 99, leaving `balanceDiff = 1`. New balance: `P + 1`.
- `counter[B]` was previously `C ≥ 0` (typically 0 for a project that mostly receives outside pays). After the
  increment, `counter = C + 100`.
- Cap: `min(C + 100, P + 1)`. If `P + 1 ≥ C + 100` (i.e., `P ≥ C + 99`), the cap is a no-op.
- Result: `counter[B] = C + 100`, but only 1 of the new counter delta is actually fee-deferred liability from this
  pay. The other 99 was already inline-fee-charged inside `_fulfillPayHookSpecificationsFor`.

Subsequent zero-tax cashout of B:

- `_cashOutTokensOf:1219-1238` charges fee on `min(reclaim, counter)`. With counter inflated by 99, a holder
  reclaiming `R ≥ 99` pays fee on at least 99 of pre-existing outside-pay surplus that *should* have been
  fee-free on cashout.
- Net protocol fee on the diverted 99: `2.475` (inline at hook forward) + `2.475` (cashout over-charge from the
  inflated counter) = `4.95`. Correct value is `2.5` (= inline only, since the residue 1 is the only fee-deferred
  liability from this internal split).
- Per-pay over-charge: `_feeAmountFrom(gross - balanceDiff) ≈ _feeAmountFrom(99) = 2.475` distributed over
  whichever B-holders cash out before the counter is depleted.

Why this is accidental over-charging rather than theft or grief:

- Eve (the depositor on A and operator of B's data hook) does not gain anything by inflating the counter. She
  already received the diverted hook amount net of inline fee. The over-charge falls on whoever cashes out B's
  tokens at zero tax after the diversion, and the protocol pockets the surplus.
- If Eve is the sole B-holder, the over-charge falls on her — she pays *more* than a direct-recipient split would
  have cost. She has no incentive to repeat this.
- If B's holders are unrelated to Eve, the protocol over-charges them. Eve doesn't gain; she just paid the inline
  fee for nothing extra. The funds flow protocol-ward, not Eve-ward.

Why the counter was incremented gross instead of by `balanceDiff`:

- The implementation comment at `_pay:1682-1683` calls out the design choice: "Start by treating the whole
  same-terminal split pay as fee-free. The pay-hook loop subtracts each forwarded amount because those funds leave
  the destination project immediately." But that subtraction was implemented in an earlier iteration that walked
  `hookSpecifications` inside `_pay`; the current iteration relies on `_capFeeFreeSurplus` to trim the counter
  post-hoc, which only works when destination balance is low enough that the cap binds.
- Given `JBMultiTerminal` is at 24,552 / 24,576 runtime bytes (24-byte EIP-170 margin per the Verification block
  above), the size constraint may have driven the trade-off — gross-increment-plus-cap is cheaper than
  iterating `hookSpecifications` again or doing a balanceBefore/balanceAfter STORE read.

Recommended fix:

- Increment the counter by `balanceDiff` (equivalently `tokenAmount.value - Σ hookSpec.amount`) at `_pay:1684`,
  not gross. Two implementation options:
  - Iterate `hookSpecifications` once to compute the sum. Identical logic to what
    `JBTerminalStore._computePayFrom:1082-1103` already does internally; the array is already in memory in `_pay`.
  - Read `STORE.balanceOf(this, projectId, token)` before and after `recordPaymentFrom` and use the delta. One
    extra STORE read.
- Drop the `_capFeeFreeSurplus(split.projectId, token)` call at `executePayout:449` for the pay branch — no longer
  needed because the counter never exceeds the residue. (The cap call after cashout at `_cashOutTokensOf:1272` is
  still useful as defense-in-depth for non-pay paths that may drain balance below the counter.)

Effect: `_feeFreeSurplusOf[B]` accurately tracks fee-deferred liability from same-terminal split pays, regardless
of B's prior balance. Future zero-tax cashouts charge fee only on the residue portion, eliminating the
accidental over-charge.

Trade-off note: the fix would re-introduce code in `_pay` (either the hookSpecifications walk or the balance read).
Worth checking whether either fits in the 24-byte EIP-170 margin or whether other code can be golfed to make room.

Verification — recommended regression:

- `nana-core-v6/test/regression/RegressionFeeFreeSurplusInflatedByPriorBalance.t.sol`:
  - Project B starts with prior balance `P ≥ 99 ether` from outside pays (a typical project that's been live for
    a while). Note: outside-pay holders own B-tokens proportional to P, so a third-party can cash out.
  - Project A internally splits `100 ether` to B with a diverting data hook (`99 ether` to non-feeless hook H,
    `1 ether` to B's balance).
  - Read `_feeFreeSurplusOf[B][NATIVE_TOKEN]` post-pay. Pre-fix: equals `100 ether`. Post-fix: equals `1 ether`.
  - An outside-pay holder cashes out their B-tokens at zero cashout tax for a reclaim `R` overlapping the
    inflated portion.
  - Pre-fix assertion: cashout fee paid = `_feeAmountFrom(min(R, 100 ether))` — fee charged on prior outside-pay
    funds.
  - Post-fix assertion: cashout fee paid = `_feeAmountFrom(min(R, 1 ether))` — fee charged only on the residue from
    the internal split.

Also re-check while in this area:

- Whether `_feeFreeSurplusOf` should ever exceed `balanceDiff` from a single pay. The intent of the round-trip
  prevention is to recover the *deferred* source fee on the *residue* portion that stayed in the destination's
  balance — the diverted portion already paid its source-equivalent fee inline. The current gross-increment
  inflates beyond intent whenever the cap doesn't bind.
- Whether other balance-mutating paths (held-fee returns at `_processFee:1746`, migrations, useAllowance) leave
  the counter > balance invariant intact. The post-cashout cap at `_cashOutTokensOf:1272` already handles cashout;
  spot-check the other paths.

Third-pass read-only review (2026-05-20):

On a fresh re-read of the in-tree source, the inflated-counter concern above is **already addressed** —
my earlier read missed the updated logic. Recording the verified state so the prior "open issue" wording isn't
acted on:

- `_pay:1677-1689` now walks `hookSpecifications` and computes `feeFreeAmount = tokenAmount.value − Σ
  hookSpec.amount` (the residue that actually stayed in B's balance), incrementing `_feeFreeSurplusOf[projectId]
  [token] += feeFreeAmount`. This is exactly the `balanceDiff` increment recommended above, computed without a
  second STORE read by reusing the in-memory `hookSpecifications` array that `recordPaymentFrom` already returned.
  Comment at line 1677-1678 documents the intent: "Only the value retained in the destination balance needs later
  cashout fee recovery. Non-feeless pay-hook forwards pay their source-equivalent fee inline before leaving the
  project."
- `executePayout:438-441` (pay branch with `terminal == this`) no longer calls `_capFeeFreeSurplus`. The pay-branch
  cap is redundant once the increment matches actual residue.
- `_capFeeFreeSurplus` is retained as defense-in-depth on the **balance-reducing** paths:
  - `_cashOutTokensOf:1274` — caps after cashout in case beneficiary reclaim plus hook specs dropped balance below
    counter.
  - `_sendPayoutsOf:1988` — caps the source project's counter at its remaining balance after all splits and
    leftover settle.
  - `useAllowanceOf:2137` — caps after allowance drawdown.
  These are the only places where balance can drop below counter, so the cap is now correctly scoped.
- The addToBalance branch at `executePayout:418` still does `+= netPayoutAmount` (gross), which is correct because
  `_efficientAddToBalance` cannot divert (no data hook invocation in `recordAddedBalanceFor`).

With this in place, the per-pay counter delta exactly equals the post-hook balance delta, regardless of B's prior
balance. The over-charge scenario I sketched (prior balance ≥ 99 ETH from outside pays) does not arise.

Net status for AMEND-01 after this third-pass: the original pay-hook diversion bypass is closed, the
fee-accumulator reentrancy is closed (slot-reuse with stack-local accumulator), and the gross-increment side-
effect is closed (residue-only increment in `_pay`). No open follow-ons identified. Apologies for the
churn — the first post-fix assessment misread the iteration of `_pay` that was actually shipped.

Verification after the third-pass source update:

- `forge test --root nana-core-v6 --match-path test/TestFeeFreeCashOutBypass.sol --deny notes --fail-fast --summary --detailed`:
  13 passed, including the prior-balance residue regression.
- `forge test --root nana-core-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`: full suite
  passed.
- `halmos --root nana-core-v6 --contract HalmosSmoke --solver-threads 1 --solver-timeout-assertion 30s --statistics`:
  5 symbolic fee checks passed.
- `forge build --root nana-core-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**'`: passed;
  `JBMultiTerminal` is at 24,552 runtime bytes, 24 bytes under EIP-170.
