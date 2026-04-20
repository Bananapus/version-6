# User Journeys

Use this file to answer four questions quickly:

1. What kind of system am I trying to launch or inspect?
2. Which repo actually owns that behavior?
3. Which sibling repos are optional integrations versus core dependencies?
4. Where should I go next once I leave the starting repo?

Template for new repo-level files: [documentation_templates/USER_JOURNEYS.md](./documentation_templates/USER_JOURNEYS.md)

## Ecosystem Purpose

The V6 EVM repos are not one monolith. They break into a few clear layers:

- treasury and permission core: [nana-core-v6](./nana-core-v6/USER_JOURNEYS.md)
- opinionated deployers and launch packaging: [nana-omnichain-deployers-v6](./nana-omnichain-deployers-v6/USER_JOURNEYS.md), [revnet-core-v6](./revnet-core-v6/USER_JOURNEYS.md), [deploy-all-v6](./deploy-all-v6/USER_JOURNEYS.md), [nana-fee-project-deployer-v6](./nana-fee-project-deployer-v6/USER_JOURNEYS.md)
- payment, market-routing, and liquidity extensions: [nana-router-terminal-v6](./nana-router-terminal-v6/USER_JOURNEYS.md), [nana-buyback-hook-v6](./nana-buyback-hook-v6/USER_JOURNEYS.md), [univ4-router-v6](./univ4-router-v6/USER_JOURNEYS.md), [univ4-lp-split-hook-v6](./univ4-lp-split-hook-v6/USER_JOURNEYS.md)
- NFT, publishing, and product surfaces: [nana-721-hook-v6](./nana-721-hook-v6/USER_JOURNEYS.md), [croptop-core-v6](./croptop-core-v6/USER_JOURNEYS.md), [banny-retail-v6](./banny-retail-v6/USER_JOURNEYS.md), [defifa/USER_JOURNEYS.md](./defifa/USER_JOURNEYS.md)
- cross-chain movement and utility infrastructure: [nana-suckers-v6](./nana-suckers-v6/USER_JOURNEYS.md), [nana-ownable-v6](./nana-ownable-v6/USER_JOURNEYS.md), [nana-project-handles-v6](./nana-project-handles-v6/USER_JOURNEYS.md), [nana-address-registry-v6](./nana-address-registry-v6/USER_JOURNEYS.md), [nana-distributor-v6](./nana-distributor-v6/USER_JOURNEYS.md), [nana-permission-ids-v6](./nana-permission-ids-v6/USER_JOURNEYS.md)

If you do not know where to begin, decide whether the question is mainly about:

- launching and operating a project treasury
- deploying protocol infrastructure
- NFT or app-layer behavior
- routing, swaps, or liquidity
- cross-chain movement

## Journey 1: Launch A Standard Project Treasury

**Actor:** founder, operator, or protocol integrator.

**Intent:** launch a Juicebox-style treasury with optional extensions.

**Start Here**

- [nana-core-v6](./nana-core-v6/USER_JOURNEYS.md)

**Main Flow**

1. Define terminals, rulesets, payout limits, and permissions.
2. Launch the project through core protocol surfaces.
3. Add extensions only where needed.
4. Operate the project through the normal core admin and runtime paths.

**Typical Hand-Offs**

- To [nana-721-hook-v6](./nana-721-hook-v6/USER_JOURNEYS.md) for tiered NFT issuance.
- To [nana-router-terminal-v6](./nana-router-terminal-v6/USER_JOURNEYS.md) for multi-asset payment routing.
- To [nana-buyback-hook-v6](./nana-buyback-hook-v6/USER_JOURNEYS.md) for market-aware pricing.
- To [nana-suckers-v6](./nana-suckers-v6/USER_JOURNEYS.md) for cross-chain bridging.

## Journey 2: Launch An Owner-Controlled Packaged Project

**Actor:** founder or product team that wants a faster launch path without giving up project ownership.

**Intent:** deploy a project in one opinionated flow while still keeping an owner who can operate it later.

**Start Here**

- [nana-omnichain-deployers-v6](./nana-omnichain-deployers-v6/USER_JOURNEYS.md)

**Main Flow**

1. Prepare the same core ingredients a normal project needs: rulesets, terminals, payout rules, and permissions.
2. Add optional NFT tiers, data-hook config, and sucker deployment config where needed.
3. Run the packaged deployer once so the system wires those surfaces together consistently.
4. Hand ongoing control to the intended owner and continue through the normal project paths.

**Typical Hand-Offs**

- To [nana-core-v6](./nana-core-v6/USER_JOURNEYS.md) for day-to-day treasury operations.
- To [nana-721-hook-v6](./nana-721-hook-v6/USER_JOURNEYS.md) for deeper NFT-tier review.
- To [nana-suckers-v6](./nana-suckers-v6/USER_JOURNEYS.md) for bridge runtime behavior.

