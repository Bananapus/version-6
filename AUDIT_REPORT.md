# Juicebox V6 EVM Audit Report

**Source:** Pashov Solidity Auditor (Codex) Runs `20260420-112444` + `20260421-000519` + `20260421-130750` + `20260421-203407` + `20260428-213302` | Pashov Solidity Auditor (Claude) Run `20260428-213315` (partial, 11/21 repos) | Nemesis Auditor (Codex) Runs `20260420` + `20260421-000900` + `20260421-130747` + `20260421-203404` + `20260422-003458` | CertiK AI Scans (nana-core-v6, revnet-core-v6, nana-router-terminal-v6, nana-omnichain-deployers-v6) | Gemini Paranoid QA Scan | GitHub `Bananapus/version-6` Issues (manual triage)
**Repos scanned:** 21 (nana-privacy-v6 skipped — directory not found)
**Date:** 2026-04-29 (pass 13 update)
**Total findings:** 105 confirmed | 59+ leads (all investigated, 17 promoted from pass 1, 4 promoted from pass 2, pass 3 leads pending triage, pass 4: 6 new findings, pass 5: 2 new findings, passes 7-8: 3 new findings [H-22, H-23, M-36], pass 12: 12 new findings)

---

## Summary

| Severity | Total | ~~Fixed~~ | ~~Downgraded~~ | Accepted risk | **Open** |
|----------|-------|-----------|----------------|---------------|----------|
| Critical | 5 | ~~5~~ | — | — | **0** |
| High     | 29 | ~~20~~ | ~~4~~ (H-2, H-4, H-9, H-20) | 4 (H-7, H-8, H-17, H-21) | **1** (H-27) |
| Medium   | 45 | ~~23~~ | ~~8~~ (M-7, M-8, M-9, M-11, M-13, M-29, M-31, M-32) | 10 (M-5, M-10, M-15, M-21, M-22, M-27, M-28, M-33, M-37, M-38) | **4** (M-41, M-42, M-43, M-44) |
| Low      | 26 | ~~10~~ | ~~1~~ (L-16) | 8 (L-1, L-2, L-3, L-5, L-12, L-13, L-14, L-15) | **7** (L-20 — L-26) |
| **Total** | **105** | **~~67 fixed~~** | **~~13 downgraded~~** | **22 accepted** | **3 open** |

102 prior findings resolved. 3 findings from pass 12 remain **OPEN** (L-22, L-23, L-25).

Pass 2 corroborated 10 existing findings (C-3, H-12, M-2, M-5, M-7, M-12, M-14, M-15, M-22, L-2).
Pass 3 corroborated 7 existing findings (C-3, H-2, H-12, H-13, H-14, M-24, L-2).
Pass 4 corroborated 6 existing findings (C-3, H-2, H-12, M-33, Lead 12, Lead 35/43).
Pass 5 corroborated 3 existing findings (H-21, M-33, L-2).
GitHub issues corroborated 2 existing findings: #73 → C-3 (FIXED), #62 → M-11 (downgraded).
Pass 12 corroborated 6 existing findings (C-5, M-22, H-25, H-22, M-2/H-11, L-9).
Pass 13 (Gemini) corroborated 4 existing findings (H-17, M-38, H-13, M-33). All 25 Gemini findings triaged as FP/by-design/duplicates.

---

## Critical

### C-1. ~~Cross-Chain Loan Quotes Hardcode 18-Decimal Remote Surplus~~ — FIXED (`c5a6d8d`)

| Field | Value |
|-------|-------|
| **Repo** | revnet-core-v6 |
| **File** | `src/REVLoans.sol:378` |
| **Auditor confidence** | 95 |
| **My confidence** | **95 — VERIFIED** |
| **Known issue?** | No |

**Description:** `_borrowableAmountFrom` calls `SUCKER_REGISTRY.remoteSurplusOf({..., decimals: 18, ...})` while the local surplus uses the caller's requested `decimals` parameter. When the source token is not 18-decimal (e.g. USDC at 6), the remote surplus is inflated by 10^12 relative to local surplus, allowing borrowers to overdraw the local treasury.

**Mitigation:** Replace `decimals: 18` with `decimals: decimals` to match the local surplus precision.

Admin note: fix. and add sufficient fork tests to make sure this is well tested across tokens, currencies, and decimals.

---

### C-2. ~~Omnichain Cash-Out Pricing Uses Hardcoded 18-Decimal Remote Surplus~~ — FIXED (`2de02bf`)

| Field | Value |
|-------|-------|
| **Repo** | nana-omnichain-deployers-v6 |
| **File** | `src/JBOmnichainDeployer.sol:415` |
| **Auditor confidence** | 90 |
| **My confidence** | **92 — VERIFIED** |
| **Known issue?** | No |

**Description:** Same class of bug as C-1 but in the omnichain deployer's `beforeCashOutRecordedWith`. Remote surplus is fetched with `decimals: 18` instead of `context.surplus.decimals`, and uses `uint256(uint160(context.surplus.token))` instead of `uint256(context.surplus.currency)` for the currency parameter. Non-18-decimal reclaim tokens can be overpaid up to the full local surplus.

**Mitigation:** Use `context.surplus.decimals` and `context.surplus.currency` for the remote surplus call.

Admin note: fix. and add sufficient fork tests to make sure this is well tested across tokens, currencies, and decimals.

---

### C-3. ~~Buyback Cash-Out Fallback Zeroes The Reclaim Surplus~~ — FIXED (`11f232d`)

| Field | Value |
|-------|-------|
| **Repo** | nana-buyback-hook-v6 |
| **File** | `src/JBBuybackHook.sol:693,755,758` |
| **Auditor confidence** | 90 |
| **My confidence** | **88 — VERIFIED** |
| **Known issue?** | No |

**Description:** All three return paths in `beforeCashOutRecordedWith` return `effectiveSurplusValue = 0`. When the swap is not worthwhile (`noop = true`, line 755), the hook won't execute in `afterCashOutRecordedWith`, so `JBTerminalStore` computes reclaim against zero surplus and the user burns tokens for nothing. The non-noop swap path (line 758) intends for the after-hook to handle the payout, but the noop path is a direct loss. *Re-confirmed by Pashov pass 2 (20260421) with identical analysis.*

**Mitigation:** When `noop = true`, return `context.surplus.value` instead of `0` so the normal bonding curve reclaim applies.

Admin note: fix. and add sufficient fork tests to make sure this is well tested across tokens, currencies, and decimals.

---

### C-4. ~~Non-Canonical tokenIds Allow Duplicate Distribution Claims~~ — FIXED (`9918cd6`)

| Field | Value |
|-------|-------|
| **Repo** | nana-distributor-v6 |
| **File** | `src/JBTokenDistributor.sol:125,136` |
| **Auditor confidence** | 95 |
| **My confidence** | **95 — VERIFIED** |
| **Known issue?** | No |

**Description:** `_canClaim` and `_tokenStake` truncate `uint256 tokenId` to `address(uint160(tokenId))`. Any two tokenIds sharing the same lower 160 bits authorize the same staker and look up the same voting power. An attacker can submit multiple alias tokenIds to `beginVesting` and multiply their claim for the same round.

**Mitigation:** Validate `tokenId >> 160 == 0` in `_canClaim`, or deduplicate by the derived address in `beginVesting`.

Admin note: fix. Not truncated for packing — it's a semantic encoding where `tokenId = uint256(uint160(stakerAddress))`. The base `JBDistributor` uses full uint256 mapping keys. Fix by validating `tokenId >> 160 == 0` in `_canClaim` and `_tokenStake` to reject aliased IDs.

---

### C-5. ~~Hidden Token Burn/Reveal Cycle Inflates Visible-Holder Exit Value~~ — FIXED (`c5a6d8d`)

| Field | Value |
|-------|-------|
| **Repo** | revnet-core-v6 |
| **File** | `src/REVHiddenTokens.sol` (hideTokensOf) |
| **Auditor confidence** | 85 |
| **My confidence** | **80** |
| **Known issue?** | Partially related to H-4 (pending reserved tokens inflate totalSupply) but different mechanism |

**Description:** Hidden balances are burned from circulating supply but can be revealed later. A large holder can hide tokens, cash out or borrow against the artificially smaller supply (which inflates per-token value), then reveal. Remaining holders absorb the loss.

**Mitigation:** Include `totalHiddenOf(projectId)` in every supply-sensitive valuation path (cash-outs, loans, LP sizing).

Admin note: the goal of hiding tokens is to allow someone with a large supply to "even the playing field" economically while also maintaining control just in case. Need a mechanism that reduces the hider's economic dominance without letting them profit from the supply reduction. Open design question — see discussion below.

