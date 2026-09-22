# SDK Intent Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@bananapus/nana-sdk-core/jbcenter` carries the four pieces every intent client otherwise rebuilds — a guarded publish flow, fixed refusal wording, a Homerun FUND launch decoder, and owner/publisher search filters — released as 2.8.0.

**Architecture:** Two new framework-free modules under `packages/core/src/jbcenter/` (`publish.ts`, `refusal.ts`), one new decoder branch in the existing `decode.ts`, and two new fields on `JBCenterSearchParams`. Nothing signs: `publishSignedIntent` takes the caller's `sign` callback, so the package stays wallet-free and the wallet-boundary gate stays untouched. `jbcenter.ts` re-exports all of it in one task at the end, alongside the README, changeset and budget update.

**Tech Stack:** Node 22.23.1 (`.nvmrc`), npm 10.9.8, TypeScript 5.4, viem 2.37.5, vitest 3.2 with v8 coverage, turbo, Changesets, prettier 3.

**Spec:** `/Users/jango/Documents/jb/v6/evm/docs/superpowers/specs/2026-09-21-intents-docs-shared-homerun-design.md` — plan section **"2. SDK"** only. Sections 1 (Center) and 3 (Homerun) are other plans; do not touch them.

**Repo:** `https://github.com/Bananapus/juice-sdk-v4` (the GitHub name; the local checkout directory is `juice-sdk-connect`). Package under change: `packages/core` = `@bananapus/nana-sdk-core`, currently 2.7.0.

## Global Constraints

- **Never write the word "draft"** — not in code, comments, tests, README, changeset, commit messages, or the PR body.
- **No retrospective comments.** Comments explain the code as it stands, never what it used to do, what was fixed, or what a review said.
- **Prettier formatting.** Run `npm run format` (root: `prettier --write "**/*.{ts,tsx,md}"`) before every commit. `npm run format:ratchet` fails on any newly unformatted file.
- **Coverage.** `packages/core/vitest.config.ts` enforces global floors statements 95 / branches 82 / functions 92 / lines 95, plus per-file 100/100/100/100 entries for three existing modules. This plan adds per-file 100% entries for both new modules (Task 1 and Task 2), so every line and branch of `publish.ts` and `refusal.ts` must be covered by its own tests.
- **Node 22 via nvm.** Run `nvm use` in the worktree (reads `.nvmrc` = `22.23.1`) before any npm command. Verify `npm --version` is `10.9.8` — CI hard-asserts it.
- **Commit trailer.** Every commit message ends with a blank line and then:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
- **Worktree.** All work happens in a git worktree off `origin/main`, never in `/Users/jango/Documents/jb/v6/evm/juice-sdk-connect` itself. Task 1 Step 0 sets it up.
- **Import-cycle rule** (from `ensureDeployed.ts`'s own comment): `jbcenter.ts` re-exports these submodules, so the two sides form a cycle. A submodule may import *types* from `../jbcenter.js` at the top level, but must only read a *value* (`JBCenterRequestError`) from inside a function body — a top-level value read resolves before `jbcenter.ts` finishes evaluating under CJS.
- **Wallet-boundary rule.** `scripts/check-wallet-boundaries.mjs` flags any call whose callee identifier or property name is in its API set (`signMessage`, `signTypedData`, `sendTransaction`, `writeContract`, `request`, …) and any string literal in `{personal_sign, eth_sign, eth_sendTransaction, …}`, in every non-test file under `packages/core/src`. Confirmed by reading the script: a caller-supplied callback invoked as the bare identifier `sign(...)` is **not** flagged, and neither is `options.sign(...)` — `sign` appears in neither `directApis` nor `memberApis`. Therefore: **name the callback `sign`, never `signMessage`, and never write the string `"personal_sign"` in a production file.**

---

## File map

**Create**
- `packages/core/src/jbcenter/publish.ts` — `JBCenterIntentMismatchError`, `PublishSignedIntentOptions`, `publishSignedIntent`. Only responsibility: compare what Center prepared against what the caller built, then sign and publish.
- `packages/core/src/jbcenter/publish.test.ts`
- `packages/core/src/jbcenter/refusal.ts` — `JBCenterRefusal`, `JBCenterRefusalCode`, `describeCenterRefusal`. Only responsibility: turn a Center error into one fixed user-facing sentence, or nothing.
- `packages/core/src/jbcenter/refusal.test.ts`
- `.changeset/intent-helpers.md`

**Modify**
- `packages/core/src/jbcenter/decode.ts` — add the `homerun-fund` flavor and its selector-matched decoder.
- `packages/core/src/jbcenter/decode.test.ts` — round-trip test.
- `packages/core/src/jbcenter.ts` — `JBCenterSearchParams` gains `owner`/`publisher`; `searchIntents` appends them; re-export the two new modules.
- `packages/core/src/jbcenter.test.ts` — search query-string test.
- `packages/core/src/publicSurface.test.ts` — assert the new public exports.
- `packages/core/vitest.config.ts` — per-file 100% thresholds for the two new modules.
- `README.md` (repo root — `packages/core` has no README of its own; the "## JB Center" section starts at line 8 and the "### Project intents" subsection at line 77).
- `scripts/check-package-budgets.mjs` — raise the `@bananapus/nana-sdk-core` budget (measured: 458 of 460 entries are already used; see Task 5).

---

### Task 1: `publishSignedIntent`

**Files:**
- Create: `packages/core/src/jbcenter/publish.ts`
- Create: `packages/core/src/jbcenter/publish.test.ts`
- Modify: `packages/core/vitest.config.ts`

**Interfaces:**
- Consumes: from `../jbcenter.js` (types only, plus nothing at value level): `JBCenterClient`, `JBCenterIntentInput<TJb>`, `JBCenterIntent<TJb>`, `JBCenterJsonObject`, `JBCenterRequestOptions`. Their exact shapes:
  - `JBCenterIntentInput<TJb> = { format: string; deploymentVersion: string; chainIds: number[]; deploymentCalls: { chainId: number; to: Address; data: Hex }[]; jb: TJb }`
  - `client.prepareIntent(intent, options?) => Promise<{ contentHash: Hex; message: string; envelope: JBCenterIntentEnvelope<TJb> }>` (the envelope type is identical to `JBCenterIntentInput<TJb>`)
  - `client.publishIntent(intent & { publisher: Address; signature: Hex }, options?) => Promise<JBCenterIntent<TJb>>`
- Produces, for Task 5 to re-export:
  - `class JBCenterIntentMismatchError extends Error` with `readonly reason: "envelope" | "message"` and `name === "JBCenterIntentMismatchError"`
  - `type PublishSignedIntentOptions = { publisher: Address; request?: JBCenterRequestOptions }`
  - `function publishSignedIntent<TJb extends JBCenterJsonObject>(client: JBCenterClient, intent: JBCenterIntentInput<TJb>, sign: (message: string) => Promise<Hex>, options: PublishSignedIntentOptions): Promise<JBCenterIntent<TJb>>`

- [ ] **Step 0: Create the worktree and install**

A worktree for this work may already exist. Check first, then install dependencies:

```bash
cd /Users/jango/Documents/jb/v6/evm/juice-sdk-connect
git fetch origin
git worktree list
```

If `/Users/jango/Documents/jb/v6/evm/juice-sdk-intents-helpers` is listed (branch `feat/intent-helpers`), confirm it is clean and sitting on `origin/main` and reuse it:

```bash
cd /Users/jango/Documents/jb/v6/evm/juice-sdk-intents-helpers
git status --short          # expect no output
git rev-parse HEAD origin/main   # expect the same hash twice
```

If it is not listed, create it:

```bash
cd /Users/jango/Documents/jb/v6/evm/juice-sdk-connect
git worktree add -b feat/intent-helpers \
  /Users/jango/Documents/jb/v6/evm/juice-sdk-intents-helpers origin/main
```

Then, in the worktree:

```bash
cd /Users/jango/Documents/jb/v6/evm/juice-sdk-intents-helpers
source "$NVM_DIR/nvm.sh" && nvm use     # reads .nvmrc -> 22.23.1
node --version   # expect v22.23.1
npm --version    # expect 10.9.8
npm ci
```

Every later command in this plan runs from `/Users/jango/Documents/jb/v6/evm/juice-sdk-intents-helpers` unless it says otherwise.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/jbcenter/publish.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";
import {
  createJBCenterClient,
  type JBCenterIntentInput,
} from "../jbcenter.js";
import { JBCenterIntentMismatchError, publishSignedIntent } from "./publish.js";

const OWNER_LOWER = "0x000000000000000000000000000000000000dead" as const;
const OWNER_CHECKSUM = "0x000000000000000000000000000000000000dEaD" as const;
const PUBLISHER = "0x1111111111111111111111111111111111111111" as const;
const SIGNATURE = `0x${"34".repeat(65)}` as const;
const CONTENT_HASH = `0x${"ab".repeat(32)}` as const;
const INTENT_ID = "31b158fc-6ac5-4a4d-9039-882b7eb0ef4b";

/** What the caller built: hex lowercased, keys in the caller's own order. */
function localIntent(): JBCenterIntentInput {
  return {
    format: "homerun.money/fund/v1",
    deploymentVersion: "6",
    chainIds: [8453],
    deploymentCalls: [
      { chainId: 8453, to: OWNER_LOWER, data: "0x011fb19e" },
    ],
    jb: {
      app: "homerun",
      name: "Fund",
      owner: OWNER_LOWER,
      tagline: null,
      chainIds: [8453],
    },
  };
}

/** What Center prepared: same values, checksummed hex, keys reordered. */
function preparedEnvelope(): JBCenterIntentInput {
  return {
    deploymentCalls: [
      { data: "0x011FB19E", to: OWNER_CHECKSUM, chainId: 8453 },
    ],
    chainIds: [8453],
    jb: {
      chainIds: [8453],
      owner: OWNER_CHECKSUM,
      tagline: null,
      name: "Fund",
      app: "homerun",
    },
    deploymentVersion: "6",
    format: "homerun.money/fund/v1",
  };
}

function prepared(overrides: Record<string, unknown> = {}) {
  return {
    contentHash: CONTENT_HASH,
    message: `Publish this project intent.\n\nContent hash: ${CONTENT_HASH.toUpperCase()}`,
    envelope: preparedEnvelope(),
    ...overrides,
  };
}

function storedIntent() {
  return {
    id: INTENT_ID,
    status: "undeployed",
    contentHash: CONTENT_HASH,
    envelope: preparedEnvelope(),
    publisher: PUBLISHER,
    signature: SIGNATURE,
    createdAt: "2026-09-21T00:00:00.000Z",
    deployments: [],
    deploys: [],
    name: "Fund",
    description: null,
    tagline: null,
    tags: [],
    logoUri: null,
    owner: OWNER_CHECKSUM,
  };
}

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(value), { ...init, headers });
}

