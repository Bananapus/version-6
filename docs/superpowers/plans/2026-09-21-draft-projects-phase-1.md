# Draft Projects, Phase 1 (Center + SDK + skill) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make juicebox.center able to hold a project draft through its whole life (publish, supersede, withdraw, sponsored or self-paid deploy, redirect) and give every webclient one SDK surface to consume it.

**Architecture:** Center's existing intent store gains lifecycle columns, a deploy queue and a sponsor worker. The worker deploys mainnet drafts through the existing Relayr ERC-2771 wrapper signed by Center's sponsor key, and testnet drafts directly from the same key. The SDK core package gains lifecycle calls, a launch-calldata decoder, a search merger and an `ensureDeployed` pre-step. A new skill states the norm.

**Tech Stack:** Center: Hono 4, Node 22, Postgres via `pg` raw SQL, viem, vitest. SDK: TypeScript, viem, vitest with 95/95/92/82 coverage floors. Skills: Agent Skills SKILL.md format.

**Spec:** `docs/superpowers/specs/2026-09-21-draft-projects-design.md`

## Global Constraints

- Sponsored chains: mainnets `10, 8453, 42161` through Relayr; testnets `11155111, 11155420, 84532, 421614` through the direct lane. Ethereum mainnet `1` is never sponsored.
- Exactly one sender deploys every chain of a draft. Center refuses to sponsor an intent whose status is not `undeployed`.
- Policy defaults, all Center env vars: `SPONSOR_DEPLOYS_PER_REQUESTER_PER_DAY=5`, `SPONSOR_DAILY_BUDGET_WEI=50000000000000000` (0.05 ETH), `SPONSOR_MAX_GAS=8000000`, `SPONSOR_MAX_FEE_PER_GAS=1000000000` (1 gwei), `SPONSOR_PAUSED=0`. Publish limits `PUBLISH_PER_PUBLISHER_PER_DAY=20`, `PUBLISH_PER_IP_PER_HOUR=60`.
- The intent signing message stays `Juice Central project intent\nVersion: 1\nContent hash: <hash>`. Existing signatures must keep verifying: an envelope without `supersedes` canonicalizes exactly as before.
- Withdraw message: `Juice Central withdraw intent\nVersion: 1\nIntent: <id>`.
- Creation fee is read live from `JBProjects.creationFee()` at `0x6017d1fba9dc279bfa0b03fd931c22e242ab3691` on every chain and sent exactly.
- Center's Docker build runs `tsc` over `test/`, so test files must type-check. Run touched vitest suites alone against Postgres 16.
- Never `git add -A`. Stage by explicit path. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Center repo: `extensions/jbcenter` (its own git repo; branch from `main`). SDK repo: `juice-sdk-connect` (workspace root; package `packages/core`). Skills repo: `skills`.

---

## File map

Center (`extensions/jbcenter`):
- Create `src/db/migrations/036_intent_lifecycle_and_deploys.sql`: lifecycle columns + `intent_deploys` table.
- Modify `src/types.ts`: `Intent.status` union, `supersedes`, `supersededBy`, `deploys`, new `IntentDeploy`.
- Modify `src/store.ts`: `NewIntent.supersedes`, `withdrawIntent`, deploy queue methods.
- Modify `src/db/postgres.ts`: implement the above; search excludes superseded and withdrawn.
- Modify `src/intent.ts`: optional `supersedes` in `normalizeEnvelope`; `withdrawMessage(id)`.
- Modify `src/app.ts`: supersede on publish, withdraw route, publish limits, deploy route, `AppOptions.sponsor`.
- Modify `src/deploymentVerifier.ts`: top-level fast path, all eight chains.
- Create `src/sponsor/policy.ts`: chain sets, transport choice, policy parsing.
- Create `src/sponsor/direct.ts`: direct lane (sign + send from the sponsor key).
- Create `src/sponsor/relayr.ts`: Relayr lane (ERC-2771 requests signed by the sponsor key, prepayment from the sponsor key).
- Create `src/sponsor/worker.ts`: queue claim, transport dispatch, verify, record.
- Modify `src/index.ts`: env parsing and wiring; `README.md` and `.env.example`.
- Tests: `test/app.test.ts` (MemoryStore + routes), `test/deploymentVerifier.test.ts`, `test/sponsor/*.test.ts`.

SDK (`juice-sdk-connect/packages/core`):
- Modify `src/jbcenter.ts`: types, `supersedes`, `withdrawIntent`, `requestDeploy`, deploy status validators, `SPONSORED_CHAIN_IDS`, `isSponsorable`.
- Create `src/jbcenter/decode.ts`: `decodeDeploymentCall`.
- Create `src/jbcenter/merge.ts`: `mergeSearch`, `draftPath`, `deployedUrn`.
- Create `src/jbcenter/ensureDeployed.ts`: `ensureDeployed`.
- Modify `src/index.ts` and `src/publicSurface.test.ts`.

Skills (`skills/plugins/juicebox-v6`):
- Create `skills/jb-draft-projects/SKILL.md`; add a row to `README.md`.

---

### Task 1: Migration, types and store for the intent lifecycle and deploy queue

**Files:**
- Create: `extensions/jbcenter/src/db/migrations/036_intent_lifecycle_and_deploys.sql`
- Modify: `extensions/jbcenter/src/types.ts`
- Modify: `extensions/jbcenter/src/store.ts`
- Modify: `extensions/jbcenter/src/db/postgres.ts`
- Modify: `extensions/jbcenter/test/app.test.ts` (the in-file `MemoryStore`)
- Test: `extensions/jbcenter/test/postgres.integration.test.ts` (add cases; if the file does not exist, create it following the existing integration test in `extensions/center-signup-fast-2/test/postgres.integration.test.ts`)

**Interfaces:**
- Produces: `IntentDeploy`, `Intent.status` union, `Store.withdrawIntent`, `Store.queueDeploys`, `Store.listDeploys`, `Store.claimQueuedDeploys`, `Store.updateDeploy`, `Store.sponsoredWeiSince`, `NewIntent.supersedes`.

- [ ] **Step 1: Write the migration**

```sql
-- 036_intent_lifecycle_and_deploys.sql
ALTER TABLE intents ADD COLUMN supersedes uuid REFERENCES intents(id);
ALTER TABLE intents ADD COLUMN superseded_by uuid REFERENCES intents(id);
ALTER TABLE intents ADD COLUMN withdrawn_at timestamptz;
CREATE INDEX intents_supersedes_idx ON intents (supersedes);

CREATE TABLE intent_deploys (
  intent_id uuid NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  chain_id bigint NOT NULL,
  requester text NOT NULL,
  transport text NOT NULL CHECK (transport IN ('direct', 'relayr')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'confirmed', 'failed')),
  bundle_uuid text,
  transaction_hash text,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  reserved_wei numeric(78, 0) NOT NULL DEFAULT 0,
  spent_wei numeric(78, 0) NOT NULL DEFAULT 0,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (intent_id, chain_id)
);
CREATE INDEX intent_deploys_open_idx ON intent_deploys (created_at) WHERE status IN ('queued', 'sent');
CREATE INDEX intent_deploys_created_at_idx ON intent_deploys (created_at DESC);
```

- [ ] **Step 2: Extend the types**

In `src/types.ts` replace the `Intent` type and add `IntentDeploy`:

```ts
export type IntentDeployStatus = "queued" | "sent" | "confirmed" | "failed";

export type IntentDeploy = {
  chainId: number;
  transport: "direct" | "relayr";
  status: IntentDeployStatus;
  transactionHash: Hex | null;
  bundleUuid: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IntentStatus = "undeployed" | "deployed" | "superseded" | "withdrawn";

export type Intent = IntentMetadata & {
  id: string;
  status: IntentStatus;
  contentHash: Hex;
  envelope: IntentEnvelope;
  publisher: Address;
  signature: Hex;
  createdAt: string;
  supersedes: string | null;
  supersededBy: string | null;
  withdrawnAt: string | null;
  deployments: Deployment[];
  deploys: IntentDeploy[];
};
```

Add `supersedes?: string` to `IntentEnvelope` (optional; absent means none).

- [ ] **Step 3: Extend the Store interface**

In `src/store.ts`:

```ts
export type NewIntent = IntentMetadata & {
  contentHash: Hex; envelope: IntentEnvelope; publisher: Address; signature: Hex;
  submittedBy: string; jbBytes: number; supersedes: string | null;
};

export type DeployPatch = {
  status: IntentDeployStatus;
  transactionHash?: Hex;
  bundleUuid?: string;
  error?: string;
  spentWei?: bigint;
};

export interface Store {
  health(): Promise<void>;
  consumeRequest(client: string, limit: number, windowSeconds?: number): Promise<{ allowed: boolean; remaining: number }>;
  createIntent(value: NewIntent, limits: StorageLimits): Promise<{ intent: Intent; created: boolean }>;
  getIntent(id: string): Promise<Intent | null>;
  search(query: string, limit: number, offset: number): Promise<SearchPage>;
  recordDeployment(intentId: string, value: NewDeployment): Promise<Deployment>;
  withdrawIntent(id: string, publisher: Address): Promise<Intent | null>;
  queueDeploys(intentId: string, chainIds: number[], requester: string, transport: "direct" | "relayr", reservedWeiPerChain: bigint): Promise<IntentDeploy[]>;
  listDeploys(intentId: string): Promise<IntentDeploy[]>;
  claimQueuedDeploys(leaseSeconds: number, limit: number): Promise<{ intentId: string; chainIds: number[] }[]>;
  updateDeploy(intentId: string, chainId: number, patch: DeployPatch): Promise<void>;
  sponsoredWeiSince(since: Date): Promise<bigint>;
}

export class SupersedeError extends Error {}
```

Import `IntentDeploy`, `IntentDeployStatus` from `./types.js`.

- [ ] **Step 4: Write the failing Postgres integration tests**

Add to the integration suite (uses a real PG16 via `DATABASE_URL`, following the existing pattern):

