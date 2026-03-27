# N E M E S I S — Raw Working Notes

## Scope
- Fresh round. No prior findings consumed.
- In-scope Solidity: all files under `src/` and `script/` recursively.
- Files audited:
  - `src/JBBuybackHook.sol`
  - `src/JBBuybackHookRegistry.sol`
  - `src/libraries/JBSwapLib.sol`
  - `src/interfaces/IJBBuybackHook.sol`
  - `src/interfaces/IJBBuybackHookRegistry.sol`
  - `src/interfaces/IGeomeanOracle.sol`
  - `src/structs/SwapCallbackData.sol`
  - `script/Deploy.s.sol`
  - `script/helpers/BuybackDeploymentLib.sol`

## Phase 0 — Nemesis Recon

**Language:** Solidity 0.8.26

**Attack goals**
1. Force routing through the worse path and extract value from mint-vs-swap mispricing.
2. Abuse callback ordering to steal or strand terminal funds during swap settlement.
3. Break registry/default-hook resolution so project payments or pool setup become unusable.
4. Desynchronize terminal accounting from actual tokens held after partial swaps or fee-on-transfer behavior.

**Novel code**
- `src/JBBuybackHook.sol` — custom route-selection and V4 settlement glue.
- `src/libraries/JBSwapLib.sol` — custom TWAP/slippage/price-limit math.
- `src/JBBuybackHookRegistry.sol` — project-hook resolution and lock semantics.
- `script/Deploy.s.sol` — hardcoded PoolManager selection and default-hook initialization.

**Value stores + initial coupling hypotheses**
- Terminal payment value sits in the terminal until the pay hook diverts some/all of it.
  - Coupled state: hook token balance delta ↔ `addToBalanceOf` refund ↔ minted token count.
- Project-token buyback path holds bought project tokens transiently in the hook.
  - Coupled state: swap output ↔ burn amount ↔ reminted amount.
- Pool configuration is persistent protocol state.
  - Coupled state: `_poolKeyOf` ↔ `_poolIsSet` ↔ `twapWindowOf` ↔ `projectTokenOf`.
- Registry routing state controls which implementation may mint on behalf of a project.
  - Coupled state: `_hookOf` ↔ `defaultHook` ↔ `hasLockedHook` ↔ `isHookAllowed`.

**Complex paths**
- `beforePayRecordedWith` → terminal pay hook fulfillment → `afterPayRecordedWith` → `_swap` → `unlockCallback` → PoolManager swap → burn → refund leftover → remint.
- `beforeCashOutRecordedWith` → terminal burn → `afterCashOutRecordedWith` → remint → `_swapExactInput` → beneficiary payout.
- Registry resolution + lock/default fallback + hook-forwarded pool initialization.

**Priority order**
1. `JBBuybackHook.beforePayRecordedWith` / `afterPayRecordedWith`
2. `JBBuybackHook.unlockCallback` / `_swap`
3. `JBBuybackHook.beforeCashOutRecordedWith` / `afterCashOutRecordedWith`
4. `JBBuybackHookRegistry`
5. `DeployScript`

## Phase 1 — Unified Nemesis Map

| Function | Writes A | Writes B | Coupled Pair | Initial Sync Status |
|----|----|----|----|----|
| `_setPoolFor` | `_poolKeyOf` | `_poolIsSet`, `twapWindowOf`, `projectTokenOf` | pool config | synced |
| `setTwapWindowOf` | `twapWindowOf` | none | pool key ↔ twap | intended standalone mutation |
| `afterPayRecordedWith` | hook token balance delta | terminal refund + mint count | leftovers ↔ mint | synced |
| `_swap` | project token balance (via burn) | remint in caller | swap output ↔ supply | synced |
| `afterCashOutRecordedWith` | remint exact `cashOutCount` | swap proceeds to beneficiary | burned count ↔ sell amount | synced |
| `setHookFor` | `_hookOf` | none | hook ↔ lock/default | synced pending lock |
| `lockHookFor` | `hasLockedHook`, `_hookOf` | resolved default snapshot | hook ↔ lock | synced |
| `setDefaultHook` | `defaultHook` | `isHookAllowed` | default ↔ allowlist | synced |

