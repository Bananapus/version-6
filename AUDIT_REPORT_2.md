# Audit Report 2

Continuation record for the Juicebox V6 EVM ecosystem audit.

Date started: 2026-05-19

## Objective

Formally verify and adversarially audit the full Juicebox V6 EVM ecosystem as a composed system, including Banny,
Defifa, and all Nana repos. Maintain this file as the new record keeper for fresh coverage, concrete evidence,
surviving hypotheses, PoCs, and verification blockers. Prefer evidence, tests, and surface reduction over broad code
changes.

## Starting State

- Existing root report: `AUDIT_REPORT.md` is the prior record keeper and contains Current Open Edge Cases A-AS plus
  historical edge-case disposition.
- Root scope docs list 19 active EVM repos in `ARCHITECTURE.md`.
- Additional workspace repo relevant to "all nana repos": `nana-project-payer-v6`.
- User directive on 2026-05-19: skip `nana-referral-split-hook-v6`; it is not part of this continuation scope.
- User directive on 2026-05-19: `bendystraw-v6` and `website` are out of scope; focus on smart-contract work.
- User directive on 2026-05-19: nothing is deployed in production yet, so fixes and documentation can prefer clean
  fail-closed behavior over backward compatibility with legacy deployed state.

## Expanded Scope Delta

Repos explicitly in the continuation scope:

- all repos covered by root `ARCHITECTURE.md`
- `nana-project-payer-v6`
- smart-contract deployment/runtime packages only

## Current Audit Seed

Seed: deep dive / all repos / input-monoculture breaker + ruthless thief + deployment-integrity reviewer /
continuation from `AUDIT_REPORT.md`

## Fresh Finding Candidates

### CORE-01. `nana-core-v6`: callback-capable ERC-20 intake can over-credit `JBTerminalStore`

Status: VERIFIED SMART-CONTRACT FINDING / FIXED IN WORKTREE

Affected code:

- `nana-core-v6/src/JBMultiTerminal.sol`
- `nana-core-v6/src/JBTerminalStore.sol`
- New regression: `nana-core-v6/test/regression/ReentrantERC20IntakeGuard.t.sol`

Root cause:

- `JBMultiTerminal._acceptFundsFor(...)` measures accepted ERC-20 funds as
  `balanceAfter - balanceBefore` around `_transferFrom(...)`.
- During `_transferFrom(...)`, a callback-capable token can reenter `JBMultiTerminal.addToBalanceOf(...)` or
  `pay(...)` for the same token before the outer transfer finishes.
- The inner call records its own balance delta in `JBTerminalStore`; the outer call then computes its accepted amount
  from the original pre-inner balance, so it includes the inner transfer again.

Proof:

- Temporary local PoC: `nana-core-v6/test/regression/RegressionReentrantERC20Intake.t.sol`.
- Sequence:
  1. Launch a project whose terminal accepts a deliberately callback-capable ERC-20.
  2. Payer calls `addToBalanceOf(projectId, token, 100, ...)`.
  3. Token `transferFrom(payer, terminal, 100)` reenters `addToBalanceOf(projectId, token, 100, ...)` before the
     outer transfer completes.
  4. Inner call transfers 100 tokens and records 100 in `JBTerminalStore`.
  5. Outer transfer then sends another 100 tokens.
  6. Outer `_acceptFundsFor(...)` returns `balanceAfter(200) - balanceBefore(0) = 200`, and the outer call records
     another 200.
- Result: terminal actual token balance is 200, but `JBTerminalStore.balanceOf(terminal, projectId, token)` is 300.

Command:

- `forge test --match-path test/regression/RegressionReentrantERC20Intake.t.sol -vv` in `nana-core-v6`: 1 test
  passed, proving the current code over-credits the store.
- Stronger temporary local PoC: `nana-core-v6/test/regression/RegressionReentrantERC20CrossProjectDrain.t.sol`.
- `forge test --match-path test/regression/RegressionReentrantERC20CrossProjectDrain.t.sol -vv` in `nana-core-v6`:
  1 test passed, proving an attacker project can withdraw another project's same-token backing from the shared
  terminal pool.

Impact:

- Breaks critical invariant 1, terminal solvency: internal accounting can exceed actual redeemable token balance.
- A project that accepts a callback-capable ERC-20 can end up with phantom terminal balance.
- If the terminal holds the same ERC-20 for unrelated projects, the inflated attacker-project balance can be paid,
  cashed out, or migrated against the shared actual token pool. The store tracks balances per
  `(terminal, projectId, token)`, but the terminal has one actual ERC-20 balance per token, so outbound transfers do
  not distinguish which project supplied the backing tokens.
- The cross-project drain PoC:
  1. Victim project records a legitimate 100-token balance.
  2. Attacker project contributes 200 actual tokens through the reentrant token path.
  3. Attacker project receives a 300-token recorded balance.
  4. Attacker owner uses a 300-token surplus allowance and receives all 300 actual tokens.
  5. Victim project still has a 100-token store balance, but the terminal's actual token balance is zero.
- `pay(...)` is worse than `addToBalanceOf(...)` because the outer payment mints project tokens from the inflated
  accepted amount, letting the attacker receive project tokens for the nested inflow twice and then use those tokens
  in cash-out paths.
- Cross-token surplus views can be inflated because surplus starts from the store ledger, but this does not by itself
  create a recorded balance of another token. Different-token extraction still requires an attacker-project recorded
  balance for the token being reclaimed.
- If no same-token backing exists in the terminal, the practical result is failed outbound transfers and insolvent or
  liveness-broken accounting for that token.

Self-review:

- This is not reachable for plain ERC-20s that cannot call back during `transferFrom`.
- It is reachable for terminal accounting contexts that accept nonstandard/callback-capable tokens or token wrappers.
- The protocol already supports arbitrary ERC-20 accounting contexts, so the invariant should be enforced in the
  terminal rather than relying only on token behavior assumptions.

Recommended fix:

- Avoid a broad `nonReentrant` guard on terminal entrypoints. Existing hook compositions intentionally reenter terminal
  entrypoints after accounting, and a broad guard risks breaking split hooks, cash-out hooks, buyback leftovers, and
  REV owner fee routing.
- Prefer scoped transient inbound accounting inside `_acceptFundsFor(...)`: subtract nested accepted deltas from the
  outer raw balance delta, then add the final accepted amount to a transient per-token counter before returning.
- Acceptable simpler mitigation: a narrow ERC-20 `_acceptFundsFor` lock that only blocks nested `pay(...)` /
  `addToBalanceOf(...)` while token `transferFrom` is executing. This targets the vulnerable token-callback window
  without blocking post-accounting hook callbacks.
- Add regression tests for reentrant `pay`, reentrant `addToBalanceOf`, same-token/different-project variants, and
  existing legitimate nested-hook regressions.

Fix applied:

- Added `JBMultiTerminal_ReentrantTokenTransfer(address token)`.
- Added transient `_acceptingToken` state in `JBMultiTerminal`.
- `_acceptFundsFor(...)` now sets the transient guard only around the ERC-20 transfer/balance-delta window. Native-token
  entrypoints and post-accounting hook callbacks are not broadly locked.
- Added `ReentrantERC20IntakeGuard.t.sol`, covering:
  - callback-token reentry through `addToBalanceOf(...)`, including preservation of an existing victim project
    same-token balance and terminal token pool;
  - callback-token reentry through `pay(...)`, including no attacker accounting and no project-token mint.

Verification after fix:

- `forge test --root nana-core-v6 --match-path test/regression/ReentrantERC20IntakeGuard.t.sol -vv`: 2 passed.
- `forge test --root nana-core-v6 --match-path test/regression/SplitHookBalanceDeltaReentrancy.t.sol -vv`: 2 passed.
- `forge test --root nana-core-v6 --match-path test/regression/CashOutReenterPay.t.sol -vv`: 2 passed.
- `forge test --root nana-core-v6 --match-path test/TestForwardedTokenConsumption.sol -vv`: 4 passed.
- `forge test --root nana-core-v6 --deny notes --skip '*/fork/**' --fail-fast --summary --detailed`: exit code 0,
  including long-running unit, regression, fuzz, and invariant suites.

### DIST-01. `nana-distributor-v6`: callback-capable reward-token funding can over-credit hook reward balances

Status: VERIFIED SMART-CONTRACT FINDING / FIXED IN WORKTREE

Affected code:

- `nana-distributor-v6/src/JBDistributor.sol`
- `nana-distributor-v6/src/JBTokenDistributor.sol`
- `nana-distributor-v6/src/JB721Distributor.sol`
- New regression: `nana-distributor-v6/test/regression/ReentrantRewardFundingGuard.t.sol`

Root cause:

- `JBDistributor.fund(...)`, `JBTokenDistributor.processSplitWith(...)`, and
  `JB721Distributor.processSplitWith(...)` measured received ERC-20 reward tokens as a contract balance delta around
  `safeTransferFrom(...)`.
- A callback-capable reward token could reenter `fund(...)` during that transfer.
- The inner `fund(...)` credited one hook's reward balance, then the outer balance-delta calculation included the
  nested transfer and credited another hook with the nested amount again.
- Actual reward tokens are pooled by token address in the distributor, while `_balanceOf[hook][token]` and vesting are
  hook-scoped. Over-crediting one hook can therefore drain another hook's same-token backing.

Proof:

- Temporary local PoC: `nana-distributor-v6/test/regression/ReentrantRewardFundingPoC.t.sol`.
- Sequence:
  1. Victim hook is legitimately funded with 100 reward tokens.
  2. Attacker hook uses the same callback-capable reward token and funds 200 tokens.
  3. During the attacker's token transfer, the token reenters `fund(attackerHook, token, 100)`.
  4. Inner `fund(...)` credits attacker hook for 100.
  5. Outer `fund(...)` computes `balanceAfter(400) - balanceBefore(100) = 300` and credits attacker hook again.
  6. Distributor actual token pool is 400, but hook balances sum to 500: victim 100 plus attacker 400.
  7. Attacker hook vests and collects 400, draining the entire actual token pool while victim hook still records 100.

Command:

- `forge test --root nana-distributor-v6 --match-path test/regression/ReentrantRewardFundingPoC.t.sol -vv`: 1 test
  passed, proving over-credit and same-token hook-backing drain before the fix.

Impact:

- Breaks distributor solvency for a reward token accepted by multiple hooks.
- Any hook with inflated same-token reward balance can vest and collect against the shared actual token pool.
- This is reachable through both direct public `fund(...)` and authorized split funding via `processSplitWith(...)`
  when the reward token can call back during `transferFrom`.

Self-review:

- Plain ERC-20 reward tokens that cannot call back during `transferFrom` are not affected.
- The attack requires a callback-capable or deliberately adversarial reward token; the distributor intentionally
  accepts arbitrary ERC-20 reward tokens, so the accounting invariant should be defended locally.

Fix applied:

- Added `JBDistributor_ReentrantTokenTransfer(address token)`.
- Added transient `_acceptingToken` state to `JBDistributor`.
- Added shared `_acceptErc20FundsFrom(...)` helper that wraps only the ERC-20 transfer/balance-delta window.
- Switched both token and 721 split distributors to the shared helper, preserving fee-on-transfer accounting while
  blocking nested funding deltas.
- Added `ReentrantRewardFundingGuard.t.sol`, covering both direct `fund(...)` and split-hook
  `processSplitWith(...)` reentry attempts.
- Added `FeeOnTransferFunding.t.sol` with a real fee-on-transfer ERC-20 mock, proving the shared helper credits only
  the received balance delta, repeated fundings accumulate by per-call deltas, and plain fee-on-transfer behavior does
  not false-positive the reentrancy guard.

Verification after fix:

- `forge test --root nana-distributor-v6 --match-path test/regression/ReentrantRewardFundingGuard.t.sol -vv`: 2
  passed.
- `forge test --root nana-distributor-v6 --match-path test/FeeOnTransferFunding.t.sol --fail-fast --summary --detailed`:
  3 passed.
- `forge test --root nana-distributor-v6 --deny notes --skip '*/fork/**' --fail-fast --summary --detailed`: exit
  code 0, including unit, regression, fuzz, and invariant suites.

### DIST-02. `nana-distributor-v6`: native split-hook funding did not conserve `context.amount`

Status: VERIFIED INVARIANT GAP / FIXED IN WORKTREE

Affected code:

- `nana-distributor-v6/src/JBTokenDistributor.sol`
- `nana-distributor-v6/src/JB721Distributor.sol`
- Regression updates: `nana-distributor-v6/test/regression/TokenMismatchFix.t.sol`
- Fork coverage update: `nana-distributor-v6/test/fork/TokenDistributorFork.t.sol`

Root cause:

- Both split distributors rejected native ETH only when `context.token` was not `NATIVE_TOKEN`.
- For native split contexts, they credited `msg.value` but did not require `msg.value == context.amount`.
- That left terminal context accounting and distributor native accounting coupled by convention rather than an enforced
  invariant.

Impact:

- A malformed, buggy, or adversarial authorized terminal/controller could under-send native ETH while passing a larger
  `context.amount`, or over-send ETH while passing a smaller `context.amount`.
- The distributor would stay solvent because it credited actual `msg.value`, but cross-component accounting around the
  split could become ambiguous and downstream tests would not catch the mismatch.
- This is lower severity than DIST-01 because callers are gated by `JBDirectory`, but no production deployment exists
  yet and the cleaner invariant is exact native conservation.

Fix applied:

- Native split contexts now require `context.token == NATIVE_TOKEN` and `msg.value == context.amount`.
- ERC-20 split contexts now explicitly reject nonzero `msg.value`.
- Zero-amount ERC-20 contexts remain no-ops; fee-on-transfer ERC-20 paths still use balance-delta accounting.

Verification after fix:

- `forge test --root nana-distributor-v6 --match-path test/regression/TokenMismatchFix.t.sol --summary --detailed`:
  10 passed, covering token and 721 distributor underpay/overpay reverts plus the existing ETH-as-ERC20 mismatch cases.
- `forge test --root nana-distributor-v6 --match-path test/fork/TokenDistributorFork.t.sol --summary --detailed`:
  9 passed. The payout split fork test now asserts the distributor's native credit delta equals the actual ETH received
  through the real `JBMultiTerminal` split path.
- `forge fmt --root nana-distributor-v6 --check`: passed.

### DIST-03. `nana-distributor-v6`: zero-reward 721 vesting attempts consumed owner voting budget

Status: VERIFIED SMART-CONTRACT FINDING / FIXED IN WORKTREE

Affected code:

- `nana-distributor-v6/src/JB721Distributor.sol`
- Regression update: `nana-distributor-v6/test/audit/FreshCodexNemesisZeroRewardReplay.t.sol`

Root cause:

- `JB721Distributor._vestSingleToken(...)` capped each owner's per-round voting budget across their NFTs.
- The function incremented the owner's consumed voting budget before calculating whether the pro-rata reward amount
  rounded down to zero.
- When a token's effective stake produced `tokenAmount == 0`, no vesting entry was created, so the same token could be
  replayed repeatedly while still consuming the owner's remaining budget for the hook/token/release-round bucket.

Impact:

- A permissionless caller could repeatedly vest a low-stake NFT whose reward rounded to zero and exhaust the owner's
  voting cap.
- Later higher-value NFTs owned by the same snapshot owner could then receive no allocation for that reward round.
- The issue is a griefing/under-allocation bug rather than a direct overclaim; the undistributed reward stays in the
  pool, but the intended owner allocation for the round can be blocked.

Fix applied:

- `_vestSingleToken(...)` now returns before mutating consumed voting power when the computed `tokenAmount` is zero.
- The consumed-vote cap is updated only when a nonzero vesting entry is created.

Verification after fix:

- `forge test --root nana-distributor-v6 --match-path test/audit/FreshCodexNemesisZeroRewardReplay.t.sol --summary --detailed`:
  1 passed. The replayed dust token remains unclaimable and no longer blocks the high-value token's allocation.
- `forge test --root nana-distributor-v6 --match-path test/JB721Distributor.t.sol --match-test 'testFuzz_beginVesting_proportional|testFuzz_conservation|test_processSplitWith_nativeETH|test_invariant_totalVestingNeverExceedsBalance|test_beginVesting_exactAmounts' --summary --detailed`:
  5 passed, including proportional and conservation fuzz smoke coverage around the changed accounting path.
- `forge test --root nana-distributor-v6 --deny notes --skip '*/fork/**' --fail-fast --summary --detailed`: 22
  suites passed, including the updated replay regression and the 721 distributor invariant campaign.

### DIST-04. `nana-distributor-v6`: callback reward-token collection can under-credit inbound funding

Status: VERIFIED SMART-CONTRACT FINDING / FIXED IN WORKTREE

Affected code:

- `nana-distributor-v6/src/JBDistributor.sol`
- New regression: `nana-distributor-v6/test/regression/ReentrantRewardCollectionGuard.t.sol`
- Risk docs: `nana-distributor-v6/RISKS.md`

Root cause:

- DIST-01 blocked nested funding during the ERC-20 `transferFrom` balance-delta window, but reward accounting methods
  could still run during that same callback window.
- A callback-capable reward token could reenter `collectVestedRewards(...)` while a new `fund(...)` or
  `processSplitWith(...)` transfer was being measured.
- If the token collected already-vested same-token rewards during the inbound transfer, the outgoing collection could
  net against the incoming balance. The outer funding call would then measure too small a delta, potentially zero,
  leaving the new tokens in the distributor without hook accounting.

Impact:

- This is a liveness/griefing and accounting-stranding bug, not an over-credit drain.
- The prior vested rewards remain payable to the legitimate owner, but the new funding can become unaccounted and
  undistributable because no `_balanceOf[hook][token]` credit is recorded for it.
- It affects direct `fund(...)` and both ERC-20 split `processSplitWith(...)` paths through the shared helper.

Fix applied:

- Replaced the boolean transient transfer guard with the active ERC-20 token address.
- `beginVesting(...)`, `collectVestedRewards(...)`, and `releaseForfeitedRewards(...)` now fail closed while any inbound
  ERC-20 balance delta is being measured.
- The existing `JBDistributor_ReentrantTokenTransfer(address token)` error is reused so all reward-token callback
  mutations during funding share the same boundary.

Verification after fix:

- `forge test --root nana-distributor-v6 --match-contract 'ReentrantRewardFundingGuard|ReentrantRewardCollectionGuardTest' --summary --detailed`:
  3 passed, covering both over-credit nested funding and under-credit collection reentry.
- `forge test --root nana-distributor-v6 --deny notes --skip '*/fork/**' --fail-fast --summary --detailed`: exit
  code 0 across 23 suites, including the new regression, 79 `JB721Distributor` tests, and 5 invariant campaigns at
  102,400 calls each.
- `forge test --root nana-distributor-v6 --match-path test/fork/TokenDistributorFork.t.sol --fail-fast --summary --detailed`:
  9 fork tests passed, covering real split funding plus vest/collect conservation.

### DIST-05. `nana-distributor-v6`: partial vesting dust can strand reward reserves

Status: VERIFIED SMART-CONTRACT FINDING / FIXED IN WORKTREE

Affected code:

- `nana-distributor-v6/src/JBDistributor.sol`
- `nana-distributor-v6/src/libraries/JBVestingMath.sol`
- Regression update: `nana-distributor-v6/test/regression/AuditFixAE.t.sol`
- Invariant update: `nana-distributor-v6/test/invariant/JB721DistributorInvariant.t.sol`
- Formal proof target: `nana-distributor-v6/test/formal/JBVestingMathHalmos.t.sol`

Root cause:

- `claimedFor(...)` reports remaining claimable rewards using cumulative share accounting:
  `amount - floor(amount * shareClaimed / MAX_SHARE)`.
- Partial `collectVestedRewards(...)` / `releaseForfeitedRewards(...)` used incremental share accounting:
  `floor(amount * (newShareClaimed - oldShareClaimed) / MAX_SHARE)`.
- Repeated partial collections can make the sum of incremental floors smaller than the cumulative floor. The token ID's
  `claimedFor(...)` balance then drops faster than `totalVestingAmountOf`, leaving wei counted as still vesting even
  after the user-facing claim is exhausted.

Proof:

- Strengthening `JB721DistributorInvariant.t.sol` with
  `totalVestingAmountOf(hook, token) == claimedFor(hook, token1, token) + claimedFor(hook, token2, token)` produced a
  shrunk counterexample where the aggregate vesting counter exceeded remaining claims by 1 wei after repeated
  `collectBob()` / `warpForward()` calls.
- The new regression `test_AE2_totalVestingClearsAfterPartialDustCollections` funds 7 wei, collects across partial
  vesting rounds, then fully vests. Before the fix, `totalVestingAmountOf` can retain dust after `claimedFor` reaches
  zero.

Impact:

- This is a value-stranding/accounting-liveness bug, not a direct overclaim.
- Stranded `totalVestingAmountOf` reduces later `distributable = balance - vestingAmount` snapshots, so reward dust can
  remain reserved forever instead of returning to the hook's distributable pool.

Fix applied:

- Moved shared vesting arithmetic into `JBVestingMath`, keeping `claimedFor(...)`, `collectableFor(...)`, and
  `_unlockTokenIds(...)` on the same cumulative-rounding helper.
- `collectableFor(...)` and `_unlockTokenIds(...)` now calculate partial unlocks as the difference between cumulative
  rounded claims:
  `floor(amount * newShareClaimed / MAX_SHARE) - floor(amount * oldShareClaimed / MAX_SHARE)`.
- This keeps user-facing views and state mutation on the same rounding model while preserving the existing final-unlock
  dust recovery path.
- Added exact invariant checks that the distributor's tracked hook balance matches its actual ERC-20 backing and that
  aggregate vesting equals the remaining uncollected token-ID claims.

Verification after fix:

- `forge test --root nana-distributor-v6 --match-path test/regression/AuditFixAE.t.sol --match-test test_AE2_totalVestingClearsAfterPartialDustCollections -vvv`:
  1 passed.
- `forge test --root nana-distributor-v6 --match-path test/invariant/JB721DistributorInvariant.t.sol --fail-fast --summary --detailed`:
  7 invariant properties passed, each with 1024 runs and 102,400 handler calls.
- `forge test --root nana-distributor-v6 --deny notes --skip '*/fork/**' --fail-fast --summary --detailed`: exit
  code 0 across the broad non-fork suite, including 79 `JB721Distributor` tests, dust regressions, and invariant
  campaigns.
- `forge build --root nana-distributor-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**'`: exit code 0.
  Runtime margins: `JB721Distributor` 12,693 bytes, `JBTokenDistributor` 15,533 bytes.

Verification after formal follow-up:

- `forge fmt --root nana-distributor-v6 --check`: passed.
- `halmos --root nana-distributor-v6 --match-contract JBVestingMathHalmos --solver-threads 1
  --solver-timeout-assertion 30s --statistics`: 5 checks passed in 0.24s symbolic time. Symbolic checks cover no-claim
  and partial-unlock cumulative-delta branches; boundary tables pin final-dust release and unclaimed upper bounds.
- `forge test --root nana-distributor-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`: passed
  across the full local suite, including fork and invariant campaigns.
- `forge build --root nana-distributor-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**' --skip SphinxUtils`:
  passed. Runtime margins: `JB721Distributor` 12,869 bytes, `JBTokenDistributor` 15,709 bytes, `JBVestingMath` 24,532
  bytes.

### PAYER-03. `nana-project-payer-v6`: forwarded ERC-20 allowance remains live after terminal under-pull

Status: VERIFIED SMART-CONTRACT FINDING / FIXED IN WORKTREE

Affected code:

- `nana-project-payer-v6/src/JBProjectPayer.sol`
- Regression updates: `nana-project-payer-v6/test/JBProjectPayer_Edge.t.sol`

Root cause:

- `_pay(...)` and `_addToBalanceOf(...)` approve the selected terminal for the measured ERC-20 amount before calling
  `terminal.pay(...)` or `terminal.addToBalanceOf(...)`.
- If the terminal returns without pulling the full approved amount, the payer contract keeps both the leftover tokens
  and a live allowance for that terminal.
- A malicious, buggy, or partial-fill terminal can later call `transferFrom(address(payer), ...)` and drain the held
  remainder.

Impact:

- This is lower severity than CORE-01/DIST-01 because it depends on the selected project terminal under-pulling or
  being adversarial.
- It is still a real approval-surface bug: the forwarding contract should not preserve spend authority beyond the
  immediate terminal call.

Fix applied:

- After successful `terminal.pay(...)` and `terminal.addToBalanceOf(...)`, `JBProjectPayer` now resets the terminal's
  ERC-20 allowance to zero.
- The existing original-payer transient restore behavior is unchanged.

Verification after fix:

- `forge test --root nana-project-payer-v6 --match-path test/JBProjectPayer_Edge.t.sol -vv`: 13 passed.
- `forge test --root nana-project-payer-v6 --skip '*/fork/**' --fail-fast --summary --detailed`: exit code 0 across
  the non-fork unit, edge, audit, and regression suites.

### PAYER-04. `nana-project-payer-v6` callback-token forwarding passes current coverage

Status: REVIEWED / NO CODE FINDING IN THIS PASS

Focus:

- Rechecked `JBProjectPayer.pay(...)`, `addToBalanceOf(...)`, `_pay(...)`, `_addToBalanceOf(...)`, and
  `_originalPayerOrSender(...)` against callback-capable ERC-20 behavior.
- The main timing split is deliberate: inbound ERC-20 transfer callbacks happen before `originalPayer` is set, while
  terminal-pull callbacks happen during the forward and should observe the true payer for router-style refunds.

Result:

- No new extraction or bricking path was confirmed.
- Added `test/audit/ProjectPayerCallbackToken.t.sol`, which uses a callback-style ERC-20 and a terminal that actually
  pulls the approved amount. The test proves the inbound transfer does not observe a stale payer, the terminal pull
  observes the original caller, the measured inbound amount reaches the terminal, the payer keeps no token dust, and
  the transient tracker resets after the call.
- Rebasing tokens remain an accepted token-behavior boundary documented in `nana-project-payer-v6/RISKS.md`.

Verification:

- `forge test --root nana-project-payer-v6 --match-path test/audit/ProjectPayerCallbackToken.t.sol --summary --detailed`:
  1 passed.
- `forge test --root nana-project-payer-v6 --summary --detailed`: exit code 0 across 9 suites; 68 passed, 0 failed,
  0 skipped, including the new callback-token audit test and the fork-backed ProjectPayer terminal path.

Formal follow-up:

- Added `test/formal/JBProjectPayerHalmos.t.sol`, a narrow Halmos target for `_originalPayerOrSender()` and the
  ProjectPayer ERC-165 surface. The proof pins direct-caller fallback, constructor-time no-code fallback,
  reverting/nonconformant tracker fallback, zero-upstream fallback, non-zero upstream propagation, and advertised
  interface IDs.
- Added a dedicated Halmos CI workflow for that target. This complements the fork-backed router refund tests by
  proving the small identity-resolution branch table that downstream router-style terminals rely on.

Verification after formal follow-up:

- `forge fmt --root nana-project-payer-v6 --check`: passed.
- `forge test --root nana-project-payer-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`: exit
  code 0 across 9 suites; 68 passed, 0 failed, 0 skipped.
- `forge build --root nana-project-payer-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**'`: passed;
  `JBProjectPayer` runtime size 6,758 bytes and `JBProjectPayerDeployer` runtime size 979 bytes.
- `halmos --root nana-project-payer-v6 --match-contract JBProjectPayerHalmos --solver-threads 1
  --solver-timeout-assertion 30s --statistics`: 7 passed across 12 total paths; symbolic test time 0.09s.

### PAYER-05. `nana-project-payer-v6`: fallback calldata must not auto-forward funds

Status: REVIEWED / COVERAGE ADDED

Affected code:

- `nana-project-payer-v6/src/JBProjectPayer.sol`
- Regression update: `nana-project-payer-v6/test/JBProjectPayer.t.sol`

Result:

- `JBProjectPayer` intentionally implements `receive()` but no `fallback()`.
- Added coverage proving calldata-bearing calls revert with and without `msg.value`, and do not create terminal
  `pay(...)` or `addToBalanceOf(...)` records. Explicit routing remains through `pay(...)` and `addToBalanceOf(...)`.

Verification:

- `forge test --root nana-project-payer-v6 --match-path test/JBProjectPayer.t.sol --match-test test_RevertWhen_FallbackCalldataIsSent --summary --detailed`:
  1 passed.
- `forge test --root nana-project-payer-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`:
  exit code 0 across 9 suites; 68 passed, 0 failed, 0 skipped.
- `forge build --root nana-project-payer-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**'`: passed;
  `JBProjectPayer` runtime size 6,758 bytes and `JBProjectPayerDeployer` runtime size 979 bytes.

### OMNI-01. `nana-omnichain-deployers-v6`: generic extra cash-out hooks corrupt NFT cash-out semantics

Status: VERIFIED SMART-CONTRACT FINDING / FIXED IN WORKTREE

Affected code:

- `nana-omnichain-deployers-v6/src/JBOmnichainDeployer.sol`
- Regression updates:
  - `nana-omnichain-deployers-v6/test/Tiered721HookComposition.t.sol`
  - `nana-omnichain-deployers-v6/test/regression/CashOutCountPropagation.t.sol`
  - `nana-omnichain-deployers-v6/test/regression/ExtraCashOutHookZeroReclaim.t.sol`
  - `nana-omnichain-deployers-v6/test/regression/CashOutSpecMerge.t.sol`
  - `nana-omnichain-deployers-v6/test/OmnichainDeployerEdgeCases.t.sol`

Root cause:

- When a tiered 721 hook was active for cash-outs, `JBOmnichainDeployer.beforeCashOutRecordedWith(...)` first let the
  721 hook translate NFT metadata into an effective cash-out weight and NFT total weight.
- It then forwarded that derived context to the extra cash-out hook and merged the extra hook's tax rate/specs into the
  NFT cash-out result.
- The terminal later fulfills cash-out hook specs with `JBAfterCashOutRecordedContext.cashOutCount` equal to the
  original fungible token burn count from the terminal call. For NFT cash-outs, that count is zero.
- Generic cash-out hooks therefore see NFT-derived values in the before-hook phase, but receive a zero fungible burn
  count in the after-hook phase.

Concrete failure mode:

- With a buyback-style extra cash-out hook, the extra hook can select the AMM route and return
  `MAX_CASH_OUT_TAX_RATE`, causing the terminal's direct reclaim amount to become zero.
- `JBBuybackHook.afterCashOutRecordedWith(...)` clamps its metadata-provided sell count to the terminal's original
  `context.cashOutCount`; for NFT cash-outs this is zero, so the buyback hook sells zero project tokens.
- The 721 hook can still burn the NFT, leaving the holder settled for zero instead of the NFT cash-out reclaim.

Self-review:

- The current buyback hook's sell-count clamp prevents the over-mint/sell variant. The bug is the zero-settlement /
  semantic-corruption composition, not an unchecked mint in the current checkout.
- This is a configuration hazard for projects that enable both `use721ForCashOut` and an extra cash-out data hook.

Fix applied:

- `JBOmnichainDeployer` now detects `hasTiered721CashOut` once per cash-out.
- When the 721 hook handles cash-out pricing, generic extra cash-out hooks are skipped entirely for that cash-out path.
- Extra cash-out hook behavior remains unchanged when no 721 cash-out hook is active, or when the 721 hook exists but
  `useDataHookForCashOut` is false.

Verification after fix:

- `forge test --root nana-omnichain-deployers-v6 --match-path test/Tiered721HookComposition.t.sol -vv`: 34 passed.
- `forge test --root nana-omnichain-deployers-v6 --match-path test/regression/CashOutCountPropagation.t.sol -vv`: 1
  passed.
- `forge test --root nana-omnichain-deployers-v6 --match-path test/regression/ExtraCashOutHookZeroReclaim.t.sol -vv`:
  4 passed.
- `forge test --root nana-omnichain-deployers-v6 --match-path test/regression/CashOutSpecMerge.t.sol -vv`: 3 passed.
- `forge test --root nana-omnichain-deployers-v6 --match-test test_beforeCashOut_721CashOutSkipsCustomHookSpecifications -vv`:
  1 passed.
- `forge test --root nana-omnichain-deployers-v6 --skip '*/fork/**' --no-match-path 'test/invariants/**' --summary --detailed`:
  exit code 0 across 28 non-fork, non-invariant suites.

### OMNI-02. `nana-omnichain-deployers-v6`: fresh project launch accepted controller-shaped no-ops

Status: VERIFIED SMART-CONTRACT FINDING / FIXED IN WORKTREE

Affected code:

- `nana-omnichain-deployers-v6/src/JBOmnichainDeployer.sol`
- Updated regressions:
  - `nana-omnichain-deployers-v6/test/JBOmnichainDeployerGuard.t.sol`
  - `nana-omnichain-deployers-v6/test/regression/ValidateController.t.sol`
  - `nana-omnichain-deployers-v6/test/regression/OmnichainRegressionFixes.t.sol`

Root cause:

- `_launchProjectFor(...)` reserved a canonical `JBProjects` NFT, deployed the 721 hook, called the caller-supplied
  controller, transferred hook ownership to the project, optionally deployed suckers, and transferred the project NFT.
- Existing project `launchRulesetsFor(...)` / `queueRulesetsOf(...)` paths validated the caller-supplied controller
  against the canonical directory, but the fresh launch path did not validate that the controller was attached to this
  deployer's canonical `PROJECTS` registry or that it registered itself in the canonical directory.
- A controller-shaped contract could therefore return success from `launchRulesetsFor(...)` without configuring the
  canonical Juicebox project state.

Impact:

- A fresh omnichain launch could hand the user a canonical project NFT and project-owned hook wiring while the
  canonical directory had no controller for the project. The result is a project that appears launched through the
  deployer but is not actually launched in Juicebox core.
- Because no production state exists yet, the safer model is exact controller validation rather than accepting
  controller-shaped contracts.

Fix applied:

- `_validateController(...)` now also requires `controller.PROJECTS() == PROJECTS`.
- Fresh `launchProjectFor(...)` validates the controller after reserving the project ID and before deploying
  project-scoped hooks.
- Both fresh `launchProjectFor(...)` and blank-project `launchRulesetsFor(...)` now require the canonical directory to
  point at the selected controller after `launchRulesetsFor(...)` returns.
- Risk docs now describe the canonical `PROJECTS` and post-launch directory checks.

Verification after fix:

- `forge test --root nana-omnichain-deployers-v6 --match-path test/JBOmnichainDeployerGuard.t.sol --summary --detailed`:
  8 passed, including wrong-`PROJECTS` and no-directory-registration fake-controller regressions against real core
  test infrastructure.
- `forge test --root nana-omnichain-deployers-v6 --match-path test/regression/ValidateController.t.sol --summary --detailed`:
  3 passed.
- `forge test --root nana-omnichain-deployers-v6 --match-path test/regression/OmnichainRegressionFixes.t.sol --match-test 'test_freshProjectZeroControllerMustRegisterAfterLaunch|test_existingProjectWrongControllerReverts|test_existingProjectCorrectControllerPasses|test_remoteSurplusUsesCorrectDecimals' --summary --detailed`:
  4 passed.
- `forge test --root nana-omnichain-deployers-v6 --match-path 'test/{JBOmnichainDeployerGuard.t.sol,regression/ValidateController.t.sol,regression/OmnichainRegressionFixes.t.sol}' --summary --detailed`:
  17 passed across 3 suites.

### SUCKER-01. `nana-suckers-v6`: initial CCIP swap output can be consumed by an older claim during token callback

Status: VERIFIED SMART-CONTRACT FINDING / FIXED IN WORKTREE

Affected code:

- `nana-suckers-v6/src/JBSwapCCIPSucker.sol`
- New regression: `nana-suckers-v6/test/regression/InitialSwapReentrantClaim.t.sol`

Root cause:

- `JBSwapCCIPSucker.ccipReceive(...)` swaps delivered bridge tokens into the local token before calling
  `fromRemote(...)` and before writing the new nonce's conversion rate.
- The retry path already blocked `claim(...)` during `retrySwap(...)`, but the initial `ccipReceive(...)` swap had no
  equivalent lock.
- If the local swap output token can call back during transfer, it can reenter `claim(...)` for an already accepted
  older same-token batch while the new batch's freshly swapped local tokens are sitting in the sucker.
- The older claim can transfer the fresh output to the terminal, after which `ccipReceive(...)` records the new nonce
  as backed by local output that has already been consumed.

Impact:

- Breaks per-batch backing isolation for callback-capable local tokens received through the swap path.
- Requires an already claimable older batch for the same local token and a local token that can call back during the
  swap output transfer.
- No bridge spoofing is required in the PoC; the attacker-controlled surface is the token callback timing and the
  older valid claim.

Fix applied:

- Added transient `_ccipReceiveSwapLocked` state to `JBSwapCCIPSucker`.
- `ccipReceive(...)` now sets the lock only around the initial `this.executeSwapExternal(...)` call and clears it in
  both the success and catch branches.
- `claim(...)` now shares the existing swap-pending guard and reverts while either `_retrySwapLocked` or
  `_ccipReceiveSwapLocked` is active.
- The existing retry-swap lock and nonce-indexed conversion-rate logic are otherwise unchanged.

Verification after fix:

- `forge test --root nana-suckers-v6 --match-path test/regression/InitialSwapReentrantClaim.t.sol -vv`: 1 passed.
- `forge test --root nana-suckers-v6 --match-contract 'InitialSwapReentrantClaimTest|RegressionFreshRoundTest|ZeroOutputSwapPendingTest|ZeroOutputRetryClaimTest|RegressionSwapBatchRateMixingTest|TransientClaimContextRegression' -vv`:
  9 passed.
- `forge test --root nana-suckers-v6 --no-match-path 'test/*Fork*.t.sol' --fail-fast --summary --detailed`: exit
  code 0 across the non-fork suite, including invariant suites.
- `forge test --root nana-suckers-v6 --skip '*/fork/**' --fail-fast --summary --detailed` still picked up
  `test/AdversarialSuckerFork.t.sol` and failed only because `RPC_ARBITRUM_MAINNET` was unset after 302 successful
  tests.

### BUYBACK-01. `nana-buyback-hook-v6`: oracle-derived sell-side minimums were enforced as explicit user floors

Status: VERIFIED SMART-CONTRACT FINDING / FIXED IN WORKTREE

Affected code:

- `nana-buyback-hook-v6/src/JBBuybackHook.sol`
- Regression updates: `nana-buyback-hook-v6/test/regression/DerivedMinSellSideFOTDoS.t.sol`

Root cause:

- `beforeCashOutRecordedWith(...)` used the same `minimumSwapAmountOut` field for explicit user-provided
  `cashOutMinReclaimed` metadata and for metadata-less oracle-derived TWAP route selection.
- The sell-side hook metadata carried the minimum and sell count, but not whether the minimum was explicit or derived.
- `afterCashOutRecordedWith(...)` therefore treated any nonzero oracle-derived minimum like a user slippage floor.

Concrete failure modes:

- If the metadata-less TWAP route beat direct reclaim during `beforeCashOutRecordedWith(...)` but the pool execution
  later reverted, `afterCashOutRecordedWith(...)` reverted instead of returning the reminted project tokens to the
  holder.
- If the terminal-token output was fee-on-transfer, the oracle/pool output was quoted gross while the hook measured
  net receipt and final net delivery. A metadata-less AMM-routed cash-out could therefore revert even though the user
  had not supplied an explicit hard minimum.

Fix applied:

- Sell-side route metadata now appends `hasUserSpecifiedMinimumSwapAmountOut` after the existing informational fields.
- `afterCashOutRecordedWith(...)` decodes the appended flag when present.
- New metadata-less/oracle-derived routes still use the derived amount as the V4 price limit, but only explicit user
  minimums are enforced as hard post-swap and swap-failure floors.
- Legacy two-word hook metadata remains fail-closed: any nonzero minimum in that shape is treated as explicit.

Verification after fix:

- `forge test --root nana-buyback-hook-v6 --match-path test/regression/DerivedMinSellSideFOTDoS.t.sol -vv`: 3
  passed.
- `forge test --root nana-buyback-hook-v6 --match-path test/regression/SellSideFOTOutputDoS.t.sol -vv`: 2 passed.
- `forge test --root nana-buyback-hook-v6 --match-path test/regression/SellSwapFallback.t.sol -vv`: 6 passed.
- `forge fmt --root nana-buyback-hook-v6 --check`: passed.
- `forge test --root nana-buyback-hook-v6 --skip '*/fork/**' --fail-fast --summary --detailed`: exit code 0,
  including the non-fork invariant suite.

### BUYBACK-02. Default buyback-hook changes do not retroactively hijack existing projects

Status: REVIEWED / ALREADY COVERED

Scope:

- `nana-buyback-hook-v6/src/JBBuybackHookRegistry.sol`
- `nana-buyback-hook-v6/test/regression/RegistryDefaultHookHijack.t.sol`
- `nana-buyback-hook-v6/test/regression/SetDefaultHookCohortHistory.t.sol`
- `nana-buyback-hook-v6/test/regression/DisallowDefaultHook.t.sol`

Result:

- The registry default is threshold-gated by `PROJECTS.count()`: a new default only applies to projects with
  `projectId > defaultHookProjectIdThreshold`.
- When the default changes, the outgoing default is snapshotted into `_defaultHookHistory`, preserving the project-ID
  cohort that inherited that default. Existing projects therefore keep resolving to their historical default instead
  of being retargeted to the new default.
- `hasMintPermissionFor(...)` resolves through the same `_resolvedHookOf(...)` path, so mint permission follows the
  project-specific or historical hook, not the latest default.
- Disallowing the active default hook reverts, preventing owner action from breaking default-reliant payment paths.

Residual risk:

- Registry ownership remains a governance/trust boundary for future projects that do not pin a project-specific hook.
  `nana-buyback-hook-v6/RISKS.md` documents that unpinned projects fall back to the mutable default for their cohort
  and recommends explicitly pinning with `setHookFor(...)` / `lockHookFor(...)` where appropriate.

Verification:

- `forge test --root nana-buyback-hook-v6 --match-path test/regression/RegistryDefaultHookHijack.t.sol --summary --detailed`:
  1 passed.
- `forge test --root nana-buyback-hook-v6 --match-path 'test/regression/*DefaultHook*.t.sol' --summary --detailed`:
  11 passed.
- `forge test --root nana-buyback-hook-v6 --match-path test/Registry.t.sol --summary --detailed`: 37 passed.

### BUYBACK-03. Registry-scoped metadata is rekeyed to the resolved buyback hook

Status: REVIEWED / ALREADY COVERED

Scope:

- `nana-buyback-hook-v6/src/JBBuybackHookRegistry.sol`
- `nana-buyback-hook-v6/test/regression/RegistryMetadataBoundary.t.sol`
- `nana-buyback-hook-v6/test/regression/ExplicitCashOutMinNoPoolGap.t.sol`
- `nana-buyback-hook-v6/test/audit/CodexNemesisRegistryCashOutMetadata.t.sol`

Result:

- `beforePayRecordedWith(...)` resolves the project's hook, then remaps `quote` metadata keyed to the registry address
  into equivalent metadata keyed to the resolved hook address before forwarding.
- `beforeCashOutRecordedWith(...)` performs the same remap for `cashOutMinReclaimed` metadata.
- This prevents a mismatch where payers scope metadata to the registry as the configured data hook, but the underlying
  buyback hook silently ignores it because its metadata key is address-specific.

Verification:

- `forge test --root nana-buyback-hook-v6 --match-contract 'RegressionRegistryMetadataBoundaryTest|ExplicitCashOutMinNoPoolGapTest|CodexNemesisRegistryCashOutMetadataTest' --summary --detailed`:
  4 passed.

### HANDLES-01. `nana-project-handles-v6`: malformed ENS resolver return data can revert handle lookup

Status: VERIFIED SMART-CONTRACT FINDING / FIXED IN WORKTREE

Affected code:

- `nana-project-handles-v6/src/JBProjectHandles.sol`
- Regression update: `nana-project-handles-v6/test/CodexMalformedResolver.t.sol`

Root cause:

- `JBProjectHandles.handleOf(...)` used a high-level `ITextResolver.text(...)` call inside `try/catch`.
- Resolver reverts were caught and mapped to `""`, but successful calls with malformed ABI return data still caused
  Solidity's return-data decoding to revert.
- This made malformed resolver data inconsistent with the documented soft-fail model for ENS lookup failures.

Impact:

- Low severity read-path liveness issue. The contract holds no funds and the bad resolver cannot forge a verified
  handle, but a broken or malicious resolver for a stored name could make `handleOf(...)` revert for consumers that
  expect unverified handles to resolve empty.

Fix applied:

- Replaced the high-level resolver text call with a low-level `staticcall`.
- Added minimal ABI validation for a single returned `string`: return data must include the dynamic offset, length, and
  enough bytes for the string contents.
- The hardcoded ENS registry is treated as trusted for resolver lookup, while the resolver it returns remains
  name-owner controlled and untrusted.
- Invalid resolver return data, resolver reverts, no resolver, and no ENS registry code all now resolve to `""`.

Verification after fix:

- `forge test --root nana-project-handles-v6 --match-path test/CodexMalformedResolver.t.sol --summary --detailed`:
  4 passed.
- `forge fmt --root nana-project-handles-v6 --check`: passed.
- `forge test --root nana-project-handles-v6 --fail-fast --summary --detailed`: exit code 0 across 6 suites and 70
  tests.

Formal follow-up:

- Added `test/formal/JBProjectHandlesHalmos.t.sol`, a narrow Halmos target for `_textRecordOf(...)`. The proof pins
  successful valid-record copying, the inclusive 256-byte cap, oversized-record rejection, resolver revert soft-fail,
  minimum ABI-shape rejection, noncanonical-offset rejection, overstated-length rejection, and the ENS text selector.
- Added a dedicated Halmos CI workflow for that target. This keeps the resolver-controlled return-data behavior
  machine-checked without changing production code.

Verification after formal follow-up:

- `forge fmt --root nana-project-handles-v6 --check`: passed.
- `forge test --root nana-project-handles-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`: exit
  code 0 across 6 suites and 70 tests.
- `forge build --root nana-project-handles-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**'`: passed;
  `JBProjectHandles` runtime size 5,871 bytes with 18,705 bytes of runtime margin.
- `halmos --root nana-project-handles-v6 --match-contract JBProjectHandlesHalmos --loop 300 --solver-threads 1
  --solver-timeout-assertion 30s --statistics`: 8 passed across 8 total paths; symbolic test time 0.48s.

### OWNABLE-01. `nana-ownable-v6`: project-ownership transfer with zero `PROJECTS` reverts opaquely

Status: ACCEPTED DEPLOYMENT ASSUMPTION / DOCUMENTED

Affected code:

- `nana-ownable-v6/src/JBOwnableOverrides.sol`
- Risk documentation: `nana-ownable-v6/RISKS.md`

Root cause:

- Address-owned deployments are allowed to pass `PROJECTS = address(0)` because they do not need project-owner
  resolution.
- If that owner later called `transferOwnershipToProject(...)`, the function reached `PROJECTS.count()` on the zero
  address and reverted through an opaque external-call/return-data failure instead of the existing explicit
  zero-projects error.

Impact:

- Low severity integration/liveness issue. It does not grant unauthorized ownership, but it made an invalid ownership
  transition fail unclearly and bypassed the repo's intended deployment-surface guard.

Resolution:

- Constructor dependencies are treated as deployment-time invariants, so `PROJECTS = address(0)` is not a
  runtime-supported configuration.
- Removed the extra zero-address guard and documented the assumption in `RISKS.md`.

Verification after fix:

- `forge fmt --root nana-ownable-v6 --check`: passed.
- `forge test --root nana-ownable-v6 --fail-fast --summary --detailed`: exit code 0 across 11 suites and 50 tests,
  including stale-permission, burn-lock, root-permission, unminted-project, and invariant coverage.

Formal follow-up:

- Added `test/formal/JBOwnableHalmos.t.sol`, a small Halmos target for the local ownership state machine. It proves
  address transfers clear project ownership and permissions, project transfers clear address ownership and resolve via
  the project NFT, renounce clears all ownership state, dual address/project ownership reverts, oversized project IDs
  are rejected by the public project-transfer path, and zero-address public transfers revert.
- Added a dedicated Halmos CI workflow for that target. This is deliberately scoped to local owner-state transitions;
  full `JBPermissions` authorization behavior remains covered by the existing Foundry regression and invariant suites.

Verification after formal follow-up:

- `forge fmt --root nana-ownable-v6 --check`: passed.
- `forge test --root nana-ownable-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`: 50 passed
  across 11 suites.
- `forge build --root nana-ownable-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**' --skip
  SphinxUtils`: passed; `JBOwnable` runtime size is 2,902 bytes with 21,674 bytes of EIP-170 margin.
- `halmos --root nana-ownable-v6 --match-contract JBOwnableHalmos --solver-threads 1 --solver-timeout-assertion 30s
  --statistics`: 6 passed across 20 total paths; symbolic test time 0.12s.

### FEEDEPLOY-01. `nana-fee-project-deployer-v6`: fee-project replay guard accepted wrong-but-plausible NANA revnets

Status: VERIFIED DEPLOYMENT FINDING / FIXED IN WORKTREE

Affected code:

- `nana-fee-project-deployer-v6/script/Deploy.s.sol`
- Regression update: `nana-fee-project-deployer-v6/test/regression/RegressionCanonicalGuard.t.sol`
- `deploy-all-v6/script/Deploy.s.sol`
- New regression: `deploy-all-v6/test/regression/DeployCanonicalNanaGuard.t.sol`

Root cause:

- The standalone fee-project deployer skipped deployment when project `1` already had a controller and passed a weak
  canonical check.
- That check required ownership by the Revnet deployer, the expected controller, a nonzero Revnet configuration hash,
  and the token symbol `NANA`.
- A pre-existing project `1` could be configured through the same `REVDeployer` with symbol `NANA` but the wrong
  Revnet hash, fee-revnet dependency, operator, URI, reserved split, or terminal setup. The script would then return
  early and accept the wrong project as canonical.

Impact:

- Deployment-only, but high blast radius for standalone fee-project rollouts and rehearsals: project `1` is the
  ecosystem fee sink.
- A wrong-but-Revnet-shaped project `1` could silently preserve incorrect economics or operator authority instead of
  failing closed.

Fix applied:

- The skip guard now computes the exact expected Revnet configuration hash using the same encoding surface as
  `REVDeployer`.
- The standalone `_feeProjectIsCanonical(...)` and deploy-all NANA replay guard now also check:
  - `REVDeployer.FEE_REVNET_ID() == 1`;
  - `REVDeployer.isOperatorOf(1, canonicalOperator)`;
  - token symbol and project URI;
  - the reserved-token split routes 100% to the canonical operator with no hook/project redirect;
  - native terminal primary routing and accounting context match the intended setup;
  - the router-terminal registry is installed as a project terminal.
- Updated repo docs to state that replay/idempotence checks must prove exact canonical shape before skipping.

Verification after fix:

- `forge test --root nana-fee-project-deployer-v6 --match-path test/regression/RegressionCanonicalGuard.t.sol -vv`:
  5 passed.
- `forge test --root nana-fee-project-deployer-v6 --match-path 'test/regression/*.t.sol' -vv`: 19 passed.
- `forge fmt --root nana-fee-project-deployer-v6 --check`: passed.
- `forge build --root nana-fee-project-deployer-v6 --deny notes --skip '*/test/**'`: passed.
- `forge test --root nana-fee-project-deployer-v6 --no-match-path '*Fork.t.sol' --fail-fast --summary --detailed`:
  exit code 0 across 8 suites and 91 tests.
- `forge test --root nana-fee-project-deployer-v6 --match-path test/FeeProjectDeployerFork.t.sol -vv`: 4 passed.
- `forge test --root deploy-all-v6 --match-path test/regression/DeployCanonicalNanaGuard.t.sol -vv`: 1 passed.
- `forge test --root deploy-all-v6 --match-contract 'FullStackForkTest|EcosystemForkTest|BuybackRouterForkTest|LPBuybackInteropForkTest' --fail-fast --summary --detailed`:
  exit code 0 across 5 fork suites and 34 tests, covering full native/USDC revnet lifecycles, buyback routing,
  LP-split/buyback interop, 721 splits, sucker-exempt cash-outs, and router-pay paths.
- `forge fmt --root deploy-all-v6 --check`: passed.
- `forge build --root deploy-all-v6 --deny notes --skip '*/test/**'`: passed.

## Reconciled Items

### PAYER-01. `nana-project-payer-v6` is deployed and verified by `deploy-all-v6`, but omitted from root architecture scope

Status: DOC FIXED / INVENTORY GAP CLOSED

Evidence:

- Root `ARCHITECTURE.md` and `USER_JOURNEYS.md` now include `nana-project-payer-v6` as a first-class utility
  infrastructure package.
- `deploy-all-v6/package.json` depends on `@bananapus/project-payer-v6` `^0.0.14`.
- `deploy-all-v6/script/Deploy.s.sol` imports `JBProjectPayerDeployer`, deploys it with
  `PROJECT_PAYER_DEPLOYER_SALT`, and serializes both the deployer and its `JBProjectPayer` implementation.
- `deploy-all-v6/script/Verify.s.sol` imports `JBProjectPayer` / `JBProjectPayerDeployer`, loads
  `VERIFY_PROJECT_PAYER_DEPLOYER`, and checks deployer code, deployer directory wiring, implementation code,
  implementation `DIRECTORY()`, and implementation `DEPLOYER()`.

Impact:

- Not a runtime bug by itself.
- Audit/readiness docs are inconsistent: the prior report includes ProjectPayer as an add-on, while the root ecosystem
  architecture omits a package that the canonical deployment now deploys and verifies.

Fix applied:

- Added `nana-project-payer-v6` to the root architecture scope list, foundation/utility layer, wrapper trust-boundary
  text, and repository-role table.
- Added `nana-project-payer-v6` to the root user-journey index and the standard treasury hand-off list.

### CORE-SPLITS-01. `nana-core-v6` split namespaces and lock scope are documented and covered

Status: REVIEWED / DOCUMENTATION UPDATED

Scope:

- `nana-core-v6/src/JBSplits.sol`
- `nana-core-v6/src/structs/JBSplit.sol`
- `nana-core-v6/RISKS.md`
- `nana-core-v6/test/units/static/JBSplits/*.sol`

Result:

- Self-managed split groups are gated by `groupId`: the lower 160 bits must equal `msg.sender` and the upper 96 bits
  must be nonzero. Bare address group IDs, including payout group IDs derived from token addresses, still require
  controller authorization.
- Locked splits are enforced when rewriting the same `(projectId, rulesetId, groupId)` table. The replacement table
  must include an exact matching locked split, with the same percent and routing fields and a `lockedUntil` that is at
  least as long. Duplicate locked splits must now be preserved with the same multiplicity; see `CORE-06`.
- Locks intentionally do not carry across different ruleset IDs. This is now documented as configuration/governance
  scope rather than treated as a protocol bypass.
- Updated `nana-core-v6/RISKS.md` to remove stale text that implied locked split percentages could be reduced inside
  the same table by a duplicate tuple. Current code requires an exact percent match and duplicate multiplicity.

Verification:

- `forge test --root nana-core-v6 --match-path 'test/units/static/JBSplits/*.sol' --summary --detailed`: 39 passed
  across self-managed namespace, locked-split, packing, set, and lookup suites.
- `forge fmt --root nana-core-v6 --check`: passed.

### PAYER-02. Prior ProjectPayer implementation-verifier gap is fixed in this checkout

Status: RECHECKED / RESOLVED

Prior issue:

- `AUDIT_REPORT.md` Current Open Edge Case T said the deploy-all verifier accepted arbitrary
  `JBProjectPayerDeployer.IMPLEMENTATION()` code.

Current evidence:

- `deploy-all-v6/script/Verify.s.sol` now checks:
  - `implementation.code.length > 0`
  - `JBProjectPayer(implementation).DIRECTORY() == directory`
  - `JBProjectPayer(implementation).DEPLOYER() == address(projectPayerDeployer)`
- `deploy-all-v6/test/regression/PostDeployConstructorImplementationArtifactGap.t.sol` verifies that the
  constructor-created ProjectPayer implementation is included in build artifacts and emitted in address dumps.
- `forge test --match-path test/regression/PostDeployConstructorImplementationArtifactGap.t.sol -vv` in
  `deploy-all-v6`: 1 test passed.
- `forge test --skip '*/fork/**' -vv` in `nana-project-payer-v6`: 60 tests passed across unit, edge, audit, and
  regression suites.
- `forge build --deny notes --sizes --skip '*/test/**' --skip '*/script/**'` in `nana-project-payer-v6`: passed;
  `JBProjectPayer` runtime size 6,559 bytes and `JBProjectPayerDeployer` runtime size 979 bytes.

Residual risk:

- Full fork coverage still depends on `RPC_ETHEREUM_MAINNET`.
- The root docs still need inventory cleanup per PAYER-01.

### DOC-01. Prior report's repo-local `REVIEW_GUIDE.md` inventory claim is stale

Status: DOC / INVENTORY GAP

Evidence:

- `rg --files -g 'REVIEW_GUIDE.md'` from the workspace root returns no files.
- `AUDIT_REPORT.md` says a doc inventory confirmed every active repo and `nana-project-payer-v6` has
  `REVIEW_GUIDE.md`, `RISKS.md`, and `USER_JOURNEYS.md`.

Impact:

- Not a protocol bug.
- This weakens audit reproducibility because future reviewers may look for a file class that is not present.

Recommended fix:

- Future audit summaries should name the actual repo-local docs used: `ARCHITECTURE.md`, `AUDIT_INSTRUCTIONS.md`,
  `RISKS.md`, and `USER_JOURNEYS.md` where available.

### SUCKER-BRIDGE-01. Registered sucker cash-outs intentionally use local backing

Status: REVIEWED / ACCEPTED DESIGN CLARIFICATION

Scope:

- `revnet-core-v6/src/REVOwner.sol`
- `nana-omnichain-deployers-v6/src/JBOmnichainDeployer.sol`
- `croptop-core-v6/src/CTDeployer.sol`

Result:

- The registered-sucker cash-out branch is the bridge movement path, not an ordinary holder cash-out.
- It should return 0 tax/no fee while keeping `context.totalSupply` and `context.surplus.value` local to the source
  chain, even when ordinary holder cash-outs for the same project are unscoped and aggregate remote snapshots.
- This keeps value moved out by a sucker proportional to the funds on that chain.

Documentation and tests:

- Added inline comments at each sucker early-return branch.
- Updated `revnet-core-v6/RISKS.md`, `nana-omnichain-deployers-v6/RISKS.md`, and `croptop-core-v6/RISKS.md`.
- Regression tests now assert that ordinary unscoped holder cash-outs can include remote state, while registered
  sucker cash-outs remain local-backed.

Verification:

- `forge test --root revnet-core-v6 --match-path test/regression/ScopeCashOutsToLocalBalancesConditional.t.sol -vv`:
  5 passed.
- `forge test --root croptop-core-v6 --match-path test/CTDeployer.t.sol -vv`: 24 passed.
- `forge test --root nana-omnichain-deployers-v6 --match-path test/JBOmnichainDeployer.t.sol -vv`: 18 passed.
- `forge fmt --root revnet-core-v6 --check`, `forge fmt --root croptop-core-v6 --check`, and
  `forge fmt --root nana-omnichain-deployers-v6 --check`: passed.

### SUCKER-02. Sucker bridge-bound balance windows pass current invariant coverage

Status: REVIEWED / NO CODE FINDING IN THIS PASS

Focus:

- Rechecked `JBSucker.prepare(...)`, `_pullBackingAssets(...)`, `_insertIntoTree(...)`, `toRemote(...)`,
  `_sendRoot(...)`, `claim(...)`, `_addToBalance(...)`, and emergency exits.
- Rechecked bridge-specific send implementations in `JBOptimismSucker`, `JBArbitrumSucker`, `JBCCIPSucker`,
  `JBCeloSucker`, and the swap extension `JBSwapCCIPSucker`.
- Focused on the known bridge-bound accounting window where `_sendRoot(...)` clears `outbox.balance` before the
  implementation-specific bridge transfer completes.

Result:

- No fresh invariant break was confirmed in this pass.
- The deleted-outbox window can transiently increase `amountToAddToBalanceOf(token)` during the same transaction, but
  persisting a claim against bridge-bound value requires the bridge/token send path to return success without moving
  the funds. With honest bridge/token movement, consuming the bridge-bound portion leaves the later bridge transfer
  underfunded and reverts the whole transaction.
- Existing exact-delta `assert(...)` checks in `_pullBackingAssets(...)` and `_addToBalance(...)` are harsh but
  consistent with the repo's documented non-support for fee-on-transfer, rebasing, or adversarial terminal tokens.
- The remaining risk is trust-boundary, not a clean protocol-accounting exploit: bridge contracts, official wrapped
  native tokens, CCIP fee token behavior, and terminal token assumptions must hold.

Verification:

- `forge test --root nana-suckers-v6 --match-contract 'SuckerInvariantsTest|TestRegressionGaps|InitialSwapReentrantClaimTest|TransientClaimContextRegression|SwapPartialFillRemainderTest|RegressionSwapQueueOrderTest' -vv`:
  35 passed.

### 721-01. `nana-721-hook-v6` tier split, reserve, and cash-out timing pass current invariant coverage

Status: REVIEWED / NO CODE FINDING IN THIS PASS

Focus:

- Mapped the payment path from `JBMultiTerminal.pay(...)` through `JB721TiersHook.beforePayRecordedWith(...)`,
  `JB721TiersHook.afterPayRecordedWith(...)`, `JB721TiersHookLib.distributeAll(...)`, and store mint accounting.
- Mapped the NFT cash-out path from `JB721Hook.beforeCashOutRecordedWith(...)` through
  `JBMultiTerminal._cashOutTokensOf(...)`, `JB721Hook.afterCashOutRecordedWith(...)`, `_burn(...)`, and
  `JB721TiersHookStore.recordBurn(...)`.
- Rechecked the main high-risk surfaces named by the repo risk register: reserve slot protection, pending-reserve
  dilution, split-credit scaling, same-currency decimal scaling, safe-transfer reentrancy, checkpoint transfer updates,
  and tier removal/listing behavior.

Result:

- No fresh invariant break was confirmed in this pass.
- The risky-looking split/cash-out economics are mostly configuration-level behavior already represented in the repo:
  split-routed tier payments can reduce project-balance inflow, credits can underfund split-bearing mints, discounts
  do not reduce cash-out weight, and pending reserves dilute cash-out values before they are minted.
- Reentrancy during ERC-721 receiver callbacks and split-hook callbacks is regression-covered. The terminal records
  pay balance net of split-routed hook amounts before later split distribution, the 721 hook mints before distributing
  split proceeds, and the hook uses `_mint` rather than `safeMint`, so the reviewed split path has no ERC-721 receiver
  callback window before accounting is finalized.
- NFT cash-out reentry did not produce a confirmed break: same-token nested cash-out reverts the outer path by
  changing ownership before the later burn, and distinct-token nested cash-outs are equivalent to sequential
  cash-outs because the terminal balance is decremented before external value transfer.

Verification:

- `forge test --root nana-721-hook-v6 --skip '*/Fork.t.sol' --fail-fast --summary --detailed`: exit code 0.
- Note: the skip pattern did not exclude `test/fork/*Fork.t.sol`; those fork-labeled suites also ran and passed in
  this local environment.

### 721-02. Pay-hook forwarded value and split metadata are now conservation-checked

Status: FIXED

Finding:

- `JB721Hook.afterPayRecordedWith(...)` trusted the terminal/composer to keep `msg.value`, `context.forwardedAmount`,
  and `context.hookMetadata` aligned.
- `JB721TiersHookLib.distributeAll(...)` decoded per-tier split amounts but did not require their sum to equal the
  forwarded amount. A malformed terminal/composer callback could therefore over-forward ETH/ERC-20 value or mutate
  split metadata so the hook retained undistributed funds.

Fix applied:

- `JB721Hook.afterPayRecordedWith(...)` now rejects native `msg.value` mismatches and rejects stray ETH on non-native
  forwarded payments.
- `JB721TiersHook._processPayment(...)` now rejects nonzero forwarded amounts without split metadata.
- `JB721TiersHookLib.distributeAll(...)` now rejects split metadata with mismatched array lengths or amounts whose sum
  differs from the forwarded amount before pulling ERC-20 tokens or distributing native value.
- `nana-721-hook-v6/RISKS.md` documents the pay metadata shape, forwarded-value conservation, removed-tier reserve
  semantics, and future-tier URI authority.

Verification:

- Added malformed-terminal regressions in `nana-721-hook-v6/test/regression/RepoEdgeCases.t.sol`.
- Added fork assertions in `nana-721-hook-v6/test/fork/ERC20TierSplitFork.t.sol` that real `JBMultiTerminal` ERC-20
  and native split payments leave no balance stranded in the hook.
- `forge test --root nana-721-hook-v6 --match-path test/regression/RepoEdgeCases.t.sol --summary --detailed`: 6
  passed.
