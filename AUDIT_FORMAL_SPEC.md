# Audit Formal Specification Plan

Generated: 2026-05-21

Purpose: protocol-level proof-obligation plan for the Juicebox V6 EVM ecosystem. This document turns the audit goal
into named invariants and records which obligations are already backed by bounded tests/proofs and which still need a
composed machine-checkable verifier.

This is not a completion claim. It is the current formal-specification backlog.

## Scope

In scope:

- Core protocol: `nana-core-v6`
- NFT hooks and app hooks: `nana-721-hook-v6`, `nana-buyback-hook-v6`, `nana-router-terminal-v6`,
  `univ4-router-v6`, `univ4-lp-split-hook-v6`, `nana-distributor-v6`, `nana-project-payer-v6`,
  `nana-project-handles-v6`
- Cross-chain and launch systems: `nana-suckers-v6`, `nana-omnichain-deployers-v6`, `revnet-core-v6`,
  `croptop-core-v6`
- Apps: `banny-retail-v6`, `defifa`
- Deployment packages: `nana-fee-project-deployer-v6`, `deploy-all-v6`

Excluded by user direction:

- `nana-referral-split-hook-v6`
- `bendystraw-v6`
- `website`

## Status Labels

| Status | Meaning |
| --- | --- |
| `CI-proof` | A bounded Halmos or Foundry property proof is wired to CI for the named helper or local state machine. |
| `Invariant/Fork` | Stateful invariants or fork/integration tests exercise the property, but the property is not exhaustively proved. |
| `Regression` | A concrete reproducer or boundary regression pins the behavior. |
| `Spec-only` | The proof obligation is written down, but no dedicated machine-checkable artifact proves it yet. |
| `Accepted boundary` | The property depends on external trust assumptions; the protocol can only document, bound, or fail closed around it. |

## Proof Obligations

### Core Ledger

| ID | Obligation | Current evidence | Completion target |
| --- | --- | --- | --- |
| CORE-LEDGER-01 | For every terminal, project, and token, internal terminal-store claims must not exceed actual terminal backing except for explicitly modeled held-fee, bridge-bound, or pending-transfer states. | CORE-01 regressions, callback-token guard tests, core full suite, terminal/store invariants now covering two terminals plus migration. Status: `Invariant/Fork`. | Composed model over `JBMultiTerminal`, `JBTerminalStore`, token transfer callbacks, fee handling, and migrations. |
| CORE-LEDGER-02 | Accepted funds are consumed exactly once by `pay`, `addToBalanceOf`, payout, surplus allowance, cash-out, and migration flows. | Reentrancy regressions, split-hook reentry tests, migration tests, and terminal-store invariant migration action. Status: `Invariant/Fork`. | Stateful solvency invariant with all terminal entrypoints and hook callbacks in one handler. |
| CORE-LEDGER-03 | Project token supply, reserved token minting, cash-out burns, and token migration cannot diverge from controller/token accounting. | Core full suite, reserved-token self-payment guard tests, cash-out boundary table, Halmos fee/cash-out smoke. Status: `Invariant/Fork`. | Symbolic or stateful model that composes `JBController`, `JBTokens`, `JBRulesets`, `JBSplits`, and cash-out math. |
| CORE-LEDGER-04 | Ruleset timing, approval, weight cuts, metadata decoding, and fund-access-limit cycles cannot read stale or skipped state in ways that unlock funds early. | Existing core ruleset/fund-access suites and report findings CORE-04/05. Status: `Invariant/Fork`. | Dedicated ruleset/fund-access invariant harness with cycle rollover and approval-hook adversaries. |
| CORE-LEDGER-05 | Split locks are unique enough to avoid duplicate group/accounting ambiguity, and every split execution conserves assigned value. | CORE-06/07 tests, split conservation regressions. Status: `Regression`. | Cross-component split conservation invariant covering terminal payouts, reserved-token splits, 721 splits, distributor splits, and hook callbacks. |

### Hooks And Plugins

