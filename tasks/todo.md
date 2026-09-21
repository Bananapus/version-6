# Homerun contracts: in-repo Sphinx rollout + adversarial review (2026-09-21)

Repo: github.com/mejango/homerun (standalone clone at extensions/homerun, not a submodule). Pattern source: extensions/JBSticky.

## Port the JBSticky deployment pattern
- [ ] foundry.toml: bytecode_hash none, storageLayout output, memory/gas limits, fs_permissions (sibling deployments/, ./deployments, ./cache), rpc_endpoints, [profile.deploy] isolate=false, libs += node_modules
- [ ] remappings.txt: @sphinx-labs/contracts; package.json: @sphinx-labs/plugins 0.33.3 devDep + deploy:* / test:deployment scripts; sphinx.lock copied from deploy-all-v6
- [ ] script/helpers/HomerunDeployment.sol: canonical CREATE2 factory + runtime check; loads per-group protocol artifacts (JBController, REVDeployer, JBOmnichainDeployer, JBRouterTerminalRegistry from the sibling deployments/ trees, USDC table); predicts lib → hook → deployer; deploys missing; verifies runtime (immutables + library link refs masked) and every immutable binding; writes deployments/<network>/{simulation,verified}.json
- [ ] script/structs/*.sol; script/Deploy.s.sol (Sphinx, v6-deployment, expected Safe), Rehearse.s.sol, Verify.s.sol
- [ ] script/deploy.mjs + deploy.sh: preflight / rehearse / propose / verify per group; pins the 7 sibling checkouts the contracts compile against; absolute remappings (shared with scripts/test-contracts.mjs)
- [ ] test/deployment: Foundry harness tests (clean, repeat, partial, runtime/immutable/link tampering, chain-same prediction, artifact loading, manifest) + node runner/config tests
- [ ] DEPLOYMENT.md, README pointer, .env.example vars, .gitignore
- [ ] Verify: forge test (all), node test:deployment, forge build --sizes, rehearsal against a live testnet RPC if deploy-all-v6/.env has one

## Adversarial review of the contracts
- [ ] Parallel review agents: (1) HomerunDeployer launch/INCOME path + revnet interplay, (2) snapshot/vault Merkle + economics, (3) allowlist hook + ERC2771/payer tracking + omnichain deployer interplay, (4) deployment/CREATE2/link/immutable surface
- [ ] Independently verify every finding against code (+ PoC test where cheap); triage with the operational-execution playbook
- [ ] Report: confirmed findings ranked, fixes applied or explicitly deferred

## Review
(filled at the end)

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

## Draft projects (2026-09-21)
Spec: docs/superpowers/specs/2026-09-21-draft-projects-design.md
Plan (phase 1, Center + SDK + skill): docs/superpowers/plans/2026-09-21-draft-projects-phase-1.md
- [ ] Phase 1 tasks 1-15 (Center lifecycle + sponsor, SDK surface, skill, dev rehearsal)
- [ ] Phase 2 plan: juicebox.money + revnet.money
- [ ] Phase 3 plan: homerun, succulent, JBSticky, juicescan
- [ ] Phase 4 plan: eth.shop, ethis.money, JBChat read side
