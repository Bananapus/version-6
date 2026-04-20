# Juicebox V6 EVM Workspace

This directory is the main entrypoint into the Juicebox V6 EVM ecosystem.

It is not a single Foundry package. It is a coordinated workspace of sibling repos that are developed together, versioned separately, and composed through npm packages and local `file:` dependencies. The center of gravity is [`nana-core-v6`](./nana-core-v6), but most real deployments also compose hooks, routers, deployers, or product repos around it.

Use this README when you need to answer four questions quickly:

- which repo owns the behavior I care about
- what order should I read the ecosystem in
- where should I start if I am auditing, integrating, or debugging
- which directories are active workspace surfaces versus supporting or legacy material

App: <https://juicebox.money>  
Docs: <https://docs.juicebox.money>  
Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md)  
User journeys: [USER_JOURNEYS.md](./USER_JOURNEYS.md)  
Workspace navigation: [SKILLS.md](./SKILLS.md)  
Risks: [RISKS.md](./RISKS.md)  
Administration: [ADMINISTRATION.md](./ADMINISTRATION.md)  
Audit instructions: [AUDIT_INSTRUCTIONS.md](./AUDIT_INSTRUCTIONS.md)
RISKS maintenance: [docs/RISKS_MAINTENANCE.md](./docs/RISKS_MAINTENANCE.md)

## Workspace Scope

This workspace contains several different kinds of material:

- active protocol and product repos at the top level, such as [`nana-core-v6`](./nana-core-v6) and [`revnet-core-v6`](./revnet-core-v6)
- workspace-level guidance docs like [ARCHITECTURE.md](./ARCHITECTURE.md), [RISKS.md](./RISKS.md), and [AUDIT_INSTRUCTIONS.md](./AUDIT_INSTRUCTIONS.md)
- templates under [`documentation_templates`](./documentation_templates) for creating repo-local docs
- workspace maintenance notes such as [`docs/RISKS_MAINTENANCE.md`](./docs/RISKS_MAINTENANCE.md) for keeping repo docs aligned with code
- archived packages under [`archive`](./archive), which are not part of the active V6 surface unless a specific investigation sends you there
- references, audit artifacts, and local tooling that support review work but are not themselves protocol packages

If you are tracing live behavior, start from active top-level repos, not `archive/`, `documentation_templates/`, or old audit output.

## What This Workspace Contains

The V6 EVM surface is organized into a few recurring roles:

- core protocol repos define canonical accounting, permissions, ownership resolution, and shared registries
- hook repos modify issuance, redemption, routing, liquidity deployment, or sidecar reward behavior around a project
- cross-chain repos move project tokens and reclaimed assets between configured chains
- deployer repos package multi-contract compositions into launch surfaces
- application repos build opinionated products on top of the shared protocol primitives

The main reading rule is simple:

- if a repo owns accounting state or settlement semantics, read it first
- if a repo only routes, deploys, wraps, or names another repo, treat it as composition rather than protocol truth

## Start Here

| If you want to... | Read this first |
| --- | --- |
| understand the ecosystem map | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| follow cross-repo actor flows | [USER_JOURNEYS.md](./USER_JOURNEYS.md) |
| navigate quickly across repos | [SKILLS.md](./SKILLS.md) |
| review ecosystem-level risks | [RISKS.md](./RISKS.md) |
| run or structure an audit | [AUDIT_INSTRUCTIONS.md](./AUDIT_INSTRUCTIONS.md) |
| follow local documentation norms | [STYLE_GUIDE.md](./STYLE_GUIDE.md) |

If you are new to Juicebox V6, start with [`nana-core-v6/README.md`](./nana-core-v6/README.md) and then move outward into the repo that changes the execution path you care about.

## High-Signal Entrypoints

If you need the shortest high-signal path into the codebase, start from these contracts and then branch into the attached extension repo:

- [`nana-core-v6/src/JBController.sol`](./nana-core-v6/src/JBController.sol): project configuration, token issuance, and controller-led state transitions
- [`nana-core-v6/src/JBMultiTerminal.sol`](./nana-core-v6/src/JBMultiTerminal.sol): payment, cash-out, payout, and fee-facing terminal entrypoint
- [`nana-core-v6/src/JBTerminalStore.sol`](./nana-core-v6/src/JBTerminalStore.sol): reclaim math, surplus accounting, and preview-sensitive terminal state
- [`nana-721-hook-v6/src/JB721TiersHook.sol`](./nana-721-hook-v6/src/JB721TiersHook.sol): tiered NFT issuance and NFT-aware cash-out behavior
- [`nana-buyback-hook-v6/src/JBBuybackHook.sol`](./nana-buyback-hook-v6/src/JBBuybackHook.sol): protocol-vs-market route selection for pay and cash-out flows
- [`nana-router-terminal-v6/src/JBRouterTerminal.sol`](./nana-router-terminal-v6/src/JBRouterTerminal.sol): terminal-side token routing before settlement
- [`nana-suckers-v6/src/JBSucker.sol`](./nana-suckers-v6/src/JBSucker.sol): cross-chain reclaim and remint primitive
- [`univ4-router-v6/src/JBUniswapV4Hook.sol`](./univ4-router-v6/src/JBUniswapV4Hook.sol): Uniswap V4 routing and observation infrastructure for buyback flows
- [`revnet-core-v6/src/REVDeployer.sol`](./revnet-core-v6/src/REVDeployer.sol): opinionated network launch surface built from multiple shared packages

