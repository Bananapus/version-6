# Homerun Setup Calls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A merchant who wants a new multisig to own their Homerun FUND creates the project without a transaction. The published intent carries, per chain, the Safe creation call followed by the launch call; Juicebox Center's sponsor sends both. The review dialog, the published project page and the account list all name each Safe with its role, threshold and owners.

**Architecture:** `resolveCreateMultisigs` already produces `CreateMultisig` plans with deterministic Safe addresses. `buildFundIntent` stops refusing those plans: for every chain it emits `multisigDeploymentCalls(plans)` (the SDK's `buildSafeDeploymentCalls`) as setup calls, then the `launchFundFor` call whose `owner` is the owner plan's address, and records the plans in `jb.safes`. `decodeFundIntent` reads the envelope back through the SDK's `intentCalls(intent)`, re-encodes every decoded `safe-create` plan and requires it to equal the signed bytes, and requires the Safe `jb.safes` names `owner` to be the launch owner. Eligibility drops its "no new multisig" condition; every other condition stays. Relayr, direct and Safe-connected paths are untouched.

**Tech Stack:** Next.js 16.3.3 (App Router, webpack), React 19.2, wagmi 3.7 / `@wagmi/core` 3.6, viem 2.55, Tailwind v4, `@bananapus/nana-sdk-core` 2.9.0 (`/jbcenter`, `/safe`, `/chains`), vitest 4 (jsdom) for units, Playwright + Chrome for the browser flow, Node 22 via nvm.

**Spec:** `/Users/jango/Documents/jb/v6/evm/docs/superpowers/specs/2026-09-22-intent-setup-calls-safe-owners-design.md`, section **5. Homerun** (this plan implements that section only). Section 1 (Center envelope and publish validation), section 2 (sponsor lane) and section 4 (SDK 2.9.0) ship in parallel and are prerequisites of Task 1.

## Global Constraints

- Worktree: `/Users/jango/Documents/jb/v6/evm/extensions/homerun-setup-calls`, branch `feat/intent-setup-calls`, already branched from `main` at `a07e80f`. Every command in this plan runs from that directory.
- Node 22 via nvm (`source ~/.nvm/nvm.sh && nvm use 22`) for every npm and node command. `package.json` declares `engines.node >= 24.1.0`; npm does not enforce engines without `engine-strict`, and that field is not edited by this work.
- `@bananapus/nana-sdk-core` is pinned to the exact version `"2.9.0"` (no caret) in Task 1, and nothing else starts until that task is green.
- The SDK surface this plan consumes, and nothing else new: `decodeDeploymentCall` flavor `"safe-create"` with `{ flavor, to, singleton, saltNonce, owners, threshold, fallbackHandler, address }`; `intentCalls(intent): Map<number, { setup: DecodedCall[]; launch: DecodedCall }>`; publish-time validation allowing 1 to 4 calls per chain with the launch last. `publishSignedIntent`, `ensureDeployed`, `mergeSearch`, `intentRow`, `intentPath`, `describeCenterRefusal`, `createJBCenterDeploymentCall`, `JBCENTER_SPONSORED_CHAIN_IDS`, `isSponsorable` keep their 2.8.0 behaviour.
- Envelope shape: `deploymentCalls` stays a flat array of `{ chainId, to, data }`. For each chain the last call is the launch; every earlier call is a setup call to the canonical Safe proxy factory. At most 4 calls per chain. Homerun emits at most 2 setup calls per chain (owner, operator), so at most 3.
- `jb.safes` is `[{ role, address, owners, threshold, saltNonce }]` and is present only when the launch creates a Safe. An envelope with no planned multisig is byte-identical to the one this app publishes today.
- `jb` is a display hint and never the source of truth for what is created. The signed calls decide; `jb.safes` only names which created Safe owns the project, and an inconsistent claim makes the intent unreadable.
- Eligibility for the no-transaction path: external wallet (not the `juicebox-center` passkey connector, not a Safe connection per `isSafeConnection`), every selected chain sponsored. A planned multisig is no longer a disqualifier.
- Sponsored chain ids, exactly: `10, 8453, 42161, 11155111, 11155420, 84532, 421614`. Mainnet (`1`) is never sponsored.
- Intent calls carry no `from`. `TransactionReviewProvider` already omits `from` when `kind: 'authorization'`; no call added by this work sets it, and a test asserts that for both the setup call and the launch call.
- The Relayr path, the direct path, the Safe-connected path, `useSafeTx`, `useProjectAdminTx`, `submitReviewedContractWrite` and everything under INCOME are unchanged.
- No new environment variables.
- Never write the word "d‑r‑a‑f‑t" (spelled out) in code, copy, comments, commit messages or the PR. Where an existing identifier contains it, leave that line untouched rather than retyping it.
- No retrospective comments: no comment that narrates the change or the behaviour it replaced. No emoji anywhere.
- Copy in Homerun's plain voice: fixed sentences, no exclamation marks, no marketing adjectives, say what the software does and what it does not do. These exact sentences are used where this plan gives them.
- Tailwind classes match neighbouring components: panels `rounded-md border border-[#c4cdbb] bg-[#fffefa] p-5 sm:p-7`, list rows `grid min-w-0 gap-2 rounded-md border border-[#c4cdbb] bg-[#fffefa] p-4`, buttons `create-primary`, `btn-primary`, `btn-secondary`, `quiet-button`.
- Every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Stage by explicit path, never `git add -A`.
- Repository commands, exactly as `package.json` defines them: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:live`, `npm run build`, `npm run test:intent`, `npm run test:create`, `npm run test:a11y`. Each task ends with `npm run typecheck && npm run test:live` green; Task 5 runs all eight.

---

## File map

Modified:

- `package.json`, `package-lock.json` — the exact `2.9.0` SDK pin.
- `src/lib/create-multisig.ts` — `multisigCreationData`, a widened `multisigReview` parameter.
- `src/lib/fund-intent.ts` — setup calls in the envelope, `jb.safes`, the decode checks, the removed refusal.
- `src/components/LiveCreate.tsx` — eligibility, `prepareIntent`, the reviewed calls and the review copy.
- `src/components/IntentProject.tsx` — the Multisigs section.
- `src/components/AccountProjects.tsx` — owner and publisher search, merged.
- `test/fund-intent.test.ts`, `test/fund-deploy-intent-ui.test.tsx`, `test/intent-project-ui.test.tsx`, `test/account-projects.test.tsx`, `test/intent-browser.mjs`.

Created:

- `scripts/fetch-safe-canonical-code.mjs` — records the canonical Safe 1.4.1 runtime bytecode once, checked against the SDK's pinned hashes.
- `test/fixtures/safe-canonical-code.json` — that recording, served by the modeled Center so the browser flow reaches no network.

Unchanged on purpose: `src/lib/fund-contracts.ts`, `src/lib/fund-launch-session.ts`, `src/lib/fund-launch-relayr.ts`, `src/lib/fund-launch-verification.ts`, `src/lib/contract-write.ts`, `src/components/TransactionReviewProvider.tsx`, `src/components/TransactionReviewDialog.tsx`, `src/hooks/useSafeTx.ts`.

---

### Task 1: SDK 2.9.0, setup calls in the envelope, and the decode checks

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `src/lib/create-multisig.ts`
- Modify: `src/lib/fund-intent.ts`
- Test: `test/fund-intent.test.ts`

**Interfaces:**

- Consumes, from `@bananapus/nana-sdk-core/jbcenter` at 2.9.0:
  ```ts
  intentCalls(intent: JBCenterIntent): Map<number, { setup: JBCenterDecodedLaunch[]; launch: JBCenterDecodedLaunch }>
  // JBCenterDecodedLaunch gains:
  // { flavor: 'safe-create'; to: Address; singleton: Address; saltNonce: Hex; owners: readonly Address[]; threshold: number; fallbackHandler: Address; address: Address }
  createJBCenterDeploymentCall, publishSignedIntent, JBCENTER_SPONSORED_CHAIN_IDS, JBCenterDeploymentCall, JBCenterIntent
  ```
- Consumes, from `@bananapus/nana-sdk-core/safe` (unchanged at 2.9.0):
  ```ts
  buildSafeDeploymentCalls(plans: readonly SafeDeploymentPlan[]): { target: Address; allowFailure: true; value: bigint; callData: Hex }[]
  buildSafeInitializer(policy: { owners: readonly Address[]; threshold: number }): Hex
  SAFE_FACTORY: Address, SAFE_SINGLETON: Address, SAFE_CREATE_ABI
  ```
- Produces:
  ```ts
  // src/lib/create-multisig.ts
  export function multisigCreationData(policy: Pick<CreateMultisig, 'owners' | 'threshold' | 'saltNonce'>): Hex
  export function multisigReview(plans?: readonly Pick<CreateMultisig, 'role' | 'address' | 'owners' | 'threshold'>[]): string

  // src/lib/fund-intent.ts
  export const SAFES_UNREADABLE_MESSAGE: string
  export type FundIntentSafe = { role: 'owner' | 'operator'; address: Address; owners: Address[]; threshold: number; saltNonce: Hex }
  export type FundIntentJb = { /* …unchanged… */ safes?: FundIntentSafe[] }
  export type DecodedFundIntent = { owner: Address; projectUri: string; tokenName: string; ticker: string; mustStartAtOrAfter: number; chainIds: number[]; safes: FundIntentSafe[] }
  export function buildFundIntent(input: FundLaunchInput, name: string): FundIntent   // no longer refuses plans
  export function decodeFundIntent(intent: JBCenterIntent): DecodedFundIntent
  ```
- Removed: `export const MULTISIG_NEEDS_TRANSACTION_MESSAGE` from `src/lib/fund-intent.ts`.

- [ ] **Step 1: Pin the SDK**

```bash
source ~/.nvm/nvm.sh && nvm use 22
cd /Users/jango/Documents/jb/v6/evm/extensions/homerun-setup-calls
npm install --save-exact @bananapus/nana-sdk-core@2.9.0
git diff --stat package.json package-lock.json
```

Expected: `package.json` shows `"@bananapus/nana-sdk-core": "2.9.0"` and only that dependency moved. If npm wants to move `viem` or `wagmi`, stop and report instead of accepting it.

If 2.9.0 is not published yet, link the local package instead and say so in the commit body:

```bash
npm link /Users/jango/Documents/jb/v6/evm/extensions/sdk-setup-calls/packages/core
```

The `package.json` pin to `"2.9.0"` is still written in that case; the link only supplies the bytes until the version is published.

- [ ] **Step 2: Prove the 2.9.0 surface exists**

```bash
node -e "import('@bananapus/nana-sdk-core/jbcenter').then(module => {
  if (typeof module.intentCalls !== 'function') { console.error('intentCalls is missing'); process.exit(1); }
  const factory = '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67';
  const singleton = '0x41675C099F32341bf84BFc5382aF534df5C7461a';
  return import('viem').then(viem => import('@bananapus/nana-sdk-core/safe').then(safe => {
    const data = viem.encodeFunctionData({ abi: safe.SAFE_CREATE_ABI, functionName: 'createProxyWithNonce', args: [singleton, safe.buildSafeInitializer({ owners: ['0x1111111111111111111111111111111111111111','0x2222222222222222222222222222222222222222'], threshold: 2 }), 1n] });
    const decoded = module.decodeDeploymentCall({ chainId: 8453, to: factory, data });
    if (decoded.flavor !== 'safe-create' || !decoded.address || decoded.threshold !== 2) { console.error('safe-create decode is missing', decoded.flavor); process.exit(1); }
    console.log('safe-create and intentCalls ok');
  }));
})"
```

Expected: `safe-create and intentCalls ok`. Anything else means section 4 has not shipped; stop and report.

- [ ] **Step 3: Run the existing gates against the new SDK**

```bash
npm run typecheck && npm run test:live && npm run build
```

Expected: all three pass. Any type error introduced by the pin is fixed here, before new behaviour is written.

- [ ] **Step 4: Write the failing tests**

In `test/fund-intent.test.ts`, replace the whole `mainnet and new multisigs cannot be created without a transaction` test with the tests below, and add the rest after the existing `a call Homerun did not build is refused rather than displayed` test. Add these imports at the top of the file, after the existing viem import:

```ts
import { SAFE_FACTORY, multisigCreationData } from '../src/lib/create-multisig'
import type { CreateMultisig } from '../src/lib/create-multisig'
```

and extend the existing import from `../src/lib/fund-intent` with `SAFES_UNREADABLE_MESSAGE`.

```ts
const signers = ['0x000000000000000000000000000000000000dEaD', '0x2222222222222222222222222222222222222222'] as const
const ownerPlan: CreateMultisig = {
  role: 'owner',
  owners: [...signers] as Address[],
  threshold: 2,
  saltNonce: `0x${'ab'.repeat(32)}` as Hex,
  proxyCreationCode: '0x6000',
  address: '0x0000000000000000000000000000000000000000' as Address,
}
const operatorPlan: CreateMultisig = { ...ownerPlan, role: 'operator', saltNonce: `0x${'cd'.repeat(32)}` as Hex }
const planned = (plan: CreateMultisig) => ({ ...plan, address: predictMultisig(plan) })
const withSafes = (plans: CreateMultisig[]): FundLaunchInput => {
  const resolved = plans.map(planned)
  const owner = resolved.find(plan => plan.role === 'owner')?.address ?? input.owner
  return { ...input, owner, operator: resolved.find(plan => plan.role === 'operator')?.address ?? owner, multisigs: resolved }
}

