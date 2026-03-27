# N E M E S I S — Raw Findings

## Phase 0 — Nemesis Recon

**LANGUAGE:** Solidity

**ATTACK GOALS**
1. Reassign a constant so one granted permission silently authorizes a different action.
2. Misdocument a constant so downstream integrations grant a permission with a stronger blast radius than intended.
3. Break holder-vs-owner scoping so project owners can operate on holder-owned assets.
4. Break ROOT safety assumptions so delegated operators can escalate to global or wildcard control.

**NOVEL CODE (highest bug density)**
- `src/JBPermissionIds.sol` — hand-maintained append-only permission registry; bug density is in human-assigned numbering and comments, not runtime logic.

**VALUE STORES + INITIAL COUPLING HYPOTHESIS**
- No direct value stores in scope.
- Suspected coupled state at the protocol boundary:
  - constant name ↔ numeric ID
  - numeric ID ↔ downstream `_requirePermissionFrom` site
  - permission semantic ↔ `account` being checked (`holder` vs `PROJECTS.ownerOf(projectId)`)
  - dual-purpose ID ↔ both lock and set endpoints

**COMPLEX PATHS**
- Permission grant in `JBPermissions` → downstream `_requirePermissionFrom` in core/hooks/suckers.
- ROOT grant semantics in `JBPermissions.setPermissionsFor` → wildcard and delegation checks.

**PRIORITY ORDER**
1. Holder-scoped IDs `4/11/12/13` — wrong scoping would expose direct fund-moving rights.
2. ROOT (`1`) — incorrect wildcard/delegation semantics would compromise all projects.
3. Dual-purpose IDs `28/29` — comments must disclose lock authority accurately.
4. Sequential uniqueness of all 33 IDs — any collision silently corrupts authorization.

## Phase 1 — Unified Nemesis Map

