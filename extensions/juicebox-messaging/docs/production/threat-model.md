# Production threat model

Status: normative security analysis for the production target, version 0.1, 2026-08-14.

This model applies to the architecture in [architecture.md](./architecture.md). It describes what the system protects, the adversaries it considers, required mitigations, and accepted residual risks. It is not a claim that the current prototype implements those protections.

## 1. Security objectives

The production system is designed to provide:

1. **Content confidentiality:** only current authorized MLS member installations can derive native message and attachment keys.
2. **Endpoint authentication:** a recipient can determine which enrolled installation sent an event and which scoped account/project role it held.
3. **Membership integrity:** additions and removals are bound to a current signed policy decision and become effective through a validated MLS Commit.
4. **Forward secrecy and post-compromise recovery:** compromise of current state should not expose erased old epochs, and an honest Update/Commit after compromise should recover future confidentiality, subject to endpoint and stale-member limitations.
5. **Transcript integrity:** replay, conflicting idempotency IDs, unauthorized event kinds, invalid state transitions, and stale roster-sensitive disclosures do not alter the canonical client view.
6. **Safe asynchronous operation:** network retry, offline delivery, duplicate/reordered packets, concurrent commits, process crashes, and reinstall do not reuse cryptographic state or silently lose acknowledged data.
7. **Recoverable account control without silent history compromise:** account/device recovery and history recovery are distinct and detectable.
8. **Metadata minimization:** the service collects, exposes, joins, and retains only metadata required for delivery, authorization, abuse controls, operations, and law.
9. **User agency:** eligibility never overrides consent, block, leave, report, or channel-boundary warnings.

Availability is an operational objective, not an E2EE property. An operator, network, participant, wallet provider, RPC provider, or push provider can delay or prevent communication.

## 2. Assets and data classification

| Class | Examples | Required handling |
|---|---|---|
| Cryptographic secret | MLS private keys and epoch secrets, device signing keys, attachment keys, recovery root, wallet private key | Endpoint-only; never server logs, analytics, crash dumps, push, URL, or support tooling |
| Restricted plaintext | Messages, shipping addresses, tracking codes, decrypted files, archive contents, reports, WhatsApp relay content | Native content endpoint-only except explicit user reports or named bridge/archive endpoints |
| Sensitive identity/authorization metadata | Wallet links, device roster, project role, purchase/holder status, policy evidence, phone mapping | Encrypted at rest, least privilege, audited access, purpose-specific retention, separated stores |
| Sensitive traffic metadata | Conversation membership, group ID, IP, timing, size, push token, fanout, cursor, attachment access | Minimize, segregate, retain briefly, never describe as anonymous |
| Public or externally observable | Onchain transactions, public project metadata, public contract roles | Still personal data when correlated; do not indiscriminately join or republish |
| Security evidence | Transparency entries, signed policy heads, proposal/commit hashes, release provenance, audit logs | Append-only or tamper-evident, access controlled, retained to support incident analysis |

An object being encrypted does not make its metadata non-sensitive. A wallet address being public does not authorize arbitrary profiling or communication.

## 3. Trust-boundary map

```text
wallet / passkey
       |
       v
first-party client endpoint <----> other authorized client endpoints
       |          MLS ciphertext and public handshakes
       v
Delivery Service ----> ciphertext database / object store
       |                         |
       +----> opaque push -------+

identity + Key Transparency ----> device credentials
entitlement + signed policy log -> external MLS proposals
finalized RPC adapters ----------> entitlement decisions

optional WhatsApp gateway / archive / bot = separate plaintext endpoint
host application around cross-origin iframe = untrusted parent
same-origin headless-SDK host = trusted plaintext endpoint
```

### 3.1 Trusted endpoint boundary

Plaintext exists in the first-party client process and in every authorized recipient process. Native OS security, browser security, extensions, accessibility tooling, screen capture, memory inspection, local backups, and client release integrity are therefore material.

Cross-origin iframe isolation prevents the ordinary parent page from reading child DOM/storage, but it does not prevent overlay, visual spoofing, timing observation, navigation, or a compromised browser. A same-origin SDK has no such isolation: the host is an endpoint.

### 3.2 Service boundary

The Delivery Service is trusted for best-effort durable ordering and availability but not for content confidentiality. It can observe metadata and can drop, delay, replay, reorder, fork, or deny messages. It must not be the only source of membership-revocation truth.

The Identity/Authentication Service can attempt to substitute or add device keys. Wallet/account-root signatures, existing-device approval, visible changes, and Key Transparency make this detectable; they do not protect a client that ignores verification failures.

