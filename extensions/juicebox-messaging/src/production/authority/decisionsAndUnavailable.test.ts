import { describe, expect, it } from "vitest";
import { parseWalletChallenge } from "./challenges";
import {
  computeAuthorityAuditIdempotencyKey,
  computeAuthorityAuditHeadDigest,
  computeAuthorityAuditRecordDigest,
  computeAuthorityDecisionDigest,
  computeAuthorityGateInputDigest,
  computeAuthorityResourceDigest,
  parseAuthorityAuditRecord,
  parseAuthorityDecision,
  parseAuthorityGateRequest,
  type AuthorityDecision,
} from "./decisions";
import {
  parseDeviceEnrollmentRequest,
  parseDevicePossessionChallenge,
} from "./devices";
import {
  ADDRESS_A,
  ADDRESS_B,
  ADDRESS_C,
  ADDRESS_TERMINAL,
  ACCOUNT_ID,
  DEVICE_CREDENTIAL_ID,
  ENROLLMENT_ID,
  INSTALLATION_ID,
  POSSESSION_CHALLENGE_ID,
  WALLET_CHALLENGE_ID,
  device,
  devicePossessionChallenge,
  finalityPolicy,
  hash,
  paymentEvidence,
  project,
  siweChallenge,
} from "./fixtures.testing";
import { parseFinalityPolicy } from "./finality";
import type {
  ClaimWalletChallengeResult,
  RecordWalletChallengeOutcomeResult,
  WalletChallengeStorePort,
} from "./ports";
import {
  parseCanonicalPurchaseClaim,
  parseCanonicalPurchaseVerificationExpectation,
  parseCanonicalPurchaseVerificationResult,
  parseRefundLedgerExpectation,
} from "./purchases";
import { parseWalletSignatureSubmission } from "./signatures";
import { createUnavailableProductionAuthorityPorts } from "./unavailable";
import {
  parseAuthorityId,
  parseCanonicalInstant,
  parseEthereumAddress,
  parseHash32,
  parseHttpsOrigin,
  parseUint256Decimal,
} from "./valueObjects";

function subject() {
  return {
    account: ADDRESS_B,
    participantId: "participant.1",
    installationId: "installation.1",
    deviceCredentialId: "credential.1",
  };
}

function resource() {
  return {
    kind: "purchase-support",
    project: project(),
    purchaseEvidenceId: "purchase.1",
    transactionHash: hash("d"),
    payLogIndex: 7,
  };
}

function gateRequest() {
  const resourceValue = resource();
  const resourceDigest = computeAuthorityResourceDigest(
    resourceValue as never,
  );
  const withoutInputDigest = {
    requestId: parseAuthorityId("request.1"),
    evaluatedAt: parseCanonicalInstant("2026-08-14T12:02:00.000Z"),
    policyId: parseAuthorityId("authority-policy.1"),
    policyRevision: parseUint256Decimal("1"),
    policyHash: parseHash32(hash("9")),
    subject: {
      account: parseEthereumAddress(ADDRESS_B),
      participantId: parseAuthorityId("participant.1"),
      installationId: parseAuthorityId("installation.1"),
      deviceCredentialId: parseAuthorityId("credential.1"),
    },
    resource: resourceValue as never,
    action: "purchase-support:join" as const,
    resourceDigest,
  };
  return {
    ...withoutInputDigest,
    inputDigest: computeAuthorityGateInputDigest(withoutInputDigest),
  };
}

function evidence(overrides: Record<string, unknown> = {}) {
  const request = gateRequest();
  return {
    kind: "authority-evidence-reference.v1",
    evidenceId: "purchase.1",
    evidenceKind: "purchase-beneficiary",
    digest: hash("1"),
    policyId: request.policyId,
    policyRevision: request.policyRevision,
    policyHash: request.policyHash,
    resourceDigest: request.resourceDigest,
    refundDecision: null,
    project: project(),
    subjectAccount: ADDRESS_B,
    generationId: null,
    blockNumber: "123456",
    blockHash: hash("a"),
    expiresAt: "2026-08-14T12:10:00.000Z",
    ...overrides,
  };
}

