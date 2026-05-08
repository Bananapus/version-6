# Audit Instructions

`v6/evm` is a modular Ethereum protocol workspace. Audit it as one composed system, not as isolated repos.

There is a billion dollars of well-meaning projects' money in the Juicebox Money Engine, growing exponentially. Your job is to hack it before anyone else. Whoever hacks it first saves/steals the money, and you are obsessed with being this winner, while also being a steward of the protocol and wanting it to keep growing safely.

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

**9. Decimals/currency/token arbitrageur**
Target every boundary where decimal precision, currency identity, or token address is converted, compared, or assumed. Trace:
- `JBFixedPointNumber.adjustDecimals` — does truncation during decimal conversion create exploitable rounding that accumulates over many operations?
- `baseCurrency` (1=ETH, 2=USD) vs `JBAccountingContext.currency` (uint32 of token address) — are these ever confused or compared directly?
- `groupId` (uint256) vs `currency` (uint32) — both derive from token addresses but have different bit widths. Can you exploit the truncation?
- In `JBTerminalStore`, do cross-currency surplus calculations via `JBPrices` lose precision when converting between tokens with different decimals (e.g. 18-decimal ETH vs 6-decimal USDC)?
- Can you exploit `mulDiv` rounding direction in fee calculations, bonding curve math, or LP positioning to extract dust across many transactions?
- In `JBSuckerLib.convertPeerValue`, is the price in the numerator or denominator? Compare to `JBTerminalStore`'s conversion at line 389 — they must match.
- In `REVDeployer._tryInitializeBuybackPoolFor`, does the sqrtPriceX96 calculation use the terminal token's actual decimals or a hardcoded `1e18`?
- In `JBUniswapV4LPSplitHook._createAndInitializePool`, when a pool is already initialized, is the existing price validated against computed bounds?

**10. Ruthless thief**
No constraints, no persona — just steal money by any means. Start from the highest-value targets and work down. Trace:
- `JBMultiTerminal`: call `pay()` then immediately `cashOutTokensOf()` — can you extract more than you put in through any combination of hooks, rulesets, or timing?
- Can you drain a project's terminal balance by exploiting the interaction between `sendPayoutsOf`, `useAllowanceOf`, and `cashOutTokensOf` in the same block?
- Read every `transfer`, `transferFrom`, `safeTransfer`, and low-level `call{value:}` in the codebase — for each one, can you make it send funds to an address you control?
- Trace all paths where `msg.sender` or `tx.origin` determines who receives funds — can any be spoofed via ERC-2771, callback, or delegatecall?
- Look for any state where `balanceOf[project]` in the terminal store can diverge from actual token balances — then exploit the gap
- Check every `unchecked` block — can any overflow or underflow be triggered to wrap a balance, amount, or index?
- Look at every `try/catch` — if the try fails and funds are returned to the project balance instead of the intended recipient, can you trigger the failure deliberately and then claim those funds?

**11. Input monoculture breaker**
Target every code path that handles token amounts, decimal precision, or currency conversion. Trace:
- Does the code hardcode `1e18`, `18`, or any specific decimal count? Test with 6-decimal (USDC) and 8-decimal (WBTC) tokens.
- If two components compute the same conversion (e.g., sucker lib and terminal store), do they use the same formula? Build a test that feeds identical inputs to both and asserts parity.
- For every try-catch: does a test assert the try-path succeeded, or only that the outer call didn't revert? If only the latter, the catch block may be silently masking bugs.
- For every boolean flag that branches behavior: are both states tested? Check `scopeCashOutsToLocalBalances`, `useDataHookForPay`, `useDataHookForCashOut`, and any project-scoped flags.
- For every permission granted at deploy time: what happens after the project NFT is transferred? Is there a revocation path?
- For any code that reads pre-existing external state (pool prices, oracle values, registry entries): can an adversary set that state before the legitimate caller?

