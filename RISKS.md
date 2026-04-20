# Juicebox V6 EVM Ecosystem Risk Register

Cross-repo risks that emerge only when the V6 EVM repos are composed into a live system. Repo-specific risks live in each subrepo's `RISKS.md`; this file is the generic starting point for crawlers, auditors, and engineers who need the ecosystem-wide threat model first.

For architecture, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Scope

This file covers:

- shared singletons, registries, and deployment authorities
- cross-repo call chains where one subsystem's output becomes another's security assumption
- multi-chain deployment and configuration drift
- ecosystem invariants that should be monitored across repos

This file does not replace per-repo `RISKS.md` files. Use it to identify which repo-specific files matter for the path you are reviewing.

## Ecosystem Map

Primary repos and roles:

- `nana-core-v6`: controller, directory, terminal, store, permissions, prices, and accounting primitives
- `nana-buyback-hook-v6`: buyback-vs-mint routing for project token issuance
- `univ4-router-v6`: shared Uniswap V4 routing/oracle hook used by buyback and V4-integrated flows
- `univ4-lp-split-hook-v6`: LP deployment and liquidity management driven by project cash-out economics
- `revnet-core-v6`: revnet deployer, owner logic, loans, hidden tokens, fee handling
- `nana-suckers-v6`: cross-chain bridge/sucker registry and peer accounting surfaces
- `nana-omnichain-deployers-v6`: omnichain deployer logic with sucker-aware cash-out behavior
- `nana-router-terminal-v6`: router terminal and registry used to forward value across terminal boundaries
- `nana-721-hook-v6`, `croptop-core-v6`, `banny-retail-v6`, `defifa`: NFT and app-layer compositions built on the shared core/store stack
- `deploy-all-v6` and deployment repos: operational authority, deployment ordering, resume/recovery, and artifact truth

## How To Use This File

1. Start with `Priority risks`.
2. For any chain of interest, follow the corresponding section in `Systemic call chains`.
3. Then open the referenced repo-level `RISKS.md` files for the exact contracts on that path.
4. Treat `Ecosystem invariants` as the cross-repo checks that should be continuously tested or monitored.

## Priority Risks

| Priority | Risk | Why it matters | Primary controls |
|----------|------|----------------|------------------|
| P0 | Shared singleton, registry, or deploy-authority compromise | A fault in a shared hook, registry, price service, store, or deployment safe can affect many repos and many projects at once. | Highest-scrutiny review for shared components, deployment artifact verification, and post-deploy permission audits. |
| P0 | Cross-chain configuration drift | Project IDs, sucker peers, chain capability assumptions, or feed configs can diverge silently and break omnichain behavior long after deployment succeeds. | Capability-aware deploy scripts, resume-safe recovery, per-chain verification, and explicit parity checks. |
| P1 | Cross-boundary pricing errors | Price feeds and surplus math propagate into loans, LP positioning, routing, and payout decisions. A bad upstream input can misprice several surfaces simultaneously. | Chainlink staleness/sequencer checks, repo-level preview discipline, and monitoring for feed health and config parity. |
| P1 | Permission concentration | Wildcard grants, singleton-owned permissions, and hardcoded bypass operators create ecosystem-wide blast radius if one privileged contract is wrong. | Minimize broad grants, document every wildcard surface, and verify grants after each deployment or migration. |
| P1 | Fail-open vs fail-closed mismatch | Different subsystems degrade in different ways: some forgive fees or fall back to minting, others hard-revert to avoid unsafe routing. Overgeneralizing these behaviors causes bad operational assumptions. | Operator-grade docs, explicit per-path monitoring, and no generic assumption that “the protocol always degrades gracefully.” |

## Shared Trust Boundaries