function decisionBase() {
  const request = gateRequest();
  return {
    kind: "authority-decision.v1",
    decisionId: "decision.1",
    requestId: request.requestId,
    evaluatedAt: request.evaluatedAt,
    policyId: request.policyId,
    policyVersion: "1",
    policyRevision: request.policyRevision,
    policyHash: request.policyHash,
    subject: subject(),
    resource: resource(),
    action: "purchase-support:join",
    inputDigest: request.inputDigest,
    resourceDigest: request.resourceDigest,
    decisionDigest: hash("0"),
    evidence: [
      evidence({
        evidenceId: "credential.1",
        evidenceKind: "device-credential",
        digest: hash("7"),
        project: null,
        resourceDigest: null,
        blockNumber: null,
        blockHash: null,
      }),
      evidence(),
      evidence({
        evidenceId: "receipt.1",
        evidenceKind: "finalized-receipt",
        digest: hash("8"),
        subjectAccount: null,
      }),
      evidence({
        evidenceId: "refund.head.1",
        evidenceKind: "refund-ledger",
        digest: hash("a"),
        subjectAccount: null,
        refundDecision: {
          kind: "refund-eligibility-decision.v1",
          headId: "refund.head.1",
          headSequence: "1",
          headDigest: hash("a"),
          currentStatus: "no-applicable-entry",
          eligibilityEffect: "clear",
          evaluatedAt: "2026-08-14T12:02:00.000Z",
          freshUntil: "2026-08-14T12:10:00.000Z",
        },
      }),
    ],
  };
}

function sealDecision<T extends Record<string, unknown>>(unsealed: T) {
  const provisional = {
    ...unsealed,
    decisionDigest: hash("0"),
    audit: {
      status: "persisted-before-release",
      auditRecordId: "audit.1",
      auditRecordDigest: hash("0"),
      decisionId: "decision.1",
      decisionDigest: hash("0"),
      idempotencyKey: hash("0"),
      auditSignerKeyId: "audit-key.1",
      auditHeadDigest: hash("7"),
    },
  } as unknown as AuthorityDecision;
  const decisionDigest = computeAuthorityDecisionDigest(provisional);
  const decision = { ...provisional, decisionDigest } as AuthorityDecision;
  const unsignedAuditRecord = {
    kind: "authority-audit-record.v1" as const,
    auditRecordId: parseAuthorityId("audit.1"),
    decisionId: decision.decisionId,
    idempotencyKey: computeAuthorityAuditIdempotencyKey(decision),
    auditSignerKeyId: parseAuthorityId("audit-key.1"),
    priorAuditHeadDigest: parseHash32(hash("6")),
    recordedAt: parseCanonicalInstant("2026-08-14T12:02:00.000Z"),
    policyId: decision.policyId,
    policyVersion: "1" as const,
    policyRevision: decision.policyRevision,
    policyHash: decision.policyHash,
    action: decision.action,
    subject: decision.subject,
    project: decision.resource.project,
    inputDigest: decision.inputDigest,
    resourceDigest: decision.resourceDigest,
    outcome: decision.status,
    reasonCode: decision.reasonCode,
    evidence: decision.evidence,
    decisionDigest,
    rawSensitiveData: "not-recorded" as const,
  };
  const auditRecordDigest = computeAuthorityAuditRecordDigest(unsignedAuditRecord);
  const auditHeadDigest = computeAuthorityAuditHeadDigest({
    priorAuditHeadDigest: unsignedAuditRecord.priorAuditHeadDigest,
    auditRecordDigest,
    auditSignerKeyId: unsignedAuditRecord.auditSignerKeyId,
  });
  const auditRecord = {
    ...unsignedAuditRecord,
    auditRecordDigest,
    auditHeadDigest,
  };
  const sealed = {
    ...decision,
    audit: {
      status: "persisted-before-release" as const,
      auditRecordId: auditRecord.auditRecordId,
      auditRecordDigest: auditRecord.auditRecordDigest,
      decisionId: decision.decisionId,
      decisionDigest,
      idempotencyKey: auditRecord.idempotencyKey,
      auditSignerKeyId: auditRecord.auditSignerKeyId,
      auditHeadDigest,
    },
  } as AuthorityDecision;
  return {
    decision: sealed,
    context: {
      request: gateRequest(),
      auditRecord,
      expectedAuditSignerKeyId: auditRecord.auditSignerKeyId,
      expectedPriorAuditHeadDigest: auditRecord.priorAuditHeadDigest,
    },
    auditRecord,
  };
}

