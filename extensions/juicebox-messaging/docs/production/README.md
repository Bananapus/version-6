# Production readiness

This directory is the normative production specification for Juicebox Messaging. The demo UI and the HTTP LAN lab are implementation harnesses; neither is evidence that the service is secure or production-ready.

## Status language

Every production capability moves through all five states. A capability is not launchable while any earlier state is missing.

1. **Specified** — trust boundaries, wire behavior, failure behavior, retention, and acceptance tests are written without unresolved security-critical ambiguity.
2. **Implemented** — production code exists behind the specified interface and fails closed when a dependency or proof is unavailable.
3. **Verified** — deterministic, adversarial, cross-platform, recovery, load, and chaos tests meet the documented thresholds.
4. **Audited** — an independent review covers the deployed cryptographic core, client integration, service boundary, and remediation diff.
5. **Operational** — production infrastructure, monitoring, key management, backups, restore drills, incident response, privacy operations, and staffed ownership are live.

“Demo,” “simulated,” “candidate,” and “development” capabilities MUST NOT be used as authority by a production path.

## Specification map

| Area | Normative document | What it must settle |
| --- | --- | --- |
| System design | [`architecture.md`](./architecture.md) | Components, trust boundaries, identifiers, state ownership, protocol sequencing, and non-goals |
| Adversaries | [`threat-model.md`](./threat-model.md) | Assets, attackers, abuse cases, mitigations, residual risk, and threat-to-test traceability |
| Hard rules | [`security-invariants.md`](./security-invariants.md) | Conditions that every client, service, integration, migration, and recovery path must preserve |
| Identity and gates | [`identity-and-entitlement.md`](./identity-and-entitlement.md) | Wallet/device enrollment, project authority, finalized purchase evidence, revocation, and reorg behavior |
| Service protocol | [`service-api.md`](./service-api.md) | Versioned authenticated APIs, ordered delivery, idempotency, concurrency, errors, and limits |
| Data lifecycle | [`storage-and-retention.md`](./storage-and-retention.md) | Schemas, metadata minimization, retention, deletion, export, backups, and restores |
| Embedding | [`embed-contract.md`](./embed-contract.md), [`embed-security.md`](./embed-security.md) | Dedicated-origin integration, host messages, theming, browser isolation, and forbidden data flows |
| Operations | [`operations.md`](./operations.md) | Deployment, secrets, observability, SLOs, capacity, abuse defense, incidents, and runbooks |
| Verification | [`verification.md`](./verification.md) | Objective test matrix and staged testnet/mainnet release gates |
| Launch decision | [`launch-gates.md`](./launch-gates.md) | Evidence required for security claims and production enablement |
| Decision register | [`decision-log.md`](./decision-log.md) | Fixed architecture, unresolved engineering/product choices, owners, closure gates, and the fail-closed state while each choice remains open |

If documents disagree, the stricter privacy or authorization behavior wins until the contradiction is resolved in the decision log and all affected tests are updated.

## Fixed architectural decisions

- The canonical client is served from a dedicated messaging origin. A cross-origin iframe may render that same client; host-page JavaScript is not part of the trusted E2EE endpoint.
- Host integrations receive only a small, versioned bridge. Plaintext, shipping details, message keys, attachment capabilities, wallet signatures, and trusted eligibility assertions never cross to the parent.
- Host styling is expressed through bounded semantic theme tokens or reviewed first-party presets. Arbitrary CSS, HTML, script, fonts, images, or URLs are not accepted.
- Wallet signatures authenticate account and device enrollment. They are never used as message-encryption keys, archive keys, or deterministic key material.
- The service adopts an independently audited MLS implementation. It does not invent cryptography or describe base64 encoding as encryption.
- The delivery service stores ciphertext plus explicitly documented routing metadata. Durable sends use an ordered append-only log, server sequence, authenticated sender context, and idempotency.
- Indexer metadata is discovery input only. Chat access requires canonical, finalized onchain evidence plus explicit policy evaluation.
- Onchain ownership is not consent to receive messages. Subscription/consent and eligibility are separate facts.
- Losing eligibility removes future access after a cryptographic epoch change; it cannot retract plaintext already seen or copied.
- New project owners or staff do not silently inherit old private support history.
- WhatsApp, Telegram, and similar bridges are separate trust modes. Provider-readable full-text relays are visibly distinguished from native E2EE; notification-only deep links preserve native E2EE.

## Release stages

| Stage | Audience | Required properties |
| --- | --- | --- |
| Local lab | Developers using fictional data | Explicitly simulated, bounded, disposable, and isolated from production configuration |
| Internal HTTPS alpha | Named testers | Real device identity and E2EE on test infrastructure; no production entitlement or security marketing |
| Public testnet beta | Opt-in testnet projects | Finalized testnet proofs, recovery/device removal, abuse controls, export/delete, production-like operations, published limitations |
| Mainnet pilot | Allowlisted projects and capped volume | Independent audit remediated, restore/incident/load drills passed, legal/privacy sign-off, monitored SLOs, kill switches |
| General availability | Approved regions and use cases | Every launch gate has named evidence and an owner; no open critical/high security issue or undocumented privileged path |

## Current state

As of 2026-08-14, the repository contains the following implementation evidence:

- a responsive standalone purchase-support UI with fictional shipping-address
  exchange and Neutral, Juicebox, and Revnet compiled presets;
- read-only Juicebox v6 project discovery whose result is explicitly
  `candidate-display-only` and never authority;
- an unsafe two-browser HTTP LAN integration lab with a bounded, disposable
  development store;
- a paired-loopback cross-origin embed/theme protocol lab at `/embed-preview`,
  including bounded semantic custom-theme parsing and CSP-nonce stylesheet
  materialization;
- opt-in production browser-policy machinery for canonical-origin enforcement,
  fresh CSP nonces, exact per-tenant frame ancestors, route-specific permissions,
  and fail-closed configuration; and
- identity/entitlement value objects, validators, decisions, and ports whose only
  shipped production defaults return `unavailable` and issue no credential,
  lease, membership effect, or authorization.

These are specifications, local test harnesses, and fail-closed foundations—not
a deployable secure messenger. In particular, the production tenant route
`/embed/{tenantPublicId}`, tenant/context service, real wallet and device
registry, canonical chain/RPC adapters, finalized entitlement engine, audited MLS
client, Delivery Service, key transparency, recovery, push, production data
stores, operational infrastructure, and Juicebox/Revnet launchers do not exist as
launchable production capabilities.

## Repository verification

From the application root, run:

```bash
npm run specs:check
```

That check validates document hygiene, local links and anchors, requirement-ID
sequences, canonical state lists, and parity between the open-decision register
and launch gates. It is necessary documentation evidence, not a substitute for
the implementation, adversarial, interoperability, audit, deployment, and
operational evidence required by `verification.md` and `launch-gates.md`.

The repository-level commands and runnable local routes are listed in the
top-level [`README.md`](../../README.md). `npm run check:all` is the broadest
offline automated suite. A release candidate instead starts with
`corepack npm run check:release`, which also validates the installed dependency
tree, performs the registry-backed production advisory check, and generates a
lockfile-bound CycloneDX SBOM. Passing either command does not promote an
unimplemented capability through the readiness states above.

The repository supply-chain check is not signed release evidence by itself. Its
SBOM and audit output must be retained with the exact revision and artifact
digest, and the separate license, secret, provenance, reproducible-build,
signing/attestation, independent-review, and operational gates remain mandatory.
