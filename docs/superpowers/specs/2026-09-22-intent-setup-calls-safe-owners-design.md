# Project intents: setup calls, so an intent creates its Safes and then launches

Date: 2026-09-22. Status: approved direction (jango: "as long as we can port this solution to
other webclients, i think it is the right one"; Safe addresses are deterministic, so the
creation and the launch go out independently).
Builds on `2026-09-21-project-intents-design.md` (Center + SDK) and
`2026-09-21-intents-docs-shared-homerun-design.md` (Homerun FUND by intent, shipped).

## Goal

A merchant who wants a new multisig to own their project creates the project without a
transaction. The intent carries, per chain, the Safe creation calls and the launch call.
Center's sponsor executes all of them. The shape is generic: juicebox.money and revnet.money
port it by building the same calls, with no Center or SDK change.

## Ground truth

- Center (`src/intent.ts:42-65`) accepts exactly one `deploymentCall` per `chainId`, at most 16
  chains, 4 MiB per call. The SDK mirrors the one-per-chain rule
  (`packages/core/src/jbcenter.ts:387-401`). The guide states it (`PROJECT_INTENTS.md:79`).
- The sponsor lane (`src/sponsor/relayr.ts:137-187`) finds the single call per chain, reads the
  creation fee, checks the sponsor balance, wraps the call in the canonical ERC-2771 forwarder
  through `SponsorshipChain.prepare` (which requires `isTrustedForwarder(forwarder)` on the
  target, `src/rest/sponsorship/chain.ts:258-305`), signs one ForwardRequest per chain and puts
  every chain in one Relayr bundle. `settle` (`relayr.ts:82-129`) expects one transaction hash
  per chain and a `JBProjects.Create` log in that receipt. The verifier
  (`src/deploymentVerifier.ts:212-291`) traces the one committed call and requires exactly one
  `Create` event.
- Relayr entries carry `virtual_nonce`; Center's independent mode
  (`parseIndependentStatus`, `RelayrIndependentEntry`) sends entries with no nonce, so Relayr
  executes them in any order.
- Safe 1.4.1 addresses depend only on the proxy factory, the singleton, the initializer (owners,
  threshold, fallback handler) and the salt nonce; never on the sender or the time. The SDK's
  `safe.ts` pins the factory `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67`, singleton
  `0x41675C099F32341bf84BFc5382aF534df5C7461a`, fallback handler
  `0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99`, their runtime code hashes, and exposes
  `buildSafeInitializer`, `predictSafeAddress`, `buildSafeDeploymentCalls`, `SAFE_CREATE_ABI`.
- JBProjects transfers a project to an address with or without code; a Safe that already exists
  accepts an ERC-721 through its fallback handler. So the launch and the Safe creation succeed
  in either order.
- Homerun (`src/lib/create-multisig.ts`) plans up to two Safes per launch (`owner`, `operator`),
  salt nonce `keccak256(launchSalt ‖ role)`, and refuses the intent path when a multisig is
  planned (`LiveCreate.tsx:203-205, 300`, `fund-intent.ts:60`).

## Design

### 1. Envelope: setup calls before the launch call

`deploymentCalls` stays one flat array of `{ chainId, to, data }`. For each `chainId` the array
holds one or more calls in order. **The last call for a chain is the launch call; every call
before it is a setup call.** A single call per chain is therefore unchanged and every existing
intent remains valid. Limits: at most 4 calls per chain, at most 16 chains, 4 MiB per call.

Setup calls are restricted at the trust boundary so the sponsor never pays for arbitrary
work:

- `to` must be the canonical Safe proxy factory (address above, runtime code hash checked on
  the chain at deploy time).
- `data` must be `createProxyWithNonce(singleton, initializer, saltNonce)` with the canonical
  singleton, and `initializer` must decode as `setup(owners, threshold, address(0), 0x,
  fallbackHandler, address(0), 0, address(0))` with 1 to 20 unique nonzero owners, threshold
  in `[1, owners.length]`, and the canonical fallback handler.
- Setup calls carry no value and are not forwarded.

Publish (`POST /v1/intents`) validates this shape and refuses anything else with a 400 that
names the call index. The content hash already covers the whole array. Center's `format`
grammar, signing message and `jb` conventions are unchanged. Clients put what they need to
render in `jb`; the recommended field is `jb.safes: [{ role, address, owners, threshold,
saltNonce }]`.

### 2. Sponsor lane

- `deploy()` groups calls by chain. For each chain: the launch call is prepared as today
  (balance pre-check, creation fee as value, forwarder wrap, ForwardRequest signature). Each
  setup call becomes a plain independent Relayr entry: `target` = factory, `value` = 0, no
  nonce; Center simulates it from the sponsor with `eth_call` and `eth_estimateGas` (the call is
  sender-agnostic), applies the gas cap, and skips it when the predicted Safe already has code
  on that chain (idempotent re-runs and merchants who created the Safe themselves).
