# Lessons

Patterns captured after user corrections, to prevent repeating the same mistake.

## Re-derive a "no self-heal / immovable" claim before reporting a V4-squat brick

**Correction (2026-06-02):** In the JUNE3 audit I reported LP-DOS-1 (a lone EOA
out-of-band-initializing BAN's Uniswap-V4 pool → `deployPool` reverts) as a
CONFIRMED live brick that permanently strands BAN's reserved-split tokens. The
user corrected me: PR #150 (nana-univ4-lp-split-hook-v6) proves with a real-V4
fork test that the squat is a **transient gas-grief, recoverable by anyone**, not
a strand. The squatted price is NOT immovable: `JBUniswapV4Hook._beforeSwap`
routes a JB-token swap through Juicebox ONLY when the JB quote beats the V4 quote;
`estimateUniswapOutput` is **price-based, not liquidity-based** (`amountIn ×
sqrtPrice-ratio`, no liquidity sim), so at a squatted out-of-band price the
toward-band swap's V4 quote beats JB → `_beforeSwap` returns `ZERO_DELTA` → the
real V4 swap runs on a zero-liquidity pool and walks spot back into band for ~0
cost → `deployPool` then succeeds.

I inherited the "off-curve immovable" claim from JUNE2's memory and **re-confirmed
it without independently re-deriving the routing**, partly because the MEMORY.md
index hook still led with the stale "STRANDED / prong A no longer holds" framing
even though the memory body already contained the refutation.

**Rule:** Before classifying a "the price/state can't recover → permanent brick"
finding as confirmed:
1. Read the actual routing/quote code that supposedly blocks recovery — don't
   trust a one-line summary or a prior memory's conclusion. Here the load-bearing
   facts were (a) the quote is price-based not liquidity-based, and (b) routing is
   direction-dependent (`jbQuote > v4Quote`), not a blanket off-curve redirect.
2. A merged PR / fork test that contradicts a memory is ground truth — fetch it
   (`gh pr view`) and re-verify against the INSTALLED dep, then fix the memory AND
   its MEMORY.md index hook (a stale hook re-anchors the next pass to the wrong
   conclusion).
3. "The recovery valve isn't in the deployed code" can mean the valve was
   *unnecessary* (recovery exists another way), not that the fix regressed.

**Why:** a confident-but-wrong "no self-heal" claim survived three audit passes
because each pass trusted the previous one's summary. Re-derivation from code is
the only thing that kills an inherited false positive.

## Don't delete a multi-purpose test file when removing one symbol

**Correction (2026-06-02):** When the per-context surplus rework removed
`JBSuckerLib.convertPeerValue`, I deleted the *entire* `JBSuckerLibHalmos.t.sol`
formal-verification file. But that file verified **two** things: the peer-value
conversion (removed) **and** the merkle branch/tree-root helpers (unchanged).
Deleting the whole file silently dropped the still-valid merkle proofs, and the
CI `halmos-smoke` job — which hard-codes `--match-contract JBSuckerLibHalmos` —
went red because the contract no longer existed.

**Rule:** Before deleting a test file because a function it covers is gone:
1. Check whether the file tests anything *else* that still exists. Keep those.
2. For the removed function, see if the behavior **moved** rather than vanished
   (here the valuation moved to `JBSuckerRegistry._valued`). Re-target the test
   to the new location instead of dropping the coverage.
3. Grep CI workflows for the test contract/file name — a hard-coded
   `--match-contract`/`--match-path` turns a silent deletion into a red build.

**Why:** "the function is gone" is not the same as "the coverage is obsolete."
A test file is often a bundle; deleting the bundle to remove one item loses the
rest.

## Never `git add -A` in a repo with unrelated untracked files

**Correction (2026-06-02):** I committed each migration with `git add -A`. Several
of these repos had untracked WIP audit/test files sitting in the working tree
(`?? test/audit/`, `?? test/TestReallocateOperatorExtraction.t.sol`, …). `git add
-A` swept them all into my focused PRs. One of them (`ZeroAddressCreditDilution.t.sol`)
was unformatted, which turned the nana-core `lint / forge-fmt` CI check red — and
every PR silently carried unrelated WIP.

**Rule:** Before committing a focused change, run `git status` and stage
explicitly — `git add <the files I actually changed>` — or at minimum audit
`git diff --diff-filter=A --name-only origin/<base> HEAD` for files I didn't author.
If a migration only *modifies* tracked files (and deletes a known set), any **added**
file in the commit is a sweep-in: `git rm --cached <file>` + `git commit --amend` puts
it back to untracked without losing it.

**Why:** `git add -A` / `git add .` are convenient but they don't know what your
change is *about*. In a repo with in-flight untracked work, they conflate concerns
and can break CI (fmt/lint) on files you never touched. Stage by intent, not by
wildcard.

## The aggregator/deploy repo's build is the real consumer census

**Lesson (2026-06-02):** When migrating a shared API (suckers `remoteSurplusOf` →
`totalRemoteSurplusOf`), I scoped "consumers" to the two I knew (revnet, omni) and
migrated them. But the deploy-all-v6 build — which bundles + compiles the whole
ecosystem against the bumped dependency — surfaced a **4th** consumer I'd missed:
`univ4-lp-split-hook-v6` (`JBUniswapV4LPSplitHookMath` calls the registry too).

**Rule:** before declaring an ecosystem API migration complete, grep EVERY repo
(or the aggregator/deploy repo's flat `node_modules/*/src`) for the old symbol —
don't rely on the "known consumers" list. Bumping the deploy/umbrella repo to the
new dependency and letting it compile is the definitive census: any unmigrated
consumer becomes a hard compile error there. Do that bump early as a discovery
step, not last.

## Verify before claiming done — including formal/CI-only tools

The halmos job can't be hand-waved as "cosmetic, CI will catch it." When a tool
is installed locally (even if `python -c "import halmos"` fails, the `halmos`
binary may live in `~/.local/bin`), run the **exact CI command** locally and
confirm green before pushing. See skill `halmos-ast-cache-keyerror` for the AST
cache gotcha that bites when you do.

---

## Doc normalization must PRESERVE step-narration comments (2026-06-03)

**Mistake:** During the V6 "same hand" doc-style pass, a subagent deleted ~17
step-narration comments (`// Get a reference to…`, `// Set the stored terminals…`)
from nana-core-v6's JBDirectory.sol / JBMultiTerminal.sol, citing the STYLE_GUIDE's
"comment the WHY not the WHAT / `// increment i` is noise" rule. The user caught it:
those narration comments are the LIVED house style across the whole codebase — every
contract narrates nearly every statement that way, and that density is precisely what
makes the repos feel written by one hand. Deleting them made core LESS consistent.

**Rule for myself:**
- The STYLE_GUIDE's "WHY not WHAT" line is ASPIRATIONAL. The actual convention, observable
  in the code, overrides it. Before applying any style rule, verify it against what the
  code actually does — the lived pattern wins over the written guideline.
- In a "make it consistent" task, the bar for DELETING anything is far higher than for
  rewriting. Default to reword-in-place or leave-alone; never strip a class of comment the
  rest of the codebase keeps.
- "WHY not WHAT" means ADD the why, not REMOVE the what. Adding rationale is fine; deleting
  narration to make room for it is not.
- When a subagent reports "removed redundant WHAT-not-WHY comments," treat that as a red flag
  to inspect, not a win to accept.

Captured in AUTHOR_NOTES.md + .author-notes-scratch/CANONICAL.md (rule 1 rewritten) and the
memory entry jb-author-notes-doc-style-normalization.

---

## "Did you go deep enough, or settle?" — sample vs. exhaustive (2026-06-03)

After the V6 doc-normalization PRs, the user asked: "did you look as thoroughly as possible,
or did you at some point decide your progress was good enough?" The honest answer was: I
SAMPLED (≈6-10 files/repo + grep sweeps) and trusted the STYLE_GUIDE as ground truth. A
follow-up exhaustive sweep then found three real misses the sampling couldn't:
1. machine-local `/Users/jango/...` paths in 4 repos' shipped docs (audit only checked 2);
2. heading-continuation casing (`Section —`, `Journey:`) inconsistent across 18 repos;
3. custom-error `@notice` split ~50/50 across the ecosystem — invisible without counting
   the convention across EVERY file.

**Rules for myself:**
- When the task is "make these consistent," CONSISTENCY is measured across the whole corpus,
  not a sample. Run objective sweeps (grep/awk counts) over ALL files to QUANTIFY a convention
  before declaring done — e.g. "X of N files do Y." A 50/50 split only shows up when you count.
- Don't trust the written style guide as ground truth; MEASURE the lived convention. Where they
  disagree, surface it as a decision rather than silently picking the guide (or the lived form).
- "Good enough" is a smell. If I haven't verified the dimension exhaustively, say so explicitly
  and offer the deeper pass — don't imply completeness I didn't earn.
- When a real ecosystem-wide fork is the user's editorial call (capitalize-after-colon; bare vs
  @notice'd errors), ASK with concrete examples instead of guessing — especially when the choice
  touches the reference repo and dozens of files.

Recorded in AUTHOR_NOTES.md "Deep verification pass" + memory jb-author-notes-doc-style-normalization.

---

## NatSpec sweeps must understand @inheritdoc (2026-06-03, round 3)

Ran count-everything sweeps over struct/mapping/event/return NatSpec across all 19 repos.
Mostly clean (structs perfect; mappings ~13 stragglers; events ~11; returns a handful of
genuine internal-helper gaps) — all fixed and build-verified.

**The trap:** my `@return` grep flagged functions whose doc block had only `@inheritdoc IFoo`
as "named return missing @return." They are NOT missing it — `@inheritdoc` inherits the
interface's `@return`. One finisher agent (which I'd seeded with an explicit list of those
@inheritdoc functions) bolted explicit `@return`/`@notice` onto 5 members in router-terminal +
1 in project-payer, DIVERGING from the ecosystem norm (impls use bare `@inheritdoc`). The agent
honestly flagged "this repo had zero prior precedent for @inheritdoc + own tags" — I verified
(ecosystem scan: @inheritdoc is rare and bare everywhere) and reverted.

**Rules for myself:**
- Any "missing @notice/@param/@return" detector MUST treat a member carrying `@inheritdoc` as
  fully documented. Exclude `@inheritdoc` blocks from gap counts.
- When an agent flags "no prior precedent for what you asked," STOP and verify the convention
  before accepting — that's the agent catching my false-positive, not a nit to wave through.
- Don't seed a fix agent with candidates straight from an approximate grep; the grep's blind
  spots (data-location keywords read as return names: `returns(string memory)`; `@inheritdoc`)
  become instructions the agent dutifully executes. Filter/verify candidates first.
- A local `@dev` alongside `@inheritdoc` (impl-specific mechanics not in the interface) is fine;
  a redundant `@notice`/`@param`/`@return` that just restates the interface is not.

Recorded in AUTHOR_NOTES.md "NatSpec-completeness sweep" + memory.

---

## Owner prefers inlined NatSpec over @inheritdoc (2026-06-03, round 4)

The owner directed: "try not to use inheritdoc... prefer inlining even if its repetative, this is
easier for AIs and people to parse without extra pivots." Converted all 9 @inheritdoc sites in src
to full inlined NatSpec (copied @notice/@param/@return from each interface), kept local @dev.

**This REVERSED my round-3 stance.** In round 3 I'd treated bare @inheritdoc as the norm and
reverted some agents' inlined tags. That matched the codebase's THEN-state, but the owner's
preference is the higher authority and changed the rule. Lesson: a convention I infer from the
current code is provisional — when the owner states a preference, it wins and I re-apply
accordingly, even if it undoes a prior "correct" call. Don't treat my inferred conventions as
settled law; surface them as "current state, your call" (which is what let the owner correct it).

Final rule for this ecosystem: NEVER `@inheritdoc` in implementations — inline the full NatSpec,
plus a local `@dev` for impl-specific mechanics. Recorded in CANONICAL.md rule 4, AUTHOR_NOTES.md,
memory.

## 2026-06-09: Never `mv` files with cwd-reset bash tool — lost an untracked WIP file
- The Bash tool resets cwd between calls. A `mv test/X test/Y` (relative paths) in a compound command that ALSO `cd`s can run the mv from the wrong dir, and on a second errored invocation the file ended up moved to an unintended location and then lost.
- Untracked WIP files (here `nana-core-v6/test/TestBaseCurrencyFeedGas.t.sol`) are NOT in git and have no backup. Moving them aside to dodge a pre-existing compile error is high-risk.
- RULE: To exclude a broken pre-existing test from a build, use `forge test --no-match-path` / `--match-path` instead of moving files. Never `mv` untracked files.
- Recovery: forge `out/build-info/*.json` stores source KEYS but not content; artifacts store ABI + rawMetadata + deployedBytecode strings only. Reconstructed the file faithfully from ABI signatures + bytecode string literals + sibling setup patterns.

## A swallowed ReferenceError in a render `.then` mis-attributes to an external service

**Correction (2026-06-14):** On the jb-directory website I added a `project.acctToken`
reference inside `renderOwnersTable(participants, totalSupply, sym)` — but that helper
never receives `project`. The ReferenceError threw inside `renderOwnersAll`'s
`fetchOwnersDistribution(...).then(render)` chain, whose single `.catch` reported
**"Could not load owner distribution from Bendystraw."** I then spent several steps
testing the bendystraw queries live (all worked) before realizing the network was
fine — the error was my own scope bug, swallowed and mislabeled by an outer catch that
wraps BOTH the fetch and the render.

**Rules:**
1. When a `.then(fetch).catch(showError)` wraps rendering too, an "external service
   failed" message can actually be a synchronous render exception. Before trusting the
   message, reproduce the dependency directly (curl the query) — if it works, suspect the
   render block, not the service.
2. When adding a variable reference inside an existing helper, grep the function
   signature first. If the variable isn't a param or closure-visible, thread it through
   (add the param + update call sites) — don't assume `project`/`state` is in scope just
   because sibling functions have it.
3. Separate fetch-failure from render-failure catches when feasible, so the error text
   can't lie about the cause.

## Paying native ETH through the swap-router must skip Permit2 (allowance on 0x…EEEe returns "0x")

**Correction (2026-06-14):** Paying ETH into a USDC-accounting revnet (Artizen) errored with
"The contract function 'allowance' returned no data ('0x')." Cause: ETH into a non-ETH project is a
`viaRouter` (auto-swap) payment, and the pay card's send handler ran `buildRouterPermit2Metadata` for
ALL viaRouter pays — including native ETH. That helper reads `ERC20.allowance(owner, PERMIT2)` on the
pay token; for native ETH the token is the pseudo-address `0x…EEEe`, which has no contract code, so the
read returns `0x` and viem throws.

**Fix:** native ETH (even via the router) is paid with `msg.value` and needs no Permit2 — gate the
Permit2 branch on `viaRouter && !isNative`, and defensively early-return from `checkAndApprove` when the
token is NATIVE_TOKEN / zero address.

**Rule:** any ERC-20-only step (allowance, approve, Permit2 sign, transferFrom) must be guarded against
the native pseudo-address `0x000…EEEe` (and `address(0)`). Native value moves via `msg.value`. "viaRouter"
(swap) does NOT imply "needs token approval" — a native input still skips approval.

## viem multi-output reads return a positional ARRAY, not an object keyed by output names

**Correction (2026-06-14):** The Gossip table showed balance `0` and a false "Stale" after a successful
sync. `peerChainContextsOf()` has THREE outputs `(contexts, chainId, snapshot)`. I read
`ctxs.contexts` / `ctxs.snapshot` — both `undefined`, because viem returns multiple outputs as a
**positional array** `[contexts, chainId, snapshot]`, NOT an object keyed by output name (unlike ethers
v5). A function with a SINGLE struct output (`peerChainTotalSupplyValue → (value,…)`) IS returned as an
object, which is why supply decoded fine but contexts didn't — masking the bug.

**Rule:** for any viem `readContract` whose ABI has >1 output, index by position (`r[0]`, `r[1]`, …), or
defensively support both: `ctxs.contexts || ctxs[0]`. Single-output (incl. single tuple) → value/object;
multi-output → array.

## JB "effective supply" = totalSupplyOf + pendingReservedTokenBalanceOf

**Correction (2026-06-14):** Composition showed Sepolia supply 56.80 while the sucker's gossiped total
(and the gossip "In sync" comparison) read 91.61 — the 34.81 difference was undistributed reserved
splits. `JBTokens.totalSupplyOf` excludes pending reserved tokens, but the cash-out denominator
(`JBController.totalTokenSupplyWithReservedTokensOf`) and the sucker accounting snapshot BOTH include
them. Anywhere the UI shows "supply" for cash-out/cross-chain context, use
`totalSupplyOf(pid) + pendingReservedTokenBalanceOf(pid)`.

## CSS `background:` shorthand silently wipes a custom select-caret `background-image`

**Correction (2026-06-14):** A `<select>`'s custom dropdown caret (drawn via `appearance:none` +
`background-image: url(svg)`) showed no arrow. Computed style had `appearance:none` applied but
`background-image: none`. Cause: a LATER, same-specificity rule set `background: var(--card-bg)` (the
**shorthand**), which resets `background-image` to `none`. The caret rule's `appearance` survived (a
different property) so the bug looked partial/mysterious.

