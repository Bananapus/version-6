# Ecosystem Flows

Use this file when you need the fastest path from a user-facing flow or debugging symptom to the repo or function that owns it.

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
| Loan creation | `REVLoans.borrowFrom()` | Collateral lock, bonding curve valuation. Supports operator delegation via `holder` param (OPEN_LOAN permission). |
| Hide tokens | `REVHiddenTokens.hideTokensOf()` | Burns tokens, tracks hidden balance. Reduces totalSupply, increases cash-out value for remaining holders. |
| Reveal tokens | `REVHiddenTokens.revealTokensOf()` | Re-mints previously hidden tokens to beneficiary. |
| Cross-chain prepare | `JBSucker.prepare()` | Cash out + insert into outbox merkle tree |
| Cross-chain claim | `JBSucker.claim()` | Verify merkle proof + mint/transfer |
| LP pool deploy | `JBUniswapV4LPSplitHook.deployPool()` | Concentrated liquidity from accumulated tokens |
| Defifa game launch | `DefifaDeployer.launchGameWith()` | Creates project + queues phase rulesets |
| Defifa scorecard | `DefifaGovernor.submitScorecardFor()` | Allocates `TOTAL_CASHOUT_WEIGHT` (1e18) across tiers |
| Defifa attestation | `DefifaGovernor.attestToScorecardFrom()` | Per-tier power, capped at 1e9 |
| Defifa ratification | `DefifaGovernor.ratifyScorecardFrom()` | Quorum = 50% of eligible attestation power |
| Defifa cash-out weight | `DefifaHookLib.computeCashOutWeight()` | `weight / tokens` — integer truncation |
| Defifa game phase | `DefifaDeployer.currentGamePhaseOf()` | COUNTDOWN -> MINT -> REFUND -> SCORING -> COMPLETE |
| Full ecosystem deploy | `deploy-all-v6/script/Deploy.s.sol` | Multi-phase Sphinx deployment orchestration |

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
| `NoopHookSpecHasAmount` | JBTerminalStore | Noop hook spec has non-zero amount (noop specs are informational-only) |
| `LeafAlreadyExecuted` | JBSucker | Cross-chain claim already processed |
| `NothingToClaim` | DefifaHook | Cash out yields no ETH and no fee tokens (e.g., 0-weight tier during COMPLETE phase) |

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
        ├── nana-721-hook-v6 ──── defifa
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
