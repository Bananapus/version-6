# Production messaging architecture

Status: normative production target, version 0.1, 2026-08-14.

This document specifies the production architecture for the first-party Juicebox Messaging service. The current development server and simulated envelopes do not satisfy this specification and MUST NOT be presented as secure messaging.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be interpreted as described by [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119.html) and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174.html).

Related specifications:

- [Decision log](./decision-log.md)
- [Threat model](./threat-model.md)
- [Security invariants](./security-invariants.md)
- [Service API](./service-api.md)
- [Storage and retention](./storage-and-retention.md)
- [Embedding security](./embed-security.md)
- [Verification](./verification.md)
- [Launch gates](./launch-gates.md)

## 1. Decision summary

Production v1 MUST use:

- A first-party, centralized Delivery Service owned and operated by Juicebox Messaging.
- Durable HTTPS cursor sync as the source of truth. WebSocket, Server-Sent Events, Web Push, APNs, and FCM are wake-up hints only.
- [MLS 1.0, RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html) for end-to-end encryption of both project-customer relationship conversations and bounded interactive community rooms.
- A pinned, audited MLS implementation. OpenMLS 0.8.1 or a later remediated release is the initial candidate, subject to the gates in [launch-gates.md](./launch-gates.md).
- One independent MLS leaf per installation. Wallet private keys MUST NOT be MLS keys.
- A dedicated first-party origin and signed first-party clients before any headless third-party SDK.
- An append-only, transparency-backed directory for account and device credentials.
- External MLS proposals for automated entitlement-driven Add and Remove requests. The entitlement service MUST NOT be an MLS member.
- Private announcements implemented as one encrypted body plus one envelope per recipient account through a snapshotted compatible relationship domain, not one giant MLS room.

Production v1 MUST NOT depend on Matrix or XMTP for its only delivery path. XMTP remains a Phase 0 bake-off candidate and future transport adapter. Matrix is reconsidered only if federation or Matrix interoperability becomes a product requirement.

The system provides content confidentiality. It does not promise anonymity or zero metadata: the service can observe accounts, device routing, conversation membership, eligibility decisions, IP addresses, ciphertext sizes, timing, push tokens, and audience fanout.

## 2. Architectural principles

1. **Separate wallet identity, device identity, authorization, and encryption.** A wallet proves control of a chain-qualified account at a time. A device key identifies a messaging endpoint. A policy grants scoped rights. MLS distributes message keys.
2. **Adopt cryptography; build product semantics.** No application code may implement a new ratchet, group key schedule, AEAD construction, signature construction, or key derivation scheme.
3. **Endpoints hold plaintext.** The Delivery Service, entitlement service, database, object store, push provider, analytics, and ordinary operations tooling do not.
4. **A server decision alone is not a cryptographic membership change.** Read access ends only after a valid MLS Commit removes the leaf and advances the epoch.
5. **Authorization is versioned evidence.** Indexer display data is never authorization. Eligibility and project roles are evaluated against canonical finalized evidence and bound to a policy revision.
6. **Consent is independent of entitlement.** A token, a purchase, or an airdrop does not opt a person into direct messages or marketing. Blocking always overrides eligibility.
7. **Recovery never rolls back live cryptographic state.** A restored installation is a new installation and a new MLS leaf. History import is separate and read-only.
8. **Secure embedding is an origin boundary.** A same-origin headless SDK makes the host application part of the trusted endpoint.

## 3. System and trust boundaries

| Component | Holds plaintext or message keys? | Trusted for | Not trusted for |
|---|---:|---|---|
| First-party client endpoint | Yes | Local encryption, decryption, policy checks, user intent, state persistence | Continued security after endpoint, browser, extension, OS, or supply-chain compromise |
| Wallet | No chat keys | Account-control proof and explicit high-risk authorization | Natural-person identity, current device safety, perpetual authorization, or message encryption |
| Identity and Authentication Service | No message keys | Issuing and revoking scoped account/device credentials | Undetectable key substitution; transparency and client validation constrain it |
| Key Transparency service | Public credentials and metadata only | Append-only device-directory consistency and auditability | Message confidentiality or availability |
| Entitlement service | No message keys | Finalized policy evaluation and signed Add/Remove proposals | Decryption, Commit creation, or unilateral MLS membership changes |
| Signed entitlement-policy log | Public policy heads, proposal hashes, and evidence commitments | Independently authenticated, monotonic membership intent and freshness | Message content or unilateral MLS membership changes |
| Delivery Service | No message keys | Durable ordering, cursor sync, idempotency, mailbox routing, commit coordination | Content confidentiality, censorship resistance, or final cryptographic validation |
| Finalized-chain RPC adapters | Public chain data | Authorization evidence at a recorded block/hash | User identity or intent beyond the relevant onchain fact |
| Discovery indexers | Public/indexed data | Search, display, and candidate discovery only | Eligibility, project authority, purchase attribution, or finality |
| Ciphertext object store/CDN | No attachment keys | Durable opaque object delivery | File confidentiality without client encryption |
| Push provider | No message content | Best-effort wake-up | Confidential metadata, ordering, or durable delivery |
| Other conversation members | Yes, for content they receive | Nothing beyond their authenticated actions | Secrecy after receipt; a member can copy, screenshot, forward, or leak |
| WhatsApp gateway | Yes, for relayed threads | Explicitly scoped protocol translation | Native E2EE; it is a separate plaintext-capable endpoint |

Identity, entitlement, delivery, key transparency, attachments, push, and analytics SHOULD use distinct service identities, databases or schemas, encryption keys, and operator permissions. No ordinary operator role SHOULD be able to join wallet identity, push token, conversation membership, and IP/access history without an audited break-glass action.

