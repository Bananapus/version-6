# User Journeys

This file is the first-stop map for the V6 EVM ecosystem.
Use it to answer four questions quickly:

1. What kind of system am I trying to launch or inspect?
2. Which repo actually owns that behavior?
3. Which sibling repos are optional integrations versus core dependencies?
4. Where does the question move next once I leave the starting repo?

Template for new repo-level files: [documentation_templates/USER_JOURNEYS.md](./documentation_templates/USER_JOURNEYS.md)

## Ecosystem Purpose

The V6 EVM repos are not one monolith. They split into a few clear layers:

- treasury and permission core: [nana-core-v6](./nana-core-v6/USER_JOURNEYS.md)
- opinionated deployers and launch packaging: [nana-omnichain-deployers-v6](./nana-omnichain-deployers-v6/USER_JOURNEYS.md), [revnet-core-v6](./revnet-core-v6/USER_JOURNEYS.md), [deploy-all-v6](./deploy-all-v6/USER_JOURNEYS.md), [nana-fee-project-deployer-v6](./nana-fee-project-deployer-v6/USER_JOURNEYS.md)
- payment, market-routing, and liquidity extensions: [nana-router-terminal-v6](./nana-router-terminal-v6/USER_JOURNEYS.md), [nana-buyback-hook-v6](./nana-buyback-hook-v6/USER_JOURNEYS.md), [univ4-router-v6](./univ4-router-v6/USER_JOURNEYS.md), [univ4-lp-split-hook-v6](./univ4-lp-split-hook-v6/USER_JOURNEYS.md)
- NFT, publishing, and product surfaces: [nana-721-hook-v6](./nana-721-hook-v6/USER_JOURNEYS.md), [croptop-core-v6](./croptop-core-v6/USER_JOURNEYS.md), [banny-retail-v6](./banny-retail-v6/USER_JOURNEYS.md), [defifa/USER_JOURNEYS.md](./defifa/USER_JOURNEYS.md)
- cross-chain movement and auxiliary ownership/identity infrastructure: [nana-suckers-v6](./nana-suckers-v6/USER_JOURNEYS.md), [nana-ownable-v6](./nana-ownable-v6/USER_JOURNEYS.md), [project-handles-v6](./project-handles-v6/USER_JOURNEYS.md), [nana-address-registry-v6](./nana-address-registry-v6/USER_JOURNEYS.md), [nana-distributor-v6](./nana-distributor-v6/USER_JOURNEYS.md), [nana-permission-ids-v6](./nana-permission-ids-v6/USER_JOURNEYS.md)

If you do not know where to begin, decide first whether your question is about:

- launching and operating a project treasury
- deploying protocol infrastructure
- adding product hooks or market integrations
- tracing permissions, provenance, ownership, or identity metadata

## Canonical Ownership Map

Use this when the same concept appears in multiple repos:

- project launch, rulesets, `pay(...)`, `cashOutTokensOf(...)`, and runtime permission checks:
  [nana-core-v6](./nana-core-v6/USER_JOURNEYS.md)
- owner-controlled packaged deployment:
  [nana-omnichain-deployers-v6](./nana-omnichain-deployers-v6/USER_JOURNEYS.md)
- staged autonomous deployment through `REVDeployer`:
  [revnet-core-v6](./revnet-core-v6/USER_JOURNEYS.md)
- project-facing multi-asset routing through `JBRouterTerminal.pay(...)`:
  [nana-router-terminal-v6](./nana-router-terminal-v6/USER_JOURNEYS.md)
- buyback route comparison and pool selection:
  [nana-buyback-hook-v6](./nana-buyback-hook-v6/USER_JOURNEYS.md)
- UniV4 quote safety and hook-level route primitives:
  [univ4-router-v6](./univ4-router-v6/USER_JOURNEYS.md)
- reserved-token LP deployment and fee capture:
  [univ4-lp-split-hook-v6](./univ4-lp-split-hook-v6/USER_JOURNEYS.md)
