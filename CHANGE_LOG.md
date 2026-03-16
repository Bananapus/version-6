# V5 → V6 Change Log

What changed from Juicebox V5 to V6, and why it matters.

## Headline Changes

### Swap Terminal → Router Terminal

`JBSwapTerminal` is now `JBRouterTerminal`. No more manual pool/TWAP configuration — the terminal auto-discovers the best Uniswap V3 or V4 pool at swap time and auto-resolves which token the destination project accepts. It can also cash out JB project tokens as an intermediate step, enabling token-to-token routing across projects.

See [nana-router-terminal-v6/CHANGE_LOG.md](./nana-router-terminal-v6/CHANGE_LOG.md) for details.

### Buyback Hook → Uniswap V4

The buyback hook was rewritten from Uniswap V3 to V4. All swap logic now goes through V4's `IPoolManager` singleton. The slippage algorithm changed from a 9-tier step function to a continuous sigmoid curve. TWAP queries use V4 oracle hooks instead of V3's `OracleLibrary`. The shared swap math lives in a new `JBSwapLib` library used by both the buyback hook and router terminal.

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

### Cross-Chain: `address` → `bytes32`

All cross-chain identifiers changed from `address` to `bytes32` to prepare for Solana/SVM support. `JBLeaf.beneficiary`, `JBMessageRoot.token`, `JBRemoteToken.addr`, `JBSuckersPair.remote` — all `bytes32` now. Messages also gained a `version` field for future-proofing.

See [nana-suckers-v6/CHANGE_LOG.md](./nana-suckers-v6/CHANGE_LOG.md) for details.

## Core Protocol Changes

Full details: [nana-core-v6/CHANGE_LOG.md](./nana-core-v6/CHANGE_LOG.md)

**Breaking interface changes:**
- `IJBRulesetApprovalHook.approvalStatusOf` takes a full `JBRuleset` struct instead of separate params
- `IJBRulesetDataHook.hasMintPermissionFor` gained a `JBRuleset` parameter
- `IJBPayoutTerminal.sendPayoutsOf` return value changed to `amountPaidOut`
- `JBController4_1` and `IJBController4_1` merged into base contracts
- `JBCurrencyIds.USD` changed from `3` to `2`

**New capabilities:**
- `setTokenMetadataOf` — mutable ERC-20 name/symbol after deployment
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

## Per-Repo Changes

| Repo | Key changes | Changelog |
|------|------------|-----------|
| nana-core-v6 | Approval hook try/catch, mutable token metadata, inverse bonding curve, migration callback, weight cache at 20k | [CHANGE_LOG.md](./nana-core-v6/CHANGE_LOG.md) |
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
| defifa-collection-deployer-v6 | Unchanged from V5 architecture | — |
| deploy-all-v6 | Updated to deploy all V6 contracts | — |

## Universal Changes

All repos: Solidity 0.8.23 → 0.8.26. EVM target: cancun (TSTORE/TLOAD). Many `memory` params → `calldata` for gas efficiency. Error messages enriched with context parameters throughout.
