# V5 to V6 Ecosystem Changelog

## Scope

This file tracks the deployed ecosystem shift from `../../v5/evm` to the current `v6` repos.

Excluded from the ecosystem delta on purpose:
- `defifa`
- `nana-distributor-v6`
- `nana-project-handles-v6`
- `nana-project-payer-v6`
- `univ4-lp-split-hook-v6`
- `univ4-router-v6`

Those repos exist in source form, but they were not part of the deployed v5 ecosystem this changelog is measuring.

## Summary

- `nana-swap-terminal-v5` becomes [`nana-router-terminal-v6/CHANGELOG.md`](./nana-router-terminal-v6/CHANGELOG.md): routing is no longer a manually configured swap-terminal model.
- [`nana-core-v6/CHANGELOG.md`](./nana-core-v6/CHANGELOG.md) adds preview APIs, mutable token metadata, stronger approval-hook handling, and tighter fee accounting.
- [`nana-721-hook-v6/CHANGELOG.md`](./nana-721-hook-v6/CHANGELOG.md) adds tier splits and moves some previously packed state into a cleaner v6 layout.
- [`nana-buyback-hook-v6/CHANGELOG.md`](./nana-buyback-hook-v6/CHANGELOG.md) moves the buyback path from Uniswap v3 assumptions to a v4 pool-manager design.
- [`nana-suckers-v6/CHANGELOG.md`](./nana-suckers-v6/CHANGELOG.md) widens cross-chain identifiers from `address` to `bytes32`, versions messages, and replaces per-token spam thresholds with a registry fee.
- [`revnet-core-v6/CHANGELOG.md`](./revnet-core-v6/CHANGELOG.md) and [`nana-omnichain-deployers-v6/CHANGELOG.md`](./nana-omnichain-deployers-v6/CHANGELOG.md) both move toward "every project gets a 721 hook" and data-hook composition.
- [`nana-permission-ids-v6/CHANGELOG.md`](./nana-permission-ids-v6/CHANGELOG.md) shifts the numeric permission map. Hardcoded permission numbers from v5 are unsafe.

## Repo Map

| v6 repo | v5 comparison point | What matters most |
| --- | --- | --- |
| `nana-core-v6` | `nana-core-v5` | Preview APIs, token metadata updates, approval-hook hardening, fee-accounting changes |
| `nana-721-hook-v6` | `nana-721-hook-v5` | Tier splits, metadata updates, pricing-context changes |
| `nana-buyback-hook-v6` | `nana-buyback-hook-v5` | Uniswap v4 architecture, registry hardening, cash-out path support |
| `nana-router-terminal-v6` | `nana-swap-terminal-v5` | Router-terminal replacement, route discovery, JB-token cash-out routing |
| `nana-suckers-v6` | `nana-suckers-v5` | `bytes32` remote identifiers, versioned messages, global `toRemoteFee` |
| `revnet-core-v6` | `revnet-core-v5` | Auto 721 deployment, shared buyback/loan configuration, `REVOwner` split |
| `nana-omnichain-deployers-v6` | `nana-omnichain-deployers-v5` | Auto 721 deployment, dual-hook composition, safer ownership flow |
| `croptop-core-v6` | `croptop-core-v5` | Post splits, data-hook proxy activation, stale-tier recovery |
| `banny-retail-v6` | `banny-retail-v5` | Decoration safety fixes, metadata updates, stricter validation |
| `nana-address-registry-v6` | `nana-address-registry-v5` | Nonce encoding fix and zero-address validation |
| `nana-ownable-v6` | `nana-ownable-v5` | Safer `owner()` behavior and stricter project ownership checks |
| `nana-permission-ids-v6` | `nana-permission-ids-v5` | Numeric ID shifts and new permissions |
| `nana-fee-project-deployer-v6` | `nana-fee-project-deployer-v5` | Router-terminal wiring and updated deployment inputs |

## Migration Hotspots

