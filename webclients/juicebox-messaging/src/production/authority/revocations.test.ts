import { describe, expect, it } from "vitest";
import { parseAuthorityGeneration } from "./delegations";
import { sha256AuthorityDigest } from "./digests";
import {
  authorityGeneration,
  finalityPolicy,
  hash,
  project,
} from "./fixtures.testing";
import { parseCanonicalityResult, parseFinalityPolicy } from "./finality";
import {
  computeAuthorityRevocationCauseDigest,
  computeAuthorityFreezeRecordDigest,
  computeAuthorityGenerationRetirementDigest,
  computeDerivedEvidenceSetDigest,
  computeRetiredAuthorityGenerationDigest,
  parseAuthorityRevocationCommitResult,
  parseAuthorityRevocationRequest,
} from "./revocations";
import {
  parseCanonicalInstant,
  parseHash32,
  parseJuiceboxV6ProjectRef,
} from "./valueObjects";

function orphanedCause() {
  const policy = parseFinalityPolicy(finalityPolicy());
  const transactionHash = parseHash32(hash("8"));
  const result = parseCanonicalityResult(
    {
      status: "orphaned",
      transactionHash,
      chainId: 8453,
      formerBlockNumber: "123456",
      formerBlockHash: hash("a"),
      reasonCode: "block-hash-mismatch",
      requiredAction: "revoke-leases-and-rekey",
    },
    policy,
    transactionHash,
    parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
  );
  if (result.status !== "orphaned") throw new Error("wrong fixture");
  return result;
}

function affectedGeneration() {
  return parseAuthorityGeneration(
    authorityGeneration(),
    parseFinalityPolicy(finalityPolicy()),
    parseCanonicalInstant("2026-08-14T12:04:00.000Z"),
  );
}

function requestInput() {
  return {
    requestId: "revocation-request.1",
    project: project(),
    affectedAuthorityGeneration: authorityGeneration(),
    requiredGenerationAction: "retire-exact-generation-and-freeze",
    cause: orphanedCause(),
    derivedEvidenceIds: ["evidence.a", "evidence.b", "root.1"],
    observedAt: "2026-08-14T12:02:00.000Z",
  };
}

function parsedRequest() {
  const cause = orphanedCause();
  return parseAuthorityRevocationRequest(requestInput(), {
    project: parseJuiceboxV6ProjectRef(project()),
    cause,
    affectedAuthorityGeneration: affectedGeneration(),
    now: parseCanonicalInstant("2026-08-14T12:04:00.000Z"),
  });
}

function committedResult() {
  const request = parsedRequest();
  const generationRetirementId = "generation-retirement.1";
  const freezeRecordId = "authority-freeze.1";
  const withoutDigest = {
    status: "committed" as const,
    requestId: request.requestId,
    causeDigest: computeAuthorityRevocationCauseDigest(request.cause),
    derivedEvidenceSetDigest: computeDerivedEvidenceSetDigest(
      request.derivedEvidenceIds,
    ),
    revocationCommitId: "revocation-commit.1",
    retiredAuthorityGenerationId:
      request.affectedAuthorityGeneration.generationId,
    retiredAuthorityGenerationSequence:
      request.affectedAuthorityGeneration.sequence,
    retiredAuthorityGenerationDigest: computeRetiredAuthorityGenerationDigest(
      request.affectedAuthorityGeneration,
    ),
    generationRetirementId,
    generationRetirementDigest: computeAuthorityGenerationRetirementDigest(
      request,
      generationRetirementId,
    ),
    authorityGenerationState: "retired" as const,
    affectedLeaseCount: 2,
    revokedLeaseIdsDigest: hash("1"),
    revokedDelegationIdsDigest: hash("2"),
    policyHeadDigest: hash("3"),
    auditRecordId: "audit.revocation.1",
    outboxRecordId: "outbox.revocation.1",
    freezeRecordId,
    freezeRecordDigest: computeAuthorityFreezeRecordDigest(
      request,
      freezeRecordId,
    ),
    admissionState: "frozen" as const,
    sendState: "frozen-pending-rekey" as const,
    mlsRekeyRequestDigest: hash("4"),
    mlsAction: "remove-and-rekey-enqueued" as const,
    sendsPausedUntilRekey: true as const,
    committedAt: "2026-08-14T12:03:00.000Z",
  };
  return {
    ...withoutDigest,
    atomicCommitDigest: sha256AuthorityDigest({
      kind: "authority-revocation-atomic-commit.v1",
      commit: withoutDigest,
    }),
  };
}

