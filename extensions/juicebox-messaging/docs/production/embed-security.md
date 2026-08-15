# Production embed security contract

Status: design requirement for the future production embed. The current `/shared`
HTTP LAN experience is a development simulation and does not satisfy this contract.

The normative words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY**
describe release requirements.

## Security boundary

The production web integration MUST be a complete messaging client served from a
dedicated HTTPS origin and embedded cross-origin by Juicebox, Revnet, or another
registered tenant. The host application may initiate and frame the experience, but
it is not a messaging endpoint:

- The host MUST NOT receive plaintext, cryptographic keys, private attachments,
  fulfillment data, or stable messaging identifiers.
- The frame MUST perform its own authentication, context redemption, entitlement
  verification, message decryption, rendering, and sensitive confirmations.
- Parent-provided wallet, project, purchase, role, or eligibility claims MUST be
  treated as untrusted hints. They never grant access.
- The frame's origin, storage, service worker scope, cookies, build, and dependency
  graph MUST be isolated from every host application.
- A host compromise must not, by itself, expose frame DOM or key storage. It can
  still hide, overlay, imitate, resize, or deny access to the frame; those residual
  UI risks are addressed below.

The preferred topology uses a registrable domain dedicated to messaging, not merely
a sibling of the host application, for example:

```text
Host:              https://juicebox.money
Messaging frame:   https://app.juicebox.chat
Messaging API:     https://api.juicebox.chat
Untrusted media:   https://media.juiceboxusercontent.net
```

If a sibling subdomain is used instead, all messaging cookies MUST be host-only and
every security cookie MUST use a `__Host-` prefix; all broad `Domain=` cookies MUST
be eliminated. Servers MUST reject duplicate security-cookie names and ambiguous
`Cookie` headers rather than choosing the first or last value. Active or
user-controlled content MUST live on a cookieless separate registrable domain, not
merely another `juicebox.chat` subdomain; it receives no credentialed CORS and cannot
set messaging-site cookies. Same-site CSRF/cookie-tossing risks still require an
explicit review. No marketing pages, analytics tags, tenant scripts, user HTML, or
other applications may share the messaging origin.

## Threat model and limits

This contract assumes HTTPS, a non-compromised browser, and uncompromised code served
by the messaging origin. It protects against accidental integration mistakes,
unregistered embedders, forged cross-window messages, a compromised host application's
JavaScript reading across the origin boundary, stale-frame replay, and malicious
configuration inputs.

It does not make an allowlisted parent visually trustworthy. An allowlisted or
compromised host can draw a fake chat, place transparent elements over the real
frame, clip security notices, suppress events, observe coarse timing and size, or
prevent the frame from loading. It may also persuade the user to grant tab/screen
capture; a policy on the child frame cannot revoke capture authority granted to the
top-level site. A repeatedly downloaded web client also trusts the messaging server
not to serve malicious JavaScript. High-assurance users and sensitive recovery
operations need a signed native client or a top-level messaging window whose origin
is visible in browser chrome. An in-app browser or webview that hides or falsifies
origin chrome cannot host a high-assurance confirmation; it must open the system
browser or a reviewed native client.

“End-to-end encrypted” describes content protection among authenticated messaging
devices; it does not mean the embedding host is invisible. The host necessarily
knows that it opened the frame and can observe allowed readiness, layout, unread,
error, and timing signals plus its own surrounding purchase context. Product copy
MUST NOT claim that the embed hides all metadata, authenticates the host's pixels, or
prevents the host from spoofing or denying the experience. Shipping and fulfillment
PII stays inside the encrypted client and never becomes a parent-visible event.

The frame MUST refuse to operate when `window.isSecureContext` is false. An HTTPS
frame inside an insecure ancestor is not a secure context in conforming browsers.

## Routes and deployment separation

Production SHOULD expose separate document routes with separate policies:

- `/embed/{tenantPublicId}` is frame-only, has an exact tenant-specific
  `frame-ancestors` policy, and receives the iframe sandbox policy.
- `/app` is the top-level/PWA experience and MUST use `frame-ancestors 'none'`.
- Authentication and recovery routes are top-level by default and MUST use
  `frame-ancestors 'none'` unless a specific embedded ceremony has been reviewed.
- APIs return data, never embeddable HTML, and reject browser requests from every
  origin except the exact messaging application origin. Prefer a same-origin BFF
  endpoint for session-bearing calls; any unavoidable API CORS policy MUST name the
  messaging origin exactly, never reflect arbitrary origins, and never use `*` with
  credentials.
- Decrypted or user-supplied attachments are never served as active content from the
  application origin or its registrable domain.

The tenant identifier in an embed URL is public routing data. It MUST NOT encode a
wallet, project, order, purchase, conversation, participant, or invitation. Embed
HTML and authenticated API responses MUST use `Cache-Control: private, no-store`.
Hashed static assets may be immutable and publicly cached only when they contain no
tenant or user data.

## Frame authorization

### Tenant allowlist

Each tenant registration MUST contain an exact set of allowed parent origins. An
origin is the canonical tuple of scheme, host, and effective port. Registration and
comparison rules are:

- HTTPS is mandatory outside local automated tests.
- Compare parsed, canonical origins; never use suffix, prefix, substring, wildcard
  regular-expression, `endsWith`, `Referer`, or caller-supplied string comparisons.
- Reject credentials, paths, queries, fragments, IP surprises, Unicode confusables,
  and non-default ports unless the exact port was registered.
- Require tenant-admin authentication plus DNS or HTTPS control proof before first
  registration, and reverify origins after ownership/DNS changes; disable dangling
  or takeover-prone hostnames.
- Broad entries such as `https://*.example.com` SHOULD be forbidden. If a controlled
  subdomain wildcard is unavoidable, prove ownership and exclude tenant-controlled
  or user-content subdomains.
- Changes to the allowlist require strong tenant-admin reauthentication, audit logs,
  notifications, and a cooling-off policy for high-risk projects.
- Development, preview, and production origins are separate registrations.

The embed response MUST send `Content-Security-Policy: frame-ancestors ...` as an HTTP
response header containing only the registered exact origins for that tenant. The
directive cannot be supplied in a `<meta>` tag and does not inherit from
`default-src`. It must ship in the enforced policy rather than relying on
Report-Only. Browsers evaluate every ancestor, so undocumented nested framing is not
supported.

