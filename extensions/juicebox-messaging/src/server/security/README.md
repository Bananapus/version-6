# Web security configuration boundary

This directory controls browser response policy only. It does not make the
prototype encrypted, authenticated, entitled, durable, or production-ready.

During `next dev` and tests, an omitted mode becomes the closed `local-lab`.
Optimized builds and runtime require an explicit mode; a missing deployment
setting stops startup. In the lab, external framing is denied except for the one
exact `/embed-preview/frame` route, whose ancestors are the fixed
`http://localhost:$PORT` and `http://127.0.0.1:$PORT` loopback pair. The host
policy can frame only those exact loopback peers. HSTS is omitted so LAN HTTP
continues to work, and the development CSP permits the evaluation needed by the
Next development runtime. The optimized local preview frame receives a fresh
response nonce and uses nonce-only script and style sources so custom-theme
materialization is exercised under browser-enforced CSP. `PORT` defaults to
`3004` and malformed values fail configuration.

Portable optimized lab commands are explicit and refuse production origin or
integration settings:

```text
npm run typecheck:lab
npm run build:lab
npm run start:lab
```

The generic `npm run build`, `npm run typecheck`, and `npm start` commands do not
infer lab mode. Production automation must provide the complete configuration
below to both build and runtime.

A production build/deployment must set all three build-time variables:

```text
JUICEBOX_MESSAGING_WEB_SECURITY_MODE=production
JUICEBOX_MESSAGING_CANONICAL_ORIGIN=https://messages.example.com
JUICEBOX_MESSAGING_EMBED_INTEGRATIONS={"juicebox":{"frameAncestors":["https://juicebox.money"]},"revnet":{"frameAncestors":["https://revnet.money"]}}
```

The canonical origin and every frame ancestor must be an exact normalized HTTPS
origin on the default port with a DNS-shaped hostname. This is syntactic input
validation, not proof that DNS is public, owned, or safely routed; deployment
must verify ownership and resolution independently. Paths, credentials, query strings, fragments,
wildcards, localhost, IP addresses, and non-HTTPS values are rejected. Each
frame ancestor must also differ from the canonical messaging origin so an
integration cannot silently collapse the dedicated cross-origin boundary. Each
lowercase `tenantPublicId` becomes exactly `/embed/{tenantPublicId}` and is
public routing data; order, wallet, conversation, and one-use context
capabilities must never appear in the URL. Configured framing is granted only
to that exact path with no query string; unconfigured and queried embed paths
retain `frame-ancestors 'none'`. Because URL fragments never reach the server,
the production frame route must also reject a non-empty fragment before it
accepts initialization.

The production `/embed/{tenantPublicId}` application route is not implemented
yet. A configured path currently returns the class-based 404 page while still
receiving its route-specific response policy. This is an intentional, tested
launch gate; a header-only 404 is not evidence that an integration works.

Frame documents override the global `Cross-Origin-Resource-Policy: same-origin`
with `cross-origin`; the exact `frame-ancestors` directive remains the embedding
authority. They also use `form-action 'none'`, `frame-src 'none'`, and an
enforced `sandbox allow-scripts allow-same-origin`, plus an embed-specific
Permissions Policy which denies clipboard, WebAuthn, Storage
Access, Web Share, and every other listed capability. A reviewed top-level
escape owns wallet/passkey operations. Non-frame documents retain same-origin
resource policy, `X-Frame-Options: DENY` as legacy defense in depth, and the
narrower set of reviewed self capabilities. Embed responses intentionally omit
X-Frame-Options because it cannot express their exact cross-origin allowlist.

These variables are consumed by both `next.config.ts` and `src/proxy.ts`. They
must be present and identical at build and runtime. The deployment pipeline must
not promote one artifact between differing canonical origins or integration
allowlists.

In production, Proxy rejects a matched application request whose direct URL
origin is not the configured canonical origin with `421 Misdirected Request`. Behind a TLS
terminator it instead requires a single, exact `X-Forwarded-Host` plus
`X-Forwarded-Proto: https` pair matching that origin; missing, comma-joined, or
non-canonical forwarding values are rejected. It then generates a fresh
32-byte nonce, places the nonce and CSP in request headers for Next rendering,
and emits the same CSP on the response. The root layout waits for a request so
all pages render dynamically and Next can nonce its bootstrap. Production
scripts use the nonce plus `strict-dynamic`; inline scripts/styles without that
nonce are blocked. Trusted Types is restricted to Next's pinned `nextjs` and
`nextjs#bundler` policies plus the private
`juicebox-messaging#service-worker` policy. That policy returns only the exact
literal `/sw.js`; absolute, queried, fragmented, encoded, case-varied, padded,
and alternate-path inputs throw. Its policy object and `TrustedScriptURL` never
leave the registration module, and the CSP does not allow a default policy or
duplicate policy names. The static `next.config.ts` production CSP contains
`script-src 'none'` and therefore fails closed if Proxy coverage regresses.
Embed documents do not receive the service-worker policy name at all.