- **Deployment safes and artifact truth.** The deployment toolchain and its safes define which singleton addresses, registries, hooks, and project IDs become canonical. A wrong deployment artifact can miswire multiple repos at once.
- **`JBPrices` and feed configuration.** Cross-currency behavior across core, revnets, LP hooks, and router quotes depends on price-feed correctness and per-chain configuration parity.
- **Shared singleton hooks and stores.** `JBUniswapV4Hook`, `JBBuybackHookRegistry`, `JB721TiersHookStore`, and `JBSuckerRegistry` are reused widely enough that their failure modes are correlated ecosystem risks.
- **Directory/controller/terminal provenance.** Many flows treat `JBDirectory` and terminal registration as the truth source for where value should be routed. Misregistration can cause hard reverts, silent ineligibility, or misdirected funds depending on the path.
- **Registry-level identity.** Sucker identity, project ownership abstractions, address registry records, and handle metadata are coordination surfaces. They are not all hard safety primitives, but downstream systems may treat them as such unless the distinction is stated explicitly.

## Shared Authority Matrix

Use this table to separate hard safety-critical authorities from softer coordination or provenance surfaces.

| Authority / component | Typical power | Scope | Safety class | Primary repo docs |
|-----------------------|---------------|-------|--------------|-------------------|
| deployment safes / deploy artifacts | choose canonical singleton addresses, registries, and project IDs | ecosystem-wide | hard safety | `deploy-all-v6`, deployment repos |
| `JBDirectory` / controller-terminal registration | define valid controller and terminal provenance | ecosystem-wide primitive | hard safety | `nana-core-v6`, `nana-router-terminal-v6` |
| `JBPrices` and feed configs | define cross-currency conversion inputs | ecosystem-wide primitive | hard safety | `nana-core-v6` |
| `JBUniswapV4Hook` | route swaps, maintain oracle observations, enforce hook slippage semantics | all hooked V4 pools | hard safety/economic | `univ4-router-v6` |
| `JBBuybackHookRegistry` / pool registration | choose buyback pool routing targets | deployer-wide / project-family-wide | hard safety/economic | `nana-buyback-hook-v6`, `revnet-core-v6` |
| `JBSuckerRegistry` | define recognized sucker peers and token mappings | cross-chain project families | hard safety/economic | `nana-suckers-v6`, `nana-omnichain-deployers-v6`, `revnet-core-v6` |
| `JB721TiersHookStore` | store tier balances, reserves, and tier state for many NFT systems | shared NFT stack | hard safety | `nana-721-hook-v6` and app-layer repos |
| `OMNICHAIN_RULESET_OPERATOR` and wildcard authorities | queue rulesets or perform privileged actions for many projects | ecosystem-scale / project-family-scale | hard safety | `nana-core-v6`, deployer repos |
| address/handle/provenance registries | label, map, or coordinate identities | ecosystem coordination | coordination/provenance | `nana-address-registry-v6`, `project-handles-v6`, `nana-permission-ids-v6` |

## Systemic Call Chains

These risks emerge from composing multiple repos, not from any single contract alone.

### 1. Price feed -> surplus -> loans -> LP positioning

- **Chain:** `JBPrices` (`nana-core-v6`) -> terminal/store surplus math (`nana-core-v6`) -> `REVLoans` (`revnet-core-v6`) -> `JBUniswapV4LPSplitHook` (`univ4-lp-split-hook-v6`)
- **Risk:** A stale or manipulated price feed can distort surplus calculations, which then distort collateral valuation for loans and tick/range logic for LP positioning. One bad upstream input can therefore affect borrowing capacity, LP range placement, and cross-currency payout math at the same time.
- **Important nuance:** `REVLoans._totalBorrowedFrom` intentionally skips sources whose conversion feed returns `0` to avoid bricking all loans. That is a fail-open understatement of debt, not a proof that the overall path is safe.
- **Blast radius:** Any project using cross-currency accounting together with revnet loans, LP split hooks, or other surplus-derived routing.

### 2. Data hook -> buyback -> V4 router -> terminal

