# Juicebox V6 EVM -- Ecosystem Risk Map

Cross-repo composition risks that span multiple contracts. Individual repo-level risks are documented in each subrepo's own `RISKS.md`.

For protocol architecture, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## 1. Cross-Boundary Trust Chains

These risks emerge from the composition of multiple repos, not from any single contract.

### Price feed → surplus → loans → LP positioning

- **Chain:** `JBPrices` (nana-core) → `JBTerminalStore.currentSurplusOf` (nana-core) → `REVLoans._borrowableAmountFrom` (revnet-core) → `JBUniswapV4LPSplitHook._getCashOutRate` (univ4-lp-split-hook)
- **Risk:** A stale or manipulated Chainlink feed affects surplus calculations in the terminal store. Surplus feeds into the revnet loan system's collateral valuation AND the LP split hook's tick range computation. A single bad price feed can simultaneously: (1) allow over-borrowing against inflated collateral, (2) position LP liquidity at incorrect tick ranges, and (3) miscalculate cross-currency payouts.
- **Blast radius:** Every revnet using cross-currency accounting + loans + LP split hook.
- **Individual mitigations:** Staleness thresholds in `JBChainlinkV3PriceFeed`, L2 sequencer checks, try-catch in `_totalBorrowedFrom` skipping zero-price feeds. But no circuit breaker spans the full chain.

### Data hook → buyback → V4 router → terminal

- **Chain:** `REVDeployer.beforePayRecordedWith` (revnet-core) → `JBBuybackHook.beforePayRecordedWith` (nana-buyback-hook) → `JBUniswapV4Hook._beforeSwap` (univ4-router) → `JBMultiTerminal.pay` (nana-core)
- **Risk:** The revnet deployer acts as a proxy data hook, delegating to the buyback hook, which queries the V4 router hook for TWAP comparison, which may route back through a JB terminal payment. This creates a 4-contract delegation chain where each layer transforms the payment context. A bug in any layer's weight/amount transformation propagates through the entire chain.
- **Reentrancy path:** V4 router hook routes through `terminal.pay()` → triggers `REVDeployer.beforePayRecordedWith` again → detects recursion via `_routing` reentrancy flag (regular storage) → reverts → caught by buyback hook try-catch → falls back to mint. This is tested and safe, but the 4-layer depth makes reasoning about state ordering difficult.

### Sucker registry → omnichain deployer → revnet deployer → 0% cashout

- **Chain:** `JBSuckerRegistry.isSuckerOf` (nana-suckers) → `JBOmnichainDeployer.beforeCashOutRecordedWith` (nana-omnichain-deployers) → `REVDeployer.beforeCashOutRecordedWith` (revnet-core)
- **Risk:** Both the omnichain deployer and revnet deployer grant 0% cashout tax to suckers identified by the registry. A compromised sucker registry entry affects every project across both deployer types simultaneously. The registry has `MAP_SUCKER_TOKEN` wildcard permission (`projectId=0`) from all three grantors (`JBOmnichainDeployer`, `CTDeployer`, and `REVDeployer`), meaning a single registry compromise has ecosystem-wide blast radius.
- **Defense depth:** Sucker deployment requires `DEPLOY_SUCKERS` permission + `suckerDeployerIsAllowed` allowlist check. But once deployed and registered, the sucker has permanent 0% cashout access.

### Controller migration → terminal migration → held fee escape

