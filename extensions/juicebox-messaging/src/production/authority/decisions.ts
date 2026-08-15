import type { ProjectStaffCapability } from "./delegations";
import { sha256AuthorityDigest } from "./digests";
import {
  AuthorityValidationError,
  expectExactRecord,
  instantMilliseconds,
  parseAuthorityId,
  parseCanonicalInstant,
  parseEthereumAddress,
  parseHash32,
  parseJuiceboxV6ProjectRef,
  parseLogIndex,
  parseUint256Decimal,
  sameJuiceboxV6ProjectRef,
  type AuthorityId,
  type CanonicalInstant,
  type EthereumAddress,
  type Hash32,
  type JuiceboxV6ProjectRef,
  type Uint256Decimal,
} from "./valueObjects";

const MAX_AUTHORITY_LEASE_LIFETIME_MS = 5 * 60 * 1000;

export type AuthorityAction =
  | "purchase-support:join"
  | "purchase-support:send"
  | "fulfillment:submit-address"
  | "fulfillment:request-address"
  | "fulfillment:read-address"
  | "fulfillment:acknowledge-address"
  | "fulfillment:update-status"
  | "fulfillment:set-tracking";

export interface AuthoritySubject {
  account: EthereumAddress;
  participantId: AuthorityId;
  installationId: AuthorityId;
  deviceCredentialId: AuthorityId;
}

export type AuthorityResource =
  | {
      kind: "purchase-support";
      project: JuiceboxV6ProjectRef;
      purchaseEvidenceId: AuthorityId;
      transactionHash: Hash32;
      payLogIndex: number;
    }
  | {
      kind: "tier-fulfillment";
      project: JuiceboxV6ProjectRef;
      purchaseEvidenceId: AuthorityId;
      tierId: Uint256Decimal;
      tokenId: Uint256Decimal;
    }
  | {
      kind: "project-staff";
      project: JuiceboxV6ProjectRef;
      requiredCapability: ProjectStaffCapability;
    };

export type AuthorityEvidenceKind =
  | "wallet-signature"
  | "device-possession"
  | "device-credential"
  | "finalized-receipt"
  | "purchase-beneficiary"
  | "tier-purchase"
  | "project-root"
  | "authority-generation"
  | "staff-delegation"
  | "refund-ledger";

export interface AuthorityEvidenceReference {
  kind: "authority-evidence-reference.v1";
  evidenceId: AuthorityId;
  evidenceKind: AuthorityEvidenceKind;
  digest: Hash32;
  policyId: AuthorityId;
  policyRevision: Uint256Decimal;
  policyHash: Hash32;
  resourceDigest: Hash32 | null;
  refundDecision:
    | null
    | {
        kind: "refund-eligibility-decision.v1";
        headId: AuthorityId;
        headSequence: Uint256Decimal;
        headDigest: Hash32;
        currentStatus:
          | "no-applicable-entry"
          | "purchase-upheld"
          | "refund-recorded"
          | "dispute-open"
          | "refund-resolved";
        eligibilityEffect: "clear" | "block";
        evaluatedAt: CanonicalInstant;
        freshUntil: CanonicalInstant;
      };
  project: JuiceboxV6ProjectRef | null;
  subjectAccount: EthereumAddress | null;
  generationId: AuthorityId | null;
  blockNumber: Uint256Decimal | null;
  blockHash: Hash32 | null;
  expiresAt: CanonicalInstant | null;
}

export interface AuthorityGateRequest {
  requestId: AuthorityId;
  evaluatedAt: CanonicalInstant;
  policyId: AuthorityId;
  policyRevision: Uint256Decimal;
  policyHash: Hash32;
  subject: AuthoritySubject;
  resource: AuthorityResource;
  action: AuthorityAction;
  inputDigest: Hash32;
  resourceDigest: Hash32;
}

export interface AuthorityDecisionValidationContext {
  request: AuthorityGateRequest;
  /** Required for every persisted-before-release acknowledgement. */
  auditRecord: unknown | null;
  expectedAuditSignerKeyId: AuthorityId;
  expectedPriorAuditHeadDigest: Hash32;
}

export interface PersistedDecisionAudit {
  status: "persisted-before-release";
  auditRecordId: AuthorityId;
  auditRecordDigest: Hash32;
  decisionId: AuthorityId;
  decisionDigest: Hash32;
  idempotencyKey: Hash32;
  auditSignerKeyId: AuthorityId;
  auditHeadDigest: Hash32;
}

interface DecisionBase {
  kind: "authority-decision.v1";
  decisionId: AuthorityId;
  requestId: AuthorityId;
  evaluatedAt: CanonicalInstant;
  policyId: AuthorityId;
  policyVersion: "1";
  policyRevision: Uint256Decimal;
  policyHash: Hash32;
  subject: AuthoritySubject;
  resource: AuthorityResource;
  action: AuthorityAction;
  inputDigest: Hash32;
  resourceDigest: Hash32;
  decisionDigest: Hash32;
  evidence: readonly AuthorityEvidenceReference[];
}

