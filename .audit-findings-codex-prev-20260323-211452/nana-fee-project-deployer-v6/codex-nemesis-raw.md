# N E M E S I S — Raw Findings

Generated: 2026-03-23 10:11:49 UTC

## Scope
- In scope Solidity:
  - `script/Deploy.s.sol`
- `src/` contains no Solidity files in this repo.
- Excluded by instruction:
  - `.audit/findings/*` from parallel audit runs

## Phase 0 — Nemesis Recon

### Language
- Solidity 0.8.26

### Attack Goals
1. Misconfigure fee project `#1` so protocol fees are redirected, stranded, or rendered uncollectable.
2. Bind the fee project to the wrong terminals, deployers, or chain peers through bad dependency resolution.
3. Break cross-chain topology so sucker deployment or fee-token mobility fails on one or more target chains.

### Novel Code
- `script/Deploy.s.sol` — single custom deployment script; all risk is concentrated in parameter selection and dependency wiring.

### Value Stores + Initial Coupling Hypothesis
- `operator`
  - Outflows: receives 100% reserved split distributions and all auto-issued NANA.
  - Suspected coupled state: split beneficiary, auto-issuance beneficiary, `REVConfig.splitOperator`.
- Dependency deployment refs (`core`, `revnet`, `suckers`, `routerTerminal`)
  - Outflows: define which external contracts get approved/called.
  - Suspected coupled state: current `block.chainid`, deployment artifact path, downstream `deployFor` / `approve` calls.
- `feeProjectId`
  - Outflows: project NFT approval and revnet deployment target.
  - Suspected coupled state: must remain `1` everywhere.

### Complex Paths
- `run()` -> deployment libs -> `deploy()` -> `core.projects.approve()` -> `REVDeployer.deployFor()`
- `deploy()` -> chain-specific sucker config -> `REVDeployer._deploySuckersFor()` -> `JBSuckerRegistry.deploySuckersFor()`

### Priority Order
1. `deploy()` — concentrates all economic parameters and chain-conditional wiring.
2. `run()` — all downstream safety depends on correct dependency resolution.
3. `configureSphinx()` — deployment network selection and Safe derivation boundary.

## Phase 1A — Function-State Matrix
| Function | Reads | Writes | Guards | Internal Calls | External Calls |
|----------|-------|--------|--------|----------------|----------------|
| `configureSphinx()` | none | `sphinxConfig.*` | none | none | none |
| `run()` | env vars, chain ID | `core`, `suckers`, `revnet`, `routerTerminal`, `operator` | none | `deploy()` | deployment libs, `safeAddress()` |
| `deploy()` | cached deployment refs, `operator`, constants, chain ID | local config only | `sphinx` | none | `approve`, `deployFor` |

## Phase 1B — Coupled State Dependency Map
| Coupled Pair | Invariant |
|--------------|-----------|
| `operator` ↔ split beneficiary | reserved token flow must route to the same Safe |
| `operator` ↔ auto-issuance beneficiaries | all pre-mints must go to the same Safe |
| `operator` ↔ `splitOperator` | the account controlling revnet split operations must match the beneficiary Safe |
| `feeProjectId` ↔ `approve(tokenId)` ↔ `deployFor(revnetId)` | all must remain `1` |
| `block.chainid` ↔ sucker deployer array shape | L1/mainnet-like chains use 3 deployers; L2 chains use 1 |
| deployment refs ↔ downstream external calls | each loaded address must correspond to the current chain’s deployment artifacts |

## Phase 1C — Cross-Reference
| Function | Writes A | Writes B | A↔B Pair | Sync Status |
|----------|----------|----------|----------|-------------|
| `run()` | `operator` | `core/revnet/suckers/routerTerminal` | setup refs ↔ `deploy()` dependencies | SYNCED |
| `deploy()` | split beneficiary | auto-issuance beneficiaries | operator fan-out | SYNCED |
| `deploy()` | `approve(tokenId=1)` | `deployFor(revnetId=1)` | fee project ID identity | SYNCED |
| `deploy()` | sucker deployer list | `block.chainid` branch | chain topology | SYNCED |

## Pass 1 — Feynman Raw Suspects

### RF-001
- Category: Assumptions / Ordering
- Question: Why is `NANA_START_TIME` fixed to `1740089444` instead of being derived at execution time?
- Suspect scenario: deploying after the start date could activate a later issuance cycle immediately.
- Initial severity: MEDIUM

### RF-002
- Category: Assumptions
- Question: Why are there no explicit non-zero sanity checks after loading `core`, `revnet`, `suckers`, and `routerTerminal` from artifacts?
- Suspect scenario: a zero or wrong artifact address propagates into `approve()` / `deployFor()` / terminal configuration.
- Initial severity: LOW

### RF-003
- Category: Consistency
- Question: Why does `deploy()` rely on `run()`-initialized state instead of deriving `operator` and deployment refs locally?
- Suspect scenario: direct `deploy()` invocation sees zeroed state.
- Initial severity: LOW

## Pass 2 — State Cross-Check Deltas
- No confirmed state gaps were found.
- All state mutations in the script occur in `run()` and are consumed coherently in `deploy()`.
- Mainnet/L2 branch behavior stays internally consistent with the loaded deployment-ref model.

## Pass 3 — Targeted Feynman Re-Interrogation
- `RF-001` traced into `REVDeployer._setCashOutDelayIfNeeded()` and the revnet cross-chain timeline design. No exploit; intentional behavior.
- `RF-002` traced into explicit repo trust assumptions about deployment artifact integrity. Operational risk only.
- `RF-003` traced into Sphinx’s execution model. Operator misuse only; not reachable in deployed protocol.

## Pass 4 — Targeted State Re-Analysis
- No new coupled pairs.
- No new mutation paths.
- No new masking code.

## Convergence
- Loop converged after 4 passes.
- New findings in last pass: 0

## Verification Notes
- `forge test`:
  - 67 unit tests passed
  - 1 fork suite failed due unavailable RPC credential (`rpc.ankr.com` 401), not due code failure

## Raw Finding Counts
- 0 Critical
- 0 High
- 1 Medium
- 2 Low

## Raw Conclusion
- No raw candidate survived verification into a reportable security finding.
