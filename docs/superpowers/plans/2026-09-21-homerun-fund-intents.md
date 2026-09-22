# Homerun FUND by Intent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A merchant with an external wallet creates a Homerun FUND on the sponsored rollups without sending a transaction: the wallet signs one message, the project appears in their projects and in search immediately, it has a page, and it deploys the first time anyone presses Deploy.

**Architecture:** `buildFundLaunch` already produces one `HomerunDeployer.launchFundFor` request per chain. A new pure module turns those requests into a JB Center intent envelope (calls without value) and publishes it with the SDK's guarded `publishSignedIntent`. The launch session records `transport: 'intent'` and the intent id instead of per-chain transaction statuses. A new `/intent/[id]` page renders the FUND from the signed calldata plus the pinned metadata, and one Deploy action runs the SDK's `ensureDeployed` against JB Center's sponsor. Lists merge Bendystraw rows with Center search rows. No contract, no new environment variable, no change to the existing write chokepoint.

**Tech Stack:** Next.js 16.3.3 (App Router, webpack), React 19.2, wagmi 3.7 / `@wagmi/core` 3.6, viem 2.55, Tailwind v4, `@bananapus/nana-sdk-core` 2.8.0 (`/jbcenter`, `/v6`), vitest 4 (jsdom) for units, Playwright + Chrome for browser flows, Node 22 via nvm.

**Spec:** `/Users/jango/Documents/jb/v6/evm/docs/superpowers/specs/2026-09-21-intents-docs-shared-homerun-design.md`, section **3. Homerun: FUND by intent** (this plan implements that section only). Sections 1 (Center docs, `owner`/`publisher` search filters, MCP) and 2 (SDK 2.8.0 helpers) ship before this plan runs and are prerequisites.

## Global Constraints

- Repository: `https://github.com/mejango/homerun.git`, checkout at `/Users/jango/Documents/jb/v6/evm/extensions/homerun`. All work happens in a new git worktree branched from `origin/main` (Task 1). The branch name is `feat/fund-intents-center` — the name `feat/fund-intents` already exists locally in the main checkout and must not be reused.
- Node 22 via nvm (`source ~/.nvm/nvm.sh && nvm use 22`) for every npm and node command in this plan. `package.json` declares `engines.node >= 24.1.0`; npm does not enforce engines without `engine-strict`, and the engines field is not edited by this work.
- The SDK dependency bump to `@bananapus/nana-sdk-core@^2.8.0` is the first task; nothing else may start before it is green.
- Sponsored chain ids, exactly: `10, 8453, 42161, 11155111, 11155420, 84532, 421614`. Mainnet (`1`) is never sponsored.
- Envelope: `format: "homerun.money/fund.v1"`, `deploymentVersion: "6"`, `chainIds`, `deploymentCalls` built from `buildFundLaunch(input).requests` through `createJBCenterDeploymentCall` (the creation-fee `value` is dropped), `jb: { app: "homerun", kind: "fund", name, owner, chainIds, tokenName, ticker, salt, mustStartAtOrAfter, projectUri }`. Center's format grammar permits exactly one slash, so the string is `homerun.money/fund.v1` — never `homerun.money/fund/v1`.
- Eligibility for the no-transaction path is a hard requirement, not a preference: Center verifies a publisher's signature with viem's `verifyMessage`, which recovers an EOA and supports neither ERC-1271 nor ERC-6492, so a contract wallet's signature is refused with a 400 and the project is never published. The connected wallet must therefore be an external EOA (not the `juicebox-center` passkey connector, not a Safe connection per `isSafeConnection`), the setup must create no new multisig, and every selected chain must be sponsored. When all of that holds the review step defaults to "Create without a transaction"; the direct, Relayr and Safe paths stay exactly as they are for everything else, and they remain the only paths offered when any condition fails.
- The FUND's on-chain owner may still be a Safe or any other contract; only the wallet that signs the publication message must be an EOA. `jb.owner` and the `launchFundFor` owner argument are unaffected by this rule.
- The message signature goes through `TransactionReviewDialog` first, with `kind: 'authorization'`, matching how the Relayr path reviews its ERC-2771 authorizations.
- No write chokepoint change (`useProjectAdminTx`, `useSafeTx`, `submitReviewedContractWrite` are untouched). INCOME is unchanged and still requires a deployed FUND.
- Never write the word "draft" in code, copy, comments, commit messages or the PR. No retrospective comments (no comment that narrates the change or the old behaviour). No emoji.
- Copy in Homerun's existing voice: plain sentences, no exclamation marks, no marketing adjectives, say what the software does and what it does not do.
- Tailwind classes match neighbouring components: list rows `grid min-w-0 gap-2 rounded-md border border-[#c4cdbb] bg-[#fffefa] p-4`; panels `rounded-md border border-[#c4cdbb] bg-[#eef1e7] p-5 sm:p-7`; page shells `project-page live-contract-page` + `mx-auto max-w-[1220px] px-5 py-10 sm:py-14`; buttons `create-primary`, `btn-primary`, `btn-secondary`, `quiet-button`.
- Every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Stage by explicit path, never `git add -A`.
- Gates that must stay green at the end of every task: `npm test`, `npm run test:live`, `npm run build`. Gates that must be green before the PR: those three plus `npm run lint`, `npx tsc --noEmit`, `npm run test:create`, `npm run test:a11y`, `npm run test:intent`.

---

## File map

Created:

- `src/lib/jbcenter-client.ts` — the single browser JB Center client (intents, search, deploys). Uses `jbCenterBaseUrl()`; no API key.
- `src/lib/fund-intent.ts` — pure envelope builder, publish helper, intent decoder, deploy-refusal watcher. No wallet, storage or RPC authority.
- `src/app/intent/[id]/page.tsx` — the `/intent/<uuid>` route: validates the id, renders the shell.
- `src/components/IntentProject.tsx` — the published-project page body: read, render, Deploy, redirect.
- `test/fund-intent.test.ts`, `test/fund-deploy-intent-ui.test.tsx`, `test/intent-project-ui.test.tsx`, `test/intent-browser.mjs`.

Modified:

- `package.json` — SDK dependency, `test:intent` script.
- `src/lib/fund-launch-session.ts` — `transport: 'intent'`, `intentId`, their validation and lifecycle rules.
- `src/components/LiveCreate.tsx` — eligibility, `prepareIntent()`, the published-session branch of `FundDeploy`.
- `src/components/AccountProjects.tsx` — merged owned list and merged search.
- `test/fund-launch-session.test.ts`, `test/account-projects.test.tsx` — cases for the new behaviour.

Unchanged on purpose: `src/lib/fund-contracts.ts`, `src/lib/fund-launch-verification.ts`, `src/lib/fund-launch-relayr.ts`, `src/lib/contract-write.ts`, `src/hooks/useSafeTx.ts`, `src/hooks/useProjectAdminTx.ts`, `src/components/FundProject.tsx`, everything under INCOME.

---

### Task 1: Worktree and SDK 2.8.0

**Files:**
- Modify: `package.json` (dependency `@bananapus/nana-sdk-core`), `package-lock.json`

**Interfaces:**
- Produces: the worktree every later task works in, and these `@bananapus/nana-sdk-core/jbcenter` exports available to them:
  ```ts
  publishSignedIntent(client: JBCenterClient, intent: JBCenterIntentInput<TJb>, sign: (message: string) => Promise<Hex>, options: { publisher: Address }): Promise<JBCenterIntent<TJb>>
  describeCenterRefusal(error: unknown): { code: string; message: string } | null
  decodeDeploymentCall(call: JBCenterDeploymentCall): JBCenterDecodedLaunch  // union tagged by `flavor`; 2.8.0 adds `{ flavor: 'homerun-fund'; owner: Address; projectUri: string; tokenName: string; ticker: string; mustStartAtOrAfter: number | bigint; salt: Hex; peerSuckerDeployers: readonly Address[] }`
  searchIntents(params: { query?: string; owner?: Address | string; publisher?: Address | string; limit?: number; cursor?: string }): Promise<JBCenterSearchPage>
  ensureDeployed(options: { client: JBCenterClient; intent: JBCenterIntent; selfPaid?: ...; onStep?: (step: EnsureDeployedStep) => void; pollMs?: number; timeoutMs?: number; signal?: AbortSignal }): Promise<Record<number, string>>
  EnsureDeployedError, EnsureDeployedStep, intentRow, mergeSearch, intentPath, deployedChains, isFullyDeployed,
  createJBCenterDeploymentCall, JBCENTER_SPONSORED_CHAIN_IDS, isSponsorable, JBCenterRequestError, createJBCenterClient, JBCenterClient
  ```

- [ ] **Step 1: Create the worktree**

```bash
cd /Users/jango/Documents/jb/v6/evm/extensions/homerun
git fetch origin
git worktree add /Users/jango/Documents/jb/v6/evm/extensions/homerun-fund-intents -b feat/fund-intents-center origin/main
```

- [ ] **Step 2: Install with Node 22**

```bash
source ~/.nvm/nvm.sh && nvm use 22
cd /Users/jango/Documents/jb/v6/evm/extensions/homerun-fund-intents
npm ci
```

Every later command in this plan runs from `/Users/jango/Documents/jb/v6/evm/extensions/homerun-fund-intents` with `nvm use 22` already applied in that shell.

- [ ] **Step 3: Bump the SDK**

```bash
npm install @bananapus/nana-sdk-core@^2.8.0
git diff --stat package.json package-lock.json
```

Expected: `package.json` shows `"@bananapus/nana-sdk-core": "^2.8.0"` and only that dependency changed. If npm wants to move `viem` or `wagmi`, stop and report instead of accepting it.

- [ ] **Step 4: Prove the helpers this plan needs are actually exported**

```bash
node -e "import('@bananapus/nana-sdk-core/jbcenter').then(module => {
  const required = ['publishSignedIntent','describeCenterRefusal','decodeDeploymentCall','searchIntents' in module ? 'decodeDeploymentCall' : 'decodeDeploymentCall','ensureDeployed','EnsureDeployedError','intentRow','mergeSearch','intentPath','deployedChains','isFullyDeployed','createJBCenterDeploymentCall','createJBCenterClient','JBCENTER_SPONSORED_CHAIN_IDS','isSponsorable','JBCenterRequestError'];
  const missing = required.filter(name => module[name] === undefined);
  if (missing.length) { console.error('missing exports:', missing.join(', ')); process.exit(1); }
  console.log('jbcenter exports ok');
})"
```

Expected: `jbcenter exports ok`. A missing export means section 2 has not shipped; stop and report.

- [ ] **Step 5: Run the gates**

```bash
npx tsc --noEmit && npm test && npm run test:live && npm run build
```

Expected: all four pass. A type error coming from the SDK bump is fixed here, in this task, before anything new is written.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
Take the JB Center intent helpers from the SDK

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The FUND intent envelope

**Files:**
- Create: `src/lib/jbcenter-client.ts`
- Create: `src/lib/fund-intent.ts`
- Test: `test/fund-intent.test.ts`

**Interfaces:**
- Consumes: `buildFundLaunch(input: FundLaunchInput): { requests: FundTransaction[]; review: {...} }` and `type FundTransaction = { chainId: number; address: Address; abi: Abi; functionName: string; args: readonly unknown[]; value?: bigint }` from `src/lib/fund-contracts.ts`; the Task 1 SDK exports.
- Produces:
  ```ts
  export const jbCenterClient: JBCenterClient                                  // src/lib/jbcenter-client.ts
  export const FUND_INTENT_FORMAT = 'homerun.money/fund.v1'
  export const UNSPONSORED_CHAINS_MESSAGE: string
  export const MULTISIG_NEEDS_TRANSACTION_MESSAGE: string
  export type FundIntentJb = { app: 'homerun'; kind: 'fund'; name: string; owner: Address; chainIds: number[]; tokenName: string; ticker: string; salt: Hex; mustStartAtOrAfter: number; projectUri: string }
  export type FundIntent = { format: typeof FUND_INTENT_FORMAT; deploymentVersion: '6'; chainIds: number[]; deploymentCalls: JBCenterDeploymentCall[]; jb: FundIntentJb }
  export function fundIntentEligibleChains(chainIds: readonly number[]): boolean
  export function buildFundIntent(input: FundLaunchInput, name: string): FundIntent
  export function publishFundIntent(options: { client: JBCenterClient; input: FundLaunchInput; name: string; publisher: Address; sign: (message: string) => Promise<Hex> }): Promise<JBCenterIntent>
  export type DecodedFundIntent = { owner: Address; projectUri: string; tokenName: string; ticker: string; mustStartAtOrAfter: number; chainIds: number[] }
  export function decodeFundIntent(intent: JBCenterIntent): DecodedFundIntent
  export function watchDeployRefusal(client: JBCenterClient): { client: JBCenterClient; refusal: () => unknown }
  ```

- [ ] **Step 1: Write the failing test**

Create `test/fund-intent.test.ts`:

