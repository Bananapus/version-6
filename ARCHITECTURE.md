# Architecture

## Purpose

Juicebox V6 is a programmable treasury stack. The core protocol handles balances, token issuance, cash outs, payouts, rulesets, permissions, and project ownership. Everything else in this workspace either extends those primitives through hooks, composes them into higher-level products, or deploys a canonical multi-chain rollout.

This document is the ecosystem map. Each repo-level `ARCHITECTURE.md` should answer the local question, "how does this package work and how can I change it safely?" This file answers the larger question, "how do the packages fit together?"

## Layering

```text
deploy-all-v6
  -> deploys the canonical multi-chain rollout

nana-core-v6
  -> defines treasury state transitions, permissions, project ownership, and hooks

Extension repos
  -> nana-721-hook-v6
  -> nana-buyback-hook-v6
  -> nana-router-terminal-v6
  -> nana-suckers-v6
  -> nana-omnichain-deployers-v6
  -> univ4-router-v6
  -> univ4-lp-split-hook-v6
  -> nana-ownable-v6
  -> nana-address-registry-v6
  -> nana-permission-ids-v6
  -> nana-privacy-v6

Application / product repos
  -> revnet-core-v6
  -> croptop-core-v6
  -> banny-retail-v6
  -> defifa
  -> nana-fee-project-deployer-v6
```

The dependency direction matters. `nana-core-v6` must stay generic. Product repos should absorb app-specific complexity instead of pushing it downward into shared protocol packages.

## System Model

### Payments

```text
payer
  -> terminal receives funds
  -> terminal store reads the active ruleset
  -> optional data hooks adjust the economics and return hook specs
  -> controller mints beneficiary tokens and accrues reserved tokens
  -> optional pay hooks execute post-settlement logic
```

The core protocol never hardcodes NFT tiers, DEX routing, buybacks, privacy announcements, or cross-chain behavior. Those all enter through hook surfaces.

### Cash Outs

```text
holder
  -> terminal store computes reclaim amount from surplus, supply, and ruleset state
  -> optional data hooks adjust tax rate, count, supply, or callbacks
  -> controller burns tokens
  -> terminal pays reclaimed funds and protocol fees
  -> optional cash-out hooks execute follow-on logic
```

### Payouts And Splits

```text
project owner or operator
  -> terminal spends payout allowance
  -> direct transfers, project-to-project payments, or split hooks run
```

This is how the LP split hook, fee routing, and many "treasury-owned automation" patterns integrate.

### Cross-Chain

```text
holder
  -> cashes out locally into terminal tokens through a sucker
  -> local sucker inserts a merkle leaf
  -> bridge-specific transport moves funds and the latest root
  -> remote sucker verifies the proof and remints value on the destination chain
```

Cross-chain support is deliberately implemented outside the core so the core remains chain-local and easier to reason about.

## Cross-Repo Seams

### Stable Seams

- `nana-core-v6` interfaces and storage expectations are the ecosystem's main compatibility surface.
- `nana-permission-ids-v6` assigns shared permission IDs. Reordering or repurposing IDs is ecosystem-breaking.
- Hook repos rely on `IJBRulesetDataHook`, `IJBPayHook`, `IJBCashOutHook`, and `IJBSplitHook` semantics staying stable.
- Product repos rely on deployer wrappers preserving Juicebox behavior while composing extra policies.

### Common Compositions

- `nana-721-hook-v6` plus `nana-buyback-hook-v6` can be composed through `nana-omnichain-deployers-v6`.
- `univ4-router-v6` provides oracle and routing behavior that `nana-buyback-hook-v6` and `univ4-lp-split-hook-v6` depend on.
- `nana-suckers-v6` and `nana-router-terminal-v6` are common building blocks for revnets and fee-project deployments.
- `nana-ownable-v6` lets helper contracts follow project NFT ownership instead of a static EOA.

## Ecosystem Invariants

