# Audit Instructions

Juicebox V6 is a modular treasury protocol ecosystem. Audit it as one composed system, not as isolated repos.

Start here:
- `ARCHITECTURE.md`: cross-repo call graph and data flow
- `RISKS.md`: shared trust assumptions and ecosystem-wide failure modes
- `USER_JOURNEYS.md`: user-facing flows worth replaying end to end

## Objective

Find issues that:
- lose, lock, misroute, or misaccount funds
- mint, burn, bridge, or redeem more value than intended
- grant permissions or ownership beyond the documented model
- break stage, ruleset, or cross-chain invariants
- create economically exploitable route-selection, fee, or rounding errors

This codebase is unusually composition-heavy. A large share of the real attack surface lives in:
- data hook output feeding terminal accounting
- terminal fulfillment calling pay, cash-out, and split hooks
- deployers that proxy privileges into other repos
- shared singletons used by many projects
- deployment wiring that makes otherwise-safe contracts unsafe in production

## First Pass

If you are seeing the ecosystem for the first time, spend the first pass in this order:
- read `ARCHITECTURE.md` once end to end
- audit `nana-core-v6` entrypoints and extension points
- audit one representative hook composition chain:
  `nana-core-v6` -> `nana-buyback-hook-v6` -> `univ4-router-v6`
- audit one representative cross-chain chain:
  `nana-core-v6` -> `nana-suckers-v6` -> deployer or registry trust
- audit `deploy-all-v6` only after you know what the runtime contracts are expecting to be true

## Canonical Scope

Primary runtime and deployment scope:
- `nana-core-v6`
- `nana-721-hook-v6`
- `nana-suckers-v6`
- `nana-buyback-hook-v6`
- `nana-router-terminal-v6`
- `nana-omnichain-deployers-v6`
- `revnet-core-v6`
- `univ4-router-v6`
- `univ4-lp-split-hook-v6`
- `croptop-core-v6`
- `defifa-collection-deployer-v6`
- `banny-retail-v6`
- `nana-ownable-v6`
- `nana-address-registry-v6`
- `nana-fee-project-deployer-v6`
- `nana-privacy-v6`
- `nana-permission-ids-v6`
- `deploy-all-v6`

Also in scope:
- root and per-repo deployment scripts
- constructor and initializer parameters
- permission grants, owner transfers, registry writes, and deterministic deployment salts
- interactions with Chainlink feeds, Uniswap V4, Permit2, and bridge messengers

Assume third-party dependency internals are correct unless Juicebox integration makes them unsafe.

## System Model

At the center is `nana-core-v6`:
- `JBMultiTerminal` holds funds
- `JBTerminalStore` records accounting and surplus
- `JBController` manages projects, rulesets, and token minting/burning
- `JBRulesets`, `JBSplits`, `JBPrices`, `JBTokens`, and `JBPermissions` provide shared governance and accounting primitives

Everything else composes around those primitives:
- NFT issuance and NFT cash-out: `nana-721-hook-v6`
- swap-vs-mint routing: `nana-buyback-hook-v6` and `univ4-router-v6`
- multi-asset routing into accepted project tokens: `nana-router-terminal-v6`
- cross-chain project token movement: `nana-suckers-v6`
- launchers and protocol compositions: `nana-omnichain-deployers-v6`, `revnet-core-v6`, `croptop-core-v6`, `defifa-collection-deployer-v6`
- application-level surfaces: `banny-retail-v6`, `nana-privacy-v6`
- deployment orchestration: `deploy-all-v6`

## Highest-Value Invariants

These are the first properties to break if something is materially wrong:

1. Terminal solvency
`terminal token balance >= aggregate internal balance tracked for that terminal/token`, modulo held-fee mechanics and intentional in-flight behavior.

2. Project isolation
One project must not be able to consume another project's balance, allowance, payout capacity, bridgeable value, or NFT state.

3. Ruleset correctness
The active ruleset, its decay, hooks, tax rate, reserved rate, and accounting contexts must be the ones the protocol intends at the exact execution timestamp.

4. Hook boundedness
Data hooks may modify accounting inputs only within the intended model. Hook specifications must not create value, skip fees unexpectedly, or move funds without matching accounting.

5. Fee correctness
Protocol fees and repo-specific fees must either be paid, held, or explicitly redirected by documented fallback logic. They must not silently disappear.

6. Token accounting consistency
Mint, burn, reserve, bridge, and reclaim paths must preserve intended supply and price relationships across ERC-20 credits, ERC-721 tiers, and bridged representations.

7. Cross-chain conservation
Prepare, send-root, receive-root, and claim paths must not enable replay, double claim, stranded balance creation, or source/destination divergence beyond documented emergency-hatch behavior.

8. Privilege containment
Wildcard permissions, project ownership helpers, registries, and deployers must not let one compromised component escalate across unrelated projects.

9. Preview and execution coherence
Any repo that treats a preview, estimate, or hook-returned spec as execution truth must receive values that remain valid once the terminal actually records and fulfills the action.

10. Singleton failure containment
If a shared registry, oracle, or hook instance fails, dependent flows may degrade, but they must not mint unbacked value, bypass fees, or permanently desynchronize accounting.