```tsx
import assert from 'node:assert/strict'
import { expect, test, vi } from 'vitest'
vi.mock('@bananapus/nana-sdk-core', async importOriginal => (await import('./fixtures/homerun-deployer')).withHomerunDeployer(await importOriginal()))

import { encodeFunctionData, zeroHash, type Hex } from 'viem'
import { JBCenterRequestError, type JBCenterClient, type JBCenterIntent } from '@bananapus/nana-sdk-core/jbcenter'
import { HOMERUN_DEPLOYER } from './fixtures/homerun-deployer'
import { homerunDeployerAbi } from '../src/lib/income-contracts'
import type { FundLaunchInput } from '../src/lib/fund-contracts'
import {
  FUND_INTENT_FORMAT, buildFundIntent, decodeFundIntent, fundIntentEligibleChains,
  publishFundIntent, watchDeployRefusal,
} from '../src/lib/fund-intent'

const owner = '0x1111111111111111111111111111111111111111' as const
const salt = `0x${'12'.repeat(32)}` as Hex
const projectUri = 'ipfs://bafkreihomerunmetadata'
const input: FundLaunchInput = {
  owner, sender: owner, chainIds: [8453], projectUri, tokenName: 'House FUND', ticker: 'HOUSE',
  salt, mustStartAtOrAfter: 0, creationFees: { 8453: 1_234n, 10: 2_345n },
}
const launchData = (args: readonly unknown[]) =>
  encodeFunctionData({ abi: homerunDeployerAbi, functionName: 'launchFundFor', args })

test('the envelope carries the exact launch calldata, no creation fee, and the jb form clients read', () => {
  const intent = buildFundIntent(input, '  Neighborhood Workshop  ')
  assert.equal(intent.format, FUND_INTENT_FORMAT)
  assert.equal(intent.format, 'homerun.money/fund.v1')
  assert.equal(intent.deploymentVersion, '6')
  assert.deepEqual(intent.chainIds, [8453])
  assert.deepEqual(intent.deploymentCalls, [{
    chainId: 8453, to: HOMERUN_DEPLOYER,
    data: launchData([owner, projectUri, 'House FUND', 'HOUSE', 0, zeroHash, []]),
  }])
  assert.equal(Object.hasOwn(intent.deploymentCalls[0], 'value'), false)
  assert.deepEqual(intent.jb, {
    app: 'homerun', kind: 'fund', name: 'Neighborhood Workshop', owner, chainIds: [8453],
    tokenName: 'House FUND', ticker: 'HOUSE', salt, mustStartAtOrAfter: 0, projectUri,
  })
})

test('the same inputs always produce byte-identical envelopes', () => {
  assert.equal(
    JSON.stringify(buildFundIntent(input, 'Neighborhood Workshop')),
    JSON.stringify(buildFundIntent(input, 'Neighborhood Workshop')),
  )
})

test('linked chains keep one salt, one start and each chain its own peer deployers', () => {
  const linked: FundLaunchInput = { ...input, chainIds: [10, 8453], mustStartAtOrAfter: 1_800_000_000 }
  const intent = buildFundIntent(linked, 'Neighborhood Workshop')
  assert.deepEqual(intent.chainIds, [10, 8453])
  assert.deepEqual(intent.jb.chainIds, [10, 8453])
  assert.equal(intent.jb.mustStartAtOrAfter, 1_800_000_000)
  assert.equal(intent.deploymentCalls.length, 2)
  assert.notEqual(intent.deploymentCalls[0].data, intent.deploymentCalls[1].data)
  for (const call of intent.deploymentCalls) assert.equal(call.to, HOMERUN_DEPLOYER)
})

test('mainnet and new multisigs cannot be created without a transaction', () => {
  assert.equal(fundIntentEligibleChains([8453]), true)
  assert.equal(fundIntentEligibleChains([1, 8453]), false)
  assert.equal(fundIntentEligibleChains([]), false)
  assert.equal(fundIntentEligibleChains([8453, 8453]), false)
  assert.throws(() => buildFundIntent({ ...input, chainIds: [1], creationFees: { 1: 0n } }, 'Neighborhood Workshop'), /Optimism, Base, Arbitrum/)
  assert.throws(() => buildFundIntent({
    ...input,
    multisigs: [{ role: 'owner', address: owner, owners: [owner], threshold: 1, saltNonce: salt, proxyCreationCode: '0x60' }],
  } as FundLaunchInput, 'Neighborhood Workshop'), /multisig/)
  assert.throws(() => buildFundIntent(input, '   '), /project name/)
})

test('publishing signs Center’s prepared message and sends the envelope with the publisher', async () => {
  const contentHash = `0x${'ab'.repeat(32)}` as Hex
  const message = `Publish this Juicebox project intent\n\n${contentHash}`
  const signature = `0x${'cd'.repeat(65)}` as Hex
  const prepareIntent = vi.fn(async (envelope: unknown) => ({ contentHash, message, envelope }))
  const publishIntent = vi.fn(async (body: Record<string, unknown>) => ({
    id: '3f0f2f4c-0f3f-4f2f-8f1f-0f2f3f4f5f6f', status: 'undeployed', contentHash,
    envelope: (body as { format: string }), publisher: owner, signature,
    createdAt: new Date(0).toISOString(), deployments: [], deploys: [],
    name: 'Neighborhood Workshop', description: null, tagline: null, tags: [], logoUri: null, owner,
  }))
  const client = { prepareIntent, publishIntent } as unknown as JBCenterClient
  const sign = vi.fn(async () => signature)

  const published = await publishFundIntent({ client, input, name: 'Neighborhood Workshop', publisher: owner, sign })

  expect(sign).toHaveBeenCalledWith(message)
  assert.deepEqual(publishIntent.mock.calls[0][0], {
    ...buildFundIntent(input, 'Neighborhood Workshop'), publisher: owner, signature,
  })
  assert.equal(published.id, '3f0f2f4c-0f3f-4f2f-8f1f-0f2f3f4f5f6f')
})

test('only the wallet that prepared the launch may publish it', async () => {
  const client = {} as JBCenterClient
  await assert.rejects(
    publishFundIntent({ client, input, name: 'Neighborhood Workshop', publisher: '0x2222222222222222222222222222222222222222', sign: async () => '0x' }),
    /wallet that prepared/,
  )
})

test('the FUND terms are read back out of the signed calls', () => {
  const envelope = buildFundIntent({ ...input, chainIds: [10, 8453], mustStartAtOrAfter: 1_800_000_000 }, 'Neighborhood Workshop')
  const decoded = decodeFundIntent({ envelope } as unknown as JBCenterIntent)
  assert.deepEqual(decoded, {
    owner, projectUri, tokenName: 'House FUND', ticker: 'HOUSE',
    mustStartAtOrAfter: 1_800_000_000, chainIds: [10, 8453],
  })
})

test('a call Homerun did not build is refused rather than displayed', () => {
  const envelope = buildFundIntent(input, 'Neighborhood Workshop')
  const foreign = { ...envelope, deploymentCalls: [{ ...envelope.deploymentCalls[0], data: '0xdeadbeef' as Hex }] }
  assert.throws(() => decodeFundIntent({ envelope: foreign } as unknown as JBCenterIntent), /not created by Homerun/)
})

test('a sponsorship refusal stays readable after ensureDeployed replaces it', async () => {
  const refusal = new JBCenterRequestError('quota reached', 429, 'sponsor_quota')
  const base = { requestDeploy: vi.fn(async () => { throw refusal }) } as unknown as JBCenterClient
  const watcher = watchDeployRefusal(base)
  await assert.rejects(watcher.client.requestDeploy('3f0f2f4c-0f3f-4f2f-8f1f-0f2f3f4f5f6f'))
  assert.equal(watcher.refusal(), refusal)
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run test/fund-intent.test.ts`
Expected: FAIL — `Failed to resolve import "../src/lib/fund-intent"`.

- [ ] **Step 3: Write the Center client module**

Create `src/lib/jbcenter-client.ts`:

```ts
import { createJBCenterClient, type JBCenterClient } from '@bananapus/nana-sdk-core/jbcenter'
import { jbCenterBaseUrl } from '@/lib/jbcenter-config'

/**
 * The browser's Juicebox Center client for intents, search and sponsored deploys.
 *
 * Approved web clients call Center directly and let the browser send its
 * `Origin`. Never add a Center API key here: a NEXT_PUBLIC key is public, and
 * server keys are for non-browser integrations only.
 */
export const jbCenterClient: JBCenterClient = createJBCenterClient({ baseUrl: jbCenterBaseUrl() })
```

- [ ] **Step 4: Write the intent module**

Create `src/lib/fund-intent.ts`:

```ts
/**
 * Homerun's FUND project intent: the launch calls `buildFundLaunch` produces,
 * frozen into the envelope Juicebox Center signs, stores and later sends itself.
 * This module has no wallet, browser storage, RPC or lifecycle-state authority.
 */
import {
  JBCENTER_SPONSORED_CHAIN_IDS,
  createJBCenterDeploymentCall,
  decodeDeploymentCall,
  publishSignedIntent,
  type JBCenterClient,
  type JBCenterDeploymentCall,
  type JBCenterIntent,
  type JBCenterRequestOptions,
} from '@bananapus/nana-sdk-core/jbcenter'
import { getAddress, isAddressEqual, type Address, type Hex } from 'viem'
import { buildFundLaunch, type FundLaunchInput, type FundTransaction } from './fund-contracts'

export const FUND_INTENT_FORMAT = 'homerun.money/fund.v1'

export const UNSPONSORED_CHAINS_MESSAGE =
  'Juicebox Center creates projects without a transaction on Optimism, Base, Arbitrum and their test networks. Remove the other networks, or create with a transaction.'
export const MULTISIG_NEEDS_TRANSACTION_MESSAGE =
  'A new multisig is created by a transaction. Use existing Owner and Operator addresses to create without one.'

export type FundIntentJb = {
  app: 'homerun'
  kind: 'fund'
  name: string
  owner: Address
  chainIds: number[]
  tokenName: string
  ticker: string
  salt: Hex
  mustStartAtOrAfter: number
  projectUri: string
}

export type FundIntent = {
  format: typeof FUND_INTENT_FORMAT
  deploymentVersion: '6'
  chainIds: number[]
  deploymentCalls: JBCenterDeploymentCall[]
  jb: FundIntentJb
}

export function fundIntentEligibleChains(chainIds: readonly number[]): boolean {
  return chainIds.length > 0 && new Set(chainIds).size === chainIds.length
    && chainIds.every(chainId => JBCENTER_SPONSORED_CHAIN_IDS.includes(chainId))
}

/** The reviewed launch call without its creation fee: Center's sender pays that. */
function deploymentCall(request: FundTransaction): JBCenterDeploymentCall {
  const { chainId, address, abi, functionName, args } = request
  return createJBCenterDeploymentCall({ chainId, address, abi, functionName, args })
}

export function buildFundIntent(input: FundLaunchInput, name: string): FundIntent {
  if (input.multisigs?.length) throw new Error(MULTISIG_NEEDS_TRANSACTION_MESSAGE)
  const { requests, review } = buildFundLaunch(input)
  const chainIds = requests.map(request => request.chainId)
  if (!fundIntentEligibleChains(chainIds)) throw new Error(UNSPONSORED_CHAINS_MESSAGE)
  const projectName = name.trim()
  if (!projectName || projectName.length > 160) throw new Error('A project name of 160 characters or fewer is required.')
  return {
    format: FUND_INTENT_FORMAT,
    deploymentVersion: '6',
    chainIds,
    deploymentCalls: requests.map(deploymentCall),
    jb: {
      app: 'homerun',
      kind: 'fund',
      name: projectName,
      owner: review.owner,
      chainIds,
      tokenName: review.tokenName,
      ticker: review.ticker,
      salt: input.salt,
      mustStartAtOrAfter: input.mustStartAtOrAfter,
      projectUri: review.projectUri,
    },
  }
}

export type PublishFundIntentInput = {
  client: JBCenterClient
  input: FundLaunchInput
  name: string
  publisher: Address
  sign: (message: string) => Promise<Hex>
}

/** Signs only the envelope Center prepared, and only when it equals this one. */
export async function publishFundIntent({ client, input, name, publisher, sign }: PublishFundIntentInput): Promise<JBCenterIntent> {
  if (!isAddressEqual(getAddress(publisher), getAddress(input.sender))) {
    throw new Error('Publish with the wallet that prepared this project.')
  }
  const intent = buildFundIntent(input, name)
  return publishSignedIntent(client, intent, sign, { publisher })
}

export type DecodedFundIntent = {
  owner: Address
  projectUri: string
  tokenName: string
  ticker: string
  mustStartAtOrAfter: number
  chainIds: number[]
}

/** The signed calls are the project. The `jb` form is a display hint, never the source. */
export function decodeFundIntent(intent: JBCenterIntent): DecodedFundIntent {
  const calls = intent.envelope.deploymentCalls
  if (!calls.length) throw new Error('This project has no deployment calls.')
  const launches = calls.map(call => {
    const launch = decodeDeploymentCall(call)
    if (launch.flavor !== 'homerun-fund') throw new Error('This project was not created by Homerun.')
    return launch
  })
  const [first] = launches
  const start = Number(first.mustStartAtOrAfter)
  if (launches.some(launch => !isAddressEqual(launch.owner, first.owner)
    || launch.projectUri !== first.projectUri
    || launch.tokenName !== first.tokenName
    || launch.ticker !== first.ticker
    || Number(launch.mustStartAtOrAfter) !== start)) {
    throw new Error('This project’s chains do not share the same FUND terms.')
  }
  return {
    owner: getAddress(first.owner),
    projectUri: first.projectUri,
    tokenName: first.tokenName,
    ticker: first.ticker,
    mustStartAtOrAfter: start,
    chainIds: calls.map(call => call.chainId),
  }
}

/**
 * `ensureDeployed` turns a sponsorship refusal into its own error, so keep the
 * refusal Center returned for `describeCenterRefusal` to word.
 */
export function watchDeployRefusal(client: JBCenterClient): { client: JBCenterClient; refusal: () => unknown } {
  let refusal: unknown
  const watched = Object.assign(Object.create(client) as JBCenterClient, {
    requestDeploy(intentId: string, options?: JBCenterRequestOptions) {
      return client.requestDeploy(intentId, options).catch((error: unknown) => {
        refusal = error
        throw error
      })
    },
  })
  return { client: watched, refusal: () => refusal }
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run test/fund-intent.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Run the gates**

```bash
npx tsc --noEmit && npm run lint && npm run test:live && npm run build
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/fund-intent.ts src/lib/jbcenter-client.ts test/fund-intent.test.ts
git commit -m "$(cat <<'EOF'
Build the FUND project intent from the launch requests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The launch session remembers a published project