## Pass 1 — Feynman (full)

### Core interrogations
- Why is buy-side route selection allowed to skip `_getQuote` on explicit payer quotes?
  - Answer: explicit min-out is user sovereignty, not protocol trust.
- Why is swap failure caught on buy side but not sell side?
  - Answer: buy side can degrade safely to minting; sell side cannot safely degrade after the holder initiated a cash-out route.
- Why are bought project tokens burned before remint?
  - Answer: to reapply reserved-percent logic uniformly across mint and swap routes.
- Why does registry forward project-pool setup without local hook existence checks?
  - Suspect: if no resolved hook exists, forwarding semantics degrade unexpectedly.

### Raw suspects
1. **S1 / LOW:** explicit quote path can construct hook specifications even when `_poolIsSet` is false because `poolId` is read from raw storage before `_getQuote` would return `PoolId.wrap(0)`.
2. **S2 / LOW:** registry `initializePoolFor` / `setPoolFor` do not explicitly revert on missing resolved hook.

## Pass 2 — State Inconsistency (full, enriched)

### Coupled pairs checked
- `_poolKeyOf` / `_poolIsSet` / `twapWindowOf` / `projectTokenOf`
- hook terminal-token balance / terminal refund / minted amount
- `_hookOf` / `defaultHook` / `hasLockedHook` / `isHookAllowed`
- swap output / burn / remint
- cash-out burn / remint / beneficiary proceeds

### State gaps searched
- functions that mutate pool metadata without the activation flag
- execution paths that refund leftover funds without matching mint accounting
- registry paths that mutate routing state without preserving default/lock invariants

### State-pass result
- No confirmed coupled-state desyncs.
- S1 and S2 remained as verification candidates only.

## Pass 3 — Targeted Feynman Re-interrogation

### On S1
- Why doesn’t `beforePayRecordedWith` require `_poolIsSet` before using explicit quotes?
  - Because the explicit quote path only decides whether to attempt a swap.
- What breaks downstream if the pool is absent?
  - `_swap` reverts inside `POOL_MANAGER.unlock`.
- Can attacker profit from choosing this sequence?
  - No. The path falls back to balance-delta mint/refund behavior, preserving no-worse-than-mint.

### On S2
- Why doesn’t registry pool-forwarding reject missing hooks locally?
  - The deployment model assumes a default hook is set immediately.
- What downstream function breaks?
  - Only operator setup flows in a misconfigured registry; not a fund-moving path after correct deployment.
- Can attacker choose a sequence to profit?
  - No. This is a setup footgun, not attacker-controlled privilege escalation or accounting drift.

## Convergence
- No new findings after targeted re-interrogation.
- No additional coupled pairs surfaced from the targeted pass.
- Nemesis converged after 3 passes: full Feynman, full State, targeted Feynman.

## Verification Evidence Collected
- Code traces:
  - `beforePayRecordedWith` [src/JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol#L686)
  - `_getQuote` [src/JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol#L1035)
  - registry pool forwarders [src/JBBuybackHookRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHookRegistry.sol#L196)
  - deploy-time default hook configuration [script/Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/script/Deploy.s.sol#L80)
- Test execution:
  - `forge test --match-contract Registry`
  - `forge test --match-contract JBSwapLibTest`
  - `forge test --match-contract TestAuditGaps`
  - `forge test`
    - Result: 148 tests passed; 5 fork tests failed only because the configured RPC endpoint returned HTTP 401.

## Raw Finding Counts
- 0 Critical
- 0 High
- 0 Medium
- 2 Low-confidence hypotheses
