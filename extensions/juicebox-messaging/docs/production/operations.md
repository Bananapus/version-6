# Production operations

This document defines how the production control and delivery planes are deployed, measured, operated,
and recovered. The API contract is in [service-api.md](./service-api.md); durable state and retention are
in [storage-and-retention.md](./storage-and-retention.md).

## 1. Deployment topology

### 1.1 Isolation boundaries

Production, staging, development, and security-test environments use separate cloud accounts/projects,
networks, databases, object buckets, queues, KMS keys, push credentials, wallet/RPC credentials, and
DNS names. Production data is never copied to a lower environment. Load tests use generated ciphertext
and synthetic wallets/projects.

The initial production topology is single-writer, multi-availability-zone within each data-residency
realm. It is deliberately not active-active across regions:

```text
Native client
  -> authoritative DNS + DDoS protection
  -> WAF / API load balancer (TLS termination, body logging disabled)
  -> stateless API pods in 3 availability zones
       -> PostgreSQL writer + synchronous in-region and fenced cross-region standbys
       -> PostgreSQL read replicas for bounded non-authoritative reads
       -> Redis-compatible ephemeral cluster (rate limits, DPoP replay, short polling hints)
       -> enrollment authority / EOA-1271-6492 verifier / signed device directory
       -> eligibility workers / chain RPC quorum
       -> tenant-origin registry / short-lived embed-context controller
       -> object storage upload control
       -> transactional outbox
  -> outbox dispatcher
       -> mailbox wakeup bus
       -> push workers (Web Push, APNs, FCM)
       -> independent append-log witness
       -> retention/export workers
       -> audit sink
Cross-region: synchronous critical-ledger commit quorum; asynchronous WAL/archive/index/metrics copies;
              replicated encrypted objects and KMS keys

Separate trust domain: explicitly opted-in WhatsApp/Telegram relay thread
  -> isolated relay gateway + provider API + relay-only store
  -> authenticated protocol translation at the visible business endpoint
  -> never a native MLS member and never backfilled from a native transcript
```

Authoritative authorization, idempotency, CAS, positions, and mailbox rows always use the writer. A
read replica may serve project discovery or already-stamped public configuration only when bounded
staleness is acceptable. It MUST NOT decide eligibility, membership, unread position, cursor validity,
or mutation preconditions.

Each residency realm has a fixed public API origin and its own cursor-key namespace. Tenant routing is
resolved before authentication from registered tenant/project configuration, never from a caller-
supplied database name, region, or object prefix. Cross-region failover changes the realm's DNS target;
it does not permit concurrent writers.

### 1.2 Network and service identities

- API pods run in private subnets and accept traffic only from the load balancer.
- PostgreSQL, Redis, queues, and KMS use private endpoints and mutually authenticated service
  identities. Database passwords are short-lived identities where the provider supports them.
- Egress is denied by default. Explicit destinations are chain RPC providers, object storage, KMS,
  audit storage, and configured push providers.
- Push workers cannot read envelope ciphertext. Attachment workers cannot read session or eligibility
  tables. Analytics cannot read ciphertext, push endpoints, wallet signatures, or token hashes.
- Migration and break-glass roles are absent from application pods.
- The MLS external-proposal signer and policy-head signer use distinct KMS keys, service identities,
  signature contexts, deployment roles, and audit streams. The proposal role can sign only logged
  `mls_external_proposal_v1` PublicMessages; the policy-head role can sign only `policy_head_v1`
  freshness heads. Neither role may call the other's key, and verifiers reject cross-domain signatures.
- The `device-credential.v1` signer, installation-possession verifier, wallet verifier, and device-
  directory publisher have purpose-separated identities and keys. The wallet verifier receives exact
  canonical challenge bytes and finalized read-only chain evidence, never a message/MLS signing key.
  The credential signer cannot decide wallet/finality status; it signs only a committed verified
  enrollment result. The directory publisher cannot mint a credential and its checkpoints require the
  independent directory witness.
- The embed-context controller has a purpose-separated handle-HMAC pepper and short-lived opaque-
  reference encryption key. It may read only active tenant/origin/issuer configuration and context
  rows; it cannot read wallet signatures, eligibility evidence, MLS state, native transcript bytes, or
  provider-relay plaintext. The messaging-origin BFF is the only redemption caller.
- A WhatsApp/Telegram relay runs in a separately isolated connector account, namespace, and datastore.
  It receives only explicitly opted-in relay threads. It has no native API session, KeyPackage, MLS
  leaf, mailbox, or access to native transcript history. Relay plaintext memory, provider credentials,
  and provider APIs are outside native E2EE and receive the highest data classification.

### 1.3 Process classes

| Process | Durable writes | Prohibited access |
| --- | --- | --- |
| API | Enrollment allocation/claims, auth/session, plans, CAS, envelopes, mailbox, attachment manifests, outbox | Credential-signing key, KMS migration/admin, provider push credentials in plaintext |
| Enrollment verifier | Terminal EOA/1271/6492 and P-256 possession outcomes/finality evidence | Message/attachment ciphertext, credential-signing key, eligibility mutation outside exact result |
| Device-credential signer/directory publisher | Signed credential, immutable directory entry/checkpoint/outbox | Wallet signature bytes, provider plaintext, MLS/application secrets, eligibility decisions |
| Embed context controller/BFF | Tenant-bound context/redemption/session state and revocation outbox | Wallet/eligibility authority, native transcript, relay/provider plaintext |
| Eligibility worker | Grant/revocation rows and outbox | Message/attachment ciphertext |
| External-proposal signer | Logged MLS PublicMessage proposals under `mls_external_proposal_v1` | Policy-head key, MLS secrets, application ciphertext |
| Policy-head signer | Freshness heads under `policy_head_v1`, append-only checkpoint publication | External-proposal key, MLS secrets, application ciphertext |
| Outbox dispatcher | Claim/completion fields and downstream dedupe ID | Session secrets and eligibility evidence |
| Push worker | Push endpoint status | Envelope bytes and conversation metadata beyond wakeup dedupe |
| Witness submitter | Signed conversation log heads and witness receipts | Envelope bytes, account/wallet identity, push configuration |
| Lifecycle worker | Scoped retention/export jobs and deletion ledger | MLS/group secrets, decrypted application data |
| Relay gateway | Relay-only thread state and provider API | Native sessions, KeyPackages, memberships, mailbox, or messaging database |
| Migration job | Schema only under approved release | Application tokens and provider credentials |

