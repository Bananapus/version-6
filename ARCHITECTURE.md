# Architecture

## Purpose

Juicebox V6 in this workspace is a programmable treasury ecosystem built around a small core and many composable extensions. The core protocol owns balances, token issuance, cash outs, payouts, rulesets, permissions, and project ownership. Everything else here either extends those primitives through hooks, composes them into higher-level products, or deploys and verifies the canonical multi-chain rollout.

This file is the ecosystem starting point. Repo-level `ARCHITECTURE.md` files explain how an individual package works. This file explains which package owns which truth, where the dangerous seams are, and how to navigate changes that cross repo boundaries.

## Scope

This document covers the active EVM repos in `/v6/evm`:

- `nana-core-v6`
- `nana-permission-ids-v6`
- `nana-ownable-v6`
- `nana-address-registry-v6`
- `nana-721-hook-v6`
- `nana-buyback-hook-v6`
- `nana-router-terminal-v6`
- `nana-suckers-v6`
- `nana-omnichain-deployers-v6`
- `nana-distributor-v6`
- `project-handles-v6`
- `univ4-router-v6`
- `univ4-lp-split-hook-v6`
- `revnet-core-v6`
- `croptop-core-v6`
- `banny-retail-v6`
- `defifa`
- `nana-fee-project-deployer-v6`
- `deploy-all-v6`

If a repo is not listed here, do not assume this file describes it.

## Layering

```text
deploy-all-v6
  -> deploys, resumes, and verifies the canonical rollout

nana-core-v6
  -> owns treasury accounting, rulesets, project identity, permissions, and hook interfaces

Foundation primitives
  -> nana-permission-ids-v6
  -> nana-ownable-v6
  -> nana-address-registry-v6
  -> project-handles-v6

Extension / routing / interoperability layer
  -> nana-721-hook-v6
  -> nana-buyback-hook-v6
  -> nana-router-terminal-v6
  -> nana-suckers-v6
  -> nana-omnichain-deployers-v6
  -> nana-distributor-v6
  -> univ4-router-v6
  -> univ4-lp-split-hook-v6

Product / application layer
  -> revnet-core-v6
  -> croptop-core-v6
  -> banny-retail-v6
  -> defifa
  -> nana-fee-project-deployer-v6
```

Dependency direction matters:

- `nana-core-v6` should absorb protocol-generic accounting and permission logic.
- Foundation repos should stay narrow and stable.
- Extension repos may transform flows, but should not invent competing project ledgers.
- Product repos should absorb application-specific policy instead of pushing it down into shared primitives.

## System Model

### Payments

```text
payer
  -> terminal receives funds
  -> terminal store reads active ruleset and accounting context
  -> optional data hooks modify economics and return post-settlement specs
  -> controller mints beneficiary tokens and accrues reserved supply
  -> optional pay hooks run after settlement
```

Important consequence:

- Core settlement is always rooted in `nana-core-v6`.
- NFT minting, buybacks, routing, and product-specific behavior enter through hook or wrapper surfaces.

### Cash Outs

```text
holder
  -> terminal store computes reclaim inputs from surplus, supply, and ruleset state
  -> optional data hooks may alter tax rate, cash-out count, supply, or callback specs
  -> controller burns project tokens
  -> terminal pays reclaimed funds and protocol fees
  -> optional cash-out hooks run after settlement
```

Important consequence:

- Reclaim math, fee accounting, and token burn semantics stay core-owned.
- Extensions can shape inputs or add post-settlement effects, but should not replace terminal accounting.

### Payouts, Splits, And Treasury Automation

```text
project owner or operator
  -> terminal consumes payout limits or surplus allowances
  -> sends value directly, to other projects, or into split hooks
  -> split hooks may accumulate, swap, route, or stage funds
```

This is where several automation patterns plug in:

- `univ4-lp-split-hook-v6`
- `nana-distributor-v6`
- fee routing patterns in product repos

### Cross-Chain

```text
holder
  -> exits locally through a sucker
  -> local sucker inserts a Merkle leaf and snapshots project state
  -> bridge transport moves funds and root data
  -> remote sucker verifies inclusion and releases or remints destination-side value
```

Important consequence:

- Cross-chain behavior is intentionally not part of core settlement.
- Omnichain supply and surplus only become relevant when wrappers or product repos choose to incorporate remote snapshots.

