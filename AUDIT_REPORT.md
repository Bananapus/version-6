# Review Triage Report

## Scope

Review seed:

- Depth: deep dive
- Subsystems: all 19 EVM repos in `ARCHITECTURE.md`
- Personas: broad adversarial coverage across MEV, malicious project owner, rogue bridge operator, grief attacker, fee evader, flash loan attacker, permission escalator, oracle manipulator, decimals/currency/token arbitrageur, and ruthless thief
- User deployment constraint: pre-deploy breaking changes are allowed because nothing has been deployed yet
- Deployment focus: one-shot `deploy-all-v6` rollout with canonical projects `1`-`4`
- Coverage note: all 19 active EVM repos listed in `ARCHITECTURE.md`, plus the workspace `nana-project-payer-v6` repo with its own `RISKS.md`, were included in the review.
- Workspace reconciliation note: the untracked sibling `jb-directory` is a static IPFS interface / ABI-registry app, has no Solidity or Foundry review docs, and is not imported by `deploy-all-v6`. It is therefore not counted in the 19-repo EVM deployment scope, but should receive a separate product, UX, ABI-integrity, and supply-chain review before publication.

Inputs reviewed:

- `ARCHITECTURE.md`
- `RISKS.md`
- `REVIEW_GUIDE.md`
- `USER_JOURNEYS.md`
- `.audit-logs/regression-review-summary-20260429-143830.log`
- `.audit-logs/regression-regression-summary-20260429-143842.log`
- `.audit-logs/nana-721-hook-v6-review-20260429-143852.log`
- `.audit-logs/nana-router-terminal-v6-review-20260429-143852.log`
- `.audit-logs/revnet-core-v6-review-20260429-143852.log`
- `.audit-logs/univ4-lp-split-hook-v6-review-20260429-143852.log`
- `.audit-logs/nana-core-v6-review-20260429-143852.log`

Correlated edge cases and PoCs were checked against current code, current tests, every workspace repo `RISKS.md`, related repository documentation, and the real deployment path through `deploy-all-v6`.

## Final Triage

Bottom line under the current threat model:

- Thirty-eight confirmed open blockers remain across the current deploy plus the broader ecosystem: thirty-six block the immediate `deploy-all-v6` one-shot path, while Edge Cases S and AH block enabling swap-enabled CCIP suckers in a future or expanded rollout. Four previously listed blockers (D, E, AA, AF) have been closed as ACCEPTED per documented RISKS.md design decisions. The immediate deploy blockers are the Banny project-`4` deploy/resume skip still trusting generic controller presence, Banny resolver metadata initialization calling an operator-owned `onlyOwner` setter from the deployment authority, package resolution still pointing at stale npm tarballs instead of the audited sibling repos, Sphinx replaying deploy-all's Solidity CREATE2 deployments as ordinary CREATE actions on the real deployment path, the documented deploy/resume runbook being incompatible with the Sphinx-gated deploy function and Safe-as-sender resume requirement, the core terminal-store / terminal / controller idempotency checks predicting wrong CREATE2 addresses, `VERIFY_SAFE` being loaded but never used to assert Safe ownership/admin convergence, deploy verification not failing closed on immutable Chainlink feed / sequencer provenance, deploy verification also not authenticating immutable Uniswap / Permit2 / bridge / CCIP / Defifa typeface external addresses, the verifier not authenticating REV runtime singleton surfaces (`REVLoans`, `REVOwner`, and `REVHiddenTokens`), the verifier comparing Defifa's dedicated hook store against the shared 721 hook store so a correct full production deployment cannot pass verification, the verifier not authenticating the 721 base hook / checkpoint deployer / address-registry clone surface used by all future 721 hook clones, the verifier not authenticating the core ERC-20 implementation that `JBTokens` clones for all future project tokens, the permissionless Defifa launcher allowing caller-selected terminals to forge hook callbacks plus unsafe scorecard timing and live-balance participation checks, the verifier never authenticating the intended project `1-4` revnet economics, current stage effects, native primary-terminal routing, or BAN/Banny tier and resolver manifest, NANA/project-`1` silently missing the default buyback hook and pool because the default is set after project `1` already exists while CPN/REV/BAN pool initialization remains fail-open and unverified, the verifier requiring but not validating Croptop Phase 06 deployer / project-owner wiring while the publisher assumes ETH/18-decimal tier prices, sucker deployer allowlist verification being optional and subset-based even on production chains, the verifier never proving that projects `1-4` have the intended active sucker pairs, peers, native-token mappings, and default-peer same-address invariants, the expected feeless router terminal letting users route source-project cash-outs through a zero-tax destination project without paying source cash-out protocol/revnet fees while sell previews can over-rank fee-bearing zero-tax paths, distributor accounting letting arbitrary stale ERC-20 balance be assigned to an attacker-controlled hook and rounded vesting dust be marked claimed, the first-controller allowlist not being provable exact by the current verifier, `JBFeelessAddresses` not being provable free of unexpected fee-exempt entries, project NFT approvals not being checked for dangling spenders, immutable permissions / trusted-forwarder auth inputs not being authenticated, runtime permission grants / wildcard bypass operators not being verified, the 721 distributor checkpoint module still not proving that a token existed at the reward snapshot block, production verification not proving ProjectHandles can safely query the ENS registry on every deployed chain or reject `.eth.eth` handle ambiguity, production verification not authenticating the ProjectPayer implementation that developers/users will clone, Phase 11 distributor rounds being configured with block-count-like values even though the distributor measures rounds in seconds, `JBSuckerLib.convertPeerValue` multiplying by oracle price instead of dividing so cross-currency sucker conversions produce values off by the square of the price ratio, `REVDeployer._tryInitializeBuybackPoolFor` hardcoding `1e18` so non-18-decimal terminal tokens initialize pools at wildly incorrect prices, `CTPublisher.mintFrom` accepting `address(0)` as `feeBeneficiary` so the fee payment reverts and the catch block refunds the fee to the caller, `CTDeployer` never revoking deployer-scoped hook permissions when a project NFT is transferred so former owners retain tier/metadata control, `REVOwner.beforeCashOutRecordedWith` unconditionally adding remote surplus to cash-out calculations regardless of the `useTotalSurplus` flag, and `JBUniswapV4LPSplitHook._createAndInitializePool` accepting an existing pool's attacker-chosen `sqrtPriceX96` without bounds validation enabling DoS or price manipulation. The separate ecosystem blockers are that swap-enabled CCIP suckers can strand earlier nonce batches when CCIP delivers roots out of order and that swap-enabled native-token routes can revert before settlement when V4 is selected without first wrapping raw ETH to WETH; current `deploy-all-v6` Phase 03 deploys plain `JBCCIPSucker` instances, so these do not by themselves block the current projects `1-4` path unless swap-enabled suckers are included before deployment. See "Current Open Edge Case A" through "Current Open Edge Case AR" below.
- Seven items (D, E, AF, AA, 74, 66, 69) have been closed as ACCEPTED — all are explicitly documented and accepted in their respective RISKS.md files.
- Two items (S, AH) are deferred — swap-enabled CCIP suckers and native routes are not in the initial rollout.
- Two items (JD-1, JD-2) are out of EVM scope (frontend/jb-directory).
- One item (58) has been accepted/deferred by admin.
- Several earlier edge cases were dropped because they rely on deployment paths you do not use, behaviors you explicitly accept, or invariants you do not want this system to enforce.
- Thirteen optional non-security cleanup items remain below for future consideration.

## Confirmed Issues For Admin Notes

This is the deduped decision queue. Each row is corroborated in the detailed edge case with source references, test evidence, or both. "Default disposition" is the review recommendation before owner/admin acceptance notes.

Immediate `deploy-all-v6` blockers:

| ID | Confirmed issue | Default disposition |
| --- | --- | --- |
| A | Banny project `4` deploy/resume can skip over a non-canonical configured project. | Fix deploy/resume identity gates. |
| B | `deploy-all-v6` still compiles stale npm packages instead of the audited sibling repos. | Fix package/remapping provenance before rehearsal. |
| C | `VERIFY_SAFE` is loaded but Safe/admin ownership convergence is never asserted. | Add Safe ownership/admin checks. |
| D | ~~Revnet hidden tokens remain revealable while excluded from cash-out and loan denominators.~~ | ACCEPTED. Documented in `revnet-core-v6/RISKS.md` §4 as intended behavior. |
| E | ~~Revnet configuration hashes omit split-operator authority and reserved split routing.~~ | ACCEPTED. Documented in `revnet-core-v6/RISKS.md` §8 as intentional design. |
| F | Chainlink feed, threshold, and sequencer provenance is not fail-closed. | Add exact per-chain oracle manifest checks. |
| G | Uniswap, Permit2, bridge, CCIP, and Defifa typeface external addresses are not authenticated. | Add exact per-chain external-address manifest checks. |
| H | Defifa verification expects the wrong hook store and misses hook-origin directory wiring. | Fix verifier predicates. |
| I | Canonical projects `1-4` economics, native routing, current stage state, and BAN/Banny manifest are not authenticated. | Add exact canonical project manifest checks. |
| J | Croptop deployer/project-owner wiring is under-checked, and publisher fee logic assumes ETH/18-decimal tier prices. | Fix verifier and currency assumptions or narrow supported scope. |
| K | Sucker deployer allowlist checks are optional and subset-based on production chains. | Make expected allowlists mandatory/exact enough for rollout. |
| L | The verifier cannot prove `JBDirectory` has exactly one allowed first controller. | Add a deploy manifest proof or explicit acceptance of non-enumerability. |
| M | The verifier cannot prove `JBFeelessAddresses` has no unexpected fee-exempt entries. | Add a deploy manifest proof or explicit acceptance of non-enumerability. |
| N | Project NFT approvals are not checked for dangling spenders. | Add approval checks/clears before final acceptance. |
| O | Immutable permissions, directory, and trusted-forwarder auth inputs are not fully authenticated. | Add manifest checks for constructor auth surfaces. |
| P | Runtime permission grants and wildcard bypass operators are not verified. | Add runtime permission manifest checks. |
| Q | 721 distributor snapshots still do not prove token existence at the reward snapshot block. | Record/prove mint block or otherwise close late-mint reward eligibility. |
| R | ProjectHandles can revert on unavailable ENS registry and can verify visible `.eth` handles through `.eth.eth` nodes. | Soft-fail registry lookup and reject/normalize duplicate `eth` suffixes. |
| T | ProjectPayer deployer verification accepts arbitrary implementation code. | Authenticate the implementation and its directory/deployer wiring. |
| U | Distributor round durations are configured like block counts but measured in seconds. | Replace with intended wall-clock durations per chain. |
| V | Sphinx records Solidity `new {salt}` deployments as ordinary CREATE actions on the Safe replay path. | Rework deployment execution so CREATE2 semantics are preserved. |
| W | Documented deploy/resume commands do not match the Sphinx/Safe execution model. | Rewrite runbook and resume execution path. |
| X | Canonical buyback hooks/pools are not proven, and NANA/project `1` misses the default hook/pool. | Set/verify per-project hooks and pool keys. |
| Y | Projects `1-4` sucker pairs, peers, native-token mappings, and default-peer same-address assumptions are not verified. | Add exact cross-chain sucker manifest checks. |
| Z | Feeless router cash-outs can bypass source project protocol/revnet cash-out fees. | Fix fee policy/accounting or explicitly accept the bypass. |
| AA | ~~Split payout/cash-out fee accounting can over-credit fee project value versus retained terminal balance.~~ | ACCEPTED. Documented in `nana-core-v6/RISKS.md` §2; bounded by N wei for N splits. |
| AB | ~~REV resume retries project `3` approval after `REVDeployer` owns the project.~~ | FIXED. Approval moved inside `controllerOf` check. |
| AC | Banny resolver metadata initialization is called by the wrong owner. | Fix owner/call order before Banny launch. |
| AD | Defifa permissionless launchers can choose terminals and unsafe game-phase inputs. | Fix terminal trust/timing/live-balance gates or document accepted risk precisely. |
| AE | Distributor accounting can assign stale ERC-20 balances to an attacker-chosen hook and mark rounded dust claimed. | Fix prepaid-balance accounting and vesting dust handling. |
| AF | ~~ERC777-style ERC-20 intake can reenter and double-count balance deltas.~~ | ACCEPTED. Documented in `nana-core-v6/RISKS.md` §3 as accepted integration risk for ERC-777 tokens. |
| AG | ~~Buyback registry-scoped quote metadata is ignored by resolved hooks.~~ | FIXED. Registry remaps metadata to resolved hook address. |
| AI | The verifier does not authenticate the 721 base hook / checkpoint / store / address-registry clone surface. | Add base-hook and checkpoint-deployer manifest checks. |
| AJ | The verifier does not authenticate REV runtime singleton wiring. | Add `REVOwner`, `REVLoans`, and `REVHiddenTokens` manifest checks. |
| AK | The verifier does not authenticate the core `JBERC20` implementation cloned by `JBTokens`. | Add ERC-20 implementation manifest checks. |
| AL | Core idempotency checks predict wrong CREATE2 addresses for terminal store, terminal, and controller. | Fix constructor-arg order in `_isDeployed` checks. |
| AM | `JBSuckerLib.convertPeerValue` multiplies by oracle price instead of dividing — cross-chain balance/surplus values off by orders of magnitude for different-currency conversions. | Fix conversion formula to match core protocol pattern (`amount * 10^decimals / price`). |
| AN | `REVDeployer._tryInitializeBuybackPoolFor` hardcodes `1e18` divisor — 6-decimal tokens like USDC initialize pool price 1e12 off. | Use terminal token decimals instead of hardcoded 18. |
| AO | `CTPublisher.mintFrom` accepts caller-controlled `feeBeneficiary` of `address(0)`, causing fee payment to revert and catch block to refund fee to caller. | Validate `feeBeneficiary != address(0)` or use protocol-determined beneficiary. Strengthens J. |
| AP | `CTDeployer` grants hook permissions (`ADJUST_721_TIERS`, `SET_721_METADATA`, etc.) to the original project owner and never revokes them on project NFT transfer. | Revoke deployer-scoped permissions on ownership transfer or on `claimCollectionOwnershipOf`. |
| AQ | `REVOwner.beforeCashOutRecordedWith` unconditionally adds `remoteSurplusOf` and `remoteTotalSupplyOf` to cash-out calculations regardless of `useTotalSurplus` flag. | Condition remote surplus/supply addition on `useTotalSurplus` or document as accepted. |
| AR | `JBUniswapV4LPSplitHook._createAndInitializePool` accepts an existing pool's attacker-chosen `sqrtPriceX96` without bounds validation, enabling DoS or price manipulation at pool initialization. | Validate existing pool price is within tick bounds or reject pre-initialized pools. |

Future / expanded rollout blockers:

| ID | Confirmed issue | Default disposition |
| --- | --- | --- |
| S | ~~Swap-enabled CCIP suckers can strand earlier nonce batches delivered after a higher nonce.~~ | DEFERRED. Swap-enabled suckers not in initial rollout. |
| AH | ~~Swap-enabled native-token V4 routes revert before settlement when the sucker holds raw ETH.~~ | DEFERRED. Swap-enabled native routes not in initial rollout. |

Deduping decisions:

- Historical edge cases 48 and 59 are consolidated into Current Open Edge Case AE.
- Historical edge cases 52, 61, and 62 are consolidated into Current Open Edge Case AD.
- Historical edge cases 64 and the accepted topology note in 21 are covered by Current Open Edge Case Y.
- Historical edge case 68 is consolidated into Current Open Edge Case R; historical edge case 73 is docs cleanup only.
- Historical edge case 70 is consolidated into Current Open Edge Case Z.
- Buyback default-hook/pool setup (X) remains separate from buyback metadata scoping (AG), because one is canonical project configuration and the other is user quote enforcement.
- Banny project-`4` resume identity (A) remains separate from Banny resolver metadata ownership (AC), because they fail in different phases and need different fixes.
- Croptop fee beneficiary bypass (AO) is kept separate from existing J (currency/decimal assumptions), because AO is a caller-controlled address attack while J is a currency-path gap — different root causes, different fixes.
- Suckers price conversion (AM) is a protocol-level formula inversion distinct from cross-chain staleness (RISKS.md §8.6) or sucker deployment verification (Y).

Existing admin-note response map:

| Related edge case | Admin-note answer |
| --- | --- |
| AE | Worst case: any stale ERC-20 inventory sitting directly on a distributor can be attributed to an attacker-controlled hook by any authorized project controller using the controller-prepaid branch; the rounded-dust variant can permanently reserve small vesting leftovers. Worth fixing before immutable deploy: require exact fresh funding/allowance for ERC-20 prepaid credit, or track unaccounted balance per hook/source so global stale balance cannot be reassigned. |
| AF | Not mitigated by a trusted forwarder. The issue is token-transfer reentrancy during `_transferFrom`, not sender authentication. Worst case: callback-capable ERC-20 deposits can be counted more than once, minting/crediting more project value than the terminal actually received. Fix with a reentrancy guard around `pay` / `addToBalanceOf` ERC-20 intake, or explicitly reject callback-capable/unsupported ERC-20s. |
| AG | The proposed registry reroute is the right mitigation shape: when the registry forwards to the resolved hook, translate metadata scoped to the registry into the resolved hook's `quote` metadata ID, or make the quote ID interface-scoped rather than address-scoped. |
| AH | If native routes were changed to a wrapped-native token path, keep AH open until a current regression proves the V4-selected route settles from the deployed source graph. The stale source recheck still showed raw ETH entering V4 settlement and a WETH withdraw before settlement. |
| AD | If terminal selection is accepted risk, document the accepted boundary precisely: clients can cross-reference terminals for display, but onchain Defifa games still trust registered terminals for callbacks. For canonical/user-safe launchers, prefer a terminal allowlist or deployer-enforced terminal provenance. |
| J / historical 53 | Caller-supplied fee metadata is only needed if Croptop lets posts target arbitrary hook/terminal/currency setups. If Croptop fees must always be paid to a known ETH/native fee project, the safer design is protocol-generated fee metadata or fail-closed fee routing, not user-controlled fee metadata that can be made to refund. |
| AC | "Do not sweat it" is not applicable to the canonical deploy path: Banny resolver metadata ownership currently makes Phase 09 revert before launch unless the call order/owner is fixed or metadata setup is moved to the resolver owner. |
| AB | Fix is small and worthwhile: make resume check whether project `3` is already canonical and owned by `REVDeployer` before retrying `JBProjects.approve(...)` from the Safe. |
| Y | Same-address peer symmetry should be proven, not assumed. If different chains should produce the same sucker addresses, verification must compare the final `suckerPairsOf`, `peer()`, and remote native-token mappings across the chain manifest. |
| R | "Just the address is fine" is enough only for verifier identity; `handleOf` still needs a soft-fail around `ENS_REGISTRY.resolver(...)` so a missing registry does not revert user-facing metadata reads. |
| Historical 57 | Standalone Banny `script/Deploy.s.sol` should be fixed if that repo's default build/test path matters; no deploy-all tradeoff because canonical Banny deploy-all already passes `peer`. |
| Historical 58 | Migration-script issue can be accepted/deferred because the canonical one-shot path does not use the standalone Banny migration helper. |
| AE / historical 59 | The vesting dust issue is verified and stays inside AE. Fix by not advancing `shareClaimed` for zero-transfer partial claims, or by accumulating dust until a nonzero transfer is possible. |
| J / historical 60 | If Croptop purchases with USDC-priced hooks and fees to an ETH/native fee project are supported, this needs an explicit currency conversion path and regression tests. If unsupported, enforce/document the supported currency/decimal set instead of relying on caller metadata. |
| AD / historical 61 | Delayed-attestation timing should be fixed or explicitly constrained at launch. The safe predicate must account for the delay until `attestationStartTime`, not only grace plus timelock duration. |
| AD / historical 62 | Direct balance top-ups should not drive Defifa participation thresholds if NFT participation is the intended metric. Use recorded paid/minted participation, or explicitly accept that anyone can push a game into scoring by topping up terminal balance. |
| Historical 65 | For the standalone core periphery script, accepting "just the address" is an operator choice. It does not close deploy-all verifier gaps for external/auth surfaces, which remain covered by G/O. |
| Historical 66 | LP range math should use actual hook-adjusted pay/cash-out values, or reject deployment when active data hooks can alter those values. This is ecosystem LP hardening unless canonical deployment creates LP ranges for non-neutral hook projects. |
| Historical 69 | Fee-on-transfer reclaim-token support can be deferred if unsupported. If arbitrary reclaim tokens are supported later, check the beneficiary's final balance delta rather than the hook's intermediate receipt. |
| Z / historical 70 | The zero-tax / fee-free-surplus preview edge is part of current Z. Fix before relying on router route selection: preview must include the same fee/free-surplus effects as live settlement. |
| Historical 71 | Accepted as an integrator footgun: canonical deploy-all uses nonzero sucker salts. Document the zero-salt behavior if left unchanged. |
| Historical 72 | "Only accept mints" is the right small fix for accidental project NFT transfers into omnichain deployers; otherwise add a rescue path. Not an immediate deploy-all blocker. |
| Historical 73 | Docs cleanup only: update ProjectHandles docs/RISKS to match current internal-dot behavior, or change the API if one label per part is desired. |
| Historical 74 | Quick low-risk cleanup: make the V3-only `discoverPool()` helper revert descriptively when V4 wins discovery instead of returning `address(0)`. |
| Historical 75 | Remove `REVEAL_TOKENS` if delegated reveal is not planned; otherwise wire it into `REVHiddenTokens.revealTokensOf`. Current behavior requires holder self-reveal. |
| Historical 76 | Yes, clones from `JBProjectPayerDeployer` are safe from user reinitialization because the deployer initializes them immediately and exposes no reinitialize entrypoint. Direct standalone deployments remain an edge; current deploy-all risk is instead verifier authentication of the factory/implementation pair, covered by T. |

Suggested triage order:

1. First unblock the deployment mechanism itself: B, V, W, AL, A, AB, AC, H, and X. Until these are fixed or explicitly accepted with a replacement runbook, the one-shot deploy/resume path either compiles the wrong source graph, cannot execute as documented, predicts wrong deterministic addresses, or reverts/skips canonical project phases.
2. Next close verifier false positives: C, F, G, I, J, K, L, M, N, O, P, T, Y, AI, AJ, and AK. These do not always break execution, but they prevent the final deployment report from proving that the immutable system matches the audited manifest.
3. Then resolve runtime economic/accounting risks: Z, AD, AE, Q, R, U, AM, AN, AO, AP, AQ, and AR. AM (suckers price conversion inversion) is CRITICAL and should be prioritized within this group. Some may be accepted as product tradeoffs, but acceptance should be explicit because they affect user-facing economics, metadata reliability, reward eligibility, or token accounting after deployment. (D, E, AA, and AF have been closed as ACCEPTED per RISKS.md; AG was previously FIXED.)
4. Keep S and AH out of the initial rollout unless swap-enabled suckers are added before launch. If swap-enabled CCIP enters the manifest, promote both to immediate deploy blockers.

Admin disposition template:

Use this format when adding owner/admin notes to a edge case. A edge case should stay blocking unless its disposition includes enough evidence for a later verifier, runbook, or operator to enforce the decision.

| Field | What to record |
| --- | --- |
| Disposition | `Must fix before deploy`, `Accepted risk before deploy`, `Deferred / not in initial rollout`, or `Needs product decision`. |
| Owner | Person/team responsible for the fix, acceptance, or rollout exclusion. |
| Rationale | Why this disposition is acceptable under the immutable deployment threat model. |
| Required artifact | Code PR, verifier assertion, manifest entry, regression test, runbook change, or explicit signed acceptance note. |
| Exit criteria | Exact command, verifier output, source reference, or documented acceptance condition that closes the item. |

Issue-format adapter:

`REVIEW_GUIDE.md` asks for issue submissions with root cause, impact, proof of concept, self-review, and recommended fix. Issues are intentionally deferred for owner review in this thread, but each detailed edge case is structured so it can be converted without re-auditing:

| Issue field | Where to pull it from |
| --- | --- |
| Title | Current edge case heading and severity. |
| Review seed | Scope / review seed section at the top of this report. |
| Repos involved | Edge Case heading and `Affected code` links. |
| Root cause | First paragraph of `Why it is real`, plus the affected source links. |
| Impact | Edge Case `Impact` section. |
| Proof of concept | Scope recheck bullets, temporary/local audit-test evidence, linked regression tests, and concrete execution sequence in `Why it is real`. |
| Why this survived self-review | The edge case's status, deduping notes, explicit accepted-risk discussion, and tests or source rechecks that rule out proxy-green false positives. |
| Recommended fix | Edge Case `Recommended fix` section and the default disposition in the confirmed issue queue. |

Suggested owner/workstream routing:

| Workstream | Edge Case IDs | Primary repos/artifacts to assign |
| --- | --- | --- |
| Deploy execution and runbook | B, V, W, AL, A, AB, AC, H, X | `deploy-all-v6`, Sphinx execution path, `DEPLOY.md`, canonical project phase scripts. |
| Deployment verifier and manifest exactness | C, F, G, I, J, K, L, M, N, O, P, T, Y, AI, AJ, AK | `deploy-all-v6/script/Verify.s.sol`, deploy manifests/env, per-chain address manifests, ownership/permission reports. |
| Core terminal and router economics | Z | `nana-core-v6`, `nana-router-terminal-v6`, revnet router-fee interactions. (AA and AF closed as ACCEPTED.) |
| Cross-chain and sucker protocol fixes | AM, AQ | `nana-suckers-v6` (`JBSuckerLib.convertPeerValue`), `revnet-core-v6` (`REVOwner.beforeCashOutRecordedWith`). |
| Revnet product economics | AN, ~~D, E~~ | AN: `revnet-core-v6` (`REVDeployer._tryInitializeBuybackPoolFor`). D, E: ACCEPTED per `revnet-core-v6/RISKS.md` §4 and §8. |
| Product/periphery runtime safety | AD, AE, AG, AO, AP, AR, Q, R, U | `defifa`, `nana-distributor-v6`, `nana-buyback-hook-v6`, `nana-721-hook-v6`, `nana-project-handles-v6`, `croptop-core-v6`, `univ4-lp-split-hook-v6`, `deploy-all-v6` Phase 11 config. |
| Cross-chain future rollout | S, AH | DEFERRED. Not in initial rollout. `nana-suckers-v6`, swap-enabled CCIP manifest policy. |
| Static interface publication | JD-1, JD-2 | OUT OF SCOPE (frontend). `jb-directory`, ABI/address manifest generation, token/chain UX, publication build checks. |

## Implementation Handoff TLDR

Current status: `NOT READY`. `AUDIT_REPORT.md` contains 36 confirmed open immediate `deploy-all-v6` blockers, 2 deferred future/expanded swap-enabled sucker blockers (S, AH), 7 items closed as ACCEPTED per RISKS.md (D, E, AA, AF, 66, 69, 74), and 1 accepted/deferred (58). Separate `jb-directory` publication edge cases JD-1 and JD-2 are not EVM deployment blockers (frontend scope), but should gate publication of the static interface.

Start implementation with deploy execution and runbook blockers: B, V, W, AL, A, AB, AC, H, and X. These determine whether the audited source graph is used, whether Sphinx/Safe execution preserves deterministic CREATE2 semantics, whether resume can actually be run, whether canonical projects `1-4` are recoverable/idempotent, whether Defifa verification can pass a correct deploy, and whether canonical buyback hooks/pools are present.

Then implement verifier/manifest exactness: C, F, G, I, J, K, L, M, N, O, P, T, Y, AI, AJ, and AK. After that, handle runtime economics/accounting and product safety: Z, AD, AE, Q, R, U, and the new protocol-level fixes AM, AN, AO, AP, AQ, AR. (D, E, AA, and AF have been closed as ACCEPTED per RISKS.md; AG was previously FIXED.) Keep S and AH out of the initial rollout unless swap-enabled suckers are added, in which case promote both to immediate blockers.

For each edge case, read its detailed section before changing code, implement the smallest code/runbook/verifier change that closes the stated impact, add or update a focused regression, run the relevant Forge build/tests, and update this report only after the evidence proves the deploy objective is covered. Do not close edge cases based only on proxy green tests that do not exercise the actual deploy/resume/verifier path. No PRs/issues have been opened yet.

## Triage Summary (51 Unique Items)

Cross-referenced against all 20 RISKS.md files on 2026-05-07.

| Group | Count | Status | Items |
| --- | --- | --- | --- |
| Already accepted in RISKS.md | 7 | ACCEPTED | D, E, AF, AA, 74, 66, 69 |
| Verify.s.sol manifest gaps | 16 | OPEN — needs verification checks | C, F, G, H, I, J, K, L, M, N, O, P, T, AI, AJ, AK |
| Deploy script fixes | 6 | OPEN — needs script changes | A, AC, AL, B, V, W |
| Protocol-level fixes | 12 | OPEN — needs contract changes | Z, AE, AD, Q, X, R, AM, AN, AO, AP, AQ, AR |
| Operational/config | 5 | DEFERRED or CONFIG FIX | U, Y, S, AH, 58 |
| Low-priority standalone | 5 | LOW PRIORITY or OUT OF SCOPE | 65, 71, 76, JD-1, JD-2 |

### Remaining 36 Immediate Deploy Blockers (by fix type)

**Deploy execution and runbook (6):** A, AC, AL, B, V, W

**Verify.s.sol manifest checks (16):** C, F, G, H, I, J, K, L, M, N, O, P, T, AI, AJ, AK

**Protocol-level contract fixes (12):** Z, AE, AD, Q, X, R, AM, AN, AO, AP, AQ, AR

**Config fix (1):** U

**Cross-chain manifest (1):** Y (overlaps with Verify.s.sol group)

### Recommended Implementation Order

1. Deploy execution: B, V, W, AL, A, AC (unblocks rehearsal)
2. Verify.s.sol: C, F, G, H, I, J, K, L, M, N, O, P, T, Y, AI, AJ, AK (deploy confidence)
3. Protocol fixes: Z, AE, AD, Q, X, R, AM, AN, AO, AP, AQ, AR (security value — AM is CRITICAL)
4. Config: U (trivial — change block counts to seconds)

## Objective Coverage Audit

This section maps the original review request and `REVIEW_GUIDE.md` process to concrete report evidence. It is intentionally a completion check, not a readiness claim.

| Requirement | Evidence in this report / workspace | Current status |
| --- | --- | --- |
| Start from top-level `REVIEW_GUIDE.md`, `ARCHITECTURE.md`, root `RISKS.md`, and `USER_JOURNEYS.md`. | Review seed and inputs record the root docs; the readiness checklist uses the root deployment, composition, invariant, and user-journey requirements as gates. | COVERED |
| Review the V6 EVM workspace as one composed ecosystem, not isolated repos. | Coverage note includes all 19 active EVM repos from `ARCHITECTURE.md`, plus `nana-project-payer-v6`; Current Open Edge Cases A-AR are cross-repo where relevant. | COVERED |
| Cover the primary in-workspace protocol scope and deployment wiring listed in `REVIEW_GUIDE.md`. | The scope includes `nana-core-v6`, `nana-721-hook-v6`, `nana-suckers-v6`, `nana-buyback-hook-v6`, `nana-router-terminal-v6`, `nana-omnichain-deployers-v6`, `revnet-core-v6`, `univ4-router-v6`, `univ4-lp-split-hook-v6`, `croptop-core-v6`, `defifa`, `banny-retail-v6`, `nana-ownable-v6`, `nana-address-registry-v6`, `nana-distributor-v6`, `nana-fee-project-deployer-v6`, `nana-permission-ids-v6`, `nana-project-handles-v6`, and `deploy-all-v6`; current edge cases and the readiness checklist specifically cover repo-local scripts, registries, constructor/initializer inputs, singleton assumptions, project IDs, and privileged helper convergence. | COVERED |
| Reconcile workspace inventory against the EVM deployment scope. | `jb-directory` is present as an untracked static IPFS interface / ABI-registry app, but it has no Solidity/Foundry review surface and no `deploy-all-v6` import. It is out of scope for immutable EVM deployment readiness and should be reviewed separately before publication. | COVERED / SEPARATE REVIEW |
| Pay attention to repo-local `REVIEW_GUIDE.md`, `RISKS.md`, `USER_JOURNEYS.md`, and other docs, while challenging accepted risks. | A doc inventory confirmed every active repo and `nana-project-payer-v6` has those three repo-local files. Current edge cases explicitly reopen or challenge documented/accepted assumptions for revnet hidden tokens, revnet config hashes, ProjectHandles availability, deploy-all runbook, distributor timing, Sphinx deployment, and verifier coverage. | COVERED |
| Decompose and run value-flow, access-control, state-consistency, persona, and composition passes. | This report records the composed outputs of those passes rather than per-subagent logs. The current edge cases cover value movement/accounting (Z, AA, AE, AF), access and authority (C, L, M, N, O, P, AD), state/replay/idempotency (A, AB, V, W, AL), persona-specific paths, and cross-component wiring assumptions. | COVERED / PROCESS ADAPTED |
| Test surviving edge cases against the nine critical invariants. | Edge Cases map to terminal solvency (AA, AF), project isolation (Y, AD), ruleset/phase correctness (I, U), hook boundedness (AG, AD, AR), fee correctness (Z, AA, AO), token accounting consistency (Q, AE, AK, AN), cross-chain conservation (S, Y, AH, AM, AQ), privilege containment (C, L, M, O, P, AP), and preview/execution coherence (J, Z, AG). | COVERED |
| Merge edge cases that share root causes and keep only demonstrated concrete impact. | The confirmed issue queue has explicit deduping decisions, historical edge case promotion/consolidation, and detailed "Why it is real" / "Impact" sections for each current edge case; dropped and optional items are separated from deploy blockers. | COVERED |
| Triage verified edge cases into `AUDIT_REPORT.md` with mitigations/fixes. | Current Open Edge Cases A-AR each include status, affected code, impact, and recommended fix; historical edge cases 1-78 have explicit status disposition. | COVERED |
| Focus on the one-shot `deploy-all-v6` rollout for canonical projects `1-4` before immutable deployment. | Deployment Readiness Checklist maps canonical project identity, package graph, deterministic deployment, runbook, verifier, project economics, cross-chain pairs, and post-deploy ownership gates. | BLOCKED by 36 immediate deploy-all edge cases |
| Validate that tests/green checks actually cover the deployment objective. | Full deployment rehearsal row rejects proxy signals: current fork tests do not run the real Sphinx-gated deploy, phases 06-11, or `Verify.s.sol`, and Arbitrum evidence needs archive RPC. | INCOMPLETE |
| Include user/developer/AI reliability, not only direct fund theft. | Edge Cases include verifier false positives/omissions, stale docs/runbooks, ProjectHandles soft-metadata reliability, ProjectPayer clone identity, Banny script breakage, and optional cleanup items. | COVERED |
| Flag gas optimizations noticed during review. | `REVIEW_GUIDE.md` says gas edge cases are welcome and do not need a separate pass. No gas-only item was promoted to a deployment blocker; gas-adjacent risks that affected solvency or accounting were triaged under current edge cases AA and AE. | BEST-EFFORT / NO SEPARATE PASS REQUIRED |
| Respect out-of-scope boundaries for third-party dependency internals and style-only issues. | Third-party packages were only inspected where deployment composition makes them part of Juicebox's execution path, such as Sphinx action replay and stale first-party npm package resolution. Style/comment-only issues were kept in optional cleanup only when they affect operator, reviewer, or generated-agent reliability. | COVERED |
| Submit edge cases as issues if following `REVIEW_GUIDE.md`. | User workflow for this thread is to triage into `AUDIT_REPORT.md` and not open PRs/issues yet; no issue submission was performed. | INTENTIONALLY DEFERRED |
| Reach "10/10 confident to deploy." | The report currently says `NOT READY` and lists 36 immediate deploy-all blockers (plus 2 deferred, 7 accepted, and 2 frontend-scoped). | NOT ACHIEVED |

Completion review snapshot, 2026-05-06:

| Prompt deliverable / success criterion | Concrete artifact or evidence | Completion result |
| --- | --- | --- |
| Full Juicebox V6 EVM ecosystem review before immutable one-shot deployment. | Scope covers the 19 repos named by top-level `REVIEW_GUIDE.md` / `ARCHITECTURE.md`, plus `nana-project-payer-v6`; current edge cases A-AR span deploy, core, revnets, suckers, products, hooks, routers, distributors, and periphery. | AUDIT TRIAGED, DEPLOYMENT NOT READY |
| Start from top-level `REVIEW_GUIDE.md` and use the root docs as the review map. | Inputs section records `ARCHITECTURE.md`, root `RISKS.md`, `REVIEW_GUIDE.md`, and `USER_JOURNEYS.md`; this coverage table and the readiness checklist are derived from those docs. | COVERED |
| Pay attention to every repo's `RISKS.md` and docs. | Workspace doc inventory found repo-local `REVIEW_GUIDE.md`, `RISKS.md`, and `USER_JOURNEYS.md` for every in-scope active EVM repo and for `nana-project-payer-v6`; current edge cases challenge accepted risks where evidence contradicted deploy readiness. | COVERED |
| Go deep, broad, and hard across personas and composed attack paths. | Current open edge cases cover the prompt personas: MEV/routing (X, AG, AH, AR), malicious owner and ruleset/config surfaces (D, E, I, AD, AP), bridge operator/cross-chain (S, Y, AH, AM, AQ), grief/runbook/deployment failure (A, AB, AC, V, W, AL), fee evasion (Z, AA, AO), flash/accounting consistency (AF), permission escalation (C, L, M, O, P), oracle/external provenance (F, G), decimals/currency assumptions (J, U, AN), and broad theft/accounting paths (AE, AF, Z, AA). | COVERED |
| Triage verified edge cases into `AUDIT_REPORT.md` with recommended mitigations/fixes. | Confirmed issue queue lists 36 immediate deploy-all blockers, 2 deferred future/expanded rollout blockers, and 7 accepted-by-design items; every current edge case A-AR has severity, status, affected code, why it is real, impact, and recommended fix. | COVERED |
| Ensure green tests/verifiers are not treated as proxy proof. | Readiness checklist explicitly rejects current proxy signals where fork tests do not run Sphinx-gated `Deploy.s.sol`, phases 06-11, `Verify.s.sol`, or the exact Safe/resume execution path. | COVERED / BLOCKED |
| Produce user/developer/AI reliability notes, not only fund-theft edge cases. | Separate `jb-directory` publication edge cases JD-1/JD-2 and optional cleanup items cover static interface safety, stale docs, ABI/permission metadata, runbook clarity, ERC-721 read semantics, and generated manifest quality. | COVERED |
| Flag gas edge cases if noticed. | No dedicated gas pass was required by `REVIEW_GUIDE.md`; no gas-only issue was promoted to the current blocker queue, while accounting/solvency impacts with gas-repeatability dimensions remain covered by AA and AE. | BEST-EFFORT |
| Avoid opening PRs/issues until owner review. | No GitHub issue or PR submission was performed; edge cases are consolidated here for admin notes. | COVERED |
| Reach 10/10 confidence to deploy projects `1-4` using `deploy-all-v6` once. | Current state still has 36 immediate deploy-all blockers, including source-graph drift, Sphinx CREATE2 replay, runbook mismatch, canonical project restartability failures, verifier omissions, protocol-level formula/initialization bugs, and product/periphery wiring gaps. (Fee rounding and ERC-777 reentrancy have been accepted per RISKS.md.) | NOT ACHIEVED |

## Separate `jb-directory` Publication Edge Cases

These edge cases are not counted in the 36 EVM deploy-all blockers above because `jb-directory` is not imported by `deploy-all-v6` and is not listed in `ARCHITECTURE.md` as an active EVM repo. They should still be handled before publishing the static IPFS interface because they affect user, developer, and AI reliability after deployment.

### JD-1. `jb-directory`: token selector can desync visible chain/token state from encoded transaction inputs

Severity: `MED` for the published static interface.

Status: OUT OF SCOPE / FRONTEND. Current UI state is per-form for execution, but token selection is driven by one global chain value and amount decimals are not bound to the selected token. This is a frontend/jb-directory fix, not EVM scope.

Affected code:

- [form.js](/Users/jango/Documents/jb/v6/evm/jb-directory/src/form.js:21)
- [form.js](/Users/jango/Documents/jb/v6/evm/jb-directory/src/form.js:97)
- [tokens.js](/Users/jango/Documents/jb/v6/evm/jb-directory/src/tokens.js:18)
- [tokens.js](/Users/jango/Documents/jb/v6/evm/jb-directory/src/tokens.js:45)
- [inputs.js](/Users/jango/Documents/jb/v6/evm/jb-directory/src/inputs.js:72)
- [inputs.js](/Users/jango/Documents/jb/v6/evm/jb-directory/src/inputs.js:194)
- [tokens.json](/Users/jango/Documents/jb/v6/evm/jb-directory/data/tokens.json:4)

Why it is real:

- Each rendered function form captures its own `formChainId` and executes reads, writes, and simulations against that per-form chain.
- The token pill renderer ignores the form's chain and instead calls `getChainTokens(getCurrentChainId())`; changing one form's chain calls `setCurrentChainId(...)`, which rerenders every token selector in every open form.
- `renderTokenSelect(...)` rerenders the visible pills on chain change but does not call its `onSelect(...)` callback during rerender, so the hidden address input can keep a previous chain's token address while the UI visually resets to a different chain/token.
- Fixed-point amount fields default their decimal helper to `18`, while `getTokenDecimals(...)` is imported but unused. The token list contains chain-specific 6-decimal USDC addresses on the supported mainnets.

Impact:

- A user can build a transaction for one selected form chain while encoding a stale token address from another chain, or can visually select a 6-decimal token while the amount helper still encodes decimal inputs as 18 decimals.
- For a static interface meant to guide users, developers, and AI agents through direct contract calls, this can produce misleading simulations, failed transactions, or dangerous over-sized token amounts.

Recommended fix:

- Scope token selectors to the form's `formChainId` instead of global chain state.
- On any form-chain change, reset token inputs through the same `onSelect(...)` callback used by direct token clicks, and make the selected token object available to related amount fields.
- Bind fixed-point amount decimal defaults to the selected token's decimals, show the raw encoded amount, and block transaction/simulation when the selected token address does not belong to the form chain.

### JD-2. `jb-directory`: singleton address manifest is all-null and not enforced by the build before publication

Severity: `LOW` for current predeploy state; `MED` if published after deployment without a generated manifest.

Status: OUT OF SCOPE / FRONTEND. The static directory currently has ABI data but no deployed singleton addresses, and the build does not fail on missing supported-chain addresses. This is a frontend/jb-directory fix, not EVM scope.

Affected code/data:

- [manifest.json](/Users/jango/Documents/jb/v6/evm/jb-directory/data/manifest.json:14)
- [app.js](/Users/jango/Documents/jb/v6/evm/jb-directory/src/app.js:120)
- [app.js](/Users/jango/Documents/jb/v6/evm/jb-directory/src/app.js:214)
- [form.js](/Users/jango/Documents/jb/v6/evm/jb-directory/src/form.js:308)
- [build/generate-registry.js](/Users/jango/Documents/jb/v6/evm/jb-directory/build/generate-registry.js:206)

Why it is real:

- `data/manifest.json` sets every listed contract address on every supported chain to `null`.
- Singleton common-action and directory forms resolve their target with `getAddress(contractName, chainId)`; only per-project/non-singleton contract sections expose a manual address override.
- `executeRead(...)`, `executeWrite(...)`, and `executeSimulate(...)` all fail with "No contract address for this chain" when the manifest address is missing.
- `generate-registry.js` merges manifest addresses into the generated registry but does not require non-null singleton addresses for chains that are intended to be published.

Impact:

- The static interface is expected to be an IPFS directory to deployed V6 contracts, but in the current state singleton interactions are inert on every chain.
- If the app is published without a deploy-artifact-derived manifest, users and agents cannot distinguish "not deployed yet" from "directory metadata missing", and may rely on stale manual addresses or bypass the directory's intended safety affordances.

Recommended fix:

- Generate `data/manifest.json` from the verified `deploy-all-v6` deployment artifacts after each chain deployment.
- Add a publication build check that fails if any published chain is missing required singleton addresses, and include a manifest provenance record tying addresses to the verifier run and deploy commit.
- Consider an explicit expert-mode singleton address override, but keep the default published path manifest-backed and fail-closed.

## Deployment Readiness Checklist

Current status: NOT READY for final deployment rehearsal or immutable production rollout.

This checklist maps the review objective to concrete gates and current evidence. A green unit or fork test is not sufficient unless the gate's exact deployment requirement is covered.

| Gate | Required evidence before deployment | Current evidence | Status |
| --- | --- | --- | --- |
| Audited source graph | `deploy-all-v6` must compile the same first-party source graph audited in this workspace, or pinned published packages must match the sibling repo versions exactly. | `forge remappings` still resolves first-party imports through `node_modules`; package versions and source trees drift from sibling repos. | BLOCKED by Edge Case B |
| Deterministic deployment execution | The actual Sphinx execution path must deploy every salted contract at the same address used by `_isDeployed`, constructor arguments, hook salt mining, manifests, and verification. | `Deploy.s.sol` uses Solidity `new {salt}` throughout and computes addresses with `safeAddress()` as CREATE2 deployer. Local Sphinx code records Solidity CREATE2 as a root `Create` access and replays `Create` via Safe delegatecall to `CreateCall.performCreate`; the Sphinx plugin only classifies CREATE2 when the root call targets the deterministic deployment proxy. A focused review test confirmed Solidity `new {salt}` is recorded as `AccountAccessKind.Create` with initcode only, so the salt is lost before action decoding. | BLOCKED by Edge Case V |
| Executable Sphinx/Safe runbook | The documented one-shot deploy and interrupted-resume commands must be the exact live commands operators can run, including Sphinx lock/safe setup and Safe transaction execution. | `Deploy.s.sol` is guarded by Sphinx's `sphinx` modifier, which rejects Foundry broadcast mode, but `DEPLOY.md` tells operators to use `forge script ... --broadcast`; no `sphinx.lock` is present in `deploy-all-v6`. `Resume.s.sol` requires `msg.sender == RESUME_SAFE` and then calls `vm.startBroadcast()`, so a normal owner EOA broadcast fails the auth check while a Safe contract address cannot sign a standard live Forge broadcast. Core deploy/resume idempotency also computes the already-deployed `JBTerminalStore`, `JBMultiTerminal`, and `JBController` addresses with constructor args in the wrong order, so completed core deployments are not detected by the deploy/resume scripts. | BLOCKED by Edge Cases W and AL |
| Canonical projects `1-4` | Deploy and resume must either create NANA/CPN/REV/BAN or fail immediately when an existing project ID is non-canonical, and already-completed phases must be restartable without retrying ownership actions that are no longer authorized. | Normal resume fork tests pass, and projects `1-3` have stronger identity gates; however, REV Phase 07 is not idempotent after project `3` has already been configured and transferred to `REVDeployer`. Banny project `4` still skips on generic controller presence, and `DEPLOY.md` still describes count/controller checks as detection. | BLOCKED by Edge Cases A and AB |
| Post-deploy Safe/admin convergence | Verifier must prove every Safe-owned/configured contract is owned by the intended Safe on production chains. | `VERIFY_SAFE` is loaded but never used; admin-owner exactness is not checked. | BLOCKED by Edge Case C |
| Immutable external-address provenance | Verifier must authenticate Chainlink aggregators/sequencer feeds/thresholds, Uniswap/WETH/Permit2/bridge/CCIP constants, and Defifa typeface contracts for each supported chain. | Price-feed liveness and a narrow `DeployScriptVerification.t.sol` subset pass; full manifest exactness is absent, and Arbitrum full-stack fork needs archive RPC evidence. | BLOCKED by Edge Cases F and G |
| Product/periphery wiring | Verifier must prove Defifa, Croptop, project handles, distributors, project payer, buyback pool setup, 721 hook clone infrastructure, and Banny wiring match the deployment manifest. | Phase 11 checks improved, but Defifa hook-store verification contradicts deploy code, permissionless Defifa launches can register caller-selected terminals that pass the hook callback guard, and launch/game-phase inputs can make scorecard timing or participation invalid; the shared 721 hook deployer verification does not authenticate the base hook, checkpoint deployer, store, or address registry that future clones inherit; Croptop deployer/project-owner envs are loaded but not validated, and the publisher assumes ETH/18-decimal hook pricing; Banny resolver metadata initialization currently calls an operator-owned `onlyOwner` setter from the deploy authority, and the Banny tier/resolver manifest is not authenticated; NANA/project `1` does not inherit the buyback registry default hook, canonical revnet pool keys are not checked, and user quote metadata scoped to the buyback registry is ignored by the resolved hook; ProjectHandles ENS registry availability and `.eth` suffix ambiguity are not checked; ProjectPayer implementation identity is not authenticated; distributor timing uses inconsistent wall-clock durations, distributor ERC-20 split credit can assign stale unaccounted direct transfers to the wrong hook, and vesting dust can be marked claimed without transfer. | BLOCKED by Edge Cases H, I, J, R, T, U, X, AC, AD, AE, AG, and AI |
| Project economics and live stage effects | Verifier must compare projects `1-4` rulesets, splits, auto-issuance, current stage/cut state, native primary-terminal routing, and Banny tier/resolver data against the intended manifest. | Current verifier checks owner, token symbol, nonzero config hash, nonzero native primary terminals, and minimal Banny hook identity only; exact primary routing is only asserted for NANA. | BLOCKED by Edge Case I |
| Revnet runtime singleton wiring | Verifier must prove `REVLoans`, `REVOwner`, `REVHiddenTokens`, and `REVDeployer` runtime immutables match the deploy manifest before any project `1-4` revnet is treated as live. | Phase 07 deploys `REVHiddenTokens` and bakes `REVLoans`, `REVOwner`, `REVHiddenTokens`, `JBBuybackHookRegistry`, `JBSuckerRegistry`, Permit2, fee project ID, and the Safe owner into singleton contracts, but `Verify.s.sol` only checks a subset of `REVDeployer` getters plus `REVOwner.DEPLOYER()`. It has no `VERIFY_REV_HIDDEN_TOKENS` input and does not inspect the owner/loan/hidden-token runtime surface. | BLOCKED by Edge Case AJ |
| Core ERC-20 clone surface | Verifier must prove `JBTokens` points at the intended `JBERC20` implementation and that the implementation's permission/project immutables match the core manifest before project-created ERC-20 clones are trusted. | Phase 01 deploys `JBERC20` and passes it into `JBTokens`, whose `deployERC20For` clones `TOKEN`; `Verify.s.sol` loads only `VERIFY_TOKENS` and checks controller/terminal references to `JBTokens`, with no `VERIFY_ERC20_IMPLEMENTATION`, no `JBTokens.TOKEN()` check, and no implementation `PROJECTS()` / `PERMISSIONS()` checks. | BLOCKED by Edge Case AK |
| Exact allowlists and approvals | Verifier must prove expected sucker deployers, first-controller allowlist, fee-exempt addresses, and project NFT approvals exactly match the deploy manifest. | Current checks are optional/subset-based or impossible from non-enumerable mappings; project NFT approvals are not inspected. | BLOCKED by Edge Cases K, L, M, and N |
| Cash-out fee integrity | Router and feeless-address exemptions must not let arbitrary users convert project-token cash-out value into a second project and exit without the protocol/revnet fees that a direct source cash-out would have paid. | `deploy-all-v6` intentionally marks `JBRouterTerminal` feeless, and the router cashes out source project tokens with itself as beneficiary before paying the destination project. A focused PoC shows routing into a user-controlled zero-tax project and cashing out that project avoids the source cash-out protocol fee; static review also shows `REVOwner` skips the revnet fee split when the router is the feeless beneficiary. The V4 sell-preview path also returns gross zero-tax reclaim before checking whether fee-free surplus would still charge fees during settlement. | BLOCKED by Edge Case Z |
| Terminal balance conservation | Payouts, cash-outs, and ERC-20 intake must debit, transfer, and account from the same value without double counting reentrant balance deltas. | `JBMultiTerminal` subtracts per-output fee haircuts before transferring payout splits, owner leftover, beneficiary reclaim, and cash-out hook amounts, but later calls `_takeFeeFrom(...)` once on the aggregate eligible amount. Focused PoCs show 400 wei payout/cash-out flows each record 10 wei for the fee project while only 9 wei remains in the terminal after per-output fee haircuts. ERC-20 intake also measures a before/after terminal balance around `_transferFrom(...)` without a reentrancy guard, so callback tokens can reenter and make the outer call account the inner transfer a second time. | BLOCKED by Edge Cases AA and AF |
| Cross-chain sucker pair manifest | Verifier must prove each canonical project has exactly the intended active sucker pairs, peer addresses, remote chain IDs, enabled native-token mapping, and no unexpected active suckers before bridge operations are considered live. | `JBSuckerRegistry.suckerPairsOf(...)`, `suckersOf(...)`, and each sucker's `peer()`, `peerChainId()`, and `remoteTokenFor(...)` expose the required state, but `Verify.s.sol` only checks registry/deployer wiring plus optional deployer allowlist entries. `deploy-all-v6` also uses `peer: bytes32(0)`, so the same-address peer assumption must be proven across chains or replaced with explicit peer values. | BLOCKED by Edge Case Y |
| Permission, directory, and forwarder auth surface | Verifier must authenticate immutable permission, directory, and trusted-forwarder inputs plus runtime wildcard/project grants. | Constructor wiring is partially checked, but trusted-forwarder, permission-registry, directory-auth, and wildcard grants are not manifest-checked. | BLOCKED by Edge Cases O and P |
| Revnet economic trust model | Hidden-token economics and configuration-hash scope must be changed or explicitly accepted with deployment/operator documentation. | Current tests assert hidden supply remains excluded from cash-out/loan denominators and split-operator/reserved-split routing remain excluded from the configuration hash. | BLOCKED / ACCEPTANCE NEEDED by Edge Cases D and E |
| 721 reward snapshot correctness | Snapshot rewards must prove token existence at the reward snapshot block. | `ownerOfAt(...)` is used, but mint blocks are not recorded, so never-transferred late-minted tokens can still inherit a prior owner checkpoint. | BLOCKED by Edge Case Q |
| Project handle reliability | `JBProjectHandles.handleOf(...)` must be non-reverting soft metadata on every chain where `deploy-all-v6` requires the extension, and returned handles must verify the same ENS node they visually represent. | `JBProjectHandles` hardcodes the canonical ENS registry and `handleOf` does not catch registry-call failures; a local no-code registry review test confirmed stored handles revert instead of returning empty. Stored parts can also display `name.eth` while verifying `name.eth.eth`. | BLOCKED by Edge Case R |
| Distributor timing semantics | Reward distributor rounds and 52-round vesting must use the intended wall-clock duration consistently across target chains. | `JBDistributor` measures rounds with `block.timestamp`, but `deploy-all-v6` sets `50_400`, `302_400`, and `2_419_200` as if they were block-count-derived one-week values; the verifier mirrors those values, so it approves 14-hour L1 rounds, 3.5-day OP/Base rounds, and 28-day Arbitrum rounds. | BLOCKED by Edge Case U |
| Swap-enabled CCIP claim liveness | Out-of-order CCIP delivery and native-token swap settlement must be safe before swap-enabled suckers are enabled. | `JBSwapCCIPSucker` records per-nonce batch/conversion metadata only when `fromRemote` advances the inbox nonce; a PoC shows nonce `2` before nonce `1` leaves nonce `1` tokens delivered but unclaimable. Its swap library also normalizes native-token inputs to WETH for discovery, but when V4 is selected it tries to `withdraw(amountIn)` from WETH even though the sucker received raw ETH from `prepare()`. Current `deploy-all-v6` Phase 03 deploys plain `JBCCIPSucker`, with Tempo/cross-currency `JBSwapCCIPSucker` called out as a later phase. | ECOSYSTEM BLOCKER by Edge Cases S and AH; not current Phase 03 deploy path |
| Full deployment rehearsal evidence | Full-stack deploy/resume tests should pass on every target production chain with archive-capable RPCs at pinned blocks, and the evidence must either run the real `Deploy.s.sol` / `Resume.s.sol` / `Verify.s.sol` path or prove exact equivalence. | `DeployFullStack.t.sol` hand-replicates infrastructure phases 01-05 only, explicitly excludes phases 06-09, and does not run `Verify.s.sol`; Ethereum, Optimism, and Base passed that limited slice, while Arbitrum failed before test logic due missing archive trie state. `DeployResumeRehearsalFork.t.sol` passes normal harnessed resume slices, but its "after Phase 07" path only reserves CPN/REV project IDs and does not execute real Croptop/Revnet/Banny phases. Testnet verifier runs also permit optional late-periphery env omissions that production-chain verifier runs reject. | INCOMPLETE |

## Current Open Edge Cases

### A. `deploy-all-v6`: Banny project-`4` deploy/resume still skips on generic controller presence

Severity: `MED`

Status: OPEN / REOPENED. The verifier now checks BAN/Banny-specific identity, but the deploy and resume paths can still skip Phase 09 before those checks ever run.

Affected code:

- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2459)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2533)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:3108)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:407)
- [DEPLOY.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/DEPLOY.md:105)

Why it is real:

- `_deployBanny()` still returns immediately when `projects.count() >= 4` and `directory.controllerOf(4) != address(0)`.
- `_resumeBanny()` uses the same generic skip condition and does not call `_isCanonicalConfiguredProject(4)`, even though that helper now contains the required BAN token and Banny 721 hook identity checks.
- `Verify.s.sol` now catches the bad final state by checking `revOwner.tiered721HookOf(4)` and the hook symbol, but this is a late failure. Once an interrupted deployment has adopted or skipped over a non-canonical configured project `4`, rerunning `Resume.s.sol` repeats the skip and does not converge to the intended BAN/Banny deployment.
- `DEPLOY.md` still tells operators that Resume detects project-ID ordering drift with `projects.count()` and controller-assignment checks, which is the exact generic predicate that fails to prove canonical BAN/Banny identity.
- Scope recheck: `forge test --match-path test/regression/ResumeBannyProjectFourSquat.t.sol -vv` still passes in `deploy-all-v6`, proving the resume harness skips over an attacker-owned configured project `4` and leaves no canonical Banny resolver deployed.

Impact:

- If the deployment is interrupted after projects `1-3` and the controller are live, a third party can create/configure project `4` before recovery.
- Resume then skips Banny Phase 09 instead of either deploying canonical BAN or failing immediately, leaving operators with a verification failure and no resume-script repair path.
- The live one-shot deployment is only safe if Phase 09 is never interrupted and verification is run before treating the rollout as complete; the documented resume invariant is still broken for BAN/Banny.

Recommended fix:

- In both `Deploy.s.sol` and `Resume.s.sol`, replace the project-`4` generic skip with the same canonical identity gate used elsewhere.
- If project `4` is configured and `_isCanonicalConfiguredProject(4)` / a Deploy-side BAN equivalent returns false, revert with `ProjectNotCanonical(4)` instead of skipping.
- Keep the current `Verify.s.sol` BAN/Banny checks as the post-deploy backstop, but do not rely on verification to discover an unrecoverable resume state.
- Update the deploy runbook after the code fix so operators do not treat count/controller checks as sufficient project-identity proof.

### B. `deploy-all-v6`: deployment imports resolve to stale npm packages instead of audited sibling repos

Severity: `HIGH`

Status: OPEN. The current working tree has audited sibling repos on newer package versions, but `deploy-all-v6` compiles imports from `node_modules`.

Affected code and config:

- [package.json](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/package.json:35)
- [foundry.toml](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/foundry.toml:6)
- [remappings.txt](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/remappings.txt:1)
- [package-lock.json](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/package-lock.json:13)

Why it is real:

- `forge remappings` in `deploy-all-v6` resolves `@bananapus/`, `@rev-net/`, `@croptop/`, `@ballkidz/`, and `@bannynet/` to `node_modules`, not to the sibling repos in the top-level workspace.
- The installed package versions are behind the sibling repo versions. Current examples: `@bananapus/core-v6` is installed at `0.0.39` while `nana-core-v6` is `0.0.41`; `@rev-net/core-v6` is installed at `0.0.40` while `revnet-core-v6` is `0.0.41`; `@bananapus/router-terminal-v6` is installed at `0.0.36` while `nana-router-terminal-v6` is `0.0.37`; `@bananapus/721-hook-v6` is installed at `0.0.43` while `nana-721-hook-v6` is `0.0.45`; `@bananapus/suckers-v6` is installed at `0.0.34` while `nana-suckers-v6` is `0.0.36`; `@bananapus/buyback-hook-v6` is installed at `0.0.37` while `nana-buyback-hook-v6` is `0.0.38`; `@bananapus/distributor-v6` is installed at `0.0.9` while `nana-distributor-v6` is `0.0.10`; `@bananapus/omnichain-deployers-v6` is installed at `0.0.35` while `nana-omnichain-deployers-v6` is `0.0.37`; `@croptop/core-v6` is installed at `0.0.40` while `croptop-core-v6` is `0.0.41`; `@bannynet/core-v6` is installed at `0.0.26` while `banny-retail-v6` is `0.0.27`; `@ballkidz/defifa` is installed at `0.0.27` while `defifa` is `0.0.28`.
- Directory diffs confirm source drift between sibling repos and deployed import packages, including `nana-core-v6/src`, `revnet-core-v6/src`, `nana-router-terminal-v6/src`, `nana-suckers-v6/src`, `nana-721-hook-v6/src`, `nana-buyback-hook-v6/src`, `nana-distributor-v6/src`, `nana-omnichain-deployers-v6/src`, `defifa/src`, `banny-retail-v6/src`, and `croptop-core-v6/src`.
- The drift touches high-impact files involved in previous review fixes and deployment checks, including `JBSplits.sol`, `JBMultiTerminal.sol`, `REVDeployer.sol`, `REVLoans.sol`, `REVOwner.sol`, `JBRouterTerminal.sol`, `JBSuckerRegistry.sol`, `JBSucker.sol`, `JB721TiersHook.sol`, `JBBuybackHook.sol`, `DefifaDeployer.sol`, `DefifaHook.sol`, and `CTDeployer.sol`.
- `forge build` succeeds in `deploy-all-v6` against this graph, so the drift does not fail closed at compile time.
- This contradicts the intended deployment assumption that `deploy-all-v6` deploys the patched ecosystem state from the sibling working copies.

Impact:

- A one-shot deployment run from `deploy-all-v6` can compile and deploy stale contract code even when the top-level submodules contain patched audited code.
- Any fix that exists only in the sibling repo version, but has not been published and pinned in `deploy-all-v6`, is absent from the immutable rollout.
- Tests run inside sibling repos can pass while the deployment script still emits old bytecode from `node_modules`, giving a false sense of deployment readiness.

Recommended fix:

- For the pre-deploy rehearsal and final deployment, make `deploy-all-v6` resolve every first-party package to the audited sibling working copy, either with explicit Foundry remappings or `file:` dependencies.
- Alternatively publish every patched first-party package, bump `deploy-all-v6/package.json`, regenerate `package-lock.json`, reinstall, and verify the installed versions match the sibling repo versions exactly.
- Add a CI/release gate that compares first-party dependency versions and import roots before allowing `deploy-all-v6` deployment artifacts to be treated as canonical.

### C. `deploy-all-v6`: verifier loads `VERIFY_SAFE` but never checks Safe ownership/admin convergence

Severity: `HIGH`

Status: OPEN. `Verify.s.sol` reads an expected Safe address, but no verification category uses it.

Affected code and docs:

- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:160)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:309)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:595)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:824)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:988)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2007)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:227)

Why it is real:

- `Verify.s.sol` declares `expectedSafe` as the "Optional canonical Safe owner to assert during verification" and loads it from `VERIFY_SAFE`.
- `rg` confirms the only other `expectedSafe` references are the declaration and the env load. The verifier has no Safe ownership/admin verification category; its owner-like checks are component-local checks such as `REVDeployer.OWNER() == REVOwner` and `DefifaGovernor.owner() == DefifaDeployer`.
- Fresh recheck: `rg -n "VERIFY_SAFE|expectedSafe|owner\\(\\)|ownerOf" script/Verify.s.sol` still shows `expectedSafe` only at the declaration and env load, not in any `owner()` / admin assertion.
- The deployment path intentionally assigns the Safe as owner/configurator across critical singletons and registries, including `JBProjects`, `JBDirectory`, `JBPrices`, `JBFeelessAddresses`, `JBBuybackHookRegistry`, `JBRouterTerminalRegistry`, `JBSuckerRegistry`, first-party sucker deployers, and `REVLoans`.
- The deploy risk register explicitly treats "Sphinx Safe address is the owner/admin of all ownable contracts" as a mandatory post-deploy verification item.

Impact:

- A deployment can pass the automated verifier while the wrong Safe, stale Safe, or unexpected operator address owns critical admin surfaces.
- Those owners can mutate protocol-wide defaults and allowlists, including first-controller allowlisting, fee exemptions, buyback hooks, router terminal defaults, sucker deployers, remote fees, price-feed additions, and loan/project metadata resolvers.
- This creates false confidence for the one-shot immutable rollout: the verifier validates wiring but not the admin boundary that is supposed to control that wiring after deployment or resume.

Recommended fix:

- If `VERIFY_SAFE` is set, make `Verify.s.sol` fail closed unless every Safe-owned contract has `owner() == expectedSafe`.
- Cover at least `projects`, `directory`, `prices`, `feelessAddresses`, `buybackRegistry`, `routerTerminalRegistry`, `suckerRegistry`, `revLoans`, and the configured first-party sucker deployers where the owner/configurator is the Safe.
- On production chains, require `VERIFY_SAFE != address(0)` instead of making this check optional.
- Keep separate canonical project NFT ownership checks pointing at `REVDeployer`; do not reuse `VERIFY_SAFE` for project NFT owner assertions.

### D. `revnet-core-v6`: hidden tokens still leave cash-out/loan denominators while remaining revealable

Severity: `HIGH`

Status: ACCEPTED. Hidden balances are recoverable claims and remain in cash-out and loan denominators by design. See `revnet-core-v6/RISKS.md` §4. The trust assumption is documented: `HIDE_TOKENS` / hide allowlisting authorizes holders to remove their tokens from everyone else's economic denominator and later restore them.

Affected code:

- [REVHiddenTokens.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVHiddenTokens.sol:79)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:385)
- [REVOwner.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVOwner.sol:195)
- [REVLoans.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVLoans.sol:360)
- [HiddenSupplyCashout.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/regression/HiddenSupplyCashout.t.sol:9)
- [HiddenSupplyLoanBorrow.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/regression/HiddenSupplyLoanBorrow.t.sol:14)

Why it is real:

- `REVHiddenTokens.hideTokensOf(...)` burns a holder's live tokens and tracks them in `hiddenBalanceOf` / `totalHiddenOf`; `revealTokensOf(...)` later re-mints that tranche.
- `REVDeployer` grants `HIDE_TOKENS` to the split operator by default, and `REVHiddenTokens` lets a holder hide their own tokens if the holder is allowlisted or has that permission.
- `REVOwner.beforeCashOutRecordedWith(...)` builds the cash-out denominator from `context.totalSupply`, local loan collateral, and remote supply, but not local hidden supply.
- `REVLoans._borrowableAmountFrom(...)` likewise sets `localSupply = totalSupply + totalCollateral`, and the source comment states that hidden tokens are intentionally excluded from borrowing math.
- The `REVHiddenTokens` contract header still says `REVOwner` and `REVLoans` add hidden supply back into economic denominators, which contradicts the current implementation and the passing design-assertion tests.
- The current review tests pass while asserting `test_hiddenSupplyIsExcludedFromCashoutDenominatorByDesign()` and `test_hiddenSupplyIsExcludedFromLoanCapacityByDesign()`.
- Command evidence: `forge test --match-path 'test/regression/HiddenSupply*.t.sol' -vv` in `revnet-core-v6` passes 16 tests, including the two design-assertion tests above.

Impact:

- Any holder with hide authority can hide part of its balance, cash out or borrow against the now-smaller visible denominator, and then reveal the hidden tranche afterward.
- This gives the visible tranche an outsized claim on revnet treasury value without permanently burning the hidden tranche.
- If the split operator or a token-hiding allowlist entry is compromised or economically self-interested, the permission becomes a treasury-extraction primitive rather than only a visibility/security handle.

Recommended fix:

- If hidden balances are not meant to be spendable economic inventory, make hiding irreversible or subject to a delay/settlement rule that prevents hide-cashout/borrow-reveal sequences.
- If hidden balances are meant to remain revealable, include `totalHiddenOf(revnetId)` in both cash-out and loan denominators.
- If the current design is intentionally accepted, document the trust assumption explicitly: `HIDE_TOKENS` / hide allowlisting authorizes holders to remove their tokens from everyone else's economic denominator and later restore them.
- In either case, update the `REVHiddenTokens` header comment so developer-facing docs match the chosen denominator behavior.

### E. `revnet-core-v6`: configuration hash still excludes split-operator authority and reserved split routing

Severity: `MED`

Status: ACCEPTED. Reserved-token split recipients are intentionally excluded from the configuration hash. See `revnet-core-v6/RISKS.md` §8. Splits can be reconfigured by the split operator without changing the revnet's economic configuration identity.

Affected code:

- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:943)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:1008)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:1012)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:1066)
- [WeakConfigurationHash.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/regression/WeakConfigurationHash.t.sol:25)
- [WeakConfigurationHash.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/regression/WeakConfigurationHash.t.sol:51)

Why it is real:

- `_makeRulesetConfigurations(...)` currently builds `encodedConfigurationHash` from base currency, name, ticker, description salt, terminal addresses, selected stage timing/economic fields, `extraMetadata`, and auto-issuances.
- The source comment explicitly excludes reserved-token split recipients and weights because split routing can change over time.
- The hash still omits `configuration.splitOperator` even though that address receives default operator powers, including sucker deployment, buyback/router configuration, split updates, token metadata, and `HIDE_TOKENS`.
- `forge test --match-path test/regression/WeakConfigurationHash.t.sol -vv` passes 7 tests, including `test_configurationHashExcludesSplitOperatorAuthority()` and `test_configurationHashExcludesReservedSplitRouting()`, while also confirming terminal addresses/order and `extraMetadata` remain inside the hash.

Impact:

- Two materially different revnets can share `hashedEncodedConfigurationOf(...)` while assigning different split-operator authority or reserved issuance routing.
- Cross-chain operators and tooling that treat the hash as the revnet equivalence commitment can pair or approve deployments that preserve core economics but change authority and distribution surfaces.
- If the hash is intentionally only an economics/policy commitment, the current name and downstream use as a configuration identity can overstate what it proves.

Recommended fix:

- If the hash is meant to prove cross-chain revnet equivalence, include `configuration.splitOperator` and the reserved split routing fields, or add a separate authority/routing commitment that must match for default omnichain pairing.
- If split routing is intentionally mutable and outside equivalence, document that `hashedEncodedConfigurationOf(...)` does not authenticate operator authority or reserved split destinations, and require deployment tooling to verify those fields separately.

### F. `deploy-all-v6`: verifier does not fail closed on immutable Chainlink feed and sequencer provenance

Severity: `HIGH`

Status: OPEN. `Verify.s.sol` proves price-feed liveness and broad sanity ranges, but not that the deployed wrappers contain the intended immutable Chainlink aggregators, thresholds, and L2 sequencer feeds.

Affected code and docs:

- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:983)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:1040)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:1048)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:1081)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:1099)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:1350)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:1378)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:1622)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:1781)
- [DEPLOY.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/DEPLOY.md:207)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:81)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:202)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:204)

Why it is real:

- The deploy risk register classifies wrong Chainlink feed addresses as `CRITICAL` and requires cross-referencing every ETH/USD and USDC/USD feed, L2 sequencer feed, and staleness threshold before proposal approval.
- `Verify.s.sol` currently checks that ETH/USD and USDC/USD feeds are configured and return prices inside broad bounds, but a wrong aggregator that returns plausible data can satisfy those checks.
- The same checklist requires `JBPrices` feeds for `USD/NATIVE_TOKEN`, `USD/ETH`, `ETH/NATIVE_TOKEN`, and `USD/USDC`, but the verifier treats the `USD/ETH` feed check as non-critical. A missing `USD/ETH` feed records a failed check without reverting.
- The only provenance check is mainnet ETH/USD, and that check is `critical: false`.
- `_check(...)` increments `_failed` for non-critical failures, but only reverts when `critical == true`; `_printSummary()` then prints `SOME CHECKS FAILED` without reverting. Any operator or CI wrapper that relies on the verifier's process exit can therefore green-light a deployment with warning-only oracle provenance failures.
- `DEPLOY.md` tells operators that any `FAIL` triggers a revert, which is false for these warning-only oracle checks.
- The verifier does not assert the expected inner `FEED()` for every chain, does not assert `THRESHOLD()`, and does not assert `SEQUENCER_FEED()` / `GRACE_PERIOD_TIME()` for Optimism, Base, and Arbitrum mainnets.
- Fresh recheck: `JBChainlinkV3PriceFeed` and `JBChainlinkV3SequencerPriceFeed` still expose the needed immutable getters, but `Verify.s.sol` only dereferences `FEED()` for mainnet ETH/USD and marks that check non-critical; there are still no critical per-chain `THRESHOLD()`, `SEQUENCER_FEED()`, or `GRACE_PERIOD_TIME()` manifest checks.
- `JBPrices` feed additions are immutable at the default level, so discovering a wrong wrapper after deployment requires project-specific overrides or redeployment rather than a normal admin fix.

Impact:

- A one-shot deployment can pass verification while using a wrong-but-live Chainlink aggregator, wrong staleness threshold, or non-sequencer wrapper on an L2 mainnet.
- It can also exit successfully while the required `USD/ETH` default feed is absent or the only ETH/USD aggregator-provenance check fails, because those checks are currently warning-only.
- If a feed is for the wrong asset or wrong chain but returns plausible values, multi-currency payouts, allowances, cash-outs, and routing can be permanently mispriced.
- If an L2 mainnet feed omits sequencer protection, protocol operations can keep using stale oracle data during or shortly after sequencer outages.

Recommended fix:

- Add a per-chain expected oracle manifest to `Verify.s.sol` for all supported chains and both ETH/USD and USDC/USD feeds.
- For each deployed wrapper, assert `FEED()`, `THRESHOLD()`, wrapper type, and, where applicable, `SEQUENCER_FEED()` and `GRACE_PERIOD_TIME()`.
- Make every risk-checklist feed-presence requirement critical, including the `USD/ETH` default feed.
- Make oracle provenance checks critical on production chains, and fail if a supported chain lacks a manifest entry.
- Keep the current live price sanity checks as additional liveness checks, not as a substitute for provenance.

### G. `deploy-all-v6`: verifier does not authenticate immutable Uniswap, Permit2, bridge, CCIP, and Defifa typeface external addresses

Severity: `HIGH`

Status: OPEN. The deploy risk register names these external addresses as hardcoded, per-chain deployment hazards, but `Verify.s.sol` only checks broad presence and internal Juicebox wiring.

Affected code and docs:

- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:176)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:486)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:493)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:840)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:879)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:941)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:1332)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:1430)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2765)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:716)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:780)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:954)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:1172)
- [DEPLOY.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/DEPLOY.md:52)
- [DEPLOY.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/DEPLOY.md:219)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:25)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:97)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:98)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:114)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:220)
- [DefifaTokenUriResolver.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaTokenUriResolver.sol:39)

Why it is real:

- `Deploy.s.sol` hardcodes Permit2 and per-chain WETH, Uniswap V3 Factory, Uniswap V4 PoolManager, and Uniswap V4 PositionManager addresses, then passes them into `JBMultiTerminal`, `JBUniswapV4Hook`, `JBBuybackHook`, `JBRouterTerminal`, and `JBUniswapV4LPSplitHook`.
- `Deploy.s.sol` also hardcodes a per-chain `_typeface` address, passes it into `DefifaTokenUriResolver`, and `DefifaTokenUriResolver.TYPEFACE()` stores that external renderer dependency immutably for Defifa NFT metadata.
- The CCIP path deploys one deployer per remote chain and one-time-sets `remoteChainId`, `remoteChainSelector`, and the local `ccipRouter`; deployed `JBCCIPSucker` instances then copy those values into immutable `REMOTE_CHAIN_ID`, `REMOTE_CHAIN_SELECTOR`, and `CCIP_ROUTER` fields.
- The deploy risk register explicitly calls out hardcoded Uniswap, WETH, Chainlink, bridge, CCIP router, and Permit2 addresses as permanent misconfiguration risks, and requires bridge contracts, CCIP selectors, and CCIP routers to be verified per chain. `DEPLOY.md` separately tells operators to confirm the chain-specific typeface and lists typeface among external dependencies to verify.
- `Verify.s.sol` currently checks that the buyback registry has a default hook, the router terminal registry has a default terminal, the router terminal is feeless, the omnichain deployer / sucker registry point at each other, and project terminal lists include the router terminal registry.
- The verifier does not compare `terminal.PERMIT2()`, `routerTerminal.WETH()`, `routerTerminal.FACTORY()`, `routerTerminal.POOL_MANAGER()`, `routerTerminal.PERMIT2()`, buyback-hook `POOL_MANAGER()` / `ORACLE_HOOK()`, Uniswap V4 oracle-hook `DIRECTORY()` / `TOKENS()` / `PRICES()` / PoolManager, LP-split-hook `POOL_MANAGER()` / `POSITION_MANAGER()` / `PERMIT2()` / `ORACLE_HOOK()`, sucker deployer bridge constants, CCIP router / selector getters, or `DefifaTokenUriResolver.TYPEFACE()` against a per-chain expected manifest.
- Fresh recheck: `Verify.s.sol` still only checks router/buyback/sucker presence, Defifa token URI resolver code length, and internal Juicebox wiring. It contains no `VERIFY_BUYBACK_HOOK`, `VERIFY_UNIV4_HOOK`, `VERIFY_LP_SPLIT_HOOK`, `VERIFY_LP_SPLIT_HOOK_DEPLOYER`, `VERIFY_TYPEFACE`, `WETH()`, `FACTORY()`, `POOL_MANAGER()`, `PERMIT2()`, `POSITION_MANAGER()`, `TYPEFACE()`, bridge, CCIP router, or selector assertions against expected per-chain constants.
- Fresh Phase 03b-03e diff on 2026-05-06 confirms `Deploy.s.sol` deploys `JBUniswapV4Hook`, `JBBuybackHook`, `JBRouterTerminal`, `JBUniswapV4LPSplitHook`, and `JBUniswapV4LPSplitHookDeployer`, while Category 5 only checks that `buybackRegistry.defaultHook()` and `routerTerminalRegistry.defaultTerminal()` are nonzero / expected. It never proves the default buyback hook equals the deployed `JBBuybackHook`, never proves the router terminal's immutable hooks/external addresses, and never loads the LP split hook or LP split hook deployer at all.

Impact:

- A one-shot deployment can pass post-deploy verification while routing swaps, LP initialization, wrapped native payments, bridge sends, or CCIP messages through a wrong-but-live external contract.
- For Uniswap and WETH inputs, the bad address is part of CREATE2 init code and constructor state; fixing it requires redeployment with new salts or a new deployment path.
- For CCIP, a wrong selector or router can bake bad immutable values into the singleton `JBCCIPSucker`, so the deployer being configured does not prove deployed suckers route to the intended remote chain.
- For Defifa, a wrong typeface can make token URI rendering revert or produce non-canonical on-chain metadata for every game launched through the verified Defifa deployer.
- This creates the same false-confidence issue as the oracle gap: liveness and internal wiring checks do not prove the immutable external trust boundary is canonical.

Recommended fix:

- Add a per-chain external-address manifest to `Verify.s.sol` covering Permit2, WETH, Uniswap V3 Factory, V4 PoolManager, V4 PositionManager, OP messenger / bridge, Arbitrum inbox / gateway router, CCIP router, remote chain IDs, CCIP selectors, and the Defifa typeface.
- Add verifier inputs or deterministic address derivation for the deployed Uniswap V4 oracle hook, buyback hook, LP split hook, and LP split hook deployer.
- Assert exposed getters on `JBMultiTerminal`, `JBUniswapV4Hook`, `JBBuybackHook`, `JBRouterTerminal`, `JBUniswapV4LPSplitHook`, `JBUniswapV4LPSplitHookDeployer`, first-party bridge deployers, CCIP deployers, deployed CCIP sucker singletons, and `DefifaTokenUriResolver` against that manifest.
- Make these checks critical on production chains and fail if a supported production chain lacks a complete manifest entry.
- Keep intentional omissions explicit, such as Optimism Sepolia skipping the Uniswap-dependent stack because no canonical `PositionManager` is published.

### H. `deploy-all-v6`: Defifa verifier expects the wrong hook store and misses hook-origin directory wiring

Severity: `HIGH`

Status: OPEN. A correct full deployment of Phase 10 cannot satisfy the current `Verify.s.sol` Defifa hook-store assertion. The same Defifa verification category also under-checks the hook code origin that every launched Defifa game will clone.

Affected code:

- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2799)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2810)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2830)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2878)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2889)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:273)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:930)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:936)
- [DefifaDeployer.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/node_modules/@ballkidz/defifa/src/DefifaDeployer.sol:296)
- [DefifaHook.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaHook.sol:490)
- [JB721Hook.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/abstract/JB721Hook.sol:43)

Why it is real:

- `Deploy.s.sol` deploys a dedicated `JB721TiersHookStore` for Defifa game NFT tiers under `DEFIFA_SALT`, stores it in `_defifaHookStore`, and passes that dedicated store into the `DefifaDeployer` constructor.
- `Resume.s.sol` mirrors the same dedicated-store deployment and constructor argument, so this is the intended clean-deploy and recovery topology.
- `DefifaDeployer.HOOK_STORE()` is immutable and returns the constructor `_hookStore`.
- `Verify.s.sol` only loads one `VERIFY_HOOK_STORE` address, which is the shared 721 hook store used by the canonical 721 hook stack and by Banny's hook identity check.
- The Defifa verification category then asserts `address(defifaDeployer.HOOK_STORE()) == address(hookStore)`, where `hookStore` is that shared `VERIFY_HOOK_STORE`.
- Fresh recheck: `Deploy.s.sol` and `Resume.s.sol` still create `_defifaHookStore` with `DEFIFA_SALT` and pass it into `DefifaDeployer`, while `Verify.s.sol` still checks `defifaDeployer.HOOK_STORE() == hookStore` with no `VERIFY_DEFIFA_HOOK_STORE`.
- `DefifaHook` inherits `JB721Hook.DIRECTORY()` and uses that directory to authorize terminal callbacks. `Verify.s.sol` checks the hook code origin's `DEFIFA_TOKEN()` and `BASE_PROTOCOL_TOKEN()`, but not `DIRECTORY()` or `CODE_ORIGIN()`.
- A hook origin with the right fee-token getters but a wrong directory can therefore satisfy the current hook-origin verifier checks while cloning games whose callback authorization points at the wrong terminal registry.

Impact:

- On production chains, `VERIFY_DEFIFA_DEPLOYER` is required, so a full deployment that correctly uses the dedicated Defifa hook store will fail the verifier's critical Defifa hook-store check.
- Feeding `VERIFY_HOOK_STORE` as the Defifa store is not a workaround because the same variable is also needed for the shared 721 hook stack and Banny hook-store assertions.
- This makes the post-deploy verification gate internally inconsistent: operators either cannot get a clean verifier result after the intended deployment, or they must ignore a critical verifier failure before accepting an immutable rollout.
- Even after the store mismatch is fixed, a verifier run that only checks hook-origin fee tokens can still miss the directory used by Defifa game hook clones for terminal-callback authorization.

Recommended fix:

- Add a separate `VERIFY_DEFIFA_HOOK_STORE` env var and assert `defifaDeployer.HOOK_STORE() == VERIFY_DEFIFA_HOOK_STORE`.
- Also assert the dedicated Defifa hook store has code.
- For the hook code origin, assert `DefifaHook(hookCodeOrigin).DIRECTORY() == directory`, `CODE_ORIGIN() == hookCodeOrigin`, `DEFIFA_TOKEN() == tokens.tokenOf(3)`, and `BASE_PROTOCOL_TOKEN() == tokens.tokenOf(1)`.
- Keep `VERIFY_HOOK_STORE` scoped to the shared 721 hook stack and Banny hook checks.
- Add deploy/full-stack verifier regressions that prove a clean Phase 10 deployment passes `Verify.s.sol` without reusing the shared hook store and fails if the hook code origin points at a wrong directory.

### I. `deploy-all-v6` + `nana-fee-project-deployer-v6`: deployment tooling does not authenticate immutable project `1-4` economics, native primary routing, or BAN/Banny manifest

Severity: `HIGH`

Status: OPEN. Fresh recheck on 2026-05-06 confirms `Verify.s.sol` still checks that each canonical revnet has a nonzero configuration hash, but does not compare that hash or the underlying rulesets against the intended NANA/CPN/REV/BAN economic manifest. The standalone fee-project deployer has the same class of weak canonical-skip guard for project `1`.

Affected code and docs:

- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:434)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:507)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:1195)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2207)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2380)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2515)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:271)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:278)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:285)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:292)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2126)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2237)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2406)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2537)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2970)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:3091)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:928)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:1042)
- [JBDirectory.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBDirectory.sol:265)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/nana-fee-project-deployer-v6/script/Deploy.s.sol:214)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/nana-fee-project-deployer-v6/script/Deploy.s.sol:233)
- [RegressionCanonicalGuard.t.sol](/Users/jango/Documents/jb/v6/evm/nana-fee-project-deployer-v6/test/regression/RegressionCanonicalGuard.t.sol:28)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:132)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:133)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:213)

Why it is real:

- `Deploy.s.sol` pins immutable revnet stage parameters for NANA, CPN, REV, and BAN: historical start timestamps, auto-issuance amounts per chain, split percentages, initial issuance, issuance cut frequency / percent, cash-out tax, and `extraMetadata`.
- As of May 6, 2026, the `REV` / `NANA` / `CPN` start time `1740089444` is February 20, 2025, and the `BAN` start time `1740435044` is February 24, 2025.
- Those dates materially affect the live deployment state. By May 6, 2026, `REV` / `CPN` have already crossed four 90-day 38% issuance-cut cycles, `NANA` has crossed one 360-day 38% cycle, and `BAN` is already in its second stage with three 21-day 7% cuts behind it.
- `REVDeployer._makeRulesetConfigurations(...)` commits many of these fields into `hashedEncodedConfigurationOf(...)`, and stores auto-issuance allowances under ruleset IDs derived at deploy time.
- `Deploy.s.sol._isCanonicalRevnetProject(...)` and `Resume.s.sol._isCanonicalConfiguredProject(...)` use owner/controller/nonzero-config-hash/symbol-style checks when deciding whether an existing configured project can be treated as canonical, so the same weak manifest proof can also turn into a deployment skip, not only a verifier false positive.
- `Verify.s.sol` only asserts `revDeployer.hashedEncodedConfigurationOf(projectId) != bytes32(0)` and the ERC-20 symbol for each canonical project. It does not compare against an expected hash, stage starts, current ruleset start / weight / cash-out tax, split percent, auto-issuance amount, or deploy-time stage ID manifest.
- `Deploy.s.sol` builds every canonical revnet with `_terminal` as the first native accounting terminal and the router terminal registry as an optional second terminal, so the intended native primary route is the core `JBMultiTerminal` for all projects `1-4`.
- `Verify.s.sol` only checks that each canonical project has some nonzero native primary terminal and that its terminal list contains `JBMultiTerminal`; the exact `primaryTerminalOf(projectId, NATIVE_TOKEN) == terminal` assertion is only made for NANA/project `1`.
- `JBDirectory.primaryTerminalOf(...)` returns an explicitly set primary terminal when present and otherwise falls back to the first terminal that accepts the token, so terminal order and explicit primary-terminal state are part of the effective project routing manifest.
- `nana-fee-project-deployer-v6/script/Deploy.s.sol` skips project `1` when it is REVDeployer-owned, controlled by the expected controller, has any nonzero `hashedEncodedConfigurationOf(1)`, and exposes token symbol `NANA`; it does not compare the exact fee-project economics or assert `revnet.basic_deployer.FEE_REVNET_ID() == 1`.
- Fresh recheck: `rg` over `Verify.s.sol` still finds no expected project-hash, live ruleset, auto-issuance, Banny resolver, Banny contract URI, pricing context, or tier-manifest assertions. It still shows `primaryTerminalOf(..., NATIVE_TOKEN) == terminal` only for NANA/project `1`.
- `forge test --match-path 'test/regression/RegressionCanonicalGuard.t.sol' -vv` passes in `nana-fee-project-deployer-v6`, proving that standalone guard accepts an arbitrary nonzero project-`1` config hash plus a mismatched fee-revnet dependency.
- `forge test --match-path 'test/regression/Resume*Squat.t.sol' -vv` passes in `deploy-all-v6`, proving current resume paths still accept configured attacker-owned/superficially canonical projects `2`, `3`, and `4` in the documented scenarios.
- The BAN/Banny-specific checks stop at project identity plus hook `PROJECT_ID`, shared hook store, and symbol. They do not prove that the Banny hook uses the intended token URI resolver, contract URI, pricing context, body-tier prices/supplies/categories/flags, or that the resolver still has the intended owner, trusted forwarder, description, external URL, and base URI.
- The deploy risk register explicitly flags past revnet start times, large auto-issuance amounts, and revnet stage parameters as must-verify deployment risks.

Impact:

- A deployment can pass verification while NANA, CPN, REV, or BAN have wrong immutable economics, wrong auto-issuance quantities, wrong split percentages, wrong current stage, unintended already-decayed issuance weight, or a BAN/Banny 721 hook that exposes the wrong retail tiers or metadata resolver.
- A deployment can also pass while CPN, REV, or BAN have a nonzero but unintended native primary terminal, as long as `JBMultiTerminal` remains somewhere in the terminal list. That is enough to change where default native payments and fee/surplus flows route, without failing the current verifier.
- Because the starts are already historical, this is easy to misunderstand operationally: a "fresh" 2026 deployment does not start at day zero for all project economics, and the verifier does not make that visible.
- Operators and downstream developers can get a green canonical-project identity check without proving the deployed projects match the tokenomics they intend to publish and build against.
- The standalone fee-project deployer can also skip over a non-canonical project `1` that looks superficially like NANA, leaving fee receivers and downstream packages anchored to the wrong protocol-fee economics.

Recommended fix:

- Add a per-project economic manifest to `Verify.s.sol` for projects `1-4`.
- Compare `hashedEncodedConfigurationOf(projectId)` against expected values computed from the final deployment manifest, while separately covering fields that the hash currently excludes per Current Open Edge Case E.
- Verify current and upcoming `JBRulesets` for each project: `start`, `duration`, `weight`, `weightCutPercent`, `cashOutTaxRate`, reserved/split percent, metadata, and stage count.
- Verify auto-issuance allowances for every intended `(projectId, stageId, chainId, beneficiary)` tuple and make the stage IDs explicit in deployment artifacts.
- Verify the effective native primary terminal and exact terminal list/order for each canonical project, not just nonzero primary presence or list membership.
- For BAN/Banny, additionally verify `hookStore.tokenUriResolverOf(address(bannyHook))`, `bannyHook.contractURI()`, `bannyHook.pricingContext()`, the first four body tiers returned by `hookStore.tiersOf(...)`, and the `Banny721TokenUriResolver` owner / trusted-forwarder / metadata fields against the deploy manifest.
- Print the current live stage and already-applied cut count for NANA, CPN, REV, and BAN during verification so operators cannot miss the historical-start-time effect.
- Mirror the exact project-`1` manifest checks in `nana-fee-project-deployer-v6`; at minimum, reject any existing project `1` whose expected configuration hash, fee-revnet dependency, split operator, terminal list/order, auto-issuance entries, or live ruleset state differs from the canonical fee-project manifest.

### J. `deploy-all-v6` + `croptop-core-v6`: Croptop verifier/wiring gaps and publisher currency assumptions

Severity: `HIGH`

Status: OPEN. Phase 06 deploys the Croptop publisher, deployer, and project-owner helper, but `Verify.s.sol` only uses the publisher indirectly and never checks the deployer or project owner after loading them. The publisher also treats 721 tier prices as native ETH/18-decimal values, so non-ETH/non-18-decimal hook pricing, missing native/ETH price feeds, or miswired fee-project currency state can break or silently refund Croptop fee collection.

Affected code and docs:

- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:295)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:847)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:1942)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:1959)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:1982)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:1957)
- [CTPublisher.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/node_modules/@croptop/core-v6/src/CTPublisher.sol:62)
- [CTDeployer.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/node_modules/@croptop/core-v6/src/CTDeployer.sol:61)
- [CTProjectOwner.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/node_modules/@croptop/core-v6/src/CTProjectOwner.sol:25)
- [CTPublisher.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/src/CTPublisher.sol:220)
- [CTPublisher.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/src/CTPublisher.sol:290)
- [CTDeployer.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/src/CTDeployer.sol:184)
- [RegressionCurrencyPoCs.t.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/test/regression/RegressionCurrencyPoCs.t.sol:94)
- [RegressionCurrencyPoCs.t.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/test/regression/RegressionCurrencyPoCs.t.sol:125)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:60)

Why it is real:

- `Deploy.s.sol` Phase 06 creates `CTPublisher`, `CTDeployer`, and `CTProjectOwner`.
- `Verify.s.sol` reads `VERIFY_CT_PUBLISHER`, `VERIFY_CT_DEPLOYER`, and `VERIFY_CT_PROJECT_OWNER` as required env vars, but `rg` shows `ctDeployer` and `ctProjectOwner` are never referenced again.
- `ctPublisher` is only used in the later `REVDeployer.PUBLISHER() == ctPublisher` check. That proves the revnet deployer points to the supplied publisher address, but not that the publisher itself has the intended Croptop wiring.
- The Croptop contracts expose immutable getters that are straightforward to verify: `CTPublisher.DIRECTORY()` and `FEE_PROJECT_ID()`, `CTDeployer.PROJECTS()`, `DEPLOYER()`, `PUBLISHER()`, `SUCKER_REGISTRY()`, and `CTProjectOwner.PERMISSIONS()`, `PROJECTS()`, `PUBLISHER()`.
- `CTPublisher.mintFrom(...)` computes `fee = totalPrice / FEE_DIVISOR`, requires `msg.value` against `totalPrice + fee`, and pays the project's native terminal with `payValue`. It does not convert the hook tier currency/decimals into native ETH before comparing against `msg.value`, and `configurePostingCriteriaFor(...)` stores category minimum prices without reading or binding the hook's tier currency/decimals.
- `CTDeployer`-launched Croptop projects currently use `currency: JBCurrencyIds.ETH` and `decimals: 18`, but `CTPublisher` is a generic public publisher for any permissioned 721 hook. A directly configured hook priced in USD/6-decimal units can therefore satisfy the publisher's ETH payment checks with a tiny wei amount.
- Scope recheck: `forge test --match-path test/regression/RegressionCurrencyPoCs.t.sol -vv` passes in `croptop-core-v6`. The suite proves that a CTDeployer-launched Croptop project with native-token terminal accounting reverts until an undeclared native-token/ETH identity price feed is added, and that a fee-project currency mismatch lets the target post succeed while the 5% Croptop fee is refunded to the caller instead of credited to the fee project.

Impact:

- A post-deploy verifier run can pass while `VERIFY_CT_DEPLOYER` or `VERIFY_CT_PROJECT_OWNER` is an arbitrary nonzero address, including an EOA, because those values are loaded but unused.
- A deployment can also pass while the Croptop publisher has wrong immutable fee-project or directory wiring, as long as `REVDeployer.PUBLISHER()` points to that same address.
- This weakens the acceptance gate for the Croptop / CPN user surface: project creation, posting, publisher fees, project-owner permission handoff, and sucker-backed Croptop deployments are not proven by the automated verifier.
- The canonical `CTDeployer` path avoids the currency mismatch today, but the deployed publisher remains an opt-in product surface for other 721 hooks. Once immutable, hook owners can misconfigure a non-ETH hook and underpay both the target project and Croptop fee project.
- A deployment can also pass while Croptop posting depends on an unverified `JBPrices` feed, or while CPN's fee-project ruleset / terminal currency setup causes every publish fee to refund even though the target NFT post succeeds.

Recommended fix:

- Add a dedicated Croptop verification category.
- Assert `ctPublisher`, `ctDeployer`, and `ctProjectOwner` all have code.
- Assert `CTPublisher.DIRECTORY() == directory` and `CTPublisher.FEE_PROJECT_ID() == 2`.
- Assert `CTDeployer.PROJECTS() == projects`, `CTDeployer.DEPLOYER() == hookDeployer`, `CTDeployer.PUBLISHER() == ctPublisher`, and `CTDeployer.SUCKER_REGISTRY() == suckerRegistry`.
- Assert `CTProjectOwner.PERMISSIONS() == permissions`, `CTProjectOwner.PROJECTS() == projects`, and `CTProjectOwner.PUBLISHER() == ctPublisher`.
- Assert the Croptop fee project has the intended current ruleset base currency, native terminal accounting context, and any required `JBPrices` identity feeds, then dry-run or simulate a publish and prove both the target project and CPN fee project balances increase by the expected amounts.
- Add a verifier regression that proves arbitrary `VERIFY_CT_DEPLOYER` / `VERIFY_CT_PROJECT_OWNER` values fail instead of being silently ignored.
- Either restrict `CTPublisher.configurePostingCriteriaFor(...)` / `mintFrom(...)` to ETH/18-decimal hooks, or convert each hook tier price into native-token value with `JBPrices` before checking `msg.value` and paying the native terminal.

### K. `deploy-all-v6`: sucker deployer allowlist verification is optional and cannot prove expected per-chain coverage

Severity: `HIGH`

Status: OPEN. `Verify.s.sol` can skip all sucker-deployer allowlist checks on production chains, and when the env var is provided it only proves the listed subset is allowed.

Affected code and docs:

- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:1118)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:1006)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:1067)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:1332)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:1107)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:41)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:198)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:222)

Why it is real:

- `Deploy.s.sol` and `Resume.s.sol` push each deployed native bridge / CCIP sucker deployer into `_preApprovedSuckerDeployers`, then allowlist the collected addresses in `JBSuckerRegistry`.
- The deploy risk register explicitly notes that a silently missing deployer is possible if the pre-approved array is incomplete, and its checklist requires every sucker deployer to be registered plus deployer counts to match the expected per-chain configuration.
- `Verify.s.sol` reads `VERIFY_SUCKER_DEPLOYERS` with `vm.envOr(..., "")`. If unset, it only emits `_skip("Sucker deployer allowlist...")`, even on production chains.
- If the CSV is set, the verifier checks only each supplied address with `suckerDeployerIsAllowed(deployer)`. It has no expected manifest, no required count, and no way to fail if an expected deployer is missing from the CSV.
- The registry exposes `suckerDeployerIsAllowed`, but not an enumerable allowlist, so the verifier must use an explicit expected manifest rather than an operator-supplied partial list.
- Fresh recheck: `Verify.s.sol` still uses optional `VERIFY_SUCKER_DEPLOYERS`, skips when unset, and only checks the operator-supplied subset when set.

Impact:

- A production deployment can pass the automated verifier with no sucker-deployer allowlist coverage at all.
- A deployment can also pass with a partial CSV that lists only deployers that happened to be allowlisted, while one or more expected bridge paths are absent.
- Missing deployers break revnet / Croptop sucker deployment and can leave project `1-4` with incomplete cross-chain routing even though the verifier's omnichain category passes.

Recommended fix:

- Make `VERIFY_SUCKER_DEPLOYERS` required on production chains, or replace it with a per-chain manifest inside `Verify.s.sol`.
- Assert the exact expected deployer addresses and count for each supported chain, including native OP/Base/Arbitrum deployers where applicable and the three CCIP remote-chain deployers.
- Verify each expected deployer has code and is allowlisted in `JBSuckerRegistry`.
- Pair this with Current Open Edge Case G's bridge/CCIP provenance checks so an allowlisted deployer is not merely present, but also configured for the intended local bridge/router and remote chain.

### L. `deploy-all-v6`: verifier cannot prove `JBDirectory` has exactly one allowed first controller

Severity: `MED`

Status: OPEN. The risk checklist requires exactly one allowed first controller, but `Verify.s.sol` only proves the intended controller is allowed.

Affected code and docs:

- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:480)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:1607)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:1629)
- [JBDirectory.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBDirectory.sol:51)
- [JBDirectory.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBDirectory.sol:98)
- [JBDirectory.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBDirectory.sol:163)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:230)

Why it is real:

- `Deploy.s.sol` / `Resume.s.sol` set `directory.isAllowedToSetFirstController(address(controller)) = true`.
- `Verify.s.sol` only checks `directory.isAllowedToSetFirstController(address(controller))`.
- `JBDirectory` stores `isAllowedToSetFirstController` as a public mapping with no enumerable list of allowed addresses.
- The deployment risk checklist explicitly requires "`JBDirectory` has exactly one allowed controller", but the current verifier has no way to detect an unexpected second allowed controller.
- Fresh recheck: `Verify.s.sol` still has exactly the positive `isAllowedToSetFirstController(controller)` lookup and no log/manifest reconciliation for other allowed first controllers.

Impact:

- A deployment can pass verification while an extra first-controller address is allowed.
- Any allowed first controller gets a permission override for projects with no current controller, so an unexpected allowed address can set the first controller for newly created projects before their owners or launchers configure them.
- This does not directly rewrite already-configured canonical projects `1-4`, but it weakens the post-deploy developer/user surface that new Juicebox projects will rely on.

Recommended fix:

- Add an enumerable first-controller allowlist to `JBDirectory`, or add a separate verification artifact based on deployment/event logs that proves only the canonical controller was enabled.
- Until the contract exposes enumeration, make the deployment runbook include an archive-log check for all `setIsAllowedToSetFirstController` calls and require exactly one final `true` entry.
- Keep the direct `isAllowedToSetFirstController(controller)` check, but do not treat it as sufficient for the risk-doc "exactly one" requirement.

### M. `deploy-all-v6`: verifier cannot prove `JBFeelessAddresses` has no unexpected entries

Severity: `MED`

Status: OPEN. The risk checklist requires no unexpected fee-exempt addresses, but `Verify.s.sol` only proves the router terminal and any operator-supplied CSV entries are fee-exempt.

Affected code and docs:

- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:756)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:1145)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:932)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:1030)
- [JBFeelessAddresses.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBFeelessAddresses.sol:22)
- [JBFeelessAddresses.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBFeelessAddresses.sol:40)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:229)

Why it is real:

- `Deploy.s.sol` / `Resume.s.sol` mark the router terminal as feeless.
- `Verify.s.sol` checks `feelessAddresses.isFeeless(address(routerTerminal))`, then optionally checks each address listed in `VERIFY_FEELESS_ADDRESSES`.
- If `VERIFY_FEELESS_ADDRESSES` is unset, the verifier skips extra fee-exempt address checks even on production chains.
- If the CSV is set, the verifier checks only the supplied subset. A CSV cannot prove there are no other fee-exempt addresses.
- `JBFeelessAddresses` stores `isFeeless` as a public mapping and emits events, but it has no enumerable on-chain list of fee-exempt addresses.
- The deployment risk checklist explicitly requires "`JBFeelessAddresses` has no unexpected entries", which the current verifier cannot establish from live contract state.
- Fresh recheck: `Verify.s.sol` still checks the router terminal directly, then uses optional `VERIFY_FEELESS_ADDRESSES` as another positive subset check and skips it when unset.

Impact:

- A deployment can pass verification while an extra address is exempt from the protocol fee.
- Any unexpected feeless recipient, terminal, hook, project owner, or cash-out beneficiary can reduce or bypass protocol fee collection where `JBMultiTerminal` consults `JBFeelessAddresses`.
- Because the Safe owns `JBFeelessAddresses`, the risk is primarily operator/config compromise or misconfiguration, but it directly affects protocol revenue assumptions after deployment.

Recommended fix:

- Add an enumerable fee-exemption set to `JBFeelessAddresses`, or add a deployment verification artifact based on archive logs that reconstructs final `SetFeelessAddress` state.
- Require the final set to exactly match the deployment manifest, with the router terminal included and no unexpected entries.
- Keep the direct router-terminal `isFeeless` check, but do not treat `VERIFY_FEELESS_ADDRESSES` as an exactness proof unless it is paired with enumeration or event-log reconciliation.

### N. `deploy-all-v6`: verifier does not check for dangling project NFT approvals

Severity: `MED`

Status: OPEN. The risk checklist requires no dangling approvals on project NFTs, but `Verify.s.sol` only checks project ownership and never inspects ERC-721 approvals.

Affected code and docs:

- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:434)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2091)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2355)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2444)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2113)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2408)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2508)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:818)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:158)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:228)

Why it is real:

- The deployment and resume paths approve `REVDeployer` for the pre-created project NFTs before converting them into revnets.
- `REVDeployer` transfers pre-existing project NFTs to itself during `_deployRevnetFor`, which should clear those per-token approvals on the happy path.
- The risk register still explicitly calls out the approval window and the post-deployment checklist requires "No dangling approvals on project NFTs".
- `Verify.s.sol` checks that canonical project NFTs are owned by `REVDeployer`, but it does not call `projects.getApproved(projectId)` for projects `1-4`.
- It also has no operator-approval reconciliation. ERC-721 `isApprovedForAll(owner, operator)` is a lookup, not an enumerable list, so exact operator-approval absence needs either an expected-operator manifest or event-log reconciliation.
- Fresh recheck: `Verify.s.sol` still has no `getApproved` or `isApprovedForAll` reads, so project-NFT approval state is not part of the deployment acceptance gate.

Impact:

- A deployment can pass verification while a canonical revnet project NFT has an approved spender.
- A per-token approved spender can transfer the project NFT away from `REVDeployer`, taking control of the project owner boundary that current canonical identity checks rely on.
- Even if the known deploy-time approval is expected to clear on transfer, verification does not prove that the final post-deploy NFT approval state is clean.

Recommended fix:

- Add `projects.getApproved(projectId) == address(0)` checks for canonical project IDs `1-4`.
- Add a manifest or archive-log check for `ApprovalForAll` events affecting the canonical project NFT owner boundary.
- Keep the existing `ownerOf(projectId) == REVDeployer` checks; ownership and approval state are separate ERC-721 security properties.

### O. `deploy-all-v6`: verifier does not authenticate immutable permissions, directory, and trusted-forwarder auth inputs

Severity: `HIGH`

Status: OPEN. `Verify.s.sol` loads `VERIFY_PERMISSIONS` but never checks that permissioned contracts use it, does not authenticate all immutable directory auth inputs, and does not authenticate the ERC-2771 trusted forwarder shared across the deployment.

Affected code and docs:

- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:270)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:777)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:1229)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:579)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:586)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:624)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:675)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:1513)
- [JBPermissioned.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/abstract/JBPermissioned.sol:24)
- [JBPermissioned.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/abstract/JBPermissioned.sol:57)
- [JBPermissions.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBPermissions.sol:55)
- [JBOmnichainDeployer.sol](/Users/jango/Documents/jb/v6/evm/nana-omnichain-deployers-v6/src/JBOmnichainDeployer.sol:92)
- [JBOmnichainDeployer.sol](/Users/jango/Documents/jb/v6/evm/nana-omnichain-deployers-v6/src/JBOmnichainDeployer.sol:1005)
- [ERC2771Context.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/node_modules/@openzeppelin/contracts/metatx/ERC2771Context.sol:39)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:187)

Why it is real:

- `Deploy.s.sol` creates one `ERC2771Forwarder`, deploys `JBPermissions` with that forwarder, and then passes `_permissions` plus `_trustedForwarder` through many core, hook, router, sucker, Croptop, and revnet constructors.
- `JBPermissioned` stores `PERMISSIONS` as an immutable authorization dependency. Functions using `_requirePermissionFrom(...)` trust whatever registry was embedded at construction.
- `JBPermissions` itself is ERC-2771-aware; its `_msgSender()` can be supplied by the trusted forwarder.
- OpenZeppelin `ERC2771Context` stores the trusted forwarder as an immutable and treats calls from that address as if the final 20 calldata bytes were the real sender.
- `JBOmnichainDeployer` stores `DIRECTORY` as an immutable and uses it in `_validateController(...)` to decide whether a user-supplied controller matches the canonical project controller. `Verify.s.sol` checks its `SUCKER_REGISTRY`, `HOOK_DEPLOYER`, and `PROJECTS`, but not `DIRECTORY()`.
- Fresh recheck: `rg -n "permissionsOf|hasPermission|hasPermissions|PERMISSIONS\\(|trustedForwarder\\(\\)" script/Verify.s.sol` only finds the `ProjectHandles trusted forwarder matches core` assertion. `Verify.s.sol` reads `VERIFY_PERMISSIONS`, but it does not require any contract's `PERMISSIONS()` to equal `VERIFY_PERMISSIONS`, does not check `JBPermissions.trustedForwarder()`, and does not check that all ERC-2771-aware contracts share the expected forwarder.
- Fresh Phase 04 recheck: `JBOmnichainDeployer.DIRECTORY()` is public and deploy-time immutable, while `Verify.s.sol` has no `omnichainDeployer.DIRECTORY() == directory` assertion.

Impact:

- A deployment can pass verification while a permissioned contract points at the wrong permission registry.
- A malicious or stale permissions registry can grant or deny operator authority independently of the canonical `JBPermissions` state, affecting controller, terminal, price-feed, hook, router, sucker, Croptop, and revnet permission checks.
- A wrong trusted forwarder can spoof `_msgSender()` for ERC-2771-aware contracts, including `JBPermissions`, allowing forged permission-setting or privileged calls wherever that forwarder is trusted.
- A wrong omnichain deployer directory can make future omnichain launch/queue validation trust the wrong project-controller source, undermining the guard added to reject fake controllers.
- These constructor inputs are immutable, so a bad deployment generally requires redeployment rather than a Safe-admin repair.

Recommended fix:

- Make `Verify.s.sol` assert `PERMISSIONS() == VERIFY_PERMISSIONS` for every deployed `JBPermissioned` contract that exposes the getter, including core contracts, hook/router registries, sucker registry/deployers, Croptop contracts, and revnet periphery.
- Add `VERIFY_TRUSTED_FORWARDER` and require it on production chains.
- Assert `trustedForwarder() == VERIFY_TRUSTED_FORWARDER` for every ERC-2771-aware deployed contract that exposes the getter, including `JBPermissions`.
- Assert immutable directory auth inputs wherever exposed and security-relevant, including `JBOmnichainDeployer.DIRECTORY() == VERIFY_DIRECTORY`.
- Verify the forwarder has code and, if possible, its expected name/domain data.

### P. `deploy-all-v6`: verifier does not authenticate runtime permission grants or wildcard bypass operators

Severity: `HIGH`

Status: OPEN. The ecosystem risk register requires verifying wildcard grants and bypass operators, but `Verify.s.sol` never inspects `JBPermissions.permissionsOf(...)`.

Affected code and docs:

- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:270)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:212)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:376)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:1121)
- [JBOmnichainDeployer.sol](/Users/jango/Documents/jb/v6/evm/nana-omnichain-deployers-v6/src/JBOmnichainDeployer.sol:135)
- [CTDeployer.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/src/CTDeployer.sol:108)
- [CTProjectOwner.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/src/CTProjectOwner.sol:70)
- [JBPermissions.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBPermissions.sol:41)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/RISKS.md:47)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/RISKS.md:108)

Why it is real:

- `REVDeployer` grants wildcard project-`0` permissions from itself to `REVLoans` (`USE_ALLOWANCE`) and the buyback hook registry (`SET_BUYBACK_POOL`).
- Each revnet split operator receives broad project-scoped powers from `REVDeployer`, including split updates, buyback/router configuration, metadata updates, `SIGN_FOR_ERC20`, sucker safety, and `HIDE_TOKENS`.
- `JBOmnichainDeployer` grants the sucker registry wildcard `MAP_SUCKER_TOKEN` authority for its account.
- `CTDeployer` and `CTProjectOwner` grant `CTPublisher` wildcard or project-scoped `ADJUST_721_TIERS` authority so Croptop posting continues after launch.
- `JBPermissions.permissionsOf` is a public mapping, so specific expected grants can be checked; focused and invariant permission tests pass for wildcard, ROOT, replacement, bit-packing, and trusted-forwarder behavior. It is not enumerable, so proving no unexpected grant requires either an explicit manifest plus event-log reconciliation or an enumerable permission index.
- Fresh recheck: `Verify.s.sol` loads `VERIFY_PERMISSIONS` but does not read `permissionsOf`, `hasPermission`, or `hasPermissions` anywhere.
- The top-level ecosystem risk register explicitly calls out permission concentration and says post-deploy verification must cover wildcard grants and bypass operators.

Impact:

- A deployment can pass verification while expected grants are missing, breaking loans, buyback setup, sucker token mapping, Croptop posting, or split-operator maintenance after immutable rollout.
- It can also pass while unexpected wildcard or project-scoped grants exist, giving an unintended operator owner-equivalent powers across many projects or across a canonical revnet.
- This is especially high impact for revnets because split-operator grants include powers that Current Open Edge Cases D and E already identify as economically meaningful: hidden-token authority, reserved split routing, buyback/router configuration, and sucker control.

Recommended fix:

- Add a permissions manifest for every expected `(operator, account, projectId, permissionIds)` tuple created by the canonical deployment path.
- In `Verify.s.sol`, assert the exact expected positive grants using `permissionsOf` or `hasPermissions`, including wildcard grants for `REVLoans`, buyback registry, sucker registry, and Croptop publisher.
- Add archive-log reconciliation for `OperatorPermissionsSet` events, or make `JBPermissions` enumerable, so verification can prove there are no unexpected wildcard or canonical-project grants.
- Treat permission-state verification as a production-chain hard requirement before enabling loans, sucker movement, Croptop publishing, or public developer integrations.

### Q. `nana-721-hook-v6` + `nana-distributor-v6`: 721 reward snapshots still do not prove token existence

Severity: `MED`

Status: OPEN. The current checkpoint module returns a current/first owner for never-transferred NFTs without recording the block where the token was minted.

Affected code:

- [JB721Checkpoints.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721Checkpoints.sol:82)
- [JB721Checkpoints.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721Checkpoints.sol:108)
- [JB721TiersHook.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721TiersHook.sol:158)
- [JB721TiersHook.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721TiersHook.sol:796)
- [JB721Distributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JB721Distributor.sol:264)
- [JB721Distributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JB721Distributor.sol:313)
- [JB721Distributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JB721Distributor.sol:390)
- [JB721Distributor.t.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/test/JB721Distributor.t.sol:145)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/RISKS.md:12)

Why it is real:

- `JB721Checkpoints.onTransfer(...)` only writes `_ownerCheckpointsOf[tokenId]` when `from != address(0)`. Mints do not record a token-owner checkpoint or a mint block.
- `JB721Checkpoints.ownerOfAt(tokenId, blockNumber)` returns `IJB721TiersHook(HOOK).firstOwnerOf(tokenId)` whenever there is no checkpoint or the first checkpoint is after the queried block.
- `JB721TiersHook.firstOwnerOf(tokenId)` falls back to the current `_ownerOf(tokenId)` until the token has a non-mint transfer, because `_firstOwnerOf[tokenId]` is only populated when `from != address(0)`.
- `JB721Distributor._snapshotOwnerOf(...)` trusts `ownerOfAt(tokenId, snapshotBlock)` as proof that a token existed at the round snapshot. Its comments explicitly say a zero owner should mean the token was not owned at the snapshot block.
- Fresh recheck: `nana-721-hook-v6/test/regression/RegressionOwnerOfAtPreMint.t.sol` still passes and proves the production checkpoint path reports the late-minted token's owner for a snapshot block that was earlier than that token's mint.
- The production hook/store do not expose `mintBlockOf`. Some distributor regression mocks do expose mint-block-style behavior and pass the strict late-mint tests, but that behavior is not present in the production `JB721Checkpoints` / `JB721TiersHook` path.
- The current per-owner consumed-votes cap prevents system-wide inflation. `nana-distributor-v6/test/regression/PostSnapshotMintTheft.t.sol` still passes and demonstrates the narrowed behavior: a post-snapshot token cannot exceed the owner's historical vote budget, but it can consume that budget before the real snapshot token does.

Impact:

- A holder who owned a snapshot-eligible NFT can transfer or sell that NFT after the snapshot, mint or receive a different NFT after the snapshot, and vest the round through the replacement token.
- The buyer's transferred snapshot token can then receive zero for that round because the seller's snapshot vote budget was already consumed by a token that did not exist at the snapshot block.
- This is a cross-user reward misallocation, not only accounting noise. The distributor risk register marks wrong stake snapshots as a P0 payout-integrity risk.

Recommended fix:

- Record each token's mint block in `JB721Checkpoints` or in the 721 hook/store during mint.
- Make `ownerOfAt(tokenId, blockNumber)` return `address(0)` when `blockNumber` is earlier than the token's mint block.
- Keep the per-owner consumed-votes cap as defense in depth, but do not treat it as a substitute for per-token snapshot existence.
- Add a production-path regression using the real `JB721Checkpoints` contract, not only a mock with `mintBlockOf`, where a post-snapshot never-transferred token returns zero stake for the earlier snapshot.

### R. `deploy-all-v6` + `nana-project-handles-v6`: ProjectHandles ENS availability and `.eth` suffix ambiguity

Severity: `MED`

Status: OPEN. `deploy-all-v6` requires `JBProjectHandles` on production chains, but neither the verifier nor `JBProjectHandles.handleOf(...)` fails soft when the hardcoded ENS registry address is not callable. Stored parts can also include `"eth"` as the rightmost visible label, making `vitalik.eth` verify against `vitalik.eth.eth`.

Affected code and docs:

- [JBProjectHandles.sol](/Users/jango/Documents/jb/v6/evm/nana-project-handles-v6/src/JBProjectHandles.sol:35)
- [JBProjectHandles.sol](/Users/jango/Documents/jb/v6/evm/nana-project-handles-v6/src/JBProjectHandles.sol:67)
- [JBProjectHandles.sol](/Users/jango/Documents/jb/v6/evm/nana-project-handles-v6/src/JBProjectHandles.sol:152)
- [JBProjectHandles.sol](/Users/jango/Documents/jb/v6/evm/nana-project-handles-v6/src/JBProjectHandles.sol:202)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2851)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:1217)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/nana-project-handles-v6/RISKS.md:15)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/nana-project-handles-v6/RISKS.md:31)

Why it is real:

- `JBProjectHandles` hardcodes `ENS_REGISTRY = 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e` and comments that the address is the same on Ethereum mainnet and most testnets.
- `handleOf(...)` returns early only when no parts are stored. Once a setter has stored parts, it calls `ENS_REGISTRY.resolver(hashedName)` directly, outside a `try/catch`.
- The risk register correctly treats ENS and resolver liveness as soft metadata, and says resolver reverts resolve to `""`, but that soft-fail behavior only covers the later resolver `text(...)` call. It does not cover an unavailable or non-contract ENS registry.
- A temporary local review test in `nana-project-handles-v6` confirmed the failure mode: with stored parts and no code at the hardcoded ENS registry address, `handleOf(...)` reverts instead of returning the empty string.
- `Deploy.s.sol` deploys `JBProjectHandles` in Phase 11, and `Verify.s.sol` requires `VERIFY_PROJECT_HANDLES` on production chains. The verifier only checks that ProjectHandles has code, `TEXT_KEY() == "juicebox"`, and the trusted forwarder matches core; it never checks `projectHandles.ENS_REGISTRY()` or `address(projectHandles.ENS_REGISTRY()).code.length`, and it does not otherwise prove the address is the Phase 11 `JBProjectHandles` deployment instead of a facade implementing those getters.
- `setEnsNamePartsFor(...)` accepts `"eth"` as a stored part, and `_namehash(...)` always appends the implicit trailing `.eth` suffix before hashing the formatted visible handle. Parts `["eth", "vitalik"]` display as `vitalik.eth` but namehash as `vitalik.eth.eth`.
- Scope recheck: a temporary local `RegressionProjectHandlesCurrentOpenR.t.sol` test passed with both `test_noCodeEnsRegistryRevertsInsteadOfReturningEmpty` and `test_rightmostEthPartVerifiesDifferentVisibleHandle`, then the temporary file was removed. Permanent focused tests still pass for zero resolver, resolver revert, hardcoded registry address, control-character rejection, and bidi-spoof rejection.

Impact:

- On any production chain where the hardcoded ENS registry address is missing, wrong, or temporarily unavailable at verification time, stored project-handle lookups can revert.
- That turns a convenience metadata lookup into an availability hazard for frontends, indexers, AI agents, and developer tooling that expect `handleOf(...)` to return either a verified handle or `""`.
- Because ProjectHandles is required by the production deploy verifier, a deployment can look complete while one of the user-facing discovery surfaces is known to be brittle on that chain.
- An owner of a nested `*.eth.eth` node can make ProjectHandles return a visually canonical `.eth` handle that is not controlled by the corresponding `.eth` owner, confusing users and offchain tooling that treat returned handles as canonical ENS names.

Recommended fix:

- In `JBProjectHandles.handleOf(...)`, wrap the registry `resolver(...)` lookup in `try/catch` and return `""` if the registry call reverts or cannot be decoded.
- In `Verify.s.sol`, assert `address(projectHandles.ENS_REGISTRY()) == 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e` and `address(projectHandles.ENS_REGISTRY()).code.length > 0` on every chain where ProjectHandles is deployed, and authenticate the extension itself by comparing the expected deterministic Phase 11 address or runtime code hash for the trusted-forwarder constructor argument.
- If a target chain does not have a callable ENS registry at that address, either skip deploying ProjectHandles on that chain, use a chain-specific registry input, or document that the extension is intentionally inactive there.
- Add a permanent regression for the no-code registry case so the accepted ProjectHandles behavior is "unverified/empty" instead of reverting.
- Reject `"eth"` as a stored name part, or strip a user-provided rightmost `"eth"` suffix before formatting and hashing so the visible handle and verified ENS node cannot diverge.

### S. `nana-suckers-v6`: swap-enabled CCIP suckers strand earlier batches delivered after a higher nonce

Severity: `HIGH`

Status: DEFERRED / NOT IN INITIAL ROLLOUT. `JBSwapCCIPSucker` says per-batch conversion rates make out-of-order CCIP delivery safe, but stale-by-nonce messages do not receive batch metadata, so earlier delivered tokens can become unclaimable after a later nonce arrives first. Current `deploy-all-v6` Phase 03 deploys plain `JBCCIPSucker` instances only; swap-enabled suckers are disabled for initial deploy.

Scope note: current `deploy-all-v6` Phase 03 imports and deploys plain `JBCCIPSucker` deployers/singletons for the ETH, Optimism, Base, and Arbitrum CCIP matrix. `Deploy.s.sol` comments identify Tempo/cross-currency `JBSwapCCIPSucker` support as a later phase, so this edge case blocks enabling swap-enabled CCIP in the ecosystem but does not add an independent blocker to the current projects `1-4` plain-CCIP deployment path unless that path is expanded before launch.

Affected code and docs:

- [JBSwapCCIPSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSwapCCIPSucker.sol:52)
- [JBSwapCCIPSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSwapCCIPSucker.sol:304)
- [JBSwapCCIPSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSwapCCIPSucker.sol:317)
- [JBSwapCCIPSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSwapCCIPSucker.sol:480)
- [JBSwapCCIPSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSwapCCIPSucker.sol:614)
- [JBSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol:380)
- [JBSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol:425)
- [JBSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol:1218)
- [JBSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol:1625)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:94)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:1411)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2924)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/RISKS.md:33)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/RISKS.md:42)
- [RegressionSkippedNonceMetadata.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/regression/RegressionSkippedNonceMetadata.t.sol:188)

Why it is real:

- Base `JBSucker.fromRemote(...)` accepts any per-token nonce greater than the current inbox nonce and silently rejects lower/equal nonces. This is explicitly documented as an accepted out-of-order bridge tradeoff because a later append-only Merkle root can still prove earlier leaves.
- `JBSwapCCIPSucker` adds per-nonce `_batchStartOf`, `_batchEndOf`, and `_conversionRateOf` metadata so each claim can scale source-chain leaf amounts into the received local token amount.
- `JBSwapCCIPSucker.ccipReceive(...)` calls `this.fromRemote(root)`, then writes the batch range, highest received nonce, pending swap, and conversion rate only if `_inboxOf[localToken].nonce > inboxNonceBefore`.
- If CCIP delivers nonce `2` before nonce `1`, nonce `2` advances the inbox and stores metadata for its batch. When nonce `1` later arrives with real bridged tokens, `fromRemote` treats it as stale, emits `StaleRootRejected`, and the swap wrapper skips all nonce-`1` batch/conversion metadata.
- `_findNonceForLeafIndex(...)` can then scan down from the highest received nonce and still never find the leaf range for nonce `1`, so `_addToBalance(...)` reverts with `JBSwapCCIPSucker_BatchNotReceived(0)`.
- The existing untracked PoC `test/regression/RegressionSkippedNonceMetadata.t.sol` passes on current code and asserts exactly this state: nonce `2` metadata exists, nonce `1` metadata and conversion rate are zero after late delivery, and a nonce-`1` claim reverts. Scope recheck on 2026-05-06: `forge test --match-path test/regression/RegressionSkippedNonceMetadata.t.sol -vv` passes in `nana-suckers-v6` (1 test).
- Fresh source recheck on 2026-05-06 confirms the swap wrapper still only stores `_batchStartOf`, `_batchEndOf`, `_highestReceivedNonce`, `_pendingSwapOf`, and `_conversionRateOf` when `fromRemote(...)` advances `_inboxOf[localToken].nonce`.

Impact:

- CCIP explicitly does not guarantee in-order delivery, and the repo risk register already accepts skipped nonces for base suckers. For swap-enabled CCIP suckers, that acceptance is incomplete: later roots may keep proofs valid, but the per-batch swap accounting needed to pay claims is missing.
- Earlier batch funds delivered after a higher nonce can remain stuck in the sucker while every claim for that batch reverts.
- This breaks cross-chain claim liveness for any project using `JBSwapCCIPSucker`, especially cross-denomination routes where the received token amount sets the batch conversion rate. Current `deploy-all-v6` does not deploy this implementation in Phase 03, but the ecosystem should not enable it until the metadata acceptance bug is fixed or explicitly isolated from production routes.

Recommended fix:

- Decouple swap batch metadata acceptance from inbox nonce advancement. If a message is authentic and its nonce has not already had metadata recorded, store its batch range and conversion/pending-swap data even when `fromRemote` does not advance the canonical inbox root.
- Add an explicit per-token/per-nonce received-metadata guard so duplicate or replayed stale messages cannot overwrite the first recorded conversion rate.
- Keep the canonical inbox root monotonic for proof verification, but let `_findNonceForLeafIndex(...)` see every valid delivered batch range.
- Until fixed, keep `JBSwapCCIPSucker` out of the production deploy manifest and verifier allowlists, and document that only plain `JBCCIPSucker` routes are in scope for the initial one-shot deployment.
- Promote `RegressionSkippedNonceMetadata.t.sol` or an equivalent regression into the tracked test suite, and test both swap-success and swap-pending stale-by-inbox deliveries.

### T. `deploy-all-v6` + `nana-project-payer-v6`: verifier accepts arbitrary ProjectPayer implementation code

Severity: `MED`

Status: OPEN. Category 11 verification proves the ProjectPayer deployer has code and returns the canonical `JBDirectory`, but it does not prove that `IMPLEMENTATION()` is a `JBProjectPayer` wired to that deployer and directory.

Affected code:

- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:1277)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:1282)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:1287)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:1289)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2896)
- [JBProjectPayerDeployer.sol](/Users/jango/Documents/jb/v6/evm/nana-project-payer-v6/src/JBProjectPayerDeployer.sol:28)
- [JBProjectPayer.sol](/Users/jango/Documents/jb/v6/evm/nana-project-payer-v6/src/JBProjectPayer.sol:70)

Why it is real:

- `JBProjectPayerDeployer` constructs a shared `JBProjectPayer` implementation in its constructor, and that implementation stores immutable `DIRECTORY` and `DEPLOYER` values.
- `Verify.s.sol` only checks `address(projectPayerDeployer).code.length > 0`, `projectPayerDeployer.DIRECTORY() == directory`, and `projectPayerDeployer.IMPLEMENTATION().code.length > 0`.
- A temporary local harness `RegressionProjectPayerVerifierGap.t.sol` confirmed `_verifyPeripheryExtensions()` accepts a fake deployer whose `DIRECTORY()` returns the expected directory but whose `IMPLEMENTATION()` points at arbitrary non-ProjectPayer code. The temporary test was removed after the proof run.
- No other deploy-all test or verification category asserts `IJBProjectPayer(implementation).DIRECTORY() == directory` or `IJBProjectPayer(implementation).DEPLOYER() == address(projectPayerDeployer)`.
- Scope recheck: `forge test --skip '*/fork/**' -vv` passes in `nana-project-payer-v6` (53 tests across the deployer, payer, edge, and review PoC suites), and `forge build --deny notes --sizes --skip '*/test/**' --skip '*/script/**'` also passes. This edge case is about authenticating the deployed factory/implementation pair in `deploy-all-v6`, not a newly observed ProjectPayer forwarding-code failure.

Impact:

- A wrong `VERIFY_PROJECT_PAYER_DEPLOYER` value, wrong deterministic deployment, or maliciously substituted deployer can pass the production verifier while advertising a clone factory whose clones do not run the audited ProjectPayer forwarding logic.
- Project payer addresses are meant to be developer- and user-facing payment endpoints. A bad implementation can lock funds, route payments incorrectly, omit owner controls, or break the expected `receive()` behavior while the deployment report still says Phase 11 passed.
- This is not as systemic as core controller/terminal wiring, but it undercuts the "safe and reliable for developers, AIs, and users" goal for a public convenience primitive.

Recommended fix:

- In `Verify.s.sol`, cast `projectPayerDeployer.IMPLEMENTATION()` to `IJBProjectPayer` and require `DIRECTORY() == directory` and `DEPLOYER() == address(projectPayerDeployer)`.
- Add an interface-support or known-selector smoke check for the implementation, such as `supportsInterface(type(IJBProjectPayer).interfaceId)` if the interface ID is stable in the deployed package.
- Add a verifier regression that demonstrates a fake implementation with arbitrary code fails Category 11.
- Prefer also checking the deterministic expected ProjectPayerDeployer address from `PROJECT_PAYER_DEPLOYER_SALT`, creation code, and constructor args, or recording that address in the deployment manifest consumed by `Verify.s.sol`.

### U. `deploy-all-v6` + `nana-distributor-v6`: Phase 11 distributor rounds are configured as block counts but measured as seconds

Severity: `MED`

Status: OPEN / CONFIG FIX NEEDED. `Deploy.s.sol` comments set distributor `roundDuration` values as approximate one-week block counts per chain, but `JBDistributor` treats `roundDuration` as seconds. Fix: change deploy config values to wall-clock seconds (604,800 for 1 week). No contract changes needed.

Affected code:

- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:494)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:512)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:549)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2868)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2884)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:537)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:555)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:591)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:1315)
- [JBDistributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JBDistributor.sol:118)
- [JBDistributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JBDistributor.sol:345)
- [JBDistributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JBDistributor.sol:351)

Why it is real:

- `JBDistributor` documents `roundDuration_` as seconds, stores it directly, and calculates `currentRound()` from `(block.timestamp - startingTimestamp) / roundDuration`.
- `deploy-all-v6` sets `_roundDuration = 50_400` for Ethereum with the comment `~1 week at 12s/block`; `50_400` seconds is 14 hours, not one week.
- It sets `_roundDuration = 302_400` for Optimism/Base with the comment `~1 week at 2s/block`; `302_400` seconds is 3.5 days.
- It sets `_roundDuration = 2_419_200` for Arbitrum with the comment `~1 week at ~0.25s/block`; `2_419_200` seconds is 28 days.
- `Verify.s.sol` mirrors these same values as expected, so post-deploy verification approves the timing mismatch instead of catching it.
- Fresh recheck: `Deploy.s.sol`, `Resume.s.sol`, and `_expectedRoundDuration()` still contain `50_400`, `302_400`, and `2_419_200`, while `JBDistributor.currentRound()` still divides `block.timestamp - startingTimestamp` by `roundDuration`.
- Existing `JB721Distributor` unit tests still pass by warping `block.timestamp + ROUND_DURATION` and observing `currentRound()` advance, confirming seconds-based semantics. Current recheck: `forge test --match-path test/JB721Distributor.t.sol --match-test test_currentRound -vv` passes 2 focused tests.
- A temporary local review test `RegressionDistributorRoundDuration.t.sol` confirmed the live semantics: an L1-configured distributor advances to round 1 after 50,400 seconds and reaches round 52 after 2,620,800 seconds, while an Arbitrum-configured distributor is still in round 0 after one wall-clock week and only advances after 2,419,200 seconds. The temporary file was removed after the proof run.

Impact:

- Phase 11 reward distribution and vesting cadence is materially different across chains: 14-hour rounds on Ethereum, 3.5-day rounds on Optimism/Base, and 28-day rounds on Arbitrum.
- With `VESTING_ROUNDS = 52`, full vesting is roughly 30.3 days on Ethereum, 182 days on Optimism/Base, and about 1,456 days on Arbitrum, despite comments implying a 52-week schedule everywhere.
- This is a user-facing reliability issue for reward distributors: the same "round" or "vesting round" means different wall-clock durations by chain, and the verifier will present that as correct.
- Because the values are constructor parameters, an immutable production deployment bakes the wrong cadence into both `JB721Distributor` and `JBTokenDistributor`.

Recommended fix:

- Decide the intended wall-clock round duration. If the intent is weekly rounds, use `1 weeks` / `604_800` seconds on every chain.
- If chain-specific wall-clock durations are intentional, replace the misleading comments and document the exact user-facing vesting cadence per chain in the deployment runbook.
- Update `Verify.s.sol` to compare against the chosen wall-clock manifest, not block-count-derived values.
- Add a deploy-all regression that instantiates the distributors with production constants and asserts `roundStartTimestamp(52) - startingTimestamp` equals the intended vesting horizon.

### V. `deploy-all-v6`: Sphinx replays Solidity CREATE2 deployments as ordinary CREATE actions

Severity: `HIGH`

Status: OPEN / DEPLOY-BLOCKING. Fresh recheck on 2026-05-06 confirms the canonical `Deploy.s.sol` Sphinx path still uses Solidity `new {salt}` for almost every contract, while the installed Sphinx plugin still only preserves CREATE2 semantics for explicit calls through the deterministic deployment proxy.

Affected code:

- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:583)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:795)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:3002)
- [Sphinx.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/node_modules/@sphinx-labs/contracts/contracts/foundry/Sphinx.sol:239)
- [Sphinx.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/node_modules/@sphinx-labs/contracts/contracts/foundry/Sphinx.sol:303)
- [SphinxUtils.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/node_modules/@sphinx-labs/contracts/contracts/foundry/SphinxUtils.sol:623)
- [SphinxUtils.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/node_modules/@sphinx-labs/contracts/contracts/foundry/SphinxUtils.sol:866)
- [decode.js](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/node_modules/@sphinx-labs/plugins/dist/foundry/decode.js:90)
- [utils/index.js](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/node_modules/@sphinx-labs/plugins/dist/foundry/utils/index.js:542)

Why it is real:

- `Deploy.s.sol` extends Sphinx, computes already-deployed addresses with `vm.computeCreate2Address(..., deployer: safeAddress())`, mines the Uniswap V4 hook salt for `safeAddress()`, and then deploys contracts with Solidity `new Contract{salt: ...}`.
- During Sphinx collection, the `sphinx` modifier pranks `safeAddress()` and records Foundry account accesses while the script runs.
- Sphinx treats root account accesses as deployable transactions only when their kind is `Call` or `Create`; its own comment notes that Foundry would probably need a distinct Create2 kind if it supported the CREATE2 opcode in this flow.
- For a root `Create`, `SphinxUtils.makeGnosisSafeTransaction()` builds a Safe delegatecall to `CreateCall.performCreate(value, initCode)`. That is ordinary CREATE replay, not CREATE2 replay, and the account access has no salt field.
- The TypeScript decoder checks `root.kind === AccountAccessKind.Create` first and emits `ActionInputType.CREATE`; its CREATE2 branch only applies when the root access is a call to the deterministic deployment proxy and the first nested access is a create by that proxy.
- Fresh recheck: `Deploy.s.sol` still has `deploy() public sphinx` and many `new ... {salt: ...}` deployments, while `decode.js` still emits `ActionInputType.CREATE` for root `Create` accesses before the deterministic-deployment-proxy CREATE2 branch can apply.
- A temporary local review test `RegressionSphinxCreate2Replay.t.sol` confirmed the concrete Foundry shape: Solidity `new {salt}` under a Safe prank deployed at the expected CREATE2 address, but `stopAndReturnStateDiff()` recorded the deployment as `AccountAccessKind.Create` with `accessor == safe` and `data == initcode` only. The same test confirmed a plain CREATE from the Safe's first nonce lands at a different address from the Safe CREATE2 address. The temporary file was removed after the proof run.
- A workspace script scan found the same Sphinx plus Solidity `new {salt}` pattern across many standalone first-party deploy scripts, including core, 721 hook, buyback hook, router terminal, suckers, omnichain deployer, project handles, Croptop, Revnet, Banny, Defifa, and LP split hook scripts.

Impact:

- A real `sphinx deploy` can execute a proposal whose create leaves deploy contracts at Safe nonce-derived CREATE addresses while the script, constructor arguments, hook salt mining, manifests, and verifier all refer to the empty Safe CREATE2 addresses.
- Later call leaves to the expected CREATE2 addresses can succeed as no-op calls when those addresses have no code, so the deployment can appear to progress while critical configuration never happens at the intended contracts.
- The Uniswap V4 hook is especially sensitive: the mined flags are encoded in the expected CREATE2 address, but a plain CREATE replay will not preserve the required hook address bits.
- This blocks the one-shot immutable rollout independently of the verifier gaps above. Even if all manifest checks were fixed, the current Sphinx action encoding does not prove that the contracts are deployed where `deploy-all-v6` expects them.
- Standalone package deploy scripts should also be treated as suspect until the shared Sphinx/CREATE2 pattern is fixed or proven with the exact installed Sphinx stack.

Recommended fix:

- Do not use Solidity `new {salt}` inside the Sphinx-gated deployment unless the installed Sphinx stack can preserve and replay the CREATE2 salt.
- Prefer an explicit deterministic-deployment helper that calls the CREATE2 factory/proxy with `salt || initcode`, then update `_isDeployed`, hook salt mining, expected manifests, and `Resume.s.sol` to use that same deployer address.
- Alternatively upgrade/patch Sphinx so Solidity CREATE2 account accesses retain the salt and replay through a Safe-compatible CREATE2 helper, then add a hard test that decoded action inputs for every salted deploy are CREATE2 actions with the expected target/deployer.
- Add a deployment rehearsal gate that runs the real Sphinx collection/preview path and asserts every expected deterministic address has code after execution before any project configuration calls are trusted.

### W. `deploy-all-v6`: documented deploy/resume commands are not executable for the Sphinx/Safe path

Severity: `MED`

Status: OPEN / DEPLOY-BLOCKING. Fresh recheck on 2026-05-06 confirms the current deploy runbook still tells operators to broadcast `Deploy.s.sol` and `Resume.s.sol` with Forge, but the deploy script is Sphinx-gated and the resume script requires the Safe contract itself to be `msg.sender`.

Affected code and docs:

- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:162)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:407)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:422)
- [Sphinx.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/node_modules/@sphinx-labs/contracts/contracts/foundry/Sphinx.sol:279)
- [SphinxUtils.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/node_modules/@sphinx-labs/contracts/contracts/foundry/SphinxUtils.sol:1262)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:194)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:441)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:455)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:1118)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:3255)
- [DEPLOY.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/DEPLOY.md:55)
- [DEPLOY.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/DEPLOY.md:64)
- [DEPLOY.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/DEPLOY.md:230)
- [DEPLOY.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/DEPLOY.md:236)
- [DEPLOY.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/DEPLOY.md:237)
- [DEPLOY.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/DEPLOY.md:238)

Why it is real:

- `Deploy.s.sol` inherits `Sphinx`; `run()` calls `deploy()`, and `deploy()` is guarded by the `sphinx` modifier.
- The installed Sphinx modifier explicitly rejects `VmSafe.CallerMode.Broadcast` and `RecurrentBroadcast` with the message that deployments must use the `sphinx deploy` CLI command.
- `DEPLOY.md` still instructs operators to dry run with `forge script script/Deploy.s.sol --rpc-url <RPC_URL> -vvvv` and to deploy with `forge script script/Deploy.s.sol:Deploy --rpc-url <RPC_URL> --broadcast --sender <DEPLOYER_ADDRESS> -vvvv`.
- Sphinx derives `safeAddress()` by reading `sphinx.lock`, and its error message says the project must be synced and the lock file generated. The current `deploy-all-v6` working tree has no `sphinx.lock`.
- `Resume.s.sol` is not Sphinx-gated, but it requires `msg.sender == vm.envAddress("RESUME_SAFE")` before `vm.startBroadcast()`. A normal Safe owner EOA cannot satisfy that check, while the Safe contract address cannot sign a standard live Forge broadcast from public RPC infrastructure.
- The resume command in `DEPLOY.md` is still `forge script ... --broadcast --sender <DEPLOYER_ADDRESS>`, with no Safe transaction batch, Sphinx proposal, or module execution path.
- Fresh recheck command evidence: `find . -maxdepth 2 -name sphinx.lock -o -name '.sphinx*'` in `deploy-all-v6` returns no local Sphinx lock/artifact, and `rg` still shows `Resume.s.sol` requiring `RESUME_SAFE` before `vm.startBroadcast()`.
- The resume checklist says skipped plus executed phases should total `11`, but `Resume.s.sol` increments counters per subphase and manual branch. A full mainnet path counts core, address registry, 721 hook, buyback registry, Uniswap hook, buyback hook, router terminal, LP hook, suckers, omnichain deployer, periphery, Croptop, Revnet, CPN, NANA, Banny, Defifa, and late periphery extensions separately.
- The same checklist tells operators to check for `WARNING` messages in phases `08/09`, but the current resume script does not emit `WARNING`; it logs `SKIPPED` / `EXECUTED` and reverts on the canonical checks it does perform.

Impact:

- Operators following the committed deploy runbook cannot execute the documented one-shot deploy path on a production chain.
- An interrupted deployment has no documented live recovery path that can both satisfy the Safe-as-deployer CREATE2 identity assumption and produce signable transactions.
- Even as a dry-run checklist, the resume section gives stale success criteria, so operators can misclassify a valid-looking resume summary or wait for warning signals that the script will never print.
- This weakens the "10/10 confident" deployment goal even before protocol correctness: rehearsal evidence is not meaningful unless it uses the exact CLI and signing path that will be used for the immutable rollout.

Recommended fix:

- Replace the deploy instructions with the exact Sphinx workflow, including `npx sphinx sync` / lock-file setup, proposal/preview, approval, execution, and the command that actually broadcasts through Sphinx.
- Commit `sphinx.lock` if that is required for reproducible Safe address derivation, or document the precise generated artifact and preflight check that must exist before deployment.
- Redesign resume to be executable from the Safe path: either make it a Sphinx proposal, emit a Safe transaction bundle/module execution plan, or switch deterministic deployments to an explicit CREATE2 factory so an authorized EOA can resume without pretending to be the Safe.
- Add a CI or rehearsal check that fails if `DEPLOY.md` commands drift from the script modifiers and required signer model.
- Replace the resume checklist's phase-count and warning-message expectations with exact success criteria produced by the current resume implementation.

### X. `deploy-all-v6`: canonical buyback hooks and pools are not proven; NANA/project-`1` definitely misses its pool

Severity: `MED`

Status: OPEN / DEPLOY-BLOCKING. Fresh recheck on 2026-05-06 confirms the buyback stack is still deployed before NANA is configured as a revnet, but the fee project NFT already exists before the default buyback hook is set. For the other canonical revnets, pool initialization is also fail-open and the verifier never proves the expected pool key exists.

Affected code and docs:

- [JBProjects.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBProjects.sol:45)
- [JBBuybackHookRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHookRegistry.sol:163)
- [JBBuybackHookRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHookRegistry.sol:426)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:868)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2372)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:955)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2494)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/nana-fee-project-deployer-v6/script/Deploy.s.sol:221)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:425)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:813)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:1188)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:728)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:196)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/RISKS.md:25)

Why it is real:

- `JBProjects` creates fee project `1` in its constructor when `feeProjectOwner != address(0)`. `deploy-all-v6` passes the Safe as both `owner` and `feeProjectOwner`, so `projects.count() == 1` before Phase 03c.
- `JBBuybackHookRegistry.setDefaultHook(...)` sets `defaultHookProjectIdThreshold = PROJECTS.count()`, and `_resolvedHookOf(projectId)` only returns the default when `projectId > defaultHookProjectIdThreshold`.
- `Deploy.s.sol` and `Resume.s.sol` set the buyback registry default hook in Phase 03c, after project `1` already exists, but neither script calls `setHookFor(1, _buybackHook)`. The standalone `nana-fee-project-deployer-v6` script also configures project `1` through `REVDeployer` without pinning a project-specific buyback hook.
- Phase 08b then configures project `1` as NANA through `REVDeployer.deployFor(...)`. `REVDeployer._tryInitializeBuybackPoolFor(...)` calls `BUYBACK_HOOK.initializePoolFor(projectId: 1, ...)`, but `JBBuybackHookRegistry` resolves no hook for project `1` and reverts `HookNotSet(1)`.
- `REVDeployer` catches all failures from `_tryInitializeBuybackPoolFor(...)`, so the deployment continues silently with no NANA buyback pool. The same catch-all also hides any pool setup failure for CPN, REV, or BAN, including permission, token, PoolManager, or hook configuration mistakes.
- A temporary local review test `RegressionBuybackDefaultProjectOne.t.sol` confirmed the concrete registry state: after constructing `JBProjects` with a fee-project owner and then calling `setDefaultHook`, `defaultHookProjectIdThreshold == 1`, `hookOf(1) == address(0)`, `hookOf(2) == defaultHook`, and `initializePoolFor(1, ...)` reverts `JBBuybackHookRegistry_HookNotSet(1)`. The temporary file was removed after the proof run.
- Fresh recheck: `forge test --match-path test/regression/RegistryDefaultHookHijack.t.sol -vv` and `forge test --match-path test/regression/HookNotSetGuard.t.sol -vv` both pass in `nana-buyback-hook-v6`, confirming existing projects are not retargeted by default-hook changes and no-hook pool setup/payment forwarding still has the documented behavior.
- `JBBuybackHook._getQuote(...)` returns zero when `_poolIsSet[projectId][terminalToken]` is false. `beforePayRecordedWith(...)` then returns the normal payment weight with no pay hook specification, and the cash-out path similarly falls back to direct protocol behavior when no pool is set.
- `Verify.s.sol` only checks that `buybackRegistry.defaultHook() != address(0)` on Uniswap-enabled chains. It does not check `buybackRegistry.hookOf(1)`, any canonical project's resolved hook, native-token pool key, or `JBBuybackHook.poolKeyOf(projectId, NATIVE_TOKEN)` for projects `1-4`.

Impact:

- NANA/project `1` launches without the market-aware buyback route that the revnet deployer attempts to initialize and the deploy docs/risk checklist imply should exist.
- CPN, REV, and BAN can also launch without an initialized native-token buyback pool if pool setup fails for any reason, because the failure is swallowed and final verification does not inspect the pool state.
- Payments and cash-outs still fall back to normal Juicebox revnet behavior, so this is not a direct theft path, but it breaks a user-facing feature on the canonical fee project while the verifier stays green.
- Once Phase 08b has transferred project `1` into `REVDeployer`, the Safe can no longer trivially repair the missing project-specific buyback hook; the configured NANA split operator would need to set the hook and pool after launch.

Recommended fix:

- In `Deploy.s.sol`, `Resume.s.sol`, and the standalone fee-project deployer path, explicitly pin project `1` to the intended buyback hook before NANA is configured as a revnet, while the Safe / deployer still owns the fee project NFT.
- After pinning, initialize and verify the NANA native-token buyback pool instead of letting `REVDeployer` swallow a `HookNotSet` failure.
- Add verifier checks for each canonical project `1-4`: resolved buyback hook equals the intended hook, the native-token `poolKeyOf(projectId, NATIVE_TOKEN)` matches the expected project token / terminal token pair and fee/tick spacing, and the pool is initialized when the Uniswap stack is deployed.
- Consider narrowing `REVDeployer`'s catch to known "already initialized / unsupported stack" cases, or emit an event/return status so deployment verification can distinguish accepted no-op from missing hook configuration.

### Y. `deploy-all-v6`: verifier never proves projects `1-4` have the intended sucker pairs and native-token mappings

Severity: `HIGH`

Status: OPEN / DEPLOY-BLOCKING. Fresh recheck on 2026-05-06 confirms the deploy manifest still depends on canonical projects having specific active cross-chain suckers, peers, and native-token mappings, but the production verifier never inspects deployed sucker pairs for any project.

Affected code and docs:

- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2914)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:3011)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:776)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:1118)
- [JBSuckerRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSuckerRegistry.sol:123)
- [JBSuckerRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSuckerRegistry.sol:163)
- [JBSuckerRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSuckerRegistry.sol:489)
- [JBSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol:737)
- [JBSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol:769)
- [JBSuckerDeployer.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/deployers/JBSuckerDeployer.sol:165)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:97)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:101)
- [RISKS.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/RISKS.md:222)
- [DEPLOY.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/DEPLOY.md:267)

Why it is real:

- `Deploy.s.sol` and `Resume.s.sol` build revnet sucker configs with `peer: bytes32(0)` and a single native-token mapping from `JBConstants.NATIVE_TOKEN` to the remote native token address, using `minGas: 200_000`.
- With `peer: bytes32(0)`, each sucker's `peer()` defaults to its own address. That is only safe when both sides of the route actually deploy the same-address clone; clone addresses depend on the local deployer/factory address, singleton initcode, sender-derived salt stack, and chain-specific deployment state.
- On L1 / Sepolia, `_buildSuckerConfig(...)` expects three remote sucker configs for OP, Base, and Arbitrum. On L2s, it expects one primary bridge config back to L1. Those configs are passed into the CPN, REV, NANA, and BAN revnet deploy paths.
- `JBSuckerRegistry.deploySuckersFor(...)` records active suckers and maps tokens at deployment time. The registry then exposes `suckerPairsOf(projectId)` and `suckersOf(projectId)`, and each sucker exposes `peer()`, `peerChainId()`, and `remoteTokenFor(localToken)`.
- `Verify.s.sol` Category 6 only checks that `JBOmnichainDeployer`, `JBSuckerRegistry`, and `REVDeployer` point at each other. Category 9 optionally checks an operator-provided subset of deployer allowlist entries. No verifier category checks `suckerPairsOf(1)`, `suckerPairsOf(2)`, `suckerPairsOf(3)`, `suckerPairsOf(4)`, active sucker counts, peer addresses, remote chain IDs, token mappings, emergency-hatch state, or unexpected extra active suckers.
- Fresh recheck command evidence: `rg -n "suckerPairsOf|suckersOf|remoteTokenFor|peer\\(|peerChainId|emergencyHatch|VERIFY_SUCKER_DEPLOYERS" script/Verify.s.sol` still returns only the optional `VERIFY_SUCKER_DEPLOYERS` allowlist path and no pair, peer, or token-mapping verifier calls.
- The deploy risk register explicitly calls out cross-chain reference drift, CCIP deployer symmetry, and per-chain sucker counts as checklist items, and `DEPLOY.md` tells operators to verify sucker allowlists and run a bridge smoke test after independent per-chain verification. The automated production verifier does not cover that checklist.

Impact:

- A production deployment can pass verification with canonical projects missing active suckers, having only a subset of expected remote chains, using a wrong explicit peer, or mapping native token traffic to an unexpected remote token.
- Wrong or missing peer wiring makes legitimate bridge messages fail peer authentication or route funds/messages to the wrong contract. Wrong token mappings can strand or misroute terminal-token value even when the deployer allowlist itself is correct.
- Unexpected extra active suckers are also dangerous because registry aggregate views and bridge surfaces will treat them as live project routes. The verifier currently cannot distinguish intended bridge redundancy from an accidental or malicious active route.
- This remains a deploy blocker even if the happy-path deploy script usually reverts on an immediate sucker deployment failure: the one-shot plan also includes resume/manual recovery surfaces, existing-project skip hazards, and immutable post-deploy acceptance. The verifier must prove the final state, not just trust that every earlier phase executed perfectly.

Recommended fix:

- Add a production-required cross-chain manifest to `Verify.s.sol` keyed by chain ID and canonical project ID.
- For each canonical project expected to be omnichain on the current chain, assert the exact active sucker count, each `JBSuckersPair.remoteChainId`, each `JBSuckersPair.remote`, and that no unexpected active sucker remains in `suckersOf(projectId)`.
- For every active expected sucker, assert `remoteTokenFor(JBConstants.NATIVE_TOKEN)` has `enabled == true`, `emergencyHatch == false`, `minGas == 200_000`, and `addr == bytes32(uint256(uint160(JBConstants.NATIVE_TOKEN)))`.
- When `peer: bytes32(0)` is used, compare the resolved pair addresses across chain manifests before enabling bridge traffic. If topology differs intentionally, precompute and pass explicit nonzero peers on both sides, then verify those peer values exactly.
- Keep the manual bridge smoke test in `DEPLOY.md`, but treat it as evidence after manifest verification, not as the only proof that projects `1-4` are correctly paired.

### Z. `nana-router-terminal-v6` + `revnet-core-v6`: feeless router cash-outs bypass source project cash-out fees

Severity: `HIGH`

Status: OPEN / DEPLOY-BLOCKING. Fresh recheck on 2026-05-06 confirms `deploy-all-v6` still intentionally marks the router terminal feeless, while the router's project-token route uses itself as the source cash-out beneficiary. A user can route through a zero-tax destination project they control and avoid the core protocol fee, and canonical revnets also skip their revnet fee split on the same feeless-beneficiary branch.

Affected code and docs:

- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:932)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:1030)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:758)
- [JBRouterTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/src/JBRouterTerminal.sol:1212)
- [JBRouterTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/src/JBRouterTerminal.sol:2655)
- [REVOwner.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVOwner.sol:183)
- [REVOwner.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVOwner.sol:193)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:393)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:1165)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:1192)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:1202)
- [JBUniswapV4Hook.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/src/JBUniswapV4Hook.sol:232)
- [JBUniswapV4Hook.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/src/JBUniswapV4Hook.sol:267)

Why it is real:

- `Deploy.s.sol` and `Resume.s.sol` set `JBFeelessAddresses.isFeeless(routerTerminal) = true`, and `Verify.s.sol` requires that state.
- `JBRouterTerminal._cashOutLoop(...)` cashes out source project tokens by calling `cashOutTerminal.cashOutTokensOf(...)` with `beneficiary: payable(address(this))`. The preview path uses the same beneficiary and comments that deployment makes the router a feeless cash-out beneficiary.
- `JBMultiTerminal._cashOutTokensOf(...)` computes `beneficiaryIsFeeless = _isFeeless(beneficiary)` before settlement. If the beneficiary is feeless, the direct reclaimed amount is not added to `amountEligibleForFees`, even when the source project has a nonzero `cashOutTaxRate`.
- For revnets, `REVOwner.beforeCashOutRecordedWith(...)` also treats `context.beneficiaryIsFeeless` as a fee-bypass branch: it proxies to the buyback hook and returns before splitting `feeCashOutCount` / `nonFeeCashOutCount` or adding the fee hook spec that pays `FEE_REVNET_ID`.
- For zero-tax projects, `JBMultiTerminal` only charges the round-trip prevention fee against `_feeFreeSurplusOf[projectId][token]`. That counter is incremented for same-terminal project payouts, not for router-mediated "cash out source project tokens, then pay a destination project" flows.
- A temporary local review test `RegressionRouterFeelessCashoutFeeBypass.t.sol` proved the core-fee path without forks: direct cash-out of a nonzero-tax source project paid a protocol fee, while routing the same source project tokens through the feeless router into a user-controlled zero-tax project, then cashing out that destination project, paid zero protocol fee and returned more ETH to the user. The temporary file was removed after the proof run.
- The Uniswap V4 sell-preview helper also returns the hook-adjusted gross reclaim immediately when `cashOutTaxRate == 0`. If `_feeFreeSurplusOf` would still make live zero-tax settlement pay a fee, the preview can over-rank the sell path versus V4 and route cash-outs differently from execution.
- Fresh recheck: `forge test --match-path test/regression/GrossCashOutPreviewRouteMisrank.t.sol -vv` passes in `nana-router-terminal-v6`, including `test_feelessCashOutPreviewUsesRawReclaim()`, confirming the current preview/execution path still treats the router's feeless cash-out beneficiary as delivering raw reclaim.

Impact:

- Any holder with a source project token cash-out path can avoid source cash-out fees by routing through the feeless router terminal into a project they control with zero cash-out tax, then immediately cashing out the destination project.
- Canonical revnet tokens are in scope once holders can route their project tokens or credits through `JBRouterTerminal`; an attacker-controlled destination project is cheap to create after the immutable rollout.
- The source project's own bonding-curve / cash-out-tax economics still apply, so this is not a theft of other holders' principal. The broken invariant is fee revenue: the expected core protocol fee and the revnet fee split can be skipped on routed exits.
- Because `deploy-all-v6` makes the router terminal feeless as a required production invariant, this is not an obscure misconfiguration. It is the canonical rollout's default fee policy.
- The preview mismatch can also cause buyback/router decisions to prefer a sell-side Juicebox path that is not actually better after fee-free-surplus settlement, creating avoidable slippage or missed V4 execution.

Recommended fix:

- Do not use a global address-level feeless exemption for the router terminal unless core can distinguish protocol-internal routes that should remain fee-bearing from fee-project or same-protocol routes that should be exempt.
- Short-term, make router project-token cash-outs pay the source cash-out fees and carry the net amount into routing/previews, or remove the router terminal's feeless status and update the fee-project/router flows that needed it.
- Alternatively, add context-aware fee accounting so router-mediated source cash-outs into destination project payments mark the destination surplus as fee-originated, causing a later zero-tax cash-out to pay the skipped fee.
- Add regressions covering the exact sequence: source project with nonzero cash-out tax -> router pay into attacker-owned zero-tax project -> destination cash-out. Assert total core and revnet fees are at least the fees a direct source cash-out would have paid, modulo intended route-specific policy.
- Extend the sell-preview fee adjustment so zero-tax paths still account for `_feeFreeSurplusOf` fees when live terminal settlement would charge them.

### AA. `nana-core-v6`: split payout/cash-out outputs can over-credit fees and undercollateralize the terminal store

Severity: `MED`

Status: ACCEPTED. Forward and backward fee math round differently by design; rounding is bounded by N wei for N splits. See `nana-core-v6/RISKS.md` §2. The dust-level over-credit favors the protocol (conservation invariant) and is economically insignificant.

Affected code:

- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:1196)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:1198)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:1226)
- [JBPayoutSplitGroupLib.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/libraries/JBPayoutSplitGroupLib.sol:84)
- [JBPayoutSplitGroupLib.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/libraries/JBPayoutSplitGroupLib.sol:89)
- [JBPayoutSplitGroupLib.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/libraries/JBPayoutSplitGroupLib.sol:90)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:343)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:448)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:1870)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:1882)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:1908)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:1461)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:1465)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:1467)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:1252)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:1947)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:1973)
- [JBTerminalStore.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBTerminalStore.sol:426)
- [JBTerminalStore.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBTerminalStore.sol:285)
- [JBTerminalStore.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBTerminalStore.sol:312)
- [JBFees.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/libraries/JBFees.sol:21)

Why it is real:

- `JBTerminalStore.recordPayoutFor(...)` subtracts the full gross `amountPaidOut` from the source project before payout splits and owner leftover are settled.
- `JBPayoutSplitGroupLib.sendPayoutsToSplitGroupOf(...)` calls back into `JBMultiTerminal.executePayout(...)` for each split. `executePayout(...)` subtracts `_feeAmountFrom(amount)` from each fee-bearing split output before transfer, while the split group library adds the gross `payoutAmount` to `amountEligibleForFees` whenever the net amount differs from the gross amount.
- `_sendPayoutsOf(...)` repeats the same pattern for owner leftover: it subtracts `_feeAmountFrom(leftoverPayoutAmount)` from the owner transfer, but adds the gross leftover amount to the aggregate fee base.
- `JBTerminalStore.recordCashOutFor(...)` similarly subtracts the gross cash-out balance difference from the source project: the beneficiary `reclaimAmount` plus every non-noop hook specification amount.
- `JBMultiTerminal._cashOutTokensOf(...)` then handles the beneficiary reclaim separately. For non-feeless nonzero-tax cash-outs, it adds the gross `reclaimAmount` to `amountEligibleForFees`, but transfers only `reclaimAmount - _feeAmountFrom(reclaimAmount)` to the beneficiary.
- `_fulfillCashOutHookSpecificationsFor(...)` repeats the same pattern for each hook specification: it adds the gross specification amount to `amountEligibleForFees`, subtracts `_feeAmountFrom(specification.amount)` from that individual output, and forwards only the net amount to the hook.
- After all net transfers, both `_sendPayoutsOf(...)` and `_cashOutTokensOf(...)` call `_takeFeeFrom(amountEligibleForFees)` once. `_takeFeeFrom(...)` recomputes the fee from the aggregate gross amount, then either pays the fee project through `executeProcessFee(...)` or stores a held-fee entry for that same aggregate gross basis when `holdFees` is enabled.
- `JBFees.feeAmountFrom(...)` floors percentage math, with a 1-unit minimum for nonzero feeable amounts. The aggregate fee is therefore not guaranteed to equal the sum of the individual output fees that were actually withheld before transfers.
- Fresh source recheck: the current `JBMultiTerminal` still adds gross beneficiary reclaim, gross hook-spec amounts, gross split payout amounts, and gross owner leftover amounts into `amountEligibleForFees`, while `_takeFeeFrom(...)` still calls `_feeAmountFrom(amountEligibleForFees)` once on the aggregate basis.
- A temporary local review test `RegressionCashOutAggregateFeeRounding.t.sol` proved the undercollateralized direction: a data hook returned 200 wei to the beneficiary and two 100 wei hook specs. The beneficiary received 195 wei, the hooks received 98 wei each, and the terminal retained only 9 wei total, but `_takeFeeFrom(400)` recorded a 10 wei fee for project `1`. The source project store balance became zero while the fee project store balance was 10 and the terminal's real ETH balance was only 9. The temporary file was removed after the proof run.
- A second temporary local review test `RegressionPayoutAggregateFeeRounding.t.sol` proved the same accounting break in ordinary payouts: two 100 wei payout splits and 200 wei owner leftover paid out 98, 98, and 195 wei respectively, while the aggregate gross 400 wei payout recorded a 10 wei fee and left only 9 wei in the terminal. The temporary file was removed after the proof run.

Impact:

- The terminal store can claim more value than the terminal actually holds. If other project balances are present in the same terminal, later fee-project payouts or cash-outs can consume collateral that belongs to other projects; if no extra collateral exists, otherwise valid fee-project operations can revert.
- Because fee processing mints fee-project tokens to the configured fee beneficiary for the aggregate fee amount, a caller/project owner can receive fee-project accounting credit for more value than the terminal actually retained from the payout or cash-out.
- The value difference is rounding-bounded per output, but it is repeatable. Payout split count is project-configured and cash-out hook output count is controlled by the project's cash-out data hook subject only to gas. When `holdFees` is enabled, the mismatch becomes a delayed liability that materializes when held fees are processed. Immutable core accounting should not permit cumulative store undercollateralization or unallocated retained dust in either rounding direction.

Recommended fix:

- Make payout and cash-out fee accounting use one source of truth. Either compute the aggregate fee once, allocate that exact fee across split/owner/beneficiary/hook outputs before any transfer, and credit exactly that amount, or process/credit each per-output fee using the exact amount already withheld from that output.
- Preserve the invariant that the gross store balance reduction equals net external transfers plus the exact fee amount credited or held, with no extra terminal-level shortfall or surplus.
- Add regression and fuzz coverage with multiple payout splits plus owner leftover, and with beneficiary reclaim plus multiple hook specifications, including small amounts around fee-rounding boundaries and the 1-unit minimum-fee path.
- Update preview logic if the fix changes net beneficiary or hook amounts.

### AB. `deploy-all-v6`: REV resume retries approval after `REVDeployer` already owns project `3`

Severity: `MED`

Status: FIXED. Merged to main in `deploy-all-v6/script/Resume.s.sol`. Moved the `_projects.approve(...)` call inside the `controllerOf == address(0)` check so it only runs when Phase 07 actually needs configuration.

Affected code:

- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2021)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2113)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2116)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:3067)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:3091)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:785)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:818)

Why it is real:

- `_resumeRevnet()` first calls `_ensureProjectExists(_REV_PROJECT_ID)`.
- `_ensureProjectExists(...)` returns the project ID when the project already has a controller and `_isCanonicalConfiguredProject(...)` passes. For project `3`, that canonical check requires ownership by the expected `REVDeployer`, the expected controller, a nonzero REV configuration hash, and the `REV` token symbol.
- `REVDeployer._deployRevnetFor(...)` transfers an existing pre-created project NFT from its old owner to `REVDeployer` when it configures the project as a revnet.
- After `_ensureProjectExists(...)` returns, `_resumeRevnet()` deploys/resolves the REV helper contracts and unconditionally calls `_projects.approve({to: address(_revDeployer), tokenId: _revProjectId})`.
- On a completed Phase 07 state, the deployment Safe is no longer project `3`'s owner. A Safe-authored `approve` call therefore fails under ERC-721 authorization rules before the later `controllerOf(_revProjectId) == address(0)` branch can skip configuration.
- A temporary local review test `RegressionResumeRevnetCanonicalApproval.t.sol` modeled the current order: a canonical project `3` owned by `REVDeployer` satisfied the resume helper, and the next non-owner approval reverted. The temporary file was removed after the proof run.
- Fresh recheck command evidence: `rg -n "_resumeRevnet|_ensureProjectExists|_isCanonicalConfiguredProject|_projects\\.approve|REV_PROJECT_ID" script/Resume.s.sol test/review test/fork` still shows the unconditional `_projects.approve(...)` in `_resumeRevnet()` after `_ensureProjectExists(_REV_PROJECT_ID)` and before the `controllerOf(_revProjectId) == address(0)` branch.

Impact:

- If the deployment succeeds through Phase 07 and then fails later in CPN/NANA/Banny/Defifa/periphery phases, the current resume script can halt while replaying Phase 07 instead of skipping the already-completed REV configuration.
- This undermines the deploy-all recovery model: operators cannot rely on a single resume command to converge after a late interruption, even when the existing project `3` state is exactly canonical.
- The verifier can still prove the final state if operators reach it by a manual workaround, but the documented automated recovery path is not executable for a common partial-success boundary.

Recommended fix:

- Move the `projects.approve(...)` call inside the `controllerOf(_revProjectId) == address(0)` branch, after verifying the Safe still owns the blank project.
- If `controllerOf(_revProjectId) != address(0)`, require `_isCanonicalConfiguredProject(_REV_PROJECT_ID)` and return without retrying approval or deployment.
- Add a regression that executes a real or exact-equivalence resume after canonical Phase 07 is complete and asserts the script skips REV without any project-NFT approval attempt.

### AC. `deploy-all-v6`: Banny resolver metadata initialization is called by the wrong owner

Severity: `HIGH`

Status: OPEN / DEPLOY-BLOCKING. Phase 09 constructs the Banny token URI resolver with the Banny operator as owner, then immediately calls `setMetadata(...)` from the deployment authority. That setter is `onlyOwner`, so the clean deploy path reverts before the BAN/Banny revnet can be launched.

Affected code:

- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2493)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2502)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2580)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2589)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2571)
- [Banny721TokenUriResolver.sol](/Users/jango/Documents/jb/v6/evm/banny-retail-v6/src/Banny721TokenUriResolver.sol:175)
- [Banny721TokenUriResolver.sol](/Users/jango/Documents/jb/v6/evm/banny-retail-v6/src/Banny721TokenUriResolver.sol:1202)

Why it is real:

- `_deployBanny()` deploys `Banny721TokenUriResolver` with `owner: operator`, where `operator` is the Banny operator multisig, not `safeAddress()`.
- The same branch immediately calls `resolver.setMetadata(...)` from the deployment script.
- `_resumeBanny()` mirrors the same constructor ownership and setter call. It also tries to repair an interrupted resolver whose `svgDescription()` is empty, but that repair path again calls `setMetadata(...)` from the resume authority, not from the resolver owner.
- `Banny721TokenUriResolver` inherits `Ownable(owner)`, and `setMetadata(...)` is guarded by `onlyOwner`.
- A temporary local review test `RegressionBannyResolverMetadataOwner.t.sol` confirmed the deploy authority cannot call `setMetadata(...)` when the resolver owner is the operator, while the operator can. The temporary file was removed after the proof run.
- Scope recheck: `forge test --match-path test/TestRegressionGaps.sol --match-test 'test_metaTx_forwarderRelaysOwnerAction|test_metaTx_forwarderRelaysNonOwnerAction_reverts' --skip script -vv` passes in `banny-retail-v6`, confirming the resolver owner can set metadata through the trusted forwarder and a non-owner forwarded call reverts. Running the same focused test without `--skip script` still fails at compile time because the repo's standalone `script/Deploy.s.sol` constructs `JBSuckerDeployerConfig` without the current `peer` field, matching optional cleanup item 5.

Impact:

- A clean Phase 09 deployment cannot complete as written. The Banny resolver deploys, then metadata initialization reverts, so the BAN/Banny revnet is never launched in the one-shot path.
- A resume after the resolver exists but metadata is empty repeats the same unauthorized setter call and cannot repair the interrupted state.
- This blocks the canonical project `4` rollout independently of the generic project-`4` skip issue: even without an attacker or project-ID drift, the happy path halts on resolver metadata ownership.

Recommended fix:

- Either deploy the resolver with the deployment Safe as temporary owner, call `setMetadata(...)`, then transfer ownership to the Banny operator, or pass all immutable metadata through the constructor and remove the immediate `onlyOwner` setter dependency.
- Mirror the same ownership sequence in `Resume.s.sol`; if the resolver already exists with empty metadata and the Safe no longer owns it, fail with an explicit recovery message instead of retrying an unauthorized setter.
- Add a regression that executes Phase 09 through the resolver deploy/metadata path and asserts metadata is initialized and final resolver ownership is the intended operator.

### AD. `defifa`: launcher-selected terminals and game-phase inputs make games unsafe

Severity: `HIGH`

Status: OPEN / DEPLOY-BLOCKING. `DefifaDeployer.launchGameWith(...)` is permissionless and lets the launcher choose the terminal that is registered for the game. `DefifaHook` then trusts any registered terminal as the source of pay and cash-out callbacks, so a malicious terminal can fabricate hook contexts without recording a real terminal payment or cash-out. The same launch/runtime surface also allows impossible scorecard timing, one-tier zero-timeout games, and live-balance top-ups to distort or lock game phases.

Affected code:

- [DefifaDeployer.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaDeployer.sol:383)
- [DefifaDeployer.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaDeployer.sol:785)
- [DefifaLaunchProjectData.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/structs/DefifaLaunchProjectData.sol:53)
- [DefifaDeployer.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaDeployer.sol:233)
- [DefifaDeployer.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaDeployer.sol:420)
- [DefifaDeployer.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaDeployer.sol:430)
- [DefifaGovernor.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaGovernor.sol:328)
- [DefifaHook.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaHook.sol:523)
- [DefifaHook.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaHook.sol:714)

Why it is real:

- `launchGameWith(...)` takes public launch data and ultimately sets `JBTerminalConfig.terminal` to `launchProjectData.terminal`.
- The core controller registers that terminal in `JBDirectory` while launching the game's rulesets.
- `DefifaHook.afterPayRecordedWith(...)` and `afterCashOutRecordedWith(...)` validate only `DIRECTORY.isTerminalOf(projectId, msg.sender)` plus the context project ID. They do not prove the caller is the canonical Juicebox terminal implementation, nor that the terminal actually recorded a payment or cash-out.
- A temporary local review test `RegressionLauncherTerminalCallback.t.sol` launched a game with a fake terminal, had that fake terminal call `afterPayRecordedWith(...)` directly, and minted a Defifa NFT for the chosen beneficiary without going through a real terminal payment. The temporary file was removed after the proof run.
- Scope recheck on 2026-05-06: `forge test --match-path 'test/regression/*.t.sol' -vv` passes in `defifa` (53 tests), so this edge case is about the still-open launch/callback trust and game-phase inputs, not one of the fixed historical Defifa accounting/regression items.
- Fresh source recheck on 2026-05-06 confirms the launch surface is still present: `DefifaLaunchProjectData` exposes a public `terminal`, `_launchGame(...)` registers that exact terminal in `JBTerminalConfig`, and the hook callback guards still authenticate directory membership rather than canonical terminal provenance.
- Launch validation only checks `scorecardTimeout > attestationGracePeriod + timelockDuration`; it does not include the delay between scoring start and `attestationStartTime`. A valid-looking launch can therefore make attestations begin too late for any scorecard to be ratified before the no-contest timeout.
- `RISKS.md` documents that one-tier games require `scorecardTimeout > 0`, but `launchGameWith(...)` still allows `tiers.length == 1` with `scorecardTimeout == 0`; focused rechecks of `SingleTierTimeoutLock.t.sol` and `OneTierZeroTimeoutLock.t.sol` both pass by proving this launch shape still succeeds.
- Once such a one-tier game reaches scoring, the only possible valid scorecard gives the sole tier the full cash-out weight. BWA therefore gives every holder zero attestation power, `attestToScorecardFrom(...)` rejects zero-weight attestations, and the disabled timeout prevents fallback into `NO_CONTEST`.
- `currentGamePhaseOf(...)` checks minimum participation with the live terminal store balance. Anyone can push a below-threshold game into `SCORING` by adding balance directly without minting Defifa NFTs or creating attestation participants.

Impact:

- Any permissionless Defifa game launcher can choose a callback-forging terminal and then mint arbitrary game NFTs, distort attestation/voting state, and potentially fabricate cash-out hook contexts for that game.
- A launcher can also publish games whose scorecard process is impossible to complete, including one-tier zero-timeout games that can permanently lock participant funds once scoring begins, while third parties can force below-participation games out of the no-contest path by direct balance top-ups.
- This makes the deployed Defifa launcher unsafe for users and developers even if the canonical deploy-all Defifa infrastructure addresses are otherwise correct.

Recommended fix:

- Restrict Defifa launches to a trusted terminal allowlist, or require the terminal to match the canonical `JBMultiTerminal` / vetted terminal manifest for the launch token and chain.
- If custom terminals must be supported, add terminal identity/codehash/interface provenance checks at launch and document that the game inherits that terminal's trust boundary.
- Consider hardening hook callbacks so `DefifaHook` accepts only the configured trusted terminal address recorded at initialization, not any terminal that can later appear in the directory.
- Validate `attestationStartTime - scoringStartTime + attestationGracePeriod + timelockDuration < scorecardTimeout` when a scorecard timeout is configured.
- Reject `tiers.length == 1 && scorecardTimeout == 0`, or special-case single-tier governance so every launched game has a reachable `COMPLETE` or `NO_CONTEST` terminal state.
- Track minimum participation with paid mint count/value or live NFT participation, not raw terminal balance that `addToBalanceOf(...)` can inflate without minting.

### AE. `nana-distributor-v6`: distributor accounting can assign stale ERC-20 and exhaust vesting dust

Severity: `HIGH`

Status: OPEN / DEPLOY-BLOCKING (PARTIALLY FIXED). The vesting dust sub-issue (historical #59) is fixed: `shareClaimed` now only updates when `claimAmount != 0`. The stale ERC-20 balance attribution issue remains open: both distributor variants accept controller-prepaid ERC-20 split credit by comparing current token balance against one global accounted balance. Any direct ERC-20 transfer into a distributor becomes global unaccounted balance that any authorized project controller can later attribute to its chosen hook.

Affected code:

- [JBTokenDistributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JBTokenDistributor.sol:79)
- [JBTokenDistributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JBTokenDistributor.sol:100)
- [JB721Distributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JB721Distributor.sol:110)
- [JB721Distributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JB721Distributor.sol:131)
- [JBDistributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JBDistributor.sol:100)
- [JBDistributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JBDistributor.sol:105)
- [JBDistributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JBDistributor.sol:560)
- [JBDistributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JBDistributor.sol:563)

Why it is real:

- `processSplitWith(...)` authorizes both project terminals and the project's controller.
- For ERC-20 splits, if the caller's allowance is lower than `context.amount`, the code treats the call as controller-prepaid and checks `IERC20(token).balanceOf(address(this)) - _accountedBalanceOf[token]`.
- `_accountedBalanceOf[token]` is global per token, not scoped to the controller, project, sender, or intended hook. Direct ERC-20 transfers, airdrops, or other stray balances therefore satisfy the prepaid proof for any later authorized controller call.
- Current recheck on 2026-05-06: `forge test --match-path test/regression/Regression20260505.t.sol -vv` passes in `nana-distributor-v6` (2 tests) and confirms both `test_unaccountedPrepaidCreditCanBeSweptByController()` and `test_repeatedZeroAmountCollectsPermanentlyReserveDust()`.
- Fresh source recheck on 2026-05-06 confirms both distributor variants still keep the controller-prepaid ERC-20 path: if caller allowance is below `context.amount`, `processSplitWith(...)` compares `IERC20(token).balanceOf(address(this)) - _accountedBalanceOf[token]` against the requested amount and credits `context.split.beneficiary`.
- `_unlockTokenIds(...)` computes `claimAmount` with `mulDiv(...)`, then immediately sets `shareClaimed = MAX_SHARE - lockedShare` even when the rounded `claimAmount` is zero. For small vesting entries, repeated zero-amount partial unlocks can consume the entry's share and advance the latest-vested index without transferring the remaining dust.

Impact:

- Stray or accidentally transferred ERC-20 rewards in either distributor can be assigned to an attacker-controlled votes hook by any project whose controller can call `processSplitWith(...)`.
- Users see the tokens sitting in the canonical distributor, but the internal accounting can be credited to the wrong hook and then distributed to the attacker's chosen holders.
- Small reward entries can remain trapped in the distributor while the accounting marks the holder's vesting entry as exhausted, breaking exact reward recovery for low-decimal tokens or dust-sized split allocations.

Recommended fix:

- Remove the implicit global prepaid branch for ERC-20s, or require a dedicated `fund(...)` / `depositForHook(...)` entrypoint that records the sender, token, amount, and target hook before `processSplitWith(...)` can consume it.
- If controller-prepaid funding must stay implicit, scope unaccounted credits to the authenticated controller/project and target hook, not a global token balance.
- Add regression coverage for stale direct-transfer balances across both `JBTokenDistributor` and `JB721Distributor`.
- Do not advance `shareClaimed` when `claimAmount == 0`, or force all remaining rounded dust into the final unlock when `lockedShare == 0`.
- Add a small-amount vesting regression that collects across every round and verifies the beneficiary can recover the full vested entry or that the unrecoverable dust remains explicitly accounted.

### AF. `nana-core-v6`: ERC777-style reentrant deposits can double-count balance deltas

Severity: `HIGH`

Status: ACCEPTED. ERC-777 reentrancy in `_acceptFundsFor` is treated as an accepted integration risk. See `nana-core-v6/RISKS.md` §3 (lines 158-159). Projects choosing ERC-777 tokens accept this risk; standard ERC-20 tokens are not affected.

Affected code:

- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:238)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:588)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:996)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:1046)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:1049)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:1052)

Why it is real:

- `_acceptFundsFor(...)` snapshots `_balanceOf(token)`, calls `_transferFrom(...)`, then returns `_balanceOf(token) - balanceBefore`.
- Neither `pay(...)` nor `addToBalanceOf(...)` is protected by a reentrancy guard.
- Fresh source recheck on 2026-05-06 confirms `JBMultiTerminal` still imports no `ReentrancyGuard`, `pay(...)` and `addToBalanceOf(...)` still call `_acceptFundsFor(...)`, and `_transferFrom(...)` still reaches `IERC20(token).safeTransferFrom(...)` or Permit2 before the outer balance delta is computed.
- If the token invokes a sender/receiver callback during `_transferFrom(...)`, the callback can reenter `pay(...)` or `addToBalanceOf(...)`. The inner call accounts its own transfer. When the outer transfer resumes, the outer `balanceBefore` is still the pre-inner balance, so the outer accepted amount includes the inner transfer too.
- A temporary local review test `RegressionReentrantERC20Intake.t.sol` exposed `_acceptFundsFor(...)` and used a callback token to reenter during `transferFrom(...)`; the inner call returned `100`, the outer call returned `200`, but only `200` tokens reached the terminal, so the two accounting results summed to `300` against `200` real tokens. The temporary file was removed after the proof run.
- The issue is limited to callback-capable or otherwise reentrant ERC-20s, but Juicebox projects can configure arbitrary ERC-20 accounting contexts, so the core terminal should not rely on token non-reentrancy.

Impact:

- A reentrant accepted-token payment can mint or credit project balances for more value than was transferred into the terminal.
- Downstream surplus, payout, and cash-out accounting can then treat the over-accounted deposit as real terminal balance.

Recommended fix:

- Add reentrancy protection around terminal token intake paths (`pay`, `addToBalanceOf`, and any shared internal entrypoint that can call `_acceptFundsFor(...)`).
- Alternatively, make ERC-20 intake pull exactly the requested amount into isolated accounting before executing any reentrant-capable logic, and reject tokens whose transfer side effects can change the same terminal balance during intake.
- Add a malicious callback-token regression that reenters `pay(...)` during `_transferFrom(...)` and asserts the outer call cannot account the inner transfer twice.

### AG. `nana-buyback-hook-v6`: registry-scoped quote metadata is ignored by resolved hooks

Severity: `HIGH`

Status: FIXED. Merged to main in `nana-buyback-hook-v6/src/JBBuybackHookRegistry.sol`. The registry now remaps any metadata entry addressed to itself into one addressed to the resolved hook before forwarding.

Affected code:

- [JBBuybackHookRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHookRegistry.sol:338)
- [JBBuybackHookRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHookRegistry.sol:358)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:806)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:833)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2049)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2060)

Why it is real:

- `deploy-all-v6` passes `IJBBuybackHookRegistry(address(_buybackRegistry))` into canonical revnet deployment, so the registry is the data hook integrators and clients see.
- `JBBuybackHookRegistry.beforePayRecordedWith(...)` resolves the project-specific or default hook and forwards the original `context.metadata` unchanged.
- `JBBuybackHook.beforePayRecordedWith(...)` then calls `JBMetadataResolver.getId("quote")`, which scopes the metadata ID to `address(this)`, the concrete hook implementation, not the registry address that received the original hook call.
- Metadata encoded as `getId("quote", address(registry))` is therefore absent from the resolved hook's perspective. The hook treats the payment as no-quote flow and derives routing from TWAP instead of enforcing the caller's explicit minimum.
- The buyback risk register explicitly says mint-vs-swap routing depends on explicit caller quote data or TWAP-derived quoting, and the README says programmatic callers can provide quote metadata. The current registry forwarding path makes the intuitive registry-scoped form ineffective.
- Scope recheck on 2026-05-06: `forge test --match-path test/regression/RegistryMetadataBoundary.t.sol -vv` passes in `nana-buyback-hook-v6` (1 test) and confirms registry-keyed quote metadata is ignored while hook-keyed quote metadata activates the swap path.
- Fresh source recheck on 2026-05-06 confirms the registry still forwards `context.metadata` unchanged to `_resolvedHookOf(context.projectId)`, while the resolved hook still parses `JBMetadataResolver.getId("quote")` against its own address.

Impact:

- User and integration slippage protection can be silently dropped on canonical revnet buyback payments.
- Transactions may execute against the TWAP-derived route even when the caller provided a stricter explicit quote floor to the visible data hook.

Recommended fix:

- Make `JBBuybackHookRegistry` translate registry-scoped `quote` metadata into the resolved hook's metadata ID before forwarding.
- Alternatively, define the buyback quote metadata ID as a stable registry/interface-scoped ID that both registry and hook implementations parse.
- Document the exact metadata target address after the code path is fixed, and add a regression covering registry-scoped quote metadata on the canonical registry-forwarded payment path.

### AH. `nana-suckers-v6`: swap-enabled native-token V4 routes revert before settlement

Severity: `HIGH`

Status: DEFERRED / NOT IN INITIAL ROLLOUT. This is not part of the initial `deploy-all-v6` Phase 03 path while it deploys plain `JBCCIPSucker` instances, but it blocks enabling `JBSwapCCIPSucker` for native-token cross-currency routes. Swap-enabled native routes are disabled for initial deploy.

Affected code:

- [JBSwapCCIPSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSwapCCIPSucker.sol:541)
- [JBSwapCCIPSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSwapCCIPSucker.sol:596)
- [JBSwapPoolLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSwapPoolLib.sol:111)
- [JBSwapPoolLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSwapPoolLib.sol:238)

Why it is real:

- `JBSwapCCIPSucker._sendRootOverAMB(...)` swaps local tokens into the bridge token before CCIP bridging when `token != BRIDGE_TOKEN`.
- Native-token routes pass the raw native-token sentinel into `_executeSwap(...)` after `prepare()` has delivered raw ETH to the sucker.
- `JBSwapPoolLib.executeSwap(...)` normalizes the native-token sentinel to WETH for V3/V4 pool discovery.
- When discovery selects a V4 pool, `executeV4UnlockCallback(...)` sees the V4 input currency as native (`address(0)`) and calls `IWrappedNativeToken(weth).withdraw(amountIn)` before settling. The sucker holds raw ETH, not WETH, so the withdraw reverts before settlement.
- Fresh source recheck on 2026-05-06 confirms `_sendRootOverAMB(...)` still calls `_executeSwap({tokenIn: token, tokenOut: bridgeTokenAddr, amount})` for cross-token sends, `executeSwap(...)` still normalizes `NATIVE_TOKEN` to WETH before V4 discovery, and `executeV4UnlockCallback(...)` still unconditionally withdraws WETH before `poolManager.settle{value: amountIn}()` when the V4 input currency is native.
- A temporary local review test `RegressionNativeV4SettlementRevert.t.sol` called the V4 unlock settlement path with raw ETH on the caller and no WETH balance; it reverted on the pre-settlement `withdraw(...)`, then the temporary file was removed after the proof run.

Impact:

- Swap-enabled native-token sends can revert whenever the best route is a V4 pool, blocking cross-chain bridge operations for that route.
- Because route selection is liquidity-based, a V4 pool can become the selected route as liquidity moves even if the path previously worked through V3.

Recommended fix:

- Wrap raw native ETH to WETH before entering the V4 swap path, or treat native V4 settlement as raw ETH without attempting a WETH withdraw.
- Add a regression that exercises `JBSwapCCIPSucker` native-token outbound swap with a V4-selected pool and proves settlement succeeds without requiring pre-existing WETH.

### AI. `deploy-all-v6`: verifier does not authenticate the 721 hook clone surface

Severity: `HIGH`

Status: OPEN / DEPLOY-BLOCKING. Phase 03a deploys a shared `JB721TiersHook` implementation, `JB721CheckpointsDeployer`, and `JB721TiersHookDeployer` that future Croptop, revnet, omnichain, Banny, and user-created 721 hooks inherit through clones. `Verify.s.sol` only proves that the deployer and store addresses contain code, and that `JB721TiersHookProjectDeployer.HOOK_DEPLOYER()` returns the supplied deployer. It never proves that the deployer clones the intended base hook, points at the intended store/address registry, or that the base hook's immutable core dependencies and checkpoint deployer match the deployment manifest.

Affected code:

- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:714)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:724)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:750)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:696)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:702)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:710)
- [JB721TiersHookDeployer.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721TiersHookDeployer.sol:25)
- [JB721TiersHookDeployer.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721TiersHookDeployer.sol:78)
- [JB721TiersHook.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721TiersHook.sol:69)
- [JB721TiersHook.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721TiersHook.sol:806)
- [JB721CheckpointsDeployer.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721CheckpointsDeployer.sol:21)

Why it is real:

- `Deploy.s.sol` constructs `JB721CheckpointsDeployer` with the shared hook store, then constructs the base `JB721TiersHook` with `directory`, `permissions`, `prices`, `rulesets`, `hookStore`, `splits`, `checkpointsDeployer`, and `trustedForwarder`, then constructs `JB721TiersHookDeployer` with the base hook, store, address registry, and trusted forwarder.
- `JB721TiersHookDeployer.deployHookFor(...)` clones `HOOK`, initializes the clone, transfers ownership, and registers the clone through `ADDRESS_REGISTRY`.
- Each cloned `JB721TiersHook` lazily deploys its checkpoint module by calling the base hook's immutable `CHECKPOINTS_DEPLOYER`.
- `Verify.s.sol` Category 5 does not read `hookDeployer.HOOK()`, `hookDeployer.STORE()`, or `hookDeployer.ADDRESS_REGISTRY()`. It also does not load the base hook address, does not inspect the base hook's `DIRECTORY()`, `PRICES()`, `RULESETS()`, `STORE()`, `SPLITS()`, trusted forwarder, or checkpoint deployer, and does not load/check `JB721CheckpointsDeployer.STORE()` or `IMPLEMENTATION()`.
- Temporary local review test `RegressionVerify721DeployerGap.t.sol` in `deploy-all-v6` modeled the current Category 5 checks and passed with a hook deployer whose `HOOK`, `STORE`, and `ADDRESS_REGISTRY` were all different from the expected deployment components. The temporary file was removed after the proof run.
- Fresh source recheck on 2026-05-06 confirms the missing checks are still absent: `rg` finds no `VERIFY_HOOK_721`, checkpoint deployer verifier address, `hookDeployer.HOOK()`, `hookDeployer.STORE()`, or `hookDeployer.ADDRESS_REGISTRY()` check in `Verify.s.sol`.

Impact:

- A production verification run can pass while every future 721 hook clone comes from the wrong implementation or stores/registers state through the wrong shared components.
- This affects user-created 721 projects and composed products that depend on the shared deployer, including Croptop, revnets with 721 tiers, omnichain-deployed 721 hooks, and any downstream distributor/checkpoint integration.
- Because the base hook's checkpoint deployer is immutable and internal, a wrong checkpoint deployer can poison historical voting/reward behavior without being visible through the current verifier.

Recommended fix:

- Add verifier inputs for the base 721 hook and checkpoint deployer, or derive their deterministic addresses from the deploy manifest.
- In `Verify.s.sol`, assert `hookDeployer.HOOK()`, `hookDeployer.STORE()`, and `hookDeployer.ADDRESS_REGISTRY()` match the deployed base hook, hook store, and address registry.
- Assert the base hook's public immutables match the deployed core contracts: `DIRECTORY`, `PRICES`, `RULESETS`, `STORE`, `SPLITS`, and trusted forwarder via `isTrustedForwarder(...)`.
- Expose or otherwise verify the base hook checkpoint deployer, then assert `JB721CheckpointsDeployer.STORE() == hookStore` and `IMPLEMENTATION().code.length > 0`.
- Add a regression where Category 5 verification fails when the hook deployer points at a wrong base hook/store/address registry.

### AJ. `deploy-all-v6`: verifier does not authenticate REV runtime singleton wiring

Severity: `HIGH`

Status: OPEN / DEPLOY-BLOCKING. Phase 07 deploys the REV runtime singleton surface that every canonical revnet uses for loans, cash-out hooks, hidden-token accounting, sucker-aware supply/surplus accounting, and buyback routing. `Verify.s.sol` requires `VERIFY_REV_DEPLOYER`, `VERIFY_REV_OWNER`, and `VERIFY_REV_LOANS` on production chains, but it only checks a subset of `REVDeployer` wiring plus the `REVOwner.DEPLOYER()` backpointer. It never loads `REVHiddenTokens`, never checks `REVOwner`'s runtime immutables, and only proves that `REVDeployer.LOANS()` equals the supplied loans address, not that the loans contract itself has the intended owner, Permit2, controller, revnet ID, or sucker registry.

Affected code:

- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2025)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2035)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2059)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:303)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:777)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:830)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:856)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:865)
- [REVOwner.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVOwner.sol:64)
- [REVOwner.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVOwner.sol:73)
- [REVLoans.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVLoans.sol:109)
- [REVLoans.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVLoans.sol:121)
- [REVHiddenTokens.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVHiddenTokens.sol:32)

Why it is real:

- `Deploy.s.sol` constructs `REVLoans` with `controller`, `suckerRegistry`, the canonical REV fee project ID, Safe owner, Permit2, and trusted forwarder.
- The same phase deploys `REVHiddenTokens` with the controller and trusted forwarder, then constructs `REVOwner` with the buyback-hook registry, directory, fee revnet ID, sucker registry, loans contract, and hidden-token contract.
- `REVOwner` exposes the exact runtime dependencies the verifier should authenticate: `BUYBACK_HOOK`, `DIRECTORY`, `FEE_REVNET_ID`, `HIDDEN_TOKENS`, `LOANS`, `SUCKER_REGISTRY`, and `DEPLOYER`.
- `REVLoans` exposes the needed manifest hooks as well: `PERMIT2`, `CONTROLLER`, `DIRECTORY`, `PRICES`, `REV_ID`, `SUCKER_REGISTRY`, and `owner()`.
- `Verify.s.sol` only reads `VERIFY_REV_DEPLOYER`, `VERIFY_REV_OWNER`, and `VERIFY_REV_LOANS`. There is no `VERIFY_REV_HIDDEN_TOKENS` / hidden-token address in `DEPLOY.md` or the verifier, and Category 6 never calls `revOwner.BUYBACK_HOOK()`, `revOwner.FEE_REVNET_ID()`, `revOwner.HIDDEN_TOKENS()`, `revOwner.LOANS()`, `revOwner.SUCKER_REGISTRY()`, `revLoans.PERMIT2()`, `revLoans.REV_ID()`, or `revLoans.SUCKER_REGISTRY()`.
- Fresh source recheck on 2026-05-06 used `rg` over `Deploy.s.sol`, `Verify.s.sol`, `DEPLOY.md`, `REVOwner.sol`, `REVLoans.sol`, and `REVHiddenTokens.sol`; it confirmed the getters exist but the verifier surface does not consume them.

Impact:

- A production verification run can pass while the runtime hook that calculates revnet cash-outs and pay routing points at the wrong buyback registry, fee revnet ID, sucker registry, loans contract, or hidden-token contract.
- A wrong `REVLoans` singleton can bake in an incorrect `REV_ID`, Permit2, owner, controller, or sucker registry while still satisfying the current `REVDeployer.LOANS() == VERIFY_REV_LOANS` predicate.
- Because projects `1-4` are immutable revnets, a verifier false positive here means the post-deploy evidence would not prove the contracts that actually move loan/cash-out value are the audited singleton instances.

Recommended fix:

- Add `VERIFY_REV_HIDDEN_TOKENS` to `Verify.s.sol` and `DEPLOY.md`, or deterministically derive the expected `REVHiddenTokens` address from the deploy manifest.
- In Category 6, assert `REVHiddenTokens.CONTROLLER() == controller`, `REVHiddenTokens.PROJECTS() == projects`, and trusted-forwarder parity if the forwarder is considered part of the manifest.
- Assert `REVOwner.BUYBACK_HOOK() == buybackRegistry`, `DIRECTORY() == directory`, `FEE_REVNET_ID() == 3`, `SUCKER_REGISTRY() == suckerRegistry`, `LOANS() == revLoans`, `HIDDEN_TOKENS() == revHiddenTokens`, and `DEPLOYER() == revDeployer`.
- Assert `REVLoans.CONTROLLER() == controller`, `DIRECTORY() == directory`, `PRICES() == prices`, `REV_ID() == 3`, `SUCKER_REGISTRY() == suckerRegistry`, `PERMIT2() == expected Permit2`, `owner() == VERIFY_SAFE`, and trusted-forwarder parity.
- Add a verifier regression that fails when `REVOwner.HIDDEN_TOKENS`, `REVOwner.BUYBACK_HOOK`, or `REVLoans.REV_ID` differs from the deploy manifest while the current Category 6 predicates still pass.

### AK. `deploy-all-v6`: verifier does not authenticate the core ERC-20 clone implementation

Severity: `HIGH`

Status: OPEN / DEPLOY-BLOCKING. Phase 01 deploys the reusable `JBERC20` implementation and bakes it into `JBTokens`. Every project token created through `deployERC20For(...)` is then cloned from `JBTokens.TOKEN()`. `Verify.s.sol` loads only `VERIFY_TOKENS` and proves that the controller and terminal point at that `JBTokens` contract; it never loads or derives the ERC-20 implementation address, never checks `JBTokens.TOKEN()`, and never authenticates the implementation's own `PROJECTS()` / `PERMISSIONS()` dependencies.

Affected code:

- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:640)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:646)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:688)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:695)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:258)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:557)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:652)
- [JBTokens.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBTokens.sol:38)
- [JBTokens.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBTokens.sol:69)
- [JBTokens.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBTokens.sol:215)
- [JBERC20.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBERC20.sol:35)
- [JBERC20.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBERC20.sol:66)
- [JBERC20.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBERC20.sol:143)

Why it is real:

- `Deploy.s.sol` computes or deploys `JBERC20` with `permissions` and `projects`, then computes or deploys `JBTokens` with the deployed token implementation.
- `Resume.s.sol` repeats the same Phase 01 reconstruction path, so interrupted deployments rely on the same baked implementation address.
- `JBTokens` exposes `TOKEN` as a public immutable, and `deployERC20For(...)` uses `Clones.clone(address(TOKEN))` / `cloneDeterministic(address(TOKEN), ...)` before initializing the clone with `tokens: address(this)`.
- `JBERC20` exposes the manifest-critical `PROJECTS` immutable and inherits the public `PERMISSIONS()` getter from `JBPermissioned`. Its ERC-1271 signature path resolves project ownership through `PROJECTS.ownerOf(projectId)` and operator authorization through `PERMISSIONS.hasPermission(...)`.
- `Verify.s.sol` has no `VERIFY_ERC20_IMPLEMENTATION` env input, does not import `JBERC20`, and the only `tokens` checks found are downstream references from `JBController.TOKENS()` and `JBMultiTerminal.TOKENS()` plus deployed project-token symbol reads.
- Fresh source recheck on 2026-05-06 used `rg -n "TOKEN\\(|JBERC20|JBTokens|tokens\\.|VERIFY_.*TOKEN|VERIFY_TOKENS|PERMISSIONS\\(|PROJECTS\\(|DIRECTORY\\(" script/Verify.s.sol` in `deploy-all-v6`, plus direct reads of `JBTokens.sol` and `JBERC20.sol`; it confirmed the getter surface exists but the verifier does not consume it.

Impact:

- A production verification run can pass while future project-created ERC-20s are cloned from an unauthenticated implementation.
- A wrong implementation can change token mint/burn/metadata/signature behavior, or bind ERC-1271 and permission checks to the wrong `JBProjects` / `JBPermissions` contracts, while all current controller/terminal-to-`JBTokens` predicates still pass.
- Because project ERC-20 deployment is a developer-facing core feature, this verifier false positive would let post-deploy evidence claim that the core token system is authenticated when the actual clone template remains unproven.

Recommended fix:

- Add `VERIFY_ERC20_IMPLEMENTATION` to `Verify.s.sol` and `DEPLOY.md`, or deterministically derive the expected implementation address from Phase 01's `JBERC20` creation code, salt, and constructor args.
- Add a core-token verifier category that asserts `tokens.DIRECTORY() == directory` and `tokens.TOKEN() == erc20Implementation`.
- Import/check the implementation as `JBERC20` and assert `JBERC20(erc20Implementation).PROJECTS() == projects` and `PERMISSIONS() == permissions`; include trusted-forwarder-related checks if the token implementation later becomes ERC-2771-aware.
- Add a regression where verification fails when `JBTokens.TOKEN()` points at an implementation with the wrong `PROJECTS` or `PERMISSIONS` dependency, even though `JBController.TOKENS()` and `JBMultiTerminal.TOKENS()` are correct.

### AL. `deploy-all-v6`: core idempotency checks predict wrong CREATE2 addresses

Severity: `MED`

Status: OPEN / DEPLOY-BLOCKING. The core deploy/resume paths use `_isDeployed(...)` before deploying `JBTerminalStore`, `JBMultiTerminal`, and `JBController`, but the encoded constructor arguments passed to `_isDeployed` do not match the actual constructor order used by the subsequent named-argument deployments. The first uninterrupted deployment still constructs the contracts with the right named args, but any deploy/resume path that reruns after these contracts exist will look at the wrong CREATE2 addresses, conclude the contracts are absent, and attempt already-used CREATE2 deployments again.

Affected code:

- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:662)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:671)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:1578)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:713)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:723)
- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:1594)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:1597)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:1615)
- [JBTerminalStore.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBTerminalStore.sol:158)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:167)
- [JBController.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBController.sol:144)
- [DeployResumeRehearsalFork.t.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/test/fork/DeployResumeRehearsalFork.t.sol:632)

Why it is real:

- `JBTerminalStore`'s constructor order is `directory`, `prices`, `rulesets`, but `Deploy.s.sol` and `Resume.s.sol` call `_isDeployed(..., abi.encode(_directory, _rulesets, _prices))`.
- `JBMultiTerminal`'s constructor order is `feelessAddresses`, `permissions`, `projects`, `splits`, `store`, `tokens`, `permit2`, `trustedForwarder`, but both scripts call `_isDeployed(..., abi.encode(_permissions, _projects, _splits, _terminalStore, _tokens, _feeless, _PERMIT2, _trustedForwarder))`.
- `JBController`'s constructor order is `directory`, `fundAccessLimits`, `permissions`, `prices`, `projects`, `rulesets`, `splits`, `tokens`, `omnichainRulesetOperator`, `trustedForwarder`.
- `Deploy.s.sol` and `Resume.s.sol` call `_isDeployed(coreSalt, type(JBController).creationCode, abi.encode(_directory, _fundAccess, _prices, _permissions, ...))`, with `prices` before `permissions`.
- The actual `new {salt}` calls use named arguments and pass the correct constructor parameters, so the deployed initcode hashes differ from the `_isDeployed` predictions.
- The main resume rehearsal helper does not mirror this bug: `DeployResumeRehearsalFork.t.sol` explicitly comments "Match constructor order: permissions before prices" and encodes the correct order, so the green rehearsal does not cover the live script's idempotency check.
- Temporary local review test `RegressionCorePredictionMismatch.t.sol` in `deploy-all-v6` computed the live-script and correct hashes for `JBTerminalStore`, `JBMultiTerminal`, and `JBController`, deployed each contract with the real named-argument constructor call, and passed while asserting each deploy-all prediction address was different and had no code. The temporary file was removed after the proof run.

Impact:

- A deploy/resume run after the relevant core step cannot reliably detect already deployed `JBTerminalStore`, `JBMultiTerminal`, or `JBController` contracts from the live script's `_isDeployed` helper.
- The next run can try to redeploy the same correctly constructed contracts at their real CREATE2 addresses and revert because the addresses already have code, blocking recovery from an interrupted or manually staged deployment.
- This undermines the deployment runbook's idempotency/restartability guarantee and makes the existing green resume rehearsal overstate coverage because its local helper uses corrected arg ordering.

Recommended fix:

- In both `Deploy.s.sol` and `Resume.s.sol`, encode each constructor argument list in the contract's real constructor order: `JBTerminalStore(directory, prices, rulesets)`, `JBMultiTerminal(feelessAddresses, permissions, projects, splits, store, tokens, permit2, trustedForwarder)`, and `JBController(directory, fundAccessLimits, permissions, prices, projects, rulesets, splits, tokens, omnichainRulesetOperator, trustedForwarder)`.
- Add a regression that runs the live script helper path twice around the core/periphery deployment, or directly asserts that each `_isDeployed` prediction matches the address produced by the corresponding `new {salt}` call for the exact live constructor args.
- Remove or update any rehearsal helper that hand-reimplements core/periphery deployment differently from the production script, so fork tests cannot pass with corrected local copies while the live scripts remain wrong.

### AM. `nana-suckers-v6`: `JBSuckerLib.convertPeerValue` multiplies by price instead of dividing

Severity: `CRITICAL`

Status: OPEN / PROTOCOL-LEVEL. The cross-chain value conversion formula in `JBSuckerLib` is inverted relative to the core protocol pattern used everywhere else in the system.

Affected code:

- [JBSuckerLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSuckerLib.sol:193)
- [JBTerminalStore.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBTerminalStore.sol:389) (correct pattern for comparison)

Why it is real:

- `JBSuckerLib.convertPeerValue` (line 193) computes: `converted = mulDiv({x: source.value, y: price, denominator: 10 ** source.decimals})` — this **multiplies** by the oracle price.
- The core protocol pattern in `JBTerminalStore` (line 389) computes: `mulDiv({x: amount, y: 10 ** decimals, denominator: price})` — this **divides** by the oracle price.
- Both call `prices.pricePerUnitOf({pricingCurrency: source, unitCurrency: target, decimals: ...})` with the same argument semantics.
- `pricePerUnitOf(pricingCurrency, unitCurrency, decimals)` returns "how many units of pricingCurrency per 1 unit of unitCurrency, scaled to `decimals`." To convert an amount FROM pricingCurrency TO unitCurrency, you must DIVIDE by this price. The sucker code MULTIPLIES instead.
- The bug is masked when source and target currencies are the same (line 177: `if (source.currency == uint32(currency))` takes a decimal-adjust shortcut that skips the oracle entirely), which is the common case for ETH↔ETH bridging in the initial rollout.

Impact:

- Any cross-chain sucker operation that converts between different currencies (e.g., ETH↔USDC) will produce values off by the square of the price ratio. For ETH at $3,000, a 1 ETH balance would be converted as 9,000,000 USDC instead of 1 USDC-equivalent, or vice versa.
- This corrupts `remoteSurplusOf` and `remoteTotalSupplyOf` values used by `REVLoans._borrowableAmountFrom` and `REVOwner.beforeCashOutRecordedWith`, enabling massive over-borrowing or incorrect cash-out calculations on cross-currency sucker deployments.
- The initial deploy-all rollout uses same-currency ETH pairs, so the bug does not manifest immediately, but any future cross-currency expansion would silently corrupt cross-chain accounting.

Recommended fix:

- Change line 193 in `JBSuckerLib.sol` to: `converted = mulDiv({x: source.value, y: 10 ** decimals, denominator: price});` — matching the core protocol conversion pattern.
- Add a regression test that converts a known amount between two different currencies using `convertPeerValue` and asserts the result matches `JBTerminalStore`'s conversion for the same amount/currencies/price.

### AN. `revnet-core-v6`: buyback pool initialization hardcodes 18-decimal assumption

Severity: `HIGH`

Status: OPEN / PROTOCOL-LEVEL. The `_tryInitializeBuybackPoolFor` function uses a hardcoded `1e18` divisor when computing the initial Uniswap V4 pool `sqrtPriceX96`, which is correct only when the terminal token has 18 decimals.

Affected code:

- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:414)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:417)

Why it is real:

- Line 414: `sqrtPriceX96 = uint160(sqrt(mulDiv(uint256(initialIssuance), 1 << 192, 1e18)));`
- Line 417: `sqrtPriceX96 = uint160(sqrt(mulDiv(1e18, 1 << 192, uint256(initialIssuance))));`
- The `1e18` represents "1 unit of terminal token" but is hardcoded rather than derived from the terminal token's actual decimals.
- For USDC (6 decimals), 1 unit = `1e6`, so the pool initializes at a price `1e12` times wrong — creating immediate arbitrage opportunities at launch.

Impact:

- Any revnet using a non-18-decimal terminal token (USDC, USDT, WBTC) will have its buyback pool initialized at a wildly incorrect price.
- Arbitrageurs can extract value from the mispriced pool immediately after initialization.
- The buyback hook will route payments through the mispriced pool, giving incorrect token amounts to payers.

Recommended fix:

- Replace `1e18` with `10 ** terminalTokenDecimals` using the actual decimal count from the terminal token's accounting context.
- Add a regression test that initializes a buyback pool with a 6-decimal terminal token and asserts the resulting `sqrtPriceX96` produces a pool price consistent with the revnet's issuance rate.

### AO. `croptop-core-v6`: caller-controlled `feeBeneficiary` of `address(0)` forces fee refund

Severity: `HIGH`

Status: OPEN / PROTOCOL-LEVEL. The `CTPublisher.mintFrom` function accepts a caller-supplied `feeBeneficiary` parameter without validation. Passing `address(0)` causes the fee terminal's `pay()` to revert, and the catch block refunds the fee to the caller.

Affected code:

- [CTPublisher.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/src/CTPublisher.sol:192) (function signature)
- [CTPublisher.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/src/CTPublisher.sol:304) (fee payment try-catch)

Why it is real:

- `mintFrom` (line 192) accepts `address feeBeneficiary` from the caller without any validation.
- Lines 304-324: the fee payment is wrapped in try-catch. When `feeBeneficiary` is `address(0)`, the fee terminal's `pay()` reverts (the terminal validates beneficiary), and the catch block at line 320-323 refunds the `payValue` to `msg.sender`.
- The mint still succeeds — the caller gets their NFT without paying the 5% Croptop fee.
- This strengthens and extends existing Edge Case J, which already notes that "publisher fee logic assumes ETH/18-decimal tier prices." AO adds a new attack vector: even with correct currency/decimals, the fee can be bypassed entirely.

Impact:

- Any Croptop poster can mint NFTs while bypassing the protocol fee entirely by passing `feeBeneficiary = address(0)`.
- The fee project (project 1) loses all Croptop fee revenue.
- The catch block was designed for legitimate fee routing failures, but `address(0)` is a deliberate bypass.

Recommended fix:

- Add `if (feeBeneficiary == address(0)) revert CTPublisher_InvalidFeeBeneficiary();` at the top of `mintFrom`, or replace the caller-supplied `feeBeneficiary` with a protocol-determined default (e.g., `msg.sender` or a hardcoded fee recipient).
- Remove the fee refund catch block or restrict it to only catch specific non-adversarial failure modes.

### AP. `croptop-core-v6`: former project owners retain hook permissions after NFT transfer

Severity: `MED`

Status: OPEN / PROTOCOL-LEVEL. When a project is deployed through `CTDeployer`, the deployer grants the original owner permissions (`ADJUST_721_TIERS`, `SET_721_METADATA`, `MINT_721`, `SET_721_DISCOUNT_PERCENT`) scoped to `account: address(deployer)`. These permissions are never revoked when the project NFT is transferred to a new owner.

Affected code:

- [CTDeployer.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/src/CTDeployer.sol:244) (initial permission grant)
- [CTProjectOwner.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/src/CTProjectOwner.sol:52) (onERC721Received grants, no revocation)

Why it is real:

- `CTDeployer` lines 244-261 grant `ADJUST_721_TIERS` and related permissions to the original `owner` with `account: address(this)` and the project's `projectId`.
- When the project NFT is transferred from owner A to owner B, JBPermissions does not automatically revoke operator permissions scoped to third-party accounts.
- `claimCollectionOwnershipOf()` transfers hook ownership but does NOT revoke the old owner's deployer-scoped permissions.
- The regression test `test_oldProjectOwnerRetainsHookControlAfterProjectNftTransferUntilClaim` in `RegressionPoCs.t.sol` confirms the old owner can still call `adjustTiers` after transferring the project NFT.

Impact:

- A former project owner can continue to add/remove NFT tiers, modify metadata, set discount percentages, and mint NFTs after selling or transferring the project.
- This persists indefinitely until the new owner explicitly revokes the deployer-scoped permissions.
- Most project buyers would not know they need to revoke deployer-scoped operator permissions.

Recommended fix:

- Revoke deployer-scoped permissions for the old owner inside `claimCollectionOwnershipOf()`, or add a transfer hook that clears deployer-scoped operator grants when the project NFT changes hands.
- Alternatively, document this as an accepted integration constraint and add a helper function that new owners can call to revoke all deployer-scoped legacy permissions.

### AQ. `revnet-core-v6`: `beforeCashOutRecordedWith` unconditionally adds remote surplus

Severity: `MED`

Status: OPEN / PROTOCOL-LEVEL. `REVOwner.beforeCashOutRecordedWith` always adds `remoteSurplusOf()` and `remoteTotalSupplyOf()` to the cash-out calculation, regardless of the ruleset's `useTotalSurplus` flag.

Affected code:

- [REVOwner.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVOwner.sol:195) (remote surplus addition)
- [REVOwner.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVOwner.sol:201) (remote total supply addition)

Why it is real:

- Lines 195-201 unconditionally add `SUCKER_REGISTRY.remoteSurplusOf(...)` and `SUCKER_REGISTRY.remoteTotalSupplyOf(...)` to the effective surplus and total supply values used for cash-out bonding curve calculations.
- The code does not check `useTotalSurplus` or any equivalent flag — remote values are always included.
- A project that intends per-terminal-isolated cash-out behavior (by not setting `useTotalSurplus`) still gets remote surplus mixed into its cash-out math when `REVOwner` is the data hook.
- This is partially mitigated by `revnet-core-v6/RISKS.md` §8.6 which documents cross-chain surplus staleness as accepted, but the unconditional inclusion (ignoring `useTotalSurplus`) is not explicitly documented as accepted behavior.

Impact:

- Projects using `REVOwner` as a data hook cannot isolate their cash-out calculations to local terminal surplus only.
- Stale or manipulated remote surplus values affect all cash-outs, not just those that opt into total-surplus mode.
- For single-chain projects with no suckers, `remoteSurplusOf` returns 0 so there is no impact.

Recommended fix:

- Condition the remote surplus/supply addition on the ruleset's `useTotalSurplus` flag (from `context.ruleset.useTotalSurplus()`), or explicitly document and accept in `revnet-core-v6/RISKS.md` that revnets always include remote surplus in cash-out calculations regardless of the flag.

### AR. `univ4-lp-split-hook-v6`: pre-initialized pool accepts attacker-chosen price without validation

Severity: `HIGH`

Status: OPEN / PROTOCOL-LEVEL. `JBUniswapV4LPSplitHook._createAndInitializePool` reads an existing pool's `sqrtPriceX96` and uses it without bounds validation, allowing an attacker who front-runs pool creation to set an arbitrary price.

Affected code:

- [JBUniswapV4LPSplitHook.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol:1728) (existing price read)
- [JBUniswapV4LPSplitHook.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol:1731) (unconditional acceptance)
- [JBUniswapV4LPSplitHook.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol:1736) (passed to initializePool)

Why it is real:

- Line 1728: `uint160 existingSqrtPriceX96 = _getSqrtPriceX96(key);`
- Line 1729-1731: `if (existingSqrtPriceX96 != 0) { sqrtPriceX96 = existingSqrtPriceX96; }` — unconditionally replaces the computed price with the existing one.
- The computed price from `_computeInitialSqrtPrice` IS properly clamped to valid tick bounds (lines 1587-1606), but this validation is bypassed when an existing pool price is found.
- An attacker can front-run the legitimate pool creation by calling `POSITION_MANAGER.initializePool` with an extreme `sqrtPriceX96`, then the hook silently accepts that price.
- The inline comment (lines 1724-1727) claims "arbitrageurs will quickly move the price back into range," but this misses that an extreme price can cause `getLiquidityForAmounts` (line 1230) to return zero liquidity, which reverts at line 1240 (`JBUniswapV4LPSplitHook_ZeroLiquidity`), permanently blocking LP position creation — a denial of service.

Impact:

- An attacker can permanently prevent a project from creating its LP position by front-running pool initialization with an extreme `sqrtPriceX96` that causes zero liquidity computation.
- Even without DoS, an attacker-chosen price causes the initial LP position to be single-sided and economically exploitable.
- This affects any project that uses the LP split hook with a pool key that hasn't been initialized yet.

Recommended fix:

- When an existing pool price is found, validate it against the computed initial price bounds: reject or revert if `existingSqrtPriceX96` falls outside the hook's configured tick range or differs from the computed price by more than a configurable threshold.
- Alternatively, revert if the pool is already initialized by an unknown party, requiring the project to explicitly accept an existing pool via a separate entry point.

### AS. `deploy-all-v6`: hook salt mining uses `safeAddress()` but Sphinx deploys through a different CREATE2 factory, producing `HookAddressNotValid`

Severity: `HIGH`

Status: OPEN / DEPLOY-BLOCKING. Confirmed on ethereum_sepolia 2026-05-07 — `Create2Deployer::create2()` reverts with `HookAddressNotValid(0x73e99a8a62BC05681BF9c29004f9Dc3Ef4190685)` immediately after `JBBuybackHookRegistry` deploys successfully. Sphinx confirmed to use `0x4e59b44847b379578588920cA78FbF26c0B4956C` (deterministic deployment proxy) as the on-chain CREATE2 deployer.

Related: Finding V (Sphinx CREATE2→CREATE replay). This is the concrete, immediately observable symptom of that broader issue, specifically affecting the Uniswap V4 hook whose address bits encode permission flags.

Affected code:

- [Deploy.s.sol:794-799](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:794) — `_findHookSalt` passes `deployer: safeAddress()`
- [Deploy.s.sol:809](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:809) — `new JBUniswapV4Hook{salt: salt}(...)` deploys with mined salt
- [Deploy.s.sol:3010-3011](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:3010) — `_isDeployed` also computes addresses with `deployer: safeAddress()`
- [BaseHook.sol:18-19](/Users/jango/Documents/jb/v6/evm/banny-retail-v6/node_modules/@uniswap/v4-periphery/src/utils/BaseHook.sol:18) — constructor calls `validateHookAddress(this)`, which reverts with `HookAddressNotValid` if `address(this)` flag bits are wrong
- [HookMiner.sol:17-18](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/node_modules/@uniswap/v4-periphery/src/utils/HookMiner.sol:17) — documentation explicitly warns: "In `forge script`, this should be `0x4e59b44847b379578588920cA78FbF26c0B4956C` (CREATE2 Deployer Proxy)"

Why it is real:

- `_findHookSalt` mines a salt such that `CREATE2(safeAddress(), salt, initCodeHash)` produces an address whose low 14 bits match the declared hook permissions (`BEFORE_SWAP | AFTER_SWAP | AFTER_INITIALIZE | BEFORE_SWAP_RETURNS_DELTA | AFTER_ADD_LIQUIDITY | AFTER_REMOVE_LIQUIDITY`).
- During Sphinx simulation, `vm.startPrank(safeAddress())` makes this consistent: the pranked Safe address is both the miner's deployer and the simulated CREATE2 deployer.
- On-chain, Sphinx's Module executes deployment leaves through the Safe, which routes CREATE2 through a separate `Create2Deployer` contract. The CREATE2 opcode then uses that contract's address — not the Safe's — as the deployer.
- `CREATE2(Create2Deployer, salt, initCodeHash)` produces a different address whose low bits do not match the required permission flags.
- The `JBUniswapV4Hook` constructor inherits `BaseHook(poolManager)`, which calls `Hooks.validateHookPermissions(this, getHookPermissions())`. This check compares `uint160(address(this)) & FLAG_MASK` against the declared flags and reverts with `HookAddressNotValid(address)` on mismatch.
- The address `0x73e99a8a62BC05681BF9c29004f9Dc3Ef4190685` has low bits `0x0685`, which do not match the required flag pattern.

Impact:

- The `JBUniswapV4Hook` deployment reverts on every Sphinx-mediated deploy attempt. Since the buyback hook, router terminal, and LP split hook all depend on the Uniswap V4 hook, the entire Phase 03b–03e deployment chain is blocked.
- This is independently deploy-blocking even if Finding V's broader CREATE→CREATE2 issue were resolved, because the hook salt mining explicitly passes the wrong deployer address.

Recommended fix:

- **Option 1 (targeted):** Change `_findHookSalt` to pass `0x4e59b44847b379578588920cA78FbF26c0B4956C` (the deterministic deployment proxy) instead of `safeAddress()`. Update `_isDeployed` to use the same deployer for consistency.
- **Option 2 (bypass Sphinx):** Deploy the hook via `Resume.s.sol`, which runs directly with `forge script --broadcast` from the EOA (line 194: "This script does NOT use Sphinx"). The EOA is `msg.sender` for `new {salt}`, so salt mining with the EOA address will match. Note: `Resume.s.sol` requires the caller to be the Safe address or have equivalent permissions.
- **Option 3 (explicit factory call):** Replace `new JBUniswapV4Hook{salt: salt}(...)` with an explicit call to the deterministic deployment proxy (`0x4e59b44847b379578588920cA78FbF26c0B4956C.call(abi.encodePacked(salt, creationCodeWithArgs))`). Mine the salt with that proxy as the deployer. This sidesteps Sphinx's CREATE2 replay entirely and works in both simulation and on-chain execution.
- In all cases, add a post-deployment assertion that `uint160(address(_uniswapV4Hook)) & HookMiner.FLAG_MASK == flags` to catch any future deployer mismatch at simulation time rather than on-chain.

## Previously Reported Edge Cases (Merged / Accepted Except Open Edge Cases Above)

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

- PoC: [univ4-router-v6/test/regression/PersistentAllowanceSteal.t.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/test/regression/PersistentAllowanceSteal.t.sol:1)
- PoC: [univ4-lp-split-hook-v6/test/regression/PersistentAllowanceSteal.t.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/test/regression/PersistentAllowanceSteal.t.sol:1)

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

- PoC: [univ4-router-v6/test/regression/JBRouteMinOutputBypass.t.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/test/regression/JBRouteMinOutputBypass.t.sol:1)

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

- PoC: [univ4-lp-split-hook-v6/test/regression/FeeClaimReserveCapture.t.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/test/regression/FeeClaimReserveCapture.t.sol:1)

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

- Regression: [nana-buyback-hook-v6/test/regression/DerivedMinBuySideFOTDoS.t.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/test/regression/DerivedMinBuySideFOTDoS.t.sol:253)
- Regression: [nana-buyback-hook-v6/test/regression/DerivedMinSellSideFOTDoS.t.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/test/regression/DerivedMinSellSideFOTDoS.t.sol:199)
- Explicit opt-in coverage: [nana-buyback-hook-v6/test/regression/SellSideFOTOutputDoS.t.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/test/regression/SellSideFOTOutputDoS.t.sol:222)
- Non-18-decimal explicit ERC-20 sell route coverage: [nana-buyback-hook-v6/test/TestRegressionGaps.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/test/TestRegressionGaps.sol:497)

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

- PoC: [nana-suckers-v6/test/regression/RegistryStaleDeprecatedMaxSurplus.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/regression/RegistryStaleDeprecatedMaxSurplus.t.sol:1)
- PoC: [nana-suckers-v6/test/regression/RegistryStaleMaxAggregation.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/regression/RegistryStaleMaxAggregation.t.sol:1)
- Composition proof: [revnet-core-v6/test/regression/RemoteLoanAccountingGap.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/regression/RemoteLoanAccountingGap.t.sol:1)

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

- PoC: [nana-suckers-v6/test/regression/ToRemoteFeeIrrecoverable.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/regression/ToRemoteFeeIrrecoverable.t.sol:1)

Recommended fix:

- If fee payment fails, either add the retained ETH back into `transportPayment` on bridges that can tolerate it, or track retained fee residue separately and add an explicit sweep/retry path.
- Do not count retained fee ETH inside `amountToAddToBalanceOf(...)` unless a later claim path can actually forward it.

### 7. `defifa`: one-tier games with disabled scorecard timeout can never ratify or no-contest, permanently locking the pot

Severity: `MED`

Status: OPEN / PROMOTED TO CURRENT OPEN FINDING AD. Current source still allows one-tier, zero-timeout launches; the prior fixed-note was stale.

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

- Current proof: [defifa/test/regression/SingleTierTimeoutLock.t.sol](/Users/jango/Documents/jb/v6/evm/defifa/test/regression/SingleTierTimeoutLock.t.sol:1)
- Current proof: [defifa/test/regression/OneTierZeroTimeoutLock.t.sol](/Users/jango/Documents/jb/v6/evm/defifa/test/regression/OneTierZeroTimeoutLock.t.sol:1)

Recommended fix:

- Add a launch-time guard that rejects one-tier games when `scorecardTimeout == 0`.
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

- PoC: [defifa/test/regression/RegressionBeneficiaryMismatch.t.sol](/Users/jango/Documents/jb/v6/evm/defifa/test/regression/RegressionBeneficiaryMismatch.t.sol:20)

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

- PoC: [defifa/test/regression/RegressionBeneficiaryMismatch.t.sol](/Users/jango/Documents/jb/v6/evm/defifa/test/regression/RegressionBeneficiaryMismatch.t.sol:79)

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

- Regression: [croptop-core-v6/test/regression/RegressionPoCs.t.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/test/regression/RegressionPoCs.t.sol:185)
- Regression: [croptop-core-v6/test/regression/DeployerPermissionBypass.t.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/test/regression/DeployerPermissionBypass.t.sol:175)

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

- PoC: [nana-fee-project-deployer-v6/test/regression/RegressionProjectOneSquat.t.sol](/Users/jango/Documents/jb/v6/evm/nana-fee-project-deployer-v6/test/regression/RegressionProjectOneSquat.t.sol:1)

Recommended fix:

- Review and merge the local canonical-shape guard in the standalone fee deployer and deploy-all deploy/resume scripts.
- Keep the current deploy-all behavior that mints project `1` to the deployer in the core constructor before public project creation can claim it.
- Do not skip NANA configuration merely because `controllerOf(1) != 0`; skip only after owner, controller, revnet hash, and token-symbol checks prove it is the intended NANA revnet.

### 12. `nana-distributor-v6`: `JB721Distributor` lets late-minted replacement NFTs consume round rewards using the seller’s snapshot votes

Severity: `MED`

Status: REOPENED. The distributor now asks the checkpoint module for historical token ownership, but the current production checkpoint module still cannot prove that a never-transferred token existed at the queried snapshot block. See Current Open Edge Case Q.

Affected code:

- [JB721Distributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JB721Distributor.sol:268)
- [JB721Distributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JB721Distributor.sol:322)
- [JB721Distributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JB721Distributor.sol:433)
- [IJB721TiersHook.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/interfaces/IJB721TiersHook.sol:142)
- [JB721TiersHook.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721TiersHook.sol:107)
- [JB721TiersHook.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721TiersHook.sol:174)
- [JB721TiersHook.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721TiersHook.sol:809)

Why it is real:

- The intended patch direction was correct: `JB721Distributor` should score eligibility against a per-token snapshot owner instead of a current owner.
- The current `JB721Checkpoints` implementation does expose `ownerOfAt(tokenId, blockNumber)`, but mints do not write a token checkpoint or mint block.
- For a token with no post-mint transfer checkpoint, `ownerOfAt(...)` falls back to `JB721TiersHook.firstOwnerOf(tokenId)`, which itself falls back to the token's current owner until the token has a non-mint transfer.
- That means a token minted after the round snapshot can still return a nonzero snapshot owner for an earlier block, as long as the token has not transferred yet.
- The current distributor's owner-level consumed-votes cap bounds the seller's total extraction, but it does not bind rewards to the token that existed at the snapshot. A post-snapshot replacement token can consume the seller's snapshot vote budget before the buyer's transferred snapshot token can vest the round.

Impact:

- This was not just a cosmetic documentation mismatch. It was a real reward-redirection bug across users.
- Buyers of snapshot-eligible NFTs could receive no rewards for the current round, while the seller drained that round through a post-snapshot replacement NFT.
- Total extraction remained bounded by the seller’s snapshot voting power, so this was a cross-user theft / misallocation issue rather than system-wide inflation.

Evidence:

- Regression: [nana-distributor-v6/test/regression/RegressionFreshVerification.t.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/test/regression/RegressionFreshVerification.t.sol:1)
- Regression: [nana-distributor-v6/test/regression/RegressionFreshRoundVerification.t.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/test/regression/RegressionFreshRoundVerification.t.sol:1)
- Regression: [nana-distributor-v6/test/regression/RegressionAccountingPoC.t.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/test/regression/RegressionAccountingPoC.t.sol:213)
- Regression: [nana-721-hook-v6/test/unit/getters_constructor_Unit.t.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/test/unit/getters_constructor_Unit.t.sol:505)
- Current production-path proof: [RegressionOwnerOfAtPreMint.t.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/test/regression/RegressionOwnerOfAtPreMint.t.sol:1)
- Current source: [JB721Checkpoints.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721Checkpoints.sol:82)
- Current source: [JB721Checkpoints.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/src/JB721Checkpoints.sol:108)

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

- PoC: [nana-project-handles-v6/test/regression/JBProjectHandlesUnicodeSpoof.t.sol](/Users/jango/Documents/jb/v6/evm/nana-project-handles-v6/test/regression/JBProjectHandlesUnicodeSpoof.t.sol:1)

Recommended fix:

- Reject bidi override and other dangerous Unicode formatting characters in ENS name parts, not just ASCII control bytes.
- If the intended policy is “only ENS-normalized labels are valid,” enforce that onchain before storing or returning a verified handle.

### 14. `revnet-core-v6`: hidden tokens leave the economic denominator, so the same holder can drain via cash out or loans and then restore the hidden tranche

Severity: `HIGH`

Status: ACCEPTED. Current `revnet-core-v6` code and tests assert hidden-supply exclusion from cash-out and loan denominators as intended behavior. Documented in `revnet-core-v6/RISKS.md` §4. See Current Open Edge Case D.

Affected code:

- [REVHiddenTokens.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVHiddenTokens.sol:79)
- [REVHiddenTokens.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVHiddenTokens.sol:110)
- [REVOwner.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVOwner.sol:195)
- [REVLoans.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVLoans.sol:360)
- [REVLoans.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVLoans.sol:1173)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:385)

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

- PoC: [revnet-core-v6/test/regression/HiddenSupplyCashout.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/regression/HiddenSupplyCashout.t.sol:1)
- PoC: [revnet-core-v6/test/regression/HiddenSupplyLoanBorrow.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/regression/HiddenSupplyLoanBorrow.t.sol:1)
- Follow-up verification: `forge test --match-path 'test/regression/HiddenSupply*.t.sol'` passes, including tests that now assert the cash-out and loan-capacity denominator exclusion "by design".

Recommended fix:

- Hidden balances must remain in the economic denominator used by both cash outs and loans.
- The cleanest design fix is to make hiding affect governance / visibility only, not treasury math.
- Current code takes the opposite stance: hidden tokens are intentionally excluded while remaining revealable. If that policy remains, document the trust boundary as a deliberate power granted to `HIDE_TOKENS` operators and hide-allowlisted holders.
- The system should still review whether hidden balances can be revealed while the holder has outstanding loan exposure, because the direct drain/borrow amplification path remains open whenever hidden supply stays outside the denominator.

### 15. `deploy-all-v6`: `Verify.s.sol` is stale against the real canonical routing and ownership topology

Severity: `LOW`

Status: PARTIALLY FIXED. Route and canonical project checks were merged to main in `deploy-all-v6/script/Verify.s.sol`; Safe ownership/admin verification remains open as Current Open Edge Case C.

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
- Keep canonical revnet project NFT checks pointed at `REVDeployer`, and repurpose `VERIFY_SAFE` for ownable deployment-admin checks. Current follow-up gap: `VERIFY_SAFE` is loaded but not enforced; see Current Open Edge Case C.

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

- PoC: [deploy-all-v6/test/regression/ResumeCroptopProjectTwoSquat.t.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/test/regression/ResumeCroptopProjectTwoSquat.t.sol:1)

Recommended fix:

- Resume should not trust `controllerOf(projectId) != 0` alone as proof that an expected canonical project is the right one.
- For project `2`, require both the expected owner / controller topology and the expected Croptop-specific invariants before accepting it, otherwise revert and force operator intervention.
- More generally, persist canonical project IDs and expected owners from the initial deployment state and verify them explicitly during resume instead of rediscovering them from public project numbering alone.

### 17. `deploy-all-v6`: `Resume.s.sol` can still treat an attacker-configured project `4` as already configured BAN/Banny

Severity: `MED`

Status: REOPENED / PARTIALLY FIXED. `Verify.s.sol` now has BAN/Banny-specific checks, but `Deploy.s.sol` and `Resume.s.sol` still skip Phase 09 on generic controller presence. See "Current Open Edge Case A".

Affected code:

- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2459)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:2533)
- [Resume.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Resume.s.sol:3108)
- [Verify.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Verify.s.sol:407)

Why it is real:

- `_deployBanny()` and `_resumeBanny()` skip the whole Banny phase whenever `projects.count() >= 4` and `controllerOf(4) != 0`.
- That skip path never checks whether project `4` is the canonical BAN deployment target, whether it is owned by the expected party, or whether any Banny-specific assets were actually deployed.
- After an interrupted deployment, once the controller is live and projects `1-3` already exist, a third party can create and configure project `4` before the operator resumes.
- Resume will then mark Phase 09 as already configured and never deploy the canonical `Banny721TokenUriResolver` or the intended BAN-specific revnet / tier setup.
- The helper `_isCanonicalConfiguredProject(4)` now includes the needed BAN token and Banny 721 hook identity checks, but `_resumeBanny()` does not call it before skipping.
- `Verify.s.sol` now catches the bad final state, but only after resume has skipped the repair path. A failed verifier is better than silent acceptance, but it does not restore resume convergence.

Impact:

- An interrupted deployment can leave an attacker-controlled or arbitrary project `4` standing in for BAN until manual intervention.
- Operators should now get a verification failure for the bad BAN/Banny shape, but rerunning `Resume.s.sol` still repeats the skip instead of recovering.
- This remains a deployment blocker for the documented resume path because the script does not either deploy canonical Banny or fail early with `ProjectNotCanonical(4)`.

Evidence:

- PoC: [deploy-all-v6/test/regression/ResumeBannyProjectFourSquat.t.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/test/regression/ResumeBannyProjectFourSquat.t.sol:1)

Recommended fix:

- Resume and Deploy should reject project `4` unless BAN-specific invariants hold, instead of treating any controller-configured project `4` as canonical Banny.
- Keep the current `Verify.s.sol` Banny-specific assertions as a post-deploy backstop.
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

- PoC: [deploy-all-v6/test/regression/ResumeRevProjectThreeSquat.t.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/test/regression/ResumeRevProjectThreeSquat.t.sol:1)

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

- PoC: [croptop-core-v6/test/regression/ProjectIdFrontRunDoS.t.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/test/regression/ProjectIdFrontRunDoS.t.sol:1)
- PoC: [nana-721-hook-v6/test/regression/ProjectIdFrontRunDoS.t.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/test/regression/ProjectIdFrontRunDoS.t.sol:1)
- PoC: [revnet-core-v6/test/regression/ProjectIdFrontRunDoS.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/regression/ProjectIdFrontRunDoS.t.sol:1)
- PoC: [nana-omnichain-deployers-v6/test/regression/ProjectIdFrontRunDoS.t.sol](/Users/jango/Documents/jb/v6/evm/nana-omnichain-deployers-v6/test/regression/ProjectIdFrontRunDoS.t.sol:1)
- Existing QA regression: [defifa/test/TestQALastMile.t.sol](/Users/jango/Documents/jb/v6/evm/defifa/test/TestQALastMile.t.sol:332)
- Fix regression / verification:
  - `forge test --match-path test/regression/ProjectIdFrontRunDoS.t.sol` in `croptop-core-v6`
  - `forge test --match-path test/CTDeployer.t.sol` in `croptop-core-v6`
  - `forge test --match-path test/regression/RegressionFreshRound.t.sol --match-test 'test_deployProjectFor_failsOpenWhenSuckerDeploymentFails|test_directRegistryDeploymentAfterOwnershipTransferCanMapThroughRegistry'` in `croptop-core-v6`
  - `forge build` in `croptop-core-v6`
  - `forge test --match-path test/regression/ProjectIdFrontRunDoS.t.sol` in `nana-721-hook-v6`
  - `forge test --match-path test/unit/deployer_Unit.t.sol` in `nana-721-hook-v6`
  - `forge test --match-path test/regression/ProjectDeployerRulesets.t.sol` and `forge test --match-path test/regression/ProjectDeployerAuth.t.sol` in `nana-721-hook-v6`
  - `forge build` in `nana-721-hook-v6`
  - `forge test --match-path test/DefifaSecurity.t.sol`, `forge test --match-path test/DefifaNoContest.t.sol`, and `forge build` in `defifa`
  - `forge test --match-path test/regression/ProjectIdFrontRunDoS.t.sol`, `forge test --match-path test/TestConversionDocumentation.t.sol`, `forge test --match-path test/TestTerminalEncodingInHash.t.sol`, and `forge build` in `revnet-core-v6`
  - `forge test --match-path test/regression/ProjectIdFrontRunDoS.t.sol`, `forge test --match-path test/JBOmnichainDeployer.t.sol`, `forge test --match-path test/Tiered721HookComposition.t.sol`, `forge test --match-path test/JBOmnichainDeployerGuard.t.sol`, `forge test --match-path test/OmnichainDeployerEdgeCases.t.sol`, `forge test --match-path test/OmnichainDeployerAttacks.t.sol`, `forge test --match-path test/TestRegressionGaps.sol`, and `forge build` in `nana-omnichain-deployers-v6`

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

Status: ACCEPTED BY CURRENT CODE / COVERED BY CURRENT DEPLOY VERIFICATION GAP. Current `REVDeployer` still salts sucker deployment with `_msgSender()`, and the current regression asserts caller-namespaced deployment instead of removing the caller from the salt. This is not counted as a separate current blocker because `deploy-all-v6` should deploy the canonical projects through the same deployment caller on every chain, while Current Open Edge Case Y requires the verifier to prove the final sucker pairs and native-token mappings before bridge operations are accepted.

Affected code:

- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:904)
- [REVDeployer.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVDeployer.sol:915)
- [JBSuckerRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSuckerRegistry.sol:503)
- [JBSuckerRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSuckerRegistry.sol:510)
- [JBSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol:714)
- [JBSucker.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/JBSucker.sol:725)

Why it is real:

- Current `REVDeployer._deploySuckersFor(...)` salts sucker deployment with `_msgSender()` before calling the registry.
- `JBSuckerRegistry.deploySuckersFor(...)` then salts again with its own caller and explicitly documents that same-address peer symmetry only holds when deployments originate from the same sender across chains.
- `JBSucker.peer()` defaults to `address(this)`, so the entire default peer model assumes those CREATE2 inputs converge to the same deployed sucker address on every chain.
- That means two revnets with identical `hashedEncodedConfigurationOf(...)` values do not, by themselves, determine the same sucker addresses. Different split operators, forwarders, or caller choices change the deployed addresses even when the revnet configuration and sucker salt are identical.
- Once the deployed addresses diverged, the default `peer()` on each sucker pointed to itself instead of the counterpart on the other chain, and cross-chain message handling rejected the real remote sucker as a non-peer.
- The current regression coverage asserts this caller namespace intentionally prevents same-chain collisions between identical revnet configs and salts. The remaining deployment responsibility is to ensure same-address default peers only rely on same-caller, same-topology deployments, or to pass explicit peers and verify them.

Impact:

- Revnet cross-chain expansion was not actually determined solely by revnet configuration plus deployment salt.
- A project could deploy matching revnet configs on two chains, believe the default same-address peer assumption held, and still end up with suckers that did not recognize each other because the external caller path differed.
- This could silently break default cross-chain peer wiring after split-operator rotation, different relayer usage, or any deployment path variation that changed `_msgSender()`.
- The failure mode was not just cosmetic. Bridge messages could hard-revert at the peer check, leaving the expansion path broken until custom peer overrides or a redeploy strategy was used.

Evidence:

- Regression/documentation test: [revnet-core-v6/test/regression/SuckerCallerDeterminism.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/regression/SuckerCallerDeterminism.t.sol:152)

Recommended fix:

- If caller namespacing is the intended design, document the same-caller requirement in `revnet-core-v6` and `deploy-all-v6` cross-chain runbooks.
- Require explicit nonzero peers for any expansion path where the split operator / caller or registry / deployer topology differs across chains.
- Keep Current Open Edge Case Y open until `deploy-all-v6` verifies the deployed pair manifest, because code comments and caller conventions are not enough proof for the immutable canonical rollout.

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

- PoC: [revnet-core-v6/test/regression/RemoteLoanStateOmission.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/regression/RemoteLoanStateOmission.t.sol:1)
- Supporting proof: [revnet-core-v6/test/regression/RegressionVerification.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/regression/RegressionVerification.t.sol:27)
- Regression: [nana-suckers-v6/test/unit/peer_chain_state.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/unit/peer_chain_state.t.sol:1) now covers optional data-hook accounting in outbound snapshots.
- Regression: [revnet-core-v6/test/regression/LocalLoanStateOmissionCashout.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/regression/LocalLoanStateOmissionCashout.t.sol:1) now covers `REVOwner.peerChainAccountingContextOf(...)`.

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

- PoC: [nana-suckers-v6/test/regression/SameTimestampSnapshotPinned.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/regression/SameTimestampSnapshotPinned.t.sol:1)
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
- The hidden-token edge case covers balances voluntarily burned into the hidden-token helper. This issue is separate: even without hidden tokens, the ordinary live loan system already creates burned collateral and outstanding debt that `REVOwner` forgets during cash-outs.

Evidence:

- PoC: [revnet-core-v6/test/regression/LocalLoanStateOmissionCashout.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/regression/LocalLoanStateOmissionCashout.t.sol:1)

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

- PoC: [nana-suckers-v6/test/regression/FeeLocking.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/regression/FeeLocking.t.sol:272)

Recommended fix:

- Review and merge the local retained-transport-refund patch. It mirrors the retained `toRemoteFee` pattern with `retainedTransportPaymentRefundOf`, `retainedTransportPaymentRefundBalance`, `claimRetainedTransportPaymentRefund(...)`, and retained-refund events.
- Keep retained transport-payment refunds out of `amountToAddToBalanceOf(JBConstants.NATIVE_TOKEN)` unless a future ordinary claim path can actually forward them safely.

### 26. `revnet-core-v6`: the revnet configuration hash used for omnichain sucker identity previously omitted split-operator authority, reserved split routing, and custom ruleset policy bits

Severity: `MED`

Status: ACCEPTED. Current code includes terminal addresses and `extraMetadata`, but still excludes split-operator authority and reserved split routing. Documented in `revnet-core-v6/RISKS.md` §8. See Current Open Edge Case E.

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
- Current code adds terminal addresses and `stageConfiguration.extraMetadata`, but it still omits `configuration.splitOperator` and `stageConfiguration.splits`.
- Current tests assert the accepted behavior: split-operator and reserved-split routing differences do not change `hashedEncodedConfigurationOf(...)`, while `extraMetadata` and terminal differences do.

Impact:

- Cross-chain operators and tooling can treat materially different revnets as having the "same configuration" and pair them through the omnichain sucker path.
- A remote expansion can preserve the expected peer identity while changing who controls split-operator powers, where reserved issuance is routed, or whether future sucker deployment is allowed.
- This breaks the intended equivalence guarantee behind omnichain revnet pairing. The peer-auth and shared-accounting layer can be established between revnets that are not actually the same product.

Evidence:

- Regression: [WeakConfigurationHash.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/regression/WeakConfigurationHash.t.sol:17)
- Regression: [TestTerminalEncodingInHash.t.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/test/TestTerminalEncodingInHash.t.sol:170)
- Follow-up verification: `forge test --match-path test/regression/WeakConfigurationHash.t.sol` passes, including tests that assert split-operator and reserved-split routing differences are excluded from the configuration hash.

Recommended fix:

- If `hashedEncodedConfigurationOf(...)` is meant to prove full cross-chain revnet equivalence, include split-operator authority and reserved split routing in the commitment.
- If it is only meant to prove economics/policy equivalence, document that limitation and require deployment tooling to compare authority and routing fields separately before pairing revnets.
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

- PoC: [nana-suckers-v6/test/regression/PeerTopologyAuthBreak.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/regression/PeerTopologyAuthBreak.t.sol:1)
- PoC: [nana-suckers-v6/test/regression/RegistryPeerAuthBreak.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/regression/RegistryPeerAuthBreak.t.sol:1)

Recommended fix:

- Review and merge the local explicit-peer patch in `nana-suckers-v6`.
- Current follow-up note: `deploy-all-v6` does not yet consume patched sibling working-copy packages; its imports still resolve through `node_modules`. See Current Open Edge Case B.
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

- Regression: [nana-suckers-v6/test/regression/HooklessV4LiquidityOverride.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/regression/HooklessV4LiquidityOverride.t.sol:1)

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

- PoC: [nana-suckers-v6/test/regression/RegistryFirstTerminalSnapshotGap.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/regression/RegistryFirstTerminalSnapshotGap.t.sol:1)
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
- This is distinct from the hookless-V4 edge case. Even if you require a nonzero hook address before V4 can outrank V3, the current code still allows the winning hooked pool to degrade to spot silently.
- The local patch preflights hooked V4 `observe(...)` during discovery, skips broken hooked V4 pools, and requires hooked V4 quoting to use the hook TWAP instead of silently degrading to spot.

Impact:

- A project or attacker can bootstrap or temporarily break a V4 oracle hook, keep the hooked pool slightly ahead of V3 on current liquidity, and still force outbound sends, inbound receives, and retry swaps onto spot pricing.
- Because the selected swap output becomes the batch-wide conversion rate, a single toxic spot fallback can haircut every claimer in that batch instead of only the caller who triggered the swap.
- The most obvious window is immediately after pool creation, before a 120-second hook TWAP is reliably available, but the issue also applies to any hook outage or revert condition.

Evidence:

- Regression: [nana-suckers-v6/test/regression/HookedV4SpotFallbackOverride.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/regression/HookedV4SpotFallbackOverride.t.sol:1)

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
- This is distinct from the spot-fallback edge cases. Here the problem is not pricing off a bad route; it is skipping a live route entirely and reverting because discovery committed to an unquotable V3 pool first.
- The local patch disqualifies V3 pools that cannot serve the full default TWAP window before liquidity ranking can select them.

Impact:

- An attacker can bootstrap or temporarily JIT-fund a fresh V3 pool on any supported fee tier and block outbound swaps, inbound receive swaps, and `retrySwap(...)` executions for that pair during the oracle warm-up window.
- On outbound sends this hard-reverts the bridge path. On inbound receives the CCIP message is accepted, but the batch gets pinned behind `pendingSwapOf` until the stale winner either ages into a usable TWAP or loses its liquidity edge.
- Because the batch conversion rate is shared across all claimers, this is a cross-batch liveness problem rather than a single caller eating their own failed swap.

Evidence:

- Regression: [nana-suckers-v6/test/regression/FreshV3LiquidityOverrideDoS.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/regression/FreshV3LiquidityOverrideDoS.t.sol:1)

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
- This is distinct from edge case 31. There the fresh pool hard-reverts before a fallback route is tried. Here the fresh pool is considered valid and actively sets the batch-wide conversion rate, even though its entire oracle history was attacker-controlled from pool birth.

Impact:

- An attacker can create or JIT-fund a new V3 pool on a supported fee tier, initialize it at a toxic price, wait until it barely satisfies the 120-second minimum, and then force outbound sends, inbound receive swaps, and `retrySwap(...)` calls to use that short-lived attacker-defined TWAP.
- Because the chosen swap output becomes the batch-wide bridge conversion rate, the attack can haircut every claimer in the batch rather than only the trigger caller.
- This bypasses the protocol's apparent preference for V3 "oracle-backed" routes. The chosen route is technically TWAP-backed, but the TWAP window is so short and fresh that it offers no meaningful protection when a healthier older route already exists.
- The local patch requires V3 candidates to serve the full default 10-minute TWAP window instead of clamping to the pool's shorter lifetime.

Evidence:

- Regression: [nana-suckers-v6/test/regression/FreshV3TwapOverride.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/regression/FreshV3TwapOverride.t.sol:1)

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
- This is distinct from edge case 29. There the outbound source snapshot itself is wrong. Here the stored remote snapshot is already correct, but the destination chain zeroes it at read time during currency conversion.

Impact:

- A project owner or controller can suppress already-correct remote surplus and balance views on the destination chain simply by placing a forwarding wrapper first in the local terminal list.
- `JBSuckerRegistry.remoteSurplusOf(...)` consumes these peer-chain conversion views, and `REVOwner` / `REVLoans` consume `remoteSurplusOf(...)` directly. That means cross-chain revnet cash-out and borrow curves can be depressed on the destination chain even while the peer snapshot itself remains correct.
- I did not find a direct theft path from this undercount alone, so this is an economic-grief and accounting-quality issue rather than a drain.

Evidence:

- PoC: [nana-suckers-v6/test/regression/FirstTerminalRemoteConversionGap.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/regression/FirstTerminalRemoteConversionGap.t.sol:1)
- Regression: [nana-suckers-v6/test/regression/FirstTerminalRemoteConversionGap.t.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/test/regression/FirstTerminalRemoteConversionGap.t.sol:1) now asserts the later live store is used even when the forwarding wrapper is first.

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

- Regression: [univ4-router-v6/test/regression/BuybackMetadataPreviewIgnored.t.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/test/regression/BuybackMetadataPreviewIgnored.t.sol:1)

Recommended fix:

- Review and merge the local metadata-only buyback pay-preview patch.
- Keep the realized-output check from edge case 2 in place so a terminal that overstates metadata cannot underfill user minima.

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

- Regression: [nana-router-terminal-v6/test/regression/RawBuybackQuoteRouteMisrank.t.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/test/regression/RawBuybackQuoteRouteMisrank.t.sol:1)

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
- This is the sell-side analogue of edge case 34, and it matters for the same reason: an immutable best-execution router should not silently disregard the live output surface of the protocols it is comparing.

Evidence:

- Regression: [univ4-router-v6/test/regression/BuybackCashOutMetadataIgnored.t.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/test/regression/BuybackCashOutMetadataIgnored.t.sol:1)

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
- This is the buy-side counterpart to edge case 35. There the router overvalued a sell-side route using optimistic raw output; here it undervalues a buy-side route by scoring only the conservative minimum.

Evidence:

- Regression: [nana-router-terminal-v6/test/regression/ConservativeBuybackPreviewRouteMisrank.t.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/test/regression/ConservativeBuybackPreviewRouteMisrank.t.sol:136)

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

- Regression: [nana-router-terminal-v6/test/regression/BuybackSellFallbackStrandsSourceTokens.t.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/test/regression/BuybackSellFallbackStrandsSourceTokens.t.sol:1)

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

- Regression: [nana-router-terminal-v6/test/regression/GrossCashOutPreviewRouteMisrank.t.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/test/regression/GrossCashOutPreviewRouteMisrank.t.sol:1)

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

- Regression: [univ4-router-v6/test/regression/BuybackSellFallbackStrandsProjectTokens.t.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/test/regression/BuybackSellFallbackStrandsProjectTokens.t.sol:1)

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

- Related surviving regression: [RegressionFeeFreeSurplusCashoutMisroute.t.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/test/regression/RegressionFeeFreeSurplusCashoutMisroute.t.sol:1). The old `FeelessSellQuoteUnderranksJB.t.sol` file is no longer present in the working tree; the broader sell-preview / fee-free-surplus routing edge remains tracked as Current Open Edge Case Z.

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

- Regression: [univ4-lp-split-hook-v6/test/regression/FeeClaimTokenFOTAccounting.t.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/test/regression/FeeClaimTokenFOTAccounting.t.sol:1)

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

- Regression: [univ4-lp-split-hook-v6/test/regression/NonPrimaryBalanceSelectionDoS.t.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/test/regression/NonPrimaryBalanceSelectionDoS.t.sol:1)

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

- Regression: [nana-router-terminal-v6/test/regression/RegistrySelfLockDoS.t.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/test/regression/RegistrySelfLockDoS.t.sol:1)

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

- Regression: [croptop-core-v6/test/regression/RegressionFreshRound.t.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/test/regression/RegressionFreshRound.t.sol:319)
- Regression: [croptop-core-v6/test/regression/RegressionSuckerWrapper.t.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/test/regression/RegressionSuckerWrapper.t.sol:124)

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

- Regression: [nana-721-hook-v6/test/regression/ProjectDeployerAuth.t.sol](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/test/regression/ProjectDeployerAuth.t.sol:1)

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

---

*Edge Cases 48-77 added from Regression Regression run `20260505-141037` and Regression Review run `20260505-141034`. Cross-referenced, corroborated against current code, and deduplicated against all prior edge cases.*

### 48. `nana-distributor-v6`: stale unaccounted ERC-20 can be assigned through controller-prepaid split credit

Severity: `HIGH`

Status: ACCEPTED RISK / DOCUMENTED / NOT COUNTED AS CURRENT BLOCKER

Source: Regression (verified), corroborated against code.

Affected code:

- [JBTokenDistributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JBTokenDistributor.sol:100)
- [JB721Distributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JB721Distributor.sol:131)

Why it is real:

- `processSplitWith` has a "prepaid" else-branch that checks `actual - _accountedBalanceOf[token]` as proof the caller funded the split.
- Any ERC-20 tokens sent directly to the distributor (accidental transfers, airdrops) accumulate as unaccounted balance.
- Any project controller -- including a malicious one set by a project owner via `JBDirectory.setControllerOf` -- can call `processSplitWith` without providing an allowance, causing the else-branch to attribute the stale unaccounted balance to the attacker's hook.
- The `unaccounted` balance is global across all hooks for that token.

Impact:

- Any directly-transferred ERC-20 tokens sitting in the distributor can be claimed by an attacker controlling any project's controller.
- Worst case: accidental ERC-20 transfers or airdrops to the distributor contract are claimable by any project controller. The distributor is not intended to hold user funds outside of active distributions, so the real-world exposure is limited to fat-finger transfers and unsolicited airdrops.

Recommended fix:

- Document that the distributor does not custody stray tokens and that direct transfers are at-risk. No code change.

Admin note: dont fix, accepted risk, document.


### 49. `nana-core-v6`: ERC777-style reentrant deposits can double-count balance deltas

Severity: `HIGH`

Status: ACCEPTED RISK / DOCUMENTED / NOT COUNTED AS CURRENT BLOCKER

Source: Review (confidence 95), corroborated against code.

Affected code:

- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:1046)

Why it is real:

- `_acceptFundsFor` uses a before/after balance delta pattern around `_transferFrom`.
- For ERC777-compatible tokens, the sender's callback fires during `_transferFrom`. The attacker re-enters `pay()` or `addToBalanceOf()`.
- The inner call runs its own `_acceptFundsFor`, records correctly, but when the outer call resumes, `_balanceOf(token) - balanceBefore` returns `outerAmount + innerAmount`, double-counting the inner deposit.
- No `ReentrancyGuard` or `nonReentrant` modifier protects `pay()` or `addToBalanceOf()`.

Impact:

- A reentrant ERC777-compatible token deposit can mint double the project tokens for a single economic transfer. Only affects tokens with transfer callbacks (ERC-777). Mainstream ERC-777 tokens are extremely rare; no canonical deploy-all terminal accepts one.

Recommended fix:

- Document that ERC-777 tokens (tokens with transfer callbacks) are not supported. No code change — adding `nonReentrant` to all payment entry points is not warranted for this rare edge case.

Admin note: dont add nonReentrant to all calls for this rare case. document the risk and move on.

### 50. `nana-buyback-hook-v6`: registry-scoped slippage metadata is ignored by resolved hooks

Severity: `HIGH`

Status: OPEN / PROMOTED TO CURRENT OPEN FINDING AG

Source: Review (confidence 90), corroborated against code.

Affected code:

- [JBBuybackHookRegistry.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHookRegistry.sol:358)
- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol:833)

Why it is real:

- `JBBuybackHook` parses metadata IDs via `JBMetadataResolver.getId("quote")`, which scopes to `address(this)` (the hook's own address).
- When `JBBuybackHookRegistry` is the data hook, it forwards `context.metadata` unchanged to the underlying hook.
- If a client encodes metadata scoped to the registry's address (the natural choice since the registry is the visible data hook), the hook will not find the entry and silently falls through to TWAP-based quoting.

Impact:

- User-specified slippage protection is silently dropped. Execution settles at whatever the TWAP oracle produces.

Recommended fix:

- See Current Open Edge Case AG.

Admin note: could be could for the registry to reroute anything addressed to it to the currently set buyback hook.

### 51. `nana-suckers-v6`: V4 native-token swaps revert before settlement

Severity: `HIGH`

Status: OPEN / PROMOTED TO CURRENT OPEN FINDING AH

Source: Review (confidence 90), corroborated against code.

Affected code:

- [JBSwapPoolLib.sol](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/src/libraries/JBSwapPoolLib.sol:238)

Why it is real:

- The sucker send path cashes out project tokens via `prepare()`, receiving raw ETH.
- `_executeSwap` normalizes NATIVE_TOKEN to WETH for pool discovery. If a V4 pool is chosen, the unlock callback tries `WETH.withdraw(amountIn)` but the sucker holds raw ETH, not WETH.
- `WETH.withdraw()` reverts because the sucker has no WETH balance.

Impact:

- Native-token CCIP sends revert when pool discovery selects a V4 pool, blocking cross-chain bridge operations for that route.

Recommended fix:

- See Current Open Edge Case AH.

Admin note: we changed this to native wrapped token, but if it remains an issue, fix it.

### 52. `defifa`: launcher-selected terminals can forge hook callbacks

Severity: `HIGH`

Status: OPEN / PROMOTED TO CURRENT OPEN FINDING AD

Source: Review (confidence 85), corroborated against code.

Affected code:

- [DefifaDeployer.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaDeployer.sol:383)
- [DefifaHook.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaHook.sol:523)

Why it is real:

- `launchGameWith` accepts a caller-supplied `terminal` address registered in the directory via `controller.launchRulesetsFor(...)`.
- `DefifaHook` validates callbacks by checking `DIRECTORY.isTerminalOf(projectId, msg.sender)`. Since the malicious terminal was registered, this check passes.
- The malicious terminal can call `afterPayRecordedWith` with fabricated contexts for free mints and unauthorized burns.

Impact:

- Permissionless Defifa game launches can include a malicious terminal that mints arbitrary NFTs and manipulates game outcomes.

Recommended fix:

- See Current Open Edge Case AD.

Admin note: accepted risk, clients should cross reference terminals in use.

### 53. `croptop-core-v6`: caller-controlled fee metadata can refund Croptop fees

Severity: `HIGH`

Status: FIXED. Merged to main in `croptop-core-v6/src/CTPublisher.sol` and `croptop-core-v6/src/interfaces/ICTPublisher.sol`.

Source: Review (confidence 92), corroborated against code.

Affected code:

- [CTPublisher.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/src/CTPublisher.sol:309)

Why it is real:

- `mintFrom` settles the main project payment first, then attempts the fee payment to the fee project.
- The `feeMetadata` parameter is caller-supplied and forwarded directly. The caller can craft metadata that causes the fee project's data hook to revert.
- The `try...catch` block catches the revert and refunds the entire fee amount to the caller.
- Current Croptop docs and tests explicitly accept this liveness-first fallback: `RISKS.md`, `README.md`, `ARCHITECTURE.md`, and `test/regression/FeeFallbackBlackhole.t.sol` all describe or assert fee-terminal failure refunding `_msgSender()` instead of trapping funds.

Impact:

- Callers can mint Croptop NFTs without paying the 5% fee by deliberately causing the fee payment to revert.
- Because the behavior is documented and regression-tested as intentional, this report does not count it as a current blocker. It remains an explicit economic tradeoff to accept before deployment.

Recommended fix:

- Remove the caller-supplied `feeMetadata` parameter from `mintFrom`. Construct fee payment metadata internally (protocol-controlled) so callers cannot craft metadata that triggers a revert in the fee project's data hook.

Admin note: remove payer-provided fee metadata. Protocol constructs fee metadata internally.

### 54. `deploy-all-v6`: Banny resolver metadata initialization called by wrong owner

Severity: `HIGH`

Status: OPEN / PROMOTED TO CURRENT OPEN FINDING AC

Source: Review (confidence 90), corroborated against code.

Affected code:

- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:2493)

Why it is real:

- `_deployBanny()` deploys `Banny721TokenUriResolver` with `owner: operator` (a hardcoded multisig, not the Sphinx Safe).
- Immediately after, the script calls `resolver.setMetadata(...)` from the Safe.
- `setMetadata` has `onlyOwner`, so the call reverts with `OwnableUnauthorizedAccount`.

Impact:

- Fresh deployments revert during Banny Phase 09, blocking the one-shot deploy path.

Recommended fix:

- See Current Open Edge Case AC.

admin note: dont sweat it.

### 55. `nana-omnichain-deployers-v6`: extra hook weight is applied to split funds

Severity: `MED`

Status: FIXED IN CURRENT CODE / NOT COUNTED AS CURRENT BLOCKER

Source: Review (confidence 85), stale against current code.

Affected code:

- [JBOmnichainDeployer.sol](/Users/jango/Documents/jb/v6/evm/nana-omnichain-deployers-v6/src/JBOmnichainDeployer.sol:575)

Why it is fixed:

- Current `JBOmnichainDeployer.beforePayRecordedWith(...)` first computes `projectAmount = context.amount.value - totalSplitAmount`, then passes `hookContext.amount.value = projectAmount` into the extra data hook.
- If the 721 hook scaled weight for tier splits, the extra hook's returned weight is also scaled by `tiered721Weight / context.weight`, avoiding over-minting against split funds.
- Focused regression tests in `test/Tiered721HookComposition.t.sol` passed for the split-plus-buyback AMM and mint paths.

Recommended fix:

- Keep the split-plus-extra-hook regression tests in the deployer suite.

### 56. `deploy-all-v6`: Resume retries approval after REV already owns project 3

Severity: `MED`

Status: FIXED. See Current Open Edge Case AB.

admin note: fix if you think its needed and there are no tradeoffs.

### 57. `banny-retail-v6`: deployment script missing `peer` field causes compilation failure

Severity: `MED`

Status: FIXED. Merged to main in `banny-retail-v6/script/Deploy.s.sol`. Added `peer: bytes32(0)` to all 4 `JBSuckerDeployerConfig` struct literals.

Source: Regression (verified).

Affected code:

- [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/banny-retail-v6/script/Deploy.s.sol:321)

Why it is real:

- `JBSuckerDeployerConfig` now requires a `peer` field, but the deployment script constructs it without one.

Recommended fix:

- Add the `peer` field to all `JBSuckerDeployerConfig` literals in the deployment script. Use `address(0)` for default same-address peering, or supply the explicit remote peer address.
- The canonical `deploy-all-v6` Banny path already passes `peer: bytes32(0)`; this row tracks the standalone Banny repo's default script/build path only.

admin note: fix.

### 58. `banny-retail-v6`: migration balance verification skips all owners for a tier when fallback resolver owns any token

Severity: `MED`

Status: ACCEPTED / DEFERRED. Admin accepted: "don't sweat migration script." Canonical one-shot path does not use the standalone Banny migration helper.

Source: Both Regression and Review.

Affected code:

- [MigrationHelper.sol](/Users/jango/Documents/jb/v6/evm/banny-retail-v6/script/helpers/MigrationHelper.sol:95)

Why it is real:

- `verifyTierBalances()` `continue`s past all owner checks for a tier if the V4 fallback resolver has any positive balance, allowing V5 over-allocation to survive the safety check.

Recommended fix:

- Only skip the specific fallback-resolver owner entry, not all remaining owners in the tier. Move the `continue` inside the owner-specific check rather than at the tier level.
- This helper is not part of the canonical `deploy-all-v6` one-shot path, which launches the BAN/Banny project directly rather than running the standalone Banny migration script.

admin note: dont sweat the migration script.

### 59. `nana-distributor-v6`: percentage vesting can exhaust entries without transferring rounded-down dust

Severity: `MED`

Status: FIXED. Merged to main in `nana-distributor-v6/src/JBDistributor.sol`. `shareClaimed` now only updates when `claimAmount != 0`, keeping dust entries unconsumed for future accumulation. The stale ERC-20 balance attribution portion of Current Open Edge Case AE remains open.

Source: Both Regression and Review.

Affected code:

- [JBDistributor.sol](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/src/JBDistributor.sol:560)

Why it was real:

- Small vesting entries produced zero-amount partial claims due to `mulDiv` rounding but still advanced `shareClaimed`. Dust remained locked permanently.

### 60. `croptop-core-v6`: fee can be mis-scaled for non-ETH/18-decimal 721 hooks

Severity: `MED`

Status: OPEN / PROMOTED TO CURRENT OPEN FINDING J

Source: Both Regression and Review.

Affected code:

- [CTPublisher.sol](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/src/CTPublisher.sol:220)

Why it is real:

- `mintFrom` computes fees in the hook's pricing units without converting to native ETH. For hooks priced in USD/6-decimals, massive underpayment.

Recommended fix:

- See Current Open Edge Case J.

admin note: verify with tests and fix. make sure we have croptop purchases with usdc working, taking fees to eth based project.

### 61. `defifa`: delayed attestation starts can make scorecard ratification impossible

Severity: `MED`

Status: OPEN / PROMOTED TO CURRENT OPEN FINDING AD

Source: Regression (verified). Distinct from fixed #7.

Affected code:

- [DefifaDeployer.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaDeployer.sol:430)
- [DefifaGovernor.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaGovernor.sol:328)

Why it is real:

- `launchGameWith` validates `scorecardTimeout > attestationGracePeriod + timelockDuration` but ignores the delay between SCORING start and `attestationStartTime`. Attestations cannot begin before the no-contest timeout fires.

Recommended fix:

- See Current Open Edge Case AD.

admin note: confirm with a test, and fix.

### 62. `defifa`: direct balance top-ups can force below-threshold games into scoring

Severity: `MED`

Status: OPEN / PROMOTED TO CURRENT OPEN FINDING AD

Source: Review (confidence 82).

Affected code:

- [DefifaDeployer.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaDeployer.sol) -- `currentGamePhaseOf`

Why it is real:

- The no-contest participation check uses live terminal balance. An attacker can `addToBalanceOf` without minting NFTs to push a below-threshold game into SCORING.

Recommended fix:

- See Current Open Edge Case AD.

admin note: confirm with a test, and fix.

### 63. `defifa`: third-party mints can strand default-delegated voting power

Severity: `MED`

Status: FIXED IN CURRENT CODE / NOT COUNTED AS CURRENT BLOCKER

Source: Review (confidence 80).

Affected code:

- [DefifaHook.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaHook.sol) -- `_processPayment`

Why it is fixed:

- `DefifaHook._transferTierAttestationUnits(...)` now auto-delegates minted attestation units to the recipient when the recipient has no tier delegate set, preventing third-party mints from leaving voting power permanently undelegated.
- The explicit metadata delegate still cannot be used by a third-party payer to overwrite the beneficiary's long-lived delegate preference.

Recommended fix:

- Keep the auto-delegation regression coverage for third-party payer mints.

### 64. `nana-omnichain-deployers-v6`: same salt can deploy non-peer suckers because salt stack includes chain-local addresses

Severity: `MED`

Status: OPEN / PROMOTED TO CURRENT OPEN FINDING Y

Source: Regression (verified).

Affected code:

- [JBOmnichainDeployer.sol](/Users/jango/Documents/jb/v6/evm/nana-omnichain-deployers-v6/src/JBOmnichainDeployer.sol:176)

Why it is real:

- When `peer == 0`, suckers default `peer()` to their own address. Different chains produce different wrapper/registry addresses even with the same salt, so suckers deploy at different addresses and aren't valid peers.

Recommended fix:

- See Current Open Edge Case Y.

admin note: diffrent chains should produce the same sucker addresses for peering.

### 65. `nana-core-v6`: periphery deployment hardcodes omnichain operator with only nonzero validation

Severity: `MED`

Status: LOW PRIORITY / STANDALONE DEPLOYMENT RISK / NOT COUNTED AS CURRENT DEPLOY-ALL BLOCKER. Covered by external/auth surface verifier checks (G/O) for deploy-all. Standalone script operator choice.

Source: Regression (verified).

Affected code:

- [DeployPeriphery.s.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/script/DeployPeriphery.s.sol:39)

Why it is real:

- `DeployPeriphery.deploy()` installs a hardcoded address as the immutable `OMNICHAIN_RULESET_OPERATOR` with only a nonzero check. No bytecode or CREATE2 validation. Production deploys go through `deploy-all-v6`, so this primarily affects standalone deployments.

Recommended fix:

- Validate the operator address by checking bytecode presence (`address.code.length > 0`) or computing the expected CREATE2 address from known inputs before passing it as an immutable.
- The canonical `deploy-all-v6` path deploys core directly and separately verifies omnichain/deployer wiring; this row tracks the standalone `nana-core-v6` periphery script.

admin note: just the address is fine.

### 66. `univ4-lp-split-hook-v6`: LP bounds ignore enabled Juicebox data hooks

Severity: `MED`

Status: ACCEPTED. LP hook does not query data hook state by design. See `univ4-lp-split-hook-v6/RISKS.md` §7.4: "Pre-initialized pools accepted regardless of price." LP bounds are set independently of Juicebox data hooks.

Source: Review (confidence 85).

Affected code:

- [JBUniswapV4LPSplitHook.sol](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol) -- `deployPool`

Why it is real:

- LP range is computed from `currentReclaimableSurplusOf` and raw ruleset weight. Actual `pay` and `cashOutTokensOf` can be overridden by enabled data hooks.

Recommended fix:

- Query hook-adjusted previews (via `IJBRulesetDataHook.beforePayRecordedWith` / `beforeCashOutRecordedWith`) when computing LP bounds, or document that LP deployment should only occur when data hooks are neutral and add a guard that reverts if the active ruleset has a data hook enabled.
- This does not add an independent blocker to the current one-shot deploy unless the rollout intends to deploy LP ranges for projects with active non-neutral Juicebox data hooks before the verifier/runbook is updated.

admin notes: lp hook should always use actual cash out and pay values, not influenced by hooks.

### 67. `banny-retail-v6`: attachment views stay stale during outbound ERC721 callbacks

Severity: `MED`

Status: ACCEPTED RISK / DOCUMENTED / NOT COUNTED AS CURRENT BLOCKER

Source: Review (confidence 75).

Affected code:

- [Banny721TokenUriResolver.sol](/Users/jango/Documents/jb/v6/evm/banny-retail-v6/src/Banny721TokenUriResolver.sol) -- `_tryTransferFrom`

Why it is real:

- `_tryTransferFrom` calls `safeTransferFrom` before clearing the attachment record. A receiver callback sees stale `assetIdsOf` data.

Recommended fix:

- Clear the attachment record before calling `safeTransferFrom` (checks-effects-interactions pattern).
- Note: the fix requires restore-on-failure logic — if the transfer fails after clearing, the attachment record must be restored to prevent NFT stranding. The naive move-clear-before-transfer breaks the current try-catch safety.
- This is a Banny resolver callback-observability issue, not part of the canonical deploy-all transaction ordering or verification gate.

Admin note: accept and document. The CEI fix requires clear-before + restore-on-failure which adds complexity for a low-impact callback observability edge case. No code change.

### 68. `nana-project-handles-v6`: `.eth` handles can be verified through different `.eth.eth` ENS nodes

Severity: `MED`

Status: OPEN / PROMOTED TO CURRENT OPEN FINDING R

Source: Review (confidence 85).

Affected code:

- [JBProjectHandles.sol](/Users/jango/Documents/jb/v6/evm/nana-project-handles-v6/src/JBProjectHandles.sol) -- `handleOf` / `_namehash`

Why it is real:

- Setting parts `["eth", "vitalik"]` verifies `vitalik.eth.eth` but returns `vitalik.eth`. An attacker controlling the `eth.eth` ENS node can spoof canonical `.eth` handles.

Recommended fix:

- See Current Open Edge Case R.

admin note: fix it.

### 69. `nana-buyback-hook-v6`: fee-on-transfer reclaim tokens bypass final delivery minimums

Severity: `MED`

Status: ACCEPTED. Fee-on-transfer tokens are explicitly unsupported. See `nana-router-terminal-v6/RISKS.md` §4 and `nana-buyback-hook-v6/RISKS.md`. The buyback hook's FOT guard is best-effort only.

Source: Review (confidence 85).

Affected code:

- [JBBuybackHook.sol](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/src/JBBuybackHook.sol) -- `afterCashOutRecordedWith`

Why it is real:

- The hook checks its intermediate `amountReceived` before forwarding. A fee-on-transfer token satisfies the floor at the hook while delivering less to the beneficiary.

Recommended fix:

- Check the beneficiary's balance delta after the final transfer rather than the hook's intermediate receipt, or document that fee-on-transfer tokens are unsupported for buyback hook cash-outs.
- The canonical deploy-all native-token buyback paths do not depend on fee-on-transfer reclaim tokens; keep this as an ecosystem hardening item before supporting arbitrary fee-on-transfer terminal tokens.

admin note: if its quick and small diff with no unintended consequences, fix it.

### 70. `univ4-router-v6` + `nana-buyback-hook-v6`: zero-tax fee-free surplus cashouts mis-route vs V4

Severity: `MED`

Status: FIXED. Merged to main in `univ4-router-v6/src/JBUniswapV4Hook.sol`. Removed the early return at `cashOutTaxRate == 0` so fee deduction runs even for zero-tax cashouts. The broader Current Open Edge Case Z (feeless router cash-out fee bypass) remains open.

Source: Both Regression and Review.

Affected code:

- [JBUniswapV4Hook.sol](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/src/JBUniswapV4Hook.sol:250)

Why it is real:

- `calculateExpectedOutputFromSelling` returns gross reclaim when `cashOutTaxRate == 0`, but live execution deducts fees from zero-tax cashouts when `_feeFreeSurplusOf` is nonzero. PR #114 fixed the general case, but this edge case remains.

Recommended fix:

- See Current Open Edge Case Z.

admin note: if its quick and small diff with no unintended consequences, fix it.

### 71. `nana-omnichain-deployers-v6`: non-empty sucker config silently ignored when launch salt is zero

Severity: `LOW`

Status: LOW PRIORITY / INTEGRATOR FOOTGUN / NOT COUNTED AS CURRENT DEPLOY-ALL BLOCKER. Canonical deploy-all uses nonzero sucker salts. Consider adding revert or warning when salt=0 but config non-empty.

Source: Regression (verified).

Affected code:

- [JBOmnichainDeployer.sol](/Users/jango/Documents/jb/v6/evm/nana-omnichain-deployers-v6/src/JBOmnichainDeployer.sol:775)

Why it is real:

- `_launchProjectFor` uses `salt != bytes32(0)` as the sole condition for deploying suckers. A launch with sucker deployer configurations but `salt == 0` silently skips sucker deployment.

Recommended fix:

- Revert if sucker configs are non-empty but salt is zero, or decouple sucker deployment from the salt condition.
- The canonical revnet configs built by `deploy-all-v6` use a nonzero sucker salt; this row tracks generic integrator misuse.

admin note: ignore and accept.

### 72. `nana-omnichain-deployers-v6`: safe project NFT transfers accepted and can strand ownership

Severity: `LOW`

Status: FIXED. Merged to main in `nana-omnichain-deployers-v6/src/JBOmnichainDeployer.sol`. Now rejects non-mint transfers with `if (msg.sender != address(PROJECTS) || from != address(0)) revert`.

Source: Regression (verified).

Affected code:

- [JBOmnichainDeployer.sol](/Users/jango/Documents/jb/v6/evm/nana-omnichain-deployers-v6/src/JBOmnichainDeployer.sol:328)

### 73. `nana-project-handles-v6`: middle dots accepted inside stored ENS name parts

Severity: `LOW`

Status: ACCEPTED BY CURRENT CODE / DOCS CLEANUP ONLY

Source: Regression (verified).

Affected code:

- [JBProjectHandles.sol](/Users/jango/Documents/jb/v6/evm/nana-project-handles-v6/src/JBProjectHandles.sol:87)

Why it is accepted:

- Current code intentionally builds `_namehash(...)` from the formatted visible handle so dots inside a stored part resolve as ENS label separators too.
- Existing tests cover multi-level handles; the remaining cleanup is documentation wording that still implies dots are rejected outright.

Recommended fix:

- Refresh docs/risk wording, or change the API to reject all dots if the product wants one ENS label per stored part.

admin note: clean docs.

### 74. `nana-router-terminal-v6`: `discoverPool()` returns zero address when a V4 pool wins discovery

Severity: `LOW`

Status: ACCEPTED. Returning `address(0)` from a view getter for a V4 pool winner is friendlier than reverting. Won't-fix by design decision.

Source: Regression (verified).

Affected code:

- [JBRouterTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/src/JBRouterTerminal.sol:564)

Why it is real:

- The V3-only `discoverPool()` wrapper calls `_discoverPool()`. When a V4 pool has higher liquidity, `isV4` is true and the wrapper neither reverts nor assigns the return value, returning `address(0)`.

Recommended fix:

- Revert with a descriptive error when `isV4` is true in the V3-only wrapper, signaling that callers should use the V3+V4 discovery variant.
- This affects the V3-only helper's return semantics, not router settlement itself.

admin note: if its quick and small diff with no unintended consequences, fix it.

### 75. `nana-permission-ids-v6`: `REVEAL_TOKENS` permission ID defined but has no enforcement path

Severity: `LOW`

Status: FIXED. Merged to main in `nana-permission-ids-v6/src/JBPermissionIds.sol`. Removed the unused `REVEAL_TOKENS = 40` constant and its NatSpec.

Source: Regression (verified).

### 76. `nana-project-payer-v6`: direct deployments can be reinitialized by original deployer

Severity: `LOW`

Status: LOW PRIORITY / DIRECT-DEPLOYMENT EDGE / NOT COUNTED AS CURRENT DEPLOY-ALL BLOCKER. Clones via `JBProjectPayerDeployer` are safe (deployer initializes immediately). Direct standalone deployments are an edge case; deploy-all risk is verifier authentication of the factory/implementation pair, covered by T.

Source: Regression (verified).

Affected code:

- [JBProjectPayer.sol](/Users/jango/Documents/jb/v6/evm/nana-project-payer-v6/src/JBProjectPayer.sol:116)

Why it is real:

- `initialize()` only checks `msg.sender == DEPLOYER` without an initialized flag. For direct (non-clone) deployments, the deployer can re-initialize after ownership transfer.

Recommended fix:

- Add an `initialized` flag that prevents re-initialization, or use OpenZeppelin's `Initializable` base contract.
- Clones deployed through `JBProjectPayerDeployer` are initialized immediately and cannot be reinitialized by users because the deployer contract exposes no reinitialize entrypoint. Current Open Edge Case T covers the production verifier gap for authenticating the deployer/implementation that users will clone.

admin note: but our deployer doesnt have this capacity so we're safe, right?

### 77. `croptop-core-v6`: fee-project configuration script is not restart-safe

Severity: `LOW`

Status: FIXED. Merged to main in `croptop-core-v6/script/ConfigureFeeProject.s.sol`. Wrapped approve+deployFor in a `controllerOf` check to skip when already configured.

Source: Regression (verified).

### 78. `defifa`: default ERC-20 game card metadata hard-depends on payment-token `symbol()`

Severity: `LOW`

Status: FIXED. Merged to main in `defifa/src/DefifaTokenUriResolver.sol`. Added try/catch around `symbol()` with hex-address fallback, plus SVG escaping for returned symbols.

Source: Regression (verified).

Affected code:

- [DefifaTokenUriResolver.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaTokenUriResolver.sol:124)
- [DefifaTokenUriResolver.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaTokenUriResolver.sol:177)
- [DefifaTokenUriResolver.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/DefifaTokenUriResolver.sol:287)
- [DefifaLaunchProjectData.sol](/Users/jango/Documents/jb/v6/evm/defifa/src/structs/DefifaLaunchProjectData.sol:44)

Why it is real:

- Defifa launch data lets a game creator choose the ERC-20 accounting token for a game.
- The default `DefifaTokenUriResolver` pulls the game-pot token from `currentGamePotOf(...)` and, for non-native tokens, formats balances by calling `IERC20Metadata(token).symbol()` directly.
- There is no `try/catch`, fallback label, or SVG escaping around that symbol. A temporary local review test launched an ERC-20 game through the existing harness, mocked the payment token's `symbol()` to revert, and confirmed `_nft.tokenURI(...)` reverts with the same payload. The temporary file was removed after the proof run.
- If a non-standard payment token lacks ERC-20 metadata, or a token's symbol implementation starts reverting, every default Defifa game-card metadata query for that game becomes unreadable even though gameplay accounting can still work. If the symbol succeeds but contains SVG metacharacters, it is interpolated into SVG text without `_escapeSvg(...)`.

Recommended fix:

- In `_formatBalance(...)`, wrap ERC-20 `symbol()` reads in `try/catch` and fall back to a deterministic safe label such as the token address.
- Escape the symbol before writing it into the SVG text, or constrain supported ERC-20 game tokens to validated metadata symbols at launch.
- Keep this as a user-experience / indexer robustness cleanup unless the deployment manifest starts advertising arbitrary ERC-20 Defifa games as first-class supported products.

### 79. `nana-core-v6`: split dust payouts can orphan project funds when minimum-fee rounding consumes the entire payout

Severity: `MED`

Status: FIXED / MINIMUM-FEE ROUNDING REVERTED

Source: OpenAI Regression security edge case (validated, attack-path: medium).

Affected code:

- [JBFees.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/libraries/JBFees.sol:21)
- [JBMultiTerminal.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/JBMultiTerminal.sol:2208)
- [JBPayoutSplitGroupLib.sol](/Users/jango/Documents/jb/v6/evm/nana-core-v6/src/libraries/JBPayoutSplitGroupLib.sol:89)

Why it was real:

- The dust-fee-protection commit made `feeAmountFrom(1, 25)` return `1` instead of `0`, so a 1-unit split payout had `netPayoutAmount = 0` after fee deduction.
- `JBPayoutSplitGroupLib` only adds to `amountEligibleForFees` when `netPayoutAmount != 0 && netPayoutAmount != payoutAmount`. The zero-net payout was excluded.
- `JBTerminalStore.recordPayoutFor` already decremented the project balance by the gross amount before split processing.
- Result: 1 unit remained physically in the terminal but was credited to neither the project nor the fee project. For public-payout projects with non-feeless splits, any caller could repeatedly trigger 1-base-unit split payouts to consume payout limits and orphan funds.

Fix applied:

- Reverted the minimum-fee rounding in `JBFees.feeAmountFrom`, `JBFees.feeAmountResultingIn`, and `JBMultiTerminal._feeAmountFrom`. Dust amounts below the fee rounding threshold now pay zero fee (floor division). The gas cost of exploiting dust fee bypass far exceeds the bypassed fee value.
- Documented the tradeoff in `nana-core-v6/RISKS.md` § 2 "Fee Arithmetic".

Admin note: option D — revert the minimum-fee rounding and document in RISKS.

### 80. `revnet-core-v6`: REALLOCATE_LOAN operator can open new loans with additional victim collateral

Severity: `MED`

Status: ACCEPTED RISK / DOCUMENTED PERMISSION TRUST BOUNDARY / NOT COUNTED AS CURRENT BLOCKER

Source: OpenAI Regression security scan (commit d0b09ef9, validated against current code).

Affected code:

- [REVLoans.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVLoans.sol:718)

Why it is real:

- `reallocateCollateralFromLoan` accepts a caller-supplied `collateralCountToAdd` parameter that burns additional tokens from the loan owner's balance as extra collateral for the new loan.
- An operator with `REALLOCATE_LOAN` permission can specify an arbitrary `collateralCountToAdd`, burning the victim's tokens as additional collateral, and set `beneficiary` to any address to receive the borrowed funds.
- The code documents this at lines 704-705: "A delegated operator (with REALLOCATE_LOAN permission) can set beneficiary to any address, directing borrowed funds from the new loan away from the loan owner. Grant this permission only to trusted operators."
- The loan NFT is minted to the loan owner (not the operator), so collateral is recoverable upon repayment. But `collateralCountToAdd` expands the attack surface beyond pure reallocation.

Recommended fix:

- Accept the documented trust boundary. Front-end/client code must warn users about granting REALLOCATE_LOAN permission, making clear that operators with this permission can burn additional tokens as collateral and direct loan proceeds to any address.

Admin note: accepted trust boundary. front-end/client code should warn users about granting REALLOCATE_LOAN.

### 81. `revnet-core-v6`: REVHiddenTokens NatSpec contradicts implementation on denominator inclusion

Severity: `LOW`

Status: FIXED / NATSPEC CORRECTED

Source: OpenAI Regression security scan (corroborated against current code).

Affected code:

- [REVHiddenTokens.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVHiddenTokens.sol:16)
- [REVLoans.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVLoans.sol:360)
- [REVOwner.sol](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/src/REVOwner.sol:382)

Why it is real:

- `REVHiddenTokens.sol` NatSpec (line 16-17) states: "REVOwner and REVLoans add the hidden supply back into their economic denominators while those tokens remain revealable."
- The actual code in `REVLoans._borrowableAmountFrom` (line 360) says: "Hidden tokens are intentionally excluded from borrowing math."
- `REVOwner.peerChainAdjustedAccountsOf` (line 383) also confirms: "Hidden tokens are intentionally excluded."
- The NatSpec is misleading and could cause downstream integrators to make incorrect assumptions about supply accounting.

Recommended fix:

- Update the REVHiddenTokens.sol NatSpec to say hidden tokens are intentionally excluded from economic denominators, matching the implementation comments.

### Regression Security Scan Bulk Triage (2026-05-06)

119 edge cases triaged from `/Users/jango/Downloads/regression-security-edge cases-2026-05-06T12-35-24.389Z.csv`.

- **34 INFORMATIONAL**: CI/compilation/test/lockfile noise. Dropped.
- **77 against OLD commits**: Bugs introduced and subsequently fixed in later commits, or against V3/V4 era code not applicable to V6. Dropped.
- **3 CRITICAL**: All FALSE POSITIVE.
  - Hidden-token denominator extraction: intentional design, operator-gated, documented in code.
  - USD ID 2 botched feed: V6 deploys fresh JBPrices with no stale feeds.
  - Delegatecall forged pay callbacks: 2023 V3 commit, V6 uses entirely different architecture.
- **7 of 8 RECENT edge cases**: FALSE POSITIVE or DUPLICATE.
  - Stale sucker snapshots: active/deprecated dedup logic handles correctly.
  - Loan debt as peer balance: intentional, documented design.
  - Legacy adjusted-account hooks: fully operational in current code.
  - Hidden tokens excluded from denominators: intentional, documented.
  - Zero price oracle: try/catch handles gracefully.
  - Nonce cache gas grief: claims use merkle proofs + bitmaps, not nonce iteration.
  - FOT cash-out: duplicate of existing edge case #69.
- **1 RECENT edge case**: REAL — REALLOCATE_LOAN operator risk (edge case #80 above).
- **1 MEDIUM (#35)**: Already fixed as edge case #79 (dust fee rounding reverted).

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

- `nana-core-v6`: failed fee routes intentionally forgive protocol fees.
  Dropped because `_processFee` try-catch explicitly credits the fee back to the project when `executeProcessFee` reverts (e.g., no terminal for the fee token on project #1). Code comments document this as intentional: "a broken or misconfigured fee route should not permanently lock project funds." The `FeeReverted` event makes this observable off-chain. (Regression Review 20260505, confirmed against code.)

- `univ4-lp-split-hook-v6`: fee share waived when fee project lacks the collected-token terminal.
  Dropped because `_routeFeesToProject` explicitly resets `feeAmount` to zero when no primary terminal exists, with a code comment: "the fee project simply misses this collection." Liveness of LP fee collection is preferred over reverting when the fee project hasn't configured a terminal for a specific token. (Regression Review 20260505, confirmed against code.)

- `nana-distributor-v6`: future round snapshots eagerly locked one round ahead.
  Dropped because `_ensureSnapshotBlock` intentionally writes `roundSnapshotBlock[round + 1] = block.number - 1` during round N to prevent first-caller manipulation. The resulting staleness (up to one round duration) is the chosen tradeoff for manipulation resistance, documented in code comments. (Regression Review 20260505, confirmed against code.)

- `nana-distributor-v6`: stale unaccounted ERC-20 claimable through controller-prepaid split credit (edge case #48).
  Accepted risk. The distributor is not intended to custody stray tokens; direct transfers and airdrops are at-risk by design. Document in RISKS.md.

- `nana-core-v6`: ERC777-style reentrant deposits can double-count balance deltas (edge case #49).
  Accepted risk. ERC-777 tokens with transfer callbacks are not supported by the protocol. Adding `nonReentrant` to all payment entry points is not warranted for this rare edge case. Document in RISKS.md.

- `banny-retail-v6`: attachment views stay stale during outbound ERC721 callbacks (edge case #67).
  Accepted risk. The CEI fix requires clear-before + restore-on-failure which adds complexity for a low-impact callback observability edge case. No code change.

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

- `defifa`: fee-token cash-out claims now follow the cash-out beneficiary.
  Local patch: `DefifaHook.afterCashOutRecordedWith(...)` passes `context.beneficiary` into the fee-token claim path so terminal-token reclaim, `$DEFIFA`, and `$NANA` settle to the same destination.

- `defifa`: `tokensClaimableFor(...)` no longer overquotes while reserve mints are pending.
  Local patch: the preview now uses `_totalMintCost + _pendingReserveMintCost()`, matching the complete-phase execution denominator.

- `nana-project-handles-v6`: verified handles now reject dangerous Unicode formatting controls before storage.
  Local patch: `setEnsNamePartsFor(...)` rejects common bidi and invisible format-control code points in addition to unsafe dot placements, ASCII control bytes, and DEL, and the spoof PoC has been converted into a regression.

- `nana-router-terminal-v6`: irreversible terminal locks can no longer pin routes that forward back into the registry.
  Local patch: the registry rejects itself as a default or project terminal and validates forwarding terminals before writing `hasLockedTerminal`, so circular targets fail before the lock becomes permanent.

- `nana-router-terminal-v6`: native partial-fill refunds now fail soft.
  Local patch: routed native-input leftovers first try an ETH refund to the original payer and, if that call fails, re-wrap the amount and refund WETH instead. `NativeRefundFallback.t.sol` covers both the successful ETH path and ETH-rejecting recipients.

- `nana-router-terminal-v6`: buy-side best-route scoring now uses canonical buyback-hook raw swap quotes when present.
  Local patch: `JBPayRouteResolver` decodes buyback pay-hook metadata, scores the conservative floor plus any direct mint, and compares the stronger live raw quote when supplied so buyback-hooked routes are ranked against ordinary terminal previews on the same expected-output basis.

- `nana-721-hook-v6`: existing-project ruleset helper flows now fail explicitly before side effects when the helper lacks downstream controller permissions.
  Local patch: `JB721TiersHookProjectDeployer` preflights its own `LAUNCH_RULESETS` / `SET_TERMINALS` / `QUEUE_RULESETS` permissions before deploying hooks and forwarding into `JBController`, so callers get a clear helper-specific error instead of a post-deployment controller revert.

- `nana-721-hook-v6` + `nana-distributor-v6`: 721 round rewards partially moved toward token-specific snapshot ownership, but the live checkpoint module still lacks mint-block proof.
  Current gap: `JB721Distributor` now calls `ownerOfAt(...)`, but `JB721Checkpoints` does not record mint blocks and `ownerOfAt(...)` falls back to current/first owner for never-transferred tokens; see Current Open Edge Case Q.

- `croptop-core-v6`: prior project owners no longer retain direct CTDeployer-owned hook-management permissions after a project NFT transfer.
  Local patch: `CTDeployer.deployProjectFor(...)` no longer grants `ADJUST_721_TIERS`, `SET_721_METADATA`, `MINT_721`, or `SET_721_DISCOUNT_PERCENT` from `CTDeployer` to the initial owner; owners who want direct hook control must claim project-based hook ownership so authority follows the current project NFT owner.

- `croptop-core-v6` + `nana-suckers-v6`: Croptop launches no longer hard-fail on initial sucker rollout, and post-launch registry recovery can map sucker tokens through the authorized registry path.
  Local patch: `CTDeployer.deployProjectFor(...)` emits `CTDeployer_SuckerDeploymentFailed` and keeps the project launch / ownership transfer moving when initial sucker deployment fails, `CTDeployer.deploySuckersFor(...)` now preflights the wrapper's delegated `DEPLOY_SUCKERS` permission explicitly, and `JBSucker` accepts registry-initiated token mapping after the registry has enforced `DEPLOY_SUCKERS`.

- `nana-fee-project-deployer-v6` + `deploy-all-v6`: configured project `1` no longer gets accepted as NANA based only on a nonzero controller.
  Local patch: the standalone fee deployer and deploy-all deploy/resume scripts now require configured project `1` to be owned by the REV deployer, controlled by the canonical controller, have a nonzero revnet configuration hash, and expose the `NANA` token symbol before skipping NANA deployment.

- `revnet-core-v6`: revnet sucker deployment salts intentionally remain caller-namespaced in current code.
  Current code: `REVDeployer._deploySuckersFor(...)` includes `_msgSender()` in the registry salt, and the regression asserts that two identical revnet configs with the same sucker salt but different authorized callers deploy different suckers. This avoids same-chain collisions, but default same-address cross-chain peers still require the same caller and topology or explicit peer wiring; see Current Open Edge Case Y for the deploy-all verification gap.

- `revnet-core-v6`: revnet configuration hashes now commit to terminal addresses and custom policy bits, but still exclude split-operator authority and reserved split routing.
  Current gap: `_makeRulesetConfigurations(...)` includes terminal addresses and `extraMetadata`, while current tests assert split operator and reserved split routing differences do not change the encoded configuration hash; see Current Open Edge Case E.

- `deploy-all-v6`: resume no longer accepts controller-configured canonical project IDs `1-3` from public project numbering alone.
  Current gap: project `4` still uses a generic controller-presence skip in `script/Deploy.s.sol` and `script/Resume.s.sol`; see Current Open Edge Case A.

- `deploy-all-v6`: post-deploy verification now matches canonical route and project-owner topology.
  Local patch: `script/Verify.s.sol` checks project `1-4` ownership by `REVDeployer`, checks project token symbols and revnet configuration hashes, checks the Banny 721 hook, and verifies that project terminal lists include `JBRouterTerminalRegistry` instead of the raw `JBRouterTerminal`.

- `deploy-all-v6`: post-deploy verification no longer treats full-product production components as optional.
  Local patch: `script/Verify.s.sol` now requires address-registry, Defifa, project handles, both distributors, and the project-payer deployer on production chains, then checks Defifa constructor wiring, token / governor wiring, distributor timing, project-handle forwarder parity, and project-payer implementation presence.

- `nana-buyback-hook-v6`: sell-side routing compared AMM swap quote against gross bonding-curve reclaim instead of net (post-fee) reclaim.
  Fixed in [PR #114](https://github.com/Bananapus/nana-buyback-hook-v6/pull/114). The hook now deducts the terminal's 2.5% fee before comparing, closing the window where the terminal path would pay less than the AMM.

### Stale, fixed, or not compelling enough

- `nana-router-terminal-v6`: multi-hop forwarding-cycle edge cases.
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

### 3. `univ4-lp-split-hook-v6`: deploy script idempotency is not Sphinx-aware

Current state:

- The local deploy script’s `_isDeployed` logic matches the other deterministic-deployer scripts and documents that it will not detect Sphinx-deployed contracts.
- It can still false-negative an existing deployment when the active deployment path is not the hardcoded `0x4e59` path.

Why this is optional:

- This is a deployment-tooling issue, not a runtime protocol bug.
- The current script is explicit about the limitation, so this only matters if standalone Sphinx reruns must be idempotent.

Suggested cleanup:

- Make the deploy-script idempotency check Sphinx-aware, or keep the documented limitation and route production deployment through `deploy-all-v6`.

### 13. `nana-721-hook-v6`: strict ERC-721 read behavior could be restored

Current state:

- `JB721TiersHook.balanceOf(address(0))` returns `0` through the tier store instead of reverting like the inherited ERC-721 implementation.
- `JB721TiersHook.tokenURI(tokenId)` resolves tier metadata even when `ownerOf(tokenId)` reverts because the token has not been minted.

Why this is optional:

- Ownership, transfer, mint, burn, and cash-out state are not weakened by these read-path quirks.
- The risk is compatibility and developer expectation: wallets, marketplaces, SDKs, and tests that assume strict ERC-721 read semantics may treat these responses as surprising.

Suggested cleanup:

- Make `balanceOf(address(0))` revert with the inherited ERC-721 zero-owner behavior.
- Make `tokenURI(tokenId)` require that the token exists before resolving the resolver or tier URI, while keeping tier preview metadata available through `tiersOf(...)`.

## Real Deployment Path Note

The earlier `nana-core-v6` controller-bootstrap script issue is not relevant to production deployment because `deploy-all-v6` is the canonical deploy path:

- Phase list: [DEPLOY.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/DEPLOY.md:22)
- Phase 05 includes controller deployment: [DEPLOY.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/DEPLOY.md:35)
- Actual controller deployment: [Deploy.s.sol](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/script/Deploy.s.sol:1551)

Current rehearsal limitation: `deploy-all-v6/test/fork/DeployFullStack.t.sol` is useful infrastructure coverage, but it bypasses Sphinx and manually mirrors only phases 01-05. It explicitly excludes Croptop, revnet, CPN/NANA revnets, and Banny phases, and it does not run `Verify.s.sol`. `DeployResumeRehearsalFork.t.sol` is also useful for idempotent address reuse, but the "after Phase 07" harness reserves CPN/REV project IDs instead of executing the real Croptop, REV, CPN/NANA revnet, and Banny deployment/configuration paths. Treat these as partial evidence until a real-script or exact-equivalence rehearsal covers phases 01-11 plus post-deploy verification.

## Tests / Evidence Used During Triage

The following targeted checks were run while triaging:

- Note: fork-test RPC configuration has been migrated to Dwellir endpoints. Re-run Defifa's full suite including [Fork.t.sol](/Users/jango/Documents/jb/v6/evm/defifa/test/Fork.t.sol:1) with the Dwellir `RPC_ETHEREUM_MAINNET` value before final deployment.
- Note: fork-test RPC configuration has been migrated to Dwellir endpoints. Re-run Revnet's fork-named tests, including `test/TestSplitWeightFork.t.sol`, with the Dwellir `RPC_ETHEREUM_MAINNET` value before final deployment.

- `forge test --match-path 'test/regression/FreshRegression.t.sol' --match-test 'test_payCredits_can_underfund_split_bearing_tier_mints' -vv`
- `forge test --match-path 'test/regression/FutureTierPoC.t.sol' -vv`
- `forge test --match-path 'test/regression/ProjectDeployerAuth.t.sol' -vv`
- `forge test --match-path 'test/regression/RegistryForwardingLossyToken.t.sol' -vv`
- `forge test --match-path 'test/regression/MultiHopForwardCycle.t.sol' -vv`
- `forge test --match-path 'test/regression/CashOutCircularPrimaryTerminal.t.sol' -vv`
- `forge test --match-path 'test/regression/PhantomSurplusTerminal.t.sol' -vv`
- `forge test --match-path 'test/regression/DeployScriptEdgeCases.t.sol' -vv`
- `forge test --match-path 'test/regression/FreshRegressionVerification.t.sol' -vv`
- `forge test --match-path 'test/regression/RegressionMigrationFeeFailure.t.sol' -vv`
- `forge test --match-path test/regression/PersistentAllowanceSteal.t.sol --skip JBUniswapV4HookFork` in `univ4-router-v6`
- `forge test --match-path test/regression/PersistentAllowanceSteal.t.sol` in `univ4-lp-split-hook-v6`
- `forge test --match-path test/regression/JBRouteMinOutputBypass.t.sol --skip JBUniswapV4HookFork`
- `forge test --match-path test/regression/FeeClaimReserveCapture.t.sol` in `univ4-lp-split-hook-v6`
- `forge test --match-path test/regression/DerivedMinBuySideFOTDoS.t.sol`
- `forge test --match-path test/regression/DerivedMinSellSideFOTDoS.t.sol`
- `forge test --match-path 'test/regression/*FOT*.t.sol'` in `nana-buyback-hook-v6`
- `forge test --match-path test/TestBuybackFOT.t.sol` in `nana-buyback-hook-v6`
- `forge test --match-path test/V4BuybackHook.t.sol` in `nana-buyback-hook-v6`
- `forge test --match-path test/TestSellSideNetComparison.t.sol` in `nana-buyback-hook-v6`
- `forge test --match-path test/TestRegressionGaps.sol --match-test test_non18Decimal_sellSideRoutesWithUSDC6` in `nana-buyback-hook-v6`
- `forge test --no-match-path 'test/fork/*'` in `nana-buyback-hook-v6`; latest routing slice passed 194 tests
- `forge build` in `nana-buyback-hook-v6`
- `forge fmt --check src/JBBuybackHook.sol test/regression/DerivedMinBuySideFOTDoS.t.sol test/regression/DerivedMinSellSideFOTDoS.t.sol test/regression/SellSideFOTOutputDoS.t.sol test/TestRegressionGaps.sol` in `nana-buyback-hook-v6`
- `forge test --match-path test/regression/RegistryStaleDeprecatedMaxSurplus.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/regression/RegistryStaleMaxAggregation.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/regression/RemoteLoanAccountingGap.t.sol`
- `forge test --match-path 'test/regression/HiddenSupply*.t.sol'` in `revnet-core-v6`
- `forge test --match-path test/TestHiddenTokens.t.sol` in `revnet-core-v6`
- Historical run: `forge test --match-path test/TestRegressionFixVerification.t.sol --match-test 'test_A14_hiddenTokensStayInCashOutDenominator|test_A14_hidingTokens_reducesLiveSupply|test_A14_hideTokensOf_revertsForUnauthorized'` in `revnet-core-v6`
- Follow-up run: `forge test --match-path 'test/regression/HiddenSupply*.t.sol'` in `revnet-core-v6`; current tests pass while asserting hidden supply is excluded from cash-out and loan capacity by design
- Follow-up run: `forge test --match-path test/regression/WeakConfigurationHash.t.sol` in `revnet-core-v6`; current tests pass while asserting split-operator and reserved-split routing differences are excluded from the configuration hash
- `forge test --match-path test/regression/LocalLoanStateOmissionCashout.t.sol` in `revnet-core-v6`
- `forge test --match-path test/TestCashOutCallerValidation.t.sol` in `revnet-core-v6`
- `forge test --match-path test/TestCrossCurrencyReclaim.t.sol` in `revnet-core-v6`
- `forge build` in `revnet-core-v6`
- `forge test --match-path test/regression/SameTimestampSnapshotPinned.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/regression/PeerSnapshotDesync.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/SuckerCrossChainAdversarial.t.sol --match-test 'test_supplySnapshot_updatesWithLatestNonce|test_supplySnapshot_skipsStaleSnapshotNonce'` in `nana-suckers-v6`
- `forge test --match-path test/InteropCompat.t.sol --match-test 'test_messageRoot_encoding|test_messageRoot_versionConstant|test_messageRoot_amountFitsU128'` in `nana-suckers-v6`
- `forge test --match-path test/unit/ccip_native_interop.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/unit/peer_chain_state.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/regression/HooklessV4LiquidityOverride.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/regression/HookedV4SpotFallbackOverride.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/regression/FreshV3LiquidityOverrideDoS.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/regression/FreshV3TwapOverride.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/unit/pool_discovery.t.sol` in `nana-suckers-v6`
- `forge test --fail-fast --no-match-contract '.*Fork.*' --no-match-path 'test/regression/*'` in `nana-suckers-v6`
- `forge build` in `nana-suckers-v6`
- `forge test --match-path test/regression/FeeLocking.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/unit/ccip_refund.t.sol` in `nana-suckers-v6`
- `forge test --match-path 'test/JBAddressRegistry.t.sol' -vv` and `forge test --match-path 'test/JBAddressRegistryEdge.t.sol' -vv` in `nana-address-registry-v6`; 36 base/edge provenance tests passed
- `forge test --match-path 'test/regression/*.t.sol' -vv` in `nana-address-registry-v6`; 9 review tests passed for zero deployer rejection, unauthorized registrant behavior, front-run/pre-registration behavior, and deployment-helper validation
- `forge test --match-path 'test/regression/*.t.sol' -vv` in `nana-address-registry-v6`; 7 nonce regression tests passed
- `forge test --match-path test/regression/FOTProjectToken.t.sol -vv` in `nana-buyback-hook-v6`; 3 tests passed for fee-on-transfer project-token sell-side accounting
- `forge test --match-path test/regression/SellSideFOTOutputDoS.t.sol -vv` in `nana-buyback-hook-v6`; 2 tests passed for fee-on-transfer output-token sell-side behavior
- `forge test --match-path test/regression/DerivedMinSellSideFOTDoS.t.sol -vv` in `nana-buyback-hook-v6`; 1 test passed for protocol-derived sell-side minimum handling on ERC-20 outputs
- `forge test --match-path test/regression/BuybackMetadataPreviewIgnored.t.sol --match-test 'test_metadataOnlyPreview|test_directJBPay' --skip JBUniswapV4HookFork` in `univ4-router-v6`
- `forge test --match-path test/regression/BuybackCashOutMetadataIgnored.t.sol --match-test 'test_metadataOnlySellPreview|test_directJBCashOut' --skip JBUniswapV4HookFork` in `univ4-router-v6`
- `forge test --match-path test/regression/JBRouteMinOutputBypass.t.sol --skip JBUniswapV4HookFork` in `univ4-router-v6`
- `forge test --fail-fast --no-match-contract '.*Fork.*' --no-match-path 'test/regression/*'` in `revnet-core-v6`
- `forge build --force` in `deploy-all-v6`
- `forge test --match-path test/regression/SuckerCallerDeterminism.t.sol` in `revnet-core-v6`
- `forge fmt --check src/REVDeployer.sol test/regression/SuckerCallerDeterminism.t.sol` in `revnet-core-v6`
- `forge build` in `revnet-core-v6`
- `forge test --match-path test/regression/WeakConfigurationHash.t.sol` in `revnet-core-v6`
- `forge test --match-path test/TestTerminalEncodingInHash.t.sol` in `revnet-core-v6`
- `forge fmt --check src/REVDeployer.sol test/regression/WeakConfigurationHash.t.sol test/TestTerminalEncodingInHash.t.sol` in `revnet-core-v6`
- `forge test --match-path test/regression/ToRemoteFeeIrrecoverable.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/regression/RegressionBeneficiaryMismatch.t.sol` in `defifa`
- `forge test --match-path test/regression/Pass12Fixes.t.sol` in `defifa`
- `forge test --match-path 'test/regression/SingleTierTimeoutLock.t.sol' -vv` in `defifa`; 1 test passed, proving a single-tier game with `scorecardTimeout == 0` still launches
- `forge test --match-path 'test/regression/OneTierZeroTimeoutLock.t.sol' -vv` in `defifa`; 1 test passed, proving the same one-tier zero-timeout launch shape still succeeds
- `forge test --match-path test/DefifaGovernor.t.sol --match-test testReceiveVotingPower` in `defifa`
- Temporary local review test `RegressionTokenUriSymbolRevert.t.sol` in `defifa`; launched an ERC-20 Defifa game through the existing harness, mocked the payment token's `symbol()` to revert, confirmed `_nft.tokenURI(...)` reverts, then removed the temporary file
- `forge test --fail-fast` in `defifa`
- `forge test --fail-fast --no-match-path test/Fork.t.sol` in `defifa`
- `forge test --match-path test/regression/RegressionPoCs.t.sol --match-test test_oldProjectOwnerDoesNotRetainHookControlAfterProjectNftTransfer` in `croptop-core-v6`
- `forge test --match-path test/regression/DeployerPermissionBypass.t.sol` in `croptop-core-v6`
- `forge test --match-path test/regression/RegressionCurrencyPoCs.t.sol -vv` in `croptop-core-v6`; 2 tests passed, confirming Croptop posting can depend on an undeclared native-token/ETH identity price feed and that fee-project currency mismatch refunds the Croptop fee while the target post succeeds
- `forge test --match-path test/CTDeployer.t.sol` in `croptop-core-v6`
- `forge test --match-path test/ClaimCollectionOwnership.t.sol` in `croptop-core-v6`
- `forge fmt --check src/CTDeployer.sol src/interfaces/ICTDeployer.sol test/regression/RegressionPoCs.t.sol test/regression/DeployerPermissionBypass.t.sol` in `croptop-core-v6`
- `rg -n "permissionsOf|hasPermission|hasPermissions|PERMISSIONS\\(|trustedForwarder\\(\\)" script/Verify.s.sol` in `deploy-all-v6`; only the ProjectHandles/core trusted-forwarder parity check is present, and no permissions registry or runtime grant checks are present
- `rg -n "OmnichainDeployer|JBOmnichainDeployer|omnichainDeployer\\.DIRECTORY|DIRECTORY\\(\\) == address\\(directory\\)|Controller recognizes Omnichain" script/Verify.s.sol DEPLOY.md RISKS.md` in `deploy-all-v6`, plus `rg -n "IJBDirectory public immutable DIRECTORY|_validateController|DIRECTORY\\.controllerOf" src/JBOmnichainDeployer.sol` in `nana-omnichain-deployers-v6`; confirms Phase 04 verification does not authenticate the omnichain deployer's immutable directory used for controller validation
- `rg -n "CHECKPOINT|checkpoint|JB721CheckpointsDeployer|VERIFY_HOOK|hookDeployer|HookDeployer" script/Verify.s.sol script/Deploy.s.sol test` in `deploy-all-v6`; confirms Phase 03a deploys a checkpoint deployer and base 721 hook, while `Verify.s.sol` only checks the hook deployer has code and that the project deployer points to it
- Temporary local review test `RegressionVerify721DeployerGap.t.sol` in `deploy-all-v6`; 1 test passed, confirming the Category 5 verifier shape accepts a hook deployer whose `HOOK`, `STORE`, and `ADDRESS_REGISTRY` do not match the expected deployment components, then the temporary file was removed
- `rg -n "REVHidden|HIDDEN|VERIFY_REV|revLoans\\.|revOwner\\.|revDeployer\\.|PERMIT2\\(|BUYBACK_HOOK\\(|FEE_REVNET_ID\\(|SUCKER_REGISTRY\\(" script/Verify.s.sol script/Deploy.s.sol DEPLOY.md` in `deploy-all-v6`, plus `rg -n "BUYBACK_HOOK|DIRECTORY|FEE_REVNET_ID|HIDDEN_TOKENS|LOANS|SUCKER_REGISTRY|PERMIT2|REV_ID|constructor" src/REVOwner.sol src/REVLoans.sol src/REVHiddenTokens.sol` in `revnet-core-v6`; confirms Phase 07 deploys a hidden-token singleton and REV runtime components expose the needed getters, while `Verify.s.sol` only checks a subset of `REVDeployer` wiring and `REVOwner.DEPLOYER()`
- `rg -n "TOKEN\\(|JBERC20|JBTokens|tokens\\.|VERIFY_.*TOKEN|VERIFY_TOKENS|PERMISSIONS\\(|PROJECTS\\(|DIRECTORY\\(" script/Verify.s.sol` in `deploy-all-v6`, plus direct reads of `Deploy.s.sol`, `Resume.s.sol`, `JBTokens.sol`, and `JBERC20.sol`; confirms Phase 01 bakes a reusable `JBERC20` implementation into `JBTokens`, while `Verify.s.sol` never loads the implementation address or checks `JBTokens.TOKEN()` / implementation immutables
- Temporary local review test `RegressionCorePredictionMismatch.t.sol` in `deploy-all-v6`; 1 test passed, confirming the `_isDeployed` args used by `Deploy.s.sol` / `Resume.s.sol` predict different CREATE2 addresses than the correctly constructed `JBTerminalStore`, `JBMultiTerminal`, and `JBController`, then the temporary file was removed
- `forge test --match-path test/TestPermissionsEdge.sol -vv` in `nana-core-v6`; 9 tests passed for ROOT, wildcard, replacement, and permission bit behavior
- `forge test --match-path test/PermissionEscalation.t.sol -vv` in `nana-core-v6`; 12 tests passed, including trusted-forwarder and wildcard permission behavior
- `forge test --match-path test/PermissionsInvariant.t.sol -vv` in `nana-core-v6`; 9 tests passed, including 5 invariant tests over bit-packing, `hasPermission`, ROOT forwarding, and wildcard-by-operator blocking
- `rg -n "VERIFY_SUCKER_DEPLOYERS|VERIFY_FEELESS_ADDRESSES|isAllowedToSetFirstController|getApproved|isApprovedForAll|suckerDeployerIsAllowed|isFeeless" script/Verify.s.sol` in `deploy-all-v6`; confirms only positive/subset sucker, first-controller, and feeless checks, with no project NFT approval checks
- `rg -n "VERIFY_SAFE|expectedSafe|owner\\(\\)|ownerOf" script/Verify.s.sol` in `deploy-all-v6`; confirms `expectedSafe` is declared and loaded but never used in Safe owner/admin checks
- `rg -n "Defifa|HOOK_STORE|hookStore|new JB721TiersHookStore|VERIFY_DEFIFA|DefifaDeployer" script/Deploy.s.sol script/Verify.s.sol script/Resume.s.sol` in `deploy-all-v6`; confirms deploy/resume use a dedicated Defifa hook store while verifier compares against shared `VERIFY_HOOK_STORE`
- `rg -n "DefifaHook\\(|HOOK_CODE_ORIGIN|DEFIFA_TOKEN|BASE_PROTOCOL_TOKEN|DIRECTORY\\(\\)|DefifaHook\\(hookCodeOrigin\\)" script/Verify.s.sol script/Deploy.s.sol` in `deploy-all-v6`, plus `rg -n "contract JB721Hook|DIRECTORY|constructor" src/abstract/JB721Hook.sol` in `nana-721-hook-v6`; confirms the Defifa hook origin inherits a public `DIRECTORY()` callback-auth immutable that `Verify.s.sol` does not check
- `rg -n "FEED\\(|THRESHOLD\\(|SEQUENCER_FEED\\(|GRACE_PERIOD_TIME\\(|priceFeedFor|currentUnitPrice|critical: false|USD/ETH|ETH/USD|USDC/USD" script/Verify.s.sol` in `deploy-all-v6`; confirms price-feed verification is liveness/sanity plus one non-critical mainnet ETH/USD inner-feed check, with no complete critical oracle manifest
- `rg -n "WETH\\(|FACTORY\\(|POOL_MANAGER\\(|PERMIT2\\(|POSITION_MANAGER\\(|ccipRouter\\(|ccipRemoteChain|remoteChainSelector|REMOTE_CHAIN|CCIP_ROUTER|selector|bridge|opMessenger|opBridge|arbInbox|arbGateway" script/Verify.s.sol` in `deploy-all-v6`; confirms the verifier does not authenticate external Uniswap, Permit2, bridge, or CCIP immutable constants
- `sed -n '620,691p' script/Verify.s.sol` in `deploy-all-v6`, plus `rg -n "PERMIT2|constructor\\(" src/JBMultiTerminal.sol` in `nana-core-v6`; confirms terminal verification checks store/directory/projects/splits/tokens/feeless wiring but not the terminal's immutable Permit2 address
- `rg -n "VERIFY_.*(UNIV4|LP|BUYBACK_HOOK|ROUTER)|lpSplit|LP_SPLIT|JBBuybackHook|JBUniswapV4Hook|JBUniswapV4LPSplitHook|routerTerminal\\.|buybackRegistry\\.defaultHook|HOOK\\(|DIRECTORY\\(|PROJECTS\\(|WETH\\(|PERMIT2\\(|POOL_MANAGER\\(|POSITION_MANAGER\\(|ADDRESS_REGISTRY\\(" script/Verify.s.sol script/Deploy.s.sol` in `deploy-all-v6`; confirms Phase 03b-03e deploys Uniswap V4 oracle, buyback, router, and LP split hook components that the verifier does not identify or manifest-check exactly
- `rg -n "DefifaTokenUriResolver|TOKEN_URI_RESOLVER|TYPEFACE|typeface|DefifaGovernor|GOVERNOR|HOOK_CODE_ORIGIN" script/Deploy.s.sol script/Verify.s.sol DEPLOY.md RISKS.md` in `deploy-all-v6`, plus `rg -n "TYPEFACE|typeface|DefifaTokenUriResolver" src script test` in `defifa`; confirms Phase 10 hardcodes and deploys the Defifa typeface into `DefifaTokenUriResolver.TYPEFACE()`, while the verifier only checks resolver code length
- `rg -n "DEADLINES_SALT|JBDeadline|deadline|VERIFY_DEADLINE" script/Deploy.s.sol script/Resume.s.sol script/Verify.s.sol DEPLOY.md test` in `deploy-all-v6`; confirms deploy/resume create the four Phase 05 deadline helpers, while the verifier and env-export docs never name or assert those helper addresses/durations
- `rg -n "no Uniswap stack|_shouldDeployUniswapStack|PositionManager|Revnet: SKIPPED|Banny: SKIPPED|Phase 08|Phase 09" script/Deploy.s.sol script/Resume.s.sol DEPLOY.md RISKS.md` in `deploy-all-v6`; confirms the live no-PositionManager deploy path skips only the V4-dependent hook/router/LP pieces, while docs and some resume comments/log strings still imply broader revnet/Banny skips
- `forge test --match-path test/regression/RegressionProjectOneSquat.t.sol`
- `forge fmt --check script/Deploy.s.sol` in `nana-fee-project-deployer-v6`
- `forge build` in `nana-fee-project-deployer-v6`
- `forge fmt --check script/Deploy.s.sol script/Resume.s.sol` in `deploy-all-v6`
- `forge build --force` in `deploy-all-v6`
- `forge build` in `deploy-all-v6`
- `forge test --match-path test/regression/RegressionFreshVerification.t.sol --match-test 'test_721LateMintedTokenCannotClaimRoundSnapshotRewardsFromOwnersPastVotes|test_721LateMintedReplacementCannotStealTransferredSnapshotTokensRoundRewards'` in `nana-distributor-v6`
- `forge test --match-path test/regression/RegressionFreshRoundVerification.t.sol --match-test test_postSnapshot721TokenCannotClaimUsingOwnersEarlierVotes` in `nana-distributor-v6`
- `forge test --match-path test/regression/RegressionOwnerOfAtPreMint.t.sol -vv` in `nana-721-hook-v6`; 1 test passed, confirming the current production checkpoint path still reports a late-minted never-transferred token as owned at an earlier snapshot block
- `forge test --match-path test/regression/PostSnapshotMintTheft.t.sol -vv` in `nana-distributor-v6`; 6 tests passed, confirming the current per-owner vote cap prevents over-extraction but still permits post-snapshot tokens to consume the owner's historical vote budget
- `forge test --match-path test/regression/RegressionFreshVerification.t.sol --match-test test_721LateMintedReplacementCannotStealTransferredSnapshotTokensRoundRewards -vv` in `nana-distributor-v6`; 1 mock-based strict snapshot test passed
- `forge test --match-path test/regression/RegressionFreshRoundVerification.t.sol --match-test test_postSnapshot721TokenCannotClaimUsingOwnersEarlierVotes -vv` in `nana-distributor-v6`; 1 mock-based strict snapshot test passed
- `forge test --match-path test/JB721Distributor.t.sol` in `nana-distributor-v6`
- `forge test --match-path test/regression/PostSnapshotMintTheft.t.sol` in `nana-distributor-v6`
- `forge test --match-path test/regression/RegressionAccountingPoC.t.sol` in `nana-distributor-v6`
- `forge test --match-path test/regression/Regression20260505.t.sol -vv` in `nana-distributor-v6`; 2 tests passed, including `test_unaccountedPrepaidCreditCanBeSweptByController` and `test_repeatedZeroAmountCollectsPermanentlyReserveDust`
- `forge test --match-path 'test/regression/*.t.sol' -vv` in `nana-distributor-v6`; 33 review tests passed, including current stale-ERC20-credit and vesting-dust proofs
- `forge test --no-match-path 'test/fork/*' -vv` in `nana-distributor-v6`; 142 non-fork tests passed across unit, audit, fix, and invariant suites
- `forge test --match-path test/invariant/JB721DistributorInvariant.t.sol` in `nana-distributor-v6`
- `forge test --match-path test/JB721Distributor.t.sol --match-test 'test_constructor|test_currentRound_afterWarping' -vv` in `nana-distributor-v6`; 2 tests passed, confirming constructor storage and `block.timestamp`-based round advancement
- `forge build` in `nana-distributor-v6`
- `forge fmt --check src/JB721Distributor.sol test/JB721Distributor.t.sol test/regression/RegressionFreshVerification.t.sol test/regression/RegressionFreshRoundVerification.t.sol test/regression/PostSnapshotMintTheft.t.sol test/regression/H26VotingPowerCap.t.sol test/regression/RegressionAccountingPoC.t.sol test/invariant/JB721DistributorInvariant.t.sol` in `nana-distributor-v6`
- `forge test --match-path test/unit/getters_constructor_Unit.t.sol --match-test test_ownerOfAt_shouldReturnHistoricalOwners` in `nana-721-hook-v6`
- `forge fmt --check src/JB721TiersHook.sol src/interfaces/IJB721TiersHook.sol test/unit/getters_constructor_Unit.t.sol` in `nana-721-hook-v6`
- `forge test --match-path test/regression/JBProjectHandlesUnicodeSpoof.t.sol`
- `forge test --match-path 'test/JBProjectHandles.t.sol' --match-test 'test_handleOf_returnsEmptyWhenResolverIsZero|test_handleOf_returnsEmptyWhenResolverReverts|test_constants'` in `nana-project-handles-v6`; 4 focused ENS/resolver tests passed
- Temporary local review test `RegressionProjectHandlesNoRegistry.t.sol` in `nana-project-handles-v6`; confirmed `handleOf(...)` reverts when stored parts exist and the hardcoded ENS registry address has no code, then the temporary file was removed
- Temporary local review test `RegressionProjectHandlesCurrentOpenR.t.sol` in `nana-project-handles-v6`; 2 tests passed, confirming a no-code ENS registry still reverts and a rightmost stored `"eth"` part returns the visible handle `vitalik.eth` while verifying the `vitalik.eth.eth` node, then the temporary file was removed
- `forge test --match-path 'test/JBProjectHandles.t.sol' --match-test 'test_handleOf_returnsEmptyWhenResolverIsZero|test_handleOf_returnsEmptyWhenResolverReverts|test_constants_ensRegistryAddress' -vv` in `nana-project-handles-v6`; 3 focused registry/resolver tests passed
- `forge test --match-path 'test/regression/*.t.sol' -vv` in `nana-project-handles-v6`; 3 review tests passed for control-character and bidi-spoof rejection
- `static-analysis . --exclude-dependencies --exclude-low --exclude-informational` in `nana-project-handles-v6`; reported one `handleOf` local-variable initialization warning that is a false positive because the successful `try` path assigns `textRecord` and the `catch` returns before use
- `forge test --fail-fast` in `nana-project-handles-v6`
- `forge test --match-path 'test/regression/*.t.sol'` in `nana-project-handles-v6`; 3 review tests passed for control-character and dangerous Unicode-formatting rejection
- `forge test --match-path test/regression/RegistryDefaultRetargetsExistingProjects.t.sol`
- `forge test --match-path test/regression/RegistryDefaultHookHijack.t.sol -vv` in `nana-buyback-hook-v6`; 1 test passed, confirming default-hook changes do not retarget existing projects
- `forge test --match-path test/regression/HookNotSetGuard.t.sol -vv` in `nana-buyback-hook-v6`; 3 tests passed, confirming registry pool setup reverts and pay passthrough holds when no hook resolves
- `forge test --match-path test/regression/RegistryMetadataBoundary.t.sol -vv` in `nana-buyback-hook-v6`; 1 test passed, confirming registry-scoped quote metadata is ignored by the resolved hook
- `forge test --match-path test/regression/ResumeCroptopProjectTwoSquat.t.sol`
- `forge test --match-path test/regression/ResumeBannyProjectFourSquat.t.sol -vv` in `deploy-all-v6`; 1 test passed, confirming Resume still treats a configured attacker-owned project `4` as enough to skip Banny deployment
- `forge test --match-path test/regression/ResumeRevProjectThreeSquat.t.sol`
- `forge test --match-path test/regression/ProjectIdFrontRunDoS.t.sol` in `croptop-core-v6`
- `forge test --match-path test/regression/ProjectIdFrontRunDoS.t.sol` in `nana-721-hook-v6`
- `forge test --match-path test/regression/ProjectIdFrontRunDoS.t.sol` in `revnet-core-v6`
- `forge test --match-path test/regression/ProjectIdFrontRunDoS.t.sol` in `nana-omnichain-deployers-v6`
- `forge test --match-path 'test/regression/*'` in `nana-omnichain-deployers-v6`
- `forge build` in `nana-omnichain-deployers-v6`
- `forge test --match-path test/Tiered721HookComposition.t.sol --match-test 'test_beforePay_splitPlusBuybackAMM_correctWeight|test_beforePay_splitPlusBuybackMintPath_correctWeight|test_beforePay_customHookWeightScaledBySplits' -vv` in `nana-omnichain-deployers-v6`; 2 matched tests passed, covering the current split-plus-buyback AMM and mint-path weight behavior
- `forge test --match-contract TestQAGameIdPredictionRace` in `defifa`
- Temporary local review test `RegressionLauncherTerminalCallback.t.sol` in `defifa`; launched a Defifa game with a fake caller-selected terminal and confirmed that terminal could call `afterPayRecordedWith(...)` directly to mint a Defifa NFT without a real terminal payment, then the temporary file was removed
- `forge test --match-path 'test/regression/*.t.sol' -vv` in `defifa`; 53 review tests passed across 17 suites, including fixed accounting/governance regressions and the still-open one-tier zero-timeout launch proofs
- `forge test --no-match-path 'test/Fork.t.sol' -vv` in `defifa`; 208 non-fork tests passed across 35 suites, including Defifa security, governance hardening, BWA comparison, no-contest, ERC-20/USDC, accounting, audit, regression, and invariant coverage
- `forge test --match-path test/regression/RegressionSkippedNonceMetadata.t.sol -vv` in `nana-suckers-v6`; 1 test passed, confirming swap-enabled CCIP nonce `2` before nonce `1` leaves nonce `1` without batch metadata
- Temporary local review test `RegressionNativeV4SettlementRevert.t.sol` in `nana-suckers-v6`; confirmed the native-token V4 settlement path withdraws WETH before using raw ETH and reverts when the sucker has no WETH balance, then the temporary file was removed
- `forge test --match-path test/regression/RemoteLoanStateOmission.t.sol`
- `forge test --match-path test/regression/SameTimestampSnapshotPinned.t.sol`
- `forge test --match-path test/regression/LocalLoanStateOmissionCashout.t.sol`
- `forge test --match-path test/regression/FeeLocking.t.sol --match-test test_failedCcipRefund_staysLockedAfterLaterNativeClaim`
- `forge test --match-path test/regression/HooklessV4LiquidityOverride.t.sol`
- `forge test --match-path test/regression/RegistryFirstTerminalSnapshotGap.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/regression/HookedV4SpotFallbackOverride.t.sol`
- `forge test --match-path test/regression/FreshV3LiquidityOverrideDoS.t.sol`
- `forge test --match-path test/regression/FreshV3TwapOverride.t.sol`
- `forge test --match-path test/regression/FirstTerminalRemoteConversionGap.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/regression/BuybackMetadataPreviewIgnored.t.sol --skip JBUniswapV4HookFork`
- `forge test --match-path test/regression/RawBuybackQuoteRouteMisrank.t.sol --match-test test_rawBuybackQuoteCannotOutrankBetterExecutableRoute`
- `forge test --match-path test/regression/BuybackCashOutMetadataIgnored.t.sol --skip JBUniswapV4HookFork`
- `forge test --match-path test/regression/ConservativeBuybackPreviewRouteMisrank.t.sol --match-test 'test_rawBuybackQuoteCanRankBetterBuybackBuyRoute|test_previewPayFor_decodesBuybackPayHookMetadata|test_previewPayFor_prefersRouteWithHigherBuybackHookOutput'` in `nana-router-terminal-v6`
- `forge test --match-path test/regression/ConservativeBuybackPreviewRouteMisrank.t.sol`
- `forge fmt --check src/JBPayRouteResolver.sol test/regression/ConservativeBuybackPreviewRouteMisrank.t.sol` in `nana-router-terminal-v6`
- `forge test --match-path test/regression/BuybackSellFallbackStrandsSourceTokens.t.sol`
- `forge test --match-path test/regression/GrossCashOutPreviewRouteMisrank.t.sol --match-test test_feeAwareCashOutPreviewCannotOutrankBetterNetRoute`
- `forge test --match-path test/RouterTerminal.t.sol` in `nana-router-terminal-v6`
- `forge test --match-path test/regression/BuybackSellFallbackStrandsProjectTokens.t.sol --match-test test_sellFallbackLikeCashOutRevertsInsteadOfStrandingProjectTokensOnHook --skip JBUniswapV4HookFork`
- `forge test --match-path test/regression/RegressionFeeFreeSurplusCashoutMisroute.t.sol -vv` in `univ4-router-v6`; current rerun passed 59 tests, including `test_zeroTaxFeeFreeSurplusCanRouteToJBBelowAvailableV4Output`
- Temporary local review test `RegressionRouterFeelessCashoutFeeBypass.t.sol` in `nana-router-terminal-v6`; confirmed a direct nonzero-tax source-project cash-out pays a protocol fee, while routing the same source project tokens through the feeless router into a user-controlled zero-tax project and cashing out that destination pays zero protocol fee, then the temporary file was removed
- `forge test --match-path test/regression/FeeClaimTokenFOTAccounting.t.sol`
- `forge test --match-path test/regression/NonPrimaryBalanceSelectionDoS.t.sol`
- `forge build` in `univ4-lp-split-hook-v6`
- `forge fmt --check src/JBUniswapV4LPSplitHook.sol test/regression/FeeClaimTokenFOTAccounting.t.sol test/regression/NonPrimaryBalanceSelectionDoS.t.sol` in `univ4-lp-split-hook-v6`
- `forge test --match-path test/regression/RegistrySelfLockDoS.t.sol`
- `forge test --match-path test/RouterTerminalRegistry.t.sol` in `nana-router-terminal-v6`
- `forge test --match-path test/regression/LockTerminalRace.t.sol` in `nana-router-terminal-v6`
- `forge build` in `nana-router-terminal-v6`
- `forge test --no-match-path 'test/fork/*'` in `nana-router-terminal-v6`; latest routing slice passed 355 tests
- `forge test --match-path 'test/regression/*' --skip JBUniswapV4HookFork` in `univ4-router-v6`; latest routing slice passed 322 tests
- `forge test --match-path 'test/regression/*'` in `univ4-lp-split-hook-v6`; latest routing slice passed 63 tests
- `forge test --match-path test/regression/RegressionFreshRound.t.sol --match-test 'test_deployProjectFor_failsOpenWhenSuckerDeploymentFails|test_directRegistryDeploymentAfterOwnershipTransferCanMapThroughRegistry'`
- `forge test --match-path test/regression/RegressionSuckerWrapper.t.sol`
- `forge fmt --check src/CTDeployer.sol test/regression/RegressionFreshRound.t.sol test/regression/RegressionSuckerWrapper.t.sol` in `croptop-core-v6`
- `forge build` in `croptop-core-v6`
- `forge fmt --check src/JBSucker.sol` in `nana-suckers-v6`
- `forge build` in `nana-suckers-v6`
- `forge test --match-path test/regression/PeerTopologyAuthBreak.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/regression/RegistryPeerAuthBreak.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/unit/deployer.t.sol` in `nana-suckers-v6`
- `forge test --match-path test/unit/multi_chain_evolution.t.sol` in `nana-suckers-v6`
- `forge test --match-path 'test/regression/*.t.sol' -vv` in `nana-suckers-v6`; 64 tests passed across 37 review suites, including CCIP typed-message compatibility, explicit-peer support, registry aggregate regressions, fee/refund retention, native interop, zero-output swap pending/retry behavior, and the still-open skipped-nonce metadata proof
- `forge test --match-path 'test/unit/*.t.sol' -vv` in `nana-suckers-v6`; 119 tests passed across 17 unit suites, including Merkle equivalence, CCIP native interop, fee fallback/refund behavior, peer-chain snapshots, pool discovery, swap scaling, deployer paths, emergency/deprecation behavior, and 8 invariant properties
- `forge test --match-path test/regression/RegressionSkippedNonceMetadata.t.sol` in `nana-suckers-v6`; 1 PoC passed, confirming late delivery of nonce `1` after nonce `2` leaves swap batch metadata missing and claims reverting
- `forge test --match-path test/regression/ProjectDeployerAuth.t.sol` in `nana-721-hook-v6`
- `forge test --match-path test/regression/ProjectDeployerRulesets.t.sol` in `nana-721-hook-v6`
- Temporary local review test `RegressionProjectDeployerControllerValidation.t.sol` in `nana-721-hook-v6`; confirmed `JB721TiersHookProjectDeployer.launchProjectFor(...)` can return a reserved project and project-owned hook while a no-op supplied controller leaves `JBDirectory.controllerOf(projectId) == address(0)`, then the temporary file was removed
- `forge build` in `nana-721-hook-v6`
- `forge test --match-path 'test/regression/*.t.sol' -vv` in `nana-721-hook-v6`; 41 tests passed across 19 suites covering reserve-slot protection, future-tier metadata/removal PoCs, same-currency decimal scaling, pay-credit/split behavior, ERC-20 return compatibility, and the still-open checkpoint existence gap
- `forge test --no-match-path 'test/fork/*' -vv` in `nana-721-hook-v6`; 363 tests passed across 51 suites, including tier lifecycle/store invariants, gas-envelope checks, reentrancy checks, split routing, checkpoint lifecycle, cash-out, reserve, metadata, deployer, and E2E coverage
- Temporary local review test `RegressionErc721ComplianceEdges.t.sol` in `nana-721-hook-v6`; 2 tests passed, confirming `balanceOf(address(0))` returns `0` and `tokenURI(...)` resolves an unminted tier token while `ownerOf(...)` reverts, then the temporary file was removed
- `forge test --match-path test/TestFees.sol` in `nana-core-v6`
- `forge test --match-path test/units/static/JBFees/TestFeesFuzz.sol` in `nana-core-v6`
- `forge test --match-path test/units/static/JBMultiTerminal/TestExecutePayout.sol` in `nana-core-v6`
- `forge build` in `nana-core-v6`
- `forge test --match-path 'test/units/static/JBChainlinkV3PriceFeed/TestPriceFeed.sol'` in `nana-core-v6`; 14 tests passed for feed identity, decimal scaling, stale/incomplete rounds, zero/negative prices, and threshold boundaries
- `forge test --match-path 'test/units/static/JBPrices/*.sol'` in `nana-core-v6`; 26 tests passed for direct/inverse/default feed lookup, immutability, zero-currency rejection, and inverse precision behavior
- `forge test --match-path 'test/regression/*.t.sol'` in `nana-core-v6`
- Temporary local review test `RegressionCashOutAggregateFeeRounding.t.sol` in `nana-core-v6`; confirmed a cash-out with 200 wei beneficiary reclaim plus two 100 wei hook payouts records a 10 wei aggregate fee for project `1` while only 9 wei remains in the terminal after per-output fee haircuts, then the temporary file was removed
- Temporary local review test `RegressionPayoutAggregateFeeRounding.t.sol` in `nana-core-v6`; confirmed a payout with two 100 wei split payouts plus 200 wei owner leftover records a 10 wei aggregate fee for project `1` while only 9 wei remains in the terminal after per-output fee haircuts, then the temporary file was removed
- `forge test --match-path test/regression/RegressionHeldFeeRounding.t.sol -vv` in `nana-core-v6`; 1 test passed for partial held-fee repayment rounding
- `forge test --match-path test/TestMigrationHeldFees.sol -vv` in `nana-core-v6`; 3 tests passed. A `-vvvv` trace of `test_migration_heldFeesUnclaimable` showed the retained held-fee ETH remains in the old terminal and processes successfully after the hold period, so the test's phantom-balance comments are stale rather than evidence of a current blocker
- `forge test --match-path test/units/static/JBMultiTerminal/TestUseAllowanceOf.sol -vv` in `nana-core-v6`; 8 tests passed for allowance fee/hold-fee branches
- `forge test --match-path test/TestPermissionsEdge.sol -vv` in `nana-core-v6`; 9 tests passed, including fuzz coverage for ROOT semantics, wildcard behavior, replacement semantics, permission ID `0` rejection, and bit-packing integrity
- `forge test --match-path test/PermissionEscalation.t.sol -vv` in `nana-core-v6`; 12 tests passed for ROOT non-escalation, wildcard permissions, revocation, trusted-forwarder behavior, and permissioned operation gates
- `forge test --match-path test/units/static/JBController/TestOmnichainRulesetOperator.sol -vv` in `nana-core-v6`; 4 tests passed, confirming the omnichain ruleset operator is an intentional permission bypass for launch/queue only and cannot relaunch over existing rulesets
- `forge test --match-path test/TestForwardedTokenConsumption.sol -vv` in `nana-core-v6`; 4 tests passed for ERC-20 forwarded-token consumption on pay hooks, cash-out hooks, and cross-terminal payout routes
- `forge test --match-path test/TestPayHooks.sol -vv` in `nana-core-v6`; 1 fuzz test passed across pay-hook counts and native payment amounts
- `forge test --match-path test/TestDataHookFuzzing.sol -vv` in `nana-core-v6`; 8 tests passed for pay/cash-out data-hook override and hook-spec bounds
- `forge test --match-path test/TestTerminalPreviewParity.sol -vv` in `nana-core-v6`; 2 fuzz tests passed for pay and cash-out preview parity under the covered hook shapes
- `forge build` in `nana-permission-ids-v6`
- Production source scan for permission numeric drift found downstream guarded actions importing `JBPermissionIds` constants rather than hardcoding the buyback/router/sucker/revnet permission numbers; stale numeric labels are confined to docs/operator review material, including `nana-permission-ids-v6/RISKS.md`, root `CHANGELOG.md`, `references/ecosystem-reference.md`, and `revnet-core-v6/CHANGELOG.md`, not runtime checks.
- Fresh small-repo rerun on 2026-05-06: `forge build` in `nana-permission-ids-v6` passed with no files changed; `forge test -vv` in `nana-ownable-v6` passed 54 tests across ownership, regression, audit, and invariant suites, including the documented unminted-project ownership hazard and stale permission invalidation after project-NFT transfer; `forge test --match-path 'test/regression/*.t.sol' -vv` in `nana-ownable-v6` passed 4 review tests for stale permission IDs after project-NFT ownership transfer and new-owner delegation behavior.
- `forge test` in `nana-address-registry-v6`
- `forge test --match-path 'test/regression/*.t.sol'` in `nana-address-registry-v6`; 9 review tests passed for zero-deployer rejection, pre-deploy registration rejection, permissionless post-deploy registration, and deployment-helper validation
- `rg -n "deployerOf\\(" nana-address-registry-v6/src nana-721-hook-v6/src univ4-lp-split-hook-v6/src defifa/src deploy-all-v6/script --glob '!node_modules/**' --glob '!out/**'`; no production `src` / deploy-script authorization path currently reads the permissionless registry mapping outside the registry interface itself
- `forge test --fail-fast` in `nana-project-handles-v6`
- `forge test --match-path 'test/regression/*.t.sol'` in `nana-fee-project-deployer-v6`; 15 review tests passed, including the project-`1` squat regression, canonical-guard weakness proof, late-start-time acceptance, and replay-not-idempotent coverage
- `forge test -vv` in `nana-fee-project-deployer-v6`; 90 tests passed across the full local suite, including forked fee-project deployment, payment, auto-issuance, reserved-split, recursive-fee, terminal-failure, late-start-time, and deploy-config snapshot coverage
- `forge test --match-path 'test/regression/*.t.sol'` in `nana-omnichain-deployers-v6`; 36 review tests passed for deterministic-drift acceptance, project-ID reservation, permission forwarding, weight/split composition, NFT cash-out denominators, and controller-validation regressions
- `forge test --match-path test/regression/ValidateController.t.sol` in `nana-omnichain-deployers-v6`; 3 regression tests passed for fake-controller rejection on existing-project launch/queue paths
- Temporary local review test `RegressionInitialLaunchNoopController.t.sol` in `nana-omnichain-deployers-v6`; confirmed fresh `launchProjectFor(...)` can return success against a no-op controller that does not wire `JBDirectory.controllerOf(projectId)`, then the temporary file was removed
- `forge test --match-path 'test/regression/*.t.sol' -vv` in `banny-retail-v6`; compilation still fails before tests because `script/Deploy.s.sol` constructs `JBSuckerDeployerConfig` without the current `peer` field at lines 322, 325, 328, and 332
- `forge test --skip script --match-path 'test/regression/*.t.sol' -vv` in `banny-retail-v6`; 13 review tests passed across retained-outfit anti-stranding/exclusivity, burned-body stranding, try-transfer retention, and migration-helper verification-bypass coverage
- `forge test --skip script --match-path 'test/regression/*.t.sol' -vv` in `banny-retail-v6`; 22 regression tests passed across msg-sender events, body-category validation, metadata clearing, array-length checks, burned/removed tier handling, and CEI reorder coverage
- `forge test --skip script -vv` in `banny-retail-v6`; 245 tests passed across the full script-skipped local suite, including resolver owner/meta-transaction checks, token URI rendering, decorate/redress flows, outfit transfer lifecycle, and the audit/regression suites above
- `forge test --match-path 'test/regression/*.t.sol'` in `nana-project-payer-v6`; 5 review tests passed for forced-ETH and `tx.origin` beneficiary regression coverage
- `forge test --skip '*/fork/**' -vv` in `nana-project-payer-v6`; 53 non-fork tests passed across deployer, payer, edge, and review PoC suites
- `forge build --deny notes --sizes --skip '*/test/**' --skip '*/script/**'` in `nana-project-payer-v6`; build passed with `JBProjectPayer` runtime size 6,018 bytes and deployer runtime size 1,020 bytes
- `forge test --no-match-path 'test/fork/*'` in `nana-project-payer-v6`; full `forge test` requires `RPC_ETHEREUM_MAINNET` for the fork suite
- `static-analysis . --exclude-dependencies --exclude-low --exclude-informational` in `nana-project-payer-v6`; analyzed 23 contracts with 63 detectors and reported 0 results
- `npm install --package-lock-only --ignore-scripts --no-review --no-fund` in `deploy-all-v6`
- `npm install --ignore-scripts --no-review --no-fund` in `deploy-all-v6`
- `forge fmt --check script/Deploy.s.sol script/Resume.s.sol test/fork/DeployFullStack.t.sol test/fork/DeployResumeRehearsalFork.t.sol test/fork/ResumeDeployFork.t.sol test/fork/WildcardPermissionKillChain.t.sol test/fork/LPBuybackInteropFork.t.sol` in `deploy-all-v6`
- `forge build` in `deploy-all-v6`; follow-up review confirmed it succeeds while resolving first-party imports from stale `node_modules`
- `forge build --force` in `deploy-all-v6`; compiled 545 files with solc 0.8.28 and succeeded after 342.36s, ruling out suspected live syntax issues in `Deploy.s.sol` / `Resume.s.sol`
- `forge remappings` in `deploy-all-v6`; confirms first-party imports still resolve through `node_modules`, including `@bananapus/`, `@rev-net/`, `@croptop/`, `@ballkidz/`, and `@bannynet/`
- `rg -n '"name"|"version"' */package.json` from the top-level workspace; confirms current sibling package versions are ahead of deploy-all pins for core, revnet, router terminal, 721 hook, suckers, buyback hook, distributor, omnichain deployers, Croptop, Banny, Defifa, ProjectPayer, ProjectHandles, Univ4 router, and LP split hook
- `forge test --match-path 'test/regression/*.t.sol'` in `deploy-all-v6`; latest deploy-all review slice passed 3 tests, including the still-open Banny project-`4` resume skip PoC
- Temporary local review test `RegressionBannyResolverMetadataOwner.t.sol` in `deploy-all-v6`; confirmed the deployment authority cannot call `Banny721TokenUriResolver.setMetadata(...)` when the resolver was constructed with the Banny operator as owner, then the temporary file was removed
- Temporary local review test `RegressionResumeRevnetCanonicalApproval.t.sol` in `deploy-all-v6`; confirmed a canonical configured project `3` can satisfy the resume helper while the next Safe/non-owner approval to `REVDeployer` reverts, then the temporary file was removed
- Temporary local review test `RegressionBuybackDefaultProjectOne.t.sol` in `deploy-all-v6`; confirmed the fee project created in `JBProjects` constructor does not inherit a buyback registry default set afterward, and `initializePoolFor(1, ...)` reverts `JBBuybackHookRegistry_HookNotSet(1)`, then the temporary file was removed
- Static deploy-all verifier pass for cross-chain suckers: `Verify.s.sol` never calls `JBSuckerRegistry.suckerPairsOf(...)`, `suckersOf(...)`, or `JBSucker.remoteTokenFor(...)`, even though `Deploy.s.sol` / `Resume.s.sol` create per-chain native-token sucker configs for canonical projects and the risk checklist requires peer/count verification
- `forge test --match-path test/fork/DeployScriptVerification.t.sol` in `deploy-all-v6`; 9 tests passed, covering a narrow external-address sanity subset but not the per-chain immutable manifest exactness required by Current Open Edge Cases F and G
- `forge test --match-path test/fork/DeployResumeRehearsalFork.t.sol` in `deploy-all-v6`; 4 fork rehearsal tests passed for harnessed interruption/resume paths, but the "after Phase 07" harness only reserves CPN/REV project IDs rather than executing real Croptop/revnet phases, and it does not cover an adversarial project-`4` squat before Banny resume
- `forge test --match-path test/fork/DeployResumeRehearsalFork.t.sol --match-test test_resumeAfterPhase07_everythingButBanny -vvv` in `deploy-all-v6`; focused rerun passed and confirmed the test's green signal is limited to the harnessed project-ID reservation path
- `forge test --match-path test/fork/ResumeDeployFork.t.sol` in `deploy-all-v6`; normal resume address and project-ID reuse passed
- `forge test --match-path test/fork/DeployFullStack.t.sol` in `deploy-all-v6`; Ethereum, Optimism, and Base passed the hand-replicated infrastructure phases 01-05 slice, while Arbitrum failed before test logic on a missing trie node from the configured non-archive RPC at the pinned fork block. This test does not run the real Sphinx-gated `Deploy.s.sol`, phases 06-11, or `Verify.s.sol`.
- Temporary local review test `RegressionProjectPayerVerifierGap.t.sol` in `deploy-all-v6`; confirmed `_verifyPeripheryExtensions()` accepts a fake ProjectPayer deployer whose `DIRECTORY()` matches the expected directory while `IMPLEMENTATION()` points at arbitrary non-ProjectPayer code, then the temporary file was removed
- Temporary local review test `RegressionDistributorRoundDuration.t.sol` in `deploy-all-v6`; confirmed deploy-all's L1 distributor setting advances a round after 50,400 seconds and reaches round 52 after 2,620,800 seconds, while the Arbitrum setting stays in round 0 after one week and advances after 2,419,200 seconds, then the temporary file was removed
- Temporary local review test `RegressionSphinxCreate2Replay.t.sol` in `deploy-all-v6`; confirmed Solidity `new {salt}` under the Sphinx Safe prank is recorded as `AccountAccessKind.Create` with initcode only, and that ordinary CREATE replay from the Safe lands at a different address from the Safe CREATE2 address, then the temporary file was removed
- Workspace script scan for `Sphinx` plus `new {salt}`; confirmed the same Solidity CREATE2-in-Sphinx pattern appears in standalone first-party deploy scripts outside `deploy-all-v6`
- `find . -maxdepth 2 -name 'sphinx.lock' -o -name '.sphinx*'` in `deploy-all-v6`; returned no Sphinx lock or local Sphinx project artifact, despite Sphinx safe-address derivation reading `sphinx.lock`
- Temporary local review test `RegressionReentrantERC20Intake.t.sol` in `nana-core-v6`; confirmed a callback-capable ERC-20 can make nested `_acceptFundsFor(...)` calls return accepted amounts of `100` and `200` while only `200` tokens reached the terminal, then the temporary file was removed
- `forge test --match-path 'test/units/static/JBSplits/*.sol'` in `nana-core-v6`; confirms current locked-split code blocks same-table percent and lock reductions while locked

## Bottom Line

Of the seventy-eight numbered historical edge cases, edge cases 7, 48, 49, 50, 51, 52, 54, 56, 59, 60, 61, 62, 64, 68, and 70 are now promoted into current open edge cases AD, AE, AF, AG, AH, AD, AC, AB, AE, J, AD, AD, Y, R, and Z respectively; edge case 53 is documented as an accepted Croptop liveness tradeoff, edge case 55 is fixed in current omnichain-deployer code, edge case 63 is fixed in current Defifa code, edge case 78 is a standalone ERC-20 metadata robustness cleanup, and the remaining numbered rows are standalone, low-severity, accepted, or unsupported-token cleanup rather than current deploy blockers. Thirty blockers remain open for the immediate `deploy-all-v6` one-shot path, spanning the script/runbook/verifier gates, canonical project identity and restartability, package provenance, Safe/admin convergence, core CREATE2 idempotency, REV runtime singleton provenance, buyback/router/core terminal fee integrity, product/periphery wiring, 721 and ERC-20 clone provenance, Defifa terminal/game-phase trust, distributor accounting, permission/approval exactness, ProjectHandles reliability, ProjectPayer identity, and distributor timing. Four previously listed blockers (D, E, AA, AF) have been closed as ACCEPTED per documented RISKS.md design decisions. The separate ecosystem blockers (S, AH) are deferred: swap-enabled CCIP suckers are not in the initial rollout. Treat the codebase as not ready for final deployment rehearsal until the immediate deploy gaps are fixed or explicitly accepted with an operator-only recovery plan.

Remaining optional non-security cleanup (not blocking deployment):

1. `nana-721-hook-v6`: explicit rejection for unsupported ERC-20 split-tier configs (currently handled via try-catch fallback),
2. `nana-721-hook-v6`: future-tier metadata existence check before accepting `encodedIPFSUri` writes,
3. `univ4-lp-split-hook-v6`: make standalone deploy-script idempotency Sphinx-aware, or keep relying on the documented limitation and the canonical `deploy-all-v6` path,
4. `nana-core-v6`: refresh the `RISKS.md` "Duplicate Locked Splits Collapse" note. Current code/tests require exact percent equality and non-decreasing `lockedUntil` for same-table locked splits, so the duplicate-lower-percent warning is stale for that path; the real caveat is cross-ruleset continuity, which `JBSplit` docs already describe.
5. `banny-retail-v6`: update standalone `script/Deploy.s.sol` to pass the current `JBSuckerDeployerConfig.peer` field. The canonical `deploy-all-v6` Banny path already does this, but the Banny repo's default `forge test` / `forge build` currently fails unless scripts are skipped.
6. `nana-project-handles-v6`: refresh wording in `RISKS.md` / docs that says dots are rejected outright. Current code and tests accept dot-separated subdomain levels inside a part while rejecting empty, edge, consecutive, control-character, and dangerous Unicode-formatting cases.
7. `deploy-all-v6`: refresh chain-skip wording for OP Sepolia / no-PositionManager chains. Current `Deploy.s.sol` deploys the buyback registry unconditionally, skips only the V4-dependent hook/router/LP pieces when `_shouldDeployUniswapStack()` is false, then still runs revnet, CPN/NANA revnet config, Banny, Defifa, and Phase 11. `DEPLOY.md` and some `Resume.s.sol` comments/log strings still imply no-PositionManager chains skip "revnet" or "Banny", which is stale and can mislead rehearsal operators.
8. `nana-omnichain-deployers-v6` and `nana-721-hook-v6`: either add post-launch `DIRECTORY.controllerOf(projectId) == controller` assertions in fresh `launchProjectFor(...)`, or refresh `RISKS.md` to state the current trust boundary. Both deployers reserve the project ID up front and do not prove that the supplied controller actually wired the project in `JBDirectory`; temporary PoCs showed no-op controllers can make fresh launch return success. This is a developer/integrator reliability footgun, not an immediate `deploy-all-v6` blocker.
9. `nana-core-v6`: refresh stale `JBSplits` packing NatSpec. `_packedSplitParts1Of` now stores `percent` in bits 0-31, `projectId` in bits 32-95, and `beneficiary` in bits 96-255, while `preferAddToBalance` lives in `_packedSplitParts2Of`; the comment still describes the older layout and can mislead reviewers, generators, or future maintenance.
10. Permission-ID docs/reference cleanup: refresh stale numeric labels in `nana-permission-ids-v6/RISKS.md`, root `CHANGELOG.md`, `references/ecosystem-reference.md`, and `revnet-core-v6/CHANGELOG.md`. The source defines `SET_BUYBACK_TWAP = 28`, `SET_BUYBACK_POOL = 29`, `HIDE_TOKENS = 36`, `OPEN_LOAN = 37`, `REALLOCATE_LOAN = 38`, `REPAY_LOAN = 39`, and `REVEAL_TOKENS = 40`; runtime imports use the correct constants, but stale docs can mislead operator reviews, AIs, or off-chain permission manifests.
11. `deploy-all-v6`: add env/export and verifier coverage for the Phase 05 deadline helpers. `Deploy.s.sol` and `Resume.s.sol` deploy `JBDeadline3Hours`, `JBDeadline1Day`, `JBDeadline3Days`, and `JBDeadline7Days`, but `Verify.s.sol` / `DEPLOY.md` do not name them; a manifest-quality check should assert code, `DURATION()` values, and `IJBRulesetApprovalHook` support so developer-facing canonical helper addresses are not silently wrong.
12. `defifa`: make default ERC-20 card metadata robust to payment tokens whose `symbol()` reverts or contains SVG metacharacters. Wrap the metadata call, fall back to a safe deterministic label, and SVG-escape successful symbols before rendering.
13. `nana-721-hook-v6`: restore strict ERC-721 read semantics for compatibility. Today `balanceOf(address(0))` returns `0`, and `tokenURI(...)` can resolve an unminted tier token while `ownerOf(...)` reverts; this does not weaken ownership, but it can surprise wallets, marketplaces, SDKs, and generated tests that expect standard ERC-721 read-path reverts.
