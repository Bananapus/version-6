# Intent Setup Calls — SDK 2.9.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@bananapus/nana-sdk-core/jbcenter` reads and validates intents whose `deploymentCalls` carry Safe creation calls before the launch call — Center's rule mirrored, a `safe-create` decode flavor with a chain-free predicted address, and one `intentCalls` helper every client renders from — released as 2.9.0.

**Architecture:** One pinned constant in `packages/core/src/safe.ts` (the canonical SafeProxyFactory 1.4.1 `proxyCreationCode`) makes `predictSafeAddress` usable with no RPC. `decode.ts` gains a `safe-create` decoder that reads `createProxyWithNonce(singleton, initializer, saltNonce)` back into owners, threshold, fallback handler and the address the factory would produce. A new framework-free module `packages/core/src/jbcenter/setupCalls.ts` owns one rule — group by chain, 1 to 4 calls per chain, last call is the launch, every earlier call must decode as `safe-create` — and `jbcenter.ts`'s response validator plus the new `intentCalls` helper both read it from there. Nothing else changes: `intentRow`, `mergeSearch`, `ensureDeployed`, `publishSignedIntent` are untouched.

**Tech Stack:** Node 22.23.1 (`.nvmrc`), npm 10.9.8, TypeScript 5.4 (`strict`, `noUnusedLocals`, `NodeNext`), viem 2.37.5, vitest 3.2 with v8 coverage, turbo, Changesets, prettier 3.

**Spec:** `/Users/jango/Documents/jb/v6/evm/docs/superpowers/specs/2026-09-22-intent-setup-calls-safe-owners-design.md` — **section 4 (SDK) only**. Section 1 and 2 are Center's, section 5 is Homerun's, section 6 is a later port; do not touch them.

**Repo:** `https://github.com/Bananapus/juice-sdk-v4`. Local worktree: `/Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls`, already on branch `feat/intent-setup-calls` off `main` at `1b8bfef`. Package under change: `packages/core` = `@bananapus/nana-sdk-core`, currently 2.8.0.

## Global Constraints

