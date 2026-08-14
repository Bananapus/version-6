# Host integration and theme contract

Status: implementation contract and local protocol lab for a future production
embed. It does **not** declare the current `/embed-preview` or
`/embed-preview/frame` production-ready. The stricter threat model, deployment
headers, and release requirements in
[embed-security.md](./embed-security.md) are normative and take precedence.

## Purpose and boundary

The embed lets a registered application such as Juicebox Money or Revnet Money
open the first-party messaging client in its own page. The host chooses bounded
display preferences and supplies a one-use opaque context capability. The frame
independently redeems that capability, authenticates the user, verifies current
eligibility, decrypts messages, and renders sensitive confirmations.

The host is an initiator, not a messaging endpoint. It must never receive
plaintext, shipping or fulfillment data, wallet addresses, project/order/purchase
identifiers, stable conversation identifiers, keys, attachments, cryptographic
errors, or message previews. WhatsApp, Telegram, and other future gateways are
messaging transports and trust domains of their own; they do not use this browser
bridge to relay content.

```text
registered host                 dedicated messaging origin
https://juicebox.money          https://app.juicebox.chat

host SDK ── opaque init ──────▶ isolated messaging frame
         ◀─ coarse UI state ───
                                     │
                                     ├─ same-origin messaging BFF
                                     └─ independent context redemption,
                                        authentication, eligibility, and crypto
```

Production must use a dedicated HTTPS messaging origin that is cross-origin from
every host. A sibling path on the host is not supported. The frame origin cannot
share host scripts, service workers, cookies, storage, analytics, or deployment
artifacts.

## Public route and tenant registration

The production document route is `/embed/{tenantPublicId}`. The tenant public ID
is lowercase public routing data selected at registration. It must not encode a
wallet, project, order, purchase, conversation, participant, invitation, or
one-use capability.

A tenant record contains, at minimum:

- a public tenant ID;
- one or more exact, canonical HTTPS parent origins;
- an approved, server-registered theme baseline;
- fixed top-level destinations for the allowed reason codes;
- lifecycle state, ownership proof, and allowlist audit metadata.

The server resolves the tenant before rendering. It emits a tenant-specific
`frame-ancestors` response header from that stored allowlist and injects the same
exact origins into the frame runtime configuration. It never derives authority
from `Origin`, `Referer`, `Host`, a URL parameter, or a `postMessage` value.
Development, preview, and production origin registrations are separate.

## Host iframe construction

The supported SDK owns iframe construction. Applications pass a registered tenant
ID and an opaque context handle to the SDK; they do not pass a frame origin or
arbitrary URL.

```html
<iframe
  src="https://app.juicebox.chat/embed/juicebox"
  title="Juicebox secure messaging"
  sandbox="allow-scripts allow-same-origin"
  allow=""
  referrerpolicy="no-referrer"
></iframe>
```

The SDK uses a compiled `MESSAGING_ORIGIN` constant, parses it to one canonical
HTTPS origin, and rejects it if it equals `window.location.origin`. It installs
the message listener before loading the frame. Every `postMessage` call names that
exact origin; `"*"` is forbidden, including initialization and error paths.

The default sandbox has no popups, top navigation, downloads, form navigation,
modals, capture, payment, camera, microphone, geolocation, or storage-access
delegation. Authentication or attachment variants require a separate review and
must not weaken the default iframe.

The parent CSP should name the messaging origin in `frame-src`. The frame response
must use the exact tenant origins in `frame-ancestors`, omit contradictory
`X-Frame-Options`, and remain `private, no-store`.

## Version 1 channel

Except for the single pre-channel readiness signal defined below, both directions
use the exact envelope in `src/embed/protocol.ts`. Unknown fields, types, versions,
enum values, and prototypes fail closed.

```ts
interface EmbedEnvelopeV1<TType extends string, TPayload> {
  protocol: "org.juicebox.messaging.embed";
  version: 1;
  type: TType;
  channelId: string;
  sequence: number;
  peerNonce?: string;
  requestId?: string;
  payload: TPayload;
}
```

`channelId` contains at least 128 random bits. Parent and frame nonces contain 256
random bits. All use base64url. Sequences start at zero independently in each
direction and the receiver accepts exactly the next integer. Request IDs, when
present, are bounded and unique among messages from that sender in that channel;
the two directions have independent request-ID namespaces. Version 1 rejects
transferred `MessagePort` objects and other transferables.

The readiness signal is the only V1 pre-channel exception. It has exactly four
fields and is not an operational event:

```ts
interface FrameBootstrapReadyV1 {
  protocol: "org.juicebox.messaging.embed";
  version: 1;
  type: "frame.bootstrap_ready";
  bootstrapNonce: string; // 256 random bits, base64url
}
```

The host accepts it only through a gate installed for the current
`iframe.contentWindow` and exact compiled messaging origin. The gate rejects
ports, unknown fields, invalid prototypes, malformed or oversized values, and
more than the bounded trusted-attempt rate; it accepts exactly once before the
same ten-second handshake deadline. It never dispatches the signal to product
code, redeems context, or treats it as authority.

### Handshake

1. The host installs its listener and one-shot readiness gate, then constructs the
   iframe from the fixed messaging URL. It does not send on a timer or retry.
2. After installing its host-message listener, the frame creates a fresh 256-bit
   bootstrap nonce and sends `frame.bootstrap_ready` once to the exact parent
   origin.
3. The host validates the readiness source, exact origin, shape, size, ports,
   rate, one-shot state, and deadline. Only then does it create a fresh channel
   ID, parent nonce, and request ID and consume a still-valid one-use opaque
   context handle issued by the messaging authority. A replacement channel needs
   a newly issued handle.
4. The host sends `host.init` at sequence 0. Its payload echoes the exact
   bootstrap nonce. `peerNonce` is absent, not `null` or `undefined`.
5. The frame checks source, server-configured exact origin, size, rate, envelope,
   one-shot state, and the bootstrap-nonce echo. It pins the host channel and
   parent nonce, generates its nonce, and sends `frame.ready` at sequence 0 with
   the parent nonce in `peerNonce`.
6. The host validates the same controls, pins the frame nonce, and begins host
   operations at sequence 1. Every later host message echoes the frame nonce;
   every later frame message echoes the parent nonce.
7. The entire bootstrap and initialization handshake expires after ten seconds. A
   timeout, navigation, iframe
   reload, origin change, sequence gap, duplicate ready, repeated init, or terminal
   error destroys the channel and its iframe document. Recovery reconstructs only
   the fixed embed URL in a new iframe generation. Restarting creates every
   identifier again and never reuses the context handle; it never retries or delays
   the old initialization.

The frame intentionally learns the host-generated channel ID from `host.init`.
It is not placed in the iframe URL, query, fragment, storage, or referrer.

### Allowed messages

| Direction | Type | Bounded payload |
| --- | --- | --- |
| Frame → host, pre-channel | `frame.bootstrap_ready` | bootstrap nonce only; exact one-shot exception described above |
| Host → frame | `host.init` | bootstrap-nonce echo, parent nonce, opaque context handle, `en` locale, semantic theme |
| Host → frame | `host.set_theme` | semantic theme only |
| Host → frame | `host.set_locale` | supported locale only |
| Host → frame | `host.destroy` | empty |
| Frame → host | `frame.ready` | frame nonce, accepted version, exact capabilities |
| Frame → host | `frame.layout` | `compact`, `regular`, or `expanded` |
| Frame → host | `frame.unread` | one coarse boolean, never a count or preview |
| Frame → host | `frame.auth_required` | fixed reason code |
| Frame → host | `frame.open_top_level` | fixed reason code, never a URL |
| Frame → host | `frame.closed` | empty |
| Frame → host | `frame.error` | established-only `context-invalid`/`channel-invalid` (terminal) or `temporarily-unavailable` (fresh restart allowed) |

The host maps a top-level reason to a fixed, reviewed messaging-origin destination
and keeps a real fixed-origin anchor adjacent to the iframe at all times. It never
navigates to frame-provided text. Pre-channel origin/version failures do not cross
as `frame.error`; context lookup states collapse to `context-invalid`. The protocol
exposes neither error messages nor stack traces.

Size is checked before schema parsing over the complete received structured value,
including property names and string escaping. `frame.bootstrap_ready` is at most
2 KiB; `host.init` and `frame.ready` are at most 8 KiB; every established message
at sequence 1 or later is at most 2 KiB. The 8 KiB ceiling still applies to every
channel message. Cycles, non-plain prototypes, decorated arrays, excessive
depth, and excessive container entries fail the same bounded-structure gate rather
than bypassing the byte limit.

Version 1 is exact-match, not a negotiation range. The bootstrap and every
envelope carry the exact protocol string and `version: 1`; a theme independently
carries `version: 1`; and `frame.ready` must return `acceptedVersion: 1` plus the
exact V1 capability list. An older, newer, missing, or otherwise mismatched value
is malformed input: there is no downgrade, feature probing, or best-effort parse.
Pre-channel mismatches produce no bridge error. After establishment, a mismatch is
terminal channel-invalid input and the channel is destroyed.