## Trust Boundaries

### Canonical Truth

- `nana-core-v6` is the accounting source of truth for project balances, fee behavior, cash-out math, payout limits, surplus allowances, and project-token issuance.
- `JBProjects` ownership NFTs in `nana-core-v6` are the ecosystem root of authority for many higher-level repos.
- `nana-permission-ids-v6` is the shared permission namespace. Its numeric values are a compatibility surface, not a convenience.

### Wrappers And Adapters

- `nana-router-terminal-v6` is a terminal-shaped adapter, not a ledger.
- `nana-buyback-hook-v6` is a route selector and settlement wrapper, not a treasury source of truth.
- `nana-omnichain-deployers-v6` and some product deployers are both launch wrappers and live runtime hooks.
- `nana-address-registry-v6`, `project-handles-v6`, and `nana-ownable-v6` are infrastructure primitives, not product policy layers.

### External Dependencies

- Uniswap V4 state and hook entrypoints come from `univ4-router-v6` and Uniswap.
- Cross-chain delivery assumptions come from `nana-suckers-v6` plus transport-specific bridge infrastructure.
- ENS data and resolvers are upstream dependencies for `project-handles-v6`.
- Nonstandard ERC-20 behavior is tolerated in selected ingress or accounting paths, but not universally.

## Ecosystem Invariants

- The core protocol owns accounting. No extension repo should create a competing ledger for project treasury state.
- Rulesets are time-ordered and queued ahead of activation. Many product behaviors are expressed as ruleset state rather than mutable admin state.
- Data hooks may modify economics before settlement; pay and cash-out hooks run after settlement. Crossing that boundary incorrectly is a recurring failure mode.
- Reserved-token behavior, fee behavior, and permission checks are ecosystem-wide concerns. Changes to them must be reviewed against `nana-core-v6`, not only in the local repo.
- Project authority usually flows from `JBProjects` NFT ownership, optionally mediated by `nana-ownable-v6` and `JBPermissions`.
- Deterministic deployment matters. Multiple repos assume stable CREATE2 salts, replay-safe derivation, or paired addresses across chains.
- Cross-chain repos may augment supply and surplus with remote state, but only where wrapper or product semantics explicitly opt into omnichain behavior.
- Singleton or registry failures are ecosystem failures. A bad shared registry, oracle surface, or deploy-time assumption can affect many repos and many projects at once.

## Highest-Risk Seams

These are the boundaries most likely to create ecosystem-wide mistakes if misunderstood:

- `nana-core-v6` <-> every hook repo
  Hook ordering, preview/live alignment, and which values are allowed to change before settlement.
- `nana-core-v6` <-> `nana-permission-ids-v6` <-> `nana-ownable-v6`
  Authority resolution, delegated access, and numeric permission compatibility.
- `nana-buyback-hook-v6` <-> `univ4-router-v6`
  Quote trust, oracle degradation rules, and market-vs-protocol route comparison.
- `nana-suckers-v6` <-> `nana-omnichain-deployers-v6` <-> `revnet-core-v6`
  Remote supply/surplus interpretation, sucker exemptions, and bridge-safe mint/cash-out behavior.
- `deploy-all-v6` <-> every deployment-sensitive repo
  Canonical addresses, deterministic salts, rollout ordering, and verification assumptions.

If a bug crosses one of these seams, assume the blast radius is larger than the local repo.

## Repository Roles