- **Chain:** data-hook composition in `revnet-core-v6` and/or `nana-buyback-hook-v6` -> `JBUniswapV4Hook` (`univ4-router-v6`) -> `JBMultiTerminal.pay` (`nana-core-v6`)
- **Risk:** The payment context is transformed across several layers before settlement. Weight, quote, fee, and terminal assumptions can diverge if any layer changes semantics without the others updating.
- **Important nuance:** Not every failure here is fail-open. Some buyback/router issues fall back to minting, but the mature TWAP observation path in `JBUniswapV4Hook` is intentionally fail-closed and can still revert swaps when the oracle surface is considered unsafe.
- **Blast radius:** Any project whose mint-vs-swap decision depends on the shared buyback/V4 path.

### 3. Sucker registry -> omnichain deployers -> revnets/core cash-out semantics

- **Chain:** `JBSuckerRegistry` (`nana-suckers-v6`) -> omnichain/revnet deployer logic (`nana-omnichain-deployers-v6`, `revnet-core-v6`) -> cash-out behavior in core terminals (`nana-core-v6`)
- **Risk:** Sucker identity is used to grant privileged cash-out treatment such as 0% tax paths or cross-chain-aware supply/surplus handling. A bad registry mapping can therefore change reclaim semantics across multiple project families.
- **Important nuance:** Some registry-wide aggregate views are best-effort lower bounds because reverting peers are skipped. Operators must not mistake those views for exact cross-chain reconciliation.
- **Blast radius:** All projects using sucker-aware deployers or registry-derived cross-chain accounting.

### 4. Controller migration -> terminal migration -> held-fee forgiveness

- **Chain:** controller migration in `nana-core-v6` -> terminal migration in `nana-core-v6` / `nana-router-terminal-v6`
- **Risk:** Balances can migrate while held-fee accounting remains tied to the old fee-processing surface. This can intentionally forgive protocol fees rather than preserve a strict “fees must always eventually collect” invariant.
- **Important nuance:** This is a designed fail-open behavior in some fee paths. It reduces lock risk for project funds, but it also means protocol revenue is not a strict monotonic guarantee at the per-project level.

### 5. Deployment scripts -> project IDs -> cross-chain peer wiring

- **Chain:** `deploy-all-v6` and deployer repos -> per-chain project creation order -> sucker peers, auto-issuance targets, fee project references, router references
- **Risk:** Cross-chain logic assumes certain projects, peers, and singleton addresses line up. A deployment can succeed while still creating an invalid ecosystem if IDs, optional subsystems, or resume steps drift across chains.
- **Important nuance:** Not every chain is expected to host every project flavor. For example, deployments can intentionally omit REV/BAN-style components on chains without the required Uniswap/V4 stack. Verification must therefore be capability-aware, not based on naive “projects 1-4 exist everywhere” assumptions.
- **Relevant repo docs:** [`deploy-all-v6/RISKS.md`](./deploy-all-v6/RISKS.md), [`nana-fee-project-deployer-v6/RISKS.md`](./nana-fee-project-deployer-v6/RISKS.md), [`revnet-core-v6/RISKS.md`](./revnet-core-v6/RISKS.md), [`nana-suckers-v6/RISKS.md`](./nana-suckers-v6/RISKS.md)

## Shared Singleton And Registry Risks

| Component | Used by | Ecosystem risk |
|-----------|---------|----------------|
| `JBUniswapV4Hook` | V4 pools, buyback/routing compositions | Oracle, routing, or flag-misdeployment failures can affect every hooked pool. Some failures degrade to V4; mature-oracle failures can hard-revert. |
| `JBBuybackHookRegistry` | Revnets and projects using shared buyback routing | Misrouting or bad pool registration can skew mint-vs-swap behavior ecosystem-wide. |
| `JBSuckerRegistry` | Omnichain deployers, revnets, sucker-aware tooling | False or stale sucker identity can distort cross-chain accounting and tax treatment across many projects. |
| `JBPrices` | Any cross-currency path | Stale or divergent feeds can halt or misprice cross-currency operations across multiple repos simultaneously. |
| `JB721TiersHookStore` | 721 hook ecosystems including app-layer repos | Store-level bugs affect NFT balances, tiers, reserves, and mint/burn semantics across many projects at once. |
| shared deployer/owner singletons | Revnet and omnichain project families | A bug in deployer-owned hook composition or post-deploy privilege wiring can affect all projects created by that deployer. |
| deployment safes and artifact registries | Entire ecosystem | Compromise or stale artifacts can misconfigure canonical addresses for all downstream repos. |