The server MUST resolve the tenant before constructing the policy. It MUST NOT
reflect an `Origin`, `Referer`, `Host`, query parameter, or postMessage value into
`frame-ancestors`. A CDN MUST NOT reuse one tenant's CSP for another tenant; use a
non-cacheable response or a cache key that is proven to include the resolved tenant.

`X-Frame-Options` cannot express a multi-tenant cross-origin allowlist. The embed
route MUST omit `X-Frame-Options: SAMEORIGIN`/`DENY` and rely on CSP
`frame-ancestors`. Non-embed documents SHOULD send `frame-ancestors 'none'` and may
also send `X-Frame-Options: DENY` as legacy defense in depth.

CSP framing is a browser containment control, not authorization. Opaque context
redemption MUST independently bind the tenant and exact parent origin.

### Host iframe

The supported host SDK MUST construct the iframe itself from a fixed messaging-origin
constant. It MUST reject a same-origin configuration. A minimal frame is:

```html
<iframe
  src="https://app.juicebox.chat/embed/tenant_public_id"
  title="Juicebox secure messaging"
  sandbox="allow-scripts allow-same-origin"
  allow=""
  referrerpolicy="no-referrer"
></iframe>
```

`allow-same-origin` is necessary for origin-bound storage and cookies. Combining it
with `allow-scripts` is acceptable only because the frame is always cross-origin
from its parent. Serving the frame from the parent's origin would let it escape this
meaningful isolation and MUST fail closed.

The default sandbox MUST NOT include:

- `allow-top-navigation` or `allow-top-navigation-by-user-activation`;
- `allow-downloads`;
- `allow-forms` for navigational form submission;
- `allow-modals`, `allow-pointer-lock`, `allow-presentation`, or orientation locks;
- `allow-storage-access-by-user-activation`;
- `allow-popups` or `allow-popups-to-escape-sandbox`.

The client can use semantic HTML forms while handling submission with same-origin
`fetch`; it does not need sandbox permission for cross-document form navigation.
Attachments that require a browser download SHOULD move the user to the top-level
client rather than enabling downloads for the entire embedded session.

An escape variant MAY add only `allow-top-navigation-by-user-activation`, never the
unqualified top-navigation token. Its in-frame action navigates the current tab only
to a compiled messaging-origin URL after a real user activation; message links never
use this permission. The response CSP sandbox must explicitly match this reviewed
variant.

A separately reviewed authentication/outbound-link variant MAY add both
`allow-popups` and `allow-popups-to-escape-sandbox`. The response CSP sandbox must
grant the same tokens or remain more restrictive. Popup destinations are either
compiled messaging/auth routes or an HTTPS origin visibly confirmed by the user from
decrypted content; they are never parent-provided. Popups require a user activation,
`noopener`, and `noreferrer` unless a documented, origin-checked callback protocol
genuinely requires an opener.

An empty iframe `allow` attribute means “no explicit container grants”; it is not a
universal deny-all policy. Features retain their specification-defined default
allowlists. The messaging response MUST therefore enumerate and deny every supported
unused policy-controlled feature. If a feature is required, a reviewed variant opts
into only that feature for the fixed frame source and adjusts the response policy,
for example clipboard write after a user gesture. Clipboard read, camera, microphone,
geolocation, payment, USB, Bluetooth, HID, serial, MIDI, display capture, fullscreen,
and Storage Access remain denied. The response policy is the authoritative upper
bound: a parent can make it more restrictive but cannot expand it with `allow`.

The parent SHOULD also restrict its own CSP with an exact
`frame-src https://app.juicebox.chat` directive.

### Frame navigation discipline

Sandbox tokens restrict navigation of other browsing contexts, but do not stop the
frame from replacing its own document. CSP `frame-src` controls child frames and
`form-action` controls form submission; neither is a general self-navigation policy.

- The embed route MUST render without HTTP redirects. Authentication state changes
  are API states such as `frame.auth_required`, not document navigations.
- Internal anchors and router calls use an exact same-origin route allowlist. The
  embedded renderer intercepts user-supplied links, accepts only reviewed schemes
  (HTTPS by default), shows the canonical destination origin, and never assigns them
  to `_self`, `window.location`, a form, or a host event.
- The default sandbox cannot safely open an arbitrary decrypted link. It first moves
  the user to the fixed top-level messaging client; the user can confirm and open the
  link there with `noopener noreferrer`. A reviewed popup variant may open the
  confirmed URL directly, without an opener and without sending it to the parent.
- The host SDK keeps the iframe visually unavailable until a valid `frame.ready`.
  Every subsequent `load`, even at the same origin, destroys the channel, hides the
  frame, and requires the fixed embed URL, a new handshake, and a fresh context
  handle. Redirect loops fail to the top-level client.

These SDK behaviors prevent accidental phishing on an honest host. A compromised
parent can suppress them, remove the frame, or draw its own substitute UI; they do
not upgrade the parent into a trusted security boundary.

## Versioned cross-origin protocol

All cross-window data is hostile input. Both directions MUST use an exact
`targetOrigin`; `"*"` is forbidden, including during initialization and error paths.
Every receiver MUST validate both:

```text
event.origin === canonicalExpectedOrigin
event.source === expectedWindowReference
```

The parent compares `event.source` with `iframe.contentWindow`. The frame compares it
with `window.parent`. The frame's expected parent origins come from the server-resolved
tenant configuration, never from `document.referrer` or the initialization payload.
Origin checks occur on every window message, not only the first one.

### Envelope

Every accepted message except the one-shot pre-channel readiness signal uses an
exact, runtime-validated envelope:

```ts
interface EmbedEnvelopeV1<TType extends string, TPayload> {
  protocol: "org.juicebox.messaging.embed";
  version: 1;
  type: TType;
  channelId: string;       // 128+ random bits, base64url
  sequence: number;        // strictly increasing per direction
  peerNonce?: string;      // omitted only on host.init; otherwise echoes receiver
  requestId?: string;      // bounded, unique for this sender in this channel
  payload: TPayload;
}
```

The only pre-channel exception is the exact
`{ protocol, version, type: "frame.bootstrap_ready", bootstrapNonce }` record. The
frame generates the 256-bit base64url bootstrap nonce only after installing its
host-message listener. The host accepts that record once through a gate already
bound to the current `iframe.contentWindow` and compiled exact messaging origin.
It rejects ports, unknown fields, invalid prototypes, malformed values, values over
2 KiB, attempts over the trusted-message rate, and signals after the ten-second
handshake deadline. This signal has no channel, sequence, peer nonce, request ID,
context, product dispatch, logging payload, or authority semantics. No other
pre-channel message exists in V1.

