# Juicebox V6 EVM Audit Report

**Source:** Pashov Solidity Auditor (Codex) Run `20260420-112444` + Nemesis Auditor (Codex) Run `20260420`
**Repos scanned:** 19 (nana-privacy-v6 skipped — directory not found)
**Date:** 2026-04-20
**Total findings:** 45 confirmed | 25 leads (all investigated, 17 promoted to findings)

---

## Summary

| Severity | Pashov | Nemesis (new) | Lead promos | Downgrades | Actionable |
|----------|--------|---------------|-------------|------------|------------|
| Critical | 5 | 0 | 0 | — | **5** |
| High     | 5 | +5 | 0 | H-2, H-4, H-9 downgraded | **7** |
| Medium   | 6 | +15 (M-21, M-22 added) | +2 (M-20, M-22) | M-7→LOW, M-8→info, M-9→info, M-11→info, M-13→FP | **17** |
| Low      | 4 | +1, +1 from M-7 | +1 (L-6) | — | **7** |
| **Total** | | | +3 | 8 downgraded | **36 actionable** |

All Critical and High Pashov findings were verified against current source code. Nemesis findings include PoC tests.

---

## Critical

### C-1. Cross-Chain Loan Quotes Hardcode 18-Decimal Remote Surplus

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

### C-2. Omnichain Cash-Out Pricing Uses Hardcoded 18-Decimal Remote Surplus

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

### C-3. Buyback Cash-Out Fallback Zeroes The Reclaim Surplus

| Field | Value |
|-------|-------|
| **Repo** | nana-buyback-hook-v6 |
| **File** | `src/JBBuybackHook.sol:693,755,758` |
| **Auditor confidence** | 90 |
| **My confidence** | **88 — VERIFIED** |
| **Known issue?** | No |

**Description:** All three return paths in `beforeCashOutRecordedWith` return `effectiveSurplusValue = 0`. When the swap is not worthwhile (`noop = true`, line 755), the hook won't execute in `afterCashOutRecordedWith`, so `JBTerminalStore` computes reclaim against zero surplus and the user burns tokens for nothing. The non-noop swap path (line 758) intends for the after-hook to handle the payout, but the noop path is a direct loss.

**Mitigation:** When `noop = true`, return `context.surplus.value` instead of `0` so the normal bonding curve reclaim applies.

Admin note: fix. and add sufficient fork tests to make sure this is well tested across tokens, currencies, and decimals.

---

### C-4. Non-Canonical tokenIds Allow Duplicate Distribution Claims

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

### C-5. Hidden Token Burn/Reveal Cycle Inflates Visible-Holder Exit Value

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

### H-1. Public Checkpoint Predeployment Permanently Bricks Hook

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

### H-3. Buyback Routing Ignores Omnichain Cash-Out Context

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

### H-5. Defifa Games Launch With Unsupported Tier Counts Above 128

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

### H-6. Extra Cash-Out Hooks Receive Stale Local-Only Surplus

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

### H-10. Fee-Project Economics Bound To Wrong Trust Root *(nemesis)*

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

### H-11. Tempo Resume Script Cannot Converge Partial Deployments *(nemesis — promotes Lead 21)*

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

### H-12. 721 Distributor Allocates Rewards From Live NFT State, Not Round-Start Snapshot *(nemesis — promotes Lead 25)*

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

---

## Medium

### M-1. Dust V3 Liquidity Pins Routing Away From Deeper V4 Markets

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

### M-2. Interrupted Deployments Griefed by Permissionless Project-ID Minting

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

---

### M-3. Tempo ETH/USD Feed Registered Against `address(0)`

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

### M-4. Public V4 Pool Pre-Initialization Blocks LP Deployment

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

---

### M-6. Reverting Terminal Metadata Read Bricks Routed `pay()` Calls

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

### M-12. Fee-On-Transfer Tokens Break Buyback Swap Settlement *(nemesis — promotes Lead 9)*

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

### M-14. Omnichain launchRulesetsFor Breaks Fresh-Project Bootstrap Path *(nemesis)*

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

---

### M-16. Fee-Project Deployment Hard-Reverts on Replay *(nemesis)*

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

### M-17. Distributor Controller-Path Overcredits Fee-On-Transfer Tokens *(nemesis — promotes Lead 24)*

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

---

### M-18. Verify Script Doesn't Model No-Uniswap and Tempo Deployments Correctly *(nemesis)*

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

### M-19. Tempo Defifa Deployments Created With Null Typeface *(nemesis — promotes Lead 23)*

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

### M-20. Tempo Moderato USDC Address Is Zero — Bricks Deployment *(lead investigation — promotes Lead 22)*

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

### M-22. Migration Verification Skips All Owners For Tiers With Fallback-Resolver Balance *(nemesis — promotes Lead 17)*

| Field | Value |
|-------|-------|
| **Repo** | banny-retail-v6 |
| **File** | `script/helpers/MigrationHelper.sol:93` |
| **Auditor confidence** | MEDIUM (nemesis verified) |
| **My confidence** | **68** |
| **Known issue?** | Flagged as lead |

**Description:** `verifyTierBalances()` checks if the V4 fallback resolver owns any token of a tier, and if so, `continue`s past the entire tier without comparing any individual owner's V5 balance to their V4 balance. An owner over-credited for that tier in V5 passes migration verification silently. The nemesis PoC shows Alice with V5 balance `2` vs V4 balance `1` passes verification when the fallback resolver holds any token of that tier.

**Mitigation:** Split verification into (1) aggregate tier conservation and (2) per-owner redistribution accounting that deducts fallback-held tokens from the allowed delta rather than skipping the entire tier.

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

### L-4. Zero-Balance Rounds Front-Run Into Vesting Lockout *(nemesis corroborates)*

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

### L-6. Fallback Tick Reconstruction Not Re-Clamped After Emergency Path *(lead investigation — promotes Lead 3)*

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

## Leads (All Investigated)

These are high-signal vulnerability trails from initial analysis. All 25 leads have now been investigated. 16 were promoted to numbered findings. Remaining 9 are resolved as FP, informational, or accepted risk.

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
- **H-11, M-3, M-18, M-19, M-20:** Tempo-specific — not yet deployed, time to fix before launch
- **M-21:** Defifa governance config — reject one-tier games at launch
- **M-22:** Banny migration helper — deployment/migration integrity, not live runtime
- **L-6:** Edge-case DoS in LP split hook fallback path — easy fix, low urgency

---

## Repos With No Findings

- nana-address-registry-v6 (nemesis: all false positives)
- nana-project-handles-v6 (nemesis: all false positives)
- nana-permission-ids-v6 (nemesis: no findings)
- nana-suckers-v6 (nemesis: all false positives)

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
