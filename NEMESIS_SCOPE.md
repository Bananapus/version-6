# Nemesis Audit Scoping — Juicebox V6 EVM

## Setup

Nemesis skills installed in all 16 repos. To run:
```bash
cd <repo>
claude
# then type: /nemesis
```

**Scope:** All `src/` and `script/` Solidity files in every repo.

## Session Plan

### Session 1: Core Terminal + Store (Priority: HIGHEST)
**Repo:** `nana-core-v6`
**Scope:** `src/JBMultiTerminal.sol`, `src/JBTerminalStore.sol`, all related interfaces/structs/libraries, `script/`
**LoC:** ~2,932 (contracts) + ~519 (scripts) = ~3,451

```
/nemesis --contract JBMultiTerminal
/nemesis --contract JBTerminalStore
```

**Why first:** These two contracts handle all money movement. JBMultiTerminal (2,024 lines) contains `_pay()`, `_cashOutTokensOf()`, `sendPayoutsOf()`, fee processing, and held fee returns. JBTerminalStore (908 lines) contains balance bookkeeping, payout limit enforcement, surplus calculation, and bonding curve math. Cross-contract state coupling between them is the highest-risk surface.

**Focus areas:**
- State coupling between Terminal balance records and Store payout limit tracking
- Fee holding/return lifecycle (28-day window, sequential processing)
- Bonding curve reclaim calculation vs actual transfer amounts
- Data hook integration points (can hooks corrupt store state?)
- Permit2 payment path vs direct payment path consistency
- Deploy script address correctness and initialization parameters

---

### Session 2: Controller + Rulesets + Tokens
**Repo:** `nana-core-v6`
**Scope:** `src/JBController.sol`, `src/JBRulesets.sol`, `src/JBTokens.sol`, `src/JBERC20.sol`, all related interfaces/structs/libraries
**LoC:** ~2,789

```
/nemesis --contract JBController
/nemesis --contract JBRulesets
/nemesis --contract JBTokens
```

**Focus areas:**
- Reserved token accumulation vs distribution timing
- Ruleset weight decay + cache mechanism (20k iteration threshold)
- Approval hook rejection fallback chain
- Credit vs ERC-20 dual-token state consistency
- ERC2771 meta-transaction sender resolution

---

### Session 3: Permissions + Directory + Splits + Fund Access + Prices
**Repo:** `nana-core-v6`
**Scope:** `src/JBPermissions.sol`, `src/JBDirectory.sol`, `src/JBSplits.sol`, `src/JBFundAccessLimits.sol`, `src/JBPrices.sol`, `src/JBProjects.sol`, `src/JBFeelessAddresses.sol`, `src/JBDeadline.sol`, price feed contracts, all related interfaces/structs/libraries
**LoC:** ~1,478 + remaining libraries

```
/nemesis --contract JBPermissions
/nemesis --contract JBDirectory
/nemesis --contract JBSplits
/nemesis --contract JBFundAccessLimits
/nemesis --contract JBPrices
```

**Focus areas:**
- ROOT permission (1) grants-all behavior
- Wildcard projectId=0 permission scope
- Locked splits enforcement during ruleset transitions
- Payout limit + surplus allowance currency ordering constraints
- Terminal/controller migration hooks
- Price feed staleness and sequencer checks
- Chainlink oracle integration edge cases

---

### Session 4: UniV4 LP Split Hook (full repo)
**Repo:** `univ4-lp-split-hook-v6`
**Scope:** All `src/**/*.sol` + `script/**/*.sol`
**LoC:** ~1,327 (src) + ~404 (scripts) = ~1,731

```
/nemesis
```

**Focus areas:**
- `_getAmountForCurrency` returning hardcoded 0 (C-3 from prior audit)
- Pool initialization price manipulation window
- Cross-token balance corruption during multi-token splits
- Uniswap V4 hook callback reentrancy
- Fee rebalancing math precision
- Deploy script address validation per chain

---

### Session 5: 721 Tiers Hook (full repo)
**Repo:** `nana-721-hook-v6`
**Scope:** All `src/**/*.sol` + `script/**/*.sol`
**LoC:** ~4,466 (src) + ~221 (scripts) = ~4,687

