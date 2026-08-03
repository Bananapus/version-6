# Handoff prompt — finish the webclient caching work

Paste everything below into a new session.

---

Continue the cross-session caching work across the three webclients in
`webclients/`: `juicebox-money`, `revnet-money`, `juicescan`.

**Read these first, in order:**

1. `tasks/webclient-caching-plan.md` — the design, what shipped, what's open.
   Sections 1.1–1.3g prove, against V6 source, exactly which reads are
   immutable. Do not re-derive them; do not trust anything not listed there.
2. `webclients/juicebox-money/src/lib/query-persist.ts` — the pattern both
   Next apps use.
3. `webclients/juicescan/src/cache.js` — the validator/ETag pattern for the
   static app.

**The rules that must not bend:**

- **Never persist a wallet-keyed query.** localStorage outlives the session,
  so the next person on that browser would see the previous account's
  balances restored as their own. Persistence is opt-IN precisely so a missed
  query is merely slow, not unsafe. `test/persist-scope.test.ts` (in both Next
  apps) scans source and fails on any tagged key mentioning
  address/holder/account/wallet — keep it passing, and extend it if you add a
  new tagging mechanism.
- **Never let a cached value reach a transaction.** Quotes, allowances and
  nonces stay uncached; every `*Flow`, `*Dialog` and the create flow are
  deliberately untagged.
- **Serialization must stay bigint-aware.** viem returns bigints everywhere
  and `JSON.stringify` throws on them.
- **Prove immutability from the write path before tagging anything
  `immutable`.** Splits look immutable-by-rulesetId and are not
  (`setSplitGroupsOf` accepts any past rulesetId, and revnet operators hold
  `SET_SPLIT_GROUPS`). Project token *name/symbol* are mutable even though the
  address is write-once.
- **Stale is fine, silent stale is not.** Any value shown from cache while
  revalidating must carry `.revalidating` (dimmed + slow sweep, still
  readable) — never a skeleton, never an unmarked stale number.

**Remaining work, highest value first:**

1. **The `toBlock`-addressed immutable API slice in juicebox-money.** Split
   `/api/price-history` (and the other indexer routes) into events below
   finality — `Cache-Control: public, max-age=31536000, immutable`, keyed by
   `toBlock` — plus a short-lived live tail. Step 3 shipped only the shared
   `s-maxage=60, stale-while-revalidate=86400` half.
2. **Widen the affordance in both Next apps.** It is on headline stats, price
   tiles, the Pool card, revnet's token panel and header, and the loans,
   gossip and auto-issuance tables. Funds, Rulesets, Terms, Settlement and
   Shop persist their data but do not yet mark it while it reconfirms.
3. **Consider IndexedDB.** Both stores are localStorage with a byte budget
   (`MAX_BYTES` / `MAX_ENTRY_CHARS`) and drop everything when over. If real
   usage starts evicting, move them; the interfaces already isolate this.

**Shipped after this handoff was written:** juicescan's Bendystraw project row
now uses `cacheStale`, paints cached card/header/About values with
`.revalidating`, completes slow requests beyond the 3.5 s cold soft timeout,
and updates those imperative DOM surfaces in place. Cached sucker-group data
is display-only; cross-chain transaction scope still requires live
confirmation and otherwise fails closed to the home deployment.

**How to verify — do not skip this.** Every claim in this work has been
checked in a real browser, not just by unit test:

- `./node_modules/.bin/next dev --webpack --port 3001` (jbm) or `--port 3012`
  (revnet); juicescan is `npm run serve` on 3000. Note `npm run dev` fails in
  this shell with a NODE_OPTIONS error — call the local binary directly.
- Bendystraw CORS-rejects `127.0.0.1`, so anything indexer-dependent in
  juicescan must be verified on a published build, not locally.
- Bendystraw routinely takes 5–13s. If something returns empty, check whether
  a soft timeout beat it before concluding there is no data.
- Run the full suite, lint at `--max-warnings=0`, and a production build
  before shipping. juicescan additionally has `npm run check` as its publish
  gate, and publishing is `node build/publish-ipfs.js`.

---

## Also outstanding — UI work, not caching

Moved to its own brief: **`tasks/ui-consistency-handoff-prompt.md`** (payer
address dialogs in jbm + juicescan, and Operator/Owner tab subsection
consistency across all three). It is a separate worker's job — those items
touch `ExtrasTab.tsx` and the Operator tab components, so do not edit those
files from this brief without coordinating.

Already shipped, for context: revnet's form lost its three numbered stages
and its trigger is now secondary; both Next apps name the beneficiary field
after the project token; jbm prompts for an admin address when a payer is
made editable; jbm's holder actions are primary except Burn.
