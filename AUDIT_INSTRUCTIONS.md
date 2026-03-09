# Audit Instructions

You are auditing the Juicebox V6 smart contract ecosystem. Your goal is to find bugs that lose funds, break invariants, or enable unauthorized access. This document tells you where the money is, what to attack, and what assumptions to challenge.

Read [ARCHITECTURE.md](./ARCHITECTURE.md) and [DOC.md](./DOC.md) first for protocol context. Read [SECURITY.md](./SECURITY.md) for known risks and trust model. Then come back here.

## Scope

**In scope — all Solidity in these directories:**
```
nana-core-v6/src/                    # Core protocol (~10,700 lines)
nana-721-hook-v6/src/                # NFT hooks (~4,400 lines)
nana-buyback-hook-v6/src/            # DEX buyback (~1,500 lines)
nana-router-terminal-v6/src/         # Payment routing (~1,200 lines)
nana-suckers-v6/src/                 # Cross-chain bridging (~5,300 lines)
nana-omnichain-deployers-v6/src/     # Multi-chain deploy (~800 lines)
revnet-core-v6/src/                  # Revnets + loans (~3,200 lines)
croptop-core-v6/src/                 # NFT publishing (~1,200 lines)
banny-retail-v6/src/                 # Banny NFTs (~900 lines)
defifa-collection-deployer-v6/src/   # Prediction games (~3,800 lines)
univ4-lp-split-hook-v6/src/          # UniV4 LP management (~1,800 lines)
univ4-router-v6/src/                 # UniV4 hook (~800 lines)
deploy-all-v6/script/Deploy.s.sol    # Ecosystem deployment (1,572 lines)
```

**Also in scope:** All deployment scripts (`*/script/*.sol`). Hardcoded addresses, initialization parameter errors, and deployment ordering bugs are real vulnerabilities.

**Out of scope:** Test files (`*/test/`), OpenZeppelin/Solady/Uniswap dependencies (assume correct), forge-std.

## Where the Money Is

All project funds flow through `JBMultiTerminal`. Every project's ETH and ERC-20 balances are recorded in `JBTerminalStore`. The terminal holds real tokens; the store tracks accounting.

**Value extraction paths (ordered by risk):**
1. `cashOutTokensOf()` — burn tokens, reclaim surplus via bonding curve
2. `sendPayoutsOf()` — distribute funds to splits (payees)
3. `useAllowanceOf()` — withdraw from surplus allowance
4. `_processFee()` — 2.5% fee to project #1 on every outflow
5. `processHeldFeesOf()` — release or return held fees after 28 days
6. `REVLoans.borrowFrom()` — borrow against locked token collateral
7. `JBSucker.prepare()` → `claim()` — bridge tokens cross-chain

If you can extract more value than the protocol intends through any of these paths, that's a critical finding.

## What to Attack

### 1. Bonding Curve Manipulation

The cash out formula in `JBCashOuts.cashOutFrom()` (L20) determines how much surplus a token holder reclaims:

```
reclaimAmount = (surplus * count / supply) * [(MAX - tax) + tax * (count / supply)] / MAX
```

**Attack surface:**
- Can you manipulate `surplus` (via pay/addToBalance) to inflate reclaim?
- Can you manipulate `totalSupply` (including pending reserved tokens) to get a larger share?
- Can you flash loan to temporarily inflate your position?
- What happens when `cashOutCount >= totalSupply`? (Known: returns entire surplus)
- What happens when `totalSupply == 0` and surplus exists? (Known: returns entire surplus)
- Does the data hook's ability to override `cashOutTaxRate`, `cashOutCount`, and `totalSupply` create exploitable paths?

### 2. Data Hook Omnipotence

Data hooks override the economic parameters for both payments and cashouts. A data hook set in a ruleset's metadata has **absolute control** over:
- Payment: token minting weight, pay hook allocations
- Cashout: tax rate, cashout count, total supply, cashout hook allocations

**Attack surface:**
- Can a malicious data hook drain the treasury? (By design, yes — but can a LEGITIMATE data hook be tricked?)
- `JBBuybackHook` decides between minting and swapping. Can the swap path be sandwiched? Can the TWAP oracle be manipulated over time?
- `REVDeployer` acts as a data hook. Can its staged economics be exploited during stage transitions?
- `JBOmnichainDeployer` gives suckers 0% cashout tax. Can this be abused to bypass intended tax rates?

### 3. Cross-Function State Inconsistency

The protocol has no reentrancy guard. It relies on state ordering (CEI pattern). Look for:
- Functions that update `JBTerminalStore` balance but make external calls before the update is complete
- Pay hooks executing with tokens already minted but before all accounting is settled
- Split hooks receiving funds before payout limit is fully consumed
- Cashout hooks executing after beneficiary is paid but before fees are taken

