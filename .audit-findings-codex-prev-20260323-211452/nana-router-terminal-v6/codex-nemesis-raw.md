# N E M E S I S — Raw Findings

## Phase 0 Recon
- Language: Solidity
- Scope: all 9 Solidity files under `src/` and `script/`
- Attack goals:
  1. Trap user funds inside the stateless router.
  2. Turn registry forwarding into a value-loss or DoS boundary.
  3. Break swap/cashout routing assumptions with partial fills or callback ordering.
- Novel code:
  - `src/JBRouterTerminal.sol`: custom route discovery, cashout recursion, V3/V4 swap execution, and leftover handling.
  - `src/JBRouterTerminalRegistry.sol`: forwarding layer that changes caller context and token custody.
  - `src/libraries/JBSwapLib.sol`: custom sigmoid slippage math.
- Value stores:
  - In-flight router balances during `_acceptFundsFor` / `_handleSwap`.
  - Registry custody during forwarded `pay` / `addToBalanceOf`.
- Initial coupling hypothesis:
  - Caller who funds a route must remain coupled to any leftover refund.
  - Accepted input amount must remain coupled to the amount either swapped, forwarded, or refunded.

## Pass 1 — Feynman (full)
- Suspect A: `_handleSwap` snapshots `balanceBefore` after the router already holds the full ERC20 input, then refunds only if `balanceAfter > balanceBefore`.
- Suspect B: native refund path uses `_msgSender()` after registry forwarding.
- Suspect C: unresolved terminal in `JBRouterTerminalRegistry.addToBalanceOf` may burn ETH to `address(0)`.

## Pass 2 — State (full, enriched)
- Parallel-path mismatch confirmed:
  - Direct router native partial fill can refund the caller.
  - Registry-mediated native partial fill changes the refund recipient to the registry.
- No persistent storage desync was found in `defaultTerminal` / `_terminalOf` / `hasLockedTerminal`.
- Suspect C stayed open pending PoC.

## Pass 3 — Feynman Re-interrogation
- Verified A:
  - ERC20 partial fills decrease router input balance from `amount` to `leftover`.
  - The refund branch is unreachable, so unused ERC20 input remains in the router.
- Verified B:
  - Registry forwarding changes `_msgSender()` at refund time.
  - Native refund attempts target the registry and revert.
- Suspect C downgraded to false positive pending runtime test.

## Pass 4 — State Re-analysis
- No new coupled pairs or mutation paths.
- No additional registry/storage inconsistencies.
- Converged.

## Raw Findings

### RF-001
- Title: ERC20 partial fills strand unused input in `JBRouterTerminal`
- Severity: HIGH
- Source: Feynman Pass 1 → verified in Pass 3

### RF-002
- Title: Registry-mediated native partial fills revert on leftover refund
- Severity: MEDIUM
- Source: Pass 1 refund suspicion enriched by Pass 2 parallel-path comparison

### RF-003
- Title: `JBRouterTerminalRegistry.addToBalanceOf` without a terminal burns ETH
- Severity: MEDIUM
- Source: Feynman Pass 1
- Status after verification: FALSE POSITIVE

