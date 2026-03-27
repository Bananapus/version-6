# N E M E S I S — Raw Findings

## Scope
- Language: Solidity
- In-scope files: `script/Deploy.s.sol`
- `src/**/*.sol` files present in this repo: none
- Functions analyzed: 33

## Phase 0 — Recon

**Attack goals**
1. Ship a deployment that permanently bricks core protocol paths on one or more chains.
2. Misconfigure cross-chain infrastructure so bridging cannot execute after launch.
3. Corrupt canonical project-ID assumptions used by downstream integrations and governance operations.

**Novel code**
- `script/Deploy.s.sol` — bespoke ecosystem bootstrapper with chain-specific branching, deterministic salts, and dependency ordering.

**Value stores / deployment-critical state**
- Sucker deployers + singleton implementations
- Revnet data hook and terminal wiring
- Hard-coded project IDs 2/3/4

**Complex paths**
- Sucker deployment order: deployer → singleton → registry → future clone
- Optimism Sepolia non-Uniswap path: branch skip → revnet deployer ctor → later hook calls
- Canonical project creation: public `JBProjects` counter → helper reservation → later approvals and deployments

**Priority order**
1. Sucker deployment ordering
2. Optimism Sepolia non-Uniswap branch
3. Hard-coded project-ID assumptions

## Pass 1 — Feynman Raw Suspects
- SUSPECT: `_deploySuckers()` deploys singleton implementations before `_suckerRegistry`.
- SUSPECT: `_shouldDeployUniswapStack()` skips deployment, but later phases appear to consume `_buybackRegistry` and `_routerTerminalRegistry` regardless.
- SUSPECT: `_ensureProjectExists()` treats `count >= expectedProjectId` as ownership-equivalent.
- SUSPECT: `_deployBanny()` checks only `controllerOf(4)` before assuming project ID 4 can still be used.

## Pass 2 — State Raw Gaps
- GAP: `_suckerRegistry` is not synchronized with constructor-time singleton immutables.
- GAP: non-Uniswap branch state is not synchronized with revnet dependency consumers.
- GAP: public project counter growth is not synchronized with hard-coded expected IDs.

## Pass 3 — Targeted Feynman Re-Interrogation
- Confirmed root cause for sucker issue: clone architecture freezes constructor immutables from the singleton.
- Confirmed root cause for OP Sepolia issue: `REVDeployer` directly dereferences `BUYBACK_HOOK`, so zero-address injection is fatal.
- Confirmed root cause for project-ID issue: the helper never proves ownership, and Banny does not reserve project ID 4.

## Pass 4 — Targeted State Re-Analysis
- No additional coupled pairs surfaced beyond:
  - registry ↔ singleton immutables
  - feature-gate branch ↔ downstream dependency wiring
  - expected IDs ↔ actual owned IDs

## Raw Findings
1. HIGH — Sucker singletons bake `REGISTRY = address(0)` due deployment ordering.
2. HIGH — Optimism Sepolia non-Uniswap rollout still deploys revnets with zero buyback/router dependencies.
3. MEDIUM — Public project-ID squatting can halt deployment or shift Banny off project ID 4.

## Convergence
- Total passes: 4
- New findings in last pass: 0
- Status: Converged