describe("atomic authority revocation and MLS rekey boundary", () => {
  it("binds a sorted derived-evidence set to the exact orphaned cause", () => {
    const request = parsedRequest();
    expect(request).toMatchObject({
      requestId: "revocation-request.1",
      affectedAuthorityGeneration: { generationId: "generation.1" },
      derivedEvidenceIds: ["evidence.a", "evidence.b", "root.1"],
    });
    for (const mutation of [
      { ...requestInput(), derivedEvidenceIds: ["evidence.b", "evidence.a"] },
      { ...requestInput(), derivedEvidenceIds: ["evidence.a", "evidence.a"] },
      { ...requestInput(), derivedEvidenceIds: [] },
      { ...requestInput(), observedAt: "2026-08-14T12:04:00.001Z" },
      {
        ...requestInput(),
        cause: { ...orphanedCause(), formerBlockHash: hash("b") },
      },
      {
        ...requestInput(),
        affectedAuthorityGeneration: {
          ...authorityGeneration(),
          generationId: "generation.substituted",
        },
      },
    ]) {
      expect(() =>
        parseAuthorityRevocationRequest(mutation, {
          project: parseJuiceboxV6ProjectRef(project()),
          cause: orphanedCause(),
          affectedAuthorityGeneration: affectedGeneration(),
          now: parseCanonicalInstant("2026-08-14T12:04:00.000Z"),
        }),
      ).toThrow();
    }
  });

  it("accepts only one canonical atomic commit that pauses sends and enqueues rekey", () => {
    const request = parsedRequest();
    const result = committedResult();
    expect(
      parseAuthorityRevocationCommitResult(
        result,
        request,
        parseCanonicalInstant("2026-08-14T12:04:00.000Z"),
      ),
    ).toMatchObject({
      status: "committed",
      affectedLeaseCount: 2,
      retiredAuthorityGenerationId: "generation.1",
      authorityGenerationState: "retired",
      admissionState: "frozen",
      sendState: "frozen-pending-rekey",
      sendsPausedUntilRekey: true,
      mlsAction: "remove-and-rekey-enqueued",
    });
    for (const mutation of [
      { ...result, causeDigest: hash("9") },
      { ...result, derivedEvidenceSetDigest: hash("9") },
      { ...result, retiredAuthorityGenerationId: "generation.other" },
      { ...result, generationRetirementDigest: hash("9") },
      { ...result, authorityGenerationState: "active" },
      { ...result, freezeRecordDigest: hash("9") },
      { ...result, sendState: "enabled" },
      { ...result, sendsPausedUntilRekey: false },
      { ...result, mlsAction: "leave-existing-members" },
      { ...result, committedAt: "2026-08-14T12:01:59.999Z" },
      { ...result, atomicCommitDigest: hash("9") },
    ]) {
      expect(() =>
        parseAuthorityRevocationCommitResult(
          mutation,
          request,
          parseCanonicalInstant("2026-08-14T12:04:00.000Z"),
        ),
      ).toThrow();
    }
  });

  it("keeps authority suspended when revocation coordination is unavailable", () => {
    const request = parsedRequest();
    expect(
      parseAuthorityRevocationCommitResult(
        {
          status: "unavailable",
          requestId: null,
          causeDigest: null,
          affectedAuthorityGenerationId: null,
          generationRetirementCommitted: false,
          reasonCode: "revocation-coordinator-not-configured",
          authorityRemainsSuspended: true,
          sendsRemainFrozen: true,
        },
        request,
        parseCanonicalInstant("2026-08-14T12:04:00.000Z"),
      ),
    ).toEqual({
      status: "unavailable",
      requestId: null,
      causeDigest: null,
      affectedAuthorityGenerationId: null,
      generationRetirementCommitted: false,
      reasonCode: "revocation-coordinator-not-configured",
      authorityRemainsSuspended: true,
      sendsRemainFrozen: true,
    });
    expect(() =>
      parseAuthorityRevocationCommitResult(
        {
          status: "unavailable",
          requestId: request.requestId,
          causeDigest: computeAuthorityRevocationCauseDigest(request.cause),
          affectedAuthorityGenerationId:
            request.affectedAuthorityGeneration.generationId,
          generationRetirementCommitted: false,
          reasonCode: "outbox-unavailable",
          authorityRemainsSuspended: false,
          sendsRemainFrozen: true,
        },
        request,
        parseCanonicalInstant("2026-08-14T12:04:00.000Z"),
      ),
    ).toThrow();
  });
});
