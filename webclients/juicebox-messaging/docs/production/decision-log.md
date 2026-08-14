# Production decision log

Decisions here are intentionally explicit. Changing one requires a dated replacement entry, migration impact, security review, and updated acceptance tests.

## Accepted

### 2026-08-14 — Dedicated-origin client is canonical

The PWA and iframe are served by the messaging origin. Juicebox Money and Revnet Money pass an opaque context capability and receive non-sensitive lifecycle events. A future headless SDK is a separate, weaker trust mode in which the host becomes an E2EE endpoint.

### 2026-08-14 — Native E2EE and provider bridges are different products

Native clients use audited end-to-end encryption. Notification-only third-party adapters may deep-link into native E2EE. A full-text WhatsApp or Telegram relay is permitted only as an explicit, opt-in gateway whose provider and gateway plaintext access, retention, and consent are disclosed in the conversation UI.

### 2026-08-14 — Relationship scope plus purchase cases

A project/customer relationship scope may contain multiple purchase-bound support cases when its complete reader, business-purpose, business-entity, retention, and history policy is identical. The purchase reference is never discarded. Separate relationship scopes and cryptographic groups are required when any of those policy dimensions differs.

### 2026-08-14 — History is not inherited implicitly

New devices, transferred token holders, new staff, and new project owners receive no historical plaintext by default. History restoration or organizational handover is a distinct, explicit cryptographic operation with user-visible scope.

### 2026-08-14 — Theme inputs are semantic and non-executable

Hosts may select a reviewed preset or provide a bounded allowlisted set of color,
typography-category, radius, and density choices. The v1 wire contract deliberately
has no logo-mark field. A future logo-mark enum would require a versioned protocol
change, a server-owned reviewed asset registry, and new privacy/CSP acceptance
evidence. The messaging client does not ingest arbitrary CSS, HTML, script, asset
URLs, or font URLs from an embedder.

### 2026-08-14 — Relationship scopes are cryptographic security domains

A project/customer association may contain more than one concurrent opaque relationship scope. A scope fixes the reader, business-purpose, business-entity, retention, and history policy for its cases and owns one sequential conversation generation at a time. Cases may share a scope only when the complete canonical policy hash matches; a different staff team, business entity, history rule, retention rule, or business purpose requires a separate MLS group. This prevents a convenient one-thread data model from widening access to an older or more sensitive case.

### 2026-08-14 — Record identifiers and content commitments are separate

An external MLS proposal has a UUIDv7 `proposal_id` for record identity and a separate domain-separated 32-byte `proposal_hash` for immutable byte commitment. Membership intents and mandatory-proposal references bind both. Human-readable or database identifiers never substitute for a cryptographic content hash.

### 2026-08-14 — The v1 MLS ciphersuite is fixed

The v1 profile uses RFC 9420 ciphersuite `0x0001`, `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`. Confirmed-transcript and domain-separated SHA-256 commitments are exactly 32 bytes. Supporting another suite requires a new versioned profile and storage schema plus a fresh-generation migration; an implementation may never reinterpret existing bytes under a different suite.

### 2026-08-14 — Opaque and operational identifiers use different UUID profiles

Core identifiers whose creation time is unnecessary metadata use UUIDv4: client-generated application case, event, and transport envelope IDs, and server-generated account, installation, relationship, scope, conversation, campaign, attachment, and immutable policy-head IDs. A case ID exists only inside MLS application plaintext; the delivery service does not index it. Policy-head ordering comes from its signed per-conversation sequence rather than its ID. UUIDv4 contributes 122 random bits after fixed version/variant bits. Operational records whose sortable creation order is part of their contract—requests, plans, membership intents, proposals, and jobs—use UUIDv7. Secret invitation, claim, and context capabilities remain independent 256-bit random base64url values and are never UUIDs.

### 2026-08-14 — v1 counters use a signed-storage ceiling

MLS epochs and service counters retain canonical unsigned 64-bit wire encodings, but the v1 service profile accepts at most `2^63 - 1` so PostgreSQL `bigint` can be used safely on ordered hot paths. Values above the profile ceiling are rejected, never wrapped or coerced. A conversation must migrate to a fresh generation before reaching the ceiling; failure to migrate suspends it. EVM `uint256` values remain canonical decimal strings at API boundaries and use separate exact storage types.

