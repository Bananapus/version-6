# Juicebox V6 EVM Ecosystem Risk Register

Cross-repo risks that only show up when the V6 EVM repos are composed into a live system. Repo-specific risks live in each subrepo's `RISKS.md`.

For architecture, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Scope

This file covers:

- shared singletons, registries, and deployment authorities
- cross-repo call chains where one subsystem's output becomes another's security assumption
- multi-chain deployment and configuration drift
- ecosystem invariants that should be monitored across repos

It does not replace per-repo `RISKS.md` files.

## Ecosystem Map

Primary repos and roles:

- `nana-core-v6`: controller, directory, terminal, store, permissions, prices, and accounting primitives
- `nana-buyback-hook-v6`: buyback-vs-mint routing
- `univ4-router-v6`: shared Uniswap V4 routing and oracle hook
- `univ4-lp-split-hook-v6`: LP deployment and liquidity management
- `revnet-core-v6`: revnet deployer, owner logic, loans, fee handling, and hook composition
- `nana-suckers-v6`: cross-chain bridge and registry surfaces
- `nana-omnichain-deployers-v6`: omnichain deployer logic
- `nana-router-terminal-v6`: router terminal and registry
- `nana-721-hook-v6`, `croptop-core-v6`, `banny-retail-v6`, `defifa`: NFT and app-layer compositions
- deployment repos: operational authority, deployment ordering, recovery, and artifact truth

## How To Use This File

1. Start with `Priority risks`.
2. Follow the corresponding section in `Systemic call chains`.
3. Then open the referenced repo-level `RISKS.md` files.
4. Treat `Ecosystem invariants` as the cross-repo checks that should be tested or monitored continuously.

## Priority Risks

| Priority | Risk | Why it matters | Primary controls |
|----------|------|----------------|------------------|
| P0 | Shared singleton, registry, or deploy-authority compromise | A fault in a shared hook, registry, price service, store, or deployment safe can affect many repos and many projects at once. | Highest-scrutiny review for shared components, artifact verification, and post-deploy permission audits. |
| P0 | Cross-chain configuration drift | Project IDs, sucker peers, chain capability assumptions, or feed configs can diverge silently and break omnichain behavior long after deployment succeeds. | Capability-aware deploy scripts, resume-safe recovery, per-chain verification, and parity checks. |
| P1 | Cross-boundary pricing errors | Price feeds and surplus math propagate into loans, LP positioning, routing, and payout decisions. | Feed health checks, preview discipline, and parity monitoring. |
| P1 | Permission concentration | Wildcard grants, singleton-owned permissions, and hardcoded bypass operators create ecosystem-wide blast radius if one privileged contract is wrong. | Minimize broad grants and verify them after deployment or migration. |
| P1 | Fail-open vs fail-closed mismatch | Different subsystems degrade in different ways. Overgeneralizing those behaviors causes bad operational assumptions. | Operator-grade docs and per-path monitoring. |

## Shared Trust Boundaries

- deployment safes and artifact truth
- `JBPrices` and feed configuration
- shared singleton hooks and stores
- directory, controller, and terminal provenance
- registry-level identity surfaces

## Systemic Call Chains

### 1. Price feed -> surplus -> loans -> LP positioning

- **Chain:** `JBPrices` -> terminal and store surplus math -> `REVLoans` -> `JBUniswapV4LPSplitHook`
- **Risk:** One bad upstream price input can distort borrowing capacity, LP range placement, and payout math.

### 2. Data hook -> buyback -> V4 router -> terminal

- **Chain:** buyback or revnet data hooks -> `JBUniswapV4Hook` -> `JBMultiTerminal.pay`
- **Risk:** Weight, quote, fee, and terminal assumptions can diverge across layers.

### 3. Sucker registry -> omnichain deployers -> core cash-out semantics

- **Chain:** `JBSuckerRegistry` -> omnichain or revnet deployer logic -> core terminal cash-out behavior
- **Risk:** Bad registry mappings can change privileged cross-chain cash-out treatment across many projects.

### 4. Controller migration -> terminal migration -> held-fee forgiveness

- **Chain:** core controller and terminal migration surfaces
- **Risk:** Some fee paths intentionally fail open and forgive revenue rather than block project funds.

### 5. Deployment scripts -> project IDs -> cross-chain peer wiring

- **Chain:** deployer repos -> per-chain project creation order -> peers, fee references, and router references
- **Risk:** Deployment can succeed while still creating an invalid ecosystem if IDs or peers drift.

## Failure Mode Matrix

| Surface | Typical failure mode | What usually happens |
|---------|----------------------|----------------------|
| fee processing in core terminals | fail-open | fee can be forgiven or returned rather than blocking the main flow |
| buyback routing | mixed, often fail-open | some failures fall back to direct minting |
| mature TWAP observation in `JBUniswapV4Hook` | fail-closed | swap can revert when the oracle surface is unsafe |
| revnet debt aggregation with zero-price feeds | best-effort / under-reporting | affected source can be skipped |
| sucker registry aggregate views | best-effort / under-reporting | reverting peers can be skipped |
| terminal and controller provenance checks | fail-closed | unrecognized provenance usually reverts or makes a route ineligible |

## Cross-Chain Consistency Requirements

- capability-aware parity
- project ID alignment
- sucker peer symmetry
- feed configuration parity

## Post-Deploy Verification Checklist

1. Verify canonical singleton addresses in deployment artifacts.
2. Verify expected project IDs on each chain.
3. Verify controller and primary terminal provenance.
4. Verify wildcard grants and bypass operators.
5. Verify buyback pool registration and pool initialization state.
6. Verify sucker peer symmetry and token mappings.
7. Verify price feed addresses and currency mappings.
8. Verify router and deployer references used by downstream repos.
9. Verify that monitoring distinguishes fail-open paths from fail-closed paths.

## Ecosystem Invariants

- no generic graceful-degradation assumption
- cross-chain supply conservation for sucker-managed projects
- no cross-project balance corruption
- deployment artifact coherence
- shared-singleton liveness is path-specific

## Currency System Clarification

**Currency Type Distinction:** The protocol uses two distinct currency domains:

1. **baseCurrency** (conceptual, in ruleset metadata): Small integer IDs representing pricing denominators. `1 = ETH`, `2 = USD`. Used in ruleset configuration to define the base currency for weight calculations and price conversions.

2. **Terminal accounting currency** (operational): `uint32(uint160(tokenAddress))` — derived from the token's contract address. Used in `JBAccountingContext`, fund access limits, and terminal operations.

These are bridged by identity price feeds registered in `JBPrices`. A `baseCurrency` of `1` (ETH) is correctly resolved to the native token's accounting currency via the price feed system. Integrators should not confuse these two systems — using a token address where a conceptual currency ID is expected (or vice versa) will cause price feed lookups to fail.
