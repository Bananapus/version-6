# Audit Source Manifest

Generated: 2026-05-21

Purpose: literal per-file coverage appendix for the in-scope Juicebox V6 EVM smart-contract audit. This file maps each
production `src/*.sol` file to the report evidence bucket that currently covers it. It is an audit coverage manifest,
not a machine-checked proof.

Inventory command:

```sh
for d in banny-retail-v6 croptop-core-v6 defifa nana-721-hook-v6 nana-address-registry-v6 \
  nana-buyback-hook-v6 nana-core-v6 nana-distributor-v6 nana-omnichain-deployers-v6 \
  nana-ownable-v6 nana-permission-ids-v6 nana-project-handles-v6 nana-project-payer-v6 \
  nana-router-terminal-v6 nana-suckers-v6 revnet-core-v6 univ4-lp-split-hook-v6 univ4-router-v6
do
  rg --files "$d/src" -g '*.sol'
done | wc -l
```

Inventory result: 295 files.

Scope exclusions: `nana-referral-split-hook-v6`, `bendystraw-v6`, and `website` are excluded by user direction.
`nana-fee-project-deployer-v6` and `deploy-all-v6` are deployment/script packages and are covered in
`AUDIT_REPORT_2.md` by their deploy/verify/rehearsal evidence rather than this `src/*.sol` manifest.

## Evidence Buckets

| Repo | Evidence bucket |
| --- | --- |
| `banny-retail-v6` | BANNY-01/02, resolver local/fork coverage, and `test/formal/BannyResolverHalmos.t.sol`. |
| `croptop-core-v6` | CROPTOP-01/02, publisher/deployer/fork coverage, and `test/formal/CroptopHalmos.t.sol`. |
| `defifa` | DEFIFA-01, game-flow/fee/reserve/governance coverage, pinned fork coverage, and `test/formal/DefifaHookLibHalmos.t.sol`. |
| `nana-721-hook-v6` | 721-01/02/03, tier lifecycle/split/fork/invariant coverage, and `test/formal/JBBitmapHalmos.t.sol`. |
| `nana-address-registry-v6` | ADDRESS-01 plus address-registry utility/fork coverage and `test/formal/JBAddressRegistryHalmos.t.sol`. |
| `nana-buyback-hook-v6` | BUYBACK-01/02/03, ROUTER-UNI-01, swap/fork coverage, and `test/formal/JBSwapLibHalmos.t.sol`. |
| `nana-core-v6` | CORE-01 through CORE-07 plus core fuzz/invariant/formal campaigns. |
| `nana-distributor-v6` | DIST-01 through DIST-05, distributor invariant/fork coverage, `JBVestingMath`, and `test/formal/JBVestingMathHalmos.t.sol`. |
| `nana-omnichain-deployers-v6` | OMNI-01/02, local invariant/fork coverage, and `test/formal/JBOmnichainDeployerHalmos.t.sol`. |
| `nana-ownable-v6` | OWNABLE-01, ownable invariant coverage, and `test/formal/JBOwnableHalmos.t.sol`. |
| `nana-permission-ids-v6` | PERMISSION-01 constants scan/build gate and `test/formal/JBPermissionIdsHalmos.t.sol`. |
| `nana-project-handles-v6` | HANDLES-01, malformed resolver/control-character coverage, and `test/formal/JBProjectHandlesHalmos.t.sol`. |
| `nana-project-payer-v6` | PAYER-01/02/03/04 plus audit/fork payer coverage and `test/formal/JBProjectPayerHalmos.t.sol`. |
| `nana-router-terminal-v6` | ROUTER-TERM-01, ROUTER-UNI-01, router/fork coverage, and `test/formal/JBSwapLibHalmos.t.sol`. |
| `nana-suckers-v6` | SUCKER-01/02, SUCKER-BRIDGE-01, SUCKER-REG-01, SUCKER-MAP-01, SUCKER-ALLOW-01, conversion invariants, and `test/formal/JBSuckerLibHalmos.t.sol`. |
| `revnet-core-v6` | REVNET-TERM-01, REVNET-LOAN-01, REVNET-FEE-01, Revnet invariant/fork coverage, source-fee library, and `test/formal/REVLoansHalmos.t.sol`. |
| `univ4-lp-split-hook-v6` | LP-SPLIT-01/02, invariant/fork coverage, helper library, and `test/formal/JBUniswapV4LPSplitHookHalmos.t.sol`. |
| `univ4-router-v6` | ROUTER-UNI-01/02, invariant/V4 routing coverage, and `test/formal/OracleHalmos.t.sol`. |

