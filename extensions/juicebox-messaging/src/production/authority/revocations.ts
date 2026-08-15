import { sha256AuthorityDigest } from "./digests";
import type {
  AuthorityRevocationCommitResult,
  AuthorityRevocationRequest,
} from "./ports";
import {
  AuthorityValidationError,
  expectExactRecord,
  instantMilliseconds,
  parseAuthorityId,
  parseCanonicalInstant,
  parseHash32,
  parseJuiceboxV6ProjectRef,
  sameJuiceboxV6ProjectRef,
  type CanonicalInstant,
  type Hash32,
  type JuiceboxV6ProjectRef,
} from "./valueObjects";

export function computeAuthorityRevocationCauseDigest(
  cause: AuthorityRevocationRequest["cause"],
): Hash32 {
  return sha256AuthorityDigest({
    kind: "authority-revocation-cause-digest.v1",
    cause,
  });
}

export function computeDerivedEvidenceSetDigest(
  evidenceIds: readonly string[],
): Hash32 {
  return sha256AuthorityDigest({
    kind: "authority-derived-evidence-set.v1",
    evidenceIds,
  });
}

export function computeRetiredAuthorityGenerationDigest(
  generation: AuthorityRevocationRequest["affectedAuthorityGeneration"],
): Hash32 {
  return sha256AuthorityDigest({
    kind: "retired-authority-generation.v1",
    generation,
  });
}

export function computeAuthorityGenerationRetirementDigest(
  request: AuthorityRevocationRequest,
  generationRetirementId: string,
): Hash32 {
  return sha256AuthorityDigest({
    kind: "authority-generation-retirement.v1",
    requestId: request.requestId,
    causeDigest: computeAuthorityRevocationCauseDigest(request.cause),
    generationRetirementId,
    retiredAuthorityGenerationId:
      request.affectedAuthorityGeneration.generationId,
    retiredAuthorityGenerationSequence:
      request.affectedAuthorityGeneration.sequence,
    retiredAuthorityGenerationDigest: computeRetiredAuthorityGenerationDigest(
      request.affectedAuthorityGeneration,
    ),
    authorityGenerationState: "retired",
  });
}

export function computeAuthorityFreezeRecordDigest(
  request: AuthorityRevocationRequest,
  freezeRecordId: string,
): Hash32 {
  return sha256AuthorityDigest({
    kind: "authority-generation-freeze.v1",
    requestId: request.requestId,
    causeDigest: computeAuthorityRevocationCauseDigest(request.cause),
    retiredAuthorityGenerationId:
      request.affectedAuthorityGeneration.generationId,
    freezeRecordId,
    admissionState: "frozen",
    sendState: "frozen-pending-rekey",
  });
}

export function parseAuthorityRevocationRequest(
  value: unknown,
  expected: {
    project: JuiceboxV6ProjectRef;
    cause: AuthorityRevocationRequest["cause"];
    affectedAuthorityGeneration: AuthorityRevocationRequest["affectedAuthorityGeneration"];
    now: CanonicalInstant;
  },
): AuthorityRevocationRequest {
  const record = expectExactRecord(
    value,
    [
      "requestId",
      "project",
      "affectedAuthorityGeneration",
      "requiredGenerationAction",
      "cause",
      "derivedEvidenceIds",
      "observedAt",
    ],
    "authority revocation request",
  );
  const project = parseJuiceboxV6ProjectRef(record.project);
  if (
    !sameJuiceboxV6ProjectRef(project, expected.project) ||
    sha256AuthorityDigest(record.cause) !==
      sha256AuthorityDigest(expected.cause) ||
    sha256AuthorityDigest(record.affectedAuthorityGeneration) !==
      sha256AuthorityDigest(expected.affectedAuthorityGeneration) ||
    record.requiredGenerationAction !== "retire-exact-generation-and-freeze"
  ) {
    throw invalid("Authority revocation request belongs to another cause.");
  }
  if (
    ("status" in expected.cause &&
      expected.cause.chainId !== project.chainId) ||
    ("kind" in expected.cause &&
      !sameJuiceboxV6ProjectRef(expected.cause.project, project))
  ) {
    throw invalid("Authority revocation cause belongs to another project.");
  }
  if (
    !sameJuiceboxV6ProjectRef(
      expected.affectedAuthorityGeneration.project,
      project,
    ) ||
    ("status" in expected.cause &&
      (expected.cause.transactionHash !==
        expected.affectedAuthorityGeneration.transitionCursor.transactionHash ||
        expected.cause.formerBlockNumber !==
          expected.affectedAuthorityGeneration.activatedAtBlock.blockNumber ||
        expected.cause.formerBlockHash !==
          expected.affectedAuthorityGeneration.activatedAtBlock.blockHash)) ||
    ("kind" in expected.cause &&
      (expected.cause.predecessorGenerationId !==
        expected.affectedAuthorityGeneration.generationId ||
        expected.cause.predecessorGenerationSequence !==
          expected.affectedAuthorityGeneration.sequence ||
        expected.cause.predecessorPrincipal !==
          expected.affectedAuthorityGeneration.rootPrincipal ||
        expected.cause.predecessorRootKind !==
          expected.affectedAuthorityGeneration.rootKind))
  ) {
    throw invalid("Authority revocation does not retire the exact affected generation.");
  }
  if (
    !Array.isArray(record.derivedEvidenceIds) ||
    record.derivedEvidenceIds.length < 1 ||
    record.derivedEvidenceIds.length > 10_000
  ) {
    throw invalid("Derived authority evidence list is outside its bound.");
  }
  const derivedEvidenceIds = record.derivedEvidenceIds.map((item) =>
    parseAuthorityId(item, "derived evidence ID"),
  );
  if (
    new Set(derivedEvidenceIds).size !== derivedEvidenceIds.length ||
    [...derivedEvidenceIds]
      .sort()
      .some((item, index) => item !== derivedEvidenceIds[index])
  ) {
    throw invalid("Derived authority evidence IDs must be unique and sorted.");
  }
  if (
    !derivedEvidenceIds.includes(
      expected.affectedAuthorityGeneration.rootEvidenceId,
    )
  ) {
    throw invalid("Authority revocation omits the retired generation root evidence.");
  }
  const observedAt = parseCanonicalInstant(record.observedAt, "observedAt");
  if (instantMilliseconds(observedAt) > instantMilliseconds(expected.now)) {
    throw invalid("Authority revocation observation cannot be in the future.");
  }
  if (
    "kind" in expected.cause &&
    instantMilliseconds(observedAt) <
      instantMilliseconds(expected.cause.block.finalizedAt)
  ) {
    throw invalid("Authority loss cannot be observed before its finalized anchor.");
  }
  return {
    requestId: parseAuthorityId(record.requestId, "revocation request ID"),
    project,
    affectedAuthorityGeneration: expected.affectedAuthorityGeneration,
    requiredGenerationAction: "retire-exact-generation-and-freeze",
    cause: expected.cause,
    derivedEvidenceIds: derivedEvidenceIds as [
      (typeof derivedEvidenceIds)[number],
      ...(typeof derivedEvidenceIds)[number][],
    ],
    observedAt,
  };
}

