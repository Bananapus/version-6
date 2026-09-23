# Homerun: mint the initial INCOME to the Owner, drop the vault (2026-09-21, jango's call)

"Promise, not a claim": INCOME's auto-issuance goes to the FUND owner (= INCOME operator), who settles the published allocation offchain. Removed HomerunInitialIncomeVault, HomerunDeployerLib, Merkle roots/proofs, funding step.

## Contracts
- [x] HomerunInitialIncomeAllocation: dropped merkleRoot, leafCount
- [x] HomerunDeployer: auto-issuance beneficiary = _msgSender(); removed vault/lib/fundInitialAllocation/initialAllocationVaultOf/distributionIdFor/DISTRIBUTION_TYPEHASH/FUND_TOKEN_CODE_HASH; IncomeDeployed(fund, income, owner, fundToken); launch verifies REV recorded the owner's entitlement. Runtime 16,256 B.
- [x] Deleted vault + interface + lib + vault tests; unit/integration tests mint via REVOwner.autoIssueFor to the owner (80/80)
- [x] Deployment scripts: hook → deployer only (no library), immutable count 14; runner fields; DEPLOYMENT.md
- [x] scripts/prepare-income-release.mts + docs/INCOME_RELEASE_MANIFEST.json regenerated + docs/INCOME_INTEGRATION.md
## Client (subagent)
- [x] ABI/struct, manifest v3 without roots/proofs, deleted claim page/allocation-state/merkle libs + tests, InitialIncomeMint panel (REVOwner.autoIssueFor to the owner), launch verification via amountToAutoIssue, README/docs
## Gates
- [x] forge test 80/80, test:deployment, vitest 2009/2010 (Node-20 Promise.withResolvers only), typecheck, lint, next build, rehearsals on 8 chains (hook 0x99cC605F…, deployer 0xA23497B9… mainnets / 0xd94A452e… testnets)
- [x] jango: pay the CURRENT owner → auto-issuance beneficiary is the deployer; permissionless `mintInitialAllocation(fundProjectId)` forwards to `JBProjects.ownerOf` at mint time (deployer 17.6 KB; 0x1afdF3b6… mainnets / 0x030f86Dc… testnets)

# Homerun contracts: in-repo Sphinx rollout + adversarial review (2026-09-21)

Repo: github.com/mejango/homerun (standalone clone at extensions/homerun, not a submodule). Pattern source: extensions/JBSticky.

## Port the JBSticky deployment pattern
- [x] foundry.toml, remappings (+@sphinx-labs), package.json (sphinx 0.33.3 devDep, deploy:*/test:deployment scripts), sphinx.lock, .gitignore, .env.example
- [x] script/helpers/HomerunDeployment.sol (CREATE2 factory check, sibling artifact loading per group, lib→hook→deployer prediction with manual `__$…$__` linking, immutable-masked runtime + binding verification, manifests)
- [x] script/Deploy.s.sol (Sphinx v6-deployment, expected Safe), Rehearse.s.sol, Verify.s.sol; script/deploy.mjs + deploy.sh; scripts/forge-remappings.mjs + forge.sh
- [x] test/deployment: 22 Foundry harness tests + 16 node runner/config tests
- [x] DEPLOYMENT.md, README pointers
- [x] Verified: 133/133 forge tests, node tests green, fmt + lint clean; live rehearsals green on all 8 chains (lib 0x73f04ad0…, hook 0x99cC605F…; deployer 0x9655a972… mainnets / 0x26c68acc… testnets)

## Adversarial review of the contracts
- [x] 14 agents (8 pashov v2 + 5 pashov v3 + deployment surface); every one converged on the same FINDING
- [x] FIXED launchFundFor: FUND token CREATE2 salt was scoped to the deployer only → public-salt squatting bricked linked launches (PoC test). Now scoped to (caller, owner, salt) for suckers and token.
- [x] FIXED constructor: hook must trust the same forwarder; _requireSuckers pins INCOME sucker minGas; natspec corrected (allowlist = pay gate; "closed" is point-in-time; cash-out delay + close-every-chain sequencing documented)
- [x] FIXED deploy tooling: propose/verify refuse dirty checkout; pins cover all 11 siblings + 5 node_modules packages (tested from artifact metadata.sources); one-address-per-group check; SDK registry cross-check; REVOwner + USD price feed probes; Deploy.run idempotent
- [x] jango's calls: start INCOME's stage ~10 min ahead (client lead) → no revnet cash-out delay; vault funded by permissionless `fundInitialAllocation` once the stage starts (late chains atomic); `_requireClosedFund` removed. 129 forge tests, 2156/2157 vitest (1 pre-existing Node-20 `Promise.withResolvers` failure), rehearsals green on 8 chains (deployer 0x936a96bC… / 0xC31180AC…)
- [x] Codex review finding fixed: permissionless REVOwner.autoIssueFor could strand the allocation in the deployer → mintInitialAllocation forwards the whole held balance (committed)
- [ ] Open by design: reservedBps may be 100%
## Review
Root cause of the one real bug: JBController scopes `deployERC20For`'s salt by `_msgSender()`, which is the shared HomerunDeployer for every user, so the caller never entered the token's CREATE2 preimage while it did enter the sucker's. Everything else the review raised is owner-trust or documentation. Working tree is uncommitted; another session's "SDK connect 0.5.5/0.5.6" commits swept in the package.json/lockfile edits.

