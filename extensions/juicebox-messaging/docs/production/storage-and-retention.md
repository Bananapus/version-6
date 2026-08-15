# Production storage, retention, and recovery

This document defines the durable model behind [service-api.md](./service-api.md). The SQLite database
used by `/api/dev/messaging` is disposable lab state and is not a production migration source.

## 1. Storage boundaries and invariants

1. PostgreSQL is authoritative for identity bindings, authorization, MLS coordination, append order,
   mailbox references, quotas, campaigns, retention, and idempotency.
2. An S3-compatible store holds only client-encrypted attachment/campaign/export objects. An upload is
   never authority; a PostgreSQL manifest in the correct state is authority.
3. The transactional outbox is the only path from committed state to push, witness, lifecycle,
   campaign, audit, and integration workers.
4. Native MLS application bytes and encrypted object bytes remain client E2EE ciphertext. Database,
   volume, object, WAL, queue, and backup encryption are additional metadata controls, not E2EE.
5. The service stores no MLS group secret, application/attachment/campaign key, decrypted message,
   shipping address, tracking number, filename, attachment MIME type, raw bearer/refresh token, raw
   claim/context handle, raw opaque integration reference, raw embed channel nonce, or post-verification
   wallet signature. Provider-relay plaintext never enters this database, WAL, queue, or backup.
6. `account_id`, `wallet_ref`, `installation_id`, `installation_auth_jkt`,
   `mls_credential_fingerprint`, and `device_credential_id` are distinct. Accounts are opaque service
   IDs; wallets link through keyed lookups; every installation owns an unrelated P-256 authentication
   key and suite-`0x0001` Ed25519 MLS credential key. Labels and platform metadata are never authority.
7. A provider relay uses a separate service/database/trust domain. It is never a native installation
   or MLS membership row in this schema.
8. Destructive jobs name bounded database primary keys and exact object keys from manifests. They do
   not accept a caller-supplied filesystem path, bucket, or recursive prefix.
9. The authoritative PostgreSQL commit path is synchronously durable in-region and to a fenced
   cross-region critical-ledger replica before acknowledging an envelope, Commit, Welcome, membership/
   active-generation change, idempotency result, mailbox row, cursor acknowledgement, terminal
   enrollment/embed claim or result, wallet/device binding, signed credential/directory/revocation,
   session rotation/revocation, KeyPackage publication/take/use/revoke, finality-backed authorization
   lease, or tenant/origin/context invalidation. These artifacts have RPO 0. Only named rebuildable
   caches/indexes/metrics may use asynchronous replication with RPO at most five minutes.

## 2. Normative logical schema

The DDL below is normative at the logical level. Core account/wallet-link/installation/credential/
policy/policy-head/relationship/scope/conversation/campaign/attachment/archive/authentication-session
record plus client event/envelope IDs are canonical UUIDv4. `device_credential_id` and embedded-session
record IDs are therefore UUIDv4. Operational request/enrollment-attempt/wallet-challenge/possession-
challenge/enrollment-completion/embed-context/embed-redemption/plan/intent/proposal/signer-migration/
other job IDs are UUIDv7; `signer_migration_id` is therefore UUIDv7. Client
`case_id`/`event_id` never enter this schema. Secret handles/tokens are independent
256-bit CSPRNG values stored only as keyed hashes where possible. IDs are never derived from a wallet,
order, project, time, or ciphertext and never authorize access. Every durable domain-record ID not
explicitly classified as operational is UUIDv4. Although MLS/wire counters are uint64,
version 1 stores and accepts only `0..9223372036854775807`; counters are `bigint` and serialize as
canonical unsigned decimal strings. There is no wrap, clamp, or coercion. A generation is migrated
before the cap; overflow suspends it and fails closed. EVM uint256 values remain separately validated
`numeric(78,0)`. Times are `timestamptz`; services, not clients, stamp them. Version
1 pins RFC 9420 cipher suite `0x0001` (`MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`); all v1
confirmed-transcript, policy, proposal, envelope, and log hashes here are exactly 32-byte SHA-256
outputs. A future hash/suite requires a new versioned profile and generation migration.

Text state checks are intentional: migrations add values by expand/backfill/contract rather than
rewriting a PostgreSQL enum. Production migrations add the named partitions and storage parameters.

