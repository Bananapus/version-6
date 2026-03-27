# Codex Nemesis Audit — Aggregated Findings

**Run:** 2026-03-23 (run ID `20260323-211452`)
**Repos audited:** 17
**Total findings:** 31 verified true positives
**Breakdown:** 0 Critical | 5 High | 16 Medium | 10 Low
**Clean repos:** 3 (nana-ownable-v6, nana-address-registry-v6, nana-permission-ids-v6)

---

## Summary by Severity

| Severity | Count | Repos affected |
|----------|-------|----------------|
| Critical | 0 | — |
| High | 5 | univ4-lp-split-hook-v6 (2), nana-suckers-v6 (1), defifa-collection-deployer-v6 (1), deploy-all-v6 (1) |
| Medium | 16 | nana-core-v6 (1), univ4-lp-split-hook-v6 (1), revnet-core-v6 (1), nana-router-terminal-v6 (1), univ4-router-v6 (1), nana-buyback-hook-v6 (2), nana-suckers-v6 (1), croptop-core-v6 (2), banny-retail-v6 (1), nana-omnichain-deployers-v6 (2), nana-fee-project-deployer-v6 (2), deploy-all-v6 (1) |
| Low | 10 | revnet-core-v6 (1), nana-router-terminal-v6 (1), nana-721-hook-v6 (5), nana-suckers-v6 (2), banny-retail-v6 (1) |

## Summary by Repo

| # | Repo | C | H | M | L | Total |
|---|------|---|---|---|---|-------|
| 1 | nana-core-v6 | 0 | 0 | 1 | 0 | 1 |
| 2 | univ4-lp-split-hook-v6 | 0 | 2 | 1 | 0 | 3 |
| 3 | revnet-core-v6 | 0 | 0 | 1 | 1 | 2 |
| 4 | nana-router-terminal-v6 | 0 | 0 | 1 | 1 | 2 |
| 5 | nana-721-hook-v6 | 0 | 0 | 0 | 5 | 5 |
| 6 | univ4-router-v6 | 0 | 0 | 1 | 0 | 1 |
| 7 | nana-buyback-hook-v6 | 0 | 0 | 2 | 0 | 2 |
| 8 | nana-suckers-v6 | 0 | 1 | 1 | 2 | 4 |
| 9 | defifa-collection-deployer-v6 | 0 | 1 | 0 | 0 | 1 |
| 10 | croptop-core-v6 | 0 | 0 | 2 | 0 | 2 |
| 11 | banny-retail-v6 | 0 | 0 | 1 | 1 | 2 |
| 12 | nana-omnichain-deployers-v6 | 0 | 0 | 2 | 0 | 2 |
| 13 | nana-ownable-v6 | 0 | 0 | 0 | 0 | 0 |
| 14 | nana-address-registry-v6 | 0 | 0 | 0 | 0 | 0 |
| 15 | nana-permission-ids-v6 | 0 | 0 | 0 | 0 | 0 |
| 16 | nana-fee-project-deployer-v6 | 0 | 0 | 2 | 0 | 2 |
| 17 | deploy-all-v6 | 0 | 1 | 1 | 0 | 2 |

---

## HIGH Findings

### H-1: Reserved fee-token claims can be diverted during deploy/rebalance (univ4-lp-split-hook-v6)

**Severity:** HIGH
**File:** `src/JBUniswapV4LPSplitHook.sol`

Fee-project tokens promised to prior projects via `claimableFeeTokens` are not excluded from terminal-side leftover handling or rebalance balance snapshots. When the reserved token appears on the terminal side of a later project's pool, `_handleLeftoverTokens()` or `_mintRebalancedPosition()` can consume those reserved tokens, leaving the original claimant unable to recover them.

**Trigger:** Project A collects LP fees as token `F`. Project B uses the same hook clone with `terminalToken == F`. B's `deployPool()` or `rebalanceLiquidity()` sweeps A's reserved `F` balance.

**Fix:** Subtract `_totalOutstandingFeeTokenClaims[token]` from both project-token and terminal-token available balances before leftover handling and rebalancing.

---

### H-2: Non-Ethereum deploys hardcode the wrong Uniswap V4 PoolManager (univ4-lp-split-hook-v6)

**Severity:** HIGH
**File:** `script/Deploy.s.sol:70`

