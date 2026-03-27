# State Inconsistency Audit — Verified Findings

## Coupled State Dependency Map
- `defaultTerminal` ↔ `_terminalOf[projectId]` ↔ `hasLockedTerminal[projectId]`
- Router in-flight input balance ↔ post-swap leftover refund path
- Caller context (`_msgSender()`) ↔ refund recipient on registry-mediated routes

## Mutation Matrix
- `defaultTerminal`: `setDefaultTerminal`, `disallowTerminal`
- `_terminalOf[projectId]`: `setTerminalFor`, `lockTerminalFor`
- `hasLockedTerminal[projectId]`: `lockTerminalFor`
- In-flight router balances: `_acceptFundsFor`, `uniswapV3SwapCallback`, `_handleSwap`, `_transferFrom`

## Parallel Path Comparison
- Direct router call vs. registry-mediated router call:
  - ERC20 partial fill: both paths leave unused ERC20 input in the router because `_handleSwap` never enters its refund branch.
  - Native partial fill: direct router call can refund the user, but registry-mediated call resolves `_msgSender()` to the registry and reverts on the ETH refund.

## Verification Summary
| ID | Coupled Pair | Breaking Op | Original Severity | Verdict | Final Severity |
|----|-------------|-------------|-------------------|---------|----------------|
| SI-001 | caller context ↔ refund recipient | `JBRouterTerminalRegistry.pay` → `JBRouterTerminal._handleSwap` | MEDIUM | TRUE POSITIVE | MEDIUM |

## Verified Findings

### Finding SI-001: Registry forwarding breaks the router’s native-leftover refund invariant
**Severity:** MEDIUM
**Verification:** Hybrid

**Coupled Pair:** Original payer ↔ leftover refund recipient
**Invariant:** A partial-fill refund must return unused input to the payer who funded the swap.

**Breaking Operation:** `pay()` in `JBRouterTerminalRegistry` forwards into `JBRouterTerminal.pay()`
- Modifies State A: the registry becomes the router’s `msg.sender`.
- Does NOT update State B: no original payer is forwarded for refund purposes.

**Trigger Sequence:**
1. User pays through the registry using native ETH.
2. The router executes a partial-fill swap.
3. `_handleSwap` refunds native leftovers to `_msgSender()`, which is now the registry.
4. `_transferFrom` attempts `Address.sendValue` to the registry and the refund reverts.

**Consequence:**
- Registry-mediated native partial fills are unavailable.
- The refund invariant holds for direct router callers but not for the registry path.

**Fix:**
Thread an explicit refund recipient through the registry forwarding path and use it instead of `_msgSender()` for leftover refunds.

## False Positives Eliminated
- No unresolved-terminal state desync was verified. `addToBalanceOf` reverts before any silent value loss occurs when no terminal is configured.

## Summary
- Coupled state pairs mapped: 3
- Mutation paths analyzed: 10
- Raw findings (pre-verification): 2
- After verification: 1 TRUE POSITIVE | 1 FALSE POSITIVE
- Final: 0 CRITICAL | 0 HIGH | 1 MEDIUM | 0 LOW

