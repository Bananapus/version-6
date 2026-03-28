# V5 → V6 Change Log

What changed from Juicebox V5 to V6, and why it matters.

## Headline Changes

### Swap Terminal → Router Terminal

`JBSwapTerminal` is now `JBRouterTerminal`. No more manual pool/TWAP configuration — the terminal auto-discovers the best Uniswap V3 or V4 pool at swap time and auto-resolves which token the destination project accepts. It can also cash out JB project tokens as an intermediate step, enabling token-to-token routing across projects.

See [nana-router-terminal-v6/CHANGE_LOG.md](./nana-router-terminal-v6/CHANGE_LOG.md) for details.

### Buyback Hook → Uniswap V4

The buyback hook was rewritten from Uniswap V3 to V4. All swap logic now goes through V4's `IPoolManager` singleton. The slippage algorithm changed from a 9-tier step function to a continuous sigmoid curve. TWAP queries use V4 oracle hooks instead of V3's `OracleLibrary`. The shared swap math lives in a new `JBSwapLib` library used by both the buyback hook and router terminal.

**Sell-side cash out optimization:** The buyback hook now also implements `IJBCashOutHook` and optimizes sell-side cash outs. `beforeCashOutRecordedWith` compares the protocol's bonding curve reclaim value against selling reminted tokens into the Uniswap V4 pool. If the pool route is better, the hook executes the sell via `afterCashOutRecordedWith`. If the protocol cash out wins, the hook returns a noop specification with routing metadata so preview clients can still inspect the comparison.

See [nana-buyback-hook-v6/CHANGE_LOG.md](./nana-buyback-hook-v6/CHANGE_LOG.md) for details.

### New: UniV4 LP Split Hook + UniV4 Router

Two new repos for Uniswap V4 integration:

- **univ4-lp-split-hook-v6** — Split hook that accumulates reserved tokens and deploys them into UniV4 concentrated liquidity positions bounded by issuance and cash-out rates.
- **univ4-router-v6** — Uniswap V4 hook with custom swap logic and oracle tracking (TruncGeoOracle) for buyback integration.

These are new to V6 — no V5 equivalents.

### 721 Hook: Tier Splits

NFT tiers can now define a `splitPercent` and `JBSplit[]` recipients. When a tier is minted, a portion of the payment routes to those split recipients before entering the project treasury. Minting weight scales accordingly (optionally via `issueTokensForSplits` flag). A new `JB721TiersHookLib` library was extracted to stay within contract size limits.

See [nana-721-hook-v6/CHANGE_LOG.md](./nana-721-hook-v6/CHANGE_LOG.md) for details.

### Every Revnet Gets a 721 Hook

`REVDeployer.deployWith721sFor()` is gone. Both `deployFor` overloads now auto-deploy a 721 hook, even without tiers. The omnichain deployer follows the same pattern — every project gets a 721 hook by default. This means any revnet can add NFT tiers later without migration.

See [revnet-core-v6/CHANGE_LOG.md](./revnet-core-v6/CHANGE_LOG.md) and [nana-omnichain-deployers-v6/CHANGE_LOG.md](./nana-omnichain-deployers-v6/CHANGE_LOG.md).

### Omnichain Deployer as Data Hook Proxy

`JBOmnichainDeployer` now sets itself as the data hook and proxies to the stored 721 hook and any extra data hook. This enables dual-hook composition: the 721 hook contributes tier split specs while the extra data hook (e.g., buyback) contributes weight adjustment. The same pattern is used by `CTDeployer` for Croptop.

### Mutable Token Names

Project owners can now change ERC-20 and 721 collection names and symbols after deployment. `JBController.setTokenMetadataOf` updates the ERC-20 via `JBERC20.setMetadata`. The 721 hook's `setMetadata` updates the collection name and symbol. Both gated by the new `SET_TOKEN_METADATA` (21) permission.

### Cross-Chain: `address` → `bytes32`

All cross-chain identifiers changed from `address` to `bytes32` to prepare for Solana/SVM support. `JBLeaf.beneficiary`, `JBMessageRoot.token`, `JBRemoteToken.addr`, `JBSuckersPair.remote` — all `bytes32` now. Messages also gained a `version` field for future-proofing.

See [nana-suckers-v6/CHANGE_LOG.md](./nana-suckers-v6/CHANGE_LOG.md) for details.