Requirements:

- Use a cryptographically secure browser random source for nonces and channel IDs.
- Validate exact object shape, known keys, type discriminant, version, string length,
  character set, integer range, array length, and total serialized size.
- Require `event.ports.length === 0` and reject all transferables in version 1.
- Reject unknown versions and types. Do not silently reinterpret a newer payload.
- If releases support `N` and `N-1`, each version has a complete independent schema
  and state machine. `host.init` selects one version and `frame.ready` echoes that
  exact version. A mismatch fails closed; neither side retries a weaker version in
  the same channel or reuses the context handle, and compatibility never makes a
  nonce, origin, source, sequence, or forbidden-field check optional.
- After the first accepted envelope in each direction, require exactly the next
  sequence value (`previous + 1`); reject gaps, duplicates, regressions, non-safe
  integers, and exhaustion.
- A request ID is unique among messages from the same sender in one channel. The
  opposite direction has an independent namespace, matching its independent
  sequence and replay gate.
- Bound the whole message to 8 KiB and normal operational payloads to 2 KiB.
- Bound outstanding requests and rate-limit each direction. A reasonable starting
  budget is 20 messages per ten seconds with a small burst, measured in tests.
- Never dispatch with dynamic property access into application objects, merge
  untrusted objects into configuration, or pass values to HTML/CSS/URL sinks.
- Stable error codes may cross the boundary; exception text, stack traces, HTTP
  bodies, and upstream errors may not.

### Handshake

1. The host installs its listener and a one-shot source/origin-bound readiness gate,
   then creates the iframe from the fixed messaging URL. It does not use an
   arbitrary delay and does not retry initialization.
2. After installing its listener, the frame generates a fresh 256-bit nonce and
   posts `frame.bootstrap_ready` once to the exact configured parent origin.
3. The host validates that explicit pre-channel exception. Only then does it create
   a fresh `channelId`, 256-bit `parentNonce`, and request ID and consume a
   still-valid one-use context handle issued by the messaging authority. Every
   replacement channel requires a newly issued handle.
4. The host sends `host.init` at sequence zero to the exact messaging origin. Its
   payload echoes the bootstrap nonce and contains the parent nonce, opaque context
   handle, and bounded display preferences. It transfers no plaintext or authority
   claims and omits `peerNonce` entirely.
5. The frame verifies source, origin, tenant allowlist membership, envelope schema,
   the readiness-nonce echo, and that no channel is already active. It pins that
   exact origin, compares it again during context redemption, and creates a fresh
   `frameNonce`.
6. The frame returns `frame.ready` to the pinned exact parent origin. Its envelope
   `peerNonce` echoes the parent nonce; its payload includes the frame nonce,
   accepted version, and a fixed capability list.
7. The host verifies source, origin, channel, and echoed nonce. After this point,
   parent-to-frame messages echo `frameNonce`; frame-to-parent messages echo
   `parentNonce`.
8. Operational messages are ignored until the handshake completes. One ten-second
   deadline bounds readiness and initialization together. Timeout destroys the
   iframe; manual recovery reconstructs its fixed source with all-new values.
9. Navigation, a second initialization, logout, source/origin drift, a sequence
   violation, or repeated malformed input destroys the channel and invalidates any
   unredeemed context handle. Trusted malformed input or an origin change by the
   same `WindowProxy` removes or replaces the iframe document, rather than merely
   hiding a still-running peer.

React development remounts, browser back/forward cache, iframe reloads, and two
iframes on one page MUST NOT share a channel. A stale frame cannot regain authority
by replaying a valid older `frame.ready`.

Version 1 does not transfer a `MessagePort`. A port is a capability and its messages
have no per-message origin property. A future protocol version may add one only with
an explicit negotiated message type after the validated window handshake; it must
retain version, channel, nonce, sequence, schema, size, teardown, and rate checks.

### Permitted messages

The initial protocol SHOULD remain deliberately small:

| Direction | Type | Permitted payload |
|---|---|---|
| Frame to host, pre-channel | `frame.bootstrap_ready` | Bootstrap nonce only; the exact bounded exception above |
| Host to frame | `host.init` | Bootstrap-nonce echo, parent nonce, opaque context handle, locale ID, theme ID/tokens |
| Host to frame | `host.set_theme` | Validated presentation tokens only |
| Host to frame | `host.set_locale` | One supported locale identifier |
| Host to frame | `host.destroy` | Empty object |
| Frame to host | `frame.ready` | Frame nonce, accepted version, fixed capabilities; the envelope echoes the parent nonce |
| Frame to host | `frame.layout` | One enum: `compact`, `regular`, or `expanded` |
| Frame to host | `frame.unread` | Boolean by default; optionally a capped bucket, never sender/context |
| Frame to host | `frame.auth_required` | One coarse reason enum |
| Frame to host | `frame.open_top_level` | One reason enum; parent maps it to a fixed messaging URL |
| Frame to host | `frame.closed` | Empty object |
| Frame to host | `frame.error` | Established-only `context-invalid`/`channel-invalid` (terminal) or `temporarily-unavailable` (fresh restart allowed) |

Layout events MUST use fixed presets, be debounced, and not expose exact content
height. Unread events SHOULD be delayed and coalesced. Otherwise size and timing can
become a message-content side channel.

The parent MUST NOT navigate to a URL supplied by the frame. It maps a fixed reason
to a compiled, HTTPS messaging-origin route. Conversely, the frame does not fetch a
host-supplied URL. Unsupported-version and origin-mismatch conditions occur before
a safe established channel and never become `frame.error` values. Context absence,
expiry, replay, audience mismatch, and lookup ambiguity all collapse to the one
terminal `context-invalid` code.

## Opaque context redemption

The host application needs a way to ask the standalone client to open the same
candidate project or purchase without placing business data on the bridge. It does
so with an opaque context handle.

The handle MUST:

- contain at least 256 random bits and no self-describing JWT claims;
- be stored hashed at rest;
- expire no later than two minutes after issuance and be single-purpose and
  single-use;
- be bound server-side to tenant ID, exact parent origin, intended messaging origin,
  context kind, expiry, and a random creation nonce;