| ID | Obligation | Current evidence | Completion target |
| --- | --- | --- | --- |
| HOOK-721-01 | Tier add/remove/mint/reserve/cash-out flows preserve supply, category order, bitmap removal state, and cash-out weight. | 721 invariants, category-pointer regression, `JBBitmapHalmos`. Status: `CI-proof` for bitmap, `Invariant/Fork` for full tier lifecycle. | Full symbolic or stateful tier-store model covering add/remove/mint/cash-out together. |
| HOOK-721-02 | Pay-hook metadata, forwarded funds, and split routing cannot mint unintended tiers or lose value. | 721 split metadata tests, fork split paths, Croptop duplicate metadata guard. Status: `Regression`. | Cross-hook metadata conservation invariant shared by core terminal, 721 hook, Croptop, and ProjectPayer. |
| HOOK-DIST-01 | Distributor hook reward balances and vesting claims never exceed actual backing for ERC-20/native reward tokens. | DIST-01 through DIST-05, callback reward funding guard, `JBVestingMathHalmos`. Status: `CI-proof` for vesting math, `Invariant/Fork` for full distributor. | Stateful distributor solvency invariant with callback-capable tokens and split funding. |
| HOOK-ROUTER-01 | Router terminal and buyback hooks enforce minimum-return semantics and do not silently disable slippage protection. | Router/buyback fork suites, deploy-all router-to-multi-terminal/LP-split-pool composition, and `JBSwapLibHalmos` targets. Status: `CI-proof` for helper branches, `Invariant/Fork` for routing. | Unified router/buyback/Uniswap path invariant with adversarial route outputs and terminal fallback. |
| HOOK-ROUTER-02 | V4 oracle observations, pool deltas, and hook settlement remain internally consistent across swaps. | `OracleHalmos`, Univ4 router invariant/fork tests. Status: `CI-proof` for oracle, `Invariant/Fork` for full hook. | State model with pool-manager callback assumptions and terminal route settlement. |
| HOOK-LP-01 | LP split hook tick/range/token ordering, native wrapping, Permit2 approvals, and residual balances stay bounded after all deploy/mint/refund paths. | LP split fork/invariant suites, deploy-all router/buyback/LP-split pool composition, `JBUniswapV4LPSplitHookHalmos`. Status: `CI-proof` for helpers, `Invariant/Fork` for full hook. | Stateful hook/deployer invariant including partial mints and external PositionManager behavior as mocks. |
| HOOK-PAYER-01 | Project payer clone forwarding preserves original payer identity and never leaves residual token approvals after routing. | PAYER-01 through PAYER-04 and `JBProjectPayerHalmos`. Status: `CI-proof` for tracker identity, `Regression` for approvals. | Cross-component payer-plus-terminal invariant with fee-on-transfer and callback-capable tokens. |
| HOOK-HANDLES-01 | Project handles soft-fail malformed resolver behavior and reject spoofing/control-character inputs. | HANDLES-01 and `JBProjectHandlesHalmos`. Status: `CI-proof`. | Current bounded proof accepted for local parser; ENS registry/resolver honesty remains `Accepted boundary`. |

### Cross-Chain And Revnet

| ID | Obligation | Current evidence | Completion target |
| --- | --- | --- | --- |
| XCHAIN-SUCKER-01 | Bridge-bound value is consumed exactly once and cannot be reclaimed locally while a remote claim is live. | SUCKER-01/02, swap callback regressions, conversion invariants. Status: `Invariant/Fork`. | Stateful outbox/inbox bridge model with all sucker variants and token mappings. |
| XCHAIN-SUCKER-02 | Merkle roots, branch proofs, tree roots, and same-currency peer-value conversion are deterministic and collision-resistant under modeled inputs. | `JBSuckerLibHalmos`, merkle equivalence tests. Status: `CI-proof` for helper paths. | Broader arbitrary-count tree proof if solver budget/tooling permits. |
| XCHAIN-SUCKER-03 | Multiple suckers for the same chain pair remain separate risk lanes and cannot overwrite each other's token mapping, peer snapshot, or inbox state. | Multiple-sucker regression/fork coverage, `RecordPeerValueAggregation` same-chain freshness fuzzing, and user-confirmed design intent. Status: `Regression`. | Cross-sucker registry invariant with at least two active suckers per peer chain and token. |
| XCHAIN-DEPLOYER-01 | Omnichain deployer cash-out behavior uses remote supply/surplus only for non-sucker unscoped holders; sucker cash-outs stay local and tax-free. | `JBOmnichainDeployerHalmos`, fork/regression coverage, and the cross-chain deployer invariant's per-actor no-profit check for both users and the mocked sucker. Status: `CI-proof`. | Current bounded proof accepted for local branch behavior; composed terminal/sucker proof remains open. |
| REVNET-LOANS-01 | Loan source tokens, accounting contexts, collateral, borrow/reallocate/repay-with-new-loan, and source-fee accounting remain internally consistent. | REVNET-TERM-01, REVNET-LOAN-01, REVNET-FEE-01, `REVLoansHalmos`. Status: `CI-proof` for source-fee helper, `Invariant/Fork` for full loans. | Stateful loan lifecycle invariant with canonical multi-terminal and cross-chain snapshot mocks. |
| REVNET-OWNER-01 | Revnet owner fee forwarding and cash-out delegation preserve `msg.value`, local backing, and configured hook semantics. | Revnet owner regressions and fork suites. Status: `Regression`. | Integrated owner/deployer/loans/terminal model. |

