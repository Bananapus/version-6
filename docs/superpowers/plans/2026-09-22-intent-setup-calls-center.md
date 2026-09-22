# Center: setup calls before the launch call — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one intent carry, per chain, the Safe creation calls followed by the launch call, and let Center's sponsor execute all of them in one Relayr bundle. `deploymentCalls` stays one flat array; for each `chainId` the last call is the launch and every earlier call is a setup call restricted to the canonical Safe 1.4.1 proxy factory. A one-call-per-chain intent stays valid, byte for byte.

**Architecture:** Four surfaces of `extensions/jbcenter`. (1) A new `src/safe.ts` holds the canonical Safe 1.4.1 addresses, the `createProxyWithNonce`/`setup` grammar and the CREATE2 prediction; it is imported by both the publish-time validator and the sponsor lane, so the trust boundary and the payer agree on one definition. (2) `src/intent.ts` groups `deploymentCalls` by chain, accepts 1 to 4 per chain and validates every non-final call against that grammar; the three readers that pull "the call for this chain" (`src/app.ts`, `src/sponsor/worker.ts`, `src/sponsor/relayr.ts`) move to one shared `callsForChain` helper so they all read the launch. (3) The sponsor lane builds one bundle whose entries are plain independent entries for the Safe creations (target the factory, value `0`, no `virtual_nonce`, simulated from the sponsor, skipped when the predicted Safe already has code) and the existing forwarder-wrapped entry for the launch; `settle` and `resume` collect a hash per entry, key `sent`/`confirmed` on the launch hash and only log setup outcomes. The provider parsers widen from `RelayrEntry[]` to a mixed array and derive independence per entry instead of per bundle. (4) The guide, README, `/llms.txt` and the MCP envelope shape describe the rule. The deployment verifier, the deploy-row schema and the retry rules are unchanged.

**Tech Stack:** TypeScript (ESM, Node 22), Hono, viem 2, zod 4 (MCP), PostgreSQL 16 with `pg`, vitest.

**Spec:** `/Users/jango/Documents/jb/v6/evm/docs/superpowers/specs/2026-09-22-intent-setup-calls-safe-owners-design.md` — this plan implements **only** sections 1 (envelope), 2 (sponsor lane) and 3 (read side and docs). Section 4 (SDK) and section 5 (Homerun) are separate plans; section 6 is not part of this work.

**Repository:** worktree `/Users/jango/Documents/jb/v6/evm/extensions/center-setup-calls`, branch `feat/intent-setup-calls` off `main` at `8a40927`. All paths below are relative to that worktree.

## Global Constraints

From the spec:

- `deploymentCalls` stays one flat array of `{ chainId, to, data }`. At most 4 calls per chain, at most 16 chains, 4 MiB per call. One call per chain stays valid and its content hash is unchanged.
- The last call for a chain is the launch call; every earlier call is a setup call.
- A setup call's `to` must be the canonical Safe proxy factory `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67`, whose runtime code hash is checked on the chain at deploy time.
- A setup call's `data` must be `createProxyWithNonce(singleton, initializer, saltNonce)` with singleton `0x41675C099F32341bf84BFc5382aF534df5C7461a`, and `initializer` must decode as `setup(owners, threshold, address(0), 0x, 0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99, address(0), 0, address(0))` with 1 to 20 unique nonzero owners and `threshold` in `[1, owners.length]`.
- Setup calls carry no value and are not forwarded. They are plain independent Relayr entries: `value` `0`, no `virtual_nonce`.
- Publish refuses anything else with a `400` that names the call index. `format`, the signing message and the `jb` conventions are unchanged; `jb.safes` is a client convention Center does not index.
- One bundle, one prepayment, all chains. A chain is `sent` when its launch entry has a hash and `confirmed` when the launch receipt succeeds and carries the `Create` event. The deploy row records the launch hash.
- A reverted setup receipt is logged with its chain and index and does not fail the row. A setup entry is skipped when the predicted Safe already has code.
- The deployment verifier is unchanged: it traces the launch call and expects exactly one `Create` event. The recorded deployment is the launch transaction.
- The lane recovery and retry rules are unchanged.

Working rules:

- Never write the word "draft" in code, comments, documentation, copy, commit messages or PR text.
- No retrospective comments: a comment explains the code as it stands, never what changed or why it used to be different.
- No emoji anywhere: source, docs, tests, commits, PR text.
- Documentation and comments stay in Center's plain voice: short sentences, no marketing, no hedging, no "simply" or "just", tables for field lists, exact integers.
- No new environment variables. Every new limit is a module constant.
- Deploy-row error strings stay short codes or short fixed phrases, in the style of `creation fee above the sponsor ceiling`. Never an upstream message.
- Every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Stage by explicit path (`git add src/safe.ts test/intent.test.ts`), never `git add -A` or `git add .`.
- Node 22 in every fresh shell: `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22`.
- A bare `npx tsc --noEmit` needs the MCP package built first (`npm --prefix mcp run build`); `npm run typecheck` does that itself.
- The PostgreSQL suite runs as
  `source /private/tmp/claude-501/-Users-jango-Documents-jb-v6-evm/9db55714-fdc8-48c3-8caa-82ce9d03b7f4/scratchpad/center-test.env && npx vitest run test/postgres.integration.test.ts`.
  Never echo, `cat` or otherwise print that file or `TEST_DATABASE_URL`.
- The gate is `npm run check` with that same env sourced in the shell.
- Known pre-existing flakes, not caused by this work: the wallet-timing suites and `mcp/tests/integration/http.test.ts`. Re-run a flake once before investigating it; never "fix" it inside this branch.

## File Structure

**New files**

- `src/safe.ts` — canonical Safe 1.4.1 constants, `decodeSafeSetupCall`, `predictSafeAddress`.
- `test/safe.test.ts` — the grammar and the prediction.

**Modified files**

- `src/intent.ts` — grouping, the 1-to-4 rule, setup-call validation, `callsForChain`.
- `src/app.ts` — the self-paid deployment claim verifies the launch call; the sponsor reservation counts calls.
- `src/sponsor/worker.ts` — the verifier receives the launch call.
- `src/sponsor/relayr.ts` — setup entries, entry roles, per-entry hashes in `settle` and `resume`, the existing-Safe skip.
- `src/sponsor/chain.ts` — three sponsor events for setup outcomes.
- `src/sponsor/policy.ts` — `reservationWei` counts calls.
- `src/rest/sponsorship/provider.ts` — `create`, `parseFamilyQuote` and `parseStatus` accept a mixed entry array; independence is derived per entry.
- `docs/rest/PROJECT_INTENTS.md`, `README.md`, `src/llms.ts` — the rule and the worked example.
- `mcp/src/application/operations.ts`, `mcp/src/adapters/jbcenter.ts` — the envelope shape accepts 1 to 4 calls per chain.
- Tests: `test/intent.test.ts`, `test/app.test.ts`, `test/sponsor/relayr.test.ts`, `test/sponsor/worker.test.ts`, `test/rest-sponsorship-provider.test.ts`, `test/postgres.integration.test.ts`, `test/rest-guide.test.ts`, `mcp/tests/adapters/jbcenter.test.ts`.

**Explicitly untouched**

- `src/deploymentVerifier.ts` and `test/deploymentVerifier.test.ts`.
- `src/db/migrations/**` — the deploy row is per `(intent_id, chain_id)` and stores the launch hash; `deployment_calls` is already `jsonb` with only an array check (`002_committed_deployments.sql`).
- `mcp/data/knowledge.json` — it is synced from sibling repositories by `mcp/scripts/sync-knowledge.ts`, outside this repository's gate.

**Decision: how the server predicts a Safe address.** Center reads `proxyCreationCode()` from the factory with one `eth_call` per chain per deploy, cached for the deploy, gated on the factory's runtime code hash matching the value the SDK pins (`0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317`). It does **not** pin creation-code bytes. Reason: the hash the SDK pins as `PROXY_CODE_HASH` in `packages/core/src/safe.ts` is the hash of a deployed proxy's *runtime*, compared against `client.getCode` in `verifySafeDeployments`; it is not the creation code and cannot produce the bytes CREATE2 hashes. The spec already requires a chain-time runtime-code check on the factory, so the read costs one extra call on top of a check that has to happen anyway, and a chain whose factory differs fails closed instead of predicting a wrong address.

---

## Task 1: The Safe call grammar and the envelope

**Files:**
- Create: `src/safe.ts`
- Create: `test/safe.test.ts`
- Modify: `src/intent.ts`
- Test: `test/intent.test.ts`

**Interfaces:**

- Consumes: `export type DeploymentCall = { chainId: number; to: Address; data: Hex }` and `export type IntentEnvelope` from `src/types.ts`; `export function normalizeEnvelope(value: unknown): IntentEnvelope` and the private `function deploymentCalls(value: unknown, chainIds: number[]): DeploymentCall[]` in `src/intent.ts`.
- Produces from `src/safe.ts`:
  - `export const SAFE_FACTORY: Address`, `export const SAFE_SINGLETON: Address`, `export const SAFE_FALLBACK: Address`, `export const SAFE_FACTORY_CODE_HASH: Hex`
  - `export const MAX_SAFE_OWNERS = 20`, `export const MAX_CALLS_PER_CHAIN = 4`
  - `export const SAFE_ABI` (viem `parseAbi` of `proxyCreationCode`, `createProxyWithNonce`, `setup`)
  - `export type SafeSetup = { owners: Address[]; threshold: number; saltNonce: bigint; initializer: Hex }`
  - `export function decodeSafeSetupCall(call: { to: Address; data: Hex }): SafeSetup | null`
  - `export function predictSafeAddress(setup: SafeSetup, proxyCreationCode: Hex): Address`
- Produces from `src/intent.ts`:
  - `export function callsForChain(calls: readonly DeploymentCall[], chainId: number): { setup: DeploymentCall[]; launch: DeploymentCall | undefined }`

- [ ] **Step 1: Prepare the shell**

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22
cd /Users/jango/Documents/jb/v6/evm/extensions/center-setup-calls
git status --short
npm --prefix mcp run build
```

Expected: clean tree on `feat/intent-setup-calls`, MCP build succeeds.

- [ ] **Step 2: Write the failing tests for the grammar**

Create `test/safe.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { encodeFunctionData, zeroAddress, type Address, type Hex } from "viem";
import {
  decodeSafeSetupCall,
  predictSafeAddress,
  SAFE_ABI,
  SAFE_FACTORY,
  SAFE_FALLBACK,
  SAFE_SINGLETON,
} from "../src/safe.js";