- payment-triggered NFT tiers and claims:
  [nana-721-hook-v6](./nana-721-hook-v6/USER_JOURNEYS.md)
- permissioned publishing and post creation:
  [croptop-core-v6](./croptop-core-v6/USER_JOURNEYS.md)
- prediction-game launch, scorecard governance, and pot settlement:
  [defifa/USER_JOURNEYS.md](./defifa/USER_JOURNEYS.md)
- cross-chain claim movement and remote mint/release:
  [nana-suckers-v6](./nana-suckers-v6/USER_JOURNEYS.md)
- canonical fee-project deployment for project `#1`:
  [nana-fee-project-deployer-v6](./nana-fee-project-deployer-v6/USER_JOURNEYS.md)
- full-stack rollout sequencing:
  [deploy-all-v6](./deploy-all-v6/USER_JOURNEYS.md)
- ownership wrappers, permission IDs, provenance, reward distribution, and handles:
  [nana-ownable-v6](./nana-ownable-v6/USER_JOURNEYS.md), [nana-permission-ids-v6](./nana-permission-ids-v6/USER_JOURNEYS.md), [nana-address-registry-v6](./nana-address-registry-v6/USER_JOURNEYS.md), [nana-distributor-v6](./nana-distributor-v6/USER_JOURNEYS.md), [project-handles-v6](./project-handles-v6/USER_JOURNEYS.md)

## Runtime Versus Packaging

This is the most common ecosystem-level navigation mistake:

- start with deployment-packaging repos when the question is "how was this launched or wired?"
- switch to runtime repos when the question is "what happens after a user pays, cashes out, bridges, borrows, or claims?"

In practice:

- packaging-first: [deploy-all-v6](./deploy-all-v6/USER_JOURNEYS.md), [nana-fee-project-deployer-v6](./nana-fee-project-deployer-v6/USER_JOURNEYS.md), [nana-omnichain-deployers-v6](./nana-omnichain-deployers-v6/USER_JOURNEYS.md), [revnet-core-v6](./revnet-core-v6/USER_JOURNEYS.md)
- runtime-first: [nana-core-v6](./nana-core-v6/USER_JOURNEYS.md), [nana-router-terminal-v6](./nana-router-terminal-v6/USER_JOURNEYS.md), [nana-buyback-hook-v6](./nana-buyback-hook-v6/USER_JOURNEYS.md), [nana-suckers-v6](./nana-suckers-v6/USER_JOURNEYS.md), [defifa/USER_JOURNEYS.md](./defifa/USER_JOURNEYS.md)

## Primary Actors

- founders and product teams choosing how much flexibility or immutability they want at launch
- integrators wiring terminals, hooks, NFT surfaces, or cross-chain behavior into a project
- protocol operators deploying ecosystem infrastructure and canonical projects
- auditors and security reviewers building a mental model before reading contracts and tests
- bots and indexing systems that need a crawlable map of where user intent turns into onchain behavior

## Repo Selection Heuristic

Use this quick rule before diving into any repo:

- Start with [nana-core-v6](./nana-core-v6/USER_JOURNEYS.md) if the question begins with `launchProjectFor(...)`, `pay(...)`, `cashOutTokensOf(...)`, rulesets, terminals, or project permissions.
- Start with [nana-omnichain-deployers-v6](./nana-omnichain-deployers-v6/USER_JOURNEYS.md) if the question is "how do I launch once and keep a project owner?"
- Start with [revnet-core-v6](./revnet-core-v6/USER_JOURNEYS.md) if the question is "how do I launch through `REVDeployer` and deliberately reduce post-launch control?"
- Start with [deploy-all-v6](./deploy-all-v6/USER_JOURNEYS.md) if the question is about the protocol rollout, checkpoints, artifacts, or recovery sequencing.
- Start with [nana-router-terminal-v6](./nana-router-terminal-v6/USER_JOURNEYS.md) if the question starts from the payer's asset and route discovery.
- Start with [nana-buyback-hook-v6](./nana-buyback-hook-v6/USER_JOURNEYS.md) if the question starts from "should this trade go through Juicebox or the pool?"
- Start with [nana-721-hook-v6](./nana-721-hook-v6/USER_JOURNEYS.md), [croptop-core-v6](./croptop-core-v6/USER_JOURNEYS.md), [banny-retail-v6](./banny-retail-v6/USER_JOURNEYS.md), or [defifa/USER_JOURNEYS.md](./defifa/USER_JOURNEYS.md) if the product centers on NFTs, tiered rewards, publishing, avatar inventory, or game-style scorecard settlement.
- Start with [nana-suckers-v6](./nana-suckers-v6/USER_JOURNEYS.md) if the question starts from a source-chain exit and destination-chain claim.
- Start with helper repos only after you know the parent treasury, deployment, or product flow they are supporting.

## Do Not Start Here

These are the most common wrong first hops:

- Do not start with [nana-permission-ids-v6](./nana-permission-ids-v6/USER_JOURNEYS.md) to answer whether an action is allowed. It names IDs; [nana-core-v6](./nana-core-v6/USER_JOURNEYS.md) and the downstream repo enforce them.
- Do not start with [nana-address-registry-v6](./nana-address-registry-v6/USER_JOURNEYS.md) to decide whether a deployment is safe. It records provenance claims, not approval.
- Do not start with [nana-fee-project-deployer-v6](./nana-fee-project-deployer-v6/USER_JOURNEYS.md) if your question is about fee-project runtime behavior after deployment. Use [revnet-core-v6](./revnet-core-v6/USER_JOURNEYS.md) for the runtime envelope.
- Do not start with [univ4-router-v6](./univ4-router-v6/USER_JOURNEYS.md) if your question is simply "how can a payer use a different token?" Start with [nana-router-terminal-v6](./nana-router-terminal-v6/USER_JOURNEYS.md).
- Do not start with [deploy-all-v6](./deploy-all-v6/USER_JOURNEYS.md) if your question is about runtime behavior after deployment. It proves composition, not steady-state economics.
- Do not start with helper repos to understand the main product lifecycle. Start with the treasury, deployer, bridge, or NFT repo that owns the primary state changes.

## Journey 1: Launch A Plain Programmable Treasury

**Actor:** founder, protocol-integrator, or engineer who wants the raw Juicebox V6 surface.

**Intent:** launch a project where the team keeps direct control over rulesets, terminals, permissions, and follow-on integrations.

**Start Here**
- [nana-core-v6](./nana-core-v6/USER_JOURNEYS.md)

**Main Flow**
1. Launch a project with `JBController.launchProjectFor(...)` and define the first ruleset, fund access constraints, and token issuance behavior.
2. Configure accepted terminals and accounting contexts so supporters can pay in the intended assets.
3. Grant or review operator permissions for treasury administration, migrations, hook changes, and payout behavior.
4. Let supporters call `pay(...)`, let holders call `cashOutTokensOf(...)`, and queue later ruleset changes through the base protocol.
5. Add optional sibling integrations only after the base treasury behavior is sound.

**Typical Hand-Offs**
- To [nana-721-hook-v6](./nana-721-hook-v6/USER_JOURNEYS.md) for tiered NFT issuance on payment.
- To [nana-router-terminal-v6](./nana-router-terminal-v6/USER_JOURNEYS.md) for multi-asset payment routing.
- To [nana-buyback-hook-v6](./nana-buyback-hook-v6/USER_JOURNEYS.md) for market-aware pricing.
- To [nana-suckers-v6](./nana-suckers-v6/USER_JOURNEYS.md) for cross-chain bridging.

## Journey 2: Launch An Owner-Controlled Packaged Project

**Actor:** founder or product team that wants a faster launch path without giving up project ownership.

