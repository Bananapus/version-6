# State Inconsistency Audit — Verified Findings

## Coupled State Dependency Map
| Pair | Invariant | Mutation points |
|------|-----------|-----------------|
| `core` / `revnet` / `suckers` / `routerTerminal` deployment refs ↔ `deploy()` external calls | `deploy()` must only use addresses loaded for the current chain in `run()` | `run()` |
| `operator` ↔ split beneficiary / auto-issuance beneficiary / `REVConfig.splitOperator` | All operator-facing configuration must resolve to the same Safe address | `run()`, `deploy()` |
| `feeProjectId` approval target ↔ `deployFor(revnetId)` target | The approved NFT and deployed revnet ID must remain identical (`1`) | `deploy()` |
| `block.chainid` ↔ sucker deployer set | Mainnet-style chains need three deployers; L2-style chains need exactly one L2->L1 deployer | `deploy()` |

## Mutation Matrix
| State Variable | Mutating Function | Type of Mutation | Updates Coupled State? |
|----------------|-------------------|------------------|------------------------|
| `core` | `run()` | assignment | Yes |
| `suckers` | `run()` | assignment | Yes |
| `revnet` | `run()` | assignment | Yes |
| `routerTerminal` | `run()` | assignment | Yes |
| `operator` | `run()` | assignment | Yes |

## Parallel Path Comparison
| Coupled State | Mainnet/`sepolia` path | L2 path | Result |
|---------------|------------------------|---------|--------|
| Sucker deployer selection | 3 explicit deployers | 1 fallback-selected deployer | Consistent with intended topology |
| Accepted terminals | `JBMultiTerminal` + router registry | `JBMultiTerminal` + router registry | Consistent |
| Operator propagation | splits + auto-issuance + split operator | splits + auto-issuance + split operator | Consistent |

## Verification Summary
| ID | Coupled Pair | Breaking Op | Original Severity | Verdict | Final Severity |
|----|-------------|-------------|-------------------|---------|----------------|
| SI-001 | `operator` ↔ split/issuance config | `deploy()` | LOW | FALSE POSITIVE | — |

## Verified Findings
- None.

## False Positives Eliminated

### SI-001: `deploy()` can observe stale zero-valued setup state if called directly
**Original severity:** LOW
**Verification:** Code trace

Hypothesis:
- `deploy()` depends on `core`, `suckers`, `revnet`, `routerTerminal`, and `operator`, all populated in `run()`.
- A direct call into `deploy()` could therefore build invalid configuration from zero values.

Why it is not a reportable bug:
- The intended execution model is `run() -> deploy()` under Sphinx.
- [`Sphinx.sphinx`]( /Users/jango/Documents/jb/v6/evm/nana-fee-project-deployer-v6/node_modules/@sphinx-labs/contracts/contracts/foundry/Sphinx.sol#L276 ) is the deployment boundary the script is written against.
- No attacker can reach this path in the deployed protocol; it is only an operator script invocation concern.

## Summary
- Coupled state pairs mapped: 4
- Mutation paths analyzed: 5
- Raw findings (pre-verification): 1
- After verification: 0 TRUE POSITIVE | 1 FALSE POSITIVE
- Final: 0 CRITICAL | 0 HIGH | 0 MEDIUM | 0 LOW
