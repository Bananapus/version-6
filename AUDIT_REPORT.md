# Audit Triage Report

## Scope

Audit seed:

- Depth: deep dive
- Subsystems: all 19 EVM repos in `ARCHITECTURE.md`
- Personas: broad adversarial coverage across MEV, malicious project owner, rogue bridge operator, grief attacker, fee evader, flash loan attacker, permission escalator, oracle manipulator, decimals/currency/token arbitrageur, and ruthless thief
- User deployment constraint: pre-deploy breaking changes are allowed because nothing has been deployed yet
- Deployment focus: one-shot `deploy-all-v6` rollout with canonical projects `1`-`4`

Inputs reviewed:

- `ARCHITECTURE.md`
- `RISKS.md`
- `AUDIT_INSTRUCTIONS.md`
- `USER_JOURNEYS.md`
- `.audit-logs/codex-pashov-summary-20260429-143830.log`
- `.audit-logs/codex-nemesis-summary-20260429-143842.log`
- `.audit-logs/nana-721-hook-v6-pashov-20260429-143852.log`
- `.audit-logs/nana-router-terminal-v6-pashov-20260429-143852.log`
- `.audit-logs/revnet-core-v6-pashov-20260429-143852.log`
- `.audit-logs/univ4-lp-split-hook-v6-pashov-20260429-143852.log`
- `.audit-logs/nana-core-v6-pashov-20260429-143852.log`

Correlated findings and PoCs were checked against current code, current tests, repo `RISKS.md` files, and the real deployment path through `deploy-all-v6`.

## Final Triage

Bottom line under the current threat model:

- No confirmed unpatched issue remains. All 47 findings have been remediated and merged to main across 17 repositories.
- `deploy-all-v6` resolves the patched ecosystem from sibling working-copy packages instead of npm tarballs for the one-shot deployment; this matters because several published `0.0.x` tarballs still expose stale pre-audit ABI surfaces under the same version numbers.
- Several earlier findings were dropped because they rely on deployment paths you do not use, behaviors you explicitly accept, or invariants you do not want this system to enforce.
- Four optional non-security cleanup items remain below for future consideration.

## Remediated Findings (All Merged)

### Remediation PRs (all merged)

- `banny-retail-v6`: https://github.com/mejango/banny-retail-v6/pull/101
- `croptop-core-v6`: https://github.com/mejango/croptop-core-v6/pull/118
- `defifa`: https://github.com/BallKidz/defifa/pull/97
- `deploy-all-v6`: https://github.com/Bananapus/deploy-all-v6/pull/70
- `nana-721-hook-v6`: https://github.com/Bananapus/nana-721-hook-v6/pull/122
- `nana-buyback-hook-v6`: https://github.com/Bananapus/nana-buyback-hook-v6/pull/115
- `nana-distributor-v6`: https://github.com/Bananapus/nana-distributor-v6/pull/12
- `nana-fee-project-deployer-v6`: https://github.com/Bananapus/nana-fee-project-deployer-v6/pull/69
- `nana-core-v6`: https://github.com/Bananapus/nana-core-v6/pull/127
- `nana-omnichain-deployers-v6`: https://github.com/Bananapus/nana-omnichain-deployers-v6/pull/97
- `nana-project-handles-v6`: https://github.com/Bananapus/nana-project-handles-v6/pull/8
- `nana-router-terminal-v6`: https://github.com/Bananapus/nana-router-terminal-v6/pull/98
- `nana-suckers-v6`: https://github.com/Bananapus/nana-suckers-v6/pull/110
- `revnet-core-v6`: https://github.com/rev-net/revnet-core-v6/pull/136
- `univ4-lp-split-hook-v6`: https://github.com/Bananapus/nana-univ4-lp-split-hook-v6/pull/112
- `univ4-router-v6`: https://github.com/Bananapus/nana-univ4-router-v6/pull/95

### 1. `univ4-router-v6` + `univ4-lp-split-hook-v6`: persistent terminal approvals can leak later same-token balances

Severity: `MED`

Status: FIXED. Merged to main in `univ4-router-v6/src/JBUniswapV4Hook.sol` and `univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol`.

Affected code:

- [JBUniswapV4Hook.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/src/JBUniswapV4Hook.sol:1087)
- [JBUniswapV4LPSplitHook.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol:1025)
- [JBUniswapV4LPSplitHook.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol:1983)

Why it is real:

- The hooks `forceApprove` directory-selected terminals before external `pay(...)` / `addToBalanceOf(...)` calls, but they never verify that the terminal consumed the whole allowance and they never reset it back to zero.
- Core code already treats this as an invariant when interacting with terminals:
  [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:2067) reverts if allowance remains after the transfer path, and [JBController.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBController.sol:351) does the same after routing reserved-token payments through a terminal.
- [JBDirectory.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBDirectory.sol:176) lets project owners point projects at arbitrary terminals. A malicious terminal can under-consume the forwarded amount, keep the allowance alive, and later `transferFrom` future balances of the same token from the hook.

Impact:

- In `univ4-router-v6`, a malicious project terminal can drain later same-token balances that arrive on the shared hook during future routed swaps.
- In `univ4-lp-split-hook-v6`, a malicious fee terminal or project terminal can drain later same-token balances held by a shared clone, including funds tied to later flows or other projects using that clone.
- The stealable amount is bounded by the stale allowance from the most recent routed call, but a single large routed payment can leave a correspondingly large drain window.

Evidence:

- PoC: [univ4-router-v6/test/audit/PersistentAllowanceSteal.t.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/test/audit/PersistentAllowanceSteal.t.sol:1)
- PoC: [univ4-lp-split-hook-v6/test/audit/PersistentAllowanceSteal.t.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/test/audit/PersistentAllowanceSteal.t.sol:1)

Recommended fix:

- Mirror the core temporary-allowance pattern after every external terminal call.
- Either revert when `allowance(address(this), terminal) != 0`, or reset the allowance to zero immediately and base accounting on measured balance deltas.

### 2. `univ4-router-v6`: JB-routed swaps do not locally enforce realized `amountOutMin`

Severity: `LOW`

Status: FIXED. Merged to main in `univ4-router-v6/src/JBUniswapV4Hook.sol`.

Affected code:

- [JBUniswapV4Hook.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/src/JBUniswapV4Hook.sol:1048)
- [JBUniswapV4Hook.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/src/JBUniswapV4Hook.sol:1122)
- [JBUniswapV4Hook.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/src/JBUniswapV4Hook.sol:598)

Why it is real:

- The hook accepts `amountOutMin` in `hookData`, documents JB-route slippage as already validated in `_beforeSwap`, and only re-checks `amountOutMin` in `_afterSwap` for real V4 swaps.
- `_routeThroughJuicebox` forwards `amountOutMin` into `terminal.pay(...)` / `cashOutTokensOf(...)`, but after measuring the realized balance delta it never checks `outputReceived >= amountOutMin`.
- That means the slippage guarantee is delegated entirely to the directory-selected terminal. If that terminal ignores or under-enforces the minimum, the hook itself still returns a successful JB route with below-min output.

Scope note:

- The bundled [JuiceboxSwapRouter.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/test/utils/JuiceboxSwapRouter.sol:119) currently masks this by re-validating the final delta after the swap.
- The bug is still in the hook contract itself, so any direct `PoolManager.swap(...)` integration or future router that trusts the hook’s advertised guarantee can be under-filled.

Evidence:

- PoC: [univ4-router-v6/test/audit/JBRouteMinOutputBypass.t.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/test/audit/JBRouteMinOutputBypass.t.sol:1)

Recommended fix:

- After computing `outputReceived`, revert if it is below `amountOutMin`.
- That makes the hook’s own slippage contract true even when the selected terminal is buggy or adversarial.

### 3. `univ4-lp-split-hook-v6`: overreported cash-out returns can consume other projects’ reserved fee-token claims

Severity: `MED`

Status: FIXED. Merged to main in `univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol`.

Affected code:

- [JBUniswapV4LPSplitHook.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol:1083)
- [JBUniswapV4LPSplitHook.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol:1242)
- [JBUniswapV4LPSplitHook.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol:1729)

Why it is real:

- During pool deployment, `_addUniswapLiquidity` trusts the terminal’s `cashOutTokensOf(...)` return value as `terminalTokenAmount` instead of measuring the actual balance delta.
- The later liquidity mint spends raw contract balances through `PositionManager.SETTLE`, but the only reserved-balance segregation in this contract is `_burnReceivedTokens`, which protects project-token burns, not liquidity-add spends.
- In a shared clone, if the hook is already holding reserved fee-project ERC-20s for one project and a second project’s malicious terminal overreports its cash-out proceeds in that same token, the second project can make deployment consume the first project’s reserved fee claims.

Impact:

- This is cross-project theft on shared clones, not just self-grief.
- The cleanest live target is the fee-project token itself: claimable fee tokens are intentionally pooled on the clone, so a malicious project that uses that token as its terminal token can consume another project’s already-earned claimable balance into its own LP position.

Evidence:

- PoC: [univ4-lp-split-hook-v6/test/audit/FeeClaimReserveCapture.t.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/test/audit/FeeClaimReserveCapture.t.sol:1)

Recommended fix:

- Do not let liquidity-add sizing trust a terminal return value alone when the clone can already hold the same token for unrelated accounting buckets.
- Measure the actual terminal-token balance delta from the cash-out, cap it against any reserved balance of that token, and size the LP mint from the measured free balance only.

### 4. `nana-buyback-hook-v6`: buy-side and sell-side derived minima ignore output-token transfer tax and can self-brick AMM routing

Severity: `MED`

Status: FIXED. Merged to main in `nana-buyback-hook-v6/src/JBBuybackHook.sol`.

Affected code:

- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:746)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:758)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:883)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:895)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:1177)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:343)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:410)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:243)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:259)

Why it is real:

- Before the local patch, `beforePayRecordedWith(...)` compared the direct mint path against a TWAP-derived pool minimum that assumed the project-token output arrived losslessly, then `afterPayRecordedWith(...)` enforced that minimum against the realized post-tax balance delta.
- Before the local patch, `beforeCashOutRecordedWith(...)` compared net direct reclaim against a TWAP-derived pool minimum that assumed the terminal-token output arrived losslessly, then `afterCashOutRecordedWith(...)` enforced that minimum against the realized post-tax balance delta.
- For high-fee-on-transfer output tokens, the hook could therefore select the AMM path because the untaxed derived minimum beat the direct protocol path, but the real taxed delivery still landed below that same internally-derived floor.
- This was not just a user-specified-slippage issue. Both PoCs used empty metadata and the hook's own TWAP-derived minima to trigger the revert.
- The local patch keeps metadata-less, protocol-derived sell-side AMM routing on the direct protocol path for ERC-20 output tokens, while preserving explicit user-minimum sell routing. On the buy side, metadata-less derived AMM routing is limited to the standard `JBTokens.deployERC20For(...)` clone runtime; custom project tokens must supply explicit quote metadata before the AMM path activates.

Impact:

- Any payer or holder using an affected buyback-hook pool could hit a hard revert once the AMM route won, even though the direct mint or direct cash-out path was live.
- Because pool configuration is immutable per `(projectId, terminalToken)` pair, projects cannot swap that pair over to a non-lossy pool configuration after the fact.
- The patched default policy makes lossy / unknown ERC-20 output routes explicit-opt-in instead of silently deriving a floor that the transfer may make impossible to satisfy.

Evidence:

- Regression: [nana-buyback-hook-v6/test/audit/DerivedMinBuySideFOTDoS.t.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/test/audit/DerivedMinBuySideFOTDoS.t.sol:253)
- Regression: [nana-buyback-hook-v6/test/audit/DerivedMinSellSideFOTDoS.t.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/test/audit/DerivedMinSellSideFOTDoS.t.sol:199)
- Explicit opt-in coverage: [nana-buyback-hook-v6/test/audit/SellSideFOTOutputDoS.t.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/test/audit/SellSideFOTOutputDoS.t.sol:222)
- Non-18-decimal explicit ERC-20 sell route coverage: [nana-buyback-hook-v6/test/TestAuditGaps.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/test/TestAuditGaps.sol:497)

Recommended fix:

- Review and merge the local conservative route-gating patch.
- Keep this developer-facing policy documented: protocol-derived no-metadata routing assumes standard lossless outputs; custom project tokens and ERC-20 sell outputs can still use AMM routes, but only when the caller supplies an explicit minimum that accounts for the token's behavior.

### 5. `nana-suckers-v6` + `revnet-core-v6`: stale deprecated same-chain sucker snapshots can inflate omnichain revnet accounting during migration

Severity: `MED`

Status: FIXED. Merged to main in `nana-suckers-v6/src/JBSuckerRegistry.sol`.

Affected code:

- [JBSuckerRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSuckerRegistry.sol:275)
- [JBSuckerRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSuckerRegistry.sol:347)
- [REVOwner.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVOwner.sol:176)
- [REVLoans.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVLoans.sol:378)

Why it is real:

- The registry keeps both active and deprecated suckers in its remote aggregate views so pending claims are not undercounted during migration.
- For duplicate peer chains, `remoteSurplusOf(...)`, `remoteBalanceOf(...)`, and `remoteTotalSupplyOf(...)` resolve the collision by taking the per-chain maximum across both the deprecated sucker and the replacement active sucker.
- That means a deprecated sucker's stale high snapshot can continue to dominate a fresh lower snapshot from the new live sucker on the same remote chain after migration.
- `REVOwner.beforeCashOutRecordedWith(...)` and `REVLoans._borrowableAmountFrom(...)` consume those registry views directly as if they were the current omnichain state.

Impact:

- During same-chain sucker migrations, holders on another chain can cash out or borrow against overstated remote surplus and supply assumptions until bounded by the local treasury cap.
- This is not just an informational discrepancy. The registry tests prove the stale-max condition, and the revnet loan PoC shows that overstated remote values translate into a larger live borrow than the corrected omnichain state supports.
- The project owner controls migration timing, but once the stale state exists the exploit path is permissionless for local holders and borrowers.

Evidence:

- PoC: [nana-suckers-v6/test/audit/RegistryStaleDeprecatedMaxSurplus.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/audit/RegistryStaleDeprecatedMaxSurplus.t.sol:1)
- PoC: [nana-suckers-v6/test/audit/RegistryStaleMaxAggregation.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/audit/RegistryStaleMaxAggregation.t.sol:1)
- Composition proof: [revnet-core-v6/test/audit/RemoteLoanAccountingGap.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/audit/RemoteLoanAccountingGap.t.sol:1)

Recommended fix:

- When both an active and deprecated sucker exist for the same peer chain, prefer the active sucker's snapshot in economic aggregate views instead of taking the maximum.
- If deprecated suckers must stay included for claim-completion safety, split that concern from the omnichain economic views used by `REVOwner` and `REVLoans`.

### 6. `nana-suckers-v6`: failed `toRemoteFee` payments permanently strand fee ETH while overstating claimable native balance

Severity: `LOW`

Status: FIXED. Merged to main in `nana-suckers-v6/src/JBSucker.sol`.

Affected code:

- [JBSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol:582)
- [JBSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol:615)
- [JBSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol:709)
- [JBSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol:853)

Why it is real:

- `toRemote(...)` deducts `toRemoteFee`, then treats the fee payment into the fee project as best-effort. If the fee terminal is missing or `pay(...)` reverts, the ETH stays in the sucker.
- The inline comment says later native claims will absorb that retained ETH via `amountToAddToBalanceOf(...)`, but `_handleClaim(...)` only forwards each claim leaf's `terminalTokenAmount`, not the extra residue.
- As a result, the retained ETH remains forever, while `amountToAddToBalanceOf(JBConstants.NATIVE_TOKEN)` continues to report it as addable.

Impact:

- A misconfigured or unavailable fee terminal can permanently trap up to `MAX_TO_REMOTE_FEE` per failed bridge send inside each sucker.
- The fee project is underpaid, the sucker's native accounting becomes misleading, and there is no sweep path to recover the residue.
- I did not find a theft path from this residue, so this is stranded value plus bad accounting rather than a direct drain.

Evidence:

- PoC: [nana-suckers-v6/test/audit/ToRemoteFeeIrrecoverable.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/audit/ToRemoteFeeIrrecoverable.t.sol:1)

Recommended fix:

- If fee payment fails, either add the retained ETH back into `transportPayment` on bridges that can tolerate it, or track retained fee residue separately and add an explicit sweep/retry path.
- Do not count retained fee ETH inside `amountToAddToBalanceOf(...)` unless a later claim path can actually forward it.

### 7. `defifa`: one-tier games with disabled scorecard timeout can never ratify or no-contest, permanently locking the pot

Severity: `MED`

Status: FIXED. Merged to main in `defifa/src/DefifaDeployer.sol`.

Affected code:

- [DefifaDeployer.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaDeployer.sol:413)
- [DefifaDeployer.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaDeployer.sol:248)
- [DefifaGovernor.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaGovernor.sol:617)
- [DefifaGovernor.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaGovernor.sol:170)

Why it is real:

- `launchGameWith(...)` allows one-tier games and only validates `scorecardTimeout` when it is nonzero, so the default timeout-disabled configuration passes unchanged.
- In any one-tier scorecard, the only tier must carry the full `TOTAL_CASHOUT_WEIGHT`. `getBWAAttestationWeight(...)` therefore computes a zero BWA multiplier for that tier, so every holder in the game has zero attestation power against every valid scorecard.
- `attestToScorecardFrom(...)` explicitly rejects zero-weight attestors.
- If `scorecardTimeout == 0` and `minParticipation` does not already force `NO_CONTEST`, `currentGamePhaseOf(...)` stays in `SCORING` forever. The game can neither ratify nor enter `NO_CONTEST`, so refunds and prize cash-outs never become available.

Impact:

- Any one-tier game launched with the timeout-disabled default can permanently lock all participant funds once it reaches scoring.
- This is not limited to a single lonely player. Because all holders live in the only tier, all of them have zero BWA power against the only possible one-tier scorecard.
- A malicious or careless game creator can therefore launch a structurally unwinnable game that still accepts user funds during mint.

Evidence:

- Regression: [defifa/test/audit/SingleTierTimeoutLock.t.sol](/Users/jango/Documents/jb/v6/evm/defifa/test/audit/SingleTierTimeoutLock.t.sol:1)
- Regression: [defifa/test/audit/OneTierZeroTimeoutLock.t.sol](/Users/jango/Documents/jb/v6/evm/defifa/test/audit/OneTierZeroTimeoutLock.t.sol:1)

Recommended fix:

- Review and merge the local one-tier timeout guard.
- Alternatively, special-case single-tier governance so there is always at least one reachable terminal state (`COMPLETE` or `NO_CONTEST`).

### 8. `defifa`: fee-token cash-out claims ignore `beneficiary` and always pay the holder

Severity: `LOW`

