# Production security invariants

Status: normative production invariants, version 0.1, 2026-08-14.

Every production implementation, provider adapter, client platform, schema migration, and release MUST preserve these invariants. A test passing does not authorize weakening an invariant. If an invariant cannot be maintained, the affected operation MUST fail closed and surface a security error.

The IDs in this document are stable requirements identifiers. Tests, audit findings, risk acceptances, and launch evidence SHOULD cite them.

[Verification](./verification.md) also defines ten short release-blocking summary aliases (`INV-01` through `INV-10`). Those aliases group, but do not replace, the detailed IDs here. Verification evidence MUST map every applicable summary alias to the detailed invariant IDs and tests it covers.

## 1. Content and key boundaries

### INV-CONTENT-001 — Native plaintext is endpoint-only

Native message, shipping, tracking, attachment, draft, and archive plaintext MUST exist only on authorized client endpoints, except for an explicit user-selected abuse report or a separately named archive/bridge endpoint.

The Delivery Service, Identity Service, entitlement service, Key Transparency service, database, object store, CDN, push provider, ordinary support tooling, analytics, logs, traces, and crash reports MUST NOT receive it.

### INV-CONTENT-002 — Server services hold no native message keys

No server-side service may hold an MLS leaf private key, epoch secret, exporter secret, application content key, attachment file key, campaign content key, recovery root, or live client MLS state.

The entitlement service holds only scoped authorization signing keys: its MLS external-sender key signs proposals, while a separate policy-head key signs freshness heads. Neither is a message key. A tenant-operated business agent is a client endpoint, not a server exception, and MUST be displayed as such.

### INV-CONTENT-003 — Application messages are private MLS messages

Every native application event MUST use the MLS private wire format. Version 1 proposals and commits MUST use the configured public MLS handshake wire format so the Delivery Service can bind exact proposal references, Commit intent, and Welcome set without an epoch secret. The Delivery Service MUST reject plaintext application content types and MUST never decode application payloads.

### INV-CONTENT-004 — Cryptographic separation

Wallet keys, device-credential keys, MLS keys, attachment keys, campaign keys, archive roots, push wake keys, and server-at-rest keys MUST be independently generated or derived only by a reviewed domain-separated standard construction. A wallet signature MUST NOT be used as encryption-key material.

### INV-CONTENT-005 — No plaintext observability

Production builds MUST compile out content and key debug logging. Request/response capture, session replay, analytics, exception telemetry, core dumps, dead-letter queues, and support exports MUST redact or structurally exclude plaintext, credentials, tokens, KeyPackages' private counterparts, and cryptographic state.

## 2. Identity and credentials

### INV-ID-001 — Account, wallet, and installation are distinct

`account_id`, `wallet_ref`, and `installation_id` MUST be separate objects. Linking or revoking one wallet MUST NOT silently clone, rotate, revoke, or recover an installation. Reinstall and restore create a new installation.

### INV-ID-002 — One independent leaf per installation

Each installation MUST generate independent device keys and occupy its own MLS leaf in each joined conversation. Private device or MLS keys MUST NOT be copied between installations or shared by project staff.

### INV-ID-003 — Enrollment is origin-, action-, and key-bound

Wallet enrollment and high-risk authorization MUST bind the exact messaging origin/URI, audience/client/environment, chain-qualified wallet and account, server-preallocated installation and device-credential IDs, action/purpose/project/scope, canonical P-256 `installationAuthKey` JWK and RFC 7638 JKT, separate suite-`0x0001` Ed25519 MLS credential public key and fingerprint, exact initial ordinary KeyPackage reference and SHA-256, protocol profile, nonce, issue time, and expiry. The P-256 key MUST separately prove possession through a terminal one-use challenge; the MLS KeyPackage signature and credential binding are verified under the MLS profile and neither key may substitute for the other. Both challenges are claimed atomically before expensive verification. Nonces are single-use. Generic reusable signatures are invalid.