function sealAuditUnavailableDecision() {
  const provisional = {
    ...decisionBase(),
    status: "unavailable" as const,
    reasonCode: "audit-store-unavailable" as const,
    audit: {
      status: "not-persisted-audit-unavailable" as const,
      reasonCode: "audit-store-unavailable" as const,
    },
  } as unknown as AuthorityDecision;
  return {
    decision: {
      ...provisional,
      decisionDigest: computeAuthorityDecisionDigest(provisional),
    } as AuthorityDecision,
    context: {
      request: gateRequest(),
      auditRecord: null,
      expectedAuditSignerKeyId: parseAuthorityId("audit-key.1"),
      expectedPriorAuditHeadDigest: parseHash32(hash("6")),
    },
  };
}

class TerminalClaimStore implements WalletChallengeStorePort {
  private state: "issued" | "claimed" = "issued";
  private outcomeRecorded = false;
  private readonly challenge = parseWalletChallenge(siweChallenge());

  claimForVerification(input: {
    challengeId: ReturnType<typeof parseAuthorityId>;
    claimId: ReturnType<typeof parseAuthorityId>;
    claimedAt: ReturnType<typeof parseCanonicalInstant>;
  }): Promise<ClaimWalletChallengeResult> {
    if (input.challengeId !== "challenge.1") {
      return Promise.resolve({ status: "not-found" });
    }
    if (this.state === "claimed") {
      return Promise.resolve({ status: "already-claimed-or-consumed" });
    }
    this.state = "claimed";
    return Promise.resolve({
      status: "claimed",
      challenge: this.challenge,
      challengeId: input.challengeId,
      claimId: input.claimId,
      claimedAt: input.claimedAt,
      terminalEvenIfVerificationFails: true,
    });
  }

  recordClaimOutcome(): Promise<RecordWalletChallengeOutcomeResult> {
    if (this.outcomeRecorded) return Promise.resolve({ status: "already-recorded" });
    this.outcomeRecorded = true;
    return Promise.resolve({ status: "recorded" });
  }
}