**Files:**
- Modify: `src/lib/fund-launch-session.ts`
- Test: `test/fund-launch-session.test.ts`

**Interfaces:**
- Consumes: nothing from Task 2.
- Produces:
  ```ts
  export type FundLaunchSession = {
    version: 1
    transport?: 'direct' | 'relayr' | 'intent'
    /** Center's intent id, set once, only with transport 'intent'. */
    intentId?: string
    relayr?: LaunchRelayrJournal
    paymentChainId?: number
    name: string
    input: FundLaunchInput
    statuses: Record<number, LaunchStatus>
  }
  ```
  Rules other tasks rely on: an `'intent'` session must have every status `'ready'`, no `relayr` journal, and a UUID `intentId`; `canCancelLaunch` is false once `intentId` is set; `discardUnsignedLaunch` returns false once `intentId` is set; `archiveLaunch` accepts a published intent session without any confirmed chain.

- [ ] **Step 1: Write the failing tests**

Append to `test/fund-launch-session.test.ts`, inside the existing `describe('durable FUND deployment journal', ...)` block:

```tsx
  const intentId = '3f0f2f4c-0f3f-4f2f-8f1f-0f2f3f4f5f6f'
  function publishedSession(): FundLaunchSession {
    return { ...session(), transport: 'intent', intentId }
  }

  it('stores a published project as an intent transport with no wallet progress', () => {
    const saved = saveLaunch(publishedSession())
    expect(saved.transport).toBe('intent')
    expect(saved.intentId).toBe(intentId)
    expect(decodeLaunchSession(encodeLaunchSession(saved))).toEqual(publishedSession())
  })

  it('rejects an intent record that claims a transaction, a relay, or an invalid id', () => {
    const withStatus = JSON.parse(encodeLaunchSession(publishedSession()))
    withStatus.statuses[8453] = { phase: 'pending', hash }
    expect(() => decodeLaunchSession(JSON.stringify(withStatus))).toThrow()
    const withRelayr = JSON.parse(encodeLaunchSession(publishedSession()))
    withRelayr.relayr = { phase: 'signing', signed: [], records: [] }
    expect(() => decodeLaunchSession(JSON.stringify(withRelayr))).toThrow()
    const badId = JSON.parse(encodeLaunchSession(publishedSession()))
    badId.intentId = 'not-a-uuid'
    expect(() => decodeLaunchSession(JSON.stringify(badId))).toThrow()
    const strayId = JSON.parse(encodeLaunchSession(session()))
    strayId.intentId = intentId
    expect(() => decodeLaunchSession(JSON.stringify(strayId))).toThrow()
  })

  it('never replaces or cancels a published project, and never follows edited networks', () => {
    const saved = saveLaunch(publishedSession())
    expect(() => saveLaunch({ ...saved, intentId: '0f0f2f4c-0f3f-4f2f-8f1f-0f2f3f4f5f6f' })).toThrow(/cannot be replaced/)
    expect(canCancelLaunch(saved)).toBe(false)
    expect(discardUnsignedLaunch(saved.input.salt)).toBe(false)
    expect(localStorage.getItem(FUND_LAUNCH_KEY)).not.toBeNull()
  })

  it('archives a published project so another can be prepared', () => {
    const saved = saveLaunch(publishedSession())
    archiveLaunch(saved.input.salt)
    expect(localStorage.getItem(FUND_LAUNCH_KEY)).toBeNull()
    expect(JSON.parse(localStorage.getItem(`${FUND_LAUNCH_KEY}:history`)!)).toHaveLength(1)
  })
```

Extend the file's import line to bring in the two helpers it does not import yet:

```ts
import { FUND_LAUNCH_KEY, archiveLaunch, canCancelLaunch, decodeLaunchSession, discardUnsignedLaunch, encodeLaunchSession, refreshLaunchCreationFee, saveLaunch, sameSender, updateLaunchStatus, type FundLaunchSession } from '../src/lib/fund-launch-session'
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run test/fund-launch-session.test.ts`
Expected: FAIL — the first new test throws `Invalid launch transport.`

- [ ] **Step 3: Widen the session type**

In `src/lib/fund-launch-session.ts`, replace:

```ts
export type FundLaunchSession = {
  version: 1
  transport?: 'direct' | 'relayr'
  relayr?: LaunchRelayrJournal
```

with:

```ts
const INTENT_ID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

export type FundLaunchSession = {
  version: 1
  transport?: 'direct' | 'relayr' | 'intent'
  /** Juicebox Center's identifier for the published project. */
  intentId?: string
  relayr?: LaunchRelayrJournal
```

- [ ] **Step 4: Validate the new fields**

In `decodeLaunchSession`, replace:

```ts
  if (value.transport !== undefined && !['direct', 'relayr'].includes(value.transport)) throw new Error('Invalid launch transport.')
  if (value.relayr && value.transport !== 'relayr') throw new Error('Relayed authorizations cannot use direct deployment.')
  return value
```

with:

```ts
  if (value.transport !== undefined && !['direct', 'relayr', 'intent'].includes(value.transport)) throw new Error('Invalid launch transport.')
  if (value.relayr && value.transport !== 'relayr') throw new Error('Relayed authorizations cannot use direct deployment.')
  if (value.intentId !== undefined && (value.transport !== 'intent' || typeof value.intentId !== 'string' || !INTENT_ID.test(value.intentId))) throw new Error('Invalid published project reference.')
  if (value.transport === 'intent' && (value.relayr || !Object.values(value.statuses).every(status => status.phase === 'ready'))) throw new Error('A published project has no wallet transactions to resume.')
  return value
```

- [ ] **Step 5: Freeze the published id and the lifecycle rules**

In `saveLaunch`, inside the `if (existing) {` block, after the transport check line that throws `'A submitted launch cannot change transport.'`, add:

```ts
    if (previous.intentId && previous.intentId !== validated.intentId) throw new Error('A published project cannot be replaced.')
```

In `discardUnsignedLaunch`, after `const session = requireLaunch(salt)`, add:

```ts
  if (session.intentId) return false
```

In `canCancelLaunch`, make the first line of the body:

```ts
  if (session.transport === 'intent') return !session.intentId
```

In `archiveLaunch`, replace:

```ts
  if (!session.input.chainIds.every(id => session.statuses[id].phase === 'confirmed')) throw new Error('Confirm every linked deployment before archiving this launch.')
```

with:

```ts
  if (session.transport === 'intent') {
    if (!session.intentId) throw new Error('Publish this project before archiving its launch.')
  } else if (!session.input.chainIds.every(id => session.statuses[id].phase === 'confirmed')) {
    throw new Error('Confirm every linked deployment before archiving this launch.')
  }
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npx vitest run test/fund-launch-session.test.ts`
Expected: PASS, including the four new cases and every pre-existing case.

- [ ] **Step 7: Run the gates**

```bash
npx tsc --noEmit && npm run lint && npm run test:live && npm run build
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/fund-launch-session.ts test/fund-launch-session.test.ts
git commit -m "$(cat <<'EOF'
Record a published project in the launch session

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Create without a transaction

**Files:**
- Modify: `src/components/LiveCreate.tsx`
- Test: `test/fund-deploy-intent-ui.test.tsx`

**Interfaces:**
- Consumes: `buildFundIntent`, `publishFundIntent`, `fundIntentEligibleChains`, `UNSPONSORED_CHAINS_MESSAGE`, `MULTISIG_NEEDS_TRANSACTION_MESSAGE` from `src/lib/fund-intent.ts`; `jbCenterClient` from `src/lib/jbcenter-client.ts`; `transport: 'intent'` and `intentId` from `src/lib/fund-launch-session.ts`; `intentPath`, `describeCenterRefusal` from the SDK; `requireTransactionReview` from `src/lib/transaction-review.ts`; `signMessage` from `@wagmi/core`.
- Produces: `FundDeploy` shows "Create without a transaction" as the primary action when eligible, publishes the intent, saves the session and navigates to `intentPath(id)`. `/create/recover` (which renders `FundDeploy` with no `values`) shows the published branch with that link. No other component's interface changes.

- [ ] **Step 1: Write the failing test**

Create `test/fund-deploy-intent-ui.test.tsx`:

```tsx
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@bananapus/nana-sdk-core', async importOriginal => (await import('./fixtures/homerun-deployer')).withHomerunDeployer(await importOriginal()))

import type { Hex } from 'viem'
import { CREATE_DEFAULTS } from '../web/create-model.mjs'
import type { CreateValues } from '../src/components/CreateFlow'
import { FUND_LAUNCH_KEY, decodeLaunchSession } from '../src/lib/fund-launch-session'

const wallet = '0x1111111111111111111111111111111111111111'
const intentId = '3f0f2f4c-0f3f-4f2f-8f1f-0f2f3f4f5f6f'
const contentHash = `0x${'ab'.repeat(32)}` as Hex
const signature = `0x${'cd'.repeat(65)}` as Hex

const runtime = vi.hoisted(() => ({
  centerWallet: false, safe: false,
  readContract: vi.fn(), getBlock: vi.fn(), publish: vi.fn(), checkDeployment: vi.fn(),
  signMessage: vi.fn(), review: vi.fn(), prepareIntent: vi.fn(), publishIntent: vi.fn(),
}))
const navigate = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => navigate }))
vi.mock('@wagmi/core', () => ({
  getAccount: () => ({ address: '0x1111111111111111111111111111111111111111' }),
  getPublicClient: () => ({ readContract: runtime.readContract, getBlock: runtime.getBlock }),
  signMessage: runtime.signMessage,
}))
vi.mock('@/providers/Providers', () => ({ wagmiConfig: {} }))
vi.mock('@/hooks/useWallet', () => ({ useWallet: () => ({ address: wallet, isCenterWallet: runtime.centerWallet }) }))
vi.mock('@/components/WalletButton', () => ({ WalletButton: () => <span>Wallet</span> }))
vi.mock('@/components/CreateFlow', () => ({ default: () => null }))
vi.mock('@/lib/safe-connector', () => ({ isSafeConnection: () => runtime.safe, waitForSafeExecutionHash: vi.fn() }))
vi.mock('@/hooks/useSafeTx', () => ({ useSafeTx: () => ({ phase: 'idle', busy: false, error: '', send: vi.fn(), reset: vi.fn() }) }))
vi.mock('@/lib/publish-fund-project-metadata', () => ({ publishFundProjectMetadata: runtime.publish }))
vi.mock('@/lib/fund-launch-verification', async importOriginal => ({
  ...await importOriginal<typeof import('../src/lib/fund-launch-verification')>(),
  checkLaunchDeployment: runtime.checkDeployment,
}))
vi.mock('@/lib/transaction-review', () => ({ requireTransactionReview: runtime.review }))
vi.mock('@/lib/jbcenter-client', () => ({
  jbCenterClient: { prepareIntent: runtime.prepareIntent, publishIntent: runtime.publishIntent },
}))

import { FundDeploy } from '../src/components/LiveCreate'

