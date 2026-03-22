# Architecture

## Ecosystem Layers

```
    ┌──────────────────────────────────────────────────────────────────┐
    │                    DEPLOYMENT LAYER                               │
    │  deploy-all-v6 (Deploy.s.sol via Sphinx)                         │
    └───────────────────────┬──────────────────────────────────────────┘
                            │ deploys everything below
                            │
                          ┌─▼────────────────────────────────────────────────────┐
                          │                 APPLICATION LAYER                       │
                          │  banny-retail-v6  │  croptop-core-v6  │  defifa-v6      │
                          └────────────┬──────┴──────┬────────────┴─────┬───────────┘
                                       │             │                  │
                          ┌────────────▼─────────────▼──────────────────▼───────────┐
                          │                    DEPLOYER LAYER                         │
                          │  REVDeployer  │  JBOmnichainDeployer  │  DefifaDeployer   │
                          │  CTDeployer   │  JB721TiersHookDeployer                   │
                          └───────┬───────┴──────────┬────────────────────────────────┘
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
    │  JBBaseSucker (OP)    │  JBCCIPSucker      │  JBSuckerRegistry    │
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

### Preview Flow
```
Frontend → JBMultiTerminal.previewPayFor()
             │
             ├──→ JBTerminalStore.previewPayFrom()
             │      ├── Read current ruleset
             │      ├── [Optional] Data hook overrides weight
             │      ├── Calculate token count from weight
             │      └── Return hook specifications (active or noop)
             │
             └──→ JBController.previewMintOf()
                    └── Split token count into beneficiary + reserved

Frontend → JBMultiTerminal.previewCashOutFrom()
             │
             └──→ JBTerminalStore.previewCashOutFrom()
                    ├── Calculate surplus
                    ├── Get totalSupply (including pending reserved)
                    ├── [Optional] Data hook overrides parameters
                    ├── JBCashOuts.cashOutFrom() — bonding curve
                    └── Return reclaim amount, tax rate, hook specifications
```

Both are `view` functions — no state changes. Hook specifications may include
noop specs (informational-only, `noop = true`) carrying routing diagnostics
from data hooks like the buyback hook.

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
| Data Hook (cashout) | `IJBRulesetDataHook.beforeCashOutRecordedWith` | JBTerminalStore | JBBuybackHook, JBOmnichainDeployer, REVDeployer |
| Pay Hook | `IJBPayHook.afterPayRecordedWith` | JBMultiTerminal | JB721TiersHook, JBBuybackHook |
| Cash Out Hook | `IJBCashOutHook.afterCashOutRecordedWith` | JBMultiTerminal | JB721TiersHook, JBBuybackHook, REVDeployer, DefifaHook |
| Split Hook | `IJBSplitHook.processSplitWith` | JBMultiTerminal | JBUniswapV4LPSplitHook |
| Approval Hook | `IJBRulesetApprovalHook.approvalStatusOf` | JBRulesets | JBDeadline |

Data hooks return hook specifications that can be marked **noop** (`noop = true`). Noop specs are informational-only — the terminal skips the hook callback but the spec's metadata is still available to preview clients. The buyback hook uses this to return routing diagnostics (TWAP tick, liquidity, pool ID) even when the protocol path wins. Noop specs with `amount != 0` revert (`JBTerminalStore_NoopHookSpecHasAmount`).

#### Hook Composition Flow

```
Data Hook (beforePayRecordedWith / beforeCashOutRecordedWith)
│
├── Returns: modified weight/tax rate/supply
│   (these overrides are ALWAYS applied)
│
└── Returns: hook specifications[]
    │
    ├── spec.noop = false, spec.amount > 0
    │   └── Terminal calls hook.afterPayRecordedWith / afterCashOutRecordedWith
    │       (active callback — hook receives funds and executes logic)
    │
    ├── spec.noop = true, spec.amount = 0
    │   └── Terminal SKIPS callback
    │       (informational — metadata available to preview clients only)
    │
    └── spec.noop = true, spec.amount > 0
        └── REVERTS: JBTerminalStore_NoopHookSpecHasAmount
            (noop specs cannot carry funds)
```

### Permission System

```
JBPermissions (256-bit packed)
├── ROOT (ID 1) — grants all permissions
├── Wildcard projectId=0 — applies to all projects
├── Per-project permissions (IDs 2-33)
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

See [SKILLS.md](./SKILLS.md#contract-sizes) for per-contract line counts.

| Repository | Role | Key Contracts |
|-----------|------|---------------|
| nana-core-v6 | Core protocol | JBMultiTerminal, JBController, JBTerminalStore, JBRulesets |
| nana-suckers-v6 | Cross-chain | JBSucker, JBOptimismSucker, JBBaseSucker, JBArbitrumSucker, JBCCIPSucker |
| nana-721-hook-v6 | NFT tiers | JB721TiersHook, JB721TiersHookStore |
| defifa-collection-deployer-v6 | Prediction games | DefifaDeployer, DefifaHook, DefifaGovernor, DefifaHookLib |
| revnet-core-v6 | Autonomous projects | REVDeployer, REVLoans |
| nana-router-terminal-v6 | Payment routing | JBRouterTerminal, JBRouterTerminalRegistry |
| nana-buyback-hook-v6 | DEX buyback | JBBuybackHook, JBBuybackHookRegistry, JBSwapLib |
| deploy-all-v6 | Ecosystem deployment | Deploy.s.sol (Sphinx orchestration) |
| banny-retail-v6 | Banny NFTs | Banny721TokenUriResolver |
| univ4-lp-split-hook-v6 | LP management | JBUniswapV4LPSplitHook |
| croptop-core-v6 | NFT publishing | CTDeployer, CTPublisher |
| univ4-router-v6 | UniV4 integration | JBUniswapV4Hook |
| nana-omnichain-deployers-v6 | Omnichain | JBOmnichainDeployer |
| nana-ownable-v6 | JB ownership | JBOwnable |
| nana-fee-project-deployer-v6 | Fee project | Deploy.s.sol (script only) |
| nana-address-registry-v6 | Registry | JBAddressRegistry |
| nana-permission-ids-v6 | Constants | JBPermissionIds |