## 2. Availability and durability objectives

These are provisional launch objectives because the decision log still requires representative load
evidence. The signed release manifest may ratify stricter values, but never values below verification's
minimum gates. No production project is enabled until the values are ratified. Once enabled, SLIs use
rolling 28-day windows. Invalid authentication, authorization denials, client 4xx, caller
disconnects, and documented rate limits are excluded from availability only when the server classified
them correctly. Server 5xx, dependency fail-closed 503, timeouts, and malformed successful responses are
failures. Planned maintenance is not automatically excluded.

| Capability | Availability SLO | Latency SLO (server time) |
| --- | --- | --- |
| Envelope append | 99.95% | p95 < 250 ms, p99 < 750 ms |
| Mailbox/event page, non-long-poll portion | 99.95% | p95 < 200 ms, p99 < 600 ms |
| Membership plan/commit | 99.90% | p95 < 500 ms, p99 < 1.5 s excluding chain finality |
| Device enrollment allocation/challenge | 99.90% | p95 < 500 ms excluding client signing |
| Enrollment completion/session issuance | 99.90% | p95 < 750 ms excluding contract-wallet RPC/finality/directory witness latency |
| Embedded context issue/redemption | 99.95% | p95 < 250 ms, p99 < 750 ms excluding subsequent wallet/eligibility authentication |
| Attachment create/finalize/download capability | 99.90% | p95 < 500 ms excluding object byte transfer |
| Push wakeup after committed outbox event | 99% within 10 seconds | p99 < 30 seconds |
| Authorized deletion reaching primary/object stores | 99.9% within 24 hours | Hard maximum 24 hours; overdue is an SLO failure and SEV-1 |
| Authoritative external-signer compromise decision to `emergency_frozen` | 100% within five minutes | Missing deadline is SEV-0 |

RPO is zero for every acknowledged envelope (external proposal, public Commit, or private application),
Welcome, membership boundary, relationship active-generation pointer, idempotency result, mailbox entry,
cursor/acknowledgement receipt, terminal enrollment/embed claim/result, wallet/device binding, signed
credential/directory/revocation, session rotation/revocation, KeyPackage state transition,
finality-backed authorization lease, and tenant/origin/context invalidation. Success is emitted only
after the authoritative transaction is
durable on the in-region quorum and a fenced synchronous cross-region critical-ledger replica; a bound
attachment also requires a cross-region object replication receipt. If that quorum is unavailable the
mutation returns 503 and no success is claimed. There is zero tolerance for silent loss, position
renumbering, hash substitution, or selecting an unwitnessed fork.

The at-most-five-minute regional RPO applies only to explicitly classified rebuildable/non-message
state such as discovery indexes, aggregated metrics, ephemeral rate-limit buckets, cached RPC results,
and push wake hints. Those stores are never authoritative for auth, eligibility grants, membership,
mailbox/cursors, or accepted bytes. Regional RTO remains at most 60 minutes. Restore/failover drills,
not provider marketing, prove both classes.

When a 28-day error budget is 50% consumed, the owning team reviews release risk. At 75%, non-security
feature rollout pauses. At 100%, only reliability, security, and approved emergency changes deploy
until the budget recovers.

## 3. Capacity and overload behavior

Capacity tests use the maximum wire sizes and worst-case roster fanout, not average chat messages. Every
realm maintains at least 40% headroom at forecast peak for API CPU, database IOPS, database storage,
connections, queue throughput, object request rate, and KMS operations.

- API horizontal scaling targets p95 CPU below 60%, event-loop lag below 50 ms, and available database
  connections above 30%. Per-pod connection pools are capped so maximum pods cannot exhaust PostgreSQL.
- Outbox consumers scale from oldest-ready age and ready-row count. They claim bounded batches with
  `FOR UPDATE SKIP LOCKED` and provider-specific concurrency ceilings.
- Long polls have a separate concurrency pool and deadline. Under pressure the server returns an empty
  page with a valid cursor or 503 plus jittered retry; it does not hold database transactions open.
- Rate limit and quota checks fail closed if their authoritative database counters are unavailable.
  Failure of the ephemeral limiter does not allow unlimited writes; the API falls back to conservative
  local limits and database hard quotas.
- Load shedding order is project discovery, long-poll duration, attachment initiation, new plans,
  new embed-context issuance, enrollment allocation, membership changes, then envelope append.
  Redemption/terminal enrollment-result reads, authenticated mailbox reads, revocation propagation,
  and already-idempotent retries receive priority. No tier bypasses authorization or hard storage
  quotas, and shed work never reopens a claimed proof/context.
- Enrollment allocation/challenge and embed issuance/redemption have independent tenant/client/origin/
  IP-prefix rate buckets plus authoritative per-account/installation outstanding-attempt ceilings.
  Responses remain non-enumerating; overload never causes a verifier fallback, last-resort
  KeyPackage, longer context expiry, or unbounded terminal-result retention.
- Maximum request-body bytes are enforced at the load balancer and again by streaming application
  parsers before JSON/base64 allocation. WAF inspection does not retain bodies.

Capacity alerts fire at 60%, 75%, and 90% of tested safe throughput; partition/index and storage reviews
begin at 25% of tested structural limits.

MLS and service counters are monitored against the v1 ceiling `2^63-1`, never the wider uint64 wire
range. Alerting starts with enough tested lead time to migrate a conversation to a fresh generation;
there is no wrap, clamp, or numeric coercion. A counter that would exceed the cap suspends the affected
generation and fails writes closed. Chain `uint256` values use separate decimal/numeric monitoring and
must not be truncated to this ceiling.