### INV-ID-004 — Wallet proof is not personhood or message authentication

The UI and API MUST represent wallet verification only as control of a chain-qualified account at the recorded time. It MUST NOT imply natural-person identity, age, beneficial ownership, consent, or truth of a message. Ordinary messages authenticate with device/MLS credentials, not wallet signatures.

### INV-ID-005 — Smart accounts are verified correctly

Supported contract and counterfactual wallets MUST be verified with reviewed ERC-1271 and ERC-6492 logic at a recorded chain state. A Safe/DAO wallet authorizes an organization; its individual signers do not automatically receive project chat roles.

### INV-ID-006 — Device-directory changes are detectable

Every device credential addition, rotation, suspension, and revocation MUST enter an append-only Key Transparency system with inclusion and consistency verification, persisted client checkpoints, independent witness or gossip, and visible device notifications. Equivocation, rollback, or unverifiable inclusion blocks additions and sensitive sends.

### INV-ID-007 — Revocation is irreversible for an installation

A revoked `installation_id` or private credential MUST never become active again. Recovery enrolls a new installation and creates new leaves. Sessions and push tokens for the old installation are revoked independently and immediately.

### INV-ID-008 — Project staff are individually scoped

Every staff action MUST resolve to an individual installation and an unexpired project-role credential scoped to the project, relationship/conversation rights, policy revision, and role. Current onchain project authority or an explicit service-scoped delegation is required. Role loss invalidates sessions immediately.

### INV-ID-009 — Identifier classes do not collapse

Opaque domain objects use 122-random-bit UUIDv4 values. Clients create fresh case, event, and envelope UUIDv4 values before sealing; servers create account, wallet-link, installation, credential, policy, session-record, relationship, scope, conversation, policy-head, campaign, attachment, and archive UUIDv4 values. Only operational request/plan/intent/proposal/job records—including signer-migration jobs—use time-revealing UUIDv7. Bearer session tokens and other secret capabilities use at least 256 CSPRNG bits and MUST NOT be replaced by either UUID class.

## 3. Authorization and eligibility

### INV-AUTH-001 — Discovery is not authority

Indexer, cached UI, mutable metadata, handle, logo, token name, or candidate project data MUST NOT grant any messaging right. Authorization-sensitive facts use approved finalized RPC/receipt adapters and record their chain, block number/hash, source adapter/version, and semantic interpretation.

### INV-AUTH-002 — Policy is immutable and versioned

Every admission or continued-access decision MUST bind an immutable `policy_id`, monotonic `policy_revision`, canonical policy hash, evaluated evidence hash, issue/expiry, and the separate rights being granted. A later revision never rewrites the meaning of a prior event.

### INV-AUTH-003 — Consent and block dominate eligibility

Current ownership, a purchase, a gift, or receipt of an airdrop/dust token MUST NOT create consent. Contact, community, announcement, transactional, and marketing consent are separate. Block, unsubscribe, or leave MUST override an otherwise valid eligibility predicate.

### INV-AUTH-004 — Rights are not conflated

Discover, request-contact, join, read-new, read-backlog, send, invite, broadcast, export, and history access MUST be separately evaluable. Read authorization is not automatically send, staff, export, or historical-access authorization.

### INV-AUTH-005 — Finality and attribution are explicit

Holder and purchase gates MUST define finality, reorg, transfer, refund, dispute, payer, beneficiary, gift, custody, wrapper, bridge, delegation, loan, and grace semantics. A candidate whose authoritative state is unavailable or contradictory cannot receive a new admission.

### INV-AUTH-006 — Application role is verified after decryption

MLS membership authenticates a leaf but does not authorize every event kind. Before reducing an event, clients MUST verify the sender credential subject, installation, scoped role, policy revision, schema, event authorization matrix, stable IDs, exact versions, and domain transition.

### INV-AUTH-007 — Project transfer does not transfer history