export type AuthorityDecision =
  | (DecisionBase & {
      status: "eligible";
      reasonCode: "all-required-evidence-current";
      lease: {
        leaseId: AuthorityId;
        issuedAt: CanonicalInstant;
        expiresAt: CanonicalInstant;
        authorityGenerationId: AuthorityId | null;
      };
      audit: PersistedDecisionAudit;
    })
  | (DecisionBase & {
      status: "ineligible";
      reasonCode:
        | "signature-invalid"
        | "device-invalid-or-revoked"
        | "purchase-beneficiary-mismatch"
        | "item-not-purchased"
        | "project-authority-invalid"
        | "staff-delegation-invalid-or-stale"
        | "capability-not-delegated"
        | "refund-or-dispute-blocks-access"
        | "canonical-evidence-orphaned";
      audit: PersistedDecisionAudit;
    })
  | (DecisionBase & {
      status: "pending-finality";
      reasonCode: "receipt-above-finalized-head";
      candidateBlockNumber: Uint256Decimal;
      candidateBlockHash: Hash32;
      retryAfter: CanonicalInstant;
      audit: PersistedDecisionAudit;
    })
  | (DecisionBase & {
      status: "unavailable";
      reasonCode:
        | "authority-service-not-configured"
        | "required-verifier-unavailable"
        | "rpc-unavailable"
        | "audit-store-unavailable"
        | "malformed-verifier-response";
      audit:
        | PersistedDecisionAudit
        | {
            status: "not-persisted-audit-unavailable";
            reasonCode: "audit-store-unavailable";
          };
    });

export interface AuthorityAuditRecord {
  kind: "authority-audit-record.v1";
  auditRecordId: AuthorityId;
  auditRecordDigest: Hash32;
  decisionId: AuthorityId;
  idempotencyKey: Hash32;
  auditSignerKeyId: AuthorityId;
  priorAuditHeadDigest: Hash32;
  auditHeadDigest: Hash32;
  recordedAt: CanonicalInstant;
  policyId: AuthorityId;
  policyVersion: "1";
  policyRevision: Uint256Decimal;
  policyHash: Hash32;
  action: AuthorityAction;
  subject: AuthoritySubject;
  project: JuiceboxV6ProjectRef;
  inputDigest: Hash32;
  resourceDigest: Hash32;
  outcome: AuthorityDecision["status"];
  reasonCode: AuthorityDecision["reasonCode"];
  evidence: readonly AuthorityEvidenceReference[];
  decisionDigest: Hash32;
  rawSensitiveData: "not-recorded";
}

export function computeAuthorityResourceDigest(
  resource: AuthorityResource,
): Hash32 {
  return sha256AuthorityDigest({
    kind: "authority-resource-digest.v1",
    resource,
  });
}

export function computeAuthorityGateInputDigest(
  request: Omit<AuthorityGateRequest, "inputDigest">,
): Hash32 {
  return sha256AuthorityDigest({
    kind: "authority-gate-input-digest.v1",
    request,
  });
}

export function computeAuthorityDecisionDigest(
  decision: AuthorityDecision,
): Hash32 {
  const committed: Record<string, unknown> = { ...decision };
  delete committed.audit;
  delete committed.decisionDigest;
  return sha256AuthorityDigest({
    kind: "authority-decision-digest.v1",
    decision: committed,
  });
}

export function computeAuthorityAuditRecordDigest(
  auditRecord: Omit<
    AuthorityAuditRecord,
    "auditRecordDigest" | "auditHeadDigest"
  >,
): Hash32 {
  return sha256AuthorityDigest({
    kind: "authority-audit-record-digest.v1",
    auditRecord,
  });
}

export function computeAuthorityAuditHeadDigest(input: {
  priorAuditHeadDigest: Hash32;
  auditRecordDigest: Hash32;
  auditSignerKeyId: AuthorityId;
}): Hash32 {
  return sha256AuthorityDigest({
    kind: "authority-audit-head-digest.v1",
    ...input,
  });
}

export function computeAuthorityAuditIdempotencyKey(
  decision: Pick<AuthorityDecision, "decisionId" | "inputDigest">,
): Hash32 {
  return sha256AuthorityDigest({
    kind: "authority-audit-idempotency-key.v1",
    decisionId: decision.decisionId,
    inputDigest: decision.inputDigest,
  });
}

export function parseAuthorityGateRequest(value: unknown): AuthorityGateRequest {
  const record = expectExactRecord(
    value,
    [
      "requestId",
      "evaluatedAt",
      "policyId",
      "policyRevision",
      "policyHash",
      "subject",
      "resource",
      "action",
      "inputDigest",
      "resourceDigest",
    ],
    "authority gate request",
  );
  const resource = parseResource(record.resource);
  const action = parseAction(record.action);
  assertActionMatchesResource(action, resource);
  const parsedWithoutInput = {
    requestId: parseAuthorityId(record.requestId, "requestId"),
    evaluatedAt: parseCanonicalInstant(record.evaluatedAt, "evaluatedAt"),
    policyId: parseAuthorityId(record.policyId, "policyId"),
    policyRevision: parseUint256Decimal(record.policyRevision, "policyRevision"),
    policyHash: parseHash32(record.policyHash, "policyHash"),
    subject: parseSubject(record.subject),
    resource,
    action,
    resourceDigest: parseHash32(record.resourceDigest, "resourceDigest"),
  };
  const expectedResourceDigest = computeAuthorityResourceDigest(resource);
  if (parsedWithoutInput.resourceDigest !== expectedResourceDigest) {
    throw invalid("Authority gate resource digest is not canonical.");
  }
  const inputDigest = parseHash32(record.inputDigest, "inputDigest");
  if (
    inputDigest !==
    computeAuthorityGateInputDigest({
      ...parsedWithoutInput,
    })
  ) {
    throw invalid("Authority gate input digest is not canonical.");
  }
  return { ...parsedWithoutInput, inputDigest };
}