```
/nemesis
```

**Focus areas:**
- Tier mint recording vs token supply consistency
- Discount percent denominator (200, not 100)
- Cash-out weight calculation for burned NFTs
- Category-based tier filtering edge cases
- Reserved token mint interaction with NFT tiers
- Deployer and ProjectDeployer trust assumptions

---

### Session 6: REVDeployer + REVLoans (full repo)
**Repo:** `revnet-core-v6`
**Scope:** All `src/**/*.sol` + `script/**/*.sol`
**LoC:** ~3,190 (src) + ~423 (scripts) = ~3,613

```
/nemesis
```

**Focus areas:**
- Stage transition timing vs borrowable state
- Loan collateral valuation during ruleset changes
- Auto-mint split hook integration
- Prepaid fee calculation for early repayment
- Liquidation threshold vs bonding curve reclaim
- Deploy script stage configuration

---

### Session 7: Buyback Hook (full repo)
**Repo:** `nana-buyback-hook-v6`
**Scope:** All `src/**/*.sol` + `script/**/*.sol`
**LoC:** ~1,443 (src) + ~188 (scripts) = ~1,631

```
/nemesis
```

**Focus areas:**
- TWAP manipulation window
- Quote staleness during high volatility
- Swap callback validation
- Mint-path vs buy-path token accounting consistency
- Registry trust model

---

### Session 8: Suckers (full repo)
**Repo:** `nana-suckers-v6`
**Scope:** All `src/**/*.sol` + `script/**/*.sol`
**LoC:** ~5,339 (src) + ~603 (scripts) = ~5,942

```
/nemesis
```

**Focus areas:**
- Dual merkle tree (outbox/inbox) state consistency
- Token mapping immutability after first outbox entry
- Deprecation lifecycle state machine
- Emergency hatch token rescue
- Bridge-specific (OP/Arb/CCIP) adapter correctness
- Deploy script bridge config per chain

---

### Session 9: Defifa (full repo)
**Repo:** `defifa-collection-deployer-v6`
**Scope:** All `src/**/*.sol` + `script/**/*.sol`
**LoC:** ~3,783 (src) + ~192 (scripts) = ~3,975

```
/nemesis
```

**Focus areas:**
- Game phase transitions (COUNTDOWN → MINT → REFUND → SCORING → COMPLETE)
- Scorecard submission + attestation quorum
- Cash-out weight calculation (integer division truncation, 1e18 base)
- Whale tier dominance in governance
- Fee token dilution during late minting
- Token URI resolver SVG injection

---

### Session 10: Router Terminal (full repo)
**Repo:** `nana-router-terminal-v6`
**Scope:** All `src/**/*.sol` + `script/**/*.sol`
**LoC:** ~2,076 (src) + ~205 (scripts) = ~2,281

```
/nemesis
```

**Focus areas:**
- Multi-hop payment routing correctness
- Terminal registry manipulation
- Intermediate token accounting during routed payments
- Fee stacking across hops
- Slippage enforcement across multi-step routes

---

### Session 11: UniV4 Router (full repo)
**Repo:** `univ4-router-v6`
**Scope:** All `src/**/*.sol` + `script/**/*.sol`
**LoC:** ~1,920 (src) + ~670 (scripts) = ~2,590

```
/nemesis
```

**Focus areas:**
- UniV4 hook callback validation
- Pool key construction and verification
- Swap path routing correctness
- Token accounting through the hook lifecycle
- Deploy script Uniswap V4 address correctness per chain

---

### Session 12: Omnichain Deployer (full repo)
**Repo:** `nana-omnichain-deployers-v6`
**Scope:** All `src/**/*.sol` + `script/**/*.sol`
**LoC:** ~893 (src) + ~144 (scripts) = ~1,037

```
/nemesis
```

**Focus areas:**
- Data hook wrapping (0% cashout tax + mint permission for suckers)
- Cross-chain deployment parameter consistency
- Permission escalation through deployer
- Sucker registration during deployment

---

### Session 13: Croptop (full repo)
**Repo:** `croptop-core-v6`
**Scope:** All `src/**/*.sol` + `script/**/*.sol`
**LoC:** ~1,203 (src) + ~572 (scripts) = ~1,775

