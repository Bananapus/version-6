# Codex Nemesis Audit — Round 3 Triage

**Run:** 2026-03-27 (run ID `20260327-143402`)
**Repos audited:** 17
**Previous runs:** Round 1 (`20260323-211452`, `CODEX_AUDIT.md`), Round 2 (`20260325-200049`, `CODEX_AUDIT_2.md`)

---

## Executive Summary

Round 3 produced **25 raw findings** across 17 repos (including 1 self-eliminated false positive by Codex). After source-code verification and cross-referencing with Rounds 1 and 2:

| Category | Count |
|----------|-------|
| **NEW true positives** (not in Round 1 or 2) | 12 |
| **Repeat/evolved findings** (confirming unfixed or newly-angled issues) | 9 |
| **False positives** (invalid after source verification) | 4 |
| **Post-triage resolved** (already fixed or not real) | 4 |

**Net items requiring attention: 17** (3 High, 5 Medium, 9 Low)
**Already resolved in post-triage:** RPT-H-1 (CREATE2 canonical), RPT-M-3 (balance-delta fix), RPT-M-4 (dynamic owner), RPT-M-1 (partial — EOA case remains)
**Clean repos:** 3 (nana-omnichain-deployers-v6, nana-ownable-v6, nana-permission-ids-v6)

---

## Severity Breakdown (All True Positives)

| Severity | New | Repeat | Total |
|----------|-----|--------|-------|
| Critical | 0 | 0 | **0** |
| High | 2 | 3 | **5** |
| Medium | 3 | 4 | **7** |
| Low | 7 | 2 | **9** |
| **Total** | **12** | **9** | **21** |

---

## Summary by Repo

| # | Repo | C | H | M | L | Total | Notes |
|---|------|---|---|---|---|-------|-------|
| 1 | nana-core-v6 | 0 | 0 | 0 | 2 | 2 | 1 new, 1 repeat |
| 2 | univ4-lp-split-hook-v6 | 0 | 1 | 0 | 0 | 1 | 1 repeat (1 FP eliminated) |
| 3 | revnet-core-v6 | 0 | 0 | 0 | 1 | 1 | 1 repeat (1 FP eliminated) |
| 4 | nana-router-terminal-v6 | 0 | 0 | 1 | 0 | 1 | 1 repeat |
| 5 | nana-721-hook-v6 | 0 | 1 | 1 | 0 | 2 | 2 new |
| 6 | univ4-router-v6 | 0 | 0 | 1 | 0 | 1 | 1 repeat |
| 7 | nana-buyback-hook-v6 | 0 | 0 | 1 | 0 | 1 | 1 repeat |
| 8 | nana-suckers-v6 | 0 | 1 | 0 | 0 | 1 | 1 new |
| 9 | defifa-collection-deployer-v6 | 0 | 1 | 0 | 0 | 1 | 1 repeat (evolved from R2-NEW-H-2) |
| 10 | croptop-core-v6 | 0 | 0 | 1 | 1 | 2 | 1 new, 1 repeat (1 FP eliminated) |
| 11 | banny-retail-v6 | 0 | 0 | 1 | 0 | 1 | 1 new |
| 12 | nana-omnichain-deployers-v6 | 0 | 0 | 0 | 0 | 0 | Clean |
| 13 | nana-ownable-v6 | 0 | 0 | 0 | 0 | 0 | Clean |
| 14 | nana-address-registry-v6 | 0 | 0 | 0 | 2 | 2 | 2 new |
| 15 | nana-permission-ids-v6 | 0 | 0 | 0 | 0 | 0 | Clean |
| 16 | nana-fee-project-deployer-v6 | 0 | 0 | 0 | 2 | 2 | 2 new |
| 17 | deploy-all-v6 | 0 | 1 | 1 | 1 | 3 | 2 new, 1 repeat |

---

## FALSE POSITIVES (4)

### FP-1: Terminal-token leftover sweep steals fee-token claims (univ4-lp-split-hook-v6 NM-001)

