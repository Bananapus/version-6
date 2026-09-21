# Beep: create a terminal without a transaction

Date: 2026-09-21. Status: approved design (jango: "Beep publishes on the merchant's behalf").
Builds on `2026-09-21-project-intents-design.md` (Center + SDK, live in production since 2026-09-21).

## Goal

A merchant signs in to Beep, types a name, and has a working terminal at once. Beep publishes a
project intent to juicebox.center for an open-ended Juicebox V6 project on Base with that name,
owned by the merchant. The terminal appears in Beep's operator list and on its tap page
immediately. The first time a customer pays it, Beep asks Center to deploy the project
(sponsored through Relayr), waits for confirmation, resolves the new project as it does today,
and completes the payment. No merchant transaction, no gas, no wallet funding.

## Ground truth

- Beep is a Hono server with SQLite and a React operator keypad (`cocopay/beep`, Node 22).
  A terminal is a database row: a label plus a `Project` snapshot resolved on chain
  (`Protocol.resolve`: JBProjects owner, JBDirectory primary USDC terminal, JBTokens token,
  terminal code hash, USDC decimals, accounting context). Base 8453 and USDC only.
- Reads go through `https://juicebox.center/v1/rpc/8453`. No Bendystraw. No launch code.
- Payments: an external EOA sends `eth_sendTransaction`, or a Center passkey smart account
  sends a user operation reviewed on Center's page and gas-sponsored by Beep's voucher. Beep
  never holds a transaction-signing key.
- Center's passkey model exposes no generic message signing to apps, so a passkey merchant
  cannot sign an intent. Center's `POST /v1/intents` checks the publisher's signature and
  stores the owner from the envelope's form data; publisher and owner may differ.
- Center's `/v1` routes are origin-gated by the `Origin` header. `https://beep.biz` is
  allowlisted in production; dev.juicebox.center has no Beep origin yet.
- Center caps publishing at 20 per publisher per day and 60 per IP per hour, and sponsored
  deploy requests at 5 per requester (origin plus IP) per day. Those defaults are not wired
  to environment variables yet. Beep's server is one publisher, one IP and one requester.
- A sponsored deploy on Base costs the sponsor about 0.00011 ETH and lands in under a minute.

## Design

### 1. Publishing

- Beep gets `BEEP_INTENT_SIGNER_KEY`, an EOA private key used only to sign intents. It holds
  no funds and never signs a transaction. Its address is the intent publisher.
- `POST /api/operator/terminals` accepts `{ label, owner }` with no project reference.
  `owner` is the signed-in merchant's address: an EOA, or the Center passkey smart account
  address (counterfactual accounts are fine; the project NFT is minted to that address at
  deploy time). Creating without a signed-in owner is refused.
- The server builds one deployment call for Base: `JBController.launchProjectFor` with the
  SDK's `buildLaunchProjectTx`, `owner`, the pinned `projectUri`, one ruleset and the SDK's
  default terminal configurations with a USDC accounting context. The ruleset mirrors
  Succulent's page: `mustStartAtOrAfter` = now, no duration, weight 1 token per USDC paid
  (1e18 per 1e6 USDC), cash-out tax 100 percent (cash-outs off), owner may mint, terminal and
  controller changes allowed, unlimited USDC payout limit on JBMultiTerminal so leftover
  payouts flow to the owner. The name becomes `{ name }` metadata pinned through Center's
  `POST /v1/pins/json`.
- The server calls Center's `prepareIntent`, signs the returned message with the publisher
  key, calls `publishIntent` with `format: "beep.biz/v1"`, `deploymentVersion: "6"`,
  `chainIds: [8453]`, and `jb: { name, owner, chainIds: [8453], app: "beep" }`, then stores
  the terminal with `project: { chainId: 8453, projectId: null, intentId, name, owner }`.
  Server requests to Center carry `Origin: https://beep.biz` (or the configured
  `APP_ORIGIN`), which is how Center's origin gate admits them.
- A terminal whose project is pending is a first-class terminal: it lists, it has a tap page,
  invoices can be opened against it. The operator UI and the tap page say "Deploys on first
  payment".

### 2. Deploy on first payment

- The checkout page loads its invoice as today. When the invoice's terminal has
  `projectId: null`, the page calls `POST /api/terminals/:id/deploy` before asking for a
  quote, and shows "Setting up this terminal on Base" with the progress it gets back.
- The server handler is idempotent and serialized per terminal: it calls Center
  `requestDeploy(intentId)`, polls `getIntent` until every chain is confirmed (or fails), then
  runs the existing `Protocol.resolve("8453:<projectId>")` and writes the resolved `Project`
  into the terminal row and into every open invoice for it. It returns
  `{ status: "deploying" | "deployed" | "failed", project? , error? }`; the page polls it
  every few seconds until `deployed`, then proceeds to the normal quote and payment.
- Center refusals (quota, budget, paused) surface as `failed` with a short message; the page
  says the terminal cannot be set up right now and to try again shortly. Beep has no
  self-paid fallback; merchants never deploy their own projects in Beep.
- A terminal that was deployed elsewhere (the intent shows `deployments` on the poll) is
  resolved the same way. The never-mix rule is Center's to enforce; Beep only ever asks
  Center.

### 3. Center changes (one small PR, needed first)

- Wire `PUBLISH_PER_PUBLISHER_PER_DAY` and `PUBLISH_PER_IP_PER_HOUR` to environment
  variables (defaults unchanged) and raise them on production for Beep's shared publisher
  key and IP. Raise `SPONSOR_DEPLOYS_PER_REQUESTER_PER_DAY` on production to 100; the daily
  wei budget stays the real cap.
- Add Beep's local origin `http://127.0.0.1:8787` to Center's dev allowlist so Beep can be
  tested against dev.juicebox.center.
- README: the sponsor key funds only the Relayr prepayment on one rollup; destination-chain
  creation fees ride inside that prepayment.

### 4. Out of scope

iOS app changes; self-paid deploys from Beep; multi-chain terminals; a Center intent-signing
ceremony for passkey users (a follow-on that would let merchants publish as themselves).

## Testing

- Node tests (`node --test`): intent envelope construction for a name and owner (deterministic
  calldata for a fixed timestamp, USDC context, weight, payout limit); publish path against a
  fake Center (message signed by the configured key, `jb` carries name and owner); terminal
  rows with a pending project list and serve their tap page; the deploy endpoint is
  idempotent, polls a fake Center to `deployed`, resolves through a fake `Protocol`, and
  rewrites the terminal and open invoices; refusals map to `failed`.
- Browser test: create a terminal by name, open its tap page, open an invoice, see the
  "Setting up" state complete against the fake Center, reach the quote.
- Live check on beep.biz after deploy: create one terminal, pay it once from an EOA.
