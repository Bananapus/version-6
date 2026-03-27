# N E M E S I S — Raw Findings

## Scope
- Language: Solidity 0.8.26
- Files reviewed: 24 Solidity files under `src/` and `script/`
- Functions reviewed: 152

## Phase 0 — Recon

### Attack Goals
1. Capture scorecard governance without holding the corresponding winning/losing NFTs.
2. Corrupt cash-out and fee-token accounting so game pots or side-token distributions can be extracted incorrectly.
3. Misconfigure deployment or post-deploy tooling so production integrations target the wrong contracts.

### Novel Code
- `src/DefifaHook.sol` — custom attestation checkpoint system layered on top of JB721 mint/burn/transfer hooks.
- `src/DefifaGovernor.sol` — custom scorecard submission, attestation, quorum, and ratification flow.
- `src/DefifaDeployer.sol` — bespoke phase machine, commitment fulfillment, split normalization, and no-contest handling.

### Value Stores + Initial Coupling Hypothesis
- Game pot in `JBMultiTerminal/JBTerminalStore`
  - Coupled to `fulfilledCommitmentsOf`, `amountRedeemed`, scorecard-set cash-out weights.
- NFT ownership in `DefifaHook`
  - Coupled to per-tier attestation checkpoints and governance eligibility.
- `_totalMintCost`
  - Coupled to live/reserved mint population and fee-token claims.

### Complex Paths
- `pay()` → `DefifaHook._processPayment()` → attestation checkpoints + NFT mint
- `submitScorecardFor()` / `attestToScorecardFrom()` / `ratifyScorecardFrom()` → `DefifaHook.setTierCashOutWeightsTo()` → `DefifaDeployer.fulfillCommitmentsOf()`
- `cashOutTokensOf()` → `beforeCashOutRecordedWith()` → `afterCashOutRecordedWith()` → fee-token claim flow

## Pass 1 — Feynman Raw Findings
1. SUSPECT: `DefifaHook._processPayment()` defaults governance power to `context.payer` while minting NFTs to `context.beneficiary`.
2. SUSPECT: `DefifaDeploymentLib` hardcodes `defifa-v5` while `Deploy.s.sol` deploys `defifa-v6`.

## Pass 2 — State Cross-Check
1. CONFIRMED GAP: Mint path updates ownership for beneficiary but attestation delegation/checkpoints for payer.
2. No additional coupled-state gaps of similar severity found in burn, transfer, reserve-mint, fulfillment, or scorecard ratification paths after call-chain tracing.

## Targeted Re-Pass
- Re-interrogated the `payer/beneficiary` mint path.
- Verified that explicit delegate metadata can route power elsewhere, so the bug is the default path only.
- Re-checked transfer path: attestation units move correctly during `_update()`; no parallel transfer bug remained.
- Re-checked no-contest and fulfillment sequencing; no additional exploitable deltas surfaced.

## Raw Finding Inventory
| ID | Source | Severity | Status |
|----|--------|----------|--------|
| NM-RAW-001 | Cross-feed P1→P2 | HIGH | Verified |
| NM-RAW-002 | Feynman-only | LOW | Verified |

## Convergence
- Full passes completed: Feynman + State
- Targeted re-passes completed: 2
- New findings in final pass: 0
- Converged: yes
