# Project intents: create without a transaction

Date: 2026-09-21. Status: approved design. Revised the same day: no supersede or withdraw, a submitted intent is firm; "intent" replaces "intent" everywhere.

## Goal

A user of any Juicebox webclient can create a project without sending a transaction. The
signed intent lives on juicebox.center. Every webclient lists it, searches it and renders its
project page as if it were deployed. The first on-chain interaction with the project (a
payment, or anything else) deploys it first. juicebox.center sponsors the deploy on Base,
Optimism, Arbitrum and their testnets. This is the default create path for every Juicebox
webclient, first- and third-party, because it lets a passkey sign-up reach a listed project
with no gas and no chain interaction.

## Ground truth the design rests on

- Center already stores signed, undeployed intents (`extensions/jbcenter/src/intent.ts`,
  routes in `src/app.ts`, tables `intents` and `deployments`), exposes them in `/v1/search`
  shaped for merging with Bendystraw, and records deployments with a trace-based verifier.
  The SDK core package (`@bananapus/nana-sdk-core/jbcenter`) has a client for all of it. No
  webclient uses any of this today.
- Every launch path is permissionless for any caller with the owner as a calldata argument:
  `JBController.launchProjectFor`, `JB721TiersHookProjectDeployer.launchProjectFor`,
  `JBOmnichainDeployer.launchProjectFor`, `REVDeployer.deployFor` with `revnetId == 0`,
  `HomerunDeployer.launchFundFor`. All are `ERC2771Context` behind the canonical forwarder
  `0x3ba60b60933916a7c87d0860dcee62a0ce34e3e2` on all eight chains.
- Sucker, ERC-20 and 721-hook salts hash in `_msgSender()`. Cross-chain linking holds only
  when one sender deploys every chain of a project.
- `JBRulesets.queueFor` treats `mustStartAtOrAfter == 0` as "now" and honors absolute
  timestamps, including ones in the past.
- `JBProjects.creationFee()` is 0.0001 ETH on every chain today and must be sent exactly.
- Center already runs a sponsored-gas lane for passkey wallet creation on Base
  (`src/rest/wallet/deployment*.ts`, tables `rest_wallet_deployment_*`) and already wraps
  Relayr for owner-signed ERC-2771 bundles on the four mainnets (`src/rest/sponsorship/*`).

## Decisions

| Question | Decision |
|---|---|
| On-chain helper contract | None. Center's sponsor wallet is the sender on every chain of a sponsored deploy. |
| Stage timestamps | Absolute, frozen at signing, honored as signed. No intent expiry. |
| Who triggers sponsorship | Anyone, within caps. |
| Which intents list | All of them, marked as intents. |
| Execution | Center's existing Relayr wrapper for every sponsored deploy, mainnets and testnets alike. Testnet setup mirrors mainnet. |

## 1. The intent

An intent is the existing Center intent, unchanged in shape:

- `deploymentCalls`: one `{chainId, to, data}` per chain, frozen calldata targeting the same
  launch contracts the client uses today. Stage 1 carries an absolute `mustStartAtOrAfter`
  (the time the intent was made, or the time the creator chose) rather than 0, so a late
  deploy honors the whole schedule instead of restarting it. The creation fee is not part of
  the signed content; whoever deploys reads the live fee and sends it as value.
- `jb`: the publishing client's own form data (`CreateDraft` for juicebox.money, the revnet
  intent for revnet.money, and so on) so the home client can re-open the intent in its wizard.
- `format`: names the publishing app and version, as today.
- Signature: the existing personal_sign message over the content hash. Center verifies with
  `verifyMessage`, which accepts ERC-1271 and ERC-6492, so a Center passkey account with an
  undeployed smart account can publish. The owner in the calldata is the signer's address.

Lifecycle, all rows on Center. A submitted intent is firm: there is no edit, replace or
withdraw. It is a project that has not reached the chain yet, and clients present it as
one.

- Publish: as today. Publishing is rate-limited per publisher per day and per IP per hour.
  Defaults 20 per publisher per day and 60 per IP per hour, both Center env vars.
- Deployed: once any chain is recorded, the intent leaves default search and its URL
  redirects to the deployed project forever.

## 2. Deploying an intent

Exactly one party deploys all of an intent's chains, so every chain sees the same sender.

**Sponsored.** Center's sponsor key is one EOA used on every chain.

- Center signs one ERC-2771 `ForwardRequest` per chain with the sponsor key, `from` =
  sponsor, target = the intent's `to`, data = the intent's `data`, value = the live creation
  fee. It submits the set through its existing Relayr sponsorship adapter and pays the
  bundle from the sponsor wallet, the way the keeper pays Relayr in prepaid mode. Relayr
  owns per-chain nonces and gas. The same Relayr API serves both network families, so the
  testnet setup is the mainnet setup: Base Sepolia, OP Sepolia, Arbitrum Sepolia and
  Sepolia are sponsored exactly like Base, Optimism and Arbitrum.
- A bundle spans one family only, mainnets or testnets. Ethereum mainnet is never
  sponsored. An intent that includes it is self-paid in full.