- Replace every swap-terminal reference with router-terminal terminology and APIs.
- Regenerate ABIs from the v6 sources. Several repos changed structs, return values, or event payload shapes.
- Treat cross-chain `address` fields as schema migrations to `bytes32`, not as cosmetic changes.
- Stop hardcoding permission numbers.
- Re-check any code that assumed only some revnet or omnichain projects would have 721 hooks.

## Highest-Signal ABI Shifts

- `nana-core-v6`
  - `IJBTerminal.previewPayFor(...)` and `IJBCashOutTerminal.previewCashOutFrom(...)` are new preview surfaces.
  - `IJBController.setTokenMetadataOf(...)` is new.
  - `IJBController.addPriceFeed(...)` became `addPriceFeedFor(...)`.
- `nana-721-hook-v6`
  - `IJB721TiersHook.pricingContext()` no longer returns an `IJBPrices` instance.
  - `IJB721TiersHook.PRICES()` and `SPLITS()` are explicit getters.
  - `setMetadata(...)` now includes `name` and `symbol`.
- `nana-router-terminal-v6`
  - The swap-terminal configuration surface is gone.
  - Pool discovery is now query-driven through `discoverPool(...)` and `discoverBestPool(...)`.
- `nana-suckers-v6`
  - `beneficiary` and peer/remote identifiers moved to `bytes32`.
  - `prepare(...)` now accepts a `bytes32 beneficiary`.
  - `Claimed` and `InsertToOutboxTree` event payloads changed shape.
- `revnet-core-v6`
  - `deployWith721sFor(...)` is gone.
  - `deployFor(...)` now returns the deployed `IJB721TiersHook`.
  - `REVOwner` is a new runtime address that integrators may need to track.
  - `REVHiddenTokens` lets holders temporarily burn (hide) tokens to boost cash-out value, then re-mint (reveal) them later.
  - `REVLoans.borrowFrom`, `reallocateCollateralFromLoan`, and `repayLoan` now accept a `holder`/`loanOwner` parameter for operator delegation via JBPermissions (IDs 35-39).
  - `REVLoans` no longer takes a `projects` constructor parameter.
- `nana-omnichain-deployers-v6`
  - `launch721ProjectFor(...)`, `launch721RulesetsFor(...)`, and `queue721RulesetsOf(...)` collapsed into overloads using `JBOmnichain721Config`.
  - Hook composition is split into `extraDataHookOf(...)` and `tiered721HookOf(...)`.

## Permission Map Warning

- `QUEUE_RULESETS` no longer also implies `launchRulesetsFor`.
- `LAUNCH_RULESETS` is a new dedicated permission.
- `SET_ROUTER_TERMINAL` replaces the old swap-terminal-specific permissions.
- `SET_SUCKER_DEPRECATION` was split out from `SUCKER_SAFETY`.
- `HIDE_TOKENS` (35), `OPEN_LOAN` (36), `REALLOCATE_LOAN` (37), `REPAY_LOAN` (38), `REVEAL_TOKENS` (39) are new operator delegation permissions for `revnet-core-v6`.

## Excluded Repos

- [`defifa/CHANGELOG.md`](./defifa/CHANGELOG.md)
- [`nana-distributor-v6/CHANGELOG.md`](./nana-distributor-v6/CHANGELOG.md)
- [`nana-project-handles-v6/CHANGELOG.md`](./nana-project-handles-v6/CHANGELOG.md)
- [`nana-project-payer-v6/CHANGELOG.md`](./nana-project-payer-v6/CHANGELOG.md)
- [`univ4-lp-split-hook-v6/CHANGELOG.md`](./univ4-lp-split-hook-v6/CHANGELOG.md)
- [`univ4-router-v6/CHANGELOG.md`](./univ4-router-v6/CHANGELOG.md)

They now have clean repo-local changelogs, but they are intentionally not counted in the deployed v5-to-v6 ecosystem summary.
