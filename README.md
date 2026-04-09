# Juicebox V6

Juicebox V6 is a modular EVM protocol for programmable treasuries. This workspace contains the full contract ecosystem: core protocol, hooks, deployers, cross-chain infrastructure, applications, and deployment orchestration.

App: <https://juicebox.money>  
Docs: <https://docs.juicebox.money>
Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md)

## Overview

The V6 system is organized as a set of sibling Foundry repos that depend on each other through published npm packages and local `file:` references. At the center is [`nana-core-v6`](./nana-core-v6), which provides projects, rulesets, terminals, splits, permissions, prices, and token accounting. The rest of the ecosystem plugs into those primitives:

- hooks add NFT issuance, buybacks, LP management, routing, and privacy behavior
- deployers package common protocol compositions into one-shot entrypoints
- suckers bridge project tokens and reclaimed terminal assets across chains
- applications build complete products on top of the shared primitives

If you are reading the codebase for the first time, the dependency order is:

1. `nana-core-v6`
2. `nana-permission-ids-v6`, `nana-ownable-v6`, `nana-address-registry-v6`
3. hooks and routing packages
4. cross-chain packages
5. deployers and applications

Two framing points matter when reading V6:

- `nana-core-v6` is the accounting truth. Downstream repos may wrap, route, or condition execution, but they are not the canonical ledger.
- most of the interesting behavior in V6 comes from composition, not inheritance. The hard part is usually identifying which hook, deployer, or bridge wrapper is in the call path.

## Start Here

| If you want to... | Read this |
| --- | --- |
| navigate the ecosystem as an agent or operator | [SKILLS.md](./SKILLS.md) |
| understand the repo map | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| follow user-facing flows | [USER_JOURNEYS.md](./USER_JOURNEYS.md) |
| review protocol risks | [RISKS.md](./RISKS.md) |
| audit the codebase | [AUDIT_INSTRUCTIONS.md](./AUDIT_INSTRUCTIONS.md) |
| follow local conventions | [STYLE_GUIDE.md](./STYLE_GUIDE.md) |

## Auditor-First Reading Order

If the goal is to understand live execution quickly, start here:

1. [`nana-core-v6/README.md`](./nana-core-v6/README.md)
2. [`nana-core-v6/src/JBController.sol`](./nana-core-v6/src/JBController.sol)
3. [`nana-core-v6/src/JBMultiTerminal.sol`](./nana-core-v6/src/JBMultiTerminal.sol)
4. [`nana-core-v6/src/JBTerminalStore.sol`](./nana-core-v6/src/JBTerminalStore.sol)
5. the hook, router, bridge, or deployer repo the target project actually composes

## Repository Map

### Core

| Repo | Purpose |
| --- | --- |
| [nana-core-v6](./nana-core-v6) | Core Juicebox protocol: projects, rulesets, controller, terminals, prices, permissions, splits, and token accounting. |
| [nana-permission-ids-v6](./nana-permission-ids-v6) | Shared permission ID constants used across the entire V6 surface. |
| [nana-ownable-v6](./nana-ownable-v6) | Ownership helpers that can follow a Juicebox project NFT instead of a fixed EOA. |
| [nana-address-registry-v6](./nana-address-registry-v6) | Permissionless registry that maps deployed contracts to the deployer that created them. |

### Hooks

| Repo | Purpose |
| --- | --- |
| [nana-721-hook-v6](./nana-721-hook-v6) | Tiered ERC-721 issuance hook for Juicebox payments and cash outs. |
| [nana-buyback-hook-v6](./nana-buyback-hook-v6) | Buy-side and sell-side routing hook that compares Juicebox economics with a Uniswap V4 market. |
| [univ4-lp-split-hook-v6](./univ4-lp-split-hook-v6) | Split hook that accumulates reserved tokens and deploys them into a Uniswap V4 LP position. |
| [univ4-router-v6](./univ4-router-v6) | Uniswap V4 hook and oracle used by the buyback surface. |

The distinction between these hook repos matters:

- `nana-721-hook-v6` changes NFT issuance semantics for a project
- `nana-buyback-hook-v6` changes price selection between Juicebox and market liquidity
- `univ4-lp-split-hook-v6` changes how reserved tokens are deployed after issuance
- `univ4-router-v6` is primarily infrastructure for routing and oracle-aware swap decisions

