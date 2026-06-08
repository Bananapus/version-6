# V5 to V6 Ecosystem Changelog

## Scope

This is a V5-to-V6 migration changelog, not a package release log or commit history. It compares the current V6 contract tree against the V5 tree at `../../v5/evm` and highlights the changes that matter to V5 developers, integrators, indexers, and users.

V5's `nana-swap-terminal-v5` maps to V6's `nana-router-terminal-v6`. Several V6 packages did not exist as deployed V5 packages; those are listed as new V6 surfaces instead of being forced into a one-to-one diff.

## Summary

- `nana-swap-terminal-v5` became [`nana-router-terminal-v6/CHANGELOG.md`](./nana-router-terminal-v6/CHANGELOG.md). The model changed from manually configured swap terminals to router terminals with route discovery, previewing, and JB-token cash-out routing.
- [`nana-core-v6/CHANGELOG.md`](./nana-core-v6/CHANGELOG.md) adds preview APIs, mutable token metadata, stronger approval-hook handling, append-only price-feed backups, and tighter fee accounting.
- [`nana-721-hook-v6/CHANGELOG.md`](./nana-721-hook-v6/CHANGELOG.md) adds tier splits, mutable collection metadata, explicit `PRICES()` and `SPLITS()` getters, and new tier/config struct layouts.
- [`nana-buyback-hook-v6/CHANGELOG.md`](./nana-buyback-hook-v6/CHANGELOG.md) moves buyback routing from Uniswap V3 pool assumptions to a V4 pool-manager design with a registry-mediated hook selection model.
- [`nana-suckers-v6/CHANGELOG.md`](./nana-suckers-v6/CHANGELOG.md) widens remote identifiers from `address` to `bytes32`, versions cross-chain messages, changes leaf/event payloads, and moves remote-surplus aggregation into the registry.
- [`revnet-core-v6/CHANGELOG.md`](./revnet-core-v6/CHANGELOG.md) and [`nana-omnichain-deployers-v6/CHANGELOG.md`](./nana-omnichain-deployers-v6/CHANGELOG.md) move toward "every project gets a 721 hook" and split hook composition between data hooks and tiered 721 hooks.
- [`nana-permission-ids-v6/CHANGELOG.md`](./nana-permission-ids-v6/CHANGELOG.md) changes the numeric permission map. V5 hardcoded permission IDs are not safe in V6.

## Repo Map

| V6 repo | V5 comparison point | Migration signal |
| --- | --- | --- |
| `nana-core-v6` | `nana-core-v5` | Preview APIs, token metadata updates, approval-hook hardening, price-feed backup lists, fee-accounting changes |
| `nana-721-hook-v6` | `nana-721-hook-v5` | Tier splits, mutable collection metadata, pricing-context changes, struct-layout changes |
| `nana-buyback-hook-v6` | `nana-buyback-hook-v5` | Uniswap V4 architecture, chain-specific constants setter, registry default-hook behavior, cash-out metadata |
| `nana-router-terminal-v6` | `nana-swap-terminal-v5` | Router-terminal replacement, route discovery, previewing, JB-token cash-out routing |
| `nana-suckers-v6` | `nana-suckers-v5` | `bytes32` remote identifiers, versioned messages, changed leaf/event schemas, registry-level remote-surplus reads |
| `revnet-core-v6` | `revnet-core-v5` | Default 721 deployment, `REVOwner` runtime split, shared buyback/loan configuration, operator loan delegation |
| `nana-omnichain-deployers-v6` | `nana-omnichain-deployers-v5` | 721 config folded into launch/queue overloads, separate extra data hook and tiered 721 hook views |
| `croptop-core-v6` | `croptop-core-v5` | Post splits, token-aware publisher payments, Permit2 support, data-hook deployment path |
| `banny-retail-v6` | `banny-retail-v5` | Metadata setter changes, renamed hash setter, stricter validation, safer decoration fallback handling |
| `defifa` | `defifa-v5` | `DefifaDelegate` became `DefifaHook`, chain constants became constructor immutables, project-owner helper removed |
| `nana-address-registry-v6` | `nana-address-registry-v5` | CREATE nonce encoding fix and zero-address validation |
| `nana-ownable-v6` | `nana-ownable-v5` | Safer `owner()` behavior when project ownership cannot be read; stricter project ownership transfer checks |
| `nana-permission-ids-v6` | `nana-permission-ids-v5` | Numeric ID shifts and new permissions for router terminals, suckers, ERC-1271, and revnet loan operators |
| `nana-fee-project-deployer-v6` | `nana-fee-project-deployer-v5` | V6 deployment wiring, router-terminal registry input, updated sibling package addresses |
| `deploy-all-v6` | no direct deployed V5 package | Canonical V6 deployment/artifact package for the full ecosystem |
| `nana-distributor-v6` | no deployed V5 package | New vesting/reward distributor contracts |
| `nana-project-handles-v6` | no deployed V5 package | New project-handle registry/resolver |
| `nana-project-payer-v6` | no deployed V5 package | New project payer and payer deployer |
| `univ4-router-v6` | `nana-uni-v4-util-v5` | V6 preview-driven V4/Juicebox routing, updated route events, stronger swap guards |
| `univ4-lp-split-hook-v6` | `nana-lp-split-hook-v5` | V3 deployment split hook replaced by V4 LP split hook clones and post-deploy liquidity growth |
| `archive/nana-referral-split-hook-v6` | no deployed V5 package | Archived V6 referral split hook, included for source-tree completeness |