### Apps And Deployers

| ID | Obligation | Current evidence | Completion target |
| --- | --- | --- | --- |
| APP-CROPTOP-01 | Posting policy, URI cache, category sorting, tier ID mapping, fee payment, and project NFT handoff cannot brick documented-valid publishes. | CROPTOP-01/02 and `CroptopHalmos`. Status: `CI-proof` for publisher setup branches, `Invariant/Fork` for app flow. | Stateful Croptop publish/deploy invariant with mocked 721 store and terminal. |
| APP-DEFIFA-01 | Launch, phase transition, scorecard, reserve, no-contest, refund, and weighted cash-out flows preserve game pot and payout semantics. | DEFIFA-01, pinned fork suite, `DefifaHookLibHalmos`. Status: `CI-proof` for helper, `Invariant/Fork` for game flow. | Game lifecycle invariant with randomized phase/attestation/scorecard actions. |
| APP-BANNY-01 | Resolver custody and body-transfer semantics cannot strand assets except for documented burned-token behavior. | BANNY-01/02 and `BannyResolverHalmos`. Status: `CI-proof` for resolver helpers, `Regression` for custody behavior. | Stateful resolver custody invariant if app surface expands. |
| DEPLOY-01 | Deployment scripts fail closed on dirty artifacts, stale manifests, wrong salts, wrong libraries, wrong constructor args, and configured-revnet replay drift. | DEPLOY-VERIFY-01, DEPLOYCONFIG-01, deploy-all fork rehearsals. Status: `Invariant/Fork`. | Per-chain production rehearsal evidence for every intended production chain. |
| DEPLOY-02 | Fee project deployment replays only the canonical fee-project shape and rejects project-1 squat or config drift. | FEEDEPLOY-01 and standalone fee-project guard-source synchronization regression. Status: `Regression`. | Keep replay guard synchronized with Revnet config evolution. |

## Tooling Plan

| Layer | Preferred tool | Reason |
| --- | --- | --- |
| Pure library/math helpers | Halmos | Already installed, fast for bounded symbolic helper proofs. |
| Local state machines | Foundry invariants first, then Halmos where bounded | Existing handlers cover many paths and are cheap to keep in CI. |
| Cross-contract solvency | Foundry stateful model with adversarial mocks | Easier to model token callbacks, hooks, and terminals without full mainnet state. |
| Cross-chain state | Foundry model plus fork release slices | Requires bridge/router abstractions and real deployment assumptions. |
| Rich rule specs | Certora or Scribble/Echidna if approved later | Better fit for quantified protocol-level rules, but not installed in the workspace shell. |

## Completion Criteria For The Formal Objective

The broad formal-verification objective should not be marked complete until all of the following are true:

1. Every obligation above is either `CI-proof`, `Invariant/Fork` with a documented reason formal proof is infeasible, or
   `Accepted boundary` with explicit user-facing risk documentation.
2. At least one composed model covers the core ledger path across controller, terminal, store, tokens, rulesets, splits,
   and hook callbacks.
3. At least one composed model covers cross-chain sucker/deployer cash-out and bridge-bound value semantics.
4. Release-gate commands are current and distinguish CI-safe smoke checks from slower local/fork release checks.
5. `AUDIT_SRC_MANIFEST.md` matches the current production `src/*.sol` inventory.
6. `AUDIT_REPORT_2.md` records the final command outputs and any accepted residual risks.