```sql
CREATE TABLE tenants (
  tenant_id uuid PRIMARY KEY,
  tenant_public_id text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('active', 'suspended', 'deleting')),
  embed_state text NOT NULL DEFAULT 'unconfigured'
    CHECK (embed_state IN ('unconfigured', 'active', 'suspended', 'revoked')),
  frame_audience text,
  embed_theme_hash bytea CHECK (octet_length(embed_theme_hash) = 32),
  top_level_destinations_hash bytea CHECK (octet_length(top_level_destinations_hash) = 32),
  kms_key_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (tenant_public_id = lower(tenant_public_id)),
  CHECK (
    embed_state <> 'active'
    OR (frame_audience IS NOT NULL AND embed_theme_hash IS NOT NULL
      AND top_level_destinations_hash IS NOT NULL)
  )
);

CREATE TABLE tenant_parent_origins (
  tenant_origin_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id),
  environment text NOT NULL CHECK (environment IN ('production', 'staging', 'preview', 'development')),
  canonical_https_origin text NOT NULL,
  ownership_proof_method text NOT NULL CHECK (ownership_proof_method IN ('dns', 'https')),
  ownership_proof_digest bytea NOT NULL CHECK (octet_length(ownership_proof_digest) = 32),
  state text NOT NULL CHECK (state IN ('pending_verification', 'active', 'suspended', 'revoked')),
  verified_at timestamptz,
  reverify_after timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (tenant_id, environment, canonical_https_origin),
  UNIQUE (tenant_origin_id, tenant_id),
  CHECK (state <> 'active' OR (verified_at IS NOT NULL AND revoked_at IS NULL)),
  CHECK (state <> 'revoked' OR revoked_at IS NOT NULL)
);

CREATE TABLE embed_issuer_clients (
  embed_issuer_client_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id),
  client_id text NOT NULL,
  oauth_subject_hash bytea NOT NULL CHECK (octet_length(oauth_subject_hash) = 32),
  mtls_certificate_thumbprint bytea NOT NULL CHECK (octet_length(mtls_certificate_thumbprint) = 32),
  audience text NOT NULL,
  allowed_purposes jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'suspended', 'revoked')),
  created_at timestamptz NOT NULL,
  revoked_at timestamptz,
  UNIQUE (tenant_id, client_id),
  UNIQUE (tenant_id, oauth_subject_hash, mtls_certificate_thumbprint),
  UNIQUE (embed_issuer_client_id, tenant_id)
);

CREATE TABLE chain_finality_profiles (
  finality_profile_id uuid NOT NULL,
  profile_revision bigint NOT NULL
    CHECK (profile_revision BETWEEN 1 AND 9223372036854775807),
  chain_id text NOT NULL,
  canonical_document jsonb NOT NULL,
  profile_hash bytea NOT NULL CHECK (octet_length(profile_hash) = 32),
  adapter_release_id text NOT NULL,
  ratification_evidence_ref text NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'paused', 'retired')),
  effective_at timestamptz NOT NULL,
  retired_at timestamptz,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (finality_profile_id, profile_revision),
  UNIQUE (finality_profile_id, profile_revision, profile_hash),
  UNIQUE (chain_id, profile_hash),
  CHECK (state <> 'retired' OR retired_at IS NOT NULL)
);
CREATE UNIQUE INDEX chain_finality_one_active_idx
  ON chain_finality_profiles(chain_id) WHERE state = 'active';

CREATE TABLE project_refs (
  project_ref_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id),
  protocol text NOT NULL,
  protocol_version text NOT NULL,
  chain_id text NOT NULL,
  projects_contract bytea NOT NULL CHECK (octet_length(projects_contract) = 20),
  project_id numeric(78,0) NOT NULL CHECK (project_id >= 0),
  canonical_hash bytea NOT NULL CHECK (octet_length(canonical_hash) = 32),
  last_signer_generation bigint NOT NULL DEFAULT 0
    CHECK (last_signer_generation BETWEEN 0 AND 9223372036854775807),
  status text NOT NULL CHECK (status IN ('active', 'paused', 'deleted')),
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_id, canonical_hash),
  UNIQUE (tenant_id, protocol, protocol_version, chain_id, projects_contract, project_id)
);

CREATE TABLE policies (
  policy_id uuid NOT NULL,
  policy_revision bigint NOT NULL CHECK (policy_revision BETWEEN 1 AND 9223372036854775807),
  project_ref_id uuid NOT NULL REFERENCES project_refs(project_ref_id),
  canonical_document jsonb NOT NULL,
  policy_hash bytea NOT NULL CHECK (octet_length(policy_hash) = 32),
  created_at timestamptz NOT NULL,
  superseded_at timestamptz,
  PRIMARY KEY (policy_id, policy_revision),
  UNIQUE (policy_id, policy_hash)
);

CREATE TABLE accounts (
  account_id uuid PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('pending_enrollment', 'active', 'suspended', 'deleting', 'deleted')),
  created_at timestamptz NOT NULL,
  deletion_requested_at timestamptz,
  deleted_at timestamptz
);

CREATE TABLE wallet_links (
  wallet_link_id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(account_id),
  wallet_ref_lookup bytea NOT NULL UNIQUE CHECK (octet_length(wallet_ref_lookup) = 32),
  wallet_ref_ciphertext bytea NOT NULL,
  kms_key_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'revoked', 'deleted')),
  verified_at timestamptz NOT NULL,
  revoked_at timestamptz,
  UNIQUE (wallet_link_id, account_id)
);
CREATE INDEX wallet_links_account_idx ON wallet_links(account_id, status);

CREATE TABLE device_enrollment_attempts (
  enrollment_id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(account_id),
  preallocated_installation_id uuid NOT NULL UNIQUE,
  preallocated_device_credential_id uuid NOT NULL UNIQUE,
  preallocated_wallet_challenge_id uuid UNIQUE,
  preallocated_possession_challenge_id uuid UNIQUE,
  wallet_ref_lookup bytea NOT NULL CHECK (octet_length(wallet_ref_lookup) = 32),
  chain_id text NOT NULL,
  proof_profile text NOT NULL CHECK (proof_profile IN ('siwe-erc4361-v1', 'eip712-device-enrollment-v1')),
  client_id text NOT NULL,
  exact_https_origin text NOT NULL,
  audience text NOT NULL,
  purpose text NOT NULL,
  scope_canonical jsonb NOT NULL,
  scope_hash bytea NOT NULL CHECK (octet_length(scope_hash) = 32),
  installation_kind text NOT NULL CHECK (installation_kind IN ('native')),
  platform text NOT NULL CHECK (platform IN ('web', 'ios', 'android', 'desktop')),
  storage_partition_class text NOT NULL CHECK (storage_partition_class IN ('top_level', 'embedded')),
  embed_tenant_id uuid REFERENCES tenants(tenant_id),
  embed_tenant_origin_id uuid,
  result_handle_hash bytea NOT NULL UNIQUE CHECK (octet_length(result_handle_hash) = 32),
  device_key_binding_canonical jsonb,
  installation_auth_jkt bytea UNIQUE CHECK (octet_length(installation_auth_jkt) = 32),
  mls_credential_fingerprint bytea UNIQUE CHECK (octet_length(mls_credential_fingerprint) = 32),
  initial_key_package_ref bytea UNIQUE CHECK (octet_length(initial_key_package_ref) = 32),
  initial_key_package_sha256 bytea CHECK (octet_length(initial_key_package_sha256) = 32),
  state text NOT NULL CHECK (state IN (
    'allocated', 'challenges_issued', 'claimed', 'verifying', 'issued',
    'invalid', 'unavailable', 'expired'
  )),
  terminal_reason_code text,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  completed_at timestamptz,
  CHECK (expires_at > issued_at),
  CHECK (expires_at <= issued_at + interval '5 minutes'),
  CHECK (
    (storage_partition_class = 'embedded')
      = (embed_tenant_id IS NOT NULL AND embed_tenant_origin_id IS NOT NULL)
  ),
  CHECK (
    state NOT IN ('challenges_issued', 'claimed', 'verifying', 'issued', 'invalid', 'unavailable')
    OR device_key_binding_canonical IS NOT NULL
  ),
  CHECK (
    state IN ('allocated', 'expired')
    OR (preallocated_wallet_challenge_id IS NOT NULL
      AND preallocated_possession_challenge_id IS NOT NULL)
  ),
  CHECK (
    state NOT IN ('claimed', 'verifying', 'issued', 'invalid', 'unavailable')
    OR claimed_at IS NOT NULL
  ),
  CHECK ((state IN ('issued', 'invalid', 'unavailable', 'expired')) = (terminal_reason_code IS NOT NULL)),
  UNIQUE (enrollment_id, preallocated_installation_id, preallocated_device_credential_id),
  UNIQUE (enrollment_id, preallocated_wallet_challenge_id),
  UNIQUE (
    enrollment_id, preallocated_wallet_challenge_id, preallocated_possession_challenge_id
  ),
  UNIQUE (
    enrollment_id, account_id, chain_id, preallocated_installation_id,
    preallocated_device_credential_id, installation_auth_jkt, mls_credential_fingerprint,
    initial_key_package_ref, initial_key_package_sha256
  ),
  FOREIGN KEY (embed_tenant_origin_id, embed_tenant_id)
    REFERENCES tenant_parent_origins(tenant_origin_id, tenant_id)
);
CREATE INDEX device_enrollment_attempts_expiry_idx
  ON device_enrollment_attempts(expires_at, enrollment_id);

CREATE TABLE enrollment_wallet_challenges (
  challenge_id uuid PRIMARY KEY,
  enrollment_id uuid NOT NULL UNIQUE REFERENCES device_enrollment_attempts(enrollment_id),
  account_id uuid NOT NULL REFERENCES accounts(account_id),
  chain_id text NOT NULL,
  installation_id uuid NOT NULL,
  device_credential_id uuid NOT NULL,
  possession_challenge_id uuid NOT NULL UNIQUE,
  profile text NOT NULL CHECK (profile IN ('siwe-erc4361-v1', 'eip712-device-enrollment-v1')),
  protocol_profile text NOT NULL CHECK (protocol_profile = 'device-enrollment.v1'),
  exact_payload_ciphertext bytea NOT NULL,
  payload_digest bytea NOT NULL UNIQUE CHECK (octet_length(payload_digest) = 32),
  nonce_hash bytea NOT NULL UNIQUE CHECK (octet_length(nonce_hash) = 32),
  audience text NOT NULL,
  client_id text NOT NULL,
  exact_https_origin text NOT NULL,
  purpose text NOT NULL,
  scope_hash bytea NOT NULL CHECK (octet_length(scope_hash) = 32),
  installation_auth_jkt bytea NOT NULL CHECK (octet_length(installation_auth_jkt) = 32),
  mls_credential_fingerprint bytea NOT NULL CHECK (octet_length(mls_credential_fingerprint) = 32),
  key_package_ref bytea NOT NULL CHECK (octet_length(key_package_ref) = 32),
  key_package_sha256 bytea NOT NULL CHECK (octet_length(key_package_sha256) = 32),
  issued_at timestamptz NOT NULL,
  not_before timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN ('issued', 'claimed', 'expired')),
  claimed_by_completion_id uuid UNIQUE,
  claimed_at timestamptz,
  CHECK (expires_at > not_before),
  CHECK ((state = 'claimed') = (claimed_at IS NOT NULL AND claimed_by_completion_id IS NOT NULL)),
  UNIQUE (challenge_id, enrollment_id),
  UNIQUE (challenge_id, enrollment_id, possession_challenge_id),
  UNIQUE (challenge_id, enrollment_id, payload_digest),
  UNIQUE (challenge_id, enrollment_id, payload_digest, not_before, expires_at),
  UNIQUE (challenge_id, enrollment_id, account_id, chain_id, installation_id, device_credential_id),
  FOREIGN KEY (
    enrollment_id, account_id, chain_id, installation_id, device_credential_id,
    installation_auth_jkt, mls_credential_fingerprint, key_package_ref, key_package_sha256
  ) REFERENCES device_enrollment_attempts(
    enrollment_id, account_id, chain_id, preallocated_installation_id,
    preallocated_device_credential_id, installation_auth_jkt, mls_credential_fingerprint,
    initial_key_package_ref, initial_key_package_sha256
  ),
  FOREIGN KEY (enrollment_id, challenge_id, possession_challenge_id)
    REFERENCES device_enrollment_attempts(
      enrollment_id, preallocated_wallet_challenge_id, preallocated_possession_challenge_id
    )
);

CREATE TABLE device_possession_challenges (
  possession_challenge_id uuid PRIMARY KEY,
  enrollment_id uuid NOT NULL UNIQUE REFERENCES device_enrollment_attempts(enrollment_id),
  wallet_challenge_id uuid NOT NULL UNIQUE REFERENCES enrollment_wallet_challenges(challenge_id),
  wallet_payload_digest bytea NOT NULL CHECK (octet_length(wallet_payload_digest) = 32),
  challenge_digest bytea NOT NULL UNIQUE CHECK (octet_length(challenge_digest) = 32),
  server_nonce_hash bytea NOT NULL UNIQUE CHECK (octet_length(server_nonce_hash) = 32),
  installation_id uuid NOT NULL,
  device_credential_id uuid NOT NULL,
  installation_auth_jkt bytea NOT NULL CHECK (octet_length(installation_auth_jkt) = 32),
  mls_credential_fingerprint bytea NOT NULL CHECK (octet_length(mls_credential_fingerprint) = 32),
  key_package_ref bytea NOT NULL CHECK (octet_length(key_package_ref) = 32),
  key_package_sha256 bytea NOT NULL CHECK (octet_length(key_package_sha256) = 32),
  account_id uuid NOT NULL REFERENCES accounts(account_id),
  chain_id text NOT NULL,
  audience text NOT NULL,
  client_id text NOT NULL,
  exact_https_origin text NOT NULL,
  purpose text NOT NULL,
  scope_hash bytea NOT NULL CHECK (octet_length(scope_hash) = 32),
  issued_at timestamptz NOT NULL,
  not_before timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN ('issued', 'claimed', 'expired')),
  claimed_by_completion_id uuid UNIQUE,
  claimed_at timestamptz,
  CHECK (not_before >= issued_at),
  CHECK (expires_at > not_before),
  CHECK ((state = 'claimed') = (claimed_at IS NOT NULL AND claimed_by_completion_id IS NOT NULL)),
  UNIQUE (possession_challenge_id, enrollment_id, wallet_challenge_id),
  FOREIGN KEY (wallet_challenge_id, enrollment_id, possession_challenge_id)
    REFERENCES enrollment_wallet_challenges(
      challenge_id, enrollment_id, possession_challenge_id
    ),
  FOREIGN KEY (wallet_challenge_id, enrollment_id, wallet_payload_digest)
    REFERENCES enrollment_wallet_challenges(challenge_id, enrollment_id, payload_digest),
  FOREIGN KEY (
    wallet_challenge_id, enrollment_id, wallet_payload_digest, not_before, expires_at
  ) REFERENCES enrollment_wallet_challenges(
    challenge_id, enrollment_id, payload_digest, not_before, expires_at
  ),
  FOREIGN KEY (wallet_challenge_id, enrollment_id, account_id, chain_id, installation_id, device_credential_id)
    REFERENCES enrollment_wallet_challenges(
      challenge_id, enrollment_id, account_id, chain_id, installation_id, device_credential_id
    ),
  FOREIGN KEY (
    enrollment_id, account_id, chain_id, installation_id, device_credential_id,
    installation_auth_jkt, mls_credential_fingerprint, key_package_ref, key_package_sha256
  ) REFERENCES device_enrollment_attempts(
    enrollment_id, account_id, chain_id, preallocated_installation_id,
    preallocated_device_credential_id, installation_auth_jkt, mls_credential_fingerprint,
    initial_key_package_ref, initial_key_package_sha256
  ),
  FOREIGN KEY (enrollment_id, wallet_challenge_id, possession_challenge_id)
    REFERENCES device_enrollment_attempts(
      enrollment_id, preallocated_wallet_challenge_id, preallocated_possession_challenge_id
    )
);

CREATE TABLE enrollment_completion_requests (
  completion_id uuid PRIMARY KEY,
  enrollment_id uuid NOT NULL UNIQUE REFERENCES device_enrollment_attempts(enrollment_id),
  request_sha256 bytea NOT NULL CHECK (octet_length(request_sha256) = 32),
  wallet_challenge_id uuid NOT NULL UNIQUE REFERENCES enrollment_wallet_challenges(challenge_id),
  possession_challenge_id uuid NOT NULL UNIQUE
    REFERENCES device_possession_challenges(possession_challenge_id),
  state text NOT NULL CHECK (state IN ('claimed', 'verifying', 'issued', 'invalid', 'unavailable')),
  wallet_verification_method text CHECK (wallet_verification_method IN ('eoa', 'erc1271', 'erc6492')),
  finality_status text CHECK (finality_status IN (
    'verified-finalized', 'pending-finality', 'orphaned', 'unavailable'
  )),
  finality_profile_id uuid,
  finality_profile_revision bigint
    CHECK (finality_profile_revision BETWEEN 1 AND 9223372036854775807),
  finality_profile_hash bytea CHECK (octet_length(finality_profile_hash) = 32),
  finalized_chain_id text,
  finalized_block numeric(78,0) CHECK (finalized_block >= 0),
  finalized_block_hash bytea CHECK (octet_length(finalized_block_hash) = 32),
  provider_quorum_hash bytea CHECK (octet_length(provider_quorum_hash) = 32),
  wallet_evidence_digest bytea CHECK (octet_length(wallet_evidence_digest) = 32),
  possession_evidence_digest bytea CHECK (octet_length(possession_evidence_digest) = 32),
  result_status integer,
  result_body_ciphertext bytea,
  result_body_sha256 bytea CHECK (octet_length(result_body_sha256) = 32),
  result_kms_key_version text,
  result_purge_after timestamptz,
  claimed_at timestamptz NOT NULL,
  completed_at timestamptz,
  UNIQUE (completion_id, enrollment_id),
  UNIQUE (completion_id, enrollment_id, wallet_challenge_id),
  UNIQUE (completion_id, enrollment_id, wallet_challenge_id, possession_challenge_id),
  CHECK (state NOT IN ('issued', 'invalid', 'unavailable') OR completed_at IS NOT NULL),
  CHECK (
    state NOT IN ('issued', 'invalid', 'unavailable')
    OR (result_status BETWEEN 200 AND 599 AND result_body_ciphertext IS NOT NULL
      AND result_body_sha256 IS NOT NULL AND result_kms_key_version IS NOT NULL
      AND result_purge_after IS NOT NULL)
  ),
  CHECK (
    state <> 'issued'
    OR (wallet_verification_method IS NOT NULL AND finality_status = 'verified-finalized'
      AND finality_profile_id IS NOT NULL
      AND finality_profile_revision IS NOT NULL AND finality_profile_hash IS NOT NULL
      AND finalized_chain_id IS NOT NULL AND finalized_block IS NOT NULL
      AND finalized_block_hash IS NOT NULL AND provider_quorum_hash IS NOT NULL
      AND wallet_evidence_digest IS NOT NULL
      AND possession_evidence_digest IS NOT NULL)
  ),
  FOREIGN KEY (finality_profile_id, finality_profile_revision, finality_profile_hash)
    REFERENCES chain_finality_profiles(finality_profile_id, profile_revision, profile_hash),
  FOREIGN KEY (wallet_challenge_id, enrollment_id)
    REFERENCES enrollment_wallet_challenges(challenge_id, enrollment_id),
  FOREIGN KEY (possession_challenge_id, enrollment_id, wallet_challenge_id)
    REFERENCES device_possession_challenges(
      possession_challenge_id, enrollment_id, wallet_challenge_id
    )
);
ALTER TABLE enrollment_wallet_challenges ADD CONSTRAINT enrollment_wallet_claim_fk
  FOREIGN KEY (claimed_by_completion_id, enrollment_id, challenge_id)
  REFERENCES enrollment_completion_requests(completion_id, enrollment_id, wallet_challenge_id);
ALTER TABLE device_possession_challenges ADD CONSTRAINT device_possession_claim_fk
  FOREIGN KEY (
    claimed_by_completion_id, enrollment_id, wallet_challenge_id, possession_challenge_id
  ) REFERENCES enrollment_completion_requests(
    completion_id, enrollment_id, wallet_challenge_id, possession_challenge_id
  );

CREATE TABLE installations (
  installation_id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(account_id),
  installation_kind text NOT NULL DEFAULT 'native' CHECK (installation_kind = 'native'),
  platform text NOT NULL CHECK (platform IN ('web', 'ios', 'android', 'desktop')),
  storage_partition_class text NOT NULL CHECK (storage_partition_class IN ('top_level', 'embedded')),
  embed_tenant_id uuid REFERENCES tenants(tenant_id),
  embed_tenant_origin_id uuid,
  installation_auth_profile text NOT NULL CHECK (installation_auth_profile = 'p256-es256-dpop.v1'),
  installation_auth_public_jwk jsonb NOT NULL,
  installation_auth_jkt bytea NOT NULL UNIQUE CHECK (octet_length(installation_auth_jkt) = 32),
  mls_credential_profile text NOT NULL
    CHECK (mls_credential_profile = 'mls-credential-ed25519-suite-0x0001.v1'),
  mls_credential_public bytea NOT NULL CHECK (octet_length(mls_credential_public) = 32),
  mls_credential_fingerprint bytea NOT NULL UNIQUE
    CHECK (octet_length(mls_credential_fingerprint) = 32),
  active_device_credential_id uuid,
  directory_checkpoint_id uuid,
  revocation_version bigint NOT NULL DEFAULT 1
    CHECK (revocation_version BETWEEN 1 AND 9223372036854775807),
  status text NOT NULL CHECK (status IN (
    'pending_verification', 'active', 'suspended', 'revoked', 'superseded', 'deleted'
  )),
  created_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  suspended_at timestamptz,
  revoked_at timestamptz,
  superseded_at timestamptz,
  UNIQUE (installation_id, account_id),
  UNIQUE (
    installation_id, account_id, storage_partition_class,
    embed_tenant_id, embed_tenant_origin_id
  ),
  CHECK (
    (storage_partition_class = 'embedded')
      = (embed_tenant_id IS NOT NULL AND embed_tenant_origin_id IS NOT NULL)
  ),
  CHECK (status <> 'revoked' OR revoked_at IS NOT NULL),
  CHECK (status <> 'suspended' OR suspended_at IS NOT NULL),
  FOREIGN KEY (embed_tenant_origin_id, embed_tenant_id)
    REFERENCES tenant_parent_origins(tenant_origin_id, tenant_id),
  CHECK (status <> 'superseded' OR superseded_at IS NOT NULL)
);
CREATE INDEX installations_account_active_idx ON installations(account_id, status);

CREATE TABLE directory_checkpoints (
  checkpoint_id uuid PRIMARY KEY,
  tree_size bigint NOT NULL CHECK (tree_size BETWEEN 0 AND 9223372036854775807),
  root_hash bytea NOT NULL CHECK (octet_length(root_hash) = 32),
  previous_checkpoint_id uuid REFERENCES directory_checkpoints(checkpoint_id),
  signer_key_id text NOT NULL,
  signature bytea NOT NULL,
  witnessed_at timestamptz,
  witness_receipt bytea,
  created_at timestamptz NOT NULL
);
ALTER TABLE installations ADD CONSTRAINT installations_directory_checkpoint_fk
  FOREIGN KEY (directory_checkpoint_id) REFERENCES directory_checkpoints(checkpoint_id);

CREATE TABLE device_credentials (
  device_credential_id uuid PRIMARY KEY,
  enrollment_id uuid NOT NULL UNIQUE REFERENCES device_enrollment_attempts(enrollment_id),
  enrollment_completion_id uuid NOT NULL UNIQUE,
  installation_id uuid NOT NULL REFERENCES installations(installation_id),
  account_id uuid NOT NULL REFERENCES accounts(account_id),
  wallet_link_id uuid NOT NULL,
  chain_id text NOT NULL,
  credential_profile text NOT NULL CHECK (credential_profile = 'device-credential.v1'),
  installation_auth_jkt bytea NOT NULL CHECK (octet_length(installation_auth_jkt) = 32),
  mls_credential_fingerprint bytea NOT NULL CHECK (octet_length(mls_credential_fingerprint) = 32),
  initial_key_package_ref bytea NOT NULL CHECK (octet_length(initial_key_package_ref) = 32),
  initial_key_package_sha256 bytea NOT NULL CHECK (octet_length(initial_key_package_sha256) = 32),
  device_key_binding_canonical jsonb NOT NULL,
  device_key_binding_hash bytea NOT NULL CHECK (octet_length(device_key_binding_hash) = 32),
  wallet_evidence_digest bytea NOT NULL CHECK (octet_length(wallet_evidence_digest) = 32),
  possession_evidence_digest bytea NOT NULL CHECK (octet_length(possession_evidence_digest) = 32),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revocation_version bigint NOT NULL
    CHECK (revocation_version BETWEEN 1 AND 9223372036854775807),
  role_binding jsonb CHECK (role_binding IS NULL),
  signer_key_id text NOT NULL,
  canonical_payload_bytes bytea NOT NULL,
  canonical_payload_digest bytea NOT NULL UNIQUE CHECK (octet_length(canonical_payload_digest) = 32),
  signature bytea NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'suspended', 'revoked', 'superseded', 'expired')),
  supersedes_device_credential_id uuid UNIQUE REFERENCES device_credentials(device_credential_id),
  superseded_by_device_credential_id uuid UNIQUE REFERENCES device_credentials(device_credential_id),
  suspended_at timestamptz,
  revoked_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL,
  UNIQUE (device_credential_id, installation_id),
  UNIQUE (device_credential_id, installation_id, canonical_payload_digest),
  UNIQUE (device_credential_id, installation_id, account_id),
  UNIQUE (
    device_credential_id, installation_id, account_id,
    installation_auth_jkt, revocation_version
  ),
  UNIQUE (
    device_credential_id, installation_id,
    mls_credential_fingerprint, revocation_version
  ),
  UNIQUE (
    device_credential_id, installation_id, account_id, installation_auth_jkt,
    mls_credential_fingerprint, revocation_version
  ),
  UNIQUE (
    device_credential_id, installation_id, account_id, installation_auth_jkt,
    mls_credential_fingerprint, initial_key_package_ref, initial_key_package_sha256,
    expires_at, revocation_version
  ),
  UNIQUE (installation_id, revocation_version),
  CHECK (expires_at > issued_at),
  CHECK (expires_at <= issued_at + interval '30 days'),
  CHECK (status <> 'suspended' OR suspended_at IS NOT NULL),
  CHECK (status <> 'revoked' OR revoked_at IS NOT NULL),
  CHECK (
    status <> 'superseded'
    OR (superseded_at IS NOT NULL AND superseded_by_device_credential_id IS NOT NULL)
  ),
  FOREIGN KEY (enrollment_completion_id, enrollment_id)
    REFERENCES enrollment_completion_requests(completion_id, enrollment_id),
  FOREIGN KEY (wallet_link_id, account_id)
    REFERENCES wallet_links(wallet_link_id, account_id)
);
CREATE UNIQUE INDEX device_credentials_one_active_installation_idx
  ON device_credentials(installation_id) WHERE status = 'active';

CREATE TABLE device_directory_entries (
  directory_entry_id uuid PRIMARY KEY,
  directory_entry_sequence bigint NOT NULL UNIQUE
    CHECK (directory_entry_sequence BETWEEN 1 AND 9223372036854775807),
  previous_entry_hash bytea NOT NULL CHECK (octet_length(previous_entry_hash) = 32),
  entry_hash bytea NOT NULL UNIQUE CHECK (octet_length(entry_hash) = 32),
  action text NOT NULL CHECK (action IN ('add', 'renew', 'suspend', 'revoke', 'supersede')),
  installation_id uuid NOT NULL REFERENCES installations(installation_id),
  account_id uuid NOT NULL REFERENCES accounts(account_id),
  device_credential_id uuid NOT NULL REFERENCES device_credentials(device_credential_id),
  device_credential_digest bytea NOT NULL CHECK (octet_length(device_credential_digest) = 32),
  installation_auth_jkt bytea NOT NULL CHECK (octet_length(installation_auth_jkt) = 32),
  mls_credential_fingerprint bytea NOT NULL CHECK (octet_length(mls_credential_fingerprint) = 32),
  initial_key_package_ref bytea NOT NULL CHECK (octet_length(initial_key_package_ref) = 32),
  initial_key_package_sha256 bytea NOT NULL CHECK (octet_length(initial_key_package_sha256) = 32),
  credential_expires_at timestamptz NOT NULL,
  revocation_version bigint NOT NULL
    CHECK (revocation_version BETWEEN 1 AND 9223372036854775807),
  checkpoint_id uuid NOT NULL REFERENCES directory_checkpoints(checkpoint_id),
  inclusion_proof bytea NOT NULL,
  consistency_proof bytea NOT NULL,
  witness_receipt_digest bytea NOT NULL CHECK (octet_length(witness_receipt_digest) = 32),
  audit_digest bytea NOT NULL CHECK (octet_length(audit_digest) = 32),
  created_at timestamptz NOT NULL,
  UNIQUE (installation_id, revocation_version),
  FOREIGN KEY (device_credential_id, installation_id)
    REFERENCES device_credentials(device_credential_id, installation_id),
  FOREIGN KEY (device_credential_id, installation_id, device_credential_digest)
    REFERENCES device_credentials(
      device_credential_id, installation_id, canonical_payload_digest
    ),
  FOREIGN KEY (
    device_credential_id, installation_id, account_id, installation_auth_jkt,
    mls_credential_fingerprint, initial_key_package_ref, initial_key_package_sha256,
    credential_expires_at, revocation_version
  ) REFERENCES device_credentials(
    device_credential_id, installation_id, account_id, installation_auth_jkt,
    mls_credential_fingerprint, initial_key_package_ref, initial_key_package_sha256,
    expires_at, revocation_version
  )
);
CREATE INDEX device_directory_installation_idx
  ON device_directory_entries(installation_id, directory_entry_sequence DESC);

ALTER TABLE installations ADD CONSTRAINT installations_active_device_credential_fk
  FOREIGN KEY (
    active_device_credential_id, installation_id, account_id,
    installation_auth_jkt, mls_credential_fingerprint, revocation_version
  ) REFERENCES device_credentials(
    device_credential_id, installation_id, account_id,
    installation_auth_jkt, mls_credential_fingerprint, revocation_version
  );

CREATE TABLE policy_log_checkpoints (
  checkpoint_id uuid PRIMARY KEY,
  tree_size bigint NOT NULL CHECK (tree_size BETWEEN 0 AND 9223372036854775807),
  root_hash bytea NOT NULL CHECK (octet_length(root_hash) = 32),
  previous_checkpoint_id uuid REFERENCES policy_log_checkpoints(checkpoint_id),
  signer_key_id text NOT NULL,
  signature bytea NOT NULL,
  witness_key_id text NOT NULL,
  witness_signature bytea NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE external_sender_credentials (
  external_sender_credential_id uuid PRIMARY KEY,
  project_ref_id uuid NOT NULL REFERENCES project_refs(project_ref_id),
  signer_generation bigint NOT NULL CHECK (signer_generation BETWEEN 1 AND 9223372036854775807),
  signature_domain text NOT NULL DEFAULT 'mls_external_proposal_v1'
    CHECK (signature_domain = 'mls_external_proposal_v1'),
  credential_public bytea NOT NULL,
  credential_fingerprint bytea NOT NULL UNIQUE CHECK (octet_length(credential_fingerprint) = 32),
  not_before timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_checkpoint_id uuid NOT NULL REFERENCES policy_log_checkpoints(checkpoint_id),
  witnessed_at timestamptz NOT NULL,
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('published', 'retired', 'revoked')),
  revoked_checkpoint_id uuid REFERENCES policy_log_checkpoints(checkpoint_id),
  retired_at timestamptz,
  revoked_at timestamptz,
  CHECK ((revoked_checkpoint_id IS NULL) = (revoked_at IS NULL)),
  CHECK (expires_at > not_before),
  CHECK (expires_at <= not_before + interval '90 days'),
  CHECK ((lifecycle_state = 'retired') = (retired_at IS NOT NULL)),
  CHECK ((lifecycle_state = 'revoked') = (revoked_at IS NOT NULL)),
  UNIQUE (project_ref_id, signer_generation),
  UNIQUE (external_sender_credential_id, signer_generation),
  UNIQUE (external_sender_credential_id, credential_fingerprint, signer_generation)
);

CREATE TABLE policy_head_signing_keys (
  policy_head_signing_key_id text PRIMARY KEY,
  project_ref_id uuid NOT NULL REFERENCES project_refs(project_ref_id),
  signature_domain text NOT NULL DEFAULT 'policy_head_v1'
    CHECK (signature_domain = 'policy_head_v1'),
  public_key bytea NOT NULL,
  key_fingerprint bytea NOT NULL UNIQUE CHECK (octet_length(key_fingerprint) = 32),
  not_before timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('active', 'retired', 'revoked')),
  policy_checkpoint_id uuid NOT NULL REFERENCES policy_log_checkpoints(checkpoint_id),
  CHECK (expires_at > not_before)
);

CREATE TABLE step_up_wallet_challenges (
  challenge_id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(account_id),
  installation_id uuid NOT NULL REFERENCES installations(installation_id),
  device_credential_id uuid NOT NULL,
  device_credential_revocation_version bigint NOT NULL
    CHECK (device_credential_revocation_version BETWEEN 1 AND 9223372036854775807),
  wallet_ref_lookup bytea NOT NULL CHECK (octet_length(wallet_ref_lookup) = 32),
  proof_profile text NOT NULL CHECK (proof_profile IN ('siwe-erc4361-v1', 'eip712-device-enrollment-v1')),
  client_id text NOT NULL,
  exact_https_origin text NOT NULL,
  audience text NOT NULL,
  purpose text NOT NULL,
  scope_canonical jsonb NOT NULL,
  scope_hash bytea NOT NULL CHECK (octet_length(scope_hash) = 32),
  nonce_hash bytea NOT NULL UNIQUE CHECK (octet_length(nonce_hash) = 32),
  exact_payload_ciphertext bytea NOT NULL,
  payload_digest bytea NOT NULL UNIQUE CHECK (octet_length(payload_digest) = 32),
  installation_auth_jkt bytea NOT NULL CHECK (octet_length(installation_auth_jkt) = 32),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN ('issued', 'claimed', 'expired')),
  claimed_by_request_id uuid UNIQUE,
  claimed_at timestamptz,
  CHECK (expires_at > issued_at),
  CHECK (expires_at <= issued_at + interval '5 minutes'),
  CHECK ((state = 'claimed') = (claimed_at IS NOT NULL AND claimed_by_request_id IS NOT NULL)),
  FOREIGN KEY (
    device_credential_id, installation_id, account_id,
    installation_auth_jkt, device_credential_revocation_version
  ) REFERENCES device_credentials(
    device_credential_id, installation_id, account_id,
    installation_auth_jkt, revocation_version
  )
);
CREATE INDEX step_up_wallet_challenges_expiry_idx
  ON step_up_wallet_challenges(expires_at, challenge_id);

CREATE TABLE auth_sessions (
  session_id uuid PRIMARY KEY,
  token_family_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES accounts(account_id),
  installation_id uuid NOT NULL REFERENCES installations(installation_id),
  device_credential_id uuid NOT NULL,
  installation_auth_jkt bytea NOT NULL CHECK (octet_length(installation_auth_jkt) = 32),
  device_credential_revocation_version bigint NOT NULL
    CHECK (device_credential_revocation_version BETWEEN 1 AND 9223372036854775807),
  audience text NOT NULL,
  client_id text NOT NULL,
  exact_https_origin text,
  session_profile text NOT NULL CHECK (session_profile IN (
    'native_dpop', 'browser_dpop', 'cookie_bff', 'embedded_cookie_bff'
  )),
  embed_tenant_id uuid REFERENCES tenants(tenant_id),
  embed_tenant_origin_id uuid,
  installation_partition_class text NOT NULL CHECK (
    installation_partition_class IN ('top_level', 'embedded')
  ),
  access_token_hash bytea NOT NULL UNIQUE CHECK (octet_length(access_token_hash) = 32),
  refresh_token_hash bytea NOT NULL UNIQUE CHECK (octet_length(refresh_token_hash) = 32),
  csrf_token_hash bytea CHECK (octet_length(csrf_token_hash) = 32),
  refresh_generation bigint NOT NULL CHECK (refresh_generation BETWEEN 0 AND 9223372036854775807),
  state text NOT NULL CHECK (state IN ('active', 'rotated', 'revoked', 'expired')),
  created_at timestamptz NOT NULL,
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  rotated_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  CHECK (access_expires_at > created_at),
  CHECK (refresh_expires_at >= access_expires_at),
  UNIQUE (session_id, embed_tenant_id, embed_tenant_origin_id),
  CHECK ((session_profile = 'native_dpop') OR exact_https_origin IS NOT NULL),
  CHECK (
    (session_profile IN ('cookie_bff', 'embedded_cookie_bff')) = (csrf_token_hash IS NOT NULL)
  ),
  CHECK (
    (session_profile = 'embedded_cookie_bff')
      = (embed_tenant_id IS NOT NULL AND embed_tenant_origin_id IS NOT NULL)
  ),
  CHECK (
    (session_profile = 'embedded_cookie_bff')
      = (installation_partition_class = 'embedded')
  ),
  CHECK (state <> 'rotated' OR rotated_at IS NOT NULL),
  CHECK (state <> 'revoked' OR revoked_at IS NOT NULL),
  FOREIGN KEY (
    device_credential_id, installation_id, account_id,
    installation_auth_jkt, device_credential_revocation_version
  ) REFERENCES device_credentials(
    device_credential_id, installation_id, account_id,
    installation_auth_jkt, revocation_version
  ),
  FOREIGN KEY (embed_tenant_origin_id, embed_tenant_id)
    REFERENCES tenant_parent_origins(tenant_origin_id, tenant_id),
  FOREIGN KEY (installation_id, account_id)
    REFERENCES installations(installation_id, account_id),
  FOREIGN KEY (
    installation_id, account_id, installation_partition_class,
    embed_tenant_id, embed_tenant_origin_id
  ) REFERENCES installations(
    installation_id, account_id, storage_partition_class,
    embed_tenant_id, embed_tenant_origin_id
  )
);
CREATE INDEX auth_sessions_installation_idx
  ON auth_sessions(installation_id, refresh_expires_at);
CREATE INDEX auth_sessions_family_idx ON auth_sessions(token_family_id);
CREATE INDEX auth_sessions_credential_idx
  ON auth_sessions(device_credential_id, state, refresh_expires_at);

CREATE TABLE embed_contexts (
  embed_context_id uuid PRIMARY KEY,
  context_handle_hash bytea NOT NULL UNIQUE CHECK (octet_length(context_handle_hash) = 32),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id),
  tenant_origin_id uuid NOT NULL,
  embed_issuer_client_id uuid NOT NULL,
  canonical_parent_origin text NOT NULL,
  frame_audience text NOT NULL,
  host_client_id text NOT NULL,
  purpose text NOT NULL,
  action text NOT NULL,
  context_kind text NOT NULL CHECK (context_kind = 'opaque-host-resource.v1'),
  scope_canonical jsonb NOT NULL,
  scope_hash bytea NOT NULL CHECK (octet_length(scope_hash) = 32),
  resource_ref_lookup bytea NOT NULL CHECK (octet_length(resource_ref_lookup) = 32),
  resource_ref_ciphertext bytea NOT NULL,
  resource_ref_kms_key_version text NOT NULL,
  creation_nonce_hash bytea NOT NULL UNIQUE CHECK (octet_length(creation_nonce_hash) = 32),
  state text NOT NULL CHECK (state IN ('issued', 'claimed', 'redeemed', 'invalid', 'expired', 'revoked')),
  claimed_by_redemption_id uuid UNIQUE,
  issued_at timestamptz NOT NULL,
  not_before timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  terminal_reason_code text,
  purge_after timestamptz NOT NULL,
  FOREIGN KEY (tenant_origin_id, tenant_id)
    REFERENCES tenant_parent_origins(tenant_origin_id, tenant_id),
  FOREIGN KEY (embed_issuer_client_id, tenant_id)
    REFERENCES embed_issuer_clients(embed_issuer_client_id, tenant_id),
  CHECK (expires_at > not_before),
  CHECK (expires_at <= issued_at + interval '2 minutes'),
  CHECK ((claimed_by_redemption_id IS NULL) = (claimed_at IS NULL)),
  CHECK (state NOT IN ('claimed', 'redeemed', 'invalid') OR claimed_at IS NOT NULL),
  CHECK (state NOT IN ('issued', 'expired') OR claimed_at IS NULL),
  CHECK (state <> 'redeemed' OR redeemed_at IS NOT NULL),
  CHECK (state NOT IN ('issued', 'claimed', 'invalid', 'expired') OR redeemed_at IS NULL),
  CHECK (state <> 'revoked' OR revoked_at IS NOT NULL),
  CHECK (state NOT IN ('invalid', 'expired', 'revoked') OR terminal_reason_code IS NOT NULL),
  UNIQUE (
    embed_context_id, tenant_id, tenant_origin_id, embed_issuer_client_id,
    canonical_parent_origin, frame_audience, host_client_id, purpose, action,
    scope_hash, resource_ref_lookup
  )
);
CREATE INDEX embed_contexts_expiry_idx
  ON embed_contexts(expires_at, embed_context_id) WHERE state = 'issued';
CREATE INDEX embed_contexts_origin_live_idx
  ON embed_contexts(tenant_origin_id, state, expires_at)
  WHERE state IN ('issued', 'claimed', 'redeemed');

CREATE TABLE embed_context_redemptions (
  embed_redemption_id uuid PRIMARY KEY,
  embed_context_id uuid NOT NULL UNIQUE REFERENCES embed_contexts(embed_context_id),
  request_sha256 bytea NOT NULL CHECK (octet_length(request_sha256) = 32),
  protocol text NOT NULL CHECK (protocol = 'org.juicebox.messaging.embed'),
  protocol_version integer NOT NULL CHECK (protocol_version = 1),
  channel_id_hash bytea NOT NULL UNIQUE CHECK (octet_length(channel_id_hash) = 32),
  bootstrap_nonce_hash bytea NOT NULL CHECK (octet_length(bootstrap_nonce_hash) = 32),
  parent_nonce_hash bytea NOT NULL CHECK (octet_length(parent_nonce_hash) = 32),
  frame_nonce_hash bytea NOT NULL CHECK (octet_length(frame_nonce_hash) = 32),
  state text NOT NULL CHECK (state IN ('claimed', 'redeemed', 'invalid', 'revoked')),
  embed_session_id uuid UNIQUE,
  claimed_at timestamptz NOT NULL,
  completed_at timestamptz,
  terminal_reason_code text,
  purge_after timestamptz NOT NULL,
  CHECK (state = 'claimed' OR completed_at IS NOT NULL),
  CHECK (state <> 'redeemed' OR embed_session_id IS NOT NULL),
  CHECK (state NOT IN ('claimed', 'invalid') OR embed_session_id IS NULL),
  CHECK (state NOT IN ('invalid', 'revoked') OR terminal_reason_code IS NOT NULL),
  UNIQUE (embed_redemption_id, embed_context_id),
  UNIQUE (
    embed_redemption_id, embed_context_id, channel_id_hash, bootstrap_nonce_hash,
    parent_nonce_hash, frame_nonce_hash
  )
);

CREATE TABLE embed_sessions (
  embed_session_id uuid PRIMARY KEY,
  embed_session_token_hash bytea NOT NULL UNIQUE
    CHECK (octet_length(embed_session_token_hash) = 32),
  previous_embed_session_token_hash bytea UNIQUE
    CHECK (octet_length(previous_embed_session_token_hash) = 32),
  token_generation integer NOT NULL CHECK (token_generation IN (1, 2)),
  embed_context_id uuid NOT NULL UNIQUE REFERENCES embed_contexts(embed_context_id),
  embed_redemption_id uuid NOT NULL UNIQUE
    REFERENCES embed_context_redemptions(embed_redemption_id),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id),
  tenant_origin_id uuid NOT NULL,
  embed_issuer_client_id uuid NOT NULL,
  authenticated_session_id uuid REFERENCES auth_sessions(session_id),
  canonical_parent_origin text NOT NULL,
  frame_audience text NOT NULL,
  host_client_id text NOT NULL,
  purpose text NOT NULL,
  action text NOT NULL,
  scope_hash bytea NOT NULL CHECK (octet_length(scope_hash) = 32),
  resource_ref_lookup bytea NOT NULL CHECK (octet_length(resource_ref_lookup) = 32),
  channel_id_hash bytea NOT NULL UNIQUE CHECK (octet_length(channel_id_hash) = 32),
  bootstrap_nonce_hash bytea NOT NULL CHECK (octet_length(bootstrap_nonce_hash) = 32),
  parent_nonce_hash bytea NOT NULL CHECK (octet_length(parent_nonce_hash) = 32),
  frame_nonce_hash bytea NOT NULL CHECK (octet_length(frame_nonce_hash) = 32),
  cookie_profile text NOT NULL
    CHECK (cookie_profile = '__Host-secure-httponly-samesite-none-partitioned.v1'),
  state text NOT NULL CHECK (state IN ('unauthenticated', 'authenticated', 'revoked', 'expired')),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  authenticated_at timestamptz,
  token_rotated_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  purge_after timestamptz NOT NULL,
  FOREIGN KEY (tenant_origin_id, tenant_id)
    REFERENCES tenant_parent_origins(tenant_origin_id, tenant_id),
  FOREIGN KEY (embed_issuer_client_id, tenant_id)
    REFERENCES embed_issuer_clients(embed_issuer_client_id, tenant_id),
  FOREIGN KEY (authenticated_session_id, tenant_id, tenant_origin_id)
    REFERENCES auth_sessions(session_id, embed_tenant_id, embed_tenant_origin_id),
  FOREIGN KEY (
    embed_context_id, tenant_id, tenant_origin_id, embed_issuer_client_id,
    canonical_parent_origin, frame_audience, host_client_id, purpose, action,
    scope_hash, resource_ref_lookup
  ) REFERENCES embed_contexts(
    embed_context_id, tenant_id, tenant_origin_id, embed_issuer_client_id,
    canonical_parent_origin, frame_audience, host_client_id, purpose, action,
    scope_hash, resource_ref_lookup
  ),
  FOREIGN KEY (
    embed_redemption_id, embed_context_id, channel_id_hash, bootstrap_nonce_hash,
    parent_nonce_hash, frame_nonce_hash
  ) REFERENCES embed_context_redemptions(
    embed_redemption_id, embed_context_id, channel_id_hash, bootstrap_nonce_hash,
    parent_nonce_hash, frame_nonce_hash
  ),
  CHECK (expires_at > issued_at),
  CHECK (expires_at <= issued_at + interval '10 minutes'),
  CHECK (
    state <> 'unauthenticated'
    OR (authenticated_at IS NULL AND authenticated_session_id IS NULL
      AND token_generation = 1 AND previous_embed_session_token_hash IS NULL
      AND token_rotated_at IS NULL)
  ),
  CHECK (
    state <> 'authenticated'
    OR (authenticated_at IS NOT NULL AND authenticated_session_id IS NOT NULL
      AND token_generation = 2 AND previous_embed_session_token_hash IS NOT NULL
      AND token_rotated_at IS NOT NULL)
  ),
  CHECK (state <> 'revoked' OR revoked_at IS NOT NULL)
);
ALTER TABLE embed_contexts ADD CONSTRAINT embed_context_claim_fk
  FOREIGN KEY (claimed_by_redemption_id, embed_context_id)
  REFERENCES embed_context_redemptions(embed_redemption_id, embed_context_id);
ALTER TABLE embed_context_redemptions ADD CONSTRAINT embed_redemption_session_fk
  FOREIGN KEY (embed_session_id)
  REFERENCES embed_sessions(embed_session_id);
CREATE INDEX embed_sessions_origin_live_idx
  ON embed_sessions(tenant_origin_id, state, expires_at)
  WHERE state IN ('unauthenticated', 'authenticated');
CREATE INDEX embed_sessions_auth_session_idx
  ON embed_sessions(authenticated_session_id, state)
  WHERE authenticated_session_id IS NOT NULL;
CREATE INDEX embed_sessions_previous_token_idx
  ON embed_sessions(previous_embed_session_token_hash)
  WHERE previous_embed_session_token_hash IS NOT NULL;

CREATE TABLE key_packages (
  key_package_ref bytea PRIMARY KEY CHECK (octet_length(key_package_ref) = 32),
  installation_id uuid NOT NULL REFERENCES installations(installation_id),
  device_credential_id uuid NOT NULL,
  device_credential_revocation_version bigint NOT NULL
    CHECK (device_credential_revocation_version BETWEEN 1 AND 9223372036854775807),
  release_profile_id text NOT NULL,
  package_bytes bytea CHECK (package_bytes IS NULL OR octet_length(package_bytes) <= 262144),
  package_sha256 bytea NOT NULL CHECK (octet_length(package_sha256) = 32),
  mls_credential_fingerprint bytea NOT NULL
    CHECK (octet_length(mls_credential_fingerprint) = 32),
  package_kind text NOT NULL DEFAULT 'ordinary-mls-key-package.v1'
    CHECK (package_kind = 'ordinary-mls-key-package.v1'),
  state text NOT NULL CHECK (state IN ('available', 'taken', 'used', 'destroyed', 'revoked')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  taken_at timestamptz,
  taken_by_plan_id uuid,
  taken_by_intent_id uuid,
  used_at timestamptz,
  destroyed_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (key_package_ref, package_sha256, device_credential_id, installation_id),
  FOREIGN KEY (
    device_credential_id, installation_id,
    mls_credential_fingerprint, device_credential_revocation_version
  ) REFERENCES device_credentials(
    device_credential_id, installation_id,
    mls_credential_fingerprint, revocation_version
  ),
  CHECK (
    (taken_at IS NULL AND taken_by_plan_id IS NULL AND taken_by_intent_id IS NULL)
    OR (taken_at IS NOT NULL AND ((taken_by_plan_id IS NOT NULL) <> (taken_by_intent_id IS NOT NULL)))
  ),
  CHECK (
    (state = 'available' AND package_bytes IS NOT NULL AND taken_at IS NULL
      AND used_at IS NULL AND destroyed_at IS NULL AND revoked_at IS NULL)
    OR (state = 'taken' AND package_bytes IS NOT NULL AND taken_at IS NOT NULL
      AND used_at IS NULL AND destroyed_at IS NULL AND revoked_at IS NULL)
    OR (state = 'used' AND package_bytes IS NOT NULL AND taken_at IS NOT NULL
      AND used_at IS NOT NULL AND destroyed_at IS NULL AND revoked_at IS NULL)
    OR (state = 'destroyed' AND package_bytes IS NULL AND taken_at IS NOT NULL
      AND destroyed_at IS NOT NULL AND revoked_at IS NULL)
    OR (state = 'revoked' AND package_bytes IS NULL AND taken_at IS NULL
      AND used_at IS NULL AND destroyed_at IS NOT NULL AND revoked_at IS NOT NULL)
  )
);
CREATE INDEX key_packages_available_idx
  ON key_packages(installation_id, device_credential_id, expires_at)
  WHERE state = 'available' AND taken_at IS NULL;
ALTER TABLE device_credentials ADD CONSTRAINT device_credentials_initial_key_package_fk
  FOREIGN KEY (
    initial_key_package_ref, initial_key_package_sha256, device_credential_id, installation_id
  ) REFERENCES key_packages(
    key_package_ref, package_sha256, device_credential_id, installation_id
  ) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE eligibility_grants (
  grant_id uuid PRIMARY KEY,
  project_ref_id uuid NOT NULL REFERENCES project_refs(project_ref_id),
  account_id uuid NOT NULL REFERENCES accounts(account_id),
  installation_id uuid NOT NULL REFERENCES installations(installation_id),
  capability text NOT NULL CHECK (
    capability IN ('purchase-support', 'project-staff', 'token-holder', 'item-set-buyer')
  ),
  policy_id uuid NOT NULL,
  policy_revision bigint NOT NULL CHECK (policy_revision BETWEEN 1 AND 9223372036854775807),
  policy_hash bytea NOT NULL CHECK (octet_length(policy_hash) = 32),
  subject_hash bytea NOT NULL CHECK (octet_length(subject_hash) = 32),
  claim_handle_hash bytea UNIQUE CHECK (octet_length(claim_handle_hash) = 32),
  finality_profile_id uuid NOT NULL,
  finality_profile_revision bigint NOT NULL
    CHECK (finality_profile_revision BETWEEN 1 AND 9223372036854775807),
  finality_profile_hash bytea NOT NULL CHECK (octet_length(finality_profile_hash) = 32),
  finality_evidence_digest bytea NOT NULL CHECK (octet_length(finality_evidence_digest) = 32),
  source_chain_id text NOT NULL,
  source_block bigint NOT NULL CHECK (source_block BETWEEN 0 AND 9223372036854775807),
  source_block_hash bytea NOT NULL CHECK (octet_length(source_block_hash) = 32),
  finality_status text NOT NULL CHECK (finality_status IN (
    'verified-finalized', 'unavailable', 'orphaned'
  )),
  state text NOT NULL CHECK (state IN ('active', 'suspended', 'revoked', 'expired')),
  issued_at timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  suspended_at timestamptz,
  revoked_at timestamptz,
  CHECK (state <> 'active' OR finality_status = 'verified-finalized'),
  CHECK (state <> 'suspended' OR (suspended_at IS NOT NULL AND finality_status = 'unavailable')),
  CHECK (state <> 'revoked' OR revoked_at IS NOT NULL),
  CHECK (finality_status <> 'orphaned' OR state = 'revoked'),
  FOREIGN KEY (policy_id, policy_revision) REFERENCES policies(policy_id, policy_revision),
  FOREIGN KEY (finality_profile_id, finality_profile_revision, finality_profile_hash)
    REFERENCES chain_finality_profiles(finality_profile_id, profile_revision, profile_hash)
);
CREATE INDEX eligibility_active_idx
  ON eligibility_grants(account_id, project_ref_id, capability, valid_until)
  WHERE state = 'active';

CREATE TABLE contact_preferences (
  project_ref_id uuid NOT NULL REFERENCES project_refs(project_ref_id),
  account_id uuid NOT NULL REFERENCES accounts(account_id),
  consent_class text NOT NULL CHECK (consent_class IN ('support', 'transactional', 'community', 'marketing')),
  state text NOT NULL CHECK (state IN ('consented', 'unsubscribed')),
  policy_revision bigint NOT NULL CHECK (policy_revision BETWEEN 1 AND 9223372036854775807),
  changed_at timestamptz NOT NULL,
  PRIMARY KEY (project_ref_id, account_id, consent_class)
);

CREATE TABLE account_blocks (
  project_ref_id uuid NOT NULL REFERENCES project_refs(project_ref_id),
  account_id uuid NOT NULL REFERENCES accounts(account_id),
  blocked_at timestamptz NOT NULL,
  PRIMARY KEY (project_ref_id, account_id)
);

CREATE TABLE relationships (
  relationship_id uuid PRIMARY KEY,
  relationship_scope_id uuid NOT NULL,
  project_ref_id uuid NOT NULL REFERENCES project_refs(project_ref_id),
  customer_account_id uuid NOT NULL REFERENCES accounts(account_id),
  policy_profile_id text NOT NULL,
  reader_history_retention_policy jsonb NOT NULL,
  reader_history_retention_policy_hash bytea NOT NULL
    CHECK (octet_length(reader_history_retention_policy_hash) = 32),
  state text NOT NULL CHECK (state IN ('active', 'blocked', 'closed', 'deleting')),
  active_conversation_id uuid,
  created_at timestamptz NOT NULL,
  closed_at timestamptz,
  UNIQUE (project_ref_id, customer_account_id, relationship_scope_id),
  UNIQUE (relationship_id, project_ref_id),
  UNIQUE (relationship_id, relationship_scope_id, reader_history_retention_policy_hash)
);

CREATE TABLE conversation_plans (
  plan_id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL UNIQUE,
  relationship_id uuid REFERENCES relationships(relationship_id),
  relationship_scope_id uuid,
  project_ref_id uuid NOT NULL REFERENCES project_refs(project_ref_id),
  creator_account_id uuid NOT NULL REFERENCES accounts(account_id),
  creator_installation_id uuid NOT NULL REFERENCES installations(installation_id),
  kind text NOT NULL CHECK (kind IN ('relationship', 'community_room')),
  generation bigint NOT NULL CHECK (generation BETWEEN 1 AND 9223372036854775807),
  roster_canonical jsonb NOT NULL,
  roster_hash bytea NOT NULL CHECK (octet_length(roster_hash) = 32),
  external_senders_canonical jsonb NOT NULL,
  external_senders_hash bytea NOT NULL CHECK (octet_length(external_senders_hash) = 32),
  reader_history_retention_policy_hash bytea NOT NULL
    CHECK (octet_length(reader_history_retention_policy_hash) = 32),
  plan_version bigint NOT NULL CHECK (plan_version BETWEEN 1 AND 9223372036854775807),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  supersedes_conversation_id uuid,
  migration_reason text CHECK (migration_reason IN ('external_sender_rotation', 'crypto_profile', 'policy_scope')),
  migration_statement_hash bytea CHECK (octet_length(migration_statement_hash) = 32),
  CHECK ((supersedes_conversation_id IS NULL) = (migration_reason IS NULL)),
  CHECK ((supersedes_conversation_id IS NULL) = (migration_statement_hash IS NULL)),
  CHECK ((kind = 'relationship') = (relationship_id IS NOT NULL)),
  CHECK ((kind = 'relationship') = (relationship_scope_id IS NOT NULL)),
  FOREIGN KEY (relationship_id, relationship_scope_id, reader_history_retention_policy_hash)
    REFERENCES relationships(relationship_id, relationship_scope_id, reader_history_retention_policy_hash)
);
CREATE INDEX conversation_plans_expiry_idx ON conversation_plans(expires_at);
ALTER TABLE key_packages ADD CONSTRAINT key_packages_taken_plan_fk
  FOREIGN KEY (taken_by_plan_id) REFERENCES conversation_plans(plan_id);

CREATE TABLE conversations (
  conversation_id uuid PRIMARY KEY,
  relationship_id uuid REFERENCES relationships(relationship_id),
  relationship_scope_id uuid,
  project_ref_id uuid NOT NULL REFERENCES project_refs(project_ref_id),
  kind text NOT NULL CHECK (kind IN ('relationship', 'community_room')),
  generation bigint NOT NULL CHECK (generation BETWEEN 1 AND 9223372036854775807),
  state text NOT NULL CHECK (state IN (
    'provisioning', 'active', 'membership_pending', 'suspended', 'closing', 'closed',
    'retention_expired', 'purged'
  )),
  group_id_hash bytea NOT NULL UNIQUE CHECK (octet_length(group_id_hash) = 32),
  release_profile_id text NOT NULL,
  epoch bigint NOT NULL CHECK (epoch BETWEEN 0 AND 9223372036854775807),
  roster_version bigint NOT NULL CHECK (roster_version BETWEEN 0 AND 9223372036854775807),
  roster_hash bytea NOT NULL CHECK (octet_length(roster_hash) = 32),
  external_senders_hash bytea NOT NULL CHECK (octet_length(external_senders_hash) = 32),
  reader_history_retention_policy_hash bytea NOT NULL
    CHECK (octet_length(reader_history_retention_policy_hash) = 32),
  confirmed_transcript_hash bytea NOT NULL CHECK (octet_length(confirmed_transcript_hash) = 32),
  last_policy_head_sequence bigint NOT NULL DEFAULT 0
    CHECK (last_policy_head_sequence BETWEEN 0 AND 9223372036854775807),
  current_policy_head_hash bytea NOT NULL CHECK (octet_length(current_policy_head_hash) = 32),
  last_position bigint NOT NULL DEFAULT 0 CHECK (last_position BETWEEN 0 AND 9223372036854775807),
  current_log_head_hash bytea NOT NULL CHECK (octet_length(current_log_head_hash) = 32),
  retention_policy_version integer NOT NULL,
  retention_policy jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  last_activity_at timestamptz NOT NULL,
  closed_at timestamptz,
  expires_at timestamptz NOT NULL,
  purge_after timestamptz,
  supersedes_conversation_id uuid REFERENCES conversations(conversation_id),
  migration_reason text CHECK (migration_reason IN ('external_sender_rotation', 'crypto_profile', 'policy_scope')),
  migration_statement_hash bytea CHECK (octet_length(migration_statement_hash) = 32),
  CHECK ((supersedes_conversation_id IS NULL) = (migration_reason IS NULL)),
  CHECK ((supersedes_conversation_id IS NULL) = (migration_statement_hash IS NULL)),
  CHECK ((kind = 'relationship') = (relationship_id IS NOT NULL)),
  CHECK ((kind = 'relationship') = (relationship_scope_id IS NOT NULL)),
  UNIQUE (relationship_id, generation),
  UNIQUE (conversation_id, relationship_id, relationship_scope_id, reader_history_retention_policy_hash),
  FOREIGN KEY (relationship_id, relationship_scope_id, reader_history_retention_policy_hash)
    REFERENCES relationships(relationship_id, relationship_scope_id, reader_history_retention_policy_hash)
);
ALTER TABLE relationships ADD CONSTRAINT relationships_active_conversation_fk
  FOREIGN KEY (
    active_conversation_id, relationship_id, relationship_scope_id,
    reader_history_retention_policy_hash
  ) REFERENCES conversations(
    conversation_id, relationship_id, relationship_scope_id,
    reader_history_retention_policy_hash
  );
ALTER TABLE conversation_plans ADD CONSTRAINT conversation_plans_supersedes_fk
  FOREIGN KEY (supersedes_conversation_id) REFERENCES conversations(conversation_id);
CREATE INDEX conversations_project_idx
  ON conversations(project_ref_id, state, last_activity_at DESC);
CREATE INDEX conversations_expiry_idx ON conversations(expires_at, conversation_id);
CREATE UNIQUE INDEX conversations_one_live_generation_per_scope_idx
  ON conversations(relationship_id)
  WHERE kind = 'relationship'
    AND state IN ('provisioning', 'active', 'membership_pending', 'suspended');

CREATE TABLE conversation_external_senders (
  conversation_id uuid NOT NULL REFERENCES conversations(conversation_id),
  slot text NOT NULL CHECK (slot IN ('current', 'staged_next')),
  external_sender_credential_id uuid NOT NULL
    REFERENCES external_sender_credentials(external_sender_credential_id),
  credential_fingerprint bytea NOT NULL CHECK (octet_length(credential_fingerprint) = 32),
  signer_generation bigint NOT NULL CHECK (signer_generation BETWEEN 1 AND 9223372036854775807),
  extension_ordinal integer NOT NULL CHECK (extension_ordinal >= 0),
  created_checkpoint_id uuid NOT NULL REFERENCES policy_log_checkpoints(checkpoint_id),
  PRIMARY KEY (conversation_id, slot),
  UNIQUE (conversation_id, external_sender_credential_id),
  UNIQUE (conversation_id, extension_ordinal),
  FOREIGN KEY (external_sender_credential_id, credential_fingerprint, signer_generation)
    REFERENCES external_sender_credentials(
      external_sender_credential_id, credential_fingerprint, signer_generation
    )
);

CREATE TABLE signer_security_ledger (
  project_ref_id uuid NOT NULL REFERENCES project_refs(project_ref_id),
  security_ledger_sequence bigint NOT NULL
    CHECK (security_ledger_sequence BETWEEN 1 AND 9223372036854775807),
  previous_entry_hash bytea NOT NULL CHECK (octet_length(previous_entry_hash) = 32),
  entry_hash bytea NOT NULL CHECK (octet_length(entry_hash) = 32),
  action text NOT NULL CHECK (action IN (
    'published', 'authorized', 'retired', 'revoked', 'migration_scheduled',
    'emergency_frozen', 'cutover_verified', 'migration_complete', 'blocked'
  )),
  external_sender_credential_id uuid REFERENCES external_sender_credentials(external_sender_credential_id),
  signer_generation bigint CHECK (signer_generation BETWEEN 1 AND 9223372036854775807),
  policy_checkpoint_id uuid NOT NULL REFERENCES policy_log_checkpoints(checkpoint_id),
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (project_ref_id, security_ledger_sequence),
  UNIQUE (project_ref_id, security_ledger_sequence, entry_hash),
  UNIQUE (project_ref_id, entry_hash),
  FOREIGN KEY (external_sender_credential_id, signer_generation)
    REFERENCES external_sender_credentials(external_sender_credential_id, signer_generation)
);

CREATE TABLE signer_migrations (
  signer_migration_id uuid PRIMARY KEY,
  project_ref_id uuid NOT NULL REFERENCES project_refs(project_ref_id),
  relationship_id uuid NOT NULL REFERENCES relationships(relationship_id),
  predecessor_conversation_id uuid NOT NULL UNIQUE REFERENCES conversations(conversation_id),
  successor_plan_id uuid UNIQUE REFERENCES conversation_plans(plan_id),
  successor_conversation_id uuid UNIQUE REFERENCES conversations(conversation_id),
  reason text NOT NULL CHECK (reason IN ('scheduled_rotation', 'emergency_compromise')),
  state text NOT NULL CHECK (state IN (
    'scheduled', 'emergency_frozen', 'successor_provisioning', 'successor_ready',
    'cutover_verified', 'complete', 'blocked'
  )),
  predecessor_current_credential_id uuid NOT NULL,
  predecessor_current_fingerprint bytea NOT NULL CHECK (octet_length(predecessor_current_fingerprint) = 32),
  predecessor_current_signer_generation bigint NOT NULL
    CHECK (predecessor_current_signer_generation BETWEEN 1 AND 9223372036854775807),
  predecessor_staged_credential_id uuid NOT NULL,
  predecessor_staged_fingerprint bytea NOT NULL CHECK (octet_length(predecessor_staged_fingerprint) = 32),
  predecessor_staged_signer_generation bigint NOT NULL
    CHECK (predecessor_staged_signer_generation BETWEEN 1 AND 9223372036854775807),
  successor_current_credential_id uuid NOT NULL,
  successor_current_fingerprint bytea NOT NULL CHECK (octet_length(successor_current_fingerprint) = 32),
  successor_current_signer_generation bigint NOT NULL
    CHECK (successor_current_signer_generation BETWEEN 1 AND 9223372036854775807),
  successor_staged_credential_id uuid NOT NULL,
  successor_staged_fingerprint bytea NOT NULL CHECK (octet_length(successor_staged_fingerprint) = 32),
  successor_staged_signer_generation bigint NOT NULL
    CHECK (successor_staged_signer_generation BETWEEN 1 AND 9223372036854775807),
  source_policy_checkpoint_id uuid NOT NULL REFERENCES policy_log_checkpoints(checkpoint_id),
  target_policy_checkpoint_id uuid NOT NULL REFERENCES policy_log_checkpoints(checkpoint_id),
  security_ledger_sequence bigint NOT NULL
    CHECK (security_ledger_sequence BETWEEN 1 AND 9223372036854775807),
  security_ledger_entry_hash bytea NOT NULL CHECK (octet_length(security_ledger_entry_hash) = 32),
  successor_not_before timestamptz NOT NULL,
  dual_overlap_ends_at timestamptz NOT NULL,
  last_authorized_signer_expires_at timestamptz NOT NULL,
  deadline_at timestamptz NOT NULL,
  emergency_decided_at timestamptz,
  emergency_frozen_at timestamptz,
  migration_statement_hash bytea CHECK (octet_length(migration_statement_hash) = 32),
  blocked_reason text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz,
  CHECK (dual_overlap_ends_at >= successor_not_before),
  CHECK (dual_overlap_ends_at <= successor_not_before + interval '14 days'),
  CHECK (deadline_at <= last_authorized_signer_expires_at - interval '30 days'),
  CHECK (predecessor_current_credential_id <> predecessor_staged_credential_id),
  CHECK (successor_current_credential_id <> successor_staged_credential_id),
  CHECK (predecessor_staged_signer_generation > predecessor_current_signer_generation),
  CHECK (successor_current_signer_generation > predecessor_current_signer_generation),
  CHECK (successor_staged_signer_generation > successor_current_signer_generation),
  CHECK ((reason = 'emergency_compromise') = (emergency_decided_at IS NOT NULL)),
  CHECK ((reason = 'emergency_compromise') = (emergency_frozen_at IS NOT NULL)),
  CHECK ((emergency_frozen_at IS NULL) OR
    (emergency_frozen_at <= emergency_decided_at + interval '5 minutes')),
  CHECK ((state = 'complete') = (completed_at IS NOT NULL)),
  CHECK ((state = 'blocked') = (blocked_reason IS NOT NULL)),
  CHECK (state NOT IN ('cutover_verified', 'complete') OR successor_conversation_id IS NOT NULL),
  CHECK (state NOT IN ('scheduled', 'emergency_frozen') OR successor_plan_id IS NULL),
  CHECK (state NOT IN ('successor_provisioning', 'successor_ready', 'cutover_verified', 'complete')
    OR successor_plan_id IS NOT NULL),
  FOREIGN KEY (relationship_id, project_ref_id)
    REFERENCES relationships(relationship_id, project_ref_id),
  FOREIGN KEY (project_ref_id, security_ledger_sequence, security_ledger_entry_hash)
    REFERENCES signer_security_ledger(project_ref_id, security_ledger_sequence, entry_hash),
  FOREIGN KEY (
    predecessor_current_credential_id, predecessor_current_fingerprint,
    predecessor_current_signer_generation
  ) REFERENCES external_sender_credentials(
    external_sender_credential_id, credential_fingerprint, signer_generation
  ),
  FOREIGN KEY (
    predecessor_staged_credential_id, predecessor_staged_fingerprint,
    predecessor_staged_signer_generation
  ) REFERENCES external_sender_credentials(
    external_sender_credential_id, credential_fingerprint, signer_generation
  ),
  FOREIGN KEY (
    successor_current_credential_id, successor_current_fingerprint,
    successor_current_signer_generation
  ) REFERENCES external_sender_credentials(
    external_sender_credential_id, credential_fingerprint, signer_generation
  ),
  FOREIGN KEY (
    successor_staged_credential_id, successor_staged_fingerprint,
    successor_staged_signer_generation
  ) REFERENCES external_sender_credentials(
    external_sender_credential_id, credential_fingerprint, signer_generation
  )
);
CREATE INDEX signer_migrations_deadline_idx ON signer_migrations(deadline_at, state)
  WHERE state NOT IN ('complete', 'blocked');

CREATE TABLE role_credentials (
  credential_id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(conversation_id),
  installation_id uuid NOT NULL REFERENCES installations(installation_id),
  account_id uuid NOT NULL REFERENCES accounts(account_id),
  policy_id uuid NOT NULL,
  policy_revision bigint NOT NULL CHECK (policy_revision BETWEEN 1 AND 9223372036854775807),
  role text NOT NULL CHECK (role IN (
    'customer', 'project-staff', 'member', 'moderator'
  )),
  credential_public bytea NOT NULL,
  credential_fingerprint bytea NOT NULL CHECK (octet_length(credential_fingerprint) = 32),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  UNIQUE (conversation_id, installation_id, credential_fingerprint),
  FOREIGN KEY (policy_id, policy_revision) REFERENCES policies(policy_id, policy_revision)
);

CREATE TABLE memberships (
  conversation_id uuid NOT NULL REFERENCES conversations(conversation_id),
  installation_id uuid NOT NULL REFERENCES installations(installation_id),
  account_id uuid NOT NULL REFERENCES accounts(account_id),
  credential_id uuid NOT NULL REFERENCES role_credentials(credential_id),
  role text NOT NULL,
  joined_position bigint NOT NULL CHECK (joined_position BETWEEN 1 AND 9223372036854775807),
  removed_position bigint CHECK (
    removed_position BETWEEN joined_position AND 9223372036854775807
  ),
  joined_at timestamptz NOT NULL,
  removed_at timestamptz,
  PRIMARY KEY (conversation_id, installation_id),
  CHECK ((removed_position IS NULL) = (removed_at IS NULL))
);
CREATE INDEX memberships_installation_idx
  ON memberships(installation_id, removed_at, conversation_id);
CREATE INDEX memberships_active_conversation_idx
  ON memberships(conversation_id, role) WHERE removed_at IS NULL;

CREATE TABLE policy_heads (
  policy_head_id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(conversation_id),
  policy_head_sequence bigint NOT NULL
    CHECK (policy_head_sequence BETWEEN 1 AND 9223372036854775807),
  previous_policy_head_hash bytea NOT NULL CHECK (octet_length(previous_policy_head_hash) = 32),
  policy_head_hash bytea NOT NULL CHECK (octet_length(policy_head_hash) = 32),
  epoch bigint NOT NULL CHECK (epoch BETWEEN 0 AND 9223372036854775807),
  roster_version bigint NOT NULL CHECK (roster_version BETWEEN 0 AND 9223372036854775807),
  roster_hash bytea NOT NULL CHECK (octet_length(roster_hash) = 32),
  confirmed_transcript_hash bytea NOT NULL CHECK (octet_length(confirmed_transcript_hash) = 32),
  delivery_log_position bigint NOT NULL
    CHECK (delivery_log_position BETWEEN 0 AND 9223372036854775807),
  delivery_log_head_hash bytea NOT NULL CHECK (octet_length(delivery_log_head_hash) = 32),
  policy_id uuid NOT NULL,
  policy_revision bigint NOT NULL CHECK (policy_revision BETWEEN 1 AND 9223372036854775807),
  policy_hash bytea NOT NULL CHECK (octet_length(policy_hash) = 32),
  evaluated_chain_id text NOT NULL,
  evaluated_block bigint NOT NULL CHECK (evaluated_block BETWEEN 0 AND 9223372036854775807),
  evaluated_block_hash bytea NOT NULL CHECK (octet_length(evaluated_block_hash) = 32),
  directory_checkpoint_id uuid NOT NULL REFERENCES directory_checkpoints(checkpoint_id),
  policy_log_checkpoint_id uuid NOT NULL REFERENCES policy_log_checkpoints(checkpoint_id),
  active_external_sender_credential_id uuid NOT NULL
    REFERENCES external_sender_credentials(external_sender_credential_id),
  active_external_sender_fingerprint bytea NOT NULL
    CHECK (octet_length(active_external_sender_fingerprint) = 32),
  active_signer_generation bigint NOT NULL
    CHECK (active_signer_generation BETWEEN 1 AND 9223372036854775807),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  policy_head_signing_key_id text NOT NULL
    REFERENCES policy_head_signing_keys(policy_head_signing_key_id),
  canonical_signed_body bytea NOT NULL CHECK (octet_length(canonical_signed_body) <= 65536),
  canonical_signed_body_sha256 bytea NOT NULL
    CHECK (octet_length(canonical_signed_body_sha256) = 32),
  signature bytea NOT NULL,
  UNIQUE (conversation_id, policy_head_sequence),
  UNIQUE (conversation_id, policy_head_hash),
  CHECK (expires_at > issued_at),
  CHECK (expires_at <= issued_at + interval '5 minutes'),
  FOREIGN KEY (
    active_external_sender_credential_id, active_external_sender_fingerprint,
    active_signer_generation
  ) REFERENCES external_sender_credentials(
    external_sender_credential_id, credential_fingerprint, signer_generation
  )
);

CREATE TABLE membership_intents (
  intent_id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(conversation_id),
  operation text NOT NULL CHECK (operation IN ('add', 'remove', 'replace_installation')),
  target_installation_id uuid NOT NULL REFERENCES installations(installation_id),
  requested_by_installation_id uuid REFERENCES installations(installation_id),
  grant_id uuid REFERENCES eligibility_grants(grant_id),
  key_package_ref bytea REFERENCES key_packages(key_package_ref),
  base_epoch bigint NOT NULL CHECK (base_epoch BETWEEN 0 AND 9223372036854775807),
  base_roster_version bigint NOT NULL CHECK (base_roster_version BETWEEN 0 AND 9223372036854775807),
  base_confirmed_transcript_hash bytea NOT NULL CHECK (octet_length(base_confirmed_transcript_hash) = 32),
  proposed_roster_hash bytea NOT NULL CHECK (octet_length(proposed_roster_hash) = 32),
  state text NOT NULL CHECK (state IN ('requested', 'authorized', 'proposed', 'committed', 'cancelled', 'expired', 'superseded')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  committed_envelope_id uuid,
  committed_envelope_position bigint
    CHECK (committed_envelope_position BETWEEN 1 AND 9223372036854775807),
  CHECK ((committed_envelope_id IS NULL) = (committed_envelope_position IS NULL)),
  CHECK ((state = 'committed') = (committed_envelope_id IS NOT NULL)),
  UNIQUE (conversation_id, committed_envelope_id),
  UNIQUE (conversation_id, committed_envelope_position)
);
CREATE UNIQUE INDEX membership_one_pending_target_idx
  ON membership_intents(conversation_id, target_installation_id)
  WHERE state IN ('requested', 'authorized', 'proposed');
ALTER TABLE key_packages ADD CONSTRAINT key_packages_taken_intent_fk
  FOREIGN KEY (taken_by_intent_id) REFERENCES membership_intents(intent_id);

CREATE TABLE external_proposals (
  proposal_id uuid PRIMARY KEY,
  proposal_hash bytea NOT NULL CHECK (octet_length(proposal_hash) = 32),
  intent_id uuid NOT NULL REFERENCES membership_intents(intent_id),
  conversation_id uuid NOT NULL REFERENCES conversations(conversation_id),
  envelope_id uuid NOT NULL,
  envelope_position bigint NOT NULL
    CHECK (envelope_position BETWEEN 1 AND 9223372036854775807),
  base_epoch bigint NOT NULL CHECK (base_epoch BETWEEN 0 AND 9223372036854775807),
  public_message bytea NOT NULL CHECK (octet_length(public_message) <= 262144),
  public_message_sha256 bytea NOT NULL CHECK (octet_length(public_message_sha256) = 32),
  authorization_record_hash bytea NOT NULL CHECK (octet_length(authorization_record_hash) = 32),
  signer_external_sender_credential_id uuid NOT NULL
    REFERENCES external_sender_credentials(external_sender_credential_id),
  signer_external_sender_fingerprint bytea NOT NULL
    CHECK (octet_length(signer_external_sender_fingerprint) = 32),
  signer_generation bigint NOT NULL CHECK (signer_generation BETWEEN 1 AND 9223372036854775807),
  transparency_checkpoint_id uuid NOT NULL REFERENCES policy_log_checkpoints(checkpoint_id),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  committed_at timestamptz,
  UNIQUE (intent_id),
  UNIQUE (conversation_id, proposal_hash),
  UNIQUE (conversation_id, envelope_id),
  UNIQUE (conversation_id, envelope_position),
  UNIQUE (proposal_id, proposal_hash),
  FOREIGN KEY (
    signer_external_sender_credential_id, signer_external_sender_fingerprint, signer_generation
  ) REFERENCES external_sender_credentials(
    external_sender_credential_id, credential_fingerprint, signer_generation
  )
);

CREATE TABLE policy_head_mandatory_proposals (
  policy_head_id uuid NOT NULL REFERENCES policy_heads(policy_head_id),
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  proposal_id uuid NOT NULL,
  proposal_hash bytea NOT NULL CHECK (octet_length(proposal_hash) = 32),
  PRIMARY KEY (policy_head_id, ordinal),
  UNIQUE (policy_head_id, proposal_id),
  FOREIGN KEY (proposal_id, proposal_hash)
    REFERENCES external_proposals(proposal_id, proposal_hash)
);

CREATE TABLE envelopes (
  conversation_id uuid NOT NULL REFERENCES conversations(conversation_id),
  position bigint NOT NULL CHECK (position BETWEEN 1 AND 9223372036854775807),
  envelope_id uuid NOT NULL,
  envelope_class text NOT NULL CHECK (envelope_class IN ('external_proposal', 'mls_commit', 'application')),
  sender_type text NOT NULL CHECK (sender_type IN ('installation', 'entitlement_signer')),
  sender_account_id uuid REFERENCES accounts(account_id),
  sender_installation_id uuid REFERENCES installations(installation_id),
  sender_external_credential_id uuid,
  sender_external_fingerprint bytea
    CHECK (octet_length(sender_external_fingerprint) = 32),
  sender_signer_generation bigint
    CHECK (sender_signer_generation BETWEEN 1 AND 9223372036854775807),
  epoch bigint NOT NULL CHECK (epoch BETWEEN 0 AND 9223372036854775807),
  roster_version bigint NOT NULL CHECK (roster_version BETWEEN 0 AND 9223372036854775807),
  base_confirmed_transcript_hash bytea CHECK (octet_length(base_confirmed_transcript_hash) = 32),
  resulting_confirmed_transcript_hash bytea CHECK (octet_length(resulting_confirmed_transcript_hash) = 32),
  policy_head_id uuid REFERENCES policy_heads(policy_head_id),
  content_type text NOT NULL,
  envelope_bytes bytea NOT NULL CHECK (octet_length(envelope_bytes) <= 524288),
  envelope_sha256 bytea NOT NULL CHECK (octet_length(envelope_sha256) = 32),
  previous_head_hash bytea NOT NULL CHECK (octet_length(previous_head_hash) = 32),
  leaf_hash bytea NOT NULL CHECK (octet_length(leaf_hash) = 32),
  head_hash bytea NOT NULL CHECK (octet_length(head_hash) = 32),
  log_signing_key_id text NOT NULL,
  log_head_signature bytea NOT NULL,
  received_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  purge_state text NOT NULL DEFAULT 'live' CHECK (purge_state IN ('live', 'purge_pending')),
  PRIMARY KEY (conversation_id, position),
  UNIQUE (conversation_id, envelope_id),
  UNIQUE (conversation_id, position, envelope_id),
  UNIQUE (conversation_id, head_hash),
  CHECK (
    (sender_type = 'installation'
      AND sender_account_id IS NOT NULL AND sender_installation_id IS NOT NULL
      AND sender_external_credential_id IS NULL AND sender_external_fingerprint IS NULL
      AND sender_signer_generation IS NULL)
    OR (sender_type = 'entitlement_signer'
      AND sender_account_id IS NULL AND sender_installation_id IS NULL
      AND sender_external_credential_id IS NOT NULL AND sender_external_fingerprint IS NOT NULL
      AND sender_signer_generation IS NOT NULL)
  ),
  CHECK ((envelope_class = 'external_proposal') = (sender_type = 'entitlement_signer')),
  FOREIGN KEY (
    sender_external_credential_id, sender_external_fingerprint, sender_signer_generation
  ) REFERENCES external_sender_credentials(
    external_sender_credential_id, credential_fingerprint, signer_generation
  )
) PARTITION BY HASH (conversation_id);
-- Initial migration creates 64 hash partitions.
CREATE INDEX envelopes_expiry_idx ON envelopes(expires_at, conversation_id, position);
CREATE INDEX envelopes_id_idx ON envelopes(envelope_id);
ALTER TABLE external_proposals ADD CONSTRAINT external_proposals_envelope_fk
  FOREIGN KEY (conversation_id, envelope_position, envelope_id)
  REFERENCES envelopes(conversation_id, position, envelope_id);
ALTER TABLE membership_intents ADD CONSTRAINT membership_intents_commit_envelope_fk
  FOREIGN KEY (conversation_id, committed_envelope_position, committed_envelope_id)
  REFERENCES envelopes(conversation_id, position, envelope_id);

-- All three envelope classes allocate from conversations.last_position. There is no class-specific
-- sequence or cursor; external proposals, public Commits, and private applications share one
-- gap-free order.

CREATE TABLE log_witness_receipts (
  conversation_id uuid NOT NULL,
  position bigint NOT NULL CHECK (position BETWEEN 1 AND 9223372036854775807),
  head_hash bytea NOT NULL CHECK (octet_length(head_hash) = 32),
  witness_checkpoint_id text NOT NULL,
  witness_tree_size bigint NOT NULL CHECK (witness_tree_size BETWEEN 0 AND 9223372036854775807),
  witness_root_hash bytea NOT NULL CHECK (octet_length(witness_root_hash) = 32),
  witness_key_id text NOT NULL,
  witness_signature bytea NOT NULL,
  witnessed_at timestamptz NOT NULL,
  PRIMARY KEY (conversation_id, position, witness_key_id),
  FOREIGN KEY (conversation_id, position) REFERENCES envelopes(conversation_id, position)
);

CREATE TABLE mls_welcomes (
  conversation_id uuid NOT NULL,
  commit_position bigint NOT NULL CHECK (commit_position BETWEEN 1 AND 9223372036854775807),
  target_installation_id uuid NOT NULL REFERENCES installations(installation_id),
  welcome_bytes bytea NOT NULL CHECK (octet_length(welcome_bytes) <= 524288),
  welcome_sha256 bytea NOT NULL CHECK (octet_length(welcome_sha256) = 32),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (conversation_id, commit_position, target_installation_id),
  FOREIGN KEY (conversation_id, commit_position) REFERENCES envelopes(conversation_id, position)
);

CREATE TABLE mailbox_counters (
  installation_id uuid PRIMARY KEY REFERENCES installations(installation_id),
  last_position bigint NOT NULL DEFAULT 0 CHECK (last_position BETWEEN 0 AND 9223372036854775807),
  retained_floor bigint NOT NULL DEFAULT 1 CHECK (retained_floor BETWEEN 1 AND 9223372036854775807)
);

CREATE TABLE mailbox_entries (
  installation_id uuid NOT NULL REFERENCES installations(installation_id),
  mailbox_position bigint NOT NULL CHECK (mailbox_position BETWEEN 1 AND 9223372036854775807),
  conversation_id uuid NOT NULL,
  envelope_position bigint NOT NULL CHECK (envelope_position BETWEEN 1 AND 9223372036854775807),
  envelope_id uuid NOT NULL,
  delivery_class text NOT NULL CHECK (delivery_class IN ('application', 'proposal', 'commit', 'welcome')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  acknowledged_at timestamptz,
  PRIMARY KEY (installation_id, mailbox_position),
  FOREIGN KEY (conversation_id, envelope_position) REFERENCES envelopes(conversation_id, position)
) PARTITION BY HASH (installation_id);
-- Initial migration creates 64 hash partitions.
CREATE INDEX mailbox_unacked_idx
  ON mailbox_entries(installation_id, mailbox_position) WHERE acknowledged_at IS NULL;
CREATE INDEX mailbox_expiry_idx
  ON mailbox_entries(expires_at, installation_id, mailbox_position);

CREATE TABLE conversation_usage (
  conversation_id uuid PRIMARY KEY REFERENCES conversations(conversation_id),
  envelope_count bigint NOT NULL DEFAULT 0 CHECK (envelope_count BETWEEN 0 AND 9223372036854775807),
  envelope_bytes bigint NOT NULL DEFAULT 0 CHECK (envelope_bytes BETWEEN 0 AND 9223372036854775807),
  attachment_bytes bigint NOT NULL DEFAULT 0 CHECK (attachment_bytes BETWEEN 0 AND 9223372036854775807),
  updated_at timestamptz NOT NULL
);

CREATE TABLE quota_counters (
  scope_type text NOT NULL CHECK (scope_type IN (
    'installation', 'account', 'project', 'conversation', 'campaign', 'tenant', 'ip_prefix'
  )),
  scope_hash bytea NOT NULL CHECK (octet_length(scope_hash) = 32),
  quota_name text NOT NULL,
  window_started_at timestamptz NOT NULL,
  window_seconds integer NOT NULL CHECK (window_seconds > 0),
  operation_count bigint NOT NULL DEFAULT 0
    CHECK (operation_count BETWEEN 0 AND 9223372036854775807),
  byte_count bigint NOT NULL DEFAULT 0 CHECK (byte_count BETWEEN 0 AND 9223372036854775807),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (scope_type, scope_hash, quota_name, window_started_at)
);
CREATE INDEX quota_counters_expiry_idx
  ON quota_counters(window_started_at, scope_type, quota_name);

CREATE TABLE attachments (
  attachment_id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(conversation_id),
  owner_installation_id uuid NOT NULL REFERENCES installations(installation_id),
  epoch bigint NOT NULL CHECK (epoch BETWEEN 0 AND 9223372036854775807),
  object_key text NOT NULL UNIQUE,
  upload_id_ciphertext bytea,
  ciphertext_bytes bigint NOT NULL CHECK (ciphertext_bytes BETWEEN 1 AND 9223372036854775807),
  ciphertext_sha256 bytea NOT NULL CHECK (octet_length(ciphertext_sha256) = 32),
  state text NOT NULL CHECK (state IN ('uploading', 'ready', 'bound', 'purge_pending', 'deleted')),
  bound_envelope_position bigint
    CHECK (bound_envelope_position BETWEEN 1 AND 9223372036854775807),
  created_at timestamptz NOT NULL,
  upload_expires_at timestamptz NOT NULL,
  finalized_at timestamptz,
  cross_region_replication_receipt bytea,
  expires_at timestamptz NOT NULL,
  FOREIGN KEY (conversation_id, bound_envelope_position) REFERENCES envelopes(conversation_id, position)
);
CREATE INDEX attachments_expiry_idx ON attachments(state, expires_at, attachment_id);

CREATE TABLE envelope_attachments (
  conversation_id uuid NOT NULL,
  envelope_position bigint NOT NULL CHECK (envelope_position BETWEEN 1 AND 9223372036854775807),
  ordinal smallint NOT NULL CHECK (ordinal BETWEEN 0 AND 9),
  attachment_id uuid NOT NULL UNIQUE REFERENCES attachments(attachment_id),
  PRIMARY KEY (conversation_id, envelope_position, ordinal),
  FOREIGN KEY (conversation_id, envelope_position) REFERENCES envelopes(conversation_id, position)
);

CREATE TABLE campaigns (
  campaign_id uuid PRIMARY KEY,
  project_ref_id uuid NOT NULL REFERENCES project_refs(project_ref_id),
  creator_account_id uuid NOT NULL REFERENCES accounts(account_id),
  creator_installation_id uuid NOT NULL REFERENCES installations(installation_id),
  policy_id uuid NOT NULL,
  policy_revision bigint NOT NULL CHECK (policy_revision BETWEEN 1 AND 9223372036854775807),
  policy_hash bytea NOT NULL CHECK (octet_length(policy_hash) = 32),
  consent_class text NOT NULL CHECK (consent_class IN ('support', 'transactional', 'community', 'marketing')),
  relationship_scope_policy_profile_id text NOT NULL,
  audience_snapshot_hash bytea NOT NULL CHECK (octet_length(audience_snapshot_hash) = 32),
  evaluated_block bigint NOT NULL CHECK (evaluated_block BETWEEN 0 AND 9223372036854775807),
  evaluated_block_hash bytea NOT NULL CHECK (octet_length(evaluated_block_hash) = 32),
  state text NOT NULL CHECK (state IN ('audience_snapshotted', 'body_encrypted', 'distributing', 'completed', 'partially_failed', 'cancelled')),
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL,
  cancelled_at timestamptz,
  FOREIGN KEY (policy_id, policy_revision) REFERENCES policies(policy_id, policy_revision)
);

CREATE TABLE campaign_targets (
  campaign_id uuid NOT NULL REFERENCES campaigns(campaign_id),
  target_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES accounts(account_id),
  encryption_installation_id uuid NOT NULL REFERENCES installations(installation_id),
  scope_selection_algorithm_version integer NOT NULL CHECK (scope_selection_algorithm_version >= 1),
  scope_selection_hash bytea NOT NULL CHECK (octet_length(scope_selection_hash) = 32),
  relationship_id uuid REFERENCES relationships(relationship_id),
  relationship_scope_id uuid,
  reader_history_retention_policy_hash bytea
    CHECK (octet_length(reader_history_retention_policy_hash) = 32),
  conversation_id uuid REFERENCES conversations(conversation_id),
  authorization_hash bytea NOT NULL CHECK (octet_length(authorization_hash) = 32),
  state text NOT NULL CHECK (state IN ('scope_pending', 'pending', 'accepted', 'skipped_policy', 'failed')),
  accepted_envelope_id uuid UNIQUE,
  accepted_envelope_position bigint
    CHECK (accepted_envelope_position BETWEEN 1 AND 9223372036854775807),
  last_error_code text,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (campaign_id, target_id),
  UNIQUE (campaign_id, account_id),
  UNIQUE (conversation_id, accepted_envelope_position),
  CHECK (
    (state = 'scope_pending' AND relationship_id IS NULL
      AND relationship_scope_id IS NULL
      AND reader_history_retention_policy_hash IS NULL
      AND conversation_id IS NULL)
    OR
    (state IN ('pending', 'accepted', 'failed') AND relationship_id IS NOT NULL
      AND relationship_scope_id IS NOT NULL
      AND reader_history_retention_policy_hash IS NOT NULL
      AND conversation_id IS NOT NULL)
    OR
    (state = 'skipped_policy' AND (
      (relationship_id IS NULL AND relationship_scope_id IS NULL
        AND reader_history_retention_policy_hash IS NULL AND conversation_id IS NULL)
      OR
      (relationship_id IS NOT NULL AND relationship_scope_id IS NOT NULL
        AND reader_history_retention_policy_hash IS NOT NULL AND conversation_id IS NOT NULL)
    ))
  ),
  CHECK ((state = 'accepted') = (accepted_envelope_id IS NOT NULL)),
  CHECK ((accepted_envelope_id IS NULL) = (accepted_envelope_position IS NULL)),
  FOREIGN KEY (relationship_id, relationship_scope_id, reader_history_retention_policy_hash)
    REFERENCES relationships(relationship_id, relationship_scope_id, reader_history_retention_policy_hash),
  FOREIGN KEY (conversation_id, accepted_envelope_position, accepted_envelope_id)
    REFERENCES envelopes(conversation_id, position, envelope_id)
);

CREATE TABLE campaign_bodies (
  campaign_id uuid PRIMARY KEY REFERENCES campaigns(campaign_id),
  object_key text NOT NULL UNIQUE,
  ciphertext_bytes bigint NOT NULL CHECK (ciphertext_bytes BETWEEN 1 AND 9223372036854775807),
  ciphertext_sha256 bytea NOT NULL CHECK (octet_length(ciphertext_sha256) = 32),
  descriptor_hash bytea NOT NULL CHECK (octet_length(descriptor_hash) = 32),
  cross_region_replication_receipt bytea,
  state text NOT NULL CHECK (state IN ('uploading', 'ready', 'purge_pending', 'deleted')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE push_endpoints (
  endpoint_id uuid PRIMARY KEY,
  installation_id uuid NOT NULL REFERENCES installations(installation_id),
  provider text NOT NULL CHECK (provider IN ('webpush', 'apns', 'fcm')),
  endpoint_fingerprint bytea NOT NULL UNIQUE CHECK (octet_length(endpoint_fingerprint) = 32),
  encrypted_configuration bytea NOT NULL,
  kms_key_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'invalid', 'deleted')),
  created_at timestamptz NOT NULL,
  last_success_at timestamptz,
  last_failure_at timestamptz
);

CREATE TABLE idempotency_records (
  principal_type text NOT NULL CHECK (principal_type IN (
    'native_installation', 'enrollment_allocator', 'enrollment_attempt',
    'embed_issuer', 'embed_context'
  )),
  principal_scope_hash bytea NOT NULL CHECK (octet_length(principal_scope_hash) = 32),
  account_id uuid REFERENCES accounts(account_id),
  installation_id uuid REFERENCES installations(installation_id),
  enrollment_id uuid REFERENCES device_enrollment_attempts(enrollment_id),
  tenant_id uuid REFERENCES tenants(tenant_id),
  embed_issuer_client_id uuid REFERENCES embed_issuer_clients(embed_issuer_client_id),
  embed_context_id uuid REFERENCES embed_contexts(embed_context_id),
  method text NOT NULL,
  route_template text NOT NULL,
  resource_id text NOT NULL DEFAULT '',
  idempotency_key text NOT NULL,
  request_sha256 bytea NOT NULL CHECK (octet_length(request_sha256) = 32),
  response_status smallint NOT NULL CHECK (response_status BETWEEN 200 AND 599),
  response_headers jsonb NOT NULL,
  response_body_ciphertext bytea NOT NULL,
  kms_key_version text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (
    principal_type, principal_scope_hash, method, route_template, resource_id, idempotency_key
  ),
  CHECK (
    (principal_type = 'native_installation' AND account_id IS NOT NULL
      AND installation_id IS NOT NULL AND enrollment_id IS NULL AND tenant_id IS NULL
      AND embed_issuer_client_id IS NULL AND embed_context_id IS NULL)
    OR (principal_type = 'enrollment_allocator' AND account_id IS NULL
      AND installation_id IS NULL AND enrollment_id IS NULL AND tenant_id IS NULL
      AND embed_issuer_client_id IS NULL AND embed_context_id IS NULL)
    OR (principal_type = 'enrollment_attempt' AND account_id IS NULL
      AND enrollment_id IS NOT NULL
      AND installation_id IS NULL AND tenant_id IS NULL AND embed_issuer_client_id IS NULL
      AND embed_context_id IS NULL)
    OR (principal_type = 'embed_issuer' AND account_id IS NULL AND tenant_id IS NOT NULL
      AND embed_issuer_client_id IS NOT NULL AND enrollment_id IS NULL
      AND installation_id IS NULL AND embed_context_id IS NULL)
    OR (principal_type = 'embed_context' AND account_id IS NULL AND tenant_id IS NOT NULL
      AND embed_context_id IS NOT NULL AND enrollment_id IS NULL
      AND installation_id IS NULL AND embed_issuer_client_id IS NULL)
  ),
  CHECK (expires_at > created_at)
);
CREATE INDEX idempotency_expiry_idx ON idempotency_records(expires_at);

CREATE TABLE outbox_events (
  outbox_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aggregate_type text NOT NULL,
  aggregate_id_hash bytea NOT NULL CHECK (octet_length(aggregate_id_hash) = 32),
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  available_at timestamptz NOT NULL,
  claimed_at timestamptz,
  completed_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error_code text
);
CREATE INDEX outbox_ready_idx ON outbox_events(available_at, outbox_id)
  WHERE completed_at IS NULL;

CREATE TABLE audit_events (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  tenant_id uuid,
  actor_type text NOT NULL,
  actor_id_hash bytea,
  installation_id_hash bytea,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id_hash bytea,
  outcome text NOT NULL CHECK (outcome IN ('allowed', 'denied', 'error')),
  reason_code text,
  request_id uuid NOT NULL,
  source_ip_prefix_hash bytea,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_time_idx ON audit_events(occurred_at, audit_id);

CREATE TABLE lifecycle_jobs (
  job_id uuid PRIMARY KEY,
  job_type text NOT NULL CHECK (job_type IN (
    'export', 'conversation_purge', 'account_delete', 'attachment_purge', 'campaign_purge'
  )),
  requester_account_id uuid,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('queued', 'running', 'awaiting_object_delete', 'complete', 'failed')),
  encrypted_job_parameters bytea,
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  completed_at timestamptz,
  error_code text
);
CREATE INDEX lifecycle_ready_idx ON lifecycle_jobs(next_attempt_at, job_id)
  WHERE state NOT IN ('complete', 'failed');

CREATE TABLE deletion_ledger (
  deletion_id uuid PRIMARY KEY,
  scope_type text NOT NULL,
  scope_id_hash bytea NOT NULL CHECK (octet_length(scope_id_hash) = 32),
  effective_at timestamptz NOT NULL,
  completed_at timestamptz,
  deletion_generation bigint NOT NULL
    CHECK (deletion_generation BETWEEN 1 AND 9223372036854775807),
  audit_digest bytea NOT NULL CHECK (octet_length(audit_digest) = 32)
);

CREATE TABLE transparency_archives (
  archive_id uuid PRIMARY KEY,
  conversation_scope_hash bytea NOT NULL CHECK (octet_length(conversation_scope_hash) = 32),
  final_position bigint NOT NULL CHECK (final_position BETWEEN 0 AND 9223372036854775807),
  final_head_hash bytea NOT NULL CHECK (octet_length(final_head_hash) = 32),
  delivery_signature bytea NOT NULL,
  witness_checkpoint_id text NOT NULL,
  witness_root_hash bytea NOT NULL CHECK (octet_length(witness_root_hash) = 32),
  witness_signature bytea NOT NULL,
  archived_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX transparency_archives_expiry_idx ON transparency_archives(expires_at, archive_id);
```