The entitlement service is trusted to evaluate configured policy against its recorded evidence. Its external-sender signing key cannot decrypt or Commit, but compromise can create bogus Add/Remove proposals, cause denial-of-service, or exploit clients that fail to validate policy evidence.

### 3.3 Participant boundary

Any legitimate participant can retain, leak, retype, screenshot, sign, or forward plaintext. MLS membership is read authorization, not a digital-rights-management system. Application roles limit accepted events; they cannot stop a reader from learning content already delivered.

## 4. Adversaries and assumed capabilities

The model includes:

- A remote unauthenticated attacker probing APIs, invitations, wallet addresses, KeyPackages, attachment paths, and rate limits.
- An authenticated but unauthorized account, former holder, refunded buyer, revoked staff member, removed device, or blocked sender.
- A malicious current member sending malformed, replayed, unauthorized, abusive, or availability-damaging events.
- A compromised wallet with uncompromised chat devices, or a compromised chat device with an uncompromised wallet.
- A stolen, restored, rolled-back, cloned, rooted, or jailbroken device.
- XSS or dependency compromise in the messaging origin or an embedding host.
- A malicious browser extension, OS, wallet provider, or build/release dependency.
- A malicious or compromised Delivery Service, database administrator, object-store operator, push provider, RPC/indexer, entitlement signer, or Identity Service.
- Network observers and active network attackers, subject to correctly validated TLS.
- Chain reorgs, RPC disagreement, contract upgrades, smart-wallet signer changes, and adversarial token mechanics.
- Spam campaigns, Sybil accounts, dust/airdrop tokens, enumeration, storage denial-of-service, malicious attachments, and fraudulent reports.
- A WhatsApp/CRM/AI connector or business operator with legitimate access to relay plaintext.
- Legal process and compelled access to data actually held by the service.

The model does not assume that wallet control proves a human identity, beneficial ownership, age, legal capacity, or uncompromised intent.

## 5. Threat analysis

### TM-01: Server or network reads native content

**Attack.** A Delivery Service operator, database leak, object-store compromise, push provider, proxy, CDN, observability vendor, or network attacker attempts to recover message or attachment plaintext.

**Required controls.** MLS encryption occurs before submission. Attachments are client-encrypted under fresh per-file keys whose descriptors travel inside MLS. TLS is still mandatory. Push contains no content. No plaintext enters server logs, traces, caches, analytics, error queues, or backups. Server data snapshots and telemetry are continuously scanned for plaintext canaries.

**Residual risk.** Endpoint compromise, voluntary reports, named plaintext endpoints, ciphertext length, timing, and access patterns remain.

### TM-02: Identity Service inserts a ghost device

**Attack.** A compromised Identity Service replaces a recipient key or registers a device controlled by the operator.

**Required controls.** Device enrollment is signed by the wallet/account root and preferably an existing device; entries are append-only in Key Transparency; clients verify inclusion and consistency; additions are visibly announced; high-risk users can compare QR/safety codes. A new device still requires a validated MLS Add/Commit.

**Residual risk.** A malicious service can target a client that accepts transparency failure, colludes with a compromised wallet, or distributes malicious first-party client code.

### TM-03: Delivery Service suppresses a removal

**Attack.** The Delivery Service hides a signed Remove proposal and continues accepting messages in an epoch containing an ineligible member.

**Required controls.** The entitlement service publishes a monotonic signed policy head and proposal log through an independently authenticated endpoint or transparency log. Before sealing, every sender fetches or proves freshness of that head and fails closed if it is stale, unavailable, or has an uncommitted mandatory removal. The next eligible sender obtains the proposal independently and commits it. DS-side `membership_pending` freeze is defense-in-depth, not the sole control.

**Residual risk.** An adversary able to block both delivery and entitlement freshness can deny availability. An authorized member can always disclose content out of band.

### TM-03A: Entitlement signer rotates, expires, or is compromised

**Attack.** An external-proposal signer or separate policy-head signer is compromised; the service self-authorizes a replacement external sender, continues using a retired key, rolls signer state back after restore, or uses emergency rotation to insert a plaintext-capable member.

**Required controls.** External-proposal and policy-head signing use separate domain-scoped credentials that cannot substitute for one another. Groups pre-provision independently logged current and staged-next proposal-signer credentials. Signer status comes from a monotonic witnessed policy log, not group presence alone. Scheduled rollover creates a fresh conversation generation under bounded deadlines. Compromise produces an offline-root-authorized revocation, policy-head/send freeze within five minutes, and fresh-generation migration. The service cannot issue an external GroupContextExtensions proposal or Commit; failed migration remains unavailable rather than reverting.