## Failure Mode Matrix

This is the shortest useful answer to “does this path fail open, fail closed, or under-report?”

| Surface | Typical failure mode | What usually happens |
|---------|----------------------|----------------------|
| fee processing in core terminals | fail-open | fee can be forgiven or returned to project balance rather than blocking the main flow |
| buyback routing | mixed, often fail-open | some failures fall back to direct minting instead of swap-based issuance |
| mature TWAP observation in `JBUniswapV4Hook` | fail-closed | swap can revert once the hook expects reliable TWAP and cannot safely produce it |
| revnet debt aggregation with zero-price feeds | best-effort / under-reporting | affected source can be skipped to avoid bricking loan operations |
| sucker registry aggregate views | best-effort / under-reporting | reverting peers can be skipped, so registry-wide totals may be lower bounds |
| terminal/controller provenance checks | fail-closed | unrecognized or missing terminal/controller provenance typically reverts or makes a route ineligible |
| deployment resume/recovery | mixed | recovery can preserve partial progress, but stale artifacts or wrong safe context can still miswire the system |

Do not compress these into a single mental model. The ecosystem intentionally mixes fail-open and fail-closed behavior depending on which invariant is being protected.

## Permission Concentration

### Wildcard or ecosystem-scale authorities

These are the first places to inspect when assessing blast radius:

- contracts with wildcard permissions (`projectId = 0`) in `JBPermissions`
- hardcoded bypass operators such as `OMNICHAIN_RULESET_OPERATOR`
- registries or deployers that can register, map, or authorize identities on behalf of many projects
- deployment safes or owner contracts that can upgrade or re-point shared infrastructure

### Why this matters

- A bug in a project-local permission surface is usually project-local.
- A bug in a wildcard-granted or hardcoded ecosystem operator can affect every project created by a deployer or every project in a category.
- `ROOT` remains especially sensitive because it inherits future permissions too. Even when wildcard `ROOT` is constrained operationally, project-level `ROOT` still deserves maximum scrutiny.

## Cross-Chain Consistency Requirements

### Capability-aware parity

- Cross-chain correctness requires more than “the same contracts everywhere.”
- Chains can intentionally have different capability sets. The right invariant is that each chain matches its intended capability profile and that every cross-chain reference points only to peers that actually exist on the destination chain.

### Project ID alignment

- Project IDs are sequential per chain, so ordering matters.
- Any extra or missing `createFor` call can shift downstream project IDs and silently poison peer mappings, fee references, and deployment assumptions.
- Verification should check canonical IDs for the projects that are expected on that chain, not assume a universal fixed set on every network.

### Sucker peer symmetry

- Every intended `(chainA, chainB)` bridge relationship should be reciprocal.
- One-sided deployment can leave users able to bridge in one direction but not return along the same path.
- This is a post-deploy verification problem, not something deployment success alone proves.

### Feed configuration parity

- Each chain configures price feeds independently.
- Different staleness thresholds, currency mappings, or feed addresses can make cross-chain surplus and loan interpretations diverge even when contract code is identical.

## Post-Deploy Verification Checklist

Run this after every fresh deployment, resume flow, migration, or singleton replacement:

1. Verify the canonical singleton addresses in deployment artifacts match the intended chain profile.
2. Verify every expected project ID on that chain, and verify that omitted projects are intentionally omitted for capability reasons.
3. Verify controller and primary terminal provenance for the expected core projects.
4. Verify wildcard grants, hardcoded bypass operators, and deployer-owned authorities match the intended permissions model.
5. Verify buyback pool registration and actual pool initialization state; do not infer readiness from deployment success alone.
6. Verify sucker peer symmetry and token mappings for every intended bridge pair.
7. Verify price feed addresses, staleness thresholds, and currency mappings match the intended chain configuration.
8. Verify router/deployer references used by downstream repos point to the same canonical singleton addresses recorded in artifacts.
9. Verify that monitoring distinguishes fail-open paths from fail-closed paths instead of treating all failures as generic degradation.

Primary repo docs for this checklist:

- [`nana-core-v6/RISKS.md`](./nana-core-v6/RISKS.md)
- [`deploy-all-v6/RISKS.md`](./deploy-all-v6/RISKS.md)
- [`revnet-core-v6/RISKS.md`](./revnet-core-v6/RISKS.md)
- [`nana-suckers-v6/RISKS.md`](./nana-suckers-v6/RISKS.md)
- [`nana-buyback-hook-v6/RISKS.md`](./nana-buyback-hook-v6/RISKS.md)
- [`univ4-router-v6/RISKS.md`](./univ4-router-v6/RISKS.md)
- [`univ4-lp-split-hook-v6/RISKS.md`](./univ4-lp-split-hook-v6/RISKS.md)

## Ecosystem Invariants

These are the cross-repo truths that should be tested or monitored continuously.

- **No generic graceful-degradation assumption.** Shared-component failures must be classified per path as fail-open, fail-closed, or best-effort. Monitoring should not assume a singleton failure merely causes “economic inefficiency.”
- **Cross-chain supply conservation for sucker-managed projects.** Bridging should burn on the source side and mint on the destination side without creating net supply. Registry-wide aggregate views may under-report during peer failure, so conservation checks must account for best-effort read surfaces.
- **No cross-project balance corruption.** Project accounting inside terminals/stores must not let one project's operations deplete another project's recorded funds.
- **Deployment artifact coherence.** Canonical singleton addresses, project IDs, and router/deployer references must match the intended chain profile after every deployment or resume operation.
- **Shared-singleton liveness is path-specific.** Some singleton failures halt dependent operations, some trigger fallback behavior, and some only degrade estimate quality. The invariant is not “all failures are harmless”; it is that each failure mode is understood and monitored explicitly.

## Review Order For Auditors And Crawlers

If you are new to the ecosystem, review in this order:

1. [`nana-core-v6/RISKS.md`](./nana-core-v6/RISKS.md)
2. [`deploy-all-v6/RISKS.md`](./deploy-all-v6/RISKS.md)
3. [`revnet-core-v6/RISKS.md`](./revnet-core-v6/RISKS.md)
4. [`nana-suckers-v6/RISKS.md`](./nana-suckers-v6/RISKS.md)
5. [`nana-buyback-hook-v6/RISKS.md`](./nana-buyback-hook-v6/RISKS.md)
6. [`univ4-router-v6/RISKS.md`](./univ4-router-v6/RISKS.md)
7. [`univ4-lp-split-hook-v6/RISKS.md`](./univ4-lp-split-hook-v6/RISKS.md)
8. then the app-layer repos that depend on those surfaces

Recommended path-specific drill-downs:

- pricing and accounting path: `nana-core-v6` -> `revnet-core-v6` -> `univ4-lp-split-hook-v6`
- buyback and swap path: `nana-buyback-hook-v6` -> `univ4-router-v6` -> `nana-core-v6`
- cross-chain and sucker path: `nana-suckers-v6` -> `nana-omnichain-deployers-v6` -> `revnet-core-v6` -> `nana-core-v6`
- deployment and migration path: `deploy-all-v6` -> deployment repos -> `nana-core-v6` -> `nana-router-terminal-v6`

Per-repo details live in each subrepo's `RISKS.md`.