```ts
test("supersede marks the old intent and search hides it", async () => {
  const first = await store.createIntent(newIntent({ name: "one" }), limits);
  const second = await store.createIntent(newIntent({ name: "two", supersedes: first.intent.id }), limits);
  const old = await store.getIntent(first.intent.id);
  expect(old?.status).toBe("superseded");
  expect(old?.supersededBy).toBe(second.intent.id);
  expect(second.intent.supersedes).toBe(first.intent.id);
  const page = await store.search("", 10, 0);
  expect(page.items.map((i) => i.intentId)).toEqual([second.intent.id]);
});

test("supersede by a different publisher is refused", async () => {
  const first = await store.createIntent(newIntent({ name: "one" }), limits);
  await expect(
    store.createIntent(newIntent({ name: "two", supersedes: first.intent.id, publisher: OTHER }), limits),
  ).rejects.toBeInstanceOf(SupersedeError);
});

test("withdraw hides the intent and returns null for a stranger", async () => {
  const { intent } = await store.createIntent(newIntent({ name: "one" }), limits);
  expect(await store.withdrawIntent(intent.id, OTHER)).toBeNull();
  const withdrawn = await store.withdrawIntent(intent.id, intent.publisher);
  expect(withdrawn?.status).toBe("withdrawn");
  expect((await store.search("", 10, 0)).items).toEqual([]);
});

test("deploy queue is idempotent, leases rows, and sums wei", async () => {
  const { intent } = await store.createIntent(newIntent({ name: "one", chainIds: [84532, 421614] }), limits);
  const rows = await store.queueDeploys(intent.id, [84532, 421614], "browser:x", "direct", 1000n);
  expect(rows.map((r) => r.status)).toEqual(["queued", "queued"]);
  expect(await store.queueDeploys(intent.id, [84532, 421614], "browser:x", "direct", 1000n)).toHaveLength(2);
  expect(await store.sponsoredWeiSince(new Date(Date.now() - 60_000))).toBe(2000n);
  const claimed = await store.claimQueuedDeploys(30, 10);
  expect(claimed).toEqual([{ intentId: intent.id, chainIds: [84532, 421614] }]);
  expect(await store.claimQueuedDeploys(30, 10)).toEqual([]);
  await store.updateDeploy(intent.id, 84532, { status: "confirmed", transactionHash: HASH, spentWei: 700n });
  expect(await store.sponsoredWeiSince(new Date(Date.now() - 60_000))).toBe(1700n);
  expect((await store.getIntent(intent.id))?.deploys[0]).toMatchObject({ chainId: 84532, status: "confirmed" });
});
```

`newIntent(overrides)` is a local helper that builds a `NewIntent` from a fixture; add it next to the existing fixtures in that file.

- [ ] **Step 5: Run to verify they fail**

Run: `cd extensions/jbcenter && npx vitest run test/postgres.integration.test.ts`
Expected: FAIL on missing methods and columns.

- [ ] **Step 6: Implement in PostgresStore**

Extend `selectIntent` with `supersedes, superseded_by, withdrawn_at`. Extend `toIntent` (the row mapper near line 49) so status is derived:

```ts
status: row.withdrawn_at ? "withdrawn" : row.superseded_by ? "superseded" : deployments.length ? "deployed" : "undeployed",
supersedes: row.supersedes ?? null,
supersededBy: row.superseded_by ?? null,
withdrawnAt: row.withdrawn_at ? new Date(row.withdrawn_at).toISOString() : null,
deploys,
```

`getIntent` adds a third parallel query:

```sql
SELECT chain_id, transport, status, bundle_uuid, transaction_hash, error, created_at, updated_at
FROM intent_deploys WHERE intent_id = $1 ORDER BY chain_id
```

`createIntent`: inside the existing transaction, after the usage check and before the INSERT, when `value.supersedes` is set:

```ts
const prior = await client.query("SELECT publisher, superseded_by, withdrawn_at FROM intents WHERE id = $1 FOR UPDATE", [value.supersedes]);
const row = prior.rows[0];
if (!row || row.publisher !== value.publisher || row.superseded_by || row.withdrawn_at) {
  throw new SupersedeError("supersedes must name your own live intent");
}
```

Add `supersedes` to the INSERT column list (`$18`), then after the INSERT:

```ts
if (value.supersedes) await client.query("UPDATE intents SET superseded_by = $1 WHERE id = $2", [id, value.supersedes]);
```

`search`: replace the WHERE with

```sql
WHERE NOT EXISTS (SELECT 1 FROM deployments WHERE deployments.intent_id = intents.id)
  AND superseded_by IS NULL AND withdrawn_at IS NULL
```

in both the page and the count query.

New methods:

```ts
async withdrawIntent(id: string, publisher: Address): Promise<Intent | null> {
  const result = await this.pool.query(
    "UPDATE intents SET withdrawn_at = now() WHERE id = $1 AND publisher = $2 AND withdrawn_at IS NULL RETURNING id",
    [id, publisher],
  );
  return result.rowCount ? this.getIntent(id) : null;
}

async queueDeploys(intentId, chainIds, requester, transport, reservedWeiPerChain) {
  await this.pool.query(
    `INSERT INTO intent_deploys (intent_id, chain_id, requester, transport, reserved_wei)
     SELECT $1, unnest($2::bigint[]), $3, $4, $5::numeric
     ON CONFLICT (intent_id, chain_id) DO NOTHING`,
    [intentId, chainIds, requester, transport, reservedWeiPerChain.toString()],
  );
  return this.listDeploys(intentId);
}

async listDeploys(intentId) { /* the SELECT above, mapped with toDeploy */ }

async claimQueuedDeploys(leaseSeconds, limit) {
  const result = await this.pool.query(
    `WITH picked AS (
       SELECT DISTINCT intent_id FROM intent_deploys
       WHERE status = 'queued' AND (lease_until IS NULL OR lease_until < now()) AND attempts < 3
       ORDER BY intent_id LIMIT $2 FOR UPDATE SKIP LOCKED
     ), leased AS (
       UPDATE intent_deploys d SET lease_until = now() + make_interval(secs => $1), attempts = attempts + 1, updated_at = now()
       FROM picked WHERE d.intent_id = picked.intent_id AND d.status = 'queued'
       RETURNING d.intent_id, d.chain_id
     )
     SELECT intent_id, array_agg(chain_id ORDER BY chain_id) AS chain_ids FROM leased GROUP BY intent_id`,
    [leaseSeconds, limit],
  );
  return result.rows.map((r) => ({ intentId: r.intent_id, chainIds: r.chain_ids.map(Number) }));
}

async updateDeploy(intentId, chainId, patch) {
  await this.pool.query(
    `UPDATE intent_deploys SET status = $3,
       transaction_hash = coalesce($4, transaction_hash), bundle_uuid = coalesce($5, bundle_uuid),
       error = $6, spent_wei = coalesce($7::numeric, spent_wei),
       reserved_wei = CASE WHEN $3 IN ('confirmed', 'failed') THEN 0 ELSE reserved_wei END,
       updated_at = now()
     WHERE intent_id = $1 AND chain_id = $2`,
    [intentId, chainId, patch.status, patch.transactionHash ?? null, patch.bundleUuid ?? null,
     patch.error ?? null, patch.spentWei?.toString() ?? null],
  );
}

async sponsoredWeiSince(since) {
  const r = await this.pool.query(
    "SELECT coalesce(sum(reserved_wei + spent_wei), 0)::text AS wei FROM intent_deploys WHERE created_at >= $1", [since]);
  return BigInt(r.rows[0].wei);
}
```

Note: `DISTINCT ... FOR UPDATE` is not allowed in Postgres. Write `picked` as `SELECT intent_id FROM intent_deploys WHERE ... GROUP BY intent_id ORDER BY intent_id LIMIT $2` and lock in the UPDATE instead; the advisory lock in the worker (Task 6) serializes claims across processes.

- [ ] **Step 7: Update the test MemoryStore**

In `test/app.test.ts` extend `MemoryStore` with in-memory versions of the six new methods and status derivation identical to the SQL rules, so route tests in later tasks work without Postgres. Keep `deploys: IntentDeploy[]` on each stored intent.

- [ ] **Step 8: Run tests**

Run: `npx vitest run test/postgres.integration.test.ts test/app.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/db/migrations/036_intent_lifecycle_and_deploys.sql src/types.ts src/store.ts src/db/postgres.ts test/app.test.ts test/postgres.integration.test.ts
git commit -m "Add intent lifecycle columns and the deploy queue

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Supersede on publish, withdraw route, richer status

**Files:**
- Modify: `extensions/jbcenter/src/intent.ts`
- Modify: `extensions/jbcenter/src/app.ts`
- Test: `extensions/jbcenter/test/app.test.ts`, `extensions/jbcenter/test/intent.test.ts`

**Interfaces:**
- Consumes: Task 1 store methods.
- Produces: `withdrawMessage(id: string): string`; `POST /v1/intents/:id/withdraw { signature }`; `supersedes` accepted in the publish envelope.

- [ ] **Step 1: Failing tests for canonicalization and messages**

In `test/intent.test.ts`:

```ts
test("an envelope without supersedes hashes as before", () => {
  const before = contentHash(normalizeEnvelope(envelope));
  const after = contentHash(normalizeEnvelope({ ...envelope, supersedes: undefined }));
  expect(after).toBe(before);
});

test("supersedes must be a uuid and changes the hash", () => {
  expect(() => normalizeEnvelope({ ...envelope, supersedes: "nope" })).toThrow("supersedes must be an intent id");
  const id = "2b6a1a5e-0d2b-4c3e-9a7f-1c2d3e4f5a6b";
  expect(normalizeEnvelope({ ...envelope, supersedes: id }).supersedes).toBe(id);
  expect(contentHash(normalizeEnvelope({ ...envelope, supersedes: id }))).not.toBe(contentHash(normalizeEnvelope(envelope)));
});

test("withdraw message", () => {
  expect(withdrawMessage("2b6a1a5e-0d2b-4c3e-9a7f-1c2d3e4f5a6b"))
    .toBe("Juice Central withdraw intent\nVersion: 1\nIntent: 2b6a1a5e-0d2b-4c3e-9a7f-1c2d3e4f5a6b");
});
```

In `test/app.test.ts`:

```ts
test("publishing with supersedes retires the old intent", async () => {
  const app = createApp(new MemoryStore());
  const first = (await (await publish(app)).json()) as Intent;
  const second = await publishWith(app, { ...envelope, jb: { ...envelope.jb, name: "v2" }, supersedes: first.id });
  expect(second.status).toBe(201);
  const old = await (await app.request(`/v1/intents/${first.id}`, { headers: trusted })).json() as Intent;
  expect(old.status).toBe("superseded");
  expect(old.supersededBy).toBe(((await second.json()) as Intent).id);
});

