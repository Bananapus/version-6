# Juicebox V6 — Developer Navigation

Fast-access reference for finding anything in the V6 ecosystem. Use this when you need to trace a flow, find a function, debug an error, or understand how contracts interact.

## Common Approaches

**"How do payments work?"** — Start at `JBMultiTerminal._pay()` (L1393). It calls `JBTerminalStore.recordPaymentFrom()` for bookkeeping, then `JBController.mintTokensOf()` for token issuance, then executes any pay hooks. The data hook (if set) can override the weight before minting.

**"How do I build a custom hook?"** — Implement `IJBPayHook` (called after payment) or `IJBCashOutHook` (called after cashout). For economics override, implement `IJBRulesetDataHook`. See `JB721TiersHook` for a pay+cashout hook example, `JBBuybackHook` for a data hook example. Hooks are set per-ruleset in the metadata.

**"How do I deploy a project?"** — Use `JBController.launchProjectFor()` with a ruleset config. For a revnet (autonomous project), use `REVDeployer.deployFor()`. For Croptop, use `CTDeployer`. For Defifa, use `DefifaDeployer.launchGameWith()`. Each deployer handles its own hook wiring.

**"How does cross-chain work?"** — `JBSucker.prepare()` cashes out tokens on the source chain and inserts a leaf into an outbox merkle tree. The tree root is bridged via OP/Arb/CCIP messenger. On destination, `JBSucker.claim()` verifies the merkle proof and mints tokens. See `nana-omnichain-deployers-v6` for multi-chain project setup.

**"How do I trace a bug?"** — Find the error in the "Find by Error" table below. Trace backwards: errors in `JBTerminalStore` mean the bookkeeping check failed; errors in `JBMultiTerminal` mean slippage or access control failed; errors in `JBController` mean ruleset config prevents the action.

**"How does the full ecosystem get deployed?"** — `deploy-all-v6/script/Deploy.s.sol` deploys everything in 9 phases via Sphinx: core protocol → address registry → hooks (721, buyback, router, suckers) → omnichain → periphery → application projects (Croptop, Revnet, Banny).

## Find by Flow

| Flow | Entry Point | Key Logic |
|------|------------|-----------|
| Payment | `JBMultiTerminal._pay()` L1393 | `JBTerminalStore.recordPaymentFrom()` L308 |
| Cash out | `JBMultiTerminal._cashOutTokensOf()` L1018 | `JBTerminalStore.recordCashOutFor()` L167 |
| Payout distribution | `JBMultiTerminal.sendPayoutsOf()` L699 | Splits loop → `executePayout()` |
| Surplus calculation | `JBTerminalStore._tokenSurplusFrom()` L813 | Cross-terminal aggregation via JBSurplus |
| Bonding curve | `JBCashOuts.cashOutFrom()` L20 | `base * [(MAX-tax) + tax*(count/supply)] / MAX` |
| Token minting | `JBController.mintTokensOf()` L492 | Reserved accumulation in `pendingReservedTokenBalanceOf` |
| Reserved distribution | `JBController._sendReservedTokensToSplitsOf()` L1063 | Mints then distributes to splits |
| Ruleset queuing | `JBRulesets.queueFor()` L116 | Linked list via `basedOnId` |
| Weight decay | `JBRulesets.deriveWeightFrom()` L609 | Cache required after 20k cycles |
| Permission check | `JBPermissions.hasPermission()` L191 | 256-bit packed, ROOT=1 grants all |
| Fee processing | `JBMultiTerminal._processFee()` L1479 | 2.5% to project #1, 28-day hold |
| Held fee return | `JBMultiTerminal.processHeldFeesOf()` L631 | Sequential from `_nextHeldFeeIndexOf` |
| Data hook (pay) | `JBTerminalStore.recordPaymentFrom()` L308 | Hook overrides weight + specifies pay hooks |
| Data hook (cashout) | `JBTerminalStore.recordCashOutFor()` L167 | Hook overrides tax rate, count, supply |
| NFT tier mint | `JB721TiersHookStore.recordMint()` L1020 | Tier selection by price, supply cap check |
| Buyback decision | `JBBuybackHook._getQuote()` L711 | TWAP vs spot, mint vs swap |
| Loan creation | `REVLoans.borrowFrom()` L544 | Collateral lock, bonding curve valuation |
| Cross-chain prepare | `JBSucker.prepare()` | Cash out + insert into outbox merkle tree |
| Cross-chain claim | `JBSucker.claim()` | Verify merkle proof + mint/transfer |
| LP pool deploy | `UniV4DeploymentSplitHook.deployPool()` L482 | Full-range liquidity from accumulated tokens |
| Defifa game launch | `DefifaDeployer.launchGameWith()` L393 | Creates project + queues phase rulesets |
| Defifa scorecard | `DefifaGovernor.submitScorecardFor()` L413 | Allocates `TOTAL_CASHOUT_WEIGHT` (1e18) across tiers |
| Defifa attestation | `DefifaGovernor.attestToScorecardFrom()` L323 | Per-tier power, capped at 1e9 |
| Defifa ratification | `DefifaGovernor.ratifyScorecardFrom()` L365 | Quorum = 50% of eligible attestation power |
| Defifa cash-out weight | `DefifaHookLib.computeCashOutWeight()` L95 | `weight / tokens` — integer truncation |
| Defifa game phase | `DefifaDeployer.currentGamePhaseOf()` L227 | COUNTDOWN → MINT → REFUND → SCORING → COMPLETE |
| Full ecosystem deploy | `deploy-all-v6/script/Deploy.s.sol` (1572 lines) | 9-phase Sphinx deployment across 8 chains |

