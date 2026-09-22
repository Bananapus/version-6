# Homerun Preview, Create and Per-Chain Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creating a FUND on Homerun is: fill the form, look at the finished project page, press Create. The create step offers one button, "Show preview". `/create/preview` renders the published project page from the saved setup values and creates nothing. "Create" publishes the intent to Juicebox Center and opens `/intent/<id>`, a link anyone can open. On that link, and on the project page once any chain exists, anyone ticks the chains to deploy and presses one button: Center pays for the chains it sponsors, the visitor pays for Ethereum. Every chain keeps Center's sponsor as sender, so tokens and suckers pair across chains.

**Architecture:** `IntentProject`'s presentation moves into `IntentProjectView`, which `/intent/[id]` and `/create/preview` both render. The one Deploy button becomes `DeployChains`, a panel that reads the intent's chains, labels each undeployed one "free" or "costs ~<amount> ETH", and runs `ensureDeployed({ chainIds, relayPaid })`: Center's sponsor lane for the sponsored chains, and for Ethereum a signed forward request the visitor sends from their own wallet. `fund-intent.ts` gains `checkRelayRequest`, which refuses any relay request that does not forward exactly the calls this intent signed, and `readLaunchedProjectId`, which reads the created project out of the paid transaction's receipt so the deployment can be recorded. The create step's publish path moves to `CreatePreview`; the transaction paths (direct, Relayr, Safe) keep every line they have and are offered only to a connection Center cannot verify.

**Tech Stack:** Next.js 16.3.3 (App Router, webpack), React 19.2, wagmi 3.7 / `@wagmi/core` 3.6, viem 2.55, Tailwind v4, `@bananapus/nana-sdk-core` 2.10.0 (`/jbcenter`, `/safe`, `/chains`, `/v6`), `@tanstack/react-query` 5.101, vitest 4 (jsdom) for units, Playwright + Chrome for the browser flows, Node 22 via nvm.

**Spec:** `/Users/jango/Documents/jb/v6/evm/docs/superpowers/specs/2026-09-22-homerun-preview-create-and-per-chain-deploy-design.md`, section **4. Homerun** (this plan implements that section only). Section 1 (Center relay route), section 2 (subset deploy) and section 3 (SDK 2.10.0) ship in parallel and are prerequisites of Task 1.

## Global Constraints

- Worktree: `/Users/jango/Documents/jb/v6/evm/extensions/homerun-setup-calls`, branch `feat/preview-create`, already branched from `main` at `2dd22bc`. Every command in this plan runs from that directory.
- Node 22 via nvm (`source ~/.nvm/nvm.sh && nvm use 22`) for every npm and node command. `package.json` declares `engines.node >= 24.1.0`; npm does not enforce engines without `engine-strict`, and that field is not edited by this work.
- In a fresh worktree run `npm install` and then `npm run build` **before** the first `npm run typecheck`: `tsc --noEmit` reads `.next/types`, and without a build it reports route-type errors this work did not cause.
- `@bananapus/nana-sdk-core` is pinned to the exact version `"2.10.0"` (no caret) in Task 1, and nothing else starts until that task is green.
- The SDK surface this plan consumes, and nothing else new:
  ```ts
  sponsorableChains(chainIds: readonly number[]): number[]
  unsponsoredChains(chainIds: readonly number[]): number[]
  requestDeploy(intentId: string, options?: { chainIds?: number[] } & JBCenterRequestOptions): Promise<{ deploys: JBCenterIntentDeploy[] }>
  requestRelay(intentId: string, chainId: number, options?: JBCenterRequestOptions):
    Promise<{ chainId: number; to: Address; data: Hex; value: bigint; gas: bigint; deadline: number; setup: { to: Address; data: Hex; value: bigint }[] }>
  ensureDeployed({ client, intent, chainIds?, relayPaid?, selfPaid?, onStep?, pollMs?, timeoutMs?, signal? }): Promise<Record<number, string>>
  // relayPaid(request) sends the setup entries and then the relay request from the
  // visitor's wallet and returns a JBCenterDeploymentInput
  // `{ chainId, projectId, transactionHash }` — the same shape `selfPaid` returns —
  // which ensureDeployed records with `recordDeployment` before it polls.
  ```
  `publishSignedIntent`, `intentCalls`, `createJBCenterDeploymentCall`, `isSponsorable`, `JBCENTER_SPONSORED_CHAIN_IDS`, `isFullyDeployed`, `describeCenterRefusal`, `intentPath`, `mergeSearch`, `searchIntents`, `getIntent`, `recordDeployment` keep their 2.9.0 behaviour.
- Homerun never depends on an SDK type name for the relay request. `FundRelayRequest` in `src/lib/fund-intent.ts` is the one shape this app types against, and it is structurally what `requestRelay` returns.
- Sponsored chain ids, exactly: `10, 8453, 42161, 11155111, 11155420, 84532, 421614`. Mainnet (`1`) is never sponsored and is always relay-paid.
- Intent calls carry no `from`. `TransactionReviewProvider` omits `from` when `kind: 'authorization'`; no call added by this work sets one, and the existing tests that assert this stay. The relay transaction is a real wallet transaction and is reviewed with `kind: 'transaction'`, which is where a `from` legitimately appears.
- The Relayr path, the direct path, the Safe-connected path, `src/lib/fund-launch-relayr.ts`, `src/lib/fund-launch-session.ts`, `src/lib/fund-launch-verification.ts`, `src/hooks/useSafeTx.ts`, `LaunchChain`, `bundleMultisigLaunch` and everything under INCOME keep every line they have. They are still reached: a Center passkey connection with more than one chain still takes the Relayr path, and a Safe connection still takes the direct path, through the create step's "Create with a transaction" fallback.
- No new environment variables. No new storage keys: the preview reads the record `CreateFlow` already writes, through the exported `CREATE_DRAFT_KEY` constant.
- Never write the word "d‑r‑a‑f‑t" (spelled out) in code, copy, comments, commit messages or the PR. The existing identifier `homerun:create-draft:v1` and every other occurrence stay exactly where they are; new code imports `CREATE_DRAFT_KEY` and never retypes that literal.
- No retrospective comments: no comment that narrates the change or the behaviour it replaced. No emoji anywhere.
- Copy in Homerun's plain voice: fixed sentences, no exclamation marks, no marketing adjectives, say what the software does and what it does not do. These exact sentences are used where the spec gives them: "Show preview"; "Preview. Nothing is created yet."; "Edit"; "Create"; "Deploy"; "free"; "costs ~0.0042 ETH"; "costs gas"; "Deploy selected"; "Also deploy on"; "Deployed on Base".
- Tailwind classes match neighbouring components: action panels `rounded-md border border-[#c4cdbb] bg-[#eef1e7] p-5 sm:p-7`, content panels `rounded-md border border-[#c4cdbb] bg-[#fffefa] p-5 sm:p-7`, list rows `grid min-w-0 gap-2 rounded-md border border-[#c4cdbb] bg-[#fffefa] p-4`, buttons `create-primary`, `btn-primary`, `btn-secondary`, `quiet-button`.
- Every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Stage by explicit path, never `git add -A`.
- Repository commands, exactly as `package.json` defines them: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:live`, `npm run build`, `npm run test:intent`, `npm run test:create`, `npm run test:a11y`. `test:create` and `test:a11y` read `BASE_URL` and default to `http://localhost:3010/`, so run `npm run dev` in another terminal first; `test:intent` starts its own server on port 3016 and needs no other. Each task ends with `npm run typecheck && npm run test:live` green; Task 7 runs all eight.

---

## File map

Modified:

- `package.json`, `package-lock.json` — the exact `2.10.0` SDK pin.
- `src/lib/fund-intent.ts` — chain eligibility widened to every supported chain, `FundRelayRequest`, `checkRelayRequest`, `relayCostLabel`, `intentLaunchCalls`.
- `src/components/IntentProject.tsx` — renders `IntentProjectView` and `DeployChains`; the redirect carries `?intent=<id>` and waits for a run started here.
- `src/components/LiveCreate.tsx` — "Show preview"; the transaction fallback for a Safe or passkey connection; `prepareIntent` moves out.
- `src/components/FundProject.tsx` — the "Also deploy on" panel, and an `intentId` prop.
- `src/app/project/[chainId]/[projectId]/page.tsx` — reads `?intent=` and passes it down.
- `test/fund-intent.test.ts`, `test/intent-project-ui.test.tsx`, `test/fund-deploy-intent-ui.test.tsx`, `test/fund-project-ui.test.tsx`, `test/intent-browser.mjs`, `test/create-browser.mjs`.

Created:

- `src/components/IntentProjectView.tsx` — the published-project presentation both `/intent/[id]` and `/create/preview` render.
- `src/components/DeployChains.tsx` — the per-chain deploy panel.
- `src/components/CreatePreview.tsx` — the preview page's client component, including the publish path moved from `LiveCreate`.
- `src/components/DeployRemainingChains.tsx` — the project page's panel, with its intent lookup.
- `src/app/create/preview/page.tsx` — the preview route.
- `src/lib/create-preview.ts` — reads the saved setup values back out of `CREATE_DRAFT_KEY`.
- `src/lib/fund-intent-lookup.ts` — finds the intent a deployed project came from.
- `test/deploy-chains-ui.test.tsx`, `test/create-preview-ui.test.tsx`, `test/fund-intent-lookup.test.ts`.

Unchanged on purpose: `src/lib/fund-contracts.ts`, `src/lib/fund-launch-session.ts`, `src/lib/fund-launch-relayr.ts`, `src/lib/fund-launch-verification.ts`, `src/lib/create-multisig.ts`, `src/lib/contract-write.ts`, `src/components/TransactionReviewProvider.tsx`, `src/components/TransactionReviewDialog.tsx`, `src/components/CreateFlow.tsx`, `src/components/AccountProjects.tsx`, `src/hooks/useSafeTx.ts`, `web/create-model.mjs`.

---

### Task 1: SDK 2.10.0, every supported chain in an intent, and the relay request check

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `src/lib/fund-intent.ts`
- Modify: `src/components/LiveCreate.tsx` (the renamed message import only)
- Test: `test/fund-intent.test.ts`

**Interfaces:**

- Consumes, from `@bananapus/nana-sdk-core/jbcenter` at 2.10.0: `sponsorableChains`, `unsponsoredChains`, `requestRelay`, `requestDeploy(id, { chainIds })`, `ensureDeployed({ chainIds, relayPaid })` as the Global Constraints spell them.
- Consumes, unchanged: `erc2771ForwarderAbi` from `@bananapus/nana-sdk-core`, `v6Address` from `@bananapus/nana-sdk-core/v6`, `FUND_CHAIN_IDS` from `./fund-contracts`, `homerunDeployerAbi` from `./income-contracts` (its `FundLaunched(uint256 indexed projectId, address indexed owner, address caller)` event is the same one `verifyFundLaunch` reads).
- Produces, in `src/lib/fund-intent.ts`:
  ```ts
  export const UNSUPPORTED_CHAINS_MESSAGE: string
  export const RELAY_UNREADABLE_MESSAGE: string
  export type FundRelayRequest = {
    chainId: number; to: Address; data: Hex; value: bigint; gas: bigint; deadline: number
    setup: readonly { to: Address; data: Hex; value: bigint }[]
  }
  export type FundForwardedLaunch = { from: Address; to: Address; value: bigint; gas: bigint; nonce: bigint; deadline: number; data: Hex }
  export function intentLaunchCalls(intent: JBCenterIntent, chainId: number): { setup: JBCenterDeploymentCall[]; launch: JBCenterDeploymentCall }
  export function checkRelayRequest(intent: JBCenterIntent, request: FundRelayRequest): FundForwardedLaunch
  export function readLaunchedProjectId(intent: JBCenterIntent, chainId: number, receipt: Pick<TransactionReceipt, 'status' | 'logs'>): string
  export function relayCostLabel(wei: bigint): string
  export function fundIntentEligibleChains(chainIds: readonly number[]): boolean  // widened
  ```
- Removed: `UNSPONSORED_CHAINS_MESSAGE` (renamed to `UNSUPPORTED_CHAINS_MESSAGE`, with new wording).

- [ ] **Step 1: Pin the SDK**

```bash
source ~/.nvm/nvm.sh && nvm use 22
cd /Users/jango/Documents/jb/v6/evm/extensions/homerun-setup-calls
npm install --save-exact @bananapus/nana-sdk-core@2.10.0
git diff --stat package.json package-lock.json
```

Expected: `package.json` shows `"@bananapus/nana-sdk-core": "2.10.0"` and only that dependency moved. If npm wants to move `viem` or `wagmi`, stop and report instead of accepting it.

2.10.0 is published before this plan starts. If `npm install` reports `No matching version found`, poll npm for a few minutes:

```bash
npm view @bananapus/nana-sdk-core versions --json | tail -5
```

and only if it is still absent, link the local package and say so in the commit body:

```bash
npm link /Users/jango/Documents/jb/v6/evm/extensions/sdk-relay/packages/core
```

The `package.json` pin to `"2.10.0"` is still written in that case; the link only supplies the bytes until the version is published.

- [ ] **Step 2: Prove the 2.10.0 surface exists**

```bash
node -e "import('@bananapus/nana-sdk-core/jbcenter').then(module => {
  const missing = ['sponsorableChains', 'unsponsoredChains', 'ensureDeployed', 'isSponsorable'].filter(name => typeof module[name] !== 'function');
  if (missing.length) { console.error('missing:', missing.join(', ')); process.exit(1); }
  const client = module.createJBCenterClient({ baseUrl: 'https://juicebox.center' });
  if (typeof client.requestRelay !== 'function') { console.error('requestRelay is missing'); process.exit(1); }
  const sponsored = module.sponsorableChains([1, 10, 8453]);
  const unsponsored = module.unsponsoredChains([1, 10, 8453]);
  if (JSON.stringify(sponsored) !== '[10,8453]' || JSON.stringify(unsponsored) !== '[1]') {
    console.error('per-chain sponsorability is wrong', sponsored, unsponsored); process.exit(1);
  }
  console.log('2.10.0 relay surface ok');
})"
```

Expected: `2.10.0 relay surface ok`. Anything else means section 3 has not shipped; stop and report.

- [ ] **Step 3: Run the existing gates against the new SDK**

```bash
npm run build && npm run typecheck && npm run test:live
```

Expected: all three pass. Any type error introduced by the pin is fixed here, before new behaviour is written.

- [ ] **Step 4: Write the failing tests**

