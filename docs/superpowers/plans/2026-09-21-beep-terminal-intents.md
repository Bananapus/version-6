# Beep Terminal Intents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Beep merchant creates a terminal by name and owner with no transaction; Beep publishes a project intent to juicebox.center, lists the terminal at once, and deploys the project (sponsored by Center) the first time the terminal is charged.

**Architecture:** A pure builder turns `{ name, owner, now }` into one Base `JBController.launchProjectFor` deployment call and an intent envelope. A publisher signs and publishes it with Beep's server key through the SDK's Center client. Terminals gain a nullable `project` and an `intent` record. A per-terminal deployer asks Center to sponsor the deploy, polls to confirmation, resolves the project through the existing `Protocol.resolve`, and attaches it. The first charge on a pending terminal answers 409 and the counter UI drives the deployer until the charge succeeds.

**Tech Stack:** Node 22, Hono 4, `node:sqlite`, viem 2.56, React 19 + Vite, `@bananapus/nana-sdk-core` 2.7.0 (`/v6` builders, `/jbcenter` client), `node --test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-21-beep-terminal-intents-design.md` (in the monorepo). Beep repo: `/Users/jango/Documents/cocopay/beep` (`mejango/beep`, branch from `main`).

## Global Constraints

- Base only (`8453`). USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, decimals 6. JBMultiTerminal `0x130f5dd2bd8805443cf41755253d778a75a67f53`, JBProjects `0x6017d1fba9dc279bfa0b03fd931c22e242ab3691` (from `src/protocol.ts` `BASE`).
- Intent format `beep.biz/v1`, `deploymentVersion "6"`, `chainIds [8453]`, `jb: { app: "beep", name, owner, chainIds: [8453] }`. Signing message is whatever Center's `prepareIntent` returns; sign it with `personal_sign` (`signMessage`) using `BEEP_INTENT_SIGNER_KEY`.
- Ruleset: `mustStartAtOrAfter = now` (seconds), duration 0, weight `1e18` per whole USDC (`weight: 10n ** 18n` with USD-denominated issuance is not available here; use `baseCurrency` = USDC token currency and `weight: 10n ** 30n`? No: weight is tokens per 1e18 units of the accounting currency; with a 6-decimal USDC accounting context the terminal scales the paid amount to 18 decimals before applying weight, so `weight = 10n ** 18n` yields 1 token per 1 USDC). Cash-out tax 10_000 (off), `allowOwnerMinting: true`, `allowSetTerminals: true`, `allowSetController: true`, `allowTerminalMigration: true`, `allowAddAccountingContext: true`, `allowAddPriceFeed: true`, `allowSetCustomToken: true`, `baseCurrency` = `Number(BigInt(USDC) & 0xffffffffn)`. Fund access: JBMultiTerminal, token USDC, one payout limit `{ amount: 2n ** 224n - 1n, currency: <USDC currency id> }`, no surplus allowances. Terminals: the SDK's `buildTerminalConfigurations({ chainId: 8453, accountingContexts: [{ token: USDC, decimals: 6, currency: <USDC currency id> }] })` (it appends the router terminal registry itself).
- Server requests to Center carry `Origin: <APP_ORIGIN>`. Center URL from `JBCENTER_URL` (default `https://juicebox.center`).
- `BEEP_INTENT_SIGNER_KEY` optional: absent means create-by-name is off (`/api/config` says so, the UI hides it). The key never signs a transaction.
- Never write the word "draft". No retrospective code comments. Stage by explicit path. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Tests import from `../dist/*.js`, so run `npm run build` before `node --test`.
- Center prerequisite (already in flight, separate PR): `PUBLISH_PER_PUBLISHER_PER_DAY`, `PUBLISH_PER_IP_PER_HOUR`, `SPONSOR_DEPLOYS_PER_REQUESTER_PER_DAY` raised on production; `http://127.0.0.1:8787` in Center's dev allowlist.

---

## File map (Beep repo)