export function parseAuthorityDecision(
  value: unknown,
  context: AuthorityDecisionValidationContext,
): AuthorityDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("Authority decision must be an object.");
  }
  const expectedRequest = parseAuthorityGateRequest(context.request);
  const record = value as Record<string, unknown>;
  const status = record.status;
  const decision =
    status === "eligible"
      ? parseEligibleDecision(value)
      : status === "ineligible"
        ? parseIneligibleDecision(value)
        : status === "pending-finality"
          ? parsePendingDecision(value)
          : status === "unavailable"
            ? parseUnavailableDecision(value)
            : null;
  if (decision === null) {
    throw invalid("Authority decision status is unsupported.");
  }
  assertDecisionMatchesRequest(decision, expectedRequest);
  if (decision.decisionDigest !== computeAuthorityDecisionDigest(decision)) {
    throw invalid("Authority decision digest is not canonical.");
  }
  assertDecisionAudit(decision, context);
  return decision;
}

export function parseAuthorityAuditRecord(
  value: unknown,
  expectedDecision: AuthorityDecision,
  expected: {
    auditSignerKeyId: AuthorityId;
    priorAuditHeadDigest: Hash32;
  },
): AuthorityAuditRecord {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "auditRecordId",
      "auditRecordDigest",
      "decisionId",
      "idempotencyKey",
      "auditSignerKeyId",
      "priorAuditHeadDigest",
      "auditHeadDigest",
      "recordedAt",
      "policyId",
      "policyVersion",
      "policyRevision",
      "policyHash",
      "action",
      "subject",
      "project",
      "inputDigest",
      "resourceDigest",
      "outcome",
      "reasonCode",
      "evidence",
      "decisionDigest",
      "rawSensitiveData",
    ],
    "authority audit record",
  );
  if (
    record.kind !== "authority-audit-record.v1" ||
    record.policyVersion !== "1" ||
    record.rawSensitiveData !== "not-recorded"
  ) {
    throw invalid("Authority audit record weakens its fixed privacy or policy fields.");
  }
  if (
    record.outcome !== "eligible" &&
    record.outcome !== "ineligible" &&
    record.outcome !== "pending-finality" &&
    record.outcome !== "unavailable"
  ) {
    throw invalid("Authority audit outcome is unsupported.");
  }
  const reasonCode =
    record.outcome === "eligible"
      ? parseReasonForStatus("eligible", record.reasonCode)
      : record.outcome === "ineligible"
        ? parseReasonForStatus("ineligible", record.reasonCode)
        : record.outcome === "pending-finality"
          ? parseReasonForStatus("pending-finality", record.reasonCode)
          : parseReasonForStatus("unavailable", record.reasonCode);
  const parsed = {
    kind: "authority-audit-record.v1",
    auditRecordId: parseAuthorityId(record.auditRecordId, "auditRecordId"),
    auditRecordDigest: parseHash32(
      record.auditRecordDigest,
      "auditRecordDigest",
    ),
    decisionId: parseAuthorityId(record.decisionId, "decisionId"),
    idempotencyKey: parseHash32(record.idempotencyKey, "idempotencyKey"),
    auditSignerKeyId: parseAuthorityId(
      record.auditSignerKeyId,
      "auditSignerKeyId",
    ),
    priorAuditHeadDigest: parseHash32(
      record.priorAuditHeadDigest,
      "priorAuditHeadDigest",
    ),
    auditHeadDigest: parseHash32(record.auditHeadDigest, "auditHeadDigest"),
    recordedAt: parseCanonicalInstant(record.recordedAt, "recordedAt"),
    policyId: parseAuthorityId(record.policyId, "policyId"),
    policyVersion: "1",
    policyRevision: parseUint256Decimal(record.policyRevision, "policyRevision"),
    policyHash: parseHash32(record.policyHash, "policyHash"),
    action: parseAction(record.action),
    subject: parseSubject(record.subject),
    project: parseJuiceboxV6ProjectRef(record.project),
    inputDigest: parseHash32(record.inputDigest, "inputDigest"),
    resourceDigest: parseHash32(record.resourceDigest, "resourceDigest"),
    outcome: record.outcome,
    reasonCode,
    evidence: parseEvidence(record.evidence),
    decisionDigest: parseHash32(record.decisionDigest, "decisionDigest"),
    rawSensitiveData: "not-recorded",
  } satisfies AuthorityAuditRecord;
  assertAuditMatchesDecision(parsed, expectedDecision);
  if (
    parsed.auditSignerKeyId !== expected.auditSignerKeyId ||
    parsed.priorAuditHeadDigest !== expected.priorAuditHeadDigest
  ) {
    throw invalid("Authority audit record does not extend the trusted audit head.");
  }
  const {
    auditRecordDigest,
    auditHeadDigest,
    ...unsigned
  } = parsed;
  if (auditRecordDigest !== computeAuthorityAuditRecordDigest(unsigned)) {
    throw invalid("Authority audit record digest is not canonical.");
  }
  if (
    auditHeadDigest !==
    computeAuthorityAuditHeadDigest({
      priorAuditHeadDigest: parsed.priorAuditHeadDigest,
      auditRecordDigest,
      auditSignerKeyId: parsed.auditSignerKeyId,
    })
  ) {
    throw invalid("Authority audit head digest is not canonical.");
  }
  return parsed;
}

