# Handoff prompt — payer-address dialogs + Operator/Owner tab consistency

Paste everything below into the other worker's session. It is self-contained.

---

UI consistency pass across the three webclients in `webclients/`:
`juicebox-money` (jbm), `revnet-money`, `juicescan`. All read-only layout and
component structure — no protocol or transaction-encoding changes.

**These items were deliberately grouped into one job** because they touch the
same files (`ExtrasTab.tsx`, the Operator/Owner tab components). Splitting them
across workers causes conflicting edits.

## The reference pattern

juicescan's Operator tab is the target: **every subsection looks the same** —
one bordered card, a small uppercase title, body text, then the action. jbm and
revnet both drift from this in different ways. Where a decision is ambiguous,
match juicescan.

## 1. Payer address → button + dialog (jbm, then juicescan)

**jbm** — `src/components/project/ExtrasTab.tsx`, `PayerAddressCard` (~line 177).
The deploy form renders inline. Collapse it to a **secondary button** that opens
a dialog containing the form, and list the project's **deployed payer addresses
below** the button (jbm has no such list today).

Reference implementation is revnet's:
`src/app/[slug]/components/v6/extras/V6ExtrasTab.tsx` (Dialog + DialogTrigger +
`PayerDeployForm`) with `PayerAddressList` beneath, sourced from bendystraw via
`projectPayers.ts`.

**juicescan** — same change. Its payer form is in `src/discover.js`; the deploy
call builders are in `src/project-payer.js`. juicescan already has an
`openDialog(...)` helper in `src/component-base.js` — use it.

⚠️ This form is a **live transaction path**: ENS resolution, per-chain deploys,
simulate-first review. Move it intact; do not re-derive the deploy args. jbm's
`buildDeployProjectPayerTx` and juicescan's `buildProjectPayerDeployArgs` are
covered by tests — keep them passing.

## 2. Operator/Owner tab: one subsection style (revnet)

`src/app/[slug]/components/v6/operator/` — `V6OperatorTab.tsx`,
`OperatorAccountCard.tsx`, `OperatorEditsCard.tsx`, `PermissionsCard.tsx`,
`SafeQueueCard.tsx`, `SuckerExtensionCard.tsx`, `BuybackRouterCard.tsx`.

Today these use at least three different treatments: a bare heading with
untinted body ("Account", "Chains"), a green-tinted panel, and a
white-with-border panel ("Pending multisig transactions"). Pick **one** card
treatment and apply it to every subsection, following juicescan's uniform look.

## 3. jbm: action buttons under the text, not right-aligned

`src/components/project/AuthorityEditsCard.tsx`, the `EditRow` component
(~line 261). It is `flex … justify-between` with the button floated right.
Move the button **below** the description, left-aligned — matching juicescan,
where the action reads as the last line of the subsection.

Check `AuthorityPowersCard.tsx` (~line 160) for the same right-aligned pattern
and apply the same change.

## 4. jbm: permission description under its title

`src/components/project/AuthorityOverview.tsx` (~line 663). The row is
`sm:grid-cols-[13rem_1fr_auto]` — title column, description column, chain
icons. Put the description **under** the title instead of beside it, keeping
the chain icons where they are.

## Constraints

- **Do not touch the caching work.** `query-persist.ts`, `cache.js`,
  `.revalidating`, `meta: PERSIST` tags and `test/persist-scope.test.ts` are
  from a separate effort. If you move a component, carry its `meta:` and
  `Revalidating` usage across unchanged.
- Copy voice: no emoji or glyph decorations, "onchain" as one word, pipes not
  middots. Existing strings are already normalized — match them.
- Keep accessible names intact. jbm's view-as button needed an explicit
  `aria-label` once its visible label started truncating; watch for the same
  when you move text around.

## Verify before shipping

- jbm and revnet: `./node_modules/.bin/vitest run`, then
  `./node_modules/.bin/eslint src test --max-warnings=0`, then
  `./node_modules/.bin/next build --webpack`. Baselines to match: jbm **478
  passing**, revnet **502 passing / 1 skipped**.
- juicescan: `node scripts/check-source.mjs && npm run bundle &&
  ./node_modules/.bin/vitest run` (**784 passing**), and `npm run check` as the
  publish gate before `node build/publish-ipfs.js`.
- `npm run dev` fails in this shell with a NODE_OPTIONS error — call the local
  binary directly: `./node_modules/.bin/next dev --webpack --port 3001` (jbm),
  `--port 3012` (revnet); juicescan is `npm run serve` on 3000.
- Bendystraw CORS-rejects `127.0.0.1`, so anything indexer-dependent in
  juicescan must be checked on a published build, not locally.
- The Operator/Owner tab and the You card need a connected wallet to render
  their controls, so some of this cannot be screenshotted headlessly. Say so
  rather than claiming visual verification you did not do.