## 4. Normative identifiers

Identifiers MUST be opaque, non-secret, unguessable where enumeration matters, and encoded canonically. Opaque domain-object IDs use lowercase canonical UUIDv4, whose fixed version/variant fields leave 122 CSPRNG-generated bits. Operational records that materially benefit from time ordering—request, plan, intent, proposal, and job IDs, including signer-migration jobs—use lowercase canonical UUIDv7 and therefore disclose approximate creation time. Session record IDs remain UUIDv4; bearer session tokens are separate 256-bit secrets. Neither UUID form is an authorization capability. Bearer capabilities and secret handles use at least 256 CSPRNG bits in canonical unpadded base64url. Raw wallet addresses, phone numbers, order labels, names, and mutable handles MUST NOT be used as database primary keys or MLS group IDs.

| Identifier | Definition |
|---|---|
| `account_id` | Server-generated, service-scoped opaque UUIDv4. One account can link several wallets and devices. |
| `wallet_ref` | CAIP-10 chain-qualified account, for example `eip155:8453:0x…`. The same hexadecimal address on two chains is not automatically the same authorization scope. |
| `installation_id` | Fresh server-generated opaque UUIDv4 created for one app installation. Reinstallation or restore creates a new value. |
| `device_fingerprint` | Versioned hash of the canonical device credential and public keys. It is not the installation ID. |
| `credential_id` | Server-generated opaque UUIDv4 for an immutable, signed account/device or project-role credential; the separate fingerprint hashes its canonical bytes/public keys. |
| `project_ref` | `{protocol, protocolVersion, chainId, projectsContract, projectId}`. Omnichain projects use a service UUID mapped to a verified set of these references; mutable indexer group IDs are not primary keys. |
| `order_ref` | `{sourceAdapter, adapterVersion, chainId, txHash, event/log index or signed order ID}` plus recorded payer and beneficiary semantics. |
| `policy_id` | Stable server-generated opaque UUIDv4 for one policy lineage. |
| `policy_revision` | Monotonic integer and canonical policy hash. Revisions are immutable once used. |
| `policy_head_id` | Server-generated UUIDv4 for one immutable issued policy-head record. Ordering comes from `policy_head_sequence`, not identifier time. A stable group receives new head IDs as freshness is renewed. |
| `policy_head_sequence` | Conversation-scoped monotonic service counter incremented for every head issuance, even when epoch, roster, and policy revision are unchanged. The signed head binds the previous head hash. |
| `relationship_id` | Server-generated opaque UUIDv4 for one project-customer relationship security domain. A project/customer pair MAY have several concurrent relationship domains. It MUST NOT encode the project, wallet, order, or policy. |
| `relationship_scope_id` | Server-generated opaque UUIDv4 naming the reader/business-purpose/business-entity/retention/history-policy scope that partitions relationship domains for one project/customer pair. Its separate canonical `relationship_policy_hash` binds the exact scope rules. |
| `case_id` | Client-generated opaque UUIDv4 for a purchase/support subthread carried only inside encrypted relationship application events. |
| `conversation_id` | Server-generated opaque UUIDv4 routing identifier for a single cryptographic conversation generation. |
| `conversation_generation` | Positive relationship/room-lineage-scoped `uint64` incremented whenever a fresh `conversation_id` and MLS group replaces a prior generation. It is not an MLS epoch. |
| `mls_group_id` | Client-generated random 256-bit group identifier, independent from `conversation_id`. |
| `roster_version` | Monotonic conversation counter incremented exactly when the effective member-device set or read-authorized role set changes. |
| `mls_epoch` | MLS `uint64` epoch. Every Commit advances it, including an Update that does not change `roster_version`. APIs encode it as eight canonical bytes or a canonical unsigned decimal string, never a JavaScript `number`. |
| `event_id` | Client-generated UUIDv4 application idempotency ID created before sealing and stored inside the encrypted payload. First valid occurrence in canonical transcript order wins. |
| `envelope_id` | Client-generated UUIDv4 transport idempotency ID created before sealing. It identifies immutable exact envelope bytes. |
| `proposal_id` | Opaque UUIDv7 for one proposal record. A separate 32-byte, domain-separated `proposal_hash` binds the canonical MLS proposal bytes and authorization-record hash. Mandatory-proposal references carry both; the hash is cryptographically authoritative and the UUID is record identity only. |
| `campaign_id` | Server-generated opaque UUIDv4 for one announcement send. |
| `attachment_id` | Server-generated opaque UUIDv4 unrelated to content or filename; the storage object key is separately random. |
| `archive_id` | Server-generated opaque UUIDv4 for an immutable encrypted history archive generation. |

Hashes and signatures MUST use domain-separated, versioned canonical encodings. Service-defined hashes in version 1 use 32-byte SHA-256 where specified. MLS confirmed-transcript hashes are also exactly 32 bytes under the pinned version 1 ciphersuite. A protocol version bump is required before changing an identifier derivation or canonical encoding.

`roster_version`, Delivery Service sequences, and other protocol counters use canonical unsigned-64 wire encoding as eight bytes or decimal strings at JavaScript boundaries. Version 1 intentionally accepts and persists only `0..2^63-1` for hot-path counters so PostgreSQL signed `bigint` is exact. Clients and services reject a supplied or current value above that cap. A group approaching the cap migrates to a fresh conversation generation; reaching the cap without a completed migration suspends the operation. Counters never wrap, clamp, coerce, or reuse a prior value. Chain `uint256` values remain separate canonical decimal/numeric fields and are not subject to this service-counter cap. Application payloads MUST use one fully specified canonical encoding, including field ordering, integer representation, string normalization, maximum sizes, unknown-field handling, and hash domains. Canonical CBOR is the preferred Phase 0 candidate.