- Create `src/terminal-intent.ts`: pure builder `buildTerminalIntent`.
- Create `src/intents.ts`: `IntentPublisher` (Center client + signer) and `TerminalDeployer`.
- Modify `src/store.ts`: `Terminal.project: Project | null`, `Terminal.intent?`, `createPendingTerminal`, `attachProject`, `createSale` refuses pending.
- Modify `src/app.ts`: options `intents?`, create-by-name branch, `POST /api/operator/terminals/:id/deploy`, config flag, public terminal view includes `pending`.
- Modify `src/server.ts`: env wiring.
- Modify `src/client/main.tsx`: Home "Start with a name" form (owner address, passkey prefill), Counter deploy-on-first-charge flow, Tap pending copy.
- Modify `.env.example`, `README.md`, `package.json` (dependency).
- Tests: `test/terminal-intent.test.mjs`, `test/intents.test.mjs`, extend `test/api.test.mjs`, `test/store.test.mjs`; browser `test/browser/create-terminal.spec.ts` with a fake Center in `test/browser/server.mjs`.

---

### Task 1: Pure intent builder

**Files:**
- Create: `src/terminal-intent.ts`
- Modify: `package.json` (add `"@bananapus/nana-sdk-core": "2.7.0"`)
- Test: `test/terminal-intent.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  export type TerminalIntentInput = { name: string; owner: `0x${string}`; projectUri: string; now: number /* unix seconds */ };
  export const TERMINAL_INTENT_FORMAT = "beep.biz/v1";
  export function buildTerminalDeploymentCall(input: TerminalIntentInput): { chainId: 8453; to: `0x${string}`; data: `0x${string}` };
  export function buildTerminalIntent(input: TerminalIntentInput): { format: string; deploymentVersion: "6"; chainIds: [8453]; deploymentCalls: [...]; jb: { app: "beep"; name: string; owner: string; chainIds: [8453] } };
  ```

- [ ] **Step 1: Add the dependency**

Run: `cd /Users/jango/Documents/cocopay/beep && npm install --save-exact @bananapus/nana-sdk-core@2.7.0` and confirm `package.json` and `package-lock.json` changed only for that package (viem 2.56.3 is already present and satisfies the SDK's peer range; if `npm install` wants to change viem, stop and report).

- [ ] **Step 2: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFunctionData } from 'viem';
import { buildTerminalIntent, buildTerminalDeploymentCall, TERMINAL_INTENT_FORMAT } from '../dist/terminal-intent.js';
import { jbControllerAbi } from '@bananapus/nana-sdk-core';
import { BASE } from '../dist/protocol.js';

const owner = '0x7590AF07D6C3241cC4179eEc391DcF2dB70358Ee';
const input = { name: 'Front counter', owner, projectUri: 'ipfs://bafyintent', now: 1_790_000_000 };

test('builds one Base launch that accepts USDC, pays out to the owner, and never expires', () => {
  const call = buildTerminalDeploymentCall(input);
  assert.equal(call.chainId, 8453);
  const { functionName, args } = decodeFunctionData({ abi: jbControllerAbi, data: call.data });
  assert.equal(functionName, 'launchProjectFor');
  const [launchOwner, uri, rulesets, terminals, memo] = args;
  assert.equal(launchOwner.toLowerCase(), owner.toLowerCase());
  assert.equal(uri, 'ipfs://bafyintent');
  assert.equal(memo, '');
  assert.equal(rulesets.length, 1);
  assert.equal(rulesets[0].mustStartAtOrAfter, 1_790_000_000);
  assert.equal(rulesets[0].duration, 0);
  assert.equal(rulesets[0].weight, 10n ** 18n);
  assert.equal(rulesets[0].metadata.cashOutTaxRate, 10_000);
  assert.equal(rulesets[0].metadata.allowOwnerMinting, true);
  assert.equal(rulesets[0].fundAccessLimitGroups[0].terminal.toLowerCase(), BASE.terminal);
  assert.equal(rulesets[0].fundAccessLimitGroups[0].token.toLowerCase(), BASE.usdc.toLowerCase());
  assert.equal(rulesets[0].fundAccessLimitGroups[0].payoutLimits[0].amount, 2n ** 224n - 1n);
  const usdcContext = terminals[0].accountingContextsToAccept.find(c => c.token.toLowerCase() === BASE.usdc.toLowerCase());
  assert.equal(usdcContext.decimals, 6);
});

test('the envelope names the app, owner and chain', () => {
  const intent = buildTerminalIntent(input);
  assert.equal(intent.format, TERMINAL_INTENT_FORMAT);
  assert.equal(intent.deploymentVersion, '6');
  assert.deepEqual(intent.chainIds, [8453]);
  assert.equal(intent.deploymentCalls.length, 1);
  assert.deepEqual(intent.jb, { app: 'beep', name: 'Front counter', owner, chainIds: [8453] });
});