function parseEligibleDecision(value: unknown): Extract<AuthorityDecision, { status: "eligible" }> {
  const record = expectExactRecord(
    value,
    [...baseKeys, "status", "reasonCode", "lease", "audit"],
    "eligible authority decision",
  );
  if (record.reasonCode !== "all-required-evidence-current") {
    throw invalid("Eligible decision reason is unsupported.");
  }
  const base = parseBase(record);
  if (base.evidence.length === 0) {
    throw invalid("Eligible decisions require resolvable evidence.");
  }
  assertEligibleEvidence(base);
  const leaseRecord = expectExactRecord(
    record.lease,
    ["leaseId", "issuedAt", "expiresAt", "authorityGenerationId"],
    "authority lease",
  );
  const issuedAt = parseCanonicalInstant(leaseRecord.issuedAt, "lease issuedAt");
  const expiresAt = parseCanonicalInstant(leaseRecord.expiresAt, "lease expiresAt");
  if (
    issuedAt !== base.evaluatedAt ||
    instantMilliseconds(expiresAt) <= instantMilliseconds(issuedAt) ||
    instantMilliseconds(expiresAt) - instantMilliseconds(issuedAt) >
      MAX_AUTHORITY_LEASE_LIFETIME_MS
  ) {
    throw invalid("Authority lease time window is invalid.");
  }
  const evidenceExpiry = base.evidence
    .map((item) => item.expiresAt)
    .filter((item): item is CanonicalInstant => item !== null)
    .reduce<number | null>(
      (minimum, item) =>
        minimum === null
          ? instantMilliseconds(item)
          : Math.min(minimum, instantMilliseconds(item)),
      null,
    );
  if (evidenceExpiry !== null && instantMilliseconds(expiresAt) > evidenceExpiry) {
    throw invalid("Authority lease outlives required evidence.");
  }
  const authorityGenerationId =
    leaseRecord.authorityGenerationId === null
      ? null
      : parseAuthorityId(
          leaseRecord.authorityGenerationId,
          "authorityGenerationId",
        );
  if (
    (base.resource.kind === "project-staff") !==
    (authorityGenerationId !== null)
  ) {
    throw invalid("Only project-staff leases bind an authority generation.");
  }
  if (
    authorityGenerationId !== null &&
    base.evidence.some(
      (item) =>
        item.generationId !== null &&
        item.generationId !== authorityGenerationId,
    )
  ) {
    throw invalid("Eligible evidence is bound to a different authority generation.");
  }
  if (
    authorityGenerationId !== null &&
    base.evidence
      .filter(
        (item) =>
          item.evidenceKind === "authority-generation" ||
          item.evidenceKind === "staff-delegation",
      )
      .some((item) => item.generationId !== authorityGenerationId)
  ) {
    throw invalid("Staff evidence does not bind the exact active authority generation.");
  }
  return {
    ...base,
    status: "eligible",
    reasonCode: "all-required-evidence-current",
    lease: {
      leaseId: parseAuthorityId(leaseRecord.leaseId, "leaseId"),
      issuedAt,
      expiresAt,
      authorityGenerationId,
    },
    audit: parsePersistedAudit(record.audit, base),
  };
}

function parseIneligibleDecision(
  value: unknown,
): Extract<AuthorityDecision, { status: "ineligible" }> {
  const record = expectExactRecord(
    value,
    [...baseKeys, "status", "reasonCode", "audit"],
    "ineligible authority decision",
  );
  const base = parseBase(record);
  return {
    ...base,
    status: "ineligible",
    reasonCode: parseReasonForStatus("ineligible", record.reasonCode),
    audit: parsePersistedAudit(record.audit, base),
  };
}

function parsePendingDecision(
  value: unknown,
): Extract<AuthorityDecision, { status: "pending-finality" }> {
  const record = expectExactRecord(
    value,
    [
      ...baseKeys,
      "status",
      "reasonCode",
      "candidateBlockNumber",
      "candidateBlockHash",
      "retryAfter",
      "audit",
    ],
    "pending authority decision",
  );
  if (record.reasonCode !== "receipt-above-finalized-head") {
    throw invalid("Pending-finality decision reason is unsupported.");
  }
  const base = parseBase(record);
  const retryAfter = parseCanonicalInstant(record.retryAfter, "retryAfter");
  if (instantMilliseconds(retryAfter) <= instantMilliseconds(base.evaluatedAt)) {
    throw invalid("Pending-finality retry must be in the future.");
  }
  return {
    ...base,
    status: "pending-finality",
    reasonCode: "receipt-above-finalized-head",
    candidateBlockNumber: parseUint256Decimal(
      record.candidateBlockNumber,
      "candidateBlockNumber",
    ),
    candidateBlockHash: parseHash32(
      record.candidateBlockHash,
      "candidateBlockHash",
    ),
    retryAfter,
    audit: parsePersistedAudit(record.audit, base),
  };
}

function parseUnavailableDecision(
  value: unknown,
): Extract<AuthorityDecision, { status: "unavailable" }> {
  const record = expectExactRecord(
    value,
    [...baseKeys, "status", "reasonCode", "audit"],
    "unavailable authority decision",
  );
  const reasonCode = parseReasonForStatus("unavailable", record.reasonCode);
  const base = parseBase(record);
  const audit =
    reasonCode === "audit-store-unavailable"
      ? parseUnavailableAudit(record.audit)
      : parsePersistedAudit(record.audit, base);
  return {
    ...base,
    status: "unavailable",
    reasonCode,
    audit,
  };
}

const baseKeys = [
  "kind",
  "decisionId",
  "requestId",
  "evaluatedAt",
  "policyId",
  "policyVersion",
  "policyRevision",
  "policyHash",
  "subject",
  "resource",
  "action",
  "inputDigest",
  "resourceDigest",
  "decisionDigest",
  "evidence",
] as const;

function parseBase(record: Record<string, unknown>): DecisionBase {
  if (record.kind !== "authority-decision.v1" || record.policyVersion !== "1") {
    throw invalid("Authority decision kind or policy version is unsupported.");
  }
  const resource = parseResource(record.resource);
  const action = parseAction(record.action);
  assertActionMatchesResource(action, resource);
  const base: DecisionBase = {
    kind: "authority-decision.v1",
    decisionId: parseAuthorityId(record.decisionId, "decisionId"),
    requestId: parseAuthorityId(record.requestId, "requestId"),
    evaluatedAt: parseCanonicalInstant(record.evaluatedAt, "evaluatedAt"),
    policyId: parseAuthorityId(record.policyId, "policyId"),
    policyVersion: "1",
    policyRevision: parseUint256Decimal(record.policyRevision, "policyRevision"),
    policyHash: parseHash32(record.policyHash, "policyHash"),
    subject: parseSubject(record.subject),
    resource,
    action,
    inputDigest: parseHash32(record.inputDigest, "inputDigest"),
    resourceDigest: parseHash32(record.resourceDigest, "resourceDigest"),
    decisionDigest: parseHash32(record.decisionDigest, "decisionDigest"),
    evidence: parseEvidence(record.evidence),
  };
  assertEvidenceCoherence(base);
  return base;
}

