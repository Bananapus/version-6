# User Journeys

This file answers one question: "I want to do something in Juicebox V6. Where do I start, what repo owns that flow, and what happens next?"

## Who This Guide Is For

- founders launching projects
- integrators wiring contracts, hooks, and frontends
- operators deploying or administering protocol infrastructure
- auditors who need the real user-facing lifecycles before reading code

## Journey 1: Launch A Plain Programmable Treasury

**Use when:** you want the raw protocol surface and will wire hooks, permissions, terminals, and follow-on automation yourself.

**Start here:** [nana-core-v6](./nana-core-v6/USER_JOURNEYS.md)

**Flow**
1. Launch a project with `JBController.launchProjectFor(...)`.
2. Register the terminals and accounting contexts the project will accept.
3. Queue rulesets that define issuance, reserved rate, payout limits, cash-out tax, hooks, and permissions.
4. Let supporters pay through `JBMultiTerminal` and let token holders cash out against surplus.
5. Layer in optional hooks, split hooks, NFT hooks, or cross-chain tooling as separate integrations.

**You own:** ruleset design, permissions, hook composition, and operational safety.

## Journey 2: Launch An Owner-Controlled Omnichain Project

**Use when:** you want a project owner, optional NFT tiers, and optional cross-chain suckers without hand-wiring every contract.

**Start here:** [nana-omnichain-deployers-v6](./nana-omnichain-deployers-v6/USER_JOURNEYS.md)

**Flow**
1. Prepare standard Juicebox ruleset and terminal configs.
2. Add optional 721 tiers and optional custom data-hook configuration.
3. Add optional sucker deployment config for the chains you want connected.
4. Call the omnichain deployer once.
5. The final owner receives the project and can keep operating it through the normal owner-controlled protocol surfaces.

**You keep:** owner-level flexibility after launch.

## Journey 3: Launch An Autonomous Revnet

**Use when:** you want stage-based economics locked in at deploy time, with no human project owner controlling the treasury after launch.

**Start here:** [revnet-core-v6](./revnet-core-v6/USER_JOURNEYS.md)

**Flow**
1. Define stage parameters, accepted terminals, optional NFT tiers, optional suckers, and the split operator.
2. Deploy through `REVDeployer`.
3. Participants buy in, receive revnet tokens, and move through the staged issuance schedule.
4. Holders can cash out, bridge, borrow against, or temporarily hide tokens through the configured revnet surfaces.
5. Post-launch changes remain limited to the bounded surfaces the revnet design leaves adjustable.

**Tradeoff:** less governance flexibility, more credible economic immutability.

## Journey 3a: Hide Or Reveal Revnet Tokens Temporarily

**Use when:** token holders want to exclude their tokens from supply temporarily to benefit remaining holders' cash-out value.

**Start here:** [revnet-core-v6](./revnet-core-v6/USER_JOURNEYS.md)

**Flow**
1. Grant `BURN_TOKENS` permission to the `REVHiddenTokens` contract.
2. Call `REVHiddenTokens.hideTokensOf(revnetId, tokenCount)` to burn tokens and track them.
3. Hidden tokens are excluded from `totalSupply`, increasing cash-out value for remaining holders.
4. At any time, the original holder calls `REVHiddenTokens.revealTokensOf(revnetId, tokenCount, beneficiary)` to re-mint tokens without reserved percent.

**Tradeoff:** tokens must be revealed before they can be used as loan collateral (explicit two-step process).

## Journey 4: Sell NFTs Or Content Alongside Treasury Participation

**Use when:** your project should mint NFTs on payment or let contributors publish content into a collection.

**Choose the repo**
- [nana-721-hook-v6](./nana-721-hook-v6/USER_JOURNEYS.md): fixed tiered NFT rewards, memberships, editions, raffles, claims.
- [croptop-core-v6](./croptop-core-v6/USER_JOURNEYS.md): permissioned publishing, where allowed posters create new NFT tiers on an existing project.
- [banny-retail-v6](./banny-retail-v6/USER_JOURNEYS.md): composable on-chain avatars and accessories.
- [defifa](./defifa/USER_JOURNEYS.md): game-like collections where scorecards decide payout weights.

