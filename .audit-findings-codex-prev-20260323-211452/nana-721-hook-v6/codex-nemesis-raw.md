# N E M E S I S — Raw Findings

## Scope
- Fresh round on all Solidity under `src/` and `script/`
- `.audit/findings/` intentionally ignored as input
- Files reviewed: 34
- Functions reviewed: 211

## Phase 0 — Recon

**Language:** Solidity

**Attack goals**
1. Lock or misroute payer funds during NFT purchases.
2. Break supply / reserve / cash-out accounting so NFTs reclaim more or less than intended.
3. Bypass hook/project ownership boundaries during deployment or configuration.

**Novel code**
- `src/JB721TiersHook.sol`: custom pay/cashout hook with split forwarding and ERC-2771 ownership overlays.
- `src/JB721TiersHookStore.sol`: custom tier linked-list, reserve accounting, and soft-delete model.
- `src/libraries/JB721TiersHookLib.sol`: bespoke split conversion/distribution logic across core terminal boundaries.
- `src/JB721TiersHookProjectDeployer.sol`: custom project+hook launch wrapper that rewrites ruleset metadata.

**Value stores + initial coupling hypothesis**
- Terminal/store balances in core ↔ pay-hook specification amounts.
- `remainingSupply` ↔ pending reserve count / reserve mints.
- Tier price / pricing currency ↔ mint path / split conversion / cash-out weight.
- `payCreditsOf` ↔ leftover payment value.
- `tierBalanceOf` ↔ ERC-721 ownership / burn counts / voting units.

**Complex paths**
- `beforePayRecordedWith` → core `recordPaymentFrom` → core `_fulfillPayHookSpecificationsFor` → `afterPayRecordedWith` → `distributeAll`.
- `beforeCashOutRecordedWith` → core bonding-curve reclaim → `afterCashOutRecordedWith` → `_update` → store burn accounting.
- `launchProjectFor` / `launchRulesetsFor` / `queueRulesetsOf` with nested deployer salt scoping and ownership transfer.

## Phase 1 — Unified Map Highlights
- `beforePayRecordedWith()` writes derived split amount + weight, but not project/store balances directly.
- Core `JBTerminalStore._computePayFrom()` subtracts each hook amount from `balanceDiff`.
- Core `JBMultiTerminal._fulfillPayHookSpecificationsFor()` forwards native value or ERC-20 allowance before invoking the pay hook.
- `_processPayment()` is the only place that reconciles the forwarded split amount by calling `distributeAll()`.
- `normalizePaymentValue()` and `convertSplitAmounts()` treat missing price feeds differently.

## Pass 1 — Feynman (Full)

### Primary suspects
1. `JB721TiersHook.beforePayRecordedWith()` + `JB721TiersHook._processPayment()`
   - Question: why does missing-price invalidation happen only after core has already forwarded split value?
   - Suspect state: `hookSpecifications.amount`, issuance `weight`, forwarded native/ERC-20 value.
2. `JB721TiersHookProjectDeployer` deterministic salt chaining
   - Question: why is caller-scoping done in both project deployer and hook deployer layers?
   - Result after trace: non-issue, still unique and non-hijackable.
3. Store soft-delete and reserve minting
   - Question: why can removed tiers still mint reserves and contribute to cash-out weight?
   - Result after trace: intentional and documented.

## Pass 2 — State Inconsistency (Full, enriched by Pass 1)

### New coupled pair
- `hookSpecifications.amount` ↔ `actual split distribution or restored accounting`

### Gap
- On cross-currency payments with `PRICES == address(0)`:
  - `beforePayRecordedWith()` can still produce a nonzero split amount.
  - Core deducts and forwards that amount.
  - `_processPayment()` exits before mint/credits/distribution.
  - No path restores or consumes the forwarded amount.

### Raw finding candidate NM-RAW-001
- Severity hypothesis: HIGH
- Title: cross-currency split-bearing payments with no prices can trap forwarded funds and desync accounting

## Pass 3 — Feynman Re-Interrogation
- Root cause confirmed: `convertSplitAmounts()` returns success-on-no-prices, while `normalizePaymentValue()` returns invalid-on-no-prices.
- Downstream break confirmed:
  - Native path: forwarded ETH remains in the hook.
  - ERC-20 path: store accounting excludes the amount even though the terminal still holds it.
- Multi-tx angle checked: repeated ERC-20 payments accumulate unconsumed allowance / unaccounted terminal surplus.

## Pass 4 — State Re-Analysis
- No additional coupled pairs emerged from the root cause.
- Reserve, burn, voting-unit, and tier-balance mutation paths did not reveal a second verified inconsistency.

## Convergence
- Pass 4 produced no new findings, no new coupled pairs, and no new suspects.
- Nemesis loop converged after 4 passes.

## Verification Queue

### NM-RAW-001
- Method: Hybrid
- Code trace targets:
  - `src/libraries/JB721TiersHookLib.sol:128-159`
  - `src/libraries/JB721TiersHookLib.sol:168-265`
  - `src/JB721TiersHook.sol:178-215`
  - `src/JB721TiersHook.sol:707-736`
  - `node_modules/@bananapus/core-v6/src/JBTerminalStore.sol:1020-1038`
  - `node_modules/@bananapus/core-v6/src/JBMultiTerminal.sol:1029-1035`
  - `node_modules/@bananapus/core-v6/src/JBMultiTerminal.sol:1356-1410`
- PoC:
  - `forge test --match-path test/audit/CodexNemesis_CrossCurrencySplitNoPrices.t.sol -vvv`

## Raw Counts
- Raw findings: 0 CRITICAL | 1 HIGH | 0 MEDIUM | 0 LOW