Status: FIXED. Merged to main in `defifa/src/DefifaHook.sol`.

Affected code:

- [DefifaHook.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaHook.sol:694)
- [DefifaHook.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaHook.sol:786)
- [IDefifaHook.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/interfaces/IDefifaHook.sol:59)

Why it is real:

- `afterCashOutRecordedWith(...)` is documented as reclaiming value for `context.beneficiary`, and the interface event for claimed tokens is also beneficiary-based.
- The terminal reclaim does follow the caller-supplied `beneficiary`, but the Defifa-specific fee-token claim path calls `_claimTokensFor(...)` with `context.holder`.
- A single cash-out therefore splits its outputs across two addresses: the terminal token goes to `beneficiary`, while `$DEFIFA` and `$NANA` go to the NFT holder instead.

Impact:

- Holders and integrations that route a cash-out to a vault, bridge, or alternate receiver do not get the full settlement bundle at that destination.
- Third-party operators can execute a successful cash-out while silently leaving the fee-token side of the settlement behind on the holder, breaking accounting expectations for downstream integrations.
- I did not find a direct theft path from this mismatch, but it is a real asset-routing bug.

Evidence:

- PoC: [defifa/test/audit/CodexNemesisBeneficiaryMismatch.t.sol](/Users/jango/Documents/jb/v6/evm/defifa/test/audit/CodexNemesisBeneficiaryMismatch.t.sol:20)

Recommended fix:

- Pass `context.beneficiary` into `_claimTokensFor(...)`, or make the split-destination behavior explicit in the interface, docs, and events if it is intentional.

### 9. `defifa`: `tokensClaimableFor` overquotes fee-token claims while pending reserves are unminted

Severity: `LOW`

Status: FIXED. Merged to main in `defifa/src/DefifaHook.sol`.

Affected code:

- [DefifaHook.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaHook.sol:453)
- [DefifaHook.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaHook.sol:786)

Why it is real:

- `tokensClaimableFor(...)` previews claims using only `_totalMintCost`.
- The real complete-phase claim path uses `_totalMintCost + _pendingReserveMintCost()` as the denominator, explicitly diluting paid holders by unminted reserve cost.
- As a result, the public preview overstates the claim whenever pending reserves still exist.

Impact:

- Holders, UIs, and integrators can materially overestimate the `$DEFIFA` and `$NANA` that a cash-out will actually distribute while reserve NFTs remain unminted.
- In the live PoC, the preview prices one token against a `1/6` share while execution uses a `1/9` denominator.
- This is a quote/accounting mismatch rather than a direct drain, but it is large enough to mislead automated flows and user decisions.

Evidence:

- PoC: [defifa/test/audit/CodexNemesisBeneficiaryMismatch.t.sol](/Users/jango/Documents/jb/v6/evm/defifa/test/audit/CodexNemesisBeneficiaryMismatch.t.sol:79)

Recommended fix:

- Make `tokensClaimableFor(...)` use the same pending-reserve-aware denominator as `_claimTokensFor(...)` in the complete-phase execution path.

### 10. `croptop-core-v6`: transferring the project NFT does not transfer hook authority, so the previous owner keeps collection-control permissions until the buyer explicitly claims

Severity: `MED`

Status: FIXED. Merged to main in `croptop-core-v6/src/CTDeployer.sol` and `croptop-core-v6/src/interfaces/ICTDeployer.sol`.

Affected code:

- [CTDeployer.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/src/CTDeployer.sol:154)
- [CTDeployer.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/src/CTDeployer.sol:252)
- [ICTDeployer.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/src/interfaces/ICTDeployer.sol:26)

Why it is real:

- Before the local patch, `deployProjectFor(...)` launched the project with `CTDeployer` as the static hook owner, then granted the initial project recipient `ADJUST_721_TIERS`, `SET_721_METADATA`, `MINT_721`, and `SET_721_DISCOUNT_PERCENT` permissions from `CTDeployer`.
- Hook authority does not automatically follow later `PROJECTS.transferFrom(...)` ownership transfers. It only moves once the current project-NFT holder separately calls `claimCollectionOwnershipOf(...)`, which invokes `transferOwnershipToProject(projectId)`.
- Before the local patch, the hook still checked permissions against `CTDeployer` as owner until that claim, so the previous project owner retained full collection-control powers even after selling the project NFT.
- The local patch keeps the publisher path working from `CTDeployer` but stops granting direct hook-management permissions from `CTDeployer` to the initial owner. Project owners who want direct hook control must first claim collection ownership, after which permissions resolve through the current project NFT owner.

Impact:

- Before the local patch, a seller could mutate tiers, metadata, discounts, or mint authority after the buyer already owned the project NFT.
- This was a real cross-user privilege-retention window, not just a local admin footgun. A buyer who assumed the project NFT transfer also transferred hook control could be frontrun or griefed before discovering and completing the extra claim step.
- The local patch trades away launch-time direct hook bypass privileges to remove the stale-authority grant. Owners still receive the project NFT and can claim project-based hook ownership when they want direct control.

Evidence:

- Regression: [croptop-core-v6/test/audit/CodexNemesisPoCs.t.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/test/audit/CodexNemesisPoCs.t.sol:185)
- Regression: [croptop-core-v6/test/audit/DeployerPermissionBypass.t.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/test/audit/DeployerPermissionBypass.t.sol:175)

Recommended fix:

- Review and merge the local patch that removes launch-time direct hook-management permissions from `CTDeployer`.
- Keep the interface and user-facing flow clear: publisher-managed posting works before claim, while direct collection control requires `claimCollectionOwnershipOf(...)` and any needed post-claim publisher permission grant from the project owner.

### 11. `nana-fee-project-deployer-v6` + `deploy-all-v6`: hardcoded project-`1` fee-sink assumptions let a first-project squat brick or silently hijack the canonical fee project

Severity: `MED`

Status: FIXED. Merged to main in `nana-fee-project-deployer-v6/script/Deploy.s.sol`, `deploy-all-v6/script/Deploy.s.sol`, and `deploy-all-v6/script/Resume.s.sol`.

Affected code:

- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/nana-fee-project-deployer-v6/script/Deploy.s.sol:213)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/nana-fee-project-deployer-v6/script/Deploy.s.sol:232)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:390)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2411)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2941)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2420)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2491)

Why it is real:

- `JBProjects.createFor(...)` is permissionless. The first externally created project on a fresh core deployment becomes project `1`.
- Before the local patch, the fee-project deployer hardcoded `feeProjectId = 1`, skipped deployment whenever `controllerOf(1) != 0`, and otherwise tried to `approve(...)` and configure project `1` as the canonical NANA fee sink.
- The PoC proved three failure modes: an attacker could squat project `1`, push the intended operator to project `2`, make the approval step revert if project `1` was still blank, or fully configure project `1` so the deploy script silently returned early and accepted the attacker-controlled project as already deployed.
- `deploy-all-v6` intentionally keeps NANA at project `1`; its core deployment mints project `1` to the deployer up front, but the deploy and resume scripts still needed fail-closed handling for preconfigured or interrupted states.
- The local patch keeps the intentional project-`1` identity, but accepts an already-configured project `1` only if it is owned by the canonical `REVDeployer`, controlled by the canonical controller, has a nonzero revnet configuration hash, and exposes the `NANA` ERC-20 symbol.

Impact:

- A first-project squat on a fresh chain could brick the canonical fee-project rollout or, worse, silently redirect the ecosystem’s assumed fee sink to an attacker-controlled project `1`.
- Because later deployment and verification phases kept treating project `1` as canonical, the misconfiguration could propagate into broader protocol wiring, monitoring, and fee-flow assumptions instead of failing cleanly.
- This is a deployment-phase issue, but it hits the globally assumed fee beneficiary project and therefore has ecosystem-wide blast radius when triggered.

Evidence:

- PoC: [nana-fee-project-deployer-v6/test/audit/CodexNemesisProjectOneSquat.t.sol](/Users/jango/Documents/jb/v6/evm/nana-fee-project-deployer-v6/test/audit/CodexNemesisProjectOneSquat.t.sol:1)

Recommended fix:

- Review and merge the local canonical-shape guard in the standalone fee deployer and deploy-all deploy/resume scripts.
- Keep the current deploy-all behavior that mints project `1` to the deployer in the core constructor before public project creation can claim it.
- Do not skip NANA configuration merely because `controllerOf(1) != 0`; skip only after owner, controller, revnet hash, and token-symbol checks prove it is the intended NANA revnet.

### 12. `nana-distributor-v6`: `JB721Distributor` lets late-minted replacement NFTs consume round rewards using the seller’s snapshot votes

Severity: `MED`

Status: FIXED. Merged to main in `nana-distributor-v6/src/JB721Distributor.sol`, `nana-721-hook-v6/src/JB721TiersHook.sol`, and `nana-721-hook-v6/src/interfaces/IJB721TiersHook.sol`.

Affected code:

- [JB721Distributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JB721Distributor.sol:268)
- [JB721Distributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JB721Distributor.sol:322)
- [JB721Distributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JB721Distributor.sol:433)
- [IJB721TiersHook.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/interfaces/IJB721TiersHook.sol:142)
- [JB721TiersHook.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721TiersHook.sol:107)
- [JB721TiersHook.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721TiersHook.sol:174)
- [JB721TiersHook.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721TiersHook.sol:809)

Why it is real:

- Before the local patch, the 721 distributor did not prove that a specific token existed and was held at the round snapshot block.
- `_tokenStake(...)` and `_vestSingleToken(...)` only checked the token’s current owner and that owner’s checkpointed `pastVotes` at `roundSnapshotBlock[currentRound()]`.
- That meant any NFT currently owned by an address that had snapshot voting power could vest rewards for the round, even if that NFT was minted or acquired after the snapshot.
- The cross-user PoC showed the concrete consequence: a seller could hold token `1` at round start, transfer token `1` to a buyer after the snapshot, mint or receive token `2` after the snapshot, and then vest the full round through token `2` while the buyer’s real snapshot token became ineligible because the buyer had zero past votes.
- The local patch adds mint blocks and post-mint token-owner checkpoints to the 721 checkpoint module, exposes `ownerOfAt(tokenId, blockNumber)` from `CHECKPOINTS`, and makes the distributor score / consume round eligibility against the token's snapshot owner. Tokens that cannot prove a snapshot owner get zero eligibility.

Impact:

- This was not just a cosmetic documentation mismatch. It was a real reward-redirection bug across users.
- Buyers of snapshot-eligible NFTs could receive no rewards for the current round, while the seller drained that round through a post-snapshot replacement NFT.
- Total extraction remained bounded by the seller’s snapshot voting power, so this was a cross-user theft / misallocation issue rather than system-wide inflation.

Evidence:

- Regression: [nana-distributor-v6/test/audit/CodexNemesisFreshVerification.t.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/test/audit/CodexNemesisFreshVerification.t.sol:1)
- Regression: [nana-distributor-v6/test/audit/CodexNemesisFreshRoundVerification.t.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/test/audit/CodexNemesisFreshRoundVerification.t.sol:1)
- Regression: [nana-distributor-v6/test/audit/CodexNemesisAccountingPoC.t.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/test/audit/CodexNemesisAccountingPoC.t.sol:213)
- Regression: [nana-721-hook-v6/test/unit/getters_constructor_Unit.t.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/test/unit/getters_constructor_Unit.t.sol:505)

Recommended fix:

- Review and merge the local cross-repo patch that makes 721 eligibility token-specific instead of current-owner-specific.
- Keep distributor eligibility strict: if a hook cannot prove token ownership at the snapshot block, that token should not vest the round.
- Preserve the current-owner claim flow for UX, but calculate per-token reward eligibility from snapshot ownership so post-snapshot replacement NFTs cannot steal transferred-token rewards.

### 13. `nana-project-handles-v6`: `handleOf(...)` can return bidi-spoofed handles as verified output

Severity: `LOW`

Status: FIXED. Merged to main in `nana-project-handles-v6/src/JBProjectHandles.sol`.

Affected code:

- [JBProjectHandles.sol](/Users/jango/Documents/jb/v6/evm/nana-project-handles-v6/src/JBProjectHandles.sol:77)
- [JBProjectHandles.sol](/Users/jango/Documents/jb/v6/evm/nana-project-handles-v6/src/JBProjectHandles.sol:132)
- [JBProjectHandles.sol](/Users/jango/Documents/jb/v6/evm/nana-project-handles-v6/src/JBProjectHandles.sol:170)

Why it is real:

- `setEnsNamePartsFor(...)` only rejects dots, ASCII control bytes, and DEL. It allows bidirectional override characters and other visually dangerous Unicode formatting bytes.
- `handleOf(...)` does not normalize or canonicalize the stored labels before treating them as verified. It simply hashes the raw bytes, queries the ENS registry for a resolver, checks the `juicebox` text record, and returns the formatted string.
- The interface comment claims non-canonical labels will fail to resolve in `handleOf`, but that is not generally true. If a matching raw-byte ENS node exists and its resolver returns the expected text record, `handleOf(...)` will surface the spoofed handle as verified.
- The PoC proves the end-to-end verified-output path, not just storage acceptance: a bidi override label is stored, the mocked ENS registry/resolver validates it, and `handleOf(...)` returns the spoofed string.

Impact:

- A project can present a misleading “verified” handle that renders differently from how users intuitively read it in wallets, dashboards, or frontends.
- This is a phishing / identity-confusion risk rather than a direct treasury drain, but it undermines the main trust signal this repo is supposed to provide.

Evidence:

- PoC: [nana-project-handles-v6/test/audit/JBProjectHandlesUnicodeSpoof.t.sol](/Users/jango/Documents/jb/v6/evm/nana-project-handles-v6/test/audit/JBProjectHandlesUnicodeSpoof.t.sol:1)

Recommended fix:

- Reject bidi override and other dangerous Unicode formatting characters in ENS name parts, not just ASCII control bytes.
- If the intended policy is “only ENS-normalized labels are valid,” enforce that onchain before storing or returning a verified handle.

### 14. `revnet-core-v6`: hidden tokens leave the economic denominator, so the same holder can drain via cash out or loans and then restore the hidden tranche

Severity: `MED`

Status: FIXED. Merged to main in `revnet-core-v6/src/REVOwner.sol` and `revnet-core-v6/src/REVLoans.sol`.

Affected code:

- [REVHiddenTokens.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVHiddenTokens.sol:79)
- [REVHiddenTokens.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVHiddenTokens.sol:110)
- [REVOwner.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVOwner.sol:176)
- [REVLoans.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVLoans.sol:360)
- [REVLoans.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVLoans.sol:1173)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:389)

Why it is real:

- `REVHiddenTokens.hideTokensOf(...)` burns a holder’s tokens out of the live revnet supply, tracks them separately, and later `revealTokensOf(...)` re-mints that exact balance back to the holder.
- `REVOwner.beforeCashOutRecordedWith(...)` uses `context.totalSupply` plus remote supply for cash-out pricing, and `REVLoans._borrowableAmountFrom(...)` uses `CONTROLLER.totalTokenSupplyWithReservedTokensOf(...) + totalCollateralOf[...]` for loan pricing. Neither path adds hidden supply back into the economic denominator.
- That means hidden balances stop diluting reclaim / borrow math even though they remain a recoverable claim. A holder can hide part of their stack, use the smaller visible supply to reclaim or borrow against an outsized share of the treasury, then reveal the hidden tranche afterward.
- This is not limited to operator-managed allowlists for arbitrary users. `REVDeployer` grants the split operator `HIDE_TOKENS` by default, and `REVHiddenTokens` explicitly lets any holder who has that permission hide their own balance.

Impact:

- Any holder that is allowlisted for hiding, and any split operator by default, can amplify the per-token claim of their visible tranche without giving up the hidden tranche permanently.
- The cash-out PoC drains the full revnet balance with only the visible half of the holder’s stack, then restores the hidden half immediately afterward.
- The loan PoC borrows against the reduced denominator, leaves only the 2.5% protocol-fee residue in treasury, restores the hidden tranche, and leaves the full pre-hide treasury amount booked as debt.
- This turns a governance / visibility feature into an economic-drain primitive against revnet treasuries.

Evidence:

- PoC: [revnet-core-v6/test/audit/HiddenSupplyCashout.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/audit/HiddenSupplyCashout.t.sol:1)
- PoC: [revnet-core-v6/test/audit/HiddenSupplyLoanBorrow.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/audit/HiddenSupplyLoanBorrow.t.sol:1)

Recommended fix:

- Hidden balances must remain in the economic denominator used by both cash outs and loans.
- The cleanest design fix is to make hiding affect governance / visibility only, not treasury math.
- The local patch keeps burning hidden tokens as the storage model, adds local hidden supply back into `REVOwner.beforeCashOutRecordedWith(...)` and `REVLoans._borrowableAmountFrom(...)`, and updates the hidden-token docs/tests to state the governance/visibility-vs-economic-denominator split.
- The system should still review whether hidden balances can be revealed while the holder has outstanding loan exposure, but the direct drain/borrow amplification path is closed by keeping hidden supply in the denominator.

### 15. `deploy-all-v6`: `Verify.s.sol` is stale against the real canonical routing and ownership topology

Severity: `LOW`

Status: FIXED. Merged to main in `deploy-all-v6/script/Verify.s.sol`.

Affected code:

- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2086)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2189)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2362)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2489)
- [JBDirectory.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBDirectory.sol:212)
- [JBDirectory.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBDirectory.sol:304)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:281)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:868)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:885)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:914)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:803)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:820)
- [ResumeDeployFork.t.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/test/fork/ResumeDeployFork.t.sol:784)

Why it is real:

- The deploy path passes `JBRouterTerminalRegistry` into `terminalConfigurations`, so `JBDirectory.setTerminalsOf(...)` stores the registry address as the project terminal.
- `Verify.s.sol` instead searches each canonical project’s terminal list for the raw `JBRouterTerminal` singleton.
- That means the route check is stale against the actual deployment topology. A correct registry-based deployment will log route failures, while the verifier still never asserts that the real forwarding registry terminal is present.
- The same verifier also exposes an optional `VERIFY_SAFE` assertion that treats canonical projects as safe-owned, but `REVDeployer` actually launches or transfers canonical revnets into itself. The resume harness already asserts that owner target.
- The route checks are also non-critical, so this drift weakens the only automated post-deploy check meant to confirm canonical route wiring.

Impact:

- Operators get false negatives from the verifier on healthy deployments and no automated proof that the routing surface actually used by canonical projects was installed.
- If operators rely on the optional safe-owner check, correct canonical revnet deployments can also be rejected for matching the actual owner topology.
- Because the verifier is checking the wrong terminal shape, real route miswirings can hide behind noisy output instead of being isolated as a precise post-deploy failure.

Recommended fix:

- Make `Verify.s.sol` check `directory.terminalsOf(projectId)` for `routerTerminalRegistry`, not the raw `routerTerminal`.
- Then verify that the registry resolves to the intended router terminal for canonical projects, and consider making the route check critical once it matches real deploy intent.
- Remove or repurpose `VERIFY_SAFE` for canonical revnets so owner checks match the actual steady-state owner targets.

### 16. `deploy-all-v6`: `Resume.s.sol` can accept an attacker-configured project `2` as the canonical Croptop fee sink after an interrupted deployment

Severity: `MED`

Status: FIXED. Merged to main in `deploy-all-v6/script/Resume.s.sol` and `deploy-all-v6/script/Verify.s.sol`.

Affected code:

- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:1941)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:1949)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:3044)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:3049)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2228)
- [CTPublisher.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/src/CTPublisher.sol:61)
- [CTPublisher.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/src/CTPublisher.sol:105)
- [CTPublisher.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/src/CTPublisher.sol:303)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:365)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:910)

Why it is real:

- In the resume path, `_ensureProjectExists(...)` skips the ownership check for any expected project ID that already has a controller set.
- `_resumeCroptop()` immediately consumes that returned project ID as `_cpnProjectId` and deploys `CTPublisher` with it as the immutable `FEE_PROJECT_ID`.
- If deployment is interrupted after the core/controller phases, a third party can permissionlessly create and configure project `2` using the just-deployed controller before the operator resumes.
- Resume will then accept that attacker-owned but controller-configured project `2`, and `_resumeCpnRevnet()` will later skip canonical CPN configuration entirely because `controllerOf(2) != 0`.
- `CTPublisher` routes Croptop fees to whatever project ID it was constructed with, so the resumed deployment silently adopts the attacker’s project `2` as the Croptop fee sink.
- `Verify.s.sol` does not assert `CTPublisher.FEE_PROJECT_ID()` or the expected canonical owner target for project `2`, so a squatted project using the same controller / terminal shape can evade the normal post-resume verification flow.

Impact:

- An interrupted deployment can be resumed into an attacker-controlled Croptop fee project without failing fast.
- After that point, Croptop publication fees are routed into the attacker’s project `2`, and the canonical CPN revnet setup is skipped as if it were already complete.
- This is not the same as the earlier project-`1` squat issue. It is a distinct resume-path hijack that appears after core deployment is already live and public.

Evidence:

- PoC: [deploy-all-v6/test/audit/ResumeCroptopProjectTwoSquat.t.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/test/audit/ResumeCroptopProjectTwoSquat.t.sol:1)

Recommended fix:

- Resume should not trust `controllerOf(projectId) != 0` alone as proof that an expected canonical project is the right one.
- For project `2`, require both the expected owner / controller topology and the expected Croptop-specific invariants before accepting it, otherwise revert and force operator intervention.
- More generally, persist canonical project IDs and expected owners from the initial deployment state and verify them explicitly during resume instead of rediscovering them from public project numbering alone.

### 17. `deploy-all-v6`: `Resume.s.sol` can treat an attacker-configured project `4` as canonical BAN/Banny, and `Verify.s.sol` does not assert any Banny-specific invariant to catch it

Severity: `MED`

Status: FIXED. Merged to main in `deploy-all-v6/script/Resume.s.sol` and `deploy-all-v6/script/Verify.s.sol`.

Affected code:

- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2503)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2512)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2427)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:334)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:365)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:873)

Why it is real:

- `_resumeBanny()` skips the whole Banny phase whenever `projects.count() >= 4` and `controllerOf(4) != 0`.
- That skip path never checks whether project `4` is the canonical BAN deployment target, whether it is owned by the expected party, or whether any Banny-specific assets were actually deployed.
- After an interrupted deployment, once the controller is live and projects `1-3` already exist, a third party can create and configure project `4` before the operator resumes.
- Resume will then mark Phase 09 as already configured and never deploy the canonical `Banny721TokenUriResolver` or the intended BAN-specific revnet / tier setup.
- `Verify.s.sol` currently has no Banny-specific assertion. It only checks that project `4` exists and has generic JB controller / terminal wiring. It does not assert any deterministic Banny deployment artifact, resolver wiring, or BAN-specific project shape.
- Because the current verification path does not require `VERIFY_SAFE` and already has stale assumptions around canonical owner topology, an attacker-owned but generically wired project `4` can satisfy the normal BAN checks even though the intended Banny deployment never happened.

Impact:

- An interrupted deployment can silently ship with an attacker-controlled or arbitrary project `4` standing in for BAN.
- Operators can get a clean generic verification result for BAN’s controller / terminal shape while the actual Banny product surface was never deployed.
- This is a deployment blocker for a “one-stop” rollout because the canonical app namespace can be lost without an explicit verification failure.

Evidence:

- PoC: [deploy-all-v6/test/audit/ResumeBannyProjectFourSquat.t.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/test/audit/ResumeBannyProjectFourSquat.t.sol:1)

Recommended fix:

- Resume should reject project `4` unless BAN-specific invariants hold, instead of treating any controller-configured project `4` as canonical Banny.
- `Verify.s.sol` should assert Banny-specific deterministic outputs, not just generic project wiring. At minimum it should verify that the canonical Banny deployment artifacts exist and that BAN was configured through that path.
- More generally, the deploy/resume flow should persist and re-check canonical project identity rather than rediscovering it from public numbering and generic controller presence.

### 18. `deploy-all-v6`: `Resume.s.sol` can adopt an attacker-configured project `3` as canonical REV if the attacker pre-approves the resume caller, and `Verify.s.sol` does not check the REV identity immutables

Severity: `MED`

Status: FIXED. Merged to main in `deploy-all-v6/script/Resume.s.sol` and `deploy-all-v6/script/Verify.s.sol`.

Affected code:

- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2003)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2095)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2098)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:3044)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:105)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:813)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:820)
- [REVOwner.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVOwner.sol:61)
- [REVLoans.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVLoans.sol:122)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:332)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:621)

Why it is real:

- `_ensureProjectExists(...)` in the resume path accepts any expected project ID that already has a controller set, without proving that the project NFT is still the canonical one.
- `_resumeRevnet()` then deploys `REVLoans`, `REVOwner`, and `REVDeployer` with that returned project ID baked in as their canonical REV identity (`REV_ID` / `FEE_REVNET_ID`) before checking anything else about project `3`.
- It next calls `_projects.approve(address(_revDeployer), _revProjectId)` unconditionally. An attacker-owned project `3` would normally make resume revert here, but the attacker can simply pre-approve the known resume caller so the approval succeeds.
- Because `controllerOf(3) != 0`, resume then skips `_deployRevFeeProject()`. The attacker’s project `3` remains the live canonical REV project while the freshly deployed REV infrastructure binds to it as if it were legitimate.
- That binding is not cosmetic. `REVOwner` routes cash-out fees to `FEE_REVNET_ID`, `REVLoans` uses `REV_ID` as the canonical fee revnet, and later deployment phases like Defifa resolve `tokens.tokenOf(3)` as their fee token surface.
- `Verify.s.sol` currently checks only generic project-`3` existence plus revnet contract interconnections. It does not assert `REVDeployer.FEE_REVNET_ID()`, `REVOwner.FEE_REVNET_ID()`, `REVLoans.REV_ID()`, or any project-`3` provenance invariant that would distinguish the attacker’s project from the intended canonical REV fee sink.

Impact:

- An interrupted deployment can resume into an attacker-owned canonical REV fee project if the attacker cooperates just enough to pre-approve the resume caller.
- After that, canonical REV fee flows, revnet loan accounting, and downstream integrations that assume project `3` is the real REV deployment are all anchored to attacker-controlled project identity.
- This is a stronger failure mode than a plain resume DoS because the resumed deployment can appear structurally healthy while adopting the wrong fee revnet.

Evidence:

- PoC: [deploy-all-v6/test/audit/ResumeRevProjectThreeSquat.t.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/test/audit/ResumeRevProjectThreeSquat.t.sol:1)

Recommended fix:

- Resume should not deploy any REV infrastructure until project `3` has passed explicit owner / provenance validation, even if `controllerOf(3) != 0`.
- `Verify.s.sol` should assert the identity immutables that make these contracts canonical, including `REVDeployer.FEE_REVNET_ID() == 3`, `REVOwner.FEE_REVNET_ID() == 3`, and `REVLoans.REV_ID() == 3`, plus the expected canonical project-`3` provenance.
- More generally, stop treating public project numbering plus generic controller presence as sufficient proof that a resumed deployment is still converging on the intended canonical products.

### 19. `croptop-core-v6` + `defifa` + `revnet-core-v6` + `nana-omnichain-deployers-v6` + `nana-721-hook-v6`: public launchers can be griefed by permissionless `JBProjects.createFor(...)` front-runs because they predict `projectId = count() + 1`

Severity: `LOW`

Status: FIXED. Merged to main across `croptop-core-v6/src/CTDeployer.sol`, `defifa/src/DefifaDeployer.sol`, `revnet-core-v6/src/REVDeployer.sol`, `nana-omnichain-deployers-v6/src/JBOmnichainDeployer.sol`, and `nana-721-hook-v6/src/JB721TiersHookProjectDeployer.sol`.

Affected code:

- [JBProjects.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBProjects.sol:70)
- [CTDeployer.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/src/CTDeployer.sol:185)
- [DefifaDeployer.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaDeployer.sol:432)
- [JB721TiersHookProjectDeployer.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721TiersHookProjectDeployer.sol:105)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:524)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:806)
- [JBOmnichainDeployer.sol](/Users/jango/Documents/jb/v6/evm/nana-omnichain-deployers-v6/src/JBOmnichainDeployer.sol:728)

Why it is real:

- `JBProjects.createFor(...)` is permissionless, so any address can increment the global project counter at low cost.
- The unpatched `CTDeployer.deployProjectFor(...)`, `DefifaDeployer.launchGameWith(...)`, `JB721TiersHookProjectDeployer.launchProjectFor(...)`, `REVDeployer.deployFor(... revnetId == 0 ...)`, and `JBOmnichainDeployer.launchProjectFor(...)` all predicted the next canonical project ID from `count() + 1` before calling `launchProjectFor(...)`.
- If any unrelated project creation lands first in the same block, the actual launched project ID differs from the predicted one and the launcher reverts.
- Defifa already carries an explicit QA regression for this race and confirms the revert path is live. Croptop, the shared 721 project deployer, and Revnet use the same count-based prediction pattern.
- The strongest argument against severity is that the revert rolls state back and the caller can retry. That is true, but it does not stop a mempool observer from repeatedly front-running every public launch with a cheap dummy project creation.
- The local patches reserve the project first with `JBProjects.createFor(address(this))`, derive hooks/rulesets/suckers against the assigned ID, launch via `launchRulesetsFor(...)`, set project URIs explicitly where needed, and then transfer the project NFT when the launcher is not intended to retain ownership.

Impact:

- Public-mempool launches of new Croptop projects, Defifa games, 721-hook projects, fresh revnets, and omnichain project launches can be griefed at low cost.
- No direct fund loss occurs and retries can succeed, especially with private order flow, but the launch surface is not reliably permissionless under adversarial ordering.
- This is an ecosystem liveness issue rather than a treasury-drain issue, but it is live across multiple user-facing launchers.

Evidence:

- PoC: [croptop-core-v6/test/audit/ProjectIdFrontRunDoS.t.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/test/audit/ProjectIdFrontRunDoS.t.sol:1)
- PoC: [nana-721-hook-v6/test/audit/ProjectIdFrontRunDoS.t.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/test/audit/ProjectIdFrontRunDoS.t.sol:1)
- PoC: [revnet-core-v6/test/audit/ProjectIdFrontRunDoS.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/audit/ProjectIdFrontRunDoS.t.sol:1)
- PoC: [nana-omnichain-deployers-v6/test/audit/ProjectIdFrontRunDoS.t.sol](/Users/jango/Documents/jb/v6/evm/nana-omnichain-deployers-v6/test/audit/ProjectIdFrontRunDoS.t.sol:1)
- Existing QA regression: [defifa/test/TestQALastMile.t.sol](/Users/jango/Documents/jb/v6/evm/defifa/test/TestQALastMile.t.sol:332)
- Fix regression / verification:
  - `forge test --match-path test/audit/ProjectIdFrontRunDoS.t.sol` in `croptop-core-v6`
  - `forge test --match-path test/CTDeployer.t.sol` in `croptop-core-v6`
  - `forge test --match-path test/audit/CodexNemesisFreshRound.t.sol --match-test 'test_deployProjectFor_failsOpenWhenSuckerDeploymentFails|test_directRegistryDeploymentAfterOwnershipTransferCanMapThroughRegistry'` in `croptop-core-v6`
  - `forge build` in `croptop-core-v6`
  - `forge test --match-path test/audit/ProjectIdFrontRunDoS.t.sol` in `nana-721-hook-v6`
  - `forge test --match-path test/unit/deployer_Unit.t.sol` in `nana-721-hook-v6`
  - `forge test --match-path test/regression/ProjectDeployerRulesets.t.sol` and `forge test --match-path test/audit/ProjectDeployerAuth.t.sol` in `nana-721-hook-v6`
  - `forge build` in `nana-721-hook-v6`
  - `forge test --match-path test/DefifaSecurity.t.sol`, `forge test --match-path test/DefifaNoContest.t.sol`, and `forge build` in `defifa`
  - `forge test --match-path test/audit/ProjectIdFrontRunDoS.t.sol`, `forge test --match-path test/TestConversionDocumentation.t.sol`, `forge test --match-path test/TestTerminalEncodingInHash.t.sol`, and `forge build` in `revnet-core-v6`
  - `forge test --match-path test/audit/ProjectIdFrontRunDoS.t.sol`, `forge test --match-path test/JBOmnichainDeployer.t.sol`, `forge test --match-path test/Tiered721HookComposition.t.sol`, `forge test --match-path test/JBOmnichainDeployerGuard.t.sol`, `forge test --match-path test/OmnichainDeployerEdgeCases.t.sol`, `forge test --match-path test/OmnichainDeployerAttacks.t.sol`, `forge test --match-path test/TestAuditGaps.sol`, and `forge build` in `nana-omnichain-deployers-v6`

Recommended fix:

- Review and merge the local reservation-based launcher patches.
- Keep future public launchers on the same pattern: reserve/create the project ID first, then build dependent hook / config / peer data around the assigned ID.
- Do not reintroduce `count() + 1` as an authority for externally visible project IDs.

### 20. `deploy-all-v6`: `Verify.s.sol` can green-light incomplete deployments because address-registry / Defifa remain optional and the always-deployed Phase 11 periphery is never checked

Severity: `LOW`

Status: FIXED. Merged to main in `deploy-all-v6/script/Verify.s.sol`.

Affected code:

- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:283)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:292)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:671)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:425)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:472)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:475)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:695)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2698)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2820)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2831)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2865)

Why it is real:

- `Deploy.s.sol` always executes Phase 02 address-registry deployment and always executes Phase 11 periphery deployment for project handles, both distributors, and the project-payer deployer.
- `Verify.s.sol` only fail-closes production chains for router / buyback / revnet addresses. `VERIFY_ADDRESS_REGISTRY` and `VERIFY_DEFIFA_DEPLOYER` are optional env vars, and Category 7 simply skips both checks when they are unset.
- Even when those env vars are supplied, Category 7 only checks `code.length > 0`; it does not verify any of the address-registry or Defifa wiring that the deploy script actually depends on.
- `Verify.s.sol` does not load or check the Phase 11 periphery at all, so a rollout can miss those artifacts entirely and still finish verification without a critical failure.

Impact:

- `deploy-all-v6` is not currently a trustworthy one-stop deployment plus verification flow for the full advertised product surface.
- A release can be missing the address registry, the Defifa game factory, or the always-deployed project-handles / distributor / project-payer periphery and still appear verified if the operator omits those env vars or relies on the current categories.
- This is not a direct onchain theft vector, but it is a deployment blocker because incomplete rollouts can escape post-deploy detection.

Evidence:

- Code-path comparison only. The issue is the absence of required verification logic relative to the actual deploy phases.

Recommended fix:

- Require `VERIFY_ADDRESS_REGISTRY` and the expected Defifa envs on every chain where `Deploy.s.sol` deploys them.
- Add real invariant checks for the Defifa stack, not just `code.length > 0`.
- Add a Category 11 verification pass for `JBProjectHandles`, `JB721Distributor`, `JBTokenDistributor`, and `JBProjectPayerDeployer`, with constructor-argument / immutable checks that match the deployment path.

### 21. `revnet-core-v6` + `nana-suckers-v6`: caller-salted sucker deployment breaks default peer symmetry even for identical revnet configs

Severity: `MED`

Status: FIXED. Merged to main in `revnet-core-v6/src/REVDeployer.sol`. The separate registry/deployer-topology assumption remains open in finding 27.

Affected code:

- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:904)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:915)
- [JBSuckerRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSuckerRegistry.sol:503)
- [JBSuckerRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSuckerRegistry.sol:510)
- [JBSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol:714)
- [JBSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol:725)

Why it is real:

- Before the local patch, `REVDeployer._deploySuckersFor(...)` salted sucker deployment with `_msgSender()` before calling the registry.
- `JBSuckerRegistry.deploySuckersFor(...)` then salts again with its own caller and explicitly documents that same-address peer symmetry only holds when deployments originate from the same sender across chains.
- `JBSucker.peer()` defaults to `address(this)`, so the entire default peer model assumes those CREATE2 inputs converge to the same deployed sucker address on every chain.
- That meant two revnets with identical `hashedEncodedConfigurationOf(...)` values did not, by themselves, determine the same sucker addresses. Different split operators, forwarders, or caller choices changed the deployed addresses even when the revnet configuration and sucker salt were identical.
- Once the deployed addresses diverged, the default `peer()` on each sucker pointed to itself instead of the counterpart on the other chain, and cross-chain message handling rejected the real remote sucker as a non-peer.
- The local patch removes the external caller from the REV-side sucker salt and derives the registry input from only the encoded revnet configuration hash plus the project-provided sucker salt. The registry still namespaces deployments by its caller, which is now the stable `REVDeployer` path for revnets.

Impact:

- Revnet cross-chain expansion was not actually determined solely by revnet configuration plus deployment salt.
- A project could deploy matching revnet configs on two chains, believe the default same-address peer assumption held, and still end up with suckers that did not recognize each other because the external caller path differed.
- This could silently break default cross-chain peer wiring after split-operator rotation, different relayer usage, or any deployment path variation that changed `_msgSender()`.
- The failure mode was not just cosmetic. Bridge messages could hard-revert at the peer check, leaving the expansion path broken until custom peer overrides or a redeploy strategy was used.

Evidence:

- Regression: [revnet-core-v6/test/audit/SuckerCallerDeterminism.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/audit/SuckerCallerDeterminism.t.sol:152)

Recommended fix:

- Review and merge the local `REVDeployer` salt patch.
- Keep finding 27 open until registry / deployer topology drift is also addressed or explicitly documented, because same external caller removal does not prove the registry and underlying sucker deployer addresses match across chains.

### 22. `revnet-core-v6` + `nana-suckers-v6`: omnichain cash-outs and loans ignore remote outstanding loan state

Severity: `MED`

Status: FIXED. Merged to main in `nana-suckers-v6/src/libraries/JBSuckerLib.sol` and `revnet-core-v6/src/REVOwner.sol`.

Affected code:

- [JBSuckerLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSuckerLib.sol:224)
- [JBSuckerLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSuckerLib.sol:266)
- [REVOwner.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVOwner.sol:176)
- [REVLoans.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVLoans.sol:377)

Why it is real:

- Local revnet accounting correctly treats active loans as part of the economic state: `REVLoans._borrowableAmountFrom(...)` adds local outstanding debt back into surplus and local burned loan collateral back into supply before running the bonding curve.
- Cross-chain snapshots do not carry that same loan state. `JBSuckerLib.buildSnapshotMessage(...)` only exports the visible `totalTokenSupplyWithReservedTokensOf(...)`, terminal surplus, and terminal balance from the source chain.
- `REVOwner.beforeCashOutRecordedWith(...)` and `REVLoans._borrowableAmountFrom(...)` then build their omnichain curve from `remoteTotalSupplyOf(...)` and `remoteSurplusOf(...)` alone.
- If another chain has active loans, its visible supply is lower because collateral was burned there, and its visible terminal surplus is lower because borrowed funds left the treasury there. Those omissions are not neutral in the bonding curve. The remote chain's burned collateral and outstanding debt should both still participate in omnichain pricing, just like the local chain's loan state does.

Impact:

- A holder cashing out on chain A can receive more than the true omnichain curve allows if chain B has outstanding loans, because chain B's loan-collateral supply and loan-backed surplus are missing from chain A's pricing inputs.
- The same omission can overstate `borrowableAmountFrom(...)` on chain A, again bounded only by the local treasury cap.
- This does not require stale snapshots or bad peers. It happens under otherwise healthy cross-chain operation as soon as one remote chain originates loans.

Evidence:

- PoC: [revnet-core-v6/test/audit/RemoteLoanStateOmission.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/audit/RemoteLoanStateOmission.t.sol:1)
- Supporting proof: [revnet-core-v6/test/audit/NemesisVerification.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/audit/NemesisVerification.t.sol:27)
- Regression: [nana-suckers-v6/test/unit/peer_chain_state.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/unit/peer_chain_state.t.sol:1) now covers optional data-hook accounting in outbound snapshots.
- Regression: [revnet-core-v6/test/audit/LocalLoanStateOmissionCashout.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/audit/LocalLoanStateOmissionCashout.t.sol:1) now covers `REVOwner.peerChainAccountingContextOf(...)`.

Recommended fix:

- Review and merge the local optional peer-chain accounting patch.
- `nana-suckers-v6` now augments outbound snapshots with an optional current-ruleset data-hook contribution, and `revnet-core-v6` exposes that contribution as hidden supply plus local burned loan collateral for `sourceTotalSupply`, and outstanding local loan debt for `sourceSurplus`.
- Keep the existing deploy-time ETH/native identity feed checks, because revnet loan debt is converted into the sucker snapshot's ETH-denominated surplus.

### 23. `nana-suckers-v6` + `revnet-core-v6`: later same-block remote snapshots cannot refresh shared omnichain state

Severity: `MED`

Status: FIXED. Merged to main in `nana-suckers-v6/src/JBSucker.sol`.

Affected code:

- [JBSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol:403)
- [REVOwner.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVOwner.sol:176)
- [REVLoans.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVLoans.sol:377)

Why it is real:

- `JBSucker.fromRemote(...)` accepts per-token inbox roots by nonce, but it updates the shared peer-chain supply/surplus/balance snapshot only when `root.sourceTimestamp > snapshotTimestamp`.
- `sourceTimestamp` is just the source chain's `block.timestamp`, so every snapshot created in the same source block has the same freshness key even if the underlying remote economic state changed between sends.
- That means the first same-block snapshot to arrive pins the shared state, and any later snapshot from that same block is unable to refresh it, even with a higher per-token nonce and newer real treasury/supply values.
- `REVOwner` and `REVLoans` consume this shared state directly for cross-chain cash-out and borrowing math.

Impact:

- A revnet that bridges more than once in the same source block can leave remote peers stuck on whichever same-block snapshot landed first instead of the latest real state.
- The stale values can persist until a later bridge message is sent from a strictly newer block timestamp; if no later bridge occurs, the stale omnichain pricing can last indefinitely.
- Cash-outs and loan quotes on the remote chain can therefore use materially stale supply/surplus inputs under normal operation, without requiring deprecated suckers or broken peers.

Evidence:

- PoC: [nana-suckers-v6/test/audit/SameTimestampSnapshotPinned.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/audit/SameTimestampSnapshotPinned.t.sol:1)
- Regression: [nana-suckers-v6/test/unit/peer_chain_state.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/unit/peer_chain_state.t.sol:1) now covers monotonic same-block outbound snapshot freshness.

Recommended fix:

- Review and merge the local source-freshness patch.
- Outbound snapshots now use a monotonic per-sucker source freshness key in the existing `sourceTimestamp` field, so multiple roots sent in the same source block no longer share the same shared-state freshness boundary.
- Keep message-layout compatibility tests in place because the field name is retained for ABI compatibility even though it now acts as a freshness key.

### 24. `revnet-core-v6`: cash-out pricing ignores local outstanding loan debt and burned loan collateral

Severity: `MED`

Status: FIXED. Merged to main in `revnet-core-v6/src/REVOwner.sol`.

Affected code:

- [REVOwner.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVOwner.sol:176)
- [REVLoans.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVLoans.sol:360)
- [REVLoans.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVLoans.sol:377)

Why it is real:

- `REVLoans._borrowableAmountFrom(...)` explicitly treats active local loans as part of the revnet's economic state: it adds `totalCollateralOf[revnetId]` back into supply and `_totalBorrowedFrom(...)` back into surplus before running the bonding curve.
- `REVOwner.beforeCashOutRecordedWith(...)` does not mirror that adjustment. It prices ordinary cash-outs from the terminal-provided visible `context.totalSupply` and visible `context.surplus.value`, then only adds remote registry values on top.
- Once a loan is opened, the local treasury has less visible surplus because funds left through `useAllowanceOf(...)`, and the local token supply is lower because the collateral tokens were burned. Those omissions are not neutral in the cash-out curve.
- The live PoC shows the consequence with two equal holders: the attacker opens a loan against half their stack, then cashes out their remaining visible tranche. The quoted cash-out is larger than the corrected curve that includes the same local debt and collateral state the loans contract already treats as economic reality.

Impact:

- This is a real cross-holder extraction path, not just an accounting mismatch. A borrower can pull out more cash-out value than their post-loan visible tranche should receive, leaving the remaining holders with a reduced treasury while the outstanding loan still exists.
- It does not require cross-chain state, deprecated suckers, or privileged roles. Any holder with enough balance to collateralize a loan can use the single-chain loan flow and then immediately cash out against the under-counted denominator.
- The hidden-token finding covers balances voluntarily burned into the hidden-token helper. This issue is separate: even without hidden tokens, the ordinary live loan system already creates burned collateral and outstanding debt that `REVOwner` forgets during cash-outs.

Evidence:

- PoC: [revnet-core-v6/test/audit/LocalLoanStateOmissionCashout.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/audit/LocalLoanStateOmissionCashout.t.sol:1)

Recommended fix:

- Make `REVOwner.beforeCashOutRecordedWith(...)` include local outstanding loan debt in effective surplus and local burned loan collateral in total supply before running any cash-out or buyback-routing math.
- The local cash-out curve should consume the same economic state that `REVLoans` already uses for local borrow pricing. If revnet cash-outs are meant to stay fee-free or route differently for specific callers, that should only change fees and routing, not the denominator itself.
- The local patch mirrors `REVLoans` source iteration and decimal/currency normalization in `REVOwner`, adds `totalCollateralOf[revnetId]` to the local cash-out denominator, and adds converted local outstanding debt to effective surplus before buyback routing and fee calculations.

### 25. `nana-suckers-v6`: failed CCIP excess-payment refunds permanently strand ETH while overstating claimable native balance

Severity: `LOW`

Status: FIXED. Merged to main in `nana-suckers-v6/src/JBSucker.sol`, `nana-suckers-v6/src/JBCCIPSucker.sol`, and `nana-suckers-v6/src/JBSwapCCIPSucker.sol`.

Affected code:

- [JBCCIPLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBCCIPLib.sol:147)
- [JBCCIPSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBCCIPSucker.sol:238)
- [JBSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol:709)
- [JBSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol:853)

Why it is real:

- `JBCCIPLib.sendCCIPMessage(...)` refunds `transportPayment - fees` with a low-level ETH call after `ccipSend(...)` succeeds. If the refund recipient cannot receive ETH, the library only reports `refundFailed = true` and leaves the excess ETH on the sucker.
- `JBCCIPSucker._sendRootOverAMB(...)` treats that as best-effort and only emits `TransportPaymentRefundFailed(...)`. There is no retry path and no sweep path for the retained ETH.
- The unpatched implementation did not track failed CCIP refund residue separately; `JBSucker.amountToAddToBalanceOf(JBConstants.NATIVE_TOKEN)` counted any native balance above `outbox.balance` as addable.
- The live PoC showed that later native claims still only forwarded their own proved `terminalTokenAmount`, so the failed-refund residue remained stuck after ordinary claim settlement instead of being naturally flushed.
- The local patch records failed native CCIP transport-payment refunds as caller-scoped credit, excludes the retained total from native add-to-balance accounting, and lets the original caller claim the retained refund to any payable beneficiary.

Impact:

- Any non-payable caller, reverting refund recipient, or wrapper contract with a failing receive path can permanently strand arbitrary excess transport ETH in a CCIP sucker after an otherwise successful bridge send.
- This is worse than the `toRemoteFee` path operationally because the retained amount is not capped by `MAX_TO_REMOTE_FEE`; it scales with however much excess `transportPayment` the caller supplied above the actual CCIP fee.
- I did not find a theft path from this residue. The issue is stranded user value plus misleading native-balance accounting.

Evidence:

- PoC: [nana-suckers-v6/test/audit/FeeLocking.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/audit/FeeLocking.t.sol:272)

Recommended fix:

- Review and merge the local retained-transport-refund patch. It mirrors the retained `toRemoteFee` pattern with `retainedTransportPaymentRefundOf`, `retainedTransportPaymentRefundBalance`, `claimRetainedTransportPaymentRefund(...)`, and retained-refund events.
- Keep retained transport-payment refunds out of `amountToAddToBalanceOf(JBConstants.NATIVE_TOKEN)` unless a future ordinary claim path can actually forward them safely.

### 26. `revnet-core-v6`: the revnet configuration hash used for omnichain sucker identity previously omitted split-operator authority, reserved split routing, and custom ruleset policy bits

Severity: `MED`

Status: FIXED. Merged to main in `revnet-core-v6/src/REVDeployer.sol`.

Affected code:

- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:628)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:914)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:952)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:1019)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:1034)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:1089)
- [JBSuckerRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSuckerRegistry.sol:510)
- [JBSuckerDeployer.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/deployers/JBSuckerDeployer.sol:160)

Why it is real:

- In the unpatched implementation, `_makeRulesetConfigurations(...)` built `encodedConfigurationHash` from base currency, name, ticker, description salt, terminal addresses, selected stage timing/economic fields, and auto-issuances, then stored it as `hashedEncodedConfigurationOf[revnetId]`.
- That encoding omitted several fields that materially change the deployed revnet: `configuration.splitOperator`, `stageConfiguration.splits`, and `stageConfiguration.extraMetadata`.
- The same hash is reused as the revnet's sucker-identity commitment: `deployFor(...)` and `deploySuckersFor(...)` feed it into `_deploySuckersFor(...)`, which feeds it into the registry salt, which feeds it into the deployer salt before the CREATE2 clone is created.
- `localProjectId` is only passed to `initialize(...)` after clone deployment, so it does not rescue the identity commitment. If the caller and explicit deployment salt match across chains, two materially different revnets can line up behind the same cross-chain sucker address scheme unless the configuration hash commits to those differences.
- The local patch adds `configuration.splitOperator`, `stageConfiguration.extraMetadata`, the reserved split count, and each reserved split's routing fields to the encoded configuration before hashing.
- The prior collision PoCs have been converted into regressions proving that split-operator, reserved-split, and extra-metadata differences now change `hashedEncodedConfigurationOf(...)`.

Impact:

- Cross-chain operators and tooling can treat materially different revnets as having the "same configuration" and pair them through the omnichain sucker path.
- A remote expansion can preserve the expected peer identity while changing who controls split-operator powers, where reserved issuance is routed, or whether future sucker deployment is allowed.
- This breaks the intended equivalence guarantee behind omnichain revnet pairing. The peer-auth and shared-accounting layer can be established between revnets that are not actually the same product.

Evidence:

- Regression: [WeakConfigurationHash.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/audit/WeakConfigurationHash.t.sol:17)
- Regression: [TestTerminalEncodingInHash.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/TestTerminalEncodingInHash.t.sol:170)

Recommended fix:

- Review and merge the local configuration-hash expansion.
- Treat future `REVConfig` / `REVStageConfig` fields as identity-affecting by default unless they are explicitly documented as chain-local and deliberately excluded from cross-chain revnet equivalence.

### 27. `nana-suckers-v6`: default peer authentication also depends on identical deployment topology, so matching salts still fail when registry or deployer addresses drift

Severity: `MED`

Status: FIXED. Merged to main in `nana-suckers-v6`.

Affected code:

- [JBSuckerDeployerConfig.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/structs/JBSuckerDeployerConfig.sol:11)
- [JBSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol:747)
- [JBSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol:847)
- [JBSuckerRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSuckerRegistry.sol:502)
- [JBSuckerDeployer.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/deployers/JBSuckerDeployer.sol:147)
- [JBSuckerDeployer.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/deployers/JBSuckerDeployer.sol:168)
- [JBOptimismSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBOptimismSucker.sol:78)

Why it is real:

- The default peer model is `peer() == address(this)`. That means cross-chain peers only authenticate correctly if the sucker clone lands at the same address on every chain.
- Matching user salts are not enough. The clone address also depends on the deployer address and singleton topology that sit underneath `cloneDeterministic(...)`.
- The live `PeerTopologyAuthBreak` PoC shows that direct deployer calls with the same caller and same explicit salt still yield different sucker addresses when the deployment topology differs.
- The live `RegistryPeerAuthBreak` PoC shows the same failure one layer higher: deploying through different registry addresses produces different clone addresses, and bridge authentication then rejects the real remote sucker as a non-peer.
- `localProjectId` is only supplied after the clone already exists, during `initialize(...)`, so project identity does not help stabilize the CREATE2 address.
- The local patch makes `peer` a required member of `JBSuckerDeployerConfig`, threads it through `JBSuckerRegistry.deploySuckersFor(...)` and `IJBSuckerDeployer.createForSender(...)`, and initializes each clone with the explicit remote peer. `bytes32(0)` still opts into the same-address deterministic default.
- The regression coverage now proves both sides of the envelope: default zero-peer deployments still fail when the topology differs, while the same divergent topology accepts bridge messages once each sucker is initialized with its counterpart's explicit address.

Impact:

- Cross-chain deployments are not determined solely by project config, explicit salt, and caller. They also require strict address symmetry across the registry / deployer / singleton stack.
- If one chain's topology drifts, default peer authentication hard-reverts legitimate bridge messages and the omnichain path is unusable until operators add explicit peer wiring or redeploy around the mismatch.
- This makes the default same-address peer assumption much more fragile than it appears from the user-facing deployment API.

Evidence:

- PoC: [nana-suckers-v6/test/audit/PeerTopologyAuthBreak.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/audit/PeerTopologyAuthBreak.t.sol:1)
- PoC: [nana-suckers-v6/test/audit/RegistryPeerAuthBreak.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/audit/RegistryPeerAuthBreak.t.sol:1)

Recommended fix:

- Review and merge the local explicit-peer patch in `nana-suckers-v6`.
- `deploy-all-v6` now consumes the patched sibling working-copy packages through `file:../...` dependencies and explicit remappings, which prevents npm from silently resolving published tarballs with stale ABI surfaces during the immutable deployment run.
- If the deployment workflow moves back to registry packages, publish fresh package versions for every locally patched repo first, then regenerate `deploy-all-v6/package-lock.json` from those new tarballs and rerun `forge build`.
- For deterministic same-address deployments, pass `peer: bytes32(0)` and verify the registry / deployer / singleton topology is identical across chains before enabling bridge traffic.
- For any topology that intentionally differs, precompute each counterpart address and pass the nonzero `peer` explicitly on both sides.

### 28. `nana-suckers-v6`: pool discovery can divert cross-chain batches from a live V3 TWAP pool into a hookless V4 spot pool on a one-wei liquidity edge

Severity: `MED`

Status: FIXED. Merged to main in `nana-suckers-v6/src/libraries/JBSwapPoolLib.sol`.

Affected code:

- [JBSwapPoolLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSwapPoolLib.sol:426)
- [JBSwapPoolLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSwapPoolLib.sol:449)
- [JBSwapPoolLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSwapPoolLib.sol:560)
- [JBSwapPoolLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSwapPoolLib.sol:606)
- [JBSwapCCIPSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSwapCCIPSucker.sol:582)
- [JBSwapCCIPSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSwapCCIPSucker.sol:639)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/RISKS.md:143)

Why it is real:

- `JBSwapCCIPSucker` intentionally owns the slippage floor itself because each swap sets the conversion rate for every claimer in the batch, not just the caller.
- `JBSwapPoolLib._discoverV4Pool(...)` probes hookless V4 pools first and then simply keeps whichever V4 or V3 pool has the highest current in-range liquidity.
- That ranking does not distinguish between a V3 pool with a built-in TWAP oracle and a hookless V4 pool whose quote falls back to the current spot tick.
- `_getV4Quote(...)` only uses a TWAP when the selected V4 pool has a working oracle hook. For hookless pools it explicitly falls back to `POOL_MANAGER.getSlot0(...)` spot pricing.
- The accepted risk in [RISKS.md](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/RISKS.md:143) is narrower: it accepts spot fallback when no TWAP-capable alternative exists. The live issue here is that a hookless V4 pool can outrank an already-live V3 TWAP pool on a trivial current-liquidity edge, so the safer oracle-backed route is skipped even though it exists.
- The local patch makes hookless V4 spot a last-resort route: it can be selected only when no TWAP-capable V3 or V4 route is available.

Impact:

- An attacker can JIT-fund or initialize a toxic hookless V4 pool with only slightly more in-range liquidity than the honest V3 pool and force outbound sends, inbound receives, and retry swaps through manipulable spot pricing.
- Because the selected swap output sets the batch-wide bridge conversion rate, this is not just per-user slippage. One manipulated batch can haircut every claimer whose leaf settles through that bridge amount.
- The dynamic slippage model still runs, but it runs on the manipulated spot baseline once the hookless V4 pool has won discovery.

Evidence:

- Regression: [nana-suckers-v6/test/audit/HooklessV4LiquidityOverride.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/audit/HooklessV4LiquidityOverride.t.sol:1)

Recommended fix:

- Review and merge the local route-quality patch.
- Keep hookless V4 spot fallback strictly behind TWAP-capable V3 and hooked V4 routes.

### 29. `nana-suckers-v6`: outbound snapshots trust `terminals[0]` as the aggregate treasury view, so a slot-zero forwarding terminal can zero later real surplus and balances

Severity: `MED`

Status: FIXED. Merged to main in `nana-suckers-v6/src/libraries/JBSuckerLib.sol`.

Affected code:

- [JBSuckerLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSuckerLib.sol:69)
- [JBSuckerLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSuckerLib.sol:79)
- [JBSuckerLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSuckerLib.sol:91)
- [JBDirectory.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBDirectory.sol:212)
- [JBDirectory.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBDirectory.sol:304)
- [JBRouterTerminalRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/src/JBRouterTerminalRegistry.sol:159)

Why it is real:

- `JBSuckerLib._buildETHAggregateInternal(...)` asks `directory.terminalsOf(projectId)` for the raw terminal list, then treats `terminals[0]` as the project-wide aggregate source for surplus.
- It next assumes that same `terminals[0]` is `JBMultiTerminal`-compatible and can provide a `STORE()` for price and balance reads. If that `STORE()` lookup fails, the function returns immediately with `(ethSurplus, 0)` before it ever inspects the later terminals in the list.
- That assumption is false for valid forwarding wrappers. `JBRouterTerminalRegistry` is a live example: it is a valid terminal entry, but its `currentSurplusOf(...)` is an explicit zero stub because it only forwards, and it does not expose `STORE()`.
- `JBDirectory.setTerminalsOf(...)` stores the project terminal list exactly as provided, and `terminalsOf(...)` returns that raw ordering. A project owner or controller can therefore put a forwarding layer first even while the real treasury terminal remains later in the list.
- The live PoC proves the failure mode: with a zero-surplus forwarding terminal in slot zero and a real later terminal mocked to hold `40 ETH` surplus and `70 ETH` balance, `toRemote(...)` still exports `sourceSurplus = 0` and `sourceBalance = 0`.

Impact:

- A project can send materially false outbound treasury snapshots even while later terminals hold real value.
- On revnets, remote `REVOwner` and `REVLoans` consumers price omnichain cash-outs and loans from this exported remote state, so slot-zero forwarding terminals can economically grief remote holders by forcing undercounted remote surplus and balances into the curve.
- The issue is distinct from stale-snapshot bugs: the bad state can be created immediately from terminal ordering alone and then propagated as the freshest snapshot.

Evidence:

- PoC: [nana-suckers-v6/test/audit/RegistryFirstTerminalSnapshotGap.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/audit/RegistryFirstTerminalSnapshotGap.t.sol:1)
- Regression: [nana-suckers-v6/test/unit/peer_chain_state.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/unit/peer_chain_state.t.sol:1) covers the normal outbound snapshot path after terminal scanning.

Recommended fix:

- Review and merge the local terminal-scanning snapshot patch.
- The patch aggregates surplus across the full terminal list and scans terminals for a usable `STORE()` / `PRICES()` source instead of early-returning on the first wrapper that lacks one.
- If forwarding wrappers remain valid terminal entries, keep treating them as non-aggregate views rather than as the canonical snapshot anchor.

### 30. `nana-suckers-v6`: even hooked V4 pools can outrank live V3 TWAP pools and then silently fall back to spot when the oracle hook reverts or lacks history

Severity: `MED`

Status: FIXED. Merged to main in `nana-suckers-v6/src/libraries/JBSwapPoolLib.sol`.

Affected code:

- [JBSwapPoolLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSwapPoolLib.sol:426)
- [JBSwapPoolLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSwapPoolLib.sol:449)
- [JBSwapPoolLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSwapPoolLib.sol:588)
- [JBSwapPoolLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSwapPoolLib.sol:606)
- [JBSwapCCIPSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSwapCCIPSucker.sol:582)

Why it is real:

- V4 pool discovery does not distinguish between a pool that merely has a hook address and a pool whose hook can actually serve a safe TWAP. `_discoverV4Pool(...)` only ranks current liquidity and can therefore select a hooked V4 pool over a live V3 TWAP pool on a trivial liquidity edge.
- `_getV4Quote(...)` then treats hook TWAP as best-effort. If `observe(...)` reverts because the hook is broken, misconfigured, or simply too new to have the required history, the error is swallowed and the code falls straight back to `poolManager.getSlot0(...)` spot pricing.
- The live PoC proves the exact route: a hooked V4 pool with only `1 wei` more liquidity than the honest V3 pool wins discovery, its hook deliberately reverts on `observe(...)`, and the batch quote still gets derived from the toxic current spot tick.
- This is distinct from the hookless-V4 finding. Even if you require a nonzero hook address before V4 can outrank V3, the current code still allows the winning hooked pool to degrade to spot silently.
- The local patch preflights hooked V4 `observe(...)` during discovery, skips broken hooked V4 pools, and requires hooked V4 quoting to use the hook TWAP instead of silently degrading to spot.

Impact:

- A project or attacker can bootstrap or temporarily break a V4 oracle hook, keep the hooked pool slightly ahead of V3 on current liquidity, and still force outbound sends, inbound receives, and retry swaps onto spot pricing.
- Because the selected swap output becomes the batch-wide conversion rate, a single toxic spot fallback can haircut every claimer in that batch instead of only the caller who triggered the swap.
- The most obvious window is immediately after pool creation, before a 120-second hook TWAP is reliably available, but the issue also applies to any hook outage or revert condition.

Evidence:

- Regression: [nana-suckers-v6/test/audit/HookedV4SpotFallbackOverride.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/audit/HookedV4SpotFallbackOverride.t.sol:1)

Recommended fix:

- Review and merge the local route-quality patch.
- Keep broken or too-fresh hooked V4 pools ineligible for TWAP-priority selection, and do not let them fall back to spot once selected as hooked routes.

### 31. `nana-suckers-v6`: a fresh high-liquidity V3 pool can outrank a live fallback route and hard-revert the whole swap on missing TWAP history

Severity: `MED`

Status: FIXED. Merged to main in `nana-suckers-v6/src/libraries/JBSwapPoolLib.sol`.

Affected code:

- [JBSwapPoolLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSwapPoolLib.sol:323)
- [JBSwapPoolLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSwapPoolLib.sol:361)
- [JBSwapPoolLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSwapPoolLib.sol:530)
- [JBSwapPoolLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSwapPoolLib.sol:540)
- [JBSwapCCIPSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSwapCCIPSucker.sol:582)

Why it is real:

- `_discoverPool(...)` and `_discoverV3Pool(...)` rank V3 candidates purely by current in-range liquidity across fee tiers. They do not check whether the winning V3 pool has enough oracle history to support `_getV3TwapQuote(...)`.
- `_getV3TwapQuote(...)` later enforces a hard minimum history window of 120 seconds by calling `OracleLibrary.getOldestObservationSecondsAgo(...)` and reverting with `JBSwapPoolLib_InsufficientTwapHistory()` when the selected pool is too new.
- The live PoC proves the route-level consequence: a freshly created V3 pool with only `1 wei` more liquidity than a live V4 route wins discovery, then hard-reverts the swap before the library ever considers the fallback pool. Once that tiny liquidity edge is removed, the same call succeeds through V4 immediately.
- This is distinct from the spot-fallback findings. Here the problem is not pricing off a bad route; it is skipping a live route entirely and reverting because discovery committed to an unquotable V3 pool first.
- The local patch disqualifies V3 pools that cannot serve the full default TWAP window before liquidity ranking can select them.

Impact:

- An attacker can bootstrap or temporarily JIT-fund a fresh V3 pool on any supported fee tier and block outbound swaps, inbound receive swaps, and `retrySwap(...)` executions for that pair during the oracle warm-up window.
- On outbound sends this hard-reverts the bridge path. On inbound receives the CCIP message is accepted, but the batch gets pinned behind `pendingSwapOf` until the stale winner either ages into a usable TWAP or loses its liquidity edge.
- Because the batch conversion rate is shared across all claimers, this is a cross-batch liveness problem rather than a single caller eating their own failed swap.

Evidence:

- Regression: [nana-suckers-v6/test/audit/FreshV3LiquidityOverrideDoS.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/audit/FreshV3LiquidityOverrideDoS.t.sol:1)

Recommended fix:

- Review and merge the local V3 TWAP-readiness patch.
- Keep unquotable fresh V3 pools out of discovery so live fallbacks remain reachable.

### 32. `nana-suckers-v6`: a fresh V3 pool that barely clears the minimum history threshold can still override a healthy route with an attacker-defined TWAP

Severity: `MED`

Status: FIXED. Merged to main in `nana-suckers-v6/src/libraries/JBSwapPoolLib.sol`.

Affected code:

- [JBSwapPoolLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSwapPoolLib.sol:323)
- [JBSwapPoolLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSwapPoolLib.sol:361)
- [JBSwapPoolLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSwapPoolLib.sol:536)
- [JBSwapPoolLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSwapPoolLib.sol:543)
- [JBSwapCCIPSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSwapCCIPSucker.sol:582)

Why it is real:

- Once a V3 pool has at least 120 seconds of history, `_getV3TwapQuote(...)` accepts it even if the pool is only 120 seconds old. When the pool is younger than the default 10-minute window, the code simply clamps the TWAP window down to the pool's entire lifetime.
- `_discoverPool(...)` and `_discoverV3Pool(...)` still rank candidates purely by current liquidity first, so a newly created V3 pool with slightly more liquidity than an older honest route wins discovery before any quality check is applied to its price history.
- That means the selected V3 pool can supply a fully attacker-defined "TWAP" for its whole short lifetime. The live PoC shows a freshly created V3 pool with exactly the minimum history and a toxic initial price winning discovery over a near-par V4 route, after which the batch swap settles at the toxic V3 price instead of the healthy fallback route.
- This is distinct from finding 31. There the fresh pool hard-reverts before a fallback route is tried. Here the fresh pool is considered valid and actively sets the batch-wide conversion rate, even though its entire oracle history was attacker-controlled from pool birth.

Impact:

- An attacker can create or JIT-fund a new V3 pool on a supported fee tier, initialize it at a toxic price, wait until it barely satisfies the 120-second minimum, and then force outbound sends, inbound receive swaps, and `retrySwap(...)` calls to use that short-lived attacker-defined TWAP.
- Because the chosen swap output becomes the batch-wide bridge conversion rate, the attack can haircut every claimer in the batch rather than only the trigger caller.
- This bypasses the protocol's apparent preference for V3 "oracle-backed" routes. The chosen route is technically TWAP-backed, but the TWAP window is so short and fresh that it offers no meaningful protection when a healthier older route already exists.
- The local patch requires V3 candidates to serve the full default 10-minute TWAP window instead of clamping to the pool's shorter lifetime.

Evidence:

- Regression: [nana-suckers-v6/test/audit/FreshV3TwapOverride.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/audit/FreshV3TwapOverride.t.sol:1)

Recommended fix:

- Review and merge the local full-window V3 TWAP patch.
- Do not restore short-window clamping unless route scoring explicitly treats fresh V3 pools as lower quality than established alternatives.

### 33. `nana-suckers-v6`: destination-side peer-value conversion also trusts `terminals[0]`, so a forwarding wrapper can zero already-correct remote state

Severity: `LOW`

Status: FIXED. Merged to main in `nana-suckers-v6/src/libraries/JBSuckerLib.sol`.

Affected code:

- [JBSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol:674)
- [JBSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol:687)
- [JBSuckerLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSuckerLib.sol:161)
- [JBSuckerLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSuckerLib.sol:182)
- [JBSuckerLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSuckerLib.sol:188)
- [JBSuckerRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSuckerRegistry.sol:201)
- [JBSuckerRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSuckerRegistry.sol:275)

Why it is real:

- `peerChainBalanceOf(...)` and `peerChainSurplusOf(...)` both delegate to `JBSuckerLib.convertPeerValue(...)` when the stored remote snapshot currency differs from the local target currency.
- `convertPeerValue(...)` looks up `directory.terminalsOf(projectId)` and only tries `IJBMultiTerminal(address(terminals[0])).STORE()` for prices. If that first terminal cannot provide a store or price oracle, the function silently returns zero instead of trying any later real terminal.
- The live PoC shows the exact failure mode: a correct `10 ETH` remote snapshot converts to zero when a slot-zero forwarding wrapper reverts on `STORE()`, then converts back to the full value immediately once a real multi-terminal is moved into slot zero.
- This is distinct from finding 29. There the outbound source snapshot itself is wrong. Here the stored remote snapshot is already correct, but the destination chain zeroes it at read time during currency conversion.

Impact:

- A project owner or controller can suppress already-correct remote surplus and balance views on the destination chain simply by placing a forwarding wrapper first in the local terminal list.
- `JBSuckerRegistry.remoteSurplusOf(...)` consumes these peer-chain conversion views, and `REVOwner` / `REVLoans` consume `remoteSurplusOf(...)` directly. That means cross-chain revnet cash-out and borrow curves can be depressed on the destination chain even while the peer snapshot itself remains correct.
- I did not find a direct theft path from this undercount alone, so this is an economic-grief and accounting-quality issue rather than a drain.

Evidence:

- PoC: [nana-suckers-v6/test/audit/FirstTerminalRemoteConversionGap.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/audit/FirstTerminalRemoteConversionGap.t.sol:1)
- Regression: [nana-suckers-v6/test/audit/FirstTerminalRemoteConversionGap.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/audit/FirstTerminalRemoteConversionGap.t.sol:1) now asserts the later live store is used even when the forwarding wrapper is first.

Recommended fix:

- Review and merge the local terminal-scanning conversion patch.
- `convertPeerValue(...)` now scans for the first terminal that can actually provide `STORE()` / `PRICES()` instead of letting a slot-zero forwarding wrapper zero remote state conversion by position alone.

### 34. `univ4-router-v6` + `nana-buyback-hook-v6`: V4 routing ignores metadata-only buyback previews and can reject executable JB buy paths

Severity: `MED`

Status: FIXED. Merged to main in `univ4-router-v6/src/JBUniswapV4Hook.sol`.

Affected code:

- [JBUniswapV4Hook.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/src/JBUniswapV4Hook.sol:708)
- [JBUniswapV4Hook.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/src/JBUniswapV4Hook.sol:717)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:895)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:903)

Why it is real:

- `JBBuybackHook.beforePayRecordedWith(...)` can return `weight = 0` and expose the real expected beneficiary output only through pay-hook metadata (`minimumBeneficiaryTokenCount` / `minimumReservedTokenCount`), because the live output may come from the AMM path rather than from direct minting.
- `JBRouterTerminal` already handles this preview shape and normalizes it in [JBPayRouteResolver.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/src/JBPayRouteResolver.sol:245).
- `JBUniswapV4Hook._beforeSwap(...)` does not. It reads only the raw `beneficiaryTokenCount` from `previewPayFor(...)` and ignores `hookSpecifications`. When the raw count is zero, the JB buy path becomes ineligible even if the hook metadata promises a much larger live output.
- The live PoC shows the route consequence. A metadata-only preview promising `5000e18` project tokens is ignored, so the hook falls back to the V4 pool and gives the user only the AMM output. Tightening `amountOutMin` to `1000e18` then makes the same swap revert, even though a direct JB pay would have satisfied that floor.
- The local patch normalizes metadata-only pay-hook previews that use the buyback hook metadata shape and scores `minimumBeneficiaryTokenCount` as the executable JB buy output.

Impact:

- Users swapping into buyback-hooked project tokens through `JBUniswapV4Hook` can receive materially worse execution than the live JB path would provide.
- Orders can also revert unnecessarily when the requested minimum is above the V4 output but below the real buyback-hook-backed JB output.
- For immutable deployments that expect this hook to provide best execution into canonical buyback-hooked projects, this is a real routing-correctness gap rather than a cosmetic preview mismatch.

Evidence:

- Regression: [univ4-router-v6/test/audit/BuybackMetadataPreviewIgnored.t.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/test/audit/BuybackMetadataPreviewIgnored.t.sol:1)

Recommended fix:

- Review and merge the local metadata-only buyback pay-preview patch.
- Keep the realized-output check from finding 2 in place so a terminal that overstates metadata cannot underfill user minima.

### 35. `nana-router-terminal-v6` + `nana-buyback-hook-v6`: best-route scoring uses optimistic raw buyback sell quotes and can choose a worse live candidate

Severity: `LOW`

Status: FIXED. Merged to main in `nana-router-terminal-v6/src/JBRouterTerminal.sol`.

Affected code:

- [JBRouterTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/src/JBRouterTerminal.sol:785)
- [JBRouterTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/src/JBRouterTerminal.sol:806)
- [JBRouterTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/src/JBRouterTerminal.sol:2616)
- [JBRouterTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/src/JBRouterTerminal.sol:2625)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:777)

Why it is real:

- Buyback sell-side preview metadata carries both a conservative executable floor (`minimumSwapAmountOut`) and an optimistic `rawSwapQuote`.
- `JBRouterTerminal._effectivePreviewCashOutAmount(...)` explicitly prefers `rawSwapQuote` whenever it is nonzero.
- Execution does not receive that optimistic amount. `_cashOutLoop(...)` measures the real post-hook balance delta returned by `cashOutTokensOf(...)`, which can be materially lower than the raw quote because of slippage buffers or taxed output delivery.
- The live PoC sets up two simultaneously valid destination-token routes. The native route previews and settles at `60`, while the token-B route previews at `75` only because of the optimistic raw buyback quote but actually settles at `40`. The router chooses token B, settles `40`, and does worse than a forced native route that was live the whole time.
- The local patch treats `rawSwapQuote` as diagnostic only and scores sell-side buyback hook metadata by `minimumSwapAmountOut`, the executable floor the hook enforces.

Impact:

- Best-route selection across accepted destination tokens can be wrong whenever a buyback-hook sell-side preview overstates executable delivery.
- Users paying with JB project tokens through `JBRouterTerminal` can receive fewer destination project tokens than another currently available route would have produced, even without any attack on the destination terminal.
- If downstream minimums are calibrated off the optimistic preview path, the same bug can also turn into unnecessary route failure instead of just underdelivery.

Evidence:

- Regression: [nana-router-terminal-v6/test/audit/RawBuybackQuoteRouteMisrank.t.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/test/audit/RawBuybackQuoteRouteMisrank.t.sol:1)

Recommended fix:

- Review and merge the local buyback sell-side executable-floor scoring patch.
- If the optimistic raw quote is still useful for UX, keep it informational and separate from route selection.
- Keep `routeTokenOut` override as an escape hatch, but do not rely on users to manually work around an incorrect default best-route scorer.

### 36. `univ4-router-v6` + `nana-buyback-hook-v6`: V4 routing ignores metadata-only buyback cash-out previews and can reject executable JB sell paths

Severity: `MED`

Status: FIXED. Merged to main in `univ4-router-v6/src/JBUniswapV4Hook.sol`.

Affected code:

- [JBUniswapV4Hook.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/src/JBUniswapV4Hook.sol:217)
- [JBUniswapV4Hook.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/src/JBUniswapV4Hook.sol:241)
- [JBUniswapV4Hook.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/src/JBUniswapV4Hook.sol:739)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:759)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:777)

Why it is real:

- `JBUniswapV4Hook.calculateExpectedOutputFromSelling(...)` trusts only the raw `grossReclaim` returned by `previewCashOutFrom(...)`.
- `JBBuybackHook.beforeCashOutRecordedWith(...)` can instead express the meaningful sell-side output through cash-out-hook metadata while returning `reclaimAmount = 0`, because the live payout is coming from the AMM path instead of the terminal's direct reclaim amount.
- `JBUniswapV4Hook` does not normalize that metadata before ranking the JB sell route. When the raw reclaim amount is zero, the hook collapses the JB sell path to `0` and lets V4 win by default.
- The live PoC shows the full consequence. A metadata-only preview carrying `2 ether` of executable sell-side output is ignored, so the hook falls back to the V4 pool and settles for less. Tightening `amountOutMin` to `1.5 ether` then makes the same swap revert, even though a direct JB cash-out would have satisfied that floor.
- The local patch normalizes metadata-only cash-out hook previews that use the buyback hook metadata shape and scores `minimumSwapAmountOut` as the executable JB sell output.

Impact:

- Users selling buyback-hooked project tokens through `JBUniswapV4Hook` can receive materially worse execution than the live JB sell path would provide.
- Orders can also revert unnecessarily when the requested minimum is above the V4 output but below the real buyback-hook-backed JB cash-out output.
- This is the sell-side analogue of finding 34, and it matters for the same reason: an immutable best-execution router should not silently disregard the live output surface of the protocols it is comparing.

Evidence:

- Regression: [univ4-router-v6/test/audit/BuybackCashOutMetadataIgnored.t.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/test/audit/BuybackCashOutMetadataIgnored.t.sol:1)

Recommended fix:

- Review and merge the local metadata-only buyback cash-out preview patch.
- Keep enforcing realized output after `cashOutTokensOf(...)` so metadata remains a route-scoring hint, not a substitute for actual delivery.

### 37. `nana-router-terminal-v6` + `nana-buyback-hook-v6`: best-route scoring uses conservative buyback buy minima and can choose a worse live candidate

Severity: `LOW`

Status: FIXED. Merged to main in `nana-router-terminal-v6/src/JBPayRouteResolver.sol`.

Affected code:

- [JBPayRouteResolver.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/src/JBPayRouteResolver.sol:246)
- [JBPayRouteResolver.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/src/JBPayRouteResolver.sol:355)
- [JBPayRouteResolver.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/src/JBPayRouteResolver.sol:378)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:894)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:911)

Why it is real:

- Buyback buy-side preview metadata carries both a conservative route floor (`minimumBeneficiaryTokenCount` / `minimumReservedTokenCount`) and the higher live AMM quote (`rawSwapQuote`).
- Before the local patch, `JBPayRouteResolver._effectivePreviewPayTokenCounts(...)` only normalized the conservative minimum token counts. It ignored the higher live output implied by the raw quote, even though execution could still mint materially more than that minimum.
- The live PoC sets up two simultaneously valid destination-token routes. The native route previews and settles at `60`. The token-B route previews at only `50` because the router scores the conservative buyback minimum, but the same live pay path actually mints `100`. The router chooses the native route and gives the user `60`, while a forced token-B route in the same setup returns `100`.
- The local patch decodes the canonical buyback-hook raw swap quote, adds any direct-mint amount, scales the beneficiary/reserved split to the stronger expected live output, and still preserves the conservative floor for metadata that lacks a stronger raw quote.

Impact:

- Best-route selection across accepted destination tokens can underrank a live buyback-hooked candidate and send users to a worse route.
- Users paying with JB project tokens through `JBRouterTerminal` can receive fewer destination project tokens than another currently executable route would have produced, even without any failure in the destination terminal.
- This is the buy-side counterpart to finding 35. There the router overvalued a sell-side route using optimistic raw output; here it undervalues a buy-side route by scoring only the conservative minimum.

Evidence:

- Regression: [nana-router-terminal-v6/test/audit/ConservativeBuybackPreviewRouteMisrank.t.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/test/audit/ConservativeBuybackPreviewRouteMisrank.t.sol:136)

Recommended fix:

- Review and merge the local `JBPayRouteResolver` buy-side raw-buyback-quote scoring patch.
- Keep the route-ranking policy explicit: conservative floors remain settlement guarantees, while best-route comparison should use the understood live quote when the canonical buyback hook supplies it.

### 38. `nana-router-terminal-v6` + `nana-buyback-hook-v6`: source-project buyback sell fallback can strand source tokens on the router and forward zero value

Severity: `MED`

Status: FIXED. Merged to main in `nana-router-terminal-v6/src/JBRouterTerminal.sol`.

Affected code:

- [JBRouterTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/src/JBRouterTerminal.sol:1209)
- [JBRouterTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/src/JBRouterTerminal.sol:1218)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:250)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:253)

Why it is real:

- `JBRouterTerminal._cashOutLoop(...)` cashes out source project tokens with `holder: address(this)` and `beneficiary: address(this)`, then treats the reclaim token's post-call balance delta as the routed amount.
- On buyback-hook sell fallback, `JBBuybackHook.afterCashOutRecordedWith(...)` remints the project tokens back to `context.holder` and returns without transferring the reclaim token.
- When the holder is the router itself, the source project tokens come back to the router, the reclaim-token delta stays `0`, and the router continues the route as though a zero-output cash-out succeeded.
- The local patch makes any nonzero source cash-out that delivers zero reclaim tokens fail closed before forwarding value downstream.

Impact:

- A routed `pay(...)` can settle zero value into the chosen destination terminal while the sold source project tokens remain stranded on `JBRouterTerminal`.
- The router does not keep per-user recovery accounting for those returned source project tokens, so the affected value is effectively stuck unless a manual rescue path exists.
- Metadata `cashOutMinReclaimed` only protects callers who explicitly set it. Programmatic routes that use `0` can silently hit this failure mode.

Evidence:

- Regression: [nana-router-terminal-v6/test/audit/BuybackSellFallbackStrandsSourceTokens.t.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/test/audit/BuybackSellFallbackStrandsSourceTokens.t.sol:1)

Recommended fix:

- Review and merge the local zero-delivery source cash-out guard.
- At minimum, after a source-project cash-out, reject the case where reclaim-token output is zero but the router's source-project-token balance did not decrease as expected.
- If fallback delivery of source project tokens is meant to be supported, route them back to the original payer rather than leaving them on the router.

### 39. `nana-router-terminal-v6`: source-project cashout previews use gross reclaim before terminal fees and can pick a worse live candidate

Severity: `LOW`

Status: FIXED. Merged to main in `nana-router-terminal-v6/src/JBRouterTerminal.sol`.

Affected code:

- [JBRouterTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/src/JBRouterTerminal.sol:2523)
- [JBRouterTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/src/JBRouterTerminal.sol:2617)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:883)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:1178)

Why it is real:

- `JBRouterTerminal._previewCashOutStep(...)` ranks source-project cashout candidates using `previewCashOutFrom(...)`'s `reclaimAmount`.
- In core, that preview is a gross reclaim amount before the terminal's own protocol fee is subtracted during `cashOutTokensOf(...)`.
- The live PoC sets up two valid source-cashout candidates. The native route previews at `100` but only transfers `97` after the terminal haircut. The token-B route previews at `99` and transfers `99`. The router chooses the native route on preview and mints `97`, while a forced token-B route in the same setup mints `99`.
- The local patch detects Juicebox fee terminals through `FEE()` / `FEELESS_ADDRESSES()` and scores source cash-out previews on the fee-adjusted amount that the router would receive as beneficiary.

Impact:

- Best-route preview and execution can choose a worse live destination-token route whenever competing source-project cashout candidates have different preview-to-delivery haircuts.
- Users paying with JB project tokens can mint fewer destination project tokens than another simultaneously executable route would have produced.

Evidence:

- Regression: [nana-router-terminal-v6/test/audit/GrossCashOutPreviewRouteMisrank.t.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/test/audit/GrossCashOutPreviewRouteMisrank.t.sol:1)

Recommended fix:

- Review and merge the local fee-aware cash-out preview scoring patch.
- If the router is intentionally ranking gross reclaim rather than delivered reclaim, document that clearly and do not present the result as best executable routing.

### 40. `univ4-router-v6` + `nana-buyback-hook-v6`: sell-side buyback fallback can settle zero output and strand sold project tokens on the hook

Severity: `MED`

Status: FIXED. Merged to main in `univ4-router-v6/src/JBUniswapV4Hook.sol`.

Affected code:

- [JBUniswapV4Hook.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/src/JBUniswapV4Hook.sol:1111)
- [JBUniswapV4Hook.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/src/JBUniswapV4Hook.sol:1125)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:250)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:253)

Why it is real:

- `JBUniswapV4Hook._routeThroughJuicebox(...)` sells JB tokens by cashing out with `holder: address(this)` and `beneficiary: address(this)`, then measures output only as the reclaim-token balance delta.
- On buyback-hook sell fallback, the hook remints the sold project tokens back to `context.holder` and does not transfer the reclaim token.
- When the holder is `JBUniswapV4Hook` itself, the input project tokens remain on the hook, `outputReceived` becomes `0`, and the swap can still succeed when `amountOutMin == 0`.
- The local patch makes nonzero JB sell routes that deliver zero reclaim output fail closed before settling back to the PoolManager.

Impact:

- A JB-routed sell can consume the user's input project tokens, return zero output tokens, and leave the sold project tokens stranded on `JBUniswapV4Hook`.
- This is especially dangerous for programmatic or router-driven orders that pass `amountOutMin = 0`, because the failure mode does not revert by default.

Evidence:

- Regression: [univ4-router-v6/test/audit/BuybackSellFallbackStrandsProjectTokens.t.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/test/audit/BuybackSellFallbackStrandsProjectTokens.t.sol:1)

Recommended fix:

- Review and merge the local zero-delivery JB sell guard.
- At minimum, after a JB sell path, reject cases where reclaim-token output is zero but the hook's input project-token balance rebounded to its pre-cash-out level.
- If fallback delivery of project tokens is meant to be supported, route those tokens back to the swap initiator rather than leaving them on the hook.

### 41. `univ4-router-v6`: sell quotes hard-deduct terminal fees even when the live hook beneficiary can be feeless, so better JB cash-outs can be bypassed

Severity: `LOW`

Status: FIXED. Merged to main in `univ4-router-v6/src/JBUniswapV4Hook.sol`.

Affected code:

- [JBUniswapV4Hook.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/src/JBUniswapV4Hook.sol:217)
- [JBUniswapV4Hook.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/src/JBUniswapV4Hook.sol:246)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:883)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:1178)

Why it is real:

- `JBUniswapV4Hook.calculateExpectedOutputFromSelling(...)` always subtracts `terminal.FEE()` from the previewed reclaim amount.
- The live sell beneficiary is the hook itself. A terminal can configure that address as feeless, in which case execution skips the fee while the route quote still deducts it.
- The live PoC sets the terminal's actual cash-out slightly above the V4 quote and relies on the hook's unconditional fee deduction to push the JB estimate just below V4. The router falls back to V4 even though the live JB sell path would have returned more.
- The local patch probes `FEELESS_ADDRESSES().isFeeless(address(this))` and skips the preview haircut when the hook is fee-exempt as the cash-out beneficiary.

Impact:

- Best-route selection can bypass a better live JB sell path and send the trade through a worse V4 swap.
- This is configuration-sensitive rather than universal, but it matters if projects or protocol operators ever mark the routing hook as feeless.

Evidence:

- Regression: [univ4-router-v6/test/audit/FeelessSellQuoteUnderranksJB.t.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/test/audit/FeelessSellQuoteUnderranksJB.t.sol:1)

Recommended fix:

- Review and merge the local feeless-beneficiary sell-quote patch.
- Otherwise, explicitly enforce or document that the routing hook must never be configured as feeless.

### 42. `univ4-lp-split-hook-v6`: fee routing can over-credit impossible fee-token claims when the fee project token is delivered lossily

Severity: `LOW`

Status: FIXED. Merged to main in `univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol`.

Affected code:

- [JBUniswapV4LPSplitHook.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol:1986)
- [JBUniswapV4LPSplitHook.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol:1992)
- [JBUniswapV4LPSplitHook.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol:2040)
- [JBUniswapV4LPSplitHook.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol:813)

Why it is real:

- Before the local patch, `_routeFeesToProject(...)` reconciled fee claims from `terminal.pay(...)` using the returned `beneficiaryTokenCount`, then wrote that count into both `_totalOutstandingFeeTokenClaims` and `claimableFeeTokens[projectId]`.
- It did not re-measure the actual fee-project-token balance the hook received.
- The regression swaps in a fee project terminal that returns `amount` but transfers a fee-on-transfer fee token to the hook. The patched hook credits only the balance actually received.

Impact:

- `claimableFeeTokens[projectId]` can exceed the hook's real fee-token balance.
- Later `claimFeeTokensFor(...)` calls revert because the hook attempts to transfer more fee tokens than it actually owns, leaving the impossible claim stuck in storage.
- Because `_totalOutstandingFeeTokenClaims` is also overstated, any logic that treats those claims as reserved balance inherits the same impossible accounting.

Evidence:

- Regression: [univ4-lp-split-hook-v6/test/audit/FeeClaimTokenFOTAccounting.t.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/test/audit/FeeClaimTokenFOTAccounting.t.sol:1)

Recommended fix:

- Review and merge the local actual-receipt accounting patch.
- If non-standard fee-project tokens are out of scope, explicitly enforce that the fee project token and fee terminal must deliver standard exact-balance semantics before allowing fee routing.

### 43. `univ4-lp-split-hook-v6`: non-primary terminal balances can select an unusable terminal token and block deployment

Severity: `MED`

Status: FIXED. Merged to main in `univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol`.

Affected code:

- [JBUniswapV4LPSplitHook.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol:331)
- [JBUniswapV4LPSplitHook.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol:376)
- [JBUniswapV4LPSplitHook.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol:899)
- [JBUniswapV4LPSplitHook.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol:1093)

Why it is real:

- Before the local patch, `_findHighestValueTerminalTokenOf(...)` scored candidate terminal tokens by scanning every terminal returned by `terminalsOf(projectId)` and reading raw balances from each terminal's store.
- `deployPool(...)` then treats the winning token as if its funds are reachable through `primaryTerminalOf(projectId, token)`, and the later cash-out path uses only that primary terminal.
- Those two notions are not equivalent. A secondary terminal can hold the largest balance for token `A` even when the primary terminal for token `A` has zero reachable balance.
- The regression sets exactly that shape: a non-primary terminal reports the largest balance for `terminalToken`, but the primary terminal for `terminalToken` has none. The patched selector ignores the non-primary balance and picks the actually reachable token.

Impact:

- Projects with multiple terminals can have deployment blocked even though a usable primary-terminal path exists for another accepted token.
- Because the hook only supports one terminal token per project, the selection bug affects the only deployment attempt that matters: the project cannot launch its LP position until the misleading non-primary balance disappears or the terminal topology is cleaned up.
- This is especially sharp once deployment becomes permissionless after weight decay, because anyone can trigger the bad selection as soon as the stale or secondary balance is present.

Evidence:

- Regression: [univ4-lp-split-hook-v6/test/audit/NonPrimaryBalanceSelectionDoS.t.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/test/audit/NonPrimaryBalanceSelectionDoS.t.sol:1)

Recommended fix:

- Review and merge the local primary-terminal auto-selection patch.
- Keep the deployment docs clear that only primary-terminal balances are considered for automatic LP-pair selection.

### 44. `nana-router-terminal-v6`: projects can irreversibly lock the registry itself as their terminal and brick routing

Severity: `LOW`

Status: FIXED. Merged to main in `nana-router-terminal-v6/src/JBRouterTerminalRegistry.sol`.

Affected code:

- [JBRouterTerminalRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/src/JBRouterTerminalRegistry.sol:366)
- [JBRouterTerminalRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/src/JBRouterTerminalRegistry.sol:381)
- [JBRouterTerminalRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/src/JBRouterTerminalRegistry.sol:452)

Why it is real:

- `lockTerminalFor(...)` snapshots whatever terminal currently resolves for the project, but it does not validate that the locked target is non-circular.
- If the registry owner ever sets `defaultTerminal = address(this)`, a project owner can call `lockTerminalFor(projectId, registry)` and permanently pin the registry itself as the project's terminal.
- The first routed `pay(...)` or `addToBalanceOf(...)` then hits `_enforceNoCircularForward(...)` and reverts with `CircularForward`, but the project can no longer recover because `hasLockedTerminal[projectId]` blocks later `setTerminalFor(...)` updates.

Impact:

- A single bad lock can permanently brick routed payments for that project until the registry is replaced at a higher layer.
- This is a configuration / operator footgun rather than a permissionless theft path, but the lock is irreversible and the live failure only appears after the project is already committed.

Evidence:

- Regression: [nana-router-terminal-v6/test/audit/RegistrySelfLockDoS.t.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/test/audit/RegistrySelfLockDoS.t.sol:1)

Recommended fix:

- Review and merge the local circular-lock guard.
- Keep validating the resolved terminal inside `lockTerminalFor(...)` with the same circular-forwarding checks that runtime routing relies on.

### 45. `croptop-core-v6` + `nana-suckers-v6`: Croptop's documented "launch now, add suckers later" path is broken

Severity: `MED`

Status: FIXED. Merged to main in `croptop-core-v6/src/CTDeployer.sol` and `nana-suckers-v6/src/JBSucker.sol`.

Affected code:

- [CTDeployer.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/src/CTDeployer.sol:100)
- [CTDeployer.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/src/CTDeployer.sol:225)
- [CTDeployer.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/src/CTDeployer.sol:268)
- [JBSuckerRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSuckerRegistry.sol:480)
- [JBSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol:1022)

Why it is real:

- `CTDeployer`'s launch path explicitly says sucker deployment is fail-open and that unsupported chains can be fixed later with manual sucker setup.
- Before the local patch, [CTDeployer.deployProjectFor(...)](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/src/CTDeployer.sol:229) called `SUCKER_REGISTRY.deploySuckersFor(...)` directly, so any registry or deployer failure bubbled up and reverted the whole launch.
- The supposed later recovery path was also broken by permissions. [JBSuckerRegistry.deploySuckersFor(...)](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSuckerRegistry.sol:487) requires its caller to have `DEPLOY_SUCKERS` from the current project owner, then immediately calls `sucker.mapTokens(...)`, which only worked if the registry itself also had `MAP_SUCKER_TOKEN` for that owner.
- `CTDeployer` only grants `MAP_SUCKER_TOKEN` to the registry from `CTDeployer`'s own account during construction. That is enough while `CTDeployer` temporarily owns a freshly launched project, but it does not help after the project NFT has been transferred to the real owner.
- The local patch makes initial Croptop sucker deployment fail open, lets the registry map tokens during an authorized sucker deployment, and makes the CTDeployer wrapper fail early with an explicit missing-delegation error unless the owner has granted the wrapper `DEPLOY_SUCKERS`.

Impact:

- A configured sucker deployment failure bricks Croptop project launch instead of degrading cleanly.
- Projects launched without suckers do not have a working later-setup path through the provided `CTDeployer` / registry surfaces.
- On an immutable rollout, that means unsupported-chain or temporary sucker-deployer failures require manual permission surgery or redeployment, contrary to the documented operating model.

Evidence:

- Regression: [croptop-core-v6/test/audit/CodexNemesisFreshRound.t.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/test/audit/CodexNemesisFreshRound.t.sol:319)
- Regression: [croptop-core-v6/test/audit/CodexNemesisSuckerWrapper.t.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/test/audit/CodexNemesisSuckerWrapper.t.sol:124)

Recommended fix:

- Review and merge the local Croptop fail-open launch patch and Sucker registry-mapping patch together.
- Keep post-launch docs explicit: owners can call the registry directly after granting `DEPLOY_SUCKERS`, while CTDeployer's wrapper also requires the owner to delegate `DEPLOY_SUCKERS` to the wrapper.

### 46. `nana-721-hook-v6`: existing-project ruleset helper reverts unless the helper contract itself is separately permissioned

Severity: `LOW`

Status: FIXED. Merged to main in `nana-721-hook-v6/src/JB721TiersHookProjectDeployer.sol`.

Affected code:

- [IJB721TiersHookProjectDeployer.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/interfaces/IJB721TiersHookProjectDeployer.sol:41)
- [JB721TiersHookProjectDeployer.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721TiersHookProjectDeployer.sol:115)
- [JB721TiersHookProjectDeployer.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721TiersHookProjectDeployer.sol:164)
- [JBController.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBController.sol:426)
- [JBController.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBController.sol:586)

Why it is real:

- `JB721TiersHookProjectDeployer.launchRulesetsFor(...)` and `queueRulesetsOf(...)` locally verify that the external caller is the project owner or has the expected project permissions.
- After those checks pass, both helper functions forward into `JBController` from the helper contract itself.
- `JBController.launchRulesetsFor(...)` and `queueRulesetsOf(...)` then re-check permissions against their own `_msgSender()`, which is now the helper contract rather than the original owner/operator.
- The result is a misleading public API: owner/operator permissions alone are not enough. The helper contract itself must also be separately permissioned on the target project for these existing-project flows to succeed.

Impact:

- Existing projects trying to attach a new 721 hook or queue hook-backed rulesets through this helper can fail after passing all local authorization checks.
- Integrators may believe they have delegated the right permissions to an operator, but still need extra out-of-band controller permissions for the helper contract itself.
- Transactions revert atomically, so this is an operational failure rather than a partial-state bug, but it breaks the advertised helper workflow.

Evidence:

- Regression: [nana-721-hook-v6/test/audit/ProjectDeployerAuth.t.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/test/audit/ProjectDeployerAuth.t.sol:1)

Recommended fix:

- Review and merge the local downstream-permission preflight.
- Alternatively, narrow the documented operating model and require explicit permissioning of the helper contract before using these existing-project helper flows.

### 47. `nana-core-v6`: nonzero protocol-fee dust can be split to bypass fees

Severity: `LOW`

Status: FIXED. Merged to main in `nana-core-v6/src/libraries/JBFees.sol`.

Affected code:

- [JBFees.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/libraries/JBFees.sol:18)
- [JBFees.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/libraries/JBFees.sol:32)

Why it is real:

- `JBFees.feeAmountFrom(...)` floors `amountBeforeFee * feePercent / MAX_FEE`.
- For any nonzero payout smaller than the fee denominator threshold, the computed fee can round down to 0 even when the project has a nonzero protocol fee.
- A payer can split a larger payout into many feeable micro-payouts, each below the fee threshold, causing the protocol to collect no fee on value that would have produced a fee if paid out as one amount.
- `feeAmountResultingIn(...)` has the same dust-shape issue for reverse fee calculations.

Impact:

- Protocol fees can be bypassed on feeable dust by splitting payout execution into many tiny amounts.
- The per-transfer impact is bounded to dust, but the strategy is repeatable and should not be preserved before immutable deployment.

Evidence:

- Regression: [TestFees.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/test/TestFees.sol:183)
- Fuzz invariant update: [TestFeesFuzz.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/test/units/static/JBFees/TestFeesFuzz.sol:51)

Recommended fix:

- Review and merge the local `JBFees` patch that returns a 1-unit fee whenever both the amount and fee percent are nonzero but the computed fee would otherwise be 0.
- Keep zero-amount and zero-fee behavior unchanged.

## No-Action / Accepted Items

These were reviewed and intentionally dropped.

### Trust-boundary items

- `revnet-core-v6`: borrowability trusting all registered terminals.
  Dropped because projects are allowed to bring their own terminals and inherit that risk.

- `nana-router-terminal-v6`: forwarding terminals bypassing exact receipt enforcement.
  Dropped as an accepted owner-chosen forwarding trust boundary.

### Explicitly accepted economic / liveness tradeoffs

- `deploy-all-v6` + revnets: canonical revnets intentionally follow admin-controlled router / buyback registry defaults.
  Dropped because this shared-default behavior is part of the accepted deployment model, not a bug to remove.

- `nana-core-v6`: migration-fee fail-open / stranded-value accounting oddities.
  Dropped because liveness is preferred and this behavior is accepted.

- `nana-core-v6`: fee-free surplus persistence across rulesets.
  Dropped as documented behavior, not a bug requiring action.

- `nana-core-v6`: migration resetting payout-limit / surplus-allowance usage.
  Dropped as documented accepted risk.

- `nana-core-v6`: data hooks controlling cash-out pricing.
  Dropped as an intentional trust boundary.

- `nana-721-hook-v6`: pay credits underfunding split obligations.
  Dropped because this is already documented and the intended mitigation is tier configuration.

- `univ4-lp-split-hook-v6`: LP math using raw cash-out and raw issuance rates instead of hook-adjusted execution previews.
  Dropped because the hook should intentionally read raw rates only.

### Not part of the real deploy path

- `nana-core-v6`: `DeployPeriphery.s.sol` bootstrap/controller artifact ordering.
  Dropped because production deploys go through `deploy-all-v6`, which deploys `JBController` directly in Phase 05.

### Fixed

- `univ4-router-v6` + `univ4-lp-split-hook-v6`: shared hooks no longer leave terminal pull approvals alive after external terminal calls.
  Local patch: both hooks now revert if a directory-selected terminal or fee terminal returns without fully consuming the temporary ERC-20 allowance; the prior PoCs have been converted into regressions for the new fail-closed behavior.

- `univ4-router-v6`: JB-routed swaps now enforce realized `amountOutMin` locally.
  Local patch: `_routeThroughJuicebox(...)` reverts when the measured output balance delta is below `amountOutMin`, so callers are no longer relying on every directory-selected terminal to enforce slippage correctly.

- `univ4-lp-split-hook-v6`: overreported cash-out returns can no longer consume other projects' reserved fee-token claims.
  Local patch: `_addUniswapLiquidity(...)` now sizes terminal-token liquidity from the measured free-balance delta after cash-out, net of balances reserved for fee-token claims, and the prior shared-clone capture PoC has been converted into a regression.

- `nana-buyback-hook-v6`: protocol-derived AMM route minima no longer auto-select lossy / unknown ERC-20 output routes.
  Local patch: metadata-less ERC-20 sell-output routing stays on the direct cash-out path unless the caller supplies an explicit minimum, and metadata-less buy-output routing only derives an AMM quote for standard `JBTokens` ERC-20 clones. Custom project-token outputs require explicit quote metadata.

- `univ4-lp-split-hook-v6`: fee-token claims now track the fee-project tokens the hook actually receives.
  Local patch: `_routeFeesToProject(...)` snapshots and reconciles the fee-project ERC-20 balance around `terminal.pay(...)`, including the case where the terminal token is also the fee-project token, so fee-on-transfer delivery cannot over-credit `claimableFeeTokens`.

- `univ4-lp-split-hook-v6`: automatic deployment token selection now ignores non-primary terminal balances.
  Local patch: `_findHighestValueTerminalTokenOf(...)` only scores balances held by the resolved primary terminal for each candidate token, matching the terminal used later by deployment and cash-out.

- `nana-suckers-v6`: stale deprecated same-chain sucker snapshots no longer dominate active peer-chain accounting.
  Local patch: `JBSuckerRegistry` aggregate views now prefer active sucker values for each peer chain and fall back to deprecated values only when no active sucker answers; the stale-max PoCs have been converted into regressions.

- `nana-suckers-v6`: failed `toRemoteFee` payments no longer remain addable or permanently stranded.
  Local patch: `JBSucker` now records failed fee payments as refundable credits for the original caller, excludes the retained ETH from native `amountToAddToBalanceOf(...)`, and exposes `claimRetainedToRemoteFee(...)`; the irrecoverable-fee PoC has been converted into a regression.

- `defifa`: one-tier games with disabled scorecard timeout can no longer launch into a permanently unratifiable configuration.
  Local patch: `DefifaDeployer.launchGameWith(...)` now rejects single-tier launches when `scorecardTimeout == 0`, and the one-tier lock PoCs have been converted into regressions for the launch-time guard.

- `defifa`: fee-token cash-out claims now follow the cash-out beneficiary.
  Local patch: `DefifaHook.afterCashOutRecordedWith(...)` passes `context.beneficiary` into the fee-token claim path so terminal-token reclaim, `$DEFIFA`, and `$NANA` settle to the same destination.

- `defifa`: `tokensClaimableFor(...)` no longer overquotes while reserve mints are pending.
  Local patch: the preview now uses `_totalMintCost + _pendingReserveMintCost()`, matching the complete-phase execution denominator.

- `nana-project-handles-v6`: verified handles now reject dangerous Unicode formatting controls before storage.
  Local patch: `setEnsNamePartsFor(...)` rejects common bidi and invisible format-control code points in addition to dots, ASCII control bytes, and DEL, and the spoof PoC has been converted into a regression.

- `nana-router-terminal-v6`: irreversible terminal locks can no longer pin routes that forward back into the registry.
  Local patch: the registry rejects itself as a default or project terminal and validates forwarding terminals before writing `hasLockedTerminal`, so circular targets fail before the lock becomes permanent.

- `nana-router-terminal-v6`: buy-side best-route scoring now uses canonical buyback-hook raw swap quotes when present.
  Local patch: `JBPayRouteResolver` decodes buyback pay-hook metadata, scores the conservative floor plus any direct mint, and compares the stronger live raw quote when supplied so buyback-hooked routes are ranked against ordinary terminal previews on the same expected-output basis.

- `nana-721-hook-v6`: existing-project ruleset helper flows now fail explicitly before side effects when the helper lacks downstream controller permissions.
  Local patch: `JB721TiersHookProjectDeployer` preflights its own `LAUNCH_RULESETS` / `SET_TERMINALS` / `QUEUE_RULESETS` permissions before deploying hooks and forwarding into `JBController`, so callers get a clear helper-specific error instead of a post-deployment controller revert.

- `nana-721-hook-v6` + `nana-distributor-v6`: 721 round rewards now use token-specific snapshot ownership instead of current-owner voting power alone.
  Local patch: `JB721Checkpoints` records token mint blocks plus owner changes after mint and exposes `ownerOfAt(...)`; `JB721Distributor` now looks up the checkpointed snapshot owner before scoring stake and consuming owner vote budgets, so late-minted replacement NFTs cannot steal rewards from transferred snapshot tokens.

- `croptop-core-v6`: prior project owners no longer retain direct CTDeployer-owned hook-management permissions after a project NFT transfer.
  Local patch: `CTDeployer.deployProjectFor(...)` no longer grants `ADJUST_721_TIERS`, `SET_721_METADATA`, `MINT_721`, or `SET_721_DISCOUNT_PERCENT` from `CTDeployer` to the initial owner; owners who want direct hook control must claim project-based hook ownership so authority follows the current project NFT owner.

- `croptop-core-v6` + `nana-suckers-v6`: Croptop launches no longer hard-fail on initial sucker rollout, and post-launch registry recovery can map sucker tokens through the authorized registry path.
  Local patch: `CTDeployer.deployProjectFor(...)` emits `CTDeployer_SuckerDeploymentFailed` and keeps the project launch / ownership transfer moving when initial sucker deployment fails, `CTDeployer.deploySuckersFor(...)` now preflights the wrapper's delegated `DEPLOY_SUCKERS` permission explicitly, and `JBSucker` accepts registry-initiated token mapping after the registry has enforced `DEPLOY_SUCKERS`.

- `nana-fee-project-deployer-v6` + `deploy-all-v6`: configured project `1` no longer gets accepted as NANA based only on a nonzero controller.
  Local patch: the standalone fee deployer and deploy-all deploy/resume scripts now require configured project `1` to be owned by the REV deployer, controlled by the canonical controller, have a nonzero revnet configuration hash, and expose the `NANA` token symbol before skipping NANA deployment.

- `revnet-core-v6`: revnet sucker deployment salts no longer depend on the external split-operator / relayer caller.
  Local patch: `REVDeployer._deploySuckersFor(...)` now derives the registry salt from the encoded revnet configuration hash and the project-provided sucker salt only, so caller changes do not break default peer symmetry when the registry/deployer topology is otherwise identical.

- `revnet-core-v6`: revnet configuration hashes now commit to the authority, routing, and policy fields that affect cross-chain equivalence.
  Local patch: `_makeRulesetConfigurations(...)` now includes the split operator, extra metadata, reserved split count, and each reserved split's routing fields before hashing the encoded configuration.

- `deploy-all-v6`: resume no longer accepts controller-configured canonical project IDs from public project numbering alone.
  Local patch: `script/Resume.s.sol` now only accepts already-configured projects `1-4` when they match the expected `REVDeployer` owner, canonical controller, nonzero revnet configuration hash, expected project-token symbol, and Banny 721 hook identity for project `4`.

- `deploy-all-v6`: post-deploy verification now matches canonical route and project-owner topology.
  Local patch: `script/Verify.s.sol` checks project `1-4` ownership by `REVDeployer`, checks project token symbols and revnet configuration hashes, checks the Banny 721 hook, and verifies that project terminal lists include `JBRouterTerminalRegistry` instead of the raw `JBRouterTerminal`.

- `deploy-all-v6`: post-deploy verification no longer treats full-product production components as optional.
  Local patch: `script/Verify.s.sol` now requires address-registry, Defifa, project handles, both distributors, and the project-payer deployer on production chains, then checks Defifa constructor wiring, token / governor wiring, distributor timing, project-handle forwarder parity, and project-payer implementation presence.