## Per-File Manifest

### `banny-retail-v6`

Evidence bucket: BANNY-01/02, resolver local/fork coverage, and `test/formal/BannyResolverHalmos.t.sol`.

- `banny-retail-v6/src/Banny721TokenUriResolver.sol`
- `banny-retail-v6/src/interfaces/IBanny721TokenUriResolver.sol`

### `croptop-core-v6`

Evidence bucket: CROPTOP-01/02, publisher/deployer/fork coverage, and `test/formal/CroptopHalmos.t.sol`.

- `croptop-core-v6/src/CTDeployer.sol`
- `croptop-core-v6/src/CTProjectOwner.sol`
- `croptop-core-v6/src/CTPublisher.sol`
- `croptop-core-v6/src/interfaces/ICTDeployer.sol`
- `croptop-core-v6/src/interfaces/ICTProjectOwner.sol`
- `croptop-core-v6/src/interfaces/ICTPublisher.sol`
- `croptop-core-v6/src/structs/CTAllowedPost.sol`
- `croptop-core-v6/src/structs/CTDeployerAllowedPost.sol`
- `croptop-core-v6/src/structs/CTPost.sol`
- `croptop-core-v6/src/structs/CTProjectConfig.sol`
- `croptop-core-v6/src/structs/CTSuckerDeploymentConfig.sol`

### `defifa`

Evidence bucket: DEFIFA-01, game-flow/fee/reserve/governance coverage, pinned fork coverage, and
`test/formal/DefifaHookLibHalmos.t.sol`.

- `defifa/src/DefifaDeployer.sol`
- `defifa/src/DefifaGovernor.sol`
- `defifa/src/DefifaHook.sol`
- `defifa/src/DefifaProjectOwner.sol`
- `defifa/src/DefifaTokenUriResolver.sol`
- `defifa/src/enums/DefifaGamePhase.sol`
- `defifa/src/enums/DefifaScorecardState.sol`
- `defifa/src/interfaces/IDefifaDeployer.sol`
- `defifa/src/interfaces/IDefifaGamePhaseReporter.sol`
- `defifa/src/interfaces/IDefifaGamePotReporter.sol`
- `defifa/src/interfaces/IDefifaGovernor.sol`
- `defifa/src/interfaces/IDefifaHook.sol`
- `defifa/src/interfaces/IDefifaTokenUriResolver.sol`
- `defifa/src/libraries/DefifaFontImporter.sol`
- `defifa/src/libraries/DefifaHookLib.sol`
- `defifa/src/structs/DefifaAttestations.sol`
- `defifa/src/structs/DefifaDelegation.sol`
- `defifa/src/structs/DefifaLaunchProjectData.sol`
- `defifa/src/structs/DefifaOpsData.sol`
- `defifa/src/structs/DefifaScorecard.sol`
- `defifa/src/structs/DefifaTierCashOutWeight.sol`
- `defifa/src/structs/DefifaTierParams.sol`

### `nana-721-hook-v6`

Evidence bucket: 721-01/02/03, tier lifecycle/split/fork/invariant coverage, and `test/formal/JBBitmapHalmos.t.sol`.