function values(overrides: Partial<CreateValues> = {}): CreateValues {
  return {
    ...CREATE_DEFAULTS,
    name: 'Neighborhood Workshop',
    fundTokenName: 'Neighborhood Workshop FUND',
    fundTicker: 'FUND',
    ownerMode: 'existing', ownerWallet: wallet, ownerIsOperator: true,
    operatorMode: 'existing', operatorWallet: wallet,
    networks: ['base'], networkEnvironment: 'production',
    ...overrides,
  } as CreateValues
}

describe('creating a FUND without a transaction', () => {
  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    localStorage.clear()
    runtime.centerWallet = false
    runtime.safe = false
    runtime.readContract.mockReset().mockResolvedValue(0n)
    runtime.getBlock.mockReset().mockResolvedValue({ timestamp: 1_800_000_000n })
    runtime.publish.mockReset().mockResolvedValue({ cid: 'bafkreimetadata' })
    runtime.checkDeployment.mockReset().mockResolvedValue(undefined)
    runtime.review.mockReset().mockResolvedValue(undefined)
    runtime.signMessage.mockReset().mockResolvedValue(signature)
    runtime.prepareIntent.mockReset().mockImplementation(async (envelope: unknown) => ({
      contentHash, message: `Publish this Juicebox project intent\n\n${contentHash}`, envelope,
    }))
    runtime.publishIntent.mockReset().mockImplementation(async (body: Record<string, unknown>) => ({
      id: intentId, status: 'undeployed', contentHash, envelope: body, publisher: wallet, signature,
      createdAt: new Date(0).toISOString(), deployments: [], deploys: [],
      name: 'Neighborhood Workshop', description: null, tagline: null, tags: [], logoUri: null, owner: wallet,
    }))
    navigate.push.mockReset()
    host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  })
  afterEach(async () => { await act(async () => root.unmount()); host.remove() })

  const button = (label: string) => [...host.querySelectorAll('button')].find(item => item.textContent === label)

  async function render(props: Partial<CreateValues> = {}) {
    await act(async () => root.render(<FundDeploy values={values(props)} />))
  }

  it('offers the no-transaction path first on sponsored networks, with the transaction path kept', async () => {
    await render()
    expect(button('Create without a transaction')).toBeTruthy()
    expect(button('Create with a transaction instead')).toBeTruthy()
    expect(button('Create project')).toBeUndefined()
  })

  it('keeps the transaction path alone for mainnet, a Safe, a Center wallet, or a new multisig', async () => {
    await render({ networks: ['ethereum', 'base'] })
    expect(button('Create without a transaction')).toBeUndefined()
    expect(button('Create project')).toBeTruthy()
    runtime.safe = true
    await render()
    expect(button('Create without a transaction')).toBeUndefined()
    runtime.safe = false
    runtime.centerWallet = true
    await render()
    expect(button('Create without a transaction')).toBeUndefined()
    runtime.centerWallet = false
    await render({ ownerMode: 'create', ownerSigners: [`0x${'1'.repeat(40)}`, `0x${'2'.repeat(40)}`], ownerThreshold: 2 })
    expect(button('Create without a transaction')).toBeUndefined()
  })

  it('reviews the exact calls, signs once, saves the published project and opens its page', async () => {
    await render()
    await act(async () => button('Create without a transaction')!.click())
    const review = runtime.review.mock.calls[0][0]
    expect(review.kind).toBe('authorization')
    expect(review.calls).toHaveLength(1)
    expect(review.calls[0].chainId).toBe(8453)
    expect(review.calls[0].functionName).toBe('launchFundFor')
    expect(review.authorization.format).toBe('homerun.money/fund.v1')
    expect(review.authorization.jb.app).toBe('homerun')
    expect(runtime.signMessage).toHaveBeenCalledWith({}, { account: wallet, message: `Publish this Juicebox project intent\n\n${contentHash}` })
    const saved = decodeLaunchSession(localStorage.getItem(FUND_LAUNCH_KEY)!)
    expect(saved.transport).toBe('intent')
    expect(saved.intentId).toBe(intentId)
    expect(navigate.push).toHaveBeenCalledWith(`/intent/${intentId}`)
  })

  it('shows a published project as published, with its page and no chain transactions', async () => {
    await render()
    await act(async () => button('Create without a transaction')!.click())
    await act(async () => root.render(<FundDeploy />))
    expect(host.textContent).toContain('This project is published')
    expect(host.querySelector<HTMLAnchorElement>(`a[href="/intent/${intentId}"]`)).toBeTruthy()
    expect(button('Review and deploy FUND')).toBeUndefined()
  })

  it('words a Center refusal instead of showing raw provider text', async () => {
    const { JBCenterRequestError } = await import('@bananapus/nana-sdk-core/jbcenter')
    runtime.prepareIntent.mockRejectedValue(new JBCenterRequestError('upstream 503 from provider', 503, 'unavailable'))
    await render()
    await act(async () => button('Create without a transaction')!.click())
    const alert = [...host.querySelectorAll('[role="alert"]')].find(node => !node.closest('details'))
    expect(alert?.textContent).not.toContain('upstream 503 from provider')
    expect(alert?.textContent?.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run test/fund-deploy-intent-ui.test.tsx`
Expected: FAIL — `Create without a transaction` is not rendered.

- [ ] **Step 3: Import what the new path needs**

In `src/components/LiveCreate.tsx`, replace the `@wagmi/core` import line:

```ts
import { getPublicClient, getAccount } from '@wagmi/core'
```

with:

```ts
import { getPublicClient, getAccount, signMessage } from '@wagmi/core'
```

and add, after the existing `import { isSafeConnection, waitForSafeExecutionHash } from '@/lib/safe-connector'` line:

```ts
import { describeCenterRefusal, intentPath } from '@bananapus/nana-sdk-core/jbcenter'
import { jbCenterClient } from '@/lib/jbcenter-client'
import { buildFundIntent, fundIntentEligibleChains, publishFundIntent, MULTISIG_NEEDS_TRANSACTION_MESSAGE, UNSPONSORED_CHAINS_MESSAGE } from '@/lib/fund-intent'
import { requireTransactionReview } from '@/lib/transaction-review'
```

- [ ] **Step 4: Report Center's own words for a refusal**

In `src/components/LiveCreate.tsx`, directly under the existing `const message = ...` helper at the top of the file, add:

```ts
const failure = (error: unknown) => describeCenterRefusal(error)?.message ?? message(error)
```

- [ ] **Step 5: Compute eligibility in `FundDeploy`**

In `FundDeploy`, after the existing `const { address } = useWallet()` line, replace it with:

```ts
  const { address, isCenterWallet } = useWallet()
  const [safeConnected, setSafeConnected] = useState(false)
  useEffect(() => { setSafeConnected(isSafeConnection(wagmiConfig)) }, [address])
```

Then, immediately after the existing `const selectionKey = ...` declaration, add:

```ts
  // Juicebox Center recovers the publisher from the signature itself, so only an
  // external EOA can publish: a passkey or Safe signature is refused. A new
  // multisig needs a transaction, and mainnet is never sponsored.
  const multisigPlanned = !!values && (values.ownerMode === 'create' || (!values.ownerIsOperator && values.operatorMode === 'create'))
  const intentEligible = !!address && !isCenterWallet && !safeConnected && !multisigPlanned
    && fundIntentEligibleChains(selectionKey ? selectionKey.split(',').map(Number) : [])
```

- [ ] **Step 6: Publish the intent**

In `FundDeploy`, directly after the existing `async function prepare() { ... }`, add:

```ts
  async function prepareIntent() {
    if (!address || !values || preparing || busyRef.current) return
    setPreparing(true); setError(''); setProgress('')
    try {
      if (localStorage.getItem(FUND_LAUNCH_KEY)) throw new Error('A saved launch already exists. Reload to resume it.')
      const chainIds = plannedNetworks(values).map((chain: { chainId: number }) => chain.chainId)
      if (!fundIntentEligibleChains(chainIds)) throw new Error(UNSPONSORED_CHAINS_MESSAGE)
      const sender = address
      const salt = toHex(crypto.getRandomValues(new Uint8Array(32)))
      const resolved = await resolveCreateMultisigs(values, chainIds.map(publicClient), salt)
      if (resolved.plans.length) throw new Error(MULTISIG_NEEDS_TRANSACTION_MESSAGE)
      setProgress('Saving your project details…')
      const pin = await publishFundProjectMetadata(resolved.values)
      const fees = await Promise.all(chainIds.map(async (id: number) => {
        const client = publicClient(id)
        const fee = await client.readContract({ address: v6Address('JBProjects', id as JBChainId), abi: jbProjectsAbi, functionName: 'creationFee' })
        const block = await client.getBlock()
        return { id, fee, timestamp: Number(block.timestamp) }
      }))
      sameSender(getAccount(wagmiConfig).address, sender)
      const input = {
        owner: resolved.owner, sender, chainIds, projectUri: `ipfs://${pin.cid}`,
        tokenName: resolved.values.fundTokenName, ticker: resolved.values.fundTicker,
        salt, multisigs: resolved.plans, operator: resolved.operator,
        mustStartAtOrAfter: chainIds.length > 1 ? Math.max(...fees.map(row => row.timestamp)) : 0,
        creationFees: Object.fromEntries(fees.map(row => [row.id, row.fee])),
      }
      const built = buildFundLaunch(input)
      await Promise.all(built.requests.map(request => checkLaunchDeployment(publicClient(request.chainId), request)))
      const intent = buildFundIntent(input, values.name)
      setProgress('')
      await requireTransactionReview({
        kind: 'authorization',
        title: 'Create your project',
        description: 'Your signature publishes these exact project creations to Juicebox Center. Center sends them on every selected chain when the project is first deployed. You send no transaction and pay no creation fee here.',
        confirmLabel: 'Continue to wallet',
        calls: intent.deploymentCalls.map((call, index) => ({
          chainId: call.chainId, to: call.to, data: call.data, from: sender,
          abi: built.requests[index].abi, functionName: built.requests[index].functionName, args: built.requests[index].args,
          label: `Create the FUND on ${displayChainName(call.chainId)}`, contractName: 'HomerunDeployer',
        })),
        authorization: { type: 'Juicebox Center project intent', format: intent.format, deploymentVersion: intent.deploymentVersion, chainIds: intent.chainIds, jb: intent.jb },
      })
      setProgress('Sign the publication message in your wallet.')
      sameSender(getAccount(wagmiConfig).address, sender)
      const published = await publishFundIntent({
        client: jbCenterClient, input, name: values.name, publisher: sender,
        sign: publicationMessage => signMessage(wagmiConfig, { account: sender, message: publicationMessage }),
      })
      persist({ version: 1, name: values.name, input, transport: 'intent', intentId: published.id, statuses: Object.fromEntries(chainIds.map((id: number) => [id, { phase: 'ready' as const }])) })
      setProgress('')
      router.push(intentPath(published.id))
    } catch (cause) { setError(failure(cause)) }
    finally { setPreparing(false) }
  }
```

- [ ] **Step 7: Keep the transaction machinery away from a published project**

In `FundDeploy`'s `run`, make the first line of the body:

```ts
    if (next.transport === 'intent') return
```

- [ ] **Step 8: Render the choice and the published state**

In `FundDeploy`'s returned JSX, replace this line:

```tsx
    {!session ? <button type="button" className="create-primary" disabled={!address || preparing || !loaded || !!error} onClick={() => void prepare()}>{preparing ? 'Preparing your project…' : 'Create project'}</button>
```

with:

```tsx
    {!session ? intentEligible ? <>
      <button type="button" className="create-primary" disabled={preparing || !loaded || !!error} onClick={() => void prepareIntent()}>{preparing ? 'Publishing your project…' : 'Create without a transaction'}</button>
      <p className="text-sm">Juicebox Center publishes your project now and sends the creation on {session ? '' : ''}{plannedChainNames(values)} when it is first used. Your wallet signs a message; it sends no transaction and pays no creation fee.</p>
      <button type="button" className="quiet-button" disabled={preparing || !loaded || !!error} onClick={() => void prepare()}>Create with a transaction instead</button>
    </> : <button type="button" className="create-primary" disabled={!address || preparing || !loaded || !!error} onClick={() => void prepare()}>{preparing ? 'Preparing your project…' : 'Create project'}</button>
```

and, since `session` is null in that branch, simplify the sentence to exactly:

```tsx
      <p className="text-sm">Juicebox Center publishes your project now and sends the creation on {plannedChainNames(values)} when it is first used. Your wallet signs a message; it sends no transaction and pays no creation fee.</p>
```

Add this helper above `FundDeploy` (next to the `publicClient` helper at the top of the file):

```ts
function plannedChainNames(values?: CreateValues): string {
  if (!values) return 'the selected networks'
  try { return plannedNetworks(values).map((chain: { chainId: number }) => displayChainName(chain.chainId)).join(', ') }
  catch { return 'the selected networks' }
}
```

Then, for a published session, branch before the existing progress list. Replace:

```tsx
      : <>
        {signingChain !== undefined && <div className="fund-launch-action" role="status"><span>Confirm the {displayChainName(signingChain)} request in your wallet.</span></div>}
```

with:

```tsx
      : session.transport === 'intent' ? <>
        <p role="status">This project is published. Open its page to deploy it on {session.input.chainIds.map(displayChainName).join(', ')}.</p>
        <a className="create-primary" href={intentPath(session.intentId!)}>Open project ↗</a>
        <button type="button" className="quiet-button" onClick={() => { try { archiveLaunch(session.input.salt); setSession(null); setProgress('') } catch (cause) { setError(message(cause)) } }}>Finish this project and start another</button>
      </>
      : <>
        {signingChain !== undefined && <div className="fund-launch-action" role="status"><span>Confirm the {displayChainName(signingChain)} request in your wallet.</span></div>}
```

Finally, keep the recovery block free of chain rows for a published project. Replace:

```tsx
          {session.transport !== 'relayr' && requests.map(request => <LaunchChain
```

with:

```tsx
          {session.transport !== 'relayr' && session.transport !== 'intent' && requests.map(request => <LaunchChain
```

- [ ] **Step 9: Run the test and watch it pass**

Run: `npx vitest run test/fund-deploy-intent-ui.test.tsx test/fund-deploy-ui.test.tsx`
Expected: PASS for both files — the second proves the transaction paths are unchanged.

- [ ] **Step 10: Run the gates**

```bash
npx tsc --noEmit && npm run lint && npm run test:live && npm run build
```

Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add src/components/LiveCreate.tsx test/fund-deploy-intent-ui.test.tsx
git commit -m "$(cat <<'EOF'
Offer creation without a transaction on the sponsored networks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The published project page

**Files:**
- Create: `src/app/intent/[id]/page.tsx`
- Create: `src/components/IntentProject.tsx`
- Test: `test/intent-project-ui.test.tsx`

**Interfaces:**
- Consumes: `jbCenterClient`; `decodeFundIntent(intent): DecodedFundIntent`; `watchDeployRefusal(client)`; `ensureDeployed`, `EnsureDeployedError`, `describeCenterRefusal` from the SDK; `fetchFundProjectMetadata(uri): Promise<FundProjectMetadata>` and `fundIpfsUrl` from `src/lib/fund-project-metadata.ts`; `displayChainName` from `src/lib/chainDisplay.ts`.
- Produces: the route `/intent/<uuid>` and `export function IntentProject({ intentId }: { intentId: string })`. Nothing else imports `IntentProject`.

- [ ] **Step 1: Write the failing test**

Create `test/intent-project-ui.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@bananapus/nana-sdk-core', async importOriginal => (await import('./fixtures/homerun-deployer')).withHomerunDeployer(await importOriginal()))

import { encodeFunctionData, zeroHash, type Hex } from 'viem'
import { HOMERUN_DEPLOYER } from './fixtures/homerun-deployer'
import { homerunDeployerAbi } from '../src/lib/income-contracts'

const wallet = '0x1111111111111111111111111111111111111111'
const intentId = '3f0f2f4c-0f3f-4f2f-8f1f-0f2f3f4f5f6f'
const contentHash = `0x${'ab'.repeat(32)}` as Hex
const hash = `0x${'ef'.repeat(32)}` as Hex

const runtime = vi.hoisted(() => ({ getIntent: vi.fn(), requestDeploy: vi.fn() }))
const navigate = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => navigate }))
vi.mock('next/image', () => ({ default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} /> }))
vi.mock('@/components/WalletButton', () => ({ WalletButton: () => <span>Wallet</span> }))
vi.mock('@/lib/jbcenter-client', () => ({ jbCenterClient: { getIntent: runtime.getIntent, requestDeploy: runtime.requestDeploy } }))

import { IntentProject } from '../src/components/IntentProject'

const call = (chainId: number) => ({
  chainId, to: HOMERUN_DEPLOYER,
  data: encodeFunctionData({
    abi: homerunDeployerAbi, functionName: 'launchFundFor',
    args: [wallet, 'ipfs://bafkreimetadata', 'Neighborhood Workshop FUND', 'FUND', 0, zeroHash, []],
  }),
})

function intent(overrides: Record<string, unknown> = {}) {
  return {
    id: intentId, status: 'undeployed', contentHash, publisher: wallet, signature: `0x${'cd'.repeat(65)}`,
    createdAt: new Date(0).toISOString(), deployments: [], deploys: [],
    name: 'Neighborhood Workshop', description: null, tagline: null, tags: [], logoUri: null, owner: wallet,
    envelope: {
      format: 'homerun.money/fund.v1', deploymentVersion: '6', chainIds: [8453],
      deploymentCalls: [call(8453)],
      jb: { app: 'homerun', kind: 'fund', name: 'Neighborhood Workshop', owner: wallet, chainIds: [8453], tokenName: 'Neighborhood Workshop FUND', ticker: 'FUND', salt: zeroHash, mustStartAtOrAfter: 0, projectUri: 'ipfs://bafkreimetadata' },
    },
    ...overrides,
  }
}

describe('a published project page', () => {
  let host: HTMLDivElement
  let root: Root
  let client: QueryClient
  beforeEach(() => {
    runtime.getIntent.mockReset().mockResolvedValue(intent())
    runtime.requestDeploy.mockReset()
    navigate.replace.mockReset()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      name: 'Neighborhood Workshop',
      description: 'Shared tools that earn revenue through community use.',
      logoUri: 'ipfs://bafkreilogo',
      coverImageUri: 'ipfs://bafkreicover',
      homerun: { version: 1, kind: 'fund', setup: { location: 'Florianópolis' } },
    }), { headers: { 'content-type': 'application/json' } })))
    client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: Infinity } } })
    host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  })
  afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove() })

  async function render() {
    await act(async () => root.render(<QueryClientProvider client={client}><IntentProject intentId={intentId} /></QueryClientProvider>))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  }
  const button = (label: string) => [...host.querySelectorAll('button')].find(item => item.textContent?.startsWith(label))

  it('renders the FUND from the signed calls and the pinned details', async () => {
    await render()
    expect(host.textContent).toContain('Neighborhood Workshop')
    expect(host.textContent).toContain('Shared tools that earn revenue through community use.')
    expect(host.textContent).toContain('Deploys on first use')
    expect(host.textContent).toContain('Base')
    expect(host.textContent).toContain('Neighborhood Workshop FUND')
    expect(host.textContent).toContain('FUND')
    expect(host.textContent).toContain(wallet)
    expect(host.querySelector('img[alt*="cover"]')).toBeTruthy()
    expect(button('Deploy')).toBeTruthy()
  })

  it('deploys through Center, reports each chain, and opens the created project', async () => {
    runtime.requestDeploy.mockResolvedValue({ deploys: [{ chainId: 8453, status: 'queued', transactionHash: null, bundleUuid: null, error: null, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }] })
    runtime.getIntent
      .mockResolvedValueOnce(intent())
      .mockResolvedValue(intent({
        status: 'deployed',
        deployments: [{ chainId: 8453, projectId: '42', transactionHash: hash, createdAt: new Date(0).toISOString() }],
        deploys: [{ chainId: 8453, status: 'confirmed', transactionHash: hash, bundleUuid: null, error: null, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }],
      }))
    await render()
    await act(async () => { button('Deploy')!.click() })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)) })
    expect(runtime.requestDeploy).toHaveBeenCalledWith(intentId, expect.anything())
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)) })
    expect(navigate.replace).toHaveBeenCalledWith('/project/8453/42')
  })

  it('opens the created project immediately when one already exists', async () => {
    runtime.getIntent.mockResolvedValue(intent({
      status: 'deployed',
      deployments: [{ chainId: 84532, projectId: '7', transactionHash: hash, createdAt: new Date(0).toISOString() }],
    }))
    await render()
    expect(navigate.replace).toHaveBeenCalledWith('/project/84532/7')
  })

  it('says why Center refused, in Center’s words, without raw provider text', async () => {
    const { JBCenterRequestError } = await import('@bananapus/nana-sdk-core/jbcenter')
    runtime.requestDeploy.mockRejectedValue(new JBCenterRequestError('upstream 503 from provider', 503, 'unavailable'))
    await render()
    await act(async () => { button('Deploy')!.click() })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)) })
    const alert = host.querySelector('[role="alert"]')
    expect(alert?.textContent?.length).toBeGreaterThan(0)
    expect(alert?.textContent).not.toContain('upstream 503 from provider')
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run test/intent-project-ui.test.tsx`
Expected: FAIL — `Failed to resolve import "../src/components/IntentProject"`.

- [ ] **Step 3: Write the page component**

Create `src/components/IntentProject.tsx`:

```tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  EnsureDeployedError, describeCenterRefusal, ensureDeployed, type EnsureDeployedStep,
} from '@bananapus/nana-sdk-core/jbcenter'
import { jbCenterClient } from '@/lib/jbcenter-client'
import { decodeFundIntent, watchDeployRefusal } from '@/lib/fund-intent'
import { fetchFundProjectMetadata } from '@/lib/fund-project-metadata'
import { displayChainName } from '@/lib/chainDisplay'