## Reading Order

If the goal is fast orientation, use this order:

1. [`nana-core-v6`](./nana-core-v6)
2. [`nana-permission-ids-v6`](./nana-permission-ids-v6), [`nana-ownable-v6`](./nana-ownable-v6), [`nana-address-registry-v6`](./nana-address-registry-v6)
3. [`nana-721-hook-v6`](./nana-721-hook-v6), [`nana-buyback-hook-v6`](./nana-buyback-hook-v6), [`nana-router-terminal-v6`](./nana-router-terminal-v6), [`univ4-router-v6`](./univ4-router-v6), [`univ4-lp-split-hook-v6`](./univ4-lp-split-hook-v6)
4. [`nana-suckers-v6`](./nana-suckers-v6), [`nana-omnichain-deployers-v6`](./nana-omnichain-deployers-v6)
5. [`nana-distributor-v6`](./nana-distributor-v6), [`project-handles-v6`](./project-handles-v6), [`nana-fee-project-deployer-v6`](./nana-fee-project-deployer-v6), [`deploy-all-v6`](./deploy-all-v6)
6. [`revnet-core-v6`](./revnet-core-v6), [`croptop-core-v6`](./croptop-core-v6), [`banny-retail-v6`](./banny-retail-v6), [`defifa`](./defifa)

If the goal is a live-path audit, start here instead:

1. [`nana-core-v6/src/JBController.sol`](./nana-core-v6/src/JBController.sol)
2. [`nana-core-v6/src/JBMultiTerminal.sol`](./nana-core-v6/src/JBMultiTerminal.sol)
3. [`nana-core-v6/src/JBTerminalStore.sol`](./nana-core-v6/src/JBTerminalStore.sol)
4. the hook, router, bridge, or deployer repo attached to the target project
5. the application repo, if the project is not a plain protocol deployment

## Repository Map

### Core Protocol

| Repo | Owns |
| --- | --- |
| [nana-core-v6](./nana-core-v6) | Projects, rulesets, controller flows, terminals, splits, prices, permissions, fund-access limits, and token accounting. |
| [nana-permission-ids-v6](./nana-permission-ids-v6) | Shared permission ID constants that downstream repos rely on. |
| [nana-ownable-v6](./nana-ownable-v6) | Ownership helpers that resolve authority from Juicebox project NFTs instead of fixed EOAs. |
| [nana-address-registry-v6](./nana-address-registry-v6) | Registry that records deployer claims for already-deployed contracts. |

### Hooks And Execution Modifiers

| Repo | Changes |
| --- | --- |
| [nana-721-hook-v6](./nana-721-hook-v6) | Tiered ERC-721 issuance and cash-out behavior for project payments and redemptions. |
| [nana-buyback-hook-v6](./nana-buyback-hook-v6) | Buy-side and sell-side path selection between Juicebox issuance economics and external Uniswap V4 liquidity. |
| [nana-router-terminal-v6](./nana-router-terminal-v6) | Terminal-side routing from many input tokens into the token a destination project actually accepts. |
| [univ4-router-v6](./univ4-router-v6) | Uniswap V4 routing and observation infrastructure used by the buyback surface. |
| [univ4-lp-split-hook-v6](./univ4-lp-split-hook-v6) | Split hook that deploys reserved-token value into a Uniswap V4 LP position. |
| [nana-distributor-v6](./nana-distributor-v6) | Distribution helpers for token- and NFT-based reward allocation that can sit beside a project's main payment flow. |
| [project-handles-v6](./project-handles-v6) | Handle storage and resolution helpers for ENS-style project naming. |

### Cross-Chain And Multi-Chain Launch

| Repo | Purpose |
| --- | --- |
| [nana-suckers-v6](./nana-suckers-v6) | Cross-chain movement of project tokens and reclaimed terminal assets across configured bridge paths. |
| [nana-omnichain-deployers-v6](./nana-omnichain-deployers-v6) | Launch surfaces that compose core projects, 721 hooks, and sucker infrastructure into multi-chain deployments. |

### Deployment And Ecosystem Composition

| Repo | Purpose |
| --- | --- |
| [nana-fee-project-deployer-v6](./nana-fee-project-deployer-v6) | Deployer package for the protocol fee project and its surrounding configuration. |
| [deploy-all-v6](./deploy-all-v6) | Chain-aware orchestration for deploying the wider V6 stack together. |