**Specific pattern to trace:**
```
recordPaymentFrom() → [store updated] → mintTokensOf() → [tokens exist] → pay hooks execute
```
At the moment pay hooks execute, what can they do with the newly minted tokens? Can they cash out before the payment transaction completes?

### 4. Fee Arithmetic

Fees are 2.5% (`FEE = 25`, `MAX_FEE = 1000`). Two formulas in `JBFees`:
- Forward: `amount * feePercent / MAX_FEE`
- Backward: `amount * MAX_FEE / (MAX_FEE - feePercent) - amount`

**Attack surface:**
- Rounding: Can you structure payouts to N splits such that total fees collected are less than fee on the aggregate amount?
- Held fees: Can you add to balance to return held fees, then withdraw the added balance plus the returned fee amount?
- Fee-on-fee: When cashout hooks take fees, and the fee payment itself triggers hooks, is there a compounding issue?
- `JBFeelessAddresses`: Can feeless status be granted/revoked at a moment that causes inconsistency?

### 5. Ruleset Transitions

Rulesets form a linked list. When one expires, the next queued takes effect. If none is queued, the current one cycles with decayed weight.

**Attack surface:**
- Can you time a transaction to land exactly at a ruleset boundary and get better terms?
- Approval hooks can approve/reject transitions. What if an approval hook reverts? (Protocol has try-catch fallback — verify it's correct)
- `weight = 1` means "inherit decayed weight." Can this be exploited when chained across many cycles?
- Weight decay requires a cache after 20,000 iterations. What happens if the cache isn't updated? (`WeightCacheRequired` revert — verify DoS impact)

### 6. Cross-Chain Bridge

`JBSucker` uses merkle trees for cross-chain token movement.

**Attack surface:**
- Can you replay a claim with a different beneficiary? (Leaf hash includes beneficiary — verify)
- Can you prepare on chain A, then claim on chains B AND C? (Sucker pairs are 1:1 — verify)
- Token mapping immutability: once set, can it be changed through any path?
- CCIP amount validation is intentionally skipped (known M-28). Can this be exploited?
- Emergency hatch has no timelock. Can a compromised project owner rug via emergency hatch?
- Deprecation lifecycle: can a sucker in SENDING_DISABLED still have its outbox processed?

### 7. REVLoans Collateral

Borrowers lock project tokens and borrow against their bonding curve value.

**Attack surface:**
- Can you manipulate the bonding curve value of collateral (via surplus manipulation) to borrow more than the collateral is worth?
- 10-year liquidation schedule: what happens to the collateral's value over time if the project's surplus changes?
- Can you borrow, then increase your cashout value by manipulating surplus, then cash out the collateral for more than you borrowed?
- Collateral reallocation between loans: any state inconsistency during reallocation?

### 8. NFT Tier Economics (721 Hook + Defifa)

**Attack surface — 721 Hook:**
- Discount percent denominator is 200 (not 100). `discountPercent = 200` means 100% discount = free mint. Can you free-mint then cash out at full weight?
- Reserve mints based on frequency. Can timing be exploited to get more reserves than intended?
- Cash out weight is based on original tier price, not discounted price paid. Discount + cashout = profit?

**Attack surface — Defifa:**
- Whale attack: buy majority of 6+ tiers, control quorum, set favorable scorecard
- Dynamic quorum: uses live supply, not snapshot. Can you burn to lower quorum threshold?
- `computeCashOutWeight` uses integer division (`weight / tokens`). Dust is permanently locked — but can this be exploited at scale?
- Fee token claims: reserved mints get fee tokens proportional to tier price (not amount paid). Does this dilute real payers?
- Scorecard timeout: what happens if a valid scorecard exists but isn't ratified before timeout?
- Can game phase transitions be manipulated by timing ruleset changes?

### 9. Deployment Script

`deploy-all-v6/script/Deploy.s.sol` deploys the entire ecosystem in one Sphinx proposal.

**Attack surface:**
- Are contract addresses deterministic? Can an attacker front-run deployment?
- Are constructor arguments correct? Do permission grants match intended access?
- Are initial rulesets configured correctly? Wrong parameters could lock funds.
- Does deployment ordering matter? Can a partially-deployed state be exploited?
- Are Sphinx proposal permissions correctly scoped?

## Invariants to Verify

These MUST hold. If you can break any of them, it's a finding:

1. **Balance conservation**: `terminal.balance(token) >= sum(store.balanceOf(projectId, terminal, token))` for all projects
2. **Inflow >= Outflow**: Total funds received by a project >= total funds distributed
3. **Fee monotonicity**: Project #1's balance only increases over time
4. **Token supply consistency**: `JBTokens.totalSupplyOf(projectId) == creditSupply + erc20.totalSupply()`
5. **Ruleset existence**: After `launchProjectFor()`, `currentOf(projectId)` always returns a valid ruleset
6. **No flash-loan profit**: Pay + cashout in same block should never yield more than was paid (minus fees)
7. **Payout limits**: A project cannot extract more than its configured payout limit per ruleset cycle
8. **Surplus allowance**: A project cannot withdraw more than its configured surplus allowance per ruleset cycle
9. **Cross-chain conservation**: Tokens prepared on source == tokens claimable on destination (for a given tree root)
10. **NFT supply caps**: Minted count per tier never exceeds tier's initial supply
11. **Defifa prize pool conservation**: Total cashout value across all tiers == total project surplus (minus fees)

## Anti-Patterns to Hunt

These code patterns are where bugs hide in this codebase:

| Pattern | Where to look | Why it's dangerous |
|---------|--------------|-------------------|
| `try-catch` swallowing errors | JBMultiTerminal (hooks, fees, splits) | Failed external calls may silently change control flow |
| `mulDiv` rounding direction | JBCashOuts, JBFees, JBTerminalStore | Rounding in attacker's favor compounds over many txs |
| Mapping deletion without cleanup | JBSplits, JBRulesets, JBSucker | Stale data in related mappings |
| Array iteration without bounds | processHeldFeesOf, split distribution | Gas griefing or DoS |
| External calls to untrusted hooks | All hook execution paths | Reentrancy via hook callbacks |
| Price feed dependency | JBTerminalStore surplus calculation | Stale/manipulated prices affect cashout values |
| Permit2 metadata encoding | JBMultiTerminal._pay | Malformed metadata could bypass checks |
| Bit-packed metadata | JBRulesetMetadataResolver | Off-by-one in bit shifts = wrong flag values |

## How to Report Findings

For each finding, provide:

1. **Title** — one line, starts with severity (CRITICAL/HIGH/MEDIUM/LOW)
2. **Affected contract(s)** — exact file path and line numbers
3. **Description** — what's wrong, in plain language
4. **Trigger sequence** — step-by-step, minimal steps to reproduce
5. **Impact** — what an attacker gains, what a user loses (with numbers if possible)
6. **Proof** — code trace showing the exact execution path, or a Foundry test
7. **Fix** — minimal code change that resolves the issue

**Severity guide:**
- **CRITICAL**: Direct fund loss, permanent DoS, or system insolvency. Exploitable now with no preconditions.
- **HIGH**: Conditional fund loss, privilege escalation, or broken core invariant. Requires specific setup.
- **MEDIUM**: Value leakage, griefing with cost to attacker, incorrect accounting, degraded functionality.
- **LOW**: Informational, cosmetic inconsistency, edge-case-only with no material impact.

**False positive checklist — verify before reporting:**
- Is there a modifier, hook, or internal call that reconciles the state you think is inconsistent?
- Is the "stale" state intentionally lazily evaluated (updated on next read, not every write)?
- Does the protocol's try-catch fallback handle the failure case you're worried about?
- Is the economic attack actually profitable after gas costs and fees?
- Does Solidity 0.8.26's built-in overflow protection prevent the arithmetic issue?

## Testing Setup

```bash
# Clone everything
git clone --recursive https://github.com/Bananapus/version-6.git
cd version-6

# Build and test a single repo
cd nana-core-v6
npm install
forge build
forge test

# Run with high verbosity for debugging
forge test -vvvv --match-test testExploitName

# Write a PoC in test/audit/
forge test --match-path test/audit/ExploitPoC.t.sol -vvv
```

Each repo's tests are self-contained. Run `forge test` in any repo directory. For cross-repo interactions, write tests in the downstream repo (e.g., test a buyback hook exploit in `nana-buyback-hook-v6/test/`).

## Priority Order

Audit in this order. Earlier items have higher blast radius:

1. **JBMultiTerminal + JBTerminalStore** — all funds flow through here
2. **JBController** — token minting, reserved distribution, ruleset lifecycle
3. **JBRulesets** — weight decay, approval hooks, ruleset transitions
4. **REVLoans** — collateralized lending against bonding curve
5. **JBSucker** — cross-chain merkle tree bridge
6. **JBBuybackHook** — DEX integration, oracle manipulation surface
7. **JB721TiersHook + JB721TiersHookStore** — NFT economics, discount/cashout weight
8. **DefifaDeployer + DefifaHook + DefifaGovernor** — prediction game governance
9. **UniV4DeploymentSplitHook** — LP pool deployment, liquidity management
10. **JBRouterTerminal** — payment routing, swap slippage
11. **Deploy.s.sol** — deployment parameter correctness
12. **Everything else** — utilities, registries, constants

Go break it.
