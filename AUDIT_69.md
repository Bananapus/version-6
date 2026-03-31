# AUDIT_69 — Juicebox V6 EVM Aggregated Security Audit

**Date:** 2026-03-30
**Scope:** 18 repositories across the Juicebox V6 EVM protocol stack
**Auditors:** Claude Opus (Nemesis + Pashov personas), OpenAI Codex (Nemesis + Pashov personas), manual focused reviews
**Total compute time:** ~17 hours across 4 automated runs + 4 manual focused sessions

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Methodology](#methodology)
3. [Critical & High Findings](#critical--high-findings)
4. [Medium Findings](#medium-findings)
5. [Low Findings](#low-findings)
6. [Informational & Clean Repos](#informational--clean-repos)
7. [Run Metadata](#run-metadata)

---

## Executive Summary

Four independent automated audit runs scanned the entire Juicebox V6 EVM monorepo (18 submodules), supplemented by four manual focused reviews on nana-core-v6 and revnet-core-v6. After deduplication across all sources:

| Severity | Unique Findings |
|----------|----------------|
| Critical | 2 |
| High | 13 |
| Medium | 17 |
| Low | 50+ |
| Informational | 5+ |
| **Clean Repos** | **4** (nana-address-registry-v6, nana-permission-ids-v6, nana-ownable-v6, nana-privacy-v6) |

**Highest-impact themes:**
1. **Permission escalation via terminal registration** — `SET_PRIMARY_TERMINAL` / `SET_TERMINALS` can be escalated into arbitrary mint/burn authority and treasury drain (nana-core-v6)
2. **Deployment script correctness** — Multiple repos have non-idempotent, project-ID-corrupting, or wrong-address deployment flows
3. **Governance snapshot manipulation** — Reserve mints and same-timestamp transfers can manipulate Defifa voting power
4. **Fee-on-transfer accounting gaps** — Buyback hook and LP split hook overcredit/undermint with taxed tokens

---

## Methodology

| Run | Engine | Persona | Duration | Repos | Timestamp |
|-----|--------|---------|----------|-------|-----------|
| 1 | Claude Opus | Nemesis | 11h 50m | 17 | 20260329-232138 |
| 2 | OpenAI Codex | Nemesis | 2h 6m | 17 | 20260329-232148 |
| 3 | OpenAI Codex | Pashov | 2h 39m | 18 | 20260330-082627 |
| 4 | Claude Opus | Pashov | 8m 33s | 18 | 20260330-110744 |
| 5-8 | Manual focused | — | — | nana-core-v6, revnet-core-v6, nana-buyback-hook-v6 | message (13-16).txt |

Deduplication: Findings covering the same root cause and code path are merged. The highest severity rating across sources is used. All source attributions are preserved.

---

## Critical & High Findings

### C-1. `SET_PRIMARY_TERMINAL` delegates can escalate into trusted-terminal mint/burn authority and drain project surplus

**Severity:** CRITICAL
**Repos:** nana-core-v6
**Sources:** message (13).txt, message (14).txt, message (15).txt, message (16).txt, Nemesis Codex NM-001
**Affected code:** `JBDirectory.sol:175-190, 204-236, 299-313, 323-340`, `JBController.sol:236-261, 497-547, 1184-1186`

**Root cause:** `JBDirectory.setPrimaryTerminalOf()` is gated only by `SET_PRIMARY_TERMINAL` but implicitly adds a previously unlisted terminal via `_addTerminalIfNeeded()`. The only validation is an untrusted external `accountingContextForTokenOf()` call that a malicious contract can trivially spoof. Once added to `_terminalsOf`, the terminal becomes fully trusted — any listed terminal can call `JBController.mintTokensOf()` and `burnTokensOf()`, even bypassing the `allowOwnerMinting` freeze.

`setTerminalsOf()` has the same fundamental issue: it accepts arbitrary addresses without verifying they are real/trusted terminals.

**Exploit path:**
1. Attacker obtains delegated `SET_PRIMARY_TERMINAL` (or `SET_TERMINALS`) on a project
2. Deploys a fake terminal that returns a nonzero accounting context
3. Calls `setPrimaryTerminalOf(projectId, token, fakeTerminal)` — silently added to terminal list
4. From fake terminal, calls `mintTokensOf()` to mint arbitrary supply, or `burnTokensOf()` to destroy victim balances
5. Cashes out minted tokens through a real terminal to drain treasury

**Impact:** Full privilege-escalation from a scoped operator role into effective terminal trust. For projects with surplus, this is a treasury-drain path. Even without surplus, enables supply inflation, balance destruction, and governance takeover.

When `useTotalSurplusForCashOuts` is enabled, the malicious terminal can also spoof global surplus and turn this into a full local-balance drain.

**Recommended fix:** Do not let `setPrimaryTerminalOf()` implicitly add new terminals. Require the terminal to already be present in `_terminalsOf`, or require `SET_TERMINALS` permission for implicit addition. Do not treat raw directory membership as sufficient for mint/burn trust.

Admin note: add new permission ADD_TERMINAL and check for it in Directory?

---

### ~~C-2. Payout split group IDs collide with caller-owned split namespaces~~ — FALSE POSITIVE (ALREADY MITIGATED)

**Severity:** ~~CRITICAL~~ → **Not a finding**
**Repos:** nana-core-v6
**Sources:** message (13).txt, message (15).txt
**Status:** All 4 auditor instances missed that the code already has this mitigation at `JBSplits.sol:108`:

```solidity
bool isSelfManaged = splitGroup.groupId >> 160 != 0 && address(uint160(splitGroup.groupId)) == msg.sender;
```

Self-auth requires the upper 96 bits of `groupId` to be non-zero. Payout group IDs use `uint256(uint160(token))` which has zero upper bits. Token contracts **cannot** self-auth into the payout namespace. The namespaces are already disjoint by design.

---

### C-3. Merkle proof index alias enables repeated cross-chain claims

**Severity:** CRITICAL
**Repos:** nana-suckers-v6
**Sources:** Pashov Codex [95]
**Affected code:** `JBSucker.claim`, `JBSucker.exitThroughEmergencyHatch`, `MerkleLib.branchRoot()`

**Root cause:** `MerkleLib.branchRoot()` only consumes 32 index bits while replay protection keys on the full `uint256`. The same valid proof can be re-used with `index + n * 2**32` to bypass the executed bitmap and re-run the claim path.

**Impact:** Unlimited repeated claims of bridged tokens.

**Recommended fix:**
```solidity
require(index < (1 << _TREE_DEPTH), "INDEX_OUT_OF_RANGE");
```

admint note: fix with a test that proves its necessary

---

### H-1. Expired loans can be refinanced after the 10-year liquidation threshold

**Severity:** HIGH
**Repos:** revnet-core-v6
**Sources:** message (14).txt
**Affected code:** `REVLoans.sol:43-45, 80-85, 360-368, 413-425, 587-589, 636-643, 707-749, 1136-1203`

**Root cause:** The expiry check is enforced in `_determineSourceFeeAmount()` (reached by `repayLoan()`) but NOT in `reallocateCollateralFromLoan()` or `_reallocateCollateralFromLoan()`. A borrower can reallocate an expired loan to extract collateral and open a fresh loan with a new `createdAt`.

**Impact:** Collateral that should be unrecoverable after 10 years can be salvaged unless a liquidator wins the race.

**Recommended fix:** Block all loan-management actions once `block.timestamp > loan.createdAt + LOAN_LIQUIDATION_DURATION`.

Admin note: fix and prove with tests.

---

### H-2. Locked reverting split hook permanently blocks reserved token distribution and controller migration

**Severity:** HIGH
**Repos:** nana-core-v6
**Sources:** Pashov Codex [90]
**Affected code:** `JBController._sendReservedTokensToSplitGroupOf`

**Root cause:** When a split has a `hook`, the controller transfers tokens then calls `split.hook.processSplitWith()` with no try/catch protection. If the hook reverts and the split is locked (`lockedUntil` set to max), the split cannot be removed, blocking all reserved token distribution and controller migration (which requires `pendingReservedTokenBalanceOf == 0`).

**Impact:** Permanent DoS on reserved token distribution and controller migration. 5 of 8 audit agents independently identified this.

**Recommended fix:** Wrap `processSplitWith()` in try/catch with a fallback (like the terminal payment path already does).

admint note: fix, and prove with tests.

---

### H-3. Reserve mints after scorecard submission inflate voting power (PoC verified)

**Severity:** HIGH
**Repos:** defifa-collection-deployer-v6
**Sources:** Nemesis Claude, Nemesis Codex, Pashov Codex [90]
**Affected code:** `DefifaGovernor.sol`, `DefifaHook.sol`

**Root cause:** `getBWAAttestationWeight` snapshots numerator/denominator but adds live `numberOfPendingReservesFor()`. `mintReservesFor()` (callable by anyone during SCORING) mutates pending reserves without updating any scorecard-scoped snapshot.

**Impact:** PoC raises holder's power from 375M to 750M. Under-supported scorecard ratified as SUCCEEDED. PoC passing: `test/audit/PendingReserveSnapshotBypass.t.sol`.

**Recommended fix:** Snapshot reserve dilution at scorecard submission time and reuse the frozen value.

admin note: fix, and prove with tests.

---

### H-4. Same-timestamp NFT transfers allow vote reuse across accounts

**Severity:** HIGH
**Repos:** defifa-collection-deployer-v6
**Sources:** Pashov Codex [95]
**Affected code:** `DefifaGovernor.attestToScorecardFrom`

**Root cause:** Attestation weight is snapshotted at `scorecard.attestationsBegin`, but OZ checkpoints overwrite same-key entries. A holder can attest, transfer the NFT in the same timestamp, and the recipient attests again with the same voting units.

**Recommended fix:** Use `scorecard.attestationsBegin - 1` as snapshot block.

admin note: fix, and prove with tests.

---

### H-5. `_ensureProjectExists` corrupts canonical project IDs during fresh deploy

**Severity:** HIGH
**Repos:** deploy-all-v6
**Sources:** Nemesis Claude, Nemesis Codex, Pashov Codex [95]
**Affected code:** `script/Deploy.s.sol` `_ensureProjectExists()`

**Root cause:** The reuse branch scans for any safe-owned project with `controller == 0`, not the requested ID. On fresh deploy, project #1 exists (safe-owned, no controller before phase 08), so phase 06 binds CPN to project #1 instead of #2.

**Impact:** Canonical project-ID invariant broken. `REVLoans` and `REVOwner` constructed against wrong project. Rollout cannot safely converge to intended 1/2/3/4 mapping.

**Recommended fix:** Remove the blanket blank-project reuse branch, or restrict so only `expectedProjectId` can ever be returned.

admin note: fix.

---

### ~~H-6. Buyback hook: caught swap reverts bypass payer's minimum-output guarantee~~ — FALSE POSITIVE (BY DESIGN)

**Severity:** ~~HIGH~~ → **Not a finding**
**Repos:** nana-buyback-hook-v6
**Sources:** Nemesis Codex
**Status:** Intentional design, documented in NatSpec and RISKS.md, covered by regression test.

The swap path only activates when the swap quote exceeds the issuance rate. On swap failure, the fallback mints at the issuance rate — the same output the payer would receive if the buyback hook didn't exist at all. The user loses the swap premium but is never worse off than baseline. Enforcing `minimumSwapAmountOut` on swap failure would create a DoS vector: any pool disruption would revert all payments to the project.

---

### H-7. Fee-on-transfer fallback overmints against under-credited treasury

**Severity:** HIGH
**Repos:** nana-buyback-hook-v6
**Sources:** Nemesis Codex, Pashov Codex [90]
**Affected code:** `JBBuybackHook.sol:342-362` (`afterPayRecordedWith`)

**Root cause:** Fallback `partialMintTokenCount` is computed from hook-side balance deltas, while the terminal credits only the net incoming amount. With fee-on-transfer tokens, the hook mints against a larger amount than the treasury received.

**Impact:** More project tokens minted than treasury backing. Existing holders diluted. PoC: `test/audit/FOTMintAccounting.t.sol`.

**Recommended fix:** Replace hook-side outgoing delta with terminal-side credited amount.

admin note: fix, and prove with tests.

---

### H-8. Fee-project pay-hook reentrancy destroys newly minted fee tokens before they are reserved

**Severity:** HIGH
**Repos:** univ4-lp-split-hook-v6
**Sources:** Nemesis Codex, Pashov Codex [75]
**Affected code:** `JBUniswapV4LPSplitHook.sol:1502-1562`

**Root cause:** `terminal.pay()` mutates the hook's fee-project-token balance, but `_totalOutstandingFeeTokenClaims` is not incremented until after control returns. A re-entrant `collectAndRouteLPFees()` call burns the fresh fee tokens as ordinary project tokens. PoC: `test/audit/CodexNemesisPoC.t.sol:189-244`.

**Impact:** Projects accrue claim balances backed by no tokens; later claims revert.

**Recommended fix:** Update `_totalOutstandingFeeTokenClaims` before the external `terminal.pay()` call.

admin note: fix, and prove with tests.

---

### H-9. Burning a dressed body permanently strands attached outfits and backgrounds

**Severity:** HIGH
**Repos:** banny-retail-v6
**Sources:** Nemesis Codex
**Affected code:** `Banny721TokenUriResolver.sol`

**Root cause:** When a body NFT is burned (via cashout), the resolver has no burn-aware release path. `ownerOf(bodyId)` reverts for burned tokens, blocking all undress/move operations on attached assets.

**Impact:** Permanent custody loss of attached NFTs. PoC: `test/audit/BurnedBodyStrandsAssets.t.sol`.

**Recommended fix:** Force-detach attached assets before body burn, or treat missing source body as a releasable state.

admin note: outfits and background should be burned alongside. ... but do we even have banny burns?

---

### H-10. Deploy script wires wrong Uniswap V4 PoolManager on L2s

**Severity:** HIGH
**Repos:** nana-router-terminal-v6
**Sources:** Nemesis Codex
**Affected code:** `script/Deploy.s.sol`

**Root cause:** Optimism, Base, and Arbitrum branches use `0x000000000004444c5dc75cB358380D2e3dE08A90` (Ethereum mainnet's V4 PoolManager). Correct addresses differ per chain.

**Impact:** Swap-based routing broken on all L2 deployments.

**Recommended fix:** Use per-chain documented PoolManager addresses.

admin note: check https://docs.uniswap.org/contracts/v4/deployments

---

### H-11. Partial singleton reuse can deploy revnets with a dead runtime hook

**Severity:** HIGH
**Repos:** revnet-core-v6
**Sources:** Nemesis Codex
**Affected code:** `script/Deploy.s.sol:390-505`

**Root cause:** `_singletonsExist = true` once `REVLoans` exists, but `REVOwner` may not be deployed. `REVDeployer` is deployed with `OWNER` = a predicted address with no code. Payments/cashouts revert when core calls the missing hook.

**Impact:** Permanent DoS on new revnets from a resumed partial deployment. Immutable — `metadata.dataHook = OWNER` is baked into stage rulesets.

admin note: fix.

---

### H-12. Deploy script peer authentication broken by divergent CREATE2 inputs

**Severity:** HIGH
**Repos:** nana-suckers-v6
**Sources:** Nemesis Codex
**Affected code:** `script/Deploy.s.sol`

**Root cause:** Registry/deployer/singleton addresses derived with `safeAddress()` in init code. Different safes across chains produce different clone addresses, but runtime auth assumes `peer() == address(this)`.

**Impact:** Inbound bridge roots rejected. Funds stranded until emergency recovery. PoC: `test/audit/CodexDeployDeterminism.t.sol`.

admin note: safeAddress will be same across chains.

---

### H-13. Periphery deployment can permanently assign omnichain superpowers to wrong address

**Severity:** HIGH
**Repos:** nana-core-v6
**Sources:** Nemesis Codex, Pashov Codex [75]
**Affected code:** `script/DeployPeriphery.s.sol:68`

**Root cause:** `OMNICHAIN_RULESET_OPERATOR` is validated only against `address(0)`, with no bytecode or CREATE2 address verification. If the address is wrong/empty, the controller permanently grants ruleset configuration powers to an unintended address.

**Impact:** Unauthorized ruleset control across entire controller deployment.

admin note: thats ok. document it.

---

### H-14. Early COMPLETE cash-outs drain fee tokens meant for unminted reserves

**Severity:** HIGH
**Repos:** defifa-collection-deployer-v6
**Sources:** Pashov Codex [82]
**Affected code:** `DefifaHook.afterCashOutRecordedWith`

**Root cause:** Fee-token claims use live `_totalMintCost`, but pending reserve NFTs are only added to that denominator when `mintReservesFor` is later called. Early cash-outs over-claim `$DEFIFA`/`$NANA`.

**Recommended fix:** Include `_pendingReserveMintCost()` in the denominator.

admin note: fix.

---

## Medium Findings

### M-1. `_computeOptimalCashOutAmount` formula always triggers T/2 cap

**Repos:** univ4-lp-split-hook-v6
**Sources:** Nemesis Claude
**Affected code:** `JBUniswapV4LPSplitHook.sol:L1177-L1190`

The `ratioE18` computation is mathematically wrong — massively overestimates the ratio (4x to 10^36+), causing `cashOutAmount` to always hit the `totalProjectTokens / 2` cap. At 50% cashOutTaxRate, roughly half the excess is lost to bonding curve tax.

admin note: fix and prove with tests.

---

### M-2. Pool deployment/rebalance reverts for 100% reserved projects

**Repos:** univ4-lp-split-hook-v6
**Sources:** Nemesis Claude
**Affected code:** `JBUniswapV4LPSplitHook.sol`

When `reservedPercent = MAX_RESERVED_PERCENT (10000)`, `projectTokensPerTerminalToken = 0`, causing division by zero or `TickMath.getTickAtSqrtPrice(0)` revert. Permanent DoS for that configuration.

admin note: fix, though 100% reserved projects are rate.

---

### M-3. Sell-side estimation revert blocks all swaps for non-standard terminals

**Repos:** univ4-router-v6
**Sources:** Nemesis Claude, Nemesis Codex, Pashov Codex [75]
**Affected code:** `JBUniswapV4Hook.sol:L219-233`

`IJBFeeTerminal(address(terminal)).FEE()` is inside the try-success handler for `previewCashOutFrom`. If FEE() reverts, the whole swap reverts — contradicts RISKS.md claim that routing never blocks V4 swaps.

**Fix:** Wrap `FEE()` in its own try-catch.

admin note: sure. default it to 0 if not returned.

---

### M-4. V4 spot price manipulation for automatic quoting

**Repos:** nana-router-terminal-v6
**Sources:** Nemesis Claude
**Affected code:** `JBRouterTerminal.sol`

V4 vanilla pools have no built-in TWAP oracle. When no `quoteForSwap` metadata provided, falls back to manipulable `getSlot0()`. Loss bounded by sigmoid slippage floor (minimum 2%). Documented but still exploitable.

admin note: how might we improve?

---

### M-5. Pay credits bypass tier split payments

**Repos:** nana-721-hook-v6
**Sources:** Nemesis Codex, Pashov Codex [90]
**Affected code:** `JB721TiersHook._mintAndUpdateCredits`, `JB721TiersHookLib._distributeSingleSplit`

Split obligations are capped to `amountValue` before credits are considered, but `_mintAndUpdateCredits` adds stored credits and mints from the larger amount. Split recipients underpaid by the credit-funded portion.

PoC: A 1 ETH, 100%-split tier minted with 1 ETH credits + 1 wei — split beneficiary receives only 1 wei.

admin note: this is ok. best we can do is add a flag in tiers "block paying with credits".

---

### M-6. Phase 09 silently accepts wrong project as BAN

**Repos:** deploy-all-v6
**Sources:** Nemesis Claude, Nemesis Codex
**Affected code:** `script/Deploy.s.sol` `_deployBanny()`

Skip condition only checks `controllerOf(4) != 0`. Does not verify identity. `Verify.s.sol` reports false "healthy".

admin note: if you have better ideas, fix.

---

### M-7. Testnet auto-issuance breaks deterministic sucker peering

**Repos:** nana-fee-project-deployer-v6
**Sources:** Nemesis Claude, Nemesis Codex
**Affected code:** `script/Deploy.s.sol:129`

Each testnet deployment rewrites a different `REVAutoIssuance.chainId` entry, producing different `encodedConfigurationHash` values and different CREATE2 sucker addresses. Cross-chain messaging fails.

Admin note: each should write all autissuances for all chains. in the fn call, only the ones for the correct chain get stored, but all get hashed.

---

### M-8. Post-launch sucker deployment broken by nested permission re-checks

**Repos:** nana-omnichain-deployers-v6
**Sources:** Nemesis Codex
**Affected code:** `JBOmnichainDeployer.sol:384-405`

`deploySuckersFor()` validates the operator, but `JBSuckerRegistry.deploySuckersFor` re-checks against `msg.sender = address(JBOmnichainDeployer)` and reverts.

admin note: the project owner has to give omnichain deployer permission. make sure this is possible and that this case is extensively tested (w fork tests). and documented w user journeys and risks.

---

### M-9. Historical fee credits brick claimable ERC20 fee tokens

**Repos:** univ4-lp-split-hook-v6
**Sources:** Nemesis Codex, Pashov Codex [75]
**Affected code:** `JBUniswapV4LPSplitHook.sol:551-583`

`claimFeeTokensFor()` atomically processes ERC20 claims then credit claims. A reverting `transferCreditsFrom()` call blocks the valid ERC20 claim.

admin note: fix?

---

### M-10. Pool deployment priced off stale economics when data hooks are enabled

**Repos:** univ4-lp-split-hook-v6
**Sources:** Nemesis Codex
**Affected code:** `JBUniswapV4LPSplitHook.sol:286-467`

`deployPool()` / `rebalanceLiquidity()` compute tick bounds from static values but don't account for data hooks that change weight/tax/supply. LP leaks value to arbitrage.

admin note: can we improve?

---

### M-11. Dual-JB pools route to strictly worse Juicebox path

**Repos:** univ4-router-v6
**Sources:** Nemesis Codex
**Affected code:** `JBUniswapV4Hook.sol:689-756`

When both pool tokens are JB project tokens, only the buy-side is evaluated. PoC shows skipped sell-side route paid 10,000 tokens while executed route returned only 1,000.

admin note: can we improve?

---

### M-12. Croptop hook authority drifts from project ownership until claim

**Repos:** croptop-core-v6
**Sources:** Nemesis Codex, Pashov Codex [90]
**Affected code:** `CTDeployer.sol:338-359`

After `deployProjectFor()`, hook ownership stays with `CTDeployer` and the initial owner keeps admin permissions. Project NFT transfer doesn't revoke seller's hook control.

admin note: can we improve?

---

### M-13. Resume path cannot recover supported no-Uniswap chains

**Repos:** deploy-all-v6
**Sources:** Pashov Codex [88]

Resume flow skips `_resumeBuybackHook()` when `_shouldDeployUniswapStack()` is false, but later phases still require a nonzero buyback registry.

---

### M-14. `_isDeployed` guard uses wrong CREATE2 deployer — permanently ineffective

**Repos:** nana-core-v6
**Sources:** Pashov Codex [75], Nemesis Claude, Nemesis Codex

Multiple repos check Arachnid CREATE2 addresses while actual deployment uses Sphinx. Guard always returns false.

Also affects: nana-omnichain-deployers-v6, banny-retail-v6, nana-fee-project-deployer-v6.

---

### M-15. Base Sepolia USDC/USD Chainlink feed address appears copied from Arbitrum Sepolia ETH/USD

**Repos:** nana-core-v6
**Sources:** Pashov Codex [82]
**Affected code:** `DeployPeriphery.sol:258`

Same address for different feed pairs. If wrong, ~3000x valuation error. Feed is immutable once set.

admi note: double check, i think what's in the code is correct.

---

### M-16. Failed payouts permanently reduce fee-free surplus credit

**Repos:** nana-core-v6
**Sources:** Pashov Codex [85]
**Affected code:** `JBMultiTerminal._sendPayoutsOf`

A caught payout failure restores project balance but leaves `_feeFreeSurplusOf` capped to temporary post-payout balance.

admin note: can we improve?

---

### M-17. Sequencer status check uses `answer == 1` instead of `answer != 0`

**Repos:** nana-core-v6
**Sources:** Pashov Codex [90]
**Affected code:** `JBChainlinkV3SequencerPriceFeed.currentUnitPrice` L67

Chainlink documents `0 = up, 1 = down`, but `int256 answer` can hold any value. A non-zero, non-one value passes the check falsely.

admin note: can we improve?

---

## Low Findings

### nana-core-v6 (8 LOW)
- **ERC-20 allowance accumulation in hook fulfillment** — `safeIncreaseAllowance` is additive; if hooks don't consume, allowance grows unbounded. Self-rug only. admin note: fix?
- **Deployment scripts leave fee project unbootstrapped** — Project #1 has no controller/terminal after deploy.
- **ETH/USD staleness threshold not chain-specific** — 3600s may be too tight for Arbitrum's 86400s heartbeat. admin note: fix?
- **Deployment script not idempotent** — `addPriceFeedFor` reverts on re-run. admin note: fix?
- **adjustDecimals truncation-to-zero** — Can cause division-by-zero in inverse price path. admin note: document in risks.
- **Constructor lacks input validation on threshold and feed address** — Zero threshold permanently bricks feed.
- **Missing answeredInRound >= roundId validation** — Incomplete Chainlink round detection. admin note: fix? prove.
- **Missing staleness check on sequencer uptime feed** — Stale sequencer status trusted indefinitely.

### revnet-core-v6 (7 LOW)
- **totalCollateralOf briefly stale during _adjust** — Theoretical only.
- **Source fee silently refunded on terminal.pay failure** — Requires broken terminal.
- **prepaidDuration calculation edge** — 1-second boundary at exactly `LOAN_LIQUIDATION_DURATION`. admin note: might as well fix.
- **Zero-price oracle sources silently skipped** — Requires broken Chainlink feed.
- **Unbounded loop in _totalBorrowedFrom** — Practical bound ~5-20.
- **CEI gap in _adjust** — Protocol-only external calls. admin note: adjust if reasonable.
- **ERC-2771 trusted forwarder pattern** — Ecosystem-wide trust assumption.

### nana-721-hook-v6 (6 LOW)
- **Rounding dust loss in proportional cap scaling** — Up to N-1 wei per N tiers.
- **No msg.value validation against forwardedAmount** — Defense-in-depth gap.
- **Double ownership transfer in deployHookFor** — ~5k extra gas.
    - admin note: fix.
- **Proportional cap scaling can zero out small split amounts** — Floor division.
- **ERC-20 token stranding on split hook callback failure** — Documented behavior.
- **Failed early splits redistributed to later recipients** — Later recipients receive failed recipient's share.
    - admin note: why not deposit into project balance? seems better

### nana-suckers-v6 (6 LOW)
- **Incorrect NatSpec for deployer salt encoding** — `abi.encode` vs `abi.encodePacked`. 
    - admin note: fix.
- **Retained fee ETH flows to project on payment failure** — 0.001 ETH max.
- **mapTokens() ETH allocation for duplicate disable entries** — Self-inflicted.
- **Non-sequential nonce acceptance loses intermediate roots** — Users need updated proofs.
- **CCIPHelper.wethOfChain() missing testnet entries** — Dead code. admin note: fix.
- **Transient amountToAddToBalanceOf inflation** — Single transaction, no external call in window.

### nana-buyback-hook-v6 (13 LOW)
- **defaultHook change silently migrates implicit projects**
- **Pool immutability = permanent bad config**
- **Swap failure falls back to mint without slippage check** (by design)
- **Fee-on-transfer tokens always trigger swap failure**
    - admin: can fix easy?
- **Dynamic-fee pools inflate sigmoid tolerance**
    - admin: can fix?
- **Empty hookMetadata = zero slippage on cash-out sell**
    - admin: what you mean? fixable?
- **Arbitrary sqrtPriceX96 in initializePoolFor** (permissioned)
    - admin: got a better idea?
- **Oracle catch-all catches gas-related reverts**
- **sqrtPriceLimitFromAmounts precision loss**
    - admin: fixable?
- **Inconsistent pool existence check**
    - admin: fixable?
- **setTwapWindowOf doesn't require poolIsSet**
    - admin: fixable?
- **Residual forceApprove allowance**
    - admin: fixable?
- **Token donation during POOL_MANAGER.unlock**
    - admin: fixable?

### nana-router-terminal-v6 (5 LOW)
- **Silent TWAP window degradation** — 600s to 120s.
    - admin: fix?
- **cashOutLoop minTokensReclaimed rounds to zero** — Multi-hop slippage floor collapses.
    - admin: can we do better?
- **Full-balance sweep includes pre-existing tokens** — Intentional stateless design.
- **V4 hook TWAP path is unreachable dead code**
    - admin: fix.
- **User quoteForSwap=0 disables all slippage protection**
    - admin: fixable?
- **Registry-routed credit cashouts revert** — Router pulls credits from registry instead of payer.
    - admin: fix.

### univ4-lp-split-hook-v6 (2 LOW)
- **Deploy script missing Optimism Sepolia PoolManager address**
- **Fee token claims stuck if fee project changes ERC-20 token**

### univ4-router-v6 (3 LOW)
- **TWAP staleness during JB routing** (by design, documented)
- **Both-tokens-JB routing asymmetry** (documented)
    - admin: worth fixing?
- **int56 tickCumulative overflow after ~1.4 years** (documented)
    - admin: worth fixing?

### croptop-core-v6 (4 LOW)
- **Fee terminal failure blocks all Croptop mints** — Not try-catch wrapped.
    - admin: fix.
- **deploySuckersFor broken permission chain** — CTDeployer never granted DEPLOY_SUCKERS.
    - admin: fix.
- **claimCollectionOwnershipOf breaks mintFrom calls** (OPEN)
    - admin: how so?
- **Cannot fully disable posting for a configured category** (OPEN)
    - admin: how so?

### banny-retail-v6 (2 LOW)
- **Retained outfits break ascending category order** — Cosmetic.
    - admin: what you mean?
- **Permanently untransferable NFTs create persistent stale entries** — Gas overhead.

### nana-omnichain-deployers-v6 (2 LOW)
- **Deploy script `_isDeployed` uses `safeAddress()` instead of Arachnid proxy**
- **Silent degradation when hook config is missing**

### nana-ownable-v6 (2 LOW)
- **Constructor lacks explicit project existence check**
- **`_emitTransferEvent` does not use try-catch** (intentional)

### nana-fee-project-deployer-v6 (0 findings, 2 leads)
- **Testnet auto-issuance mixes local/mainnet IDs** (escalated to M-7)
- **Deployment trusts mutable npm artifacts without integrity check**

### deploy-all-v6 (1 LOW beyond H-5/M-6)
- **Defifa resume does not repair missed governor ownership handoff**

### defifa-collection-deployer-v6 (0 LOW beyond H-3/H-4/H-14)

---

## Informational & Clean Repos

### Clean (no findings across all 4 runs + manual review):
- **nana-address-registry-v6** — 10 functions, zero mutable coupled pairs, 46/46 tests passing
- **nana-permission-ids-v6** — Constants-only library, all 33 IDs unique and sequential (1-33), cross-repo consumer checks verified
- **nana-ownable-v6** — All critical attack vectors cleared (OOG, permission stale, wildcard escalation, double renunciation, reentrancy)
- **nana-privacy-v6** — No findings from Pashov Codex audit

### Known/Accepted (from prior audit work, not new):
- **C-5**: `cashOut(0)` with `totalSupply==0` returns entire surplus (documented)
- **H-4**: Pending reserved tokens inflate totalSupply, reducing cashout value (documented)
- **FV-1**: Bonding curve subadditivity violation from mulDiv rounding (<0.01%, economically insignificant)

---

## Run Metadata

### Run 1: Nemesis Claude (./run-nemesis-all.sh)
- **Duration:** 11h 50m 25.9s
- **Timestamp:** 20260329-232138
- **Repos:** 17
- **Results:** 0 CRITICAL, 2 HIGH, 6 MEDIUM, 44 LOW across 17 repos
- **Finding files per repo:** 4-12 files
- **Backup:** `.audit-findings-prev-20260329-232138`

### Run 2: Nemesis Codex (./run-nemesis-all-codex.sh)
- **Duration:** 2h 6m 46.2s
- **Timestamp:** 20260329-232148
- **Repos:** 17
- **Results:** 8 HIGH, 10 MEDIUM, 2 LOW across 17 repos (3 clean)
- **Finding files per repo:** 4-6 files
- **Backup:** `.audit-findings-codex-prev-20260329-232148`

### Run 3: Pashov Codex (./run-pashov-all-codex.sh)
- **Duration:** 2h 39m 17.8s
- **Timestamp:** 20260330-082627
- **Repos:** 18 (includes nana-privacy-v6)
- **Results:** 24 confirmed findings + 28 leads
- **Finding files per repo:** 1 file
- **Syntax error on line 284 (non-blocking)**

### Run 4: Pashov Claude (./run-pashov-all.sh)
- **Duration:** 8m 33.6s
- **Timestamp:** 20260330-110744
- **Repos:** 18
- **Results:** 0 findings (all repos clean)
- **Finding files per repo:** 0 files
- **Backup:** `.audit-findings-pashov-claude-prev-20260330-110744`

### Manual Focused Reviews (message 13-16.txt)
- **Scope:** nana-core-v6, revnet-core-v6, nana-buyback-hook-v6
- **Results:** 7 HIGH findings (all merged into C-1, C-2, H-1 above)

---

*Generated by aggregating results from 4 automated audit runs and 4 manual focused reviews across the Juicebox V6 EVM monorepo.*