test("withdraw needs the publisher's signature", async () => {
  const app = createApp(new MemoryStore());
  const intent = (await (await publish(app)).json()) as Intent;
  const bad = await app.request(`/v1/intents/${intent.id}/withdraw`, { method: "POST", headers: trusted,
    body: JSON.stringify({ signature: await other.signMessage({ message: withdrawMessage(intent.id) }) }) });
  expect(bad.status).toBe(403);
  const ok = await app.request(`/v1/intents/${intent.id}/withdraw`, { method: "POST", headers: trusted,
    body: JSON.stringify({ signature: await account.signMessage({ message: withdrawMessage(intent.id) }) }) });
  expect(ok.status).toBe(200);
  expect(((await ok.json()) as Intent).status).toBe("withdrawn");
});
```

`publishWith(app, envelopeLike)` is `publish` generalized over the envelope; refactor `publish` to call it. `other` is a second `privateKeyToAccount`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/intent.test.ts test/app.test.ts`
Expected: FAIL (`withdrawMessage` undefined, 404 on withdraw).

- [ ] **Step 3: Implement in intent.ts**

In `normalizeEnvelope`, after the existing fields:

```ts
const supersedes = raw.supersedes;
if (supersedes !== undefined) {
  if (typeof supersedes !== "string" || !UUID.test(supersedes)) throw new IntentError("supersedes must be an intent id");
}
return { format, deploymentVersion, chainIds, deploymentCalls, jb, ...(supersedes ? { supersedes } : {}) };
```

Use the same `UUID` regex as `app.ts` (move it to `intent.ts` and import it in `app.ts`). Because `canonicalJson` serializes only present keys, an envelope without `supersedes` hashes exactly as before.

```ts
export function withdrawMessage(id: string): string {
  return `Juice Central withdraw intent\nVersion: 1\nIntent: ${id}`;
}
```

- [ ] **Step 4: Implement in app.ts**

In `POST /v1/intents`, pass `supersedes: envelope.supersedes ?? null` into `store.createIntent` and map `SupersedeError` to 403 `{ code: "forbidden_supersede" }` in `app.onError`.

New route after `GET /v1/intents/:id`:

```ts
app.post("/v1/intents/:id/withdraw", async (c) => {
  const id = c.req.param("id");
  if (!UUID.test(id)) throw new BadRequest("intent id is invalid");
  const intent = await store.getIntent(id);
  if (!intent) return c.json({ error: { code: "not_found", message: "Intent not found" } }, 404);
  const body = await json(c);
  const signed = signature(body.signature);
  const valid = await verifyMessage({ address: intent.publisher, message: withdrawMessage(id), signature: signed });
  if (!valid) return c.json({ error: { code: "forbidden", message: "signature does not match the publisher" } }, 403);
  const withdrawn = await store.withdrawIntent(id, intent.publisher);
  return c.json(withdrawn ?? intent);
});
```

- [ ] **Step 5: Run tests, type-check, commit**

Run: `npx vitest run test/intent.test.ts test/app.test.ts && npx tsc --noEmit`
Expected: PASS.

