# Ecosystem Deep Reference

Use this file after the workspace-level `SKILLS.md` has already routed you to the right area and you need the shared struct, permission, or gotcha context.

## Struct Quick Reference

### JBRulesetConfig

| Field | Type | Notes |
|-------|------|-------|
| `mustStartAtOrAfter` | `uint48` | Earliest start timestamp |
| `duration` | `uint32` | Seconds per cycle. 0 = no expiry, replaced on reconfig |
| `weight` | `uint112` | 18-decimal fixed point. 1 = inherit decayed. 0 = no issuance |
| `weightCutPercent` | `uint32` | Decay per cycle, out of `MAX_WEIGHT_CUT_PERCENT` (1e9) |
| `approvalHook` | `IJBRulesetApprovalHook` | Accepts/rejects proposed rulesets |
| `metadata` | `JBRulesetMetadata` | See below |
| `splitGroups` | `JBSplitGroup[]` | Payout + reserved token splits |
| `fundAccessLimitGroups` | `JBFundAccessLimitGroup[]` | Payout limits + surplus allowances. Empty = zero payouts |

### JBRulesetMetadata

| Field | Type | Notes |
|-------|------|-------|
| `reservedPercent` | `uint16` | Out of `MAX_RESERVED_PERCENT` (10,000) |
| `cashOutTaxRate` | `uint16` | Out of `MAX_CASH_OUT_TAX_RATE` (10,000) |
| `baseCurrency` | `uint32` | Abstract: 1=ETH, 2=USD. NOT token address |
| `pausePay` | `bool` | |
| `pauseCreditTransfers` | `bool` | |
| `allowOwnerMinting` | `bool` | |
| `allowSetCustomToken` | `bool` | |
| `allowTerminalMigration` | `bool` | |
| `allowSetTerminals` | `bool` | |
| `allowSetController` | `bool` | |
| `allowAddAccountingContext` | `bool` | |
| `allowAddPriceFeed` | `bool` | |
| `ownerMustSendPayouts` | `bool` | |
| `holdFees` | `bool` | |
| `useTotalSurplusForCashOuts` | `bool` | |
| `useDataHookForPay` | `bool` | |
| `useDataHookForCashOut` | `bool` | |
| `dataHook` | `address` | Data hook contract |
| `metadata` | `uint16` | 14 usable bits of custom metadata |

### JBSplitGroup

| Field | Type | Notes |
|-------|------|-------|
| `groupId` | `uint256` | Convention: `uint256(uint160(token))` for payouts, `1` for reserved tokens |
| `splits` | `JBSplit[]` | See below |

### JBSplit

| Field | Type | Notes |
|-------|------|-------|
| `percent` | `uint32` | Out of `SPLITS_TOTAL_PERCENT` (1e9) |
| `projectId` | `uint64` | If set, pays this project via its terminal |
| `beneficiary` | `address payable` | Receives tokens. 0 = `msg.sender` |
| `preferAddToBalance` | `bool` | Use `addToBalance` instead of `pay` |
| `lockedUntil` | `uint48` | Timestamp. 0 = unlocked |
| `hook` | `IJBSplitHook` | Highest priority recipient if set |

### JBAccountingContext

| Field | Type | Notes |
|-------|------|-------|
| `token` | `address` | Token address. `NATIVE_TOKEN` for ETH |
| `decimals` | `uint8` | Token decimals for fixed-point math |
| `currency` | `uint32` | `uint32(uint160(token))` by convention |

### JBFundAccessLimitGroup

| Field | Type | Notes |
|-------|------|-------|
| `terminal` | `address` | Terminal contract address |
| `token` | `address` | Token address within that terminal |
| `payoutLimits` | `JBCurrencyAmount[]` | Max payout per currency. `amount: type(uint224).max` = unlimited |
| `surplusAllowances` | `JBCurrencyAmount[]` | Max surplus withdrawal per currency |

### JBPayHookSpecification

| Field | Type | Notes |
|-------|------|-------|
| `hook` | `IJBPayHook` | Hook contract |
| `noop` | `bool` | If true, skip callback (informational only). Must have `amount = 0` |
| `amount` | `uint256` | Tokens to send to hook |
| `metadata` | `bytes` | Arbitrary data passed to hook |

### JBCashOutHookSpecification