- be bound at redemption to the active frame bootstrap/authenticated session and
  handshake channel; no context detail or authority is released until user/device
  authentication succeeds;
- support an atomic, narrowly idempotent redemption attempt so a lost response does
  not turn replay into a general recovery mechanism;
- never appear in iframe `src`, query, fragment, `Referer`, analytics, logs, crash
  reports, browser storage, or parent-visible errors;
- have the redemption record and any linked purchase/PII reference purged on a
  short documented schedule after redemption or expiry; audit records retain only a
  coarse outcome and random audit ID that cannot be joined to a wallet, purchase, or
  conversation;
- be invalidated when the channel is destroyed before redemption.

The host sends the handle only inside the validated `host.init`. The frame redeems it
through a same-origin HTTPS POST with normal session, Origin, Fetch Metadata, CSRF,
expiry, and replay controls.

Handle issuance is also an authorization boundary. A tenant backend SHOULD mint one
through an authenticated server-to-server request. If a browser endpoint is
unavoidable, it MUST require the tenant's exact host origin, an authenticated tenant
session, CSRF and Fetch Metadata checks, strict rate limits, and an auditable
server-derived context. The caller cannot choose resolved roles or entitlement
facts. Issuance and redemption responses are `no-store`; failed and expired handles
are indistinguishable at the bridge.

Redemption associates server-resolved candidate context with the frame session but
returns only a generic continuation state until authentication; it does not prove
eligibility. Before naming the context, joining, or revealing a chat, the messaging
service independently verifies:

- the user's wallet/account and per-device credential;
- the project and current authorized project staff;
- the finalized purchase, token, item, refund, dispute, or snapshot evidence required
  by the conversation policy;
- delegation, owner changes, chain ID, contract, and policy version;
- that the requested role came from verified authority, not the host.

A parent that invents an order ID, wallet, role, or project must get the same generic
denial as an unknown context. Error differences must not provide a wallet, purchase,
or conversation enumeration oracle.

## Forbidden bridge data

No message in either direction may contain, directly or encoded:

- message plaintext, drafts, reactions, quoted text, search terms, or typing content;
- decrypted attachment bytes, filenames, MIME details, thumbnails, object
  capabilities, encryption keys, or private download URLs;
- shipping addresses, recipient names, phone numbers, email, delivery notes,
  tracking codes, or fulfillment instructions;
- wallet addresses, signatures, SIWE/EIP-712 messages, transaction hashes, token
  balances, or raw entitlement proofs;
- project, purchase, order, item, tier, reward, or conversation identifiers;
- participant IDs, group IDs, device IDs/fingerprints, KeyPackages, MLS epochs,
  transcript hashes, ratchet state, key material, or recovery material;
- cookies, session IDs, CSRF values, invite tokens, access/refresh tokens, popup OAuth
  codes, or notification capabilities;
- exact message timestamps, sender identities, read receipts, presence, block/report
  state, or recipient counts;
- raw HTTP/API responses, URLs containing secrets, exception messages, stack traces,
  log correlation IDs, or analytics identifiers that can be joined to a user.

Base64, hashing, encryption under a host-known key, or renaming a field does not make
forbidden data acceptable. The bridge is for opaque initiation and coarse shell UI,
not a second transport.

## Storage, sessions, and device identity

Browsers increasingly partition or block cookies, IndexedDB, Cache Storage, service
workers, and other state in third-party frames. The product MUST NOT assume that the
top-level messaging session or installation is available inside an embed.

- Treat each `(messaging origin, top-level site)` pair as a distinct embedded
  installation regardless of the browser's current partition behavior.
- Namespace every embedded database, key record, service-worker message, and server
  session by the server-pinned tenant and parent origin even in browsers that do not
  partition storage. A top-level `/app` session is a separate session class and never
  becomes ambient embed authority.
- Never copy live MLS state, device private keys, decrypted history, or recovery
  secrets through the parent to work around partitioning.
- After the validated handshake, the frame MAY create a minimal bootstrap session
  bound to tenant, parent origin, and channel solely to redeem the handle. It carries
  no user identity or messaging authority. Promote or replace it only after
  user/device authentication and eligibility checks, and rotate the session
  identifier at that boundary. Prefer host-only, partitioned cookies where
  supported, for example a `Secure`, `HttpOnly`, `SameSite=None`, `Path=/`,
  `Partitioned` cookie with a `__Host-` name.
- The `Partitioned` attribute is not the sole isolation control: older browsers may
  ignore it. Never silently downgrade to a shared global `SameSite=None` login. A
  fallback embed cookie and its server record remain ephemeral and tenant/origin/
  channel-bound, with an explicit top-level authentication path when durable login
  cannot be isolated.
- Discard an unauthenticated bootstrap context when its channel closes or times out;
  a replacement frame needs a fresh handle. Never let a redeemed handle become a
  durable ambient capability in the partition.
- Bind the server session to the tenant and expected parent origin even though the
  browser storage is partitioned.
- Treat the allowlisted parent as a CSRF attacker. Every state-changing HTTP request
  MUST be non-GET, reject simple form content types, require a same-origin CSRF value,
  and validate the exact messaging-app `Origin` plus Fetch Metadata. WebSocket and
  streaming upgrades MUST validate `Origin` before accepting the session. CORS is
  not a CSRF defense by itself.
- Assume private browsing and eviction can erase the installation. Detect this and
  offer device enrollment or top-level recovery; never silently restore stale live
  group state.
- The parent cannot provide a cookie, storage snapshot, IndexedDB export, service
  worker, Web Lock, or BroadcastChannel to the frame.
- The launch service worker uses a no-cache strategy. A future reviewed offline shell
  may cache only immutable public build assets; it MUST always bypass authenticated
  documents, API responses, ciphertext mailboxes, attachments, and any plaintext/PII.
  Update and emergency revocation behavior is release-tested.
- Do not use `window.name`, URL state, or parent local storage for continuity.

The Storage Access API exposes unpartitioned first-party state and can create
cross-tenant linkability. It is denied by default. A future use requires a separate
privacy review, a clear user gesture and explanation, the minimum sandbox and
Permissions Policy grants, browser-specific testing, and a fully functional refusal
path. It MUST NOT be silently requested during frame load.

Wallet authentication, passkeys, device enrollment, recovery, key export, staff-role
changes, and address sharing SHOULD occur top-level. Cross-origin WebAuthn and wallet
extension behavior varies by browser and embedding policy; lack of embedded support
must lead to an explicit top-level fallback, not weaker authentication.