test('mainnet cannot be created without a transaction, and a nameless project cannot either', () => {
  assert.equal(fundIntentEligibleChains([8453]), true)
  assert.equal(fundIntentEligibleChains([1, 8453]), false)
  assert.equal(fundIntentEligibleChains([]), false)
  assert.equal(fundIntentEligibleChains([8453, 8453]), false)
  assert.throws(() => buildFundIntent({ ...input, chainIds: [1], creationFees: { 1: 0n } }, 'Neighborhood Workshop'), /Optimism, Base, Arbitrum/)
  assert.throws(() => buildFundIntent(input, '   '), /project name/)
})

test('a planned owner Safe is created by the intent, before the launch, on every chain', () => {
  const linked = { ...withSafes([ownerPlan]), chainIds: [10, 8453], mustStartAtOrAfter: 1_800_000_000 }
  const intent = buildFundIntent(linked, 'Neighborhood Workshop')
  assert.equal(intent.deploymentCalls.length, 4)
  assert.deepEqual(intent.deploymentCalls.map(call => call.chainId), [10, 10, 8453, 8453])
  for (const index of [0, 2]) {
    assert.equal(intent.deploymentCalls[index].to, SAFE_FACTORY)
    assert.equal(intent.deploymentCalls[index].data, multisigCreationData(planned(ownerPlan)))
  }
  for (const index of [1, 3]) assert.equal(intent.deploymentCalls[index].to, HOMERUN_DEPLOYER)
  assert.equal(intent.jb.owner, planned(ownerPlan).address)
  assert.deepEqual(intent.jb.safes, [{
    role: 'owner', address: planned(ownerPlan).address, owners: [...signers],
    threshold: 2, saltNonce: ownerPlan.saltNonce,
  }])
})