Static checks above are mandatory. Services additionally validate every declared UUID version at the
write boundary. Cross-row rules—feature-manifest ceilings, expiry ordering, enrollment challenge-pair
and finality windows, active credential/account/key commitment, session/KeyPackage expiry no later
than credential expiry, directory/checkpoint monotonicity, embed configuration/channel equivalence,
membership cardinality, monotonic checkpoints, and `purge_after <= transaction_timestamp()` before a
purge—are transaction invariants, not volatile SQL `CHECK` expressions. Revoked/superseded credentials,
installations, tenant origins, issuer clients, and claimed one-use proofs/contexts cannot transition to
an earlier state. After physical deletion,
`purged` exists only as a minimal lifecycle/deletion-ledger result; no tombstone contains identity or
ciphertext.

The tuple `(project_ref_id, customer_account_id, relationship_scope_id,
reader_history_retention_policy_hash)` is an immutable security-domain binding. The scope ID is random
and non-enumerable; the hash covers the canonical exact business purpose, business entity, reader/role
policy, history-transfer mode, and retention version/document. Application roles have no UPDATE privilege for
those relationship columns. A changed effective policy inserts a new scope; it never updates an old
hash. A partial unique index permits only one live conversation generation for a relationship scope,
while closed generations remain addressable through membership/retention boundaries. Cases can share
only the same scope and exact hash.