## Popup and top-level fallback

Every embed MUST visibly present a prominent “Open secure chat” action, and the host
SDK MUST render a separate real fixed-origin anchor adjacent to the iframe. In the
default sandbox, the in-frame action can only emit `frame.open_top_level`; the SDK may
navigate the current tab to its compiled messaging URL. This host-mediated action is
usability, not a security boundary: a compromised parent can suppress or spoof both
controls. For sensitive operations, use the reviewed user-activated navigation or
popup variant, or instruct the user to open the known messaging origin independently.
The user must be able to inspect that origin in browser chrome.

Preferred fallback patterns are:

- a fixed top-level messaging URL where the authenticated user resumes server-side
  context; or
- a user-initiated popup whose state is bound to a server-side, one-time flow and
  completed with OAuth state/PKCE or an equivalent wallet challenge.

Do not put conversation or recovery capabilities in handoff URLs. If a popup needs
cross-window communication, establish a fresh exact-origin/source/nonce handshake;
do not reuse the iframe channel.

`Cross-Origin-Opener-Policy: same-origin` can sever opener relationships to
cross-origin wallet or identity pages. Prefer an opener-free server callback. If the
flow genuinely requires a popup relationship, evaluate
`same-origin-allow-popups` on the top-level route and test it independently. Never
weaken postMessage validation to compensate for COOP behavior.

Popup blockers require a direct user activation. A parent cannot reliably receive an
asynchronous `frame.open_top_level` message and call `window.open`; the host SDK
uses current-tab navigation or its adjacent real fixed-origin link, while the frame
may open its own link only in a reviewed popup/top-navigation sandbox variant.

## Clickjacking and host spoofing

`frame-ancestors` stops unregistered sites; it does not stop an allowlisted parent
from abusing presentation. Accordingly:

- Address sharing, wallet signatures, recovery, device enrollment, key export,
  destructive actions, and staff/recipient changes SHOULD require top-level display.
- Embedded confirmations MUST show an unthemeable security header and a clear
  recipient summary. This is helpful context, not proof of origin; only browser chrome
  authenticates the site.
- The frame SHOULD refuse sensitive interaction below reviewed minimum dimensions,
  while hidden, or without recent user activation. These checks reduce accidents but
  cannot detect a transparent parent overlay reliably.
- Security notices, recipient lists, confirmation text, focus outlines, and the
  top-level escape action cannot be hidden, reordered, recolored below contrast
  requirements, or removed by theming.
- Host SDK guidance MUST forbid overlays, clipping, transforms that distort controls,
  transparent frames, negative stacking tricks, and intercepting pointer regions.
- Focus movement across the frame boundary must be deliberate. The iframe needs a
  useful `title`; the host must preserve keyboard access and visible focus.
- Do not claim that `IntersectionObserver`, frame dimensions, visibility state, or
  user activation fully detects clickjacking. A malicious host controls the pixels
  around and over the frame.

## Theme and host-input safety

The theme surface MUST be data, never code. Prefer one versioned enum such as
`light`, `dark`, or a pre-reviewed tenant theme. If tokens are supported, each token
maps to a predeclared internal class.

Allowed examples:

- theme and density enums;
- a locale from a compiled allowlist;
- canonical `#RRGGBB` colors from a constrained set after contrast validation;
- radius, spacing, and typography enums backed by bundled assets;
- in a future protocol version only, a fixed logo-mark enum backed by a reviewed,
  server-owned asset registry. Version 1 exposes no logo-mark field.

Forbidden inputs include:

- CSS text, selectors, property names, custom-property names, `style.cssText`, or
  arbitrary style attributes;
- HTML, SVG markup, templates, class names, JavaScript, event handlers, or Trusted
  Types policy names;
- `url()`, `@import`, external stylesheet/font/image/avatar/icon URLs, data/blob URLs,
  or host-provided asset bytes;
- arbitrary font families, cursor images, filters, blend modes, opacity, transforms,
  z-index, negative margins, positioning, display/visibility, or pointer behavior;
- unbounded strings, Unicode controls, NaN/infinite numbers, extreme sizes, or tokens
  that can hide warnings or create pixel-perfect host impersonation.

Theme payloads MUST be exact-schema validated, under 2 KiB, rate-limited, applied
through typed mappings, and kept in channel-scoped memory only. The frame's CSP MUST
forbid host-selected resource origins, but CSP is not the sole anti-exfiltration
control: required same-origin API/static destinations remain reachable. Even if a
validator mistakenly admits CSS-like text, the application mapping must never put it
in a CSS or URL sink. Version 1 has no accepted logo-mark enum and makes no
theme-selected asset request. If a later version adds one, only an exact enum may
select among fixed, server-registered asset URLs; no input string may be interpolated
into a request. Theme values never enter browser/server persistence, logs, analytics,
URLs, DOM HTML sinks, dynamic URL or resource-name construction, or CSP construction.

Every channel teardown removes its nonce-bearing generated stylesheet and clears
custom tokens and the selected preset before terminal UI renders. A replacement
frame starts from the reviewed server baseline; it does not inherit presentation
state from the failed or closed channel.

## Response security policy

The embed route needs a generated nonce and tenant-specific ancestor list. A baseline
policy, to be adapted without weakening its intent, is:

```http
Content-Security-Policy:
  default-src 'none';
  base-uri 'none';
  object-src 'none';
  frame-ancestors https://registered-tenant.example;
  frame-src 'none';
  form-action 'none';
  script-src 'nonce-{RANDOM_PER_RESPONSE}' 'strict-dynamic';
  script-src-attr 'none';
  style-src 'self' 'nonce-{RANDOM_PER_RESPONSE}';
  style-src-attr 'none';
  img-src 'self' data: blob:;
  font-src 'self';
  media-src 'self' blob:;
  connect-src 'self' https://api.juicebox.chat https://delivery.juicebox.chat;
  worker-src 'self';
  manifest-src 'self';
  sandbox allow-scripts allow-same-origin;
  require-trusted-types-for 'script';
  trusted-types nextjs nextjs#bundler;
  upgrade-insecure-requests
```

If the audited MLS/WASM build requires WebAssembly compilation, add only
`'wasm-unsafe-eval'`; never add general `'unsafe-eval'`. If Next.js or another
framework cannot run without `'unsafe-inline'`, fix nonce propagation or the build
rather than accepting that directive. Scripts, workers, fonts, and styles SHOULD be
self-hosted. No tag manager, advertising, session replay, support widget, or unrelated
third-party script may execute on the messaging origin.

