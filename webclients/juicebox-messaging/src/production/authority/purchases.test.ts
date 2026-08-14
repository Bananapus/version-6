import { describe, expect, it } from "vitest";
import { parseFinalityPolicy } from "./finality";
import {
  JUICEBOX_V6_EVENT_TOPICS,
  computeCanonicalPurchaseEvidenceDigest,
  computeCanonicalPurchaseEvidenceId,
  computeRefundEligibilityResourceDigest,
  computeRefundHeadCanonicalPayloadDigest,
  computeRefundRecordCanonicalPayloadDigest,
  computeRefundSignatureDigest,
  computeRefundStableHeadDigest,
  computeRefundVerificationEvidenceDigest,
  finalizeRefundLedgerResult,
  parseCanonicalPurchaseClaim,
  parseCanonicalPurchaseEvidence,
  parseCanonicalPurchaseVerificationExpectation,
  parseCanonicalPurchaseVerificationResult,
  parseRefundLedgerExpectation,
  parseRefundLedgerResult,
  prepareRefundLedgerResult,
} from "./purchases";
import {
  ADDRESS_A,
  ADDRESS_B,
  ADDRESS_C,
  ADDRESS_D,
  ADDRESS_HOOK,
  ADDRESS_TERMINAL,
  finalityPolicy,
  hash,
  paymentEvidence,
  paymentPurchaseExpectation,
  project,
  tierMintLog,
  tierPurchaseEvidence,
  tierPurchaseExpectation,
} from "./fixtures.testing";
import { parseHexBytes } from "./valueObjects";

function paymentExpectation() {
  return parseCanonicalPurchaseVerificationExpectation(
    paymentPurchaseExpectation(),
  );
}

function tierExpectation() {
  return parseCanonicalPurchaseVerificationExpectation(tierPurchaseExpectation());
}

function verifiedRefundPurchase() {
  const expected = tierExpectation();
  const result = parseCanonicalPurchaseVerificationResult(
    {
      status: "verified",
      claimId: expected.claim.claimId,
      evidence: tierPurchaseEvidence(),
    },
    parseFinalityPolicy(finalityPolicy()),
    expected,
  );
  if (result.status !== "verified") throw new Error("wrong purchase fixture");
  return result;
}

const REFUND_PURCHASE = verifiedRefundPurchase();
const REFUND_RESOURCE = {
  kind: "tier-fulfillment",
  tierId: "1",
  tokenId: "1000000001",
} as const;

function refundExpectation(
  options: {
    now?: string;
    maximumHeadAgeMilliseconds?: number;
    latestObservedHead?: unknown;
    resource?: unknown;
  } = {},
) {
  return parseRefundLedgerExpectation({
    resource: options.resource ?? REFUND_RESOURCE,
    authorityGenerationId: "generation.1",
    authorityGenerationSequence: "1",
    rootAuthorityEvidenceId: "root.1",
    rootAuthorityEvidenceDigest: hash("8"),
    rootSigner: ADDRESS_A,
    rootSignerProofDigest: hash("9"),
    issuerDeviceCredentialId: "credential.1",
    issuerWalletVerificationEvidenceId: "wallet-proof.1",
    policyId: "refund-policy.1",
    policyRevision: "1",
    lookupRequestId: "refund-lookup.1",
    lookupChallengeDigest: hash("6"),
    now: options.now ?? "2026-08-14T13:02:00.000Z",
    maximumHeadAgeMilliseconds: options.maximumHeadAgeMilliseconds ?? 300_000,
    latestObservedHead: options.latestObservedHead ?? null,
    refundAttestationDomainSeparatorDigest: hash("4"),
    attestationVerifierPolicyId: "refund-signature-verifier-policy.1",
    attestationVerifierPolicyRevision: "1",
    attestationVerifierKeyId: "refund-signature-verifier-key.1",
  }, REFUND_PURCHASE);
}

const REFUND_SIGNATURE = parseHexBytes(`0x${"ab".repeat(65)}`);

function refundAttestation(
  kind: "record" | "head",
  canonicalPayloadDigest: ReturnType<typeof computeRefundRecordCanonicalPayloadDigest>,
  ledgerSequence: string,
) {
  return {
    kind: "refund-attestation-signature-envelope.v1",
    attestationId: kind === "record" ? "refund-attestation.record.1" : "refund-attestation.head.1",
    attestationKind: kind,
    attestationDomain: "juicebox-messaging-refund-ledger-v1",
    signatureScheme: "eip712-v4",
    primaryType:
      kind === "record" ? "JuiceboxRefundLedgerRecord" : "JuiceboxRefundLedgerHead",
    payloadBinding:
      kind === "record"
        ? "canonical-record-payload"
        : "canonical-head-payload-including-lookup-challenge",
    attestationDomainSeparatorDigest: hash("4"),
    canonicalPayloadDigest,
    signature: REFUND_SIGNATURE,
    signatureDigest: computeRefundSignatureDigest(REFUND_SIGNATURE),
    claimedSigner: ADDRESS_A,
    issuerDeviceCredentialId: "credential.1",
    ledgerSequence,
    authorityGenerationId: "generation.1",
    authorityGenerationSequence: "1",
    rootAuthorityEvidenceId: "root.1",
    rootAuthorityEvidenceDigest: hash("8"),
  };
}

function refundRecord(
  options: {
    purchaseUpheld?: boolean;
    effectiveAt?: string;
    recordedAt?: string;
    priorLedgerHeadDigest?: string;
  } = {},
) {
  const payload = {
    kind: "signed-business-refund-ledger-record.v1",
    refundRecordId: "refund.1",
    project: project(),
    purchaseEvidenceId: REFUND_PURCHASE.evidence.evidenceId,
    purchaseEvidenceDigest: REFUND_PURCHASE.evidence.evidenceDigest,
    ledgerSequence: "5",
    orderCaseRevision: options.purchaseUpheld ? "2" : "1",
    priorLedgerHeadDigest: options.priorLedgerHeadDigest ?? hash("e"),
    state: options.purchaseUpheld ? "dispute-resolved" : "refund-recorded",
    resolution: options.purchaseUpheld ? "purchase-upheld" : "refund",
    eligibilityEffect: options.purchaseUpheld ? "clear" : "block",
    scope: {
      kind: "exact-tier-items",
      items: [{ tierId: "1", tokenId: "1000000001" }],
    },
    refundAmount: options.purchaseUpheld
      ? null
      : {
          kind: "partial",
          amount: {
            token: ADDRESS_D,
            decimals: 18,
            currency: "1",
            value: "50",
          },
        },
    businessSigner: ADDRESS_A,
    issuerDeviceCredentialId: "credential.1",
    issuerWalletVerificationEvidenceId: "wallet-proof.1",
    rootAuthorityEvidenceId: "root.1",
    rootAuthorityEvidenceDigest: hash("8"),
    rootSignerProofDigest: hash("9"),
    authorityGenerationId: "generation.1",
    authorityGenerationSequence: "1",
    effectiveAt: options.effectiveAt ?? "2026-08-14T12:59:00.000Z",
    recordedAt: options.recordedAt ?? "2026-08-14T13:00:00.000Z",
    policyId: "refund-policy.1",
    policyRevision: "1",
    auditRecordId: "audit.1",
    source: "offchain-business-ledger",
    chainEventInference: "forbidden",
  };
  return {
    ...payload,
    attestation: refundAttestation(
      "record",
      computeRefundRecordCanonicalPayloadDigest(payload),
      payload.ledgerSequence,
    ),
  };
}

