# Audit Instructions

`v6/evm` is a modular Ethereum protocol workspace. Audit it as one composed system, not as isolated repos.

## Getting Started

Clone this repo recursively, pick a depth level, copy the corresponding prompt into your AI, and submit the report it produces.

```bash
git clone --recursive https://github.com/Bananapus/version-6
```

### Quick scan (~30 min AI time)

Covers one repo at a time. Finds surface-level issues — access control gaps, obvious reentrancy, missing checks. Won't catch cross-repo composition bugs or subtle economic exploits.

```
I want you to audit the Solidity smart contracts in this repository as a security researcher.

Repository: [PASTE REPO PATH OR GITHUB URL]

Focus on:
- Access control and permission checks
- Reentrancy and external call safety
- Integer overflow/underflow (even with Solidity 0.8+, check casting and unchecked blocks)
- Value handling (ETH/token transfers, fee calculations)
- State consistency after reverts

Skip: test/, lib/, interfaces/, mocks/, *.t.sol

For each finding, provide:
- Severity (Critical / High / Medium / Low / Gas)
- Title (one line)
- Description (what's wrong)
- Impact (what an attacker gains)
- Proof of concept (code or step sequence)
- Recommended fix

Start with the main contract files (src/), reading each one fully before making judgments.
```

### Focused audit (~2-4 hours AI time)

Covers one subsystem. Catches more subtle bugs by understanding how contracts compose within an area.

Pick a subsystem:

| Subsystem | Repos | What to look for |
|-----------|-------|------------------|
| Core treasury | `nana-core-v6` | Settlement flows, bonding curve math, fee accounting, ruleset lifecycle |
| NFT hooks | `nana-721-hook-v6`, `croptop-core-v6`, `banny-retail-v6` | Tier manipulation, credit vs cash interactions, metadata handling |
| Routing & swaps | `nana-buyback-hook-v6`, `univ4-router-v6`, `univ4-lp-split-hook-v6`, `nana-router-terminal-v6` | Swap-vs-mint routing under adversarial liquidity, LP positioning, price coherence |
| Cross-chain | `nana-suckers-v6`, `nana-omnichain-deployers-v6` | Bridge replay, double-claim, configuration drift, peer authentication |
| Revnets | `revnet-core-v6` | Loan math, stage transitions, hidden tokens, cross-chain surplus |
| Games & apps | `defifa`, `croptop-core-v6`, `banny-retail-v6` | Game lifecycle, scoring, NFT minting rules |
| Deployment | `deploy-all-v6`, `nana-fee-project-deployer-v6` | Privilege retention, ownership convergence, wiring correctness |

```
I want you to perform a focused security audit of a Solidity subsystem within the Juicebox V6 ecosystem.

Subsystem: [SUBSYSTEM NAME]
Repos to review: [LIST REPOS]
Repository root: [PATH TO version-6 CLONE]

Context documents to read first:
1. ARCHITECTURE.md (in the root — ecosystem map)
2. RISKS.md (in the root — known risk areas)
3. AUDIT_INSTRUCTIONS.md (in the root — scope, invariants, attack surfaces)
4. Each repo's own AUDIT_INSTRUCTIONS.md, ARCHITECTURE.md, and RISKS.md if they exist

Critical invariants to test:
1. Terminal solvency — accounting must match actual balances
2. Project isolation — one project can't touch another's state
3. Hook boundedness — hooks can't create value or skip fees
4. Fee correctness — fees must not silently disappear
5. Token accounting — supply relationships must be preserved

Attack sequences to trace:
1. pay -> data hook -> callback -> immediate cash-out
2. payout -> split hook -> downstream pay or re-entry
3. cross-currency operation with stale pricing
4. deployer launch -> ownership transfer -> registry write -> runtime callback

For each finding, provide:
- Severity (Critical / High / Medium / Low / Gas)
- Title
- Root cause analysis
- Impact
- Proof of concept with concrete values
- Recommended fix

Read all source files in the target repos fully. Skip test/, lib/, interfaces/, mocks/.
Merge findings that share the same root cause.
Only report issues you can demonstrate with a concrete scenario.
```