Additional baseline headers:

```http
Referrer-Policy: no-referrer
Permissions-Policy: accelerometer=(), ambient-light-sensor=(), attribution-reporting=(), autoplay=(), bluetooth=(), browsing-topics=(), camera=(), clipboard-read=(), clipboard-write=(), cross-origin-isolated=(), display-capture=(), encrypted-media=(), fullscreen=(), gamepad=(), geolocation=(), gyroscope=(), hid=(), identity-credentials-get=(), idle-detection=(), local-fonts=(), magnetometer=(), microphone=(), midi=(), otp-credentials=(), payment=(), picture-in-picture=(), publickey-credentials-create=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), speaker-selection=(), storage-access=(), sync-xhr=(), usb=(), web-share=(), window-management=(), xr-spatial-tracking=()
X-Content-Type-Options: nosniff
Origin-Agent-Cluster: ?1
Cache-Control: private, no-store
Strict-Transport-Security: max-age=63072000; includeSubDomains
```

Send HSTS from the controlled registrable parent only when every subdomain is HTTPS,
or configure every service host separately; `includeSubDomains` sent by
`app.juicebox.chat` does not cover its `api.juicebox.chat` sibling. Enable HSTS
`preload` only after every subdomain is ready. CSP and Permissions Policy violation
reports can themselves leak URLs and origins; keep secrets out of URLs, sample
reports, restrict the collector, and apply a separate retention policy.

Permissions Policy has no universal “deny every present and future feature” switch.
The shipped list MUST be generated from a reviewed browser feature inventory, deny
every unused supported feature, and be re-audited as browsers add features. Unknown
directives are ignored, so the sandbox, top-level fallback, and application-level
checks remain necessary.

Trusted Types is defense in depth and has uneven browser enforcement. The application
must avoid injection sinks even where the header is ignored. The pinned Next.js 16
runtime currently requires the exact `nextjs` and `nextjs#bundler` policy names; those
framework policies and their call sites are part of every upgrade review. Do not permit
a default policy, host-selected names, or another application policy unless its narrow
sink contract is separately reviewed and added to the frozen release profile.

### COOP, COEP, and CORP

These headers solve different problems and are not substitutes for the iframe
boundary:

- COOP affects top-level opener relationships. It does not authorize an embed and
  can break wallet/OAuth popup callbacks.
- COEP can block cross-origin resources or strip credentials, depending on mode. A
  nested frame cannot assume cross-origin isolation unless the ancestor chain and all
  required resources participate.
- CORP is a resource-loading control, not a tenant or message authorization system.
  Applying `same-origin` indiscriminately can make a legitimate cross-origin embed or
  its assets fail under a tenant's COEP policy.

Do not enable COOP/COEP merely as a security badge. First determine whether the
crypto worker needs `crossOriginIsolated` features. If it does, test an explicit
header matrix with every supported tenant and resource. The baseline above explicitly
denies the `cross-origin-isolated` Permissions Policy feature.

A separately reviewed isolated-frame variant requires cooperation from the tenant:

- the top-level response supplies compatible COOP and COEP headers;
- the parent Permissions Policy delegates `cross-origin-isolated` to the exact
  messaging origin, and its iframe uses `allow="cross-origin-isolated"`;
- the frame response permits `cross-origin-isolated=(self)`, supplies its reviewed
  COEP value, and every required cross-origin resource opts in with CORS/CORP; and
- the client asserts `self.crossOriginIsolated` before selecting a threaded crypto
  build, otherwise it uses the audited non-threaded build or opens top-level.

The host SDK MUST NOT use an `<iframe credentialless>` variant for an authenticated
client. `COEP: credentialless` changes credential behavior for cross-origin no-CORS
resources; it is not a substitute for explicit CORS/CORP on reviewed resources or a
shortcut for authenticated API calls. If a host's cross-origin-isolation policy is
incompatible, provide the non-threaded or top-level client rather than relaxing CSP,
credentials, or origin checks.

Sensitive API and static-resource responses SHOULD use an appropriate same-origin
CORP policy after testing; the embeddable HTML response needs route-specific behavior.

## Abuse cases

| Abuse case | Required prevention/detection | Residual risk |
|---|---|---|
| Unregistered site frames the client | Tenant-specific CSP `frame-ancestors`; exact origin registry; context bound to parent origin | Unsupported/legacy browser or configuration compromise |
| Attacker reflects its Origin into CSP | Server-side tenant lookup only; no reflection; no-store response; cache-isolation test | Compromised tenant registry |
| Active media sibling cookie-tosses the app | Put active media on a separate registrable domain; `__Host-` security cookies; reject duplicate/ambiguous cookies | Legacy user-agent cookie bugs or deployment on the wrong site |
| Allowed host requests another user's order or chooses `project-staff` | Opaque context handle; independent wallet/device auth and finalized entitlement evaluation; role is server-derived | Host can mislead visually or deny service |
| Sibling window forges a `postMessage` | Exact `origin` and `source`; random channel/nonces; strict schema | Messaging-origin compromise defeats the web client |
| Old iframe replays a valid command after reload | Fresh nonces/channel; monotonic sequence; destroy on navigation; short-lived handle | Browser implementation failure |
| Host reads messages through bridge “telemetry” | Explicit message allowlist; forbidden-field tests; bounded coarse events | Timing and boolean unread metadata remain visible |
| Host infers content from exact iframe height | Fixed layout enums, debounce, rate limits | Coarse interaction timing remains visible |
| Malicious theme injects CSS that loads secret-dependent URLs | Enum/token mapping only; no CSS/URL sink or theme-derived fetch; CSP blocks host-selected origins; fixed server routes and log redaction | Required same-origin destinations mean CSP is not a complete defense; a compromised bundle can exfiltrate directly |
| Host overlays or imitates the frame | Top-level requirement for sensitive operations; fixed escape link; minimum dimensions; user education | An allowlisted parent controls surrounding pixels; cannot be fully prevented |
| Frame navigates itself or opens an attacker URL | Intercept self-navigation; fixed internal routes; HTTPS destination confirmation; hide and re-handshake after every load; reviewed popup/top-navigation variants | A compromised parent can ignore SDK hiding and spoof content; a compromised messaging bundle defeats client controls |
| Parent passes plaintext “for convenience” | Runtime exact schemas reject unknown/forbidden fields; development logging redacts payloads | Parent already knows data it generated, but must not make frame depend on it |
| Third-party cookies/storage are blocked | Partition-aware session; separate installation; top-level enrollment fallback | Added device friction and no automatic cross-host history |
| Storage Access silently links identities across tenants | Denied in sandbox and Permissions Policy; separate reviewed user-gesture flow only | User-approved unpartitioned access increases linkability |
| Invite/context handle leaks through URL or logs | Handle only after handshake; no URL placement; hashed storage; no-store/referrer policy; log redaction | Browser extensions or compromised endpoints can observe runtime data |
| Compromised host steals focus or blocks auth popup | In-frame and fixed host link; user-activated top-level fallback; timeout and visible errors | Host can always deny service |
| Malicious nested intermediary frames a tenant | CSP checks all ancestors; source must be immediate expected parent; no wildcard origins | Explicitly registered nesting would expand trust |
| Tenant enables COEP/COOP and breaks the frame | Supported header matrix; compatibility probe; top-level fallback | Some browser/webview combinations remain unsupported |
| Host delegates an unexpected powerful feature | Response Permissions Policy explicitly denies the reviewed feature inventory; effective-policy tests | A newly introduced browser feature needs inventory review |
| XSS reaches the messaging origin | No third-party JS; strict nonce CSP; Trusted Types; output encoding; dependency review; isolated media | Chat-origin XSS is catastrophic for unlocked plaintext and keys |
| Excessive bridge traffic causes UI or CPU denial | Message size/count/rate limits; bounded queues; channel teardown | Allowlisted host can still remove or reload the iframe |

