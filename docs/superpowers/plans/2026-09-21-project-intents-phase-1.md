# Project Intents, Phase 1 (Center + SDK + skill) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make juicebox.center able to carry a project intent from publish through sponsored or self-paid deploy and redirect, and give every webclient one SDK surface to consume it. A submitted intent is firm: no edit, replace or withdraw.

**Architecture:** Center's existing intent store gains a deploy queue and a sponsor worker. The worker deploys intents on both network families through the existing Relayr ERC-2771 wrapper, signed by Center's sponsor key; the testnet setup is the mainnet setup. The SDK core package gains lifecycle calls, a launch-calldata decoder, a search merger and an `ensureDeployed` pre-step. A new skill states the norm.

**Tech Stack:** Center: Hono 4, Node 22, Postgres via `pg` raw SQL, viem, vitest. SDK: TypeScript, viem, vitest with 95/95/92/82 coverage floors. Skills: Agent Skills SKILL.md format.

**Spec:** `docs/superpowers/specs/2026-09-21-project-intents-design.md`

## Global Constraints

- Sponsored chains: mainnets `10, 8453, 42161` and testnets `11155111, 11155420, 84532, 421614`, all through Relayr at `https://api.relayr.ba5ed.com`. One bundle spans one family. Ethereum mainnet `1` is never sponsored.
- Exactly one sender deploys every chain of an intent. Center refuses to sponsor an intent whose status is not `undeployed`.
- Policy defaults, all Center env vars: `SPONSOR_DEPLOYS_PER_REQUESTER_PER_DAY=5`, `SPONSOR_DAILY_BUDGET_WEI=50000000000000000` (0.05 ETH), `SPONSOR_MAX_GAS=8000000`, `SPONSOR_MAX_FEE_PER_GAS=1000000000` (1 gwei), `SPONSOR_PAUSED=0`. Publish limits `PUBLISH_PER_PUBLISHER_PER_DAY=20`, `PUBLISH_PER_IP_PER_HOUR=60`.
- The intent signing message and envelope stay exactly as today, so existing signatures keep verifying.
- Creation fee is read live from `JBProjects.creationFee()` at `0x6017d1fba9dc279bfa0b03fd931c22e242ab3691` on every chain and sent exactly.
- Center's Docker build runs `tsc` over `test/`, so test files must type-check. Run touched vitest suites alone against Postgres 16.
- Never `git add -A`. Stage by explicit path. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Center repo: `extensions/jbcenter` (its own git repo; branch from `main`). SDK repo: `juice-sdk-connect` (workspace root; package `packages/core`). Skills repo: `skills`.

---

## File map

Center (`extensions/jbcenter`):
- Create `src/db/migrations/036_intent_deploys.sql`: the `intent_deploys` table.
- Modify `src/types.ts`: `Intent.deploys`, new `IntentDeploy`.
- Modify `src/store.ts`: deploy queue methods.
- Modify `src/db/postgres.ts`: implement the above.
- Modify `src/app.ts`: publish limits, deploy route, `AppOptions.sponsor`.
- Modify `src/deploymentVerifier.ts`: top-level fast path, all eight chains.
- Create `src/sponsor/policy.ts`: chain families, sponsorability, policy parsing.
- Create `src/sponsor/chain.ts`: shared `PROJECTS_ABI`, `CREATE_TOPIC`, `SponsorSigner`, `DeployLane`, `LaneReport` types.
- Create `src/sponsor/relayr.ts`: the one lane (ERC-2771 requests signed by the sponsor key, prepayment from the sponsor key, both families).
- Create `src/sponsor/worker.ts`: queue claim, transport dispatch, verify, record.
- Modify `src/index.ts`: env parsing and wiring; `README.md` and `.env.example`.
- Tests: `test/app.test.ts` (MemoryStore + routes), `test/deploymentVerifier.test.ts`, `test/sponsor/*.test.ts`.

SDK (`juice-sdk-connect/packages/core`):
- Modify `src/jbcenter.ts`: types, `requestDeploy`, deploy status validators, `SPONSORED_CHAIN_IDS`, `isSponsorable`.
- Create `src/jbcenter/decode.ts`: `decodeDeploymentCall`.
- Create `src/jbcenter/merge.ts`: `mergeSearch`, `intentPath`, `deployedChains`, `isFullyDeployed`.
- Create `src/jbcenter/ensureDeployed.ts`: `ensureDeployed`.
- Modify `src/index.ts` and `src/publicSurface.test.ts`.

