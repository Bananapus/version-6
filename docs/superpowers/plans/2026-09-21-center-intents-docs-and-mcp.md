# Center Intents Documentation and MCP Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make juicebox.center self-sufficient for a bot that lands on it: one canonical project-intents guide reachable from `/llms.txt`, `/api`, `AI_GUIDE.md` and the README; `owner` and `publisher` filters on `/v1/search`; and MCP tools that publish an already-signed intent and request its sponsored deploy.

**Architecture:** Three surfaces of one repository. (1) Documentation: a new `docs/rest/PROJECT_INTENTS.md` served by the existing `/api/docs/:name` allow-list, linked from the discovery index, the explorer, the agent guide and the README. (2) Data: `GET /v1/search` gains two address filters that go through the `Store.search` interface to both the PostgreSQL store and the in-memory test store, backed by two functional indexes. (3) MCP: the embedded MCP reaches Center's two intent write routes through an in-memory `Request` handled by the same Hono app, so signature verification, rate limits and sponsor policy stay single-sourced; two new operations wrap them. The MCP still never signs anything.

**Tech Stack:** TypeScript (ESM, Node 22), Hono, viem, zod 4, PostgreSQL 16 with `pg`, vitest, `@modelcontextprotocol/sdk`, marked (docs rendering).

**Spec:** `/Users/jango/Documents/jb/v6/evm/docs/superpowers/specs/2026-09-21-intents-docs-shared-homerun-design.md` — this plan implements **only** section "1. Center: documentation and MCP tools" plus the Center-side search filters. Sections 2 (SDK helpers) and 3 (Homerun) are separate plans.

**Repository:** `/Users/jango/Documents/jb/v6/evm/extensions/jbcenter` (github.com/mejango/jbcenter). The checked-out working tree in the monorepo is stale; every task starts from a fresh worktree of `origin/main` (currently `3cbb9fd`).

## Global Constraints

- Never write the word "draft" in code, comments, documentation, copy, commit messages or PR text.
- No retrospective code comments: comments explain the code as it stands, never what changed or why it used to be different.
- No emoji anywhere: source, docs, commits, PR text.
- Every commit message ends with the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Node 22 via nvm: `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22` in every fresh shell. `package.json` requires `>=22.16.0`.
- A local `tsc` run needs the MCP package built first: `cd mcp && npm run build` (the root imports `@juicebox/mcp/host` from `mcp/dist`). `npm run typecheck` does this itself; a bare `npx tsc --noEmit` does not.
- The gate is `npm run check` from the repository root. It requires `TEST_DATABASE_URL` pointing at a disposable PostgreSQL 16 database and it runs `npm --prefix mcp run check` (format, typecheck, vitest, build, catalog drift) as part of the run.
- Tests that need PostgreSQL: `test/postgres.integration.test.ts` only. `test/app.test.ts`, `test/mcp.test.ts`, `test/rest-guide.test.ts`, `test/rest-wallet-policy.test.ts` and `mcp/tests/**` are memory-store or in-process only and run without `TEST_DATABASE_URL`.
- Work happens in a new git worktree created from `origin/main`, never in the shared monorepo checkout (no stash, no branch switch in a shared tree).
- Ship as one PR into `mejango/jbcenter` `main`, then mirror `main` into `dev`. The juicebox-skills one-line pointer is a separate tiny PR in a separate repository.
- Documentation copy stays in Center's existing voice: plain sentences, no marketing, no hedging, no "simply"/"just". Tables for field lists. Absolute integers for amounts.

---

## File Structure

**New files**

- `extensions/jbcenter/docs/rest/PROJECT_INTENTS.md` — the canonical integrator guide. Ten sections, read top to bottom as a recipe. Served at `/api/docs/project-intents` as HTML and at `/api/docs/project-intents.md` as Markdown.
- `extensions/jbcenter/src/db/migrations/058_intent_owner_publisher_search.sql` — two functional indexes for the new search filters.

**Modified files**

- `src/rest/site.ts` — export the document allow-list as a named constant and add `PROJECT_INTENTS` to it.
- `src/rest/docs/guide.ts` — add the guide to the left navigation shown on every `/api/docs/*` page.
- `src/rest/docs/page.ts` — link the guide from the `/api` explorer index.
- `docs/rest/AI_GUIDE.md` — a short section pointing at the guide.
- `src/llms.ts` — the intents bullet becomes a link; the Learn list gains one entry.
- `README.md` — point the three intent sections at the guide, document the search filters and the two new MCP tools.
- `src/types.ts`, `src/store.ts`, `src/db/postgres.ts`, `test/support/memoryStore.ts`, `src/app.ts` — the `owner` and `publisher` search filters.
- `src/firstParty.ts`, `src/app.ts` — Center's own public origin becomes a trusted `/v1` caller so the embedded MCP can reach the write routes through the real middleware stack.
- `src/mcp.ts` — one Center fetcher that serves the two reads in-process and bridges the two writes into the Hono app.
- `src/index.ts` — hand the MCP a lazy reference to the app's `fetch`.
- `mcp/src/adapters/http.ts` — carry a bounded upstream error code on `DomainError.details`.
- `mcp/src/adapters/jbcenter.ts` — `publishIntent` and `requestDeploy`.
- `mcp/src/application/operation.ts` — classify the two write operations.
- `mcp/src/application/operations.ts` — `publish_intent` and `deploy_intent`.
- `mcp/src/application/capabilities.ts` — the two tools join the `plans` family; its limits get accurate wording.
- `mcp/src/mcp/server.ts` — the `instructions` string names the publish/deploy flow.
- `mcp/data/mcp-tool-catalog.json`, `mcp/docs/TOOLS.md` — regenerated, never hand-edited.
- `mcp/docs/USER_JOURNEYS.md`, `mcp/README.md` — hand-written; updated for the two tools.
- Tests: `test/app.test.ts`, `test/mcp.test.ts`, `test/rest-guide.test.ts`, `test/rest-wallet-policy.test.ts`, `test/postgres.integration.test.ts`, `mcp/tests/adapters/jbcenter.test.ts` (new or extended).

**Separate repository**

- `mejango/juicebox-skills`: `plugins/juicebox-v6/skills/jb-project-intents/SKILL.md` — one line naming the Center guide as canonical.

---

## Task 1: The project-intents guide and every pointer to it

**Files:**
- Create: `extensions/jbcenter/docs/rest/PROJECT_INTENTS.md`
- Modify: `extensions/jbcenter/src/rest/site.ts` (the `readRestAssets` document list, ~lines 41-60)
- Modify: `extensions/jbcenter/src/rest/docs/guide.ts` (the `navigation` array, ~lines 5-10)
- Modify: `extensions/jbcenter/src/rest/docs/page.ts` (the `API resources` nav and the `#write` section)
- Modify: `extensions/jbcenter/docs/rest/AI_GUIDE.md` (insert before `## prepaid publication and funding`)
- Modify: `extensions/jbcenter/src/llms.ts`
- Modify: `extensions/jbcenter/README.md`
- Test: `extensions/jbcenter/test/rest-guide.test.ts`, `extensions/jbcenter/test/app.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export const REST_DOCUMENTS: readonly string[]` from `src/rest/site.ts` — the uppercase document names `readRestAssets` reads from `docs/rest/<NAME>.md`. Tests import it to prove every listed name has a file on disk.

- [ ] **Step 1: Create the worktree**

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22
cd /Users/jango/Documents/jb/v6/evm/extensions/jbcenter
git fetch origin
git worktree add /Users/jango/Documents/jb/worktrees/center-intents-docs -b feat/intents-docs-and-mcp origin/main
cd /Users/jango/Documents/jb/worktrees/center-intents-docs
npm ci
cd mcp && npm ci && npm run build && cd ..
```

- [ ] **Step 2: Write the failing tests for the document surface**

Add to `test/rest-guide.test.ts`, replacing nothing (append two `it` blocks inside the existing `describe("readable developer guides", ...)`):

```ts
import { readFile } from "node:fs/promises";
import { REST_DOCUMENTS } from "../src/rest/site.js";

  it("lists the project intents guide and keeps every listed document on disk", async () => {
    expect(REST_DOCUMENTS).toContain("PROJECT_INTENTS");
    for (const name of REST_DOCUMENTS) {
      const text = await readFile(new URL(`../docs/rest/${name}.md`, import.meta.url), "utf8");
      expect(text.startsWith("# ")).toBe(true);
    }
  });

  it("serves the project intents guide as a page and as Markdown", async () => {
    const markdown = await readFile(new URL("../docs/rest/PROJECT_INTENTS.md", import.meta.url), "utf8");
    const app = new Hono<JbcenterEnv>();
    mountRestSite(app, {
      app: new Hono(), audience: "https://juicebox.center", accountsScript: "", docsScript: "",
      docsHtml: "", docsCss: "", clientPackage: new Uint8Array([1]),
      documents: new Map([["project-intents", markdown]]),
    } as RestSite);
    const page = await app.request("/api/docs/project-intents");
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Project intents");
    expect(html).toContain("/v1/intents/:id/deploy");
    expect(html).not.toContain("<script>alert");
    const raw = await app.request("/api/docs/project-intents.md");
    expect(raw.headers.get("content-type")).toContain("text/markdown");
    expect(await raw.text()).toBe(markdown);
  });
```

Add to `test/app.test.ts`, inside the existing `it("serves agent discovery without credentials and preserves project identity in inspection links", ...)`, after the existing `expect(await index.text()).toContain(...)` line:

```ts
    const discovery = await (await app.request("/llms.txt")).text();
    expect(discovery).toContain("https://juicebox.center/api/docs/project-intents");
    expect(discovery).toContain("Create a project without a transaction");
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/rest-guide.test.ts test/app.test.ts`
Expected: FAIL — `REST_DOCUMENTS` is not exported from `src/rest/site.ts`, and `/llms.txt` does not contain the guide link.

- [ ] **Step 4: Export the document allow-list and add the guide to it**

In `src/rest/site.ts`, replace the inline array inside `readRestAssets` with a module-level constant and iterate it:

```ts
export const REST_DOCUMENTS = [
  "ARCHITECTURE",
  "QUICKSTART",
  "CLIENT",
  "USER_JOURNEYS",
  "AUTHENTICATION",
  "API",
  "AI_GUIDE",
  "PROJECT_INTENTS",
  "CONTRACTS",
  "INDEXER",
  "TRANSACTIONS",
  "OMNICHAIN",
  "SPONSORSHIP",
  "SMART_ACCOUNTS",
  "SESSIONS",
  "EXECUTION_OPERATIONS",
  "PRODUCTION_CHECK",
  "PRODUCTION_OPERATIONS",
] as const;
```

and in `readRestAssets`:

```ts
  const documents = new Map<string, string>();
  for (const name of REST_DOCUMENTS) {
    const content = await readFile(
      new URL(`../../docs/rest/${name}.md`, import.meta.url),
      "utf8",
    );
    documents.set(name.toLowerCase(), content);
    documents.set(name.toLowerCase().replaceAll("_", "-"), content);
  }