- **Chain:** Controller migration: `JBDirectory.setControllerOf` → `JBController.migrate`. Terminal migration: `JBMultiTerminal.migrateBalanceOf` (independent operation, not linked to controller migration).
- **Risk:** Terminal migration moves balances but intentionally does NOT migrate held fees (they belong to project #1). A project owner could migrate to a new terminal to escape held fee obligations — the old terminal retains the held fees but the project's balance is in the new terminal. The held fees eventually unlock and are processed, but they draw from the old terminal's balance which may now be zero.
- **Mitigation:** `processHeldFeesOf` returns fees to the project balance if the fee payment fails. But if the old terminal has zero balance, there's nothing to return. The fee is effectively forgiven.

## 2. Shared Singleton Risks

Contracts that serve as singletons across the ecosystem create correlated failure modes.

| Singleton | Used By | Failure Mode |
|-----------|---------|-------------|
| `JBBuybackHookRegistry` | All revnets from same deployer | Swap routing fails → all payments fall back to mint (economic inefficiency, not fund loss) |
| `JBUniswapV4Hook` | All V4 pools referencing it as hook | Oracle stops recording → TWAP stales → routing degradation across all pools |
| `JBSuckerRegistry` | All omnichain deployers + revnet deployers | False sucker registration → 0% cashout tax drain across all projects |
| `JBPrices` (default feeds) | All projects using cross-currency | Feed goes stale → all cross-currency operations halt |
| `REVDeployer` | All revnets from that deployer | Bug in `beforePayRecordedWith` → all revnet payments affected |
| `JB721TiersHookStore` | All 721 hooks (Defifa, Croptop, Banny, revnets) | Store bug → all NFT operations across all projects affected |
| `Sphinx Safe` (deployment) | All deployed contracts | Multisig compromise → total protocol control |

## 3. Permission Escalation Paths

### Wildcard permissions (`projectId=0`)

These contracts hold wildcard permissions that apply to ALL projects:

| Contract | Permission | Granted By | Risk |
|----------|-----------|-----------|------|
| `REVLoans` | `USE_ALLOWANCE` | `REVDeployer` constructor | Can draw surplus from ANY revnet's treasury |
| `JBSuckerRegistry` | `MAP_SUCKER_TOKEN` | `JBOmnichainDeployer` + `CTDeployer` + `REVDeployer` constructors | Can map tokens for ANY project |
| `CTPublisher` | `ADJUST_721_TIERS` | `CTDeployer` constructor (wildcard `projectId: 0`) | Can adjust tiers for ANY project |
| `OMNICHAIN_RULESET_OPERATOR` | `LAUNCH_RULESETS` + `QUEUE_RULESETS` + `SET_TERMINALS` | Hardcoded `alsoGrantAccessIf` bypass in `JBController` (not a `JBPermissions` wildcard grant) | Can queue rulesets for ANY project |

A vulnerability in any of these contracts has ecosystem-wide blast radius. Each should be audited at the highest scrutiny level.

### ROOT permission cascade

`ROOT` (permission ID 1) grants ALL permissions, including future ones. If ROOT is granted to a contract that is later found to have a vulnerability, the attacker inherits every permission in the system. ROOT cannot be set for wildcard `projectId=0` by operators (non-account callers), enforced by `setPermissionsFor` — but the account itself CAN set ROOT for wildcard `projectId=0`. This limits operator blast radius to individual projects. But a ROOT holder on project X cannot escalate to ROOT on project Y through any known path.

## 4. Cross-Chain Consistency Requirements

### Project ID alignment

Project IDs are assigned sequentially per chain. The deployment script (`deploy-all-v6`) creates projects in a fixed order to ensure IDs match across chains:
- Project 1: Fee project (NANA)
- Project 2: CPN
- Project 3: REV
- Project 4: BAN

If any chain's deployment diverges (extra `createFor` call, different ordering), project IDs shift and all cross-chain references break: sucker pairs route to wrong projects, auto-issuances target wrong beneficiaries, and loan collateral valuations use wrong project state.

### Sucker peer symmetry

For every `(chainA, chainB)` sucker pair, BOTH chains must have a sucker pointing to the other. If chain A has a sucker for chain B but chain B does not have the reciprocal sucker, tokens bridged from A→B can be claimed on B, but tokens cannot bridge back from B→A. This asymmetry is not detected at deploy time — it requires post-deployment verification.

### Price feed consistency

Each chain independently configures Chainlink feeds in `JBPrices`. If chain A uses a feed with 3600s staleness threshold and chain B uses the same feed with 86400s threshold, cross-chain surplus aggregation (via suckers) can produce inconsistent values. There is no mechanism to enforce cross-chain feed configuration parity.

## 5. Ecosystem Invariants

These should hold across the entire ecosystem, not just within individual contracts:

- **Total protocol fees (project #1 balance across all chains) monotonically increases** over time, excluding project #1's own payouts and cash-outs. Any decrease not attributable to these operations indicates a fee collection bug.
- **Cross-chain token supply conservation.** For any project with suckers: `sum(tokenSupply[chain]) == totalMinted - totalBurned` across all chains. Sucker bridging burns on source and mints on destination — the total should be conserved.
- **No cross-project fund leakage.** `sum(store.balanceOf(projectId, terminal, token)) <= terminal.balance(token)` for all terminals. The inequality accounts for held fees. Violation indicates cross-project balance corruption.
- **Singleton liveness.** If any singleton in section 2 reverts unconditionally, all dependent operations degrade to fallback behavior (mint instead of swap, local surplus instead of cross-terminal, etc.). No singleton failure should cause permanent fund loss — only economic inefficiency or operational halt.

---

Per-repo risk details: see each subrepo's `RISKS.md`.
