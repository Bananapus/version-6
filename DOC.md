# Juicebox V6 EVM - How It Works

## Overview

Juicebox V6 is a programmable treasury protocol. Projects collect funds through terminals, issue tokens via controllers, and govern economics through rulesets. Every aspect is composable via hooks.

## Core Concepts

### Projects
Each project is an ERC-721 NFT (`JBProjects`). The NFT holder is the project owner. Projects are identified by a `uint256 projectId`. Project #1 is the protocol's fee recipient.

### Rulesets
Rulesets define a project's economic parameters for a time period:
- **weight**: How many tokens to mint per unit paid (18 decimals)
- **duration**: How long the ruleset lasts (0 = forever)
- **weightCutPercent**: How much weight decays each cycle (9 decimals, max 1,000,000,000)
- **cashOutTaxRate**: Tax on cash outs (basis points, max 10,000 = 100%)
- **reservedPercent**: Percentage of minted tokens held for splits (basis points)
- **metadata**: Bit-packed flags (pausePay, allowMinting, useDataHookForPay, etc.)
- **approvalHook**: Contract that can approve/reject ruleset transitions

Rulesets form a linked list via `basedOnId`. When a ruleset expires, the next queued one takes effect. If none is queued, the current one cycles with decayed weight.

**Special values:**
- `weight = 1`: Inherit decayed weight from previous ruleset
- `weight = 0`: No token issuance
- `duration = 0`: Never expires; must be explicitly replaced

### Terminals
`JBMultiTerminal` is the entry point for all fund operations:
- **pay**: Send tokens to a project, receive project tokens
- **cashOutTokensOf**: Burn project tokens to reclaim surplus
- **sendPayoutsOf**: Distribute funds to splits (payees)
- **useAllowanceOf**: Withdraw from surplus allowance
- **addToBalanceOf**: Add funds without minting tokens

Terminals support native ETH and any ERC-20. Each project configures accepted tokens via accounting contexts (token address + decimals + currency).

### Tokens
Dual token system managed by `JBTokens`:
1. **Credits**: Internal accounting (no ERC-20 transfer), stored as a mapping
2. **ERC-20**: Cloneable `JBERC20` with ERC20Votes+Permit

Credits are burned before ERC-20 tokens. Users can convert credits to ERC-20 via `claimTokensFor`. All tokens use 18 decimals.

### Bonding Curve (Cash Outs)
Cash outs return surplus based on the bonding curve in `JBCashOuts`:

```
reclaimAmount = (surplus * cashOutCount / totalSupply) *
                [(MAX_TAX - taxRate) + taxRate * cashOutCount / totalSupply] / MAX_TAX
```

- **taxRate = 0**: Linear redemption (proportional share)
- **taxRate = 10000 (100%)**: No cash outs allowed
- **cashOutCount >= totalSupply**: Returns entire surplus

The `totalSupply` includes pending (unminted) reserved tokens to prevent over-redemption.

### Fees
- Fixed 2.5% fee (`FEE = 25`, `MAX_FEE = 1000`)
- Applied to: payouts to non-feeless addresses, surplus allowance withdrawals, cash outs with non-zero tax rate
- Fees paid to project #1 (the NANA revnet)
- Held fees: projects can hold fees for 28 days; adding funds to balance can return held fees
- Forward formula: `amount * feePercent / MAX_FEE`
- Backward formula: `amount * MAX_FEE / (MAX_FEE - feePercent) - amount`

### Splits
Payouts are distributed to splits configured per project/ruleset:
- **beneficiary**: Direct address recipient
- **projectId**: Route to another project's terminal
- **hook**: Custom `IJBSplitHook` contract
- **percent**: Share of payout (9 decimals, total 1,000,000,000)
- **lockedUntil**: Locked splits cannot be removed until timestamp
- Fallback: If no splits for current ruleset, falls back to ruleset ID 0

### Permissions
256-bit packed permission system (`JBPermissions`):
- Each bit position is a permission ID (1-255)
- ROOT (ID 1) grants all permissions
- Wildcard `projectId = 0` grants permissions across all projects
- ROOT cannot be set for wildcard projectId
- ROOT operators can set non-ROOT permissions for specific projects

### Price Feeds
`JBPrices` manages currency conversion:
- Chainlink V3 price feeds with staleness checks
- Project-specific feeds with protocol default fallback
- Inverse prices auto-calculated
- L2 sequencer checks for Optimism/Arbitrum (`JBChainlinkV3SequencerPriceFeed`)

## Hook System

### Data Hooks
Set per ruleset. Called during payment and cash out recording to override economics:
- **Payment**: Override `weight` (token issuance rate) and specify pay hook amounts
- **Cash out**: Override `cashOutTaxRate`, `cashOutCount`, `totalSupply`, and specify cashout hook amounts
- Data hooks have **absolute control** over the values they return

### Pay Hooks
Called after payment is recorded. Receive funds and context:
- `JB721TiersHook`: Mints tiered NFTs based on payment amount
- `JBBuybackHook`: Compares mint vs. swap route, executes the better one

### Cash Out Hooks
Called after cash out is recorded:
- `JB721TiersHook`: Burns NFTs, calculates cash out weight
- `REVDeployer`: Manages revnet-specific cash out logic

### Split Hooks
Called when a split payout targets a hook contract:
- `UniV4DeploymentSplitHook`: Accumulates tokens for Uniswap V4 pool deployment

### Approval Hooks
Called when evaluating ruleset transitions:
- `JBDeadline`: Requires minimum delay before ruleset takes effect

## Revnets