const OWNERS: Address[] = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
];
// The Safe 1.4.1 proxy creation code, as the factory returns it.
const PROXY_CREATION_CODE =
  "0x608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252602281526020018061019660229139604001915050604051809103" as Hex;

function initializer(owners: readonly Address[] = OWNERS, threshold = 2n): Hex {
  return encodeFunctionData({
    abi: SAFE_ABI,
    functionName: "setup",
    args: [owners, threshold, zeroAddress, "0x", SAFE_FALLBACK, zeroAddress, 0n, zeroAddress],
  });
}

function creation(data: Hex = initializer(), saltNonce = 7n, singleton: Address = SAFE_SINGLETON) {
  return {
    to: SAFE_FACTORY,
    data: encodeFunctionData({
      abi: SAFE_ABI,
      functionName: "createProxyWithNonce",
      args: [singleton, data, saltNonce],
    }),
  };
}

describe("safe setup calls", () => {
  it("decodes a plain Safe creation and keeps its owners, threshold and salt", () => {
    const decoded = decodeSafeSetupCall(creation());
    expect(decoded).toEqual({
      owners: OWNERS,
      threshold: 2,
      saltNonce: 7n,
      initializer: initializer(),
    });
  });

  it("refuses anything but a plain Safe creation on the canonical factory", () => {
    const other = "0x3333333333333333333333333333333333333333" as Address;
    expect(decodeSafeSetupCall({ ...creation(), to: other })).toBeNull();
    expect(decodeSafeSetupCall(creation(initializer(), 7n, other))).toBeNull();
    expect(decodeSafeSetupCall({ to: SAFE_FACTORY, data: "0x12345678" })).toBeNull();
    expect(decodeSafeSetupCall(creation(initializer([], 1n)))).toBeNull();
    expect(decodeSafeSetupCall(creation(initializer(OWNERS, 0n)))).toBeNull();
    expect(decodeSafeSetupCall(creation(initializer(OWNERS, 3n)))).toBeNull();
    expect(decodeSafeSetupCall(creation(initializer([OWNERS[0]!, OWNERS[0]!], 1n)))).toBeNull();
    expect(decodeSafeSetupCall(creation(initializer([zeroAddress], 1n)))).toBeNull();
    expect(
      decodeSafeSetupCall(
        creation(
          Array.from({ length: 21 }, (_, index) =>
            `0x${(index + 1).toString(16).padStart(40, "0")}` as Address,
          ).reduce((_, __, ___, owners) => initializer(owners, 1n), "0x" as Hex),
        ),
      ),
    ).toBeNull();
    expect(
      decodeSafeSetupCall({
        to: SAFE_FACTORY,
        data: `${creation().data}00` as Hex,
      }),
    ).toBeNull();
  });

  it("refuses a Safe that is not plain", () => {
    const hooked = encodeFunctionData({
      abi: SAFE_ABI,
      functionName: "setup",
      args: [OWNERS, 1n, OWNERS[0]!, "0xdeadbeef", SAFE_FALLBACK, zeroAddress, 0n, zeroAddress],
    });
    const paid = encodeFunctionData({
      abi: SAFE_ABI,
      functionName: "setup",
      args: [OWNERS, 1n, zeroAddress, "0x", SAFE_FALLBACK, zeroAddress, 1n, zeroAddress],
    });
    const handler = encodeFunctionData({
      abi: SAFE_ABI,
      functionName: "setup",
      args: [OWNERS, 1n, zeroAddress, "0x", OWNERS[1]!, zeroAddress, 0n, zeroAddress],
    });
    expect(decodeSafeSetupCall(creation(hooked))).toBeNull();
    expect(decodeSafeSetupCall(creation(paid))).toBeNull();
    expect(decodeSafeSetupCall(creation(handler))).toBeNull();
  });

  it("predicts the same address for the same owners, threshold and salt", () => {
    const decoded = decodeSafeSetupCall(creation())!;
    const address = predictSafeAddress(decoded, PROXY_CREATION_CODE);
    expect(address).toBe(predictSafeAddress(decoded, PROXY_CREATION_CODE));
    expect(address).not.toBe(
      predictSafeAddress(decodeSafeSetupCall(creation(initializer(), 8n))!, PROXY_CREATION_CODE),
    );
    expect(address).not.toBe(
      predictSafeAddress(
        decodeSafeSetupCall(creation(initializer([OWNERS[1]!, OWNERS[0]!])))!,
        PROXY_CREATION_CODE,
      ),
    );
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/safe.test.ts`
Expected: FAIL — `Cannot find module '../src/safe.js'`.

- [ ] **Step 4: Write `src/safe.ts`**

```ts
import {
  concatHex,
  decodeFunctionData,
  encodeFunctionData,
  encodePacked,
  getAddress,
  getContractAddress,
  isAddressEqual,
  keccak256,
  parseAbi,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";

/** Canonical Safe 1.4.1, from safe-global/safe-deployments. A fixed factory, singleton
 * and initializer give the same address on every chain, so a Safe and the project it
 * owns can be created in either order. */
export const SAFE_FACTORY = getAddress("0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67");
export const SAFE_SINGLETON = getAddress("0x41675C099F32341bf84BFc5382aF534df5C7461a");
export const SAFE_FALLBACK = getAddress("0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99");
/** The factory's own runtime, checked on each chain before the sponsor pays it. */
export const SAFE_FACTORY_CODE_HASH: Hex =
  "0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317";

export const MAX_SAFE_OWNERS = 20;
/** The launch call plus at most three Safes for one chain. */
export const MAX_CALLS_PER_CHAIN = 4;

export const SAFE_ABI = parseAbi([
  "function proxyCreationCode() pure returns (bytes)",
  "function createProxyWithNonce(address singleton, bytes initializer, uint256 saltNonce) returns (address proxy)",
  "function setup(address[] owners,uint256 threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address paymentReceiver)",
]);

export type SafeSetup = {
  owners: Address[];
  threshold: number;
  saltNonce: bigint;
  initializer: Hex;
};

/** The one call the sponsor pays for before a launch: a plain Safe 1.4.1 proxy with
 * owners, a threshold and the canonical fallback handler. Anything else is null. */
export function decodeSafeSetupCall(call: { to: Address; data: Hex }): SafeSetup | null {
  if (!isAddressEqual(call.to, SAFE_FACTORY)) return null;
  let singleton: Address;
  let initializer: Hex;
  let saltNonce: bigint;
  try {
    const decoded = decodeFunctionData({ abi: SAFE_ABI, data: call.data });
    if (decoded.functionName !== "createProxyWithNonce") return null;
    [singleton, initializer, saltNonce] = decoded.args;
  } catch {
    return null;
  }
  if (!isAddressEqual(singleton, SAFE_SINGLETON)) return null;
  // Exact encoding only: trailing or padded bytes are a different signed call.
  const canonical = encodeFunctionData({
    abi: SAFE_ABI,
    functionName: "createProxyWithNonce",
    args: [singleton, initializer, saltNonce],
  });
  if (canonical.toLowerCase() !== call.data.toLowerCase()) return null;
  let args: readonly [readonly Address[], bigint, Address, Hex, Address, Address, bigint, Address];
  try {
    const decoded = decodeFunctionData({ abi: SAFE_ABI, data: initializer });
    if (decoded.functionName !== "setup") return null;
    args = decoded.args;
  } catch {
    return null;
  }
  const [owners, threshold, to, data, fallbackHandler, paymentToken, payment, paymentReceiver] = args;
  if (owners.length < 1 || owners.length > MAX_SAFE_OWNERS) return null;
  if (owners.some((owner) => BigInt(owner) === 0n)) return null;
  if (new Set(owners.map((owner) => owner.toLowerCase())).size !== owners.length) return null;
  if (threshold < 1n || threshold > BigInt(owners.length)) return null;
  if (!isAddressEqual(to, zeroAddress) || data !== "0x") return null;
  if (!isAddressEqual(fallbackHandler, SAFE_FALLBACK)) return null;
  if (!isAddressEqual(paymentToken, zeroAddress)) return null;
  if (payment !== 0n || !isAddressEqual(paymentReceiver, zeroAddress)) return null;
  if (
    encodeFunctionData({ abi: SAFE_ABI, functionName: "setup", args }).toLowerCase() !==
    initializer.toLowerCase()
  )
    return null;
  return {
    owners: owners.map((owner) => getAddress(owner)),
    threshold: Number(threshold),
    saltNonce,
    initializer,
  };
}

/** The factory's CREATE2 address for this exact initializer and salt. */
export function predictSafeAddress(setup: SafeSetup, proxyCreationCode: Hex): Address {
  return getContractAddress({
    opcode: "CREATE2",
    from: SAFE_FACTORY,
    salt: keccak256(
      encodePacked(["bytes32", "uint256"], [keccak256(setup.initializer), setup.saltNonce]),
    ),
    bytecode: concatHex([proxyCreationCode, toHex(BigInt(SAFE_SINGLETON), { size: 32 })]),
  });
}
```

Run: `npx vitest run test/safe.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Write the failing tests for the envelope**

Replace the `it("requires one valid deployment call per declared chain", ...)` block in `test/intent.test.ts` and append the new blocks. Add to the imports at the top of the file:

```ts
import { encodeFunctionData, zeroAddress, type Address, type Hex } from "viem";
import { callsForChain } from "../src/intent.js";
import { SAFE_ABI, SAFE_FACTORY, SAFE_FALLBACK, SAFE_SINGLETON } from "../src/safe.js";

const OWNERS: Address[] = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
];
const LAUNCH = "0x4444444444444444444444444444444444444444" as Address;

function initializer(owners: readonly Address[] = OWNERS, threshold = 2n): Hex {
  return encodeFunctionData({
    abi: SAFE_ABI,
    functionName: "setup",
    args: [owners, threshold, zeroAddress, "0x", SAFE_FALLBACK, zeroAddress, 0n, zeroAddress],
  });
}

function setupCall(chainId: number, saltNonce = 1n, data = initializer(), singleton = SAFE_SINGLETON) {
  return {
    chainId,
    to: SAFE_FACTORY,
    data: encodeFunctionData({
      abi: SAFE_ABI,
      functionName: "createProxyWithNonce",
      args: [singleton, data, saltNonce],
    }),
  };
}

const launchCall = (chainId: number) => ({ chainId, to: LAUNCH, data: "0x12345678" as Hex });

const envelope = (deploymentCalls: unknown[], chainIds = [8453]) => ({
  format: "juicebox.money/v1",
  deploymentVersion: "6",
  chainIds,
  deploymentCalls,
  jb: { name: "Public goods garden", chains: chainIds },
});
```

New tests:

```ts
  it("accepts one, two and three setup calls before the launch call", () => {
    for (const count of [0, 1, 2, 3]) {
      const setup = Array.from({ length: count }, (_, index) => setupCall(8453, BigInt(index)));
      const normalized = normalizeEnvelope(envelope([...setup, launchCall(8453)]));
      expect(normalized.deploymentCalls).toHaveLength(count + 1);
      const chain = callsForChain(normalized.deploymentCalls, 8453);
      expect(chain.setup).toHaveLength(count);
      expect(chain.launch).toMatchObject({ to: LAUNCH });
      expect(chain.setup.every((call) => call.to === SAFE_FACTORY)).toBe(true);
    }
  });

  it("keeps each chain's call order while sorting chains", () => {
    const normalized = normalizeEnvelope(
      envelope(
        [setupCall(8453, 1n), launchCall(10), setupCall(8453, 2n), launchCall(8453), setupCall(10, 3n)],
        [10, 8453],
      ),
    );
    expect(normalized.deploymentCalls.map((call) => call.chainId)).toEqual([10, 10, 8453, 8453, 8453]);
    expect(callsForChain(normalized.deploymentCalls, 10).setup.map((call) => call.data)).toEqual([
      setupCall(10, 3n).data.toLowerCase(),
    ]);
    expect(callsForChain(normalized.deploymentCalls, 8453).setup.map((call) => call.data)).toEqual([
      setupCall(8453, 1n).data.toLowerCase(),
      setupCall(8453, 2n).data.toLowerCase(),
    ]);
    expect(callsForChain(normalized.deploymentCalls, 8453).launch).toMatchObject({ to: LAUNCH });
  });

  it("names the call index it refuses", () => {
    const other = "0x3333333333333333333333333333333333333333" as Address;
    expect(() =>
      normalizeEnvelope(envelope([{ chainId: 8453, to: other, data: "0x12345678" }, launchCall(8453)])),
    ).toThrow("deploymentCalls[0].to must be the canonical Safe proxy factory");
    expect(() =>
      normalizeEnvelope(envelope([setupCall(8453, 1n, initializer(), other), launchCall(8453)])),
    ).toThrow("deploymentCalls[0].data must create a plain Safe");
    expect(() =>
      normalizeEnvelope(envelope([setupCall(8453, 1n, initializer(OWNERS, 3n)), launchCall(8453)])),
    ).toThrow("deploymentCalls[0].data must create a plain Safe");
    expect(() =>
      normalizeEnvelope(
        envelope([launchCall(8453), setupCall(8453, 1n), setupCall(8453, 2n), setupCall(8453, 3n)]),
      ),
    ).toThrow("deploymentCalls[1].to must be the canonical Safe proxy factory");
  });

  it("refuses a fifth call on one chain and a chain with no call", () => {
    expect(() =>
      normalizeEnvelope(
        envelope([
          setupCall(8453, 1n),
          setupCall(8453, 2n),
          setupCall(8453, 3n),
          setupCall(8453, 4n),
          launchCall(8453),
        ]),
      ),
    ).toThrow("deploymentCalls must contain 1 to 4 calls for each chainId");
    expect(() => normalizeEnvelope(envelope([], [8453]))).toThrow(
      "deploymentCalls must contain 1 to 4 calls for each chainId",
    );
    expect(() =>
      normalizeEnvelope(envelope([setupCall(8453, 1n), launchCall(8453)], [10, 8453])),
    ).toThrow("deploymentCalls must contain 1 to 4 calls for each chainId");
  });

  it("hashes the setup calls with the rest of the envelope", () => {
    const first = normalizeEnvelope(envelope([setupCall(8453, 1n), launchCall(8453)]));
    const second = normalizeEnvelope(envelope([setupCall(8453, 2n), launchCall(8453)]));
    const single = normalizeEnvelope(envelope([launchCall(8453)]));
    expect(contentHash(first)).not.toBe(contentHash(second));
    expect(contentHash(first)).not.toBe(contentHash(single));
  });
```

Keep the existing calldata test but drop its `"exactly one"` expectation:

```ts
  it("requires contract calldata in every call", () => {
    expect(() =>
      normalizeEnvelope(envelope([{ chainId: 8453, to: LAUNCH, data: "0x12" }])),
    ).toThrow("contract calldata");
  });
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run test/intent.test.ts`
Expected: FAIL — `callsForChain` is not exported and the multi-call envelopes are refused with `deploymentCalls must contain exactly one call for each chainId`.

- [ ] **Step 7: Group and validate in `src/intent.ts`**

Add to the imports:

```ts
import { decodeSafeSetupCall, MAX_CALLS_PER_CHAIN, SAFE_FACTORY } from "./safe.js";
```

Replace the whole `function deploymentCalls(value: unknown, chainIds: number[]): DeploymentCall[]` with:

```ts
const CALL_COUNT = "deploymentCalls must contain 1 to 4 calls for each chainId, the last one launching";

function deploymentCalls(value: unknown, chainIds: number[]): DeploymentCall[] {
  if (
    !Array.isArray(value) ||
    value.length < chainIds.length ||
    value.length > chainIds.length * MAX_CALLS_PER_CHAIN
  ) {
    throw new Error(CALL_COUNT);
  }
  const calls = value.map((item, index) => {
    const raw = object(item, `deploymentCalls[${index}]`);
    const chainId = Number(raw.chainId);
    if (!Number.isSafeInteger(chainId) || chainId <= 0) {
      throw new Error(`deploymentCalls[${index}].chainId must be a positive safe integer`);
    }
    const to = address(raw.to, `deploymentCalls[${index}].to`);
    if (typeof raw.data !== "string" || !/^0x(?:[0-9a-f]{2}){4,}$/iu.test(raw.data)) {
      throw new Error(`deploymentCalls[${index}].data must be contract calldata`);
    }
    if (size(raw.data as Hex) > MAX_CALL_DATA_BYTES) {
      throw new Error(`deploymentCalls[${index}].data exceeds ${MAX_CALL_DATA_BYTES} bytes`);
    }
    return { chainId, to, data: raw.data.toLowerCase() as Hex };
  });
  const groups = new Map<number, { call: DeploymentCall; index: number }[]>();
  calls.forEach((call, index) => {
    const group = groups.get(call.chainId) ?? [];
    group.push({ call, index });
    groups.set(call.chainId, group);
  });
  if (groups.size !== chainIds.length || chainIds.some((chainId) => !groups.has(chainId))) {
    throw new Error(CALL_COUNT);
  }
  for (const group of groups.values()) {
    if (group.length > MAX_CALLS_PER_CHAIN) throw new Error(CALL_COUNT);
    // The last call for a chain launches the project; each earlier one creates a Safe,
    // so the sponsor never pays for arbitrary work.
    for (const { call, index } of group.slice(0, -1)) {
      if (call.to !== SAFE_FACTORY) {
        throw new Error(`deploymentCalls[${index}].to must be the canonical Safe proxy factory`);
      }
      if (!decodeSafeSetupCall(call)) {
        throw new Error(
          `deploymentCalls[${index}].data must create a plain Safe with 1 to 20 unique owners`,
        );
      }
    }
  }
  // A stable sort orders the chains and leaves each chain's calls in their signed order.
  return calls.sort((a, b) => a.chainId - b.chainId);
}

/** The last call for a chain launches the project; every earlier call sets it up. */
export function callsForChain(
  calls: readonly DeploymentCall[],
  chainId: number,
): { setup: DeploymentCall[]; launch: DeploymentCall | undefined } {
  const group = calls.filter((call) => call.chainId === chainId);
  return { setup: group.slice(0, -1), launch: group[group.length - 1] };
}
```

Run: `npx vitest run test/intent.test.ts test/safe.test.ts`
Expected: PASS — all blocks in both files.

- [ ] **Step 8: Prove the envelope survives the publish route and the store**

Append to `test/app.test.ts`, inside the existing intents `describe`, using that file's existing `sign`/`post` helpers (mirror the neighbouring publish test's wiring):

```ts
  it("publishes an intent whose chain creates a Safe before it launches", async () => {
    const { app } = createTestApp();
    const setup = {
      chainId: 84532,
      to: SAFE_FACTORY,
      data: encodeFunctionData({
        abi: SAFE_ABI,
        functionName: "createProxyWithNonce",
        args: [
          SAFE_SINGLETON,
          encodeFunctionData({
            abi: SAFE_ABI,
            functionName: "setup",
            args: [
              ["0x1111111111111111111111111111111111111111"],
              1n,
              zeroAddress,
              "0x",
              SAFE_FALLBACK,
              zeroAddress,
              0n,
              zeroAddress,
            ],
          }),
          1n,
        ],
      }),
    };
    const launch = { chainId: 84532, to: TARGET, data: "0x12345678" };
    const published = await publish(app, { chainIds: [84532], deploymentCalls: [setup, launch] });
    expect(published.status).toBe(201);
    const body = await published.json();
    expect(body.envelope.deploymentCalls.map((call: { to: string }) => call.to)).toEqual([
      SAFE_FACTORY,
      TARGET,
    ]);

    const refused = await publish(app, {
      chainIds: [84532],
      deploymentCalls: [{ ...setup, to: TARGET }, launch],
    });
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toMatchObject({
      code: "bad_request",
      message: expect.stringContaining("deploymentCalls[0].to"),
    });
  });
```

Append to `test/postgres.integration.test.ts`, inside the `suite("PostgreSQL store", ...)`:

```ts
  it("stores every call of a chain in its signed order", async () => {
    const value = newIntent({ name: "setup calls", chainIds: [84532] });
    value.envelope.deploymentCalls = [
      { chainId: 84532, to: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67", data: "0xaaaaaaaa" },
      { chainId: 84532, to: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67", data: "0xbbbbbbbb" },
      { chainId: 84532, to: "0x3333333333333333333333333333333333333333", data: "0x12345678" },
    ];
    const { intent } = await store!.createIntent(value, { maxIntents: 100, maxBytes: 1_000_000 });
    const stored = await store!.getIntent(intent.id);
    expect(stored?.envelope.deploymentCalls.map((call) => call.data)).toEqual([
      "0xaaaaaaaa",
      "0xbbbbbbbb",
      "0x12345678",
    ]);
  });
```

Run: `npx vitest run test/app.test.ts`
Then: `source /private/tmp/claude-501/-Users-jango-Documents-jb-v6-evm/9db55714-fdc8-48c3-8caa-82ce9d03b7f4/scratchpad/center-test.env && npx vitest run test/postgres.integration.test.ts`
Expected: PASS — the new publish test and the new store test; the `deployment_calls` array check accepts three calls with no migration.

- [ ] **Step 9: Commit**

```bash
git add src/safe.ts src/intent.ts test/safe.test.ts test/intent.test.ts test/app.test.ts test/postgres.integration.test.ts
git commit -m "$(cat <<'EOF'
Accept Safe setup calls before the launch call in an intent

The last call for a chain launches the project; every earlier call creates a
plain Safe 1.4.1 proxy on the canonical factory. Publish refuses anything else
with the call index it refused.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Every reader takes the launch call

**Files:**
- Modify: `src/app.ts`, `src/sponsor/worker.ts`, `src/sponsor/relayr.ts`
- Test: `test/sponsor/worker.test.ts`, `test/app.test.ts`

**Interfaces:**
- Consumes: `callsForChain(calls, chainId): { setup: DeploymentCall[]; launch: DeploymentCall | undefined }` from Task 1; `export type DeploymentClaim = { chainId: number; projectId: string; transactionHash: Hex; deploymentVersion: string; call: DeploymentCall }` and `verify(claim: DeploymentClaim): Promise<void>` from `src/deploymentVerifier.ts` (unchanged).
- Produces: no new exports. Three call sites that used `deploymentCalls.find((item) => item.chainId === chainId)` now read the launch call.

- [ ] **Step 1: Write the failing test**

Append to `test/sponsor/worker.test.ts`:

```ts
  test("worker verifies the launch call, not the setup call before it", async () => {
    const store = new MemoryStore();
    const value = newIntent({ chainIds: [84532] });
    value.envelope.deploymentCalls = [
      { chainId: 84532, to: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67", data: "0xaaaaaaaa" },
      { chainId: 84532, to: "0x3333333333333333333333333333333333333333", data: "0x12345678" },
    ];
    const { intent } = await store.createIntent(value, limits);
    await store.queueDeploys(intent.id, [84532], "browser:x", 10n);
    const lane: DeployLane = {
      resume: vi.fn(async () => {}),
      deploy: vi.fn(async (_i, _c, report) => {
        await report.sent(84532, HASH, BUNDLE);
        await report.confirmed(84532, HASH, "9");
      }),
    };
    const verifier = { verify: vi.fn(async () => {}) };
    const worker = createSponsorWorker({ store, verifier, lane, policy });
    await worker.runOnce();
    await worker.stop();
    expect(verifier.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        call: { chainId: 84532, to: "0x3333333333333333333333333333333333333333", data: "0x12345678" },
      }),
    );
  });
```

Run: `npx vitest run test/sponsor/worker.test.ts`
Expected: FAIL — the verifier received the Safe creation call.

- [ ] **Step 2: Read the launch call everywhere**

In `src/sponsor/worker.ts`, add `import { callsForChain } from "../intent.js";` and inside `report.confirmed` replace

```ts
          const call = intent.envelope.deploymentCalls.find((c) => c.chainId === chainId)!;
```

with

```ts
          const call = callsForChain(intent.envelope.deploymentCalls, chainId).launch!;
```

In `src/app.ts`, add `callsForChain` to the existing `./intent.js` import and in `POST /v1/intents/:id/deployments` replace

```ts
    const call = intent.envelope.deploymentCalls.find((item) => item.chainId === chainId);
```

with

```ts
    // A self-paid claim proves the launch transaction; earlier calls only create Safes.
    const call = callsForChain(intent.envelope.deploymentCalls, chainId).launch;
```

In `src/sponsor/relayr.ts`, add `import { callsForChain } from "../intent.js";` and inside `deploy` replace

```ts
        const call = intent.envelope.deploymentCalls.find((item) => item.chainId === chainId);
        if (!call || !rpcUrls.has(chainId)) return track.failRest(`chain ${chainId} is not configured`);
```

with

```ts
        const { launch } = callsForChain(intent.envelope.deploymentCalls, chainId);
        if (!launch || !rpcUrls.has(chainId)) return track.failRest(`chain ${chainId} is not configured`);
```

and use `launch.to` / `launch.data` in the `chain.prepare` argument.

Run: `npx vitest run test/sponsor/worker.test.ts test/sponsor/relayr.test.ts test/app.test.ts`
Expected: PASS — including the existing single-call suites, which are unchanged by this rewrite.

- [ ] **Step 3: Commit**

```bash
git add src/app.ts src/sponsor/worker.ts src/sponsor/relayr.ts test/sponsor/worker.test.ts
git commit -m "$(cat <<'EOF'
Verify and forward a chain's launch call

Every reader of a chain's committed call takes the last one: the deployment
verifier, the self-paid claim route and the sponsor lane.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Setup entries in the bundle and their roles in the quote

**Files:**
- Modify: `src/rest/sponsorship/provider.ts`, `src/sponsor/relayr.ts`, `src/sponsor/policy.ts`, `src/app.ts`
- Test: `test/rest-sponsorship-provider.test.ts`, `test/sponsor/relayr.test.ts`, `test/sponsor/policy.test.ts`

**Interfaces:**

- Consumes: `export interface RelayrEntry { chain: number; target: Address; data: Hex; value: string; virtual_nonce: number }` and `export type RelayrIndependentEntry = Omit<RelayrEntry, 'virtual_nonce'> & { virtual_nonce?: never }` from `src/rest/sponsorship/types.ts`; `SponsorshipChain.prepare(catalog, call, account, stepIndex, deadline)` and `signed(request, signature, preceding?)`; `SAFE_ABI`, `SAFE_FACTORY`, `SAFE_FACTORY_CODE_HASH`, `decodeSafeSetupCall` from Task 1.
- Produces:
  - `src/rest/sponsorship/provider.ts`:
    `export function parseFamilyQuote<Entry extends RelayrEntry | RelayrIndependentEntry>(value: unknown, entries: Entry[], now: number, maximumValue: bigint): RelayrQuote<Entry>`
    `export function parseStatus(value: unknown, quote: RelayrQuote<RelayrEntry | RelayrIndependentEntry>): { step: number; providerState: string; hash?: Hex }[]`
    `async create(entries: (RelayrEntry | RelayrIndependentEntry)[], signal?: AbortSignal): Promise<unknown>`
  - `src/sponsor/relayr.ts` (module-private): `type LaneEntry = RelayrEntry | RelayrIndependentEntry`, `type EntryRole = { chainId: number; role: "setup" | "launch"; index: number }`.
  - `src/sponsor/policy.ts`: `export function reservationWei(policy: SponsorPolicy, callCount: number): bigint` (renamed parameter, same arithmetic).

- [ ] **Step 1: Write the failing provider test**

Append to `test/rest-sponsorship-provider.test.ts`:

```ts
  it("binds a bundle that mixes a forwarded call with an independent one", () => {
    const mixed = [entries()[0]!, { chain: 8453, target: TARGET, data: "0xfeedface", value: "0" }];
    const quote = parseFamilyQuote(quoteResponse(), mixed, NOW, MAXIMUM_VALUE);
    const status = {
      bundle_uuid: BUNDLE,
      transactions: [
        { tx_uuid: TX_IDS[0], request: { ...mixed[0] }, status: { state: "Included", data: { hash: HASH } } },
        {
          tx_uuid: TX_IDS[1],
          request: { ...mixed[1], virtual_nonce: null },
          status: { state: "Included", data: { hash: HASH } },
        },
      ],
    };
    expect(parseStatus(status, quote)).toEqual([
      { step: 0, providerState: "Included", hash: HASH },
      { step: 1, providerState: "Included", hash: HASH },
    ]);
    const changed = JSON.parse(JSON.stringify(status));
    changed.transactions[1]!.request.virtual_nonce = 0;
    expect(() => parseStatus(changed, quote)).toThrowError(
      expect.objectContaining({ code: "RELAYR_INVALID_STATUS" }),
    );
  });
```

Run: `npx vitest run test/rest-sponsorship-provider.test.ts`
Expected: FAIL — `parseFamilyQuote` does not accept an entry without `virtual_nonce`, and the echoed `null` is read as a changed binding.

- [ ] **Step 2: Widen the provider parsers**

In `src/rest/sponsorship/provider.ts`:

```ts
  async create(entries: (RelayrEntry | RelayrIndependentEntry)[], signal?: AbortSignal): Promise<unknown> {
    return this.createWithMode(entries, "MultiChain", signal);
  }
```

```ts
  private async createWithMode(entries: (RelayrEntry | RelayrIndependentEntry)[], mode: "MultiChain" | "Disabled", signal?: AbortSignal): Promise<unknown> {
```

```ts
/** Center-sponsored deployments pay from the one family every destination belongs to. */
export function parseFamilyQuote<Entry extends RelayrEntry | RelayrIndependentEntry>(
  value: unknown,
  entries: Entry[],
  now: number,
  maximumValue: bigint,
): RelayrQuote<Entry> {
  const quote = quoteBinding(value, entries, now, paymentFamily(entries));
  for (const payment of quote.payments) assertPaymentEligible(payment, now, maximumValue);
  return quote;
}
```

```ts
export function parseStatus(
  value: unknown,
  quote: RelayrQuote<RelayrEntry | RelayrIndependentEntry>,
): { step: number; providerState: string; hash?: Hex }[] {
  return statusBinding(value, quote);
}
```

`parseIndependentStatus` keeps its `assertIndependentEntries` guard and calls `statusBinding(value, quote)`. Drop the `independent` parameter from `statusBinding` and `boundStatus` and derive it per entry, replacing the `virtual_nonce` arm of the `changed` chain with:

```ts
      // An entry with no nonce was sent unordered; the provider may echo that as null.
      : (expected.virtual_nonce === undefined
          ? item.request.virtual_nonce != null
          : item.request.virtual_nonce !== expected.virtual_nonce) ? "virtual_nonce"
```

Run: `npx vitest run test/rest-sponsorship-provider.test.ts`
Expected: PASS — the new block and every existing block, including `rejects a changed transaction virtual_nonce binding` and the independent-bundle blocks.

- [ ] **Step 3: Write the failing lane test**

In `test/sponsor/relayr.test.ts`, extend the fixtures:

```ts
const TX_UUIDS = ["b0", "c0", "d0", "e0", "f0", "a1", "b1", "c1"].map(
  (prefix) => `${prefix}a555ff-4444-4111-aaaa-333333333333`,
);
const OWNER = "0x1111111111111111111111111111111111111111" as Address;
const PROXY_CREATION_CODE = "0x6080604052348015600f57600080fd5b50" as Hex;
const SETUP_GAS = 260_000n;

function safeCall(saltNonce: bigint): Hex {
  return encodeFunctionData({
    abi: SAFE_ABI,
    functionName: "createProxyWithNonce",
    args: [
      SAFE_SINGLETON,
      encodeFunctionData({
        abi: SAFE_ABI,
        functionName: "setup",
        args: [[OWNER], 1n, zeroAddress, "0x", SAFE_FALLBACK, zeroAddress, 0n, zeroAddress],
      }),
      saltNonce,
    ],
  });
}
```

Give `intent()` an optional setup count, keeping the existing signature working:

```ts
function intent(chainIds: number[], setupPerChain = 0): Intent {
  const deploymentCalls = chainIds.flatMap((chainId, index) => [
    ...Array.from({ length: setupPerChain }, (_, position) => ({
      chainId,
      to: SAFE_FACTORY,
      data: safeCall(BigInt(position + 1)),
    })),
    { chainId, to: TARGET, data: `0x1234567${index}` as Hex },
  ]);
  return { /* the existing fields */, envelope: { /* the existing fields */, deploymentCalls } };
}
```

Teach `installRpc` the Safe reads (add these cases before the existing `eth_call` guard throws, and add the two new methods):

```ts
        case "eth_call": {
          const call = params[0] as { to: Address; data: Hex; from?: Address };
          if (call.to === SAFE_FACTORY) {
            if (call.data === encodeFunctionData({ abi: SAFE_ABI, functionName: "proxyCreationCode" })) {
              return encodeAbiParameters([{ type: "bytes" }], [PROXY_CREATION_CODE]);
            }
            simulated.push({ from: call.from!, data: call.data });
            return pad(OWNER, { size: 32 });
          }
          if (call.to !== PROJECTS || call.data !== feeCall) {
            throw new Error(`unexpected eth_call to ${call.to}`);
          }
          return toHex(creationFee, { size: 32 });
        }
        case "eth_getCode":
          return code(params[0] as Address);
        case "eth_estimateGas":
          return toHex(setupGas);
```

with `installRpc` taking `code: (address: Address) => Hex` and `setupGas: bigint`, defaulting in `harness` to

```ts
  const code = options.code ?? ((address: Address) => (address === SAFE_FACTORY ? FACTORY_CODE : "0x"));
```

where `FACTORY_CODE` is any byte string whose `keccak256` the test pins by stubbing the hash — instead, keep it honest: export `SAFE_FACTORY_CODE_HASH` from `src/safe.ts` and have the harness return a fixed `FACTORY_CODE = "0x60016000f3" as Hex` while the test overrides the pinned hash through the lane's own read. To avoid a fake hash, `createRelayrLane` takes no new option and the harness instead returns the real factory runtime: store it once in `test/fixtures/safe-factory-runtime.json` captured from Base with
`cast code 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` and assert in `test/safe.test.ts` that `keccak256` of it equals `SAFE_FACTORY_CODE_HASH`.

New lane tests:

```ts
  test("puts each chain's Safe creation in the bundle before its launch", async () => {
    const chainIds = [8453, 10];
    const { chain, lane, provider, report, simulated } = harness({
      chainIds,
      paymentChainId: 8453,
      hashAfter: 1,
      projectIds: ["12", "3"],
      setupPerChain: 1,
    });

    await lane.deploy(intent(chainIds, 1), chainIds, report);

    const entries = provider.create.mock.calls[0]![0];
    expect(entries).toHaveLength(4);
    expect(entries.map((entry) => entry.chain)).toEqual([8453, 8453, 10, 10]);
    expect(entries[0]).toEqual({
      chain: 8453,
      target: SAFE_FACTORY,
      data: safeCall(1n),
      value: "0",
    });
    expect(Object.hasOwn(entries[0]!, "virtual_nonce")).toBe(false);
    expect(entries[1]).toMatchObject({ target: FORWARDER, virtual_nonce: 0 });
    // The creation is simulated from the sponsor, and only the launch is forwarded.
    expect(simulated).toEqual([
      { from: signer.address, data: safeCall(1n) },
      { from: signer.address, data: safeCall(1n) },
    ]);
    expect(chain.prepare).toHaveBeenCalledTimes(2);
    expect(report.failed).not.toHaveBeenCalled();
  });

  test("fails every chain when a Safe creation needs more gas than the sponsor cap", async () => {
    const chainIds = [8453];
    const { lane, provider, report } = harness({
      chainIds,
      paymentChainId: 8453,
      hashAfter: 1,
      projectIds: ["12"],
      setupPerChain: 1,
      setupGas: policy.maximumGas + 1n,
    });

    await lane.deploy(intent(chainIds, 1), chainIds, report);

    expect(provider.create).not.toHaveBeenCalled();
    expect(report.failed).toHaveBeenCalledWith(8453, "setup gas above the sponsor cap");
  });

  test("refuses to pay a factory whose runtime is not canonical", async () => {
    const chainIds = [8453];
    const { lane, provider, report } = harness({
      chainIds,
      paymentChainId: 8453,
      hashAfter: 1,
      projectIds: ["12"],
      setupPerChain: 1,
      code: () => "0x6001",
    });

    await expect(lane.deploy(intent(chainIds, 1), chainIds, report)).rejects.toMatchObject({
      code: "SAFE_FACTORY_UNAVAILABLE",
    });
    expect(provider.create).not.toHaveBeenCalled();
  });
```

Run: `npx vitest run test/sponsor/relayr.test.ts`
Expected: FAIL — the bundle holds two entries and the Safe reads are unexpected RPC methods.

- [ ] **Step 4: Build the setup entries in the lane**

In `src/sponsor/relayr.ts`, add the imports and the module types:

```ts
import { keccak256 } from "viem";
import { callsForChain } from "../intent.js";
import {
  decodeSafeSetupCall,
  SAFE_ABI,
  SAFE_FACTORY,
  SAFE_FACTORY_CODE_HASH,
} from "../safe.js";
import type { RelayrEntry, RelayrIndependentEntry } from "../rest/sponsorship/types.js";

type LaneEntry = RelayrEntry | RelayrIndependentEntry;
/** Which committed call of a chain an entry carries, and where it sits in that chain. */
type EntryRole = { chainId: number; role: "setup" | "launch"; index: number };
```

Inside `createRelayrLane`, above `deploy`:

```ts
  /** The factory's creation code decides every predicted Safe address on a chain, so it is
   * read once per deploy and only after the factory's own runtime is the canonical one. */
  function creationCodeReader() {
    const codes = new Map<number, Hex>();
    return async (chainId: number): Promise<Hex> => {
      const cached = codes.get(chainId);
      if (cached) return cached;
      const runtime = await client(chainId).getCode({ address: SAFE_FACTORY });
      if (!runtime || keccak256(runtime) !== SAFE_FACTORY_CODE_HASH)
        throw new LaneError(
          `the Safe proxy factory runtime on chain ${chainId} is not the canonical one`,
          "SAFE_FACTORY_UNAVAILABLE",
        );
      const code = await client(chainId).readContract({
        address: SAFE_FACTORY,
        abi: SAFE_ABI,
        functionName: "proxyCreationCode",
      });
      codes.set(chainId, code);
      return code;
    };
  }
```

In `deploy`, replace the entry loop body:

```ts
      const entries: LaneEntry[] = [];
      const roles: EntryRole[] = [];
      const proxyCreationCode = creationCodeReader();
      for (const chainId of chainIds) {
        const { setup, launch } = callsForChain(intent.envelope.deploymentCalls, chainId);
        if (!launch || !rpcUrls.has(chainId)) return track.failRest(`chain ${chainId} is not configured`);
        for (const [position, call] of setup.entries()) {
          const plan = decodeSafeSetupCall(call);
          if (!plan) return track.failRest("setup call is not a Safe creation");
          await proxyCreationCode(chainId);
          // The creation is sender-agnostic, so the sponsor's own simulation settles it.
          await client(chainId).call({ account: signer.address, to: SAFE_FACTORY, data: call.data });
          const gas = await client(chainId).estimateGas({
            account: signer.address,
            to: SAFE_FACTORY,
            data: call.data,
          });
          if (gas > policy.maximumGas) return track.failRest("setup gas above the sponsor cap");
          entries.push({ chain: chainId, target: SAFE_FACTORY, data: call.data, value: "0" });
          roles.push({ chainId, role: "setup", index: position });
        }
        const fee = await client(chainId).readContract({ /* unchanged */ });
        /* the unchanged ceiling, balance, prepare, gas cap and signature block, with
           `to: launch.to`, `data: launch.data` and `entries.length` as the step index */
        entries.push(await chain.signed(prepared, signature));
        roles.push({ chainId, role: "launch", index: setup.length });
      }
```

and the quote:

```ts
      const quote = parseFamilyQuote(
        await provider.create(entries),
        entries,
        now(),
        reservationWei(policy, entries.length),
      );
```

In `src/sponsor/policy.ts` rename the parameter and its comment:

```ts
/** One committed call: the gas the sponsor will sign for plus the creation fee ceiling. */
export function reservationWei(policy: SponsorPolicy, callCount: number): bigint {
  return BigInt(callCount) * (policy.maximumGas * policy.maximumFeePerGas + CREATION_FEE_CEILING);
}
```

In `src/app.ts`, `POST /v1/intents/:id/deploy`:

```ts
    const reserved = reservationWei(sponsor.policy, intent.envelope.deploymentCalls.length);
```

(the per-row division by `intent.envelope.chainIds.length` below it is unchanged).

Run: `npx vitest run test/sponsor/relayr.test.ts test/sponsor/policy.test.ts test/app.test.ts`
Expected: PASS — the three new lane blocks and the existing ones.

- [ ] **Step 5: Commit**

```bash
git add src/rest/sponsorship/provider.ts src/sponsor/relayr.ts src/sponsor/policy.ts src/app.ts test/rest-sponsorship-provider.test.ts test/sponsor/relayr.test.ts
git commit -m "$(cat <<'EOF'
Put each chain's Safe creations in the sponsored bundle

A setup call becomes a plain independent entry on the canonical factory with no
value and no nonce, simulated from the sponsor and capped by the sponsor gas
limit. The reservation counts committed calls.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: A hash per entry, a row per chain

**Files:**
- Modify: `src/sponsor/relayr.ts`
- Test: `test/sponsor/relayr.test.ts`

**Interfaces:**
- Consumes: `EntryRole` from Task 3; `export type LaneReport` with `sent(chainId, transactionHash, bundleUuid)` and `confirmed(chainId, transactionHash, projectId)`; `export const CREATE_TOPIC` from `src/sponsor/chain.ts`; `same`, `hash as isHash`, `object` from `src/rest/sponsorship/validation.ts`.
- Produces (module-private): `type EntryHash = EntryRole & { hash: Hex }`; `settle({ intentId, chainIds, bundleUuid, hashesFrom: (status: unknown) => EntryHash[], report, track })`; `function resumedEntries(status: unknown, bundleUuid: string, calls: readonly DeploymentCall[]): EntryHash[]`.

- [ ] **Step 1: Write the failing tests**

The `fakeProvider` already echoes each submitted entry, so its `hashes` map moves from chain to entry index:

```ts
  const status = vi.fn(async () => {
    polls += 1;
    const ready = polls >= options.hashAfter;
    return {
      bundle_uuid: BUNDLE,
      transactions: submitted.map((entry, index) => ({
        tx_uuid: TX_UUIDS[index]!,
        request: { ...entry },
        status: ready
          ? { state: "Included", data: { hash: options.entryHash(entry, index) } }
          : { state: "Pending", data: {} },
      })),
    };
  });
```

with the harness default `entryHash: (entry, index) => (entry.target === SAFE_FACTORY ? setupHash(entry.chain, index) : deployHash(entry.chain))` and `const setupHash = (chainId: number, index: number) => \`0x${chainId.toString(16).padStart(8, "0")}${index.toString(16).padStart(2, "0")}${"88".repeat(27)}\` as Hex;`. Receipts for those hashes are registered in `harness` as successful non-`Create` receipts.

New tests:

```ts
  test("reports sent and confirmed on the launch hash while a chain also creates a Safe", async () => {
    const chainIds = [8453, 10];
    const { hashes, lane, laneEvents, report } = harness({
      chainIds,
      paymentChainId: 8453,
      hashAfter: 1,
      projectIds: ["12", "3"],
      setupPerChain: 1,
    });

    await lane.deploy(intent(chainIds, 1), chainIds, report);

    expect(report.sent).toHaveBeenCalledTimes(2);
    expect(report.sent).toHaveBeenCalledWith(8453, hashes.get(8453), BUNDLE);
    expect(report.sent).toHaveBeenCalledWith(10, hashes.get(10), BUNDLE);
    expect(report.confirmed).toHaveBeenCalledWith(8453, hashes.get(8453), "12");
    expect(report.confirmed).toHaveBeenCalledWith(10, hashes.get(10), "3");
    expect(laneEvents.filter((event) => event.event === "sent")).toHaveLength(2);
    expect(report.failed).not.toHaveBeenCalled();
  });

  test("resume reads the launch hash of a bundle that also created Safes", async () => {
    const chainIds = [8453, 10];
    const { hashes, lane, prepayments, provider, report } = harness({
      chainIds,
      paymentChainId: 8453,
      hashAfter: 1,
      projectIds: ["12", "3"],
      setupPerChain: 2,
      submittedForResume: true,
    });

    await lane.resume(intent(chainIds, 2), chainIds, BUNDLE, report);

    expect(provider.create).not.toHaveBeenCalled();
    expect(prepayments).toHaveLength(0);
    expect(report.sent).toHaveBeenCalledTimes(2);
    expect(report.sent).toHaveBeenCalledWith(8453, hashes.get(8453), BUNDLE);
    expect(report.confirmed).toHaveBeenCalledWith(10, hashes.get(10), "3");
  });

  test("resume refuses a bundle that carries two launches for one chain", async () => {
    const chainIds = [8453];
    const { lane, report } = harness({
      chainIds,
      paymentChainId: 8453,
      hashAfter: 1,
      projectIds: ["12"],
      setupPerChain: 1,
      submittedForResume: true,
      extraLaunch: 8453,
    });

    await expect(lane.resume(intent(chainIds, 1), chainIds, BUNDLE, report)).rejects.toMatchObject({
      code: "RELAYR_INVALID_STATUS",
    });
    expect(report.confirmed).not.toHaveBeenCalled();
  });
```

`submittedForResume` seeds `fakeProvider`'s `submitted` with the setup entries (factory target, the same `safeCall` data) plus one forwarder entry per chain, which is what a paid bundle echoes; `extraLaunch` appends a second forwarder entry for that chain.

Run: `npx vitest run test/sponsor/relayr.test.ts`
Expected: FAIL — `settle` keys everything by chain, so the Safe hash is taken for the chain's `sent` hash, and `resumedHashes` collapses the chain's transactions into one.

- [ ] **Step 2: Settle per entry**

Replace `settle` and `resumedHashes` in `src/sponsor/relayr.ts`:

```ts
  type EntryHash = EntryRole & { hash: Hex };

  /** Follow one submitted bundle to its destination receipts; chains that revert fail alone. */
  async function settle(options: {
    intentId: string;
    chainIds: number[];
    bundleUuid: string;
    hashesFrom: (status: unknown) => EntryHash[];
    report: LaneReport;
    track: ReturnType<typeof tracker>;
  }): Promise<void> {
    const { intentId, chainIds, bundleUuid, hashesFrom, report, track } = options;
    const launches = new Map<number, Hex>();
    const setups: EntryHash[] = [];
    const started = now();
    // A chain's outcome is its launch; a Safe creation is only observed.
    while (launches.size < chainIds.length) {
      if (now() - started > POLL_LIMIT_MS) throw new LaneError(NOT_EXECUTED, "RELAYR_TIMEOUT");
      for (const found of hashesFrom(await provider.status(bundleUuid))) {
        if (!chainIds.includes(found.chainId)) continue;
        if (found.role === "setup") {
          if (!setups.some((seen) => seen.chainId === found.chainId && seen.index === found.index))
            setups.push(found);
          continue;
        }
        if (launches.has(found.chainId)) continue;
        launches.set(found.chainId, found.hash);
        await report.sent(found.chainId, found.hash, bundleUuid);
        onEvent({ event: "sent", intentId, chainId: found.chainId, transactionHash: found.hash });
      }
      if (launches.size < chainIds.length) await wait(POLL_INTERVAL_MS);
    }

    for (const chainId of chainIds) {
      const hash = launches.get(chainId)!;
      const receipt = await client(chainId).waitForTransactionReceipt({
        hash,
        confirmations: policy.confirmations,
        timeout: RECEIPT_TIMEOUT_MS,
      });
      if (receipt.status !== "success") {
        await track.fail(chainId, "the relayed deployment reverted");
        continue;
      }
      const created = receipt.logs.find(
        (log) =>
          log.address.toLowerCase() === projectsAddress.toLowerCase() && log.topics[0] === CREATE_TOPIC,
      );
      if (!created?.topics[1]) {
        await track.fail(chainId, "the relayed deployment logged no Create event");
        continue;
      }
      const projectId = BigInt(created.topics[1]).toString();
      await track.confirm(chainId, hash, projectId);
      onEvent({ event: "confirmed", intentId, chainId, projectId });
    }
    await observeSetups(intentId, setups);
  }
```

`observeSetups` arrives in Task 5; for this step it is:

```ts
  async function observeSetups(_intentId: string, _setups: EntryHash[]): Promise<void> {}
```

`deploy` passes its roles:

```ts
        hashesFrom: (status) => {
          const found: EntryHash[] = [];
          for (const item of parseStatus(status, quote)) {
            const role = roles[item.step];
            if (item.hash && role) found.push({ ...role, hash: item.hash });
          }
          return found;
        },
```

`resume` passes the committed calls:

```ts
    async resume(intent, chainIds, bundleUuid, report) {
      const track = tracker(chainIds, report);
      await settle({
        intentId: intent.id,
        chainIds,
        bundleUuid,
        hashesFrom: (status) => resumedEntries(status, bundleUuid, intent.envelope.deploymentCalls),
        report,
        track,
      });
    },
```

```ts
/** A resumed bundle has no retained quote to bind against, so entries are read
 * defensively: a Safe creation is the factory carrying one of the chain's committed
 * setup calls, and the one remaining call on a chain is its launch. */
function resumedEntries(
  status: unknown,
  bundleUuid: string,
  calls: readonly DeploymentCall[],
): EntryHash[] {
  if (!object(status) || status.bundle_uuid !== bundleUuid || !Array.isArray(status.transactions))
    throw new LaneError(
      "the execution service status does not match the stored bundle",
      "RELAYR_INVALID_STATUS",
    );
  const found: EntryHash[] = [];
  for (const item of status.transactions) {
    if (!object(item) || !object(item.request) || !object(item.status)) continue;
    const request = item.request;
    const details = object(item.status.data) ? item.status.data : {};
    const nested = object(details.transaction) ? details.transaction.hash : undefined;
    const transactionHash = details.hash ?? nested;
    const chainId = request.chain;
    if (typeof chainId !== "number" || !isHash(transactionHash)) continue;
    const { setup } = callsForChain(calls, chainId);
    const index =
      typeof request.target === "string" && same(request.target, SAFE_FACTORY)
        ? setup.findIndex(
            (call) => typeof request.data === "string" && same(request.data, call.data),
          )
        : -1;
    found.push(
      index < 0
        ? { chainId, role: "launch", index: setup.length, hash: transactionHash }
        : { chainId, role: "setup", index, hash: transactionHash },
    );
  }
  const launches = found.filter((item) => item.role === "launch").map((item) => item.chainId);
  if (new Set(launches).size !== launches.length)
    throw new LaneError(
      "the execution service status does not match the stored bundle",
      "RELAYR_INVALID_STATUS",
    );
  return found;
}
```

Add `same` to the existing `../rest/sponsorship/validation.js` import and `DeploymentCall` to the `../types.js` import.

Run: `npx vitest run test/sponsor/relayr.test.ts test/sponsor/worker.test.ts`
Expected: PASS — the three new blocks and every existing block, including `raises a timeout, retiring nothing`, which still counts 181 polls because the launch hash is what the loop waits for.

- [ ] **Step 3: Commit**

```bash
git add src/sponsor/relayr.ts test/sponsor/relayr.test.ts
git commit -m "$(cat <<'EOF'
Collect a hash per bundle entry and key a chain on its launch

A chain is sent when its launch entry has a hash and confirmed on the launch
receipt. A resumed bundle recognizes a Safe creation by the factory and the
chain's own committed calldata.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Skip a Safe that exists, log one that reverted

**Files:**
- Modify: `src/sponsor/chain.ts`, `src/sponsor/relayr.ts`
- Test: `test/sponsor/relayr.test.ts`

**Interfaces:**
- Consumes: `predictSafeAddress(setup, proxyCreationCode): Address` from Task 1; `EntryHash` from Task 4.
- Produces from `src/sponsor/chain.ts`, three additions to `export type SponsorEvent`:
  - `| { event: "setup_skipped"; intentId: string; chainId: number; index: number; safe: Address }`
  - `| { event: "setup_reverted"; intentId: string; chainId: number; index: number; transactionHash: Hex }`
  - `| { event: "setup_unobserved"; intentId: string; chainId: number; index: number; transactionHash: Hex }`

- [ ] **Step 1: Write the failing tests**

```ts
  test("skips the Safe a chain already has and keeps the launch", async () => {
    const chainIds = [8453];
    const { lane, laneEvents, provider, report } = harness({
      chainIds,
      paymentChainId: 8453,
      hashAfter: 1,
      projectIds: ["12"],
      setupPerChain: 1,
      // Every address but the factory answers with code, so the predicted Safe exists.
      code: () => FACTORY_RUNTIME,
    });

    await lane.deploy(intent(chainIds, 1), chainIds, report);

    const entries = provider.create.mock.calls[0]![0];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ target: FORWARDER, virtual_nonce: 0 });
    expect(laneEvents).toContainEqual(
      expect.objectContaining({ event: "setup_skipped", chainId: 8453, index: 0 }),
    );
    expect(report.confirmed).toHaveBeenCalledTimes(1);
    expect(report.failed).not.toHaveBeenCalled();
  });

  test("logs a reverted Safe creation and still confirms the chain", async () => {
    const chainIds = [8453];
    const { hashes, lane, laneEvents, report } = harness({
      chainIds,
      paymentChainId: 8453,
      hashAfter: 1,
      projectIds: ["12"],
      setupPerChain: 1,
      revertedSetups: true,
    });

    await lane.deploy(intent(chainIds, 1), chainIds, report);

    expect(laneEvents).toContainEqual({
      event: "setup_reverted",
      intentId: "intent-1",
      chainId: 8453,
      index: 0,
      transactionHash: setupHash(8453, 0),
    });
    expect(report.failed).not.toHaveBeenCalled();
    expect(report.confirmed).toHaveBeenCalledWith(8453, hashes.get(8453), "12");
  });

  test("logs a Safe creation whose receipt never arrives without failing the chain", async () => {
    const chainIds = [8453];
    const { hashes, lane, laneEvents, report } = harness({
      chainIds,
      paymentChainId: 8453,
      hashAfter: 1,
      projectIds: ["12"],
      setupPerChain: 1,
      missingSetupReceipts: true,
    });

    await lane.deploy(intent(chainIds, 1), chainIds, report);

    expect(laneEvents).toContainEqual(
      expect.objectContaining({ event: "setup_unobserved", chainId: 8453, index: 0 }),
    );
    expect(report.confirmed).toHaveBeenCalledWith(8453, hashes.get(8453), "12");
    expect(report.failed).not.toHaveBeenCalled();
  });
```

`missingSetupReceipts` leaves the setup hash out of the receipts map and gives the lane a `wait` that advances the clock, so `waitForTransactionReceipt` gives up inside `RECEIPT_TIMEOUT_MS`.

Run: `npx vitest run test/sponsor/relayr.test.ts`
Expected: FAIL — the existing Safe is still paid for and no setup event is logged.

- [ ] **Step 2: Add the events and the skip**

In `src/sponsor/chain.ts`, extend `SponsorEvent` with the three variants above (`Address` is already imported).

In `src/sponsor/relayr.ts`, inside the setup loop, between the decode and the simulation:

```ts
          const creationCode = await proxyCreationCode(chainId);
          const safe = predictSafeAddress(plan, creationCode);
          const existing = await client(chainId).getCode({ address: safe });
          if (existing && existing !== "0x") {
            // The merchant or an earlier attempt already created it; the launch stands.
            onEvent({ event: "setup_skipped", intentId: intent.id, chainId, index: position, safe });
            continue;
          }
```

and replace the placeholder with:

```ts
  /** A Safe creation only has to be observed. The project is owned by the predicted
   * address whether or not the proxy exists yet, and anyone can create it later. */
  async function observeSetups(intentId: string, setups: EntryHash[]): Promise<void> {
    for (const item of setups) {
      try {
        const receipt = await client(item.chainId).waitForTransactionReceipt({
          hash: item.hash,
          confirmations: policy.confirmations,
          timeout: RECEIPT_TIMEOUT_MS,
        });
        if (receipt.status !== "success")
          onEvent({
            event: "setup_reverted",
            intentId,
            chainId: item.chainId,
            index: item.index,
            transactionHash: item.hash,
          });
      } catch {
        onEvent({
          event: "setup_unobserved",
          intentId,
          chainId: item.chainId,
          index: item.index,
          transactionHash: item.hash,
        });
      }
    }
  }
```

Run: `npx vitest run test/sponsor/relayr.test.ts test/sponsor/worker.test.ts test/sponsor/chain.test.ts`
Expected: PASS — the three new blocks and every existing block.

- [ ] **Step 3: Full suite and typecheck**

```bash
npm run typecheck
source /private/tmp/claude-501/-Users-jango-Documents-jb-v6-evm/9db55714-fdc8-48c3-8caa-82ce9d03b7f4/scratchpad/center-test.env && npx vitest run
```

Expected: typecheck clean; vitest green except a known wallet-timing flake, which re-runs green on its own file.

- [ ] **Step 4: Commit**

```bash
git add src/sponsor/chain.ts src/sponsor/relayr.ts test/sponsor/relayr.test.ts
git commit -m "$(cat <<'EOF'
Skip a Safe that already exists and log one that reverted

A predicted Safe with code costs nothing and leaves the bundle. A reverted or
unobserved creation receipt is logged with its chain and index and never fails
the chain's row.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: The rule in the guide, the README, `/llms.txt` and the MCP

**Files:**
- Modify: `docs/rest/PROJECT_INTENTS.md`, `README.md`, `src/llms.ts`
- Modify: `mcp/src/application/operations.ts`, `mcp/src/adapters/jbcenter.ts`
- Test: `test/rest-guide.test.ts`, `test/app.test.ts`, `mcp/tests/adapters/jbcenter.test.ts`

**Interfaces:**
- Consumes: `export const REST_DOCUMENTS` from `src/rest/site.ts`; `export function llmsIndex(audience = "https://juicebox.center"): string` from `src/llms.ts`; `export function normalizeCenterIntent<TJb extends JBCenterJsonObject>(value: JBCenterIntentInput<TJb>): JBCenterIntentInput<TJb>` from `mcp/src/adapters/jbcenter.ts`.
- Produces: no new exports. `centerIntentEnvelopeShape.deploymentCalls` and the adapter's `envelopeSchema.deploymentCalls` accept `.min(1).max(64)`, and `normalizeCenterIntent` enforces 1 to 4 calls per declared chain.

- [ ] **Step 1: Write the failing tests**

Append to `test/rest-guide.test.ts`, inside the existing `describe`:

```ts
  it("documents the setup-call rule with the canonical Safe addresses", async () => {
    const markdown = await readFile(new URL("../docs/rest/PROJECT_INTENTS.md", import.meta.url), "utf8");
    expect(markdown).toContain("## Setup calls");
    expect(markdown).toContain("0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67");
    expect(markdown).toContain("0x41675C099F32341bf84BFc5382aF534df5C7461a");
    expect(markdown).toContain("0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99");
    expect(markdown).toContain("jb.safes");
    expect(markdown).toContain("1 to 4 calls");
    expect(markdown).not.toMatch(/exactly one .*call per/i);
  });
```

Append to `test/app.test.ts` inside the discovery test:

```ts
    expect(discovery).toContain("create its Safes and then launch");
```

Append to `mcp/tests/adapters/jbcenter.test.ts`:

```ts
  it('keeps a chain\'s setup calls in order and refuses a fifth call', () => {
    const calls = [
      { chainId: 8453, to: FACTORY, data: '0xaaaaaaaa' },
      { chainId: 1, to: TERMINAL, data: '0x12345678' },
      { chainId: 8453, to: FACTORY, data: '0xbbbbbbbb' },
      { chainId: 8453, to: TERMINAL, data: '0x12345678' },
    ];
    const normalized = normalizeCenterIntent({ ...envelope, chainIds: [8453, 1], deploymentCalls: calls });
    expect(normalized.deploymentCalls.map((call) => [call.chainId, call.data])).toEqual([
      [1, '0x12345678'],
      [8453, '0xaaaaaaaa'],
      [8453, '0xbbbbbbbb'],
      [8453, '0x12345678'],
    ]);
    expect(() =>
      normalizeCenterIntent({
        ...envelope,
        chainIds: [8453],
        deploymentCalls: [
          { chainId: 8453, to: FACTORY, data: '0xaaaaaaaa' },
          { chainId: 8453, to: FACTORY, data: '0xbbbbbbbb' },
          { chainId: 8453, to: FACTORY, data: '0xcccccccc' },
          { chainId: 8453, to: FACTORY, data: '0xdddddddd' },
          { chainId: 8453, to: TERMINAL, data: '0x12345678' },
        ],
      }),
    ).toThrow();
  });
```

Run: `npx vitest run test/rest-guide.test.ts test/app.test.ts` and `npm --prefix mcp run test -- tests/adapters/jbcenter.test.ts`
Expected: FAIL — the guide has no setup-call section, `/llms.txt` has no such phrase, and the adapter refuses two calls for one chain.

- [ ] **Step 2: Widen the MCP envelope shape**

In `mcp/src/application/operations.ts`:

```ts
  deploymentCalls: z
    .array(z.object({ chainId: chainIdSchema, to: addressSchema, data: hexSchema }).strict())
    .min(1)
    .max(64),
```

In `mcp/src/adapters/jbcenter.ts`, raise the same `.max(16)` to `.max(64)` and replace the index check in `normalizeCenterIntent`:

```ts
  // The last call for a chain launches the project; Center validates what the earlier
  // ones may do. A stable sort keeps each chain's calls in the order they were signed.
  const perChain = new Map<number, number>();
  for (const call of deploymentCalls) perChain.set(call.chainId, (perChain.get(call.chainId) ?? 0) + 1);
  if (
    perChain.size !== chainIds.length ||
    chainIds.some((chainId) => !perChain.has(chainId)) ||
    [...perChain.values()].some((count) => count > 4)
  )
    invalidInput();
```

Run: `npm --prefix mcp run test -- tests/adapters/jbcenter.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the guide section**

In `docs/rest/PROJECT_INTENTS.md`, replace the `deploymentCalls` table row with

```
| `deploymentCalls` | array | 1 to 4 `{chainId, to, data}` calls for each member of `chainIds`, between 4 bytes and 4 MiB each. The last call for a chain is its launch call; see "Setup calls". `to` is checksummed; `data` is stored lowercased and matched case-insensitively when a self-paid deployment is verified. Center sorts by `chainId` before hashing and keeps each chain's calls in the order they were signed |
```

and add, after "Launch entry points":

````markdown
## Setup calls

A chain may carry more than one call. **The last call for a chain is the launch call;
every call before it is a setup call.** One call per chain is a launch call, so every
intent published before this rule existed is unchanged.

A setup call creates a Safe. Center pays for it, so it is the only thing a setup call may
do:

| Part | Required value |
|---|---|
| `to` | `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67`, the Safe 1.4.1 proxy factory. Its runtime code is checked on the chain before the sponsor pays |
| `data` | `createProxyWithNonce(singleton, initializer, saltNonce)`, encoded exactly |
| `singleton` | `0x41675C099F32341bf84BFc5382aF534df5C7461a` |
| `initializer` | `setup(owners, threshold, address(0), 0x, 0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99, address(0), 0, address(0))` |
| `owners` | 1 to 20 unique nonzero addresses |
| `threshold` | 1 to `owners.length` |

Anything else is refused with `400` and a message naming the call index, for example
`deploymentCalls[0].to must be the canonical Safe proxy factory`. A chain accepts at most
four calls, so at most three Safes.

A Safe 1.4.1 address depends only on the factory, the singleton, the initializer and the
salt nonce. It never depends on the sender or the time. So the Safe creation and the
launch are independent: the project can be transferred to the Safe address before the
Safe exists, and the Safe accepts the project whenever it is created. A Safe that already
exists at the predicted address costs nothing: Center drops that call from the bundle. A
Safe creation that reverts does not fail the chain; the project is owned by the predicted
address either way and anyone can create the Safe later.

The sponsored deploy sends one bundle for all chains. Each chain's row is `sent` on its
launch transaction hash and `confirmed` when that transaction succeeds and carries the
`JBProjects.Create` event. `transactionHash` on the row and on the recorded deployment is
always the launch transaction.

### `jb.safes`

Center stores `jb` as it is given. The convention for rendering a Safe is:

```json
"safes": [
  {
    "role": "owner",
    "address": "0x...",
    "owners": ["0x...", "0x..."],
    "threshold": 2,
    "saltNonce": "0x..."
  }
]
```

### A Homerun fund that creates its own 2-of-2 owner Safe

```ts
import { buildSafeDeploymentCalls, predictSafeAddress } from "@bananapus/nana-sdk-core/safe";

const owner = { owners: [alice, bob], threshold: 2, saltNonce, proxyCreationCode };
const safe = predictSafeAddress(owner);

const deploymentCalls = chainIds.flatMap((chainId) => [
  ...buildSafeDeploymentCalls([owner]).map((call) => ({ chainId, to: call.to, data: call.data })),
  {
    chainId,
    to: homerunDeployer[chainId],
    data: encodeFunctionData({
      abi: homerunAbi,
      functionName: "launchFundFor",
      args: [safe, /* the rest of the fund */],
    }),
  },
]);

const envelope = {
  format: "homerun.money/fund.v1",
  deploymentVersion: "6",
  chainIds,
  deploymentCalls,
  jb: { ...formValues, owner: safe, safes: [{ role: "owner", address: safe, ...owner }] },
};
```

`jb.owner` is the Safe address, so the intent appears under `GET /v1/search?owner=`. A page
that lists "my projects" also filters by `publisher`, because the publishing wallet is an
owner of the Safe, not the project's owner.
````

- [ ] **Step 4: README and `/llms.txt`**

In `README.md`, replace

```
`deploymentCalls` must contain exactly one ABI-encoded call per
chain.
```

with

```
`deploymentCalls` holds 1 to 4 ABI-encoded calls per chain. The last call for a chain
launches the project; each earlier call creates a Safe on the canonical Safe 1.4.1 proxy
factory, so an intent can create the multisig that owns it. See
[the guide](docs/rest/PROJECT_INTENTS.md#setup-calls).
```

In `src/llms.ts`, extend the project-intents line:

```ts
- [Project intents](${origin}/api/docs/project-intents): \`POST ${origin}/v1/intents\` publishes a signed, frozen project deployment; \`POST ${origin}/v1/intents/:id/deploy\` requests a sponsored execution of its own calls, which may create its Safes and then launch.
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
git add docs/rest/PROJECT_INTENTS.md README.md src/llms.ts mcp/src/application/operations.ts mcp/src/adapters/jbcenter.ts test/rest-guide.test.ts test/app.test.ts mcp/tests/adapters/jbcenter.test.ts
git commit -m "$(cat <<'EOF'
Document setup calls and accept them in the MCP envelope

The guide gains the rule, the canonical Safe addresses, the deterministic-address
argument, the jb.safes convention and a worked Homerun example. The MCP envelope
shape takes 1 to 4 calls per chain.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review: spec coverage

Work through this list before opening the PR; each line names where the requirement is met and how it is proved.

**Section 1, envelope**

| Requirement | Where | Proof |
|---|---|---|
| One flat array, 1 or more calls per chain, last is the launch | `src/intent.ts` `deploymentCalls`, `callsForChain` | `test/intent.test.ts` "accepts one, two and three setup calls before the launch call" |
| A single call per chain is unchanged and every existing intent stays valid | the same grouping, stable sort | `test/intent.test.ts` existing hash test and "hashes the setup calls with the rest of the envelope"; `test/sponsor/relayr.test.ts` existing single-call blocks untouched |
| At most 4 calls per chain, at most 16 chains, 4 MiB per call | `MAX_CALLS_PER_CHAIN`, the unchanged `chainIds` and `MAX_CALL_DATA_BYTES` checks | `test/intent.test.ts` "refuses a fifth call on one chain and a chain with no call" |
| Setup `to` is the canonical factory, runtime hash checked at deploy time | `src/intent.ts`; `creationCodeReader` in `src/sponsor/relayr.ts` | `test/intent.test.ts` "names the call index it refuses"; `test/sponsor/relayr.test.ts` "refuses to pay a factory whose runtime is not canonical" |
| `createProxyWithNonce` with the canonical singleton and a plain `setup` initializer, 1 to 20 unique nonzero owners, threshold in range, canonical fallback handler | `decodeSafeSetupCall` in `src/safe.ts` | `test/safe.test.ts` three refusal blocks |
| Setup calls carry no value and are not forwarded | the entry literal `{ chain, target: SAFE_FACTORY, data, value: "0" }` with no `virtual_nonce` | `test/sponsor/relayr.test.ts` "puts each chain's Safe creation in the bundle before its launch" |
| Publish refuses with a 400 naming the call index | the thrown messages start with `deploymentCalls`, which `src/app.ts` `onError` maps to `bad_request` | `test/app.test.ts` "publishes an intent whose chain creates a Safe before it launches" |
| The content hash covers the whole array; `format`, the signing message and `jb` are unchanged | no change to `canonicalJson`, `contentHash`, `signingMessage` | `test/intent.test.ts` hash blocks |

**Section 2, sponsor lane**

| Requirement | Where | Proof |
|---|---|---|
| The launch is prepared as today: fee, balance, forwarder wrap, signature | the unchanged block in `deploy` | existing `test/sponsor/relayr.test.ts` blocks stay green |
| Each setup call is a plain independent entry simulated from the sponsor with `eth_call` and `eth_estimateGas`, capped by the sponsor gas limit | the setup loop in `deploy` | "puts each chain's Safe creation…" and "fails every chain when a Safe creation needs more gas than the sponsor cap" |
| A predicted Safe with code skips its entry | `predictSafeAddress` plus the `getCode` check | "skips the Safe a chain already has and keeps the launch" |
| One bundle, one prepayment, all chains | `provider.create(entries)` unchanged, one `report.bundle`, one prepayment | existing prepayment blocks plus the new bundle-shape assertions |
| Quote entries carry chain and role | `roles: EntryRole[]` aligned with `entries`, consumed in `hashesFrom` | "reports sent and confirmed on the launch hash…" |
| `sent` on the launch hash, `confirmed` on the launch receipt with `Create`; the row records the launch hash | `settle` | the same block, plus `test/sponsor/worker.test.ts` "worker verifies the launch call…" |
| Setup receipts are awaited; a reverted one logs `setup_reverted` with chain and index and does not fail the row | `observeSetups` | "logs a reverted Safe creation and still confirms the chain" and "…whose receipt never arrives…" |
| `resume` reads hashes per entry from the stored bundle | `resumedEntries` | "resume reads the launch hash of a bundle that also created Safes" and the two-launch refusal |
| The verifier is unchanged and the recorded deployment is the launch transaction | `src/deploymentVerifier.ts` untouched; `src/sponsor/worker.ts` passes the launch call | `test/deploymentVerifier.test.ts` untouched and green; the worker block |
| The retry rules are unchanged | `laneOutcome` and `RETRY_UNPAID` untouched; new codes are terminal by default and a paid bundle still retries | `test/sponsor/chain.test.ts` untouched and green |

**Section 3, read side and docs**

| Requirement | Where | Proof |
|---|---|---|
| `GET /v1/intents/:id` returns `deploymentCalls` as stored | no route change; the store round-trips the array | `test/postgres.integration.test.ts` "stores every call of a chain in its signed order" |
| Search rows are unchanged | no change to `search` or its filters | existing search tests green |
| The guide gains a "Setup calls" section with the rule, the canonical addresses, the determinism argument, `jb.safes` and a worked Homerun example | `docs/rest/PROJECT_INTENTS.md` | `test/rest-guide.test.ts` "documents the setup-call rule with the canonical Safe addresses" |
| README, `/llms.txt` and the MCP `publish_intent` envelope shape follow | `README.md`, `src/llms.ts`, `mcp/src/application/operations.ts`, `mcp/src/adapters/jbcenter.ts` | `test/app.test.ts` discovery assertion and the MCP adapter block |

**Out of scope, confirm nothing crept in:** setup calls to anything but the Safe factory, Safe modules or guards, ordering guarantees between a setup call and the launch, ERC-1271 publishing, a Safe-connected publisher, the SDK, Homerun, and `mcp/data/knowledge.json`.

**Final check:** `git log --oneline main..HEAD` shows six commits, each ending with the required trailer; `git diff --stat main..HEAD` touches no file outside the list in "File Structure"; `grep -rn "draft" src/safe.ts src/sponsor docs/rest/PROJECT_INTENTS.md` returns only the pre-existing `.jb` chain reader in `src/intent.ts`, which this work does not modify.
