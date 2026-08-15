# Production launch gates

Status: normative go/no-go criteria, version 0.1, 2026-08-14.

No real customer, wallet-linked community, mainnet entitlement, shipping address, or production E2EE claim may be enabled until every applicable hard gate below passes with retained evidence. Phase 0 validates an architecture with fictional/testnet data; it is not a production launch.

Gate evidence MUST cite the relevant [security invariant](./security-invariants.md), exact source revision, dependency lockfile/SBOM, build artifact digest, test environment, dataset/seed, result, owner, reviewer, and date. “Works on my machine,” an unaudited demo, or a provider marketing claim is not evidence.

## 1. Decision authority and failure policy

The launch decision requires recorded approval from:

- Engineering owner.
- Security owner independent from the implementation author.
- Privacy/legal owner for every launch jurisdiction.
- Abuse/safety operations owner.
- Product owner for the unresolved choices in section 9.
- Operations/on-call owner.

Any open Critical or High security issue is a no-go. A Medium issue requires a named owner, deadline, concrete containment, retest plan, and written acceptance by Security and Product. No risk acceptance may waive a cryptographic boundary, content-blindness invariant, removal/freshness invariant, rollback protection, or truthful product claim.

A failed hard gate returns the release to the implementing phase. The result MUST NOT be reclassified as “expected” without changing the normative specification, threat model, user claim, and test together through security review.

## 2. Release phases

The detailed promotion ladder and chain order are defined in `verification.md` as G0 through G8/GX. The product phases below are a readable grouping and do not replace or skip any verification gate.

| Product phase | Verification gates | Allowed data and users | Required outcome |
|---|---|---|---|
| Phase 0: architecture bake-off | G0–G2 | Fictitious accounts/content on approved private devnets, or non-identifying fixtures on a provider's public network when the candidate has no isolated network | Select crypto/transport, prove state and trust boundaries, produce audit-ready implementation |
| Phase 1: closed dogfood | G3–G4 | Allowlisted staff/test accounts and testnets; no real shipping data or customer secrets | Exercise first-party text, device lifecycle, removal, telemetry, and incident response |
| Phase 2: shadow/canary | G5–G6 | Mainnet decisions shadowed, then explicitly allowlisted Base users after G6 | Validate operations and UX under staffed, reversible, conservative rollout |
| Per-chain production text | G7 | Real native E2EE text and approved condition gates, one approved chain at a time | All core and chain-specific production gates passed |
| General availability | G8 | Public enrollment on approved platforms/chains | G8 promotion evidence complete |
| Production sensitive fulfillment | G6 or later plus feature gates | Real addresses/tracking and project staff workflows | Core plus sensitive-roster, atomic fulfillment, privacy/legal, and operational gates passed |
| Optional feature/connector release | Applicable G gate or GX | Attachments, archives, announcements, community rooms, iframe, SDK, or relay | The corresponding feature gate passed independently |

There is no automatic graduation by time or user count.

## 3. Phase 0 architecture bake-off

### 3.1 Candidates and default decision

Implement the same provider-neutral domain API and first-party test client on:

- **Candidate A:** owned HTTPS Delivery Service plus pinned OpenMLS client core.
- **Candidate B:** XMTP using its production network and target-platform SDKs.
- **Baseline C:** Matrix documented as a paper/short integration baseline unless federation becomes required.
- **Security reference:** Signal PQXDH/Double Ratchet/Sesame behavior for 1:1 recovery and ratcheting; it is not initially a third full service implementation.

Candidate A is selected unless Candidate B passes every common and provider-specific hard gate without weakening [architecture.md](./architecture.md). The owned option means owning the Delivery and authorization services while using unmodified audited MLS. It does not authorize a private fork or home-grown cryptography.

### 3.2 Frozen profile gate

Before performance comparison, an architecture decision record MUST freeze:

- RFC 9420 ciphersuite `0x0001` (`MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`), exact library and crypto-provider versions, 32-byte confirmed-transcript API/storage representation, credential type, wire-format policy, required capabilities, allowed extensions, and disabled features.
- Canonical application encoding, domain-separated hashes, event schemas, unsigned-64 wire encoding with the explicit `2^63-1` version 1 service/storage ceiling, maximum sizes, unknown-field behavior, and content-type registry.
- Identifier registry: UUIDv4 domain objects and client-generated case/event/envelope IDs, UUIDv7 operational records with disclosed timestamp leakage, and 256-bit bearer capabilities; generator ownership and collision/replay behavior are fixed per field.
- KeyPackage lifetime, single-use reservation/consumption, replenishment and depletion behavior.
- Version 1 last-resort KeyPackages disabled in client/server capabilities and negative tests.
- A 10,000-race KeyPackage take returns bytes to exactly one authorized plan and makes the package permanently unavailable. Plan expiry/cancel/abort, ambiguous response, restore, and concurrent retry never return it to inventory.
- Update cadence, previous-epoch/out-of-order window, stale-device threshold, and key deletion contract.
- Public external Add/Remove proposal authorization; external PSK, ReInit, GroupContextExtensions, external Commit, and unsupported proposal types MUST be disabled.
- Group/account/leaf limits and announcement topology.
- Commit compare-and-swap on conversation generation, base epoch, base roster version, ETag, membership intent, and base confirmed-transcript checkpoint; client transcript validation; invalid-commit quarantine; idempotency; cursor; and recovery rules.
- Signed entitlement-policy-head schema, freshness bound, independent distribution, monotonic sequence, and signer rotation.
- External-signer lifecycle: at-most-90-day credentials; current plus staged-next provisioning; next published/witnessed at least 30 days before signer activation; staged-next having at least 30 days remaining at group activation; at-most-14-day credential-validity overlap with exactly one log-authorized signer; monotonic signer generations; fresh-generation migration; five-minute emergency freeze; and non-rollback ledger.
- Key Transparency log, witness, checkpoint persistence, and gossip design.
- Local transaction/journal contract and the explicit one-writer design: shared worker/fencing versus one installation per tab.
- Device/account recovery mode, history-archive feature state, and prohibition on restoring live MLS state.
- Chain-specific finality and pause parameters used by every authorization adapter in the bake-off.
- Metadata inventory, logging allowlist, padding choice, retention schedule, and security claims.

Any candidate unable to express the frozen profile fails rather than silently adapting the profile to provider defaults.

### 3.3 Cryptographic implementation gate

Pass criteria:

- 100% of applicable RFC 9420 official test vectors pass.
- Cross-implementation interop passes for group create, KeyPackage, Welcome, application send, Add, Remove, Update, proposal-by-reference, Commit, out-of-order application messages, stale epoch, exporter use required by the profile, and malformed input.
- Exact dependency hashes, compiler, features, crypto provider, and generated bindings are in the SBOM. Debug/content/crypto-test features are absent from release artifacts.
- No open known Critical or High advisory or audit finding in the selected MLS library, crypto provider, serialization/storage layer, bindings, or direct dependencies.
- All untrusted binary decoders and wrapper boundaries complete at least 24 continuous hours of sanitizer/fuzz execution with zero memory-safety fault, panic crossing FFI, secret-bearing diagnostic, or unbounded allocation.
- No custom primitive, ciphersuite, random generator, key derivation, signature format, AEAD mode, or nonce construction exists outside the reviewed dependency/profile.
- A written storage review confirms how the library's mutations and required secret deletion participate in one application transaction. If the library storage API cannot provide this, a tested transactional journal/overlay is required or the candidate fails.

### 3.4 Deterministic state and crash gate

A deterministic simulator MUST run at least 10,000 unique seeds in Phase 0. It injects drop, duplicate, reorder, delay, ambiguous acknowledgement, concurrent Commit, disk-full/quota, clock rollback, process termination, worker replacement, database rollback, and restore at every persistence/network boundary.

Required result for every seed:

- Clients converge to the one canonical valid branch or enter a visible quarantine/recovery state.
- Zero nonce, generation, credential key, KeyPackage, or event/envelope ID reuse.
- Zero acknowledged envelope loss.
- Zero duplicate domain application of one authorized event.
- Zero application send from a losing or pending Commit branch.
- Zero silent rollback, silent conversation reset, or plaintext fallback.
- An ambiguous submission is reconciled by immutable envelope/commit hash lookup and exact-byte retry.

Concurrency subtest:

- Four tabs/workers on one browser installation each attempt 100 simultaneous application sends and updates.
- Three Delivery Service replicas receive 100 concurrent Commit attempts for the same conversation generation, base epoch, roster version, ETag, intent, and base confirmed-transcript checkpoint.
- Exactly one fenced client writer and one canonical valid successor epoch result.
- All successful logical sends appear exactly once; every conflicting idempotency reuse is rejected.

Production raises the deterministic run to at least 100,000 seeds per supported storage engine and release candidate.

### 3.5 Delivery Service sequencing gate

The candidate MUST demonstrate:

- Per-conversation contiguous monotonic sequences, bounded pagination, immutable exact envelope bytes, and no global cursor leakage between conversations.
- Event sync returns every sequenced external proposal, MLS Commit, and application envelope in the same gap-free/hash-chained order; Welcome retrieval remains installation-targeted and separate.
- Linearizable compare-and-swap on conversation generation, base epoch, base roster version, ETag, intent ID, and base confirmed-transcript checkpoint. Clients remain authoritative for full MLS transcript/tree validation.
- Atomic Commit plus Welcome acceptance and retrieval.
- Exact retry returns the original sequence/receipt; different bytes under the same ID fail.
- Database/API evidence proves a one-to-one foreign-key-backed mapping from every mandatory proposal ID/hash to its canonical external-proposal envelope/position and from every committed intent to its canonical Commit envelope.
- Future-epoch and missing-proposal buffering is bounded; proposal/KeyPackage exhaustion cannot produce unbounded memory or storage.
- Cursor gaps, rollback, duplicate generation, conflicting receipts, and split transcript heads produce a visible security failure.
- Boundary tests at `2^63-2`, `2^63-1`, `2^63`, and `2^64-1` prove exact encoding, pre-cap fresh-generation migration, terminal suspension at the cap, and rejection without wrap/coercion above it.
- Signed/hash-chained Delivery Service heads and receipts detect replay and are persisted. A split-view test presents two signed heads to independent clients/witnesses and raises an alert when views meet; no claim is made that this prevents permanent censorship.
- Leaf-hash vectors cover all envelope classes and both tagged sender variants. Class, sender tag/IDs/fingerprint/generation, content type, or envelope-hash substitution changes the leaf; null/empty encodings cannot collide across variants.
- A malformed/unsupported application event advances the transport cursor after quarantine, while an invalid MLS handshake cannot advance cryptographic state.
- HTTPS, exact-origin/host validation, device-bound authentication, CSRF protection where applicable, `no-store`, bounded bodies, schema allowlists, non-enumerating errors, quotas, and rate limits have positive and negative tests.

### 3.6 External Add/Remove and eligibility gate

The external entitlement signer MUST have no MLS leaf or group secret. Its proposal key and the policy-head signing key are distinct scoped credentials. Automated inventory and integration tests MUST confirm neither can decrypt application messages or create a valid member Commit, the proposal key cannot sign an accepted policy head, and the policy-head key cannot create an accepted MLS external proposal.

Test matrix MUST include:

- Valid finalized Add for a new account installation.
- Valid lazy Add for an additional device.
- Valid Remove after token transfer, staff revocation, account/device revocation, refund policy, and block/opt-out policy.
- Wrong group, target leaf, KeyPackage, account, device, policy revision, chain, block hash, finality, nonce, expiry, signer, signature, and proposal type.
- Replay, superseded revision, Add/Remove race, signer rotation overlap, proposal queue exhaustion, simultaneous valid committers, and a committer that omits the mandatory proposal.
- Scheduled signer rollover migrates affected groups to fresh generations within 24 hours at p95 and seven days at p99; any predecessor reaching 30 days before its last authorized signer expiry is suspended.
- Successor provisioning/ready artifacts coexist only as non-routable migration staging while the predecessor remains the sole live conversation. Atomic cutover creates/activates the successor, closes the predecessor, and swaps the scope pointer; kill and race tests produce neither zero nor two traffic-accepting generations.
- Emergency signer revocation appears in witnessed policy heads and freezes every affected group within five minutes. Restore/failover cannot reauthorize the old signer, reactivate the predecessor, or transplant its live MLS state.
- Unsupported external PSK, ReInit, GroupContextExtensions, external Commit/join, and unknown proposal types.
- Delivery Service suppresses the proposal but the independent policy head advances.
- Independent policy endpoint is stale/unavailable while Delivery Service appears healthy.
- No member is online to Commit a removal.

Hard outcomes:

- Every compliant sender refuses application sealing when the independently signed policy head is stale, unavailable, inconsistent, or contains an uncommitted mandatory removal.
- An unchanged group refreshes policy heads for one hour: every at-most-five-minute head has a new ID, increasing sequence and linked previous hash, and rollback/duplicate/same-state uniqueness bugs all fail closed.
- Delivery Service freeze is also active, but its suppression cannot extend a compliant sender's old-epoch send window.
- A valid Add produces a Welcome only with its canonical Commit and receives no pre-Add history.
- After a validated Remove Commit, the removed installation fails to decrypt 10,000 generated post-removal application messages across 100 randomized runs.
- Old-epoch content remains decryptable where expected and the UI never claims retroactive erasure.
- With no eligible committer, the group remains visibly frozen; no service key performs an emergency Commit.
- Unauthorized but syntactically valid commits are rejected/quarantined by clients and never reduced as membership truth.

### 3.7 Identity and Key Transparency gate

Required tests:

- SIWE wrong domain, URI, chain, action, key fingerprint, account, nonce, issue/expiry, replay, and phishing-parent origin all fail.
- EOA, ERC-1271 signer/owner rotation, ERC-6492 undeployed/deployed, wrong-chain, and changed-state cases match the frozen verifier profile.
- Passkey RP ID and challenge binding are exact; synchronized passkeys do not merge installations.
- Device add requires configured existing-device/recovery approval, creates one new installation, enters Key Transparency, and produces visible notices.
- Forged credential, stale signed tree head, invalid inclusion/consistency proof, rollback, split view, unknown witness, issuer rotation, and account recovery are detected before sensitive sealing.
- At least one independently operated witness/monitor observes signed heads and alerts within five minutes of a presented split view.
- Project role grant/revocation, Safe/DAO authority, scoped delegation, expiry, and loss of read rights produce the required session invalidation and MLS membership intent.