const STEP_LABELS: Record<EnsureDeployedStep['status'], string> = {
  queued: 'queued at Juicebox Center',
  sent: 'sent onchain',
  confirmed: 'created',
  failed: 'could not be created',
  'self-paid': 'recorded',
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'This project could not be deployed. Try again in a few minutes.'
}

/** Everything shown here comes from the signed calls and the pinned metadata; no chain is read. */
export function IntentProject({ intentId }: { intentId: string }) {
  const router = useRouter()
  const [deploying, setDeploying] = useState(false)
  const [steps, setSteps] = useState<string[]>([])
  const [error, setError] = useState('')
  const intent = useQuery({
    queryKey: ['intent', intentId],
    queryFn: () => jbCenterClient.getIntent(intentId),
    staleTime: 30_000,
    retry: 1,
  })
  const deployment = intent.data?.deployments[0]
  useEffect(() => {
    if (deployment) router.replace(`/project/${deployment.chainId}/${deployment.projectId}`)
  }, [deployment, router])

  let terms: ReturnType<typeof decodeFundIntent> | null = null
  let undecodable = ''
  if (intent.data) {
    try { terms = decodeFundIntent(intent.data) } catch (cause) { undecodable = errorMessage(cause) }
  }
  const details = useQuery({
    queryKey: ['intent-metadata', terms?.projectUri],
    enabled: !!terms?.projectUri,
    queryFn: () => fetchFundProjectMetadata(terms!.projectUri),
    staleTime: 300_000,
    retry: 1,
  })

  async function deploy() {
    if (!intent.data) return
    setDeploying(true); setError(''); setSteps([])
    const watcher = watchDeployRefusal(jbCenterClient)
    try {
      await ensureDeployed({
        client: watcher.client,
        intent: intent.data,
        timeoutMs: 600_000,
        onStep: step => setSteps(current => [...current, `${displayChainName(step.chainId)}: ${STEP_LABELS[step.status]}`]),
      })
      await intent.refetch()
    } catch (cause) {
      const refused = describeCenterRefusal(watcher.refusal())
      setError(refused?.message
        ?? (cause instanceof EnsureDeployedError
          ? 'Juicebox Center could not deploy this project. Try again in a few minutes.'
          : errorMessage(cause)))
    } finally { setDeploying(false) }
  }

  if (intent.isPending) return <p role="status">Reading this project from Juicebox Center…</p>
  if (intent.isError) return <div role="alert" className="grid justify-items-start gap-4">
    <p>This project could not be read from Juicebox Center.</p>
    <button type="button" className="btn-secondary" onClick={() => void intent.refetch()}>Try again</button>
  </div>
  if (!terms) return <p role="alert">{undecodable || 'This project was not created by Homerun.'}</p>

  const name = details.data?.name ?? intent.data?.name ?? 'FUND project'
  return <div className="grid gap-7">
    <section className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid min-w-0 gap-2">
          <h1 className="text-5xl sm:text-6xl">{name}</h1>
          {details.data?.location && <p className="text-sm">{details.data.location}</p>}
        </div>
        {details.data?.logoUrl && <Image unoptimized src={details.data.logoUrl} width={112} height={112} alt={`${name} logo`} />}
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-4 p-0 text-sm">
        <li>Status: Deploys on first use</li>
        <li>Networks: {terms.chainIds.map(displayChainName).join(', ')}</li>
        <li>FUND token: {terms.tokenName} ({terms.ticker})</li>
        <li>Contributions open: {terms.mustStartAtOrAfter ? new Date(terms.mustStartAtOrAfter * 1000).toLocaleString() : 'as soon as it is created'}</li>
      </ul>
      <p className="break-all text-sm">Owner: {terms.owner}</p>
    </section>

    <section className="rounded-md border border-[#c4cdbb] bg-[#eef1e7] p-5 sm:p-7">
      <h2 className="mb-5 text-3xl">Deploy this project</h2>
      <p>Juicebox Center sends the creation on {terms.chainIds.map(displayChainName).join(', ')} and pays its creation fee. Anyone can start it, and the terms above cannot change.</p>
      <button type="button" className="btn-primary mt-5" disabled={deploying} onClick={() => void deploy()}>{deploying ? 'Deploying…' : 'Deploy'}</button>
      {steps.length > 0 && <ul className="m-0 mt-5 grid list-none gap-2 p-0 text-sm" aria-label="Deployment progress">{steps.map((step, index) => <li key={`${step}:${index}`} role="status">{step}</li>)}</ul>}
      {error && <p role="alert" className="mt-5 text-sm">{error}</p>}
    </section>

    <section className="rounded-md border border-[#c4cdbb] bg-[#fffefa] p-5 sm:p-7">
      <h2 className="mb-5 text-3xl">About</h2>
      {details.isError && <p className="mb-5 text-sm">The project details could not be loaded. The terms above are read from the signed project creation.</p>}
      <p className="whitespace-pre-line">{details.data?.description ?? 'Fund an asset with a FUND Juicebox created on first use.'}</p>
      {details.data?.coverUrl && <Image unoptimized src={details.data.coverUrl} width={1200} height={675} alt={`${name} cover`} className="mt-5 max-h-[480px] w-full rounded-md object-cover" />}
      {details.data?.owner && <div className="mt-7 grid gap-2">
        <h3 className="text-2xl">Owner</h3>
        {details.data.owner.photoUrl && <Image unoptimized src={details.data.owner.photoUrl} width={96} height={96} alt={details.data.owner.name ? `${details.data.owner.name} picture` : 'Owner picture'} />}
        {details.data.owner.name && <p>{details.data.owner.name}</p>}
        {details.data.owner.introduction && <p className="whitespace-pre-line text-sm">{details.data.owner.introduction}</p>}
      </div>}
    </section>
  </div>
}
```

- [ ] **Step 4: Write the route**

Create `src/app/intent/[id]/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Brand } from '@/components/Brand'
import { WalletButton } from '@/components/WalletButton'
import { IntentProject } from '@/components/IntentProject'