In `test/fund-intent.test.ts`, replace the existing `mainnet cannot be created without a transaction, and a nameless project cannot either` test with the first test below, and add the rest after it. Extend the import from `../src/lib/fund-intent` with `RELAY_UNREADABLE_MESSAGE`, `checkRelayRequest`, `intentLaunchCalls`, `relayCostLabel`, and extend the viem import with `decodeFunctionData` and `encodeFunctionData` if they are not already there.

```ts
import { erc2771ForwarderAbi } from '@bananapus/nana-sdk-core'
import { v6Address } from '@bananapus/nana-sdk-core/v6'

const forwarderOn = (chainId: number) => v6Address('ERC2771Forwarder', chainId as never)
const forwardedData = (to: Address, data: Hex, value: bigint) => encodeFunctionData({
  abi: erc2771ForwarderAbi,
  functionName: 'execute',
  args: [{ from: owner, to, value, gas: 900_000n, nonce: 3n, deadline: 2_000_000_000, data }],
})
const relayFor = (intent: JBCenterIntent, chainId: number, overrides: Partial<FundRelayRequest> = {}): FundRelayRequest => {
  const calls = intentLaunchCalls(intent, chainId)
  return {
    chainId, to: forwarderOn(chainId), value: 0n, gas: 900_000n, deadline: 2_000_000_000,
    data: forwardedData(calls.launch.to, calls.launch.data, 0n),
    setup: calls.setup.map(call => ({ to: call.to, data: call.data, value: 0n })),
    ...overrides,
  }
}

test('an intent may name any supported chain, and no other', () => {
  assert.equal(fundIntentEligibleChains([8453]), true)
  assert.equal(fundIntentEligibleChains([1, 8453]), true)
  assert.equal(fundIntentEligibleChains([]), false)
  assert.equal(fundIntentEligibleChains([8453, 8453]), false)
  assert.equal(fundIntentEligibleChains([137]), false)
  const intent = buildFundIntent({ ...input, chainIds: [1, 8453], creationFees: { 1: 0n, 8453: 0n }, mustStartAtOrAfter: 1_800_000_000 }, 'Neighborhood Workshop')
  assert.deepEqual(intent.chainIds, [1, 8453])
  assert.throws(() => buildFundIntent({ ...input, chainIds: [137], creationFees: { 137: 0n } }, 'Neighborhood Workshop'), /Unsupported FUND chain 137/)
  assert.throws(() => buildFundIntent(input, '   '), /project name/)
})

test('a relay request that forwards this intent’s own launch is readable', () => {
  const intent = { envelope: buildFundIntent({ ...input, chainIds: [1], creationFees: { 1: 0n } }, 'Neighborhood Workshop') } as unknown as JBCenterIntent
  const forwarded = checkRelayRequest(intent, relayFor(intent, 1))
  assert.equal(forwarded.to, intentLaunchCalls(intent, 1).launch.to)
  assert.equal(forwarded.data, intentLaunchCalls(intent, 1).launch.data)
})

test('a relay request that forwards anything else is refused', () => {
  const intent = { envelope: buildFundIntent({ ...input, chainIds: [1], creationFees: { 1: 0n } }, 'Neighborhood Workshop') } as unknown as JBCenterIntent
  const other = `0x${'11'.repeat(40)}` as Address
  const refusal = new RegExp(RELAY_UNREADABLE_MESSAGE)
  assert.throws(() => checkRelayRequest(intent, relayFor(intent, 1, { to: other })), refusal)
  assert.throws(() => checkRelayRequest(intent, relayFor(intent, 1, { data: forwardedData(other, intentLaunchCalls(intent, 1).launch.data, 0n) })), refusal)
  assert.throws(() => checkRelayRequest(intent, relayFor(intent, 1, { data: forwardedData(intentLaunchCalls(intent, 1).launch.to, '0xdeadbeef', 0n) })), refusal)
  assert.throws(() => checkRelayRequest(intent, relayFor(intent, 1, { value: 1n })), refusal)
  assert.throws(() => checkRelayRequest(intent, relayFor(intent, 1, { setup: [{ to: other, data: '0xdead', value: 0n }] })), refusal)
  assert.throws(() => checkRelayRequest(intent, relayFor(intent, 1, { deadline: 1_600_000_000 })), /expired/)
  assert.throws(() => checkRelayRequest(intent, { ...relayFor(intent, 1), chainId: 10 }), refusal)
})

test('the project a paid deployment created is read out of its receipt', () => {
  const intent = { envelope: buildFundIntent({ ...input, chainIds: [1], creationFees: { 1: 0n } }, 'Neighborhood Workshop') } as unknown as JBCenterIntent
  const deployer = intentLaunchCalls(intent, 1).launch.to
  const launched = (projectId: bigint, logOwner: Address, address = deployer) => ({
    address,
    topics: encodeEventTopics({ abi: homerunDeployerAbi, eventName: 'FundLaunched', args: { projectId, owner: logOwner } }),
    data: encodeAbiParameters([{ type: 'address' }], [`0x${'5e'.repeat(20)}` as Address]),
  })
  const receipt = (logs: unknown[]) => ({ status: 'success', logs } as unknown as Pick<TransactionReceipt, 'status' | 'logs'>)
  assert.equal(readLaunchedProjectId(intent, 1, receipt([launched(7n, owner)])), '7')
  assert.throws(() => readLaunchedProjectId(intent, 1, receipt([])), /did not create/)
  assert.throws(() => readLaunchedProjectId(intent, 1, receipt([launched(7n, `0x${'99'.repeat(20)}` as Address)])), /did not create/)
  assert.throws(() => readLaunchedProjectId(intent, 1, receipt([launched(7n, owner, `0x${'88'.repeat(20)}` as Address)])), /did not create/)
  assert.throws(() => readLaunchedProjectId(intent, 1, receipt([launched(7n, owner), launched(8n, owner)])), /did not create/)
})

test('a relay cost reads as one short amount of ETH', () => {
  assert.equal(relayCostLabel(4_200_000_000_000_000n), 'costs ~0.0042 ETH')
  assert.equal(relayCostLabel(0n), 'costs ~0 ETH')
  assert.equal(relayCostLabel(20_000_000_000_000n), 'costs ~0.00002 ETH')
})
```

Add `readLaunchedProjectId` and `type FundRelayRequest` to the imports from `../src/lib/fund-intent`, `encodeAbiParameters` and `encodeEventTopics` to the viem value import, `type Address, type Hex, type TransactionReceipt` to the viem type import, and `import { homerunDeployerAbi } from '../src/lib/income-contracts'`. `owner` and `input` are the file's existing fixtures.

```bash
npx vitest run test/fund-intent.test.ts
```

Expected: fails. `fundIntentEligibleChains` still refuses mainnet, and `checkRelayRequest`, `intentLaunchCalls`, `readLaunchedProjectId` and `relayCostLabel` do not exist.

- [ ] **Step 5: Widen eligibility and read a relay request**

In `src/lib/fund-intent.ts`, extend the viem import with `decodeEventLog`, `decodeFunctionData` and `formatEther`, the viem type import with `TransactionReceipt`, and add these imports beneath the existing ones:

```ts
import { erc2771ForwarderAbi } from '@bananapus/nana-sdk-core'
import { v6Address } from '@bananapus/nana-sdk-core/v6'
import type { JBChainId } from '@bananapus/nana-sdk-core'
import { FUND_CHAIN_IDS } from './fund-contracts'
import { homerunDeployerAbi } from './income-contracts'
```

Replace the `UNSPONSORED_CHAINS_MESSAGE` constant and `fundIntentEligibleChains` with:

```ts
export const UNSUPPORTED_CHAINS_MESSAGE =
  'Homerun creates projects on Ethereum, Optimism, Base, Arbitrum and their test networks. Remove the other networks.'
export const RELAY_UNREADABLE_MESSAGE =
  'This deployment request does not match the project this link publishes.'

export function fundIntentEligibleChains(chainIds: readonly number[]): boolean {
  return chainIds.length > 0 && new Set(chainIds).size === chainIds.length
    && chainIds.every(chainId => (FUND_CHAIN_IDS as readonly number[]).includes(chainId))
}
```

Change `buildFundIntent`'s refusal to `throw new Error(UNSUPPORTED_CHAINS_MESSAGE)`. `JBCENTER_SPONSORED_CHAIN_IDS` is no longer imported by this module; drop that specifier.

Add at the end of the module:

```ts
export type FundRelayRequest = {
  chainId: number
  to: Address
  data: Hex
  value: bigint
  gas: bigint
  deadline: number
  setup: readonly { to: Address; data: Hex; value: bigint }[]
}

export type FundForwardedLaunch = {
  from: Address
  to: Address
  value: bigint
  gas: bigint
  nonce: bigint
  deadline: number
  data: Hex
}

/** One chain's signed calls, launch last, exactly as `buildFundIntent` emitted them. */
export function intentLaunchCalls(intent: JBCenterIntent, chainId: number): { setup: JBCenterDeploymentCall[]; launch: JBCenterDeploymentCall } {
  const calls = intent.envelope.deploymentCalls.filter(call => call.chainId === chainId)
  if (!calls.length) throw new Error(RELAY_UNREADABLE_MESSAGE)
  return { setup: calls.slice(0, -1), launch: calls[calls.length - 1] }
}

const sameBytes = (left: Hex, right: Hex) => left.toLowerCase() === right.toLowerCase()

/**
 * A visitor pays for this transaction, so it is sent only when it forwards the
 * calls this intent signed and nothing else. Center's sponsor stays the
 * forwarded sender, which is what keeps the token and sucker addresses paired.
 */
export function checkRelayRequest(intent: JBCenterIntent, request: FundRelayRequest): FundForwardedLaunch {
  const { setup, launch } = intentLaunchCalls(intent, request.chainId)
  if (!isAddressEqual(request.to, v6Address('ERC2771Forwarder', request.chainId as JBChainId))) throw new Error(RELAY_UNREADABLE_MESSAGE)
  let decoded
  try { decoded = decodeFunctionData({ abi: erc2771ForwarderAbi, data: request.data }) }
  catch { throw new Error(RELAY_UNREADABLE_MESSAGE) }
  if (decoded.functionName !== 'execute') throw new Error(RELAY_UNREADABLE_MESSAGE)
  const forwarded = decoded.args[0] as FundForwardedLaunch
  if (!isAddressEqual(forwarded.to, launch.to) || !sameBytes(forwarded.data, launch.data)
    || forwarded.value !== request.value
    || request.setup.length !== setup.length
    || request.setup.some((entry, index) => !isAddressEqual(entry.to, setup[index].to)
      || !sameBytes(entry.data, setup[index].data) || entry.value !== 0n)) throw new Error(RELAY_UNREADABLE_MESSAGE)
  if (Number(forwarded.deadline) * 1000 <= Date.now()) throw new Error('This deployment request has expired. Try again.')
  return forwarded
}

export const NO_LAUNCH_MESSAGE = 'This transaction did not create this project. Check it in your wallet history before trying again.'

/**
 * The project a paid deployment created, read from the deployer's own event.
 * The transaction that produced this receipt is the one `checkRelayRequest`
 * matched against the signed launch, so the owner and the deployer address are
 * what identify the launch here.
 */
export function readLaunchedProjectId(intent: JBCenterIntent, chainId: number, receipt: Pick<TransactionReceipt, 'status' | 'logs'>): string {
  if (receipt.status !== 'success') throw new Error(NO_LAUNCH_MESSAGE)
  const { launch } = intentLaunchCalls(intent, chainId)
  const owner = decodeFundIntent(intent).owner
  const launched = receipt.logs.flatMap(log => {
    if (!isAddressEqual(log.address, launch.to)) return []
    try {
      const { args } = decodeEventLog({ abi: homerunDeployerAbi, eventName: 'FundLaunched', data: log.data, topics: log.topics })
      return isAddressEqual(args.owner, owner) ? [args.projectId] : []
    } catch { return [] }
  })
  if (launched.length !== 1) throw new Error(NO_LAUNCH_MESSAGE)
  return launched[0].toString()
}

/** Enough digits to read a gas estimate, never so many that it reads as a quote. */
export function relayCostLabel(wei: bigint): string {
  const eth = Number(formatEther(wei))
  const amount = eth === 0 || eth >= 0.0001
    ? Number(eth.toFixed(4)).toString()
    : new Intl.NumberFormat('en-US', { maximumSignificantDigits: 1 }).format(eth)
  return `costs ~${amount} ETH`
}
```

In `src/components/LiveCreate.tsx`, rename the imported message: `UNSPONSORED_CHAINS_MESSAGE` becomes `UNSUPPORTED_CHAINS_MESSAGE` in both the import specifier and the `prepareIntent` throw.

- [ ] **Step 6: Run**

```bash
npx vitest run test/fund-intent.test.ts test/fund-contracts.test.ts test/create-multisig.test.ts && npm run typecheck && npm run lint
```

Expected: every test passes, `tsc --noEmit` is clean, eslint reports no warnings. `test/fund-deploy-intent-ui.test.tsx` and `test/intent-project-ui.test.tsx` still assert the old mainnet refusals and fail; Tasks 3 and 4 replace those assertions. Run only the files named here in this step.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/fund-intent.ts src/components/LiveCreate.tsx test/fund-intent.test.ts
git commit -m "$(cat <<'EOF'
Let an intent name every supported chain, and read a relay request back

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The per-chain deploy panel

**Files:**
- Create: `src/components/DeployChains.tsx`
- Test: `test/deploy-chains-ui.test.tsx`

**Interfaces:**
- Consumes: `ensureDeployed`, `sponsorableChains`, `unsponsoredChains`, `EnsureDeployedError`, `describeCenterRefusal`, `type JBCenterDeploymentInput` from `@bananapus/nana-sdk-core/jbcenter`; `checkRelayRequest`, `readLaunchedProjectId`, `relayCostLabel`, `watchDeployRefusal`, `type FundRelayRequest` from `@/lib/fund-intent`; `requireTransactionReview` from `@/lib/transaction-review`; `getAccount`, `getPublicClient`, `sendTransaction`, `switchChain`, `waitForTransactionReceipt` from `@wagmi/core`; `SAFE_CREATE_ABI` from `@/lib/create-multisig`; `erc2771ForwarderAbi` from `@bananapus/nana-sdk-core`; `displayChainName` from `@/lib/chainDisplay`; `useWallet` from `@/hooks/useWallet`.
- Produces:
  ```ts
  // src/components/DeployChains.tsx
  export function DeployChains({ intent, heading, chainIds, onDeployed }: {
    intent: JBCenterIntent
    heading: 'Deploy' | 'Also deploy on'
    /** The intent's own chain order, as the signed calls give it. */
    chainIds: readonly number[]
    onDeployed?: () => void
  }): ReactNode
  ```