| Field | Type | Notes |
|-------|------|-------|
| `hook` | `IJBCashOutHook` | Hook contract |
| `noop` | `bool` | If true, skip callback (informational only). Must have `amount = 0` |
| `amount` | `uint256` | Tokens to send to hook |
| `metadata` | `bytes` | Arbitrary data passed to hook |

## Gotchas

1. **`controllerOf()`** returns `IERC165`, not `address` — cast with `IJBController(address(...))`
2. **`primaryTerminalOf()`** returns `IJBTerminal`, not `address`
3. **`terminalsOf()`** returns `IJBTerminal[]`, not `address[]`
4. **`pricePerUnitOf()`** lives on `IJBPrices`, not `IJBController`
5. **`sendPayoutsOf()`** reverts when amount > payout limit — no auto-cap
6. **`weight = 1`** means inherit decayed weight from previous ruleset; **`weight = 0`** means no issuance
7. **ROOT permission** is ID 1 (not 255)
8. **NFT `discountPercent`** denominator is 200 (not 100) — so `200 = 100% discount = free mint`
9. **Reserved tokens** accumulate in `pendingReservedTokenBalanceOf` — they're NOT auto-distributed, and they dilute cash out values until distributed
10. **Cross-chain token mappings** are immutable after first outbox entry — can only disable, not remap
11. **Defifa delegation** only works during MINT phase — transfers after MINT lose governance power
12. **Defifa `TOTAL_CASHOUT_WEIGHT`** is `1e18` (not basis points)
13. **Defifa `tierCashOutWeights`** is a fixed `uint256[128]` array — max 128 tiers per game
14. **Empty `fundAccessLimitGroups`** means zero payouts, NOT unlimited — must explicitly set `amount: type(uint224).max` for unlimited
15. **`groupId` vs `currency`** are different bit widths — `JBSplitGroup.groupId` is `uint256(uint160(token))`, `JBAccountingContext.currency` is `uint32(uint160(token))`. Only NATIVE_TOKEN matches by coincidence.
16. **`baseCurrency` vs `JBAccountingContext.currency`** — `baseCurrency` uses abstract values (1=ETH, 2=USD) so rulesets are portable across chains. `JBAccountingContext.currency` uses `uint32(uint160(token))` because terminals track specific tokens at specific addresses (USDC has different addresses per chain). `JBPrices` mediates between the two: it converts token-derived currencies to/from abstract currencies (e.g. USDC token -> USD concept, NATIVE_TOKEN -> ETH concept) so that payout limits denominated in USD work correctly regardless of which token the terminal holds.
17. **NFT tiers sorted by category, not price** — `recordAddTiers` reverts with `InvalidCategorySortOrder` if categories aren't ascending
18. **Always use `JB721TiersHookProjectDeployer.launchProjectFor`** even with empty tiers — enables future NFT additions without migration
19. **Don't queue multiple identical rulesets** — a ruleset with `duration` auto-cycles. Only queue multiple when config actually changes between periods.
20. **Revnet loans beat cash-outs above ~39% `cashOutTaxRate`** — below ~39%, cash-out is more capital-efficient (CryptoEconLab finding)
21. **`NATIVE_TOKEN` represents a different token on each chain.** `NATIVE_TOKEN` (`0x000000000000000000000000000000000000EEEe`) is the token received via `msg.value` — ETH on Ethereum/Base/Optimism/Arbitrum, CELO on Celo, etc. Its currency is `uint32(uint160(NATIVE_TOKEN))` = 61166. A `JBMatchingPriceFeed` (returns 1:1) is deployed for `ETH:NATIVE_TOKEN` on ETH-native chains so that `baseCurrency=ETH` resolves correctly to the native token. On non-ETH-native chains, a different price feed would be needed.
22. **Noop hook specifications** are informational-only — `noop = true` + `amount != 0` reverts with `JBTerminalStore_NoopHookSpecHasAmount`. Data hooks (like the buyback hook) use noop specs to return routing diagnostics to preview clients without triggering a hook callback.

## Permission IDs