```bash
git add src/intent.ts src/app.ts test/intent.test.ts test/app.test.ts
git commit -m "Let a publisher supersede or withdraw an intent

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Publish rate limits

**Files:**
- Modify: `extensions/jbcenter/src/app.ts`
- Test: `extensions/jbcenter/test/app.test.ts`

**Interfaces:**
- Produces: `AppOptions.publishPerPublisherPerDay` (default 20), `AppOptions.publishPerIpPerHour` (default 60).

- [ ] **Step 1: Failing test**

```ts
test("publishing is capped per publisher per day and per ip per hour", async () => {
  const store = new MemoryStore();
  const app = createApp(store, { publishPerPublisherPerDay: 1, publishPerIpPerHour: 5 });
  expect((await publish(app)).status).toBe(201);
  const again = await publishWith(app, { ...envelope, jb: { ...envelope.jb, name: "second" } });
  expect(again.status).toBe(429);
  expect(((await again.json()) as { error: { code: string } }).error.code).toBe("publish_limit");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/app.test.ts -t "capped per publisher"`
Expected: FAIL (second publish returns 201).

- [ ] **Step 3: Implement**

In `POST /v1/intents`, after signature verification and before `store.createIntent`:

```ts
const ip = await store.consumeRequest(`publish:ip:${callerIp(c)}`, options.publishPerIpPerHour ?? 60, 3600);
const who = await store.consumeRequest(`publish:${publisher.toLowerCase()}`, options.publishPerPublisherPerDay ?? 20, 86_400);
if (!ip.allowed || !who.allowed) {
  c.header("Retry-After", "3600");
  return c.json({ error: { code: "publish_limit", message: "Publish limit reached; try again later" } }, 429);
}
```

`callerIp` already exists in `app.ts` (used by the origin middleware). Add the two options to `AppOptions`.

- [ ] **Step 4: Run, commit**

Run: `npx vitest run test/app.test.ts && npx tsc --noEmit`

```bash
git add src/app.ts test/app.test.ts
git commit -m "Cap intent publishing per publisher and per ip

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Deployment verifier fast path and all eight chains

**Files:**
- Modify: `extensions/jbcenter/src/deploymentVerifier.ts`
- Test: `extensions/jbcenter/test/deploymentVerifier.test.ts`

**Interfaces:**
- Consumes: `ReceiptReader`, `DeploymentClaim`.
- Produces: `ReceiptReader.getTransaction({ hash })` returning `{ to: Address | null; input: Hex }`; `canonicalDeploymentChains` covers `[1, 10, 8453, 42161, 11155111, 11155420, 84532, 421614]`.

- [ ] **Step 1: Failing tests**

```ts
test("a top-level transaction matching the call verifies without a trace", async () => {
  const reader = fakeReader({ receipt: successReceipt(createLog(7n)), transaction: { to: call.to, input: call.data } });
  reader.traceTransaction = vi.fn(async () => { throw new Error("trace must not run"); });
  const verifier = new RpcDeploymentVerifier(chains, new Map([[84532, reader]]));
  await expect(verifier.verify({ ...claim, chainId: 84532, call: { ...call, chainId: 84532 } })).resolves.toBeUndefined();
});

test("a relayed transaction falls back to the trace", async () => {
  const reader = fakeReader({ receipt: successReceipt(createLog(7n)), transaction: { to: FORWARDER, input: "0xdeadbeef" },
    trace: callFrame(call.to, call.data) });
  const verifier = new RpcDeploymentVerifier(chains, new Map([[8453, reader]]));
  await expect(verifier.verify({ ...claim, chainId: 8453, call: { ...call, chainId: 8453 } })).resolves.toBeUndefined();
  expect(reader.traceTransaction).toHaveBeenCalled();
});

test("testnets are configured", () => {
  const configured = canonicalDeploymentChains(upstreams);
  expect([...configured.keys()].sort()).toEqual([1, 10, 8453, 42161, 84532, 421614, 11155111, 11155420].sort());
});
```

Build `fakeReader`, `successReceipt`, `createLog`, `callFrame` from the fixtures already in that test file (it has receipt and trace fakes today; extend them with `getTransaction`).

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/deploymentVerifier.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
const DEPLOYMENT_CHAIN_IDS = [1, 10, 8453, 42161, 11155111, 11155420, 84532, 421614];
```

Add `getTransaction` to `ReceiptReader` and to the viem-backed reader (`client.getTransaction({ hash })` mapped to `{ to, input }`). In `verify`, after the `Create` log check:

```ts
const transaction = await reader.getTransaction({ hash: claim.transactionHash });
const direct = transaction.to?.toLowerCase() === claim.call.to.toLowerCase()
  && transaction.input.toLowerCase() === claim.call.data.toLowerCase();
if (!direct) {
  const trace = await reader.traceTransaction(claim.transactionHash);
  if (!containsCommittedCall(trace, claim.call)) throw new DeploymentVerificationError("The transaction did not execute the committed deployment call");
}
```

- [ ] **Step 4: Run, commit**

Run: `npx vitest run test/deploymentVerifier.test.ts && npx tsc --noEmit`

```bash
git add src/deploymentVerifier.ts test/deploymentVerifier.test.ts
git commit -m "Verify direct deployments from the transaction and cover testnets

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Sponsor policy and the deploy request route

**Files:**
- Create: `extensions/jbcenter/src/sponsor/policy.ts`
- Modify: `extensions/jbcenter/src/app.ts`
- Test: `extensions/jbcenter/test/sponsor/policy.test.ts`, `extensions/jbcenter/test/app.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const SPONSORED_MAINNETS = [10, 8453, 42161] as const;
  export const SPONSORED_TESTNETS = [11155111, 11155420, 84532, 421614] as const;
  export type SponsorPolicy = { paused: boolean; perRequesterPerDay: number; dailyBudgetWei: bigint; maximumGas: bigint; maximumFeePerGas: bigint; confirmations: number };
  export function sponsorTransport(chainIds: number[]): "relayr" | "direct" | null;
  export function reservationWei(policy: SponsorPolicy, chainCount: number): bigint; // chainCount * (maximumGas * maximumFeePerGas + 100_000_000_000_000n)
  export function readSponsorPolicy(env: NodeJS.ProcessEnv): SponsorPolicy;
  export type SponsorRuntime = { policy: SponsorPolicy; kick(): void };
  ```
  `AppOptions.sponsor?: SponsorRuntime`; `POST /v1/intents/:id/deploy` → 202 `{ deploys: IntentDeploy[] }`.

- [ ] **Step 1: Failing policy tests**

```ts
test("transport by chain set", () => {
  expect(sponsorTransport([8453, 10])).toBe("relayr");
  expect(sponsorTransport([84532])).toBe("direct");
  expect(sponsorTransport([1, 8453])).toBeNull();
  expect(sponsorTransport([8453, 84532])).toBeNull();
});

test("policy from env with defaults", () => {
  const policy = readSponsorPolicy({});
  expect(policy).toEqual({ paused: false, perRequesterPerDay: 5, dailyBudgetWei: 50_000_000_000_000_000n,
    maximumGas: 8_000_000n, maximumFeePerGas: 1_000_000_000n, confirmations: 2 });
  expect(readSponsorPolicy({ SPONSOR_PAUSED: "1" }).paused).toBe(true);
  expect(reservationWei(policy, 2)).toBe(2n * (8_000_000n * 1_000_000_000n + 100_000_000_000_000n));
});
```

- [ ] **Step 2: Failing route tests**

```ts
const sponsor = { policy: readSponsorPolicy({}), kick: vi.fn() };

test("deploy request queues every chain once and is idempotent", async () => {
  const store = new MemoryStore();
  const app = createApp(store, { sponsor });
  const intent = (await (await publishWith(app, testnetEnvelope)).json()) as Intent;
  const first = await app.request(`/v1/intents/${intent.id}/deploy`, { method: "POST", headers: trusted });
  expect(first.status).toBe(202);
  expect(((await first.json()) as { deploys: IntentDeploy[] }).deploys.map((d) => d.chainId)).toEqual([84532, 421614]);
  expect(sponsor.kick).toHaveBeenCalledTimes(1);
  const second = await app.request(`/v1/intents/${intent.id}/deploy`, { method: "POST", headers: trusted });
  expect(second.status).toBe(200);
});

test("deploy request refuses unsponsorable chains, spent budgets and paused policy", async () => {
  const store = new MemoryStore();
  const app = createApp(store, { sponsor });
  const mainnet = (await (await publishWith(app, envelope /* chainIds [1] */)).json()) as Intent;
  expect((await app.request(`/v1/intents/${mainnet.id}/deploy`, { method: "POST", headers: trusted })).status).toBe(400);
  const tight = createApp(store, { sponsor: { ...sponsor, policy: { ...sponsor.policy, dailyBudgetWei: 1n } } });
  const testnet = (await (await publishWith(tight, testnetEnvelope)).json()) as Intent;
  const budget = await tight.request(`/v1/intents/${testnet.id}/deploy`, { method: "POST", headers: trusted });
  expect(budget.status).toBe(429);
  expect(((await budget.json()) as { error: { code: string } }).error.code).toBe("sponsor_budget");
  const paused = createApp(store, { sponsor: { ...sponsor, policy: { ...sponsor.policy, paused: true } } });
  expect((await paused.request(`/v1/intents/${testnet.id}/deploy`, { method: "POST", headers: trusted })).status).toBe(503);
});
```

`testnetEnvelope` = `envelope` with `chainIds: [84532, 421614]` and two deployment calls.

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run test/sponsor/policy.test.ts test/app.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement policy.ts**

```ts
export const SPONSORED_MAINNETS = [10, 8453, 42161] as const;
export const SPONSORED_TESTNETS = [11155111, 11155420, 84532, 421614] as const;
const CREATION_FEE_CEILING = 100_000_000_000_000n; // 0.0001 ETH today; MAX_CREATION_FEE on chain is 0.001 ETH

export function sponsorTransport(chainIds: number[]): "relayr" | "direct" | null {
  if (chainIds.length && chainIds.every((id) => (SPONSORED_MAINNETS as readonly number[]).includes(id))) return "relayr";
  if (chainIds.length && chainIds.every((id) => (SPONSORED_TESTNETS as readonly number[]).includes(id))) return "direct";
  return null;
}

export function reservationWei(policy: SponsorPolicy, chainCount: number): bigint {
  return BigInt(chainCount) * (policy.maximumGas * policy.maximumFeePerGas + CREATION_FEE_CEILING);
}

export function readSponsorPolicy(env: NodeJS.ProcessEnv): SponsorPolicy {
  const int = (name: string, fallback: string) => {
    const value = env[name] ?? fallback;
    if (!/^[0-9]{1,30}$/.test(value)) throw new Error(`${name} must be a non-negative integer`);
    return value;
  };
  return {
    paused: env.SPONSOR_PAUSED === "1",
    perRequesterPerDay: Number(int("SPONSOR_DEPLOYS_PER_REQUESTER_PER_DAY", "5")),
    dailyBudgetWei: BigInt(int("SPONSOR_DAILY_BUDGET_WEI", "50000000000000000")),
    maximumGas: BigInt(int("SPONSOR_MAX_GAS", "8000000")),
    maximumFeePerGas: BigInt(int("SPONSOR_MAX_FEE_PER_GAS", "1000000000")),
    confirmations: Number(int("SPONSOR_CONFIRMATIONS", "2")),
  };
}
```

- [ ] **Step 5: Implement the route**

```ts
app.post("/v1/intents/:id/deploy", async (c) => {
  const sponsor = options.sponsor;
  if (!sponsor || sponsor.policy.paused) return c.json({ error: { code: "unavailable", message: "Sponsored deploys are paused" } }, 503);
  const id = c.req.param("id");
  if (!UUID.test(id)) throw new BadRequest("intent id is invalid");
  const intent = await store.getIntent(id);
  if (!intent) return c.json({ error: { code: "not_found", message: "Intent not found" } }, 404);
  if (intent.deploys.length) return c.json({ deploys: intent.deploys }, 200);
  if (intent.status !== "undeployed") throw new BadRequest(`intent is ${intent.status}`);
  const transport = sponsorTransport(intent.envelope.chainIds);
  if (!transport) throw new BadRequest("intent chains are not sponsorable");
  const requester = c.get("client");
  const quota = await store.consumeRequest(`deploy:${requester}`, sponsor.policy.perRequesterPerDay, 86_400);
  if (!quota.allowed) return c.json({ error: { code: "sponsor_quota", message: "Daily sponsored deploy quota reached" } }, 429);
  const reserved = reservationWei(sponsor.policy, intent.envelope.chainIds.length);
  const spent = await store.sponsoredWeiSince(new Date(Date.now() - 86_400_000));
  if (spent + reserved > sponsor.policy.dailyBudgetWei) return c.json({ error: { code: "sponsor_budget", message: "The daily sponsorship budget is spent" } }, 429);
  const deploys = await store.queueDeploys(id, intent.envelope.chainIds, requester, transport, reserved / BigInt(intent.envelope.chainIds.length));
  sponsor.kick();
  return c.json({ deploys }, 202);
});
```

- [ ] **Step 6: Run, commit**

Run: `npx vitest run test/sponsor/policy.test.ts test/app.test.ts && npx tsc --noEmit`

```bash
git add src/sponsor/policy.ts src/app.ts test/sponsor/policy.test.ts test/app.test.ts
git commit -m "Queue sponsored deploys behind a policy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Direct lane and the sponsor worker

**Files:**
- Create: `extensions/jbcenter/src/sponsor/direct.ts`
- Create: `extensions/jbcenter/src/sponsor/worker.ts`
- Test: `extensions/jbcenter/test/sponsor/direct.test.ts`, `extensions/jbcenter/test/sponsor/worker.test.ts`

**Interfaces:**
- Consumes: Task 1 store methods, Task 4 verifier, Task 5 policy.
- Produces:
  ```ts
  export type SponsorSigner = { address: Address; signTransaction(tx: TransactionSerializableEIP1559): Promise<Hex>; signTypedData(args: any): Promise<Hex> }; // a viem PrivateKeyAccount satisfies this
  export type DeployLane = { deploy(intent: Intent, chainIds: number[], report: LaneReport): Promise<void> };
  export type LaneReport = { sent(chainId: number, transactionHash: Hex, bundleUuid?: string): Promise<void>; confirmed(chainId: number, transactionHash: Hex, projectId: string, spentWei: bigint): Promise<void>; failed(chainId: number, error: string): Promise<void> };
  export function createDirectLane(options: { rpcUrls: Map<number, string>; signer: SponsorSigner; policy: SponsorPolicy; projectsAddress: Address }): DeployLane;
  export function createSponsorWorker(options: { store: Store; verifier: DeploymentVerifier; lanes: { direct: DeployLane; relayr?: DeployLane }; policy: SponsorPolicy; leaseSeconds?: number }): SponsorRuntime & { stop(): void; runOnce(): Promise<void> };
  ```

- [ ] **Step 1: Failing direct-lane test**

Use a scripted JSON-RPC fake (`fakeRpc(handlers)` returning a `fetch`-compatible function; pass it to viem's `http(url, { fetchOptions })` via a `fetch` override on `globalThis` inside the test with `vi.stubGlobal`).

```ts
test("direct lane reads the fee, caps fees, signs, sends and reports per chain", async () => {
  const rpc = fakeRpc({
    eth_chainId: () => "0x14a34",
    eth_call: () => "0x00000000000000000000000000000000000000000000000000005af3107a4000", // creationFee
    eth_getTransactionCount: () => "0x5",
    eth_estimateGas: () => "0x2dc6c0",
    eth_maxPriorityFeePerGas: () => "0x3b9aca00", // 1 gwei, above the cap
    eth_getBlockByNumber: () => ({ baseFeePerGas: "0x77359400", number: "0x10" }),
    eth_sendRawTransaction: (raw) => { sent.push(raw); return HASH; },
    eth_getTransactionReceipt: () => ({ status: "0x1", blockNumber: "0x10", gasUsed: "0x186a0", effectiveGasPrice: "0x3b9aca00",
      logs: [createLog(84532, 9n)], transactionHash: HASH }),
    eth_blockNumber: () => "0x12",
  });
  const lane = createDirectLane({ rpcUrls: new Map([[84532, "http://rpc"]]), signer, policy, projectsAddress: PROJECTS });
  await lane.deploy(intent(84532), [84532], report);
  expect(report.sent).toHaveBeenCalledWith(84532, HASH, undefined);
  expect(report.confirmed).toHaveBeenCalledWith(84532, HASH, "9", 100_000n * 1_000_000_000n + 100_000_000_000_000n);
  const tx = parseTransaction(sent[0]);
  expect(tx.maxFeePerGas).toBe(1_000_000_000n);
  expect(tx.value).toBe(100_000_000_000_000n);
  expect(tx.to).toBe(intent(84532).envelope.deploymentCalls[0].to);
});

test("direct lane reports failure when gas exceeds the cap", async () => {
  const rpc = fakeRpc({ ...base, eth_estimateGas: () => "0x989680" }); // 10M > 8M cap
  await lane.deploy(intent(84532), [84532], report);
  expect(report.failed).toHaveBeenCalledWith(84532, expect.stringContaining("gas"));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/sponsor/direct.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement direct.ts**

```ts
import { createPublicClient, http, parseAbi, type Address, type Hex } from "viem";

const PROJECTS_ABI = parseAbi(["function creationFee() view returns (uint256)"]);
const CREATE_TOPIC = "0x..."; // keccak256("Create(uint256,address,address)") — copy the constant from deploymentVerifier.ts

export function createDirectLane({ rpcUrls, signer, policy, projectsAddress }): DeployLane {
  return {
    async deploy(intent, chainIds, report) {
      for (const chainId of chainIds) {
        const call = intent.envelope.deploymentCalls.find((c) => c.chainId === chainId);
        const url = rpcUrls.get(chainId);
        if (!call || !url) { await report.failed(chainId, "chain is not configured"); continue; }
        const client = createPublicClient({ transport: http(url) });
        try {
          const value = await client.readContract({ address: projectsAddress, abi: PROJECTS_ABI, functionName: "creationFee" });
          const gasEstimate = await client.estimateGas({ account: signer.address, to: call.to, data: call.data, value });
          const gas = (gasEstimate * 12n) / 10n;
          if (gas > policy.maximumGas) throw new Error(`gas ${gas} exceeds the sponsor cap ${policy.maximumGas}`);
          const fees = await client.estimateFeesPerGas();
          const maxFeePerGas = fees.maxFeePerGas > policy.maximumFeePerGas ? policy.maximumFeePerGas : fees.maxFeePerGas;
          const maxPriorityFeePerGas = fees.maxPriorityFeePerGas > maxFeePerGas ? maxFeePerGas : fees.maxPriorityFeePerGas;
          const nonce = await client.getTransactionCount({ address: signer.address, blockTag: "pending" });
          const raw = await signer.signTransaction({ type: "eip1559", chainId, to: call.to, data: call.data, value, gas, maxFeePerGas, maxPriorityFeePerGas, nonce });
          const hash = await client.sendRawTransaction({ serializedTransaction: raw });
          await report.sent(chainId, hash);
          const receipt = await client.waitForTransactionReceipt({ hash, confirmations: policy.confirmations, timeout: 180_000 });
          if (receipt.status !== "success") throw new Error("deployment reverted");
          const created = receipt.logs.find((l) => l.address.toLowerCase() === projectsAddress.toLowerCase() && l.topics[0] === CREATE_TOPIC);
          if (!created?.topics[1]) throw new Error("no Create log");
          const projectId = BigInt(created.topics[1]).toString();
          await report.confirmed(chainId, hash, projectId, receipt.gasUsed * receipt.effectiveGasPrice + value);
        } catch (error) {
          await report.failed(chainId, error instanceof Error ? error.message : String(error));
        }
      }
    },
  };
}
```

If a chain fails, later chains of the same intent are skipped: after a `failed` report `return` instead of `continue`, so a draft never ends with a mixed sender across chains. The worker marks the remaining rows failed.

- [ ] **Step 4: Failing worker test**

```ts
test("worker claims a queued intent, runs its lane, verifies and records", async () => {
  const store = new MemoryStore();
  const { intent } = await store.createIntent(newIntent({ chainIds: [84532] }), limits);
  await store.queueDeploys(intent.id, [84532], "browser:x", "direct", 10n);
  const direct: DeployLane = { deploy: vi.fn(async (_i, _c, report) => { await report.sent(84532, HASH); await report.confirmed(84532, HASH, "9", 5n); }) };
  const verifier = { verify: vi.fn(async () => {}) };
  const worker = createSponsorWorker({ store, verifier, lanes: { direct }, policy });
  await worker.runOnce();
  expect(verifier.verify).toHaveBeenCalledWith(expect.objectContaining({ chainId: 84532, projectId: "9", transactionHash: HASH }));
  const after = await store.getIntent(intent.id);
  expect(after?.status).toBe("deployed");
  expect(after?.deploys[0]).toMatchObject({ status: "confirmed", transactionHash: HASH });
});

test("worker marks remaining chains failed when the lane stops early", async () => {
  /* queue [84532, 421614]; lane reports failed(84532, "boom") only; expect both rows failed, second error "not attempted: 84532 failed" */
});

test("worker refuses a relayr intent when no relayr lane is configured", async () => {
  /* queue transport "relayr"; expect rows failed with "relayr lane is not configured" */
});
```

- [ ] **Step 5: Implement worker.ts**

```ts
export function createSponsorWorker({ store, verifier, lanes, policy, leaseSeconds = 300 }) {
  let running = false; let stopped = false; let pending = false;

  async function runOnce() {
    const claims = await store.claimQueuedDeploys(leaseSeconds, 5);
    for (const { intentId, chainIds } of claims) {
      const intent = await store.getIntent(intentId);
      if (!intent) continue;
      const transport = intent.deploys[0]?.transport ?? "direct";
      const lane = lanes[transport];
      const done = new Set<number>();
      const report: LaneReport = {
        sent: (chainId, transactionHash, bundleUuid) => store.updateDeploy(intentId, chainId, { status: "sent", transactionHash, ...(bundleUuid ? { bundleUuid } : {}) }),
        confirmed: async (chainId, transactionHash, projectId, spentWei) => {
          const call = intent.envelope.deploymentCalls.find((c) => c.chainId === chainId)!;
          await verifier.verify({ chainId, projectId, transactionHash, deploymentVersion: intent.envelope.deploymentVersion, call });
          await store.recordDeployment(intentId, { chainId, projectId, transactionHash });
          await store.updateDeploy(intentId, chainId, { status: "confirmed", transactionHash, spentWei });
          done.add(chainId);
        },
        failed: async (chainId, error) => { await store.updateDeploy(intentId, chainId, { status: "failed", error }); done.add(chainId); },
      };
      if (!lane) { for (const c of chainIds) await report.failed(c, `${transport} lane is not configured`); continue; }
      try { await lane.deploy(intent, chainIds, report); }
      catch (error) { const first = chainIds.find((c) => !done.has(c)); if (first !== undefined) await report.failed(first, error instanceof Error ? error.message : String(error)); }
      for (const c of chainIds) if (!done.has(c)) await store.updateDeploy(intentId, c, { status: "failed", error: `not attempted: an earlier chain failed` });
    }
  }

  async function loop() {
    if (running || stopped) { pending = running; return; }
    running = true;
    try { do { pending = false; await runOnce(); } while (pending); }
    finally { running = false; }
  }

  const timer = setInterval(() => { void loop(); }, 30_000);
  timer.unref();
  return { policy, kick: () => { void loop(); }, stop: () => { stopped = true; clearInterval(timer); }, runOnce };
}
```

`recordDeployment` throws `ConflictError` if another sender got there first; let it propagate into the catch so the row fails with that message.

- [ ] **Step 6: Run, commit**

Run: `npx vitest run test/sponsor && npx tsc --noEmit`

```bash
git add src/sponsor/direct.ts src/sponsor/worker.ts test/sponsor/direct.test.ts test/sponsor/worker.test.ts
git commit -m "Deploy sponsored drafts directly on testnets

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Relayr lane for mainnet drafts

**Files:**
- Create: `extensions/jbcenter/src/sponsor/relayr.ts`
- Modify: `extensions/jbcenter/src/rest/sponsorship/provider.ts` (export `parseQuote` and `parseStatus` if they are not already exported)
- Test: `extensions/jbcenter/test/sponsor/relayr.test.ts`

**Interfaces:**
- Consumes: `SponsorshipChain` (`src/rest/sponsorship/chain.ts`: `prepare(catalog, call, account, stepIndex, deadline)`, `signed(request, signature, preceding)`), `RelayrProvider` (`create`, `status`), `FORWARD_REQUEST_TYPES`, `verifyRelayrPaymentEvent` (`paymentContract.ts`), `RELAYR_PAYMENT_ADDRESS`, the `ContractCatalog` instance built in `src/index.ts` for the REST runtime, `RestRpc`.
- Produces: `createRelayrLane(options: { chain: SponsorshipChain; catalog: ContractCatalog; provider: RelayrProvider; rpcUrls: Map<number, string>; signer: SponsorSigner; policy: SponsorPolicy; projectsAddress: Address; now?: () => number }): DeployLane`.

- [ ] **Step 1: Failing test**

Fake `chain` (`prepare` returns a `PreparedForwardRequest` fixture per chain with `message.from = signer.address`; `signed` asserts the signature recovers to `signer.address` using `recoverTypedDataAddress` and returns a `RelayrEntry`), fake `provider` (`create` returns a quote body with one `payment_info` on 8453 for `RELAYR_PAYMENT_ADDRESS`, calldata beginning `0x103903a7`; `status` returns hashes after two polls), fake RPC on 8453 for the prepayment tx and receipts.

```ts
test("relayr lane signs forward requests with the sponsor key, prepays, polls and reports", async () => {
  const lane = createRelayrLane({ chain, catalog, provider, rpcUrls, signer, policy, projectsAddress: PROJECTS, now: () => 1_700_000_000_000 });
  await lane.deploy(intent(8453, 10), [8453, 10], report);
  expect(chain.prepare).toHaveBeenCalledTimes(2);
  expect(chain.signed).toHaveBeenCalledTimes(2);
  expect(sentPrepayments).toHaveLength(1);
  expect(report.sent).toHaveBeenCalledWith(8453, HASH_8453, BUNDLE);
  expect(report.confirmed).toHaveBeenCalledWith(8453, HASH_8453, "12", expect.any(BigInt));
  expect(report.confirmed).toHaveBeenCalledWith(10, HASH_10, "3", 0n);
});

test("relayr lane fails every chain when the quote exceeds the reservation", async () => { /* payment amount > reservationWei → failed for both, nothing sent */ });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/sponsor/relayr.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement relayr.ts**

```ts
export function createRelayrLane({ chain, catalog, provider, rpcUrls, signer, policy, projectsAddress, now = Date.now }): DeployLane {
  return {
    async deploy(intent, chainIds, report) {
      const failAll = async (message: string) => { for (const c of chainIds) await report.failed(c, message); };
      try {
        const deadline = Math.floor(now() / 1000) + 47 * 3600;
        const entries: RelayrEntry[] = [];
        for (const [index, chainId] of chainIds.entries()) {
          const call = intent.envelope.deploymentCalls.find((c) => c.chainId === chainId);
          const url = rpcUrls.get(chainId);
          if (!call || !url) return failAll(`chain ${chainId} is not configured`);
          const fee = await createPublicClient({ transport: http(url) }).readContract({ address: projectsAddress, abi: PROJECTS_ABI, functionName: "creationFee" });
          const prepared = await chain.prepare(catalog, { chainId, to: call.to, data: call.data, value: fee.toString() }, signer.address, index, deadline);
          if (BigInt(prepared.message.gas) > policy.maximumGas) return failAll(`gas ${prepared.message.gas} exceeds the sponsor cap`);
          const signature = await signer.signTypedData({
            domain: prepared.domain, types: FORWARD_REQUEST_TYPES, primaryType: "ForwardRequest",
            message: { from: prepared.message.from, to: prepared.message.to, value: BigInt(prepared.message.value), gas: BigInt(prepared.message.gas),
              nonce: BigInt(prepared.message.nonce), deadline: Number(prepared.message.deadline), data: prepared.message.data },
          });
          entries.push(await chain.signed(prepared, signature));
        }
        const quote = parseQuote(await provider.create(entries), entries, now(), reservationWei(policy, chainIds.length));
        const payment = quote.payments.find((p) => rpcUrls.has(p.chainId)) ?? quote.payments[0];
        if (!payment) return failAll("relayr returned no payment option");
        const paymentClient = createPublicClient({ transport: http(rpcUrls.get(payment.chainId)!) });
        const fees = await paymentClient.estimateFeesPerGas();
        const nonce = await paymentClient.getTransactionCount({ address: signer.address, blockTag: "pending" });
        const raw = await signer.signTransaction({ type: "eip1559", chainId: payment.chainId, to: payment.to, data: payment.data, value: BigInt(payment.value),
          gas: 150_000n, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, nonce });
        const paymentHash = await paymentClient.sendRawTransaction({ serializedTransaction: raw });
        const paymentReceipt = await paymentClient.waitForTransactionReceipt({ hash: paymentHash, confirmations: 1, timeout: 180_000 });
        verifyRelayrPaymentEvent(paymentReceipt.logs, quote.bundleUuid, payment.value, String(payment.deadline));
        const paymentCost = paymentReceipt.gasUsed * paymentReceipt.effectiveGasPrice + BigInt(payment.value);
        const hashes = new Map<number, Hex>();
        const started = now();
        while (hashes.size < chainIds.length) {
          if (now() - started > 15 * 60_000) return failAll("relayr did not execute the bundle in time");
          for (const item of parseStatus(await provider.status(quote.bundleUuid), quote)) {
            const chainId = entries[item.step]?.chain;
            if (item.hash && chainId !== undefined && !hashes.has(chainId)) { hashes.set(chainId, item.hash); await report.sent(chainId, item.hash, quote.bundleUuid); }
          }
          if (hashes.size < chainIds.length) await new Promise((r) => setTimeout(r, 5_000));
        }
        let first = true;
        for (const chainId of chainIds) {
          const client = createPublicClient({ transport: http(rpcUrls.get(chainId)!) });
          const hash = hashes.get(chainId)!;
          const receipt = await client.waitForTransactionReceipt({ hash, confirmations: policy.confirmations, timeout: 180_000 });
          if (receipt.status !== "success") return report.failed(chainId, "relayed deployment reverted");
          const created = receipt.logs.find((l) => l.address.toLowerCase() === projectsAddress.toLowerCase() && l.topics[0] === CREATE_TOPIC);
          if (!created?.topics[1]) return report.failed(chainId, "no Create log");
          await report.confirmed(chainId, hash, BigInt(created.topics[1]).toString(), first ? paymentCost : 0n);
          first = false;
        }
      } catch (error) {
        await failAll(error instanceof Error ? error.message : String(error));
      }
    },
  };
}
```

Share `PROJECTS_ABI` and `CREATE_TOPIC` with `direct.ts` by moving them to `src/sponsor/chain.ts`. `parseQuote` rejects any quote above the fourth argument, which is how the reservation cap is enforced. Relayr executes the forwarder, so the top-level `to` is the forwarder and the verifier's trace path handles it; mainnets have trace upstreams already.

- [ ] **Step 4: Run, commit**

Run: `npx vitest run test/sponsor && npx tsc --noEmit`

```bash
git add src/sponsor/relayr.ts src/sponsor/chain.ts src/sponsor/direct.ts src/rest/sponsorship/provider.ts test/sponsor/relayr.test.ts
git commit -m "Deploy sponsored mainnet drafts through Relayr

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Wire the sponsor into the process, env and docs

**Files:**
- Modify: `extensions/jbcenter/src/index.ts`
- Modify: `extensions/jbcenter/.env.example`
- Modify: `extensions/jbcenter/README.md` (sections "Publish an intent", "Read and search", "Record deployment", "Production configuration")
- Modify: `extensions/jbcenter/src/llms.ts` (route listing)
- Test: `extensions/jbcenter/test/sponsor/policy.test.ts` (env parsing already covered)

- [ ] **Step 1: Env parsing in index.ts**

Following the existing all-or-nothing group pattern:

```ts
const sponsorKey = process.env.SPONSOR_SIGNER_KEY;
let sponsor: (SponsorRuntime & { stop(): void }) | undefined;
if (sponsorKey) {
  if (!/^0x[0-9a-f]{64}$/i.test(sponsorKey)) throw new Error("SPONSOR_SIGNER_KEY must be a 32-byte hex private key");
  const signer = privateKeyToAccount(sponsorKey as Hex);
  const policy = readSponsorPolicy(process.env);
  const rpcUrls = new Map([...upstreams].map(([chainId, urls]) => [chainId, urls[0]]));
  const lanes = {
    direct: createDirectLane({ rpcUrls, signer, policy, projectsAddress: PROJECTS }),
    ...(catalog ? { relayr: createRelayrLane({ chain: new SponsorshipChain(restRpc, DEFAULT_SPONSORSHIP_POLICY), catalog, provider: new RelayrProvider(), rpcUrls, signer, policy, projectsAddress: PROJECTS }) } : {}),
  };
  sponsor = createSponsorWorker({ store, verifier, lanes, policy });
}
```

`upstreams` is the Dwellir map already built in `index.ts`; `catalog` and `restRpc` are the REST runtime's contract catalog and RPC (locate the symbols where `createRestRuntime` is configured and hoist them so they are in scope). Pass `...(sponsor ? { sponsor } : {})` into `createApp`. Call `sponsor?.stop()` in the shutdown handler. Export `PROJECTS` from `deploymentVerifier.ts` instead of duplicating.

- [ ] **Step 2: Docs**

`.env.example`: add the sponsor block with every variable from Global Constraints plus `SPONSOR_SIGNER_KEY=` (blank) and one comment line each. README: document `supersedes` under "Publish an intent"; add `POST /v1/intents/:id/withdraw` and `POST /v1/intents/:id/deploy` sections with request and response examples copied from the tests; add the per-chain `deploys` field to "Read and search"; list the sponsor env vars under "Production configuration" with the note that the sponsor key funds every sponsored chain plus the Relayr payment chain. `src/llms.ts`: add the two routes.

- [ ] **Step 3: Full check**

Run: `npm run check && npx tsc --noEmit && npx vitest run test/app.test.ts test/sponsor test/deploymentVerifier.test.ts test/intent.test.ts`
Expected: PASS. `npm run check` is the required-tests gate; if it names a missing test for a new module, add it.

- [ ] **Step 4: Commit and open the PR**

```bash
git add src/index.ts .env.example README.md src/llms.ts
git commit -m "Run the draft sponsor and document the routes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
gh pr create --title "Draft projects: lifecycle, sponsored deploys" --body "..."  # body ends with the attribution line
```

---

### Task 9: SDK client: lifecycle calls, deploy status, sponsorable chains

**Files:**
- Modify: `juice-sdk-connect/packages/core/src/jbcenter.ts`
- Test: `juice-sdk-connect/packages/core/src/jbcenter.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type JBCenterIntentStatus = "undeployed" | "deployed" | "superseded" | "withdrawn";
  export type JBCenterIntentDeploy = { chainId: number; transport: "direct" | "relayr"; status: "queued" | "sent" | "confirmed" | "failed"; transactionHash: Hex | null; bundleUuid: string | null; error: string | null; createdAt: string; updatedAt: string };
  // JBCenterIntent gains: status: JBCenterIntentStatus; supersedes: string | null; supersededBy: string | null; withdrawnAt: string | null; deploys: JBCenterIntentDeploy[]
  // JBCenterIntentInput gains: supersedes?: string
  export const JBCENTER_SPONSORED_CHAIN_IDS: readonly number[]; // [10, 8453, 42161, 11155111, 11155420, 84532, 421614]
  export function isSponsorable(chainIds: readonly number[]): boolean;
  export function withdrawIntentMessage(intentId: string): string;
  class JBCenterClient { withdrawIntent(intentId: string, signature: Hex, options?): Promise<JBCenterIntent>; requestDeploy(intentId: string, options?): Promise<{ deploys: JBCenterIntentDeploy[] }>; }
  ```

- [ ] **Step 1: Failing tests** (same `jsonResponse` and `fetchMock` conventions as the existing file)

```ts
test("withdrawIntent posts the signature and returns the intent", async () => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ...intent(), status: "withdrawn", withdrawnAt: "2026-09-21T00:00:00.000Z" }));
  const client = createJBCenterClient({ fetch: fetchMock });
  const result = await client.withdrawIntent(intent().id, signature);
  expect(result.status).toBe("withdrawn");
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe(`https://juicebox.center/v1/intents/${intent().id}/withdraw`);
  expect(JSON.parse(String(init.body))).toEqual({ signature });
});