function buildRefundHead(input: {
  record:
    | {
        refundRecordId: string;
        recordedAt: string;
        eligibilityEffect: string;
        attestation: { canonicalPayloadDigest: string };
      }
    | null;
  headId: string;
  sequence: string;
  priorHeadDigest: string;
  ledgerRecordedAt: string;
  eligibilityEffect: string;
  currentStatus: "recorded" | "no-applicable-entry";
  auditRecordId: string;
}) {
  const stableHead = {
    kind: "refund-ledger-stable-head.v1",
    headId: input.headId,
    project: project(),
    purchaseEvidenceId: REFUND_PURCHASE.evidence.evidenceId,
    purchaseEvidenceDigest: REFUND_PURCHASE.evidence.evidenceDigest,
    resource: REFUND_RESOURCE,
    resourceDigest: refundExpectation().resourceDigest,
    sequence: input.sequence,
    priorHeadDigest: input.priorHeadDigest,
    currentStatus: input.currentStatus,
    currentRecordId: input.record?.refundRecordId ?? null,
    currentRecordDigest: input.record?.attestation.canonicalPayloadDigest ?? null,
    eligibilityEffect: input.eligibilityEffect,
    businessSigner: ADDRESS_A,
    issuerDeviceCredentialId: "credential.1",
    issuerWalletVerificationEvidenceId: "wallet-proof.1",
    rootAuthorityEvidenceId: "root.1",
    rootAuthorityEvidenceDigest: hash("8"),
    rootSignerProofDigest: hash("9"),
    authorityGenerationId: "generation.1",
    authorityGenerationSequence: "1",
    ledgerRecordedAt: input.ledgerRecordedAt,
    policyId: "refund-policy.1",
    policyRevision: "1",
    auditRecordId: input.auditRecordId,
  };
  const payload = {
    kind: "signed-business-refund-ledger-head.v1",
    headId: input.headId,
    project: project(),
    purchaseEvidenceId: REFUND_PURCHASE.evidence.evidenceId,
    purchaseEvidenceDigest: REFUND_PURCHASE.evidence.evidenceDigest,
    resource: REFUND_RESOURCE,
    resourceDigest: refundExpectation().resourceDigest,
    sequence: input.sequence,
    priorHeadDigest: input.priorHeadDigest,
    headDigest: computeRefundStableHeadDigest(stableHead),
    lookupRequestId: "refund-lookup.1",
    lookupChallengeDigest: hash("6"),
    currentStatus: input.currentStatus,
    currentRecordId: input.record?.refundRecordId ?? null,
    currentRecordDigest: input.record?.attestation.canonicalPayloadDigest ?? null,
    eligibilityEffect: input.eligibilityEffect,
    businessSigner: ADDRESS_A,
    issuerDeviceCredentialId: "credential.1",
    issuerWalletVerificationEvidenceId: "wallet-proof.1",
    rootAuthorityEvidenceId: "root.1",
    rootAuthorityEvidenceDigest: hash("8"),
    rootSignerProofDigest: hash("9"),
    authorityGenerationId: "generation.1",
    authorityGenerationSequence: "1",
    ledgerRecordedAt: input.ledgerRecordedAt,
    signedAt: "2026-08-14T13:01:20.000Z",
    policyId: "refund-policy.1",
    policyRevision: "1",
    auditRecordId: input.auditRecordId,
  };
  return {
    ...payload,
    attestation: refundAttestation(
      "head",
      computeRefundHeadCanonicalPayloadDigest(payload),
      payload.sequence,
    ),
  };
}

function recordedRefundHead(record = refundRecord()) {
  return buildRefundHead({
    record,
    headId: "refund-head.5",
    sequence: "5",
    priorHeadDigest: hash("e"),
    ledgerRecordedAt: record.recordedAt,
    eligibilityEffect: record.eligibilityEffect as "clear" | "block",
    currentStatus: "recorded",
    auditRecordId: "audit.head.5",
  });
}

function clearNoEntryRefundHead() {
  return buildRefundHead({
    record: null,
    headId: "refund-head.6",
    sequence: "6",
    priorHeadDigest: recordedRefundHead().headDigest,
    ledgerRecordedAt: "2026-08-14T13:01:00.000Z",
    currentStatus: "no-applicable-entry",
    eligibilityEffect: "clear",
    auditRecordId: "audit.head.6",
  });
}

function disputeOpenRecord() {
  const base = refundRecord();
  const { attestation: _ignored, ...payload } = base;
  void _ignored;
  const openPayload = {
    ...payload,
    refundRecordId: "refund.dispute.1",
    ledgerSequence: "4",
    orderCaseRevision: "1",
    priorLedgerHeadDigest: hash("d"),
    state: "dispute-open",
    resolution: null,
    eligibilityEffect: "block",
    refundAmount: null,
    effectiveAt: "2026-08-14T12:57:00.000Z",
    recordedAt: "2026-08-14T12:58:00.000Z",
    auditRecordId: "audit.dispute.1",
  } as const;
  return {
    ...openPayload,
    attestation: refundAttestation(
      "record",
      computeRefundRecordCanonicalPayloadDigest(openPayload),
      openPayload.ledgerSequence,
    ),
  };
}

function disputeOpenHead(record = disputeOpenRecord()) {
  return buildRefundHead({
    record,
    headId: "refund-head.4",
    sequence: "4",
    priorHeadDigest: hash("d"),
    ledgerRecordedAt: record.recordedAt,
    eligibilityEffect: "block",
    currentStatus: "recorded",
    auditRecordId: "audit.head.4",
  });
}

function observedRefundSnapshot(
  head: ReturnType<typeof buildRefundHead>,
  record:
    | ReturnType<typeof refundRecord>
    | ReturnType<typeof disputeOpenRecord>
    | null,
) {
  return {
    resourceDigest: head.resourceDigest,
    sequence: head.sequence,
    headDigest: head.headDigest,
    ledgerRecordedAt: head.ledgerRecordedAt,
    currentStatus: head.currentStatus,
    currentRecordId: head.currentRecordId,
    currentRecordDigest: head.currentRecordDigest,
    eligibilityEffect: head.eligibilityEffect,
    currentCase:
      record === null
        ? null
        : {
            orderCaseRevision: record.orderCaseRevision,
            state: record.state,
            resolution: record.resolution,
            scope: record.scope,
          },
  };
}

