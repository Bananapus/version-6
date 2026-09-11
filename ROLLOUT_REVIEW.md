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
- SDK: effective gateway/router path, explicit unknown states, three-word payment metadata, previous-hook cash-outs; 449 core tests and 153 React tests pass.
- Skills: 17 updated skills validated, all eight chains and 12 rollout ABI files checked against artifacts, receipt/ABI-drift rejection verified, all 55 archives built and inspected.
- Bendystraw: isolated Ponder/PGlite smoke synchronized the Sepolia router and gateway from actual receipt blocks through block 11684073 and reached realtime. No gateway events occurred in that interval, so empty live custody rows are correct. The handler harness covers populated queue, retry, error-class reset, settlement, and refund states.
- jbcenter release gate: 53 Foundry tests, 5 target-evidence checks, 378 MCP tests, and 1,403 Center tests passed; 119 optional PostgreSQL cases were skipped because `TEST_DATABASE_URL` is not configured.
- Juicebox Money: final Next build, typecheck, lint, 252 protocol comparisons, generated-data equality, and focused transaction/routing regressions passed. Build-time Bendystraw DNS requests failed nonfatally; no live runtime network smoke was performed.
- Revnet Money: final cached Next production build, TypeScript, lint/format, canonical 44-artifact checks, and focused routing/mirroring suites passed.
- Juicescan: final-source CI passed unit/encoding/coverage gates, production browser/accessibility, source/manifest reproduction, dependency audit, and bundle budgets ([run 34643735807](https://github.com/mejango/juicescan/actions/runs/34643735807)).
- CI found stale artifact checkout pins and vulnerable Next/sharp dependencies in the Next apps. Their draft PRs include minimal dependency patches and aligned CI/release pins; final reruns are recorded on the PRs.
- Final source-bundle and repository gates are linked from the draft PRs.

## Draft PRs

| Repository | Draft PR |
| --- | --- |
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
