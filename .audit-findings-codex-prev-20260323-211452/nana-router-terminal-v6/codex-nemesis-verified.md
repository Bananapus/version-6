# N E M E S I S — Verified Findings

## Scope
- Language: Solidity
- Modules analyzed: 9 Solidity files
- Functions analyzed: 92
- Coupled state pairs mapped: 3
- Mutation paths traced: 10
- Nemesis loop iterations: 4 passes (Feynman → State → Feynman → State)

## Verification Summary
| ID | Source | Coupled Pair | Breaking Op | Severity | Verdict |
|----|--------|-------------|-------------|----------|---------|
| NM-001 | Feynman-only | input amount ↔ leftover refund | `_handleSwap()` | HIGH | TRUE POS |
| NM-002 | Cross-feed P1→P2 | payer context ↔ refund recipient | `JBRouterTerminalRegistry.pay()` → `_handleSwap()` | MEDIUM | TRUE POS |
| NM-003 | Feynman-only | unresolved terminal ↔ forwarded value | `JBRouterTerminalRegistry.addToBalanceOf()` | MEDIUM | FALSE POS |

## Verified Findings (TRUE POSITIVES only)

### Finding NM-001: HIGH — ERC20 partial fills trap unused input in the router
**Severity:** HIGH
**Source:** Feynman-only
**Verification:** Hybrid

**Coupled Pair:** Input amount accepted by the router ↔ unused input refunded after swap
**Invariant:** For a partial fill, `accepted input = consumed input + refunded leftover`.

**Feynman Question that exposed it:**
> After a partial ERC20 fill, how can `balanceAfter > balanceBefore` ever become true if the router already held the full input before the swap started?

**State Mapper gap that confirmed it:**
> The ERC20 partial-fill path mutates the router’s input-token balance in the callback but has no mutation path that ever transfers the leftover back out when `balanceAfter < balanceBefore`.

**Breaking Operation:** `_handleSwap()` at `src/JBRouterTerminal.sol:812-842`
- Modifies State A: the pool callback consumes only part of the router’s input balance.
- Does NOT update State B: the leftover refund branch is skipped because it only handles `balanceAfter > balanceBefore`.

**Trigger Sequence:**
1. User pays the registry or router with an ERC20 that must be swapped.
2. `_acceptFundsFor` moves the full input into the router.
3. The chosen Uniswap pool partially fills because the price limit is hit.
4. `_handleSwap` forwards the output amount.
5. The remaining ERC20 input stays inside the router.

**Consequence:**
- The user loses the unused portion of the ERC20 input.
- The router is intended to be stateless and exposes no rescue path, so the leftover is practically unrecoverable.

**Verification Evidence:**
- Code trace:
  - `src/JBRouterTerminal.sol:813` snapshots the full post-acceptance router balance.
  - `src/JBRouterTerminal.sol:837-841` only refunds when `balanceAfter > balanceBefore`.
  - Partial ERC20 fills necessarily leave `balanceAfter < balanceBefore`.
- PoC:
  - `test/audit/CodexNemesis.t.sol`
  - `test_routerPartialFill_trapsUnusedErc20Input`
  - Swap input: `1000`
  - Consumed by pool: `600`
  - Forwarded output: `100`
  - Left stranded in router: `400`

**Fix:**
Refund `amount - actualAmountConsumed` (or equivalently `balanceBefore - balanceAfter` for ERC20 inputs) instead of relying on `balanceAfter > balanceBefore`.

### Finding NM-002: MEDIUM — Registry-mediated native partial fills revert because leftovers are refunded to the registry
**Severity:** MEDIUM
**Source:** Cross-feed P1→P2
**Verification:** Hybrid

**Coupled Pair:** Original payer ↔ leftover refund recipient
**Invariant:** Leftover native input must be refunded to the account that funded the route.

**Feynman Question that exposed it:**
> Once the registry forwards into the router, who exactly does `_msgSender()` refer to when `_handleSwap` performs the leftover refund?

**State Mapper gap that confirmed it:**
> Parallel-path comparison showed direct router calls and registry-mediated calls diverge at refund time: the direct path refunds the user, while the forwarded path refunds the registry.

**Breaking Operation:** `pay()` at `src/JBRouterTerminalRegistry.sol:350-377` and refund handling at `src/JBRouterTerminal.sol:829-841`, `src/JBRouterTerminal.sol:929-935`
- Modifies State A: registry forwarding changes the router’s caller context.
- Does NOT update State B: the original payer is never preserved as the refund recipient.

**Trigger Sequence:**
1. User pays through `JBRouterTerminalRegistry.pay` with native ETH.
2. The router executes a swap that partially fills.
3. `_handleSwap` wraps the raw leftover ETH, unwraps it, and refunds to `_msgSender()`.
4. `_msgSender()` is the registry, so `_transferFrom` uses `Address.sendValue` to the registry.
5. The registry cannot receive plain ETH, so the payment reverts.

**Consequence:**
- Registry-mediated native routes become unavailable under partial-fill conditions.
- The same swap path is callable directly through the router, so this is a boundary bug introduced by the forwarding layer.

**Verification Evidence:**
- Code trace:
  - `src/JBRouterTerminalRegistry.sol:376` calls into the router as the immediate caller.
  - `src/JBRouterTerminal.sol:841` refunds leftovers to `_msgSender()`.
  - `src/JBRouterTerminal.sol:932` turns native refunds into `Address.sendValue`.
- PoC:
  - `test/audit/CodexNemesis.t.sol`
  - `test_registryNativeInput_partialFillRevertsOnRefundToRegistry`
  - The registry-routed payment reverts as soon as the router attempts the leftover refund.

**Fix:**
Pass an explicit refund recipient from the registry into the router and use that address for all leftover refunds, or make the registry capable of receiving and forwarding ETH safely.

## Feedback Loop Discoveries
- The state/parallel-path pass did not find a storage desync, but it did reveal that the same refund logic behaves differently under direct calls vs. registry forwarding. That delta produced NM-002; it was not obvious from the router in isolation.

## False Positives Eliminated
- NM-003: `JBRouterTerminalRegistry.addToBalanceOf` with no resolved terminal was suspected to burn ETH. Runtime verification showed the call reverts on the non-contract target before any loss is committed.

## Summary
- Total functions analyzed: 92
- Coupled state pairs mapped: 3
- Nemesis loop iterations: 4 passes
- Raw findings (pre-verification): 0 C | 1 H | 2 M | 0 L
- Feedback loop discoveries: 1
- After verification: 2 TRUE POSITIVE | 1 FALSE POSITIVE | 0 DOWNGRADED
- Final: 0 CRITICAL | 1 HIGH | 1 MEDIUM | 0 LOW