**Residual risk.** A compromised proposal signer can attempt unauthorized proposals until revocation is observed; a compromised policy-head signer can attempt false freshness/authority statements. Independent logging makes these actions detectable but does not prove the underlying entitlement was honest. Compromise of the authorization keys/root, witness view, or client update path can defeat application authorization and deny availability even though it still does not reveal existing MLS epoch secrets.

### TM-04: Delivery Service forks or reorders MLS state

**Attack.** The service presents different commits or transcript order to different devices, replays an old envelope, accepts simultaneous commits, or lies about the canonical epoch.

**Required controls.** One append-only per-conversation sequence, epoch compare-and-swap, immutable envelope hashes, staged commits, client cryptographic validation, cross-device signed transcript checkpoints/gossip, replay caches, and quarantine of invalid handshakes. Losing committers discard pending state and resync. Application reducers use authenticated event IDs and canonical order.

**Residual risk.** A malicious service or insider can deny service. Fork detection does not itself restore availability; recovery may require a new conversation generation.

### TM-05: Crash, retry, or multi-tab state reuse

**Attack.** A process crashes between encryption and persistence, retries by re-encrypting, restores a stale database, two browser tabs advance one sender state, or an expired/ambiguous plan returns an already disclosed KeyPackage to inventory.

**Required controls.** Persist new MLS state, exact ciphertext, and outbox record atomically before submission; retry exact bytes; stage commits until canonical acceptance; detect rollback; one local writer per installation; SharedWorker/Web Lock or separate leaves for tabs; supported storage migrations are transactional and kill-tested. Returning KeyPackage bytes to one plan is a terminal atomic take; abort, expiry, ambiguity, and restore never make that package available again.

**Residual risk.** Unsupported filesystem cloning or OS restore forces installation suspension and rejoin, potentially losing unsent content.

### TM-06: Stale or removed device reads future content

**Attack.** A stolen, offline, refunded, or revoked installation retains an old epoch and receives new messages.

**Required controls.** Immediate session/push/mailbox denial, independently visible signed removal intent, sender-side fail-closed freshness, mandatory Remove Commit before new application sends, periodic Update commits, and stale-device eviction. The UI reports per-conversation revocation completion.

**Residual risk.** Removal cannot retract previous content. If no honest member is online, cryptographic removal cannot complete and the conversation remains paused.

### TM-07: Unauthorized device addition or history inheritance

**Attack.** An attacker proves wallet control, recovers an account, buys a transferred token, joins staff, or becomes project owner and expects old content.

**Required controls.** New installation, new leaf, visible enrollment, separate recovery factor, policy-specific Add proposal, no pre-join MLS history, and no automatic archive handover. Project ownership transfer and organization history transfer are explicit product actions.

**Residual risk.** An existing authorized endpoint can voluntarily export or resend old content.

### TM-08: Entitlement or chain evidence is wrong

**Attack.** A reorg, stale indexer, compromised RPC, flash loan, wrapper, bridge, rental, escrow, delegation, router attribution bug, mutable item metadata, refund, or smart-wallet change produces the wrong authorization.

**Required controls.** Discovery/indexer data is non-authoritative. Versioned source adapters verify finalized canonical receipts and roles, record block number/hash and payer/beneficiary semantics, cross-check critical evidence, use short capabilities, and reevaluate changes. Policies explicitly cover custody, transfer, refund and grace semantics. Smart-wallet signatures are checked with ERC-1271/6492 at the relevant state.

**Residual risk.** Every business rule has ambiguity. A corrected removal protects only future epochs.

### TM-09: Wallet authentication is replayed or misbound

**Attack.** A generic signature is reused across domains, chains, devices, actions, or time; a phishing parent asks for a misleading signature.

**Required controls.** SIWE/EIP-712 statements bind exact domain, URI, chain, account, device-key fingerprint, action, nonce, issue/expiry, and scope. Nonces are single-use. The dedicated messaging origin owns the signing flow. Ordinary messages use device credentials, not wallet signatures.

**Residual risk.** A malicious wallet UI or compromised device can induce a valid unwanted signature. High-risk changes use delay and existing-device/quorum confirmation.

### TM-10: MLS member exceeds application role

**Attack.** A customer emits `tracking.v1`, revoked staff marks an order shipped, a staff device substitutes an address, or duplicate IDs alter an earlier state.