Revnets are autonomous projects deployed by `REVDeployer`:
- Owned by the deployer contract (no human owner)
- Multi-stage lifecycle with predetermined parameters
- Each stage defines weight, weight cut, cash out tax, and hook configurations
- Stages transition based on ruleset duration/queuing
- Support for buyback hooks (Uniswap V4)
- Cross-chain bridging via suckers
- Token-collateralized loans via `REVLoans`

### REVLoans
Borrowers lock project tokens as collateral:
- Borrow amount based on bonding curve value of collateral
- 10-year liquidation schedule (`LOAN_LIQUIDATION_DURATION = 3650 days`)
- Fees paid to source revnet
- Collateral can be reallocated between loans

## Cross-Chain Bridging

`JBSucker` enables cross-chain token movement:
1. **prepare**: Cash out tokens on source chain, insert into outbox merkle tree
2. **Bridge**: Send tree root via chain-specific messenger (OP, Arbitrum, CCIP)
3. **claim**: Verify merkle proof on destination, mint/transfer tokens

**Implementations:**
- `JBOptimismSucker` / `JBBaseSucker`: Optimism Standard Bridge
- `JBArbitrumSucker`: Arbitrum Inbox + Gateway
- `JBCCIPSucker`: Chainlink CCIP

**Lifecycle:** ENABLED -> DEPRECATION_PENDING -> SENDING_DISABLED -> DEPRECATED

Token mappings are immutable once the outbox tree has entries.

## NFT System (721 Hook)

`JB721TiersHook` enables tiered NFT rewards:
- Each tier has: price, supply, category, discount, reserve frequency, voting units
- NFTs minted on payment based on amount paid
- Cash out weight based on original (undiscounted) tier price
- Discount percent (0-200, where 200 = DISCOUNT_DENOMINATOR = 100% discount)
- Reserve mints for beneficiaries based on frequency

## Defifa (Prediction Games)

`DefifaDeployer` creates prediction market games backed by Juicebox V6:
- Players buy tiered NFTs representing game outcomes (via the 721 hook)
- Game phases: COUNTDOWN -> MINT -> REFUND -> SCORING -> COMPLETE (or NO_CONTEST)
- After minting closes, a governance process ratifies a scorecard allocating the prize pool
- `DefifaGovernor` handles scorecard submission, attestation, and ratification
- Attestation power: per-tier, capped at `MAX_ATTESTATION_POWER_TIER` (1e9), proportional to holdings within tier
- Quorum: 50% of eligible tiers' attestation power
- Cash-out weights: `TOTAL_CASHOUT_WEIGHT` (1e18) distributed across tiers by scorecard
- Fee tokens: $DEFIFA and $BASE_PROTOCOL distributed proportional to mint price paid
- Split fees: 2.5% protocol (BASE_PROTOCOL_FEE_DIVISOR=40) + 5% Defifa (DEFIFA_FEE_DIVISOR=20)

Key contracts:
- `DefifaDeployer`: Game lifecycle management, ruleset queuing, commitment fulfillment
- `DefifaHook`: Extends JB721TiersHook — manages cash-out weights, fee token claims, attestation units
- `DefifaGovernor`: Scorecard submission/attestation/ratification governance
- `DefifaHookLib`: Pure/view helpers for cash-out weight computation, fee token claims

## Router Terminal

`JBRouterTerminal` accepts any ERC-20 token and routes payments to a project's primary terminal:
- Swaps incoming tokens to the project's accepted token via Uniswap V3 or V4
- Registers routes in `JBRouterTerminalRegistry`
- Supports slippage protection via `minAmountOut`
- Enables projects to accept any token without configuring every token as an accounting context

## Uniswap V4 Integration

Two repos handle UniV4:
- **univ4-router-v6**: `JBUniswapV4Hook` — a UniV4 hook contract with custom swap logic and TWAP oracle tracking, used by the buyback hook for price discovery
- **univ4-lp-split-hook-v6**: `UniV4DeploymentSplitHook` — a split hook that accumulates reserved tokens and deploys them into full-range UniV4 liquidity pools, with a deployer contract for creating new hook instances per pool

## Croptop

`CTDeployer` creates Croptop projects — decentralized NFT publishing platforms:
- Anyone can post content as new NFT tiers on a Croptop project
- Posts become 721 tiers with configurable price, supply, and category
- `CTPublisher` handles content posting and tier creation
- Built on top of revnet economics (uses REVDeployer internally)
- `CTProjectOwner` manages project ownership delegation

## Banny

`Banny721TokenUriResolver` provides dynamic SVG metadata for Banny NFTs:
- Composable character system with body + outfit layers
- Outfits are equippable/unequippable NFTs
- SVG metadata generated onchain
- Backed by a revnet treasury for economic sustainability

## Ecosystem Deployment

`deploy-all-v6/script/Deploy.s.sol` deploys the entire V6 ecosystem in a single Sphinx proposal across 8 chains (4 mainnets: Ethereum, Optimism, Base, Arbitrum + 4 testnets):

**Deployment phases:**
1. Core protocol (forwarder, permissions, projects, directory, splits, rulesets, prices, tokens, store, terminal)
2. Address registry
3. Hooks (721 tiers, buyback, router terminal, suckers)
4. Omnichain deployer
5. Periphery (controller, price feeds, deadlines)
6. Croptop project
7. Revnet project
8. Banny project

Deployment is executed directly via Sphinx using `Deploy.s.sol`.

## Key Invariants

Proven by the existing test suite:
- No flash-loan profit possible (12 attack vectors tested)
- Terminal balance >= sum of recorded project balances
- Total inflows >= total outflows (conservation)
- Fee project balance monotonically increases
- Token supply = creditSupply + erc20.totalSupply()
- Current ruleset always exists after launch
- Fee arithmetic: never undercharges, rounding bounded by N wei for N splits
