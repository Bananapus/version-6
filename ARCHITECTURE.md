# Juicebox V6 EVM - Architecture

## Ecosystem Layers

```
                          ┌──────────────────────────────────────────────────────┐
                          │                 APPLICATION LAYER                       │
                          │  banny-retail-v6  │  croptop-core-v6  │  defifa-v6      │
                          └────────────┬──────┴──────┬────────────┴─────┬───────────┘
                                       │             │
                          ┌────────────▼─────────────▼────────────────▼──────────┐
                          │                    DEPLOYER LAYER                       │
                          │  REVDeployer  │  JBOmnichainDeployer  │  DefifaDeployer │
                          │  CTDeployer   │  JB721TiersHookDeployer                 │
                          └───────┬───────┴──────────┬──────────────────────────────┘
                                  │                  │
          ┌───────────────────────▼──────────────────▼──────────────────┐
          │                       HOOK LAYER                            │
          │  JB721TiersHook  │  JBBuybackHook  │  UniV4DeploymentSplit  │
          │  REVLoans        │  JBUniswapV4Hook │  JBRouterTerminal     │
          │  DefifaHook      │  DefifaGovernor  │                       │
          └───────────┬──────┴────────┬────────┴───────┬───────────────┘
                      │               │                │
    ┌─────────────────▼───────────────▼────────────────▼───────────────┐
    │                        BRIDGE LAYER                               │
    │  JBSucker (abstract)  │  JBOptimismSucker  │  JBArbitrumSucker   │
    │  JBBaseSucker         │  JBCCIPSucker      │  JBSuckerRegistry    │
    └───────────────────────┬──────────────────────────────────────────┘
                            │
    ┌───────────────────────▼──────────────────────────────────────────┐
    │                     CORE PROTOCOL LAYER                          │
    │                                                                  │
    │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐     │
    │  │ JBController │  │ JBDirectory  │  │ JBMultiTerminal    │     │
    │  │ (orchestrator)│  │ (routing)    │  │ (funds in/out)     │     │
    │  └──────┬───────┘  └──────┬───────┘  └────────┬───────────┘     │
    │         │                 │                    │                  │
    │  ┌──────▼───────┐  ┌─────▼────────┐  ┌───────▼──────────┐      │
    │  │ JBRulesets   │  │ JBTokens     │  │ JBTerminalStore  │      │
    │  │ (governance) │  │ (supply)     │  │ (bookkeeping)    │      │
    │  └──────────────┘  └──────────────┘  └──────────────────┘      │
    │                                                                  │
    │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐     │
    │  │ JBSplits     │  │ JBPrices     │  │ JBPermissions      │     │
    │  │ (payouts)    │  │ (oracles)    │  │ (access control)   │     │
    │  └──────────────┘  └──────────────┘  └────────────────────┘     │
    │                                                                  │
    │  JBProjects (ERC-721)  │  JBERC20 (token)  │  JBFundAccessLimits │
    │  JBFeelessAddresses    │  JBDeadline        │  JBChainlinkV3*     │
    └──────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────┐
    │                      UTILITY LAYER                               │
    │  JBPermissionIds  │  JBOwnable  │  JBAddressRegistry             │
    └──────────────────────────────────────────────────────────────────┘
```

## Core Data Flow

### Payment Flow
```
User → JBMultiTerminal.pay()
         │
         ├──→ JBTerminalStore.recordPaymentFrom()
         │      ├── Read current ruleset
         │      ├── [Optional] Data hook overrides weight
         │      ├── Calculate token count from weight
         │      └── Update balance
         │
         ├──→ JBController.mintTokensOf()
         │      ├── Calculate reserved tokens
         │      ├── Mint beneficiary tokens
         │      └── Accumulate pendingReservedTokenBalanceOf
         │
         └──→ [Optional] Pay hooks execute
                ├── JBBuybackHook: swap vs mint decision
                ├── JB721TiersHook: mint NFT tiers
                └── Custom hooks
```

### Cash Out Flow
```
Holder → JBMultiTerminal.cashOutTokensOf()
           │
           ├──→ JBTerminalStore.recordCashOutFor()
           │      ├── Calculate surplus
           │      ├── Get totalSupply (including pending reserved)
           │      ├── [Optional] Data hook overrides parameters
           │      ├── JBCashOuts.cashOutFrom() — bonding curve
           │      └── Deduct balance
           │
           ├──→ JBController.burnTokensOf()
           │
           ├──→ Transfer reclaimed tokens to beneficiary
           │
           ├──→ [Optional] Cash out hooks execute
           │
           └──→ Take fees (2.5% to project #1)
```

### Payout Flow
```
Owner → JBMultiTerminal.sendPayoutsOf()
          │
          ├──→ JBTerminalStore.recordPayoutFor()
          │      └── Deduct balance, check payout limits
          │
          ├──→ Distribute to splits (JBSplits)
          │      ├── Split to project → pay project's terminal
          │      ├── Split to address → direct transfer
          │      └── Split to hook → IJBSplitHook.processSplitWith()
          │
          └──→ Take fees on non-feeless payouts
```

