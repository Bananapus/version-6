# Production identity and entitlement authority boundary

> **NOT IMPLEMENTED — DO NOT USE FOR AUTHORIZATION.**
>
> As of 2026-08-14, this document is a specification and the files under
> `src/production/authority/` are type, validation, port, and fail-closed scaffolding only. They do
> not perform cryptographic signature verification, canonical-chain verification, Juicebox or
> Revnet authority verification, receipt interpretation, refund adjudication, device enrollment,
> or entitlement issuance. The current candidate project preview, demo state, and LAN messaging
> service are untrusted development aids. They MUST NOT admit a wallet, device, project owner,
> staff member, customer, token holder, item buyer, or connector to a production conversation.

This document defines the only production boundary allowed to turn wallet and chain inputs into
messaging authority. Until every applicable rollout gate in this document and
[verification.md](./verification.md) has passed, production callers MUST receive an explicit
`unavailable` result and no access lease, device credential, staff credential, claim handle, MLS
proposal, or conversation membership.

The words MUST, MUST NOT, REQUIRED, SHOULD, and MAY are normative release requirements.

## 1. Purpose and non-goals

The authority subsystem answers narrowly scoped questions:

- Did this account approve this exact short-lived challenge for this service, chain, purpose, and
  device key?
- Does this installation prove possession of the device key bound by that approval, and is the
  device still active?
- Who controls this exact Juicebox v6 project at an exact finalized block?
- Has that project authority explicitly delegated an exact messaging capability to this exact
  staff account under the current authority generation?
- Does a canonical finalized transaction contain an exact, authorized Juicebox payment or shop
  mint which the current policy attributes to this account?
- Does the account meet a current finalized direct-holder predicate?
- Has a refund, dispute, transfer, revocation, reorg, block, unsubscribe, or policy change removed
  a right?

It then emits one immutable, auditable decision. It is not an identity provider for natural-person
identity, a payment processor, a shipping database, a dispute court, a discovery indexer, or an MLS
member. It never receives message plaintext, shipping addresses, attachment keys, wallet private
keys, device private keys, or MLS epoch secrets.

Wallet authentication and entitlement are independent predicates. The minimum admission rule is:

```text
active device credential
AND current account/device binding
AND exact project and policy scope
AND finalized authority or entitlement evidence
AND consent and block policy
AND durable audit record
= bounded eligibility lease
```

Every term is conjunctive. A failure, ambiguity, stale input, unsupported case, or unavailable
dependency produces no lease. A lease authorizes only the rights it lists; it is not itself MLS
membership and cannot expose pre-join history.

## 2. Normative external and local sources

Wallet-message profiles are based on:

- [Sign-In with Ethereum, ERC-4361](https://eips.ethereum.org/EIPS/eip-4361)
- [Typed structured data, EIP-712](https://eips.ethereum.org/EIPS/eip-712)
- [Contract signature validation, ERC-1271](https://eips.ethereum.org/EIPS/eip-1271)
- [Counterfactual signature validation, ERC-6492](https://eips.ethereum.org/EIPS/eip-6492)

The local v6 contracts are semantic source material, not deployment authority. Production also
requires a signed deployment manifest which pins every chain, address, ABI digest, proxy and
implementation code hash, event topic, and supported adapter revision. Relevant local sources are:

- [`IJBProjects`](https://github.com/Bananapus/nana-core-v6/blob/898f08b96194391d545df31a62f9d89ef6759f9a/src/interfaces/IJBProjects.sol) and
  [`JBProjects`](https://github.com/Bananapus/nana-core-v6/blob/898f08b96194391d545df31a62f9d89ef6759f9a/src/JBProjects.sol) for ordinary project NFT ownership;
- [`IJBTerminal`](https://github.com/Bananapus/nana-core-v6/blob/898f08b96194391d545df31a62f9d89ef6759f9a/src/interfaces/IJBTerminal.sol) and
  [`JBMultiTerminal`](https://github.com/Bananapus/nana-core-v6/blob/898f08b96194391d545df31a62f9d89ef6759f9a/src/JBMultiTerminal.sol) for `Pay` and
  `HookAfterRecordPay` semantics;
- [`JBAfterPayRecordedContext`](https://github.com/Bananapus/nana-core-v6/blob/898f08b96194391d545df31a62f9d89ef6759f9a/src/structs/JBAfterPayRecordedContext.sol)
  and [`JBTokenAmount`](https://github.com/Bananapus/nana-core-v6/blob/898f08b96194391d545df31a62f9d89ef6759f9a/src/structs/JBTokenAmount.sol)
  for payment accounting context;
- [`IJBController`](https://github.com/Bananapus/nana-core-v6/blob/898f08b96194391d545df31a62f9d89ef6759f9a/src/interfaces/IJBController.sol)
  and [`IJBTokens`](https://github.com/Bananapus/nana-core-v6/blob/898f08b96194391d545df31a62f9d89ef6759f9a/src/interfaces/IJBTokens.sol)
  for issuance and direct project token balances;
- [`IJB721Hook`](https://github.com/Bananapus/nana-721-hook-v6/blob/1ec28e68a550cc0c09428416fb9d7698959591f8/src/interfaces/IJB721Hook.sol)
  and [`IJB721TiersHook`](https://github.com/Bananapus/nana-721-hook-v6/blob/1ec28e68a550cc0c09428416fb9d7698959591f8/src/interfaces/IJB721TiersHook.sol)
  for tiered shop mint semantics;
- [`IJBCashOutTerminal`](https://github.com/Bananapus/nana-core-v6/blob/898f08b96194391d545df31a62f9d89ef6759f9a/src/interfaces/IJBCashOutTerminal.sol)
  for holder cash-outs;
- [`IJBRouterTerminalGateway`](https://github.com/Bananapus/nana-router-terminal-v6/blob/3439033c7bb6c3deacf1ab958ed8b156f1660a84/src/interfaces/IJBRouterTerminalGateway.sol)
  for failed router-call refunds;
- [`IJBProjectPayer`](https://github.com/Bananapus/nana-project-payer-v6/blob/b9f99aa27f17aedd0488c370f2720ab090a2b24e/src/interfaces/IJBProjectPayer.sol)
  for an example of an intermediary payer;
- [`JBPermissionIds`](https://github.com/Bananapus/nana-permission-ids-v6/blob/e75d962ebcade48c0e19d849fe27a7e200b3ed74/src/JBPermissionIds.sol)
  for the existing protocol permission namespace; and
- [`IREVDeployer`](https://github.com/rev-net/revnet-core-v6/blob/5093359f561c0546c29b85147a9cc0de2f608ddf/src/interfaces/IREVDeployer.sol),
  [`REVDeployer`](https://github.com/rev-net/revnet-core-v6/blob/5093359f561c0546c29b85147a9cc0de2f608ddf/src/REVDeployer.sol),
  [`IREVOwner`](https://github.com/rev-net/revnet-core-v6/blob/5093359f561c0546c29b85147a9cc0de2f608ddf/src/interfaces/IREVOwner.sol),
  and [`REVOwner`](https://github.com/rev-net/revnet-core-v6/blob/5093359f561c0546c29b85147a9cc0de2f608ddf/src/REVOwner.sol)
  for Revnet classification and operator authority.

Source code at the current checkout is not evidence that an address on a particular chain runs that
code. The deployment manifest and exact historical chain state are both REQUIRED.

## 3. Authority service boundary

### 3.1 Trusted outputs

Only the production authority service may issue:

- a wallet-verification evidence identifier;
- an account-bound device credential;
- a project-authority generation;
- a project-staff role credential;
- a normalized purchase, item-set, or current-holder evidence identifier;
- a signed, short-lived, single-use eligibility capability;
- a signed entitlement-policy head or mandatory MLS Add/Remove proposal; and
- an immutable authorization decision record.

Each output MUST be domain separated, versioned, canonically encoded, scoped to an environment, and
signed by the key designated for that output. Identity, device, role, entitlement, audit, and MLS
external-sender keys MUST be separate. The entitlement signer has no MLS leaf or group secret.

### 3.2 Untrusted inputs

The following are hints only and can never grant access directly:

- the Bendystraw project preview or any other indexer response;
- names, handles, logos, metadata URIs, project descriptions, or an `isRevnet` display flag;
- a wallet address supplied by a browser, host app, WhatsApp account, or Telegram account;
- a successful wallet connection without the exact service challenge;
- a transaction hash, log index, receipt, decoded event, balance, token ID, or project ID supplied by
  a client or integration;
- `tx.from`, a `Pay.caller`, a `Pay.payer`, or a token mint viewed without the attribution rules in
  this document;
- a host assertion such as `eligible`, `owner`, `staff`, `customer`, `holder`, or `refunded`;
- a Juicebox/Revnet frontend session or API token;
- a phone number, business profile, connector user ID, or provider verification badge; and
- cached, `latest`, merely `safe`, unfinalized, ambiguous, conflicting, or orphaned chain data.

An approved first-party integration may exchange a candidate receipt for an opaque, one-time claim
handle. The authority service MUST independently resolve and validate the evidence. Integration
client credentials authorize only submission within an assigned project scope; they cannot assert
the outcome.

### 3.3 Canonical value rules

Every boundary parser MUST reject inherited properties, duplicate fields, missing fields, additional
fields, unknown enum values, non-canonical encodings, and values beyond configured limits. In
particular:

- EVM addresses are exact 20-byte values and normalized once; the zero address is rejected unless a
  field explicitly permits it.
- Hashes are exact 32-byte values. Signatures and byte strings are bounded before decoding.
- `uint256` values cross JavaScript boundaries as canonical unsigned decimal strings, never as
  JavaScript numbers. `projectId` and `logIndex` may use safe integers only where the schema states
  that explicitly.
- Timestamps are canonical UTC RFC 3339 instants with milliseconds. Server time, not a device clock,
  decides freshness.
- A project reference binds `juicebox-v6`, version 6, the EIP-155 chain ID, the exact deployment
  manifest and `JBProjects` address, and `projectId`. The same number on another chain is unrelated.
- A log reference binds chain ID, transaction hash, receipt identifier, block number, block hash,
  emitter, exact block-global JSON-RPC `logIndex`, topic zero, ABI revision, and normalized evidence
  digest.
- Collections whose order has no meaning are unique and canonically sorted. Item purchases preserve
  the exact tier/token multiset where multiplicity matters.

All digests use one documented canonical encoding and an explicit domain/version. JSON
stringification, UI formatting, locale behavior, and provider-specific decoded objects are not
canonical encodings.

## 4. Wallet control challenges

### 4.1 Supported profiles

Version 1 device enrollment supports exactly one of two public server-issued profiles:

1. `siwe-erc4361-v1`: an ERC-4361 SIWE message with the exact HTTPS authority and fixed authentication
   URI, version `1`, allowlisted chain, service account, `challengeId` as Request ID, alphanumeric
   server nonce, fixed enrollment statement, and issue/not-before/expiration times. Its resources are
   exactly these 13 ordered entries: enrollment ID, service account ID, installation ID, preallocated
   device-credential ID, encoded API audience, client ID, canonical scope digest, P-256 installation-
   authentication JWK thumbprint, MLS Ed25519 credential fingerprint, ordinary KeyPackage reference,
   KeyPackage SHA-256, protocol-profile commitment, and preallocated `possessionChallengeId`.
2. `eip712-device-enrollment-v1`: an `eth_signTypedData_v4` EIP-712 message whose fixed primary type is
   `JuiceboxMessagingDeviceEnrollmentV1`. Its published type graph binds the two challenge IDs and the
   same origin, audience, client, purpose, scope, enrollment/account/chain, installation/credential,
   dual-key, KeyPackage, protocol-profile, nonce, and validity-window fields. The domain binds service
   name, schema version, allowlisted chain, and deployment/environment salt.

The canonical field names, encodings, EIP-712 member order, and SIWE resource URNs are those in
[service-api.md](./service-api.md#33-bind-keys-and-issue-paired-challenges). Values cannot be omitted,
reordered, renamed, or supplied under a legacy alias. In particular, `siwe-eip4361`, `eip712-v4`, and
`JuiceboxMessagingChallenge` are not wire profiles. The wallet payload commits to the preallocated
possession-challenge ID, not the later possession digest; that digest is computed only after the exact
wallet bytes or typed graph and its digest have been persisted.

Identifier namespaces are part of the signed profile: enrollment, wallet-challenge, and possession-
challenge IDs are canonical UUIDv7 values; account, installation, and device-credential IDs are
canonical UUIDv4 values. EIP-712 encodes them as exact `bytes16`; SIWE resources use their canonical
hyphenated strings. A syntactically valid UUID of the wrong version is rejected rather than aliased.

The SIWE request URI is the dedicated messaging origin's fixed wallet-authentication path. Scheme,
host, port, path, environment, and chain must match exactly. Wildcard domains, alternate origins,
redirect-derived origins, insecure HTTP, Unicode lookalikes, userinfo, fragments, and trailing-dot
hosts are rejected.

The EIP-712 domain does not replace application replay protection. The service profile adds a
single-use server nonce, both challenge IDs, purpose, origin, exact device binding, and short validity
window.
The domain salt is different for production, testnet, staging, and local environments. An EIP-712
signature is never accepted as SIWE, or vice versa, and there is no fallback to an unscoped
`personal_sign` message.

The two profiles above are enrollment-only. Session establishment, device recovery, and project-
authority actions require separately frozen profiles and type graphs; a proof for one purpose cannot
authorize another.

### 4.2 Nonce lifecycle and exact bytes

- The service generates at least 128 bits of CSPRNG entropy; a client never chooses the nonce.
- A challenge expires no later than five minutes after issue and may have a bounded `notBefore`.
- The server preallocates both challenge IDs and persists the exact bytes or exact typed-data graph
  shown to the wallet, its digest, and every enrollment/key/package binding before deriving or
  returning the possession challenge.
- After resolving and structurally bounding a submitted challenge ID, the service performs an
  atomic compare-and-set from `issued` to `claimed` **before** any expensive signature or contract
  verification. Exactly one concurrent claimant wins; all other submissions fail.
- `claimed` is terminal. An invalid signature, malformed proof, verifier timeout or unavailability,
  process crash, interrupted verification, or audit-finalization failure never releases, reopens, or
  returns the challenge to `issued`. The client must obtain a new challenge.
- Later verification-outcome and audit finalization may append or complete the result associated
  with the terminal claim, but neither operation can reopen it. No retry, lease expiry, recovery job,
  or operator action can make the challenge usable again.
- A claimed, expired, unknown, wrong-origin, wrong-chain, wrong-account, wrong-purpose, or
  wrong-device challenge is rejected before any session or credential is created.
- Logs and analytics never contain the raw challenge, nonce, signature, or typed data. Audit stores
  only scoped identifiers, outcome codes, and cryptographic digests.

The canonical message parser MUST be independent from the wallet UI and tested with every individual
field mutated, duplicated, omitted, reordered where ordering is significant, or replaced by a
visually similar value.

### 4.3 Signature-method dispatch

Method selection uses chain state at one recorded finalized block, not client preference or a stale
`latest` code lookup:

1. Detect an ERC-6492 wrapper by its exact magic suffix before attempting ordinary EOA or ERC-1271
   validation.
2. Otherwise inspect account code at the same block. No code selects the approved EOA verifier;
   code selects ERC-1271.
3. A provider error, disagreement, pruned state, unknown wrapper, unsupported proxy, ambiguous
   result, or verification budget exhaustion returns `unavailable`. It never falls back to another
   method which could reinterpret the bytes.

EOA verification MUST enforce the exact signed digest and recovered account, canonical signature
encoding, low-`s` policy, supported recovery values, and bounds. It rejects truncation, appended
bytes, alternate messages, chain/origin replay, and address substitution.

ERC-1271 verification MUST call the pinned `isValidSignature(bytes32,bytes)` profile against the
recorded finalized state with bounded gas and response size. Only the exact `0x1626ba7e` magic value
is success. Revert, empty/short/oversized return data, a Boolean, a wrong magic value, provider
disagreement, and a result from another block are not success. The evidence records the block
number/hash, contract and implementation code hashes, digest, return value, provider set, and
adapter revision. A Safe or DAO signature proves that contract account authorized the action; it
does not make each signer project staff.

ERC-6492 verification MUST use the exact wrapper suffix, audited universal-validator semantics, and
bounded recursion, calldata, gas, factory calls, and return data. It executes only in a read-only
simulation against a recorded finalized block. It MUST NOT broadcast or persist a deployment or any
other state change. The evidence records the counterfactual account, wrapper/factory identity,
simulation block/hash, code assumptions, and a `sideEffectsPersisted: false` invariant. Factory
failure, wrong deployment address, inner-signature failure, provider disagreement, or unavailable
simulation returns no verification.

A verified wallet proof establishes control of an account for one action at one time. It does not
establish a person's legal identity, safe device state, purchase attribution, project authority,
staff role, perpetual control, or consent to messages.

## 5. Device enrollment and lifecycle

Each installation creates two distinct local signing identities plus its MLS/HPKE material. The
`installationAuthKey` is P-256 ES256 under profile `p256-es256-dpop.v1`; its canonical public JWK and
RFC 7638 thumbprint bind possession proofs and DPoP sessions. The `mlsCredentialKey` is Ed25519 under
profile `mls-credential-ed25519-suite-0x0001.v1`; it authenticates MLS cipher-suite `0x0001`
credentials and KeyPackages. Neither private key may substitute for the other. Wallet material is
never used as an encryption key, seed, recovery key, or deterministic input to either device key.

Enrollment is one atomic protocol:

1. The service allocates the enrollment/account, installation, device-credential, wallet-challenge,
   and possession-challenge IDs, then stores the exact origin, audience, client, purpose, scope, both
   public-key commitments, and initial ordinary KeyPackage reference and SHA-256.
2. It constructs and persists the exact wallet payload first. It then computes a one-time possession
   digest over domain `jb-msg-device-possession/v1`, the wallet challenge ID and stored wallet-payload
   digest, the possession challenge ID and nonce, and every matching enrollment/account/chain,
   installation/credential, key/package, audience/client/origin/purpose/scope/profile/time binding.
3. The wallet signs the wallet challenge. The P-256 `installationAuthKey`—never the wallet or MLS
   credential key—signs the possession digest using canonical low-S raw `r || s` ES256.
4. After bounded structural parsing, the service atomically claims both challenges before expensive
   proof verification. Exactly one enrollment attempt can own the pair, and both claims remain
   terminal after every success, invalid result, timeout, crash, or interruption.
5. The verifier validates both proofs, the exact cross-bindings, challenge freshness, account state,
   device limits, prior revocation, and audit availability.
6. Only a verified attempt atomically reserves all unique IDs/key fingerprints, inserts the validated
   ordinary KeyPackage, appends the device-directory and audit entries, and returns an account-bound,
   server-signed device credential. A partial issuance failure grants nothing and never reopens either
   claimed challenge; result/audit repair may finalize the terminal attempt record only.

A device credential contains no project, customer, staff, or conversation role. Its canonical signed
payload binds the preallocated credential ID, enrollment/account/participant and chain, installation
ID, full P-256 and MLS public bindings, initial ordinary KeyPackage commitment, wallet and possession
evidence digests, issue/expiry, monotonic revocation version, and server signer/key version. Its
lifetime is at most 30 days. Ordinary sessions are shorter-lived and P-256 proof-of-possession bound.
High-risk actions require a fresh wallet proof.

Before issuance, the MLS adapter MUST independently parse the complete KeyPackage bytes, recompute
its reference and SHA-256, enforce suite/credential/init-key consistency and expiry, and reject a
last-resort or reused package. The authority scaffold currently commits only the validated reference
and hash; without that production MLS adapter and signed-credential verifier, enrollment remains
`unavailable`.

Every installation is distinct. Copying browser storage, cloning an app container, restoring a
snapshot, reinstalling, or recovering an account cannot reuse an installation credential. Recovery
enrolls a new device and new MLS leaves. A revoked device ID, public key, credential ID, or
installation ID can never become active again, even if the same wallet later approves it. Device
addition, rotation, suspension, and revocation require append-only key-transparency inclusion and
client-visible consistency checks before production launch.

Clock skew on a device cannot extend a credential. Concurrent enrollment, challenge replay, key
substitution, conflicting transparency views, registry unavailability, or audit failure returns
`unavailable` or `invalid` and issues nothing.

## 6. Project authority and staff delegation

### 6.1 Ordinary Juicebox projects

For an ordinary Juicebox v6 project, root authority is the exact value returned by
`JBProjects.ownerOf(projectId)` at the recorded finalized block, read from the manifest-pinned
`JBProjects` contract and code revision. The read is made using the exact block hash where supported,
with canonicality required.

If the owner is an EOA, it authorizes through the EOA challenge profile. If the owner is a contract,
it authorizes through the supported ERC-1271 or ERC-6492 profile. A controller, terminal, metadata
editor, payout recipient, token holder, multisig signer, Juicebox operator, or transaction sender is
not root messaging authority merely because it can affect the project.

### 6.2 Revnets

`ownerOf(projectId)` is insufficient for a Revnet because the project NFT is intentionally held by
the canonical `REVOwner` contract. A project is classified as a supported Revnet only when the exact
finalized evidence shows all of the following:

- the deployment manifest pins `JBProjects`, `REVDeployer`, `REVOwner`, related dependencies, ABIs,
  proxy/implementation code hashes, and a supported configuration schema;
- a canonical `DeployRevnet` record from that `REVDeployer` identifies the project and exact encoded
  configuration hash;
- `REVDeployer.PROJECTS()`, `REVDeployer.OWNER()`, `REVOwner.PROJECTS()`, and
  `REVOwner.deployer()` form the expected pinned relationship at that block;
- `JBProjects.ownerOf(projectId)` is that `REVOwner` contract;
- initialization/configuration state for the project matches the deployment record; and
- `REVOwner.isOperatorOf(projectId, account)` returns true at that same finalized block.

The candidate preview's `isRevnet` field, a project name, a known-looking owner address, or a lone
`isOperatorOf` call is never classification evidence. Missing historical state or any mismatch is
unsupported/unavailable, not ordinary-owner fallback.

### 6.3 Authority generations

Every project has a service-side, append-only authority generation bound to the finalized root
principal and its evidence. A gap-free manifest-pinned scanner persists the exact block/transaction/
block-global-log cursor and verified-through finalized head for every ordinary-owner or Revnet-
operator transition; polling only the current value is insufficient. The generation increments for
every finalized root transfer, Revnet operator replacement, authority-mode change, or recovery
rotation. It never decrements or reuses an identifier. A transition `A -> B -> A` creates a new
generation for the second `A`; delegations from the first `A` stay revoked.

Each scan extension proves that its previous checkpoint's last generation ID, sequence, project, and
canonical transition cursor are exactly the predecessor generation used to validate the next range.
A stale checkpoint/generation pairing cannot seed a branch even if both objects are valid separately.

An owner/operator relinquishment, zero-root state, unsupported authority mode, or orphaned authority
anchor produces a new disabled tombstone generation rather than leaving the prior active generation
current. Transition evidence binds the exact project/deployment, predecessor generation and
principal/mode, decoded event or state transition, canonical block/hash and cursor, resulting root
state, and scanner checkpoint. Missing history, a cursor gap, or a reorg which has not atomically
retired the affected generation keeps project authority unavailable.

When the root or operator evidence changes:

- stop issuing project/staff leases immediately;
- suspend privileged sends while the change is pending confirmation;
- invalidate all earlier-generation staff delegations and role sessions;
- publish mandatory Remove intents for devices which lost read rights;
- rotate/rekey the affected conversations through MLS; and
- do not grant the successor old relationship history or recovery archives.

Server-side denial contains delivery while removal is pending but is not cryptographic revocation.
Past plaintext cannot be erased from a former reader.

### 6.4 App-specific staff delegation

Juicebox permission IDs 1 through 39 describe protocol/economic actions. There is no messaging-staff
permission. `ROOT`, `SIGN_FOR_ERC20`, metadata, terminal, mint, payout, Revnet operator, or other
economic authority MUST NOT silently imply the ability to read customer messages or shipping
addresses.

Messaging staff are appointed by a current root/Revnet authority proof through an app-specific,
signed delegation. A delegation is:

- bound to one exact project reference and current authority generation;
- issued to one exact account, which must enroll individual devices;
- non-transitive and unable to delegate or broaden itself;
- monotonically revisioned, explicitly revocable, not valid before its issue time, and limited to at
  most seven days before refresh;
- scoped to a canonically sorted subset of named capabilities; and
- invalid when its issuer, generation, project, account, time window, revision, signature evidence,
  or audit record is stale or unavailable.

Version 1 capabilities are intentionally granular:

| Capability | Meaning |
| --- | --- |
| `support:read-messages` | Read future content in relationships to which this staff member is explicitly assigned. |
| `support:send-messages` | Send allowed support event types in those assigned relationships. |
| `fulfillment:request-address` | Request a shipping address from the customer. |
| `fulfillment:read-address` | Decrypt an address only in the exact assigned relationship and recipient epoch. |
| `fulfillment:acknowledge-address` | Acknowledge an exact address version. |
| `fulfillment:update-status` | Emit allowed preparation/fulfillment transitions. |
| `fulfillment:set-tracking` | Bind tracking and the shipped transition atomically. |

Wildcards, project ID zero, “all capabilities,” inherited Juicebox permissions, subdelegation, and
implicit access to every relationship are prohibited. Root authority can appoint itself as named
staff, but still needs an explicit role credential and assignment before reading customer content.
Shipping addresses remain E2EE application content; they never enter delegation, eligibility,
audit, notification, indexer, or connector metadata.

Community moderation, announcement sending, refund attestation, and other future business powers
require separate capability-schema revisions and rollout evidence. They are not smuggled through a
generic support or fulfillment capability.

## 7. Canonical chain evidence and finality

### 7.1 Supported chain scope

The schema recognizes Ethereum, Optimism, Base, and Arbitrum One plus their Sepolia networks. This is
not automatic production support. Each chain/environment is promoted separately with an exact
deployment manifest, finalized-tag semantics, archive-state behavior, RPC quorum, reorg procedure,
and adapter evidence. A proof on one chain cannot authorize another. Omnichain grouping is a
separate verified mapping of exact project references, never an indexer group ID.

### 7.2 Finalized block anchor

New authority can be granted only from a block returned under the release-approved meaning of
`finalized`. The evidence records chain ID, block number, block hash, finalization time, provider
identities, policy ID, and adapter revision. The providers must agree on the hash for that height and
on every authority-sensitive result. Mainnet production requires at least two operationally
independent providers; multiple endpoints backed by one node/operator are not independent.

A fixed confirmation count is not a fallback for a missing or inconsistent `finalized` tag. An L2
adapter MUST prove that its provider's finalized result has the chain-specific L1 settlement meaning
approved in the release manifest. If it cannot, that chain remains disabled.

Historical contract reads use the exact receipt/decision block hash and `requireCanonical: true`
semantics where the chain client supports the [EIP-1898](https://eips.ethereum.org/EIPS/eip-1898)
form. Archive state, proxy implementation, code hashes, and deployment relationships must all be
available at that block. A `latest` read cannot be combined with an older receipt to fill missing
evidence.

The `safe` head may suspend or revoke an existing lease sooner as a containment measure. It can
never create or extend authority. Provider disagreement, a halted finality head, rate limiting,
pruned state, unsupported tags, inconsistent logs, or missing code produces `unavailable`.

### 7.3 Receipt and log evidence

A canonical receipt record requires:

- the exact successful transaction receipt from the approved chain;
- a finalized block number/hash whose canonicality was quorum-checked;
- agreement on transaction hash, transaction index, status, cumulative data needed by the adapter,
  complete ordered logs, every emitter, topic, and raw data byte;
- exact block-global JSON-RPC log indices, which are never guessed from an event's position among
  filtered results or recomputed as a receipt-local ordinal;
- locally decoded events using the manifest-pinned ABI and strict decoder;
- historical authentication of every terminal, hook, router, proxy, implementation, directory, and
  project relationship used by the interpretation; and
- a canonical evidence digest over raw and interpreted fields.

Ordinary JSON-RPC receipt responses are provider assertions, not cryptographic receipt-trie proofs.
The adapter's trust model and quorum therefore remain explicit. If a chain adapter later accepts a
receipt-trie inclusion proof, it must verify that proof locally against the finalized header's
`receiptsRoot`; it does not weaken any emitter, ABI, state, or semantic check above.

An event signature alone is never authority: any contract can emit the same topic. Custom terminals
and hooks are unsupported until separately reviewed and added to the manifest. Proxy upgrades and
metamorphic/code changes require the exact historical implementation to be recognized.

### 7.4 Reorg response

Finalized does not mean impossible to reorganize. The service continuously rechecks stored block
number/hash anchors and policy heads. A changed block hash, missing receipt, changed historical
result, or conflicting provider view makes the evidence orphaned. It MUST atomically:

- revoke every derived unexpired lease and capability;
- prevent old-policy sends and new admissions;
- append the orphan/revocation decisions without rewriting the original record;
- issue mandatory MLS removal intents where rights were lost;
- require a membership epoch change/rekey before compliant clients send again; and
- recompute from the replacement canonical chain only after it reaches finalized status.

No evidence ID, delegation generation, or receipt interpretation from the orphaned branch may be
reused. If recomputation is impossible, the affected scope stays unavailable.

## 8. Juicebox payment attribution

### 8.1 Event allowlist

The v1 adapter pins the following topic-zero values as ABI snapshot tests. The emitter and semantic
checks remain mandatory.

| Event | Topic zero | Authority use |
| --- | --- | --- |
| `IJBTerminal.Pay` | `0x133161f1c9161488f777ab9a26aae91d47c0d9a3fafb398960f138db02c73797` | Candidate purchase record after terminal/project verification. |
| `IJBTerminal.HookAfterRecordPay` | `0xb1ed2cd5f80d2005b57f16c4c1a1c8ee500b96725924cad83e44f32f05f400c0` | Exact accounting and hook correlation. |
| `IJBController.MintTokens` | `0xe6fee9c572244c0c2238c3112ac12d411750a7ee00eeebd32521c3e5a666c14b` | Never purchase evidence by itself. |
| `IJBTokens.Mint` | `0x0153be209252ccc3b70df14d55d2cc93fa5a74e263b163d9a1caf45152fd0e86` | Never purchase evidence by itself. |
| `IJB721TiersHook.Mint` | `0x598baf7bf150ca2f42be9e9f8f55e81d45f5715c3ff22bf46d697fabec7f31d6` | Candidate shop item only after exact pay/hook correlation. |
| `IJB721TiersHook.MintReservedNft` | `0x80dd2efbbc431cde0164d84d638e44ba6e7a3ca5d532ceef1bb4efcc0948325d` | Explicitly excluded from purchase evidence. |
| `IJBCashOutTerminal.CashOutTokens` | `0xfaf1d4bf1b08470c7ed8c351c5065f51af70b36b237723173f898453b9724142` | Holder redemption, never a purchase refund. |

Any ABI or topic change is a new adapter version and must fail closed until reviewed.

### 8.2 What `Pay` proves

The canonical `Pay` event contains ruleset ID, ruleset cycle number, project ID, payer, beneficiary,
amount, newly issued project-token count, memo, metadata, and caller. A valid record proves only that
the authenticated terminal recorded that event for the project in the canonical successful receipt.

The event does **not** include the payment token, its decimals, or currency. The adapter may interpret
payment accounting only from either:

- an exactly correlated `HookAfterRecordPay` context containing `JBTokenAmount`, or
- a separately approved, deterministic transaction/call-trace adapter which proves the exact
  terminal invocation and token accounting context at the same block.

If neither is available, the payment's accounting is explicitly `unknown-from-pay-log`. The adapter
must not attach a token symbol, decimals, fiat value, or current terminal accounting context to the
historical event. A current indexer “latest terminal” value is display-only.

`Pay.payer` is the `payer` passed through terminal execution and ordinary direct `pay` uses the
terminal's `_msgSender()`. Routers, forwarding terminals, project payers, meta-transactions,
same-terminal split payments, and other intermediaries can therefore appear as payer. `Pay.caller`
and `tx.from` also describe execution, not necessarily the customer or ultimate funder.

The v1 customer attribution rule is consequently:

- the `Pay.beneficiary` is the default purchase-support customer; v1 item evidence supports only
  tier-hook flows whose separately emitted `Mint.beneficiary` is the same account (hook metadata can
  otherwise select a different effective NFT recipient);
- `payer`, `caller`, and `tx.from` never silently receive customer rights;
- a gift remains support for the beneficiary unless an independently authenticated checkout/order
  record explicitly names another participant under a reviewed policy; and
- any “ultimate payer” or funder claim requires separate, exact attribution evidence and is
  unsupported until that adapter has its own tests and rollout approval.

The service never guesses attribution by wallet transaction history or matching values. An
integration-provided account is checked against the normalized evidence rather than trusted.

### 8.3 Payment versus token issuance

Owner/admin `MintTokens`, low-level `IJBTokens.Mint`, an ERC-20 transfer, an airdrop, an auto-issue,
or a positive current balance does not prove a purchase. Conversely, a legitimate payment may issue
zero project tokens. Purchase policies use the authenticated `Pay`, not a mint heuristic.

The `Pay.amount` may be zero in valid shop flows which consume previously accumulated pay credits.
Zero is not rejected merely because no new funds moved in that call. The proof must still contain the
full, unambiguous payment/hook/shop correlation and must identify how the supported hook applied
credits. A `Mint.totalAmountPaid` value is hook output; it is not silently equated with the terminal's
payment amount or used to infer payment token accounting.

## 9. Tiered shop purchase correlation

An item-set purchase is stronger than “a `Mint` exists in the same transaction.” Version 1 uses the
exact correlation profile `canonical-exclusive-receipt-call-trace-correlation.v1` and requires one
normalized evidence bundle containing:

- one canonical, authorized `Pay` log for the exact project;
- the exact terminal and its historical project/token authorization;
- one exact `HookAfterRecordPay` emitted by that terminal for the authenticated tiered 721 hook;
- the hook context with equal project ID, ruleset ID, payer, beneficiary, newly-issued count, and
  accounting context as required by the adapter;
- one or more `IJB721TiersHook.Mint` logs emitted by that same authenticated hook for the same
  beneficiary;
- exact token IDs, tier IDs, `totalAmountPaid` fields, caller fields, and block-global JSON-RPC log
  indices;
- the hook's `projectId()` and deployment/configuration relationship at the receipt block; and
- a complete, non-truncated bounded call-trace digest and full-receipt inventory proving a unique
  deterministic correlation among those calls and logs.

All components must be in the same successful finalized receipt, but same-receipt presence alone is
not sufficient. The selected `Pay` and `HookAfterRecordPay` must be on one authenticated terminal call
frame, and every selected `Mint` must be on the one direct terminal-to-tier-hook child frame. The full
receipt must contain exactly the permitted window and expected-emitter logs for this v1 profile. A
transaction containing another candidate window, batching, nested routing, reentrancy, a truncated or
unavailable trace, or more than one association is `ambiguous`/`unavailable` and grants nothing. The
adapter never assumes that the closest preceding `Pay` is the parent.

`MintReservedNft` is never purchase evidence. Direct/admin mints, reserved/promotional mints, mints
from an unrecognized hook, a mint paired only with `MintTokens`, or logs from a spoof contract are
rejected. An item-set condition binds the exact project, hook, tier multiset and/or token IDs,
adapter version, purchase relationship (`beneficiary` by default), and refund policy. It never uses
mutable item names or metadata as authority.

For historical-buyer policy, later NFT transfer does not transfer the old support relationship or
history. For current-item-holder policy, the adapter instead reads `ownerOf(tokenId)` at the current
finalized block; the new holder may obtain future room access only, subject to consent, with no
purchase-support history. These are different policy kinds and cannot be conflated.

## 10. Token-holder conditions

The v1 token-holder policy means a current finalized direct balance under the manifest-pinned
`IJBTokens.totalBalanceOf(holder, projectId)` semantics, with an explicit minimum. It binds the exact
project token identity and evaluated block/hash. Dust or an unsolicited airdrop can satisfy a balance
predicate but never supplies consent.

Custody accounts, wrappers, bridges, suckers, LP positions, lending collateral, delegated voting
power, Safe modules, off-chain snapshots, and “economically owns” claims are unsupported unless an
independent policy adapter defines and verifies them. Unsupported indirect ownership is not rounded
up to direct ownership. A transfer or balance drop revokes future access under a current-holder
policy and requires removal/rekey; a recipient gets no old backlog. A historical-purchaser policy is
evaluated from purchase evidence instead and is not revoked merely by transferring project tokens.

Announcement audiences, community rooms, and purchase-support relationships remain separate:

- token/item condition answers eligibility only;
- consent, unsubscribe, block, jurisdiction, abuse controls, and registered encryption endpoints
  are additional audience filters;
- recipient lists are hidden from recipients;
- replies to announcements create private support relationships rather than exposing a broadcast
  roster; and
- no token or purchase automatically opts a person into marketing.

## 11. Refunds, disputes, and fulfillment

Juicebox v6 has no canonical completed-purchase refund event. `CashOutTokens` is a holder redemption
of project tokens. `JBRouterTerminalGateway_RefundPendingCall` returns input from a failed retained
router call to its source project. Neither proves that a completed customer purchase was refunded.
The absence of either event does not prove “not refunded.”

Version 1 therefore uses a separate append-only refund/dispute ledger. It accepts only authenticated,
audited attestations from the current project authority generation. A future delegated commerce or
refund signer requires a distinct capability-schema revision and its own rollout gate; the version 1
support/fulfillment capabilities cannot write this ledger. An attestation binds:

- its own immutable ID and monotonic order-case revision;
- the exact normalized purchase evidence ID and order/case scope;
- exact affected item/token IDs and, where accounting is known, the partial or full amount and
  accounting context;
- state `refunded`, `disputed`, or `resolved`—there is no affirmative `not-refunded` attestation;
- issuer account, device credential, project role/delegation, and authority generation;
- issue/effective time, external case digest if any, prior ledger head, policy revision, and audit
  decision ID; and
- a signature under a dedicated canonical refund-attestation domain.

Each lookup starts with a fresh, one-use request ID and challenge digest. The current project root (or
separately approved future refund signer) signs an exact EIP-712 record and a fresh lookup response.
The stable head commits ledger sequence, predecessor head digest, exact purchase/resource scope,
current record/state, case revision, and ledger-recorded time; the fresh response additionally binds
the lookup challenge and signed time. The service recomputes canonical payload, stable-head,
signature, and evidence digests, verifies head and current record independently, requires a head no
older than five minutes, and advances its persisted checkpoint only by a legal exact-predecessor
transition. An unverified, skipped, rewound, conflicting, or out-of-scope head blocks eligibility.

No entry contains a name, address, tracking number, memo, raw metadata, payment instrument, or free
text. Those stay in the E2EE case or the merchant's separately governed system. “No applicable entry
at ledger head H” may be recorded as an evaluation fact; it is not a signed claim that no refund
exists elsewhere.

Partial refunds affect only their exact item/amount scope. A `clear` result must match the exact
resource/item scope being evaluated and prove a monotonic order-case transition from the persisted
predecessor; a direct `resolved/purchase-upheld`, cross-item record, or later `no-applicable-entry`
cannot erase an earlier blocking case. Split fulfillment, chargebacks, reversals, and external
processor disputes need explicit cumulative-state adapters; ambiguity cannot revoke unrelated items
or grant access. A refund never grants a new reader. The default support behavior is:

- a verified beneficiary may initiate private support after purchase;
- support remains available through the configured fulfillment plus reasonable refund/dispute
  window, even if ordinary item-community eligibility is removed;
- a disputed case is limited to the customer and explicitly assigned support staff;
- a resolved/refunded case follows its immutable policy for bounded grace and closure; and
- new owners, token transferees, or replacement staff never inherit old support plaintext.

The exact commercial time windows and resolution outcomes remain release-manifest product policy and
must be approved before the affected launch gate. If no policy exists, no new access is granted.

Shipping-address exchange happens only inside the native E2EE relationship. The customer sees the
exact recipient staff/device snapshot before sending. Address versions, acknowledgements,
preparation, tracking, and shipped transitions are authorized separately. A change before shipment
invalidates the prior acknowledgement; tracking and the transition to shipped are one authenticated
atomic application event. The authority service sees only opaque case, policy, staff assignment, and
capability identifiers.

## 12. Decision and audit model

### 12.1 Four outcomes

Every evaluator returns exactly one outcome:

| Outcome | Meaning | May create or extend authority? |
| --- | --- | --- |
| `eligible` | All required positive evidence is verified and current under one policy. | Yes, only after audit persistence and only for listed rights/expiry. |
| `ineligible` | Complete authoritative evidence proves the predicate false. | No. |
| `pending-finality` | Candidate evidence exists but its block is not finalized. | No; it may be retried later. |
| `unavailable` | Required verification, state, provider agreement, adapter, registry, or audit is unavailable/ambiguous. | No; never translated to `eligible` or a cached success. |

`invalid` may be used inside identity/evidence verification for malformed or conclusively bad input,
but the policy decision exposed to the admission service remains one of the four outcomes above.
Client-facing errors are privacy-preserving and do not become a wallet/order enumeration oracle.

### 12.2 Required decision fields

An immutable decision binds:

- decision ID, schema version, evaluation time, service release and environment;
- subject account, participant and device credential IDs;
- exact project, resource/conversation, requested condition, and separate requested rights;
- policy ID, monotonic revision, canonical policy hash, and authority generation where applicable;
- canonical input digest and sorted evidence references with adapter/ABI/deployment versions;
- finalized block number/hash and provider-set digest for every chain fact;
- refund-ledger head, consent/block facts, and recheck inputs where applicable;
- outcome, stable reason codes, issue/expiry, and required follow-up/revocation action; and
- audit signer/key version and a link to the prior policy/decision head where ordering matters.

An `eligible` decision MUST have non-empty positive evidence, non-empty rights, a bounded lease, and
no unresolved negative input. Only `eligible` has an access lease. Its expiry is no later than the
earliest device, role, policy, provider-freshness, entitlement, consent, or product-policy expiry.
Current root/staff/holder facts are rechecked on sensitive actions and at a short policy-defined
cadence. A historical purchase fact still rechecks canonicality, refund-ledger head, consent, and
block policy.

Raw wallet signatures, challenges, nonces, RPC URLs, full receipts, memos, metadata, item names,
shipping addresses, phone numbers, message content, and tracking data are excluded from ordinary
audit records. Access-controlled evidence storage retains only what the approved incident and
appeal process requires, under [storage-and-retention.md](./storage-and-retention.md).

### 12.3 Atomic effect and revocation

The audit record is written before a decision becomes effective. Lease/capability issuance and the
audit append are one transaction or an idempotent outbox operation whose incomplete state grants
nothing. An audit-store outage returns `unavailable`.

Revocation never edits the original decision. One idempotent coordinator transaction names the
orphaned evidence and every derived lease/generation, appends the later decision and signed policy
head, invalidates admission and send capability, persists the outbox/audit record, and produces the
required MLS Remove/rekey intent. Nothing resumes until that commit and the required epoch transition
are durable.
Clients require a fresh, monotonic policy head before sealing; cached delivery-service state is not
sufficient. A stale or missing head stops sends.

## 13. Required implementation ports

Production code must keep interpretation behind narrow ports with strict typed inputs and explicit
result unions:

- paired wallet/possession challenge issuer and atomic terminal-claim store;
- EOA/ERC-1271/ERC-6492 wallet signature verifier;
- P-256 device-possession verifier, ordinary-KeyPackage semantic verifier, signed-device-credential
  verifier/registry, revocation registry, and key-transparency writer;
- finalized-block/canonicality verifier and historical RPC reader;
- deployment/code/ABI manifest resolver;
- ordinary project and Revnet root-authority verifier;
- manifest-pinned gap-free authority-transition scanner with persisted finalized checkpoint;
- staff-delegation verifier and active/disabled authority-generation registry;
- canonical receipt/log decoder and terminal/hook authenticator;
- purchase, tier-item, and current-holder evidence normalizer;
- refund/dispute ledger reader/writer plus a public staged boundary which safely parses an untrusted
  lookup into typed head/record signature envelopes and verifier expectations, verifies each
  attestation, then finalizes the exact scope/case/predecessor-bound result;
- consent/block policy reader and entitlement evaluator;
- immutable audit sink and signed policy/capability issuer; and
- revocation/outbox coordinator for mandatory MLS membership intents.

Types and validators are not implementations of these ports. Until a port has a production adapter,
its only implementation MUST return a stable `*-not-configured`/`unavailable` result without writing
credentials, evidence, decisions marked eligible, or side effects. A thrown exception is converted
to `unavailable` at the boundary; it is never interpreted as false evidence or a cached success.

## 14. Third-party messaging connectors

A WhatsApp Business account, Telegram account, phone number, username, bot token, or provider badge
does not prove wallet control, project authority, purchase attribution, or device possession. A
future connector can interact with a native conversation only after the same authority service has
authorized a separately enrolled connector endpoint under an explicit project/account policy.

Notification-only connectors SHOULD send a generic deep link into the first-party client and receive
no chat plaintext. A full-text bridge is a named plaintext-capable conversation endpoint: the
gateway and provider can access relayed content, its device/role appears in the recipient snapshot,
native E2EE claims are removed for that thread, and connector-specific consent, retention,
jurisdiction, provider security, revocation, export, and incident gates apply. A bridge cannot
weaken wallet, device, project, finality, receipt, refund, or audit requirements.

## 15. Required adversarial evidence

Before any adapter can stop returning `unavailable`, the exact release artifact must pass at least
the following deterministic and fault-injected cases:

| Area | Required negative and race cases |
| --- | --- |
| Challenge | Every SIWE/EIP-712 field independently mutated; wrong origin/port/path/chain/purpose/device, resource order/URN, ID byte encoding, or possession-domain digest; expired/not-yet-valid; unknown and duplicate fields; cross-attempt wallet/possession substitution; 10,000 concurrent submissions yield exactly one terminal claimant; invalid proof, timeout, crash, and interrupted verification never reopen it. |
| EOA | Wrong account/digest, high-`s`, invalid recovery value, truncation, extension, malformed hex, cross-chain and cross-environment replay. |
| ERC-1271 | Wrong/short/oversized magic, Boolean return, revert, gas exhaustion, proxy upgrade, code disagreement, same call at different block, signer-set change. |
| ERC-6492 | Wrong suffix, nested/oversized wrapper, malicious factory, wrong deployment address, inner failure, already-deployed account, provider disagreement, and proof that no state was broadcast/persisted. |
| Device | Wallet/install-auth/MLS key substitution, possession replay, duplicate key/fingerprint, KeyPackage ref/hash/bytes/expiry substitution, last-resort or reused package, missing inclusion/consistency/witness proof, non-null initial project scope, registry crash at each transaction step, clone/rollback, revoked-device reenrollment, and transparency split view. |
| Project authority | Wrong projects contract, spoof owner, proxy/code mismatch, skipped or replayed transition range, `A -> B -> A` between observations, predecessor/principal/mode substitution, zero-root tombstone, orphaned active generation, stale delegation, ordinary/Revnet classification confusion, false `isRevnet`, and Revnet operator replacement. |
| Receipt | Failed transaction, wrong block/hash, missing log, duplicate log index, spoof emitter, unknown ABI, wrong terminal/project, proxy upgrade, provider receipt disagreement, and orphaned block. |
| Attribution | Router/project-payer intermediary, beneficiary/payer mismatch, gift, meta-transaction, misleading `tx.from`, multiple Pay events, identical values, and unknown accounting context. |
| Shop | Multiple hooks/mints/pays, nested/reentrant ordering, wrong project/hook/beneficiary, reserved/admin mint, mint-only evidence, zero-amount pay-credit purchase, tier multiset mismatch, trace unavailable. |
| Holder | Transfer at finality boundary, dust/airdrop, zero/minimum boundary, internal credit plus ERC-20 balance, wrapper/custody/bridge/loan claims, RPC disagreement. |
| Refund | No ledger entry, forged/stale-generation entry, relabeled purchase evidence, cross-item scope substitution, direct resolution without a legal predecessor, skipped/replayed/conflicting head, partial refund, split items, dispute/resolution reorder, chargeback ambiguity, cash-out and router refund misclassified as purchase refund. |
| Decision | Empty evidence/rights, stale policy, lease beyond evidence expiry, audit write failure, retry/idempotency conflict, cached eligible after revocation, policy-head withholding. |
| Reorg | Receipt disappearance and block-hash replacement after lease; all derived leases revoked, sends paused, removal intent emitted, no old evidence ID reused. |

Differential tests MUST compare independent ABI decoders, independent RPC providers, and locally
reconstructed fixtures. Testnet promotion requires real EOA, Safe-style ERC-1271, counterfactual
ERC-6492, direct pay, router/project-payer, pay-credit, tier mint, ownership transfer, Revnet operator,
refund-ledger, provider-failure, and forced-reorg scenarios.

## 16. Fail-closed rollout gates

The feature remains server-disabled until all applicable items are evidenced on the exact artifact:

1. **Schema freeze:** canonical encodings, challenge profiles, result unions, reason codes, rights,
   lifetimes, product attribution/refund choices, and migration behavior are reviewed and versioned.
2. **Deployment trust:** every chain has a signed address/ABI/code/proxy manifest, archive-capable
   finalized RPC quorum, historical-read conformance, and chain-specific finality/reorg runbook.
3. **Identity implementation:** audited EOA, ERC-1271, and ERC-6492 verification; atomic nonce store;
   device possession, revocation, key transparency, and recovery pass the identity matrix.
4. **Project authority implementation:** ordinary owner and Revnet classification/operator adapters,
   non-transitive delegation, generation rotation, and ownership-transfer rekey behavior pass.
5. **Entitlement implementation:** strict receipt/log and trace adapters, terminal/hook authentication,
   beneficiary semantics, zero-credit and multi-event ambiguity, holder reads, consent/block policy,
   and refund ledger pass adversarial and differential tests.
6. **Audit and revocation:** durable append-only audit, atomic capability outbox, signed independent
   policy head, proposal issuance, lease invalidation, and reorg/refund/transfer Remove flows pass
   crash and chaos tests.
7. **Privacy and operations:** PII canaries show no challenge, signature, shipping, message, receipt
   memo/metadata, or connector plaintext in prohibited stores; rate limits, abuse response, backup/
   restore, deletion, monitoring, incident response, and staffed ownership are operational.
8. **Staged proof:** private devnet, closed testnet, all supported testnets, mainnet shadow, and one
   chain canary meet the objective gates in [verification.md](./verification.md). Mainnet shadow can
   compute and compare decisions but cannot admit members.
9. **Independent review:** security, smart-contract integration, identity, privacy, and cryptographic
   reviews cover the deployed adapters and remediation diff with no open critical/high finding.
10. **Connector isolation:** native authority ships independently. WhatsApp, Telegram, or another
    bridge remains disabled until its separate connector gate passes; installing a connector never
    changes a native entitlement decision.

Automatic no-go conditions include one unauthorized admission, one false project authority result,
one false finalized purchase/item/holder result, one stale-generation delegation accepted, one
revoked device reactivated, one audit bypass, one failure to rekey after lost read authority, or one
prohibited plaintext/PII leak. There is no percentage-based exception and no fallback to indexer,
`latest`, confirmation count, cached eligibility, simulated identity, the LAN service, or plaintext
messaging.

## 17. Current handoff state

This specification and the strict TypeScript value objects are the starting boundary, not a security
claim. The next safe implementation step is to keep every port unavailable while building
deterministic fixtures and independent adapters in the rollout order above. Multi-device testing of
the current LAN app can continue only with fictional data and the existing unsafe-development
label. Connecting actual Juicebox testnet projects becomes appropriate at the closed-testnet gate;
connecting mainnet projects cannot grant membership until mainnet shadow evidence and the canary
gate have passed.