Skills (`skills/plugins/juicebox-v6`):
- Create `skills/jb-project-intents/SKILL.md`; add a row to `README.md`.

---

### Task 1: Migration, types and store for the deploy queue

**Files:**
- Create: `extensions/jbcenter/src/db/migrations/036_intent_deploys.sql`
- Modify: `extensions/jbcenter/src/types.ts`
- Modify: `extensions/jbcenter/src/store.ts`
- Modify: `extensions/jbcenter/src/db/postgres.ts`
- Modify: `extensions/jbcenter/test/app.test.ts` (the in-file `MemoryStore`)
- Test: `extensions/jbcenter/test/postgres.integration.test.ts` (add cases; if the file does not exist, create it following the existing integration test in `extensions/center-signup-fast-2/test/postgres.integration.test.ts`)

**Interfaces:**
- Produces: `IntentDeploy`, `Intent.deploys`, `Store.queueDeploys`, `Store.listDeploys`, `Store.claimQueuedDeploys`, `Store.updateDeploy`, `Store.sponsoredWeiSince`.

- [ ] **Step 1: Write the migration**

```sql
-- 036_intent_deploys.sql
CREATE TABLE intent_deploys (
  intent_id uuid NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  chain_id bigint NOT NULL,
  requester text NOT NULL,
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

In `src/types.ts` add `IntentDeploy` and the `deploys` field on `Intent`:

```ts
export type IntentDeployStatus = "queued" | "sent" | "confirmed" | "failed";

