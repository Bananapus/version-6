# Codex QA Deployment Readiness Review

Date: 2026-03-24

This revision assumes the full test suite is green across all repos, including fork tests, per the latest user confirmation. I excluded hidden files and did not use nemesis content.

## Verdict

The v6 ecosystem is now technically near-ready for immutable deployment.

My current confidence is:

- `nana-core-v6`: 9/10
- `nana-suckers-v6`: 8.5/10
- `univ4-router-v6`: 8.5/10
- `nana-buyback-hook-v6`: 9/10
- `nana-721-hook-v6`: 8.5/10
- `revnet-core-v6`: 8.5/10
- `nana-router-terminal-v6`: 8.5/10
- `nana-omnichain-deployers-v6`: 8/10
- `croptop-core-v6`: 8/10
- `deploy-all-v6`: 9/10
- Ecosystem overall: 9/10

The technical assurance picture is now strong. The remaining risk is no longer “missing critical test coverage” in the same way it was before. The remaining risk is mostly release-integrity and operator-discipline risk.

## What Changed Since The Prior Revision

The following additions materially increased confidence and closed most of the previously open tail-risk items:

- `deploy-all-v6/script/Resume.s.sol`
  - real resumable recovery path
  - deterministic CREATE2 recovery with idempotent state checks
- `deploy-all-v6/script/Verify.s.sol`
  - real post-deploy verification path
- `deploy-all-v6/test/fork/DeployResumeRehearsalFork.t.sol`
  - phase-boundary interruption rehearsals
- `deploy-all-v6/test/fork/WBTC8DecimalFork.t.sol`
  - explicit 8-decimal full-stack path
- `deploy-all-v6/test/fork/MixedDecimalLoanComposition.t.sol`
  - explicit USDC6 loan + stage transition + buyback + migration + repayment path
- `deploy-all-v6/test/fork/CrossFeatureLifecycleFork.t.sol`
  - explicit four-way/five-way lifecycle composition path
- `deploy-all-v6/test/fork/WildcardPermissionKillChain.t.sol`
  - explicit singleton wildcard abuse-boundary proof
- `deploy-all-v6/test/fork/LongHorizonChurnFork.t.sol`
  - explicit long-horizon multi-project churn stress test over repeated rulesets
- `deploy-all-v6/test/fork/BaseChainFork.t.sol`
  - explicit non-Ethereum production-shape proof on Base, including sequencer-aware pricing and Base-specific infra

These additions directly address the biggest open concerns from the previous report.

## What The Test Suite Proves Well Now

### Strongest areas

- `nana-core-v6`
  - strongest local suite in the workspace
  - very good on fees, permit2, timing, migration, decimals, sequencer-aware feeds, weird tokens, and exploit-shape behavior
- `deploy-all-v6`
  - now a strong ecosystem assurance repo rather than only a deployment wrapper
  - covers recovery, verification assumptions, mixed decimals, high-order compositions, wildcard boundaries, long-horizon churn, and Base-specific behavior
- `revnet-core-v6`
  - strong on loans, stage transitions, fee recovery, economic edge cases, and autonomous deployment behavior
- `nana-buyback-hook-v6` and `univ4-router-v6`
  - strong on manipulation-sensitive paths, route choice, TWAP/oracle behavior, USDC6/WBTC8 decimals, and fallback behavior
- `nana-suckers-v6`
  - strong adversarial orientation with meaningful bridge-specific and claim-state coverage

### High-value proofs added recently

- `DeployResumeRehearsalFork`
  - proves resuming after multiple partial-deploy boundaries preserves deterministic addresses and expected wiring
- `WBTC8DecimalFork`
  - proves the ecosystem is not only ETH18 and USDC6
- `MixedDecimalLoanComposition`
  - proves one of the highest-risk mixed-decimal timing/composition paths directly
- `CrossFeatureLifecycleFork`
  - proves several economic subsystems interacting sequentially in one lifecycle
- `WildcardPermissionKillChain`
  - proves singleton wildcards are bounded by project ownership in the permission lookup path