Onchain project ownership, operator, or staff changes MUST NOT silently grant access to existing relationship history or recovery archives. History handover, where offered, is a separate explicit encrypted operation governed by the chosen organization-continuity policy.

### INV-AUTH-008 — Relationship domains isolate incompatible cases

Cases MAY share a relationship MLS group only when their exact reader, business-purpose, business-entity, retention, and history-transfer policies match. A project/customer pair with incompatible concurrently active cases MUST use separate opaque relationship security domains and MLS groups. Each domain binds a `relationship_scope_id` and canonical policy hash and has at most one active conversation generation.

## 4. MLS membership and epoch state

### INV-MLS-001 — External entitlement signer is not a member

The entitlement service's external-sender public credential MAY appear in the MLS `external_senders` extension. The service MUST NOT have a group leaf, epoch secret, or ability to create a Commit. Its corresponding private key may sign only scoped, logged external proposals. Policy heads use a separate scoped signing key and independently witnessed log.

### INV-MLS-002 — Proposal is not membership

An Add or Remove proposal does not change cryptographic membership. Membership changes only after an eligible current member creates a Commit incorporating the exact required proposal and other clients validate it. A mandatory proposal reference MUST bind its UUIDv7 record ID and separate 32-byte domain-separated hash; clients MUST reject an absent record, hash mismatch, substitution, or ID/hash equivocation. Each proposal pair maps one-to-one to its exact canonical `external_proposal` transcript envelope and position, and each committed intent maps to its exact canonical Commit envelope; neither linkage may be inferred from timing or mutable state.

### INV-MLS-003 — Independent policy freshness precedes sealing

Before every application seal, the sender MUST verify a fresh, monotonic signed entitlement-policy head through an independently authenticated endpoint or transparency log. Every refresh has a new UUIDv4 record ID, strictly increasing conversation sequence, and previous-head hash even if epoch, roster, and policy revision are unchanged. A stale, unavailable, rolled-back, inconsistent, or removal-pending head causes sealing to fail closed.

Delivery Service status is not sufficient proof of freshness.

### INV-MLS-004 — Pending removal freezes application sends

Once the latest signed policy head requires a Remove, compliant clients MUST NOT seal old-epoch application data. The Delivery Service MUST also reject old-epoch application submissions and stop routing to the target installation. Only bounded handshake/recovery traffic is permitted until a satisfying Commit is accepted and validated.

If no eligible member can Commit, availability is sacrificed and the conversation remains paused.

### INV-MLS-005 — Add grants future epochs only

A new account, holder, device, staff member, or project owner MUST NOT receive secrets for epochs before its Add Commit. Any historical data comes only from the distinct, explicit archive/transfer mechanism.

### INV-MLS-006 — Removal protects only future epochs

A Remove Commit MUST derive a new epoch that excludes the target leaf. Product copy and APIs MUST NOT imply removal erases prior keys, plaintext, screenshots, exports, reports, or attachment copies.

### INV-MLS-007 — Roster and epoch are distinct

Every Commit increments `mls_epoch`. `roster_version` increments exactly when the effective read-authorized leaf/role set changes. Clients MUST NOT infer roster equality from equal epoch numbers or infer epoch equality from equal roster versions.

### INV-MLS-008 — Sensitive disclosure matches the reviewed recipients

At encryption time, a sensitive event's expected `roster_version`, `mls_epoch`, exact unique device-fingerprint set, and effective reader roles MUST equal the live validated state. Any difference aborts and requires the user to review again. The approved binding remains authenticated inside the event.

### INV-MLS-009 — Only one canonical Commit per epoch

The Delivery Service coordinates one candidate Commit per conversation epoch. A losing committer MUST discard staged state, resync, and rebuild. It MUST NOT merge the losing Commit or send application data from the losing epoch.

### INV-MLS-010 — Client validation is authoritative

The Delivery Service may validate public structure, current epoch, session, role-policy, proposal references, sizes, and idempotency, but it cannot validate secret-dependent MLS confirmation. Clients MUST cryptographically validate every handshake and quarantine an invalid candidate without advancing their last agreed state.