test('the same input always freezes to the same calldata', () => {
  assert.equal(buildTerminalDeploymentCall(input).data, buildTerminalDeploymentCall(input).data);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run build 2>&1 | tail -3; node --test test/terminal-intent.test.mjs`
Expected: FAIL (module missing).

- [ ] **Step 4: Implement**

```ts
// src/terminal-intent.ts
import { buildLaunchProjectTx, buildRulesetConfiguration, buildRulesetMetadata, buildTerminalConfigurations } from '@bananapus/nana-sdk-core/v6';
import { createJBCenterDeploymentCall } from '@bananapus/nana-sdk-core/jbcenter';
import type { Address } from 'viem';
import { BASE } from './protocol.js';

export const TERMINAL_INTENT_FORMAT = 'beep.biz/v1';
const CHAIN_ID = 8453 as const;
const USDC = BASE.usdc as Address;
/** Token-keyed currency id: uint32(uint160(token)). */
const USDC_CURRENCY = Number(BigInt(USDC) & 0xffffffffn);
/** One project token per whole USDC paid. */
const WEIGHT = 10n ** 18n;
const UNLIMITED = 2n ** 224n - 1n;
const CASH_OUTS_OFF = 10_000;

export type TerminalIntentInput = { name: string; owner: Address; projectUri: string; now: number };

export function buildTerminalDeploymentCall(input: TerminalIntentInput) {
  const request = buildLaunchProjectTx({
    chainId: CHAIN_ID,
    owner: input.owner,
    projectUri: input.projectUri,
    rulesetConfigurations: [
      buildRulesetConfiguration({
        mustStartAtOrAfter: input.now,
        weight: WEIGHT,
        metadata: buildRulesetMetadata({
          baseCurrency: USDC_CURRENCY,
          cashOutTaxRate: CASH_OUTS_OFF,
          allowOwnerMinting: true,
          allowSetCustomToken: true,
          allowTerminalMigration: true,
          allowSetTerminals: true,
          allowSetController: true,
          allowAddAccountingContext: true,
          allowAddPriceFeed: true,
        }),
        fundAccessLimitGroups: [{ terminal: BASE.terminal as Address, token: USDC, payoutLimits: [{ amount: UNLIMITED, currency: USDC_CURRENCY }], surplusAllowances: [] }],
      }),
    ],
    terminalConfigurations: buildTerminalConfigurations({ chainId: CHAIN_ID, accountingContexts: [{ token: USDC, decimals: 6, currency: USDC_CURRENCY }] }),
    creationFee: 0n,
  });
  return createJBCenterDeploymentCall(request) as { chainId: typeof CHAIN_ID; to: Address; data: `0x${string}` };
}

export function buildTerminalIntent(input: TerminalIntentInput) {
  return {
    format: TERMINAL_INTENT_FORMAT,
    deploymentVersion: '6' as const,
    chainIds: [CHAIN_ID] as [typeof CHAIN_ID],
    deploymentCalls: [buildTerminalDeploymentCall(input)],
    jb: { app: 'beep' as const, name: input.name, owner: input.owner, chainIds: [CHAIN_ID] as [typeof CHAIN_ID] },
  };
}
```

Check the exact option names of `buildRulesetMetadata` in `node_modules/@bananapus/nana-sdk-core/dist/esm/v6/launch.d.ts` (e.g. `baseCurrency`, `cashOutTaxRate`) and the accounting-context field names before relying on them; adjust the test's expectations to the ABI-decoded shape.

- [ ] **Step 5: Run, commit**

Run: `npm run build && node --test test/terminal-intent.test.mjs`

```bash
git add package.json package-lock.json src/terminal-intent.ts test/terminal-intent.test.mjs
git commit -m "Build the launch behind a terminal created by name

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Store: pending terminals

**Files:**
- Modify: `src/store.ts`
- Test: `test/store.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  export type TerminalIntent = { id: string; owner: string; name: string; chainId: 8453; publishedAt: number };
  export type Terminal = { id: string; label: string; revision: number; project: Project | null; intent?: TerminalIntent; createdAt: number };
  createPendingTerminal(label: string, intent: TerminalIntent): Terminal;
  attachProject(terminalId: string, project: Project): Terminal; // sets project, bumps revision, notifies watchers
  // createSale(terminalId, ...) throws Problem(409, 'This terminal deploys on its first charge.') with code 'pending' when project is null
  ```

- [ ] **Step 1: Failing tests**

```js
test('a pending terminal lists, serves its page, and refuses charges until a project is attached', t => {
  const { store } = setup(t);
  const intent = { id: '11111111-1111-4111-8111-111111111111', owner: '0x7590AF07D6C3241cC4179eEc391DcF2dB70358Ee', name: 'Front counter', chainId: 8453, publishedAt: now };
  const terminal = store.createPendingTerminal('Front counter', intent);
  assert.equal(terminal.project, null);
  assert.deepEqual(terminal.intent, intent);
  assert.equal(store.terminals()[0].id, terminal.id);
  assert.throws(() => store.createSale(terminal.id, '5.00', 'key-1'), e => e.status === 409 && e.code === 'pending');
  const attached = store.attachProject(terminal.id, project);
  assert.equal(attached.project.projectId, project.projectId);
  assert.equal(attached.revision, 2);
  const sale = store.createSale(terminal.id, '5.00', 'key-2');
  assert.equal(sale.projectId, project.projectId);
  assert.equal(sale.configurationRevision, 2);
});
```

`Problem` needs an optional `code`: check `src/problem.ts` (or wherever `Problem` lives); if it has no `code` field, add `code?: string` as a third constructor argument and include it in the JSON error body in `app.onError`.

- [ ] **Step 2: Run to verify it fails**, **Step 3: Implement**

`Terminal.project` becomes `Project | null`; `createTerminal` stays as is (sets `project`); add `createPendingTerminal` (`project: null`, `intent`); `attachProject` reads the row, sets `project`, `revision + 1`, writes it back inside `transaction`, and calls the existing change notification so SSE watchers refresh; `createSale` checks `terminal.project` first and throws `new Problem(409, 'This terminal deploys on its first charge.', 'pending')`. Fix every `terminal.project.<field>` use in `src/` that TypeScript now flags (`createSale`, `terminalView` consumers, `Protocol.quote` reads `sale.project`, which stays non-null because sales exist only after attach).

- [ ] **Step 4: Run, commit**

Run: `npm run build && node --test test/store.test.mjs test/api.test.mjs`

```bash
git add src/store.ts src/problem.ts test/store.test.mjs
git commit -m "Let a terminal exist before its project does

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Publisher and deployer

**Files:**
- Create: `src/intents.ts`
- Test: `test/intents.test.mjs`

**Interfaces:**
- Consumes: `buildTerminalIntent` (Task 1), `Store.createPendingTerminal`/`attachProject` (Task 2), `Protocol.resolve`.
- Produces:
  ```ts
  export type IntentsOptions = { centerUrl: string; origin: string; signerKey: `0x${string}`; fetch?: typeof fetch; now?: () => number };
  export class IntentPublisher {
    constructor(options: IntentsOptions);
    readonly publisher: Address; // derived from signerKey
    publishTerminal(input: { name: string; owner: Address }): Promise<TerminalIntent>; // pins { name } via client.pinJson, builds, prepareIntent, signMessage, publishIntent
  }
  export type DeployProgress = { status: 'deploying' | 'deployed' | 'failed'; project?: Project; error?: string };
  export class TerminalDeployer {
    constructor(options: { store: Store; protocol: Pick<Protocol, 'resolve'>; client: JBCenterClient; pollMs?: number; timeoutMs?: number });
    ensure(terminalId: string): Promise<DeployProgress>; // idempotent per terminal: one in-flight promise per id; returns quickly with 'deploying' while work continues in the background; 'deployed' with the project once attached
  }
  ```
  `ensure` semantics: if the terminal already has a project → `deployed`. Else if a run is in flight → `deploying`. Else start a run: `client.getIntent(intent.id)`; if it already has a Base deployment, skip to resolve; else `client.requestDeploy(intent.id)` (a `JBCenterRequestError` with status 400/429/503 → `failed` with a short message: "Center cannot sponsor this terminal right now"); poll `getIntent` every `pollMs` (default 4000) up to `timeoutMs` (default 600000) until the Base deploy row is `confirmed` and `deployments` has 8453, or a row is `failed` → `failed` with its error; then `protocol.resolve(\`8453:${projectId}\`)` → `store.attachProject` → `deployed`. The last outcome is cached per terminal for 60 s so the polling client sees `failed` once, after which `ensure` may start a new run.

- [ ] **Step 1: Failing tests** (fake `fetch` scripted per URL: `v1/pins/json` → `{ cid, uri: 'ipfs://bafy…' }`; `v1/intents/message` → `{ contentHash, message, envelope }`; `v1/intents` → intent JSON with `deploys: []`; `v1/intents/:id/deploy` → 202 `{ deploys: [{ chainId: 8453, status: 'queued', … }] }`; `v1/intents/:id` → first `sent`, then `confirmed` with `deployments: [{ chainId: 8453, projectId: '31', transactionHash, createdAt }]`; the `Origin` header on every request equals the configured origin)

```js
test('publishTerminal pins the name, signs Center\'s message with the server key, and publishes the owner', async () => { /* assert the published body has publisher === account.address, signature recovers to it (recoverMessageAddress), jb.owner === owner, envelope.deploymentCalls[0].chainId === 8453 */ });
test('ensure requests a sponsored deploy once, polls to confirmation, resolves and attaches the project', async () => { /* first ensure() → deploying; advance the scripted poll; awaiting the internal run (expose a `settled(terminalId)` promise for tests) → deployed; store.terminal(id).project.projectId === '31'; requestDeploy fetched exactly once even when ensure() is called three times */ });
test('ensure maps a Center refusal to failed and can be retried later', async () => { /* 429 sponsor_budget → failed with message; after the cache window (inject now()) a new ensure() calls requestDeploy again */ });
test('ensure attaches a project Center already recorded without requesting a deploy', async () => {});
```

- [ ] **Step 2: Run to verify they fail**, **Step 3: Implement** (`createJBCenterClient({ baseUrl: centerUrl, fetch: withOrigin })` where `withOrigin` sets the `Origin` header; `privateKeyToAccount(signerKey)` from `viem/accounts`; `account.signMessage({ message })`), **Step 4: Run, commit**

```bash
git add src/intents.ts test/intents.test.mjs
git commit -m "Publish terminal intents and deploy them on demand

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Routes and config

**Files:**
- Modify: `src/app.ts`, `src/server.ts`, `.env.example`, `README.md`
- Test: `test/api.test.mjs`

**Interfaces:**
- `Options.intents?: { publisher: IntentPublisher; deployer: TerminalDeployer }`.
- `POST /api/operator/terminals`: body `{ label, reference }` (unchanged) or `{ label, owner }` → when `intents` is configured and `owner` is a valid address (`isAddress`), publish and `createPendingTerminal`; 503 "Creating terminals by name is not enabled" without `intents`; 400 on a bad owner.
- `POST /api/operator/terminals/:id/deploy` → `deployer.ensure(id)` → 200 `DeployProgress`.
- `POST /api/operator/terminals/:id/invoices` on a pending terminal → 409 `{ error: '…', code: 'pending' }` (from the store).
- `GET /api/terminals/:id` and `GET /api/operator/terminals/:id` include `pending: boolean` and `intent` (id, owner, name) when pending.
- `GET /api/config` gains `createByName: boolean`.
- `server.ts`: when `BEEP_INTENT_SIGNER_KEY` matches `/^0x[0-9a-fA-F]{64}$/`, build `IntentPublisher` and `TerminalDeployer` with `JBCENTER_URL ?? 'https://juicebox.center'` and pass `intents`; a malformed key throws at boot.

- [ ] **Step 1: Failing tests** in `test/api.test.mjs` (extend `setup` to accept a fake `intents` object with `publisher.publishTerminal` and `deployer.ensure` stubs): create by name → 201 with `project: null` and `intent.owner`; create by name without `intents` → 503; bad owner → 400; charge on pending → 409 code `pending`; deploy route returns the stub's progress; public view carries `pending: true`; config `createByName`.
- [ ] **Step 2: Run to verify they fail**, **Step 3: Implement**, **Step 4: Docs** (`.env.example`: `BEEP_INTENT_SIGNER_KEY=`, `JBCENTER_URL=https://juicebox.center` with one comment line each; README: a "Create a terminal by name" paragraph: what the key is, that it holds nothing, that Center sponsors the deploy on Base on the first charge, and the Center-side limits a platform needs raised), **Step 5: Run, commit**

```bash
git add src/app.ts src/server.ts .env.example README.md test/api.test.mjs
git commit -m "Create a terminal by name and deploy it on the first charge

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Operator and customer UI

**Files:**
- Modify: `src/client/main.tsx`
- Test: `test/browser/create-terminal.spec.ts`, `test/browser/server.mjs` (fake Center)

**Interfaces:**
- Consumes: `/api/config.createByName`, the create-by-name body, `/api/operator/terminals/:id/deploy`, the 409 `pending` code, `pending`/`intent` in terminal views.

- [ ] **Step 1: Home "Start with a name"**

In `Home` (`src/client/main.tsx:116-154`), when `config.createByName`, render the name-first form above the existing "Find project" form: `Terminal name` input (the existing `label` state), `Owner address` input (`owner` state, validated with viem's `isAddress`), a "Use my passkey account" button that runs the same Center passkey connection the checkout uses (`center.current.restoreConnection()` / the `JBConnectModal` passkey option; extract the minimal connect-and-read-address helper from `Checkout` into a shared function so both use it) and fills `owner` with `connected.address`, and a "Create terminal" button that posts `{ label, owner }` and navigates to `/operator/t/<id>`. Copy under the form: "Your terminal is ready now. It deploys on Base the first time you charge it, and Center pays the gas."

- [ ] **Step 2: Counter deploy-on-first-charge**

In `Counter`, when a charge answers 409 with `code === 'pending'`: show "Setting up this terminal on Base…" and poll `POST /api/operator/terminals/:id/deploy` every 3 s; on `deployed` retry the charge once with the same amount and a fresh Idempotency-Key; on `failed` show the error and a "Try again" button. While the terminal view says `pending`, the header shows "Deploys on first charge".

- [ ] **Step 3: Tap page**

In `Tap`, when the terminal is `pending` and there is no invoice, show the label and "This terminal is being set up. Ask the merchant to charge you."

- [ ] **Step 4: Browser test**

`test/browser/server.mjs`: start a tiny fake Center on `http://127.0.0.1:18788` (Hono or `node:http`) answering the six routes from Task 3's fake with an in-memory intent that becomes `confirmed` on the second `GET`; set `BEEP_INTENT_SIGNER_KEY` to a throwaway key, `JBCENTER_URL=http://127.0.0.1:18788`, and give the fake `Protocol` a `resolve` that returns the demo project (the browser server already constructs `Protocol` from `BASE_RPC_URL`; add a `BEEP_TEST_PROTOCOL=fake` switch in `server.ts` only if the browser server cannot inject one, and keep it test-only). Spec: open `/`, fill name and owner, create, land on the counter with "Deploys on first charge", charge 5.00, see "Setting up", then the invoice appears.

- [ ] **Step 5: Run, commit**

Run: `npm run build && node --test test/*.test.mjs && npm run test:browser`

```bash
git add src/client/main.tsx test/browser/server.mjs test/browser/create-terminal.spec.ts
git commit -m "Start a terminal from a name and set it up on the first charge

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Ship

- [ ] **Step 1:** `npm test` (build + node tests) and `npm run test:browser` green; open a PR on `mejango/beep` against `main` (body ends with the attribution line); merge.
- [ ] **Step 2:** Railway (Beep service): set `BEEP_INTENT_SIGNER_KEY` to a freshly generated key (`cast wallet new`, never printed) and `JBCENTER_URL=https://juicebox.center`; confirm the deploy is healthy and `/api/config` reports `createByName: true`.
- [ ] **Step 3:** Live check on beep.biz: create a terminal by name with a real owner address, charge it 0.01 USDC from the counter, watch "Setting up" complete, confirm the invoice opens and Center recorded the deployment (`GET https://juicebox.center/v1/intents/<id>` shows `deployed`), and pay it once from an EOA.

## Self-review notes

- Spec coverage: publishing (T1, T3, T4), pending terminals everywhere (T2, T4, T5), deploy on first charge (T3, T4, T5), Center prerequisites (separate PR, Global Constraints), tests (each task), live check (T6).
- Plan defect risk: exact SDK option names for `buildRulesetMetadata` and the accounting-context type are verified in T1 step 4, not assumed.
