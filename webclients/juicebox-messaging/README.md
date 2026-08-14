# Juicebox Messaging

A standalone, dedicated-origin client for private communication between projects,
customers, and eligible communities.

> **Current status: development prototype and production specification.** The
> repository has a polished purchase-support demo, a deliberately unsafe
> two-device LAN lab, read-only Juicebox project discovery, a local cross-origin
> embed/theme lab, strict browser-policy machinery, and fail-closed authority
> contracts. It does not yet have real wallet/device authority, audited MLS,
> production message delivery, or a live Juicebox/Revnet chat integration. Use
> fictional data only.

This project does not modify or import Juicebox Money or Revnet Money. Those
applications can later launch or embed the first-party messaging client after
the standalone authority, encryption, delivery, and deployment gates pass.

## What is implemented

The single-browser demo covers a complete purchase-support journey:

1. A customer opens a purchase-bound support case.
2. Project staff request a shipping address.
3. The customer reviews the exact named staff devices and shares a structured
   address card. Approval is bound to that roster version and a simulated MLS
   epoch; a roster change forces another review.
4. Address details stay masked in the timeline, inbox preview, and fulfillment
   panel until deliberately revealed.
5. Project staff acknowledge the exact address version.
6. The project marks the order preparing, sends tracking, and marks it shipped.
7. A pre-shipment address update creates a new version and invalidates work tied
   to the older version. A post-shipment change becomes a separate correction
   request and cannot create a second shipment.

The UI uses progressive disclosure on mobile and desktop and includes compiled
Neutral, Juicebox, and Revnet visual presets. The embed contract also accepts a
strictly parsed semantic theme: allowlisted six-digit colors, corner style,
density, and system typography only. It never accepts host CSS, HTML, selectors,
fonts, images, URLs, or arbitrary strings. Security notices and approval
ceremonies remain controlled by the messaging client.

The two-device development lab binds each browser to a server-issued customer
or project-team role, enrolls the other browser through a one-use invitation,
stores the simulated transcript in SQLite, and synchronizes through an ordered
cursor API. This exercises the product flow; it is not a secure messenger.

## Local routes

| Route | Purpose | Boundary |
| --- | --- | --- |
| `/` | Single-browser purchase-support demo and theme presets | All identity, authority, MLS, delivery, and carrier behavior is simulated in memory |
| `/projects` | Read-only Juicebox v6 project lookup | Candidate display metadata only; never chat authority |
| `/shared` | Computer-and-phone integration lab | Enabled by `npm run dev:shared`; HTTP and server-readable simulated payloads |
| `/embed-preview` | Paired-loopback cross-origin bridge and theme lab | Localhost/127.0.0.1 only; no context redemption, auth, entitlement, encryption, or production tenant |
| `/embed-preview/frame` | Internal frame used by the embed harness | Not a standalone user entry point |

The production route `/embed/{tenantPublicId}` is specified but not implemented.
The preview frame must not be presented as a Juicebox or Revnet integration.

## Run locally

Use Node 22.23.1 or newer from this directory:

```bash
nvm use
npm install
npm run dev
```

Open <http://localhost:3004>. The development server uses the closed
`local-lab` browser-security mode unless explicitly configured otherwise.

The useful local entry points are:

- <http://localhost:3004/> for the purchase-support demo;
- <http://localhost:3004/projects> for project discovery; and
- <http://localhost:3004/embed-preview> for the cross-origin embed/theme lab.

The embed harness automatically pairs `localhost` with `127.0.0.1` on the same
port so that the parent and frame have different origins. Open the harness using
one of those loopback names, not a LAN address. It exercises exact-origin,
source, channel, nonce, sequence, replay, rate, and payload checks plus the three
compiled themes; it does not prove production isolation or E2EE.

## Test with a computer and phone

Keep both devices on the same local network, then start the dedicated
development service:

```bash
npm run dev:shared
```

The launcher prints a computer URL, one or more phone/LAN URLs, and a temporary
bootstrap secret. Then:

1. Open the printed computer URL and enter the bootstrap secret.
2. If that URL uses `localhost`, paste the printed LAN origin into **Origin your
   phone can reach**.
3. Choose this browser's role and create the shared test.
4. Scan the generated one-use QR code with the phone, or open its invitation
   link manually.
5. Confirm that the invitation fragment has disappeared from the phone's address
   bar, then explicitly choose **Join shared test**.
6. Exercise messages and the fictional shipping-address workflow in both
   directions.

If the phone cannot connect, confirm both devices are on the same Wi-Fi, use the
printed `http://192.168...:3004/shared`-style address rather than `localhost`,
and allow incoming connections to Node through the computer's firewall.

The lab stores its database at `.data/dev-messaging.sqlite` by default. A room
has exactly one customer and one project-team browser, accepts messages only
after both join, and is deleted after 24 hours. Each simulated envelope is
capped at 32 KiB; a room is capped at 1,000 envelopes and 8 MiB of encoded
payloads. Never enter real customer messages, names, addresses, or tracking
numbers.

## Resolve a Juicebox project preview

The standalone service resolves read-only Juicebox v6 metadata on Ethereum,
Optimism, Base, Arbitrum One, Sepolia, Optimism Sepolia, Base Sepolia, and
Arbitrum Sepolia. Use the `/projects` UI or the API directly:

```bash
curl 'http://localhost:3004/api/juicebox/projects/resolve?chainId=84532&projectId=11&version=6'
```

The response is untrusted, point-in-time indexer metadata marked
`candidate-display-only`; authorization, eligibility, purchase attribution, and
finality remain `not-evaluated`. Remote logo and metadata URIs must not be
rendered directly because they can track viewers. This endpoint must never grant
chat access.

## Browser security modes

The default `local-lab` mode denies external framing except for the exact paired
loopback embed preview and omits HSTS so the HTTP phone lab can work.

The implemented production response-policy mode requires all three settings at
both build and runtime:

```text
JUICEBOX_MESSAGING_WEB_SECURITY_MODE=production
JUICEBOX_MESSAGING_CANONICAL_ORIGIN=https://messages.example.com
JUICEBOX_MESSAGING_EMBED_INTEGRATIONS={"juicebox":{"frameAncestors":["https://juicebox.money"]},"revnet":{"frameAncestors":["https://revnet.money"]}}
```

Production configuration accepts exact normalized DNS-shaped HTTPS origins and
fails closed on malformed or missing values; deployment must separately verify
DNS ownership and public-safe resolution. The request path generates fresh
CSP nonces, applies route-specific framing and permissions policy, and checks
the canonical forwarded origin. This code is only one deployment layer: a
trusted TLS proxy must overwrite forwarding headers, the CDN must preserve the
policy and no-store behavior, and the deployed artifact still needs browser and
infrastructure verification. See
[`src/server/security/README.md`](./src/server/security/README.md) for the exact
boundary and unresolved deployment gates.

An omitted security mode is accepted only by `next dev` and tests. An optimized
build or start never silently falls back to the HTTP lab policy. Use the
explicit `build:lab` and `start:lab` commands for a local optimized artifact;
use the generic build/start commands only with complete production settings.

## Checks

Install Playwright Chromium once when browser tests are needed:

```bash
npx playwright install chromium
```

Run the narrowest useful command while developing:

| Command | Runs |
| --- | --- |
| `npm run specs:check` | Production-document hygiene, requirement sequences, cross-document state/decision parity, and local Markdown links |
| `npm run lint` | ESLint with zero warnings |
| `npm run typecheck` | Next route type generation and TypeScript under an explicitly configured security mode |
| `npm run typecheck:lab` | Route types and TypeScript under the explicit local-lab policy |
| `npm test` | Vitest unit and adversarial tests |
| `npm run build` | Strict optimized build and standalone staging; fails without explicit production configuration |
| `npm run build:lab` | Explicit local-lab optimized build and standalone staging |
| `npm run start` | Start a staged artifact with explicit production configuration |
| `npm run start:lab` | Start a staged local-lab artifact explicitly |
| `npm run check` | Specs, lint, lab typecheck, unit tests, and explicit lab build |
| `npm run test:e2e` | Fresh build plus desktop/mobile Chromium purchase-support, theme, PWA, and project-discovery acceptance |
| `npm run test:e2e:production-security` | Isolated production-mode build and Chromium CSP/header/hydration checks |
| `npm run test:e2e:shared` | Isolated two-browser LAN-lab acceptance suite with a temporary database |
| `npm run check:all` | The full static, unit, build, product browser, production-security, and shared-device suite |
| `corepack npm run deps:check` | Offline installed-tree validation, including peer dependency resolution, against the lockfile |
| `corepack npm run audit:production` | Registry-backed production dependency advisory check; fails on High/Critical findings or an unavailable audit service |
| `corepack npm run sbom:release` | Generate and validate a deterministic CycloneDX 1.5 SBOM for the complete locked dependency graph |
| `corepack npm run check:supply-chain` | Pinned-package-manager, dependency-tree, production advisory, and release-SBOM checks |
| `corepack npm run check:release` | The supply-chain checks followed by the complete `check:all` suite |

`check` and `check:all` remain offline after dependencies and Playwright Chromium
are installed, so ordinary development does not silently depend on registry
availability. Release candidates must use `corepack npm run check:release`; the
supply-chain portion enforces the `packageManager` pin, rejects an invalid
installed dependency tree, queries the configured npm audit service, and writes
the validated SBOM to the ignored
`.release-artifacts/juicebox-messaging.cdx.json` path. Set
`RELEASE_SBOM_PATH` to a release evidence-bundle path when the artifact must be
retained. The generator removes run-specific time data, derives the SBOM serial
from the lockfile digest, and records that SHA-256 digest in the SBOM.

This repository command is only a fail-closed release prerequisite. It does not
perform the required license and secret scans, reproduce and compare built
artifact digests, generate signed provenance, sign or attest the SBOM/artifact,
or replace independent security review. Those remain production launch gates.

To exercise the staged standalone server manually:

```bash
npm run build:lab
npm run start:lab
```

## Security and production boundary

The demo does not implement homemade cryptography and does not claim its
messages are end-to-end encrypted. In the single-device demo, shipping drafts
and messages live only in JavaScript memory; reloading resets them. The shared
lab instead base64url-encodes simulated event JSON and stores it on the local
development service, where the host computer and HTTP network may read it.

Implemented production-facing foundations include:

- typed identity, eligibility, roster, crypto, transport, and host-bridge ports;
- strict value parsing and decision contracts for wallet/device, project/staff,
  purchase/finality, refund, lease, and audit authority;
- safe default authority adapters that return `unavailable` and grant nothing;
- a ciphertext-only transport boundary in which the client must seal a domain
  event before submission;
- bounded semantic theming and an exact-origin embed protocol lab;
- nonce-based CSP and route-specific production browser policies; and
- the normative [production specification](./docs/production/README.md) and
  objective launch gates.

Those foundations are not live implementations of their external dependencies.
Production or testnet-gated messaging remains unavailable until, at minimum:

1. SIWE/passkey-backed device sessions and named-device lifecycle are connected
   to production stores and signature verifiers.
2. Canonical finalized Juicebox receipts, shop correlations, project authority,
   Revnet operators, staff delegation, refund/dispute state, and reorg response
   are verified over pinned deployments and independent RPC sources.
3. An independently audited MLS client, owned ciphertext Delivery Service,
   per-installation key lifecycle, key transparency, recovery, and removal are
   implemented and interoperably tested.
4. Production persistence, backups/restores, content-free push, rate/abuse
   controls, privacy operations, telemetry, incident response, and staffed SLOs
   pass their drills.
5. The real tenant route, one-use context issuance/redemption, host SDK, and
   Juicebox/Revnet launchers pass cross-origin deployment and security review.
6. Testnet beta, independent audit remediation, and every applicable launch gate
   have named evidence and owners before mainnet use.

Until then, do not use real wallet authority, customer information, shipping
addresses, production purchases, or security/E2EE marketing claims with this
service.
