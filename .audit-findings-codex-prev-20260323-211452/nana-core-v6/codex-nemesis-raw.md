# N E M E S I S — Raw Notes

## Scope
- Fresh round over every Solidity file in `src/` and `script/`
- `.audit/findings/` intentionally ignored as instructed
- Files: 89
- Functions: 398

## Phase 0 — Recon

### Attack goals
1. Break fund conservation between `JBMultiTerminal` and `JBTerminalStore`.
2. Bypass payout / allowance / cash-out invariants to extract more value than configured.
3. Escalate cross-project permissions through wildcard or ROOT edge cases.
4. Corrupt deployment state through wrong addresses, wrong feeds, or namespace collisions.

### Novel / priority code
- `JBMultiTerminal` / `JBTerminalStore`: all balance mutations and hook composition.
- `JBPermissions`: packed bitmaps plus wildcard/ROOT semantics.
- `JBRulesets`: approval-hook fallback and simulated cycles.
- `script/Deploy*.s.sol`: deployment namespace, oracle addresses, omnichain operator.

### Initial coupling hypotheses
- Terminal real balance ↔ store `balanceOf`
- Used payout/allowance counters ↔ configured limit tables
- Reserved supply ↔ total-supply-with-reserved view
- Explicit primary terminals ↔ membership in terminal set
- Fee holding arrays ↔ processing index

## Pass 1 — Feynman (full)

### Confirmed suspects
1. `JBPermissions.setPermissionsFor(...)`
   - Docs say wildcard `projectId = 0` cannot be combined with `ROOT`.
   - Implementation only forbids that combination for `msgSender != account`.
   - Candidate finding advanced to verification.

2. Deployment namespace
   - `Deploy.s.sol`, `DeployPeriphery.s.sol`, and `CoreDeploymentLib.sol` all still reference `nana-core-v5`.
   - Candidate finding advanced to verification.

3. Base Sepolia oracle config
   - Script comment explicitly says selected USDC/USD feed is likely wrong, but deployment branch still uses it.
   - Candidate finding advanced to verification.

### Cleared / downgraded suspects
- ERC20 allowance persistence in terminal forwarding paths: cleared after end-to-end accounting trace.
- `JBRulesets` rollover simulation: suspicious expression did not become reachable through the actual `currentOf(...)` path used by core flows.

## Pass 2 — State Inconsistency (full)

### Coupled pairs mapped
- `balanceOf` / terminal balances
- `usedPayoutLimitOf` / payout limits
- `usedSurplusAllowanceOf` / surplus allowances
- reserved supply / total supply
- terminal set / primary terminal
- held fees array / next index
- split count / packed split storage

### New gaps
- No verified missing-update state gap survived trace review.

## Convergence
- Pass 2 produced no new verified coupled-state findings and no new delta requiring a targeted Pass 3.
- Converged after the two full baseline passes.

## Verification queue
1. Wildcard ROOT grant: verify with PoC.
2. v5 deployment namespace mismatch: verify by code trace across scripts and package tooling.
3. Base Sepolia feed: verify by direct code trace.

## Verification results
- Wildcard ROOT PoC: confirmed.
- Namespace mismatch: confirmed.
- Base Sepolia wrong feed: confirmed.