export function parseAuthorityRevocationCommitResult(
  value: unknown,
  request: AuthorityRevocationRequest,
  now: CanonicalInstant,
): AuthorityRevocationCommitResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("Authority revocation result must be an object.");
  }
  const status = (value as Record<string, unknown>).status;
  const causeDigest = computeAuthorityRevocationCauseDigest(request.cause);
  if (status === "unavailable") {
    const record = expectExactRecord(
      value,
      [
        "status",
        "requestId",
        "causeDigest",
        "affectedAuthorityGenerationId",
        "generationRetirementCommitted",
        "reasonCode",
        "authorityRemainsSuspended",
        "sendsRemainFrozen",
      ],
      "unavailable authority revocation",
    );
    const notConfigured =
      record.reasonCode === "revocation-coordinator-not-configured";
    if (
      ((!notConfigured || record.requestId !== null || record.causeDigest !== null) &&
        (record.requestId !== request.requestId ||
          record.causeDigest !== causeDigest)) ||
      (notConfigured
        ? record.affectedAuthorityGenerationId !== null
        : record.affectedAuthorityGenerationId !==
          request.affectedAuthorityGeneration.generationId) ||
      record.generationRetirementCommitted !== false ||
      record.authorityRemainsSuspended !== true ||
      record.sendsRemainFrozen !== true ||
      (record.reasonCode !== "revocation-coordinator-not-configured" &&
        record.reasonCode !== "lease-index-unavailable" &&
        record.reasonCode !== "audit-store-unavailable" &&
        record.reasonCode !== "outbox-unavailable")
    ) {
      throw invalid("Unavailable revocation result is detached or unsafe.");
    }
    return {
      status,
      requestId: notConfigured ? null : request.requestId,
      causeDigest: notConfigured ? null : causeDigest,
      affectedAuthorityGenerationId: notConfigured
        ? null
        : request.affectedAuthorityGeneration.generationId,
      generationRetirementCommitted: false,
      reasonCode: record.reasonCode,
      authorityRemainsSuspended: true,
      sendsRemainFrozen: true,
    };
  }
  if (status !== "committed") {
    throw invalid("Authority revocation result status is unsupported.");
  }
  const record = expectExactRecord(
    value,
    [
      "status",
      "requestId",
      "causeDigest",
      "derivedEvidenceSetDigest",
      "revocationCommitId",
      "retiredAuthorityGenerationId",
      "retiredAuthorityGenerationSequence",
      "retiredAuthorityGenerationDigest",
      "generationRetirementId",
      "generationRetirementDigest",
      "authorityGenerationState",
      "affectedLeaseCount",
      "revokedLeaseIdsDigest",
      "revokedDelegationIdsDigest",
      "policyHeadDigest",
      "auditRecordId",
      "outboxRecordId",
      "freezeRecordId",
      "freezeRecordDigest",
      "admissionState",
      "sendState",
      "mlsRekeyRequestDigest",
      "mlsAction",
      "sendsPausedUntilRekey",
      "committedAt",
      "atomicCommitDigest",
    ],
    "committed authority revocation",
  );
  const derivedEvidenceSetDigest = computeDerivedEvidenceSetDigest(
    request.derivedEvidenceIds,
  );
  const retiredAuthorityGenerationDigest =
    computeRetiredAuthorityGenerationDigest(request.affectedAuthorityGeneration);
  const generationRetirementId = parseAuthorityId(
    record.generationRetirementId,
    "authority generation retirement ID",
  );
  const freezeRecordId = parseAuthorityId(
    record.freezeRecordId,
    "authority freeze record ID",
  );
  if (
    record.requestId !== request.requestId ||
    record.causeDigest !== causeDigest ||
    record.derivedEvidenceSetDigest !== derivedEvidenceSetDigest ||
    record.retiredAuthorityGenerationId !==
      request.affectedAuthorityGeneration.generationId ||
    record.retiredAuthorityGenerationSequence !==
      request.affectedAuthorityGeneration.sequence ||
    record.retiredAuthorityGenerationDigest !==
      retiredAuthorityGenerationDigest ||
    record.generationRetirementDigest !==
      computeAuthorityGenerationRetirementDigest(
        request,
        generationRetirementId,
      ) ||
    record.authorityGenerationState !== "retired" ||
    record.freezeRecordDigest !==
      computeAuthorityFreezeRecordDigest(request, freezeRecordId) ||
    record.admissionState !== "frozen" ||
    record.sendState !== "frozen-pending-rekey" ||
    record.mlsAction !== "remove-and-rekey-enqueued" ||
    record.sendsPausedUntilRekey !== true
  ) {
    throw invalid("Authority revocation commit is detached or incomplete.");
  }
  if (
    typeof record.affectedLeaseCount !== "number" ||
    !Number.isSafeInteger(record.affectedLeaseCount) ||
    record.affectedLeaseCount < 0 ||
    record.affectedLeaseCount > 1_000_000
  ) {
    throw invalid("Revoked lease count is outside its safe bound.");
  }
  const committedAt = parseCanonicalInstant(record.committedAt, "committedAt");
  if (
    instantMilliseconds(committedAt) < instantMilliseconds(request.observedAt) ||
    instantMilliseconds(committedAt) > instantMilliseconds(now)
  ) {
    throw invalid("Authority revocation commit time is invalid.");
  }
  const parsedWithoutDigest = {
    status: "committed" as const,
    requestId: request.requestId,
    causeDigest,
    derivedEvidenceSetDigest,
    revocationCommitId: parseAuthorityId(
      record.revocationCommitId,
      "revocation commit ID",
    ),
    retiredAuthorityGenerationId:
      request.affectedAuthorityGeneration.generationId,
    retiredAuthorityGenerationSequence:
      request.affectedAuthorityGeneration.sequence,
    retiredAuthorityGenerationDigest,
    generationRetirementId,
    generationRetirementDigest: parseHash32(
      record.generationRetirementDigest,
      "authority generation retirement digest",
    ),
    authorityGenerationState: "retired" as const,
    affectedLeaseCount: record.affectedLeaseCount,
    revokedLeaseIdsDigest: parseHash32(
      record.revokedLeaseIdsDigest,
      "revoked lease IDs digest",
    ),
    revokedDelegationIdsDigest: parseHash32(
      record.revokedDelegationIdsDigest,
      "revoked delegation IDs digest",
    ),
    policyHeadDigest: parseHash32(record.policyHeadDigest, "policy head digest"),
    auditRecordId: parseAuthorityId(record.auditRecordId, "audit record ID"),
    outboxRecordId: parseAuthorityId(record.outboxRecordId, "outbox record ID"),
    freezeRecordId,
    freezeRecordDigest: parseHash32(
      record.freezeRecordDigest,
      "authority freeze record digest",
    ),
    admissionState: "frozen" as const,
    sendState: "frozen-pending-rekey" as const,
    mlsRekeyRequestDigest: parseHash32(
      record.mlsRekeyRequestDigest,
      "MLS rekey request digest",
    ),
    mlsAction: "remove-and-rekey-enqueued" as const,
    sendsPausedUntilRekey: true as const,
    committedAt,
  };
  const atomicCommitDigest = parseHash32(
    record.atomicCommitDigest,
    "atomic revocation commit digest",
  );
  if (
    atomicCommitDigest !==
    sha256AuthorityDigest({
      kind: "authority-revocation-atomic-commit.v1",
      commit: parsedWithoutDigest,
    })
  ) {
    throw invalid("Authority revocation atomic commit digest is not canonical.");
  }
  return { ...parsedWithoutDigest, atomicCommitDigest };
}

function invalid(message: string): AuthorityValidationError {
  return new AuthorityValidationError(message);
}