## 5. Conversation topology

### 5.1 Project-customer relationship

The default private channel is one relationship security domain backed by one active MLS conversation generation. A project/customer pair MAY have multiple such domains active concurrently. Each domain binds an opaque `relationship_scope_id` and exact `relationship_policy_hash` over the complete reader, business-purpose, business-entity, retention, and history-transfer policy, and contains:

- The customer's active, joined installations.
- Only the project staff or business installations currently authorized to read that relationship.

Purchase cases, order references, fulfillment events, and ordinary messages are encrypted application subthreads within that group. Cases may cohabit only when their exact reader policy, business purpose, business entity, retention policy, and history-transfer policy match. Otherwise the service MUST place them in different relationship security domains and MLS groups, even when they involve the same project and customer. Each relationship security domain has at most one active conversation generation; replacement generations are sequential within that domain and do not prevent another domain for the same pair from remaining active.

Staff MUST use individual device credentials and scoped project-role credentials. A project, Safe, DAO, or multisig MUST NOT share one MLS private key among staff.

### 5.2 Interactive community

An interactive community is a bounded MLS group. All members can learn its leaf roster, at least as pseudonymous credentials, and any member can leak received content. The provisional launch safety ceiling is 250 accounts; the device-leaf ceiling and final account cap are pinned only after the open capacity decision and Phase 0 measurements. Raising a ratified cap requires rerunning the churn, offline, storage, and mobile battery gates.

Group credentials SHOULD use group-scoped participant pseudonyms instead of raw wallet addresses. The UI may show an independently verified wallet or project badge only when policy calls for that disclosure.

### 5.3 Private announcement

An announcement audience is an authorization and delivery query, not an MLS group. Its recipients are:

```text
eligible at the policy snapshot
AND has a registered encryption endpoint
AND has consented to the message class
AND has not blocked the project
```

The immutable audience snapshot maps each recipient account to exactly one compatible active relationship security domain under a deterministic, versioned selection policy. The selected domain's `relationship_scope_id` and policy hash are committed into that target's authorization record. A campaign MUST NOT send once through every concurrent domain for the same account. If no compatible relationship exists, the endpoint may create an announcement-scoped domain from the recipient's published KeyPackages after consent.

The sending business endpoint generates a fresh 256-bit campaign content key, encrypts the body and shared attachments once, and sends the key plus ciphertext descriptor through the selected relationship MLS group for each recipient.

Before upload or fanout, the business endpoint atomically persists the campaign key, immutable body ciphertext/descriptor, audience-snapshot hash, and per-target outbox state in encrypted endpoint storage. An interrupted campaign resumes with the exact same key, body bytes, and accepted per-target envelope bytes. If that local state is lost, already accepted targets remain delivered and the campaign becomes visibly `partially_failed`; the endpoint MUST NOT recreate a key under the same campaign, silently resend a differently encrypted logical event, or ask the service to recover it.

The service MUST NOT hold the campaign content key. Envelope generation is O(number of recipient accounts), resumable, and client-side. A tenant-operated business agent MAY perform it only when it is explicitly presented as a plaintext-capable business endpoint.

Recipients cannot enumerate other recipients. The Delivery Service can still observe and correlate the fanout. A campaign key MUST NOT be reused for a later campaign, and cancelling a campaign cannot retract ciphertext or keys already delivered.

### 5.4 Service state machines

Conversation lifecycle:

```text
provisioning -> active
active <-> membership_pending
active | membership_pending -> suspended
suspended -> active | closing
active | membership_pending -> closing
closing -> closed -> retention_expired -> purged
```

A conversation plan is a separate expiring resource, not a conversation state. Only `active` accepts application envelopes. `membership_pending` accepts the exact proposal/Commit and repair traffic required by its intent and requires the next eligible sender to resolve mandatory proposals before an application send. `suspended` accepts only the minimum authenticated control traffic needed to repair or close. `closing` and later states reject application envelopes. `closed` may permit bounded export/final removal during its retention window; `purged` is terminal.

Eligibility lease:

```text
unknown -> evaluating -> pending-finality
pending-finality -> eligible(active lease) | rejected
eligible -> renewal-due -> renewed | expired | revoked | disputed
```

Membership intent, which is distinct from an MLS proposal:

```text
requested -> authorized | cancelled | expired
authorized -> proposed(base epoch) | cancelled | superseded | expired
proposed -> committed | cancelled | superseded | expired
committed Add -> welcome-pending -> active
active -> removal-pending -> committed Remove -> removed
```

Client sync:

```text
uninitialized -> catching-up -> ready
ready -> repairing-gap | quarantined-fork | recovery-required
repairing-gap -> ready | quarantined-fork | recovery-required
```

Campaign:

```text
audience_snapshotted -> body_encrypted -> distributing
distributing -> completed | partially_failed | cancelled
partially_failed -> distributing | completed | cancelled
```

`draft` is optional client-local composition state and is never a service campaign state. Service state begins only after the immutable audience snapshot is accepted. Cancellation stops unsent work only. It does not revoke delivered keys.

Current fulfillment lifecycle:

```text
address-needed
  -> address-awaiting-ack(v1)
address-awaiting-ack(vN) -> ready-to-fulfill(vN)
ready-to-fulfill(vN) -> preparing(vN)
address-awaiting-ack(vN) | ready-to-fulfill(vN) | preparing(vN)
  -> address-awaiting-ack(vN+1)
preparing(vN) -> shipped(vN, shipment v1)
shipped(vN) -> shipped(vN) + correction(cN)
```

`shipped` is terminal. A pre-shipment address update invalidates acknowledgement and preparation for the prior version. A post-shipment correction is a separate lineage. Production MUST make tracking plus the transition to `shipped` one authenticated atomic application event/batch; the current development client's two independent envelope sends are not production-safe because a crash can expose a partial transition.