- Policy, enforced before anything is signed: once per intent per chain; 5 sponsored deploys
  per requester per day, where the requester is the calling origin plus IP; a global daily
  wei budget across chains, default 0.05 ETH; per-request gas and value caps; a pause
  switch. All are Center env vars. Center refuses
  an intent that already has any chain deployed by another sender.
- Endpoint: `POST /v1/intents/:id/deploy` on the origin-gated `/v1` surface, idempotent per
  intent. It returns a job. `GET /v1/intents/:id` gains per-chain deploy status
  (`queued`, `sent`, `confirmed`, `failed`) plus the Relayr bundle id and tx hashes. Center
  records its own deployments through the same verifier as self-paid ones.
- Center pays the creation fee and, through `JBPayerTrackerLib.resolve`, receives the
  fee-project tokens. That offsets cost and needs no code.

**Self-paid.** The person triggering the deploy runs the client's existing launch pipeline
with the frozen calldata and the live fee: a direct send for one chain, or the client's
existing multi-chain Relayr path through Center's sponsorship wrapper for several. Their
wallet is the sender everywhere. The client posts each tx hash to
`POST /v1/intents/:id/deployments`. Verification adds a fast path: a top-level transaction
whose `to` and `input` equal the signed call is accepted from the receipt alone. Relayr
and Safe execution keep the trace path. The verifier gains testnet configs.

A self-paid and a sponsored deploy racing on one intent inside the confirmation window can
both land. Accepted as a known ceiling; the second project is an ordinary project owned by
the same owner and Center keeps the first recorded.

## 3. What every client does

The SDK carries the norm so first- and third-party clients implement the same thing.

**SDK (`@bananapus/nana-sdk-core/jbcenter`), additions:**

- `decodeDeploymentCall(call)`: recognizes the five launch targets by address and selector
  and returns a normalized shell `{flavor, owner, projectUri, rulesets, terminals, store}`.
  Unknown targets return metadata only.
- `mergeSearch(bendystrawRows, centerItems)`: one list ordered by creation time, intents
  flagged `undeployed: true`.
- `ensureDeployed(intent, {chainIds, sponsor, selfPaid, onStep})`: asks Center to sponsor
  when every chain is sponsorable and nothing is deployed yet, otherwise runs `selfPaid`.
  Polls Center until every requested chain is `confirmed` and returns `{chainId: projectId}`.
- `intentPath(id)` = `/intent/<id>`, `deployedChains(intent)` and `isFullyDeployed(intent)` for the route convention.
- Intent client: `requestDeploy`, deploy status on `getIntent`.
- A `jb-project-intents` skill in juicebox-skills states the norm for generated UIs.

**Create flow.** The final step's primary action becomes "Publish": pin metadata and media
through Center, freeze calldata with an absolute stage-1 start, sign, publish, clear the
local intent, land on `/intent/<id>`. "Deploy now" stays as the self-paid path and is the only
path when the intent includes Ethereum mainnet.

**Lists and search.** Wherever a client lists or searches projects it calls Center search
next to Bendystraw and merges. Trending and Top stay volume-based, so intents never rank
there. Each undeployed row shows a "Deploys on first use" badge.

**Project page.** `/intent/<id>` renders the client's normal project page from the decoded
shell, reusing the existing degraded-shell path where one exists (`shellProject` in
juicebox.money, `getProjectFallback` in revnet.money). A "Deploys on first use" badge and a "Deploy" action
replace the stats that need chain data. Once Center reports any deployment the route
redirects to the deployed URN.

**Writes.** Each client has one write chokepoint: `useSafeTx` in juicebox.money and
homerun, `useWriteContract` in revnet.money, `tx.ts` in succulent, `tx-engine.js` in
JBSticky. When the target project is an intent, the chokepoint inserts `ensureDeployed` as
the first TxSteps step ("Deploy project, sponsored by juicebox.center" or "Deploy project"
when self-paid), re-resolves the real project ids, rebuilds the original request against
them, runs it, and navigates to the deployed URL when done.

## 4. Rollout

1. Center: deploy endpoint, the Relayr sponsor lane, policy caps,
   fast-path verification, testnet verifier configs, publish rate limits. SDK
   additions and the skill. Nothing user-facing depends on anything else.
2. juicebox.money and revnet.money together, the same change in both.
3. homerun, succulent and JBSticky create flows; juicescan rendering and search. JBSticky's
   deployer must be confirmed permissionless for a non-owner caller before its step.
4. eth.shop, ethis.money and JBChat: render intents wherever they show projects.

## 5. Testing

- Center: unit tests for policy caps, the fast-path verifier, and the
  Relayr lane. One integration run against Center dev with a funded testnet sponsor key
  deploying a two-chain testnet intent through Relayr. One rehearsal on a mainnet with a
  real intent.
- SDK: decoder round-trips for the five launch targets built from each client's own
  encoder; merger ordering; `ensureDeployed` against a fake Center.
- Clients: the existing vitest suites gain intent cases for the create step, the search
  merge, the intent page and the write pre-step. A browser pass on dev: publish an intent
  from a passkey account, find it in search on the other client, pay it from a second
  wallet, and land on the deployed page.

## Out of scope

Editing, replacing or withdrawing a submitted intent; intents proposed for owners other
than the publisher as a distinct feature; comments or reviews; Bendystraw indexing of
intents; any on-chain helper contract.
