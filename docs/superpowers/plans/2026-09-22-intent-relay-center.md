# Center: a relay request for a self-paid chain, and a subset deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone deploy any chain of a published intent from a link. Center hands out a signed ERC-2771 forward request for a chain it does not sponsor, so a visitor pays the gas and the creation fee while the deploying sender stays Center's sponsor key and the cross-chain salts still match. And `POST /v1/intents/:id/deploy` takes a chosen subset of the sponsored chains, so an intent that also names Ethereum is no longer refused outright and an intent already deployed on one chain can still be deployed on the rest.

**Architecture:** Three surfaces of `extensions/jbcenter`. (1) The sponsor lane (`src/sponsor/relayr.ts`) gains one read-only method, `relay(intent, chainId)`: it reads `JBProjects.creationFee()`, prepares the same forward request `deploy` prepares for a launch, signs it with the sponsor key and returns the forwarder call as plain JSON. Nothing is stored, no bundle is created and no ETH moves. The chain's setup calls are not forwarded; they come back as plain calls the visitor sends first, minus any Safe that already exists, because a Safe 1.4.1 creation is sender-agnostic. (2) `src/app.ts` gains `POST /v1/intents/:id/relay` and teaches `POST /v1/intents/:id/deploy` an optional `chainIds`. Sponsorability moves from the all-or-nothing `sponsorFamily(chainIds)` to `sponsoredChains(chainIds)` plus the unchanged family check on what is actually selected, and the "already deployed" guard moves from the intent to the chain — in the route and in `src/sponsor/worker.ts`, which today retires a whole claim when the intent has any deployment. (3) The guide, README, `/llms.txt` and the MCP `deploy_intent` shape describe both. The deployment verifier, the deploy-row schema, the migrations, the Relayr bundle, the retry rules and the budgets are unchanged.

**Tech Stack:** TypeScript (ESM, Node 22), Hono, viem 2, zod 4 (MCP), PostgreSQL 16 with `pg`, vitest.

**Spec:** `/Users/jango/Documents/jb/v6/evm/docs/superpowers/specs/2026-09-22-homerun-preview-create-and-per-chain-deploy-design.md` — this plan implements **only** section 1 (the relay route) and section 2 (the subset deploy), plus the parts of "Testing" that name Center. Section 3 (SDK) and section 4 (Homerun) are separate plans; section 5 is out of scope.

**Repository:** worktree `/Users/jango/Documents/jb/v6/evm/extensions/center-setup-calls`, branch `feat/intent-relay` off `main` at `c803010`. All paths below are relative to that worktree.

## Global Constraints

From the spec and the decisions taken before this plan:

- `POST /v1/intents/:id/relay` takes `{ chainId }`. The intent exists, the chain is in its `chainIds`, no deployment is recorded for it, and Center does not sponsor it. A sponsored chain answers `400` with code `sponsored_chain`, so the sponsor lane and a visitor can never race on one forwarder nonce.
- The relay reads the creation fee on that chain, prepares the forward request exactly as the lane does for a launch (simulation from the sponsor with the fee as value, the forwarder's current nonce for the sponsor, a 30-minute deadline), signs it with the sponsor key, and returns `{ chainId, to, data, value, gas, deadline, setup }`. It stores nothing and pays nothing.
- The relay covers the launch call only. A chain that also carries setup calls returns them in `setup` as plain `{ to, data, value: "0" }` entries the visitor sends first from their own wallet: a Safe 1.4.1 creation is sender-agnostic, so it does not have to come from the sponsor. A setup call whose predicted Safe already has code is left out.
- The relay is rate-limited per requester on its own hourly bucket. The origin gate and the shared per-minute limit apply as to every `/v1` route.
- Two visitors who fetch a request for the same chain get the same nonce; the second transaction reverts on the forwarder and the client fetches again. Documented, not prevented.
- `POST /v1/intents/:id/deploy` accepts an optional `chainIds`. Every id must be in the intent, must be sponsored and must have no recorded deployment. Ids that already carry a row are returned as they are. Omitted, it means every sponsored chain of the intent that has no deployment. An intent whose `chainIds` include an unsponsored chain is accepted for its sponsored chains.
- The selected chains must still form one payment family. The lane, the reservations, the budgets, the quotas and the retry rules are unchanged.
- The `/deploy` response shape is unchanged apart from returning only the rows it touched or found.
- No migration. `Deployment`, `IntentDeploy` and the deployment verifier are untouched.

Working rules:

- Never write the word "draft" in code, comments, documentation, copy, commit messages or PR text.
- No retrospective comments: a comment explains the code as it stands, never what changed or why it used to be different.
- No emoji anywhere: source, docs, tests, commits, PR text.
- Documentation and comments stay in Center's plain voice: short sentences, no marketing, no hedging, no "simply" or "just", tables for field lists, exact integers.
- No new environment variables. Every new limit is a module constant.
- Deploy-row and route error strings stay short codes or short fixed phrases, in the style of `creation fee above the sponsor ceiling`. Never an upstream message.
- Every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Stage by explicit path (`git add src/app.ts test/app.test.ts`), never `git add -A` or `git add .`.
- Node 22 in every fresh shell: `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22`.
- A bare `npx tsc --noEmit` needs the MCP package built first (`npm --prefix mcp run build`); `npm run typecheck` does that itself.
- The PostgreSQL suite runs as
  `source /private/tmp/claude-501/-Users-jango-Documents-jb-v6-evm/9db55714-fdc8-48c3-8caa-82ce9d03b7f4/scratchpad/center-test.env && npx vitest run test/postgres.integration.test.ts`.
  Never echo, `cat` or otherwise print that file or `TEST_DATABASE_URL`.
- The gate is `npm run check` with that same env sourced in the shell.
- Known pre-existing flakes, not caused by this work: the wallet-timing suites and `mcp/tests/integration/http.test.ts`. Re-run a flake once before investigating it; never "fix" it inside this branch.

## File Structure

**New files**

None. Every new test goes into a file the required-suite list already knows.

**Modified files**

- `src/types.ts` — `RelayRequest`, the wire shape of the relay response.
- `src/sponsor/chain.ts` — `RelayLane`, and the `relay` sponsor event.
- `src/sponsor/relayr.ts` — `relay` on the lane, reusing the launch preparation and the Safe reader.
- `src/rest/sponsorship/chain.ts` — `forwardedTransactionGas`, exported and used where `signed` already computed it.
- `src/sponsor/policy.ts` — `sponsoredChains`, `isSponsoredChain`, and `relay` on `SponsorRuntime`.
- `src/sponsor/worker.ts` — a recorded deployment retires its own chain, not the whole claim.
- `src/app.ts` — `POST /v1/intents/:id/relay`; the subset `POST /v1/intents/:id/deploy`.
- `src/index.ts` — hands the lane's `relay` to the app alongside the worker.
- `docs/rest/PROJECT_INTENTS.md`, `README.md`, `src/llms.ts` — the two routes.
- `mcp/src/application/operations.ts`, `mcp/src/adapters/jbcenter.ts`, `mcp/src/application/capabilities.ts` — `deploy_intent` takes `chainIds`.
- Tests: `test/sponsor/relayr.test.ts`, `test/sponsor/policy.test.ts`, `test/sponsor/worker.test.ts`, `test/app.test.ts`, `test/postgres.integration.test.ts`, `test/rest-guide.test.ts`, `mcp/tests/adapters/jbcenter.test.ts`.

**Explicitly untouched**

- `src/deploymentVerifier.ts` and `test/deploymentVerifier.test.ts` — a relay-paid deployment is a forwarded call from the sponsor, which the verifier already accepts.
- `src/db/migrations/**` — no new column and no new row kind.
- `src/intent.ts`, `src/safe.ts` — the envelope and the Safe grammar are unchanged.
- `src/mcp.ts` — `writePath` admits `/v1/intents/:id/deploy` only, so the co-hosted MCP cannot reach `/relay`. It holds no wallet, so a signed request it cannot send is of no use to it.
- `mcp/data/knowledge.json` — synced from sibling repositories outside this repository's gate.

**Decision: the relay simulates from the sponsor, so the sponsor key must hold the creation fee on the relayed chain.** `SponsorshipChain.prepare` simulates the inner call with `eth_call` from `account` with `value` set, and `signed` simulates the forwarder's `execute` the same way. A node rejects both when the sender's balance is below the value: verified against `https://ethereum-rpc.publicnode.com` and `https://base-rpc.publicnode.com`, an `eth_call` carrying `value: 0x5af3107a4000` from an empty address answers `-32003 EVM error: OutOfFunds`. `JBProjects.creationFee()` on Ethereum reads `100000000000000` wei (0.0001 ETH) today, the same as on Base. So the relay keeps the lane's own `SPONSOR_UNFUNDED` check: the sponsor key must hold at least the creation fee on chain 1, as a simulation float that is never spent. This is an operator precondition, documented in the guide; the alternative, a state override on two `eth_call`s inside the shared `SponsorshipChain`, would weaken the simulation every REST sponsorship request depends on.

**Decision: the relay does not apply the sponsor gas cap.** `policy.maximumGas` bounds what Center pays for. A relayed chain is paid for by the visitor, so the only bound is the one `SponsorshipChain.prepare` already enforces (`FORWARDER_GAS_LIMIT` against `DEFAULT_SPONSORSHIP_POLICY.maximumGas`, 10000000). The `gas` in the response is the outer transaction's figure, `inner + inner / 63 + 100000`, the same arithmetic `signed` already uses to simulate a forwarded call.

**Decision: the relay spends its own hourly bucket, not the sponsored-deploy quota.** `POST /v1/intents/:id/deploy` spends `deploy:<requester>` against `SPONSOR_DEPLOYS_PER_REQUESTER_PER_DAY`, which exists to ration Center's money. A relay costs Center nothing but one RPC pass, so it spends `relay:<requester>` against the module constant `RELAY_PER_REQUESTER_PER_HOUR = 30`, in the style of the publish route's hourly bucket, and answers `429` `relay_limit` with `Retry-After: 3600`.

**Decision: the one-sender boundary stops being Center's to enforce.** Today `POST /v1/intents/:id/deploy` refuses any intent with a recorded deployment, which keeps sponsorship off a partial self-paid deployment. A per-chain deploy has to drop that: the intent page deploys Ethereum through the relay and Base through the sponsor in one run, and the project page offers the remaining chains afterwards. Center cannot tell a relay-paid deployment from a wallet-paid one without storing whether the recorded trace was forwarded, which is a migration this work does not take. So the guard becomes per chain and the guide states the rule plainly: deploy an unsponsored chain through `/relay`, never from your own wallet, or the salts diverge and the chains never pair.

---

## Task 1: A signed forward request the lane does not pay for

**Files:**
- Modify: `src/types.ts`, `src/sponsor/chain.ts`, `src/sponsor/relayr.ts`, `src/rest/sponsorship/chain.ts`
- Test: `test/sponsor/relayr.test.ts`

**Interfaces:**

- Consumes:
  - `export function callsForChain(calls: readonly DeploymentCall[], chainId: number): { setup: DeploymentCall[]; launch: DeploymentCall | undefined }` from `src/intent.ts`.
  - `SponsorshipChain.prepare(catalog: ContractCatalog, call: RestCall, account: Address, stepIndex: number, deadline: number): Promise<PreparedForwardRequest>` and `SponsorshipChain.signed(request: PreparedForwardRequest, signature: Hex, preceding?: RelayrEntry[]): Promise<RelayrEntry>` from `src/rest/sponsorship/chain.ts`.
  - `export const PROJECTS_ABI` and `export class LaneError extends Error { constructor(message: string, readonly code?: string) }` from `src/sponsor/chain.ts`.
  - `decodeSafeSetupCall`, `predictSafeAddress`, `SAFE_FACTORY` from `src/safe.ts`.
- Produces:
  - `src/types.ts`: `export type RelayRequest = { chainId: number; to: Address; data: Hex; value: string; gas: string; deadline: number; setup: { to: Address; data: Hex; value: "0" }[] }`.
  - `src/sponsor/chain.ts`: `export type RelayLane = { relay(intent: Intent, chainId: number): Promise<RelayRequest> }`, and the `{ event: "relay"; intentId: string; chainId: number; deadline: number }` member of `SponsorEvent`.
  - `src/sponsor/relayr.ts`: `createRelayrLane(...): DeployLane & RelayLane`.
  - `src/rest/sponsorship/chain.ts`: `export function forwardedTransactionGas(inner: bigint): bigint`.

- [ ] **Step 1: Prepare the shell**

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22
cd /Users/jango/Documents/jb/v6/evm/extensions/center-setup-calls
git status --short
git log --oneline -1
npm --prefix mcp run build
```

Expected: clean tree on `feat/intent-relay` at `c803010`, MCP build succeeds.

- [ ] **Step 2: Write the failing lane tests**

Append to the `describe("relayr sponsorship lane", ...)` block in `test/sponsor/relayr.test.ts`:

```ts
  test("signs a forward request for a chain nobody pays Center to deploy", async () => {
    const { chain, lane, laneEvents, provider, report } = harness({
      chainIds: [1],
      paymentChainId: 1,
      hashAfter: 1,
      projectIds: ["12"],
    });

    const request = await lane.relay(intent([1]), 1);

    expect(request).toEqual({
      chainId: 1,
      to: FORWARDER,
      data: "0x4715378212345670",
      value: CREATION_FEE.toString(),
      gas: "404761",
      deadline: NOW / 1000 + 1800,
      setup: [],
    });
    expect(chain.prepare).toHaveBeenCalledTimes(1);
    expect(chain.prepare.mock.calls[0]![1]).toMatchObject({
      chainId: 1,
      to: TARGET,
      value: CREATION_FEE.toString(),
      label: "intent-relay",
      dependsOn: [],
    });
    expect(chain.prepare.mock.calls[0]![2]).toBe(signer.address);
    expect(chain.prepare.mock.calls[0]![3]).toBe(0);
    expect(chain.signed).toHaveBeenCalledTimes(1);
    expect(chain.signed.mock.calls[0]![2]).toBeUndefined();
    // Nothing is bundled, paid for or reported: the visitor sends the transaction.
    expect(provider.create).not.toHaveBeenCalled();
    expect(report.bundle).not.toHaveBeenCalled();
    expect(report.sent).not.toHaveBeenCalled();
    expect(laneEvents).toEqual([
      { event: "relay", intentId: "intent-1", chainId: 1, deadline: NOW / 1000 + 1800 },
    ]);
  });

  test("returns the Safe creations of a relayed chain as plain calls, without the ones that exist", async () => {
    const { lane } = harness({
      chainIds: [1],
      paymentChainId: 1,
      hashAfter: 1,
      projectIds: ["12"],
      setupPerChain: 1,
    });

    await expect(lane.relay(intent([1], 1), 1)).resolves.toMatchObject({
      to: FORWARDER,
      setup: [{ to: SAFE_FACTORY, data: safeCall(1n), value: "0" }],
    });

    const existing = harness({
      chainIds: [1],
      paymentChainId: 1,
      hashAfter: 1,
      projectIds: ["12"],
      setupPerChain: 1,
      // Every address answers with the factory runtime, so the predicted Safe already exists.
      code: () => SAFE_FACTORY_RUNTIME,
    });
    await expect(existing.lane.relay(intent([1], 1), 1)).resolves.toMatchObject({ setup: [] });
  });

  test("refuses to prepare a relay the sponsor cannot simulate", async () => {
    const unfunded = harness({
      chainIds: [1],
      paymentChainId: 1,
      hashAfter: 1,
      projectIds: ["12"],
      balance: () => CREATION_FEE - 1n,
    });
    await expect(unfunded.lane.relay(intent([1]), 1)).rejects.toMatchObject({
      code: "SPONSOR_UNFUNDED",
      message: "sponsor holds less than the creation fee on chain 1 by 1 wei",
    });
    expect(unfunded.chain.prepare).not.toHaveBeenCalled();

    const unconfigured = harness({
      chainIds: [1],
      paymentChainId: 1,
      hashAfter: 1,
      projectIds: ["12"],
    });
    await expect(unconfigured.lane.relay(intent([1, 10]), 10)).rejects.toMatchObject({
      code: "CHAIN_UNCONFIGURED",
    });
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/sponsor/relayr.test.ts`
Expected: FAIL — `lane.relay is not a function`.

- [ ] **Step 4: Name the outer gas of a forwarded call**

In `src/rest/sponsorship/chain.ts`, above `export class SponsorshipChain`:

```ts
/** What a sender must give a forwarded call: the signed inner gas, the 1/64 the EVM keeps
 * back from a subcall, and the forwarder's own overhead. */
export function forwardedTransactionGas(inner: bigint): bigint {
  return inner + inner / 63n + 100_000n;
}
```

and inside `signed`, in the `calls` map, replace

```ts
      const gas = decoded.args[0].gas;
      return { from: message.from, to: item.target, data: item.data,
        value: hex(BigInt(item.value)), gas: hex(gas + gas / 63n + 100_000n) };
```

with

```ts
      const gas = decoded.args[0].gas;
      return { from: message.from, to: item.target, data: item.data,
        value: hex(BigInt(item.value)), gas: hex(forwardedTransactionGas(gas)) };
```

- [ ] **Step 5: Declare the request and the lane**

In `src/types.ts`, after `IntentDeploy`:

```ts
/** One chain's launch, signed by Center's sponsor and sent by whoever pays for it. `to` is
 * the canonical forwarder, `value` and `gas` are decimal wei and gas units, and `setup`
 * holds the chain's Safe creations, which the payer sends first from any address. */
export type RelayRequest = {
  chainId: number;
  to: Address;
  data: Hex;
  value: string;
  gas: string;
  deadline: number;
  setup: { to: Address; data: Hex; value: "0" }[];
};
```

In `src/sponsor/chain.ts`, add `RelayRequest` to the `../types.js` import, add the event member to `SponsorEvent`

```ts
  | { event: "relay"; intentId: string; chainId: number; deadline: number }
```

and, below `DeployLane`:

```ts
/** Preparing a chain for a sender who is not Center: the sponsor signs, the payer sends. */
export type RelayLane = {
  relay(intent: Intent, chainId: number): Promise<RelayRequest>;
};
```

- [ ] **Step 6: Prepare the request in the lane**

In `src/sponsor/relayr.ts`, add `forwardedTransactionGas` to the `../rest/sponsorship/chain.js` import (a new import line, the file currently imports only the type), add `RelayLane` and `RelayRequest` to the existing `./chain.js` and `../types.js` imports, change the return type of `createRelayrLane` to `DeployLane & RelayLane`, add the constant next to `REQUEST_TTL_SECONDS`

```ts
/** A relay request is held by a person about to press send, not by a worker. */
const RELAY_TTL_SECONDS = 30 * 60;
```

and add the method to the returned object, after `resume`:

```ts
    // Center signs the launch and pays for nothing: the visitor sends the forwarder call with
    // the creation fee as its value, so `_msgSender()` on the destination is still the sponsor
    // and this chain's salts match every chain Center deploys itself.
    async relay(intent, chainId) {
      const { setup, launch } = callsForChain(intent.envelope.deploymentCalls, chainId);
      if (!launch || !rpcUrls.has(chainId))
        throw new LaneError(`chain ${chainId} is not configured`, "CHAIN_UNCONFIGURED");
      const fee = await client(chainId).readContract({
        address: projectsAddress,
        abi: PROJECTS_ABI,
        functionName: "creationFee",
      });
      // Both simulations send the fee from the sponsor, so the node needs it in that balance.
      const balance = await client(chainId).getBalance({ address: signer.address });
      if (balance < fee)
        throw new LaneError(
          `sponsor holds less than the creation fee on chain ${chainId} by ${fee - balance} wei`,
          "SPONSOR_UNFUNDED",
        );
      const deadline = Math.floor(now() / 1000) + RELAY_TTL_SECONDS;
      const prepared = await makeChain().prepare(
        catalog,
        {
          chainId,
          to: launch.to,
          data: launch.data,
          value: fee.toString(),
          label: "intent-relay",
          dependsOn: [],
          decoded: null,
        },
        signer.address,
        0,
        deadline,
      );
      const signature = await signer.signTypedData({
        domain: prepared.domain,
        types: FORWARD_REQUEST_TYPES,
        primaryType: "ForwardRequest",
        message: {
          from: prepared.message.from,
          to: prepared.message.to,
          value: BigInt(prepared.message.value),
          gas: BigInt(prepared.message.gas),
          nonce: BigInt(prepared.message.nonce),
          deadline: Number(prepared.message.deadline),
          data: prepared.message.data,
        },
      });
      const entry = await makeChain().signed(prepared, signature);
      const proxyCreationCode = creationCodeReader();
      const pending: RelayRequest["setup"] = [];
      for (const call of setup) {
        const plan = decodeSafeSetupCall(call);
        if (!plan) throw new LaneError("setup call is not a Safe creation", "SETUP_CALL_INVALID");
        const safe = predictSafeAddress(plan, await proxyCreationCode(chainId));
        const existing = await client(chainId).getCode({ address: safe });
        // A Safe 1.4.1 address depends on the factory, the initializer and the salt, never on
        // the sender, so the payer can create it and Center's launch still finds it.
        if (existing && existing !== "0x") continue;
        pending.push({ to: SAFE_FACTORY, data: call.data, value: "0" });
      }
      onEvent({ event: "relay", intentId: intent.id, chainId, deadline });
      return {
        chainId,
        to: entry.target,
        data: entry.data,
        value: entry.value,
        gas: forwardedTransactionGas(BigInt(prepared.message.gas)).toString(),
        deadline,
        setup: pending,
      };
    },
```

Run: `npx vitest run test/sponsor/relayr.test.ts`
Expected: PASS — the three new blocks and every existing block in the file.

- [ ] **Step 7: Prove the whole package still type-checks**

Run: `npx tsc --noEmit`
Expected: no output. `createRelayrLane` now returns `DeployLane & RelayLane` and `createSponsorWorker` still takes it as a `DeployLane`.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/sponsor/chain.ts src/sponsor/relayr.ts src/rest/sponsorship/chain.ts test/sponsor/relayr.test.ts
git commit -m "$(cat <<'EOF'
Prepare a signed forward request for a chain Center does not pay for

The lane can sign one chain's launch without bundling it: the visitor sends the
forwarder call with the creation fee as its value, so the deploying sender stays
the sponsor key. A chain's Safe creations come back as plain calls, minus any
Safe that already exists.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `POST /v1/intents/:id/relay`

**Files:**
- Modify: `src/sponsor/policy.ts`, `src/app.ts`, `src/index.ts`
- Test: `test/sponsor/policy.test.ts`, `test/app.test.ts`

**Interfaces:**

- Consumes: `RelayRequest` from `src/types.ts`; `LaneError` from `src/sponsor/chain.ts`; `laneEventMessage(error: unknown): string` from `src/sponsor/chain.ts`; `store.consumeRequest(client, limit, windowSeconds)` from `src/store.ts`.
- Produces:
  - `src/sponsor/policy.ts`: `export function sponsoredChains(chainIds: readonly number[]): number[]`, `export function isSponsoredChain(chainId: number): boolean`, and on `SponsorRuntime` the optional member `relay?: (intent: Intent, chainId: number) => Promise<RelayRequest>`.
  - `src/app.ts`: the route. No new exports; the module constants `RELAY_PER_REQUESTER_PER_HOUR = 30` and `RETRY_AFTER_HOUR = "3600"`.

- [ ] **Step 1: Write the failing policy test**

Replace the `test("family by chain set", ...)` block in `test/sponsor/policy.test.ts` with:

```ts
  test("family by chain set", () => {
    expect(sponsorFamily([8453, 10])).toBe("mainnet");
    expect(sponsorFamily([84532, 11155111])).toBe("testnet");
    expect(sponsorFamily([1, 8453])).toBeNull();
    expect(sponsorFamily([8453, 84532])).toBeNull();
    expect(sponsorFamily([])).toBeNull();
  });

  test("sponsorship read one chain at a time", () => {
    expect(sponsoredChains([1, 8453, 10])).toEqual([8453, 10]);
    expect(sponsoredChains([1])).toEqual([]);
    expect(sponsoredChains([84532, 421614])).toEqual([84532, 421614]);
    expect(isSponsoredChain(8453)).toBe(true);
    expect(isSponsoredChain(11155111)).toBe(true);
    expect(isSponsoredChain(1)).toBe(false);
    expect(isSponsoredChain(137)).toBe(false);
  });
```

and add `isSponsoredChain, sponsoredChains` to the import at the top of the file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/sponsor/policy.test.ts`
Expected: FAIL — `sponsoredChains` and `isSponsoredChain` are not exported.

- [ ] **Step 3: Read sponsorship one chain at a time**

In `src/sponsor/policy.ts`, add the two functions below `sponsorFamily` and extend `SponsorRuntime`:

```ts
/** The chains Center sponsors, in the order they were given. */
export function sponsoredChains(chainIds: readonly number[]): number[] {
  return chainIds.filter(
    (chainId) =>
      (SPONSORED_MAINNETS as readonly number[]).includes(chainId) ||
      (SPONSORED_TESTNETS as readonly number[]).includes(chainId),
  );
}

export function isSponsoredChain(chainId: number): boolean {
  return sponsoredChains([chainId]).length === 1;
}
```

```ts
export type SponsorRuntime = {
  policy: SponsorPolicy;
  kick(): void;
  /** Absent while no lane is configured; the relay route then answers 503. */
  relay?: (intent: Intent, chainId: number) => Promise<RelayRequest>;
};
```

with `import type { Intent, RelayRequest } from "../types.js";` at the top of the file.

Run: `npx vitest run test/sponsor/policy.test.ts`
Expected: PASS — both blocks.

- [ ] **Step 4: Write the failing route tests**

Append to `test/app.test.ts`, after the `describe("sponsored deploy requests", ...)` block:

```ts
describe("relay requests", () => {
  const relayed = {
    chainId: 1,
    to: "0x3bA60b60933916a7C87D0860DcEE62a0CE34E3e2",
    data: "0x4715378212345678",
    value: "100000000000000",
    gas: "404761",
    deadline: 1_700_001_800,
    setup: [],
  };
  let sponsor: {
    policy: SponsorPolicy;
    kick: ReturnType<typeof vi.fn>;
    relay: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    sponsor = {
      policy: readSponsorPolicy({}),
      kick: vi.fn(),
      relay: vi.fn(async () => relayed),
    };
  });

  const relay = (app: ReturnType<typeof createApp>, id: string, body: unknown) =>
    app.request(`/v1/intents/${id}/relay`, {
      method: "POST",
      headers: trusted,
      body: JSON.stringify(body),
    });

  it("returns a signed request for a chain Center does not sponsor", async () => {
    const app = createApp(new MemoryStore(), { sponsor });
    const intent = (await (await publish(app)).json()) as Intent;
    const response = await relay(app, intent.id, { chainId: 1 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(relayed);
    expect(sponsor.relay).toHaveBeenCalledWith(
      expect.objectContaining({ id: intent.id }),
      1,
    );
  });

  it("refuses a sponsored chain, a foreign chain, a bad id and a missing intent", async () => {
    const store = new MemoryStore();
    const app = createApp(store, { sponsor });
    const mainnet = (await (await publish(app)).json()) as Intent;
    const testnet = (await (await publishWith(app, testnetEnvelope)).json()) as Intent;

    const sponsored = await relay(app, testnet.id, { chainId: 84532 });
    expect(sponsored.status).toBe(400);
    expect(await errorCode(sponsored)).toBe("sponsored_chain");

    const foreign = await relay(app, mainnet.id, { chainId: 8453 });
    expect(foreign.status).toBe(400);
    expect(await errorCode(foreign)).toBe("bad_request");

    expect((await relay(app, "not-a-uuid", { chainId: 1 })).status).toBe(400);
    expect((await relay(app, randomUUID(), { chainId: 1 })).status).toBe(404);
    expect((await relay(app, mainnet.id, {})).status).toBe(400);
    expect(sponsor.relay).not.toHaveBeenCalled();
  });

  it("refuses a chain that already has a deployment", async () => {
    const app = createApp(new MemoryStore(), { sponsor, deploymentVerifier: verifier });
    const intent = (await (await publish(app)).json()) as Intent;
    await app.request(`/v1/intents/${intent.id}/deployments`, {
      method: "POST",
      headers: trusted,
      body: JSON.stringify({
        chainId: 1,
        projectId: "42",
        transactionHash: `0x${"12".repeat(32)}`,
      }),
    });
    const response = await relay(app, intent.id, { chainId: 1 });
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("bad_request");
    expect(sponsor.relay).not.toHaveBeenCalled();
  });

  it("spends an hourly bucket of its own and leaves the sponsored quota alone", async () => {
    const store = new MemoryStore();
    const app = createApp(store, { sponsor });
    const intent = (await (await publish(app)).json()) as Intent;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      expect((await relay(app, intent.id, { chainId: 1 })).status).toBe(200);
    }
    const refused = await relay(app, intent.id, { chainId: 1 });
    expect(refused.status).toBe(429);
    expect(await errorCode(refused)).toBe("relay_limit");
    expect(refused.headers.get("Retry-After")).toBe("3600");
    expect([...store.requests.keys()].filter((key) => key.startsWith("deploy:"))).toEqual([]);
  });

  it("answers 503 with no lane configured and when the lane cannot reach the chain", async () => {
    const store = new MemoryStore();
    const app = createApp(store, { sponsor: { policy: sponsor.policy, kick: sponsor.kick } });
    const intent = (await (await publish(app)).json()) as Intent;
    const missing = await relay(app, intent.id, { chainId: 1 });
    expect(missing.status).toBe(503);
    expect(await errorCode(missing)).toBe("unavailable");

    const failing = createApp(store, {
      sponsor: {
        ...sponsor,
        relay: vi.fn(async () => {
          throw new LaneError("chain 1 is not configured", "CHAIN_UNCONFIGURED");
        }),
      },
    });
    const response = await relay(failing, intent.id, { chainId: 1 });
    expect(response.status).toBe(503);
    expect(await errorCode(response)).toBe("relay_unavailable");
    expect(await response.text()).not.toContain("not configured");
  });
});
```

Add `LaneError` to the imports at the top of `test/app.test.ts`:

```ts
import { LaneError } from "../src/sponsor/chain.js";
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run test/app.test.ts`
Expected: FAIL — every relay request answers `404` because no route is mounted.

- [ ] **Step 6: Mount the route**

In `src/app.ts`, add the constants next to `RETRY_AFTER_SECONDS`:

```ts
/** A relay costs Center one RPC pass, so it has its own hourly allowance. */
const RELAY_PER_REQUESTER_PER_HOUR = 30;
const RETRY_AFTER_HOUR = "3600";
```

extend the `./sponsor/policy.js` import with `isSponsoredChain` and `sponsoredChains`, add

```ts
import { LaneError } from "./sponsor/chain.js";
```

and mount the route directly after `POST /v1/intents/:id/deployments`:

```ts
  app.post("/v1/intents/:id/relay", async (c) => {
    const sponsor = options.sponsor;
    if (!sponsor?.relay || sponsor.policy.paused) {
      return c.json({ error: { code: "unavailable", message: "Relay requests are paused" } }, 503);
    }
    const id = c.req.param("id");
    if (!UUID.test(id)) throw new BadRequest("intent id is invalid");
    const intent = await store.getIntent(id);
    if (!intent) return c.json({ error: { code: "not_found", message: "Intent not found" } }, 404);
    const chainId = positiveInteger((await json(c)).chainId, "chainId");
    if (!intent.envelope.chainIds.includes(chainId)) {
      throw new BadRequest("chainId is not part of this intent");
    }
    if (intent.deployments.some((deployment) => deployment.chainId === chainId)) {
      throw new BadRequest("chainId already has a deployment");
    }
    // Center deploys a sponsored chain itself. Handing out a second signed request for one
    // would put a visitor and the sponsor lane on the same forwarder nonce.
    if (isSponsoredChain(chainId)) {
      return c.json(
        { error: { code: "sponsored_chain", message: "Center deploys this chain; request a deploy" } },
        400,
      );
    }
    const allowance = await store.consumeRequest(
      `relay:${c.get("client")}`,
      RELAY_PER_REQUESTER_PER_HOUR,
      3600,
    );
    if (!allowance.allowed) {
      return c.json(
        { error: { code: "relay_limit", message: "Relay request limit reached; try again later" } },
        429,
        { "Retry-After": RETRY_AFTER_HOUR },
      );
    }
    try {
      return c.json(await sponsor.relay(intent, chainId), 200);
    } catch (error) {
      // Node and forwarder failures carry request URLs and signed bytes; only the code travels.
      console.warn(JSON.stringify({
        level: "warn",
        service: "center",
        message: "relay_unavailable",
        chainId,
        error: error instanceof LaneError ? (error.code ?? "lane error") : "relay error",
      }));
      return c.json(
        { error: { code: "relay_unavailable", message: "Center could not prepare this chain" } },
        503,
      );
    }
  });
```

Run: `npx vitest run test/app.test.ts`
Expected: PASS — the five new blocks and every existing block.

- [ ] **Step 7: Hand the lane's relay to the app**

In `src/index.ts`, replace

```ts
  sponsor = createSponsorWorker({
    store,
    verifier: deploymentVerifier,
    lane,
    policy: sponsorPolicy,
    onEvent: onSponsorEvent,
  });
```

with

```ts
  const worker = createSponsorWorker({
    store,
    verifier: deploymentVerifier,
    lane,
    policy: sponsorPolicy,
    onEvent: onSponsorEvent,
  });
  sponsor = { ...worker, relay: (intent, chainId) => lane.relay(intent, chainId) };
```

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/sponsor/policy.ts src/app.ts src/index.ts test/sponsor/policy.test.ts test/app.test.ts
git commit -m "$(cat <<'EOF'
Hand out a signed launch for a chain Center does not sponsor

POST /v1/intents/:id/relay answers with the forwarder call, its value, its gas
and the chain's remaining Safe creations. A sponsored chain is refused with
sponsored_chain so a visitor never races the lane on a nonce, and the route
spends its own hourly bucket rather than the sponsored-deploy quota.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Deploy a chosen subset of the sponsored chains

**Files:**
- Modify: `src/app.ts`
- Test: `test/app.test.ts`, `test/postgres.integration.test.ts`

**Interfaces:**

- Consumes: `sponsoredChains`, `isSponsoredChain`, `sponsorFamily`, `reservationWei(policy: SponsorPolicy, callCount: number): bigint` from `src/sponsor/policy.js`; `store.queueDeploys(intentId, chainIds, requester, reservedWeiPerChain): Promise<IntentDeploy[]>`, which returns every row of the intent and inserts nothing for a chain that already has one.
- Produces: no new exports. Two module-private helpers in `src/app.ts`:
  - `async function optionalJson(c: Context): Promise<Record<string, unknown>>`
  - `function optionalChainIds(value: unknown, within: number[]): number[] | undefined`

- [ ] **Step 1: Write the failing route tests**

In `test/app.test.ts`, replace the `it("refuses a deploy request once the intent is already deployed", ...)` block with the three blocks below, and add them inside `describe("sponsored deploy requests", ...)`:

```ts
  it("deploys the chains it is given and leaves the rest of the intent alone", async () => {
    const store = new MemoryStore();
    const app = createApp(store, { sponsor });
    const intent = (await (await publishWith(app, testnetEnvelope)).json()) as Intent;
    const first = await app.request(`/v1/intents/${intent.id}/deploy`, {
      method: "POST",
      headers: trusted,
      body: JSON.stringify({ chainIds: [421614] }),
    });
    expect(first.status).toBe(202);
    expect(
      ((await first.json()) as { deploys: IntentDeploy[] }).deploys.map((row) => row.chainId),
    ).toEqual([421614]);

    // The second request adds the other chain and reports only that one.
    const second = await app.request(`/v1/intents/${intent.id}/deploy`, {
      method: "POST",
      headers: trusted,
      body: JSON.stringify({ chainIds: [84532] }),
    });
    expect(second.status).toBe(202);
    expect(
      ((await second.json()) as { deploys: IntentDeploy[] }).deploys.map((row) => row.chainId),
    ).toEqual([84532]);

    // Asking again for a queued chain returns its row and queues nothing.
    const again = await app.request(`/v1/intents/${intent.id}/deploy`, {
      method: "POST",
      headers: trusted,
      body: JSON.stringify({ chainIds: [84532] }),
    });
    expect(again.status).toBe(200);
    expect(
      ((await again.json()) as { deploys: IntentDeploy[] }).deploys.map((row) => row.chainId),
    ).toEqual([84532]);
    expect(sponsor.kick).toHaveBeenCalledTimes(2);
    expect((await store.getIntent(intent.id))!.deploys.map((row) => row.chainId)).toEqual([
      84532, 421614,
    ]);
  });

  it("sponsors the sponsored chains of an intent that also names Ethereum", async () => {
    const store = new MemoryStore();
    const app = createApp(store, { sponsor });
    const mixed = {
      ...envelope,
      chainIds: [1, 8453],
      deploymentCalls: [
        { chainId: 1, to: "0x3333333333333333333333333333333333333333", data: "0x12345678" },
        { chainId: 8453, to: "0x3333333333333333333333333333333333333333", data: "0x12345678" },
      ],
      jb: { ...envelope.jb, chains: [1, 8453] },
    };
    const intent = (await (await publishWith(app, mixed)).json()) as Intent;
    const response = await app.request(`/v1/intents/${intent.id}/deploy`, {
      method: "POST",
      headers: trusted,
    });
    expect(response.status).toBe(202);
    expect(
      ((await response.json()) as { deploys: IntentDeploy[] }).deploys.map((row) => row.chainId),
    ).toEqual([8453]);
    // One chain is queued, so the reservation is one chain's worth.
    const stored = store.intents.find((item) => item.id === intent.id)!;
    expect((stored.deploys as unknown as { reservedWei: bigint }[])[0]!.reservedWei).toBe(
      reservationWei(sponsor.policy, 1),
    );

    const unsponsored = await app.request(`/v1/intents/${intent.id}/deploy`, {
      method: "POST",
      headers: trusted,
      body: JSON.stringify({ chainIds: [1] }),
    });
    expect(unsponsored.status).toBe(400);
    expect(await errorCode(unsponsored)).toBe("bad_request");
  });

  it("refuses a chain outside the intent, a deployed chain, and an intent with nothing left", async () => {
    const store = new MemoryStore();
    const app = createApp(store, { sponsor, deploymentVerifier: verifier });
    const intent = (await (await publishWith(app, testnetEnvelope)).json()) as Intent;
    const outside = await app.request(`/v1/intents/${intent.id}/deploy`, {
      method: "POST",
      headers: trusted,
      body: JSON.stringify({ chainIds: [10] }),
    });
    expect(outside.status).toBe(400);

    await app.request(`/v1/intents/${intent.id}/deployments`, {
      method: "POST",
      headers: trusted,
      body: JSON.stringify({
        chainId: 84532,
        projectId: "42",
        transactionHash: `0x${"12".repeat(32)}`,
      }),
    });
    const deployed = await app.request(`/v1/intents/${intent.id}/deploy`, {
      method: "POST",
      headers: trusted,
      body: JSON.stringify({ chainIds: [84532] }),
    });
    expect(deployed.status).toBe(400);

    // The rest of the intent is still deployable, and only that chain comes back.
    const rest = await app.request(`/v1/intents/${intent.id}/deploy`, {
      method: "POST",
      headers: trusted,
    });
    expect(rest.status).toBe(202);
    expect(
      ((await rest.json()) as { deploys: IntentDeploy[] }).deploys.map((row) => row.chainId),
    ).toEqual([421614]);

    const mainnetOnly = (await (await publish(app)).json()) as Intent;
    expect(
      (await app.request(`/v1/intents/${mainnetOnly.id}/deploy`, { method: "POST", headers: trusted }))
        .status,
    ).toBe(400);
  });
```

Append to `test/postgres.integration.test.ts`, inside `suite("PostgreSQL store", ...)`:

```ts
  it("adds a chain to an intent that already has a queued row", async () => {
    const { intent } = await store!.createIntent(
      newIntent({ name: "subset deploy", chainIds: [84532, 421614] }),
      { maxIntents: 100, maxBytes: 1_000_000 },
    );
    await store!.queueDeploys(intent.id, [84532], "browser:x", 1000n);
    const rows = await store!.queueDeploys(intent.id, [421614], "browser:x", 2000n);
    expect(rows.map((row) => [row.chainId, row.status])).toEqual([
      [84532, "queued"],
      [421614, "queued"],
    ]);
    expect(await reservedWei(intent.id, 84532)).toBe("1000");
    expect(await reservedWei(intent.id, 421614)).toBe("2000");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/app.test.ts`
Expected: FAIL — the first subset request answers `202` with both chains, the mixed intent answers `400` (`intent chains are not sponsorable`), and the second request answers `200`.

- [ ] **Step 3: Read the optional body and select the chains**

In `src/app.ts`, add the two helpers beside `json` and `positiveInteger`:

```ts
/** A route whose body is optional: an empty request is an empty object. */
async function optionalJson(c: Context): Promise<Record<string, unknown>> {
  const body = await c.req.text();
  if (!body.trim()) return {};
  try {
    return record(JSON.parse(body));
  } catch (error) {
    if (error instanceof BadRequest) throw error;
    throw new BadRequest("Request body must be valid JSON");
  }
}

function optionalChainIds(value: unknown, within: number[]): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) {
    throw new BadRequest("chainIds must contain between 1 and 16 chains");
  }
  const chainIds = value.map((chainId) => positiveInteger(chainId, "chainIds"));
  if (new Set(chainIds).size !== chainIds.length) {
    throw new BadRequest("chainIds must contain unique chains");
  }
  if (chainIds.some((chainId) => !within.includes(chainId))) {
    throw new BadRequest("chainIds must be part of this intent");
  }
  return chainIds;
}
```

and replace the block in `POST /v1/intents/:id/deploy` from `if (intent.deploys.length)` down to and including the `const reserved = ...` line with:

```ts
    const requested = optionalChainIds((await optionalJson(c)).chainIds, intent.envelope.chainIds);
    const deployed = new Set(intent.deployments.map((deployment) => deployment.chainId));
    if (requested?.some((chainId) => deployed.has(chainId))) {
      throw new BadRequest("chainIds must name chains with no deployment");
    }
    if (requested?.some((chainId) => !isSponsoredChain(chainId))) {
      throw new BadRequest("chainIds must name chains Center sponsors");
    }
    // A chain Center does not sponsor is deployed through the relay route, and a chain that is
    // already deployed is done: either way it is nothing this request can queue.
    const selected = sponsoredChains(requested ?? intent.envelope.chainIds).filter(
      (chainId) => !deployed.has(chainId),
    );
    if (!selected.length) throw new BadRequest("intent has no sponsored chain left to deploy");
    if (!sponsorFamily(selected)) throw new BadRequest("intent chains are not sponsorable");
    const queued = intent.deploys.filter((deploy) => selected.includes(deploy.chainId));
    const fresh = selected.filter(
      (chainId) => !intent.deploys.some((deploy) => deploy.chainId === chainId),
    );
    if (!fresh.length) return c.json({ deploys: queued }, 200);
    const requester = c.get("client");
    const reserved = reservationWei(
      sponsor.policy,
      intent.envelope.deploymentCalls.filter((call) => fresh.includes(call.chainId)).length,
    );
```

then replace the queueing tail of the route:

```ts
    const deploys = await store.queueDeploys(
      id,
      fresh,
      requester,
      reserved / BigInt(fresh.length),
    );
    sponsor.kick();
    return c.json({ deploys: deploys.filter((deploy) => selected.includes(deploy.chainId)) }, 202);
```

The `intent.status !== "undeployed"` line goes: `deployed` now decides per chain.

Run: `npx vitest run test/app.test.ts`
Expected: PASS — the three new blocks and every existing block, including "queues every chain once and is idempotent" and "reserves the budget split evenly across chains".

- [ ] **Step 4: Prove the store keeps both rows**

Run: `source /private/tmp/claude-501/-Users-jango-Documents-jb-v6-evm/9db55714-fdc8-48c3-8caa-82ce9d03b7f4/scratchpad/center-test.env && npx vitest run test/postgres.integration.test.ts`
Expected: PASS — the new block, each row keeping the reservation its own request made.

- [ ] **Step 5: Commit**

```bash
git add src/app.ts test/app.test.ts test/postgres.integration.test.ts
git commit -m "$(cat <<'EOF'
Sponsor a chosen subset of an intent's sponsored chains

POST /v1/intents/:id/deploy takes an optional chainIds. Every id must be in the
intent, sponsored and undeployed; an id that already has a row comes back as it
is. An intent that also names Ethereum is queued for its sponsored chains, and
the response carries only the rows the request touched or found.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: A recorded deployment retires its own chain

**Files:**
- Modify: `src/sponsor/worker.ts`
- Test: `test/sponsor/worker.test.ts`

**Interfaces:**
- Consumes: `store.getIntent(id): Promise<Intent | null>`, `store.updateDeploy(intentId, chainId, patch: DeployPatch)`, `store.claimQueuedDeploys(leaseSeconds, limit)`.
- Produces: no new exports. `runClaim` keeps only the per-chain `recorded` guard.

- [ ] **Step 1: Write the failing worker tests**

In `test/sponsor/worker.test.ts`, replace the `test("an intent that already has a deployment retires its claimed rows without spending", ...)` block with:

```ts
  test("a chain's own deployment retires that row and leaves the others claimable", async () => {
    const store = new MemoryStore();
    const { intent } = await store.createIntent(newIntent({ chainIds: [84532, 421614] }), limits);
    await store.queueDeploys(intent.id, [84532, 421614], "browser:x", 10n);
    await store.recordDeployment(intent.id, { chainId: 84532, projectId: "9", transactionHash: HASH });
    const lane: DeployLane = {
      resume: vi.fn(async () => {}),
      deploy: vi.fn(async (_i, chainIds, report) => {
        expect(chainIds).toEqual([421614]);
        await report.sent(421614, HASH, BUNDLE);
        await report.confirmed(421614, HASH, "11");
      }),
    };
    const worker = createSponsorWorker({
      store,
      verifier: { verify: vi.fn(async () => {}) },
      lane,
      policy,
    });
    await worker.runOnce();
    await worker.stop();
    expect(lane.deploy).toHaveBeenCalledTimes(1);
    const after = await store.getIntent(intent.id);
    expect(after?.deploys.map((row) => [row.chainId, row.status, row.error])).toEqual([
      [84532, "failed", "chain already deployed"],
      [421614, "confirmed", null],
    ]);
  });

  test("a deployment on the only claimed chain spends nothing", async () => {
    const store = new MemoryStore();
    const { intent } = await store.createIntent(newIntent({ chainIds: [84532] }), limits);
    await store.queueDeploys(intent.id, [84532], "browser:x", 10n);
    await store.recordDeployment(intent.id, { chainId: 84532, projectId: "9", transactionHash: HASH });
    const lane: DeployLane = { deploy: vi.fn(async () => {}), resume: vi.fn(async () => {}) };
    const worker = createSponsorWorker({ store, verifier: { verify: vi.fn() }, lane, policy });
    await worker.runOnce();
    await worker.stop();
    expect(lane.deploy).not.toHaveBeenCalled();
    expect(lane.resume).not.toHaveBeenCalled();
    expect((await store.getIntent(intent.id))?.deploys[0]).toMatchObject({
      status: "failed",
      error: "chain already deployed",
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/sponsor/worker.test.ts`
Expected: FAIL — both rows are retired with `intent already has a deployment` and the lane is never run.

- [ ] **Step 3: Guard the chain, not the intent**

In `src/sponsor/worker.ts`, delete the whole-intent branch from `runClaim`:

```ts
    // Nothing was paid, so a deployment recorded meanwhile retires the whole claim.
    if (!bundleUuid && intent.deployments.length > 0) {
      for (const chainId of claimed) {
        await store.updateDeploy(intentId, chainId, {
          status: "failed",
          error: "intent already has a deployment",
        });
        onEvent({ event: "failed", intentId, chainId, error: "intent already has a deployment" });
      }
      return;
    }
```

The per-chain guard below it stands, and its comment becomes the one that explains the rule:

```ts
    // A chain deployed by anyone else is done, whatever the rest of the intent is doing.
    const recorded = new Set(intent.deployments.map((deployment) => deployment.chainId));
```

Run: `npx vitest run test/sponsor/worker.test.ts`
Expected: PASS — the two new blocks and every existing block, including "one chain of a bundle recording itself must not retire the chains still in flight".

- [ ] **Step 4: Commit**

```bash
git add src/sponsor/worker.ts test/sponsor/worker.test.ts
git commit -m "$(cat <<'EOF'
Retire the chain a deployment recorded, not the whole claim

A chain of an intent can be deployed on its own, so a recorded deployment says
nothing about the chains still queued. The per-chain guard already retires the
chain that was recorded.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: The two routes in the guide, the README, `/llms.txt` and the MCP

**Files:**
- Modify: `docs/rest/PROJECT_INTENTS.md`, `README.md`, `src/llms.ts`
- Modify: `mcp/src/application/operations.ts`, `mcp/src/adapters/jbcenter.ts`, `mcp/src/application/capabilities.ts`
- Test: `test/rest-guide.test.ts`, `test/app.test.ts`, `mcp/tests/adapters/jbcenter.test.ts`

**Interfaces:**
- Consumes: `export const REST_DOCUMENTS` from `src/rest/site.ts`; `export function llmsIndex(audience = "https://juicebox.center"): string` from `src/llms.ts`.
- Produces: no new exports. `CenterClient.requestDeploy(id: string, chainIds?: number[]): Promise<CenterDeployPage>`, and `deploy_intent`'s schema becomes `z.object({ id: z.string().uuid(), chainIds: z.array(chainIdSchema).min(1).max(16).optional() }).strict()`.

- [ ] **Step 1: Write the failing tests**

Append to `test/rest-guide.test.ts`, inside the existing `describe`:

```ts
  it("documents the relay route and the per-chain deploy", async () => {
    const markdown = await readFile(new URL("../docs/rest/PROJECT_INTENTS.md", import.meta.url), "utf8");
    expect(markdown).toContain("## Relay a chain the payer sends");
    expect(markdown).toContain("POST /v1/intents/:id/relay");
    expect(markdown).toContain("sponsored_chain");
    expect(markdown).toContain("relay_limit");
    expect(markdown).toContain('"chainIds": [8453]');
    expect(markdown).toContain("the same forwarder nonce");
    expect(markdown).not.toContain("is refused for an\nintent that already has a recorded deployment");
  });
```

In `test/app.test.ts`, add to the `/llms.txt` discovery assertions:

```ts
    expect(discovery).toContain("any chain the payer sends itself");
```

Append to `mcp/tests/adapters/jbcenter.test.ts`, inside the `describe` that holds the other `CenterClient` blocks:

```ts
  it('asks Center for a subset of chains and sends no chainIds when none are named', async () => {
    const page = { deploys: [{ chainId: 8453, status: 'queued', transactionHash: null, bundleUuid: null, error: null, createdAt: '2026-09-22T00:00:00Z', updatedAt: '2026-09-22T00:00:00Z' }] };
    const request = vi.fn<typeof fetchJson>().mockResolvedValue(page);
    const center = new CenterClient({ fetchJson: request });
    await expect(center.requestDeploy(ID, [8453])).resolves.toEqual(page);
    expect(request.mock.calls[0]?.[1]?.body).toEqual({ chainIds: [8453] });
    await center.requestDeploy(ID);
    expect(request.mock.calls[1]?.[1]?.body).toEqual({});
    await expect(center.requestDeploy(ID, [0])).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(center.requestDeploy(ID, [])).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(request).toHaveBeenCalledTimes(2);
  });
```

Run: `npx vitest run test/rest-guide.test.ts test/app.test.ts` and `npm --prefix mcp run test -- tests/adapters/jbcenter.test.ts`
Expected: FAIL — the guide has no relay section, `/llms.txt` has no such phrase, and `requestDeploy` takes one argument.

- [ ] **Step 2: Take the subset in the MCP**

In `mcp/src/adapters/jbcenter.ts`, replace `requestDeploy`:

```ts
  /** Asks Center to execute the intent's own signed calls at Center's expense, for every
   * sponsored chain or for the named ones. Signs nothing. */
  async requestDeploy(id: string, chainIds?: number[]): Promise<CenterDeployPage> {
    input(uuidSchema, id);
    const selected =
      chainIds === undefined
        ? undefined
        : input(z.array(chainIdSchema).min(1).max(16), chainIds);
    let payload: unknown;
    try {
      payload = await this.write(
        `v1/intents/${encodeURIComponent(id)}/deploy`,
        selected ? { chainIds: selected } : {},
      );
    } catch (error) {
      throw deployRefusal(error);
    }
    const parsed = deployPageSchema.safeParse(payload);
    if (!parsed.success) invalidResponse();
    return parsed.data;
  }
```

In `mcp/src/application/operations.ts`, replace the `deploy_intent` definition:

```ts
    operationWithSchema(
      'deploy_intent',
      'Ask JB Center to sponsor execution of a published intent’s own committed calls on the supported rollups, for every sponsored chain or for the chains named in chainIds. Returns one row per requested chain with status queued, sent, confirmed or failed; repeating the request returns the same rows. Queued is not confirmation and a failed row is terminal for that chain. A chain Center does not sponsor, such as Ethereum, is deployed by its own payer and is never queued here. Refusals return a fixed code: NOT_SPONSORABLE, SPONSOR_QUOTA, SPONSOR_BUDGET or SPONSOR_UNAVAILABLE. This server signs nothing and sends no wallet transaction.',
      z
        .object({
          id: z.string().uuid(),
          chainIds: z.array(chainIdSchema).min(1).max(16).optional(),
        })
        .strict(),
      async ({ id, chainIds }) => s.center.requestDeploy(id, chainIds),
      { externalMutation: true, idempotent: true },
    ),
```

In `mcp/src/application/capabilities.ts`, replace the `deploy_intent` limit line:

```ts
      'deploy_intent requests Center-funded execution of the committed calls, for every sponsored chain or for a named subset. Queued rows are not confirmations, a failed row is terminal for that chain, and every chain of one intent is deployed by the same sender.',
```

Run: `npm --prefix mcp run build && npm --prefix mcp run test -- tests/adapters/jbcenter.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the guide sections**

In `docs/rest/PROJECT_INTENTS.md`, rewrite the second half of "## One sender per intent", from `Center enforces the boundary from its side:` through the end of that paragraph:

```markdown
There are exactly two valid senders for a whole intent, never mixed:

- Center's sponsor key deploys every chain. It signs each chain's launch as an ERC-2771
  forward request, so `_msgSender()` on the destination is the sponsor whether Center pays
  (`POST /v1/intents/:id/deploy`) or a visitor pays (`POST /v1/intents/:id/relay`).
- One wallet deploys every chain itself, paying each one and recording it.

Center enforces the boundary one chain at a time: a chain with a recorded deployment is
refused by both routes. It cannot see which sender a recorded deployment came from, so the
rest of the rule is yours to keep. Deploy an unsponsored chain with a relay request, never
from your own wallet, or that chain's salts differ from every chain Center deploys and the
projects never link.
```

Rewrite "## Sponsored deploy" down to the status table:

````markdown
## Sponsored deploy

```http
POST /v1/intents/:id/deploy
Content-Type: application/json

{ "chainIds": [8453] }
```

The body is optional. With no body, or with no `chainIds`, Center queues every chain of the
intent that it sponsors and that has no deployment yet. With `chainIds`, every id must be in
the intent, must be one Center sponsors, and must have no deployment; an id that already has a
row comes back as it is. The chains queued by one request must all be from one family.

An intent whose `chainIds` also name a chain Center does not sponsor, such as Ethereum, is
queued for its sponsored chains. The rest is deployed with a relay request.

| Status | Body | Meaning |
|---|---|---|
| `202` | `{"deploys":[...]}` | At least one chain was queued. One row per requested chain |
| `200` | `{"deploys":[...]}` | Every requested chain already has a row. The same rows come back |
| `400` | `bad_request` | The id is not a UUID, a named chain is not in the intent, is not sponsored or is already deployed, nothing sponsored is left to deploy, or the selected chains span both families |
| `404` | `not_found` | No such intent |
| `429` | `sponsor_budget` | The daily sponsorship budget is spent: the shared one, or an MCP caller's own slice of it. `Retry-After: 86400` |
| `429` | `sponsor_quota` | The requester's daily quota is spent. `Retry-After: 86400` |
| `503` | `unavailable` | No sponsor is configured, or sponsorship is paused |
````

Insert a new section between "### Sponsored chains" and "### Cost and quotas":

````markdown
## Relay a chain the payer sends

```http
POST /v1/intents/:id/relay
Content-Type: application/json

{ "chainId": 1 }
```

Center signs that chain's launch and hands the signed request back. Nothing is stored, nothing
is queued and no ETH leaves Center. The payer sends one transaction to the forwarder and the
project is created with Center's sponsor as its sender, so the chain pairs with every chain
Center deploys itself.

```json
{
  "chainId": 1,
  "to": "0x3bA60b60933916a7C87D0860DcEE62a0CE34E3e2",
  "data": "0x47153f82...",
  "value": "100000000000000",
  "gas": "404761",
  "deadline": 1700001800,
  "setup": []
}
```

| Field | Meaning |
|---|---|
| `to` | The canonical `ERC2771Forwarder` on that chain |
| `data` | `execute(request)` carrying the signed forward request |
| `value` | `JBProjects.creationFee()` in wei, as a decimal string. The transaction must send exactly this |
| `gas` | The gas the outer transaction needs: the signed inner gas, the 1/64 the EVM keeps back, and the forwarder's overhead |
| `deadline` | Unix seconds. The signature is valid for 30 minutes |
| `setup` | The chain's Safe creations as `{to, data, value}`, in order, minus any Safe that already exists. Send these first, from any address |

A Safe 1.4.1 address depends on the factory, the initializer and the salt, never on the sender,
so the payer creates the Safes and Center's signed launch still finds them at the same
addresses. The launch itself must stay a forwarded request; sent from any other address it
produces different token and sucker salts.

| Status | Code | Meaning |
|---|---|---|
| `200` | — | The signed request |
| `400` | `bad_request` | The id is not a UUID, `chainId` is missing or not in the intent, or that chain already has a deployment |
| `400` | `sponsored_chain` | Center deploys that chain itself. Use `POST /v1/intents/:id/deploy` |
| `404` | `not_found` | No such intent |
| `429` | `relay_limit` | 30 relay requests per requester per hour. `Retry-After: 3600` |
| `503` | `unavailable` | No sponsor is configured, or sponsorship is paused |
| `503` | `relay_unavailable` | Center could not read, simulate or sign for that chain |

Sponsored chains are refused so that a visitor and the sponsor lane can never hold the same
forwarder nonce at once. Two visitors can: both get the nonce the forwarder holds now, the
first transaction to land consumes it and the second reverts. Fetch the request again and send
it. A request is valid only until its `deadline`.

Center's sponsor key must hold at least `JBProjects.creationFee()` on a relayed chain, because
both simulations send that value from the sponsor. The fee is never spent there; on Ethereum it
is `100000000000000` wei (0.0001 ETH).

When the transaction confirms, record it with `POST /v1/intents/:id/deployments` as for any
self-paid chain. The verifier already accepts a forwarded call: the trace carries the committed
calldata plus the appended sender.
````

- [ ] **Step 4: README and `/llms.txt`**

In `README.md`, inside "## Request a sponsored deploy", replace

```
The response is `202` the first time and `200` on every later call for the same intent, always
returning the same rows: the request is idempotent per intent, not per call. JB Center only
sponsors an intent whose `chainIds` are entirely mainnets or entirely testnets from its supported
set, never a mix.
```

with

```
An optional `{"chainIds":[...]}` body limits the request to those chains; with no body, every
sponsored chain of the intent that has no deployment is queued. The response is `202` when a
chain was queued and `200` when every requested chain already has a row, and it carries only the
rows the request touched or found. The queued chains must be entirely mainnets or entirely
testnets from the supported set, never a mix; a chain outside both sets, such as Ethereum, is
left for its own payer.
```

and add a short section after it:

````markdown
## Relay a chain the payer sends

```http
POST /v1/intents/:id/relay

{ "chainId": 1 }
```

Center signs that chain's launch as an ERC-2771 forward request and returns
`{ chainId, to, data, value, gas, deadline, setup }`. Nothing is stored and nothing is paid: the
payer sends one transaction to the forwarder with `value` as its value, then records it through
`POST /v1/intents/:id/deployments`. The deploying sender is still Center's sponsor, so the chain
pairs with every chain Center deploys itself. A sponsored chain is refused with `sponsored_chain`,
and the route allows 30 requests per requester per hour. See
[the guide](docs/rest/PROJECT_INTENTS.md#relay-a-chain-the-payer-sends).
````

In `src/llms.ts`, extend the project-intents line:

```ts
- [Project intents](${origin}/api/docs/project-intents): \`POST ${origin}/v1/intents\` publishes a signed, frozen project deployment; \`POST ${origin}/v1/intents/:id/deploy\` requests a sponsored execution of its own calls, which may create its Safes and then launch, and \`POST ${origin}/v1/intents/:id/relay\` signs any chain the payer sends itself.
```

Run: `npx vitest run test/rest-guide.test.ts test/app.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate**

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22
source /private/tmp/claude-501/-Users-jango-Documents-jb-v6-evm/9db55714-fdc8-48c3-8caa-82ce9d03b7f4/scratchpad/center-test.env && npm run check
```

Expected: the check writes its observation with every required suite passed and nothing skipped. A failure in a wallet-timing suite or `mcp/tests/integration/http.test.ts` is re-run once on its own file before anything else is touched.

- [ ] **Step 6: Commit**

```bash
git add docs/rest/PROJECT_INTENTS.md README.md src/llms.ts mcp/src/application/operations.ts mcp/src/adapters/jbcenter.ts mcp/src/application/capabilities.ts test/rest-guide.test.ts test/app.test.ts mcp/tests/adapters/jbcenter.test.ts
git commit -m "$(cat <<'EOF'
Document the relay route and the per-chain sponsored deploy

The guide gains the relay request, its fields, the nonce race and the sponsor
float it needs, and the deploy section takes chainIds. The MCP deploy tool
accepts the same subset.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review: spec coverage

Work through this list before opening the PR; each line names where the requirement is met and how it is proved.

**Section 1, the relay route**

| Requirement | Where | Proof |
|---|---|---|
| `POST /v1/intents/:id/relay` with `{ chainId }` | `src/app.ts` | `test/app.test.ts` "returns a signed request for a chain Center does not sponsor" |
| The intent exists and the chain is in its `chainIds` | the `UUID`, `getIntent` and `chainIds.includes` checks | `test/app.test.ts` "refuses a sponsored chain, a foreign chain, a bad id and a missing intent" |
| No deployment is recorded for that chain | the `intent.deployments.some` check | `test/app.test.ts` "refuses a chain that already has a deployment" |
| A sponsored chain answers 400 `sponsored_chain` | `isSponsoredChain` in the route | the same refusal block |
| Center reads the creation fee on that chain | `client(chainId).readContract({ functionName: "creationFee" })` in `relay` | `test/sponsor/relayr.test.ts` "signs a forward request for a chain nobody pays Center to deploy" asserts `value` is the fee |
| The same forward request the lane prepares: simulation from the sponsor with the fee as value, the forwarder's current nonce, a 30-minute deadline | `chain.prepare(catalog, {…}, signer.address, 0, deadline)` with `RELAY_TTL_SECONDS` | the same block asserts the prepared call, the account, the step index and the deadline |
| Signed with the sponsor key | `signer.signTypedData` plus `chain.signed`, which recovers the signer | the harness's `signed` throws unless the sponsor signed |
| Returns `{ chainId, to, data, value, gas, deadline }` | the `RelayRequest` literal | the same block asserts the whole object |
| Nothing is stored, nothing is paid | no store call and no `provider.create` in `relay` | the same block asserts `provider.create`, `report.bundle` and `report.sent` were never called |
| A chain with setup calls returns them as plain `{to, data, value: "0"}` entries, and an existing Safe is left out | the `setup` loop with `predictSafeAddress` and `getCode` | `test/sponsor/relayr.test.ts` "returns the Safe creations of a relayed chain as plain calls, without the ones that exist" |
| Rate limited per requester, origin gate as every `/v1` route | `relay:<requester>` at `RELAY_PER_REQUESTER_PER_HOUR`, under the existing `/v1/*` origin and per-minute middleware | `test/app.test.ts` "spends an hourly bucket of its own and leaves the sponsored quota alone" |
| The visitor records the deployment as today; the verifier already accepts the forwarded trace | `src/deploymentVerifier.ts` untouched | `test/deploymentVerifier.test.ts` untouched and green |
| Two fetchers share a nonce; the second reverts and the client refetches. Documented | `docs/rest/PROJECT_INTENTS.md` "Relay a chain the payer sends" | `test/rest-guide.test.ts` "documents the relay route and the per-chain deploy" asserts "the same forwarder nonce" |

**Section 2, the subset deploy**

| Requirement | Where | Proof |
|---|---|---|
| `chainIds` is optional on `/deploy` | `optionalJson` plus `optionalChainIds` | `test/app.test.ts` "deploys the chains it is given and leaves the rest of the intent alone"; the existing no-body blocks stay green |
| Every id is in the intent | `optionalChainIds`'s `within` check | "refuses a chain outside the intent, a deployed chain, and an intent with nothing left" |
| Every id is sponsored | the `isSponsoredChain` check | "sponsors the sponsored chains of an intent that also names Ethereum" |
| Every id has no deployment | the `deployed` set | "refuses a chain outside the intent, a deployed chain, and an intent with nothing left" |
| Ids already queued or sent are returned as they are | `queued`/`fresh`, and the early `200` | the third request in "deploys the chains it is given…" |
| Omitted means every sponsored, undeployed chain | `sponsoredChains(requested ?? intent.envelope.chainIds).filter(...)` | the `rest` request in the refusal block returns only `421614` |
| An intent with an unsponsored chain is accepted for its sponsored chains | the same selection, and the dropped `sponsorFamily(intent.envelope.chainIds)` gate | "sponsors the sponsored chains of an intent that also names Ethereum" |
| Reservations, quotas, budgets and the lane are unchanged | `reservationWei` over the selected chains' calls, the same budget and quota order, no lane change | "reserves the budget split evenly across chains", "enforces the per-requester daily quota", "refuses unsponsorable chains, spent budgets and a paused policy", and the whole of `test/sponsor/relayr.test.ts` |
| The response returns only the rows it touched or found | the two `filter(... selected.includes ...)` calls | every subset block asserts the returned `chainId` list |
| A queued chain of an intent that is already deployed elsewhere still runs | `src/sponsor/worker.ts` keeps only the per-chain guard | `test/sponsor/worker.test.ts` "a chain's own deployment retires that row and leaves the others claimable" |
| A second request adds rows without disturbing the first | `queueDeploys`'s `ON CONFLICT DO NOTHING`, per-row reservations | `test/postgres.integration.test.ts` "adds a chain to an intent that already has a queued row" |

**Docs**

| Requirement | Where | Proof |
|---|---|---|
| The guide documents the relay route, its fields, its refusals, the nonce race and the sponsor float | `docs/rest/PROJECT_INTENTS.md` | `test/rest-guide.test.ts` "documents the relay route and the per-chain deploy" |
| The guide documents the optional `chainIds` and the new refusal reasons | the rewritten "Sponsored deploy" section | the same block asserts `"chainIds": [8453]` |
| "One sender per intent" states the rule Center no longer enforces across chains | the rewritten section | the same block asserts the old sentence is gone |
| README and `/llms.txt` follow | `README.md`, `src/llms.ts` | `test/app.test.ts` discovery assertion |
| The MCP deploy tool takes the subset | `mcp/src/application/operations.ts`, `mcp/src/adapters/jbcenter.ts`, `mcp/src/application/capabilities.ts` | `mcp/tests/adapters/jbcenter.test.ts` "asks Center for a subset of chains…" |

**Out of scope, confirm nothing crept in:** the SDK (`sponsorableChains`, `requestRelay`, `ensureDeployed`), Homerun, an MCP relay tool, a stored record of a relay request, any change to the deployment verifier, the deploy-row schema, the migrations, the Relayr bundle or the retry rules.

**Final check:** `git log --oneline main..HEAD` shows five commits, each ending with the required trailer; `git diff --stat main..HEAD` touches no file outside the list in "File Structure"; `grep -rn "draft" src/app.ts src/sponsor docs/rest/PROJECT_INTENTS.md` returns only the pre-existing `.jb` chain reader in `src/intent.ts`, which this work does not modify.