Each direction starts with a budget of 20 trusted attempts per ten seconds and a
finite 256-message channel lifetime. Implementations also bound object depth,
container entries, outstanding requests, and handshake timers. The pre-channel
readiness gate uses the 2 KiB and trusted-attempt bounds independently and closes
after its single accepted signal.

## Opaque context issuance and redemption

The host backend requests a short-lived, single-use context handle from the
messaging authority over an authenticated server channel. The authority binds it
to:

- the registered tenant and exact parent origin;
- the intended internal resource and action;
- an audience restricted to the messaging frame;
- issued-at, not-before, expiry, and one-use redemption state.

The browser host sees only the opaque random handle. It sends it once in
`host.init` and must not persist, inspect, log, retry, place in analytics, or place
it in a URL. The frame redeems it directly with its same-origin BFF only after the
parent checks pass. The redemption service compares the pinned parent origin and
tenant again. Redemption yields a hint about what the user intended to open; it
does not prove wallet control, purchase finality, current token ownership, staff
role, or chat eligibility. Those checks remain independent and current.
Failed and expired redemption are both reported as the generic
`frame.error/context-invalid` outcome so the bridge cannot probe handle state.

The local lab deliberately discards a random handle. It has no authority service
and proves no access.

## Theme input

Version 1 accepts semantic appearance only:

```ts
{
  version: 1,
  preset: "neutral" | "juicebox" | "revnet",
  colors?: {
    canvas?: "#rrggbb",
    action?: "#rrggbb",
    actionFill?: "#rrggbb"
    // only the documented semantic color keys
  },
  cornerStyle?: "rounded" | "soft" | "square",
  density?: "comfortable" | "compact",
  typography?: "system-sans" | "system-mono"
}
```

The V1 semantic color vocabulary is exact. Each key has one role; integrators must
not substitute a foreground, fill, surface, border, or focus token for another.

<!-- BEGIN:THEME_COLOR_KEYS -->
| Key | Meaning |
| --- | --- |
| `canvas` | Outermost application and page background. |
| `surface` | Primary panel, card, dialog, and control background. |
| `surfaceSubtle` | Recessed or secondary neutral background. |
| `surfaceAccent` | Low-emphasis informational or brand-accent background. |
| `surfaceSuccess` | Surface reserved for positive or completed state emphasis. |
| `text` | Primary headings and body-copy foreground. |
| `textSoft` | Secondary supporting-copy foreground. |
| `textMuted` | Tertiary metadata, hints, and placeholder foreground. |
| `border` | Default divider and control boundary. |
| `borderStrong` | Emphasized panel or control boundary. |
| `action` | Resting interactive text, link, and action-outline foreground. |
| `actionHover` | Hovered or active interactive foreground. |
| `actionFill` | Resting filled primary-action background. |
| `actionFillHover` | Hovered filled primary-action background. |
| `actionSoft` | Low-emphasis action or selection background. |
| `onAction` | Text and icon foreground drawn on either action fill. |
| `success` | Positive-status foreground. |
| `successSoft` | Low-emphasis positive-status background. |
| `warning` | Warning or caution foreground. |
| `warningSoft` | Low-emphasis warning or caution background. |
| `danger` | Error or destructive-action foreground and boundary. |
| `dangerSoft` | Low-emphasis error or destructive-action background. |
| `focus` | Keyboard focus outline and ring color. |
<!-- END:THEME_COLOR_KEYS -->

After preset resolution and overrides, `resolveTheme` enforces these complete V1
contrast relationships:

- each of `text`, `textSoft`, `textMuted`, `action`, and `actionHover` is at least
  4.5:1 against each of `canvas`, `surface`, `surfaceSubtle`, `surfaceAccent`,
  `surfaceSuccess`, and `actionSoft`;
- `actionFill` is at least 1.5:1 against `surface`, while `onAction` is at least
  4.5:1 against both `actionFill` and `actionFillHover`;
- `success` is at least 4.5:1 against both `successSoft` and `surfaceSuccess`,
  `warning` is at least 4.5:1 against `warningSoft`, and `danger` is at least
  4.5:1 against `dangerSoft`; and
- `focus` is at least 3:1 against each of `canvas`, `surface`, `surfaceSubtle`,
  `surfaceAccent`, `surfaceSuccess`, and `actionSoft`.

