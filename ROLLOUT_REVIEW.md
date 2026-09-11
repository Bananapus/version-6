# Router gateway and buyback rollout coordination

Canonical artifact source: `Bananapus/deploy-all-v6` commit `8522541297557c80f8bc2dd674c3098f8849b527`.

Usage documentation describes the completed rollout. Runtime activation follows actual records separately on each chain and the project's live registry selection. A proposal, package publication, or deployed bytecode alone does not prove registry selection or settlement.

## Sequencing

- [x] Merge the four prerequisite artifact PRs in the screenshot: deploy-all #244, router #156, buyback #177, core #208.
- [x] Regenerate consumers from canonical records, retaining previous and v1 generations.
- [x] Compare four rollout contracts across eight chains and eight consumer surfaces: 256 comparisons, zero mismatches. Both Next client snapshots are identical.
- [x] Document three-word buyback metadata, TWAP-floor mint fallback, registry → gateway → router resolution, retained custody, and ratio-feed dependencies.
- [x] Record the shared routing and custody assumptions in workspace and consumer risk documentation.
- [x] Keep all follow-up PRs in draft while production executes, as requested.
- [ ] After each production execution, distribute artifacts, regenerate consumers, rerun gates, and refresh these PRs before merging. Existing project operators still need their own migrations.
- [ ] Refresh npm publication credentials and retry buyback 1.4.1 and core 1.2.1. Router 1.3.1 published successfully.

After the GitHub Actions secrets are refreshed, retry the existing failed publication jobs (no additional merge is needed):

```sh
gh run rerun 34641095209 --repo Bananapus/nana-buyback-hook-v6 --failed
gh run rerun 34641107854 --repo Bananapus/nana-core-v6 --failed
```

## Recorded chain capabilities

| Chains | Canonical hook/router/gateway | Ratio feed |
| --- | --- | --- |
| Sepolia, Base Sepolia, Arbitrum Sepolia | Buyback 1.4.0, router 1.3.0, gateway | Recorded per chain |
| OP Sepolia | No hook, router, or gateway | Recorded |
| Ethereum, Optimism, Base, Arbitrum | Previous hook/router; no gateway record | No new ratio-feed record |

This is the state of the pinned records, not an assertion about later production transactions. Mainnet execution is expected shortly. Updating artifacts and regenerating data enables each chain without inline address edits. Existing projects may continue using previous contracts after defaults change.

## Review and validation