- [ ] **Step 1: Write the failing test**

Create `test/deploy-chains-ui.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@bananapus/nana-sdk-core', async importOriginal => (await import('./fixtures/homerun-deployer')).withHomerunDeployer(await importOriginal()))

import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, zeroHash, type Hex } from 'viem'
import { erc2771ForwarderAbi } from '@bananapus/nana-sdk-core'
import { v6Address } from '@bananapus/nana-sdk-core/v6'
import { HOMERUN_DEPLOYER } from './fixtures/homerun-deployer'
import { homerunDeployerAbi } from '../src/lib/income-contracts'

const wallet = '0x1111111111111111111111111111111111111111'
const intentId = '3f0f2f4c-0f3f-4f2f-8f1f-0f2f3f4f5f6f'
const hash = `0x${'ef'.repeat(32)}` as Hex
const relayHash = `0x${'ab'.repeat(32)}` as Hex

const runtime = vi.hoisted(() => ({
  requestDeploy: vi.fn(), requestRelay: vi.fn(), getIntent: vi.fn(), recordDeployment: vi.fn(),
  review: vi.fn(), send: vi.fn(), switchChain: vi.fn(), receipt: vi.fn(), gasPrice: vi.fn(),
  address: wallet as string | undefined, openSignIn: vi.fn(),
}))
vi.mock('@/lib/jbcenter-client', () => ({ jbCenterClient: {
  getIntent: runtime.getIntent, requestDeploy: runtime.requestDeploy,
  requestRelay: runtime.requestRelay, recordDeployment: runtime.recordDeployment,
} }))
vi.mock('@/lib/transaction-review', () => ({ requireTransactionReview: runtime.review }))
vi.mock('@/providers/Providers', () => ({ wagmiConfig: {} }))
vi.mock('@/hooks/useWallet', () => ({ useWallet: () => ({ address: runtime.address, openSignIn: runtime.openSignIn }) }))
vi.mock('@wagmi/core', () => ({
  getAccount: () => ({ address: runtime.address }),
  getPublicClient: () => ({ getGasPrice: runtime.gasPrice }),
  sendTransaction: runtime.send,
  switchChain: runtime.switchChain,
  waitForTransactionReceipt: runtime.receipt,
}))

import { DeployChains } from '../src/components/DeployChains'

const launch = (chainId: number) => ({
  chainId, to: HOMERUN_DEPLOYER,
  data: encodeFunctionData({
    abi: homerunDeployerAbi, functionName: 'launchFundFor',
    args: [wallet, 'ipfs://bafkreimetadata', 'Neighborhood Workshop FUND', 'FUND', 0, zeroHash, []],
  }),
})
const deployRow = (chainId: number, status: string) => ({
  chainId, status, transactionHash: status === 'confirmed' ? hash : null, bundleUuid: null, error: null,
  createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
})
const deployment = (chainId: number, projectId: string) => ({ chainId, projectId, transactionHash: hash, createdAt: new Date(0).toISOString() })
function intent(chainIds: number[], overrides: Record<string, unknown> = {}) {
  return {
    id: intentId, status: 'undeployed', contentHash: `0x${'ab'.repeat(32)}`, publisher: wallet,
    signature: `0x${'cd'.repeat(65)}`, createdAt: new Date(0).toISOString(), deployments: [], deploys: [],
    name: 'Neighborhood Workshop', description: null, tagline: null, tags: [], logoUri: null, owner: wallet,
    envelope: {
      format: 'homerun.money/fund.v1', deploymentVersion: '6', chainIds,
      deploymentCalls: chainIds.map(launch),
      jb: { app: 'homerun', kind: 'fund', name: 'Neighborhood Workshop', owner: wallet, chainIds, tokenName: 'Neighborhood Workshop FUND', ticker: 'FUND', salt: zeroHash, mustStartAtOrAfter: 0, projectUri: 'ipfs://bafkreimetadata' },
    },
    ...overrides,
  }
}
/** The deployer's own FundLaunched event, as a receipt the wallet's transaction produced. */
const launchReceipt = (chainId: number, projectId: bigint) => ({
  status: 'success', transactionHash: relayHash, blockNumber: 1_000n,
  logs: [{
    address: launch(chainId).to,
    topics: encodeEventTopics({ abi: homerunDeployerAbi, eventName: 'FundLaunched', args: { projectId, owner: wallet } }),
    data: encodeAbiParameters([{ type: 'address' }], [`0x${'5e'.repeat(20)}`]),
  }],
})
const relayRequest = (chainId: number) => ({
  chainId, to: v6Address('ERC2771Forwarder', chainId as never), value: 0n, gas: 900_000n,
  deadline: Math.floor(Date.now() / 1000) + 1_800, setup: [],
  data: encodeFunctionData({
    abi: erc2771ForwarderAbi, functionName: 'execute',
    args: [{ from: wallet, to: launch(chainId).to, value: 0n, gas: 900_000n, nonce: 3n, deadline: Math.floor(Date.now() / 1000) + 1_800, data: launch(chainId).data }],
  }),
})

describe('choosing the chains a published project is deployed on', () => {
  let host: HTMLDivElement
  let root: Root
  let client: QueryClient
  beforeEach(() => {
    runtime.address = wallet
    runtime.requestDeploy.mockReset().mockResolvedValue({ deploys: [] })
    runtime.requestRelay.mockReset().mockImplementation(async (_id: string, chainId: number) => relayRequest(chainId))
    runtime.recordDeployment.mockReset().mockResolvedValue(deployment(1, '9'))
    runtime.review.mockReset().mockResolvedValue(undefined)
    runtime.send.mockReset().mockResolvedValue(relayHash)
    runtime.switchChain.mockReset().mockResolvedValue(undefined)
    runtime.receipt.mockReset().mockResolvedValue(launchReceipt(1, 9n))
    runtime.gasPrice.mockReset().mockResolvedValue(2_000_000_000n)
    client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: Infinity } } })
    host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  })
  afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove() })

  async function render(value: ReturnType<typeof intent>) {
    runtime.getIntent.mockResolvedValue(value)
    await act(async () => root.render(<QueryClientProvider client={client}>
      <DeployChains intent={value as never} heading="Deploy" chainIds={value.envelope.chainIds} />
    </QueryClientProvider>))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
  }
  const button = (label: string) => [...host.querySelectorAll('button')].find(item => item.textContent?.startsWith(label))
  const rowFor = (chainId: number) => host.querySelector<HTMLInputElement>(`input[type="checkbox"][value="${chainId}"]`)

  it('labels a sponsored chain free and prices a chain the visitor pays for', async () => {
    await render(intent([1, 10, 8453]))
    expect(host.textContent).toContain('free')
    expect(host.textContent).toContain('costs ~0.0018 ETH')
    expect(rowFor(10)!.checked).toBe(true)
    expect(rowFor(8453)!.checked).toBe(true)
    expect(rowFor(1)!.checked).toBe(false)
  })

  it('says a price is still being read while the request loads', async () => {
    runtime.requestRelay.mockImplementation(() => new Promise(() => {}))
    await render(intent([1, 8453]))
    expect(host.textContent).toContain('costs gas')
  })

  it('links a chain that is already created and offers no checkbox for it', async () => {
    await render(intent([10, 8453], { deployments: [deployment(8453, '42')] }))
    expect(rowFor(8453)).toBeNull()
    const link = [...host.querySelectorAll('a')].find(item => item.getAttribute('href') === '/project/8453/42')
    expect(link?.textContent).toBe('Deployed on Base')
  })

  it('queues only the sponsored chains the reader ticked', async () => {
    const value = intent([1, 10, 8453])
    await render(value)
    await act(async () => { rowFor(8453)!.click() })
    await act(async () => { button('Deploy selected')!.click() })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)) })
    expect(runtime.requestDeploy).toHaveBeenCalledWith(intentId, expect.objectContaining({ chainIds: [10] }))
    expect(runtime.send).not.toHaveBeenCalled()
  })

  it('sends the chain the visitor pays for from their own wallet, after a review', async () => {
    const value = intent([1, 8453])
    runtime.getIntent.mockResolvedValue({ ...value, deployments: [deployment(1, '9'), deployment(8453, '42')], deploys: [deployRow(1, 'confirmed'), deployRow(8453, 'confirmed')] })
    await render(value)
    await act(async () => { rowFor(1)!.click() })
    await act(async () => { button('Deploy selected')!.click() })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 120)) })
    expect(runtime.review.mock.calls[0][0].kind).toBe('transaction')
    expect(runtime.review.mock.calls[0][0].calls[0].functionName).toBe('execute')
    expect(runtime.switchChain).toHaveBeenCalledWith({}, { chainId: 1 })
    expect(runtime.send).toHaveBeenCalledWith({}, expect.objectContaining({ chainId: 1, to: relayRequest(1).to, value: 0n }))
    expect(runtime.recordDeployment.mock.calls[0].slice(0, 2)).toEqual([intentId, { chainId: 1, projectId: '9', transactionHash: relayHash }])
    expect(runtime.requestDeploy).toHaveBeenCalledWith(intentId, expect.objectContaining({ chainIds: [8453] }))
  })

  it('records nothing when the paid transaction created no project', async () => {
    runtime.receipt.mockResolvedValue({ ...launchReceipt(1, 9n), logs: [] })
    await render(intent([1]))
    await act(async () => { rowFor(1)!.click() })
    await act(async () => { button('Deploy selected')!.click() })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 120)) })
    expect(runtime.send).toHaveBeenCalled()
    expect(runtime.recordDeployment).not.toHaveBeenCalled()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('did not create this project')
  })

  it('refuses a relay request that forwards a different call, and sends nothing', async () => {
    runtime.requestRelay.mockImplementation(async (_id: string, chainId: number) => ({
      ...relayRequest(chainId),
      data: encodeFunctionData({
        abi: erc2771ForwarderAbi, functionName: 'execute',
        args: [{ from: wallet, to: `0x${'22'.repeat(20)}`, value: 0n, gas: 900_000n, nonce: 3n, deadline: Math.floor(Date.now() / 1000) + 1_800, data: '0xdeadbeef' }],
      }),
    }))
    await render(intent([1]))
    await act(async () => { rowFor(1)!.click() })
    await act(async () => { button('Deploy selected')!.click() })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 120)) })
    expect(runtime.send).not.toHaveBeenCalled()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('does not match the project this link publishes')
  })

  it('asks an unconnected reader to sign in before a chain they pay for', async () => {
    runtime.address = undefined
    await render(intent([1, 8453]))
    await act(async () => { rowFor(1)!.click() })
    await act(async () => { button('Deploy selected')!.click() })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)) })
    expect(runtime.openSignIn).toHaveBeenCalled()
    expect(runtime.send).not.toHaveBeenCalled()
  })
})
```

```bash
npx vitest run test/deploy-chains-ui.test.tsx
```

Expected: fails. `src/components/DeployChains.tsx` does not exist.

- [ ] **Step 2: Write the panel**

Create `src/components/DeployChains.tsx`:

```tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { getAccount, getPublicClient, sendTransaction, switchChain, waitForTransactionReceipt } from '@wagmi/core'
import { erc2771ForwarderAbi, type JBChainId } from '@bananapus/nana-sdk-core'
import {
  EnsureDeployedError, describeCenterRefusal, ensureDeployed, sponsorableChains, unsponsoredChains,
  type EnsureDeployedStep, type JBCenterIntent,
} from '@bananapus/nana-sdk-core/jbcenter'
import { jbCenterClient } from '@/lib/jbcenter-client'
import { wagmiConfig } from '@/providers/Providers'
import { useWallet } from '@/hooks/useWallet'
import { SAFE_CREATE_ABI } from '@/lib/create-multisig'
import { checkRelayRequest, relayCostLabel, watchDeployRefusal, type FundRelayRequest } from '@/lib/fund-intent'
import { requireTransactionReview } from '@/lib/transaction-review'
import { displayChainName } from '@/lib/chainDisplay'

const STEP_LABELS: Record<EnsureDeployedStep['status'], string> = {
  queued: 'queued at Juicebox Center',
  sent: 'sent onchain',
  confirmed: 'created',
  failed: 'could not be created',
  'self-paid': 'recorded',
}

/** Neither a provider, a gateway nor Center's own request text reaches a reader. */
const DEPLOY_UNAVAILABLE = 'Center could not start this deploy right now. Try again shortly.'
const DEPLOY_FAILED = 'Juicebox Center could not deploy this project. Try again in a few minutes.'
const CONNECT_MESSAGE = 'Connect a wallet to deploy the networks you pay for.'
/** Center keeps a failed chain as a failed chain: this page cannot send it again. */
const deployStopped = (chainId: number) =>
  `Juicebox Center could not create this project on ${displayChainName(chainId)}. It cannot be deployed from here; create it again.`

function RelayCost({ intentId, chainId }: { intentId: string; chainId: number }) {
  const cost = useQuery({
    queryKey: ['intent-relay-cost', intentId, chainId],
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const request = await jbCenterClient.requestRelay(intentId, chainId) as FundRelayRequest
      const client = getPublicClient(wagmiConfig, { chainId: chainId as JBChainId })
      if (!client) throw new Error('No RPC client is configured for this chain.')
      return request.gas * await client.getGasPrice() + request.value
    },
  })
  return <span className="text-sm">{cost.data === undefined ? 'costs gas' : relayCostLabel(cost.data)}</span>
}

export function DeployChains({ intent, heading, chainIds, onDeployed }: {
  intent: JBCenterIntent
  heading: 'Deploy' | 'Also deploy on'
  chainIds: readonly number[]
  onDeployed?: () => void
}) {
  const { address, openSignIn } = useWallet()
  const deployed = new Map(intent.deployments.map(item => [item.chainId, item.projectId]))
  const remaining = chainIds.filter(chainId => !deployed.has(chainId))
  const free = sponsorableChains(remaining)
  const paid = unsponsoredChains(remaining)
  const [selected, setSelected] = useState<number[]>(free)
  const [deploying, setDeploying] = useState(false)
  const [stopped, setStopped] = useState(false)
  const [steps, setSteps] = useState<string[]>([])
  const [error, setError] = useState('')
  const run = useRef<AbortController | null>(null)
  useEffect(() => () => run.current?.abort(), [])

  const toggle = (chainId: number) => setSelected(current => current.includes(chainId)
    ? current.filter(item => item !== chainId)
    : [...current, chainId])

  /** The visitor pays gas and the creation fee; Center's sponsor stays the forwarded sender. */
  async function relayPaid(request: FundRelayRequest) {
    const forwarded = checkRelayRequest(intent, request)
    const account = getAccount(wagmiConfig).address
    if (!account) throw new Error(CONNECT_MESSAGE)
    await switchChain(wagmiConfig, { chainId: request.chainId as JBChainId })
    await requireTransactionReview({
      kind: 'transaction',
      title: `Create this project on ${displayChainName(request.chainId)}`,
      description: 'You send these transactions and pay their gas and creation fee. Juicebox Center’s sponsor stays the sender of the creation itself, so this project keeps the same token and bridge addresses on every network.',
      confirmLabel: 'Continue to wallet',
      calls: [
        ...request.setup.map(entry => ({
          chainId: request.chainId, to: entry.to, data: entry.data, value: entry.value, from: account,
          abi: SAFE_CREATE_ABI, functionName: 'createProxyWithNonce',
          contractName: 'SafeProxyFactory',
          label: `Create this project’s multisig on ${displayChainName(request.chainId)}`,
        })),
        {
          chainId: request.chainId, to: request.to, data: request.data, value: request.value, from: account,
          abi: erc2771ForwarderAbi, functionName: 'execute', args: [forwarded],
          contractName: 'ERC2771Forwarder',
          label: `Create the FUND on ${displayChainName(request.chainId)}`,
        },
      ],
    })
    for (const entry of request.setup) {
      const setupHash = await sendTransaction(wagmiConfig, {
        account, chainId: request.chainId as JBChainId, to: entry.to, data: entry.data, value: entry.value,
      })
      const setupReceipt = await waitForTransactionReceipt(wagmiConfig, { chainId: request.chainId as JBChainId, hash: setupHash })
      if (setupReceipt.status !== 'success') throw new Error('The multisig creation reverted. Nothing else was sent.')
    }
    const transactionHash = await sendTransaction(wagmiConfig, {
      account, chainId: request.chainId as JBChainId,
      to: request.to, data: request.data, value: request.value, gas: request.gas,
    })
    const receipt = await waitForTransactionReceipt(wagmiConfig, { chainId: request.chainId as JBChainId, hash: transactionHash })
    const deployment: JBCenterDeploymentInput = {
      chainId: request.chainId,
      projectId: readLaunchedProjectId(intent, request.chainId, receipt),
      transactionHash,
    }
    return deployment
  }

  async function deploy() {
    if (!selected.length) return
    if (!address && selected.some(chainId => paid.includes(chainId))) { openSignIn(); setError(CONNECT_MESSAGE); return }
    setDeploying(true); setError(''); setSteps([])
    const watcher = watchDeployRefusal(jbCenterClient)
    const controller = new AbortController()
    run.current?.abort()
    run.current = controller
    try {
      await ensureDeployed({
        client: watcher.client,
        intent,
        chainIds: [...selected],
        relayPaid,
        timeoutMs: 600_000,
        signal: controller.signal,
        onStep: step => {
          setSteps(current => [...current, `${displayChainName(step.chainId)}: ${STEP_LABELS[step.status]}`])
          onDeployed?.()
        },
      })
      onDeployed?.()
    } catch (cause) {
      if (controller.signal.aborted) return
      if (cause instanceof EnsureDeployedError && cause.chainId !== undefined) {
        setStopped(true); setError(deployStopped(cause.chainId)); return
      }
      const refused = describeCenterRefusal(watcher.refusal())
      setError(refused?.message
        ?? (cause instanceof Error && cause.message ? cause.message : DEPLOY_UNAVAILABLE)
        ?? (cause instanceof EnsureDeployedError ? DEPLOY_FAILED : DEPLOY_UNAVAILABLE))
    } finally {
      if (run.current === controller) run.current = null
      setDeploying(false)
    }
  }

  return <section className="rounded-md border border-[#c4cdbb] bg-[#eef1e7] p-5 sm:p-7">
    <h2 className="mb-5 text-3xl">{heading}</h2>
    <p>Juicebox Center pays for the networks it sponsors. You pay the gas and the creation fee for the others. Anyone can deploy this project, and its terms cannot change.</p>
    <ul className="m-0 mt-5 grid list-none gap-2 p-0">
      {chainIds.map(chainId => {
        const projectId = deployed.get(chainId)
        if (projectId) return <li key={chainId} className="text-sm">
          <a className="underline" href={`/project/${chainId}/${projectId}`}>Deployed on {displayChainName(chainId)}</a>
        </li>
        return <li key={chainId} className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" value={chainId} checked={selected.includes(chainId)} disabled={deploying || stopped} onChange={() => toggle(chainId)} />
            {displayChainName(chainId)}
          </label>
          {free.includes(chainId) ? <span className="text-sm">free</span> : <RelayCost intentId={intent.id} chainId={chainId} />}
        </li>
      })}
    </ul>
    {remaining.length > 0 && <button type="button" className="btn-primary mt-5" disabled={deploying || stopped || !selected.length} onClick={() => void deploy()}>{deploying ? 'Deploying…' : 'Deploy selected'}</button>}
    {steps.length > 0 && <ul className="m-0 mt-5 grid list-none gap-2 p-0 text-sm" aria-label="Deployment progress">{steps.map((step, index) => <li key={`${step}:${index}`} role="status">{step}</li>)}</ul>}
    {error && <p role="alert" className="mt-5 text-sm">{error}</p>}
  </section>
}
```

Replace the three-way `setError` fallback above with the exact expression below; the `??` chain in the draft is unreachable past its second operand:

```tsx
      const refused = describeCenterRefusal(watcher.refusal())
      const own = cause instanceof EnsureDeployedError ? DEPLOY_FAILED : cause instanceof Error && cause.message ? cause.message : DEPLOY_UNAVAILABLE
      setError(refused?.message ?? own)
```

- [ ] **Step 3: Run**

```bash
npx vitest run test/deploy-chains-ui.test.tsx && npm run typecheck && npm run lint
```

Expected: all eight tests pass. `0.0018 ETH` is `900_000n * 2_000_000_000n`. `recordDeployment` is reached through `watchDeployRefusal`'s client, which forwards it, so the mock sees the input `relayPaid` returned. If the SDK's `requestRelay` shape or `relayPaid`'s return contract differs from the Global Constraints, stop and report rather than adapting the panel.

- [ ] **Step 4: Commit**

```bash
git add src/components/DeployChains.tsx test/deploy-chains-ui.test.tsx
git commit -m "$(cat <<'EOF'
Pick the networks a published project is deployed on, free or paid

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The intent page uses the panel, and its redirect names the intent

**Files:**
- Modify: `src/components/IntentProject.tsx`
- Test: `test/intent-project-ui.test.tsx`

**Interfaces:**
- Consumes: `DeployChains`, `decodeFundIntent`.
- Produces: no new export. `IntentProject` keeps its props.

- [ ] **Step 1: Write the failing tests**

In `test/intent-project-ui.test.tsx`, extend the mocked client with the new methods:

```tsx
const runtime = vi.hoisted(() => ({ getIntent: vi.fn(), requestDeploy: vi.fn(), requestRelay: vi.fn(), recordDeployment: vi.fn() }))
vi.mock('@/lib/jbcenter-client', () => ({ jbCenterClient: {
  getIntent: runtime.getIntent, requestDeploy: runtime.requestDeploy,
  requestRelay: runtime.requestRelay, recordDeployment: runtime.recordDeployment,
} }))
```

and add `runtime.requestRelay.mockReset().mockRejectedValue(new Error('no relay in this test'))` to `beforeEach`.

Replace the test named `says a project on unsponsored networks has to be created with a transaction` with:

```tsx
  it('offers Ethereum as a chain the reader pays for, beside the free ones', async () => {
    runtime.getIntent.mockResolvedValue(intent({ envelope: envelopeFor([call(1), call(8453)]) }))
    await render()
    expect(host.textContent).toContain('free')
    expect(host.textContent).toContain('costs gas')
    expect(button('Deploy selected')).toBeTruthy()
  })
```

Replace the redirect expectations. In `opens the created project immediately when one already exists`:

```tsx
    expect(navigate.replace).toHaveBeenCalledWith(`/project/84532/7?intent=${intentId}`)
```

In `deploys through Center, reports each chain, and opens the created project`:

```tsx
    await act(async () => { button('Deploy selected')!.click() })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)) })
    expect(runtime.requestDeploy).toHaveBeenCalledWith(intentId, expect.objectContaining({ chainIds: [8453] }))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)) })
    expect(navigate.replace).toHaveBeenCalledWith(`/project/8453/42?intent=${intentId}`)
```

and add, after the `links the chain that was created when another chain ended the project` test:

```tsx
  it('opens the first deployed chain in the intent’s own order', async () => {
    const envelope = envelopeFor([call(10), call(8453)])
    runtime.getIntent.mockResolvedValue(intent({ envelope, deployments: [deployment(8453, '42'), deployment(10, '43')] }))
    await render()
    expect(navigate.replace).toHaveBeenCalledWith(`/project/10/43?intent=${intentId}`)
  })
```

Every other test in the file that clicks `button('Deploy')` now clicks `button('Deploy selected')`; update those call sites and nothing else about them. The `holds a linked project on its progress until its last chain is created` test keeps its name and its assertions, with the button renamed.

```bash
npx vitest run test/intent-project-ui.test.tsx
```

Expected: fails.

- [ ] **Step 2: Hand the deploy to the panel**

In `src/components/IntentProject.tsx`, delete the `STEP_LABELS`, `DEPLOY_UNAVAILABLE`, `DEPLOY_FAILED`, `UNSPONSORED` and `deployStopped` constants, the `deploy` function, the `deploying`/`steps`/`error`/`stopped` state, the `run` ref and the `ensureDeployed`, `isSponsorable`, `EnsureDeployedError`, `describeCenterRefusal`, `watchDeployRefusal` imports. Add:

```tsx
import { DeployChains } from '@/components/DeployChains'
```

Replace the redirect effect with:

```tsx
  const [running, setRunning] = useState(false)
  const deployment = terms ? intent.data?.deployments.find(item => item.chainId === terms.chainIds.find(chainId =>
    intent.data?.deployments.some(row => row.chainId === chainId))) : undefined
  useEffect(() => {
    // A reader who arrives at a project that already exists opens it. A deploy
    // started here keeps its per-chain progress until that run resolves, so a
    // linked project never opens on half of itself.
    if (!deployment || running) return
    router.replace(`/project/${deployment.chainId}/${deployment.projectId}?intent=${intentId}`)
  }, [deployment, running, router, intentId])
```

`terms` is computed below the effect today; move the `let terms` block and its `decodeFundIntent` call above the effect so the chain order is available to it, and keep `isFullyDeployed` out of the module.

Replace the whole `isSponsorable(...) ? <section …> : <p …>` block with:

```tsx
    {intent.data && <DeployChains intent={intent.data} heading="Deploy" chainIds={terms.chainIds}
      onDeployed={() => { setRunning(true); void intent.refetch() }} />}
```

and set `running` back to false when the panel's run ends. The panel reports every step through `onDeployed`, and the last report is the one that finishes the run, so hold the redirect on an in-flight run with a ref the panel updates:

```tsx
  onDeployed={() => { void intent.refetch() }}
  onRunningChange={setRunning}
```

Add that prop to `DeployChains` in Task 2's file:

```tsx
export function DeployChains({ intent, heading, chainIds, onDeployed, onRunningChange }: {
  …
  onRunningChange?: (running: boolean) => void
})
```

and call it from `deploy`: `setDeploying(true); onRunningChange?.(true)` at the start and `setDeploying(false); onRunningChange?.(false)` in the `finally`.

- [ ] **Step 3: Run**

```bash
npx vitest run test/intent-project-ui.test.tsx test/deploy-chains-ui.test.tsx && npm run typecheck && npm run lint
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/components/IntentProject.tsx src/components/DeployChains.tsx test/intent-project-ui.test.tsx
git commit -m "$(cat <<'EOF'
Deploy a published project one network at a time from its own link

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Show preview, then create

**Files:**
- Create: `src/lib/create-preview.ts`
- Create: `src/components/IntentProjectView.tsx`
- Create: `src/components/CreatePreview.tsx`
- Create: `src/app/create/preview/page.tsx`
- Modify: `src/components/IntentProject.tsx`
- Modify: `src/components/LiveCreate.tsx`
- Test: `test/create-preview-ui.test.tsx`, `test/fund-deploy-intent-ui.test.tsx`

**Interfaces:**
- Consumes: `CREATE_DRAFT_KEY`, `normalizeCreateDraft` from `../../web/create-model.mjs`; `plannedNetworks` from `../../web/create-networks.mjs`; everything `prepareIntent` already consumes in `LiveCreate`.
- Produces:
  ```ts
  // src/lib/create-preview.ts
  export function loadCreateValues(): CreateValues | null

  // src/components/IntentProjectView.tsx
  export type IntentProjectDisplay = {
    name: string; location?: string | null; logoUrl?: string | null; coverUrl?: string | null
    description?: string | null; detailsUnavailable?: boolean
    owner: string; ownerProfile?: { name?: string; introduction?: string; photoUrl?: string }
    chainIds: readonly number[]; tokenName: string; ticker: string
    mustStartAtOrAfter: number; status: string; multisigs?: string
  }
  export function IntentProjectView({ display, banner, actions }: {
    display: IntentProjectDisplay; banner?: ReactNode; actions?: ReactNode
  }): ReactNode

  // src/components/CreatePreview.tsx
  export default function CreatePreview(): ReactNode
  ```
- `FundDeploy` keeps its props. `prepareIntent` and `walletCanPublish` move from `LiveCreate.tsx` to `CreatePreview.tsx` unchanged except for where the values come from.

- [ ] **Step 1: Write the failing tests**

Create `test/create-preview-ui.test.tsx`:

```tsx
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@bananapus/nana-sdk-core', async importOriginal => (await import('./fixtures/homerun-deployer')).withHomerunDeployer(await importOriginal()))

import type { Hex } from 'viem'
import { CREATE_DEFAULTS, CREATE_DRAFT_KEY } from '../web/create-model.mjs'
import { FUND_LAUNCH_KEY, decodeLaunchSession } from '../src/lib/fund-launch-session'

const wallet = '0x1111111111111111111111111111111111111111'
const intentId = '3f0f2f4c-0f3f-4f2f-8f1f-0f2f3f4f5f6f'
const contentHash = `0x${'ab'.repeat(32)}` as Hex
const signature = `0x${'cd'.repeat(65)}` as Hex
const publicationMessage = `Juice Central project intent\nVersion: 1\nContent hash: ${contentHash}`

const runtime = vi.hoisted(() => ({
  address: wallet as string | undefined, centerWallet: false, safe: false, openSignIn: vi.fn(),
  readContract: vi.fn(), getBlock: vi.fn(), getCode: vi.fn(), publish: vi.fn(), checkDeployment: vi.fn(),
  signMessage: vi.fn(), review: vi.fn(), prepareIntent: vi.fn(), publishIntent: vi.fn(),
}))
const navigate = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => navigate }))
vi.mock('next/image', () => ({ default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} /> }))
vi.mock('@wagmi/core', () => ({
  getAccount: () => ({ address: runtime.address }),
  getPublicClient: () => ({ readContract: runtime.readContract, getBlock: runtime.getBlock, getCode: runtime.getCode }),
  signMessage: runtime.signMessage,
}))
vi.mock('@/providers/Providers', () => ({ wagmiConfig: {} }))
vi.mock('@/hooks/useWallet', () => ({ useWallet: () => ({ address: runtime.address, isCenterWallet: runtime.centerWallet, openSignIn: runtime.openSignIn }) }))
vi.mock('@/components/WalletButton', () => ({ WalletButton: () => <span>Wallet</span> }))
vi.mock('@/lib/safe-connector', () => ({ isSafeConnection: () => runtime.safe, waitForSafeExecutionHash: vi.fn() }))
vi.mock('@/lib/publish-fund-project-metadata', () => ({ publishFundProjectMetadata: runtime.publish }))
vi.mock('@/lib/fund-launch-verification', async importOriginal => ({
  ...await importOriginal<typeof import('../src/lib/fund-launch-verification')>(),
  checkLaunchDeployment: runtime.checkDeployment,
}))
vi.mock('@/lib/transaction-review', () => ({ requireTransactionReview: runtime.review }))
vi.mock('@/lib/jbcenter-client', () => ({ jbCenterClient: { prepareIntent: runtime.prepareIntent, publishIntent: runtime.publishIntent } }))

import CreatePreview from '../src/components/CreatePreview'

const saved = (overrides: Record<string, unknown> = {}) => ({
  raw: {
    ...CREATE_DEFAULTS,
    name: 'Neighborhood Workshop',
    location: 'Florianópolis',
    description: 'Shared tools that earn revenue through community use.',
    fundTokenName: 'Neighborhood Workshop FUND',
    fundTicker: 'FUND',
    photo: 'data:image/jpeg;base64,/9j/preview',
    ownerMode: 'existing', ownerWallet: wallet, ownerIsOperator: true,
    operatorMode: 'existing', operatorWallet: wallet,
    networks: ['base'], networkEnvironment: 'production',
    ...overrides,
  },
  step: 4,
  incomeDefaultsVersion: 3,
})

describe('the preview of a project that is not created yet', () => {
  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(CREATE_DRAFT_KEY, JSON.stringify(saved()))
    runtime.address = wallet
    runtime.centerWallet = false
    runtime.safe = false
    runtime.openSignIn.mockReset()
    runtime.readContract.mockReset().mockResolvedValue(0n)
    runtime.getBlock.mockReset().mockResolvedValue({ timestamp: 1_800_000_000n })
    runtime.getCode.mockReset().mockResolvedValue('0x6000')
    runtime.publish.mockReset().mockResolvedValue({ cid: 'bafkreimetadata' })
    runtime.checkDeployment.mockReset().mockResolvedValue(undefined)
    runtime.review.mockReset().mockResolvedValue(undefined)
    runtime.signMessage.mockReset().mockResolvedValue(signature)
    runtime.prepareIntent.mockReset().mockImplementation(async (envelope: unknown) => ({ contentHash, message: publicationMessage, envelope }))
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
  const render = async () => { await act(async () => root.render(<CreatePreview />)) }

  it('renders the saved setup as the project page, and says nothing is created', async () => {
    await render()
    expect(host.textContent).toContain('Preview. Nothing is created yet.')
    expect(host.textContent).toContain('Neighborhood Workshop')
    expect(host.textContent).toContain('Florianópolis')
    expect(host.textContent).toContain('Shared tools that earn revenue through community use.')
    expect(host.textContent).toContain('Neighborhood Workshop FUND')
    expect(host.textContent).toContain('Base')
    expect(host.textContent).toContain(wallet)
    expect(host.querySelector('img[alt*="cover"]')?.getAttribute('src')).toBe('data:image/jpeg;base64,/9j/preview')
    expect(button('Edit')).toBeTruthy()
    expect(button('Create')).toBeTruthy()
  })

  it('names a multisig the project will create, without claiming an address', async () => {
    localStorage.setItem(CREATE_DRAFT_KEY, JSON.stringify(saved({
      ownerMode: 'create', ownerSigners: [`0x${'1'.repeat(40)}`, `0x${'2'.repeat(40)}`], ownerThreshold: 2, ownerWallet: '',
    })))
    await render()
    expect(host.textContent).toContain('2/2 approvals')
    expect(host.textContent).toContain(`0x${'1'.repeat(40)}`)
    expect(host.textContent).not.toContain('Deploys on first use')
  })

  it('goes back to the setup without changing it', async () => {
    await render()
    const before = localStorage.getItem(CREATE_DRAFT_KEY)
    await act(async () => { button('Edit')!.click() })
    expect(navigate.push).toHaveBeenCalledWith('/create')
    expect(localStorage.getItem(CREATE_DRAFT_KEY)).toBe(before)
  })

  it('publishes the intent and opens its page', async () => {
    await render()
    await act(async () => { button('Create')!.click() })
    const review = runtime.review.mock.calls[0][0]
    expect(review.kind).toBe('authorization')
    expect(review.calls[0].functionName).toBe('launchFundFor')
    expect(review.calls[0].from).toBeUndefined()
    expect(runtime.signMessage).toHaveBeenCalledWith({}, { account: wallet, message: publicationMessage })
    const session = decodeLaunchSession(localStorage.getItem(FUND_LAUNCH_KEY)!)
    expect(session.transport).toBe('intent')
    expect(session.intentId).toBe(intentId)
    expect(navigate.push).toHaveBeenCalledWith(`/intent/${intentId}`)
  })

  it('asks an unconnected visitor to sign in, and publishes nothing', async () => {
    runtime.address = undefined
    await render()
    await act(async () => { button('Create')!.click() })
    expect(runtime.openSignIn).toHaveBeenCalled()
    expect(runtime.publishIntent).not.toHaveBeenCalled()
  })

  it('says a Safe or passkey connection has to create with a transaction', async () => {
    runtime.safe = true
    await render()
    await act(async () => { button('Create')!.click() })
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('create with a transaction')
    expect(runtime.publishIntent).not.toHaveBeenCalled()
  })

  it('sends a visitor with no saved setup back to the form', async () => {
    localStorage.removeItem(CREATE_DRAFT_KEY)
    await render()
    expect(host.textContent).toContain('This project’s setup could not be read in this browser.')
    expect(host.querySelector<HTMLAnchorElement>('a[href="/create"]')).toBeTruthy()
    expect(button('Create')).toBeUndefined()
  })
})
```

In `test/fund-deploy-intent-ui.test.tsx`, replace the four tests named `offers the no-transaction path first on sponsored networks, with the transaction path kept`, `keeps the transaction path alone for mainnet, a Safe and a Center wallet`, `offers the no-transaction path when a new multisig is planned` and `reviews the Safe creation before the launch, and publishes both`, and the test named `reviews the exact calls, signs once, saves the published project and opens its page`, with:

```tsx
  it('offers one way forward, the preview', async () => {
    await render()
    expect(button('Show preview')).toBeTruthy()
    expect(button('Create project')).toBeUndefined()
    expect(button('Create without a transaction')).toBeUndefined()
    expect(button('Create with a transaction')).toBeUndefined()
    await act(async () => button('Show preview')!.click())
    expect(navigate.push).toHaveBeenCalledWith('/create/preview')
  })

  it('offers the preview on mainnet too', async () => {
    await render({ networks: ['ethereum', 'base'] })
    expect(button('Show preview')).toBeTruthy()
  })

  it('keeps the transaction path for a connection Center cannot verify', async () => {
    runtime.safe = true
    await render()
    expect(button('Show preview')).toBeTruthy()
    expect(button('Create with a transaction')).toBeTruthy()
    runtime.safe = false
    runtime.centerWallet = true
    await render()
    expect(button('Create with a transaction')).toBeTruthy()
  })

  it('shows the preview before a wallet is connected', async () => {
    runtime.wallet = undefined
    await render()
    expect(button('Show preview')!.disabled).toBe(false)
  })
```

Change the `useWallet` mock in that file to read a mutable address, and reset it in `beforeEach`:

```tsx
vi.mock('@/hooks/useWallet', () => ({ useWallet: () => ({ address: runtime.wallet, isCenterWallet: runtime.centerWallet, openSignIn: vi.fn() }) }))
```

with `wallet: wallet as string | undefined` in the hoisted `runtime` and `runtime.wallet = wallet` in `beforeEach`. Add `navigate.push.mockReset()` where it is already reset. The remaining tests in that file (the published-session view, the restored record) keep their assertions.

```bash
npx vitest run test/create-preview-ui.test.tsx test/fund-deploy-intent-ui.test.tsx
```

Expected: both fail. `CreatePreview` does not exist, and the create step still offers the old buttons.

- [ ] **Step 2: Read the saved setup back**

Create `src/lib/create-preview.ts`:

```ts
import { CREATE_DRAFT_KEY, CREATE_DEFAULTS, normalizeCreateDraft } from '../../web/create-model.mjs'
import type { CreateValues } from '@/components/CreateFlow'

type Normalized = { valid: boolean; values: CreateValues }

/** The setup the create form saved in this browser, or nothing if it cannot be read. */
export function loadCreateValues(): CreateValues | null {
  let saved: unknown
  try { saved = JSON.parse(localStorage.getItem(CREATE_DRAFT_KEY) || 'null') }
  catch { return null }
  const raw = (saved as { raw?: Record<string, unknown> } | null)?.raw
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const merged: Record<string, unknown> = { ...CREATE_DEFAULTS }
  for (const key of Object.keys(CREATE_DEFAULTS)) {
    if (Object.hasOwn(raw, key)) merged[key] = raw[key]
  }
  const normalized = normalizeCreateDraft(merged) as unknown as Normalized
  return normalized.valid ? normalized.values : null
}
```

- [ ] **Step 3: Extract the published-project presentation**

Create `src/components/IntentProjectView.tsx` by moving the JSX `IntentProject` returns today, with the deploy section replaced by the `actions` slot:

```tsx
'use client'

import Image from 'next/image'
import type { ReactNode } from 'react'
import { displayChainName } from '@/lib/chainDisplay'

export type IntentProjectDisplay = {
  name: string
  location?: string | null
  logoUrl?: string | null
  coverUrl?: string | null
  description?: string | null
  detailsUnavailable?: boolean
  owner: string
  ownerProfile?: { name?: string; introduction?: string; photoUrl?: string }
  chainIds: readonly number[]
  tokenName: string
  ticker: string
  mustStartAtOrAfter: number
  status: string
  multisigs?: string
}

/** Everything here comes from signed calls or saved setup values; no chain is read. */
export function IntentProjectView({ display, banner, actions }: {
  display: IntentProjectDisplay
  banner?: ReactNode
  actions?: ReactNode
}) {
  const { name } = display
  return <div className="grid gap-7">
    {banner}
    <section className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid min-w-0 gap-2">
          <h1 className="text-5xl sm:text-6xl">{name}</h1>
          {display.location && <p className="text-sm">{display.location}</p>}
        </div>
        {display.logoUrl && <Image unoptimized src={display.logoUrl} width={112} height={112} alt={`${name} logo`} />}
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-4 p-0 text-sm">
        <li>Status: {display.status}</li>
        <li>Networks: {display.chainIds.map(displayChainName).join(', ')}</li>
        <li>FUND token: {display.tokenName} ({display.ticker})</li>
        <li>Contributions open: {display.mustStartAtOrAfter * 1000 > Date.now() ? new Date(display.mustStartAtOrAfter * 1000).toLocaleString() : 'as soon as it is created'}</li>
      </ul>
      <p className="break-all text-sm">Owner: {display.owner}</p>
    </section>

    {actions}

    {display.multisigs && <section className="rounded-md border border-[#c4cdbb] bg-[#fffefa] p-5 sm:p-7">
      <h2 className="mb-5 text-3xl">Multisigs</h2>
      <p>Juicebox Center’s sponsor creates these Safes on {display.chainIds.map(displayChainName).join(', ')} along with the project. Each address is fixed by its owners, its approval policy and its salt, so the project is theirs whether the Safe exists yet or not.</p>
      <p className="mt-5 whitespace-pre-line break-all text-sm">{display.multisigs}</p>
    </section>}

    <section className="rounded-md border border-[#c4cdbb] bg-[#fffefa] p-5 sm:p-7">
      <h2 className="mb-5 text-3xl">About</h2>
      {display.detailsUnavailable && <p className="mb-5 text-sm">The project details could not be loaded. The terms above are read from the signed project creation.</p>}
      <p className="whitespace-pre-line">{display.description ?? 'Fund an asset with a FUND Juicebox created on first use.'}</p>
      {display.coverUrl && <Image unoptimized src={display.coverUrl} width={1200} height={675} alt={`${name} cover`} className="mt-5 max-h-[480px] w-full rounded-md object-cover" />}
      {display.ownerProfile && <div className="mt-7 grid gap-2">
        <h3 className="text-2xl">Owner</h3>
        {display.ownerProfile.photoUrl && <Image unoptimized src={display.ownerProfile.photoUrl} width={96} height={96} alt={display.ownerProfile.name ? `${display.ownerProfile.name} picture` : 'Owner picture'} />}
        {display.ownerProfile.name && <p>{display.ownerProfile.name}</p>}
        {display.ownerProfile.introduction && <p className="whitespace-pre-line text-sm">{display.ownerProfile.introduction}</p>}
      </div>}
    </section>
  </div>
}
```

In `src/components/IntentProject.tsx`, delete that JSX and return:

```tsx
  const name = details.data?.name ?? intent.data?.name ?? 'FUND project'
  return <IntentProjectView
    display={{
      name, location: details.data?.location, logoUrl: details.data?.logoUrl, coverUrl: details.data?.coverUrl,
      description: details.data?.description, detailsUnavailable: details.isError,
      owner: terms.owner, ownerProfile: details.data?.owner,
      chainIds: terms.chainIds, tokenName: terms.tokenName, ticker: terms.ticker,
      mustStartAtOrAfter: terms.mustStartAtOrAfter, status: 'Deploys on first use',
      multisigs: terms.safes.length ? multisigReview(terms.safes) : undefined,
    }}
    actions={intent.data && <DeployChains intent={intent.data} heading="Deploy" chainIds={terms.chainIds}
      onDeployed={() => { void intent.refetch() }} onRunningChange={setRunning} />}
  />
```