- `nana-721-hook-v6/src/JB721Checkpoints.sol`
- `nana-721-hook-v6/src/JB721CheckpointsDeployer.sol`
- `nana-721-hook-v6/src/JB721TiersHook.sol`
- `nana-721-hook-v6/src/JB721TiersHookDeployer.sol`
- `nana-721-hook-v6/src/JB721TiersHookProjectDeployer.sol`
- `nana-721-hook-v6/src/JB721TiersHookStore.sol`
- `nana-721-hook-v6/src/abstract/ERC721.sol`
- `nana-721-hook-v6/src/abstract/JB721Hook.sol`
- `nana-721-hook-v6/src/interfaces/IJB721Checkpoints.sol`
- `nana-721-hook-v6/src/interfaces/IJB721CheckpointsDeployer.sol`
- `nana-721-hook-v6/src/interfaces/IJB721Hook.sol`
- `nana-721-hook-v6/src/interfaces/IJB721TiersHook.sol`
- `nana-721-hook-v6/src/interfaces/IJB721TiersHookDeployer.sol`
- `nana-721-hook-v6/src/interfaces/IJB721TiersHookProjectDeployer.sol`
- `nana-721-hook-v6/src/interfaces/IJB721TiersHookStore.sol`
- `nana-721-hook-v6/src/interfaces/IJB721TokenUriResolver.sol`
- `nana-721-hook-v6/src/libraries/JB721Constants.sol`
- `nana-721-hook-v6/src/libraries/JB721TiersHookLib.sol`
- `nana-721-hook-v6/src/libraries/JB721TiersRulesetMetadataResolver.sol`
- `nana-721-hook-v6/src/libraries/JBBitmap.sol`
- `nana-721-hook-v6/src/libraries/JBIpfsDecoder.sol`
- `nana-721-hook-v6/src/structs/JB721InitTiersConfig.sol`
- `nana-721-hook-v6/src/structs/JB721Tier.sol`
- `nana-721-hook-v6/src/structs/JB721TierConfig.sol`
- `nana-721-hook-v6/src/structs/JB721TierConfigFlags.sol`
- `nana-721-hook-v6/src/structs/JB721TierFlags.sol`
- `nana-721-hook-v6/src/structs/JB721TiersHookFlags.sol`
- `nana-721-hook-v6/src/structs/JB721TiersMintReservesConfig.sol`
- `nana-721-hook-v6/src/structs/JB721TiersRulesetMetadata.sol`
- `nana-721-hook-v6/src/structs/JB721TiersSetDiscountPercentConfig.sol`
- `nana-721-hook-v6/src/structs/JBBitmapWord.sol`
- `nana-721-hook-v6/src/structs/JBDeploy721TiersHookConfig.sol`
- `nana-721-hook-v6/src/structs/JBLaunchProjectConfig.sol`
- `nana-721-hook-v6/src/structs/JBLaunchRulesetsConfig.sol`
- `nana-721-hook-v6/src/structs/JBPayDataHookRulesetConfig.sol`
- `nana-721-hook-v6/src/structs/JBPayDataHookRulesetMetadata.sol`
- `nana-721-hook-v6/src/structs/JBQueueRulesetsConfig.sol`
- `nana-721-hook-v6/src/structs/JBStored721Tier.sol`

### `nana-address-registry-v6`

Evidence bucket: ADDRESS-01 plus address-registry utility/fork coverage and `test/formal/JBAddressRegistryHalmos.t.sol`.

- `nana-address-registry-v6/src/JBAddressRegistry.sol`
- `nana-address-registry-v6/src/interfaces/IJBAddressRegistry.sol`

### `nana-buyback-hook-v6`

Evidence bucket: BUYBACK-01/02/03, ROUTER-UNI-01, swap/fork coverage, and `test/formal/JBSwapLibHalmos.t.sol`.