**Intent:** deploy a project in one opinionated flow while keeping an owner who can continue operating the project afterward.

**Start Here**
- [nana-omnichain-deployers-v6](./nana-omnichain-deployers-v6/USER_JOURNEYS.md)

**Main Flow**
1. Prepare the same core ingredients a normal project needs: rulesets, terminals, payout rules, and permissions.
2. Add optional NFT tiers, data-hook configuration, and sucker deployment config where needed.
3. Run the packaged deployer once so the package wires those surfaces consistently.
4. Transfer ongoing control to the intended owner and continue operating through the normal owner-scoped protocol surfaces.

**Typical Hand-Offs**
- To [nana-core-v6](./nana-core-v6/USER_JOURNEYS.md) for ongoing treasury operations after launch.
- To [nana-721-hook-v6](./nana-721-hook-v6/USER_JOURNEYS.md) if NFT-tier behavior needs deeper review than the packaged deployer doc provides.
- To [nana-suckers-v6](./nana-suckers-v6/USER_JOURNEYS.md) for bridge-specific runtime behavior after deployment.

## Journey 3: Launch An Autonomous Revnet

**Actor:** protocol designer or team that wants stronger economic immutability and weaker post-launch human control.

**Intent:** deploy stage-based treasury economics that are mostly fixed at launch time.

**Start Here**
- [revnet-core-v6](./revnet-core-v6/USER_JOURNEYS.md)

**Main Flow**
1. Define the stage schedule, issuance logic, accepted terminals, split operator, and optional hook and cross-chain surfaces.
2. Deploy through `REVDeployer` rather than a plain owner-controlled project path.
3. Let participants buy in, cash out, bridge, or borrow within the constraints the staged configuration permits.
4. Treat post-launch mutability as intentionally narrow and review any adjustable surfaces separately.

**Typical Hand-Offs**
- To [nana-suckers-v6](./nana-suckers-v6/USER_JOURNEYS.md) for bridge proofs and destination-side claims.
- To [nana-buyback-hook-v6](./nana-buyback-hook-v6/USER_JOURNEYS.md) or [univ4-router-v6](./univ4-router-v6/USER_JOURNEYS.md) for market-routing behavior.
- To [nana-distributor-v6](./nana-distributor-v6/USER_JOURNEYS.md) if reserved-token rewards are being distributed through external vesting flows.

## Journey 4: Add NFT Rewards, Publishing, Or Avatar Surfaces

**Actor:** product team building a treasury-linked NFT or media product.

**Intent:** attach contributor-facing NFTs or publishing behavior to an existing treasury or packaged deployment.

**Choose The Start Repo**
- [nana-721-hook-v6](./nana-721-hook-v6/USER_JOURNEYS.md) for tiered membership, editions, claims, auctions, or payment-triggered NFT rewards.
- [croptop-core-v6](./croptop-core-v6/USER_JOURNEYS.md) for permissioned publishing where approved actors can create new tiers on an existing project.
- [banny-retail-v6](./banny-retail-v6/USER_JOURNEYS.md) for composable avatar inventory and retail-style item logic.
- [defifa/USER_JOURNEYS.md](./defifa/USER_JOURNEYS.md) for prediction games where NFT holders later govern scorecards that settle the pot.

**Shared Flow**
1. Start from an existing project or deploy one in the same rollout.
2. Configure the NFT or publishing surface with the right owner, permissions, and supply assumptions.
3. Let supporters pay or authorized publishers create content.
4. Mint, assign, or update the NFT state according to the repo-specific rules.
5. Hand back to the parent project flow for treasury accounting, permissions, and payouts.

## Journey 5: Accept More Assets Or Compare Protocol Pricing With AMM Pricing

**Actor:** treasury operator or integrator optimizing the payment path.

**Intent:** let users arrive with different assets, or route buys and sells through the better of protocol-native pricing and market pricing.