const INTENT_ID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

type IntentRouteProps = { params: Promise<{ id: string }> }

export const metadata: Metadata = {
  title: 'Published project',
  description: 'A Homerun project published to Juicebox Center that deploys on first use.',
  robots: { index: false, follow: false },
}

export default async function IntentPage({ params }: IntentRouteProps) {
  const { id } = await params
  if (!INTENT_ID.test(id)) notFound()
  return <div className="project-page live-contract-page">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><Brand /><WalletButton /></header>
    <main id="main" className="mx-auto max-w-[1220px] px-5 py-10 sm:py-14" tabIndex={-1}>
      <IntentProject key={id} intentId={id} />
    </main>
  </div>
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run test/intent-project-ui.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 6: Check the route by hand**

```bash
npm run build
```

Expected: the build output lists `/intent/[id]` as a route, and no page or type error is reported.

- [ ] **Step 7: Run the gates**

```bash
npx tsc --noEmit && npm run lint && npm run test:live
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/intent src/components/IntentProject.tsx test/intent-project-ui.test.tsx
git commit -m "$(cat <<'EOF'
Give a published project a page and one Deploy action

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Published projects in the lists

**Files:**
- Modify: `src/components/AccountProjects.tsx`
- Test: `test/account-projects.test.tsx`

**Interfaces:**
- Consumes: `jbCenterClient.searchIntents({ owner | query, limit })`; `mergeSearch`, `intentRow`, `intentPath`, `type JBCenterIntentRow`, `type JBCenterSearchItem`, `type JBCenterSearchPage` from the SDK; `displayChainName`.
- Produces: no new exports. `AccountProjectSections` and the in-file `ProjectSearch` show published projects alongside indexed ones, newest first, each linking to `intentPath(intentId)` and labelled "Deploys on first use".

- [ ] **Step 1: Write the failing tests**

In `test/account-projects.test.tsx`, add the Center mock next to the existing Bendystraw mock (the `mocks` hoisted object gains one entry):

```tsx
const mocks = vi.hoisted(() => ({
  wallet: { address: undefined as string | undefined, isConnected: false },
  owned: vi.fn(), holdings: vi.fn(), byRefs: vi.fn(), search: vi.fn(), intents: vi.fn(),
}))

vi.mock('@/lib/jbcenter-client', () => ({ jbCenterClient: { searchIntents: mocks.intents } }))
```

Add to the existing `beforeEach`:

```tsx
    mocks.intents.mockReset().mockResolvedValue({ items: [], totalCount: 0, nextCursor: null })
```

Add this helper next to the existing `project()` and `holding()` helpers:

```tsx
function intentItem(overrides: Record<string, unknown> = {}) {
  return {
    source: 'jbcenter', status: 'undeployed',
    intentId: '3f0f2f4c-0f3f-4f2f-8f1f-0f2f3f4f5f6f',
    contentHash: `0x${'ab'.repeat(32)}`, format: 'homerun.money/fund.v1', deploymentVersion: '6',
    chainIds: [8453], publisher: ACCOUNT_A, createdAt: new Date(2_000_000).toISOString(),
    name: 'Published Workshop', description: null, tagline: null, tags: [], logoUri: null, owner: ACCOUNT_A,
    ...overrides,
  }
}
```

Add these cases inside the existing `describe`:

```tsx
  it('lists a published project the account owns alongside its indexed projects', async () => {
    mocks.wallet = { address: ACCOUNT_A, isConnected: true }
    mocks.owned.mockResolvedValue([project({ createdAt: 1 })])
    mocks.intents.mockResolvedValue({ items: [intentItem()], totalCount: 1, nextCursor: null })
    await render(ACCOUNT_A)
    expect(mocks.intents).toHaveBeenCalledWith({ owner: ACCOUNT_A, limit: 24 })
    const owned = section('Owned by this account')
    const rows = [...owned.querySelectorAll('li')]
    expect(rows[0].textContent).toContain('Published Workshop')
    expect(rows[0].textContent).toContain('Deploys on first use')
    expect(rows[0].querySelector('a')?.getAttribute('href')).toBe('/intent/3f0f2f4c-0f3f-4f2f-8f1f-0f2f3f4f5f6f')
    expect(rows[1].textContent).toContain('Neighborhood FUND')
  })

  it('keeps testnet published projects out of the mainnet list', async () => {
    mocks.wallet = { address: ACCOUNT_A, isConnected: true }
    mocks.intents.mockResolvedValue({ items: [intentItem({ chainIds: [84532] })], totalCount: 1, nextCursor: null })
    await render(ACCOUNT_A)
    expect(section('Owned by this account').textContent).not.toContain('Published Workshop')
  })

  it('finds published projects in search and keeps indexed results when Center fails', async () => {
    mocks.search.mockResolvedValue([project({ name: 'Neighborhood FUND', createdAt: 1 })])
    mocks.intents.mockResolvedValue({ items: [intentItem({ name: 'Neighborhood Workshop' })], totalCount: 1, nextCursor: null })
    await render(null)
    await search('neighborhood')
    await settle(); await settle(); await settle()
    expect(mocks.intents).toHaveBeenCalledWith({ query: 'neighborhood', limit: 24 })
    const found = section('Find a project')
    expect(found.textContent).toContain('Neighborhood Workshop')
    expect(found.textContent).toContain('Neighborhood FUND')

    mocks.intents.mockRejectedValue(new Error('center down'))
    client.clear()
    await render(null)
    await search('neighborhood')
    await settle(); await settle(); await settle()
    expect(section('Find a project').textContent).toContain('Neighborhood FUND')
  })
```

The debounce in `ProjectSearch` is 300 ms, so `search()` must be followed by enough `settle()` calls; the existing tests in this file already use that pattern — if a case flakes, add one more `settle()` rather than changing the component.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run test/account-projects.test.tsx`
Expected: FAIL — `mocks.intents` is never called.

- [ ] **Step 3: Import the merge helpers**

In `src/components/AccountProjects.tsx`, add after the existing `viem` import:

```ts
import { intentPath, mergeSearch, type JBCenterIntentRow, type JBCenterSearchItem, type JBCenterSearchPage } from '@bananapus/nana-sdk-core/jbcenter'
import { jbCenterClient } from '@/lib/jbcenter-client'
```

- [ ] **Step 4: Add the network filter and the row**

In `src/components/AccountProjects.tsx`, after the existing `const INDEX_QUERY = ...` line, add:

```ts
const NETWORK_CHAIN_IDS: Record<Network, readonly number[]> = {
  mainnet: [1, 10, 8453, 42161],
  testnet: [11155111, 11155420, 84532, 421614],
}

/** A published project belongs to the network whose chains it names, and to no other. */
function intentItems(page: JBCenterSearchPage | undefined, network: Network): JBCenterSearchItem[] {
  return (page?.items ?? []).filter(item => item.chainIds.length > 0
    && item.chainIds.every(chainId => NETWORK_CHAIN_IDS[network].includes(chainId)))
}

function isIntentRow(row: BsProject | JBCenterIntentRow): row is JBCenterIntentRow {
  return 'undeployed' in row
}
```

Then add this component next to `ProjectRow`:

```tsx
function IntentRow({ row }: { row: JBCenterIntentRow }) {
  return <li className="grid min-w-0 gap-2 rounded-md border border-[#c4cdbb] bg-[#fffefa] p-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <Link href={intentPath(row.intentId)} prefetch={false} className="min-w-0 break-words text-lg underline underline-offset-4">{row.name?.trim() || 'Untitled project'}</Link>
      <span className="text-xs">Deploys on first use</span>
    </div>
    <p className="text-sm">{row.chainIds.map(displayChainName).join(', ')}</p>
    {row.tagline && <p className="break-words text-sm">{row.tagline}</p>}
  </li>
}

function listRow(row: BsProject | JBCenterIntentRow) {
  return isIntentRow(row)
    ? <IntentRow key={`intent:${row.intentId}`} row={row} />
    : <ProjectRow key={refKey(row)} project={row} />
}
```

- [ ] **Step 5: Merge the owned list**

In `AccountProjectSections`, after the existing `holdings` query, add:

```ts
  const intents = useQuery({
    ...INDEX_QUERY,
    queryKey: ['account-projects', 'intents', network, account],
    queryFn: () => jbCenterClient.searchIntents({ owner: account, limit: PAGE_SIZE }),
    enabled: section !== 'holdings',
  })
```

Replace:

```ts
  const ownedRows = projectRows(owned.data).filter(project => project.owner?.toLowerCase() === account)
```

with:

```ts
  const indexedOwned = projectRows(owned.data).filter(project => project.owner?.toLowerCase() === account)
  const publishedOwned = intentItems(intents.data, network).filter(item => item.owner?.toLowerCase() === account)
  const ownedRows = mergeSearch(indexedOwned, publishedOwned)
```

Then in the "Owned by this account" section, replace the row list line:

```tsx
      {ownedRows.length > 0 && <ul className="m-0 grid list-none gap-3 p-0">{ownedRows.slice(0, ownedLimit).map(project => <ProjectRow key={refKey(project)} project={project} />)}</ul>}
```

with:

```tsx
      {ownedRows.length > 0 && <ul className="m-0 grid list-none gap-3 p-0">{ownedRows.slice(0, ownedLimit).map(listRow)}</ul>}
```

and add, directly after that line:

```tsx
      {intents.isError && <p className="text-sm">Projects awaiting deployment could not be loaded.</p>}
```

- [ ] **Step 6: Merge the search list**

In `ProjectSearch`, after the existing `search` query, add:

```ts
  const publishedSearch = useQuery({
    queryKey: ['account-projects', 'intent-search', network, debouncedText],
    queryFn: () => jbCenterClient.searchIntents({ query: debouncedText, limit: PAGE_SIZE }),
    enabled: ready,
    staleTime: 30_000,
    retry: 1,
  })
```

Replace:

```ts
  const rows = projectRows(search.data).slice(0, PAGE_SIZE)
```

with:

```ts
  const rows = mergeSearch(projectRows(search.data), intentItems(publishedSearch.data, network)).slice(0, PAGE_SIZE)
```

and replace the results list line:

```tsx
      {rows.length > 0 && <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">{rows.map(project => <ProjectRow key={refKey(project)} project={project} />)}</ul>}
```

with:

```tsx
      {rows.length > 0 && <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">{rows.map(listRow)}</ul>}
      {publishedSearch.isError && <p className="text-sm">Projects awaiting deployment could not be searched.</p>}
```

- [ ] **Step 7: Run the tests and watch them pass**

Run: `npx vitest run test/account-projects.test.tsx test/account-view.test.tsx`
Expected: PASS for both — `AccountView` renders the same sections and must be unaffected.

- [ ] **Step 8: Run the gates**

```bash
npx tsc --noEmit && npm run lint && npm run test:live && npm run build
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/components/AccountProjects.tsx test/account-projects.test.tsx
git commit -m "$(cat <<'EOF'
Show published projects in the account list and in search

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The browser proof

**Files:**
- Create: `test/intent-browser.mjs`
- Modify: `package.json` (`test:intent` script)

**Interfaces:**
- Consumes: the whole feature, through the real Next.js application.
- Produces: `npm run test:intent`, which starts a modeled Juicebox Center on a local port, starts `next dev` pointed at it, injects an EIP-6963 test wallet, creates a Base FUND without a transaction, deploys it and lands on the created project page. It writes `test-results/intent/summary.json` and exits non-zero on any failure.

- [ ] **Step 1: Write the test**

Create `test/intent-browser.mjs`:

```js
/** Homerun creates a FUND without a transaction: the real Next.js application and the packaged
 *  SDK against a modeled Juicebox Center and an injected test wallet. No chain, no Center
 *  service, no transaction and no real signature authority are involved. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { privateKeyToAccount } from 'viem/accounts'
import { CREATE_DEFAULTS } from '../web/create-model.mjs'

const appPort = Number(process.env.INTENT_APP_PORT || 3016)
const centerPort = Number(process.env.INTENT_CENTER_PORT || 3017)
const appOrigin = `http://127.0.0.1:${appPort}`
const centerOrigin = `http://127.0.0.1:${centerPort}`
const root = fileURLToPath(new URL('..', import.meta.url))
// A well-known test key. It holds nothing and signs only this modeled message.
const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
const cid = 'bafkreiabcdefghijklmnopqrstuvwxyz234567'
const contentHash = `0x${'ab'.repeat(32)}`
const transactionHash = `0x${'ef'.repeat(32)}`
const intentId = randomUUID()
const projectId = '42'
const pin = { cid, status: 'queued', uri: `ipfs://${cid}`, gatewayUrl: `/ipfs/${cid}` }
const metadata = {
  name: 'Neighborhood Workshop',
  description: 'Shared tools that earn revenue through community use.',
  infoUri: 'https://homerun.money',
  tokens: { name: 'Neighborhood Workshop FUND', symbol: 'FUND' },
  homerun: { version: 1, kind: 'fund', setup: { location: 'Florianópolis' }, incomeProject: null },
}
const timestamp = new Date(1_800_000_000_000).toISOString()
const uint256 = value => `0x${value.toString(16).padStart(64, '0')}`

let stored = null
let deployRequests = 0
let intentReads = 0

function intentRecord() {
  const deployed = deployRequests > 0 && intentReads > 1
  return {
    id: intentId, status: deployed ? 'deployed' : 'undeployed', contentHash,
    envelope: stored.envelope, publisher: stored.publisher, signature: stored.signature,
    createdAt: timestamp,
    deployments: deployed ? [{ chainId: 8453, projectId, transactionHash, createdAt: timestamp }] : [],
    deploys: deployRequests === 0 ? [] : [{
      chainId: 8453, status: deployed ? 'confirmed' : 'queued',
      transactionHash: deployed ? transactionHash : null, bundleUuid: null, error: null,
      createdAt: timestamp, updatedAt: timestamp,
    }],
    name: 'Neighborhood Workshop', description: null, tagline: null, tags: [], logoUri: null,
    owner: account.address,
  }
}

const center = createServer((request, response) => {
  const url = new URL(request.url, centerOrigin)
  const headers = {
    'access-control-allow-origin': appOrigin,
    'access-control-allow-headers': 'content-type,accept',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'cache-control': 'no-store',
  }
  const json = (status, body) => {
    response.writeHead(status, { ...headers, 'content-type': 'application/json' })
    response.end(JSON.stringify(body))
  }
  if (request.method === 'OPTIONS') { response.writeHead(204, headers); return response.end() }
  const withBody = handler => {
    const chunks = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('end', () => handler(Buffer.concat(chunks)))
  }
  if (url.pathname === '/v1/pins/json' || url.pathname === '/v1/pins/file') {
    return withBody(() => json(200, pin))
  }
  if (url.pathname === '/v1/intents/message') {
    return withBody(body => json(200, {
      contentHash,
      message: `Publish this Juicebox project intent\n\n${contentHash}`,
      envelope: JSON.parse(body.toString()),
    }))
  }
  if (url.pathname === '/v1/intents' && request.method === 'POST') {
    return withBody(body => {
      const published = JSON.parse(body.toString())
      const { publisher, signature, ...envelope } = published
      stored = { envelope, publisher, signature }
      return json(201, intentRecord())
    })
  }
  if (url.pathname === `/v1/intents/${intentId}` && request.method === 'GET') {
    intentReads++
    return json(200, intentRecord())
  }
  if (url.pathname === `/v1/intents/${intentId}/deploy` && request.method === 'POST') {
    deployRequests++
    return withBody(() => json(202, { deploys: intentRecord().deploys }))
  }
  if (url.pathname === '/v1/search') {
    return json(200, { items: [], totalCount: 0, nextCursor: null })
  }
  if (url.pathname.startsWith('/v1/rpc/')) {
    const chainId = Number(url.pathname.slice('/v1/rpc/'.length))
    return withBody(body => {
      const calls = JSON.parse(body.toString())
      const answer = call => {
        if (call.method === 'eth_chainId') return uint256(BigInt(chainId))
        if (call.method === 'eth_blockNumber') return uint256(1_000n)
        if (call.method === 'eth_getCode') return '0x60006000'
        // Every read this flow makes wants one positive number: the creation fee it
        // compares against the reviewed value, and the USDC price feed.
        if (call.method === 'eth_call') return uint256(10n ** 18n)
        if (call.method === 'eth_getBlockByNumber') return {
          number: uint256(1_000n), hash: `0x${'11'.repeat(32)}`, parentHash: `0x${'22'.repeat(32)}`,
          timestamp: uint256(1_800_000_000n), gasLimit: uint256(30_000_000n), gasUsed: '0x0',
          miner: `0x${'33'.repeat(20)}`, extraData: '0x', baseFeePerGas: uint256(1n),
          logsBloom: `0x${'00'.repeat(256)}`, transactions: [], uncles: [], sha3Uncles: `0x${'44'.repeat(32)}`,
          stateRoot: `0x${'55'.repeat(32)}`, transactionsRoot: `0x${'66'.repeat(32)}`, receiptsRoot: `0x${'77'.repeat(32)}`,
          difficulty: '0x0', totalDifficulty: '0x0', size: '0x0', nonce: '0x0000000000000000', mixHash: `0x${'88'.repeat(32)}`,
        }
        return null
      }
      const reply = call => ({ jsonrpc: '2.0', id: call.id, result: answer(call) })
      return json(200, Array.isArray(calls) ? calls.map(reply) : reply(calls))
    })
  }
  return json(404, { error: 'not modeled' })
})

async function ready(url, attempts = 180) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch { /* the server is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 1_000))
  }
  throw new Error(`${url} never became ready`)
}

center.listen(centerPort, '127.0.0.1')
const app = spawn('npx', ['next', 'dev', '--webpack', '--port', String(appPort)], {
  cwd: root,
  env: {
    ...process.env,
    NEXT_PUBLIC_SITE_URL: appOrigin,
    NEXT_PUBLIC_JBCENTER_URL: centerOrigin,
    NEXT_PUBLIC_DETERMINISTIC_BROWSER: 'false',
    NEXT_DIST_DIR: '.next-intent-test',
  },
  stdio: 'inherit',
})

let browser
try {
  await ready(`${appOrigin}/create`)
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  const errors = []
  await context.exposeFunction('__homerunTestSign', hexMessage => account.signMessage({ message: { raw: hexMessage } }))
  await context.addInitScript(({ address, chainId }) => {
    const provider = {
      async request({ method, params }) {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address]
        if (method === 'eth_chainId') return chainId
        if (method === 'net_version') return String(Number.parseInt(chainId, 16))
        if (method === 'personal_sign') return window.__homerunTestSign(params[0])
        if (method === 'wallet_switchEthereumChain') return null
        throw Object.assign(new Error(`Unsupported method ${method}`), { code: 4200 })
      },
      on() {}, removeListener() {},
    }
    const info = { uuid: '7f0c1c3a-0000-4000-8000-000000000001', name: 'Test Wallet', rdns: 'test.homerun.money', icon: 'data:image/svg+xml;base64,PHN2Zy8+' }
    const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }))
    window.addEventListener('eip6963:requestProvider', announce)
    announce()
  }, { address: account.address, chainId: '0x2105' })
  await context.addInitScript(saved => {
    try { localStorage.setItem('homerun:create-draft:v1', JSON.stringify(saved)) } catch { /* storage is unavailable on about:blank */ }
  }, {
    raw: {
      ...CREATE_DEFAULTS,
      name: 'Neighborhood Workshop',
      location: 'Florianópolis',
      description: 'Shared tools that earn revenue through community use.',
      revenueDescription: 'Members pay for tool hire and repairs.',
      fundTokenName: 'Neighborhood Workshop FUND',
      fundTicker: 'FUND',
      ownerMode: 'existing', ownerWallet: account.address, ownerIsOperator: true,
      operatorMode: 'existing', operatorWallet: account.address,
      networks: ['base'], networkEnvironment: 'production',
    },
    step: 4,
    incomeDefaultsVersion: 3,
  })
  // The IPFS gateway constant points at production Juicebox Center; serve the pinned
  // metadata from here so this run reaches no network but the modeled Center.
  await context.route('https://juicebox.center/ipfs/**', route => route.fulfill({ json: metadata }))

  const page = await context.newPage()
  page.setDefaultTimeout(30_000)
  page.setDefaultNavigationTimeout(180_000)
  page.on('pageerror', error => errors.push(error.message))

  await page.goto(`${appOrigin}/create`)
  await page.getByRole('heading', { name: 'Create your project', exact: true }).waitFor()
  await page.locator('.site-header').getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Test Wallet/ }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })

  const create = page.getByRole('button', { name: 'Create without a transaction', exact: true })
  await create.waitFor()
  assert.equal(await page.getByRole('button', { name: 'Create with a transaction instead', exact: true }).count(), 1)
  await create.click()

  const review = page.getByRole('dialog')
  await review.getByText('Create your project', { exact: false }).first().waitFor()
  await review.getByRole('checkbox').check()
  await review.getByRole('button', { name: 'Continue to wallet', exact: true }).click()

  await page.waitForURL(`${appOrigin}/intent/${intentId}`)
  await page.getByText('Deploys on first use', { exact: false }).first().waitFor()
  assert.match(await page.locator('main').textContent(), /Neighborhood Workshop/)
  assert.match(await page.locator('main').textContent(), /Base/)
  assert.deepEqual(errors, [])

  await page.getByRole('button', { name: 'Deploy', exact: true }).click()
  await page.waitForURL(`${appOrigin}/project/8453/${projectId}`, { timeout: 60_000 })

  assert.equal(deployRequests, 1)
  assert.equal(stored.envelope.format, 'homerun.money/fund.v1')
  assert.equal(stored.envelope.deploymentVersion, '6')
  assert.deepEqual(stored.envelope.chainIds, [8453])
  assert.equal(stored.envelope.deploymentCalls.length, 1)
  assert.equal(stored.envelope.deploymentCalls[0].chainId, 8453)
  assert.equal(Object.hasOwn(stored.envelope.deploymentCalls[0], 'value'), false)
  assert.equal(stored.envelope.jb.app, 'homerun')
  assert.equal(stored.envelope.jb.kind, 'fund')
  assert.equal(stored.envelope.jb.owner.toLowerCase(), account.address.toLowerCase())
  assert.equal(stored.envelope.jb.projectUri, `ipfs://${cid}`)
  assert.equal(stored.publisher.toLowerCase(), account.address.toLowerCase())
  assert.match(stored.signature, /^0x[0-9a-f]{130}$/i)

  await mkdir('test-results/intent', { recursive: true })
  await writeFile('test-results/intent/summary.json', JSON.stringify({
    passed: true, browser: browser.version(),
    evidence: 'real Next.js application and packaged SDK; modeled Center responses and injected test wallet',
    intentId, deployRequests, intentReads, pageErrors: errors,
  }, null, 2))
  console.log('PASS Homerun: published a FUND without a transaction, deployed it through Center, opened the created project')
} finally {
  await browser?.close()
  app.kill('SIGTERM')
  center.close()
}
```

- [ ] **Step 2: Add the script**

In `package.json`, add after the `"test:create"` line:

```json
    "test:intent": "node test/intent-browser.mjs",