- `nana-buyback-hook-v6/src/JBBuybackHook.sol`
- `nana-buyback-hook-v6/src/JBBuybackHookRegistry.sol`
- `nana-buyback-hook-v6/src/interfaces/IGeomeanOracle.sol`
- `nana-buyback-hook-v6/src/interfaces/IJBBuybackHook.sol`
- `nana-buyback-hook-v6/src/interfaces/IJBBuybackHookRegistry.sol`
- `nana-buyback-hook-v6/src/libraries/JBSwapLib.sol`
- `nana-buyback-hook-v6/src/structs/DefaultHookSegment.sol`
- `nana-buyback-hook-v6/src/structs/SwapCallbackData.sol`

### `nana-core-v6`

Evidence bucket: CORE-01 through CORE-07 plus core fuzz/invariant/formal campaigns.

- `nana-core-v6/src/JBChainlinkV3PriceFeed.sol`
- `nana-core-v6/src/JBChainlinkV3SequencerPriceFeed.sol`
- `nana-core-v6/src/JBController.sol`
- `nana-core-v6/src/JBDeadline.sol`
- `nana-core-v6/src/JBDirectory.sol`
- `nana-core-v6/src/JBERC20.sol`
- `nana-core-v6/src/JBFeelessAddresses.sol`
- `nana-core-v6/src/JBFundAccessLimits.sol`
- `nana-core-v6/src/JBMultiTerminal.sol`
- `nana-core-v6/src/JBPermissions.sol`
- `nana-core-v6/src/JBPrices.sol`
- `nana-core-v6/src/JBProjects.sol`
- `nana-core-v6/src/JBRulesets.sol`
- `nana-core-v6/src/JBSplits.sol`
- `nana-core-v6/src/JBTerminalStore.sol`
- `nana-core-v6/src/JBTokens.sol`
- `nana-core-v6/src/abstract/JBControlled.sol`
- `nana-core-v6/src/abstract/JBPermissioned.sol`
- `nana-core-v6/src/enums/JBApprovalStatus.sol`
- `nana-core-v6/src/interfaces/IJBCashOutHook.sol`
- `nana-core-v6/src/interfaces/IJBCashOutTerminal.sol`
- `nana-core-v6/src/interfaces/IJBControlled.sol`
- `nana-core-v6/src/interfaces/IJBController.sol`
- `nana-core-v6/src/interfaces/IJBDirectory.sol`
- `nana-core-v6/src/interfaces/IJBDirectoryAccessControl.sol`
- `nana-core-v6/src/interfaces/IJBFeeTerminal.sol`
- `nana-core-v6/src/interfaces/IJBFeelessAddresses.sol`
- `nana-core-v6/src/interfaces/IJBFeelessHook.sol`
- `nana-core-v6/src/interfaces/IJBFundAccessLimits.sol`
- `nana-core-v6/src/interfaces/IJBMigratable.sol`
- `nana-core-v6/src/interfaces/IJBMultiTerminal.sol`
- `nana-core-v6/src/interfaces/IJBPayHook.sol`
- `nana-core-v6/src/interfaces/IJBPayoutTerminal.sol`
- `nana-core-v6/src/interfaces/IJBPermissioned.sol`
- `nana-core-v6/src/interfaces/IJBPermissions.sol`
- `nana-core-v6/src/interfaces/IJBPermitTerminal.sol`
- `nana-core-v6/src/interfaces/IJBPriceFeed.sol`
- `nana-core-v6/src/interfaces/IJBPrices.sol`
- `nana-core-v6/src/interfaces/IJBProjectUriRegistry.sol`
- `nana-core-v6/src/interfaces/IJBProjects.sol`
- `nana-core-v6/src/interfaces/IJBRulesetApprovalHook.sol`
- `nana-core-v6/src/interfaces/IJBRulesetDataHook.sol`
- `nana-core-v6/src/interfaces/IJBRulesets.sol`
- `nana-core-v6/src/interfaces/IJBSplitHook.sol`
- `nana-core-v6/src/interfaces/IJBSplits.sol`
- `nana-core-v6/src/interfaces/IJBTerminal.sol`
- `nana-core-v6/src/interfaces/IJBTerminalStore.sol`
- `nana-core-v6/src/interfaces/IJBToken.sol`
- `nana-core-v6/src/interfaces/IJBTokenUriResolver.sol`
- `nana-core-v6/src/interfaces/IJBTokens.sol`
- `nana-core-v6/src/libraries/JBCashOuts.sol`
- `nana-core-v6/src/libraries/JBConstants.sol`
- `nana-core-v6/src/libraries/JBCurrencyIds.sol`
- `nana-core-v6/src/libraries/JBFees.sol`
- `nana-core-v6/src/libraries/JBFixedPointNumber.sol`
- `nana-core-v6/src/libraries/JBMetadataResolver.sol`
- `nana-core-v6/src/libraries/JBPayoutSplitGroupLib.sol`
- `nana-core-v6/src/libraries/JBRulesetMetadataResolver.sol`
- `nana-core-v6/src/libraries/JBSplitGroupIds.sol`
- `nana-core-v6/src/libraries/JBSurplus.sol`
- `nana-core-v6/src/periphery/JBDeadline1Day.sol`
- `nana-core-v6/src/periphery/JBDeadline3Days.sol`
- `nana-core-v6/src/periphery/JBDeadline3Hours.sol`
- `nana-core-v6/src/periphery/JBDeadline7Days.sol`
- `nana-core-v6/src/periphery/JBMatchingPriceFeed.sol`
- `nana-core-v6/src/structs/JBAccountingContext.sol`
- `nana-core-v6/src/structs/JBAfterCashOutRecordedContext.sol`
- `nana-core-v6/src/structs/JBAfterPayRecordedContext.sol`
- `nana-core-v6/src/structs/JBBeforeCashOutRecordedContext.sol`
- `nana-core-v6/src/structs/JBBeforePayRecordedContext.sol`
- `nana-core-v6/src/structs/JBCashOutHookSpecification.sol`
- `nana-core-v6/src/structs/JBCurrencyAmount.sol`
- `nana-core-v6/src/structs/JBFee.sol`
- `nana-core-v6/src/structs/JBFundAccessLimitGroup.sol`
- `nana-core-v6/src/structs/JBPayHookSpecification.sol`
- `nana-core-v6/src/structs/JBPermissionsData.sol`
- `nana-core-v6/src/structs/JBRuleset.sol`
- `nana-core-v6/src/structs/JBRulesetConfig.sol`
- `nana-core-v6/src/structs/JBRulesetMetadata.sol`
- `nana-core-v6/src/structs/JBRulesetWeightCache.sol`
- `nana-core-v6/src/structs/JBRulesetWithMetadata.sol`
- `nana-core-v6/src/structs/JBSingleAllowance.sol`
- `nana-core-v6/src/structs/JBSplit.sol`
- `nana-core-v6/src/structs/JBSplitGroup.sol`
- `nana-core-v6/src/structs/JBSplitHookContext.sol`
- `nana-core-v6/src/structs/JBTerminalConfig.sol`
- `nana-core-v6/src/structs/JBTokenAmount.sol`

