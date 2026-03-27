# State Inconsistency Audit — Verified Findings

## Coupled State Dependency Map
- `ERC721 ownership / beneficiary` ↔ `tier attestation delegation + checkpoints`
  - Invariant: default governance power should track the recipient of the NFT unless explicitly delegated elsewhere.
- `tier burn counters` ↔ `tokensRedeemedFrom[tier]` ↔ `cashOutWeight`
- `_totalMintCost` ↔ live/reserved mint population used for fee-token claims
- `fulfilledCommitmentsOf[gameId]` ↔ payout execution / remaining pot accounting

## Mutation Matrix
| State Variable | Mutating Function | Updates Coupled State? |
|---|---|---|
| NFT ownership | `DefifaHook._mintAll()` | Writes beneficiary ownership |
| Attestation delegation/checkpoints | `DefifaHook._processPayment()` | Writes payer-side delegation/checkpoints |
| NFT ownership | `DefifaHook._update()` | Yes, transfer path moves attestation units correctly |

## Parallel Path Comparison
| Coupled State | Mint Path | Transfer Path |
|---|---|---|
| Ownership ↔ attestation units | `beneficiary` ownership, `payer` default attestation | `from/to` ownership and attestation stay synchronized |

## Verification Summary
| ID | Coupled Pair | Breaking Op | Original Severity | Verdict | Final Severity |
|----|-------------|-------------|-------------------|---------|----------------|
| SI-001 | NFT owner/beneficiary ↔ attestation checkpoints | `_processPayment()` | HIGH | TRUE POSITIVE | HIGH |

## Verified Findings

### Finding SI-001: HIGH — Mint path updates NFT ownership for `beneficiary` but governance checkpoints for `payer`
**Severity:** HIGH
**Verification:** Hybrid — code trace + PoC

**Coupled Pair:** NFT recipient/owner ↔ attestation delegation + checkpoint balances
**Invariant:** The account that receives a newly minted Defifa NFT should receive its default governance power unless an explicit delegate override says otherwise.

**Breaking Operation:** `_processPayment()` in `src/DefifaHook.sol:950-979`
- Modifies NFT ownership: `_mintAll(..., _beneficiary: context.beneficiary)` at `src/DefifaHook.sol:990`
- Does not update the same account’s attestation state: default delegate and attestation transfer are keyed to `context.payer`

**Trigger Sequence:**
1. A payer calls `pay()` with `beneficiary != payer`.
2. The payer leaves the delegate as `address(0)` in pay metadata.
3. The hook defaults delegation to `context.payer` and credits attestation units through the payer’s delegation path.
4. The NFT is minted to `context.beneficiary`.
5. During scoring, the payer has attestation weight and the NFT holder has none.

**Consequence:**
- Governance power silently detaches from NFT ownership.
- A sponsor/custodian/attacker can accumulate voting power across NFTs they do not hold.
- Scorecard ratification can reflect payer identity instead of holder consensus.

**Verification Evidence:**
- Code trace:
  - `src/DefifaHook.sol:950-953`
  - `src/DefifaHook.sol:968-979`
  - `src/DefifaHook.sol:990`
- PoC:
  - `forge test --match-test test_attestationUnitsFollowPayerInsteadOfBeneficiary -vvv`
  - Result: pass

**Fix:**
Key the default delegation/checkpoint write path to `context.beneficiary`, or require the payer to supply an explicit delegate whenever `payer != beneficiary`.

## False Positives Eliminated
- The transfer path in `DefifaHook._update()` is not affected. It correctly moves attestation units between `from` and `to`.

## Summary
- Coupled state pairs mapped: 4
- Mutation paths analyzed: 9
- Raw findings reviewed: 1
- After verification: 1 true positive, 0 false positives
- Final: 1 HIGH