```

- [ ] **Step 3: Run it**

```bash
npm run test:intent
```

Expected: `PASS Homerun: published a FUND without a transaction, deployed it through Center, opened the created project`, and exit code 0. If ports 3016 or 3017 are busy, re-run with `INTENT_APP_PORT` and `INTENT_CENTER_PORT` set; if the run then passes, keep the defaults as written.

- [ ] **Step 4: Run every gate**

```bash
npm run lint && npx tsc --noEmit && npm test && npm run test:live && npm run build
```

Then, with a dev server running for the two suites that need one (`npm run dev` in another shell):

```bash
npm run test:create && npm run test:a11y
```

Expected: all pass, with no new failures in `test:create` (it never connects a wallet, so it still sees the single "Create project" button).

- [ ] **Step 5: Commit**

```bash
git add test/intent-browser.mjs package.json
git commit -m "$(cat <<'EOF'
Prove creation without a transaction in a browser

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Ship it

**Files:**
- No source changes. This task opens the pull request, merges it, watches the deployment and proves the feature against the live services.

**Interfaces:**
- Consumes: everything from Tasks 1-7 on branch `feat/fund-intents-center`.
- Produces: `main` of `mejango/homerun` with the feature, a live Railway deployment, one deployed testnet FUND on Base Sepolia and Optimism Sepolia against `dev.juicebox.center`, and one deployed production FUND on Base and Optimism against `juicebox.center`.