**Rule:** when an element relies on `background-image` (icons, carets, gradients), set its fill with
`background-color:` — never the `background:` shorthand — in any other rule that targets it. Debug by
reading computed `backgroundImage`: if it's `none` but you set it, search for a `background:` shorthand on
a matching selector.

## 2026-07-28: Wrong repo for "revnet webclient"
- "Our revnet webclient" = `webclients/revnet-money` (mejango/revnet-money, deployed at https://revnet.money), NOT the top-level `revnet-app` checkout (rev-net/revnet-app upstream, deployed at app.revnet.eth.sucks on Vercel).
- Rule: before investigating any webclient feedback, confirm which of the sibling checkouts is the deploy target by checking `git remote -v` and `.env.example` NEXT_PUBLIC_SITE_URL first.

## 2026-07-28: Revnet auto-issuance has no "home chain"
- REVAutoIssuance rows carry a per-row `chainId` the USER chooses; REVDeployer folds ALL rows (every chain's) into `encodedConfiguration` (config-hash parity across chains) and mints only rows where `chainId == block.chainid` (REVDeployer.sol:1067-1072).
- Rule: encode the BYTE-IDENTICAL full row list on every chain; never filter per chain, never invent a "home chain"/chain[0] default that hides the choice. An omnichain project exists across chains — chain allocation is a user decision, per row (revnet-money's ChainAutoIssuance.tsx is the reference UI).
- Corollary: any client encoding `chainId: <local chain>` for the same rows on every chain mints N× (jbm + juicescan both had this).

## 2026-08-04 — new members must be ABC-ordered within their STYLE_GUIDE section
Corrected on buyback-hook PR #174 work: I appended a new constant after MAX_TWAP_WINDOW and a new
internal helper after `receive()`. Rule: every new function/property goes in its proper section
(public constants vs internal constants vs internal views, etc.) AND alphabetically within it.
Check both the section banner and the neighbors' names before placing any new member in the
nana-* repos.

## 2026-08-07 — "immutable/permanent" claims need the full mutation-surface grep
Corrected on re-audit INV-3: I (and a verifier agent) declared the revnet ERC-20 name "permanent"
after reading only JBERC20's `initialize` guard. The rename exists three layers up:
`JBController.setTokenMetadataOf` (SET_TOKEN_METADATA=22) → `JBTokens.setTokenMetadataFor` →
`JBERC20.setMetadata` (`onlyTokens`), and REVOwner grants that permission to revnet operators
(REVOwner.sol:932). Jango knew his permission model better than the audit did.
- Rule: before filing any "X is immutable/permanent/forever" finding, grep the SETTER across the
  whole call surface — controller, registry/manager contract, and the target — plus the permission
  libraries for a matching SET_* id. `onlyX` modifiers mean the mutator lives in another contract,
  not that it doesn't exist.
- Corollary for severity: "wrong at launch but owner-correctable per chain" is a bad-default P2,
  not a P0. Reserve P0-immutability for values with no setter anywhere (accounting contexts,
  ruleset stages, encodedConfiguration hashes).

## 2026-08-07 — verify the endpoint the CLIENT queries, not a sibling's
Completing the `accountingTokenUsdRate` rollout, I introspected `bendystraw.up.railway.app` and
`testnet.bendystraw.xyz`, saw the field on both, and instructed an agent to delete the fallbacks.
The default MAINNET endpoint for juicebox-money and revnet-money is `bendystraw.xyz` — the same
indexer on an older deploy, which still rejects the field. GraphQL fails the WHOLE document on one
unknown field, so that would have deleted floor-price history from every mainnet project page. The
agent caught it and refused.
- Rule: when a check is "is capability X available?", enumerate the endpoints/hosts/chains from the
  consuming client's OWN config and test each. Never generalize from whichever host was handy.
- Rule: feature-gate lists (PENDING_SCHEMA_FIELDS and friends) must be endpoint-scoped when the
  backing service deploys per-environment, or the auto-expiry fires early and blocks CI on a fix
  that cannot yet be applied.
- Corollary: an agent that pushes back with evidence against my instruction is doing its job. The
  brief should always say "verify before making the change; report if the premise is wrong."

## 2026-08-08 — "no retrospective code comments" covers natspec too
Corrected on the JBRatioPriceFeed work: I instructed an agent to add a natspec paragraph recording
that this contract had previously existed as JBTriangularPriceFeed, been deleted, and why the need
returned. Jango: "no need." The standing rule (feedback_no_retrospective_code_comments) is not
limited to inline `//` comments — natspec, CHANGELOG prose and docblocks are all code, and none of
them are the place for "what this replaces" or "why we brought it back."
- Rule: a comment states what the code does and what constraint it must honor. Provenance,
  supersession and rationale-for-existing go in the commit message and the PR body, which is where
  someone looking for history will actually look.
- Corollary: discovering prior art (a deleted twin, an earlier attempt) is still valuable — surface
  it to the owner as a DECISION point, and put the reasoning in the commit. Just don't embalm it in
  the source.

## 2026-08-08 — don't widen CI's dependency surface to serve one new test
Corrected on nana-core-v6 PR #207: to add per-chain fork tests I had an agent add 7 RPC aliases to
foundry.toml and map 7 more secrets into test.yml. Jango: "if we didnt need many chain RPCs before,
we shouldnt use them now." Reverted; the repo stays mainnet-only.
- Rule: adding an external dependency to CI is a design change, not a test detail. Every extra RPC
  is an independent failure mode that can redden a build for reasons unrelated to the diff — I had
  ALREADY found one (Arbitrum's pinned block needs an archive endpoint; a `-full` secret fails only
  in CI), which should have been my own signal to stop rather than a footnote.
- Rule: prefer the test that proves the most with the dependencies already present. The mainnet
  cross-check against the DIRECT Chainlink USDC/ETH feed carries the whole correctness argument
  (it's the only independent oracle) and needs only the RPC CI already had.
- Where per-chain liveness checks belong: a pre-propose step in the deploy repo, which already holds
  every chain's RPC and whose job is verifying real deployed state — not the library's unit CI.

## 2026-08-08 — "it resolves" is not "it's correct": check the PRECISION of the path taken
Jango asked "you're 100% sure we're using the right pricingCurrency and unitCurrency?" — I had
verified the pairs RESOLVE (JBPrices falls back to an inverse lookup) and stopped there. They did
resolve. But the inverse path quantizes at the CALLER's decimals, and the pay path calls with the
paid token's decimals (6 for USDC), so a sub-unit feed value floored to 3 significant figures and
inverted produced a 0.1561% error in weightRatio — every USDC payer silently under-minted, forever,
on an immutable config. Every test passed; nothing reverted.
- Rule: for any lookup with a direct AND a fallback path, ask WHICH path production takes and what
  it costs. A fallback that "works" can be lossy, slower, or less safe than the direct one.
- Rule: when a conversion is registered directionally, compute the actual numbers at the actual
  decimals of the actual caller. Order-of-magnitude reasoning hides quantization entirely.
- Heuristic: quantizing a SUB-UNIT value at low decimals destroys significant figures. Arrange
  fixed-point conversions so the large number is the one being quoted at low precision.
- Meta: the user's one-line challenge found this. When someone asks "are you sure", re-derive from
  source instead of restating the earlier conclusion — my first instinct was to confirm.

## 2026-08-09 — `--fail-fast` in CI hides the suite's real state
deploy-all-v6's CI runs `forge test --fail-fast`, so every reported count is "tests until the first
failure", not a suite total. main's CI read "1 failed / 79 passed"; a full local run of the same tree
was **67 failed / 227 passed**. I twice drew wrong conclusions from CI numbers — including telling
jango a test "passes on this branch" when it had simply never been reached.
- Rule: before claiming a test passes/fails "on main" or "on this branch", run the suite WITHOUT
  fail-fast. A green-looking prefix is not a green suite.
- Rule: when a fix changes failure counts, diff the failing test NAME SETS before/after, not the
  counts. That is what proved the oracle-mock change fixed 60 tests and regressed none.
- The bug this hid: a `vm.mockCall` oracle stub returned a FIXED tick-cumulative delta regardless of
  the `secondsAgos` requested. Fine while the hook used the registered window; buyback-hook 1.3.1
  remapped max-window registrations to 30 min, so the hook divided a 2-day delta by 1800 →
  InvalidTick → the fee project's data hook reverted → JBMultiTerminal caught it, emitted
  FeeReverted, and REFUNDED the protocol fee. 60 fork tests were failing on that one stub.
- Heuristic: a mock that returns a constant where the real dependency returns a FUNCTION of its
  arguments is a time bomb — it works until a caller changes the argument. Mock the behavior, not
  one sample of it.

## 2026-08-09 — a fork test pinned to "latest" is a random CI failure
Chasing the last red check in deploy-all-v6: one suite (TwapOracleUpgradeStressFork) overrode
`_forkBlock()` to return 0, so `RevnetForkBase.setUp` called `vm.createSelectFork("ethereum")` with
no block while every other fork test used the shared pin 21_700_000. Forking at latest races the
RPC — a load balancer answers from a node that does not have the just-produced block, and setUp dies
with `error code -32001: block not found`. It reddened roughly one run in three, in a DIFFERENT test
each time, which reads as "flaky suite" rather than "one unpinned fork".
- Rule: every fork test pins a block. "Latest" is not a version; it is a moving target shared with
  whatever the RPC's load balancer is doing.
- Diagnostic: `grep -rn "createSelectFork(" test/ | grep -v ", [0-9_]*)"` finds the unpinned ones,
  and an override returning 0 hides from that grep — check `_forkBlock`-style indirection too.
- The override earned nothing: the suite passed at the shared pin, so deleting it (rather than
  pinning it separately) was correct — now it tracks the repo-wide pin.
- Separate trap while verifying: running the full fork suite back-to-back rate-limits the RPC and
  fails at `could not instantiate forked environment`. That is self-inflicted, NOT the bug under
  investigation — space the runs out before concluding anything.

## 2026-08-24 — silent no-op string replace
Python/sed `str.replace` edits that don't match (file was reformatted by prettier) succeed silently. Rule: after any scripted edit, grep the file for the NEW text and fail loudly if absent — never report "done" from exit code alone. Prefer the Edit tool, which errors on a missing match.

## 2026-08-24 — middots again
The no-dot-separator rule (memory: jb-website-no-dot-separators) applies to EVERY webclient, new ones included. Grep `·` before every push of UI copy. Use commas, "in", "for", parentheses instead.

## 2026-08-27 — STYLE_GUIDE ordering slipped through a "cleared for merge" review (router PR #154)
- Before signing off any v6 Solidity PR, run a mechanical alphabetization pass over every touched `src/` file: sections from the `// ---- banner ---- //` lines, members (functions/errors/events/storage) sorted case-insensitively within each. Reviewing for correctness is not reviewing for style; do both.
- Moving multi-line blocks by hand-picked line ranges is error-prone (off-by-one split a function). Locate blocks by anchor text (natspec start → closing `    }`), never by numbers read off an earlier listing.
- "Cleared for merge" twice, then 4 fresh adversarial agents found a permanent-lock bug and a mainnet liveness bug in an hour. For custody/escrow code, an independent multi-lens pass (theft, liveness/gas, integration with immutable callers, coverage) is part of the review, not an optional extra — run it BEFORE saying "good to go", not after being asked "are you sure".
- Any wrapper that converts revert → success must be checked against every upstream try/catch it silences.
- My first fix for the retention bug gated on WHO is calling (controllerOf / originalPayer). Both were spoofable within an hour. When a check's purpose is "recognize a situation", key it on a property of the funds/state that no caller can shape (here: the token is the source project's own), not on caller identity. And re-run the adversarial pass on the fix itself — the second pass is where the fix's own bugs get found.
- Twice today I pushed a commit whose test suite wasn't green: once because my `&&` chain keyed off `grep`'s exit code, once because CI compiles with `--deny notes` and my local build didn't. Gate commits on the *same command CI runs* (`forge test --deny notes --skip "*/script/**"`) with its own exit code, never on a piped grep.

## 2026-09-01 — Succulent (extensions/succulent)
- Never export a shared constant from a `'use client'` module and import it into a server component: it arrives as a client-reference stub function, builds fine, and fails only at request time. Put shared constants in `src/lib`.
- Never swallow a server data fetch with `.catch(() => [])` without a `console.error`; the bug above read as "indexer empty" until the error was logged.
- `next start` does not serve `public/` or `.next/static` for `output: 'standalone'` builds locally in a useful way; use `next start` for local checks and `node server.js` only inside the Docker image where the Dockerfile copies those dirs.
- Para 3.x + wagmi 3.7 + viem 2.55 needs `--legacy-peer-deps` (optional peer chain accounts → privy → permissionless wants ox ^0.8 while viem pins ox 0.14). jbm/eth-shop lockfiles hide this; a fresh app hits ERESOLVE. `.npmrc` is under a Read deny rule in this session, so the flag lives in the Dockerfile `npm ci` and README instead.
- Tailwind v4: a plain (unlayered) rule in globals.css outranks every utility class, so `[background-position:right_2px_center]` could not override `.select-caret`'s 12px. Put custom component classes inside `@layer components` so utilities win. Also: native `<select>` text has a browser-specific inner inset; for exact spacing paint the visible word in a sibling and make the select's own text transparent (`[&>option]:text-pine` keeps the popup readable).

## 2026-09-02 — new UI must be modeled on the canonical surface, and rendered, before it ships

- The LP "Edit position" review was built by copying the add-liquidity form's inline
  box instead of the Pay confirm dialog, which is the one multi-step shell (memory:
  jb-revnet-exactcallcard-confirm-consolidation). The note existed; I did not read it
  before building. Rule: before adding any confirm/review/queue UI, open the Pay
  confirm (revnet V6PayConfirmDialog, jbm PayPanel) and reuse its grammar — summary
  rows, shared TxSteps with default styling, phase line, primary wallet button.
- No screen was rendered during a full day of UI work because the browser tools were
  unavailable; tsc/lint/tests/build cannot catch "looks unlike Pay" or bad copy.
  Rule: when the Chrome extension or Playwright is unavailable, fall back to the
  gstack `browse` headless browser against a local `next dev` or the live site, and
  attach a screenshot of every new surface to the recap. State explicitly which
  changes were NOT rendered.
- Field labels and prose that name a concept ("to hold") are design decisions;
  check them against the copy-voice notes and prefer the wording an existing
  surface already uses.

## 2026-09-03 — "stop asking me for permission, do it"
- jango runs these sessions autonomously. Do not pause for confirmation on
  reversible work inside the requested scope (edits, tests, builds, subagent
  fan-out, screenshots). Ask only for destructive or out-of-scope actions.
- When scope widens mid-turn ("do this for all txs across all three clients"),
  plan in tasks/todo.md and dispatch, then report at the end. No interim
  "shall I" messages.

## 2026-09-03 — Railway build failed after "all gates green"
- `tsc --noEmit` passed but `next build --webpack` failed on a
  `SimulateCallsReturnType` assignment in code I edited AFTER the agent's
  build run. The production build is the only gate that counts, and it must
  be re-run after the LAST edit, not once mid-sweep. Railway auto-deploys
  every push to main, so a red build means the live site silently stays old.
- Before reporting "pushed": run the repo's `build` script exactly as the
  Dockerfile does, then watch the Railway deployment (or the live bundle)
  flip before telling jango it's live.

## 2026-09-04 — never stash-round-trip in a worktree another agent may commit to
A subagent verified "clean HEAD" by `git stash push` → test → `git stash pop` in
webclients/revnet-money while the parent session committed in the same tree. The
pop then applied an unrelated month-old user stash and left 23 conflicts; it was
recovered with `git reset --hard HEAD` and no work was lost, but only by luck of
timing. Rule: to test a clean tree, use `git worktree add <tmp> HEAD` (or a
subagent with `isolation: "worktree"`), never stash in a shared checkout. Same
for the parent: do not commit in a tree a worker was told to leave uncommitted
until it has reported.

## 2026-09-04 — activity row meta line has no spare room
Added an "[audit]" copy-prompt link next to "time on <chain>" in every
activity row (jbm, revnet, juicescan). jango: "we dont need the Audit tag in
activity items, it takes up too much space". Rule: the row meta line
(amount + chip left, time + chain right) is full at narrow widths; new
per-row affordances go in the row body, a hover title, or a detail view,
never that line. Ask before adding any per-row control to a dense feed.

## 2026-09-07 — new functions must land in ABC order within their STYLE_GUIDE section
Placed `_hookPreviewPayTokenCounts` next to the helper it wrapped instead of alphabetically (after `_hasSameRoutingAsset`, before `_isCircularTerminal`). Rule: before inserting any function, `grep -n "^    function "` the section and pick the alphabetical slot, not the "related" slot.

## 2026-09-07 — never rescale a floored small quantity by a large ratio
Previewed a ~1 ETH direct-mint leg by scaling the hook's rounded 3-wei swap-leg figure by (direct/swap). Rounding amplified 3e17x and went to zero at 100% reserve. Rule: when an execution path computes X from source rates (weight, price), the preview must recompute X from the same source rates, never invert a rounded derived value. Look for `mulDiv(a, roundedSmall, small)` shapes.

## 2026-09-07 — new functions carry inline "why" comments like their neighbors
Replaced a commented helper with an uncommented one. Rule: every non-trivial statement group in nana-* source gets a one-line `//` explaining why, matching the surrounding function density, before pushing.

## 2026-09-08 — Sticky production review
- Local `forge fmt` (1.7.0) disagrees with CI's pinned 1.8.1 on chained-call wrapping and rewrote five test files I never touched. Rule: check `forge --version` against the repo's CI pin before running `forge fmt`; if they differ, revert untouched files with `git checkout --` and hand-check the files you edited. Never gate a commit on a formatter the CI does not run.
- NatSpec `@param` tags require named parameters, so an "unused parameter" warning in V6 source cannot be silenced by unnaming; leave it.
- A prior audit's "tests cover X" can mean the tests assert the defect as acceptable (here: donation tests that only used exact-multiple deposits). When a fix claims to close a griefing path, write the test from the attacker's side (non-multiple deposit + 1-wei front-run), not the happy path.
- A supply floor in share atoms is the cheap defense against sole-holder price coarsening, but it trades a liveness edge (last exiter must leave the floor behind when others hold sub-floor dust). Encode that edge explicitly in the fuzz test instead of narrowing the fuzz bounds to hide it.

## 2026-09-10 — rerun the full suite after the last edit, not the last big edit
Pushed deploy-all #244 with a distribute.mjs/chains.json change made after the final full-suite run; a source-string regression (`PostDeployDistributeArtifactGap`) pinned the old layout and CI went red. Rule: the suite run that counts is the one after the final diff. Repos here keep tests that assert on script source text, so even a JS/JSON-only change needs `forge test`.

## 2026-09-10 — a wallet primitive fixed in one Next client must land in the other
revnet-money got `proposeSafeBatch` (one Safe MultiSend per flow) on 2026-09-03 where the LP
bug was hit; juicebox-money was left proposing step by step with a "not done" memory note.
jango: "both clients should have been architecturally the same... revnet is a subset of jbm."
Rule: any new wallet boundary (sendCalls, Safe proposal shape, simulation gate, review dialog)
ships in juicebox-money AND revnet-money in the same change (juicescan where the flow exists);
diff the primitive lists of both clients before recapping. A "still step by step in the other
client" line in a recap is a defect, not a note.

## 2026-09-19 — git stash in a shared worktree (self-caught)
Used `git stash` in extensions/jbcenter/mcp to check whether a test flake pre-existed.
Rule already in memory: never stash in the shared worktree; other sessions' uncommitted
edits ride along. To check a flake on a clean tree: `git worktree add /tmp/x HEAD` or
read the test and reason, or run it against `git show HEAD:file` copies in the scratchpad.

## 2026-09-20 — `forge test` green ≠ deployable (self-caught)
HomerunDeployer passed 109 Foundry tests at 25,678 B runtime, 1,102 over EIP-170; Foundry
only warns on size. The Anvil fork script caught it (`CreateContractSizeLimit`).
Rule: before calling any contract "done", run `forge build --sizes` and read the margin
column for our contracts; keep ≥2 KB headroom. Fix pattern in this codebase is an external
library (`JB721TiersHookLib` precedent), not optimizer knobs — runs=1 saved 29 bytes.

## 2026-09-20 — juice-sdk release run enforces 100% line coverage (self-caught)
PR #122 merged green on CI but the release workflow (`npm run test:coverage`, floors 100/95/100/100)
failed, so nothing published. Rule: before merging a juice-sdk PR run
`npx vitest run --coverage` in the package and cover every new branch (abort, timeout, catch).

## 2026-09-20 — middot in a feed line (repeat of a known rule)
- Rule already in memory (`jb-website-no-dot-separators`): no ` · ` anywhere in the webclients. I still wrote
  `minted item #2 (name) · 0.0016 ETH (80%) sent to item recipients`.
- Pattern to prevent: before composing ANY inline UI string with a separator, grep my own diff for `·` — and in an
  activity feed the answer is never a separator at all: one bullet per fact.

## 2026-09-21 — Center's Docker build runs tsc over test files (self-caught)
A test-only TS error (an object literal narrower than an inferred parameter type) passed vitest and
my `tsc --noEmit | grep -v <env noise>` filter, then failed Railway's `npm run build` and left
production on the previous deploy. Rule: before pushing Center, run `npx tsc --noEmit -p .` on the
*final* tree (after adding tests) and read every line; never filter tsc output by file name.

## 2026-09-21 — "verified live" meant "rendered live" (user found the passkey never worked in the frame)
The framed sign-in was signed off as verified on homerun.money after visual checks; the passkey ceremony
itself had never run inside the frame, and it could not have: a bare `allow="publickey-credentials-get"`
on a `src`-less iframe (the launch form posts into it by name) delegates nothing in Chrome. Rules:
- A feature whose point is a browser permission (WebAuthn, clipboard, camera) is not verified until that
  API call has succeeded in the exact embedding — a CDP virtual authenticator or the user's own tap.
  "The page renders" and "the button is enabled" are not verification.
- Permissions-Policy `allow` with bare feature names means `'src'`; for an iframe navigated by a named
  form target or `window.open`-style targeting there is no `src` to resolve, so name the origin.
- The SDK's `type-check` script also runs `tsconfig.test.json`; run both before pushing, not just
  `tsc --noEmit`.

## 2026-09-21 — pushed Center with a red suite, twice over
- `aab20d2` removed the signup intro sentence; `rest-wallet-site.test.ts` (not a signup suite) asserted that
  sentence as the page marker. I ran only the suites named after the files I touched. Rule: for a Center
  change, run `vitest run test/rest-wallet-site.test.ts` plus every suite that greps for a string I removed
  (`awk '/<old text>/' test/*.ts` before deleting copy).
- `npx vitest run … | awk '/Tests /' && git commit …` — awk's exit is 0, so a red run commits and pushes.
  Rule: `set -o pipefail` or run vitest as its own command and read the result before committing. Never put
  commit+push in the same chain as a filtered test run.

## 2026-09-21 — "verified" a CSS change with setContent, which has no CSP (bolt invisible in prod)
The drawn bolt was `mask: url("data:image/svg+xml,…")`; Center serves `img-src 'self'`, so production
never painted it, while my Playwright `setContent` render (no headers) showed it fine. Rule: when
rendering Center pages for a visual check, serve them through a route that sets the real CSP header
(copy it from `curl -D -`), never `setContent`. Prefer `clip-path: polygon()` over data: images for
icons on CSP'd pages.

## Check the provider code, not a doc line, before declaring a capability missing

**Correction (2026-09-21):** I planned a separate direct-send lane for testnets because
Center's SPONSORSHIP.md said the Relayr adapter serves mainnets only. jango: "there's a
testnet Relayr too. our testnet setup should be the same as our mainnet setup." The adapter's
own `provider.ts` already carried `RELAYR_TESTNET_CHAINS` and a family-detecting quote parser;
only `RelayrSponsorshipService`'s policy gated chains, not `SponsorshipChain`.

**Rule:** before designing around a stated limitation, grep the implementation for the
chain/feature constants and find where the gate actually lives. A doc sentence describes one
caller's policy, not the transport's reach.

## A reviewer brief must carry every fact the implementer was given

**Observed (2026-09-21):** the Task 13 reviewer flagged three verified facts as "invented"
because my reviewer prompt listed a shorter ground truth than the implementer's dispatch. The
Task 3 reviewer called an implementer's citation "fabricated" because it cited my own dispatch
note the reviewer never saw.

**Rule:** the reviewer's constraints block is a superset of the implementer's dispatch notes,
including controller resolutions. Otherwise reviews produce false positives that cost a fix
round to adjudicate.

## 2026-09-21 — reflex `git stash` in a shared worktree

Ran `git stash push` to bisect an unrelated test failure in juicebox-money, then had to pop it
immediately. The memory rule (no stash in a shared worktree) already existed; the miss was
reaching for stash as a bisect reflex.

**Rule:** to check whether a failure is pre-existing, read the failure first. If it dies in a
file the diff does not touch (here: a wagmi mock in Providers.tsx), it is pre-existing — no
bisect needed. If a bisect is truly needed, use `git worktree add` on HEAD, never stash.

## 2026-09-21 — Trace the consumer before ruling on server-side state
Ruled "drop the deployer's failed-outcome cache, a retry just starts a new run" without reading the client's 3 s poll loop; an unconditional new run would have made every failure invisible (the poll finds no run, starts another deploy, forever). The implementer caught it. Rule: before ruling that a server should forget or re-derive state, read every caller that polls or retries it and say what each one sees on the next call.

## 2026-09-21 — A signing guard must pin the whole signed text
Beep's publish guard (and the first SDK port of it) checked only that Center's message *contained* the content hash, then handed the whole message to the signer. A hostile or misconfigured Center could wrap the hash in any text (a SIWE body for another domain) and get a valid signature. Rule: when code signs text a server supplied, compare the entire text to a locally built template; never substring-match. The same goes for envelopes: normalize the way the server does (sorted arrays, trimmed strings) and compare whole values.

## 2026-09-22 — Two implementers in one worktree race on the index
Pipelining a fix round and the next task's implementer in the same worktree (disjoint files) still races on `git add`/`git commit`: one agent's staged files were swept into the other's commit, and it had to `reset --soft` and re-commit. Content survived, but it cost a round trip and a hand check. Rule: at most one writing agent per worktree; pipeline only read-only reviewers alongside an implementer. If parallel implementation is worth it, give the second agent its own worktree on a stacked branch.

## 2026-09-22 — Modeled RPC for wagmi must speak Multicall3
A Playwright harness that answers `eth_call` with a bare value breaks wagmi reads: wagmi batches through Multicall3 `aggregate3`, so viem decodes the bare value as an array offset and the flow dies silently. Model `aggregate3` (decode the calls, answer one value each). Also: a modeled Center must return the real signing template or `publishSignedIntent` refuses to sign; and with an injected EIP-6963 wallet answering `eth_accounts`, wagmi reconnects on mount, so there is no "Sign in" click to script.

## 2026-09-22 — Assert on what renders, not on the request object
The Task 4 fix removed `from` from the reviewed calls and its unit test asserted `review.calls[0].from === undefined` on the request object. The provider that renders the dialog defaulted `from` back to the connected account, so the merchant still saw themselves as sender. A live dry run of the real dialog caught it. Rule: for user-facing claims ("no From row"), the test must render through the real provider/dialog and assert the DOM, and a live or browser proof should run before shipping anything a person signs.

## 2026-09-22 — `nvm use` hides npm-global CLIs
The Railway CLI is an npm global under the default Node; after `source nvm.sh && nvm use 22` in the same shell it vanishes ("command not found: railway") and a deploy step silently does nothing. Rule: run Railway (and other npm-global tools) in a shell without `nvm use`, or split the command.

## 2026-09-22 — a background test run is a reader in the worktree too

A full vitest run was still collecting in center-lane-recovery when the fix
implementer started editing there; one test read the new store against the old
assertion and failed for no real reason. Rule: before dispatching a writer into a
worktree, stop or wait out any background suite running in it, or run the suite
from a throwaway `git worktree add <tmp> HEAD`. The one-writer rule covers readers
that take minutes.

## 2026-09-22 — the Plan agent type cannot write files

Three planners were dispatched as `subagent_type: Plan` to write plan files; that agent
is read-only, so each returned a 40-60 KB plan inline and it had to be recovered from the
task transcript (JSON-escaped, HTML entities, and the outer ```` fence must be cut at the
last fence before the closing summary, not the first). Rule: a subagent that must produce
a file is `general-purpose`; `Plan` and `Explore` only for reports that stay small.