function verifiedHeadAttestation(head: ReturnType<typeof recordedRefundHead>) {
  const verification = {
    attestationId: head.attestation.attestationId,
    attestationKind: "head",
    primaryType: "JuiceboxRefundLedgerHead",
    verificationEvidenceId: "refund-verification.head.1",
    attestationDomain: "juicebox-messaging-refund-ledger-v1",
    signatureScheme: "eip712-v4",
    attestationDomainSeparatorDigest: hash("4"),
    canonicalPayloadDigest: head.attestation.canonicalPayloadDigest,
    signatureDigest: head.attestation.signatureDigest,
    signer: ADDRESS_A,
    issuerDeviceCredentialId: "credential.1",
    project: project(),
    purchaseEvidenceId: REFUND_PURCHASE.evidence.evidenceId,
    purchaseEvidenceDigest: REFUND_PURCHASE.evidence.evidenceDigest,
    resourceDigest: refundExpectation().resourceDigest,
    ledgerSequence: head.sequence,
    lookupRequestId: "refund-lookup.1",
    authorityGenerationId: "generation.1",
    authorityGenerationSequence: "1",
    rootAuthorityEvidenceId: "root.1",
    rootAuthorityEvidenceDigest: hash("8"),
    refundPolicyId: "refund-policy.1",
    refundPolicyRevision: "1",
    verifierPolicyId: "refund-signature-verifier-policy.1",
    verifierPolicyRevision: "1",
    verifierKeyId: "refund-signature-verifier-key.1",
    verificationMethod: "eoa-ecrecover",
    verifiedAt: "2026-08-14T13:01:40.000Z",
  };
  return {
    status: "verified",
    ...verification,
    verificationEvidenceDigest: computeRefundVerificationEvidenceDigest({
      kind: "verified-refund-attestation-evidence.v1",
      ...verification,
    }),
  };
}

function verifiedRecordAttestation(record: ReturnType<typeof refundRecord>) {
  const headVerification = verifiedHeadAttestation(recordedRefundHead(record));
  const verification = {
    attestationDomain: headVerification.attestationDomain,
    signatureScheme: headVerification.signatureScheme,
    attestationDomainSeparatorDigest:
      headVerification.attestationDomainSeparatorDigest,
    signer: headVerification.signer,
    issuerDeviceCredentialId: headVerification.issuerDeviceCredentialId,
    project: headVerification.project,
    purchaseEvidenceId: headVerification.purchaseEvidenceId,
    purchaseEvidenceDigest: headVerification.purchaseEvidenceDigest,
    resourceDigest: headVerification.resourceDigest,
    authorityGenerationId: headVerification.authorityGenerationId,
    authorityGenerationSequence: headVerification.authorityGenerationSequence,
    rootAuthorityEvidenceId: headVerification.rootAuthorityEvidenceId,
    rootAuthorityEvidenceDigest: headVerification.rootAuthorityEvidenceDigest,
    refundPolicyId: headVerification.refundPolicyId,
    refundPolicyRevision: headVerification.refundPolicyRevision,
    verifierPolicyId: headVerification.verifierPolicyId,
    verifierPolicyRevision: headVerification.verifierPolicyRevision,
    verifierKeyId: headVerification.verifierKeyId,
    verificationMethod: headVerification.verificationMethod,
    verifiedAt: headVerification.verifiedAt,
    attestationId: record.attestation.attestationId,
    attestationKind: "record",
    primaryType: "JuiceboxRefundLedgerRecord",
    verificationEvidenceId: "refund-verification.record.1",
    canonicalPayloadDigest: record.attestation.canonicalPayloadDigest,
    signatureDigest: record.attestation.signatureDigest,
    ledgerSequence: record.ledgerSequence,
    lookupRequestId: null,
  };
  return {
    status: "verified",
    ...verification,
    verificationEvidenceDigest: computeRefundVerificationEvidenceDigest({
      kind: "verified-refund-attestation-evidence.v1",
      ...verification,
    }),
  };
}

function refundVerificationBundle(
  head: ReturnType<typeof recordedRefundHead>,
  record: ReturnType<typeof refundRecord> | null,
) {
  return {
    head: verifiedHeadAttestation(head),
    currentRecord: record === null ? null : verifiedRecordAttestation(record),
  };
}

function resignRefundRecord(
  source: ReturnType<typeof refundRecord>,
  changes: Record<string, unknown>,
) {
  const { attestation: _ignored, ...payload } = structuredClone(source);
  void _ignored;
  Object.assign(payload, changes);
  return {
    ...payload,
    attestation: refundAttestation(
      "record",
      computeRefundRecordCanonicalPayloadDigest(payload),
      payload.ledgerSequence,
    ),
  };
}