These pairings are resolver requirements, not permission to use a token outside
its semantic role. Derived translucent colors, browser states, and the unthemeable
security UI remain covered by visual and accessibility release tests.

The built-in neutral, Juicebox, and Revnet presets are compiled CSS Module classes.
They need no inline declarations. Remote fonts, logos, images, metadata URIs, CSS,
selectors, class names, HTML, URLs, gradients, lengths, and arbitrary strings do
not cross the bridge.

Custom six-digit colors use the following production-compatible path:

1. Parse the exact theme schema and reject unknown keys.
2. Resolve it against its preset with `resolveTheme`, including required contrast
   checks and fixed corner, density, and typography enums.
3. Convert only the internal allowlisted semantic properties to variables.
4. Emit one rule for the compiled, fixed
   `[data-embed-custom-theme="v1"]` selector. The caller supplies neither selector
   nor property name.
5. Place that rule in a same-origin `<style>` owned by the frame and bearing the
   unpredictable per-response CSP nonce.

The production CSP keeps `style-src-attr 'none'`; a React `style` attribute is not
an allowed materialization mechanism. The stylesheet nonce is generated by the
server for each response and must appear in `style-src`. If a nonce is absent,
invalid, or rejected by CSP, custom theme activation fails closed. A deployment
may instead pre-register and compile a tenant theme server-side, but it may never
accept arbitrary CSS text.

All resolved custom properties, the nonce-bearing style element, and the selected
preset are channel-scoped. Close, destroy, timeout, origin drift, malformed trusted
input, navigation, and component teardown clear them before terminal UI renders. A
new frame starts from its reviewed baseline and receives theme input only through
its fresh initialization.

The security bar, origin/recovery guidance, confirmation ceremonies, and
top-level escape affordance use unthemeable compiled colors and remain visible
under every tenant theme. Contrast tests are release gates, not optional host
guidance.

## Required response policy

The exact policy is assembled per request and per tenant. At minimum, production
must enforce the requirements in `embed-security.md`, including:

```text
default-src 'none'
script-src 'nonce-{fresh nonce}' 'strict-dynamic'
script-src-attr 'none'
style-src 'self' 'nonce-{same fresh nonce}'
style-src-attr 'none'
frame-ancestors https://exact.registered.host
object-src 'none'
base-uri 'none'
form-action 'none'
```

The nonce is not a static build value. CDN caching must not reuse HTML, CSP, or a
nonce across responses or tenants. The reverse proxy must preserve the final
headers. The frame refuses an insecure context. Production must verify a
cross-origin deployment in real browsers; CSP headers and `postMessage` checks are
complementary controls, not substitutes.

## Local protocol lab

Run the application on port 3004 and open:

```text
http://localhost:3004/embed-preview
```

The harness loads its frame from `http://127.0.0.1:3004`; opening the harness on
`127.0.0.1` reverses the pair. This creates a real browser cross-origin boundary,
uses exact target origins, and exercises nonce/sequence validation plus the three
compiled presets. The host ledger renders accepted type names only.

The lab is intentionally unavailable from LAN IPs, public hosts, a direct
top-level frame, an insecure browser context, or a same-origin pairing. Loopback
HTTP is a browser-trusted development exception. It does not demonstrate HTTPS,
registrable-domain separation, cookies, storage partitioning, tenant CSP,
authority redemption, wallet authentication, entitlement, encryption, message
storage, fulfillment handling, or production operations.

## Integration and release checklist

Before a real Juicebox or Revnet project can use the embed:

- deploy the client and BFF on a dedicated, reviewed HTTPS origin;
- implement tenant registration, origin ownership proof, revocation, and audited
  exact-origin configuration;
- issue and atomically redeem audience-, tenant-, origin-, resource-, and
  expiry-bound one-use context handles;
- ship per-tenant `frame-ancestors`, strict nonce CSP, no-store HTML, cookie,
  CORS, Permissions Policy, and untrusted-media isolation;
- package the host state machine as a reviewed SDK with fixed origins and fixed
  top-level route mappings;
- connect frame-side wallet authentication and current entitlement verification;
- complete the E2EE key lifecycle, device enrollment/revocation, encrypted local
  storage, recovery, moderation, and fulfillment-PII controls;
- test malicious parents, reload/replay/rate cases, browser storage modes,
  accessibility, mobile sizing, and compromised-host residual UI risks;
- pass the production launch gates and an independent security review.

Until every item is complete, integrations must retain explicit
“preview / not production” copy and must not represent the frame as authorized,
encrypted, purchase-final, or safe for real shipping details.
