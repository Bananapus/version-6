# Webclient caching — what is provably immutable, and how to exploit it

Scope: `webclients/juicebox-money`, `webclients/revnet-money`, `webclients/juicescan`.

The goal is not "add a cache". It is: **never re-fetch an answer that cannot
have changed, and never show a spinner for an answer we already had.**

---

## 1. What the protocol actually guarantees

Every claim below is read off V6 source, not inferred. This matters because
"probably won't change" is not a cache key — "cannot change" is.

### 1.1 Ruleset rows are append-only — PROVEN

`nana-core-v6/src/JBRulesets.sol`:

```solidity
uint256 rulesetId = latestId >= block.timestamp ? latestId + 1 : block.timestamp;
```

`queueFor` always mints a **new** `rulesetId` strictly greater than
`latestRulesetIdOf`. The three storage maps it writes —
`_packedIntrinsicPropertiesOf`, `_packedUserPropertiesOf`, `_metadataOf` — are
only ever written for that new id (`_packAndStoreIntrinsicPropertiesOf` is
called exclusively from `_initializeRulesetFor` for the id being created).

**No code path rewrites an existing ruleset row.**

→ `(chainId, projectId, rulesetId)` is a permanently immutable cache key.
Cache forever, across sessions.

What *is* mutable: which ruleset is "current"/"upcoming" (a later `queueFor`
supersedes a queued one), so `currentRulesetOf` / `upcomingRulesetOf` are
Tier C, even though every row they return is Tier A.

### 1.2 A revnet's entire stage schedule is immutable — PROVEN

`REVDeployer.deployFor` builds every stage up front
(`_makeRulesetConfigurations` over `configuration.stageConfigurations`) and
queues them in one `CONTROLLER.launchRulesetsFor` call, which requires the
project to have no controller or rulesets yet.

`REVOwner._operatorPermissionIndexesOf` grants exactly nine permissions:

```
SET_SPLIT_GROUPS, SET_BUYBACK_POOL, SET_BUYBACK_TWAP, SET_PROJECT_URI,
SUCKER_SAFETY, SET_BUYBACK_HOOK, SET_ROUTER_TERMINAL, SET_TOKEN_METADATA,
SIGN_FOR_ERC20
```

**`QUEUE_RULESETS` is not among them, and `REVOwner` exposes no queue entry
point.** Nobody can add or alter a stage after deployment.

→ For a revnet, `getAllRulesets(chainId, projectId)` — past, current, **and
future** — is immutable for the project's lifetime. This is the single
biggest win available: Terms, the issuance ladder, the Overview price chart,
and stage splits all hang off it, and today every one of them refetches it.

### 1.3 The project token ADDRESS is write-once — but its symbol is not

`JBTokens.setTokenFor` reverts with `JBTokens_ProjectAlreadyHasToken` if
`tokenOf[projectId]` is already set, and enforces 18 decimals.

→ token **address** and **18 decimals**: immutable once observed non-zero.

**Correction to an earlier draft of this plan:** the token's *name and symbol*
are NOT immutable. `JBERC20.setMetadata(name_, symbol_)` rewrites both, reached
via `JBController.setTokenMetadataOf` under `SET_TOKEN_METADATA` — which is one
of the nine permissions a revnet operator holds (§1.2). Cache the address
forever; treat symbol/name as Tier C.

### 1.3b Fund access limits ARE immutable per ruleset — PROVEN

Unlike splits (§1.5), `JBFundAccessLimits.setFundAccessLimitsFor` has exactly
one call site in the whole controller — inside `_configureRulesets` at queue
time. `JBController` exposes no external setter for it.

→ payout limits and surplus allowances by
`(chainId, projectId, rulesetId, terminal, token, currency)` are Tier A.

### 1.3c Spent allowance for a PAST cycle is frozen — PROVEN

`JBTerminalStore` keys usage by cycle/ruleset:

```solidity
usedPayoutLimitOf[terminal][projectId][token][ruleset.cycleNumber][currency]
usedSurplusAllowanceOf[terminal][projectId][token][ruleset.id][currency]
```