## Open decisions with launch impact

These are not permission to guess. Each has an accountable role, a closure gate, and a fail-closed product state. A named person and dated evidence replace the role before the release record can be approved.

| ID | Decision | Accountable owner | Closure gate | Secure state while open |
| --- | --- | --- | --- | --- |
| ENG-001 | Exact audited MLS release, crypto provider, bindings, and build profile for the fixed v1 ciphersuite after the comparative bake-off | Protocol Security | G1 frozen-profile approval before implementation promotion | Native production messaging remains disabled; the LAN lab remains explicitly simulated |
| ENG-002 | Browser one-writer model for mutable MLS state: fenced shared worker or one installation per tab | Client Platform + Protocol Security | G2 deterministic concurrency and crash gate | No browser build may persist or send real MLS state |
| ENG-003 | Key Transparency log, independent witness/operator, checkpoint gossip, and outage behavior | Identity Security + Operations | G3 identity/transparency gate | New device enrollment and sensitive sends remain disabled |
| PD-001 | Default recovery and history modes, including whether an encrypted archive is opt-in or tenant-controlled | Product + Privacy + Protocol Security | G4 recovery/device-lifecycle gate | Strict no-cloud history; history moves only through an explicit existing-device ceremony |
| PD-002 | Project-staff delegation, threshold/recovery authority, named-reader policy, and ownership-transfer ceremony | Product + Authorization Security | G5 authority gate and the sensitive-fulfillment feature gate | Small explicitly named staff team; no implicit successor-owner or new-staff history |
| ENG-004 | Chain-specific finality thresholds, canonicality recheck cadence, RPC quorum, and exceptional pause rules | Chain Integrations + Authorization Security | Per-chain G5 shadow gate before that chain is enabled | The affected chain cannot issue an eligibility lease |
| PD-003 | Gift, payer/beneficiary mismatch, partial refund, chargeback, dispute, split-fulfillment, and support-window semantics | Product + Commerce Operations + Privacy | G5 entitlement-policy approval | Fulfillment is beneficiary-only; ambiguous evidence grants no access and requires explicit recovery/review |
| PD-004 | Holder/community eligibility across transfer, delegation, custody, loan, wrappers, bridges, snapshots, and grace periods | Product + Authorization Security | Community feature gate before a holder room is enabled on each chain | Current finalized direct holder only for future access; no historical backlog; ambiguity fails closed |
| PD-005 | Consent scopes for support contact, transactional announcements, community announcements, marketing, and provider bridges | Product + Privacy + Abuse Operations | G5 consent-policy gate and each optional channel gate | Purchase or token ownership alone never implies consent; each channel/class requires opt-in |
| PD-006 | Ciphertext, attachment, archive, report, entitlement, traffic-log, and backup retention, plus attachment formats, malware/report workflow, and preview sandbox | Product + Privacy + Content Security | G6 retention approval and the attachment/archive feature gates | No disappearing-message claim or history archive; attachments and remote previews remain disabled |
| PD-007 | Supported browser/native clients, iframe/headless availability, room/device/campaign caps, and high-risk business requirements | Product + Client Platform + Security | G6 platform/load evidence and the relevant optional client gate | First-party top-level PWA only under provisional ceilings; iframe/headless/native releases remain disabled |
| PD-008 | Launch jurisdictions, age boundary, moderation/report escalation, legal-request handling, and required records | Privacy/Legal + Abuse/Safety | G6 operational/privacy gate | Unapproved jurisdictions, minors, and regulated use remain unsupported |
| PD-009 | Whether WhatsApp or another provider bridge is notification-only or full-text, who operates it, and its consent/retention model | Product + Privacy + Partner Operations | GX connector gate for each provider | Provider bridges remain disabled; a future content-free secure-chat notification is preferred |
| ENG-005 | Measured SLOs, room/device/campaign caps, storage budgets, and autoscaling thresholds | Reliability + Performance | G6 load/restore gate; final values pinned in the signed release manifest | Provisional ceilings may only be lowered; general availability and public SLO claims remain disabled |