function parseSubject(value: unknown): AuthoritySubject {
  const record = expectExactRecord(
    value,
    ["account", "participantId", "installationId", "deviceCredentialId"],
    "authority subject",
  );
  return {
    account: parseEthereumAddress(record.account, "subject account"),
    participantId: parseAuthorityId(record.participantId, "participantId"),
    installationId: parseAuthorityId(record.installationId, "installationId"),
    deviceCredentialId: parseAuthorityId(
      record.deviceCredentialId,
      "deviceCredentialId",
    ),
  };
}

function parseResource(value: unknown): AuthorityResource {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("Authority resource must be an object.");
  }
  const kind = (value as Record<string, unknown>).kind;
  if (kind === "purchase-support") {
    const record = expectExactRecord(
      value,
      ["kind", "project", "purchaseEvidenceId", "transactionHash", "payLogIndex"],
      "purchase support resource",
    );
    return {
      kind,
      project: parseJuiceboxV6ProjectRef(record.project),
      purchaseEvidenceId: parseAuthorityId(
        record.purchaseEvidenceId,
        "purchaseEvidenceId",
      ),
      transactionHash: parseHash32(record.transactionHash, "transactionHash"),
      payLogIndex: parseLogIndex(record.payLogIndex, "payLogIndex"),
    };
  }
  if (kind === "tier-fulfillment") {
    const record = expectExactRecord(
      value,
      ["kind", "project", "purchaseEvidenceId", "tierId", "tokenId"],
      "tier fulfillment resource",
    );
    return {
      kind,
      project: parseJuiceboxV6ProjectRef(record.project),
      purchaseEvidenceId: parseAuthorityId(
        record.purchaseEvidenceId,
        "purchaseEvidenceId",
      ),
      tierId: parseUint256Decimal(record.tierId, "tierId"),
      tokenId: parseUint256Decimal(record.tokenId, "tokenId"),
    };
  }
  if (kind === "project-staff") {
    const record = expectExactRecord(
      value,
      ["kind", "project", "requiredCapability"],
      "project staff resource",
    );
    return {
      kind,
      project: parseJuiceboxV6ProjectRef(record.project),
      requiredCapability: parseStaffCapability(record.requiredCapability),
    };
  }
  throw invalid("Authority resource kind is unsupported.");
}

function parseEvidence(value: unknown): readonly AuthorityEvidenceReference[] {
  if (!Array.isArray(value) || value.length > 32) {
    throw invalid("Authority evidence references must be a bounded list.");
  }
  const result = value.map((item) => {
    const record = expectExactRecord(
      item,
      [
        "kind",
        "evidenceId",
        "evidenceKind",
        "digest",
        "policyId",
        "policyRevision",
        "policyHash",
        "resourceDigest",
        "refundDecision",
        "project",
        "subjectAccount",
        "generationId",
        "blockNumber",
        "blockHash",
        "expiresAt",
      ],
      "authority evidence reference",
    );
    if (record.kind !== "authority-evidence-reference.v1") {
      throw invalid("Authority evidence reference kind is unsupported.");
    }
    const blockNumber =
      record.blockNumber === null
        ? null
        : parseUint256Decimal(record.blockNumber, "evidence blockNumber");
    const blockHash =
      record.blockHash === null
        ? null
        : parseHash32(record.blockHash, "evidence blockHash");
    if ((blockNumber === null) !== (blockHash === null)) {
      throw invalid("Evidence block number and hash must be present together.");
    }
    return {
      kind: "authority-evidence-reference.v1" as const,
      evidenceId: parseAuthorityId(record.evidenceId, "evidenceId"),
      evidenceKind: parseEvidenceKind(record.evidenceKind),
      digest: parseHash32(record.digest, "evidence digest"),
      policyId: parseAuthorityId(record.policyId, "evidence policyId"),
      policyRevision: parseUint256Decimal(
        record.policyRevision,
        "evidence policyRevision",
      ),
      policyHash: parseHash32(record.policyHash, "evidence policyHash"),
      resourceDigest:
        record.resourceDigest === null
          ? null
          : parseHash32(record.resourceDigest, "evidence resource digest"),
      refundDecision: parseRefundDecision(record.refundDecision),
      project:
        record.project === null ? null : parseJuiceboxV6ProjectRef(record.project),
      subjectAccount:
        record.subjectAccount === null
          ? null
          : parseEthereumAddress(record.subjectAccount, "evidence subject account"),
      generationId:
        record.generationId === null
          ? null
          : parseAuthorityId(record.generationId, "evidence generationId"),
      blockNumber,
      blockHash,
      expiresAt:
        record.expiresAt === null
          ? null
          : parseCanonicalInstant(record.expiresAt, "evidence expiresAt"),
    };
  });
  const ids = result.map((item) => item.evidenceId);
  const kinds = result.map((item) => item.evidenceKind);
  if (
    new Set(ids).size !== ids.length ||
    [...ids].sort().some((item, index) => item !== ids[index])
  ) {
    throw invalid("Evidence references must be unique and canonically sorted by ID.");
  }
  if (new Set(kinds).size !== kinds.length) {
    throw invalid("Version 1 decisions allow exactly one reference of each evidence kind.");
  }
  return result;
}