- `forge test --root nana-721-hook-v6 --match-path test/fork/ERC20TierSplitFork.t.sol --summary --detailed`: 3
  passed.
- `forge test --root nana-721-hook-v6 --match-path 'test/{unit/tierSplitRouting_Unit.t.sol,unit/splitHookDistribution_Unit.t.sol,unit/pay_Unit.t.sol,regression/Erc20SplitAllowanceConsumption.t.sol,regression/SplitCreditsMismatch.t.sol,regression/BrokenTerminalDoesNotDos.t.sol,regression/SplitDistributionBugs.t.sol,regression/RepoEdgeCases.t.sol}' --summary --detailed`:
  63 passed.
- `forge test --root nana-721-hook-v6 --no-match-path 'test/fork/*' --fail-fast --summary --detailed`: all listed
  non-`test/fork` suites passed; this command also includes the local `test/Fork.t.sol` suite, which passed 57 tests.

### 721-03. `nana-721-hook-v6`: trailing removed tiers survived `cleanTiers` traversal

Status: VERIFIED LOW-SEVERITY LIVENESS FINDING / FIXED IN WORKTREE

Affected code:

- `nana-721-hook-v6/src/JB721TiersHookStore.sol`
- Regression update: `nana-721-hook-v6/test/unit/RegressionFixes_Unit.t.sol`
- Test helper update: `nana-721-hook-v6/test/utils/ForTest_JB721TiersHook.sol`
- Risk docs: `nana-721-hook-v6/RISKS.md`

Root cause:

- `cleanTiers(...)` relinked active tiers around removed IDs, but it did not update the sorted-list end when the
  removed ID was the trailing sorted tier.
- `tiersOf(...)` still skipped the removed tier, so the returned tier list was correct. The problem was traversal
  cost: views could continue walking a removed trailing suffix after cleanup.

Impact:

- No minting, cash-out, or value-accounting corruption was confirmed.
- The issue is a low-severity liveness/gas inefficiency for large removed trailing suffixes.

Fix applied:

- After the cleanup walk, if at least one active tier remains and all later sorted IDs were removed, `cleanTiers(...)`
  clears the last active tier's next pointer and records it as the compacted sorted-list end.
- `maxTierIdOf` remains historical and monotonic; only the sorted traversal end is compacted.

Verification:

- `forge test --root nana-721-hook-v6 --match-contract Test_RegressionFixes_Unit --match-test test_cleanTiersCompactsRemovedTrailingTier --summary --detailed`:
  1 passed.
- `forge test --root nana-721-hook-v6 --match-contract 'Test_RegressionFixes_Unit|Test_adjustTier_Unit' --match-test 'test_cleanTiers|test_F13|test_tiersOf_recentlyAddedTiersFetchedFirstWhenSortedAfterTiersCleaned' --summary --detailed`:
  3 passed for the regression-fix clean-tier group.
- `forge test --root nana-721-hook-v6 --match-path test/unit/adjustTier_Unit.t.sol --summary --detailed`: 23
  passed, including the existing 4096-run tier add/remove and cleanup fuzz tests.
- `forge test --root nana-721-hook-v6 --no-match-path 'test/fork/*' --fail-fast --summary --detailed`: exit code
  0 across 51 suites, including `test/Fork.t.sol`, `TieredHookStoreInvariant`, and `TierLifecycleInvariant`.
- CI surfaced `JB721TiersHook` at 24,579 bytes, 3 bytes over EIP-170. Dropping the nonessential
  `MissingSplitMetadata` error payload brought it to 24,572 bytes, leaving a 4-byte runtime margin under
  `forge build --root nana-721-hook-v6 --deny notes --sizes --skip "*/test/**" --skip "*/script/**" --skip SphinxUtils`.

### DEFIFA-01. Defifa fulfillment, fee accounting, and reserve dilution pass current invariant coverage

Status: REVIEWED / NO CODE FINDING IN THIS PASS

Focus:

- Mapped game launch through `DefifaDeployer.launchGameWith(...)`, `_buildSplits(...)`, `_launchGame(...)`, and final
  ruleset queuing.
- Mapped scorecard submission, BWA attestation, quorum/timelock state, ratification, and commitment fulfillment through
  `DefifaGovernor` and `DefifaDeployer.fulfillCommitmentsOf(...)`.
- Mapped NFT mint, refund/no-contest cash-out, complete-phase weighted cash-out, reserve minting, and fee-token claims
  through `DefifaHook` and `DefifaHookLib`.
- Rechecked the sensitive phase boundary where `cashOutWeightIsSet` makes `currentGamePhaseOf(...)` report COMPLETE
  before `fulfillCommitmentsOf(...)` has queued the final ruleset.

Result:

- No fresh invariant break was confirmed in this pass.
- The apparent fulfillment reentrancy window is constrained by terminal accounting: `sendPayoutsOf(...)` records the
  payout and reduces the game balance before split hooks run, while the active scoring ruleset still reserves the
  remaining balance under its payout limit. A split hook cannot cash out against the pre-fee pot in that window.
- Commitment payout failures are already caught by `fulfillCommitmentsOf(...)`; failed fee portions remain in the pot
  and `fulfilledCommitmentsOf` is reset so game-pot reporting does not double-count them.
- Pending reserves are included in quorum, BWA snapshots, cash-out denominators, and fee-token claim denominators in
  the reviewed paths. Refund burns reduce pending reserve availability before reserve minting can inflate
  `totalMintCost`.

Verification:

- `forge test --root defifa --match-path test/regression/FulfillmentBlocksRatification.t.sol -vv`: 1 passed.
- `forge test --root defifa --match-path test/DefifaFeeAccounting.t.sol -vv`: 6 passed.
- `forge test --root defifa --match-path test/regression/AdjustedPendingReserves.t.sol -vv`: 8 passed.
- `forge test --root defifa --match-path test/regression/FixPendingReserveDilution.t.sol -vv`: 2 passed.
- `forge test --root defifa --no-match-path '*Fork.t.sol' --fail-fast --summary --detailed`: exit code 0 across
  210 non-fork tests, including governance, security, no-contest, ERC-20, fulfillment-window, and mint-cost invariant
  suites.
- `halmos --root defifa --match-contract DefifaHookLibHalmos --solver-threads 1 --solver-timeout-assertion 30s --statistics`:
  3 passed, 0 failed, 15 symbolic paths, 0.06s symbolic test time.
- `forge test --root defifa --match-path test/Fork.t.sol --deny notes --fail-fast --summary --detailed`: 69 fork
  tests passed after pinning the fork to Ethereum block 21,700,000.
- `forge test --root defifa --deny notes --fail-fast --summary --detailed --skip '*/script/**'`: 299 tests passed,
  including the pinned fork suite and mint-cost invariant campaign.
- `forge build --root defifa --deny notes --sizes --skip '*/test/**' --skip '*/script/**' --skip SphinxUtils`: passed;
  `DefifaHook` reported 24,254 bytes with 322 bytes of runtime margin.

### BANNY-01. Banny resolver custody, body-transfer semantics, and anti-stranding behavior pass current coverage

Status: REVIEWED / NO CODE FINDING IN THIS PASS

Focus:

- Mapped `Banny721TokenUriResolver.decorateBannyWith(...)`, `_decorateBannyWithBackground(...)`,
  `_decorateBannyWithOutfits(...)`, `_storeOutfitsWithRetained(...)`, `assetIdsOf(...)`, `wearerOf(...)`,
  `userOf(...)`, `onERC721Received(...)`, SVG hash/content publication, and ERC-2771 sender handling.
- Rechecked the high-risk custody rules from the repo docs: only the body owner can decorate; unworn assets require
  direct asset ownership; assets already attached to a body can be moved by that body's owner; outfit locks block
  reassignment from locked source bodies; and failed safe-transfer returns retain resolver state instead of clearing it.

Result:

- No fresh invariant break was confirmed in this pass.
- Equipped outfits/backgrounds are intentionally held by the resolver and keyed to the body token ID. When the body NFT
  changes owner, the new body owner controls attached assets and can unequip them after any active lock expires.
- Failed returns to a contract owner that cannot receive ERC-721s preserve attachment state, which is the intended
  anti-stranding tradeoff. The merged retained/new outfit set is revalidated for exclusivity, duplicate categories,
  and canonical category order before storage.
- The resolver only accepts safe transfers it initiated itself. Direct `transferFrom` to the resolver bypasses
  `onERC721Received` and is an ERC-721 limitation already documented in the contract/risk notes.
- Burned body tokens can strand resolver-held assets because the body owner lookup reverts. This is covered as an
  accepted limitation. Burning or otherwise mutating resolver-held accessory ownership requires a malformed or trusted
  hook path; against the canonical Nana 721 cash-out hook, a token can only be burned when the cash-out holder is the
  current NFT owner.

Verification:

- `forge test --root banny-retail-v6 --skip '*/script/**' --match-path 'test/regression/*.t.sol' -vv`: 35 passed.
- `forge test --root banny-retail-v6 --skip '*/script/**' --match-path test/DecorateFlow.t.sol -vv`: 44 passed.
- `forge test --root banny-retail-v6 --skip '*/script/**' --match-path test/OutfitTransferLifecycle.t.sol -vv`:
  7 passed.
- `forge test --root banny-retail-v6 --skip '*/script/**' --match-path test/TestQALastMile.t.sol -vv`: 3 passed.
- `forge test --root banny-retail-v6 --skip '*/script/**' --no-match-path '*Fork.t.sol' --fail-fast --summary --detailed`:
  exit code 0 across 19 non-fork suites and 166 tests.
- `forge test --root banny-retail-v6 --match-path test/Fork.t.sol --summary --detailed`: 79 passed.

Formal follow-up:

- Added `test/formal/BannyResolverHalmos.t.sol`, a narrow Halmos target for the resolver helpers that gate category
  labels and retained-outfit membership checks.
- The proof pins all supported category IDs `{0..17}` to their expected display names, proves unknown category `18`
  soft-resolves to an empty string, proves retained-outfit membership finds every checked slot, rejects missing values,
  and handles empty/single-value arrays.

Verification after formal follow-up:

- `forge fmt --root banny-retail-v6 --check`: passed.
- `halmos --root banny-retail-v6 --match-contract BannyResolverHalmos --solver-threads 1
  --solver-timeout-assertion 30s --statistics`: 4 checks passed across 19 symbolic paths in 0.07s test time; first
  compile took 71.30s.
- `forge test --root banny-retail-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`: passed.
- `forge build --root banny-retail-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**' --skip SphinxUtils`:
  passed. Runtime margin: `Banny721TokenUriResolver` 456 bytes.

### BANNY-02. `banny-retail-v6` standalone deploy build drift is closed

Status: FIXED / BUILD VERIFIED

Issue:

- The standalone Banny package no longer compiled after dependency/API drift. Its dependency graph resolved
  `@croptop/core-v6@0.0.48`, whose publisher/deployer code still called `IJB721TiersHook.PROJECT_ID()`, while the
  current 721 hook exposes `projectId()`.
- After updating Croptop resolution, the Banny deploy script reached a second stale reference,
  `revnet.basic_deployer`, while the current Revnet deployment helper struct exposes `basicDeployer`.
- The outfit migration generator also emitted Solidity snippets with `hook.PROJECT_ID()`, so generated migration
  contracts would have recreated the same API mismatch.

Fix:

- Added a direct `@croptop/core-v6` package dependency at the fixed published line so Banny's Foundry remapping resolves
  the compatible Croptop code.
- Updated `script/Deploy.s.sol` to use `revnet.basicDeployer`.
- Updated `script/outfit_drop/generate-migration.js` to generate `hook.projectId()` calls.

Verification:

- `forge build --root banny-retail-v6 --deny notes`: passed.
- `forge test --root banny-retail-v6 --match-path 'test/regression/*.t.sol' --summary --detailed`: 35 passed.
- `forge test --root banny-retail-v6 --no-match-path 'test/Fork.t.sol' --summary --detailed`: 166 passed.
- `forge test --root banny-retail-v6 --match-path test/Fork.t.sol --summary --detailed`: 79 passed.

### ADDRESS-01. `nana-address-registry-v6` provenance registration passes current invariant coverage

Status: REVIEWED / NO CODE FINDING IN THIS PASS

Focus:

- Mapped `JBAddressRegistry.registerAddress(...)` for both `CREATE` and `CREATE2`, `_registerAddress(...)`, and the
  `_addressFrom(...)` RLP encoding ladder.
- Rechecked deployment-helper reads in `AddressRegistryDeploymentLib` and production write-side integration in
  `JB721TiersHookDeployer`, `JBUniswapV4LPSplitHookDeployer`, and `DefifaDeployer`.
- Scanned smart-contract production source for `deployerOf(...)` consumers.

Result:

- No fresh invariant break was confirmed in this pass.
- The registry records deterministic provenance compatibility, not caller authentication or endorsement. Anyone can
  finalize a valid registration for another deployer's already-deployed contract; this is covered and documented as
  intentional.
- Pre-registration of undeployed `CREATE`/`CREATE2` addresses is blocked by the runtime-code check. First valid
  registration wins, and no production smart-contract source in the reviewed set currently uses `deployerOf(...)` as a
  runtime authorization gate.
- The `CREATE` derivation path is regression-covered across the RLP nonce boundaries up to `uint64.max`, including
  explicit rejection above that range. `CREATE2` uses standard `0xff || deployer || salt || initCodeHash` derivation.
- Added `test/formal/JBAddressRegistryHalmos.t.sol`, a small Halmos target that independently proves the CREATE
  address helper against explicit RLP reference encodings for nonce 0, direct one-byte nonces, prefixed one-byte
  nonces, every wider nonce-width boundary through `uint64.max`, and rejection above the supported bound.
- Added a dedicated Halmos CI workflow for that target so the proof lane stays separate from the normal Foundry test
  job and remains fast enough for pull-request gating.

Verification:

- `forge test --root nana-address-registry-v6 --match-path 'test/regression/*.t.sol' -vv`: 16 passed.
- `forge fmt --root nana-address-registry-v6 --check`: passed.
- `forge test --root nana-address-registry-v6 --no-match-path '*Fork.t.sol' --fail-fast --summary --detailed`:
  exit code 0 across 8 non-fork suites and 49 tests.
- `forge test --root nana-address-registry-v6 --fail-fast --summary --detailed --skip '*/script/**'`: 53 passed,
  including the fork checkpoint.
- `forge build --root nana-address-registry-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**' --skip
  SphinxUtils`: passed; `JBAddressRegistry` runtime size is 1,841 bytes with 22,735 bytes of EIP-170 margin.
- `halmos --root nana-address-registry-v6 --match-contract JBAddressRegistryHalmos --solver-threads 1
  --solver-timeout-assertion 30s --statistics`: 5 passed across 15 total paths; symbolic test time 0.07s.

### PERMISSION-01. `nana-permission-ids-v6` constants are canonical; stale local docs were corrected

Status: DOC FIX / NO RUNTIME CODE FINDING IN THIS PASS

Focus:

- Mapped `JBPermissionIds.sol` from `ROOT = 1` through `REPAY_LOAN = 39`.
- Rechecked local README/risk/user-journey docs for stale range and high-impact-ID descriptions.
- Scanned reviewed smart-contract production source for hardcoded numeric ecosystem permission IDs.

Result:

- No runtime permission-ID drift was found in production source. Downstream smart-contract code uses
  `JBPermissionIds.*` constants for ecosystem permission checks; the only numeric permission IDs found in source were
  sentinel `permissionId: 0` uses.
- Local permission-ID docs were stale: they described sucker permissions as `32-35`, Revnet permissions as `36-40`,
  and loan powers as `36/37/38`.
- Updated docs now reflect the source of truth:
  - sucker and omnichain deployment/lifecycle permissions are `32-36`;
  - Revnet loan permissions are `37-39`;
  - ID `40` is currently unassigned in `JBPermissionIds.sol`.

Verification:

- Stale-reference scan for `36-40`, `32-35`, old Revnet loan IDs, and old `through 40` phrasing: no remaining hits in
  non-vendored permission-ID docs.
- `forge fmt --root nana-permission-ids-v6 --check`: passed.
- `forge build --root nana-permission-ids-v6 --deny notes`: exit code 0; no files changed, compilation skipped.
- `forge test --root nana-permission-ids-v6 --deny notes --summary --detailed`: exit code 0; no tests found in this
  constants-only package.

Formal follow-up:

- Added `test/formal/JBPermissionIdsHalmos.t.sol`, a small Halmos target that pins the permission namespace as the
  exact contiguous sequence from `ROOT = 1` through `REPAY_LOAN = 39`.
- Added a dedicated Halmos CI workflow for that target. This package is constants-only, so the proof's purpose is
  explicit namespace drift detection rather than path exploration.

Verification after formal follow-up:

- `forge fmt --root nana-permission-ids-v6 --check`: passed.
- `forge build --root nana-permission-ids-v6 --deny notes`: passed.
- `forge test --root nana-permission-ids-v6 --deny notes --summary --detailed`: exit code 0; no tests found in this
  constants-only package.
- `halmos --root nana-permission-ids-v6 --match-contract JBPermissionIdsHalmos --solver-threads 1
  --solver-timeout-assertion 30s --statistics`: 2 passed across 2 total paths; symbolic test time 0.02s.

### ROUTER-UNI-01. Router terminal, buyback, Univ4 router, and LP-split cross-component paths pass current fork-backed coverage

Status: REVIEWED / FORK-BACKED; SEE ROUTER-TERM-01 FOR REGISTRY HARDENING

Focus:

- Rechecked `nana-router-terminal-v6`, `nana-buyback-hook-v6`, `univ4-router-v6`, `univ4-lp-split-hook-v6`, and the
  deploy-all fork harness as a composed routing/liquidity surface.
- Focused on cross-component failure modes where local unit tests can miss interaction bugs: V3/V4 route selection,
  buyback hook pay/cash-out handoff, router registry forwarding, partial-fill refunds, FOT token behavior, temporary
  allowances, LP-split fee-token accounting, terminal migration, cross-project isolation, and forked PoolManager /
  PositionManager address assumptions.

Result:

- Apart from the registry fail-fast hardening recorded in `ROUTER-TERM-01`, no fresh cross-component invariant break was
  confirmed in this pass.
- The router terminal's ERC-20 `addToBalanceOf(...)` receipt enforcement remains intentionally stricter than
  `pay(...)`: `pay(...)` must tolerate hook/registry/FOT compositions already represented in fork and regression
  tests, while `addToBalanceOf(...)` is expected to fail on lossy direct intake.
- Router refund and settlement tests cover the balance-baseline pattern so partial fills do not sweep pre-existing
  router balances. Callback checks cover V3 factory-verified callbacks and V4 PoolManager-only unlock callbacks.
- Univ4 router coverage exercises buy and sell routing, JB fallback, signed delta bounds, temporary allowance cleanup,
  exact min-output enforcement, TWAP/spot behavior, and project-state isolation on a mainnet fork.
- Reviewed the proposal to reject `amountOutMin == 0` for V4 pass-through swaps. This remains accepted behavior:
  `0` is an explicit no-minimum mode, so routers and relayers must preserve the user's intended floor and must not
  silently substitute zero for a protected intent.
- LP-split hook coverage exercises forked PoolManager/PositionManager integration, fee routing, terminal migration,
  cross-project isolation, token ID tracking, tick bounds, reserved-token dilution, and zero-rate edge cases.
- Deploy-all fork coverage confirms the major composed surfaces still work together in native and USDC revnet
  lifecycles. The deploy-all NANA exact replay guard itself is still protected by source-level regression plus
  standalone fee-project fork coverage; the Sphinx-gated deploy script is not directly invoked in the fork harness.

Verification:

- `forge fmt --root nana-router-terminal-v6 --check`: passed.
- `forge fmt --root univ4-router-v6 --check`: passed.
- `forge fmt --root univ4-lp-split-hook-v6 --check`: passed.
- `forge test --root nana-router-terminal-v6 --match-path 'test/regression/*.t.sol' --fail-fast --summary --detailed`:
  exit code 0 across the focused regression suites.
- `forge test --root univ4-router-v6 --match-path 'test/regression/*.t.sol' --fail-fast --summary --detailed`:
  exit code 0 across the focused regression suites.
- `forge test --root univ4-lp-split-hook-v6 --match-path 'test/regression/*.t.sol' --fail-fast --summary --detailed`:
  exit code 0 across the focused regression suites.
- `forge test --root nana-project-payer-v6 --match-path test/fork/ProjectPayerFork.t.sol -vv`: 5 passed.
- `forge test --root nana-buyback-hook-v6 --match-path 'test/fork/*.t.sol' --fail-fast --summary --detailed`: exit
  code 0 across 7 fork suites and 31 tests.
- `forge test --root nana-router-terminal-v6 --match-path 'test/fork/*.t.sol' --fail-fast --summary --detailed`:
  exit code 0 across 2 fork suites and 8 tests.
- `forge test --root nana-router-terminal-v6 --match-path 'test/*Fork.t.sol' --fail-fast --summary --detailed`:
  exit code 0 across 9 fork suites and 38 tests.
- `forge test --root univ4-router-v6 --match-path test/JBUniswapV4HookFork.t.sol --fail-fast --summary --detailed`:
  exit code 0 across 1 fork suite and 26 tests.
- `forge test --root univ4-lp-split-hook-v6 --match-path 'test/fork/*.t.sol' --fail-fast --summary --detailed`:
  exit code 0 across 18 fork suites and 42 tests.
- `forge test --root deploy-all-v6 --match-contract 'FullStackForkTest|EcosystemForkTest|BuybackRouterForkTest|LPBuybackInteropForkTest' --fail-fast --summary --detailed`:
  exit code 0 across 5 fork suites and 34 tests.

Formal follow-up:

- Added `nana-router-terminal-v6/test/formal/JBSwapLibHalmos.t.sol`, a Halmos target for router swap math. The proof
  pins zero-impact slippage floors, fee/overflow ceiling branches, zero-liquidity and zero-price impact soft-fails,
  zero-minimum/zero-input no-limit sentinels, and bounded positive price limits staying within the valid Uniswap V3
  sqrt-price range.
- Added a dedicated Halmos CI workflow for that target. The proof is intentionally limited to pure math helpers; full
  router state, callbacks, and market integration remain covered by the existing fork and invariant suites.

Verification after formal follow-up:

- `forge fmt --root nana-router-terminal-v6 --check`: passed.
- `forge test --root nana-router-terminal-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`: exit
  code 0 across 55 suites, including fork and invariant coverage.
- `forge build --root nana-router-terminal-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**'`: passed;
  `JBRouterTerminal` runtime size 23,429 bytes with 1,147 bytes of runtime margin.
- `halmos --root nana-router-terminal-v6 --match-contract JBSwapLibHalmos --solver-threads 1
  --solver-timeout-assertion 30s --statistics`: 8 passed; 4,967 total paths; symbolic test time 34.84s.
- PR #118 CI now reports `forge-fmt`, `forge-test`, and `halmos-smoke` passing.

### ROUTER-TERM-01. Router-terminal registry now fails explicitly when no terminal resolves

Status: HARDENED / REGRESSION AND FORK VERIFIED

Scope:

- `nana-router-terminal-v6/src/JBRouterTerminalRegistry.sol`
- `nana-router-terminal-v6/test/RouterTerminalRegistry.t.sol`

Finding:

- The registry deliberately lets `terminalOf(projectId)` and `defaultTerminalFor(projectId)` return
  `address(0)` for projects whose IDs predate any default terminal.
- Before this pass, `accountingContextForTokenOf(...)`, `accountingContextsOf(...)`, `previewPayFor(...)`,
  `pay(...)`, and `addToBalanceOf(...)` reused the nullable resolver directly. Transactional paths therefore started
  token acceptance / value forwarding setup before eventually failing on a downstream call to a zero terminal.
- Reverts roll back state in these paths, so this is not recorded as a confirmed permanent fund-loss exploit. The
  issue was that the registry depended on late external-call failure instead of enforcing its own terminal-resolution
  invariant before handling user funds.

Fix:

- Added `_requireResolvedTerminalOf(projectId)`, which keeps the public nullable lookup behavior but makes all
  passthrough view and transactional forwarding paths revert with `JBRouterTerminalRegistry_TerminalNotSet(projectId)`
  before they call a terminal or accept funds.
- Added cold-start cohort tests proving ERC-20 `pay(...)` and native `addToBalanceOf(...)` revert before moving value
  into the registry.

Verification:

- `forge fmt --root nana-router-terminal-v6 --check`: passed.
- `forge test --root nana-router-terminal-v6 --match-path test/RouterTerminalRegistry.t.sol --summary --detailed`:
  29 passed.
- `forge test --root nana-router-terminal-v6 --match-path 'test/regression/*.t.sol' --summary --detailed`: exit code
  0 across the router-terminal regression suites.
- `forge test --root nana-router-terminal-v6 --match-path 'test/fork/*.t.sol' --summary --detailed`: 8 passed across
  the FOT and V4 quote/settlement fork suites.

### ROUTER-UNI-02. V4/Juicebox cross-route arbitrage is accepted and bounded by project economics

Status: REVIEWED / NO CODE FINDING IN THIS PASS

Scope:

- `univ4-router-v6/src/JBUniswapV4Hook.sol`
- `univ4-router-v6/RISKS.md`
- `univ4-router-v6/test/TestStructuralArbitrage.t.sol`

Result:

- When the router chooses the Juicebox route, the V4 pool is not touched. This can leave a temporary price difference
  between the pool and the Juicebox bonding-curve route.
- Current router docs classify that as accepted cross-route arbitrage, not a missed payout fee path. The extraction is
  bounded by the project's surplus, cash-out tax, and route convergence; repeated extraction lowers the Juicebox
  reclaim value until V4 routing wins again.
- The remaining oracle risk is documented separately: new pools can use spot fallback during TWAP warmup, and mature
  TWAP manipulation requires sustained price movement rather than a single-block push.

Verification:

- `forge test --root univ4-router-v6 --match-path test/TestStructuralArbitrage.t.sol --summary --detailed`: 8 passed.

### LP-SPLIT-01. LP range manipulation via preinitialized pool or distorted terminal selection remains covered

Status: REVIEWED / FORK-BACKED NO CODE FINDING IN THIS PASS

Scope:

- `univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol`
- Pool pre-initialization, economic tick bounds, permissionless deployment terminal-token selection, and
  sucker-aware cash-out-rate inputs.

Result:

- A pool that already exists is accepted only if its current `sqrtPriceX96` is strictly inside the project's computed
  economic tick range. Out-of-band prices and exact boundary prices revert before the hook stores a pool key or marks
  the project as deployed.
- Permissionless `deployPool(...)` auto-selects the highest priced usable primary-terminal token, ignoring larger
  balances on non-primary terminals and skipping unpriced tokens when at least one priced token exists.
- `_getCashOutRate(...)` respects `scopeCashOutsToLocalBalances`: scoped projects avoid sucker-registry calls, while
  unscoped projects include remote sucker surplus and supply by design.
- I did not confirm a surplus-inflation exploit against the LP hook itself. The remaining risk is the upstream trust
  boundary: incorrect price feeds, malicious registered terminals, or bad sucker-registry snapshots can distort the
  Juicebox economic inputs that the LP hook deliberately uses.

Verification:

- `forge test --root univ4-lp-split-hook-v6 --match-contract 'PoolPriceFrontrunTest|AdversarialPoolInitTest|TickBoundsBoundaryEqualityTest|ScopeCashOutsLPHookTest|NonPrimaryBalanceSelectionDoSTest|UnpricedTokenSkipTest|RegressionFixM4Test|RegressionFixL6Test' --summary --detailed`:
  27 passed.
- `forge test --root univ4-lp-split-hook-v6 --match-contract PermissionlessDeployGriefingTest --summary --detailed`:
  4 passed.
- `forge test --root univ4-lp-split-hook-v6 --match-path test/fork/TickBoundsFork.t.sol --summary --detailed`: 2
  passed.

### LP-SPLIT-02. `univ4-lp-split-hook-v6`: partial V4 mints left residual Permit2 spend authority

Status: VERIFIED SMART-CONTRACT FINDING / FIXED IN WORKTREE

Affected code:

- `univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol`
- Updated regressions:
  - `univ4-lp-split-hook-v6/test/DeploymentStageTest.t.sol`
  - `univ4-lp-split-hook-v6/test/Fork.t.sol`

Root cause:

- `_mintPosition(...)` approves the canonical Permit2 contract for the maximum token amounts that may be settled by
  Uniswap V4 `PositionManager`, then grants `PositionManager` a short-lived Permit2 allowance.
- V4 minting can consume less than those max amounts, especially during partial-usage or price-shifted mint paths.
- Before this fix, the unused ERC-20 allowance to Permit2 and the unused Permit2 allowance to `PositionManager` stayed
  live until expiration or later overwrite.

Impact:

- This is a bounded approval-surface issue rather than a direct accounting over-credit. Exploitability depends on
  whether the approved `PositionManager` can be driven, before expiry, to pull hook-held tokens through the residual
  Permit2 allowance.
- The hook already avoids direct approval to `PositionManager`; the missing cleanup was the second-order Permit2
  allowance state.

Fix applied:

- After a successful `_modifyLiquidities(...)` mint call, `_mintPosition(...)` now clears Permit2's internal
  allowance for each non-native mint token and resets the ERC-20 allowance granted to Permit2 back to zero.
- Reverts still unwind the original approvals atomically.

Verification after fix:

- `forge test --root univ4-lp-split-hook-v6 --match-path test/DeploymentStageTest.t.sol --match-test test_DeployPool_PartialMintClearsPermit2Approvals --summary --detailed`:
  1 passed.
- `forge test --root univ4-lp-split-hook-v6 --match-path test/DeploymentStageTest.t.sol --summary --detailed`: 18
  passed.
- `forge test --root univ4-lp-split-hook-v6 --match-path test/Fork.t.sol --match-test test_fork_deployPool_usesPermit2NotDirectApproval --summary --detailed`:
  1 fork-backed test passed, proving the real Permit2 allowance is zero after deploy.

Formal follow-up:

- Added `univ4-lp-split-hook-v6/src/libraries/JBLPSplitHookHelpers.sol`, a small production helper library for the
  hook's pure token-ordering, native-currency conversion, and signed tick-alignment formulas. The hook's internal
  helper wrappers now delegate to this library so the formal harness proves the same code path the hook uses.
- Added `univ4-lp-split-hook-v6/test/formal/JBUniswapV4LPSplitHookHalmos.t.sol`, covering floor/ceiling tick
  alignment across signed-division and TickMath-adjacent boundary cases, symbolic token ordering, native-token
  conversion, and non-native token passthrough.
- Added `univ4-lp-split-hook-v6/.github/workflows/halmos.yml` to run the helper proof in CI.

Verification after formal follow-up:

- `forge fmt --root univ4-lp-split-hook-v6 --check`: passed.
- `halmos --root univ4-lp-split-hook-v6 --match-contract JBUniswapV4LPSplitHookHalmos --solver-threads 1
  --solver-timeout-assertion 30s --statistics`: 5 passed; 12 total paths; symbolic test time 0.17s.
- `forge test --root univ4-lp-split-hook-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`:
  passed across the full local suite, including fork and invariant coverage.
- `forge build --root univ4-lp-split-hook-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**' --skip SphinxUtils`:
  passed; `JBUniswapV4LPSplitHook` runtime size is 24,031 bytes with 545 bytes of runtime margin.
- PR #132 CI now reports `forge-fmt`, `forge-test`, and `halmos-smoke` passing.

### DEPLOY-VERIFY-01. `deploy-all-v6` verifier and post-deploy artifact provenance regressions match the current fail-closed deployment model

Status: REVIEWED / TEST FIX / NO DEPLOY SCRIPT CODE FINDING IN THIS PASS

Focus:

- Re-ran the deploy-all regression verifier surface after the NANA replay-guard work, focusing on exact deployed-code
  checks, post-deploy artifact provenance, resume behavior, singleton/implementation verification, oracle/router/sucker
  wiring, and dirty-source publishing gates.
- Checked the artifact-build path because stale local artifacts are a high-impact deployment-integrity failure mode.

Result:

- No fresh deploy-all deployment code bug was confirmed in this pass.
- Two regression tests were stale relative to the current build model and were updated to assert the behavior that now
  exists:
  - `build-artifacts.sh` builds each package into a fresh per-repo temporary output directory with `--out` and
    `--force`, then copies the expected artifact from that fresh output.
  - The dirty-source gate is now scoped to local source roots while package artifacts are built from npm package
    sources under `node_modules`; production verify/artifact emission still refuses dirty manifests without
    `--rehearsal`.
- This is compatible with the no-production-state assumption: exact provenance checks and production dirty-manifest
  reverts are preferable to tolerating ambiguous local build state.

Verification:

- `forge fmt --root deploy-all-v6 --check`: passed.
- `forge test --root deploy-all-v6 --match-path test/regression/PostDeployStaleSourceArtifactGap.t.sol -vv`: 1 passed.
- `forge test --root deploy-all-v6 --match-path test/regression/PostDeployDirtyArtifactProvenanceGap.t.sol -vv`: 1
  passed.
- `forge test --root deploy-all-v6 --match-path 'test/regression/*.t.sol' --fail-fast --summary --detailed`: exit code
  0 across 38 regression suites and 70 tests.

### DEPLOYCONFIG-01. `deploy-all-v6`: configured-revnet replay guards accepted wrong-but-plausible Defifa, ART, MARKEE, and Banny projects

Status: VERIFIED DEPLOYMENT FINDING / FIXED IN WORKTREE

Affected code:

- `deploy-all-v6/script/Deploy.s.sol`
- New regression: `deploy-all-v6/test/regression/DeployCanonicalConfiguredRevnetGuard.t.sol`

Root cause:

- After the NANA replay guard was hardened, later configured revnets still reused the generic check that accepted any
  project owned by `REVDeployer`, controlled by the canonical controller, with a nonzero Revnet configuration hash and
  the expected token symbol.
- Defifa, ART-on-Base, and MARKEE could therefore return early for a wrong-but-Revnet-shaped project with incorrect
  economics, operator, URI, reserved split, or terminal setup. Banny additionally checked the 721 hook identity, but
  still did not bind the Revnet configuration hash or terminal/reserved-split shape.

Impact:

- Deployment-only, but high blast radius: these project IDs are canonical ecosystem projects. A partial or rehearsal
  deployment could silently preserve wrong economics or operator authority instead of failing closed.
- Because no production state exists yet, the correct behavior is exact canonical matching rather than backward
  compatibility with ambiguous deployed state.

Fix applied:

- Defifa, ART, and MARKEE skip guards now compute the expected `REVDeployer` configuration hash and require exact hash,
  operator, URI, reserved split beneficiary, native terminal accounting context, and optional router-terminal wiring.
- Banny now requires the exact Revnet shape plus its canonical 721 hook/store/symbol. It accepts the Sphinx Safe as a
  partial-resume operator before finalization or `_BAN_OPS_OPERATOR` after finalization.
- Reserved-split verification now falls back to the latest queued ruleset when the first configured ruleset has not
  started yet, so future-start projects like Defifa can still be replay-checked before launch.

Verification after fix:

- `forge fmt --root deploy-all-v6 --check`: passed.
- `forge test --root deploy-all-v6 --match-path test/regression/DeployCanonicalConfiguredRevnetGuard.t.sol -vv`: 1
  passed.
- `forge test --root deploy-all-v6 --match-path test/regression/DeployCanonicalNanaGuard.t.sol -vv`: 1 passed.
- `forge build --root deploy-all-v6 --deny notes --skip '*/test/**'`: passed.
- `forge test --root deploy-all-v6 --match-path 'test/regression/*.t.sol' --fail-fast --summary --detailed`: exit code
  0 across 40 regression suites and 71 tests.

### CORE-02. `nana-core-v6`: migration fee-route failure could be iterated into near-total migration fee forgiveness

Status: VERIFIED SMART-CONTRACT FINDING / FIXED IN WORKTREE

Affected code:

- `nana-core-v6/src/JBMultiTerminal.sol`
- Regression update: `nana-core-v6/test/regression/RegressionMigrationFeeFailure.t.sol`

Root cause:

- `migrateBalanceOf(...)` zeroed the source terminal ledger, attempted to process the standard migration fee, and sent
  `balance - fee` to the destination terminal.
- If the fee route was broken, `_processFee(...)` caught the failure and credited the fee amount back to the migrating
  project on the source terminal.
- That refunded fee residue could be migrated again while the fee route remained broken. Repeating the migration moved
  a geometric series of residues to the destination terminal while the fee beneficiary received nothing.

Impact:

- A project owner migrating during fee-project misconfiguration could move almost the entire source balance to another
  terminal without the intended migration fee being delivered.
- Terminal solvency was not broken, but protocol fee accounting and migration semantics were.

Fix applied:

- Added `JBMultiTerminal_FeePaymentFailed(...)`.
- `_takeFeeFrom(...)` and `_processFee(...)` now accept a `refundOnFailure` flag.
- Terminal migration passes `refundOnFailure: false`, making the migration atomic: if the immediate fee cannot be
  delivered, the transaction reverts and the source balance remains intact.
- Held-fee processing and existing immediate payout/cash-out/allowance fee paths keep the previous refund-on-failure
  behavior.

Verification after fix:

- `forge fmt --root nana-core-v6 --check`: passed.
- `forge test --root nana-core-v6 --match-path test/regression/RegressionMigrationFeeFailure.t.sol -vv`: 1 passed.
- `forge test --root nana-core-v6 --match-contract 'RegressionMigrationFeeFailure|TestTerminalMigration|TestMigrationHeldFees|TestFees|TestFeeProcessingFailure|SilentFeeFailureDetection' --fail-fast --summary --detailed`:
  exit code 0 across 7 suites; 28 passed, 1 skipped.
- `forge test --root nana-core-v6 --no-match-path '*Fork.t.sol' --deny notes --fail-fast --summary --detailed`: exit
  code 0 across the broad non-fork suite, including unit, regression, fuzz, and invariant suites.

### CORE-03. `nana-core-v6`: ERC-20 terminal migration to self could strand project accounting

Status: VERIFIED SMART-CONTRACT FINDING / FIXED IN WORKTREE

Affected code:

- `nana-core-v6/src/JBMultiTerminal.sol`
- Regression update: `nana-core-v6/test/regression/RegressionTerminalSelfMigration.t.sol`

Root cause:

- `migrateBalanceOf(...)` accepted any destination terminal that reported an accounting context for the migrated token.
- If `to == address(this)`, the source terminal zeroed its store balance and then called its own `addToBalanceOf(...)`
  through the external terminal interface.
- Native-token self-migration re-enters with `msg.value`, but ERC-20 self-migration transfers the token from the
  terminal to itself. The terminal's ERC-20 balance does not change, so `_acceptFundsFor(...)` records a zero balance
  delta.

Impact:

- A project owner with terminal-migration permission could accidentally or maliciously strip a project's ERC-20 store
  balance while leaving the ERC-20 backing in the terminal contract.
- The issue locks accounting rather than stealing funds, but it breaks terminal/project solvency attribution for the
  migrated project.

Fix applied:

- Added `JBMultiTerminal_TerminalMigrationToSelf(...)`.
- `migrateBalanceOf(...)` now rejects `address(to) == address(this)` before checking destination accounting contexts
  or mutating the store.

Verification after fix:

- `forge test --root nana-core-v6 --match-path test/regression/RegressionTerminalSelfMigration.t.sol -vv`: 1 passed.
- `forge test --root nana-core-v6 --match-contract 'RegressionTerminalSelfMigration|RegressionMigrationFeeFailure|TestTerminalMigration|TestMigrationHeldFees|TestFees|TestFeeProcessingFailure|SilentFeeFailureDetection|FeeFreeSurplusLifecycleTest' --fail-fast --summary --detailed`:
  exit code 0 across 9 suites; 31 passed, 1 skipped.
- `forge test --root nana-core-v6 --no-match-path '*Fork.t.sol' --deny notes --fail-fast --summary --detailed`:
  exit code 0 across the broad core suite, including fuzz and invariant campaigns.

### CORE-04. `nana-core-v6`: zero price-feed returns now fail closed in `JBPrices`

Status: HARDENED / FIXED IN WORKTREE

Affected code:

- `nana-core-v6/src/JBPrices.sol`
- `nana-core-v6/test/units/static/JBPrices/TestPricePerUnitOf.sol`

Result:

- `JBChainlinkV3PriceFeed` already rejects zero and negative oracle answers, but `JBPrices` previously trusted any
  registered `IJBPriceFeed` implementation to return a nonzero value.
- A custom feed returning zero could either propagate a zero price into downstream routing/accounting or make inverse
  price lookup divide by zero.
- `JBPrices.pricePerUnitOf(...)` now reverts with `JBPrices_ZeroPrice(...)` for both direct and inverse registered
  feeds that return zero.
- `nana-core-v6/RISKS.md` documents the fail-closed behavior and the remaining oracle honesty assumption.

Verification:

- `forge fmt --root nana-core-v6 --check`: passed.
- `forge test --root nana-core-v6 --match-path test/units/static/JBPrices/TestPricePerUnitOf.sol --summary --detailed`:
  7 passed.
- `forge test --root nana-core-v6 --match-path 'test/units/static/JBPrices/*.sol' --summary --detailed`: 28 passed.
- `forge test --root nana-core-v6 --match-path 'test/units/static/JBTerminalStore/*.sol' --summary --detailed`: 61
  passed.

### CORE-05. `nana-core-v6`: duplicate fund-access groups could split one terminal/token configuration

Status: HARDENED / FIXED IN WORKTREE

Affected code:

- `nana-core-v6/src/JBFundAccessLimits.sol`
- `nana-core-v6/src/structs/JBFundAccessLimitGroup.sol`
- Regression update: `nana-core-v6/test/units/static/JBFundAccessLimits/TestFundAccessLimitsEdge.sol`

Root cause:

- `JBFundAccessLimits.setFundAccessLimitsFor(...)` required strictly increasing currencies inside each
  `JBFundAccessLimitGroup`.
- It did not require the outer groups to be unique by `(terminal, token)`.
- A malformed ruleset could therefore provide multiple groups for the same terminal/token pair and split payout-limit or
  surplus-allowance currencies across them, bypassing the intended one-group canonical shape for that accounting
  context.

Impact:

- Single-currency payout enforcement through `payoutLimitOf(...)` remained bounded by the first matching currency.
- Aggregate surplus views consume `payoutLimitsOf(...)`, so malformed duplicate groups could make surplus accounting
  depend on noncanonical configuration shape, especially if duplicate currencies were split across groups.
- The issue is configuration-integrity hardening rather than a direct theft path, but core fund-access limits are a
  cross-component accounting boundary used by payout, allowance, cash-out, deployer, and product flows.

Fix applied:

- `setFundAccessLimitsFor(...)` now reverts with `JBFundAccessLimits_DuplicateFundAccessLimitGroup(...)` when a
  ruleset provides more than one group for the same `(terminal, token)` pair.
- `JBFundAccessLimitGroup` docs now state the uniqueness requirement.
- `nana-core-v6/RISKS.md` documents that fund-access groups must be unique per `(terminal, token)` and internally
  sorted by currency.

Verification:

- `forge fmt --root nana-core-v6 --check`: passed.
- `forge test --root nana-core-v6 --match-path test/units/static/JBFundAccessLimits/TestFundAccessLimitsEdge.sol --summary --detailed`:
  7 passed, including the duplicate terminal/token group regression.
- Prior broad verification in this pass: `forge test --root nana-core-v6 --no-match-path '*Fork.t.sol' --deny notes --fail-fast --summary --detailed`
  exited successfully across the core unit, regression, fuzz, and invariant campaigns.

### CORE-06. `nana-core-v6`: duplicate locked splits could collapse multiplicity

Status: HARDENED / FIXED IN WORKTREE

Affected code:

- `nana-core-v6/src/JBSplits.sol`
- Regression update: `nana-core-v6/test/units/static/JBSplits/TestSplitsLockedEdge.sol`
- Documentation update: `nana-core-v6/RISKS.md`

Root cause:

- `JBSplits.setSplitGroupsOf(...)` previously checked each current locked split with a boolean
  `_includesLockedSplits(...)`.
- If the current table contained two identical locked splits, one matching replacement split satisfied the check for
  both current entries.
- A project owner could therefore replace the second identical locked entry with an unrelated split while all locked
  entries appeared to be included.

Impact:

- The issue was limited to rewriting the same `(projectId, rulesetId, groupId)` split table before the duplicate lock
  expired.
- It still violated locked-split semantics: duplicate locked allocations could be collapsed into one entry even though
  each locked entry should remain present until expiry.

Fix applied:

- `JBSplits` now counts how many active current locked splits match each locked split's immutable fields and requires
  the replacement table to contain at least that many matching entries.
- Added `test_duplicateLockedSplits_cannotCollapseMultiplicity()`.
- `nana-core-v6/RISKS.md` now documents that duplicate locked splits preserve multiplicity.

Verification:

- `forge fmt --root nana-core-v6 --check`: passed.
- `forge test --root nana-core-v6 --match-path test/units/static/JBSplits/TestSplitsLockedEdge.sol --summary --detailed`:
  10 passed.
- `forge test --root nana-core-v6 --match-path 'test/units/static/JBSplits/*.sol' --summary --detailed`: 39 passed.

### CORE-07. `nana-core-v6`: reserved-token self-project splits could recycle reserves through the project's own terminal

Status: HARDENED / FIXED IN WORKTREE

Affected code:

- `nana-core-v6/src/JBController.sol`
- Integration-style regression: `nana-core-v6/test/TestSplits.sol`
- Unit regression updates: `nana-core-v6/test/units/static/JBController/TestSendReservedTokensToSplitsOf.sol`
- Documentation update: `nana-core-v6/RISKS.md`

Root cause:

- Reserved-token split processing lets a split with `projectId != 0` pay the receiving project's primary terminal for
  the project token being distributed.
- It did not reject `split.projectId == projectId`.
- If the source project accepted its own ERC-20 project token through a terminal, `sendReservedTokensToSplitsOf(...)`
  could mint pending reserves to the controller, approve the terminal, pay the same project with its own token, and
  trigger another project-token mint as if the reserve distribution were an external payment.

Impact:

- This could inflate project supply and pending reserves without new external treasury value when a project configured
  its own ERC-20 as an accepted terminal token and pointed reserved-token splits back at itself.
- The issue mirrors the self-pay mint bypass already guarded in payout split processing.

Fix applied:

- `JBController._sendReservedTokensToSplitGroupOf(...)` now reverts with
  `JBController_ReservedTokenSplitProjectSameAsOwner(projectId)` when a no-hook reserved-token split points back to the
  source project.
- The new `TestSplits` regression uses real core and `JBMultiTerminal` wiring: it deploys the project ERC-20, registers
  that ERC-20 as an accepted terminal token, creates pending reserves through a payment, and proves reserve distribution
  now reverts before self-project terminal payment.
- The hook path remains explicitly allowed for same-project reserved-token splits. `TestSplits` now also covers the
  risky topology where the source project accepts its own ERC-20, configures a same-project reserved split with a hook,
  and the hook pulls the exact reserved-token allowance from `JBController` without routing those tokens through the
  terminal-payment path.

Verification:

- `forge fmt --root nana-core-v6 --check`: passed.
- `forge test --root nana-core-v6 --match-path test/TestSplits.sol --match-test testReservedPercentSplitTerminal_rejectsSelfProject --summary --detailed`:
  1 passed.
- `forge test --root nana-core-v6 --match-path test/TestSplits.sol --match-test testReservedPercentSplitTerminal --summary --detailed`:
  3 passed, including the same-project hook-path allowance regression.
- `forge test --root nana-core-v6 --match-path 'test/{TestSplits.sol,units/static/JBController/TestSendReservedTokensToSplitsOf.sol,units/static/JBController/TestPayReservedTokenToTerminal.sol}' --summary --detailed`:
  13 passed.
- `forge test --root nana-core-v6 --deny notes --skip '*/fork/**' --fail-fast --summary --detailed`: exit code
  0 across the broad non-fork core unit, regression, fuzz, and invariant suites.

### SUCKER-REG-01. `nana-suckers-v6`: same-peer active sucker aggregation used max value instead of freshest snapshot

Status: VERIFIED CROSS-COMPONENT FINDING / FIXED IN WORKTREE

Affected code:

- `nana-suckers-v6/src/JBSuckerRegistry.sol`
- `nana-suckers-v6/src/interfaces/IJBSucker.sol`
- `nana-suckers-v6/src/interfaces/IJBSuckerRegistry.sol`
- `nana-suckers-v6/RISKS.md`
- Regression update: `nana-suckers-v6/test/regression/RegistryStaleMaxAggregation.t.sol`

Root cause:

- Multiple active suckers for the same peer chain report redundant full-chain snapshots, not additive shares.
- The registry correctly avoided summing same-peer values, but deduped by `max(value)`.
- Remote balance, surplus, and supply are not monotonic. A stale active sucker with a higher old snapshot could dominate
  a fresher active sucker with lower current state.

Impact:

- Non-sucker unscoped cash-out math in Revnet and Omnichain deployer hooks could be overquoted by stale remote surplus
  or supply until capped by local liquidity.
- `REVLoans` borrowable math consumes the same registry aggregate, so stale high snapshots could inflate borrowable
  amounts relative to current remote state.

Fix applied:

- Added `snapshotTimestamp()` to `IJBSucker`.
- Same-peer aggregation now prefers the highest snapshot freshness key for active suckers. `max(value)` remains only a
  same-freshness tie-breaker and as the deprecated-sucker fallback when no active sucker answers for that peer chain.
- Updated registry interface comments and sucker risk docs to state the freshness-first aggregation model.

Verification after fix:

- `forge fmt --root nana-suckers-v6 --check`: passed.
- `forge test --root nana-suckers-v6 --match-path test/regression/RegistryStaleMaxAggregation.t.sol -vv`: 2 passed.
- `forge test --root nana-suckers-v6 --match-path test/unit/deployer.t.sol --fail-fast --summary --detailed`: exit
  code 0 across 18 tests.
- `forge test --root nana-suckers-v6 --match-path test/regression/RegistryStaleDeprecatedMaxSurplus.t.sol --fail-fast --summary --detailed`:
  1 passed.
- `forge test --root nana-suckers-v6 --match-contract 'InitialSwapReentrantClaimTest|TransientClaimContextRegression|SwapPartialFillRemainderTest|RegressionSwapQueueOrderTest|SameTimestampSnapshotPinnedTest|PeerSnapshotDesyncTest|RegistryStaleMaxAggregationTest|RegistryStaleDeprecatedMaxSurplusTest' -vv`:
  exit code 0 across 8 suites and 13 tests.
- `forge test --root nana-suckers-v6 --no-match-path 'test/*Fork*.t.sol' --fail-fast --summary --detailed`: exit
  code 0 across the broad non-fork suite; 441 passed, 0 failed, 0 skipped.
- `forge test --root revnet-core-v6 --match-contract 'ScopeCashOutsToLocalBalancesConditionalTest|ScopeCashOutsREVLoansTest|RemoteLoanStateOmissionTest|RouterRegistrySourceDebtRepricingTest|TestREVLoans|TestLoanSourceRotation|TestLoansAndDeployerFixes|RegressionLoanSourceRotation|RegressionRouterRegistrySourceDebtRepricingTest' -vv`:
  exit code 0 across 6 suites and 35 tests.
- `forge test --root nana-omnichain-deployers-v6 --match-path test/JBOmnichainDeployer.t.sol -vv`: 18 passed.
- `forge test --root nana-suckers-v6 --match-path 'test/fork/*.t.sol' --fail-fast --summary --detailed`: exit code 0;
  4 fork tests passed and 8 Optimism RPC-dependent tests were skipped by their guards.
- `forge test --root revnet-core-v6 --match-path '*Fork.t.sol' --fail-fast --summary --detailed`: exit code 0 across
  15 fork suites; 66 tests passed.

### SUCKER-MAP-01. `nana-suckers-v6`: one sucker could map multiple local tokens to one remote inbox

Status: VERIFIED SMART-CONTRACT FINDING / FIXED IN WORKTREE

Affected code:

- `nana-suckers-v6/src/JBSucker.sol`
- `nana-suckers-v6/RISKS.md`
- Regression update: `nana-suckers-v6/test/regression/RemoteTokenMappingUniqueness.t.sol`

Root cause:

- A sucker's outbound state is keyed by local terminal token: `_outboxOf[localToken]`, including independent tree counts
  and nonces.
- The destination sucker stores inbound roots under `root.token`, which is the remote token address converted to the
  destination chain's local token address.
- `mapToken(...)` prevented one local token from being remapped after use, but did not prevent two different local
  tokens inside the same sucker from pointing at the same remote token.

Impact:

- Two local-token outboxes in the same sucker could race into one destination inbox key. Depending on delivery order,
  one root could be rejected as stale or overwrite the other root, making claims unavailable until manual recovery.
- This is not a restriction on bridge-lane redundancy: separate suckers have separate inbox/outbox storage, so native
  bridge and CCIP suckers can both map ETH->ETH or USDC->USDC for the same project/chain pair.

Fix applied:

- Added a per-sucker reverse reservation `_localTokenForRemoteToken[remoteToken]`.
- `_mapToken(...)` now rejects mapping a nonzero remote token if another local token in the same sucker already
  reserved it.
- Unused same-local-token remaps release the old remote token reservation, while disabled mappings keep their remote
  token reserved so re-enabling the same route remains unambiguous.
- `RISKS.md` now documents the per-sucker uniqueness invariant and explicitly states that separate suckers can carry
  the same asset pair so users can choose their bridge risk profile.

Verification after fix:

- `forge test --root nana-suckers-v6 --match-path test/regression/RemoteTokenMappingUniqueness.t.sol -vv`: 5 passed.
- `forge test --root nana-suckers-v6 --match-path 'test/regression/*MapToken*.t.sol' --fail-fast --summary --detailed`:
  exit code 0 across 3 suites; 12 passed.
- `forge test --root nana-suckers-v6 --no-match-path '*Fork*.t.sol' --fail-fast --summary --detailed`: exit code 0
  across the broad local sucker suite, including local invariants.
- `forge test --root nana-suckers-v6 --match-path test/MultiSuckerFork.t.sol --fail-fast --summary --detailed`:
  10 passed, including multiple active suckers for the same peer chain.
- `forge test --root nana-suckers-v6 --match-path 'test/fork/*.t.sol' --fail-fast --summary --detailed`: exit code 0;
  4 fork tests passed and 8 Optimism RPC-dependent tests were skipped by their guards.

### SUCKER-ALLOW-01. `nana-suckers-v6`: bridge send approvals stayed live after partial bridge/router pulls

Status: HARDENED / FIXED IN WORKTREE

Affected code:

- `nana-suckers-v6/src/libraries/JBCCIPLib.sol`
- `nana-suckers-v6/src/JBCCIPSucker.sol`
- `nana-suckers-v6/src/JBSwapCCIPSucker.sol`
- `nana-suckers-v6/src/JBOptimismSucker.sol`
- `nana-suckers-v6/src/JBCeloSucker.sol`
- `nana-suckers-v6/src/JBArbitrumSucker.sol`
- `nana-suckers-v6/RISKS.md`
- Regression update: `nana-suckers-v6/test/regression/BridgeAllowanceCleanup.t.sol`

Root cause:

- Sucker bridge send paths grant external bridge/router contracts ERC-20 allowance for the amount being sent.
- The code assumed canonical bridges either pull the full approved amount or revert.
- If a non-canonical, upgraded, misconfigured, or mocked bridge/router returned success after only a partial pull, the
  unused allowance remained live.

Impact:

- Later same-token funds arriving in the sucker could be pulled by the still-approved bridge/router/gateway even though
  those funds belonged to a future root, retry, claim backing, or project add-to-balance path.
- This is mostly a hardening issue against bridge/router behavior outside the canonical exact-pull assumption, but it
  touches pooled bridge custody and is cheap to close.

Fix applied:

- CCIP send logic now clears bridged-token approvals and fee-token approvals after successful `ccipSend(...)`.
- OP Stack, Celo, and Arbitrum send paths now revoke the bridge/gateway approval after the successful bridge call.
- `nana-suckers-v6/RISKS.md` documents the single-use bridge approval invariant.

Verification:

- `forge fmt --root nana-suckers-v6 --check`: passed.
- `forge test --root nana-suckers-v6 --match-path test/regression/BridgeAllowanceCleanup.t.sol --summary --detailed`:
  2 passed. The regression uses a CCIP router that succeeds after pulling only half of the approved bridge token or
  LINK fee, and asserts the sucker-side allowance is zero afterward.
- `forge test --root nana-suckers-v6 --match-path test/unit/ccip_native_interop.t.sol --summary --detailed`: 15
  passed.
- `forge test --root nana-suckers-v6 --match-path test/unit/multi_chain_evolution.t.sol --summary --detailed`: 6
  passed.
- `forge test --root nana-suckers-v6 --no-match-path '*Fork*.t.sol' --fail-fast --summary --detailed`: exit code 0
  across the broad non-fork sucker suite, including regression, fuzz, and invariant coverage.
- `forge test --root nana-suckers-v6 --match-path 'test/fork/*.t.sol' --fail-fast --summary --detailed`: exit code 0;
  4 fork conversion tests passed and 8 Optimism RPC-dependent tests were skipped by their guards.

### REVNET-TERM-01. `revnet-core-v6`: Revnet terminal selection is constructor-pinned

Status: HARDENED / REGRESSION AND FORK VERIFIED

Affected code:

- `revnet-core-v6/src/REVDeployer.sol`
- `revnet-core-v6/src/interfaces/IREVDeployer.sol`
- `revnet-core-v6/RISKS.md`
- Deployment callers in `revnet-core-v6`, `nana-fee-project-deployer-v6`, and `deploy-all-v6`

Root cause:

- `REVDeployer.deployFor(...)` accepted full `JBTerminalConfig[]` input from each caller.
- That made terminal identity a per-revnet config choice even though Revnet loans, sucker exemptions, router payments,
  and borrowability depend on a coherent terminal set across packages.
- A malicious or mistaken deployment config could register a phantom terminal that distorted surplus reads, or register
  a router registry/alternate terminal as if it were a treasury-bearing loan source.

Fix applied:

- `REVDeployer` now pins `MULTI_TERMINAL` and `ROUTER_TERMINAL_REGISTRY` in its constructor.
- Deploy calls accept only `JBAccountingContext[]`; the deployer always registers the canonical multi-terminal with
  those contexts and, when distinct, the router terminal registry with no accounting contexts.
- Loan fund-access limits are derived only from `MULTI_TERMINAL` accounting contexts.
- `REVLoanSource` was removed. Loan APIs and stored loan state now carry only `sourceToken`; `REVLoans` pins its own
  constructor-level `MULTI_TERMINAL`, and `REVOwner` derives decimals/currency from the deployer-pinned
  `MULTI_TERMINAL` accounting context for that token.
- The Revnet configuration hash no longer includes terminal addresses. Terminal identity is fixed by the deployer and
  loan constructors, while per-revnet hashes cover the economic configuration that must match across chains.
- Deployment scripts pass the router terminal registry as `ROUTER_TERMINAL_REGISTRY`, not the underlying router
  terminal, and the CREATE2 restart/prediction path now encodes the same constructor arguments.
- `TestTerminalEncodingInHash` now constructs a real `JBRouterTerminalRegistry` and verifies that it is installed as
  the second canonical project terminal, distinct from the treasury-bearing multi-terminal.

Verification after fix:

- `forge test --root revnet-core-v6 --match-path test/TestTerminalEncodingInHash.t.sol --summary --detailed`: 4
  passed, including the real-router-registry terminal list check.
- `forge test --root revnet-core-v6 --match-path 'test/regression/{PhantomSurplusTerminal,RouterRegistrySourceDebtRepricing}.t.sol' --summary --detailed`:
  2 passed.
- `forge test --root revnet-core-v6 --match-path 'test/regression/*.t.sol' --fail-fast --summary --detailed`: 105
  passed across 29 regression files.
- `forge test --root nana-fee-project-deployer-v6 --match-path test/TestFeeProjectDeployer.sol --summary --detailed`:
  64 passed.
- `forge test --root nana-fee-project-deployer-v6 --match-path 'test/regression/*.t.sol' --fail-fast --summary --detailed`:
  19 passed across 5 regression suites.
- `forge test --root deploy-all-v6 --match-path test/regression/RouterTerminalRouteVerifierGap.t.sol --summary --detailed`:
  3 passed.
- `forge test --root deploy-all-v6 --match-path test/fork/DeployFullStack.t.sol --match-test test_fullStack_ethereum --fail-fast --summary --detailed`:
  1 passed, covering the full deploy stack with `JBRouterTerminalRegistry` registered as the canonical router project
  terminal.
- Additional token-only loan source verification:
  - `forge test --root revnet-core-v6 --match-path test/REVLoansSourced.t.sol --summary --detailed`: 22 passed, 1
    skipped.
  - `forge test --root revnet-core-v6 --match-path test/REVLoansEdgeCases.t.sol --summary --detailed`: 5 passed.
  - `forge test --root revnet-core-v6 --match-path test/REVLoansRegressions.t.sol --summary --detailed`: 2 passed.
  - `forge test --root revnet-core-v6 --match-path test/TestLoanSourceRotation.t.sol --summary --detailed`: 6 passed.
  - `forge test --root revnet-core-v6 --match-path test/TestCrossSourceReallocation.t.sol --summary --detailed`: 2
    passed.
  - `forge test --root revnet-core-v6 --match-path test/TestRevnetRegressions.t.sol --summary --detailed`: 1 passed.
  - `forge test --root revnet-core-v6 --match-path test/regression/RemoteLoanStateOmission.t.sol --summary --detailed`:
    2 passed.
  - `forge test --root revnet-core-v6 --match-path test/regression/RouterRegistrySourceDebtRepricing.t.sol --summary --detailed`:
    1 passed, proving router-registry-backed revnets still borrow from the canonical multi terminal.
  - `forge test --root revnet-core-v6 --match-path 'test/REVLoans*.t.sol' --summary --detailed`: 57 passed, 1
    skipped, including `REVLoans.invariants`.
  - `forge test --root revnet-core-v6 --match-path 'test/Test*Loan*.t.sol' --summary --detailed`: 22 passed.
  - `forge test --root revnet-core-v6 --match-path 'test/regression/*Loan*.t.sol' --summary --detailed`: 33 passed.
  - `forge test --root revnet-core-v6 --match-path test/fork/TestLoanReallocateFork.t.sol --summary --detailed`: 2
    passed.
  - `forge test --root revnet-core-v6 --match-path test/fork/TestLoanERC20Fork.t.sol --summary --detailed`: 7
    passed.
  - `forge test --root deploy-all-v6 --match-path test/fork/MixedDecimalLoanComposition.t.sol --summary --detailed`:
    1 passed.
  - `forge test --root deploy-all-v6 --match-path test/fork/FullStackFork.t.sol --summary --detailed`: 8 passed.
  - `forge test --root deploy-all-v6 --match-path test/fork/TestTerminalMigration.t.sol --summary --detailed`: 3
    passed, with the loan case updated to assert that plain JB migration projects fail closed under the Revnet-only
    loan path.

### REVNET-LOAN-01. `revnet-core-v6`: callbacks could nest loan actions during partial accounting updates

Status: VERIFIED SMART-CONTRACT FINDING / FIXED IN WORKTREE

Affected code:

- `revnet-core-v6/src/REVLoans.sol`
- Regression update: `revnet-core-v6/test/TestCEIPattern.t.sol`
- Fork coverage: `revnet-core-v6/test/fork/TestLoanBorrowFork.t.sol`

Root cause:

- `REVLoans._adjust(...)` writes the per-loan amount/collateral before interactions, but aggregate loan accounting is
  updated across multiple helpers.
- During borrow, native-token payouts to a contract beneficiary occur before `_addCollateralTo(...)` increments
  `totalCollateralOf` and burns the holder's project tokens.
- A beneficiary or terminal/token callback could call another loan-changing entrypoint while `totalBorrowedFrom` and
  `totalCollateralOf` represented different points in the outer action.

Impact:

- The clearest practical callback is a smart-contract borrower receiving native-token loan proceeds.
- A nested `borrowFrom`, `reallocateCollateralFromLoan`, or `repayLoan` could price or mutate against partially
  updated aggregate loan state.

Fix applied:

- Added a transient loan-action lock to `borrowFrom`, `reallocateCollateralFromLoan`, and `repayLoan`.
- Internal `_borrowFrom(...)` remains unguarded so the already-locked reallocation flow can create its replacement
  loan without self-reverting.
- Risk docs now describe callback observability separately from nested loan-action mutation.

Verification after fix:

- `forge test --root revnet-core-v6 --match-path test/TestCEIPattern.t.sol --match-test test_reentrantBeneficiary_cannotNestBorrowAction --summary --detailed`:
  1 passed, proving a contract beneficiary cannot open a nested loan during the outer payout callback.
- `forge test --root revnet-core-v6 --match-path test/fork/TestLoanBorrowFork.t.sol --match-test test_fork_borrow_reentrantBeneficiaryCannotNestBorrow --summary --detailed`:
  1 fork test passed against the loan fork harness with the real buyback/V4 setup.