## 4. Health and dependency behavior

- `/livez` proves only that the process event loop and fatal-error guard are alive. It never calls a
  dependency.
- `/startupz` remains false until configuration schemas, signed release manifest (including
  `lastResortKeyPackages: false`), separate domain-bound KMS/signing key
  access, database schema compatibility, wallet/profile registries, device-credential/directory trust
  roots, witness/policy-log trust roots, and required credentials are validated. Finality configuration
  is explicit per chain: absent/unratified ENG-004 semantics are treated as unconfigured and every
  authority/enrollment/eligibility path for that chain returns unavailable with no lease. An embed
  tenant remains unavailable until its exact origin, issuer, audience, purpose, CSP/theme, and
  environment configuration are verified; no inferred default exists. A production process refuses
  any SQLite URL, `/api/dev/messaging` flag, lab bootstrap
  secret, insecure cookie mode, wildcard origin, HTTP public origin, or development key namespace.
- `/readyz` checks ability to acquire a database connection and verifies the writer/realm identity from
  a constant-time metadata query. It fails when the pod is draining or schema-incompatible.
- `/v1/status` is public, cacheable for at most 30 seconds, and reports only API versions, aggregate
  service state, and a status-page link. It exposes no hosts, regions, queue depths, schema versions, or
  tenant state.

Dependency policy:

| Dependency failure | Behavior |
| --- | --- |
| PostgreSQL writer | All authoritative reads/writes 503; readiness false; never write to replicas |
| Redis/rate limiter | Conservative in-process limits plus database hard quotas; DPoP uses database or rejects high-risk requests |
| Enrollment wallet/possession verifier | Claimed pair remains terminal; no credential/session is issued; exact result is `unavailable` and retry cannot reuse proofs |
| Chain finality/RPC coordinator | Affected existing authority grants are suspended, new enrollment/eligibility leases 503, and no `safe`/`latest` or single-provider fallback is used |
| Device directory signer/witness | New enrollment/renewal fails before credential/session success; existing witnessed credentials remain usable only to their stored expiry/revocation state |
| Embed tenant/origin registry or context KMS | Context issue/redemption returns the non-enumerating unavailable/invalid result; no host-supplied tenant/origin fallback |
| Object store | Messaging without new attachments continues; upload/finalize/download 503 |
| Push provider | Appends continue; outbox retries; clients still poll mailbox |
| Policy/transparency endpoint | New membership and sensitive application sealing fail closed; bounded non-sensitive sync remains available |
| Append-log witness | Appends may durably queue heads within the tested bounded backlog; sensitive sends fail closed after the published witness freshness limit |
| KMS | Operations needing protected configuration fail closed; opaque envelope append may continue only if no decrypt operation is required and audit remains available |
| Audit sink | Security-sensitive admin/relay actions fail closed; normal appends buffer in bounded durable outbox until its limit |

## 5. Release and migration process

Every build is reproducible, signed, scanned, and accompanied by source revision, dependency lock,
SBOM, database compatibility range, API compatibility range, and conformance-test result. Images run as
non-root with read-only root filesystems, dropped capabilities, seccomp, and explicit resource limits.

For this repository, `corepack npm run check:release` is the release-candidate preflight. It pins the npm
implementation, rejects an invalid installed dependency tree, fails closed when the production
dependency audit is unavailable or reports a known High/Critical advisory, and generates a validated
lockfile-bound CycloneDX SBOM. Retain that output in the release evidence bundle. This preflight does not
perform or replace the required license/secret/provenance scans, reproducible artifact comparison,
signing or attestation, independent audit, deployment verification, or approval process.

Release order:

1. Approve and run expand migration from a dedicated job.
2. Deploy to staging with production-shaped synthetic traffic and fault tests.
3. Deploy canary to 1% of one realm. Keep writes sticky by installation so idempotency observations are
   interpretable, while durable correctness remains database-enforced.
4. Compare error, latency, CAS conflict, idempotency replay, position, queue, and privacy-log metrics for
   at least 30 minutes and one synthetic membership/attachment flow.
5. Progress 5%, 25%, 50%, 100% with an automatic halt on SLO, security, or invariant alarms.
6. Keep the previous binary deployable for the declared schema compatibility window.
7. Run backfill/switch/contract only as described in the storage migration procedure.

Rollback never reverses a committed schema migration. It rolls application code to a version declared
compatible with the expanded schema. A bad wire change is disabled by server-side capability flags;
flags have owners, expiry dates, and audit records. Authentication, authorization, retention, and E2EE
disclosure cannot be bypassed by flags.

## 6. Observability without plaintext

### 6.1 Logging

Ingress, WAF, CDN, API framework, exception tracker, APM agent, and service mesh are configured not to
capture request/response bodies on messaging, auth, attachment, export, relay, and push routes. Query
strings are allowlisted by key; cursor and capability values are redacted before logging. Headers are
deny-by-default. In particular, do not log `Authorization`, `DPoP`, cookies, wallet signatures,
SIWE/EIP-712 challenge payloads, possession proofs/digests, enrollment result handles, device public
JWK/key material, idempotency keys, claim/context handles, opaque integration references, embed channel
IDs/nonces, key packages, ciphertext/hash, MLS artifacts, push endpoints, attachment URLs/object keys,
export keys, or provider responses containing them. Provider-relay plaintext is forbidden in native
telemetry.

Context and redemption API request targets MUST have an empty query and are rejected before tenant or
handle resolution otherwise. Secret handles never appear in a target, referrer, access log, span URL,
error, support bundle, or fragment. URL fragments are client-only and never sent to the service; the
frame bootstrap clears or rejects unexpected `location.search`/`location.hash` without logging their
contents. Framework-internal `_rsc` is allowlisted only at reviewed document-routing instrumentation,
is stripped from telemetry, and is never accepted on `/v1/embed/contexts` or
`/v1/embed/context-redemptions`. Edge/CDN/WAF access-log tests assert these rules, not just application
logger tests.