describe("canonical Juicebox v6 purchase evidence", () => {
  it("pins the exact overloaded event topics and keeps non-purchase topics distinct", () => {
    expect(JUICEBOX_V6_EVENT_TOPICS).toEqual({
      pay: "0x133161f1c9161488f777ab9a26aae91d47c0d9a3fafb398960f138db02c73797",
      hookAfterRecordPay:
        "0xb1ed2cd5f80d2005b57f16c4c1a1c8ee500b96725924cad83e44f32f05f400c0",
      controllerMintTokens:
        "0xe6fee9c572244c0c2238c3112ac12d411750a7ee00eeebd32521c3e5a666c14b",
      jbTokensMint:
        "0x0153be209252ccc3b70df14d55d2cc93fa5a74e263b163d9a1caf45152fd0e86",
      tierMint:
        "0x598baf7bf150ca2f42be9e9f8f55e81d45f5715c3ff22bf46d697fabec7f31d6",
      tierReservedMint:
        "0x80dd2efbbc431cde0164d84d638e44ba6e7a3ca5d532ceef1bb4efcc0948325d",
      cashOutTokens:
        "0xfaf1d4bf1b08470c7ed8c351c5065f51af70b36b237723173f898453b9724142",
    });
    expect(new Set(Object.values(JUICEBOX_V6_EVENT_TOPICS)).size).toBe(7);
  });

  it("uses Pay.beneficiary as the sole default customer", () => {
    const policy = parseFinalityPolicy(finalityPolicy());
    const evidence = parseCanonicalPurchaseEvidence(
      paymentEvidence(),
      policy,
      paymentExpectation(),
    );
    expect(evidence).toMatchObject({
      customerAccount: ADDRESS_B,
      customerSubjectSource: "pay-beneficiary",
      payerAttribution: "not-evaluated",
      transactionSenderAttribution: "never-inferred",
      callerAttribution: "never-inferred",
      pay: {
        payer: ADDRESS_A,
        beneficiary: ADDRESS_B,
        caller: ADDRESS_C,
        amount: "100",
        accountingContext: "not-contained-in-pay-event",
      },
    });
    expect(() =>
      parseCanonicalPurchaseEvidence(
        { ...paymentEvidence(), customerAccount: ADDRESS_A },
        policy,
        paymentExpectation(),
      ),
    ).toThrow();
    expect(() =>
      parseCanonicalPurchaseEvidence(
        { ...paymentEvidence(), customerAccount: ADDRESS_C },
        policy,
        paymentExpectation(),
      ),
    ).toThrow();
    expect(evidence).not.toHaveProperty("transactionFrom");
    expect(() =>
      parseCanonicalPurchaseEvidence(
        {
          ...paymentEvidence(),
          receipt: {
            ...paymentEvidence().receipt,
            canonicalityCheckedAt: "2099-01-01T00:00:00.000Z",
          },
        },
        policy,
        paymentExpectation(),
      ),
    ).toThrow();
    const zero = paymentEvidence();
    zero.pay.amount = "0";
    expect(() =>
      parseCanonicalPurchaseEvidence(zero, policy, paymentExpectation()),
    ).toThrow();
  });

  it("requires an explicit Pay logIndex even when the transaction is known", () => {
    expect(
      parseCanonicalPurchaseClaim({
        kind: "juicebox-v6-payment-beneficiary-claim.v1",
        claimId: "claim.1",
        project: project(),
        transactionHash: hash("d"),
        payLogIndex: 7,
        expectedBeneficiary: ADDRESS_B,
        customerSubjectSource: "pay-beneficiary",
      }),
    ).toMatchObject({ payLogIndex: 7 });
    expect(() =>
      parseCanonicalPurchaseClaim({
        kind: "juicebox-v6-payment-beneficiary-claim.v1",
        claimId: "claim.1",
        project: project(),
        transactionHash: hash("d"),
        expectedBeneficiary: ADDRESS_B,
        customerSubjectSource: "pay-beneficiary",
      }),
    ).toThrow();
  });

  it("requires explicit unique same-receipt Pay, after-pay, and Mint indices", () => {
    expect(
      parseCanonicalPurchaseClaim({
        kind: "juicebox-v6-tier-purchase-claim.v1",
        claimId: "claim.2",
        project: project(),
        transactionHash: hash("d"),
        payLogIndex: 7,
        afterPayHookLogIndex: 10,
        mintLogIndices: [8, 9],
        expectedBeneficiary: ADDRESS_B,
        customerSubjectSource: "pay-beneficiary",
      }),
    ).toMatchObject({ mintLogIndices: [8, 9] });
    for (const mintLogIndices of [[7], [10], [9, 8], [], [8, 8]]) {
      expect(() =>
        parseCanonicalPurchaseClaim({
          kind: "juicebox-v6-tier-purchase-claim.v1",
          claimId: "claim.2",
          project: project(),
          transactionHash: hash("d"),
          payLogIndex: 7,
          afterPayHookLogIndex: 10,
          mintLogIndices,
          expectedBeneficiary: ADDRESS_B,
          customerSubjectSource: "pay-beneficiary",
        }),
      ).toThrow();
    }
  });

  it("correlates a tier purchase without equating Mint.totalAmountPaid to Pay.amount", () => {
    const policy = parseFinalityPolicy(finalityPolicy());
    const evidence = parseCanonicalPurchaseEvidence(
      tierPurchaseEvidence(),
      policy,
      tierExpectation(),
    );
    expect(evidence).toMatchObject({
      kind: "juicebox-v6-tier-purchase-evidence.v1",
      correlationEvidence: {
        kind: "canonical-exclusive-receipt-call-trace-correlation.v1",
        inventoryScope: "entire-receipt-expected-emitters",
      },
      customerAccount: ADDRESS_B,
      pay: { amount: "0" },
      mints: [
        {
          totalAmountPaid: "999",
          comparisonToPayAmount: "not-used-for-correlation",
        },
      ],
    });
  });

  it("derives purchase identity and digest from the exact server claim", () => {
    const policy = parseFinalityPolicy(finalityPolicy());
    const expected = tierExpectation();
    const evidence = parseCanonicalPurchaseEvidence(
      tierPurchaseEvidence(),
      policy,
      expected,
    );
    const { evidenceDigest, ...canonicalEvidence } = evidence;
    expect(evidence.evidenceId).toBe(
      computeCanonicalPurchaseEvidenceId(expected.claim),
    );
    expect(evidenceDigest).toBe(
      computeCanonicalPurchaseEvidenceDigest({
        claim: expected.claim,
        deployment: expected.deployment,
        evidence: canonicalEvidence,
      }),
    );

    expect(() =>
      parseCanonicalPurchaseEvidence(
        { ...tierPurchaseEvidence(), evidenceId: "purchase:relabelled" },
        policy,
        expected,
      ),
    ).toThrow(/canonically derived/);

    const otherClaim = parseCanonicalPurchaseVerificationExpectation({
      ...tierPurchaseExpectation(),
      claim: { ...tierPurchaseExpectation().claim, claimId: "claim.tier.other" },
    });
    expect(() =>
      parseCanonicalPurchaseEvidence(
        tierPurchaseEvidence(),
        policy,
        otherClaim,
      ),
    ).toThrow(/canonically derived/);

    expect(() =>
      parseCanonicalPurchaseEvidence(
        { ...tierPurchaseEvidence(), evidenceDigest: hash("f") },
        policy,
        expected,
      ),
    ).toThrow(/unexpected shape/);
  });

  it.each([
    JUICEBOX_V6_EVENT_TOPICS.tierReservedMint,
    JUICEBOX_V6_EVENT_TOPICS.controllerMintTokens,
    JUICEBOX_V6_EVENT_TOPICS.jbTokensMint,
    JUICEBOX_V6_EVENT_TOPICS.cashOutTokens,
  ])("never accepts non-payment topic %s as a tier Mint", (topic0) => {
    const policy = parseFinalityPolicy(finalityPolicy());
    const fixture = tierPurchaseEvidence();
    fixture.mints = [
      {
        ...tierMintLog(),
        log: { ...tierMintLog().log, topic0 },
      },
    ];
    expect(() =>
      parseCanonicalPurchaseEvidence(fixture, policy, tierExpectation()),
    ).toThrow();
  });

  it("rejects cross-receipt, wrong-terminal, wrong-hook, and beneficiary mismatches", () => {
    const policy = parseFinalityPolicy(finalityPolicy());
    const fixtures = [
      (() => {
        const value = tierPurchaseEvidence();
        value.afterPayHook.log.transactionHash = hash("f");
        return value;
      })(),
      (() => {
        const value = tierPurchaseEvidence();
        value.pay.log.emitter = ADDRESS_D;
        return value;
      })(),
      (() => {
        const value = tierPurchaseEvidence();
        value.afterPayHook.log.emitter = ADDRESS_HOOK;
        return value;
      })(),
      (() => {
        const value = tierPurchaseEvidence();
        value.mints[0].log.emitter = ADDRESS_TERMINAL;
        return value;
      })(),
      (() => {
        const value = tierPurchaseEvidence();
        value.mints[0].beneficiary = ADDRESS_A;
        return value;
      })(),
      (() => {
        const value = tierPurchaseEvidence();
        value.afterPayHook.hook = ADDRESS_TERMINAL;
        return value;
      })(),
      (() => {
        const value = tierPurchaseEvidence();
        value.tierHook.hook = ADDRESS_TERMINAL;
        return value;
      })(),
      (() => {
        const value = tierPurchaseEvidence();
        value.pay.log.removed = true;
        return value;
      })(),
    ];
    for (const fixture of fixtures) {
      expect(() =>
        parseCanonicalPurchaseEvidence(fixture, policy, tierExpectation()),
      ).toThrow();
    }
  });

  it("rejects invented Pay accounting context and impossible hook accounting values", () => {
    const policy = parseFinalityPolicy(finalityPolicy());
    const invented = paymentEvidence();
    invented.pay.accountingContext = "ETH";
    expect(() =>
      parseCanonicalPurchaseEvidence(invented, policy, paymentExpectation()),
    ).toThrow();

    const excessiveCurrency = tierPurchaseEvidence();
    excessiveCurrency.afterPayHook.amount.currency = "4294967296";
    expect(() =>
      parseCanonicalPurchaseEvidence(excessiveCurrency, policy, tierExpectation()),
    ).toThrow();

    const excessiveDecimals = tierPurchaseEvidence();
    excessiveDecimals.afterPayHook.amount.decimals = 256;
    expect(() =>
      parseCanonicalPurchaseEvidence(excessiveDecimals, policy, tierExpectation()),
    ).toThrow();
  });

  it("binds every verified result to the exact server claim and claimed receipt fields", () => {
    const policy = parseFinalityPolicy(finalityPolicy());
    const expected = tierExpectation();
    const verified = {
      status: "verified",
      claimId: expected.claim.claimId,
      evidence: tierPurchaseEvidence(),
    };
    expect(
      parseCanonicalPurchaseVerificationResult(verified, policy, expected),
    ).toMatchObject({
      status: "verified",
      claimId: "claim.tier.1",
      evidence: {
        project: project(),
        customerAccount: ADDRESS_B,
        receipt: { transactionHash: hash("d") },
        pay: { log: { logIndex: 7 } },
        afterPayHook: { log: { logIndex: 10 } },
        mints: [{ log: { logIndex: 9 } }],
      },
    });

    expect(() =>
      parseCanonicalPurchaseVerificationResult(
        { ...verified, claimId: "claim.attacker" },
        policy,
        expected,
      ),
    ).toThrow();

    const swaps = [
      (() => {
        const value = tierPurchaseEvidence();
        value.receipt.transactionHash = hash("f");
        value.pay.log.transactionHash = hash("f");
        value.afterPayHook.log.transactionHash = hash("f");
        value.mints[0].log.transactionHash = hash("f");
        value.correlationEvidence.transactionHash = hash("f");
        return value;
      })(),
      (() => {
        const value = tierPurchaseEvidence();
        value.pay.log.logIndex = 8;
        value.correlationEvidence.allRelevantPayLogIndices = [8];
        value.correlationEvidence.terminalFrame.relevantEmittedLogIndices = [8, 10];
        return value;
      })(),
      (() => {
        const value = tierPurchaseEvidence();
        value.afterPayHook.log.logIndex = 11;
        value.correlationEvidence.allRelevantHookAfterRecordPayLogIndices = [11];
        value.correlationEvidence.terminalFrame.relevantEmittedLogIndices = [7, 11];
        return value;
      })(),
      (() => {
        const value = tierPurchaseEvidence();
        value.mints[0].log.logIndex = 8;
        value.correlationEvidence.allRelevantTierMintLogIndices = [8];
        value.correlationEvidence.tierHookFrame.relevantEmittedLogIndices = [8];
        return value;
      })(),
      (() => {
        const value = tierPurchaseEvidence();
        value.pay.beneficiary = ADDRESS_A;
        value.afterPayHook.beneficiary = ADDRESS_A;
        value.mints[0].beneficiary = ADDRESS_A;
        value.customerAccount = ADDRESS_A;
        return value;
      })(),
      (() => {
        const value = tierPurchaseEvidence();
        value.project = { ...project(), projectId: 10 };
        value.pay.project = { ...project(), projectId: 10 };
        value.afterPayHook.project = { ...project(), projectId: 10 };
        value.terminal.project = { ...project(), projectId: 10 };
        value.tierHook.project = { ...project(), projectId: 10 };
        value.tierHook.projectIdResult = 10;
        return value;
      })(),
    ];
    for (const evidence of swaps) {
      expect(() =>
        parseCanonicalPurchaseVerificationResult(
          { ...verified, evidence },
          policy,
          expected,
        ),
      ).toThrow();
    }

    for (const statusResult of [
      {
        status: "ineligible",
        claimId: "claim.attacker",
        reasonCode: "beneficiary-mismatch",
      },
      {
        status: "pending-finality",
        claimId: "claim.attacker",
        reasonCode: "receipt-above-finalized-head",
      },
      {
        status: "unavailable",
        claimId: "claim.attacker",
        reasonCode: "rpc-unavailable",
      },
    ]) {
      expect(() =>
        parseCanonicalPurchaseVerificationResult(statusResult, policy, expected),
      ).toThrow();
    }
  });

  it("uses trusted deployment, adapter, ABI, terminal, and tier-hook expectations", () => {
    const policy = parseFinalityPolicy(finalityPolicy());
    const cases = [
      (() => {
        const value = tierPurchaseEvidence();
        value.receipt.adapterRevision = "attacker-adapter.v1";
        for (const log of [value.pay.log, value.afterPayHook.log, value.mints[0].log]) {
          log.adapterRevision = "attacker-adapter.v1";
        }
        value.correlationEvidence.adapterRevision = "attacker-adapter.v1";
        return value;
      })(),
      (() => {
        const value = tierPurchaseEvidence();
        value.pay.log.abiDigest = hash("f");
        return value;
      })(),
      (() => {
        const value = tierPurchaseEvidence();
        value.terminal.implementationCodeHash = hash("f");
        return value;
      })(),
      (() => {
        const value = tierPurchaseEvidence();
        value.tierHook.implementationCodeHash = hash("f");
        return value;
      })(),
      (() => {
        const value = tierPurchaseEvidence();
        value.project.deploymentManifestId = "deployments.attacker.v1";
        value.pay.project.deploymentManifestId = "deployments.attacker.v1";
        value.afterPayHook.project.deploymentManifestId = "deployments.attacker.v1";
        value.terminal.project.deploymentManifestId = "deployments.attacker.v1";
        value.tierHook.project.deploymentManifestId = "deployments.attacker.v1";
        value.receipt.deploymentManifestId = "deployments.attacker.v1";
        value.terminal.deploymentManifestId = "deployments.attacker.v1";
        value.tierHook.deploymentManifestId = "deployments.attacker.v1";
        return value;
      })(),
    ];
    for (const value of cases) {
      expect(() =>
        parseCanonicalPurchaseEvidence(value, policy, tierExpectation()),
      ).toThrow();
    }

    const expectation = tierPurchaseExpectation();
    expectation.deployment.abiDigests.tierMint = hash("f");
    expect(() =>
      parseCanonicalPurchaseEvidence(
        tierPurchaseEvidence(),
        policy,
        parseCanonicalPurchaseVerificationExpectation(expectation),
      ),
    ).toThrow();
  });

  it("rejects incomplete, extra-window, nested, and reentrant trace correlations", () => {
    const policy = parseFinalityPolicy(finalityPolicy());
    const mutations: Array<(value: ReturnType<typeof tierPurchaseEvidence>) => void> = [
      (value) => {
        value.correlationEvidence.traceComplete = false;
      },
      (value) => {
        value.correlationEvidence.traceTruncated = true;
      },
      (value) => {
        value.correlationEvidence.allRelevantPayLogIndices = [7, 11];
      },
      (value) => {
        value.correlationEvidence.allRelevantHookAfterRecordPayLogIndices = [6, 10];
      },
      (value) => {
        value.correlationEvidence.allRelevantTierMintLogIndices = [8, 9];
      },
      (value) => {
        value.correlationEvidence.tierHookFrame.traceAddress = [0, 0, 0];
        value.correlationEvidence.tierHookFrame.parentTraceAddress = [0, 0];
        value.correlationEvidence.tierHookFrame.depth = 3;
      },
      (value) => {
        value.correlationEvidence.tierHookFrame.from = ADDRESS_HOOK;
      },
      (value) => {
        value.correlationEvidence.terminalFrame.relevantEmittedLogIndices = [7];
      },
      (value) => {
        value.correlationEvidence.tierHookFrame.relevantEmittedLogIndices = [8];
      },
    ];
    for (const mutate of mutations) {
      const value = tierPurchaseEvidence();
      mutate(value);
      expect(() =>
        parseCanonicalPurchaseEvidence(value, policy, tierExpectation()),
      ).toThrow();
    }
  });

  it("takes refund state only from a signed offchain business ledger", () => {
    const expected = refundExpectation();
    const head = recordedRefundHead();
    const rawRecord = refundRecord();
    const recorded = parseRefundLedgerResult(
      { status: "recorded", eligibilityEffect: "block", head, record: rawRecord },
      expected,
      refundVerificationBundle(head, rawRecord),
    );
    expect(recorded).toMatchObject({
      status: "recorded",
      eligibilityEffect: "block",
      record: {
        source: "offchain-business-ledger",
        chainEventInference: "forbidden",
      },
    });
    expect(
      parseRefundLedgerResult(
        { status: "not-evaluated", eligibilityEffect: "block" },
        expected,
        { head: null, currentRecord: null },
      ),
    ).toEqual({ status: "not-evaluated", eligibilityEffect: "block" });
    const noEntryHead = clearNoEntryRefundHead();
    expect(
      parseRefundLedgerResult(
        {
          status: "evaluated-no-applicable-entry",
          eligibilityEffect: "clear",
          project: project(),
          purchaseEvidenceId: REFUND_PURCHASE.evidence.evidenceId,
          head: noEntryHead,
          evaluatedAt: "2026-08-14T13:01:30.000Z",
        },
        expected,
        refundVerificationBundle(noEntryHead, null),
      ),
    ).toMatchObject({
      status: "evaluated-no-applicable-entry",
      eligibilityEffect: "clear",
      head: { sequence: "6", currentStatus: "no-applicable-entry" },
    });
    expect(() =>
      parseRefundLedgerResult(
        {
          status: "recorded",
          eligibilityEffect: "block",
          head,
          record: {
            ...(recorded.status === "recorded" ? recorded.record : {}),
            source: "CashOutTokens",
          },
        },
        expected,
        refundVerificationBundle(head, rawRecord),
      ),
    ).toThrow();
  });

  it("prepares exact verifier work from unknown transport before finalizing", () => {
    const expected = refundExpectation();
    const record = refundRecord();
    const head = recordedRefundHead(record);
    const prepared = prepareRefundLedgerResult(
      { status: "recorded", eligibilityEffect: "block", head, record },
      expected,
    );
    if (prepared.status !== "recorded") throw new Error("wrong prepared fixture");
    expect(prepared).toMatchObject({
      status: "recorded",
      verificationRequests: {
        head: {
          envelope: { attestationId: head.attestation.attestationId },
          expectation: { attestationId: head.attestation.attestationId },
        },
        currentRecord: {
          envelope: { attestationId: record.attestation.attestationId },
          expectation: { attestationId: record.attestation.attestationId },
        },
      },
    });
    expect(
      finalizeRefundLedgerResult(
        prepared,
        refundVerificationBundle(head, record),
      ),
    ).toMatchObject({ status: "recorded", eligibilityEffect: "block" });
    expect(() =>
      finalizeRefundLedgerResult(
        {
          status: "recorded",
          verificationRequests: prepared.verificationRequests,
        },
        refundVerificationBundle(head, record),
      ),
    ).toThrow(/trusted prepare stage/);
  });

  it("binds signed refund state to the exact queried item", () => {
    const expected = refundExpectation();
    expect(expected.resourceDigest).toBe(
      computeRefundEligibilityResourceDigest({
        project: REFUND_PURCHASE.evidence.project,
        purchaseEvidenceId: REFUND_PURCHASE.evidence.evidenceId,
        purchaseEvidenceDigest: REFUND_PURCHASE.evidence.evidenceDigest,
        resource: REFUND_RESOURCE,
      }),
    );

    const wrongItemRecord = resignRefundRecord(refundRecord(), {
      scope: {
        kind: "exact-tier-items",
        items: [{ tierId: "1", tokenId: "1000000002" }],
      },
    });
    const wrongItemHead = buildRefundHead({
      record: wrongItemRecord,
      headId: "refund-head.wrong-item",
      sequence: "5",
      priorHeadDigest: hash("e"),
      ledgerRecordedAt: wrongItemRecord.recordedAt,
      eligibilityEffect: "block",
      currentStatus: "recorded",
      auditRecordId: "audit.head.wrong-item",
    });
    expect(() =>
      prepareRefundLedgerResult(
        {
          status: "recorded",
          eligibilityEffect: "block",
          head: wrongItemHead,
          record: wrongItemRecord,
        },
        expected,
      ),
    ).toThrow(/scope does not cover/);

    const replayedHead = structuredClone(recordedRefundHead());
    Object.assign(replayedHead, {
      resource: {
        kind: "tier-fulfillment",
        tierId: "1",
        tokenId: "1000000002",
      },
    });
    expect(() =>
      prepareRefundLedgerResult(
        {
          status: "recorded",
          eligibilityEffect: "block",
          head: replayedHead,
          record: refundRecord(),
        },
        expected,
      ),
    ).toThrow(/exact query/);
  });

  it("rejects direct resolution and requires the immediate open-case predecessor", () => {
    const direct = refundRecord({ purchaseUpheld: true });
    expect(() =>
      prepareRefundLedgerResult(
        {
          status: "recorded",
          eligibilityEffect: "clear",
          head: recordedRefundHead(direct),
          record: direct,
        },
        refundExpectation(),
      ),
    ).toThrow(/begin at revision 1 in an open state/);

    const openRecord = disputeOpenRecord();
    const openHead = disputeOpenHead(openRecord);
    const expected = refundExpectation({
      latestObservedHead: observedRefundSnapshot(openHead, openRecord),
    });
    const upheld = refundRecord({
      purchaseUpheld: true,
      priorLedgerHeadDigest: openHead.headDigest,
    });
    const upheldHead = buildRefundHead({
      record: upheld,
      headId: "refund-head.5.upheld",
      sequence: "5",
      priorHeadDigest: openHead.headDigest,
      ledgerRecordedAt: upheld.recordedAt,
      eligibilityEffect: "clear",
      currentStatus: "recorded",
      auditRecordId: "audit.head.5.upheld",
    });
    expect(
      parseRefundLedgerResult(
        {
          status: "recorded",
          eligibilityEffect: "clear",
          head: upheldHead,
          record: upheld,
        },
        expected,
        refundVerificationBundle(upheldHead, upheld),
      ),
    ).toMatchObject({ status: "recorded", eligibilityEffect: "clear" });

    const jumpedRevision = resignRefundRecord(upheld, {
      orderCaseRevision: "3",
    });
    const jumpedHead = buildRefundHead({
      record: jumpedRevision,
      headId: "refund-head.5.jumped-revision",
      sequence: "5",
      priorHeadDigest: openHead.headDigest,
      ledgerRecordedAt: jumpedRevision.recordedAt,
      eligibilityEffect: "clear",
      currentStatus: "recorded",
      auditRecordId: "audit.head.5.jumped-revision",
    });
    expect(() =>
      prepareRefundLedgerResult(
        {
          status: "recorded",
          eligibilityEffect: "clear",
          head: jumpedHead,
          record: jumpedRevision,
        },
        expected,
      ),
    ).toThrow(/revision or scope/);
  });

  it("requires the exact current authority root signer and signed policy proof", () => {
    const expected = refundExpectation();
    const mutations: Array<{
      target: "head" | "record";
      field: string;
      value: unknown;
    }> = [
      { target: "head", field: "businessSigner", value: ADDRESS_B },
      { target: "record", field: "businessSigner", value: ADDRESS_B },
      { target: "head", field: "rootAuthorityEvidenceId", value: "root.2" },
      { target: "record", field: "rootAuthorityEvidenceDigest", value: hash("7") },
      { target: "head", field: "rootSignerProofDigest", value: hash("7") },
      { target: "record", field: "issuerDeviceCredentialId", value: "credential.2" },
      {
        target: "head",
        field: "issuerWalletVerificationEvidenceId",
        value: "wallet-proof.2",
      },
      { target: "record", field: "authorityGenerationId", value: "generation.2" },
      { target: "head", field: "authorityGenerationSequence", value: "2" },
      { target: "record", field: "policyRevision", value: "2" },
      { target: "head", field: "lookupRequestId", value: "refund-lookup.old" },
      { target: "head", field: "lookupChallengeDigest", value: hash("5") },
    ];
    for (const mutation of mutations) {
      const head = recordedRefundHead();
      const record = refundRecord();
      Object.assign(mutation.target === "head" ? head : record, {
        [mutation.field]: mutation.value,
      });
      expect(() =>
        parseRefundLedgerResult(
          { status: "recorded", eligibilityEffect: "block", head, record },
          expected,
          refundVerificationBundle(head, record),
        ),
      ).toThrow();
    }
  });

  it("requires independent claim-bound verification of every refund attestation", () => {
    const expected = refundExpectation();
    const noEntryHead = clearNoEntryRefundHead();
    for (const headResult of [
      {
        status: "invalid",
        attestationId: noEntryHead.attestation.attestationId,
        reasonCode: "bad-signature",
      },
      {
        status: "unavailable",
        attestationId: noEntryHead.attestation.attestationId,
        reasonCode: "signature-verifier-unavailable",
      },
    ]) {
      expect(() =>
        parseRefundLedgerResult(
          {
            status: "evaluated-no-applicable-entry",
            eligibilityEffect: "clear",
            project: project(),
            purchaseEvidenceId: REFUND_PURCHASE.evidence.evidenceId,
            head: noEntryHead,
            evaluatedAt: "2026-08-14T13:01:30.000Z",
          },
          expected,
          { head: headResult, currentRecord: null },
        ),
      ).toThrow();
    }

    const record = refundRecord({ purchaseUpheld: true });
    const head = recordedRefundHead(record);
    const validBundle = refundVerificationBundle(head, record);
    expect(() =>
      parseRefundLedgerResult(
        {
          status: "recorded",
          eligibilityEffect: "clear",
          head,
          record,
        },
        expected,
        {
          head: validBundle.head,
          currentRecord: {
            status: "invalid",
            attestationId: record.attestation.attestationId,
            reasonCode: "wrong-signer",
          },
        },
      ),
    ).toThrow();

    const verifiedMutations: Array<Record<string, unknown>> = [
      { canonicalPayloadDigest: hash("f") },
      { signatureDigest: hash("f") },
      { signer: ADDRESS_B },
      { issuerDeviceCredentialId: "credential.2" },
      { ledgerSequence: "6" },
      { lookupRequestId: "refund-lookup.old" },
      { authorityGenerationId: "generation.2" },
      { rootAuthorityEvidenceDigest: hash("7") },
      { refundPolicyRevision: "2" },
      { verifierPolicyId: "attacker-policy.1" },
      { verifierKeyId: "attacker-key.1" },
      { verificationEvidenceDigest: hash("f") },
      { verifiedAt: "2026-08-14T13:02:00.001Z" },
    ];
    for (const mutation of verifiedMutations) {
      const bundle = refundVerificationBundle(head, record);
      Object.assign(bundle.head, mutation);
      expect(() =>
        parseRefundLedgerResult(
          {
            status: "recorded",
            eligibilityEffect: "clear",
            head,
            record,
          },
          expected,
          bundle,
        ),
      ).toThrow();
    }

    const swapped = refundVerificationBundle(head, record);
    Object.assign(swapped, { head: swapped.currentRecord });
    expect(() =>
      parseRefundLedgerResult(
        {
          status: "recorded",
          eligibilityEffect: "clear",
          head,
          record,
        },
        expected,
        swapped,
      ),
    ).toThrow();
  });

  it("recomputes signed payloads and rejects signature-envelope mutation", () => {
    const record = refundRecord({ purchaseUpheld: true });
    const head = recordedRefundHead(record);
    const mutatedRecord = structuredClone(record);
    mutatedRecord.resolution = "refund";
    expect(() =>
      parseRefundLedgerResult(
        {
          status: "recorded",
          eligibilityEffect: "clear",
          head,
          record: mutatedRecord,
        },
        refundExpectation(),
        refundVerificationBundle(head, record),
      ),
    ).toThrow();

    const mutatedHead = structuredClone(head);
    mutatedHead.lookupChallengeDigest = hash("5");
    expect(() =>
      parseRefundLedgerResult(
        {
          status: "recorded",
          eligibilityEffect: "clear",
          head: mutatedHead,
          record,
        },
        refundExpectation(),
        refundVerificationBundle(head, record),
      ),
    ).toThrow();

    const mutatedSignature = structuredClone(head);
    Object.assign(mutatedSignature.attestation, {
      signature: `0x${"cd".repeat(65)}`,
    });
    expect(() =>
      parseRefundLedgerResult(
        {
          status: "recorded",
          eligibilityEffect: "clear",
          head: mutatedSignature,
          record,
        },
        refundExpectation(),
        refundVerificationBundle(head, record),
      ),
    ).toThrow();
  });

  it("rejects no-entry clearing and non-contiguous heads after a recorded case", () => {
    const observedRecord = refundRecord();
    const observed = recordedRefundHead(observedRecord);
    const expected = refundExpectation({
      latestObservedHead: observedRefundSnapshot(observed, observedRecord),
    });
    const next = clearNoEntryRefundHead();
    expect(() =>
      parseRefundLedgerResult(
        {
          status: "evaluated-no-applicable-entry",
          eligibilityEffect: "clear",
          project: project(),
          purchaseEvidenceId: REFUND_PURCHASE.evidence.evidenceId,
          head: next,
          evaluatedAt: "2026-08-14T13:01:30.000Z",
        },
        expected,
        refundVerificationBundle(next, null),
      ),
    ).toThrow(/cannot be cleared by a no-entry head/);

    const jumped = buildRefundHead({
      record: null,
      headId: "refund-head.7",
      sequence: "7",
      priorHeadDigest: observed.headDigest,
      ledgerRecordedAt: "2026-08-14T13:01:00.000Z",
      currentStatus: "no-applicable-entry",
      eligibilityEffect: "clear",
      auditRecordId: "audit.head.7",
    });
    expect(() =>
      parseRefundLedgerResult(
        {
          status: "evaluated-no-applicable-entry",
          eligibilityEffect: "clear",
          project: project(),
          purchaseEvidenceId: REFUND_PURCHASE.evidence.evidenceId,
          head: jumped,
          evaluatedAt: "2026-08-14T13:01:30.000Z",
        },
        expected,
        refundVerificationBundle(jumped, null),
      ),
    ).toThrow();

    const wrongParent = buildRefundHead({
      record: null,
      headId: "refund-head.6.wrong-parent",
      sequence: "6",
      priorHeadDigest: hash("f"),
      ledgerRecordedAt: "2026-08-14T13:01:00.000Z",
      currentStatus: "no-applicable-entry",
      eligibilityEffect: "clear",
      auditRecordId: "audit.head.6.wrong-parent",
    });
    expect(() =>
      parseRefundLedgerResult(
        {
          status: "evaluated-no-applicable-entry",
          eligibilityEffect: "clear",
          project: project(),
          purchaseEvidenceId: REFUND_PURCHASE.evidence.evidenceId,
          head: wrongParent,
          evaluatedAt: "2026-08-14T13:01:30.000Z",
        },
        expected,
        refundVerificationBundle(wrongParent, null),
      ),
    ).toThrow();
  });

  it("accepts only a fresh, monotonic, signed current ledger head", () => {
    const stale = recordedRefundHead();
    stale.ledgerRecordedAt = "2026-08-14T12:55:00.000Z";
    stale.signedAt = "2026-08-14T12:56:59.999Z";
    const staleRecord = refundRecord();
    staleRecord.effectiveAt = "2026-08-14T12:54:00.000Z";
    staleRecord.recordedAt = stale.ledgerRecordedAt;
    expect(() =>
      parseRefundLedgerResult(
        {
          status: "recorded",
          eligibilityEffect: "block",
          head: stale,
          record: staleRecord,
        },
        refundExpectation(),
        refundVerificationBundle(stale, staleRecord),
      ),
    ).toThrow();

    const replayExpectation = refundExpectation({
      latestObservedHead: observedRefundSnapshot(clearNoEntryRefundHead(), null),
    });
    const replayHead = recordedRefundHead();
    const replayRecord = refundRecord();
    expect(() =>
      parseRefundLedgerResult(
        {
          status: "recorded",
          eligibilityEffect: "block",
          head: replayHead,
          record: replayRecord,
        },
        replayExpectation,
        refundVerificationBundle(replayHead, replayRecord),
      ),
    ).toThrow();

    const conflicting = clearNoEntryRefundHead();
    Object.assign(conflicting, { headDigest: hash("e") });
    expect(() =>
      parseRefundLedgerResult(
        {
          status: "evaluated-no-applicable-entry",
          eligibilityEffect: "clear",
          project: project(),
          purchaseEvidenceId: REFUND_PURCHASE.evidence.evidenceId,
          head: conflicting,
          evaluatedAt: "2026-08-14T13:01:30.000Z",
        },
        replayExpectation,
        refundVerificationBundle(conflicting, null),
      ),
    ).toThrow();

    expect(() =>
      refundExpectation({ maximumHeadAgeMilliseconds: 300_001 }),
    ).toThrow();
  });

  it("requires head-sequence current status and fail-closed eligibility effects", () => {
    const expected = refundExpectation();
    const olderRecord = refundRecord();
    olderRecord.ledgerSequence = "4";
    expect(() =>
      parseRefundLedgerResult(
        {
          status: "recorded",
          eligibilityEffect: "block",
          head: recordedRefundHead(),
          record: olderRecord,
        },
        expected,
        refundVerificationBundle(recordedRefundHead(), olderRecord),
      ),
    ).toThrow();

    const unsafeRecord = refundRecord();
    unsafeRecord.eligibilityEffect = "clear";
    const unsafeHead = recordedRefundHead();
    unsafeHead.eligibilityEffect = "clear";
    expect(() =>
      parseRefundLedgerResult(
        {
          status: "recorded",
          eligibilityEffect: "clear",
          head: unsafeHead,
          record: unsafeRecord,
        },
        expected,
        refundVerificationBundle(unsafeHead, unsafeRecord),
      ),
    ).toThrow();

    const openRecord = disputeOpenRecord();
    const openHead = disputeOpenHead(openRecord);
    const clearRecord = refundRecord({
      purchaseUpheld: true,
      priorLedgerHeadDigest: openHead.headDigest,
    });
    const clearHead = buildRefundHead({
      record: clearRecord,
      headId: "refund-head.5",
      sequence: "5",
      priorHeadDigest: openHead.headDigest,
      ledgerRecordedAt: clearRecord.recordedAt,
      eligibilityEffect: "clear",
      currentStatus: "recorded",
      auditRecordId: "audit.head.5",
    });
    const clearExpected = refundExpectation({
      latestObservedHead: observedRefundSnapshot(openHead, openRecord),
    });
    expect(
      parseRefundLedgerResult(
        {
          status: "recorded",
          eligibilityEffect: "clear",
          head: clearHead,
          record: clearRecord,
        },
        clearExpected,
        refundVerificationBundle(clearHead, clearRecord),
      ),
    ).toMatchObject({ status: "recorded", eligibilityEffect: "clear" });

    expect(() =>
      parseRefundLedgerResult(
        { status: "not-evaluated", eligibilityEffect: "clear" },
        expected,
        { head: null, currentRecord: null },
      ),
    ).toThrow();
    expect(() =>
      parseRefundLedgerResult(
        {
          status: "unavailable",
          eligibilityEffect: "clear",
          reasonCode: "refund-ledger-unavailable",
        },
        expected,
        { head: null, currentRecord: null },
      ),
    ).toThrow();
  });

  it("requires no-entry evaluation at or after the signed clear head", () => {
    const earlyHead = clearNoEntryRefundHead();
    expect(() =>
      parseRefundLedgerResult(
        {
          status: "evaluated-no-applicable-entry",
          eligibilityEffect: "clear",
          project: project(),
          purchaseEvidenceId: REFUND_PURCHASE.evidence.evidenceId,
          head: earlyHead,
          evaluatedAt: "2026-08-14T13:00:59.999Z",
        },
        refundExpectation(),
        refundVerificationBundle(earlyHead, null),
      ),
    ).toThrow();

    const blockingHead = clearNoEntryRefundHead();
    blockingHead.eligibilityEffect = "block";
    expect(() =>
      parseRefundLedgerResult(
        {
          status: "evaluated-no-applicable-entry",
          eligibilityEffect: "clear",
          project: project(),
          purchaseEvidenceId: REFUND_PURCHASE.evidence.evidenceId,
          head: blockingHead,
          evaluatedAt: "2026-08-14T13:01:30.000Z",
        },
        refundExpectation(),
        refundVerificationBundle(blockingHead, null),
      ),
    ).toThrow();
  });
});
