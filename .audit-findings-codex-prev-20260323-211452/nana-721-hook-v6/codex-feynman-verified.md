# Feynman Audit — Verified Findings

## Scope
- Language: Solidity 0.8.26
- Modules analyzed: all 34 Solidity files under `src/` and `script/`
- Functions analyzed: 211

## Verification Summary
| ID | Original Severity | Verdict | Final Severity |
|----|-------------------|---------|----------------|
| FF-001 | HIGH | TRUE POSITIVE | HIGH |

## Verified TRUE POSITIVE Findings

### Finding FF-001: Cross-currency split forwarding survives missing-price validation and traps funds
**Severity:** HIGH  
**Module:** `JB721TiersHook` / `JB721TiersHookLib` / `JBTerminalStore` / `JBMultiTerminal`  
**Function:** `beforePayRecordedWith()` / `_processPayment()` / `_computePayFrom()` / `_fulfillPayHookSpecificationsFor()`  
**Lines:** `src/JB721TiersHook.sol:178`, `src/JB721TiersHook.sol:707`, `src/libraries/JB721TiersHookLib.sol:168`, `src/libraries/JB721TiersHookLib.sol:235`, `node_modules/@bananapus/core-v6/src/JBTerminalStore.sol:1020`, `node_modules/@bananapus/core-v6/src/JBMultiTerminal.sol:1029`, `node_modules/@bananapus/core-v6/src/JBMultiTerminal.sol:1356`  
**Verification:** Hybrid — code trace + PoC `test/audit/CodexNemesis_CrossCurrencySplitNoPrices.t.sol`

**Feynman question that exposed this:**
> Why does the hook validate missing price feeds in `afterPayRecordedWith`, but still compute and return nonzero forwarded split amounts in `beforePayRecordedWith`?

**Why this is wrong:**
`beforePayRecordedWith()` always computes split amounts from tier prices. If the payment currency differs from the pricing currency and `PRICES == address(0)`, `convertSplitAmounts()` simply returns the original split amount unchanged instead of rejecting or zeroing it. Core then treats that amount as real hook-forwarded value, deducts it from the project balance diff, and calls `afterPayRecordedWith()` with native `msg.value` or an ERC-20 allowance.

`afterPayRecordedWith()` then calls `normalizePaymentValue()`. On the same missing-price condition it returns `(0, false)`, and `_processPayment()` exits immediately before minting, crediting leftover funds, or distributing the forwarded split amount. That leaves the system in a partially-fulfilled state:

- Native token path: the terminal already sent `msg.value` to the hook, so the forwarded amount stays trapped in the hook contract with no recovery path.
- ERC-20 path: the terminal already reduced store accounting and granted allowance to the hook, but the hook never pulls or redistributes the amount, leaving terminal balances and store balances out of sync.

**Verification evidence:**
- `JB721TiersHookLib.normalizePaymentValue()` returns invalid on missing prices at `src/libraries/JB721TiersHookLib.sol:144`.
- `JB721TiersHookLib.convertSplitAmounts()` does **not** invalidate on the same condition and instead returns the unconverted split amount at `src/libraries/JB721TiersHookLib.sol:252`.
- `JB721TiersHook.beforePayRecordedWith()` still returns that amount as a live pay-hook specification at `src/JB721TiersHook.sol:187-214`.
- Core deducts the specification amount from `balanceDiff` in `JBTerminalStore` at `node_modules/@bananapus/core-v6/src/JBTerminalStore.sol:1020-1038`.
- Core then transfers native value or increases ERC-20 allowance before invoking the pay hook at `node_modules/@bananapus/core-v6/src/JBMultiTerminal.sol:1029-1035` and `:1401-1410`.
- The hook exits early on the invalid normalization result at `src/JB721TiersHook.sol:711-719`, so distribution at `:724-736` never runs.
- PoC: `forge test --match-path test/audit/CodexNemesis_CrossCurrencySplitNoPrices.t.sol -vvv` passes and proves a 50% split on a cross-currency payment with `PRICES == 0` leaves `0.5 ether` stuck in the hook while minting nothing.

**Attack scenario:**
1. The project configures tiers in pricing currency `X`, allows split routing on those tiers, and deploys the hook with `PRICES == address(0)`.
2. A payer pays in a different currency `Y` and includes a split-bearing tier in pay metadata.
3. `beforePayRecordedWith()` returns a nonzero split amount and reduces issuance weight.
4. Core withholds/forwards that amount to the pay hook.
5. `afterPayRecordedWith()` exits early because the same currency mismatch is invalid for normalization.
6. The payer receives no NFT, no credits, and the forwarded split amount is stranded or unaccounted.

**Impact:**
- Conditional direct fund loss for native-token payments.
- Broken accounting / stranded funds for ERC-20 payments.
- The repo’s documented “cross-currency without prices just skips minting” behavior is false once split-bearing tiers are involved.

**Suggested fix:**
Reject the split path under the same condition that invalidates normalization. Minimal options:

```solidity
if (amountCurrency != pricingCurrency && address(prices) == address(0)) {
    return (0, bytes(""));
}
```

or make `beforePayRecordedWith()` revert on cross-currency split-bearing payments when `PRICES == address(0)`.

## False Positives Eliminated
- No additional Feynman suspects survived code-trace verification after tracing lazy reconciliation, hook auth, and documented discount/cash-out asymmetries.

## Downgraded Findings
- None.
