# Risks

Trust assumptions, known risks, and security properties of Juicebox V6. For per-repo risk details, see each repo's `RISKS.md`. For audit findings, see [AUDIT.md](./AUDIT.md).

## Trust Model

### What You Trust When Using Juicebox V6

1. **The Core Protocol**: Terminal, controller, store, and supporting contracts are shared infrastructure. All projects share the same contract instances. A bug in `JBMultiTerminal` affects every project.

2. **Your Project Owner**: The project owner (ERC-721 holder) can queue new rulesets, set terminals, configure splits, and delegate permissions. A malicious or compromised owner can fundamentally change project economics between rulesets.

3. **Your Data Hook**: If a ruleset specifies a data hook, that hook has **absolute control** over token minting weights and cash out parameters. A malicious data hook can drain the entire project treasury. This is by design — project owners choose their hooks. Audit your data hooks with the same rigor as the terminal itself.

4. **Your Approval Hook**: Approval hooks approve or reject ruleset transitions. A reverting approval hook falls back to the basedOnId chain (try-catch), but a malicious one could allow unexpected transitions.

5. **Price Feeds**: Surplus calculations depend on Chainlink price feeds. A stale or manipulated feed causes operation reverts (DoS), not direct fund loss.

6. **The Fee Project (#1)**: 2.5% fees go to project #1. If project #1's terminal reverts, fees are returned to the originating project's balance (try-catch fallback).

### What You Do NOT Need to Trust

- **Other projects**: Each project's balance is isolated by `(terminal, projectId, token)` in `JBTerminalStore`. One project cannot access another's funds.
- **Token holders**: Token holders can only cash out proportional to the bonding curve. The protocol enforces the curve math.
- **Permit2**: Optional. Projects work without Permit2 integration.

## Known Risks — By Design

| Risk | Description | Mitigation |
|------|-------------|------------|
| Data hook omnipotence | Data hooks override bonding curve parameters | Only use audited, trusted data hooks |
| Last-holder advantage | Last token holder redeems remaining surplus at 1:1 | Bonding curve math; inherent to the design |
| Pending reserved inflation | Pending reserved tokens dilute cash out values | Call `sendReservedTokensToSplitsOf` regularly |
| No reentrancy guard | Protocol relies on CEI ordering, not mutex | State updates before all external calls |
| Weight cache requirement | Projects with >20k cycles need progressive cache updates | Anyone can call `updateRulesetWeightCache` |
| Fee-on-fee compounding | Fees on hooks that themselves trigger fees | Each fee layer is bounded; no unbounded recursion |

## Operational Risks

| Risk | Description | Mitigation |
|------|-------------|------------|
| Price feed DoS | Stale/reverting price feed blocks multi-currency operations | Monitor feed health; single-currency projects unaffected |
| Split gas exhaustion | Very large split arrays (100+) may exceed block gas | Keep split count reasonable (<50) |
| Held fee storage growth | Held fees array grows without cleanup | `_nextHeldFeeIndexOf` pointer skips processed entries |
| Sucker token immutability | Token mappings cannot be changed after first outbox entry | Verify mappings before first bridge operation |

## MEV / Front-Running Risks

| Risk | Description | Mitigation |
|------|-------------|------------|
| Buyback hook sandwich | Spot price fallback on oracle failure is manipulable | TWAP primary (5min min), sigmoid slippage, price limits |
| Rebalance sandwich | Permissionless `rebalanceLiquidity` in LP hook | Min amount parameters; limited protection |
| Cash out front-running | Large cash outs visible in mempool | Use private mempools; `minTokensReclaimed` parameter |
| LP pool deploy sandwich | Pool initialization at non-market price | Pool parameters deterministic from hook config |
| Fee collection MEV | Permissionless `collectAndRouteLPFees` with `minReturnedTokens: 0` | Add access control or slippage protection |

## Subsystem-Specific Risks

### REVLoans

| Risk | Description | Mitigation |
|------|-------------|------------|
| Collateral value drift | Bonding curve value changes with surplus over 10-year liquidation | Liquidation schedule gradually releases collateral |
| Stage transition stranding | Active loans may become underwater after stage transition | Borrowers should monitor stage timelines |
| Fee terminal revert DoS | Fee payments during loan ops not wrapped in try-catch | Fix: add try-catch |

### 721 Hook (NFTs)

| Risk | Description | Mitigation |
|------|-------------|------------|
| Free mint arbitrage | 100% discount (`discountPercent = 200`) + cash out weight based on undiscounted price | Cap discount below 100% or weight by paid price |
| Split overflow | `splitPercent` not validated against `SPLITS_TOTAL_PERCENT` | Add validation in `recordAddTiers` |
| Split fund loss | Funds silently dropped when split terminal not found | Revert on missing terminal |
| Price mismatch in splits | Split amounts use undiscounted tier price | Apply discount before computing splits |

### Cross-Chain (Suckers)

| Risk | Description | Mitigation |
|------|-------------|------------|
| Emergency hatch rug | No timelock on emergency hatch token recovery | Compromised owner key can drain bridge |
| CCIP amount skip | Amount validation intentionally skipped to prevent lockup | CCIP failures extremely rare; authentication strong |

### Defifa (Prediction Games)

| Risk | Description | Mitigation |
|------|-------------|------------|
| Whale tier dominance | Attacker buys majority of 6+ tiers, controls quorum | Per-tier cap at 1e9, but capital-intensive attack possible |
| Dynamic quorum | Quorum uses live supply, not snapshot | Burns during SCORING prevented |
| Grace period bypass | Early-submitted scorecards may expire before attestations begin | Fix `gracePeriodEnds` calculation |
| Fulfillment blocks ratification | `fulfillCommitmentsOf` revert blocks scorecard permanently | Add try-catch around fulfillment |

### LP Split Hook (UniV4)

| Risk | Description | Mitigation |
|------|-------------|------------|
| Fee routing placeholder | `_getAmountForCurrency` returns hardcoded 0 | Replace with actual balance tracking |
| Cross-token corruption | Single accumulator for multi-token projects | Key by `(projectId, token)` |
| No reentrancy protection | External calls without ReentrancyGuard | Add guard to all entry points |
| Position bricking | Stale `tokenIdOf` after zero-liquidity rebalance | Update token ID on position burn |
| Re-initialization | `initialize()` callable again after `renounceOwnership` | Add initialized guard |

## Security Properties (Proven)

These invariants are verified by the test suite (165 test files):

1. **No flash-loan profit**: Tested across 12 attack vectors including multi-step, cross-terminal, and time-manipulation strategies
2. **Balance conservation**: Terminal ETH/token balance >= sum of all recorded project balances
3. **Inflow >= Outflow**: Total funds received >= total funds distributed
4. **Fee monotonicity**: Fee project (#1) balance only increases
5. **Token supply consistency**: `creditSupply + erc20.totalSupply() == totalSupply`
6. **Ruleset existence**: After launch, `currentOf(projectId)` always returns a valid ruleset
7. **Fee accuracy**: Forward and backward fee calculations consistent within rounding bounds

## Reentrancy Analysis

The protocol uses no `ReentrancyGuard`. It relies on state ordering (CEI pattern):

| Function | State Before External Call | Risk |
|----------|---------------------------|------|
| `_cashOutTokensOf` | Balance deducted, tokens burned BEFORE transfer/hooks | LOW |
| `_pay` | Balance added, tokens minted BEFORE pay hooks | LOW |
| `executePayout` | Payout limit recorded BEFORE split hook calls | LOW |
| `processHeldFeesOf` | Index updated BEFORE fee processing | LOW |
| `_sendReservedTokensToSplitsOf` | Pending balance zeroed BEFORE minting | LOW |
| `REVLoans.borrowFrom` | Collateral locked BEFORE funds transferred | LOW |
| `REVLoans.repayLoan` | Loan state cleared BEFORE collateral returned | LOW |

**Key defense**: `JBTerminalStore_InadequateTerminalStoreBalance` revert prevents extracting more than available balance regardless of reentrancy.

**Gap**: Complex cross-function reentrancy (hook calling back into a *different* terminal function) is not explicitly prevented. The LP split hook has no reentrancy protection at all.

## Recommendations

**For project owners:**
1. **Audit your data hooks** — they control your project's economics
2. **Set approval hooks** — use `JBDeadline` to require minimum delay before ruleset changes
3. **Distribute reserved tokens regularly** — pending reserves dilute cash out values
4. **Always set `minTokensReclaimed`** — slippage protection on cash outs
5. **Verify token mappings before bridging** — cross-chain token mappings are immutable once used

**For integrators:**
1. **Use `try-catch` for terminal calls** — the terminal may revert if rulesets are paused or limits exceeded
2. **Set slippage on router terminal payments** — `JBRouterTerminal` swaps can be sandwiched without `minAmountOut`
3. **Check loan health dynamically** — REVLoans collateral value changes with surplus; don't assume stable LTV
4. **Monitor `FeeReverted` events** — indicates fee processing failures (temporary, fees remain held)

See [SKILLS.md](./SKILLS.md) for API gotchas (return types, currency conventions, etc.).
