# Feynman Audit — Verified Findings

## Scope
- Language: Solidity 0.8.26
- Modules analyzed: 9 Solidity files in `src/` and `script/`
- Functions analyzed: 92

## Verification Summary
| ID | Original Severity | Verdict | Final Severity |
|----|-------------------|---------|----------------|
| FF-001 | HIGH | TRUE POSITIVE | HIGH |
| FF-002 | MEDIUM | TRUE POSITIVE | MEDIUM |
| FF-003 | MEDIUM | FALSE POSITIVE | — |

## Verified TRUE POSITIVE Findings

### Finding FF-001: HIGH — ERC20 partial fills strand unused input in the router
**Module:** `JBRouterTerminal`
**Function:** `_handleSwap`
**Lines:** `src/JBRouterTerminal.sol:812-842`
**Verification:** Hybrid — code trace plus Foundry PoC `test_routerPartialFill_trapsUnusedErc20Input`

**Feynman Question that exposed this:**
> What does the post-swap balance delta actually measure after an ERC20 exact-input swap only consumes part of the approved input?

**Why this is wrong:**
`balanceBefore` is sampled after the router already holds the full ERC20 input. A partial fill reduces that balance from `amount` down to `leftover`, so `balanceAfter` is smaller than `balanceBefore`. The refund branch only runs when `balanceAfter > balanceBefore`, which can never happen for ERC20 leftovers. The router therefore keeps the unspent ERC20 input forever.

**Verification evidence:**
- Code trace:
  - `_acceptFundsFor` pulls the full input into the router before `_handleSwap`.
  - `_handleSwap` snapshots `IERC20(normalizedTokenIn).balanceOf(address(this))` into `balanceBefore`.
  - After a partial fill, the pool callback consumes only part of the input.
  - The refund branch at `if (balanceAfter > balanceBefore)` is unreachable for the leftover ERC20 path.
- PoC:
  - `forge test --match-path test/audit/CodexNemesis.t.sol -vvv`
  - `test_routerPartialFill_trapsUnusedErc20Input` passes.
  - The PoC swaps `1000` input units, consumes `600`, forwards `100` output units, and leaves `400` input units stranded in `JBRouterTerminal`.

**Attack scenario:**
1. A user pays through the router with an ERC20 that requires a swap.
2. The selected Uniswap pool only partially fills because `sqrtPriceLimitX96` is hit.
3. The router forwards the output amount to the destination terminal.
4. The unused ERC20 input remains stuck in the router instead of being refunded.

**Impact:**
- Direct user fund loss on any reachable ERC20 partial-fill route.
- The router is explicitly designed to be stateless and has no sweep function, so stranded ERC20 leftovers are practically unrecoverable.

**Suggested fix:**
Compute leftover from the pre-swap input amount rather than `balanceAfter - balanceBefore`, or snapshot the router balance before funds are accepted and separately track swap consumption.

### Finding FF-002: MEDIUM — Registry-routed native partial fills revert when the router refunds leftovers to the registry
**Module:** `JBRouterTerminal` / `JBRouterTerminalRegistry`
**Function:** `_handleSwap`, `_transferFrom`, `pay`
**Lines:** `src/JBRouterTerminal.sol:829-841`, `src/JBRouterTerminal.sol:929-935`, `src/JBRouterTerminalRegistry.sol:350-377`
**Verification:** Hybrid — code trace plus Foundry PoC `test_registryNativeInput_partialFillRevertsOnRefundToRegistry`

**Feynman Question that exposed this:**
> During a registry-mediated payment, who does `_msgSender()` resolve to at the exact point where leftover native input is refunded?

**Why this is wrong:**
When users call `JBRouterTerminalRegistry.pay`, the registry becomes the direct caller of `JBRouterTerminal.pay`. On native partial fills, `_handleSwap` wraps the raw leftover ETH into WETH, unwraps it again, and refunds it to `_msgSender()`. At that point `_msgSender()` is the registry contract, not the original user. `_transferFrom` therefore uses `Address.sendValue` to send ETH to the registry, which has no payable `receive`/`fallback`, so the entire payment reverts.

**Verification evidence:**
- Code trace:
  - `JBRouterTerminalRegistry.pay` forwards to `JBRouterTerminal.pay`.
  - `_handleSwap` refunds leftovers to `_msgSender()`.
  - `_transferFrom` turns native refunds into `Address.sendValue`.
  - The refund target is the registry contract, which cannot receive plain ETH.
- PoC:
  - `forge test --match-path test/audit/CodexNemesis.t.sol -vvv`
  - `test_registryNativeInput_partialFillRevertsOnRefundToRegistry` passes.
  - The PoC shows a registry-routed native payment reverting when a partial fill leaves `400` units of native input to refund.

**Attack scenario:**
1. A project is routed through the registry into the router.
2. A user pays with native ETH and the swap partially fills.
3. The router attempts to refund the leftover ETH to the registry.
4. The refund reverts, so the entire payment path is unusable for that partial-fill condition.

**Impact:**
- Registry-mediated native routes can become a hard DoS under legitimate partial-fill conditions.
- Integrators relying on the registry entrypoint lose availability exactly when slippage protection is most important.

**Suggested fix:**
Carry the original payer/refund recipient through the registry-to-router call chain and refund that address directly, or make the registry explicitly receive and forward native leftovers.

## False Positives Eliminated

### FF-003: Registry `addToBalanceOf` with no resolved terminal burns ETH to `address(0)`
- Verdict: FALSE POSITIVE
- Why: the call to `terminal.addToBalanceOf` reverts on the non-contract target before any value loss is committed. Verified with `test_registryAddToBalanceOf_withoutResolvedTerminal_reverts`.