## 6. MLS profile

The MLS implementation MUST conform to RFC 9420 and its security architecture in [RFC 9750](https://www.rfc-editor.org/rfc/rfc9750.html). Version 1 is pinned to RFC 9420 ciphersuite `0x0001`, `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`; its KDF, transcript, and service-integrity hash outputs are 32 bytes where the profile specifies SHA-256. Custom ciphersuites, runtime ciphersuite negotiation, and private post-quantum hybrids are prohibited. A future suite requires a new versioned release profile and storage/API schema, full applicable launch gates, and fresh-generation migration; existing bytes and columns are never reinterpreted in place.

The profile is:

- One leaf per installation per conversation.
- Public MLS wire format for proposals and commits; private MLS wire format for application messages. The public handshake profile is required so the Delivery Service can bind an intent to exact mandatory proposal references, sequence one Commit, and enforce the expected Welcome set without holding an epoch secret.
- The entitlement signer's public credential pre-provisioned through the `external_senders` GroupContext extension.
- External senders are restricted to authorized Add and Remove proposals. External PSK, ReInit, GroupContextExtensions, external Commit/join, and unknown proposal types are rejected by both service and clients.
- Application content types and role credentials versioned independently from MLS.
- Fresh KeyPackages published per installation, rate-limited and removed after use.
- Periodic Update commits and immediate membership commits.
- An authenticated application message ID and replay cache in addition to MLS generation checks.
- Single-use, credential-bound KeyPackages with a bounded lifetime. An atomic reservation that releases package bytes to a caller is a terminal take: the package leaves available inventory immediately and is never returned after plan expiry, cancellation, abort, or ambiguous activation. Later activation records use of that already-taken package; an ambiguous take is burned.
- MLS last-resort KeyPackages are disabled in version 1. Key exhaustion returns a visible retryable admission failure and triggers replenishment; it never reuses an ordinary or restored package.
- No raw wallet address, phone number, order reference, or sensitive policy evidence in public GroupContext extensions or public handshake metadata.

### 6.1 External-signer lifecycle

Version 1 does not allow the entitlement service to replace its own credential with a `GroupContextExtensions` proposal. Every newly activated group pre-provisions exactly two external-sender credentials: the independently logged `current` signer and `staged_next` signer. Each credential binds a monotonic signer generation, fingerprint, `not_before`, and `not_after`; its validity is at most 90 days.

The next credential and its offline-root-authorized, independently witnessed log entry MUST be published at least 30 days before that credential may become the active signer. A group may activate only when its staged-next credential has at least 30 days remaining before expiry. Credential validity windows MAY overlap for at most 14 days, but each policy-log checkpoint names exactly one active signer; there is no interval of dual proposal authority. A client checks that exact signer generation and status in the latest witnessed policy log before processing every proposal. Appearance in the group's `external_senders` extension or an otherwise valid credential window is necessary but never sufficient authority.

At rollover, the service starts a separate per-conversation signer-migration resource with states:

```text
scheduled -> successor_provisioning -> successor_ready -> cutover_verified -> complete
    |                 |                     |
    +-----------------+---------------------+-> blocked
emergency_frozen -> successor_provisioning
```

That resource binds predecessor and successor conversation generations, both external-sender fingerprint pairs, the witnessed signer-log checkpoint, start/cutover deadlines, progress, and failure reason. It is not a conversation state. Scheduled migrations MUST make the successor active within 24 hours at p95 and seven days at p99. Any predecessor still active 30 days before its last independently authorized in-group signer expires MUST enter `suspended`; it cannot seal or accept application content until migration completes.

A successor uses a fresh `conversation_id`, random MLS group ID, fresh one-use KeyPackages, the latest verified eligible roster and policy, and a signed predecessor link. Live MLS secrets, transcript state, replay state, and KeyPackages are never transplanted. `successor_provisioning` and `successor_ready` artifacts remain in the migration/plan staging tables and MUST NOT create a live `conversations` row, mailbox, or accepted-envelope route while the predecessor is active or suspended. During normal provisioning the predecessor remains the sole application-send generation. Cutover is one CAS that freezes/closes the predecessor, inserts and activates the staged successor, and swaps the relationship active pointer; no uniqueness rule may permit two traffic-accepting generations or prevent the staging records from coexisting. An ambiguous cutover leaves both generations unable to send until the signed active-generation record and client transcript evidence agree. The service MUST NOT roll back to the predecessor merely to restore availability.

On declared signer compromise, an offline-root-authorized revocation is published through the independently witnessed log. The Delivery Service freezes affected groups immediately, and every affected migration resource and policy head MUST show `emergency_frozen` or an equivalent mandatory migration within five minutes. Clients reject the signer and old-generation sends as soon as they observe the monotonic revocation, and in every case before another seal because policy-head validity is at most five minutes. If the staged key, an eligible committer, fresh KeyPackages, or a consistent witnessed head is unavailable, the group remains frozen. There is no server self-update, emergency Commit, external GroupContextExtensions proposal, or fallback to an older signer.

Signer generations, revocations, migration cutovers, and predecessor closure are retained in the non-rollback security ledger and reapplied before traffic after any restore. A revoked or retired signer generation is never reauthorized.

Every sender MUST obtain a fresh, monotonic signed entitlement-policy head from an independently authenticated endpoint or transparency log before sealing. Every issuance is a new immutable UUIDv4 `policy_head_id` with a strictly increasing conversation-scoped `policy_head_sequence` and previous-head hash, including a refresh during an unchanged epoch/roster/policy revision; a uniqueness key over only those stable fields is invalid. Delivery Service state is not sufficient evidence that no removal is pending. Each mandatory-proposal entry binds both the UUIDv7 `proposal_id` and its 32-byte `proposal_hash`; clients select records by ID and verify the hash over the exact canonical proposal and authorization record before processing. If the policy head is stale, unavailable, rolled back, inconsistent, names an uncommitted mandatory proposal, or binds a mismatched ID/hash pair, the client fails closed. This converts Delivery Service freezing into defense-in-depth instead of trusting the Delivery Service to disclose revocation.

MLS authenticates a sending leaf; it does not enforce the application's customer, project-staff, owner, fulfillment, or campaign roles. After decryption, clients MUST validate the sender leaf, current scoped role credential, credential subject, policy revision, content type, event schema, and event transition before reducing the event.

For sensitive disclosures such as a shipping address, the user must review an exact recipient snapshot. Sealing MUST abort if any of the following changed between review and encryption:

- `conversation_generation` or the authenticated `mls_group_id` binding;
- `roster_version`;
- `mls_epoch`;
- the canonical roster digest;
- one or more recipient device fingerprints;
- the effective reader role set.
- the Key Transparency checkpoint;
- the application policy revision.

The event retains the approved snapshot. A later membership change does not invalidate a correctly sent historical event, but it requires a new review before another sensitive disclosure.

The production crypto boundary MUST derive the review snapshot from the same locked, client-validated MLS state used by `seal`. A service `RecipientRosterAdapter` may enrich names and roles for display but is not roster authority. The client-facing equivalent of `inspectRecipients()` returns an opaque, single-use local seal token plus:

```text
conversation generation and conversation ID
authenticated MLS group-ID hash
MLS epoch and roster version
canonical roster hash
exact credential fingerprints and effective reader roles
Key Transparency checkpoint
policy ID, revision, and hash
```

`seal()` consumes that token atomically. A token from another group, process, epoch, roster, transparency checkpoint, or policy is invalid. This replaces any production design in which UI code independently fetches a server roster and later asks the crypto layer to trust it.

## 7. Delivery Service protocol

### 7.1 Source of truth

The durable API MUST provide equivalent operations to:

- publish and consume KeyPackages;
- create or bind a conversation generation;
- submit public proposal/commit envelopes;
- submit private application envelopes;
- fetch a mailbox or group log after an opaque cursor;
- obtain current public conversation coordination state;
- initialize and fetch ciphertext attachments;
- register an opaque push wake target.

Transport APIs MUST accept opaque ciphertext for application events. They MUST reject fields that ask the server to stamp a sender role or content claim on behalf of a client. Sender identity is derived from a device-authenticated session and is verified cryptographically by recipients.

The per-conversation log and its cursor contain every sequenced `external_proposal`, `mls_commit`, and `application` envelope in one gap-free order. A sync endpoint MUST NOT omit an external proposal that consumed a sequence or hash-chain position. Targeted Welcome retrieval remains separate because a Welcome is addressed only to the added installation.

All authenticated responses MUST use `Cache-Control: no-store`. Production mutations require HTTPS, exact-origin validation, CSRF protection where cookies are used, bounded request bodies, strict schema validation, and non-enumerating authorization failures.

### 7.2 Per-conversation coordination record

The Delivery Service maintains:

- current accepted `conversation_generation`;
- current coordinating `mls_epoch`;
- current client-supplied public confirmed-transcript checkpoint/hash;
- current `roster_version` and public roster credential hashes;
- pending required `(proposal_id, proposal_hash)` pairs and expiries;
- conversation status;
- monotonically increasing server sequence;
- immutable envelope IDs, byte hashes, sizes, sender installation IDs, and receipt times;
- per-installation cursors and retention state.

The Delivery Service does not possess the MLS epoch secret and therefore cannot fully validate a Commit's confirmation tag. It performs structural, current-epoch, device-session, role-policy, proposal-reference, size, and idempotency validation. Member clients perform MLS validation. An invalid selected Commit is quarantined without advancing the last client-agreed epoch; the incident is surfaced and recovered according to the tested fork protocol.

### 7.3 Application send state machine

```text
draft
  -> synchronized
  -> sealed-and-state-persisted
  -> exact-ciphertext-outbox
  -> submitted
  -> accepted(sequence assigned)
  -> delivered/expired
```

Before sealing, a client MUST verify a fresh entitlement-policy head and sync all available handshakes and mandatory proposals. Local MLS state, the immutable exact ciphertext, `event_id`, `envelope_id`, and outbox record MUST commit atomically before network submission. A retry MUST resend those exact bytes. Reusing an `envelope_id` with different bytes is an idempotency conflict and MUST fail closed.

Server acceptance proves only that the service durably accepted the exact envelope bytes. It does not prove delivery, reading, content, legal agreement, or wallet signature.

### 7.4 Commit state machine

```text
active(epoch N)
  -> proposal-pending
  -> committer-lease or compare-and-swap
  -> staged-commit persisted
  -> commit submitted
  -> canonical acceptance
  -> clients validate and merge
  -> active(epoch N+1)
```

Only one Commit candidate can be canonical for a `(conversation_generation, base_epoch, base_roster_version, ETag, intent_id, base_confirmed_transcript_hash)` tuple. The service can compare a public client-supplied transcript checkpoint but cannot validate secret-dependent MLS confirmation; clients still validate their confirmed transcript and tree cryptographically. A client that loses the compare-and-swap MUST discard its staged Commit, reload the canonical log, and create a new proposal or Commit from the accepted epoch. It MUST NOT merge the losing state or encrypt application content from it.

Incoming decryption, MLS state advancement and secret deletion, replay/event recording, domain reduction, envelope hash, and cursor checkpoint MUST commit in one local transaction before an acknowledgement is emitted. A crash cannot acknowledge an envelope whose corresponding new local state was not durably committed.

Malformed or unknown future application payloads MUST NOT stall cursor progress. Clients record the rejected event ID/hash, advance the transport cursor, and continue. Invalid MLS handshakes are different: they stop advancement of that conversation's cryptographic epoch and trigger quarantine/recovery.

If the service canonically sequences a Commit that an honest client cannot cryptographically validate, the client retains its last agreed state and enters `quarantined-fork`; the service conversation enters `suspended` after corroborated evidence or operator confirmation. Neither side rewrites, skips, or renumbers the accepted log. Recovery provisions a fresh `conversation_generation` and MLS group from fresh KeyPackages, the last independently verified policy/roster, and a signed predecessor/quarantine statement. Live secrets from the damaged generation are never transplanted. A client claiming failure cannot by itself cause other clients to accept a replacement group; the recovery authorization and transparency evidence are independently verified.

### 7.5 Availability and retention

The service provides at-least-once ciphertext delivery with application-level idempotent presentation. Push and WebSocket loss MUST NOT lose messages. Acknowledged envelopes MUST survive a process crash and a single-zone failure within the production RPO defined in the launch gates.

Ciphertext and attachment retention are product policy, not a cryptographic erasure guarantee. Expiry deletes service copies after the configured window; it cannot delete recipient devices, exports, backups, bridge copies, screenshots, or previously obtained keys.

## 8. Entitlement-driven membership

Each policy revision MUST define independently:

- discovery, contact-request, join, read-new, read-backlog, send, invite, broadcast, export, and history rights;
- current-holder, held-at-snapshot, historical-purchaser, beneficiary, or other semantics;
- chain, contract, project, token/item/order identifiers and adapter version;
- the release-approved meaning of a finalized block; while ENG-004 is open, neither a `safe` head nor a depth/time heuristic may create or extend a lease;
- refund, dispute, transfer, delegation, custody, wrapping, bridging, loan, and grace behavior;
- recheck cadence, expiry, and failure behavior.

Discovery indexers may identify a candidate. Admission requires canonical evidence at a stored block number and block hash or a verified signed commerce receipt. The entitlement service issues a short-lived, single-use capability bound to the account, installation key, conversation, policy ID/revision, evidence hash, nonce, issue time, and expiry.

### 8.1 External Add or Remove

1. The entitlement service signs a public MLS Add or Remove proposal using a credential already listed in `external_senders`.
2. The proposal is bound to the canonical authorization record, published in the independently authenticated signed policy/proposal log, and submitted idempotently to the Delivery Service.
3. Every member client verifies the external credential, proposal type, target leaf or KeyPackage, policy revision, evidence, finality, nonce, and expiry.
4. The Delivery Service sets `membership_pending`. A pending loss of read eligibility freezes new old-epoch application submissions and delivery to the target installation. This is defense-in-depth: clients independently discover the policy head and proposal even if the Delivery Service suppresses them.
5. The next eligible online member verifies the latest policy head, obtains any missing proposal from the independent log, and commits all mandatory proposals before sending application content. For Add, the Welcome is placed in the new installation's mailbox.
6. The Delivery Service atomically advances coordination state after canonical acceptance; clients advance only after cryptographic validation.

The entitlement service cannot Commit or decrypt because it has no MLS leaf or group secret. If no eligible member is online, the group remains paused. Immediate automated cryptographic removal would require an always-online plaintext-capable member and is outside the default trust model.

Server-side delivery denial is useful containment but is not cryptographic revocation. A malicious Delivery Service can withhold messages or proposals, but it cannot make a compliant sender seal while a newer independently signed removal intent is pending. If both delivery and policy-freshness endpoints are unavailable, sending fails closed. A removed user retains everything learned before the removal Commit. A newly eligible user receives future epochs only.

### 8.2 Failures and races

- New admissions fail closed when canonical evidence is unavailable.
- A chain reorg or reversed purchase after admission produces a new policy decision and, if required, a Remove proposal; it cannot erase past access.
- Time-of-check/time-of-use races are bounded by short capability expiry and recorded finalized block/hash.
- If an Add and Remove for the same account race, the later canonical policy revision wins; older-revision proposals are rejected.
- Blocking and explicit opt-out win over otherwise valid eligibility.
- A project-role loss invalidates active role sessions immediately and triggers removal from every group where the device no longer has read rights.
- External-sender key rotation follows section 6.1's fresh-generation migration. It never mutates the predecessor extension or treats an ordinary member Commit as signer replacement; credential and migration deadlines are monitored before the last authorized in-group signer becomes unusable.

## 9. Account and device lifecycle

### 9.1 Enrollment

Each installation generates two independent local credentials: a non-exportable P-256 `installationAuthKey` for ES256 DPoP and possession, and the suite-`0x0001` Ed25519 `mlsCredentialKey` plus MLS/HPKE material. The wallet signs only the server-issued SIWE or EIP-712 enrollment challenge binding the exact service origin/URI, audience/client/environment, chain-qualified wallet/account, preallocated installation and device-credential IDs, action/purpose/project/scope, canonical P-256 JWK and RFC 7638 JKT, Ed25519 public key/fingerprint, exact initial ordinary KeyPackage reference and SHA-256, protocol profile, nonce, issue time, and expiry. The P-256 key separately signs a terminal one-use possession challenge; the MLS KeyPackage signature is verified under the MLS profile and is not treated as the possession proof. EOA, [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271), and [ERC-6492](https://eips.ethereum.org/EIPS/eip-6492) verification are required for supported EVM accounts. Generic reusable `personal_sign` blobs are prohibited.

Both challenges are terminally claimed before expensive verification. A session is returned only after one atomic operation persists the immutable, expiring, server-signed device credential, the initial KeyPackage, its revocation version, and a witnessed Key Transparency directory append. A session or KeyPackage that does not reference that active credential is invalid. Reinstall, recovery, suspension, revocation, or supersession never reuses either installation key or the initial package.

Ordinary requests use short-lived, device-bound sessions and device signatures. Wallet approval is reserved for enrollment, wallet linking/rotation, recovery, and other explicit high-risk actions.

The lifecycle is:

```text
unregistered -> pending-verification -> active -> suspended -> revoked
                                          |          |
                                          +-> rotated+
```

A revoked installation ID or private credential is never reactivated. A replacement is a new installation. Wallet revocation and device revocation are independent.

Device additions and key changes MUST be entered in Key Transparency and shown to existing devices. Existing-device QR/deep-link cross-approval is preferred. Wallet plus a separate recovery factor and delay is the fallback. High-risk accounts SHOULD require an existing device or organizational quorum.

Key Transparency MUST provide signed tree heads, inclusion and consistency proofs, persisted client checkpoints, checkpoint gossip, and at least one independently operated witness/monitor. A split view, rollback, or unexplained device blocks sensitive sends.

### 9.2 Lazy multi-device join

A new device joins an account-private self-sync group carrying encrypted conversation inventory and settings. It does not receive copies of other groups' live MLS state.

Each conversation is marked `device_pending`. The leaf is added:

- when the conversation is opened;
- before that device's first send;
- by an existing own device or active counterparty before the next inbound message;
- by a rate-limited background sweep for recent or high-priority conversations.

The identity service may issue an external Add proposal for a transparently enrolled device, but an existing group member must validate and commit it. Until then, the UI states that the device is waiting for admission; it does not silently omit undecryptable messages.

Removal is eager. The service revokes the session and push token, denies mailbox delivery, submits idempotent Remove proposals across active groups, prioritizes recent/high-value groups, and exposes completion state. Cryptographic future confidentiality begins only after each group's Commit.

### 9.3 Project and organization continuity

A project organization has a stable service account and individually delegated staff devices. A Safe or DAO wallet represents the organization, not each signer. Current project authority or a service-scoped delegation is required to add staff.

An onchain ownership transfer MUST NOT silently transfer old private conversations or archives. The product policy must distinguish a conversation with a person from a conversation with an organization. Historical handover, if offered, is an explicit client-side encrypted transfer with participant notice.

## 10. Local state, history, and recovery

Live MLS state is single-writer mutable security state. Native clients MUST encrypt the local database with a random key sealed by the platform keystore. Web clients MUST use a dedicated-origin worker and encrypted IndexedDB; this reduces storage exposure but cannot protect an unlocked session from same-origin script compromise.

Browser/WebCrypto storage does not guarantee hardware backing, forensic secure deletion, or zeroization. Forward-secrecy claims therefore apply to later compromise of logically erased live state, not to an adversary that retained historical disk, browser-profile, OS-backup, or memory snapshots.

Generic device backup and OS restore MUST NOT restore live MLS state. On detecting rollback, duplicated installation credentials, impossible generations, or an older state counter, the client suspends sending and performs a new-device rejoin.

MLS gives a newly joined leaf no pre-join history. History restore is separate:

- Preferred: authenticated direct transfer from an existing device.
- Optional: an immutable archive of retained decrypted events re-encrypted under a fresh random recovery root before upload.
- Imported history is read-only data and MUST NOT replace live group state, sender generations, KeyPackages, pending commits, or replay caches.
- The recovery root MUST NOT be derived from a wallet signature. It is protected by a recovery code, passkey/hardware-assisted flow, or a separately reviewed password protocol.
- Wallet-only account recovery does not recover message history.
- Archive manifests are versioned, signed, rollback-detectable, and deduplicated against live events by authenticated `event_id`.

Recoverable history weakens practical forward secrecy if the archive key is compromised. The product MUST choose and clearly label a strict no-cloud-history default or an optional recoverable-history default before launch.

## 11. Encrypted attachments

For every attachment, the client MUST:

1. Create the client-generated application `event_id`, choose the attachment ordinal, and generate a fresh random file key.
2. Encrypt independent bounded chunks with an approved AEAD and unique nonces derived through the reviewed library construction. AAD binds the protocol version, conversation/group, `event_id`, attachment ordinal, chunk index/count, and exact lengths.
3. Submit only ciphertext length/hash to the upload-creation endpoint, receive the server-generated UUIDv4 `attachment_id` and random object capability/path, upload the exact ciphertext, and finalize it before sealing the application event.
4. Authenticate a canonical manifest containing algorithm/version, `attachment_id`, object descriptor, chunk order, plaintext and ciphertext lengths, per-chunk or complete digest, and optional padding bucket.
5. Encrypt filename, MIME type, dimensions, duration, caption, thumbnail, EXIF, and accessibility metadata inside that manifest when present.
6. Place the file key and manifest inside the MLS application event and bind the finalized attachment to the accepted envelope atomically. Object delivery serves only `application/octet-stream` ciphertext.

The service MUST NOT deduplicate based on plaintext or reuse attachment ciphertext when forwarding. Signed URLs are delivery capabilities, not revocation. Previews and metadata stripping occur client-side. Clients validate size/type before upload and after authenticated decryption, sandbox risky parsers, and reject active content and decompression bombs.

Strict E2EE is incompatible with ordinary server-side malware scanning or transcoding. A scanner, bot, search service, translator, or compliance archive may participate only as a named plaintext-capable endpoint.

## 12. Push notifications

Push payloads contain only a generic wake reason and a randomized, device-bound opaque sync hint. They MUST NOT include the sender, project, wallet, order, case, conversation, group, message text, attachment name, stable collapse key, or exact sensitive badge count.

The client fetches mailbox ciphertext and decrypts locally. Lock-screen previews are opt-in and rendered on-device. Push loss, delay, duplication, collapse, rotation, or post-revocation delivery is harmless to correctness. Push extensions MUST NOT mutate live MLS state concurrently with the main application.

Push-token data is stored separately from wallet and eligibility data, rotated, expired, and deleted on logout/revocation. A no-push polling mode is supported.

## 13. First-party web and mobile clients

The canonical web client is a top-level installable PWA at a dedicated origin with:

- a nonce- or hash-based CSP with no `unsafe-inline` or `unsafe-eval`;
- Trusted Types where supported;
- no advertising, tag manager, session replay, or unnecessary third-party JavaScript;
- `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, a restrictive Permissions Policy, HSTS, and authenticated `no-store` responses;
- a no-cache service worker that never stores plaintext or authenticated API responses;
- a reviewed dependency lockfile, reproducible build, signed release provenance, and emergency rollback procedure.

An embedded client is a cross-origin iframe served by the messaging origin. Its parent interface is a strict allowlisted, versioned `postMessage` protocol for non-secret intent, readiness, close requests, and coarse unread state. Plaintext, keys, history, attachment capabilities, wallet signatures, and recipient rosters never cross to the parent.

The messaging origin controls its `frame-ancestors` allowlist. Users can always open the same conversation as a top-level PWA. Browser storage partitioning may create a separate installation.

A later headless SDK is a distinct trust mode: the host page and every same-origin script become a plaintext-capable endpoint. It MUST be documented and consented as such; it is not equivalent to the isolated client.

Native clients use the same reviewed Rust cryptographic core through generated, narrow Swift and Kotlin bindings. No wrapper may expose raw group secrets. Platform parity and database migration are production gates.

## 14. Abuse and user safety architecture

The service cannot proactively inspect native E2EE content. It MUST provide:

- explicit contact requests and subscription controls;
- block, mute, leave, report, attachment restrictions, and read-receipt controls;
- rate limits by account, wallet, installation, project, recipient, audience, IP/risk signal, and time window;
- broadcast quotas, frequency caps, gradual volume ramp-up, and high-risk reauthentication;
- prevention of wallet/address directory enumeration and bulk KeyPackage scraping;
- metadata-limited abuse signals such as unsolicited attempt volume, block/report rates, rapid device churn, failed proofs, and storage abuse;
- a report flow in which the reporting client explicitly selects and decrypts only the evidence submitted to moderators;
- a separate access-logged report store with a defined retention and appeal process.

Dust or airdropped tokens do not create consent. A server-side bot, AI assistant, translator, moderator, CRM, or archive is permitted only as a visible conversation endpoint.

## 15. WhatsApp and other bridges

WhatsApp Business Cloud API messages and native MLS messages are separate channel types. A normal WhatsApp gateway decrypts at the business/integration endpoint and re-encrypts into the native system; therefore it is not one continuous E2EE conversation.

The service MUST:

- label the channel `WhatsApp relay` rather than `E2EE`;
- never silently add the relay to an existing native thread or backfill history;
- show the business, WhatsApp/Meta, connector, CRM, AI, and human-agent endpoints that can access relay plaintext;
- prefer a tenant-operated gateway and minimize plaintext lifetime;
- exclude webhook bodies from logs, traces, analytics, dead-letter queues, and support tooling;
- bind a phone/provider identity to an account through a short-lived two-channel challenge, not use the phone number as the canonical account ID;
- require separate WhatsApp consent and honor opt-out regardless of token eligibility.

Regional third-party-chat interoperability is not an MVP dependency.

## 16. Protocol and provider evolution

Application objects and stable IDs MUST not embed OpenMLS, database, or transport-provider identifiers. Every ciphertext envelope, event, credential, policy, attachment manifest, archive, and API uses an explicit version.

Transport migration creates a new `conversation_generation` and cryptographic group. The old group or account devices sign a migration statement binding the old and new conversation IDs. Historical content moves only through the encrypted archive mechanism. Live MLS state is never transplanted between providers.

An XMTP adapter may become primary only after satisfying every provider-specific gate in [launch-gates.md](./launch-gates.md), including external-proposal semantics, target-platform parity, group/device limits, complete export, retention, Gateway/payer availability, fees, rate limits, and a documented mainnet SLA.

## 17. Explicit non-goals

Production v1 does not provide:

- protection after an authorized recipient or active endpoint is compromised;
- prevention of screenshots, copying, forwarding, or deliberate member leaks;
- retroactive revocation of messages or attachments already received;
- hidden membership inside an interactive MLS room;
- server-hidden traffic metadata, audience fanout, IP addresses, timing, or ciphertext size;
- federation, censorship resistance, or guaranteed delivery during a Delivery Service outage;
- a general headless third-party plaintext SDK or public send-as-user API before the first-party dedicated-origin core passes production gates;
- one interactive 1,000/10,000-member private MLS room; large audiences use non-interactive per-account announcement fanout;
- wallet-as-person, proof of legal identity, proof of adulthood, or proof of beneficial ownership;
- wallet signatures on every message or general legal non-repudiation;
- automatic old-history access for new holders, devices, staff, or project owners;
- server-side plaintext search, previews, moderation, malware scanning, AI, translation, CRM, or compliance archiving without a named endpoint;
- native E2EE continuity through an ordinary WhatsApp Business API bridge;
- a post-quantum MLS claim before a standardized, audited suite is adopted;
- security for the development-only invitation, SQLite, HTTP LAN, base64 simulated-envelope system.