- Project ownership is represented by `JBProjects` NFTs, and many higher-level contracts derive authority from that fact.
- Rulesets are time-ordered and queued ahead of activation. Most product behavior is expressed as ruleset configuration, not mutable admin state.
- The core protocol owns accounting. Extension repos may redirect or transform flows, but they should not invent parallel balance ledgers for project funds.
- Data hooks may modify economics before settlement; pay and cash-out hooks run after settlement. Crossing that boundary incorrectly usually creates accounting bugs.
- Reserved-token behavior, fee behavior, and permission checks are cross-cutting concerns. Any repo that changes them must be read against the core contracts, not in isolation.
- Deterministic deployment matters. Multiple repos assume stable addresses across chains and CREATE2-based recovery or pairing.

## Repository Roles

| Repo | Role |
| --- | --- |
| `nana-core-v6` | Canonical accounting, routing, governance, and permission layer |
| `nana-permission-ids-v6` | Shared permission constants used across the ecosystem |
| `nana-ownable-v6` | Ownership adapter that follows project NFTs and JB permissions |
| `nana-address-registry-v6` | On-chain deployer attestation registry |
| `nana-721-hook-v6` | Tiered NFT minting and NFT-based cash-out economics |
| `nana-buyback-hook-v6` | Best-execution mint-or-swap and cash-out-or-sell routing |
| `nana-router-terminal-v6` | Accept-any-token payment router |
| `nana-suckers-v6` | Cross-chain token migration primitives |
| `nana-omnichain-deployers-v6` | Project launcher that composes 721 hooks, custom hooks, and suckers |
| `univ4-router-v6` | Uniswap V4 hook plus TWAP oracle used by other repos |
| `univ4-lp-split-hook-v6` | Reserved-token liquidity automation |
| `revnet-core-v6` | Autonomous, ownerless project pattern with stage-based economics, loans, and temporary token hiding |
| `croptop-core-v6` | Permissioned NFT publishing product |
| `banny-retail-v6` | On-chain composable avatar metadata system |
| `defifa` | Prediction-game product built on tiered NFTs and governance |
| `nana-fee-project-deployer-v6` | Deployment of the protocol's fee beneficiary project |
| `deploy-all-v6` | Canonical deployment orchestration for the entire stack |
| `nana-privacy-v6` | Optional privacy components layered on top of existing payment flows |

## Where Complexity Lives

- `nana-core-v6`: accounting, fee, supply, and preview/live-path alignment
- `nana-721-hook-v6`: tier storage, reserve semantics, and NFT-aware cash-out behavior
- `nana-buyback-hook-v6` plus `univ4-router-v6`: route selection, oracle assumptions, and swap settlement
- `nana-suckers-v6` plus `nana-omnichain-deployers-v6`: cross-chain state transitions and wrapper-hook composition
- `revnet-core-v6`: permanent staged economics and loan math under adversarial treasury conditions
- `deploy-all-v6`: deployment ordering, chain-specific wiring, and resumable recovery

## How To Change The Ecosystem Safely

1. Start from the narrowest repo that can own the change.
2. If a change touches settlement, fee accounting, supply, or permission semantics, read `nana-core-v6` first.
3. If a change introduces a new operator permission, update `nana-permission-ids-v6` intentionally and audit every downstream assumption.
4. If a change affects deployment order or canonical addresses, update `deploy-all-v6` and any deployment-specific repos together.
5. If a change composes multiple hooks, reason about callback order, noop specs, and whether the earlier hook changes the inputs to the later one.
6. If a change is cross-chain, verify both the local accounting path and the remote claim path.

## Reading Order

If you are new to the codebase, read in this order:

1. `nana-core-v6/ARCHITECTURE.md`
2. `nana-permission-ids-v6/ARCHITECTURE.md`
3. The extension repo you care about
4. Any deployer or product repo that composes that extension
5. `deploy-all-v6/ARCHITECTURE.md` for canonical rollout assumptions
