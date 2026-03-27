# N E M E S I S — Verified Findings

## Scope
- Language: Solidity
- Modules analyzed: all 34 Solidity files under `src/` and `script/`
- Functions analyzed: 211
- Coupled state pairs mapped: 8
- Mutation paths traced: 19
- Nemesis loop iterations: 2 targeted re-passes after the full Feynman + full State passes (4 total passes)

## Nemesis Map (Phase 1 Cross-Reference)
| Function / Path | Writes / derives A | Writes / derives B | Coupling | Status |
|----|----|----|----|----|
| `beforePayRecordedWith()` | split amount | reduced weight | payment value ↔ forwarded split | synced only when conversion is valid |
| core `_computePayFrom()` | `balanceDiff -= spec.amount` | hook fulfillment obligation | project balance diff ↔ hook forwarding | synced |
| core `_fulfillPayHookSpecificationsFor()` | native `msg.value` / ERC-20 allowance | pay-hook context | forwarded amount ↔ hook execution | synced |
| `_processPayment()` | mints / credits / split distribution | consumes forwarded amount | forwarded amount ↔ reconciliation | **GAP on invalid normalization** |
| `recordMint()` | `remainingSupply--` | pending reserve constraint | supply ↔ reserve obligations | synced |
| `_update()` + `recordTransferForTier()` | ERC-721 ownership | tier balances | ownerOf ↔ tierBalanceOf | synced |
| `_didBurn()` + `recordBurn()` | burn count | outstanding supply | numberOfBurned ↔ total cash-out weight | synced |

## Verification Summary
| ID | Source | Coupled Pair | Breaking Op | Severity | Verdict |
|----|--------|-------------|-------------|----------|---------|
| NM-001 | Cross-feed P1→P2→P3 | pay-hook forwarded amount ↔ split distribution/reconciliation | `beforePayRecordedWith()` / `_processPayment()` | HIGH | TRUE POSITIVE |

## Verified Findings

### Finding NM-001: Cross-currency split payments with no price feed can trap forwarded funds in the hook
**Severity:** HIGH  
**Source:** Cross-feed P1→P2→P3  
**Verification:** Hybrid

**Coupled Pair:** `hookSpecifications.amount` ↔ `actual split distribution / restored project accounting`  
**Invariant:** A pay-hook amount deducted from terminal/store accounting must either be distributed to recipients or returned to project accounting. It cannot survive an early-return path.

**Feynman question that exposed it:**
> Why does the hook invalidate missing-price cross-currency payments only in `_processPayment()`, after core has already honored any split-bearing pay-hook specification from `beforePayRecordedWith()`?

**State Mapper gap that confirmed it:**
> `beforePayRecordedWith()` writes a live nonzero `hookSpecifications.amount`, core subtracts it from `balanceDiff` and forwards it, but `_processPayment()` can return at `src/JB721TiersHook.sol:719` before any distribution or credit update.

**Breaking Operation:** `beforePayRecordedWith()` at [src/JB721TiersHook.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721TiersHook.sol#L178)
- Modifies State A: computes `totalSplitAmount`, reduces token-minting `weight`, and returns a nonzero pay-hook specification.
- Does NOT guarantee State B: the matching fulfillment path later exits before minting, crediting, or split distribution when normalization is invalid.

**Trigger Sequence:**
1. Deploy a hook with `PRICES == address(0)` and pricing currency `X`.
2. Configure a tier with `splitPercent > 0`.
3. Pay in a different currency `Y` and include that tier in pay metadata.
4. `beforePayRecordedWith()` computes a split amount from tier pricing and returns it unchanged because `convertSplitAmounts()` treats `PRICES == 0` as success.
5. Core deducts that amount from `balanceDiff` and forwards native `msg.value` or ERC-20 allowance to the pay hook.
6. `_processPayment()` calls `normalizePaymentValue()`, gets `(0, false)`, and returns immediately.

**Consequence:**
- Native-token path: the forwarded value remains stuck in the hook contract with no sweep path.
- ERC-20 path: terminal/store accounting diverges because the terminal never transfers/distributes the excluded amount.
- The payer gets no NFT and no credits, even though part of the payment has already been carved out of the terminal-side flow.

**Verification Evidence:**
- Missing-price invalidation exists only in [src/libraries/JB721TiersHookLib.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/libraries/JB721TiersHookLib.sol#L128) at line 144.
- The split conversion path instead returns the original amount on the same condition in [src/libraries/JB721TiersHookLib.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/libraries/JB721TiersHookLib.sol#L235) at line 252.
- The hook uses that amount directly in [src/JB721TiersHook.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721TiersHook.sol#L178).
- Core subtracts the hook amount in `JBTerminalStore` and forwards funds in `JBMultiTerminal`:
  - `node_modules/@bananapus/core-v6/src/JBTerminalStore.sol:1020-1038`
  - `node_modules/@bananapus/core-v6/src/JBMultiTerminal.sol:1029-1035`
  - `node_modules/@bananapus/core-v6/src/JBMultiTerminal.sol:1356-1410`
- The hook returns before `distributeAll()` at [src/JB721TiersHook.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721TiersHook.sol#L707).
- PoC: [CodexNemesis_CrossCurrencySplitNoPrices.t.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/test/audit/CodexNemesis_CrossCurrencySplitNoPrices.t.sol#L14) proves a 50% split on a 1 ETH payment leaves `0.5 ether` trapped in the hook while minting nothing.

**Fix:**
Reject or zero split forwarding under the same condition that makes payment normalization invalid. For example:

```solidity
if (amountCurrency != pricingCurrency && address(prices) == address(0)) {
    return (0, bytes(""));
}
```

or revert in `beforePayRecordedWith()` whenever a cross-currency split-bearing payment is attempted without a prices contract.

## Feedback Loop Discoveries
- The bug did not appear from isolated hook review alone, because the terminal/core boundary is what turns the asymmetric missing-price behavior into trapped value.
- It also did not appear from pure state-mapping alone, because the missing synchronization is between hook-derived amounts and terminal fulfillment side effects, not two adjacent storage slots in the hook.

## False Positives Eliminated
- Removed-tier reserve minting still matches the documented soft-delete model.
- Discount/cash-out asymmetry is intentional and documented.
- Deterministic salt scoping across the two deployers is awkward but not hijackable.

## Downgraded Findings
- None.

## Summary
- Total functions analyzed: 211
- Coupled state pairs mapped: 8
- Nemesis loop iterations: 4 total passes
- Raw findings (pre-verification): 0 C | 1 H | 0 M | 0 L
- Feedback loop discoveries: 1
- After verification: 1 TRUE POSITIVE | 0 FALSE POSITIVE | 0 DOWNGRADED
- Final: 0 CRITICAL | 1 HIGH | 0 MEDIUM | 0 LOW
