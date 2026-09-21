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
- [ ] Follow-on: Center returns the recording sender on deployments so the SDK can refuse to resume another wallet's partial self-paid deploy
- [ ] Phase 2 plan: juicebox.money + revnet.money
- [ ] Phase 3 plan: homerun, succulent, JBSticky, juicescan
- [ ] Phase 4 plan: eth.shop, ethis.money, JBChat read side