Conversation activation locks the relationship row, verifies the composite scope/policy FK, requires
the old pointer to be null or name the expected predecessor, and sets `active_conversation_id` only to a
same-domain conversation in `active`, `membership_pending`, or `suspended`. Close clears the pointer
only if it still names that conversation; migration cutover swaps old to successor in the same
transaction that changes their states. Retention/purge cannot remove a pointed-to conversation, and a
relationship cannot enter `closed|deleting` with a live pointer. These checks plus the composite FK are
mandatory even if lifecycle jobs race activation or migration.

Activation inserts exactly two `conversation_external_senders` rows—`current` and `staged_next`—whose
ordered canonical credentials hash to `conversations.external_senders_hash` and match the MLS
`external_senders` extension. The slots are immutable for that generation. A policy head names exactly
one of those credential IDs as active at its independently witnessed policy-log checkpoint. Merely
occupying `staged_next` grants no signing authority; an external GroupContextExtensions/self-update is
never accepted as rotation. Each credential is valid for at most 90 days; activation requires at least
30 days remaining on `staged_next` (there is no separate 30-day remainder requirement for `current`). A
staged credential may become active only after its publication/checkpoint was independently witnessed
for at least 30 days. Current/staged-next validity intervals overlap at most 14 days, while their authority
intervals never overlap. `signer_generation` is gap-free and monotonic per project in the signed policy/
security ledgers. `retired` and `revoked` are irreversible terminal states and those generations cannot
return to `published`, staged, or active.