## Core Protocol Changes

Full details: [nana-core-v6/CHANGE_LOG.md](./nana-core-v6/CHANGE_LOG.md)

**Breaking interface changes:**
- `IJBRulesets.updateRulesetWeightCache` gained a `rulesetId` parameter
- `IJBPayoutTerminal.sendPayoutsOf` return value changed to `amountPaidOut`
- Several interfaces changed `memory` params to `calldata`

**Migration examples:**

```solidity
// updateRulesetWeightCache — V5 vs V6
// V5: rulesets.updateRulesetWeightCache(projectId)
// V6: rulesets.updateRulesetWeightCache(projectId, rulesetId)
//     rulesetId = the specific ruleset to cache from (use currentOf().id)

// sendPayoutsOf — V5 vs V6
// V5: uint256 netLeftoverPayoutAmount = terminal.sendPayoutsOf(projectId, token, amount, currency, minTokensPaidOut);
// V6: uint256 amountPaidOut = terminal.sendPayoutsOf(projectId, token, amount, currency, minTokensPaidOut);
//     Return value changed from leftover to total paid out.

// deployWith721sFor — removed in V6
// V5: revDeployer.deployWith721sFor(revnetId, config, terminals, suckers, tiered721Config)
// V6: revDeployer.deployFor(revnetId, config, terminals, suckers, tiered721Config, allowedPosts)
//     Both deployFor overloads now auto-deploy a 721 hook. Use the 6-arg version for configured tiers.
```

**New capabilities:**
- `previewPayFrom` / `previewCashOutFrom` — `view` functions on `JBTerminalStore` that simulate the full payment or cash out on-chain, including data hook effects. Terminal-level wrappers (`JBMultiTerminal.previewPayFor`, `JBMultiTerminal.previewCashOutFrom`) compose the store previews with mint token splitting. Useful for UIs and integrations to preview exact outcomes before sending a transaction.
- Noop hook specifications — `JBPayHookSpecification` and `JBCashOutHookSpecification` gained a `bool noop` field. When `noop = true`, the terminal skips the hook callback but the spec remains available to preview clients. The store enforces `noop = true` + `amount != 0` reverts (`JBTerminalStore_NoopHookSpecHasAmount`). The buyback hook uses noop specs to return routing diagnostics (TWAP tick, liquidity, pool ID) when the protocol path wins.
- `setTokenMetadataOf` — mutable ERC-20 and 721 name/symbol after deployment (new `SET_TOKEN_METADATA` permission)
- `JBCashOuts.minCashOutCountFor` — inverse bonding curve (binary search for minimum tokens needed)
- `IJBMigratable.afterReceiveMigrationFrom` — callback after migration
- `LAUNCH_RULESETS` permission (separated from `QUEUE_RULESETS`)

**Security hardening:**
- Approval hooks wrapped in try/catch (reverting hook returns `Failed` instead of freezing project)
- `processHeldFeesOf` re-reads storage index each iteration, deletes before external call
- `JBTokens.mintFor` checks uint208 overflow before minting
- Multiple `JBMetadataResolver` assembly fixes

**Weight cache:** Threshold increased from 1,000 to 20,000 iterations. Exceeding now reverts with `JBRulesets_WeightCacheRequired`.

## Permission ID Shifts

Full details: [nana-permission-ids-v6/CHANGE_LOG.md](./nana-permission-ids-v6/CHANGE_LOG.md)

Every numeric permission ID shifted due to `LAUNCH_RULESETS` insertion at position 3. **Any code hardcoding numeric IDs will silently break.** Use the named constants.

New IDs: `LAUNCH_RULESETS` (3), `SET_TOKEN_METADATA` (21), `SET_BUYBACK_HOOK` (28), `SET_ROUTER_TERMINAL` (29), `SET_SUCKER_DEPRECATION` (33). Total: 30 → 33.

Removed: `ADD_SWAP_TERMINAL_POOL`, `ADD_SWAP_TERMINAL_TWAP_PARAMS` (functions no longer exist).

## Integration Hotspots

If you are migrating an integration rather than a single repo, these are the highest-signal changes to check first:

- **Functions and call sites**: `launchRulesetsFor`, `updateRulesetWeightCache`, `sendPayoutsOf`, `deployFor`, `beforePayRecordedWith`, `beforeCashOutRecordedWith`, `setTokenMetadataOf`, `setTerminalFor`, `setHookFor`, `lockTerminalFor`, `lockHookFor`.
- **Structs and ABI decoding**: `JBPayHookSpecification`, `JBCashOutHookSpecification`, `JBBeforeCashOutRecordedContext`, `JB721TierConfig`, `JBStored721Tier`, `JBMessageRoot`, `JBRemoteToken`, `JBTokenMapping`.
- **Events to re-index**: router-terminal registry events, buyback-hook pool events, `SetTokenMetadata`, new preview/noop-related hook metadata patterns, and all sucker events whose beneficiary/token fields changed from `address` to `bytes32`.
- **Errors to handle explicitly**: `JBRulesets_WeightCacheRequired`, noop-hook validation errors in `JBTerminalStore`, router-terminal slippage/pool discovery errors, buyback-hook V4 pool validation errors, and sucker message-version / fee errors.

For most integrators, the fastest safe migration path is:
- replace raw permission numbers with `JBPermissionIds` constants;
- update any hand-decoded hook metadata structs;
- update cross-chain code from `address` to `bytes32`;
- update swap-terminal references to router-terminal references;
- re-check any indexer schemas built around renamed or widened event fields.

## ABI Migration Map

If your main concern is ABI compatibility, group the repos like this:

| ABI category | Repos | What to expect |
|---|---|---|
| **Major ABI changes** | `nana-core-v6`, `nana-721-hook-v6`, `nana-buyback-hook-v6`, `nana-router-terminal-v6`, `nana-suckers-v6`, `revnet-core-v6`, `nana-omnichain-deployers-v6`, `croptop-core-v6`, `defifa-collection-deployer-v6` | Function signatures changed, struct layouts changed, events/errors changed or widened |
| **Targeted ABI changes** | `banny-retail-v6`, `nana-ownable-v6` | Smaller but still relevant event/function/error updates |
| **ABI-stable or nearly ABI-stable** | `nana-address-registry-v6` | External function signatures unchanged; behavior and one error changed |
| **No runtime ABI focus** | `nana-permission-ids-v6`, `nana-fee-project-deployer-v6`, `deploy-all-v6` | Main migration work is constants/scripts/deployment artifacts, not runtime contract ABI |

ABI migration checklist:
- re-generate ABIs from v6 sources instead of diffing by hand;
- update any off-chain decoders for widened structs/events/errors;
- re-check return-value changes, not just parameter changes;
- treat `address` → `bytes32` changes as schema changes, not cosmetic changes;
- treat renamed contracts/interfaces as new ABI surfaces even when product concepts are similar.

## Indexer Migration Guide

If one of the main v5 integrations was an event-indexing pipeline or subgraph, the biggest v6 correlations to handle are:

- **Renamed event families**:
  - swap-terminal registry events moved to router-terminal registry events
  - buyback events now describe V4 pool identity, not V3 pool addresses
- **Widened payloads**:
  - many admin/configuration events now include `caller`
  - several config structs embedded in events have new fields (`JB721TierConfig`, `CTPost`, `CTAllowedPost`, `JBTokenMapping`)
- **Changed identifier types**:
  - cross-chain beneficiary/token/remote fields moved from `address` to `bytes32`
- **Changed topology**:
  - deploy flows now auto-provision 721 hooks in more places
  - Defifa is part of canonical v6 rollouts

Recommended indexing order:

1. Start with [nana-core-v6/CHANGE_LOG.md](./nana-core-v6/CHANGE_LOG.md), [nana-permission-ids-v6/CHANGE_LOG.md](./nana-permission-ids-v6/CHANGE_LOG.md), and [nana-suckers-v6/CHANGE_LOG.md](./nana-suckers-v6/CHANGE_LOG.md) to update shared entity schemas.
2. Port payment and hook surfaces from [nana-721-hook-v6/CHANGE_LOG.md](./nana-721-hook-v6/CHANGE_LOG.md), [nana-buyback-hook-v6/CHANGE_LOG.md](./nana-buyback-hook-v6/CHANGE_LOG.md), and [nana-router-terminal-v6/CHANGE_LOG.md](./nana-router-terminal-v6/CHANGE_LOG.md).
3. Port deployer/product overlays from [revnet-core-v6/CHANGE_LOG.md](./revnet-core-v6/CHANGE_LOG.md), [nana-omnichain-deployers-v6/CHANGE_LOG.md](./nana-omnichain-deployers-v6/CHANGE_LOG.md), [croptop-core-v6/CHANGE_LOG.md](./croptop-core-v6/CHANGE_LOG.md), [banny-retail-v6/CHANGE_LOG.md](./banny-retail-v6/CHANGE_LOG.md), and [defifa-collection-deployer-v6/CHANGE_LOG.md](./defifa-collection-deployer-v6/CHANGE_LOG.md).