| Repo | Role |
| --- | --- |
| `nana-core-v6` | Canonical accounting, routing, rulesets, projects, permissions, and hook interfaces |
| `nana-permission-ids-v6` | Shared permission constants used across the ecosystem |
| `nana-ownable-v6` | Ownership adapter that can follow project NFTs and JB permissions |
| `nana-address-registry-v6` | On-chain deployer provenance registry |
| `project-handles-v6` | Permissionless ENS handle verification primitive |
| `nana-721-hook-v6` | Tiered NFT issuance, reserves, credits, and NFT-aware cash-out shaping |
| `nana-buyback-hook-v6` | Best-execution mint-or-swap and cash-out-or-sell routing |
| `nana-router-terminal-v6` | Accept-any-token payment router into downstream terminals |
| `nana-suckers-v6` | Cross-chain migration and claim primitives |
| `nana-omnichain-deployers-v6` | Project launcher and runtime wrapper for 721 hooks, custom hooks, and suckers |
| `nana-distributor-v6` | Round-based reward distribution for 721 or `IVotes` staking bases |
| `univ4-router-v6` | Uniswap V4 hook plus TWAP oracle surface for routing decisions |
| `univ4-lp-split-hook-v6` | Reserved-token liquidity automation and LP fee routing |
| `revnet-core-v6` | Ownerless staged project pattern with loans, hidden tokens, and hook composition |
| `croptop-core-v6` | Permissioned NFT publishing product |
| `banny-retail-v6` | Composable avatar rendering and attachment-custody system |
| `defifa` | Prediction-game product with phased rulesets, scorecard governance, and game-piece cash-out logic |
| `nana-fee-project-deployer-v6` | Deployment of the canonical protocol fee sink project |
| `deploy-all-v6` | Canonical deployment, resume, and verification orchestration |

## Common Compositions

### 721 + Routing + Omnichain

- `nana-721-hook-v6` provides tier semantics.
- `nana-buyback-hook-v6` may add market-aware pay/cash-out routing.
- `nana-omnichain-deployers-v6` installs itself as the wrapper data hook and composes both.
- `nana-suckers-v6` provides the bridge path when projects opt into cross-chain movement.

### 721 + Governance Game Logic

- `nana-721-hook-v6` provides the underlying tiered NFT machinery.
- `defifa` layers phase-aware mint, refund, scoring, ratification, and completion cash-out semantics on top.
- `nana-core-v6` still owns the project treasury and phased ruleset execution underneath the game.

### Buyback + V4 Oracle

- `univ4-router-v6` exposes the oracle and routing semantics.
- `nana-buyback-hook-v6` depends on those semantics for quote safety and route selection.
- `univ4-lp-split-hook-v6` also depends on compatible oracle behavior for bounded deployment and rebalance decisions.

### Project-Following Ownership

- `JBProjects` NFTs represent project ownership in `nana-core-v6`.
- `nana-ownable-v6` lets helper contracts follow that moving owner.
- Product repos and wrappers depend on that ownership staying dynamically resolvable and fail-closed when it cannot resolve.

### Cross-Chain Product Shapes

- `nana-suckers-v6` handles movement.
- `nana-omnichain-deployers-v6` and `revnet-core-v6` interpret remote supply and surplus in product-specific ways.
- `deploy-all-v6` and `nana-fee-project-deployer-v6` depend on canonical wiring when those paths are used in production.

## Where Complexity Lives

- `nana-core-v6`
  Accounting, fee behavior, preview/live-path alignment, permissions, and terminal-scoped ledger semantics.
- `nana-721-hook-v6`
  Tier storage, reserve semantics, credit accounting, split-adjusted mint behavior, and NFT-aware cash-out shaping.
- `nana-buyback-hook-v6` + `univ4-router-v6`
  Quote selection, conservative degrade rules, oracle assumptions, and swap settlement.
- `nana-router-terminal-v6`
  Recursive cash-out routing, bounded candidate discovery, input reconciliation, and refund correctness.
- `nana-suckers-v6` + `nana-omnichain-deployers-v6`
  Cross-chain state snapshots, out-of-order delivery tolerance, and wrapper-hook composition.
- `revnet-core-v6`
  Ownerless staged economics, omnichain-aware cash-out behavior, and treasury-backed loan math.
- `defifa`
  Three-contract game-state coordination across deployer, governor, and hook, with scorecard ratification driving final cash-out weights.
- `deploy-all-v6`
  Dependency ordering, deterministic recovery, chain-specific wiring, and verification drift risk.

## Common Failure Modes

- Treating a wrapper, registry, or router as the accounting source of truth when only `nana-core-v6` owns settlement.
- Forgetting that early hooks can change the inputs that later hooks see.
- Assuming preview helpers and live paths can diverge harmlessly. In this ecosystem, that usually becomes an accounting or routing bug.
- Changing permission IDs, owner resolution, or deploy-time assumptions in one repo without updating dependents.
- Treating local-only supply or surplus as sufficient in repos that intentionally incorporate remote sucker snapshots.
- Treating deterministic deployment or verification scripts as operational extras rather than part of the system contract.
- Treating shared registries or singleton hooks as ordinary local dependencies instead of ecosystem control points.