All paths in `nana-core-v6/src/` unless noted otherwise.

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
| `LeafAlreadyExecuted` | JBSucker | Cross-chain claim already processed |
| `NothingToClaim` | DefifaHook | Cash out attempted during SCORING phase |

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
16. **`baseCurrency` vs `JBAccountingContext.currency`** — metadata uses 1=ETH, 2=USD; accounting context uses `uint32(uint160(token))` (e.g. 61166 for ETH). Different systems.
17. **NFT tiers sorted by category, not price** — `recordAddTiers` reverts with `InvalidCategorySortOrder` if categories aren't ascending
18. **Always use `JB721TiersHookProjectDeployer.launchProjectFor`** even with empty tiers — enables future NFT additions without migration
19. **Don't queue N identical rulesets for vesting** — use one cycling ruleset with `duration` instead
20. **Revnet loans beat cash-outs above ~39% `cashOutTaxRate`** — below ~39%, cash-out is more capital-efficient (CryptoEconLab finding)

## Permission IDs

```
ROOT                    = 1     All permissions. Cannot be set for wildcard projectId=0.
QUEUE_RULESETS          = 2     Queue new rulesets
MINT_TOKENS             = 3     Mint project tokens
BURN_TOKENS             = 4     Burn tokens on behalf of holder
SET_TERMINALS           = 5     Set project terminals
SET_CONTROLLER          = 6     Set project controller
SET_SPLIT_GROUPS        = 7     Configure splits
SET_PROJECT_URI         = 8     Set project metadata
SET_TOKEN               = 9     Deploy/set ERC-20 token
SEND_PAYOUTS            = 10    Trigger payout distribution
ADD_PRICE_FEED          = 11    Add price feeds
USE_ALLOWANCE           = 12    Withdraw from surplus allowance
CASH_OUT_TOKENS         = 13    Cash out on behalf of holder
SEND_RESERVED_TOKENS    = 14    Distribute reserved tokens
TRANSFER_CREDITS        = 15    Transfer token credits
SET_PRIMARY_TERMINAL    = 16    Set primary terminal
CLAIM_TOKENS            = 17    Claim ERC-20 from credits
ADD_ACCOUNTING_CONTEXTS = 20    Add accepted tokens
ADJUST_721_TIERS        = 21    Modify NFT tiers
SET_721_METADATA        = 22    Set NFT metadata
MINT_721                = 23    Owner-mint NFTs
SET_721_DISCOUNT_PERCENT = 24   Set tier discounts
SET_BUYBACK_TWAP        = 25    Configure TWAP window
SET_BUYBACK_POOL        = 26    Set buyback pool
SET_BUYBACK_HOOK        = 27    Set buyback hook
MAP_SUCKER_TOKEN        = 29    Map cross-chain tokens
DEPLOY_SUCKERS          = 30    Deploy sucker pairs
SUCKER_SAFETY           = 31    Emergency hatch control
SET_SUCKER_DEPRECATION  = 32    Deprecate suckers
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
  JBMultiTerminal.sol      2,024   ████████████████████
  JBController.sol         1,186   ████████████
  JBRulesets.sol           1,093   ███████████
  JBTerminalStore.sol        800   ████████

nana-721-hook-v6
  JB721TiersHookStore.sol  1,200   ████████████
  JB721TiersHook.sol         600   ██████

revnet-core-v6
  REVDeployer.sol          1,600   ████████████████
  REVLoans.sol             1,590   ████████████████

nana-suckers-v6
  JBSucker.sol             1,200   ████████████

nana-buyback-hook-v6
  JBBuybackHook.sol          600   ██████

univ4-lp-split-hook-v6
  UniV4DeploymentSplitHook   800   ████████

defifa-collection-deployer-v6
  DefifaHook.sol           1,056   ███████████
  DefifaDeployer.sol         894   █████████
  DefifaGovernor.sol         490   █████

deploy-all-v6
  Deploy.s.sol             1,572   ████████████████
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