## Machine-Checked Coverage

Generated from each package's own-source Foundry artifacts under `out/**/*.json`, filtered to runtime source roots and excluding tests, scripts, and dependencies. Script-only packages are listed with zero runtime ABI artifacts.

| V6 repo | V5 comparison | V6/V5 ABI artifacts | Added | Removed | Changed shared | Unchanged shared | ABI item deltas |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `nana-core-v6` | `nana-core-v5` | `66` / `63` | `4` | `1` | `32` | `30` | +147 / -82 / modified 13 |
| `nana-721-hook-v6` | `nana-721-hook-v5` | `21` / `31` | `5` | `15` | `11` | `5` | +90 / -60 / modified 17 |
| `nana-buyback-hook-v6` | `nana-buyback-hook-v5` | `6` / `5` | `2` | `1` | `4` | `0` | +72 / -44 / modified 5 |
| `nana-router-terminal-v6` | `nana-swap-terminal-v5` | `13` / `6` | `12` | `5` | `0` | `1` | +0 / -0 / modified 0 |
| `nana-suckers-v6` | `nana-suckers-v5` | `52` / `31` | `21` | `0` | `17` | `14` | +342 / -160 / modified 19 |
| `revnet-core-v6` | `revnet-core-v5` | `7` / `13` | `3` | `9` | `4` | `0` | +68 / -79 / modified 8 |
| `nana-omnichain-deployers-v6` | `nana-omnichain-deployers-v5` | `6` / `4` | `2` | `0` | `2` | `2` | +29 / -19 / modified 1 |
| `croptop-core-v6` | `croptop-core-v5` | `6` / `11` | `0` | `5` | `4` | `2` | +38 / -16 / modified 4 |
| `banny-retail-v6` | `banny-retail-v5` | `2` / `2` | `0` | `0` | `2` | `0` | +37 / -30 / modified 0 |
| `defifa` | `defifa-v5` | `12` / `19` | `3` | `10` | `6` | `3` | +61 / -50 / modified 1 |
| `nana-address-registry-v6` | `nana-address-registry-v5` | `2` / `2` | `0` | `0` | `1` | `1` | +4 / -0 / modified 0 |
| `nana-ownable-v6` | `nana-ownable-v5` | `3` / `3` | `0` | `0` | `2` | `1` | +6 / -4 / modified 0 |
| `nana-permission-ids-v6` | `nana-permission-ids-v5` | `1` / `1` | `0` | `0` | `0` | `1` | +0 / -0 / modified 0 |
| `nana-fee-project-deployer-v6` | `nana-fee-project-deployer-v5` | `0` / `0` | `0` | `0` | `0` | `0` | +0 / -0 / modified 0 |
| `deploy-all-v6` | `jb-deploy-v6` | `0` / `0` | `0` | `0` | `0` | `0` | +0 / -0 / modified 0 |
| `nana-distributor-v6` | `new V6 surface` | `7` / `0` | `7` | `0` | `0` | `0` | +0 / -0 / modified 0 |
| `nana-project-handles-v6` | `new V6 surface` | `2` / `0` | `2` | `0` | `0` | `0` | +0 / -0 / modified 0 |
| `nana-project-payer-v6` | `new V6 surface` | `5` / `0` | `5` | `0` | `0` | `0` | +0 / -0 / modified 0 |
| `univ4-router-v6` | `nana-uni-v4-util-v5` | `2` / `5` | `0` | `3` | `2` | `0` | +19 / -25 / modified 2 |
| `univ4-lp-split-hook-v6` | `nana-lp-split-hook-v5` | `8` / `2` | `8` | `2` | `0` | `0` | +0 / -0 / modified 0 |
| `archive/nana-referral-split-hook-v6` | `new V6 surface` | `2` / `0` | `2` | `0` | `0` | `0` | +0 / -0 / modified 0 |