### 3.8 Multi-device and recovery gate

Use two accounts with six total devices, then test the configured maximum. Include a device offline for 30 days, a stolen/revoked device, complete old-device loss, reinstall, generic OS/browser backup restore, and concurrent lazy admission.

Pass criteria:

- Every installation has an independent leaf and state.
- Conversation inventory sync does not copy live group state.
- Lazy Add occurs on open/next activity/background sweep and is visibly pending until committed.
- No new/recovered device decrypts a pre-Add message without an explicit archive.
- A restored live database is detected and cannot send or reuse a generation; it rejoins as a new device.
- Revocation cancels session/push/mailbox access within 60 seconds and creates independently visible Remove intents for all affected active groups.
- Active groups complete cryptographic removal within five minutes at p95; groups without a committer remain frozen and are not counted as securely removed.
- Optional archive tamper, wrong key, rollback, splice, duplicate, and live-state injection are rejected.
- Archive import is read-only, labelled, deduplicated by authenticated event ID, and contains no MLS leaf key, live state, pending Commit, replay counter, or usable KeyPackage.
- Loss of all devices and recovery material has the documented unrecoverable result in strict mode.

### 3.9 Private announcement gate

The reference sender environment is recorded and no stronger than an 8-core/16-GiB desktop with a 20-Mbit/s uplink and 50-ms Delivery Service round trip. Run at least 20 campaigns each at 1,000 and 10,000 recipients, including crash/restart, block during queueing, partial network outage, simultaneous campaigns, and retry.

Pass criteria:

- One encrypted body plus one independently MLS-protected key/descriptor envelope per consented recipient account through exactly one policy-compatible relationship domain; no audience MLS group is created.
- A recipient with two or more concurrently active relationship domains receives one logical campaign event through the deterministic snapshotted domain, and a different reader/history/retention policy cannot be substituted after snapshotting.
- Recipient A cannot enumerate recipient B, request reply-all, or obtain another relationship identifier.
- The service-side key inventory and memory/telemetry captures contain no campaign key or plaintext.
- Canonical audience recomputation yields zero false-positive recipients across transfer, refund, reorg, dust/airdrop, linked-wallet, block, and consent fixtures.
- Every eligible consenting recipient receives at most one logical campaign event; every ineligible, blocked, unsubscribed, or unregistered address receives zero.
- All 1,000-recipient campaigns finish wrapping/submission within 60 seconds; 10,000-recipient campaigns within 10 minutes. A failed run resumes without re-encrypting accepted envelopes.
- Kill the sender at every body/key/outbox/target boundary. Each restart uses the identical campaign key, body bytes, and accepted target envelopes; deleting local campaign state yields visible `partially_failed` with no server recovery, key regeneration, or duplicate logical send.
- Peak sender memory stays below 1 GiB and work is chunked so no 10,000-recipient roster or key set must remain resident after its batch commits.
- The Delivery Service's observation of fanout is documented; no metadata-privacy claim is made.

### 3.10 Browser and native-core gate

Supported browser policy is the current and previous two major releases of Chrome, Edge, Firefox, and Safari desktop, plus current and previous Safari/iOS and Chrome/Android, unless Product records a narrower matrix before implementation.

Pass criteria:

- The same known-answer/interoperability/state database suite passes through Rust native, Swift binding, Kotlin binding, and WASM/browser wrappers selected for launch.
- Latest supported browsers pass multi-tab, worker kill/update, reload, offline, storage pressure/clear, logout, device revoke, database migration, and PWA update tests over HTTPS.
- Enforced CSP contains no `unsafe-inline` or `unsafe-eval`; Trusted Types is enforced where supported; `object-src 'none'`, `base-uri 'none'`, restrictive `connect-src`, `worker-src`, `form-action`, HSTS, `no-referrer`, `nosniff`, Permissions Policy, and authenticated `no-store` are verified from production responses.
- No tag manager, advertising, session replay, third-party active script/font/media, remote project image, or automatic server/client link-preview fetch occurs from the crypto origin.
- Malicious-parent tests cover overlay/clickjacking, forged `postMessage`, wrong `origin`/`source`, wildcard target, navigation, wallet-flow substitution, storage partitioning, and attempt to obtain plaintext/keys/roster. The top-level PWA remains available.
- Recipient review and final sensitive confirmation occur inside the messaging origin and cannot be asserted by the parent.
- Service worker/cache inspection and disk scan contain no seeded plaintext marker or authenticated response.
- Browser copy accurately states that WebCrypto/IndexedDB do not guarantee hardware backing or forensic deletion.

Cross-origin iframe release additionally requires replacing the current `X-Frame-Options: SAMEORIGIN` posture with an exact CSP `frame-ancestors` allowlist and completing the malicious-parent review. A headless SDK is not part of this gate; it requires a separately approved host-as-endpoint threat model.

### 3.11 Content-blind canary gate