Both only ever increase, and only for the *active* cycle.

→ once a cycle has ended, its usage row is immutable (Tier A). During the
current cycle it is **monotonic** — a cached value is a valid lower bound, so
render it immediately and revalidate.

### 1.3d Price feeds are append-only — PROVEN

`JBPrices.addPriceFeedFor` pushes onto `_priceFeedsFor[project][pricing][unit]`
("Keep existing feeds immutable: appending preserves the primary feed"). No
path removes or rewrites an entry.

→ feed *existence and identity* is monotonic. The **price a feed returns is
not** — `pricePerUnitOf` stays Tier C.

### 1.3e The three price series are all immutable history — PROVEN

This is the highest-value cluster, because it is the entire Overview chart plus
the new Market chart, on every project page, in all three clients.

**Past AMM price.** Each swap's `sqrtPriceX96` is an event field, and the price
is a pure function of `(sqrtPriceX96, projectTokenIsCurrency0, pairDecimals)`.
Same for a pool's `initialSqrtPriceX96`. Past finality, every point is frozen —
including the legacy `terminalTokenAmount / projectTokenAmount` fallback.
→ Tier A, keyed `(chainId, poolId, toBlock)`. It must be keyed by **poolId**,
not project: `poolKeyOf` is mutable, so a repointed pool starts a new series
(this is exactly the bug fixed in juicescan today).

**Revnet issuance price, for ALL time.** Stages are immutable (§1.2) and the
weight-cut curve is deterministic (§1.4) — so past, present and every future
stage cut can be computed with **zero network calls, forever**. The strongest
case in the system. For a non-revnet only past+current qualify; its owner can
still queue a different future.

**Past cash-out price.** Derived from indexed `suckerGroupMoments`
(balance, tokenSupply at a timestamp) and the cash-out tax rate, which comes
from the ruleset row for that moment — immutable by §1.1. So every historical
floor point is frozen; only the live floor is Tier C.

### 1.3f Closed loans and claimed auto-issuance are terminal — PROVEN

`REVLoans` `delete _loanOf[loanId]` on repay/liquidate/reallocate, and loan ids
never repeat → **once a loan reads empty it is empty forever**. Its original
terms live in the open event → immutable.

`REVOwner.autoIssueFor` zeroes `amountToAutoIssue[revnetId][stageId][beneficiary]`
on claim. The on-chain read is therefore "remaining", monotonically decreasing
to zero; the *scheduled* amount is immutable from the deploy event.

### 1.3g Sucker membership is append-only — PROVEN

`JBSuckerRegistry._suckersOf[projectId]` retains entries "INCLUDING deprecated
entries that are no longer listed in `suckersOf`". Nothing is removed;
deprecation is a state flag.

→ "address X is a sucker of project P" is monotonic. Active-vs-deprecated
status is not.

⚠️ **`suckerGroupId` is point-in-time** and changes as suckers are added — do
not use it as an immutable cache key. Key by `(chainId, projectId)`.

### 1.4 Deterministic — compute, do not fetch