Application log schema is allowlisted:

```text
timestamp, severity, service, build_id, realm, route_template, method,
status_class, duration_bucket, request_id, error_code, retryable,
tenant_bucket, project_bucket, actor_bucket, installation_bucket,
conversation_bucket, operation, dependency, dependency_status
```

Buckets are HMACs with a logging-only, rotating key and are never raw identifiers. General logs use a
daily key and cannot be joined across days. Restricted security audit uses a stable annual key with
tightly controlled access. Free-form exception messages are not emitted; known errors use codes and
unknown exceptions use type plus sanitized stack frames. Core dumps and heap snapshots are disabled in
production by default and require the incident privacy procedure.

### 6.2 Metrics

Required low-cardinality metrics include:

- `api_requests_total{route,method,status_class,error_code}` and
  `api_duration_seconds{route,method}`
- `append_commits_total{result}`, `append_position_conflicts_total`,
  `idempotency_replays_total{route}`, `idempotency_conflicts_total{route}`
- `membership_intents{state}`, `membership_commit_conflicts_total`, `roster_size_bucket`
- `service_counter_remaining_bucket{counter}`, `service_counter_overflow_rejections_total{counter}`
- `key_packages_available{installation_bucket}`, `key_packages_taken_total{outcome}`,
  `key_package_inventory_exhausted_total{client}`, `key_package_reuse_rejections_total{reason}`
- `policy_head_age_seconds_bucket`, `mandatory_proposals_total{state}`,
  `confirmed_transcript_cas_conflicts_total`,
  `external_sender_seconds_to_expiry_bucket{slot}`,
  `signer_migrations_total{reason,state}`, `signer_migration_deadline_seconds_bucket{reason,state}`,
  `signer_emergency_freeze_seconds_bucket{result}`
- `log_head_extensions_total{result}`, `witness_receipt_age_seconds_bucket`,
  `witness_consistency_failures_total{reason}`, `client_equivocation_reports_total{reason}`
- `mailbox_page_entries_bucket`, `mailbox_cursor_errors_total{reason}`,
  `mailbox_oldest_unacked_seconds_bucket`
- `outbox_ready_total{event_type}`, `outbox_oldest_ready_seconds{event_type}`,
  `outbox_attempts_total{event_type,result}`
- `attachment_bytes_total{operation,result}`, `attachment_orphans_total`
- `enrollment_attempts_total{profile,state}`, `enrollment_terminal_claims_total{result}`,
  `wallet_verifications_total{method,result}`, `possession_verifications_total{result}`,
  `device_credentials_total{state}`, `device_credential_seconds_to_expiry_bucket`,
  `device_directory_checkpoint_age_seconds_bucket`, `device_directory_consistency_failures_total{reason}`
- `embed_contexts_total{operation,result}`, `embed_context_replays_total{reason}`,
  `embed_channel_mismatches_total{reason}`, `embed_sessions_total{state}`,
  `embed_origin_invalidations_total{reason}`
- `eligibility_checks_total{capability,result}`, `eligibility_evidence_age_seconds_bucket`,
  `finality_decisions_total{chain_bucket,result}`, `authority_suspended_total{reason}`
- `rate_limit_decisions_total{scope,decision}`, `quota_usage_ratio_bucket{quota}`
- `campaign_targets_total{state}`, `campaign_oldest_pending_seconds_bucket`,
  `campaign_policy_skips_total{reason}`
- `retention_due_total{resource}`, `retention_oldest_overdue_seconds{resource}`,
  `deletion_jobs_total{state}`
- `db_pool_connections{state}`, `db_transaction_seconds{operation}`,
  `db_replica_lag_seconds`, and provider/KMS request metrics

No metric label contains account, installation, project, conversation, envelope, attachment, provider token, IP,
or error text. Exemplars may contain request IDs only.

### 6.3 Tracing

Traces record route templates, operation names, result codes, durations, retry counts, and request IDs.
Database spans use named query identifiers, never SQL parameters or generated statements. HTTP spans do
not record URLs containing cursor/capability values or downstream provider bodies. Tail sampling keeps
100% of security denials and invariant failures, 10% of 5xx/slow requests, and at most 1% of normal
traffic, subject to the same redaction.

### 6.4 Audit

Audit events are required for terminal enrollment claims/outcomes, device-credential issue/renew/
suspend/revoke/supersede, directory checkpoints, session/installation revocation, tenant embed/origin/
issuer configuration, coarse context redemption/replay/revocation outcome, relay linking/removal,
project-policy change, grant/revocation, membership intent/commit, external-signer migration/freeze/cutover,
report/block, export, deletion/hold, KMS/admin
access, migration, restore, and break-glass use. They contain hashed actors/resources, action, outcome,
reason code, request ID, source prefix hash, policy version, and before/after state codes. They never
contain message ciphertext or plaintext. Embed audit keeps only a random non-joinable audit ID and
coarse result; it omits tenant resource refs, handles, channel values, wallet/account/context/session
IDs, and provider data. Audit storage is append-only/WORM with separate access review.

## 7. Alerting and incident levels

| Level | Examples | Response |
| --- | --- | --- |
| SEV-0 | Confirmed key/token/context-handle exfiltration, cross-tenant access, plaintext logging, reused terminal enrollment/context capability, device-directory split view, silent message corruption, signed same-position split log heads | Page security, service, privacy, and incident command immediately; contain before availability |
| SEV-1 | Writer unavailable, acknowledged data loss risk, regional outage, deletion materially overdue | Page primary/secondary; incident command within 10 minutes |
| SEV-2 | SLO burn, push/outbox backlog, eligibility lag, attachment outage, abuse spike | Page owning team during coverage; incident lead within 30 minutes |
| SEV-3 | Non-urgent capacity trend, isolated provider degradation | Ticket with owner and due date |