# kmac88 feedback (2026-09-20)

- [x] bendystraw: add a live gateway (Pinata) to projectMetadataRequests — PR peripheralist/bendystraw#34 (kept the upstream "wipe on failed fetch" policy)
- [x] revnet-money: home lists (Top/Trending/New/Latest) fill name/logo from the metadata uri when the index has neither
- [x] revnet-money: TierDetailModal "Where each sale goes" — split recipients + project remainder + issuance note
- [x] juicebox-money: same two
- [x] juicescan: tier popup only — its cards already resolve uriOf on-chain, so the home gap does not apply
- [x] verify: vitest + next build green in revnet-money and juicebox-money; juicescan bundle + vitest green; all three checked in-browser on base:13

## Review
Root cause of the blank home card: bendystraw's metadata gateway chain (eth.sucks → dweb.link → ipfs.io) is dead
since the 2026-09-21 sunset, so any project that set its uri after ~2026-09-14 indexes with name/logo null. The
client fill is a fallback; the indexer PR is the fix. Rows that already failed need a reindex/refresh upstream.
Commits are local on main in the three webclients (not pushed).

# Center framed sign-in / signup review (2026-09-21)

- [x] Adversarial review of Center 1180808…4555bb2 (Opus; Fable out of credits — rerun on Fable when topped up)
- [x] Framed login session minted from fresh entropy; framed completion single-use (loginPostgres)
- [x] signup.session refuses a ceremony/topOrigin mismatch (signup.ts, signupSite.ts)
- [x] /authorize/issue takes the row's framed claim without a launch cookie — Fullscreen from a frame now completes
- [x] Signup page storage guarded for cross-site frames; launch error page stylesheet literal fixed
- [x] Tests: site (43), signup-site, login unit; login/signup-base/signup/handoff PG16 integration (88) — green; tsc clean
- [x] Center 50b1b5a pushed to main; Railway juice-central deploy watched
- [ ] Live check on homerun.money: framed sign-in, Fullscreen link completes

## Review
No externally reachable finding: frame-ancestors + body flow token + request-key-bound code compose. Three LOW
hardenings and two functional bugs fixed. SDK modal/hand-up checked by hand: same-origin + source-gated, theme
reply carries public tokens only. Open: a lost framed approve response 409-loops on retry.