Add the `IntentProjectView` import and drop `Image` from that file.

- [ ] **Step 4: Write the preview page**

Create `src/components/CreatePreview.tsx`. Move `walletCanPublish`, `failure`, `message`, `publicClient` and the whole body of `prepareIntent` out of `LiveCreate.tsx` unchanged, taking `values` from `loadCreateValues()` instead of a prop:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAccount, getPublicClient, signMessage } from '@wagmi/core'
import { jbProjectsAbi, type JBChainId } from '@bananapus/nana-sdk-core'
import { v6Address } from '@bananapus/nana-sdk-core/v6'
import { isAddressEqual, toHex, type PublicClient } from 'viem'
import { JBCenterRequestError, describeCenterRefusal, intentPath } from '@bananapus/nana-sdk-core/jbcenter'
import { useWallet } from '@/hooks/useWallet'
import { wagmiConfig } from '@/providers/Providers'
import { WalletButton } from '@/components/WalletButton'
import { IntentProjectView } from '@/components/IntentProjectView'
import { jbCenterClient } from '@/lib/jbcenter-client'
import { loadCreateValues } from '@/lib/create-preview'
import { displayChainName } from '@/lib/chainDisplay'
import { isSafeConnection } from '@/lib/safe-connector'
import { SAFE_CREATE_ABI, SAFE_SINGLETON, multisigCreationData, multisigInitializer, multisigReview, resolveCreateMultisigs } from '@/lib/create-multisig'
import { buildFundLaunch } from '@/lib/fund-contracts'
import { buildFundIntent, fundIntentEligibleChains, publishFundIntent, UNSUPPORTED_CHAINS_MESSAGE } from '@/lib/fund-intent'
import { FUND_LAUNCH_KEY, decodeLaunchSession, discardUnsignedLaunch, sameSender, saveLaunch } from '@/lib/fund-launch-session'
import { checkLaunchDeployment } from '@/lib/fund-launch-verification'
import { publishFundProjectMetadata } from '@/lib/publish-fund-project-metadata'
import { requireTransactionReview } from '@/lib/transaction-review'
import type { CreateValues } from '@/components/CreateFlow'
import { plannedNetworks } from '../../web/create-networks.mjs'

const NO_SETUP = 'This project’s setup could not be read in this browser.'
const BANNER = 'Preview. Nothing is created yet.'
```

The component:

```tsx
export default function CreatePreview() {
  const router = useRouter()
  const { address, openSignIn } = useWallet()
  const [values, setValues] = useState<CreateValues | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { setValues(loadCreateValues()); setLoaded(true) }, [])

  if (!loaded) return <p role="status">Reading your setup…</p>
  if (!values) return <div className="grid justify-items-start gap-4" role="alert">
    <p>{NO_SETUP}</p>
    <a className="btn-secondary" href="/create">Back to the form</a>
  </div>

  const chainIds = plannedNetworks(values).map((chain: { chainId: number }) => chain.chainId)
  const planned = (['owner', 'operator'] as const)
    .filter(role => (role === 'owner' || !values.ownerIsOperator) && values[`${role}Mode`] === 'create')
    .map(role => `${role === 'owner' ? 'Owner' : 'Operator'}: create Safe, ${values[`${role}Threshold`]}/${(values[`${role}Signers`] ?? []).length} approvals. Owners: ${(values[`${role}Signers`] ?? []).join(', ')}.`)
    .join('\n')

  return <IntentProjectView
    banner={<p role="status" className="rounded-md border border-[#c4cdbb] bg-[#eef1e7] p-5 sm:p-7">{BANNER}</p>}
    display={{
      name: values.name, location: values.location, logoUrl: values.ownerPhoto || undefined,
      coverUrl: values.photo || undefined, description: values.description,
      owner: values.ownerMode === 'create' ? 'A multisig this project creates' : values.ownerWallet,
      ownerProfile: values.ownerName || values.ownerIntroduction || values.ownerPhoto
        ? { name: values.ownerName, introduction: values.ownerIntroduction, photoUrl: values.ownerPhoto } : undefined,
      chainIds, tokenName: values.fundTokenName, ticker: values.fundTicker,
      mustStartAtOrAfter: 0, status: 'Not created yet',
      multisigs: planned || undefined,
    }}
    actions={<section className="rounded-md border border-[#c4cdbb] bg-[#eef1e7] p-5 sm:p-7">
      <p>Creating publishes these exact project creations to Juicebox Center and gives you a link anyone can open. You send no transaction and pay no creation fee here.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="quiet-button" disabled={publishing} onClick={() => router.push('/create')}>Edit</button>
        <button type="button" className="create-primary" disabled={publishing} onClick={() => void create(values)}>{publishing ? 'Publishing your project…' : 'Create'}</button>
        {!address && <WalletButton />}
      </div>
      {progress && <p role="status" className="mt-5 text-sm">{progress}</p>}
      {error && <p role="alert" className="mt-5 text-sm">{error}</p>}
    </section>}
  />
}
```

`create(values)` is `prepareIntent`'s body, moved without changes except its first three lines:

```tsx
  async function create(values: CreateValues) {
    if (publishing) return
    if (!address) { openSignIn(); return }
    setPublishing(true); setError(''); setProgress('')
    try {
      if (!walletCanPublish()) throw new Error(WALLET_NEEDS_TRANSACTION_MESSAGE)
      … // every line of prepareIntent from `const chainIds =` to `router.push(intentPath(published.id))`
    } catch (cause) { setError(failure(cause)) }
    finally { setPublishing(false) }
  }
```

with `persist(...)` replaced by `saveLaunch(...)`, since this component holds no session state of its own. Hoist `create` above the early returns so the two `return`s stay where they are; declare it as a `function create(...)` inside the component body.

Create `src/app/create/preview/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { Brand } from '@/components/Brand'
import { WalletButton } from '@/components/WalletButton'
import CreatePreview from '@/components/CreatePreview'

export const metadata: Metadata = {
  title: 'Preview your project',
  description: 'The project page Homerun publishes, rendered from your setup before anything is created.',
  robots: { index: false, follow: false },
}

export default function CreatePreviewPage() {
  return <div className="project-page live-contract-page">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><Brand /><WalletButton /></header>
    <main id="main" className="mx-auto max-w-[1220px] px-5 py-10 sm:py-14" tabIndex={-1}><CreatePreview /></main>
  </div>
}
```

- [ ] **Step 5: One button on the create step**

In `src/components/LiveCreate.tsx`, delete `prepareIntent`, `walletCanPublish`, `WALLET_NEEDS_TRANSACTION_MESSAGE`, `failure`, and the imports only they used (`signMessage`, `intentPath`, `describeCenterRefusal`, `JBCenterRequestError`, `jbCenterClient`, `buildFundIntent`, `publishFundIntent`, `UNSUPPORTED_CHAINS_MESSAGE`, `requireTransactionReview`, `multisigCreationData`, `multisigInitializer`, `SAFE_CREATE_ABI`, `SAFE_SINGLETON`, `isAddressEqual`). Keep every import the transaction paths use.

Replace the eligibility lines with:

```tsx
  // Juicebox Center recovers the publisher from a signature, so a passkey or Safe
  // connection cannot publish and keeps the transaction path. `loaded` keeps this
  // first client render equal to the server's.
  const needsTransaction = loaded && (isCenterWallet || isSafeConnection(wagmiConfig))