### Deep dive (~8-24 hours AI time)

Full 19-repo ecosystem audit. This is the level that finds composition bugs across repo boundaries — the most valuable findings.

```
I want you to perform a comprehensive security audit of the entire Juicebox V6 EVM ecosystem.

Repository root: [PATH TO version-6 CLONE]

## Setup

Read these documents first, in order:
1. ARCHITECTURE.md — ecosystem map and trust boundaries
2. RISKS.md — known risk register and priority areas
3. AUDIT_INSTRUCTIONS.md — scope, security model, invariants, attack surfaces
4. USER_JOURNEYS.md — how the system is actually used

Then read each repo's local AUDIT_INSTRUCTIONS.md, ARCHITECTURE.md, and RISKS.md.

## Scope (19 repos)

Primary:
- nana-core-v6, nana-721-hook-v6, nana-suckers-v6, nana-buyback-hook-v6
- nana-router-terminal-v6, nana-omnichain-deployers-v6, revnet-core-v6
- univ4-router-v6, univ4-lp-split-hook-v6, croptop-core-v6, defifa, banny-retail-v6

Supporting:
- nana-ownable-v6, nana-address-registry-v6, nana-distributor-v6
- nana-fee-project-deployer-v6, nana-permission-ids-v6, nana-project-handles-v6, deploy-all-v6

## Methodology

Pass 1 — Architecture review:
Map trust boundaries, shared singletons, and privilege flows across repos.

Pass 2 — Cross-boundary data flows:
Trace how one repo's output becomes another's security assumption.
Focus: price feeds -> surplus -> loans -> LP, hook outputs -> settlement, bridge messages -> state updates.

Pass 3 — Economic analysis:
Test bonding curve math, fee calculations, swap routing, and loan collateralization under adversarial conditions.

Pass 4 — Access control:
Verify permission checks at every entry point. Test privilege escalation via wildcards, registries, and deployer-retained authority.

Pass 5 — Cross-chain:
Trace prepare -> root -> claim flows. Test replay, double-claim, configuration drift, and emergency exits.

Pass 6 — Deployment and configuration:
Verify constructor args, ownership transfers, registry writes, and singleton assumptions match runtime expectations.

Pass 7 — Integration testing:
Replay the attack sequences from AUDIT_INSTRUCTIONS.md with concrete values.

Pass 8 — Gas and optimization:
Flag redundant storage reads, avoidable loops, and packing opportunities.

## Critical invariants

1. Terminal solvency: aggregate accounting <= actual balances
2. Project isolation: no cross-project state leakage
3. Ruleset correctness: active ruleset matches protocol intent at execution time
4. Hook boundedness: hooks can't create value or skip fees
5. Fee correctness: fees never silently disappear
6. Token consistency: ERC-20 + ERC-721 + reserve + bridge representations preserve supply
7. Cross-chain conservation: no replay, double-claim, or unbacked destination value
8. Privilege containment: no escalation across unrelated projects
9. Preview-execution coherence: preview consumers remain safe at execution time

## Output format

Produce one consolidated report:

### Summary
- Total findings by severity
- Most critical composition risks identified

### Findings (grouped by severity)
For each:
- **[SEVERITY-ID] Title**
- **Repos involved**
- **Root cause**
- **Impact** (with concrete values where possible)
- **Proof of concept** (step-by-step exploitation)
- **Recommended fix**

### Ecosystem observations
- Trust assumptions that seem fragile
- Missing checks at repo boundaries
- Areas needing additional testing

Merge findings sharing root causes. Only report issues with demonstrated impact.
Skip: test/, lib/, interfaces/, mocks/, *.t.sol, *Test*.sol, *Mock*.sol
```

### Add your own specialization

Append to any prompt above:

```
Additional context from my expertise:

[YOUR SPECIALIZATION]

Examples:
- "I specialize in MEV. Pay extra attention to swap routing and pool interactions."
- "I focus on cross-chain bridge security. Trace all message authentication and replay protection."
- "I know Uniswap V4 hooks well. Check the hook callback safety and pool state assumptions."
- "I'm experienced with bonding curve economics. Verify the cashout math under edge conditions."
```