test("requestDeploy returns the queued rows", async () => {
  const deploys = [{ chainId: 84532, transport: "direct", status: "queued", transactionHash: null, bundleUuid: null, error: null, createdAt: "2026-09-21T00:00:00.000Z", updatedAt: "2026-09-21T00:00:00.000Z" }];
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ deploys }, { status: 202 }));
  await expect(createJBCenterClient({ fetch: fetchMock }).requestDeploy(intent().id)).resolves.toEqual({ deploys });
});

test("sponsorable chain sets", () => {
  expect(isSponsorable([8453, 10])).toBe(true);
  expect(isSponsorable([1, 8453])).toBe(false);
  expect(isSponsorable([])).toBe(false);
});

test("withdraw message", () => {
  expect(withdrawIntentMessage("abc")).toBe("Juice Central withdraw intent\nVersion: 1\nIntent: abc");
});
```

Also update the `intent()` fixture with the new fields and assert `getIntent` accepts a `superseded` status and a non-empty `deploys` list, and rejects a malformed deploy row.

- [ ] **Step 2: Run to verify they fail**

Run: `cd juice-sdk-connect/packages/core && npx vitest run src/jbcenter.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Extend the types as above. Extend `isIntent` to accept the four statuses, nullable `supersedes`/`supersededBy`/`withdrawnAt`, and validate `deploys` with a new `isIntentDeploy` guard. Add `supersedes` as an optional string to `isEnvelope`. Add:

```ts
export const JBCENTER_SPONSORED_CHAIN_IDS = Object.freeze([10, 8453, 42161, 11155111, 11155420, 84532, 421614]);
export function isSponsorable(chainIds: readonly number[]): boolean {
  return chainIds.length > 0 && chainIds.every((id) => JBCENTER_SPONSORED_CHAIN_IDS.includes(id));
}
export function withdrawIntentMessage(intentId: string): string {
  return `Juice Central withdraw intent\nVersion: 1\nIntent: ${intentId}`;
}
```

Client methods, using the private `fetchJson`:

```ts
withdrawIntent(intentId: string, signature: Hex, options?: JBCenterRequestOptions): Promise<JBCenterIntent> {
  return this.fetchJson(`v1/intents/${encodeURIComponent(intentId)}/withdraw`, { method: "POST", body: JSON.stringify({ signature }) }, isIntent, options);
}
requestDeploy(intentId: string, options?: JBCenterRequestOptions): Promise<{ deploys: JBCenterIntentDeploy[] }> {
  return this.fetchJson(`v1/intents/${encodeURIComponent(intentId)}/deploy`, { method: "POST" }, isDeployResponse, options);
}
```

- [ ] **Step 4: Run, commit**

Run: `npx vitest run src/jbcenter.test.ts src/publicSurface.test.ts && npm run type-check`

