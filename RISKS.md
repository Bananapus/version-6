# Juicebox V6 EVM - Security Considerations

This document describes known security properties, trust assumptions, and operational considerations for users and integrators of the Juicebox V6 protocol.

## Trust Model

### What You Trust When Using Juicebox V6

1. **The Core Protocol**: The terminal, controller, store, and supporting contracts are shared infrastructure. All projects share the same terminal and controller instances.

2. **Your Project Owner**: The project owner (ERC-721 holder) can queue new rulesets, set terminals, configure splits, and delegate permissions. A malicious or compromised owner can fundamentally change project economics.

3. **Your Data Hook**: If a ruleset specifies a data hook, that hook has **absolute control** over token minting weights and cash out parameters. A malicious data hook can drain the entire project treasury. Audit your data hooks with the same rigor as the terminal itself.

4. **Your Approval Hook**: Approval hooks can approve or reject ruleset transitions. A reverting approval hook doesn't freeze the project (try-catch fallback), but a malicious one could allow unexpected transitions.

5. **Price Feeds**: Surplus calculations depend on Chainlink price feeds. A stale or manipulated feed can affect cash out values and payout calculations. Feed staleness causes operation reverts (DoS), not fund loss.

6. **The Fee Project (#1)**: 2.5% fees go to project #1. If project #1's terminal is misconfigured, fees are returned to the originating project's balance (not lost).

### What You Do NOT Need to Trust

- **Other projects**: Each project's balance is isolated by terminal address in `JBTerminalStore`. One project cannot access another's funds.
- **Token holders**: Token holders can only cash out proportional to the bonding curve. The protocol enforces the curve math.
- **Permit2**: Optional. Projects work without Permit2 integration.

## Known Risks

### By Design

| Risk | Description | Mitigation |
|------|-------------|------------|
| Data hook omnipotence | Data hooks override bonding curve parameters | Only use audited, trusted data hooks |
| Last-holder advantage | Last token holder redeems remaining surplus at 1:1 | Bonding curve math; inherent to the design |
| Pending reserved inflation | Pending reserved tokens dilute cash out values | Call `sendReservedTokensToSplitsOf` regularly |
| No reentrancy guard | Protocol relies on CEI ordering, not mutex | State updates before all external calls |
| Weight cache requirement | Projects with >20k cycles need progressive cache updates | Anyone can call `updateRulesetWeightCache` |

### Operational

| Risk | Description | Mitigation |
|------|-------------|------------|
| Price feed DoS | Stale/reverting price feed blocks multi-currency operations | Monitor feed health; single-currency projects unaffected |
| Split gas exhaustion | Very large split arrays (100+) may exceed block gas | Keep split count reasonable (<50) |
| Held fee growth | Held fees array grows without cleanup | `_nextHeldFeeIndexOf` pointer skips processed entries |
| Sucker token immutability | Token mappings cannot be changed after first outbox entry | Verify mappings before first bridge operation |

### Defifa-Specific

| Risk | Description | Mitigation |
|------|-------------|------------|
| Whale tier dominance | Attacker buys majority of 6+ tiers, controls quorum | Per-tier attestation cap (1e9), but capital-intensive attack possible |
| Dynamic quorum | Quorum uses live supply, not snapshot — can change after grace period | `NothingToClaim` revert prevents burns during SCORING |
| Cash-out weight truncation | Integer division `weight/tokens` permanently locks dust | Bounded to ~1 wei per tier per game |
| Single governor | All games share one DefifaGovernor — bug affects all games | Design choice; governor logic is simple |
| Fee token dilution | Reserved mints get fee tokens proportional to tier price (not paid) | By design; reduces real payers' claims |

### REVLoans

| Risk | Description | Mitigation |
|------|-------------|------------|
| Collateral value manipulation | Attacker inflates surplus to borrow more, then deflates surplus | Borrow amount based on bonding curve value at time of borrow; surplus changes don't retroactively change existing loan terms |
| 10-year liquidation drift | Collateral's real value may diverge significantly from loan over 10 years | Liquidation schedule gradually releases collateral; loans can be repaid early |
| Collateral reallocation race | Reallocating collateral between loans could create moment of under-collateralization | Reallocation is atomic within a single transaction |

### UniV4 LP / Router

| Risk | Description | Mitigation |
|------|-------------|------------|
| LP pool deployment front-running | Pool deployment is permissionless once threshold is met | Pool parameters are deterministic from hook config |
| Router swap slippage | Token swaps through JBRouterTerminal can be sandwiched | `minAmountOut` parameter; users should set appropriate slippage |
| Stale route | Registered swap route may become suboptimal over time | Routes can be updated; not locked |

### Deployment

| Risk | Description | Mitigation |
|------|-------------|------------|
| Deployment ordering | Partially deployed state could be exploited between Sphinx phases | Sphinx proposals are atomic per phase; contracts aren't usable until fully wired |
| Hardcoded addresses | Deploy.s.sol contains hardcoded addresses for external contracts (Uniswap, Chainlink) | Addresses verified against canonical deployments per chain |
| Constructor parameter errors | Wrong initialization parameters could lock funds or grant wrong permissions | Deployment script tested via `forge build`; CI verifies compilation |

### MEV / Front-Running

| Risk | Description | Mitigation |
|------|-------------|------------|
| Buyback hook sandwich | Spot price fallback path (on oracle failure) is manipulable | TWAP primary path (5min min), sigmoid slippage, price limits |
| Rebalance sandwich | Permissionless `rebalanceLiquidity` in UniV4 LP hook | Min amount parameters provide some protection |
| Cash out front-running | Large cash outs visible in mempool | Use private mempools; `minTokensReclaimed` parameter |

## Security Properties (Proven)

These invariants are verified by the existing test suite:

1. **No flash-loan profit**: Tested across 12 attack vectors including multi-step, cross-terminal, and time-manipulation strategies
2. **Balance conservation**: Terminal ETH/token balance >= sum of all recorded project balances
3. **Inflow >= Outflow**: Total funds received >= total funds distributed
4. **Fee monotonicity**: Fee project (#1) balance only increases
5. **Token supply consistency**: `creditSupply + erc20.totalSupply() == totalSupply`
6. **Ruleset existence**: After launch, `currentOf(projectId)` always returns a valid ruleset
7. **Fee accuracy**: Forward and backward fee calculations are consistent within rounding bounds

## Reentrancy Analysis

The protocol uses no `ReentrancyGuard`. Instead, it relies on state ordering:

| Function | State Updated Before External Call | Risk Level |
|----------|-----------------------------------|------------|
| `_cashOutTokensOf` | Store balance deducted, tokens burned BEFORE transfer | LOW |
| `_pay` | Store balance added, tokens minted BEFORE pay hooks | LOW |
| `executePayout` | Payout limit recorded BEFORE split hook calls | LOW |
| `processHeldFeesOf` | Index updated BEFORE fee processing | LOW |
| `_sendReservedTokensToSplitsOf` | Pending balance zeroed BEFORE minting | LOW |
| Defifa `afterCashOutRecordedWith` | Tokens burned BEFORE state updates; terminal state committed | LOW |
| Defifa `fulfillCommitmentsOf` | `fulfilledCommitmentsOf` set BEFORE external calls | LOW |
| REVLoans `borrowFrom` | Collateral locked BEFORE funds transferred | LOW |
| REVLoans `repayLoan` | Loan state cleared BEFORE collateral returned | LOW |
| `JBRouterTerminal._swap` | Swap executed, then payment forwarded — no intermediate state exposure | LOW |

**Key defense**: `JBTerminalStore_InadequateTerminalStoreBalance` revert prevents extracting more than available balance regardless of reentrancy.

## Permission Security

- **ROOT (ID 1)** grants all permissions but **cannot** be set for wildcard `projectId = 0`
- ROOT operators **cannot** grant ROOT to other addresses
- Permission 0 is reserved and cannot be set
- All permission checks support ERC-2771 meta-transactions via trusted forwarder

## Cross-Chain Security

- Merkle proofs prevent double-claims (bitmap tracking per leaf index)
- Bridge roots only settable by authenticated remote peer
- Leaf hash includes beneficiary address (prevents replay with different recipient)
- CCIP amount validation intentionally skipped (M-28) to prevent token lockup
- Emergency hatch allows project owner to recover stuck tokens (instant, no timelock)
- Token mapping immutability prevents remapping after first use

## Recommendations for Project Owners

1. **Audit your data hooks** - They have complete control over your project's economics
2. **Set approval hooks** - Use `JBDeadline` to require minimum delay before ruleset changes
3. **Distribute reserved tokens regularly** - Pending reserves dilute cash out values
4. **Monitor price feeds** - Stale feeds block operations; consider single-currency setups
5. **Use `minTokensReclaimed`** - Always set slippage protection on cash outs
6. **Keep split arrays small** - Gas costs scale linearly with split count
7. **Test ruleset transitions** - Ensure your approval hooks don't unexpectedly block transitions
8. **Verify token mappings before bridging** - Cross-chain token mappings are immutable once used
9. **Be cautious with 100% discounts** - Setting `discountPercent = 200` on NFT tiers allows free minting with full cash out weight
10. **Defifa: Submit scorecards early** - A scorecard that reaches quorum but isn't ratified before `scorecardTimeout` becomes blocked
11. **Defifa: Delegation during MINT** - Token delegation is only possible during MINT phase; tokens transferred later inherit the sender's delegate or go to `address(0)`

## Recommendations for Integrators

1. **Use `try-catch` for terminal calls** - The terminal may revert if rulesets are paused or limits exceeded
2. **Check `controllerOf()` returns** - Returns `IERC165`, not `address`
3. **Check `primaryTerminalOf()` returns** - Returns `IJBTerminal`, not `address`
4. **Handle credit vs ERC-20** - Users may have credits that aren't transferable as ERC-20
5. **Monitor `FeeReverted` events** - Indicates fee processing failures (temporary, fees remain held)
6. **Support ERC-2771** - If using meta-transactions, ensure the trusted forwarder is configured
7. **Set slippage on router terminal payments** - `JBRouterTerminal` swaps can be sandwiched without `minAmountOut`
8. **Check loan health before relying on collateral** - REVLoans collateral value changes with surplus; don't assume stable LTV
9. **Verify sucker deprecation state** - Check `deprecationOf()` before initiating cross-chain operations