describe("publishSignedIntent", () => {
  test("signs and publishes when Center's envelope carries the same values", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(prepared()))
      .mockResolvedValueOnce(jsonResponse(storedIntent()));
    const client = createJBCenterClient({ fetch: fetchMock });
    const sign = vi.fn().mockResolvedValue(SIGNATURE);

    const published = await publishSignedIntent(
      client,
      localIntent(),
      sign,
      { publisher: PUBLISHER },
    );

    expect(published.id).toBe(INTENT_ID);
    expect(sign).toHaveBeenCalledWith(prepared().message);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://juicebox.center/v1/intents/message",
      "https://juicebox.center/v1/intents",
    ]);
  });

  test("forwards the caller's intent, publisher, and signature to the publish call", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(prepared()))
      .mockResolvedValueOnce(jsonResponse(storedIntent()));
    const client = createJBCenterClient({ fetch: fetchMock });

    await publishSignedIntent(
      client,
      localIntent(),
      async () => SIGNATURE,
      { publisher: PUBLISHER },
    );

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      ...localIntent(),
      publisher: PUBLISHER,
      signature: SIGNATURE,
    });
  });

  test("refuses before signing when Center changed a value", async () => {
    const tampered = preparedEnvelope();
    tampered.jb.owner = PUBLISHER;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(prepared({ envelope: tampered })));
    const client = createJBCenterClient({ fetch: fetchMock });
    const sign = vi.fn().mockResolvedValue(SIGNATURE);

    await expect(
      publishSignedIntent(client, localIntent(), sign, {
        publisher: PUBLISHER,
      }),
    ).rejects.toMatchObject({
      name: "JBCenterIntentMismatchError",
      reason: "envelope",
    });
    expect(sign).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("refuses before signing when the message omits the content hash", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(prepared({ message: "Publish this project intent." })),
      );
    const client = createJBCenterClient({ fetch: fetchMock });
    const sign = vi.fn().mockResolvedValue(SIGNATURE);

    const error = await publishSignedIntent(
      client,
      localIntent(),
      sign,
      { publisher: PUBLISHER },
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(JBCenterIntentMismatchError);
    expect((error as JBCenterIntentMismatchError).reason).toBe("message");
    expect(sign).not.toHaveBeenCalled();
  });

  test("carries the caller's request options into both Center calls", async () => {
    // The client always hands `fetch` a signal of its own, so a mock that
    // ignores it proves nothing. This one refuses an aborted request the way
    // a real fetch does.
    const honorsSignal =
      (body: unknown) => async (_url: string, init: RequestInit) => {
        if (init.signal?.aborted) throw init.signal.reason;
        return jsonResponse(body);
      };

    const early = new AbortController();
    early.abort(new Error("caller left before prepare"));
    const earlyFetch = vi.fn(honorsSignal(prepared()));
    await expect(
      publishSignedIntent(
        createJBCenterClient({ fetch: earlyFetch as unknown as typeof fetch }),
        localIntent(),
        async () => SIGNATURE,
        { publisher: PUBLISHER, request: { signal: early.signal } },
      ),
    ).rejects.toThrow("caller left before prepare");

    const late = new AbortController();
    const lateFetch = vi
      .fn()
      .mockImplementationOnce(honorsSignal(prepared()))
      .mockImplementationOnce(honorsSignal(storedIntent()));
    await expect(
      publishSignedIntent(
        createJBCenterClient({ fetch: lateFetch as unknown as typeof fetch }),
        localIntent(),
        async () => {
          late.abort(new Error("caller left before publish"));
          return SIGNATURE;
        },
        { publisher: PUBLISHER, request: { signal: late.signal } },
      ),
    ).rejects.toThrow("caller left before publish");
    expect(lateFetch).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/jbcenter/publish.test.ts --root packages/core
```

Expected: FAIL — `Failed to resolve import "./publish.js"`.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/jbcenter/publish.ts`:

```ts
import type { Address, Hex } from "viem";
import type {
  JBCenterClient,
  JBCenterIntent,
  JBCenterIntentInput,
  JBCenterJsonObject,
  JBCenterRequestOptions,
} from "../jbcenter.js";

/**
 * Key order and the casing of addresses and calldata are JB Center's to
 * choose; the values are not. Sorting keys and lowercasing hex strings puts
 * both sides in one form so the comparison reads values only.
 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === "string") {
      return /^0x[0-9a-fA-F]*$/u.test(item) ? item.toLowerCase() : item;
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.fromEntries(
      Object.entries(item as Record<string, unknown>).sort(([a], [b]) =>
        a < b ? -1 : 1,
      ),
    );
  });
}

/** JB Center prepared something other than the intent the caller built. */
export class JBCenterIntentMismatchError extends Error {
  constructor(readonly reason: "envelope" | "message") {
    super(
      reason === "envelope"
        ? "JB Center prepared a different intent than the one built here"
        : "JB Center's signing message does not carry the intent's content hash",
    );
    this.name = "JBCenterIntentMismatchError";
  }
}

export type PublishSignedIntentOptions = {
  /** The address whose signature `sign` returns. */
  publisher: Address;
  request?: JBCenterRequestOptions;
};

/**
 * Publish an intent, signing only JB Center's prepared message and only once
 * it has been checked: the prepared envelope must carry the same values as
 * the intent built here, and the message must commit to the content hash of
 * what is being signed. `sign` is the caller's own signer; this package never
 * reaches a wallet itself.
 */
export async function publishSignedIntent<TJb extends JBCenterJsonObject>(
  client: JBCenterClient,
  intent: JBCenterIntentInput<TJb>,
  sign: (message: string) => Promise<Hex>,
  options: PublishSignedIntentOptions,
): Promise<JBCenterIntent<TJb>> {
  const prepared = await client.prepareIntent(intent, options.request);
  if (canonical(prepared.envelope) !== canonical(intent)) {
    throw new JBCenterIntentMismatchError("envelope");
  }
  if (
    !prepared.message
      .toLowerCase()
      .includes(prepared.contentHash.toLowerCase())
  ) {
    throw new JBCenterIntentMismatchError("message");
  }
  const signature = await sign(prepared.message);
  return client.publishIntent(
    { ...intent, publisher: options.publisher, signature },
    options.request,
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/jbcenter/publish.test.ts --root packages/core
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Lock the module to full coverage**

In `packages/core/vitest.config.ts`, inside `test.coverage.thresholds`, add an entry beside the existing per-file entries (they sit after `functions`/`lines` and before the closing brace of `thresholds`):

```ts
        "src/jbcenter/publish.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
```

- [ ] **Step 6: Verify the coverage floor holds**

```bash
npm run test:coverage --workspace @bananapus/nana-sdk-core
```

Expected: PASS with no threshold error naming `src/jbcenter/publish.ts`. If a branch is uncovered, v8 names the line — add the missing case to `publish.test.ts` rather than lowering the threshold.

- [ ] **Step 7: Format and commit**

```bash
npm run format
git add packages/core/src/jbcenter/publish.ts \
        packages/core/src/jbcenter/publish.test.ts \
        packages/core/vitest.config.ts
git commit -m "$(cat <<'MSG'
Sign an intent only when Center prepared the one that was built

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: `describeCenterRefusal`

**Files:**
- Create: `packages/core/src/jbcenter/refusal.ts`
- Create: `packages/core/src/jbcenter/refusal.test.ts`
- Modify: `packages/core/vitest.config.ts`

**Interfaces:**
- Consumes: `JBCenterRequestError` from `../jbcenter.js`. It is a class with `readonly status: number`, `readonly code?: string`, `readonly requestId?: string`, `readonly retryAfter?: number` and `name === "JBCenterRequestError"`. Its constructor is `(message, status, code?, requestId?, retryAfter?)`. Read it **inside the function body only** — see the import-cycle rule in Global Constraints.
- Produces, for Task 5 to re-export:
  - `type JBCenterRefusalCode = "sponsor_quota" | "sponsor_budget" | "unavailable" | "rate_limited"`
  - `type JBCenterRefusal = { code: JBCenterRefusalCode; message: string }`
  - `function describeCenterRefusal(error: unknown): JBCenterRefusal | null`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/jbcenter/refusal.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { JBCenterRequestError } from "../jbcenter.js";
import { describeCenterRefusal } from "./refusal.js";

describe("describeCenterRefusal", () => {
  test("names the exhausted daily sponsored-deploy quota", () => {
    expect(
      describeCenterRefusal(
        new JBCenterRequestError("Quota", 429, "sponsor_quota"),
      ),
    ).toEqual({
      code: "sponsor_quota",
      message:
        "Center's daily sponsored-deploy quota is used up. Try again tomorrow.",
    });
  });

  test("names the spent daily sponsorship budget", () => {
    expect(
      describeCenterRefusal(
        new JBCenterRequestError("Budget", 429, "sponsor_budget"),
      ),
    ).toEqual({
      code: "sponsor_budget",
      message:
        "Center's daily sponsorship budget is spent. Try again tomorrow.",
    });
  });

  test("names paused sponsorship", () => {
    expect(
      describeCenterRefusal(
        new JBCenterRequestError("Paused", 503, "unavailable"),
      ),
    ).toEqual({
      code: "unavailable",
      message: "Sponsored deploys are paused right now. Try again shortly.",
    });
  });

  test("reads a known code whatever status carries it", () => {
    expect(
      describeCenterRefusal(
        new JBCenterRequestError("Not sponsorable", 400, "sponsor_budget"),
      ),
    ).toEqual({
      code: "sponsor_budget",
      message:
        "Center's daily sponsorship budget is spent. Try again tomorrow.",
    });
  });

  test("falls back to rate limiting on a 429 with no code", () => {
    expect(describeCenterRefusal(new JBCenterRequestError("Slow down", 429)))
      .toEqual({
        code: "rate_limited",
        message:
          "Center is rate limiting sponsored deploys. Try again shortly.",
      });
  });

  test("falls back to unavailable on a 503 with no code", () => {
    expect(describeCenterRefusal(new JBCenterRequestError("Down", 503)))
      .toEqual({
        code: "unavailable",
        message: "Sponsored deploys are paused right now. Try again shortly.",
      });
  });

  test("falls back to rate limiting on a 429 carrying an unknown code", () => {
    expect(
      describeCenterRefusal(
        new JBCenterRequestError("Slow down", 429, "rate_limit"),
      ),
    ).toEqual({
      code: "rate_limited",
      message: "Center is rate limiting sponsored deploys. Try again shortly.",
    });
  });

  test("returns null for a Center error this wording does not cover", () => {
    expect(
      describeCenterRefusal(
        new JBCenterRequestError("Bad request", 400, "invalid_envelope"),
      ),
    ).toBeNull();
  });

  test("returns null for anything that is not a Center request error", () => {
    expect(describeCenterRefusal(new Error("boom"))).toBeNull();
    expect(describeCenterRefusal("boom")).toBeNull();
    expect(describeCenterRefusal(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/jbcenter/refusal.test.ts --root packages/core
```

Expected: FAIL — `Failed to resolve import "./refusal.js"`.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/jbcenter/refusal.ts`:

```ts
// `jbcenter.ts` re-exports this module, so the two form an import cycle. Keep
// the `JBCenterRequestError` read inside the function body: a top-level read
// would resolve before `jbcenter.ts` finishes evaluating under CJS.
import { JBCenterRequestError } from "../jbcenter.js";

export type JBCenterRefusalCode =
  | "sponsor_quota"
  | "sponsor_budget"
  | "unavailable"
  | "rate_limited";

export type JBCenterRefusal = {
  code: JBCenterRefusalCode;
  message: string;
};

/** One sentence per refusal, so no provider or gateway text reaches a reader. */
const MESSAGES: Record<JBCenterRefusalCode, string> = {
  sponsor_quota:
    "Center's daily sponsored-deploy quota is used up. Try again tomorrow.",
  sponsor_budget:
    "Center's daily sponsorship budget is spent. Try again tomorrow.",
  unavailable: "Sponsored deploys are paused right now. Try again shortly.",
  rate_limited:
    "Center is rate limiting sponsored deploys. Try again shortly.",
};

function refusal(code: JBCenterRefusalCode): JBCenterRefusal {
  return { code, message: MESSAGES[code] };
}

/**
 * The sentence to show when JB Center declines to sponsor a deploy, or `null`
 * when the failure is something else and the caller should keep its own
 * wording.
 */
export function describeCenterRefusal(error: unknown): JBCenterRefusal | null {
  if (!(error instanceof JBCenterRequestError)) return null;
  if (
    error.code === "sponsor_quota" ||
    error.code === "sponsor_budget" ||
    error.code === "unavailable"
  ) {
    return refusal(error.code);
  }
  if (error.status === 429) return refusal("rate_limited");
  if (error.status === 503) return refusal("unavailable");
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/jbcenter/refusal.test.ts --root packages/core
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Lock the module to full coverage**

In `packages/core/vitest.config.ts`, inside `test.coverage.thresholds`, add beside the entry Task 1 added:

```ts
        "src/jbcenter/refusal.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
```

- [ ] **Step 6: Verify the coverage floor holds**

```bash
npm run test:coverage --workspace @bananapus/nana-sdk-core
```

Expected: PASS with no threshold error naming `src/jbcenter/refusal.ts`.

- [ ] **Step 7: Format and commit**

```bash
npm run format
git add packages/core/src/jbcenter/refusal.ts \
        packages/core/src/jbcenter/refusal.test.ts \
        packages/core/vitest.config.ts
git commit -m "$(cat <<'MSG'
Say the same sentence every time Center declines to sponsor a deploy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: Decode `HomerunDeployer.launchFundFor`

**Files:**
- Modify: `packages/core/src/jbcenter/decode.ts`
- Modify: `packages/core/src/jbcenter/decode.test.ts`

**Interfaces:**
- Consumes: `createJBCenterDeploymentCall` from `../jbcenter.js` (already imported by `decode.test.ts`); `JBCenterDeploymentCall = { chainId: number; to: Address; data: Hex }`.
- Produces: a new member of the existing `JBCenterDecodedLaunch` union. The union's discriminant is named **`flavor`**, not `kind` — every other member uses `flavor`, so this one does too:

```ts
  | {
      flavor: "homerun-fund";
      owner: Address;
      projectUri: string;
      tokenName: string;
      ticker: string;
      mustStartAtOrAfter: number;
      salt: Hex;
      peerSuckerDeployers: readonly Address[];
    }
```

`mustStartAtOrAfter` is a `number`: viem decodes `uint48` to a JS number, verified against the real ABI.

Background the implementer needs: every existing decoder gates on `v6Address(contract, chainId)` matching `call.to`. `HomerunDeployer` is **not** in the SDK's V6 address registry (it is Homerun's own contract, per-chain, registered in Homerun's app), so this decoder cannot gate on the address. It matches on the selector alone and therefore must run **last** in `DECODERS`, after every address-gated decoder.

- [ ] **Step 1: Write the failing test**

Append to the `describe` block in `packages/core/src/jbcenter/decode.test.ts`:

```ts
  test("HomerunDeployer.launchFundFor round-trips through a deployment call", () => {
    // The signature the selector must match, from HomerunDeployer.sol:
    // launchFundFor(address,string,string,string,uint48,bytes32,address[])
    const abi = parseAbi([
      "function launchFundFor(address owner, string projectUri, string name, string ticker, uint48 mustStartAtOrAfter, bytes32 salt, address[] peerSuckerDeployers) payable returns (uint256 projectId, address token)",
    ]);
    const deployer = "0x00000000000000000000000000000000000fa0ed" as const;
    const peers = [
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000002",
    ] as const;

    const call = createJBCenterDeploymentCall({
      chainId: CHAIN_ID,
      address: deployer,
      abi,
      functionName: "launchFundFor",
      args: [OWNER, "ipfs://fund", "Fund", "FUND", 1_790_000_000, SALT, peers],
    });

    expect(call.data.slice(0, 10)).toBe("0x011fb19e");
    expect(decodeDeploymentCall(call)).toEqual({
      flavor: "homerun-fund",
      owner: OWNER,
      projectUri: "ipfs://fund",
      tokenName: "Fund",
      ticker: "FUND",
      mustStartAtOrAfter: 1_790_000_000,
      salt: SALT,
      peerSuckerDeployers: peers,
    });
  });

  test("an unlinked FUND decodes with a zero salt and no peers", () => {
    const abi = parseAbi([
      "function launchFundFor(address owner, string projectUri, string name, string ticker, uint48 mustStartAtOrAfter, bytes32 salt, address[] peerSuckerDeployers) payable returns (uint256 projectId, address token)",
    ]);
    const call = createJBCenterDeploymentCall({
      chainId: CHAIN_ID,
      address: "0x00000000000000000000000000000000000fa0ed",
      abi,
      functionName: "launchFundFor",
      args: [OWNER, "ipfs://fund", "Fund", "FUND", 0, zeroHash, []],
    });

    expect(decodeDeploymentCall(call)).toEqual({
      flavor: "homerun-fund",
      owner: OWNER,
      projectUri: "ipfs://fund",
      tokenName: "Fund",
      ticker: "FUND",
      mustStartAtOrAfter: 0,
      salt: zeroHash,
      peerSuckerDeployers: [],
    });
  });
```

Add `parseAbi` to the existing `viem` import at the top of `decode.test.ts` (it already imports `encodeFunctionData`, `isAddressEqual`, `parseEther`, `zeroAddress`, `zeroHash`).

Note the two constants already defined at the top of that file and reused here: `CHAIN_ID = 8453`, `OWNER = "0x000000000000000000000000000000000000dEaD"`, `SALT = "0xabab…ab"` (32 bytes).

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/jbcenter/decode.test.ts --root packages/core
```

Expected: FAIL — the two new tests receive `{ flavor: "unknown", to: "0x00000000000000000000000000000000000fa0ed", selector: "0x011fb19e" }`. (The `expect(call.data.slice(0, 10)).toBe("0x011fb19e")` assertion should already pass — that line pins the selector to `HomerunDeployer.sol`; if it fails, the ABI fragment does not match the contract and nothing else should be written until it does.)

- [ ] **Step 3: Write the implementation**

In `packages/core/src/jbcenter/decode.ts`:

a. Add `parseAbi` to the `viem` import:

```ts
import {
  decodeFunctionData,
  isAddressEqual,
  parseAbi,
  slice,
  type Address,
  type Hex,
} from "viem";
```

b. Add the new member to the `JBCenterDecodedLaunch` union, immediately before the closing `| { flavor: "unknown"; ... }` member:

```ts
  | {
      flavor: "homerun-fund";
      owner: Address;
      projectUri: string;
      tokenName: string;
      ticker: string;
      mustStartAtOrAfter: number;
      salt: Hex;
      peerSuckerDeployers: readonly Address[];
    }
```

c. Add the ABI fragment and decoder after `decodeRevnetDeploy`:

```ts
/** Source: HomerunDeployer.sol. Carried here because Homerun deploys its own
 * per-chain deployer, which the V6 address registry does not name. */
const homerunLaunchFundAbi = parseAbi([
  "function launchFundFor(address owner, string projectUri, string name, string ticker, uint48 mustStartAtOrAfter, bytes32 salt, address[] peerSuckerDeployers) payable returns (uint256 projectId, address token)",
]);

/** Matched on the selector alone: the target address is Homerun's, not one
 * this package can resolve, so this runs after every address-gated decoder. */
function decodeHomerunFundLaunch(
  call: JBCenterDeploymentCall,
): JBCenterDecodedLaunch | null {
  try {
    const decoded = decodeFunctionData({
      abi: homerunLaunchFundAbi,
      data: call.data,
    });
    const [
      owner,
      projectUri,
      tokenName,
      ticker,
      mustStartAtOrAfter,
      salt,
      peerSuckerDeployers,
    ] = decoded.args;
    return {
      flavor: "homerun-fund",
      owner,
      projectUri,
      tokenName,
      ticker,
      mustStartAtOrAfter,
      salt,
      peerSuckerDeployers,
    };
  } catch {
    return null;
  }
}
```

d. Append it to `DECODERS`, last:

```ts
const DECODERS = [
  decodeProjectLaunch,
  decodeProject721Launch,
  decodeOmnichainLaunch,
  decodeRevnetDeploy,
  decodeHomerunFundLaunch,
];
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/jbcenter/decode.test.ts --root packages/core
```

Expected: PASS, including the pre-existing "unsupported chain yields unknown" and "garbage calldata yields unknown" tests — the selector-only decoder must not swallow them.

- [ ] **Step 5: Format and commit**

```bash
npm run format
git add packages/core/src/jbcenter/decode.ts packages/core/src/jbcenter/decode.test.ts
git commit -m "$(cat <<'MSG'
Read a Homerun FUND launch back out of an intent's frozen calldata

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: `searchIntents` filters by owner and publisher

**Files:**
- Modify: `packages/core/src/jbcenter.ts` (`JBCenterSearchParams` at ~line 224; `searchIntents` at ~line 656)
- Modify: `packages/core/src/jbcenter.test.ts`

**Interfaces:**
- Produces:
  - `JBCenterSearchParams = { query?: string; limit?: number; cursor?: string; owner?: Address; publisher?: Address }`
  - `client.searchIntents(params?, options?)` appends `owner` and `publisher` to the query string **after** `q`, `limit` and `cursor`, so the existing URL assertion in `jbcenter.test.ts` (`?q=public+goods&limit=20&cursor=40`) is unchanged.

- [ ] **Step 1: Write the failing test**

Add a standalone test to the top-level `describe("JB Center client", …)` block in `packages/core/src/jbcenter.test.ts` (a separate client and fetch mock, so the existing exact-URL-list test is untouched):

```ts
  test("filters search by owner and publisher", async () => {
    const page = { items: [], totalCount: 0, nextCursor: null };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(page));
    const client = createJBCenterClient({ fetch: fetchMock });

    await expect(
      client.searchIntents({ owner: address, publisher: address }),
    ).resolves.toEqual(page);
    await expect(
      client.searchIntents({
        query: "public goods",
        limit: 20,
        cursor: "40",
        owner: address,
        publisher: address,
      }),
    ).resolves.toEqual(page);
    await expect(client.searchIntents({ owner: address })).resolves.toEqual(
      page,
    );

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `https://juicebox.center/v1/search?owner=${address}&publisher=${address}`,
      `https://juicebox.center/v1/search?q=public+goods&limit=20&cursor=40&owner=${address}&publisher=${address}`,
      `https://juicebox.center/v1/search?owner=${address}`,
    ]);
  });
```

`address` and `jsonResponse` already exist at the top of that file (`address = 0x5656…56`, digits only, so `URLSearchParams` does not escape it).

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/jbcenter.test.ts --root packages/core
```

Expected: FAIL — TypeScript rejects `owner` / `publisher` as unknown properties on `JBCenterSearchParams`, and at runtime the URLs come back as `https://juicebox.center/v1/search`.

- [ ] **Step 3: Write the implementation**

In `packages/core/src/jbcenter.ts`, replace the `JBCenterSearchParams` type:

```ts
export type JBCenterSearchParams = {
  query?: string;
  limit?: number;
  cursor?: string;
  /** The intent's `jb.owner`, matched without regard to checksum casing. */
  owner?: Address;
  /** The address that signed the intent, matched the same way. */
  publisher?: Address;
};
```

and the body of `searchIntents`:

```ts
  searchIntents(
    params: JBCenterSearchParams = {},
    options?: JBCenterRequestOptions,
  ): Promise<JBCenterSearchPage> {
    const query = new URLSearchParams();
    if (params.query !== undefined) query.set("q", params.query);
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.cursor !== undefined) query.set("cursor", params.cursor);
    if (params.owner !== undefined) query.set("owner", params.owner);
    if (params.publisher !== undefined)
      query.set("publisher", params.publisher);
    const suffix = query.size ? `?${query}` : "";
    return this.fetchJson(`v1/search${suffix}`, {}, isSearchPage, options);
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/jbcenter.test.ts --root packages/core
```

Expected: PASS, including the pre-existing exact-URL-list test.

- [ ] **Step 5: Format and commit**

```bash
npm run format
git add packages/core/src/jbcenter.ts packages/core/src/jbcenter.test.ts
git commit -m "$(cat <<'MSG'
Search intents by owner and by publisher

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: Publish the surface — exports, README, changeset, budget, full gate

**Files:**
- Modify: `packages/core/src/jbcenter.ts` (re-exports, beside the existing `./jbcenter/decode.js` / `merge.js` / `ensureDeployed.js` blocks at lines 77-96)
- Modify: `packages/core/src/publicSurface.test.ts`
- Modify: `README.md` (repo root)
- Modify: `scripts/check-package-budgets.mjs`
- Create: `.changeset/intent-helpers.md`

**Interfaces:**
- Consumes: everything Tasks 1-4 produced — `JBCenterIntentMismatchError`, `PublishSignedIntentOptions`, `publishSignedIntent`, `JBCenterRefusal`, `JBCenterRefusalCode`, `describeCenterRefusal`, the `homerun-fund` flavor, and `JBCenterSearchParams.owner` / `.publisher`.
- Produces: the published 2.8.0 surface Task 6 ships.

- [ ] **Step 1: Write the failing surface test**

In `packages/core/src/publicSurface.test.ts`, inside the test named `"exports the framework-free utility and V6 transaction boundaries"`, add after the existing `expect(sdk.EnsureDeployedError).toBeTypeOf("function");` line:

```ts
    expect(sdk.publishSignedIntent).toBeTypeOf("function");
    expect(sdk.JBCenterIntentMismatchError).toBeTypeOf("function");
    expect(sdk.describeCenterRefusal).toBeTypeOf("function");
    expect(sdk.describeCenterRefusal(new Error("boom"))).toBeNull();
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/publicSurface.test.ts --root packages/core
```

Expected: FAIL — `sdk.publishSignedIntent` is `undefined`, and TypeScript reports the three properties do not exist on the module.

- [ ] **Step 3: Add the re-exports**

In `packages/core/src/jbcenter.ts`, after the `./jbcenter/ensureDeployed.js` export block (ends line 96), add:

```ts
export type { PublishSignedIntentOptions } from "./jbcenter/publish.js";
export {
  JBCenterIntentMismatchError,
  publishSignedIntent,
} from "./jbcenter/publish.js";

export type {
  JBCenterRefusal,
  JBCenterRefusalCode,
} from "./jbcenter/refusal.js";
export { describeCenterRefusal } from "./jbcenter/refusal.js";
```

`src/index.ts` already does `export * from "./jbcenter.js"`, so no change is needed there.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/publicSurface.test.ts --root packages/core
```

Expected: PASS.

- [ ] **Step 5: Document every jbcenter helper in the README**

In the root `README.md`, inside the `### Project intents` subsection, replace the final paragraph (the one beginning "An undeployed intent in a merged list routes to `/intent/<id>` (`intentPath`)." and ending "…instead of continuing to render the intent view.") with that same paragraph followed by the publish-guard and refusal material and a table naming every helper the module exports:

````markdown
An undeployed intent in a merged list routes to `/intent/<id>` (`intentPath`).
Once `isFullyDeployed` reports every chain deployed, redirect that route to
the project's own page instead of continuing to render the intent view.

A publisher signs JB Center's prepared message, not its own — so it has to
check the message first. `publishSignedIntent` does that check and then
publishes, with the app's own signer passed in; this package never reaches a
wallet:

```ts
import { publishSignedIntent } from "@bananapus/nana-sdk-core/jbcenter";

const published = await publishSignedIntent(
  center,
  intent,
  (message) => walletClient.signMessage({ account, message }),
  { publisher: account.address },
);
```

It refuses with a `JBCenterIntentMismatchError` before calling the signer when
JB Center's prepared envelope carries different values than the intent built
locally (`reason: "envelope"` — key order and hex casing are JB Center's to
choose, the values are not), or when the prepared message does not carry the
content hash of what is being signed (`reason: "message"`).

When JB Center declines to sponsor a deploy, show its refusal in fixed
wording rather than a provider's text:

```ts
import { describeCenterRefusal } from "@bananapus/nana-sdk-core/jbcenter";

const refusal = describeCenterRefusal(error);
if (refusal) showNotice(refusal.message);
else throw error;
```

The module's helpers, in full:

| Helper | What it does |
| --- | --- |
| `createJBCenterClient` | Builds the `JBCenterClient` every helper below takes. |
| `createJBCenterRpcProvider` | A chain-bound EIP-1193 provider over JB Center's read-only RPC. |
| `createJBCenterDeploymentCall` | Freezes a typed viem request into the `{ chainId, to, data }` call an intent signs. |
| `publishSignedIntent` | Prepares, checks JB Center's envelope and message, signs with the caller's signer, publishes. |
| `JBCenterIntentMismatchError` | Thrown by `publishSignedIntent` before signing; `reason` is `"envelope"` or `"message"`. |
| `decodeDeploymentCall` | Reads a frozen call back as a project, 721, omnichain, revnet, or Homerun FUND launch. |
| `mergeSearch` | Interleaves undeployed intent rows into a list of deployed project rows by creation time. |
| `intentRow` | Turns one search item into the row `mergeSearch` merges. |
| `intentPath` | The `/intent/<id>` route for an undeployed intent. |
| `deployedChains` | The chain ids an intent has landed on. |
| `isFullyDeployed` | Whether every chain in the intent has landed. |
| `isSponsorable` | Whether JB Center's sponsor covers every chain in the list. |
| `ensureDeployed` | The pre-step before an intent's first on-chain write: one sender per intent, polled to completion. |
| `EnsureDeployedError` | Thrown by `ensureDeployed` when a chain cannot be finished; carries the `chainId`. |
| `describeCenterRefusal` | The fixed sentence for a sponsorship refusal, or `null` when the failure is something else. |
| `JBCenterRequestError` | A non-2xx answer from JB Center; carries `status`, `code`, `requestId`, `retryAfter`. |
| `JBCenterTimeoutError` | A request that passed its `timeoutMs`. |
| `JBCenterRpcError` | A JSON-RPC error from the read-only RPC; carries `code` and `data`. |
| `JBCENTER_SPONSORED_CHAIN_IDS` | The chain ids JB Center's sponsor covers. |
````

Also extend the `decodeDeploymentCall` example a few lines above so it names the new flavor:

```ts
const launch = decodeDeploymentCall(deploymentCall);
if (launch.flavor === "revnet") {
  // launch.stages, launch.description, launch.accountingContexts
}
if (launch.flavor === "homerun-fund") {
  // launch.tokenName, launch.ticker, launch.mustStartAtOrAfter, launch.salt
}
```

- [ ] **Step 6: Write the changeset**

Create `.changeset/intent-helpers.md` (the prior one, `project-intents.md`, is the model: a `minor` bump on the one package, then prose that names each helper):

```markdown
---
"@bananapus/nana-sdk-core": minor
---

`@bananapus/nana-sdk-core/jbcenter` now carries the parts every intent client
was rebuilding: `publishSignedIntent` prepares an intent, signs JB Center's
message only once the prepared envelope carries the same values as the one
built locally and the message commits to its content hash — throwing
`JBCenterIntentMismatchError` otherwise — and publishes it with the caller's
own signer; `describeCenterRefusal` turns a sponsorship refusal into one fixed
sentence per `sponsor_quota`, `sponsor_budget`, `unavailable`, and a bare 429
or 503, and `null` for anything else, so no provider text reaches a reader;
`decodeDeploymentCall` reads `HomerunDeployer.launchFundFor` back as a
`"homerun-fund"` launch with its owner, project uri, token name, ticker, start,
salt, and peer sucker deployers; and `searchIntents` filters by `owner` and by
`publisher`.
```

- [ ] **Step 7: Raise the package budget**

Measured on `origin/main` before this work: `@bananapus/nana-sdk-core` packs **458** entries against a cap of **460**, at 889,899 B packed (cap 900,000) and 18,311,235 B unpacked (cap 18,750,000). Each new source file emits `.js`, `.js.map`, `.d.ts`, `.d.ts.map` in both ESM and CJS — eight entries — so `publish.ts` and `refusal.ts` add sixteen, putting the package at ~474 entries and over the cap.

In `scripts/check-package-budgets.mjs`, update the `@bananapus/nana-sdk-core` budget and extend the comment block's last sentence to name the new files:

```js
  "@bananapus/nana-sdk-core": {
    directory: "packages/core",
    // Includes the public Bendystraw transport, supported-chain definitions,
    // direct-pay routing, Permit2 helpers, the viem error discriminators, the
    // price-feed reachability probe, the Uniswap V4 LP-split-hook ABIs, and
    // tree-shakable loan/deployment and JB Center entry points in both ESM and
    // CJS formats, plus the router gateway, ratio feed, and preserved router/
    // buyback ABI generations required by projects that have not migrated.
    // The /safe entry point adds eight ESM/CJS JS/declaration/map artifacts.
    // The JB Center intent decoder, merger, and deploy pre-step add
    // twenty-four more, and its guarded publish and refusal wording sixteen.
    packed: 940_000,
    unpacked: 18_900_000,
    entries: 480,
  },
```

- [ ] **Step 8: Verify the budget against the real numbers**

```bash
npm run build --workspace @bananapus/nana-sdk-core
npm run check:package
```

Expected: the script prints one line per workspace and exits 0. Read the printed `@bananapus/nana-sdk-core` numbers: entries should be ~474 and packed ~900 KB. If any printed number exceeds the value just set, raise that value to the printed number plus roughly 5% headroom and re-run — do not shrink the source to fit.

- [ ] **Step 9: Run the repo's full gate**

```bash
source "$NVM_DIR/nvm.sh" && nvm use
export PROTOCOL_DEPLOYMENTS_DIR=/Users/jango/Documents/jb/v6/evm/deploy-all-v6/deployments
npm run check
```

`npm run check` chains, in order: `deps:check` (npm ls), `dead-code:check` (knip), `protocol:check`, `wallet:check`, `format:ratchet`, `check:gql`, `type-check`, `test:coverage`, `build`, `check:package`, `check:generated`. Expected: all green.

Known friction and what to do about it:
- **`protocol:check`** verifies the generated bindings against a pinned `deploy-all-v6` checkout. CI pins ref `a6ab40c5806b52ff4cb21f9eaefe275e621796f9`; the local submodule may sit elsewhere. If it fails on a deployment mismatch (not on anything this branch changed), point it at the pinned tree instead:
  ```bash
  git -C /Users/jango/Documents/jb/v6/evm/deploy-all-v6 worktree add --detach \
    /tmp/deploy-all-v6-pinned a6ab40c5806b52ff4cb21f9eaefe275e621796f9
  PROTOCOL_DEPLOYMENTS_DIR=/tmp/deploy-all-v6-pinned/deployments npm run protocol:check
  ```
- **`wallet:check`** must report `0 unreviewed residuals` with no new entry in `test/wallet-boundaries.json`. If it names `packages/core/src/jbcenter/publish.ts`, the signer callback was given a flagged name — rename it back to `sign` rather than adding an inventory entry.
- **`format:ratchet`** fails on any newly unformatted file. Fix with `npm run format`, never by editing `test/format-debt.json`.
- **`dead-code:check`** (knip) flags unreachable exports. Both new modules are reached through `jbcenter.ts` and through their own tests, so this should pass; if it flags a type, check the re-export in Step 3 spells it exactly.

- [ ] **Step 10: Build**

```bash
npm run build
```

Expected: exit 0. Confirm the new artifacts exist:

```bash
ls packages/core/dist/esm/jbcenter/ packages/core/dist/cjs/jbcenter/
```

Expected: `publish.js`, `publish.d.ts`, `refusal.js`, `refusal.d.ts` (plus their `.map` files) in both directories.

- [ ] **Step 11: Format and commit**

```bash
npm run format
git add packages/core/src/jbcenter.ts \
        packages/core/src/publicSurface.test.ts \
        README.md \
        scripts/check-package-budgets.mjs \
        .changeset/intent-helpers.md
git commit -m "$(cat <<'MSG'
Export the shared intent helpers and name every one of them in the README

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: Ship 2.8.0

**Files:** none in the working tree — this task is the pull request and the release.

**Interfaces:**
- Consumes: the five commits from Tasks 1-5 on `feat/intent-helpers`.
- Produces: `@bananapus/nana-sdk-core@2.8.0` on npm.

How 2.7.0 was released, read from the repo (this is the process to repeat): the feature PR (#139, "Add the project intents surface to the Center client") merged to `main` carrying `.changeset/project-intents.md`. `.github/workflows/release.yml` runs on every push to `main`: it re-runs the whole gate (`deps:check`, `protocol:check` against the pinned `deploy-all-v6`, `wallet:check`, `format:ratchet`, `audit:prod`, `type-check`, `check:gql`, `build`, `check:package`, `check:generated`, `test:coverage`) and then runs `changesets/action@v1.9.0` with `publish: npm run release`. With a changeset present and no version PR open, that action opened PR #140 "Version Packages", which consumed the changeset file, bumped `packages/core/package.json` to 2.7.0 and wrote `packages/core/CHANGELOG.md`. Merging #140 re-ran the workflow, which found no changesets and instead ran `npm run release` (`changeset publish`) with `NPM_TOKEN` and `NPM_CONFIG_PROVENANCE: "true"`, publishing to npm. So: **two merges, one bot PR in between. Nothing is published by hand and `packages/core/package.json` is never edited by hand.**

- [ ] **Step 1: Push the branch**

```bash
cd /Users/jango/Documents/jb/v6/evm/juice-sdk-intents-helpers
git push -u origin feat/intent-helpers
```

- [ ] **Step 2: Open the pull request**

The local directory is named `juice-sdk-connect`/`juice-sdk-intents-helpers` but the GitHub repo is `Bananapus/juice-sdk-v4`, so `gh` needs `--repo`:

```bash
gh pr create --repo Bananapus/juice-sdk-v4 --base main --head feat/intent-helpers \
  --title "Share the intent publish guard, refusal wording, FUND decoder, and owner search" \
  --body "$(cat <<'BODY'
`@bananapus/nana-sdk-core/jbcenter` takes on the four things every intent client was building for itself.

- `publishSignedIntent(client, intent, sign, { publisher })` prepares the intent, compares JB Center's prepared envelope with the one built locally in a canonical form (keys sorted, hex strings lowercased — key order and casing are Center's to choose, the values are not), requires the prepared message to carry the content hash, then calls the caller's own `sign` and publishes. It throws `JBCenterIntentMismatchError` with `reason: "envelope" | "message"` before the signer is ever called. The package still reaches no wallet: `wallet:check` records no new signing site.
- `describeCenterRefusal(error)` returns one fixed sentence for `sponsor_quota`, `sponsor_budget` and `unavailable`, falls back to `rate_limited` on a bare 429 and `unavailable` on a bare 503, and returns `null` for everything else so no provider text reaches a reader.
- `decodeDeploymentCall` reads `HomerunDeployer.launchFundFor(address,string,string,string,uint48,bytes32,address[])` (selector `0x011fb19e`) back as a `"homerun-fund"` launch. It matches on the selector and runs last, because Homerun's deployer is not in the V6 address registry.
- `searchIntents` accepts `owner` and `publisher`, appended to the query string, which is what a client's own-projects list needs.

The README's JB Center section now lists every helper the module exports with a line each. The package budget moves to 480 entries: the two new modules emit sixteen ESM/CJS artifacts and the package was two entries under the old cap.

`npm run check` and `npm run build` are green locally on Node 22.23.1.

Spec: `docs/superpowers/specs/2026-09-21-intents-docs-shared-homerun-design.md`, section 2.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 3: Wait for CI, then merge the feature PR**

```bash
gh pr checks --repo Bananapus/juice-sdk-v4 --watch
gh pr merge --repo Bananapus/juice-sdk-v4 --squash --delete-branch
```

If a check fails, fix it on the branch and push again — do not merge past a red gate.

- [ ] **Step 4: Merge the bot's Version Packages PR**

The Release workflow opens it within a few minutes of the merge. Find it and confirm it does exactly three things — deletes `.changeset/intent-helpers.md`, sets `packages/core/package.json` version to `2.8.0`, and prepends the changeset prose to `packages/core/CHANGELOG.md` under `## 2.8.0`:

```bash
gh pr list --repo Bananapus/juice-sdk-v4 --search "Version Packages"
gh pr diff --repo Bananapus/juice-sdk-v4 <number>
gh pr merge --repo Bananapus/juice-sdk-v4 <number> --squash
```

If the version reads `2.7.1` instead of `2.8.0`, the changeset was written as `patch` — close the version PR, correct `.changeset/intent-helpers.md` to `minor` on a fresh branch, merge that, and let the bot reopen.

- [ ] **Step 5: Verify the publish**

The second Release run publishes. Then:

```bash
gh run list --repo Bananapus/juice-sdk-v4 --workflow Release --limit 3
npm view @bananapus/nana-sdk-core version     # expect 2.8.0
npm view @bananapus/nana-sdk-core@2.8.0 dist.tarball
```

- [ ] **Step 6: Clean up the worktree**

```bash
cd /Users/jango/Documents/jb/v6/evm/juice-sdk-connect
git fetch origin && git -C . pull --ff-only
git worktree remove /Users/jango/Documents/jb/v6/evm/juice-sdk-intents-helpers
git worktree prune
```

If a `/tmp/deploy-all-v6-pinned` worktree was created in Task 5 Step 9:

```bash
git -C /Users/jango/Documents/jb/v6/evm/deploy-all-v6 worktree remove /tmp/deploy-all-v6-pinned
```

---

## Out of scope

Per the spec's section 4 and its section-2 closing note: no Center documentation or MCP work (that is section 1), no Homerun client work (section 3), and **Beep is not migrated** — replacing its local guard in `/Users/jango/Documents/cocopay/beep/src/intents.ts` with `publishSignedIntent` is a follow-up, not part of this plan. No new package, no React layer, no OpenAPI coverage.