Seed unique high-entropy markers into message bodies, names, shipping fields, tracking values, order/item descriptions, filenames, MIME metadata, thumbnails, archive content, report content, and WhatsApp fixtures.

For the native plane, every marker MUST be absent byte-for-byte and in decoded/normalized variants from:

- Delivery, Identity, entitlement, transparency, push, and attachment databases and replicas.
- Server memory/core captures outside bounded ciphertext buffers.
- Logs, traces, metrics, profiles, analytics, crash reports, support tools, dead-letter queues, caches, URLs, referrers, object names, and infrastructure backups.
- Raw push payloads and provider consoles.
- Parent application DOM, storage, network capture, and `postMessage` traffic.

Only authorized endpoint memory/UI/storage, an intentionally encrypted archive, or explicitly selected report/relay plaintext may contain the corresponding marker. Report and relay stores use separate marker expectations and retention.

### 3.12 Attachment and push gate

These features remain disabled until all applicable tests pass:

- Empty, boundary-size, over-limit, corrupt, truncated, reordered, duplicated, omitted, and swapped chunk cases.
- Forced nonce/key-reuse detector, wrong manifest, wrong object, wrong conversation, digest mismatch, MIME spoof, active HTML/SVG, malformed image/PDF, decompression bomb, huge dimensions, path traversal, orphan, expired object, and quota exhaustion.
- Plaintext filename/metadata marker absent server-side; forwarding creates new key/ciphertext.
- No partial plaintext is released before tag and manifest authentication.
- Configured limits are enforced before allocation and again after decryption. The current API proposal is ten attachments of 25 MiB each per event; it remains provisional until the open attachment decision is ratified. Requests at 1.25 times every selected limit fail safely.
- Raw APNs/FCM/Web Push capture is generic and marker-free on every supported device; lost/duplicate/reordered/collapsed push does not change transcript correctness.
- Revoked or provider-invalid push subscriptions are deleted within 24 hours; session/device revocation stops new sends to the token within 60 seconds.
- Lock-screen preview is off by default and, when enabled, is rendered locally through the single-writer design.

### 3.13 Provider-specific XMTP gate

XMTP cannot be selected as the only production transport unless all common gates pass and written production evidence confirms:

- Mainnet compatibility and database migration for every selected browser/native SDK.
- The exact external Add/Remove, mandatory-next-Commit, client policy-validation, and independent entitlement-head flow is exposed or can be implemented without forking/protocol bypass.
- The configured 250-account community and device topology fit current group and inbox-installation limits with a tested lifecycle beyond cumulative identity-update/rotation constraints.
- The required 10,000-recipient announcement throughput fits documented write limits and fees without sharing a server-held campaign key.
- Complete ciphertext, identity, membership, consent, and history export plus a tested successor-group migration.
- Documented retention, outage behavior, Gateway/payer dependency, fee/spend controls, rate-limit exceptions, abuse response, data regions, network node/operator topology, SLA, incident notification, and exit terms.
- The network continues to function under the tested failure of the hosted Gateway/provider path claimed to be decentralized.

Any hard product limit or unavailable API that changes the security profile is a fail, not an item deferred to after selection.

## 4. Production core gates

### 4.1 Independent assurance

- An independent cryptographic integration audit covers the MLS profile, credentials, external proposals, client policy checks, transactional persistence, KeyPackages, commit/fork recovery, archive separation, attachments, WASM/native bindings, and removal semantics.
- An independent web/API penetration test covers authentication, SIWE/passkeys, ERC-1271/6492, authorization, origin/CSRF, CSP/XSS, iframe messaging, object storage, rate limits, enumeration, and operator access.
- A privacy/security design review verifies the actual data flow against every applicable normative production specification in this directory.
- All fixes are retested by the finder. Open Critical/High count is zero.
- At least 100,000 deterministic state/fault seeds, the full conformance suite, and the 24-hour fuzz suite pass on the exact release artifact.

### 4.2 Fulfillment integrity

Before real addresses or tracking:

- The production roster approval includes conversation generation, MLS group binding, epoch, roster version/digest, exact unique fingerprints/roles, Key Transparency checkpoint, and policy revision from the same locked state used to seal.
- A roster/epoch/policy/checkpoint change between review and seal causes 100% of 10,000 race tests to abort before encryption and require re-review.
- Post-decryption role tests cover every event kind and credential scope. A valid MLS member with the wrong role changes no domain state.
- Address IDs remain stable; versions increase exactly by one; updates invalidate old acknowledgements/preparation.
- `address-awaiting-ack`, `ready-to-fulfill`, `preparing`, and terminal `shipped` transitions match the normative state machine.
- Tracking and the `shipped` transition are one authenticated atomic production event/batch. Kill injection cannot expose tracking without shipment or shipment without its required tracking.
- Post-shipment correction cannot reopen fulfillment or create a second shipment in 10,000 generated transition sequences.

### 4.3 Scale and performance

