# JBProcessor — v1 Design

**Codename:** Juice Processor / JBProcessor / Processor
**Date:** 2026-08-11
**Status:** Draft for review
**Origin:** Artizen's endowment donations — card/bank donors get no ART because tokens only issue for USDC payments on Base. Generalized: a fiat→Juicebox payment service for eligible V6 projects.

## What it is

A hosted service that lets anyone pay an eligible Juicebox V6 project by credit card or bank transfer. The Processor:

1. Takes the fiat payment via Stripe (settling in USDC).
2. Executes the on-chain `pay()` itself from a USDC float it operates.
3. Escrows the resulting project tokens through the card-dispute window.
4. Lets the donor claim tokens by email after the hold.

The service is monetized as a revnet: a 1% service fee per payment is paid into the $PROCESSOR revnet with the donor as beneficiary, so fees become ownership.

## Decisions log

| Decision | Choice |
|---|---|
| Architecture shape | B: MoR/processor fiat edge + Processor-operated USDC float. Fiat edge is pluggable (webhook in, USDC out), Stripe for v1. |
| Card fraud control | Forced 3-D Secure on all card payments (fraud-dispute liability shifts to issuer) + Stripe Radar. |
| Token hold | 120 days for card payments (full dispute window) before the donor can access tokens. Bank-transfer payments unlock at settlement finality (days). |
| Per-project risk tiering | Rejected — unnecessary complexity; the 120-day hold covers all projects uniformly. |
| Card ceiling | Cards accepted up to a configurable ceiling (initial: $500); above it, checkout steers to bank transfer. |
| Donor wallet | None required at checkout — email only. Claim link after unlock; donor connects/pastes a wallet then. Embedded wallets are a later upgrade. |
| Donor visibility | Logged-in account page (email magic link): payments, expected token amounts, unlock countdowns, claim flow. |
| Business model | Donation + Stripe cost at cost + 1% service fee → paid into $PROCESSOR revnet, donor's escrow entry as beneficiary. |
| Project access | Application-gated eligibility with config review; not open to all projects. |
| Chain | Base only in v1. |

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
- On confirmed payment: re-quote via `previewPayFor`. If drift from the checkout quote exceeds tolerance (issuance cut crossed, pool moved), refund via Stripe instead of paying at a bad rate.
- Execute `pay()` on the project's primary terminal from the float wallet: `beneficiary` = escrow Safe, `memo` = payment ID, `minReturnedTokens` from the quote.
- Execute the fee `pay()` into the $PROCESSOR revnet, same beneficiary pattern. Per-payment; Base gas makes this negligible.
- Record `{paymentId, txHash, tokensOut, unlockAt}`. Email receipt.
- Queue-driven, idempotent, retries with backoff; every payment ID pays at most once.

### 4. Escrow + hold
- Tokens sit in a Processor-controlled Safe on Base; a DB ledger maps payment → token amount → unlockAt.
- Card: unlockAt = payment + 120 days. Bank transfer: unlockAt = settlement finality.
- Dispute during the window → entry forfeited → worker cashes out the tokens against the project (cash-out floor) to recoup what it can; shortfall is absorbed by the fee revenue / reserve.
- Claim: after unlock, donor provides a wallet address; escrow transfers the ERC-20 out. If the project token is unclaimed credits (no ERC-20 deployed), the escrow claims to ERC-20 first or holds until claimable.
- No custom contract in v1 — Safe + DB ledger.

### 5. Donor account page
- Email magic-link login. Payments list: amount, project, status (processing / held / unlocked / claimed / refunded), expected tokens, days until unlock, claim flow.
- Data: DB + bendystraw.

### 6. Fees → $PROCESSOR revnet
- Donor pays: donation amount + Stripe's cost (passed through at cost) + 1% service fee.
- Fee is paid into the $PROCESSOR revnet per payment, donor escrow as beneficiary — donors accumulate $PROCESSOR alongside their project tokens, same hold, same claim.
- $PROCESSOR deploys via revnet.app as a separate small task; until it exists, fees accrue in USDC in the treasury.

### 7. Project eligibility (application-gated)
- Projects apply; a human review approves before any checkout can target them. This protects the merchant account and prevents laundering set-ups (e.g. a bogus project with 100% payout splits that turns stolen-card payments into instant on-chain exits).
- Review checklist: ruleset config sanity (splits, payout limits, cash-out terms, owner), token/issuance behavior, project legitimacy (site, team, purpose), sanctions screening of the owner where feasible.
- **Auto-suspension:** eligibility is revoked automatically if the project's ruleset configuration changes after approval (bendystraw watch on queued/activated rulesets); re-review to restore. Prevents the apply-benign-then-reconfigure attack.
- v1 launch cohort: Artizen (ART).

### 8. Ops
- Float: capped balance per policy; low-balance alerting; replenishment automatic via Stripe USDC settlement.
- Hot-wallet security: float wallet and escrow are Safes; the worker signs via a constrained session key / module, not an owner key.
- Rolling reserve: hold a percentage of fee revenue against dispute shortfalls.
- Monitoring: payment funnel metrics, dispute rate (keep well under the ~0.9% card-network monitoring threshold), float level, quote-drift refund rate.

## Payment flow

```
Donor → POST /checkout → Stripe Checkout (3DS) → webhook: paid
  → worker: re-quote → pay(project, beneficiary=escrow, memo=paymentId)
  → pay($PROCESSOR fee) → record + receipt email
  → [120d hold, visible on account page]
  → unlock email → donor claims → escrow transfers tokens to donor wallet
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
| Hot wallet compromise | Capped float, Safes, constrained signing, alerting |
| Webhook replay / double-pay | Signature verification, idempotency keys, at-most-once pay per payment ID |
| ACH returns (unauthorized, up to 60 days) | Bank-transfer unlock at settlement finality, not instantly |
| Regulatory (money transmission, token delivery as brokerage, MiCA) | Shape B keeps fiat licensing at Stripe; Processor is a payer, protocol issues tokens. Formal legal review before scale — open item. |

## Out of scope for v1

Other chains; embedded wallets; embeddable widget; recurring donations; per-project risk tiering (rejected); custom MoR deals; automated eligibility review.

## Open questions

1. Stripe onboarding: is USDC-on-Base settlement available to this entity today? If not, fiat settlement + exchange conversion interim.
2. Crossmint quote (fees + chargeback terms on a custom plan) as a comparison point / future MoR edge.
3. Card ceiling initial value ($500 proposed) and quote-drift tolerance value.
4. Legal review scope: US money-transmission analysis for the float, MiCA exposure for EU donors.
5. $PROCESSOR revnet parameters (stages, issuance, cash-out) — separate design.