### Script-based auditing

To audit the full ecosystem programmatically (breaking it into contextual chunks for your AI):

1. Each repo has its own `AUDIT_INSTRUCTIONS.md` with scoped invariants
2. The root `ARCHITECTURE.md` maps cross-repo dependencies
3. Repos list dependencies in `package.json` — build context bundles that include a repo plus its dependency docs

```bash
# For each repo, bundle:
# - Root AUDIT_INSTRUCTIONS.md, ARCHITECTURE.md, RISKS.md
# - The repo's own docs
# - Dependency docs from package.json
# Then send each bundle + source to your AI as a scoped audit
```

This lets you parallelize across repos while still catching cross-boundary issues through the shared context docs.

---

## Submitting findings

Open an issue at https://github.com/Bananapus/version-6/issues with:
- Title: `[Audit] <your-focus-area>`
- Body: your full report
- Which depth level you used

Even partial reports are valuable. A quick scan of one repo that finds nothing still tells us that surface is clean.

---

## Audit Objective

Find issues that:

- lose, lock, misroute, or misaccount value across repo boundaries
- mint, burn, bridge, reclaim, or redeem more value than intended
- grant permissions, ownership, or registry trust beyond the documented model
- break ruleset, phase, routing, or cross-chain invariants only when multiple repos are composed
- make otherwise-correct contracts unsafe because deployment wiring or singleton assumptions are wrong

## Scope

Primary in-workspace protocol scope:

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
- `defifa`
- `banny-retail-v6`
- `nana-ownable-v6`
- `nana-address-registry-v6`
- `nana-distributor-v6`
- `nana-fee-project-deployer-v6`
- `nana-permission-ids-v6`
- `nana-project-handles-v6`
- `deploy-all-v6`

Also in scope:

- root architecture and risk docs in this repo
- repo-local deployment scripts and registry wiring
- constructor and initializer parameters
- cross-repo assumptions about project IDs, singletons, registries, and privileged helpers

## Gas Efficiency

If you notice gas optimizations while reviewing, please flag them. Common areas of interest:

- redundant storage reads that could be cached in memory
- loops with avoidable external calls or storage writes per iteration
- struct packing or storage layout improvements
- calldata vs memory for read-only parameters
- unchecked arithmetic where overflow is already bounded

Gas findings are welcome alongside security findings — they don't need a separate pass.

## Out Of Scope

- re-auditing third-party dependency internals in `node_modules` or `lib/` unless Juicebox composition makes them unsafe
- purely stylistic, naming, or comment-only issues

## Start Here

1. `ARCHITECTURE.md`
2. `RISKS.md`
3. `nana-core-v6/AUDIT_INSTRUCTIONS.md`
4. one routing chain: `nana-buyback-hook-v6` -> `univ4-router-v6`
5. one cross-chain chain: `nana-suckers-v6` plus its deployer or registry assumptions

## Security Model

The ecosystem centers on `nana-core-v6`:

- terminals hold funds and execute pay, payout, allowance, and cash-out flows
- the store records accounting that downstream hooks often treat as economic truth
- controllers, rulesets, prices, splits, and permissions define canonical project state

The rest of the workspace composes around that core:

- hooks alter minting, accounting inputs, or cash-out behavior
- routers and swap-aware hooks compare external market execution against native protocol execution
- bridge components move project-token value across chains
- deployers, registries, and owner helpers create and preserve the runtime trust model
- app-level repos like `defifa`, `croptop-core-v6`, `revnet-core-v6`, and `banny-retail-v6` turn shared primitives into higher-level products

The main audit mindset here is composition:

- one repo often treats another repo's preview, registry lookup, or hook output as authoritative
- deployment-time wiring creates runtime trust assumptions
- many high-severity bugs appear only when correct local logic is connected to a bad outside assumption

## Roles And Privileges