### `nana-distributor-v6`

Evidence bucket: DIST-01 through DIST-05, distributor invariant/fork coverage, `JBVestingMath`, and
`test/formal/JBVestingMathHalmos.t.sol`.

- `nana-distributor-v6/src/JB721Distributor.sol`
- `nana-distributor-v6/src/JBDistributor.sol`
- `nana-distributor-v6/src/JBTokenDistributor.sol`
- `nana-distributor-v6/src/interfaces/IJB721Distributor.sol`
- `nana-distributor-v6/src/interfaces/IJBDistributor.sol`
- `nana-distributor-v6/src/interfaces/IJBTokenDistributor.sol`
- `nana-distributor-v6/src/libraries/JBVestingMath.sol`
- `nana-distributor-v6/src/structs/JBTokenSnapshotData.sol`
- `nana-distributor-v6/src/structs/JBVestingData.sol`

### `nana-omnichain-deployers-v6`

Evidence bucket: OMNI-01/02, local invariant/fork coverage, and `test/formal/JBOmnichainDeployerHalmos.t.sol`.

- `nana-omnichain-deployers-v6/src/JBOmnichainDeployer.sol`
- `nana-omnichain-deployers-v6/src/interfaces/IJBOmnichainDeployer.sol`
- `nana-omnichain-deployers-v6/src/structs/JBDeployerHookConfig.sol`
- `nana-omnichain-deployers-v6/src/structs/JBOmnichain721Config.sol`
- `nana-omnichain-deployers-v6/src/structs/JBSuckerDeploymentConfig.sol`
- `nana-omnichain-deployers-v6/src/structs/JBTiered721HookConfig.sol`

