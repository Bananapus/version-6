# Intent Relay — SDK 2.10.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@bananapus/nana-sdk-core/jbcenter` deploys an intent one chosen chain at a time: Center pays for the chains it sponsors, the visitor pays for the ones it does not, and every chain keeps Center's sponsor as its on-chain sender. Released as 2.10.0.

**Architecture:** Three additions, no new module. `jbcenter.ts` gains the per-chain sponsorability split (`sponsorableChains`, `unsponsoredChains`), a `chainIds` subset on `requestDeploy`, and `requestRelay(intentId, chainId)` — a strictly validated read of Center's signed forward request, returned with wei and gas as `bigint`. `ensureDeployed.ts` gains `chainIds` (the run's chains) and `relayPaid` (the caller's sender for the chains Center does not sponsor): it asks Center to queue the sponsored chains, walks the unsponsored ones through `requestRelay` → `relayPaid` → `recordDeployment`, and then polls until the run's chains have landed. `selfPaid` is untouched and keeps its meaning.

**Tech Stack:** Node 22.23.1 (`.nvmrc`), npm 10.9.8, TypeScript 5.4 (`strict`, `noUnusedLocals`, `NodeNext`), viem 2.37.5, vitest 3.2 with v8 coverage, turbo, Changesets, prettier 3.

**Spec:** `/Users/jango/Documents/jb/v6/evm/docs/superpowers/specs/2026-09-22-homerun-preview-create-and-per-chain-deploy-design.md` — **section 3 (SDK) only**. Sections 1 and 2 are Center's and are already the contract this consumes; section 4 is Homerun's; section 5 is out of scope.

**Center's contract, as sections 1 and 2 state it (consumed, never changed here):**

- `POST /v1/intents/:id/relay` with `{ chainId }` answers
  `{ chainId, to, data, value, gas, deadline, setup }` where `value` and `gas` are decimal
  strings of wei and gas units, `deadline` is unix seconds, and `setup` is an array of
  `{ to, data, value: "0" }` — plain calls the visitor sends first, from their own wallet, when
  that chain has Safe setup calls. `to` is the canonical ERC-2771 forwarder and `data` is an
  `execute(request)` call the sponsor signed, so the launch's `_msgSender()` is still Center's
  sponsor. Nothing is stored and nothing is paid until someone sends it. Two visitors who ask
  for the same chain get the same forwarder nonce; the second transaction reverts and the
  caller asks again.
- `POST /v1/intents/:id/deploy` takes an optional `{ chainIds }`. Every id must be in the
  intent, sponsored, and undeployed; ids already queued or sent come back as they are. Omitted,
  it means every sponsored, undeployed chain.
- `POST /v1/intents/:id/deployments` is unchanged and still requires `{ chainId, projectId,
  transactionHash }`.

**Repo:** `https://github.com/Bananapus/juice-sdk-v4`. Local worktree:
`/Users/jango/Documents/jb/v6/evm/extensions/sdk-relay`, already on branch `feat/intent-relay`
off `main` at `a60c864`. Package under change: `packages/core` = `@bananapus/nana-sdk-core`,
currently 2.9.0.

## Global Constraints

- **Never write the word "draft"** — not in code, comments, tests, README, changeset, commit
  messages, or the PR body.
- **No retrospective comments.** Comments explain the code as it stands, never what it used to
  do, what was fixed, or what a review said. No "now also", no "previously".
- **No emoji** anywhere in code, tests, docs, or commit messages. The PR body's single trailer
  line is the only exception, and it is quoted verbatim in Task 5.
- **Framework-free.** Everything added here is plain TypeScript over viem and `fetch`. No React,
  no wallet, no chain reads.
- **Wallet boundary — state it and keep it.** The SDK never sends a transaction. `relayPaid` is
  a caller-supplied function: it receives the relay request the package fetched and returns the
  deployment the caller observed, so no wallet API is called inside this package.
  `scripts/check-wallet-boundaries.mjs` walks every non-test file under `packages/core/src` and
  flags any call whose callee or member name is in its API set (`sendTransaction`,
  `sendCalls`, `signMessage`, `signTypedData`, `writeContract`, `request`, …) and any signing
  RPC method string (`eth_sendTransaction`, `personal_sign`, …). Nothing in this plan calls any
  of them, and `test/wallet-boundaries.json` has no site in `jbcenter.ts` or `ensureDeployed.ts`
  — do not add one. Its sites are keyed `file:line:api`, so do not shift a line in
  `packages/core/src/safe.ts`.
- **Import-cycle rule** (from `ensureDeployed.ts`'s own comment): `jbcenter.ts` re-exports its
  submodules, so the two sides form a cycle under CJS. `ensureDeployed.ts` may name values from
  `../jbcenter.js` in its import statement, but every **read** of one must happen inside a
  function body — a top-level read resolves before `jbcenter.ts` finishes evaluating.
  `sponsorableChains` and `unsponsoredChains` follow `isSponsorable` exactly: imported at the
  top, called only from inside functions.
- **Center mirror, with one documented tightening.** `requestRelay` validates Center's answer
  strictly: the `chainId` echoed must be the one asked for, `to` an address, `data` at least
  four bytes, `value` and `gas` decimal integer strings (`gas` non-zero), `deadline` a positive
  safe integer, and `setup` an array of `{ to, data, value }` in the same shapes. The
  tightening: the SDK requires `setup` to be present, even when empty, because Center's
  contract always sends it. If Center ever omits it, raise it with Center rather than loosening
  here.
- **Coverage.** `packages/core/vitest.config.ts` enforces global floors statements 95 /
  branches 82 / functions 92 / lines 95, plus per-file 100% entries for six modules.
  `src/jbcenter.ts` and `src/jbcenter/ensureDeployed.ts` have no per-file entry; every new
  branch in them must still be covered by its own test so the global floors do not drop. No new
  per-file entry is added by this plan.
- **Prettier.** Run `npm run format` (root: `prettier --write "**/*.{ts,tsx,md}"`) before every
  commit. `npm run format:ratchet` fails on any file that is newly unformatted and not in
  `test/format-debt.json`; never add a file to that fixture.
- **Node 22 via nvm.** Run `nvm use` in the worktree (reads `.nvmrc` = `22.23.1`) before any npm
  command, and confirm `npm --version` prints `10.9.8` — CI hard-asserts it.
- **Repo commands** (root `package.json`, mirrored by `.github/workflows/ci.yml`): tests
  `npm run test`, coverage `npm run test:coverage`, types `npm run type-check`, build
  `npm run build`, dead code `npm run dead-code:check`, package budget `npm run check:package`,
  wallet gate `npm run wallet:check`, format gate `npm run format:ratchet`, whole gate
  `npm run check`. `npm run check` also runs `protocol:check`, which passes without
  `PROTOCOL_DEPLOYMENTS_DIR` (it prints a note).
- **Stage by explicit path.** Every `git add` in this plan names each file. Never `git add -A`,
  `git add .`, or `git commit -a`.
- **Commit trailer.** Every commit message ends with a blank line and then:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`

## Decisions already settled

- `isSponsorable` keeps its meaning exactly — "every chain in the list, and at least one". It is
  re-expressed in terms of `unsponsoredChains` and stays pinned by its existing test.
- `sponsorableChains(chainIds)` and `unsponsoredChains(chainIds)` return the matching ids **in
  the order given**, without de-duplicating: an intent's `chainIds` are already unique, and a
  helper that silently reorders would make a deploy body hard to read.
- **Where `relayPaid` gets its `projectId`.** `client.recordDeployment` requires
  `{ chainId, projectId, transactionHash }`, and the SDK has no way to learn a `projectId`
  without reading a receipt and decoding a log. `ensureDeployed` obtains it today for `selfPaid`
  by having the caller return it: `selfPaid(calls)` resolves to `JBCenterDeploymentInput[]`.
  `relayPaid` reuses exactly that. It receives the relay request, sends it (setup calls first),
  waits for the receipt it already has to wait for, and resolves to one
  `JBCenterDeploymentInput` — the transaction hash plus the `projectId` that receipt carried.
  `ensureDeployed` checks the `chainId` it returns against the chain it asked for, records it,
  and reports a `relay-paid` step. The rejected alternative was for the SDK to fetch the receipt
  through Center's read-only RPC and decode the project's mint log: that adds a network read, an
  address table and a log ABI to a module that has neither, for data the caller already holds.
- Within one run, a chain is never offered to both senders: `relayPaid` and `selfPaid` together
  are refused up front, and the relay lane only ever walks `unsponsoredChains` of the run.
- `selfPaid` is unchanged in behavior and is now documented as the option that breaks
  cross-chain pairing for a deployer that scopes its token and sucker salt to the sender.
- Minor bump to 2.10.0. The package budget is raised only if a measurement demands it.

---

## File map

**Modify**
- `packages/core/src/jbcenter.ts` — `JBCenterRelayCall` and `JBCenterRelayRequest` types; an
  `isCalldata` helper `isDeploymentCall` also uses; `isDecimalString`, `isRelayCall` and the
  `relayRequest(chainId)` validator factory (the `rpcEnvelope(id)` pattern);
  `sponsorableChains`, `unsponsoredChains`, `isSponsorable` re-expressed; `requestDeploy` takes
  `chainIds`; `requestRelay` added after it.
- `packages/core/src/jbcenter.test.ts` — the split helpers, the subset deploy body, and the
  `requestRelay` accept and rejection tables.
- `packages/core/src/jbcenter/ensureDeployed.ts` — `chainIds` and `relayPaid` options, the
  `relay-paid` step status, `runChains`, `isRunDeployed`, the run-scoped poll and self-paid
  filter, and `runRelayPaid`.
- `packages/core/src/jbcenter/ensureDeployed.test.ts` — the mixed run, the subset run, and the
  refusal table.
- `packages/core/src/publicSurface.test.ts` — assert the two new exported functions.
- `README.md` (repo root; `packages/core` has no README). The `### Project intents` subsection
  starts at line 74; the sender paragraph at line 78; the helper table at line 205.
- `scripts/check-package-budgets.mjs` — only if a measurement demands it (Task 5).

**Create**
- `.changeset/intent-relay.md`

---

### Task 1: Per-chain sponsorability and a subset deploy

**Files:**
- Modify: `packages/core/src/jbcenter.ts` (the `isSponsorable` block at lines 217-225; the
  `requestDeploy` method at lines 714-723)
- Test: `packages/core/src/jbcenter.test.ts` (beside the existing "sponsorable chain sets" test
  at line 427 and the "requestDeploy returns the queued rows" test at line 400)
- Test: `packages/core/src/publicSurface.test.ts`

**Interfaces:**
- Consumes: `JBCENTER_SPONSORED_CHAIN_IDS`, already exported.
- Produces, for Task 3 and for every client:
  - `export function sponsorableChains(chainIds: readonly number[]): number[]`
  - `export function unsponsoredChains(chainIds: readonly number[]): number[]`
  - `requestDeploy(intentId: string, options?: JBCenterRequestOptions & { chainIds?: readonly number[] }): Promise<{ deploys: JBCenterIntentDeploy[] }>`
  - `isSponsorable(chainIds: readonly number[]): boolean`, unchanged in meaning.

- [ ] **Step 0: Set the toolchain up**

```bash
cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-relay
nvm use
npm --version   # must print 10.9.8
npm ci
git status --short   # must be empty; branch is feat/intent-relay
```

- [ ] **Step 1: Write the failing tests**

In `packages/core/src/jbcenter.test.ts`, add `sponsorableChains` and `unsponsoredChains` to the
`./jbcenter.js` import list, and append these to the `describe("JB Center client", …)` block:

```ts
  test("splits a chain list into the sponsored and the unsponsored", () => {
    expect(sponsorableChains([1, 8453, 10, 137])).toEqual([8453, 10]);
    expect(unsponsoredChains([1, 8453, 10, 137])).toEqual([1, 137]);
    expect(sponsorableChains([])).toEqual([]);
    expect(unsponsoredChains([])).toEqual([]);
    // The order given is the order returned, so a deploy body reads like the
    // intent it came from.
    expect(sponsorableChains([42161, 8453])).toEqual([42161, 8453]);
  });

  test("requestDeploy sends no body when it asks for every chain", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ deploys: [] }, { status: 202 }));

    await createJBCenterClient({ fetch: fetchMock }).requestDeploy(intent().id);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  test("requestDeploy names a subset of chains in its body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ deploys: [] }, { status: 202 }));

    await createJBCenterClient({ fetch: fetchMock }).requestDeploy(
      intent().id,
      { chainIds: [8453, 10] },
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://juicebox.center/v1/intents/${intent().id}/deploy`,
    );
    expect(init.body).toBe(JSON.stringify({ chainIds: [8453, 10] }));
    expect(new Headers(init.headers).get("Content-Type")).toBe(
      "application/json",
    );
  });