**Codex severity:** HIGH
**File:** `src/JBUniswapV4LPSplitHook.sol:1267-1274`

Codex claimed `_handleLeftoverTokens()` sweeps terminal tokens without excluding `_totalOutstandingFeeTokenClaims[terminalToken]`, enabling cross-project theft.

**Verdict:** FALSE POSITIVE — The finding conflates terminal tokens (ETH/USDC) with fee project tokens (JBX). Fee tokens are **project tokens**, not terminal tokens. `_routeFeesToProject()` spends terminal tokens paying into the fee project and receives back the fee project's ERC-20 token. `_totalOutstandingFeeTokenClaims` is only incremented for `feeProjectToken` (line 1534), never for `terminalToken`. The project-token balance read at line 1256 correctly subtracts `_totalOutstandingFeeTokenClaims[projectToken]`. The Round 1 H-1 fix is confirmed in place at lines 686, 826, 938, 1256, 1371, and 1534.

---

### FP-2: Buyback-routed cash outs underpay the revnet fee (revnet-core-v6 NM-001)

**Codex severity:** MEDIUM
**File:** `src/REVDeployer.sol:287-306`

Codex claimed the fee is fixed from the bonding curve before the buyback hook upgrades the non-fee tranche to a better pool route, causing systematic fee underpayment.

**Verdict:** FALSE POSITIVE — The fee is **token-based by design**, not value-based. `feeCashOutCount = cashOutCount * FEE / MAX_FEE` (line 287) splits 2.5% of tokens for the fee revnet, and the fee amount is their bonding-curve reclaim. The remaining 97.5% goes through whichever route is better for the user. The fee revnet always receives the bonding-curve value of its 2.5% token share, regardless of external pool conditions. Recomputing the fee based on pool price would create manipulation incentives and break the intended economic model.

---

### FP-3: Ownership claim breaks future Croptop publishing (croptop-core-v6 NM-001)

**Codex severity:** MEDIUM
**File:** `src/CTDeployer.sol:234-244`, `src/CTPublisher.sol:256`

Codex claimed `claimCollectionOwnershipOf()` doesn't grant permissions to `CTPublisher` from the new owner, breaking publishing.

**Verdict:** FALSE POSITIVE — This is explicitly documented behavior. The NatDoc at `CTDeployer.sol:228-232` states: *"The project owner must then grant CTPublisher the ADJUST_721_TIERS permission for the project so that mintFrom() continues to work. Without this permission grant, all subsequent posts will revert. This cannot be done atomically here because after transferring ownership to the project, this contract no longer has authority to set permissions on the project's behalf."* The function is opt-in, project-owner-initiated, and the two-step process is the only possible approach given the permission system design.

---

### FP-4: Reverted payout / fee forwarding leaves spendable allowance (nana-core-v6 NM-003)

**Codex severity:** N/A (self-eliminated)

Codex correctly eliminated this via targeted PoC: the approval happens inside the reverting external frame, so it is rolled back.

---

## NEW TRUE POSITIVES

### NEW-H-1: Failed earlier tier splits overpay later recipients (nana-721-hook-v6)

**Severity:** HIGH — **FIXED**
**File:** `src/libraries/JB721TiersHookLib.sol:399-423`
**Verified:** YES — confirmed against source code
**Fix:** Always decrement `leftoverAmount` before calling `_sendPayoutToSplit`; on failure, add back to leftover for routing to project balance. Existing tests pass; regression test confirms fix.

In `_distributeSingleSplit()`, `leftoverPercentage` is decremented **unconditionally** (line 421) while `leftoverAmount` is only decremented **on success** (line 416). When a split recipient reverts, their percentage slot is consumed but the amount stays inflated, causing subsequent recipients to receive more than their intended share.

**Example:** Two 50/50 splits distributing 1 ETH. Split 0 reverts → `leftoverAmount` stays at 1 ETH, `leftoverPercentage` drops to 50%. Split 1 computes `1 ETH * 50% / 50% = 1 ETH` instead of 0.5 ETH.