### `nana-ownable-v6`

Evidence bucket: OWNABLE-01, ownable invariant coverage, and `test/formal/JBOwnableHalmos.t.sol`.

- `nana-ownable-v6/src/JBOwnable.sol`
- `nana-ownable-v6/src/JBOwnableOverrides.sol`
- `nana-ownable-v6/src/interfaces/IJBOwnable.sol`
- `nana-ownable-v6/src/structs/JBOwner.sol`

### `nana-permission-ids-v6`

Evidence bucket: PERMISSION-01 constants scan/build gate and `test/formal/JBPermissionIdsHalmos.t.sol`.

- `nana-permission-ids-v6/src/JBPermissionIds.sol`

### `nana-project-handles-v6`

Evidence bucket: HANDLES-01, malformed resolver/control-character coverage, and
`test/formal/JBProjectHandlesHalmos.t.sol`.

- `nana-project-handles-v6/src/JBProjectHandles.sol`
- `nana-project-handles-v6/src/interfaces/IJBProjectHandles.sol`

### `nana-project-payer-v6`

Evidence bucket: PAYER-01/02/03/04 plus audit/fork payer coverage and `test/formal/JBProjectPayerHalmos.t.sol`.

- `nana-project-payer-v6/src/JBProjectPayer.sol`
- `nana-project-payer-v6/src/JBProjectPayerDeployer.sol`
- `nana-project-payer-v6/src/interfaces/IJBPayerTracker.sol`
- `nana-project-payer-v6/src/interfaces/IJBProjectPayer.sol`
- `nana-project-payer-v6/src/interfaces/IJBProjectPayerDeployer.sol`

### `nana-router-terminal-v6`

Evidence bucket: ROUTER-TERM-01, ROUTER-UNI-01, router/fork coverage, and `test/formal/JBSwapLibHalmos.t.sol`.

- `nana-router-terminal-v6/src/JBPayRouteResolver.sol`
- `nana-router-terminal-v6/src/JBRouterTerminal.sol`
- `nana-router-terminal-v6/src/JBRouterTerminalRegistry.sol`
- `nana-router-terminal-v6/src/interfaces/IGeomeanOracle.sol`
- `nana-router-terminal-v6/src/interfaces/IJBForwardingTerminal.sol`
- `nana-router-terminal-v6/src/interfaces/IJBPayRoutePreviewer.sol`
- `nana-router-terminal-v6/src/interfaces/IJBPayRouteResolver.sol`
- `nana-router-terminal-v6/src/interfaces/IJBPayerTracker.sol`
- `nana-router-terminal-v6/src/interfaces/IJBRouterTerminal.sol`
- `nana-router-terminal-v6/src/interfaces/IJBRouterTerminalRegistry.sol`
- `nana-router-terminal-v6/src/interfaces/IWETH9.sol`
- `nana-router-terminal-v6/src/libraries/JBForwardingCheck.sol`
- `nana-router-terminal-v6/src/libraries/JBSwapLib.sol`
- `nana-router-terminal-v6/src/structs/CashOutPathCandidates.sol`
- `nana-router-terminal-v6/src/structs/DefaultTerminalSegment.sol`
- `nana-router-terminal-v6/src/structs/PoolInfo.sol`