Alerts use request IDs, aggregate counts, realm, build, route, and error code. Pager payloads, chat alerts,
and tickets MUST NOT include wallet addresses, conversation/project IDs, push tokens, URLs, ciphertext,
or message excerpts.

## 8. Runbooks

Each runbook action records incident ID, operator, command/change, time, result, and rollback. Operators
use prepared read-only queries and scoped automation; they do not inspect arbitrary rows to “see what
the user sent.”

### 8.1 PostgreSQL writer failure or saturation

1. Declare SEV-1 when readiness or writer latency crosses the page threshold for five minutes.
2. Freeze deploys/migrations/backfills and reduce long-poll/attachment admission.
3. Check connections, lock waits by named query, IOPS, WAL, CPU, storage, and replication state. Never
   log SQL parameters.
4. Kill only the identified runaway application/backend PID through the provider API after confirming
   its named query and owner; do not issue broad termination.
5. If the writer is unhealthy, promote the synchronous in-region standby using the managed failover.
   Fence the old writer before DNS/service discovery changes.
6. Run synthetic auth, idempotent append/replay, mailbox, CAS, and attachment-manifest checks.
7. If no in-region candidate is safe, invoke fenced regional failover. The critical ledger must have
   every acknowledged artifact (RPO 0); a missing one is data loss/SEV-0, never an accepted RPO window.
   Only named rebuildable metadata may be up to five minutes stale. Never manufacture positions.
8. Re-enable traffic gradually and reconcile outbox/retention backlog.

### 8.2 Position, log-head, idempotency, or CAS invariant alarm

1. Stop new writes for the affected realm or tenant while keeping safe reads if isolation is proven.
2. Preserve database/WAL and relevant sanitized traces. Do not run an automated renumber or duplicate
   delete.
3. Query by hashed/known incident resource through the restricted invariant tool: duplicate envelope
   IDs, conversation `last_position`, envelope max position, stored prior/leaf/head chain, signed head,
   witness receipt, confirmed-transcript checkpoint, mailbox counters, and idempotency response hash.
4. If two valid service signatures name different hashes at the same conversation position, or a
   witness rejects an extension, declare SEV-0 equivocation. Freeze affected writes, publish both
   non-secret signed proofs to the incident evidence store, rotate no keys until evidence is preserved,
   and require client/witness consistency recovery. Never choose a branch by row count or timestamp.
5. If an acknowledged envelope is missing, declare SEV-0/1 data integrity incident and follow restore.
6. If only a response was lost, verify the idempotency record and allow exact replay.
7. Patch forward with a conformance regression; manual data repair requires two-person approval and an
   immutable repair manifest.

### 8.3 Outbox or push backlog

1. Compare database outbox age to broker/provider age and split by event type/provider.
2. Keep envelope append available while durable outbox capacity remains below the hard threshold.
3. Disable only the failing provider consumer, honor provider retry/backoff, and scale bounded workers.
4. Deduplicate by outbox ID/provider endpoint. Never synthesize message previews.
5. At hard capacity, shed new attachment/planning work before appends; if durability is at risk, return
   503 rather than commit without outbox.
6. After recovery, drain oldest first and validate that clients retrieve through mailbox regardless of
   push success.

### 8.4 Eligibility provider lag or chain reorganization

1. Mark affected chain/capability degraded, CAS affected grants to `suspended`, and stop issuing new
   grants or enrollment-derived authority. An absent, unratified, paused, or ambiguous ENG-004 finality
   profile is `unavailable`/no lease; never substitute `safe`, `latest`, an indexer label, or one RPC.
2. Existing affected grants do not remain authoritative merely because `valid_until` is in the future.
   Preserve their exact stored profile and block/hash evidence while authority stays suspended.
3. Query the release-pinned independent RPC quorum and coordinator. Record profile ID/revision/hash and
   block hashes, not wallet evidence bodies or provider response plaintext.
4. On reorg, identify grants derived from the exact orphaned anchors, atomically mark them
   `orphaned`/`revoked`, write revocation outbox, and create removal intents. Coordinator unavailability
   leaves authority suspended; it never delays revocation while continuing access.
5. Publish the signed policy head and external public Remove proposal to the independent policy log,
   set `membership_pending`, stop old-epoch delivery to the target, and freeze application sends until
   an eligible installation Commits every mandatory proposal. Do not delete history or claim removal
   before the client-validated Commit.
6. Resume only after a ratified active profile again returns `verified-finalized`, the exact chain/grant
   state, policy-log witness, accepted public Commit, and confirmed-transcript checkpoint agree.

### 8.5 Object storage failure or mismatch

1. Stop new upload URLs/finalization; normal message append without attachments remains available.
2. For a hash/size mismatch, quarantine the exact object key through the manifest tool and return a
   typed unavailable error. Do not expose partial bytes.
3. Reconcile database manifests with version inventory. Delete only explicit confirmed orphan keys.
4. Restore a missing encrypted object from a matching version/backup. Verify ciphertext hash before
   making it downloadable.
5. If irrecoverable, mark the attachment unavailable and notify participants without claiming the
   surrounding message was deleted.

### 8.6 KMS or token-key compromise

1. Declare SEV-0 and identify affected key purpose/version and services without printing secret values.
2. Disable decrypt grants for the compromised principal, preserve audit, and isolate affected pods.
3. Cursor key: deploy a new encrypt key, retain unaffected decrypt keys, invalidate compromised-key
   cursors, and require safe resync.
4. Token pepper/session signing key: revoke affected token families/security epoch and require wallet
   reauthentication.
5. Device-credential signer/directory key: stop enrollment/renewal, preserve and compare witnessed
   checkpoints, revoke affected credentials/sessions/packages, and follow the device-directory runbook.
   Embed handle pepper/reference key: suspend affected tenant contexts, revoke live embedded sessions,
   purge bounded encrypted references, rotate purpose-separated keys, and require new handles/channels.
6. External-proposal signer: disable only the `mls_external_proposal_v1` grant, publish/witness the
   revocation, and follow the external-sender emergency-freeze runbook. Policy-head signer: disable only
   the `policy_head_v1` grant and stop fresh-head issuance. Never validate or substitute a signature
   across these domains, even during recovery.