Credential publication locks `project_refs`, increments `last_signer_generation` by exactly one (never
past `2^63-1`), inserts the credential plus signed/witnessed policy-log and security-ledger entries, and
commits synchronously. Lifecycle updates are CAS-only `published -> retired|revoked`; no SQL/API path
reverses them. Policy heads and proposals carry credential ID, fingerprint, and signer generation and
cross-check the exact project generation in both ledgers.

`external_sender_credentials` keys have signature domain `mls_external_proposal_v1` and sign only
logged RFC 9420 public proposals. `policy_head_signing_keys` have domain `policy_head_v1` and sign only
freshness heads. Provisioning rejects identical key material/fingerprints across the two registries,
and verifiers select the domain-specific registry/context before signature verification; a signature
valid under the other registry is still invalid. KMS roles and audit streams for the two private-key
purposes are separate.

Version 1 has no last-resort KeyPackage row or code path. Conversation planning and membership-intent
creation lock candidate packages in installation/key-reference order and change each exact row from
`state = available AND taken_at IS NULL AND expires_at > transaction_timestamp()` to `state = taken`,
`taken_at`, plus exactly one `taken_by_plan_id` or `taken_by_intent_id` in the same
transaction that creates that owner. A response may return bytes only after that commit. Failure to
take the complete roster rolls back and returns the typed replenishment error; it never substitutes or
reuses inventory. `taken_at` is terminal for
availability: expiry, cancellation, abort, ambiguous activation, or plan deletion cannot clear it.
Activation CASes `taken -> used` and sets `used_at` idempotently. Cleanup may CAS a taken/used package
to `destroyed`, set `destroyed_at`, and erase package bytes while retaining the bounded hash/audit row;
credential revocation CASes only still-available packages to `revoked` and erases their bytes. No path
can make a taken, used, destroyed, revoked, or expired reference available again.