Line 70 hardcodes `poolManager = IPoolManager(0x000000000004444c5dc75cB358380D2e3dE08A90)` for all chains. Only Ethereum mainnet uses that address. Verified against [Uniswap V4 deployments](https://docs.uniswap.org/contracts/v4/deployments):

| Chain | Chain ID | Script uses | Correct PoolManager |
|-------|----------|-------------|---------------------|
| Ethereum | 1 | `0x00...8A90` | `0x000000000004444c5dc75cB358380D2e3dE08A90` (correct) |
| Optimism | 10 | `0x00...8A90` | `0x9a13f98cb987694c9f086b1f5eb990eea8264ec3` |
| Base | 8453 | `0x00...8A90` | `0x498581ff718922c3f8e6a244956af099b2652b2b` |
| Arbitrum | 42161 | `0x00...8A90` | `0x360e68faccca8ca495c1b759fd9eee466db9fb32` |
| Sepolia | 11155111 | `0x00...8A90` | `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` |
| Base Sepolia | 84532 | `0x00...8A90` | `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408` |
| Arbitrum Sepolia | 421614 | `0x00...8A90` | `0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317` |

Deploying on any non-Ethereum chain produces a hook with the wrong `POOL_MANAGER` immutable. Pool initialization, slot0 reads, and liquidity operations target a nonexistent or wrong contract.

**Fix:** Use per-chain PoolManager resolution matching the router deployment script, or add a chain-conditional lookup similar to `positionManager` (lines 73-99).

!!! Admin note: add the url https://docs.uniswap.org/contracts/v4/deployments where official addresses are found as an inline comment so others can verify.

---

### H-3: Destination deprecation can permanently strand already-sent leaves (nana-suckers-v6)

**Severity:** HIGH
**File:** `src/JBSucker.sol:477`

If the bridge delivers a valid root after the destination sucker reaches `DEPRECATED`, `fromRemote()` discards the root. Destination claims fail. Source emergency exit also fails because the leaf was already counted in `numberOfClaimsSent`. Backing assets are permanently trapped.

**Trigger:** User sends a leaf before deprecation. Bridge delivers root after deprecation completes.

**Fix:** Continue accepting roots for already-sent leaves after deprecation, or add an explicit source-side recovery path for sent leaves with rejected roots.

!!! Admin note: continue accepting.

---

### H-4: Sponsored mints let one NFT create multiple full-governance positions (defifa-collection-deployer-v6)

**Severity:** HIGH
**File:** `src/DefifaHook.sol:969-980`

`_processPayment()` credits attestation units to `context.payer` but `_mintAll()` mints the NFT to `context.beneficiary`. When `payer != beneficiary`, a transfer triggers `_update()` which moves another full set of units. Both the beneficiary and the transfer recipient end up with full governance weight from a single NFT. This can be used to manipulate scorecard ratification and redirect treasury value.

**Fix:** Credit attestation units to `context.beneficiary` (the actual NFT recipient) instead of `context.payer`.

!!! Admin note: yes. 

---

### H-5: Banny can be deployed to the wrong project ID without any mismatch check (deploy-all-v6)

**Severity:** HIGH
**File:** `script/Deploy.s.sol`

`_deployBanny()` calls `REVDeployer.deployFor(revnetId: 0)` which creates a new project at `PROJECTS.count() + 1`. If `count >= 4` before Phase 09 runs and project 4 isn't the intended Banny revnet, Banny gets a drifted project ID. The script doesn't detect or assert the returned ID matches `_BAN_PROJECT_ID == 4`.

**Fix:** Reserve/validate project 4 before BAN deployment and assert the returned revnet ID equals `_BAN_PROJECT_ID`.

!!! Admin note: yes, validate deployFor returns project 4. 

---

## MEDIUM Findings

### M-1: Stale fee-free surplus makes later zero-tax cashouts pay the wrong fee (nana-core-v6)

**File:** `src/JBMultiTerminal.sol`

`_feeFreeSurplusOf` is incremented by `executePayout()` and decremented by `_cashOutTokensOf()`, but `_useAllowanceOf()` removes surplus without updating this accumulator. After a fee-free payout is withdrawn through allowance, future zero-tax cashouts still see the stale fee-free amount and charge a 2.5% fee on new surplus that shouldn't be subject to it.

**Fix:** Decrement `_feeFreeSurplusOf` proportionally when surplus leaves through `_useAllowanceOf()`.

!!! Admin note: ok, fix.

---

### M-2: Hook prices LP deployment from total surplus even when terminal only sees local surplus (univ4-lp-split-hook-v6)

**File:** `src/JBUniswapV4LPSplitHook.sol:277-301`

`_getCashOutRate()` always uses `currentTotalReclaimableSurplusOf(...)` regardless of the project's `useTotalSurplusForCashOuts` setting. When that setting is false, the hook overstates the terminal-token floor. Real `cashOutTokensOf()` uses only local surplus and returns less, causing deploy/rebalance revert or skewed LP positions.

**Fix:** Query local reclaimable surplus unless the current ruleset explicitly enables total-surplus cashouts.

!!! Admin note: ok, fix.

---

### M-3: Deploy.s.sol is not restart-safe because it mutates the fee project ID before singleton discovery (revnet-core-v6)

**File:** `script/Deploy.s.sol`

The script creates a fresh fee project before checking whether singleton contracts (REVLoans, REVDeployer) already exist. Retries create `N+1` as the fee project, producing a different init-code hash that can no longer discover the original singleton pair.

**Fix:** Resolve or persist the fee project ID before checking singleton existence.

!!! Admin note: ok, fix.

---

### M-4: Registry-wrapped `addToBalanceOf()` permanently traps partial-fill leftovers (nana-router-terminal-v6)

**File:** `src/JBRouterTerminalRegistry.sol:252`, `src/JBRouterTerminal.sol:221`

When a user calls `registry.addToBalanceOf()` with a swap that partially fills, the router refunds unused input to `_msgSender()` (the registry), not the original user. The registry has no recovery path, so the leftover input is permanently stuck.

**Fix:** Preserve the original caller as the refund target across the wrapper boundary.

!!! Admin note: ok. how though?

---

### M-5: Buy-side route selection can systematically prefer V4 over a better Juicebox pay path (univ4-router-v6)

**File:** `src/JBUniswapV4Hook.sol:243`

The hook computes its own buy-side quote using token metadata and static ruleset fields instead of calling the terminal's `previewPayFor()`. For non-standard tokens where `decimals()` reverts, the hook falls back to 18 decimals and under-quotes the Juicebox path, routing users into strictly worse V4 execution.

**Fix:** Use the terminal's canonical `previewPayFor()` for buy-side routing decisions.

!!! Admin note: ok, fix.

---

### M-6: Registry pool configuration can silently no-op until the first payment reverts (nana-buyback-hook-v6)

**File:** `src/JBBuybackHookRegistry.sol`

`lockHookFor()` rejects an unresolved hook, but `initializePoolFor()`, `setPoolFor()`, and `beforePayRecordedWith()` assume one exists. Setup transactions can succeed while leaving the project unconfigured. The first payment flow becomes a hard DoS.

**Fix:** Add the same zero-hook guard used by `lockHookFor()` to the pool-configuration and pay-forwarding paths.

!!! A default should exist at least. feel free to make sure of it. whatever you do in this repo, also do in Router terminal registry. 

---

### M-7: Deploy script uses unverified placeholder PoolManager addresses on supported testnets (nana-buyback-hook-v6)

**File:** `script/Deploy.s.sol`

Sepolia, OP Sepolia, Base Sepolia, and Arbitrum Sepolia all map to Ethereum mainnet's canonical PoolManager address. Uniswap warns against assuming cross-chain address reuse.

**Fix:** Require per-chain PoolManager addresses explicitly or revert on testnets without verified addresses.

!!! Admin note: verify https://docs.uniswap.org/contracts/v4/deployments

---

### M-8: `deploySuckersFor()` only works if the registry has its own hidden mapping permission (nana-suckers-v6)

**File:** `src/JBSuckerRegistry.sol:236`

The registry deploys the sucker then calls `sucker.mapTokens()` as itself. `_mapToken()` checks `MAP_SUCKER_TOKEN` against `msg.sender == registry`, not the original operator. The documented one-call flow fails unless the registry is pre-granted that extra permission.

**Fix:** Preserve the original operator for the mapping step, or move mapping into a path that doesn't require a second permission hop.

!!! Admin note: ok, but this is good as is, dont make it worse or less safe.

---

### M-9: Reentrant inner mint can capture another caller's parked fee payout (croptop-core-v6)

**File:** `src/CTPublisher.sol:398-428`

`mintFrom()` leaves the outer fee in the contract balance while paying the terminal. A reentrant inner call can sweep the entire balance (including the outer caller's fee) to a different `feeBeneficiary`.

**Fix:** Pin the fee amount to a call-local variable before the external call. Send exactly that amount in the fee leg.

!!! Admin note: ok, fix.

---

### M-10: Initial owner keeps hook-management powers after selling the project (croptop-core-v6)

**File:** `src/CTDeployer.sol:328-349`

`deployProjectFor()` grants hook-management permissions under the `CTDeployer` account. Transferring the project NFT doesn't revoke these permissions. The seller retains tier adjustment, NFT minting, metadata, and discount permissions until the buyer manually calls `claimCollectionOwnershipOf()`.

**Fix:** Transfer hook ownership to the project immediately, or auto-revoke stale operator grants on NFT transfer.

!!! Admin note: no ned to auto-revoke since permissions are relative to the owner, and since owner changed, permissions need to be re-granted by new owner.

---

### M-11: Failed-return retention lets mutually-exclusive outfits coexist on one body (banny-retail-v6)

**File:** `src/Banny721TokenUriResolver.sol:1435`

Category exclusivity checks only validate the fresh input. When returning old outfits fails (e.g., to a contract that rejects ERC-721 transfers), the old entries are retained and merged with new ones without re-checking category conflicts. `HEAD` and `EYES` (or `SUIT` with `SUIT_TOP`/`SUIT_BOTTOM`) can coexist on the same body.

**Fix:** Re-run category exclusivity checks on the combined `new + retained` set before storing.

!!! Admin note: ok, fix.

---

### M-12: The omnichain wrapper erases the 721 hook's `issueTokensForSplits` behavior (nana-omnichain-deployers-v6)

**File:** `src/JBOmnichainDeployer.sol:235-282`

`beforePayRecordedWith()` keeps the 721 hook's split amount but discards its returned weight, re-scaling from `projectAmount / totalAmount`. When `issueTokensForSplits=true`, the payer receives fewer project tokens than configured. If splits consume the full payment, weight can be forced to zero.

**Fix:** Start from the 721 hook's returned weight when a 721 hook is active.

!!! Admin note: ok, yes seems meaningful. must be tested thoroughly.

---

### M-13: `deploySuckersFor` is unusable for existing projects because the registry re-checks permissions (nana-omnichain-deployers-v6)

**File:** `src/JBOmnichainDeployer.sol:390-403`

The wrapper validates the caller locally, then calls `JBSuckerRegistry.deploySuckersFor`. The registry re-checks `DEPLOY_SUCKERS` against `msg.sender == JBOmnichainDeployer`, which doesn't have that permission by default. The public wrapper for adding suckers to existing projects reverts in the normal case.

**Fix:** Add a registry-side omnichain operator override, or expose a registry entry point for authenticated wrappers.

!!! Admin note: the project owner should give this permission to the omnichain deployer before calling deploySuckersFor.

---

### M-14: Default artifact resolution path is non-functional and hard-reverts deployment (nana-fee-project-deployer-v6)

**File:** `script/Deploy.s.sol`

`run()` uses npm-default artifact paths, but installed packages contain no `deployments/` directory. `CoreDeploymentLib` hardcodes `nana-core-v5` as the project name. `vm.readFile` reverts immediately on a fresh clone.

**Fix:** Make deployment artifact paths explicit via environment variables and fail fast if unset.

!!! Admin note: the deployments dir will come, dont worry.

---

### M-15: Hardcoded February 2025 stage start now launches with decayed issuance and forced cash-out delay (nana-fee-project-deployer-v6)

**File:** `script/Deploy.s.sol:131`

`stageConfigurations[0].startsAtOrAfter = 1740089444` (2025-02-20). Deploying after 2026-02-15, `JBRulesets.currentOf()` simulates elapsed cycles instead of initial issuance weight. As of audit date (2026-03-23), effective issuance is ~6,200 NANA/ETH instead of 10,000. Cash-outs would be delayed 30 days from deployment.

**Fix:** Pass the intended start time through configuration instead of hardcoding a historical timestamp.

!!! Admin note: ill fix at a later time.

---

### M-16: Later-phase replay is blocked by unconditional CREATE2 deployments (deploy-all-v6)

**File:** `script/Deploy.s.sol`

Feed contracts and the Banny resolver are deployed with fixed salts without `_isDeployed(...)` guards, unlike most other phases. Replaying after a later-phase failure causes CREATE2 collisions.

**Fix:** Adopt `_isDeployed(...)` guards for these CREATE2 artifacts.

!!! Admin note: ok, fix.

---

## LOW Findings

### L-1: Loan ID collisions possible because namespace cap is never enforced where new IDs are minted (revnet-core-v6)

**File:** `src/REVLoans.sol`

`loanId = revnetId * 1e12 + loanNumber`. The counter is incremented in three mutation paths but the `REVLoans_LoanIdOverflow()` guard only appears in the liquidation path. After 1e12 loans, IDs enter the next revnet's namespace.

**Fix:** Add `if (nextLoanNumber >= _ONE_TRILLION) revert REVLoans_LoanIdOverflow()` to all three minting paths.

!!! Admin note: ok, fix.

---

### L-2: `pay()` routes unused input to `beneficiary` instead of the payer (nana-router-terminal-v6)

**File:** `src/JBRouterTerminal.sol:256`

When Alice calls `pay()` with Bob as beneficiary and the swap partially fills, Bob receives the unused input remainder instead of Alice.

!!! Admin note: this is necessary since the payer could be another contract... which is the case in Router Terminal forwarding.

---

### L-3: Leftover split funds are stranded when fallback accounting has no primary terminal (nana-721-hook-v6)

**File:** `src/libraries/JB721TiersHookLib.sol:425-460`

If a tier split produces a `leftoverAmount` and the project has no primary terminal for that token, funds remain inside the hook contract.

!!! Admin note: what should we do?

---

### L-4: The implementation hook contract can be initialized by any caller (nana-721-hook-v6)

**File:** `src/JB721TiersHook.sol:236-302`

The implementation instance (deployed with `PROJECT_ID == 0`) can be initialized by any caller before anyone else does, storing attacker-chosen config. Clone functionality remains intact.

!!! Admin note: what do you suggest?

---

### L-5: `tokenURI` serves metadata for nonexistent and burned token IDs (nana-721-hook-v6)

**File:** `src/JB721TiersHook.sol:317-319`

The override resolves tier metadata without checking ownership/existence, unlike the base ERC-721 behavior.

!!! Admin note: ok, what do you suggest?

---

### L-6: `supportsInterface` advertises ERC-2981 support without implementing `royaltyInfo` (nana-721-hook-v6)

**File:** `src/abstract/JB721Hook.sol:163-166`

The hook returns `true` for `IERC2981` but has no `royaltyInfo` method. Royalty-aware integrations can fail.

!!! Admin note: ok, what do you suggest? Remove IERC2981 if its not in use?

---

### L-7: `balanceOf(address(0))` breaks ERC-721 semantics (nana-721-hook-v6)

**File:** `src/JB721TiersHook.sol:168-170`

Returns 0 instead of reverting, which is a standards-compliance regression from the base ERC-721.

!!! Admin note: ok, fix.

---

### L-8: `SuckerDeploymentLib` returns incomplete deployments on Ethereum Sepolia (nana-suckers-v6)

**File:** `script/helpers/SuckerDeploymentLib.sol:58`

`_isMainnet` checks `"sepolia"` instead of `"ethereum_sepolia"`, causing L1 deployers to be omitted.

!!! Admin note: ok, fix.

---

### L-9: CCIP deployment branch cannot be safely rerun after prior deployment attempts (nana-suckers-v6)

**File:** `script/Deploy.s.sol:399, 561`

Unlike OP/Base/Arbitrum branches, the CCIP path has no `_isDeployed(...)` guard. Reruns hit CREATE2 collisions.

!!! Admin note: ok, fix.

---

### L-10: Resolver deployment idempotence check computes the wrong CREATE2 address (banny-retail-v6)

**File:** `script/Deploy.s.sol`

`_isDeployed()` uses the Arachnid deterministic deployment proxy as deployer, but `deploy()` uses Solidity `new {salt}` which creates from the current contract. These are different CREATE2 namespaces.

!!! Admin note: these work out to be the same in practice.

---

## Clean Repos (No Findings)

- **nana-ownable-v6** — 10 functions, 3 coupled pairs, all synced
- **nana-address-registry-v6** — 13 functions, 0 exploitable pairs
- **nana-permission-ids-v6** — 0 functions (constants-only library), all consumer cross-references verified
