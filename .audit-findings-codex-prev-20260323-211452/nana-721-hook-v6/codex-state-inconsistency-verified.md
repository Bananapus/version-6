# State Inconsistency Audit — Verified Findings

## Coupled State Dependency Map
- `hookSpecification.amount` ↔ `actual forwarded/distributed amount`
  Invariant: any amount deducted from terminal/store accounting and forwarded to the pay hook must either be distributed or returned to project accounting.
- `pricingContext.currency` ↔ `split conversion validity`
  Invariant: if cross-currency normalization is invalid, split forwarding must also be invalid.
- `terminal/store balanceDiff` ↔ `hook execution side effects`
  Invariant: funds removed from `balanceDiff` for pay hooks must not disappear on early-return paths.

## Mutation Matrix
| State Variable / Derived Value | Mutating Function | Updates Coupled State? |
|----|----|----|
| `hookSpecifications[i].amount` | `JB721TiersHook.beforePayRecordedWith()` | `✗ GAP when PRICES == 0 and currencies differ` |
| `balanceDiff` | `JBTerminalStore._computePayFrom()` | `✓` subtracts pay-hook amount |
| forwarded funds / allowance | `JBMultiTerminal._fulfillPayHookSpecificationsFor()` | `✓` forwards native value or grants ERC-20 allowance |
| split distribution / credits / minting | `JB721TiersHook._processPayment()` | `✗ skipped on invalid normalization` |

## Parallel Path Comparison
| Coupled State | Matching currency | Cross-currency with prices | Cross-currency without prices |
|----|----|----|----|
| Split amount ↔ actual distribution | `✓` | `✓` | `✗` |
| Forwarded amount ↔ minted/credited behavior | `✓` | `✓` | `✗` |

## Verification Summary
| ID | Coupled Pair | Breaking Op | Original Severity | Verdict | Final Severity |
|----|-------------|-------------|-------------------|---------|----------------|
| SI-001 | pay-hook forwarded amount ↔ distribution/reconciliation | `beforePayRecordedWith()` + `_processPayment()` | HIGH | TRUE POSITIVE | HIGH |

## Verified Findings

### Finding SI-001: Cross-currency no-price path deducts and forwards split funds without any reconciliation
**Severity:** HIGH  
**Verification:** Hybrid — code trace + PoC

**Coupled Pair:** `hookSpecifications.amount` ↔ `distribution / returned project accounting`  
**Invariant:** Any split amount deducted from the terminal-side payment flow must either be distributed to recipients or returned to project accounting.

**Breaking Operation:** `beforePayRecordedWith()` in `src/JB721TiersHook.sol:178`
- Modifies State A: returns a nonzero pay-hook amount and lowers weight.
- Does NOT update State B: the matching fulfillment path is later skipped by `_processPayment()` when `normalizePaymentValue()` returns invalid.

**Trigger Sequence:**
1. Deploy a hook with `PRICES == address(0)` and tiers priced in currency `X`.
2. Configure a tier with `splitPercent > 0`.
3. Pay in a different currency `Y` using that tier.
4. `beforePayRecordedWith()` computes a split amount and core forwards it.
5. `afterPayRecordedWith()` exits early on the same currency mismatch and never calls `distributeAll()`.

**Consequence:**
- Native-token split amount remains trapped in the hook.
- ERC-20 flow leaves funds in the terminal while store accounting already excluded them.
- Users are under-issued and the project’s real/token accounting diverges.

**Verification evidence:**
- Missing-price invalidation exists only in `normalizePaymentValue()` at `src/libraries/JB721TiersHookLib.sol:144`.
- `convertSplitAmounts()` returns the original amount on the same condition at `src/libraries/JB721TiersHookLib.sol:252`.
- Core removes the amount from `balanceDiff` at `node_modules/@bananapus/core-v6/src/JBTerminalStore.sol:1020-1038`.
- Core forwards native value / grants allowance at `node_modules/@bananapus/core-v6/src/JBMultiTerminal.sol:1401-1410`.
- Hook exits before `distributeAll()` at `src/JB721TiersHook.sol:719`.
- PoC: `test/audit/CodexNemesis_CrossCurrencySplitNoPrices.t.sol:14-117`.

**Fix:**
Unify the validity check so the split path cannot produce a nonzero `hookSpecifications.amount` when payment normalization is invalid.

## False Positives Eliminated
- Removed-tier reserve minting, discount updates on removed tiers, and tier-balance transfer accounting were traced and matched intended lazy/soft-delete semantics.

## Summary
- Coupled state pairs mapped: 8
- Mutation paths analyzed: 19
- Raw findings (pre-verification): 1
- After verification: 1 TRUE POSITIVE | 0 FALSE POSITIVE
- Final: 0 CRITICAL | 1 HIGH | 0 MEDIUM | 0 LOW