## 3. Transaction boundaries and locking

### 3.1 Device enrollment, credentials, and finality

Attempt allocation canonicalizes the CAIP-10 wallet, takes a purpose-separated wallet lookup lock, and
either binds a provisional account row or the already linked opaque account without exposing which
case occurred. In one transaction it creates the UUIDv7 enrollment attempt, preallocated UUIDv4
installation/device-credential IDs, 256-bit result-handle HMAC, exact registered audience/client/
HTTPS origin/purpose/scope, and server-derived platform from the registered client. Caller-supplied IDs
or platform claims never replace those values. It derives `top_level` or the exact embedded tenant/
parent-origin partition from server session state; an embedded enrollment always creates a distinct
installation/key pair, and a top-level installation/session cannot be relabeled into that partition.

Challenge issuance locks an unexpired `allocated` attempt, recomputes the P-256 RFC 7638 JKT, suite-
`0x0001` Ed25519 credential fingerprint, and ordinary KeyPackage ref/SHA-256, and checks every value
against the canonical `DeviceKeyBinding`. It allocates the UUIDv7 wallet and possession challenge IDs
before serialization. The exact wallet payload is constructed and persisted first. Only then is the
possession digest derived over that wallet challenge ID/payload digest, the preallocated possession ID,
fresh server nonce, and the same enrollment/key/package/audience/purpose/scope/time bindings. One
transaction writes both challenges, their common window, and CASes the attempt to
`challenges_issued`; a partial pair is impossible. SQL composite FKs prevent challenge IDs, account,
chain, preallocated IDs, or key/package commitments from being cross-wired between attempts.