**Choose The Start Repo**
- [nana-router-terminal-v6](./nana-router-terminal-v6/USER_JOURNEYS.md) for accepting more input assets and forwarding them into a project's supported terminal asset.
- [nana-buyback-hook-v6](./nana-buyback-hook-v6/USER_JOURNEYS.md) for choosing between protocol issuance and AMM execution on buys and sells.
- [univ4-router-v6](./univ4-router-v6/USER_JOURNEYS.md) if the question is really about the Uniswap V4 hook, TWAP safety, or quote-validation layer underneath routing.

**Shared Flow**
1. Keep the parent project's accepted terminal assets and accounting contexts explicit.
2. Add the routing surface that previews or compares execution paths.
3. Let the payer or seller submit the asset they actually hold.
4. Route into the project only if the configured preview and execution guards still hold.
5. Fall back to the parent treasury behavior once the asset conversion or market comparison is complete.

## Journey 6: Deploy Treasury-Bounded Liquidity And Capture LP Fees

**Actor:** treasury designer or operator managing reserved-token liquidity strategy.

**Intent:** send reserved-token flows into a bounded Uniswap V4 position instead of leaving them idle.

**Start Here**
- [univ4-lp-split-hook-v6](./univ4-lp-split-hook-v6/USER_JOURNEYS.md)

**Main Flow**
1. Configure the split hook so reserved-token flows accumulate into the LP management path.
2. Deploy or reuse the required Uniswap V4 router and pool setup.
3. Let the hook deploy and manage a bounded liquidity position under the configured ranges and safety assumptions.
4. Route accrued fees back through the configured treasury path.

**Typical Hand-Offs**
- To [univ4-router-v6](./univ4-router-v6/USER_JOURNEYS.md) for the underlying V4 router and quote-safety surface.
- To [nana-buyback-hook-v6](./nana-buyback-hook-v6/USER_JOURNEYS.md) if LP and buyback behavior are both part of the same product design.

## Journey 7: Move Claims Or Treasury Exposure Across Chains

**Actor:** holder, operator, or integrator dealing with multichain state.

**Intent:** bridge value or claims without treating each chain as an unrelated product.

**Start Here**
- [nana-suckers-v6](./nana-suckers-v6/USER_JOURNEYS.md)

**Main Flow**
1. Identify the paired sucker deployment and messenger assumptions for the chains in scope.
2. Prepare the bridge on the source chain by cashing out, burning, escrowing, or otherwise transforming the source-side position according to the configured path.
3. Bridge the claim root or message to the destination chain.
4. Verify the destination-side proof and mint or release the corresponding remote-side asset.
5. Return to the parent project or Revnet flow once the holder has landed on the destination chain.

**Typical Hand-Offs**
- To [nana-omnichain-deployers-v6](./nana-omnichain-deployers-v6/USER_JOURNEYS.md) or [revnet-core-v6](./revnet-core-v6/USER_JOURNEYS.md) if the question is how the bridge was packaged in from day one.

## Journey 8: Deploy Or Audit The Protocol Stack Itself

**Actor:** protocol operator, release manager, or auditor reviewing the ecosystem as infrastructure rather than as one app.

**Intent:** understand or execute the canonical rollout of the V6 EVM stack.

**Choose The Start Repo**
- [deploy-all-v6](./deploy-all-v6/USER_JOURNEYS.md) for phased rollout, checkpoints, and recovery planning.
- [nana-fee-project-deployer-v6](./nana-fee-project-deployer-v6/USER_JOURNEYS.md) for the canonical fee project `#1`, which many downstream flows assume exists and is configured correctly.

**Shared Flow**
1. Validate sibling artifacts, addresses, and deployment assumptions before executing anything.
2. Deploy the stack or the fee-project subset in the intended order.
3. Verify project IDs, terminals, packaged integrations, and post-deploy assumptions before treating the ecosystem as live.
4. Use repo-specific runtime docs only after the deployment packaging is trusted.