## Conformance checklist

No production embed is releasable until every applicable item is automated or has a
recorded manual test.

### Origin and deployment

- [ ] Messaging uses an exclusive HTTPS origin and isolated service-worker scope.
- [ ] Host and frame are cross-origin; a same-origin configuration fails closed.
- [ ] User-uploaded active content is served from a cookieless separate registrable
      domain with no credentialed CORS to messaging.
- [ ] Every security cookie is `__Host-` scoped and duplicate/ambiguous security
      cookie headers fail closed.
- [ ] Embed, top-level, auth/recovery, API, and media routes have distinct policies.
- [ ] `window.isSecureContext` is asserted before authentication or key access.
- [ ] Tenant parent origins are exact, canonical, audited, and environment-specific.
- [ ] Each registered origin has current control proof and dangling DNS/subdomain
      takeover monitoring.
- [ ] Tenant allowlist changes require reauthentication and produce notifications.
- [ ] Embed CSP contains an explicit per-tenant `frame-ancestors` response header.
- [ ] A cache cannot serve one tenant's ancestor policy to another tenant.
- [ ] Non-embed documents use `frame-ancestors 'none'`.
- [ ] Embed responses omit conflicting `X-Frame-Options` values.
- [ ] The host's CSP permits only the fixed messaging origin in `frame-src`.

### Iframe containment

- [ ] The SDK, not arbitrary tenant input, builds the iframe URL.
- [ ] Default sandbox is exactly `allow-scripts allow-same-origin`.
- [ ] The embed response also applies a compatible CSP sandbox.
- [ ] Popup, download, form-navigation, top-navigation, and Storage Access tokens are
      absent from the default variant.
- [ ] Any popup variant has a separate threat review and user-activation tests.
- [ ] Any top-navigation variant grants only user-activated navigation to a compiled
      messaging URL and has a matching reviewed CSP sandbox.
- [ ] Empty `allow` is not treated as deny-all; the response policy explicitly denies
      every inventoried unused feature and effective-policy browser tests pass.
- [ ] Internal routes are exact-allowlisted; message links cannot self-navigate the
      frame or cross the parent bridge.
- [ ] The SDK hides the initial document until `frame.ready`; every later `load`
      destroys and hides the channel pending the fixed URL, a new handshake, and a
      new handle.
- [ ] The iframe has an accessible title, visible focus, minimum size, and fixed
      top-level escape action; the SDK also renders an adjacent fixed-origin anchor.

### postMessage protocol

- [ ] There is no `postMessage(..., "*")` in production code or dependencies.
- [ ] Both sides check exact `event.origin` and `event.source` on every window event.
- [ ] Frame-side allowed parents come from server tenant configuration, not Referrer.
- [ ] The only pre-channel message is an exact, source/origin-bound, no-port,
      rate/size/deadline-bounded, one-shot `frame.bootstrap_ready` signal.
- [ ] `host.init` echoes that frame's fresh bootstrap nonce; a stale, missing, or
      wrong echo fails closed without a weaker retry.
- [ ] Handshake uses fresh 256-bit nonces and a fresh random channel per iframe.
- [ ] Ready echoes the parent nonce; every operational message echoes the peer nonce.
- [ ] Sequence numbers are strictly monotonic per direction.
- [ ] Request IDs are unique within their sender's channel direction, including
      across initialization and established host operations.
- [ ] Initialization is one-shot and times out; reload/navigation destroys the channel.
- [ ] Trusted malformed input and origin drift from the expected `WindowProxy`
      remove or replace the iframe document, while unrelated windows are ignored.
- [ ] Established `frame.error` values use only the fixed context/channel/temporary
      outcomes; pre-channel origin/version failures expose no bridge error.
- [ ] Runtime validators reject unknown keys, types, versions, malformed values,
      prototypes/arrays where objects are expected, and excessive depth/size.
- [ ] Unexpected `event.ports`, transferables, and binary payloads are rejected.
- [ ] Per-channel queue, request, payload, and rate bounds are enforced.
- [ ] Schema fuzzing cannot reach URL, HTML, CSS, storage, or authorization sinks.
- [ ] Version 1 rejects MessagePorts; any future port protocol has a separate review
      and is negotiated only after source/origin validation.
- [ ] The supported `N`/`N-1` matrix uses separate validators and fails closed without
      downgrade or reuse of a handle when versions are incompatible.

### Context and authorization

- [ ] The iframe `src` contains no secret or user/business identifier.
- [ ] Context handles are opaque, 256-bit, hashed, expire within two minutes,
      purpose-bound, and atomically single-use.
- [ ] Handle records bind tenant, exact parent origin, frame origin, and expiry.
- [ ] Redeemed/expired handle records and linked context references are purged on the
      documented schedule; no resolved purchase or PII enters issuance audit logs.
