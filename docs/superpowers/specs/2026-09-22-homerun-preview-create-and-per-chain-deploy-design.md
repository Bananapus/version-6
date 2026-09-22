# Homerun: preview, create, then deploy any chains from a shareable link

Date: 2026-09-22. Status: approved direction (jango: "Instead of a Sign in and Create button,
have a Show preview button … Edit … Create which queues the intent with Center … a shareable
link … buttons to deploy on any number of chains. if they select Ethereum, they cover gas, if
they choose the others Center will shoulder the deployment … many chains can be checked and
created at the same time … 'costs ~x gas' for ETH and 'free' for the others … /intent/<id>
should redirect to any already-submitted chain … which should then facilitate adding any other
chains that need adding. go.").
Builds on `2026-09-21-project-intents-design.md`, `2026-09-21-intents-docs-shared-homerun-design.md`
and `2026-09-22-intent-setup-calls-safe-owners-design.md` (all shipped).

## Goal

Creating a FUND on Homerun is: fill the form, look at the finished project page, press Create.
That publishes the intent to Center and yields a link anyone can open. On that link, and on the
project page once any chain exists, anyone picks the chains to deploy and presses one button:
Center pays for the rollups, the visitor pays for Ethereum. Every chain keeps the same sender, so
tokens and suckers pair across chains.

## Ground truth

- Homerun's create step (`src/components/LiveCreate.tsx`) ends with "Create without a
  transaction" (intent, only when every chain is sponsored and the wallet is external) or the
  per-chain transaction path (direct, Relayr, Safe). Publishing runs `prepareIntent`: pin
  metadata, build the envelope, review dialog, `publishSignedIntent`, save the session, go to
  `/intent/<id>`.
- `/intent/[id]` (`src/components/IntentProject.tsx`) renders the intent from `decodeFundIntent`
  and the pinned metadata, offers one Deploy button that runs `ensureDeployed` (sponsored only),
  and redirects to `/project/<chainId>/<projectId>` as soon as any deployment exists.
- Center sponsors 10, 8453, 42161 and the four testnets, never 1. `POST /v1/intents/:id/deploy`
  refuses an intent whose `chainIds` include an unsponsored chain (SDK `isSponsorable` is
  all-or-nothing) and queues every chain at once. The sponsor lane wraps each launch in the
  canonical ERC-2771 forwarder (`0x3ba60b60933916a7c87d0860dcee62a0ce34e3e2`) with a
  ForwardRequest signed by the sponsor key; `SponsorshipChain.prepare/signed` have no mainnet
  gate, only the lane policy does. The deployment verifier accepts a nested call from the
  forwarder whose input is the committed calldata plus the appended sender.
- `HomerunDeployer.launchFundFor` scopes the sucker and token salt to `_msgSender()`, so a
  launch sent by anyone other than Center's sponsor yields different token and sucker addresses
  and breaks cross-chain pairing. A self-paid deployment must therefore still be a forwarded
  request from the sponsor; the payer only supplies gas and the creation fee.
- The OpenZeppelin `ERC2771Forwarder.execute(request)` is public and payable; anyone may submit a
  signed request and must send exactly `request.value`. Nonces are per signer on the forwarder.
- `POST /v1/intents/:id/deployments` records a self-paid deployment after verification; the SDK
  has `recordDeployment` and `ensureDeployed({ selfPaid })`.
- Center's publisher must be an EOA (ERC-1271 is not supported); Safe and passkey connections
  cannot publish.

## Design

### 1. Center: a signed forward request for a chain the visitor pays for

`POST /v1/intents/:id/relay` with body `{ chainId }`:

- The intent exists, the chain is in its `chainIds`, no deployment is recorded for it, and the
  chain is one Center does not sponsor (today: 1). Sponsored chains use `/deploy`; a request for
  one answers 400 `sponsored_chain` so the sponsor lane and visitors never race on a nonce.
- Center reads the creation fee on that chain, prepares the same forward request the lane
  prepares (simulation from the sponsor with the fee as value, gas cap, the forwarder's current
  nonce for the sponsor, a deadline of 30 minutes) and signs it with the sponsor key. It returns
  `{ chainId, to: <forwarder>, data: <execute calldata>, value: <fee wei as decimal string>,
  gas: <estimate>, deadline }`. Nothing is stored; nothing is paid.
- Rate limit: the same per-requester hourly bucket the deploy route uses. Origin gate as every
  `/v1` route.
- A visitor sends that transaction from their own wallet. When it confirms, the client records
  the deployment with `POST /v1/intents/:id/deployments` as today; the verifier already accepts
  the forwarded trace.
- Two visitors who fetch a request for the same chain get the same nonce; the second
  transaction reverts on the forwarder and the client refetches. Documented.

### 2. Center: deploy a chosen subset of sponsored chains

`POST /v1/intents/:id/deploy` accepts an optional `chainIds` array. Rules: every id is in the
intent, is sponsored, and has no deployment; ids already queued or sent are returned as they are
(idempotent). Omitted, it means every sponsored, undeployed chain. An intent whose `chainIds`
include an unsponsored chain is no longer refused; only its sponsored chains are queued. The
lane, retry rules, budgets and quotas are unchanged.

### 3. SDK (`@bananapus/nana-sdk-core/jbcenter`, 2.10.0)

- `isSponsorable(chainIds)` becomes per-chain: `sponsorableChains(chainIds)` and
  `unsponsoredChains(chainIds)`; `isSponsorable` stays and means "every chain".
- `requestDeploy(id, { chainIds? })` passes the subset.
- `requestRelay(id, chainId)` returns the signed forward request as `{ chainId, to, data,
  value: bigint, gas: bigint, deadline }`.
- `ensureDeployed` accepts `chainIds` to limit the run and keeps `selfPaid` for the unsponsored
  ones; a `relayPaid` option is the client's sender for unsponsored chains: it receives the
  relay request and returns the transaction hash; `ensureDeployed` then records the deployment
  and polls. Never mixes senders because the relay request keeps Center's sponsor as sender.
- README documents the relay route, the subset deploy, and the pairing argument.

### 4. Homerun: preview, create, deploy

**Create step.** One button, "Show preview", enabled when the form validates. It saves the
session and opens `/create/preview`. The transaction path, the Relayr path and the direct path
leave the create step. A Safe or passkey connection sees "Create with a transaction" beneath
"Show preview" as the only alternative, because Center cannot verify its signature.

**Preview page** `/create/preview`. Renders the project page layout (`IntentProject`'s shell)
from the saved create values: name, description, photos from the browser, chains, owner or
planned Safes, token name and ticker, raise terms, start. A banner reads "Preview. Nothing is
created yet." Buttons: "Edit" goes back to the create flow at the review step with the values
intact; "Create" connects a wallet if none is connected, then runs today's `prepareIntent`
(pin, envelope, review dialog, sign, publish, session) and goes to `/intent/<id>`. No chain
reads on this page beyond what the create step already made.

**Intent page** `/intent/[id]` (the shareable link). Above the project content, a "Deploy"
panel lists every chain of the intent with a checkbox. Chains Center sponsors are labelled
"free". Ethereum is labelled "costs ~<amount> ETH", the amount being the gas estimate from the
relay request times the current gas price plus the creation fee, refreshed when the panel
opens; "costs gas" while the estimate loads. Deployed chains show no checkbox, only a link to
`/project/<chainId>/<projectId>`. Checking any number of chains and pressing "Deploy selected"
runs `ensureDeployed({ chainIds })`: sponsored chains through `/deploy`, Ethereum through the
relay request sent from the visitor's wallet (connect first, then `sendTransaction`, then record).
Progress per chain as today. Anyone may do this; no ownership check.

**Redirect.** When the intent has at least one deployment, `/intent/<id>` redirects to
`/project/<chainId>/<projectId>` of the first deployed chain in the intent's chain order.

**Project page.** When the project came from an intent that still has undeployed chains, the
page shows the same Deploy panel for the remaining chains ("Also deploy on Ethereum, Arbitrum")
with the same checkboxes and labels and the same `ensureDeployed` run. The page knows its intent
because the redirect from `/intent/<id>` carries `?intent=<id>`, the creator's session holds the
id, and otherwise Center's search by owner is checked for an intent whose deployments include
this project.

**Copy** (fixed sentences, plain voice): "Show preview"; "Preview. Nothing is created yet.";
"Edit"; "Create"; "Deploy"; "free"; "costs ~0.0042 ETH"; "costs gas"; "Deploy selected";
"Also deploy on"; "Deployed on Base".

### 5. Out of scope

ERC-1271 publishing; a Center passkey signing ceremony; juicebox.money and revnet.money (the
Center and SDK parts are generic and they can port the same panel); INCOME; changing the
deployer's salt scoping.

## Testing

- Center: relay route refuses unknown intent, foreign chain, deployed chain and sponsored chain;
  returns a request that recovers to the sponsor with the forwarder's current nonce and the
  creation fee as value; rate limit; subset deploy queues only the named sponsored chains,
  ignores queued ones, refuses foreign and deployed ids; an intent with mainnet in its chains is
  accepted for its sponsored chains; docs route snapshot; `npm run check`.
- SDK: per-chain sponsorability, `requestDeploy` subset body, `requestRelay` parsing,
  `ensureDeployed` with `chainIds` and `relayPaid` (sponsored + relay in one run, records the
  relay hash, never calls `selfPaid` for a sponsored chain); budget and wallet-boundary checks.
- Homerun: preview renders from saved values and Edit restores them; Create publishes and
  navigates; the deploy panel labels, selection, mixed run (fake Center + fake wallet
  `sendTransaction`), redirect to the first deployed chain, project page panel for remaining
  chains; Playwright create → preview → create → intent → deploy two sponsored chains; existing
  suites green.
- Live: dev Center, a FUND on Base Sepolia + OP Sepolia + Sepolia: sponsored two, relay-paid
  Sepolia from the test wallet, all three paired; production: Base + Optimism sponsored, then
  Ethereum relay-paid by jango when he chooses.