Completion first checks the stored exact-result record. It then locks the attempt and both challenges,
requires the same attempt/pair and both `not_before <= transaction_timestamp() < expires_at`, inserts
one UUIDv7 completion request, and atomically CASes both `issued -> claimed` with that completion ID and
one canonical claim time. This claim commits before EOA, ERC-1271, ERC-6492, possession, RPC, or
directory work. Only the winning claim is verified. `invalid`, `unavailable`, timeout, crash, or an
ambiguous response never clears either claim; an exact retry reads the encrypted bounded result, while
changed bytes conflict. Result ciphertext is envelope-encrypted under the recorded KMS version, never
logged, and purged on the short enrollment-result schedule.

Wallet verification has three disjoint results: `verified`, `invalid`, or `unavailable`, with exact
method `eoa|erc1271|erc6492`. The success path locks the one ratified `active` finality profile for the
attempt chain and stores its ID/revision/hash, finalized block number/hash, and quorum/evidence digest.
No row, `paused|retired` state, provider disagreement, ambiguous `safe`/`latest`, unresolved ENG-004
semantics, RPC/deployment uncertainty, or coordinator failure is `unavailable`: it writes no wallet
link activation, device credential, session, eligibility grant, or authority lease. A later reorg that
orphans the exact anchor atomically suspends authority, revokes affected grants/delegations, emits the
outbox work, and starts the mandatory MLS remove/rekey coordinator; coordinator unavailability remains
fail closed.

After both proofs verify, one transaction locks the attempt/account and all preallocated/commitment
uniqueness keys; requires the final verification timestamp is still before both challenge expiries and
the exact finalized evidence; activates or inserts the wallet link and
account; inserts the native installation, signed expiring `device-credential.v1`, initial ordinary
KeyPackage in `available`, immutable directory entry/proofs/witnessed checkpoint, and credential-bound
session; advances the installation credential pointer/revocation version; stores idempotency/audit/
outbox and the bounded result; and CASes the completion/attempt to `issued`. The initial KeyPackage and
credential form a deferred exact ref/hash/credential/installation FK cycle, so neither can commit
alone. Directory and credential composite FKs bind account, both key commitments, package, expiry, and
revocation version. Success is acknowledged only after fenced RPO-0 durability and the required
directory witness proof.

Renewal locks the installation and active credential. It permits only the identical P-256/Ed25519/key-
profile binding, increments `revocation_version` exactly once, inserts and witnesses the successor
credential/directory entry, terminally marks the predecessor `superseded`, swaps the active pointer,
and rotates or revokes old session families/packages in one transaction. A key change is a new
installation/enrollment. Suspend/revoke/supersede transitions are irreversible; reciprocal predecessor/
successor IDs must name the same account/installation/binding and increasing version. Installation
revocation locks credential, sessions, every available KeyPackage, push endpoints, and memberships;
it revokes available packages (erasing bytes), revokes token families, appends the witnessed directory
entry, and creates Remove intents/outbox before returning. Already-taken packages never re-enter
inventory.

Session creation/refresh/request authorization locks or reads the exact active credential tuple and
requires matching account, installation, JKT and revocation version. Access/refresh expiry cannot
exceed credential expiry. Credential/install suspension, expiry, revocation, supersession, version
drift, or directory inconsistency rejects the request even if a token hash matches. Each KeyPackage
publication similarly requires the exact active credential/fingerprint/version, ordinary kind, pinned
release profile, and expiry no later than the credential; last-resort packages have no state or path.

Eligibility issuance separately locks the exact project policy, active installation credential, and
one ratified `active` finality profile for `source_chain_id`; validates finalized canonical block
number/hash through the release-pinned quorum; then writes profile ID/revision/hash, evidence digest,
and `verified-finalized` in the grant transaction. No profile or any unresolved/pending/unavailable
result writes no lease. Loss of finality availability CASes dependent live grants to `suspended` and
stops authority; an exact orphaned anchor CASes them to `revoked`, records outbox work, and initiates
Remove/rekey. Neither an indexer label nor `safe`/`latest` is substituted for the ratified profile.

### 3.2 Embedded-context issuance and redemption

Context issuance rejects a request target containing any query field before tenant/resource lookup.
It locks the tenant, exact origin registration, and issuer client and requires states
`active|active|active`, exact mTLS/OAuth subject, audience/client/origin/purpose/action configuration,
and environment. Missing configuration returns the non-enumerating unavailable result and writes no
context. The idempotent transaction creates one UUIDv7 context and 256-bit handle, stores only the
handle HMAC, purpose-separated resource lookup plus envelope-encrypted opaque integration reference,
immutable scope/configuration snapshots, and a deadline no later than two minutes. Provider message,
purchase, shipping, wallet, eligibility, or relay plaintext is forbidden. The raw handle/reference is
never a request target, referrer, log, trace, metric, error, or browser-storage value.

Redemption is accepted only by the messaging-origin BFF after the exact source/origin/bootstrap
handshake. It rejects any query field and validates Fetch Metadata/CSRF before lookup. A transaction
locks the context and exact tenant/origin/issuer rows, rechecks active configuration and time, compares
the full audience/purpose/scope plus HMAC/SHA-256 channel/bootstrap/parent/frame commitments, inserts
one UUIDv7 redemption, and CASes `issued -> claimed` before decrypting/resolving the opaque integration
reference. A resolution denial/failure terminally records `invalid`; it never reopens the handle.
Success inserts one UUIDv4 embedded-session row and cookie-token HMAC, copies the exact binding,
CASes context/redemption to `redeemed`, and commits before a no-store response. Exact lost-response
replay may return the same result only for the same context/request hash/channel; every other claimed,
expired, revoked, mismatched, or replayed request collapses to `context_invalid`.

An embedded session starts `unauthenticated`. It may attach one active embedded-partition
`auth_session` only after wallet/device authentication, exact tenant/parent-origin/channel validation,
and credential checks; a top-level session is rejected as ambient authority. In the binding
transaction the controller generates a fresh 256-bit cookie, moves the prior active HMAC to
`previous_embed_session_token_hash`, installs the unrelated new active HMAC, increments generation
`1 -> 2`, and marks the previous value revoked before success. Equality/collision fails closed and no
second promotion is allowed. Provider context
detail or message authority remains unavailable before that point, and eligibility/MLS authorization
is still independent afterward. Session lifetime is at most ten minutes from redemption and ends
earlier on channel destroy/reload, origin drift, auth-session revocation, or explicit logout. Channel
timeout/destroy before redemption terminally revokes the issued context. Tenant, origin, or issuer
suspension/revocation locks the configuration then CASes all indexed live contexts/sessions to revoked
and emits invalidation outbox work. Origin/issuer `revoked` is irreversible; reapproval creates a new
record. Cleanup purges the encrypted reference and linkage on the short schedule, retaining only a
random unjoinable audit ID and coarse outcome.

### 3.3 Policy-head issuance

Issuance generates a fresh random UUIDv4 `policy_head_id`, locks the conversation, computes
`sequence = last_policy_head_sequence + 1`, and requires it
not exceed `2^63-1`. It copies `current_policy_head_hash` as the previous hash (32 zero bytes for head
one), copies the locked `last_position` and its exact `current_log_head_hash` (the profile-defined zero
head at position zero) into `delivery_log_position`/`delivery_log_head_hash`, builds the exact RFC 8785
unsigned body from `service-api.md`, and persists both those immutable canonical bytes and their
SHA-256 before signing. It computes the domain-separated policy-head hash, signs it, inserts the
immutable row/mandatory proposal pairs, and updates the conversation
sequence/hash in one transaction. The ID is never reused or overwritten and carries no ordering
semantics. The independent policy log must accept the exact extension before the
head is served. Same epoch, roster, and policy revision may have arbitrarily many heads within retention;
only the sequence/hash pair is unique. Clients and append authorization always require the newest
unexpired head, preventing an earlier still-unexpired view from hiding a later removal. Serving code
re-derives and compares the body digest, signed delivery-log checkpoint, and signature; it never
reconstructs a head from mutable conversation columns.

### 3.4 Application append

An append uses `READ COMMITTED` with explicit locks or `SERIALIZABLE` with at most three bounded,
jittered retries:

1. Look up the full idempotency scope. An exact prior result is returned before current-state checks.
2. Lock the conversation and usage rows. Require `active`, exact ETag/epoch/roster/confirmed-transcript
   checkpoint, active sender membership, and the exact newest unexpired policy-head ID/sequence/hash
   matching `conversations.last_policy_head_sequence/current_policy_head_hash` and the independently
   witnessed policy/proposal state. An older still-unexpired head, any mandatory proposal, or pending
   removal blocks the append.
3. Verify canonical private MLS wire format, release profile, bytes/hash, attachment manifests, and
   per-installation/account/project/conversation/tenant hard quotas.
4. Allocate `position = last_position + 1`; increment envelope count/bytes. No PostgreSQL sequence is
   used because rollback must restore gap-free order.
5. Compute the normative leaf/head hashes from `service-api.md`, including `envelope_class`, generic
   `envelope_sha256`, and exactly one tagged sender union: installation account/installation IDs or
   entitlement-signer credential/fingerprint/generation. Use the locked current head as
   `previous_head_hash`; insert immutable envelope, attachment bindings, new head, and signature.
6. Lock recipient mailbox counters in ascending installation UUID order, allocate gap-free positions,
   and insert only for installations active at this conversation position.
7. Insert witness/push outbox work and the encrypted idempotency response; commit before success.

Quota failure occurs before either position moves. The witness receipt is asynchronous; the
service-signed head is committed with the envelope and sensitive clients wait for independent witness
confirmation. `envelope_id` uniqueness is conversation-scoped. The application `event_id` remains
inside MLS plaintext and is never a delivery-table key.

### 3.5 Proposal and Commit CAS

Intent creation locks the conversation, target installation, grant/key package, and conflicting intent.
It generates an opaque UUIDv7 proposal record ID and a separate UUIDv4 envelope ID, then computes
`proposal_hash = SHA-256("jb-msg-external-proposal/v1" || u32be(len(public_message)) ||
public_message || authorization_record_hash)`. It persists that ID/hash pair, signed public proposal,
authorization hash, independent-log reference, proposal envelope, new log head, mailbox/outbox rows,
and `membership_pending` state in one transaction. The independent policy-log entry and every signed
policy head bind both ID and hash in proposal-log order. A proposal does not alter membership.
The proposal's composite FK names its exact `(conversation_id, envelope_position, envelope_id)` row;
the transaction additionally requires class `external_proposal`, identical public-message bytes/hash,
and the same entitlement-signer credential/fingerprint/generation. These columns are immutable.

A Commit transaction locks conversation, intent/proposals, affected key package/memberships, usage, and
mailbox counters in that order. It requires exact base epoch, roster version/hash, base
`confirmed_transcript_hash`, and the exact ordered `(proposal_id, proposal_hash)` set from the signed
policy head. Every pair must resolve to the same conversation/base epoch and unexpired independent-log
record; an unknown ID, substituted hash, omitted pair, duplicate, or extra pair fails CAS without a
write. It appends the public Commit under the request's UUIDv4 `envelope_id`, records both base
and resulting confirmed-transcript checkpoints, advances epoch once, and updates the log chain.

- Membership Commit: apply joined/removed boundaries, mark the intent's already-taken KeyPackage used, increment
  `roster_version` exactly once, set the proposed roster hash, and return to `active` only when every
  mandatory proposal is satisfied. The intent's composite FK is set to that exact
  `(conversation_id, committed_envelope_position, committed_envelope_id)`; the row must be class
  `mls_commit` and its bytes/hash must equal the accepted Commit.
- MLS Update Commit: leave memberships, roster version, and roster hash unchanged; advance only epoch
  and confirmed-transcript checkpoint.

The database cannot validate secret-dependent MLS confirmation. Clients validate the canonical Commit;
an invalid selected Commit quarantines the conversation and triggers the fork-recovery protocol. A CAS
loser discards staged state and rebuilds from the accepted log.