### Applications And Opinionated Products

| Repo | Product surface |
| --- | --- |
| [revnet-core-v6](./revnet-core-v6) | Treasury-backed network primitive with staged economics, cross-chain extensions, loans, and hidden tokens. |
| [croptop-core-v6](./croptop-core-v6) | Publishing and NFT-content system built on Juicebox projects and 721 hooks. |
| [banny-retail-v6](./banny-retail-v6) | On-chain avatar and outfit system built on the 721 hook stack. |
| [defifa](./defifa) | On-chain prediction game system with NFT pieces, scorecards, and pot-weighted settlement. |

## How To Pick The Right Repo

Start from the question you are trying to answer:

- payment accounting, redemption math, rulesets, permissions, splits, terminals: `nana-core-v6`
- NFT minting tiers, category pricing, pack or collection behavior: `nana-721-hook-v6`, then the product repo
- buybacks, AMM-vs-protocol routing, Uniswap V4 sell paths: `nana-buyback-hook-v6` and `univ4-router-v6`
- terminal token conversion before payment: `nana-router-terminal-v6`
- cross-chain token movement or reclaim forwarding: `nana-suckers-v6`
- omnichain launch wiring: `nana-omnichain-deployers-v6`
- named handles or ENS-backed naming: `project-handles-v6`
- reward distribution detached from the main terminal path: `nana-distributor-v6`
- ecosystem deployment sequencing: `deploy-all-v6`

## Common Reading Mistakes

These mistakes waste the most time in V6:

- treating a deployer repo as if it owned runtime accounting truth
- treating a router repo as if it owned downstream accounting after settlement
- reading an application repo before understanding the shared hook or core surface it composes
- assuming every top-level directory is an active protocol package, instead of separating active repos from `archive/`, templates, and audit artifacts
- tracing only preview logic or only execution logic when the bug sits in the mismatch between the two

Ask of each repo:

- does it own state
- does it execute settlement logic
- does it route into another repo
- does it package deployment or product behavior on top of shared primitives

## Workspace Conventions

This workspace behaves more like a coordinated multi-repo development environment than a monorepo:

- each major package directory is its own git repo
- many repos depend on sibling packages through npm metadata or local `file:` references
- most repos use Foundry for builds and tests
- many repos ship Sphinx deployment scripts for deterministic multi-chain deployment
- README files explain package boundaries, while repo-local `SKILLS.md` files are the faster operational map

Common patterns you will see repeatedly:

- `src/` owns contracts and interfaces
- `script/Deploy.s.sol` is usually the primary deployment entrypoint when a repo has deploy scripts
- `test/` tends to include adversarial, regression, fork, and invariant coverage rather than only happy-path tests
- `references/` and local architecture docs often explain intended composition or deployment envelopes

## Working Locally

There is no single command that fully bootstraps every repo in the workspace. The practical workflow is:

1. enter the repo you care about
2. install its npm dependencies if it has a `package.json`
3. build and test that repo in isolation
4. only move to `deploy-all-v6` when you need chain-aware ecosystem deployment context

Typical package workflow:

```bash
cd nana-core-v6
npm install
forge build
forge test
```

General environment expectations across the workspace:

- Node `>=20` for npm-managed repos
- Foundry installed locally
- Solidity versions pinned per repo in `foundry.toml`
- Cancun-compatible execution environment where transient storage or newer opcode behavior is required
- sibling repos present locally when a package uses local `file:` dependencies instead of published npm artifacts

## For AI Agents

When summarizing this workspace or answering codebase questions:

- treat [`nana-core-v6`](./nana-core-v6) as the main accounting and settlement surface for the workspace
- treat deployer repos as packaging surfaces unless the question is specifically about launch policy or retained admin wiring
- treat router repos as path-selection or token-conversion surfaces unless they explicitly own post-route state
- distinguish active top-level repos from `archive/`, `documentation_templates/`, audit snapshots, and third-party `lib/` code
- prefer repo-local README, `ARCHITECTURE.md`, `RISKS.md`, and `AUDIT_INSTRUCTIONS.md` together rather than any one file in isolation
- if tracing a live project, identify the exact terminal, hook, deployer, and product repo in the call path before making claims

If you are tracing a live payment path, the usual order is:

1. terminal resolution in `nana-core-v6` or `nana-router-terminal-v6`
2. ruleset and fund-access lookup in `nana-core-v6`
3. hook execution in the attached hook repo
4. post-settlement side effects in the deployer or application repo that composed the project

## What This README Does Not Cover

This file is a workspace map. It does not restate every repo's invariants, risks, or deployment assumptions. Once you know which package owns the path you care about, switch to that repo's local README and architecture docs.

## External Dependencies

The ecosystem frequently integrates with:

- OpenZeppelin
- PRBMath
- Uniswap V3 and V4
- Permit2
- Chainlink price feeds and CCIP
- Solady
- Sphinx

## License

MIT
