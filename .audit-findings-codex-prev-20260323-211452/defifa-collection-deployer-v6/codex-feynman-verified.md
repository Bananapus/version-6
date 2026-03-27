# Feynman Audit — Verified Findings

## Scope
- Language: Solidity 0.8.26
- Modules analyzed: 24 Solidity files under `src/` and `script/`
- Functions analyzed: 152

## Verification Summary
| ID | Original Severity | Verdict | Final Severity |
|----|-------------------|---------|----------------|
| FF-001 | HIGH | TRUE POSITIVE | HIGH |
| FF-002 | LOW | TRUE POSITIVE | LOW |

## Verified Findings

### Finding FF-001: HIGH — Default delegated attestation power follows `payer`, not the NFT recipient
**Module:** `DefifaHook`
**Function:** `_processPayment`
**Lines:** `src/DefifaHook.sol:950-979`
**Verification:** Hybrid — code trace + PoC `test/DefifaHookRegressions.t.sol::test_attestationUnitsFollowPayerInsteadOfBeneficiary`

**Feynman question that exposed this:**
> Why does the mint path send the NFT to `context.beneficiary` but default the attestation delegate and attestation-unit transfer to `context.payer`?

**Why this is wrong:**
When the payer leaves the delegate unset in pay metadata, the hook defaults `_attestationDelegate` to `context.payer` and mutates `_tierDelegation[context.payer]`, then mints attestation units to `context.payer`. The NFT itself is minted to `context.beneficiary`. That means the default path splits governance power from NFT ownership whenever `payer != beneficiary`.

**Verification evidence:**
- Code trace:
  - `src/DefifaHook.sol:950-953` defaults the delegate to `context.payer`.
  - `src/DefifaHook.sol:968-979` reads and updates delegation/checkpoints for `context.payer`.
  - `src/DefifaHook.sol:990` mints the NFT to `context.beneficiary`.
- PoC:
  - `forge test --match-test test_attestationUnitsFollowPayerInsteadOfBeneficiary -vvv`
  - Passes with the payer receiving positive attestation weight and the NFT beneficiary receiving zero.

**Attack scenario:**
1. An attacker pays for outcome NFTs with `beneficiary` set to another account and metadata delegate left as `address(0)`.
2. The beneficiary receives the NFT and appears to own the position.
3. The attacker retains the attestation power for scorecard voting.
4. The attacker can accumulate quorum and ratify a self-serving scorecard without holding the NFTs they funded.

**Impact:**
This breaks the core governance invariant that attestation power tracks the actual NFT holder unless a holder explicitly delegates it away. Sponsored mints, custodial flows, marketplaces, or UI defaults can silently assign voting power to the payer instead of the holder.

**Suggested fix:**
Default attestation ownership to `context.beneficiary`, not `context.payer`, and key the default delegation/checkpoint transfer off the NFT recipient unless an explicit delegate override is provided.

### Finding FF-002: LOW — Deployment helper reads `defifa-v5` artifacts while the deploy script publishes `defifa-v6`
**Module:** `DefifaDeploymentLib`
**Function:** `getDeployment`
**Lines:** `script/helpers/DefifaDeploymentLib.sol:25,52-73`
**Verification:** Code trace

**Feynman question that exposed this:**
> Why does the deployment reader point at a different Sphinx project name than the deployment script writes?

**Why this is wrong:**
`script/Deploy.s.sol:36-39` configures Sphinx with project name `defifa-v6`, but `script/helpers/DefifaDeploymentLib.sol:25` hardcodes `PROJECT_NAME = "defifa-v5"`. Any script or operational tool using `DefifaDeploymentLib` will read from the wrong artifact directory.

**Verification evidence:**
- `script/Deploy.s.sol:37` sets `sphinxConfig.projectName = "defifa-v6"`.
- `script/helpers/DefifaDeploymentLib.sol:25` sets `PROJECT_NAME = "defifa-v5"`.
- `script/helpers/DefifaDeploymentLib.sol:52-73` uses that constant for every contract lookup.

**Impact:**
Operational tooling can resolve stale or nonexistent deployment addresses and target the wrong contracts during post-deploy verification or integrations.

**Suggested fix:**
Change `PROJECT_NAME` to `defifa-v6`, or derive it from a shared constant used by both the deploy script and helper library.

## False Positives Eliminated
- The `payer != beneficiary` path is not always wrong when the payer explicitly sets the delegate to the beneficiary in pay metadata. The verified bug is the default-path behavior when the delegate is left unset.

## Summary
- Raw findings reviewed: 2
- After verification: 2 true positives, 0 false positives, 0 downgrades
- Final: 1 HIGH, 1 LOW