### `nana-suckers-v6`

Evidence bucket: SUCKER-01/02, SUCKER-BRIDGE-01, SUCKER-REG-01, SUCKER-MAP-01, SUCKER-ALLOW-01, conversion
invariants, and `test/formal/JBSuckerLibHalmos.t.sol`.

- `nana-suckers-v6/src/JBArbitrumSucker.sol`
- `nana-suckers-v6/src/JBBaseSucker.sol`
- `nana-suckers-v6/src/JBCCIPSucker.sol`
- `nana-suckers-v6/src/JBCeloSucker.sol`
- `nana-suckers-v6/src/JBOptimismSucker.sol`
- `nana-suckers-v6/src/JBSucker.sol`
- `nana-suckers-v6/src/JBSuckerRegistry.sol`
- `nana-suckers-v6/src/JBSwapCCIPSucker.sol`
- `nana-suckers-v6/src/deployers/JBArbitrumSuckerDeployer.sol`
- `nana-suckers-v6/src/deployers/JBBaseSuckerDeployer.sol`
- `nana-suckers-v6/src/deployers/JBCCIPSuckerDeployer.sol`
- `nana-suckers-v6/src/deployers/JBCeloSuckerDeployer.sol`
- `nana-suckers-v6/src/deployers/JBOptimismSuckerDeployer.sol`
- `nana-suckers-v6/src/deployers/JBSuckerDeployer.sol`
- `nana-suckers-v6/src/deployers/JBSwapCCIPSuckerDeployer.sol`
- `nana-suckers-v6/src/enums/JBLayer.sol`
- `nana-suckers-v6/src/enums/JBSuckerState.sol`
- `nana-suckers-v6/src/interfaces/IArbGatewayRouter.sol`
- `nana-suckers-v6/src/interfaces/IArbL1GatewayRouter.sol`
- `nana-suckers-v6/src/interfaces/IArbL2GatewayRouter.sol`
- `nana-suckers-v6/src/interfaces/ICCIPRouter.sol`
- `nana-suckers-v6/src/interfaces/IGeomeanOracle.sol`
- `nana-suckers-v6/src/interfaces/IJBArbitrumSucker.sol`
- `nana-suckers-v6/src/interfaces/IJBArbitrumSuckerDeployer.sol`
- `nana-suckers-v6/src/interfaces/IJBCCIPSuckerDeployer.sol`
- `nana-suckers-v6/src/interfaces/IJBCeloSuckerDeployer.sol`
- `nana-suckers-v6/src/interfaces/IJBOpSuckerDeployer.sol`
- `nana-suckers-v6/src/interfaces/IJBOptimismSucker.sol`
- `nana-suckers-v6/src/interfaces/IJBPeerChainAdjustedAccounts.sol`
- `nana-suckers-v6/src/interfaces/IJBSucker.sol`
- `nana-suckers-v6/src/interfaces/IJBSuckerDeployer.sol`
- `nana-suckers-v6/src/interfaces/IJBSuckerExtended.sol`
- `nana-suckers-v6/src/interfaces/IJBSuckerRegistry.sol`
- `nana-suckers-v6/src/interfaces/IJBSwapCCIPSuckerDeployer.sol`
- `nana-suckers-v6/src/interfaces/IL1ArbitrumGateway.sol`
- `nana-suckers-v6/src/interfaces/IOPMessenger.sol`
- `nana-suckers-v6/src/interfaces/IOPStandardBridge.sol`
- `nana-suckers-v6/src/interfaces/IWrappedNativeToken.sol`
- `nana-suckers-v6/src/libraries/ARBAddresses.sol`
- `nana-suckers-v6/src/libraries/ARBChains.sol`
- `nana-suckers-v6/src/libraries/CCIPHelper.sol`
- `nana-suckers-v6/src/libraries/JBCCIPLib.sol`
- `nana-suckers-v6/src/libraries/JBRelayBeneficiary.sol`
- `nana-suckers-v6/src/libraries/JBSuckerLib.sol`
- `nana-suckers-v6/src/libraries/JBSwapLib.sol`
- `nana-suckers-v6/src/libraries/JBSwapPoolLib.sol`
- `nana-suckers-v6/src/structs/JBClaim.sol`
- `nana-suckers-v6/src/structs/JBDenominatedAmount.sol`
- `nana-suckers-v6/src/structs/JBInboxTreeRoot.sol`
- `nana-suckers-v6/src/structs/JBLeaf.sol`
- `nana-suckers-v6/src/structs/JBMessageRoot.sol`
- `nana-suckers-v6/src/structs/JBOutboxTree.sol`
- `nana-suckers-v6/src/structs/JBRemoteToken.sol`
- `nana-suckers-v6/src/structs/JBSuckerDeployerConfig.sol`
- `nana-suckers-v6/src/structs/JBSuckersPair.sol`
- `nana-suckers-v6/src/structs/JBTokenMapping.sol`
- `nana-suckers-v6/src/structs/PeerValueScratch.sol`
- `nana-suckers-v6/src/utils/MerkleLib.sol`