`style-src-attr 'none'` remains enforced with no `unsafe-inline` or
`unsafe-hashes`. Next 16.3.1's accessibility route announcer is the sole
reviewed framework exception in the resulting DOM: its one host and one shadow
child receive two fixed declaration strings through `element.style.cssText`.
Chromium does not apply `style-src-attr` to CSSOM property mutation, so adding
hashes would not constrain that path. Unit and optimized-browser tests pin the
Next version, source declarations, and exact resulting nodes; any framework
upgrade or vector change requires security review. Application and theme code
must continue to create zero raw style attributes. More generally, CSP is not
an intra-script sandbox: trusted nonce-authorized JavaScript can mutate CSSOM.

## Deliberately unresolved deployment gates

- Terminate TLS at a trusted reverse proxy that removes every client-supplied
  `Forwarded`/`X-Forwarded-*` header and writes one exact
  `X-Forwarded-Host`/`X-Forwarded-Proto` pair. The app's 421 check complements
  this boundary; it cannot make spoofed forwarding metadata trustworthy.
- Isolate the standalone backend on a private network or authenticate the proxy
  hop so clients cannot reach it directly and forge an otherwise valid
  forwarding pair. It must not be internet-reachable merely because the normal
  ingress rewrites headers correctly.
- Redirect port-80 traffic to the one canonical HTTPS origin at that trusted
  edge before it reaches the app. Host-scoped HSTS cannot protect a browser's
  first visit and the application intentionally does not redirect an
  untrusted authority.
- Reject non-canonical HTTPS authorities at the edge for the entire deployment,
  including public `/_next/static`, image, icon, manifest, and service-worker
  paths that intentionally bypass the dynamic nonce Proxy.
- Keep every HTML/RSC route inside Proxy coverage and the dynamic root layout.
  Verify nonce-bearing hydration and Trusted Types in the deployed browser—not
  only unit tests—after every Next upgrade.
- Implement the production tenant route before enabling any integration. Its
  release test must require a 200 response, nonce-bearing hydration, bounded
  custom-theme materialization, the authenticated `postMessage` handshake, a
  successful iframe under each exact allowed ancestor, and browser-enforced
  refusal under an unlisted ancestor. The local preview is not this test.
- Reject public embed requests with non-empty search or fragment data before
  context redemption, without breaking framework-owned internal RSC requests.
  The current header layer only makes queried paths non-embeddable. Configure
  the edge and application logs to omit or redact queries so accidental wallet,
  order, conversation, and one-use context data is not retained.
- Preserve/verify these headers at the CDN and reverse proxy. Keep hashed
  `/_next/static` assets on Next's immutable policy; never cache authenticated
  HTML, route-handler responses, the service worker, or ciphertext envelopes in
  a shared cache. The current service worker has an explicit no-import,
  no-network CSP; adding imports or fetch behavior requires a separate review.
- Decide HSTS `includeSubDomains`/preload only after proving control of every
  affected hostname. This app intentionally emits host-scoped two-year HSTS
  only.
- Re-evaluate Permissions Policy when audited wallet/passkey and attachment
  flows are implemented. The current minimum allows same-origin clipboard
  writes, WebAuthn, Storage Access, and Web Share, while denying sensors,
  capture, payment, USB/HID/serial, and other unused capabilities.
- Do not add COOP or COEP until wallet/OAuth popup callbacks and the selected
  crypto worker are tested. The default denies `cross-origin-isolated`; a
  threaded-worker variant requires explicit cooperation from every ancestor and
  resource, while the default uses the audited non-threaded build or top-level
  client. The current policy also omits `wasm-unsafe-eval`; select WebCrypto or
  a non-WASM implementation, or explicitly audit that directive for the chosen
  cryptographic artifact before enabling it.
- Keep service-worker lifecycle top-level-only. Embedded documents neither
  install nor unregister the origin-wide worker; the current worker has no fetch
  handler and must never cache messaging or fulfillment data.
- Keep realtime, RPC, push, and attachment access behind a same-origin BFF or
  explicitly review each additional endpoint before changing `connect-src`.
- If cookies are introduced, use host-only `__Host-` cookies plus exact Origin
  and CSRF validation. Sibling subdomains are still same-site even when they are
  cross-origin, so prefer a genuinely cross-site dedicated messaging origin
  when cookie separation is part of the trust boundary.
- Complete the browser/storage matrix before launch: current automated security
  evidence covers Chromium only. Firefox, WebKit, iOS/Android webviews, mobile
  browser privacy modes, third-party storage partitioning, sandbox behavior,
  passkey/wallet escapes, and older `strict-dynamic` behavior all remain gates.
- Exercise the class-based segment and global 500 fallbacks in a production
  browser through a deployment-owned failure-injection mechanism. The current
  gate covers the custom 404 without inventing a public throw route; build and
  type checks cover `error.tsx` and `global-error.tsx`, but do not prove their
  runtime failure paths.

Run `npm run test:e2e:production-security` after header, rendering, theme, or
Next upgrades. It builds with the explicit production boundary, fronts the
local server as the configured virtual HTTPS origin, and verifies root, shared,
projects, and the custom 404 hydrate in Chromium with one fresh nonce per
response, no missing script/style nonces, no `unsafe-inline`, and no CSP or
Trusted Types failures. It also asserts that a configured but unimplemented
production embed remains a 404 so the route cannot be mistaken for launch-ready.
