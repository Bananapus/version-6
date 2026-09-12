# Pending routing recovery review

Reviewed Money #83 (`a45d12c`), Revnet #44 (`d268b7bd`), and Juicescan #50 (`ace383b`), including the recovery infrastructure those changes use. Local checkout heads were Money `5952ee7`, Revnet `1d88f5f3`, and Juicescan `2d83c54`. The relevant defects remain present at those heads; some checkpoint infrastructure predates the specified merges.

## Remediation status

Both findings are fixed. All five original expected failures are now ordinary passing regression tests. The original findings below describe the pre-fix implementations and retain their original source locations for audit history.

- **Money:** normalizes signer and connector submissions into one saved `safe` state and one recovery path, migrating legacy `safe-connector` journals without losing hashes or evidence. Saved Safe recovery never re-enters proposal creation or chooses a replacement nonce. It saves receipt block/status evidence and rechecks it on resume and before completion; retains original submissions when evidence disappears; rechecks unsigned/obsolete decisions; authenticates connector proposals by exact Safe hash and full fields before applying the same obsolescence policy as signer proposals. Execution-service waits now honor aborts even during stalled fetch/body reads. Relayr hands its exact authenticated receipt objects to the project checkpoint rather than refetching a potentially different fork; re-mined original hashes can be authenticated without republishing.
- **Revnet:** revalidates terminal routing checkpoints, marks unverified results unresolved before RPC, preserves Safe proposal and execution hashes separately, and refreshes application outcomes. Revoked obsolete proposals restart tracking of their original hash. Provably unsigned keeper skips can return to review after a reorg without replaying submitted calls.
- **Juicescan:** revalidates direct, Relayr, and Safe result checkpoints; preserves transport/receipt bindings and skipped-call snapshots; authenticates connector proposal fields/nonce before obsolescence; and prevents another window's stale acknowledgement from deleting recovery after a failed verification.

The sites implement the same intended sequence—review, authenticate, submit once, save identity, reconcile live evidence—but their transaction engines are separate code. Money had split signer and connector recovery into different branches and added the obsolete-payment transition to only one. Revnet and Juicescan already used a common Safe reconciliation path. Juicescan additionally lacked full proposal/nonce authentication for connector obsolescence; that difference is now aligned with Money and Revnet too. Money now follows that same structural model: wallet transport is normalized at submission, and every saved Safe proposal uses common recovery. These fixes align the safety rules, recovery structure, and regression scenarios; they do not consolidate the apps into a shared package.

Final validation: **901 passing tests, zero expected failures** across focused and adjacent suites (Money 483 across 30 files, Revnet 71 across 4, Juicescan 347 across 16). Money/Revnet TypeScript and scoped ESLint passed. Juicescan source, transaction-inventory, and bundle checks passed. All three diffs pass whitespace checks.

Practical limits: verification establishes current canonical evidence without waiting for finalized blocks. Legacy receipts that lack sufficient binding evidence remain blocked rather than guessed. Juicescan retains revoked keeper skips as unresolved because safely reopening an earlier skipped round while preserving later submitted rounds needs an explicit recovery transition; it does not replay or falsely complete them. A prepared Safe hash is retained even after interrupted signing; recovery refers to the exact saved proposal without assuming it was published to a hosted queue. No deployment was performed.

## Implementation commits

The implementation branches are `fix/pending-routing-recovery` in each app repository:

- [Money: e2d662a](https://github.com/mejango/juicebox-money/commit/e2d662aaa90ee27537806b2f7ae908573d61fb80)
- [Revnet: a294e642](https://github.com/mejango/revnet-money/commit/a294e6426553ad5573caeffba04e49b70951d13b)
- [Juicescan: 88b1ada](https://github.com/mejango/juicescan/commit/88b1adaf288c024f0ace8525d5d9e79c47f6a748)

## Original findings

### 1. [P2] Revalidate completed checkpoints before reporting recovered batches complete

Affected paths:

- Money: `webclients/juicebox-money/src/lib/project-batch.ts:257` filters out saved `completedIds` before any receipt verification.
- Revnet: `webclients/revnet-money/src/hooks/useMultichainBatch.ts:594` skips saved `success`, `reverted`, and `skipped` states. Its result builder includes saved successful hashes without another receipt check.
- Juicescan: `webclients/juicescan/src/action-plan.js:84` reconciles saved results only in Safe mode, then starts at `nextRound`. Direct transactions also get `relayr: true` result wrappers from `runSelectedProjectCallRounds`.
- Juicescan Safe recovery: `webclients/juicescan/src/discover.js:11170` returns fully executed results immediately; line 11180 skips individual proposals already marked executed.

Reproduction: finish the first payment, persist its completion, interrupt before the second finishes, and reload after the first receipt's block has been reorganized. Let a keeper resolve the unsent second payment. Money and Revnet finish the batch without looking up the first receipt again. Revnet returns its orphaned hash as a successful result. Juicescan's direct plan ignores a supplied result reconciler and continues from the saved next round. Its Safe reconciler preserves `executedReady: 1` even when the execution lookup would now return no receipt.

This breaks recovered completion evidence without requiring corrupt storage or a dishonest indexer. It does **not** establish duplicate movement of gateway funds. Fresh receipt verification checks canonicality, but that protection is bypassed once a step has a completion checkpoint. A page refresh may later display the payment as pending again; that does not make the saved completion claim correct.

Recommended fix: retain each call's transport, exact transaction/proposal hash, receipt block identity, and application outcome; revalidate terminal checkpoints on resume and before final completion. Keep orphaned or unavailable evidence unresolved without resubmitting. Preserve Safe proposal identity separately from execution identity. Recheck keeper-based skip/obsolete decisions as well. For completed journals, define a finality policy rather than treating a single observed canonical block as irreversible.

Regressions (all first run as ordinary tests and failed at the intended assertion):

- Money `test/transactions/project-batch.test.ts`: `adversarial: rechecks a completed receipt after interruption before finishing the batch` — returned complete instead of rejecting orphaned evidence.
- Revnet `test/multichain-batch.test.tsx`: `adversarial: rechecks a completed routing receipt after reload` — returned successful recovery without checking the orphaned hash.
- Juicescan `test/action-plan.test.js`: `adversarial: revalidates a checkpointed direct round after reload` — ignored reconciliation and completed.
- Juicescan `test/selected-safe-recovery.test.js`: `adversarial: revokes a saved execution result when its receipt disappears` — retained one executed proposal instead of zero.

### 2. [P2] Allow Money Safe connector proposals to become obsolete after keeper resolution

Location: `webclients/juicebox-money/src/lib/project-batch.ts:315–337`.

Reproduction: submit a pending-payment attempt through a Safe connector and save its proposal hash. Before that proposal executes, a keeper consumes the gateway commitment. On resume there is no `ExecutionSuccess` for the original proposal. The connector execution wait either throws and returns the pending journal immediately, or returns no execution and falls through to another early return. The application's `reconcileObsoleteSafe` callback is reachable only for `kind === 'safe'`, never `safe-connector`.

The identical application obsolescence policy works for signer-prepared Safe proposals, but a connector batch remains pending and blocks the unsent remainder. Cancelling/replacing the obsolete proposal in Safe does not create an execution event for its original hash, so the suggested external action cannot release this branch. No duplicate proposal is sent in the reproduction; the defect is recovery liveness.

Recommended fix: authenticate the original connector proposal by its saved hash, Safe address, chain, destination, calldata, value, and operation; retain its nonce; then expose it to the same live commitment-based obsolescence check. Run this reconciliation even when execution lookup times out or returns no result. Record “obsolete/cancelled/replaced” separately from “executed”; an increased Safe nonce alone must not prove routing success.

Regression: Money `test/transactions/project-batch.test.ts`, `adversarial: lets a resolved connector proposal reach obsolete-Safe reconciliation`. After restoring a saved connector hash and receiving no execution, the policy callback is called zero times rather than once. The existing signer-proposal test provides the positive counterpart.

## Initial review validation and limits

The initial review added five `it.fails` reproductions and left production code unchanged. The remediation above converts all five to ordinary regressions and changes the production recovery paths.

Targeted validation: **300 passing tests and 5 expected failures across 13 files**. Commands, run from each app directory:

```sh
# Money: 81 pass, 2 expected failures
./node_modules/.bin/vitest run test/transactions/project-batch.test.ts test/data/pending-payments.test.ts test/components/pending-payments.test.tsx

# Revnet: 50 pass, 1 expected failure
./node_modules/.bin/vitest run test/multichain-batch.test.tsx test/pending-router-calls.test.ts test/pending-routing-payments.test.tsx

# Juicescan: 169 pass, 2 expected failures
./node_modules/.bin/vitest run test/action-plan.test.js test/selected-safe-recovery.test.js test/direct-batch.test.js test/pending-payments.test.js test/pending-payments-integration.test.js test/pending-payments-ui.test.js test/pending-payment-gas.test.js
```

The surrounding tests cover keeper advancement of unsigned calls, commitment/failure snapshot checks, unknown submission locks, canonical reverted attempts, exact Safe execution provenance, and authenticated obsolete proposals. No duplicate submission was demonstrated in these covered recovery paths. Cancellation/replacement must remain distinct from successful payment execution; the connector liveness finding above survives such cancellation.

These are deterministic local journal/RPC reproductions, not live-chain or browser reorg simulations. This review does not prove that arbitrary-depth future reorgs can never invalidate a completed payment, nor that every wallet/provider crash boundary is recoverable.
