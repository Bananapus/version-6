# Developer Navigation

Fast-access reference for finding anything in the V6 ecosystem. Use this when you need to trace a flow, find a function, debug an error, or understand how contracts interact.

Deployed addresses: see `deploy-all-v6/broadcast/` or check each repo's deployment artifacts.

## Find by Flow

| Flow | Entry Point | Key Logic |
|------|------------|-----------|
| Payment | `JBMultiTerminal._pay()` | `JBTerminalStore.recordPaymentFrom()` — weight calc, data hook override, then `JBController.mintTokensOf()`, then pay hooks |
| Cash out | `JBMultiTerminal._cashOutTokensOf()` | `JBTerminalStore.recordCashOutFor()` — bonding curve, data hook override |
| Payout distribution | `JBMultiTerminal.sendPayoutsOf()` | Splits loop via `executePayout()` |
| Surplus calculation | `JBTerminalStore._tokenSurplusFrom()` | Cross-terminal aggregation via `JBSurplus` |
| Bonding curve | `JBCashOuts.cashOutFrom()` | `base * [(MAX-tax) + tax*(count/supply)] / MAX` |
| Token minting | `JBController.mintTokensOf()` | Reserved accumulation in `pendingReservedTokenBalanceOf` |
| Reserved distribution | `JBController._sendReservedTokensToSplitsOf()` | Mints then distributes to splits |
| Ruleset queuing | `JBRulesets.queueFor()` | Linked list via `basedOnId` |
| Weight decay | `JBRulesets.deriveWeightFrom()` | Cache required after 20k cycles |
| Permission check | `JBPermissions.hasPermission()` | 256-bit packed, ROOT=1 grants all |
| Fee processing | `JBMultiTerminal._processFee()` | 2.5% to project #1, 28-day hold |
| Held fee return | `JBMultiTerminal.processHeldFeesOf()` | Sequential from `_nextHeldFeeIndexOf` |
| Preview payment | `JBTerminalStore.previewPayFrom()` | Simulates payment (view). Returns token count + hook specs |
| Preview cash out | `JBTerminalStore.previewCashOutFrom()` | Simulates cash out (view). Returns reclaim amount, tax rate, hook specs |
| Data hook (pay) | `JBTerminalStore.recordPaymentFrom()` | Hook overrides weight + specifies pay hooks |
| Data hook (cashout) | `JBTerminalStore.recordCashOutFor()` | Hook overrides tax rate, count, supply |
| Custom hook | Implement `IJBPayHook` or `IJBCashOutHook` | For economics override, implement `IJBRulesetDataHook`. See `JB721TiersHook` (pay+cashout) or `JBBuybackHook` (data hook). Set per-ruleset in metadata. |
| Deploy a project | `JBController.launchProjectFor()` | For revnets: `REVDeployer.deployFor()`. For Croptop: `CTDeployer`. For Defifa: `DefifaDeployer.launchGameWith()`. |
| NFT tier mint | `JB721TiersHookStore.recordMint()` | Tier selection by price, supply cap check |
| Buyback decision | `JBBuybackHook._getQuote()` | TWAP oracle query, mint vs swap |
| Loan creation | `REVLoans.borrowFrom()` | Collateral lock, bonding curve valuation |
| Cross-chain prepare | `JBSucker.prepare()` | Cash out + insert into outbox merkle tree |
| Cross-chain claim | `JBSucker.claim()` | Verify merkle proof + mint/transfer |
| LP pool deploy | `JBUniswapV4LPSplitHook.deployPool()` | Concentrated liquidity from accumulated tokens |
| Defifa game launch | `DefifaDeployer.launchGameWith()` | Creates project + queues phase rulesets |
| Defifa scorecard | `DefifaGovernor.submitScorecardFor()` | Allocates `TOTAL_CASHOUT_WEIGHT` (1e18) across tiers |
| Defifa attestation | `DefifaGovernor.attestToScorecardFrom()` | Per-tier power, capped at 1e9 |
| Defifa ratification | `DefifaGovernor.ratifyScorecardFrom()` | Quorum = 50% of eligible attestation power |
| Defifa cash-out weight | `DefifaHookLib.computeCashOutWeight()` | `weight / tokens` — integer truncation |
| Defifa game phase | `DefifaDeployer.currentGamePhaseOf()` | COUNTDOWN -> MINT -> REFUND -> SCORING -> COMPLETE |
| Full ecosystem deploy | `deploy-all-v6/script/Deploy.s.sol` | 9-phase Sphinx deployment across 8 chains |

All paths in `nana-core-v6/src/` unless noted otherwise.

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

## Find by File Pattern

| Looking for | Pattern |
|------------|---------|
| Main contracts | `*/src/*.sol` (exclude `interfaces/`, `structs/`, `enums/`, `libraries/`) |
| Interfaces | `*/src/interfaces/I*.sol` |
| Structs | `*/src/structs/JB*.sol` or `*/src/structs/REV*.sol` |
| Libraries | `*/src/libraries/JB*.sol` |
| Tests | `*/test/**/*.sol` |
| Deploy scripts | `*/script/Deploy*.s.sol` |
| Config | `*/foundry.toml` |
| Dependencies | `*/package.json` (npm) or `*/remappings.txt` (forge) |