**Required controls.** After MLS authentication, every client validates the scoped role credential and its subject, policy revision, event schema, authorization matrix, stable IDs, exact versions, and state transition. First authorized event ID in canonical order wins. Sensitive shipping data is bound to the exact reviewed roster and epoch. `shipped` is terminal; a correction is a separate event and cannot create another fulfillment.

**Residual risk.** A currently authorized project staff member can perform permitted actions dishonestly; organizational process and audit evidence remain necessary.

### TM-11: Large announcement exposes recipients or keys

**Attack.** A giant group reveals the roster, a server-side fanout worker holds a shared key, an audience includes dusted/non-consenting addresses, or one campaign key is reused.

**Required controls.** Announcements use a fresh encrypted body and one MLS key envelope per consented recipient account. If an account has several relationship security domains, the immutable target snapshot selects exactly one compatible domain and binds its scope/policy hash. Only consented registered accounts are eligible. Envelope construction occurs on a business endpoint, is resumable/idempotent, and never creates one audience roster. Every campaign uses a fresh key.

**Residual risk.** The Delivery Service observes the fanout and common object access. A recipient can leak the common campaign body/key after receipt.

### TM-12: Browser host or script steals plaintext

**Attack.** Juicebox Money, Revnet Money, a tag manager, XSS payload, malicious dependency, service worker, extension, or operator-delivered web update reads keys or plaintext.

**Required controls.** Dedicated origin, strict CSP and Trusted Types, no third-party scripts, cross-origin iframe, minimal `postMessage`, no secret parent messages, no-cache service worker, encrypted local database, single crypto worker, reproducible builds, dependency review, and top-level/native option. The messaging origin controls `frame-ancestors`.

**Residual risk.** A repeatedly downloaded web client trusts code served by the operator. A hostile parent can visually spoof or overlay an iframe. Browser, extension, OS, and active same-origin compromise defeat endpoint confidentiality. WebCrypto and browser storage do not guarantee hardware backing, forensic deletion, or zeroization; an adversary retaining historical profile, disk, memory, or OS-backup snapshots may recover material that the live application logically erased.

### TM-13: Attachment attacks

**Attack.** Guessable object path, nonce reuse, ciphertext swapping, size leak, parser exploit, polyglot/active content, decompression bomb, storage exhaustion, tracking link, or malicious preview.

**Required controls.** Random IDs and per-file keys, reviewed chunked AEAD with authenticated manifests, client-side MIME/size checks and metadata stripping, no plaintext deduplication, sandboxed previews, conservative type allowlist, quotas, orphan cleanup, disabled server link previews, and authenticated completion before plaintext release.

**Residual risk.** Ciphertext size/access leaks remain. E2EE prevents ordinary server antivirus; recipients remain exposed to content they choose to open.

### TM-14: Push leaks or corrupts state

**Attack.** Push reveals sender/project/order, provider correlates recipients, stale token notifies a revoked device, or a notification extension races the main client.

**Required controls.** Generic device-bound wake payload, local fetch/decrypt, no stable conversation field, token rotation/deletion, polling option, and a single MLS writer. Push is never authoritative.

**Residual risk.** Provider and service observe token, timing, IP, and approximate traffic. Notification timing can identify relationships statistically.

### TM-15: Recovery archive defeats forward secrecy

**Attack.** The server resets keys, wallet proof alone downloads history, a weak password is guessed offline, a stale archive rolls live state back, or a stolen recovery root exposes all retained history.

**Required controls.** Account and history recovery are separate; archive root is random and never server-known; existing-device transfer is preferred; imported data is read-only; manifests are signed and rollback-detectable; no live MLS state is restored; additions are visible; recovery is delayed and rate-limited.

**Residual risk.** Any recoverable archive concentrates retained-history risk. Loss of every endpoint and recovery secret makes strict-mode history unrecoverable.

### TM-16: Metadata correlation and privacy overclaim

**Attack.** Service tables or operators correlate wallet, purchase, community membership, IP, device, phone, push token, message timing, attachment access, and audience membership.

**Required controls.** Tenant-scoped opaque IDs, pseudonymous MLS credentials, data-store separation, least-privilege joins, purpose and retention limits, access audit, generic push, no onchain phone/message hashes, privacy notices, data inventory, and DPIA/privacy review.

**Residual risk.** Content-private MVP is not metadata-private. Server-side routing and entitlement evaluation necessarily reveal relationships unless a later anonymous-credential/oblivious-delivery architecture is adopted.

### TM-17: Abuse inside E2EE

**Attack.** Spam, harassment, phishing, unsolicited token-holder campaigns, malicious files, Sybil churn, KeyPackage enumeration, fabricated reports, or illegal content.

