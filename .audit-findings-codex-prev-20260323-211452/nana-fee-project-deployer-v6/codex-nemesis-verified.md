# N E M E S I S — Verified Findings

## Scope
- Language: Solidity 0.8.26
- Modules analyzed: `script/Deploy.s.sol`
- Functions analyzed: 3
- Coupled state pairs mapped: 4
- Mutation paths traced: 5
- Nemesis loop iterations: 2

## Nemesis Map (Phase 1 Cross-Reference)
| Function | Writes A | Writes B | A↔B Pair | Sync Status |
|----------|----------|----------|----------|-------------|
| `run()` | deployment refs | `operator` | setup state consumed by `deploy()` | SYNCED |
| `deploy()` | split beneficiary | auto-issuance beneficiaries | operator fan-out | SYNCED |
| `deploy()` | `approve(tokenId=1)` | `deployFor(revnetId=1)` | fee project identity | SYNCED |
| `deploy()` | sucker deployer branch | `block.chainid` | chain topology | SYNCED |

## Verification Summary
| ID | Source | Coupled Pair | Breaking Op | Severity | Verdict |
|----|--------|-------------|-------------|----------|---------|
| NM-001 | Feynman-only | `NANA_START_TIME` ↔ stage lifecycle | `deploy()` | MEDIUM | FALSE POSITIVE |
| NM-002 | Feynman-only | deployment refs ↔ external calls | `run()` / `deploy()` | LOW | FALSE POSITIVE |
| NM-003 | State-only | `run()` state ↔ `deploy()` consumption | `deploy()` | LOW | FALSE POSITIVE |

## Verified Findings (TRUE POSITIVES only)
- None.

## Feedback Loop Discoveries
- None. The Feynman and state passes converged without exposing a cross-feed bug that survived verification.

## False Positives Eliminated

### Finding NM-001: Historical start time looked like an unintended retroactive launch
**Source:** Feynman-only
**Verification:** Code trace

The script fixes `startsAtOrAfter` to `1740089444` in [script/Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/nana-fee-project-deployer-v6/script/Deploy.s.sol#L132). That initially looked like a stale-timestamp configuration error.

Verification traced the downstream behavior into [`REVDeployer._setCashOutDelayIfNeeded`]( /Users/jango/Documents/jb/v6/evm/nana-fee-project-deployer-v6/node_modules/@rev-net/core-v6/src/REVDeployer.sol#L1285 ), which explicitly handles revnets whose first stage is already in progress when deployed on another chain. This repo’s documentation also frames the fee project as a global-timeline deployment. No exploitable invariant break was confirmed.

### Finding NM-002: Loaded deployment addresses are not explicitly sanity-checked in the script
**Source:** Feynman-only
**Verification:** Code trace

The script trusts the deployment helpers to return correct addresses before using them in [script/Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/nana-fee-project-deployer-v6/script/Deploy.s.sol#L70) and [script/Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/nana-fee-project-deployer-v6/script/Deploy.s.sol#L193).

Verification showed this is an acknowledged trust assumption documented in [RISKS.md](/Users/jango/Documents/jb/v6/evm/nana-fee-project-deployer-v6/RISKS.md). Exploitation requires compromised operator inputs or corrupted dependency artifacts, not a user-triggerable protocol flaw.

### Finding NM-003: `deploy()` depends on `run()`-initialized cached state
**Source:** State-only
**Verification:** Code trace

`deploy()` consumes `core`, `suckers`, `revnet`, `routerTerminal`, and `operator` that are assigned in `run()`. That looked like a possible state-desync if `deploy()` were called directly.

Verification showed the intended execution boundary is the Sphinx deployment flow, with [`Sphinx.sphinx`]( /Users/jango/Documents/jb/v6/evm/nana-fee-project-deployer-v6/node_modules/@sphinx-labs/contracts/contracts/foundry/Sphinx.sol#L276 ) governing the deployment entry point. This is an operator-invocation concern, not a reachable security issue in the deployed fee project.

## Downgraded Findings
- None.

## Summary
- Total functions analyzed: 3
- Coupled state pairs mapped: 4
- Nemesis loop iterations: 2
- Raw findings (pre-verification): 0 C | 0 H | 1 M | 2 L
- Feedback loop discoveries: 0
- After verification: 0 TRUE POSITIVE | 3 FALSE POSITIVE | 0 DOWNGRADED
- Final: 0 CRITICAL | 0 HIGH | 0 MEDIUM | 0 LOW