- **Never write the word "draft"** — not in code, comments, tests, README, changeset, commit messages, or the PR body. (The existing `## Inline Safe creation` README block contains it; leave that line alone, do not add another.)
- **No retrospective comments.** Comments explain the code as it stands, never what it used to do, what was fixed, or what a review said.
- **No emoji** anywhere in code, tests, docs, or commit messages. The PR body's single trailer line is the only exception, and it is quoted verbatim in Task 5.
- **Framework-free.** Everything added here is plain TypeScript over viem. No React, no wallet, no network access at decode time: `decodeDeploymentCall` must stay synchronous and must never take a client.
- **Wallet boundary.** `scripts/check-wallet-boundaries.mjs` flags any call whose callee or property name is in its API set (`signMessage`, `signTypedData`, `sendTransaction`, `writeContract`, `request`, …) and any of the signing RPC method strings, in every non-test file under `packages/core/src`. Nothing in this plan calls any of them; keep it that way.
- **Import-cycle rule** (from `ensureDeployed.ts`'s own comment): `jbcenter.ts` re-exports its submodules, so the two sides form a cycle under CJS. `setupCalls.ts` and `decode.ts` may import **types** from `../jbcenter.js` at the top level (`import type`, erased at runtime) and must never read a **value** from it. `jbcenter.ts` importing values from `./jbcenter/setupCalls.js` is fine because the dependency runs one way.
- **Center mirror, with two documented tightenings.** The SDK's rule is the spec's rule (1 to 4 calls per chain, last is the launch, setup calls only to `SAFE_FACTORY` with a well-formed `createProxyWithNonce`, initializer `setup(owners 1..20 unique nonzero, threshold in [1, n], address(0), 0x, SAFE_FALLBACK, address(0), 0, address(0))`). Two places are strictly stronger because the SDK also computes the address: (a) the calldata must be the **canonical ABI encoding** — a re-encode must reproduce it byte for byte; (b) the sentinel owner `0x0000000000000000000000000000000000000001` is rejected, because `buildSafeInitializer` rejects it and Safe's own `setup` would revert on it. Both are pinned by tests in Task 2. If Center ever accepts calldata these reject, raise it with Center rather than loosening here.
- **Coverage.** `packages/core/vitest.config.ts` enforces global floors statements 95 / branches 82 / functions 92 / lines 95, plus per-file 100/100/100/100 entries for five existing modules. This plan adds a per-file 100% entry for `src/jbcenter/setupCalls.ts` (Task 3), so every line and branch of that module must be covered by its own tests. `decode.ts` and `safe.ts` have no per-file entry; keep them from dragging the global floors down by covering every new rejection branch.
- **Prettier.** Run `npm run format` (root: `prettier --write "**/*.{ts,tsx,md}"`) before every commit. `npm run format:ratchet` fails on any file that is newly unformatted and not in `test/format-debt.json`; never add a file to that fixture.
- **Node 22 via nvm.** Run `nvm use` in the worktree (reads `.nvmrc` = `22.23.1`) before any npm command, and confirm `npm --version` prints `10.9.8` — CI hard-asserts it.
- **Repo commands** (root `package.json`, mirrored by `.github/workflows/ci.yml`): tests `npm run test` (turbo → `vitest run`), coverage `npm run test:coverage`, types `npm run type-check` (`tsc --noEmit` plus `tsconfig.test.json`), build `npm run build`, dead code `npm run dead-code:check` (`knip --exclude duplicates`), package budget `npm run check:package`, wallet gate `npm run wallet:check`, format gate `npm run format:ratchet`, and the whole gate `npm run check`. `npm run check` also runs `protocol:check`, which passes without `PROTOCOL_DEPLOYMENTS_DIR` (it prints a note); set `PROTOCOL_DEPLOYMENTS_DIR=/Users/jango/Documents/jb/v6/evm/deploy-all-v6` only if you want the fixture verified against its source artifacts.
- **Stage by explicit path.** Every `git add` in this plan names each file. Never `git add -A`, `git add .`, or `git commit -a`.
- **Commit trailer.** Every commit message ends with a blank line and then:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`

---

## File map

**Create**
- `packages/core/src/jbcenter/setupCalls.ts` — one responsibility: the per-chain grouping rule. `groupDeploymentCalls`, `isValidDeploymentCalls` (the Center mirror, consumed by `jbcenter.ts`), `intentCalls` (the render helper), and the two types they return.
- `packages/core/src/jbcenter/setupCalls.test.ts`
- `.changeset/intent-setup-calls.md`

**Modify**
- `packages/core/src/safe.ts` — add the exported `SAFE_PROXY_CREATION_CODE` constant. Nothing else in that file changes; `readSafeCreationCode`, `resolveSafeAddress` and `checkSafeDeployments` keep reading the factory on chain.
- `packages/core/src/safe.test.ts` — pin the constant's keccak and the address the live factory returns for a known plan.
- `packages/core/src/jbcenter/decode.ts` — add the `safe-create` member to `JBCenterDecodedLaunch` and its decoder, first in `DECODERS`.
- `packages/core/src/jbcenter/decode.test.ts` — the accept case and the whole rejection table.
- `packages/core/src/jbcenter.ts` — `isEnvelope` calls the new rule instead of the one-call-per-chain check (around lines 387-401); re-export `intentCalls` and its types.
- `packages/core/src/jbcenter.test.ts` — envelope acceptance and rejection cases through `getIntent`.
- `packages/core/src/publicSurface.test.ts` — assert the new public exports.
- `packages/core/vitest.config.ts` — per-file 100% thresholds for `src/jbcenter/setupCalls.ts`.
- `README.md` (repo root; `packages/core` has no README). The `### Project intents` subsection starts at line 77 and the helper table at line 166.
- `scripts/check-package-budgets.mjs` — raise `@bananapus/nana-sdk-core.entries` if the measured count needs it (Task 5; one new source file emits eight dist artifacts).

---

### Task 1: Pin the Safe proxy creation code

**Files:**
- Modify: `packages/core/src/safe.ts` (after the `SAFE_FALLBACK`/`MULTICALL3`/`MAX_SAFE_OWNERS` block near line 36)
- Test: `packages/core/src/safe.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces, for Tasks 2 and 4:
  - `export const SAFE_PROXY_CREATION_CODE: Hex` — the 486-byte `proxyCreationCode()` of the canonical SafeProxyFactory 1.4.1 at `SAFE_FACTORY`.
  - It plugs into the existing `predictSafeAddress(plan: { owners: Address[]; threshold: number; saltNonce: Hex; proxyCreationCode: Hex }): Address`, whose signature does not change.

- [ ] **Step 0: Set the toolchain up**

```bash
cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls
nvm use
npm --version   # must print 10.9.8
npm ci
git status --short   # must be empty; branch is feat/intent-setup-calls
```

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/safe.test.ts`. Add `SAFE_PROXY_CREATION_CODE` to the existing `./safe.js` import list (it is alphabetically before `SAFE_SINGLETON`), and `keccak256` and `toHex` are already imported at the top of that file.

```ts
describe("SAFE_PROXY_CREATION_CODE", () => {
  test("is the canonical SafeProxyFactory 1.4.1 creation code", () => {
    // `cast call 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67 \
    //   "proxyCreationCode()(bytes)" --rpc-url https://mainnet.base.org`
    expect(SAFE_PROXY_CREATION_CODE).toMatch(/^0x(?:[\da-f]{2}){486}$/u);
    expect(keccak256(SAFE_PROXY_CREATION_CODE)).toBe(
      "0x1856e0ee08399d74e0ea0b03adca210aeade6f748969ac023cdcb4dd62dcaf5f",
    );
  });

  test("predicts the address the canonical factory itself returns", () => {
    // Ground truth from an `eth_call` of
    // `createProxyWithNonce(SAFE_SINGLETON, setup([0x..02, 0x..03], 2, 0, 0x,
    // SAFE_FALLBACK, 0, 0, 0), 42)` against the factory on Base.
    expect(
      predictSafeAddress({
        owners: [
          "0x0000000000000000000000000000000000000002",
          "0x0000000000000000000000000000000000000003",
        ],
        threshold: 2,
        saltNonce: toHex(42n, { size: 32 }),
        proxyCreationCode: SAFE_PROXY_CREATION_CODE,
      }),
    ).toBe("0x53a62fb237E097DEa3714015Bced94790fE5c3BB");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls/packages/core && npx vitest run src/safe.test.ts -t "SAFE_PROXY_CREATION_CODE"`
Expected: FAIL — `SAFE_PROXY_CREATION_CODE` is not exported by `./safe.js` (TypeScript/import error before any assertion runs).

- [ ] **Step 3: Pin the constant**

In `packages/core/src/safe.ts`, directly below `export const MAX_SAFE_OWNERS = 50;`:

```ts
/**
 * `SafeProxyFactory.proxyCreationCode()` at {@link SAFE_FACTORY}: the same
 * bytes wherever the canonical 1.4.1 factory is deployed. Pinned so an address
 * can be predicted from calldata alone. Reading it from a chain
 * ({@link readSafeCreationCode}) stays the rule for anything that is about to
 * be deployed; this constant is for reading a signed call back.
 */
export const SAFE_PROXY_CREATION_CODE: Hex =
  "0x608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101c46022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls/packages/core && npx vitest run src/safe.test.ts`
Expected: PASS — the whole `safe.test.ts` suite, including both new tests.

- [ ] **Step 5: Type-check and format**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls && npm run type-check && npm run format && npm run format:ratchet`
Expected: no type errors; prettier reports the two touched files as written or unchanged; the ratchet prints no unexpected file.

- [ ] **Step 6: Commit**

```bash
cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls
git add packages/core/src/safe.ts packages/core/src/safe.test.ts
git commit -m "$(cat <<'MSG'
Pin the canonical Safe 1.4.1 proxy creation code

Predicting a Safe address from a signed call has to work with no chain
read. The bytes are the factory's own proxyCreationCode(); the test pins
their keccak and the address the factory returns for a known plan.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: The `safe-create` decode flavor

**Files:**
- Modify: `packages/core/src/jbcenter/decode.ts`
- Test: `packages/core/src/jbcenter/decode.test.ts`

**Interfaces:**
- Consumes from Task 1: `SAFE_PROXY_CREATION_CODE: Hex` from `../safe.js`. Also from `../safe.js`, already present on `main`: `SAFE_FACTORY`, `SAFE_SINGLETON`, `SAFE_FALLBACK: Address`, `SAFE_CREATE_ABI` (parsed from `"function createProxyWithNonce(address singleton, bytes initializer, uint256 saltNonce) returns (address proxy)"` and `"function setup(address[] owners,uint256 threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address paymentReceiver)"`), `buildSafeInitializer(policy: { owners: readonly Address[]; threshold: number }): Hex`, `predictSafeAddress(plan: Omit<SafeDeploymentPlan, "address">): Address`.
- Produces, for Tasks 3 and 4: a new member of the exported union `JBCenterDecodedLaunch`:

```ts
| {
    flavor: "safe-create";
    to: Address;
    singleton: Address;
    saltNonce: Hex;
    owners: readonly Address[];
    threshold: number;
    fallbackHandler: Address;
    address: Address;
  }
```

  `decodeDeploymentCall(call: JBCenterDeploymentCall): JBCenterDecodedLaunch` keeps its signature and still returns `{ flavor: "unknown", to, selector }` for anything it does not recognize.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/jbcenter/decode.test.ts`. Add `concatHex` and `toHex` to its `viem` import, and add a `./safe.js`-side import block.

```ts
import {
  SAFE_CREATE_ABI,
  SAFE_FACTORY,
  SAFE_FALLBACK,
  SAFE_SINGLETON,
} from "../safe.js";
import type { Address, Hex } from "viem";

const SAFE_OWNERS: readonly Address[] = [
  "0x0000000000000000000000000000000000000002",
  "0x0000000000000000000000000000000000000003",
];

type SetupArgs = {
  owners: readonly Address[];
  threshold: bigint;
  to: Address;
  data: Hex;
  fallbackHandler: Address;
  paymentToken: Address;
  payment: bigint;
  paymentReceiver: Address;
};

const SETUP: SetupArgs = {
  owners: SAFE_OWNERS,
  threshold: 2n,
  to: zeroAddress,
  data: "0x",
  fallbackHandler: SAFE_FALLBACK,
  paymentToken: zeroAddress,
  payment: 0n,
  paymentReceiver: zeroAddress,
};

function initializer(overrides: Partial<SetupArgs> = {}): Hex {
  const args = { ...SETUP, ...overrides };
  return encodeFunctionData({
    abi: SAFE_CREATE_ABI,
    functionName: "setup",
    args: [
      args.owners,
      args.threshold,
      args.to,
      args.data,
      args.fallbackHandler,
      args.paymentToken,
      args.payment,
      args.paymentReceiver,
    ],
  });
}

function safeCreateCall(
  overrides: Partial<SetupArgs> = {},
  singleton: Address = SAFE_SINGLETON,
  saltNonce = 42n,
) {
  return {
    chainId: CHAIN_ID,
    to: SAFE_FACTORY,
    data: encodeFunctionData({
      abi: SAFE_CREATE_ABI,
      functionName: "createProxyWithNonce",
      args: [singleton, initializer(overrides), saltNonce],
    }),
  };
}

describe("decodeDeploymentCall, safe-create", () => {
  test("reads a canonical factory call back as the Safe it creates", () => {
    expect(decodeDeploymentCall(safeCreateCall())).toEqual({
      flavor: "safe-create",
      to: SAFE_FACTORY,
      singleton: SAFE_SINGLETON,
      saltNonce: toHex(42n, { size: 32 }),
      owners: [...SAFE_OWNERS],
      threshold: 2,
      fallbackHandler: SAFE_FALLBACK,
      // The address the canonical factory itself returns for this plan.
      address: "0x53a62fb237E097DEa3714015Bced94790fE5c3BB",
    });
  });

  test("accepts one owner and twenty owners", () => {
    const one = decodeDeploymentCall(
      safeCreateCall({ owners: [SAFE_OWNERS[0]], threshold: 1n }),
    );
    expect(one.flavor).toBe("safe-create");

    const twenty = Array.from(
      { length: 20 },
      (_, index) =>
        `0x${(index + 2).toString(16).padStart(40, "0")}` as Address,
    );
    const many = decodeDeploymentCall(
      safeCreateCall({ owners: twenty, threshold: 20n }),
    );
    expect(many.flavor).toBe("safe-create");
  });

  const twentyOne = Array.from(
    { length: 21 },
    (_, index) => `0x${(index + 2).toString(16).padStart(40, "0")}` as Address,
  );

  test.each<[string, Partial<SetupArgs>]>([
    ["no owners", { owners: [], threshold: 0n }],
    ["twenty-one owners", { owners: twentyOne, threshold: 1n }],
    ["a repeated owner", { owners: [SAFE_OWNERS[0], SAFE_OWNERS[0]] }],
    ["a zero owner", { owners: [zeroAddress, SAFE_OWNERS[0]] }],
    [
      "the sentinel owner",
      {
        owners: ["0x0000000000000000000000000000000000000001", SAFE_OWNERS[0]],
      },
    ],
    ["a zero threshold", { threshold: 0n }],
    ["a threshold above the owner count", { threshold: 3n }],
    ["a setup delegatecall target", { to: SAFE_OWNERS[0] }],
    ["setup delegatecall data", { data: "0xdeadbeef" }],
    ["another fallback handler", { fallbackHandler: SAFE_OWNERS[0] }],
    ["a setup payment token", { paymentToken: SAFE_OWNERS[0] }],
    ["a setup payment", { payment: 1n }],
    ["a setup payment receiver", { paymentReceiver: SAFE_OWNERS[0] }],
  ])("refuses an initializer with %s", (_label, overrides) => {
    expect(decodeDeploymentCall(safeCreateCall(overrides)).flavor).toBe(
      "unknown",
    );
  });

  test("refuses another singleton, another target, and another selector", () => {
    expect(
      decodeDeploymentCall(safeCreateCall({}, SAFE_OWNERS[0])).flavor,
    ).toBe("unknown");
    expect(
      decodeDeploymentCall({ ...safeCreateCall(), to: SAFE_OWNERS[0] }).flavor,
    ).toBe("unknown");
    expect(
      decodeDeploymentCall({
        chainId: CHAIN_ID,
        to: SAFE_FACTORY,
        data: encodeFunctionData({
          abi: SAFE_CREATE_ABI,
          functionName: "proxyCreationCode",
        }),
      }).flavor,
    ).toBe("unknown");
  });

  test("refuses an initializer that is not a setup call", () => {
    expect(
      decodeDeploymentCall({
        chainId: CHAIN_ID,
        to: SAFE_FACTORY,
        data: encodeFunctionData({
          abi: SAFE_CREATE_ABI,
          functionName: "createProxyWithNonce",
          args: [
            SAFE_SINGLETON,
            encodeFunctionData({
              abi: SAFE_CREATE_ABI,
              functionName: "proxyCreationCode",
            }),
            42n,
          ],
        }),
      }).flavor,
    ).toBe("unknown");
  });

  test("refuses calldata that is not the canonical encoding", () => {
    const call = safeCreateCall();
    expect(
      decodeDeploymentCall({
        ...call,
        data: concatHex([call.data, toHex(0n, { size: 32 })]),
      }).flavor,
    ).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls/packages/core && npx vitest run src/jbcenter/decode.test.ts -t "safe-create"`
Expected: FAIL — the accept case reports `flavor: "unknown"` with a selector instead of the Safe object.

- [ ] **Step 3: Write the decoder**

In `packages/core/src/jbcenter/decode.ts`, extend the `viem` import to `decodeFunctionData, encodeFunctionData, isAddressEqual, parseAbi, slice, toHex, zeroAddress, type Address, type Hex`, and add:

```ts
import {
  SAFE_CREATE_ABI,
  SAFE_FACTORY,
  SAFE_FALLBACK,
  SAFE_PROXY_CREATION_CODE,
  SAFE_SINGLETON,
  buildSafeInitializer,
  predictSafeAddress,
} from "../safe.js";
```

Add the union member shown in **Interfaces** above, immediately before the `{ flavor: "unknown"; ... }` member. Then, above the `DECODERS` array:

```ts
/** JB Center's ceiling on the owners one intent's Safe may carry. */
const MAX_INTENT_SAFE_OWNERS = 20;

/**
 * A setup call: `createProxyWithNonce` to the canonical Safe factory, for the
 * canonical singleton and fallback handler, with no delegatecall hook and no
 * setup payment. The address is the one the factory would compute, derived
 * from the pinned proxy creation code, so nothing here reaches a chain.
 */
function decodeSafeCreate(
  call: JBCenterDeploymentCall,
): JBCenterDecodedLaunch | null {
  try {
    if (!isAddressEqual(SAFE_FACTORY, call.to)) return null;
    const create = decodeFunctionData({ abi: SAFE_CREATE_ABI, data: call.data });
    if (create.functionName !== "createProxyWithNonce") return null;
    const [singleton, initializer, nonce] = create.args;
    if (!isAddressEqual(singleton, SAFE_SINGLETON)) return null;
    const setup = decodeFunctionData({
      abi: SAFE_CREATE_ABI,
      data: initializer,
    });
    if (setup.functionName !== "setup") return null;
    const [
      owners,
      threshold,
      to,
      data,
      fallbackHandler,
      paymentToken,
      payment,
      paymentReceiver,
    ] = setup.args;
    if (
      owners.length < 1 ||
      owners.length > MAX_INTENT_SAFE_OWNERS ||
      owners.some((owner) => BigInt(owner) === 0n) ||
      new Set(owners.map((owner) => owner.toLowerCase())).size !==
        owners.length ||
      threshold < 1n ||
      threshold > BigInt(owners.length) ||
      !isAddressEqual(to, zeroAddress) ||
      data !== "0x" ||
      !isAddressEqual(fallbackHandler, SAFE_FALLBACK) ||
      !isAddressEqual(paymentToken, zeroAddress) ||
      payment !== 0n ||
      !isAddressEqual(paymentReceiver, zeroAddress)
    ) {
      return null;
    }
    const plan = {
      owners: [...owners],
      threshold: Number(threshold),
      saltNonce: toHex(nonce, { size: 32 }),
      proxyCreationCode: SAFE_PROXY_CREATION_CODE,
    };
    // Only the canonical encoding predicts the address the factory computes,
    // so the call has to be exactly what this plan re-encodes to. This also
    // refuses the sentinel owner, which `buildSafeInitializer` rejects.
    if (
      encodeFunctionData({
        abi: SAFE_CREATE_ABI,
        functionName: "createProxyWithNonce",
        args: [SAFE_SINGLETON, buildSafeInitializer(plan), nonce],
      }).toLowerCase() !== call.data.toLowerCase()
    ) {
      return null;
    }
    return {
      flavor: "safe-create",
      to: call.to,
      singleton,
      saltNonce: plan.saltNonce,
      owners: plan.owners,
      threshold: plan.threshold,
      fallbackHandler,
      address: predictSafeAddress(plan),
    };
  } catch {
    return null;
  }
}
```

Put `decodeSafeCreate` first in `DECODERS`, since its target address is fixed and the check is the cheapest:

```ts
const DECODERS = [
  decodeSafeCreate,
  decodeProjectLaunch,
  decodeProject721Launch,
  decodeOmnichainLaunch,
  decodeRevnetDeploy,
  decodeHomerunFundLaunch,
];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls/packages/core && npx vitest run src/jbcenter/decode.test.ts`
Expected: PASS — every existing decode test plus the whole `safe-create` block.

- [ ] **Step 5: Check types, coverage and format**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls && npm run type-check && npm run test:coverage && npm run format && npm run format:ratchet`
Expected: no type errors; coverage stays above statements 95 / branches 82 / functions 92 / lines 95 with no threshold failure; the ratchet prints no unexpected file.

- [ ] **Step 6: Commit**

```bash
cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls
git add packages/core/src/jbcenter/decode.ts packages/core/src/jbcenter/decode.test.ts
git commit -m "$(cat <<'MSG'
Read a Safe creation call back as the Safe it creates

decodeDeploymentCall gains a safe-create flavor: the canonical factory,
singleton and fallback handler, one to twenty unique nonzero owners, a
threshold inside the owner count, no setup hook and no payment, and the
address the factory would compute, from the pinned creation code.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: Mirror Center's per-chain rule

**Files:**
- Create: `packages/core/src/jbcenter/setupCalls.ts`
- Create: `packages/core/src/jbcenter/setupCalls.test.ts`
- Modify: `packages/core/src/jbcenter.ts` (the `isEnvelope` body, currently lines 387-401)
- Modify: `packages/core/src/jbcenter.test.ts`
- Modify: `packages/core/vitest.config.ts`

**Interfaces:**
- Consumes from Task 2: `decodeDeploymentCall(call): JBCenterDecodedLaunch` from `./decode.js`, whose `"safe-create"` flavor marks a valid setup call. Types only from `../jbcenter.js`: `JBCenterDeploymentCall = { chainId: number; to: Address; data: Hex }`.
- Produces, for Task 4 and for `jbcenter.ts`:
  - `export function groupDeploymentCalls(calls: readonly JBCenterDeploymentCall[]): Map<number, JBCenterDeploymentCall[]>` — insertion-ordered groups, each in the order the array carries them.
  - `export function isValidDeploymentCalls(calls: readonly JBCenterDeploymentCall[]): boolean`.

- [ ] **Step 1: Write the failing module tests**

Create `packages/core/src/jbcenter/setupCalls.test.ts`:

```ts
import { encodeFunctionData, zeroAddress, type Address } from "viem";
import { describe, expect, test } from "vitest";
import {
  SAFE_CREATE_ABI,
  SAFE_FACTORY,
  SAFE_SINGLETON,
  buildSafeInitializer,
} from "../safe.js";
import type { JBCenterDeploymentCall } from "../jbcenter.js";
import { groupDeploymentCalls, isValidDeploymentCalls } from "./setupCalls.js";

const OWNERS: readonly Address[] = [
  "0x0000000000000000000000000000000000000002",
  "0x0000000000000000000000000000000000000003",
];
const LAUNCH_TARGET = "0x000000000000000000000000000000000000dEaD" as const;

function setupCall(chainId: number, saltNonce: bigint): JBCenterDeploymentCall {
  return {
    chainId,
    to: SAFE_FACTORY,
    data: encodeFunctionData({
      abi: SAFE_CREATE_ABI,
      functionName: "createProxyWithNonce",
      args: [
        SAFE_SINGLETON,
        buildSafeInitializer({ owners: OWNERS, threshold: 2 }),
        saltNonce,
      ],
    }),
  };
}

function launchCall(chainId: number): JBCenterDeploymentCall {
  return { chainId, to: LAUNCH_TARGET, data: "0x12345678" };
}

describe("groupDeploymentCalls", () => {
  test("keeps each chain's calls in the order the array carries them", () => {
    const calls = [
      setupCall(8453, 1n),
      launchCall(10),
      launchCall(8453),
      setupCall(10, 2n),
    ];

    expect([...groupDeploymentCalls(calls)]).toEqual([
      [8453, [calls[0], calls[2]]],
      [10, [calls[1], calls[3]]],
    ]);
  });

  test("is empty for no calls", () => {
    expect(groupDeploymentCalls([]).size).toBe(0);
  });
});

describe("isValidDeploymentCalls", () => {
  test("accepts one launch per chain", () => {
    expect(isValidDeploymentCalls([launchCall(8453), launchCall(10)])).toBe(
      true,
    );
  });

  test("accepts one, two and three setup calls before a launch", () => {
    for (const count of [1, 2, 3]) {
      const setups = Array.from({ length: count }, (_, index) =>
        setupCall(8453, BigInt(index + 1)),
      );
      expect(isValidDeploymentCalls([...setups, launchCall(8453)])).toBe(true);
    }
  });

  test("refuses a fifth call on a chain", () => {
    expect(
      isValidDeploymentCalls([
        setupCall(8453, 1n),
        setupCall(8453, 2n),
        setupCall(8453, 3n),
        setupCall(8453, 4n),
        launchCall(8453),
      ]),
    ).toBe(false);
  });

  test("refuses a setup call to another target", () => {
    expect(
      isValidDeploymentCalls([
        { chainId: 8453, to: LAUNCH_TARGET, data: "0x12345678" },
        launchCall(8453),
      ]),
    ).toBe(false);
  });

  test("refuses a setup call with another singleton", () => {
    expect(
      isValidDeploymentCalls([
        {
          chainId: 8453,
          to: SAFE_FACTORY,
          data: encodeFunctionData({
            abi: SAFE_CREATE_ABI,
            functionName: "createProxyWithNonce",
            args: [
              zeroAddress,
              buildSafeInitializer({ owners: OWNERS, threshold: 2 }),
              1n,
            ],
          }),
        },
        launchCall(8453),
      ]),
    ).toBe(false);
  });

  test("refuses a setup call after the launch position", () => {
    expect(
      isValidDeploymentCalls([launchCall(8453), setupCall(8453, 1n)]),
    ).toBe(true);
    expect(
      isValidDeploymentCalls([
        setupCall(8453, 1n),
        launchCall(8453),
        launchCall(8453),
      ]),
    ).toBe(false);
  });

  test("checks every chain, not only the first", () => {
    expect(
      isValidDeploymentCalls([
        setupCall(8453, 1n),
        launchCall(8453),
        { chainId: 10, to: LAUNCH_TARGET, data: "0x12345678" },
        launchCall(10),
      ]),
    ).toBe(false);
  });

  test("accepts no calls at all, which the envelope check refuses on its own", () => {
    expect(isValidDeploymentCalls([])).toBe(true);
  });
});
```

Note on the "after the launch position" case: a lone trailing setup call **is** that chain's launch position, so the rule reads it as the launch — it is the caller's own two-call intent, and the pair `[setup, launch, launch]` is what the rule must refuse, because the middle call is then a setup call that is not a Safe creation.

- [ ] **Step 2: Run the module tests to verify they fail**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls/packages/core && npx vitest run src/jbcenter/setupCalls.test.ts`
Expected: FAIL — `Failed to resolve import "./setupCalls.js"`.

- [ ] **Step 3: Write the module**

Create `packages/core/src/jbcenter/setupCalls.ts`:

```ts
// `jbcenter.ts` re-exports this module, so it takes only types from there:
// a top-level read of one of its values would resolve before `jbcenter.ts`
// finishes evaluating under CJS.
import type { JBCenterDeploymentCall } from "../jbcenter.js";
import { decodeDeploymentCall } from "./decode.js";

/** JB Center's ceiling: one launch per chain, with up to three setup calls. */
const MAX_CALLS_PER_CHAIN = 4;

/** An intent's `deploymentCalls` per chain, each chain's calls in order. */
export function groupDeploymentCalls(
  calls: readonly JBCenterDeploymentCall[],
): Map<number, JBCenterDeploymentCall[]> {
  const groups = new Map<number, JBCenterDeploymentCall[]>();

  for (const call of calls) {
    const group = groups.get(call.chainId);
    if (group) group.push(call);
    else groups.set(call.chainId, [call]);
  }

  return groups;
}

/**
 * JB Center's rule, mirrored: a chain carries 1 to 4 calls, the last call for
 * a chain is its launch, and every call before it creates a Safe through the
 * canonical factory. Whether the chains named match the calls is the
 * envelope's own check.
 */
export function isValidDeploymentCalls(
  calls: readonly JBCenterDeploymentCall[],
): boolean {
  for (const group of groupDeploymentCalls(calls).values()) {
    if (group.length > MAX_CALLS_PER_CHAIN) return false;
    for (const call of group.slice(0, -1)) {
      if (decodeDeploymentCall(call).flavor !== "safe-create") return false;
    }
  }

  return true;
}
```

- [ ] **Step 4: Run the module tests to verify they pass**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls/packages/core && npx vitest run src/jbcenter/setupCalls.test.ts`
Expected: PASS — all ten tests.

- [ ] **Step 5: Write the failing envelope tests**

Append to the `describe("JB Center client", …)` block in `packages/core/src/jbcenter.test.ts`. Add to its imports:

```ts
import {
  SAFE_CREATE_ABI,
  SAFE_FACTORY,
  SAFE_SINGLETON,
  buildSafeInitializer,
} from "./safe.js";
```

and the tests:

```ts
  const setupData = encodeFunctionData({
    abi: SAFE_CREATE_ABI,
    functionName: "createProxyWithNonce",
    args: [
      SAFE_SINGLETON,
      buildSafeInitializer({
        owners: ["0x0000000000000000000000000000000000000002"],
        threshold: 1,
      }),
      7n,
    ],
  });

  test("accepts an intent whose chain sets up Safes before it launches", async () => {
    const withSetup = {
      ...intent(),
      envelope: {
        ...envelope,
        deploymentCalls: [
          { chainId: 1, to: SAFE_FACTORY, data: setupData },
          ...envelope.deploymentCalls,
        ],
      },
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(withSetup));
    const client = createJBCenterClient({ fetch: fetchMock });

    await expect(client.getIntent(withSetup.id)).resolves.toMatchObject({
      envelope: { deploymentCalls: withSetup.envelope.deploymentCalls },
    });
  });

  test("rejects a setup call that is not a canonical Safe creation", async () => {
    const wrongTarget = {
      ...intent(),
      envelope: {
        ...envelope,
        deploymentCalls: [
          { chainId: 1, to: address, data: setupData },
          ...envelope.deploymentCalls,
        ],
      },
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(wrongTarget));
    const client = createJBCenterClient({ fetch: fetchMock });

    await expect(client.getIntent(wrongTarget.id)).rejects.toMatchObject({
      status: 502,
      message: "JB Center returned an invalid response",
    });
  });

  test("rejects a chain carrying five calls", async () => {
    const tooMany = {
      ...intent(),
      envelope: {
        ...envelope,
        deploymentCalls: [
          { chainId: 1, to: SAFE_FACTORY, data: setupData },
          { chainId: 1, to: SAFE_FACTORY, data: setupData },
          { chainId: 1, to: SAFE_FACTORY, data: setupData },
          { chainId: 1, to: SAFE_FACTORY, data: setupData },
          ...envelope.deploymentCalls,
        ],
      },
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(tooMany));
    const client = createJBCenterClient({ fetch: fetchMock });

    await expect(client.getIntent(tooMany.id)).rejects.toMatchObject({
      status: 502,
      message: "JB Center returned an invalid response",
    });
  });

  test("rejects a chain with no call of its own", async () => {
    const missing = {
      ...intent(),
      envelope: {
        ...envelope,
        chainIds: [1, 10],
        deploymentCalls: [
          { chainId: 1, to: SAFE_FACTORY, data: setupData },
          ...envelope.deploymentCalls,
        ],
      },
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(missing));
    const client = createJBCenterClient({ fetch: fetchMock });

    await expect(client.getIntent(missing.id)).rejects.toMatchObject({
      status: 502,
      message: "JB Center returned an invalid response",
    });
  });
```

- [ ] **Step 6: Run the envelope tests to verify they fail**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls/packages/core && npx vitest run src/jbcenter.test.ts -t "sets up Safes"`
Expected: FAIL — the acceptance case rejects with status 502, because `isEnvelope` still requires one call per chain.

- [ ] **Step 7: Rewrite the envelope's call check**

In `packages/core/src/jbcenter.ts`, add to the imports at the top:

```ts
import {
  groupDeploymentCalls,
  isValidDeploymentCalls,
} from "./jbcenter/setupCalls.js";
```

Replace the second half of `isEnvelope` (everything from `if (!Array.isArray(value.deploymentCalls)` to the closing `return (...)`) with:

```ts
  if (
    !Array.isArray(value.deploymentCalls) ||
    !value.deploymentCalls.every(isDeploymentCall)
  ) {
    return false;
  }
  const calls: JBCenterDeploymentCall[] = value.deploymentCalls;
  if (!isValidDeploymentCalls(calls)) return false;
  const chains = [...value.chainIds].sort((a, b) => a - b);
  const callChains = [...groupDeploymentCalls(calls).keys()].sort(
    (a, b) => a - b,
  );
  return (
    callChains.length === chains.length &&
    chains.every((chainId, index) => callChains[index] === chainId)
  );
```

- [ ] **Step 8: Run the envelope tests to verify they pass**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls/packages/core && npx vitest run src/jbcenter.test.ts`
Expected: PASS — the whole client suite, including "rejects an intent whose envelope names no chains" and the four new cases.

- [ ] **Step 9: Hold the new module at 100%**

In `packages/core/vitest.config.ts`, inside `thresholds`, after the `"src/jbcenter/publish.ts"` entry:

```ts
        "src/jbcenter/setupCalls.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
```

- [ ] **Step 10: Run the full suite with coverage, types and format**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls && npm run type-check && npm run test:coverage && npm run dead-code:check && npm run wallet:check && npm run format && npm run format:ratchet`
Expected: no type errors; no coverage threshold failure, including 100% on `src/jbcenter/setupCalls.ts`; knip reports no unused file or export; the wallet gate passes; the ratchet prints no unexpected file.

- [ ] **Step 11: Commit**

```bash
cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls
git add packages/core/src/jbcenter/setupCalls.ts \
  packages/core/src/jbcenter/setupCalls.test.ts \
  packages/core/src/jbcenter.ts \
  packages/core/src/jbcenter.test.ts \
  packages/core/vitest.config.ts
git commit -m "$(cat <<'MSG'
Mirror Center's rule: setup calls before a chain's launch

An envelope groups its deployment calls by chain. A chain carries one to
four calls, the last one launches, and every call before it creates a
Safe through the canonical factory. One call per chain reads exactly as
it did, so every published intent stays valid.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: `intentCalls`, exports, README, changeset

**Files:**
- Modify: `packages/core/src/jbcenter/setupCalls.ts`
- Modify: `packages/core/src/jbcenter/setupCalls.test.ts`
- Modify: `packages/core/src/jbcenter.ts`
- Modify: `packages/core/src/publicSurface.test.ts`
- Modify: `README.md`
- Create: `.changeset/intent-setup-calls.md`

**Interfaces:**
- Consumes from Task 3: `groupDeploymentCalls(calls): Map<number, JBCenterDeploymentCall[]>`. From Task 2: `decodeDeploymentCall(call): JBCenterDecodedLaunch` and its `"safe-create"` member. From `../jbcenter.js` (types only): `JBCenterIntent<TJb>` whose `envelope.deploymentCalls` is `JBCenterDeploymentCall[]`, and `JBCenterJsonObject`.
- Produces, as the module's public surface:
  - `export type JBCenterDecodedCall = JBCenterDeploymentCall & { decoded: JBCenterDecodedLaunch }`
  - `export type JBCenterChainCalls = { setup: JBCenterDecodedCall[]; launch: JBCenterDecodedCall }`
  - `export function intentCalls(intent: JBCenterIntent<JBCenterJsonObject>): Map<number, JBCenterChainCalls>`
  - re-exported from `jbcenter.ts` (and so from the package root through `index.ts`'s `export * from "./jbcenter.js"`).

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/jbcenter/setupCalls.test.ts`, extending its imports with `intentCalls` from `./setupCalls.js` and `SAFE_FALLBACK` from `../safe.js`:

```ts
function intentWith(calls: JBCenterDeploymentCall[]) {
  return {
    id: "31b158fc-6ac5-4a4d-9039-882b7eb0ef4b",
    status: "undeployed" as const,
    contentHash: `0x${"12".repeat(32)}` as const,
    envelope: {
      format: "juicebox.money/v1",
      deploymentVersion: "6",
      chainIds: [...new Set(calls.map((call) => call.chainId))],
      deploymentCalls: calls,
      jb: {},
    },
    publisher: "0x0000000000000000000000000000000000000002" as const,
    signature: `0x${"34".repeat(65)}` as const,
    createdAt: "2026-09-22T00:00:00.000Z",
    deployments: [],
    deploys: [],
    name: "Example",
    description: null,
    tagline: null,
    tags: [],
    logoUri: null,
    owner: null,
  };
}

describe("intentCalls", () => {
  test("separates each chain's setup calls from its launch", () => {
    const setup = setupCall(8453, 42n);
    const launch = launchCall(8453);
    const result = intentCalls(intentWith([setup, launch, launchCall(10)]));

    expect([...result.keys()]).toEqual([8453, 10]);
    expect(result.get(8453)?.setup).toEqual([
      {
        ...setup,
        decoded: {
          flavor: "safe-create",
          to: SAFE_FACTORY,
          singleton: SAFE_SINGLETON,
          saltNonce: `0x${(42).toString(16).padStart(64, "0")}`,
          owners: [...OWNERS],
          threshold: 2,
          fallbackHandler: SAFE_FALLBACK,
          address: "0x53a62fb237E097DEa3714015Bced94790fE5c3BB",
        },
      },
    ]);
    expect(result.get(8453)?.launch).toEqual({
      ...launch,
      decoded: { flavor: "unknown", to: LAUNCH_TARGET, selector: "0x12345678" },
    });
    expect(result.get(10)?.setup).toEqual([]);
    expect(result.get(10)?.launch.chainId).toBe(10);
  });

  test("is empty for an intent with no calls", () => {
    expect(intentCalls(intentWith([])).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls/packages/core && npx vitest run src/jbcenter/setupCalls.test.ts -t "intentCalls"`
Expected: FAIL — `intentCalls` is not exported by `./setupCalls.js`.

- [ ] **Step 3: Write the helper**

In `packages/core/src/jbcenter/setupCalls.ts`, extend the type import to
`import type { JBCenterDeploymentCall, JBCenterIntent, JBCenterJsonObject } from "../jbcenter.js";`
and `import type { JBCenterDecodedLaunch } from "./decode.js";`, then append:

```ts
/** One of an intent's calls, with the launch or Safe creation it carries. */
export type JBCenterDecodedCall = JBCenterDeploymentCall & {
  decoded: JBCenterDecodedLaunch;
};

export type JBCenterChainCalls = {
  setup: JBCenterDecodedCall[];
  launch: JBCenterDecodedCall;
};

/**
 * An intent's calls per chain, decoded, so a client renders "creates this
 * Safe, then launches" without repeating the rule: the last call for a chain
 * is its launch and every call before it is a setup call.
 */
export function intentCalls(
  intent: JBCenterIntent<JBCenterJsonObject>,
): Map<number, JBCenterChainCalls> {
  const result = new Map<number, JBCenterChainCalls>();

  for (const [chainId, calls] of groupDeploymentCalls(
    intent.envelope.deploymentCalls,
  )) {
    const decoded = calls.map((call) => ({
      ...call,
      decoded: decodeDeploymentCall(call),
    }));
    result.set(chainId, {
      setup: decoded.slice(0, -1),
      launch: decoded[decoded.length - 1],
    });
  }

  return result;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls/packages/core && npx vitest run src/jbcenter/setupCalls.test.ts`
Expected: PASS — all twelve tests.

- [ ] **Step 5: Export it and assert the public surface**

In `packages/core/src/jbcenter.ts`, beside the existing `./jbcenter/decode.js` re-exports:

```ts
export type {
  JBCenterChainCalls,
  JBCenterDecodedCall,
} from "./jbcenter/setupCalls.js";
export { intentCalls } from "./jbcenter/setupCalls.js";
```

In `packages/core/src/publicSurface.test.ts`, add to the Safe test:

```ts
    expect(safe.SAFE_PROXY_CREATION_CODE).toMatch(/^0x(?:[\da-f]{2}){486}$/u);
```

and to the utility test, next to `expect(sdk.decodeDeploymentCall)`:

```ts
    expect(sdk.intentCalls).toBeTypeOf("function");
```

- [ ] **Step 6: Run the surface test**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls/packages/core && npx vitest run src/publicSurface.test.ts`
Expected: PASS.

- [ ] **Step 7: Document it in the README**

In `README.md`, insert after the `decodeDeploymentCall` example block (the one ending with the `homerun-fund` comment and its closing fence) and before the "List views merge deployed projects…" paragraph:

````markdown
A chain in an intent can carry more than one call. The last call for a chain is
its launch; every call before it is a setup call that creates a Safe through
the canonical Safe 1.4.1 proxy factory, so a project can be owned by a multisig
that does not exist yet — Safe addresses depend only on the factory, singleton,
initializer and salt nonce, so the creation and the launch can land in either
order. A chain carries at most four calls. `intentCalls` applies that rule once,
for every chain:

```ts
import { intentCalls } from "@bananapus/nana-sdk-core/jbcenter";

for (const [chainId, { setup, launch }] of intentCalls(intent)) {
  for (const call of setup) {
    if (call.decoded.flavor === "safe-create") {
      // call.decoded.address, .owners, .threshold, .saltNonce
    }
  }
  // launch.decoded is the project, 721, omnichain, revnet or FUND launch.
}
```

A setup call reads back as `safe-create` only when it is a canonical
`createProxyWithNonce` to the canonical factory for the canonical singleton and
fallback handler, with 1 to 20 unique nonzero owners, a threshold inside the
owner count, and no setup hook or payment. Anything else makes the whole
envelope unreadable, so a client never renders a setup call it cannot name.
`ensureDeployed`'s `selfPaid` callback receives every remaining call, setup
calls included, in the order the intent carries them.
````

Add one row to the helper table, immediately after the `decodeDeploymentCall` row:

```markdown
| `intentCalls`                    | An intent's calls per chain, decoded: the setup calls before it, then the launch.                  |
```

In the `## Inline Safe creation` section, append to the paragraph that begins "The same Safe address across chains requires…":

```markdown
`SAFE_PROXY_CREATION_CODE` pins those proxy creation bytes, so an address can be
predicted from a signed call with no chain read; anything about to be deployed
still reads the factory on each chain.
```

- [ ] **Step 8: Write the changeset**

Create `.changeset/intent-setup-calls.md`:

```markdown
---
"@bananapus/nana-sdk-core": minor
---

`@bananapus/nana-sdk-core/jbcenter` reads intents whose chains set up their
Safes before they launch. An intent's `deploymentCalls` may now carry one to
four calls per chain: the last call for a chain is its launch, and every call
before it creates a Safe through the canonical Safe 1.4.1 proxy factory. One
call per chain is unchanged, so every published intent stays valid.
`decodeDeploymentCall` gains a `safe-create` flavor carrying the singleton,
salt nonce, owners, threshold, fallback handler and the address the factory
would compute — predicted from the newly pinned
`SAFE_PROXY_CREATION_CODE` in `@bananapus/nana-sdk-core/safe`, with no chain
read. `intentCalls(intent)` returns each chain's setup calls and its launch,
decoded, so a client renders both without repeating the rule. `intentRow`,
`mergeSearch`, `ensureDeployed` and `publishSignedIntent` are unchanged.
```

- [ ] **Step 9: Run the full local gate**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls && npm run type-check && npm run test:coverage && npm run dead-code:check && npm run wallet:check && npm run format && npm run format:ratchet`
Expected: no type errors; coverage clean; knip reports nothing unused; the wallet gate passes; the ratchet prints no unexpected file.

- [ ] **Step 10: Commit**

```bash
cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls
git add packages/core/src/jbcenter/setupCalls.ts \
  packages/core/src/jbcenter/setupCalls.test.ts \
  packages/core/src/jbcenter.ts \
  packages/core/src/publicSurface.test.ts \
  README.md \
  .changeset/intent-setup-calls.md
git commit -m "$(cat <<'MSG'
Give every client one reading of an intent's calls

intentCalls returns each chain's setup calls and its launch, decoded, so
juicebox.money, revnet.money and Homerun render the same thing without
repeating the rule. README and changeset follow.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: Budget, whole gate, and release

**Files:**
- Modify: `scripts/check-package-budgets.mjs` (only if the measured entry count needs it)

**Interfaces:**
- Consumes: the built `packages/core/dist` from `npm run build`. One new source file (`src/jbcenter/setupCalls.ts`) emits eight artifacts — ESM and CJS, each `.js`, `.js.map`, `.d.ts`, `.d.ts.map` — so the count rises by eight.
- Produces: a green `npm run check` and a merged PR that publishes 2.9.0.

- [ ] **Step 1: Build and measure**

```bash
cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls
npm run build
npm run check:package
```

Expected: either it passes, or it fails with `@bananapus/nana-sdk-core files <N> > 480`. Either way the command prints the line `@bananapus/nana-sdk-core: <packed> B packed, <unpacked> B unpacked, <N> files`. Write `<N>` down.

- [ ] **Step 2: Raise the cap only if `<N>` needs it**

If `<N> > 480`, in `scripts/check-package-budgets.mjs` set `entries` for `@bananapus/nana-sdk-core` to `<N>` rounded up to the next multiple of eight, and append one sentence to that budget's comment block:

```js
    // The intent setup-call grouping adds eight more, and the pinned Safe
    // proxy creation code adds about two kilobytes to four of them.
    entries: 488,
```

If the failure instead names `packed` or `unpacked`, raise that number to the printed value rounded up to the next 10 000 B (packed) or 100 000 B (unpacked) and say so in the same sentence. If nothing failed, change nothing in this file and skip to Step 4.

- [ ] **Step 3: Re-run the budget check**

Run: `cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls && npm run check:package`
Expected: PASS, printing the three measurements for all three packages.

- [ ] **Step 4: Run the whole gate exactly as CI does**

```bash
cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls
nvm use && npm --version   # 10.9.8
npm run check
```

Expected: PASS end to end — `deps:check`, `dead-code:check`, `protocol:check`, `wallet:check`, `format:ratchet`, `check:gql`, `type-check`, `test:coverage`, `build`, `check:package`, `check:generated`. `check:generated` must report no diff: nothing in this plan touches `src/generated/juicebox.ts`.

- [ ] **Step 5: Commit the budget, if it changed**

```bash
cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls
git add scripts/check-package-budgets.mjs
git commit -m "$(cat <<'MSG'
Budget the grouping module's published artifacts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
MSG
)"
```

- [ ] **Step 6: Push and open the PR**

```bash
cd /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls
git push -u origin feat/intent-setup-calls
gh pr create --repo Bananapus/juice-sdk-v4 \
  --title "Setup calls before an intent's launch call" \
  --body "$(cat <<'BODY'
An intent's `deploymentCalls` may carry one to four calls per chain. The
last call for a chain is its launch; every call before it creates a Safe
through the canonical Safe 1.4.1 proxy factory, so a project can be owned
by a multisig that does not exist yet. One call per chain reads exactly
as it did, so every published intent stays valid.

- `SAFE_PROXY_CREATION_CODE` pins the factory's own proxy creation bytes,
  so `predictSafeAddress` works with no chain read. Its test pins the
  keccak of those bytes and the address the factory itself returns for a
  known plan.
- `decodeDeploymentCall` gains a `safe-create` flavor: singleton, salt
  nonce, owners, threshold, fallback handler, and the predicted address.
- The envelope check mirrors Center's rule, and `intentCalls` hands a
  client each chain's setup calls and its launch, decoded.

`npm run check` and `npm run build` are green locally on Node 22.23.1.

Spec: `docs/superpowers/specs/2026-09-22-intent-setup-calls-safe-owners-design.md`, section 4.

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

The Release workflow opens it within a few minutes. Confirm it does exactly three things — deletes `.changeset/intent-setup-calls.md`, sets `packages/core/package.json` to `2.9.0`, and prepends the changeset prose to `packages/core/CHANGELOG.md` under `## 2.9.0`:

```bash
gh pr list --repo Bananapus/juice-sdk-v4 --search "Version Packages"
gh pr diff --repo Bananapus/juice-sdk-v4 <number>
gh pr merge --repo Bananapus/juice-sdk-v4 <number> --squash
gh run list --repo Bananapus/juice-sdk-v4 --workflow Release --limit 3
npm view @bananapus/nana-sdk-core version   # expect 2.9.0
```

If the version reads `2.8.1`, the changeset was written as `patch` — close the version PR, correct `.changeset/intent-setup-calls.md` to `minor` on a fresh branch, merge that, and let the bot reopen.

---

## Out of scope

Center's publish validation, sponsor lane, `settle`, `resume` and verifier (spec sections 1-3); Homerun's eligibility, `buildFundIntent`, `decodeFundIntent` and review UI (section 5); the juicebox.money and revnet.money ports (section 6); setup calls to anything but the Safe factory, Safe modules or guards, ordering guarantees between setup and launch, ERC-1271 publishing, a Safe-connected publisher (section 7). No change to `intentRow`, `mergeSearch`, `ensureDeployed`, `publishSignedIntent`, `readSafeCreationCode`, `resolveSafeAddress` or `checkSafeDeployments`. No chain-count cap is added to the SDK's envelope check: Center enforces its sixteen-chain limit at publish, and the SDK has never mirrored it.

## Self-review

**1. Spec coverage (section 4, sentence by sentence).**
- "Validation mirrors Center: calls grouped by chain, 1 to 4 per chain, the last is the launch, setup calls only to the canonical factory with a well-formed `createProxyWithNonce`" → Task 3, `isValidDeploymentCalls` plus the `isEnvelope` rewrite, with the module table and the four `getIntent` cases.
- "`decodeDeploymentCall` gains flavor `safe-create`: `{ to, singleton, saltNonce, owners, threshold, fallbackHandler, address }` where `address` is `predictSafeAddress` … computed with the pinned creation code; no chain read" → Tasks 1 and 2. The flavor also carries `flavor` itself, as the union requires, matching the agreed shape.
- "New `intentCalls(intent)` returns `Map<chainId, { setup: DecodedCall[], launch: DecodedCall }>`" → Task 4, with `JBCenterDecodedCall` named as the `DecodedCall` of the spec.
- "`intentRow`, `mergeSearch`, `ensureDeployed`, `publishSignedIntent` are unchanged" → no task touches them; stated under Out of scope.
- "README lists the new helper and the rule" → Task 4 Step 7 (prose, example, table row, Safe-section sentence).
- "Changeset minor" → Task 4 Step 8. "Budget cap raised only if needed" → Task 5 Steps 1-3, which measure first.
- Spec "Testing / SDK" line — "validation table" (Task 3 Step 1), "`safe-create` decode round-trip with the predicted address matching `safe.ts`" (Task 1 Step 1 and Task 2 Step 1 share the one ground-truth address `0x53a62fb237E097DEa3714015Bced94790fE5c3BB`), "`intentCalls` grouping" (Task 4 Step 1), "budget and wallet-boundary checks" (Task 5 Step 4, Task 3 Step 10).

**2. Placeholder scan.** Every code step carries the code to write; every run step carries the command and what it must print. The one conditional step (Task 5 Step 2) states the exact rule for the number and the exact sentence to add. No "TBD", no "handle edge cases", no "similar to Task N".

**3. Type consistency.** `SAFE_PROXY_CREATION_CODE` is typed `Hex` in Task 1 and consumed as `proxyCreationCode: Hex` by `predictSafeAddress` in Task 2 and by the README sentence in Task 4. `groupDeploymentCalls` returns `Map<number, JBCenterDeploymentCall[]>` in Task 3 and is consumed with that exact type by `isValidDeploymentCalls`, by `isEnvelope`, and by `intentCalls` in Task 4. `decodeDeploymentCall(call).flavor === "safe-create"` is the same string in the decoder (Task 2), the validator (Task 3) and the README example (Task 4). `saltNonce` is a 32-byte `Hex` everywhere — produced by `toHex(nonce, { size: 32 })` in Task 2, asserted as `toHex(42n, { size: 32 })` in Task 1, and as the padded literal in Task 4. `threshold` is a `number` on the decoded flavor and a `bigint` only inside the ABI arguments.

**4. Known tightenings.** The two places where the SDK is stronger than the stated Center rule (canonical encoding, sentinel owner) are named in Global Constraints and pinned by tests in Task 2, so a reviewer sees them as decisions rather than drift.