### INV-MLS-011 — State updates and stale-device policy provide PCS

Membership changes and periodic honest Updates MUST advance epochs. Old epoch secrets are retained only for a documented bounded out-of-order window and then erased. Long-offline devices are evicted according to policy. Post-compromise recovery is claimed only after an honest update and loss of attacker access.

### INV-MLS-012 — Public handshake metadata contains no sensitive identifiers

Public proposals, commits, credentials, and GroupContext extensions MUST NOT contain raw wallets, phones, shipping/order data, names, mutable handles, or full private policy evidence. They use opaque or group-scoped identifiers and commitments.

### INV-MLS-013 — External-signer rotation cannot self-authorize or roll back

Version 1 groups pre-provision independently logged current and staged-next external-sender credentials. A signer is authorized only during its witnessed policy-log interval; presence in `external_senders` alone is insufficient. Rotation creates a fresh conversation generation and never uses an external GroupContextExtensions proposal, server Commit, or transplanted live MLS state. A declared compromise freezes affected groups within five minutes. A retired or revoked signer generation, migration cutover, or predecessor closure MUST NOT roll back after restore or failover.

### INV-MLS-014 — Version 1 ciphersuite is fixed

Version 1 accepts only RFC 9420 ciphersuite `0x0001`, `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`, with 32-byte confirmed-transcript hashes. There is no client negotiation or silent fallback. A future suite requires a new release profile and compatible API/storage schema, reruns every applicable gate, and migrates through fresh conversation generations; it MUST NOT reinterpret existing state in place.

### INV-MLS-015 — KeyPackages are one-use and not last-resort

Every version 1 KeyPackage is credential-bound and expiring. The atomic operation that first returns its bytes to an authorized plan is a terminal take and removes it from available inventory, even if the plan later expires, cancels, aborts, or receives an ambiguous result. Activation records its use but never makes it available again. Last-resort KeyPackages are disabled. Exhaustion fails admission visibly and cannot return a taken, restored, revoked, or expired package to inventory.

## 5. Delivery, ordering, and local state

### INV-DELIVERY-001 — HTTPS cursor sync is authoritative

Durable HTTPS mailbox/group-log sync after an opaque cursor is the source of truth. WebSocket, SSE, APNs, FCM, and Web Push are hints. Losing, duplicating, collapsing, or reordering a hint cannot lose or reorder the canonical transcript.

### INV-DELIVERY-002 — Seal, persist, then send

The client MUST atomically persist advanced MLS state, immutable exact ciphertext, `event_id`, `envelope_id`, and outbox intent before network submission. A retry resends exact bytes. It MUST NOT re-encrypt from rolled-back state.

### INV-DELIVERY-003 — Envelope idempotency is immutable

For each `conversation_id`, the first accepted bytes for an `envelope_id` are immutable. An exact retry returns the original result. Reuse with any different bytes, metadata, epoch, or sender is a hard conflict.

### INV-DELIVERY-004 — Application replay is separately suppressed

MLS generation checks are supplemented by an authenticated `event_id` replay cache. In canonical transcript order, the first role-authorized valid occurrence wins. An unauthorized occurrence MUST NOT reserve an event ID against a later authorized event.

### INV-DELIVERY-005 — Cursors are monotonic and bounded

Every accepted envelope has a monotonic conversation sequence. A page contains strictly increasing sequences; its next cursor equals its last item or the requested cursor for an empty page; pagination and response sizes are bounded. Cursor rollback, gaps, or divergent hash checkpoints cause a security error, not a silent reset.

The ordered page includes every sequenced external proposal, MLS Commit, and application envelope. A service MUST NOT consume a position for a proposal and then omit it from replay.

### INV-DELIVERY-006 — Unknown application content does not block sync

A malformed, unauthorized, duplicate, or unsupported application event is recorded as rejected and the transport cursor advances. An invalid MLS handshake does not advance cryptographic state and triggers quarantine/recovery.