function assertEvidenceCoherence(base: DecisionBase): void {
  const project = base.resource.project;
  for (const item of base.evidence) {
    if (
      item.policyId !== base.policyId ||
      item.policyRevision !== base.policyRevision ||
      item.policyHash !== base.policyHash
    ) {
      throw invalid("Eligible evidence was evaluated under another policy revision.");
    }
    if (
      item.project !== null &&
      !sameJuiceboxV6ProjectRef(item.project, project)
    ) {
      throw invalid("Eligible evidence is scoped to a different project.");
    }
    const projectBound =
      item.evidenceKind === "finalized-receipt" ||
      item.evidenceKind === "purchase-beneficiary" ||
      item.evidenceKind === "tier-purchase" ||
      item.evidenceKind === "project-root" ||
      item.evidenceKind === "authority-generation" ||
      item.evidenceKind === "staff-delegation" ||
      item.evidenceKind === "refund-ledger";
    if (projectBound && item.project === null) {
      throw invalid("Eligible project evidence must name its exact project.");
    }
    const resourceBound = projectBound && item.evidenceKind !== "project-root";
    if (resourceBound && item.resourceDigest !== base.resourceDigest) {
      throw invalid("Eligible evidence is bound to another resource.");
    }
    if (
      item.evidenceKind === "finalized-receipt" &&
      (item.blockNumber === null || item.blockHash === null)
    ) {
      throw invalid("Finalized receipt evidence requires an exact block anchor.");
    }
    if (
      (item.evidenceKind === "refund-ledger") !==
      (item.refundDecision !== null)
    ) {
      throw invalid("Only refund-ledger evidence may contain a refund decision.");
    }
    if (
      item.refundDecision !== null &&
      (item.evidenceId !== item.refundDecision.headId ||
        item.digest !== item.refundDecision.headDigest ||
        item.expiresAt === null ||
        item.expiresAt !== item.refundDecision.freshUntil ||
        instantMilliseconds(item.refundDecision.evaluatedAt) >
          instantMilliseconds(base.evaluatedAt) ||
        instantMilliseconds(item.refundDecision.freshUntil) <=
          instantMilliseconds(item.refundDecision.evaluatedAt))
    ) {
      throw invalid("Refund evidence does not bind its exact fresh ledger head.");
    }
  }
}

function assertEligibleEvidence(base: DecisionBase): void {
  for (const item of base.evidence) {
    if (
      item.expiresAt !== null &&
      instantMilliseconds(item.expiresAt) <= instantMilliseconds(base.evaluatedAt)
    ) {
      throw invalid("Eligible evidence is already expired.");
    }
    if (
      (item.evidenceKind === "device-credential" ||
        item.evidenceKind === "purchase-beneficiary" ||
        item.evidenceKind === "tier-purchase" ||
        item.evidenceKind === "staff-delegation") &&
      item.subjectAccount !== base.subject.account
    ) {
      throw invalid("Eligible subject-bound evidence belongs to another account.");
    }
  }
  const deviceEvidence = base.evidence.find(
    (item) => item.evidenceKind === "device-credential",
  );
  if (
    !deviceEvidence ||
    deviceEvidence.evidenceId !== base.subject.deviceCredentialId ||
    deviceEvidence.expiresAt === null
  ) {
    throw invalid("Eligible decision does not bind the exact active device credential.");
  }
  if (base.resource.kind !== "project-staff") {
    const purchaseKind =
      base.resource.kind === "purchase-support"
        ? "purchase-beneficiary"
        : "tier-purchase";
    const purchaseEvidence = base.evidence.find(
      (item) => item.evidenceKind === purchaseKind,
    );
    if (purchaseEvidence?.evidenceId !== base.resource.purchaseEvidenceId) {
      throw invalid("Eligible decision uses evidence for another purchase.");
    }
    const refundEvidence = base.evidence.find(
      (item) => item.evidenceKind === "refund-ledger",
    );
    if (
      !refundEvidence ||
      refundEvidence.expiresAt === null ||
      refundEvidence.refundDecision?.eligibilityEffect !== "clear" ||
      (refundEvidence.refundDecision.currentStatus !== "no-applicable-entry" &&
        refundEvidence.refundDecision.currentStatus !== "purchase-upheld") ||
      instantMilliseconds(refundEvidence.refundDecision.evaluatedAt) >
        instantMilliseconds(base.evaluatedAt)
    ) {
      throw invalid("Eligible purchase decision requires a fresh refund-ledger head.");
    }
  }
  const kinds = new Set(base.evidence.map((item) => item.evidenceKind));
  const required =
    base.resource.kind === "purchase-support"
      ? ([
          "device-credential",
          "finalized-receipt",
          "purchase-beneficiary",
          "refund-ledger",
        ] as const)
      : base.resource.kind === "tier-fulfillment"
        ? ([
            "device-credential",
            "finalized-receipt",
            "tier-purchase",
            "refund-ledger",
          ] as const)
        : ([
            "device-credential",
            "project-root",
            "authority-generation",
            "staff-delegation",
          ] as const);
  if (required.some((kind) => !kinds.has(kind))) {
    throw invalid("Eligible decision is missing required positive evidence.");
  }
}