This table is coverage metadata, not a substitute for the package-specific migration notes. The package changelogs below include the artifact names and per-contract/interface ABI item counts used to verify each comparison.

## Migration Hotspots

- Replace swap-terminal terminology and ABI assumptions with router-terminal terminology and APIs.
- Regenerate ABIs from the V6 sources. V6 changes function names, return values, struct layouts, events, and custom errors across multiple packages.
- Treat cross-chain `address` fields that became `bytes32` as schema migrations, not cosmetic type changes.
- Stop hardcoding permission numbers. Use `JBPermissionIds` from the V6 package.
- Re-check any deployment/indexing code that assumed revnet or omnichain 721 hooks were optional special cases.
- Re-index events from V6 ABIs. Some packages add new events, and several V5 event payload assumptions no longer hold.

## Highest-Signal ABI Shifts

- `nana-core-v6`
  - `IJBTerminal.previewPayFor(...)`, `IJBCashOutTerminal.previewCashOutFrom(...)`, and terminal-store preview calls are new.
  - `IJBController.setTokenMetadataOf(...)` and `previewMintOf(...)` are new.
  - `IJBController.addPriceFeed(...)` was renamed to `addPriceFeedFor(...)`.
  - `IJBTerminal.currentSurplusOf(...)` changed parameter shape.
- `nana-721-hook-v6`
  - `IJB721TiersHook.pricingContext()` no longer returns an `IJBPrices` instance.
  - `IJB721TiersHook.PRICES()` and `SPLITS()` are explicit getters.
  - `setMetadata(...)` now includes `name` and `symbol`.
  - `JB721TierConfig`, `JB721Tier`, and `JBStored721Tier` are not V5-compatible struct layouts.
- `nana-router-terminal-v6`
  - `IJBSwapTerminal` is replaced by `IJBRouterTerminal`.
  - The old swap-terminal pool/TWAP configuration surface is gone.
  - Pool discovery is query-driven through `discoverPool(...)` and `discoverBestPool(...)`.
- `nana-suckers-v6`
  - `beneficiary`, peer, and remote identifiers moved to `bytes32`.
  - `prepare(...)` accepts a `bytes32 beneficiary`.
  - `Claimed` and `InsertToOutboxTree` event payloads changed.
- `revnet-core-v6`
  - `deployWith721sFor(...)` is gone.
  - `deployFor(...)` overloads return the deployed `IJB721TiersHook`.
  - `REVOwner` is a new runtime address and interface.
  - `REVLoans.borrowFrom(...)` takes a `holder`; borrow, reallocate, and repay flows support operator delegation through V6 permission IDs.
- `nana-omnichain-deployers-v6`
  - `launch721ProjectFor(...)`, `launch721RulesetsFor(...)`, and `queue721RulesetsOf(...)` collapsed into overloads using `JBOmnichain721Config`.
  - Hook composition is split into `extraDataHookOf(...)` and `tiered721HookOf(...)`.

## Permission Map Warning

- `QUEUE_RULESETS` no longer also implies `launchRulesetsFor`.
- `LAUNCH_RULESETS` is a dedicated permission.
- `SET_ROUTER_TERMINAL` replaces the old swap-terminal-specific permissions.
- `SET_SUCKER_DEPRECATION` is split out from the broader sucker-safety permission.
- `OPEN_LOAN` (37), `REALLOCATE_LOAN` (38), and `REPAY_LOAN` (39) are new revnet operator-delegation permissions.