### INV-DELIVERY-007 — One writer owns mutable MLS state

Only one process, worker, or lock holder may advance an installation's MLS state. Browser tabs use one shared crypto worker/lock or independent installation leaves. Native background extensions and the foreground app may not mutate the same state concurrently.

### INV-DELIVERY-008 — Live state is never restored or cloned

Live MLS databases, private KeyPackage material, generations, pending commits, and replay state MUST NOT be restored from generic backup or copied to another device. Rollback/clone detection suspends sends and starts a new-device rejoin.

### INV-DELIVERY-009 — Outer metadata is not application authority

Server-stamped sender, role, timestamp, content label, roster, or project fields are routing hints only. Authenticated application identity and authorization are derived from validated MLS state and signed scoped credentials.

### INV-DELIVERY-010 — Acknowledgement semantics are narrow

A service receipt attests only that exact bytes were accepted durably at a sequence/time. It MUST NOT be represented as content proof, recipient delivery/read proof, wallet signature, legal agreement, or fulfillment truth.

### INV-DELIVERY-011 — Receive persistence is atomic

Incoming decryption, MLS state advancement and old-secret deletion, replay/event recording, deterministic domain reduction, envelope hash, and cursor checkpoint MUST commit in one local transaction before the client acknowledges or advances visibly. A crash cannot acknowledge an envelope while retaining the pre-decrypt ratchet state.

### INV-DELIVERY-012 — Counters never overflow or coerce

Protocol counters use canonical unsigned-64 wire encoding, but version 1 service/storage accepts only `0..2^63-1`. A value above the cap is rejected; a group approaching the cap migrates to a fresh generation, and a group at the cap suspends. No counter may wrap, clamp, become a JavaScript `number`, or reuse a prior value. Chain `uint256` fields remain separate decimal/numeric values.

### INV-DELIVERY-013 — Log leaves encode every envelope class unambiguously

The canonical delivery-log leaf binds the envelope class, content type, generic exact-envelope hash, and a length-prefixed tagged sender union. Installation sends bind account and installation IDs; entitlement proposals bind external-sender credential ID, fingerprint, and signer generation. Null, empty, or omitted fields cannot make two sender classes or envelope classes hash identically.

## 6. Multi-device, history, and recovery

### INV-RECOVERY-001 — New device is a new leaf

Every linked or recovered device enrolls fresh keys, enters Key Transparency, and joins each conversation through an Add Commit. A device is added lazily to conversations; absence is visible rather than treated as successful decryption.

### INV-RECOVERY-002 — Removal is eager and observable

Revocation immediately cancels sessions, mailbox routing, and push tokens; creates independently logged Remove intents; sweeps groups by risk/recency; and reports per-group completion. Only the Commit ends cryptographic future access.

### INV-RECOVERY-003 — Account recovery and history recovery are separate

Wallet/passkey recovery may authorize a new device but MUST NOT produce old plaintext or archive keys by itself. History requires an existing-device transfer or separately protected recovery root.

### INV-RECOVERY-004 — History archive is read-only and cryptographically separate

An optional archive contains retained events encrypted under a fresh random recovery root. It has a versioned, signed, rollback-detectable manifest and never contains restorable live MLS state. Imported history is labelled and deduplicated by authenticated event IDs.

### INV-RECOVERY-005 — Recovery limitations are explicit

Strict mode loses history if all devices and recovery material are lost. Recoverable mode weakens retained-history forward secrecy. Neither mode silently grants archives to a new holder, staff member, device, or owner.

## 7. Announcements, attachments, and push

### INV-BROADCAST-001 — Large audiences are not MLS rosters

A 1,000- or 10,000-recipient private announcement MUST NOT create one MLS group or expose an audience roster to recipients. It uses one fresh encrypted campaign body and one MLS-encrypted key/descriptor envelope for each consented recipient account. When that account has multiple relationship security domains, the immutable target snapshot MUST select exactly one compatible active domain under a versioned policy and bind its scope ID and policy hash; the campaign MUST NOT duplicate delivery across every domain.

