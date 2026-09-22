# Project intents: Center documentation, shared SDK helpers, Homerun FUNDs

Date: 2026-09-21. Status: approved direction (jango: "do the steps. but first add sufficient
documentation to juicebox.center such that a new bot could happen across it and figure out how
to do it effectively. lets put as much into shared componentry as possible"; "i think juice-sdk
and juicebox center suffice" for shared componentry).
Builds on `2026-09-21-project-intents-design.md` (Center + SDK, in production) and the Beep
pair (`2026-09-21-beep-terminal-intents-design.md`), which is the worked example.

## Goal

Three deliverables, in this order:

1. **Center documents project intents for bots.** An agent that lands on juicebox.center, its
   `/llms.txt`, its API explorer or its MCP server finds one complete guide and the tools to
   publish an intent, request a sponsored deploy and read the result.
2. **Shared logic lives in the SDK.** Everything a client needs beyond its own UI is a
   framework-free helper in `@bananapus/nana-sdk-core/jbcenter`: the guarded publish flow, the
   Homerun launch decoder, search by owner, and refusal wording. No new package, no React layer.
3. **Homerun creates FUNDs by intent.** A merchant with an external wallet creates a FUND on the
   sponsored rollups without a transaction. It shows in their projects and in search at once,
   has a page, and deploys when they or anyone presses Deploy.

## Ground truth

- Center (main 3cbb9fd) serves: `/llms.txt` (generated in `src/llms.ts`, one bullet on intents),
  `/api` explorer, `/api/docs/<name>` for an allow-list in `src/rest/site.ts` read from
  `docs/rest/<NAME>.md` (lowercase, underscores become dashes; `.md` suffix or
  `Accept: text/markdown` returns Markdown), `/api/v1/openapi.json` (REST `/api/v1` only), and
  README sections "Publish an intent", "GET /v1/intents/:id", search, and "Record deployment".
  The sponsored deploy route `POST /v1/intents/:id/deploy` and `src/sponsor/*` exist but are not
  in README, the docs, or the MCP.
- MCP (`mcp/`) declares operations with `defineOperation(id, description, zodShape, handler)` in
  `mcp/src/application/operations.ts`; tools are `jb_<id>`. It has `jb_get_intent` and
  `jb_prepare_intent`, never signs, and reaches Center through `mcp/src/adapters/jbcenter.ts`.
  Its knowledge bundle ingests `mejango/juicebox-skills` `SKILL.md` files.
- `/v1/search` is full-text over intents (`search_vector`), no owner or publisher filter;
  intents with a recorded deployment leave the default search, so clients then find the project
  in Bendystraw.
- SDK 2.7.0 `@bananapus/nana-sdk-core/jbcenter`: client (`prepareIntent`, `publishIntent`,
  `getIntent`, `searchIntents({query,limit,cursor})`, `requestDeploy`, `recordDeployment`,
  pins), `createJBCenterDeploymentCall`, `decodeDeploymentCall` (JBController,
  JB721TiersHookProjectDeployer, JBOmnichainDeployer `launchProjectFor`; REVDeployer
  `deployFor`), `intentRow`, `mergeSearch`, `intentPath`, `deployedChains`,
  `isFullyDeployed`, `ensureDeployed` (sponsored request + poll, optional self-paid fallback,
  never mixes senders). Package budget cap 460 entries. Every consumer already depends on it.
- Beep (shipped) built locally what should be shared: the guard that signs only Center's
  prepared envelope when it equals the locally built one and the message quotes the content
  hash, and the fixed refusal sentences for `sponsor_quota`, `sponsor_budget`, `unavailable`.
- Homerun: `buildFundLaunch(input)` already yields one `HomerunDeployer.launchFundFor(owner,
  projectUri, name, ticker, mustStartAtOrAfter, salt, peerSuckerDeployers)` request per chain
  with a client-side random salt and a shared start; metadata is pinned through Center
  (`jbCenterIpfs`); lists come from Bendystraw (`getProjectsOwnedBy`, `searchProjects`); the
  project page reads chain state by project id; every admin write goes through
  `useProjectAdminTx` keyed by a deployed project; the Center passkey connector cannot sign
  messages, so publishing needs an external wallet; `deployIncome` requires the FUND's on-chain
  owner as caller, so INCOME stays a normal transaction; FUND chains include mainnet, which is
  not sponsored. Homerun's origin is on Center's allow-list.

## Design

### 1. Center: documentation and MCP tools

- **`docs/rest/PROJECT_INTENTS.md`**, served at `/api/docs/project-intents` (added to the
  allow-list). It is the canonical guide and reads top to bottom as a recipe:
  1. What an intent is: a signed, immutable set of per-chain deployment calls plus a `jb` form;
     it is a project the moment it is published; Center's sponsor executes it on request.
  2. Who may call: the `/v1` origin gate, the first-party allow-list, and the two ways in for a
     new integrator: ask for an origin, or use the MCP tools (server-side, no origin needed).
  3. The envelope, field by field, with the `jb` conventions clients rely on
     (`app`, `name`, `owner`, `chainIds`, plus app-specific fields), the format string
     convention (`<host>/<kind>/v1`), the signing message, and the content hash.
  4. One sender per intent: salts hash the sender, Center's sponsor is the sender on every
     chain, the canonical ERC-2771 forwarder, why calls carry no value (the creation fee rides in
     the prepayment).
  5. Publish end to end: `POST /v1/intents/message`, sign with `personal_sign` (EOA, ERC-1271
     or ERC-6492), `POST /v1/intents`; the guard every publisher applies before signing; curl
     and SDK examples; publish limits.
  6. Read and list: `GET /v1/intents/:id` (fields, `deployments`, `deploys`), `GET /v1/search`
     with `q`, `owner`, `publisher`, and the rule that deployed intents leave default search;
     how a client merges rows into Bendystraw lists (`mergeSearch`, `intentRow`, `intentPath`)
     and renders a shell page from `decodeDeploymentCall`.
  7. Sponsored deploy: `POST /v1/intents/:id/deploy` semantics (202 new, 200 existing rows,
     400 not sponsorable, 429 `sponsor_quota` and `sponsor_budget`, 503 `unavailable`), the
     sponsored chain ids, cost, per-requester quota, polling `deploys` rows through
     `queued`, `sent`, `confirmed`, `failed`, that a repeat request returns the existing rows,
     that a failed row is terminal for that intent, and `ensureDeployed` as the client helper.
  8. Self-paid deploy and recording it: `POST /v1/intents/:id/deployments`, the verifier's
     rule (trace executes the committed calldata and JBProjects emits Create), and the
     never-mix rule.
  9. Worked examples: Beep (server key publishes, merchant owns, deploy on first charge) and
     Homerun (owner publishes, linked chains with one salt).
  10. Common mistakes, carried from the skill.
- **`/llms.txt`**: the intents bullet becomes a link to the guide, and the "Learn" list gains
  "Create a project without a transaction". The `/api` explorer index and `AI_GUIDE.md` link
  the guide. README gains a short "Request a sponsored deploy" section and points to the guide.
- **Search filters**: `GET /v1/search` accepts `owner` and `publisher` (checksum-insensitive
  address match on the stored intent), combinable with `q`; the SDK's `searchIntents` gains
  the same fields. This is what a client's "my projects" list needs.
- **MCP**: two operations, `publish_intent` (input: the envelope fields plus `publisher` and
  `signature`; calls `POST /v1/intents` with Center's own first-party origin; returns the
  stored intent) and `deploy_intent` (input: `id`; calls `POST /v1/intents/:id/deploy`;
  returns the deploy rows or the refusal code). `prepare_intent` stays local. The server's
  `instructions` string names the flow; `mcp/docs/USER_JOURNEYS.md`, `TOOLS.md` and the
  generated tool catalog are updated. The MCP still never signs.
- **juicebox-skills**: `jb-project-intents/SKILL.md` gets a line naming the Center guide as
  canonical; content otherwise unchanged.

### 2. SDK: shared helpers in `@bananapus/nana-sdk-core/jbcenter`

- `publishSignedIntent(client, intent, sign)`: prepares, refuses to sign unless the prepared
  envelope equals `intent` (objects compared with sorted keys and lowercase hex strings) and the
  message contains the content hash, calls `sign(message)`, publishes, returns the stored
  intent. Throws `JBCenterIntentMismatchError` on a mismatch.
- `describeCenterRefusal(error)`: maps `JBCenterRequestError` codes `sponsor_quota`,
  `sponsor_budget`, `unavailable` (and status 429/503 without a code) to
  `{ code, message }` with fixed user-facing sentences; returns `null` for anything else so
  callers never surface raw provider text.
- `decodeDeploymentCall` learns `HomerunDeployer.launchFundFor` (ABI fragment carried in the
  SDK; result kind `"homerun-fund"` with owner, projectUri, tokenName, ticker,
  mustStartAtOrAfter, salt, peerSuckerDeployers).
- `searchIntents` accepts `owner` and `publisher`.
- README section for the module lists every helper with a one-line purpose; changeset, minor
  bump to 2.8.0, budget cap raised only if the entry count requires it.
- Beep is not migrated in this work; a follow-up can replace its local guard with
  `publishSignedIntent`.

### 3. Homerun: FUND by intent

- **Eligibility**: the connected wallet is external (not the Center passkey connector, not a
  Safe in this pass), and every selected chain is sponsorable (10, 8453, 42161 and the four
  testnets; never mainnet). When eligible, the review step offers "Create without a
  transaction" as the default; the existing direct, Relayr and Safe paths remain for
  everything else.
- **Publishing**: after `prepare()` has pinned metadata and fixed the salt and start,
  `buildFundLaunch` requests become deployment calls through `createJBCenterDeploymentCall`
  (no value). Envelope: format `homerun.money/fund/v1`, `deploymentVersion "6"`, `chainIds`,
  `jb: { app: "homerun", kind: "fund", name, owner, chainIds, tokenName, ticker, salt,
  mustStartAtOrAfter, projectUri }`. `publishSignedIntent` signs with wagmi `signMessage`.
  The launch session records `transport: "intent"` and the intent id; the page navigates to
  `/intent/<id>`; `/create/recover` links there when the saved session is an intent.
- **Lists and search**: the account's projects merge Bendystraw rows with
  `searchIntents({ owner })`, search merges `searchProjects` with `searchIntents({ query })`,
  both through `mergeSearch`; intent rows link to `/intent/<id>` and carry a "Deploys on first
  use" label.
- **Intent page** `/intent/[id]`: `getIntent` plus `decodeDeploymentCall` and the pinned
  metadata render the FUND's name, description, photos, chains, owner, token name and ticker,
  and start; no chain reads. One "Deploy" action runs `ensureDeployed` (sponsored only, no
  self-paid fallback here) with step progress, and refusals show `describeCenterRefusal`'s
  sentence. When any deployment exists the page redirects to `/project/<chainId>/<projectId>`
  of the first deployed chain. Existing admin writes are unchanged: they only exist on deployed
  project pages, so no write chokepoint change is needed.
- **INCOME** is unchanged and requires the deployed FUND.
- **Config**: no new environment variables; the Center base URL and app origin come from
  `jbcenter-config.ts`.

### 4. Out of scope

OpenAPI coverage of `/v1/*`; a Safe or passkey publishing path in Homerun; migrating Beep to
the shared helpers; juicebox.money and revnet.money; a Center passkey signing ceremony.

## Testing

- Center: docs route serves the guide as HTML and Markdown; `/llms.txt` snapshot; search
  `owner` and `publisher` filters (memory store and Postgres); MCP `publish_intent` and
  `deploy_intent` against a fake Center adapter; `npm run check` green.
- SDK: `publishSignedIntent` signs only an equal envelope and rejects a changed owner or a
  message without the hash; `describeCenterRefusal` mapping; Homerun decode round-trip;
  `searchIntents` query string; package budget and wallet-boundary checks.
- Homerun: envelope builder is deterministic for fixed inputs; publish flow with a fake client;
  merged lists and intent page rendering with a fake Center; a Playwright run of the create
  flow with an injected test wallet that signs the message, against a fake Center that
  confirms the deploy; the existing create, a11y and center browser suites stay green.
- Live: publish a two-chain testnet FUND from a test EOA on the deployed Homerun against Center
  dev, deploy it sponsored; then one production FUND on Base and OP.