Issuance weight decay is a pure function of stored ruleset fields and time
(`deriveWeightFrom` / the on-chain `_weightCacheOf` is only a gas
optimisation). Clients already implement it (`chartUtils.resolveStages` +
`rateAtTime`, revnet's `calculatePriceAtTimestamp`).

→ The whole issuance-price curve, for all time, needs **zero** network calls
once §1.2 is cached. Same for cash-out curve shape given (surplus, supply,
tax) — `cashOutQuote.ts:contractCashOutQuote` is exact integer math.

### 1.5 The trap: splits are NOT immutable by ruleset

`JBController.setSplitGroupsOf(projectId, rulesetId, splitGroups)` accepts
**any** `rulesetId`, including one already in the past, gated only by
`SET_SPLIT_GROUPS` — which revnet operators hold (§1.2).

→ `splitsOf(project, rulesetId, group)` is Tier C. Do not let "keyed by
rulesetId" tempt you into Tier A here. This is the one place where the
obvious generalisation is wrong.

### 1.6 The general lever

Any read pinned to a **finalized block number** is immutable. That is the
escape hatch for everything not enumerated above: `readContract({ blockNumber })`
converts a Tier C read into a Tier A one at the cost of one extra parameter.

---

## 2. What the clients do today (measured)

| | juicebox-money | revnet-money | juicescan |
|---|---|---|---|
| default `staleTime` | 30 s | 30 s | n/a |
| default `gcTime` | 10 min | 10 min | n/a |
| cross-session persistence | **none** | **none** | **none** |
| `useQuery` call sites | 87 | ~60 | n/a |
| keys using `Infinity` staleTime | 3 | 5 | n/a |
| cache mechanism | React Query (memory) | React Query (memory) | 78 bespoke `var _xCache = {}` objects |

`localStorage` in juicescan holds only preferences (network, RPC override,
fonts). Its 78 in-memory maps die on every reload.

Server side: jbm has `revalidate = 120` on the homepage and `revalidate: 300`
on the project page; the SDK's bendystraw policies top out at
`BENDYSTRAW_CACHE_TTL_MS = { live: 15s, standard: 30s, stable: 60s }`.

**Nothing anywhere treats anything as immutable.** Every project page reload
re-fetches ruleset history, swap history, and price moments that provably
cannot have changed.

### Why this hurts right now

Measured against `bendystraw.xyz` during this session:

- `project(projectId, chainId, version)` — **8.5 s, 9.6 s, 13.0 s**
- `projects(where: {...})` — 9.2 s, 11.2 s
- full introspection — 4 s

Those latencies already broke two things today: the juicescan pool-price
history (a 3.5 s soft timeout on a slow project row silently emptied the
chart — fixed by removing the dependency) and the juicescan publish gate
(15 s introspection timeout). Caching immutable history is the structural fix
for that whole class of failure: the data can't change, so a slow indexer
should never be on the critical path twice.

---

## 3. The tiering

**Tier A — provably immutable. Cache forever, persist to disk.**
- ruleset rows by `(chainId, projectId, rulesetId)` (§1.1)
- **all revnet stages** by `(chainId, projectId)` (§1.2)
- project token **address** + its 18 decimals, once non-zero (§1.3)
- fund access limits by `(chainId, projectId, rulesetId, …)` (§1.3b)
- used payout limit / surplus allowance for an **ended** cycle (§1.3c)
- 721 tier config — price, initialSupply, category, flags — by `(hook, tierId)`
- external ERC-20 metadata by `(chainId, address)` for non-upgradeable tokens
  (NOT project tokens, §1.3)
- bendystraw events with `timestamp < now − finality`: swaps, buyback pool
  events, payments, price moments, auto-issuances
- **the past AMM price series** by `(chainId, poolId, toBlock)` (§1.3e)
- **the past cash-out price series** by `(chainId, projectId, toBlock)` (§1.3e)
- closed-loan terms, and the auto-issuance schedule, from events (§1.3f)
- transaction receipts and logs by txHash below finality
- deploy-registry contract addresses by `(chain, deployment)`
- IPFS content by CID
- any read pinned to a finalized block (§1.6)

**Tier A-pure — no network at all, just compute.**
- Uniswap `poolId` = keccak of the encoded poolKey
- `tierIdOfToken(tokenId)` — the tier is encoded in the token id
- the pool state slot from a poolId
- **a revnet's entire issuance ladder, past and future** — zero network (§1.3e)
- every historical AMM point from its stored `sqrtPriceX96` (§1.3e)

**Tier A-monotonic — cache the "yes" forever, re-check the "no".**
These only ever transition one way, so a positive observation is permanent:
- project N exists on chain C (`JBProjects` mints `++count`, no burn path)
- the project has a token / an ERC-20 is deployed
- a price feed exists for a currency pair (§1.3d)
- a Uniswap pool is initialized (sqrtPriceX96 0 → non-zero)
- `JBSucker.executedLeafHashOf[token][index]` — a claimed leaf stays claimed.
  Caveat: **root validity is NOT monotonic** — `_inboxRootRingOf` is a small
  ring buffer and old roots are evicted, so "this proof still validates" must
  be re-checked even though "this leaf was executed" need not be.
- a 721 tier is removed (`_removedTiersBitmapWordOf` only sets)
- a sucker is registered for a project (append-only set, §1.3g)
- a loan is closed; an auto-issuance is claimed (§1.3f)
- cumulative counters that only ever grow: volume, paymentsCount,
  contributorsCount. A cached value is a valid lower bound. (Holder count is
  NOT one of these — balances can fall to zero.)

**Tier B — deterministic. Compute, never fetch.**
- issuance price at any t from the stage list
- future revnet stage boundaries
- cash-out curve given its inputs

**Tier C — mutable, but stale-while-revalidate is correct.**
- balances, supply, surplus, pool `sqrtPriceX96`, LP positions, loans,
  permissions, **splits** (§1.5), current/upcoming ruleset selection,
  **project token name/symbol** (§1.3), `pricePerUnitOf` (§1.3d),
  721 `remainingSupply` / discount / metadata URI, buyback `poolKeyOf`
  (mutable — `SET_BUYBACK_POOL` is an operator permission)
- Render the last known value immediately; refetch in the background; mark
  the value as updating rather than replacing it with a skeleton.

**Tier D — never cache.**
- anything gating a transaction: hook-aware quotes at submit time,
  allowances, nonces, `simulateContract` results. jbm already flags that
  display quotes (`currentReclaimableSurplusOf`) must not be reused for a tx.

---

## 4. Mechanism

### 4.1 juicebox-money + revnet-money (React Query)

1. **Mark, don't guess.** Add `meta: { tier: 'immutable' }` to Tier A queries
   via a shared helper:

   ```ts
   export const immutableQuery = <T>(opts: UseQueryOptions<T>) => ({
     ...opts,
     staleTime: Infinity,
     gcTime: Infinity,
     meta: { ...opts.meta, tier: 'immutable' as const },
   })
   ```

   Opt-in, not opt-out: a query is only immutable when someone proved it.

2. **Persist only the marked ones.** `persistQueryClient` with an IndexedDB
   persister and:

   ```ts
   dehydrateOptions: {
     shouldDehydrateQuery: q =>
       q.meta?.tier === 'immutable' && q.state.status === 'success',
   }
   ```

3. **Buster.** Include the deployment-registry version in the persister key so
   a protocol redeploy drops everything.

4. **Tier C paints instantly too**: `placeholderData: keepPreviousData`, plus
   a small persisted "last known" layer for the handful of headline numbers
   (balance, supply, price) so a return visit shows values, not skeletons.

### 4.2 Edge (both are Next.js — the biggest lever)

Split every history endpoint into an immutable slice and a live tail:

- `/api/price-history?...&toBlock=<finalized>` →
  `Cache-Control: public, max-age=31536000, immutable`
- the live tail (`fromBlock=<finalized>`) →
  `Cache-Control: s-maxage=15, stale-while-revalidate=300`

Because the immutable URL is content-addressed by `toBlock`, bendystraw's
5–13 s becomes a **once per CDN key** cost rather than once per user. Apply to
`price-history`, `participants`, `activity`, `movements`, `auto-issuances`.

### 4.3 juicescan (static, IPFS — no server)

No edge available, but it has a perfect natural buster: **the build CID**.

Add one small `src/cache.js`:

```js
getImmutable(key, loader)  // IndexedDB, namespaced by (buildCid, network)
```

and route the Tier A subset of its 78 in-memory maps through it —
`_bendystrawProjectRecordCache`, `_tiersCache`, `_accountingTokenMetadataCache`,
`_projectTokenInfoCache`, ruleset/stage reads, swap history. Those maps
already have string keys of the right shape; this is a backing-store swap, not
a redesign.

---

## 5. Safety rules

- **Reorgs**: only treat events as immutable below a finality margin
  (32 blocks / ~2 epochs on L1; use the chain's finalized tag where the RPC
  supports it). Above the margin, Tier C.
- **Never persist anything address-scoped to the connected wallet** beyond the
  session — balances and permissions change, and a stale allowance shown as
  current is a transaction hazard.
- **Never let a cached value reach a transaction.** Tier D stays uncached; the
  existing hook-aware quote path already enforces this.
- **Testnets and network flips** must be in the cache namespace (juicescan
  already keys `DISCOVER_NETWORK` into its map keys — keep that).

---

## 6. Sequence

**Status — shipped 2026-08-03**

- [x] **Step 1 — jbm persistence.** `src/lib/query-persist.ts` over the existing
      react-query install (dehydrate/hydrate, no new dependency). Two opt-in
      tiers, bigint-safe serialization, `.revalidating` affordance. Tagged:
      `revnetStages` (immutable, split out of a mixed query),
      `revnetPriceMeta`, `revnetPriceReferences`, `revnetPriceHistory`,
      `market`, `marketFloor`, `marketLp`.
- [x] **Step 2 — revnet-money persistence.** Same layer. Plus `getRulesets`
      moved from `revalidate: 300` to permanent, guarded so an empty read
      during deploy cannot become the permanent answer.
- [x] **Step 3 — jbm edge.** `public, s-maxage=60,
      stale-while-revalidate=86400` on price-history, participants,
      auto-issuances and activity. Error responses and the account-scoped
      shop-customers route stay uncached; pinned by test.
- [x] **Step 4 — juicescan.** `src/cache.js`, a localStorage store with
      bigint-safe serialization and a `cacheValidated` ETag helper. Ruleset
      history now validated by a single `latestRulesetIdOf` word read instead
      of a paginated `allOf` multicall.
- [x] **Step 5 — breadth.** 26 project-scoped reads tagged in jbm (Overview,
      Owners, Terms, Rulesets, Funds, Loans, Settlement, Gossip, Shop,
      Auto-issuance) and 10 in revnet-money, where the two ruleset hooks are
      upgraded to immutable. `.revalidating` applied per value on headline
      stats and price tiles, per block on loans/gossip/auto-issuance tables
      and the token panel. A source scan (`test/persist-scope.test.ts` in both)
      fails CI if any tagged key mentions an address, holder, account or
      wallet.
- [x] **Step 6 — juicescan stale-then-confirm.** The Bendystraw project row is
      restored synchronously through `cacheStale`, marked `.revalidating` on
      cards and the detail header/About surface, and patched in place after
      confirmation. Cold reads may still paint after the 3.5 s soft timeout,
      but their underlying 5–13 s request now completes and applies a second
      update instead of being discarded. Cached sucker-group mappings remain
      display-only: cross-chain action scope awaits a live row and fails closed
      to the exact home deployment.

**Still open**

- The `toBlock`-addressed truly-immutable API slice (`max-age=31536000,
  immutable`) is still unbuilt; step 3 shipped the shared-cache half.

Remaining: the `toBlock`-addressed immutable slice (true `max-age=31536000,
immutable`) is still unbuilt — step 3 shipped the shared-cache half, which
captures most of the win without client restructuring.

## 6b. Original sequence

1. Tier A helper + IndexedDB persistence in jbm; mark revnet stages and
   ruleset rows only. Measure the second-load paint.
2. Same in revnet-money (identical query-client shape).
3. Edge split on `price-history` in both, then the other history endpoints.
4. juicescan `cache.js` + route its Tier A maps through it.
5. Tier C stale-while-revalidate polish (last-known values instead of
   skeletons on return visits).

Each step is independently shippable and independently measurable.

## 7. Expected outcome

A second visit to a project page should paint the full Terms tab, issuance
ladder, and price history **with zero network requests**, leaving only the
live reads (balance, supply, pool price) in flight — and those render from
their last known values while they refresh.
