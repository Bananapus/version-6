# Audit Instructions

`v6/evm` is a modular Ethereum protocol workspace. Audit it as one composed system, not as isolated repos.

## Getting Started

Paste this into any AI with code execution (Claude Code, Cursor, Codex, etc.):

```
Clone https://github.com/Bananapus/version-6 recursively and read AUDIT_INSTRUCTIONS.md. Follow the audit engine instructions in that file to walk me through configuring and running an audit.
```

If your AI doesn't have code execution, clone manually and point it at the repo:

```bash
git clone --recursive https://github.com/Bananapus/version-6
```

Then paste the prompt above and point your AI at AUDIT_INSTRUCTIONS.md.

---

## Audit Engine

When an AI reads this file, it should follow this process:

### Step 1: Orient

Read these files in order:
1. `ARCHITECTURE.md` — ecosystem map and trust boundaries
2. `RISKS.md` — known risk register
3. The rest of this file — scope, invariants, attack surfaces
4. `USER_JOURNEYS.md` — how the system is used

### Step 2: Configure with the user

Ask the user three things. Present the options clearly so they can choose what to spend their AI resources on.

**Depth — how much compute do you want to spend?**

| Depth | Time | What it covers | Best for |
|-------|------|----------------|----------|
| Quick scan | ~30 min | One repo, surface-level checks | Contributing something useful with minimal cost |
| Focused audit | ~2-4 hrs | One subsystem, composition-aware | Going deep on an area you care about |
| Deep dive | ~8-24 hrs | Full 19-repo ecosystem | Maximum-value findings, cross-repo composition bugs |

**Subsystem — where do you want to focus?** (for quick scan and focused audit)

| # | Subsystem | Repos | What to look for |
|---|-----------|-------|------------------|
| 1 | Core treasury | `nana-core-v6` | Settlement flows, bonding curve math, fee accounting, ruleset lifecycle |
| 2 | NFT hooks | `nana-721-hook-v6`, `croptop-core-v6`, `banny-retail-v6` | Tier manipulation, credit vs cash interactions, metadata handling |
| 3 | Routing & swaps | `nana-buyback-hook-v6`, `univ4-router-v6`, `univ4-lp-split-hook-v6`, `nana-router-terminal-v6` | Swap-vs-mint routing under adversarial liquidity, LP positioning, price coherence |
| 4 | Cross-chain | `nana-suckers-v6`, `nana-omnichain-deployers-v6` | Bridge replay, double-claim, configuration drift, peer authentication |
| 5 | Revnets | `revnet-core-v6` | Loan math, stage transitions, hidden tokens, cross-chain surplus |
| 6 | Games & apps | `defifa`, `croptop-core-v6`, `banny-retail-v6` | Game lifecycle, scoring, NFT minting rules |
| 7 | Deployment | `deploy-all-v6`, `nana-fee-project-deployer-v6` | Privilege retention, ownership convergence, wiring correctness |

The user can pick one, several, or all. For deep dive, all subsystems are covered automatically.

**Adversarial persona — what kind of attacker should you think like?**

Each persona targets specific contracts and attack patterns in this codebase. When a persona is selected, the audit must trace these specific paths.

**1. MEV bot**
Target `JBBuybackHook.beforePayRecordedWith` and `JBUniswapV4Hook` — these decide whether to mint tokens or swap on an AMM. Trace:
- Can you sandwich a large pay() by manipulating pool price before the buyback hook's `try pool.swap()` executes?
- Does `JBRouterTerminal` expose swap routing that can be frontrun?
- Can you manipulate `twapSlippageTolerance` or `twapWindow` to force the hook into a bad swap?
- In `JBUniswapV4LPSplitHook`, can you manipulate tick state before liquidity is deployed?

**2. Malicious project owner**
Target `JBController.launchRulesetsFor` / `queueRulesetsFor` and `JBMultiTerminal.sendPayoutsOf`. Trace:
- Can a project owner queue a new ruleset that drains the treasury via payouts before token holders can cash out?
- Can they manipulate `reservedPercent` to dilute holders, then cash out?
- In `REVDeployer`, can they abuse stage transitions to change rules mid-stage?
- Can they set `dataHook` to a malicious contract that alters accounting inputs?
- Can they abuse `migrateBalanceOf` to move funds to a terminal they control?

**3. Rogue bridge operator**
Target `JBSucker.fromRemote`, `JBSucker._sendRoot`, and the sucker registry. Trace:
- Can a compromised peer send a root that mints unbacked tokens on the destination chain?
- Can you replay a merkle proof after it's been claimed?
- Can you exploit the `DEPRECATION_PENDING` -> `SENDING_DISABLED` transition to strand tokens?
- In `JBOmnichainDeployer`, can you deploy suckers that point to malicious peers?
- Can emergency hatch be abused to extract more value than was bridged?

**4. Grief attacker**
Target any path where a revert blocks other users. Trace:
- Can you make `sendPayoutsOf` revert by causing a split recipient to revert, blocking all payouts?
- Can you exhaust gas in `processHeldFeesOf` by creating many small held fees?
- Can you block `distributeReservedTokensOf` by making a split hook revert?
- In `DefifaDeployer`, can you prevent game resolution by manipulating scorecard submission?
- Can you DoS `cashOutTokensOf` by making the data hook revert?