## Per-Repo Changes

| Repo | Key changes | Changelog |
|------|------------|-----------|
| nana-core-v6 | Approval hook try/catch, mutable token metadata, inverse bonding curve, reentrancy hardening, weight cache at 20k | [CHANGE_LOG.md](./nana-core-v6/CHANGE_LOG.md) |
| nana-permission-ids-v6 | All IDs shifted, 3 new IDs, 2 removed | [CHANGE_LOG.md](./nana-permission-ids-v6/CHANGE_LOG.md) |
| nana-721-hook-v6 | Tier splits with split recipients, extracted library, mutable name/symbol | [CHANGE_LOG.md](./nana-721-hook-v6/CHANGE_LOG.md) |
| nana-buyback-hook-v6 | V3 → V4, sigmoid slippage, JBSwapLib, pool key storage | [CHANGE_LOG.md](./nana-buyback-hook-v6/CHANGE_LOG.md) |
| nana-suckers-v6 | address → bytes32, message versioning, Celo sucker, empty outbox guard | [CHANGE_LOG.md](./nana-suckers-v6/CHANGE_LOG.md) |
| nana-omnichain-deployers-v6 | Auto 721 hook, data hook proxy, dual-hook composition, API consolidation | [CHANGE_LOG.md](./nana-omnichain-deployers-v6/CHANGE_LOG.md) |
| revnet-core-v6 | Auto 721 hook, immutable buyback/loans, permission flag inversion, burnHeldTokensOf | [CHANGE_LOG.md](./revnet-core-v6/CHANGE_LOG.md) |
| nana-router-terminal-v6 | Renamed from swap terminal, auto pool discovery, V3+V4 dual support, JB token cashout routing | [CHANGE_LOG.md](./nana-router-terminal-v6/CHANGE_LOG.md) |
| croptop-core-v6 | Split percent on posts, data hook proxy pattern, duplicate detection, fee evasion fix | [CHANGE_LOG.md](./croptop-core-v6/CHANGE_LOG.md) |
| banny-retail-v6 | Fault-tolerant transfers, dynamic metadata, body category validation | [CHANGE_LOG.md](./banny-retail-v6/CHANGE_LOG.md) |
| nana-ownable-v6 | Defensive try/catch on ownerOf, project existence validation | [CHANGE_LOG.md](./nana-ownable-v6/CHANGE_LOG.md) |
| nana-address-registry-v6 | Nonce range extended to uint64 (was silently wrong above uint32) | [CHANGE_LOG.md](./nana-address-registry-v6/CHANGE_LOG.md) |
| nana-fee-project-deployer-v6 | Buyback/721 config removed (auto-configured), swap → router terminal | [CHANGE_LOG.md](./nana-fee-project-deployer-v6/CHANGE_LOG.md) |
| univ4-lp-split-hook-v6 | **New in V6** — LP split hook for UniV4 concentrated liquidity | — |
| univ4-router-v6 | **New in V6** — UniV4 hook with oracle tracking | — |
| defifa-collection-deployer-v6 | Defifa hook/deployer upgraded onto V6 core + 721 hook APIs, error prefixes standardized, `noop`-aware cash-out specs | [CHANGE_LOG.md](./defifa-collection-deployer-v6/CHANGE_LOG.md) |
| deploy-all-v6 | Canonical V6 rollout script with 10 phases, including Defifa, V4 stack, suckers, and router terminal deployment | [CHANGE_LOG.md](./deploy-all-v6/CHANGE_LOG.md) |

## Universal Changes

All repos: Solidity 0.8.23 → 0.8.28. EVM target: cancun (TSTORE/TLOAD). Many `memory` params → `calldata` for gas efficiency. Error messages enriched with context parameters throughout.
