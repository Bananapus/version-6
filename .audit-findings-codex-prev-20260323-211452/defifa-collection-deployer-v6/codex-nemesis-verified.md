# N E M E S I S — Verified Findings

## Scope
- Language: Solidity 0.8.26
- Modules analyzed: 24 Solidity files
- Functions analyzed: 152
- Coupled state pairs mapped: 4
- Mutation paths traced: 9
- Nemesis loop iterations: 4 passes total (Feynman full, State full, Feynman targeted, State targeted)

## Nemesis Map
| Function | Writes ownership/beneficiary | Writes attestation state | Coupled Pair | Sync Status |
|----|----|----|----|----|
| `DefifaHook._processPayment()` | Yes, to `context.beneficiary` | Yes, to `context.payer` | owner ↔ attestation | GAP |
| `DefifaHook._update()` | Yes, to `to`/`from` | Yes, moves attestation units with transfer | owner ↔ attestation | SYNCED |
| `DefifaHook.afterCashOutRecordedWith()` | Burns ownership | Burns attestation units through transfer/burn path | owner ↔ attestation | SYNCED |

## Verification Summary
| ID | Source | Coupled Pair | Breaking Op | Severity | Verdict |
|----|--------|-------------|-------------|----------|---------|
| NM-001 | Cross-feed P1→P2 | NFT recipient ↔ attestation checkpoints | `_processPayment()` | HIGH | TRUE POSITIVE |
| NM-002 | Feynman-only | Deployment script/project-name consistency | `DefifaDeploymentLib.getDeployment()` | LOW | TRUE POSITIVE |

## Verified Findings

### Finding NM-001: HIGH — Sponsored mints give default governance power to the payer instead of the NFT holder
**Severity:** HIGH
**Source:** Cross-feed P1→P2
**Verification:** Hybrid

**Coupled Pair:** NFT recipient/owner ↔ tier attestation delegation and checkpoints
**Invariant:** A newly minted NFT’s default attestation power should follow the account receiving the NFT unless an explicit delegate override is supplied.

**Feynman question that exposed it:**
> Why is the default delegate derived from `context.payer` while the NFT is minted to `context.beneficiary`?

**State Mapper gap that confirmed it:**
> The mint path updates ERC721 ownership for `beneficiary`, but the coupled governance state writes `_tierDelegation[context.payer]` and mints attestation units to `context.payer`.

**Breaking Operation:** `src/DefifaHook.sol:950-979`
- Modifies owner-side state: NFT mint goes to `context.beneficiary` at `src/DefifaHook.sol:990`
- Does not update the same account’s governance counterpart: attestation defaults and checkpoint writes are keyed to `context.payer`

**Trigger Sequence:**
1. A user pays for a Defifa mint and sets `beneficiary` to another address.
2. The pay metadata leaves the attestation delegate unset (`address(0)`).
3. The hook defaults the delegate to `context.payer` and transfers attestation units through the payer path.
4. The beneficiary receives the NFT, but the payer receives the governance weight.
5. During scoring, the payer can attest and the NFT holder cannot.

**Consequence:**
- Governance becomes decoupled from NFT ownership.
- A sponsor/custodian/attacker can buy outcome NFTs for others while silently retaining the ability to sway or ratify the scorecard.
- This undermines the protocol’s stated attestation model, where each tier’s holder community should determine the outcome weighting.

**Verification Evidence:**
- Code trace:
  - `src/DefifaHook.sol:950-953`
  - `src/DefifaHook.sol:968-979`
  - `src/DefifaHook.sol:990`
- PoC:
  - `test/DefifaHookRegressions.t.sol:318-346`
  - Command: `forge test --match-test test_attestationUnitsFollowPayerInsteadOfBeneficiary -vvv`
  - Result: pass

**Fix:**
```solidity
if (_attestationDelegate == address(0)) {
    _attestationDelegate =
        defaultAttestationDelegate != address(0) ? defaultAttestationDelegate : context.beneficiary;
}

address _attestationAccount = context.beneficiary;
address _oldDelegate = _tierDelegation[_attestationAccount][_tierId];
_delegateTier({_account: _attestationAccount, _delegatee: _attestationDelegate, _tierId: _tierId});
_transferTierAttestationUnits({
    _from: address(0),
    _to: _attestationAccount,
    _tierId: _tierId,
    _amount: _attestationAmounts[_i]
});
```

### Finding NM-002: LOW — `DefifaDeploymentLib` resolves v5 deployment artifacts while the v6 deploy script publishes under `defifa-v6`
**Severity:** LOW
**Source:** Feynman-only
**Verification:** Code trace

**Coupled Pair:** Deployment writer project name ↔ deployment reader project name
**Invariant:** Artifact readers must target the same Sphinx project namespace that the deploy script publishes.

**Feynman question that exposed it:**
> Why does the artifact reader use a different Sphinx project name than the deploy script?

**Breaking Operation:** `script/helpers/DefifaDeploymentLib.sol:25,52-73`
- `PROJECT_NAME = "defifa-v5"`
- Every deployment lookup uses that stale project name

**Trigger Sequence:**
1. A v6 deployment is produced via `script/Deploy.s.sol`, which sets `sphinxConfig.projectName = "defifa-v6"`.
2. An operator or follow-up script uses `DefifaDeploymentLib.getDeployment(...)`.
3. The helper reads the `defifa-v5` artifact path instead of the v6 path.
4. The caller gets stale or missing addresses.

**Consequence:**
- Post-deploy automation can target incorrect contracts or fail unexpectedly.
- This is operationally dangerous but does not directly affect on-chain fund safety.

**Verification Evidence:**
- `script/Deploy.s.sol:36-39`
- `script/helpers/DefifaDeploymentLib.sol:25,52-73`

**Fix:**
```solidity
string constant PROJECT_NAME = "defifa-v6";
```

## Feedback Loop Discoveries
- `NM-001` is the highest-value Nemesis result. Feynman exposed the payer/beneficiary asymmetry, and the state pass confirmed it as a real ownership↔governance desynchronization instead of an intended delegation feature.

## False Positives Eliminated
- Explicitly supplying the beneficiary as the delegate in pay metadata routes the attestation power correctly. The verified issue is the default delegate fallback, not every `payer != beneficiary` payment.

## Summary
- Total functions analyzed: 152
- Coupled state pairs mapped: 4
- Nemesis loop iterations: 4
- Raw findings (pre-verification): 0 critical, 1 high, 0 medium, 1 low
- Feedback loop discoveries: 1
- After verification: 2 true positives, 0 false positives, 0 downgraded
- Final: 0 critical, 1 high, 0 medium, 1 low