### INV-BROADCAST-002 — Campaign key remains on business endpoints

The campaign content key is generated and wrapped by an authorized business endpoint. It is fresh per campaign and never sent to or generated by the service outside MLS ciphertext. A hosted worker may hold it only if explicitly modelled and shown as a plaintext-capable business endpoint.

### INV-BROADCAST-003 — Audience snapshot is consented and idempotent

The campaign binds a policy revision and audience snapshot. Block/unsubscribe is applied before wrapping and again before queued delivery where possible. Retries are idempotent. Cancellation cannot retract keys already delivered.

### INV-BROADCAST-004 — Campaign restart never changes accepted bytes

The business endpoint persists the fresh campaign key, immutable body ciphertext/descriptor, audience hash, and target outbox before fanout. Restart resends exact accepted-target bytes. Loss of endpoint campaign state produces a visible partial failure; it MUST NOT regenerate a key or ciphertext under the same campaign, duplicate the logical event, or invoke server-side key recovery.

### INV-ATTACH-001 — Fresh authenticated attachment encryption

Every attachment uses a random object ID and fresh random key. Chunk nonces are unique under that key. A canonical authenticated manifest binds algorithm/version, object, order, lengths, digest, and encrypted metadata. No plaintext-derived object path or cross-send plaintext deduplication is allowed.

### INV-ATTACH-002 — Plaintext is released only after authentication

Clients MUST authenticate a complete chunk and its manifest relation before releasing its plaintext. They enforce configured type/size limits, sandbox parsers/previews, reject active content and bombs, and clean orphan ciphertext.

### INV-ATTACH-003 — E2EE scanning claims are honest

The service MUST NOT claim native attachments are server-side malware scanned, transcoded, searched, or previewed. Such processing requires a named endpoint that receives plaintext.

### INV-PUSH-001 — Push is content-free and non-authoritative

Push contains only a generic wake and randomized device-bound sync hint. It contains no sender, project, wallet, order, case, conversation/group identifier, body, attachment metadata, or sensitive exact count. The client fetches and decrypts through ordinary sync.

### INV-PUSH-002 — Push cannot mutate MLS concurrently

A notification process may render an opt-in local preview only through a reviewed single-writer path. It MUST NOT race or independently advance the main client's MLS state. Token rotation, loss, duplication, and post-revocation delivery do not change transcript correctness.

## 8. Web, SDK, and bridge boundaries

### INV-WEB-001 — Dedicated origin is the default endpoint

The first-party PWA and iframe execute from a dedicated messaging origin with strict CSP, Trusted Types where available, no third-party active scripts, no authenticated caching, and a no-cache service worker. Untrusted project media and links do not execute or fetch directly in the crypto origin.

Browser storage and WebCrypto MUST NOT be described as guaranteeing hardware-backed keys, forensic secure deletion, or zeroization. Web forward-secrecy claims cover later compromise of logically erased live state, not historical browser-profile, disk, memory, or OS-backup snapshots retained by an adversary.

### INV-WEB-002 — The iframe parent receives no secrets

Cross-origin `postMessage` validates exact `origin` and `source`, uses exact `targetOrigin`, and carries only the allowlisted versioned non-secret protocol. Plaintext, keys, history, wallet signatures, attachment capabilities, and recipient roster never cross to the parent.

### INV-WEB-003 — Sensitive confirmation is inside the trusted origin

Recipient review and the final sensitive-send action occur inside the messaging origin, with the exact cryptographic recipient snapshot visible. The parent cannot assert or suppress that confirmation through a bridge message.

### INV-WEB-004 — Headless mode changes the trust claim

A same-origin headless SDK makes the host and all same-origin code plaintext-capable endpoints. It MUST be documented, consented, tested, and labelled separately from isolated E2EE embedding.