- `LongHorizonChurnFork`
  - proves repeated multi-project state churn does not obviously accumulate accounting drift in the tested envelope
- `BaseChainFork`
  - proves a real non-Ethereum deployment shape with Base-specific addresses and sequencer-aware pricing

## Remaining Finding

### MEDIUM: deploy-all documentation is out of sync with the live deployment script

Relevant files:

- `deploy-all-v6/script/Deploy.s.sol`
- `deploy-all-v6/script/Resume.s.sol`
- `deploy-all-v6/script/Verify.s.sol`
- `deploy-all-v6/README.md`
- `deploy-all-v6/AUDIT_INSTRUCTIONS.md`
- `deploy-all-v6/ADMINISTRATION.md`
- `deploy-all-v6/RISKS.md`
- `deploy-all-v6/CHANGE_LOG.md`

The code has advanced further than the docs.

Observed mismatches:

- `Deploy.s.sol` now includes Phase 10 Defifa deployment.
- README still says the current script does not deploy Defifa.
- README still says the repo does not ship a resumable recovery script.
- multiple deploy-all docs still describe Defifa as out of scope or commented out.

This is not a Solidity exploit concern. It is a release-integrity concern. For an immutable rollout, stale operator docs are dangerous because they cause deployers and reviewers to authorize one scope while the script actually executes another.

What must be true before deployment:

1. Sync every deploy-all doc to the live script.
2. Publish one exact rollout manifest matching the real script and final commits.
3. Require operators to follow the updated runbook, not stale README guidance.

## Test Readout

### Coverage readout by repo

- `nana-core-v6`
  - strongest breadth in the workspace
  - remaining gap: mostly that the real deployment composes core through higher-level systems
- `nana-router-terminal-v6`
  - strong on fee-on-transfer, permit2 truncation, TWAP windows, partial fills, preview behavior, routing, sandwich-aware logic, and reentrancy
  - remaining gap: little beyond broader rollout rehearsal
- `nana-buyback-hook-v6`
  - strong on route choice, oracle failures, MEV/slippage, registry behavior, fallback behavior, USDC6, and WBTC8
  - remaining gap: little beyond final deployment discipline
- `nana-suckers-v6`
  - strong on merkle correctness, claim uniqueness, concurrent root progression, deprecation, emergency handling, and chain-specific bridge behavior
  - remaining gap: normal bridge-liveness assumptions remain external
- `nana-721-hook-v6`
  - strong on tiers, reserves, split routing, reentrancy, project deployers, and cross-currency behavior
  - remaining gap: little beyond optional extra ecosystem rehearsal
- `revnet-core-v6`
  - very strong relative to its complexity
  - improved materially by mixed-decimal composition, wildcard kill-chain, and long-horizon churn coverage
  - remaining gap: little beyond final operator rehearsal
- `deploy-all-v6`
  - now directly covers 8-decimal ecosystem paths, mixed-decimal loan composition, high-order lifecycle composition, wildcard singleton boundaries, long-horizon churn, Base-specific behavior, recovery, and verification
  - remaining gap: documentation and runbook synchronization
- `univ4-router-v6`
  - strong local manipulation and routing coverage
  - remaining gap: optional extra chain-local proof, not a current blocker

### What the newest tests assess

- `DeployResumeRehearsalFork.t.sol`
  - assesses interruption and deterministic resume safety
  - residual note: project-count drift remains an operational constraint
- `WBTC8DecimalFork.t.sol`
  - assesses 8-decimal accounting across payment, pricing, buyback, cashout, and 721 pricing
- `MixedDecimalLoanComposition.t.sol`
  - assesses USDC6 lifecycle correctness across loan creation, timing transition, hook activation, migration, and repayment
- `CrossFeatureLifecycleFork.t.sol`
  - assesses cross-currency payout conversion, NFT minting, reserved-token distribution, ruleset cycling, and cashout reconciliation in one scenario
- `WildcardPermissionKillChain.t.sol`
  - assesses whether singleton wildcard permissions can cross the ownership boundary into victim-owned projects
- `LongHorizonChurnFork.t.sol`
  - assesses repeated multi-project lifecycle churn across 10 ruleset cycles