test('a launch with no planned Safe keeps the single-call envelope and no safes form', () => {
  const intent = buildFundIntent(input, 'Neighborhood Workshop')
  assert.equal(intent.deploymentCalls.length, 1)
  assert.equal(Object.hasOwn(intent.jb, 'safes'), false)
})

test('an owner Safe and an operator Safe are two setup calls, the launch last', () => {
  const intent = buildFundIntent(withSafes([ownerPlan, operatorPlan]), 'Neighborhood Workshop')
  assert.equal(intent.deploymentCalls.length, 3)
  assert.deepEqual(intent.deploymentCalls.map(call => call.to), [SAFE_FACTORY, SAFE_FACTORY, HOMERUN_DEPLOYER])
  assert.deepEqual(intent.jb.safes?.map(safe => safe.role), ['owner', 'operator'])
})

test('the Safes are read back out of the signed setup calls, with their roles', () => {
  const envelope = buildFundIntent(withSafes([ownerPlan, operatorPlan]), 'Neighborhood Workshop')
  const decoded = decodeFundIntent({ envelope } as unknown as JBCenterIntent)
  assert.deepEqual(decoded.chainIds, [8453])
  assert.deepEqual(decoded.safes, [
    { role: 'owner', address: planned(ownerPlan).address, owners: [...signers], threshold: 2, saltNonce: ownerPlan.saltNonce },
    { role: 'operator', address: planned(operatorPlan).address, owners: [...signers], threshold: 2, saltNonce: operatorPlan.saltNonce },
  ])
  assert.equal(decoded.owner, planned(ownerPlan).address)
})

test('an owner Safe that does not own the project makes the intent unreadable', () => {
  const envelope = buildFundIntent(withSafes([ownerPlan]), 'Neighborhood Workshop')
  const foreign = { ...envelope, jb: { ...envelope.jb, safes: [{ ...envelope.jb.safes![0], role: 'owner' as const, address: owner }] } }
  assert.throws(() => decodeFundIntent({ envelope: foreign } as unknown as JBCenterIntent), new RegExp(SAFES_UNREADABLE_MESSAGE))
})

test('a setup call whose bytes do not create the Safe it decodes to is refused', () => {
  const envelope = buildFundIntent(withSafes([ownerPlan]), 'Neighborhood Workshop')
  const tampered = {
    ...envelope,
    deploymentCalls: [
      { ...envelope.deploymentCalls[0], data: multisigCreationData({ ...planned(ownerPlan), threshold: 1 }) },
      envelope.deploymentCalls[1],
    ],
  }
  assert.throws(() => decodeFundIntent({ envelope: tampered } as unknown as JBCenterIntent), new RegExp(SAFES_UNREADABLE_MESSAGE))
})

test('a jb form that hides or invents a Safe is refused', () => {
  const envelope = buildFundIntent(withSafes([ownerPlan]), 'Neighborhood Workshop')
  const hidden = { ...envelope, jb: { ...envelope.jb, safes: [] } }
  assert.throws(() => decodeFundIntent({ envelope: hidden } as unknown as JBCenterIntent), new RegExp(SAFES_UNREADABLE_MESSAGE))
  const plain = buildFundIntent(input, 'Neighborhood Workshop')
  const invented = { ...plain, jb: { ...plain.jb, safes: [{ role: 'owner' as const, address: owner, owners: [...signers], threshold: 2, saltNonce: ownerPlan.saltNonce }] } }
  assert.throws(() => decodeFundIntent({ envelope: invented } as unknown as JBCenterIntent), new RegExp(SAFES_UNREADABLE_MESSAGE))
})
```

Also add `predictMultisig` to the `../src/lib/create-multisig` import, add `type Address` to the viem type import, and update the existing `the FUND terms are read back out of the signed calls` expectation to include `safes: []`:

```ts
  assert.deepEqual(decoded, {
    owner, projectUri, tokenName: 'House FUND', ticker: 'HOUSE',
    mustStartAtOrAfter: 1_800_000_000, chainIds: [10, 8453], safes: [],
  })
```

```bash
npx vitest run test/fund-intent.test.ts
```

Expected: fails. `MULTISIG_NEEDS_TRANSACTION_MESSAGE` still refuses plans, `multisigCreationData` and `SAFES_UNREADABLE_MESSAGE` do not exist.

- [ ] **Step 5: Add the shared creation calldata and widen the review wording**

In `src/lib/create-multisig.ts`, extend the viem import with `encodeFunctionData`, extend the SDK value import with `SAFE_CREATE_ABI` and `SAFE_SINGLETON`, and add:

```ts
/** The exact `createProxyWithNonce` calldata a policy's Safe is created by. */
export function multisigCreationData(policy: Pick<CreateMultisig, 'owners' | 'threshold' | 'saltNonce'>): Hex {
  if (!/^0x[\da-f]{64}$/i.test(policy.saltNonce)) throw new Error('Invalid Safe deployment salt.')
  return encodeFunctionData({
    abi: SAFE_CREATE_ABI,
    functionName: 'createProxyWithNonce',
    args: [SAFE_SINGLETON, multisigInitializer(policy), BigInt(policy.saltNonce)],
  })
}
```

Change `multisigReview`'s parameter so a decoded Safe can be worded the same way, leaving its body exactly as it is:

```ts
export function multisigReview(plans: readonly Pick<CreateMultisig, 'role' | 'address' | 'owners' | 'threshold'>[] = []): string {
```

- [ ] **Step 6: Build the setup calls and check them on the way back**

In `src/lib/fund-intent.ts`, replace the imports and the three affected functions.

Imports:

```ts
import {
  JBCENTER_SPONSORED_CHAIN_IDS,
  createJBCenterDeploymentCall,
  intentCalls,
  publishSignedIntent,
  type JBCenterClient,
  type JBCenterDecodedLaunch,
  type JBCenterDeploymentCall,
  type JBCenterDeploymentInput,
  type JBCenterIntent,
  type JBCenterRequestOptions,
} from '@bananapus/nana-sdk-core/jbcenter'
import { getAddress, isAddress, isAddressEqual, type Address, type Hex } from 'viem'
import { buildFundLaunch, type FundLaunchInput, type FundTransaction } from './fund-contracts'
import { SAFE_FACTORY, multisigCreationData, multisigDeploymentCalls, type CreateMultisig } from './create-multisig'
```

Remove the `MULTISIG_NEEDS_TRANSACTION_MESSAGE` constant and add, beside `UNSPONSORED_CHAINS_MESSAGE`:

```ts
export const SAFES_UNREADABLE_MESSAGE =
  'This project’s multisig creations do not match the project they create.'
```

Types:

```ts
export type FundIntentSafe = {
  role: 'owner' | 'operator'
  address: Address
  owners: Address[]
  threshold: number
  saltNonce: Hex
}

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
  safes?: FundIntentSafe[]
}
```

`buildFundIntent`:

```ts
export function buildFundIntent(input: FundLaunchInput, name: string): FundIntent {
  const { requests, review } = buildFundLaunch(input)
  const chainIds = requests.map(request => request.chainId)
  if (!fundIntentEligibleChains(chainIds)) throw new Error(UNSPONSORED_CHAINS_MESSAGE)
  const projectName = name.trim()
  if (!projectName || projectName.length > 160) throw new Error('A project name of 160 characters or fewer is required.')
  const plans = input.multisigs ?? []
  // A Safe's address depends only on its plan, so the setup calls and the launch land in any order.
  const setup = multisigDeploymentCalls(plans)
  const safes: FundIntentSafe[] = plans.map(plan => ({
    role: plan.role, address: plan.address, owners: [...plan.owners],
    threshold: plan.threshold, saltNonce: plan.saltNonce,
  }))
  return {
    format: FUND_INTENT_FORMAT,
    deploymentVersion: '6',
    chainIds,
    deploymentCalls: requests.flatMap(request => [
      ...setup.map(call => ({ chainId: request.chainId, to: call.target, data: call.callData })),
      deploymentCall(request),
    ]),
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
      ...(safes.length ? { safes } : {}),
    },
  }
}
```

`DecodedFundIntent` and `decodeFundIntent`:

```ts
export type DecodedFundIntent = {
  owner: Address
  projectUri: string
  tokenName: string
  ticker: string
  mustStartAtOrAfter: number
  chainIds: number[]
  safes: FundIntentSafe[]
}