- One bundle, one prepayment, all chains, as today. The quote's entries carry `chainId` and
  `role: "setup" | "launch"`.
- `settle` collects a hash per entry. A chain is `sent` when its launch entry has a hash and
  `confirmed` when the launch receipt succeeds and carries the `Create` event; the deploy row
  records the launch hash. Setup receipts are awaited too: a reverted setup receipt is logged as
  `setup_reverted` with the chain and index and does not fail the row, because the project is
  owned by the planned Safe address either way and anyone can create it later.
- `resume` reads hashes per entry from the stored bundle the same way.
- The verifier is unchanged: it traces the launch call and expects one `Create` event. The
  recorded deployment is the launch transaction.
- The retry rules from `2026-09-22` lane recovery apply unchanged.

### 3. Read side

- `GET /v1/intents/:id` returns `deploymentCalls` as stored. Search rows are unchanged
  (`jb.owner` is the Safe address; a client that wants "mine" also filters by `publisher`).
- `PROJECT_INTENTS.md` gains a "Setup calls" section: the rule (last call launches, earlier
  calls set up), the Safe factory restriction with the exact canonical addresses, the
  deterministic-address argument, the `jb.safes` convention, and a worked Homerun example.
  README, `/llms.txt` and the MCP `publish_intent` envelope shape follow.

### 4. SDK (`@bananapus/nana-sdk-core/jbcenter`, 2.9.0)

- Validation mirrors Center: calls grouped by chain, 1 to 4 per chain, the last is the launch,
  setup calls only to the canonical factory with a well-formed `createProxyWithNonce`.
- `decodeDeploymentCall` gains flavor `safe-create`: `{ to, singleton, saltNonce, owners,
  threshold, fallbackHandler, address }` where `address` is `predictSafeAddress` of the
  decoded plan (computed with the pinned creation code; no chain read).
- New `intentCalls(intent)` returns `Map<chainId, { setup: DecodedCall[], launch: DecodedCall }>`
  so any client renders "creates Safe X for owners …, then launches" without repeating the
  grouping rule. `intentRow`, `mergeSearch`, `ensureDeployed`, `publishSignedIntent` are
  unchanged.
- README lists the new helper and the rule. Changeset minor. Budget cap raised only if needed.

### 5. Homerun

- Eligibility: a planned multisig no longer excludes the intent path. The remaining rules stay
  (external wallet, every chain sponsored, no Safe or passkey connection publishing).
- `buildFundIntent` takes the resolved plans: per chain, `buildSafeDeploymentCalls(plans)` as
  setup calls followed by the `launchFundFor` call whose `owner` is the owner plan's address.
  `jb.safes` carries the plans. The saved launch session already holds the plans.
- `decodeFundIntent` checks each setup call re-derives its plan address and that the owner plan
  equals the launch owner; otherwise the intent is shown as unreadable.
- Review dialog and `/intent/[id]` list each Safe with role, threshold and owners, using
  `multisigReview` wording. `AccountProjects` searches `owner` and `publisher` and merges.
- The Relayr and direct transaction paths are unchanged.

### 6. Porting to juicebox.money and revnet.money

Both already plan Safes with the same SDK helpers. A port is: build the setup calls from the
plans, put the launch call last, set `jb.owner` to the planned Safe, render with
`intentCalls`. No Center or SDK change. Not part of this work.

### 7. Out of scope

Setup calls to anything but the Safe factory; Safe modules or guards; ordering guarantees
between setup and launch; ERC-1271 publishing; a Safe-connected publisher.

## Testing

- Center: publish accepts one, two and three setup calls before a launch and refuses a setup
  call to another target, a non-canonical singleton, a bad initializer, a setup call after the
  launch position (fifth call), and a chain with no launch; lane tests drive a two-chain
  intent with one setup call per chain through a fake Relayr (entries carry roles, bundle has
  four entries, `sent` and `confirmed` keyed on the launch hash, a reverted setup receipt logs
  and does not fail the row, an existing Safe skips its setup entry); resume with per-entry
  hashes; verifier unchanged; docs route snapshot; `npm run check`.
- SDK: validation table; `safe-create` decode round-trip with the predicted address matching
  `safe.ts`; `intentCalls` grouping; budget and wallet-boundary checks.
- Homerun: `buildFundIntent` with plans is deterministic and puts the launch last; decode
  rejects a mismatched owner; intent page renders the Safes; Playwright create flow with a
  planned 2-of-2 owner Safe against the fake Center; existing suites green.
- Live: a two-chain testnet FUND with a new 2-of-2 owner Safe on dev Center (Base Sepolia +
  OP Sepolia), then one on production (Base + Optimism), confirming the Safe exists at the
  predicted address on both chains and owns the project.