## Project intents (2026-09-21)
Spec: docs/superpowers/specs/2026-09-21-project-intents-design.md
Plan (phase 1, Center + SDK + skill): docs/superpowers/plans/2026-09-21-project-intents-phase-1.md
- [x] Phase 1 tasks 1-13 merged 2026-09-21: jbcenter #23 (91ebed8, main only; `dev` not merged), juice-sdk-v4 #139 (678c1ae, changeset pending Version Packages), juicebox-skills #6 (f6bff2c)
- [x] Task 14 dev rehearsal PASSED 2026-09-21 after three fixes (jbcenter #26 rollup payment chain, #28 funded-rollup choice + fresh SponsorshipChain + deferral backoff, #30 forwarded-call verification): intent 5ce6df07 → one Relayr bundle, prepayment on OP Sepolia 0.00021 ETH, Base Sepolia project #27 + OP Sepolia project #11 confirmed and recorded in 48 s; intent 378d4644 recorded via the self-paid route (Base Sepolia #26, OP Sepolia #10)
- [x] Production enabled 2026-09-21: sponsor EOA 0x795287b5E75B3Ce7D7d2Da334Bf9557137d5569B (0.005 ETH on Base from jango), SPONSOR_PAUSED=0 on juice-central; check intent 7e46e01d → Base project #16 (tx 0xc639985b…) in 38 s for 0.000109 ETH
- [x] Beep terminal creation via intents: approved 2026-09-21 (Beep publishes on the merchant's behalf); spec docs/superpowers/specs/2026-09-21-beep-terminal-intents-design.md, plan docs/superpowers/plans/2026-09-21-beep-terminal-intents.md; Center prerequisite PR #32 merged (main d7e3e3f, dev d089f2b), prod limits raised (publish 500/500, requester 100); executing on ~/Documents/cocopay/beep-terminal-intents: SHIPPED 2026-09-21: mejango/beep PR #1 merged (038c7c4), Railway vars set, live on beep.biz (terminal 37b5e349 → Base project 17 in 44 s, invoice 5098a62d left open for a USDC payment). Homerun, juicebox.money, revnet.money deferred
- [ ] Follow-on: Center returns the recording sender on deployments so the SDK can refuse to resume another wallet's partial self-paid deploy
- [ ] Phase 2 plan: juicebox.money + revnet.money
- [ ] Phase 3 plan: homerun, succulent, JBSticky, juicescan
- [ ] Phase 4 plan: eth.shop, ethis.money, JBChat read side

## Homerun V6 house-style rewrite (2026-09-21)
- [x] Error NatSpec, named-arg reverts, WHY comments in HomerunDeployer + HomerunAllowlistHook
- [x] Stale interface/struct/doc wording (vault, Merkle, closed FUND, Arbitrum) removed
- [x] Stale `runtime.version` UI test removed; vitest/typecheck/lint/build green (Node-20 withResolvers failure pre-existing)
- [x] forge 74/74, deployment tests 16/16, manifest regenerated, both groups rehearse to unchanged addresses
- [x] Committed 206fa40 in extensions/homerun (not pushed)
- [x] Removal pass: derived core from REVDeployer, dropped hash/sentinel/redundant checks; 72/72 forge, 16/16 deployment, vitest green, rehearsed both groups; pushed
- [ ] jbcenter parallel suite still flaky under a bare `npx vitest run` (PR #36 landed: per-schema migration lock, hookTimeout, 13 fixture deadlines); `npm run check` is green. Remaining: rest-sessions-service, rest-wallet-app-refresh, deployment-dispatch-evm, signup-base, handoff, deployment-settlement, smart-accounts-inspector-evm, payment-reviews, deployment-postgres — same defect (real-time windows smaller than the work; take both ends from clock_timestamp()). Sweep leftover test schemas (DROP SCHEMA) before measuring; killed runs leave them and slow the run 320 s → 220 s.
- [ ] jbcenter CI on main fails in test/rest-user-operations-*.integration.test.ts "rechecks approval after a global nonce wait and rolls back transport, nonce, and submission together" (runs 35660246114 and the earlier b917434 run, so it predates PR #36); same real-time-window class as the parallel flakes.
- [x] (1)+(2) SHIPPED 2026-09-22: Center guide/search/MCP (jbcenter PR #38, dev #39), SDK 2.8.0 (juice-sdk-v4 #141/#142), skills PR #7. (3) Homerun SHIPPED 2026-09-22 (mejango/homerun PR #1 → main a07e80f, live on homerun.money; testnet FUND c6937355 → Base Sepolia 29 + OP Sepolia 13 via dev Center; production FUND fd69ff6b → Base project 19; Base+Optimism intent 98fd7e83 → OP project 9 + Base project 20 after bridging sponsor funds; Center mis-parsed Relayr's status, see the lane follow-up). Original: 2026-09-21 jango: (1) documentation on juicebox.center so a bot landing there can publish/deploy project intents; (2) shared componentry (SDK-level) for intent lists, pages, deploy, ensureDeployed; (3) Homerun FUND intents. Order: docs + shared first, then Homerun. Research agents running; spec to follow at docs/superpowers/specs/2026-09-21-intents-docs-shared-homerun-design.md.
- [ ] Center verifies intent publisher signatures with viem verifyMessage (EOA only); ERC-1271/6492 (Safe, passkey accounts) are refused with 400 although the phase-1 design promised them. Follow-up: verify contract signatures via a per-chain public client (Center has RPC upstreams) — needed before Safe-owned or passkey-published intents.
- [x] (done 2026-09-22, mejango/beep PR #8) Beep src/intents.ts publish guard checks only that the message contains the content hash (same weakness the SDK final review found); switch Beep to publishSignedIntent from nana-sdk-core 2.8.0 once published.
- [ ] Center sponsor lane: (a) `SponsorshipChain.request` labels every RPC error, timeout or simulation revert as SPONSORSHIP_RPC_UNAVAILABLE, hiding the cause (seen 2026-09-22 on a Base+Optimism Homerun intent); (b) a `failed` deploy row is terminal, so a transient lane failure permanently strands an intent (Homerun/Beep then need a new project); allow re-requesting after failure or reset rows on a lane error before any bundle was paid.
- [ ] Center sponsor lane: the production sponsor 0x795287b5E75B3Ce7D7d2Da334Bf9557137d5569B holds ETH only on Base; the lane simulates with from=sponsor and value=creationFee, so any intent touching Optimism or Arbitrum fails (OutOfFunds → SPONSORSHIP_RPC_UNAVAILABLE, rows terminal). Ops: fund the sponsor on Optimism and Arbitrum (0.005 ETH each is plenty). Code follow-up: pre-check sponsor balance ≥ creation fee per chain and refuse with a named, non-terminal code (or simulate with a balance state override).
- [ ] Center sponsor lane (production, 2026-09-22, intent 98fd7e83, bundle e9a534d5): after paying the Relayr prepayment on Optimism, `statusBinding` rejected Relayr's status (RELAYR_INVALID_STATUS) and marked both rows failed, yet Relayr executed both chains (OP 0x4d86cb35…, Base 0x85f64c22…, state Success, virtual_nonce 0). Fix: log a bounded copy of the offending status body; never mark a paid bundle failed on a parse error (keep polling); reconcile paid bundles against Relayr and record deployments. Dev Relayr (testnets) passes the same path.
- [x] 2026-09-22: Center sponsor-lane recovery merged (jbcenter PR #40 to main, #41 to dev; retry-vs-terminal classification, paid bundles never failed on parse errors, status body logged, SPONSOR_UNFUNDED pre-check, 24 h unresolved cap), two review rounds). Beep switched to publishSignedIntent (beep PR #8) and its make-yours copy trimmed (beep PR #9, deployed). Re-verified 2026-09-22: dev 838ada88 (Base Sepolia 30, OP Sepolia 14) and production ed7be3f9 (Optimism 10, Base 21) both hit the post-payment RELAYR_INVALID_STATUS and resumed to confirmed after the 5-minute backoff; dev 5f4051a7 went straight through, so the rejection is intermittent. PR #42 names the rejected field in the status_invalid log line. Worktree removed. Follow-up: when the next status_invalid line appears in the dev or production log, fix the named comparison at the root.
- [ ] jbcenter mcp/tests/integration/http.test.ts "supports initialize, tools, resources, and prompts using the official MCP client" times out at 5 s in 1-2 of 3 runs on this machine, on pristine main too (2026-09-22); it is the first step of `npm run check`, so a flake there aborts the whole gate. Raise its timeout or warm the knowledge bundle before the client connects.

## 2026-09-22 — Intent setup calls: Safe-owned projects without a transaction
Spec: docs/superpowers/specs/2026-09-22-intent-setup-calls-safe-owners-design.md (approved by jango: sequential-in-Center over a launcher contract because it ports to jbm/revnet; Safe addresses are deterministic so setup and launch go out independently).
Worktrees: extensions/center-setup-calls (jbcenter feat/intent-setup-calls), extensions/sdk-setup-calls (juice-sdk-v4 feat/intent-setup-calls), extensions/homerun-setup-calls (homerun feat/intent-setup-calls).
- [x] Plans written: center, sdk, homerun (docs/superpowers/plans/2026-09-22-intent-setup-calls-*.md), committed 077e30d
- [x] Center: jbcenter PR #44 (setup calls, review ship after one fix round) + #46 (knowledge sync) merged to main, mirrored to dev (#45, #47); Railway deploys watched. Open nits: N1 setup eth_call revert maps terminal, N2 reservation over-counts the fee per setup call.
- [x] SDK 2.9.0 published (juice-sdk-v4 PR #143, review ship; Version Packages merged by jango); worktree removed
- [x] Homerun: mejango/homerun PR #2 merged and deployed (review ship + fix round: any-order copy, "Owned or published" heading)
- [x] Live check on dev: intent 2eac709f (script, 2-of-2 Safe 0xE5B6af5F026a498F69bC9965A0F7D0F4354754a9) deployed after the nonce fix: Base Sepolia project 32 + OP Sepolia project 16, Safe has code on both and JBProjects.ownerOf returns it. The Homerun-flow intents (7e7cf160, f3e30ef0, 551f0387) were published through the real UI; 551f0387 is deploying. Production run pending the budget decision.
- [ ] Root cause of RELAYR_INVALID_STATUS after payment: the named field is `chain`: Center binds Relayr tx_uuids to entries by array index and Relayr returns them in another order sometimes; fixed in jbcenter PR #50 (bind ids from the status echo by request fields), mirrored to dev #51. Follow-up: the same index binding in `parseQuoteBinding` (src/rest/sponsorship/service.ts, app-sponsorship dispatch).
- [ ] Live: dev two-chain FUND with a new 2-of-2 owner Safe; production Base + Optimism; Safe exists at the predicted address and owns the project
- [ ] Port note for jbm/revnet in tasks and memory; remove worktrees

## 2026-09-22 — Homerun preview → create → deploy any chains from the shareable link
Spec: docs/superpowers/specs/2026-09-22-homerun-preview-create-and-per-chain-deploy-design.md (approved: "Show preview" replaces Sign in/Create; preview page with Edit and Create; /intent/<id> shareable with a checkbox per chain, "free" on sponsored chains, "costs ~x ETH" on Ethereum paid by the visitor through Center's signed forward request so the sender stays Center; redirect to the first deployed chain; project page offers the remaining chains).
Worktrees: extensions/center-setup-calls (jbcenter feat/intent-relay), extensions/sdk-relay (juice-sdk-v4 feat/intent-relay), extensions/homerun-setup-calls (homerun feat/preview-create).
- [x] Plans: center, sdk, homerun (docs/superpowers/plans/2026-09-22-intent-relay-{center,sdk}.md, 2026-09-22-homerun-preview-create.md), committed
- [x] Center: jbcenter PR #52 merged (relay route, subset deploy, `forwarded` per deployment with the sponsor-sender check, migration 059, mixed_sender guards; review + one fix round), mirrored to dev #53; deploys being watched; then verify /relay refuses a sponsored chain and deployments carry forwarded on dev
- [x] SDK 2.10.0 published (juice-sdk-v4 PR #145, review + one fix round: sender decided from `forwarded` on deployments; Version Packages #146; main CI green); worktree removed
- [x] Homerun: mejango/homerun PR #3 merged and live (preview-create flow, held-record persistence). Dev live check PASS: intent cbca19c1, Safe 0x51b8969a…1110 owns Base Sepolia 36 + OP Sepolia 19; harness homerun/.superpowers/live/preview/homerun-preview-live.mjs (copy in scratchpad).
- [x] Homerun corrections: PR #4 (full project page, one-press Create, pre-attach title kept, IPFS gateway follows the configured Center) and PR #5 (the preview and the intent link render the /founderhaus example page itself with the pay card and every tab; slim bar above the pay card) merged and live 2026-09-22 18:31 -03. Follow-ups 2026-09-23 all live: PR #6 (header "Status: Preview" / "Deploys on first use", token fields room, "This is a preview" with Create then Edit), PR #7 (one focus indicator per field), PR #8 (Owner FUND ownership and the two INCOME shares moved to the modeling inputs: no contract reads them; create check waits for Show preview to be actionable). Still open for jango: the example page's modeling controls show on the preview and intent pages.
- [x] 2026-09-23: every create text field renders on the live, preview and intent pages (homerun PR #9): revenue description, minimum revenue and consequences in the Income stage, profiles' introductions, location, FUND token block on Owners. Follow-ups fixed in PR #10 (one FundTokenTerms block on Owners for all three pages, Splits heading rhythm, one money formatter). Next: the Splits chart reads 0/0/0 in the raising stage while the plan says 70/10/20 (fix in progress, fix/raising-allocation-chart).
- [x] Center follow-up: jbcenter PR #54 re-queues a named failed chain that paid for no bundle (mirrored #55); dev caps raised (SPONSOR_MAX_FEE_PER_GAS 30 gwei, daily budget 5 ETH) so Sepolia fits; Sepolia retry on intent 59442f3d confirmed (project 10, forwarded), so the subset route, the re-queue and the raised caps all check out on dev.
- [ ] Live: every testnet is a sponsored chain, so the relay path has no testnet run: dev checks are the subset deploy (intent 59442f3d: Base Sepolia alone, then Sepolia alone, in progress) and the /relay refusals (deployed chain, sponsored chain, both confirmed on dev). The relay path itself runs only on Ethereum mainnet: publish a Base + Ethereum intent on production, fetch /relay for chain 1, send it from a funded wallet (jango's, or fund the prod rehearsal owner 0x501C6d82…7E46 with ~0.005 ETH); the sponsor holds a 0.001 ETH mainnet float for the simulation. Needs jango's go.
- [ ] Budgets: production SPONSOR_DAILY_BUDGET_WEI decision deferred by jango ("deal with budgets later, keep to minimum")