- [ ] **Step 1: Re-run every gate on the final tree**

```bash
source ~/.nvm/nvm.sh && nvm use 22
cd /Users/jango/Documents/jb/v6/evm/extensions/homerun-fund-intents
npm run lint && npx tsc --noEmit && npm test && npm run test:live && npm run build && npm run test:intent
```

Expected: all pass.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feat/fund-intents-center
```

- [ ] **Step 3: Open the pull request**

```bash
gh pr create --repo mejango/homerun --base main --head feat/fund-intents-center \
  --title "Create a FUND without a transaction" \
  --body "$(cat <<'EOF'
A merchant with an external wallet creates a FUND on the sponsored rollups by signing one message instead of sending a transaction.

- `src/lib/fund-intent.ts` turns `buildFundLaunch` requests into a `homerun.money/fund.v1` intent envelope (calls without their creation fee) and publishes it through the SDK's guarded `publishSignedIntent`.
- The review step offers "Create without a transaction" when the wallet is external, no new multisig is planned, and every selected network is sponsored. The direct, Relayr and Safe paths are unchanged.
- The launch session records `transport: 'intent'` and the intent id; `/create/recover` links to the published project.
- `/intent/<id>` renders the FUND from the signed calldata and the pinned metadata, deploys it through Juicebox Center, and opens the created project.
- The account list and search merge Juicebox Center rows with Bendystraw rows, labelled "Deploys on first use".

Tests: `test/fund-intent.test.ts`, `test/fund-deploy-intent-ui.test.tsx`, `test/intent-project-ui.test.tsx`, new cases in `test/fund-launch-session.test.ts` and `test/account-projects.test.tsx`, and `npm run test:intent`, a Playwright run of the whole flow against a modeled Center and an injected test wallet.

Requires `@bananapus/nana-sdk-core` 2.8.0. No contract change, no new environment variable, no change to the transaction review or write path.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Merge**

```bash
gh pr checks --repo mejango/homerun --watch
gh pr merge --repo mejango/homerun --squash --delete-branch
```

Expected: checks green, merge completes.

- [ ] **Step 5: Watch the Railway deployment**

`railway.json` selects the Dockerfile and health-checks `/`; the Railway service builds from `main` with the `NEXT_PUBLIC_*` build arguments already configured. Watch it and then prove the new route is live:

```bash
railway logs --service homerun | tail -40
curl -s -o /dev/null -w '%{http_code}\n' https://homerun.money/intent/00000000-0000-4000-8000-000000000000
curl -s https://homerun.money/create | grep -c 'Design the rules'
```

Expected: the deployment reaches the running state, the `/intent/<uuid>` route answers `200`, and `/create` still renders. If the Railway CLI is not linked to the service, use the Railway dashboard for the first command and keep the two curl checks.

- [ ] **Step 6: Live testnet FUND against Center dev**

`jbCenterBaseUrl()` resolves `http://localhost:3010` to `https://dev.juicebox.center`, and that origin is already allowed there, so run the merged `main` locally for this check:

```bash
git -C /Users/jango/Documents/jb/v6/evm/extensions/homerun fetch origin && git -C /Users/jango/Documents/jb/v6/evm/extensions/homerun checkout main && git -C /Users/jango/Documents/jb/v6/evm/extensions/homerun pull
cd /Users/jango/Documents/jb/v6/evm/extensions/homerun && npm ci && npm run dev
```

Then in a browser at `http://localhost:3010/create`, with a funded-for-nothing test EOA (this path sends no transaction):

1. Fill the setup with existing Owner and Operator addresses (no new multisig).
2. On Review, select Testnets and exactly Optimism and Base.
3. Press "Create without a transaction", read the review dialog (two calls, one per chain, both to HomerunDeployer, both with zero value), continue, and sign the message.
4. Confirm the page lands on `/intent/<id>` and shows both networks and "Deploys on first use".
5. Press Deploy. Confirm both chains report queued then created, and the page opens `/project/84532/<id>` or `/project/11155420/<id>`.
6. Open `/projects` with that wallet connected, switch to Testnet, and confirm the deployed project is listed (the published row leaves the list once it is deployed).

Record the intent id and both project ids. If the deploy is refused, the page must show Center's refusal sentence and nothing else — report that instead of retrying blindly.

- [ ] **Step 7: Live production FUND**

On `https://homerun.money/create`, with a production wallet:

1. Same setup, existing Owner and Operator addresses.
2. On Review, keep Mainnets and select exactly Optimism and Base (deselect Ethereum and Arbitrum; Ethereum is never sponsored and removes the option entirely).
3. Create without a transaction, review, sign.
4. On `/intent/<id>`, press Deploy and wait for both chains.
5. Confirm the redirect to `/project/8453/<id>` and that the project page reads its onchain state: owner, FUND ERC-20, USDC accounting context, contributions open.
6. Confirm `/projects` lists it for that wallet on Mainnet.

- [ ] **Step 8: Record the result**

Append the intent ids, project ids and chain ids from Steps 6 and 7 to the pull request as a comment:

```bash
gh pr comment --repo mejango/homerun <pr-number> --body "$(cat <<'EOF'
Live check: testnet FUND <intent id> deployed to Base Sepolia project <id> and Optimism Sepolia project <id> against dev.juicebox.center. Production FUND <intent id> deployed to Base project <id> and Optimism project <id>.
EOF
)"
```

- [ ] **Step 9: Remove the worktree**

```bash
git -C /Users/jango/Documents/jb/v6/evm/extensions/homerun worktree remove /Users/jango/Documents/jb/v6/evm/extensions/homerun-fund-intents
```

---

## Self-review

**Spec coverage (section 3, line by line):**

| Spec requirement | Task |
| --- | --- |
| Eligibility: external wallet, not Center connector, not Safe, every chain sponsored | 4 (hard gate: Center's EOA-only `verifyMessage` refuses a contract-wallet signature with a 400; plus the no-new-multisig condition, see Ambiguities) |
| "Create without a transaction" is the default when eligible; direct, Relayr and Safe paths remain | 4 |
| Publishing after `prepare()` has pinned metadata and fixed salt and start | 4 (`prepareIntent` repeats that sequence for the intent path) |
| `buildFundLaunch` requests become deployment calls through `createJBCenterDeploymentCall`, no value | 2 |
| Envelope format, deploymentVersion, chainIds, `jb` fields | 2 |
| `publishSignedIntent` signs with wagmi `signMessage` | 2 (helper) + 4 (wagmi wiring) |
| Session records `transport: "intent"` and the intent id | 3 |
| The page navigates to `/intent/<id>` | 4 |
| `/create/recover` links there when the saved session is an intent | 4 (published branch of `FundDeploy`, which that route renders) |
| Account list merges Bendystraw with `searchIntents({ owner })` | 6 |
| Search merges `searchProjects` with `searchIntents({ query })` | 6 |
| Both through `mergeSearch`; rows link to `/intent/<id>` with "Deploys on first use" | 6 |
| `/intent/[id]`: `getIntent` + `decodeDeploymentCall` + pinned metadata; name, description, photos, chains, owner, token name and ticker, start; no chain reads | 5 |
| One Deploy action runs `ensureDeployed` (sponsored only) with step progress | 5 |
| Refusals show `describeCenterRefusal`'s sentence | 4 and 5 |
| Redirect to `/project/<chainId>/<projectId>` when any deployment exists | 5 |
| Existing admin writes unchanged, no write chokepoint change | all (stated in Global Constraints; no task touches those files) |
| INCOME unchanged | all |
| No new environment variables; Center URL and app origin from `jbcenter-config.ts` | 2 (`jbcenter-client.ts` uses `jbCenterBaseUrl()`) |
| Testing: deterministic builder, publish with a fake client, merged lists, intent page with a fake Center, Playwright run, existing suites green | 2, 5, 6, 7 |
| Live: two-chain testnet FUND against Center dev, then one production FUND on Base and OP | 8 |

**Placeholder scan:** no "TBD", no "add error handling", no "similar to Task N", no test described without its code. Every step that changes code shows the exact code or the exact before/after text. The one judgement call left to the implementer is stated concretely (port collisions in Task 7 Step 3), and the two places where an extra `settle()` may be needed are named.

**Type consistency:** `FundLaunchInput`, `FundTransaction`, `FundLaunchSession`, `LaunchStatus`, `CreateValues`, `BsProject`, `JBCenterIntent`, `JBCenterSearchItem`, `JBCenterIntentRow`, `JBCenterDeploymentCall` are used with the same names and shapes everywhere. `buildFundIntent(input, name)`, `publishFundIntent({ client, input, name, publisher, sign })`, `decodeFundIntent(intent)`, `watchDeployRefusal(client)`, `fundIntentEligibleChains(chainIds)` keep one signature each across Tasks 2, 4, 5 and their tests. `transport: 'intent'` and `intentId` are spelled the same in Task 3's type, Task 4's writes and Task 7's assertions. The page component is `IntentProject` in Task 5's file, route and test.

## Ambiguities resolved

1. **The decoded-variant tag.** The spec says `decodeDeploymentCall` gains "result kind `homerun-fund`". The SDK's `JBCenterDecodedLaunch` union is tagged by `flavor` (`"project"`, `"project-721"`, `"omnichain"`, `"revnet"`, `"unknown"`), and the SDK plan confirms the Homerun variant is `flavor: "homerun-fund"`. This plan reads `launch.flavor === 'homerun-fund'` in exactly one place (`decodeFundIntent` in `src/lib/fund-intent.ts`); "kind" in the spec means the variant, not a new discriminant property.
2. **New multisigs, and why eligibility is a hard gate.** The spec's eligibility rule names the wallet and the chains. Creating a new Owner or Operator multisig is a transaction (`multisigDeploymentRequest`), which an intent cannot carry, so this plan adds "no new multisig is planned" to eligibility, refuses it in `buildFundIntent`, and re-checks it after `resolveCreateMultisigs` resolves the addresses. The wallet half of the rule is not a preference either: Center verifies the publisher with viem's `verifyMessage`, which is EOA-only, so a Safe or passkey signature is refused with a 400 and nothing is published. Only the signer must be an EOA; the FUND's owner may still be a Safe.
3. **The format string.** `homerun.money/fund.v1`, not `homerun.money/fund/v1`: Center's format grammar permits exactly one slash.
4. **Wording a refusal that `ensureDeployed` swallows.** With no `selfPaid` fallback, `ensureDeployed` converts a 400/429/503 from `requestDeploy` into a generic `EnsureDeployedError`, so `describeCenterRefusal` would never see Center's code. `watchDeployRefusal` keeps the original `JBCenterRequestError` and the page words that; the generic sentence is the fallback.
5. **Node version.** `package.json` declares `engines.node >= 24.1.0`, and the instruction is Node 22 via nvm. Only 20 and 22 are installed, npm does not enforce engines without `engine-strict`, so every command runs under `nvm use 22` and the engines field is left alone.
6. **Indexing the intent page.** The spec does not say. `/intent/<id>` redirects permanently once the project is deployed, so the route carries `robots: { index: false, follow: false }`, matching `/create/recover` and `/create/success`.
7. **Session lifetime after publishing.** The spec says the session records the transport and the id, not when it ends. A published session can never confirm a chain, so `archiveLaunch` accepts it once `intentId` is set, and `FundDeploy` offers "Finish this project and start another"; until then a second project cannot be prepared, which matches the existing one-launch-at-a-time rule.
8. **The IPFS gateway in the browser test.** `JBCENTER_IPFS_GATEWAY` is built from `JBCENTER_DEFAULT_URL`, not from `jbCenterBaseUrl()`, so pinned metadata always loads from `https://juicebox.center/ipfs/`. Changing that is outside this section's scope; `test/intent-browser.mjs` intercepts that URL instead, and the page already degrades to the signed terms when metadata cannot be read.
9. **Branch name.** `feat/fund-intents` already exists in the local checkout, so the worktree branch is `feat/fund-intents-center`.