**Design discussion:** The core tension is that reducing supply increases per-token value, and the hider still holds unhidden tokens that benefit. Approach to explore: **per-account supply adjustment** — when computing cash-out or borrow value for a specific account that has hidden tokens, add their own hidden balance back into the totalSupply denominator. Other users see the reduced supply (their field is evened). The hider sees the original supply (they can't profit from their own hide). On reveal, supply restores for everyone. This is the only approach that achieves economic evening without creating an extraction vector, because the hider's own valuation is unaffected by their own action.

admin note to the design discussion: but this isnt sybil resistant.

**Sybil analysis:** Correct — the per-account adjustment breaks if the hider splits tokens across wallets before hiding. Each sybil wallet has zero hidden balance, so they all benefit from the reduced supply. The only sybil-proof approach is **global supply adjustment**: add `totalHiddenOf(projectId)` back into totalSupply for ALL cash-out/borrow calculations, for everyone. Nobody benefits economically from hiding. The "field evening" effect is limited to governance weight reduction only. This changes the feature from "economic evening" to "governance evening."

---

## High

### H-1. ~~Public Checkpoint Predeployment Permanently Bricks Hook~~ — FIXED (`4a0e481`)

| Field | Value |
|-------|-------|
| **Repo** | nana-721-hook-v6 |
| **File** | `src/JB721CheckpointsDeployer.sol:39-44` |
| **Auditor confidence** | 95 |
| **My confidence** | **93 — VERIFIED** |
| **Known issue?** | No |

**Description:** `deploy(address hook, IJB721TiersHookStore store)` has no access control. An attacker can front-run the first mint by deploying a checkpoint clone to the deterministic CREATE2 slot with a wrong `store`, causing every subsequent `_update()` call (mint/transfer/burn) on the legitimate hook to revert.

**Mitigation:** Add `if (msg.sender != hook) revert Unauthorized();` to `deploy`.

admin note: great, yes fix. make sure its well tested.

---

### H-2. Permissionless LP Deployment Binds Wrong Terminal Token

| Field | Value |
|-------|-------|
| **Repo** | univ4-lp-split-hook-v6 |
| **File** | `src/JBUniswapV4LPSplitHook.sol` (deployPool) |
| **Auditor confidence** | 90 |
| **My confidence** | **82** |
| **Known issue?** | No |

**Description:** Once the 10x weight decay window opens, `deployPool` becomes permissionless and any caller can deploy against any valid primary terminal token, irreversibly locking the project to the wrong pool.

**Mitigation:** Add a `commitTerminalToken` function gated by project ownership, and require the committed token during permissionless deployment.

Admin note: VERIFIED — tokens are project-approved only. `deployPool` validates via `DIRECTORY.primaryTerminalOf(projectId, terminalToken)` and reverts with `JBUniswapV4LPSplitHook_InvalidTerminalToken()` if it returns address(0). Only tokens the project already has a configured terminal for are accepted. Downgrade to informational — note risk in repo's RISKS.md that permissionless deployers pick among project-approved tokens.

---

### H-3. ~~Buyback Routing Ignores Omnichain Cash-Out Context~~ — FIXED (`c5a6d8d`)

| Field | Value |
|-------|-------|
| **Repo** | revnet-core-v6 |
| **File** | `src/REVOwner.sol` (beforeCashOutRecordedWith) |
| **Auditor confidence** | 90 |
| **My confidence** | **82** |
| **Known issue?** | No |

**Description:** The buyback hook sees only local supply and surplus, but the returned reclaim values include remote supply and surplus. Cross-chain cash-outs can be routed to a worse swap path and underpay the holder.

**Mitigation:** Build a modified context with the cross-chain-adjusted `totalSupply` and `surplus.value` before forwarding to the buyback hook.

Admin note: yes, fix. Verified the 721 hook forwarding is safe — both `JBOmnichainDeployer` and `REVOwner` discard the 721 hook's returned `effectiveSurplusValue` and `totalSupply` (via `,,` destructuring), so stale surplus in the 721 context is harmless. The real issue is only in the buyback hook's routing decision: it uses local-only surplus/supply to decide swap vs passthrough, which can route to a worse path. Fix in `REVOwner`: build `routedContext` with cross-chain-adjusted values before forwarding to buyback hook. H-6 already covers the omnichain deployer's extra hook path separately.

---

### H-4. Former Project Owner Retains Hook Control After NFT Transfer

| Field | Value |
|-------|-------|
| **Repo** | croptop-core-v6 |
| **File** | `src/CTDeployer.sol` (deployProjectFor) |
| **Auditor confidence** | 90 |
| **My confidence** | **85** |
| **Known issue?** | No |

**Description:** `deployProjectFor` grants `ADJUST_721_TIERS`, `SET_721_METADATA`, `MINT_721`, and `SET_721_DISCOUNT_PERCENT` permissions to the original recipient via `CTDeployer`. After the project NFT is sold/transferred, the former owner retains these permissions until the buyer manually calls `claimCollectionOwnershipOf`.

**Mitigation:** Transfer hook ownership to the project NFT via `transferOwnershipToProject(projectId)` instead of granting permissions to an individual address.

Admin note: CONFIRMED FALSE POSITIVE. JBPermissions are keyed by `(operator, account, projectId)`. All permission-gated operations resolve `account` as the current project owner via `PROJECTS.ownerOf(projectId)`. When the NFT transfers, the new owner becomes the `account` in all checks, and permissions keyed to the old owner stop working automatically. Downgrade to informational — no fix needed.

---

### H-5. ~~Defifa Games Launch With Unsupported Tier Counts Above 128~~ — FIXED (`a765988`)

| Field | Value |
|-------|-------|
| **Repo** | defifa |
| **File** | `src/DefifaDeployer.sol` (launchGameWith) |
| **Auditor confidence** | 90 |
| **My confidence** | **88** |
| **Known issue?** | No |

**Description:** The deployer accepts 129+ tiers but the hook and governor hardcode `uint256[128]` tier-weight tables. Tokens in tier 129+ become unscorable and their cash-out path reverts. *Nemesis independently confirmed with PoC at `test/audit/CodexTierCapMismatch.t.sol`.*

**Mitigation:** Add `if (numberOfTiers > 128) revert DefifaDeployer_InvalidGameConfiguration();`.

admin note: fix, make sure well tested.

---

### H-6. ~~Extra Cash-Out Hooks Receive Stale Local-Only Surplus~~ — FIXED (`2de02bf`)

| Field | Value |
|-------|-------|
| **Repo** | nana-omnichain-deployers-v6 |
| **File** | `src/JBOmnichainDeployer.sol` (beforeCashOutRecordedWith) |
| **Auditor confidence** | 85 |
| **My confidence** | **82** |
| **Known issue?** | No |

**Description:** The wrapper computes cross-chain `effectiveSurplusValue` but forwards the extra cash-out hook a context with the old local-only `surplus.value`. Route/tax decisions in downstream hooks use stale data.

**Mitigation:** Set `hookContext.surplus.value = effectiveSurplusValue` before forwarding to extra hooks.

admin note: fix, make sure well tested.

---

### H-7. Pay Credits Let Buyers Underfund Tier Split Obligations

| Field | Value |
|-------|-------|
| **Repo** | nana-721-hook-v6 |
| **File** | `src/JB721TiersHook.sol` (beforePayRecordedWith / afterPayRecordedWith) |
| **Auditor confidence** | 85 |
| **My confidence** | **75** |
| **Known issue?** | No |

**Description:** Split forwarding is capped to fresh payment value in `beforePayRecordedWith`, but `afterPayRecordedWith` combines stored credits with the payment to mint split-bearing tiers. A buyer can use accumulated credits to mint tiers whose split obligations exceed the fresh ETH, underfunding the split recipients.

**Mitigation:** Reject credit-funded mints for tiers whose configured split share exceeds the fresh payment amount.

admin note: this is known and is an accepted risk, should be in RISKS.md of the repo. project owners should use the flag the prevent buying a tier with credits if they want to prevent this.

---

### H-8. Phantom Terminal Registration Inflates REVLoans Borrow Capacity *(nemesis — promotes Lead 4)*

| Field | Value |
|-------|-------|
| **Repo** | revnet-core-v6 |
| **File** | `src/REVLoans.sol` (_borrowableAmountFrom) |
| **Auditor confidence** | HIGH (nemesis verified) |
| **My confidence** | **70 — accepted risk** |
| **Known issue?** | No |

**Description:** `_borrowableAmountFrom` sums surplus across all registered terminals. A privileged actor who registers an extra terminal with inflated accounting can make `borrowableAmountFrom` return a higher value than the real economic surplus, allowing over-borrowing against local treasury funds.

**Mitigation:** Restrict surplus aggregation to terminals that hold actual project funds, or cap borrow against the specific terminal being drawn from.

admin note: a revnet's terminals are set and fixed on deploy. there is a risk that should be noted in RISKS that a project that expands to a new chain can add a malicious terminal on that chain that corrupts the project's data. this is an accepted risk (for now, if you have ideas, lets brainstorm solutions to mitigate this risk while still allowing a project to grow omnichain).

---

### H-9. ~~CroptopDeployer Fee-Project Currency Zeroes Fee Collection~~ *(nemesis)* — DOWNGRADED: FALSE POSITIVE

| Field | Value |
|-------|-------|
| **Repo** | croptop-core-v6 |
| **File** | `src/CTDeployer.sol` |
| **Auditor confidence** | HIGH (nemesis verified) |
| **My confidence** | **30 — false positive** |
| **Known issue?** | No |

**Description:** The deployer configures the fee project with a currency mismatch — the fund access limit currency doesn't match the actual terminal accounting currency, so `sendPayoutsOf` resolves the payout limit to zero. Fee collection silently fails.

**Mitigation:** ~~Align the fund access limit currency with the terminal's accounting currency for the fee project.~~

admin note: im not sure what you mean here. show me.

**Investigation result:** Neither CTDeployer nor REVDeployer sets any payout limits at all — revnets/croptop projects don't use `sendPayoutsOf`. Revenue distribution happens through the bonding curve and reserved token splits. The nemesis auditor misread the absence of payout limits as a currency-caused zero. The baseCurrency = 1 (ETH) pattern is the same as M-13, which is correct by design. **No fix needed.**

---

### H-10. ~~Fee-Project Economics Bound To Wrong Trust Root~~ *(nemesis)* — FIXED (`24121fb`)

| Field | Value |
|-------|-------|
| **Repo** | nana-fee-project-deployer-v6 |
| **File** | `script/Deploy.s.sol:89-90` |
| **Auditor confidence** | HIGH (nemesis verified, PoC) |
| **My confidence** | **88** |
| **Known issue?** | No |

**Description:** The deploy script derives `operator` from `safeAddress()` instead of the canonical NANA operator (`0x80a8...eb5`). This fans out into every beneficiary config: reserved-token splits, auto-issuance beneficiaries, and `REVConfig.splitOperator` all point to the Gnosis Safe instead of the intended operator.

**Mitigation:** Hardcode `operator = 0x80a8F7a4bD75b539CE26937016Df607fdC9ABeb5` to match the canonical workspace operator used in `deploy-all-v6`.

admin note: yes hardcode.

---

### H-11. ~~Tempo Resume Script Cannot Converge Partial Deployments~~ *(nemesis — promotes Lead 21)* — FIXED (`7d89d7d`)

| Field | Value |
|-------|-------|
| **Repo** | deploy-all-v6 |
| **File** | `script/Resume.s.sol` |
| **Auditor confidence** | HIGH (nemesis verified) |
| **My confidence** | **85** |
| **Known issue?** | Pashov flagged as lead |

**Description:** `Resume.s.sol` has no Tempo/Tempo-Moderato branches. `Deploy.s.sol` supports both chains across chain addresses, CCIP deployers, price feeds, and sucker config — but `Resume` omits all of them. Interrupted Tempo deployments are operationally stranded with no canonical recovery path.

**Mitigation:** Port all Tempo-specific branches from `Deploy` into `Resume`. Add fork tests simulating partial deploy + resume on both Tempo chains.

admin note: yes, fix.

---

### H-12. ~~721 Distributor Allocates Rewards From Live NFT State, Not Round-Start Snapshot~~ *(nemesis — promotes Lead 25)* — FIXED (`9918cd6`)

| Field | Value |
|-------|-------|
| **Repo** | nana-distributor-v6 |
| **File** | `src/JB721Distributor.sol:137,146` |
| **Auditor confidence** | HIGH (nemesis verified, PoC) |
| **My confidence** | **90** |
| **Known issue?** | Pashov flagged as lead |

**Description:** `JB721Distributor._totalStake` and `_tokenStake` ignore the `blockNumber` parameter and read current NFT tier/owner state. `beginVesting` is permissionless, so late mints or last-block acquisitions can capture pro-rata rewards from rounds they never backed, diluting honest holders.

**Mitigation:** Persist a 721 stake snapshot at round start, or freeze the eligible owner/stake set used by `beginVesting` for each round.

admin note: yes, fix. new stakers during a round are only eligible next round.

*Re-confirmed by Pashov pass 2 (20260421) — [95] "Round-start NFT rewards can be stolen by a post-snapshot owner". Same root cause: `ownerOf(tokenId)` read at vesting time, not at round boundary.*

---

### H-13. ~~Out-of-Order Root Delivery Permanently Strands Earlier Bridge Batches~~ *(Pashov pass 2)* — FIXED (`649f90a`)

| Field | Value |
|-------|-------|
| **Repo** | nana-suckers-v6 |
| **File** | `src/JBSucker.sol` (fromRemote) |
| **Auditor confidence** | 90 |
| **My confidence** | **pending** |
| **Known issue?** | No |

**Description:** Arbitrum's out-of-order retryable delivery can make nonce `N+1` overwrite the inbox root before nonce `N` arrives, after which every nonce-`N` claim fails against the newer root and the earlier batch has no remaining local exit path. The current code only accepts strictly increasing nonces, silently dropping any root whose nonce isn't greater than the current inbox nonce.

**Mitigation:** Buffer pending roots by nonce and apply them sequentially:
```solidity
_pendingInboxRoots[root.token][root.remoteRoot.nonce] = root.remoteRoot.root;
while (_pendingInboxRoots[root.token][inbox.nonce + 1] != bytes32(0)) {
    inbox.nonce += 1;
    inbox.root = _pendingInboxRoots[root.token][inbox.nonce];
}
```

---

### H-14. ~~Unsynchronized Deprecation Can Blackhole Already-Sent Roots~~ *(Pashov pass 2)* — FIXED (`ae8428d`)

| Field | Value |
|-------|-------|
| **Repo** | nana-suckers-v6 |
| **File** | `src/JBSucker.sol` (fromRemote) |
| **Auditor confidence** | 85 |
| **My confidence** | **pending** |
| **Known issue?** | No |

**Description:** If one peer is deprecated before an in-flight root arrives, `fromRemote` silently drops that valid root while the sending side has already marked the leaves as sent, leaving users unable to claim remotely or emergency-exit locally.

**Mitigation:** Accept roots even in deprecated state — deprecation should prevent new *sends*, not reject already-in-flight *receives*:
```diff
- if (root.remoteRoot.nonce > inbox.nonce && state() != JBSuckerState.DEPRECATED) {
+ if (root.remoteRoot.nonce > inbox.nonce) {
```

---

### H-15. ~~CCIP Native-Token Mapping Encodes Token the Receiver Never Unwraps~~ *(promotes Lead 30)* — FIXED (`ef60d7b`)

| Field | Value |
|-------|-------|
| **Repo** | nana-suckers-v6 |
| **File** | `src/JBCCIPSucker.sol` (`_validateTokenMapping` override, `_sendRoot`, `_fromRemote`) |
| **Auditor confidence** | 90 (Pashov) |
| **My confidence** | **90 — VERIFIED** |
| **Known issue?** | No |

**Description:** `JBCCIPSucker._validateTokenMapping` overrides the base class and **removes the invariant** that `NATIVE_TOKEN` must map to `NATIVE_TOKEN` on the remote side. This allows mapping `NATIVE_TOKEN → arbitrary_erc20`. On send, `_sendRoot` wraps native ETH into WETH and encodes `remoteToken.addr` (the arbitrary ERC-20) in the message. On receive, `_fromRemote` only unwraps when `root.token == NATIVE_TOKEN` — but the encoded token is the arbitrary ERC-20, so the unwrap branch is never taken. The WETH sits permanently in the remote sucker contract, and claims revert because the contract has no balance of the mapped ERC-20.

**Impact:** Any batch sent through a CCIP sucker with a misconfigured native-token mapping has its funds permanently stranded. The sending side marks leaves as sent (cannot be re-sent), and the receiving side cannot fulfill claims.

**Mitigation:** Restore the `NATIVE_TOKEN → NATIVE_TOKEN` invariant in the CCIP override:
```solidity
function _validateTokenMapping(JBTokenMapping calldata map) internal view override {
    super._validateTokenMapping(map);
    // CCIP requires native maps to native for wrap/unwrap symmetry
    if (map.localToken == NATIVE_TOKEN) {
        require(map.remoteToken == NATIVE_TOKEN, "CCIP: native must map to native");
    }
}
```

---

### ~~H-16. ERC-20 Games Skip All Commitment Payouts Via Currency Mismatch~~ — FIXED (`e698782`) *(pass 3 nemesis)*

| Field | Value |
|-------|-------|
| **Repo** | defifa |
| **File** | `src/DefifaDeployer.sol:342-349,750-773,847-853` |
| **Auditor confidence** | HIGH (nemesis verified, PoC) |
| **My confidence** | **pending** |
| **Known issue?** | No |

**Description:** `_launchGame` stores scoring payout limits under `launchProjectData.token.currency` (caller-supplied), but `fulfillCommitmentsOf` later calls `sendPayoutsOf` with `currency = uint32(uint160(token))`. For ERC-20 games where the launch currency doesn't match the canonical token-address currency, the payout reverts. The catch block stores sentinel `1`, queues the final ruleset, and leaves the full pot unreduced — winners cash out value that should have been removed as protocol/commitment fees.

**PoC:** `test/audit/CodexNemesisCurrencyMismatchBypass.t.sol` — launches USDC game with `currency: 1`, fulfillment fails, winner cashes out full `200e6` instead of post-fee amount.

**Recommended fix:** Read the terminal's accounting context at fulfillment time and use its currency:
```solidity
JBAccountingContext memory ctx = terminal.accountingContextForTokenOf({projectId: gameId, token: token});
try terminal.sendPayoutsOf({projectId: gameId, token: token, amount: feeAmount, currency: ctx.currency, minTokensPaidOut: 0}) {}
```
Also reject non-canonical ERC-20 currency IDs at launch: `if (token != NATIVE_TOKEN && currency != uint32(uint160(token))) revert DefifaDeployer_UnexpectedTerminalCurrency();`

admin note: where else is launchProjectData.token.currency used?

**Resolution:** FIXED — `fulfillCommitmentsOf` now uses `metadata.baseCurrency` unconditionally (matches the currency under which payout limits were stored at launch). Added launch-time validation rejecting ERC-20 games with `currency=0`. 5 new tests in `test/audit/H16CurrencyMismatchFix.t.sol`. 255 tests pass.

---

### H-17. Mutable `defaultHook` Lets Registry Owner Hijack Unlocked Projects — Accepted risk *(pass 3 nemesis)*

| Field | Value |
|-------|-------|
| **Repo** | nana-buyback-hook-v6 |
| **File** | `src/JBBuybackHookRegistry.sol:153,299,349` |
| **Auditor confidence** | HIGH (nemesis verified, PoC) |
| **My confidence** | **Accepted — document in RISKS.md** |
| **Known issue?** | No |

**Description:** Projects that adopt `JBBuybackHookRegistry` as their data hook without explicitly setting `_hookOf[projectId]` fall back to `defaultHook`. The registry owner can call `setDefaultHook(maliciousHook)` and instantly retarget every unlocked project's payment routing, cash-out routing, and mint authority to the new hook — without any project-owner action. Core trusts the registry as the data hook and forwards payment logic and `hasMintPermissionFor` to whatever hook the registry resolves.

**PoC:** `test/audit/CodexRegistryDefaultHookHijack.t.sol` — shows `hasMintPermissionFor` flips from hook A to hook B after `setDefaultHook(hookB)`.

**Recommended fix:** Require projects to explicitly set their hook before the registry can serve as their data hook. Revert if `_hookOf[projectId] == address(0)`:
```solidity
if (_hookOf[projectId] == IJBRulesetDataHook(address(0))) revert JBBuybackHookRegistry_HookNotSet(projectId);
```
Alternatively, pin the resolved default into project-local storage on first use.

admin note: accepted risk. make a note in the repo's RISKS.md file.

**Resolution:** Accepted — Projects must call `setHookOf(projectId, hook)` to pin their hook. Documented in RISKS.md.

---

### ~~H-18. Zero-Output CCIP Swap Batches Mint Unbacked Remote Project Tokens~~ — FIXED (`4f97522`) *(pass 3 nemesis, re-opens Lead 12)*

| Field | Value |
|-------|-------|
| **Repo** | nana-suckers-v6 |
| **File** | `src/JBSwapCCIPSucker.sol:316,429` / `src/JBSucker.sol:854` |
| **Auditor confidence** | HIGH (nemesis verified, PoC) |
| **My confidence** | **pending** |
| **Known issue?** | Lead 12 dismissed as "explicitly handled" — this PoC shows it is NOT |

**Description:** When a CCIP batch arrives and the swap completes without reverting but returns `0` local tokens, `ccipReceive()` stores `ConversionRate({leafTotal: root.amount, localTotal: 0})` and leaves `pendingSwapOf` unset. Claims proceed because the gate only checks `pendingSwapOf.bridgeAmount > 0`. `_handleClaim()` then mints the full bridged project-token amount while `_addToBalance()` adds `0` terminal backing. Breaks cross-chain solvency.

**PoC:** `test/audit/codex-nemesis-SwapZeroLocalTotalUnbackedClaim.t.sol` — `terminal.lastAmount == 0` while `controller.lastMintAmount == 5e18`.

**Recommended fix:** Route zero-output swaps into `pendingSwapOf` instead of marking them claimable:
```solidity
if (root.amount > 0 && localAmount == 0) {
    pendingSwapOf[localToken][root.remoteRoot.nonce] =
        PendingSwap({bridgeToken: tokenAmount.token, bridgeAmount: tokenAmount.amount, leafTotal: root.amount});
} else {
    _conversionRateOf[localToken][root.remoteRoot.nonce] =
        ConversionRate({leafTotal: root.amount, localTotal: localAmount});
}
```

admin note: are you sure? ok, fix, but add sufficient comments to the inline impl, make sure the repo's .md docs make note of thise, and make sure this is well tested.

**Resolution:** FIXED — Zero-output swaps now route to `pendingSwapOf` for retry instead of storing a zero-backed conversion rate. Extensive inline comments. 2 new tests in `test/audit/H18_ZeroOutputSwapPending.t.sol`. Documented in RISKS.md section 10.8. 281 tests pass.

---

### ~~H-19. `removeDeprecatedSucker()` Undercounts Remote Supply in Downstream Math~~ — FIXED (`4f97522`) *(pass 3 nemesis)*

| Field | Value |
|-------|-------|
| **Repo** | nana-suckers-v6 |
| **File** | `src/JBSuckerRegistry.sol:265,432,445` |
| **Auditor confidence** | HIGH (nemesis verified, PoC) |
| **My confidence** | **pending** |
| **Known issue?** | No |

**Description:** `remoteTotalSupplyOf()` only counts suckers with `_SUCKER_EXISTS` state. `removeDeprecatedSucker()` flips state to `_SUCKER_DEPRECATED`, immediately hiding that chain's supply/surplus from all aggregate views. But deprecated suckers still accept roots via `fromRemote()` and retain mint permission via `isSuckerOf`. Downstream consumers (`JBOmnichainDeployer`, `REVOwner`, `REVLoans`) use the understated totals for cash-out tax and loan math.

**PoC:** `test/audit/codex-nemesis-DeprecatedRemovalUndercount.t.sol` — `remoteTotalSupplyOf` drops from `1_000e18` to `0` immediately after removal.

**Recommended fix:** Include deprecated suckers in economic aggregate views until fully settled:
```solidity
if (val == _SUCKER_EXISTS || val == _SUCKER_DEPRECATED) {
    totalSupply += IJBSucker(allSuckers[i]).peerChainTotalSupply();
}
```
Or split UX listing state from accounting inclusion state.

admin note: are you sure? ok, fix, but add sufficient comments to the inline impl, make sure the repo's .md docs make note of thise, and make sure this is well tested.

**Resolution:** FIXED — `remoteTotalSupplyOf`, `remoteSurplusOf`, and `remoteBalanceOf` now include deprecated suckers. Per-chain max deduplication prevents double-counting when both deprecated and active suckers target the same chain. 6 new tests in `test/audit/H19_DeprecatedSuckerAggregateViews.t.sol`. Documented in RISKS.md section 10.5. 281 tests pass.

---

### ~~H-20. Permissionless Provenance Registration for Any Deployer's Contract~~ — FALSE POSITIVE *(pass 3 nemesis)*

| Field | Value |
|-------|-------|
| **Repo** | nana-address-registry-v6 |
| **File** | `src/JBAddressRegistry.sol:50,66` |
| **Auditor confidence** | HIGH (nemesis verified, PoC) |
| **My confidence** | **FALSE POSITIVE — intentionally permissionless by design** |
| **Known issue?** | Yes — documented in ARCHITECTURE.md and RISKS.md |

**Description:** Both `registerAddress` overloads accept any caller-supplied `deployer` parameter and write `deployerOf[addr] = deployer` with no authorization check.

**Why FALSE POSITIVE:** This is intentionally permissionless by design:
- `ARCHITECTURE.md` states: "permissionless because correctness comes from deterministic derivation" — the contract verifies the address matches `CREATE`/`CREATE2` derivation from the claimed deployer+nonce/salt, so only the correct deployer can be registered
- `RISKS.md` documents: "Caller identity is irrelevant" — anyone can register the provenance because the deterministic math prevents false claims
- `deployerOf` is never used for on-chain security decisions; it's informational/UX only
- Front-running doesn't help: the attacker can only register the TRUE deployer (derivation enforces this), not a false one

admin note: are you sure? this feels like something we would have caught ages ago.

**Resolution:** FALSE POSITIVE — Confirmed intentionally permissionless. The CREATE/CREATE2 derivation check ensures only the correct deployer can be registered regardless of who calls the function. Documented in repo's ARCHITECTURE.md and RISKS.md.

---

### H-21. Large V4 Trades Misrouted Due to Price Impact Ignorance — Accepted risk *(pass 3 nemesis)*

| Field | Value |
|-------|-------|
| **Repo** | univ4-router-v6 |
| **File** | `src/JBUniswapV4Hook.sol:381-440,746-769` |
| **Auditor confidence** | HIGH (nemesis verified, PoC) |
| **My confidence** | **Accepted — known limitation** |
| **Known issue?** | Yes |

**Description:** `estimateUniswapOutput()` uses a linear TWAP quote with fees but no liquidity-depth simulation. `_beforeSwap()` trusts the inflated estimate and selects V4 over Juicebox even when the real V4 fill is materially worse. For shallow pools, the discrepancy can be large.

**PoC:** `test/audit/CodexNemesisLargeTradeMisroute.t.sol` — 5 ETH buy where `quotedV4Out > jbLiveOut` but `actualV4Out < jbLiveOut`.

**Recommended fix:** Replace the linear TWAP quote with a conservative lower-bound estimate that accounts for liquidity depth, or use the Uniswap V4 quoter for execution-faithful estimates before comparing against the JB route.

admin note: i think this is know and should be documented in risks. we use v4 geomean hook when applicable, and the liquidity depth check is too complex iirc.

**Resolution:** Accepted — Known limitation. V4 geomean hook used when applicable. Liquidity depth check too complex for routing hot path. amountOutMin prevents worst-case execution. Documented in RISKS.md.

---

### ~~H-22. Controller-Prepaid ERC20 Split Funds Are Never Credited~~ — FIXED (`fda4e33`) *(pass 3 pashov)*

| Field | Value |
|-------|-------|
| **Repo** | nana-distributor-v6 |
| **File** | `src/JBTokenDistributor.sol` / `src/JB721Distributor.sol` (processSplitWith) |
| **Auditor confidence** | 95 |
| **My confidence** | **pending** |
| **Known issue?** | No |

**Description:** The controller sends ERC20 split funds to the distributor before calling `processSplitWith`. Both distributors sample `balanceBefore` after receipt and then check allowance for a transferFrom. On the controller-prepaid path, `allowance < amount` so no transferFrom occurs, and `balanceOf(this) - balanceBefore = 0`. The rewards are permanently stranded outside the vesting accounting.

**Recommended fix:** When `allowance < amount`, credit `context.amount` directly to `_balanceOf` (the funds are already held):
```solidity
if (allowance >= context.amount) {
    uint256 balanceBefore = IERC20(context.token).balanceOf(address(this));
    IERC20(context.token).safeTransferFrom(msg.sender, address(this), context.amount);
    _balanceOf[hook][IERC20(context.token)] += IERC20(context.token).balanceOf(address(this)) - balanceBefore;
} else {
    _balanceOf[hook][IERC20(context.token)] += context.amount;
}
```

admin note: good catch, fix, and make sure to document inline in the imp, in the .md docs, and test thoroughly.

**Resolution:** FIXED — Restructured ERC-20 handling in both `JBTokenDistributor.processSplitWith` and `JB721Distributor.processSplitWith`. Terminal path (allowance >= amount) uses transferFrom with balance-delta accounting. Controller-prepaid path (else) credits `context.amount` directly. Documented inline. 8 new tests in `test/AuditFixes.t.sol`.

---

### ~~H-23. Buyback Sell-Side Cash-Out Swap Has No Failure Fallback~~ — FIXED (`3c18d77`) *(GitHub #75)*

| Field | Value |
|-------|-------|
| **Repo** | nana-buyback-hook-v6 |
| **File** | `src/JBBuybackHook.sol:234` (afterCashOutRecordedWith) |
| **Auditor confidence** | HIGH (code-verified) |
| **My confidence** | **HIGH — VERIFIED** |
| **Known issue?** | No |

**Description:** The sell-side cash-out path calls `_swapExactInput` without try-catch, unlike the buy-side `_swap` which has explicit failure handling and a mint fallback. If the Uniswap V4 pool reverts (insufficient liquidity, pool not initialized, internal hook revert), the entire `afterCashOutRecordedWith` call reverts. Since `beforeCashOutRecordedWith` already set `cashOutTaxRate = MAX_CASH_OUT_TAX_RATE` and `effectiveSurplusValue = 0`, there is no terminal-level reclaim to fall back to. The user's project tokens have been burned (then reminted to the hook at line 224), so the revert atomically restores them — but the user cannot cash out at all while the pool is in a bad state.

The asymmetry is clear:
- **Pay-side** (`_swap`, line 1048): `try POOL_MANAGER.unlock(...) catch { return (0, true); }` → fallback to mint at issuance rate
- **Sell-side** (`_swapExactInput`, line 1079): `POOL_MANAGER.unlock(...)` → bare call, revert propagates

**Recommended fix:** Wrap `_swapExactInput` in try-catch. On failure, fall back to the terminal's bonding curve reclaim by returning the tokens to the user without executing the swap. This matches the pay-side pattern.

admin note: fair enough, fix. make sure its this well tested and well documented.

**Resolution:** FIXED — `_swapExactInput` now returns `swapFailed=true` on pool revert via try-catch. `afterCashOutRecordedWith` transfers reminted project tokens back to the beneficiary on failure and emits `SellSwapReverted`. 5 new tests in `test/audit/SellSwapFallback.t.sol`. Documented in RISKS.md. 177 tests pass.

---

## Medium

### M-1. ~~Dust V3 Liquidity Pins Routing Away From Deeper V4 Markets~~ — FIXED (`f36e90a`)

| Field | Value |
|-------|-------|
| **Repo** | nana-suckers-v6 |
| **File** | `src/libraries/JBSwapPoolLib.sol` (_discoverPool) |
| **Auditor confidence** | 82 |
| **My confidence** | **75** |
| **Known issue?** | No |

**Description:** Any non-zero V3 liquidity blocks selection of a deeper hookless V4 pool. An attacker can seed a thin V3 market so bridge swaps route through the weaker venue at worse execution.

**Mitigation:** Remove the V3 preference guard — always select the pool with the highest liquidity regardless of version.

admin note: seems worth a fix, and worth extensive fork tests.

---

### M-2. ~~Interrupted Deployments Griefed by Permissionless Project-ID Minting~~ — FIXED (`62c0cc1`)

| Field | Value |
|-------|-------|
| **Repo** | deploy-all-v6 |
| **File** | `script/Deploy.s.sol` (_ensureProjectExists) |
| **Auditor confidence** | 82 |
| **My confidence** | **78** |
| **Known issue?** | Acknowledged in RISKS.md as "Deployment scripts -> project IDs -> cross-chain peer wiring" |

**Description:** Canonical project IDs are inferred from the mutable global `count`. An outsider can mint IDs 2-4 during an interrupted rollout, causing both deploy and resume to revert on owner mismatch.

**Mitigation:** Reserve canonical project IDs atomically in the first resumable phase and reuse stored IDs on resume.

admin note: great. fix if there's a clean fix with no tradeoffs.

*Re-confirmed by Pashov pass 2 (20260421) — [90] "Permissionless project creation can brick interrupted deployment recovery". Same root cause.*

---

### M-3. ~~Tempo ETH/USD Feed Registered Against `address(0)`~~ — FIXED (`c4521cc`)

| Field | Value |
|-------|-------|
| **Repo** | deploy-all-v6 |
| **File** | `script/Deploy.s.sol:1655-1667` |
| **Auditor confidence** | 95 |
| **My confidence** | **90 — VERIFIED** (but marked TODO in source, Tempo not yet deployed) |
| **Known issue?** | Source has a TODO comment acknowledging placeholder |

**Description:** Tempo mainnet and Tempo Moderato build `JBChainlinkV3PriceFeed(address(0), 3600)`. Any ETH-priced conversion on those chains reverts permanently. The code has a `// TODO: Replace with actual Chainlink ETH/USD feed address on Tempo once available` comment.

**Mitigation:** Replace with `revert("Tempo ETH/USD feed not configured")` until a real feed is available, preventing accidental deployment.

admin note: lets research what the actual feed addresses are and fix them. looks like there arent any right now. keep the TODO and add a revert to make sure we cant go live with this.

---

### M-4. ~~Public V4 Pool Pre-Initialization Blocks LP Deployment~~ — FIXED (`a3e5e4a`)

| Field | Value |
|-------|-------|
| **Repo** | univ4-lp-split-hook-v6 |
| **File** | `src/JBUniswapV4LPSplitHook.sol` (_createAndInitializePool) |
| **Auditor confidence** | 75 |
| **My confidence** | **70** |
| **Known issue?** | No |

**Description:** An attacker can initialize the public V4 pool at an out-of-band price first, causing `deployPool()` to revert with `PoolInitializedAtUnexpectedPrice` until external recovery changes the pool state.

**Mitigation:** Check if the pool is already initialized and validate the current price is within acceptable bounds rather than reverting.

admin note: yeah fair. can we add liquidity within our bounds even if the price can be out of band? out of bandwill always get arb'd away quickly. make sure this is well tested.

---

### M-5. Registry Pool-Setup Forwarding Unusable Out Of The Box

| Field | Value |
|-------|-------|
| **Repo** | nana-buyback-hook-v6 |
| **File** | `src/JBBuybackHookRegistry.sol` (initializePoolFor/setPoolFor) |
| **Auditor confidence** | 75 |
| **My confidence** | **72** |
| **Known issue?** | No |

**Description:** The registry forwards pool setup after its own permission check, but the downstream hook re-authenticates `msg.sender` as the registry contract, which doesn't hold `SET_BUYBACK_POOL` by default. The documented owner-facing setup path is broken.

**Mitigation:** Grant `SET_BUYBACK_POOL` to the registry during deployment, or have the hook recognize forwarded calls from the registry.

Admin note: CONFIRMED — REVDeployer already handles this. Its constructor grants `SET_BUYBACK_POOL` to the buyback hook registry with wildcard `revnetId=0` (line 211-212). This covers all revnet deployments. The issue only affects non-revnet integrators who bypass REVDeployer. Document as known integration requirement for future deployers.

*Re-confirmed by Nemesis pass 2 (20260421) — NM-001 "Registry Pool-Configuration Wrapper Re-Authenticates The Wrong Actor" with PoC. Same root cause: registry validates caller, forwarded call re-authenticates registry address.*

---

### M-6. ~~Reverting Terminal Metadata Read Bricks Routed `pay()` Calls~~ — FIXED (`7eee418`)

| Field | Value |
|-------|-------|
| **Repo** | nana-router-terminal-v6 |
| **File** | `src/JBPayRouteResolver.sol` (_candidatePayRouteTokens) |
| **Auditor confidence** | 75 |
| **My confidence** | **70** |
| **Known issue?** | No |

**Description:** One reverting terminal in `terminalsOf(projectId)` aborts candidate-token enumeration before the per-candidate try/catch isolation runs, so `JBRouterTerminal.pay()` is DoSed for that project even when another healthy terminal could route the payment.

**Mitigation:** Wrap the terminal metadata read in a try/catch during candidate enumeration.

admin note: ok, fix, and make sure well tested.

---

### M-7. ~~Fee-Refunded Terminal Migrations Leave Residual Source Balance~~ *(nemesis)* — DOWNGRADED TO LOW

| Field | Value |
|-------|-------|
| **Repo** | nana-core-v6 |
| **File** | `src/JBMultiTerminal.sol` (migrateBalanceOf) |
| **Auditor confidence** | MEDIUM (nemesis verified) |
| **My confidence** | **55 — real behavior, low impact** |
| **Known issue?** | No |

**Description:** When a terminal migration triggers held-fee refunds, the refunded amounts reduce the balance that gets migrated. But the source terminal's internal accounting still records the pre-refund balance, leaving a phantom residual that can't be withdrawn.

**Mitigation:** Re-read the actual balance after processing held fees and migrate only the delta.

admin note: im not sure about this one, not confident. if you're confident, show me, convince me that the tradeoffs are worth it.

**Investigation result:** The behavior is real but overstated. Traced full flow: if fee routing fails during migration, the catch block adds the fee amount back to source terminal accounting. The residual (2.5% of balance) is backed by real ETH and recoverable via a second migration. The project actually ends up *better off* (pays less in total fees) than a successful single migration. The proposed fix (skip fee deduction on failure) opens a fee-avoidance vector: a project owner could temporarily break fee routing, migrate fee-free, then restore it. **Downgraded to LOW — residual is always recoverable, fix has tradeoff.**

*Re-confirmed by Nemesis pass 2 (20260421) — NM-001 "Fee-Refunded Migrations Leave Residual Source Balance And Double-Charge Cleanup" with PoC at `test/audit/CodexMigrationFeeFailure.t.sol`. Same root cause traced with state-coupling analysis.*

---

### M-8. ~~Router Terminal Registry Forwarding Disables Receipt-Token Check~~ *(nemesis)* — DOWNGRADED TO INFORMATIONAL

| Field | Value |
|-------|-------|
| **Repo** | nana-router-terminal-v6 |
| **File** | `src/JBRouterTerminal.sol` |
| **Auditor confidence** | MEDIUM (nemesis verified) |
| **My confidence** | **40 — real gap, no practical exploit** |
| **Known issue?** | No |

**Description:** When the router terminal forwards a payment through the registry, the underlying terminal's receipt-token validation is bypassed because the registry acts as the caller and doesn't propagate the original caller's expected receipt parameters.

**Mitigation:** ~~Forward receipt-token expectations through the registry call, or validate receipt tokens at the router level after the underlying call returns.~~

admin note: im not sure about this one, not confident. if you're confident, show me, convince me that the tradeoffs are worth it.

**Investigation result:** Code gap confirmed — the router classifies the registry as a "forwarding terminal" and skips receipt enforcement, and the registry doesn't enforce receipts either. BUT the downstream JBMultiTerminal independently measures actual received balance via its own `_acceptFundsFor` balance-delta accounting. The gap only affects fee-on-transfer tokens, which the protocol doesn't target. Standard tokens (USDC, WETH, DAI) are unaffected. **Downgraded to informational — downstream terminal self-corrects.**

---

### M-9. ~~Two-Hop Router Forwarding Cycles Evade Fee/Filter Logic~~ *(nemesis)* — DOWNGRADED TO INFORMATIONAL

| Field | Value |
|-------|-------|
| **Repo** | nana-router-terminal-v6 |
| **File** | `src/JBRouterTerminal.sol` |
| **Auditor confidence** | MEDIUM (nemesis verified) |
| **My confidence** | **35 — misleading title, self-inflicted DoS** |
| **Known issue?** | No |

**Description:** A payment can cycle through two router terminals: Terminal A forwards to Terminal B, which routes back to A's underlying terminal. Each hop applies its own fee and filter logic independently, but the composition can evade intended per-payment constraints like fee deduction or metadata filtering.

**Mitigation:** ~~Track and reject re-entrant routing, or apply constraints based on the original payment context rather than per-hop context.~~

admin note: im not sure about this one, not confident. if you're confident, show me, convince me that the tradeoffs are worth it.

**Investigation result:** The finding title is misleading — **no fee/filter evasion is possible.** A multi-hop cycle causes infinite recursion until gas exhaustion, then the whole transaction reverts. No funds at risk. Creating a cycle requires privileged project-owner actions (setting terminals in JBDirectory). The consequence is self-inflicted DoS, not value extraction. `lockTerminalFor` already documents this risk in its NatSpec. **Downgraded to informational.**

---

### M-10. Retroactive Default Reserve Beneficiary Rebinding *(nemesis — promotes Lead 6)*

| Field | Value |
|-------|-------|
| **Repo** | nana-721-hook-v6 |
| **File** | `src/JB721TiersHook.sol` |
| **Auditor confidence** | MEDIUM (nemesis verified) |
| **My confidence** | **50 — accepted design** |
| **Known issue?** | Pashov flagged as lead |

**Description:** The default reserve beneficiary can be changed by the project owner after tiers are already configured. Pending reserve distributions that accumulated under the old beneficiary will mint to the new one, retroactively redirecting economic value without the original beneficiary's consent.

**Mitigation:** Snapshot the beneficiary at reserve-accumulation time, or require explicit consent from the current beneficiary before rebinding.

admin note: this is ok and by design, should be documented in the repo's RISKS.

---

### M-11. ~~Large Trades Misrouted to V4 Due to Stale TWAP Quote~~ *(nemesis)* — DOWNGRADED TO INFORMATIONAL

| Field | Value |
|-------|-------|
| **Repo** | univ4-router-v6 |
| **File** | `src/JBUniswapV4Hook.sol` (estimateUniswapOutput) |
| **Auditor confidence** | MEDIUM (nemesis verified) |
| **My confidence** | **35 — already mitigated and documented** |
| **Known issue?** | Yes — documented in NatSpec, RISKS.md, ARCHITECTURE.md |

**Description:** The router uses a TWAP-based quote to decide whether to route through V4. For large trades that would move the price significantly, the TWAP quote overestimates V4 output, causing the router to select V4 even when a V3 pool with deeper liquidity would give better execution.

**Mitigation:** ~~Apply slippage-aware routing that simulates actual execution impact, not just spot/TWAP quotes.~~

admin note: i was under the impression that our repo here was already very much aware of slippage and trying to make the best decision possible. if not, fix it for sure, but beware of tradeoffs. make sure this is well tested with fork tests and integration tests.

**Investigation result:** Your impression is correct. The repo is thoroughly aware: (1) `estimateUniswapOutput()` has explicit `@dev` NatSpec (lines 354-361) warning about linearized price not reflecting liquidity depth, (2) every swap enforces `amountOutMin` in `_afterSwap` — if V4 execution produces less than user tolerance, it **reverts** (not silently underpays), (3) RISKS.md Section 3 explicitly calls this out, (4) true tick-walking simulation is documented as gas-prohibitive. Worst case is an unnecessary revert (wasted gas), not misrouted value. **Downgraded to informational — already mitigated by amountOutMin enforcement.**

---

### M-12. ~~Fee-On-Transfer Tokens Break Buyback Swap Settlement~~ *(nemesis — promotes Lead 9)* — FIXED (`11f232d`)

| Field | Value |
|-------|-------|
| **Repo** | nana-buyback-hook-v6 |
| **File** | `src/JBBuybackHook.sol` |
| **Auditor confidence** | MEDIUM (nemesis verified) |
| **My confidence** | **75** |
| **Known issue?** | Pashov flagged as lead |

**Description:** The buyback hook's swap settlement assumes `amountOut` from the DEX matches what the hook actually receives. Fee-on-transfer tokens deliver less than `amountOut`, causing the hook to promise more tokens than it holds. Subsequent operations revert or underpay.

**Mitigation:** Use balance-delta accounting for swap output, or explicitly reject fee-on-transfer tokens in the hook.

admin note: sure, use balance-delta accounting. make sure well tested.

*Expanded by Nemesis pass 2 (20260421) — NM-002 "Transfer-Taxed Output Tokens Break Routed Settlement On Both Buy And Sell Paths" with PoCs for both sides. Original M-12 focused on one path; Nemesis demonstrated the buy-side also reverts when `burnTokensOf` is called with the callback-reported amount that exceeds actual hook balance.*

---

### M-13. ~~CroptopDeployer Broken Currency Domain at Launch~~ *(nemesis — promotes Lead 14)* — FALSE POSITIVE

| Field | Value |
|-------|-------|
| **Repo** | croptop-core-v6 |
| **File** | `src/CTDeployer.sol` |
| **Auditor confidence** | MEDIUM (nemesis verified) |
| **My confidence** | **20 — false positive** |
| **Known issue?** | Pashov flagged as lead |

**Description:** The deployer sets `baseCurrency = ETH` (value 1) for the ruleset, but the terminal uses native-token accounting where the currency is `uint32(uint160(NATIVE_TOKEN))`. When the project tries to resolve prices for payout limits, the currency mismatch triggers a price feed lookup for a pair that may not be registered, causing payouts to revert.

**Mitigation:** ~~Use the terminal's accounting currency consistently in the ruleset configuration, or register the necessary price feed during deployment.~~

admin note: no this is by design. the baseCurrency should always be a general currency not directly tied to a token address. 1 is correct here. our documentation in nana-core and even in top level repo should make this clear.

**Confirmed false positive.** The nemesis auditor confused conceptual currency IDs (`JBCurrencyIds.ETH = 1`) with terminal accounting currency IDs (`uint32(uint160(token))`). The protocol uses identity price feeds to bridge between the two domains. `baseCurrency = 1` is the correct and intended pattern.

---

### M-14. ~~Omnichain launchRulesetsFor Breaks Fresh-Project Bootstrap Path~~ *(nemesis)* — FIXED (`2de02bf`)

| Field | Value |
|-------|-------|
| **Repo** | nana-omnichain-deployers-v6 |
| **File** | `src/JBOmnichainDeployer.sol:741` |
| **Auditor confidence** | MEDIUM (nemesis verified, PoC) |
| **My confidence** | **78** |
| **Known issue?** | No |

**Description:** `_launchRulesetsFor` calls `_validateController` which requires `controllerOf(projectId) != address(0)`. But for fresh projects that haven't launched rulesets yet, the controller is zero — the very call that would install it is gated behind a check that it's already installed. Fresh projects can't use the omnichain deployer for their first ruleset launch.

**Mitigation:** Allow zero controller in `_validateController` — treat it as "not yet set" rather than "mismatch":
```solidity
if (current != address(0) && current != address(controller)) revert;
```

admin note: why is the _validateController thing currently there? what purpose does it currently serve? if none, remove it. make sure this is well tested.

**Investigation result:** `_validateController` serves a real security purpose. The JBOmnichainDeployer is the `OMNICHAIN_RULESET_OPERATOR`, which gets unconditional permission bypass in JBController. Without this check, an authorized operator could pass a fake controller that returns arbitrary rulesetIds, corrupting the deployer's internal `_tiered721HookOf` and `_extraDataHookOf` mappings. **Keep the check, but allow address(0)** for the fresh-project case only: `if (current != address(0) && current != address(controller)) revert;`. This preserves the security check for existing projects while unblocking fresh-project bootstrap.

*Re-confirmed by Nemesis pass 2 (20260421) — NM-001 with PoC at `test/audit/CodexNemesisAudit.t.sol`. Identical root cause and identical fix recommendation.*

---

### M-15. Existing Projects Cannot Deploy Suckers Through Omnichain Wrapper *(nemesis)*

| Field | Value |
|-------|-------|
| **Repo** | nana-omnichain-deployers-v6 |
| **File** | `src/JBOmnichainDeployer.sol:150` |
| **Auditor confidence** | MEDIUM (nemesis verified, PoC) |
| **My confidence** | **45 — expected behavior, document** |
| **Known issue?** | Related to Lead 15 |

**Description:** `deploySuckersFor` checks `DEPLOY_SUCKERS` for the external caller, then calls `JBSuckerRegistry.deploySuckersFor` which re-checks the permission for `address(this)` (the deployer contract). Initial launches work because the deployer temporarily owns the project NFT. For existing projects, the call fails unless the deployer contract was separately granted `DEPLOY_SUCKERS`.

**Mitigation:** Either make the end user the downstream caller, bootstrap a documented per-project `DEPLOY_SUCKERS` grant to the deployer, or add a trusted-wrapper path in the registry.

admin note: this is expected, the deployer contract needs to be granted this permission separately. make sure this is documented in USER JOURNEYS.

*Re-confirmed by Nemesis pass 2 (20260421) — NM-002 with PoC. Also re-confirmed by Pashov pass 2 (croptop-core-v6 [75] "Owner-facing `deploySuckersFor` helper cannot satisfy the registry permission check") — same wrapper-permission pattern in CTDeployer.*

---

### M-16. ~~Fee-Project Deployment Hard-Reverts on Replay~~ *(nemesis)* — FIXED (`24121fb`)

| Field | Value |
|-------|-------|
| **Repo** | nana-fee-project-deployer-v6 |
| **File** | `script/Deploy.s.sol:96-97` |
| **Auditor confidence** | MEDIUM (nemesis verified, PoC) |
| **My confidence** | **72** |
| **Known issue?** | No |

**Description:** The deploy script unconditionally calls `revnet.basic_deployer.deployFor(projectId=1, ...)` on every run. After the first successful deployment, the caller is no longer the project owner, so `REVDeployer` reverts on the ownership check. Resume and replay flows are not safe.

**Mitigation:** Check if the controller is already set before attempting deployment:
```solidity
if (address(core.controller.DIRECTORY().controllerOf(feeProjectId)) != address(0)) return;
```

admin note: if you're confident there are no tradeoffs, fix it.

---

### M-17. ~~Distributor Controller-Path Overcredits Fee-On-Transfer Tokens~~ *(nemesis — promotes Lead 24)* — FIXED (`9918cd6`)

| Field | Value |
|-------|-------|
| **Repo** | nana-distributor-v6 |
| **File** | `src/JBTokenDistributor.sol:72`, `src/JB721Distributor.sol:77` |
| **Auditor confidence** | MEDIUM (nemesis verified, PoC) |
| **My confidence** | **78** |
| **Known issue?** | Pashov flagged as lead |

**Description:** The terminal split path uses balance deltas for accounting, but the controller pre-send path trusts `context.amount`. For fee-on-transfer tokens, the distributor receives less than the nominal amount but books the full value. Later `collectVestedRewards` reverts because the real balance is short.

**Mitigation:** Use balance-delta accounting in the controller path too, or reject controller-prepaid flows for transfer-tax tokens.

admin note: fix it, and make sure this is well tested with fork tests..

*Re-confirmed by Pashov pass 2 (20260421) — [90] "Controller-funded split callbacks strand ERC20 rewards". Same root cause: `balanceBefore` read after transfer already landed, credited delta is zero.*

---

### M-18. ~~Verify Script Doesn't Model No-Uniswap and Tempo Deployments Correctly~~ *(nemesis)* — FIXED (`c4521cc`)

| Field | Value |
|-------|-------|
| **Repo** | deploy-all-v6 |
| **File** | `script/Verify.s.sol` |
| **Auditor confidence** | MEDIUM (nemesis verified) |
| **My confidence** | **70** |
| **Known issue?** | Related to Lead 21 |

**Description:** `Verify.s.sol` uses different branch predicates than `Deploy.s.sol`. It treats "no router terminal" as "only projects 1-2 exist", treats "buyback registry exists" as "all projects must be wired", and treats ETH/NATIVE as an identity feed on every chain. These assumptions are violated on no-Uniswap and Tempo branches, causing valid deployments to fail certification.

**Mitigation:** Centralize feature detection around the same branch logic used in `Deploy`; add Tempo-aware price-feed verification.

admin note: fix is if you're sure no tradeoffs.

---

### M-19. ~~Tempo Defifa Deployments Created With Null Typeface~~ *(nemesis — promotes Lead 23)* — FIXED (`c4521cc`)

| Field | Value |
|-------|-------|
| **Repo** | deploy-all-v6 |
| **File** | `script/Deploy.s.sol:2625` |
| **Auditor confidence** | MEDIUM (nemesis verified) |
| **My confidence** | **75** |
| **Known issue?** | Pashov flagged as lead |

**Description:** Tempo chains set `_typeface = address(0)` but still deploy `DefifaTokenUriResolver(ITypeface(_typeface))`. The resolver stores `TYPEFACE` immutably and unconditionally calls `sourceOf(...)` on it during metadata generation. Every `tokenURI()` call on Tempo Defifa NFTs reverts.

**Mitigation:** Skip Defifa deployment on chains without a live `Typeface`, or require a non-zero `Typeface` address before deploying the resolver.

admi note: yes, skip.

---

### M-20. ~~Tempo Moderato USDC Address Is Zero — Bricks Deployment~~ *(lead investigation — promotes Lead 22)* — FIXED (`c4521cc`)

| Field | Value |
|-------|-------|
| **Repo** | deploy-all-v6 |
| **File** | `script/Deploy.s.sol:1841-1848` |
| **Auditor confidence** | Lead (promoted after investigation) |
| **My confidence** | **80** |
| **Known issue?** | Flagged as lead |

**Description:** The deploy script sets `_usdc = address(0)` on Tempo Moderato (`chainId == 978658`). This propagates into `_setupPriceFeeds()` which calls `PRICES.addPriceFeedFor(projectId: 0, pricingCurrency: uint32(uint160(address(0))), unitCurrency: …, feed: …)`. `JBPrices.addPriceFeedFor` reverts with `JBPrices_ZeroUnitCurrency` when either currency parameter resolves to zero. The entire deployment transaction reverts.

**Mitigation:** Either assign a valid USDC address for Tempo Moderato, or skip USDC-related price feed setup on chains where USDC is not yet deployed (same pattern as no-Uniswap branches).

---

### M-21. One-Tier Defifa Games Are Launchable But Can Never Complete Governance *(nemesis)*

| Field | Value |
|-------|-------|
| **Repo** | defifa |
| **File** | `src/DefifaDeployer.sol:454` |
| **Auditor confidence** | MEDIUM (nemesis verified) |
| **My confidence** | **72** |
| **Known issue?** | No |

**Description:** `launchGameWith()` permits single-tier games. The only valid scorecard for a one-tier game gives that tier 100% of `TOTAL_CASHOUT_WEIGHT`. But the BWA (beneficiary-weighted attestation) model zeroes the attestation weight for holders of a tier that receives 100% — the sole tier's holders get `weight == 0` and `attestToScorecardFrom` reverts. No attestations can accumulate, quorum is unreachable, and the game can only exit via timeout/no-contest. Funds are locked until the no-contest path is triggered.

**Investigation:** Confirmed: when `scorecardTimeout > 0`, one-tier games fall through to NO_CONTEST correctly — `triggerNoContestFor()` is permissionless, queues a refund ruleset with `cashOutTaxRate: 0`, and players recover their exact mint price. However, if `scorecardTimeout = 0`, the timeout check is disabled and funds are permanently locked with no exit path. No validation prevents this misconfiguration.

**Mitigation:** Document one-tier no-contest behavior in RISKS.md. Consider also validating that `scorecardTimeout > 0` when tier count is 1.

admin note: one tier games ending in no contest is fine. document in RISKS.md. the scorecardTimeout=0 edge case is worth noting.

---

### M-22. Migration Verification Skips All Owners For Tiers With Fallback-Resolver Balance — WON'T FIX, NOTED *(nemesis — promotes Lead 17)*

| Field | Value |
|-------|-------|
| **Repo** | banny-retail-v6 |
| **File** | `script/helpers/MigrationHelper.sol:93` |
| **Auditor confidence** | MEDIUM (nemesis verified) |
| **My confidence** | **68** |
| **Known issue?** | Flagged as lead |

**Description:** `verifyTierBalances()` checks if the V4 fallback resolver owns any token of a tier, and if so, `continue`s past the entire tier without comparing any individual owner's V5 balance to their V4 balance. An owner over-credited for that tier in V5 passes migration verification silently. The nemesis PoC shows Alice with V5 balance `2` vs V4 balance `1` passes verification when the fallback resolver holds any token of that tier.

**Mitigation:** Split verification into (1) aggregate tier conservation and (2) per-owner redistribution accounting that deducts fallback-held tokens from the allowed delta rather than skipping the entire tier.

*Re-confirmed by Nemesis pass 2 (20260421) — NM-001 with PoC at `test/audit/MigrationHelperVerificationBypass.t.sol`. Also re-surfaced as Pashov pass 2 lead: "Migration verification can skip over-allocated owners for an entire tier".*

Admin note: dont touch migration script.

---

### M-23. ~~Default Registry Topology Bricks Routered Payments~~ *(Pashov pass 2)* — FIXED (`5b42a87`)

| Field | Value |
|-------|-------|
| **Repo** | nana-router-terminal-v6 |
| **File** | `src/JBRouterTerminal.sol` (_usablePrimaryTerminalOf) |
| **Auditor confidence** | 90 |
| **My confidence** | **pending** |
| **Known issue?** | No |

**Description:** The shipped deployment wires `JBRouterTerminalRegistry` to forward to `JBRouterTerminal`, but the router rejects any destination terminal whose `terminalOf(projectId)` resolves back to itself. Projects pointed at the registry cannot be previewed or paid through the default route — the self-loop check fires because the registry's resolution chain terminates at the router.

**Mitigation:** Distinguish between the registry forwarding to the router (expected) and the router forwarding to itself (cycle):
```diff
- if (ok && data.length >= 32 && address(abi.decode(data, (IJBTerminal))) == address(this)) {
-     return IJBTerminal(address(0));
- }
+ if (
+     ok && data.length >= 32 && address(terminal) != address(DIRECTORY.primaryTerminalOf(projectId, token))
+         && address(abi.decode(data, (IJBTerminal))) == address(this)
+ ) {
+     return IJBTerminal(address(0));
+ }
```

---

### ~~M-24. Empty-Post Metadata Shadowing Bypasses Croptop Fees~~ — FIXED (`7a8d3ad`) *(Pashov pass 2)*

| Field | Value |
|-------|-------|
| **Repo** | croptop-core-v6 |
| **File** | `src/CTPublisher.sol` (mintFrom) |
| **Auditor confidence** | 95 |
| **My confidence** | **95 — VERIFIED** |
| **Known issue?** | No |

**Description:** `mintFrom` charges the fee from `totalPrice` derived only from `posts`, so an attacker can pass `posts = []` and preload the same pay-metadata id in `additionalPayMetadata` to mint existing tiers while routing the full payment with zero Croptop fee.

**Mitigation:** Reject empty posts and/or check that `additionalPayMetadata` does not already contain the hook's metadata ID:
```solidity
if (posts.length == 0) revert();
(bool found,) = JBMetadataResolver.getDataFor(
    JBMetadataResolver.getId({purpose: "pay", target: hook.METADATA_ID_TARGET()}), additionalPayMetadata
);
if (found) revert();
```

Admin note: fix it, make sure its well tested.

**Resolution:** FIXED — Added `if (posts.length == 0) revert CTPublisher_NoPosts()` at the start of `mintFrom`. Test: `test/audit/EmptyPostFeeBypass.t.sol`.

---

### ~~M-25. Deployer Configuration Accepts Broken Bridge Tuples~~ — FIXED (`8509f39`) *(Nemesis pass 2)*

| Field | Value |
|-------|-------|
| **Repo** | nana-suckers-v6 |
| **File** | `src/deployers/JBOptimismSuckerDeployer.sol:49-78`, `src/deployers/JBArbitrumSuckerDeployer.sol:51-82` |
| **Auditor confidence** | MEDIUM (nemesis verified) |
| **My confidence** | **85 — VERIFIED** |
| **Known issue?** | No |

**Description:** `setChainSpecificConstants` writes each field in the bridge tuple independently, but `_layerSpecificConfigurationIsSet()` uses OR logic — it returns `true` when *any* field is nonzero. A configurator that sets only `opMessenger` (missing `opBridge`) or only part of the Arbitrum tuple can successfully call `configureSingleton()`. The singleton constructor snapshots zero transport addresses into immutables. The registry can then allowlist and deploy a sucker whose message delivery or auth will silently fail.

**Mitigation:** Use AND logic in the configuration checks:
```solidity
// Optimism:
function _layerSpecificConfigurationIsSet() internal view override returns (bool) {
    return address(opMessenger) != address(0) && address(opBridge) != address(0);
}
// Arbitrum:
function _layerSpecificConfigurationIsSet() internal view override returns (bool) {
    if (arbLayer == JBLayer.L1) return address(arbInbox) != address(0) && address(arbGatewayRouter) != address(0);
    if (arbLayer == JBLayer.L2) return address(arbGatewayRouter) != address(0);
    return false;
}
```

Admin note: fix if you're confident. make sure you're confident and there are no tradeoffs.

**Resolution:** FIXED in commit `8509f39` — `||` changed to `&&` in `JBOptimismSuckerDeployer._layerSpecificConfigurationIsSet()`. Already in code, missed during earlier verification.

---

### ~~M-26. Credit Cashout Preferred-Token Short-Circuit Spends Stray Router Balances~~ — FIXED (`d387e4e`) *(promotes Lead 29)*

| Field | Value |
|-------|-------|
| **Repo** | nana-router-terminal-v6 |
| **File** | `src/JBRouterTerminal.sol:1182-1193` (`_cashOutLoop`) |
| **Auditor confidence** | 90 (Pashov) |
| **My confidence** | **80 — VERIFIED, conditional** |
| **Known issue?** | No |

**Description:** In `_cashOutLoop`, the preferred-token early return (lines 1182-1193) fires *before* calling `cashOutTokensOf` on any terminal. When a user holds only credits (no ERC-20 tokens) and the router happens to hold stray ETH (from a prior failed transfer, accidental send, etc.), the credit count is used as the token amount in the return value. The caller receives stray ETH that doesn't correspond to an actual cashout redemption, while the credits remain unburned and the terminal's accounting is unchanged.

**Impact:** Conditional fund loss — requires stray native token in the router contract. When triggered, credits are effectively free-loaded with unaccounted ETH. MEDIUM because the precondition (stray ETH) is uncommon but possible.

**Mitigation:** Skip the preferred-token early return when the credit balance is nonzero and no terminal cashout has occurred:
```diff
- if (preferredToken != address(0) && address(this).balance >= creditBalance) {
-     return (creditBalance, preferredToken);
- }
+ // Only short-circuit if credits were actually cashed out via a terminal
```

admin not: make sure you're confident in the fix, fix it, make sure its well tested.

**Resolution:** FIXED — Gated the preferred-token short-circuit on `sourceProjectIdOverride == 0` at line 1182, matching the existing gate at line 1196. Test: `test/audit/CreditCashoutPreferredTokenBypass.t.sol`.

---

### M-27. Sell-Side Cash-Out Routing Bypasses Terminal Fee Meter — Accepted risk *(pass 3 nemesis)*

| Field | Value |
|-------|-------|
| **Repo** | nana-buyback-hook-v6 |
| **File** | `src/JBBuybackHook.sol:747,751,777` |
| **Auditor confidence** | MEDIUM (nemesis verified) |
| **My confidence** | **Accepted — by design** |
| **Known issue?** | By design |

**Description:** On the sell route, `beforeCashOutRecordedWith` hardcodes `hookSpecifications[0].amount = 0` and returns `effectiveSurplusValue = 0` with max tax rate. `JBMultiTerminal` only fees the direct `reclaimAmount` and forwarded hook amounts — both zero. The hook then remints project tokens, sells on AMM, and transfers proceeds directly to the beneficiary. `_takeFeeFrom(...)` sees nothing feeable. Holders can exit through the sell path without paying the normal cash-out fee.

**Recommended fix:** Set the hook specification amount to the expected sell output so the terminal can meter fees:
```solidity
hookSpecifications[0] = JBCashOutHookSpecification({
    hook: IJBCashOutHook(address(this)),
    noop: noop,
    amount: minimumSwapAmountOut, // feed into fee meter
    metadata: ...
});
```
Alternatively, have the terminal receive swap proceeds and apply `_takeFeeFrom(...)` before forwarding to the beneficiary.

admin note: ok, is there any tradeoff to the recommended fix? i wonder if this is related? https://github.com/Bananapus/version-6/issues/73

**Resolution:** Accepted — Fees apply only to actual terminal cashouts, not AMM swap proceeds. The hook's `amount: 0` intentionally avoids terminal fee metering on swap output. Documented in RISKS.md.

---

### M-28. `deploySuckersFor` Unusable After Ownership Transfer — Accepted risk *(pass 3 nemesis, corroborated by pashov)*

| Field | Value |
|-------|-------|
| **Repo** | croptop-core-v6 |
| **File** | `src/CTDeployer.sol:268,275,282` |
| **Auditor confidence** | MEDIUM (nemesis verified, PoC) |
| **My confidence** | **Accepted — by design** |
| **Known issue?** | Promotes Lead 15 |

**Description:** `CTDeployer.deploySuckersFor` validates the external caller as project owner, then forwards to `JBSuckerRegistry.deploySuckersFor`. The registry re-checks `DEPLOY_SUCKERS` permission against its own `msg.sender` — which is `CTDeployer`, not the owner. Unless the project separately grants `DEPLOY_SUCKERS` to `CTDeployer`, the helper reverts.

**PoC:** `test/audit/CodexNemesisPoCs.t.sol` — `test_deploySuckersHelperBreaksAfterOwnershipTransferBecauseRegistrySeesCtDeployerAsCaller` passes.

**Recommended fix:** Either (A) remove the wrapper and instruct owners to call the registry directly, (B) make the registry entrypoint accept an `onBehalfOf` caller parameter, or (C) have `CTDeployer` retain `DEPLOY_SUCKERS` permission and document this requirement.

admin note: this is ok, once ownership is transfered, the new owner is reponsible for deploySuckersFor on their own. make sure this is documented in the repo's relevant .md docs.

**Resolution:** Accepted — After ownership transfer, the new owner calls JBSuckerRegistry.deploySuckersFor directly. Documented in RISKS.md.

---

### ~~M-29. Hardcoded `baseCurrency=ETH` Requires Undeclared Identity Price Feed~~ — NON-ISSUE *(pass 3 nemesis, re-opens H-9/M-13)*

| Field | Value |
|-------|-------|
| **Repo** | croptop-core-v6 |
| **File** | `src/CTDeployer.sol:171` / `script/ConfigureFeeProject.s.sol:231` |
| **Auditor confidence** | HIGH (nemesis verified, PoC) |
| **My confidence** | **NON-ISSUE — baseCurrency=1 is correct by design** |
| **Known issue?** | H-9 and M-13 dismissed as FP |

**Description:** `CTDeployer` hardcodes `baseCurrency = JBCurrencyIds.ETH` (value 1) while terminals use `currency = uint32(uint160(NATIVE_TOKEN))`. When `_computePayFrom` sees the mismatch, it calls `JBPrices.pricePerUnitOf`, which reverts with `PriceFeedNotFound` if no identity feed exists. Two vectors: (A) fresh Croptop deployments can't publish at all, (B) the fee-project script puts the system into permanent fee-refund mode because the fee-project payment reverts and `CTPublisher` catches the revert and refunds. H-9/M-13 were dismissed because "baseCurrency=1 is correct by design" — but the operational requirement for an identity feed was not addressed.

**PoC:** `test/audit/CodexNemesisCurrencyPoCs.t.sol` — publishes revert until identity feed installed; fee project balance stays at zero.

**Recommended fix:** Match `baseCurrency` to the terminal accounting currency:
```solidity
rulesetConfigurations[0].metadata.baseCurrency = uint32(uint160(JBConstants.NATIVE_TOKEN));
```
If `baseCurrency = ETH (1)` is required by design, then the deployment script must install the identity price feed and fail closed if it's absent.

admin note: we know that baseCurrency should always be a non-token currency, so 1 makes sense here. this is a non issue.

**Resolution:** NON-ISSUE — baseCurrency should always be a general currency ID (ETH=1, USD=2), not a token address. Identity price feed handles the domain bridge.

---

### ~~M-30. Preview Cash-Out Shortcut Diverges From Execution~~ — FIXED (`9768952`) *(pass 3 pashov)*

| Field | Value |
|-------|-------|
| **Repo** | nana-router-terminal-v6 |
| **File** | `src/JBRouterTerminal.sol` (_previewCashOutLoop) |
| **Auditor confidence** | 75 |
| **My confidence** | **pending** |
| **Known issue?** | No |

**Description:** When `cashOutSource` forces a first cash-out hop but preview also sees a preferred destination token, `_previewCashOutLoop` can short-circuit before that hop while `_cashOutLoop` cannot. Route scoring may select a worse path than the user would have chosen with execution-faithful previews.

**Recommended fix:** Apply the same `sourceProjectIdOverride` gate in `_previewCashOutLoop` as exists in `_cashOutLoop`, so the preview path mirrors execution semantics.

admin note: this seems worth fixing. any tradeoffs?

**Resolution:** FIXED — `_previewCashOutLoop` now gates the entire destination-terminal check behind `if (sourceProjectIdOverride == 0)`, mirroring `_cashOutLoop`. No tradeoffs — preview now matches execution. 3 new tests in `test/audit/PreviewCashOutShortcircuitDivergence.t.sol`. 194 tests pass.

---

### ~~M-31. Mixed CREATE2/CREATE Deployments Misregister Hook Provenance~~ — INVALID (finding incorrect) *(pass 3 pashov)*

| Field | Value |
|-------|-------|
| **Repo** | univ4-lp-split-hook-v6 |
| **File** | `src/JBUniswapV4LPSplitHookDeployer.sol` (deployHookFor) |
| **Auditor confidence** | 75 |
| **My confidence** | **pending** |
| **Known issue?** | No |

**Description:** `_nonce` is incremented for both CREATE2 and CREATE deployment paths. After any deterministic (CREATE2) deployment, the first plain CREATE deployment is registered in the address registry under the wrong nonce, pointing to a different address than the actual hook.

**Recommended fix:** Track separate nonces for CREATE and CREATE2 paths, or only increment `_nonce` on the CREATE path (CREATE2 addresses don't depend on nonce).

admin note: so why do we need a separate CREATE2 nonce if it doesnt depend on one?

**Resolution:** INVALID — Both CREATE and CREATE2 opcodes increment the sender's EVM nonce. The internal `_nonce` must advance for both paths to stay in sync with the actual EVM nonce, since `JBAddressRegistry.registerAddress` computes the expected CREATE address from `(deployer, nonce)`. Skipping the increment on CREATE2 paths causes subsequent CREATE registrations to use the wrong nonce. Added clarifying comment and regression test.

---

### ~~M-32. Interrupted Deployments Griefed By Project-ID Squatting~~ — DUPLICATE of M-2 (already fixed) *(pass 3 pashov)*

| Field | Value |
|-------|-------|
| **Repo** | deploy-all-v6 |
| **File** | `script/Deploy.s.sol` (_ensureProjectExists) |
| **Auditor confidence** | 90 |
| **My confidence** | **pending** |
| **Known issue?** | No |

**Description:** The rollout hard-codes canonical project IDs 1-4 but `JBProjects.createFor()` is permissionless. During a partial deployment, any user can mint the next IDs and permanently break `Resume.s.sol` or force the remaining topology onto wrong IDs.

**Recommended fix:** Reserve all canonical IDs atomically before any interruptible phase, or persist the returned IDs and look them up on resume instead of assuming fixed ordinals.

admin note: ok, fix it. any tradeoffs?

**Resolution:** DUPLICATE of M-2 — Already fixed by commit `62c0cc1`. `_ensureProjectExists` verifies ownership of existing IDs (reverts `Deploy_ProjectNotOwned` if squatted) and checks returned ID matches expected (reverts `Deploy_ProjectIdMismatch` if front-run). No additional changes needed.

---

### M-33. Cross-Chain Surplus Staleness Inflates Omnichain Bonding Curve — Accepted risk *(GitHub #53)*

| Field | Value |
|-------|-------|
| **Repo** | revnet-core-v6 |
| **File** | `src/REVLoans.sol:376-387` (_borrowableAmountFrom), `src/REVOwner.sol:175-181` (beforeCashOutRecordedWith) |
| **Auditor confidence** | HIGH (code-verified) |
| **My confidence** | **Accepted — design tradeoff** |
| **Known issue?** | Partially — inherent to cross-chain design |

**Description:** `REVLoans._borrowableAmountFrom` and `REVOwner.beforeCashOutRecordedWith` add `remoteSurplusOf()` and `remoteTotalSupplyOf()` to local values for bonding curve calculations. These remote values are updated only when someone calls `toRemote()` on the peer chain — there is no heartbeat, no staleness check, and no expiry. Values can be arbitrarily old.

An attacker who mints heavily on chain B (expanding remote supply) can immediately borrow on chain A at a more favorable rate because the local sucker still reports the old, lower remote supply. The bonding curve sees a smaller denominator, inflating the per-token borrowable amount.

**Key mitigation already in code:** `REVLoans` caps borrowable at `localSurplus` (line 386-387: `return reclaimable > localSurplus ? localSurplus : reclaimable`). This prevents extracting more than the local terminal holds. The risk is bounded to a rate advantage, not a total surplus drain.

**Recommended fix:** Add a staleness check or heartbeat requirement to sucker snapshot data. Alternatively, document the design tradeoff in RISKS.md with the local surplus cap as the primary safeguard.

admin note: do you have any good ideas for where/how to implement a heartbeat or staleness check without undersired tradeoffs or costs? if not, document as design tradeoff. if yes, lets chat.

**Resolution:** Accepted — No clean heartbeat mechanism without undesirable tradeoffs (would require mandatory bridge messages, adding gas cost and liveness dependency). Local surplus cap (line 386-387) is the primary safeguard. Documented in RISKS.md.

---

### M-34. OMNICHAIN_RULESET_OPERATOR Can Queue Rulesets For Any Project — Accepted risk *(GitHub #61)*

| Field | Value |
|-------|-------|
| **Repo** | nana-core-v6 |
| **File** | `src/JBController.sol:97-110,442-456,595-601` |
| **Auditor confidence** | HIGH (code-verified) |
| **My confidence** | **Accepted — intentional, documented** |
| **Known issue?** | Documented in code (lines 100-109) |

**Description:** `OMNICHAIN_RULESET_OPERATOR` is a hardcoded immutable address that bypasses `JBPermissions` checks for `launchRulesetsFor`, `queueRulesetsOf`, and `setTerminalsOf` (during launch) for ANY project. This is documented extensively in inline NatSpec:

> "TRUST BOUNDARY: This hardcoded address can call `launchRulesetsFor` and `queueRulesetsOf` for ANY project, bypassing normal `JBPermissions` checks."

**Mitigating factors:**
- Projects with approval hooks (e.g., `JBDeadline`) are protected: queued rulesets must pass the hook before activating
- `launchRulesetsFor` reverts if rulesets already exist, limiting the `SET_TERMINALS` risk to project initialization
- Address is immutable (set at deploy time), compromise requires compromising the specific deployed bytecode
- Intentional design for cross-chain ruleset synchronization

**Recommended fix:** Document in RISKS.md. Projects concerned about this trust surface should configure approval hooks.

admin note: yes, document in RISKS. this should be the omnichain deployer set in the deploy script.

**Resolution:** Accepted — Intentional design for cross-chain ruleset sync. Projects should use approval hooks. Documented in RISKS.md.

---

### M-35. Duplicate Fund Access Limit Groups Cause Surplus Miscalculation — Accepted risk *(GitHub #74)*

| Field | Value |
|-------|-------|
| **Repo** | nana-core-v6 |
| **File** | `src/JBFundAccessLimits.sol:85-148` (setFundAccessLimitsFor) |
| **Auditor confidence** | HIGH (code-verified) |
| **My confidence** | **Accepted — document constraint** |
| **Known issue?** | No |

**Description:** `setFundAccessLimitsFor` enforces currency ordering within a single `fundAccessLimitGroup` but has no check across groups for duplicate `(terminal, token)` pairs. Passing two groups with identical terminal/token creates duplicate entries via `.push()`. `_tokenSurplusFrom` double-counts the payout limits, understating surplus and reducing cash-out value. `payoutLimitOf` returns the first match, silently ignoring duplicates.

**Mitigating factors:** Only callable by the project's controller (`onlyControllerOf`). Self-inflicted misconfiguration — no cross-project attack vector. No fund theft — worst case is unexpected access limit behavior.

**Recommended fix:** Add a duplicate `(terminal, token)` check across groups, or document the constraint for frontends/deployers.

admin note: document the constraint for frontends/deployers.

**Resolution:** Accepted — Constraint documented in RISKS.md for frontends/deployers.

---

### ~~M-36. JBDistributor Zero totalStake Causes beginVesting Revert~~ — FIXED (`fda4e33`) *(GitHub #77)*

| Field | Value |
|-------|-------|
| **Repo** | nana-distributor-v6 |
| **File** | `src/JBDistributor.sol:315` (beginVesting → _vestTokenIds) |
| **Auditor confidence** | HIGH (code-verified) |
| **My confidence** | **HIGH — VERIFIED** |
| **Known issue?** | No |

**Description:** `beginVesting` does not guard against `totalStakeAmount == 0`. When a hook has been funded (`_balanceOf > 0`) but all staking power is zero (all NFTs burned or delegation removed), `_vestTokenIds` calls `mulDiv(distributable, _tokenStake(...), 0)` which reverts with a PRBMath division-by-zero panic. Funds are not lost but `beginVesting` is permanently bricked for that round.

**Inconsistency:** `collectVestedRewards` (line 357) correctly guards with `if (distributable > 0 && totalStakeAmount > 0)`. `beginVesting` is missing the equivalent guard.

**Recommended fix:** Add `if (totalStakeAmount == 0) revert JBDistributor_NoStakers();` at the top of `beginVesting`, or skip vesting when totalStake is zero (consistent with `collectVestedRewards`).

admin note: skip evsting when totalStake is zero.

**Resolution:** FIXED — `beginVesting` now returns early when `totalStakeAmount == 0`, carrying funds to the next round. Tested in `test/AuditFixes.t.sol`. 106 tests pass.

---

### M-37. Pay/Cash-Out Hooks Lack try-catch Isolation — Accepted risk *(GitHub #79)*

| Field | Value |
|-------|-------|
| **Repo** | nana-core-v6 |
| **File** | `src/JBMultiTerminal.sol:1466,1553` (_fulfillCashOutHookSpecificationsFor, _fulfillPayHookSpecificationsFor) |
| **Auditor confidence** | HIGH (code-verified) |
| **My confidence** | **Accepted — intentional** |
| **Known issue?** | By design |

**Description:** Pay hooks (`afterPayRecordedWith`) and cash-out hooks (`afterCashOutRecordedWith`) are called without try-catch. A single reverting hook blocks the entire payment or cash-out. This is inconsistent with payout splits, fee processing, and owner transfers — all of which use try-catch with DoS-prevention comments.

| Call Site | try-catch? |
|-----------|------------|
| Split payouts (`_processSplitWith`) | Yes |
| Fee processing (`executeProcessFee`) | Yes |
| Owner transfers (`executeTransferTo`) | Yes |
| Pay hooks (`afterPayRecordedWith`) | **No** |
| Cash-out hooks (`afterCashOutRecordedWith`) | **No** |

**Mitigating factors:** The hook address is set by the project's data hook (project-owner-configured), so the risk is primarily self-inflicted. A project cannot grief other projects since hooks are project-scoped. Transaction reverts are atomic — no stuck state.

**Recommended fix:** Wrap hook calls in try-catch with event emission on failure, matching the payout split pattern. Alternatively, document this as intentional (hook failure = transaction failure, letting the project owner decide their own risk).

admin note: document as intentional.

**Resolution:** Accepted — Hook failure = transaction failure is intentional. Projects control their own risk via hook selection. Documented in RISKS.md.

---

## Low

### L-1. Canonical Deployment Leaves Non-Native REV Fees Uncollectable

| Field | Value |
|-------|-------|
| **Repo** | revnet-core-v6 |
| **File** | `script/Deploy.s.sol` (getFeeProjectConfig) |
| **Auditor confidence** | 75 |
| **My confidence** | **65** |
| **Known issue?** | No |

**Description:** The deployment script only registers the fee revnet for the native token. Non-native borrows/cash-outs resolve `primaryTerminalOf(FEE_REVNET_ID, token)` to zero and silently skip the fee path.

**Mitigation:** Register the fee revnet for all expected ERC-20 tokens at deployment time.

Admin note: CONFIRMED NOT AN ISSUE — fee project uses a router terminal which handles routing non-native tokens to the correct underlying terminal. No fix needed.

---

### L-2. Constructor Accepts Unminted Project Ownership *(nemesis corroborates — rated HIGH)*

| Field | Value |
|-------|-------|
| **Repo** | nana-ownable-v6 |
| **File** | `src/JBOwnableOverrides.sol:57-87` (constructor) |
| **Auditor confidence** | 75 (Pashov) / HIGH (nemesis) |
| **My confidence** | **65** |
| **Known issue?** | No |

**Description:** Binding ownership to an unminted `initialProjectIdOwner` lets the first account that mints that sequential project ID become the effective owner. Nemesis confirmed with PoC: deploying with `initialOwner = address(0)` and `initialProjectIdOwner = N` (unminted) gives the first minter of project N full `onlyOwner` authority.

**Mitigation:** Validate that the project ID is already minted in the constructor, or document the deployment ordering requirement.

admin note: this is ok, make sure documented in the repo's RISKS.

*Re-confirmed by Nemesis pass 2 (20260421) — NM-001 rated HIGH with PoC at `test/CodexUnmintedProjectHijack.t.sol`. Also re-confirmed by Pashov pass 2 [75] "Future Project Prebinding Can Hand Ownership To The First Minter". Note severity disagreement: Nemesis rates HIGH, existing report rates LOW. The finding is real but requires non-atomic deployment, which is the documented prerequisite.*

---

### L-3. Discounted Credit Mints Retain Full-Price Cash-Out Weight

| Field | Value |
|-------|-------|
| **Repo** | nana-721-hook-v6 |
| **File** | `src/JB721TiersHook.sol` (_mintAndUpdateCredits) |
| **Auditor confidence** | 75 |
| **My confidence** | **65** |
| **Known issue?** | No |

**Description:** Credits can buy discounted tiers at the reduced price while cash-out math still uses the tier's full configured price, leaving residual credits after a full-price treasury reclaim.

**Mitigation:** Use the discounted price (or effective cost) for cash-out weight calculation when a discount was applied at mint time.

admin note: this is ok since discounted price can change, make sure to document in the repo's RISKS, project owners should know what they're doing.

---

### L-4. ~~Zero-Balance Rounds Front-Run Into Vesting Lockout~~ *(nemesis corroborates)* — FIXED (`9918cd6`)

| Field | Value |
|-------|-------|
| **Repo** | nana-distributor-v6 |
| **File** | `src/JBDistributor.sol` (beginVesting) |
| **Auditor confidence** | 75 (Pashov) / MEDIUM (nemesis) |
| **My confidence** | **75 — confirmed by nemesis PoC** |
| **Known issue?** | No |

**Description:** When a round starts with 0 distributable balance, `beginVesting` records zero-amount vesting entries. The same tokenId later reverts with `JBDistributor_AlreadyVesting()` after funds arrive, locking that tokenId out of the round. Nemesis confirmed: `_takeSnapshotOf()` treats zero-balance snapshots as absent, but `_vestTokenIds()` still writes irreversible vesting entries.

**Mitigation:** Reject `beginVesting` when `distributableBalance == 0`, or allow re-vesting when the prior entry has zero amount.

admin note: fix, make sure well tested.

---

### L-5. CroptopDeployer Scripts Cannot Bootstrap Fee Project *(nemesis)*

| Field | Value |
|-------|-------|
| **Repo** | croptop-core-v6 |
| **File** | `script/Deploy.s.sol` |
| **Auditor confidence** | LOW (nemesis verified) |
| **My confidence** | **20 — not actionable** |
| **Known issue?** | No |

**Description:** The deployment script assumes the fee project (project #1) already exists and is configured. If running the croptop deployer standalone before the fee project is set up, the script has no bootstrap path and silently misconfigures or fails.

**Mitigation:** Add a fee-project existence check in the script, or document the deployment ordering dependency.

admin note: it can safely assume fee project exists.

---

### L-6. ~~Fallback Tick Reconstruction Not Re-Clamped After Emergency Path~~ *(lead investigation — promotes Lead 3)* — FIXED (`a3e5e4a`)

| Field | Value |
|-------|-------|
| **Repo** | univ4-lp-split-hook-v6 |
| **File** | `src/JBUniswapV4LPSplitHook.sol:1223-1235` |
| **Auditor confidence** | Lead (promoted after investigation) |
| **My confidence** | **45** |
| **Known issue?** | Flagged as lead |

**Description:** When the primary tick calculation in `_mintLiquidity` reverts (out-of-range pool state), the fallback path computes ticks from `slot0.sqrtPriceX96` but does not re-clamp them to the valid TickMath range (`[-887272, 887272]`). For extreme pricing at the edges of tick space (~0.015% of total range), the resulting ticks could exceed `TickMath.MAX_TICK`, causing the Uniswap `pool.mint()` call to revert. This is DoS only — no fund loss, and only affects split hook operations during extreme market conditions.

**Mitigation:** Add `tick = bound(tick, TickMath.MIN_TICK, TickMath.MAX_TICK)` after the fallback tick computation.

---

### L-7. ~~`mapToken(s)` Can Permanently Retain Unrelated ETH~~ *(Nemesis pass 2)* — FIXED (`d8018a4`)

| Field | Value |
|-------|-------|
| **Repo** | nana-suckers-v6 |
| **File** | `src/JBSucker.sol:427-449` |
| **Auditor confidence** | LOW (nemesis verified) |
| **My confidence** | **pending** |
| **Known issue?** | No |

**Description:** `mapToken` and `mapTokens` are `payable` and accept `msg.value` as `transportPaymentValue`, but only the disable-with-unsent-claims branch in `_mapToken` actually consumes it via `_sendRoot`. When enabling or updating mappings, the ETH is silently retained in the sucker's balance with no refund path. The trapped ETH becomes part of `amountToAddToBalanceOf(NATIVE_TOKEN)`, effectively donating caller funds to the project.

**Mitigation:** Revert on unexpected `msg.value` when the transport payment path won't be taken:
```solidity
if (!needsTransportPayment && msg.value != 0) revert JBSucker_UnexpectedMsgValue(msg.value);
```

---

### L-8. ~~`SuckerDeploymentLib` Omits Sepolia L1 Deployers~~ *(Nemesis pass 2)* — FIXED (`000267b`)

| Field | Value |
|-------|-------|
| **Repo** | nana-suckers-v6 |
| **File** | `script/helpers/SuckerDeploymentLib.sol:54-75` |
| **Auditor confidence** | LOW (nemesis verified) |
| **My confidence** | **pending** |
| **Known issue?** | No |

**Description:** The deployment helper checks `_isMainnet` to decide whether to populate L1 deployer handles, but the classification checks for `"sepolia"` while the deployment stack uses `"ethereum_sepolia"` as the network name. Sepolia L1 workflows get `getDeployment` calls that return zero deployer addresses, causing mishandled L1 deployment state.

**Mitigation:** Include Sepolia in the L1 classification:
```solidity
bool _isMainnet = _network == keccak256("ethereum") || _network == keccak256("ethereum_sepolia");
```

---

### ~~L-9. Banny Resolver Metadata Not Re-Initialized on Deployment Resume~~ — FIXED (`4f1eda2`) *(promotes Lead 38)*

| Field | Value |
|-------|-------|
| **Repo** | deploy-all-v6 (banny-retail-v6 integration) |
| **File** | `script/Deploy.s.sol` / `script/Resume.s.sol` |
| **Auditor confidence** | 90 (Pashov) |
| **My confidence** | **85 — VERIFIED** |
| **Known issue?** | No |

**Description:** When `Deploy.s.sol` is interrupted after creating the `Banny721TokenUriResolver` but before calling `setMetadata(...)`, the `Resume.s.sol` script does not re-invoke the metadata initialization. The resolver is deployed but returns empty/default metadata for all token URIs, breaking NFT display for the entire collection until manually repaired.

**Mitigation:** Add metadata re-initialization to the Resume script's Banny recovery path, mirroring the Deploy script's post-creation flow.

admin note: fix if there are no tradeoffs.

**Resolution:** FIXED — Added `svgDescription()` length check in `Resume.s.sol` to re-initialize metadata when resolver was deployed but `setMetadata` was interrupted.

---

### ~~L-10. Mainnet Oracle Provenance Verification Compares Wrapper to Raw Aggregator~~ — FIXED (`4f1eda2`) *(promotes Lead 39)*

| Field | Value |
|-------|-------|
| **Repo** | deploy-all-v6 |
| **File** | `script/Verify.s.sol` |
| **Auditor confidence** | 90 (Pashov) |
| **My confidence** | **85 — VERIFIED** |
| **Known issue?** | No |

**Description:** `Verify.s.sol` reads the on-chain `priceFeedFor(...)` return value (a `JBChainlinkV3PriceFeed` wrapper contract) and compares it directly against the raw Chainlink aggregator address (e.g., `0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419`). Since the wrapper is a different contract than the aggregator, the comparison always fails, causing the verification script to report a false negative. This masks real feed drift if the check is ever relied upon for operational safety.

**Mitigation:** Compare the wrapper's inner `FEED` address against the expected aggregator, not the wrapper address itself:
```solidity
IJBChainlinkV3PriceFeed wrapper = IJBChainlinkV3PriceFeed(address(prices.priceFeedFor(...)));
require(address(wrapper.FEED()) == EXPECTED_AGGREGATOR, "Feed drift detected");
```

admin note: make sure you're confident in the finding. if so, fix.

**Resolution:** FIXED — Dereferences through `JBChainlinkV3PriceFeed(address(feed)).FEED()` to compare the inner aggregator address, not the wrapper. Uses try/catch for graceful fallback.

---

### ~~L-11. Empty Claim Arrays Freeze Round Snapshot Early~~ — FIXED (`fda4e33`) *(pass 3 pashov)*

| Field | Value |
|-------|-------|
| **Repo** | nana-distributor-v6 |
| **File** | `src/JBDistributor.sol` (beginVesting / collectVestedRewards) |
| **Auditor confidence** | 75 |
| **My confidence** | **pending** |
| **Known issue?** | No |

**Description:** Both `beginVesting` and `collectVestedRewards` accept empty `tokenIds` arrays. Any caller can lock the round snapshot before later same-round funding arrives, shifting that funding into a future round with different stake ownership.

**Recommended fix:** Require `tokenIds.length > 0` in both `beginVesting` and `collectVestedRewards`:
```solidity
if (tokenIds.length == 0) revert JBDistributor_EmptyTokenIds();
```

admin note: ok, fix. make sure well tested.

**Resolution:** FIXED — Both `beginVesting` and `collectVestedRewards` now revert with `JBDistributor_EmptyTokenIds()` when passed empty arrays. Tested in `test/AuditFixes.t.sol`. 106 tests pass.

---

### L-12. REVLoans totalCollateralOf CEI Violation *(GitHub #56)*

| Field | Value |
|-------|-------|
| **Repo** | revnet-core-v6 |
| **File** | `src/REVLoans.sol:1141-1213` (_adjust), `src/REVLoans.sol:1036-1041` (_addCollateralTo) |
| **Auditor confidence** | HIGH (code-verified) |
| **My confidence** | **HIGH — VERIFIED, documented known issue** |
| **Known issue?** | Yes — documented inline at lines 1128-1132 |

**Description:** In `_adjust`, individual loan state (`loan.amount`, `loan.collateral`) is written before external calls (correct CEI). But `totalCollateralOf[revnetId]` is only incremented inside `_addCollateralTo`, which executes AFTER `_addTo` makes external calls via `useAllowanceOf` → fee payment → pay hooks. A reentrant `borrowFrom` during those calls would see a lower `totalCollateralOf`, computing a higher borrowable amount per collateral unit.

The inline comment documents this precisely:
> "CEI ordering note: `totalCollateralOf` is not incremented until `_addCollateralTo` executes... Practically infeasible — requires an adversarial pay hook on the revnet's own terminal..."

**Why LOW:** Requires control of a pay hook on the REV project terminal or the revnet's terminal — effectively trust-level access. Neither REV project #1 nor a correctly-deployed revnet would have such a hook. No ReentrancyGuard exists, but the precondition is unrealistic.

**Recommended fix:** Document in RISKS.md. Optionally add ReentrancyGuard to `borrowFrom`.

admin note: ok, skip, unless we have a clean way to reorganize the fn calls. i do not want to add ReentrencyGuard.

**Resolution:** Accepted — Documented in RISKS.md. No clean reorganization available without ReentrancyGuard.

---

### L-13. ERC-2771 Trusted Forwarder Architectural Trust Boundary — Accepted risk *(GitHub #57)*

| Field | Value |
|-------|-------|
| **Repo** | nana-core-v6 |
| **File** | `src/JBPermissions.sol:52,74` (constructor, setPermissionsFor), `src/JBController.sol:152,1282-1284` |
| **Auditor confidence** | HIGH (code-verified) |
| **My confidence** | **Accepted — not exploitable as deployed** |
| **Known issue?** | Accepted design (ERC-2771 trust model) |

**Description:** `JBPermissions` and `JBController` inherit `ERC2771Context` and use `_msgSender()` for all identity checks. If a trusted forwarder is compromised, it could spoof any `msg.sender` for permission operations, enabling ecosystem-wide takeover.

**Why LOW (not HIGH):** The deployed forwarder is OpenZeppelin's `ERC2771Forwarder` (v5.6.0) which:
- Is not upgradeable and has no owner/admin functions
- Enforces EIP-712 signature verification before forwarding (recovers signer, checks `recovered == request.from`)
- Cannot spoof arbitrary addresses without the target's private key signature
- Address is immutable in `ERC2771Context` — cannot be replaced

The attack requires compromising the OZ ERC2771Forwarder contract itself, which has no known path.

**Recommended fix:** Document the ERC-2771 trust assumption in RISKS.md. No code change needed.

admin note: document the trust assumption in RISKS.md.

**Resolution:** Accepted — Trust assumption documented in RISKS.md.

---

### L-14. TWAP Warmup Spot-Price Fallback Window — Accepted risk *(GitHub #59)*

| Field | Value |
|-------|-------|
| **Repo** | univ4-router-v6 |
| **File** | `src/JBUniswapV4Hook.sol:384-392` (estimateUniswapOutput), `src/JBUniswapV4Hook.sol:884-931` (_getTWAPSqrtPrice) |
| **Auditor confidence** | HIGH (code-verified) |
| **My confidence** | **Accepted — bounded startup condition** |
| **Known issue?** | Documented in code comment |

**Description:** When the TWAP oracle has insufficient history (newly created pools), `_getTWAPSqrtPrice` returns 0 and `estimateUniswapOutput` falls back to the manipulable spot price (`getSlot0`). During the first ~30 minutes of a pool's life, a manipulator can inflate the spot price to make V4 appear more attractive, causing suboptimal routing.

Code comment documents this:
> "NOTE: Spot price is used as a fallback for newly created pools that lack sufficient TWAP history. In this state, the estimate is susceptible to spot-price manipulation."

**Mitigating factors:** Window is bounded (~30 min), slippage protection (`amountOutMin`) prevents worst-case execution, documented in code.

**Recommended fix:** Document in RISKS.md. Consider rejecting the V4 path entirely when TWAP is unavailable.

admin note: documment in RISKS.

**Resolution:** Accepted — Documented in RISKS.md.

---

### L-15. Failed Split Payouts Consume Payout Limit Permanently — Accepted risk *(GitHub #64)*

| Field | Value |
|-------|-------|
| **Repo** | nana-core-v6 |
| **File** | `src/libraries/JBPayoutSplitGroupLib.sol:136-159` |
| **Auditor confidence** | HIGH (code-verified) |
| **My confidence** | **Accepted — deliberate design** |
| **Known issue?** | Yes — documented in code comment |

**Description:** When a split payout fails via try-catch, `recordPayoutFor` has already consumed the payout limit and `recordAddedBalanceFor` restores the funds, but `usedPayoutLimitOf` is not decremented. The payout limit is permanently consumed even though no funds left the project.

The code explicitly documents this as intentional:
> "Failed split payouts consume the payout limit by design. The try-catch prevents a single split from DoS-ing the entire payout."

**Why LOW:** Funds are never lost (`recordAddedBalanceFor` restores balance). The project recovers in the next ruleset cycle. The design prevents DoS against the overall payout flow.

**Recommended fix:** Document in RISKS.md. No code change — this is a deliberate design choice.

admin note: Document in RISKS, this is deliberate.

**Resolution:** Accepted — Documented in RISKS.md.

---

### ~~L-16. Chainlink Staleness Threshold Configuration Risk~~ — Skipped *(GitHub #66)*

| Field | Value |
|-------|-------|
| **Repo** | nana-core-v6 |
| **File** | `src/JBChainlinkV3PriceFeed.sol:29-65`, `src/JBPrices.sol:118-144` |
| **Auditor confidence** | HIGH (code-verified) |
| **My confidence** | **Skipped — deployment-time concern only** |
| **Known issue?** | Partially — documented design constraint |

**Description:** `JBChainlinkV3PriceFeed` accepts a `THRESHOLD` in the constructor with no bounds check — it can be set to `type(uint256).max` (effectively disabled) or to a generous value (days/weeks). A misconfigured threshold accepts stale prices. Since feeds are immutable in `JBPrices` (cannot be replaced once set), a misconfigured threshold is permanent.

**Additional safety checks still active:** `updatedAt == 0` (incomplete round), `answeredInRound < roundId` (stale round), `price <= 0` (invalid price) — these catch some pathological cases regardless of threshold.

**Recommended fix:** Add an upper-bound sanity check on `THRESHOLD` in the constructor (e.g., `require(threshold <= 3 hours)`). Document the deployment risk in RISKS.md.

admin note: nah, skip.

**Resolution:** Skipped per admin.

---

### ~~L-17. REVOwner.supportsInterface Omits IERC165~~ — FIXED (`063f914`) *(GitHub #80)*

| Field | Value |
|-------|-------|
| **Repo** | revnet-core-v6 |
| **File** | `src/REVOwner.sol:460-462` |
| **Auditor confidence** | HIGH (code-verified) |
| **My confidence** | **HIGH — VERIFIED** |
| **Known issue?** | No |

**Description:** `REVOwner.supportsInterface` checks for `IJBRulesetDataHook` and `IJBCashOutHook` interface IDs but omits the mandatory `IERC165.interfaceId` (`0x01ffc9a7`). Per ERC-165 spec, any contract implementing `supportsInterface` MUST return `true` for `0x01ffc9a7`.

**Recommended fix:** One-liner:
```solidity
return interfaceId == type(IERC165).interfaceId
    || interfaceId == type(IJBRulesetDataHook).interfaceId
    || interfaceId == type(IJBCashOutHook).interfaceId;
```

admin note: fix it if the contract does in fact use IERC165

**Resolution:** FIXED — Added `type(IERC165).interfaceId` check. REVOwner declares `supportsInterface` as an override of IERC165, so per the ERC-165 spec it must return `true` for `0x01ffc9a7`. 4 new tests in `test/audit/AuditFixL17Test.t.sol`. 269 tests pass.

---

## Leads

### Pass 1 Leads (All Investigated)

These are high-signal vulnerability trails from initial analysis. All 25 leads have now been investigated. 17 were promoted to numbered findings. Remaining 8 are resolved as FP, informational, or accepted risk.

| # | Repo | Lead | Risk Surface | Status |
|---|------|------|--------------|--------|
| 1 | nana-core-v6 | Non-ETH chain deployment installs incorrect native/ETH oracle assumptions | Deployment script | Informational — script guards against non-ETH chains, inline warnings present |
| 2 | univ4-lp-split-hook-v6 | Sphinx reruns may bypass deploy script existence check | Deployment | FP — EVM CREATE2 prevents duplicate deployments |
| 3 | univ4-lp-split-hook-v6 | Fallback tick reconstruction not re-clamped after emergency path | Edge-state revert | **PROMOTED → L-6** |
| 4 | revnet-core-v6 | Registered phantom terminal can inflate borrow capacity | Privileged config | **PROMOTED → H-8** |
| 5 | nana-router-terminal-v6 | Nested forwarders lose root payer breadcrumb | Multi-hop refunds | LOW — requires non-canonical multi-hop topology |
| 6 | nana-721-hook-v6 | Retroactive default reserve beneficiary rebinding | Owner-gated economics change | **PROMOTED → M-10** |
| 7 | nana-721-hook-v6 | Split fallback double-failure strands funds in hook | Stuck funds | FP — revert is atomic, whole pay() transaction reverts, no funds stuck |
| 8 | univ4-router-v6 | 32-bit currency ID truncation misquotes helper output | Vanity token collision | FP (for fund loss) — truncation in view helper only, not on value-moving path |
| 9 | nana-buyback-hook-v6 | Fee-on-transfer output tokens break swap settlement | Liveness failure | **PROMOTED → M-12** |
| 10 | nana-suckers-v6 | Deterministic peer assumption is deployment-topology-sensitive | Cross-chain wiring | Informational — documented design constraint (CREATE2 same-address) |
| 11 | nana-suckers-v6 | Destination-side controller/terminal wiring is hard liveness dependency | Claim finalization | Informational — documented known limitation |
| 12 | nana-suckers-v6 | Zero-output inbound swap finalizes zero-backed batch | Dust-amount bridge | LOW — explicitly handled in code, stores localTotal:0 to prevent worse bug |
| 13 | defifa | Concurrent project count race can revert launches | Tx-level liveness | LOW — safe revert, documented pattern |
| 14 | croptop-core-v6 | Native/ETH currency mismatch on fresh deployments | Feed integration | **PROMOTED → M-13** |
| 15 | croptop-core-v6 | Post-launch sucker deployment helper re-authorizes wrong caller | Permission mismatch | Related to M-15 |
| 16 | croptop-core-v6 | Receiver-dependent ownership bootstrapping can be skipped | Misconfiguration | LOW — user misconfiguration, no fund loss |
| 17 | banny-retail-v6 | Fallback-resolver balance suppresses whole-tier migration verification | Migration safety | **PROMOTED → M-22** (nemesis confirmed with PoC) |
| 18 | nana-omnichain-deployers-v6 | Ruleset ID prediction can temporarily block wrapper queueing | Availability | LOW/Informational — intentional safety revert, 1-block availability gap |
| 19 | nana-fee-project-deployer-v6 | Deployment artifact trust can silently miswire the fee project | Operational | Related to H-10 |
| 20 | nana-fee-project-deployer-v6 | Terminal routing remains mutable after deployment | Governance risk | Related to H-10 |
| 21 | deploy-all-v6 | Tempo deploy/resume/verify logic diverges | Unrecoverable deployment | **PROMOTED → H-11, M-18** |
| 22 | deploy-all-v6 | Tempo Moderato USDC feed placeholder can brick deployment | address(0) | **PROMOTED → M-20** |
| 23 | deploy-all-v6 | Defifa metadata on Tempo depends on zero typeface | tokenURI reverts | **PROMOTED → M-19** |
| 24 | nana-distributor-v6 | Controller pre-send accounting can over-credit deflationary tokens | Phantom rewards | **PROMOTED → M-17** |
| 25 | nana-distributor-v6 | 721 round allocation based on live supply, not claimed round boundary | Reward capture | **PROMOTED → H-12** |

*All leads investigated. 17 promoted, 4 FP, 4 informational/low.*

---

### Pass 2 Leads (20260421)

New leads from the second audit pass. All 14 investigated. 4 promoted to findings (H-15, M-26, L-9, L-10), 1 fixed (Lead 32), 3 informational, 6 corroborate existing findings.

| # | Repo | Lead | Risk Surface | Verdict |
|---|------|------|--------------|---------|
| 26 | revnet-core-v6 | External accounting surfaces can skew borrowability and reclaim math | Surplus trust | Corroborates H-8 — accepted risk, privileged configuration |
| 27 | nana-buyback-hook-v6 | Fee-on-transfer tokens can break sell-side buyback cash-outs | Liveness | Corroborates M-12 — should be fixed via M-12 fix |
| 28 | nana-721-hook-v6 | Tier-count gas ceiling can degrade cash-out and balance liveness | Gas DoS | Informational — documented in RISKS.md §4, gas tests confirm 30 tiers = 11M gas. Recommend practical tier cap in documentation. |
| 29 | nana-router-terminal-v6 | Credit cashout preferred-token short-circuit spends stray balances | Stuck funds | **PROMOTED → M-26** |
| 30 | nana-suckers-v6 | CCIP native-token mapping can encode a token the receiver never unwraps | Bridge lockup | **PROMOTED → H-15** |
| 31 | nana-suckers-v6 | OR-based deployer configuration checks can finalize broken bridge singletons | Deployment | Corroborates M-25 |
| 32 | banny-retail-v6 | Removed retained outfits can collide on synthetic category 0 and brick redecorations | Lifecycle trap | **FIXED** — commit a73734c added post-sort duplicate-category validation |
| 33 | defifa | Launch-time validation gaps permit unfinishable games (1 tier + no timeout) | Fund lockup | Corroborates M-21 |
| 34 | defifa | Predicted game ID can be mempool-griefed during launch | Tx-level liveness | Corroborates Lead 13 — same pattern, safe revert |
| 35 | univ4-lp-split-hook-v6 | Out-of-band pre-initialized pool prices accepted without validation | Price manipulation | Informational — valid but mitigated by design (code comments note pre-initialization path), RISKS.md §7.4 inaccurately claims validation exists |
| 36 | univ4-router-v6 | Preview failure forces conservative but worse sell routing | Routing quality | Informational — documented intentional behavior, `amountOutMin` protects against worse execution |
| 37 | deploy-all-v6 | Tempo chain support internally inconsistent across deploy/resume/verify | Deployment | Corroborates H-11, M-18 — **Resume.s.sol still missing Tempo branches, prior fix may be incomplete** |
| 38 | deploy-all-v6 | Banny resolver metadata handoff not repaired on resume | Deployment | **PROMOTED → L-9** |
| 39 | deploy-all-v6 | Mainnet oracle provenance verification compares wrapper slot to raw aggregator | Verification | **PROMOTED → L-10** |

---

### Pass 3 Leads (20260421-130747 / 20260421-130750)

New leads from the third audit pass. Pending full investigation.

| # | Repo | Lead | Risk Surface | Verdict |
|---|------|------|--------------|---------|
| 40 | nana-router-terminal-v6 | Credit-cashout registry pre-accepts ERC20 input that the router never consumes | Fund trapping | Pending |
| 41 | nana-router-terminal-v6 | Forwarding detection suppresses final-hop receipt checks for privileged terminal configs | Receipt bypass | Pending |
| 42 | nana-router-terminal-v6 | Deployed registry default can become circular if directory resolves back to registry | Routing DoS | Corroborates Pashov finding on default topology |
| 43 | univ4-lp-split-hook-v6 | Attacker-seeded pool price accepted during first deployment | Price manipulation | Corroborates Lead 35 |
| 44 | univ4-lp-split-hook-v6 | Narrow zero-cashout tick fallback lacks boundary clamping | Edge-state revert | Pending |
| 45 | nana-buyback-hook-v6 | Fee-on-transfer tokens can break sell-side buyback cash-outs | Liveness | Corroborates M-12 / Lead 27 |
| 46 | nana-suckers-v6 | CCIP native-token mapping encodes token the receiver never unwraps | Bridge lockup | Corroborates H-15 |
| 47 | nana-suckers-v6 | OR-based deployer configuration checks can finalize broken bridge singletons | Deployment | Corroborates M-25 |
| 48 | revnet-core-v6 | External accounting surfaces can skew borrowability and reclaim math | Surplus trust | Corroborates H-8 |
| 49 | croptop-core-v6 | Deploy-time handoff to CTProjectOwner skips permission-grant callback | Permission gap | Pending |
| 50 | nana-distributor-v6 | Elastic-supply reward tokens desynchronize accounting | Phantom rewards | Pending |
| 51 | nana-distributor-v6 | Blacklistable reward tokens can stall beneficiary claims | DoS | Pending |
| 52 | nana-fee-project-deployer-v6 | Skip-on-controller can mask unintended project #1 rollout | Deployment | Pending |
| 53 | deploy-all-v6 | Tempo chain support inconsistent across deploy/resume/verify | Deployment | Corroborates H-11/M-18/Lead 37 |

---

### Pass 3 Corroborations

Pass 3 independently re-discovered 7 findings from passes 1-2:

| Source | Repo | Corroborates |
|--------|------|-------------|
| Pashov pass 3 | nana-buyback-hook-v6 | C-3 (cashout fallback zeros surplus) |
| Pashov pass 3 | univ4-lp-split-hook-v6 | H-2 (permissionless LP deployment) |
| Pashov pass 3 | nana-distributor-v6 | H-12 (721 distributor live state allocation) |
| Pashov pass 3 | nana-suckers-v6 | H-13 (out-of-order root delivery) |
| Pashov pass 3 | nana-suckers-v6 | H-14 (unsynchronized deprecation blackholes) |
| Pashov pass 3 | croptop-core-v6 | M-24 (empty-post metadata shadowing) |
| Pashov pass 3 | nana-ownable-v6 | L-2 (future project prebinding) |

---

## Cross-Reference With Per-Repo RISKS.md

Known issues and accepted risks belong in each repo's `RISKS.md` file. This report's findings were checked against those files. Relevant matches:

- **C-1, C-2, H-3:** Fall under the cross-boundary pricing risk category documented in the top-level `RISKS.md`
- **M-2:** Falls under the deployment/project-ID drift risk documented in the top-level `RISKS.md`
- **H-7, L-2, L-3:** Accepted risks — should be documented in their respective repo RISKS.md files if not already
- **H-2, H-4, H-9:** Downgraded after verification (H-2: project-approved tokens only, H-4: permissions follow ownership, H-9: no payout limits exist)
- **M-8, M-9, M-11, M-13:** Downgraded to informational/FP (M-8: downstream self-corrects, M-9: self-inflicted DoS, M-11: already mitigated by amountOutMin, M-13: baseCurrency=1 is by design)
- **M-7:** Downgraded to LOW — residual recoverable, fix has fee-avoidance tradeoff
- **H-8, M-10, M-15:** Accepted risks / expected behavior — document in RISKS.md / USER_JOURNEYS
- **H-10, M-16:** Fee-project deployer script issues — operational, not on-chain
- **H-11, M-3, M-18, M-19, M-20:** Tempo-specific — not yet deployed, time to fix before launch. Lead 37 indicates Resume.s.sol fix for H-11 may be incomplete.
- **H-15:** CCIP native-token mapping — bridge-specific, requires CCIP sucker fix before deployment
- **M-21:** Defifa governance config — reject one-tier games at launch
- **M-22:** Banny migration helper — deployment/migration integrity, not live runtime
- **M-26:** Router terminal credit cashout — conditional on stray balance, low likelihood but real
- **L-6:** Edge-case DoS in LP split hook fallback path — easy fix, low urgency
- **L-9, L-10:** Deploy-all-v6 script issues — operational, fix before next deployment run
- **H-16:** Defifa ERC-20 currency mismatch — game launch configuration validation needed
- **H-17:** Buyback hook registry default — mutable global trust anchor for unlocked projects
- **H-18:** CCIP swap zero-output — cross-chain solvency, requires gating unbacked claims
- **H-19:** Deprecated sucker removal — downstream aggregate views lose chain data
- **H-20:** Address registry provenance — informational infrastructure integrity, front-running risk
- **H-21:** V4 router price impact — routing quality degradation for large trades
- **H-22:** Distributor ERC20 prepaid path — split funds permanently stranded
- **M-27:** Buyback hook sell-side fee bypass — protocol fee revenue loss
- **M-28:** Croptop deploySuckersFor — post-launch helper broken, workaround exists (direct registry call)
- **M-29:** Croptop baseCurrency identity feed — operational deployment dependency, re-opens H-9/M-13
- **M-30:** Router terminal preview divergence — routing quality for cashout source paths
- **M-31:** LP split hook nonce desync — provenance misregistration after mixed deploys
- **M-32:** Deploy-all-v6 project ID squatting — operational, partial deployment griefing
- **L-11:** Distributor empty claim arrays — early round snapshot locking
- **H-23:** Buyback hook sell-side swap failure — cash-out DoS when pool reverts (GitHub #75)
- **M-33:** Cross-chain surplus staleness — bonding curve inflation, mitigated by local surplus cap (GitHub #53)
- **M-34:** OMNICHAIN_RULESET_OPERATOR bypass — documented trust boundary, projects should use approval hooks (GitHub #61)
- **M-35:** Duplicate fund access limit groups — self-inflicted surplus miscalculation (GitHub #74)
- **M-36:** JBDistributor zero totalStake — beginVesting reverts, inconsistent with collectVestedRewards guard (GitHub #77)
- **M-37:** Pay/cash-out hooks no try-catch — inconsistent with payout splits pattern, self-inflicted DoS (GitHub #79)
- **L-12:** REVLoans CEI violation — documented known issue, unrealistic precondition (GitHub #56)
- **L-13:** ERC-2771 forwarder trust boundary — not exploitable with OZ v5.6.0 (GitHub #57)
- **L-14:** TWAP warmup spot-price fallback — bounded 30-min window, documented (GitHub #59)
- **L-15:** Failed split payout limit consumption — intentional design, documented (GitHub #64)
- **L-16:** Chainlink staleness threshold — deployment-time configuration risk (GitHub #66)
- **L-17:** REVOwner.supportsInterface — ERC-165 spec violation, one-liner fix (GitHub #80)
- **H-24:** ~~Router terminal credit theft — FIXED: use `sender` directly as holder instead of `_resolveOriginalPayer(sender)`. Credit-cashout only works via direct calls, documented in RISKS.md §8.7~~
- **H-25:** ~~Distributor snapshot manipulation — FIXED: eagerly lock next-round snapshot block at round boundary~~
- **H-26:** ~~Distributor post-snapshot NFT overbooking — FIXED: per-owner voting power cap deducted across tokenIds~~
- **M-38:** LP split hook pre-initialized pool price — ACCEPTED BY DESIGN: arbitrageurs naturally correct out-of-range prices. Reverting would create a deployment-blocking DoS vector. Documented in RISKS.md §7.4.
- **L-18:** ~~Project payer `tx.origin` fallback — FIXED: replaced `tx.origin` with `msg.sender`~~
- **L-19:** ~~Project payer deploy script lacks directory validation — FIXED: added `code.length != 0` validation~~
- **M-39:** ~~ROOT permission bypasses `permissionId=0` — FIXED: bypass permission system entirely when `permissionId == 0`, requiring direct owner match~~
- **M-40:** ~~Deployment helper accepts non-contract registry addresses — FIXED: added `code.length != 0` validation in deployment helper~~

---

## Repos With No Findings (Passes 1-2)

- ~~nana-address-registry-v6 (nemesis: all false positives)~~ — Pass 3 found H-20
- nana-project-handles-v6 (nemesis: all false positives)
- nana-permission-ids-v6 (nemesis: no findings, pass 3 confirmed)
- ~~nana-suckers-v6 (nemesis: all false positives)~~ — Pass 3 found H-18, H-19

## Nemesis Duplicates (Corroborate Existing Pashov Findings)

The following nemesis findings confirmed existing Pashov findings (not added as separate entries):

| Nemesis ID | Repo | Corroborates |
|------------|------|-------------|
| univ4-lp-split-hook-v6 NM-001 | univ4-lp-split-hook-v6 | H-2 |
| revnet-core-v6 NM-002 | revnet-core-v6 | H-3 |
| nana-721-hook-v6 NM-001 | nana-721-hook-v6 | H-7 |
| nana-buyback-hook-v6 NM-001 | nana-buyback-hook-v6 | M-5 |
| defifa NM-001 | defifa | H-5 |
| nana-ownable-v6 NM-001 | nana-ownable-v6 | L-2 (nemesis rates HIGH) |
| nana-distributor-v6 NM-003 | nana-distributor-v6 | L-4 (nemesis rates MEDIUM) |

---

## Pass 4 Findings (20260421-203404 / 20260421-203407)

Source: Nemesis Auditor (Codex) run `20260421-203404` + Pashov Solidity Auditor (Codex) run `20260421-203407`. All findings verified against current source code.

### ~~H-24. Spoofed `originalPayer()` Enables Delegated Credit Theft *(pass 4 pashov + nemesis)* — FIXED~~

| Field | Value |
|-------|-------|
| **Repo** | nana-router-terminal-v6 |
| **File** | `src/JBRouterTerminal.sol:725-733,1042-1066` |
| **Auditor confidence** | 90 |
| **My confidence** | **95 — VERIFIED (test suite confirms)** |
| **Known issue?** | Partially acknowledged in RISKS.md §3, §8.2 but mischaracterized |
| **Status** | **FIXED** — `holder = sender` instead of `_resolveOriginalPayer(sender)`. Credit-cashout now only works via direct calls. Documented in RISKS.md §8.7. |

**Description:** `_resolveOriginalPayer()` calls `IJBPayerTracker(msg.sender).originalPayer()` on **any** contract-type caller without verifying `msg.sender` is a trusted registry. Any contract implementing `IJBPayerTracker` can return a victim's address as the "original payer." The router then calls `controller.transferCreditsFrom(victim, ...)` — which succeeds because the victim previously granted the router `TRANSFER_CREDITS` permission (required for normal credit-cashout usage). The victim's credits are cashed out and proceeds routed to the attacker's chosen destination.

The test file `test/RouterTerminalCreditCashout.t.sol:409-486` contains `test_creditCashout_usesTrackedOriginalPayerAsHolder` which explicitly demonstrates the spoofing vector with a `CreditCashoutSpoofingIntermediary` contract.

RISKS.md §8.2 states "the caller already supplied the funds being routed" but this is incorrect for the credit-cashout path: `msg.value` must be 0 (enforced at line 1051), and no ERC-20 transfer occurs — the "funds" are entirely the victim's credits.

**Mitigation:** Only resolve `originalPayer()` when `msg.sender` is the trusted `JBRouterTerminalRegistry` contract, or require the victim to sign an authorization for each credit-cashout operation.

**Resolution:** Used `holder = sender` (the direct `_msgSender()`) for the credit-cashout path instead of resolving via `_resolveOriginalPayer()`. This means credit-cashout only works when calling the router terminal directly, not through the registry. The tradeoff (no registry-mediated credit-cashout) is documented in RISKS.md §8.7.

---

### ~~H-25. Distributor Snapshot Block Manipulable by First Round Caller *(pass 4 pashov)* — FIXED~~

| Field | Value |
|-------|-------|
| **Repo** | nana-distributor-v6 |
| **File** | `src/JBDistributor.sol:395-399` |
| **Auditor confidence** | 90 |
| **My confidence** | **88 — VERIFIED** |
| **Known issue?** | No |
| **Status** | **FIXED** — eagerly lock next-round snapshot block at round boundary |

**Description:** `_ensureSnapshotBlock(round)` sets `roundSnapshotBlock[round] = block.number - 1` on the first call for a given round. This function is called from three permissionless entry points: `beginVesting()`, `collectVestedRewards()`, and `poke()`. An attacker who temporarily borrows tokens and delegates voting power in block N can be the first to call `poke()` or `beginVesting()` in block N+1, locking the snapshot to block N where they had inflated voting power. The `poke()` keeper function offers partial mitigation but cannot prevent front-running.

This is distinct from H-12 (which was about `_tokenStake` using live state instead of snapshot state). H-12 was fixed in `9918cd6`, but this vector (controlling which block IS the snapshot) remains open.

**Mitigation:** Preset the snapshot block at round boundaries rather than auto-assigning on first interaction, or use a commit-reveal scheme for snapshot selection.

**Resolution:** Snapshot block for the next round is now eagerly locked at round boundary time, preventing first-caller manipulation.

---

### ~~H-26. Post-Snapshot NFT Mints Can Overbook Distribution Rounds *(pass 4 pashov)* — FIXED~~

| Field | Value |
|-------|-------|
| **Repo** | nana-distributor-v6 |
| **File** | `src/JB721Distributor.sol:153-170` |
| **Auditor confidence** | 90 |
| **My confidence** | **90 — VERIFIED** |
| **Known issue?** | No |
| **Status** | **FIXED** — per-owner voting power cap deducted across tokenIds |

**Description:** `_tokenStake` in `JB721Distributor` checks the current `ownerOf(tokenId)` and that owner's `getPastVotes` at the snapshot block, but never verifies the specific NFT existed at the snapshot. The `min(votingUnits, pastVotes)` cap reuses the owner's **total** historical voting power for every NFT presented — there is no deduction mechanism across tokenIds.

**Attack path:** Alice owns NFT #1 (100 voting units) at the snapshot. After the snapshot, she mints NFT #2 (100 voting units). She calls `beginVesting(hook, [#1, #2], tokens)`. For both NFTs, `_tokenStake` returns `min(100, 100) = 100`, allocating 2x the distributable amount. The denominator (`_totalStake` from `getPastTotalSupply`) only counts pre-snapshot supply, so the numerator sum exceeds the denominator, overbooking the round.

This is related to H-12 (which covered live state in `_totalStake`) but is a distinct vector — per-token voting power is not deducted when processing multiple tokenIds for the same owner.

**Mitigation:** Track consumed voting power per owner within `_vestTokenIds` and subtract each tokenId's stake from the owner's remaining allowance, or verify the specific tokenId existed at the snapshot block.

**Resolution:** `_vestTokenIds` now tracks consumed voting power per owner and deducts each tokenId's stake from the owner's remaining allowance, preventing overbooking.

---

### M-38. Pre-Initialized Pool Price Accepted Without Bounds Validation *(pass 4 — promotes Lead 35/43)* — ACCEPTED BY DESIGN

| Field | Value |
|-------|-------|
| **Repo** | univ4-lp-split-hook-v6 |
| **File** | `src/JBUniswapV4LPSplitHook.sol:1484-1493` |
| **Auditor confidence** | 85 |
| **My confidence** | **82 — VERIFIED** |
| **Known issue?** | Acknowledged in code comments (line 1484: "e.g. by an attacker") and Lead 35/43, previously rated Informational |
| **Status** | **ACCEPTED BY DESIGN** — reverting on out-of-range prices creates a DoS vector. Documented in RISKS.md §7.4. |

**Description:** `_createAndInitializePool` accepts any pre-initialized `sqrtPriceX96` from `POOL_MANAGER.getSlot0()` without validating it falls within the hook's calculated tick bounds. An attacker can front-run `deployPool()` by calling `POOL_MANAGER.initialize()` directly with an extreme price. The manipulated price propagates into `_computeOptimalCashOutAmount`, which determines how many project tokens are irreversibly cashed out for terminal tokens. A price far below the tick range triggers the maximum 50% cash-out; a price far above triggers 0% cash-out. The resulting single-sided LP position is arbitrageable.

**Mitigating factors:** Tick bounds are independently derived from Juicebox economics (not from pool price). Cash-outs have slippage protection via `effectiveMinReturn`. Cash-out amount is capped at 50%. Leftover tokens are returned to the project. Loss is bounded by the cash-out tax on unnecessarily cashed-out tokens plus arbitrage profit from the mispriced LP. Not a total-fund-loss scenario.

**Promoted from:** Lead 35 (pass 2) / Lead 43 (pass 3), previously rated Informational. Upgraded to Medium based on verified end-to-end loss path via cash-out sizing manipulation.

**Mitigation:** Before accepting an existing pool price, validate `existingSqrtPriceX96` falls within the tick bounds derived from `_calculateTickBounds`. Revert with `PoolPriceOutOfRange()` if not.

**Resolution:** Accepted by design. Reverting on out-of-range prices would create a permanent deployment-blocking DoS vector — an attacker could front-run `deployPool()` by initializing the pool at an extreme price, permanently blocking deployment. The economic cost of an out-of-range initialization is temporary single-sided exposure, which resolves naturally through arbitrage. This is strictly preferable to a permanent DoS. Documented in RISKS.md §3 and §7.4.

---

### ~~L-18. `tx.origin` Beneficiary Fallback Misroutes Project Tokens for Contract Callers *(pass 4 nemesis + pashov)* — FIXED~~

| Field | Value |
|-------|-------|
| **Repo** | nana-project-payer-v6 |
| **File** | `src/JBProjectPayer.sol:95,318-320` |
| **Auditor confidence** | 75 (nemesis + pashov agree) |
| **My confidence** | **75** |
| **Known issue?** | No |
| **Status** | **FIXED** — replaced `tx.origin` with `msg.sender` |

**Description:** When both the explicit beneficiary and `defaultBeneficiary` are `address(0)`, the payer resolves to `tx.origin` as the token recipient. This misroutes minted project tokens for multisigs, ERC-4337 wallets, routers, relayers, and any contract integration that pays on behalf of a user. The payment itself succeeds, so the misrouting is silent. Both `receive()` (line 95) and `_pay()` (line 318) contain the same fallback.

**Mitigation:** Revert when no beneficiary is available rather than falling back to `tx.origin`:
```solidity
if (beneficiary == address(0) && defaultBeneficiary == address(0)) revert BeneficiaryRequired();
```

**Resolution:** Replaced `tx.origin` with `msg.sender` as the fallback beneficiary. This correctly routes tokens to the direct caller (including Safes and contract wallets) instead of the transaction originator.

---

### ~~L-19. Deploy Script Lacks Directory Validation — Can Permanently Miswire Factory *(pass 4 nemesis)* — FIXED~~

| Field | Value |
|-------|-------|
| **Repo** | nana-project-payer-v6 |
| **File** | `script/Deploy.s.sol:11-14` |
| **Auditor confidence** | 75 |
| **My confidence** | **70** |
| **Known issue?** | No |
| **Status** | **FIXED** — added `code.length != 0` validation |

**Description:** The deployment script reads `JB_DIRECTORY` from env and passes it directly to `JBProjectPayerDeployer` constructor without validating it is non-zero and has code. If misconfigured, the factory is permanently bricked — every clone inherits the bad immutable directory and cannot be repaired. Requires redeploying the factory and rotating all downstream payer addresses.

**Mitigation:** Add `require(directoryAddress != address(0) && directoryAddress.code.length != 0)` before deployment.

**Resolution:** Added non-zero and `code.length != 0` validation in the deploy script before constructing the factory.

---

### Pass 4 Corroborations

Pass 4 independently re-discovered 6 findings from passes 1-3:

| Source | Repo | Corroborates | Notes |
|--------|------|-------------|-------|
| Pashov pass 4 | nana-buyback-hook-v6 | C-3 (cashout fallback zeros surplus) | Already FIXED |
| Pashov pass 4 + Nemesis pass 4 | univ4-lp-split-hook-v6 | H-2 (permissionless LP deployment) | Existing finding |
| Pashov pass 4 | nana-distributor-v6 | H-12 (721 distributor live state allocation) | Already FIXED |
| Nemesis pass 4 | nana-suckers-v6 | M-33 (cross-chain surplus staleness) | Nemesis PoC shows 450 ETH overpayment from stale deprecated sucker — **consider re-evaluating severity** |
| Pashov pass 4 | nana-ownable-v6 | L-2 (constructor binds future project) | Existing finding |
| Pashov pass 4 | deploy-all-v6 | H-11/M-18 (Tempo deploy divergence) | Existing finding |

### Pass 4 False Positives

| Source | Repo | Claim | Verdict |
|--------|------|-------|---------|
| Pashov pass 4 | nana-suckers-v6 | Zero-output CCIP retry finalizes unbacked batch | FALSE POSITIVE — `_conversionRateOf` stores `{leafTotal: X, localTotal: 0}`, so `_addToBalance` scales every claim to `amount * 0 / X = 0`. Accounting remains sound. Confirms Lead 12 assessment. |
| Pashov pass 4 | nana-fee-project-deployer-v6 | Permissionless project #1 squatting bricks deployment | FALSE POSITIVE — project #1 is minted atomically inside `JBProjects` constructor (`createFor(feeProjectOwner)` at line 47). No external minting window exists. |
| Nemesis pass 4 | nana-address-registry-v6 | Permissionless registration is unauthorized provenance | FALSE POSITIVE — intentional design, confirmed by ARCHITECTURE.md and RISKS.md. CREATE/CREATE2 derivation check ensures only correct deployer can be registered. Confirms H-20 assessment. |

### Pass 4 Leads

| # | Repo | Lead | Risk Surface | Verdict |
|---|------|------|--------------|---------|
| 54 | nana-core-v6 | Permissionless `processHeldFeesOf` enables fee forgiveness when fee route broken | Fee revenue | By design — explicitly documented in code comments (lines 654-657, 1684-1687). Fees forgiven rather than locking project funds. Risk to fee beneficiary (project #1) only when fee terminal is temporarily unconfigured. Accepted risk. |
| 55 | nana-address-registry-v6 | `SphinxConstants` deployment in helper perturbs nonce-sensitive broadcasts | Deployment | LOW — only affects script composition when `getDeployment()` is called inside a live broadcast. Not a runtime exploit. |
| 56 | nana-suckers-v6 | `remoteSurplusOf` max() dedup prefers numeric maximum over freshness | Surplus inflation | Corroborates M-33 — same root cause. Nemesis PoC demonstrates 450 ETH overpayment in migration scenario. **Severity promotion warranted.** |
| 57 | nana-router-terminal-v6 | Fallback route skipped after any successful candidate preview | Routing quality | Corroborates Lead 40-42 |
| 58 | nana-distributor-v6 | Zero-balance snapshot can be overwritten in same round | Reward distribution | Pending verification |
| 59 | nana-distributor-v6 | Anyone can crystallize another holder's vesting state | Permissionless state mutation | Pending verification |
| 60 | nana-project-payer-v6 | Residual ERC20 allowance left to terminal after payment | Allowance hygiene | LOW — depends on trusted-terminal behavior or accidental later token deposits. No confirmed drain path. |

---

## Pass 5 Findings (20260422-003458)

Source: Nemesis Auditor (Codex) run `20260422-003458`. 20 repos scanned; findings in 4 repos (univ4-router-v6: 4 files, nana-suckers-v6: 6 files, nana-ownable-v6: 2 files, nana-address-registry-v6: 2 files). All findings verified against current source code.

### ~~M-39. ROOT Permission Bypasses `permissionId = 0` Direct-Owner-Only Mode *(pass 5 nemesis)* — FIXED~~

| Field | Value |
|-------|-------|
| **Repo** | nana-ownable-v6 |
| **File** | `src/JBOwnableOverrides.sol:137-139` |
| **Auditor confidence** | 90 (nemesis rated HIGH) |
| **My confidence** | **85 — VERIFIED (PoC passes)** |
| **Known issue?** | No — documented behavior says `permissionId = 0` is "direct-owner-only" |
| **Status** | **FIXED** — bypass permission system entirely when `permissionId == 0` |

**Description:** `_checkOwner()` always calls `_requirePermissionFrom(account, projectId, permissionId)` even when `permissionId == 0`. Inside `JBPermissioned._requirePermissionFrom`, the check at `JBPermissions.sol:213` authorizes ROOT (permission bit 1) before checking the specific permission bit. Since ROOT supersedes all permission IDs — including 0 — an operator with ROOT can pass any `onlyOwner` gate even though local state says delegation is disabled.

`_transferOwnership()` resets `permissionId` to 0 specifically to revoke delegation. But ROOT operators survive this reset because they're authorized through a parallel path that ignores the specific permission ID.

This affects every contract that inherits `JBOwnable`: croptop-core-v6, nana-omnichain-deployers-v6, and any future inheritors that rely on `permissionId = 0` to restrict owner-only actions.

**Mitigating factors:** ROOT is explicitly granted by the project owner. The attack requires the owner to have intentionally given ROOT permission to the operator. This limits the scenario to cases where ownership was transferred and the new owner expected the reset to fully revoke the old operator.

**Mitigation:**
```solidity
if (ownerInfo.permissionId == 0) {
    if (_msgSender() != resolvedOwner) revert Unauthorized();
    return;
}
_requirePermissionFrom({account: resolvedOwner, projectId: ownerInfo.projectId, permissionId: ownerInfo.permissionId});
```

**Resolution:** When `permissionId == 0`, the permission system is bypassed entirely — only the direct owner (resolved via `_msgSender()`) can pass the check. This makes `permissionId = 0` truly mean "direct-owner-only" as documented.


---

### ~~M-40. Deployment Helper Accepts Non-Contract Registry Addresses *(pass 5 nemesis)* — FIXED~~

| Field | Value |
|-------|-------|
| **Repo** | nana-address-registry-v6 |
| **File** | `script/helpers/AddressRegistryDeploymentLib.sol:62` |
| **Auditor confidence** | 85 |
| **My confidence** | **80 — VERIFIED** |
| **Known issue?** | No |
| **Status** | **FIXED** — added `code.length != 0` validation |

**Description:** `_getDeploymentAddress()` reads a deployment artifact JSON file and returns the `.address` field without checking that the target has contract code. If a stale or malicious artifact is supplied, the returned address may be an EOA or undeployed address. Downstream deployers (`JB721TiersHookDeployer`, `JBUniswapV4LPSplitHookDeployer`, `DefifaDeployer`) bake this address as an immutable registry pointer. Runtime calls to `registerAddress(...)` on an EOA succeed silently with empty returndata, so newly deployed hooks/games are never registered in the provenance registry.

**Mitigating factors:** This is a deployment-time configuration issue, not a runtime exploit. Requires supplying an incorrect deployment artifact. Only affects provenance registration, not core protocol accounting.

**Mitigation:**
```solidity
deployed = stdJson.readAddress({json: deploymentJson, key: ".address"});
require(deployed.code.length != 0, "AddressRegistryDeploymentLib: empty registry code");
```

**Resolution:** Added `code.length != 0` validation after reading the deployment artifact address, preventing non-contract addresses from being baked into downstream deployers.

---

### Pass 5 Corroborations

Pass 5 independently re-discovered 3 findings from passes 1-4:

| Source | Repo | Corroborates | Notes |
|--------|------|-------------|-------|
| Nemesis pass 5 | univ4-router-v6 | H-21 (V4 quote misroutes large trades) | PoC shows 267x overquote: V4 quoted 7.976e18 but executed only 0.03e18. Strongest evidence yet for this finding. |
| Nemesis pass 5 | nana-suckers-v6 | M-33 (cross-chain surplus staleness) | Third independent re-discovery of this issue |
| Nemesis pass 5 | nana-ownable-v6 | L-2 (constructor accepts unminted project) | Explicitly noted as accepted deployment assumption |

### Pass 5 False Positives

| Source | Repo | Claim | Verdict |
|--------|------|-------|---------|
| Nemesis pass 5 | nana-suckers-v6 | Registry-deployed suckers cannot authenticate their real peers due to double-hashed salt diverging across chains | FALSE POSITIVE — The registry, deployer, and singleton are deployed via deterministic CREATE2 at the same addresses on every chain. The double-hash uses `msg.sender = registry address` which is identical cross-chain, so clone addresses match and `peer() == address(this)` holds. The PoC tested with different registry addresses per chain, which doesn't match the actual deployment model. |

---

## CertiK AI Scan Triage (Pass 6)

**Source:** CertiK AI-generated security scan (`nana-core-v6.md`)
**Scope:** nana-core-v6 only (JBMultiTerminal, JBController, JBRulesets, JBTerminalStore, JBDirectory, JBTokens, JBSplits, JBFundAccessLimits, JBPrices, JBPermissions, JBProjects, JBERC20, libraries)
**Method:** Corroboration against source code + parallel verification agents + prior 7-component deep audit context
**Date:** 2026-04-22

### CertiK Scan Summary

| Original Severity | Count | Acknowledged (Info) | Invalid | Duplicates |
|---|---|---|---|---|
| Major | 9 | 0 | 9 | 0 |
| Medium | 33 | 2 | 29 | 2 |
| Minor | 25 | 1 | 24 | 0 |
| **Total** | **67** | **3** | **62** | **2** |

**Result: 0 actionable findings. 3 acknowledged as informational (no code changes required).**

### Acknowledged (Informational)

**CertiK-F39: Locked Splits Bypass via Many-to-One Matching** (minor)
`JBSplits.sol:329-351` — `_includesLockedSplits` matches by value without tracking consumed indices. Duplicate identical locked splits can be collapsed into fewer entries. Requires unusual configuration of duplicate identical locked splits. Owner-configured.

**CertiK-F40: Empty Split Group Cannot Disable Fallback Splits** (medium)
`JBSplits.sol:138-154` — `splitsOf` falls back to rulesetId=0 when `_splitCountOf == 0`. No way to distinguish "explicitly emptied" from "never configured". Workaround: set a single 100% split to the project owner.

**CertiK-F48: FX Quote Precision Inconsistency in `_computePayFrom`** (medium)
`JBTerminalStore.sol:1130-1137` — Uses `amount.decimals` for PRICES call while all other FX paths use `_MAX_FIXED_POINT_FIDELITY` (18 decimals). Rounding error is bounded (sub-wei token issuance). Standard tokens (6-18 decimals) unaffected in practice.

### Invalid — Major (9)

| # | Title | Reason |
|---|---|---|
| F2 | Self-referential reserved splits mint against own balance | **Owner trust** — owner configures their own splits |
| F7 | Descendant rulesets active despite rejected parent | **By design** — overlapping `mustStartAtOrAfter` causes intended overwrite (confirmed via Forge test) |
| F11 | First payer drains prelaunch terminal balances | **Owner trust** — pre-launch balance is owner's responsibility |
| F29 | Pay hooks bypass ruleset payout limits | **Data hook trust** — hooks have documented absolute control (code: "SECURITY NOTE: The data hook has absolute control") |
| F38 | Locked fallback splits bypassed by ruleset-specific tables | **Documented behavior** — new owner can defend by setting their own splits |
| F43 | ERC20 self-migration zeros recorded balance | **Privileged self-harm** — requires `MIGRATE_TERMINAL` permission |
| F46 | Cash-out hook amounts as additional withdrawals | **Duplicate of F29** — same data hook trust model |
| F49 | Pending reserved tokens uint208 cap overcommitment | **Privileged self-harm** — requires mint authority |
| F67 | Arbitrary external token attachment bricks flows | **Owner trust** — requires `allowSetCustomToken` in ruleset + controller permission |

### Invalid — Medium (31)

| # | Title | Reason |
|---|---|---|
| F3 | Reserved splits ignore `preferAddToBalance` | **By design** — reserved tokens are project tokens (minted), not terminal funds |
| F5 | Empty terminal config doesn't clear terminals | **By design** — use `setTerminalsOf` to clear |
| F8 | Reentrancy in `mintTokensOf` understates supply | **Invalid** — state finalized before hook callback |
| F10 | Reverting split hooks strand reserved tokens | **Owner trust** — owner configured the hook |
| F14 | Missing zero-address controller check | **Invalid** — controller set before terminal config in all valid flows |
| F16 | Removed terminals excluded from surplus | **Documented** — migrate balance before removing |
| F17 | Invalid terminal bricks routing | **Owner trust** — terminals set by privileged owner |
| F18 | JBERC20 mutable init flag allows re-init | **Invalid** — verified: `_name` guard prevents re-initialization |
| F20 | Contract-wallet owners can't authenticate | **Invalid** — contracts call directly; ERC-2771 is optional UX |
| F22 | Zero-address beneficiaries = unclaimable supply | **Self-inflicted** — payer chose `beneficiary = address(0)` |
| F23 | Token payout accounting uses balance deltas | **Informational** — event emission only |
| F24 | Fee aggregation rounding = insolvency | **Formally proven** — bounded by N wei for N splits |
| F26 | Min cash-out validates nominal not actual | **Documented** — `minReclaimAmount` is pre-fee |
| F27 | Gas griefing via `_processFee` try-catch | **Invalid** — fee terminal is protocol-controlled (project 1) |
| F28 | Pay hooks never validated | **Data hook trust** — documented absolute control |
| F31 | Rebasing token balance misattribution | **Out of scope** — rebasing tokens not supported |
| F32 | Self-payouts poison fee-free surplus | **By design** — `_feeFreeSurplusOf` tracks round-tripped funds |
| F33 | Project feed preempts default feed | **Owner trust** — owner sets their own feeds |
| F34 | Missing approval check in `_currentlyApprovableRulesetIdOf` | **Invalid** — verified: `currentOf` and `_configureIntrinsicPropertiesFor` independently verify approval |
| F37 | Derived start time uint48 wrap | **Invalid** — overflow is ~8.9 million years away |
| F41 | Zero-rounding payout limit grief | **Edge case** — requires extreme price ratios; `ownerMustSendPayouts` mitigates |
| F47 | Surplus views miscalculate cross-store terminals | **View limitation** — execution path queries each terminal correctly |
| F53 | Split cash-outs bypass bonding curve tax | **Formally proven false** — subadditivity means splitting receives LESS |
| F55 | adjustDecimals truncation skews surplus | **Invalid** — rounding is conservative (favors project) |
| F56 | addToMetadata 32-byte alignment corruption | **Invalid** — verified: library handles padding internally |
| F57 | Duplicate metadata ID shadowing | **By design** — standard first-match key-value behavior |
| F59 | Payout fee bypass via same-terminal splits | **Documented fee design** — intra-terminal fee skip is intentional + hook trust |
| F60 | Fee aggregation precision loss | **Duplicate of F24** — same bounded rounding |
| F61 | Failed splits consume payout limit (DoS) | **Documented** — code comment: "Failed split payouts consume the payout limit by design" |
| F62 | Return data bomb DoS in catch(bytes) | **Owner trust** — verified: split targets are owner-configured |
| F64 | Total-surplus cash-out ignores local liquidity | **Documented** — `useTotalSurplusForCashOuts` is opt-in; owner accepts risk |

### Invalid — Minor (24)

| # | Title | Reason |
|---|---|---|
| F1 | Price truncation to zero | Fixed-point inherent; reverts safely |
| F4 | Migration misroutes zero-beneficiary tokens | Self-inflicted config |
| F6 | `SET_TERMINALS` check in `launchRulesetsFor` | Intentional permission design |
| F9 | Custom token lacks capability validation | Owner trust |
| F12 | Reentrancy in `setControllerOf` double migration | Owner chooses replacement controller |
| F13 | First controller accepts arbitrary addresses | Requires protocol-level `isAllowedToSetFirstController` |
| F15 | `ADD_TERMINALS` rendered useless | Permission design choice |
| F19 | JBERC20 EIP-712 domain fixed to "JBToken" | Cosmetic |
| F21 | Same-currency limits duplicated across groups | Controller-mediated; documented |
| F25 | cashOut doesn't reject unsupported tokens | Reverts safely downstream |
| F30 | Cash-out hooks receive net not gross | Documentation naming issue |
| F35 | Gas manipulation via approval hook catch | Owner-configured approval hook |
| F36 | `weight == 1` = "inherit derived weight" | Documented behavior |
| F42 | Unbounded hook `cashOutTaxRate` bricks cash-outs | Data hook trust — can already halt by reverting |
| F44 | Zero-value payments trigger pay hooks | Hook responsibility to validate inputs |
| F45 | address(0) bypasses duplicate accounting check | address(0) is not a valid token; terminal-gated |
| F50 | Claim to arbitrary beneficiary bypasses pause | `CLAIM_TOKENS` is separate from `pauseCreditTransfers` by design |
| F51 | Zero-address credit sinks | Duplicate of F22 — self-inflicted |
| F52 | Zero total supply inconsistent results | View helper edge case |
| F54 | Sub-40-unit chunks bypass fee | Economically insignificant (sub-40 wei) |
| F58 | Malformed metadata reverts pay | Caller-controlled input |
| F63 | Dust-fragmenting payouts amplify wildcard | 1 wei dust per call — insignificant |
| F65 | Pre-ruleset minting via reentrancy | By design — multi-step setup supported |
| F66 | Non-standard tokens bypass decimal verification | Documented in code comment; privileged config |

### Invalidation Pattern Summary

| Category | Count | Description |
|---|---|---|
| Owner / Privileged Trust | 24 | Requires project owner, controller, or operator to trigger |
| Data Hook Trust Model | 7 | Assumes data hooks are untrusted; protocol documents hooks have absolute control |
| By Design / Documented | 16 | Behavior is intentional, in code comments, or confirmed by project owner |
| Formally Proven Bounded | 4 | Rounding/precision issues proven negligible by formal property tests |
| Edge Case / Theoretical | 5 | Requires extreme conditions (uint48 overflow, sub-wei amounts, 0-decimal tokens) |
| View / Cosmetic | 4 | Affects views or events, not fund flows |
| Duplicates | 2 | F46 = F29; F60 = F24 |

---

## Codex Nemesis Run (Pass 7)

**Source:** Codex Nemesis automated audit (`codex-nemesis-summary-20260422-193746.log`)
**Scope:** 20 repos. Findings in 6: revnet-core-v6, univ4-lp-split-hook-v6, nana-router-terminal-v6, croptop-core-v6, nana-ownable-v6, nana-project-handles-v6
**Method:** Automated Feynman+State coupled-pair analysis → PoC verification → corroboration against source code
**Date:** 2026-04-22

### Pass 7 Summary

| Repo | Scanned | TRUE POSITIVES | Fixed | Partial | Unfixed |
|------|---------|---------------|-------|---------|---------|
| revnet-core-v6 | 140 functions | 1 (HIGH) | 0 | 0 | 1 |
| univ4-lp-split-hook-v6 | yes | 2 (MEDIUM) | 2 | 0 | 0 |
| nana-router-terminal-v6 | yes | 2 (1M, 1L) | 1 | 1 | 0 |
| croptop-core-v6 | yes | 3 (MEDIUM)* | 1 | 1 | 0 |
| nana-ownable-v6 | yes | 0 | — | — | — |
| nana-project-handles-v6 | yes | 1 (MEDIUM) | 0 | 0 | 1 |
| **14 other repos** | yes | 0 | — | — | — |
| **Total** | **20 repos** | **9** | **4** | **2** | **2** |

*Croptop NM-001 later reclassified as FALSE POSITIVE / accepted behavior by the team.

### New Findings

---

#### ~~H-22: Stale ERC20 Approval in REVLoans~~ — FIXED (`965d3f7`)

| Field | Value |
|---|---|
| **Repo** | revnet-core-v6 |
| **Source** | Nemesis NM-001 (HIGH) + CertiK F19 (MEDIUM) |
| **Contract** | `REVLoans.sol` |
| **Status** | **FIXED** |

**Description:** `_tryPayFee` (L1522) and `_removeFrom` (L1322) grant ERC20 approval to terminals via `_beforeTransferTo` but never clear it on the success path. The `catch` branch in `_tryPayFee` clears the approval (L1535), but the happy path leaves a reusable allowance. `_removeFrom` never clears it at all. A terminal that returns success without pulling the full approved amount accumulates reusable allowance that can drain tokens from `REVLoans` during subsequent operations.

**Mitigating factors:** Revnet terminals are set at deployment. The fee terminal is the REV project's (project 1) primary terminal, controlled by the protocol. Exploit requires a terminal that intentionally under-pulls approved amounts. `REVOwner` already implements the correct defensive pattern (`_afterTransferTo` clears approvals on both paths).

**PoC:** `test/audit/CodexNemesisFeeAllowanceLeak.t.sol` — confirms stale approval accumulates across borrows.

**Fix:** Add `_afterTransferTo` (calls `forceApprove(to, 0)`) on both success and failure paths in `_tryPayFee` and `_removeFrom`, matching `REVOwner`'s existing pattern.

---

#### ~~M-34: Verified Handles Accept Unsafe Control Characters~~ — FIXED (`30ad40a`)

| Field | Value |
|---|---|
| **Repo** | nana-project-handles-v6 |
| **Source** | Nemesis NM-001 (MEDIUM) |
| **Contract** | `JBProjectHandles.sol` |
| **Status** | **FIXED** |

**Description:** `setEnsNamePartsFor` (L70) only rejects empty labels and dots, allowing arbitrary bytes including control characters (`\n`, `\r`). After ENS verification succeeds, `handleOf` returns raw bytes as canonical project identity text. Enables log poisoning, broken formatting, and UI spoofing in offchain consumers.

**PoC:** `JBProjectHandlesNemesis.t.sol` — `handleOf` returned `team\nops` as a verified handle.

**Fix:** Reject labels containing control characters before storing. At minimum, block bytes < 0x20.

---

### Pass 7 — Fixed Findings

| Repo | ID | Severity | Title | Status |
|------|-----|----------|-------|--------|
| univ4-lp-split-hook-v6 | NM-001 | MEDIUM | Credit-only reserved splits strand value in hook | **FIXED** (commit `5f73731`) |
| univ4-lp-split-hook-v6 | NM-002 | MEDIUM | Permissionless decay lets outsiders lock terminal token | **FIXED** (commits `b754bd0`, `357c2df`) |
| nana-router-terminal-v6 | NM-001 | MEDIUM | Forwarding through registry bypasses lossy final-hop guard | **ACCEPTED RISK** — FoT tokens documented as unsupported |
| nana-router-terminal-v6 | NM-002 | LOW | `lockTerminalFor` can irreversibly lock project to registry | **FIXED** (commit `c30eb49`) |
| croptop-core-v6 | NM-001 | MEDIUM | Existing tier reuse bypasses updated posting policy | **RECLASSIFIED FP** — intended behavior (commit `0d65db1`) |
| croptop-core-v6 | NM-002 | MEDIUM | `deployProjectFor` hard-fails on sucker deployment | **FIXED** (commit `c592554`) |
| croptop-core-v6 | NM-003 | MEDIUM | Post-launch `MAP_SUCKER_TOKEN` authority gap | **PARTIAL** — manual owner grant required, documented limitation |

### Pass 7 — Zero-Finding Repos (14)

nana-core-v6, nana-721-hook-v6, univ4-router-v6, nana-buyback-hook-v6, nana-suckers-v6, defifa, banny-retail-v6, nana-omnichain-deployers-v6, nana-ownable-v6, nana-address-registry-v6, nana-permission-ids-v6, nana-fee-project-deployer-v6, nana-project-payer-v6, deploy-all-v6

---

## CertiK AI Scan — revnet-core-v6 (Pass 8)

**Source:** CertiK AI-generated security scan (`revnet-core-v6.md`)
**Scope:** REVDeployer, REVOwner, REVLoans, REVHiddenTokens (revnet-core-v6)
**Method:** Corroboration against source code + parallel verification agents + cross-reference with Nemesis findings
**Date:** 2026-04-22

### Pass 8 Summary

| Original Severity | Count | Actionable (New) | Acknowledged | Invalid | Duplicate |
|---|---|---|---|---|---|
| Critical | 1 | 0 | 0 | 1 | 0 |
| Major | 8 | 2 | 4 | 1 | 1 |
| Medium | 9 | 1 | 4 | 2 | 2 |
| Minor | 12 | 0 | 6 | 4 | 2 |
| **Total** | **30** | **3** | **14** | **8** | **5** |

**Result: 3 actionable findings. 14 acknowledged as informational. 5 duplicates (within scan or cross-ref to Pass 7).**

### New Findings

---

#### ~~H-23: Unit Mismatch in Cross-Currency Loan Fees~~ — FIXED (`965d3f7`)

| Field | Value |
|---|---|
| **Source** | CertiK F12 (Major) |
| **Contract** | `REVLoans.sol:_addTo` (L1096-1122) |
| **Status** | **FIXED** |

**Description:** In `_addTo`, `revFeeAmount` is computed from `addedBorrowAmount` via `JBFees.feeAmountFrom`. `addedBorrowAmount` is in the terminal's accounting currency (passed to `useAllowanceOf` with `currency: accountingContext.currency`), while `netAmountPaidOut` is the actual token amount returned by the terminal. For cross-currency terminals (e.g., USD-accounted ETH terminal), the subtraction `netAmountPaidOut - revFeeAmount - sourceFeeAmount` (L1122) mixes token-denominated and currency-denominated values, causing underflow reverts or incorrect fee deductions.

**Mitigating factors:** Standard terminals use `currency = uint32(uint160(token))`, making `addedBorrowAmount` equivalent to token units. Cross-currency terminals require custom configuration. The code comment (L1115-1117) acknowledges the subtraction is safe "in practice" assuming small fee fractions.

**Fix:** Either enforce same-currency accounting for loan sources, or convert `revFeeAmount` to token units using `JBPrices` before subtraction.

---

#### ~~M-35: Stale Zero-Balance Loan Sources DoS~~ — FIXED (`965d3f7`)

| Field | Value |
|---|---|
| **Source** | CertiK F18 (Major) |
| **Contract** | `REVLoans.sol:_totalBorrowedFrom` (L548-555) |
| **Status** | **FIXED** |

**Description:** `_totalBorrowedFrom` calls `source.terminal.accountingContextForTokenOf(...)` (L548) before checking `totalBorrowedFrom[...] == 0` (L555). If a fully-repaid source's terminal is later removed or begins reverting, all paths that use `_totalBorrowedFrom` (borrowing, repayment, reallocations) are DoS'd for that revnet.

**Fix:** Swap the order — check `totalBorrowedFrom == 0` before the external call to `accountingContextForTokenOf`.

---

#### ~~M-36: Cross-Chain `startsAtOrAfter` Normalization Mismatch~~ — FIXED (`965d3f7`)

| Field | Value |
|---|---|
| **Source** | CertiK F1 (Medium) |
| **Contract** | `REVDeployer.sol:_makeRulesetConfigurations` (L136-163) |
| **Status** | **FIXED** |

**Description:** When stage 0 uses `startsAtOrAfter = 0`, the encoded hash stores `block.timestamp` (L162-163), but the stage ordering check (L136) compares raw calldata values. On the origin chain, stage 1 with `startsAtOrAfter = 1` passes the `1 > 0` check. On a second chain, reproducing the hash requires passing the origin timestamp for stage 0, but then `1 <= originTimestamp` fails with `REVDeployer_StageTimesMustIncrease`. This permanently blocks cross-chain expansion for affected multi-stage revnets.

**Fix:** Normalize stage 0's `startsAtOrAfter` before the ordering check, or validate ordering against the encoded values.

---

### Pass 8 Cross-References

| CertiK | Corroborates | Notes |
|--------|-------------|-------|
| F19 (Medium) | **H-22** (stale ERC20 approval) | Second independent discovery; same issue as Nemesis revnet NM-001 |
| F7 (Major) | = F27 (Minor) | Sucker delay bypass — duplicate within scan |
| F10 (Major) | = F28 (Major) | Hidden tokens excluded from supply — duplicate within scan |

### Acknowledged (Informational) — 14

| # | Title | Severity | Reason |
|---|---|---|---|
| F3 | Permissionless `burnHeldTokensOf` enables supply repricing | Medium | **By design** — burns deployer's unclaimed auto-issuance tokens, benefiting all holders equally. Deployer holds no other revnet tokens. |
| F5 | Adding suckers later bypasses cash-out delay | Medium | **Design gap (low impact)** — sucker registration alone doesn't change pricing; bridge operations happen later. Quarantine is for normal cash-outs. |
| F7 | Sucker withdrawals bypass cash-out delay on new chain | Major | **By design** — code comment: "no taxes or fees" for suckers. Suckers are trusted cross-chain bridges, not user cash-outs. |
| F8 | Unclaimed auto-issuance excluded from supply | Major | **Acknowledged** — `amountToAutoIssue` tokens are not yet minted. Supply denominators use `totalSupply` which correctly reflects minted tokens only. Auto-issuance is a future claim, not current supply. |
| F10 | Hidden tokens excluded from supply inflates cash-out/borrow | Major | **Acknowledged** — hiding requires allowlist membership. Hidden tokens are burned from supply by design (hide = voluntary lockup with reduced cash-out representation). |
| F13 | Fail-open fee payment allows fee bypass | Major | **By design** — code comment: "If it fails, revFeeAmount is zeroed so the borrower receives it instead." Deliberate fail-safe to prevent fee terminal issues from bricking loans. |
| F16 | Permission mismatch: REALLOCATE_LOAN needs OPEN_LOAN | Medium | **UX issue** — operator with only REALLOCATE_LOAN fails at internal `borrowFrom` call. Documented: callers need both permissions. |
| F23 | Borrow payouts reenter before collateral is burned | Medium | **Acknowledged** — no reentrancy guard, but each nested borrow must independently satisfy collateral. Code comment (L1128-1131) acknowledges this as "practically infeasible." |
| F2 | Configuration hash omits splits/extraMetadata/721 settings | Minor | **Intentional tradeoff** — hash covers timing/issuance/tax fields for cross-chain reproducibility. Splits and 721 config are per-chain by design. |
| F6 | Pool initialization always uses stage-0 issuance | Minor | **Low impact** — pool sets initial price only, has no liquidity. Stale issuance affects price discovery minimally. |
| F11 | `_addTo` trusts nominal payout instead of actual tokens | Minor | **Terminal trust** — `useAllowanceOf` returns net amount from canonical JBMultiTerminal. Fee-on-transfer tokens are unsupported protocol-wide. |
| F15 | Reentrant repayment-token transfer lets stale owners finish repay | Medium | **Theoretical** — requires reentrant ERC-20 (ERC-777) or Permit2 callback during `_acceptFundsFor`. Standard tokens unaffected. |
| F20 | Late fee accrual rounding creates zero-fee window | Minor | **Negligible** — zero-fee gap is ~3.5 days for 10-year loans at 2.5% prepaid. Rounding inherent to integer math. |
| F22 | Borrow amount quoted against aggregate surplus, not source | Minor | **Conservative** — can cause DoS (revert) if source terminal lacks liquidity, but not fund loss. Overstated borrow capacity fails at `useAllowanceOf`. |

### Invalid — 8

| # | Title | Severity | Reason |
|---|---|---|---|
| F25 | Unauthenticated `afterCashOutRecordedWith` drains ETH | Critical | **Invalid** — REVOwner has no `receive()` or `fallback()`, cannot accumulate ETH. For native token: only spends `msg.value` sent by caller. For ERC20: `safeTransferFrom(msg.sender)` pulls from caller first. Code comment: "A non-terminal caller would just be donating their own funds as fees." |
| F26 | Cross-chain surplus overstates redeemable amount | Medium | **Invalid** — fee-bearing path caps at `context.surplus.value` (local surplus). Terminal enforces its own balance constraint on actual payouts. |
| F9 | `caller != holder` disables operator-delegated hide/reveal | Medium | **By design** — NatSpec: "The caller must be the holder." Self-service model, not operator-delegation. HIDE_TOKENS permission is for allowlist proof. |
| F30 | Repayment clears debt without restoring treasury if terminal misbehaves | Major (Op) | **Terminal trust** — terminal is validated against `DIRECTORY.isTerminalOf` at borrow time. Misbehaving terminal is a trust assumption violation. |
| F4 | Split operator prevented from deploying suckers before first ruleset | Minor | **Timing issue** — initial deployment flow handles this via deployer. Not a security concern. |
| F14 | Zero remaining capacity forces full repayment | Minor | **UX quirk** — `maxRepayBorrowAmount` cap still protects caller from overpayment. |
| F17 | Zero-amount ERC20 transferFrom DoS on collateral-only repay | Minor | **Edge case** — mainstream tokens handle zero-amount transfers. Non-standard token behavior is unsupported protocol-wide. |
| F24 | Skipping zero-price debt sources understates surplus | Minor | **Conservative** — understated surplus means lower borrowing capacity, not inflation. Protective, not exploitable. |

### Remaining Minor (Informational)

| # | Title | Severity | Reason |
|---|---|---|---|
| F21 | Split-repayment rounding shaves late fees | Minor | 1 wei per partial repay. Impractical for 18-decimal tokens. |
| F27 | Sucker holders bypass cash-out delay entirely | Minor | Duplicate of F7 at lower severity. |
| F28 | Hidden token supply excluded from cash-out denominator | Major | Duplicate of F10. |
| F29 | `_msgSender()` in sucker salt breaks permissionless expansion | Minor (Op) | Inherited from base sucker registry design. Different deployers produce different addresses. |

### Pass 8 Invalidation Pattern Summary

| Category | Count | Description |
|---|---|---|
| By Design / Documented | 6 | Intentional behavior confirmed by code comments or NatSpec |
| Terminal/Token Trust | 4 | Assumes canonical terminals; unsupported token types |
| Low/No Impact | 6 | Conservative rounding, UX quirks, timing issues |
| Architectural Choice | 3 | Design tradeoffs (fail-open fees, aggregate surplus, self-service model) |
| Duplicates (within scan) | 3 | F7=F27, F10=F28, F19=H-22 |
| Cross-reference to Pass 7 | 2 | F19 corroborates H-22; NM-001 same as F19 |

---

## CertiK AI Scan — nana-router-terminal-v6 (Pass 9)

**Source:** CertiK AI-generated security scan (`nana-router-terminal-v6.md`)
**Scope:** JBRouterTerminal, JBRouterTerminalRegistry, JBPayRouteResolver, JBSwapLib (nana-router-terminal-v6)
**Method:** Corroboration against source code + parallel verification agents
**Date:** 2026-04-23

### Pass 9 Summary

| Original Severity | Count | Will Fix | Accepted | Invalid |
|---|---|---|---|---|
| Major | 1 | 1 (F13) | 0 | 0 |
| Medium | 6 | 2 (F12, F21) | 4 (F5, F10, F15, F20) | 0 |
| Minor | 14 | 4 (F1, F3, F7, F18) | 8 (F2, F4, F6, F8, F14, F17, F19 + F11 via F13) | 2 |
| **Total** | **21** | **7** | **12** | **2** |

**Result: 7 findings will be fixed. 12 accepted risk/by design. 2 invalid.**

### Acknowledged — Major (1)

#### F13: Manipulable Instantaneous V4 Liquidity Inflates Slippage Tolerance

| Field | Value |
|---|---|
| **Source** | CertiK F13 (Major) |
| **Contract** | `JBRouterTerminal.sol:_getV4SpotQuote` (L2308-2367), `JBSwapLib.sol:calculateImpact` |
| **Corroboration** | VALID |

**Description:** `_getV4SpotQuote` reads instantaneous in-range liquidity via `POOL_MANAGER.getLiquidity(id)` and passes it to `calculateImpact`. An attacker can inflate liquidity via JIT provisioning, deflating the impact calculation and producing a tight slippage band around a potentially manipulated spot price, enabling sandwich attacks.

**Mitigating factors:** Extensive security comments in the code (L2271-2301) already acknowledge V4 spot quoting limitations. Users SHOULD provide `quoteForSwap` metadata for V4 swaps. The sigmoid slippage formula has a 2% floor. The code documents this as a known design trade-off where V4 hooks may not expose TWAP oracles.

**Verdict:** Acknowledged — known V4 spot quoting limitation, documented in code. Users should provide off-chain quotes.

**Admin note — WILL FIX:** Increase V4 TWAP window from 30s → 120s to match V3 floor. Cap V4 slippage at 15-20%. Use fixed tolerance when no TWAP available. (Addresses F11 and F13 together.)

---

### Acknowledged — Medium (6)

#### F5: Registry Forwarding Uses Registry as Credit Holder

| Field | Value |
|---|---|
| **Source** | CertiK F5 (Medium) |
| **Contract** | `JBRouterTerminal.sol:_acceptFundsFor` (L1042-1066), `JBRouterTerminalRegistry.sol:pay` |
| **Corroboration** | VALID |

**Description:** When payments are forwarded through the registry, `_acceptFundsFor` uses `msg.sender` (the registry address) as the credit holder. Credit-based cashout payments routed through the registry will fail because the registry doesn't hold user credits. Code comment (L1055-1057) confirms this is intentional to prevent `originalPayer()` spoofing from stealing credits.

**Verdict:** Acknowledged — intentional security/functionality trade-off. Credit cashouts must go directly to the router, not through the registry.

**Admin note — ACCEPTED (by design):** Consider removing credit cashout accounting from the mechanism entirely. Document the incompatibility.

---

#### F10: Pool-Local V3 TWAP Trusted as Swap Floor for Permissionless Pools

| Field | Value |
|---|---|
| **Source** | CertiK F10 (Medium) |
| **Contract** | `JBRouterTerminal.sol:_getV3TwapQuote` (L2222-2269), `_discoverPool` (L1909-1946) |
| **Corroboration** | VALID |

**Description:** `_discoverPool` selects from permissionless Uniswap V3 pools by in-range liquidity. An attacker could deploy a pool with manipulated TWAP and higher liquidity than legitimate pools. The 2-minute minimum TWAP window (`MIN_TWAP_WINDOW = 120`) provides limited resistance.

**Verdict:** Acknowledged — users should provide `quoteForSwap` metadata from off-chain sources. TWAP-based auto-quoting is a best-effort fallback.

**Admin note — ACCEPTED:** Sandwich attack risk exists for users who don't provide off-chain quotes. Mitigated by TWAP window floors and sigmoid slippage formula.

---

#### F12: Missing Oracle Return Length Validation Causes OOB Revert

| Field | Value |
|---|---|
| **Source** | CertiK F12 (Medium) |
| **Contract** | `JBRouterTerminal.sol:_getV4SpotQuote` (L2335-2342) |
| **Corroboration** | VALID |

**Description:** The `try` success block accesses `tickCumulatives[1]` without verifying the array has at least 2 elements. If a V4 hook's `observe()` returns a shorter array, the OOB panic is NOT caught by `catch {}` (Solidity try/catch only catches external call failures, not panics in the success block). The transaction reverts.

**Verdict:** Acknowledged — DoS vector only (not fund loss). Affects only pools with broken/malicious hooks. Legitimate oracle implementations return arrays matching input length.

**Admin note — WILL FIX:** Add array length check before `tickCumulatives[1]` access to prevent OOB panic in try-success block.

---

#### F15: Liquidity-Based Pool Selection Enables Unsafe Spot Quoting

| Field | Value |
|---|---|
| **Source** | CertiK F15 (Medium) |
| **Contract** | `JBRouterTerminal.sol:_discoverPool` (L1909-1946), `JBPayRouteResolver.sol:_discoverAcceptedToken` (L166-226) |
| **Corroboration** | PARTIAL |

**Description:** Pool selection uses instantaneous in-range liquidity to rank candidates. An attacker could temporarily inflate liquidity in a manipulable pool to force selection. V3 TWAP quoting and user-provided quotes mitigate this, but the pool selection step itself is vulnerable to manipulation.

**Verdict:** Acknowledged — pool discovery is best-effort; users should provide off-chain quotes for reliable execution.

**Admin note — ACCEPTED:** Mitigated by V4 TWAP hardening (F13 fix). Residual risk accepted.

---

#### F20: Harmonic-Mean Liquidity Inflates V3 Slippage Tolerance

| Field | Value |
|---|---|
| **Source** | CertiK F20 (Medium) |
| **Contract** | `JBSwapLib.sol:calculateImpact` (L74-94), `JBRouterTerminal.sol:_getV3TwapQuote` (L2255) |
| **Corroboration** | PARTIAL |

**Description:** `OracleLibrary.consult` returns harmonic-mean liquidity over the TWAP window, which `calculateImpact` treats as executable depth. Brief low-liquidity periods can deflate the harmonic mean, inflating slippage tolerance. However, the 120-second minimum TWAP window, 10-minute default, and the sigmoid slippage formula's 2% floor provide meaningful mitigation.

**Verdict:** Acknowledged — mitigated by TWAP window floors and sigmoid parameters. Residual risk for LP manipulation during observation window.

**Admin note — ACCEPTED:** Harmonic mean is MORE resistant to manipulation than spot liquidity. Risk accepted.

---

#### F21: Incorrect `sqrtPriceLimitX96` Derivation from Average Execution Rate

| Field | Value |
|---|---|
| **Source** | CertiK F21 (Medium) |
| **Contract** | `JBSwapLib.sol:sqrtPriceLimitFromAmounts` (L107-168) |
| **Corroboration** | VALID |

**Description:** Derives `sqrtPriceLimitX96` from `minimumAmountOut / amountIn` (average execution rate) instead of the correct marginal price limit. The average rate is always better than the terminal marginal price, making the limit systematically too strict. This can cause premature partial fills for valid swaps. Unconsumed input is refunded via `_handleSwap`.

**Verdict:** Acknowledged — causes suboptimal execution (premature partial fills), not fund loss. Users can bypass via `quoteForSwap` metadata.

**Admin note — WILL FIX:** Remove `sqrtPriceLimitFromAmounts`. Use extreme price limits (MIN/MAX sqrtPrice). Rely on post-swap `minAmountOut` check for slippage protection. Well-tested.

---

### Acknowledged — Minor (12)

| # | CertiK ID | Title | Contract | Corroboration | Notes |
|---|---|---|---|---|---|
| 1 | F1 | Multi-hop circular route detection gap | `JBPayRouteResolver._isCircularTerminal` | PARTIAL | **WILL FIX** — Extend to bounded loop (max 5 hops) |
| 2 | F2 | `quoteForSwap` / auto-selected tokenOut mismatch | `JBRouterTerminal._pickPoolAndQuote` | VALID | **ACCEPTED** — Documentation issue, not code bug. Frontends should set quoteForSwap per expected output token |
| 3 | F3 | Fallback preview path reverts on terminal failure | `JBPayRouteResolver.previewBestPayRoute` (L934-955) | VALID | **WILL FIX** — Wrap fallback path in try/catch |
| 4 | F4 | Unbounded quadratic candidate enumeration gas cost | `JBPayRouteResolver._candidatePayRouteTokens` | PARTIAL | **ACCEPTED** — Bounded in practice (~5-10 terminals) |
| 5 | F6 | Forwarding-terminal receipt bypass | `JBRouterTerminal._isForwardingTerminal` (L974-983) | VALID | **ACCEPTED** — By design, forwarding terminals trusted by project owners |
| 6 | F7 | V3 callback delta off-by-one at boundary | `JBRouterTerminal.uniswapV3SwapCallback` (L406) | VALID | **WILL FIX** — Change `< 0` to `> 0` to match canonical Uniswap pattern |
| 7 | F8 | Multi-hop cashout slippage cleared after first hop | `JBRouterTerminal._cashOutLoop` (L1231) | VALID | **ACCEPTED (by design)** — Only final output matters; outer function enforces end-to-end minimum |
| 8 | F11 | V4 TWAP uses 30-second window | `JBRouterTerminal._TWAP_WINDOW` (L112) | VALID | **WILL FIX** — Addressed by F13 fix (30s → 120s) |
| 9 | F14 | Zero oracle quote disables swap protection | `JBRouterTerminal._quoteWithSlippage` (L2636) | PARTIAL | **ACCEPTED** — Zero quote means no liquidity; swap would fail anyway |
| 10 | F17 | Forwarder claim disables receipt check | `JBRouterTerminal._isForwardingTerminal` (L974-983) | PARTIAL | **ACCEPTED** — Forwarding terminals registered by project owners |
| 11 | F18 | Transient `originalPayer` corruption on nested calls | `JBRouterTerminalRegistry.originalPayer` (L88) | VALID | **WILL FIX** — Save/restore pattern instead of clearing to address(0) |
| 12 | F19 | Permit2 try/catch falls through to ERC20 allowance | `JBRouterTerminalRegistry._acceptFundsFor` (L536-540) | PARTIAL | **ACCEPTED (by design)** — Standard Permit2 fallback pattern |

---

### Invalid — Minor (2)

| # | CertiK ID | Title | Reason |
|---|---|---|---|
| 1 | F9 | Balance-delta over-credit for rebasing tokens | Router uses balance-before/after correctly; fee-on-transfer explicitly unsupported (L1101); `_enforceStandardTerminalReceipt` rejects discrepancies |
| 2 | F16 | Spoofable `originalPayer()` redirects refunds | `_resolveOriginalPayer` only queries `msg.sender`, which already controls the funds. Credit path deliberately avoids `originalPayer()` (L1057). No third-party fund theft possible. |

---

### Pass 9 Invalidation Pattern Summary

| Pattern | Count | Examples |
|---|---|---|
| Known design trade-off, documented in code | 8 | F5, F8, F13, F19 |
| Mitigated by user-provided `quoteForSwap` | 5 | F10, F13, F15, F20, F21 |
| View-only / DoS-only, no fund loss | 4 | F3, F4, F12, F14 |
| Bounded by practical configuration | 2 | F1, F4 |
| Misunderstood trust model | 2 | F9, F16 |

---

## CertiK AI Scan — nana-omnichain-deployers-v6 (Pass 10)

**Source:** CertiK AI-generated security scan (`nana-omnichain-deployer.md`)
**Scope:** JBOmnichainDeployer (nana-omnichain-deployers-v6)
**Method:** Corroboration against source code + verification agent
**Date:** 2026-04-23

### Pass 10 Summary

| Original Severity | Count | Will Fix | Accepted | Invalid |
|---|---|---|---|---|
| Medium | 3 | 1 (F2) | 0 | 2 |
| Minor | 5 | 1 (F1) | 3 (F5, F7, F8) | 1 |
| **Total** | **8** | **2** | **3** | **3** |

**Result: 2 findings will be fixed. 3 accepted risk/by design. 3 invalid.**

### Acknowledged — Medium (1)

#### F2: Controller Validation Trusts Untrusted Directory

| Field | Value |
|---|---|
| **Source** | CertiK F2 (Medium) |
| **Contract** | `JBOmnichainDeployer.sol:_validateController` (L928-934) |
| **Corroboration** | VALID |

**Description:** `_validateController` reads `controller.DIRECTORY()` from the user-provided controller, then trusts that directory's `controllerOf(projectId)`. A forged controller can return a fake directory that confirms itself. The deployer has no immutable `DIRECTORY` reference.

**Mitigating factors:** All calling paths (`_launchRulesetsFor`, `_queueRulesetsOf`) require `_requirePermissionFrom` with the project owner's permission. An attacker who already has owner/operator permission can already invoke controller operations directly. The code comment (L923-925) acknowledges the reflexive lookup as intentional.

**Verdict:** Acknowledged — defense-in-depth gap, but exploitability is limited to callers who already have project owner/operator permission.

**Admin note — WILL FIX:** Store immutable `DIRECTORY` reference in constructor. Validate against known directory instead of querying user-provided controller.

---

### Acknowledged — Minor (4)

| # | CertiK ID | Title | Contract | Corroboration | Notes |
|---|---|---|---|---|---|
| 1 | F1 | `transferFrom` instead of `safeTransferFrom` for NFT handoff | `JBOmnichainDeployer.sol:_launchProjectFor` (L719) | VALID | **WILL FIX** — Change to `safeTransferFrom` for ERC-721 safety |
| 2 | F5 | Unvalidated extra data hooks can brick live flows | `JBOmnichainDeployer.sol:_setup721` (L860-876) | VALID | **ACCEPTED** — Self-inflicted misconfiguration by project owner |
| 3 | F7 | Missing hook721 alias check enables double invocation | `JBOmnichainDeployer.sol:_setup721` (L862) | VALID | **ACCEPTED** — Self-inflicted misconfiguration by project owner |
| 4 | F8 | `_msgSender()` in deployment salt breaks cross-chain determinism | `JBOmnichainDeployer.sol:deploySuckersFor` (L161) | VALID | **ACCEPTED** — Documented and intentional replay protection |

---

### Invalid (3)

| # | CertiK ID | Title | Reason |
|---|---|---|---|
| 1 | F3 | Double application of tiered-721 split | Not double-counting — weight and amount are separate dimensions. The 721 hook reduces weight; the deployer reduces amount passed to extra hook. Different downstream consumers. |
| 2 | F4 | Sucker cash-outs use only local supply/surplus | Intentional design. Suckers redeem proportionally against local surplus with 0% tax. Cross-chain aggregation is correctly applied only for non-sucker cash-outs. Comment at L398 confirms. |
| 3 | F6 | Stale extra data hook persists on key reuse | RulesetId keys are always unique (timestamp-based with collision guard at L789-791). No scenario allows pre-existing data at a new rulesetId slot. |

---

### Pass 10 Invalidation Pattern Summary

| Pattern | Count | Examples |
|---|---|---|
| Intentional documented design | 2 | F4 (sucker local accounting), F8 (salt replay protection) |
| Permission-gated, self-inflicted only | 3 | F2, F5, F7 |
| Misunderstood lifecycle/key uniqueness | 1 | F6 |
| Misunderstood multi-dimensional accounting | 1 | F3 |

---

## CertiK AI Scan — nana-univ4-router-v6 (Pass 11)

**Source:** CertiK AI-generated security scan (`nana-univ4-router-v6.md`)
**Scope:** JBUniswapV4Hook, Oracle library (univ4-router-v6)
**Method:** Corroboration against source code + verification agent
**Date:** 2026-04-23

### Pass 11 Summary

| Original Severity | Count | Will Fix | Accepted | Invalid |
|---|---|---|---|---|
| Major | 2 | 0 | 1 (F2) | 1 (F9 = dup of F2) |
| Medium | 4 | 1 (F1) | 3 (F4, F6, F7) | 0 |
| Minor | 3 | 0 | 3 (F3, F5, F8) | 0 |
| **Total** | **9** | **1** | **7** | **1** |

**Result: 1 finding will be fixed. 7 accepted risk/by design. 1 duplicate.**

### Acknowledged — Major (1)

#### F2: Post-Action Oracle Observation Backfills TWAP with Post-Swap Tick

| Field | Value |
|---|---|
| **Source** | CertiK F2 (Major) |
| **Contract** | `Oracle.sol:transform` (L63-106), `JBUniswapV4Hook.sol:_afterSwap` |
| **Corroboration** | VALID |

**Description:** `Oracle.transform` records the current tick as `tickCumulative` for the entire elapsed time since the last observation. When called from `_afterSwap`, the tick is the POST-swap tick, so the entire time interval between the last observation and the swap is credited with the post-action price. For large swaps with infrequent observations, this corrupts the TWAP by retroactively projecting the post-swap price backwards in time.

**Impact:** An attacker can front-run with a large swap, backfill the TWAP history with a moved tick, and exploit downstream protocols that rely on the oracle. The corruption worsens with less frequent observations.

**Mitigating factors:** Uniswap V4 pools with active trading have frequent observations that limit the backfill window. The `MAX_TWAP_CARDINALITY = 1024` caps total history. `JBRouterTerminal` uses independent TWAP quoting for its own slippage, so the primary consumer of this oracle is external integrators.

**Admin note — ACCEPTED:** This is the same behavior as Uniswap V3's native oracle. Splitting observations into pre/post intervals would double gas cost and deviate from V3's well-understood semantics. JBRouterTerminal uses independent TWAP quoting (F13 hardened). External integrators should verify TWAP quality via observation count.

---

### Acknowledged — Medium (4)

#### F1: `_settleOutput` Trusts Terminal's Reported Output for Fee-on-Transfer Tokens

| Field | Value |
|---|---|
| **Source** | CertiK F1 (Medium) |
| **Contract** | `JBUniswapV4Hook.sol:_settleOutput` |
| **Corroboration** | VALID |

**Description:** `_settleOutput` uses the terminal's return value from `addToBalanceOf` as the amount settled, rather than measuring the actual balance delta. For fee-on-transfer tokens, the terminal receives fewer tokens than reported, creating a bookkeeping discrepancy.

**Verdict:** Acknowledged — fee-on-transfer tokens are explicitly unsupported by the Juicebox protocol (documented in JBMultiTerminal and JBRouterTerminal).

**Admin note — WILL FIX:** Use balance-before/after measurement instead of trusting terminal return value. Defense-in-depth: prevents PoolManager settlement from over-crediting if a fee-on-transfer token is ever used in a pool.

---

#### F4: Insufficient TWAP Falls Back to Manipulable Spot Price

| Field | Value |
|---|---|
| **Source** | CertiK F4 (Medium) |
| **Contract** | `JBUniswapV4Hook.sol:observeTWAP`, `JBRouterTerminal._getV4SpotQuote` |
| **Corroboration** | VALID |

**Description:** When the oracle has insufficient observations (< 2 data points), `observeTWAP` returns the current spot tick as the TWAP value. This fallback is manipulable via JIT liquidity or sandwich attacks. Downstream consumers (including JBRouterTerminal) receive a manipulable "TWAP" that is actually just spot price.

**Verdict:** Acknowledged — documented behavior. The JBRouterTerminal F13 fix now applies fixed 15% slippage tolerance when no TWAP is available, mitigating the downstream impact. External consumers should verify TWAP quality via observation count.

**Admin note — ACCEPTED:** Mitigated by F13 fix (15% fixed slippage when no TWAP). Residual risk for external callers who don't check observation count.

---

#### F6: Synchronous TWAP Observation Growth Enables Gas-Griefing DoS

| Field | Value |
|---|---|
| **Source** | CertiK F6 (Medium) |
| **Contract** | `Oracle.sol:grow` (L151-175), `JBUniswapV4Hook.sol:increaseOracleCardinalityNext` |
| **Corroboration** | VALID (mitigated) |

**Description:** `increaseOracleCardinalityNext` calls `Oracle.grow`, which initializes new oracle slots in a synchronous loop. Growing cardinality by large amounts (e.g., 1024 slots) costs significant gas. An attacker can grief by calling `increaseOracleCardinalityNext` with `MAX_TWAP_CARDINALITY` before a user's transaction, inflating gas costs for subsequent operations that trigger oracle writes.

**Mitigating factors:** Bounded by `MAX_TWAP_CARDINALITY = 1024`, which limits max growth. The `grow` function is permissionless but idempotent — once grown, it can't be called again to the same size. Gas griefing is a one-time cost per cardinality increase.

**Verdict:** Acknowledged — bounded by MAX_TWAP_CARDINALITY. One-time cost, not repeatable. Practical impact limited.

**Admin note — ACCEPTED:** Bounded by MAX_TWAP_CARDINALITY = 1024. One-time cost per cardinality increase, not repeatable. Adding per-call caps just distributes the cost across more transactions.

---

#### F7: Unchecked Terminal Fee Arithmetic Can Cause Sell-Side DoS

| Field | Value |
|---|---|
| **Source** | CertiK F7 (Medium) |
| **Contract** | `JBUniswapV4Hook.sol:_settleOutput` |
| **Corroboration** | VALID |

**Description:** Fee computation in `_settleOutput` can revert if the terminal's fee calculations produce unexpected values (e.g., fee > amount). This would cause sell-side operations to revert, blocking token sales through the hook.

**Mitigating factors:** The code wraps terminal calls in try-catch. If the fee calculation fails, the hook defaults fee to 0 and proceeds. The DoS only affects the specific transaction, not the pool or other operations.

**Verdict:** Acknowledged — try-catch fallback prevents persistent DoS. Fee defaults to 0 on failure.

**Admin note — ACCEPTED:** Existing try-catch fallback already handles this. Fee defaults to 0 on arithmetic failure.

---

### Acknowledged — Minor (3)

| # | CertiK ID | Title | Contract | Corroboration | Notes |
|---|---|---|---|---|---|
| 1 | F3 | Single observation returns spot tick as TWAP | `JBUniswapV4Hook.observeTWAP` | PARTIAL | **ACCEPTED** — Internal routing mitigated by F13 fix (15% fixed slippage). External callers should check observation count. |
| 2 | F5 | `_beforeSwap` ignores caller's `sqrtPriceLimitX96` | `JBUniswapV4Hook._beforeSwap` | VALID | **ACCEPTED (by design)** — sqrtPriceLimitX96 is irrelevant for JB-routed swaps (no AMM ticks crossed). V4-path swaps apply it normally via PoolManager. |
| 3 | F8 | Buy helper truncates currency IDs to `uint32` | `JBUniswapV4Hook._getBuyHelper` | VALID | **ACCEPTED** — View-only preview helper. Even a collision (~0.001% probability) only affects quote estimation, not swap execution. |

---

### Invalid (1)

| # | CertiK ID | Title | Reason |
|---|---|---|---|
| 1 | F9 | Oracle.transform backfills elapsed time with post-action state | DUPLICATE of F2 — identical finding about post-swap tick backfilling TWAP history. |

---

### Pass 11 Invalidation Pattern Summary

| Pattern | Count | Examples |
|---|---|---|
| Unsupported token type (fee-on-transfer) | 1 | F1 |
| Known oracle limitation, mitigated by F13 fix | 3 | F3, F4, F2 (TWAP fallback/backfill) |
| Bounded by MAX_TWAP_CARDINALITY | 1 | F6 |
| Try-catch fallback prevents DoS | 1 | F7 |
| Outer protocol enforces limit | 1 | F5 |
| Negligible collision probability | 1 | F8 |
| Duplicate | 1 | F9 |

---

## Audit Findings Summary (All Passes)

### Open Findings (3)

| ID | Severity | Repo | Title |
|---|---|---|---|
| **L-22** | LOW | nana-suckers-v6 | Missing LINK Token Addresses for Polygon, Avalanche, BNB |
| **L-23** | LOW | nana-suckers-v6 | _findNonceForLeafIndex O(N) Reverse Scan Can Exceed Gas Limit |
| **L-25** | LOW | nana-router-terminal-v6 | Unquotable High-Liquidity V3 Pools Can Block Usable Routes |

### Previously Resolved (Pass 12)

| ID | Severity | Repo | Resolution |
|---|---|---|---|
| ~~**H-27**~~ | HIGH | revnet-core-v6 | **FIXED** — use `context.surplus.currency` instead of token address encoding |
| ~~**M-41**~~ | MEDIUM | nana-router-terminal-v6 | **FIXED** — pass hookData with minAmountOut to V4 swaps |
| ~~**M-42**~~ | MEDIUM | nana-suckers-v6 | **FIXED** — unwrap WETH before native ETH settlement in V4 callback |
| ~~**M-43**~~ | MEDIUM | nana-ownable-v6 | **FIXED** — reset permissionId when resolved owner diverges from stored owner |
| ~~**M-44**~~ | MEDIUM | nana-omnichain-deployers-v6 | **FIXED** — propagate cashOutCount to extra hooks |
| ~~**L-20**~~ | LOW | revnet-core-v6 | **FIXED** — extract internal `_borrowFrom` bypassing redundant permission check |
| ~~**L-21**~~ | LOW | nana-suckers-v6 | **FIXED** — call fromRemote before writing batch metadata and conversion rates |
| ~~**L-24**~~ | LOW | nana-buyback-hook-v6 | **FIXED** — guard against FOT token accounting drift |
| ~~**L-26**~~ | LOW | univ4-lp-split-hook-v6 | **FIXED** — skip unpriced tokens in highest-value terminal selection |

### Previously Resolved (Passes 7-11)

| ID | Severity | Repo | Resolution |
|---|---|---|---|
| ~~**H-22**~~ | HIGH | revnet-core-v6 | **FIXED** — `_afterTransferTo` pattern in REVLoans (PR #130, merged) |
| ~~**H-23**~~ | HIGH | revnet-core-v6 | **Accepted risk** — cross-currency terminals are caller-configured; misconfigured terminal is caller's problem |
| ~~**M-34**~~ | MEDIUM | nana-project-handles-v6 | **FIXED** — control char validation rejects bytes < 0x20 and 0x7F (PR #5, merged) |
| ~~**M-35**~~ | MEDIUM | revnet-core-v6 | **FIXED** — reordered `_totalBorrowedFrom` to check zero before external call (PR #130, merged) |
| ~~**M-36**~~ | MEDIUM | revnet-core-v6 | **FIXED** — stage ordering validated against normalized timestamps (PR #130, merged) |

### Cumulative Statistics (Passes 1-13)

| Pass | Source | Scope | Findings Reviewed | Actionable | Acknowledged | Invalid/FP |
|---|---|---|---|---|---|---|
| 1 | Component audits (7 reports) | nana-core-v6 | ~40 | 0 | 0 | ~40 |
| 2 | Cross-component analysis | nana-core-v6 | 12 | 0 | 0 | 12 |
| 3 | Formal verification | nana-core-v6 | 8 | 0 | 0 | 8 |
| 4 | Economic simulation | nana-core-v6 | 6 | 0 | 0 | 6 |
| 5 | Nemesis (first run) | 6 repos | 90 | 5 | 3 | 82 |
| 6 | CertiK AI (nana-core-v6) | nana-core-v6 | 67 | 0 | 3 | 64 |
| 7 | Nemesis (second run) | 20 repos | 9 | 2 | 0 | 7 |
| 8 | CertiK AI (revnet-core-v6) | revnet-core-v6 | 30 | 3 | 14 | 13 |
| 9 | CertiK AI (nana-router-terminal-v6) | nana-router-terminal-v6 | 21 | 7 | 12 | 2 |
| 10 | CertiK AI (nana-omnichain-deployers-v6) | nana-omnichain-deployers-v6 | 8 | 2 | 3 | 3 |
| 11 | CertiK AI (nana-univ4-router-v6) | univ4-router-v6 | 9 | 1 | 7 | 1 |
| 12 | Pashov (Codex `20260428-213302` + Claude `20260428-213315`) | 21 repos | 33 | 12 | 0 | 21 |
| 13 | Gemini Paranoid QA | All repos | 25 | 0 | 4 | 21 |
| **Total** | | | **~358** | **32** | **48** | **~278** |

---

## Pass 12 — Pashov Solidity Auditor (2026-04-28/29)

**Source:** Codex run `20260428-213302` (21/21 repos, 13 reports) + Claude run `20260428-213315` (11/21 repos partial, 3 reports)
**Raw findings:** 20 (Codex) + 13 (Claude) = 33 total
**After triage:** 12 genuine new | 1 downgraded | 8 duplicate | 5 false positive | 7 by-design/documented

### Corroborations

Pass 12 corroborated 6 existing findings:
- **C-5** (Hidden Token Burn/Reveal) — re-identified by both Codex and Claude
- **M-22** (Migration Verifier Fallback-Held Tiers) — re-identified by Codex
- **H-25** (Distributor Snapshot Manipulation) — re-identified by Codex (the eager locking IS the fix)
- **H-22** (Controller-Prepaid ERC20 Credits) — re-identified by Codex (balance-delta accounting IS the fix)
- **M-2/H-11** (Deployment Squatting/Convergence) — re-identified by Codex
- **L-9** (Banny Resolver Re-Initialization) — re-identified by Codex

### Duplicates / False Positives / By-Design (21)

| # | Title | Repo | Verdict | Reason |
|---|---|---|---|---|
| 1 | Revealable hidden supply inflates loan/cashout value | revnet-core-v6 | DUPLICATE of C-5 | Hidden token mechanics are by-design (RISKS.md §2, §4) |
| 2 | Hidden tokens inflate borrowable amount | revnet-core-v6 | DUPLICATE of C-5 | Same as above, loan-side angle |
| 3 | Fee-on-transfer tokens cause _addTo mismatch | revnet-core-v6 | INFORMATIONAL | Protocol-wide design limitation, not REVLoans-specific. Tx reverts, no fund loss. |
| 4 | V4 Spot Tick Fallback sandwich manipulation | nana-suckers-v6 | BY-DESIGN | Documented in RISKS.md §10.6 — spot fallback preferred over stuck bridge messages |
| 5 | retrySwap TWAP 120s manipulation | nana-suckers-v6 | FALSE POSITIVE | V3 default is 600s, not 120s. 120s is floor only. Overstated risk. |
| 6 | Conversion rate truncation dust extraction | nana-suckers-v6 | FALSE POSITIVE | Standard rounding favors protocol (project keeps dust). Not extractable by attacker. |
| 7 | Retained fee ETH inflates project balance | nana-suckers-v6 | BY-DESIGN | Documented in RISKS.md §8 — bounded by MAX_TO_REMOTE_FEE (0.001 ETH) |
| 8 | assert() consumes all gas on failure | nana-suckers-v6 | FALSE POSITIVE | Incorrect for Solidity 0.8.28 — assert uses Panic(0x01), does NOT consume all gas |
| 9 | Split-routed NFT mints retain full cash-out weight | nana-721-hook-v6 | DUPLICATE of L-3/H-7 | Documented in RISKS.md §8.2/§8.6. Cash-out weight = treasury share, not purchase price. |
| 10 | Registry-routed metadata ignores caller minima | nana-buyback-hook-v6 | FALSE POSITIVE | Registry passes context unchanged — no namespace transformation occurs |
| 11 | Dust-Sized LP fee collections bypass fee routing | univ4-lp-split-hook-v6 | BY-DESIGN | Standard integer rounding. Min amount for 1-wei fee is 40 wei. Economically insignificant. |
| 12 | Commitment payout failures finalized as winner surplus | defifa | BY-DESIGN | Try-catch is intentional — prevents permanent fund lock when split recipients revert |
| 13 | Migration verifier skips owner checks for fallback-held tiers | banny-retail-v6 | DUPLICATE of M-22 | Already ACCEPTED |
| 14 | Same-salt sucker deployments create non-peer suckers | nana-omnichain-deployers-v6 | BY-DESIGN | Documented in RISKS.md §9 — _msgSender() inclusion is intentional replay protection |
| 15 | Future-round snapshots frozen before round starts | nana-distributor-v6 | DUPLICATE of H-25 | Eager locking IS the fix for H-25 |
| 16 | Global prepaid ERC20 balances can be hijacked | nana-distributor-v6 | DUPLICATE of H-22 | Balance-delta accounting correctly handles controller-prepaid path |
| 17 | Current NFT IDs spend snapshot votes from different NFTs | nana-distributor-v6 | FALSE POSITIVE | pastVotes cap correctly prevents double-counting across NFTs |
| 18 | Canonical project IDs squatted during recovery | deploy-all-v6 | DUPLICATE of M-2/H-11 | Both Deploy and Resume correctly validate ownership |
| 19 | Banny resolver ownership handed off before init | deploy-all-v6 | RELATED to L-9 | Deployment would revert if mismatch — caught immediately, no runtime impact |
| 20 | Fee route failures forgive protocol fees | nana-fee-project-deployer-v6 | BY-DESIGN | Core try-catch fee handling + held fees mechanism. Fees held, not forgiven. |
| 21 | CCIP Encoding Mismatch (JBCCIPSucker vs JBSwapCCIPSucker) | nana-suckers-v6 | DOWNGRADED | Cross-type peering prevented by CREATE2 deployment mechanism. Document as constraint. |

---

### H-27. Cross-Chain Cash-Outs Silently Drop Remote Surplus Due to Currency Parameter Mismatch — FIXED

| Field | Value |
|-------|-------|
| **Repo** | revnet-core-v6 |
| **File** | `src/REVOwner.sol:181` + `src/REVLoans.sol:378` |
| **Source** | Pashov Claude run (conf 95) |
| **Auditor confidence** | 95 |
| **My confidence** | **92 — CORROBORATED by test file** |
| **Known issue?** | No |

**Description:** `REVOwner.beforeCashOutRecordedWith` passes `currency: uint256(uint160(context.surplus.token))` to `SUCKER_REGISTRY.remoteSurplusOf`. For native ETH, this is `61166`. But the sucker registry indexes surplus by `JBCurrencyIds.ETH = 1` (stored via `_peerChainSurplus`). Since `61166 != 1`, `remoteSurplusOf` always returns zero for cross-chain revnets. The same mismatch exists in `REVLoans._borrowableAmountFrom` at line 378.

**Impact:** On cross-chain revnets, the bonding curve sees only local surplus. Cash-outs underpay (local surplus / cross-chain supply). Loans underlend (same deflated curve). The cross-chain surplus aggregation feature is non-functional.

**Mitigation:** Use `context.surplus.currency` instead of `uint256(uint160(context.surplus.token))` in REVOwner. Alternatively, align the currency encoding between JBSuckerLib snapshot messages and JBAccountingContext (one uses `JBCurrencyIds.ETH = 1`, the other uses `uint32(uint160(NATIVE_TOKEN)) = 61166`).

Admin note: fix. Verify which currency encoding is canonical and align both sides. Add fork tests with cross-chain surplus to cover this.

---

### M-41. Hooked V4 Pools Are Discoverable But Not Executable — FIXED

| Field | Value |
|-------|-------|
| **Repo** | nana-router-terminal-v6 |
| **File** | `src/JBRouterTerminal.sol:432,1973` |
| **Source** | Pashov Codex run (conf 85) |
| **Auditor confidence** | 85 |
| **My confidence** | **85 — CORROBORATED** |
| **Known issue?** | No |

**Description:** `_discoverV4Pool` selects pools with `hooks = IHooks(UNIV4_HOOK)` as candidates when they have the deepest liquidity. But `unlockCallback` passes `hookData: ""` (empty) to `POOL_MANAGER.swap()`. The `JBUniswapV4Hook._beforeSwap` requires `hookData.length >= 32` and reverts with `JBUniswapV4Hook_AmountOutMinRequired()`. If the hooked pool dominates liquidity for a pair, all routed swaps for that pair revert.

**Mitigation:** Either pass `hookData: abi.encode(uint256(minAmountOut))` in `unlockCallback`, or exclude `UNIV4_HOOK` pools from `_discoverV4Pool` discovery (the buyback hook already correctly passes hookData).

Admin note: fix.

---

### M-42. V4 WETH Swaps Can Spend Native ETH Instead of WETH — FIXED

| Field | Value |
|-------|-------|
| **Repo** | nana-suckers-v6 |
| **File** | `src/libraries/JBSwapPoolLib.sol:110,216,830` |
| **Source** | Pashov Codex run (conf 90) |
| **Auditor confidence** | 90 |
| **My confidence** | **80 — CORROBORATED** |
| **Known issue?** | No |

**Description:** `executeSwap` normalizes raw WETH and `NATIVE_TOKEN` together. For V4 swaps, WETH is converted to `address(0)` at line 830. The V4 unlock callback then settles with `poolManager.settle{value: amountIn}()`, spending the contract's native ETH balance while the WETH ERC-20 tokens remain unspent. This affects the inbound CCIP path when WETH is delivered and a V4 swap is selected.

**Impact:** Accounting drift — WETH stays in sucker while ETH is consumed. Can cause V4 settlement to revert if insufficient ETH. Stranded WETH eventually flows to project via `amountToAddToBalanceOf`.

**Mitigation:** When `originalTokenIn` is WETH (not `NATIVE_TOKEN`), use WETH ERC-20 settlement instead of native ETH for V4 swaps. The V3 path already handles this correctly (line 266-269 checks `originalTokenIn == NATIVE_TOKEN`).

Admin note: fix.

---

### M-43. Project NFT Transfers Keep Prior Delegated-Owner Permission Policy — FIXED

| Field | Value |
|-------|-------|
| **Repo** | nana-ownable-v6 |
| **File** | `src/JBOwnableOverrides.sol:122-151` |
| **Source** | Pashov Codex run (conf 90) |
| **Auditor confidence** | 90 |
| **My confidence** | **82 — CORROBORATED** |
| **Known issue?** | No |

**Description:** When a project NFT is transferred via standard ERC-721 `transferFrom`, `_transferOwnership` is never called, so the stored `jbOwner.permissionId` persists. If the previous owner set `permissionId = 42`, and the new NFT holder had previously granted permission ID 42 to some address for an unrelated purpose on the same `projectId`, those addresses unexpectedly gain owner access to the `JBOwnable` contract. RISKS.md §3 incorrectly states "permissionId resets on transfer" — this is only true for `_transferOwnership`, not NFT transfers.

**Mitigation:** In `_checkOwner`, detect that the resolved owner differs from a stored owner hint and force `permissionId` to 0 when they diverge. Alternatively, update RISKS.md to correctly document that `permissionId` persists across NFT transfers and advise project buyers to audit JBOwnable contracts.

Admin note: fix. The RISKS.md assertion about reset-on-transfer is incorrect and should be fixed regardless.

---

### M-44. NFT Cash-Outs Forward Stale Counts to Extra Hooks — FIXED

| Field | Value |
|-------|-------|
| **Repo** | nana-omnichain-deployers-v6 |
| **File** | `src/JBOmnichainDeployer.sol:454` |
| **Source** | Pashov Codex run (conf 85) |
| **Auditor confidence** | 85 |
| **My confidence** | **80 — CORROBORATED** |
| **Known issue?** | No |

**Description:** When the 721 hook converts NFT metadata into a nonzero `cashOutCount`, the wrapper updates `hookContext.cashOutTaxRate`, `totalSupply`, and `surplus.value` before forwarding to the extra hook — but leaves `hookContext.cashOutCount` at the caller's original value. The extra hook's internal logic operates on stale `cashOutCount` (e.g., 0 when the 721 hook converted it to a tier-weight-based value). If the extra hook uses `cashOutCount` for policy decisions, those decisions are based on wrong inputs.

**Mitigation:** Add `hookContext.cashOutCount = cashOutCount;` at line 454 alongside the other field updates.

Admin note: fix.

---

### L-20. reallocateCollateralFromLoan Requires Undocumented OPEN_LOAN Permission — FIXED

| Field | Value |
|-------|-------|
| **Repo** | revnet-core-v6 |
| **File** | `src/REVLoans.sol:817,628` |
| **Source** | Pashov Claude run (conf 85) |
| **Auditor confidence** | 85 |
| **My confidence** | **78** |
| **Known issue?** | No |

**Description:** `reallocateCollateralFromLoan` checks `REALLOCATE_LOAN` permission, then calls the public `borrowFrom` which independently checks `OPEN_LOAN` permission. The loan owner passes both checks automatically (`sender == account`), but a delegated operator with only `REALLOCATE_LOAN` reverts at the inner `borrowFrom` permission check. The documented permission model is incomplete.

**Mitigation:** Extract `borrowFrom`'s core logic into an internal `_borrowFrom` and call that from `reallocateCollateralFromLoan`, bypassing the redundant permission check. Or document that `REALLOCATE_LOAN` requires `OPEN_LOAN`.

---

### L-21. ccipReceive Writes Batch Range Data Before fromRemote Rejects Stale Nonce — FIXED

| Field | Value |
|-------|-------|
| **Repo** | nana-suckers-v6 |
| **File** | `src/JBSwapCCIPSucker.sol:308-348` |
| **Source** | Pashov Claude run (conf 85) |
| **Auditor confidence** | 85 |
| **My confidence** | **70** |
| **Known issue?** | No |

**Description:** In `ccipReceive`, `_batchStartOf`, `_batchEndOf`, `_highestReceivedNonce`, and `_conversionRateOf` are written unconditionally before `this.fromRemote(root)` is called. If `fromRemote` rejects the root as stale, the batch metadata persists as orphaned storage. `_findNonceForLeafIndex` may discover this orphaned data and return a stale nonce, potentially applying the wrong conversion rate.

**Mitigation:** Call `fromRemote` first to validate the nonce, then write batch/conversion data only if the inbox nonce was incremented.

---

### L-22. Missing LINK Token Addresses for Polygon, Avalanche, and BNB Chains — OPEN

| Field | Value |
|-------|-------|
| **Repo** | nana-suckers-v6 |
| **File** | `src/libraries/CCIPHelper.sol:187-211` |
| **Source** | Pashov Claude run (conf 82) |
| **Auditor confidence** | 82 |
| **My confidence** | **82** |
| **Known issue?** | No |

**Description:** `linkOfChain()` has no entries for Polygon (137), Avalanche (43114), or BNB (56), yet `routerOfChain()`, `selectorOfChain()`, and `wethOfChain()` all support those chains. Deploying a sucker on these chains with `transportPayment == 0` (LINK fee mode) reverts with `CCIPHelper_UnsupportedChain`. Native ETH fee mode still works.

**Mitigation:** Add LINK token addresses: Polygon `0xb0897686c545045aFc77CF20eC7A532E3120E0F1`, Avalanche `0x5947BB275c521040051D82396571985b38D4e7bF`, BNB `0x404460C6A5EdE2D891e8297795264fDe62ADBB75`.

---

### L-23. _findNonceForLeafIndex O(N) Reverse Scan Can Exceed Gas Limit — OPEN

| Field | Value |
|-------|-------|
| **Repo** | nana-suckers-v6 |
| **File** | `src/JBSwapCCIPSucker.sol:484-513` |
| **Source** | Pashov Claude run (conf 80) |
| **Auditor confidence** | 80 |
| **My confidence** | **65** |
| **Known issue?** | No |

**Description:** When the cache hint and neighbor probe miss, `_findNonceForLeafIndex` scans from `_highestReceivedNonce` down to 1, each iteration reading 2 SLOADs. For a long-lived sucker with hundreds of nonces, a non-sequential claim after cache invalidation could cost millions of gas. The cache optimization makes sequential claims O(1), limiting this to edge cases.

**Mitigation:** Acceptable with cache for normal usage. Consider bounding the slow path to ~50 nonces and reverting if target not found. Document in RISKS.md.

---

### L-24. Fee-on-Transfer Project Tokens Not Fully Restored After Failed Cash-Out Sells — FIXED

| Field | Value |
|-------|-------|
| **Repo** | nana-buyback-hook-v6 |
| **File** | `src/JBBuybackHook.sol:220-247` |
| **Source** | Pashov Codex run (conf 85) |
| **Auditor confidence** | 85 |
| **My confidence** | **75** |
| **Known issue?** | No |

**Description:** In `afterCashOutRecordedWith`, the sell-side failure path mints `cashOutCountToSell` tokens to the hook, then transfers them back to the holder. For fee-on-transfer project tokens, the holder receives `cashOutCountToSell - feeOnTransferTax`, less than the amount the terminal burned. The holder loses the FOT tax.

**Mitigation:** Document as accepted risk — FOT project tokens (custom ERC-20 with transfer fees) are not a supported configuration. Standard `JBERC20` has no transfer fees.

---

### L-25. Unquotable High-Liquidity V3 Pools Can Block Usable Routes — OPEN

| Field | Value |
|-------|-------|
| **Repo** | nana-router-terminal-v6 |
| **File** | `src/JBRouterTerminal.sol:2463-2494` |
| **Source** | Pashov Codex run (conf 75) |
| **Auditor confidence** | 75 |
| **My confidence** | **68** |
| **Known issue?** | No |

**Description:** `_discoverPool` picks the highest-liquidity V3 pool before `_getV3TwapQuote` checks TWAP history. A fresh high-liquidity V3 pool without observation history wins discovery but fails the TWAP check, reverting the entire routing flow while lower-liquidity pools with adequate TWAP are ignored.

**Impact:** Griefing vector — expensive (requires real liquidity), self-correcting (pool accumulates observations over time), bypassable (callers can provide `quoteForSwap` metadata to skip auto-quoting).

**Mitigation:** Fall back to the next-best pool if TWAP quoting fails for the best pool. Or filter out V3 pools without sufficient observation history during discovery.

---

### L-26. Raw-Balance Oracle Fallback Can Block Permissionless Pool Deployment — FIXED

| Field | Value |
|-------|-------|
| **Repo** | univ4-lp-split-hook-v6 |
| **File** | `src/JBUniswapV4LPSplitHook.sol:320,387-390` |
| **Source** | Pashov Codex run (conf 75) |
| **Auditor confidence** | 75 |
| **My confidence** | **65** |
| **Known issue?** | No |

**Description:** In `_findHighestValueTerminalTokenOf`, when a price feed reverts, the code uses `ethValue = balance` (raw token balance as ETH-equivalent). A donated unpriced token with large raw balance can be selected as the "highest value" terminal token, causing downstream pool deployment to fail if that token can't form a valid Uniswap pair.

**Impact:** Griefing vector against permissionless deployment — requires project to have accepted a worthless token (operator misconfiguration). Manual deployment path still works.

**Mitigation:** Skip tokens with no price feed instead of using raw balance as fallback.

---

## Pass 13 — Gemini Paranoid QA Scan (2026-04-29)

**Source:** `GEM_AUDIT_REPORT.md` — Gemini "Paranoid QA & Security Lead" scan
**Raw findings:** 10 Critical + 5 High + 8 Medium + 6 Low/Gas = 29 total
**After triage:** 0 genuine new | 4 corroborate existing | 25 false positive/by-design/duplicates

### Corroborations

- **2.7** (Default Hook Hijack) → corroborates **H-17** (ACCEPTED)
- **2.8** (Permissionless Pool Deployment Arbitrage) → corroborates **M-38** (ACCEPTED by design)
- **3.2** (Cross-Chain Root Overwrite) → corroborates **H-13** (FIXED)
- **3.5** (Sucker Supply Desync) → corroborates **M-33** (ACCEPTED)

### All Gemini Findings — Triage

| # | Gemini ID | Severity | Title | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | 2.1 | CRITICAL | Reentrancy Double-Counting in JBMultiTerminal | **FALSE POSITIVE** | balance-before/after IS the reentrancy protection. ERC777 not a supported token type. |
| 2 | 2.2 | CRITICAL | Reserve Drainage via Shared Balance in JBBuybackHook | **FALSE POSITIVE** | Hook uses weight/token count from data hook context, NOT terminal balance deltas. Mechanism described does not exist. |
| 3 | 2.3 | CRITICAL | Synergistic Hidden Token Multiplier Attack | **FALSE POSITIVE** | "Fake terminal" requires owner action (self-harm). Hidden token math fixed in C-5. |
| 4 | 2.4 | CRITICAL | Initial Project Configuration Hijacking | **FALSE POSITIVE** | Sequential IDs by design. No pre-announced IDs to "steal." Frontrunner must guess victim's configuration. |
| 5 | 2.5 | CRITICAL | $REV Auto-Issuance Token Lock | **FALSE POSITIVE** | rulesetId = block.timestamp, not latestId+1. Claim based on incorrect understanding of JBRulesets ID mechanism. |
| 6 | 2.6 | CRITICAL | Surplus Inflation via Redundant Payout Limits | **FALSE POSITIVE** | Payout limits are unique per terminal/token/currency combo. Duplicate limits not possible within same key. |
| 7 | 2.7 | CRITICAL | Default Hook Hijack (Buyback Registry) | **DUPLICATE of H-17** | Already ACCEPTED risk — registry owner is trusted. |
| 8 | 2.8 | CRITICAL | Permissionless Pool Deployment Arbitrage | **DUPLICATE of M-38** | Already ACCEPTED by design. |
| 9 | 2.9 | CRITICAL | Price Feed Bricking (Zero Price) | **FALSE POSITIVE** | JBChainlinkV3PriceFeed already reverts on zero/negative prices and checks staleness. |
| 10 | 2.10 | CRITICAL | Terminal Migration Self-Grief / Fund Lock | **INFORMATIONAL** | Owner self-harm only. Requires project owner to call migrateBalanceOf(to=self). |
| 11 | 3.1 | HIGH | Payout Limit Reset via Terminal Migration | **FALSE POSITIVE** | Limits are per-terminal by design. New terminal needs its own limit config in JBFundAccessLimits. Migration doesn't bypass — it resets correctly. |
| 12 | 3.2 | HIGH | Cross-Chain Root Overwrite (Nonce Gaps) | **DUPLICATE of H-13** | Already FIXED (`649f90a`). |
| 13 | 3.3 | HIGH | Protocol Fee Evasion via Obscure Tokens | **BY-DESIGN** | Fee try-catch + held fees mechanism is documented. Fees are held, not forgiven. processHeldFeesOf retries. |
| 14 | 3.4 | HIGH | Oracle Arbitrage on Payouts | **ACCEPTED RISK** | Standard Chainlink spot price usage. Protocol-wide, same as all DeFi using Chainlink. |
| 15 | 3.5 | HIGH | Sucker Supply Desync / Flash Manipulation | **DUPLICATE of M-33** | Already ACCEPTED risk — cross-chain surplus staleness is inherent to bridge delays. |
| 16 | 4.1 | MEDIUM | Sucker Root Stomping | **FALSE POSITIVE** | Each token has its own outbox tree keyed by token address. No cross-token overwrite possible. |
| 17 | 4.2 | MEDIUM | Blind Decoding of HookData (V4 Hook) | **FALSE POSITIVE** | Hook validates hookData.length >= 32 before decoding. Not "blind." |
| 18 | 4.3 | MEDIUM | LP Range Manipulation via Surplus Inflation | **INFORMATIONAL** | Requires payment + cashout in same tx. Bonding curve limits extractable value. |
| 19 | 4.4 | MEDIUM | Bridge Message Loss | **BY-DESIGN** | Inherent to all cross-chain bridges. Documented in RISKS.md. |
| 20 | 4.5 | MEDIUM | Registry-Keyed Metadata Mismatch | **FALSE POSITIVE** | Registry passes context unchanged — no namespace transformation. Same finding rejected in pass 12. |
| 21 | 4.6 | MEDIUM | Migration Fee Bypass | **ACCEPTED RISK** | Related to M-7 (DOWNGRADED). Requires owner action. |
| 22 | 4.7 | MEDIUM | Verified Handle Spoofing | **FALSE POSITIVE** | Bidirectional ENS verification IS the authorization mechanism. ENS text record → project ID is by-design. |
| 23 | 4.8 | MEDIUM | 39-Wei Protocol Fee Bypass | **FALSE POSITIVE** | Gas cost per 39-wei tx (~21,000 gas) vastly exceeds fee savings. Economically infeasible. |
| 24 | 5.1-5.2 | LOW | ERC721 Compliance, Hardcoded ENS | **INFORMATIONAL** | No security impact. |
| 25 | 5.3-5.6 | GAS/LIVENESS | Permission Caching, Transient Storage, Splits DoS, Terminal Registration | **INFORMATIONAL** | Gas optimizations and liveness concerns. Splits DoS documented in RISKS.md (unbounded array risks). |

### Pass 13 Analysis

The Gemini scan produced 10 "CRITICAL" findings, all of which were triaged as false positives, duplicates, or informational. Key patterns:

| Pattern | Count | Examples |
|---|---|---|
| Incorrect mechanism understanding | 4 | 2.1 (reentrancy), 2.2 (balance delta), 2.5 (ruleset IDs), 2.6 (payout limits) |
| Owner self-harm / trusted role | 3 | 2.3, 2.4, 2.10 |
| Already mitigated in code | 2 | 2.9 (zero price), 4.2 (hookData validation) |
| Duplicate of existing finding | 4 | 2.7→H-17, 2.8→M-38, 3.2→H-13, 3.5→M-33 |
| By-design / accepted | 5 | 3.3, 3.4, 4.4, 4.6, 4.8 |
| Economically infeasible | 2 | 4.3, 4.8 |

The scan's "DEPLOYMENT HALTED — 0/10 confidence" assessment is **not substantiated**. None of its 10 critical findings survived triage.