- [ ] Redemption binds the active channel and bootstrap/authenticated embedded
      session; context disclosure waits for user/device authentication.
- [ ] Closing or timing out an unauthenticated channel discards its bootstrap
      context and requires a newly issued handle.
- [ ] Redemption POST enforces Origin, Fetch Metadata, CSRF, size, and replay policy.
- [ ] Wallet/device authentication and finalized onchain evidence are independently
      verified after redemption.
- [ ] Parent-selected roles, owners, balances, purchases, items, and policies are
      ignored as authority.
- [ ] Negative responses do not permit wallet, order, project, or conversation
      enumeration.

### Confidentiality and metadata

- [ ] An explicit type allowlist exists for both directions.
- [ ] Automated fixtures attempt every forbidden plaintext/key/PII field and fail.
- [ ] Error events contain only reviewed stable codes and retryability.
- [ ] Unread state is boolean or capped, delayed, and contains no context identity.
- [ ] Layout uses coarse presets and cannot encode exact content height.
- [ ] Logs, traces, analytics, CSP reports, crash reports, and browser URLs contain no
      bridge payloads or context handles.
- [ ] No plaintext bridge event exists for notifications, accessibility, search,
      support tooling, or analytics.

### Storage and authentication

- [ ] Chrome, Safari/WebKit, Firefox, mobile browsers, and supported webviews are
      tested with third-party cookies enabled, partitioned, blocked, and cleared.
- [ ] Embedded storage is treated as a separate installation where partitioned.
- [ ] Application namespaces and server-side bindings isolate tenants even when the
      browser ignores `Partitioned`; the top-level session is not reused ambiently.
- [ ] Private keys and live MLS state never cross the parent boundary.
- [ ] Embedded session cookies are host-only, Secure, HttpOnly, partition-aware, and
      bound server-side to the tenant context.
- [ ] All HTTP mutations and connection upgrades enforce same-origin Origin/CSRF or
      Origin checks; cross-origin forms and credentialed fetches from the parent fail.
- [ ] Storage eviction and private browsing lead to explicit enrollment/recovery, not
      stale-state reuse.
- [ ] Storage Access is denied by default and refusal leaves a working fallback.
- [ ] Wallet, passkey, recovery, role change, export, and sensitive fulfillment flows
      have tested top-level paths.
- [ ] Popup OAuth/wallet flows use state and PKCE or an equivalent signed challenge.
- [ ] COOP behavior cannot silently break or weaken popup validation.

### CSP and code integrity

- [ ] CSP ships in enforcement mode with per-response script/style nonces.
- [ ] `unsafe-inline` and general `unsafe-eval` are absent.
- [ ] `wasm-unsafe-eval`, if present, is justified by the pinned audited WASM build.
- [ ] Trusted Types enforcement uses only small reviewed policies and no permissive
      default policy.
- [ ] Scripts, workers, styles, fonts, and crypto WASM are self-hosted and pinned.
- [ ] No tag manager, ad, session-replay, remote support, or tenant script runs on the
      messaging origin.
- [ ] `connect-src` contains only required messaging services.
- [ ] `frame-src`, `form-action`, `base-uri`, and `object-src` remain `none`.
- [ ] Referrer, Permissions Policy, nosniff, Origin-Agent-Cluster, cache, and HSTS
      headers are asserted in deployment tests.
- [ ] COOP/COEP/CORP combinations are tested against each supported host policy;
      incompatible cases use top-level fallback.
- [ ] A cross-origin-isolated iframe variant is separate from the default and tests
      parent header cooperation, exact iframe/Permissions Policy delegation, frame
      COEP/resource opt-in, and the runtime `crossOriginIsolated` assertion.

### Theme and UI integrity

- [ ] Theme input uses a tiny exact schema and maps only to predeclared classes.
- [ ] Arbitrary CSS, markup, URLs, fonts, assets, classes, and style properties fail.
- [ ] Color combinations meet contrast requirements and cannot hide security UI.
- [ ] Invalid theme fuzzing produces no network request; v1 has no logo-mark field or
      theme-selected asset request.
- [ ] Theme, locale, layout, and unread updates are size/rate bounded.
- [ ] Security header, recipient review, confirmation wording, focus indicators, and
      top-level escape action are unthemeable.
- [ ] Tests cover clipping, transparent/zero-size containers, keyboard focus,
      zoom/transform guidance, mobile layouts, and screen readers.
- [ ] Product copy states that an allowlisted host can spoof or obstruct the embedded
      UI and that browser chrome is the reliable origin indicator.

### Adversarial browser tests

- [ ] Exact-origin tests cover scheme, port, trailing dot, uppercase host, punycode,
      sibling subdomain, public-suffix, localhost, IP, and malformed values.
- [ ] Unregistered, nested, redirected, cached-wrong-tenant, and sandbox-relaxed
      embedding attempts fail.
- [ ] Sibling windows, old frames, navigated sources, replayed nonces, duplicate
      sequence numbers, and forged request IDs fail.
- [ ] Oversized, deeply nested, unknown-version, unknown-type, and high-rate bridge
      payloads close or safely reject the channel.
- [ ] A parent-origin XSS fixture cannot read frame DOM, cookies, IndexedDB, workers,
      keys, messages, attachments, or fulfillment details.
- [ ] CSP and Trusted Types fixtures block inline script, event handlers, DOM HTML
      sinks, remote CSS/fonts/scripts, blob workers, and unexpected connections.
- [ ] Top-level escape, authentication, cancellation, timeout, and popup-blocked paths
      work without copying secrets through the parent.
- [ ] In-app browsers/webviews without trustworthy origin chrome hand sensitive
      confirmations to the system browser or reviewed native client.

## Standards references

- [HTML cross-document messaging](https://html.spec.whatwg.org/multipage/web-messaging.html)
- [HTML iframe sandbox](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-sandbox)
- [Content Security Policy Level 3](https://www.w3.org/TR/CSP/)
- [Permissions Policy](https://www.w3.org/TR/permissions-policy/)
- [Trusted Types](https://www.w3.org/TR/trusted-types/)
- [Referrer Policy](https://www.w3.org/TR/referrer-policy/)
- [Secure Contexts](https://www.w3.org/TR/secure-contexts/)
- [Storage Access API](https://privacycg.github.io/storage-access/)