### INV-BRIDGE-001 — WhatsApp is a separate relay

An ordinary WhatsApp Business integration MUST be represented as a separate relay thread and plaintext trust domain. It is never silently merged with, added to, or backfilled from a native E2EE thread. Phone mapping, relay retention, subprocessors, and consent are separately controlled.

## 9. Abuse, privacy, and operations

### INV-SAFETY-001 — Blocking always wins

Block, leave, unsubscribe, and channel opt-out override token, purchase, project, staff, campaign, and invitation permissions. A blocked project cannot regain send access merely because eligibility still evaluates true.

### INV-SAFETY-002 — Reporting is explicit selective disclosure

A report uploads only the messages, attachments, membership events, and context explicitly selected and decrypted by the reporting endpoint. The UI states what becomes visible. Reports use a separate access-logged store, retention policy, moderator role, and appeal workflow.

### INV-SAFETY-003 — No silent content endpoint

Bots, AI, search, translation, moderation, DLP, CRM, compliance archive, and carrier/fulfillment integrations that receive native plaintext MUST appear as named endpoints before content is shared. They cannot be inserted through a server flag alone.

### INV-PRIVACY-001 — Metadata claims are accurate

Product and security copy MUST state that the service sees delivery, membership, eligibility, IP, timing, size, push, attachment-access, and campaign-fanout metadata. It MUST NOT claim anonymity, zero knowledge, or zero metadata.

### INV-PRIVACY-002 — Identifiers minimize correlation

MLS credentials and routing IDs use opaque or group-scoped values. Raw phone-wallet-device mappings and message hashes are never published onchain. Cross-store joins require a documented purpose, least privilege, and audit record.

### INV-PRIVACY-003 — Retention is enforced by data class

Ciphertext, pending mailboxes, attachments, identity links, eligibility evidence, traffic logs, transparency records, reports, relay plaintext, archives, and backups each have an approved purpose and retention/deletion schedule. Expiry jobs and backup ageing are monitored and tested.

### INV-OPS-001 — Cryptography and releases are reproducible and reviewable

The MLS library, crypto provider, bindings, compiler, dependencies, and build artifacts are pinned with an SBOM and signed provenance. Production releases require protected review, multi-party approval, reproducibility evidence, staged rollout, monitoring, and tested rollback. No unresolved critical or high security issue may ship.

### INV-OPS-002 — Security-key operations are isolated

Identity, entitlement external-sender, policy-head, transparency, transport-signing, push, storage, and release keys are separate, least-privilege, hardware-protected where supported, monitored, and rotated with overlap. No single application credential can impersonate devices, decrypt content, sign entitlements, and deploy clients.

### INV-OPS-003 — Failures do not downgrade security silently

An unavailable transparency service, stale policy head, contradictory finality evidence, rollback, invalid Commit, unsupported schema migration, or broken secure storage causes a visible paused/error state. The client MUST NOT fall back to plaintext, simulated envelopes, unverified keys, old epochs, or a relay channel.

## 10. Fulfillment-domain invariants

The existing production-facing fulfillment contracts remain mandatory:

- Only a customer role can emit a shipping address or post-shipment correction.
- Only project staff can request or acknowledge an address, mark preparation/shipment, or send tracking.
- A shipping address is accepted only with a valid exact recipient-roster binding.
- Address IDs remain stable and versions increment exactly by one.
- A new pre-shipment address version invalidates acknowledgement, preparation, and tracking bound to the old version.
- Preparation requires acknowledgement of the exact current address version.
- Shipment requires the exact address version to be in `preparing`; `shipped` is terminal.
- Tracking and the transition to `shipped` are one authenticated atomic production event/batch; partial two-envelope application is invalid.
- A post-shipment change is a separate correction lineage and cannot reopen fulfillment or create a second shipment.
- A valid MLS sender emitting a role-forbidden or transition-invalid event does not change the derived state.

These are application integrity guarantees, not proof that an address, tracking code, carrier, or shipment is factually correct.