type UnnamedSafe = Omit<FundIntentSafe, 'role'>

/**
 * A setup call is readable only when re-encoding the plan the SDK decoded out of
 * it reproduces the signed bytes. The SDK derives the Safe address from those
 * same owners, threshold and salt, so equal bytes mean the call creates exactly
 * the address it reports.
 */
function readSafes(setup: readonly JBCenterDecodedLaunch[], raw: readonly JBCenterDeploymentCall[]): UnnamedSafe[] {
  return setup.map((call, index) => {
    if (call.flavor !== 'safe-create') throw new Error('This project was not created by Homerun.')
    const safe: UnnamedSafe = {
      address: getAddress(call.address),
      owners: call.owners.map(owner => getAddress(owner)),
      threshold: call.threshold,
      saltNonce: call.saltNonce,
    }
    if (!isAddressEqual(raw[index].to, SAFE_FACTORY) || raw[index].data !== multisigCreationData(safe)) {
      throw new Error(SAFES_UNREADABLE_MESSAGE)
    }
    return safe
  })
}

/** The calls say which Safes are created; `jb.safes` only says which one owns the project. */
function namedSafes(safes: readonly UnnamedSafe[], jb: Partial<FundIntentJb>, owner: Address): FundIntentSafe[] {
  const claimed = jb.safes
  if (safes.length === 0) {
    if (claimed !== undefined && (!Array.isArray(claimed) || claimed.length > 0)) throw new Error(SAFES_UNREADABLE_MESSAGE)
    return []
  }
  if (!Array.isArray(claimed) || claimed.length !== safes.length
    || new Set(claimed.map(safe => safe?.role)).size !== claimed.length) throw new Error(SAFES_UNREADABLE_MESSAGE)
  return safes.map(safe => {
    const match = claimed.find(entry => typeof entry?.address === 'string' && isAddress(entry.address)
      && isAddressEqual(entry.address, safe.address))
    if (!match
      || (match.role !== 'owner' && match.role !== 'operator')
      || match.threshold !== safe.threshold
      || match.saltNonce !== safe.saltNonce
      || !Array.isArray(match.owners) || match.owners.length !== safe.owners.length
      || match.owners.some((entry, index) => typeof entry !== 'string' || !isAddress(entry) || !isAddressEqual(entry, safe.owners[index]))
      || (match.role === 'owner' && !isAddressEqual(safe.address, owner))) throw new Error(SAFES_UNREADABLE_MESSAGE)
    return { role: match.role, ...safe }
  })
}

/** The signed calls are the project. The `jb` form is a display hint, never the source. */
export function decodeFundIntent(intent: JBCenterIntent): DecodedFundIntent {
  const calls = intent.envelope.deploymentCalls
  if (!calls.length) throw new Error('This project has no deployment calls.')
  let grouped: Map<number, { setup: JBCenterDecodedLaunch[]; launch: JBCenterDecodedLaunch }>
  try { grouped = intentCalls(intent) } catch { throw new Error('This project’s deployment calls could not be read.') }
  const raw = new Map<number, JBCenterDeploymentCall[]>()
  for (const call of calls) raw.set(call.chainId, [...(raw.get(call.chainId) ?? []), call])
  const chainIds = [...grouped.keys()]
  const chains = chainIds.map(chainId => {
    const { setup, launch } = grouped.get(chainId)!
    if (launch.flavor !== 'homerun-fund') throw new Error('This project was not created by Homerun.')
    return { launch, safes: readSafes(setup, raw.get(chainId)!.slice(0, setup.length)) }
  })
  const [first] = chains
  const start = Number(first.launch.mustStartAtOrAfter)
  if (chains.some(chain => chain.launch.flavor !== 'homerun-fund'
    || first.launch.flavor !== 'homerun-fund'
    || !isAddressEqual(chain.launch.owner, first.launch.owner)
    || chain.launch.projectUri !== first.launch.projectUri
    || chain.launch.tokenName !== first.launch.tokenName
    || chain.launch.ticker !== first.launch.ticker
    || Number(chain.launch.mustStartAtOrAfter) !== start
    || JSON.stringify(chain.safes) !== JSON.stringify(first.safes))) {
    throw new Error('This project’s chains do not share the same FUND terms.')
  }
  const owner = getAddress(first.launch.owner)
  return {
    owner,
    projectUri: first.launch.projectUri,
    tokenName: first.launch.tokenName,
    ticker: first.launch.ticker,
    mustStartAtOrAfter: start,
    chainIds,
    safes: namedSafes(first.safes, intent.envelope.jb as Partial<FundIntentJb>, owner),
  }
}
```

- [ ] **Step 7: Run**

```bash
npx vitest run test/fund-intent.test.ts test/create-multisig.test.ts test/fund-contracts.test.ts && npm run typecheck && npm run lint
```

Expected: every test passes, `tsc --noEmit` is clean, eslint reports no warnings. `LiveCreate.tsx` still imports `MULTISIG_NEEDS_TRANSACTION_MESSAGE`, which now fails typecheck — fix that in this step by deleting the import specifier and the `if (resolved.plans.length) throw …` line at `prepareIntent`; Task 2 does the rest of that file.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/lib/create-multisig.ts src/lib/fund-intent.ts src/components/LiveCreate.tsx test/fund-intent.test.ts
git commit -m "$(cat <<'EOF'
Create a project's multisigs from the intent that launches it

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Offer the no-transaction path with a planned multisig, and review it

**Files:**
- Modify: `src/components/LiveCreate.tsx`
- Test: `test/fund-deploy-intent-ui.test.tsx`

**Interfaces:**
- Consumes: `buildFundIntent`, `multisigReview`, `multisigCreationData`, `SAFE_FACTORY`, `SAFE_SINGLETON`, `SAFE_CREATE_ABI`, `requireTransactionReview`.
- Produces: no new export. `intentEligible` drops its multisig condition; `prepareIntent` reviews the setup calls beside the launch call and words the Safes with `multisigReview`.

- [ ] **Step 1: Write the failing test**

In `test/fund-deploy-intent-ui.test.tsx`, add the Safe module mock beneath the existing mocks (the SDK's own bytecode checks are covered by the SDK's tests; this fixture isolates the component's boundary):

```tsx
vi.mock('@bananapus/nana-sdk-core/safe', async original => {
  const sdk = await original<typeof import('@bananapus/nana-sdk-core/safe')>()
  return { ...sdk, resolveSafeAddress: vi.fn(async (input: Parameters<typeof sdk.resolveSafeAddress>[0]) => {
    if (input.kind === 'existing') return sdk.resolveSafeAddress(input, [])
    const policy = { owners: input.owners, threshold: input.threshold, saltNonce: input.saltNonce, proxyCreationCode: '0x6000' as Hex }
    return { address: sdk.predictSafeAddress(policy), plan: { ...policy, address: sdk.predictSafeAddress(policy) } }
  }) }
})
```

Extend the `@wagmi/core` mock's public client with `getCode`:

```tsx
  getPublicClient: () => ({ readContract: runtime.readContract, getBlock: runtime.getBlock, getCode: runtime.getCode }),