**Shared pattern**
1. Configure or deploy the project and NFT surface.
2. Supporters pay.
3. The hook or deployer mints the right NFT state.
4. Holders either keep the NFT, use its governance/utility, or later burn/cash out according to the product rules.

## Journey 5: Accept Payments In More Tokens Than The Project Natively Supports

**Use when:** the project treasury wants one asset, but users will show up with many.

**Start here:** [nana-router-terminal-v6](./nana-router-terminal-v6/USER_JOURNEYS.md)

**Flow**
1. The project configures a router terminal alongside its native terminal.
2. A payer submits the token they have.
3. The router previews candidate routes, swaps into the accepted terminal token, and forwards the payment.
4. The project behaves as if it received the accepted token directly.

## Journey 6: Add Market Routing, Buybacks, Or Treasury-Bounded Liquidity

**Use when:** you want market trades to compare against protocol-native pricing, or you want reserved tokens deployed into Uniswap V4 liquidity.

**Choose the repo**
- [nana-buyback-hook-v6](./nana-buyback-hook-v6/USER_JOURNEYS.md): route buys and sells through the better of Juicebox or Uniswap.
- [univ4-router-v6](./univ4-router-v6/USER_JOURNEYS.md): the V4 hook and oracle surface that makes routing safe and queryable.
- [univ4-lp-split-hook-v6](./univ4-lp-split-hook-v6/USER_JOURNEYS.md): accumulate reserved tokens, deploy a bounded LP position, collect and route fees.

## Journey 7: Move Project Exposure Across Chains

**Use when:** holders should be able to move value or claims between chains without fragmenting the product.

**Start here:** [nana-suckers-v6](./nana-suckers-v6/USER_JOURNEYS.md)

**Flow**
1. Deploy or inherit a paired sucker setup.
2. Holder prepares a bridge by cashing out into a mapped token on the source chain.
3. The source sucker bridges a merkle root through its messenger.
4. The destination sucker verifies the proof and mints or releases the remote-side asset.

**If you want deployment bundled in from day one:** use [nana-omnichain-deployers-v6](./nana-omnichain-deployers-v6/USER_JOURNEYS.md) or [revnet-core-v6](./revnet-core-v6/USER_JOURNEYS.md).

## Journey 8: Deploy Or Rehearse The Entire Ecosystem

**Use when:** you are a protocol operator, not an app founder.

**Start here:** [deploy-all-v6](./deploy-all-v6/USER_JOURNEYS.md)

**Flow**
1. Validate artifacts and sibling-package consistency.
2. Run the phased deployment plan.
3. Resume from checkpoints if a phase is interrupted.
4. Run verification and recovery checks.
5. Treat the fee project deployment and chain-specific wiring as production-critical surfaces.

## Supporting Repos

- [nana-ownable-v6](./nana-ownable-v6/USER_JOURNEYS.md): ownership that can follow a project NFT instead of an EOA.
- [nana-permission-ids-v6](./nana-permission-ids-v6/USER_JOURNEYS.md): the shared permission vocabulary used across the stack.
- [nana-address-registry-v6](./nana-address-registry-v6/USER_JOURNEYS.md): provenance for deterministic deployments.
- [nana-fee-project-deployer-v6](./nana-fee-project-deployer-v6/USER_JOURNEYS.md): deployment of project `#1`, the fee beneficiary.
- [nana-privacy-v6](./nana-privacy-v6/USER_JOURNEYS.md): stealth-address and privacy helper patterns that layer onto existing payments.

## How To Read The Repo-Level Files

Every repo-level `USER_JOURNEYS.md` follows the same standard:

1. Who the repo serves.
2. The concrete starting state for each important actor.
3. The happy path in the actual order the contracts expect.
4. The failure or edge conditions that change operator behavior.
5. Where the user hands off to another repo.