```

- [ ] **Step 5: Write the guide**

Create `extensions/jbcenter/docs/rest/PROJECT_INTENTS.md` with exactly this content:

````markdown
# Project intents

A project intent is a signed, frozen Juicebox V6 project launch: one contract call
per chain plus the publishing client's own form document, stored by Center. Publishing
costs one wallet signature and no transaction. The project exists from the moment it is
published: it has an id, a page, and a row in search. It becomes an on-chain project when
someone deploys it, either at Center's expense on the sponsored rollups or by paying for
the transaction themselves.

This guide is the canonical description of the flow. It covers who may call, the exact
envelope, publishing, reading, sponsored deploys, self-paid deploys, and the mistakes that
cost people a working omnichain project.

Say "project" in user-facing copy, with a "Deploys on first use" label. The word "intent"
belongs in API documentation, not in product copy: it suggests something still negotiable,
and a published intent cannot be edited, replaced or withdrawn.

## 1. What an intent is

| Property | Value |
|---|---|
| Content | `format`, `deploymentVersion`, `chainIds`, one `deploymentCall` per chain, and a `jb` document |
| Identity | A UUID assigned by Center, plus a `contentHash` over the canonical envelope |
| Authenticity | A publisher signature over a message that quotes the content hash |
| Mutability | None. There is no edit, replace or withdraw route. Publish a new intent instead |
| Status | `undeployed` until a deployment is recorded for any chain, then `deployed` |

The per-chain `to` address and the complete calldata are part of the signed content, so the
launch is directly executable and independently verifiable by anyone: nobody has to re-derive
time-sensitive arguments later. Center never edits the calldata and never invents a call.

A signature on an intent authorizes Center to store and publish frozen calldata. It is not
transaction approval and it moves no funds. Deployment is a separate, funded transaction.

## 2. Who may call

`/v1` routes are gated by browser `Origin`. A request whose `Origin` header is not on
Center's first-party list is refused with `403` and `{"error":{"code":"forbidden_origin"}}`.
There is no bearer token for these routes and no public fallback.

Two ways in for a new integrator:

1. **Ask for an origin.** Center's first-party list lives in `src/firstParty.ts` in the
   `mejango/jbcenter` repository, with a production entry and a development entry per app.
   Open a pull request adding your origin, or ask the maintainers. Production entries today
   are `https://juicebox.money`, `https://revnet.money`, `https://eth.shop`,
   `https://succulent.money`, `https://homerun.money` and `https://beep.biz`.
2. **Use the MCP tools.** Connect any Streamable HTTP MCP client to
   `https://juicebox.center/mcp`. `jb_prepare_intent`, `jb_publish_intent`, `jb_get_intent`
   and `jb_deploy_intent` run server-side inside Center, so they need no origin, no REST
   account and no bot grant. The MCP never holds a key and never signs: you bring the
   signature.

Server-to-server callers that are not the MCP still need an allow-listed origin, and must
send it as a real `Origin` header.

## 3. The envelope

```json
{
  "format": "juicebox.money/v1",
  "deploymentVersion": "6",
  "chainIds": [8453, 42161],
  "deploymentCalls": [
    { "chainId": 8453, "to": "0x...", "data": "0x..." },
    { "chainId": 42161, "to": "0x...", "data": "0x..." }
  ],
  "jb": { "v": 1, "name": "Public goods garden", "owner": "0x...", "chainIds": [8453, 42161] }
}
```

| Field | Type | Rules |
|---|---|---|
| `format` | string | `<host>/<label>`: exactly one slash. Host part matches `[a-z0-9.-]{1,80}`, label matches `[a-zA-Z0-9._-]{1,32}` — the label may not contain a slash. Identifies the publishing client |
| `deploymentVersion` | string | `"6"`. 1 to 64 characters |
| `chainIds` | number[] | 1 to 16 unique positive integers. Center sorts them ascending before hashing |
| `deploymentCalls` | array | Exactly one `{chainId, to, data}` per member of `chainIds`. `to` is checksummed, `data` is lowercase hex of at least 4 bytes and at most 4 MiB. Center sorts by `chainId` before hashing |
| `jb` | object | The publishing client's own document. Any JSON object, nesting at most 64 levels |

Existing publishers use `juicebox.money/v1` and `revnet.money/v1`. An app that publishes more
than one kind of deployment distinguishes them in the label, for example `homerun.money/fund.v1`
or `beep.biz/terminal.v1`. A second slash is rejected with `400` and
`format must look like juicebox.money/v1`.

### `jb` conventions

Center treats `jb` as opaque, but indexes a few conventional fields so that search and lists
work without the client re-reading every envelope. Fields are read from the root of `jb`, or
from `jb.data` when `jb.app` is `"revnet.money"`.

| `jb` field | Indexed as | Notes |
|---|---|---|
| `name` | `name` | Trimmed to 100 characters. Missing means the stored name is `Untitled project` |
| `description` | `description` | Trimmed to 10000 characters |
| `tagline` or `projectTagline` | `tagline` | Trimmed to 200 characters |
| `tags` | `tags` | At most 10 strings of at most 30 characters |
| `logoUri`, `logo` or `links.logoUri` | `logoUri` | Use an `ipfs://` URI: the first-party webclients do not render HTTPS logos |
| `owner` | `owner` | Must be an address string, stored checksummed. This is what `GET /v1/search?owner=` matches |
| `chainIds` or `chains` | not indexed | When present it must equal the envelope's `chainIds`, or the publish is refused |

