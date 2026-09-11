# Router gateway and buyback rollout coordination

Canonical artifact source: `Bananapus/deploy-all-v6` commit `a6ab40c5806b52ff4cb21f9eaefe275e621796f9`, the immutable production-artifact content reference from [PR #246](https://github.com/Bananapus/deploy-all-v6/pull/246). Later deploy-all commit `0e2743ca04648ad75c820ef1d2aaf858b3a44d56` fixes historical fork tests and the read-only retirement verifier; all deployment artifacts, runtime contracts, deployment scripts, and package files remain unchanged. Consumer artifact pins remain at `a6ab40c`; Center source-bundle provenance follows the final committed repository heads.

Usage documentation describes the completed rollout. Runtime activation follows actual records separately on each chain and the project's live registry selection. A proposal, package publication, or deployed bytecode alone does not prove registry selection or settlement.

## Sequencing

- [x] Merge the four prerequisite artifact PRs in the screenshot: deploy-all #244, router #156, buyback #177, core #208.
- [x] Regenerate consumers from canonical records, retaining previous and v1 generations.
- [x] Compare four rollout contracts across eight chains and eight consumer surfaces: 256 comparisons, zero mismatches. Both Next client snapshots are identical.
- [x] Document three-word buyback metadata, TWAP-floor mint fallback, registry → gateway → router resolution, retained custody, and ratio-feed dependencies.
- [x] Record the shared routing and custody assumptions in workspace and consumer risk documentation.
- [x] Fold the four documentation branches into the supplied production artifact PRs and close the superseded documentation drafts. Consumer and coordination PRs remain drafts.
- [x] Record the completed Ethereum, Optimism, Base, and Arbitrum executions, preserving the outgoing hook/router as previous generations.
- [x] Regenerate all consumers and rerun their gates against the executed production records. Existing project operators still need their own migrations.
- [x] Buyback 1.4.1 and core 1.2.1 are published; their earlier npm permission failures are superseded. Router 1.3.2 is also published after the maintainer merged router PR #158.

Successful publication evidence: [buyback 1.4.1](https://github.com/Bananapus/nana-buyback-hook-v6/actions/runs/34648683573), [core 1.2.1](https://github.com/Bananapus/nana-core-v6/actions/runs/34650160259), [router 1.3.2](https://github.com/Bananapus/nana-router-terminal-v6/actions/runs/34652265749). All four production artifact PRs have been merged by the maintainer: core #210, buyback #179, router #158, and deploy-all #246. Router and deploy-all checks are fully green after the historical-artifact test fixes and retirement-verifier correction. Deploy-all merge commit is `42aa189f4945cc9d880e47fc2f737ebe73c2f317`; immutable consumer pins remain valid.

## Recorded chain capabilities

| Chains | Canonical hook/router/gateway | Ratio feed |
| --- | --- | --- |
| Ethereum, Optimism, Base, Arbitrum, Sepolia, Base Sepolia, Arbitrum Sepolia | Buyback 1.4.0, router 1.3.0, gateway | Recorded per chain |
| OP Sepolia | No hook, router, or gateway | Recorded |

All four production executions are represented by successful canonical receipts. Updating artifacts and regenerating data enables each chain without inline address edits. Existing projects may continue using previous contracts after defaults change; resolve their live hook and terminal selections separately.

## Review and validation

- Artifact parity: 57 aggregate/sibling records match exactly, all 41 pre-production record identities remain unchanged, and 256 comparisons across four contracts, eight chains, and eight consumers have zero mismatches. Both Next snapshots and both Bendystraw manifests agree.
- Router: the pre-gateway reader test now uses a fixed historical fixture; a separate test checks all four current mainnet gateways. Four focused tests pass, and [final Forge CI](https://github.com/Bananapus/nana-router-terminal-v6/actions/runs/34651109726), formatting, and Halmos pass on `13d974a`.
- Deploy-all: the Base fork at block 51,005,824 now uses a fixed pre-rollout fixture, while newly deployed contracts are checked against production artifacts. The read-only verifier at `0e2743c` checks the immediately outgoing `_deprecated1` hook/router, with `_deprecated` fallback for earlier layouts. Both false-success regressions failed before the correction and pass afterward; all eight affected fork tests pass. The corrected read-only verifier also passed on Ethereum, Optimism, Base, and Arbitrum (28 checks passed, zero failed, one optional project-operator check skipped per chain); no transactions were sent. [Final CI](https://github.com/Bananapus/deploy-all-v6/actions/runs/34651901118) passed 105 suites/443 tests with zero failures or skips, plus the contract-size check on `0e2743c`; formatting also passed.
- Core and buyback: production artifact/documentation PRs passed their checks and were merged by the maintainer. Both packages published successfully.
- SDK: 468 core and 153 React tests pass, including 20 receipt-validation boundary cases. Builds, types, package budgets, formatting, dependency checks, and production audit pass; 280 deployment slots, 274 artifacts, and 35 canonical ABI surfaces match the source. [Final CI](https://github.com/Bananapus/juice-sdk-v4/actions/runs/34648914127) passed on `81f6297`.
- Skills: 17 updated skills, eight chains, 57 ABI/receipt mappings, all eight ratio constructor orderings, and all 55 rebuilt archives validate. Ratio-feed guidance matches ETH/USD divided by USDC/USD, registered with USDC as pricing currency.
- Bendystraw: code generation, TypeScript, four validation scripts, and scoped lint pass. Isolated Ponder/PGlite smokes synchronized router/gateway records across all four mainnets over 21-block windows; readiness, GraphQL, and deployment queries passed. No gateway events occurred in those windows; populated queue/retry/settlement/refund cases are covered by the handler harness. Production indexers have not been deployed or reindexed by this change.
- Center/MCP: current and retired receipt emitters, router/gateway payer paths, and generation-specific hook registration windows are checked. The repaired proof tests reject unrelated emitters and recognize actual failure events. All 395 MCP tests, 1,403 outer Center cases, 53 Foundry tests, and five target-evidence checks pass, along with builds, types, formatting, and tool-catalog checks. Optional PostgreSQL cases require `TEST_DATABASE_URL`. Final source commit `c0c7c9e` includes deploy-all `0e2743c`, router `13d974a`, and Juicescan `eae40b3`; 453 knowledge references, 103 development references, 57 rollout records, 719 catalog records, and 29 focused corpus tests validate. No imported files are dirty and no old rollout pins remain. [Final CI](https://github.com/mejango/jbcenter/actions/runs/34652243125) passed the full application/contract gate, both production dependency audits, and the container build.
- Juicebox Money: [final CI](https://github.com/mejango/juicebox-money/actions/runs/34648778069) passed on `5e2a642`: 1,384 unit/coverage tests, 44 browser checks, production build, budgets, and OCI smoke. Local cold build, 252 protocol comparisons, generated-data equality, lint, and focused mainnet regressions pass.
- Revnet Money: [final CI](https://github.com/mejango/revnet-money/actions/runs/34648855148) passed on `b262d9c`: 1,404 tests, 105 browser/accessibility checks, coverage, production build, standalone/bundle checks, and OCI smoke. Local cold build also passes.
- Juicescan: [final CI](https://github.com/mejango/juicescan/actions/runs/34649735788) passed on `eae40b3`, including coverage, build, audit, and browser/accessibility. Local checks include 62 focused tests, 36 documents against both GraphQL schemas, and all 72 browser cases. Source digest is `sha256:16794edcdd7a6be201477f4f2797087e0a613eb3f1714a6cc0b27c36a1ca0b43`.
- The Next apps include Next 16.3.3 and sharp 0.35.4 dependency patches required by their release gates. Mainnet batch tests cover live routing reads, unsupported OP Sepolia actions, dependent pool steps, reordered batches, and failed RPC reads.
- Workspace `bash docs/check_risks_docs.sh` passes. Consumer and coordination PRs remain drafts for review; app/indexer deployments and project-specific migrations remain separate operational steps.

## Coordinated PRs

| Repository | PR |
| --- | --- |
| Workspace coordination and risks | [#241](https://github.com/Bananapus/version-6/pull/241) |
| Router: production artifacts + documentation | [#158](https://github.com/Bananapus/nana-router-terminal-v6/pull/158) |
| Buyback: production artifacts + documentation | [#179](https://github.com/Bananapus/nana-buyback-hook-v6/pull/179) |
| Core: production artifacts + documentation | [#210](https://github.com/Bananapus/nana-core-v6/pull/210) |
| Deploy-all: production artifacts + documentation | [#246](https://github.com/Bananapus/deploy-all-v6/pull/246) |
| Skills | [#5](https://github.com/mejango/juicebox-skills/pull/5) |
| Bendystraw | [#31](https://github.com/peripheralist/bendystraw/pull/31) |
| SDK | [#103](https://github.com/Bananapus/juice-sdk-v4/pull/103) |
| Juicebox Money | [#82](https://github.com/mejango/juicebox-money/pull/82) |
| Revnet Money | [#43](https://github.com/mejango/revnet-money/pull/43) |
| Juicescan | [#50](https://github.com/mejango/juicescan/pull/50) |
| jbcenter and MCP | [#21](https://github.com/mejango/jbcenter/pull/21) |

## Remaining old-address hits

The following scan includes application `src/lib` and tests. Every remaining file is classified below; the old deployments remain needed for existing project selections, historical decoding, and migration regressions.

```sh
rg -l -i -e '0x0fbcbb3d' -e '0x77bee1ad' \
  bendystraw-v6 bendystraw extensions/jbcenter skills juice-sdk-v4 webclients \
  nana-router-terminal-v6 nana-buyback-hook-v6 nana-core-v6 deploy-all-v6 \
  -g '!node_modules' -g '!deployments' -g '!archived' \
  -g '!artifacts' -g '!out' -g '!cache'
```

**20 retained files; no obsolete inline production defaults.** Fixed router and deploy-all fixtures isolate historical tests from current deployment records.

- [x] `bendystraw-v6/src/constants/rolloutDeployments.ts` — Generated current/history indexer sources preserve actual receipt start blocks.
- [x] `bendystraw/src/constants/rolloutDeployments.ts` — Generated current/history indexer sources preserve actual receipt start blocks.
- [x] `deploy-all-v6/test/fixtures/buyback-floor-fix/base-before-rollout.json` — Fixed Base pre-rollout state exercises genuine deployment and migration at the pinned historical block.
- [x] `extensions/jbcenter/mcp/data/development.json` — Generated source bundle preserves relevant source fixtures and historical examples with provenance.
- [x] `extensions/jbcenter/mcp/data/knowledge.json` — Generated knowledge embeds deployment/history records with source provenance.
- [x] `extensions/jbcenter/mcp/data/rollout.json` — Generated history preserves previous/v1 generations for existing project selections and decoding.
- [x] `extensions/jbcenter/src/rest/contracts/data/catalog.json` — Generated catalog preserves retired address/ABI instances for existing projects and historical activity.
- [x] `juice-sdk-v4/packages/core/src/generated/juicebox.ts` — Generated history preserves retired generations for reads and decoding.
- [x] `juice-sdk-v4/test/fixtures/protocol-deployments.v6.json` — Pinned history retains retired deployment expectations.
- [x] `nana-router-terminal-v6/test/RouterTerminalDeploymentLib.t.sol` — Existing-router deployment fixture deliberately verifies historical configuration.
- [x] `nana-router-terminal-v6/test/fixtures/pre-gateway/base/JBRouterTerminal.json` — Fixed pre-gateway fixture verifies legacy reads without relying on mutable canonical production records.
- [x] `skills/plugins/juicebox-v6/shared/chain-config.json` — Generated chain data retains every recorded generation and current mainnet contracts.
- [x] `webclients/juicebox-money/src/lib/protocol-rollout.json` — Generated history preserves previous/v1 generations for existing project selections and decoding.
- [x] `webclients/juicebox-money/test/lib/safe-batch-presets.test.ts` — Explicit previous-hook migration fixture and regression coverage, never a selectable default.
- [x] `webclients/juicescan/data/deployments.json` — Generated history preserves retired generations for reads and decoding.
- [x] `webclients/juicescan/data/manifest.json` — Generated history preserves retired generations for reads and decoding.
- [x] `webclients/juicescan/src/abi-registry.js` — Generated history preserves retired generations for reads and decoding.
- [x] `webclients/juicescan/test/safe-batch-preset.test.js` — Explicit previous-hook migration fixture and regression coverage, never a selectable default.
- [x] `webclients/revnet-money/src/lib/protocol-rollout.json` — Generated history preserves previous/v1 generations for existing project selections and decoding.
- [x] `webclients/revnet-money/test/safe-batch-preset.test.ts` — Explicit previous-hook migration fixture and regression coverage, never a selectable default.

`extensions/juicebox-mcp` is a symlink into jbcenter, so MCP is counted once. Both Bendystraw checkouts carry the focused patch with one upstream PR. Dated audit/task records and archived Juicy Vision remain historical evidence. Center's `targets-evidence` publication and reproduction files retain the original deployment pin for their dated proof; they are not the current rollout catalog. The inspected `jb-press` and `documentation_templates` sources contained no related stale deployment claims.

## Regenerating consumers

Use each repository's pinned Node/npm toolchain. In the commands below, `EVM_WORKSPACE` is the absolute workspace path, `DEPLOY_REPO` is a separate `deploy-all-v6` artifact checkout, and `DEPLOY_REF` is the reviewed, committed production-artifact SHA (`a6ab40c` for this rollout). The consumer-generation commands require that checkout to match the artifact SHA. Run the read-only deployment verifier from the reviewed source checkout at `0e2743c`, which contains the retirement correction; its artifact bytes match `a6ab40c`. Center source-bundle commands use committed workspace repository heads to capture the latest reviewed source. Only refresh chains whose transactions executed; absent records continue to disable unsupported actions.

Run from each repository root unless noted. Use the same sequence for later reviewed artifact updates.

| Repository | Refresh and verify |
| --- | --- |
| Deploy-all, from the reviewed source checkout (`0e2743c` for this rollout) | Verify execution with `npm run deploy:verify:buyback-floor-fix -- --rpc-url "$RPC_URL" -vvv`, then run `./script/post-deploy-buyback-floor-fix.sh --chains=<executed-aliases>`. This uses the matching chain RPC variables and `ETHERSCAN_API_KEY`, distributes flat sibling artifacts, and preserves numbered retirements. Commit the reviewed artifacts before generating consumers. |
| SDK | Run `export PROTOCOL_DEPLOYMENTS_DIR="$DEPLOY_REPO"`; run `npm run generate --workspace @bananapus/nana-sdk-core`, `npm run protocol:check -- --update-fixture`, then `npm run protocol:check`. Advance the deploy-all pins in `.github/workflows/{ci,release}.yml` and `TESTING.md`. |
| Juicebox Money | Run `export PROTOCOL_DEPLOYMENTS_DIR="$DEPLOY_REPO"`; run `npm run protocol:generate` then `npm run protocol:check`. Advance pins in `.github/workflows/{ci,release-image}.yml`, `TESTING.md`, and `docs/protocol-rollout.md`. The generator refreshes rollout data, gateway ABI, and the protocol fixture. |
| Revnet Money | Run `export PROTOCOL_DEPLOYMENTS_DIR="$DEPLOY_REPO"`; run `npm run protocol:rollout:generate`, `npm run protocol:rollout:check`, and `npm run protocol:check`. Advance pins in `.github/workflows/{ci,release-container}.yml`, `TESTING.md`, and the architecture reference. |
| Juicescan | Run `export DEPLOY_ALL_DEPLOYMENTS_DIR="$DEPLOY_REPO/deployments"`; run `npm run sync-deployments`, `npm run extract-sources`, and `npm run generate`. Advance `.github/workflows/test.yml`, the commit/digest constants in `scripts/check-deployment-parity.mjs`, and `TESTING.md`. Run `npm run check:deployments`, `npm run check:sources`, and `npm run bundle`. |
| Skills, from `plugins/juicebox-v6` | Run `python3 scripts/gen-chain-config.py "$DEPLOY_REPO/deployments"`, `bash build-skills.sh`, then `python3 scripts/gen-chain-config.py "$DEPLOY_REPO/deployments" --check`. Shared-reference changes also require rebuilding archives. |
| Both Bendystraw checkouts | Run `npm run generate:rollout -- --deployments "$DEPLOY_REPO/deployments" --ref "$DEPLOY_REF"`, `npm run typecheck`, and `npm test`. Commit the manifest and three generated ABIs together. `--ref` reads the committed source, not uncommitted artifacts. |
| Center catalog | Advance only reviewed source entries in `src/rest/contracts/data/pins.json`, then run `node scripts/rest/generate-contracts.mjs --workspace "$EVM_WORKSPACE"` and repeat with `--check`. `--refresh` instead advances all 22 repository pins, so use it only when every local HEAD is intended. Generation requires matching compiler outputs/dependencies. |
| Center/MCP bundles | Once source commits stabilize, run `npm --prefix mcp run rollout:sync -- --workspace "$EVM_WORKSPACE"`, `npm --prefix mcp run knowledge:sync -- --workspace "$EVM_WORKSPACE" --skills "$EVM_WORKSPACE/skills"`, `npm --prefix mcp run development:sync -- --workspace "$EVM_WORKSPACE"`, and `npm --prefix mcp run catalog:generate`. Repeat using `rollout:check`, `knowledge:check`, `development:check`, and `catalog:check`; then run Center's `npm run check`. |

For Juicescan, obtain the new source digest from its generator without writing files:

```sh
node -e 'console.log(require("./build/sync-deployments.js").deploymentSourceDigest(process.argv[1]))' "$DEPLOY_REPO/deployments"
```

Review and commit generated changes, rerun each repository's full release gates and cross-client parity, then refresh these drafts. SDK and Juicescan checks that require clean generated files run after committing their reviewed outputs. Indexer production deployment/reindex and existing-project operator migrations remain separate steps.