```

In `packages/core/src/publicSurface.test.ts`, next to `expect(sdk.isSponsorable)`:

```ts
    expect(sdk.sponsorableChains).toBeTypeOf("function");
    expect(sdk.unsponsoredChains).toBeTypeOf("function");
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-relay/packages/core && npx vitest run src/jbcenter.test.ts -t "sponsored and the unsponsored"`
Expected: FAIL — `sponsorableChains` is not exported by `./jbcenter.js`.

- [ ] **Step 3: Write the helpers and the subset body**

In `packages/core/src/jbcenter.ts`, replace the `isSponsorable` function (line 221) with:

```ts
/** The chains in the list JB Center's sponsor covers, in the order given. */
export function sponsorableChains(chainIds: readonly number[]): number[] {
  return chainIds.filter((id) => JBCENTER_SPONSORED_CHAIN_IDS.includes(id));
}

/** The chains in the list JB Center's sponsor does not cover. */
export function unsponsoredChains(chainIds: readonly number[]): number[] {
  return chainIds.filter((id) => !JBCENTER_SPONSORED_CHAIN_IDS.includes(id));
}

/** Whether JB Center's sponsor covers every chain in a non-empty list. */
export function isSponsorable(chainIds: readonly number[]): boolean {
  return chainIds.length > 0 && unsponsoredChains(chainIds).length === 0;
}
```

and replace the `requestDeploy` method with:

```ts
  /**
   * Asks JB Center's sponsor to deploy the intent. `chainIds` narrows the
   * request to those chains; omitted, it means every sponsored chain that has
   * no deployment yet. Chains already queued or sent come back as they are.
   */
  requestDeploy(
    intentId: string,
    options?: JBCenterRequestOptions & { chainIds?: readonly number[] },
  ): Promise<{ deploys: JBCenterIntentDeploy[] }> {
    return this.fetchJson(
      `v1/intents/${encodeURIComponent(intentId)}/deploy`,
      options?.chainIds
        ? {
            method: "POST",
            body: JSON.stringify({ chainIds: options.chainIds }),
          }
        : { method: "POST" },
      isDeployResponse,
      options,
    );
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-relay/packages/core && npx vitest run src/jbcenter.test.ts src/publicSurface.test.ts`
Expected: PASS — both suites, including the existing "sponsorable chain sets" and "requestDeploy
returns the queued rows" tests, which must not need editing.

- [ ] **Step 5: Type-check and format**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-relay && npm run type-check && npm run format && npm run format:ratchet`
Expected: no type errors; prettier reports the touched files as written or unchanged; the ratchet
prints no unexpected file.

- [ ] **Step 6: Commit**

```bash
cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-relay
git add packages/core/src/jbcenter.ts \
  packages/core/src/jbcenter.test.ts \
  packages/core/src/publicSurface.test.ts
git commit -m "$(cat <<'MSG'
Read sponsorability per chain and deploy a subset

sponsorableChains and unsponsoredChains split a chain list the way an
intent with one unsponsored chain needs; isSponsorable still means every
chain. requestDeploy names the chains it wants, so the sponsor's lane
takes the free ones while another sender covers the rest.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: `requestRelay`

**Files:**
- Modify: `packages/core/src/jbcenter.ts` (types beside `JBCenterDeploymentInput` at line 191;
  `isCalldata` beside `isDeploymentCall` at line 372; the client method after `requestDeploy`)
- Test: `packages/core/src/jbcenter.test.ts`

**Interfaces:**
- Consumes from Task 1: nothing. Consumes from the file as it stands: `record`, `isAddress`,
  `Validator<T>`, `fetchJson`, and the `rpcEnvelope(id)` precedent for a validator that closes
  over a request value.
- Produces, for Task 3 and for every client:

```ts
export type JBCenterRelayCall = { to: Address; data: Hex; value: bigint };

export type JBCenterRelayRequest = {
  chainId: number;
  to: Address;
  data: Hex;
  value: bigint;
  gas: bigint;
  deadline: number;
  setup: JBCenterRelayCall[];
};
```

  and `requestRelay(intentId: string, chainId: number, options?: JBCenterRequestOptions): Promise<JBCenterRelayRequest>`,
  which throws `TypeError` for a chain id that is not a positive safe integer, exactly as `rpc`
  does.

- [ ] **Step 1: Write the failing tests**

In `packages/core/src/jbcenter.test.ts`, append to the `describe("JB Center client", …)` block
(the file already imports `createJBCenterClient`, `vi`, and defines `jsonResponse`, `intent` and
`address`):

```ts
  const forwarder = `0x${"78".repeat(20)}` as const;

  function relayBody(overrides: Record<string, unknown> = {}) {
    return {
      chainId: 1,
      to: forwarder,
      data: "0xabcdef01",
      value: "1000000000000000",
      gas: "2500000",
      deadline: 1_790_000_000,
      setup: [],
      ...overrides,
    };
  }

  test("requestRelay parses the signed forward request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        relayBody({
          setup: [{ to: address, data: "0x12345678", value: "0" }],
        }),
      ),
    );

    await expect(
      createJBCenterClient({ fetch: fetchMock }).requestRelay(intent().id, 1),
    ).resolves.toEqual({
      chainId: 1,
      to: forwarder,
      data: "0xabcdef01",
      value: 1_000_000_000_000_000n,
      gas: 2_500_000n,
      deadline: 1_790_000_000,
      setup: [{ to: address, data: "0x12345678", value: 0n }],
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://juicebox.center/v1/intents/${intent().id}/relay`,
    );
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ chainId: 1 }));
  });

  test("requestRelay refuses a chain id that is not a positive integer", async () => {
    const fetchMock = vi.fn();
    const client = createJBCenterClient({ fetch: fetchMock });

    await expect(client.requestRelay(intent().id, 0)).rejects.toBeInstanceOf(
      TypeError,
    );
    await expect(client.requestRelay(intent().id, 1.5)).rejects.toBeInstanceOf(
      TypeError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each<[string, Record<string, unknown>]>([
    ["another chain", { chainId: 10 }],
    ["no target", { to: "not-an-address" }],
    ["calldata shorter than a selector", { data: "0x1234" }],
    ["a value that is not decimal", { value: "0x10" }],
    ["a signed value", { value: "-1" }],
    ["a padded value", { value: "0100" }],
    ["no gas", { gas: "0" }],
    ["a fractional deadline", { deadline: 1.5 }],
    ["a deadline of zero", { deadline: 0 }],
    ["setup that is not an array", { setup: {} }],
    ["no setup at all", { setup: undefined }],
    ["a setup call with no target", { setup: [{ data: "0x12345678", value: "0" }] }],
    [
      "a setup call with a bad value",
      { setup: [{ to: address, data: "0x12345678", value: "zero" }] },
    ],
  ])("requestRelay rejects a response with %s", async (_label, overrides) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(relayBody(overrides)));

    await expect(
      createJBCenterClient({ fetch: fetchMock }).requestRelay(intent().id, 1),
    ).rejects.toMatchObject({
      status: 502,
      message: "JB Center returned an invalid response",
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-relay/packages/core && npx vitest run src/jbcenter.test.ts -t "requestRelay"`
Expected: FAIL — `client.requestRelay is not a function`.

- [ ] **Step 3: Write the types, the validator and the client method**

In `packages/core/src/jbcenter.ts`, after `export type JBCenterDeploymentInput = …` (line 191):

```ts
/** One call a relay request asks the sender to make before the launch. */
export type JBCenterRelayCall = {
  to: Address;
  data: Hex;
  value: bigint;
};

/**
 * The forward request JB Center's sponsor signed for a chain it does not
 * sponsor. The forwarder reports the sponsor as the sender, so a chain
 * deployed this way keeps the token and sucker addresses every sponsored
 * chain in the intent gets; whoever sends it supplies only gas and the
 * creation fee. `setup` runs first, from the same wallet, in order.
 */
export type JBCenterRelayRequest = {
  chainId: number;
  to: Address;
  data: Hex;
  /** Wei the forwarder requires with the call: the chain's creation fee. */
  value: bigint;
  gas: bigint;
  /** Unix seconds after which the forwarder refuses the request. */
  deadline: number;
  setup: JBCenterRelayCall[];
};
```

Beside the other validators (line 372), add `isCalldata` and use it from `isDeploymentCall`,
then the relay shapes:

```ts
function isCalldata(value: unknown): value is Hex {
  return typeof value === "string" && /^0x(?:[0-9a-f]{2}){4,}$/iu.test(value);
}

function isDecimalString(value: unknown): value is string {
  return typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value);
}

function isDeploymentCall(value: unknown): value is JBCenterDeploymentCall {
  return (
    record(value) &&
    Number.isSafeInteger(value.chainId) &&
    Number(value.chainId) > 0 &&
    isAddress(value.to) &&
    isCalldata(value.data)
  );
}

type RelayCallJson = { to: Address; data: Hex; value: string };

type RelayRequestJson = Omit<
  JBCenterRelayRequest,
  "value" | "gas" | "setup"
> & {
  value: string;
  gas: string;
  setup: RelayCallJson[];
};

function isRelayCall(value: unknown): value is RelayCallJson {
  return (
    record(value) &&
    isAddress(value.to) &&
    isCalldata(value.data) &&
    isDecimalString(value.value)
  );
}

/** Wei and gas cross the wire as decimal strings, so no precision is lost. */
function relayRequest(chainId: number): Validator<RelayRequestJson> {
  return (value: unknown): value is RelayRequestJson =>
    record(value) &&
    value.chainId === chainId &&
    isAddress(value.to) &&
    isCalldata(value.data) &&
    isDecimalString(value.value) &&
    isDecimalString(value.gas) &&
    value.gas !== "0" &&
    Number.isSafeInteger(value.deadline) &&
    Number(value.deadline) > 0 &&
    Array.isArray(value.setup) &&
    value.setup.every(isRelayCall);
}
```

Add the method immediately after `requestDeploy`:

```ts
  /**
   * The forward request JB Center's sponsor signed for one chain it does not
   * sponsor. Nothing is stored and nothing is paid until someone sends it.
   * Two callers who ask for the same chain get the same forwarder nonce, so
   * the second transaction reverts and the caller asks again.
   */
  async requestRelay(
    intentId: string,
    chainId: number,
    options?: JBCenterRequestOptions,
  ): Promise<JBCenterRelayRequest> {
    if (!Number.isSafeInteger(chainId) || chainId <= 0) {
      throw new TypeError("chainId must be a positive safe integer");
    }
    const body = await this.fetchJson(
      `v1/intents/${encodeURIComponent(intentId)}/relay`,
      { method: "POST", body: JSON.stringify({ chainId }) },
      relayRequest(chainId),
      options,
    );
    return {
      chainId: body.chainId,
      to: body.to,
      data: body.data,
      value: BigInt(body.value),
      gas: BigInt(body.gas),
      deadline: body.deadline,
      setup: body.setup.map((call) => ({
        to: call.to,
        data: call.data,
        value: BigInt(call.value),
      })),
    };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-relay/packages/core && npx vitest run src/jbcenter.test.ts`
Expected: PASS — the whole client suite, including every envelope test, which `isCalldata` must
leave behaving exactly as the inlined regex did.

- [ ] **Step 5: Check types, coverage, the wallet gate and format**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-relay && npm run type-check && npm run test:coverage && npm run wallet:check && npm run format && npm run format:ratchet`
Expected: no type errors; no coverage threshold failure; the wallet gate passes with no new
reviewed site; the ratchet prints no unexpected file.

- [ ] **Step 6: Commit**

```bash
cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-relay
git add packages/core/src/jbcenter.ts packages/core/src/jbcenter.test.ts
git commit -m "$(cat <<'MSG'
Read Center's signed forward request for a chain it will not pay for

requestRelay returns the forwarder call, its fee, its gas estimate, its
deadline and the setup calls that go first, with wei and gas as bigint.
The response is validated field by field, including that the chain it
echoes is the chain asked for.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: `ensureDeployed` runs a chosen set of chains, both senders

**Files:**
- Modify: `packages/core/src/jbcenter/ensureDeployed.ts`
- Test: `packages/core/src/jbcenter/ensureDeployed.test.ts`

**Interfaces:**
- Consumes from Task 1: `sponsorableChains`, `unsponsoredChains`, `isSponsorable`, and
  `requestDeploy(id, { chainIds, signal })`. From Task 2: `requestRelay(id, chainId, { signal })`
  and the `JBCenterRelayRequest` type. From the file as it stands: `deployedChains`,
  `recordDeployment`, `JBCenterDeploymentInput`.
- Produces:
  - `EnsureDeployedStep["status"]` gains `"relay-paid"`.
  - `EnsureDeployedOptions` gains
    `chainIds?: readonly number[]` and
    `relayPaid?: (request: JBCenterRelayRequest) => Promise<JBCenterDeploymentInput>`.
  - `ensureDeployed` keeps its signature and its return type `Promise<Record<number, string>>`.

The run's shape, stated once: `chainIds` names the chains this call covers and every id must be
one of the intent's own; omitted, the run is every chain in the intent, which is what every
caller before 2.10.0 gets. Inside the run, chains that already have a deployment are skipped,
`sponsorableChains` go to Center's lane and `unsponsoredChains` go to `relayPaid`. Center's lane
is queued first, in one request, so it works while the visitor is still signing; a signature the
visitor refuses therefore leaves queued rows a later run picks up rather than wasting them.

- [ ] **Step 1: Write the failing tests**

In `packages/core/src/jbcenter/ensureDeployed.test.ts`, extend the `../jbcenter.js` import with
`type JBCenterRelayRequest`, and append these to the `describe("ensureDeployed", …)` block:

```ts
  const FORWARDER = "0x0000000000000000000000000000000000007771" as const;

  function relayUrl(id = INTENT_ID) {
    return `https://juicebox.center/v1/intents/${id}/relay`;
  }

  function deploymentsUrl(id = INTENT_ID) {
    return `https://juicebox.center/v1/intents/${id}/deployments`;
  }

  function relayBody(chainId: number) {
    return {
      chainId,
      to: FORWARDER,
      data: "0xabcdef01",
      value: "1000000000000000",
      gas: "2500000",
      deadline: 1_790_000_000,
      setup: [],
    };
  }

  const RELAY_REQUEST: JBCenterRelayRequest = {
    chainId: 1,
    to: FORWARDER,
    data: "0xabcdef01",
    value: 1_000_000_000_000_000n,
    gas: 2_500_000n,
    deadline: 1_790_000_000,
    setup: [],
  };

  test("queues the sponsored chains and relays the one the visitor pays for", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ deploys: [deploy(8453, "queued")] }, { status: 202 }),
      )
      .mockResolvedValueOnce(jsonResponse(relayBody(1)))
      .mockResolvedValueOnce(
        jsonResponse({
          chainId: 1,
          projectId: "7",
          transactionHash: TX_HASH_1,
          createdAt: "2026-09-22T00:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          intent([1, 8453], {
            deploys: [deploy(8453, "confirmed", TX_HASH_2)],
            deployments: [
              {
                chainId: 1,
                projectId: "7",
                transactionHash: TX_HASH_1,
                createdAt: "",
              },
              {
                chainId: 8453,
                projectId: "55",
                transactionHash: TX_HASH_2,
                createdAt: "",
              },
            ],
          }),
        ),
      );
    const client = createJBCenterClient({ fetch: fetchMock });
    const onStep = vi.fn();
    const relayPaid = vi
      .fn()
      .mockResolvedValue({
        chainId: 1,
        projectId: "7",
        transactionHash: TX_HASH_1,
      });

    const promise = ensureDeployed({
      client,
      intent: intent([1, 8453]),
      relayPaid,
      onStep,
    });

    await vi.advanceTimersByTimeAsync(4_000);
    await vi.advanceTimersByTimeAsync(4_000);

    await expect(promise).resolves.toEqual({ 1: "7", 8453: "55" });
    expect(relayPaid).toHaveBeenCalledWith(RELAY_REQUEST);
    expect(fetchMock.mock.calls.map((args) => args[0])).toEqual([
      deployUrl(),
      relayUrl(),
      deploymentsUrl(),
      intentUrl(),
    ]);
    expect(
      JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string),
    ).toEqual({ chainIds: [8453] });
    expect(onStep.mock.calls.map((args) => args[0])).toEqual([
      { chainId: 1, status: "relay-paid", transactionHash: TX_HASH_1 },
      { chainId: 8453, status: "queued", transactionHash: undefined },
      { chainId: 8453, status: "confirmed", transactionHash: TX_HASH_2 },
    ]);
  });

  test("an all-unsponsored run never asks Center to deploy and never polls", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(relayBody(1)))
      .mockResolvedValueOnce(
        jsonResponse({
          chainId: 1,
          projectId: "7",
          transactionHash: TX_HASH_1,
          createdAt: "2026-09-22T00:00:00.000Z",
        }),
      );
    const client = createJBCenterClient({ fetch: fetchMock });
    const relayPaid = vi
      .fn()
      .mockResolvedValue({
        chainId: 1,
        projectId: "7",
        transactionHash: TX_HASH_1,
      });

    await expect(
      ensureDeployed({ client, intent: intent([1]), relayPaid }),
    ).resolves.toEqual({ 1: "7" });
    expect(fetchMock.mock.calls.map((args) => args[0])).toEqual([
      relayUrl(),
      deploymentsUrl(),
    ]);
  });

  test("limits the run to the chains it was given and returns when they land", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ deploys: [deploy(8453, "queued")] }, { status: 202 }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          intent([8453, 10], {
            deploys: [deploy(8453, "confirmed", TX_HASH_1)],
            deployments: [
              {
                chainId: 8453,
                projectId: "55",
                transactionHash: TX_HASH_1,
                createdAt: "",
              },
            ],
          }),
        ),
      );
    const client = createJBCenterClient({ fetch: fetchMock });

    const promise = ensureDeployed({
      client,
      intent: intent([8453, 10]),
      chainIds: [8453],
    });

    await vi.advanceTimersByTimeAsync(4_000);

    await expect(promise).resolves.toEqual({ 8453: "55" });
    expect(
      JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string),
    ).toEqual({ chainIds: [8453] });
  });

  test("skips a chain of the run that already has a deployment", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(relayBody(1)))
      .mockResolvedValueOnce(
        jsonResponse({
          chainId: 1,
          projectId: "7",
          transactionHash: TX_HASH_1,
          createdAt: "2026-09-22T00:00:00.000Z",
        }),
      );
    const client = createJBCenterClient({ fetch: fetchMock });
    const relayPaid = vi
      .fn()
      .mockResolvedValue({
        chainId: 1,
        projectId: "7",
        transactionHash: TX_HASH_1,
      });
    const seeded = intent([1, 137], {
      deployments: [
        {
          chainId: 137,
          projectId: "9",
          transactionHash: TX_HASH_2,
          createdAt: "",
        },
      ],
    });

    await expect(
      ensureDeployed({ client, intent: seeded, relayPaid }),
    ).resolves.toEqual({ 1: "7", 137: "9" });
    expect(relayPaid).toHaveBeenCalledTimes(1);
  });

  test("refuses two senders for the same run", async () => {
    const fetchMock = vi.fn();
    const relayPaid = vi.fn();
    const selfPaid = vi.fn();

    await expect(
      ensureDeployed({
        client: createJBCenterClient({ fetch: fetchMock }),
        intent: intent([1]),
        relayPaid,
        selfPaid,
      }),
    ).rejects.toMatchObject({ name: "EnsureDeployedError" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(relayPaid).not.toHaveBeenCalled();
    expect(selfPaid).not.toHaveBeenCalled();
  });

  test("refuses a chain the intent does not carry, and an empty run", async () => {
    const fetchMock = vi.fn();
    const client = createJBCenterClient({ fetch: fetchMock });

    await expect(
      ensureDeployed({ client, intent: intent([8453]), chainIds: [137] }),
    ).rejects.toMatchObject({ name: "EnsureDeployedError", chainId: 137 });
    await expect(
      ensureDeployed({ client, intent: intent([8453]), chainIds: [] }),
    ).rejects.toMatchObject({ name: "EnsureDeployedError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects a relay-paid deployment for another chain before recording it", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(relayBody(1)));
    const client = createJBCenterClient({ fetch: fetchMock });
    const relayPaid = vi
      .fn()
      .mockResolvedValue({
        chainId: 999,
        projectId: "7",
        transactionHash: TX_HASH_1,
      });

    await expect(
      ensureDeployed({ client, intent: intent([1]), relayPaid }),
    ).rejects.toMatchObject({ name: "EnsureDeployedError", chainId: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("rejects a relay run on an already-aborted signal before asking for anything", async () => {
    const fetchMock = vi.fn();
    const controller = new AbortController();
    controller.abort(new Error("aborted before relay"));
    const relayPaid = vi.fn();

    await expect(
      ensureDeployed({
        client: createJBCenterClient({ fetch: fetchMock }),
        intent: intent([1]),
        relayPaid,
        signal: controller.signal,
      }),
    ).rejects.toThrow("aborted before relay");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(relayPaid).not.toHaveBeenCalled();
  });

  test("a relay run whose chains have all landed asks for nothing", async () => {
    const fetchMock = vi.fn();
    const relayPaid = vi.fn();
    const seeded = intent([1], {
      deployments: [
        {
          chainId: 1,
          projectId: "7",
          transactionHash: TX_HASH_1,
          createdAt: "",
        },
      ],
    });

    await expect(
      ensureDeployed({
        client: createJBCenterClient({ fetch: fetchMock }),
        intent: seeded,
        relayPaid,
      }),
    ).resolves.toEqual({ 1: "7" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(relayPaid).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-relay/packages/core && npx vitest run src/jbcenter/ensureDeployed.test.ts -t "relays the one the visitor pays for"`
Expected: FAIL — TypeScript rejects `relayPaid` as an unknown option, and at runtime the run
falls through to the sponsor path and throws because chain 1 is not sponsorable.

- [ ] **Step 3: Write the run scope and the relay lane**

In `packages/core/src/jbcenter/ensureDeployed.ts`, extend the `../jbcenter.js` import with
`sponsorableChains`, `unsponsoredChains` and `type JBCenterRelayRequest`, and reduce the
`./merge.js` import to `deployedChains` (the run-scoped check replaces `isFullyDeployed` here;
the export itself stays).

Widen the step status and the options:

```ts
export type EnsureDeployedStep = {
  chainId: number;
  status:
    | "queued"
    | "sent"
    | "confirmed"
    | "failed"
    | "self-paid"
    | "relay-paid";
  transactionHash?: Hex;
};

export type EnsureDeployedOptions = {
  client: JBCenterClient;
  intent: JBCenterIntent<JBCenterJsonObject>;
  /**
   * The chains this run covers, each one of the intent's own. Omitted, the
   * run is every chain in the intent.
   */
  chainIds?: readonly number[];
  /**
   * Sends the forward request JB Center signed for a chain it does not
   * sponsor, and returns the deployment that transaction produced. The
   * request's `setup` calls go first, from the same wallet, in order. The
   * forwarder keeps Center's sponsor as the sender, so a chain paid for this
   * way pairs with every sponsored chain in the intent.
   */
  relayPaid?: (
    request: JBCenterRelayRequest,
  ) => Promise<JBCenterDeploymentInput>;
  /**
   * Runs the client's own launch pipeline for every remaining chain in the
   * run. The caller's wallet is then the sender, which a deployer that scopes
   * its token and sucker salt to the sender turns into a different token and
   * sucker address per chain; `relayPaid` keeps Center's sponsor as the
   * sender instead.
   */
  selfPaid?: (
    calls: JBCenterDeploymentCall[],
  ) => Promise<JBCenterDeploymentInput[]>;
  onStep?: (step: EnsureDeployedStep) => void;
  pollMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
};
```

Add the run helpers above `reportSteps`:

```ts
/**
 * The chains this run covers, in the intent's own order. Naming a chain the
 * intent does not carry is a caller mistake, not a deploy failure.
 */
function runChains(
  intent: JBCenterIntent<JBCenterJsonObject>,
  chainIds: readonly number[] | undefined,
): number[] {
  if (!chainIds) return [...intent.envelope.chainIds];

  const requested = new Set(chainIds);
  for (const chainId of requested) {
    if (!intent.envelope.chainIds.includes(chainId)) {
      throw new EnsureDeployedError(
        `Chain ${chainId} is not part of this intent`,
        chainId,
      );
    }
  }

  const run = intent.envelope.chainIds.filter((id) => requested.has(id));
  if (run.length === 0) {
    throw new EnsureDeployedError("ensureDeployed was given no chains to run");
  }

  return run;
}

function isRunDeployed(
  intent: JBCenterIntent<JBCenterJsonObject>,
  run: readonly number[],
): boolean {
  const deployed = deployedChains(intent);

  return run.every((chainId) => chainId in deployed);
}
```

Give `pollUntilDeployed`, `runSelfPaid` and `existingSender` the run, replacing their
`isFullyDeployed(...)` calls and the self-paid filter. Four exact edits, none of which changes
anything else in those functions:

1. In `pollUntilDeployed`, insert a third parameter after `seed`:

```ts
  run: readonly number[],
```

2. In `pollUntilDeployed`, replace

```ts
    if (isFullyDeployed(current)) {
```

with

```ts
    if (isRunDeployed(current, run)) {
```

3. In `runSelfPaid`, insert a third parameter after `intent`:

```ts
  run: readonly number[],
```

4. In `runSelfPaid`, replace

```ts
  const remainingCalls = intent.envelope.deploymentCalls.filter(
    (call) => !(call.chainId in deployed),
  );
```

with

```ts
  const remainingCalls = intent.envelope.deploymentCalls.filter(
    (call) => run.includes(call.chainId) && !(call.chainId in deployed),
  );
```

Then give `existingSender` the run as well, in full:

```ts
function existingSender(
  options: EnsureDeployedOptions,
  intent: JBCenterIntent<JBCenterJsonObject>,
  run: readonly number[],
  pollMs: number,
  timeoutMs: number,
): Promise<Record<number, string>> | undefined {
  const { client, onStep, selfPaid, signal } = options;

  if (isRunDeployed(intent, run)) {
    return Promise.resolve(deployedChains(intent));
  }

  if (intent.deploys.length > 0) {
    return pollUntilDeployed(
      client,
      intent,
      run,
      pollMs,
      timeoutMs,
      signal,
      onStep,
    );
  }

  if (intent.deployments.length > 0) {
    return runSelfPaid(client, intent, run, selfPaid, onStep, signal);
  }

  return undefined;
}
```

Add the relay lane above `ensureDeployed`:

```ts
/**
 * Center's lane for the chains it sponsors and the caller's own sender for
 * the chains it does not, in one run. The sponsored chains are queued first,
 * in one request, so Center works while the visitor is still signing.
 */
async function runRelayPaid(
  options: EnsureDeployedOptions,
  relayPaid: NonNullable<EnsureDeployedOptions["relayPaid"]>,
  run: readonly number[],
  pollMs: number,
  timeoutMs: number,
): Promise<Record<number, string>> {
  const { client, intent, onStep, signal } = options;

  checkAborted(signal);

  const result = deployedChains(intent);
  const remaining = run.filter((chainId) => !(chainId in result));
  const sponsored = sponsorableChains(remaining);

  let deploys: JBCenterIntentDeploy[] = [];
  if (sponsored.length > 0) {
    ({ deploys } = await client.requestDeploy(intent.id, {
      chainIds: sponsored,
      signal,
    }));
  }

  for (const chainId of unsponsoredChains(remaining)) {
    checkAborted(signal);
    const request = await client.requestRelay(intent.id, chainId, { signal });
    const deployment = await relayPaid(request);
    if (deployment.chainId !== chainId) {
      throw new EnsureDeployedError(
        `Relay-paid deploy returned chain ${deployment.chainId} for chain ${chainId}`,
        chainId,
      );
    }
    await client.recordDeployment(intent.id, deployment, { signal });
    result[chainId] = deployment.projectId;
    onStep?.({
      chainId,
      status: "relay-paid",
      transactionHash: deployment.transactionHash,
    });
  }

  if (sponsored.length === 0) return result;

  return {
    ...result,
    ...(await pollUntilDeployed(
      client,
      { ...intent, deploys },
      remaining,
      pollMs,
      timeoutMs,
      signal,
      onStep,
    )),
  };
}
```

Rewrite the head of `ensureDeployed` (its doc comment gains the second sender) and pass the run
through:

```ts
/**
 * The pre-step every webclient runs before the first on-chain write against
 * an undeployed intent: sponsor the deploy through JB Center for the chains
 * it covers, hand the rest to the caller's own sender, and poll until the
 * run's chains land. `chainIds` narrows the run to part of the intent.
 */
export async function ensureDeployed(
  options: EnsureDeployedOptions,
): Promise<Record<number, string>> {
  const { client, intent, onStep, relayPaid, selfPaid, signal } = options;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (relayPaid && selfPaid) {
    throw new EnsureDeployedError(
      "ensureDeployed takes relayPaid or selfPaid, never both",
    );
  }

  const run = runChains(intent, options.chainIds);

  if (relayPaid) {
    return runRelayPaid(options, relayPaid, run, pollMs, timeoutMs);
  }

  const started = existingSender(options, intent, run, pollMs, timeoutMs);
  if (started) return started;

  if (!isSponsorable(run)) {
    return runSelfPaid(client, intent, run, selfPaid, onStep, signal);
  }

  let deploys: JBCenterIntentDeploy[];
  try {
    checkAborted(signal);
    ({ deploys } = await client.requestDeploy(intent.id, {
      chainIds: options.chainIds ? run : undefined,
      signal,
    }));
  } catch (error) {
    if (
      error instanceof JBCenterRequestError &&
      SELF_PAID_FALLBACK_STATUSES.has(error.status)
    ) {
      // The refusal may mean the sponsor already took this intent, so read the
      // intent back and follow whatever sender it now has instead of adding a
      // second one.
      const fresh = await client.getIntent(intent.id, { signal });
      return (
        existingSender(options, fresh, run, pollMs, timeoutMs) ??
        runSelfPaid(client, fresh, run, selfPaid, onStep, signal)
      );
    }
    throw error;
  }

  return pollUntilDeployed(
    client,
    { ...intent, deploys },
    run,
    pollMs,
    timeoutMs,
    signal,
    onStep,
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-relay/packages/core && npx vitest run src/jbcenter/ensureDeployed.test.ts`
Expected: PASS — the nine new tests and every existing one, unedited. The three "never mixes
senders" tests and both self-paid rejection tables must still pass exactly as written: with no
`chainIds` and no `relayPaid`, the run is the whole intent and nothing about the old path
changes.

- [ ] **Step 5: Check types, coverage and format**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-relay && npm run type-check && npm run test:coverage && npm run dead-code:check && npm run wallet:check && npm run format && npm run format:ratchet`
Expected: no type errors; coverage stays above statements 95 / branches 82 / functions 92 /
lines 95 with no threshold failure; knip reports nothing unused; the wallet gate passes; the
ratchet prints no unexpected file. If a branch in `runChains` or `runRelayPaid` shows uncovered
in the text report, add the test that covers it rather than lowering a floor.

- [ ] **Step 6: Commit**

```bash
cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-relay
git add packages/core/src/jbcenter/ensureDeployed.ts \
  packages/core/src/jbcenter/ensureDeployed.test.ts
git commit -m "$(cat <<'MSG'
Deploy a chosen set of chains, whoever pays for each

ensureDeployed takes the chains a run covers and a relayPaid sender for
the ones Center does not sponsor. Center queues its own lane first, the
caller sends each signed forward request and returns the deployment it
produced, and the run polls until its chains land. The forwarder keeps
Center's sponsor as the sender, so the chains still pair.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: README and changeset

**Files:**
- Modify: `README.md`
- Create: `.changeset/intent-relay.md`

**Interfaces:**
- Consumes: everything Tasks 1 to 3 export. Produces no code.

- [ ] **Step 1: Rewrite the sender paragraph**

In `README.md`, replace the paragraph that begins "Every chain in an intent is deployed by
exactly one sender" (lines 78-84) with:

````markdown
Every chain in an intent is launched by exactly one sender - JB Center's
sponsor - so the tokens, suckers and 721 hooks a deployer scopes to its caller
land on the same addresses across chains. Who pays for the gas is a separate
question. `ensureDeployed` runs one intent's chains and picks the payer per
chain: JB Center pays for the chains it sponsors, and `relayPaid` sends the
forward request Center signed for the chains it does not, from the visitor's
own wallet, with Center's sponsor still the sender the launch sees. Apps never
call `requestDeploy` or `requestRelay` directly; `ensureDeployed` does.

```ts
import { ensureDeployed } from "@bananapus/nana-sdk-core/jbcenter";

const projectIdByChainId = await ensureDeployed({
  client: center,
  intent,
  // Only these chains this time; the rest stay undeployed for a later run.
  chainIds: [8453, 1],
  // Sends the chains JB Center does not sponsor. The setup calls go first,
  // from the same wallet, then the forwarder call with its value and gas.
  relayPaid: async (request) => {
    for (const call of request.setup) await sendFromWallet(call);
    const transactionHash = await sendFromWallet(request);
    return { chainId: request.chainId, ...(await readLaunch(transactionHash)) };
  },
  onStep: (step) => console.log(step.chainId, step.status),
});
```

`sponsorableChains` and `unsponsoredChains` split a chain list the way this run
does, so a UI can label each chain "free" or price it from the relay request's
`gas` and `value` before anyone commits. Two visitors who ask for the same
chain get the same forwarder nonce: the second transaction reverts, and the
answer is to run `ensureDeployed` again for that chain.

`selfPaid` is the other sender, and it is a different bargain: it runs the
app's own launch pipeline, which makes the app's wallet the sender. A deployer
that scopes its token and sucker salt to the sender then produces different
addresses on that chain, breaking cross-chain pairing, so reach for `relayPaid`
whenever Center can sign the chain and keep `selfPaid` for launches that do not
pair.

```ts
const projectIdByChainId = await ensureDeployed({
  client: center,
  intent,
  // Runs the app's own launch pipeline for every chain in the run, then
  // reports each result back to Center.
  selfPaid: (calls) =>
    Promise.all(calls.map((call) => runOwnLaunchPipeline(call))),
});
```

`relayPaid` and `selfPaid` are never both given: one run, one payer per chain.
````

- [ ] **Step 2: Amend the self-paid resume paragraph**

Replace "Finishing another wallet's partially self-paid intent produces different sucker, ERC-20,
and 721-hook addresses and breaks cross-chain linking, so only the wallet that sent the first
chain should resume a self-paid intent." with:

```markdown
Finishing another wallet's partially self-paid intent produces different
sucker, ERC-20, and 721-hook addresses and breaks cross-chain linking, so only
the wallet that sent the first chain should resume a self-paid intent. A
relay-paid chain carries no such rule: whoever sends it, the forwarder reports
Center's sponsor, so anyone can finish the remaining chains of an intent.
```

- [ ] **Step 3: Add the table rows**

In the helper table, immediately after the `isSponsorable` row:

```markdown
| `sponsorableChains`              | The chains in a list JB Center's sponsor covers, in the order given.                               |
| `unsponsoredChains`              | The chains in a list JB Center's sponsor does not cover.                                           |
```

- [ ] **Step 4: Write the changeset**

Create `.changeset/intent-relay.md`:

```markdown
---
"@bananapus/nana-sdk-core": minor
---

`@bananapus/nana-sdk-core/jbcenter` deploys an intent one chosen chain at a
time, whoever pays for each. `sponsorableChains` and `unsponsoredChains` split
a chain list per chain; `isSponsorable` still means every chain.
`requestDeploy(id, { chainIds })` asks JB Center's sponsor for a subset.
`requestRelay(id, chainId)` reads the forward request Center's sponsor signed
for a chain it does not sponsor, validated field by field and returned with
wei and gas as `bigint`, alongside the setup calls that go first.
`ensureDeployed` takes `chainIds` to limit the run and `relayPaid` to send the
chains Center does not sponsor from the caller's own wallet: it fetches each
request, hands it to `relayPaid`, records the deployment it returns, and polls
with the sponsored chains. The forwarder keeps Center's sponsor as the sender,
so relay-paid chains pair with sponsored ones. `selfPaid` is unchanged and is
now documented as the option that breaks that pairing for a deployer whose
salt is scoped to the sender. This package still sends no transaction.
```

- [ ] **Step 5: Format and check the prose**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-relay && npm run format && npm run format:ratchet && grep -rniE "draft|🤖|✅" README.md .changeset/intent-relay.md`
Expected: prettier rewrites both files cleanly; the ratchet prints no unexpected file; the grep
prints nothing and exits 1.

- [ ] **Step 6: Commit**

```bash
cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-relay
git add README.md .changeset/intent-relay.md
git commit -m "$(cat <<'MSG'
Document the two payers of one intent's chains

The sender is always Center's sponsor; the payer is Center for the chains
it sponsors and the visitor for the rest. README shows the relayPaid run,
the chain split helpers and what selfPaid costs in pairing.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: Budget, whole gate, and release

**Files:**
- Modify: `scripts/check-package-budgets.mjs` (only if the measurement demands it)

**Interfaces:**
- Consumes: the built `packages/core/dist` from `npm run build`. This plan adds no source file,
  so the published entry count should not move; only the packed and unpacked sizes grow, by a
  few kilobytes.
- Produces: a green `npm run check` and a merged PR that publishes 2.10.0.

- [ ] **Step 1: Build and measure**

```bash
cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-relay
npm run build
npm run check:package
```

Expected: it passes, printing
`@bananapus/nana-sdk-core: <packed> B packed, <unpacked> B unpacked, <N> files`. Write the three
numbers down.

- [ ] **Step 2: Raise a cap only if one failed**

If the run failed on `packed`, raise that budget to the printed value rounded up to the next
10 000 B; on `unpacked`, to the next 100 000 B; on `files`, to the next multiple of eight. Then
append one sentence to that budget's comment block, in the same voice as the ones above it, for
example:

```js
    // The relay request and the per-chain deploy run add about two kilobytes.
```

If nothing failed, change nothing in this file and skip to Step 4.

- [ ] **Step 3: Re-run the budget check**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-relay && npm run check:package`
Expected: PASS, printing the three measurements for all three packages.

- [ ] **Step 4: Run the whole gate exactly as CI does**

```bash
cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-relay
nvm use && npm --version   # 10.9.8
npm run check
```

Expected: PASS end to end — `deps:check`, `dead-code:check`, `protocol:check`, `wallet:check`,
`format:ratchet`, `check:gql`, `type-check`, `test:coverage`, `build`, `check:package`,
`check:generated`. `check:generated` must report no diff: nothing in this plan touches
`src/generated/juicebox.ts`.

- [ ] **Step 5: Commit the budget, if it changed**

```bash
cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-relay
git add scripts/check-package-budgets.mjs
git commit -m "$(cat <<'MSG'
Budget the relay request's published bytes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
MSG
)"
```

- [ ] **Step 6: Push and open the PR**

```bash
cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-relay
git push -u origin feat/intent-relay
gh pr create --repo Bananapus/juice-sdk-v4 \
  --title "Deploy an intent one chosen chain at a time" \
  --body "$(cat <<'BODY'
An intent no longer deploys all-or-nothing through one payer. Center pays
for the chains it sponsors; the visitor pays for the rest by sending the
forward request Center's sponsor signed for that chain. The forwarder
reports the sponsor as the sender either way, so tokens and suckers still
pair across chains.

- `sponsorableChains` and `unsponsoredChains` split a chain list per
  chain; `isSponsorable` still means every chain.
- `requestDeploy(id, { chainIds })` asks the sponsor for a subset.
- `requestRelay(id, chainId)` reads the signed request - target, calldata,
  fee, gas, deadline and the setup calls that go first - validated field
  by field, with wei and gas as `bigint`.
- `ensureDeployed` takes `chainIds` to limit the run and `relayPaid` to
  send the unsponsored chains; it records each deployment and polls with
  the sponsored ones. `relayPaid` and `selfPaid` are never both given.

This package still sends no transaction: `relayPaid` is the caller's own
sender, and `npm run wallet:check` adds no reviewed site.

`npm run check` and `npm run build` are green locally on Node 22.23.1.

Spec: `docs/superpowers/specs/2026-09-22-homerun-preview-create-and-per-chain-deploy-design.md`, section 3.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 7: Wait for CI, then merge**

```bash
gh pr checks --repo Bananapus/juice-sdk-v4 --watch
gh pr merge --repo Bananapus/juice-sdk-v4 --squash --delete-branch
```

If a check fails, fix it on the branch and push again — do not merge past a red gate.

- [ ] **Step 8: Merge the Version Packages PR and verify the publish**

The Release workflow opens it within a few minutes. Confirm it does exactly three things —
deletes `.changeset/intent-relay.md`, sets `packages/core/package.json` to `2.10.0`, and
prepends the changeset prose to `packages/core/CHANGELOG.md` under `## 2.10.0`:

```bash
gh pr list --repo Bananapus/juice-sdk-v4 --search "Version Packages"
gh pr diff --repo Bananapus/juice-sdk-v4 <number>
gh pr merge --repo Bananapus/juice-sdk-v4 <number> --squash
gh run list --repo Bananapus/juice-sdk-v4 --workflow Release --limit 3
npm view @bananapus/nana-sdk-core version   # expect 2.10.0
```

If the version reads `2.9.1`, the changeset was written as `patch` — close the version PR,
correct `.changeset/intent-relay.md` to `minor` on a fresh branch, merge that, and let the bot
reopen.

---

## Out of scope

Center's relay route, its subset deploy, its lane policy, its rate limits and its deployment
verifier (spec sections 1 and 2); Homerun's preview page, create step, deploy panel, gas-price
label and redirect (section 4); the juicebox.money and revnet.money ports; ERC-1271 publishing
and a Center passkey ceremony (section 5). No React hook wraps `relayPaid` here —
`packages/react` already has `useSendRelayrTx` and `useSignErc2771ForwardRequest`, and pairing
them with a relay request is a later change in that package. No change to `intentRow`,
`mergeSearch`, `intentCalls`, `decodeDeploymentCall`, `publishSignedIntent`, `isFullyDeployed`,
`deployedChains` or anything under `src/safe.ts`. `ensureDeployed` does not check a relay
request's `deadline` against the clock, does not price the transaction, and does not retry a
reverted relay send: the caller sees the revert and runs the chain again.

## Self-review

**1. Spec coverage (section 3, sentence by sentence).**
- "`isSponsorable(chainIds)` becomes per-chain: `sponsorableChains(chainIds)` and
  `unsponsoredChains(chainIds)`; `isSponsorable` stays and means every chain" → Task 1, with the
  split test and the untouched existing "sponsorable chain sets" test.
- "`requestDeploy(id, { chainIds? })` passes the subset" → Task 1, with both body tests: absent
  when the run is the whole intent, `{ "chainIds": [...] }` when it is not.
- "`requestRelay(id, chainId)` returns the signed forward request as `{ chainId, to, data,
  value: bigint, gas: bigint, deadline }`" → Task 2, plus `setup` from the contract sections 1
  and 2 state, and the thirteen-row rejection table.
- "`ensureDeployed` accepts `chainIds` to limit the run and keeps `selfPaid` for the unsponsored
  ones; a `relayPaid` option is the client's sender for unsponsored chains: it receives the
  relay request and returns the transaction hash; `ensureDeployed` then records the deployment
  and polls" → Task 3. The one resolved ambiguity is written up under Decisions already settled:
  `relayPaid` resolves to the whole `JBCenterDeploymentInput`, not a bare hash, because
  `recordDeployment` needs the `projectId` and the caller is the only party that reads it —
  the same way `selfPaid` supplies it today.
- "Never mixes senders because the relay request keeps Center's sponsor as sender" → stated in
  the `JBCenterRelayRequest` doc comment, the `relayPaid` doc comment, the README sender
  paragraph and the changeset; enforced by refusing `relayPaid` with `selfPaid`, and by the
  relay lane only ever walking `unsponsoredChains(remaining)` while `requestDeploy` gets exactly
  `sponsorableChains(remaining)`.
- "README documents the relay route, the subset deploy, and the pairing argument" → Task 4.
- Spec "Testing / SDK" line — "per-chain sponsorability" (Task 1), "`requestDeploy` subset body"
  (Task 1), "`requestRelay` parsing" (Task 2), "`ensureDeployed` with `chainIds` and `relayPaid`
  (sponsored + relay in one run, records the relay hash, never calls `selfPaid` for a sponsored
  chain)" (Task 3: the mixed-run test asserts the exact four request URLs, the deploy body, the
  `relay-paid` step and the recorded hash; the two-sender refusal test proves `selfPaid` is
  never reachable on a relay run), "budget and wallet-boundary checks" (Task 5 Step 4, Task 2
  Step 5, Task 3 Step 5).

**2. Backward compatibility.** With neither `chainIds` nor `relayPaid`, `runChains` returns the
envelope's own chain list, `isRunDeployed` equals `isFullyDeployed`, `runSelfPaid`'s filter adds
a predicate that is true for every call, and `requestDeploy` is handed `chainIds: undefined` and
so sends the same bodyless POST. Every existing `ensureDeployed` test therefore stands unedited,
and Task 3 Step 4 says so explicitly. The only public-surface widening is the new
`"relay-paid"` member of `EnsureDeployedStep["status"]`, which an exhaustive `switch` in a
client must learn: that is why this is a minor bump and why the changeset names it.

**3. Placeholder scan.** Every code step carries the code to write; every run step carries the
command and what it must print. The two conditional steps (Task 5 Steps 2 and 8) state the exact
rule and the exact wording. No "TBD", no "handle edge cases", no "similar to Task N".

**4. Type consistency.** `JBCenterRelayRequest` is produced by `requestRelay` in Task 2 and
consumed by `relayPaid` in Task 3 with the same field names and the same `bigint` for `value`
and `gas`. `JBCenterDeploymentInput` is what `relayPaid` returns and what `recordDeployment`
already takes, so the relay lane records exactly what the self-paid lane records.
`sponsorableChains`/`unsponsoredChains` return `number[]` in Task 1 and are consumed as
`readonly number[]` in Task 3. `run` is `readonly number[]` in every helper it reaches.
`deadline` is a `number` of unix seconds in the type, the validator and the tests.

**5. Wallet boundary, said plainly.** Nothing in this plan calls `sendTransaction`,
`sendCalls`, `writeContract`, a `signMessage`/`signTypedData` family member, `.request(`, or
any signing RPC method string. `requestRelay` is a `fetch` to Center; `relayPaid` is the
caller's function. `test/wallet-boundaries.json` gains no site, and its existing site in
`packages/core/src/safe.ts` line 264 must not move, so no task edits that file.