export type IntentDeploy = {
  chainId: number;
  status: IntentDeployStatus;
  transactionHash: Hex | null;
  bundleUuid: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Intent = IntentMetadata & {
  id: string;
  status: "undeployed" | "deployed";
  contentHash: Hex;
  envelope: IntentEnvelope;
  publisher: Address;
  signature: Hex;
  createdAt: string;
  deployments: Deployment[];
  deploys: IntentDeploy[];
};
```

- [ ] **Step 3: Extend the Store interface**

In `src/store.ts`:

```ts
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
  queueDeploys(intentId: string, chainIds: number[], requester: string, reservedWeiPerChain: bigint): Promise<IntentDeploy[]>;
  listDeploys(intentId: string): Promise<IntentDeploy[]>;
  claimQueuedDeploys(leaseSeconds: number, limit: number): Promise<{ intentId: string; chainIds: number[] }[]>;
  updateDeploy(intentId: string, chainId: number, patch: DeployPatch): Promise<void>;
  sponsoredWeiSince(since: Date): Promise<bigint>;
}
```

Import `IntentDeploy`, `IntentDeployStatus` from `./types.js`.

- [ ] **Step 4: Write the failing Postgres integration tests**

Add to the integration suite (uses a real PG16 via `DATABASE_URL`, following the existing pattern):

```ts
test("deploy queue is idempotent, leases rows, and sums wei", async () => {
  const { intent } = await store.createIntent(newIntent({ name: "one", chainIds: [84532, 421614] }), limits);
  const rows = await store.queueDeploys(intent.id, [84532, 421614], "browser:x", 1000n);
  expect(rows.map((r) => r.status)).toEqual(["queued", "queued"]);
  expect(await store.queueDeploys(intent.id, [84532, 421614], "browser:x", 1000n)).toHaveLength(2);
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
Expected: FAIL on missing methods and table.

- [ ] **Step 6: Implement in PostgresStore**

Extend `toIntent` (the row mapper near line 49) with `deploys`. `getIntent` adds a third parallel query:

```sql
SELECT chain_id, status, bundle_uuid, transaction_hash, error, created_at, updated_at
FROM intent_deploys WHERE intent_id = $1 ORDER BY chain_id
```

New methods:

```ts
async queueDeploys(intentId, chainIds, requester, reservedWeiPerChain) {
  await this.pool.query(
    `INSERT INTO intent_deploys (intent_id, chain_id, requester, reserved_wei)
     SELECT $1, unnest($2::bigint[]), $3, $4::numeric
     ON CONFLICT (intent_id, chain_id) DO NOTHING`,
    [intentId, chainIds, requester, reservedWeiPerChain.toString()],
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

Note: `DISTINCT ... FOR UPDATE` is not allowed in Postgres. Write `picked` as `SELECT intent_id FROM intent_deploys WHERE ... GROUP BY intent_id ORDER BY intent_id LIMIT $2` and lock in the UPDATE instead; the advisory lock in the worker (Task 5) serializes claims across processes.

- [ ] **Step 7: Update the test MemoryStore**

In `test/app.test.ts` extend `MemoryStore` with in-memory versions of the five new methods, so route tests in later tasks work without Postgres. Keep `deploys: IntentDeploy[]` on each stored intent.

- [ ] **Step 8: Run tests**

Run: `npx vitest run test/postgres.integration.test.ts test/app.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/db/migrations/036_intent_deploys.sql src/types.ts src/store.ts src/db/postgres.ts test/app.test.ts test/postgres.integration.test.ts
git commit -m "Add the intent deploy queue

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Publish rate limits

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

### Task 3: Deployment verifier fast path and all eight chains

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

### Task 4: Sponsor policy and the deploy request route

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
  export function sponsorFamily(chainIds: number[]): "mainnet" | "testnet" | null; // one family only; null for mixed, empty, or any chain outside the sponsored sets
  export function reservationWei(policy: SponsorPolicy, chainCount: number): bigint; // chainCount * (maximumGas * maximumFeePerGas + 100_000_000_000_000n)
  export function readSponsorPolicy(env: NodeJS.ProcessEnv): SponsorPolicy;
  export type SponsorRuntime = { policy: SponsorPolicy; kick(): void };
  ```
  `AppOptions.sponsor?: SponsorRuntime`; `POST /v1/intents/:id/deploy` → 202 `{ deploys: IntentDeploy[] }`.

- [ ] **Step 1: Failing policy tests**

```ts
test("family by chain set", () => {
  expect(sponsorFamily([8453, 10])).toBe("mainnet");
  expect(sponsorFamily([84532, 11155111])).toBe("testnet");
  expect(sponsorFamily([1, 8453])).toBeNull();
  expect(sponsorFamily([8453, 84532])).toBeNull();
  expect(sponsorFamily([])).toBeNull();
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

export function sponsorFamily(chainIds: number[]): "mainnet" | "testnet" | null {
  if (chainIds.length && chainIds.every((id) => (SPONSORED_MAINNETS as readonly number[]).includes(id))) return "mainnet";
  if (chainIds.length && chainIds.every((id) => (SPONSORED_TESTNETS as readonly number[]).includes(id))) return "testnet";
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
  if (!sponsorFamily(intent.envelope.chainIds)) throw new BadRequest("intent chains are not sponsorable");
  const requester = c.get("client");
  const quota = await store.consumeRequest(`deploy:${requester}`, sponsor.policy.perRequesterPerDay, 86_400);
  if (!quota.allowed) return c.json({ error: { code: "sponsor_quota", message: "Daily sponsored deploy quota reached" } }, 429);
  const reserved = reservationWei(sponsor.policy, intent.envelope.chainIds.length);
  const spent = await store.sponsoredWeiSince(new Date(Date.now() - 86_400_000));
  if (spent + reserved > sponsor.policy.dailyBudgetWei) return c.json({ error: { code: "sponsor_budget", message: "The daily sponsorship budget is spent" } }, 429);
  const deploys = await store.queueDeploys(id, intent.envelope.chainIds, requester, reserved / BigInt(intent.envelope.chainIds.length));
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

### Task 5: Lane types and the sponsor worker

**Files:**
- Create: `extensions/jbcenter/src/sponsor/chain.ts`
- Create: `extensions/jbcenter/src/sponsor/worker.ts`
- Test: `extensions/jbcenter/test/sponsor/worker.test.ts`

**Interfaces:**
- Consumes: Task 1 store methods, Task 3 verifier, Task 4 policy.
- Produces (in `chain.ts`):
  ```ts
  export const PROJECTS_ABI = parseAbi(["function creationFee() view returns (uint256)"]);
  export const CREATE_TOPIC: Hex; // keccak256("Create(uint256,address,address)"), the same constant deploymentVerifier.ts uses; export it from there and re-export here
  export type SponsorSigner = { address: Address; signTransaction(tx: TransactionSerializableEIP1559): Promise<Hex>; signTypedData(args: TypedDataDefinition): Promise<Hex> }; // a viem PrivateKeyAccount satisfies this
  export type LaneReport = { sent(chainId: number, transactionHash: Hex, bundleUuid: string): Promise<void>; confirmed(chainId: number, transactionHash: Hex, projectId: string, spentWei: bigint): Promise<void>; failed(chainId: number, error: string): Promise<void> };
  export type DeployLane = { deploy(intent: Intent, chainIds: number[], report: LaneReport): Promise<void> };
  ```
  Produces (in `worker.ts`): `createSponsorWorker(options: { store: Store; verifier: DeploymentVerifier; lane: DeployLane; policy: SponsorPolicy; leaseSeconds?: number }): SponsorRuntime & { stop(): void; runOnce(): Promise<void> }`.

- [ ] **Step 1: Failing worker tests**

```ts
test("worker claims a queued intent, runs the lane, verifies and records", async () => {
  const store = new MemoryStore();
  const { intent } = await store.createIntent(newIntent({ chainIds: [84532] }), limits);
  await store.queueDeploys(intent.id, [84532], "browser:x", 10n);
  const lane: DeployLane = { deploy: vi.fn(async (_i, _c, report) => { await report.sent(84532, HASH, BUNDLE); await report.confirmed(84532, HASH, "9", 5n); }) };
  const verifier = { verify: vi.fn(async () => {}) };
  const worker = createSponsorWorker({ store, verifier, lane, policy });
  await worker.runOnce();
  expect(verifier.verify).toHaveBeenCalledWith(expect.objectContaining({ chainId: 84532, projectId: "9", transactionHash: HASH }));
  const after = await store.getIntent(intent.id);
  expect(after?.status).toBe("deployed");
  expect(after?.deploys[0]).toMatchObject({ status: "confirmed", transactionHash: HASH, bundleUuid: BUNDLE });
});

test("worker marks remaining chains failed when the lane stops early", async () => {
  const store = new MemoryStore();
  const { intent } = await store.createIntent(newIntent({ chainIds: [84532, 421614] }), limits);
  await store.queueDeploys(intent.id, [84532, 421614], "browser:x", 10n);
  const lane: DeployLane = { deploy: vi.fn(async (_i, _c, report) => { await report.failed(84532, "boom"); }) };
  await createSponsorWorker({ store, verifier: { verify: vi.fn() }, lane, policy }).runOnce();
  const after = await store.getIntent(intent.id);
  expect(after?.deploys.map((d) => [d.status, d.error])).toEqual([["failed", "boom"], ["failed", "not attempted: an earlier chain failed"]]);
});

test("worker records a verifier rejection as a failed row", async () => {
  /* lane reports confirmed; verifier.verify rejects with DeploymentVerificationError("bad"); expect the row failed with "bad" and no deployment recorded */
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/sponsor/worker.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement chain.ts and worker.ts**

```ts
export function createSponsorWorker({ store, verifier, lane, policy, leaseSeconds = 900 }) {
  let running = false; let stopped = false; let pending = false;

  async function runOnce() {
    const claims = await store.claimQueuedDeploys(leaseSeconds, 5);
    for (const { intentId, chainIds } of claims) {
      const intent = await store.getIntent(intentId);
      if (!intent) continue;
      const done = new Set<number>();
      const report: LaneReport = {
        sent: (chainId, transactionHash, bundleUuid) => store.updateDeploy(intentId, chainId, { status: "sent", transactionHash, bundleUuid }),
        confirmed: async (chainId, transactionHash, projectId, spentWei) => {
          try {
            const call = intent.envelope.deploymentCalls.find((c) => c.chainId === chainId)!;
            await verifier.verify({ chainId, projectId, transactionHash, deploymentVersion: intent.envelope.deploymentVersion, call });
            await store.recordDeployment(intentId, { chainId, projectId, transactionHash });
            await store.updateDeploy(intentId, chainId, { status: "confirmed", transactionHash, spentWei });
          } catch (error) {
            await store.updateDeploy(intentId, chainId, { status: "failed", transactionHash, error: error instanceof Error ? error.message : String(error) });
          }
          done.add(chainId);
        },
        failed: async (chainId, error) => { await store.updateDeploy(intentId, chainId, { status: "failed", error }); done.add(chainId); },
      };
      try { await lane.deploy(intent, chainIds, report); }
      catch (error) { const first = chainIds.find((c) => !done.has(c)); if (first !== undefined) await report.failed(first, error instanceof Error ? error.message : String(error)); }
      for (const c of chainIds) if (!done.has(c)) await store.updateDeploy(intentId, c, { status: "failed", error: "not attempted: an earlier chain failed" });
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

`recordDeployment` throws `ConflictError` when another sender already deployed that chain; the `confirmed` handler turns that into a failed row with the conflict message, which is the "one sender per intent" refusal after the fact. The lease is 15 minutes because a Relayr bundle can take several minutes to execute across chains.

- [ ] **Step 4: Run, commit**

Run: `npx vitest run test/sponsor && npx tsc --noEmit`

```bash
git add src/sponsor/chain.ts src/sponsor/worker.ts src/deploymentVerifier.ts test/sponsor/worker.test.ts
git commit -m "Add the sponsored deploy worker

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Relayr lane for both network families

**Files:**
- Create: `extensions/jbcenter/src/sponsor/relayr.ts`
- Modify: `extensions/jbcenter/src/rest/sponsorship/provider.ts` (add `parseFamilyQuote`; export `parseStatus` if it is not already exported)
- Test: `extensions/jbcenter/test/sponsor/relayr.test.ts`

**Interfaces:**
- Consumes: `SponsorshipChain` (`src/rest/sponsorship/chain.ts`: `prepare(catalog, call, account, stepIndex, deadline)`, `signed(request, signature, preceding)`; it has no mainnet gate), `RelayrProvider` (`create`, `status`; one API origin for both families), `FORWARD_REQUEST_TYPES`, `RELAYR_MAINNET_CHAINS`, `RELAYR_TESTNET_CHAINS`, `verifyRelayrPaymentEvent` (`paymentContract.ts`), the `ContractCatalog` from `getContractCatalog()` (`src/rest/contracts/catalog.ts`; its pinned manifest `src/rest/contracts/data/catalog.json` covers all eight chains), `RestRpc`.
- Produces (in `provider.ts`): `parseFamilyQuote(value: unknown, entries: RelayrEntry[], now: number, maximumValue: bigint): RelayrQuote` — like `parseQuote`, but the payment chains are whichever of `RELAYR_MAINNET_CHAINS` or `RELAYR_TESTNET_CHAINS` contains every entry's chain (the same family rule `parseIndependentQuoteBinding` already applies), failing `RELAYR_INVALID_QUOTE` for a mixed set.
- Produces: `createRelayrLane(options: { chain: SponsorshipChain; catalog: ContractCatalog; provider: RelayrProvider; rpcUrls: Map<number, string>; signer: SponsorSigner; policy: SponsorPolicy; projectsAddress: Address; now?: () => number }): DeployLane`.

- [ ] **Step 1: Failing test**

Fake `chain` (`prepare` returns a `PreparedForwardRequest` fixture per chain with `message.from = signer.address`; `signed` asserts the signature recovers to `signer.address` using `recoverTypedDataAddress` and returns a `RelayrEntry`), fake `provider` (`create` returns a quote body with one `payment_info` on 8453 for `RELAYR_PAYMENT_ADDRESS`, calldata beginning `0x103903a7`; `status` returns hashes after two polls), fake RPC on 8453 for the prepayment tx and receipts.

```ts
test("relayr lane signs forward requests with the sponsor key, prepays, polls and reports", async () => {
  // run once with intent(8453, 10) and once with intent(84532, 11155420); the fake provider's payment_info chain follows the family
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
        const quote = parseFamilyQuote(await provider.create(entries), entries, now(), reservationWei(policy, chainIds.length));
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

`PROJECTS_ABI` and `CREATE_TOPIC` come from `src/sponsor/chain.ts` (Task 5). `parseFamilyQuote` rejects any quote above the fourth argument, which is how the reservation cap is enforced. Relayr executes the forwarder, so the top-level `to` is the forwarder and the verifier's trace path handles it; Task 3 configured every chain, and the Dwellir upstreams serve `debug_traceTransaction` on testnets as well as mainnets (confirm on Base Sepolia during Task 14 before relying on it).

- [ ] **Step 4: Run, commit**

Run: `npx vitest run test/sponsor && npx tsc --noEmit`

```bash
git add src/sponsor/relayr.ts src/rest/sponsorship/provider.ts test/sponsor/relayr.test.ts
git commit -m "Deploy sponsored intents through Relayr on both families

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Wire the sponsor into the process, env and docs

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
  const lane = createRelayrLane({ chain: new SponsorshipChain(restRpc, DEFAULT_SPONSORSHIP_POLICY), catalog, provider: new RelayrProvider(), rpcUrls, signer, policy, projectsAddress: PROJECTS });
  sponsor = createSponsorWorker({ store, verifier, lane, policy });
}
```

`upstreams` is the Dwellir map already built in `index.ts`; `catalog` is `getContractCatalog()` and `restRpc` is the REST runtime's RPC (`src/rest/runtime.ts` builds both; hoist or re-create them so they are in scope). `DEFAULT_SPONSORSHIP_POLICY.allowedChainIds` is only enforced by `RelayrSponsorshipService`, not by `SponsorshipChain`, so the same chain helper serves testnets. Pass `...(sponsor ? { sponsor } : {})` into `createApp`. Call `sponsor?.stop()` in the shutdown handler. Export `PROJECTS` from `deploymentVerifier.ts` instead of duplicating.

- [ ] **Step 2: Docs**

`.env.example`: add the sponsor block with every variable from Global Constraints plus `SPONSOR_SIGNER_KEY=` (blank) and one comment line each. README: state under "Publish an intent" that a published intent is firm (no edit, replace or withdraw); add a `POST /v1/intents/:id/deploy` section with request and response examples copied from the tests; add the per-chain `deploys` field to "Read and search"; list the sponsor env vars under "Production configuration" with the note that the sponsor key funds every sponsored chain plus the Relayr payment chain. `src/llms.ts`: add the route.

- [ ] **Step 3: Full check**

Run: `npm run check && npx tsc --noEmit && npx vitest run test/app.test.ts test/sponsor test/deploymentVerifier.test.ts test/intent.test.ts`
Expected: PASS. `npm run check` is the required-tests gate; if it names a missing test for a new module, add it.

- [ ] **Step 4: Commit and open the PR**

```bash
git add src/index.ts .env.example README.md src/llms.ts
git commit -m "Run the intent sponsor and document the routes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
gh pr create --title "Intent projects: lifecycle, sponsored deploys" --body "..."  # body ends with the attribution line
```

---

### Task 8: SDK client: deploy request, deploy status, sponsorable chains

**Files:**
- Modify: `juice-sdk-connect/packages/core/src/jbcenter.ts`
- Test: `juice-sdk-connect/packages/core/src/jbcenter.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type JBCenterIntentDeploy = { chainId: number; status: "queued" | "sent" | "confirmed" | "failed"; transactionHash: Hex | null; bundleUuid: string | null; error: string | null; createdAt: string; updatedAt: string };
  // JBCenterIntent gains: deploys: JBCenterIntentDeploy[]
  export const JBCENTER_SPONSORED_CHAIN_IDS: readonly number[]; // [10, 8453, 42161, 11155111, 11155420, 84532, 421614]
  export function isSponsorable(chainIds: readonly number[]): boolean;
  class JBCenterClient { requestDeploy(intentId: string, options?): Promise<{ deploys: JBCenterIntentDeploy[] }>; }
  ```

- [ ] **Step 1: Failing tests** (same `jsonResponse` and `fetchMock` conventions as the existing file)

```ts
test("requestDeploy returns the queued rows", async () => {
  const deploys = [{ chainId: 84532, status: "queued", transactionHash: null, bundleUuid: null, error: null, createdAt: "2026-09-21T00:00:00.000Z", updatedAt: "2026-09-21T00:00:00.000Z" }];
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ deploys }, { status: 202 }));
  await expect(createJBCenterClient({ fetch: fetchMock }).requestDeploy(intent().id)).resolves.toEqual({ deploys });
});

test("sponsorable chain sets", () => {
  expect(isSponsorable([8453, 10])).toBe(true);
  expect(isSponsorable([1, 8453])).toBe(false);
  expect(isSponsorable([])).toBe(false);
});

Also update the `intent()` fixture with `deploys: []` and assert `getIntent` accepts a non-empty `deploys` list and rejects a malformed deploy row.

- [ ] **Step 2: Run to verify they fail**

Run: `cd juice-sdk-connect/packages/core && npx vitest run src/jbcenter.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Extend the types as above. Extend `isIntent` to validate `deploys` with a new `isIntentDeploy` guard. Add:

```ts
export const JBCENTER_SPONSORED_CHAIN_IDS = Object.freeze([10, 8453, 42161, 11155111, 11155420, 84532, 421614]);
export function isSponsorable(chainIds: readonly number[]): boolean {
  return chainIds.length > 0 && chainIds.every((id) => JBCENTER_SPONSORED_CHAIN_IDS.includes(id));
}
```

Client methods, using the private `fetchJson`:

```ts
requestDeploy(intentId: string, options?: JBCenterRequestOptions): Promise<{ deploys: JBCenterIntentDeploy[] }> {
  return this.fetchJson(`v1/intents/${encodeURIComponent(intentId)}/deploy`, { method: "POST" }, isDeployResponse, options);
}
```

- [ ] **Step 4: Run, commit**

Run: `npx vitest run src/jbcenter.test.ts src/publicSurface.test.ts && npm run type-check`

```bash
git add packages/core/src/jbcenter.ts packages/core/src/jbcenter.test.ts packages/core/src/publicSurface.test.ts
git commit -m "Add sponsored deploy calls to the Center client

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: SDK launch-calldata decoder

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
git commit -m "Decode an intent's launch calldata into a project shell

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: SDK search merger and route helpers

**Files:**
- Create: `juice-sdk-connect/packages/core/src/jbcenter/merge.ts`
- Test: `juice-sdk-connect/packages/core/src/jbcenter/merge.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type JBCenterIntentRow = { undeployed: true; intentId: string; name: string; tagline: string | null; logoUri: string | null; owner: Address | null; chainIds: number[]; createdAt: number /* unix seconds */ };
  export function intentRow(item: JBCenterSearchItem): JBCenterIntentRow;
  export function mergeSearch<T extends { createdAt: number }>(rows: readonly T[], items: readonly JBCenterSearchItem[]): (T | JBCenterIntentRow)[]; // newest first
  export function intentPath(intentId: string): string; // `/intent/${intentId}`
  export function deployedChains(intent: JBCenterIntent): Record<number, string>; // chainId → projectId from intent.deployments
  export function isFullyDeployed(intent: JBCenterIntent): boolean;
  ```

- [ ] **Step 1: Failing tests**

```ts
test("mergeSearch interleaves by creation time, newest first, and flags undeployed intents", () => {
  const rows = [{ id: "a", createdAt: 100 }, { id: "b", createdAt: 300 }];
  const items = [{ ...searchItem, intentId: "d", createdAt: "1970-01-01T00:03:20.000Z" }]; // 200s
  expect(mergeSearch(rows, items).map((r) => ("undeployed" in r ? r.intentId : r.id))).toEqual(["b", "d", "a"]);
  expect(mergeSearch(rows, items)[1]).toMatchObject({ undeployed: true, createdAt: 200 });
});
test("intentPath and deployedChains", () => {
  expect(intentPath("x")).toBe("/intent/x");
  expect(deployedChains({ ...intent(), deployments: [{ chainId: 8453, projectId: "12", transactionHash: hash, createdAt: "" }] })).toEqual({ 8453: "12" });
  expect(isFullyDeployed({ ...intent(), envelope: { ...intent().envelope, chainIds: [8453, 10] }, deployments: [{ chainId: 8453, projectId: "12", transactionHash: hash, createdAt: "" }] })).toBe(false);
});
```

- [ ] **Step 2: Run to verify they fail**, then **Step 3: Implement** (a stable sort by `createdAt` descending; `intentRow` converts the ISO string with `Math.floor(Date.parse(createdAt) / 1000)`), **Step 4: Run, commit**

```bash
git add packages/core/src/jbcenter/merge.ts packages/core/src/jbcenter/merge.test.ts packages/core/src/jbcenter.ts
git commit -m "Merge undeployed Center intents into project lists

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: SDK `ensureDeployed`

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

### Task 12: SDK public surface, coverage and release

**Files:**
- Modify: `juice-sdk-connect/packages/core/src/index.ts`, `src/publicSurface.test.ts`, `package.json` (version bump to 2.7.0), `README.md` (a "Intent projects" section)

- [ ] **Step 1:** Add every new export to `publicSurface.test.ts` (`decodeDeploymentCall`, `mergeSearch`, `intentRow`, `intentPath`, `deployedChains`, `isFullyDeployed`, `ensureDeployed`, `EnsureDeployedError`, `isSponsorable`, `JBCENTER_SPONSORED_CHAIN_IDS`).
- [ ] **Step 2:** Run `npx vitest run --coverage` and confirm every new file clears the global floors (95 statements, 95 lines, 92 functions, 82 branches). Add cases for any uncovered branch.
- [ ] **Step 3:** README section: publish, `ensureDeployed` usage, the "one sender per intent" rule and the `/intent/<id>` route convention. State that a published intent is firm and cannot be edited or withdrawn.
- [ ] **Step 4:** Commit and open the release PR (the release run enforces 100 percent line coverage; check `vitest run --coverage` output before pushing).

```bash
git add packages/core/src/index.ts packages/core/src/publicSurface.test.ts packages/core/package.json packages/core/README.md
git commit -m "Release the project intents SDK surface

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: `jb-project-intents` skill

**Files:**
- Create: `skills/plugins/juicebox-v6/skills/jb-project-intents/SKILL.md`
- Modify: `skills/plugins/juicebox-v6/README.md` (category table)

- [ ] **Step 1: Write the skill**

Frontmatter per `CONVENTIONS.md`:

```yaml
---
name: jb-project-intents
description: |
  Create, list, render and deploy Juicebox V6 project intents stored on juicebox.center.
  Use when: (1) building a create flow that should not need a transaction,
  (2) merging undeployed intents into project lists and search,
  (3) rendering a project page for an undeployed intent, (4) inserting the
  deploy-first step before any write against one.
metadata:
  version: "6.0.0"
---
```

Body sections, tables over prose: the intent envelope and signing message; the lifecycle (publish, then deployed; a published intent is firm, with no edit or withdraw); the one-sender rule with the salt explanation; sponsored chains and the deploy route; the `/intent/<id>` route and the redirect rule; `decodeDeploymentCall` shells per flavor; `mergeSearch`; `ensureDeployed` at the write chokepoint; and a trailing `## Common mistakes` (baking `mustStartAtOrAfter: 0` into stage 1 of an intent; deploying some chains yourself and asking Center for the rest; showing undeployed intents in Trending; calling them intents in copy, which invites editing; treating the intent signature as transaction approval).

- [ ] **Step 2:** Run `./build-skills.sh` and confirm `dist/jb-project-intents.zip` exists. Add the row to the README category table.
- [ ] **Step 3: Commit**

```bash
git add skills/jb-project-intents/SKILL.md README.md
git commit -m "Add the jb-project-intents skill

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Rehearsal on Center dev

**Files:** none (ops).

- [ ] **Step 1:** Generate a sponsor key, fund it on Base Sepolia and OP Sepolia (0.01 ETH each; Relayr's testnet prepayment lands on one of them), set `SPONSOR_SIGNER_KEY` and the policy vars on the Railway `dev` environment of `juice-center`, deploy.
- [ ] **Step 2:** With the SDK, publish a two-chain testnet intent from a fresh EOA, call `requestDeploy`, poll `getIntent` until both rows are `confirmed` with the same `bundleUuid`, and confirm both projects exist on chain with the same owner, the expected ruleset start, and matching sucker addresses. Confirm the recorded deployments came through the trace path on a testnet. Record the intent id, bundle id and both tx hashes in `tasks/todo.md`.
- [ ] **Step 3:** Publish a single-chain Base mainnet intent with a real owner, fund the sponsor key on Base with 0.002 ETH, `requestDeploy`, confirm Relayr executes and Center records the deployment through the trace path.
- [ ] **Step 4:** Confirm `GET /v1/search` no longer lists either intent and that `POST /v1/intents/:id/deploy` on a deployed intent returns 200 with the rows.

---

## Follow-on plans (write after Task 12 fixes the SDK surface)

1. `2026-09-XX-project-intents-phase-2.md`: juicebox.money and revnet.money together. Create step "Publish" (absolute stage-1 start, `createJBCenterDeploymentCall` from `buildLaunchRequest` / `parseDeployData`, `publishIntent`, clear local draft, route to `/intent/<id>`); `/intent/[id]` route rendering the existing project page from `decodeDeploymentCall` plus `shellProject` / `getProjectFallback`, redirect once deployed; `mergeSearch` in `/api/search`, `/api/search-projects`, New lists; `ensureDeployed` inside `useSafeTx` and `useWriteContract` as the first TxSteps step with the existing self-paid launch pipelines as `selfPaid`.
2. `2026-09-XX-project-intents-phase-3.md`: homerun (`buildFundLaunch`, `useSafeTx`), succulent (`pageLaunchTx`, `tx.ts`), JBSticky (`deployStickyFor`; confirm the deployer is permissionless for a non-owner caller and trusts the forwarder before starting), juicescan render and search.
3. `2026-09-XX-project-intents-phase-4.md`: eth.shop, ethis.money, JBChat read-side rendering of intents.

## Self-review notes

- Spec coverage: publish limits (T2), sponsored deploy policy and route (T4), one Relayr lane for both families (T5, T6), one-sender refusal (T4 checks `status === "undeployed"`; the lane stops at the first failed chain; `recordDeployment` conflicts fail the row), fast-path verification and testnet verifier configs (T3), SDK decoder, merger, `ensureDeployed`, route convention (T9 to T11), skill (T13), rehearsal (T14). Client work is deferred to the follow-on plans by design.
- Known ceiling: the worker runs in every Center replica; `claimQueuedDeploys` relies on the lease and `SKIP LOCKED` semantics. If Center ever runs more than one replica, add `pg_advisory_xact_lock(hashtext('sponsor-worker'))` around the claim.