### REVNET-FEE-01. `revnet-core-v6`: native fee hook could spend forced ETH

Status: VERIFIED SMART-CONTRACT FINDING / FIXED IN WORKTREE

Affected code:

- `revnet-core-v6/src/REVOwner.sol`
- Regression update: `revnet-core-v6/test/TestCashOutCallerValidation.t.sol`
- Fork coverage: `revnet-core-v6/test/fork/TestCashOutFork.t.sol`

Root cause:

- `REVOwner.afterCashOutRecordedWith(...)` intentionally has no terminal-only caller gate. A non-terminal caller can
  call the hook and donate their own forwarded fee into the fee revnet.
- For native-token fees, the hook used `context.forwardedAmount.value` as the outbound `msg.value` without requiring
  the current call's `msg.value` to match.
- If ETH was forcibly sent or accidentally stranded in `REVOwner`, an arbitrary caller could set a native forwarded
  amount and route that pre-existing balance through attacker-chosen hook metadata.

Impact:

- The normal terminal callback path was sound when the terminal forwarded value, but the public hook entrypoint could
  spend native ETH that was not supplied by the caller.
- The exposure is bounded to stranded/forced ETH in the hook contract, not revnet terminal balances.

Fix applied:

- Native fee processing now requires `msg.value == context.forwardedAmount.value`.
- ERC-20 fee processing now requires `msg.value == 0` and still pulls the forwarded token amount from the caller.
- Risk docs now state the public hook is allowed for donations but native processing is value-balanced.

Verification after fix:

- `forge test --root revnet-core-v6 --match-path test/TestCashOutCallerValidation.t.sol --match-test 'test_nonTerminalCaller' --summary --detailed`:
  2 passed, covering both valid non-terminal donation and forced-balance rejection.
- `forge test --root revnet-core-v6 --match-path test/TestCashOutCallerValidation.t.sol --summary --detailed`: 4
  passed.
- `forge test --root revnet-core-v6 --match-path test/fork/TestCashOutFork.t.sol --match-test test_fork_cashOut_normalWithFee --summary --detailed`:
  1 fork test passed for the real terminal cash-out fee flow.

### CROPTOP-01. `croptop-core-v6`: documented-valid posting policies and batches could brick at publish time

Status: VERIFIED SMART-CONTRACT FINDING / FIXED IN WORKTREE

Affected code:

- `croptop-core-v6/src/CTPublisher.sol`
- `croptop-core-v6/src/interfaces/ICTPublisher.sol`
- Regression update: `croptop-core-v6/test/CTPublisher.t.sol`
- Fork regression update: `croptop-core-v6/test/fork/PublishFork.t.sol`

Root cause:

- `CTAllowedPost` and `CTDeployerAllowedPost` document `maximumTotalSupply == 0` as "max"/unlimited, but
  `configurePostingCriteriaFor(...)` rejected any nonzero `minimumTotalSupply` with `maximumTotalSupply == 0`, and
  `mintFrom(...)` treated zero as a hard cap.
- `CTPublisher._setupPosts(...)` preserved user post order in `tiersToAdd`, while the canonical 721 store requires new
  tiers sorted by ascending category. A batch with valid posts in categories `[2, 1]` could therefore revert in the 721
  store even though each post satisfied Croptop policy.

Impact:

- Project owners following the published zero-as-unlimited supply-bound docs could fail to configure the category, or
  if configured through another path, could make every nonzero-supply post fail.
- Publishers could unintentionally brick an otherwise valid multi-category batch unless they knew and followed the
  lower-level 721 store's category-ordering precondition.
- This is a publishing liveness/policy correctness issue, not a fund-drain path.

Fix applied:

- `maximumTotalSupply == 0` is now consistently treated as unlimited in both configuration validation and post supply
  validation.
- New tier configs are insertion-sorted by ascending category before `hook.adjustTiers(...)`.
- The publisher tracks which original post produced each newly sorted tier, then assigns final tier IDs after sorting
  so mint metadata and URI cache entries preserve the caller's requested mint order.
- Interface docs now state that `allowanceFor(...).maximumTotalSupply == 0` means unlimited.

Verification after fix:

- `forge fmt --root croptop-core-v6 --check`: passed.
- `forge test --root croptop-core-v6 --match-path test/CTPublisher.t.sol -vv`: 31 passed.
- `forge test --root croptop-core-v6 --match-path 'test/regression/*.t.sol' --fail-fast --summary --detailed`: exit
  code 0 across the local regression suite.
- `forge test --root croptop-core-v6 --match-path test/fork/PublishFork.t.sol --fail-fast --summary --detailed`: exit
  code 0 across the full-stack publish fork suite; 5 passed, including the unsorted-category regression against the
  canonical 721 hook/store.
- `forge test --root croptop-core-v6 --no-match-path '*Fork.t.sol' --deny notes --fail-fast --summary --detailed --skip '*/script/**'`:
  exit code 0 across the broad non-fork suite; 139 passed, 0 failed, 0 skipped.

### CROPTOP-02. `croptop-core-v6`: project NFT handoff bypassed ERC-721 receiver checks

Status: VERIFIED SMART-CONTRACT FINDING / FIXED IN WORKTREE

Affected code:

- `croptop-core-v6/src/CTDeployer.sol`
- Regression updates:
  - `croptop-core-v6/test/regression/RegressionCurrencyCases.t.sol`
  - `croptop-core-v6/test/fork/PublishFork.t.sol`

Root cause:

- `CTDeployer.deployProjectFor(...)` safely reserved the project NFT to itself through `JBProjects.createFor`, but
  finalized ownership with raw `PROJECTS.transferFrom(address(this), owner, projectId)`.
- If the requested `owner` was a contract that does not implement `IERC721Receiver`, the project NFT could still be
  transferred there. That bypassed the same receiver safety that `JBProjects.createFor(owner)` enforces when projects
  are launched directly.

Impact:

- A Croptop project could be deployed to a contract owner that cannot receive or manage ERC-721s safely, stranding the
  project NFT and leaving the project/hook control path unusable without bespoke rescue behavior.
- This is a launch-integrity issue rather than a fund-drain path, but it is cross-component: Croptop's deployer
  changed the effective safety semantics of the canonical `JBProjects` NFT handoff.

Fix applied:

- `CTDeployer.deployProjectFor(...)` now finalizes the project NFT handoff with `PROJECTS.safeTransferFrom(...)`.
- `croptop-core-v6/RISKS.md` documents that contract recipients must implement `onERC721Received`.

Verification after fix:

- `forge test --root croptop-core-v6 --match-path test/regression/RegressionCurrencyCases.t.sol --match-test test_deployerSafeTransfersProjectNftToContractOwners --summary --detailed`:
  1 passed against freshly deployed core, Croptop, terminal, and 721-hook infrastructure.
- `forge test --root croptop-core-v6 --match-path test/fork/PublishFork.t.sol --match-test testFork_DeployProjectForRequiresSafeProjectNftReceiver --summary --detailed`:
  1 fork test passed.
- `forge test --root croptop-core-v6 --match-path test/CTDeployer.t.sol --summary --detailed`: 24 passed.
- `forge test --root croptop-core-v6 --match-path test/regression/RegressionCurrencyCases.t.sol --summary --detailed`:
  3 passed.
- `forge test --root croptop-core-v6 --match-path 'test/{CTDeployer.t.sol,ClaimCollectionOwnership.t.sol,regression/RegressionFreshRound.t.sol,regression/RegressionCases.t.sol,regression/DeployerPermissionBypass.t.sol,audit/NemesisStaleDeployerPermissions.t.sol}' --summary --detailed`:
  36 passed across 6 suites.

## Active Hypotheses

- Continue through remaining smart-contract surfaces with emphasis on callback-capable token paths, pooled-balance
  accounting, mutable deployment/runtime registries, and external-call ordering assumptions where actual balances are
  shared but accounting is scoped.
- Cross-component findings should carry fork or integration-style proof whenever feasible. Source-level assertions are
  allowed only when the production deploy surface is not directly callable in the harness, and the report must label
  them as source-level instead of fork-backed.
- Because no production deployment exists yet, compatibility with legacy deployed hook metadata or project state is not
  a requirement for fixes; prefer exact canonical checks and clear reverts.
- Sucker-side exact-delta checks and `_sendRoot(...)` bridge-bound accounting are reconciled as trust-boundary risks:
  harsh reverts are expected for unsupported token behavior, and persistent bridge-bound value consumption requires a
  trusted bridge/token path to report success without moving funds.
- Focused router/terminal/Univ4 review found one router-terminal registry fail-fast hardening (`ROUTER-TERM-01`) and
  no clean CORE-01-style over-credit in `nana-router-terminal-v6`, `univ4-router-v6`, or
  `univ4-lp-split-hook-v6`; current status is backed by local regression suites and mainnet-fork cross-component
  suites.
- Deploy-all verifier/post-deploy review found no fresh deploy-script code issue; current no-finding status is backed by
  the local regression verifier suite plus fork-backed full-stack lifecycle coverage.
- Same-peer sucker aggregate views now use source-chain snapshot freshness instead of value magnitude, and downstream
  Revnet/Omnichain local plus Revnet fork suites pass against the corrected model.
- Croptop publisher/deployer sidecar review reconciled existing-tier policy reuse, terminal/hook trust, URI mutation,
  pre-claim deployer-scoped authority, and `CTProjectOwner` authority widening as already-tested accepted behavior or
  integration trust boundaries. The fresh Croptop code fix from this pass is limited to policy-valid publish liveness:
  zero-as-unlimited supply bounds and category-order normalization.
- LP split hook Permit2 residual approvals, Croptop project-NFT receiver semantics, Revnet terminal selection, Revnet
  owner fee forwarding, and Revnet loan callback ordering are now hardened and fork/local verified. Current high-signal
  follow-up is report-backed completion mapping and any still-weak smart-contract seams found by that matrix.

## Working Completion Matrix

This is a live checklist for the user objective, not a completion claim. Passing tests and documented no-findings are
evidence, but they are not a substitute for a full formal proof of the composed system.

| Requirement | Current artifact evidence | Remaining gap |
| --- | --- | --- |
| Maintain `AUDIT_REPORT_2.md` as record keeper | This file records findings, fixes, commands, accepted risks, and coverage log entries. | Keep extending it as new surfaces are checked. |
| Include Banny, Defifa, and all Nana smart-contract repos | Root `ARCHITECTURE.md` and `USER_JOURNEYS.md` now include the original 19 repos plus `nana-project-payer-v6`; `nana-referral-split-hook-v6`, `bendystraw-v6`, and website are explicitly out of scope per user direction. | Final completion audit must re-check scope against the actual workspace and user exclusions. |
| Map every module and dependency | Repo-level architecture/RISKS/USER_JOURNEYS files exist for each in-scope repo; this report has mapped sections for core, hooks, suckers, deployers, Revnet, Croptop, Defifa, Banny, ProjectPayer, router, and LP surfaces. | A final artifact should explicitly tie every `src/*.sol` module to at least one reviewed invariant or accepted trust boundary. |
| Deep invariant analysis | Findings cover pooled balance solvency, callback ordering, split conservation, loan accounting, bridge-bound state, duplicate config, registry freshness, deployment identity, and metadata/provenance invariants. | No single machine-checkable invariant manifest proves all invariants across all repos. |
| Reproducible PoCs for promising threads | Verified findings include local or fork regression tests for core ERC-20 intake, distributor funding, ProjectPayer under-pulls, sucker callbacks, Revnet loan reentrancy, Croptop publish/deploy liveness, and deploy-all replay guards. | Temporary PoCs removed after fixes are documented, but final completion should ensure surviving PoCs/regressions remain in-repo for all fixed critical paths. |
| Cross-component dynamics get fork/integration tests where feasible | Evidence includes deploy-all full-stack forks, ProjectPayer+terminal fork, buyback/V4 forks, router-terminal forks, LP split forks, sucker forks, Revnet forks, Croptop publish fork, Defifa/Banny broad non-fork coverage, and focused integration tests. | Some slow omnichain/fork suites are intentionally path-scoped; final completion should list any skipped suites and why they are not required. |
| Prefer reduced surface over unnecessary code | Several fixes removed or narrowed configurable surfaces: Revnet terminal configs, `REVLoanSource`, duplicate groups/splits, leftover allowances, broad callback windows, and weak replay guards. | Continue challenging whether new abstractions are necessary before adding code. |
| Formal verification “top to bottom” | Current evidence is adversarial review plus unit/regression/fork/invariant tests, with narrow Halmos smoke proofs added for core fee math, permission namespace stability, address-registry CREATE derivation, project-handle resolver parsing, ownable ownership-state transitions, ProjectPayer tracker identity propagation, 721 bitmap updates, distributor vesting math, buyback slippage branches, router-terminal swap math, LP split tick/token helper behavior, Banny resolver helpers, and sucker peer-value/merkle helper behavior. | Not complete: no comprehensive formal spec, proof harness, or exhaustive composed-system verifier exists yet. |

### Module-to-Invariant Coverage Manifest (pass 1)

Inventory command used for runtime modules:

- `rg --files <repo>/src -g '*.sol'` across the in-scope runtime repos, excluding `nana-referral-split-hook-v6`,
  `bendystraw-v6`, and `website` per user direction.

Runtime inventory result: 295 production `src/*.sol` files across 18 runtime repos. `nana-fee-project-deployer-v6`
and `deploy-all-v6` are deployment packages; their production surface is `script/Deploy.s.sol`, `script/Verify.s.sol`,
and the post-deploy shell/config verifier path instead of `src/`.

This manifest is a coverage map, not a completion claim. It ties module groups to reviewed invariants and trust
boundaries; it does not replace a machine-checked formal spec.

| Repo | Production module groups covered | Invariant / trust-boundary evidence | Residual weak point |
| --- | --- | --- | --- |
| `nana-core-v6` | 87 files: project NFTs, controller, directory, permissions, rulesets, splits, fund-access limits, prices/feeds, terminal/store, ERC-20/token issuance, fee math, cash-out math, metadata helpers, deadlines, interfaces, and value structs. | CORE-01 through CORE-07 cover pooled terminal solvency, callback ordering, migration accounting, price fail-closed behavior, duplicate config rejection, split lock multiplicity, and reserved-token self-recycling. Broad non-fork fuzz/invariant suite is recorded in the coverage log. | Still lacks one formal protocol-level spec that composes terminal/store/controller/rulesets/hooks as a single state machine. |
| `nana-permission-ids-v6` | 1 file: shared permission namespace constants. | PERMISSION-01 scanned constants and downstream numeric usage; docs corrected to the source-of-truth ranges. | Ecosystem compatibility still depends on downstream packages importing constants instead of hardcoding stale IDs. |
| `nana-ownable-v6` | `JBOwnable`, `JBOwnableOverrides`, owner struct, interface. | OWNABLE-01 plus broad suite cover dynamic project-owner authority, delegated permission checks, zero-`PROJECTS` behavior, and renounce/transfer boundaries. | Authority remains intentionally dependent on `JBProjects` ownership and `JBPermissions` state. |
| `nana-address-registry-v6` | `JBAddressRegistry` plus interface. | ADDRESS-01 covers CREATE/CREATE2 provenance registration, runtime-code gating, first-write semantics, and non-authorization semantics. | Registry provenance is intentionally permissionless and must not become an authorization oracle. |
| `nana-project-handles-v6` | `JBProjectHandles` plus interface. | HANDLES-01 covers ENS resolver soft-fail behavior, setter isolation, and handle lookup robustness. | ENS registry/resolver honesty and availability remain external dependencies. |
| `nana-project-payer-v6` | payer/deployer contracts, payer tracker and interfaces. | PAYER-01/02/03/04 cover deployment inventory, implementation verification, ERC-20 under-pull allowance cleanup, callback-style token observation, and fork-backed terminal forwarding. | Direct token transfers to payer clones remain intentionally unrecoverable; rebasing tokens are documented as not recommended. |
| `nana-721-hook-v6` | 38 files: hook base, tiered hook/store/deployers/project deployer, checkpoints, tier libraries, bitmap/IPFS/metadata helpers, interfaces, and tier/config structs. | 721-01/02/03 cover tier split/reserve/cash-out timing, forwarded-value conservation, split metadata conservation, reentrancy timing, removed-tier cleanup liveness, and fork-backed ERC-20/native split paths. | Complex tier policy remains covered by tests and invariants rather than a complete tier-state formal proof. |
| `nana-buyback-hook-v6` | buyback hook/registry, swap library, oracle/registry/hook interfaces, callback/default-hook structs. | BUYBACK-01/02/03 and ROUTER-UNI-01 cover sell-side minimum semantics, default-hook cohort history, metadata rekeying, registry boundaries, and V3/V4 fork routing. | Route correctness depends on configured pools/oracles and documented market-manipulation assumptions. |
| `nana-router-terminal-v6` | router terminal, registry, pay-route resolver, forwarding/swap libraries, route/terminal/pool structs, terminal/router interfaces. | ROUTER-TERM-01 and ROUTER-UNI-01 cover cold-start zero-terminal resolution, registry forwarding, FOT/partial-fill boundaries, V3/V4/JB terminal fork paths, and value-forwarding fail-fast behavior. | Router can bound but not eliminate arbitrary external swap-route and market-state risk. |
| `nana-suckers-v6` | 58 files: base sucker, bridge-specific suckers/deployers, swap CCIP sucker/deployer, registry, Merkle utilities, relay/swap/CCIP libraries, enums, interfaces, bridge message/token/value structs, and scratch structs. | SUCKER-01/02, SUCKER-BRIDGE-01, SUCKER-REG-01, SUCKER-MAP-01, and SUCKER-ALLOW-01 cover bridge-bound accounting, initial swap callback timing, same-peer aggregation freshness, one-remote-inbox-per-local-token per sucker, approval cleanup, local-backed sucker cash-outs, same-currency peer-value conversion, and merkle root helper behavior via Foundry invariants plus Halmos proofs. | Bridge/router/token honesty and remote-chain integrity remain explicit trust boundaries; local RPC gaps still gate some fork suites outside CI. |
| `nana-omnichain-deployers-v6` | omnichain deployer/hook plus deployment config structs and interface. | OMNI-01/02 plus invariant/fork log cover controller/directory validation, hook composition, cash-out hook semantics, local invariant campaigns, and real fork integration. | Slow omnichain campaigns are split into local invariant and targeted fork coverage; no single exhaustive cross-chain campaign exists. |
| `nana-distributor-v6` | shared distributor base, token and 721 distributors, vesting/snapshot structs, vesting math library, interfaces. | DIST-01/02/03/04/05 cover callback-capable reward funding, callback collection during funding, split-hook native value conservation, token mismatch handling, zero-reward 721 voting-budget accounting, partial-vesting dust reserve cleanup, and `JBVestingMath` Halmos checks. | Arbitrary reward-token behavior remains a boundary; tests defend callback windows but not every ERC-20 noncompliance shape. |
| `univ4-router-v6` | V4 hook plus oracle library. | ROUTER-UNI-01/02 cover route selection, TWAP/spot assumptions, structural arbitrage classification, delta settlement, and forked V4/JB routing. | AMM/oracle manipulation remains bounded by documented economics, not eliminated. |
| `univ4-lp-split-hook-v6` | LP split hook/deployer, helper library, and interfaces. | LP-SPLIT-01/02 cover tick/range validation, preinitialized pool hypotheses, Permit2 and ERC-20 allowance cleanup, fee routing, terminal migration, helper-level tick/native-token/order proofs, and forked PositionManager/PoolManager integration. | Pool state and Permit2 behavior remain integration-critical external surfaces. |
| `revnet-core-v6` | deployer, owner hook, loans, source-fee library, interfaces, loan/stage/721/sucker/croptop config structs. | REVNET-TERM-01, REVNET-LOAN-01, REVNET-FEE-01 plus SUCKER-BRIDGE-01 cover constructor-pinned canonical terminals, token-only loan sources/accounting contexts, callback-locked loan actions, fee forwarding `msg.value`, source-fee timing proofs, and local-backed sucker cash-outs. | Cross-chain loan/surplus freshness is accepted and documented; composed loan economics are test-backed, not formally proved. |
| `croptop-core-v6` | deployer, publisher, project owner, interfaces, post/project/sucker config structs. | CROPTOP-01/02 cover zero-as-unlimited publish policies, category ordering, deployer authority, safe project-NFT handoff, publisher/deployer fork paths, and documented hook/terminal trust. | Publisher policy composition remains complex and benefits from continued scenario review. |
| `banny-retail-v6` | resolver plus interface. | BANNY-01/02 cover resolver custody, body-transfer semantics, anti-stranding behavior, migration/build drift, tokenURI/decorate/fork coverage, and Banny resolver helper Halmos checks. | Burned body tokens can intentionally strand resolver-held assets; this is documented behavior. |
| `defifa` | deployer, hook, governor, project owner, token URI resolver, hook library, font importer, interfaces, enums, launch/scorecard/attestation/reserve structs. | DEFIFA-01 covers phase transitions, fulfillment, fee accounting, BWA/quorum/reserve dilution, scorecard governance, no-contest/refund/cash-out paths, pinned fork coverage, and `DefifaHookLib` Halmos checks. | Permissionless game launch and governance trust boundaries must remain explicit to users. |
| `nana-fee-project-deployer-v6` | `script/Deploy.s.sol` deployment surface. | FEEDEPLOY-01 covers exact fee-project replay guard, project-1 squat handling, canonical NANA/Revnet shape checks, native terminal setup, and fork/regression deployment coverage. | Any Revnet config evolution must be reflected in the replay guard. |
| `deploy-all-v6` | `script/Deploy.s.sol`, `script/Verify.s.sol`, post-deploy artifact/build/distribution scripts and `chains.json`. | DEPLOY-VERIFY-01 and DEPLOYCONFIG-01 cover fail-closed artifact provenance, dirty/stale manifest gates, library/constructor verification, configured-revnet replay guards, deployment resume rehearsal, and full-stack fork coverage. | Final production readiness still needs exact-chain deployment rehearsal evidence for every intended production chain. |

### Source File Coverage Checkpoint

`AUDIT_SRC_MANIFEST.md` is the literal per-file appendix for the 295 in-scope production `src/*.sol` files. It is not a
formal proof, but every concrete file returned by `rg --files <repo>/src` is listed there and mapped to the relevant
evidence bucket. The partition table below remains as the compact report-level summary.

| Repo | File partitions checked | Evidence bucket |
| --- | --- | --- |
| `banny-retail-v6` | 2 files: 1 root, 1 interface. | BANNY-01/02 local/fork resolver coverage and `test/formal/BannyResolverHalmos.t.sol`. |
| `croptop-core-v6` | 11 files: 3 root, 3 interfaces, 5 structs. | CROPTOP-01/02 publisher/deployer/fork coverage. |
| `defifa` | 22 files: 5 root, 6 interfaces, 2 libraries, 2 enums, 7 structs. | DEFIFA-01 game-flow, fee, reserve, governance, invariant/fork coverage, and `test/formal/DefifaHookLibHalmos.t.sol`. |
| `nana-721-hook-v6` | 38 files: 6 root, 2 abstract, 8 interfaces, 5 libraries, 17 structs. | 721-01/02/03 tier lifecycle, split, fork, and invariant coverage. |
| `nana-address-registry-v6` | 2 files: 1 root, 1 interface. | ADDRESS-01 plus full utility test/fork checkpoint. |
| `nana-buyback-hook-v6` | 8 files: 2 root, 3 interfaces, 1 library, 2 structs. | BUYBACK-01/02/03 and ROUTER-UNI-01 swap/fork coverage. |
| `nana-core-v6` | 87 files: 16 root, 2 abstract, 31 interfaces, 10 libraries, 5 periphery, 22 structs, 1 enum. | CORE-01 through CORE-07 plus core formal/invariant campaigns. |
| `nana-distributor-v6` | 9 files: 3 root, 3 interfaces, 1 library, 2 structs. | DIST-01 through DIST-05, distributor invariant/fork coverage, and `test/formal/JBVestingMathHalmos.t.sol`. |
| `nana-omnichain-deployers-v6` | 6 files: 1 root, 1 interface, 4 structs. | OMNI-01/02 plus shortened omnichain invariant coverage. |
| `nana-ownable-v6` | 4 files: 2 root, 1 interface, 1 struct. | OWNABLE-01 and ownable invariant coverage. |
| `nana-permission-ids-v6` | 1 root file. | PERMISSION-01 constants scan and build gate. |
| `nana-project-handles-v6` | 2 files: 1 root, 1 interface. | HANDLES-01 plus malformed resolver/control-character coverage. |
| `nana-project-payer-v6` | 5 files: 2 root, 3 interfaces. | PAYER-01/02/03/04 plus audit/fork payer coverage. |
| `nana-router-terminal-v6` | 16 files: 3 root, 8 interfaces, 2 libraries, 3 structs. | ROUTER-TERM-01 and ROUTER-UNI-01 router/fork coverage. |
| `nana-suckers-v6` | 58 files: 8 root, 7 deployers, 21 interfaces, 8 libraries, 11 structs, 2 enums, 1 utility. | SUCKER-01/02, SUCKER-BRIDGE-01, SUCKER-REG-01, SUCKER-MAP-01, SUCKER-ALLOW-01, conversion invariants, and `test/formal/JBSuckerLibHalmos.t.sol`. |
| `revnet-core-v6` | 17 files: 3 root, 3 interfaces, 1 library, 10 structs. | REVNET-TERM-01, REVNET-LOAN-01, REVNET-FEE-01, Revnet invariant/fork coverage, and `test/formal/REVLoansHalmos.t.sol`. |
| `univ4-lp-split-hook-v6` | 5 files: 2 root, 2 interfaces, 1 library. | LP-SPLIT-01/02 invariant, fork coverage, and `test/formal/JBUniswapV4LPSplitHookHalmos.t.sol`. |
| `univ4-router-v6` | 2 files: 1 root, 1 library. | ROUTER-UNI-01/02 invariant and V4 routing coverage. |

### Release-Gate Command Split

The slow-suite split is intentionally path-scoped instead of weakening coverage. PR CI should keep running each repo's
standard `forge fmt --check`, full non-script `forge test`, and size build jobs. Release verification should add the
expensive fork/invariant slices below and record the exact RPC/chain used.

| Gate | Command | Evidence / reason |
| --- | --- | --- |
| Standard contract PR CI | `forge test --deny notes --fail-fast --summary --detailed --skip "*/script/**"` plus `forge build --deny notes --sizes --skip "*/test/**" --skip "*/script/**" --skip SphinxUtils`. | Matches the ecosystem workflow shape in `STYLE_GUIDE.md`; refreshed PR checks report passing required jobs for the opened branches. |
| Omnichain fast invariant release slice | `forge test --root nana-omnichain-deployers-v6 --match-path 'test/invariants/*.t.sol' --fail-fast --summary --detailed`. | Already run: 2 invariant campaigns, 1024 runs/depth 100 each, 204,800 handler calls total, 51.2s. Keeps the randomized campaign local and avoids replaying fork setup for every handler call. |
| Omnichain fork release slice | `forge test --root nana-omnichain-deployers-v6 --match-path 'test/fork/*.t.sol' --fail-fast --summary --detailed`. | Already run: 5 fork suites and 24 tests for sucker deployment, cash-out, queue/adjust, stress, and weight behavior. This is where real V4/buyback/sucker composition belongs. |
| Omnichain broad local regression slice | `forge test --root nana-omnichain-deployers-v6 --skip '*/fork/**' --fail-fast --summary --detailed`. | Already run: exit code 0 across 29 suites and 161 tests/properties, including both local invariant campaigns. This path-based gate avoids the older filename-sensitive `--no-match-path '*Fork.t.sol'` pattern, which can accidentally include fork files whose names do not end with `Fork.t.sol`. |
| Full release rehearsal | Run the standard PR gate, the omnichain invariant slice, the omnichain fork slice, and any app/deploy-all fork suites touched by the release branch. | Keeps CI short enough for PR iteration while preserving fork-backed cross-component coverage before merge/release. |

### Connected Subagent Coverage Reconciliation

Read-only subagents were used for the next pass over high-coupling surfaces. They did not edit files; this section
records the extra coverage signal and keeps the remaining weak seams explicit.

Foundation/core pass:

- `nana-core-v6`: rechecked project identity, directory routing, permission roots, controller lifecycle, terminal
  execution, terminal store accounting, ruleset timing, token supply, pricing, metadata, split helpers, interfaces, and
  structs. The strongest remaining seam is still composed hook behavior around `JBMultiTerminal`, `JBTerminalStore`,
  and `JBPayoutSplitGroupLib`, especially partial hook pulls, fee-free surplus accounting, held-fee processing, and
  same-terminal project payouts.
- `nana-permission-ids-v6`, `nana-ownable-v6`, `nana-address-registry-v6`, `nana-project-handles-v6`, and
  `nana-project-payer-v6`: rechecked permission namespace drift, dynamic project ownership, deterministic provenance,
  ENS resolver soft-fails, payer clone forwarding, allowance cleanup, and callback-style ERC-20 observation during
  inbound transfer versus terminal pull. Residual risk is mostly downstream misuse of trust boundaries and intentionally
  unrecoverable direct token transfers; rebasing token behavior remains documented as not recommended.

Cross-chain/Revnet/router pass:

- `nana-suckers-v6`: rechecked bridge ledger conservation, bridge-bound outbox deletion, immutable token mappings,
  multiple active suckers per peer chain, registry freshness-first aggregation, non-symmetric peer permissioning,
  bridge approvals, swap CCIP nonce scoping, pending swap claim blocking, and separate-sucker asset-pair reuse. Residual
  risks are bridge/router/token honesty, remote-chain integrity, local fork RPC availability, and gas/liveness behavior
  for long-lived out-of-order `JBSwapCCIPSucker` nonce batches.
- `nana-omnichain-deployers-v6`: rechecked constructor-pinned controller, derived projects/directory, launch
  controller validation, 721 cash-out hook composition, local-backed sucker cash-outs, and slow invariant/fork split.
  Generic omnichain launches intentionally accept caller terminal configs; unlike Revnet, terminal identity is a project
  owner trust boundary rather than a canonical-system invariant.
- `revnet-core-v6`: rechecked accounting-context-only deployment, constructor-pinned `MULTI_TERMINAL`, route-only
  `ROUTER_TERMINAL_REGISTRY`, token-only loan sources, callback-locked loan changes, sucker cash-out scope, and native
  fee call-value accounting. Cross-chain loan/surplus freshness remains accepted but test-backed rather than formally
  proved.
- `nana-router-terminal-v6`: rechecked registry fail-fast behavior, default-terminal cohort history, forwarding cycle
  rejection, baseline refunds, and bounded route/cash-out recursion. External route market risk remains bounded by
  tests and docs, not eliminated.

Promising threads kept open:

- Rechecked the composed hook/terminal seam around split-hook partial pulls, held-fee processing, same-terminal project
  payouts, and fee-free surplus accounting. Existing tests cover ERC-20 allowance-delta partial pulls, native hook
  reentrancy, same-project payout rejection, and fee-free surplus lifecycle. No fresh bug confirmed; the remaining gap
  is formal composition proof rather than an immediate missing regression.
- Revisit ruleset temporal edges around approval-hook rejection, auto-cycling, weight cache updates, payout-limit cycle
  resets, and surplus-allowance ruleset IDs. Focused recheck found existing explicit coverage for rejected-rule weight
  cache updates, cache-boundary liveness, ruleset stress/fuzz, payout-limit accounting, and surplus allowance carrying
  across implicit auto-cycles. Remaining edges are owner-induced maintenance/trust boundaries: gas-burning approval
  hooks, very long rejected/queued ruleset chains, weight-cache upkeep after extreme cycle counts, and terminal-scoped
  usage counters across migrations.
- Closed the `nana-suckers-v6/RISKS.md` stale wording around same-peer active registry aggregation; the docs now match
  the freshness-first active snapshot selection rule, with MAX only as a same-freshness tie-breaker or deprecated-sucker
  fallback.
- Rechecked gas/liveness coverage for long-lived out-of-order `JBSwapCCIPSucker` batches. Current code uses a compact
  populated-nonce list, so sparse nonce gaps do not force empty-slot scans. The residual boundary is O(populated batch
  count) when the matching range is late in the list. A temporary local harness populated 2,499 non-matching batches
  before appending the matching oldest batch and measured 2,299,252 gas for the claim lookup path, so this is now
  documented as an operational monitoring/rotation concern rather than a sparse-nonce exploit.
- Rechecked composed Revnet loan economics across sucker snapshots. Canonical Revnet peer snapshots export local loan
  collateral/debt through `REVOwner.peerChainAdjustedAccountsOf(...)`, and `JBSuckerLib` folds that optional data-hook
  adjustment into outbound peer-chain state. The remaining risk is asynchronous freshness or soft-failed optional hook
  delivery, not a current omission in canonical Revnet snapshots.