### `revnet-core-v6`

Evidence bucket: REVNET-TERM-01, REVNET-LOAN-01, REVNET-FEE-01, Revnet invariant/fork coverage, source-fee library,
and `test/formal/REVLoansHalmos.t.sol`.

- `revnet-core-v6/src/REVDeployer.sol`
- `revnet-core-v6/src/REVLoans.sol`
- `revnet-core-v6/src/REVOwner.sol`
- `revnet-core-v6/src/interfaces/IREVDeployer.sol`
- `revnet-core-v6/src/interfaces/IREVLoans.sol`
- `revnet-core-v6/src/interfaces/IREVOwner.sol`
- `revnet-core-v6/src/libraries/REVLoansSourceFees.sol`
- `revnet-core-v6/src/structs/REV721TiersHookFlags.sol`
- `revnet-core-v6/src/structs/REVAutoIssuance.sol`
- `revnet-core-v6/src/structs/REVBaseline721HookConfig.sol`
- `revnet-core-v6/src/structs/REVConfig.sol`
- `revnet-core-v6/src/structs/REVCroptopAllowedPost.sol`
- `revnet-core-v6/src/structs/REVDeploy721TiersHookConfig.sol`
- `revnet-core-v6/src/structs/REVDescription.sol`
- `revnet-core-v6/src/structs/REVLoan.sol`
- `revnet-core-v6/src/structs/REVStageConfig.sol`
- `revnet-core-v6/src/structs/REVSuckerDeploymentConfig.sol`

### `univ4-lp-split-hook-v6`

Evidence bucket: LP-SPLIT-01/02, invariant/fork coverage, helper library, and
`test/formal/JBUniswapV4LPSplitHookHalmos.t.sol`.

- `univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHook.sol`
- `univ4-lp-split-hook-v6/src/JBUniswapV4LPSplitHookDeployer.sol`
- `univ4-lp-split-hook-v6/src/interfaces/IJBUniswapV4LPSplitHook.sol`
- `univ4-lp-split-hook-v6/src/interfaces/IJBUniswapV4LPSplitHookDeployer.sol`
- `univ4-lp-split-hook-v6/src/libraries/JBLPSplitHookHelpers.sol`

### `univ4-router-v6`

Evidence bucket: ROUTER-UNI-01/02, invariant/V4 routing coverage, and `test/formal/OracleHalmos.t.sol`.

- `univ4-router-v6/src/JBUniswapV4Hook.sol`
- `univ4-router-v6/src/libraries/Oracle.sol`