function parsePersistedAudit(
  value: unknown,
  decision: DecisionBase,
): PersistedDecisionAudit {
  const record = expectExactRecord(
    value,
    [
      "status",
      "auditRecordId",
      "auditRecordDigest",
      "decisionId",
      "decisionDigest",
      "idempotencyKey",
      "auditSignerKeyId",
      "auditHeadDigest",
    ],
    "persisted authority audit",
  );
  if (record.status !== "persisted-before-release") {
    throw invalid("Authority decision was not audited before release.");
  }
  const decisionId = parseAuthorityId(record.decisionId, "audited decisionId");
  const decisionDigest = parseHash32(
    record.decisionDigest,
    "audited decisionDigest",
  );
  if (
    decisionId !== decision.decisionId ||
    decisionDigest !== decision.decisionDigest
  ) {
    throw invalid("Persisted audit acknowledgement belongs to another decision.");
  }
  return {
    status: "persisted-before-release",
    auditRecordId: parseAuthorityId(record.auditRecordId, "auditRecordId"),
    auditRecordDigest: parseHash32(record.auditRecordDigest, "auditRecordDigest"),
    decisionId,
    decisionDigest,
    idempotencyKey: parseHash32(record.idempotencyKey, "audit idempotency key"),
    auditSignerKeyId: parseAuthorityId(
      record.auditSignerKeyId,
      "audit signer key ID",
    ),
    auditHeadDigest: parseHash32(record.auditHeadDigest, "audit head digest"),
  };
}

function assertDecisionMatchesRequest(
  decision: AuthorityDecision,
  request: AuthorityGateRequest,
): void {
  if (
    decision.requestId !== request.requestId ||
    decision.evaluatedAt !== request.evaluatedAt ||
    decision.policyId !== request.policyId ||
    decision.policyRevision !== request.policyRevision ||
    decision.policyHash !== request.policyHash ||
    decision.action !== request.action ||
    decision.inputDigest !== request.inputDigest ||
    decision.resourceDigest !== request.resourceDigest ||
    sha256AuthorityDigest(decision.subject) !==
      sha256AuthorityDigest(request.subject) ||
    sha256AuthorityDigest(decision.resource) !==
      sha256AuthorityDigest(request.resource)
  ) {
    throw invalid("Authority decision belongs to another gate request.");
  }
}

function assertDecisionAudit(
  decision: AuthorityDecision,
  context: AuthorityDecisionValidationContext,
): void {
  const auditRecordInput = context.auditRecord;
  if (decision.audit.status === "not-persisted-audit-unavailable") {
    if (auditRecordInput !== null) {
      throw invalid("An audit-unavailable decision must not claim a persisted record.");
    }
    return;
  }
  if (auditRecordInput === null) {
    throw invalid("A persisted-before-release decision requires its audit record.");
  }
  const auditRecord = parseAuthorityAuditRecord(auditRecordInput, decision, {
    auditSignerKeyId: context.expectedAuditSignerKeyId,
    priorAuditHeadDigest: context.expectedPriorAuditHeadDigest,
  });
  if (
    decision.audit.auditRecordId !== auditRecord.auditRecordId ||
    decision.audit.auditRecordDigest !== auditRecord.auditRecordDigest ||
    decision.audit.idempotencyKey !== auditRecord.idempotencyKey ||
    decision.audit.auditSignerKeyId !== auditRecord.auditSignerKeyId ||
    decision.audit.auditHeadDigest !== auditRecord.auditHeadDigest
  ) {
    throw invalid("Persisted audit acknowledgement does not match its signed record.");
  }
}

function assertAuditMatchesDecision(
  audit: AuthorityAuditRecord,
  decision: AuthorityDecision,
): void {
  const expectedIdempotencyKey = computeAuthorityAuditIdempotencyKey(decision);
  if (
    audit.decisionId !== decision.decisionId ||
    audit.idempotencyKey !== expectedIdempotencyKey ||
    audit.policyId !== decision.policyId ||
    audit.policyRevision !== decision.policyRevision ||
    audit.policyHash !== decision.policyHash ||
    audit.action !== decision.action ||
    audit.inputDigest !== decision.inputDigest ||
    audit.resourceDigest !== decision.resourceDigest ||
    audit.outcome !== decision.status ||
    audit.reasonCode !== decision.reasonCode ||
    audit.decisionDigest !== decision.decisionDigest ||
    !sameJuiceboxV6ProjectRef(audit.project, decision.resource.project) ||
    sha256AuthorityDigest(audit.subject) !==
      sha256AuthorityDigest(decision.subject) ||
    sha256AuthorityDigest(audit.evidence) !==
      sha256AuthorityDigest(decision.evidence) ||
    instantMilliseconds(audit.recordedAt) <
      instantMilliseconds(decision.evaluatedAt)
  ) {
    throw invalid("Authority audit record does not commit to the exact decision.");
  }
}

function parseUnavailableAudit(value: unknown): {
  status: "not-persisted-audit-unavailable";
  reasonCode: "audit-store-unavailable";
} {
  const record = expectExactRecord(
    value,
    ["status", "reasonCode"],
    "unavailable authority audit",
  );
  if (
    record.status !== "not-persisted-audit-unavailable" ||
    record.reasonCode !== "audit-store-unavailable"
  ) {
    throw invalid("Audit failure must fail closed as unavailable.");
  }
  return {
    status: "not-persisted-audit-unavailable",
    reasonCode: "audit-store-unavailable",
  };
}

function parseAction(value: unknown): AuthorityAction {
  if (
    value !== "purchase-support:join" &&
    value !== "purchase-support:send" &&
    value !== "fulfillment:submit-address" &&
    value !== "fulfillment:request-address" &&
    value !== "fulfillment:read-address" &&
    value !== "fulfillment:acknowledge-address" &&
    value !== "fulfillment:update-status" &&
    value !== "fulfillment:set-tracking"
  ) {
    throw invalid("Authority action is unsupported.");
  }
  return value;
}