Repo evidence snapshot:

| Repo | Primary report evidence | Current residual concern |
| --- | --- | --- |
| `nana-core-v6` | CORE-01 through CORE-07 plus broad non-fork/fuzz/invariant suites. | Final proof still needs composed terminal/hook manifest. |
| `nana-permission-ids-v6` | PERMISSION-01 constants/docs scan and build/test command. | Constants-only package; downstream compatibility remains ecosystem-wide. |
| `nana-ownable-v6` | OWNABLE-01 zero-address hardening plus broad suite. | Authority assumptions depend on project NFT and permissions state. |
| `nana-address-registry-v6` | ADDRESS-01 registry provenance review and regression suite. | Registry remains permissionless metadata, not an authorization oracle. |
| `nana-project-handles-v6` | HANDLES-01 malformed resolver hardening and full suite. | ENS availability and resolver honesty remain external dependencies. |
| `nana-project-payer-v6` | PAYER-01/02/03 plus fork and non-fork suites; root inventory now includes it. | Direct token transfers are intentionally unrecoverable. |
| `nana-721-hook-v6` | 721-01/02/03 plus local/fork split, tier cleanup, and pay-hook conservation coverage. | Complex tier behavior still relies on broad test coverage, not formal proof. |
| `nana-buyback-hook-v6` | BUYBACK-01/02/03 plus registry/default/metadata/fork coverage. | Market route correctness depends on configured pools/oracles. |
| `nana-router-terminal-v6` | ROUTER-TERM-01 and ROUTER-UNI-01 fork-backed coverage. | Router cannot make arbitrary external swap paths risk-free. |
| `nana-suckers-v6` | SUCKER-01, SUCKER-02, SUCKER-REG-01, SUCKER-MAP-01, SUCKER-ALLOW-01. | Bridge and remote-chain integrity remain trust boundaries. |
| `nana-omnichain-deployers-v6` | OMNI-01/02 plus invariant/fork coverage. | Slow omnichain suite was improved, but final audit must document runtime budget choices. |
| `nana-distributor-v6` | DIST-01/02/03/04/05 plus broad and fork coverage. | Reward-token behavior beyond standard ERC-20 remains a review focus. |
| `univ4-router-v6` | ROUTER-UNI-01/02 structural-arbitrage and fork coverage. | AMM/oracle manipulation is bounded by documented assumptions, not eliminated. |
| `univ4-lp-split-hook-v6` | LP-SPLIT-01/02 plus fork coverage and helper-level Halmos proof. | Pool state and Permit2 assumptions remain integration-critical. |
| `revnet-core-v6` | REVNET-TERM-01, REVNET-LOAN-01, REVNET-FEE-01 plus loan/fork/regression suites. | Cross-chain loan/surplus staleness is accepted and documented. |
| `croptop-core-v6` | CROPTOP-01/02 plus publisher/deployer/fork coverage. | Publisher policy complexity still benefits from focused scenario review. |
| `banny-retail-v6` | BANNY-01/02 plus build, regression, broad non-fork, and mainnet-fork coverage. | Standalone script/deploy surface is currently aligned; package graph drift should remain a release-gate check. |
| `defifa` | DEFIFA-01 plus governance, fulfillment, reserve, and non-fork suites. | Permissionless game launch trust boundaries must remain explicit to users. |
| `nana-fee-project-deployer-v6` | FEEDEPLOY-01 plus fork/regression/broad coverage. | Canonical replay checks must track any Revnet config changes. |
| `deploy-all-v6` | DEPLOY-VERIFY-01, DEPLOYCONFIG-01, Revnet/router/full-stack fork evidence. | Final deployment readiness still requires real-script/exact-equivalence rehearsal evidence for every production chain. |

## Coverage Log

- Read root `AUDIT_INSTRUCTIONS.md`, `ARCHITECTURE.md`, `RISKS.md`, `USER_JOURNEYS.md`.
- Read prior `AUDIT_REPORT.md` tail and current open edge-case index.
- Enumerated submodules and current dirty state.
- Corrected continuation scope after user directive to skip `nana-referral-split-hook-v6`.
- Ran a sidecar scope-gap review; actionable smart-contract follow-up was `nana-project-payer-v6` reconciliation.
- Rechecked `nana-project-payer-v6` source, deploy-all deployment/verifier references, package pins, and local
  verification commands.
- Corrected continuation scope after user directive to exclude `bendystraw-v6` and `website`.
- Verified CORE-01 with two temporary local PoCs in `nana-core-v6`, then removed the temporary files:
  - `RegressionReentrantERC20Intake.t.sol` proved store over-credit.
  - `RegressionReentrantERC20CrossProjectDrain.t.sol` proved same-token cross-project pool drain.
- Implemented CORE-01 mitigation in `nana-core-v6/src/JBMultiTerminal.sol`.
- Added permanent CORE-01 regression coverage in
  `nana-core-v6/test/regression/ReentrantERC20IntakeGuard.t.sol`.
- Ran focused compatibility regressions for legitimate nested-hook composition:
  - `SplitHookBalanceDeltaReentrancy.t.sol`
  - `CashOutReenterPay.t.sol`
  - `TestForwardedTokenConsumption.sol`
- Ran the broad `nana-core-v6` non-fork test suite with `--deny notes --fail-fast --summary --detailed`; command
  exited successfully.
- Verified DIST-01 with a temporary local PoC in `nana-distributor-v6`, then replaced it with permanent regression
  coverage:
  - `ReentrantRewardFundingPoC.t.sol` proved distributor hook-balance over-credit and same-token pool drain.
  - `ReentrantRewardFundingGuard.t.sol` proves the fix for both direct `fund(...)` and split
    `processSplitWith(...)` paths.
- Implemented DIST-01 mitigation in `nana-distributor-v6/src/JBDistributor.sol`,
  `nana-distributor-v6/src/JBTokenDistributor.sol`, and `nana-distributor-v6/src/JB721Distributor.sol`.
- Ran the broad `nana-distributor-v6` non-fork test suite with `--deny notes --fail-fast --summary --detailed`;
  command exited successfully.
- Hardened `nana-distributor-v6` native split funding so `JBTokenDistributor` and `JB721Distributor` require
  `msg.value == context.amount` for native split contexts and reject native value on ERC-20 split contexts. Added
  malformed split regressions and a mainnet-fork payout split conservation assertion.
- Hardened `JB721Distributor` owner voting-budget accounting so zero-reward vesting attempts do not consume the
  snapshot owner's cap. Updated the existing replay PoC to prove the high-value token remains claimable.
- Re-ran focused distributor regressions, the token distributor fork suite, `forge fmt --check`, and the broad
  `nana-distributor-v6` non-fork suite with invariants; all exited successfully.
- Rechecked `nana-distributor-v6` reward-token/snapshot surfaces after the current style pass. This pass confirmed
  DIST-04 and hardened the shared inbound ERC-20 transfer window. It re-read the shared distributor, token distributor,
  721 distributor, vesting/snapshot structs, and existing audit regressions, then reran:
  - `forge test --root nana-distributor-v6 --deny notes --skip '*/fork/**' --fail-fast --summary --detailed`:
    exit code 0 across 23 suites, including 79 `JB721Distributor` tests and 5 invariant campaigns at 102,400 calls
    each.
  - `forge test --root nana-distributor-v6 --match-path test/fork/TokenDistributorFork.t.sol --fail-fast --summary --detailed`:
    exit code 0; 9 fork tests passed, covering direct funding, payout split funding, vest/collect, carry-over,
    undelegated holders, snapshot consistency, and conservation.
- Verified and fixed PAYER-03 in `nana-project-payer-v6/src/JBProjectPayer.sol`; updated edge tests to prove
  terminal under-pull leaves no residual drainable allowance.
- Ran `nana-project-payer-v6` focused edge tests and the broad non-fork suite with `--fail-fast --summary --detailed`;
  both exited successfully.
- Verified and fixed OMNI-01 in `nana-omnichain-deployers-v6/src/JBOmnichainDeployer.sol`; updated cash-out
  composition regressions so NFT cash-outs skip generic extra cash-out hooks.
- Ran focused omnichain cash-out regression suites and the broad non-fork, non-invariant omnichain suite; all exited
  successfully.
- Verified and fixed OMNI-02 in `nana-omnichain-deployers-v6/src/JBOmnichainDeployer.sol`; fresh launches now require
  the provided controller to use the canonical `PROJECTS` registry and to register itself in the canonical directory.
  Ran the real-core guard tests plus mocked controller-validation regressions successfully.
- Refactored `nana-omnichain-deployers-v6/test/invariants/**` so the long stateful campaigns run against a local
  deployer/721/terminal/sucker setup with one public invariant entrypoint per handler. The V4/buyback integration
  remains covered by targeted fork tests instead of being replayed for every invariant handler operation.
- `forge test --root nana-omnichain-deployers-v6 --match-path 'test/invariants/*.t.sol' --fail-fast --summary --detailed`:
  exit code 0; both invariant campaigns ran `1024` runs at depth `100` (204,800 handler calls total) in 51.2s.
- `forge test --root nana-omnichain-deployers-v6 --match-path 'test/fork/*.t.sol' --fail-fast --summary --detailed`:
  exit code 0 across 5 fork suites and 24 tests, covering sucker deployment, cash-out, 721 queue/adjust, stress, and
  weight behavior.
- `forge test --root nana-omnichain-deployers-v6 --no-match-path '*Fork.t.sol' --fail-fast --summary --detailed`:
  exit code 0 across the broad local suite with invariants included. Note that the repository's
  `test/fork/TestOmnichain721QueueAndAdjust.t.sol` path is still included by this historical pattern because its
  filename does not end with `Fork.t.sol`.
- Ran two read-only connected subagent coverage passes:
  - foundation/core pass across `nana-core-v6`, `nana-permission-ids-v6`, `nana-ownable-v6`,
    `nana-address-registry-v6`, `nana-project-handles-v6`, and `nana-project-payer-v6`;
  - cross-chain/Revnet/router pass across `nana-suckers-v6`, `nana-omnichain-deployers-v6`,
    `revnet-core-v6`, and `nana-router-terminal-v6`.
  The reconciled weak seams are recorded in the connected subagent coverage section above.
- Rechecked the strongest foundation/core seam from the subagent pass by inspecting `JBPayoutSplitGroupLib`,
  `JBMultiTerminal.executePayout`, `_sendPayoutsOf`, and the related regression/fuzz coverage.
- Ran
  `forge test --root nana-core-v6 --match-contract 'TestExecutePayoutPartialPull_Local|SplitHookBalanceDeltaReentrancy|FeeFreeSurplusLifecycle|SelfReferencingPayoutRevert' --fail-fast --summary --detailed`:
  exit code 0. Results: 18 passed, 0 failed, 0 skipped, including the 4096-run ERC-20 partial-pull conservation fuzz
  test plus native hook reentrancy, same-project payout rejection, and fee-free surplus lifecycle coverage.
- Rechecked temporal ruleset edges by inspecting `JBRulesets.currentOf`, `upcomingOf`, weight-cache helpers,
  `JBTerminalStore.recordPayoutFor`, `recordUsedAllowanceOf`, and the risk docs for payout-limit vs surplus-allowance
  reset semantics.
- Ran
  `forge test --root nana-core-v6 --match-contract 'CycledSurplusAllowanceResetTest|WeightCacheBoundary_Local|TestWeightCacheStaleAfterRejection|TestRulesetQueuingStress|TestCurrentOf_Local|TestUpcomingRulesetOf_Local|TestUpdateRulesetWeightCache_Local|TestRecordPayoutFor_Local|TestRecordUsedAllowanceOf_Local' --fail-fast --summary --detailed`:
  exit code 0. Results: 57 passed, 0 failed, 0 skipped, including ruleset stress fuzz, rejected-approval weight-cache
  regressions, cache-boundary liveness, payout-limit accounting, and the explicit non-reset of surplus allowance across
  implicit cycles.
- Reconciled the temporal-ruleset sidecar follow-up with the local read. No new theft/extraction candidate was found;
  the remaining weak seams are project-owner maintenance boundaries already represented in docs/tests: gas-burning
  approval hooks can brick the project-local ruleset read path, very long rejected/queued chains can create traversal
  pressure, weight-cache maintenance is required after extreme cycle counts, and terminal migration can reset
  terminal-scoped usage counters.
- Rechecked Revnet remote-loan corrections across `REVOwner.peerChainAdjustedAccountsOf(...)` and
  `JBSuckerLib._snapshotAccountsOf(...)`. Updated `revnet-core-v6/RISKS.md` section 7.10 to say canonical Revnet
  snapshots include loan debt/collateral through the optional peer-chain adjustment hook; the residual accepted risk is
  stale, missing, or soft-failed peer snapshots.
- Added a focused regression to `revnet-core-v6/test/regression/RemoteLoanStateOmission.t.sol` proving `REVOwner`
  exports local loan collateral as extra peer snapshot supply and outstanding debt as both extra peer snapshot surplus
  and balance.
- Ran `forge test --root revnet-core-v6 --match-path test/regression/RemoteLoanStateOmission.t.sol --summary --detailed`:
  exit code 0. Results: 3 passed, 0 failed, 0 skipped.
- Ran
  `forge test --root nana-suckers-v6 --match-path test/unit/peer_chain_state.t.sol --match-test 'test_toRemoteAddsDataHookPeerChainAdjustedAccounts' --summary --detailed`:
  exit code 0. Results: 1 passed, 0 failed, 0 skipped.
- Ran `forge test --root revnet-core-v6 --match-path test/fork/TestLoanBorrowFork.t.sol --fail-fast --summary --detailed`:
  exit code 0. Results: 4 passed, 0 failed, 0 skipped, covering forked borrow, fee distribution, tier split
  composition, and beneficiary reentrancy blocking.
- Ran `forge test --root nana-suckers-v6 --match-path test/MultiSuckerFork.t.sol --fail-fast --summary --detailed`:
  exit code 0. Results: 10 passed, 0 failed, 0 skipped, including multiple active suckers per chain pair, deprecation
  replacement, freshness updates, stale snapshot rejection, and multi-chain aggregation.
- Rechecked the remaining `nana-project-payer-v6` callback-token seam. Added
  `test/audit/ProjectPayerCallbackToken.t.sol` to prove a callback-style ERC-20 cannot distort the measured forwarded
  amount or leave stale `originalPayer` state across inbound transfer and terminal-pull phases.
- Ran `forge test --root nana-project-payer-v6 --summary --detailed`: exit code 0. Results: 68 passed, 0 failed,
  0 skipped across unit, edge, audit, regression, and fork suites.
- Verified and fixed SUCKER-01 in `nana-suckers-v6/src/JBSwapCCIPSucker.sol`; added
  `nana-suckers-v6/test/regression/InitialSwapReentrantClaim.t.sol`.
- Ran focused sucker regression coverage, the related swap/claim regression group, and the broad non-fork sucker suite
  including invariants; all exited successfully.
- A broader sucker command using `--skip '*/fork/**'` still ran `test/AdversarialSuckerFork.t.sol` and failed only on
  missing `RPC_ARBITRUM_MAINNET`; the refined `--no-match-path 'test/*Fork*.t.sol'` run is the clean recorded result.
- Verified and fixed BUYBACK-01 in `nana-buyback-hook-v6/src/JBBuybackHook.sol`; updated
  `nana-buyback-hook-v6/test/regression/DerivedMinSellSideFOTDoS.t.sol` to cover metadata-less derived-minimum pool
  failure and fee-on-transfer output delivery.
- Ran focused buyback sell-side regression suites, `forge fmt --check`, and the broad non-fork buyback suite including
  invariants; all exited successfully.
- Recorded router/terminal sidecar non-findings.
- Closed the `nana-721-hook-v6` sidecar review by fixing the low-severity trailing removed-tier cleanup liveness issue;
  reentrancy and split/cash-out timing were reconciled against current regression coverage and state-transition
  ordering.
- Read `revnet-core-v6` docs and mapped high-value paths through `REVDeployer`, `REVOwner`, `REVLoans`, sucker
  registry accounting, buyback routing, and cash-out fee composition.
- Reconciled registered-sucker cash-outs as intentional local-chain bridge accounting; added inline comments, risk-doc
  updates, and focused tests across `revnet-core-v6`, `nana-omnichain-deployers-v6`, and `croptop-core-v6`.
- Ran the focused sucker bridge accounting suites in those three repos; all exited successfully.
- Ran focused revnet cash-out composition regressions, `forge fmt --check`, and the broad non-fork revnet suite with
  `--no-match-path '*Fork.t.sol'`; all exited successfully, including non-fork invariant suites.
- Mapped `nana-721-hook-v6` pay, split, reserve, checkpoint, and NFT cash-out paths; ran the broad suite with
  `--fail-fast --summary --detailed`, including tier lifecycle and store invariants, with exit code 0.
- Mapped Defifa launch, mint/refund, scorecard, BWA, fulfillment, reserve, weighted cash-out, and fee-token claim
  paths.
- Reconciled Defifa's COMPLETE-before-final-ruleset boundary against terminal payout-limit accounting and existing
  fulfillment failure handling.
- Ran focused Defifa fulfillment, fee-accounting, adjusted-pending-reserve, and reserve-dilution regression suites, then
  the broad non-fork Defifa suite; all exited successfully.
- Rechecked sucker bridge-bound accounting windows in `JBSucker` and OP/Arbitrum/CCIP/Celo/swap subclasses.
- Ran focused sucker invariant and regression coverage for outbox accounting, claim/emergency execution isolation,
  initial-swap reentrant claims, transient claim context, partial-fill swap behavior, and out-of-order swap-batch rates;
  all exited successfully.
- Mapped Banny resolver custody, body-transfer, anti-stranding, category-exclusivity, SVG publication, and ERC-2771
  sender paths.
- Ran focused Banny regression, decoration, transfer-lifecycle, and tokenURI suites, then the broad non-fork Banny
  suite; all exited successfully.
- Mapped ProjectHandles ENS name storage, namehash, setter isolation, ERC-2771 sender scoping, resolver lookup, and
  input validation paths.
- Hardened `JBProjectHandles.handleOf(...)` so malformed ENS resolver return data soft-fails to `""` instead of
  reverting.
- Ran focused malformed-resolver coverage, `forge fmt --check`, and the broad ProjectHandles suite; all exited
  successfully.
- Mapped Ownable dynamic project ownership, direct-address ownership, delegated permission IDs, stale-permission
  invalidation, renounce behavior, constructor dependency assumptions, and unminted-project behavior.
- Hardened `transferOwnershipToProject(...)` so address-owned contracts deployed without `PROJECTS` reject project
  ownership transfers with the explicit existing error.
- Ran focused zero-address regression coverage, `forge fmt --check`, and the broad Ownable suite including invariants;
  all exited successfully.
- Mapped AddressRegistry deterministic CREATE/CREATE2 provenance registration, first-write semantics, deployment helper
  validation, and production write-side integrations in 721, LP split hook, and Defifa deployers.
- Ran focused AddressRegistry regression coverage, `forge fmt --check`, and the broad non-fork AddressRegistry suite;
  all exited successfully.
- Mapped `nana-permission-ids-v6` constants, stale range docs, high-impact ID descriptions, and downstream
  smart-contract permission checks.
- Corrected permission-ID docs so sucker lifecycle IDs are `32-36`, Revnet loan IDs are `37-39`, and ID `40` is
  explicitly unassigned.
- Ran the stale-reference scan, `forge fmt --check`, `forge build --deny notes`, and the constants-only `forge test`
  command for `nana-permission-ids-v6`; all exited successfully, with Forge reporting no tests in the package.
- Mapped `nana-fee-project-deployer-v6` deployment script, fee-project canonical skip guard, project-1 squat
  regressions, operator/split/auto-issuance configuration, native terminal setup, and deploy-all NANA revnet parity.
- Hardened the standalone fee-project replay guard so an existing project `1` is accepted only when it matches the
  expected Revnet hash, fee-revnet dependency, operator, URI, reserved split, native terminal, and router-terminal
  setup.
- Hardened the deploy-all NANA replay guard with the same exact-shape checks and added a source-level regression to
  prevent falling back to the generic nonzero-hash revnet guard.
- Updated fee-project deployer risk docs and ran focused guard/regression coverage, `forge fmt --check`,
  `forge build --deny notes`, the broad non-fork suite, deploy-all focused coverage/build checks, and the fork
  deployment suite; all exited successfully.
- Recorded the production-deployment assumption: no production state exists yet, so new fixes do not need to preserve
  backward compatibility with legacy deployed behavior.
- Mapped router terminal, buyback, Univ4 router, LP-split, ProjectPayer, and deploy-all fork coverage for
  cross-component findings and no-findings.
- Ran the focused router terminal / Univ4 router / LP-split local regression suites; all exited successfully.
- Ran cross-component fork suites for ProjectPayer+terminal, buyback+V4, router terminal+V3/V4/JB terminal, Univ4
  router+JB terminal, LP-split+PoolManager/PositionManager/JB terminal, and deploy-all native/USDC revnet lifecycles;
  all exited successfully.
- Re-ran the full deploy-all local regression verifier suite after aligning stale post-deploy provenance tests with the
  current per-package temporary artifact-output model; the suite exited successfully across 38 suites and 70 tests.
- Updated `PostDeployStaleSourceArtifactGap.t.sol` and `PostDeployDirtyArtifactProvenanceGap.t.sol` so they continue to
  enforce fail-closed artifact provenance and dirty-manifest gates under the current npm-package build path.
- Hardened deploy-all configured-revnet replay guards for Defifa, ART, MARKEE, and Banny; ran focused guard tests,
  deploy-all build, and the full local deploy-all regression suite.
- Hardened `JBMultiTerminal.migrateBalanceOf(...)` so migration reverts instead of refunding an immediate failed
  protocol fee back into a repeat-migratable source-terminal residue; ran focused migration and fee-processing suites
  plus the broad `nana-core-v6` non-fork suite including fuzz and invariants.
- Hardened `JBMultiTerminal.migrateBalanceOf(...)` against destination self-reference, which could otherwise strand
  ERC-20 project accounting through a zero-delta self-transfer; ran focused self-migration and migration/fee suites plus
  the broad `nana-core-v6` suite including fuzz and invariants.
- Reconciled the terminal-migration payout-limit reset thread as accepted terminal-scoped accounting: usage counters are
  keyed by terminal, so separately configured destination terminals use their own limits. Clarified
  `nana-core-v6/RISKS.md`.
- Triaged the reported hidden-token multiplier thread against current V6 code. `REVHiddenTokens.sol` is not present;
  core burns destroy live supply rather than moving it into a reclaimable hidden bucket, and Revnet loan math only adds
  burned loan collateral back because borrowers retain a repayable claim. Clarified the core and Revnet risk docs plus
  stale ecosystem references; reran the phantom-terminal regression and scoped/sucker cash-out boundary tests.
- Reconciled the initial-project-configuration hijack thread as an accepted launch-provenance risk: `launchProjectFor`
  is explicitly callable by anyone on behalf of any owner, and project IDs are allocation-order outputs rather than
  commitments. Clarified core docs so owner address alone is not treated as launch authorization.
- Reconciled the Revnet auto-issuance stage-ID thread as a false positive for the current deployer path:
  `JBRulesets` assigns sequential IDs (`deployTimestamp + i`) when all stages are queued in `deployFor`, and existing
  project conversion is restricted to blank projects. Cleaned up a stale regression test so it asserts the actual
  stage-key/ruleset-ID invariant.
- Hardened fund-access-limit configuration so one ruleset cannot split the same terminal/token pair across duplicate
  groups. Duplicate currencies were already rejected within a single group; the new guard closes the malformed
  cross-group variant and keeps surplus views aligned with canonical payout-limit lookup.
- Rechecked `JBSplits` self-managed group authorization, same-ruleset locked-split enforcement, cross-ruleset lock
  scope, packing, and fallback behavior. Updated stale lock-scope docs, then hardened duplicate locked-split
  multiplicity after sidecar review showed a boolean inclusion check could collapse identical locked entries.
- Hardened reserved-token project splits so no-hook splits cannot point back to the source project and recycle pending
  reserves through the source project's own terminal. Added real core plus terminal coverage in `TestSplits`.
- Hardened `JBSuckerRegistry` same-peer aggregation to prefer the freshest active snapshot; ran local registry,
  sucker, Revnet, Omnichain, broad sucker non-fork, and fork suites covering downstream cash-out/loan consumers.
- Updated `nana-suckers-v6/RISKS.md` section 10.5 to remove stale MAX-among-active wording and document
  freshness-first same-peer aggregation, multi-lane asset-pair support, and the best-effort nature of aggregate remote
  values.
- Rechecked `JBSwapCCIPSucker` nonce lookup and claim scaling. Current code walks the compact
  `_populatedNonceByIndex` list rather than sparse `[1, highestNonce]` slots. Updated `nana-suckers-v6/RISKS.md`
  section 10.11 and the stale gas-regression comment in `SwapBatchRateMixing.t.sol` to match the actual O(populated
  batch count) behavior.
- Built and removed a temporary worst-case gas harness for the same lookup: the harness populated 2,499 non-matching
  batches before appending the matching oldest batch, then claimed leaf 0. The claim lookup used 2,299,252 gas, while
  the full test consumed 191,940,570 gas because setup populated every batch. This confirms the residual liveness cost
  is tied to received-batch count and insertion order, not sparse nonce gaps.
- Ran
  `forge test --root nana-suckers-v6 --match-contract 'SwapCCIPScalingTest|RegressionSwapBatchRateMixingTest|RegressionSwapNonceScanGasTest|RegressionSwapSparseEmptyMidpointTest|RegressionSwapQueueOrderTest|RegressionSwapZeroAmountBatchGapTest|StaleNonceMetadataOverwriteTest|ZeroOutputSwapPendingTest|ZeroOutputRetryClaimTest|InitialSwapReentrantClaimTest' --fail-fast --summary --detailed`:
  exit code 0. Results: 29 passed, 0 failed, 0 skipped, including 4096-run claim-scaling fuzz, out-of-order roots,
  missing nonce range behavior, stale nonce replay protection, zero-output pending swaps, and sparse nonce gas coverage.
- Re-ran the edited gas regression only:
  `forge test --root nana-suckers-v6 --match-contract 'RegressionSwapNonceScanGasTest' --fail-fast --summary --detailed`:
  exit code 0; 1 passed, 0 failed, 0 skipped.
- Hardened per-sucker token mapping so two local tokens cannot share one remote destination inbox inside the same
  sucker, while preserving parallel bridge lanes across separate suckers; ran focused mapping regressions, existing
  map-token regressions, the broad sucker local suite, `MultiSuckerFork`, and the available sucker fork subset.
- Hardened sucker bridge send paths so CCIP, OP Stack, Celo, and Arbitrum token approvals are revoked after successful
  bridge/router calls. Added a partial-pull CCIP router regression proving leftover bridge-token and LINK-fee
  allowances are zeroed; reran the broad sucker local suite and available fork subset.
- Ran a focused `croptop-core-v6` publisher/deployer sidecar review. Reconciled stale pre-claim deployer permissions,
  `CTProjectOwner` project-NFT authority grants, existing-tier policy reuse, terminal/hook trust, and URI mutation
  against current tests and risk docs.
- Hardened `CTPublisher` so documented zero-as-unlimited supply caps work and new multi-category tier batches are
  sorted before crossing into the canonical 721 hook; ran focused publisher, regression, full-stack publish fork, and
  broad Croptop non-fork suites.
- Hardened `CTDeployer` so the final `JBProjects` NFT handoff uses `safeTransferFrom`; ran real-core local coverage,
  a fork-backed Croptop deployer regression, and affected deployer/ownership suites.
- Reworked `nana-omnichain-deployers-v6` invariant tests to keep randomized campaigns local and consolidate assertions
  into one invariant entrypoint per handler; verified the invariant path in 51.2s and separately reran the omnichain
  fork suite for the real V4/buyback/sucker integration layer.
- Rechecked the buyback registry default-hook and metadata-boundary threads. Current registry logic preserves
  historical default-hook cohorts, scopes mint permission to the resolved hook, and rekeys registry-scoped pay/cash-out
  metadata to the resolved hook. Ran focused registry/default/metadata suites successfully.
- Hardened `JBPrices` so direct and inverse custom price feeds returning zero fail closed with `JBPrices_ZeroPrice`
  before downstream accounting can consume a zero price or divide by zero. Ran focused `JBPrices` and terminal-store
  conversion suites successfully.
- Rechecked LP split pool-preinitialization/range-manipulation hypotheses against current economic tick-bound
  validation, permissionless terminal-token selection, local sucker-aware cash-out-rate tests, and forked V4 tick-bound
  coverage. No new LP hook bug confirmed.
- Rechecked Univ4 router structural arbitrage against current risk docs and tests. Cross-route V4/Juicebox arbitrage
  remains accepted and bounded by project economics; ran the structural-arbitrage suite successfully.
- Hardened `JBRouterTerminalRegistry` so nullable cold-start terminal resolution is preserved for `terminalOf(...)`
  while passthrough view and transactional forwarding paths fail explicitly before accepting funds or calling a zero
  terminal. Ran the focused registry test file, all router-terminal regression tests, and the router-terminal fork
  suites.
- Hardened `REVDeployer` so revnet deployments choose accounting contexts only while constructor-pinned
  `MULTI_TERMINAL` and `ROUTER_TERMINAL_REGISTRY` define the canonical project terminals. Deployment scripts pass
  `JBRouterTerminalRegistry` as `ROUTER_TERMINAL_REGISTRY`. Ran focused Revnet terminal/hash regressions, the broad Revnet
  regression pack, fee-project deployer unit coverage, deploy-all router-registry verifier coverage, and the
  deploy-all Ethereum full-stack fork test.
- Removed `REVLoanSource`; Revnet loans now accept and persist source tokens only, with accounting contexts derived
  from the constructor-pinned `MULTI_TERMINAL`. The loan contract also pins the same canonical multi-terminal directly,
  so runtime borrowing no longer depends on reading it back through the revnet data hook. Ran focused loan source,
  reallocation, remote-state, and router-registry regression suites.
- Rechecked `nana-project-payer-v6` after the Revnet pass. The current implementation clears terminal ERC-20 allowances
  after successful `pay` and `addToBalanceOf`, so the old residual-allowance risk text was stale; updated
  `nana-project-payer-v6/RISKS.md` to distinguish cleared under-pull allowances from intentionally unrecoverable direct
  token transfers.
- Closed the ProjectPayer root-inventory gap by adding `nana-project-payer-v6` to `ARCHITECTURE.md` and
  `USER_JOURNEYS.md`; updated `PAYER-01` from inventory gap to doc-fixed.
- Hardened `REVOwner.afterCashOutRecordedWith` so native fee forwarding must be matched by the current call's
  `msg.value`, preventing public callers from spending forced/stuck ETH while preserving explicit fee donations. Ran
  focused caller-validation coverage and the existing cash-out fork fee path.
- Hardened `JBUniswapV4LPSplitHook` so successful V4 mint paths clear both Permit2's spender allowance and the ERC-20
  allowance granted to Permit2. Ran the focused partial-mint unit regression and fork-backed real Permit2 deploy test.
- Hardened `REVLoans` loan-changing entrypoints with a transient callback lock so native payout, terminal, or token
  callbacks cannot open nested loan actions against partially updated aggregate loan accounting. Ran a focused
  contract-beneficiary regression and the matching loan fork-harness test.
- Closed Banny standalone build drift by pinning the fixed Croptop package line, updating the deploy script to
  `revnet.basicDeployer`, and updating generated migration Solidity snippets to call `hook.projectId()`. Verified with
  `forge build --root banny-retail-v6 --deny notes`, the focused regression suite, the broad non-fork suite, and the
  Banny mainnet-fork harness.
- Rechecked the ProjectHandles ENS boundary after the low-level resolver hardening. The canonical registry lookup is a
  trusted dependency, while name-owner controlled resolver calls soft-fail on revert or malformed return data. Updated
  stale risk/test wording and reran `forge fmt --root nana-project-handles-v6 --check` plus
  `forge test --root nana-project-handles-v6 --fail-fast --summary --detailed`: exit code 0 across 6 suites and 70
  tests.
- Rechecked the Omnichain deployer canonical-controller boundary. `JBOmnichainDeployer` now uses its immutable
  `CONTROLLER` and constructor-derived `DIRECTORY` for fresh launches, blank-project launches, and queues, with a
  post-launch directory assertion. Fixed the deploy script's stale `Hook721Deployment` field name
  (`hook.hookDeployer`) so script compilation matches the current 721 deployment helper. Verified with
  `forge fmt --root nana-omnichain-deployers-v6 --check`,
  `forge test --root nana-omnichain-deployers-v6 --match-path test/regression/ValidateController.t.sol --summary --detailed`,
  and
  `forge test --root nana-omnichain-deployers-v6 --match-path test/regression/OmnichainRegression.t.sol --match-test test_poc_launchRulesetsFor_revertsWhenControllerDoesNotRegister --summary --detailed`.