## Concrete Audit Sequences

If you only have time for a first serious pass, start with these sequences:

1. Pay -> data hook override -> mint -> pay hook callback -> immediate cash-out
Look for state that is already recorded in the store before downstream hooks can re-enter another path.

2. Payout -> split hook -> terminal re-entry or downstream pay
Check whether payout limits are consumed before externally controlled code can create a value loop.

3. Cross-currency pay or cash-out with stale or missing price context
Follow value through `JBPrices`, surplus logic, hook normalization, and any repo that scales weight or reclaim from converted amounts.

4. Sucker prepare -> root send -> out-of-order receive -> claim or emergency exit
This is where conservation, replay protection, and nonce assumptions are most exposed.

5. Deployer launch -> ownership transfer -> registry write -> privileged runtime callback
Many bugs here are not “deployment only”; they become permanent runtime privilege mistakes.

6. Swap-vs-mint or swap-vs-cashout routing under adversarial liquidity conditions
The risky cases are not just bad spot quotes. They are stale TWAP, fallback branches, sign mistakes, and partial-fill leftovers.

## Threat Model

Assume adversaries can:
- call public and external functions in adversarial order
- front-run, back-run, sandwich, and replay cross-domain timing edges
- exploit rounding, stale pricing, partial fills, and fallback branches
- interact through malicious hooks, recipients, ERC-20s, ERC-721 receivers, or bridge peers
- exploit privileged operators if a grant is broader than intended

Do not assume:
- a project owner is honest
- a hook is well-behaved just because it is “owned”
- a swap path is economically neutral
- a deployment script will always run in one clean shot

Explicit trust assumptions still matter:
- external price feeds can stall or revert
- cross-chain bridges are trusted only to the degree each repo documents
- certain governance or operator roles are intentionally powerful

## Priority Areas

Order your effort roughly like this:

1. `nana-core-v6`
Terminal solvency, cash-out math, payout and allowance enforcement, fee processing, ruleset transition logic, migrations, and wildcard permission boundaries.

2. Hook composition
`nana-721-hook-v6`, `nana-buyback-hook-v6`, `univ4-router-v6`, `univ4-lp-split-hook-v6`, `nana-router-terminal-v6`, and deployer data hooks. Most subtle bugs appear when one repo's “preview” or “weight adjustment” logic is consumed by another repo as hard accounting truth.

3. Cross-chain
`nana-suckers-v6` and any deployer or owner helper that grants sucker privileges or fee exemptions.

4. Autonomous compositions
`revnet-core-v6`, `croptop-core-v6`, and `defifa-collection-deployer-v6`, where project-specific economics are built out of many shared primitives.

5. Deployment correctness
`deploy-all-v6` and per-repo `script/` entries. Wrong wiring, wrong singleton addresses, missing ownership transfers, and missing registry writes are production-critical findings.

## Shared Ecosystem Hotspots

These boundaries deserve explicit cross-repo review:
- `JBTerminalStore` output consumed by downstream hooks as economic truth
- `preview*` values consumed off-chain and then assumed on-chain by routering or hook logic
- shared registries: buyback, router terminal, sucker registry, address registry
- wildcard permissions and project-owner abstractions
- cross-chain identity assumptions: project IDs, peer addresses, mapped tokens, bridge messengers
- deployer-owned contracts that later act as runtime hooks or privileged operators

## Repo-Specific Guidance

Each repo root has its own `AUDIT_INSTRUCTIONS.md`. Use those files for:
- exact scope in that repo
- repo-local invariants
- threat boundaries and intended privileges
- hotspots tied to the current source tree

If a repo-level instruction conflicts with this file, prefer the narrower repo-level statement for that repo and keep the ecosystem-level invariants in mind.

## What Not To Spend Time On

Low-value findings in this ecosystem:
- purely theoretical gas grief that does not change reachability or solvency
- admin centralization that is already an explicit design choice with no bypass
- stale comments, naming issues, or style-only inconsistencies
- test-only issues that do not affect runtime or deployment correctness

High-value findings here usually need a concrete sequence:
- who calls what
- what state is already committed
- which repo supplies the wrong assumption
- where the value, permission, or invariant breaks

## Finding Bar

A strong ecosystem finding usually has at least one of these shapes:
- the wrong amount is recorded in core accounting, then a downstream repo faithfully amplifies the error
- a preview, estimate, or registry lookup is treated as authoritative when it is only advisory
- a privileged deployer or helper finishes deployment with one capability too many
- a cross-chain or cross-hook fallback path preserves liveness by sacrificing an invariant

Weak findings here are usually ones that never survive composition into a concrete money, permission, or liveness break.

## Reproduction Standard

A strong finding should include:
- exact contracts and entrypoints involved
- minimal triggering sequence
- why current tests do not already cover it, if applicable
- concrete impact on funds, permissions, liveness, or economic guarantees
- a Foundry proof when practical

Prefer end-to-end reproductions for composition bugs. Many issues here look harmless in unit isolation and only become real when routed through terminals, hooks, deployers, or bridge peers.
