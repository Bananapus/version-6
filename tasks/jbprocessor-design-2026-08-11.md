# JBProcessor — v1 Design

**Codename:** Juice Processor / JBProcessor / Processor
**Date:** 2026-08-11
**Status:** Draft for review
**Origin:** Artizen's endowment donations — card/bank donors get no ART because tokens only issue for USDC payments on Base. Generalized: a fiat→Juicebox payment service for eligible V6 projects.

## What it is

A hosted service that lets anyone pay an eligible Juicebox V6 project by credit card or bank transfer. The Processor:

1. Takes the fiat payment via Stripe (settling in USDC).
2. Executes the on-chain `pay()` when the USDC settlement lands (T+1/T+2) — no standing float on the default path.
3. Escrows the resulting project tokens through the card-dispute window.
4. Lets the donor claim tokens by email after the hold.

**Business model: immediacy is the product.** The default path carries no service fee — the donor pays the donation plus Stripe's cost, and `pay()` executes when the money actually arrives. Donors who want instant execution pay a premium fee, and their `pay()` runs at T+0 fronted from a small, capped instant-capacity pool. Premium fees are paid into the $PROCESSOR revnet with the donor as beneficiary, so fees become ownership.

## Decisions log

| Decision | Choice |
|---|---|
| Architecture shape | B: MoR/processor fiat edge + Processor-executed pay(). Fiat edge is pluggable (webhook in, USDC out), Stripe for v1. |
| Execution timing | Default: pay() triggers on settlement (T+1/2), so nothing is ever fronted and no float is held. Premium: T+0 execution from a capped, fee-funded instant pool. |
| Card fraud control | Forced 3-D Secure on all card payments (fraud-dispute liability shifts to issuer) + Stripe Radar. |
| Token hold | 120 days for card payments (full dispute window) before the donor can access tokens. Bank-transfer payments unlock at settlement finality (days). |
| Per-project risk tiering | Rejected — unnecessary complexity; the 120-day hold covers all projects uniformly. |
| Card ceiling | Cards accepted up to a configurable ceiling (initial: $500); above it, checkout steers to bank transfer. |
| Donor wallet | Email only at checkout. A Para pregenerated wallet (keyed to the email) is created silently and preset as the on-chain beneficiary; crypto-native donors can supply their own address instead. Donor can redirect to any wallet before release (48h effectiveness delay). |
| Release | Permissionless: after unlockAt, anyone can call `release(paymentId)` — no address argument; tokens go to the recorded beneficiary. Zero-click delivery; the service disappearing cannot strand unlocked tokens. |
| Donor visibility | Logged-in account page (email magic link): payments, expected token amounts, unlock countdowns, claim flow. |
| Business model | Default path free (donation + Stripe cost only). Premium fee buys T+0 execution; premium fees → $PROCESSOR revnet, donor's escrow entry as beneficiary. Premium never shortens the token hold. |
| Project access | Application-gated eligibility with config review; not open to all projects. |
| Chain | Base only in v1. |
| Escrow custody | On-chain `JBProcessorEscrow` contract enforcing unlockAt (revised from Safe + DB ledger for trustlessness). |
| Code location | New repo `juice-processor`, submoduled at `extensions/juice-processor`. TypeScript Next.js app + Foundry contracts, deployed on Railway. |

## Architecture

One API service, one worker, one small frontend, one Postgres DB.

### 1. Fiat edge — Stripe
- Cards: forced 3DS, Radar enabled, ceiling enforced at session creation.
- Bank transfers (ACH/wire) for amounts above the ceiling, or by donor choice.
- Settlement in USDC to the float wallet on Base (Stripe stablecoin settlement). If USDC settlement is unavailable at onboarding, fallback: fiat settlement + scheduled exchange conversion (adds an ops step, no architecture change).
- The edge is pluggable: the core contract is "signed webhook in, USDC in float." A Crossmint (or other MoR) edge can be added later without touching the core.