```bash
git add packages/core/src/jbcenter.ts packages/core/src/jbcenter.test.ts packages/core/src/publicSurface.test.ts
git commit -m "Add intent lifecycle and sponsored deploy calls to the Center client

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: SDK launch-calldata decoder

**Files:**
- Create: `juice-sdk-connect/packages/core/src/jbcenter/decode.ts`
- Modify: `juice-sdk-connect/packages/core/src/jbcenter.ts` (re-export)
- Test: `juice-sdk-connect/packages/core/src/jbcenter/decode.test.ts`

**Interfaces:**
- Consumes: `v6Address` (`src/v6/types.ts`), ABIs `jbControllerAbi`, `jb721TiersHookProjectDeployerAbi`, `jbOmnichainDeployerAbi`, `revDeployerAbi` (`src/generated/juicebox.ts`), builders `buildLaunchProjectTx`, `buildOmnichainLaunchProjectTx`, `buildDeployRevnetTx`, `createJBCenterDeploymentCall`.
- Produces:
  ```ts
  export type JBCenterDecodedLaunch =
    | { flavor: "project"; owner: Address; projectUri: string; rulesetConfigurations: readonly JBRulesetConfig[]; terminalConfigurations: readonly JBTerminalConfig[]; memo: string }
    | { flavor: "project-721"; owner: Address; projectUri: string; rulesetConfigurations: readonly JBRulesetConfig[]; terminalConfigurations: readonly JBTerminalConfig[]; memo: string; salt: Hex }
    | { flavor: "omnichain"; owner: Address; projectUri: string; rulesetConfigurations: readonly JBRulesetConfig[]; terminalConfigurations: readonly JBTerminalConfig[]; memo: string; has721: boolean }
    | { flavor: "revnet"; operator: Address; projectUri: string; stages: REVConfig["stageConfigurations"]; description: REVConfig["description"]; accountingContexts: readonly JBAccountingContext[] }
    | { flavor: "unknown"; to: Address; selector: Hex };
  export function decodeDeploymentCall(call: JBCenterDeploymentCall): JBCenterDecodedLaunch;
  ```

- [ ] **Step 1: Failing round-trip tests** (build with each SDK builder on chain 8453, freeze with `createJBCenterDeploymentCall`, decode, compare)

```ts
test("decodes a JBController launch", () => {
  const tx = buildLaunchProjectTx({ chainId: 8453, owner, projectUri: "ipfs://x", rulesetConfigurations: [ruleset], terminalConfigurations: [terminal], memo: "hi", creationFee: 1n });
  const decoded = decodeDeploymentCall(createJBCenterDeploymentCall(tx));
  expect(decoded).toMatchObject({ flavor: "project", owner, projectUri: "ipfs://x", memo: "hi" });
  expect(decoded.flavor === "project" && decoded.rulesetConfigurations[0].weight).toBe(ruleset.weight);
});
test("decodes an omnichain launch with and without a 721 config", ...);
test("decodes a revnet deploy", ...);
test("decodes a 721 project deployer launch", ...); // encode with encodeFunctionData(jb721TiersHookProjectDeployerAbi, "launchProjectFor", [...])
test("unknown target yields unknown", () => {
  expect(decodeDeploymentCall({ chainId: 8453, to: "0x0000000000000000000000000000000000000001", data: "0x12345678" })).toEqual({ flavor: "unknown", to: "0x0000000000000000000000000000000000000001", selector: "0x12345678" });
});
test("known target with an unknown selector yields unknown", ...);
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/jbcenter/decode.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import { decodeFunctionData, slice, type Address, type Hex } from "viem";
import { v6Address, type V6Contract } from "../v6/types.js";
import { jbControllerAbi, jb721TiersHookProjectDeployerAbi, jbOmnichainDeployerAbi, revDeployerAbi } from "../generated/juicebox.js";

const TARGETS: { name: V6Contract; abi: Abi; decode: (fn: string, args: readonly unknown[]) => JBCenterDecodedLaunch | null }[] = [
  { name: "JBController", abi: jbControllerAbi, decode: (fn, a) => fn === "launchProjectFor" ? { flavor: "project", owner: a[0], projectUri: a[1], rulesetConfigurations: a[2], terminalConfigurations: a[3], memo: a[4] } : null },
  { name: "JB721TiersHookProjectDeployer", abi: jb721TiersHookProjectDeployerAbi, decode: (fn, a) => fn === "launchProjectFor" ? { flavor: "project-721", owner: a[0], projectUri: a[2].projectUri, rulesetConfigurations: a[2].rulesetConfigurations, terminalConfigurations: a[2].terminalConfigurations, memo: a[2].memo, salt: a[4] } : null },
  { name: "JBOmnichainDeployer", abi: jbOmnichainDeployerAbi, decode: (fn, a) => fn === "launchProjectFor" ? (a.length === 7
      ? { flavor: "omnichain", owner: a[0], projectUri: a[1], rulesetConfigurations: a[3], terminalConfigurations: a[4], memo: a[5], has721: true }
      : { flavor: "omnichain", owner: a[0], projectUri: a[1], rulesetConfigurations: a[2], terminalConfigurations: a[3], memo: a[4], has721: false }) : null },
  { name: "REVDeployer", abi: revDeployerAbi, decode: (fn, a) => fn === "deployFor" ? { flavor: "revnet", operator: a[1].operator, projectUri: a[1].description.uri, stages: a[1].stageConfigurations, description: a[1].description, accountingContexts: a[2] } : null },
];

export function decodeDeploymentCall(call: JBCenterDeploymentCall): JBCenterDecodedLaunch {
  const selector = slice(call.data, 0, 4);
  for (const target of TARGETS) {
    let address: Address;
    try { address = v6Address(target.name, call.chainId as JBChainId); } catch { continue; }
    if (address.toLowerCase() !== call.to.toLowerCase()) continue;
    try {
      const { functionName, args } = decodeFunctionData({ abi: target.abi, data: call.data });
      const decoded = target.decode(functionName, args ?? []);
      if (decoded) return decoded;
    } catch { /* fall through to unknown */ }
  }
  return { flavor: "unknown", to: call.to, selector };
}
```

Check the exact arg positions against the ABI in `src/generated/juicebox.ts` when writing the decode closures (the omnichain 7-arg overload order is `owner, projectUri, deploy721Config, rulesetConfigurations, terminalConfigurations, memo, suckerDeploymentConfiguration`). Type the closures with the ABI-derived tuple types rather than `unknown[]` so the coverage and type-check gates stay green. Re-export from `src/jbcenter.ts`.

- [ ] **Step 4: Run, commit**

Run: `npx vitest run src/jbcenter && npm run type-check`

```bash
git add packages/core/src/jbcenter/decode.ts packages/core/src/jbcenter/decode.test.ts packages/core/src/jbcenter.ts
git commit -m "Decode a draft's launch calldata into a project shell

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: SDK search merger and route helpers

**Files:**
- Create: `juice-sdk-connect/packages/core/src/jbcenter/merge.ts`
- Test: `juice-sdk-connect/packages/core/src/jbcenter/merge.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type JBCenterDraftRow = { draft: true; intentId: string; name: string; tagline: string | null; logoUri: string | null; owner: Address | null; chainIds: number[]; createdAt: number /* unix seconds */ };
  export function draftRow(item: JBCenterSearchItem): JBCenterDraftRow;
  export function mergeSearch<T extends { createdAt: number }>(rows: readonly T[], items: readonly JBCenterSearchItem[]): (T | JBCenterDraftRow)[]; // newest first
  export function draftPath(intentId: string): string; // `/draft/${intentId}`
  export function deployedChains(intent: JBCenterIntent): Record<number, string>; // chainId → projectId from intent.deployments
  export function isFullyDeployed(intent: JBCenterIntent): boolean;
  ```