- `nana-buyback-hook-v6`: sell-side routing compared AMM swap quote against gross bonding-curve reclaim instead of net (post-fee) reclaim.
  Fixed in [PR #114](https://github.com/Bananapus/nana-buyback-hook-v6/pull/114). The hook now deducts the terminal's 2.5% fee before comparing, closing the window where the terminal path would pay less than the AMM.

### Stale, fixed, or not compelling enough

- `nana-router-terminal-v6`: multi-hop forwarding-cycle findings.
  Dropped because current code and current tests already reject the 2-hop circular cases that were flagged.

- `nana-router-terminal-v6`: zero-route preview / `address(0)` execution path.
  Dropped because current resolver paths already revert `JBRouterTerminal_NoRouteFound(...)`.

- `nana-721-hook-v6`: bitmap cache depth-boundary issue.
  Dropped as gas-only, not security.

- `nana-721-hook-v6`: `hookMetadata` encode/decode asymmetry.
  Dropped as benign.

- `revnet-core-v6`: fee-on-transfer loan-origination DoS.
  Dropped as too conditional and not important enough to carry.

- `univ4-lp-split-hook-v6`: shared-clone cross-project burn hypothesis.
  Dropped as too conditional to elevate without stronger evidence.

## Optional Cleanup Items

These are the only items I would still consider worth touching, and even these are not security blockers.

### 1. `nana-721-hook-v6`: make unsupported ERC-20 split-tier configs fail explicitly

Current state:

- Split-bearing ERC-20 paths are brittle in [JB721TiersHookLib.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/libraries/JB721TiersHookLib.sol).
- Today they may revert incidentally because of exact-receipt checks, token behavior, or hook-recipient transfer behavior.

Why this is optional:

- If the intended policy is simply “unsupported config, revert,” then the current behavior is already directionally correct.
- The value in changing it is clarity, not security.

Suggested cleanup:

- Add explicit custom errors for unsupported ERC-20 split-tier configurations.
- Reject ERC-20 split-hook recipients or other unsupported recipient modes up front, rather than relying on incidental transfer failure.

### 2. `nana-721-hook-v6`: future-tier metadata writes could be tightened

Current state:

- Metadata for a future tier can be written before the tier exists, and later inherited if the tier does not overwrite it.

Why this is optional:

- This is an admin / metadata-operator footgun, not a meaningful exploit, assuming metadata operators are trusted.

Suggested cleanup:

- Require the tier to already exist before accepting `encodedIPFSUri` writes.

### 3. `nana-router-terminal-v6`: native refund edge case could fail soft instead of hard

Current state:

- A native partial-fill refund can revert if the refund recipient cannot accept ETH.

Why this is optional:

- This is an integration edge case, not a core solvency or authorization problem.

Suggested cleanup:

- Try ETH refund first.
- If it fails, re-wrap and refund WETH instead of reverting the full payment.

### 4. `univ4-lp-split-hook-v6`: deploy script idempotency should match the other repos

Current state:

- The local deploy script’s `_isDeployed` logic can false-negative an existing deployment when the active deployment path is not the hardcoded `0x4e59` path.

Why this is optional:

- This is a deployment-tooling issue, not a runtime protocol bug.
- It still seems worth aligning with the rest of the repos.

Suggested cleanup:

- Make the deploy-script idempotency check use the same state source / deployment convention as the other repos.

## Real Deployment Path Note

The earlier `nana-core-v6` controller-bootstrap script issue is not relevant to production deployment because `deploy-all-v6` is the canonical deploy path:

- Phase list: [DEPLOY.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/DEPLOY.md:22)
- Phase 05 includes controller deployment: [DEPLOY.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/DEPLOY.md:35)
- Actual controller deployment: [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:1551)

## Tests / Evidence Used During Triage

The following targeted checks were run while triaging:

- Note: fork-test RPC configuration has been migrated to Dwellir endpoints. Re-run Defifa's full suite including [Fork.t.sol](/Users/jango/Documents/jb/v6/evm/defifa/test/Fork.t.sol:1) with the Dwellir `RPC_ETHEREUM_MAINNET` value before final deployment.
- Note: fork-test RPC configuration has been migrated to Dwellir endpoints. Re-run Revnet's fork-named tests, including `test/TestSplitWeightFork.t.sol`, with the Dwellir `RPC_ETHEREUM_MAINNET` value before final deployment.

- `forge test --match-path 'test/audit/FreshAudit.t.sol' --match-test 'test_payCredits_can_underfund_split_bearing_tier_mints' -vv`
- `forge test --match-path 'test/audit/FutureTierPoC.t.sol' -vv`
- `forge test --match-path 'test/audit/ProjectDeployerAuth.t.sol' -vv`
- `forge test --match-path 'test/audit/RegistryForwardingLossyToken.t.sol' -vv`
- `forge test --match-path 'test/audit/MultiHopForwardCycle.t.sol' -vv`
- `forge test --match-path 'test/audit/CashOutCircularPrimaryTerminal.t.sol' -vv`
- `forge test --match-path 'test/audit/PhantomSurplusTerminal.t.sol' -vv`
- `forge test --match-path 'test/audit/DeployScriptEdgeCases.t.sol' -vv`
- `forge test --match-path 'test/audit/FreshAuditVerification.t.sol' -vv`
- `forge test --match-path 'test/audit/CodexMigrationFeeFailure.t.sol' -vv`
- `forge test --match-path test/audit/PersistentAllowanceSteal.t.sol --skip JBUniswapV4HookFork` in `univ4-router-v6`
- `forge test --match-path test/audit/PersistentAllowanceSteal.t.sol` in `univ4-lp-split-hook-v6`
- `forge test --match-path test/audit/JBRouteMinOutputBypass.t.sol --skip JBUniswapV4HookFork`
- `forge test --match-path test/audit/FeeClaimReserveCapture.t.sol` in `univ4-lp-split-hook-v6`
- `forge test --match-path test/audit/DerivedMinBuySideFOTDoS.t.sol`
- `forge test --match-path test/audit/DerivedMinSellSideFOTDoS.t.sol`
- `forge test --match-path 'test/audit/*FOT*.t.sol'` in `nana-buyback-hook-v6`
- `forge test --match-path test/TestBuybackFOT.t.sol` in `nana-buyback-hook-v6`
- `forge test --match-path test/V4BuybackHook.t.sol` in `nana-buyback-hook-v6`
- `forge test --match-path test/TestSellSideNetComparison.t.sol` in `nana-buyback-hook-v6`
- `forge test --match-path test/TestAuditGaps.sol --match-test test_non18Decimal_sellSideRoutesWithUSDC6` in `nana-buyback-hook-v6`
- `forge test --no-match-path 'test/fork/*'` in `nana-buyback-hook-v6`
- `forge build` in `nana-buyback-hook-v6`
- `forge fmt --check src/JBBuybackHook.sol test/audit/DerivedMinBuySideFOTDoS.t.sol test/audit/DerivedMinSellSideFOTDoS.t.sol test/audit/SellSideFOTOutputDoS.t.sol test/TestAuditGaps.sol` in `nana-buyback-hook-v6`
- `forge test --match-path test/audit/RegistryStaleDeprecatedMaxSurplus.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/audit/RegistryStaleMaxAggregation.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/audit/RemoteLoanAccountingGap.t.sol`
- `forge test --match-path 'test/audit/HiddenSupply*.t.sol'` in `revnet-core-v6`
- `forge test --match-path test/TestHiddenTokens.t.sol` in `revnet-core-v6`
- `forge test --match-path test/TestAuditFixVerification.t.sol --match-test 'test_A14_hiddenTokensStayInCashOutDenominator|test_A14_hidingTokens_reducesLiveSupply|test_A14_hideTokensOf_revertsForUnauthorized'` in `revnet-core-v6`
- `forge test --match-path test/audit/LocalLoanStateOmissionCashout.t.sol` in `revnet-core-v6`
- `forge test --match-path test/TestCashOutCallerValidation.t.sol` in `revnet-core-v6`
- `forge test --match-path test/TestCrossCurrencyReclaim.t.sol` in `revnet-core-v6`
- `forge build` in `revnet-core-v6`
- `forge test --match-path test/audit/SameTimestampSnapshotPinned.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/audit/PeerSnapshotDesync.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/SuckerCrossChainAdversarial.t.sol --match-test 'test_supplySnapshot_updatesWithLatestNonce|test_supplySnapshot_skipsStaleSnapshotNonce'` in `nana-suckers-v6`
- `forge test --match-path test/InteropCompat.t.sol --match-test 'test_messageRoot_encoding|test_messageRoot_versionConstant|test_messageRoot_amountFitsU128'` in `nana-suckers-v6`
- `forge test --match-path test/unit/ccip_native_interop.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/unit/peer_chain_state.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/audit/HooklessV4LiquidityOverride.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/audit/HookedV4SpotFallbackOverride.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/audit/FreshV3LiquidityOverrideDoS.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/audit/FreshV3TwapOverride.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/unit/pool_discovery.t.sol` in `nana-suckers-v6`
- `forge test --fail-fast --no-match-contract '.*Fork.*' --no-match-path 'test/audit/*'` in `nana-suckers-v6`
- `forge build` in `nana-suckers-v6`
- `forge test --match-path test/audit/FeeLocking.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/unit/ccip_refund.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/audit/BuybackMetadataPreviewIgnored.t.sol --match-test 'test_metadataOnlyPreview|test_directJBPay' --skip JBUniswapV4HookFork` in `univ4-router-v6`
- `forge test --match-path test/audit/BuybackCashOutMetadataIgnored.t.sol --match-test 'test_metadataOnlySellPreview|test_directJBCashOut' --skip JBUniswapV4HookFork` in `univ4-router-v6`
- `forge test --match-path test/audit/JBRouteMinOutputBypass.t.sol --skip JBUniswapV4HookFork` in `univ4-router-v6`
- `forge test --fail-fast --no-match-contract '.*Fork.*' --no-match-path 'test/audit/*'` in `revnet-core-v6`
- `forge build --force` in `deploy-all-v6`
- `forge test --match-path test/audit/SuckerCallerDeterminism.t.sol` in `revnet-core-v6`
- `forge fmt --check src/REVDeployer.sol test/audit/SuckerCallerDeterminism.t.sol` in `revnet-core-v6`
- `forge build` in `revnet-core-v6`
- `forge test --match-path test/audit/WeakConfigurationHash.t.sol` in `revnet-core-v6`
- `forge test --match-path test/TestTerminalEncodingInHash.t.sol` in `revnet-core-v6`
- `forge fmt --check src/REVDeployer.sol test/audit/WeakConfigurationHash.t.sol test/TestTerminalEncodingInHash.t.sol` in `revnet-core-v6`
- `forge test --match-path test/audit/ToRemoteFeeIrrecoverable.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/audit/CodexNemesisBeneficiaryMismatch.t.sol` in `defifa`
- `forge test --match-path test/audit/Pass12Fixes.t.sol` in `defifa`
- `forge test --match-path test/audit/SingleTierTimeoutLock.t.sol` in `defifa`
- `forge test --match-path test/audit/OneTierZeroTimeoutLock.t.sol` in `defifa`
- `forge test --match-path test/DefifaGovernor.t.sol --match-test testReceiveVotingPower` in `defifa`
- `forge test --fail-fast` in `defifa`
- `forge test --fail-fast --no-match-path test/Fork.t.sol` in `defifa`
- `forge test --match-path test/audit/CodexNemesisPoCs.t.sol --match-test test_oldProjectOwnerDoesNotRetainHookControlAfterProjectNftTransfer` in `croptop-core-v6`
- `forge test --match-path test/audit/DeployerPermissionBypass.t.sol` in `croptop-core-v6`
- `forge test --match-path test/CTDeployer.t.sol` in `croptop-core-v6`
- `forge test --match-path test/ClaimCollectionOwnership.t.sol` in `croptop-core-v6`
- `forge fmt --check src/CTDeployer.sol src/interfaces/ICTDeployer.sol test/audit/CodexNemesisPoCs.t.sol test/audit/DeployerPermissionBypass.t.sol` in `croptop-core-v6`
- `forge test --match-path test/audit/CodexNemesisProjectOneSquat.t.sol`
- `forge fmt --check script/Deploy.s.sol` in `nana-fee-project-deployer-v6`
- `forge build` in `nana-fee-project-deployer-v6`
- `forge fmt --check script/Deploy.s.sol script/Resume.s.sol` in `deploy-all-v6`
- `forge build --force` in `deploy-all-v6`
- `forge build` in `deploy-all-v6`
- `forge test --match-path test/audit/CodexNemesisFreshVerification.t.sol --match-test 'test_721LateMintedTokenCannotClaimRoundSnapshotRewardsFromOwnersPastVotes|test_721LateMintedReplacementCannotStealTransferredSnapshotTokensRoundRewards'` in `nana-distributor-v6`
- `forge test --match-path test/audit/CodexNemesisFreshRoundVerification.t.sol --match-test test_postSnapshot721TokenCannotClaimUsingOwnersEarlierVotes` in `nana-distributor-v6`
- `forge test --match-path test/JB721Distributor.t.sol` in `nana-distributor-v6`
- `forge test --match-path test/audit/PostSnapshotMintTheft.t.sol` in `nana-distributor-v6`
- `forge test --match-path test/audit/CodexNemesisAccountingPoC.t.sol` in `nana-distributor-v6`
- `forge test --match-path test/invariant/JB721DistributorInvariant.t.sol` in `nana-distributor-v6`
- `forge build` in `nana-distributor-v6`
- `forge fmt --check src/JB721Distributor.sol test/JB721Distributor.t.sol test/audit/CodexNemesisFreshVerification.t.sol test/audit/CodexNemesisFreshRoundVerification.t.sol test/audit/PostSnapshotMintTheft.t.sol test/audit/H26VotingPowerCap.t.sol test/audit/CodexNemesisAccountingPoC.t.sol test/invariant/JB721DistributorInvariant.t.sol` in `nana-distributor-v6`
- `forge test --match-path test/unit/getters_constructor_Unit.t.sol --match-test test_ownerOfAt_shouldReturnHistoricalOwners` in `nana-721-hook-v6`
- `forge fmt --check src/JB721TiersHook.sol src/interfaces/IJB721TiersHook.sol test/unit/getters_constructor_Unit.t.sol` in `nana-721-hook-v6`
- `forge test --match-path test/audit/JBProjectHandlesUnicodeSpoof.t.sol`
- `forge test --fail-fast` in `nana-project-handles-v6`
- `forge test --match-path test/audit/RegistryDefaultRetargetsExistingProjects.t.sol`
- `forge test --match-path test/audit/RegistryDefaultHookHijack.t.sol`
- `forge test --match-path test/audit/ResumeCroptopProjectTwoSquat.t.sol`
- `forge test --match-path test/audit/ResumeBannyProjectFourSquat.t.sol`
- `forge test --match-path test/audit/ResumeRevProjectThreeSquat.t.sol`
- `forge test --match-path test/audit/ProjectIdFrontRunDoS.t.sol` in `croptop-core-v6`
- `forge test --match-path test/audit/ProjectIdFrontRunDoS.t.sol` in `nana-721-hook-v6`
- `forge test --match-path test/audit/ProjectIdFrontRunDoS.t.sol` in `revnet-core-v6`
- `forge test --match-path test/audit/ProjectIdFrontRunDoS.t.sol` in `nana-omnichain-deployers-v6`
- `forge test --match-contract TestQAGameIdPredictionRace` in `defifa`
- `forge test --match-path test/audit/RemoteLoanStateOmission.t.sol`
- `forge test --match-path test/audit/SameTimestampSnapshotPinned.t.sol`
- `forge test --match-path test/audit/LocalLoanStateOmissionCashout.t.sol`
- `forge test --match-path test/audit/FeeLocking.t.sol --match-test test_failedCcipRefund_staysLockedAfterLaterNativeClaim`
- `forge test --match-path test/audit/HooklessV4LiquidityOverride.t.sol`
- `forge test --match-path test/audit/RegistryFirstTerminalSnapshotGap.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/audit/HookedV4SpotFallbackOverride.t.sol`
- `forge test --match-path test/audit/FreshV3LiquidityOverrideDoS.t.sol`
- `forge test --match-path test/audit/FreshV3TwapOverride.t.sol`
- `forge test --match-path test/audit/FirstTerminalRemoteConversionGap.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/audit/BuybackMetadataPreviewIgnored.t.sol --skip JBUniswapV4HookFork`
- `forge test --match-path test/audit/RawBuybackQuoteRouteMisrank.t.sol --match-test test_rawBuybackQuoteCannotOutrankBetterExecutableRoute`
- `forge test --match-path test/audit/BuybackCashOutMetadataIgnored.t.sol --skip JBUniswapV4HookFork`
- `forge test --match-path test/audit/ConservativeBuybackPreviewRouteMisrank.t.sol --match-test 'test_rawBuybackQuoteCanRankBetterBuybackBuyRoute|test_previewPayFor_decodesBuybackPayHookMetadata|test_previewPayFor_prefersRouteWithHigherBuybackHookOutput'` in `nana-router-terminal-v6`
- `forge test --match-path test/audit/ConservativeBuybackPreviewRouteMisrank.t.sol`
- `forge fmt --check src/JBPayRouteResolver.sol test/audit/ConservativeBuybackPreviewRouteMisrank.t.sol` in `nana-router-terminal-v6`
- `forge test --match-path test/audit/BuybackSellFallbackStrandsSourceTokens.t.sol`
- `forge test --match-path test/audit/GrossCashOutPreviewRouteMisrank.t.sol --match-test test_feeAwareCashOutPreviewCannotOutrankBetterNetRoute`
- `forge test --match-path test/RouterTerminal.t.sol` in `nana-router-terminal-v6`
- `forge test --match-path test/audit/BuybackSellFallbackStrandsProjectTokens.t.sol --match-test test_sellFallbackLikeCashOutRevertsInsteadOfStrandingProjectTokensOnHook --skip JBUniswapV4HookFork`
- `forge test --match-path test/audit/FeelessSellQuoteUnderranksJB.t.sol --match-test test_feelessSellQuoteRoutesThroughBetterJBsellPath --skip JBUniswapV4HookFork`
- `forge test --match-path test/audit/FeeClaimTokenFOTAccounting.t.sol`
- `forge test --match-path test/audit/NonPrimaryBalanceSelectionDoS.t.sol`
- `forge build` in `univ4-lp-split-hook-v6`
- `forge fmt --check src/JBUniswapV4LPSplitHook.sol test/audit/FeeClaimTokenFOTAccounting.t.sol test/audit/NonPrimaryBalanceSelectionDoS.t.sol` in `univ4-lp-split-hook-v6`
- `forge test --match-path test/audit/RegistrySelfLockDoS.t.sol`
- `forge test --match-path test/RouterTerminalRegistry.t.sol` in `nana-router-terminal-v6`
- `forge test --match-path test/regression/LockTerminalRace.t.sol` in `nana-router-terminal-v6`
- `forge build` in `nana-router-terminal-v6`
- `forge test --match-path test/audit/CodexNemesisFreshRound.t.sol --match-test 'test_deployProjectFor_failsOpenWhenSuckerDeploymentFails|test_directRegistryDeploymentAfterOwnershipTransferCanMapThroughRegistry'`
- `forge test --match-path test/audit/CodexNemesisSuckerWrapper.t.sol`
- `forge fmt --check src/CTDeployer.sol test/audit/CodexNemesisFreshRound.t.sol test/audit/CodexNemesisSuckerWrapper.t.sol` in `croptop-core-v6`
- `forge build` in `croptop-core-v6`
- `forge fmt --check src/JBSucker.sol` in `nana-suckers-v6`
- `forge build` in `nana-suckers-v6`
- `forge test --match-path test/audit/PeerTopologyAuthBreak.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/audit/RegistryPeerAuthBreak.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/unit/deployer.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/unit/multi_chain_evolution.t.sol` in `nana-suckers-v6`
- `forge test --match-path 'test/audit/*'` in `nana-suckers-v6`
- `forge test --match-path 'test/unit/*'` in `nana-suckers-v6`
- `forge test --match-path test/audit/ProjectDeployerAuth.t.sol` in `nana-721-hook-v6`
- `forge test --match-path test/regression/ProjectDeployerRulesets.t.sol` in `nana-721-hook-v6`
- `forge build` in `nana-721-hook-v6`
- `forge test --match-path test/TestFees.sol` in `nana-core-v6`
- `forge test --match-path test/units/static/JBFees/TestFeesFuzz.sol` in `nana-core-v6`
- `forge test --match-path test/units/static/JBMultiTerminal/TestExecutePayout.sol` in `nana-core-v6`
- `forge build` in `nana-core-v6`
- `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` in `deploy-all-v6`
- `npm install --ignore-scripts --no-audit --no-fund` in `deploy-all-v6`
- `forge fmt --check script/Deploy.s.sol script/Resume.s.sol test/fork/DeployFullStack.t.sol test/fork/DeployResumeRehearsalFork.t.sol test/fork/ResumeDeployFork.t.sol test/fork/WildcardPermissionKillChain.t.sol test/fork/LPBuybackInteropFork.t.sol` in `deploy-all-v6`
- `forge build` in `deploy-all-v6` with the local file dependencies and explicit remappings

## Bottom Line

All 47 security findings have been remediated and merged. The codebase is ready for final deployment rehearsal.

Remaining optional non-security cleanup (not blocking deployment):

1. `nana-721-hook-v6`: explicit rejection for unsupported ERC-20 split-tier configs (currently handled via try-catch fallback),
2. `nana-721-hook-v6`: future-tier metadata existence check before accepting `encodedIPFSUri` writes,
3. `nana-router-terminal-v6`: native ETH refund fail-soft (wrap to WETH on failed refund instead of reverting) — deferred due to contract size constraints,
4. `univ4-lp-split-hook-v6`: deploy-script idempotency alignment — already matches the `nana-buyback-hook-v6` pattern with a documented Sphinx limitation comment.
