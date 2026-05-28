# Invariants of Revnets 1–7

Last updated: 2026-05-27.

Scope: the seven projects deployed by `deploy-all-v6/script/Deploy.s.sol` once that script completes and the projects begin receiving payments.

| # | Name | Currency | Cash-out tax | Suckers | Notes |
|---|------|----------|--------------|---------|-------|
| 1 | NANA | ETH | 10% | all chains | Fee project (recipient of 2.5% protocol fees) |
| 2 | CPN  | ETH | 10% | all chains | Croptop 721 tier hook + 5 allowed posts |
| 3 | REV  | ETH | 10% | all chains | $REV token; 3-stage ruleset |
| 4 | BAN  | ETH | 10% | all chains | Banny 721 hook + Banny721TokenUriResolver |
| 5 | DEFIFA | USD-denominated, ETH-paid | 10% | all chains | Defifa game contracts live in a separate hook ecosystem |
| 6 | ART  | USD-denominated, ETH-paid | 10% | Base only | Off-Base = placeholder NFT, no controller |
| 7 | MARKEE | ETH | 10% | all chains | 3-stage ruleset |

All seven projects are owned by the singleton `REVOwner` contract (except project 6's off-Base placeholder, owned by the ART operator EOA). Each project's per-revnet operator is the only address that can rotate cosmetic project state.

---

# Per-Repo INVARIANTS.md (Authoritative References)

This top-level document focuses on what is **specific to the seven revnets deployed by `deploy-all-v6/script/Deploy.s.sol`**: how their stages compose, who can do what to them, and the cross-cutting properties that emerge from the overall configuration.

The **per-contract** mechanics (what each function does, who can call it, what invariant it preserves) live in a scoped `INVARIANTS.md` at the root of each submodule. Each per-repo doc is the canonical source for its contracts; this hub-and-spoke layout keeps the top-level focused while letting each repo own its details.

| Repo | Scope | Relevance to revnets 1–7 |
|------|-------|---------------------------|
| [nana-core-v6](./nana-core-v6/INVARIANTS.md) | JB V6 core protocol — terminal, controller, store, rulesets, tokens, splits, permissions, prices, projects | Every revnet rides on these contracts; ruleset freeze, fee accounting, cashout bonding curve, permission gating all derive here |
| [nana-suckers-v6](./nana-suckers-v6/INVARIANTS.md) | Cross-chain bridge primitives (dual-tree merkle, OP/Arb/CCIP variants, registry) | Bridges revnets 1–5 and 7 across all chains; project 6 uses Base-only |
| [revnet-core-v6](./revnet-core-v6/INVARIANTS.md) (+ [ARBITRAGE.md](./revnet-core-v6/ARBITRAGE.md)) | Revnet protocol — `REVDeployer`, `REVOwner`, `REVLoans`, data-hook orchestration | Defines the operator permission set, project ownership singleton, auto-issuance, REVLoans, cashout-delay, cross-chain aggregation |
| [nana-buyback-hook-v6](./nana-buyback-hook-v6/INVARIANTS.md) | AMM-vs-mint routing buyback hook + registry | Routes payments to revnets 1–7 via Uniswap V4 when buyback beats direct mint |
| [nana-721-hook-v6](./nana-721-hook-v6/INVARIANTS.md) | NFT tiers data hook + store + project deployer | Powers CPN (project 2) and BAN (project 4) tier issuance and split routing |
| [nana-router-terminal-v6](./nana-router-terminal-v6/INVARIANTS.md) | Multi-token routing terminal + registry + route resolver | Optional terminal-of-record that lets payers fund a revnet with any token |
| [nana-omnichain-deployers-v6](./nana-omnichain-deployers-v6/INVARIANTS.md) | Cross-chain project launcher with `OMNICHAIN_RULESET_OPERATOR` bypass | Launches revnets 1–7 with deterministic CREATE3 addressing and sucker wiring |
| [nana-distributor-v6](./nana-distributor-v6/INVARIANTS.md) | Per-hook reward distribution + vesting (base + IVotes + 721 variants) | Used by `JBReferralSplitHook` to disburse referral credits to IVotes holders |
| [nana-referral-split-hook-v6](./nana-referral-split-hook-v6/INVARIANTS.md) | Cross-chain referral attribution split hook | Receives referral splits from the fee project (project 1) and routes credit across chains |
| [nana-project-payer-v6](./nana-project-payer-v6/INVARIANTS.md) | Cloneable per-user pay forwarder | Wrapper contracts payers can use to bind a default project/beneficiary |
| [nana-ownable-v6](./nana-ownable-v6/INVARIANTS.md) | Project-NFT ownership delegation | Pattern used by `REVOwner` and `CTProjectOwner` |
| [nana-permission-ids-v6](./nana-permission-ids-v6/INVARIANTS.md) | Permission ID constants | Numbering authority for every permission referenced throughout this doc |
| [nana-address-registry-v6](./nana-address-registry-v6/INVARIANTS.md) | Deployer-provenance registry | Provenance lookups for integrations that need to trust a contract's deployer |
| [nana-project-handles-v6](./nana-project-handles-v6/INVARIANTS.md) | Permissionless verifiable-claims handle registry | Out-of-protocol identity layer; does not gate protocol value flow |
| [nana-fee-project-deployer-v6](./nana-fee-project-deployer-v6/INVARIANTS.md) | Fee project deployment script | One-shot deployment of the NANA fee project (project 1) |
| [croptop-core-v6](./croptop-core-v6/INVARIANTS.md) | Permissionless social-posting layer (CTPublisher / CTDeployer / CTProjectOwner) | Powers CPN (project 2) posts and tier auto-creation |
| [banny-retail-v6](./banny-retail-v6/INVARIANTS.md) | Banny NFT body/outfit decoration resolver | Powers BAN (project 4) wearables and the `Banny721TokenUriResolver` |
| [defifa](./defifa/INVARIANTS.md) (+ [CRYPTO_ECON.md](./defifa/CRYPTO_ECON.md)) | Sports-prediction game contracts (deployer/governor/hook) | Powers DEFIFA (project 5) game lifecycle, BWA voting, and commitment fulfillment |

When reasoning about a specific contract's invariants, **the per-repo doc is the source of truth**. This document defers to it and only summarizes the cross-revnet composition properties.

---

# Section A — Guarantees to Paying Users

## A.1 Issuance & accounting

- A payment of `X` ETH mints exactly `weight × X` tokens (modulo bonding-curve / buyback-hook / 721-tier-split rules below); no party — operator, deployer, infra owner, or third-party — can alter the configured `weight` of any stage after deploy. **No entity holds `LAUNCH_RULESETS` or `QUEUE_RULESETS` permission on these projects after the deploy script finishes.**
- Rulesets are **frozen for the life of each revnet's pre-configured stages**: `cashOutTaxRate`, `weight`, `reservedPercent`, `baseCurrency`, `dataHook`, and metadata flags are immutable post-deploy.
- The buyback hook routes a payment through Uniswap V4 only if the resulting amount is **at least as many tokens** as the bonding-curve mint path would produce; otherwise it falls back to mint. The payer never receives fewer tokens than the bonding-curve baseline.
- USD-denominated revnets (5, 6) compute the mint amount using a Chainlink price feed with a 1-hour staleness threshold, plus an L2 sequencer-uptime check on Optimism, Arbitrum, and Base.
- The protocol fee is fixed at 2.5%. The fee is held for 28 days before forwarding to the NANA fee project (project 1) and is refundable to the originating project on cashout within that window.
- Total project token supply = `creditSupply + ERC20.totalSupply()`; credits and ERC-20 cannot diverge.

## A.2 Cash-out & exit

- Cashing out is always available on the same terminal that accepted payment, as long as the Chainlink feeds the project depends on (USD revnets only) are live.
- The cashout reclaim formula `base × [(MAX − tax) + tax × (count/supply)] / MAX` is fixed per stage; no party can change the tax rate or curve shape for an existing stage.
- Cashing out burns the user's project tokens **before** transferring reclaim, blocking double-cashout via reentrancy.
- A failed cashout hook does not strand funds: the cashout proceeds to the beneficiary first, then hooks fire via try/catch with balance return on failure.
- Bridged tokens (via suckers) preserve 1:1 value with the source-chain project tokens. The dual-tree merkle design prevents double-claims (`executedFor` bitmap + per-leaf hash check).
- `claim` on a sucker can only mint to the beneficiary encoded in the merkle leaf. A third party calling `claim` cannot redirect tokens to themselves.
- Bridged claims cannot be "stolen" by a front-running EOA: `JBReferralSplitHook` (the only known contract-as-beneficiary) re-derives the leaf hash from caller-supplied data and rejects forged claim data.
- Cross-chain bridging cannot be re-routed mid-flight: once a token mapping has any outbox entries, the mapping is immutable (can only be disabled, never remapped).
- Sucker emergency exit and deprecation paths require a 14-day delay; users have time to exit before any operator-initiated sucker shutdown completes.

## A.3 Token & supply integrity

- No address can mint tokens beyond:
  - normal pay-driven issuance at the configured weight,
  - the configured reserved-token percentage (operator splits),
  - the configured auto-issuance allocations (one-shot per chain, predefined recipient and amount),
  - the buyback-hook fulfillment (which the hook itself constrains to its swap output + leftover mint).
- The operator **cannot mint at will**: `allowOwnerMinting` is `false` for projects 2–7 by default; for project 1 (NANA), even owner-mint requires the project NFT holder (REVOwner) to invoke it, and REVOwner exposes no public mint endpoint.
- Reserved tokens dilute `totalSupply` and therefore reduce per-token cashout value (documented finding H-4). Users should call `sendReservedTokensToSplitsOf` (permissionless) before cashing out to reflect the dilution they already implicitly suffered.

## A.4 Protections against external interference

- A third-party EOA **cannot**: drain the project's treasury, mint tokens to themselves, replace the data hook, add a malicious terminal, queue a new ruleset, change the cashout tax rate, redirect splits, replace the project NFT owner, manipulate the Chainlink price feed registration, take over the buyback Uniswap pool, or impersonate the omnichain ruleset operator.
- REVLoans can only be opened against the borrower's own collateral (`OPEN_LOAN` permission on `holder`), and is capped by actual terminal surplus on each call. Flash-loan-style surplus inflation against an open loan is proven net-negative.
- Pay/cashout hooks running on user payments are wrapped in try/catch where appropriate; a faulty hook cannot strand a payment that has already been recorded.
- `processHeldFeesOf` is permissionless after the 28-day hold but uses the **stored** beneficiary and feeless-list state at the time of fee creation — a third party calling it cannot redirect held fees.

---

# Section B — Guarantees to the Operator

## B.1 Powers the operator retains (per their revnet)

Granted via the merged permission set in `REVOwner._operatorPermissionIndexesOf` (`REVOwner.sol:806-815`):

- **Rotate splits.** `SET_SPLIT_GROUPS` permission lets the operator replace the reserved-token splits at any time, for any ruleset.
- **Rotate buyback pool & TWAP window.** `SET_BUYBACK_POOL`, `SET_BUYBACK_TWAP`, and `SET_BUYBACK_HOOK` let the operator point buyback at a different Uniswap V4 pool or swap the hook entirely.
- **Set project URI.** `SET_PROJECT_URI` lets the operator change metadata pointers.
- **Set token metadata.** `SET_TOKEN_METADATA` lets the operator change the project token's display metadata.
- **Sign for the project's ERC-20.** `SIGN_FOR_ERC20` for EIP-712 / Permit2 use cases involving the project token.
- **Rotate the operator.** The current operator can hand off via `REVOwner.setOperatorOf(revnetId, newOperator)`.
- **Configure the router terminal.** `SET_ROUTER_TERMINAL` for `JBRouterTerminal` swap routing settings.
- **Trigger sucker safety paths.** `SUCKER_SAFETY` enables the emergency hatch for stuck tokens.
- **Deprecate suckers.** `SET_SUCKER_DEPRECATION` (with 14-day delay) to wind down bridges.
- **Deploy new suckers.** Indirect: the operator can call `REVDeployer.deploySuckersFor` on their own revnet to add bridges to additional chains.

## B.2 Powers the operator does NOT have

- **No control over rulesets.** Operators cannot queue new rulesets, change cashout tax rate, change weight, change reserved percent, change the data hook, or add/remove pay/cashout hooks. The ruleset chain is set in stone by the launch.
- **No control over terminals.** Operators cannot add or remove terminals or change accounting contexts.
- **No control over project ownership.** The project NFT is owned by REVOwner (a singleton), not the operator. The operator cannot transfer the NFT or set a new controller.
- **No direct mint authority.** Operators cannot mint tokens directly. The only operator-initiated issuance comes through `sendReservedTokensToSplitsOf` (which mints the already-reserved share) and pre-configured auto-issuance.
- **No access to the project's treasury beyond configured payouts/loans.** Operators cannot call `useAllowanceOf`, `migrateBalanceOf`, or arbitrary `sendPayoutsOf` outside the pre-set `fundAccessLimitGroups` (which for revnets 1–7 are unlimited surplus allowance for REVLoans only; payout limits are zero, meaning operator-initiated payouts are not the channel by which value leaves).
- **No control over price feeds.** Project-specific feed registration requires `JBController` access (the operator does not control the controller). Default-feed changes require `_CRITICAL_INFRA_OWNER`.
- **No control over feeless-address registry.** The 2.5% fee applies to the operator's revnet regardless of who calls cash-out, unless the called/calling address is on the feeless registry (controlled by `_CRITICAL_INFRA_OWNER`).

## B.3 Guarantees about value flow

- **Reserved-token distribution.** When `sendReservedTokensToSplitsOf` runs (permissionless), the operator's share of newly-minted reserved tokens is delivered to the addresses configured in the operator's split list, in the proportions configured.
  - NANA stage 0: 62.00% reserved (`splitPercent = 6200`)
  - REV, CPN, BAN s0–1, DEFIFA s0–1, MARKEE: 38.00% reserved
  - ART: 40.00% reserved
  - Later stages decay (BAN s2 = 0, DEFIFA s2 = 0)
- **Bonding-curve floor.** Cashouts always pay the curve formula. With 10% tax across all seven projects, a small holder reclaims ~90% of pro-rata surplus; a holder cashing out the entire supply reclaims 100%.
- **Treasury accumulation.** Surplus that exceeds payout limits accumulates and is reclaimable only via (a) cashout by token holders, (b) REVLoans against project tokens, or (c) future operator-configured payout limits — which require a new ruleset, which cannot be queued. **Locked-in treasury is locked in.**
- **Sucker conservation.** Bridged value is conserved across the dual-tree design.
- **Operator-mediated buyback never gives the operator a free mint.** The buyback hook can only mint when fulfilling a user payment, and only up to the issuance the user would have received from the bonding-curve mint path.

## B.4 Liveness guarantees

- **Payments cannot be blocked by external parties.** No third party can DoS `pay()` or `cashOutTokensOf()` on revnets 1–7 (ETH payments don't need the price feed; USD-denominated revnets 5 & 6 require a live Chainlink ETH/USD feed to pay, but cashout reclaim in ETH does not consult the feed).
- **Buyback pool front-running.** A pre-deploy attacker can squat the canonical Uniswap V4 PoolKey for a freshly-minted revnet token; the deploy script catches this and ships the revnet without buyback routing. Buyback can later be enabled on a different fee tier by the operator via `SET_BUYBACK_POOL`.
- **`sendPayoutsOf`, `sendReservedTokensToSplitsOf`, `processHeldFeesOf`** are all permissionless and never lose funds; the worst a third party can do is force the operator's preconfigured splits to settle earlier than the operator chose.

---

# Section C — Per-Contract Operation Inventory (Pointers)

Per-contract operation inventories (external/public functions grouped by role, with caller, effect, and the invariant each operation preserves) live in the per-repo `INVARIANTS.md` files linked above. This section maps each contract area to its canonical source so reviewers know exactly where to look.

## C.1 Core protocol (terminal, controller, store, directory, tokens, splits, rulesets, permissions, prices, projects)

`JBMultiTerminal`, `JBController`, `JBTerminalStore`, `JBDirectory`, `JBTokens`, `JBSplits`, `JBRulesets`, `JBPermissions`, `JBPrices`, `JBProjects`, `JBFundAccessLimits`, `JBFeelessAddresses`, `JBERC20` — see [`./nana-core-v6/INVARIANTS.md`](./nana-core-v6/INVARIANTS.md). These are the bedrock contracts: every payment, cashout, payout, fee, ruleset queue, mint, burn, and permission grant on revnets 1–7 flows through them. The 2.5% fee with 28-day hold, the bonding-curve reclaim, the credit-then-ERC-20 burn order, and the `LAUNCH_RULESETS`/`QUEUE_RULESETS` auth matrix are all defined there.

## C.2 Buyback hook

`JBBuybackHook` and `JBBuybackHookRegistry` — see [`./nana-buyback-hook-v6/INVARIANTS.md`](./nana-buyback-hook-v6/INVARIANTS.md). Routes payments to Uniswap V4 when (and only when) the pool quote beats direct mint. Front-run-resistant pool initialization, cohort-stable default-hook history, and the "payer never receives fewer tokens than direct mint" floor are documented there.

## C.3 Uniswap V4 hook + router terminal

`JBUniswapV4Hook` (canonical V4 hook), `JBRouterTerminal`, `JBRouterTerminalRegistry`, `JBPayRouteResolver` — see [`./nana-router-terminal-v6/INVARIANTS.md`](./nana-router-terminal-v6/INVARIANTS.md). Multi-token routing with JB-aware comparison; circular-forward rejection, balance-delta accounting, and `originalPayer` transient propagation are documented there.

## C.4 721 tiers hook

`JB721TiersHook`, `JB721TiersHookStore`, `JB721TiersHookProjectDeployer` — see [`./nana-721-hook-v6/INVARIANTS.md`](./nana-721-hook-v6/INVARIANTS.md). Tier minting, discount adjustments, pending-reserve enforcement, transfer-pause gating, and the "original tier price drives cashout weight" invariant are documented there.

## C.5 Croptop

`CTPublisher`, `CTDeployer`, `CTProjectOwner` — see [`./croptop-core-v6/INVARIANTS.md`](./croptop-core-v6/INVARIANTS.md). Permissionless posting bounded by per-`(hook, category)` allowance criteria; CTProjectOwner permanently retains the project NFT while delegating tier-adjustment permission to CTPublisher.

## C.6 Banny

`Banny721TokenUriResolver` — see [`./banny-retail-v6/INVARIANTS.md`](./banny-retail-v6/INVARIANTS.md). Decoration ownership checks, outfit-lock monotonicity, hash-precommitted SVG publication, and the body-as-carrier model are documented there.

## C.7 REVLoans, REVOwner, REVDeployer

`REVLoans`, `REVOwner`, `REVDeployer` — see [`./revnet-core-v6/INVARIANTS.md`](./revnet-core-v6/INVARIANTS.md) (+ [`./revnet-core-v6/ARBITRAGE.md`](./revnet-core-v6/ARBITRAGE.md) for the cross-chain arbitrage model). Operator permission set, project NFT singleton ownership, auto-issuance one-shot, REVLoans collateral burn-and-remint, cashout-delay gating, and the data-hook callbacks that aggregate cross-chain supply/surplus are all documented there.

## C.8 Suckers

`JBSucker` (base + OP / Arb / CCIP variants) and `JBSuckerRegistry` — see [`./nana-suckers-v6/INVARIANTS.md`](./nana-suckers-v6/INVARIANTS.md). Dual-tree merkle accounting, per-leaf hash anti-front-run defense, immutable-once-used token mapping, mandatory 14-day deprecation delay, and chain-specific messenger verification are documented there.

## C.9 Distributors

`JBDistributor` (base), `JBTokenDistributor` (IVotes), `JB721Distributor` — see [`./nana-distributor-v6/INVARIANTS.md`](./nana-distributor-v6/INVARIANTS.md). Per-hook reward pots, snapshot-based pro-rata allocation, vesting rounds, borrow-against-vesting, and the permissionless-but-ownership-gated claim model are documented there.

## C.10 Omnichain deployer

`JBOmnichainDeployer` — see [`./nana-omnichain-deployers-v6/INVARIANTS.md`](./nana-omnichain-deployers-v6/INVARIANTS.md). Project launch with deterministic salt, sucker deployment, and the `OMNICHAIN_RULESET_OPERATOR` bypass back-stop (`_requirePermissionFrom(PROJECTS.ownerOf(projectId))`) are documented there.

## C.11 Defifa

`DefifaDeployer`, `DefifaGovernor`, `DefifaHook` — see [`./defifa/INVARIANTS.md`](./defifa/INVARIANTS.md) (+ [`./defifa/CRYPTO_ECON.md`](./defifa/CRYPTO_ECON.md) for the game economics). Phase machine (COUNTDOWN → MINT → REFUND → SCORING → COMPLETE, with NO_CONTEST short-circuit), BWA self-attestation gate, single-ratification, and commitment-fulfillment one-shot are documented there.

## C.12 Referral split hook

`JBReferralSplitHook` — see [`./nana-referral-split-hook-v6/INVARIANTS.md`](./nana-referral-split-hook-v6/INVARIANTS.md). Same-chain `pushTo` HWM monotonicity, cross-chain `bridgeRemote` via registered sucker, `claimAndPush` per-leaf hash authentication against `sucker.claim` front-running, and the anti-strand burn path for missing local twins are documented there.

## C.13 Project payer

`JBProjectPayer` — see [`./nana-project-payer-v6/INVARIANTS.md`](./nana-project-payer-v6/INVARIANTS.md). Cloneable per-payer wrapper that binds default project/beneficiary, sets `originalPayer` transient for downstream router authentication, and rejects `msg.value` on ERC-20 paths.

---

# Section D — Cross-Cutting Invariants

1. **Best-execution floor.** Every paying/cashout entrypoint enforces a user-specified minimum measured by balance delta on the beneficiary side. Fee-on-transfer tokens cannot silently degrade realized output below what the user signed.
2. **Front-run-resistant initialization.** `JBBuybackHook.initializePoolFor` reverts if the actual on-chain price ≠ expected. Defeats CREATE2-predicted pre-initialization at attacker-chosen tick.
3. **Cohort-stable defaults.** Registry default changes never retroactively reroute existing projects. `_defaultHookHistory` and `_defaultTerminalHistory` snapshots pin each cohort to its creation-time default.
4. **Circular-forward rejection.** `JBRouterTerminalRegistry` rejects not just one-hop but transitive forwarding cycles via `JBForwardingCheck` before any irreversible lock.
5. **Balance-delta accounting everywhere.** Pre-existing balances on hooks/routers are never swept; only deltas produced by *this* execution move. Stranded-token attacks blocked.
6. **One-shot deployer setters.** `setChainSpecificConstants` (buyback hook, router terminal, Defifa deployer), `REVOwner.setDeployer`, `JBProjectPayer.initialize`, `DefifaGovernor.initializeGame`, `DefifaHook.initialize`/`setTierCashOutWeightsTo` — all one-time bindings, irreversible.
7. **Reentrancy discipline without ReentrancyGuard.** State writes precede external calls (`processHeldFeesOf` advances index before fee call; `pushTo`/`bridgeRemote` advance HWM before external call; `REVOwner.autoIssueFor` zeroes before mint). Transient `_acceptingToken` / `_routing` guards block specific callback chains. `nonReentrantLoanAction` (transient) gates REVLoans.
8. **Sucker holders always get 0% cashout tax** (REVOwner, JBOmnichainDeployer, CTDeployer). Keeps bridge accounting loss-less.
9. **HWM monotonicity** (JBReferralSplitHook). `bridgedOutOf` and `pushedLocallyOf` advance before any external call; burns are permanent.
10. **Permissionless settlement triggers never extract beyond canonical allocation.** `autoIssueFor`, `burnHeldTokensOf`, `fulfillCommitmentsOf`, `triggerNoContestFor`, `bridgeRemote`, `claimAndPush`, `burnUnbridgeableCreditFor`, `pushTo`, `processHeldFeesOf`, `sendPayoutsOf`, `sendReservedTokensToSplitsOf` — caller can never extract value beyond what config authorizes.
11. **Defifa phase gating.** MINT/REFUND/COUNTDOWN driven by ruleset cycle number; NO_CONTEST latched by `triggerNoContestFor`; COMPLETE latched by `cashOutWeightIsSet`. Reserve mints blocked in NO_CONTEST. Delegate changes restricted to MINT.
12. **BWA voting** (DefifaGovernor). Beneficiaries cannot self-attest at full power; concentration-adjusted quorum prevents one tier from rubber-stamping; revocation disabled after QUEUED.
13. **Frozen rulesets post-deploy.** No address holds `LAUNCH_RULESETS` or `QUEUE_RULESETS` for revnets 1–7 after `Deploy.s.sol` completes — the load-bearing invariant that closes the largest attack class.

---

# Section D2 — Cross-Chain Arbitrage Model

This section explains why **cross-chain backing-per-token divergence is an expected feature, not a bug**, and where the line is drawn between healthy arbitrage equilibration and an actual protocol invariant violation.

## D2.1 Premise

A revnet that spans multiple chains will see its **backing-per-token** (local-surplus ÷ local-supply) diverge across chains. This is normal and structurally inevitable, arising from:

- **Cashout-tax residue** — tax kept on the cashing chain inflates that chain's surplus.
- **`addToBalanceOf` donations** — surplus added to one chain without minting.
- **Auto-issuance asymmetries** — `autoIssueFor` allocations consumed unevenly across chains.
- **Loan defaults** — collateral burned on the originating chain.
- **Pay activity asymmetry** — one chain attracts disproportionately more payments.

Bridges (suckers) and aggregated cashout/borrow math close the loop: divergence creates an **arbitrage incentive paid out of the divergence itself**. Arbitrageurs are protocol contributors; their P&L is the equalization work.

## D2.2 Expected behavior vs bug

- **EXPECTED:** divergence-driven value flow between chains via bridges + arbitrageur P&L. Aggregated treasury preserved across the equalization.
- **BUG:** aggregated treasury (summed surplus across all chains) decreases by **more than** `fees_taken + outstanding_loans`. That would mean value left the protocol entirely.

Local backing on any one chain may rise or fall under arbitrage; aggregated backing may not.

## D2.3 Mechanisms creating the asymmetry

The arbitrage incentive emerges from a **deliberate asymmetry** between two cashout code paths:

1. **`JBSucker.prepare`** cashes out at **LOCAL** supply/surplus with `taxRate=0` — see `revnet-core-v6/src/REVOwner.sol:209-211`. This is correct: moving tokens across the bridge at the LOCAL rate is the bridge-accounting primitive.
2. **Normal `cashOutTokensOf` / `REVLoans.borrowFrom`** use **AGGREGATED** supply/surplus when `scopeCashOutsToLocalBalances=false` (the chosen config for revnets 1–7) — see `revnet-core-v6/src/REVOwner.sol:226-234` and `revnet-core-v6/src/REVLoans.sol:421-435`. Capped at LOCAL surplus.

The gap between LOCAL-rate bridge cashouts and AGGREGATED-rate normal cashouts is precisely the arbitrageur's margin. Without that gap, late-joining chains could never be primed via bridges (no incentive to bridge supply in).

## D2.4 Cash-out delay's role

- `cashOutDelayOf[revnetId]` (per chain instance) blocks `cashOutTokensOf` and `REVLoans.borrowFrom` during the priming window for a newly-added chain.
- The delay **does not** block `sucker.prepare`: the sucker branch returns before the cash-out-delay check is reached. Intentional — priming a new chain requires bridges to flow tokens IN; blocking the bridge would defeat priming.
- During the delay, the new chain accumulates supply via bridges. After the delay, holders exit normally.

## D2.5 Layered conservation invariants

**Layer 1 — Conservation (must hold under any operation sequence):**

```
aggregated_surplus_now ==
    aggregated_surplus_start
  + Σ payments_in
  - Σ cashouts_to_users (net of tax)
  - Σ outstanding_borrows
  + Σ repayments
  - Σ protocol_fees_extracted (to fee project after 28d hold)
```

**Layer 2 — Variance reduction:** `Var(backing_per_token across chains)` decreases monotonically under bridge operations, modulo concurrent pays/cashouts that may add new divergence.

**Layer 3 — Arbitrage convergence:** per-cycle arbitrage profit is monotonically non-increasing as divergence narrows. Total arbitrage extractable is bounded by `initial_divergence × supply`.

## D2.6 Participant impact

- **Long-term holders on rich (over-backed) chains** lose backing premium over time as arbitrage equalizes. To capture the premium: cash out promptly, or ensure your chain receives proportional bridged supply.
- **Long-term holders on poor (under-backed) chains** gain backing premium over time; their chain attracts arbitrageur capital.
- **Arbitrageurs** are protocol contributors. Their profit *is* the equalization work. The protocol should surface divergence visibly via indexer + frontend (Bendystraw sketch is out of scope for this doc — see `bendystraw-v6/CROSS_CHAIN_DIVERGENCE_SURFACE.md`).
- **Operators** should expect cross-chain backing to roughly equalize over time absent persistent structural asymmetries. If it doesn't equalize, that's a signal that bridging is too costly (AMM slippage, gas, bridge fees) or that divergence is being constantly regenerated (e.g., one chain is the only chain receiving pays).

## D2.7 Why `scopeCashOutsToLocalBalances=false` is the right choice for revnets 1–7

Setting `scopeCashOutsToLocalBalances=true` would force every cashout/borrow to use only the local chain's supply/surplus. That would:

- **eliminate the arbitrage incentive** (no asymmetry between sucker.prepare and normal cashout), but also
- **eliminate the cross-chain priming mechanism** — new chains would attract no bridged supply because there'd be no profit motive for arbitrageurs to bridge in.

The deliberate choice for revnets 1–7 is `false`. **Arbitrage is the cost of cross-chain unity.**

## D2.8 Test coverage

- `deploy-all-v6/test/fork/CrossChainArbCharacterizationFork.t.sol` — quantifies arbitrage P&L across realistic divergence scenarios.
- `deploy-all-v6/test/invariants/CrossChainArbInvariant.t.sol` — stateful invariant suite asserting Layer-1 conservation + Layer-2 variance reduction.
- `deploy-all-v6/test/fork/CrossChainArbScenariosFork.t.sol` — late-chain-joins, whale-exits, cash-out-delay scenarios.

---

# Section E — Out-of-Scope Centralization Caveats

These are NOT third-party attack vectors but are powers held by privileged addresses outside any individual operator's control:

- **`_CRITICAL_INFRA_OWNER` Safe** (the NANA ops Safe) owns: `JBProjects`, `JBDirectory`, `JBPrices`, `JBFeelessAddresses`, `JBBuybackHookRegistry`, `JBRouterTerminalRegistry`, `JBSuckerRegistry`, `REVLoans`. Compromise of this Safe could:
  - replace the default buyback hook for revnets that don't pin one (projects 2–7 rely on default; only project 1 pins),
  - add new default price feeds (existing feeds are immutable, but a malicious feed appended as fallback could win when the primary reverts),
  - grant feeless status to malicious addresses,
  - upgrade `REVLoans` (REVLoans is Ownable),
  - change the project creation fee.
  It cannot directly mint or drain a specific revnet.
- **Per-revnet operator EOAs** can rotate splits/buyback pool/operator within their own revnet. Their revnet, their problem.
- **Deployer Safe** loses ownership of all project NFTs by end of `Deploy.s.sol`; only retains transient control during the script run.
- **`OMNICHAIN_RULESET_OPERATOR`** (the CREATE3-deterministic `JBOmnichainDeployer`) is a hardcoded bypass address for `LAUNCH_RULESETS` / `SET_TERMINALS` / `SET_PROJECT_URI` / `QUEUE_RULESETS` in `JBController`. The bypass is back-stopped by `JBOmnichainDeployer`'s own `_requirePermissionFrom(... PROJECTS.ownerOf(projectId))` checks at lines 842-857 (launch) and 893-898 (queue). If those checks were bypassed by a future change to JBOmnichainDeployer, projects without an approval hook would lose ruleset immutability.
- **DEFIFA `DEFIFA_REV_START_TIME` env-var consistency.** If operator runs `forge script` outside the Sphinx workflow without this env var set, DEFIFA salt diverges across chains. Operator-side hazard, not third-party-exploitable.

---

# Section F — Key Code References

- Ruleset freeze: `nana-core-v6/src/JBController.sol:475-494, 647-652` (omnichain bypass + auth)
- Operator permission set: `revnet-core-v6/src/REVOwner.sol:806-815`
- Wildcard grants on REVOwner: `revnet-core-v6/src/REVOwner.sol:648-672`
- Buyback hook mint-rate cap: `nana-buyback-hook-v6/src/JBBuybackHook.sol:378`
- Buyback pool front-run defense: `nana-buyback-hook-v6/src/JBBuybackHook.sol:493-505`
- Sucker leaf-hash defense: `nana-suckers-v6/src/JBSucker.sol:151, 1346`
- REVLoans surplus double-cap: `revnet-core-v6/src/REVLoans.sol:386-435` + `nana-core-v6/src/JBTerminalStore.sol:596`
- Price feed staleness: `nana-core-v6/src/JBChainlinkV3PriceFeed.sol:72`; sequencer variant: `JBChainlinkV3SequencerPriceFeed.sol:68`
- Held-fee processing reentrancy guard: `nana-core-v6/src/JBMultiTerminal.sol:724-790`
- OMNICHAIN_RULESET_OPERATOR back-stop: `nana-omnichain-deployers-v6/src/JBOmnichainDeployer.sol:842-857, 893-898`
- Permissions auth: `nana-core-v6/src/JBPermissions.sol:66-101`
- Referral split anti-strand: `nana-referral-split-hook-v6/src/JBReferralSplitHook.sol:266-269, 401, 555-589`
- 721 hook tier mint auth: `nana-721-hook-v6/src/JB721TiersHook.sol:382`
- Banny decoration ownership check: `banny-retail-v6/src/Banny721TokenUriResolver.sol:1141, 1504-1521`
- Defifa BWA self-attest gate: `defifa/src/DefifaGovernor.sol:168-177`

For the third-party attack-surface audit reasoning behind these invariants, see the May 2026 audit memory `project_revnets_1_7_third_party_attack_surface.md`.