## Change Impact Matrix

Use this table before making changes that feel local but may not be:

| If you change... | Also review... |
| --- | --- |
| fee math, reclaim math, payout limits, allowances, token issuance | `nana-core-v6`, dependent hook repos, and any product repo that reinterprets surplus or supply |
| permission IDs or owner-resolution semantics | `nana-permission-ids-v6`, `nana-ownable-v6`, `nana-core-v6`, and deployer/product repos with delegated operators |
| hook metadata shape or hook ordering | `nana-721-hook-v6`, `nana-buyback-hook-v6`, `nana-omnichain-deployers-v6`, product wrappers, and preview tests |
| routing or oracle behavior | `univ4-router-v6`, `nana-buyback-hook-v6`, `nana-router-terminal-v6`, and LP automation repos |
| cross-chain leaf encoding, root handling, or sucker exemptions | `nana-suckers-v6`, `nana-omnichain-deployers-v6`, `revnet-core-v6`, and deployment/verification scripts |
| deterministic salts, canonical addresses, or deployment order | `deploy-all-v6`, `nana-fee-project-deployer-v6`, and any repo with deterministic deployers or paired contracts |
| product deployer ownership or runtime-wrapper assumptions | the product repo itself, `nana-ownable-v6`, and the underlying shared extension repos it composes |

## Canonical Checks

If you need executable or review-time anchors for the ecosystem claims above, start here:

- ecosystem risk chains and singleton blast radius:
  `RISKS.md`
- canonical deployment, recovery, and verification assumptions:
  `deploy-all-v6/ARCHITECTURE.md`
- core accounting, preview/live alignment, and permission semantics:
  `nana-core-v6/ARCHITECTURE.md`
- cross-chain bridging and omnichain wrapper behavior:
  `nana-suckers-v6/ARCHITECTURE.md`, `nana-omnichain-deployers-v6/ARCHITECTURE.md`
- product-level ownerless or game-state compositions:
  `revnet-core-v6/ARCHITECTURE.md`, `defifa/ARCHITECTURE.md`

## How To Change The Ecosystem Safely

1. Start in the narrowest repo that can honestly own the change.
2. If a change touches accounting, fee behavior, supply-sensitive math, or permission semantics, read `nana-core-v6` first.
3. If a change introduces or changes a permission, update `nana-permission-ids-v6` intentionally and audit downstream usage.
4. If a change composes hooks, reason about callback order, noop specs, post-split context shaping, and whether one hook changes the next hook's inputs.
5. If a change is cross-chain, verify both the local exit path and the remote claim or mint path.
6. If a change affects deterministic deployment, addresses, salts, or rollout assumptions, update `deploy-all-v6` and any deployment-specific repo together.
7. If a repo is both a deployer and a runtime wrapper, review both roles in one pass; those assumptions often drift together.
8. If the change crosses one of the seams in `Highest-Risk Seams`, widen the review immediately instead of trying to keep it local.

## Reading Order

If you are new to the ecosystem, read in this order:

1. `nana-core-v6/ARCHITECTURE.md`
2. `nana-permission-ids-v6/ARCHITECTURE.md`
3. `nana-ownable-v6/ARCHITECTURE.md`
4. The extension repo you actually need
5. Any product or deployer repo that composes that extension
6. `deploy-all-v6/ARCHITECTURE.md` for rollout and verification assumptions

Suggested paths:

- NFTs and product publishing:
  `nana-721-hook-v6` -> `croptop-core-v6` -> `banny-retail-v6`
- Game products:
  `nana-721-hook-v6` -> `defifa`
- Routing and DEX-aware flows:
  `univ4-router-v6` -> `nana-buyback-hook-v6` -> `nana-router-terminal-v6`
- Cross-chain projects:
  `nana-suckers-v6` -> `nana-omnichain-deployers-v6` -> `revnet-core-v6`

## Source Map

- `nana-core-v6/ARCHITECTURE.md`
- `deploy-all-v6/ARCHITECTURE.md`
- `nana-omnichain-deployers-v6/ARCHITECTURE.md`
- `revnet-core-v6/ARCHITECTURE.md`
- `defifa/ARCHITECTURE.md`
- `RISKS.md`
- `documentation_templates/ARCHITECTURE.md`