## Journey 9: Trace Ownership, Permissions, Provenance, Identity, Or Reward Plumbing

**Actor:** auditor, tooling engineer, or operator debugging the edges around a main product flow.

**Intent:** inspect the helper repos that explain how projects are administered, recognized, or augmented.

**Choose The Start Repo**
- [nana-ownable-v6](./nana-ownable-v6/USER_JOURNEYS.md): ownership can follow a project NFT instead of a fixed EOA.
- [nana-permission-ids-v6](./nana-permission-ids-v6/USER_JOURNEYS.md): shared numeric permission vocabulary across the stack.
- [nana-address-registry-v6](./nana-address-registry-v6/USER_JOURNEYS.md): deterministic deployment provenance, not safety approval.
- [project-handles-v6](./project-handles-v6/USER_JOURNEYS.md): ENS-backed handles for project identity across chains.
- [nana-distributor-v6](./nana-distributor-v6/USER_JOURNEYS.md): split-hook distribution and vesting paths for 721 holders or `IVotes` stakers.

**Shared Rule**
- Use these repos to refine a parent flow, not to replace it. They explain edge metadata, authority, and reward plumbing around the main treasury, product, or deployment path.

## Common Cross-Repo Paths

These are the repo combinations most people actually need:

- plain treasury with NFT rewards: [nana-core-v6](./nana-core-v6/USER_JOURNEYS.md) -> [nana-721-hook-v6](./nana-721-hook-v6/USER_JOURNEYS.md)
- game-like treasury with scorecard settlement: [nana-core-v6](./nana-core-v6/USER_JOURNEYS.md) -> [defifa/USER_JOURNEYS.md](./defifa/USER_JOURNEYS.md)
- owner-controlled omnichain launch: [nana-omnichain-deployers-v6](./nana-omnichain-deployers-v6/USER_JOURNEYS.md) -> [nana-core-v6](./nana-core-v6/USER_JOURNEYS.md) -> [nana-suckers-v6](./nana-suckers-v6/USER_JOURNEYS.md)
- market-aware treasury: [nana-core-v6](./nana-core-v6/USER_JOURNEYS.md) -> [nana-router-terminal-v6](./nana-router-terminal-v6/USER_JOURNEYS.md) -> [nana-buyback-hook-v6](./nana-buyback-hook-v6/USER_JOURNEYS.md) -> [univ4-router-v6](./univ4-router-v6/USER_JOURNEYS.md)
- autonomous staged treasury: [revnet-core-v6](./revnet-core-v6/USER_JOURNEYS.md) -> [nana-suckers-v6](./nana-suckers-v6/USER_JOURNEYS.md) plus optional market or distributor repos
- full protocol rollout: [deploy-all-v6](./deploy-all-v6/USER_JOURNEYS.md) -> [nana-fee-project-deployer-v6](./nana-fee-project-deployer-v6/USER_JOURNEYS.md) -> runtime repos as needed

## Trust Boundaries

- The ecosystem is intentionally modular. A repo that packages deployment is often not the repo that owns runtime behavior.
- Helper repos often name, register, or route authority without storing funds themselves. Do not over-read a helper repo as the source of business logic.
- Market-routing and bridging repos add external trust assumptions around pools, quotes, messengers, and liveness that do not exist in plain treasury flows.
- Packaged deployers improve consistency but also concentrate configuration risk. Review scripts and resulting runtime state separately.

## How To Read The Repo-Level Files

Every repo-level `USER_JOURNEYS.md` in this checkout follows the same high-signal structure:

1. `Repo Purpose`: what the repo owns and what it does not.
2. `Primary Actors`: who should start there.
3. `Key Surfaces`: the contracts, scripts, or libraries that actually matter.
4. journey sections: actor intent, preconditions, main flow, failure modes, and postconditions.
5. `Trust Boundaries`: what must be trusted outside the repo's local code.
6. `Hand-Offs`: where to go next when the question leaves that repo's scope.