Publish a reference hardware/network profile and hard limits. The values below are Phase 0 test targets, not accepted production policy; the open capacity decision in `decision-log.md` MUST ratify or replace them, and `service-api.md`, `storage-and-retention.md`, operations, clients, and tests MUST then use the same values:

- Ten active installations per account per project.
- A relationship roster cap selected from measured named-staff and account-device policy; no production value is accepted yet.
- 250 accounts and at most 2,500 device leaves in an integrated interactive-community fixture, consistent with the provisional ten-installation account ceiling, with Phase 0 also reporting results at 500 leaves. A separate 5,000-leaf protocol-only synthetic run may measure the MLS implementation outside the integrated account cap and MUST NOT be presented as an allowed product roster.
- 64 KiB maximum MLS application wire message before using attachments.
- Ten attachments of 25 MiB each per application event and 100 MiB newly finalized attachment ciphertext per conversation per UTC day.
- 10,000 recipients per announcement campaign.

Raise a limit only after rerunning every affected state, churn, storage, battery, privacy, and load gate.

At 1.25 times every hard cap and twice forecast steady traffic for a 72-hour soak:

- Zero unauthorized, lost acknowledged, duplicated logical, or cross-conversation envelopes.
- Zero divergent accepted epochs and zero unbounded queue/memory growth.
- Under normal SLO load, envelope append server time is p95 below 250 ms and p99 below 750 ms. At twice forecast peak, accepted-envelope server time is p95 at most 500 ms and p99 at most 2 seconds.
- Online recipient-visible text latency p95 is at most 2 seconds and p99 at most 10 seconds, excluding push-provider wake latency.
- Catch-up of 10,000 stored envelopes completes at p95 within 30 seconds on the slowest supported reference client without UI/OS watchdog termination.
- A 30-day/50,000-envelope offline recovery completes within 60 seconds or uses visible bounded incremental sync while remaining responsive; no full-history requirement may exhaust memory.
- The announcement thresholds in Phase 0 remain satisfied.

### 4.4 Availability and data durability

- Monthly envelope-append and mailbox/sync availability objective is at least 99.95%, measured over a rolling 28-day window from independent synthetic ciphertext clients. Identity, entitlement, and membership availability is at least 99.9%.
- RPO is zero for any acknowledged envelope bytes, canonical Commit, Welcome, idempotency record, and cursor receipt. Rebuildable analytics/cache metadata may use a separately documented RPO.
- Regional disaster RPO is at most five minutes for non-message metadata and RTO is at most 60 minutes.
- A two-zone loss and region failover drill preserves canonical order and does not roll back epochs, credentials, spent KeyPackages, revocations, retention tombstones, or idempotency records.
- Restore tests prove that expired/deleted plaintext-free metadata and attachment objects do not silently reappear beyond documented backup ageing.
- Push outage, object-store outage, entitlement outage, Key Transparency outage, canonical RPC disagreement, signer rotation, KeyPackage depletion, and Delivery Service partition have tested fail-closed/degraded UX.

### 4.5 Release and supply-chain assurance

- Reproducible client/server builds match the signed production artifact digest.
- SBOM, license, vulnerability, secret, and provenance checks pass on every release.
- Protected branches, two-person production approval, isolated release signing, least privilege, short-lived CI credentials, and staged/canary rollout are enforced.
- Emergency minimum-client-version, compromised web release, issuer/signing-key rotation, `Clear-Site-Data`, and rollback procedures are exercised without reactivating vulnerable clients silently.
- No active production dependency or subresource is fetched from an unreviewed third-party origin.

`corepack npm run check:release` supplies the repository dependency-tree, production-advisory, and
lockfile-bound SBOM preflight for this gate. Its success is not the gate result: evidence must still bind
the SBOM and audit output to the exact source and built artifact, and separately satisfy every license,
secret, provenance, reproducibility, signing/attestation, review, approval, and deployment requirement
above.

## 5. Abuse, privacy, legal, and support gates

### 5.1 Abuse and safety

Before inviting external users:

- Contact request, consent, block, mute, leave, unsubscribe, attachment restriction, and report work across all devices.
- Block/opt-out propagation stops new service routing and campaign queueing within 60 seconds; MLS removal follows its policy where read access also ends.
- Rate-limit tests cover account, wallet, device, project, recipient, audience, IP/risk, KeyPackage, proposal, attachment, report, and campaign dimensions, including distributed Sybil and cheap-token/dust attacks.
- Wallet/key-directory enumeration and bulk KeyPackage scraping return no usable address directory.
- Reports upload only explicitly selected decrypted evidence; the confirmation names what moderators will read. Moderator RBAC, access audit, retention, redaction, appeal, and conflict-of-interest rules are tested.
- Phishing links, wallet-signature requests, unexpected device additions, project authority change, address change, and bridge transition have distinct high-risk UI.
- A staffed urgent-safety and legally required reporting/escalation path has completed a tabletop using fictitious evidence. No hidden general decrypt capability exists.