```

Add `getCode: vi.fn()` to the hoisted `runtime` object and `runtime.getCode.mockReset().mockResolvedValue('0x6000')` to `beforeEach`.

Replace the test named `keeps the transaction path alone for mainnet, a Safe, a Center wallet, or a new multisig` with:

```tsx
  const signers = [`0x${'1'.repeat(40)}`, `0x${'2'.repeat(40)}`]

  it('keeps the transaction path alone for mainnet, a Safe and a Center wallet', async () => {
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
  })

  it('offers the no-transaction path when a new multisig is planned', async () => {
    runtime.centerWallet = false
    await render({ ownerMode: 'create', ownerSigners: signers, ownerThreshold: 2 })
    expect(button('Create without a transaction')).toBeTruthy()
  })

  it('reviews the Safe creation before the launch, and publishes both', async () => {
    await render({ ownerMode: 'create', ownerSigners: signers, ownerThreshold: 2 })
    await act(async () => button('Create without a transaction')!.click())
    const review = runtime.review.mock.calls[0][0]
    expect(review.kind).toBe('authorization')
    expect(review.calls).toHaveLength(2)
    expect(review.calls[0].functionName).toBe('createProxyWithNonce')
    expect(review.calls[0].contractName).toBe('SafeProxyFactory')
    expect(review.calls[0].label).toContain('Owner multisig')
    expect(review.calls[0].from).toBeUndefined()
    expect(review.calls[1].functionName).toBe('launchFundFor')
    expect(review.calls[1].from).toBeUndefined()
    expect(review.description).toContain('2/2 approvals')
    const envelope = runtime.publishIntent.mock.calls[0][0]
    expect(envelope.deploymentCalls).toHaveLength(2)
    expect(envelope.jb.safes).toHaveLength(1)
    expect(envelope.jb.safes[0].role).toBe('owner')
    expect(envelope.jb.safes[0].threshold).toBe(2)
    expect(envelope.jb.owner).toBe(envelope.jb.safes[0].address)
    expect(navigate.push).toHaveBeenCalledWith(`/intent/${intentId}`)
  })
```

```bash
npx vitest run test/fund-deploy-intent-ui.test.tsx
```

Expected: fails. Eligibility still excludes a planned multisig and the review still attaches the launch abi to every call.

- [ ] **Step 2: Open eligibility**

In `src/components/LiveCreate.tsx`, replace the comment and the two eligibility lines (currently at 198–205) with:

```tsx
  // Juicebox Center recovers the publisher from the signature, so only an external
  // wallet can publish: a passkey or Safe connection is refused. Mainnet is never
  // sponsored. A planned multisig travels with the intent as its own setup call.
  // `loaded` keeps this first client render equal to the server's.
  const safeConnected = loaded && isSafeConnection(wagmiConfig)
  const intentEligible = !!address && !isCenterWallet && !safeConnected
    && fundIntentEligibleChains(selectionKey ? selectionKey.split(',').map(Number) : [])
```

- [ ] **Step 3: Review the setup calls in Homerun's words**

Add to the imports in `src/components/LiveCreate.tsx`:

```tsx
import { SAFE_CREATE_ABI, SAFE_FACTORY, SAFE_SINGLETON, multisigCreationData, multisigInitializer, multisigReview } from '@/lib/create-multisig'
```

(the file already imports `multisigReview` and other helpers from that module; merge the specifiers rather than adding a second import.)

In `prepareIntent`, replace the `await requireTransactionReview({ … })` block with:

```tsx
      const plans = resolved.plans
      await requireTransactionReview({
        kind: 'authorization',
        title: 'Create your project',
        description: plans.length
          ? `Your signature publishes these exact creations to Juicebox Center. Center’s sponsor creates your multisigs and then the project on every selected chain the first time it is used. You send no transaction and pay no creation fee here.\n${multisigReview(plans)}`
          : 'Your signature publishes these exact project creations to Juicebox Center. Center’s sponsor sends them on every selected chain the first time the project is used. You send no transaction and pay no creation fee here.',
        confirmLabel: 'Continue to wallet',
        calls: intent.deploymentCalls.map(call => {
          // Center's sponsor is the sender of every one of these calls, and
          // HomerunDeployer scopes its salt to that sender, so no `from` is shown.
          const plan = plans.find(item => call.data === multisigCreationData(item))
          if (plan) return {
            chainId: call.chainId, to: call.to, data: call.data,
            abi: SAFE_CREATE_ABI, functionName: 'createProxyWithNonce',
            args: [SAFE_SINGLETON, multisigInitializer(plan), BigInt(plan.saltNonce)],
            label: `Center’s sponsor creates the ${plan.role === 'owner' ? 'Owner' : 'Operator'} multisig on ${displayChainName(call.chainId)}`,
            contractName: 'SafeProxyFactory',
          }
          const request = built.requests.find(item => item.chainId === call.chainId)
          if (!request || !isAddressEqual(call.to, request.address)) throw new Error('The reviewed calls do not match the launch plan.')
          return {
            chainId: call.chainId, to: call.to, data: call.data,
            abi: request.abi, functionName: request.functionName, args: request.args,
            label: `Center’s sponsor creates the FUND on ${displayChainName(call.chainId)}`, contractName: 'HomerunDeployer',
          }
        }),
        // Center takes a plain signed message, not typed data, so the review
        // reads the envelope that message commits to.
        authorization: { kind: 'message', type: 'Juicebox Center project intent', format: intent.format, deploymentVersion: intent.deploymentVersion, chainIds: intent.chainIds, jb: intent.jb },
      })
```

Add `isAddressEqual` to the viem import in that file. `SAFE_FACTORY` is imported for the assertion in Step 1's sibling tests and by `multisigCreationData`'s callers; if eslint reports it unused, drop that specifier.

- [ ] **Step 4: Run**

```bash
npx vitest run test/fund-deploy-intent-ui.test.tsx test/fund-intent.test.ts && npm run typecheck && npm run lint
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/components/LiveCreate.tsx test/fund-deploy-intent-ui.test.tsx
git commit -m "$(cat <<'EOF'
Offer the no-transaction path when the project creates its own multisigs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The published project page and the account list

**Files:**
- Modify: `src/components/IntentProject.tsx`
- Modify: `src/components/AccountProjects.tsx`
- Test: `test/intent-project-ui.test.tsx`, `test/account-projects.test.tsx`

**Interfaces:**
- Consumes: `decodeFundIntent(intent).safes`, `multisigReview`, `jbCenterClient.searchIntents({ owner })` and `searchIntents({ publisher })`.
- Produces: no new export.

- [ ] **Step 1: Write the failing tests**

In `test/intent-project-ui.test.tsx`, add above `describe`:

```tsx
import { SAFE_FACTORY, multisigCreationData, predictMultisig } from '../src/lib/create-multisig'

const safeOwners = ['0x000000000000000000000000000000000000dEaD', '0x2222222222222222222222222222222222222222'] as const
const safePolicy = { owners: [...safeOwners] as `0x${string}`[], threshold: 2, saltNonce: `0x${'ab'.repeat(32)}` as Hex, proxyCreationCode: '0x6000' as Hex }
const safeAddress = predictMultisig(safePolicy)
const setupCall = (chainId: number) => ({ chainId, to: SAFE_FACTORY, data: multisigCreationData(safePolicy) })
```

and a test inside the describe:

```tsx
  it('names every multisig the project creates, with its role, approvals and owners', async () => {
    const launch = {
      chainId: 8453, to: HOMERUN_DEPLOYER,
      data: encodeFunctionData({
        abi: homerunDeployerAbi, functionName: 'launchFundFor',
        args: [safeAddress, 'ipfs://bafkreimetadata', 'Neighborhood Workshop FUND', 'FUND', 0, zeroHash, []],
      }),
    }
    runtime.getIntent.mockResolvedValue(intent({
      envelope: {
        ...intent().envelope,
        deploymentCalls: [setupCall(8453), launch],
        jb: {
          ...intent().envelope.jb, owner: safeAddress,
          safes: [{ role: 'owner', address: safeAddress, owners: [...safeOwners], threshold: 2, saltNonce: safePolicy.saltNonce }],
        },
      },
    }))
    await render()
    expect(host.textContent).toContain('Owner: create Safe')
    expect(host.textContent).toContain('2/2 approvals')
    expect(host.textContent).toContain(safeOwners[0])
    expect(host.textContent).toContain(safeOwners[1])
  })
```

Note: the SDK's `predictSafeAddress` is real here; `proxyCreationCode: '0x6000'` only fixes the address this fixture predicts, and `multisigCreationData` never reads it.

In `test/account-projects.test.tsx`, add:

```tsx
  it('shows a published project whose owner is a multisig, because this account published it', async () => {
    mocks.wallet = { address: ACCOUNT_A, isConnected: true }
    mocks.intents.mockImplementation(async (params: { owner?: string; publisher?: string }) => ({
      items: params.publisher ? [intentItem({ owner: ACCOUNT_B, name: 'Multisig Workshop' })] : [],
      totalCount: params.publisher ? 1 : 0, nextCursor: null,
    }))
    await render()
    expect(mocks.intents).toHaveBeenCalledWith({ owner: ACCOUNT_A, limit: 24 })
    expect(mocks.intents).toHaveBeenCalledWith({ publisher: ACCOUNT_A, limit: 24 })
    expect(host.textContent).toContain('Multisig Workshop')
  })

  it('lists a project once when this account both owns and published it', async () => {
    mocks.wallet = { address: ACCOUNT_A, isConnected: true }
    mocks.intents.mockResolvedValue({ items: [intentItem()], totalCount: 1, nextCursor: null })
    await render()
    expect([...host.querySelectorAll('a[href^="/intent/"]')]).toHaveLength(1)
  })
```

(use the file's own `render` helper for the account dashboard; match the existing tests' setup for `mocks.wallet`.)

```bash
npx vitest run test/intent-project-ui.test.tsx test/account-projects.test.tsx
```

Expected: both new tests fail.

- [ ] **Step 2: List the Safes on the published project page**

In `src/components/IntentProject.tsx`, add to the imports:

```tsx
import { multisigReview } from '@/lib/create-multisig'
```

and insert this section immediately after the `isSponsorable(...)` block and before the `About` section:

```tsx
    {terms.safes.length > 0 && <section className="rounded-md border border-[#c4cdbb] bg-[#fffefa] p-5 sm:p-7">
      <h2 className="mb-5 text-3xl">Multisigs</h2>
      <p>Juicebox Center’s sponsor creates these Safes on {terms.chainIds.map(displayChainName).join(', ')} before it creates the project. Each address is fixed by its owners, its approval policy and its salt, so it is the same on every network.</p>
      <p className="mt-5 whitespace-pre-line break-all text-sm">{multisigReview(terms.safes)}</p>
    </section>}
```

- [ ] **Step 3: Search owner and publisher, and merge**

In `src/components/AccountProjects.tsx`, add above `AccountProjectSections`:

```tsx
/** A project this account published is theirs to see even when a multisig owns it. */
async function accountIntents(account: string): Promise<JBCenterSearchPage> {
  const [owned, published] = await Promise.all([
    jbCenterClient.searchIntents({ owner: account as Address, limit: PAGE_SIZE }),
    jbCenterClient.searchIntents({ publisher: account as Address, limit: PAGE_SIZE }),
  ])
  const items: JBCenterSearchItem[] = []
  const seen = new Set<string>()
  for (const item of [...owned.items, ...published.items]) {
    if (seen.has(item.intentId)) continue
    seen.add(item.intentId)
    items.push(item)
  }
  return { items, totalCount: items.length, nextCursor: null }
}
```

Replace the `intents` query's `queryFn` and the owned filter:

```tsx
    queryFn: () => accountIntents(account),
```

```tsx
  const publishedOwned = intentItems(intents.data, network)
```

The `owner`-side filter is dropped because the query itself is already scoped to this account as owner or publisher; keeping it would hide exactly the multisig-owned projects this task adds.

- [ ] **Step 4: Run**

```bash
npx vitest run test/intent-project-ui.test.tsx test/account-projects.test.tsx test/account-view.test.tsx && npm run typecheck && npm run lint
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/components/IntentProject.tsx src/components/AccountProjects.tsx test/intent-project-ui.test.tsx test/account-projects.test.tsx
git commit -m "$(cat <<'EOF'
Name a published project's multisigs, and list what this account published

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The browser flow with a planned 2-of-2 owner Safe

**Files:**
- Create: `scripts/fetch-safe-canonical-code.mjs`
- Create: `test/fixtures/safe-canonical-code.json`
- Modify: `test/intent-browser.mjs`

**Interfaces:**
- Consumes: the real Next.js application, the packaged SDK, the modeled Center and the injected test wallet already in `test/intent-browser.mjs`.
- Produces: `npm run test:intent` covering a published FUND whose owner is a Safe the same intent creates.

**Why the fixture exists:** `resolveCreateMultisigs` calls the SDK's `readSafeCreationCode`, which requires the canonical Safe 1.4.1 factory, singleton and fallback handler to be present with their pinned runtime code hashes, and then reads `proxyCreationCode()` from the factory. The modeled Center cannot invent bytes whose keccak matches. The fixture is recorded once from a public RPC and verified at record time; after that, `npm run test:intent` reaches no network but the modeled Center.

- [ ] **Step 1: Write the failing test**

In `test/intent-browser.mjs`, change the owner lines of the saved create record from:

```js
      ownerMode: 'existing', ownerWallet: account.address, ownerIsOperator: true,
```

to:

```js
      ownerMode: 'create', ownerSigners: [account.address, SECOND_SIGNER], ownerThreshold: 2, ownerIsOperator: true,
```

Add beside the other constants at the top:

```js
// A second well-known test address. It holds nothing and signs nothing here.
const SECOND_SIGNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
```

Add after the existing review-dialog interaction:

```js
  await review.getByText('2/2 approvals', { exact: false }).first().waitFor()
