# Audit-Hardening PR Review — Round 2

Review of `codex/audit-hardening-v6` PRs across eight repos. Findings only — **no code changes have been applied from this review**.

Each finding includes the file/line, what the change would be, and a confidence score (0–100) for whether it's a real issue worth acting on.

---

## High severity — real bugs

### 1. `univ4-lp-split-hook-v6` — `_clearPermit2Approval` does not actually expire the allowance

**File:** `src/JBUniswapV4LPSplitHook.sol:2120`
**Confidence:** 100

The call passes `expiration: 0`:

```solidity
PERMIT2.approve({token: token, spender: address(positionManager), amount: 0, expiration: 0});
```

Per Permit2's source (`Allowance.sol:updateAmountAndExpiration`):

```solidity
// If the inputted expiration is 0, the allowance only lasts the duration of the block.
allowed.expiration = expiration == 0 ? uint48(block.timestamp) : expiration;
```

Permit2 stores `expiration = block.timestamp`, and the `_transfer` guard `if (block.timestamp > allowed.expiration) revert AllowanceExpired(...)` evaluates to `block.timestamp > block.timestamp` → **false**. The allowance is therefore live for the rest of the block, not revoked.

The `amount: 0` does prevent any non-zero pull (`amount > maxAmount` reverts), so the practical risk is limited. But the helper's stated intent — "expire the allowance" — is not what the code does.

**Proposed fix:** use `expiration: 1` (any non-zero past timestamp); Permit2's `AllowanceExpired` guard then fires immediately.

```solidity
PERMIT2.approve({token: token, spender: address(positionManager), amount: 0, expiration: 1});
```

---

### 2. `nana-project-handles-v6` — unbounded resolver-controlled copy loop in `_textRecordOf`

**File:** `src/JBProjectHandles.sol` (`_textRecordOf`, ~line 300+)
**Confidence:** 90

Current bounds check:

```solidity
if (offset != 32 || length > result.length - 64) return "";
bytes memory textBytes = bytes(textRecord = new string(length));
for (uint256 i; i < length;) { textBytes[i] = result[64 + i]; ... }
```

`length` is bounded only by what the resolver actually returned (i.e., by the gas the resolver was willing to spend). A name-owner-controlled resolver can return a well-formed multi-KB ABI string. The copy loop runs `length` iterations on every reader of `handleOf` before the keccak comparison discards anything that isn't `chainId:projectId` (< 50 bytes).

On-chain callers of `handleOf` pay this cost; resolver controllers can grief every reader.

**Proposed fix:** add a constant cap and check it:

```solidity
// In the internal constants section
uint256 internal constant _MAX_TEXT_RECORD_LENGTH = 256;

// In _textRecordOf
if (offset != 32 || length > result.length - 64 || length > _MAX_TEXT_RECORD_LENGTH) return "";
```

256 is generous (the expected record is `chainId:projectId`, well under 50 bytes).

---

## Medium severity — defense-in-depth / inconsistencies

### 3. `nana-distributor-v6` — `balanceBefore` snapshot precedes the reentrancy guard

**File:** `src/JBDistributor.sol:499`
**Confidence:** 80

Current order:

```solidity
uint256 balanceBefore = token.balanceOf(address(this));   // <— external call, guard NOT armed
address tokenBeingAccepted = _acceptingToken;
if (tokenBeingAccepted != address(0)) revert JBDistributor_ReentrantTokenTransfer(tokenBeingAccepted);
_acceptingToken = address(token);                          // guard armed here
token.safeTransferFrom(...);
acceptedAmount = token.balanceOf(address(this)) - balanceBefore;
_acceptingToken = address(0);
```

If `token.balanceOf` is staticcall-reentrant into the distributor (a malicious/upgradeable token), the call happens with the transient guard still cleared. `_requireNotAcceptingToken()` in `beginVesting` would therefore pass during that reentry and could record a snapshot against the pre-funded state.

Blast radius is bounded — the attacker has to control the reward token they're funding, and over-accounting only affects that token's own accounting balance. Not a fund-loss vector against other tokens. Still, the reorder is free.

**Proposed fix:** set the guard before the first `balanceOf`:

```solidity
address tokenBeingAccepted = _acceptingToken;
if (tokenBeingAccepted != address(0)) revert JBDistributor_ReentrantTokenTransfer(tokenBeingAccepted);
_acceptingToken = address(token);

uint256 balanceBefore = token.balanceOf(address(this));
token.safeTransferFrom(...);
acceptedAmount = token.balanceOf(address(this)) - balanceBefore;
_acceptingToken = address(0);
```

**Related test gap:** no test exercises an actual fee-on-transfer token's credit delta — the central new mechanism in the PR is undercovered.

---

### 4. `revnet-core-v6` — `liquidateExpiredLoansFrom` lacks `nonReentrantLoanAction`

**File:** `src/REVLoans.sol:677`
**Confidence:** 85

Every other state-changing loan path (`borrowFrom`, `repayLoan`, `reallocateCollateralFromLoan`) carries `nonReentrantLoanAction`. Liquidation does not.

Liquidation today is safe: it calls `_burn` (ERC-721 internal) plus storage decrements; no external call sits inside the modifier's intended boundary. So this is **consistency**, not a current vulnerability. If a future change adds a hook/callback to liquidation (e.g., a liquidator notification), the cross-loan-action invariant the guard documents gets silently broken.

**Proposed fix:** add `nonReentrantLoanAction` to `liquidateExpiredLoansFrom` for uniformity.

---

### 5. `revnet-core-v6` — same-address deployer config now reverts late

**File:** `src/REVDeployer.sol` (`_makeTerminalConfigurations`)
**Confidence:** 80

The previous dedup branch (`hasDistinctRouterTerminalRegistry ? 2 : 1`) was removed in this PR. If a deploy script accidentally passes the same address for `multiTerminal` and `routerTerminalRegistry`, the failure now surfaces deep inside `JBController.launchProjectFor` as `JBDirectory_DuplicateTerminals` — not at deployer construction.

Pure operational hygiene; not a runtime correctness issue. But the new failure mode is harder to diagnose than the old early revert.

**Proposed fix:** add a one-line constructor invariant:

```solidity
if (multiTerminal == routerTerminalRegistry) revert REVDeployer_InvalidTerminalConfiguration(multiTerminal);
```

(Plus the matching error declaration.) Fails fast at deploy time.

---

## Low severity — cosmetic / design tradeoffs

### 6. `nana-suckers-v6` — `_localTokenForRemoteToken` reservation persists across disable (intentional)

**File:** `src/JBSucker.sol:1119-1129`
**Confidence:** N/A (intentional behaviour)

When a local token's mapping is disabled (`remoteToken == bytes32(0)`), the reverse reservation is preserved (line 1119 re-writes `currentMapping.addr`). Comment lines 1127-1128 explicitly call this out: the reservation persists so the same local token can be re-enabled later without losing its slot.

A first-pass review can mistake this for a bug ("disabled token still holds the remote slot, blocking other locals"). It's deliberate — in-flight roots from the disabled token must still resolve cleanly on the remote side.

**Proposed change:** none, except perhaps elevating the existing comment to a `@dev` on the field declaration so future readers don't try to "fix" it.

---

### 7. `nana-omnichain-deployers-v6` — post-launch `_requireController({allowUnset: false})` is provably redundant

**Files:** `src/JBOmnichainDeployer.sol:798` and `:866`
**Confidence:** 90

`JBController.launchRulesetsFor` unconditionally calls `DIRECTORY.setControllerOf(..., address(this))` before returning. If `launchRulesetsFor` returns without reverting, `controllerOf(projectId) == CONTROLLER` is guaranteed. The post-checks therefore can never catch a real mismatch.

Harmless but dead code (one storage read each, gas-trivial).

**Proposed change:** either remove the post-checks, or keep them as a documented sanity-belt. Both are defensible — note in code comments which intent applies.

---

### 8. `nana-721-hook-v6` — `splitCreditWeight` is encoded but never decoded

**File:** `src/abstract/JB721Hook.sol` / `src/JB721TiersHook.sol`
**Confidence:** 70 (latent, not a bug)