**Required controls.** Contact consent, block/mute/leave, sender/audience/frequency quotas, risk-based reauthentication, attachment restrictions, metadata-limited detection, explicit client-side evidence reporting, moderator access logs, appeal, and staffed legal escalation. Blocks override onchain eligibility.

**Residual risk.** The service cannot proactively inspect native content. Reports disclose selected plaintext, and no abuse system eliminates determined adversaries.

### TM-18: WhatsApp boundary is misrepresented

**Attack.** Users believe a bridged thread remains native E2EE; relay plaintext leaks through Meta, a gateway, CRM, logs, AI, or phone mapping.

**Required controls.** Separate channel/thread, persistent relay label, explicit participant/processors, tenant-owned gateway where possible, minimal plaintext lifetime, log redaction, isolated phone mapping, independent consent, no automatic native-history backfill.

**Residual risk.** Ordinary WhatsApp Business integration necessarily has a plaintext translation endpoint. This cannot be fixed with an MLS wrapper without requiring a separate decrypting client.

### TM-19: Build, dependency, or release compromise

**Attack.** A malicious package, compiler, CI runner, signing key, web deployment, or MLS wrapper exfiltrates secrets or changes cryptographic behavior.

**Required controls.** Pinned dependencies, SBOM, vulnerability monitoring, minimal crypto bindings, reproducible builds, isolated signing, two-person release approval, signed provenance, protected branches, secret scanning, fuzzing, audit, canary rollout, and tested rollback. Debug logging of crypto/content is compile-time disabled in release builds.

**Residual risk.** Software supply chains cannot be made risk-free. Native signatures and reproducibility improve detection; a valid malicious update can still compromise endpoints that install it.

### TM-20: Operational or legal access expands silently

**Attack.** Support tools, backups, exports, analytics, incident response, legal holds, business archives, or new subprocessors gain plaintext or broaden metadata retention without user awareness.

**Required controls.** Data-flow inventory, explicit processor/controller roles, access reviews, retention schedule by data class, break-glass logging, legal-request runbook, change review, user-facing channel/history policy, deletion/export semantics, and prohibition on plaintext collection “just in case.”

**Residual risk.** The service can be compelled to disclose ciphertext and metadata it holds, selected report evidence, and relay/archive plaintext. Recipient copies and public chains cannot be erased by the service.

## 6. Privacy and legal operational requirements

Before any mainnet or real-customer launch, owners must approve:

- A complete record of data flows, subprocessors, storage regions, joins, access roles, retention, deletion, backup expiry, export, and legal-hold behavior.
- A privacy impact assessment covering wallet/purchase/device/community correlation and push/phone mappings.
- Controller/processor allocation for project communications, platform security, abuse, billing, and WhatsApp relays.
- Separate transactional, community, broadcast, and marketing consent rules.
- A policy for minors and age signals; wallet ownership is not proof of adulthood.
- A staffed user-report, urgent safety, lawful-request, appeal, and incident-notification procedure for each launch jurisdiction.
- Accurate copy explaining E2EE, metadata, history recovery, deletion limits, business continuity, reports, and bridges.

Legal review MUST map the actual launch jurisdictions and product behavior. This threat model does not itself establish GDPR, LGPD, DSA, ECA Digital, US reporting, consumer-protection, marketing, records-retention, export-control, or sectoral compliance.

## 7. Residual-risk and non-goal statement

The following are accepted boundaries, not bugs hidden by product copy:

- A compromised or malicious authorized endpoint can read and leak all content available to it.
- A recipient can retain content forever; deletion and removal cannot claw it back.
- An interactive MLS group exposes its pseudonymous roster to members.
- The service sees routing and eligibility metadata and can censor or deny service.
- A malicious Delivery Service can cause availability failure; independent policy freshness prevents it from silently extending a revoked member's authorized send window but cannot force a Commit while all members are offline.
- A malicious Identity Service may succeed against clients that ignore transparency or install operator-controlled malicious code.
- Wallet control is not human identity, beneficial ownership, legal capacity, consent, or age.
- New members and devices do not receive old MLS history by default.
- Cloud history recovery weakens the protection of retained history.
- E2EE precludes ordinary server-side search, content moderation, previews, antivirus, AI, translation, CRM, and compliance archive unless those services become named endpoints.
- Ordinary WhatsApp Business relay traffic is not continuously E2EE with native users.
- The initial system is not federated, anonymous, metadata-resistant, censorship-resistant, or post-quantum secure.

Any product claim that contradicts one of these boundaries is a launch blocker.