```

(place it before `review.getByRole('checkbox').check()`.)

Add after the `/intent/${intentId}` assertions:

```js
  const page_text = await page.locator('main').textContent()
  assert.match(page_text, /Owner: create Safe/)
  assert.match(page_text, /2\/2 approvals/)
  assert.match(page_text, new RegExp(SECOND_SIGNER, 'i'))
```

Replace the envelope assertions with:

```js
  assert.equal(stored.envelope.deploymentCalls.length, 2)
  assert.equal(getAddress(stored.envelope.deploymentCalls[0].to), SAFE_FACTORY)
  assert.equal(stored.envelope.deploymentCalls[0].chainId, 8453)
  assert.equal(stored.envelope.deploymentCalls[1].chainId, 8453)
  assert.equal(Object.hasOwn(stored.envelope.deploymentCalls[1], 'value'), false)
  assert.equal(stored.envelope.jb.safes.length, 1)
  assert.equal(stored.envelope.jb.safes[0].role, 'owner')
  assert.equal(stored.envelope.jb.safes[0].threshold, 2)
  assert.deepEqual(
    stored.envelope.jb.safes[0].owners.map(owner => owner.toLowerCase()),
    [account.address.toLowerCase(), SECOND_SIGNER.toLowerCase()],
  )
  assert.equal(stored.envelope.jb.owner, stored.envelope.jb.safes[0].address)
```

and keep the existing `format`, `deploymentVersion`, `chainIds`, `jb.app`, `jb.kind`, `jb.projectUri`, `publisher` and `signature` assertions, deleting only the `jb.owner` line that compared against the wallet.

```bash
npm run test:intent
```

Expected: fails, because the modeled Center answers `eth_getCode` with `0x60006000` and the SDK refuses to treat that as the canonical Safe 1.4.1 factory.

- [ ] **Step 2: Record the canonical Safe bytecode**

Create `scripts/fetch-safe-canonical-code.mjs`:

```js
/**
 * Records the canonical Safe 1.4.1 runtime bytecode and proxy creation code that
 * `test/intent-browser.mjs` serves from its modeled Center. The SDK checks the same
 * hashes at test time, so a recording that drifts cannot pass unnoticed.
 *
 * Usage: node scripts/fetch-safe-canonical-code.mjs [--rpc <url>]
 */
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createPublicClient, http, keccak256 } from 'viem'
import { base } from '@bananapus/nana-sdk-core/chains'
import { SAFE_CREATE_ABI, SAFE_FACTORY, SAFE_FALLBACK, SAFE_SINGLETON } from '@bananapus/nana-sdk-core/safe'

const HASHES = {
  [SAFE_FACTORY]: '0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317',
  [SAFE_SINGLETON]: '0x1fe2df852ba3299d6534ef416eefa406e56ced995bca886ab7a553e6d0c5e1c4',
  [SAFE_FALLBACK]: '0x7c6007a5d711cea8dfd5d91f5940ec29c7f200fe511eb1fc1397b367af3c42f9',
}
const flag = process.argv.indexOf('--rpc')
const url = flag > 0 ? process.argv[flag + 1] : process.env.SAFE_CODE_RPC_URL || 'https://mainnet.base.org'
const client = createPublicClient({ chain: base, transport: http(url) })

const code = {}
for (const [address, hash] of Object.entries(HASHES)) {
  const runtime = await client.getCode({ address })
  if (!runtime || keccak256(runtime) !== hash) {
    throw new Error(`The code at ${address} is not the canonical Safe 1.4.1 contract on ${url}.`)
  }
  code[address] = runtime
}
const proxyCreationCode = await client.readContract({
  address: SAFE_FACTORY, abi: SAFE_CREATE_ABI, functionName: 'proxyCreationCode',
})
if (!/^0x(?:[\da-f]{2}){1,2048}$/i.test(proxyCreationCode)) throw new Error('The factory returned invalid proxy creation code.')

const target = fileURLToPath(new URL('../test/fixtures/safe-canonical-code.json', import.meta.url))
await writeFile(target, `${JSON.stringify({ code, proxyCreationCode }, null, 2)}\n`)
console.log(`Recorded ${Object.keys(code).length} canonical Safe contracts and ${(proxyCreationCode.length - 2) / 2} bytes of proxy creation code.`)
```

Run it once:

```bash
node scripts/fetch-safe-canonical-code.mjs
```

Expected: `Recorded 3 canonical Safe contracts and <n> bytes of proxy creation code.` and a new `test/fixtures/safe-canonical-code.json`. If the default RPC is unreachable, pass another with `--rpc`. This is the only step in this plan that touches a network.

- [ ] **Step 3: Serve it from the modeled Center**

In `test/intent-browser.mjs`, extend the viem import and add the SDK and fixture imports:

```js
import { decodeFunctionData, encodeFunctionData, encodeFunctionResult, getAddress, multicall3Abi } from 'viem'
import { SAFE_CREATE_ABI, SAFE_FACTORY } from '@bananapus/nana-sdk-core/safe'
import safeCode from './fixtures/safe-canonical-code.json' with { type: 'json' }
```

Add beside `AGGREGATE3_SELECTOR`:

```js
const PROXY_CREATION_CODE_DATA = encodeFunctionData({ abi: SAFE_CREATE_ABI, functionName: 'proxyCreationCode' })
const CANONICAL_CODE = Object.fromEntries(Object.entries(safeCode.code).map(([address, code]) => [getAddress(address), code]))
/** Every read this flow makes wants one positive number, except the Safe factory's own
 *  creation code, which fixes the address of the Safe this envelope creates. */
const answerCall = (to, data) => to && getAddress(to) === SAFE_FACTORY && data === PROXY_CREATION_CODE_DATA
  ? encodeFunctionResult({ abi: SAFE_CREATE_ABI, functionName: 'proxyCreationCode', result: safeCode.proxyCreationCode })
  : uint256(10n ** 18n)
```

Replace the `eth_getCode` and `eth_call` branches of `answer` with:

```js
        if (call.method === 'eth_getCode') {
          const address = call.params?.[0]
          return address ? CANONICAL_CODE[getAddress(address)] ?? '0x60006000' : '0x60006000'
        }
        if (call.method === 'eth_call') {
          const { to, data = '0x' } = call.params?.[0] ?? {}
          if (!data.startsWith(AGGREGATE3_SELECTOR)) return answerCall(to, data)
          const [batched] = decodeFunctionData({ abi: multicall3Abi, data }).args
          return encodeFunctionResult({
            abi: multicall3Abi, functionName: 'aggregate3',
            result: batched.map(item => ({ success: true, returnData: answerCall(item.target, item.callData) })),
          })
        }
```

(delete the two comment lines that described the old single-answer behaviour; they no longer describe the code.)

Extend the run summary written at the end:

```js
    intentId, deployRequests, intentReads, pageErrors: errors,
    safes: stored.envelope.jb.safes,
```

and the final line:

```js
  console.log('PASS Homerun: published a FUND that creates its 2-of-2 owner multisig, deployed it through Center, opened the created project')
