# N E M E S I S — Raw Notes

## Scope
- Language: Solidity 0.8.26
- Files:
  - `src/JBUniswapV4Hook.sol`
  - `src/libraries/Oracle.sol`
  - `script/Deploy.s.sol`
  - `script/helpers/Univ4RouterDeploymentLib.sol`
- Functions scanned: 34

## Phase 0 — Recon

### Attack Goals
1. Break Uniswap v4 flash accounting during JB rerouting and extract or strand assets.
2. Force systematic routing to a worse path and steal value via stale or manipulable pricing.
3. Corrupt oracle state so TWAP reads revert or fall back to spot indefinitely.
4. Misdeploy the hook with wrong flags or chain addresses and silently disable protections.

### Novel Code
- `src/JBUniswapV4Hook.sol`
  - Novel router/hook composition between Uniswap v4 flash accounting and Juicebox terminals.
- `src/libraries/Oracle.sol`
  - Custom retained-observation policy and hook-driven write cadence on top of the V3-style oracle.
- `script/Deploy.s.sol`
  - Chain-specific PoolManager selection and CREATE2 hook flag mining.

### Value Stores + Initial Coupling Hypothesis
- PoolManager flash-accounting balances
  - Coupled to `BeforeSwapDelta` returned by `_beforeSwap` and to `_settleOutput(...)`.
- Oracle `observations[poolId]`
  - Coupled to `states[poolId]` (`index`, `cardinality`, `cardinalityNext`).
- JB route decision
  - Coupled to `amountOutMin`, current ruleset data, terminal availability, and output settlement.
- Deployment salt/address mining
  - Coupled to exact hook flags and per-chain PoolManager address selection.

### Complex Paths
- `beforeSwap -> estimate route -> poolManager.take -> terminal.pay/cashOutTokensOf -> CurrencySettler.settle`
- `afterSwap/afterAddLiquidity/afterRemoveLiquidity -> _recordObservation -> Oracle.write/grow`

### Priority Order
1. `_beforeSwap` + `_routeThroughJuicebox`
2. `_recordObservation` + `Oracle.observeSingle/binarySearch`
3. Deployment script chain/address and hook-flag flow

## Phase 1A — Function-State Matrix

| Function | Reads | Writes | Guards | External Calls |
|---|---|---|---|---|
| `calculateExpectedOutputFromSelling` | none local; terminal fee/preview | none | none | terminal preview, fee lookup |
| `calculateExpectedTokensWithCurrency` | ruleset, prices, token decimals | none | none | controller, prices, token metadata |
| `estimateUniswapOutput` | oracle state, slot0, liquidity | none | none | poolManager |
| `observe` | oracle state, slot0, liquidity | none | none | poolManager |
| `observeTWAP` | observations | none | `secondsAgo != 0` | none |
| `_afterInitialize` | none | `states[poolId]`, `observations[poolId][0]` | hook permissioned | none |
| `_afterAddLiquidity` | pool state | oracle state | hook permissioned | poolManager |
| `_afterRemoveLiquidity` | pool state | oracle state | hook permissioned | poolManager |
| `_afterSwap` | hookData, delta, pool state | oracle state | hook permissioned | poolManager |
| `_beforeSwap` | `_routing`, hookData, token/project mapping, terminal lookup, ruleset/prices, oracle | may trigger JB route effects | `_routing == false`, exact-input only, hookData length == 32 | tokens, directory, controller, prices, poolManager, terminal |
| `_recordObservation` | pool state, oracle state | oracle state | none | poolManager |
| `_routeThroughJuicebox` | currencies, terminal | `_routing`; token approvals; PoolManager settlement side effects | caller ensured terminal exists | poolManager, terminal, ERC20 |
| `Deploy.run` | env, chainid | none | none | CoreDeploymentLib, HookMiner |
| `Deploy._getPoolManager` | `block.chainid` | none | supported-chain check | none |
| `Univ4RouterDeploymentLib.getDeployment` | `block.chainid`, filesystem JSON path | none | supported-chain check | SphinxConstants constructor, `readFile` |

## Phase 1B — Coupled State Dependency Map

| Pair | Invariant |
|---|---|
| `observations[poolId]` ↔ `states[poolId]` | `index < cardinality <= cardinalityNext <= 1024`; oldest/newest lookup must reflect populated window |
| `poolManager.take(...)` ↔ `_settleOutput(...)` ↔ returned `BeforeSwapDelta` | every JB-routed flash-accounting take must be matched by correct settlement and delta encoding |
| `hookData amountOutMin` in `_beforeSwap` ↔ `_afterSwap` slippage check | JB-routed swaps enforce min in terminal call; V4-routed swaps enforce min against realized delta |
| `token normalization` ↔ `terminal lookup/payment/cashout` | native ETH must map to JB native token only on terminal-facing paths, never on PoolManager-facing paths |
| `Deployment flags` ↔ mined hook address | deployed address must encode exact enabled callbacks |