**Contrast:** nana-core's `JBPayoutSplitGroupLib` (lines 89-94) always decrements `leftoverAmount` and restores failed amounts via `recordAddedBalanceFor()`.

**Recommendation:** Always decrement `leftoverAmount` regardless of success, and route failed amounts back to the project via `addToBalanceOf`.

---

### NEW-H-2: ERC-2771 sender rewriting allows forged bridge roots (nana-suckers-v6)

**Severity:** HIGH (conditional — requires non-zero trusted forwarder) — **FIXED**
**File:** `src/JBSucker.sol:476-482`
**Verified:** YES — confirmed against source code
**Fix:** Replaced `_msgSender()` with `msg.sender` in `fromRemote()`. Regression test confirms forgery now reverts with `JBSucker_NotPeer`.

`fromRemote()` gates access with `_isRemotePeer(_msgSender())` instead of `_isRemotePeer(msg.sender)`. `JBSucker` inherits `ERC2771Context` (line 45) with a configurable trusted forwarder (constructor line 167-169). When `msg.sender` is the trusted forwarder, `_msgSender()` returns the last 20 bytes of calldata — an attacker-controlled value.

**Attack path (CCIP variant):** The CCIP sucker's `_isRemotePeer()` checks `sender == address(this)`, which is trivially spoofable via the calldata suffix. A forwarder could call `fromRemote()` directly, bypassing `ccipReceive()`.

**Mitigating factors:**
- If trusted forwarder is `address(0)`, not exploitable
- A legitimate ERC2771 forwarder validates signatures, limiting the attacker to whoever can produce valid signatures for bridge-like addresses
- The code has a comment (line 478-479) acknowledging the choice but its reasoning is flawed

**Recommendation:** Use `msg.sender` instead of `_msgSender()` in `fromRemote()`, since bridge messengers never use ERC2771 meta-transactions (as the comment itself states).

---

### NEW-M-1: Pay credits cannot fully fund split-bearing NFT mints (nana-721-hook-v6)

**Severity:** MEDIUM — **FIXED**
**File:** `src/JB721TiersHook.sol:187-214, 634-671`, `nana-core-v6/src/JBTerminalStore.sol:1028-1033`
**Fix:** Cap `totalSplitAmount` at `context.amount.value` in `beforePayRecordedWith`. Pay credits are virtual and cannot fund splits.

`beforePayRecordedWith` computes the forwarded split amount from tier metadata and asks the terminal to forward the split portion from the new payment. The core terminal validates `specifiedAmount <= amount.value` before `_mintAndUpdateCredits` runs, where `payCreditsOf[beneficiary]` is consumed. At 100% split, a user with sufficient credits still cannot complete a purchase without bringing fresh funds equal to the full split amount.

---

### NEW-M-2: Migration verification skips unrelated owners when fallback resolver holds the same tier (banny-retail-v6)