function parseStaffCapability(value: unknown): ProjectStaffCapability {
  if (
    value !== "support:read-messages" &&
    value !== "support:send-messages" &&
    value !== "fulfillment:request-address" &&
    value !== "fulfillment:read-address" &&
    value !== "fulfillment:acknowledge-address" &&
    value !== "fulfillment:update-status" &&
    value !== "fulfillment:set-tracking"
  ) {
    throw invalid("Required staff capability is unsupported.");
  }
  return value;
}

function parseRefundDecision(
  value: unknown,
): AuthorityEvidenceReference["refundDecision"] {
  if (value === null) return null;
  const record = expectExactRecord(
    value,
    [
      "kind",
      "headId",
      "headSequence",
      "headDigest",
      "currentStatus",
      "eligibilityEffect",
      "evaluatedAt",
      "freshUntil",
    ],
    "refund eligibility decision",
  );
  if (record.kind !== "refund-eligibility-decision.v1") {
    throw invalid("Refund eligibility decision kind is unsupported.");
  }
  if (
    record.currentStatus !== "no-applicable-entry" &&
    record.currentStatus !== "purchase-upheld" &&
    record.currentStatus !== "refund-recorded" &&
    record.currentStatus !== "dispute-open" &&
    record.currentStatus !== "refund-resolved"
  ) {
    throw invalid("Refund eligibility status is unsupported.");
  }
  const shouldClear =
    record.currentStatus === "no-applicable-entry" ||
    record.currentStatus === "purchase-upheld";
  if (
    record.eligibilityEffect !== (shouldClear ? "clear" : "block")
  ) {
    throw invalid("Refund eligibility effect contradicts the signed ledger state.");
  }
  return {
    kind: "refund-eligibility-decision.v1",
    headId: parseAuthorityId(record.headId, "refund head ID"),
    headSequence: parseUint256Decimal(
      record.headSequence,
      "refund head sequence",
    ),
    headDigest: parseHash32(record.headDigest, "refund head digest"),
    currentStatus: record.currentStatus,
    eligibilityEffect: shouldClear ? "clear" : "block",
    evaluatedAt: parseCanonicalInstant(
      record.evaluatedAt,
      "refund evaluatedAt",
    ),
    freshUntil: parseCanonicalInstant(
      record.freshUntil,
      "refund freshUntil",
    ),
  };
}

function parseEvidenceKind(value: unknown): AuthorityEvidenceKind {
  if (
    value !== "wallet-signature" &&
    value !== "device-possession" &&
    value !== "device-credential" &&
    value !== "finalized-receipt" &&
    value !== "purchase-beneficiary" &&
    value !== "tier-purchase" &&
    value !== "project-root" &&
    value !== "authority-generation" &&
    value !== "staff-delegation" &&
    value !== "refund-ledger"
  ) {
    throw invalid("Authority evidence kind is unsupported.");
  }
  return value;
}

function parseReasonForStatus(
  status: "eligible",
  value: unknown,
): "all-required-evidence-current";
function parseReasonForStatus(
  status: "ineligible",
  value: unknown,
): Extract<AuthorityDecision, { status: "ineligible" }>["reasonCode"];
function parseReasonForStatus(
  status: "pending-finality",
  value: unknown,
): "receipt-above-finalized-head";
function parseReasonForStatus(
  status: "unavailable",
  value: unknown,
): Extract<AuthorityDecision, { status: "unavailable" }>["reasonCode"];
function parseReasonForStatus(
  status: AuthorityDecision["status"],
  value: unknown,
): AuthorityDecision["reasonCode"] {
  if (status === "eligible" && value === "all-required-evidence-current") return value;
  if (status === "pending-finality" && value === "receipt-above-finalized-head") {
    return value;
  }
  if (
    status === "ineligible" &&
    (value === "signature-invalid" ||
      value === "device-invalid-or-revoked" ||
      value === "purchase-beneficiary-mismatch" ||
      value === "item-not-purchased" ||
      value === "project-authority-invalid" ||
      value === "staff-delegation-invalid-or-stale" ||
      value === "capability-not-delegated" ||
      value === "refund-or-dispute-blocks-access" ||
      value === "canonical-evidence-orphaned")
  ) {
    return value;
  }
  if (
    status === "unavailable" &&
    (value === "authority-service-not-configured" ||
      value === "required-verifier-unavailable" ||
      value === "rpc-unavailable" ||
      value === "audit-store-unavailable" ||
      value === "malformed-verifier-response")
  ) {
    return value;
  }
  throw invalid("Authority decision reason does not match its status.");
}

function assertActionMatchesResource(
  action: AuthorityAction,
  resource: AuthorityResource,
): void {
  const valid =
    (resource.kind === "purchase-support" &&
      (action === "purchase-support:join" || action === "purchase-support:send")) ||
    (resource.kind === "tier-fulfillment" && action === "fulfillment:submit-address") ||
    (resource.kind === "project-staff" &&
      staffCapabilityForAction(action) === resource.requiredCapability);
  if (!valid) throw invalid("Authority action does not apply to the named resource.");
}

function staffCapabilityForAction(
  action: AuthorityAction,
): ProjectStaffCapability | null {
  switch (action) {
    case "purchase-support:join":
      return "support:read-messages";
    case "purchase-support:send":
      return "support:send-messages";
    case "fulfillment:request-address":
      return "fulfillment:request-address";
    case "fulfillment:read-address":
      return "fulfillment:read-address";
    case "fulfillment:acknowledge-address":
      return "fulfillment:acknowledge-address";
    case "fulfillment:update-status":
      return "fulfillment:update-status";
    case "fulfillment:set-tracking":
      return "fulfillment:set-tracking";
    case "fulfillment:submit-address":
      return null;
  }
}

function invalid(message: string): AuthorityValidationError {
  return new AuthorityValidationError(message);
}