### 5.2 Privacy and legal readiness

Required approved artifacts:

- Data inventory and diagrams for wallets, devices, projects, purchases, memberships, IP/access logs, push, attachments, archives, reports, analytics, and bridges.
- Controller/processor allocation with projects and host applications; subprocessors, regions, transfers, DPAs, access roles, and incident terms.
- Retention/deletion/backup schedule per data class with monitored jobs and restoration tests.
- Privacy impact assessment covering onchain correlation, communities, phones, push, broadcasts, recovery, Key Transparency, and user reports.
- Accurate user notices for content E2EE, metadata visibility, endpoint risk, history modes, device changes, removal limits, deletion/export, reports, business continuity, and WhatsApp.
- Separate lawful bases/consent for purchase support, community membership, transactional announcements, marketing, and WhatsApp.
- Launch-jurisdiction counsel review, minor/age decision, legal-request/emergency/reporting runbook, appeals, and records-preservation limits.
- Data-subject access/export fixture returns only the requester's data; deletion finishes within the approved period and a backup restore does not resurrect it outside the stated window.

The launch MUST NOT claim GDPR, LGPD, DSA, ECA Digital, US reporting, sectoral, or other compliance solely because content is E2EE.

### 5.3 Operations and incident response

Production on-call MUST have dashboards and alerts for:

- Cursor gaps/rollback, transcript-head forks, invalid/competing commits, and quarantine volume.
- Pending removals, policy-head freshness failures, entitlement contradictions, stale devices, and KeyPackage depletion.
- Identity/transparency split view, signer/issuer rotation expiry, unusual recovery/device churn, and role revocation backlog.
- Authentication/authorization anomalies, enumeration, report/proposal/campaign/storage abuse, and attachment quota failures.
- Push invalidation, object-store errors, sync latency, database durability, region health, retention-job failure, and backup age.
- Plaintext-canary or DLP detection anywhere outside approved endpoint/report/relay locations.
- Dependency/security advisory and anomalous client release provenance.

Tabletop exercises MUST cover compromised device, wallet, project staff, entitlement signer, Identity Service, Key Transparency witness, Delivery Service/database, object store, push credentials, web release, native release key, dependency zero-day, deep chain reorg, region outage, metadata breach, report-store breach, and WhatsApp gateway breach.

## 6. Optional feature gates

### 6.1 Interactive community

- Published roster visibility and member/leaf cap.
- Churn test at 1.25 times cap with 10% member turnover per hour for 24 hours.
- Offline-device and stale-member eviction behavior.
- Role/policy checks for send, invite, admin, removal, report, and export.
- No promise of hidden membership or one globally ordered room after sharding.

### 6.2 Recoverable history

- Product decision PD-001 approved and copy tested.
- Archive protocol receives independent review.
- Recovery-root loss, theft, guessing/rate limit, device transfer, tamper, rollback, partial archive, deletion, and organization handover tests pass.
- No archive key or plaintext appears server-side; no live MLS state is importable.

### 6.3 Cross-origin iframe

- Exact `frame-ancestors` allowlist and partner onboarding/revocation process.
- Malicious-parent tests from section 3.10.
- Wallet flow uses the messaging origin; secrets never cross `postMessage`.
- Storage partition and “open top-level” recovery UX passes every supported browser.

### 6.4 Headless SDK

- Separate threat model and user/partner contract declare the host a plaintext-capable endpoint.
- SDK cannot be marketed as equivalent to origin-isolated first-party E2EE.
- Partner release, XSS, analytics, telemetry, incident, retention, and subprocessor controls pass review.

### 6.5 WhatsApp relay

- Separate channel and persistent non-native-E2EE label.
- Tenant/business onboarding, WABA ownership, least-privilege credentials, webhook signature, idempotency, retry/order, template/window, opt-in/opt-out, and rate/quality controls tested against the then-current official API.
- Plaintext flow, Meta/business/connector/CRM/AI subprocessors, retention, log redaction, phone-account binding, unlink/recycle, legal roles, and breach response approved.
- Native history is not silently imported; WhatsApp is never inserted as a hidden MLS endpoint.
- A maximum-privacy notification/deep-link-only mode is available where product requires it.

## 7. Production go/no-go scorecard

The release record MUST contain this completed table or an equivalent machine-readable record:

| Area | Hard evidence | Result |
|---|---|---|
| Architecture/profile | Frozen ADR matches every applicable normative production spec | Go / No-go |
| Cryptography | Conformance, interop, pinned audited library, zero Critical/High | Go / No-go |
| Persistence/concurrency | 100,000 seeds, kill points, one writer, zero reuse/loss | Go / No-go |
| Membership/removal | Independent policy freshness and external Add/Remove matrix | Go / No-go |
| Identity/transparency | Wallet/passkey/smart-account matrix and split-view detection | Go / No-go |
| Delivery/durability | Linearizable sequencing, immutable retry, RPO/RTO drill | Go / No-go |
| Endpoint/browser | Platform matrix, CSP/Trusted Types, malicious host, release integrity | Go / No-go |
| Metadata/content blindness | Canary scan and approved data inventory | Go / No-go |
| Abuse/safety | Controls, rate limits, reports, on-call/tabletop | Go / No-go |
| Privacy/legal | Jurisdiction, DPIA, consent, retention, notices, runbooks | Go / No-go |
| Enabled optional features | Every corresponding feature gate | Go / No-go / Disabled |
| Product decisions | Every applicable section 9 decision recorded | Go / No-go |

One `No-go` means the release does not launch.

## 8. Post-launch gates

- Run conformance, deterministic fault, browser, canary, dependency, and migration suites for every release.
- Re-audit material changes to the MLS version/provider, storage transaction model, credential/policy schema, Key Transparency, external proposals, recovery/archive, attachment construction, browser trust boundary, transport provider, or bridge.
- Review all access roles, subprocessors, retention jobs, signer expiries, policy adapters, and incident contacts at least quarterly.
- Conduct an external penetration test and cryptographic integration review at least annually and after any material cryptographic change.
- Rerun capacity tests before reaching 70% of any published cap.
- Publish security advisories and minimum safe versions; monitor undecryptable rate, fork/quarantine events, and revocation lag without collecting plaintext.
- Suspend the affected feature when a hard invariant is violated. Do not silently downgrade to plaintext, old credentials, old policy, simulated transport, or WhatsApp.

## 9. Product decisions required before launch

Engineering cannot safely infer these choices. If Product does not decide by profile freeze, the secure default shown below applies and the feature remains limited accordingly.

| ID | Required product choice | Secure default if undecided |
|---|---|---|
| PD-001 | History default: strict no-cloud history, optional encrypted archive, or business continuity archive | Strict no-cloud history; existing-device transfer only |
| PD-002 | Is purchase support with a named person or the project organization; which staff may read; may a successor owner inherit history? | Small explicitly assigned named staff team; no owner/staff historical handover |
| PD-003 | Purchase eligibility: payer, beneficiary, signed checkout customer, gift recipient; support window; refund/dispute behavior | Only an explicitly verified order participant; ambiguous attribution requires review; refund does not grant new access |
| PD-004 | Holder/community semantics: current holder, finalized snapshot, historical holder; transfer, delegation, custody, loan, wrapper/bridge, and grace | Current finalized direct holder for future access only; no backlog; fail closed on ambiguity |
| PD-005 | Consent scopes for contact requests, transactional announcements, community announcements, marketing, and WhatsApp | Explicit opt-in per channel/class; purchase or token alone is not consent |
| PD-006 | Ciphertext, attachment, archive, report, eligibility, traffic-log, and backup retention; export/disappearing-message promises | No disappearing-message claim; minimum operational retention; no archive until schedule is approved |
| PD-007 | Supported launch platforms, browser versions, interactive room cap, device cap, and whether native clients are required for high-risk business users | First-party top-level PWA only; provisional caps in section 4.3; iframe/headless disabled |
| PD-008 | Geographic launch, minors/age policy, moderation scope, emergency/legal coverage, and regulated/merchant-record use | Jurisdictions without approved review, minors, and regulated/compliance use remain unsupported |
| PD-009 | Whether and when WhatsApp relay is offered, who operates it, and whether it carries content or only secure-chat notifications | Disabled; secure-chat link notification is preferred future mode |

Transport/library selection, key-transparency implementation, ciphersuite, transaction design, and operational topology are engineering/security decisions governed by the hard gates, not product choices.

## 10. Immediate no-go conditions

Regardless of schedule or beta label, do not launch if any of the following is true:

- The server, logs, push, object store, parent host, or analytics can recover a native message, address, tracking value, attachment key, archive root, or MLS secret.
- Wallet signatures are used as chat keys or reusable generic authentication.
- The Identity Service can add an unexplained device without transparent evidence and a client-visible change.
- A sender can seal while a newer independently signed removal intent is pending or policy freshness is unavailable.
- A removed leaf decrypts any post-removal test message after the canonical Commit.
- Crash, retry, restore, tab concurrency, or migration can reuse a generation, nonce, KeyPackage, or losing-branch state.
- A new device or holder automatically receives old MLS history.
- A 1,000/10,000-recipient announcement creates one visible MLS roster or requires a platform-held campaign key.
- Sensitive recipient approval can be supplied by the embedding parent or survives a changed roster/epoch/checkpoint.
- The product calls a normal WhatsApp Business relay continuously E2EE.
- Any user-facing claim denies the documented metadata, endpoint, recovery, roster, removal, or recipient-copy limitations.

Most importantly: no real shipping/address data may be used until transactional MLS persistence, one-writer browser behavior, independent entitlement freshness, exact roster sealing, atomic fulfillment, content-blind canaries, and independent audit all pass.