Scheduled rotation inserts `signer_migrations.state = scheduled`; emergency revocation records the
independent policy-log checkpoint and CASes the predecessor to `suspended` in the same transaction that
inserts `emergency_frozen`, no more than five minutes after the authoritative decision. State CAS is
strictly `scheduled|emergency_frozen -> successor_provisioning -> successor_ready -> cutover_verified
-> complete`; invariant or deadline failure moves any non-complete state to `blocked`. Every transition
checks the stored predecessor/successor credential IDs/fingerprints, source/target checkpoints, and
deadline. `last_authorized_signer_expires_at` is copied from the witnessed policy/security record that
authorized the predecessor's last usable signer. `deadline_at` is at or before that timestamp minus 30
days; an incomplete predecessor is suspended at this T−30 deadline, not at expiry.

Cutover locks migration, old conversation, relationship scope, target plan, and new conversation;
verifies fresh member KeyPackages, new current/staged-next pair (including 30-day staged remainder,
successor-current publication/witness age of at least 30 days, monotonic signer generations, terminal-
state exclusion, and 14-day maximum validity overlap), and the old-member-signed migration statement;
`successor_provisioning` and `successor_ready` persist only a `conversation_plans` row plus hash-checked
client artifacts; they create no conversation, membership, mailbox, or traffic route. To satisfy the
one-live-generation index, cutover first CASes the old generation to `closing`, then inserts and
activates generation `N+1`, then swaps the relationship pointer and records the cutover. It persists
the initial Commit/Welcomes/mailboxes/idempotency and `cutover_verified` in that same transaction; any
failure rolls every step back, so the intermediate ordering is never externally visible. A
witness-confirmed cutover advances to `complete`. The delivery
or entitlement server cannot construct an MLS Commit. No envelope, Welcome, epoch/secret, application
event, or local MLS state is copied. A separately consented read-only encrypted archive is the only
history-transfer mechanism.

### 3.6 Attachment and campaign operations

Object upload does not open a database transaction. Finalize performs provider head/checksum checks,
then locks the manifest and moves `uploading -> ready`. Envelope binding locks attachments in ascending
UUID order inside the append transaction and moves `ready -> bound`; an object cannot bind twice.
Binding/acknowledgement additionally requires a verified cross-region object replication receipt; an
unreplicated object cannot be referenced by an acknowledged envelope.

Campaign audience snapshot creation uses one repeatable-read/serializable authorization snapshot. It
records finalized block/hash, consent/block decision, algorithm version, ordered compatible-scope-set
hash, and exactly one row per account. An exact compatible active scope is chosen by ascending canonical
`relationship_scope_id` and recorded with its immutable policy hash/state `pending`; no compatible scope
records null scope fields/state `scope_pending`.

Scope-plan creation locks the target, rechecks consent/block/eligibility, and stores idempotency with the
reserved plan. Activation locks plan, target, relationship, and conversation in that order and atomically
CASes `scope_pending -> pending` while fixing the one scope/conversation/policy tuple. Exact retries
return the stored plan/result; changed bytes conflict. A failed policy recheck CASes to
`skipped_policy` without a scope. No update can replace a selected scope.

Each campaign delivery locks its `pending` target, verifies the envelope conversation and relationship
scope/policy tuple exactly, rechecks consent/block, and executes the ordinary append transaction. The
same transaction stores accepted envelope ID/position and CASes `pending -> accepted`; composite FKs and
unique constraints prevent duplicate delivery or cross-scope substitution. The API may batch 50 target
attempts, but the batch is resumable rather than atomically spanning conversations. Cancellation changes
only unsent targets and cannot retract accepted envelopes or keys.

## 4. Partitioning, indexes, and isolation

- `envelopes` starts with 64 hash partitions by `conversation_id`; `mailbox_entries` starts with 64 by
  `installation_id`. Partition-count changes use online table replacement.
- CI captures production-shaped query plans for append, CAS, mailbox, conversation page, audience
  snapshot, idempotency, and retention. A release fails when a required bounded index plan regresses.
- API queries use narrow projections; list/roster paths do not fetch ciphertext TOAST values.
- Roles are separated into API writer, delivery reader, identity, entitlement, push, witness dispatcher,
  lifecycle, migration, and break-glass. No application role owns schema or bypasses tenant predicates.
- The access layer always scopes project data by resolved `tenant_id` and authorized installation.
  PostgreSQL RLS is defense in depth, not the sole authorization check.
- Identity wallet ciphertext, push configuration, and message coordination SHOULD reside in separate
  schemas/databases with independent KMS grants. Ordinary operators cannot join them without audited
  break-glass access.
- Capacity review begins at 25% of tested partition/index limits. Storage alarms fire before the
  transactional hard quota can exhaust the writer volume.

## 5. Retention schedule

Retention timestamps are fixed when rows are written from the immutable policy/release manifest; jobs
never infer a deadline from decrypted content. A project may shorten a policy. Extension requires a new
policy revision, participant disclosure where applicable, and must not retroactively revive purged data.

| Data | Default service retention |
| --- | --- |
| Enrollment attempt and paired wallet/possession challenges | Five-minute maximum validity; terminal claims never reopen; challenge payload ciphertext, nonces, and unissued attempt rows deleted within 24 hours |
| Enrollment completion result | Encrypted exact-result body (including any one-time token response) deleted within 15 minutes; terminal request/outcome and non-secret evidence digests 30 days, then only unjoinable security audit |
| Step-up authentication challenge | Five-minute validity; encrypted payload/hash row deleted within 24 hours |
| DPoP replay `jti` | Five minutes |
| Revoked/expired session hashes | 30 days |
| Signed device credential and directory entry/proofs | Active through credential life; revoked/superseded/expired object, revocation version, signed digest, directory chain, checkpoint and witness proof for 400 days after account deletion or last dependent group removal, whichever is later |
| Untaken KeyPackage | Seven days or credential expiry, whichever is earlier |
| Taken KeyPackage/plan | Never returned to inventory; plan valid ten minutes, bytes destroyed within 24 hours after use/expiry/cancel while bounded audit hashes follow audit retention |
| Embedded context | Handle valid at most two minutes; encrypted opaque reference purged within 15 minutes after redeem/expiry/revoke, and context HMAC/linkage/state purged within 24 hours |
| Embedded redemption/session | Cookie/session capability expires within ten minutes and raw value is never stored; redemption/channel commitments and revoked/expired token HMAC deleted within 24 hours; only a random unjoinable audit ID and coarse outcome follow audit retention |
| Tenant origin/issuer verification | While configured plus 30 days after irreversible revocation; ownership proof digest and configuration audit only, never context/provider data |
| Finality profile and lease evidence | Immutable ratified profile while referenced plus 400 days; per-grant finalized evidence digest through grant expiry/revocation plus 30 days |
| Eligibility grant | Expiry/revocation plus 30 days; hashes and finalized evidence location only |
| Policy/proposal and final delivery-log transparency archive | 400 days after conversation purge; scope HMAC, hashes, counters, and signatures only |
| Idempotency response | Seven days except encrypted enrollment success body at most 15 minutes and embed context/redemption linkage at most 24 hours; terminal non-secret state may remain under its own row schedule but never remints a capability |
| Relationship application ciphertext | 180 days after explicit close; auto-close 365 days after generation creation |
| Community application ciphertext | Rolling 90 days |
| Campaign body and per-relationship campaign envelope | Rolling 365 days, or shorter consent/policy deadline |
| Public proposal/Commit | Through conversation ciphertext retention and required bounded catch-up window |
| Welcome | Until target accepts or 30 days, whichever is earlier; only after its join boundary |
| Finalized attachment | Same deadline as its bound envelope |
| Unfinished attachment/campaign upload | 24 hours |
| Acknowledged mailbox reference | Seven days after acknowledgement |
| Unacknowledged mailbox reference | 90 days, then explicit conversation resync |
| Invalid push endpoint | Seven days; active endpoint until logout/revocation/removal |
| Encrypted export object | At most 24 hours; each download capability 60 seconds and single-use |
| Security audit | 400 days in restricted WORM storage |
| Application logs/traces | 14 days hot, 30 days total |
| Aggregated non-identifying metrics | 15 months |
| Minimal deletion ledger | Indefinite hash/generation/time/audit digest; no direct identity/ciphertext |

The service cannot see encrypted “shipped,” “refund resolved,” or case closure events. A retention clock
therefore starts only from an explicit authorized control-plane close or the generation hard deadline.
If two purchase cases need different readers or retention, clients create different relationship
generations; the server does not guess case boundaries inside ciphertext.

## 6. Expiry and bounded cleanup

Authorization checks treat `expires_at <= transaction_timestamp()` as expired even before a worker
deletes the row. Cleanup is reclamation, not the access boundary. Workers claim at most 500
conversations or 5,000 envelope/mailbox rows per transaction with indexed `FOR UPDATE SKIP LOCKED`.

For a selected scope the lifecycle worker:

1. CASes `closed -> retention_expired`, fixes `purge_after`, and records deletion-ledger/outbox work.
2. Marks exact attachment/campaign/export manifests `purge_pending` and deletes the enumerated versioned
   object keys with bounded idempotent retries.
3. Confirms object deletion/version-marker state, copies only the final service/witness checkpoint into
   `transparency_archives` under a non-reversible conversation-scope HMAC, then deletes witness receipts,
   mailbox references, and envelope rows in primary-key batches.
4. Deletes memberships, credentials, proposals, intents, plans, relationship-generation links, and
   conversation metadata through scoped keys.
5. Completes the deletion ledger and exposes terminal `purged` without retaining the resource row.

Authorized live-store deletion, including object versions and caches, MUST complete within 24 hours of
the effective request. An incident does not silently extend this bound: an overdue row pages SEV-1 and
counts as an SLO failure. Daily orphan inventory compares exact object manifests with provider versions;
discrepancies are quarantined before deletion. No worker issues bucket-wide delete or recursive path
operations.

## 7. Account deletion and shared data

Account deletion immediately revokes token families, device credentials/directory authority,
KeyPackages, embedded sessions/contexts, push endpoints, and new mailbox routing, then creates
independently logged Remove intents for every active installation membership.
Cryptographic future exclusion occurs only after each Remove Commit. A revoked installation is never
reactivated; replacement creates a new installation and leaf.

Deletion does not let one participant erase another participant's retained shared transcript. After
removal, account/wallet/installation lookup rows are deleted or replaced by a tenant-scoped
non-reversible tombstone only where shared integrity/audit requires it; shared ciphertext remains until
its policy deadline. A relationship generation may purge immediately when every participant authorizes
it and no disclosed legal retention applies. Recipient devices, prior exports, screenshots, and
separate relay/platform copies are outside service deletion capability and the UI must say so.

Legal holds are disabled by default. If enabled for a jurisdiction/tenant, they live in a separately
restricted system, require basis/owner/expiry/review, affect only the documented scope, and are visible
to authorized affected users where law permits. Indefinite or unreviewed holds are prohibited.

## 8. Ciphertext export

Export authorization requires a fresh action-bound wallet proof. A worker reads only positions within
the requesting account's membership boundaries and produces a versioned manifest of relationship and
conversation IDs, positions, server metadata, signed log heads/witness receipts, roster credentials,
exact ciphertext/hashes, and encrypted objects. It never decrypts.

The archive streams through authenticated X25519 recipient encryption to the supplied export public
key; plaintext archive chunks never touch disk/object storage. A manifest signature covers the ordered
entry hashes. The encrypted object expires within 24 hours and each authenticated download capability
is single-use and expires after 60 seconds. Generation, capability issuance, download, expiry, and
deletion are audited without logging the URL or export key.

## 9. At-rest keys and secrets

- Volumes, replicas, WAL archives, snapshots, queues, and object storage use provider encryption with
  realm/tenant KMS keys.
- Wallet refs, push configuration, upload IDs, lifecycle parameters, relay credentials (in the separate
  relay service), and provider capabilities use application envelope encryption with versioned KMS
  data keys.
- Bearer/refresh/nonce/claim/capability lookups use HMAC-SHA-256 with purpose-separated rotating peppers.
  Unsalted SHA-256 is used only for public ciphertext/canonical-data integrity.
- Delivery readers cannot decrypt wallet or push configuration; analytics cannot fetch ciphertext.
- KMS keys rotate annually and after suspected compromise. New writes switch immediately; bounded
  rewrap never decrypts client ciphertext.
- Cursor AEAD keys rotate every 90 days. Old decrypt-only keys remain for cursor lifetime plus seven
  days, then are destroyed. Delivery-log and witness signing keys have independently published overlap
  and transparency records.

## 10. Migrations

Migrations are immutable, checksummed, monotonically numbered, and record build, operator, checksum,
and start/end time. A service refuses startup outside its declared
`min_schema_version..max_schema_version`. One audited migration job takes an advisory lock; application
pods never self-migrate.

Every change uses expand/backfill/contract:

1. Expand with compatible nullable columns, tables, checks, or concurrent indexes.
2. Deploy measured dual-write/read code behind an owned, expiring flag.
3. Backfill with resumable `SKIP LOCKED` batches, rate/replica-lag limits, and no plaintext transforms.
4. Verify row counts, hashes, constraints, query plans, log-head continuity, and mailbox boundaries.
5. Switch reads, observe through one normal peak, then stop old writes.
6. Contract only in a later release after binary rollback support expires.

Table rewrites, partition-count/type changes, and large FK validation require a shadow/online plan.
Destructive migrations require a tested restore point, deletion-ledger reconciliation plan, two-person
approval, and a later release. Rollback rolls binaries to a schema-compatible version; it never reverses
committed user state or renumbers envelopes.

## 11. Backups and restore

### 11.1 Policy

- Maintain a fenced synchronous cross-region standby for the authoritative critical ledger and stream
  WAL continuously to a separate-account archive. A mutation is not acknowledged without synchronous
  critical-ledger durability.
- Take daily full snapshots and retain them 35 days. Do not create longer monthly copies unless a
  tenant's disclosed policy explicitly requires them.
- Enable object versioning/cross-region replication with a 35-day noncurrent-version expiry.
- Manifest database LSN, object inventory generation, schema/release profile, KMS versions, and
  deletion-ledger high-water mark.
- Require separate break-glass role, phishing-resistant MFA, ticket, time-bound grant, and immediate
  alert for backup access.
- Run restore drills quarterly and after material schema/topology change.

Targets are RPO 0 for acknowledged envelopes, proposals/Commits, Welcomes, membership/pointers,
idempotency responses, mailbox entries, cursor acknowledgements, enrollment/embed terminal claims and
results, wallet/device bindings, signed credentials/directory/revocations, session rotation/revocation,
KeyPackage state, finality-backed grants, and tenant/origin/context invalidation, including regional
writer loss.
RPO at most five minutes applies only to enumerated rebuildable/non-message caches, discovery indexes,
metrics, push hints, and cached chain reads. RTO is at most 60 minutes. These are launch-provisional
until ratified by the verification gate; drills, not provider claims, supply evidence.
Expired backup/object generations MUST be cryptographically inaccessible or physically deleted within
35 days.

### 11.2 Restore procedure

1. Restore into an isolated recovery account/network, never over live production.
2. Restore the selected snapshot and replay WAL to one declared LSN. Attach the matching object
   generation with all API, push, campaign, relay, and webhook egress denied.
3. Verify migration checksums, tenant/project/relationship counts, conversation counters, confirmed-
   transcript checkpoints, envelope/head hash chains, witness receipts, mailbox boundaries, object
   manifests, sampled ciphertext hashes, device-directory entry/checkpoint continuity and witness
   proofs, credential/install revocation versions, finality-profile hashes, KeyPackage states, and
   enrollment/embed terminal-claim uniqueness without decryption.
4. Replay every deletion-ledger generation newer than the backup manifest before any read. This
   prevents restoration from resurrecting deleted primary/object data.
5. Apply the independently stored session/credential/context-revocation security ledger; revoke any
   token family, embedded session, device credential, or available KeyPackage whose state is uncertain.
6. Reconcile exact object versions. Missing ciphertext becomes an explicit unavailable resource and
   alert, never an empty message. Preserve contradictory log/witness state as a security incident.
7. Reclaim outbox rows with worker deduplication. Keep external delivery disabled until consistency is
   approved.
8. Run conformance plus synthetic enrollment (including ERC-1271/6492 unavailable and paired-claim
   replay), embed issue/redeem/replay/channel-mismatch/origin-revocation, append/replay, mailbox, CAS,
   campaign, export, and delete checks. Obtain incident-command and security approval, then shift
   traffic gradually.
9. Preserve the failed environment read-only under incident retention; do not copy it to development.

Restore success is client-visible: an acknowledged envelope is present at its original conversation
position with identical bytes/hash/head, or the incident is declared data loss. Renumbering, fabricating
a gap, silently selecting a fork, or restoring deleted content is forbidden.

## 12. Deliberate separation from the SQLite lab

There is no lab-to-production schema migration. Production replaces lab invitation/session rows with
terminal paired wallet/possession enrollment, wallet links, partition-scoped installations, signed
device credentials/directory, credential-bound DPoP sessions and ordinary KeyPackages, explicit
finality-backed policy grants, and short-lived tenant/origin/channel-bound embed contexts; replaces fixed rooms with
relationships/generations and bounded communities; replaces integer cursors with installation-bound
mailboxes; and adds public handshake/private application wire enforcement, confirmed-transcript CAS,
signed/witnessed append heads, campaigns, object manifests, transactional quotas, outbox, deletion
ledger, and backup erasure.

Production and lab use separate database files/clusters, object stores, namespaces, domains, cookies,
tokens, ID issuers, cursor/signing/KMS keys, telemetry, and operator roles. A lab account, invitation,
conversation, envelope, or cursor is syntactically and cryptographically invalid in production.