- Canonical address/availability parity: SDK fixtures, both Next clients, Juicescan, skills, Center catalog, MCP rollout records, and Bendystraw, 256 comparisons.
- Contract documentation: all router, buyback, core, and deploy-all PR checks passed, including Foundry tests and formatting; the three contract repositories also passed their Halmos smoke checks.
- Batch review: actual cross-chain mirroring, absent mainnet and OP Sepolia generations, dependent pool steps, reordered source batches, and failed RPC reads.
- SDK: effective gateway/router path, explicit unknown states, three-word payment metadata, previous-hook cash-outs; 449 core tests and 153 React tests pass. Receipt validation also passes 20 generator boundary cases. Final CI passed on `c7e13fa` ([run 34645510353](https://github.com/Bananapus/juice-sdk-v4/actions/runs/34645510353)).
- Skills: 17 updated skills validated, all eight chains and 12 rollout ABI files checked against artifacts, receipt/ABI-drift rejection verified, all 55 archives built and inspected. Final ratio-feed guidance and archive text match ETH/USD divided by USDC/USD, registered with USDC as pricing currency; all four executed feed constructors agree.
- Bendystraw: isolated Ponder/PGlite smoke synchronized the Sepolia router and gateway from actual receipt blocks through block 11684073 and reached realtime. No gateway events occurred in that interval, so empty live custody rows are correct. The handler harness covers populated queue, retry, error-class reset, settlement, and refund states.
- jbcenter release gate: 53 Foundry tests, 5 target-evidence checks, 378 MCP tests, and 1,403 Center tests passed; 119 optional PostgreSQL cases were skipped because `TEST_DATABASE_URL` is not configured.
- Juicebox Money: Next build, typecheck, lint, 252 protocol comparisons, generated-data equality, and all 1,364 unit tests across 150 files passed with coverage thresholds intact. Build-time Bendystraw DNS requests failed nonfatally; no live runtime network smoke was performed.
- Revnet Money: final cached Next production build, TypeScript, lint/format, canonical 44-artifact checks, and focused routing/mirroring suites passed.
- Juicescan: final-source CI passed unit/encoding/coverage gates, production browser/accessibility, source/manifest reproduction, dependency audit, and bundle budgets on `5a84282` ([run 34645975262](https://github.com/mejango/juicescan/actions/runs/34645975262)).
- CI found stale artifact checkout pins and vulnerable Next/sharp dependencies in the Next apps. Their draft PRs include minimal dependency patches and aligned CI/release pins; final reruns are recorded on the PRs.
- Final source-bundle and repository gates are linked from the draft PRs.

## Draft PRs

| Repository | Draft PR |
| --- | --- |
| Workspace coordination and risks | [#241](https://github.com/Bananapus/version-6/pull/241) |
| Router | [#157](https://github.com/Bananapus/nana-router-terminal-v6/pull/157) |
| Buyback | [#178](https://github.com/Bananapus/nana-buyback-hook-v6/pull/178) |
| Core | [#209](https://github.com/Bananapus/nana-core-v6/pull/209) |
| Deploy-all | [#245](https://github.com/Bananapus/deploy-all-v6/pull/245) |
| Skills | [#5](https://github.com/mejango/juicebox-skills/pull/5) |
| Bendystraw | [#31](https://github.com/peripheralist/bendystraw/pull/31) |
| SDK | [#103](https://github.com/Bananapus/juice-sdk-v4/pull/103) |
| Juicebox Money | [#82](https://github.com/mejango/juicebox-money/pull/82) |
| Revnet Money | [#43](https://github.com/mejango/revnet-money/pull/43) |
| Juicescan | [#50](https://github.com/mejango/juicescan/pull/50) |
| jbcenter and MCP | [#21](https://github.com/mejango/jbcenter/pull/21) |

## Remaining old-address hits

The following scan includes application `src/lib` and tests. Every remaining file is classified below; the old deployments remain needed for current mainnet records, historical decoding, and migration regressions.

```sh
rg -l -i -e '0x0fbcbb3d' -e '0x77bee1ad' \
  bendystraw-v6 bendystraw extensions/jbcenter skills juice-sdk-v4 webclients \
  nana-router-terminal-v6 nana-buyback-hook-v6 nana-core-v6 deploy-all-v6 \
  -g '!node_modules' -g '!deployments' -g '!archived' \
  -g '!artifacts' -g '!out' -g '!cache'
```

**19 retained files; no obsolete inline production defaults.**

- [x] `bendystraw-v6/src/constants/rolloutDeployments.ts` — Generated current/history indexer sources preserve actual receipt start blocks.
- [x] `bendystraw/src/constants/rolloutDeployments.ts` — Generated current/history indexer sources preserve actual receipt start blocks.
- [x] `extensions/jbcenter/mcp/data/development.json` — Generated source bundle preserves relevant source fixtures and historical examples with provenance.
- [x] `extensions/jbcenter/mcp/data/knowledge.json` — Generated knowledge embeds deployment/history records with source provenance.
- [x] `extensions/jbcenter/mcp/data/rollout.json` — Generated per-chain canonical/history records preserve the actual mainnet stack.
- [x] `extensions/jbcenter/src/rest/contracts/data/catalog.json` — Generated catalog preserves mainnet canonical and retired address/ABI instances.
- [x] `juice-sdk-v4/packages/core/src/generated/juicebox.ts` — Generated address/ABI/deployment records preserve current mainnet and retired generations for reads and decoding.
- [x] `juice-sdk-v4/test/fixtures/protocol-deployments.v6.json` — Pinned canonical/history deployment expectations include the current mainnet stack.
- [x] `nana-router-terminal-v6/test/RouterTerminalDeploymentLib.t.sol` — Existing-router deployment fixture deliberately verifies historical configuration.
- [x] `skills/plugins/juicebox-v6/shared/chain-config.json` — Generated chain data retains every recorded generation and current mainnet contracts.
- [x] `webclients/juicebox-money/src/lib/protocol-rollout.json` — Generated per-chain canonical/history records preserve the actual mainnet stack.
- [x] `webclients/juicebox-money/test/fixtures/protocol-deployments.v6.json` — Pinned canonical/history deployment expectations include the current mainnet stack.
- [x] `webclients/juicebox-money/test/lib/safe-batch-presets.test.ts` — Explicit previous-hook migration fixture and regression coverage, never a selectable default.
- [x] `webclients/juicescan/data/deployments.json` — Generated address/ABI/deployment records preserve current mainnet and retired generations for reads and decoding.
- [x] `webclients/juicescan/data/manifest.json` — Generated address/ABI/deployment records preserve current mainnet and retired generations for reads and decoding.
- [x] `webclients/juicescan/src/abi-registry.js` — Generated address/ABI/deployment records preserve current mainnet and retired generations for reads and decoding.
- [x] `webclients/juicescan/test/safe-batch-preset.test.js` — Explicit previous-hook migration fixture and regression coverage, never a selectable default.
- [x] `webclients/revnet-money/src/lib/protocol-rollout.json` — Generated per-chain canonical/history records preserve the actual mainnet stack.
- [x] `webclients/revnet-money/test/safe-batch-preset.test.ts` — Explicit previous-hook migration fixture and regression coverage, never a selectable default.

`extensions/juicebox-mcp` is a symlink into jbcenter, so MCP is counted once. Both Bendystraw checkouts carry the focused patch with one upstream PR. Dated audit/task records and archived Juicy Vision remain historical evidence. The inspected `jb-press` and `documentation_templates` sources contained no related stale deployment claims.

## Refresh after production execution

Use each repository's pinned Node/npm toolchain. In the commands below, `EVM_WORKSPACE` is the absolute workspace path, `DEPLOY_REPO` is its `deploy-all-v6` checkout, and `DEPLOY_REF` is the reviewed, committed production-artifact SHA. The checkout must match that SHA. Only refresh chains whose transactions executed; absent records continue to disable unsupported actions.

Run from each repository root unless noted. These are follow-up commands, not evidence that production execution has happened.

| Repository | Refresh and verify |
| --- | --- |
| Deploy-all | Verify execution with `npm run deploy:verify:buyback-floor-fix -- --rpc-url "$RPC_URL" -vvv`, then run `./script/post-deploy-buyback-floor-fix.sh --chains=<executed-aliases>`. This uses the matching chain RPC variables and `ETHERSCAN_API_KEY`, distributes flat sibling artifacts, and preserves numbered retirements. Commit the reviewed artifacts before generating consumers. |
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