## Find by Error

| Error | Where | What happened |
|-------|-------|---------------|
| `InsufficientTokens` | JBTerminalStore | Cash out count > total supply |
| `InadequateTerminalStoreBalance` | JBTerminalStore | Withdrawal > recorded balance |
| `InadequateControllerPayoutLimit` | JBTerminalStore | Payout > configured limit |
| `RulesetPaymentPaused` | JBTerminalStore | Ruleset has payments paused |
| `RulesetNotFound` | JBTerminalStore | No active ruleset for project |
| `UnderMinTokensReclaimed` | JBMultiTerminal | Cash out slippage exceeded |
| `UnderMinReturnedTokens` | JBMultiTerminal | Payment slippage exceeded |
| `TokenNotAccepted` | JBMultiTerminal | Token not in accounting contexts |
| `CreditTransfersPaused` | JBController | Ruleset pauses credit transfers |
| `RulesetsAlreadyLaunched` | JBController | Can't launch twice |
| `WeightCacheRequired` | JBRulesets | >20k cycles without cache update |
| `NoopHookSpecHasAmount` | JBTerminalStore | Noop hook spec has non-zero amount (noop specs are informational-only) |
| `LeafAlreadyExecuted` | JBSucker | Cross-chain claim already processed |
| `NothingToClaim` | DefifaHook | Cash out yields no ETH and no fee tokens (e.g., 0-weight tier during COMPLETE phase) |

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
SET_PRIMARY_TERMINAL     = 16    Set primary terminal
USE_ALLOWANCE            = 17    Withdraw from surplus allowance
SET_SPLIT_GROUPS         = 18    Configure splits
ADD_PRICE_FEED           = 19    Add price feeds
ADD_ACCOUNTING_CONTEXTS  = 20    Add accepted tokens
SET_TOKEN_METADATA       = 21    Update token name/symbol
ADJUST_721_TIERS         = 22    Modify NFT tiers
SET_721_METADATA         = 23    Set NFT metadata
MINT_721                 = 24    Owner-mint NFTs
SET_721_DISCOUNT_PERCENT = 25    Set tier discounts
SET_BUYBACK_TWAP         = 26    Configure TWAP window
SET_BUYBACK_POOL         = 27    Set buyback pool
SET_BUYBACK_HOOK         = 28    Set buyback hook (also locks)
SET_ROUTER_TERMINAL      = 29    Set router terminal (also locks)
MAP_SUCKER_TOKEN         = 30    Map cross-chain tokens
DEPLOY_SUCKERS           = 31    Deploy sucker pairs
SUCKER_SAFETY            = 32    Emergency hatch control
SET_SUCKER_DEPRECATION   = 33    Deprecate suckers
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
| `DefifaHookLib` | Cash-out weight, fee tokens, attestation | `defifa-collection-deployer-v6/src/libraries/` |

## Contract Sizes

```
nana-core-v6
  JBMultiTerminal.sol          2,026   ████████████████████
  JBController.sol             1,201   ████████████
  JBRulesets.sol               1,107   ███████████
  JBTerminalStore.sol            911   █████████

nana-721-hook-v6
  JB721TiersHookStore.sol      1,223   ████████████
  JB721TiersHook.sol             788   ████████

revnet-core-v6
  REVLoans.sol                 1,363   ██████████████
  REVDeployer.sol              1,311   █████████████

nana-suckers-v6
  JBSucker.sol                 1,180   ████████████

univ4-lp-split-hook-v6
  JBUniswapV4LPSplitHook.sol   1,352   ██████████████

defifa-collection-deployer-v6
  DefifaHook.sol               1,075   ███████████
  DefifaDeployer.sol             906   █████████
  DefifaGovernor.sol             505   █████

nana-buyback-hook-v6
  JBBuybackHook.sol              909   █████████

deploy-all-v6
  Deploy.s.sol             2,230   ██████████████████████
```

## Testing

```bash
forge test                                    # all tests
forge test --match-path test/TestFile.sol      # one file
forge test --match-contract Invariant          # invariant tests
forge test -vvv                               # verbose traces
forge test --gas-report                       # gas analysis
forge coverage --match-path "./src/*.sol"      # coverage
```

## Dependency Graph

```
nana-permission-ids-v6
  └── nana-core-v6
        ├── nana-721-hook-v6 ──── defifa-collection-deployer-v6
        ├── nana-buyback-hook-v6
        ├── nana-router-terminal-v6
        ├── nana-suckers-v6
        ├── nana-ownable-v6
        ├── nana-omnichain-deployers-v6
        ├── revnet-core-v6 ──── banny-retail-v6
        ├── croptop-core-v6
        ├── univ4-lp-split-hook-v6
        └── univ4-router-v6

deploy-all-v6 depends on ALL of the above.
```