- `BaseChainFork.t.sol`
  - assesses a real non-Ethereum production shape on Base, including PoolManager, sequencer-aware pricing, pay/cashout/payout behavior, and Base-specific infra assumptions

## Repo-by-Repo Confidence Notes

### `nana-core-v6` — 9/10

Why high:

- broad unit, fuzz, invariant, and exploit-style coverage
- many important protocol edge cases are directly represented

To reach 10/10:

- complete final ecosystem deployment rehearsal on the exact final package

### `nana-router-terminal-v6` — 8.5/10

Why improved:

- strong routing-focused local suite
- harder ecosystem compositions are now proven externally in deploy-all

To reach 10/10:

- complete final rollout rehearsal on the exact deployment package

### `nana-buyback-hook-v6` — 9/10

Why improved:

- strong local decimal and manipulation coverage
- ecosystem-level confirmation now exists for its hardest composition paths

To reach 10/10:

- complete final rollout rehearsal and manifest sync

### `univ4-router-v6` — 8.5/10

Why solid:

- strong local regression and routing/manipulation coverage

To reach 10/10:

- optional extra chain-local forks
- complete final deployment manifest sync

### `nana-suckers-v6` — 8.5/10

Why improved:

- already strong chain-specific fork coverage
- remaining trust assumptions are mostly external bridge assumptions, not local test gaps

To reach 10/10:

- complete final deployment rehearsal and operator verification flow

### `nana-721-hook-v6` — 8.5/10

Why improved:

- strong local suite
- materially better ecosystem proof now exists around cross-currency and long-lifecycle usage

To reach 10/10:

- complete final ecosystem rehearsal

### `revnet-core-v6` — 8.5/10

Why improved:

- explicit ecosystem proof now exists for mixed-decimal loan composition, wildcard boundaries, and long-horizon churn

To reach 10/10:

- complete final operator rehearsal against the exact deployment package

### `nana-omnichain-deployers-v6` and `croptop-core-v6` — 8/10 each

Why still lower:

- composition-heavy deployers depend strongly on downstream systems

To reach 10/10:

- complete final deployment rehearsal and manifest sync

### `deploy-all-v6` — 9/10

Why materially improved:

- real resume script exists
- real verification script exists
- direct fork coverage now exists for recovery, mixed decimals, high-order composition, wildcard boundaries, long-horizon churn, and Base-specific behavior
- Defifa is now actually in the deploy path

What keeps it below 10:

- the docs and runbooks still do not match the live script
- operator discipline still matters around resume/rehearsal flow

To reach 10/10:

1. sync every deploy-all doc to the live script
2. rehearse full deployment and resume on final commits
3. run `Verify.s.sol` as a required gate after rehearsal and after real deployment

## What It Takes To Reach 10/10 Confidence

An engineer should treat the following as the final pre-deploy gate:

1. Freeze a final rollout manifest:
   - exact repos
   - exact commits
   - exact chains
   - exact expected CREATE2 addresses
   - exact deployed phases and scope
2. Sync the README, audit docs, risk docs, administration docs, and runbooks to the actual script behavior.
3. Rehearse the final deployment package end-to-end:
   - normal deploy
   - interruption at a few realistic phase boundaries
   - resume using `Resume.s.sol`
   - immediate verification using `Verify.s.sol`
4. Publish a chain-by-chain deployment matrix so operators and reviewers cannot confuse “reviewed ecosystem” with “actually deployed ecosystem.”

## Final Recommendation

I now view the system as technically close enough that I would not hold deployment on remaining test-surface concerns alone.

The biggest prior QA concerns around deployment recovery, post-deploy verification, mixed-decimal ecosystem paths, high-order composition, wildcard singleton abuse boundaries, long-horizon churn, and non-Ethereum production shapes are now substantially addressed by real code and real tests.

The remaining work is mostly release-integrity work:

- sync the docs to the script
- freeze the final manifest
- rehearse the final operator flow with `Resume.s.sol` and `Verify.s.sol`

If those gates are closed, this can plausibly move from roughly 9/10 to true immutable-deployment confidence.
