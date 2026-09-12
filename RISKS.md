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
- `nana-router-terminal-v6`: registry, router gateway custody, and route execution
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

## Shared Authority Matrix

| Authority | Cross-repo effect | Verification focus |
|-----------|-------------------|--------------------|
| Deployment safes and scripts | Choose singleton addresses, project IDs, peers, feeds, and terminal wiring. | Artifact parity, replay/resume checks, and post-deploy ownership review. |
| `JBPermissions` operators | Can exercise delegated project powers across composed repos. | Wildcard grants, broad deployer grants, and permission-specific wrapper checks. |
| Sucker registries and deployers | Define which bridge contracts receive privileged mint/cash-out treatment. | Allowed deployers, explicit peers, token mappings, and peer symmetry. |
| Price/feed owners | Affect surplus, borrowing, routing, cash-out, and LP calculations. | Feed address parity, staleness settings, and sequencer-gate behavior. |
| Project owners | Configure hooks, terminals, splits, rulesets, and forwarding routes. | Self-inflicted DoS paths, circular routing, and hook provenance. |

## Systemic Call Chains

### 1. Price feed -> surplus -> loans -> LP positioning

- **Chain:** `JBPrices` -> terminal and store surplus math -> `REVLoans` -> `JBUniswapV4LPSplitHook`
- **Risk:** One bad upstream price input can distort borrowing capacity, LP range placement, and payout math.
- **Ratio feeds:** `JBRatioPriceFeed` derives USDC/native and USDC/ETH conversions from the configured USD feeds. Verify both underlying feeds and the actual `JBPrices` project/default selection; a deployment record alone does not establish registration or a usable price. Missing, stale, sequencer-gated, or circular feed dependencies remain failures, not a zero-price success.

### 2. Data hook -> buyback -> V4 router -> terminal

- **Chain:** buyback or revnet data hooks -> `JBUniswapV4Hook` -> `JBMultiTerminal.pay`
- **Risk:** Weight, quote, fee, and terminal assumptions can diverge across layers.
- **Buyback generations:** Hook 1.4.0 requires a present `pay` metadata entry to contain `(amountToSwapWith, minimumSwapAmountOut, skipSplits)`. A swap below its derived TWAP floor unwinds and falls back to minting; explicit settlement minima remain binding. Resolve the project's actual hook generation because retired hooks continue serving existing projects.

### 3. Sucker registry -> omnichain deployers -> core cash-out semantics

- **Chain:** `JBSuckerRegistry` -> omnichain or revnet deployer logic -> core terminal cash-out behavior
- **Risk:** Bad registry mappings can change privileged cross-chain cash-out treatment across many projects.

### 4. Controller migration -> terminal migration -> held-fee forgiveness

- **Chain:** core controller and terminal migration surfaces
- **Risk:** Some fee paths intentionally fail open and forgive revenue rather than block project funds.

### 5. Deployment scripts -> project IDs -> cross-chain peer wiring

- **Chain:** deployer repos -> per-chain project creation order -> peers, fee references, and router references
- **Risk:** Deployment can succeed while still creating an invalid ecosystem if IDs or peers drift.

### 6. Router registry -> gateway custody -> route settlement or source refund

- **Chain:** `JBRouterTerminalRegistry.terminalOf(projectId)` -> selected gateway -> `ROUTER()` -> destination terminal. Existing project pins and historical default cohorts may still select a previous router. The new raw router is not the selectable gateway.
- **Risk:** An eligible failed fee or protocol-payer route can complete its outer transaction while the original input remains in gateway custody. A queued call is neither a settled payment nor a core-forgiven fee. Ordinary calls without the gateway's retention eligibility still revert.
- **Recovery:** Index queue, qualified failure, process, and refund events from each gateway's deployment block. Preserve the full queued call, memo, and metadata to reconstruct commitment-checked retries. Key custody by chain, gateway, source project, and token; the issued pending-call counter is not the outstanding-call count. Failed refunds leave custody pending. Qualified source refunds do not restore core `feeFreeSurplusOf`; that accepted economic tradeoff remains in the router risk register.
- **Webclient recovery:** “Payments awaiting routing” reads the complete indexed source-project inventory across the project's chains, then checks each original call commitment and retry state onchain. Indexer availability controls discovery, never transaction authority or spendable balances. Individual actions and all-pending batches use the existing reviewed, durable transaction flow in gas-bounded rounds. An attempt that remains retained still completes its transaction journal; never-submitted entries changed by another keeper must be reconciled before resuming. Submitted or ambiguous wallet/Safe actions retain their original recovery records.

## Failure Mode Matrix

| Surface | Typical failure mode | What usually happens |
|---------|----------------------|----------------------|
| fee processing in core terminals | fail-open | fee can be forgiven or returned rather than blocking the main flow |
| eligible routes through a router gateway | retained for retry | outer success may leave original-token custody pending; a `ProcessPendingCall` event confirms settlement, while a retry transaction can record another failure and remain pending; qualified finalization may refund source-project accounting |
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
- rollout capability follows executed canonical records separately on each chain; deterministic addresses, package versions, and proposals do not activate consumer migration actions
- as recorded by deploy-all commit `a6ab40c5806b52ff4cb21f9eaefe275e621796f9`, Ethereum, Optimism, Base, Arbitrum, Sepolia, Base Sepolia, and Arbitrum Sepolia have the new hook/router/gateway and ratio feed; OP Sepolia has the ratio feed only; previous and v1 records remain available for existing project selections and history
- generated SDK, clients, skills, MCP, catalog, and indexer data must preserve retired addresses and chain-specific ABIs; regenerate after execution rather than changing inline address literals
- retirement verification must check the immediately outgoing hook/router generation (`_deprecated1` for this rollout), falling back to `_deprecated` only for earlier artifact layouts; an already-retired oldest generation cannot prove the previous implementation is disallowed for new selection
- mirroring an operator batch must revalidate the target chain's deployment generation, live registry allowance, and hook/pool dependency order; failed RPC reads must not become an empty pool or a safe migration default
- receipt outcome proofs must recognize the actually used current or retired hook/router/gateway and its caller/payer path; an installed SDK's older address cannot hide a valid failure event or admit an unrelated emitter. Interpret generation-specific registration values using the effective hook generation before declaring an outcome verified

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
10. Verify the project's selected gateway/router path independently of registry defaults, and reconcile retained original-token amounts against queue, settlement, and refund events.
11. After each production execution, distribute canonical and numbered retired artifacts, regenerate all consumers, and compare chain capabilities before merging or releasing their rollout updates.

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