**5. Fee evader**
Target `JBMultiTerminal._takeFeeFrom`, `JBFeelessAddresses`, and fee-holding mechanics. Trace:
- Can you route payments through a feeless address to avoid the 2.5% fee?
- Can you time `processHeldFeesOf` to return held fees before the 28-day lock expires?
- In `REVDeployer`, does the fee project deployer correctly route fees or can they be intercepted?
- Can you exploit `addToBalanceOf` (which is fee-exempt) instead of `pay` to receive tokens without paying fees?
- Do any hook paths skip the fee that should be taken on cash-outs?

**6. Flash loan attacker**
Target `JBTerminalStore.recordPaymentFrom` and `recordCashOutFor` — the bonding curve. Trace:
- Can you flash-loan ETH, pay into a project to inflate `totalSupply`, then cash out at a profit in the same tx?
- Does `cashOutTokensOf` with `totalSupply == 0` and surplus > 0 return the entire surplus?
- Can you manipulate `pendingReservedTokenBalanceOf` to inflate supply before a cash-out?
- In `REVLoans`, can you borrow against inflated collateral and default profitably?
- Can you flash-mint via a data hook that returns inflated `weight`?

**7. Permission escalator**
Target `JBPermissions`, `JBOwnableOverrides`, and registry surfaces. Trace:
- Does `ROOT` permission (ID 1) correctly gate all operations, or can you bypass it?
- Can wildcard permissions (`projectId=0`) leak across unrelated projects?
- In `JBOwnableOverrides`, can a trusted forwarder spoof `msg.sender` to gain owner access?
- Does `REVDeployer` retain permissions after deployment that it shouldn't?
- Can you register a malicious contract in `JBAddressRegistry` or the buyback registry to hijack hooks?

**8. Oracle manipulator**
Target `JBPrices`, `JBChainlinkV3PriceFeed`, and any cross-currency operation. Trace:
- Can you exploit the staleness threshold in price feeds to use outdated prices for cross-currency payouts?
- If a price feed reverts (sequencer down, stale), which operations DoS and which fail open?
- Can you manipulate the Uniswap V4 TWAP oracle to corrupt `JBBuybackHook`'s swap-vs-mint decision?
- In `REVLoans`, does `_borrowableAmountFrom` use the correct price precision?
- Can you exploit the inverse price auto-calculation in `JBPrices.pricePerUnitOf`?

The user can pick one to focus on, several to combine, or let the AI pick randomly for maximum diversity across community runs. If the user has their own attacker model or specialization (e.g. "I know Uniswap V4 hooks well"), they should say so — it gets woven into the audit.

### Step 3: Generate audit seed

Based on the user's choices, construct an audit seed:

```
Seed: {depth} / {subsystems} / {personas} / {user specialization if any}
```

If the user left any choice as "random" or "surprise me", pick randomly. The seed ensures each community run covers different ground. Include the seed in the final report.

### Step 4: Run the audit

Use parallel subagents where your platform supports them. Run these passes simultaneously where possible:

**Structured passes** (run in parallel):
- **Value flow tracer** — follow every wei/token from entry to exit in the target scope. Where does value enter, where is it recorded, where does it leave?
- **Access control scanner** — verify permission checks at every external/public entry point. Test what happens if the caller has unexpected permissions.
- **Cross-boundary tracer** — find where the target subsystem trusts another repo's output as fact. What if that output is wrong, stale, or manipulated?
- **State consistency checker** — trace all state transitions. What happens on revert? On reentrancy? Are storage updates ordered safely?

**Adversarial passes** (run in parallel, using the selected personas):
- **Persona attacker** — play the chosen adversarial persona(s). Construct concrete attack sequences with specific function calls and values.
- **Hypothesis tester** — invent 3 novel "what if this assumption is wrong" hypotheses about the target code, then try to prove each one. These should be non-obvious — not things the structured passes would catch.
- **Random walker** — pick a random internal function in the target scope, trace all callers and callees across repo boundaries, and look for assumption mismatches at each boundary. Repeat 3-5 times with different starting points.

**Cross-pollination** (after parallel passes complete):
- Gather all findings from all passes
- For each finding, check whether it composes with findings from other passes to create a larger issue
- Test each finding against the 9 critical invariants listed below
- Try to disprove each finding — construct the strongest argument for why it's NOT a bug. Only findings that survive this self-review make the report.

### Step 5: Report

Produce one consolidated report:

**Header:**
- Audit seed (so coverage can be tracked across community runs)
- Subsystems covered
- Personas used
- Total findings by severity

**Findings** (grouped by severity — Critical, High, Medium, Low, Gas):

For each finding:
- **[SEVERITY-ID] Title**
- **Repos involved**
- **Root cause** — the fundamental issue, not the symptom
- **Impact** — what an attacker gains, with concrete values
- **Proof of concept** — step-by-step exploitation sequence with function calls
- **Why this survived self-review** — the strongest counter-argument and why it failed
- **Recommended fix**

**Ecosystem observations:**
- Trust assumptions that seem fragile
- Missing checks at repo boundaries
- Areas that need more coverage from future auditors

Merge findings that share root causes. Only include findings with demonstrated, concrete impact.

Skip: test/, lib/, interfaces/, mocks/, *.t.sol, *Test*.sol, *Mock*.sol

---

## Submitting findings

Open an issue at https://github.com/Bananapus/version-6/issues with:
- Title: `[Audit] <your-focus-area>`
- Body: your full report (include the audit seed)

Every report helps — even a quick scan that finds nothing confirms that surface is clean. Including your seed helps us track which areas have been covered and where we need more eyes.

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
