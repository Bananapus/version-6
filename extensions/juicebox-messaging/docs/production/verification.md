# Production verification and launch gates

Status: normative release-gate specification for future production messaging.

This document defines the evidence required before Juicebox Messaging may handle real identities, entitlements, messages, shipping addresses, or production wallet sessions. The current single-device demo, shared HTTP LAN lab, and candidate project preview do not satisfy these gates and must continue to say so.

The words MUST, MUST NOT, REQUIRED, SHOULD, and MAY are used as release requirements. A feature that has not met its gate must be disabled at the server and protocol layers, not merely hidden in the UI.

## Scope and security boundary

The production system under verification includes:

- the dedicated-origin web client and future native clients;
- the owned MLS wrapper and its platform bindings;
- wallet, passkey, session, and device-enrollment services;
- the finalized Juicebox entitlement and project-role evaluator;
- conversation policy, membership, key transparency, and delivery services;
- ciphertext attachment storage, wake-only push, export, deletion, and recovery;
- cross-origin embedding in approved Juicebox and Revnet hosts;
- deployment, monitoring, incident response, and data-lifecycle controls.

WhatsApp, Telegram, email, CRM, AI-agent, or other plaintext bridges are separate products. Their presence in an E2EE conversation makes the bridge a named plaintext endpoint. No native-E2EE launch gate automatically authorizes a bridge.

Normative external references:

- [MLS protocol, RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html)
- [MLS architecture, RFC 9750](https://www.rfc-editor.org/rfc/rfc9750.html)
- [Sign-In with Ethereum, ERC-4361](https://eips.ethereum.org/EIPS/eip-4361)
- [Contract signature validation, ERC-1271](https://eips.ethereum.org/EIPS/eip-1271)
- [Counterfactual signature validation, ERC-6492](https://eips.ethereum.org/EIPS/eip-6492)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [Content Security Policy Level 3](https://www.w3.org/TR/CSP3/)
- [Push API](https://www.w3.org/TR/push-api/)

The release must pin the exact MLS library, provider, ciphersuite, ABI, contract deployment manifest, RPC behavior, client platform versions, and internal protocol revision used to produce its evidence. “Latest” is not an acceptable evidence identifier.

## Gates

| Gate | Environment | What it permits |
| --- | --- | --- |
| G0 | Simulation only | Fictional local demo and HTTP LAN lab. No security, wallet, entitlement, or privacy claim. |
| G1 | Deterministic crypto lab | Real MLS core with synthetic identities and an in-memory/fault-injected delivery service. No wallet or chain admission. |
| G2 | Integrated private devnet | Real device identity, wallet verification, entitlement fixtures, HTTPS, storage, recovery, and operational controls with synthetic data. |
| G3 | Base Sepolia closed alpha | Allowlisted testers and projects; real testnet wallet and entitlement proofs; no production assets or public enrollment. |
| G4 | All supported testnets | Closed beta on Sepolia, Optimism Sepolia, Base Sepolia, and Arbitrum Sepolia. |
| G5 | Mainnet shadow | Production RPC and indexer reads compute decisions but cannot grant membership or deliver messages. |
| G6 | Base mainnet canary | Allowlisted projects and users, bounded traffic, audited E2EE, staffed incident response, and explicit rollback switch. |
| G7 | Per-chain production | One production chain promoted at a time: Base, Optimism, Arbitrum One, then Ethereum unless the release board approves another risk-based order. |
| G8 | General availability | Public enrollment on every individually approved chain and platform. |
| GX | Connector-specific canary | Separately approved WhatsApp, Telegram, CRM, or other plaintext endpoint with its own consent, retention, provider, and incident gates. |

Promotion is monotonic only for a specific release artifact, protocol revision, platform, feature set, and chain. Gates are cumulative: promotion to a target gate requires every applicable row whose earliest gate is that gate or earlier, plus every explicit promotion criterion. Adding a chain, wallet method, native client, recovery mode, bridge, or new MLS ciphersuite requires the relevant gates again.

## Release-blocking invariants

These invariants are P0 and cannot be waived. A disabled feature can pass only if its routes, admission decisions, background jobs, and key paths are unreachable in the release artifact.

| ID | Invariant |
| --- | --- |
| INV-01 | The delivery service, storage service, push providers, logs, analytics, and embedding parent never receive native-message plaintext, attachment keys, shipping addresses, or MLS secrets. |
| INV-02 | Only a finalized, policy-valid entitlement and an authenticated device credential can cause an MLS membership proposal. Discovery/indexer metadata can never grant access. |
| INV-03 | A new member cannot decrypt pre-join history; a removed member cannot decrypt post-removal messages after the removal epoch is committed. |
| INV-04 | Sender participant, device, and role are cryptographically authenticated and cannot be selected or overridden by a message payload or UI state. |
| INV-05 | MLS state and its exact outbox ciphertext advance atomically. A retry reuses the accepted ciphertext and never re-encrypts the same logical send from rolled-forward state. |
| INV-06 | Restored, copied, or rolled-back live MLS state cannot send. Recovery creates a new device leaf and imports only a read-only encrypted history archive. |
| INV-07 | Project ownership transfer, token transfer, refund, or role removal never silently transfers old plaintext history. |
| INV-08 | Production telemetry, caches, URLs, notifications, crash reports, and backups contain zero plaintext PII canaries outside their explicitly documented encrypted data class. |
| INV-09 | A bridged thread is visibly and cryptographically modeled with the bridge as a plaintext endpoint and is never labeled fully native E2EE. |
| INV-10 | Unsupported, stale, ambiguous, unavailable, or conflicting identity/entitlement/crypto evidence fails closed without a weaker fallback. |

## Evidence and pass policy

Every release candidate must produce an immutable evidence bundle at artifacts/verification/<release-sha>/ or an equivalent access-controlled system. Its manifest must contain:

- release commit and build artifact digests;
- dependency lock, SBOM, compiler and platform versions;
- protocol, schema, ABI, deployment-manifest, chain-policy, and feature-flag revisions;
- test command, test ID, deterministic seed, environment, start/end time, and result;
- redacted logs, traces, performance data, screenshots, and chaos timelines;
- external audit and internal security-review references;
- defect links, severity, disposition, owner, reviewer, and expiry for every exception;
- signed approvals from security, cryptography, identity, chain/entitlement, privacy, SRE, accessibility, and product owners.

Pass rules:

1. Every unconditional matrix row is P1. Rows marked “if enabled” are P1 when that feature is present and not applicable only when the feature is unreachable in the shipped server, clients, jobs, and configuration. INV-01 through INV-10 and the automatic no-go outcomes below are P0.
2. All applicable P0 and P1 rows pass on the exact release artifact.
3. Launch-blocking automated suites pass three consecutive times with no retry. A flaky or quarantined test does not count as evidence.
4. Zero critical or high findings remain open in the independent audit, penetration test, dependency scan, or threat-model review.
5. A medium security finding needs a documented compensating control, named owner, expiry of at most 30 days, and security-lead approval. It cannot affect INV-01 through INV-10.
6. Any unauthorized admission, cross-conversation disclosure, plaintext leak, secret reuse, accepted-message loss, unrecoverable fork, or incorrect finalized-chain decision is an automatic no-go regardless of aggregate pass rate.
7. Test evidence older than 30 days, evidence from a different artifact, or evidence produced before a relevant dependency/configuration change is stale.

Execution cadence:

| Lane | Minimum contents | Blocking rule |
| --- | --- | --- |
| Pull request | Deterministic unit/contract tests, known-answer vectors, schema/ABI snapshots, static analysis, focused accessibility, and changed-flow browser tests | Required before merge; zero applicable failure |
| Nightly | Seeded state-machine, replay/fork/offline/rollback, cross-browser, wallet-negative, entitlement differential, PII-canary, migration, and dependency scans | A failure freezes release candidates until triaged and rerun |
| Weekly | Long fuzz/sanitizer, load, backup restore, key/device compromise, provider fault, and selected chaos drills | Required fresh result before G3 and later promotion |
| Release candidate | Entire applicable matrix on signed production artifacts, three consecutive no-retry runs | Required for every promotion |
| Continuous shadow/canary | SLO, finality/RPC agreement, PII canaries, CSP/resource inventory, epoch stalls, entitlement discrepancies, and error budget | Automatic freeze/rollback on a stop trigger |
| Quarterly | Regional disaster restore, credential compromise, deletion-from-backups, incident communication, and accessibility/privacy review | Required to remain at G7/G8 |

The evidence manifest must contain exactly one traceability record for every matrix ID. Each record includes `requirement_id`, applicability and justification, automated test IDs, manual scenario or review ID, environment, artifact digest, artifact paths, owner, independent reviewer, result, completion time, and evidence expiry. An N/A result must include machine-verifiable proof that the feature is unreachable in every shipped layer. Aggregate pass percentages, links to an unfiltered CI job, or a test name without retained output do not satisfy row-level traceability.

## Protocol and cryptography matrix

| ID | Acceptance requirement | Required evidence and objective threshold | Earliest gate |
| --- | --- | --- | --- |
| CRY-01 | Release provenance | Exact OpenMLS/wrapper/provider revisions pinned; signed SBOM and artifact hashes; dependency policy finds zero known critical/high vulnerabilities. | G1 |
| CRY-02 | Independent review | External review covers the wrapper, serialization, state transaction, WASM/native bindings, key storage, update path, and recovery. Zero open critical/high issues. | G3 |
| CRY-03 | Known-answer vectors | 100% of applicable RFC 9420, library, HPKE, AEAD, signature, KDF, transcript-hash, tree-hash, Welcome, and exporter vectors pass on every shipped crypto target. | G1 |
| CRY-04 | Cross-implementation interoperability | A second independent MLS implementation completes create/add/update/remove/external-proposal/commit/Welcome/application-message scenarios for every supported suite. At least 10,000 seeded state-machine transcripts complete with zero secret, epoch, or tree divergence. | G2 |
| CRY-05 | Wire-format strictness | Non-minimal encodings, truncation, overlong vectors, unknown mandatory capabilities, duplicate leaves, malformed extensions, and trailing bytes are rejected. Corpus coverage is 100%; no permissive alternate decode path exists. | G1 |
| CRY-06 | Fuzz and sanitizer campaign | At least 24 CPU-hours of coverage-guided native fuzzing and 12 hours per platform bridge on the release candidate, with sanitizers where available; zero crash, panic across FFI, use-after-free, unbounded allocation, or invariant failure. | G3 |
| CRY-07 | Algorithm policy | Only explicitly configured MLS version/ciphersuite pairs are accepted. Downgrade, GREASE, unsupported credential, and mixed-suite tests all fail or negotiate exactly as specified; no silent fallback. | G2 |
| CRY-08 | Entropy failure | Key, nonce, invitation, and recovery-secret generation uses an approved OS CSPRNG. Fault injection for unavailable, repeated, short, or all-zero randomness stops the operation and emits no key material. | G1 |
| CRY-09 | Forward secrecy | Compromise of current retained state cannot decrypt test messages whose secrets were deleted according to the protocol schedule. 100% of past-epoch negative-decrypt assertions hold. | G2 |
| CRY-10 | Post-compromise recovery | After an honest update/commit, a fixture holding the compromised prior state cannot decrypt future messages. Verified across every platform pairing and configured group size class. | G2 |
| CRY-11 | Secret containment | Memory while unlocked is treated as sensitive; at rest, no unwrapped private key, epoch secret, exporter secret, attachment key, or recovery root appears in browser storage, files, logs, IPC, crash reports, or server traces. Canary scan result: zero. | G2 |
| CRY-12 | Platform parity | The same canonical input produces protocol-equivalent results through Rust native, WASM, Swift, Kotlin, and any React Native binding that ships. 100% vector parity; no platform-only serialization. | G6 for each platform |
| CRY-13 | Maximum supported group | Add/remove/update/send at the configured member/device limit and reject limit plus one before allocation or state mutation. Zero divergence and peak memory below the documented client budget. | G4 |
| CRY-14 | Cryptographic reportability | Authentication failures, invalid commits, and fork evidence produce non-secret diagnostic codes. Tests prove errors reveal no plaintext, key bytes, signature input, or wallet nonce. | G2 |

## Delivery, roster, fork, replay, and rollback matrix

| ID | Acceptance requirement | Required evidence and objective threshold | Earliest gate |
| --- | --- | --- | --- |
| PRO-01 | Exact roster binding | Sensitive events bind the authenticated group ID, epoch, roster version, and exact unique device credentials. Every missing, additional, duplicate, reordered, or substituted credential case is rejected. | G1 |
| PRO-02 | Add history boundary | A device added at epoch N cannot decrypt or fetch usable application history from epochs before N unless the user separately imports an encrypted read-only archive. 100% negative-decrypt result. | G2 |
| PRO-03 | Removal boundary | Once a required remove proposal is committed, old-epoch sends are rejected and the removed device cannot decrypt new messages. Delivery containment begins before commit; UI shows the pending-removal state. | G2 |
| PRO-04 | Mandatory membership changes | A sender cannot skip a current externally authorized Add/Remove proposal. Tests cover a malicious client, stale client, offline client, and compromised delivery service. All fail closed. | G2 |
| PRO-05 | Concurrent commits | At least 10,000 seeded two- through ten-committer races yield exactly one canonical commit for an epoch; losers discard pending state, resync, and converge within two successful sync cycles. Zero permanent fork. | G2 |
| PRO-06 | Delivery-service equivocation | Split-view, withheld commit, inconsistent tree, reordered handshake, and fabricated sequence tests are detected. No application send occurs from an unconfirmed or conflicting epoch. | G2 |
| PRO-07 | Replay and duplicate handling | Replay at least 100,000 accepted and rejected envelopes across reconnects. Each authenticated message ID has one canonical transcript entry and one domain effect; duplicates return the same result or an explicit idempotency conflict. | G2 |
| PRO-08 | Out-of-order and gap handling | One million seeded delivery steps with delay, duplication, reordering, gaps, and pagination produce a complete ordered transcript or an explicit bounded resync state. No infinite loop or silent skip. | G2 |
| PRO-09 | Offline catch-up | Clients offline for 1 hour, 7 days, and the maximum supported retention interval catch up across membership changes and the maximum documented backlog. No missing accepted message and no pre/post-membership disclosure. | G3 |
| PRO-10 | Atomic crash recovery | Failpoints kill the client before and after every durable-state and outbox step, at least 1,000 times per point. Restart yields either the complete prior state or complete next state, never nonce/key reuse, duplicate domain effects, or an unsendable phantom. | G2 |
| PRO-11 | Rollback detection | Restore an older filesystem/browser/native snapshot after newer sends. The client detects the monotonic-state mismatch before encryption and requires safe rejoin/recovery. Zero message is emitted from rolled-back state. | G2 |
| PRO-12 | Multi-tab/process exclusion | Competing tabs, workers, app processes, and restored background tasks cannot independently advance one installation. Exactly one state owner exists or each process is a separately enrolled leaf. | G2 |
| PRO-13 | Sender authentication | Modify sender participant, role, device, timestamp, group, conversation, and address-version metadata independently. Every modification fails authentication or domain authorization. | G1 |
| PRO-14 | Domain idempotency | Address request/share/update/acknowledge/preparing/tracking/shipped/correction transitions are tested under duplicate, replay, and reorder. No old address can be acknowledged or shipped; shipped remains terminal. | G1 |
| PRO-15 | Clock independence | Device clock skew of plus/minus 24 hours cannot bypass nonce, credential, entitlement, or ordering policy. Clock errors become a recoverable explicit state and never change transcript order. | G2 |
| PRO-16 | Bounded synchronization | Pagination count, cursor, envelope size, roster size, retry count, and total catch-up work are bounded. Boundary and boundary-plus-one tests return deterministic errors without unbounded CPU or memory. | G2 |
| PRO-17 | External proposal authority | Forged, expired, replayed, wrong-policy, wrong-chain, wrong-device, and wrong-group external Add/Remove proposals fail. Entitlement-signer rotation has a bounded overlap, transparent log entry, and no interval where both expired and replacement keys can authorize unexpectedly. | G2 |

## Identity, wallet, device, and session matrix

| ID | Acceptance requirement | Required evidence and objective threshold | Earliest gate |
| --- | --- | --- | --- |
| ID-01 | SIWE canonical validation | Validate domain, URI, version, chain ID, nonce, issued-at, expiration, not-before, request ID/resources, statement, and address exactly per the supported ERC-4361 profile. Every independently mutated field is rejected. | G2 |
| ID-02 | Nonce lifecycle | Nonces have at least 128 bits of CSPRNG entropy, expire within five minutes, are audience/action bound, and are consumed atomically once. Concurrent replay test: exactly one success in 10,000 races. | G2 |
| ID-03 | Origin and chain binding | A proof for another host, scheme, port, chain, action, project, device key, or environment cannot create a session. Production proofs are rejected by testnet and vice versa. | G2 |
| ID-04 | EOA signatures | Valid personal-sign/SIWE fixtures pass; bad recovery ID, high-S/malleable, truncated, wrong-message, wrong-address, and alternate-encoding signatures fail. 100% vector result. | G2 |
| ID-05 | ERC-1271 | Test deployed EOAs-as-controls, Safe-style multisigs, proxies, reverting contracts, empty/short/oversized return data, wrong magic value, gas exhaustion, upgrades, and block-tag changes. Only exact valid magic at the configured block succeeds. | G3 |
| ID-06 | ERC-6492 | Counterfactual wrapper/factory/inner-signature combinations cover undeployed, already deployed, invalid factory, wrong deployment, revert, recursion, oversized calldata, and chain replay. Verification is simulated with bounded resources and never broadcasts a deployment. | G3 |
| ID-07 | RPC disagreement | Conflicting contract-code, block-hash, 1271, or 6492 results from independent RPCs produce no session and page the authority monitor. No “first provider wins” path. | G5 |
| ID-08 | Device enrollment binding | Wallet/account approval binds service origin, chain-qualified account, device signing/encryption keys, MLS KeyPackage hash, scopes, nonce, expiry, and protocol version. Substitute each component; all are rejected. | G2 |
| ID-09 | Device visibility and removal | New device, recovery, and removal are shown to every existing device. Session delivery revocation completes p95 under 60 seconds and p99 under five minutes; cryptographic removal is required before the next sensitive send. | G3 |
| ID-10 | Session security | Session fixation, CSRF, duplicate cookies, cross-origin POST, open redirect, token-in-URL/referrer, logout, expiry, concurrent refresh, and theft/reuse tests pass. Auth cookies are Secure, HttpOnly where applicable, SameSite, narrowly scoped, and rotated; every auth response is no-store. | G2 |
| ID-11 | Passkey/recovery policy | If enabled, origin/RP ID, user verification, sign counter policy, discoverable credential behavior, backup eligibility, and recovery delay are explicit. Unsupported or cloned-credential signals fail or invoke a reviewed step-up path. | G6 |
| ID-12 | Enumeration resistance | Wallet, account, device, KeyPackage, project staff, and recovery endpoints do not reveal registration through status, timing, size, or rate-limit differences beyond the published model. Statistical test finds no classifier above the agreed 55% ceiling over 10,000 balanced trials. | G3 |
| ID-13 | Brute force and abuse | Per-IP/device/account/project limits, proof cost, lockout/backoff, and alerting withstand ten times expected hostile request rate without starving existing sessions. Correct 429/Retry-After; no bypass by header rotation. | G3 |
| ID-14 | Reauthentication | High-risk device addition, recovery, export, deletion, bridge linking, and project-admin changes require recent proof and display the exact action. A general messaging session cannot silently authorize them. | G3 |
| ID-15 | Key transparency | Device-directory inclusion and consistency proofs, append-only checkpoints, key rotation, omission, stale view, and split-view gossip are tested. A ghost or equivocated device cannot enter a group; at least 10,000 seeded directory histories yield zero undetected inconsistency. | G3 |
| ID-16 | User control overrides entitlement | Block, leave, mute, invitation decline, announcement unsubscribe, and bridge opt-out are explicit. Block/leave/opt-out always wins over payment, token ownership, project ownership, or staff role; all precedence permutations pass. | G3 |

## Finalized entitlement, reorg, refund, and project-role matrix

Indexer data is discovery/display input only. Admission uses canonical RPC evidence, pinned ABIs and deployment addresses, a versioned policy, and a chain-specific finality rule.

| ID | Acceptance requirement | Required evidence and objective threshold | Earliest gate |
| --- | --- | --- | --- |
| ENT-01 | Chain and deployment allowlist | Exact v6 contract deployments and ABIs are pinned for chain IDs 1, 10, 8453, 42161, 11155111, 11155420, 84532, and 421614. Wrong chain/address/version and same-address-other-chain fixtures fail. | G3 |
| ENT-02 | Canonical purchase receipt | Verify successful receipt, canonical block/hash, expected emitting contract, event signature, project ID, terminal/hook, payer/beneficiary, item/tier identifiers, quantities, currency/value, and policy-specific fields. Mutate each field; no grant. | G3 |
| ENT-03 | Finality rule | Every enabled chain has a reviewed, release-approved meaning of `finalized`. While ENG-004 is open, a missing or inconsistent finalized result issues no lease; `safe`, `latest`, `pending`, and depth/time heuristics cannot create or extend authority. Any future chain-specific alternative requires ENG-004 approval and equivalent canonicality/reorg evidence before enablement. Boundary-before-finality grants zero access; boundary-at-finality is deterministic. | G3 |
| ENT-04 | Independent RPC agreement | Before mainnet admission, two operationally independent RPC sources agree on chain ID, finalized height/hash, receipt, code, and required state. Disagreement or lag beyond policy produces “verification unavailable,” not access. | G5 |
| ENT-05 | Reorg before finality | Controlled alternate branches place a valid purchase/role on the losing branch. The losing proof never grants membership, notification, or history. 100% across each chain adapter. | G3 |
| ENT-06 | Exceptional finalized reorg | Inject a reorg beyond the configured finality assumption. Affected admissions freeze, monitors page within five minutes, new sends stop, evidence is retained, and the incident runbook decides removal/rekey without fabricating history erasure. | G5 |
| ENT-07 | Refund/dispute state | Purchase-support policy explicitly defines pending, verified, refunded, disputed, chargeback, partial refund, replacement, and administrative override. Every transition has a fixture and produces the documented access/history result. No implicit default. | G3 |
| ENT-08 | Token-holder gate | Current-balance, held-at-snapshot, and historical-holder policies are separate versioned types. Transfer, burn, mint, delegation, zero balance, multiple token contracts, and cross-chain representations cannot be confused. | G4 |
| ENT-09 | Shop item/tier gate | Item/tier identifiers, hook/store versions, quantity, gift purchaser versus beneficiary, bundled items, and migrated shops are verified canonically. A purchase of another tier/set grants zero access. | G4 |
| ENT-10 | Project owner/staff role | Owner and delegated staff authorization is evaluated at a finalized block and bound to chain/project/version. Operator removal or owner transfer blocks new privileged actions within the published freshness window. | G3 |
| ENT-11 | Ownership transfer history | Transfer grants future administration only. Old support history is not inherited unless each affected policy and user-facing handover explicitly authorizes a cryptographic transfer. Negative-history tests pass. | G3 |
| ENT-12 | Eligibility freshness | Admission and privileged actions carry evaluated block/hash, policy version, evidence digest, issued time, and expiry. Stale-cache and rollback tests cannot extend authorization beyond the published maximum of five minutes without re-evaluation. | G3 |
| ENT-13 | Indexer contradiction | Bendystraw or other indexer can be stale, unavailable, malicious, duplicated, or contradictory. It may change preview state but produces zero authority effect. Differential tests assert RPC evidence is decisive. | G3 |
| ENT-14 | Provider outage | Timeout, 429, partial JSON-RPC batch, malformed proof, archive-state absence, and provider failover are bounded. New admission fails closed; existing-session behavior follows the explicit policy and cannot exceed its freshness TTL. | G3 |
| ENT-15 | Chain-specific corpus | Each chain has at least 1,000 historical/fixture decisions including 100 negative near-matches and 20 each of reorg, refund, role-transfer, and token-transfer cases. Expected versus actual decisions match 100%. | G4/G5 |
| ENT-16 | Policy explainability | Every decision emits a non-secret reason code, chain, project, policy version, and evaluated block/hash. The UI distinguishes ineligible, pending finality, stale, provider unavailable, revoked, and internal error without exposing private membership. | G3 |

### Product-policy verification

Each conversation policy must specify admission, recheck, history, removal, and consent separately:

| Product | Admission | Recheck/removal | History expectation |
| --- | --- | --- | --- |
| Purchase support | Finalized qualifying purchase and named project staff | Refund/dispute/support-window policy at every privileged action | Purchase-lifetime or documented support window; never transferred to a new owner silently |
| Announcement | Explicit subscription plus qualifying entitlement at dispatch | Re-evaluate each dispatch; block/opt-out always wins | Since subscription; recipient list hidden; replies become private threads |
| Community | Current qualifying entitlement and explicit join | Continuous/event-triggered; loss requires removal and new epoch before next sensitive send | Since join only |

No row may ship while any cell is “TBD.”

## Privacy, telemetry, cache, notification, and attachment matrix

| ID | Acceptance requirement | Required evidence and objective threshold | Earliest gate |
| --- | --- | --- | --- |
| PRIV-01 | PII canary sweep | Unique synthetic canaries are placed in names, addresses, messages, wallet labels, filenames, notes, and tracking. Scan server logs, APM, metrics labels, analytics, traces, URLs, headers, CDNs, caches, queues, crash dumps, push, support tools, and backups. Allowed plaintext occurrences: zero. | G2 |
| PRIV-02 | Ciphertext-only delivery | Packet capture and server instrumentation prove application body, attachment key/metadata, address, tracking, and archive body arrive only as authenticated ciphertext. Server-side search/moderation has no native plaintext path. | G2 |
| PRIV-03 | Metadata inventory | Every server-visible field has purpose, controller, retention, access, and deletion class. Undocumented fields fail schema review. Production payload samples match the allowlist exactly. | G3 |
| PRIV-04 | No-store responses | Every authenticated, sensitive, error, redirect, export, attachment-capability, and wallet challenge response carries correct no-store headers. CDN/browser/service-worker tests show zero retained body after logout and cache inspection. | G2 |
| PRIV-05 | Browser/native storage | Plaintext drafts remain memory-only unless the user explicitly enables an encrypted local archive. Local/session storage, IndexedDB, Cache API, service workers, files, pasteboard, screenshots, and OS backups contain no unencrypted canary. | G2 |
| PRIV-06 | Wake-only push | APNs, FCM, and Web Push payloads contain only a randomized opaque wake/cursor token. Zero sender, project, order, wallet, group, entitlement, body, filename, address, or tracking canary. Lock-screen text remains generic. | G3 |
| PRIV-07 | Telemetry minimization | Message/attachment/group/wallet identifiers are never metric labels. Error events use bounded reason codes and unlinkable sampling IDs. Canary and high-cardinality scans return zero. Debug logging is impossible in production config. | G3 |
| PRIV-08 | Dedicated-origin supply chain | No ads, tag managers, remote analytics scripts, or unapproved third-party JavaScript execute on the crypto origin. CSP report and browser resource inventory show zero unexpected script, frame, font, image, or connection origin. | G3 |
| PRIV-09 | Project-controlled media | Untrusted logo/metadata URIs are never fetched directly by a private client. Disabled-by-default or privacy proxy behavior prevents IP/referrer/cookie leakage. Canary remote server receives zero private-view request. | G3 |
| PRIV-10 | Attachments | Chunk AEAD, unique nonces, authenticated manifest/order/length/digest, encrypted filename/MIME/dimensions/thumbnail, size/type limits, zip-bomb defense, sandboxed parsing, and delete/expiry all pass. Boundary-plus-one is rejected before upload. | G6 if enabled |
| PRIV-11 | Clipboard and screenshots | Copy/reveal is explicit and warns that other apps may read it. Sensitive views do not enter recent-app thumbnails where the platform permits protection. No automatic copy, link preview, or remote thumbnail. | G6 |
| PRIV-12 | Reports and moderation | Reporting reveals only explicitly selected decrypted material after confirmation. Report storage is segregated, access logged, retained separately, and excluded from native-E2EE claims. Unselected conversation canaries: zero. | G6 if enabled |
| PRIV-13 | Error redaction | Malformed ciphertext, wallet errors, RPC errors, storage failures, and bridge errors never echo secrets, addresses, message bodies, raw provider payloads, SQL, paths, or stack traces to client/telemetry. Fuzzed error scan: zero canary. | G2 |
| PRIV-14 | Data-flow review | Privacy threat model/DPIA and subprocessor inventory cover wallet-address, phone, IP, push, device, purchase, group, and bridge correlations. Privacy approval is signed and no data class lacks a retention/deletion rule. | G6 |

## Dedicated origin, embedding, and theme matrix

EMB-01 through EMB-12 are mandatory before enabling the iframe, headless SDK, or a connector feature to which the row applies. Under the unresolved PD-007 secure default those optional surfaces remain disabled; they do not block an otherwise qualifying top-level-PWA-only release, and passing unrelated PWA gates does not waive them.

| ID | Acceptance requirement | Required evidence and objective threshold | Earliest gate |
| --- | --- | --- | --- |
| EMB-01 | Origin isolation | Approved host applications cannot read iframe DOM, plaintext, keys, cookies, storage, attachment capabilities, or history through same-origin APIs. Malicious-parent test suite succeeds at zero reads. | G3 |
| EMB-02 | Parent protocol | Every postMessage validates exact origin, Window source, direction, protocol version, message schema, size, nonce/request correlation, and allowed state transition. Unknown/duplicate/replayed messages are ignored and audited without secrets. | G3 |
| EMB-03 | Minimal bridge surface | Parent messages carry only non-secret launch intent, opaque conversation handle, theme ID/tokens, and unread/badge state. Schema test rejects plaintext-like and unknown fields; payload cap is documented and enforced. | G3 |
| EMB-04 | Framing policy | CSP frame-ancestors contains only exact approved HTTPS origins per environment. X-Frame-Options behavior is compatible with the intended CSP. Unapproved, wildcard, HTTP, suffix, Unicode-confusable, and port variants cannot frame. | G3 |
| EMB-05 | CSP and navigation | Nonce/hash-based CSP, strict connect/image/font/form/base/object/navigation policy, Trusted Types where supported, and no unsafe-eval are verified from the production artifact. Zero unexpected CSP violation in the release flows. | G3 |
| EMB-06 | Clickjacking/high-risk actions | Device enrollment/removal, recovery, export, deletion, bridge linking, and sensitive address reveal/share either open a trusted top-level origin or use a reviewed anti-overlay confirmation. Automated overlay and focus-steal attacks cannot complete the action. | G6 |
| EMB-07 | Wallet proof origin | Wallet/passkey prompt names and binds the dedicated messaging origin and exact action. The parent cannot substitute its domain, callback, chain, nonce, or device key. | G3 |
| EMB-08 | Theme safety | Theme input is an allowlisted, bounded set of primitive design tokens. URLs, CSS text, selectors, fonts, content, layout-affecting extremes, transparent focus, and contrast-breaking values are rejected. All accepted themes meet WCAG AA. | G3 |
| EMB-09 | Partitioned storage | Third-party cookie/storage partition, private mode, storage denial, and cleared-site-data are detected. The client opens top-level enrollment or treats the partition as a distinct device; it never falls back to parent storage or transferable keys. | G3 |
| EMB-10 | Parent compromise disclosure | Threat model and UI state clearly distinguish cross-origin containment from trust in what the parent visually overlays. “Open secure chat” top-level fallback is always available for sensitive verification. | G6 |
| EMB-11 | Protocol compatibility | Host/client versions N and N-1 negotiate only documented compatible features. Incompatible versions show a safe upgrade path and cannot drop security fields. 100% compatibility matrix. | G6 |
| EMB-12 | Connector boundary | A WhatsApp/Telegram/CRM bridge appears as a named endpoint in roster and composer before opt-in. Native and bridged histories are not silently merged, and E2EE labels change before any bridge delivery. | GX |

## Accessibility, visual, mobile, and usability matrix

| ID | Acceptance requirement | Required evidence and objective threshold | Earliest gate |
| --- | --- | --- | --- |
| UX-01 | WCAG conformance | Every complete critical process conforms to WCAG 2.2 AA, verified by automated and manual audit. Zero open A/AA failure. | G3 |
| UX-02 | Automated accessibility | Axe or equivalent reports zero serious/critical violation on every state and viewport. Automated success does not replace manual audit. | G2 |
| UX-03 | Keyboard and focus | All actions work without pointer; logical focus order, visible focus, no trap, modal containment, Escape behavior, focus restoration, and skip navigation pass 100% of scripted/manual paths. | G2 |
| UX-04 | Assistive technology | VoiceOver/Safari, NVDA/Firefox or Chrome, and TalkBack/Chrome complete enroll, join, send, roster review, address, fulfillment, device removal, export, and error recovery with no blocker. | G6 |
| UX-05 | Responsive/reflow | 320 CSS-pixel width, 200% zoom, portrait/landscape, virtual keyboard, safe-area inset, long localization, and large dynamic type have no hidden primary action, accidental overlap, or two-dimensional page scroll. | G3 |
| UX-06 | Touch and input | Primary mobile controls are at least 44 by 44 CSS pixels; no hover-only action; pointer cancellation works; focused mobile form text does not trigger unwanted zoom. 100% measured. | G3 |
| UX-07 | Contrast and themes | Text/non-text/focus contrast meets WCAG AA in light, dark, high-contrast/forced-colors, and every accepted embedded theme. Automated measurement plus manual forced-colors review: zero failure. | G3 |
| UX-08 | Visual regression | Baselines cover every critical state at supported desktop/mobile breakpoints and themes. Release has zero unreviewed pixel/structure difference; every approved change links to design and accessibility review. | G3 |
| UX-09 | Reduced motion | prefers-reduced-motion removes nonessential animation; no flash threshold violation; loading/error state remains understandable without animation. | G3 |
| UX-10 | Security comprehension | Moderated usability study participants correctly distinguish demo, native E2EE, pending verification, removed device, and bridged plaintext state at least 90% of the time; zero participant is led to enter real PII in a labeled simulation. | G6 |
| UX-11 | International fulfillment | Country-specific address ordering, optional fields, Unicode, RTL, long names, non-Latin scripts, postal-code variance, and formatting round-trip without data loss. Supported locales have zero truncation or forced US schema. | G6 if shipping enabled |
| UX-12 | Error recovery | Offline, stale roster, expired proof, reorg/finality wait, wallet rejection, duplicate invite, storage denial, and rate limit explain what happened, preserve safe drafts, and offer a valid next action. No destructive retry loop. | G3 |
| UX-13 | Performance experience | On the supported p75 mobile profile, production-origin LCP is at most 2.5 s, INP at most 200 ms, and CLS at most 0.1; opening cached conversation and composing remain responsive during catch-up. | G6 |

## Export, deletion, backup, recovery, and migration matrix

The published privacy policy may choose stricter timing. The thresholds below are maximum launch limits unless law or an explicit legal hold requires retention; holds must be narrow, disclosed where allowed, access logged, and excluded from automated deletion evidence.

| ID | Acceptance requirement | Required evidence and objective threshold | Earliest gate |
| --- | --- | --- | --- |
| DATA-01 | Export authorization | Export requires recent high-risk reauthentication and targets only the authenticated account/device scope. Cross-account, guessed ID, expired link, replay, and confused-deputy tests return zero bytes. | G6 |
| DATA-02 | Export completeness/integrity | Export includes documented messages, memberships, devices, policy decisions, attachments, and metadata, with manifest hashes and omissions explained. A seeded corpus round-trips 100%; no other-account canary appears. | G6 |
| DATA-03 | Export delivery | Export package is client-encrypted and available within 24 hours. Its capability expires within 24 hours of issuance and creates exactly one authenticated, bounded download session; of 1,000 simultaneous redemption attempts exactly one session starts, resumable only inside its documented window. Server logs contain no package key. | G6 |
| DATA-04 | Live deletion | After confirmed deletion, sessions and push tokens revoke within five minutes; live ciphertext, attachment objects, derived indexes, active device-directory lookup entries, and non-required metadata delete within 24 hours. Verification queries find zero live object. A minimal non-reversible anti-replay/security tombstone may remain only if its fields, purpose, and retention are published and tested. | G6 |
| DATA-05 | Backup deletion | Deleted records age out of ordinary encrypted backups within 35 days. Restore of every backup generation after that boundary cannot recreate them. Legal-hold fixtures remain isolated and auditable. | G6 |
| DATA-06 | Honest deletion language | UI and export explain that onchain records and copies already decrypted by recipients cannot be erased remotely. Tests and review find no promise of impossible remote deletion. | G6 |
| DATA-07 | Backup confidentiality | Server backups contain only ciphertext and documented metadata and use separately managed encryption at rest. Backup operator without user recovery material cannot decrypt message/history canaries. | G3 |
| DATA-08 | Live-state restore prohibition | Copying/restoring a live MLS database to another or older installation cannot send. Recovery enrolls a fresh device leaf; live groups re-add it through normal commits. 100% negative-send result for stale state. | G2 |
| DATA-09 | History archive restore | Correct recovery material restores a read-only archive with manifest verification; wrong key, corrupt/truncated/reordered chunks, rollback, and mixed-account archive fail without partial trust. | G6 if enabled |
| DATA-10 | Recovery loss semantics | Maximum-privacy mode proves unrecoverable after all devices/recovery material are lost. Recoverable mode clearly discloses its weaker history-secrecy tradeoff. No hidden escrow or wallet-signature-derived key. | G6 |
| DATA-11 | Schema migration | Upgrade every supported persisted schema and archive version using golden fixtures. At least 10,000 randomized records migrate with no data/key loss; interrupted migration rolls back or resumes safely. | G6 |
| DATA-12 | Downgrade protection | An older client cannot open and rewrite newer crypto state or silently discard security fields. It displays a safe upgrade requirement. | G6 |
| DATA-13 | Disaster restore | Quarterly production-like restore proves artifact/config/key/database/object consistency, RPO and RTO. Restored service rejects expired sessions and stale chain/MLS state before traffic. | G6 |
| DATA-14 | Tenant isolation | Export, delete, backup restore, and operational tooling enforce project/account boundaries. At least 100,000 generated cross-tenant ID attempts disclose and mutate zero foreign object. | G6 |

## Chaos, SLO, capacity, and operational matrix

The first production capacity plan must state projected peak traffic, maximum group/device counts, message/attachment limits, geographic topology, and dependency quotas. Tests use the larger of two times projected peak or the documented minimum below.

| ID | Acceptance requirement | Required evidence and objective threshold | Earliest gate |
| --- | --- | --- | --- |
| OPS-01 | Availability SLO | Delivery submit and cursor sync monthly availability target is at least 99.95%, excluding only published maintenance; identity and entitlement verification at least 99.9%. Synthetic probes cover every production region and chain. | G6 |
| OPS-02 | Delivery latency | Under two times projected peak, accepted envelope p95 is at most 500 ms and p99 at most 2 s server-side; online recipient availability p95 at most 2 s and p99 at most 10 s. | G6 |
| OPS-03 | Correctness SLO | Accepted-envelope loss, cross-conversation delivery, unauthorized admission, and duplicate domain effect budget is zero. Any occurrence pages immediately and halts promotion. | G2 onward |
| OPS-04 | Soak | Seventy-two-hour run at two times projected peak plus production-like polling, attachments, membership churn, and retries stays within SLO with zero leak, fork, loss, unbounded growth, or manual intervention. | G6 |
| OPS-05 | Burst/backpressure | Fifteen minutes at ten times projected peak produces bounded queues and memory, explicit 429/Retry-After or shedding before overload, and no starvation of established sync/auth traffic. Recovery to SLO within ten minutes. | G6 |
| OPS-06 | Resource headroom | At two times projected peak, steady CPU, database connection, queue, disk IOPS, and memory remain below 70% of provisioned limit; ten-times burst remains below 90% without OOM. | G6 |
| OPS-07 | Fault matrix | Kill process, DB primary, cache, queue, object store, push, RPC, indexer, DNS, TLS upstream, region link, and clock source independently and in reviewed combinations. Security invariants hold and documented degraded behavior appears. | G3/G6 |
| OPS-08 | RPO/RTO | Accepted envelopes and authority/device changes have RPO 0 under single-component failure. Regional disaster recovery has RPO at most five minutes for non-message metadata and RTO at most 60 minutes. | G6 |
| OPS-09 | Migration safety | Database/schema/protocol deploy under live load supports expand-migrate-contract, old/new binary overlap, rollback before irreversible boundary, and idempotent jobs. Zero failed or duplicated domain effect in 100 rehearsals. | G6 |
| OPS-10 | Rate and quota enforcement | Per-IP/device/account/project/group/storage/broadcast limits are atomic across replicas. Limit plus one is rejected; reset race, parallelism, retry, and alternate endpoint cannot bypass. | G3 |
| OPS-11 | Broadcast capacity | If announcements ship, a 10,000-recipient campaign completes within the published objective, is resumable, hides recipients from one another, creates one independently authenticated relationship envelope each, and has zero duplicate recipient/domain effect. | G7 if enabled |
| OPS-12 | Alert coverage | Synthetic failures exercise every P0/P1 alert. Detection is under five minutes, acknowledgment under 15 minutes during staffed canary, and runbook starts without relying on plaintext inspection. | G6 |
| OPS-13 | Incident containment | Drill compromised device, entitlement signer, delivery service, RPC provider, deploy key, push credential, and bridge token. Sessions/credentials revoke, affected groups freeze/rekey, evidence preserves, and user notice decision is documented within 30 minutes. | G6/GX |
| OPS-14 | TLS and secrets | Certificate expiry, wrong hostname, downgrade, stale trust, key rotation, secret rotation, and KMS/HSM outage fail safely. No plaintext fallback; expiry alerts fire at least 30 and 7 days ahead. | G3 |
| OPS-15 | Error budget promotion | G6/G7 promotion requires 14 consecutive days within SLO and no exhausted error budget. G8 requires 30 consecutive days. Low traffic is supplemented with synthetic probes, not treated as perfect availability. | G6-G8 |
| OPS-16 | Observability privacy | Dashboards can answer availability, latency, backlog, failure reason, chain head lag, epoch stalls, and abuse without message/wallet/group identifiers or plaintext. PII canary count remains zero during load and chaos. | G3 |

## Browser, PWA, native, and interoperability matrix

The release manifest records concrete versions at test time. “Current” means the stable release available when the candidate is cut.

| ID | Acceptance requirement | Required evidence and objective threshold | Earliest gate |
| --- | --- | --- | --- |
| PLAT-01 | Desktop browser support | Current and previous two major releases of Chrome, Edge, Firefox, and Safari complete all critical web flows. Unsupported browsers are blocked with an honest explanation and no insecure fallback. | G6 |
| PLAT-02 | Mobile browser support | Current and previous major iOS Safari/WebKit and Android Chrome complete install/open, enroll, join, send, roster review, address, push wake, background/resume, export, and removal. | G6 |
| PLAT-03 | PWA lifecycle | Fresh install, update waiting/activation, offline shell, cleared data, revoked permission, multiple tabs, service-worker crash, and version skew preserve no-cache/privacy and crypto-state ownership invariants. | G6 |
| PLAT-04 | Native OS support | Each published iOS and Android minimum plus current and previous two supported major versions pass on real low-, mid-, and high-tier devices. Emulator-only evidence is insufficient for keychain, push, background, and low-memory cases. | G7 per native client |
| PLAT-05 | Cross-platform matrix | Every shipped sender/receiver pairing among web, iOS, and Android completes 1:1 and maximum configured group create/join/send/update/remove/recovery. 100% pairing pass. | G7 |
| PLAT-06 | Background behavior | Force-stop, process kill, OS update, network switch, airplane mode, long sleep, low battery, and revoked background permission never duplicate or lose an accepted message or send from stale state. | G7 |
| PLAT-07 | Secure storage | Browser vault/OS keychain/keystore behavior is verified on rooted/jailbroken signals, device lock changes, biometric reset, backup restore, and shared device profiles. Unsupported state blocks or warns per policy. | G7 |
| PLAT-08 | Wallet matrix | Supported injected, mobile deep-link, QR, hardware, multisig/1271, and counterfactual/6492 wallets complete the exact-action proof and rejection corpus on each enabled chain. | G6 per wallet method |
| PLAT-09 | Network transitions | Wi-Fi/cellular/VPN/proxy/IPv4/IPv6/captive portal transitions recover through cursor sync and never change origin, chain, TLS, or identity assumptions. | G6 |
| PLAT-10 | Version skew | Client protocol N and N-1 interoperate only within the documented window. Older clients cannot submit missing authorization/crypto fields; forced upgrade is safe and preserves encrypted state. | G6 |

## Chain rollout matrix

Read-only project preview may run before admission, but its result must remain candidate-display-only. An authority adapter is promoted independently per chain.

| Production chain | Test chain | Required promotion sequence |
| --- | --- | --- |
| Base, 8453 | Base Sepolia, 84532 | G3 closed alpha, G4 testnet evidence, G5 Base mainnet shadow, G6 canary, then G7 |
| Optimism, 10 | Optimism Sepolia, 11155420 | G4 testnet evidence, chain-specific G5 shadow, 14-day G7 canary |
| Arbitrum One, 42161 | Arbitrum Sepolia, 421614 | G4 testnet evidence, chain-specific G5 shadow, 14-day G7 canary |
| Ethereum, 1 | Sepolia, 11155111 | G4 testnet evidence, chain-specific G5 shadow, 14-day G7 canary |

No production chain inherits another chain's RPC, finality, ABI, role, or reorg evidence.

## Promotion criteria

### G0 to G1: real cryptographic core

- CRY-01, CRY-03, CRY-05, CRY-07 through CRY-09, and CRY-14 pass.
- PRO-01, PRO-07, PRO-10, PRO-13, and PRO-14 pass.
- The simulated-envelope code path is not reachable in the G1 artifact.
- The UI uses no E2EE wording until actual encrypted client-to-client traffic is proven.

### G1 to G2: integrated authority and storage

- Every G2 row in CRY, PRO, ID, PRIV, DATA, and OPS passes.
- HTTPS is mandatory; CSP and dedicated-origin deployment are active.
- Fault-injected atomic state/outbox and rollback suites pass three consecutive runs.
- Internal red-team review finds zero P0/P1 issue.

### G2 to G3: Base Sepolia closed alpha

- Independent crypto/application security review is complete with zero open critical/high.
- At least 500 conversations, 10,000 messages, 100 device add/remove cycles, 100 wallet reauth cycles, and 20 recovery drills complete using synthetic testnet assets.
- Base Sepolia purchase, project owner/staff, token, item/tier, refund, transfer, and controlled reorg corpus matches expected decisions 100%.
- Fourteen consecutive days meet SLO; PII canary count is zero.
- Enrollment is allowlisted and a staffed kill switch has been rehearsed.

### G3 to G4: all supported testnets

- ENT-01 through ENT-16 pass for each testnet independently.
- Each testnet records at least 1,000 decisions, including the negative and transition corpus in ENT-15.
- Web plus every enabled client/wallet pairing passes on all four testnets.
- No unresolved authority discrepancy or security incident remains.

### G4 to G5: mainnet shadow

- Shadow mode cannot create proposals, sessions, notifications, or conversation membership.
- At least 10,000 real historical/current decisions per production chain are compared against independently reconstructed receipts/state; agreement is 100%, or discrepancies are resolved and the corpus rerun.
- Two independent RPC sources, head/finality lag alerts, provider failover, and exceptional-reorg freeze drills pass.
- Project preview URI privacy and indexer-authority separation pass.

### G5 to G6: Base mainnet canary

- All G6 rows pass on the exact signed release artifacts.
- External audit and penetration test have zero open critical/high.
- Canary is limited to at most five explicitly approved projects and 100 accounts until the release board raises the cap.
- Feature flags can independently disable admission, new sends, attachments, recovery, exports, and bridges without corrupting existing ciphertext/state.
- Staffed 24/7 on-call, rollback, revocation, support, privacy, and user-notice runbooks have been exercised.
- Real shipping addresses are allowed only after the full PRIV and DATA matrices pass; otherwise canary is message-only and explicitly says so.

### G6 to G7: per-chain production

- Base completes 30 consecutive days within SLO and with zero P0/P1 incident.
- Each additional chain completes its own G5 plus a 14-day capped canary before promotion.
- Chain cap increases are gradual and stop automatically on error-budget or authority alarms.
- A chain adapter can be disabled without changing decisions on other chains.

### G7 to G8: general availability

- Every enabled chain/platform/wallet has current evidence.
- Thirty consecutive days at the intended GA capacity stay within SLO and privacy thresholds.
- Disaster restore, key/device compromise, entitlement signer compromise, RPC disagreement, and region-loss drills pass.
- Bug bounty, dependency monitoring, quarterly restore, annual external audit, and recurring accessibility/privacy review are operating.

### Native clients and connectors

A native client repeats CRY-03, CRY-06, CRY-11 through CRY-13, DATA-08 through DATA-12, all applicable UX rows, and PLAT-04 through PLAT-10 before it can join production groups.

A connector repeats a separate GX review. Minimum GX requirements are:

- explicit per-user opt-in and opt-out, not inferred from token ownership or purchase;
- named bridge endpoint visible before first bridged message;
- documented provider/business/platform plaintext access and retention;
- provider webhook signature, replay, ordering, idempotency, rate, outage, and deletion tests;
- no native-E2EE label on bridged traffic;
- zero automatic backfill of native history;
- a separate PII canary, DPIA/subprocessor, incident, consent, template/policy, and data-deletion evidence bundle.

## Stop, rollback, and re-verification triggers

The release automatically stops promotion and disables the affected admission/send path on:

- any violation of INV-01 through INV-10;
- finalized-chain/RPC disagreement affecting a decision;
- epoch fork that does not converge within two successful sync cycles;
- accepted-message loss, cross-conversation delivery, or duplicate domain effect;
- plaintext/PII canary outside its allowed encrypted class;
- compromised signing, device-directory, deployment, recovery, or bridge credential;
- exhausted security/availability error budget;
- audit critical/high, dependency critical/high, or actively exploited client/platform vulnerability;
- inability to revoke a device/role or disable a chain/feature safely.

Re-verification is required after:

- crypto library/provider/compiler/ciphersuite or wrapper changes;
- schema, persistence transaction, recovery, or archive changes;
- identity/session/SIWE/1271/6492 changes;
- ABI, deployment, RPC, finality, or entitlement-policy changes;
- new chain, wallet, project role, product gate, attachment type, embed host, theme capability, native platform, or connector;
- CSP, service-worker, cache, telemetry, push, export, deletion, backup, or key-management changes;
- an incident or test escape touching a launch-blocking invariant.

## Release decision record

The final go/no-go record must answer, without “TBD”:

1. Which exact chains, products, wallet methods, clients, embeds, recovery modes, attachment types, and connectors are enabled?
2. Which artifact digest and protocol/policy/deployment revisions were tested?
3. Which matrix rows are applicable, and where is each result?
4. Are there any exceptions, who approved them, and when do they expire?
5. What are the current capacity limits, SLOs, retention periods, finality rules, and session/eligibility TTLs?
6. Who is on call, and which tested control freezes admission, sends, a chain, recovery, export, or a connector?
7. What user-facing security, metadata, deletion, recovery, and connector claims are approved?

If any answer is missing or conflicts with the evidence manifest, the decision is no-go.