| Constant | ID | Claimed Consumer(s) | Verified Consumer(s) | Sync Status |
|----------|----|----------------------|----------------------|-------------|
| `ROOT` | 1 | `JBPermissions` | `JBPermissions` root logic | SYNCED |
| `QUEUE_RULESETS` | 2 | `JBController.queueRulesetsOf` | `JBController.queueRulesetsOf`; deployer wrappers | SYNCED |
| `LAUNCH_RULESETS` | 3 | `JBController.launchRulesetsFor` | `JBController.launchRulesetsFor` | SYNCED |
| `CASH_OUT_TOKENS` | 4 | `JBMultiTerminal.cashOutTokensOf` | `JBMultiTerminal.cashOutTokensOf` with `account: holder` | SYNCED |
| `SEND_PAYOUTS` | 5 | `JBMultiTerminal.sendPayoutsOf` | privileged payout path in `_sendPayoutsOf` | SYNCED |
| `MIGRATE_TERMINAL` | 6 | `JBMultiTerminal.migrateBalanceOf` | `JBMultiTerminal.migrateBalanceOf` | SYNCED |
| `SET_PROJECT_URI` | 7 | `JBController.setUriOf` | `JBController.setUriOf` | SYNCED |
| `DEPLOY_ERC20` | 8 | `JBController.deployERC20For` | `JBController.deployERC20For` | SYNCED |
| `SET_TOKEN` | 9 | `JBController.setTokenFor` | `JBController.setTokenFor` | SYNCED |
| `MINT_TOKENS` | 10 | `JBController.mintTokensOf` | `JBController.mintTokensOf` | SYNCED |
| `BURN_TOKENS` | 11 | `JBController.burnTokensOf` | `JBController.burnTokensOf` with `account: holder` | SYNCED |
| `CLAIM_TOKENS` | 12 | `JBController.claimTokensFor` | `JBController.claimTokensFor` with `account: holder` | SYNCED |
| `TRANSFER_CREDITS` | 13 | `JBController.transferCreditsFrom` | `JBController.transferCreditsFrom` with `account: holder` | SYNCED |
| `SET_CONTROLLER` | 14 | `JBDirectory.setControllerOf` | `JBDirectory.setControllerOf` | SYNCED |
| `SET_TERMINALS` | 15 | `JBDirectory.setTerminalsOf` | `JBDirectory.setTerminalsOf`; also required by `launchRulesetsFor` | SYNCED |
| `SET_PRIMARY_TERMINAL` | 16 | `JBDirectory.setPrimaryTerminalOf` | `JBDirectory.setPrimaryTerminalOf` | SYNCED |
| `USE_ALLOWANCE` | 17 | `JBMultiTerminal.useAllowanceOf` | `JBMultiTerminal.useAllowanceOf` | SYNCED |
| `SET_SPLIT_GROUPS` | 18 | `JBController.setSplitGroupsOf` | `JBController.setSplitGroupsOf` | SYNCED |
| `ADD_PRICE_FEED` | 19 | `JBController.addPriceFeedFor` | `JBController.addPriceFeedFor` | SYNCED |
| `ADD_ACCOUNTING_CONTEXTS` | 20 | `JBMultiTerminal.addAccountingContextsFor` | `JBMultiTerminal.addAccountingContextsFor` | SYNCED |
| `SET_TOKEN_METADATA` | 21 | `JBController.setTokenMetadataOf` | `JBController.setTokenMetadataOf` | SYNCED |
| `ADJUST_721_TIERS` | 22 | `JB721TiersHook.adjustTiers` | `JB721TiersHook.adjustTiers` | SYNCED |
| `SET_721_METADATA` | 23 | `JB721TiersHook.setMetadata` | `JB721TiersHook.setMetadata` | SYNCED |
| `MINT_721` | 24 | `JB721TiersHook.mintFor` | `JB721TiersHook.mintFor` | SYNCED |
| `SET_721_DISCOUNT_PERCENT` | 25 | `JB721TiersHook.setDiscountPercentOf` | both single and batch discount setters | SYNCED |
| `SET_BUYBACK_TWAP` | 26 | `JBBuybackHook.setTwapWindowOf` | `JBBuybackHook.setTwapWindowOf` | SYNCED |
| `SET_BUYBACK_POOL` | 27 | `JBBuybackHook.setPoolFor` | buyback hook pool setters/init | SYNCED |
| `SET_BUYBACK_HOOK` | 28 | `setHookFor` + `lockHookFor` | both registry endpoints | SYNCED |
| `SET_ROUTER_TERMINAL` | 29 | `setTerminalFor` + `lockTerminalFor` | both router registry endpoints | SYNCED |
| `MAP_SUCKER_TOKEN` | 30 | `JBSucker.mapToken` | `JBSucker._mapToken` | SYNCED |
| `DEPLOY_SUCKERS` | 31 | `JBSuckerRegistry.deploySuckersFor` | `JBSuckerRegistry.deploySuckersFor` | SYNCED |
| `SUCKER_SAFETY` | 32 | `JBSucker.enableEmergencyHatchFor` | `JBSucker.enableEmergencyHatchFor` | SYNCED |
| `SET_SUCKER_DEPRECATION` | 33 | `JBSucker.setDeprecation` | `JBSucker.setDeprecation` | SYNCED |

## Pass 1 — Feynman Raw Output

### Suspects
- None.

### Exposed Assumptions
- The library assumes all permission semantics are enforced in downstream contracts, not locally.
- The safety of `ROOT` depends entirely on `JBPermissions`, not on this repo.
- The safety of holder-scoped IDs depends on downstream call sites passing `holder` as `account`.

### Ordering Concerns
- None in-repo. No executable code.

## Pass 2 — State Inconsistency Raw Output

### Coupled State Dependency Map
- `constant symbol` ↔ `downstream permission site`
- `permission meaning` ↔ `account argument target`
- `lock/set pair comments` ↔ `paired downstream endpoints`

### Mutation Matrix
- None in-repo. Constants are immutable.

### Gaps
- None.

### Masking Code
- None in scope.

## Convergence
- Pass 1 produced no exploitable suspects.
- Pass 2 found no semantic coupling gaps.
- No delta existed for Pass 3, so the loop converged after the two full baseline passes.

## Raw Finding Count
- 0 CRITICAL
- 0 HIGH
- 0 MEDIUM
- 0 LOW