```
ROOT                     = 1     All permissions. Cannot be set for wildcard projectId=0.
QUEUE_RULESETS           = 2     Queue new rulesets
LAUNCH_RULESETS          = 3     Launch initial rulesets (also requires SET_TERMINALS)
CASH_OUT_TOKENS          = 4     Cash out on behalf of holder
SEND_PAYOUTS             = 5     Trigger payout distribution
MIGRATE_TERMINAL         = 6     Migrate terminal balance
SET_PROJECT_URI          = 7     Set project metadata
DEPLOY_ERC20             = 8     Deploy ERC-20 for project
SET_TOKEN                = 9     Set ERC-20 token
MINT_TOKENS              = 10    Mint project tokens
BURN_TOKENS              = 11    Burn tokens on behalf of holder
CLAIM_TOKENS             = 12    Claim ERC-20 from credits
TRANSFER_CREDITS         = 13    Transfer token credits
SET_CONTROLLER           = 14    Set project controller
SET_TERMINALS            = 15    Set project terminals
ADD_TERMINALS            = 16    Add terminals (implicit via setPrimaryTerminalOf)
SET_PRIMARY_TERMINAL     = 17    Set primary terminal
USE_ALLOWANCE            = 18    Withdraw from surplus allowance
SET_SPLIT_GROUPS         = 19    Configure splits
ADD_PRICE_FEED           = 20    Add price feeds
ADD_ACCOUNTING_CONTEXTS  = 21    Add accepted tokens
SET_TOKEN_METADATA       = 22    Update token name/symbol
ADJUST_721_TIERS         = 23    Modify NFT tiers
SET_721_METADATA         = 24    Set NFT metadata
MINT_721                 = 25    Owner-mint NFTs
SET_721_DISCOUNT_PERCENT = 26    Set tier discounts
SET_BUYBACK_TWAP         = 27    Configure TWAP window
SET_BUYBACK_POOL         = 28    Set buyback pool
SET_BUYBACK_HOOK         = 29    Set buyback hook (also locks)
SET_ROUTER_TERMINAL      = 30    Set router terminal (also locks)
MAP_SUCKER_TOKEN         = 31    Map cross-chain tokens
DEPLOY_SUCKERS           = 32    Deploy sucker pairs
SUCKER_SAFETY            = 33    Emergency hatch control
SET_SUCKER_DEPRECATION   = 34    Deprecate suckers
HIDE_TOKENS              = 35    Hide tokens on behalf of holder (REVHiddenTokens)
OPEN_LOAN                = 36    Open loan on behalf of holder (REVLoans)
REALLOCATE_LOAN          = 37    Reallocate loan collateral on behalf of owner (REVLoans)
REPAY_LOAN               = 38    Repay loan on behalf of owner (REVLoans)
REVEAL_TOKENS            = 39    Reveal hidden tokens on behalf of holder (REVHiddenTokens)
```

## Libraries

| Library | Purpose | Location |
|---------|---------|----------|
| `JBCashOuts` | Bonding curve math + inverse binary search | `nana-core-v6/src/libraries/` |
| `JBFees` | Fee forward/backward calculation | `nana-core-v6/src/libraries/` |
| `JBRulesetMetadataResolver` | 256-bit packed metadata parsing | `nana-core-v6/src/libraries/` |
| `JBMetadataResolver` | Variable-length {id:data} key-value metadata | `nana-core-v6/src/libraries/` |
| `JBFixedPointNumber` | Decimal adjustment between precisions | `nana-core-v6/src/libraries/` |
| `JBSurplus` | Cross-terminal surplus aggregation | `nana-core-v6/src/libraries/` |
| `JBConstants` | Protocol constants (FEE, MAX values) | `nana-core-v6/src/libraries/` |
| `JBSwapLib` | Uniswap quote/swap + TWAP oracle | `nana-buyback-hook-v6/src/libraries/` |
| `MerkleLib` | Incremental merkle tree (eth2-style) | `nana-suckers-v6/src/utils/` |
| `DefifaHookLib` | Cash-out weight, fee tokens, attestation | `defifa/src/libraries/` |

## Contract Sizes

These are helpful for “why was this logic split into a library/deployer/helper?” questions, but should be treated as indicative rather than canonical.

```text
nana-core-v6
  JBMultiTerminal.sol
  JBController.sol
  JBRulesets.sol
  JBTerminalStore.sol

nana-721-hook-v6
  JB721TiersHookStore.sol
  JB721TiersHook.sol

revnet-core-v6
  REVLoans.sol
  REVDeployer.sol

nana-suckers-v6
  JBSucker.sol

univ4-lp-split-hook-v6
  JBUniswapV4LPSplitHook.sol

defifa
  DefifaHook.sol
  DefifaDeployer.sol
  DefifaGovernor.sol

nana-buyback-hook-v6
  JBBuybackHook.sol

deploy-all-v6
  Deploy.s.sol
```