`beforePayRecordedWith` encodes `(address, address, bytes, uint256)` into `hookSpecifications[0].metadata`, but `_processPayment` decodes only the first three fields (`abi.decode(..., (address, address, bytes))`). The `splitCreditWeight` field is dead weight in the round-trip within this contract.

ABI-spec-valid (dynamic-type offsets resolve correctly when fewer fields are decoded), so no runtime issue. Intentional if an external compositor (`JBOmnichainDeployer`) reads the 4th field.

**Proposed change:** either consume the value where it's decoded, or stop encoding it. If kept for external readers, document that explicitly at the encode site.

---

## Clean (no findings)

- **nana-core-v6** — `_acceptingToken` transient lifecycle, `TerminalMigrationToSelf`, `refundOnFailure` fee credit, `DuplicateFundAccessLimitGroup` (full O(n²) check), `JBPrices_ZeroPrice`, locked-split multiplicity logic, `ReservedTokenSplitProjectSameAsOwner`, storage layout — all check out.
- **nana-project-handles-v6** — ABI decode bounds, memory safety, behaviour parity with try/catch, malformed-resolver handling, and the `bytes(textRecord = new string(length))` aliasing all check out. Only the DoS cap (finding 2) is outstanding.
- **nana-721-hook-v6** — `cleanTiers` trailing-tier compaction, `_InvalidPayValue` guard semantics, split-error revert conditions, reserve/transfer pause coverage, and CEI ordering all clean. Only the dead `splitCreditWeight` (finding 8).

---

## Summary table

| # | Repo | Severity | Confidence | File |
|---|------|----------|------------|------|
| 1 | univ4-lp-split-hook-v6 | High | 100 | `JBUniswapV4LPSplitHook.sol:2120` |
| 2 | nana-project-handles-v6 | High | 90 | `JBProjectHandles.sol` (`_textRecordOf`) |
| 3 | nana-distributor-v6 | Medium | 80 | `JBDistributor.sol:499` |
| 4 | revnet-core-v6 | Medium | 85 | `REVLoans.sol:677` |
| 5 | revnet-core-v6 | Medium | 80 | `REVDeployer.sol` (`_makeTerminalConfigurations`) |
| 6 | nana-suckers-v6 | Low | N/A | `JBSucker.sol:1119-1129` (intentional) |
| 7 | nana-omnichain-deployers-v6 | Low | 90 | `JBOmnichainDeployer.sol:798, 866` |
| 8 | nana-721-hook-v6 | Low | 70 | `JB721Hook.sol` / `JB721TiersHook.sol` |

**Net:** two real fixes worth making (univ4 Permit2 expiration, project-handles length cap), three medium tradeoffs to consider, three low-severity items, three repos clean.

---

## Cross-cutting concerns (not per-repo)

These weren't part of the per-repo reviews and matter at the integration boundary.

> **Pre-deployment context:** the v6 system has not been deployed yet, so interface-signature changes and CREATE2 address shifts have no live blast radius. Items 9, 10, and 15 below are tracked for completeness but are not blockers.

### 9. Breaking interface change: `IREVLoans.MULTI_TERMINAL() → TERMINAL()` — N/A pre-deployment

**Confidence:** 100 finding / **Status: Not a blocker**

The rename changes a public 4-byte selector. With no live deployment, there are no production callers or indexers to coordinate. Internal call sites (Deploy.s.sol, tests, REVOwner) were updated in the PR. Worth a one-line CHANGELOG entry when the v6 system is eventually tagged for first deployment; no other action required.

---

### 10. CREATE2 / canonical address shifts — N/A pre-deployment

**Confidence:** 90 finding / **Status: Not a blocker**

Most modified contracts have new bytecode, so their salt-deployed addresses move. With no chain-same invariants live to honor (the `project_chain_same_inventory.md` memory tracks intent, not current production state), this is just the expected pre-launch state. Re-record the canonical addresses once the bytecode is final.

---

### 11. Contract size budget

**Confidence:** 70 (likely fine but unmeasured)

`nana-suckers-v6` already extracts `JBCCIPLib` to a separate deployed library — an explicit size-budget workaround for `JBSwapCCIPSucker`. Other PRs added meaningful code without an equivalent extraction:

- `nana-core-v6/JBMultiTerminal` (+63 lines) — already a 2024-line contract.
- `nana-core-v6/JBSplits` (+65 lines) — close to the size limit at HEAD-1.
- `nana-omnichain-deployers-v6` net change is roughly +0 but the new `_requireController` flag-path expands a hot helper.

**Proposed action:** `forge build --sizes` (or equivalent) on each repo and confirm no contract crossed the 24 KB EIP-170 limit. If any close, prepare to refactor on the same lines as the CCIP extract.

---

### 12. Halmos / formal-proof validity

**Confidence:** 80

`nana-suckers-v6` and `nana-core-v6` both ship `test/formal/*Halmos*` proofs. Diff overview:

- `nana-suckers-v6/test/formal/JBSuckerLibHalmos.t.sol` is **already uncommitted on disk** with a split of the single symbolic-count proof into power-of-two + dense-mask variants. The original proof was timing out at 30 min CI; the split is an in-progress fix. Status: needs commit-or-revert decision (flagged in the prior session as unrelated work).
- `nana-core-v6` halmos proofs for fee/bonding-curve properties: I did not verify whether the contract changes in this PR (new errors, new transient flag, locked-split refactor) invalidate or weaken any property.

**Proposed action:** re-run the halmos suite against the merge candidate. Treat any new timeouts or failures as blocking.

---

### 13. Test coverage of new behaviour

**Confidence:** 90 for distributor, lower elsewhere (un-audited)

The distributor PR introduces `_acceptErc20FundsFrom`'s balance-delta crediting as its central new mechanism but lacks an explicit fee-on-transfer test case (the reviewer searched for it). Other repos likely have analogous gaps that the per-repo reviews didn't check:

- nana-core-v6: any test exercising the `refundOnFailure` branch on `_processFee` / `_takeFeeFrom` when the fee terminal genuinely reverts?
- nana-suckers-v6: tests for the new `_localTokenForRemoteToken` reservation across disable/re-enable cycles?
- omnichain-deployers-v6: tests for `_requireController({allowUnset: true})` accepting an unset existing project?

**Proposed action:** for each PR, ensure the new revert conditions and new state transitions have at least one direct test.

---

### 14. `MockEmptyTerminal` quietly returns zeros for any future call

**File:** `revnet-core-v6/test/mock/MockEmptyTerminal.sol`
**Confidence:** 75

The mock's `fallback() external payable` returns 32 zero bytes. This was tuned to satisfy `addAccountingContextsFor` and `currentSurplusOf` calls during test setup. If a future test (or a future protocol change) adds a call site that returns a struct, a bool, or expects a specific value, the mock will silently return zeros and the test may pass for the wrong reason.

**Proposed action:** comment the mock more loudly about its assumptions, or replace with a typed `MockRouterTerminal` that explicitly implements `IJBTerminal` and reverts on unimplemented selectors.

---

### 15. Bendystraw / indexer impact — N/A pre-deployment

**Confidence:** 60 finding / **Status: Not a blocker**

Bendystraw indexes a live deployment. With no v6 system live, there is nothing to break. Once a deployment is targeted, do an event-schema diff against whatever Bendystraw build will index v6, but that's a release-prep item, not a PR-merge item.

---

### 16. Summary of cross-cutting items

Pre-deployment context applied:

| # | Concern | Status |
|---|---------|--------|
| 9 | `IREVLoans` selector rename | **N/A pre-deployment** — CHANGELOG note when tagging |
| 10 | CREATE2 address shifts | **N/A pre-deployment** — re-record addresses post-bytecode-freeze |
| 11 | Contract size budget | Open — needs `forge build --sizes` check |
| 12 | Halmos proof validity | Open — re-run formal suite on merge candidate |
| 13 | New-path test coverage | Open — distributor fee-on-transfer test gap is concrete |
| 14 | `MockEmptyTerminal` silent zero-return | Open — testing-quality nit |
| 15 | Bendystraw / event-schema | **N/A pre-deployment** — diff before tagging |

**Real action items remaining cross-repo:** 11 (size check), 12 (halmos re-run), 13 (add FoT test in distributor), 14 (loud comment on mock or replace with typed stub).