| Role | Powers | How constrained |
|------|--------|-----------------|
| Project owner or operator | Configure project rulesets, hooks, terminals, and permissions | Must stay inside core permission checks and repo-local invariants |
| Shared singleton or registry controller | Influence many projects through one contract or deployment surface | Must not retain broader authority than the ecosystem expects |
| Deployer or owner helper | Launch projects, transfer ownership, or stand in for runtime authority | Must converge to the intended post-launch trust model |
| Hook or router | Alter accounting, routing, or settlement decisions at runtime | Must not create value or break core accounting assumptions |
| Bridge peer or messenger | Install remote roots or move cross-chain value | Must be authenticated and replay-resistant per transport |

## Integration Assumptions

| Dependency | Assumption | What breaks if wrong |
|------------|------------|----------------------|
| `nana-core-v6` previews and accounting surfaces | Other repos can safely consume them as economic inputs | Hooks and routers choose the wrong path or scale the wrong amount |
| Shared registries | Buyback, router, sucker, address, and owner registries identify the intended contracts only | Privileged paths widen across unrelated projects |
| Deployment scripts | Constructor args, ownership transfers, and registry writes match runtime expectations | Safe code is deployed into an unsafe topology |
| Cross-chain transports | Only authentic peers can update remote state | Bridged value can be spoofed, replayed, or stranded |
| External pricing and market surfaces | Price feeds and AMM callbacks stay coherent enough for routing and settlement | Cross-currency and swap-aware logic misprices or misroutes funds |

## Critical Invariants

1. Terminal solvency
   Aggregate internal accounting for a terminal and token must stay reconcilable with actual redeemable balances.

2. Project isolation
   One project must not consume another project's balance, allowance, bridgeable value, NFT state, or privileges.

3. Ruleset and phase correctness
   The active ruleset, lifecycle phase, and time-bound permissions must be the ones the protocol intends at execution time.

4. Hook boundedness
   Hooks may change accounting inputs or fulfillment order only within the documented model. They must not create value or skip fees unexpectedly.

5. Fee correctness
   Protocol and repo-local fees must be paid, held, or redirected only by documented fallback behavior. They must not silently disappear.

6. Token accounting consistency
   ERC-20, ERC-721, reserve, routing, and bridged representations must preserve intended supply and reclaim relationships.

7. Cross-chain conservation
   Prepare, root-send, root-receive, and claim flows must not allow replay, double claim, or unbacked destination value.

8. Privilege containment
   Wildcard permissions, registries, owner helpers, and deployers must not let one compromised component escalate across unrelated projects.

9. Preview and execution coherence
   Any repo that consumes a preview, estimate, or hook-produced spec as execution truth must remain safe when execution actually happens.

## Attack Surfaces

- `nana-core-v6` settlement entrypoints consumed by downstream hooks
- routing stacks that compare external market execution against native protocol execution
- bridge prepare, root, claim, and emergency-exit paths
- deployers and helpers that retain one privilege too many after launch
- wildcard permissions, project-owner abstractions, and shared registries
- chain-specific constants and singleton wiring in deployment orchestration

Replay these ecosystem sequences:

1. pay -> data hook override -> downstream hook callback -> immediate cash-out
2. payout -> split hook -> downstream pay or terminal re-entry
3. cross-currency pay or cash-out with stale or missing price context
4. sucker prepare -> out-of-order root delivery -> claim or emergency exit
5. deployer launch -> ownership transfer -> registry write -> privileged runtime callback
6. swap-versus-mint or swap-versus-cash-out routing under adversarial liquidity

## Accepted Risks Or Behaviors

- Some repos intentionally preserve liveness through conservative fallback behavior instead of failing closed on every external integration problem.
- Composition is a first-class design goal, so bugs that appear only in multi-repo flows are the default audit target, not an edge case.

## Verification

- read repo-local `AUDIT_INSTRUCTIONS.md` files for each component's exact scope and invariants
- use `ARCHITECTURE.md`, `RISKS.md`, and `USER_JOURNEYS.md` as the cross-repo map
- run the repo-local verification commands when validating a concrete finding