7. Push/connector configuration key: stop the affected worker, rotate provider credentials, rewrap from
   a known-good source, and notify impacted integrations.
8. Database/object KMS key: follow provider compromise rotation and assess backup exposure. Client
   ciphertext remains encrypted, but metadata exposure is still a reportable event.

### 8.7 Suspected plaintext or secret in logs

1. Declare SEV-0, stop the emitting deployment/route or disable the affected sink, and restrict log
   access immediately.
2. Do not paste the suspected value into incident chat, tickets, search queries, or test fixtures. Use a
   security-provided fingerprint to locate copies.
3. Identify sinks, replication/export paths, viewers, and retention. Place necessary evidence under
   restricted legal/security control.
4. Purge where legally and technically possible, rotate exposed tokens/keys/capabilities, and notify
   privacy/legal owners.
5. Add a body/header/logging regression at ingress, framework, APM, exception, and worker layers before
   re-enabling.

### 8.8 Abuse or disk-fill attempt

1. Verify transactional hard quotas remain enforced and identify aggregate scope buckets, not message
   content.
2. Tighten installation/account/project/campaign/IP-prefix limits through audited configuration; revoke
   a session or installation only with recorded abuse reason.
3. Preserve envelope IDs and metadata required for appeal/audit. Do not decrypt or demand plaintext for
   routine mitigation.
4. If a tenant is compromised, suspend that tenant's new plans/appends while preserving export/deletion
   access where safe.
5. Validate database/object growth and retention-worker headroom before restoring normal limits.

### 8.9 Relay compromise

1. Disable the isolated relay service principal and provider credential; stop inbound/outbound provider
   traffic and expire relay-only sessions/capabilities.
2. Suspend affected relay threads and deep links. Do not create native MLS removal intents: the relay
   has no native installation, leaf, mailbox, or transcript access.
3. Determine provider-delivered scope from relay audit and provider delivery IDs without searching
   plaintext. Restrict any unavoidable provider console access under the incident privacy procedure.
4. Rotate connector configuration and require business/operator plus participant reapproval before a
   relay thread resumes. If a separately enrolled native business installation was also compromised,
   revoke it through the ordinary installation-removal workflow as a distinct action.
5. Notify relay participants that gateway/provider plaintext may be affected. Do not describe an
   unrelated native MLS group as broken unless evidence supports that.

### 8.10 Deletion deadline at risk

1. Warn at 12 hours and page the lifecycle owner by 20 hours from an effective request. At 24 hours
   declare SEV-1 and an SLO/privacy failure; do not move the deadline.
2. Identify the exact lifecycle job and remaining database partitions, object versions, cache entries,
   outbox rows, or export objects through hashed scope. Pause lower-priority lifecycle work and add
   bounded workers without broadening delete scope.
3. Retry only enumerated primary keys/object version IDs. Confirm provider version markers and replicas;
   never issue a bucket/prefix delete or manually mark completion.
4. Complete the deletion ledger only after every live-store subsystem acknowledges deletion. Preserve
   the minimal non-identifying ledger and incident audit, not deleted ciphertext.
5. Track backup generations separately; all expired backup/object copies must be inaccessible or gone
   within 35 days. Validate the next restore drill does not resurrect the deletion generation.

### 8.11 Regional disaster and restore

1. Fence the old writer and outbound workers; establish one incident commander and one recovery LSN.
2. Follow the isolated restore procedure in `storage-and-retention.md`, including deletion-ledger and
   security-epoch replay before reads.
3. Verify schema, positions, hashes, membership CAS, object inventory, and idempotency using synthetic
   and restricted invariant tools.
4. Prove every sampled acknowledged envelope/Commit/Welcome/idempotency/cursor receipt and terminal
   enrollment/embed claim/result, credential/directory/revocation, session/KeyPackage transition,
   finality-backed lease, and tenant/origin invalidation is present on the failover writer with the
   identical hash/state/version. Rebuild or discard allowed asynchronous caches; never use them to fill
   authoritative gaps or reopen a one-use capability.
5. Shift a small traffic percentage, keep push/relay outbound disabled, then expand after mailbox and
   append verification.
6. Re-enable asynchronous delivery with outbox dedupe, publish RPO/RTO status, and schedule a restore
   evidence review.

### 8.12 External-sender rotation or compromise

1. Credential validity is at most 90 days. A group is admitted only with a staged-next credential having
   at least 30 days remaining; before later activation, that staged credential must also have been
   published and independently witnessed for at least 30 days. Current/staged-next validity may overlap
   at most 14 days and the policy log authorizes exactly one. Set `deadlineAt` no later than the stored
   `lastAuthorizedSignerExpiresAt - 30 days`, page before that T−30 boundary, and create a durable
   UUIDv7 `signerMigrationId` in `scheduled`; an incomplete migration is suspended at that deadline—not
   at expiry—and becomes `blocked`.
2. Verify the old generation contains exactly current and staged-next credentials and that the
   independent policy log activates exactly one. A staged credential does not become active because of
   local time, delivery state, or operator action alone.
3. For compromise, declare SEV-0, publish the revocation through the independently witnessed policy
   log, suspend affected generations, reject new policy heads/proposals from the credential, and reach
   `emergency_frozen` within five minutes of the authoritative decision. Page at one minute and again at
   three; missing five minutes is a SEV-0 invariant breach. Do not fall back to an expired/compromised
   signer or submit an external GroupContextExtensions/self-update.
4. CAS only the recorded state path: `scheduled|emergency_frozen -> successor_provisioning ->
   successor_ready -> cutover_verified -> complete`; an invariant failure moves to `blocked` and never
   skips forward. At every step compare the stored predecessor/successor credential IDs, fingerprints,
   monotonic signer generations, source/target policy-log checkpoints, T−30 deadline, and maximum
   overlap. A retired/revoked generation is irreversible and cannot be restaged.