```
/nemesis
```

**Focus areas:**
- Post validation and tier auto-creation
- Publisher fee handling
- Project ownership delegation (CTProjectOwner)
- Tier parameter bounds checking
- Deploy script fee project configuration

---

### Session 14: Banny (full repo)
**Repo:** `banny-retail-v6`
**Scope:** All `src/**/*.sol` + `script/**/*.sol`
**LoC:** ~1,479 (src) + ~1,822 (scripts) = ~3,301

```
/nemesis
```

**Focus areas:**
- SVG rendering injection in token URI resolver
- Trait validation and on-chain metadata encoding
- Deploy script multi-phase deployment correctness (1,822 lines of scripts)
- Asset URI handling

---

### Session 15: Ownable + Address Registry + Permission IDs + Fee Project Deployer
**Repos:** `nana-ownable-v6` (331), `nana-address-registry-v6` (223), `nana-permission-ids-v6` (56), `nana-fee-project-deployer-v6` (200 scripts)
**Scope:** All `src/**/*.sol` + `script/**/*.sol` across all 4 repos
**LoC:** ~810

```
# Run separately in each repo:
cd nana-ownable-v6 && claude        # /nemesis
cd nana-address-registry-v6 && claude  # /nemesis
cd nana-permission-ids-v6 && claude    # /nemesis (quick — 56 LoC)
cd nana-fee-project-deployer-v6 && claude  # /nemesis (scripts only — 200 LoC)
```

**Focus areas:**
- JBOwnable: Permission model bridging between OZ Ownable and JB permissions
- Address registry: Registration/lookup consistency
- Permission IDs: Constant correctness
- Fee project deployer: Script parameter validation

---

## Priority Order

| Priority | Session | Repo | LoC (src+script) | Rationale |
|----------|---------|------|-------------------|-----------|
| 1 | Session 1 | nana-core-v6 (Terminal+Store) | 3,451 | All money flows through here |
| 2 | Session 4 | univ4-lp-split-hook-v6 | 1,731 | Highest prior finding density |
| 3 | Session 2 | nana-core-v6 (Controller+Rulesets+Tokens) | 2,789 | Token supply manipulation |
| 4 | Session 6 | revnet-core-v6 | 3,613 | Complex lending + stage transitions |
| 5 | Session 10 | nana-router-terminal-v6 | 2,281 | Multi-hop routing attack surface |
| 6 | Session 5 | nana-721-hook-v6 | 4,687 | NFT-specific edge cases |
| 7 | Session 11 | univ4-router-v6 | 2,590 | UniV4 hook integration |
| 8 | Session 3 | nana-core-v6 (Permissions+Dir+Splits) | 1,478 | Access control |
| 9 | Session 8 | nana-suckers-v6 | 5,942 | Cross-chain state |
| 10 | Session 7 | nana-buyback-hook-v6 | 1,631 | Oracle manipulation |
| 11 | Session 9 | defifa-collection-deployer-v6 | 3,975 | Application-layer game logic |
| 12 | Session 13 | croptop-core-v6 | 1,775 | Content publishing |
| 13 | Session 14 | banny-retail-v6 | 3,301 | NFT resolver + heavy scripts |
| 14 | Session 12 | nana-omnichain-deployers-v6 | 1,037 | Cross-chain deployment |
| 15 | Session 15 | ownable+registry+permIds+feeDeploy | 810 | Supporting contracts |

## Running a Session

1. Open terminal, `cd` into the target repo
2. Run `claude` to start Claude Code
3. Type the `/nemesis` command listed for that session
4. Nemesis will run Pass 1 (Feynman) → Pass 2 (State Inconsistency) → Pass 3+ (convergence loop)
5. Output lands in `.audit/findings/` within the repo
6. After completion, copy key findings back to the ecosystem `AUDIT_FINDINGS.md`

## Total Scope

- **16 repos**, **15 sessions**, **~54,966 LoC** total (47,827 src + 7,139 scripts)
- All `src/**/*.sol` files (contracts, interfaces, structs, enums, libraries, utils)
- All `script/**/*.sol` files (deployment and configuration scripts)
- **30+ contracts** targeted for deep Nemesis analysis