```

and replace the `{!session ? intentEligible ? … : … }` branch with:

```tsx
    {!session ? <>
      <button type="button" className="create-primary" disabled={preparing || !loaded} onClick={() => router.push('/create/preview')}>Show preview</button>
      <p className="text-sm">The preview is the project page this creates. Nothing is created until you press Create there.</p>
      {needsTransaction && <button type="button" className="quiet-button" disabled={preparing || !loaded || !address} onClick={() => void prepare()}>Create with a transaction</button>}
    </>
```

leaving the `session` branches exactly as they are. `intentEligible`, `selectionKey`'s only other reader and `fundIntentEligibleChains`'s import are removed from this file if eslint reports them unused; `selectionKey` is still read by the lock effect, so keep it.

- [ ] **Step 6: Run**

```bash
npx vitest run test/create-preview-ui.test.tsx test/fund-deploy-intent-ui.test.tsx test/intent-project-ui.test.tsx && npm run typecheck && npm run lint && npm run build
```

Expected: all green, and the build emits the `/create/preview` route.

- [ ] **Step 7: Commit**

```bash
git add src/lib/create-preview.ts src/components/IntentProjectView.tsx src/components/CreatePreview.tsx src/app/create/preview/page.tsx src/components/IntentProject.tsx src/components/LiveCreate.tsx test/create-preview-ui.test.tsx test/fund-deploy-intent-ui.test.tsx
git commit -m "$(cat <<'EOF'
Show the finished project page before anything is created

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The remaining chains, from the project page

**Files:**
- Create: `src/lib/fund-intent-lookup.ts`
- Create: `src/components/DeployRemainingChains.tsx`
- Modify: `src/components/FundProject.tsx`
- Modify: `src/app/project/[chainId]/[projectId]/page.tsx`
- Test: `test/fund-intent-lookup.test.ts`, `test/fund-project-ui.test.tsx`

**Interfaces:**
- Consumes: `jbCenterClient.getIntent`, `jbCenterClient.searchIntents`, `decodeFundIntent`, `loadLaunchSession`, `DeployChains`.
- Produces:
  ```ts
  // src/lib/fund-intent-lookup.ts
  export async function findProjectIntent(
    client: Pick<JBCenterClient, 'getIntent' | 'searchIntents'>,
    project: { chainId: number; projectId: string },
    hints: readonly (string | null | undefined)[],
    owner?: Address,
    options?: JBCenterRequestOptions,
  ): Promise<JBCenterIntent | null>

  // src/components/DeployRemainingChains.tsx
  export function DeployRemainingChains({ chainId, projectId, owner, intentId }: {
    chainId: number; projectId: string; owner?: Address; intentId?: string
  }): ReactNode
  ```
- `FundProject` takes one new optional prop, `intentId?: string`.

- [ ] **Step 1: Write the failing tests**

Create `test/fund-intent-lookup.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeFunctionData, zeroHash } from 'viem'
import { HOMERUN_DEPLOYER } from './fixtures/homerun-deployer'
import { homerunDeployerAbi } from '../src/lib/income-contracts'
import { findProjectIntent } from '../src/lib/fund-intent-lookup'

const owner = '0x1111111111111111111111111111111111111111'
const first = '3f0f2f4c-0f3f-4f2f-8f1f-0f2f3f4f5f6f'
const second = '4f0f2f4c-0f3f-4f2f-8f1f-0f2f3f4f5f6f'
const call = (chainId: number) => ({
  chainId, to: HOMERUN_DEPLOYER,
  data: encodeFunctionData({
    abi: homerunDeployerAbi, functionName: 'launchFundFor',
    args: [owner, 'ipfs://bafkreimetadata', 'Neighborhood Workshop FUND', 'FUND', 0, zeroHash, []],
  }),
})
const intent = (id: string, chainIds: number[], deployments: { chainId: number; projectId: string }[]) => ({
  id, status: 'undeployed', contentHash: `0x${'ab'.repeat(32)}`, publisher: owner, signature: `0x${'cd'.repeat(65)}`,
  createdAt: new Date(0).toISOString(), deploys: [],
  deployments: deployments.map(row => ({ ...row, transactionHash: `0x${'ef'.repeat(32)}`, createdAt: new Date(0).toISOString() })),
  name: 'Neighborhood Workshop', description: null, tagline: null, tags: [], logoUri: null, owner,
  envelope: {
    format: 'homerun.money/fund.v1', deploymentVersion: '6', chainIds,
    deploymentCalls: chainIds.map(call),
    jb: { app: 'homerun', kind: 'fund', name: 'Neighborhood Workshop', owner, chainIds, tokenName: 'Neighborhood Workshop FUND', ticker: 'FUND', salt: zeroHash, mustStartAtOrAfter: 0, projectUri: 'ipfs://bafkreimetadata' },
  },
})
const clientFor = (intents: Record<string, unknown>, items: { intentId: string; chainIds: number[] }[] = []) => ({
  getIntent: async (id: string) => { if (!intents[id]) throw new Error('not found'); return intents[id] as never },
  searchIntents: async () => ({ items: items as never, totalCount: items.length, nextCursor: null }),
})

test('a hinted intent that deployed this project is the project’s intent', async () => {
  const client = clientFor({ [first]: intent(first, [8453, 10], [{ chainId: 8453, projectId: '42' }]) })
  const found = await findProjectIntent(client as never, { chainId: 8453, projectId: '42' }, [first])
  assert.equal(found?.id, first)
})

test('a hint that names another project, or no project, is ignored', async () => {
  const client = clientFor({ [first]: intent(first, [8453], [{ chainId: 8453, projectId: '43' }]) })
  assert.equal(await findProjectIntent(client as never, { chainId: 8453, projectId: '42' }, [first]), null)
  assert.equal(await findProjectIntent(client as never, { chainId: 8453, projectId: '42' }, ['not-an-id', null, undefined]), null)
  assert.equal(await findProjectIntent(client as never, { chainId: 8453, projectId: '42' }, [second]), null)
})

test('an intent the owner published is found without a hint', async () => {
  const client = clientFor(
    { [second]: intent(second, [8453, 1], [{ chainId: 8453, projectId: '42' }]) },
    [{ intentId: second, chainIds: [8453, 1] }, { intentId: first, chainIds: [10] }],
  )
  const found = await findProjectIntent(client as never, { chainId: 8453, projectId: '42' }, [], owner)
  assert.equal(found?.id, second)
})

test('an intent that is not a Homerun FUND is not this project’s intent', async () => {
  const foreign = intent(first, [8453], [{ chainId: 8453, projectId: '42' }])
  foreign.envelope.deploymentCalls = [{ chainId: 8453, to: HOMERUN_DEPLOYER, data: '0xdeadbeef' }] as never
  const client = clientFor({ [first]: foreign })
  assert.equal(await findProjectIntent(client as never, { chainId: 8453, projectId: '42' }, [first]), null)
})
```

In `test/fund-project-ui.test.tsx`, mock the panel and assert the id reaches it. Add beside the other component mocks:

```tsx
vi.mock('@/components/DeployRemainingChains', () => ({ DeployRemainingChains: ({ chainId, projectId, intentId, owner }: { chainId: number; projectId: string; intentId?: string; owner?: string }) =>
  <span data-testid="also-deploy" data-chain-id={chainId} data-project-id={projectId} data-intent-id={intentId} data-owner={owner}>Also deploy</span> }))
```

and a test in the existing describe:

```tsx
  it('offers the remaining networks of the intent this project came from', async () => {
    await render({ intentId: '3f0f2f4c-0f3f-4f2f-8f1f-0f2f3f4f5f6f' })
    const panel = host.querySelector('[data-testid="also-deploy"]')
    expect(panel?.getAttribute('data-intent-id')).toBe('3f0f2f4c-0f3f-4f2f-8f1f-0f2f3f4f5f6f')
    expect(panel?.getAttribute('data-project-id')).toBe('42')
  })
```

using that file's own `render` helper, extended to pass extra `FundProject` props.

```bash
npx vitest run test/fund-intent-lookup.test.ts test/fund-project-ui.test.tsx
```

Expected: both fail.

- [ ] **Step 2: Find the intent a project came from**

Create `src/lib/fund-intent-lookup.ts`:

```ts
import type { Address } from 'viem'
import type { JBCenterClient, JBCenterIntent, JBCenterRequestOptions } from '@bananapus/nana-sdk-core/jbcenter'
import { decodeFundIntent } from './fund-intent'

const INTENT_ID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i
const SEARCH_LIMIT = 24
const CANDIDATES = 3

/** A project belongs to an intent only when that intent's own record deployed it. */
function deploysProject(intent: JBCenterIntent, project: { chainId: number; projectId: string }): boolean {
  if (!intent.deployments.some(row => row.chainId === project.chainId && row.projectId === project.projectId)) return false
  try { decodeFundIntent(intent); return true } catch { return false }
}

export async function findProjectIntent(
  client: Pick<JBCenterClient, 'getIntent' | 'searchIntents'>,
  project: { chainId: number; projectId: string },
  hints: readonly (string | null | undefined)[],
  owner?: Address,
  options?: JBCenterRequestOptions,
): Promise<JBCenterIntent | null> {
  const seen = new Set<string>()
  const read = async (id: string) => {
    if (seen.has(id)) return null
    seen.add(id)
    const intent = await client.getIntent(id, options).catch(() => null)
    return intent && deploysProject(intent, project) ? intent : null
  }
  for (const hint of hints) {
    if (!hint || !INTENT_ID.test(hint)) continue
    const found = await read(hint)
    if (found) return found
  }
  if (!owner) return null
  const page = await client.searchIntents({ owner, limit: SEARCH_LIMIT }, options).catch(() => null)
  const candidates = (page?.items ?? []).filter(item => item.chainIds.includes(project.chainId)).slice(0, CANDIDATES)
  for (const item of candidates) {
    const found = await read(item.intentId)
    if (found) return found
  }
  return null
}
```

- [ ] **Step 3: Offer the remaining chains**

Create `src/components/DeployRemainingChains.tsx`:

```tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import { DeployChains } from '@/components/DeployChains'
import { jbCenterClient } from '@/lib/jbcenter-client'
import { decodeFundIntent } from '@/lib/fund-intent'
import { findProjectIntent } from '@/lib/fund-intent-lookup'
import { loadLaunchSession } from '@/lib/fund-launch-session'

/** The creator's own browser knows the intent; a link says it; otherwise Center is asked. */
export function DeployRemainingChains({ chainId, projectId, owner, intentId }: {
  chainId: number
  projectId: string
  owner?: Address
  intentId?: string
}) {
  const [saved, setSaved] = useState<string | undefined>(undefined)
  useEffect(() => { try { setSaved(loadLaunchSession()?.intentId) } catch { setSaved(undefined) } }, [])
  const intent = useQuery({
    queryKey: ['project-intent', chainId, projectId, intentId ?? null, saved ?? null, owner ?? null],
    staleTime: 60_000,
    retry: 1,
    queryFn: ({ signal }) => findProjectIntent(jbCenterClient, { chainId, projectId }, [intentId, saved], owner, { signal }),
  })
  if (!intent.data) return null
  let chainIds: number[]
  try { chainIds = decodeFundIntent(intent.data).chainIds } catch { return null }
  if (chainIds.every(id => intent.data!.deployments.some(row => row.chainId === id))) return null
  return <DeployChains intent={intent.data} heading="Also deploy on" chainIds={chainIds} onDeployed={() => void intent.refetch()} />
}
```

In `src/components/FundProject.tsx`, add the import, take the prop and pass it down:

```tsx
export function FundProject({ chainId, projectId, intentId }: { chainId: JBChainId; projectId: string; intentId?: string }) {
```

Pass `intentId={intentId}` to `<ProjectActions …>`, add `intentId?: string` to its props type, and inside it build the panel once:

```tsx
  const alsoDeploy = <DeployRemainingChains chainId={chainId} projectId={projectId.toString()} owner={state?.owner} intentId={intentId} />
```

placing it at the start of both `notice` compositions: the pending branch's `notice={<>{alsoDeploy}{notice}</>}` and the loaded branch's `notice={<>{alsoDeploy}{notice}…`.

In `src/app/project/[chainId]/[projectId]/page.tsx`:

```tsx
const INTENT_ID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

type ProjectRouteProps = {
  params: Promise<{ chainId: string; projectId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ProjectPage({ params, searchParams }: ProjectRouteProps) {
  const route = await params
  const query = await searchParams
  const intent = typeof query.intent === 'string' && INTENT_ID.test(query.intent) ? query.intent : undefined
  return <FundProject key={`${route.chainId}:${route.projectId}`} {...projectRoute(route.chainId, route.projectId)} intentId={intent} />
}
```

`generateMetadata` keeps its single `params` argument.

- [ ] **Step 4: Run**

```bash
npx vitest run test/fund-intent-lookup.test.ts test/fund-project-ui.test.tsx test/project-layout.test.tsx && npm run typecheck && npm run lint && npm run build
```

Expected: all green, and the build accepts the widened route props.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fund-intent-lookup.ts src/components/DeployRemainingChains.tsx src/components/FundProject.tsx "src/app/project/[chainId]/[projectId]/page.tsx" test/fund-intent-lookup.test.ts test/fund-project-ui.test.tsx
git commit -m "$(cat <<'EOF'
Offer a created project the networks its intent has not reached

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The browser flow, preview to three chains

**Files:**
- Modify: `test/intent-browser.mjs`
- Modify: `test/create-browser.mjs`

**Interfaces:**
- Consumes: the real Next.js application, the packaged SDK, the modeled Center and the injected test wallet already in `test/intent-browser.mjs`.
- Produces: `npm run test:intent` covering preview, an Edit round trip, Create, and a deploy of two sponsored chains and one relay chain.

- [ ] **Step 1: Teach the modeled Center the new routes**

In `test/intent-browser.mjs`, replace the single-chain record with three chains and add the relay route. Change the saved setup's networks line to:

```js
      networks: ['ethereum', 'optimism', 'base'], networkEnvironment: 'production',
```

Replace `projectId` and the record builder with:

```js
const projectIds = { 1: '7', 10: '41', 8453: '42' }
const relayHash = `0x${'cd'.repeat(32)}`
let queued = []
let recorded = []

function intentRecord() {
  const chains = [...new Set([...queued, ...recorded])]
  return {
    id: intentId, status: chains.length === 3 ? 'deployed' : 'undeployed', contentHash,
    envelope: stored.envelope, publisher: stored.publisher, signature: stored.signature,
    createdAt: timestamp,
    deployments: chains.map(chainId => ({
      chainId, projectId: projectIds[chainId],
      transactionHash: chainId === 1 ? relayHash : transactionHash, createdAt: timestamp,
    })),
    deploys: chains.map(chainId => ({
      chainId, status: 'confirmed',
      transactionHash: chainId === 1 ? relayHash : transactionHash,
      bundleUuid: null, error: null, createdAt: timestamp, updatedAt: timestamp,
    })),
    name: 'Neighborhood Workshop', description: null, tagline: null, tags: [], logoUri: null,
    owner: account.address,
  }
}
```

Replace the deploy route and add the relay route and the deployments route:

```js
  if (url.pathname === `/v1/intents/${intentId}/deploy` && request.method === 'POST') {
    deployRequests++
    return withBody(body => {
      const requested = JSON.parse(body.toString() || '{}').chainIds ?? [10, 8453]
      queued = [...new Set([...queued, ...requested])]
      return json(202, { deploys: intentRecord().deploys })
    })
  }
  if (url.pathname === `/v1/intents/${intentId}/relay` && request.method === 'POST') {
    relayRequests++
    return withBody(body => {
      const { chainId } = JSON.parse(body.toString())
      const calls = stored.envelope.deploymentCalls.filter(call => call.chainId === chainId)
      const launch = calls[calls.length - 1]
      return json(200, {
        chainId,
        to: v6Address('ERC2771Forwarder', chainId),
        value: '0',
        gas: '900000',
        deadline: Math.floor(Date.now() / 1000) + 1_800,
        data: encodeFunctionData({
          abi: erc2771ForwarderAbi,
          functionName: 'execute',
          args: [{ from: SPONSOR, to: launch.to, value: 0n, gas: 900_000n, nonce: 0n, deadline: BigInt(Math.floor(Date.now() / 1000) + 1_800), data: launch.data }],
        }),
        setup: calls.slice(0, -1).map(call => ({ to: call.to, data: call.data, value: '0' })),
      })
    })
  }
  if (url.pathname === `/v1/intents/${intentId}/deployments` && request.method === 'POST') {
    return withBody(body => {
      const deployment = JSON.parse(body.toString())
      recorded = [...new Set([...recorded, deployment.chainId])]
      return json(201, { ...deployment, createdAt: timestamp })
    })
  }
```

Add the imports and constants these use, beside the existing ones:

```js
import { erc2771ForwarderAbi } from '@bananapus/nana-sdk-core'
import { v6Address } from '@bananapus/nana-sdk-core/v6'

// Center's sponsor in this model. It signs nothing here; the forward request is a fixture.
const SPONSOR = '0x0000000000000000000000000000000000005e0d'
let relayRequests = 0
```

Teach the modeled RPC the methods the relay path reads, inside `answer`:

```js
        if (call.method === 'eth_gasPrice') return uint256(2_000_000_000n)
        if (call.method === 'eth_getTransactionCount') return uint256(0n)
        if (call.method === 'eth_getTransactionReceipt') return launchReceipt(chainId)
```

with this builder beside `answerCall`, so the client reads the created project out of the deployer's own event exactly as it does onchain:

```js
/** The receipt the visitor's own relay transaction produces, with one FundLaunched event. */
const launchReceipt = chainId => {
  const calls = stored.envelope.deploymentCalls.filter(call => call.chainId === chainId)
  const launch = calls[calls.length - 1]
  return {
    status: '0x1', blockNumber: uint256(1_000n), blockHash: `0x${'11'.repeat(32)}`,
    transactionHash: relayHash, transactionIndex: '0x0', from: account.address, to: launch.to,
    cumulativeGasUsed: uint256(500_000n), gasUsed: uint256(500_000n), effectiveGasPrice: uint256(2_000_000_000n),
    contractAddress: null, logsBloom: `0x${'00'.repeat(256)}`, type: '0x2',
    logs: [{
      address: launch.to, blockHash: `0x${'11'.repeat(32)}`, blockNumber: uint256(1_000n),
      transactionHash: relayHash, transactionIndex: '0x0', logIndex: '0x0', removed: false,
      topics: encodeEventTopics({
        abi: FUND_LAUNCHED_ABI, eventName: 'FundLaunched',
        args: { projectId: BigInt(projectIds[chainId]), owner: stored.envelope.jb.owner },
      }),
      data: encodeAbiParameters([{ type: 'address' }], [SPONSOR]),
    }],
  }
}
```

extending the viem import with `encodeAbiParameters` and `encodeEventTopics`. This file is plain Node and cannot import `src/lib/income-contracts.ts`, so it states the one event it needs, word for word as that module declares it:

```js
// HomerunDeployer's own event, as `src/lib/income-contracts.ts` declares it.
const FUND_LAUNCHED_ABI = [{
  type: 'event', name: 'FundLaunched', inputs: [
    { name: 'projectId', type: 'uint256', indexed: true },
    { name: 'owner', type: 'address', indexed: true },
    { name: 'caller', type: 'address', indexed: false },
  ],
}]
```

and teach the injected wallet to send, in the `addInitScript` provider:

```js
        if (method === 'eth_sendTransaction') return relayHashForWallet
        if (method === 'eth_estimateGas') return '0xdbba0'
```

passing `relayHashForWallet: relayHash` through that script's argument object beside `address` and `chainId`.

- [ ] **Step 2: Write the failing flow**

Replace the interaction from the create button to the end of the assertions:

```js
  const preview = page.getByRole('button', { name: 'Show preview', exact: true })
  await preview.waitFor()
  assert.equal(await page.getByRole('button', { name: 'Create with a transaction', exact: true }).count(), 0)
  await preview.click()

  await page.waitForURL(`${appOrigin}/create/preview`)
  await page.getByText('Preview. Nothing is created yet.', { exact: true }).waitFor()
  assert.match(await page.locator('main').textContent(), /Neighborhood Workshop/)
  assert.match(await page.locator('main').textContent(), /Ethereum, Optimism, Base/)
  assert.equal(await page.evaluate(() => localStorage.getItem('homerun:fund-launch:v1')), null)

  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.waitForURL(`${appOrigin}/create`)
  await page.getByRole('heading', { name: 'Create your project', exact: true }).waitFor()
  assert.match(await page.locator('#create-review').textContent(), /Neighborhood Workshop/)
  await page.getByRole('button', { name: 'Show preview', exact: true }).click()
  await page.waitForURL(`${appOrigin}/create/preview`)

  await page.getByRole('button', { name: 'Create', exact: true }).click()
  const review = page.getByRole('dialog')
  await review.getByText('Create your project', { exact: false }).first().waitFor()
  await review.getByText('2/2 approvals', { exact: false }).first().waitFor()
  await review.getByRole('checkbox').check()
  await review.getByRole('button', { name: 'Continue to wallet', exact: true }).click()

  await page.waitForURL(`${appOrigin}/intent/${intentId}`)
  await page.getByText('Deploys on first use', { exact: false }).first().waitFor()
  const intentText = await page.locator('main').textContent()
  assert.match(intentText, /Neighborhood Workshop/)
  assert.match(intentText, /free/)
  assert.match(intentText, /Owner: create Safe/)
  assert.match(intentText, new RegExp(SECOND_SIGNER, 'i'))
  await page.getByText(/costs ~[\d.]+ ETH/).first().waitFor()
  assert.deepEqual(errors, [])

  await page.locator('input[type="checkbox"][value="1"]').check()
  await page.getByRole('button', { name: 'Deploy selected', exact: true }).click()
  const relayReview = page.getByRole('dialog')
  await relayReview.getByText('Create this project on Ethereum', { exact: false }).first().waitFor()
  await relayReview.getByRole('checkbox').check()
  await relayReview.getByRole('button', { name: 'Continue to wallet', exact: true }).click()

  await page.waitForURL(new RegExp(`${appOrigin}/project/1/7\\?intent=${intentId}$`), { timeout: 60_000 })

  assert.equal(deployRequests, 1)
  assert.equal(relayRequests >= 1, true)
  assert.deepEqual(queued.sort((a, b) => a - b), [10, 8453])
  assert.deepEqual(recorded, [1])
```

Keep the envelope assertions, changing the chain-scoped ones:

```js
  assert.deepEqual(stored.envelope.chainIds, [1, 10, 8453])
  assert.equal(stored.envelope.deploymentCalls.length, 6)
  assert.deepEqual(stored.envelope.deploymentCalls.map(call => call.chainId), [1, 1, 10, 10, 8453, 8453])
  assert.equal(getAddress(stored.envelope.deploymentCalls[0].to), SAFE_FACTORY)
```

and extend the summary and the final line:

```js
    intentId, deployRequests, relayRequests, intentReads, pageErrors: errors,
    safes: stored.envelope.jb.safes, queued, recorded,
```

```js
  console.log('PASS Homerun: previewed a FUND, published it, deployed two sponsored chains and paid for Ethereum')
```

```bash
npm run test:intent
```

Expected: the assertions drive the work. If the run stops at `/create/preview`, read `test-results/intent/summary.json` and the dev-server output before changing anything: the usual cause is the saved record being rejected by `create-model` validation, which leaves the form on an earlier step.

- [ ] **Step 3: Follow the create step's new button in the form flow**

In `test/create-browser.mjs`, the two assertions that read `Create project` now read `Show preview`, and the preview is offered before a wallet is connected. In the check named `Review defaults to all production networks with accessible icon-only choices`:

```js
    assert.equal(await page.getByRole('button', { name: 'Show preview', exact: true }).isDisabled(), false);
```

and in `Live entry requires a wallet and sign-in cannot create a fake deployment`:

```js
    const prepare = page.getByRole('button', { name: 'Show preview', exact: true });
    assert.equal(await prepare.isDisabled(), false);
    assert.equal(await page.getByRole('button', { name: 'Create with a transaction', exact: true }).count(), 0);
```

with the two later `assert.equal(await prepare.isDisabled(), true)` lines in that check becoming `false`. The check's name and its `localStorage.getItem('homerun:fund-launch:v1')` assertion stay: showing a preview still creates nothing.

```bash
npm run dev   # in another terminal, port 3010
npm run test:create
```

Expected: `test:create` passes with its existing screenshots and axe runs.

- [ ] **Step 4: Commit**

```bash
git add test/intent-browser.mjs test/create-browser.mjs
git commit -m "$(cat <<'EOF'
Preview, create and deploy three networks end to end

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Full gate and the pull request

**Files:** none changed except fixes the gates demand.

- [ ] **Step 1: Every repository gate**

```bash
source ~/.nvm/nvm.sh && nvm use 22
cd /Users/jango/Documents/jb/v6/evm/extensions/homerun-setup-calls
npm run lint && npm run typecheck && npm test && npm run test:live && npm run build && npm run test:intent
npm run dev &   # port 3010, for the two that need it
npm run test:create && npm run test:a11y
```

Expected: all eight pass. Fix anything that fails in place and amend the task commit it belongs to; do not add a follow-up commit that repairs an earlier task.

- [ ] **Step 2: Confirm the untouched paths really are untouched**

```bash
git diff --stat main...HEAD
```

Expected: the only changed files are the ones in the File map. `src/lib/fund-launch-relayr.ts`, `src/lib/fund-launch-session.ts`, `src/lib/fund-launch-verification.ts`, `src/lib/fund-contracts.ts`, `src/lib/create-multisig.ts`, `src/hooks/useSafeTx.ts`, `src/components/CreateFlow.tsx`, `web/create-model.mjs` and everything under INCOME must not appear.

- [ ] **Step 3: Confirm the forbidden word, the emoji rule and the storage key**

```bash
set -o pipefail
git diff main...HEAD -- src test | grep -nEi '^\+.*d''raft' ; git diff main...HEAD | grep -nP '^\+.*[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' ; git diff main...HEAD | grep -n "^+.*homerun:create-"
```

Expected: no output from any of the three. A hit in an unchanged context line is fine; a hit on a `+` line must be removed. New code reaches the saved setup through `CREATE_DRAFT_KEY`, never through the literal.

- [ ] **Step 4: Live check**

On dev Center, publish a FUND on Base Sepolia, Optimism Sepolia and Sepolia from the preview page. Deploy the two sponsored chains from `/intent/<id>`, confirm the redirect lands on `/project/<chainId>/<projectId>?intent=<id>`, then deploy Sepolia from the project page's "Also deploy on" panel with the test wallet paying. Confirm on the explorers that all three projects exist, that the FUND ERC-20 has the same address on all three, and that the sucker pairs match. Repeat once on production with Base and Optimism sponsored, leaving Ethereum for jango. Record the intent id, chain ids, project ids and the relay transaction hash.

- [ ] **Step 5: Open the pull request**

```bash
git push -u origin feat/preview-create
gh pr create --repo mejango/homerun --title "Preview a project, create it, then deploy any network from its link" --body "$(cat <<'EOF'
Creating a FUND is now: fill the form, look at the finished project page, press Create.

- The create step offers one button, "Show preview". A Safe or passkey connection, which Juicebox Center cannot verify, also keeps "Create with a transaction"; the direct, Relayr and Safe paths are otherwise unchanged.
- `/create/preview` renders the published project page from the saved setup and creates nothing. "Edit" returns to the form with the values intact; "Create" pins, reviews, signs, publishes and opens `/intent/<id>`.
- `/intent/<id>` lists every chain with a checkbox: "free" for the ones Center sponsors, "costs ~<amount> ETH" for Ethereum, from the relay request's gas estimate and the current gas price. "Deploy selected" runs one `ensureDeployed`: Center's sponsor lane for the free chains, and for Ethereum a signed forward request the visitor sends from their own wallet. Anyone can deploy.
- A relay request is refused unless it forwards exactly the calls the intent signed, to the canonical forwarder, with the creation fee as its value.
- With one deployment, `/intent/<id>` opens `/project/<chainId>/<projectId>?intent=<id>` of the first deployed chain in the intent's own order, and that page offers the remaining chains under "Also deploy on".

Live check: <fill in from Step 4>.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review

**Spec coverage (section 4, line by line):**

| Spec requirement | Task |
| --- | --- |
| Create step: one button, "Show preview", enabled when the form validates | 4 (the button renders only inside `normalized.valid`, which is the form's own validation gate) |
| It saves the session and opens `/create/preview` | 4 (`CreateFlow` already writes the setup on every change; the button navigates) |
| The transaction, Relayr and direct paths leave the create step | 4 (their code is untouched; only the button that offers them moves behind the Safe/passkey condition) |
| A Safe or passkey connection sees "Create with a transaction" beneath "Show preview" | 4 |
| Preview renders the intent page shell from the saved values | 4 (`IntentProjectView`, shared with `/intent/[id]`) |
| Photos from the browser, planned Safes, chains, token, owner, start | 4 |
| "Preview. Nothing is created yet." | 4 |
| "Edit" returns to the review step with the values intact | 4 (the saved record still carries `step: 4`; nothing is written on the way back) |
| "Create" connects a wallet if needed, then today's `prepareIntent` and `/intent/<id>` | 4 (`prepareIntent` moves line for line) |
| No chain reads on the preview beyond what the create step made | 4 (the preview reads nothing; `resolveCreateMultisigs` runs inside Create, as it does today) |
| Intent page: one checkbox per chain, sponsored labelled "free" | 2, 3 |
| Ethereum labelled "costs ~<amount> ETH" from the relay gas estimate times the gas price plus the fee | 2 |
| "costs gas" while the estimate loads | 2 |
| Deployed chains show a link, no checkbox | 2 |
| "Deploy selected" runs `ensureDeployed({ chainIds })`, sponsored through Center, Ethereum relay-paid | 2 |
| The relay-paid chain is recorded with Center | 1, 2 (`relayPaid` returns `{ chainId, projectId, transactionHash }`; `ensureDeployed` records it) |
| Progress per chain, as today | 2 (the same `STEP_LABELS` list) |
| Anyone may deploy, no ownership check | 2 |
| Redirect to the first deployed chain in the intent's chain order, with `?intent=` | 3 |
| Project page: the same panel for the remaining chains, "Also deploy on" | 5 |
| The page knows its intent from the query, the creator's session, or Center's owner search | 5 |
| Copy: the ten fixed sentences | 2, 3, 4 |
| Testing: preview renders and Edit restores; Create publishes and navigates; panel labels, selection, mixed run; redirect; project page panel; Playwright create → preview → create → intent → deploy | 2, 4, 5, 6 |
| Testing: existing suites green | 7 |
| Live: dev Center three chains, two sponsored and one relay-paid; then production | 7 |

**Placeholder scan:** no "TBD", no "add error handling", no "as in Task N". Every step that changes code shows the exact code or the exact before/after lines. No step reaches a network except Task 7's live check and `npm install`.

**Type consistency:** `CreateValues`, `FundLaunchInput`, `FundTransaction`, `JBCenterIntent`, `JBCenterDeploymentCall`, `JBCenterSearchItem`, `FundRelayRequest`, `FundForwardedLaunch`, `IntentProjectDisplay` keep one name and shape across tasks. `FundRelayRequest` is declared once, in `src/lib/fund-intent.ts`, and is the only shape the panel and the check agree on, so a drift in the SDK's own return type surfaces as one type error in one file. `intentLaunchCalls` is the single reader of a chain's signed calls, used by `checkRelayRequest`, by `readLaunchedProjectId` and by the browser flow's fixture, so the builder, the checker and the recorder cannot disagree. `relayPaid` returns `JBCenterDeploymentInput`, the SDK's own recorded-deployment shape, which is also what `selfPaid` returns, so the panel and the SDK agree on one type rather than a bare hash.

## Ambiguities resolved

1. **An intent may now name Ethereum.** The spec's Deploy panel prices Ethereum, and Center's subset deploy no longer refuses an intent whose chains include an unsponsored one, so `fundIntentEligibleChains` cannot keep meaning "every chain sponsored". It becomes "every chain is one Homerun supports, with no duplicates", which is what `buildFundLaunch` already enforces for the calls themselves. `UNSPONSORED_CHAINS_MESSAGE` is renamed and reworded because its old sentence, which tells a merchant to remove Ethereum, is now false. An Ethereum-only intent is legitimate: the visitor pays, and Center's sponsor is still the forwarded sender, so the pairing argument holds.
2. **Photos are already data URLs.** `CreateFlow` stores cover and profile photos as `canvas.toDataURL('image/jpeg', 0.82)` strings in the saved setup, so the preview renders them straight from those values. No object URL is created, and none is revoked.
3. **The preview's source of truth.** The preview reads the record `CreateFlow` already writes on every change, through the exported `CREATE_DRAFT_KEY`. No second storage key, no second normalizer: `loadCreateValues` runs the same `normalizeCreateDraft` the form runs and returns nothing when the values do not validate, which is the only case "Show preview" cannot produce. A browser with storage unavailable gets one sentence and a link back to the form.
4. **Planned Safes have no address in the preview.** `resolveCreateMultisigs` predicts an address only after reading `proxyCreationCode` from the factory, which is a chain read the spec excludes from this page. The preview therefore lists each planned Safe's role, approval policy and owners without an address, and the published page keeps `multisigReview`'s wording with the address.
5. **Whose owner Center is searched by.** The project page asks Center for intents whose `jb.owner` is the project's onchain owner, not the connected wallet: the panel is for anyone, and the owner is the one address both records share. `JBCenterSearchItem` is typed `status: "undeployed"`, so a partially deployed intent may be absent from search; the query hint and the creator's session cover the paths that matter, and the panel simply does not appear when nothing is found.
6. **Every discovered intent is verified.** Whichever of the three sources supplies an id, `findProjectIntent` only accepts an intent whose own `deployments` record contains this exact chain and project id and which `decodeFundIntent` reads as a Homerun FUND. A hostile `?intent=` therefore cannot attach a foreign panel to a project page.
7. **Which chains are ticked to begin with.** Every undeployed chain Center sponsors is ticked, and no chain the visitor pays for ever is. Pressing "Deploy selected" without touching a checkbox does exactly what today's single "Deploy" button does, and spending the visitor's own ETH always takes an explicit tick.
8. **Holding the redirect.** The old rule held the redirect until `isFullyDeployed`, which never becomes true when a visitor deploys a subset. The panel now reports when a run starts and ends, and the intent page holds its redirect for exactly that window, so a run that creates two of three chains still opens the project when it finishes.
9. **The relay review.** The relay transaction is the visitor's own, so it is reviewed with `kind: 'transaction'` and carries a `from`, unlike every intent call. Its calldata decodes through `erc2771ForwarderAbi`, and the decoded ForwardRequest shown in the dialog is the same object `checkRelayRequest` verified against the signed launch, so the dialog cannot show one thing while the wallet sends another.
10. **Where the paid chain's project id comes from.** `relayPaid` must return `{ chainId, projectId, transactionHash }`, and Homerun has no self-paid path to borrow one from: the only existing reader, `verifyFundLaunch`, needs a saved `FundLaunchInput` the intent page does not have. `readLaunchedProjectId` therefore reads the same `FundLaunched` event from the same deployer address, checking the owner against the intent's own decoded owner. That is sufficient identification here because the transaction whose receipt it reads is the one `checkRelayRequest` matched byte for byte against the signed launch before the wallet sent it. A receipt with no matching event, or more than one, records nothing and says so.
11. **What the transaction paths are still for.** `fund-launch-relayr.ts`, `LaunchChain`, `useSafeTx` and `bundleMultisigLaunch` all stay because the fallback still reaches them: a Safe connection takes the direct path, and a Center passkey connection with more than one chain takes the Relayr path, exactly as `prepare()` decides today.