Also set `app` (your client's short name) and, when your client has more than one product,
`kind`. Everything else is yours.

### Content hash and signing message

The content hash is `keccak256` over the canonical JSON of the normalized envelope: object keys
sorted lexicographically at every level, no whitespace, chain ids and calls already sorted.

The message to sign is exactly:

```
Juice Central project intent
Version: 1
Content hash: 0x<64 hex characters>
```

Never build that string yourself. Ask `POST /v1/intents/message` for it, so a change in Center's
normalization can never leave you signing something Center will not store.

## 4. One sender per intent

Sucker, ERC-20 and 721-hook salts hash `_msgSender()` on every chain. Every chain of one intent
must be deployed by the same sender, or the deployments do not link into one omnichain project:
they land as unrelated same-named projects on separate chains, and nothing can repair that.

There are exactly two valid senders for a whole intent, never mixed:

- Center's sponsor key deploys every chain (the sponsored path).
- One wallet deploys every chain (the self-paid path).

Center enforces the boundary from its side: `POST /v1/intents/:id/deploy` is refused for an
intent that already has a recorded deployment, so sponsorship can never be layered on top of a
partial self-paid deployment. The mirror rule is yours to keep: once a sponsored deploy is
requested, do not deploy the remaining chains yourself.

On the sponsored path Center's sponsor key signs an ERC-2771 forward request per chain against
the canonical `ERC2771Forwarder` from the V6 manifest, after checking that the call's target
trusts that forwarder. The deployment calls themselves carry no value: the project creation fee
is read live from `JBProjects.creationFee()` at deploy time and attached to the forwarded
request, funded by the Relayr prepayment. A fee above Center's ceiling of `100000000000000` wei
(0.0001 ETH) fails the lane instead of spending more than the reservation.

## 5. Publish end to end

### Step 1: ask for the message

```sh
curl -X POST https://juicebox.center/v1/intents/message \
  -H 'origin: https://juicebox.money' \
  -H 'content-type: application/json' \
  --data '{
    "format":"juicebox.money/v1",
    "deploymentVersion":"6",
    "chainIds":[8453],
    "deploymentCalls":[{
      "chainId":8453,
      "to":"0x3333333333333333333333333333333333333333",
      "data":"0x12345678"
    }],
    "jb":{"v":1,"name":"Public goods garden","owner":"0x1111111111111111111111111111111111111111","chains":[8453]}
  }'
```

```json
{
  "contentHash": "0x9a...",
  "message": "Juice Central project intent\nVersion: 1\nContent hash: 0x9a...",
  "envelope": { "format": "juicebox.money/v1", "deploymentVersion": "6", "chainIds": [8453], "deploymentCalls": [{ "chainId": 8453, "to": "0x3333333333333333333333333333333333333333", "data": "0x12345678" }], "jb": { "v": 1, "name": "Public goods garden", "owner": "0x1111111111111111111111111111111111111111", "chains": [8453] } }
}
```

### Step 2: apply the guard, then sign

Before you sign, check two things. Every publisher applies this guard; it is the only thing
standing between a compromised or confused response and a signature over calldata the user
never saw.

1. The returned `envelope` equals the envelope you built. Compare canonically: sort object keys,
   lowercase every hex string, and compare the serialized result. Do not compare with `===` on
   objects and do not trust field order.
2. The returned `message` contains the returned `contentHash`, and that hash is the keccak256 of
   the canonical JSON of the envelope you built.

If either check fails, refuse to sign and surface the mismatch. Do not retry silently.

Sign with `personal_sign` from an externally owned account. Center recovers the signer from the
signature and compares it to `publisher`: contract signatures are not verified today, so an
ERC-1271 smart account and an ERC-6492 wrapped signature from an undeployed account are both
refused with `400`. A client whose connector cannot sign messages, such as a passkey wallet,
needs an external wallet for this step.

### Step 3: publish

```sh
curl -X POST https://juicebox.center/v1/intents \
  -H 'origin: https://juicebox.money' \
  -H 'content-type: application/json' \
  --data '{
    "format":"juicebox.money/v1",
    "deploymentVersion":"6",
    "chainIds":[8453],
    "deploymentCalls":[{"chainId":8453,"to":"0x3333333333333333333333333333333333333333","data":"0x12345678"}],
    "jb":{"v":1,"name":"Public goods garden","owner":"0x1111111111111111111111111111111111111111","chains":[8453]},
    "publisher":"0x1111111111111111111111111111111111111111",
    "signature":"0x..."
  }'
```

`201` with the stored intent the first time. `200` with the same intent when the same publisher
re-sends the same content: publishing is idempotent per `(publisher, contentHash)`.

### The same flow with the SDK

```ts
import {
  createJBCenterClient,
  createJBCenterDeploymentCall,
} from "@bananapus/nana-sdk-core/jbcenter";

const client = createJBCenterClient();

const deploymentCalls = chainIds.map((chainId) =>
  createJBCenterDeploymentCall({ chainId, ...launchRequest }),
);
const envelope = {
  format: "juicebox.money/v1",
  deploymentVersion: "6",
  chainIds,
  deploymentCalls,
  jb: formValues,
};

const prepared = await client.prepareIntent(envelope);
assertEqualEnvelope(prepared.envelope, envelope);        // guard check 1
assertMessageQuotesHash(prepared.message, prepared.contentHash); // guard check 2

const signature = await walletClient.signMessage({ account, message: prepared.message });
const intent = await client.publishIntent({ ...envelope, publisher: account.address, signature });
```

### Publish limits and refusals

| Status | Code | Meaning |
|---|---|---|
| `400` | `bad_request` | The envelope failed normalization, or the signature does not match `publisher` and the content |
| `403` | `forbidden_origin` | The `Origin` header is absent or not first-party |
| `413` | `body_too_large` | The request body exceeded 16800000 bytes |
| `429` | `publish_limit` | 20 publishes per publisher per day, or 60 per IP per hour. `Retry-After` is `86400` or `3600` |
| `429` | `storage_limit` | The calling client exceeded its stored intent count or byte budget |

## 6. Read and list

### One intent

```http
GET /v1/intents/:id
```

`200` with the intent, `400` for an id that is not a UUID, `404` with `not_found` otherwise.

```json
{
  "id": "a7396c7e-b13f-4ca8-9f06-96f36ab22c3a",
  "status": "undeployed",
  "contentHash": "0x9a...",
  "envelope": { "format": "juicebox.money/v1", "deploymentVersion": "6", "chainIds": [8453], "deploymentCalls": [{ "chainId": 8453, "to": "0x...", "data": "0x..." }], "jb": {} },
  "publisher": "0x1111111111111111111111111111111111111111",
  "signature": "0x...",
  "name": "Public goods garden",
  "description": null,
  "tagline": null,
  "tags": [],
  "logoUri": null,
  "owner": "0x1111111111111111111111111111111111111111",
  "createdAt": "2026-09-21T00:00:00.000Z",
  "deployments": [],
  "deploys": []
}
```

`deployments` holds recorded on-chain results: `{chainId, projectId, transactionHash, createdAt}`,
write-once per chain. `deploys` holds sponsored-deploy rows and is always present, empty until a
sponsored deploy is requested: `{chainId, status, transactionHash, bundleUuid, error, createdAt,
updatedAt}` with `status` one of `queued`, `sent`, `confirmed`, `failed`. `error` is always a
coded, bounded, authored message; upstream exception text never reaches it.

### Search

```http
GET /v1/search?q=climate&owner=0x1111...&publisher=0x2222...&limit=20&cursor=20
```

| Parameter | Rules |
|---|---|
| `q` | At most 200 characters. Empty or absent lists recent intents newest first |
| `owner` | An address. Matches the indexed `jb.owner`, case-insensitively |
| `publisher` | An address. Matches the signing publisher, case-insensitively |
| `limit` | 1 to 100, default 20 |
| `cursor` | The `nextCursor` from the previous page: a non-negative integer offset |

All four filters combine. An `owner` or `publisher` that is not an address is refused with `400`.

```json
{
  "items": [
    {
      "source": "jbcenter",
      "status": "undeployed",
      "intentId": "a7396c7e-b13f-4ca8-9f06-96f36ab22c3a",
      "contentHash": "0x9a...",
      "format": "juicebox.money/v1",
      "deploymentVersion": "6",
      "chainIds": [8453],
      "publisher": "0x2222222222222222222222222222222222222222",
      "name": "Public goods garden",
      "description": null,
      "tagline": null,
      "tags": [],
      "logoUri": null,
      "owner": "0x1111111111111111111111111111111111111111",
      "createdAt": "2026-09-21T00:00:00.000Z"
    }
  ],
  "totalCount": 1,
  "nextCursor": null
}
```

Search returns undeployed intents only. Recording the first deployment removes an intent from
search while keeping its `jb`, signature, exact launch calls and deployment provenance at
`GET /v1/intents/:id`. That is the contract clients rely on: query Center and Bendystraw
concurrently and concatenate, and nothing is listed twice.

`owner` is what an account page needs: `searchIntents({ owner })` beside
`getProjectsOwnedBy(owner)` from Bendystraw is the account's complete project list.
`publisher` is what an integrator's own operations dashboard needs: every intent a server key
signed, whoever owns the resulting projects.

### Rendering a list and a page

The SDK's `mergeSearch(bendystrawRows, intentItems)` merges both sources newest first, building
each intent row with `intentRow(item)` and flagging it `undeployed: true`. `intentPath(id)` is
`/intent/<id>`. Render that page from `decodeDeploymentCall(call)` on any one of the intent's
deployment calls — the launch is the same logical configuration on every chain — plus the pinned
metadata. No chain reads are needed or possible: there is nothing on chain yet.

`decodeDeploymentCall` returns a typed shell per launch flavor:

| Flavor | Typed fields |
|---|---|
| `project` | `owner`, `projectUri`, `rulesetConfigurations`, `terminalConfigurations` |
| `project-721` | `owner`, `projectUri`, `rulesetConfigurations`, `terminalConfigurations` |
| `omnichain` | `owner`, `projectUri`, `rulesetConfigurations`, `terminalConfigurations` |
| `revnet` | `operator`, `stages`, `description` |
| `unknown` | none — render generically, never guess a shape |

Keep intents out of Trending and Top: those rankings are volume-based and an intent has no
volume.

## 7. Sponsored deploy

```http
POST /v1/intents/:id/deploy
```

No request body. Center executes the intent's own signed calls at its own expense.

| Status | Body | Meaning |
|---|---|---|
| `202` | `{"deploys":[...]}` | Queued for the first time, one row per chain, all `queued` |
| `200` | `{"deploys":[...]}` | Rows already exist. The same rows come back; the request is idempotent per intent, not per call |
| `400` | `bad_request` | The id is not a UUID, the intent is already `deployed`, or its chains are not sponsorable |
| `404` | `not_found` | No such intent |
| `429` | `sponsor_budget` | The shared daily sponsorship budget is spent. `Retry-After: 86400` |
| `429` | `sponsor_quota` | The requester's daily quota is spent. `Retry-After: 86400` |
| `503` | `unavailable` | No sponsor is configured, or sponsorship is paused |

The budget is checked before the quota, so a budget refusal costs the requester nothing.

### Sponsored chains

| Family | Chain ids |
|---|---|
| Mainnet | `10` Optimism, `8453` Base, `42161` Arbitrum |
| Testnet | `11155111` Sepolia, `11155420` Optimism Sepolia, `84532` Base Sepolia, `421614` Arbitrum Sepolia |

Every chain of an intent must come from one family. A mix of families, or any chain outside both
lists, is not sponsorable. Ethereum mainnet (`1`) is never sponsored: an intent that includes it
is self-paid only.

### Cost and quotas

| Setting | Default |
|---|---|
| Deploys per requester per day | 5 |
| Shared daily budget | 50000000000000000 wei (0.05 ETH) |
| Reservation per chain | `maxGas * maxFeePerGas + creationFeeCeiling` = 8000000 * 1000000000 + 100000000000000 = 8100000000000000 wei (0.0081 ETH) |
| Confirmations before a chain counts as confirmed | 2 |

A request reserves the full amount for every chain up front, and the reservation is released as
each chain settles. The budget is charged what the sponsor actually spent once the Relayr
prepayment settles. For browser callers the requester is the calling origin and IP; for the MCP
tools it is one shared Center-side bucket, so the MCP's five daily sponsored deploys are shared
across all MCP callers.

### Polling

Poll `GET /v1/intents/:id` and read `deploys`. A row moves `queued` to `sent` to `confirmed`,
or to `failed`. A confirmed chain also writes its `deployments` entry, so `deployments` and
`deploys` converge. A `failed` row is terminal for that intent: Center will not retry it and a
second `POST /v1/intents/:id/deploy` returns the same rows, including the failed one. Recovery is
a new intent, or the self-paid path for a fresh intent — never a partial self-paid patch over the
same one.

The SDK wraps this as `ensureDeployed({ client, intent, onStep, pollMs, timeoutMs, signal })`,
which requests the sponsored deploy, polls until every chain is `confirmed`, and returns
`Record<chainId, projectId>`. It throws `EnsureDeployedError` carrying the `chainId` of the row
that failed.

## 8. Self-paid deploy and recording it

Send the intent's exact per-chain calls from one wallet, with `JBProjects.creationFee()` as the
value, then tell Center about each result:

```http
POST /v1/intents/:id/deployments
Content-Type: application/json

{ "chainId": 8453, "projectId": "123", "transactionHash": "0x..." }
```

Before writing, Center fetches the receipt and the call trace from its own RPC and requires all
of the following: a successful transaction with the configured confirmation count; exactly one
`JBProjects.Create(projectId, owner, caller)` event from the canonical `JBProjects`; and a
successful direct or nested `CALL` whose target and calldata exactly match the signed per-chain
commitment. Nested matching covers Safe and Relayr execution.

| Status | Code | Meaning |
|---|---|---|
| `201` | — | Recorded |
| `400` | `bad_request` | Bad id, bad hash, bad `projectId`, or a `chainId` outside the intent |
| `404` | `not_found` | No such intent |
| `409` | `conflict` | A different deployment is already recorded for that chain |
| `422` | `deployment_unverified` | The trace or the event did not match the signed commitment |
| `503` | `unavailable` | Deployment verification is not configured |

Never mix senders. If a sponsored deploy was requested, do not also send the calls yourself. If
you sent some chains yourself, Center will refuse to sponsor the rest — and even if it did not,
the salts would no longer match and the chains would never link.

## 9. Worked examples

### Beep: a server key publishes, the merchant owns

Beep creates a terminal for a merchant who has no wallet in hand. Beep's server key is the
`publisher`; the merchant's address is `jb.owner` and the owner inside the launch calldata. The
project is listed and has a page immediately. The first charge runs `ensureDeployed` at Beep's
single write chokepoint, before anything in the review-simulate-send pipeline, because there is
no `projectId` to write against until it resolves.

- `format`: `beep.biz/terminal.v1`
- `publisher`: Beep's server key, the only signer, on every intent
- `jb.owner`: the merchant
- Lists: `searchIntents({ publisher })` for Beep's own dashboard, `searchIntents({ owner })` for
  the merchant's projects
- Deploy: sponsored, triggered by the first charge

### Homerun: the owner publishes, chains linked by one salt

Homerun creates a FUND across sponsored rollups. The merchant's own external wallet signs, so the
merchant is both `publisher` and `jb.owner`. The client fixes one random salt and one absolute
start before building the per-chain calls, so every chain carries identical arguments and the
suckers link.

- `format`: `homerun.money/fund.v1`
- `jb`: `{ app: "homerun", kind: "fund", name, owner, chainIds, tokenName, ticker, salt, mustStartAtOrAfter, projectUri }`
- Chains: sponsored rollups only. A FUND that includes Ethereum mainnet is self-paid
- Deploy: one Deploy action on the project page, sponsored, no self-paid fallback

## 10. Common mistakes

- **Stage 1 with `mustStartAtOrAfter: 0`.** Zero means "start now", and "now" is deploy time, not
  the time the signer saw. Every later stage boundary shifts with it. Set an absolute timestamp:
  the moment the intent is made, or an explicitly chosen future time. Stage timestamps are
  honored exactly as signed; a late deploy does not move them.
- **Deploying some chains yourself and asking Center to sponsor the rest.** The salts stop
  matching and the chains never link into one omnichain project. There is no repair.
- **Hand-building the signing message.** Always take it from `POST /v1/intents/message`, and
  always run the two guard checks before signing.
- **Signing without comparing the prepared envelope to the local one.** The signature is over
  whatever Center normalized, not over what you meant.
- **Showing intents in Trending or Top.** Those are volume-based; an intent has none.
- **Calling them "intents" in user-facing copy.** It invites edit and withdraw requests that do
  not exist. Say "project", with a "Deploys on first use" label.
- **Treating the publish signature as transaction approval.** It authorizes storage and
  publication of frozen calldata. Deployment is a separate funded transaction.
- **Publishing from a smart account.** Center recovers the signer from the signature; a contract
  signature is refused. Publish from an externally owned account.
- **Expecting a failed sponsored row to retry.** It is terminal for that intent.
- **An HTTPS `logoUri`.** The first-party webclients render `ipfs://` only.

## Related

- [Agent integration guide](./AI_GUIDE.md): transaction review and recovery across Center's APIs.
- [Journey map](./USER_JOURNEYS.md): the directory, REST, sponsored execution and shared services.
- [MCP connection guide](https://github.com/mejango/jbcenter/blob/main/mcp/README.md): connect a
  client to `https://juicebox.center/mcp`.
````

- [ ] **Step 6: Add the guide to the docs navigation and the explorer index**

In `src/rest/docs/guide.ts`, extend the `navigation` array so the guide appears on every docs page:

```ts
const navigation = [
  ["quickstart", "Get started"], ["client", "Client workflows"], ["authentication", "Authentication"],
  ["transactions", "Transactions"], ["project-intents", "Project intents"],
  ["sponsorship", "Prepaid execution"], ["smart-accounts", "Smart wallets"],
  ["client#run-payments-without-another-owner-prompt", "Unattended payments"],
  ["contracts", "Contract calls"], ["indexer", "Indexed data"], ["api", "Full reference"],
];
```

In `src/rest/docs/page.ts`, add the guide to the `API resources` nav in the header, immediately
after the `user-journeys` link:

```html
<a href="/api/docs/project-intents">Project intents</a>
```

and add one paragraph at the end of the `#write` section, before its closing `</section>`:

```html
<p>A project can also be created without a transaction: publish a signed, frozen set of per-chain launch calls, then let Center's sponsor execute them on the supported rollups. See <a href="/api/docs/project-intents">project intents</a>.</p>
```

- [ ] **Step 7: Point `/llms.txt` at the guide**

In `src/llms.ts`, add one entry at the end of the "Learn, build, inspect" list, before the
`Directory` line:

```ts
- [Create a project without a transaction](${origin}/api/docs/project-intents): publish a signed project launch and let Center's sponsor deploy it.
```

and replace the plain intents bullet in "APIs and agents" with a link:

```ts
- [Project intents](${origin}/api/docs/project-intents): \`POST ${origin}/v1/intents\` publishes a signed, frozen project deployment; \`POST ${origin}/v1/intents/:id/deploy\` requests a sponsored execution of its own calls.
```

- [ ] **Step 8: Point `AI_GUIDE.md` at the guide**

In `docs/rest/AI_GUIDE.md`, insert this section immediately before the line
`## prepaid publication and funding`:

```markdown
## Create a project without a transaction

A Juicebox V6 project can be published as a signed, frozen set of per-chain launch calls before
any transaction exists. The publisher signs a message quoting the content hash; Center stores the
calls unchanged; the project appears in search and has a page immediately. Center's sponsor can
then execute those exact calls on the supported rollups at its own expense, or one wallet can
send them and record the results.

The complete recipe, including the envelope, the guard to apply before signing, the sponsored
chain ids, quotas and refusal codes, is in the [project intents guide](./PROJECT_INTENTS.md).

Two rules carry into every other journey here. A publish signature is not transaction approval:
it authorizes storage and publication of frozen calldata and moves no funds. And one intent has
exactly one deploying sender across all of its chains, because the deployment salts hash the
sender; mixing a sponsored deploy with a self-paid one leaves unrelated projects that can never
be linked.
```

- [ ] **Step 9: Point the README at the guide**

In `README.md`:

Under `## Publish an intent`, insert as the first line of the section:

```markdown
The complete integrator recipe lives in [the project intents guide](docs/rest/PROJECT_INTENTS.md),
served at [`/api/docs/project-intents`](https://juicebox.center/api/docs/project-intents). This
section is the short version.
```

Under `## Read and search`, after the `GET` block, add:

```markdown
`GET /v1/search` also accepts `owner` and `publisher`, each an address matched case-insensitively
and combinable with `q`: `owner` matches the indexed `jb.owner` and answers "which projects does
this account have", `publisher` matches the signing key and answers "which intents did my server
publish".
```

`## Request a sponsored deploy` already exists on `main` and is accurate: do not add a second
copy of it. Add only this line as its first line:

```markdown
The [project intents guide](docs/rest/PROJECT_INTENTS.md) covers the chain families, quotas,
reservations and refusal codes in full.
```

Under `## Connect an assistant through MCP`, add at the end of the section:

```markdown
The MCP exposes the intent flow as `jb_prepare_intent` (local commitment and signing message),
`jb_publish_intent` (publish an envelope the caller already signed), `jb_get_intent` and
`jb_deploy_intent` (request a sponsored deploy). The MCP holds no key and signs nothing.
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run test/rest-guide.test.ts test/app.test.ts`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add docs/rest/PROJECT_INTENTS.md docs/rest/AI_GUIDE.md README.md src/llms.ts src/rest/site.ts src/rest/docs/guide.ts src/rest/docs/page.ts test/rest-guide.test.ts test/app.test.ts
git commit -m "$(cat <<'MESSAGE'
Document project intents for integrators and agents

Add docs/rest/PROJECT_INTENTS.md as the canonical recipe and link it from the
docs allow-list, the guide navigation, the API explorer, the agent guide,
/llms.txt and the README.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
MESSAGE
)"
```

---

## Task 2: `owner` and `publisher` filters on `/v1/search`

**Files:**
- Create: `extensions/jbcenter/src/db/migrations/058_intent_owner_publisher_search.sql`
- Modify: `extensions/jbcenter/src/store.ts` (the `Store` interface)
- Modify: `extensions/jbcenter/src/db/postgres.ts` (`search`, ~lines 278-330)
- Modify: `extensions/jbcenter/test/support/memoryStore.ts` (`search`)
- Modify: `extensions/jbcenter/src/app.ts` (the `/v1/search` route, ~lines 640-650)
- Modify: `extensions/jbcenter/src/mcp.ts` (the in-process search bridge, ~lines 192-217)
- Test: `extensions/jbcenter/test/app.test.ts`, `extensions/jbcenter/test/postgres.integration.test.ts`, `extensions/jbcenter/test/mcp.test.ts`

The spec pairs this with `searchIntents` gaining the same fields in
`@bananapus/nana-sdk-core/jbcenter`. That is section 2 of the spec and a different repository: do
not bump the SDK here. Center's own HTTP route and its in-process MCP bridge are the whole of this
task, and the MCP adapter's typed `search` keeps its current `{query, limit, cursor}` parameters
until the SDK ships the new fields.

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `export type SearchFilters = { owner?: Address; publisher?: Address }` in `src/store.ts`.
  - `Store.search(query: string, limit: number, offset: number, filters: SearchFilters): Promise<SearchPage>` — the fourth argument is required on the interface and always passed by callers, as `{}` when no filter is present. `PostgresStore` and `MemoryStore` both implement it.
  - `intents_owner_idx` and `intents_publisher_idx` functional indexes on `lower(owner)` and `lower(publisher)`.

- [ ] **Step 1: Write the failing route tests**

Add to `test/app.test.ts`, as a new `it` inside `describe("JB Center API", ...)`:

```ts
  it("filters search by owner and publisher, case-insensitively", async () => {
    const store = new MemoryStore();
    const app = createApp(store, { deploymentVerifier: verifier });
    await publish(app);
    const owner = account.address;
    const other = "0x4444444444444444444444444444444444444444";

    const page = async (query: string) =>
      (await (await app.request(`/v1/search?${query}`, { headers: trusted })).json()) as SearchPage;

    expect((await page(`owner=${owner.toLowerCase()}`)).items).toHaveLength(1);
    expect((await page(`owner=${owner.toUpperCase().replace("0X", "0x")}`)).items).toHaveLength(1);
    expect((await page(`publisher=${owner.toLowerCase()}`)).items).toHaveLength(1);
    expect((await page(`q=climate&owner=${owner}`)).items).toHaveLength(1);
    expect((await page(`q=climate&owner=${other}`)).items).toHaveLength(0);
    expect((await page(`owner=${other}`)).totalCount).toBe(0);
    expect((await page(`publisher=${other}`)).items).toHaveLength(0);

    const invalid = await app.request("/v1/search?owner=not-an-address", { headers: trusted });
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as { error: { code: string } }).error.code).toBe("bad_request");
  });