- Rechecked the router-terminal balance-delta/callback thread against the registry forwarding path, lossy-token
  behavior, original-payer propagation, and multi-hop forwarding-cycle guards. No new theft path was confirmed without
  relying on a malicious terminal minting for a payment it did not pull. Ran
  `forge test --root nana-router-terminal-v6 --match-contract 'RouterRegistryReceiptMismatchTest|RegistryForwardingLossyTokenTest|LossyReceiptRegressionTest|PayerTrackerRefundTest|MultiHopForwardCycleTest|RegistryMultiHopForwardingCycleTest' --fail-fast --summary --detailed`:
  exit code 0 across 6 suites and 12 tests.
- Rechecked the lower-priority Defifa project-NFT receiver footgun. `DefifaProjectOwner` intentionally traps received
  `JBProjects` NFTs and grants `SET_SPLIT_GROUPS` for the received token ID, but `DefifaDeployer` only exercises split
  authority against its fixed `DEFIFA_PROJECT_ID`, so an unrelated project NFT transfer is a custody mistake rather
  than a confirmed deployer-controlled mutation path. Reran focused fee/no-contest/security coverage:
  `forge test --root defifa --match-contract 'DefifaFeeAccountingTest|DefifaSecurity|DefifaNoContestTest' --fail-fast --summary --detailed`,
  exit code 0 across 3 suites and 39 tests.
- Ran `forge build --root nana-omnichain-deployers-v6 --deny notes --skip '*/test/**'` after the deploy-script helper
  field fix; compile succeeded.
- Reconciled `AUDIT_REPORT_2_REVIEW.md` and accepted review finding 1. `JBUniswapV4LPSplitHook._clearPermit2Approval`
  now writes Permit2 `amount = 0` and `expiration = 1`, because Permit2 treats `expiration = 0` as valid through the
  current block. Unit and fork coverage now assert the real Permit2 allowance amount is zero and the stored expiration
  is the already-expired timestamp `1`.
- Reconciled review finding 2. `JBProjectHandles._textRecordOf` now caps copied resolver text records at 256 bytes,
  which is far above the expected `chainId:projectId` record while preventing a name-owner-controlled resolver from
  forcing every on-chain reader to copy large but ultimately unverifiable strings. Added a harness regression proving
  256 bytes is accepted and 257 bytes soft-fails to `""`.
- Reconciled review finding 3. `JBDistributor._acceptErc20FundsFrom` now arms `_acceptingToken` before the first
  external token call, including `balanceOf`, so a callback-capable or upgradeable reward token cannot reenter while
  the intake guard is still clear. Full distributor unit, fork, regression, and invariant coverage passed.
- Reconciled review finding 4. `REVLoans.liquidateExpiredLoansFrom` now uses `nonReentrantLoanAction`, matching the
  other state-changing loan paths and preserving the loan-action invariant if liquidation later grows an external
  callback. Full Revnet unit, fork, regression, and invariant coverage passed.
- Triaged review finding 5 as non-blocking operational hygiene. Same-address `MULTI_TERMINAL` /
  `ROUTER_TERMINAL_REGISTRY` constructor input would still fail downstream as duplicate terminals; since v6 is
  pre-production and the user explicitly prefers constructor-level canonical terminals without extra constructor
  argument accommodation, no additional deployer guard was added in this pass.
- Triaged review finding 7 as intentionally redundant post-launch sanity checking. `JBOmnichainDeployer` already uses
  immutable `CONTROLLER` and constructor-derived `DIRECTORY`; the directory post-check is gas-trivial and remains as a
  documented assertion rather than removed dead code.
- Reconciled `AUDIT_REPORT_2_AMEND.md` AMEND-01. Same-terminal split pays now mark the internal split source project
  before `_efficientPay`, net non-feeless destination pay-hook forwards inline, add those forwarded gross amounts to
  the source-side fee-eligible total, and cap `_feeFreeSurplusOf` back to only the value that remains in the destination
  project's terminal balance. The new regression proves a 10 ETH same-terminal split whose destination data hook
  forwards 9 ETH pays the 9 ETH hook-forward fee immediately, tracks only the 1 ETH residue as fee-free surplus, then
  charges the remaining residue fee on zero-tax cashout for a total protocol fee of `10 ether / 40`.
- Rechecked the stale Phase 3 token-supply invariant that failed during the AMEND run. The invariant now explicitly
  applies only before owner-controlled outflows; payouts, surplus allowance, and cashouts can intentionally leave
  nonzero token supply with zero terminal balance. The targeted invariant and full core suite both pass.
- Re-ran contract-size builds after the review/amendment fixes. All edited packages remain below EIP-170:
  `JBMultiTerminal` is very tight at 24,552 bytes with 24 bytes of runtime margin; `JBUniswapV4LPSplitHook` has 589
  bytes of margin; `JBProjectHandles` has 18,705 bytes; `JBTokenDistributor` has 15,534 bytes;
  `JB721Distributor` has 12,694 bytes; `REVLoans` has 2,202 bytes.
- Verification for the review/amendment pass:
  - `forge fmt --root nana-core-v6 --check`, `forge test --root nana-core-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`,
    `forge build --root nana-core-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**'`, and
    `halmos --root nana-core-v6 --contract HalmosSmoke --solver-threads 1 --solver-timeout-assertion 30s --statistics`:
    core full suite passed; Halmos smoke proved 5 fee properties; size build passed with the 24-byte
    `JBMultiTerminal` margin noted above.
  - `forge fmt --root univ4-lp-split-hook-v6 --check`,
    `forge test --root univ4-lp-split-hook-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`, and
    `forge build --root univ4-lp-split-hook-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**'`: passed,
    including the Permit2 fork coverage.
  - `forge test --root univ4-lp-split-hook-v6 --match-path test/fork/DeployPositionManagerAddresses.t.sol --fail-fast --summary --detailed`:
    7 passed after pinning the mainnet PositionManager sanity check to the suite's stable Ethereum fork block.
  - `forge fmt --root nana-project-handles-v6 --check`,
    `forge test --root nana-project-handles-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`, and
    `forge build --root nana-project-handles-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**'`: passed.
  - `forge fmt --root nana-distributor-v6 --check`,
    `forge test --root nana-distributor-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`, and
    `forge build --root nana-distributor-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**'`: passed.
  - `forge fmt --root revnet-core-v6 --check`,
    `forge test --root revnet-core-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`, and
    `forge build --root revnet-core-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**'`: passed.
- Bumped package metadata for the edited packages: `@bananapus/core-v6` `0.0.57`,
  `@bananapus/univ4-lp-split-hook-v6` `0.0.43`, `@bananapus/project-handles-v6` `0.0.16`,
  `@bananapus/distributor-v6` `0.0.22`, and `@rev-net/core-v6` `0.0.60`. Direct `@bananapus/core-v6` dependency
  ranges in downstream packages stay on the latest published line so CI can install before `0.0.57` is published.
  `npm pack --dry-run` passed in each edited package.

## Completion Audit Status

Not complete. The audit sweep has produced report-backed findings, risk-doc updates, regression/fork tests, package
PRs, and green CI for the latest smart-contract hardening branches, but the user objective explicitly asks for full
top-to-bottom formal verification. No comprehensive machine-checkable formal spec, proof harness, or composed-system
verifier exists yet, so the objective cannot be marked complete.

Concrete success criteria derived from the objective:

1. `AUDIT_REPORT_2.md` is the record keeper for findings, hypotheses, commands, tests, accepted risks, and completion
   gaps.
2. Scope includes Banny, Defifa, Revnet, Croptop, all in-scope Nana smart-contract repos, Univ4 hooks/routers, and
   deployer/verifier packages; `nana-referral-split-hook-v6`, `bendystraw-v6`, and `website` are excluded by later user
   instruction.
3. Every production module and dependency is mapped to reviewed invariants, trust boundaries, and interaction paths.
4. Promising invariant-break threads have surviving reproducible PoCs or regression/fork tests.
5. Cross-component dynamics have fork or integration-style tests wherever feasible.
6. Changes avoid unnecessary surface area and document non-obvious diffs inline.
7. Package PRs are open/pushed with package versions/dependencies already bumped on the branch where applicable.
8. CI, including tests and contract-size checks, passes for opened PRs.
9. Formal verification exists top to bottom, not just adversarial review plus tests.

Prompt-to-artifact checklist:

| Requirement | Current evidence inspected | Completion status |
| --- | --- | --- |
| Use `AUDIT_REPORT_2.md` as record keeper | This file contains the findings, risk decisions, command log, module manifest, and this completion audit. | Satisfied for current work; keep extending it. |
| Include all intended smart-contract repos | Workspace inventory on 2026-05-21 shows 295 production `src/*.sol` files across 18 in-scope runtime repos: `banny-retail-v6`, `croptop-core-v6`, `defifa`, `nana-721-hook-v6`, `nana-address-registry-v6`, `nana-buyback-hook-v6`, `nana-core-v6`, `nana-distributor-v6`, `nana-omnichain-deployers-v6`, `nana-ownable-v6`, `nana-permission-ids-v6`, `nana-project-handles-v6`, `nana-project-payer-v6`, `nana-router-terminal-v6`, `nana-suckers-v6`, `revnet-core-v6`, `univ4-lp-split-hook-v6`, and `univ4-router-v6`. `nana-fee-project-deployer-v6` and `deploy-all-v6` are deployment/script packages. | Satisfied for smart-contract scope, subject to user exclusions. |
| Map modules/dependencies/interactions | Module-to-invariant manifest and repo evidence snapshot map each runtime repo to reviewed module groups, invariants, and trust boundaries. `AUDIT_SRC_MANIFEST.md` now lists all 295 in-scope production `src/*.sol` files and ties each file to the relevant evidence bucket. | Partially satisfied: per-file coverage exists, but not a per-function formal dependency graph. |
| Deep invariant analysis | Findings and regressions cover pooled terminal accounting, split conservation, callback ordering, bridge-bound values, registry freshness, Revnet loans, deployment provenance, router/swap boundaries, 721 tier lifecycle, distributor snapshots, Croptop policy, Banny custody, and Defifa game flow. | Partially satisfied: substantial adversarial coverage, not exhaustive formal proof. |
| Reproducible PoCs for promising threads | Verified findings have in-repo regression/fork tests where relevant; temporary gas/attack harnesses are documented when removed. | Satisfied for confirmed findings in this pass; future confirmed threads should add durable tests. |
| Cross-component fork/integration tests | Report records fork/integration evidence for deploy-all, ProjectPayer+terminal, buyback/V4, router terminal, Univ4 router, LP split, sucker, Revnet, Croptop, Banny, Defifa, and omnichain deployer paths. | Satisfied for the current reviewed findings; no single exhaustive cross-chain campaign exists. |
| Prefer reduced surface / no broad unnecessary diffs | PRs removed/narrowed Revnet terminal config and loan-source surface, cleaned stale docs/tests, added narrow guards/regressions, and documented non-obvious changes inline. | Satisfied for current changes. |
| Package PRs and version/dependency bumps | Existing PR branches carry package versions one patch above npm latest for changed packages where package metadata applies; latest follow-up commits were pushed to existing PRs. | Satisfied for current PR set; no new extra package bump was made for report-only or selector-payload follow-up commits. |
| CI/tests/contract sizes pass | Refreshed `gh pr checks` inspection on 2026-05-21: `nana-core-v6` #152, `nana-address-registry-v6` #72, `nana-ownable-v6` #77, `nana-permission-ids-v6` #72, `nana-project-handles-v6` #20, `nana-project-payer-v6` #19, `nana-721-hook-v6` #139, `nana-distributor-v6` #29, `nana-buyback-hook-v6` #134, `nana-router-terminal-v6` #118, `nana-univ4-lp-split-hook-v6` #132, `banny-retail-v6` #117, `nana-suckers-v6` #134, and `revnet-core-v6` #158 report passing their Foundry job plus `halmos-smoke`; `nana-omnichain-deployers-v6` #110, `croptop-core-v6` #137, `nana-fee-project-deployer-v6` #78, and `deploy-all-v6` #143 all report passing required jobs. `version-6` #151 reports no checks. | Satisfied for opened PRs as of 2026-05-21. |
| Formal verification top to bottom | Halmos 0.3.3 is installed; `nana-core-v6/test/formal/HalmosSmoke.t.sol` has passing symbolic smoke proofs for zero-fee `JBFees` behavior, bounded standard-fee helper equivalence, full-width standard-fee subtraction safety, and an audit-selected `JBCashOuts` bonding-curve boundary table; `nana-core-v6/test/formal/BondingCurveProperties.t.sol` now also pins the same cash-out tax-rate boundary table in the existing Forge property suite; `nana-permission-ids-v6/test/formal/JBPermissionIdsHalmos.t.sol` has passing symbolic checks for permission namespace stability; `nana-address-registry-v6/test/formal/JBAddressRegistryHalmos.t.sol` has passing symbolic proofs for CREATE RLP nonce-width branches; `nana-project-handles-v6/test/formal/JBProjectHandlesHalmos.t.sol` has passing symbolic checks for ENS resolver text-record parsing; `nana-ownable-v6/test/formal/JBOwnableHalmos.t.sol` has passing symbolic proofs for ownership-state transitions and invalid owner encodings; `nana-project-payer-v6/test/formal/JBProjectPayerHalmos.t.sol` has passing symbolic checks for tracker identity propagation and ERC-165 advertising; `nana-721-hook-v6/test/formal/JBBitmapHalmos.t.sol` has passing symbolic smoke proofs for removed-tier bitmap behavior; `nana-distributor-v6/test/formal/JBVestingMathHalmos.t.sol` has passing checks for vesting locked-share, final dust, no-claim, and partial-unlock cumulative-delta behavior; `nana-buyback-hook-v6/test/formal/JBSwapLibHalmos.t.sol` has passing branch proofs for slippage floor/ceiling behavior; `nana-router-terminal-v6/test/formal/JBSwapLibHalmos.t.sol` has passing symbolic checks for router-terminal slippage, impact, and price-limit helper branches; `univ4-router-v6/test/formal/OracleHalmos.t.sol` has passing oracle ring-buffer, interpolation, oldest-observation, and accumulator checks; `univ4-lp-split-hook-v6/test/formal/JBUniswapV4LPSplitHookHalmos.t.sol` has passing tick-alignment, token-ordering, and native-currency helper checks; `nana-omnichain-deployers-v6/test/formal/JBOmnichainDeployerHalmos.t.sol` has passing controller/salt/default-721 and local-vs-remote sucker cash-out checks; `croptop-core-v6/test/formal/CroptopHalmos.t.sol` has passing publisher policy/sorting/reuse checks plus deployer sucker-accounting checks; `banny-retail-v6/test/formal/BannyResolverHalmos.t.sol` has passing checks for category-name boundaries and retained-outfit membership behavior; `defifa/test/formal/DefifaHookLibHalmos.t.sol` has passing phase/refund/weighted-cash-out helper checks; `revnet-core-v6/test/formal/REVLoansHalmos.t.sol` has passing source-fee timing checks for prepaid-window zero fees, expired-loan rejection, max-prepay denominator safety, and an active-ramp boundary table; and `nana-suckers-v6/test/formal/JBSuckerLibHalmos.t.sol` has passing same-currency peer-value conversion, merkle branch-root, and bounded tree-root helper proofs. The core, permission-ids, address-registry, project-handles, ownable, project-payer, 721, distributor, buyback, router-terminal, Univ4 router, LP split hook, omnichain deployers, Croptop, Banny, Defifa, Revnet, and suckers repos now wire those smoke targets into CI. No broad Certora/Scribble/Halmos/K/Coq/SMT-style composed proof suite, invariant spec set, or exhaustive protocol model has been added or run. Current evidence is tests, fuzz/invariants, fork tests, manual review, subagent review, and narrow Halmos proofs. | Partially satisfied for bounded repo-level proof lanes; no composed protocol proof. |

Remaining uncovered requirements:

- Build a formal specification plan before claiming "formal verification": define protocol-level invariants for
  controller/terminal/store, hooks, suckers, Revnet loans, router/swap paths, 721 tier accounting, distributor rewards,
  deployers, and games/apps, then choose proof tooling per layer.
- Convert the strongest cross-component invariants into machine-checkable specs or bounded model/property harnesses.
- Keep `AUDIT_SRC_MANIFEST.md` refreshed whenever the production `src/*.sol` inventory changes.
- Decide whether the accepted slow-suite split for omnichain/fork coverage is sufficient for release gates, and record
  exact commands that CI should run versus local release-only verification.
- Re-run this completion audit after formal-spec/proof artifacts exist; until then, do not mark the goal complete.

## Formal Verification Plan

Current tooling state on 2026-05-20:

- Available: Foundry 1.6.0-v1.7.0, including the existing fuzz and invariant harnesses.
- Available: Halmos 0.3.3, installed during this pass for Solidity-level symbolic execution.
- Not currently installed in the workspace shell: `certoraRun`, `scribble`, `echidna`, and `medusa`.
- Existing machine-checkable evidence is bounded Foundry tests/invariants, fork/integration tests, and narrow Halmos
  smoke proofs. This is valuable adversarial evidence, but it is not a top-to-bottom formal proof.

Existing invariant-harness inventory:

| Repo | Existing invariant/spec surface |
| --- | --- |
| `banny-retail-v6` | `test/formal/BannyResolverHalmos.t.sol`. |
| `nana-core-v6` | `test/ComprehensiveInvariant.t.sol`, `EconomicSimulation.t.sol`, `PermissionsInvariant.t.sol`, `test/invariants/**`, `test/formal/**`, and `test/formal/HalmosSmoke.t.sol`. |
| `nana-721-hook-v6` | `test/invariants/TierLifecycleInvariant.t.sol`, `TieredHookStoreInvariant.t.sol`, handlers, and `test/formal/JBBitmapHalmos.t.sol`. |
| `nana-distributor-v6` | `test/invariant/JB721DistributorInvariant.t.sol` and `test/formal/JBVestingMathHalmos.t.sol`. |
| `nana-buyback-hook-v6` | `test/invariant/BuybackHookInvariant.t.sol` and `test/formal/JBSwapLibHalmos.t.sol`. |
| `nana-router-terminal-v6` | `test/invariant/RouterTerminalInvariant.t.sol` and `test/formal/JBSwapLibHalmos.t.sol`. |
| `nana-suckers-v6` | `test/invariants/ConversionParityInvariant.t.sol`, `test/unit/invariants.t.sol`, and `test/formal/JBSuckerLibHalmos.t.sol`. |
| `nana-omnichain-deployers-v6` | `test/invariants/**` local deployer/721/terminal/sucker campaigns and `test/formal/JBOmnichainDeployerHalmos.t.sol`. |
| `revnet-core-v6` | `REVLoans.invariants.t.sol`, `REVInvincibility.t.sol`, `test/invariants/PoolPriceInvariant.t.sol`, and `test/formal/REVLoansHalmos.t.sol`. |
| `defifa` | `test/DefifaMintCostInvariant.t.sol` and `test/formal/DefifaHookLibHalmos.t.sol`. |
| `nana-ownable-v6` | `test/OwnableInvariantTests.sol`. |
| `univ4-lp-split-hook-v6` | `test/invariant/LPSplitHookInvariant.t.sol` and `test/formal/JBUniswapV4LPSplitHookHalmos.t.sol`. |
| `croptop-core-v6` | `test/formal/CroptopHalmos.t.sol` plus publisher/deployer/fork regression suites. |
| `univ4-router-v6` | `test/Invariant.t.sol` and `test/formal/OracleHalmos.t.sol`. |
| `deploy-all-v6` | `test/fork/FlashLoanInvariantsFork.t.sol` for deployed-composition checks. |

Proof layers to build next:

1. Core ledger model: `JBController`, `JBMultiTerminal`, `JBTerminalStore`, `JBTokens`, `JBRulesets`,
   `JBSplits`, and permission/directory dependencies. First invariants: terminal solvency, project-token supply,
   reserved-token accounting, payout-limit consumption, fee-free surplus, held-fee processing, migration
   conservation, and split lock uniqueness.
2. Hook and plugin model: 721 tiers, distributor rewards, buyback/router hooks, project payer, project handles, and LP
   split hooks. First invariants: split conservation, no residual approvals after hook execution, tier supply/reserve
   bounds, reward-token solvency, and external registry/resolver trust boundaries.
3. Cross-chain model: suckers, omnichain deployers, and Revnet loan/sucker interactions. First invariants:
   bridge-bound value is consumed exactly once, inbox/outbox nonces are monotonic, remote snapshots never create local
   backing, same peer aggregation uses fresh per-chain snapshots, and multiple suckers per chain pair remain separate
   risk lanes.
4. App/deployer model: Revnet, Croptop, Defifa, Banny, `nana-fee-project-deployer-v6`, and `deploy-all-v6`. First
   invariants: constructor-pinned canonical dependencies, deployment replay identity, project-NFT handoff, app-specific
   custody boundaries, and launch/game phase transitions.

Candidate implementation path:

1. Strengthen Foundry invariants first because the toolchain is already present. Promote the highest-value regression
   assertions into stateful properties and keep fork-backed checks for cross-component dynamics that depend on real
   deployed integrations.
2. Add a proof-tool lane once an external verifier is approved/installed. Halmos is the most natural first target for
   Solidity-level bounded symbolic properties; Certora/Scribble/Echidna remain candidates for richer rule specs and
   long-running campaigns.
3. Keep the per-`src/*.sol` manifest in `AUDIT_SRC_MANIFEST.md` synchronized with production source changes. Each file
   maps to one of: a proved invariant, a Foundry property, a fork/integration regression, or an explicitly accepted
   trust boundary.

Initial machine-checkable spec targets:

- Terminal solvency: for every accepted token and project, total terminal ledger claims cannot exceed actual terminal
  backing after excluding explicitly bridge-bound, held-fee, or pending external-transfer state.
- Split conservation: every payout/reserve/hook split either consumes exactly its assigned value or returns/revokes the
  unused value, with no residual token allowance left behind.
- Revnet loan consistency: total borrowed, collateral, reallocation, repayment-with-new-loan, and cross-chain snapshot
  state remain internally consistent across all loan lifecycle actions.
- Sucker bridge safety: bridge roots, inbox claims, emergency executions, swap callbacks, approvals, and remote
  snapshots cannot mint local backing or claim the same bridge-bound value twice.
- 721 tier lifecycle: tier supply, reserve supply, category ordering, cash-out weights, cleaned tiers, and metadata
  lookup state remain bounded after add/remove/mint/cash-out flows.
- Distributor rewards: hook-scoped reward balances, vesting totals, voting snapshots, and actual ERC-20/native backing
  stay solvent under callback-capable token behavior.

Progress against the plan:

- Strengthened `nana-core-v6/test/invariants/TerminalStoreInvariant.t.sol` so the stateful native-terminal campaign
  runs against two independent user projects plus the fee project instead of only one user project. The handler now
  chooses a project per operation, and `INV-TS-1`/`INV-TS-4`/`INV-TS-5` check that the terminal's ETH covers the
  combined tracked store balances after randomized `pay`, `addToBalance`, `cashOutTokens`, and `sendPayouts`
  sequences.
- Verification command:
  `forge test --root nana-core-v6 --match-path test/invariants/TerminalStoreInvariant.t.sol --fail-fast --summary --detailed`.
  Result: exit code 0; 5 invariant properties passed, each with 1024 runs and 102,400 handler calls. This is bounded
  Foundry evidence for the core native terminal solvency model, not a complete formal proof.
- Strengthened `nana-distributor-v6/test/invariant/JB721DistributorInvariant.t.sol` with exact reward-token backing and
  vesting-reserve equality checks. The new equality exposed DIST-05, and the fixed suite now proves across the bounded
  campaign that tracked hook rewards equal actual ERC-20 backing and aggregate vesting equals the remaining token-ID
  claims.
- Verification command:
  `forge test --root nana-distributor-v6 --match-path test/invariant/JB721DistributorInvariant.t.sol --fail-fast --summary --detailed`.
  Result: exit code 0; 7 invariant properties passed, each with 1024 runs and 102,400 handler calls.
- Strengthened `nana-suckers-v6/test/unit/invariants.t.sol` so the emergency-exit campaign explicitly checks the
  derived emergency execution bitmap. The harness now documents that normal claims consume the peer-inbox namespace
  while emergency exits consume local outbox leaves, so the same numeric index can exist in both directions without a
  double-spend; the new invariant asserts every tracked emergency exit is marked in the emergency namespace.
- Verification command:
  `forge test --root nana-suckers-v6 --match-path test/unit/invariants.t.sol --fail-fast --summary --detailed`.
  Result: exit code 0; 9 invariant properties passed, each with 1024 runs and 102,400 handler calls.
- Re-ran `nana-suckers-v6/test/invariants/ConversionParityInvariant.t.sol`, which compares
  `JBSuckerLib.convertPeerValue(...)` against the terminal-store conversion formula over randomized amount, decimal,
  and price inputs.
- Verification command:
  `forge test --root nana-suckers-v6 --match-path test/invariants/ConversionParityInvariant.t.sol --fail-fast --summary --detailed`.
  Result: exit code 0; the conversion parity invariant and liveness check passed with 1024 runs and 102,400 handler
  calls each.
- Re-ran `nana-buyback-hook-v6/test/invariant/BuybackHookInvariant.t.sol`, which exercises
  `beforePayRecordedWith(...)` across oracle-derived and explicit-quote routing. The bounded property checks that the
  hook either leaves minting unchanged or chooses a swap route whose guaranteed output plus leftover minting is at
  least the no-hook mint amount.
- Verification command:
  `forge test --root nana-buyback-hook-v6 --match-path test/invariant/BuybackHookInvariant.t.sol --fail-fast --summary --detailed`.
  Result: exit code 0; 2 invariant properties passed with 1024 runs and 102,400 handler calls each, plus the handler
  smoke test.
- Re-ran `nana-router-terminal-v6/test/invariant/RouterTerminalInvariant.t.sol`, which fuzzes ETH, WETH, token A,
  token B, and project-token routing through pay, add-to-balance, and cash-out style paths. The bounded properties
  assert the router terminal does not retain forwarded assets and that tracked ETH/token forwarding totals match the
  handler model.
- Verification command:
  `forge test --root nana-router-terminal-v6 --match-path test/invariant/RouterTerminalInvariant.t.sol --fail-fast --summary --detailed`.
  Result: exit code 0; 9 invariant properties passed, each with 1024 runs and 102,400 handler calls.
- Re-ran `nana-721-hook-v6/test/invariants/*.t.sol`, covering tier store and lifecycle state under add/remove,
  pay-and-mint, owner mint, reserve mint, NFT cash-out, discount, and time-advance operations. The bounded properties
  check per-tier supply accounting, total cash-out weight consistency, pay-credit non-negativity, reserve mint bounds,
  removed-tier exclusion, cash-out weight bounds, max-tier monotonicity, reserve mint bounds, and store-level supply
  conservation.
- Verification command:
  `forge test --root nana-721-hook-v6 --match-path 'test/invariants/*.t.sol' --fail-fast --summary --detailed`.
  Result: exit code 0; 9 invariant properties passed, each with 1024 runs and 102,400 handler calls. Runtime was
  14.84s for `TieredHookStoreInvariant` and 263.89s for `TierLifecycleInvariant`.
- Re-ran `univ4-router-v6/test/Invariant.t.sol`, covering flash-accounting conservation and oracle state under swaps,
  observations, time warps, and combined swap/observe operations. The bounded properties check accounting
  conservation, oracle cardinality caps, oracle state consistency, and tick-cumulative bounds.
- Verification command:
  `forge test --root univ4-router-v6 --match-path test/Invariant.t.sol --fail-fast --summary --detailed`.
  Result: exit code 0; 4 invariant properties passed with 1024 runs and 102,400 handler calls each, plus 3 directed
  tests for per-swap conservation, observe monotonicity, and TWAP dampening.
- Re-ran `univ4-lp-split-hook-v6/test/invariant/LPSplitHookInvariant.t.sol`, covering LP fee accumulation,
  zero-accumulation, fee collection/routing, and liquidity rebalancing. The bounded properties check accumulated
  accounting versus minted balances, balance upper bounds, fee accounting, per-project bounds, position lifecycle
  consistency, and token-ID/deploy-count consistency.
- Verification command:
  `forge test --root univ4-lp-split-hook-v6 --match-path test/invariant/LPSplitHookInvariant.t.sol --fail-fast --summary --detailed`.
  Result: exit code 0; 7 invariant properties passed, each with 1024 runs and 102,400 handler calls.
- Re-ran `nana-ownable-v6/test/OwnableInvariantTests.sol`, covering address ownership, project ownership, renounce,
  and transfer transitions. The bounded properties check that ownership cannot simultaneously belong to both a user
  and a project, project ownership excludes address ownership, renounce zeroes ownership state, and transfer resets the
  permission ID.
- Verification command:
  `forge test --root nana-ownable-v6 --match-path test/OwnableInvariantTests.sol --fail-fast --summary --detailed`.
  Result: exit code 0; 4 invariant properties passed, each with 1024 runs and 102,400 handler calls.
- Re-ran `defifa/test/DefifaMintCostInvariant.t.sol`, covering randomized mint/refund sequences in the mint-cost model.
  The bounded properties check token-count consistency and that total mint cost remains equal to price times live
  tokens under the handler's expected model.
- Verification command:
  `forge test --root defifa --match-path test/DefifaMintCostInvariant.t.sol --fail-fast --summary --detailed`.
  Result: exit code 0; 3 invariant properties passed, each with 1024 runs and 102,400 handler calls.
- Re-ran Revnet's loan, invincibility, and pool-price invariant surfaces. The loan campaign covers borrow, repay,
  liquidation, collateral reallocation, and time advancement; the invincibility campaign covers pay/borrow, repayment,
  liquidation, cash-out, stage changes, reserved-token sends, and fee-project accounting; the pool-price campaign
  checks deterministic pool price consistency.
- Verification command:
  `forge test --root revnet-core-v6 --match-path test/REVLoans.invariants.t.sol --fail-fast --summary --detailed`.
  Result: exit code 0; 5 invariant properties passed, each with 1024 runs and 102,400 handler calls.
- Verification command:
  `forge test --root revnet-core-v6 --match-contract REVInvincibility_Invariants --fail-fast --summary --detailed`.
  Result: exit code 0; 6 invariant properties passed, each with 1024 runs and 102,400 handler calls.
- Verification command:
  `forge test --root revnet-core-v6 --match-path test/invariants/PoolPriceInvariant.t.sol --fail-fast --summary --detailed`.
  Result: exit code 0; 2 invariant properties passed, each with 1024 runs and 102,400 handler calls.
- Re-ran core formal-style property tests in `nana-core-v6/test/formal/*.t.sol`, covering fee arithmetic and
  bonding-curve cash-out properties. The bounded fuzz properties check fee additivity, return consistency,
  round-trips, subtraction safety, multi-split accumulation, cash-out boundedness, full redemption, no-arbitrage,
  max-tax behavior, monotonicity, and metadata packing round-trips.
- Verification command:
  `forge test --root nana-core-v6 --match-path 'test/formal/*.t.sol' --fail-fast --summary --detailed`.
  Result: exit code 0; 13 fuzz/property tests passed with 4096 fuzz runs each.
- Re-ran `nana-core-v6/test/PermissionsInvariant.t.sol`, covering permission bit packing and stateful
  set/revoke/root-forwarding/wildcard attempts. The bounded properties check that the packed model matches expected
  bits, bit 0 is never set, root forwarding is blocked, wildcard-by-operator is blocked, and `hasPermission(...)`
  matches the bit model.
- Verification command:
  `forge test --root nana-core-v6 --match-path test/PermissionsInvariant.t.sol --fail-fast --summary --detailed`.
  Result: exit code 0; 5 invariant properties passed with 1024 runs and 102,400 handler calls each, plus 4
  bit-packing tests.
- Re-ran `nana-core-v6/test/invariants/TokensInvariant.t.sol` and
  `nana-core-v6/test/invariants/RulesetsInvariant.t.sol`. The token campaign covers mint, burn, credit claim, and
  credit transfer paths; the ruleset campaign covers queued rulesets, time advancement, and weight cache updates.
