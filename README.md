# Juicebox V6 EVM Workspace

This directory is the main entrypoint into the Juicebox V6 EVM ecosystem.

It is not a single Foundry package. It is a coordinated workspace of sibling repos that are developed together, versioned separately, and composed through npm packages and local `file:` dependencies. The center of gravity is [`nana-core-v6`](https://github.com/Bananapus/nana-core-v6), but most real deployments also compose hooks, routers, deployers, or product repos around it.

Use this README when you need to answer four questions quickly:

- which repo owns the behavior I care about
- what order should I read the ecosystem in
- where should I start if I am auditing, integrating, or debugging
- which directories are active workspace surfaces versus supporting material

App: <https://juicebox.money>  
Docs: <https://docs.juicebox.money>  
Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md)  
User journeys: [USER_JOURNEYS.md](./USER_JOURNEYS.md)  
Workspace navigation: [SKILLS.md](./SKILLS.md)  
Risks: [RISKS.md](./RISKS.md)  
Administration: [ADMINISTRATION.md](./ADMINISTRATION.md)  
Audit instructions: [AUDIT_INSTRUCTIONS.md](./AUDIT_INSTRUCTIONS.md)
RISKS maintenance: [RISKS_MAINTENANCE.md](./RISKS_MAINTENANCE.md)

## Workspace Scope

This workspace contains:

- active protocol and product repos at the top level
- workspace-level guidance docs
- templates under [`documentation_templates`](./documentation_templates)
- maintenance notes under [`docs`](./docs)
- archived packages under [`archive`](./archive)
- audit artifacts and local tooling

If you are tracing live behavior, start from active top-level repos, not `archive/`, templates, or old audit output.

## What This Workspace Contains

The V6 EVM surface is organized into a few recurring roles:

- core protocol repos define canonical accounting, permissions, ownership resolution, and shared registries
- hook repos modify issuance, redemption, routing, liquidity deployment, or sidecar reward behavior
- cross-chain repos move project tokens and reclaimed assets between chains
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

If you are new to Juicebox V6, start with [`nana-core-v6/README.md`](https://github.com/Bananapus/nana-core-v6/blob/main/README.md) and then move outward into the repo that changes the execution path you care about.

## High-Signal Entrypoints

If you need the shortest path into the codebase, start from these contracts and then branch into the attached extension repo. These links point to the owning repositories because the workspace-level directories are Git submodules.

- [`nana-core-v6/src/JBController.sol`](https://github.com/Bananapus/nana-core-v6/blob/main/src/JBController.sol)
- [`nana-core-v6/src/JBMultiTerminal.sol`](https://github.com/Bananapus/nana-core-v6/blob/main/src/JBMultiTerminal.sol)
- [`nana-core-v6/src/JBTerminalStore.sol`](https://github.com/Bananapus/nana-core-v6/blob/main/src/JBTerminalStore.sol)
- [`nana-721-hook-v6/src/JB721TiersHook.sol`](https://github.com/Bananapus/nana-721-hook-v6/blob/main/src/JB721TiersHook.sol)
- [`nana-buyback-hook-v6/src/JBBuybackHook.sol`](https://github.com/Bananapus/nana-buyback-hook-v6/blob/main/src/JBBuybackHook.sol)
- [`nana-router-terminal-v6/src/JBRouterTerminal.sol`](https://github.com/Bananapus/nana-router-terminal-v6/blob/main/src/JBRouterTerminal.sol)
- [`nana-suckers-v6/src/JBSucker.sol`](https://github.com/Bananapus/nana-suckers-v6/blob/main/src/JBSucker.sol)
- [`univ4-router-v6/src/JBUniswapV4Hook.sol`](https://github.com/Bananapus/nana-univ4-router-v6/blob/main/src/JBUniswapV4Hook.sol)
- [`revnet-core-v6/src/REVDeployer.sol`](https://github.com/rev-net/revnet-core-v6/blob/main/src/REVDeployer.sol)

## Reading Order

If the goal is fast orientation, use this order:

1. [`nana-core-v6`](https://github.com/Bananapus/nana-core-v6)
2. [`nana-permission-ids-v6`](https://github.com/Bananapus/nana-permission-ids-v6), [`nana-ownable-v6`](https://github.com/Bananapus/nana-ownable-v6), [`nana-address-registry-v6`](https://github.com/Bananapus/nana-address-registry-v6)
3. [`nana-721-hook-v6`](https://github.com/Bananapus/nana-721-hook-v6), [`nana-buyback-hook-v6`](https://github.com/Bananapus/nana-buyback-hook-v6), [`nana-router-terminal-v6`](https://github.com/Bananapus/nana-router-terminal-v6), [`univ4-router-v6`](https://github.com/Bananapus/nana-univ4-router-v6), [`univ4-lp-split-hook-v6`](https://github.com/Bananapus/nana-univ4-lp-split-hook-v6)
4. [`nana-suckers-v6`](https://github.com/Bananapus/nana-suckers-v6), [`nana-omnichain-deployers-v6`](https://github.com/Bananapus/nana-omnichain-deployers-v6)
5. [`nana-distributor-v6`](https://github.com/Bananapus/nana-distributor-v6), [`nana-project-handles-v6`](https://github.com/Bananapus/nana-project-handles-v6), [`nana-fee-project-deployer-v6`](https://github.com/Bananapus/nana-fee-project-deployer-v6), [`deploy-all-v6`](https://github.com/Bananapus/deploy-all-v6)
6. [`revnet-core-v6`](https://github.com/rev-net/revnet-core-v6), [`croptop-core-v6`](https://github.com/mejango/croptop-core-v6), [`banny-retail-v6`](https://github.com/mejango/banny-retail-v6), [`defifa`](https://github.com/BallKidz/defifa)

If the goal is a live-path audit, start here instead:

1. `JBController`
2. `JBMultiTerminal`
3. `JBTerminalStore`
4. the hook, router, bridge, or deployer repo attached to the target project
5. the application repo, if the project is not a plain protocol deployment

## How To Pick The Right Repo

Start from the question you are trying to answer:

- payment accounting, redemption math, rulesets, permissions, splits, terminals: `nana-core-v6`
- NFT minting tiers and collection behavior: `nana-721-hook-v6`, then the product repo
- buybacks and AMM-vs-protocol routing: `nana-buyback-hook-v6` and `univ4-router-v6`
- terminal token conversion before payment: `nana-router-terminal-v6`
- cross-chain token movement: `nana-suckers-v6`
- omnichain launch wiring: `nana-omnichain-deployers-v6`
- handles and naming: `nana-project-handles-v6`
- reward distribution outside the main terminal path: `nana-distributor-v6`
- deployment sequencing: `deploy-all-v6`

## Common Reading Mistakes

- treating a deployer repo as if it owned runtime accounting truth
- treating a router repo as if it owned downstream accounting after settlement
- reading an application repo before understanding the shared hook or core surface it composes
- assuming every top-level directory is an active protocol package
- tracing only preview logic or only execution logic when the bug is in the mismatch

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
