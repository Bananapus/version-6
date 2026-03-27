# N E M E S I S — Raw Findings

## Phase 0 — Nemesis Recon

**Language:** Solidity 0.8.26

**Attack goals**
1. Break Croptop posting so a project can no longer mint or configure posts.
2. Extract or bypass the 5% mint fee by desynchronizing price, tier, or payment state.
3. Abuse the sucker/data-hook boundary to obtain fee-free cash-outs or unauthorized mint authority.

**Novel code**
- `src/CTPublisher.sol` — custom fee routing, URI-to-tier caching, and posting-criteria packing.
- `src/CTDeployer.sol` — ownership handoff + data-hook proxy + sucker privilege bridge.
- `script/ConfigureFeeProject.s.sol` — multi-system deployment/config wiring across Croptop, Revnet, router terminal, and suckers.

**Value stores + initial coupling hypothesis**
- `CTPublisher` holds transient ETH during `mintFrom`.
  - Outflows: project terminal payment, fee-project terminal payment.
  - Suspected coupled state: `totalPrice`, fee math, cached tier prices, contract ETH balance.
- `CTDeployer` holds project ownership briefly during deployment.
  - Outflows: `PROJECTS.transferFrom(address(this), owner, projectId)`.
  - Suspected coupled state: hook ownership, publisher permissions, `dataHookOf`.
- `CTProjectOwner` permanently holds project NFTs.
  - Outflows: none.
  - Suspected coupled state: project ownership, publisher permission grants.

**Complex paths**
- `deployProjectFor -> launchProjectFor -> dataHookOf set -> configurePostingCriteriaFor -> deploySuckersFor -> transfer project NFT`
- `mintFrom -> _setupPosts -> adjustTiers -> terminal.pay -> fee project pay`
- `claimCollectionOwnershipOf -> JBOwnable.transferOwnershipToProject -> later publisher permission checks`

**Priority order**
1. `CTDeployer` ownership and hook/data-hook coupling
2. `CTPublisher` fee and tier-cache accounting
3. Deployment scripts and fee-project configuration ordering

## Phase 1 — Dual Mapping

### 1A Function-State Matrix
| Function | Reads | Writes | Guards | External Calls |
|----|----|----|----|----|
| `CTPublisher.configurePostingCriteriaFor` | hook owner, projectId, allowed post params | packed allowance, allowlist | `ADJUST_721_TIERS` | hook owner + projectId lookups |
| `CTPublisher.mintFrom` | hook projectId, store prices, fee project id, terminals | URI->tier cache through `_setupPosts` | category/allowlist constraints | `adjustTiers`, `terminal.pay` x2 |
| `CTDeployer.beforeCashOutRecordedWith` | sucker registry, `dataHookOf` | none | none | data hook forwarding |
| `CTDeployer.beforePayRecordedWith` | `dataHookOf` | none | none | data hook forwarding |
| `CTDeployer.claimCollectionOwnershipOf` | hook projectId, project owner | none | project NFT owner | `transferOwnershipToProject` |
| `CTDeployer.deployProjectFor` | projects count, config | `dataHookOf[projectId]` | controller consistency | hook deployer, controller, publisher, sucker registry, projects |
| `CTProjectOwner.onERC721Received` | tokenId, caller | JB permission bitmap | caller must be `PROJECTS` | `setPermissionsFor` |

### 1B Coupled State Dependency Map
| Pair | Invariant | Mutation points |
|----|----|----|
| Hook owner ↔ publisher permission authority | publisher authorization must be sourced from the current hook owner | `deployProjectFor`, `claimCollectionOwnershipOf` |
| `dataHookOf[projectId]` ↔ ruleset data-hook flags | proxy forwarding target must match active ruleset expectation | `deployProjectFor` |
| `tierIdForEncodedIPFSUriOf` ↔ store tier existence | cached URI must point to live tier or be cleared | `_setupPosts` |
| `_packedAllowanceFor` ↔ `_allowedAddresses` | category policy is threshold + address gating together | `configurePostingCriteriaFor` |

### 1C Cross-Reference
| Function | Writes A | Writes B | A↔B Pair | Sync Status |
|----|----|----|----|----|
| `deployProjectFor()` | hook owner authority source | publisher permission source | owner↔permission | SYNCED |
| `claimCollectionOwnershipOf()` | hook owner authority source | publisher permission source | owner↔permission | GAP |
| `_setupPosts()` | URI cache | tier store reference coherence | uri↔tier liveness | SYNCED via stale-tier cleanup |
| `configurePostingCriteriaFor()` | packed thresholds | allowlist | packed↔allowlist | SYNCED |

## Phase 2 — Feynman Pass 1

### Raw Suspects
1. `claimCollectionOwnershipOf()` changes hook ownership without migrating `CTPublisher` permissions.
2. `maximumTotalSupply == 0` is documented as unlimited but rejected by validation.
3. Data-hook proxy may revert if `dataHookOf[projectId]` is unset or underlying hook reverts.
4. `script/Deploy.s.sol` may create an orphan fee project on reruns before checking whether contracts already exist.

## Phase 3 — State Pass 2

### Confirmed Gaps
1. **Owner/permission desync**
   - `deployProjectFor()` grants permissions from `CTDeployer`.
   - `claimCollectionOwnershipOf()` switches owner resolution to the project.
   - No counterpart permission update exists.

### Rejected/unclear items
1. `dataHookOf[projectId] == address(0)` is not reachable for successfully deployed projects in normal flow.
2. `tierIdForEncodedIPFSUriOf` stale mappings are explicitly cleaned when removed tiers are encountered.

## Phase 4 — Feedback Loop

### Pass 3 Feynman re-interrogation
- Why does claim not migrate permissions? Because all earlier grants are scoped to `account: address(this)` in `deployProjectFor()`, while later checks resolve `account` from `JBOwnable.owner()`.
- What breaks downstream? Both posting-criteria updates and `mintFrom()` via `adjustTiers`.

### Pass 4 State re-analysis
- No additional coupled pairs surfaced from the confirmed owner/permission desync.
- No new mutation paths found beyond the claim path.

## Raw Findings Ledger
| ID | Severity | Status | Note |
|----|----|----|----|
| NM-R1 | MEDIUM | VERIFIED | ownership claim breaks publisher authorization |
| NM-R2 | LOW | VERIFIED | unlimited max-supply sentinel is non-functional |
| NM-R3 | MEDIUM | FALSE POSITIVE | data-hook proxy unset/permanent brick |
| NM-R4 | LOW | DOWNGRADED | deploy rerun creates orphan fee project, no live-contract compromise |