## Journey 3: Launch An Autonomous Revnet

**Actor:** protocol designer or team that wants stronger economic immutability and weaker post-launch human control.

**Intent:** deploy stage-based treasury economics that are mostly fixed at launch.

**Start Here**

- [revnet-core-v6](./revnet-core-v6/USER_JOURNEYS.md)

**Main Flow**

1. Define the stage schedule, issuance logic, accepted terminals, split operator, and optional hook and cross-chain surfaces.
2. Deploy through `REVDeployer` instead of a plain owner-controlled path.
3. Let participants buy in, cash out, bridge, or borrow within the allowed constraints.
4. Treat post-launch mutability as intentionally narrow.

**Typical Hand-Offs**

- To [nana-suckers-v6](./nana-suckers-v6/USER_JOURNEYS.md) for bridge proofs and destination-side claims.
- To [nana-buyback-hook-v6](./nana-buyback-hook-v6/USER_JOURNEYS.md) or [univ4-router-v6](./univ4-router-v6/USER_JOURNEYS.md) for market-routing behavior.
- To [nana-distributor-v6](./nana-distributor-v6/USER_JOURNEYS.md) if reserved-token rewards are distributed through external vesting flows.

## Journey 4: Add NFT Rewards, Publishing, Or Avatar Surfaces

**Actor:** product team building a treasury-linked NFT or media product.

**Intent:** attach contributor-facing NFTs or publishing behavior to an existing treasury or packaged deployment.

**Choose The Start Repo**

- [nana-721-hook-v6](./nana-721-hook-v6/USER_JOURNEYS.md) for tiered membership, editions, claims, auctions, or payment-triggered NFT rewards
- [croptop-core-v6](./croptop-core-v6/USER_JOURNEYS.md) for permissioned publishing on top of a project
- [banny-retail-v6](./banny-retail-v6/USER_JOURNEYS.md) for composable avatar inventory and retail-style item logic
- [defifa/USER_JOURNEYS.md](./defifa/USER_JOURNEYS.md) for prediction games with NFT-governed settlement

**Shared Flow**

1. Start from an existing project or launch one in the same rollout.
2. Configure the NFT or publishing surface with the right owner, permissions, and supply assumptions.
3. Let supporters pay or authorized publishers create content.
4. Mint, assign, or update NFT state under the repo-specific rules.
5. Hand back to the parent project flow for treasury accounting, permissions, and payouts.

## Journey 5: Accept More Assets Or Compare Protocol Pricing With AMM Pricing

**Actor:** treasury operator or integrator optimizing the payment path.

**Intent:** let users arrive with different assets, or route buys and sells through the better of protocol-native pricing and market pricing.

**Choose The Start Repo**

- [nana-router-terminal-v6](./nana-router-terminal-v6/USER_JOURNEYS.md) for accepting more input assets and forwarding them into the project's supported terminal asset
- [nana-buyback-hook-v6](./nana-buyback-hook-v6/USER_JOURNEYS.md) for choosing between protocol issuance and AMM execution on buys and sells
- [univ4-router-v6](./univ4-router-v6/USER_JOURNEYS.md) if the real question is about the Uniswap V4 hook, TWAP safety, or quote-validation layer

**Shared Flow**

1. Keep the parent project's accepted terminal assets and accounting contexts explicit.
2. Add the routing surface that previews or compares execution paths.
3. Let the payer or seller submit the asset they actually hold.
4. Route into the project only if the configured preview and execution guards still hold.
5. Fall back to the parent treasury behavior once conversion or path comparison is done.

## Journey 6: Deploy Treasury-Bounded Liquidity And Capture LP Fees

**Actor:** treasury designer or operator managing reserved-token liquidity strategy.

**Intent:** send reserved-token flows into a bounded Uniswap V4 position instead of leaving them idle.

**Start Here**

- [univ4-lp-split-hook-v6](./univ4-lp-split-hook-v6/USER_JOURNEYS.md)

**Main Flow**

1. Configure the split hook so reserved-token flows accumulate into the LP management path.
2. Deploy or reuse the required Uniswap V4 router and pool setup.
3. Let the hook deploy and manage a bounded position under the configured range assumptions.
4. Route accrued fees back through the intended treasury path.

## Journey 7: Launch Or Rehearse The Full Ecosystem

**Actor:** release engineer, deployment operator, or reviewer.

**Intent:** prove that the current set of repos still deploy together correctly.

**Start Here**

- [deploy-all-v6](./deploy-all-v6/USER_JOURNEYS.md)

**Main Flow**

1. Rehearse the composed deployment on forks.
2. Deploy the system in dependency order.
3. Resume from partial state if needed.
4. Run verification before treating the rollout as complete.

**Typical Hand-Offs**

- To repo-local deployer docs when a problem is specific to one subsystem.
- To runtime repos when deployment shape is proven correct and the remaining bug is runtime behavior.