### Terminals And Routing

| Repo | Purpose |
| --- | --- |
| [nana-router-terminal-v6](./nana-router-terminal-v6) | Terminal that accepts many input tokens and routes value into the token a destination project actually accepts. |

### Cross-Chain

| Repo | Purpose |
| --- | --- |
| [nana-suckers-v6](./nana-suckers-v6) | Cross-chain token bridging for Juicebox projects across OP Stack, Arbitrum, CCIP, and related variants. |
| [nana-omnichain-deployers-v6](./nana-omnichain-deployers-v6) | Project deployer that wires together core launch, 721 hooks, and suckers in one entrypoint. |

### Deployers And Protocol Compositions

| Repo | Purpose |
| --- | --- |
| [revnet-core-v6](./revnet-core-v6) | Autonomous treasury-backed networks with staged economics, buybacks, cross-chain support, loans, and hidden tokens. |
| [croptop-core-v6](./croptop-core-v6) | Permissioned publishing system for creating NFT content tiers on Juicebox projects. |
| [nana-fee-project-deployer-v6](./nana-fee-project-deployer-v6) | Deployment package for protocol fee project `#1`. |
| [deploy-all-v6](./deploy-all-v6) | Full-stack deployment orchestrator for the entire V6 ecosystem. |

### Applications

| Repo | Purpose |
| --- | --- |
| [banny-retail-v6](./banny-retail-v6) | Fully on-chain composable avatar and outfit system built on the 721 hook stack. |
| [defifa](./defifa) | On-chain prediction game system with NFT pieces, scorecards, and pot-weighted settlement. |

## Working Locally

All repos use Foundry. Most published packages also ship npm metadata and Sphinx deployment scripts.

```bash
git clone --recursive https://github.com/Bananapus/version-6.git
cd version-6

cd nana-core-v6
npm install
forge build
forge test
```

General expectations across the workspace:

- Node `>=20` for npm-managed repos
- Solidity `0.8.28` or repo-specific pinned versions noted in local `foundry.toml`
- Cancun EVM where transient storage or newer opcode behavior is required
- sibling repos available locally when using `file:` dependencies instead of published npm packages

The practical workflow is usually:

1. start in the repo that owns the invariant you care about
2. move outward into the hook, deployer, or application that composes it
3. use `deploy-all-v6` only when you need ecosystem-level deployment or rehearsal context

## Reading Strategy

- Use the workspace-level [SKILLS.md](./SKILLS.md) for cross-repo navigation.
- Use each repo-local `SKILLS.md` for the shortest path to the right source files, scripts, and tests.
- Treat README files as package overviews and `SKILLS.md` files as operational runbooks.

In practice:

- debugging accounting or permissions starts in `nana-core-v6`
- debugging NFT issuance starts in `nana-721-hook-v6` and then the application repo that supplies metadata or extra behavior
- debugging cross-chain behavior starts in `nana-suckers-v6` and then the deployer that wrapped it
- debugging route selection starts in `nana-router-terminal-v6` or `nana-buyback-hook-v6`, depending on whether the path is terminal-side or hook-side

If you are tracing a live payment path, the usual order is:

1. terminal selection in `nana-core-v6` or `nana-router-terminal-v6`
2. ruleset lookup in `nana-core-v6`
3. hook execution in the attached hook repo
4. post-settlement side effects in the deployer or application repo that composed the project

## Shared Conventions

- `script/Deploy.s.sol` is the canonical deployment entrypoint in most repos
- Sphinx is used for deterministic multi-chain deployments where relevant
- tests intentionally include adversarial, fork, regression, and invariant coverage rather than only happy paths
- README files are scoped to the root package only; nested `lib/` READMEs belong to third-party dependencies

Two common mistakes when reading the workspace:

- assuming a deployer repo is the source of runtime truth. Usually it is only packaging and wiring.
- assuming a routing repo owns downstream accounting. Usually it does not.

Ask of every repo: does it own state, execution, wiring, or metadata? Most confusion in V6 comes from mixing those roles up.

## External Dependencies

The ecosystem integrates with:

- OpenZeppelin
- PRBMath
- Uniswap V3 and V4
- Permit2
- Chainlink price feeds and CCIP
- Solady
- Sphinx

## License

MIT
