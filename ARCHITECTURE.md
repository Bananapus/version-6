# Architecture

## Purpose

The V6 EVM workspace is a treasury system with a small core and many extensions. The core protocol owns balances, token issuance, cash outs, payouts, rulesets, permissions, and project ownership. The other repos either extend those primitives, package them into products, or deploy the combined system.

This file is the ecosystem starting point. Repo-level `ARCHITECTURE.md` files explain one package in detail. This file explains which package owns which truth and where the risky seams are.

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

## Layers

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

- `nana-core-v6` should hold protocol-generic accounting and permission logic.
- Foundation repos should stay small and stable.
- Extension repos can change flows, but they should not create a second treasury ledger.
- Product repos should keep product policy at the product layer.

## System Model

### Payments

```text
payer
  -> terminal receives funds
  -> terminal store reads active ruleset and accounting context
  -> optional data hooks change economics and return post-settlement specs
  -> controller mints beneficiary tokens and accrues reserved supply
  -> optional pay hooks run after settlement
```

Key point:

- Core settlement always starts in `nana-core-v6`.
- NFT minting, buybacks, routing, and product logic enter through hooks or wrappers.

### Cash Outs

```text
holder
  -> terminal store computes reclaim inputs from surplus, supply, and ruleset state
  -> optional data hooks may alter tax rate, cash-out count, supply, or callback specs
  -> controller burns project tokens
  -> terminal pays reclaimed funds and protocol fees
  -> optional cash-out hooks run after settlement
```

Key point:

- Reclaim math, fee accounting, and token-burn semantics stay core-owned.
- Extensions can shape inputs or add effects, but they should not replace terminal accounting.

### Payouts, Splits, And Treasury Automation

```text
project owner or operator
  -> terminal consumes payout limits or surplus allowances
  -> sends value directly, to other projects, or into split hooks
  -> split hooks may accumulate, swap, route, or stage funds
```

This is where automation patterns plug in, including:

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

Key point:

- Cross-chain behavior is not part of core settlement.
- Omnichain supply and surplus matter only where wrappers or products explicitly opt in.

## Trust Boundaries

### Canonical Truth

- `nana-core-v6` is the accounting source of truth for project balances, fees, cash-out math, payout limits, surplus allowances, and project-token issuance.
- `JBProjects` ownership NFTs in `nana-core-v6` are the root authority for many higher-level repos.
- `nana-permission-ids-v6` is the shared permission namespace. Its numeric values are a compatibility surface.

### Wrappers And Adapters

- `nana-router-terminal-v6` is terminal-shaped glue, not a ledger.
- `nana-buyback-hook-v6` is a route selector and settlement wrapper, not treasury truth.
- `nana-omnichain-deployers-v6` and some product deployers are both launch wrappers and live runtime hooks.
- `nana-address-registry-v6`, `project-handles-v6`, and `nana-ownable-v6` are infrastructure pieces, not product policy layers.

### External Dependencies

- Uniswap V4 state and hook entrypoints come from `univ4-router-v6` and Uniswap.
- Cross-chain delivery assumptions come from `nana-suckers-v6` plus bridge infrastructure.
- ENS data and resolvers are upstream dependencies for `project-handles-v6`.
- Some ingress and accounting paths tolerate nonstandard ERC-20 behavior, but not all paths do.

## Ecosystem Invariants

- The core protocol owns accounting. No extension repo should create a second ledger for project treasury state.
- Rulesets are time-ordered and queued ahead of activation.
- Data hooks can change economics before settlement. Pay and cash-out hooks run after settlement.
- Reserved-token behavior, fee behavior, and permission checks are ecosystem-wide concerns.
- Project authority usually flows from `JBProjects` NFT ownership, sometimes through `nana-ownable-v6` and `JBPermissions`.
- Deterministic deployment matters. Several repos depend on stable CREATE2 salts, paired addresses, or replay-safe derivation.
- Cross-chain repos may augment supply and surplus, but only where wrapper or product semantics say so.
- Singleton or registry failures can become ecosystem failures.

## Highest-Risk Seams

- `nana-core-v6` <-> every hook repo
  Hook ordering, preview/live alignment, and which values may change before settlement.
- `nana-core-v6` <-> `nana-permission-ids-v6` <-> `nana-ownable-v6`
  Authority resolution, delegated access, and numeric permission compatibility.
- `nana-buyback-hook-v6` <-> `univ4-router-v6`
  Quote trust, oracle degradation rules, and market-vs-protocol comparison.
- `nana-suckers-v6` <-> `nana-omnichain-deployers-v6` <-> `revnet-core-v6`
  Remote supply/surplus interpretation, sucker exemptions, and bridge-safe mint and cash-out behavior.
- `deploy-all-v6` <-> every deployment-sensitive repo
  Canonical addresses, deterministic salts, rollout order, and verification assumptions.

If a bug crosses one of these seams, assume the blast radius may be larger than one repo.

## Repository Roles

| Repo | Role |
| --- | --- |
| `nana-core-v6` | Canonical accounting, routing, rulesets, projects, permissions, and hook interfaces |
| `nana-permission-ids-v6` | Shared permission constants |
| `nana-ownable-v6` | Ownership adapter that can follow project NFTs and JB permissions |
| `nana-address-registry-v6` | On-chain deployer provenance registry |
| `project-handles-v6` | Permissionless ENS handle verification |
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
- `nana-buyback-hook-v6` may add market-aware pay and cash-out routing.
- `nana-omnichain-deployers-v6` can install itself as the wrapper data hook and compose both.
- `nana-suckers-v6` provides the bridge path when projects opt into cross-chain movement.