The user can pick one to focus on, several to combine, or let the AI pick randomly for maximum diversity across community runs. If the user has their own attacker model or specialization (e.g. "I know Uniswap V4 hooks well"), they should say so — it gets woven into the audit.

### Step 3: Generate audit seed

Based on the user's choices, construct an audit seed:

```
Seed: {depth} / {subsystems} / {personas} / {user specialization if any}
```

If the user left any choice as "random" or "surprise me", pick randomly. The seed ensures each community run covers different ground. Include the seed in the final report.

### Step 4: Decompose into components

**Smaller context produces better results.** Rather than auditing an entire subsystem in one pass, break it into scoped components and audit each one with a dedicated subagent. This is the single most effective way to improve finding quality.

**How to decompose:**

1. Look at the target scope from the user's subsystem and depth choices.
2. Group the code into components — tightly-coupled units that share state or call each other directly. A component is typically:
   - A single large contract (e.g. `JBMultiTerminal` alone is ~2000 lines — that's one component)
   - A pair of contracts that form a unit (e.g. `JBTerminalStore` + its library dependencies)
   - A small repo with 1-3 contracts (e.g. `nana-ownable-v6`)
3. For each component, identify which other components it trusts or calls — these become the "boundary context" that the subagent needs to understand but not audit line-by-line.

**Example decomposition for "Core treasury" subsystem:**

| Component | Files | Boundary context |
|-----------|-------|------------------|
| Terminal settlement | `JBMultiTerminal.sol` | JBTerminalStore interface, hook interfaces |
| Store accounting | `JBTerminalStore.sol`, `JBCashOuts.sol`, `JBFees.sol` | JBMultiTerminal call patterns, JBPrices interface |
| Ruleset lifecycle | `JBRulesets.sol`, `JBRulesetMetadataResolver.sol` | JBController call patterns, approval hook interface |
| Token system | `JBTokens.sol`, `JBERC20.sol` | JBController mint/burn calls |
| Access control | `JBPermissions.sol`, `JBDirectory.sol` | All callers that check permissions |
| Price system | `JBPrices.sol`, price feed contracts | JBTerminalStore consumers |
| Splits & limits | `JBSplits.sol`, `JBFundAccessLimits.sol` | JBMultiTerminal payout flow |

For a **quick scan**, pick 1-2 components. For a **focused audit**, cover all components in the subsystem. For a **deep dive**, decompose every subsystem.

**Component subagent instructions:**

Each component subagent should receive:
- The full source of contracts in that component
- Interface signatures and key behaviors of boundary contracts (not their full source — keep context small)
- The relevant invariants from this file
- The selected adversarial persona(s)
- The repo-local `AUDIT_INSTRUCTIONS.md` for that component's repo

The subagent should NOT receive the full source of every contract in the subsystem. The goal is focused attention on a small surface area.

### Step 5: Run the audit

For each component from Step 4, launch a subagent (or run sequentially if your platform doesn't support parallel agents). Each component gets these passes:

**Per-component passes** (run in parallel within each component):
- **Value flow tracer** — follow every wei/token from entry to exit within this component. Where does value enter, where is it recorded, where does it leave?
- **Access control scanner** — verify permission checks at every external/public entry point in this component. Test what happens if the caller has unexpected permissions.
- **State consistency checker** — trace all state transitions within this component. What happens on revert? On reentrancy? Are storage updates ordered safely?
- **Persona attacker** — play the chosen adversarial persona(s) against this component specifically. Construct concrete attack sequences.

After all component subagents complete, run a **composition pass** across components:

**Cross-component passes** (these require findings from the component passes):
- **Cross-boundary tracer** — for each trust boundary identified in the decomposition, check: does the calling component's assumption match the called component's actual behavior? Focus on cases where component passes found surprising behavior.
- **Hypothesis tester** — invent 3 novel "what if this assumption is wrong" hypotheses that span multiple components, then try to prove each one.
- **Random walker** — pick a random internal function, trace all callers and callees across component and repo boundaries, and look for assumption mismatches at each boundary. Repeat 3-5 times.
- **Finding composer** — take every finding from the component passes and check whether it composes with findings from other components to create a larger issue.

**Final review:**
- Test each finding against the 9 critical invariants listed below
- Try to disprove each finding — construct the strongest argument for why it's NOT a bug
- **As each finding survives self-review, submit it immediately** as a GitHub issue (see format below) — don't hold findings until the end

### Step 6: Submit findings as you go

**Submit each verified finding immediately** to https://github.com/Bananapus/version-6/issues. Don't wait until the audit is complete — findings are most valuable when they arrive early. If your AI has access to `gh` CLI or the GitHub API, it should create issues directly. Otherwise, present each finding to the user for submission as soon as it's verified.

Each finding issue should include:

- **Title:** `[Audit] [SEVERITY] <one-line description>`
- **Audit seed** (so we can track coverage)
- **Repos involved**
- **Root cause** — the fundamental issue, not the symptom
- **Impact** — what an attacker gains, with concrete values
- **Proof of concept** — step-by-step exploitation sequence with function calls
- **Why this survived self-review** — the strongest counter-argument and why it failed
- **Recommended fix**

After all passes complete, submit one final summary issue:

- **Title:** `[Audit] Summary — <seed description>`
- Audit seed, subsystems covered, personas used
- Total findings submitted (with links to each issue)
- Ecosystem observations: fragile trust assumptions, missing boundary checks, areas needing more coverage
- Whether any subsystems had zero findings (confirms that surface is clean)

Merge findings that share root causes. Only submit findings with demonstrated, concrete impact.

Skip: test/, lib/, interfaces/, mocks/, *.t.sol, *Test*.sol, *Mock*.sol

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

10. Conversion formula parity
    Any two components that convert between currencies or decimal precisions for the same
    economic purpose must produce identical results for identical inputs. Cross-component
    conversion divergence is a critical bug class (ref: AM).

## Attack Surfaces

- `nana-core-v6` settlement entrypoints consumed by downstream hooks
- routing stacks that compare external market execution against native protocol execution
- bridge prepare, root, claim, and emergency-exit paths
- deployers and helpers that retain one privilege too many after launch
- wildcard permissions, project-owner abstractions, and shared registries
- chain-specific constants and singleton wiring in deployment orchestration
- hardcoded decimal assumptions in pool initialization, conversion libraries, and fee math
- try-catch blocks that silently absorb reverts from adversarial inputs (address(0), extreme prices)
- pre-existing external state (pool prices, registry entries) that an attacker can set before legitimate initialization
- permission grants that persist across NFT ownership transfers

Replay these ecosystem sequences:

1. pay -> data hook override -> downstream hook callback -> immediate cash-out
2. payout -> split hook -> downstream pay or terminal re-entry
3. cross-currency pay or cash-out with stale or missing price context
4. sucker prepare -> out-of-order root delivery -> claim or emergency exit
5. deployer launch -> ownership transfer -> registry write -> privileged runtime callback
6. swap-versus-mint or swap-versus-cash-out routing under adversarial liquidity
7. cross-currency sucker conversion with non-18-decimal tokens -> compare result to terminal store conversion for same inputs
8. pool initialization where attacker front-runs with extreme sqrtPriceX96 -> observe LP position creation
9. mintFrom with address(0) feeBeneficiary -> observe fee collection vs. refund
10. project NFT transfer -> attempt to use deployer-scoped permissions as old owner

## Accepted Risks Or Behaviors

- Some repos intentionally preserve liveness through conservative fallback behavior instead of failing closed on every external integration problem.
- Composition is a first-class design goal, so bugs that appear only in multi-repo flows are the default audit target, not an edge case.

## Verification

- read repo-local `AUDIT_INSTRUCTIONS.md` files for each component's exact scope and invariants
- use `ARCHITECTURE.md`, `RISKS.md`, and `USER_JOURNEYS.md` as the cross-repo map
- run the repo-local verification commands when validating a concrete finding