5. Provision generation `N+1` with fresh member KeyPackages and a new current/staged-next pair. Verify
   policy-log proofs, exact roster/policy hash, confirmed-transcript starting checkpoint, and the
   old-member-signed migration statement before activation.
6. In one transaction, first CAS the predecessor to `closing`, then insert/activate the verified
   successor, then swap the same-scope active pointer and record `cutover_verified`; rollback all steps
   together on any failure. No successor conversation, mailbox, membership, or traffic route exists in
   `successor_ready`. Do not copy MLS state, Welcome bytes, ciphertext transcript, case plaintext, or secrets.
   History moves only through a separately consented encrypted read-only archive.
   Neither the entitlement nor delivery service owns a group leaf or can construct the Commit.
7. Confirm every affected scope is migrated or explicitly remains suspended before closing the
   incident. Verify the cutover head is independently witnessed before `complete`; add rotation/
   emergency fixtures and preserve only non-secret signed proof/audit material.

### 8.13 KeyPackage inventory exhaustion or reuse alarm

1. Keep the affected installation visible as needing replenishment and return the typed
   `key_package_inventory_exhausted` response; do not borrow another installation's package or enable a
   last-resort package.
2. Compare untaken inventory, package expiry, taken/used timestamps, plan/intent IDs, and directory
   checkpoints through the restricted inventory tool. Never print
   package bytes.
3. Ask the installation to publish fresh ordinary single-use packages. A package becomes permanently
   unavailable when its bytes are first returned in a plan or membership intent; cancellation,
   timeout, aborted activation,
   or an ambiguous result does not release it.
4. If the same reference was returned to two plans or a taken reference re-entered the available index,
   stop planning for the realm and declare SEV-0. Preserve the rows/WAL, repair only by patch-forward,
   and require new packages; never infer that an apparently unused init key is safe.
5. Resume after concurrent-last-package tests prove exactly one take, losing callers receive the typed
   replenishment result, exact idempotent retry returns the original plan, and no expiry/cancel path
   clears `taken_at`.

### 8.14 Enrollment verifier, terminal-claim, or finality failure

1. Stop new enrollment completion for the affected profile/chain while keeping exact terminal-result
   reads available. Allocation may continue only within the bounded queue and never extends an attempt
   or challenge window.
2. Verify that the wallet and possession rows name one enrollment/pair and the same canonical claim ID/
   time. Never change `claimed` back to `issued`, mint replacement proofs under the same attempt, or
   ask an operator to replay a wallet signature. A missing acknowledged claim/result is an RPO-0
   security incident.
3. Split outcomes by `eoa|erc1271|erc6492` and `invalid|unavailable` using only low-cardinality metrics.
   Inspect named verifier/RPC error codes, finality profile ID/revision/hash, and block-hash quorum; do
   not print SIWE/EIP-712 bytes, signatures, public JWKs, KeyPackages, result handles, or provider bodies.
4. Missing canonicality, RPC disagreement, unresolved finality, 1271 code/state ambiguity, 6492 bounded-
   simulation failure, or possession-verifier uncertainty stays `unavailable` and issues no credential,
   session, or lease. Do not fall back to EOA, another profile, `personal_sign`, `safe`, or `latest`.
5. If an invalid/unavailable pair issued authority, declare SEV-0; suspend/revoke the credential and
   token families, revoke available KeyPackages, append/witness the directory revocation, suspend
   grants, and run Remove/rekey. Preserve canonical digests and signed proofs, not secret bytes.
6. Resume only after exact SIWE 13-resource and EIP-712 graph fixtures, one-way possession-digest
   fixtures, concurrent paired-claim tests, EOA/1271/6492 negative tests, finality fail-closed tests, and
   directory-witness issuance pass in the target realm.

### 8.15 Device-credential or directory inconsistency/compromise

1. Freeze enrollment, credential renewal, and KeyPackage publication for the affected signer/directory
   realm. If scope is uncertain, fail closed globally for new credentials.
2. Preserve canonical credential bytes/digests, directory entries/checkpoints, witness receipts, and KMS
   audit. Never inspect wallet signatures or select a directory branch by timestamp/tree size alone.
3. Two valid witnessed checkpoints that do not extend one another, a mismatched JKT/MLS fingerprint,
   or a credential not backed by the exact terminal enrollment is SEV-0. Suspend affected installations,
   sessions, available KeyPackages, eligibility authority, and group sends; publish both non-secret
   proofs for independent comparison.
4. On signer compromise, disable only the device-credential signing grant, rotate under the published
   recovery root, and issue witnessed revocations/supersessions. A revoked/superseded credential or
   installation is never reactivated; recovery creates a new installation when either public key
   changes.
5. Create mandatory Remove/rekey intents for affected memberships and verify future exclusion by the
   accepted public Commit. Resume issuance only after directory consistency/witness and restore tests
   prove account/installation/key/package/revocation-version continuity.

### 8.16 Embed origin, context replay, or channel-binding incident

1. Suspend the exact tenant/origin/issuer and atomically revoke its unredeemed contexts and live embed
   sessions. Keep the standalone messaging origin available; embedding is not an auth bypass or a
   prerequisite for native export/deletion.
2. Inspect only aggregate route/result codes and purpose-separated HMAC buckets. Never search by or
   copy a context handle, opaque resource ref, cookie, channel ID/nonce, parent URL, wallet, purchase,
   provider payload, `location.search`, or `location.hash`.
3. A duplicate successful redemption, cross-origin/context disclosure, channel substitution, or raw
   handle in a URL/referrer/access log/trace/error is SEV-0. Follow secret/plaintext log containment,
   purge the short-lived reference/linkage, and require a fresh context/channel after recovery; do not
   replay or lengthen the original handle.