describe("auditable authority decisions and fail-closed ports", () => {
  it("allows an eligible lease only after audit persistence and within evidence expiry", () => {
    const eligible = sealDecision({
      ...decisionBase(),
      status: "eligible",
      reasonCode: "all-required-evidence-current",
      lease: {
        leaseId: "lease.1",
        issuedAt: "2026-08-14T12:02:00.000Z",
        expiresAt: "2026-08-14T12:05:00.000Z",
        authorityGenerationId: null,
      },
    });
    expect(
      parseAuthorityDecision(eligible.decision, eligible.context),
    ).toMatchObject({ status: "eligible", audit: { status: "persisted-before-release" } });

    const overlong = sealDecision({
      ...decisionBase(),
      status: "eligible",
      reasonCode: "all-required-evidence-current",
      lease: {
        leaseId: "lease.1",
        issuedAt: "2026-08-14T12:02:00.000Z",
        expiresAt: "2026-08-14T12:10:00.001Z",
        authorityGenerationId: null,
      },
    });
    expect(() =>
      parseAuthorityDecision(overlong.decision, overlong.context),
    ).toThrow();
    const delayedIssuance = sealDecision({
      ...decisionBase(),
      status: "eligible",
      reasonCode: "all-required-evidence-current",
      lease: {
        leaseId: "lease.1",
        issuedAt: "2026-08-14T12:06:00.000Z",
        expiresAt: "2026-08-14T12:09:00.000Z",
        authorityGenerationId: null,
      },
    });
    expect(() =>
      parseAuthorityDecision(delayedIssuance.decision, delayedIssuance.context),
    ).toThrow();
    expect(() =>
      parseAuthorityDecision({
        ...eligible.decision,
        audit: { status: "pending" },
      }, eligible.context),
    ).toThrow();
  });

  it("keeps ineligible, pending-finality, and unavailable as exact disjoint outcomes", () => {
    const ineligible = sealDecision({
      ...decisionBase(),
      status: "ineligible",
      reasonCode: "purchase-beneficiary-mismatch",
    });
    expect(
      parseAuthorityDecision(ineligible.decision, ineligible.context),
    ).toMatchObject({ status: "ineligible" });
    const pending = sealDecision({
      ...decisionBase(),
      status: "pending-finality",
      reasonCode: "receipt-above-finalized-head",
      candidateBlockNumber: "123457",
      candidateBlockHash: hash("4"),
      retryAfter: "2026-08-14T12:03:00.000Z",
    });
    expect(
      parseAuthorityDecision(pending.decision, pending.context),
    ).toMatchObject({ status: "pending-finality" });
    const unavailable = sealAuditUnavailableDecision();
    expect(
      parseAuthorityDecision(unavailable.decision, unavailable.context),
    ).toMatchObject({ status: "unavailable" });
    expect(() =>
      parseAuthorityDecision({
        ...ineligible.decision,
        status: "eligible" as const,
        reasonCode: "all-required-evidence-current" as const,
        lease: null,
        pending: true,
      }, ineligible.context),
    ).toThrow();
  });

  it("requires unique sorted evidence references and paired block anchors", () => {
    const sealed = sealDecision({
      ...decisionBase(),
      status: "ineligible",
      reasonCode: "item-not-purchased",
    });
    expect(() =>
      parseAuthorityDecision(
        { ...sealed.decision, evidence: [evidence(), evidence()] },
        sealed.context,
      ),
    ).toThrow();
    expect(() =>
      parseAuthorityDecision(
        {
          ...sealed.decision,
          evidence: [{ ...evidence(), blockHash: null }],
        },
        sealed.context,
      ),
    ).toThrow();
    const duplicateRefundHeads = [
      ...decisionBase().evidence,
      evidence({
        evidenceId: "refund.head.2",
        evidenceKind: "refund-ledger",
        digest: hash("b"),
        subjectAccount: null,
        refundDecision: {
          kind: "refund-eligibility-decision.v1",
          headId: "refund.head.2",
          headSequence: "2",
          headDigest: hash("b"),
          currentStatus: "refund-recorded",
          eligibilityEffect: "block",
          evaluatedAt: "2026-08-14T12:02:00.000Z",
          freshUntil: "2026-08-14T12:10:00.000Z",
        },
      }),
    ].sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
    const dualHead = sealDecision({
      ...decisionBase(),
      evidence: duplicateRefundHeads,
      status: "eligible",
      reasonCode: "all-required-evidence-current",
      lease: {
        leaseId: "lease.1",
        issuedAt: "2026-08-14T12:02:00.000Z",
        expiresAt: "2026-08-14T12:05:00.000Z",
        authorityGenerationId: null,
      },
    });
    expect(() =>
      parseAuthorityDecision(dualHead.decision, dualHead.context),
    ).toThrow();
  });

  it("binds every decision, evidence reference, and audit record to the exact gate request", () => {
    const sealed = sealDecision({
      ...decisionBase(),
      status: "eligible",
      reasonCode: "all-required-evidence-current",
      lease: {
        leaseId: "lease.1",
        issuedAt: "2026-08-14T12:02:00.000Z",
        expiresAt: "2026-08-14T12:05:00.000Z",
        authorityGenerationId: null,
      },
    });
    expect(() =>
      parseAuthorityDecision(
        { ...sealed.decision, requestId: "request.other" },
        sealed.context,
      ),
    ).toThrow();
    expect(() =>
      parseAuthorityDecision(
        { ...sealed.decision, decisionDigest: hash("f") },
        sealed.context,
      ),
    ).toThrow();
    expect(() =>
      parseAuthorityDecision(sealed.decision, {
        ...sealed.context,
        auditRecord: {
          ...sealed.auditRecord,
          auditHeadDigest: hash("e"),
        },
      }),
    ).toThrow();

    const wrongPolicyEvidence = sealDecision({
      ...decisionBase(),
      evidence: decisionBase().evidence.map((item) =>
        item.evidenceId === "purchase.1"
          ? { ...item, policyHash: hash("e") }
          : item,
      ),
      status: "eligible",
      reasonCode: "all-required-evidence-current",
      lease: {
        leaseId: "lease.1",
        issuedAt: "2026-08-14T12:02:00.000Z",
        expiresAt: "2026-08-14T12:05:00.000Z",
        authorityGenerationId: null,
      },
    });
    expect(() =>
      parseAuthorityDecision(
        wrongPolicyEvidence.decision,
        wrongPolicyEvidence.context,
      ),
    ).toThrow();
    const ineligibleWrongProject = sealDecision({
      ...decisionBase(),
      evidence: decisionBase().evidence.map((item) =>
        item.evidenceKind === "finalized-receipt"
          ? {
              ...item,
              project: { ...project(), projectId: 10 },
            }
          : item,
      ),
      status: "ineligible",
      reasonCode: "canonical-evidence-orphaned",
    });
    expect(() =>
      parseAuthorityDecision(
        ineligibleWrongProject.decision,
        ineligibleWrongProject.context,
      ),
    ).toThrow();

    const splicedRefundHead = sealDecision({
      ...decisionBase(),
      evidence: decisionBase().evidence.map((item) =>
        item.evidenceKind === "refund-ledger"
          ? {
              ...item,
              refundDecision: {
                ...(item.refundDecision ?? {}),
                headId: "refund.head.other",
              },
            }
          : item,
      ),
      status: "ineligible",
      reasonCode: "refund-or-dispute-blocks-access",
    });
    expect(() =>
      parseAuthorityDecision(
        splicedRefundHead.decision,
        splicedRefundHead.context,
      ),
    ).toThrow();
  });

  it("never creates an eligible lease from missing or cross-subject purchase evidence", () => {
    const sealed = sealDecision({
      ...decisionBase(),
      status: "eligible",
      reasonCode: "all-required-evidence-current",
      lease: {
        leaseId: "lease.1",
        issuedAt: "2026-08-14T12:02:00.000Z",
        expiresAt: "2026-08-14T12:05:00.000Z",
        authorityGenerationId: null,
      },
    });
    expect(() =>
      parseAuthorityDecision(
        { ...sealed.decision, evidence: [evidence()] },
        sealed.context,
      ),
    ).toThrow();
    expect(() =>
      parseAuthorityDecision({
        ...sealed.decision,
        evidence: decisionBase().evidence.map((item) =>
          item.evidenceKind === "purchase-beneficiary"
            ? { ...item, subjectAccount: ADDRESS_A }
          : item,
        ),
      }, sealed.context),
    ).toThrow();
  });

  it("maps each project-staff action to one exact delegated capability", () => {
    const currentRequest = gateRequest();
    const staffResource = {
      kind: "project-staff" as const,
      project: project() as never,
      requiredCapability: "support:send-messages" as const,
    };
    const resourceDigest = computeAuthorityResourceDigest(staffResource);
    const withoutInput = {
      requestId: currentRequest.requestId,
      evaluatedAt: currentRequest.evaluatedAt,
      policyId: currentRequest.policyId,
      policyRevision: currentRequest.policyRevision,
      policyHash: currentRequest.policyHash,
      subject: currentRequest.subject,
      action: "purchase-support:send" as const,
      resource: staffResource,
      resourceDigest,
    };
    const valid = {
      ...withoutInput,
      inputDigest: computeAuthorityGateInputDigest(withoutInput),
    };
    expect(() => parseAuthorityGateRequest(valid)).not.toThrow();
    expect(() =>
      parseAuthorityGateRequest({
        ...valid,
        resource: {
          ...staffResource,
          requiredCapability: "fulfillment:set-tracking",
        },
      }),
    ).toThrow();
    expect(() =>
      parseAuthorityGateRequest({
        ...valid,
        action: "announcement:publish",
      }),
    ).toThrow();
  });

  it("parses privacy-minimized audit records and rejects raw-sensitive-data claims", () => {
    const sealed = sealDecision({
      ...decisionBase(),
      status: "ineligible",
      reasonCode: "item-not-purchased",
    });
    expect(
      parseAuthorityAuditRecord(sealed.auditRecord, sealed.decision, {
        auditSignerKeyId: sealed.context.expectedAuditSignerKeyId,
        priorAuditHeadDigest: sealed.context.expectedPriorAuditHeadDigest,
      }),
    ).toMatchObject({
      rawSensitiveData: "not-recorded",
    });
    expect(() =>
      parseAuthorityAuditRecord(
        { ...sealed.auditRecord, rawSensitiveData: "included" },
        sealed.decision,
        {
          auditSignerKeyId: sealed.context.expectedAuditSignerKeyId,
          priorAuditHeadDigest: sealed.context.expectedPriorAuditHeadDigest,
        },
      ),
    ).toThrow();
    expect(() =>
      parseAuthorityAuditRecord(
        { ...sealed.auditRecord, signature: `0x${"11".repeat(65)}` },
        sealed.decision,
        {
          auditSignerKeyId: sealed.context.expectedAuditSignerKeyId,
          priorAuditHeadDigest: sealed.context.expectedPriorAuditHeadDigest,
        },
      ),
    ).toThrow();
  });

  it("atomically gives exactly one verifier a terminal challenge claim", async () => {
    const store = new TerminalClaimStore();
    const input = {
      challengeId: parseAuthorityId("challenge.1"),
      claimId: parseAuthorityId("claim.1"),
      claimedAt: parseCanonicalInstant("2026-08-14T12:01:00.000Z"),
    };
    const results = await Promise.all([
      store.claimForVerification(input),
      store.claimForVerification({ ...input, claimId: parseAuthorityId("claim.2") }),
    ]);
    expect(results.filter(({ status }) => status === "claimed")).toHaveLength(1);
    expect(
      results.filter(({ status }) => status === "already-claimed-or-consumed"),
    ).toHaveLength(1);
  });

  it("never reopens a claim after a crash or an invalid signature outcome", async () => {
    const crashed = new TerminalClaimStore();
    const claimInput = {
      challengeId: parseAuthorityId("challenge.1"),
      claimId: parseAuthorityId("claim.1"),
      claimedAt: parseCanonicalInstant("2026-08-14T12:01:00.000Z"),
    };
    await expect(crashed.claimForVerification(claimInput)).resolves.toMatchObject({
      status: "claimed",
      terminalEvenIfVerificationFails: true,
    });
    // Simulate process death: no outcome is recorded. The next process still loses.
    await expect(
      crashed.claimForVerification({
        ...claimInput,
        claimId: parseAuthorityId("claim.after-crash"),
      }),
    ).resolves.toEqual({ status: "already-claimed-or-consumed" });

    const invalid = new TerminalClaimStore();
    await invalid.claimForVerification(claimInput);
    await invalid.recordClaimOutcome();
    await expect(
      invalid.claimForVerification({
        ...claimInput,
        claimId: parseAuthorityId("claim.after-invalid"),
      }),
    ).resolves.toEqual({ status: "already-claimed-or-consumed" });
  });

  it("ships only unavailable production adapters and never creates authority or credentials", async () => {
    const ports = createUnavailableProductionAuthorityPorts();
    const challenge = parseWalletChallenge(siweChallenge());
    if (challenge.kind !== "siwe-erc4361-v1") throw new Error("wrong fixture");
    const policy = parseFinalityPolicy(finalityPolicy());
    const submission = parseWalletSignatureSubmission({
      kind: "wallet-signature-submission.v1",
      challengeId: "challenge.1",
      signature: `0x${"11".repeat(65)}`,
    });
    const enrollment = parseDeviceEnrollmentRequest(
      {
        kind: "device-enrollment-request.v1",
        enrollmentId: ENROLLMENT_ID,
        accountId: ACCOUNT_ID,
        deviceCredentialId: DEVICE_CREDENTIAL_ID,
        account: ADDRESS_A,
        chainId: 8453,
        walletChallengeId: WALLET_CHALLENGE_ID,
        possessionChallengeId: POSSESSION_CHALLENGE_ID,
        device: device(),
        possessionProof: {
          kind: "p256-es256-installation-possession.v1",
          enrollmentId: ENROLLMENT_ID,
          possessionChallengeId: POSSESSION_CHALLENGE_ID,
          installationId: INSTALLATION_ID,
          challengeDigest: devicePossessionChallenge().challengeDigest,
          signature: `${"S".repeat(85)}Q`,
        },
        requestedAt: "2026-08-14T12:01:00.000Z",
        displayLabel: "Phone",
      },
      {
        challenge,
        possessionChallenge: parseDevicePossessionChallenge(
          devicePossessionChallenge(),
        ),
      },
    );
    const claim = parseCanonicalPurchaseClaim({
      kind: "juicebox-v6-payment-beneficiary-claim.v1",
      claimId: "claim.payment.1",
      project: project(),
      transactionHash: hash("d"),
      payLogIndex: 7,
      expectedBeneficiary: ADDRESS_B,
      customerSubjectSource: "pay-beneficiary",
    });
    const purchaseExpectation = parseCanonicalPurchaseVerificationExpectation({
      claim,
      now: "2026-08-14T12:03:00.000Z",
      deployment: {
        deploymentManifestId: "deployments.base.v1",
        projectsContract: ADDRESS_C,
        adapterRevision: "juicebox-v6-receipt.v1",
        abiDigests: {
          pay: hash("0"),
          hookAfterRecordPay: hash("0"),
          tierMint: hash("0"),
        },
        terminal: {
          address: ADDRESS_TERMINAL,
          implementationCodeHash: hash("5"),
        },
        tierHook: null,
      },
    });
    const verifiedPurchase = parseCanonicalPurchaseVerificationResult(
      {
        status: "verified",
        claimId: claim.claimId,
        evidence: paymentEvidence(),
      },
      policy,
      purchaseExpectation,
    );
    if (verifiedPurchase.status !== "verified") throw new Error("wrong fixture");
    const refundExpectation = parseRefundLedgerExpectation({
      resource: {
        kind: "purchase-support",
        transactionHash: hash("d"),
        payLogIndex: 7,
      },
      authorityGenerationId: "generation.1",
      authorityGenerationSequence: "1",
      rootAuthorityEvidenceId: "root.1",
      rootAuthorityEvidenceDigest: hash("8"),
      rootSigner: ADDRESS_A,
      rootSignerProofDigest: hash("9"),
      issuerDeviceCredentialId: "credential.1",
      issuerWalletVerificationEvidenceId: "wallet-proof.1",
      policyId: "authority-policy.1",
      policyRevision: "1",
      lookupRequestId: "refund-lookup.1",
      lookupChallengeDigest: hash("a"),
      now: "2026-08-14T12:02:00.000Z",
      maximumHeadAgeMilliseconds: 300_000,
      latestObservedHead: null,
      refundAttestationDomainSeparatorDigest: hash("b"),
      attestationVerifierPolicyId: "refund-attestation-verifier.v1",
      attestationVerifierPolicyRevision: "1",
      attestationVerifierKeyId: "refund-attestation-key.1",
    }, verifiedPurchase);

    await expect(
      ports.challengeIssuer.issue({
        kind: "siwe-erc4361-v1",
        expectations: {
          challengeId: challenge.challengeId,
          possessionChallengeId: challenge.possessionChallengeId,
          enrollmentId: challenge.enrollmentId,
          accountId: challenge.accountId,
          deviceCredentialId: challenge.deviceCredentialId,
          account: parseEthereumAddress(ADDRESS_A),
          chainId: 8453,
          origin: parseHttpsOrigin("https://chat.example"),
          audience: parseHttpsOrigin("https://chat.example"),
          clientId: parseAuthorityId("client.web.v1"),
          scope:
            challenge.kind === "siwe-erc4361-v1"
              ? challenge.scope
              : (() => {
                  throw new Error("wrong fixture");
                })(),
          purpose: "device-enrollment",
          device: challenge.kind === "siwe-erc4361-v1"
            ? challenge.device
            : (() => { throw new Error("wrong fixture"); })(),
        },
        now: parseCanonicalInstant("2026-08-14T12:00:00.000Z"),
      }),
    ).resolves.toEqual({ status: "unavailable", reasonCode: "not-configured" });
    await expect(
      ports.walletSignatureVerifier.verify({
        challenge,
        winningClaim: {
          status: "claimed",
          challengeId: challenge.challengeId,
          claimId: parseAuthorityId("claim.1"),
          claimedAt: parseCanonicalInstant("2026-08-14T12:01:00.000Z"),
          terminalEvenIfVerificationFails: true,
        },
        submission,
        finalityPolicy: policy,
        now: parseCanonicalInstant("2026-08-14T12:01:00.000Z"),
      }),
    ).resolves.toMatchObject({ status: "unavailable", attemptedMethod: "not-dispatched" });
    await expect(ports.deviceEnrollment.enrollAtomically(enrollment)).resolves.toMatchObject({
      status: "unavailable",
    });
    await expect(
      ports.projectRootAuthorityVerifier.verify({
        project: claim.project,
        principal: parseEthereumAddress(ADDRESS_A),
        policy,
      }),
    ).resolves.toMatchObject({ status: "unavailable" });
    await expect(
      ports.chainFinalityVerifier.verifyReceiptCanonicality({
        chainId: 8453,
        transactionHash: parseHash32(hash("d")),
        policy,
        now: parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
      }),
    ).resolves.toMatchObject({ status: "unavailable" });
    await expect(
      ports.canonicalPurchaseVerifier.verify({
        expectation: purchaseExpectation,
        policy,
      }),
    ).resolves.toMatchObject({ status: "unavailable" });
    await expect(
      ports.refundLedger.lookup({ expectation: refundExpectation }),
    ).resolves.toMatchObject({ status: "unavailable" });
    await expect(
      ports.refundAttestationVerifier.verify(null as never),
    ).resolves.toEqual({
      status: "unavailable",
      attestationId: "unavailable.not-configured",
      reasonCode: "not-configured",
    });

    const result = await ports.decisionEngine.evaluate(gateRequest());
    expect(result).toEqual({
      status: "unavailable",
      requestId: "unavailable.not-configured",
      reasonCode: "authority-service-not-configured",
      decision: null,
      lease: null,
    });
  });

  it("keeps every unavailable default nonthrowing for hostile runtime input", async () => {
    const ports = createUnavailableProductionAuthorityPorts();
    const methods = [
      ports.challengeIssuer.issue,
      ports.challengeStore.claimForVerification,
      ports.challengeStore.recordClaimOutcome,
      ports.walletSignatureVerifier.verify,
      ports.devicePossessionChallengeIssuer.issueAndPersist,
      ports.deviceEnrollmentChallengeStore.claimPairForVerification,
      ports.devicePossessionVerifier.verify,
      ports.deviceEnrollment.enrollAtomically,
      ports.deviceCredentialSignatureVerifier.verify,
      ports.projectRootAuthorityVerifier.verify,
      ports.authorityTransitionScanner.scanFinalizedRange,
      ports.authorityGenerationStore.current,
      ports.authorityGenerationStore.applyFinalizedScanAtomically,
      ports.projectStaffVerifier.verify,
      ports.chainFinalityVerifier.verifyReceiptCanonicality,
      ports.canonicalPurchaseVerifier.verify,
      ports.refundLedger.lookup,
      ports.refundAttestationVerifier.verify,
      ports.auditSink.appendBeforeRelease,
      ports.revocationCoordinator.revokeAndEnqueueRekey,
      ports.decisionEngine.evaluate,
    ];
    for (const method of methods) {
      await expect(Reflect.apply(method, null, [null])).resolves.toMatchObject({
        status: "unavailable",
      });
    }
  });
});