**Severity:** MEDIUM — **FIXED**
**File:** `script/helpers/MigrationHelper.sol:93-118`
**Fix:** Skip fallback resolver as an owner (don't skip the tier). Compare `v5Balance <= v4Balance + v4FallbackResolverBalance` to allow for redistribution.

`verifyTierBalances()` reads `v4FallbackResolverBalance` once per `(owner, tier)` and exits the tier check before reading the current owner's V4/V5 balances. When a V4 tier has NFTs held by the fallback resolver, the migration can over-allocate that tier to a normal owner in V5 and the validation passes unnoticed. The bad state is permanent once migration is executed.

---

### NEW-M-3: Resume can preserve a wrong immutable price feed instead of halting (deploy-all-v6)

**Severity:** MEDIUM — **FIXED**
**File:** `script/Resume.s.sol:2731-2739`, `script/Deploy.s.sol:2537`
**Fix:** Added `Resume_PriceFeedMismatch` revert when existing feed doesn't match expected, matching Deploy's strict validation.

The deploy path validates both sides of the expected-feed/registered-feed pair with a strict mismatch revert, but the resume path only mutates the empty side. If a prior partial deployment inserted the wrong feed, resume silently accepts it. Since default feeds are immutable in `JBPrices`, the misconfiguration requires redeployment.

---

### NEW-L-1: DeployPeriphery deadline skip-guard incompatible with Sphinx (nana-core-v6)

**Severity:** LOW — **FIXED**
**File:** `script/DeployPeriphery.s.sol:180-193, 292-305`
**Fix:** Changed `_isDeployed()` to use `address(this)` as the deployer instead of the Arachnid proxy address.

`_isDeployed()` hardcodes Arachnid's deterministic deployer address while the actual deployment uses Sphinx. Re-running after a Sphinx deployment returns `false` and attempts duplicate deployments.

---

### NEW-L-2: Deploy.s.sol not idempotent with default FEE_PROJECT_ID (croptop-core-v6)

**Severity:** LOW — **FIXED**
**File:** `script/Deploy.s.sol:66-151`
**Fix:** When `FEE_PROJECT_ID == 0`, scan existing projects for a deployed publisher singleton before creating a new fee project.

Running the deploy script with `FEE_PROJECT_ID = 0` creates a fee project and deploys a suite. Re-running creates another fee project with different CREATE2 addresses, stranding the previous suite.

---

### NEW-L-3: Zero-deployer registrations collapse "registered" and "unregistered" states (nana-address-registry-v6)

**Severity:** LOW — **FIXED**
**File:** `src/JBAddressRegistry.sol:126-131`
**Fix:** Added `JBAddressRegistry_ZeroDeployer()` revert when `deployer == address(0)`. Tests updated to expect revert.

`registerAddress(address(0), nonce)` succeeds and emits `AddressRegistered`, but the duplicate-registration check (`deployerOf[addr] != address(0)`) never triggers because the deployer is zero. Off-chain systems can be spammed with non-durable registrations.

---

### NEW-L-4: Deployment script checks CREATE2 existence at wrong address (nana-address-registry-v6)

**Severity:** LOW — **FIXED**
**File:** `script/Deploy.s.sol:28-37`
**Fix:** Changed deployer from Arachnid proxy to `address(this)` in `_isDeployed()` (same fix as NEW-L-1).

`_isDeployed()` computes the target using the deterministic deployment proxy (`0x4e59...`) instead of the contract executing the `CREATE2`. Solidity `new C{salt}()` derives addresses from the current contract. Idempotency checks are unreliable.

---

### NEW-L-5: Testnet deployments silently lose all configured auto-issuance (nana-fee-project-deployer-v6)

**Severity:** LOW — **FIXED**
**File:** `script/Deploy.s.sol:63-64, 125-129`
**Fix:** Use `block.chainid` for the current chain's auto-issuance entry, mapping testnet chain IDs to their sepolia equivalents.

`configureSphinx()` enables Sepolia testnets but `deploy()` creates `REVAutoIssuance` entries with mainnet chain IDs (1, 8453, 10, 42161). No entry matches Sepolia chain IDs, so `autoIssueFor()` reverts on testnets.

---

### NEW-L-6: Project #1 terminal selection not locked (nana-fee-project-deployer-v6)

**Severity:** LOW — **DOCUMENTED**
**File:** `script/Deploy.s.sol:107-113, 195-202`
**Fix:** Added documentation comment noting the risk and recommending post-deployment terminal locking. Actual lock requires directory-level change outside script scope.

`deploy()` writes the registry terminal into the project config but never writes `_terminalOf[projectId]` or `hasLockedTerminal[projectId]` inside the registry. The registry owner changing `defaultTerminal` would silently redirect payments to the fee project.

---

### NEW-L-7: Verify script marks deployment healthy without checking USDC feed (deploy-all-v6)

**Severity:** LOW — **FIXED**
**File:** `script/Verify.s.sol:628`
**Fix:** Added USDC/USD feed verification with per-chain USDC addresses and sanity checks ($0.90-$1.10).

`_verifyPriceFeeds()` only checks ETH/USD, ETH/native, and USD/ETH — not USDC/USD, which is registered during deployment. A deployment with broken USDC flows can be incorrectly accepted as healthy.

---

## REPEAT/EVOLVED FINDINGS (Confirming Unfixed Issues)

### RPT-H-1: Deployment script wires wrong Uniswap V4 contracts on non-Ethereum chains (univ4-lp-split-hook-v6)

**Severity:** HIGH → **RESOLVED**
**Maps to:** Round 1 H-2, Round 2 repeat (NEEDS VERIFICATION status)
**File:** `script/Deploy.s.sol:69-145`

**Post-triage verification:** RESOLVED — The V4 PositionManager address (`0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e`) is canonical across all chains via CREATE2 deterministic deployment. The same address is valid on Ethereum, Optimism, Arbitrum, Base, etc. No chain-specific lookup needed.

---

### RPT-H-2: Pending reserve mints can reopen a succeeded scorecard (defifa-collection-deployer-v6)

**Severity:** HIGH
**Maps to:** Round 2 NEW-H-2 (evolved — different attack vector)
**File:** `src/DefifaGovernor.sol:420-446, 488-494`
**Verified:** YES — PoC test exists at `test/audit/CodexPendingReserveQuorumGrief.t.sol`

`stateOf()` uses live quorum from `currentSupplyOfTier()` while attestations are snapshotted. `mintReservesFor()` is permissionless during the SCORING phase (`pauseMintPendingReserves: false` at `DefifaDeployer.sol:865`). Minting pending reserves on a refunded tier revives it in the quorum calculation, causing a SUCCEEDED scorecard to revert to ACTIVE.

**Note:** Round 2 NEW-H-2 focused on cash-out dilution; this is a distinct governance-griefing vector within the same live-quorum design flaw.

---

### RPT-H-3: Resume uses different CREATE2 salt for Defifa phase (deploy-all-v6)

**Severity:** HIGH
**Maps to:** Round 2 NEW-H-3 (evolved — specific salt mismatch identified)
**File:** `script/Deploy.s.sol:223` vs `script/Resume.s.sol:264`

`Deploy._deployDefifa()` uses `keccak256("0.0.2")` while `Resume._resumeDefifa()` uses `_DEFIFA_SALTV6_`. Recovery deploys a second Defifa stack instead of recognizing the original.

---

### RPT-M-1: Direct pay() routes partial-swap leftovers to beneficiary instead of payer (nana-router-terminal-v6)

**Severity:** MEDIUM (upgraded from Round 1 L-2) → **FIXED**
**Maps to:** Round 1 L-2 (acknowledged design choice)
**File:** `src/JBRouterTerminal.sol:257, 278`

**Post-triage verification:** PARTIALLY FIXED — Contract callers are handled correctly via `IJBPayerTracker` which resolves the actual payer. However, for EOA direct callers, `pay()` at line 278 passes `payable(beneficiary)` to `_resolveRefundTo` instead of `payable(_msgSender())`. The `addToBalanceOf()` path already correctly uses `_msgSender()`.

**Fix applied:** Changed line 278 from `_resolveRefundTo(payable(beneficiary))` to `_resolveRefundTo(payable(_msgSender()))`, making `pay()` consistent with `addToBalanceOf()`. PoC test updated to verify payer receives refund.

---

### RPT-M-2: Buy-side decimals fallback routes to inferior V4 swap (univ4-router-v6)

**Severity:** MEDIUM → **FIXED**
**Maps to:** Round 1 M-5
**File:** `src/JBUniswapV4Hook.sol:705-731, 855-863`

**Fix applied:** `_getTokenDecimals()` now reverts instead of silently defaulting to 18. The buy-side fallback in `_determineSwap` wraps `calculateExpectedTokensWithCurrency()` in try-catch — on failure, `juiceboxExpectedOutput` stays 0, correctly favoring the V4 path only when Juicebox comparison genuinely unavailable. PoC test updated to verify revert behavior.

---

### RPT-M-3: Fee-on-transfer fallback over-mints project tokens (nana-buyback-hook-v6)

**Severity:** MEDIUM → **RESOLVED**
**Maps to:** Round 2 NEW-M-2 (was NEEDS INVESTIGATION for FOT scope)
**File:** `src/JBBuybackHook.sol:335, 353`

**Post-triage verification:** RESOLVED — The buyback hook already uses a balance-delta pattern (checking actual balance change rather than nominal amount) to handle FOT tokens. Tests confirming this behavior exist in the repo.

---

### RPT-M-4: Original project owner keeps collection-admin powers after NFT transfer (croptop-core-v6)

**Severity:** MEDIUM → **FALSE POSITIVE**
**Maps to:** Round 1 M-10
**File:** `src/CTDeployer.sol:339-343`

**Post-triage verification:** FALSE POSITIVE — The permissions at line 349 are granted FROM `address(this)` (CTDeployer) TO `owner`, with the projectId scope. The hook's ownership is managed via `JBOwnable`, where `hook.owner()` resolves dynamically through `PROJECTS.ownerOf(projectId)`. When the project NFT transfers, `hook.owner()` returns the new owner. The granted permissions are for interacting with `CTDeployer` on behalf of the project — the original owner can only exercise them if they still own the project NFT. The comment at line 340-342 was incorrect and has been fixed (see FP-3 NatSpec fix).

---

### RPT-L-1: Held fees remain on old terminal after balance migration (nana-core-v6)

**Severity:** LOW → **DOCUMENTED**
**Maps to:** Round 2 FP (reconsidered — more specific scenario)
**File:** `src/JBMultiTerminal.sol:476-523, 600-636`

Round 2 dismissed this as FP ("held fees remain backed"). Round 3 provides a more specific scenario: `migrateBalanceOf()` zeros the project balance on the old terminal but leaves `_heldFeesOf` and `_nextHeldFeeIndexOf` intact. After migration, `processHeldFeesOf()` on the old terminal operates on stale accounting without matching backing balance. Downgraded from MEDIUM to LOW because it requires the held-fee + migration lifecycle.

**Fix applied:** Enhanced NatSpec comment on `migrateBalanceOf` documenting that held fees remain on the old terminal post-migration, and project owners should process or return held fees before migrating.

---

### RPT-L-2: Deployment script not restart-idempotent after singleton discovery (revnet-core-v6)

**Severity:** LOW → **FIXED**
**Maps to:** Related to Round 1 M-3 (different aspect — M-3 was about fee project ID mutation, this is about reconfiguration calls)
**File:** `script/Deploy.s.sol:345-469`

Re-running after initial deployment finds the existing singleton but still calls `_basicDeployer.deployFor(FEE_PROJECT_ID, ...)` on a non-blank project. The "existing project" initialization path fails operationally.

**Fix applied:** Wrapped `deployFor` call in `if (!_singletonsExist)` guard, skipping reconfiguration when singletons are already deployed.

---

## Cross-Round Tracker

### Findings Across All 3 Rounds

| Issue Class | R1 | R2 | R3 | Status |
|------------|-----|-----|-----|--------|
| LP split hook fee-token claims | H-1 | Fixed | FP (fix confirmed) | **RESOLVED** |
| LP split hook wrong V4 addresses | H-2 | Repeat | RPT-H-1 | **RESOLVED (canonical CREATE2)** |
| Suckers destination deprecation stranding | H-3 | Repeat | Not found | Possibly fixed or out of scope |
| Defifa governance manipulation | H-4 | NEW-H-2 | RPT-H-2 | **FIXED (quorum snapshot)** |
| Deploy-all Banny project ID | H-5 | — | Not found | Status unknown |
| Core stale fee-free surplus | M-1 | — | Not found | Status unknown |
| Router terminal leftovers | M-4/L-2 | Repeat | RPT-M-1 | **FIXED** |
| V4 router buy-side fallback | M-5 | Repeat | RPT-M-2 | **FIXED** |
| Buyback hook FOT over-mint | — | NEW-M-2 | RPT-M-3 | **RESOLVED (balance-delta pattern)** |
| Croptop original owner permissions | M-10 | Repeat | RPT-M-4 | **FALSE POSITIVE (dynamic owner resolution)** |
| Deploy-all resume recovery | — | NEW-H-3 | RPT-H-3 | **FIXED (salt aligned)** |
| 721 hook split overpayment | — | — | NEW-H-1 | **FIXED** |
| Suckers ERC-2771 forged roots | — | — | NEW-H-2 | **FIXED** |
| 721 hook pay credits + splits | — | — | NEW-M-1 | **FIXED** |
| Banny migration verification | — | — | NEW-M-2 | **FIXED** |
| Deploy-all resume price feed | — | — | NEW-M-3 | **FIXED** |

### Items Fixed Since Earlier Rounds (Not Re-Found in Round 3)

| Round 1 ID | Finding | Last Status |
|------------|---------|-------------|
| H-1 | Fee-token claims diverted (univ4-lp-split-hook-v6) | Fixed (confirmed in R3 verification) |
| M-2 | Cashout rate uses total surplus (univ4-lp-split-hook-v6) | Fixed (R2) |
| M-3 | Deploy.s.sol fee project ID mutation (revnet-core-v6) | Fixed (R2), related issue persists |
| M-4 | Registry addToBalanceOf traps leftovers (nana-router-terminal-v6) | Fixed (R2) |
| M-6 | Registry pool config no-op (nana-buyback-hook-v6) | Fixed (R2) |
| L-1 | Loan ID namespace cap (revnet-core-v6) | Fixed (R2) |

---

## Priority Recommendations

### Must-Fix (Runtime, Fund Risk)

1. ~~**NEW-H-1** (nana-721-hook-v6)~~: **FIXED** — split distribution loop always decrements `leftoverAmount`, restores on failure
2. ~~**NEW-H-2** (nana-suckers-v6)~~: **FIXED** — `fromRemote()` uses `msg.sender` instead of `_msgSender()`
3. ~~**RPT-H-2** (defifa-collection-deployer-v6)~~: **FIXED** — Quorum snapshotted at scorecard submission time; `stateOf` uses snapshot instead of live quorum. `quorum()` includes tiers with pending reserves (not just minted supply) since unminted reserves indicate real participation.

### Should-Fix (Deployment/Script Safety)

4. ~~**RPT-H-1** (univ4-lp-split-hook-v6)~~: **RESOLVED** — canonical CREATE2 addresses
5. ~~**RPT-H-3** (deploy-all-v6)~~: **FIXED** — Resume `DEFIFA_SALT` aligned with Deploy (`bytes32(keccak256("0.0.2"))`)
6. ~~**NEW-M-3** (deploy-all-v6)~~: **FIXED** — feed-mismatch validation added to Resume path
7. ~~**NEW-M-2** (banny-retail-v6)~~: **FIXED** — migration verification accounts for fallback resolver balance

### Acknowledged / Design Review

8. ~~**RPT-M-1** (nana-router-terminal-v6)~~: **FIXED** — `pay()` now uses `_msgSender()` for refund resolution
9. ~~**RPT-M-2** (univ4-router-v6)~~: **FIXED** — `_getTokenDecimals()` reverts instead of defaulting, buy-side fallback uses try-catch
10. ~~**RPT-M-3** (nana-buyback-hook-v6)~~: **RESOLVED** — balance-delta pattern already in place
11. ~~**RPT-M-4** (croptop-core-v6)~~: **FALSE POSITIVE** — permissions invalidate via dynamic owner resolution