## Phase 1C — Cross-Reference

| Function | Coupled Pair | Sync Status |
|---|---|---|
| `_afterInitialize` | `observations` ↔ `states` | synced |
| `_recordObservation` | `observations` ↔ `states` | synced |
| `_afterSwap` | `amountOutMin` ↔ realized output | synced |
| `_beforeSwap` | route decision ↔ terminal availability/output estimate | synced, but relies on assumptions about estimate accuracy |
| `_routeThroughJuicebox` | `take` ↔ `settle` ↔ delta | synced if terminal behavior matches interface assumptions |
| `Deploy.run` | flags ↔ hook address | synced |

## Pass 1 — Feynman Findings/Suspects

### Closed Suspect F1
- Area: buy-side estimate uses static ruleset weight rather than terminal preview.
- Why flagged:
  - `calculateExpectedTokensWithCurrency(...)` reads `currentRulesetOf(...)` directly instead of `previewPayFor(...)`.
- Result:
  - Not a new finding. This is explicitly documented in repo comments and `RISKS.md` as a known composition limit with pay-side data hooks.

### Closed Suspect F2
- Area: strict `hookData.length == 32` in `_beforeSwap` versus `>= 32` in `_afterSwap`.
- Why flagged:
  - Potential asymmetry between pre-swap route handling and post-swap slippage checks.
- Result:
  - Not a new finding. Already documented. No new downstream invariant break was found beyond the known metadata-format restriction.

### Closed Suspect F3
- Area: `_routing` boolean around external terminal calls.
- Why flagged:
  - Needed to confirm revert paths do not leave `_routing = true`.
- Result:
  - False positive. Any revert in `_routeThroughJuicebox(...)` unwinds the storage write, and existing regression coverage for sell-path and buy-path reentrancy passed.

### Closed Suspect F4
- Area: force-approve and lingering ERC20 allowance.
- Why flagged:
  - External call made after approval.
- Result:
  - False positive. `forceApprove` intentionally resets exact allowance, and regression coverage exists for partial-consumption scenarios.

### Closed Suspect F5
- Area: observation growth and same-block write no-op.
- Why flagged:
  - Needed to check whether `cardinalityNext` could diverge from actual writable window in a way that breaks TWAP.
- Result:
  - False positive. The temporary `cardinalityNext > cardinality` state is intentional; `Oracle.write(...)` advances `cardinality` only on the next eligible block, preserving ordering.

## Pass 2 — State Inconsistency Findings/Gaps

No uncoupled mutation path survived trace review.

Checked specifically:
- `_afterInitialize`, `_recordObservation`, `Oracle.write`, `Oracle.grow`
- `_beforeSwap`, `_afterSwap`, `_routeThroughJuicebox`, `_settleOutput`
- `Deploy.run`, `_getPoolManager`, deployment helper JSON resolution

No path was found that mutates one side of a required pair without the counterpart update.

## Targeted Re-Interrogation (Pass 3 / Pass 4)

Re-checked the only meaningful cross-feed targets:

1. Route estimate assumptions
   - Static buy-side estimate is a documented limitation, not a hidden inconsistency.
2. Flash-accounting settlement path
   - `poolManager.take(...)` is always followed by terminal transform and `CurrencySettler.settle(...)` in the same call path.
3. Oracle state update cadence
   - Same-block dedup and growth behavior are coherent with the ring-buffer invariants.

Convergence reached with no new deltas.

## Raw Candidate Log

| ID | Candidate | Status | Reason Closed |
|---|---|---|---|
| RAW-1 | Pay-side data-hook estimate drift | closed | documented accepted risk |
| RAW-2 | `hookData` length asymmetry | closed | documented behavior, no new exploit path |
| RAW-3 | `_routing` stuck on revert | closed | EVM revert unwinds flag |
| RAW-4 | lingering allowance on terminal | closed | `forceApprove` exact-reset behavior |
| RAW-5 | oracle growth / same-block desync | closed | intended ring-buffer behavior |

## Verification Notes

- `forge build` succeeded.
- Passed:
  - `forge test --match-contract ThreeWayRouting -q`
  - `forge test --match-contract OracleDeepTest -q`
  - `forge test --match-contract JBUniswapV4Hook -q`
  - `forge test --match-contract SellPathReentrancy -q`

## Residual Gaps

- I did not independently validate the hardcoded PoolManager addresses in `script/Deploy.s.sol` against current external Uniswap deployment records during this round.
- No new PoC was written because no C/H/M candidate survived trace verification.