```

Add to `test/postgres.integration.test.ts`, as a new `it` inside `suite("PostgreSQL store", ...)`:

```ts
  it("filters search by owner and publisher without regard to address casing", async () => {
    const owner = "0x5555555555555555555555555555555555555555";
    const publisher = "0x6666666666666666666666666666666666666666";
    const value = newIntent({ name: "filterable" });
    await store!.createIntent(
      { ...value, owner, publisher },
      { maxIntents: 100, maxBytes: 10_000_000 },
    );

    expect((await store!.search("", 20, 0, { owner: owner.toUpperCase() as `0x${string}` })).items)
      .toHaveLength(1);
    expect((await store!.search("filterable", 20, 0, { owner })).totalCount).toBe(1);
    expect((await store!.search("", 20, 0, { publisher })).items).toHaveLength(1);
    expect((await store!.search("", 20, 0, { owner, publisher: owner as `0x${string}` })).items)
      .toHaveLength(0);
    expect(
      (await store!.search("", 20, 0, { owner: "0x7777777777777777777777777777777777777777" }))
        .totalCount,
    ).toBe(0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/app.test.ts`
Expected: FAIL — the route ignores `owner` and `publisher`, so the `other`-address assertions return 1 item and the invalid-address request returns 200.

- [ ] **Step 3: Add the filter type to the store interface**

In `src/store.ts`, add the type and widen the method:

```ts
export type SearchFilters = {
  owner?: Address;
  publisher?: Address;
};
```

```ts
  search(
    query: string,
    limit: number,
    offset: number,
    filters: SearchFilters,
  ): Promise<SearchPage>;
```

- [ ] **Step 4: Implement the filters in the PostgreSQL store**

In `src/db/postgres.ts`, import `SearchFilters` alongside the existing store imports and replace
the body of `search`:

```ts
  async search(
    query: string,
    limit: number,
    offset: number,
    filters: SearchFilters,
  ): Promise<SearchPage> {
    const filterParams: unknown[] = [];
    const conditions: string[] = [];
    if (query) {
      filterParams.push(query);
      conditions.push(`search_vector @@ websearch_to_tsquery('simple', $${filterParams.length})`);
    }
    if (filters.owner) {
      filterParams.push(filters.owner.toLowerCase());
      conditions.push(`lower(owner) = $${filterParams.length}`);
    }
    if (filters.publisher) {
      filterParams.push(filters.publisher.toLowerCase());
      conditions.push(`lower(publisher) = $${filterParams.length}`);
    }
    const where = conditions.length ? `AND ${conditions.join(" AND ")}` : "";
    const rowParams = [...filterParams, limit, offset];
    const limitParam = filterParams.length + 1;
    const offsetParam = filterParams.length + 2;
    const order = query
      ? "ts_rank(search_vector, websearch_to_tsquery('simple', $1)) DESC, created_at DESC, id"
      : "created_at DESC, id";
    const [rows, count] = await Promise.all([
      this.pool.query<IntentRow>(
        `${selectIntent}
         WHERE NOT EXISTS (SELECT 1 FROM deployments WHERE deployments.intent_id = intents.id)
         ${where}
         ORDER BY ${order}
         LIMIT $${limitParam} OFFSET $${offsetParam}`,
        rowParams,
      ),
      this.pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM intents
         WHERE NOT EXISTS (SELECT 1 FROM deployments WHERE deployments.intent_id = intents.id)
         ${where}`,
        filterParams,
      ),
    ]);
```

The rest of the method — building `items` from `rows.rows` and returning
`{ items, totalCount, nextCursor }` — is unchanged. The `$1` in `order` is safe because `query`,
when present, is always the first pushed parameter.

- [ ] **Step 5: Add the migration**

Create `src/db/migrations/058_intent_owner_publisher_search.sql`:

```sql
CREATE INDEX intents_owner_idx ON intents (lower(owner));
CREATE INDEX intents_publisher_idx ON intents (lower(publisher));
```

- [ ] **Step 6: Implement the same filters in the memory store**

In `test/support/memoryStore.ts`, import `type SearchFilters` from `../../src/store.js` and
replace the filter expression in `search`:

```ts
  async search(
    query: string,
    limit: number,
    offset: number,
    filters: SearchFilters,
  ): Promise<SearchPage> {
    const owner = filters.owner?.toLowerCase();
    const publisher = filters.publisher?.toLowerCase();
    const values = this.intents.filter(
      (intent) =>
        intent.deployments.length === 0 &&
        (owner === undefined || intent.owner?.toLowerCase() === owner) &&
        (publisher === undefined || intent.publisher.toLowerCase() === publisher) &&
        [intent.name, intent.description, intent.tagline, ...intent.tags]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
```

The rest of the method is unchanged.

- [ ] **Step 7: Accept the two parameters on the route**

In `src/app.ts`, add a helper beside the existing `cursor` helper:

```ts
function optionalAddress(value: string | undefined, name: string): Address | undefined {
  if (value === undefined) return undefined;
  try {
    return address(value, name);
  } catch {
    throw new BadRequest(`${name} must be an Ethereum address`);
  }
}
```

Import `type Address` from `viem` in the existing viem import, then replace the `/v1/search`
handler's final line:

```ts
    const owner = optionalAddress(c.req.query("owner"), "owner");
    const publisher = optionalAddress(c.req.query("publisher"), "publisher");
    return c.json(
      await store.search(query, limit, cursor(c.req.query("cursor")), {
        ...(owner ? { owner } : {}),
        ...(publisher ? { publisher } : {}),
      }),
    );
```

- [ ] **Step 8: Keep the in-process MCP search bridge in step**

In `src/mcp.ts`, inside `createCenterReadFetcher`'s `/v1/search` branch, widen the parameter
allow-list and forward the filters, so Center has one search contract and not two:

```ts
      if (
        [...params.keys()].some(
          (key) =>
            !["q", "limit", "cursor", "owner", "publisher"].includes(key) ||
            params.getAll(key).length !== 1,
        )
      )
        invalidRequest();
```

and, after the existing `limit`/`offset` validation:

```ts
      const filters: SearchFilters = {};
      for (const key of ["owner", "publisher"] as const) {
        const value = params.get(key);
        if (value === null) continue;
        if (!/^0x[0-9a-fA-F]{40}$/u.test(value)) invalidRequest();
        filters[key] = getAddress(value);
      }
      read = () => store.search(query, limit, offset, filters);
```

Import `getAddress` from `viem` and `type SearchFilters` from `./store.js` at the top of
`src/mcp.ts`.

- [ ] **Step 9: Update the one assertion that pins the old call shape**

In `test/mcp.test.ts`, in `it("uses Center-local backends without fabricating an approved browser Origin", ...)`:

```ts
    expect(store.search).toHaveBeenCalledWith("example", 20, 0, {});
```

- [ ] **Step 10: Run the tests to verify they pass**

```bash
npx vitest run test/app.test.ts test/mcp.test.ts
TEST_DATABASE_URL=postgres://localhost:5432/jbcenter_test npx vitest run test/postgres.integration.test.ts
```
Expected: PASS for both. The PostgreSQL run needs a disposable database; without `TEST_DATABASE_URL` that suite skips itself and the first command must still pass.

- [ ] **Step 11: Commit**

```bash
git add src/store.ts src/db/postgres.ts src/db/migrations/058_intent_owner_publisher_search.sql src/app.ts src/mcp.ts test/support/memoryStore.ts test/app.test.ts test/postgres.integration.test.ts test/mcp.test.ts
git commit -m "$(cat <<'MESSAGE'
Filter intent search by owner and publisher

Both match case-insensitively against the stored checksummed addresses and
combine with the full-text query. Add functional indexes for each.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
MESSAGE
)"
```

---

## Task 3: Let the embedded MCP reach Center's two intent write routes

**Files:**
- Modify: `extensions/jbcenter/src/firstParty.ts`
- Modify: `extensions/jbcenter/src/app.ts` (the exports at ~lines 48-53)
- Modify: `extensions/jbcenter/src/mcp.ts` (`MCP_BACKEND_LIMITS`, `createCenterReadFetcher`, `createCenterMcp`)
- Modify: `extensions/jbcenter/src/index.ts` (~line 68)
- Modify: `extensions/jbcenter/mcp/src/adapters/http.ts` (the `!response.ok` branch)
- Modify: `extensions/jbcenter/mcp/src/adapters/jbcenter.ts`
- Test: `extensions/jbcenter/test/mcp.test.ts`, `extensions/jbcenter/test/app.test.ts`, `extensions/jbcenter/test/rest-wallet-policy.test.ts`, `extensions/jbcenter/mcp/tests/adapters/jbcenter.test.ts`, `extensions/jbcenter/mcp/tests/adapters/http.test.ts`

**Interfaces:**
- Consumes: `Store.search(query, limit, offset, filters)` and `SearchFilters` from Task 2.
- Produces:
  - `centerOriginForEnvironment(environment?: string): string` in `src/firstParty.ts` — `https://dev.juicebox.center` for the `dev` environment, `https://juicebox.center` otherwise.
  - `CENTER_ORIGIN: string` and the widened `ALLOWED_ORIGINS: readonly string[]` in `src/app.ts`.
  - `createCenterFetcher(store: Store, centerUrl: string, options?: { centerFetch?: (request: Request) => Response | Promise<Response>; origin?: string }): (url: string | URL, options?: FetchJsonOptions) => Promise<unknown>` in `src/mcp.ts`, replacing `createCenterReadFetcher` as the exported entry point.
  - `createCenterMcp(store, options)` gains `centerFetch?: (request: Request) => Response | Promise<Response>`.
  - `CenterClient.publishIntent<TJb>(value: JBCenterPublishIntentInput<TJb>): Promise<JBCenterIntent<TJb>>`.
  - `CenterClient.requestDeploy(id: string): Promise<CenterDeployPage>`, where `CenterDeployPage = { deploys: CenterDeployRow[] }`.
  - `CenterDeployRow = { chainId: number; status: 'queued' | 'sent' | 'confirmed' | 'failed'; transactionHash: Hex | null; bundleUuid: string | null; error: string | null; createdAt: string; updatedAt: string }` exported from `mcp/src/adapters/jbcenter.ts`.
  - `CENTER_DEPLOY_REFUSALS: Record<'NOT_SPONSORABLE' | 'SPONSOR_QUOTA' | 'SPONSOR_BUDGET' | 'SPONSOR_UNAVAILABLE', string>` exported from the same module.
  - `DomainError.details` from `fetchJson` becomes `{ status: number; code?: string }`.

- [ ] **Step 1: Write the failing transport tests**

Add to `test/mcp.test.ts`, as a new `describe` at the end of the file:

```ts
describe("Center intent write bridge", () => {
  const envelope: IntentEnvelope = {
    format: "juicebox.money/v1",
    deploymentVersion: "6",
    chainIds: [84532],
    deploymentCalls: [
      { chainId: 84532, to: "0x3333333333333333333333333333333333333333", data: "0x12345678" },
    ],
    jb: { v: 1, name: "Bridged", chains: [84532] },
  };

  it("publishes and requests a deploy through the app with Center's own origin", async () => {
    const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const signature = await account.signMessage({
      message: signingMessage(contentHash(envelope)),
    });
    const seen: { origin: string | null; method: string; path: string }[] = [];
    const store = storeMock();
    const centerFetch = vi.fn(async (request: Request) => {
      const url = new URL(request.url);
      seen.push({
        origin: request.headers.get("origin"),
        method: request.method,
        path: url.pathname,
      });
      if (url.pathname === "/v1/intents")
        return Response.json({ ...INTENT_FIXTURE, publisher: account.address, signature }, { status: 201 });
      return Response.json(
        {
          deploys: [
            {
              chainId: 84532,
              status: "queued",
              transactionHash: null,
              bundleUuid: null,
              error: null,
              createdAt: "2026-09-21T00:00:00.000Z",
              updatedAt: "2026-09-21T00:00:00.000Z",
            },
          ],
        },
        { status: 202 },
      );
    });
    const { services } = createCenterMcp(store, {
      rpc: rpcMock(),
      centerFetch,
      env: { NODE_ENV: "production", MCP_PLAN_SECRET: "mcp-secret-for-tests-with-32-bytes" },
    });

    const published = await services.center.publishIntent({
      ...envelope,
      publisher: account.address,
      signature,
    });
    expect(published.id).toBe(INTENT_ID);
    const deploys = await services.center.requestDeploy(INTENT_ID);
    expect(deploys.deploys[0]?.status).toBe("queued");
    expect(seen).toEqual([
      { origin: ORIGIN, method: "POST", path: "/v1/intents" },
      { origin: ORIGIN, method: "POST", path: `/v1/intents/${INTENT_ID}/deploy` },
    ]);
  });

  it("refuses to publish a signature that does not match the envelope", async () => {
    const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const signature = await account.signMessage({ message: "a different message" });
    const centerFetch = vi.fn(async () => Response.json({}, { status: 201 }));
    const { services } = createCenterMcp(storeMock(), {
      rpc: rpcMock(),
      centerFetch,
      env: { NODE_ENV: "production", MCP_PLAN_SECRET: "mcp-secret-for-tests-with-32-bytes" },
    });
    await expect(
      services.center.publishIntent({ ...envelope, publisher: account.address, signature }),
    ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
    expect(centerFetch).not.toHaveBeenCalled();
  });

  it("maps Center's sponsored-deploy refusals to fixed codes", async () => {
    for (const [status, code, expected] of [
      [429, "sponsor_quota", "SPONSOR_QUOTA"],
      [429, "sponsor_budget", "SPONSOR_BUDGET"],
      [503, "unavailable", "SPONSOR_UNAVAILABLE"],
      [400, "bad_request", "NOT_SPONSORABLE"],
    ] as const) {
      const { services } = createCenterMcp(storeMock(), {
        rpc: rpcMock(),
        centerFetch: async () => Response.json({ error: { code, message: "refused" } }, { status }),
        env: { NODE_ENV: "production", MCP_PLAN_SECRET: "mcp-secret-for-tests-with-32-bytes" },
      });
      await expect(services.center.requestDeploy(INTENT_ID)).rejects.toMatchObject({
        code: expected,
      });
    }
  });

  it("rejects any write route other than the two intent writes", async () => {
    const centerFetch = vi.fn(async () => Response.json({}, { status: 200 }));
    const fetcher = createCenterFetcher(storeMock(), ORIGIN, { centerFetch, origin: ORIGIN });
    for (const path of ["v1/pins/json", "v1/intents/not-a-uuid/deploy", `v1/intents/${INTENT_ID}`]) {
      await expect(fetcher(`${ORIGIN}/${path}`, { method: "POST", body: {} })).rejects.toBeInstanceOf(
        Error,
      );
    }
    expect(centerFetch).not.toHaveBeenCalled();
  });
});
```

Add `createCenterFetcher` to the existing `../src/mcp.js` import block at the top of the file,
and add the shared fixture near the other constants:

```ts
const INTENT_FIXTURE = {
  id: INTENT_ID,
  status: "undeployed",
  contentHash: contentHash({
    format: "juicebox.money/v1",
    deploymentVersion: "6",
    chainIds: [84532],
    deploymentCalls: [
      { chainId: 84532, to: "0x3333333333333333333333333333333333333333", data: "0x12345678" },
    ],
    jb: { v: 1, name: "Bridged", chains: [84532] },
  } as IntentEnvelope),
  envelope: {
    format: "juicebox.money/v1",
    deploymentVersion: "6",
    chainIds: [84532],
    deploymentCalls: [
      { chainId: 84532, to: "0x3333333333333333333333333333333333333333", data: "0x12345678" },
    ],
    jb: { v: 1, name: "Bridged", chains: [84532] },
  },
  name: "Bridged",
  description: null,
  tagline: null,
  tags: [],
  logoUri: null,
  owner: null,
  createdAt: "2026-09-21T00:00:00.000Z",
  deployments: [],
  deploys: [],
} as const;
```

Add to `test/app.test.ts`, inside `describe("JB Center API", ...)`:

```ts
  it("admits Center's own origin on /v1 so the embedded MCP can publish", async () => {
    const app = createApp(new MemoryStore());
    const response = await app.request("/v1/search", {
      headers: { origin: "https://juicebox.center" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://juicebox.center");
  });
```

Add to `test/rest-wallet-policy.test.ts`, inside the first `it`:

```ts
    expect(originsForEnvironment("production")).not.toContain("https://juicebox.center");
    expect(originsForEnvironment("dev")).not.toContain("https://dev.juicebox.center");
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/mcp.test.ts test/app.test.ts test/rest-wallet-policy.test.ts`
Expected: FAIL — `createCenterFetcher` does not exist, `createCenterMcp` takes no `centerFetch`, `services.center.publishIntent` is not a function, and `/v1/search` from `https://juicebox.center` answers `403`.

- [ ] **Step 3: Name Center's own origin, without making it a wallet application**

In `src/firstParty.ts`, add at the end of the file:

```ts
/**
 * Center's own public origin. It is a trusted caller of the /v1 gate so the co-hosted MCP can
 * reach the intent write routes through the same middleware, and it is deliberately not a
 * first-party wallet application: it grants no wallet handoff and carries no callbacks.
 */
export function centerOriginForEnvironment(
  environment = process.env.RAILWAY_ENVIRONMENT_NAME,
): string {
  return environment === "dev" ? "https://dev.juicebox.center" : "https://juicebox.center";
}
```

In `src/app.ts`, replace the two lines that build the allow-list:

```ts
import { centerOriginForEnvironment, originsForEnvironment } from "./firstParty.js";
export { centerOriginForEnvironment, originsForEnvironment } from "./firstParty.js";
```

```ts
export const CENTER_ORIGIN = centerOriginForEnvironment();
export const ALLOWED_ORIGINS = [...originsForEnvironment(), CENTER_ORIGIN];
```

- [ ] **Step 4: Carry the upstream error code through `fetchJson`**

In `mcp/src/adapters/http.ts`, replace the `if (!response.ok)` block:

```ts
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      await response.body?.cancel().catch(() => undefined);
      let code: string | undefined;
      try {
        const parsed = JSON.parse(body.slice(0, 4096)) as { error?: { code?: unknown } };
        if (typeof parsed.error?.code === 'string' && /^[a-z_]{1,64}$/u.test(parsed.error.code))
          code = parsed.error.code;
      } catch {
        code = undefined;
      }
      throw new DomainError(
        'UPSTREAM_HTTP_ERROR',
        `The upstream returned HTTP ${response.status}.`,
        {
          retryable: response.status === 429 || response.status >= 500,
          details: { status: response.status, ...(code === undefined ? {} : { code }) },
        },
      );
    }
```

Only an authored message is ever surfaced; the upstream's own text is never echoed, and the code
is admitted only when it matches the bounded pattern.

- [ ] **Step 5: Add the write bridge to `src/mcp.ts`**

Add `getAddress` to the existing `viem` import, `type SearchFilters` to the `./store.js` import
(done in Task 2), and add:

```ts
const WRITE_RESPONSE_LIMIT = 256 * 1024;
/** The co-hosted MCP is one caller of the publish and deploy budgets, not a browser per visitor. */
const MCP_CALLER_IP = "mcp";
```

Extend `MCP_BACKEND_LIMITS` with `writesPerMinute: 60,`.

Then add, immediately after `createCenterReadFetcher`:

```ts
export type CenterFetch = (request: Request) => Response | Promise<Response>;

function writePath(pathname: string, prefix: string): boolean {
  if (pathname === `${prefix}/v1/intents`) return true;
  const intents = `${prefix}/v1/intents/`;
  const suffix = "/deploy";
  if (!pathname.startsWith(intents) || !pathname.endsWith(suffix)) return false;
  return UUID.test(pathname.slice(intents.length, pathname.length - suffix.length));
}

function refusal(status: number, payload: unknown): DomainError {
  const code = (payload as { error?: { code?: unknown } } | null)?.error?.code;
  return new DomainError(
    "UPSTREAM_HTTP_ERROR",
    `The internal Center route returned HTTP ${status}.`,
    {
      retryable: status === 429 || status >= 500,
      details: {
        status,
        ...(typeof code === "string" && /^[a-z_]{1,64}$/u.test(code) ? { code } : {}),
      },
    },
  );
}

/**
 * Reads run against the store; the two intent writes run through the Hono app itself, so
 * signature verification, publish limits and sponsor policy have exactly one implementation.
 */
export function createCenterFetcher(
  store: Store,
  centerUrl: string,
  options: { centerFetch?: CenterFetch; origin?: string } = {},
) {
  const base = baseUrl(centerUrl);
  const prefix = base.pathname.replace(/\/$/u, "");
  const read = createCenterReadFetcher(store, centerUrl);
  return async (url: string | URL, fetchOptions: FetchJsonOptions = {}): Promise<unknown> => {
    const method = fetchOptions.method ?? (fetchOptions.body === undefined ? "GET" : "POST");
    if (method === "GET") return read(url, fetchOptions);
    const target = targetUrl(url, base);
    const { centerFetch, origin } = options;
    if (method !== "POST" || !centerFetch || !origin || target.search) invalidRequest();
    if (!writePath(target.pathname, prefix)) invalidRequest();
    const signal = signalFor(fetchOptions);
    try {
      await quota(store, "center:mcp:writes", MCP_BACKEND_LIMITS.writesPerMinute, 60, signal);
      const response = await cancellable(signal, () =>
        Promise.resolve(
          centerFetch(
            new Request(target, {
              method: "POST",
              headers: {
                origin,
                accept: "application/json",
                "content-type": "application/json",
                "x-real-ip": MCP_CALLER_IP,
              },
              body: JSON.stringify(fetchOptions.body ?? {}),
            }),
          ),
        ),
      );
      const text = await response.text();
      if (Buffer.byteLength(text) > WRITE_RESPONSE_LIMIT)
        throw new DomainError(
          "UPSTREAM_RESPONSE_TOO_LARGE",
          "The backend response exceeded its size limit. Narrow the query.",
        );
      let payload: unknown = null;
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = null;
      }
      if (!response.ok) throw refusal(response.status, payload);
      return boundedResult(payload, fetchOptions.maxBytes, WRITE_RESPONSE_LIMIT);
    } catch (error) {
      safeFailure(error, signal);
    }
  };
}
```

In `createCenterMcp`, accept and use the app bridge:

```ts
export function createCenterMcp(
  store: Store,
  options: {
    rpc: RpcGateway;
    pinning?: PinningService;
    env?: NodeJS.ProcessEnv;
    rpcSiteLimitPerMinute?: number;
    /** The Hono app's own fetch. Without it the MCP has reads only. */
    centerFetch?: CenterFetch;
  },
): { config: Config; services: Services } {
```

```ts
  const center = new CenterClient({
    baseUrl: config.centerUrl,
    fetchJson: createCenterFetcher(store, config.centerUrl, {
      ...(options.centerFetch ? { centerFetch: options.centerFetch } : {}),
      origin: publicOrigin,
    }),
  });
```

- [ ] **Step 6: Hand the app's fetch to the MCP in `src/index.ts`**

Replace line 68. The arrow closes over `app`, which is defined further down and only ever called
once a request arrives, so there is no initialization-order problem:

```ts
const mcp = createCenterMcp(store, {
  rpc,
  rpcSiteLimitPerMinute,
  centerFetch: (request) => app.fetch(request),
  ...(pinning ? { pinning } : {}),
});
```

- [ ] **Step 7: Add `publishIntent` and `requestDeploy` to the adapter**

In `mcp/src/adapters/jbcenter.ts`, extract the deploy row schema, add the refusal table, the
private `write` helper, and the two methods.

Replace the inline `deploys` array in `intentSchema` with a named schema declared above it:

```ts
const deployRowSchema = z.object({
  chainId: chainIdSchema,
  status: z.enum(['queued', 'sent', 'confirmed', 'failed']),
  transactionHash: hashSchema.nullable(),
  bundleUuid: z.string().max(200).nullable(),
  error: z.string().max(8192).nullable(),
  createdAt: z.string().max(64),
  updatedAt: z.string().max(64),
});
const deployPageSchema = z.object({ deploys: z.array(deployRowSchema).max(16) });
export type CenterDeployRow = z.infer<typeof deployRowSchema>;
export type CenterDeployPage = z.infer<typeof deployPageSchema>;
```

```ts
  deploys: z.array(deployRowSchema).max(16),
```

Add the fixed refusal sentences and the mapping beside `invalidInput`/`invalidResponse`:

```ts
export const CENTER_DEPLOY_REFUSALS = {
  NOT_SPONSORABLE:
    'JB Center does not sponsor this intent. Every chain must be one of the supported rollups, all in one family, and the intent must have no recorded deployment. Deploy it from a funded wallet instead.',
  SPONSOR_QUOTA:
    'The daily sponsored deploy quota is spent. Retry in a day, or deploy the intent from a funded wallet.',
  SPONSOR_BUDGET:
    'The shared daily sponsorship budget is spent. Retry in a day, or deploy the intent from a funded wallet.',
  SPONSOR_UNAVAILABLE:
    'Sponsored deploys are unavailable right now. Retry later, or deploy the intent from a funded wallet.',
} as const;

function upstreamDetails(error: unknown): { status?: number; code?: string } {
  const details = error instanceof DomainError ? error.details : undefined;
  return details && typeof details === 'object' ? (details as { status?: number; code?: string }) : {};
}

/** Center's coded refusals become fixed sentences; no upstream text ever reaches a caller. */
function deployRefusal(error: unknown): unknown {
  const { status, code } = upstreamDetails(error);
  const day = { retryable: true, details: { retryAfterSeconds: 86_400 } };
  if (code === 'sponsor_budget')
    return new DomainError('SPONSOR_BUDGET', CENTER_DEPLOY_REFUSALS.SPONSOR_BUDGET, day);
  if (code === 'sponsor_quota' || status === 429)
    return new DomainError('SPONSOR_QUOTA', CENTER_DEPLOY_REFUSALS.SPONSOR_QUOTA, day);
  if (status === 503)
    return new DomainError('SPONSOR_UNAVAILABLE', CENTER_DEPLOY_REFUSALS.SPONSOR_UNAVAILABLE, {
      retryable: true,
    });
  if (status === 400)
    return new DomainError('NOT_SPONSORABLE', CENTER_DEPLOY_REFUSALS.NOT_SPONSORABLE);
  if (status === 404)
    return new DomainError('NOT_FOUND', 'The requested JB Center intent was not found.');
  return error;
}
```

Add the private `write` helper next to `read` inside `CenterClient`:

```ts
  private async write(path: string, body: unknown): Promise<unknown> {
    try {
      return await this.request(`${this.baseUrl}/${path}`, {
        method: 'POST',
        headers: {
          ...this.config.headers,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body,
        timeoutMs: this.config.timeoutMs ?? 15_000,
        maxBytes: this.config.maxBytes ?? 2 * 1024 * 1024,
      });
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        'UPSTREAM_ERROR',
        'JB Center could not complete the write. Verify operator integration access and retry.',
        { retryable: true },
      );
    }
  }
```

Add the two public methods after `getIntent`:

```ts
  /**
   * Stores an envelope the caller already signed. This client never signs: the signature is
   * verified locally against the exact normalized envelope before anything is sent.
   */
  async publishIntent<TJb extends JBCenterJsonObject>(
    value: JBCenterPublishIntentInput<TJb>,
  ): Promise<JBCenterIntent<TJb>> {
    const { publisher, signature, ...rest } = value;
    const envelope = normalizeCenterIntent(rest as JBCenterIntentInput<TJb>);
    let account: Address;
    try {
      account = getAddress(input(addressSchema, publisher));
    } catch {
      invalidInput();
    }
    const signed = input(signatureSchema, signature) as Hex;
    const contentHash = keccak256(toBytes(canonicalCenterJson(envelope)));
    let valid = false;
    try {
      valid = await verifyMessage({
        address: account,
        message: centerIntentMessage(contentHash),
        signature: signed,
      });
    } catch {
      valid = false;
    }
    if (!valid)
      throw new DomainError(
        'INVALID_SIGNATURE',
        'The signature does not match this publisher and this exact envelope. Sign the message returned by the intent preparation tool, from an externally owned account.',
      );
    const parsed = intentSchema.safeParse(
      await this.write('v1/intents', { ...envelope, publisher: account, signature: signed }),
    );
    if (!parsed.success) invalidResponse();
    if (
      parsed.data.contentHash.toLowerCase() !== contentHash.toLowerCase() ||
      parsed.data.publisher.toLowerCase() !== account.toLowerCase() ||
      parsed.data.signature.toLowerCase() !== signed.toLowerCase()
    )
      invalidResponse();
    let stored: JBCenterIntentInput;
    try {
      stored = normalizeCenterIntent(parsed.data.envelope as JBCenterIntentInput);
    } catch {
      invalidResponse();
    }
    if (keccak256(toBytes(canonicalCenterJson(stored))).toLowerCase() !== contentHash.toLowerCase())
      invalidResponse();
    return { ...parsed.data, envelope } as JBCenterIntent<TJb>;
  }

  /** Asks Center to execute the intent's own signed calls at Center's expense. Signs nothing. */
  async requestDeploy(id: string): Promise<CenterDeployPage> {
    input(uuidSchema, id);
    let payload: unknown;
    try {
      payload = await this.write(`v1/intents/${encodeURIComponent(id)}/deploy`, {});
    } catch (error) {
      throw deployRefusal(error);
    }
    const parsed = deployPageSchema.safeParse(payload);
    if (!parsed.success) invalidResponse();
    return parsed.data;
  }
```

Add `JBCenterPublishIntentInput` to the type import from `@bananapus/nana-sdk-core/jbcenter`.

Extend `CENTER_INTENT_SEMANTICS` with the write semantics:

```ts
  publication:
    'Publishing stores an envelope the user already signed. It is not wallet approval, spends no funds, and cannot be edited, replaced or withdrawn afterwards.',
  sponsoredDeploy:
    'A sponsored deploy request queues Center-funded execution of the committed calls. Queued rows are not confirmations; a failed row is terminal for that intent.',
```

and extend `CENTER_SOURCE_REFERENCES` with
`'extensions/jbcenter/src/app.ts:/v1/intents, /v1/intents/:id/deploy'`.

- [ ] **Step 8: Add the adapter unit test**

`mcp/tests/adapters/jbcenter.test.ts` already exists. Append this `describe` to it, reusing the
file's existing imports where they overlap:

```ts
import { describe, expect, it, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { CenterClient, centerIntentMessage, canonicalCenterJson } from '../../src/adapters/jbcenter.js';
import { keccak256, toBytes } from 'viem';

const ENVELOPE = {
  format: 'juicebox.money/v1',
  deploymentVersion: '6',
  chainIds: [84532],
  deploymentCalls: [
    { chainId: 84532, to: '0x3333333333333333333333333333333333333333', data: '0x12345678' },
  ],
  jb: { v: 1, name: 'Unit', chains: [84532] },
} as const;

describe('CenterClient writes', () => {
  it('sends the normalized envelope and rejects a mismatched signature without a request', async () => {
    const account = privateKeyToAccount(`0x${'11'.repeat(32)}`);
    const hash = keccak256(toBytes(canonicalCenterJson(ENVELOPE as never)));
    const signature = await account.signMessage({ message: centerIntentMessage(hash) });
    const fetchJson = vi.fn(async () => ({
      id: 'a7396c7e-b13f-4ca8-9f06-96f36ab22c3a',
      status: 'undeployed',
      contentHash: hash,
      envelope: ENVELOPE,
      publisher: account.address,
      signature,
      name: 'Unit',
      description: null,
      tagline: null,
      tags: [],
      logoUri: null,
      owner: null,
      createdAt: '2026-09-21T00:00:00.000Z',
      deployments: [],
      deploys: [],
    }));
    const client = new CenterClient({ baseUrl: 'https://juicebox.center', fetchJson });

    const intent = await client.publishIntent({
      ...ENVELOPE,
      publisher: account.address,
      signature,
    } as never);
    expect(intent.contentHash).toBe(hash);
    const [url, options] = fetchJson.mock.calls[0]!;
    expect(String(url)).toBe('https://juicebox.center/v1/intents');
    expect((options as { method: string }).method).toBe('POST');

    await expect(
      client.publishIntent({
        ...ENVELOPE,
        publisher: '0x4444444444444444444444444444444444444444',
        signature,
      } as never),
    ).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 8b: Cover the new `fetchJson` error detail**

Append to `mcp/tests/adapters/http.test.ts`:

```ts
  it('carries a bounded upstream error code on the failure details', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: { code: 'sponsor_quota', message: 'refused' } }, { status: 429 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchJson('https://juicebox.center/v1/intents/x/deploy', { body: {} })).rejects
      .toMatchObject({ code: 'UPSTREAM_HTTP_ERROR', details: { status: 429, code: 'sponsor_quota' } });

    fetchMock.mockResolvedValueOnce(new Response('<html>nope</html>', { status: 503 }));
    await expect(fetchJson('https://juicebox.center/v1/intents/x/deploy', { body: {} })).rejects
      .toMatchObject({ details: { status: 503 } });
  });
```

The second case proves a non-JSON error body yields `details` without a `code` rather than
throwing, and that upstream text never reaches the caller.

- [ ] **Step 9: Run the tests to verify they pass**

```bash
cd mcp && npm run build && npx vitest run tests/adapters/jbcenter.test.ts tests/adapters/http.test.ts && cd ..
npx vitest run test/mcp.test.ts test/app.test.ts test/rest-wallet-policy.test.ts
```
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/firstParty.ts src/app.ts src/mcp.ts src/index.ts mcp/src/adapters/http.ts mcp/src/adapters/jbcenter.ts test/mcp.test.ts test/app.test.ts test/rest-wallet-policy.test.ts mcp/tests/adapters/jbcenter.test.ts mcp/tests/adapters/http.test.ts
git commit -m "$(cat <<'MESSAGE'
Bridge the co-hosted MCP to Center's intent write routes

Writes run through the Hono app itself with Center's own origin, so signature
verification, publish limits and sponsor policy keep one implementation. The
adapter verifies the caller's signature locally before sending and maps
Center's coded refusals to fixed sentences.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
MESSAGE
)"
```

---

## Task 4: `publish_intent` and `deploy_intent` MCP operations, with docs and catalog

**Files:**
- Modify: `extensions/jbcenter/mcp/src/application/operation.ts` (`OperationKind`, `classification`)
- Modify: `extensions/jbcenter/mcp/src/application/operations.ts` (after `prepare_intent`, ~line 578)
- Modify: `extensions/jbcenter/mcp/src/application/capabilities.ts` (the `plans` area)
- Modify: `extensions/jbcenter/mcp/src/mcp/server.ts` (the `instructions` string)
- Modify: `extensions/jbcenter/mcp/docs/USER_JOURNEYS.md`, `extensions/jbcenter/mcp/README.md`
- Regenerate: `extensions/jbcenter/mcp/data/mcp-tool-catalog.json`, `extensions/jbcenter/mcp/docs/TOOLS.md`
- Test: `extensions/jbcenter/mcp/tests/integration/mcp.test.ts`

**Interfaces:**
- Consumes: `CenterClient.publishIntent`, `CenterClient.requestDeploy`, `CenterDeployRow` and `CENTER_DEPLOY_REFUSALS` from Task 3.
- Produces: MCP tools `jb_publish_intent` and `jb_deploy_intent`; `OperationKind` gains `'center-write'`.

- [ ] **Step 1: Write the failing tool test**

Add to `mcp/tests/integration/mcp.test.ts`, as a new `it` beside the existing tool-listing test:

```ts
  it('registers the intent write tools as non-read-only and never as transaction plans', async () => {
    const { tools } = await client.listTools();
    const publish = tools.find((tool) => tool.name === 'jb_publish_intent');
    const deploy = tools.find((tool) => tool.name === 'jb_deploy_intent');
    expect(publish?.annotations?.readOnlyHint).toBe(false);
    expect(deploy?.annotations?.readOnlyHint).toBe(false);
    expect(publish?.annotations?.idempotentHint).toBe(true);
    expect(deploy?.annotations?.idempotentHint).toBe(true);
    expect(publish?.description).toContain('already signed');
    expect(deploy?.description).toContain('sponsor');
    expect(Object.keys(publish?.inputSchema.properties ?? {}).sort()).toEqual(
      ['chainIds', 'deploymentCalls', 'deploymentVersion', 'format', 'jb', 'publisher', 'signature'].sort(),
    );
    expect(Object.keys(deploy?.inputSchema.properties ?? {})).toEqual(['id']);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd mcp && npx vitest run tests/integration/mcp.test.ts`
Expected: FAIL — neither tool is registered, so both lookups are `undefined`.

- [ ] **Step 3: Classify the two write operations**

In `mcp/src/application/operation.ts`:

```ts
export type OperationKind = 'read' | 'prepare' | 'reference' | 'metadata-write' | 'center-write';
```

and inside `classification`, immediately after the `pin_project_metadata` line:

```ts
  if (id === 'publish_intent' || id === 'deploy_intent')
    return { kind: 'center-write', sources: ['center'] };
```

- [ ] **Step 4: Define the operations**

In `mcp/src/application/operations.ts`, immediately after the `prepare_intent` definition:

```ts
    operationWithSchema(
      'publish_intent',
      'Publish a V6 JB Center project intent the user has already signed. The envelope, publisher and signature are stored unchanged; the signature is verified against this exact envelope before anything is sent. This server holds no key and signs nothing. Publication is a persistent external mutation: a published intent cannot be edited, replaced or withdrawn. It is not wallet approval and moves no funds. Republishing identical content from the same publisher returns the existing intent.',
      z
        .object({
          format: z.string().max(113),
          deploymentVersion: z.literal('6'),
          chainIds: z.array(chainIdSchema).min(1).max(8),
          deploymentCalls: z
            .array(z.object({ chainId: chainIdSchema, to: addressSchema, data: hexSchema }).strict())
            .min(1)
            .max(8),
          jb: jsonObjectSchema,
          publisher: addressSchema,
          signature: hexSchema,
        })
        .strict(),
      async ({ publisher, signature, ...envelope }) =>
        s.center.publishIntent({
          ...envelope,
          jb: envelope.jb as JBCenterJsonObject,
          publisher: publisher as Address,
          signature: signature as Hex,
        }),
      { externalMutation: true, idempotent: true },
    ),
    operationWithSchema(
      'deploy_intent',
      'Ask JB Center to execute a published intent’s own committed calls at Center’s expense on the supported rollups. Returns one row per chain with status queued, sent, confirmed or failed; repeating the request returns the same rows. Queued is not confirmation and a failed row is terminal for that intent. Refusals return a fixed code: NOT_SPONSORABLE, SPONSOR_QUOTA, SPONSOR_BUDGET or SPONSOR_UNAVAILABLE. This server signs nothing and sends no wallet transaction.',
      z.object({ id: z.string().uuid() }).strict(),
      async ({ id }) => s.center.requestDeploy(id),
      { externalMutation: true, idempotent: true },
    ),
```

Add `type Address, type Hex` to the existing `viem` type imports in that file if they are not
already imported; `JBCenterJsonObject` is already imported at the top.

- [ ] **Step 5: Put the tools in a capability family with accurate limits**

In `mcp/src/application/capabilities.ts`, in the `plans` area:

```ts
    tools: [
      'inspect_plan',
      'simulate_plan',
      'verify_plan',
      'get_intent',
      'prepare_intent',
      'publish_intent',
      'deploy_intent',
    ],
    references: ['jb-tx-safety', 'JB Center', 'jb-project-intents'],
    limits: [
      'The server holds no wallet key: it never signs and never broadcasts a transaction.',
      'publish_intent stores an envelope the user already signed; it is a persistent publication, not wallet approval, and there is no edit, replace or withdraw.',
      'deploy_intent requests Center-funded execution of the committed calls. Queued rows are not confirmations, a failed row is terminal for that intent, and one intent has exactly one deploying sender across all of its chains.',
      'Plan tokens expire for simulation; expired tokens remain inspectable for receipt verification.',
      'Nested Safe/Relayr execution cannot be claimed verified without matching inner-call evidence.',
    ],
```

Also update the `execution` sentence in `capabilityCatalog` so it stays true:

```ts
    execution:
      'V6 reads, pure models, unsigned authenticated transaction plans and receipt verification. Explicitly authorized logo and metadata publication is available through jb_pin_project_logo and jb_pin_project_metadata when a publisher is configured. Already-signed project intents can be published and their sponsored deploy requested through jb_publish_intent and jb_deploy_intent. Blockchain signing/execution remain in the external wallet.',
```

- [ ] **Step 6: Name the flow in the server instructions**

In `mcp/src/mcp/server.ts`, insert this sentence into the `instructions` string, immediately
after "Transaction prepare tools produce unsigned plans only.":

```
To create a project without a transaction, use jb_prepare_intent for the exact commitment and signing message, have the user sign that message in an externally owned account wallet, then jb_publish_intent with the same envelope plus publisher and signature, and jb_deploy_intent to request Center-funded execution on the supported rollups. This server never signs; publication is permanent and is not wallet approval; a queued deploy row is not a confirmation.
```

- [ ] **Step 7: Regenerate the catalog and the tool document**

```bash
cd mcp && npm run build && npm run catalog:generate && cd ..
git diff --stat mcp/data/mcp-tool-catalog.json mcp/docs/TOOLS.md
```
Expected: both files change and `npm --prefix mcp run catalog:check` passes afterwards. Never edit
either file by hand.

- [ ] **Step 8: Update the hand-written MCP documents**

In `mcp/docs/USER_JOURNEYS.md`:

- Line 3: `Its 56 V6-only tools across ten capability families combine into the 26 journeys below.`
  becomes `Its 58 V6-only tools across ten capability families combine into the 26 journeys below.`
- Line 56: replace `The MCP does not hold wallet keys, sign, broadcast, or publish Center intents.`
  with `The MCP does not hold wallet keys, sign, or broadcast. It can publish a Center intent the user already signed and request its sponsored deploy; neither action signs anything or spends the user's funds.`
- In `### Inspect or prepare a deployment intent`, append:

```markdown
To create a project without a transaction: `jb_prepare_intent` returns the exact commitment and
signing message for the reviewed deployment calls; the user signs that message in an externally
owned account wallet; `jb_publish_intent` stores the envelope with that publisher and signature;
`jb_deploy_intent` asks Center to execute the committed calls at its own expense on the supported
rollups, and `jb_get_intent` polls the per-chain rows. Publication is permanent: there is no edit,
replace or withdraw. A queued row is not a confirmation, a failed row is terminal for that intent,
and one intent has exactly one deploying sender across all of its chains. The complete recipe is
Center's [project intents guide](https://juicebox.center/api/docs/project-intents).
```

In `mcp/README.md`:

- The **JB Center** bullet becomes: `**JB Center:** the integrated service uses bounded callbacks into Center's store, RPC gateway and pinning service for reads, and hands the two intent write routes to Center's own application with Center's own origin, so signature verification, publish limits and sponsor policy keep one implementation. Standalone search and intent reads need approved access to Center's non-RPC API and a corresponding `JBCENTER_ORIGIN`; access failures remain explicit. Intent signing-message preparation runs locally in either mode. Search removes non-V6 listings while preserving the upstream cursor and reporting an unknown V6 total when the source count spans versions. Direct intent reads reject other deployment versions.`
- The closing paragraph of `## Transaction workflow` becomes: `The MCP has no wallet key and does not sign or broadcast. It can store a Center intent the user already signed, and request Center-funded execution of that intent's committed calls; both are Center-side publications, not wallet actions, and neither spends the user's funds. The integrated metadata tools can publish an explicitly approved new metadata document to IPFS. Client applications handle wallet execution. MCP development tools include the relevant reference implementations.`

- [ ] **Step 9: Run the tests to verify they pass**

```bash
cd mcp && npx vitest run && npm run catalog:check && npm run format:check && cd ..
```
Expected: PASS, with no catalog drift. Run `npm --prefix mcp run format` first if `format:check`
complains about the edited sources.

- [ ] **Step 10: Commit**

```bash
git add mcp/src mcp/data/mcp-tool-catalog.json mcp/docs/TOOLS.md mcp/docs/USER_JOURNEYS.md mcp/README.md mcp/tests
git commit -m "$(cat <<'MESSAGE'
Add jb_publish_intent and jb_deploy_intent

Both are Center-side publications, not wallet actions: the server still holds
no key and signs nothing. Update the capability family, the server
instructions, the journeys and the generated catalog.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
MESSAGE
)"
```

---

## Task 5: Point the juicebox-skills skill at the Center guide

This is a separate repository and a separate pull request. It touches one line.

**Files:**
- Modify: `plugins/juicebox-v6/skills/jb-project-intents/SKILL.md` in `mejango/juicebox-skills`

**Interfaces:**
- Consumes: the published URL `https://juicebox.center/api/docs/project-intents` from Task 1.
- Produces: nothing other repositories build on.

- [ ] **Step 1: Create the worktree**

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22
cd /Users/jango/Documents/jb/juicebox-skills
git fetch origin
git worktree add /Users/jango/Documents/jb/worktrees/skills-intents-pointer -b docs/intents-center-guide-pointer origin/main
cd /Users/jango/Documents/jb/worktrees/skills-intents-pointer
```

- [ ] **Step 2: Add the pointer line**

In `plugins/juicebox-v6/skills/jb-project-intents/SKILL.md`, in the opening paragraph under
`# Juicebox V6 Project Intents`, the sentence that currently reads:

```
Source: the `juicebox.center` `/v1` API and `@bananapus/nana-sdk-core/jbcenter` (2.7.0).
```

becomes:

```
Canonical reference: <https://juicebox.center/api/docs/project-intents>. Source: the
`juicebox.center` `/v1` API and `@bananapus/nana-sdk-core/jbcenter` (2.7.0).
```

Change nothing else in the file.

- [ ] **Step 3: Verify the only change is that line**

Run: `git diff --stat`
Expected: `1 file changed, 2 insertions(+), 1 deletion(-)` (the sentence wraps onto two lines).

- [ ] **Step 4: Commit and open the pull request**

```bash
git add plugins/juicebox-v6/skills/jb-project-intents/SKILL.md
git commit -m "$(cat <<'MESSAGE'
Name the Center guide as the canonical intents reference

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
MESSAGE
)"
git push -u origin docs/intents-center-guide-pointer
gh pr create --repo mejango/juicebox-skills --base main \
  --title "Name the Center guide as the canonical intents reference" \
  --body "$(cat <<'BODY'
`jb-project-intents` now points at <https://juicebox.center/api/docs/project-intents> as the
canonical description of the flow. Content is otherwise unchanged.

Generated with Claude Code.
BODY
)"
```

Do not merge this until Task 1 has shipped, so the link resolves.

---

## Task 6: Gate, pull request, and the mirror into dev

**Files:** none changed. This task proves the work and lands it.

**Interfaces:**
- Consumes: the commits from Tasks 1 through 4 on `feat/intents-docs-and-mcp`.
- Produces: `main` at the merged commit, `dev` fast-forwarded to it.

- [ ] **Step 1: Prepare the shell and a disposable database**

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22
cd /Users/jango/Documents/jb/worktrees/center-intents-docs
createdb jbcenter_gate_$(date +%s) 2>/dev/null || true
export TEST_DATABASE_URL="postgres://localhost:5432/jbcenter_gate"
psql -lqt | cut -d'|' -f1 | grep -qw jbcenter_gate || createdb jbcenter_gate
```

- [ ] **Step 2: Typecheck and run the focused suites**

```bash
npm run typecheck
npx vitest run test/app.test.ts test/mcp.test.ts test/rest-guide.test.ts test/rest-wallet-policy.test.ts test/server.test.ts
npx vitest run test/postgres.integration.test.ts
npm --prefix mcp run check
```
Expected: all green. `test/postgres.integration.test.ts` is the only suite that needs
`TEST_DATABASE_URL`; the others run without it.

- [ ] **Step 3: Run the gate**

```bash
npm run check
```
Expected: exits zero. It re-runs the MCP check, including catalog drift detection, so a forgotten
`catalog:generate` fails here.

- [ ] **Step 4: Read the guide as a rendered page**

```bash
npm run build:web
node --env-file-if-exists=.env --import tsx src/index.ts &
sleep 3
curl -s http://localhost:3000/api/docs/project-intents | head -40
curl -s http://localhost:3000/api/docs/project-intents.md | head -20
curl -s http://localhost:3000/llms.txt | grep project-intents
kill %1
```
Expected: an HTML page with the left navigation showing "Project intents" as the current page, the
Markdown source at the `.md` path, and the discovery index linking the guide twice.

- [ ] **Step 5: Verify no forbidden word slipped in**

```bash
git diff origin/main --unified=0 | grep -inP '^\+.*(?i:draft)|^\+.*[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' || echo "clean"
```
Expected: `clean`. No emoji and no occurrence of the forbidden word reach the diff.

- [ ] **Step 6: Push and open the pull request**

```bash
git push -u origin feat/intents-docs-and-mcp
gh pr create --repo mejango/jbcenter --base main \
  --title "Document project intents and expose them through the MCP" \
  --body "$(cat <<'BODY'
A bot that lands on juicebox.center can now find the whole project-intent flow and run it.

- `docs/rest/PROJECT_INTENTS.md`, served at `/api/docs/project-intents`, is the canonical recipe:
  the envelope, the guard to apply before signing, publishing, reading, the sponsored chain ids,
  quotas and refusal codes, the self-paid path, two worked examples and the common mistakes. It is
  linked from `/llms.txt`, the `/api` explorer, the docs navigation, `AI_GUIDE.md` and the README.
- `GET /v1/search` accepts `owner` and `publisher`, each matched case-insensitively against the
  stored checksummed address and combinable with `q`, with a functional index for each.
- The co-hosted MCP gains `jb_publish_intent` and `jb_deploy_intent`. Writes run through the Hono
  app itself with Center's own origin, so signature verification, publish limits and sponsor
  policy keep exactly one implementation. The adapter verifies the caller's signature locally
  before sending and maps Center's coded refusals to fixed sentences. The MCP still holds no key
  and signs nothing.

The guide documents what the code does today: publish signatures are recovered from an externally
owned account, so contract signatures are refused, and the `format` field takes exactly one slash.

`npm run check` green with `TEST_DATABASE_URL` set.

Generated with Claude Code.
BODY
)"
```

- [ ] **Step 7: Mirror main into dev after the merge**

```bash
git fetch origin
git log --oneline origin/dev..origin/main | head
git push origin origin/main:refs/heads/dev
```
If that push is refused because `dev` has diverged, open the mirror as a pull request instead:

```bash
git checkout -B chore/main-into-dev origin/dev
git merge origin/main -m "$(cat <<'MESSAGE'
Merge main into dev

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
MESSAGE
)"
git push -u origin chore/main-into-dev
gh pr create --repo mejango/jbcenter --base dev --title "Merge main into dev" \
  --body "$(cat <<'BODY'
Mirrors the intents documentation and MCP tools into the dev environment.

Generated with Claude Code.
BODY
)"
```

- [ ] **Step 8: Confirm the deployed surfaces, then merge the skills pull request**

```bash
curl -s https://dev.juicebox.center/api/docs/project-intents | grep -c "Sponsored deploy"
curl -s https://juicebox.center/llms.txt | grep project-intents
gh pr merge --repo mejango/juicebox-skills --squash docs/intents-center-guide-pointer
```
Expected: the dev page contains the sponsored-deploy section, production `/llms.txt` links the
guide once the production deploy lands, and only then does the skills pointer merge.

- [ ] **Step 9: Clean up the worktrees**

```bash
cd /Users/jango/Documents/jb/v6/evm/extensions/jbcenter && git worktree remove /Users/jango/Documents/jb/worktrees/center-intents-docs
cd /Users/jango/Documents/jb/juicebox-skills && git worktree remove /Users/jango/Documents/jb/worktrees/skills-intents-pointer
```