- Verification commands:
  `forge test --root nana-core-v6 --match-path test/invariants/TokensInvariant.t.sol --fail-fast --summary --detailed`;
  `forge test --root nana-core-v6 --match-path test/invariants/RulesetsInvariant.t.sol --fail-fast --summary --detailed`.
  Result: exit code 0 for both; 4 token invariants and 4 ruleset invariants passed, each with 1024 runs and 102,400
  handler calls.
- Re-ran `nana-core-v6/test/ComprehensiveInvariant.t.sol`, `nana-core-v6/test/EconomicSimulation.t.sol`, and
  `nana-core-v6/test/invariants/Phase3DeepInvariant.t.sol`. Together these campaigns cover multi-operation terminal
  solvency, token supply consistency, payout limits, reclaimable surplus bounds, reserve distribution, held-fee
  accounting, cross-project split cascades, fee-project monotonicity, no-profit-from-cash-out-alone assumptions,
  actor extraction bounds, and global conservation.
- Verification commands:
  `forge test --root nana-core-v6 --match-path test/ComprehensiveInvariant.t.sol --fail-fast --summary --detailed`;
  `forge test --root nana-core-v6 --match-path test/EconomicSimulation.t.sol --fail-fast --summary --detailed`;
  `forge test --root nana-core-v6 --match-path test/invariants/Phase3DeepInvariant.t.sol --fail-fast --summary --detailed`.
  Result: exit code 0 for all three; 8 comprehensive invariants, 6 economic simulation invariants, and 8 phase-3 deep
  invariants passed, each with 1024 runs and 102,400 handler calls.
- Re-ran `nana-omnichain-deployers-v6/test/invariants/*.t.sol`, the shortened local invariant slice that replaced the
  slower repeated omnichain campaign with one assertion entrypoint per handler. The core campaign randomizes project
  payments, cash-outs, sucker payments/cash-outs, and time warps; the cross-chain campaign adds ruleset queuing,
  mocked remote supply/surplus, and reserved-token distribution. Together the assertions cover sucker zero-tax
  cash-outs, 721 hook ordering/storage, fund conservation, token supply bounds, deployer ETH pass-through, hook
  carry-forward, queued ruleset hook configs, launch hook immutability, and no actor profit.
- Verification command:
  `forge test --root nana-omnichain-deployers-v6 --match-path 'test/invariants/*.t.sol' --fail-fast --summary --detailed`.
  Result: exit code 0; `CrossChainDeployerInvariant` passed 1 combined property in 23.71s and
  `OmnichainDeployerInvariant` passed 1 combined property in 27.19s, each with 1024 runs and 102,400 handler calls.
- Re-ran a focused `croptop-core-v6` publisher-policy slice covering allowance packing, allowlist replacement,
  existing-tier reuse after policy changes, URI cache drift, duplicate metadata protection, hook boundary behavior,
  category sorting, split-percent limits, and fee math. Also re-ran the publish fork suite to keep the policy review
  tied to the composed terminal and 721-hook execution path.
- Verification commands:
  `forge test --root croptop-core-v6 --match-path 'test/{CTPublisher.t.sol,regression/RegressionPolicyReuse.t.sol,regression/RegressionCroptopPublisherBoundary.t.sol,regression/RegressionPublishHookBoundary.t.sol,regression/RegressionUriDrift.t.sol,regression/CroptopRegressionFixes.t.sol}' --fail-fast --summary --detailed`;
  `forge test --root croptop-core-v6 --match-path test/fork/PublishFork.t.sol --fail-fast --summary --detailed`.
  Result: exit code 0 for both; 42 local publisher-policy tests passed, including 2 fuzz properties with 4096 runs
  each, and 6 publish fork tests passed.
- Re-ran a focused `banny-retail-v6` custody/composition slice, covering local decorate/redress lifecycles,
  anti-stranding retention, body-transfer asset custody, removed-tier recovery, failed ERC-721 returns,
  category-exclusivity retention, SVG/hash metadata paths, and the 9-outfit rendering gas ceiling. Also re-ran the
  Banny fork suite against the composed 721-hook behavior for auth, lock, redress, rendering, reentrancy, SVG, and
  multi-actor custody flows.
- Verification commands:
  `forge test --root banny-retail-v6 --skip '*/script/**' --match-path 'test/{DecorateFlow.t.sol,OutfitTransferLifecycle.t.sol,TestQALastMile.t.sol,regression/*.t.sol}' --fail-fast --summary --detailed`;
  `forge test --root banny-retail-v6 --match-path test/Fork.t.sol --fail-fast --summary --detailed`.
  Result: exit code 0 for both; 90 local custody/composition tests passed and 79 fork tests passed.
- Re-ran `deploy-all-v6/test/fork/FlashLoanInvariantsFork.t.sol`, the deployed-composition fork suite that ports the
  highest-value core flash-loan attack vectors into the deploy-all environment. The fork tests cover atomic
  pay/cash-out no-profit behavior, multi-payer reclaim conservation, payout sandwich timing, and reserved-token
  inflation effects while using the fork deployment stack instead of isolated core mocks.
- Verification command:
  `forge test --root deploy-all-v6 --match-path test/fork/FlashLoanInvariantsFork.t.sol --fail-fast --summary --detailed`.
  Result: exit code 0; 4 fork tests passed.
- Re-ran the small registry/utility repos that do not justify dedicated stateful invariant harnesses but do sit on
  important trust boundaries. `nana-address-registry-v6` covers CREATE/CREATE2 prediction, zero deployers,
  unauthorized finalization, nonce truncation/boundaries, duplicate registration, deployment-helper validation, and a
  fork integration path. `nana-project-handles-v6` covers ENS resolver soft-fail behavior, malformed return data,
  setter isolation, chain-ID mismatch, control-character rejection, and bidirectional Unicode spoof rejection.
  `nana-project-payer-v6` covers native/ERC-20 forwarding, fee-on-transfer acceptance, allowance cleanup, callback
  token accounting, nested payer tracking, router-style refunds, forced-ETH sweep behavior, and fork payment paths.
- Verification commands:
  `forge test --root nana-address-registry-v6 --fail-fast --summary --detailed`;
  `forge test --root nana-project-handles-v6 --fail-fast --summary --detailed`;
  `forge test --root nana-project-payer-v6 --fail-fast --summary --detailed`.
  Result: exit code 0 for all three; 53 address-registry tests passed including 1 fork test, 60 project-handle tests
  passed, and 68 project-payer tests passed including 5 fork tests and the audit regression slice.
- Follow-up format and size commands also exited 0 for all three:
  `forge fmt --root <repo> --check` and
  `forge build --root <repo> --deny notes --sizes --skip '*/test/**' --skip '*/script/**' --skip SphinxUtils`.
  Runtime size margins were 22,735 bytes for `JBAddressRegistry`, 18,717 bytes for `JBProjectHandles`, and 17,818
  bytes for `JBProjectPayer`.
- Bootstrapped an external symbolic proof lane with Halmos 0.3.3 and added
  `nana-core-v6/test/formal/HalmosSmoke.t.sol` as a deliberately narrow CI-ready proof target for `JBFees`.
  Full-width fee additivity and full-width/uint64 standard-fee helper equivalence were attempted and found too
  solver-heavy for a first gate, so the durable smoke proof records the widening as future formal work.
- Verification command:
  `halmos --root nana-core-v6 --match-contract HalmosSmoke --solver-threads 1 --solver-timeout-assertion 30s --statistics`.
  Result: exit code 0; 5 symbolic tests passed across 30 total symbolic paths in 6.65s test time:
  `check_zeroAmountHasNoFee(uint16)`, `check_zeroFeeDoesNotCharge(uint256)`,
  `check_standardFeeMatchesGeneric(uint16)`, `check_standardFeeResultingInMatchesGeneric(uint8)`, and
  `check_standardFeeDoesNotExceedAmount(uint256)`.
- Related Foundry verification command:
  `forge test --root nana-core-v6 --match-path test/units/static/JBFees/TestFeesFuzz.sol --fail-fast --summary --detailed`.
  Result: exit code 0; 6 fee fuzz tests passed.
- Added `nana-core-v6/.github/workflows/halmos.yml`, scoped to the same `HalmosSmoke` contract. The workflow installs
  Halmos 0.3.3 and runs the smoke proof separately from the long Foundry test job, creating a first CI-enforced
  symbolic lane without broadening runtime contract surface. `gh pr checks` for `nana-core-v6` #152 now reports
  `halmos-smoke` passing in 3m49s alongside passing `forge-fmt` and `forge-test`.
- Added `nana-721-hook-v6/test/formal/JBBitmapHalmos.t.sol`, a bounded Halmos proof target for the tier-removal
  bitmap used by `JB721TiersHookStore`. It proves removed-tier round trips, removal idempotence, same-word bit
  isolation, and cached-word refresh semantics. Added `nana-721-hook-v6/.github/workflows/halmos.yml` to run the
  bitmap proof in CI.
- Verification commands:
  `halmos --root nana-721-hook-v6 --match-contract JBBitmapHalmos --solver-threads 1 --solver-timeout-assertion 30s --statistics`;
  `forge test --root nana-721-hook-v6 --match-path test/unit/JBBitmap.t.sol --fail-fast --summary --detailed`;
  `forge build --root nana-721-hook-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**' --skip SphinxUtils`.
  Results: exit code 0 for all three; Halmos passed 4 symbolic bitmap checks across 16 total paths in 0.41s test time,
  16 bitmap unit/fuzz tests passed, and the size build passed. `JB721TiersHook` remains tight at 4 bytes of runtime
  margin, but the proof/workflow change is test/CI-only and did not alter runtime bytecode.
- Reviewed the reported `_startingTierIdOfCategory` overwrite concern in `JB721TiersHookStore.recordAddTiers(...)`.
  The proposed "only set if unset" fix would be wrong because same-category additions are inserted before older
  same-category tiers in the category-sorted linked list; the category start pointer must move to the later tier so
  traversal reaches both the new head and the older linked tier. Added an inline comment at the pointer update and
  `nana-721-hook-v6/test/regression/CategoryStartPointer.t.sol` to pin the separate-batch same-category scenario.
- Verification commands:
  `forge fmt --root nana-721-hook-v6 --check`;
  `forge test --root nana-721-hook-v6 --match-path test/regression/CategoryStartPointer.t.sol --summary --detailed`;
  `forge test --root nana-721-hook-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`;
  `forge build --root nana-721-hook-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**'`.
  Result: exit code 0 for all four; the focused regression passed, the full 721 suite passed with fork and invariant
  coverage, and the production build still reports `JB721TiersHook` at 24,572 bytes with 4 bytes of runtime margin.
- Added `nana-buyback-hook-v6/test/formal/JBSwapLibHalmos.t.sol`, a bounded Halmos proof target for
  `JBSwapLib.getSlippageTolerance`. Full sigmoid monotonicity and broad bounds were attempted and found too
  solver-heavy for CI, so the durable proof is branch-level: zero-impact floor, pool-fee ceiling, and overflow-impact
  ceiling behavior. Added `nana-buyback-hook-v6/.github/workflows/halmos.yml` to run the proof in CI.
- Verification commands:
  `halmos --root nana-buyback-hook-v6 --match-contract JBSwapLibHalmos --solver-threads 1 --solver-timeout-assertion 30s --statistics`;
  `forge test --root nana-buyback-hook-v6 --match-path test/JBSwapLib.t.sol --fail-fast --summary --detailed`;
  `forge build --root nana-buyback-hook-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**' --skip SphinxUtils`.
  Results: exit code 0 for all three; Halmos passed 3 symbolic slippage branch checks across 14 total paths in 0.04s
  test time, 18 `JBSwapLib` unit/fuzz tests passed, and the size build passed. CI for `nana-buyback-hook-v6` #134
  reports `forge-fmt`, `forge-test`, and `halmos-smoke` passing.
- Added `nana-suckers-v6/test/formal/JBSuckerLibHalmos.t.sol`, a Halmos proof target for
  `JBSuckerLib.convertPeerValue` on the same-currency path, `JBSuckerLib.computeBranchRoot` on fixed merkle proof edge
  paths with arbitrary leaves/proof branches, and `JBSuckerLib.computeTreeRoot` on fixed tree-count classes with
  arbitrary branch entries. It proves zero-value conversion, same-currency/same-decimal identity, same-currency decimal
  scaling parity with `JBFixedPointNumber.adjustDecimals`, branch-root parity against a simple loop reference for
  all-right, all-left, and mixed index patterns, and tree-root parity for every power-of-two count plus every dense
  `(2^n - 1)` low-bit mask across the full 32-level tree. This keeps the proof on cross-chain decimal conversion,
  claim-proof helper, and outbox/inbox root helper boundaries without needing oracle mocks for the different-currency
  price path. Added `nana-suckers-v6/.github/workflows/halmos.yml` to run the proof in CI with `--loop 40`.
- Verification commands:
  `halmos --root nana-suckers-v6 --match-contract JBSuckerLibHalmos --loop 40 --solver-threads 1 --solver-timeout-assertion 30s --statistics`;
  `forge test --root nana-suckers-v6 --match-path test/regression/DecimalParametric.t.sol --fail-fast --summary --detailed`;
  `forge test --root nana-suckers-v6 --match-path test/invariants/ConversionParityInvariant.t.sol --fail-fast --summary --detailed`;
  `forge test --root nana-suckers-v6 --match-path test/unit/merkle_equivalence.t.sol --fail-fast --summary --detailed`;
  `forge build --root nana-suckers-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**' --skip SphinxUtils`.
  Results: exit code 0 for all five; Halmos passed 6 symbolic peer-value/merkle checks across 32 total paths in 13.58s
  test time, 8 decimal regression/fuzz tests passed, the conversion parity invariant passed 204,800 calls across 2
  invariants, 7 merkle equivalence unit/fuzz tests passed, and the size build passed. `JBSwapCCIPSucker` remains close
  to EIP-170 with 36 bytes of runtime margin, but this proof/workflow change is test/CI-only and did not alter runtime
  bytecode. A full arbitrary-count symbolic `computeTreeRoot` reference proof was attempted with `--loop 40` and
  stopped after exceeding the 30-minute proof budget; the bounded count-class proof above is the CI-safe formal target,
  and the existing Foundry merkle equivalence suite remains the durable insertion/root behavior test coverage.
- Clarified the inline documentation around the core reserved-token self-payment guard. The comment now explains that a
  non-zero reserved-token split `projectId` uses the terminal-payment path and why targeting the source project would
  rebook freshly minted reserves as new revenue.
- Added live coverage for the complementary same-project hook path in `TestSplits`: the project accepts its own ERC-20
  through the terminal, sets a same-project reserved-token split with a hook, and the hook pulls the exact controller
  allowance. This documents the intended distinction that hooked reserved splits are direct hook deliveries, while
  no-hook same-project splits are terminal self-payments and must revert.
- Extended `nana-core-v6/test/WeirdTokenTests.t.sol` for decimal-boundary terminal flows. The new regression pays and
  fully cashes out vanilla ERC-20s with `{0, 1, 27}` decimals, asserting `previewPayFor(...)` matches actual minted
  project tokens, `previewCashOutFrom(...)` matches actual reclaimed tokens, and terminal-store balances stay in the
  raw token decimals.
- Extended `nana-core-v6/test/TestCashOut.sol` with an explicit cash-out count boundary table for
  `{0, 1, totalSupply / 2, totalSupply - 1, totalSupply, totalSupply + 1, type(uint256).max}`. Valid counts are checked
  through the terminal preview path against `JBCashOuts`; over-supply counts must revert before burn/transfer logic.
- Rechecked the `_acceptFundsFor(...)` reentrancy gap. Current `JBMultiTerminal` has only two external entrypoints into
  that helper, `pay(...)` and `addToBalanceOf(...)`, and both are already covered by
  `test/regression/ReentrantERC20IntakeGuard.t.sol`.
- Extended `nana-core-v6/test/formal/HalmosSmoke.t.sol` with `check_cashOutBoundaryTaxRateTable()` and
  `nana-core-v6/test/formal/BondingCurveProperties.t.sol` with `test_cashOut_boundaryTaxRateTable()`, pinning
  audit-selected bonding-curve tax-rate edges in both the CI Halmos smoke target and the existing Forge property
  suite. A broader symbolic cash-out domain was attempted and abandoned as not CI-safe after exceeding the smoke
  budget; the durable checks pin exact partial/full cash-out branch outputs for tax rates
  `{0, 1, 2500, 5000, 7500, 9999, 10000}`.
- Verification commands:
  `forge fmt --root nana-core-v6 --check`;
  `forge test --root nana-core-v6 --match-path test/formal/BondingCurveProperties.t.sol --deny notes --fail-fast --summary --detailed`;
  `forge test --root nana-core-v6 --match-path test/WeirdTokenTests.t.sol --summary --detailed`;
  `forge test --root nana-core-v6 --match-path test/TestCashOut.sol --summary --detailed`;
  `halmos --root nana-core-v6 --contract HalmosSmoke --solver-threads 1 --solver-timeout-assertion 30s --statistics`;
  `forge test --root nana-core-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`.
  Result: exit code 0 for all four; the bonding-curve property file passed 8 tests, Halmos passed 6 checks with 0
  failures in 7.97s total including `check_cashOutBoundaryTaxRateTable()`, and the full core suite passed.
- Extended `revnet-core-v6/test/TestLiquidationBehavior.t.sol` with the liquidation-duration boundary triplet. The new
  regression calls `liquidateExpiredLoansFrom(...)` at `createdAt + LOAN_LIQUIDATION_DURATION - 1`,
  `createdAt + LOAN_LIQUIDATION_DURATION`, and `createdAt + LOAN_LIQUIDATION_DURATION + 1`, proving the exact boundary
  second is still non-liquidatable while the next second burns the loan NFT and clears loan accounting.
- Extended `revnet-core-v6/test/REVLoansSourceFeeRecovery.t.sol` with a prepaid-duration source-fee boundary test. It
  documents that one second after prepaid expiry can still round to zero because the elapsed fee percent is quantized
  into `JBConstants.MAX_FEE` steps, then asserts the first calculated nonzero fee step accrues a source fee.
- Extended `revnet-core-v6/test/REVLoansSourced.t.sol` with fixed cash-out/loan parity wrappers for
  `cashOutTaxRate` values `{3999, 4000, 4001}`. The existing fuzz body is now shared through an internal helper so the
  audit-selected 4,000 / 10,000 tax-rate edge is always hit without widening the unrelated fuzz domain.
- Verification commands:
  `forge fmt --root revnet-core-v6 --check`;
  `forge test --root revnet-core-v6 --match-path test/TestLiquidationBehavior.t.sol --summary --detailed`;
  `forge test --root revnet-core-v6 --match-path test/REVLoansSourceFeeRecovery.t.sol --summary --detailed`;
  `forge test --root revnet-core-v6 --match-path test/REVLoansSourced.t.sol --summary --detailed`;
  `forge test --root revnet-core-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`.
  Result: exit code 0 for all five; `TestLiquidationBehavior` passed 5 tests,
  `REVLoansSourceFeeRecovery` passed 6 tests, `REVLoansSourced` passed 25 tests with 1 skipped, and the full revnet
  suite passed with invariants and fork-tagged tests.
- Tightened `revnet-core-v6/test/mock/MockEmptyTerminal.sol` so the router-terminal placeholder used in Revnet tests
  implements only the controller setup selector and the terminal surplus selector. Unknown selectors now revert through
  `MockEmptyTerminal_UnexpectedCall(...)`, preventing future tests from silently passing because the placeholder
  returned a zero word for an unrelated call shape.
- Verification commands:
  `forge fmt --root revnet-core-v6 --check`;
  `forge test --root revnet-core-v6 --match-path test/regression/MockEmptyTerminalStrictness.t.sol --summary --detailed`;
  `forge test --root revnet-core-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`;
  `forge build --root revnet-core-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**'`.
  Result: exit code 0 for all four; the focused strictness test passed, the full revnet suite passed, and the production
  build reported `REVDeployer` at 20,632 bytes and `REVLoans` at 22,374 bytes.
- Extended `nana-project-handles-v6/test/CodexMalformedResolver.t.sol` with direct resolver ABI-shape coverage for
  `_textRecordOf(...)`. The new regressions prove resolver reverts, offset-only returns, 63-byte short returns,
  noncanonical string offsets, and claimed string lengths that run past the returned bytes all soft-fail to `""`
  instead of reverting handle lookup. Clarified `nana-project-handles-v6/RISKS.md` that the 256-byte resolver text
  cap is an intentional liveness tradeoff for name-owner-controlled resolvers, not an unfixed unbounded-copy risk.
- Verification commands:
  `forge fmt --root nana-project-handles-v6 --check`;
  `forge test --root nana-project-handles-v6 --match-path test/CodexMalformedResolver.t.sol --summary --detailed`;
  `forge test --root nana-project-handles-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`;
  `forge build --root nana-project-handles-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**'`.
  Result: exit code 0 for all four; malformed resolver coverage passed 4 tests, the full suite passed 70 tests, and
  the production build reported `JBProjectHandles` at 5,871 bytes with 18,705 bytes of runtime margin.
- Extended `nana-project-handles-v6/test/regression/JBProjectHandlesUnicodeSpoof.t.sol` with an exact Unicode
  format-control boundary table. The new tests reject all 16 blocked codepoints (`U+061C`, `U+200B`-`U+200F`,
  `U+202A`-`U+202E`, `U+2066`-`U+2069`, and `U+FEFF`) and accept adjacent boundary codepoints so future edits cannot
  silently narrow or widen the spoofing filter.
- Verification commands:
  `forge fmt --root nana-project-handles-v6 --check`;
  `forge test --root nana-project-handles-v6 --match-path test/regression/JBProjectHandlesUnicodeSpoof.t.sol --summary --detailed`;
  `forge test --root nana-project-handles-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`;
  `forge build --root nana-project-handles-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**'`.
  Result: exit code 0 for all four; Unicode spoof coverage passed 4 tests, the full suite passed 70 tests, and
  the production build reported `JBProjectHandles` at 5,871 bytes with 18,705 bytes of runtime margin.
- Extended `nana-project-handles-v6/test/JBProjectHandles.t.sol` with a deterministic six-part verified handle
  roundtrip. The test stores `zeta.epsilon.delta.gamma.beta.alpha` in the contract's right-to-left format, mocks the
  resolver text record, and asserts `handleOf(...)` returns `alpha.beta.gamma.delta.epsilon.zeta`.
- Verification commands:
  `forge fmt --root nana-project-handles-v6 --check`;
  `forge test --root nana-project-handles-v6 --match-path test/JBProjectHandles.t.sol --match-test test_handleOf_returnsVerifiedSixPartHandle --summary --detailed`;
  `forge test --root nana-project-handles-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`;
  `forge build --root nana-project-handles-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**'`.
  Result: exit code 0 for all four; the focused six-part handle test passed, the full suite passed 70 tests, and
  the production build reported `JBProjectHandles` at 5,871 bytes with 18,705 bytes of runtime margin.
- Added `nana-distributor-v6/src/libraries/JBVestingMath.sol`, a shared helper for locked-share,
  newly-claimable, and unclaimed vesting arithmetic. `JBDistributor.claimedFor(...)`, `collectableFor(...)`, and
  `_unlockTokenIds(...)` now use the same cumulative-rounding math that the dust regressions and invariants expect.
  Library functions are ordered alphabetically per `STYLE_GUIDE`.
- Added `nana-distributor-v6/test/formal/JBVestingMathHalmos.t.sol` and `.github/workflows/halmos.yml`. The Halmos
  target proves the no-claim and partial-unlock cumulative-delta branches symbolically, and pins the final-dust and
  unclaimed-bound branches with CI-safe boundary tables after the full symbolic `mulDiv` equivalence check exceeded
  the smoke budget.
- Verification commands:
  `forge fmt --root nana-distributor-v6 --check`;
  `halmos --root nana-distributor-v6 --match-contract JBVestingMathHalmos --solver-threads 1 --solver-timeout-assertion 30s --statistics`;
  `forge test --root nana-distributor-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`;
  `forge build --root nana-distributor-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**' --skip SphinxUtils`.
  Result: exit code 0 for all four; Halmos passed 5 checks in 0.24s symbolic time, the full distributor suite passed
  with fork and invariant campaigns, and the production build reported `JB721Distributor` at 11,707 bytes and
  `JBTokenDistributor` at 8,867 bytes. PR #29 CI reports `forge-fmt`, `forge-test`, and `halmos-smoke` passing.
- Added `banny-retail-v6/test/formal/BannyResolverHalmos.t.sol`, a narrow Halmos proof target for the resolver's
  category-name table and retained-outfit membership helper. Added `.github/workflows/halmos.yml` to run it in CI.
- Verification commands:
  `forge fmt --root banny-retail-v6 --check`;
  `halmos --root banny-retail-v6 --match-contract BannyResolverHalmos --solver-threads 1 --solver-timeout-assertion 30s --statistics`;
  `forge test --root banny-retail-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`;
  `forge build --root banny-retail-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**' --skip SphinxUtils`.
  Result: exit code 0 for all four; Halmos passed 4 checks across 19 symbolic paths in 0.07s test time, the full Banny
  suite passed with the mainnet-fork harness, and the production build reported `Banny721TokenUriResolver` at 24,120
  bytes with 456 bytes of runtime margin. PR #117 CI reports both `forge-test` jobs and `halmos-smoke` passing.
- Added `defifa/test/formal/DefifaHookLibHalmos.t.sol`, a narrow Halmos proof target for
  `DefifaHookLib.computeCashOutCount(...)`. The proof pins refund phases to cumulative mint price, proves scoring and
  complete phases use weighted cumulative pot value rather than mint price, and records representative boundary-table
  cases. Added `.github/workflows/halmos.yml` for the proof target.
- Pinned `defifa/test/Fork.t.sol` to Ethereum block 21,700,000, matching the fork-test pattern already used by the
  other V6 repos. The previous unpinned latest-mainnet fork failed when the RPC returned `block not found` for a moving
  tip block.
- Verification commands:
  `forge fmt --root defifa --check`;
  `halmos --root defifa --match-contract DefifaHookLibHalmos --solver-threads 1 --solver-timeout-assertion 30s --statistics`;
  `forge test --root defifa --match-path test/Fork.t.sol --deny notes --fail-fast --summary --detailed`;
  `forge test --root defifa --deny notes --fail-fast --summary --detailed --skip '*/script/**'`;
  `forge build --root defifa --deny notes --sizes --skip '*/test/**' --skip '*/script/**' --skip SphinxUtils`.
  Result: exit code 0 for all five; Halmos passed 3 checks across 15 symbolic paths in 0.06s test time, the pinned fork
  suite passed 69 tests, the full Defifa suite passed 299 tests, and the production build reported `DefifaHook` at
  24,254 bytes with 322 bytes of runtime margin. PR #117 CI is open and pending final check completion.
- Added `revnet-core-v6/src/libraries/REVLoansSourceFees.sol` and routed
  `REVLoans._determineSourceFeeAmount(...)` through it so the production source-fee arithmetic can be proved without
  loading the full ERC-721 loan contract into Halmos. The library preserves the prepaid-window branch, the expired-loan
  revert selector, the time-based source-fee ramp, and pro-rata repayment scaling.
- Added `revnet-core-v6/test/formal/REVLoansHalmos.t.sol` and `.github/workflows/halmos.yml`. The proof target covers
  production-shaped loans and checks that prepaid-window repayments owe no source fee, loans past liquidation reject fee
  lookup before the ramp denominator is evaluated, max-prepaid loans never hit the zero-denominator ramp branch, and
  representative min/mid/max active-ramp boundary values stay pinned. Fully symbolic active-ramp equivalence and
  all-second monotonicity checks were attempted locally but were too solver-heavy for the 30-second CI budget, so they
  remain covered by Foundry/fork tests instead of the Halmos smoke target.
- Verification commands:
  `forge fmt --root revnet-core-v6 --check`;
  `halmos --root revnet-core-v6 --match-contract REVLoansHalmos --solver-threads 1 --solver-timeout-assertion 30s --statistics`;
  `forge build --root revnet-core-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**' --skip SphinxUtils`;
  `forge test --root revnet-core-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`.
  Result: exit code 0 for all four; Halmos passed 4 checks across 35 total symbolic paths in 0.28s test time, the
  production build reported `REVLoans` at 22,384 bytes with 2,192 bytes of runtime margin and `REVDeployer` at 20,632
  bytes with 3,944 bytes of runtime margin, and the full Revnet suite passed. PR #158 CI reports `forge-fmt`,
  `forge-test`, and `halmos-smoke` passing.
- Added `univ4-router-v6/test/formal/OracleHalmos.t.sol` and `.github/workflows/halmos.yml`. The proof target covers
  the production oracle library's initialization, grow/no-op/sentinel behavior, circular overwrite, same-timestamp
  write no-op, interpolation, counterfactual zero-seconds-ago observation, and predates-oldest rejection without
  modeling the full pool manager.
- Verification commands:
  `forge fmt --root univ4-router-v6 --check`;
  `halmos --root univ4-router-v6 --match-contract OracleHalmos --solver-threads 1 --solver-timeout-assertion 30s --statistics`;
  `forge test --root univ4-router-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`;
  `forge build --root univ4-router-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**' --skip SphinxUtils`.
  Result: exit code 0 for all four; Halmos passed 10 checks, the full Univ4 router suite passed with fork and invariant
  coverage, and the production build reported `JBUniswapV4Hook` at 17,000 bytes with 7,576 bytes of runtime margin.
- Added `nana-omnichain-deployers-v6/test/formal/JBOmnichainDeployerHalmos.t.sol` and `.github/workflows/halmos.yml`.
  The proof target covers local-vs-remote cash-out accounting, sucker cash-out tax bypass, locally scoped cash-outs
  avoiding remote reads, 721 deployment salt behavior, default 721 config derivation, immutable-controller validation,
  sucker mint permission, and advertised interfaces.
- Verification commands:
  `forge fmt --root nana-omnichain-deployers-v6 --check`;
  `halmos --root nana-omnichain-deployers-v6 --match-contract JBOmnichainDeployerHalmos --solver-threads 1 --solver-timeout-assertion 30s --statistics`;
  `forge test --root nana-omnichain-deployers-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`;
  `forge build --root nana-omnichain-deployers-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**' --skip SphinxUtils`.
  Result: exit code 0 for all four; Halmos passed 12 checks, the full omnichain deployer suite passed, and the
  production build reported `JBOmnichainDeployer` at 21,248 bytes with 3,328 bytes of runtime margin.
- Added `croptop-core-v6/test/formal/CroptopHalmos.t.sol` and `.github/workflows/halmos.yml`. The proof target covers
  allowance packing, duplicate/empty URI rejection, category sorting with mint-order preservation, existing-tier price
  reuse, non-sucker default cash-out passthrough, sucker local cash-out accounting, sucker mint permission, and deployer
  interface advertising.
- Verification commands:
  `forge fmt --root croptop-core-v6 --check`;
  `halmos --root croptop-core-v6 --match-contract CroptopHalmos --solver-threads 1 --solver-timeout-assertion 30s --statistics`;
  `forge test --root croptop-core-v6 --deny notes --fail-fast --summary --detailed --skip '*/script/**'`;
  `forge build --root croptop-core-v6 --deny notes --sizes --skip '*/test/**' --skip '*/script/**' --skip SphinxUtils`.
  Result: exit code 0 for all four; Halmos passed 9 checks, the full Croptop suite passed with fork coverage, and the
  production build reported `CTPublisher` at 12,585 bytes with 11,991 bytes of runtime margin and `CTDeployer` at
  12,058 bytes with 12,518 bytes of runtime margin.
- Refreshed CI after the final proof commits. `nana-univ4-router-v6` #109, `nana-omnichain-deployers-v6` #110, and
  `croptop-core-v6` #137 all report `forge-fmt`, `forge-test`, and `halmos-smoke` passing. Root `version-6` #151
  reports no checks.

Open formal gaps:

- Halmos is installed and wired for narrow core fee, permission namespace stability, address-registry CREATE derivation,
  project-handle resolver parsing, ownable ownership-state transitions, ProjectPayer tracker identity propagation, 721
  bitmap, distributor vesting math, buyback slippage, router-terminal swap math, Univ4 router oracle behavior, LP split
  helpers, omnichain deployer accounting, Croptop publisher/deployer boundaries, Banny resolver helpers, Defifa cash-out
  helper behavior, Revnet source-fee timing, sucker peer-value, and merkle helper proof suites. These are bounded
  repo-level proof lanes, not a broad composed formal-verification model for the whole ecosystem.
- Foundry invariants are bounded/randomized properties, not exhaustive proofs.
- No cross-repo symbolic model composes core terminal accounting with hooks, suckers, Revnet loans, and deployers.
- Some low-fund peripheral repos still rely on unit/fork tests plus accepted trust-boundary docs rather than dedicated
  invariant harnesses.