```

- [ ] **Step 4: Run**

```bash
npm run test:intent
```

Expected: `PASS Homerun: published a FUND that creates its 2-of-2 owner multisig, deployed it through Center, opened the created project`, `test-results/intent/summary.json` records one Safe with `role: "owner"` and `threshold: 2`, and `pageErrors` is empty. If the review dialog never shows `2/2 approvals`, read `test-results/intent/summary.json` and the dev-server output before changing anything: the usual cause is the record being rejected by `create-model` validation, which leaves the page on an earlier step.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-safe-canonical-code.mjs test/fixtures/safe-canonical-code.json test/intent-browser.mjs
git commit -m "$(cat <<'EOF'
Publish a FUND that creates its own 2-of-2 owner multisig, end to end

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Full gate and the pull request

**Files:** none changed except fixes the gates demand.

- [ ] **Step 1: Every repository gate**

```bash
npm run lint && npm run typecheck && npm test && npm run test:live && npm run build && npm run test:intent && npm run test:create && npm run test:a11y
```

Expected: all eight pass. Fix anything that fails in place and amend the task commit it belongs to; do not add a follow-up commit that repairs an earlier task.

- [ ] **Step 2: Confirm the untouched paths really are untouched**

```bash
git diff --stat main...HEAD
```

Expected: the only changed files are the ones in the File map. `src/lib/fund-launch-relayr.ts`, `src/lib/fund-launch-session.ts`, `src/lib/fund-contracts.ts`, `src/hooks/useSafeTx.ts` and everything under INCOME must not appear.

- [ ] **Step 3: Confirm the forbidden word and emoji rules**

```bash
git diff main...HEAD -- src scripts test | grep -nEi 'd''raft' ; git diff main...HEAD | grep -nP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]'
```

Expected: no output from either command. A hit in an untouched context line is acceptable only if the line is unchanged; a hit on a `+` line must be removed.

- [ ] **Step 4: Live check**

Publish a two-chain testnet FUND with a new 2-of-2 owner Safe on dev Center (Base Sepolia and Optimism Sepolia), deploy it, and confirm on both explorers that the Safe exists at the predicted address and owns the project. Repeat once on production (Base and Optimism). Record the intent ids, Safe address, chain ids and project ids.

- [ ] **Step 5: Open the pull request**

```bash
git push -u origin feat/intent-setup-calls
gh pr create --repo mejango/homerun --title "Create a project's multisigs from the intent that launches it" --body "$(cat <<'EOF'
A merchant who wants a new multisig to own their FUND can now create the project without a transaction. Each chain's intent carries the Safe creation call and then the launch call, and Juicebox Center's sponsor sends both.

- `buildFundIntent` emits `buildSafeDeploymentCalls(plans)` before the `launchFundFor` call and records the plans in `jb.safes`.
- `decodeFundIntent` re-encodes every decoded Safe plan and requires it to equal the signed bytes, and requires the Safe named `owner` to be the launch owner. Anything else is shown as unreadable.
- Eligibility no longer excludes a planned multisig. The external-wallet and sponsored-chain rules are unchanged, as are the Relayr, direct and Safe-connected paths.
- The review dialog and `/intent/<id>` name each Safe with its role, approvals and owners.
- The account list merges projects this account owns with projects it published.

Live check: <fill in from Step 4>.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review

**Spec coverage (section 5, line by line):**

| Spec requirement | Task |
| --- | --- |
| A planned multisig no longer excludes the intent path | 2 |
| External wallet, every chain sponsored, no Safe or passkey publishing remain | 2 (conditions kept verbatim; tests kept) |
| `buildFundIntent` takes the resolved plans | 1 (`input.multisigs`, already carried by `FundLaunchInput`) |
| Per chain, `buildSafeDeploymentCalls(plans)` as setup calls | 1 (through `multisigDeploymentCalls`, which validates the plans and their addresses first) |
| Then the `launchFundFor` call whose `owner` is the owner plan's address | 1 (`buildFundLaunch` already asserts `validateMultisigs(plans, owner)`) |
| `jb.safes` carries the plans | 1 |
| The saved launch session already holds the plans | 1 (no session change; `decodeLaunchSession` re-runs `buildFundLaunch`) |
| `decodeFundIntent` checks each setup call re-derives its plan address | 1 (`readSafes`) |
| …and that the owner plan equals the launch owner | 1 (`namedSafes`) |
| Otherwise the intent is shown as unreadable | 1 and 3 (`IntentProject` already renders the decode error) |
| Review dialog lists each Safe with role, threshold and owners in `multisigReview` wording | 2 |
| `/intent/[id]` does the same | 3 |
| `AccountProjects` searches `owner` and `publisher` and merges | 3 |
| Relayr and direct transaction paths unchanged | all (Task 5 Step 2 proves it) |
| No new environment variables | all |
| Testing: deterministic builder with the launch last, decode rejects a mismatched owner, intent page renders the Safes, Playwright flow with a planned 2-of-2 owner Safe against the fake Center, existing suites green | 1, 3, 4, 5 |
| Live: two-chain testnet FUND with a new 2-of-2 owner Safe, then production | 5 |

**Placeholder scan:** no "TBD", no "add error handling", no "as in Task N". Every step that changes code shows the exact code or the exact before/after lines. The one command that reaches a network (Task 4 Step 2) states its default URL and its override.

**Type consistency:** `CreateMultisig`, `SafeDeploymentPlan`, `FundLaunchInput`, `FundTransaction`, `JBCenterDeploymentCall`, `JBCenterDecodedLaunch`, `JBCenterIntent`, `JBCenterSearchPage`, `JBCenterSearchItem` keep one name and shape across tasks. `multisigCreationData(policy)` has one signature and is the only place `createProxyWithNonce` calldata is produced outside the SDK, so the builder and the decoder cannot disagree. `FundIntentSafe` is the one Safe shape in the envelope, the decoder's return, the page and the tests; it is structurally assignable to the widened `multisigReview` parameter, which is why that widening is part of Task 1 rather than Task 3.

## Ambiguities resolved

1. **"Re-derives its plan address."** The `safe-create` flavor's `address` is already `predictSafeAddress` of the decoded plan, computed by the SDK with its pinned creation code, and that code is not part of the calldata. Homerun therefore re-derives by re-encoding: `multisigCreationData({ owners, threshold, saltNonce })` must equal the signed bytes, and the call's `to` must be the canonical factory. Equal bytes for the same owners, threshold and salt mean the call creates exactly the address the SDK reported, which is the property the spec asks for, and it needs nothing beyond the 2.9.0 surface the spec names.
2. **Where roles come from.** Calldata has no role. The calls decide *which* Safes exist; `jb.safes` decides only which one owns the project. `namedSafes` requires a one-to-one match by address with equal owners, threshold and salt, unique roles, and an `owner` entry equal to the launch owner. A jb form that hides, invents or renames a Safe makes the intent unreadable.
3. **An operator Safe with an external owner.** Legitimate and supported: there is simply no `owner` entry in `jb.safes`, the launch owner is an ordinary address, and the operator Safe is still created and still listed.
4. **`MULTISIG_NEEDS_TRANSACTION_MESSAGE`.** Deleted rather than left unused: knip runs in this repository and an unused export is noise. Its test is replaced by tests for the behaviour that supersedes it.
5. **Ordering within a chain.** `buildFundIntent` emits the plans in `resolveCreateMultisigs` order (owner then operator) and always puts the launch last, so the envelope is byte-identical for identical inputs. `decodeFundIntent` requires every chain's Safe list to be identical, which is the property the deterministic-address argument depends on.
6. **The Safe bytecode fixture.** The SDK's `readSafeCreationCode` requires real canonical bytecode with matching code hashes, and no synthetic value can satisfy it. The fixture is recorded once by a committed script that verifies the hashes before writing, so `npm run test:intent` stays offline and the SDK re-checks the same hashes on every run.
7. **`from` on intent calls.** `TransactionReviewProvider` omits `from` when `kind: 'authorization'`. This work adds no `from`, and Task 2's test asserts its absence on both the setup call and the launch call.