### 2. Processor API
- `POST /checkout` — `{projectId, amountUsd, email}` → validates project eligibility → quotes expected tokens via `previewPayFor` → creates payment record → returns Stripe Checkout URL.
- Webhook consumer — signed, idempotent, replay-safe. Payment confirmed → enqueue for the payer worker. Dispute opened → mark escrow entry forfeited.
- `GET /payments/:id` — status for integrators (e.g. Artizen's own donation UI).
- `GET /account` — donor's payments, token amounts, unlock dates (magic-link auth).

### 3. Payer worker
- **Default path:** triggers on Stripe's settlement event for the payment (T+1/T+2), not on payment confirmation — the service only ever pays with money it has received. A dispute arriving before settlement cancels the payment before any USDC moves on-chain.
- **Premium path:** triggers at T+0 on payment confirmation, fronted from the instant-capacity pool. Offered at checkout only when the pool has headroom; pool is repaid by that payment's settlement.
- Before paying: re-quote via `previewPayFor`. If drift from the checkout quote exceeds tolerance (issuance cut crossed, pool moved), refund via Stripe instead of paying at a bad rate.
- Execute `pay()` on the project's primary terminal: `beneficiary` = escrow Safe, `memo` = payment ID, `minReturnedTokens` from the quote.
- For premium payments, execute the fee `pay()` into the $PROCESSOR revnet, same beneficiary pattern. Per-payment; Base gas makes this negligible.
- Record `{paymentId, txHash, tokensOut, unlockAt}`. Email receipt.
- Queue-driven, idempotent, retries with backoff; every payment ID pays at most once.

### 4. Escrow + hold — `JBProcessorEscrow` contract
- A small escrow contract on Base enforces the hold **on-chain**: entries keyed by payment ID hold `{token, amount, unlockAt, beneficiary}`. The beneficiary (the donor's Para pregen wallet, or their own address) is committed at `processPayment` time — when there is nothing yet worth stealing. `release(paymentId)` is **permissionless**, takes no address, reverts before `unlockAt`, and pays the recorded beneficiary — a keeper cranks it, but anyone can, so unlocked tokens can never be stranded by the service dying. `forfeit(paymentId)` (operator-only) works only *before* `unlockAt` and sends tokens to the treasury for cash-out recovery.
- Redirects: `setBeneficiary(paymentId, to)` (operator, driven by the donor from the account page) takes effect after a 48h delay, with the pending change visible on-chain and release blocked while one is in flight — a compromised worker key redirecting claims gives monitoring at least two days of public notice, never instant theft.
- The escrow itself executes the pay: `processPayment(...)` pulls USDC from the worker, calls `pay()` with itself as beneficiary, and records the received token amount atomically — project tokens never touch the worker wallet.
- Card: unlockAt = payment + 120 days. Bank transfer: unlockAt = settlement finality.
- Dispute during the window → `forfeit` → tokens to treasury → cash out against the project (cash-out floor) to recoup; shortfall absorbed by premium revenue / reserve. Cash-out execution is a manual runbook step in v1.
- Delivery: zero-click. After unlock, the keeper cranks `release` for due entries; tokens land in the preset wallet with no donor action. The account page offers redirect-to-another-wallet as the optional path, and instructions for claiming the Para wallet via email auth.
- Para vendor risk, bounded: if Para disappeared before a donor claims their pregen wallet, tokens released there would strand. Mitigations: donors can redirect any time pre-release, and self-supplied addresses skip Para entirely.
- Eligibility prerequisite: the project must have its ERC-20 deployed (escrow holds ERC-20s, not credits).

### 5. Donor account page
- Email magic-link login. Payments list: amount, project, status (processing / held / unlocked / claimed / refunded), expected tokens, days until unlock, claim flow.
- Data: DB + bendystraw.

### 6. Fees → $PROCESSOR revnet
- Default path: no service fee. Donor pays donation amount + Stripe's cost (passed through at cost).
- Premium path: donor pays an additional premium (initial: 1.5%, configurable) for T+0 execution. The premium funds the instant-capacity pool's risk and is paid into the $PROCESSOR revnet per payment, donor escrow as beneficiary — premium donors accumulate $PROCESSOR alongside their project tokens, same hold, same claim.
- The premium buys execution timing only. It never shortens the 120-day token hold — otherwise the card-cashing attack becomes a purchasable feature.
- $PROCESSOR deploys via revnet.app as a separate small task; until it exists, premiums accrue in USDC in the treasury.

### 7. Project eligibility (application-gated)
- Projects apply; a human review approves before any checkout can target them. This protects the merchant account and prevents laundering set-ups (e.g. a bogus project with 100% payout splits that turns stolen-card payments into instant on-chain exits).
- Review checklist: ruleset config sanity (splits, payout limits, cash-out terms, owner), token/issuance behavior, ERC-20 deployed, project legitimacy (site, team, purpose), sanctions screening of the owner where feasible.
- **Auto-suspension:** eligibility is revoked automatically if the project's ruleset configuration changes after approval (bendystraw watch on queued/activated rulesets); re-review to restore. Prevents the apply-benign-then-reconfigure attack.
- v1 launch cohort: Artizen (ART).

### 8. Ops
- No standing float: the settlement wallet is a pass-through with near-zero resting balance on the default path.
- Instant-capacity pool: small, hard-capped, funded/grown by premium fees; exposure at any moment is bounded by the cap. Premium option disappears from checkout when the pool lacks headroom and returns as settlements repay it.
- Hot-wallet security: settlement wallet is a hot EOA holding funds for minutes; the instant pool is a Safe whose exposure is bounded by a USDC allowance to the worker equal to the pool cap; the escrow contract enforces the hold on-chain regardless of key compromise.
- Rolling reserve: hold a percentage of premium revenue against dispute shortfalls.
- Monitoring: payment funnel metrics, dispute rate (keep well under the ~0.9% card-network monitoring threshold), float level, quote-drift refund rate.

## Payment flow

```
Donor → POST /checkout → Stripe Checkout (3DS) → webhook: paid
  → [default: wait for settlement T+1/2 | premium: T+0 from instant pool]
  → worker: re-quote → pay(project, beneficiary=escrow, memo=paymentId)
  → [premium: pay($PROCESSOR fee)] → record + receipt email
  → [120d hold, visible on account page]
  → unlock email → donor claims → escrow transfers tokens to donor wallet
Dispute before settlement → cancel, nothing on-chain
Dispute during hold → forfeit entry → cash out tokens → recoup
```

## Risk register

| Risk | Control |
|---|---|
| Card-cashing attack (stolen card → tokens → cash out) | 120-day hold (tokens unusable through the dispute window) + 3DS + eligibility review of project configs |
| Friendly fraud / donation regret | 120-day hold; forfeiture + cash-out recoup; nonrefundable-donation ToS |
| Fraud disputes | 3DS liability shift to issuer |
| Card testing waves | Stripe Radar, velocity limits, card ceiling |
| Merchant account termination (dispute-rate monitoring) | All of the above + dispute-rate monitoring with alerting |
| Bogus/malicious projects | Application-gated eligibility + ruleset-change auto-suspension |
| Quote drift (issuance cuts, buyback-hook AMM routing) | Re-quote at execution; tolerance check; refund instead of bad fill; `minReturnedTokens` on-chain |
| Hot wallet compromise | No standing float; hard-capped instant pool; Safes, constrained signing, alerting |
| Fronting risk on premium payments | Exposure bounded by the instant-pool cap; premium priced to cover it; dispute-before-settlement on default path costs nothing on-chain |
| Webhook replay / double-pay | Signature verification, idempotency keys, at-most-once pay per payment ID |
| ACH returns (unauthorized, up to 60 days) | Bank-transfer unlock at settlement finality, not instantly |
| Regulatory (money transmission, token delivery as brokerage, MiCA) | Shape B keeps fiat licensing at Stripe; Processor is a payer, protocol issues tokens. Formal legal review before scale — open item. |

## Out of scope for v1

Other chains; embeddable widget; recurring donations; per-project risk tiering (rejected); custom MoR deals; automated eligibility review. (Embedded wallets moved IN scope: Para pregen wallets as the default beneficiary.)

## Open questions

1. Stripe onboarding: is USDC-on-Base settlement available to this entity today? If not, fiat settlement + exchange conversion interim.
2. Crossmint quote (fees + chargeback terms on a custom plan) as a comparison point / future MoR edge.
3. Card ceiling initial value ($500 proposed), quote-drift tolerance value, premium fee value (1.5% proposed), and instant-pool cap.
4. Future real-time path for bank payments at scale: Circle Mint + RTP/FedNow (true real-time fiat→USDC, but makes the Processor the fiat-receiving entity — needs the legal review first).
5. Legal review scope: US money-transmission analysis for the instant pool, MiCA exposure for EU donors.
6. $PROCESSOR revnet parameters (stages, issuance, cash-out) — separate design.