- [ ] **Step 1: Failing tests**

```ts
test("mergeSearch interleaves by creation time, newest first, and flags drafts", () => {
  const rows = [{ id: "a", createdAt: 100 }, { id: "b", createdAt: 300 }];
  const items = [{ ...searchItem, intentId: "d", createdAt: "1970-01-01T00:03:20.000Z" }]; // 200s
  expect(mergeSearch(rows, items).map((r) => ("draft" in r ? r.intentId : r.id))).toEqual(["b", "d", "a"]);
  expect(mergeSearch(rows, items)[1]).toMatchObject({ draft: true, createdAt: 200 });
});
test("draftPath and deployedChains", () => {
  expect(draftPath("x")).toBe("/draft/x");
  expect(deployedChains({ ...intent(), deployments: [{ chainId: 8453, projectId: "12", transactionHash: hash, createdAt: "" }] })).toEqual({ 8453: "12" });
  expect(isFullyDeployed({ ...intent(), envelope: { ...intent().envelope, chainIds: [8453, 10] }, deployments: [{ chainId: 8453, projectId: "12", transactionHash: hash, createdAt: "" }] })).toBe(false);
});
```

- [ ] **Step 2: Run to verify they fail**, then **Step 3: Implement** (a stable sort by `createdAt` descending; `draftRow` converts the ISO string with `Math.floor(Date.parse(createdAt) / 1000)`), **Step 4: Run, commit**

```bash
git add packages/core/src/jbcenter/merge.ts packages/core/src/jbcenter/merge.test.ts packages/core/src/jbcenter.ts
git commit -m "Merge Center drafts into project lists

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: SDK `ensureDeployed`

**Files:**
- Create: `juice-sdk-connect/packages/core/src/jbcenter/ensureDeployed.ts`
- Test: `juice-sdk-connect/packages/core/src/jbcenter/ensureDeployed.test.ts`

**Interfaces:**
- Consumes: `JBCenterClient.getIntent`, `requestDeploy`, `recordDeployment`, `isSponsorable`, `deployedChains`, `isFullyDeployed`.
- Produces:
  ```ts
  export type EnsureDeployedStep = { chainId: number; status: "queued" | "sent" | "confirmed" | "failed" | "self-paid"; transactionHash?: Hex };
  export type EnsureDeployedOptions = {
    client: JBCenterClient; intent: JBCenterIntent;
    selfPaid?: (calls: JBCenterDeploymentCall[]) => Promise<JBCenterDeploymentInput[]>; // runs the client's own launch pipeline for every remaining chain
    onStep?: (step: EnsureDeployedStep) => void; pollMs?: number; timeoutMs?: number; signal?: AbortSignal;
  };
  export class EnsureDeployedError extends Error { constructor(message: string, readonly chainId?: number) }
  export function ensureDeployed(options: EnsureDeployedOptions): Promise<Record<number, string>>; // chainId → projectId
  ```
  Rules: already fully deployed → return immediately. Sponsorable and no deploy rows → `requestDeploy`, then poll `getIntent` every `pollMs` (default 4000) until fully deployed or a row is `failed` or `timeoutMs` (default 600000). Not sponsorable, or `requestDeploy` answers 400/429/503 → run `selfPaid` when given (then `recordDeployment` for each result) else throw `EnsureDeployedError`. Never mix: if any deployment already exists, remaining chains go the same way the first one went (self-paid if Center has no deploy rows, sponsored otherwise).

- [ ] **Step 1: Failing tests** with a scripted `fetchMock` sequence: (a) sponsored happy path in two polls; (b) sponsor 429 falls back to `selfPaid` and records; (c) failed row throws with the chain id; (d) fully deployed returns without fetching.

- [ ] **Step 2: Run to verify they fail**, **Step 3: Implement** per the rules above with `JBCenterRequestError.status` deciding the fallback, **Step 4: Run, commit**

```bash
git add packages/core/src/jbcenter/ensureDeployed.ts packages/core/src/jbcenter/ensureDeployed.test.ts packages/core/src/jbcenter.ts
git commit -m "Add the deploy-before-first-write pre-step

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: SDK public surface, coverage and release

**Files:**
- Modify: `juice-sdk-connect/packages/core/src/index.ts`, `src/publicSurface.test.ts`, `package.json` (version bump to 2.7.0), `README.md` (a "Draft projects" section)

- [ ] **Step 1:** Add every new export to `publicSurface.test.ts` (`decodeDeploymentCall`, `mergeSearch`, `draftRow`, `draftPath`, `deployedChains`, `isFullyDeployed`, `ensureDeployed`, `EnsureDeployedError`, `isSponsorable`, `withdrawIntentMessage`, `JBCENTER_SPONSORED_CHAIN_IDS`).
- [ ] **Step 2:** Run `npx vitest run --coverage` and confirm every new file clears the global floors (95 statements, 95 lines, 92 functions, 82 branches). Add cases for any uncovered branch.
- [ ] **Step 3:** README section: publish, supersede, withdraw, `ensureDeployed` usage, the "one sender per draft" rule and the `/draft/<id>` route convention.
- [ ] **Step 4:** Commit and open the release PR (the release run enforces 100 percent line coverage; check `vitest run --coverage` output before pushing).

```bash
git add packages/core/src/index.ts packages/core/src/publicSurface.test.ts packages/core/package.json packages/core/README.md
git commit -m "Release the draft projects SDK surface

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: `jb-draft-projects` skill

**Files:**
- Create: `skills/plugins/juicebox-v6/skills/jb-draft-projects/SKILL.md`
- Modify: `skills/plugins/juicebox-v6/README.md` (category table)

- [ ] **Step 1: Write the skill**

Frontmatter per `CONVENTIONS.md`:

```yaml
---
name: jb-draft-projects
description: |
  Create, list, render and deploy Juicebox V6 draft projects stored on juicebox.center.
  Use when: (1) building a create flow that should not need a transaction,
  (2) merging undeployed drafts into project lists and search,
  (3) rendering a project page for a draft, (4) inserting the deploy-first
  step before any write against a draft.
metadata:
  version: "6.0.0"
---
```

Body sections, tables over prose: the intent envelope and signing message; the lifecycle (publish, supersede, withdraw, deployed); the one-sender rule with the salt explanation; sponsored chains and the deploy route; the `/draft/<id>` route and the redirect rule; `decodeDeploymentCall` shells per flavor; `mergeSearch`; `ensureDeployed` at the write chokepoint; and a trailing `## Common mistakes` (baking `mustStartAtOrAfter: 0` into stage 1 of a draft; deploying some chains yourself and asking Center for the rest; showing drafts in Trending; treating the intent signature as transaction approval).

- [ ] **Step 2:** Run `./build-skills.sh` and confirm `dist/jb-draft-projects.zip` exists. Add the row to the README category table.
- [ ] **Step 3: Commit**

```bash
git add skills/jb-draft-projects/SKILL.md README.md
git commit -m "Add the jb-draft-projects skill

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Rehearsal on Center dev

**Files:** none (ops).

- [ ] **Step 1:** Generate a sponsor key, fund it on Base Sepolia and OP Sepolia (0.01 ETH each), set `SPONSOR_SIGNER_KEY` and the policy vars on the Railway `dev` environment of `juice-center`, deploy.
- [ ] **Step 2:** With the SDK, publish a two-chain testnet draft from a fresh EOA, call `requestDeploy`, poll `getIntent` until both rows are `confirmed`, and confirm both projects exist on chain with the same owner and the expected ruleset start. Record the intent id and both tx hashes in `tasks/todo.md`.
- [ ] **Step 3:** Publish a single-chain Base mainnet draft with a real owner, fund the sponsor key on Base with 0.002 ETH, `requestDeploy`, confirm Relayr executes and Center records the deployment through the trace path.
- [ ] **Step 4:** Confirm `GET /v1/search` no longer lists either draft and that `POST /v1/intents/:id/deploy` on a deployed draft returns 200 with the rows.

---

## Follow-on plans (write after Task 13 fixes the SDK surface)

1. `2026-09-XX-draft-projects-phase-2.md`: juicebox.money and revnet.money together. Create step "Publish" (absolute stage-1 start, `createJBCenterDeploymentCall` from `buildLaunchRequest` / `parseDeployData`, `publishIntent`, clear local draft, route to `/draft/<id>`); `/draft/[id]` route rendering the existing project page from `decodeDeploymentCall` plus `shellProject` / `getProjectFallback`, redirect once deployed; `mergeSearch` in `/api/search`, `/api/search-projects`, New lists; `ensureDeployed` inside `useSafeTx` and `useWriteContract` as the first TxSteps step with the existing self-paid launch pipelines as `selfPaid`.
2. `2026-09-XX-draft-projects-phase-3.md`: homerun (`buildFundLaunch`, `useSafeTx`), succulent (`pageLaunchTx`, `tx.ts`), JBSticky (`deployStickyFor`; confirm the deployer is permissionless for a non-owner caller and trusts the forwarder before starting), juicescan render and search.
3. `2026-09-XX-draft-projects-phase-4.md`: eth.shop, ethis.money, JBChat read-side rendering of drafts.

## Self-review notes

- Spec coverage: publish limits (T3), supersede and withdraw (T1, T2), sponsored deploy policy and route (T5), Relayr on mainnets and direct on testnets (T6, T7), one-sender refusal (T5 checks `status === "undeployed"`; lanes stop at the first failed chain), fast-path verification and testnet verifier configs (T4), SDK decoder, merger, `ensureDeployed`, route convention (T10 to T12), skill (T14), rehearsal (T15). Client work is deferred to the follow-on plans by design.
- Known ceiling: the worker runs in every Center replica; `claimQueuedDeploys` relies on the lease and `SKIP LOCKED` semantics. If Center ever runs more than one replica, add `pg_advisory_xact_lock(hashtext('sponsor-worker'))` around the claim.