### Cross-Chain Bridge Flow
```
Source Chain                          Destination Chain
────────────                          ──────────────────
User → JBSucker.prepare()            JBSucker.claim()  ← User
         │                                  │
         ├── Cash out tokens                ├── Verify merkle proof
         ├── Insert into outbox tree        ├── Check not already claimed
         ├── Bridge tokens via              ├── Mint/transfer tokens
         │   OP/Arb/CCIP messenger          └── Mark leaf as executed
         └── Send tree root
```

## Contract Relationships

### Dependency Graph (imports)
```
nana-permission-ids-v6 ←── nana-core-v6 ←──┬── nana-suckers-v6
                                             ├── nana-721-hook-v6 ←── defifa-collection-deployer-v6
                                             ├── nana-buyback-hook-v6
                                             ├── nana-router-terminal-v6
                                             ├── nana-ownable-v6
                                             │
                                             ├── revnet-core-v6 ←──── banny-retail-v6
                                             ├── croptop-core-v6
                                             ├── nana-omnichain-deployers-v6
                                             ├── univ4-lp-split-hook-v6
                                             └── univ4-router-v6
```

### Hook Composition Model

Juicebox V6 uses a compositional hook system where features plug into the core protocol at well-defined extension points:

| Extension Point | Interface | Called By | Examples |
|----------------|-----------|-----------|----------|
| Data Hook (pay) | `IJBRulesetDataHook.beforePayRecordedWith` | JBTerminalStore | JBBuybackHook, REVDeployer |
| Data Hook (cashout) | `IJBRulesetDataHook.beforeCashOutRecordedWith` | JBTerminalStore | JBOmnichainDeployer, REVDeployer |
| Pay Hook | `IJBPayHook.afterPayRecordedWith` | JBMultiTerminal | JB721TiersHook |
| Cash Out Hook | `IJBCashOutHook.afterCashOutRecordedWith` | JBMultiTerminal | JB721TiersHook, REVDeployer, DefifaHook |
| Split Hook | `IJBSplitHook.processSplitWith` | JBMultiTerminal | UniV4DeploymentSplitHook |
| Approval Hook | `IJBRulesetApprovalHook.approvalStatusOf` | JBRulesets | JBDeadline |

### Permission System

```
JBPermissions (256-bit packed)
├── ROOT (ID 1) — grants all permissions
├── Wildcard projectId=0 — applies to all projects
├── Per-project permissions (IDs 2-32)
│   ├── Core: QUEUE_RULESETS, MINT_TOKENS, BURN_TOKENS, SET_TERMINALS, etc.
│   ├── 721 Hook: ADJUST_721_TIERS, SET_721_METADATA, SET_721_DISCOUNT_PERCENT
│   ├── Buyback: SET_BUYBACK_TWAP, SET_BUYBACK_POOL, SET_BUYBACK_HOOK
│   ├── Router: SET_ROUTER_TERMINAL
│   └── Suckers: MAP_SUCKER_TOKEN, DEPLOY_SUCKERS, SUCKER_SAFETY, SET_SUCKER_DEPRECATION
└── Guards:
    ├── ROOT cannot be set via wildcard projectId
    ├── ROOT operators cannot grant ROOT to others
    └── Permission 0 is reserved (cannot be set)
```

## Repository Summary

| Repository | Role | Key Contracts | LoC |
|-----------|------|---------------|-----|
| nana-core-v6 | Core protocol | JBMultiTerminal, JBController, JBTerminalStore, JBRulesets | ~10,718 |
| nana-suckers-v6 | Cross-chain | JBSucker, JBOptimismSucker, JBArbitrumSucker, JBCCIPSucker | ~5,339 |
| nana-721-hook-v6 | NFT tiers | JB721TiersHook, JB721TiersHookStore | ~4,466 |
| revnet-core-v6 | Autonomous projects | REVDeployer, REVLoans | ~3,190 |
| nana-buyback-hook-v6 | DEX buyback | JBBuybackHook, JBSwapLib | ~1,500 |
| nana-router-terminal-v6 | Payment routing | JBRouterTerminal | ~1,200 |
| univ4-lp-split-hook-v6 | LP management | UniV4DeploymentSplitHook | ~1,800 |
| univ4-router-v6 | UniV4 integration | JBUniswapV4Hook | ~800 |
| croptop-core-v6 | NFT publishing | CTDeployer, CTPublisher | ~1,200 |
| banny-retail-v6 | Banny NFTs | Banny721TokenUriResolver | ~900 |
| nana-ownable-v6 | JB ownership | JBOwnable | ~300 |
| nana-address-registry-v6 | Registry | JBAddressRegistry | ~100 |
| nana-permission-ids-v6 | Constants | JBPermissionIds | ~50 |
| nana-omnichain-deployers-v6 | Omnichain | JBOmnichainDeployer | ~800 |
| defifa-collection-deployer-v6 | Prediction games | DefifaDeployer, DefifaHook, DefifaGovernor, DefifaHookLib | ~3,838 |
| nana-fee-project-deployer-v6 | Fee project | Deploy.s.sol (script only) | ~200 |