4. Verify the origin ownership record, issuer mTLS/OAuth subject, frame audience/client/purpose, CSP,
   channel/bootstrap/parent/frame commitments, `__Host-` Secure/HttpOnly/SameSite=None/Partitioned
   cookie profile, required auth-bound token rotation, two-minute context deadline, and ten-minute
   session deadline. Confirm the embedded installation/session is partitioned by tenant/parent origin
   and no top-level session became ambient authority. A revoked origin/issuer remains terminal;
   reapproval creates a new record.
5. Confirm edge/CDN/WAF/framework tests reject every context/redemption query—including `_rsc`—before
   resolution, while `_rsc` remains confined to reviewed document routing. Confirm frame startup clears
   or rejects unexpected search/hash without telemetry and channel destroy revokes an unredeemed
   context.
6. Resume only after issue/redeem/lost-response/replay/expiry/channel-mismatch/reload/origin-revocation
   tests pass and audit contains only random unjoinable IDs with coarse outcomes.

## 9. Access reviews and operational hygiene

- Production access is just-in-time, least-privilege, phishing-resistant MFA, and approved by an owner
  outside the requester for database, KMS, audit, backup, and connector roles.
- Standing human database write access is prohibited. Read access uses vetted views/tools that omit
  ciphertext and direct identifiers.
- Break-glass grants expire within one hour and alert security immediately. Every use receives a review
  within one business day.
- Service accounts, push credentials, RPC keys, relay credentials, device-credential/directory keys,
  embed handle/reference keys, witness/policy-log signing keys, and KMS grants are inventoried and
  rotated. Orphan identities are disabled automatically.
- Dependency and base-image critical vulnerabilities have a 24-hour mitigation target; high severity
  has seven days. Changes affecting crypto, auth, eligibility, deletion, relay linking, or log
  redaction require security review and conformance tests.
- Quarterly exercises cover database restore, deletion replay, enrollment terminal-claim/verifier
  failure, device-directory split view, embed replay/origin revocation, key compromise, provider push
  outage, eligibility finality/reorg, append-log split view, relay compromise, and plaintext-log
  containment.

## 10. Production readiness gate

No production wallet/project is enabled until all of the following are demonstrated in the target
realm:

- Independent review of wallet/DPoP/installation binding and the selected MLS client implementation,
  including exact `siwe-erc4361-v1` 13-resource ordering, exact
  `JuiceboxMessagingDeviceEnrollmentV1` EIP-712 graph, one-way terminal possession binding, separate
  P-256/Ed25519 keys, and no profile alias/fallback.
- Enrollment conformance proves preallocated IDs, paired atomic terminal claim before verification,
  exact retry, EOA/1271/6492 invalid-versus-unavailable behavior, signed credential/directory witness,
  renewal/supersession/revocation, and no session/lease when finality is unconfigured, pending,
  ambiguous, or unavailable. Orphan fixtures atomically revoke authority and begin Remove/rekey.
- API conformance including `PrivateMessage` application/`PublicMessage` handshake enforcement,
  confirmed-transcript CAS races, idempotent response loss, membership boundaries, cursor cross-binding,
  signed log-head continuity, and independent-witness split-view detection.
- KeyPackage negative conformance: last-resort mode is absent/disabled; concurrent requests for the
  last ordinary package yield one irreversible take and typed replenishment failures; cancellation,
  expiry, abort, and ambiguous activation never make it available again; a taken package is never
  returned to another plan or intent.
- Restore with RPO 0 for acknowledged critical artifacts, at-most-five-minute RPO only for enumerated
  rebuildable metadata, RTO within 60 minutes, and deletion/security-ledger replay. Critical artifacts
  include terminal enrollment/embed claims/results, credentials/directory/revocations, session and
  KeyPackage state, finality-backed leases, and tenant/origin/context invalidations.
- Retention and account/conversation deletion through database, object versions, caches, outbox, export,
  and backup expiry.
- WAF/APM/framework/worker evidence that bodies, ciphertext, wallet proofs, tokens, URLs, and push
  material are not logged.
- Embed conformance proves fail-closed unconfigured tenants, exact verified origin/issuer/audience/
  purpose binding, two-minute one-use handles, terminal CAS before resolution, narrow lost-response
  replay, ten-minute channel-bound sessions, host-only partitioned cookie behavior, token rotation at
  authentication, distinct embedded installation/session partitions, channel/auth separation, and
  tenant/origin revocation. Browsers that block/ignore isolated third-party state take the fixed
  top-level path and never downgrade to shared ambient authentication.
  Edge/document/frame tests prove no handle or opaque reference enters a URL/referrer/search/hash/log,
  every API query (including `_rsc`) is rejected pre-resolution, and framework `_rsc` is confined to
  body-free document routing.
- Load and fault tests at two times forecast peak and maximum envelope/roster/campaign sizes; the
  resulting ratified limits and SLOs are pinned in the signed release manifest.
- Alert/runbook exercises with on-call ownership and escalation paths.
- User-visible disclosure that the server observes metadata and that a relay exposes plaintext to its
  platform.
- A staged Juicebox testnet eligibility adapter with a ratified explicit finality profile, quorum/
  reorg behavior, and unavailable/no-lease evidence before any mainnet grant. ENG-004 remaining
  unresolved means the production gate stays closed.

## 11. Operational separation from the development lab

The lab and production are separate products at the operational boundary. Production deployment
automation creates no SQLite volume, invitation/bootstrap secret, `/api/dev/messaging` route, LAN HTTP
listener, simulated-envelope media type, or 24-hour room-cleanup worker. It accepts no lab cookie,
cursor, conversation ID, envelope, or database import.

Production uses independent DNS, cloud account, network, PostgreSQL cluster, buckets, queues, KMS and
signing keys, wallet/RPC/finality profiles, device-directory roots, tenant/origin registries, embed
context peppers/keys, telemetry, access roles, backups, and incident channels. A lab invitation,
session, simulated key, challenge, enrollment result, device credential, context handle, or embed
session is syntactically and cryptographically invalid in production. Staging
uses generated wallets and ciphertext and cannot restore production snapshots. Startup and continuous
configuration monitors fail closed if a development flag/key namespace appears in a production realm.
