import {
  parseFinalizedBlockAnchor,
  type FinalityPolicy,
  type FinalizedBlockAnchor,
} from "./finality";
import { sha256AuthorityDigest } from "./digests";
import {
  AuthorityValidationError,
  expectExactRecord,
  parseAuthorityId,
  parseCanonicalInstant,
  parseEthereumAddress,
  parseHash32,
  parseHexBytes,
  instantMilliseconds,
  parseJuiceboxV6ChainId,
  parseJuiceboxV6ProjectRef,
  parseLogIndex,
  parseUint256Decimal,
  sameJuiceboxV6ProjectRef,
  type AuthorityId,
  type CanonicalInstant,
  type EthereumAddress,
  type Hash32,
  type HexBytes,
  type JuiceboxV6ChainId,
  type JuiceboxV6ProjectRef,
  type Uint256Decimal,
} from "./valueObjects";

export const JUICEBOX_V6_EVENT_TOPICS = {
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
} as const;

export interface CanonicalReceiptProof {
  kind: "canonical-finalized-receipt.v1";
  receiptEvidenceId: AuthorityId;
  chainId: JuiceboxV6ChainId;
  transactionHash: Hash32;
  transactionIndex: number;
  block: FinalizedBlockAnchor;
  status: 1;
  receiptDigest: Hash32;
  finalityPolicyId: AuthorityId;
  deploymentManifestId: AuthorityId;
  adapterRevision: AuthorityId;
  canonicalityCheckedAt: CanonicalInstant;
}

export interface CanonicalLogRef {
  receiptEvidenceId: AuthorityId;
  transactionHash: Hash32;
  blockHash: Hash32;
  logIndex: number;
  emitter: EthereumAddress;
  topic0: Hash32;
  abiDigest: Hash32;
  adapterRevision: AuthorityId;
  topicsDigest: Hash32;
  dataDigest: Hash32;
  removed: false;
}

export interface CanonicalPayLog {
  kind: "juicebox-v6-pay-log.v1";
  log: CanonicalLogRef;
  project: JuiceboxV6ProjectRef;
  rulesetId: Uint256Decimal;
  rulesetCycleNumber: Uint256Decimal;
  payer: EthereumAddress;
  beneficiary: EthereumAddress;
  amount: Uint256Decimal;
  newlyIssuedTokenCount: Uint256Decimal;
  memoDigest: Hash32;
  metadataDigest: Hash32;
  caller: EthereumAddress;
  accountingContext: "not-contained-in-pay-event";
}

export interface TokenAmountContext {
  token: EthereumAddress;
  decimals: number;
  currency: string;
  value: Uint256Decimal;
}

export interface CanonicalHookAfterRecordPayLog {
  kind: "juicebox-v6-hook-after-record-pay-log.v1";
  log: CanonicalLogRef;
  hook: EthereumAddress;
  project: JuiceboxV6ProjectRef;
  rulesetId: Uint256Decimal;
  payer: EthereumAddress;
  beneficiary: EthereumAddress;
  amount: TokenAmountContext;
  newlyIssuedTokenCount: Uint256Decimal;
  contextDigest: Hash32;
  specificationAmount: Uint256Decimal;
  caller: EthereumAddress;
}

export interface CanonicalTierMintLog {
  kind: "juicebox-v6-721-tier-mint-log.v1";
  log: CanonicalLogRef;
  tokenId: Uint256Decimal;
  tierId: Uint256Decimal;
  beneficiary: EthereumAddress;
  totalAmountPaid: Uint256Decimal;
  caller: EthereumAddress;
  comparisonToPayAmount: "not-used-for-correlation";
}

export interface CanonicalTerminalEvidence {
  kind: "canonical-v6-terminal-at-block.v1";
  evidenceId: AuthorityId;
  project: JuiceboxV6ProjectRef;
  terminal: EthereumAddress;
  implementationCodeHash: Hash32;
  deploymentManifestId: AuthorityId;
  isTerminalOfProject: true;
  block: FinalizedBlockAnchor;
}

export interface CanonicalTierHookEvidence {
  kind: "canonical-v6-721-hook-at-block.v1";
  evidenceId: AuthorityId;
  project: JuiceboxV6ProjectRef;
  hook: EthereumAddress;
  implementationCodeHash: Hash32;
  deploymentManifestId: AuthorityId;
  projectIdResult: number;
  block: FinalizedBlockAnchor;
}

export interface CanonicalTraceFrameBinding {
  traceAddress: readonly number[];
  parentTraceAddress: readonly number[] | null;
  depth: number;
  from: EthereumAddress;
  to: EthereumAddress;
  callType: "call";
  success: true;
  relevantEmittedLogIndices: readonly [number, ...number[]];
}

/**
 * A deliberately strict v1 correlation proof. It is scoped to transactions with
 * exactly one relevant Pay/HookAfterRecordPay window for the selected canonical
 * terminal and tier hook. Batches with another relevant window fail closed until
 * a later adapter revision can prove their ancestry without ambiguity.
 */
export interface CanonicalTierTraceCorrelationEvidence {
  kind: "canonical-exclusive-receipt-call-trace-correlation.v1";
  evidenceId: AuthorityId;
  receiptEvidenceId: AuthorityId;
  transactionHash: Hash32;
  blockHash: Hash32;
  adapterRevision: AuthorityId;
  traceDigest: Hash32;
  relevantLogInventoryDigest: Hash32;
  receiptLogCount: number;
  traceFrameCount: number;
  inventoryScope: "entire-receipt-expected-emitters";
  traceComplete: true;
  traceTruncated: false;
  allRelevantPayLogIndices: readonly [number];
  allRelevantHookAfterRecordPayLogIndices: readonly [number];
  allRelevantTierMintLogIndices: readonly [number, ...number[]];
  terminalFrame: CanonicalTraceFrameBinding;
  tierHookFrame: CanonicalTraceFrameBinding;
}

export interface CanonicalPaymentBeneficiaryEvidence {
  kind: "juicebox-v6-payment-beneficiary-evidence.v1";
  claimId: AuthorityId;
  evidenceId: AuthorityId;
  evidenceDigest: Hash32;
  receipt: CanonicalReceiptProof;
  pay: CanonicalPayLog;
  terminal: CanonicalTerminalEvidence;
  project: JuiceboxV6ProjectRef;
  customerAccount: EthereumAddress;
  customerSubjectSource: "pay-beneficiary";
  payerAttribution: "not-evaluated";
  transactionSenderAttribution: "never-inferred";
  callerAttribution: "never-inferred";
  refundStatus: "not-evaluated";
}

export interface CanonicalTierPurchaseEvidence {
  kind: "juicebox-v6-tier-purchase-evidence.v1";
  claimId: AuthorityId;
  evidenceId: AuthorityId;
  evidenceDigest: Hash32;
  receipt: CanonicalReceiptProof;
  pay: CanonicalPayLog;
  afterPayHook: CanonicalHookAfterRecordPayLog;
  mints: readonly [CanonicalTierMintLog, ...CanonicalTierMintLog[]];
  terminal: CanonicalTerminalEvidence;
  tierHook: CanonicalTierHookEvidence;
  project: JuiceboxV6ProjectRef;
  customerAccount: EthereumAddress;
  customerSubjectSource: "pay-beneficiary";
  correlationEvidence: CanonicalTierTraceCorrelationEvidence;
  payerAttribution: "not-evaluated";
  transactionSenderAttribution: "never-inferred";
  callerAttribution: "never-inferred";
  refundStatus: "not-evaluated";
}

export type CanonicalPurchaseEvidence =
  | CanonicalPaymentBeneficiaryEvidence
  | CanonicalTierPurchaseEvidence;

export type CanonicalPurchaseClaim =
  | {
      kind: "juicebox-v6-payment-beneficiary-claim.v1";
      claimId: AuthorityId;
      project: JuiceboxV6ProjectRef;
      transactionHash: Hash32;
      payLogIndex: number;
      expectedBeneficiary: EthereumAddress;
      customerSubjectSource: "pay-beneficiary";
    }
  | {
      kind: "juicebox-v6-tier-purchase-claim.v1";
      claimId: AuthorityId;
      project: JuiceboxV6ProjectRef;
      transactionHash: Hash32;
      payLogIndex: number;
      afterPayHookLogIndex: number;
      mintLogIndices: readonly [number, ...number[]];
      expectedBeneficiary: EthereumAddress;
      customerSubjectSource: "pay-beneficiary";
    };

export interface CanonicalPurchaseDeploymentExpectation {
  deploymentManifestId: AuthorityId;
  projectsContract: EthereumAddress;
  adapterRevision: AuthorityId;
  abiDigests: {
    pay: Hash32;
    hookAfterRecordPay: Hash32;
    tierMint: Hash32;
  };
  terminal: {
    address: EthereumAddress;
    implementationCodeHash: Hash32;
  };
  tierHook:
    | null
    | {
        address: EthereumAddress;
        implementationCodeHash: Hash32;
      };
}

export interface CanonicalPurchaseVerificationExpectation {
  claim: CanonicalPurchaseClaim;
  deployment: CanonicalPurchaseDeploymentExpectation;
  now: CanonicalInstant;
}

export type ClaimBoundCanonicalPurchaseVerificationResult =
  | {
      status: "verified";
      claimId: AuthorityId;
      evidence: CanonicalPurchaseEvidence;
    }
  | {
      status: "ineligible";
      claimId: AuthorityId;
      reasonCode:
        | "receipt-failed"
        | "receipt-or-log-not-found"
        | "wrong-event-or-emitter"
        | "beneficiary-mismatch"
        | "project-or-ruleset-mismatch"
        | "terminal-not-canonical"
        | "tier-hook-not-canonical"
        | "mint-not-payment-mint"
        | "ambiguous-log-correlation"
        | "canonical-evidence-orphaned";
    }
  | {
      status: "pending-finality";
      claimId: AuthorityId;
      reasonCode: "receipt-above-finalized-head";
    }
  | {
      status: "unavailable";
      claimId: AuthorityId;
      reasonCode:
        | "not-configured"
        | "rpc-unavailable"
        | "archive-state-unavailable"
        | "deployment-allowlist-unavailable"
        | "malformed-chain-response";
    };

export type VerifiedCanonicalPurchaseVerificationResult = Extract<
  ClaimBoundCanonicalPurchaseVerificationResult,
  { status: "verified" }
>;

export type PayerAttributionResult =
  | {
      status: "verified";
      payerAccount: EthereumAddress;
      purchaseEvidenceId: AuthorityId;
      separateAttributionEvidenceId: AuthorityId;
      attributionDigest: Hash32;
    }
  | { status: "not-evaluated" }
  | {
      status: "unavailable";
      reasonCode: "payer-attribution-verifier-not-configured" | "attribution-source-unavailable";
    };

export interface RefundAttestationSignatureEnvelope {
  kind: "refund-attestation-signature-envelope.v1";
  attestationId: AuthorityId;
  attestationKind: "record" | "head";
  attestationDomain: "juicebox-messaging-refund-ledger-v1";
  signatureScheme: "eip712-v4";
  primaryType: "JuiceboxRefundLedgerRecord" | "JuiceboxRefundLedgerHead";
  payloadBinding:
    | "canonical-record-payload"
    | "canonical-head-payload-including-lookup-challenge";
  attestationDomainSeparatorDigest: Hash32;
  canonicalPayloadDigest: Hash32;
  signature: HexBytes;
  signatureDigest: Hash32;
  claimedSigner: EthereumAddress;
  issuerDeviceCredentialId: AuthorityId;
  ledgerSequence: Uint256Decimal;
  authorityGenerationId: AuthorityId;
  authorityGenerationSequence: Uint256Decimal;
  rootAuthorityEvidenceId: AuthorityId;
  rootAuthorityEvidenceDigest: Hash32;
}

/**
 * Output from a separate trusted cryptographic verifier port. This parser only
 * validates and claim-binds the result; it does not implement ECDSA, ERC-1271,
 * or ERC-6492 verification.
 */
export type RefundAttestationVerificationResult =
  | {
      status: "verified";
      attestationId: AuthorityId;
      attestationKind: "record" | "head";
      verificationEvidenceId: AuthorityId;
      verificationEvidenceDigest: Hash32;
      attestationDomain: "juicebox-messaging-refund-ledger-v1";
      signatureScheme: "eip712-v4";
      primaryType: "JuiceboxRefundLedgerRecord" | "JuiceboxRefundLedgerHead";
      attestationDomainSeparatorDigest: Hash32;
      canonicalPayloadDigest: Hash32;
      signatureDigest: Hash32;
      signer: EthereumAddress;
      issuerDeviceCredentialId: AuthorityId;
      project: JuiceboxV6ProjectRef;
      purchaseEvidenceId: AuthorityId;
      purchaseEvidenceDigest: Hash32;
      resourceDigest: Hash32;
      ledgerSequence: Uint256Decimal;
      lookupRequestId: AuthorityId | null;
      authorityGenerationId: AuthorityId;
      authorityGenerationSequence: Uint256Decimal;
      rootAuthorityEvidenceId: AuthorityId;
      rootAuthorityEvidenceDigest: Hash32;
      refundPolicyId: AuthorityId;
      refundPolicyRevision: Uint256Decimal;
      verifierPolicyId: AuthorityId;
      verifierPolicyRevision: Uint256Decimal;
      verifierKeyId: AuthorityId;
      verificationMethod: "eoa-ecrecover" | "erc1271" | "erc6492";
      verifiedAt: CanonicalInstant;
    }
  | {
      status: "invalid";
      attestationId: AuthorityId;
      reasonCode:
        | "bad-signature"
        | "wrong-signer"
        | "wrong-domain"
        | "payload-digest-mismatch"
        | "authority-generation-stale"
        | "device-credential-stale";
    }
  | {
      status: "unavailable";
      attestationId: AuthorityId;
      reasonCode:
        | "not-configured"
        | "signature-verifier-unavailable"
        | "erc1271-rpc-unavailable"
        | "erc6492-verifier-unavailable";
    };

export interface RefundAttestationVerificationExpectation {
  attestationId: AuthorityId;
  attestationKind: "record" | "head";
  primaryType: "JuiceboxRefundLedgerRecord" | "JuiceboxRefundLedgerHead";
  attestationDomainSeparatorDigest: Hash32;
  canonicalPayloadDigest: Hash32;
  signatureDigest: Hash32;
  signer: EthereumAddress;
  issuerDeviceCredentialId: AuthorityId;
  project: JuiceboxV6ProjectRef;
  purchaseEvidenceId: AuthorityId;
  purchaseEvidenceDigest: Hash32;
  resourceDigest: Hash32;
  ledgerSequence: Uint256Decimal;
  lookupRequestId: AuthorityId | null;
  authorityGenerationId: AuthorityId;
  authorityGenerationSequence: Uint256Decimal;
  rootAuthorityEvidenceId: AuthorityId;
  rootAuthorityEvidenceDigest: Hash32;
  refundPolicyId: AuthorityId;
  refundPolicyRevision: Uint256Decimal;
  verifierPolicyId: AuthorityId;
  verifierPolicyRevision: Uint256Decimal;
  verifierKeyId: AuthorityId;
  notBefore: CanonicalInstant;
  now: CanonicalInstant;
}

export interface RefundAttestationVerificationBundle {
  head: unknown;
  currentRecord: unknown | null;
}

export interface RefundAttestationVerificationRequest {
  envelope: RefundAttestationSignatureEnvelope;
  expectation: RefundAttestationVerificationExpectation;
}

/**
 * Opaque output of prepareRefundLedgerResult. The public surface exposes only
 * the exact cryptographic verification work to perform; parsed ledger state is
 * retained privately until finalizeRefundLedgerResult claim-binds the verifier
 * responses. Callers cannot manufacture a prepared value by casting JSON.
 */
export type PreparedRefundLedgerResult =
  | {
      status: "not-evaluated" | "unavailable";
      verificationRequests: {
        head: null;
        currentRecord: null;
      };
    }
  | {
      status: "evaluated-no-applicable-entry";
      verificationRequests: {
        head: RefundAttestationVerificationRequest;
        currentRecord: null;
      };
    }
  | {
      status: "recorded";
      verificationRequests: {
        head: RefundAttestationVerificationRequest;
        currentRecord: RefundAttestationVerificationRequest;
      };
    };

export interface SignedRefundLedgerRecord {
  kind: "signed-business-refund-ledger-record.v1";
  refundRecordId: AuthorityId;
  project: JuiceboxV6ProjectRef;
  purchaseEvidenceId: AuthorityId;
  purchaseEvidenceDigest: Hash32;
  ledgerSequence: Uint256Decimal;
  orderCaseRevision: Uint256Decimal;
  priorLedgerHeadDigest: Hash32;
  state: "refund-recorded" | "dispute-open" | "dispute-resolved";
  resolution: "refund" | "purchase-upheld" | null;
  eligibilityEffect: "clear" | "block";
  scope:
    | { kind: "entire-purchase" }
    | {
        kind: "exact-tier-items";
        items: readonly [
          { tierId: Uint256Decimal; tokenId: Uint256Decimal },
          ...{ tierId: Uint256Decimal; tokenId: Uint256Decimal }[],
        ];
      };
  refundAmount:
    | null
    | {
        kind: "partial" | "full";
        amount: TokenAmountContext;
      };
  businessSigner: EthereumAddress;
  issuerDeviceCredentialId: AuthorityId;
  issuerWalletVerificationEvidenceId: AuthorityId;
  rootAuthorityEvidenceId: AuthorityId;
  rootAuthorityEvidenceDigest: Hash32;
  rootSignerProofDigest: Hash32;
  authorityGenerationId: AuthorityId;
  authorityGenerationSequence: Uint256Decimal;
  effectiveAt: CanonicalInstant;
  recordedAt: CanonicalInstant;
  policyId: AuthorityId;
  policyRevision: Uint256Decimal;
  auditRecordId: AuthorityId;
  source: "offchain-business-ledger";
  chainEventInference: "forbidden";
  attestation: RefundAttestationSignatureEnvelope & {
    attestationKind: "record";
    primaryType: "JuiceboxRefundLedgerRecord";
    payloadBinding: "canonical-record-payload";
  };
}

export interface RefundLedgerHead {
  kind: "signed-business-refund-ledger-head.v1";
  headId: AuthorityId;
  project: JuiceboxV6ProjectRef;
  purchaseEvidenceId: AuthorityId;
  purchaseEvidenceDigest: Hash32;
  resource: RefundEligibilityResource;
  resourceDigest: Hash32;
  sequence: Uint256Decimal;
  priorHeadDigest: Hash32;
  headDigest: Hash32;
  lookupRequestId: AuthorityId;
  lookupChallengeDigest: Hash32;
  currentStatus: "recorded" | "no-applicable-entry";
  currentRecordId: AuthorityId | null;
  currentRecordDigest: Hash32 | null;
  eligibilityEffect: "clear" | "block";
  businessSigner: EthereumAddress;
  issuerDeviceCredentialId: AuthorityId;
  issuerWalletVerificationEvidenceId: AuthorityId;
  rootAuthorityEvidenceId: AuthorityId;
  rootAuthorityEvidenceDigest: Hash32;
  rootSignerProofDigest: Hash32;
  authorityGenerationId: AuthorityId;
  authorityGenerationSequence: Uint256Decimal;
  ledgerRecordedAt: CanonicalInstant;
  signedAt: CanonicalInstant;
  policyId: AuthorityId;
  policyRevision: Uint256Decimal;
  auditRecordId: AuthorityId;
  attestation: RefundAttestationSignatureEnvelope & {
    attestationKind: "head";
    primaryType: "JuiceboxRefundLedgerHead";
    payloadBinding: "canonical-head-payload-including-lookup-challenge";
  };
}

/**
 * Post-verification authority result. A ledger transport must never construct
 * this type directly; evaluated variants are released only by
 * parseRefundLedgerResult after independent attestation-verifier results bind.
 */
export type RefundLedgerResult =
  | {
      status: "recorded";
      eligibilityEffect: "clear" | "block";
      head: RefundLedgerHead;
      record: SignedRefundLedgerRecord;
      headAttestationVerification: Extract<
        RefundAttestationVerificationResult,
        { status: "verified" }
      >;
      recordAttestationVerification: Extract<
        RefundAttestationVerificationResult,
        { status: "verified" }
      >;
    }
  | {
      status: "evaluated-no-applicable-entry";
      eligibilityEffect: "clear";
      project: JuiceboxV6ProjectRef;
      purchaseEvidenceId: AuthorityId;
      head: RefundLedgerHead;
      headAttestationVerification: Extract<
        RefundAttestationVerificationResult,
        { status: "verified" }
      >;
      evaluatedAt: CanonicalInstant;
    }
  | { status: "not-evaluated"; eligibilityEffect: "block" }
  | {
      status: "unavailable";
      eligibilityEffect: "block";
      reasonCode: "refund-ledger-not-configured" | "refund-ledger-unavailable";
    };

export interface ObservedRefundLedgerHead {
  resourceDigest: Hash32;
  sequence: Uint256Decimal;
  headDigest: Hash32;
  ledgerRecordedAt: CanonicalInstant;
  currentStatus: "recorded" | "no-applicable-entry";
  currentRecordId: AuthorityId | null;
  currentRecordDigest: Hash32 | null;
  eligibilityEffect: "clear" | "block";
  currentCase:
    | null
    | {
        orderCaseRevision: Uint256Decimal;
        state: SignedRefundLedgerRecord["state"];
        resolution: SignedRefundLedgerRecord["resolution"];
        scope: SignedRefundLedgerRecord["scope"];
      };
}

export interface RefundLedgerExpectation {
  project: JuiceboxV6ProjectRef;
  purchaseEvidenceId: AuthorityId;
  purchaseEvidenceDigest: Hash32;
  resource: RefundEligibilityResource;
  resourceDigest: Hash32;
  authorityGenerationId: AuthorityId;
  authorityGenerationSequence: Uint256Decimal;
  rootAuthorityEvidenceId: AuthorityId;
  rootAuthorityEvidenceDigest: Hash32;
  rootSigner: EthereumAddress;
  rootSignerProofDigest: Hash32;
  issuerDeviceCredentialId: AuthorityId;
  issuerWalletVerificationEvidenceId: AuthorityId;
  policyId: AuthorityId;
  policyRevision: Uint256Decimal;
  lookupRequestId: AuthorityId;
  lookupChallengeDigest: Hash32;
  now: CanonicalInstant;
  maximumHeadAgeMilliseconds: number;
  latestObservedHead: ObservedRefundLedgerHead | null;
  refundAttestationDomainSeparatorDigest: Hash32;
  attestationVerifierPolicyId: AuthorityId;
  attestationVerifierPolicyRevision: Uint256Decimal;
  attestationVerifierKeyId: AuthorityId;
}

export type RefundEligibilityResource =
  | {
      kind: "purchase-support";
      transactionHash: Hash32;
      payLogIndex: number;
    }
  | {
      kind: "tier-fulfillment";
      tierId: Uint256Decimal;
      tokenId: Uint256Decimal;
    };

type PreparedRefundLedgerState =
  | Extract<RefundLedgerResult, { status: "not-evaluated" | "unavailable" }>
  | {
      status: "evaluated-no-applicable-entry";
      result: Omit<
        Extract<RefundLedgerResult, { status: "evaluated-no-applicable-entry" }>,
        "headAttestationVerification"
      >;
      headExpectation: RefundAttestationVerificationExpectation;
    }
  | {
      status: "recorded";
      result: Omit<
        Extract<RefundLedgerResult, { status: "recorded" }>,
        "headAttestationVerification" | "recordAttestationVerification"
      >;
      headExpectation: RefundAttestationVerificationExpectation;
      recordExpectation: RefundAttestationVerificationExpectation;
    };

const preparedRefundLedgerStates = new WeakMap<
  PreparedRefundLedgerResult,
  PreparedRefundLedgerState
>();

const verifiedCanonicalPurchaseResults = new WeakSet<
  VerifiedCanonicalPurchaseVerificationResult
>();
const validatedRefundLedgerExpectations = new WeakSet<RefundLedgerExpectation>();

export const MAXIMUM_REFUND_LEDGER_HEAD_AGE_MILLISECONDS = 5 * 60 * 1000;

export function parseCanonicalReceiptProof(
  value: unknown,
  policy: FinalityPolicy,
  expectedDeployment: CanonicalPurchaseDeploymentExpectation,
  now: CanonicalInstant,
): CanonicalReceiptProof {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "receiptEvidenceId",
      "chainId",
      "transactionHash",
      "transactionIndex",
      "block",
      "status",
      "receiptDigest",
      "finalityPolicyId",
      "deploymentManifestId",
      "adapterRevision",
      "canonicalityCheckedAt",
    ],
    "canonical receipt proof",
  );
  if (record.kind !== "canonical-finalized-receipt.v1" || record.status !== 1) {
    throw invalid("Only successful canonical finalized receipts are evidence.");
  }
  const chainId = parseJuiceboxV6ChainId(record.chainId);
  if (
    chainId !== policy.chainId ||
    record.finalityPolicyId !== policy.policyId ||
    record.deploymentManifestId !== expectedDeployment.deploymentManifestId ||
    record.adapterRevision !== expectedDeployment.adapterRevision
  ) {
    throw invalid("Receipt proof does not use the expected finality policy.");
  }
  const block = parseFinalizedBlockAnchor(record.block, policy, now);
  const canonicalityCheckedAt = parseCanonicalInstant(
    record.canonicalityCheckedAt,
    "canonicalityCheckedAt",
  );
  if (
    instantMilliseconds(canonicalityCheckedAt) <
      instantMilliseconds(block.finalizedAt) ||
    instantMilliseconds(canonicalityCheckedAt) > instantMilliseconds(now)
  ) {
    throw invalid("Receipt canonicality check is outside its trusted time window.");
  }
  return {
    kind: "canonical-finalized-receipt.v1",
    receiptEvidenceId: parseAuthorityId(record.receiptEvidenceId, "receiptEvidenceId"),
    chainId,
    transactionHash: parseHash32(record.transactionHash, "transactionHash"),
    transactionIndex: parseLogIndex(record.transactionIndex, "transactionIndex"),
    block,
    status: 1,
    receiptDigest: parseHash32(record.receiptDigest, "receiptDigest"),
    finalityPolicyId: parseAuthorityId(record.finalityPolicyId, "finalityPolicyId"),
    deploymentManifestId: parseAuthorityId(
      record.deploymentManifestId,
      "deploymentManifestId",
    ),
    adapterRevision: parseAuthorityId(record.adapterRevision, "adapterRevision"),
    canonicalityCheckedAt,
  };
}

export function parseCanonicalPurchaseEvidence(
  value: unknown,
  policy: FinalityPolicy,
  expectedValue: CanonicalPurchaseVerificationExpectation,
): CanonicalPurchaseEvidence {
  const expected = parseCanonicalPurchaseVerificationExpectation(expectedValue);
  assertExpectationMatchesPolicy(expected, policy);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("Canonical purchase evidence must be an object.");
  }
  const kind = (value as Record<string, unknown>).kind;
  if (kind === "juicebox-v6-payment-beneficiary-evidence.v1") {
    if (expected.claim.kind !== "juicebox-v6-payment-beneficiary-claim.v1") {
      throw invalid("Purchase evidence kind does not match the server-issued claim.");
    }
    const record = expectExactRecord(
      value,
      [
        "kind",
        "evidenceId",
        "receipt",
        "pay",
        "terminal",
        "project",
        "customerAccount",
        "customerSubjectSource",
        "payerAttribution",
        "transactionSenderAttribution",
        "callerAttribution",
        "refundStatus",
      ],
      "payment beneficiary evidence",
    );
    assertFixedSemantics(record);
    const common = parsePurchaseCommon(record, policy, expected);
    if (common.pay.amount === "0") {
      throw invalid(
        "A zero-value Pay is purchase evidence only with exact tier pay-credit correlation.",
      );
    }
    const evidence = {
      kind,
      claimId: expected.claim.claimId,
      ...common,
      customerSubjectSource: "pay-beneficiary",
      payerAttribution: "not-evaluated",
      transactionSenderAttribution: "never-inferred",
      callerAttribution: "never-inferred",
      refundStatus: "not-evaluated",
    } as const;
    return {
      ...evidence,
      evidenceDigest: computeCanonicalPurchaseEvidenceDigest({
        claim: expected.claim,
        deployment: expected.deployment,
        evidence,
      }),
    };
  }
  if (kind === "juicebox-v6-tier-purchase-evidence.v1") {
    const record = expectExactRecord(
      value,
      [
        "kind",
        "evidenceId",
        "receipt",
        "pay",
        "afterPayHook",
        "mints",
        "terminal",
        "tierHook",
        "project",
        "customerAccount",
        "customerSubjectSource",
        "correlationEvidence",
        "payerAttribution",
        "transactionSenderAttribution",
        "callerAttribution",
        "refundStatus",
      ],
      "tier purchase evidence",
    );
    assertFixedSemantics(record);
    if (expected.claim.kind !== "juicebox-v6-tier-purchase-claim.v1") {
      throw invalid("Purchase evidence kind does not match the server-issued claim.");
    }
    const common = parsePurchaseCommon(record, policy, expected);
    const afterPayHook = parseHookAfterPay(
      record.afterPayHook,
      common.receipt,
      expected.deployment,
    );
    const tierHook = parseTierHook(
      record.tierHook,
      common.project,
      common.receipt,
      policy,
      expected.deployment,
      expected.now,
    );
    if (
      afterPayHook.hook !== tierHook.hook ||
      afterPayHook.log.emitter !== common.terminal.terminal ||
      !sameJuiceboxV6ProjectRef(afterPayHook.project, common.project) ||
      afterPayHook.rulesetId !== common.pay.rulesetId ||
      afterPayHook.payer !== common.pay.payer ||
      afterPayHook.beneficiary !== common.customerAccount ||
      afterPayHook.amount.value !== common.pay.amount ||
      afterPayHook.newlyIssuedTokenCount !== common.pay.newlyIssuedTokenCount ||
      afterPayHook.caller !== common.pay.caller
    ) {
      throw invalid("After-pay context does not exactly match the selected Pay log.");
    }
    const mints = parseMints(
      record.mints,
      common.receipt,
      tierHook.hook,
      common.terminal.terminal,
      expected.deployment,
    );
    if (mints.some((mint) => mint.beneficiary !== common.customerAccount)) {
      throw invalid("Tier mint beneficiary must match the Pay beneficiary.");
    }
    if (
      mints.some(
        (mint) =>
          mint.log.logIndex <= common.pay.log.logIndex ||
          mint.log.logIndex >= afterPayHook.log.logIndex,
      )
    ) {
      throw invalid(
        "Tier Mint logs must occur after Pay and before the selected HookAfterRecordPay log.",
      );
    }
    const selectedIndices = [
      common.pay.log.logIndex,
      afterPayHook.log.logIndex,
      ...mints.map((mint) => mint.log.logIndex),
    ];
    if (new Set(selectedIndices).size !== selectedIndices.length) {
      throw invalid("Every correlated log must have a distinct explicit logIndex.");
    }
    const claimedMintLogIndices = expected.claim.mintLogIndices;
    if (
      afterPayHook.log.logIndex !== expected.claim.afterPayHookLogIndex ||
      mints.length !== claimedMintLogIndices.length ||
      mints.some(
        (mint, index) => mint.log.logIndex !== claimedMintLogIndices[index],
      )
    ) {
      throw invalid("Tier evidence does not match the server-claimed log indices.");
    }
    const correlationEvidence = parseTierCorrelationEvidence(
      record.correlationEvidence,
      common.receipt,
      common.pay,
      afterPayHook,
      mints,
      common.terminal,
      tierHook,
      expected.deployment,
    );
    const evidence = {
      kind,
      claimId: expected.claim.claimId,
      ...common,
      afterPayHook,
      mints,
      tierHook,
      customerSubjectSource: "pay-beneficiary",
      correlationEvidence,
      payerAttribution: "not-evaluated",
      transactionSenderAttribution: "never-inferred",
      callerAttribution: "never-inferred",
      refundStatus: "not-evaluated",
    } as const;
    return {
      ...evidence,
      evidenceDigest: computeCanonicalPurchaseEvidenceDigest({
        claim: expected.claim,
        deployment: expected.deployment,
        evidence,
      }),
    };
  }
  throw invalid("Canonical purchase evidence kind is unsupported.");
}

export function parseCanonicalPurchaseClaim(value: unknown): CanonicalPurchaseClaim {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("Canonical purchase claim must be an object.");
  }
  const kind = (value as Record<string, unknown>).kind;
  if (kind === "juicebox-v6-payment-beneficiary-claim.v1") {
    const record = expectExactRecord(
      value,
      [
        "kind",
        "claimId",
        "project",
        "transactionHash",
        "payLogIndex",
        "expectedBeneficiary",
        "customerSubjectSource",
      ],
      "payment beneficiary claim",
    );
    if (record.customerSubjectSource !== "pay-beneficiary") {
      throw invalid("Payment customer claims must use the Pay beneficiary.");
    }
    return {
      kind,
      claimId: parseAuthorityId(record.claimId, "claimId"),
      project: parseJuiceboxV6ProjectRef(record.project),
      transactionHash: parseHash32(record.transactionHash, "transactionHash"),
      payLogIndex: parseLogIndex(record.payLogIndex, "payLogIndex"),
      expectedBeneficiary: parseEthereumAddress(
        record.expectedBeneficiary,
        "expected beneficiary",
      ),
      customerSubjectSource: "pay-beneficiary",
    };
  }
  if (kind === "juicebox-v6-tier-purchase-claim.v1") {
    const record = expectExactRecord(
      value,
      [
        "kind",
        "claimId",
        "project",
        "transactionHash",
        "payLogIndex",
        "afterPayHookLogIndex",
        "mintLogIndices",
        "expectedBeneficiary",
        "customerSubjectSource",
      ],
      "tier purchase claim",
    );
    if (record.customerSubjectSource !== "pay-beneficiary") {
      throw invalid("Tier purchase customer claims must use the Pay beneficiary.");
    }
    if (
      !Array.isArray(record.mintLogIndices) ||
      record.mintLogIndices.length < 1 ||
      record.mintLogIndices.length > 256
    ) {
      throw invalid("Tier purchase claim requires explicit bounded Mint log indices.");
    }
    const payLogIndex = parseLogIndex(record.payLogIndex, "payLogIndex");
    const afterPayHookLogIndex = parseLogIndex(
      record.afterPayHookLogIndex,
      "afterPayHookLogIndex",
    );
    const mintLogIndices = record.mintLogIndices.map((item) =>
      parseLogIndex(item, "mintLogIndex"),
    );
    const allIndices = [payLogIndex, afterPayHookLogIndex, ...mintLogIndices];
    if (
      new Set(allIndices).size !== allIndices.length ||
      [...mintLogIndices].sort((a, b) => a - b).some(
        (item, index) => item !== mintLogIndices[index],
      ) ||
      mintLogIndices.some(
        (index) => index <= payLogIndex || index >= afterPayHookLogIndex,
      )
    ) {
      throw invalid(
        "Claimed Mint indices must be unique, sorted, after Pay, and before HookAfterRecordPay.",
      );
    }
    return {
      kind,
      claimId: parseAuthorityId(record.claimId, "claimId"),
      project: parseJuiceboxV6ProjectRef(record.project),
      transactionHash: parseHash32(record.transactionHash, "transactionHash"),
      payLogIndex,
      afterPayHookLogIndex,
      mintLogIndices: mintLogIndices as [number, ...number[]],
      expectedBeneficiary: parseEthereumAddress(
        record.expectedBeneficiary,
        "expected beneficiary",
      ),
      customerSubjectSource: "pay-beneficiary",
    };
  }
  throw invalid("Canonical purchase claim kind is unsupported.");
}

export function parseCanonicalPurchaseVerificationExpectation(
  value: unknown,
): CanonicalPurchaseVerificationExpectation {
  const record = expectExactRecord(
    value,
    ["claim", "deployment", "now"],
    "canonical purchase verification expectation",
  );
  const claim = parseCanonicalPurchaseClaim(record.claim);
  const deploymentRecord = expectExactRecord(
    record.deployment,
    [
      "deploymentManifestId",
      "projectsContract",
      "adapterRevision",
      "abiDigests",
      "terminal",
      "tierHook",
    ],
    "canonical purchase deployment expectation",
  );
  const abiRecord = expectExactRecord(
    deploymentRecord.abiDigests,
    ["pay", "hookAfterRecordPay", "tierMint"],
    "canonical purchase ABI expectations",
  );
  const terminalRecord = expectExactRecord(
    deploymentRecord.terminal,
    ["address", "implementationCodeHash"],
    "canonical terminal expectation",
  );
  const tierHookRecord =
    deploymentRecord.tierHook === null
      ? null
      : expectExactRecord(
          deploymentRecord.tierHook,
          ["address", "implementationCodeHash"],
          "canonical tier hook expectation",
        );
  const deployment: CanonicalPurchaseDeploymentExpectation = {
    deploymentManifestId: parseAuthorityId(
      deploymentRecord.deploymentManifestId,
      "expected deployment manifest ID",
    ),
    projectsContract: parseEthereumAddress(
      deploymentRecord.projectsContract,
      "expected JBProjects contract",
    ),
    adapterRevision: parseAuthorityId(
      deploymentRecord.adapterRevision,
      "expected adapter revision",
    ),
    abiDigests: {
      pay: parseHash32(abiRecord.pay, "expected Pay ABI digest"),
      hookAfterRecordPay: parseHash32(
        abiRecord.hookAfterRecordPay,
        "expected HookAfterRecordPay ABI digest",
      ),
      tierMint: parseHash32(abiRecord.tierMint, "expected tier Mint ABI digest"),
    },
    terminal: {
      address: parseEthereumAddress(
        terminalRecord.address,
        "expected terminal address",
      ),
      implementationCodeHash: parseHash32(
        terminalRecord.implementationCodeHash,
        "expected terminal code hash",
      ),
    },
    tierHook:
      tierHookRecord === null
        ? null
        : {
            address: parseEthereumAddress(
              tierHookRecord.address,
              "expected tier hook address",
            ),
            implementationCodeHash: parseHash32(
              tierHookRecord.implementationCodeHash,
              "expected tier hook code hash",
            ),
          },
  };
  if (
    deployment.deploymentManifestId !== claim.project.deploymentManifestId ||
    deployment.projectsContract !== claim.project.projectsContract
  ) {
    throw invalid("Trusted deployment expectations do not match the claimed project.");
  }
  if (
    (claim.kind === "juicebox-v6-payment-beneficiary-claim.v1" &&
      deployment.tierHook !== null) ||
    (claim.kind === "juicebox-v6-tier-purchase-claim.v1" &&
      deployment.tierHook === null)
  ) {
    throw invalid("Trusted deployment hook expectations do not match the claim kind.");
  }
  return {
    claim,
    deployment,
    now: parseCanonicalInstant(record.now, "purchase verification now"),
  };
}

export function parseCanonicalPurchaseVerificationResult(
  value: unknown,
  policy: FinalityPolicy,
  expectedValue: CanonicalPurchaseVerificationExpectation,
): ClaimBoundCanonicalPurchaseVerificationResult {
  const expected = parseCanonicalPurchaseVerificationExpectation(expectedValue);
  assertExpectationMatchesPolicy(expected, policy);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("Canonical purchase verification result must be an object.");
  }
  const status = (value as Record<string, unknown>).status;
  if (status === "verified") {
    const record = expectExactRecord(
      value,
      ["status", "claimId", "evidence"],
      "canonical purchase verification result",
    );
    const claimId = parseExpectedClaimId(record.claimId, expected.claim);
    const result = deepFreezeAuthorityValue<VerifiedCanonicalPurchaseVerificationResult>({
      status,
      claimId,
      evidence: parseCanonicalPurchaseEvidence(record.evidence, policy, expected),
    });
    verifiedCanonicalPurchaseResults.add(result);
    return result;
  }
  if (status === "ineligible") {
    const record = expectExactRecord(
      value,
      ["status", "claimId", "reasonCode"],
      "canonical purchase verification result",
    );
    if (!INELIGIBLE_PURCHASE_REASON_CODES.has(record.reasonCode)) {
      throw invalid("Canonical purchase ineligibility reason is unsupported.");
    }
    return {
      status,
      claimId: parseExpectedClaimId(record.claimId, expected.claim),
      reasonCode: record.reasonCode as Extract<
        ClaimBoundCanonicalPurchaseVerificationResult,
        { status: "ineligible" }
      >["reasonCode"],
    };
  }
  if (status === "pending-finality") {
    const record = expectExactRecord(
      value,
      ["status", "claimId", "reasonCode"],
      "canonical purchase verification result",
    );
    if (record.reasonCode !== "receipt-above-finalized-head") {
      throw invalid("Canonical purchase finality reason is unsupported.");
    }
    return {
      status,
      claimId: parseExpectedClaimId(record.claimId, expected.claim),
      reasonCode: "receipt-above-finalized-head",
    };
  }
  if (status === "unavailable") {
    const record = expectExactRecord(
      value,
      ["status", "claimId", "reasonCode"],
      "canonical purchase verification result",
    );
    if (!UNAVAILABLE_PURCHASE_REASON_CODES.has(record.reasonCode)) {
      throw invalid("Canonical purchase unavailability reason is unsupported.");
    }
    return {
      status,
      claimId: parseExpectedClaimId(record.claimId, expected.claim),
      reasonCode: record.reasonCode as Extract<
        ClaimBoundCanonicalPurchaseVerificationResult,
        { status: "unavailable" }
      >["reasonCode"],
    };
  }
  throw invalid("Canonical purchase verification result status is unsupported.");
}

export function computeRefundRecordCanonicalPayloadDigest(value: unknown): Hash32 {
  return sha256AuthorityDigest({
    kind: "refund-record-canonical-payload-digest.v1",
    payload: value,
  });
}

export function computeCanonicalPurchaseEvidenceId(
  claimValue: unknown,
): AuthorityId {
  const claim = parseCanonicalPurchaseClaim(claimValue);
  const digest = sha256AuthorityDigest({
    kind: "canonical-purchase-evidence-id.v1",
    claim,
  });
  return parseAuthorityId(`purchase:${digest.slice(2)}`, "purchase evidence ID");
}

export function computeCanonicalPurchaseEvidenceDigest(value: unknown): Hash32 {
  return sha256AuthorityDigest({
    kind: "canonical-purchase-evidence-digest.v1",
    binding: value,
  });
}

export function computeRefundEligibilityResourceDigest(value: unknown): Hash32 {
  return sha256AuthorityDigest({
    kind: "refund-eligibility-resource-digest.v1",
    binding: value,
  });
}

export function computeRefundStableHeadDigest(value: unknown): Hash32 {
  return sha256AuthorityDigest({
    kind: "refund-stable-head-digest.v1",
    stableHead: value,
  });
}

export function computeRefundHeadCanonicalPayloadDigest(value: unknown): Hash32 {
  return sha256AuthorityDigest({
    kind: "refund-head-canonical-payload-digest.v1",
    payload: value,
  });
}

export function computeRefundSignatureDigest(signature: HexBytes): Hash32 {
  return sha256AuthorityDigest({
    kind: "refund-attestation-signature-digest.v1",
    signature,
  });
}

export function computeRefundVerificationEvidenceDigest(value: unknown): Hash32 {
  return sha256AuthorityDigest({
    kind: "refund-attestation-verification-evidence-digest.v1",
    verification: value,
  });
}

export function parseRefundAttestationVerificationResult(
  value: unknown,
  expected: RefundAttestationVerificationExpectation,
): RefundAttestationVerificationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("Refund attestation verification result must be an object.");
  }
  const status = (value as Record<string, unknown>).status;
  if (status === "invalid") {
    const record = expectExactRecord(
      value,
      ["status", "attestationId", "reasonCode"],
      "refund attestation verification result",
    );
    const attestationId = parseExpectedAttestationId(
      record.attestationId,
      expected,
    );
    if (!INVALID_REFUND_ATTESTATION_REASON_CODES.has(record.reasonCode)) {
      throw invalid("Refund attestation invalidity reason is unsupported.");
    }
    return {
      status,
      attestationId,
      reasonCode: record.reasonCode as Extract<
        RefundAttestationVerificationResult,
        { status: "invalid" }
      >["reasonCode"],
    };
  }
  if (status === "unavailable") {
    const record = expectExactRecord(
      value,
      ["status", "attestationId", "reasonCode"],
      "refund attestation verification result",
    );
    const attestationId = parseExpectedAttestationId(
      record.attestationId,
      expected,
    );
    if (!UNAVAILABLE_REFUND_ATTESTATION_REASON_CODES.has(record.reasonCode)) {
      throw invalid("Refund attestation unavailability reason is unsupported.");
    }
    return {
      status,
      attestationId,
      reasonCode: record.reasonCode as Extract<
        RefundAttestationVerificationResult,
        { status: "unavailable" }
      >["reasonCode"],
    };
  }
  if (status !== "verified") {
    throw invalid("Refund attestation verification status is unsupported.");
  }
  const record = expectExactRecord(
    value,
    [
      "status",
      "attestationId",
      "attestationKind",
      "verificationEvidenceId",
      "verificationEvidenceDigest",
      "attestationDomain",
      "signatureScheme",
      "primaryType",
      "attestationDomainSeparatorDigest",
      "canonicalPayloadDigest",
      "signatureDigest",
      "signer",
      "issuerDeviceCredentialId",
      "project",
      "purchaseEvidenceId",
      "purchaseEvidenceDigest",
      "resourceDigest",
      "ledgerSequence",
      "lookupRequestId",
      "authorityGenerationId",
      "authorityGenerationSequence",
      "rootAuthorityEvidenceId",
      "rootAuthorityEvidenceDigest",
      "refundPolicyId",
      "refundPolicyRevision",
      "verifierPolicyId",
      "verifierPolicyRevision",
      "verifierKeyId",
      "verificationMethod",
      "verifiedAt",
    ],
    "verified refund attestation result",
  );
  const attestationId = parseExpectedAttestationId(
    record.attestationId,
    expected,
  );
  const project = parseJuiceboxV6ProjectRef(record.project);
  const canonicalPayloadDigest = parseHash32(
    record.canonicalPayloadDigest,
    "verified refund payload digest",
  );
  const attestationDomainSeparatorDigest = parseHash32(
    record.attestationDomainSeparatorDigest,
    "verified refund attestation domain separator digest",
  );
  const signatureDigest = parseHash32(
    record.signatureDigest,
    "verified refund signature digest",
  );
  const signer = parseEthereumAddress(record.signer, "verified refund signer");
  const issuerDeviceCredentialId = parseAuthorityId(
    record.issuerDeviceCredentialId,
    "verified refund issuer credential ID",
  );
  const purchaseEvidenceId = parseAuthorityId(
    record.purchaseEvidenceId,
    "verified refund purchase evidence ID",
  );
  const purchaseEvidenceDigest = parseHash32(
    record.purchaseEvidenceDigest,
    "verified purchase evidence digest",
  );
  const resourceDigest = parseHash32(
    record.resourceDigest,
    "verified refund resource digest",
  );
  const ledgerSequence = parseUint256Decimal(
    record.ledgerSequence,
    "verified refund ledger sequence",
  );
  const lookupRequestId =
    record.lookupRequestId === null
      ? null
      : parseAuthorityId(record.lookupRequestId, "verified lookup request ID");
  const authorityGenerationId = parseAuthorityId(
    record.authorityGenerationId,
    "verified refund authority generation ID",
  );
  const authorityGenerationSequence = parseUint256Decimal(
    record.authorityGenerationSequence,
    "verified refund authority generation sequence",
  );
  const rootAuthorityEvidenceId = parseAuthorityId(
    record.rootAuthorityEvidenceId,
    "verified root authority evidence ID",
  );
  const rootAuthorityEvidenceDigest = parseHash32(
    record.rootAuthorityEvidenceDigest,
    "verified root authority evidence digest",
  );
  const refundPolicyId = parseAuthorityId(
    record.refundPolicyId,
    "verified refund policy ID",
  );
  const refundPolicyRevision = parseUint256Decimal(
    record.refundPolicyRevision,
    "verified refund policy revision",
  );
  const verifierPolicyId = parseAuthorityId(
    record.verifierPolicyId,
    "refund signature verifier policy ID",
  );
  const verifierPolicyRevision = parseUint256Decimal(
    record.verifierPolicyRevision,
    "refund signature verifier policy revision",
  );
  const verifierKeyId = parseAuthorityId(
    record.verifierKeyId,
    "refund signature verifier key ID",
  );
  const verifiedAt = parseCanonicalInstant(record.verifiedAt, "verifiedAt");
  if (
    record.attestationKind !== expected.attestationKind ||
    record.attestationDomain !== "juicebox-messaging-refund-ledger-v1" ||
    record.signatureScheme !== "eip712-v4" ||
    record.primaryType !== expected.primaryType ||
    attestationDomainSeparatorDigest !==
      expected.attestationDomainSeparatorDigest ||
    canonicalPayloadDigest !== expected.canonicalPayloadDigest ||
    signatureDigest !== expected.signatureDigest ||
    signer !== expected.signer ||
    issuerDeviceCredentialId !== expected.issuerDeviceCredentialId ||
    !sameJuiceboxV6ProjectRef(project, expected.project) ||
    purchaseEvidenceId !== expected.purchaseEvidenceId ||
    purchaseEvidenceDigest !== expected.purchaseEvidenceDigest ||
    resourceDigest !== expected.resourceDigest ||
    ledgerSequence !== expected.ledgerSequence ||
    lookupRequestId !== expected.lookupRequestId ||
    authorityGenerationId !== expected.authorityGenerationId ||
    authorityGenerationSequence !== expected.authorityGenerationSequence ||
    rootAuthorityEvidenceId !== expected.rootAuthorityEvidenceId ||
    rootAuthorityEvidenceDigest !== expected.rootAuthorityEvidenceDigest ||
    refundPolicyId !== expected.refundPolicyId ||
    refundPolicyRevision !== expected.refundPolicyRevision ||
    verifierPolicyId !== expected.verifierPolicyId ||
    verifierPolicyRevision !== expected.verifierPolicyRevision ||
    verifierKeyId !== expected.verifierKeyId ||
    instantMilliseconds(verifiedAt) < instantMilliseconds(expected.notBefore) ||
    instantMilliseconds(verifiedAt) > instantMilliseconds(expected.now)
  ) {
    throw invalid("Verified refund attestation is detached from its server claim.");
  }
  if (
    record.verificationMethod !== "eoa-ecrecover" &&
    record.verificationMethod !== "erc1271" &&
    record.verificationMethod !== "erc6492"
  ) {
    throw invalid("Refund attestation verification method is unsupported.");
  }
  const verificationEvidenceId = parseAuthorityId(
    record.verificationEvidenceId,
    "refund signature verification evidence ID",
  );
  const verificationEvidenceDigest = parseHash32(
    record.verificationEvidenceDigest,
    "refund signature verification evidence digest",
  );
  const verificationEvidencePayload = {
    kind: "verified-refund-attestation-evidence.v1",
    attestationId,
    attestationKind: expected.attestationKind,
    verificationEvidenceId,
    attestationDomain: "juicebox-messaging-refund-ledger-v1",
    signatureScheme: "eip712-v4",
    primaryType: expected.primaryType,
    attestationDomainSeparatorDigest,
    canonicalPayloadDigest,
    signatureDigest,
    signer,
    issuerDeviceCredentialId,
    project,
    purchaseEvidenceId,
    purchaseEvidenceDigest,
    resourceDigest,
    ledgerSequence,
    lookupRequestId,
    authorityGenerationId,
    authorityGenerationSequence,
    rootAuthorityEvidenceId,
    rootAuthorityEvidenceDigest,
    refundPolicyId,
    refundPolicyRevision,
    verifierPolicyId,
    verifierPolicyRevision,
    verifierKeyId,
    verificationMethod: record.verificationMethod,
    verifiedAt,
  };
  if (
    verificationEvidenceDigest !==
    computeRefundVerificationEvidenceDigest(verificationEvidencePayload)
  ) {
    throw invalid("Refund signature verification evidence digest is invalid.");
  }
  return {
    status,
    attestationId,
    attestationKind: expected.attestationKind,
    verificationEvidenceId,
    verificationEvidenceDigest,
    attestationDomain: "juicebox-messaging-refund-ledger-v1",
    signatureScheme: "eip712-v4",
    primaryType: expected.primaryType,
    attestationDomainSeparatorDigest,
    canonicalPayloadDigest,
    signatureDigest,
    signer,
    issuerDeviceCredentialId,
    project,
    purchaseEvidenceId,
    purchaseEvidenceDigest,
    resourceDigest,
    ledgerSequence,
    lookupRequestId,
    authorityGenerationId,
    authorityGenerationSequence,
    rootAuthorityEvidenceId,
    rootAuthorityEvidenceDigest,
    refundPolicyId,
    refundPolicyRevision,
    verifierPolicyId,
    verifierPolicyRevision,
    verifierKeyId,
    verificationMethod: record.verificationMethod,
    verifiedAt,
  };
}

export function parseRefundLedgerExpectation(
  value: unknown,
  verifiedPurchase: VerifiedCanonicalPurchaseVerificationResult,
): RefundLedgerExpectation {
  if (!verifiedCanonicalPurchaseResults.has(verifiedPurchase)) {
    throw invalid(
      "Refund lookup expectations require a claim-bound verified purchase result.",
    );
  }
  const record = expectExactRecord(
    value,
    [
      "resource",
      "authorityGenerationId",
      "authorityGenerationSequence",
      "rootAuthorityEvidenceId",
      "rootAuthorityEvidenceDigest",
      "rootSigner",
      "rootSignerProofDigest",
      "issuerDeviceCredentialId",
      "issuerWalletVerificationEvidenceId",
      "policyId",
      "policyRevision",
      "lookupRequestId",
      "lookupChallengeDigest",
      "now",
      "maximumHeadAgeMilliseconds",
      "latestObservedHead",
      "refundAttestationDomainSeparatorDigest",
      "attestationVerifierPolicyId",
      "attestationVerifierPolicyRevision",
      "attestationVerifierKeyId",
    ],
    "refund ledger expectation",
  );
  const resource = parseRefundEligibilityResource(
    record.resource,
    verifiedPurchase.evidence,
  );
  const project = verifiedPurchase.evidence.project;
  const purchaseEvidenceId = verifiedPurchase.evidence.evidenceId;
  const purchaseEvidenceDigest = verifiedPurchase.evidence.evidenceDigest;
  const resourceDigest = computeRefundEligibilityResourceDigest({
    project,
    purchaseEvidenceId,
    purchaseEvidenceDigest,
    resource,
  });
  const maximumHeadAgeMilliseconds = parseBoundedCount(
    record.maximumHeadAgeMilliseconds,
    "maximum refund ledger head age",
    1,
    MAXIMUM_REFUND_LEDGER_HEAD_AGE_MILLISECONDS,
  );
  let latestObservedHead: ObservedRefundLedgerHead | null = null;
  if (record.latestObservedHead !== null) {
    const observed = expectExactRecord(
      record.latestObservedHead,
      [
        "resourceDigest",
        "sequence",
        "headDigest",
        "ledgerRecordedAt",
        "currentStatus",
        "currentRecordId",
        "currentRecordDigest",
        "eligibilityEffect",
        "currentCase",
      ],
      "latest observed refund ledger head",
    );
    const observedResourceDigest = parseHash32(
      observed.resourceDigest,
      "observed refund resource digest",
    );
    if (observedResourceDigest !== resourceDigest) {
      throw invalid("Observed refund head belongs to another authority resource.");
    }
    if (
      observed.currentStatus !== "recorded" &&
      observed.currentStatus !== "no-applicable-entry"
    ) {
      throw invalid("Observed refund head status is unsupported.");
    }
    if (observed.eligibilityEffect !== "clear" && observed.eligibilityEffect !== "block") {
      throw invalid("Observed refund eligibility effect is unsupported.");
    }
    const currentRecordId =
      observed.currentRecordId === null
        ? null
        : parseAuthorityId(observed.currentRecordId, "observed refund record ID");
    const currentRecordDigest =
      observed.currentRecordDigest === null
        ? null
        : parseHash32(observed.currentRecordDigest, "observed refund record digest");
    const currentCase = parseObservedRefundOrderCase(observed.currentCase, resource);
    if (
      (observed.currentStatus === "recorded" &&
        (currentRecordId === null || currentRecordDigest === null || currentCase === null)) ||
      (observed.currentStatus === "no-applicable-entry" &&
        (currentRecordId !== null ||
          currentRecordDigest !== null ||
          currentCase !== null ||
          observed.eligibilityEffect !== "clear")) ||
      (currentCase !== null &&
        observed.eligibilityEffect !==
          refundEligibilityEffect(currentCase.state, currentCase.resolution))
    ) {
      throw invalid("Observed refund head snapshot is internally inconsistent.");
    }
    latestObservedHead = {
      resourceDigest: observedResourceDigest,
      sequence: parseUint256Decimal(observed.sequence, "observed head sequence"),
      headDigest: parseHash32(observed.headDigest, "observed head digest"),
      ledgerRecordedAt: parseCanonicalInstant(
        observed.ledgerRecordedAt,
        "observed head ledgerRecordedAt",
      ),
      currentStatus: observed.currentStatus,
      currentRecordId,
      currentRecordDigest,
      eligibilityEffect: observed.eligibilityEffect,
      currentCase,
    };
  }
  const now = parseCanonicalInstant(record.now, "refund lookup now");
  if (
    latestObservedHead !== null &&
    instantMilliseconds(latestObservedHead.ledgerRecordedAt) >
      instantMilliseconds(now)
  ) {
    throw invalid("Previously observed refund head cannot be in the future.");
  }
  const expectation = deepFreezeAuthorityValue<RefundLedgerExpectation>({
    project,
    purchaseEvidenceId,
    purchaseEvidenceDigest,
    resource,
    resourceDigest,
    authorityGenerationId: parseAuthorityId(
      record.authorityGenerationId,
      "expected authority generation ID",
    ),
    authorityGenerationSequence: parseUint256Decimal(
      record.authorityGenerationSequence,
      "expected authority generation sequence",
    ),
    rootAuthorityEvidenceId: parseAuthorityId(
      record.rootAuthorityEvidenceId,
      "expected root authority evidence ID",
    ),
    rootAuthorityEvidenceDigest: parseHash32(
      record.rootAuthorityEvidenceDigest,
      "expected root authority evidence digest",
    ),
    rootSigner: parseEthereumAddress(record.rootSigner, "expected root signer"),
    rootSignerProofDigest: parseHash32(
      record.rootSignerProofDigest,
      "expected root signer proof digest",
    ),
    issuerDeviceCredentialId: parseAuthorityId(
      record.issuerDeviceCredentialId,
      "expected issuer device credential ID",
    ),
    issuerWalletVerificationEvidenceId: parseAuthorityId(
      record.issuerWalletVerificationEvidenceId,
      "expected issuer wallet verification evidence ID",
    ),
    policyId: parseAuthorityId(record.policyId, "expected refund policy ID"),
    policyRevision: parseUint256Decimal(
      record.policyRevision,
      "expected refund policy revision",
    ),
    lookupRequestId: parseAuthorityId(
      record.lookupRequestId,
      "refund lookup request ID",
    ),
    lookupChallengeDigest: parseHash32(
      record.lookupChallengeDigest,
      "refund lookup challenge digest",
    ),
    now,
    maximumHeadAgeMilliseconds,
    latestObservedHead,
    refundAttestationDomainSeparatorDigest: parseHash32(
      record.refundAttestationDomainSeparatorDigest,
      "expected refund attestation domain separator digest",
    ),
    attestationVerifierPolicyId: parseAuthorityId(
      record.attestationVerifierPolicyId,
      "refund attestation verifier policy ID",
    ),
    attestationVerifierPolicyRevision: parseUint256Decimal(
      record.attestationVerifierPolicyRevision,
      "refund attestation verifier policy revision",
    ),
    attestationVerifierKeyId: parseAuthorityId(
      record.attestationVerifierKeyId,
      "refund attestation verifier key ID",
    ),
  });
  validatedRefundLedgerExpectations.add(expectation);
  return expectation;
}

export function prepareRefundLedgerResult(
  value: unknown,
  expectedValue: RefundLedgerExpectation,
): PreparedRefundLedgerResult {
  const expected = requireValidatedRefundLedgerExpectation(expectedValue);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("Refund ledger result must be an object.");
  }
  const status = (value as Record<string, unknown>).status;
  if (status === "not-evaluated") {
    const record = expectExactRecord(
      value,
      ["status", "eligibilityEffect"],
      "refund ledger result",
    );
    if (record.eligibilityEffect !== "block") {
      throw invalid("An unevaluated refund status must block eligibility.");
    }
    return registerPreparedRefundLedgerResult(
      {
        status,
        verificationRequests: { head: null, currentRecord: null },
      },
      { status, eligibilityEffect: "block" },
    );
  }
  if (status === "unavailable") {
    const record = expectExactRecord(
      value,
      ["status", "eligibilityEffect", "reasonCode"],
      "refund ledger result",
    );
    if (
      record.reasonCode !== "refund-ledger-not-configured" &&
      record.reasonCode !== "refund-ledger-unavailable"
    ) {
      throw invalid("Refund ledger unavailability reason is unsupported.");
    }
    if (record.eligibilityEffect !== "block") {
      throw invalid("An unavailable refund ledger must block eligibility.");
    }
    return registerPreparedRefundLedgerResult(
      {
        status,
        verificationRequests: { head: null, currentRecord: null },
      },
      { status, eligibilityEffect: "block", reasonCode: record.reasonCode },
    );
  }
  if (status === "evaluated-no-applicable-entry") {
    const record = expectExactRecord(
      value,
      [
        "status",
        "eligibilityEffect",
        "project",
        "purchaseEvidenceId",
        "head",
        "evaluatedAt",
      ],
      "refund ledger result",
    );
    if (record.eligibilityEffect !== "clear") {
      throw invalid("A current signed no-entry result must explicitly clear eligibility.");
    }
    const project = parseJuiceboxV6ProjectRef(record.project);
    const purchaseEvidenceId = parseAuthorityId(
      record.purchaseEvidenceId,
      "purchaseEvidenceId",
    );
    assertRefundExpectation(project, purchaseEvidenceId, expected);
    const head = parseRefundLedgerHead(record.head, expected);
    if (
      head.currentStatus !== "no-applicable-entry" ||
      head.currentRecordId !== null ||
      head.currentRecordDigest !== null ||
      head.eligibilityEffect !== "clear"
    ) {
      throw invalid("No-entry result is not backed by a signed clear ledger head.");
    }
    const evaluatedAt = parseCanonicalInstant(record.evaluatedAt, "evaluatedAt");
    if (
      instantMilliseconds(evaluatedAt) < instantMilliseconds(head.signedAt) ||
      instantMilliseconds(evaluatedAt) > instantMilliseconds(expected.now)
    ) {
      throw invalid("No-entry evaluation must be at or after its head and not in future.");
    }
    const headExpectation = refundHeadAttestationExpectation(head, expected);
    return registerPreparedRefundLedgerResult(
      {
        status,
        verificationRequests: {
          head: { envelope: head.attestation, expectation: headExpectation },
          currentRecord: null,
        },
      },
      {
        status,
        result: {
          status,
          eligibilityEffect: "clear",
          project,
          purchaseEvidenceId,
          head,
          evaluatedAt,
        },
        headExpectation,
      },
    );
  }
  if (status === "recorded") {
    const outer = expectExactRecord(
      value,
      ["status", "eligibilityEffect", "head", "record"],
      "refund ledger result",
    );
    const head = parseRefundLedgerHead(outer.head, expected);
    const record = parseRefundRecord(outer.record, expected);
    if (
      record.ledgerSequence !== head.sequence ||
      record.priorLedgerHeadDigest !== head.priorHeadDigest ||
      record.recordedAt !== head.ledgerRecordedAt ||
      head.currentStatus !== "recorded" ||
      head.currentRecordId !== record.refundRecordId ||
      head.currentRecordDigest !== record.attestation.canonicalPayloadDigest ||
      head.eligibilityEffect !== record.eligibilityEffect ||
      outer.eligibilityEffect !== record.eligibilityEffect
    ) {
      throw invalid("Refund record is not the signed current status at the ledger head.");
    }
    const headExpectation = refundHeadAttestationExpectation(head, expected);
    const recordExpectation = refundRecordAttestationExpectation(record, expected);
    return registerPreparedRefundLedgerResult(
      {
        status,
        verificationRequests: {
          head: { envelope: head.attestation, expectation: headExpectation },
          currentRecord: {
            envelope: record.attestation,
            expectation: recordExpectation,
          },
        },
      },
      {
        status,
        result: {
          status,
          eligibilityEffect: record.eligibilityEffect,
          head,
          record,
        },
        headExpectation,
        recordExpectation,
      },
    );
  }
  throw invalid("Refund ledger result status is unsupported.");
}

export function finalizeRefundLedgerResult(
  prepared: PreparedRefundLedgerResult,
  verificationBundleValue: unknown,
): RefundLedgerResult {
  const state = preparedRefundLedgerStates.get(prepared);
  if (state === undefined) {
    throw invalid("Refund ledger result was not produced by the trusted prepare stage.");
  }
  const verificationBundle = expectExactRecord(
    verificationBundleValue,
    ["head", "currentRecord"],
    "refund attestation verification bundle",
  );
  if (state.status === "not-evaluated" || state.status === "unavailable") {
    assertNoRefundAttestationVerifications(verificationBundle);
    return state;
  }
  if (state.status === "evaluated-no-applicable-entry") {
    if (verificationBundle.currentRecord !== null) {
      throw invalid("A no-entry refund head cannot carry a record verification result.");
    }
    return {
      ...state.result,
      headAttestationVerification: requireVerifiedRefundAttestation(
        verificationBundle.head,
        state.headExpectation,
      ),
    };
  }
  if (verificationBundle.currentRecord === null) {
    throw invalid("Current refund record requires an independent signature result.");
  }
  return {
    ...state.result,
    headAttestationVerification: requireVerifiedRefundAttestation(
      verificationBundle.head,
      state.headExpectation,
    ),
    recordAttestationVerification: requireVerifiedRefundAttestation(
      verificationBundle.currentRecord,
      state.recordExpectation,
    ),
  };
}

/**
 * Compatibility composition for callers that already have verifier outputs.
 * New adapters should call prepareRefundLedgerResult, verify each returned
 * request, then pass those untrusted outputs to finalizeRefundLedgerResult.
 */
export function parseRefundLedgerResult(
  value: unknown,
  expectedValue: RefundLedgerExpectation,
  verificationBundleValue: RefundAttestationVerificationBundle,
): RefundLedgerResult {
  return finalizeRefundLedgerResult(
    prepareRefundLedgerResult(value, expectedValue),
    verificationBundleValue,
  );
}

function registerPreparedRefundLedgerResult<T extends PreparedRefundLedgerResult>(
  prepared: T,
  state: PreparedRefundLedgerState,
): T {
  const frozenPrepared = deepFreezeAuthorityValue(prepared);
  preparedRefundLedgerStates.set(
    frozenPrepared,
    deepFreezeAuthorityValue(state),
  );
  return frozenPrepared;
}

function parsePurchaseCommon(
  record: Record<string, unknown>,
  policy: FinalityPolicy,
  expected: CanonicalPurchaseVerificationExpectation,
): {
  evidenceId: AuthorityId;
  receipt: CanonicalReceiptProof;
  pay: CanonicalPayLog;
  terminal: CanonicalTerminalEvidence;
  project: JuiceboxV6ProjectRef;
  customerAccount: EthereumAddress;
} {
  const receipt = parseCanonicalReceiptProof(
    record.receipt,
    policy,
    expected.deployment,
    expected.now,
  );
  const project = parseJuiceboxV6ProjectRef(record.project);
  if (project.chainId !== policy.chainId) {
    throw invalid("Purchase evidence is on the wrong chain.");
  }
  if (receipt.deploymentManifestId !== project.deploymentManifestId) {
    throw invalid("Purchase evidence uses another deployment manifest.");
  }
  if (!sameJuiceboxV6ProjectRef(project, expected.claim.project)) {
    throw invalid("Purchase evidence is scoped to another server-claimed project.");
  }
  if (receipt.transactionHash !== expected.claim.transactionHash) {
    throw invalid("Purchase receipt does not match the server-claimed transaction.");
  }
  const pay = parsePay(record.pay, receipt, expected.deployment);
  const terminal = parseTerminal(
    record.terminal,
    project,
    receipt,
    policy,
    expected.deployment,
    expected.now,
  );
  const customerAccount = parseEthereumAddress(record.customerAccount, "customer account");
  if (
    !sameJuiceboxV6ProjectRef(pay.project, project) ||
    pay.beneficiary !== customerAccount ||
    pay.log.emitter !== terminal.terminal ||
    pay.log.logIndex !== expected.claim.payLogIndex ||
    customerAccount !== expected.claim.expectedBeneficiary
  ) {
    throw invalid("Purchase, terminal, project, and beneficiary bindings do not match.");
  }
  const evidenceId = parseAuthorityId(record.evidenceId, "purchase evidence ID");
  if (evidenceId !== computeCanonicalPurchaseEvidenceId(expected.claim)) {
    throw invalid("Purchase evidence ID is not canonically derived from its claim.");
  }
  return {
    evidenceId,
    receipt,
    pay,
    terminal,
    project,
    customerAccount,
  };
}

function parsePay(
  value: unknown,
  receipt: CanonicalReceiptProof,
  expectedDeployment: CanonicalPurchaseDeploymentExpectation,
): CanonicalPayLog {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "log",
      "project",
      "rulesetId",
      "rulesetCycleNumber",
      "payer",
      "beneficiary",
      "amount",
      "newlyIssuedTokenCount",
      "memoDigest",
      "metadataDigest",
      "caller",
      "accountingContext",
    ],
    "Pay log",
  );
  if (
    record.kind !== "juicebox-v6-pay-log.v1" ||
    record.accountingContext !== "not-contained-in-pay-event"
  ) {
    throw invalid("Pay evidence must not invent an accounting context.");
  }
  const project = parseJuiceboxV6ProjectRef(record.project);
  if (project.chainId !== receipt.chainId) throw invalid("Pay log is on the wrong chain.");
  return {
    kind: "juicebox-v6-pay-log.v1",
    log: parseLogRef(
      record.log,
      receipt,
      JUICEBOX_V6_EVENT_TOPICS.pay,
      expectedDeployment.abiDigests.pay,
    ),
    project,
    rulesetId: parseUint256Decimal(record.rulesetId, "rulesetId"),
    rulesetCycleNumber: parseUint256Decimal(
      record.rulesetCycleNumber,
      "rulesetCycleNumber",
    ),
    payer: parseEthereumAddress(record.payer, "Pay payer"),
    beneficiary: parseEthereumAddress(record.beneficiary, "Pay beneficiary"),
    amount: parseUint256Decimal(record.amount, "Pay amount"),
    newlyIssuedTokenCount: parseUint256Decimal(
      record.newlyIssuedTokenCount,
      "newlyIssuedTokenCount",
    ),
    memoDigest: parseHash32(record.memoDigest, "memo digest"),
    metadataDigest: parseHash32(record.metadataDigest, "metadata digest"),
    caller: parseEthereumAddress(record.caller, "Pay caller"),
    accountingContext: "not-contained-in-pay-event",
  };
}

function parseHookAfterPay(
  value: unknown,
  receipt: CanonicalReceiptProof,
  expectedDeployment: CanonicalPurchaseDeploymentExpectation,
): CanonicalHookAfterRecordPayLog {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "log",
      "hook",
      "project",
      "rulesetId",
      "payer",
      "beneficiary",
      "amount",
      "newlyIssuedTokenCount",
      "contextDigest",
      "specificationAmount",
      "caller",
    ],
    "HookAfterRecordPay log",
  );
  if (record.kind !== "juicebox-v6-hook-after-record-pay-log.v1") {
    throw invalid("After-pay hook log kind is unsupported.");
  }
  const project = parseJuiceboxV6ProjectRef(record.project);
  if (project.chainId !== receipt.chainId) {
    throw invalid("HookAfterRecordPay log is on the wrong chain.");
  }
  return {
    kind: "juicebox-v6-hook-after-record-pay-log.v1",
    log: parseLogRef(
      record.log,
      receipt,
      JUICEBOX_V6_EVENT_TOPICS.hookAfterRecordPay,
      expectedDeployment.abiDigests.hookAfterRecordPay,
    ),
    hook: parseEthereumAddress(record.hook, "pay hook"),
    project,
    rulesetId: parseUint256Decimal(record.rulesetId, "rulesetId"),
    payer: parseEthereumAddress(record.payer, "hook context payer"),
    beneficiary: parseEthereumAddress(
      record.beneficiary,
      "hook context beneficiary",
    ),
    amount: parseTokenAmount(record.amount),
    newlyIssuedTokenCount: parseUint256Decimal(
      record.newlyIssuedTokenCount,
      "newlyIssuedTokenCount",
    ),
    contextDigest: parseHash32(record.contextDigest, "after-pay context digest"),
    specificationAmount: parseUint256Decimal(
      record.specificationAmount,
      "specificationAmount",
    ),
    caller: parseEthereumAddress(record.caller, "HookAfterRecordPay caller"),
  };
}

function parseMints(
  value: unknown,
  receipt: CanonicalReceiptProof,
  expectedHook: EthereumAddress,
  expectedTerminal: EthereumAddress,
  expectedDeployment: CanonicalPurchaseDeploymentExpectation,
): readonly [CanonicalTierMintLog, ...CanonicalTierMintLog[]] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 256) {
    throw invalid("Tier purchase requires a bounded non-empty Mint log list.");
  }
  const mints = value.map((item) => {
    const record = expectExactRecord(
      item,
      [
        "kind",
        "log",
        "tokenId",
        "tierId",
        "beneficiary",
        "totalAmountPaid",
        "caller",
        "comparisonToPayAmount",
      ],
      "tier Mint log",
    );
    if (
      record.kind !== "juicebox-v6-721-tier-mint-log.v1" ||
      record.comparisonToPayAmount !== "not-used-for-correlation"
    ) {
      throw invalid("Only payment Mint logs may support item purchase evidence.");
    }
    const log = parseLogRef(
      record.log,
      receipt,
      JUICEBOX_V6_EVENT_TOPICS.tierMint,
      expectedDeployment.abiDigests.tierMint,
    );
    if (log.emitter !== expectedHook) throw invalid("Tier Mint came from the wrong hook.");
    const caller = parseEthereumAddress(record.caller, "Mint caller");
    if (caller !== expectedTerminal) {
      throw invalid("Payment Mint caller must be the authenticated terminal.");
    }
    return {
      kind: "juicebox-v6-721-tier-mint-log.v1" as const,
      log,
      tokenId: parseUint256Decimal(record.tokenId, "tokenId"),
      tierId: parseUint256Decimal(record.tierId, "tierId"),
      beneficiary: parseEthereumAddress(record.beneficiary, "Mint beneficiary"),
      totalAmountPaid: parseUint256Decimal(record.totalAmountPaid, "totalAmountPaid"),
      caller,
      comparisonToPayAmount: "not-used-for-correlation" as const,
    };
  });
  return mints as [CanonicalTierMintLog, ...CanonicalTierMintLog[]];
}

function parseTerminal(
  value: unknown,
  project: JuiceboxV6ProjectRef,
  receipt: CanonicalReceiptProof,
  policy: FinalityPolicy,
  expectedDeployment: CanonicalPurchaseDeploymentExpectation,
  now: CanonicalInstant,
): CanonicalTerminalEvidence {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "evidenceId",
      "project",
      "terminal",
      "implementationCodeHash",
      "deploymentManifestId",
      "isTerminalOfProject",
      "block",
    ],
    "terminal evidence",
  );
  if (
    record.kind !== "canonical-v6-terminal-at-block.v1" ||
    record.isTerminalOfProject !== true
  ) {
    throw invalid("Terminal is not a canonical registered Juicebox v6 terminal.");
  }
  const evidenceProject = parseJuiceboxV6ProjectRef(record.project);
  const block = parseFinalizedBlockAnchor(record.block, policy, now);
  assertProjectAndBlock(evidenceProject, project, block, receipt);
  const terminal = parseEthereumAddress(record.terminal, "terminal");
  const implementationCodeHash = parseHash32(
    record.implementationCodeHash,
    "terminal implementation code hash",
  );
  if (
    terminal !== expectedDeployment.terminal.address ||
    implementationCodeHash !== expectedDeployment.terminal.implementationCodeHash
  ) {
    throw invalid("Terminal address or code hash is not in the trusted deployment.");
  }
  return {
    kind: "canonical-v6-terminal-at-block.v1",
    evidenceId: parseAuthorityId(record.evidenceId, "terminal evidence ID"),
    project: evidenceProject,
    terminal,
    implementationCodeHash,
    deploymentManifestId: expectManifestId(record.deploymentManifestId, receipt),
    isTerminalOfProject: true,
    block,
  };
}

function parseTierHook(
  value: unknown,
  project: JuiceboxV6ProjectRef,
  receipt: CanonicalReceiptProof,
  policy: FinalityPolicy,
  expectedDeployment: CanonicalPurchaseDeploymentExpectation,
  now: CanonicalInstant,
): CanonicalTierHookEvidence {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "evidenceId",
      "project",
      "hook",
      "implementationCodeHash",
      "deploymentManifestId",
      "projectIdResult",
      "block",
    ],
    "tier hook evidence",
  );
  if (record.kind !== "canonical-v6-721-hook-at-block.v1") {
    throw invalid("Tier hook evidence kind is unsupported.");
  }
  const evidenceProject = parseJuiceboxV6ProjectRef(record.project);
  const block = parseFinalizedBlockAnchor(record.block, policy, now);
  assertProjectAndBlock(evidenceProject, project, block, receipt);
  if (record.projectIdResult !== project.projectId) {
    throw invalid("Tier hook project relationship is invalid.");
  }
  if (expectedDeployment.tierHook === null) {
    throw invalid("The trusted deployment does not permit tier purchase evidence.");
  }
  const hook = parseEthereumAddress(record.hook, "tier hook");
  const implementationCodeHash = parseHash32(
    record.implementationCodeHash,
    "tier hook implementation code hash",
  );
  if (
    hook !== expectedDeployment.tierHook.address ||
    implementationCodeHash !== expectedDeployment.tierHook.implementationCodeHash
  ) {
    throw invalid("Tier hook address or code hash is not in the trusted deployment.");
  }
  return {
    kind: "canonical-v6-721-hook-at-block.v1",
    evidenceId: parseAuthorityId(record.evidenceId, "tier hook evidence ID"),
    project: evidenceProject,
    hook,
    implementationCodeHash,
    deploymentManifestId: expectManifestId(record.deploymentManifestId, receipt),
    projectIdResult: project.projectId,
    block,
  };
}

function parseLogRef(
  value: unknown,
  receipt: CanonicalReceiptProof,
  expectedTopic0: string,
  expectedAbiDigest: Hash32,
): CanonicalLogRef {
  const record = expectExactRecord(
    value,
    [
      "receiptEvidenceId",
      "transactionHash",
      "blockHash",
      "logIndex",
      "emitter",
      "topic0",
      "abiDigest",
      "adapterRevision",
      "topicsDigest",
      "dataDigest",
      "removed",
    ],
    "canonical log reference",
  );
  if (record.removed !== false) throw invalid("Removed logs are never evidence.");
  const receiptEvidenceId = parseAuthorityId(
    record.receiptEvidenceId,
    "receiptEvidenceId",
  );
  const transactionHash = parseHash32(record.transactionHash, "transactionHash");
  const blockHash = parseHash32(record.blockHash, "blockHash");
  const topic0 = parseHash32(record.topic0, "topic0");
  const abiDigest = parseHash32(record.abiDigest, "ABI digest");
  if (
    receiptEvidenceId !== receipt.receiptEvidenceId ||
    transactionHash !== receipt.transactionHash ||
    blockHash !== receipt.block.blockHash ||
    topic0 !== expectedTopic0 ||
    abiDigest !== expectedAbiDigest
  ) {
    throw invalid("Log reference does not match its receipt or exact event topic.");
  }
  return {
    receiptEvidenceId,
    transactionHash,
    blockHash,
    logIndex: parseLogIndex(record.logIndex),
    emitter: parseEthereumAddress(record.emitter, "log emitter"),
    topic0,
    abiDigest,
    adapterRevision: expectAdapterRevision(record.adapterRevision, receipt),
    topicsDigest: parseHash32(record.topicsDigest, "topics digest"),
    dataDigest: parseHash32(record.dataDigest, "data digest"),
    removed: false,
  };
}

function expectManifestId(
  value: unknown,
  receipt: CanonicalReceiptProof,
): AuthorityId {
  const manifestId = parseAuthorityId(value, "deploymentManifestId");
  if (manifestId !== receipt.deploymentManifestId) {
    throw invalid("Historical relationship evidence uses another deployment manifest.");
  }
  return manifestId;
}

function expectAdapterRevision(
  value: unknown,
  receipt: CanonicalReceiptProof,
): AuthorityId {
  const adapterRevision = parseAuthorityId(value, "adapterRevision");
  if (adapterRevision !== receipt.adapterRevision) {
    throw invalid("Log evidence uses another decoder adapter revision.");
  }
  return adapterRevision;
}

function parseTokenAmount(value: unknown): TokenAmountContext {
  const record = expectExactRecord(
    value,
    ["token", "decimals", "currency", "value"],
    "token amount context",
  );
  if (
    typeof record.decimals !== "number" ||
    !Number.isInteger(record.decimals) ||
    record.decimals < 0 ||
    record.decimals > 255
  ) {
    throw invalid("Token amount decimals exceed uint8.");
  }
  const currency = parseUint256Decimal(record.currency, "currency");
  if (BigInt(currency) > 4_294_967_295n) {
    throw invalid("Token amount currency exceeds uint32.");
  }
  return {
    token: parseEthereumAddress(record.token, "payment token"),
    decimals: record.decimals,
    currency,
    value: parseUint256Decimal(record.value, "token amount value"),
  };
}

function parseTierCorrelationEvidence(
  value: unknown,
  receipt: CanonicalReceiptProof,
  pay: CanonicalPayLog,
  afterPayHook: CanonicalHookAfterRecordPayLog,
  mints: readonly [CanonicalTierMintLog, ...CanonicalTierMintLog[]],
  terminal: CanonicalTerminalEvidence,
  tierHook: CanonicalTierHookEvidence,
  expectedDeployment: CanonicalPurchaseDeploymentExpectation,
): CanonicalTierTraceCorrelationEvidence {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "evidenceId",
      "receiptEvidenceId",
      "transactionHash",
      "blockHash",
      "adapterRevision",
      "traceDigest",
      "relevantLogInventoryDigest",
      "receiptLogCount",
      "traceFrameCount",
      "inventoryScope",
      "traceComplete",
      "traceTruncated",
      "allRelevantPayLogIndices",
      "allRelevantHookAfterRecordPayLogIndices",
      "allRelevantTierMintLogIndices",
      "terminalFrame",
      "tierHookFrame",
    ],
    "tier call-trace correlation evidence",
  );
  if (
    record.kind !==
      "canonical-exclusive-receipt-call-trace-correlation.v1" ||
    record.inventoryScope !== "entire-receipt-expected-emitters" ||
    record.traceComplete !== true ||
    record.traceTruncated !== false
  ) {
    throw invalid("Tier correlation requires a complete exclusive receipt trace.");
  }
  const receiptEvidenceId = parseAuthorityId(
    record.receiptEvidenceId,
    "correlation receipt evidence ID",
  );
  const transactionHash = parseHash32(
    record.transactionHash,
    "correlation transaction hash",
  );
  const blockHash = parseHash32(record.blockHash, "correlation block hash");
  const adapterRevision = parseAuthorityId(
    record.adapterRevision,
    "correlation adapter revision",
  );
  if (
    receiptEvidenceId !== receipt.receiptEvidenceId ||
    transactionHash !== receipt.transactionHash ||
    blockHash !== receipt.block.blockHash ||
    adapterRevision !== expectedDeployment.adapterRevision
  ) {
    throw invalid("Tier correlation proof is detached from the canonical receipt.");
  }
  const receiptLogCount = parseBoundedCount(
    record.receiptLogCount,
    "receipt log count",
    1,
    100_000,
  );
  const traceFrameCount = parseBoundedCount(
    record.traceFrameCount,
    "trace frame count",
    2,
    65_536,
  );
  if (receiptLogCount < mints.length + 2) {
    throw invalid("Receipt log count cannot contain every correlated event.");
  }
  const allRelevantPayLogIndices = parseCanonicalIndexList(
    record.allRelevantPayLogIndices,
    "all relevant Pay log indices",
    1,
    1,
  );
  const allRelevantHookAfterRecordPayLogIndices = parseCanonicalIndexList(
    record.allRelevantHookAfterRecordPayLogIndices,
    "all relevant HookAfterRecordPay log indices",
    1,
    1,
  );
  const allRelevantTierMintLogIndices = parseCanonicalIndexList(
    record.allRelevantTierMintLogIndices,
    "all relevant tier Mint log indices",
    1,
    256,
  );
  const mintIndices = mints.map((mint) => mint.log.logIndex);
  if (
    allRelevantPayLogIndices[0] !== pay.log.logIndex ||
    allRelevantHookAfterRecordPayLogIndices[0] !== afterPayHook.log.logIndex ||
    !sameNumberList(allRelevantTierMintLogIndices, mintIndices)
  ) {
    throw invalid(
      "Complete receipt inventory contains another relevant purchase correlation.",
    );
  }
  const terminalFrame = parseTraceFrameBinding(
    record.terminalFrame,
    "terminal trace frame",
  );
  const tierHookFrame = parseTraceFrameBinding(
    record.tierHookFrame,
    "tier hook trace frame",
  );
  if (
    traceFrameCount < terminalFrame.depth + 1 ||
    traceFrameCount < tierHookFrame.depth + 1
  ) {
    throw invalid("Trace frame count cannot contain the claimed ancestry path.");
  }
  if (
    terminalFrame.to !== terminal.terminal ||
    terminalFrame.from !== pay.caller ||
    !sameNumberList(terminalFrame.relevantEmittedLogIndices, [
      pay.log.logIndex,
      afterPayHook.log.logIndex,
    ])
  ) {
    throw invalid("Pay and after-pay logs are not bound to one terminal call frame.");
  }
  if (
    tierHookFrame.from !== terminal.terminal ||
    tierHookFrame.to !== tierHook.hook ||
    !sameNumberList(tierHookFrame.relevantEmittedLogIndices, mintIndices) ||
    !sameNumberList(tierHookFrame.parentTraceAddress ?? [], terminalFrame.traceAddress) ||
    tierHookFrame.traceAddress.length !== terminalFrame.traceAddress.length + 1 ||
    !sameNumberList(
      tierHookFrame.traceAddress.slice(0, -1),
      terminalFrame.traceAddress,
    )
  ) {
    throw invalid(
      "Tier Mint logs are not in one direct terminal-to-hook child call frame.",
    );
  }
  return {
    kind: "canonical-exclusive-receipt-call-trace-correlation.v1",
    evidenceId: parseAuthorityId(record.evidenceId, "correlation evidence ID"),
    receiptEvidenceId,
    transactionHash,
    blockHash,
    adapterRevision,
    traceDigest: parseHash32(record.traceDigest, "call trace digest"),
    relevantLogInventoryDigest: parseHash32(
      record.relevantLogInventoryDigest,
      "relevant receipt log inventory digest",
    ),
    receiptLogCount,
    traceFrameCount,
    inventoryScope: "entire-receipt-expected-emitters",
    traceComplete: true,
    traceTruncated: false,
    allRelevantPayLogIndices: allRelevantPayLogIndices as [number],
    allRelevantHookAfterRecordPayLogIndices:
      allRelevantHookAfterRecordPayLogIndices as [number],
    allRelevantTierMintLogIndices: allRelevantTierMintLogIndices as [
      number,
      ...number[],
    ],
    terminalFrame,
    tierHookFrame,
  };
}

function parseTraceFrameBinding(
  value: unknown,
  label: string,
): CanonicalTraceFrameBinding {
  const record = expectExactRecord(
    value,
    [
      "traceAddress",
      "parentTraceAddress",
      "depth",
      "from",
      "to",
      "callType",
      "success",
      "relevantEmittedLogIndices",
    ],
    label,
  );
  if (record.callType !== "call" || record.success !== true) {
    throw invalid(`${label} must be a successful CALL frame.`);
  }
  const traceAddress = parseTraceAddress(record.traceAddress, `${label} address`);
  const parentTraceAddress =
    record.parentTraceAddress === null
      ? null
      : parseTraceAddress(record.parentTraceAddress, `${label} parent address`);
  const depth = parseBoundedCount(record.depth, `${label} depth`, 0, 64);
  if (
    depth !== traceAddress.length ||
    (depth === 0 && parentTraceAddress !== null) ||
    (depth > 0 &&
      (parentTraceAddress === null ||
        !sameNumberList(parentTraceAddress, traceAddress.slice(0, -1))))
  ) {
    throw invalid(`${label} has invalid call-frame ancestry.`);
  }
  const relevantEmittedLogIndices = parseCanonicalIndexList(
    record.relevantEmittedLogIndices,
    `${label} emitted log indices`,
    1,
    258,
  );
  return {
    traceAddress,
    parentTraceAddress,
    depth,
    from: parseEthereumAddress(record.from, `${label} caller`),
    to: parseEthereumAddress(record.to, `${label} callee`),
    callType: "call",
    success: true,
    relevantEmittedLogIndices: relevantEmittedLogIndices as [
      number,
      ...number[],
    ],
  };
}

function parseTraceAddress(value: unknown, label: string): readonly number[] {
  if (!Array.isArray(value) || value.length > 64) {
    throw invalid(`${label} must be a bounded trace address.`);
  }
  return value.map((item) => parseLogIndex(item, label));
}

function parseCanonicalIndexList(
  value: unknown,
  label: string,
  minimumLength: number,
  maximumLength: number,
): readonly number[] {
  if (
    !Array.isArray(value) ||
    value.length < minimumLength ||
    value.length > maximumLength
  ) {
    throw invalid(`${label} must be a bounded list.`);
  }
  const indices = value.map((item) => parseLogIndex(item, label));
  if (
    new Set(indices).size !== indices.length ||
    [...indices].sort((left, right) => left - right).some(
      (item, index) => item !== indices[index],
    )
  ) {
    throw invalid(`${label} must be unique and canonically sorted.`);
  }
  return indices;
}

function parseBoundedCount(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    value < minimum ||
    value > maximum
  ) {
    throw invalid(`${label} is outside its safe bound.`);
  }
  return value;
}

function sameNumberList(left: readonly number[], right: readonly number[]): boolean {
  return (
    left.length === right.length && left.every((item, index) => item === right[index])
  );
}

function parseRefundRecord(
  value: unknown,
  expected: RefundLedgerExpectation,
): SignedRefundLedgerRecord {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "refundRecordId",
      "project",
      "purchaseEvidenceId",
      "purchaseEvidenceDigest",
      "ledgerSequence",
      "orderCaseRevision",
      "priorLedgerHeadDigest",
      "state",
      "resolution",
      "eligibilityEffect",
      "scope",
      "refundAmount",
      "businessSigner",
      "issuerDeviceCredentialId",
      "issuerWalletVerificationEvidenceId",
      "rootAuthorityEvidenceId",
      "rootAuthorityEvidenceDigest",
      "rootSignerProofDigest",
      "authorityGenerationId",
      "authorityGenerationSequence",
      "effectiveAt",
      "recordedAt",
      "policyId",
      "policyRevision",
      "auditRecordId",
      "source",
      "chainEventInference",
      "attestation",
    ],
    "refund ledger record",
  );
  if (
    record.kind !== "signed-business-refund-ledger-record.v1" ||
    record.source !== "offchain-business-ledger" ||
    record.chainEventInference !== "forbidden"
  ) {
    throw invalid("Refund status must come from the signed business ledger only.");
  }
  if (
    record.state !== "refund-recorded" &&
    record.state !== "dispute-open" &&
    record.state !== "dispute-resolved"
  ) {
    throw invalid("Refund ledger state is unsupported.");
  }
  if (
    record.resolution !== "refund" &&
    record.resolution !== "purchase-upheld" &&
    record.resolution !== null
  ) {
    throw invalid("Refund ledger resolution is unsupported.");
  }
  if (
    (record.state === "refund-recorded" && record.resolution !== "refund") ||
    (record.state === "dispute-open" && record.resolution !== null) ||
    (record.state === "dispute-resolved" &&
      record.resolution !== "refund" &&
      record.resolution !== "purchase-upheld")
  ) {
    throw invalid("Refund state and resolution are inconsistent.");
  }
  const expectedEligibilityEffect = refundEligibilityEffect(
    record.state,
    record.resolution,
  );
  if (record.eligibilityEffect !== expectedEligibilityEffect) {
    throw invalid("Refund record has an unsafe eligibility effect.");
  }
  const refundAmount = parseRefundAmount(record.refundAmount);
  if (
    (record.resolution === "refund" && refundAmount === null) ||
    (record.resolution !== "refund" && refundAmount !== null)
  ) {
    throw invalid("Refund amount is inconsistent with the signed resolution.");
  }
  const project = parseJuiceboxV6ProjectRef(record.project);
  const purchaseEvidenceId = parseAuthorityId(
    record.purchaseEvidenceId,
    "purchaseEvidenceId",
  );
  assertRefundExpectation(project, purchaseEvidenceId, expected);
  const purchaseEvidenceDigest = parseHash32(
    record.purchaseEvidenceDigest,
    "refund record purchase evidence digest",
  );
  if (purchaseEvidenceDigest !== expected.purchaseEvidenceDigest) {
    throw invalid("Refund record is detached from canonical purchase evidence.");
  }
  const authorityGenerationId = parseAuthorityId(
    record.authorityGenerationId,
    "authority generation ID",
  );
  const authorityGenerationSequence = parseUint256Decimal(
    record.authorityGenerationSequence,
    "authority generation sequence",
  );
  if (
    authorityGenerationId !== expected.authorityGenerationId ||
    authorityGenerationSequence !== expected.authorityGenerationSequence
  ) {
    throw invalid("Refund record is signed under a stale authority generation.");
  }
  const businessSigner = parseEthereumAddress(
    record.businessSigner,
    "business signer",
  );
  const issuerDeviceCredentialId = parseAuthorityId(
    record.issuerDeviceCredentialId,
    "issuer device credential ID",
  );
  const issuerWalletVerificationEvidenceId = parseAuthorityId(
    record.issuerWalletVerificationEvidenceId,
    "issuer wallet verification evidence ID",
  );
  const rootAuthorityEvidenceId = parseAuthorityId(
    record.rootAuthorityEvidenceId,
    "root authority evidence ID",
  );
  const rootAuthorityEvidenceDigest = parseHash32(
    record.rootAuthorityEvidenceDigest,
    "root authority evidence digest",
  );
  const rootSignerProofDigest = parseHash32(
    record.rootSignerProofDigest,
    "root signer proof digest",
  );
  const policyId = parseAuthorityId(record.policyId, "refund policy ID");
  const policyRevision = parseUint256Decimal(
    record.policyRevision,
    "policyRevision",
  );
  assertRefundSignerAndPolicy(
    {
      businessSigner,
      issuerDeviceCredentialId,
      issuerWalletVerificationEvidenceId,
      rootAuthorityEvidenceId,
      rootAuthorityEvidenceDigest,
      rootSignerProofDigest,
      policyId,
      policyRevision,
    },
    expected,
  );
  const effectiveAt = parseCanonicalInstant(record.effectiveAt, "effectiveAt");
  const recordedAt = parseCanonicalInstant(record.recordedAt, "recordedAt");
  if (instantMilliseconds(effectiveAt) > instantMilliseconds(recordedAt)) {
    throw invalid("Refund record effective time is after its ledger time.");
  }
  const ledgerSequence = parseUint256Decimal(
    record.ledgerSequence,
    "ledgerSequence",
  );
  const priorLedgerHeadDigest = parseHash32(
    record.priorLedgerHeadDigest,
    "prior ledger head digest",
  );
  if (
    expected.latestObservedHead !== null &&
    BigInt(ledgerSequence) === BigInt(expected.latestObservedHead.sequence) + 1n &&
    priorLedgerHeadDigest !== expected.latestObservedHead.headDigest
  ) {
    throw invalid("Refund record does not extend the previously observed ledger head.");
  }
  const scope = parseRefundScope(record.scope);
  assertRefundScopeAppliesToResource(scope, expected.resource);
  const payload: Omit<SignedRefundLedgerRecord, "attestation"> = {
    kind: "signed-business-refund-ledger-record.v1",
    refundRecordId: parseAuthorityId(record.refundRecordId, "refundRecordId"),
    project,
    purchaseEvidenceId,
    purchaseEvidenceDigest,
    ledgerSequence,
    orderCaseRevision: parseUint256Decimal(
      record.orderCaseRevision,
      "orderCaseRevision",
    ),
    priorLedgerHeadDigest,
    state: record.state,
    resolution: record.resolution,
    eligibilityEffect: expectedEligibilityEffect,
    scope,
    refundAmount,
    businessSigner,
    issuerDeviceCredentialId,
    issuerWalletVerificationEvidenceId,
    rootAuthorityEvidenceId,
    rootAuthorityEvidenceDigest,
    rootSignerProofDigest,
    authorityGenerationId,
    authorityGenerationSequence,
    effectiveAt,
    recordedAt,
    policyId,
    policyRevision,
    auditRecordId: parseAuthorityId(record.auditRecordId, "auditRecordId"),
    source: "offchain-business-ledger",
    chainEventInference: "forbidden",
  };
  const canonicalPayloadDigest = computeRefundRecordCanonicalPayloadDigest(payload);
  assertRefundOrderCaseTransition(payload, canonicalPayloadDigest, expected);
  const attestation = parseRefundAttestationEnvelope(record.attestation, {
    attestationKind: "record",
    primaryType: "JuiceboxRefundLedgerRecord",
    payloadBinding: "canonical-record-payload",
    canonicalPayloadDigest,
    expected,
    ledgerSequence,
  });
  return {
    ...payload,
    attestation: attestation as SignedRefundLedgerRecord["attestation"],
  };
}

function parseRefundLedgerHead(
  value: unknown,
  expected: RefundLedgerExpectation,
): RefundLedgerHead {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "headId",
      "project",
      "purchaseEvidenceId",
      "purchaseEvidenceDigest",
      "resource",
      "resourceDigest",
      "sequence",
      "priorHeadDigest",
      "headDigest",
      "lookupRequestId",
      "lookupChallengeDigest",
      "currentStatus",
      "currentRecordId",
      "currentRecordDigest",
      "eligibilityEffect",
      "businessSigner",
      "issuerDeviceCredentialId",
      "issuerWalletVerificationEvidenceId",
      "rootAuthorityEvidenceId",
      "rootAuthorityEvidenceDigest",
      "rootSignerProofDigest",
      "authorityGenerationId",
      "authorityGenerationSequence",
      "ledgerRecordedAt",
      "signedAt",
      "policyId",
      "policyRevision",
      "auditRecordId",
      "attestation",
    ],
    "refund ledger head",
  );
  if (record.kind !== "signed-business-refund-ledger-head.v1") {
    throw invalid("Refund ledger head kind is unsupported.");
  }
  const project = parseJuiceboxV6ProjectRef(record.project);
  const purchaseEvidenceId = parseAuthorityId(
    record.purchaseEvidenceId,
    "refund head purchase evidence ID",
  );
  assertRefundExpectation(project, purchaseEvidenceId, expected);
  const purchaseEvidenceDigest = parseHash32(
    record.purchaseEvidenceDigest,
    "refund head purchase evidence digest",
  );
  const resource = parseSignedRefundEligibilityResource(
    record.resource,
    expected.resource,
  );
  const resourceDigest = parseHash32(
    record.resourceDigest,
    "refund head resource digest",
  );
  if (
    purchaseEvidenceDigest !== expected.purchaseEvidenceDigest ||
    resourceDigest !== expected.resourceDigest
  ) {
    throw invalid("Refund ledger head is detached from its purchase resource.");
  }
  const authorityGenerationId = parseAuthorityId(
    record.authorityGenerationId,
    "authority generation ID",
  );
  const authorityGenerationSequence = parseUint256Decimal(
    record.authorityGenerationSequence,
    "authority generation sequence",
  );
  if (
    authorityGenerationId !== expected.authorityGenerationId ||
    authorityGenerationSequence !== expected.authorityGenerationSequence
  ) {
    throw invalid("Refund ledger head is from a stale authority generation.");
  }
  if (
    record.currentStatus !== "recorded" &&
    record.currentStatus !== "no-applicable-entry"
  ) {
    throw invalid("Refund ledger head current status is unsupported.");
  }
  if (record.eligibilityEffect !== "clear" && record.eligibilityEffect !== "block") {
    throw invalid("Refund ledger head eligibility effect is unsupported.");
  }
  const currentRecordId =
    record.currentRecordId === null
      ? null
      : parseAuthorityId(record.currentRecordId, "current refund record ID");
  const currentRecordDigest =
    record.currentRecordDigest === null
      ? null
      : parseHash32(record.currentRecordDigest, "current refund record digest");
  if (
    (record.currentStatus === "recorded" &&
      (currentRecordId === null || currentRecordDigest === null)) ||
    (record.currentStatus === "no-applicable-entry" &&
      (currentRecordId !== null ||
        currentRecordDigest !== null ||
        record.eligibilityEffect !== "clear"))
  ) {
    throw invalid("Refund ledger head current record fields are inconsistent.");
  }
  const businessSigner = parseEthereumAddress(
    record.businessSigner,
    "refund head business signer",
  );
  const issuerDeviceCredentialId = parseAuthorityId(
    record.issuerDeviceCredentialId,
    "refund head issuer device credential ID",
  );
  const issuerWalletVerificationEvidenceId = parseAuthorityId(
    record.issuerWalletVerificationEvidenceId,
    "refund head issuer wallet verification evidence ID",
  );
  const rootAuthorityEvidenceId = parseAuthorityId(
    record.rootAuthorityEvidenceId,
    "refund head root authority evidence ID",
  );
  const rootAuthorityEvidenceDigest = parseHash32(
    record.rootAuthorityEvidenceDigest,
    "refund head root authority evidence digest",
  );
  const rootSignerProofDigest = parseHash32(
    record.rootSignerProofDigest,
    "refund head root signer proof digest",
  );
  const policyId = parseAuthorityId(record.policyId, "refund head policy ID");
  const policyRevision = parseUint256Decimal(
    record.policyRevision,
    "refund head policy revision",
  );
  assertRefundSignerAndPolicy(
    {
      businessSigner,
      issuerDeviceCredentialId,
      issuerWalletVerificationEvidenceId,
      rootAuthorityEvidenceId,
      rootAuthorityEvidenceDigest,
      rootSignerProofDigest,
      policyId,
      policyRevision,
    },
    expected,
  );
  const sequence = parseUint256Decimal(record.sequence, "refund ledger sequence");
  const priorHeadDigest = parseHash32(
    record.priorHeadDigest,
    "refund prior stable head digest",
  );
  const headDigest = parseHash32(record.headDigest, "refund ledger head digest");
  const headId = parseAuthorityId(record.headId, "refund ledger head ID");
  const lookupRequestId = parseAuthorityId(
    record.lookupRequestId,
    "refund head lookup request ID",
  );
  const lookupChallengeDigest = parseHash32(
    record.lookupChallengeDigest,
    "refund head lookup challenge digest",
  );
  if (
    lookupRequestId !== expected.lookupRequestId ||
    lookupChallengeDigest !== expected.lookupChallengeDigest
  ) {
    throw invalid("Refund ledger head is replayed from another lookup challenge.");
  }
  const ledgerRecordedAt = parseCanonicalInstant(
    record.ledgerRecordedAt,
    "refund head ledgerRecordedAt",
  );
  const signedAt = parseCanonicalInstant(
    record.signedAt,
    "refund head signedAt",
  );
  const auditRecordId = parseAuthorityId(
    record.auditRecordId,
    "refund head audit record ID",
  );
  const stableHead = {
    kind: "refund-ledger-stable-head.v1",
    headId,
    project,
    purchaseEvidenceId,
    purchaseEvidenceDigest,
    resource,
    resourceDigest,
    sequence,
    priorHeadDigest,
    currentStatus: record.currentStatus,
    currentRecordId,
    currentRecordDigest,
    eligibilityEffect: record.eligibilityEffect,
    businessSigner,
    issuerDeviceCredentialId,
    issuerWalletVerificationEvidenceId,
    rootAuthorityEvidenceId,
    rootAuthorityEvidenceDigest,
    rootSignerProofDigest,
    authorityGenerationId,
    authorityGenerationSequence,
    ledgerRecordedAt,
    policyId,
    policyRevision,
    auditRecordId,
  };
  if (headDigest !== computeRefundStableHeadDigest(stableHead)) {
    throw invalid("Refund stable head digest does not match canonical state.");
  }
  assertRefundHeadFreshAndMonotonic(
    sequence,
    priorHeadDigest,
    headDigest,
    ledgerRecordedAt,
    signedAt,
    expected,
  );
  const observed = expected.latestObservedHead;
  if (
    observed !== null &&
    BigInt(sequence) === BigInt(observed.sequence) + 1n &&
    observed.currentStatus === "recorded" &&
    record.currentStatus === "no-applicable-entry"
  ) {
    throw invalid("A recorded refund case cannot be cleared by a no-entry head.");
  }
  const payload: Omit<RefundLedgerHead, "attestation"> = {
    kind: "signed-business-refund-ledger-head.v1",
    headId,
    project,
    purchaseEvidenceId,
    purchaseEvidenceDigest,
    resource,
    resourceDigest,
    sequence,
    priorHeadDigest,
    headDigest,
    lookupRequestId,
    lookupChallengeDigest,
    currentStatus: record.currentStatus,
    currentRecordId,
    currentRecordDigest,
    eligibilityEffect: record.eligibilityEffect,
    businessSigner,
    issuerDeviceCredentialId,
    issuerWalletVerificationEvidenceId,
    rootAuthorityEvidenceId,
    rootAuthorityEvidenceDigest,
    rootSignerProofDigest,
    authorityGenerationId,
    authorityGenerationSequence,
    ledgerRecordedAt,
    signedAt,
    policyId,
    policyRevision,
    auditRecordId,
  };
  const canonicalPayloadDigest = computeRefundHeadCanonicalPayloadDigest(payload);
  const attestation = parseRefundAttestationEnvelope(record.attestation, {
    attestationKind: "head",
    primaryType: "JuiceboxRefundLedgerHead",
    payloadBinding: "canonical-head-payload-including-lookup-challenge",
    canonicalPayloadDigest,
    expected,
    ledgerSequence: sequence,
  });
  return {
    ...payload,
    attestation: attestation as RefundLedgerHead["attestation"],
  };
}

function parseRefundAttestationEnvelope(
  value: unknown,
  context: {
    attestationKind: "record" | "head";
    primaryType: "JuiceboxRefundLedgerRecord" | "JuiceboxRefundLedgerHead";
    payloadBinding:
      | "canonical-record-payload"
      | "canonical-head-payload-including-lookup-challenge";
    canonicalPayloadDigest: Hash32;
    expected: RefundLedgerExpectation;
    ledgerSequence: Uint256Decimal;
  },
): RefundAttestationSignatureEnvelope {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "attestationId",
      "attestationKind",
      "attestationDomain",
      "signatureScheme",
      "primaryType",
      "payloadBinding",
      "attestationDomainSeparatorDigest",
      "canonicalPayloadDigest",
      "signature",
      "signatureDigest",
      "claimedSigner",
      "issuerDeviceCredentialId",
      "ledgerSequence",
      "authorityGenerationId",
      "authorityGenerationSequence",
      "rootAuthorityEvidenceId",
      "rootAuthorityEvidenceDigest",
    ],
    "refund attestation signature envelope",
  );
  if (
    record.kind !== "refund-attestation-signature-envelope.v1" ||
    record.attestationKind !== context.attestationKind ||
    record.attestationDomain !== "juicebox-messaging-refund-ledger-v1" ||
    record.signatureScheme !== "eip712-v4" ||
    record.primaryType !== context.primaryType ||
    record.payloadBinding !== context.payloadBinding
  ) {
    throw invalid("Refund attestation envelope has the wrong canonical profile.");
  }
  const attestationDomainSeparatorDigest = parseHash32(
    record.attestationDomainSeparatorDigest,
    "refund attestation domain separator digest",
  );
  const canonicalPayloadDigest = parseHash32(
    record.canonicalPayloadDigest,
    "refund canonical payload digest",
  );
  const signature = parseHexBytes(record.signature, "refund signature", {
    minBytes: 1,
    maxBytes: 16_384,
  });
  const signatureDigest = parseHash32(
    record.signatureDigest,
    "refund signature digest",
  );
  const claimedSigner = parseEthereumAddress(
    record.claimedSigner,
    "refund claimed signer",
  );
  const issuerDeviceCredentialId = parseAuthorityId(
    record.issuerDeviceCredentialId,
    "refund attestation device credential ID",
  );
  const authorityGenerationId = parseAuthorityId(
    record.authorityGenerationId,
    "refund attestation authority generation ID",
  );
  const ledgerSequence = parseUint256Decimal(
    record.ledgerSequence,
    "refund attestation ledger sequence",
  );
  const authorityGenerationSequence = parseUint256Decimal(
    record.authorityGenerationSequence,
    "refund attestation authority generation sequence",
  );
  const rootAuthorityEvidenceId = parseAuthorityId(
    record.rootAuthorityEvidenceId,
    "refund attestation root authority evidence ID",
  );
  const rootAuthorityEvidenceDigest = parseHash32(
    record.rootAuthorityEvidenceDigest,
    "refund attestation root authority evidence digest",
  );
  if (
    attestationDomainSeparatorDigest !==
      context.expected.refundAttestationDomainSeparatorDigest ||
    canonicalPayloadDigest !== context.canonicalPayloadDigest ||
    signatureDigest !== computeRefundSignatureDigest(signature) ||
    claimedSigner !== context.expected.rootSigner ||
    issuerDeviceCredentialId !== context.expected.issuerDeviceCredentialId ||
    ledgerSequence !== context.ledgerSequence ||
    authorityGenerationId !== context.expected.authorityGenerationId ||
    authorityGenerationSequence !== context.expected.authorityGenerationSequence ||
    rootAuthorityEvidenceId !== context.expected.rootAuthorityEvidenceId ||
    rootAuthorityEvidenceDigest !== context.expected.rootAuthorityEvidenceDigest
  ) {
    throw invalid("Refund attestation envelope is detached from trusted authority.");
  }
  return {
    kind: "refund-attestation-signature-envelope.v1",
    attestationId: parseAuthorityId(
      record.attestationId,
      "refund attestation ID",
    ),
    attestationKind: context.attestationKind,
    attestationDomain: "juicebox-messaging-refund-ledger-v1",
    signatureScheme: "eip712-v4",
    primaryType: context.primaryType,
    payloadBinding: context.payloadBinding,
    attestationDomainSeparatorDigest,
    canonicalPayloadDigest,
    signature,
    signatureDigest,
    claimedSigner,
    issuerDeviceCredentialId,
    ledgerSequence,
    authorityGenerationId,
    authorityGenerationSequence,
    rootAuthorityEvidenceId,
    rootAuthorityEvidenceDigest,
  };
}

function refundHeadAttestationExpectation(
  head: RefundLedgerHead,
  expected: RefundLedgerExpectation,
): RefundAttestationVerificationExpectation {
  return {
    attestationId: head.attestation.attestationId,
    attestationKind: "head",
    primaryType: "JuiceboxRefundLedgerHead",
    attestationDomainSeparatorDigest:
      head.attestation.attestationDomainSeparatorDigest,
    canonicalPayloadDigest: head.attestation.canonicalPayloadDigest,
    signatureDigest: head.attestation.signatureDigest,
    signer: head.businessSigner,
    issuerDeviceCredentialId: head.issuerDeviceCredentialId,
    project: head.project,
    purchaseEvidenceId: head.purchaseEvidenceId,
    purchaseEvidenceDigest: head.purchaseEvidenceDigest,
    resourceDigest: head.resourceDigest,
    ledgerSequence: head.sequence,
    lookupRequestId: head.lookupRequestId,
    authorityGenerationId: head.authorityGenerationId,
    authorityGenerationSequence: head.authorityGenerationSequence,
    rootAuthorityEvidenceId: head.rootAuthorityEvidenceId,
    rootAuthorityEvidenceDigest: head.rootAuthorityEvidenceDigest,
    refundPolicyId: head.policyId,
    refundPolicyRevision: head.policyRevision,
    verifierPolicyId: expected.attestationVerifierPolicyId,
    verifierPolicyRevision: expected.attestationVerifierPolicyRevision,
    verifierKeyId: expected.attestationVerifierKeyId,
    notBefore: head.signedAt,
    now: expected.now,
  };
}

function refundRecordAttestationExpectation(
  record: SignedRefundLedgerRecord,
  expected: RefundLedgerExpectation,
): RefundAttestationVerificationExpectation {
  return {
    attestationId: record.attestation.attestationId,
    attestationKind: "record",
    primaryType: "JuiceboxRefundLedgerRecord",
    attestationDomainSeparatorDigest:
      record.attestation.attestationDomainSeparatorDigest,
    canonicalPayloadDigest: record.attestation.canonicalPayloadDigest,
    signatureDigest: record.attestation.signatureDigest,
    signer: record.businessSigner,
    issuerDeviceCredentialId: record.issuerDeviceCredentialId,
    project: record.project,
    purchaseEvidenceId: record.purchaseEvidenceId,
    purchaseEvidenceDigest: record.purchaseEvidenceDigest,
    resourceDigest: expected.resourceDigest,
    ledgerSequence: record.ledgerSequence,
    lookupRequestId: null,
    authorityGenerationId: record.authorityGenerationId,
    authorityGenerationSequence: record.authorityGenerationSequence,
    rootAuthorityEvidenceId: record.rootAuthorityEvidenceId,
    rootAuthorityEvidenceDigest: record.rootAuthorityEvidenceDigest,
    refundPolicyId: record.policyId,
    refundPolicyRevision: record.policyRevision,
    verifierPolicyId: expected.attestationVerifierPolicyId,
    verifierPolicyRevision: expected.attestationVerifierPolicyRevision,
    verifierKeyId: expected.attestationVerifierKeyId,
    notBefore: record.recordedAt,
    now: expected.now,
  };
}

function requireVerifiedRefundAttestation(
  value: unknown,
  expected: RefundAttestationVerificationExpectation,
): Extract<RefundAttestationVerificationResult, { status: "verified" }> {
  const result = parseRefundAttestationVerificationResult(value, expected);
  if (result.status !== "verified") {
    throw invalid("Refund attestation is not cryptographically verified.");
  }
  return result;
}

function assertNoRefundAttestationVerifications(
  bundle: Record<string, unknown>,
): void {
  if (bundle.head !== null || bundle.currentRecord !== null) {
    throw invalid("Blocked refund results cannot carry ignored verification claims.");
  }
}

function parseRefundScope(value: unknown): SignedRefundLedgerRecord["scope"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("Refund scope must be an object.");
  }
  const kind = (value as Record<string, unknown>).kind;
  if (kind === "entire-purchase") {
    expectExactRecord(value, ["kind"], "refund scope");
    return { kind };
  }
  if (kind === "exact-tier-items") {
    const record = expectExactRecord(value, ["kind", "items"], "refund scope");
    if (!Array.isArray(record.items) || record.items.length < 1 || record.items.length > 256) {
      throw invalid("Exact refund item scope must be a bounded non-empty list.");
    }
    const items = record.items.map((item) => {
      const itemRecord = expectExactRecord(item, ["tierId", "tokenId"], "refund item");
      return {
        tierId: parseUint256Decimal(itemRecord.tierId, "refund tierId"),
        tokenId: parseUint256Decimal(itemRecord.tokenId, "refund tokenId"),
      };
    });
    const keys = items.map((item) => `${item.tierId}:${item.tokenId}`);
    if (
      new Set(keys).size !== keys.length ||
      [...keys].sort().some((item, index) => item !== keys[index])
    ) {
      throw invalid("Refund items must be unique and canonically sorted.");
    }
    return {
      kind,
      items: items as [
        { tierId: Uint256Decimal; tokenId: Uint256Decimal },
        ...{ tierId: Uint256Decimal; tokenId: Uint256Decimal }[],
      ],
    };
  }
  throw invalid("Refund scope kind is unsupported.");
}

function parseRefundEligibilityResource(
  value: unknown,
  purchase: CanonicalPurchaseEvidence,
): RefundEligibilityResource {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("Refund eligibility resource must be an object.");
  }
  const kind = (value as Record<string, unknown>).kind;
  if (kind === "purchase-support") {
    const record = expectExactRecord(
      value,
      ["kind", "transactionHash", "payLogIndex"],
      "purchase-support refund resource",
    );
    const transactionHash = parseHash32(
      record.transactionHash,
      "refund resource transaction hash",
    );
    const payLogIndex = parseLogIndex(
      record.payLogIndex,
      "refund resource Pay log index",
    );
    if (
      transactionHash !== purchase.receipt.transactionHash ||
      payLogIndex !== purchase.pay.log.logIndex
    ) {
      throw invalid("Refund resource is detached from the verified purchase.");
    }
    return { kind, transactionHash, payLogIndex };
  }
  if (kind === "tier-fulfillment") {
    const record = expectExactRecord(
      value,
      ["kind", "tierId", "tokenId"],
      "tier-fulfillment refund resource",
    );
    if (purchase.kind !== "juicebox-v6-tier-purchase-evidence.v1") {
      throw invalid("Tier fulfillment requires verified tier purchase evidence.");
    }
    const tierId = parseUint256Decimal(record.tierId, "refund resource tier ID");
    const tokenId = parseUint256Decimal(record.tokenId, "refund resource token ID");
    if (
      !purchase.mints.some(
        (mint) => mint.tierId === tierId && mint.tokenId === tokenId,
      )
    ) {
      throw invalid("Refund resource item is not in the verified purchase.");
    }
    return { kind, tierId, tokenId };
  }
  throw invalid("Refund eligibility resource kind is unsupported.");
}

function parseSignedRefundEligibilityResource(
  value: unknown,
  expected: RefundEligibilityResource,
): RefundEligibilityResource {
  if (expected.kind === "purchase-support") {
    const record = expectExactRecord(
      value,
      ["kind", "transactionHash", "payLogIndex"],
      "signed purchase-support refund resource",
    );
    const transactionHash = parseHash32(
      record.transactionHash,
      "signed refund resource transaction hash",
    );
    const payLogIndex = parseLogIndex(
      record.payLogIndex,
      "signed refund resource Pay log index",
    );
    if (
      record.kind !== expected.kind ||
      transactionHash !== expected.transactionHash ||
      payLogIndex !== expected.payLogIndex
    ) {
      throw invalid("Signed refund resource does not match the exact query.");
    }
    return { kind: expected.kind, transactionHash, payLogIndex };
  }
  const record = expectExactRecord(
    value,
    ["kind", "tierId", "tokenId"],
    "signed tier-fulfillment refund resource",
  );
  const tierId = parseUint256Decimal(record.tierId, "signed refund resource tier ID");
  const tokenId = parseUint256Decimal(record.tokenId, "signed refund resource token ID");
  if (
    record.kind !== expected.kind ||
    tierId !== expected.tierId ||
    tokenId !== expected.tokenId
  ) {
    throw invalid("Signed refund resource does not match the exact query.");
  }
  return { kind: expected.kind, tierId, tokenId };
}

function assertRefundScopeAppliesToResource(
  scope: SignedRefundLedgerRecord["scope"],
  resource: RefundEligibilityResource,
): void {
  if (scope.kind === "entire-purchase") return;
  if (
    resource.kind !== "tier-fulfillment" ||
    !scope.items.some(
      (item) => item.tierId === resource.tierId && item.tokenId === resource.tokenId,
    )
  ) {
    throw invalid("Refund record scope does not cover the exact queried resource.");
  }
}

function parseObservedRefundOrderCase(
  value: unknown,
  resource: RefundEligibilityResource,
): ObservedRefundLedgerHead["currentCase"] {
  if (value === null) return null;
  const record = expectExactRecord(
    value,
    ["orderCaseRevision", "state", "resolution", "scope"],
    "observed refund order case",
  );
  if (
    record.state !== "refund-recorded" &&
    record.state !== "dispute-open" &&
    record.state !== "dispute-resolved"
  ) {
    throw invalid("Observed refund order case state is unsupported.");
  }
  if (
    record.resolution !== "refund" &&
    record.resolution !== "purchase-upheld" &&
    record.resolution !== null
  ) {
    throw invalid("Observed refund order case resolution is unsupported.");
  }
  if (
    (record.state === "refund-recorded" && record.resolution !== "refund") ||
    (record.state === "dispute-open" && record.resolution !== null) ||
    (record.state === "dispute-resolved" &&
      record.resolution !== "refund" &&
      record.resolution !== "purchase-upheld")
  ) {
    throw invalid("Observed refund order case state and resolution conflict.");
  }
  const scope = parseRefundScope(record.scope);
  assertRefundScopeAppliesToResource(scope, resource);
  return {
    orderCaseRevision: parseUint256Decimal(
      record.orderCaseRevision,
      "observed order case revision",
    ),
    state: record.state,
    resolution: record.resolution,
    scope,
  };
}

function requireValidatedRefundLedgerExpectation(
  value: RefundLedgerExpectation,
): RefundLedgerExpectation {
  if (!validatedRefundLedgerExpectations.has(value)) {
    throw invalid("Refund ledger expectation was not derived from verified purchase evidence.");
  }
  return value;
}

function parseRefundAmount(
  value: unknown,
): SignedRefundLedgerRecord["refundAmount"] {
  if (value === null) return null;
  const record = expectExactRecord(value, ["kind", "amount"], "refund amount");
  if (record.kind !== "partial" && record.kind !== "full") {
    throw invalid("Refund amount kind is unsupported.");
  }
  const amount = parseTokenAmount(record.amount);
  if (amount.value === "0") {
    throw invalid("A recorded refund amount must be non-zero.");
  }
  return { kind: record.kind, amount };
}

function assertRefundExpectation(
  project: JuiceboxV6ProjectRef,
  purchaseEvidenceId: AuthorityId,
  expected: RefundLedgerExpectation,
): void {
  if (
    !sameJuiceboxV6ProjectRef(project, expected.project) ||
    purchaseEvidenceId !== expected.purchaseEvidenceId
  ) {
    throw invalid("Refund ledger result is scoped to another project or purchase.");
  }
}

function assertRefundSignerAndPolicy(
  actual: {
    businessSigner: EthereumAddress;
    issuerDeviceCredentialId: AuthorityId;
    issuerWalletVerificationEvidenceId: AuthorityId;
    rootAuthorityEvidenceId: AuthorityId;
    rootAuthorityEvidenceDigest: Hash32;
    rootSignerProofDigest: Hash32;
    policyId: AuthorityId;
    policyRevision: Uint256Decimal;
  },
  expected: RefundLedgerExpectation,
): void {
  if (
    actual.businessSigner !== expected.rootSigner ||
    actual.issuerDeviceCredentialId !== expected.issuerDeviceCredentialId ||
    actual.issuerWalletVerificationEvidenceId !==
      expected.issuerWalletVerificationEvidenceId ||
    actual.rootAuthorityEvidenceId !== expected.rootAuthorityEvidenceId ||
    actual.rootAuthorityEvidenceDigest !== expected.rootAuthorityEvidenceDigest ||
    actual.rootSignerProofDigest !== expected.rootSignerProofDigest ||
    actual.policyId !== expected.policyId ||
    actual.policyRevision !== expected.policyRevision
  ) {
    throw invalid("Refund status is not signed by the expected current root authority.");
  }
}

function assertRefundHeadFreshAndMonotonic(
  sequence: Uint256Decimal,
  priorHeadDigest: Hash32,
  headDigest: Hash32,
  ledgerRecordedAt: CanonicalInstant,
  signedAt: CanonicalInstant,
  expected: RefundLedgerExpectation,
): void {
  const nowMilliseconds = instantMilliseconds(expected.now);
  const ledgerRecordedMilliseconds = instantMilliseconds(ledgerRecordedAt);
  const signedMilliseconds = instantMilliseconds(signedAt);
  if (
    ledgerRecordedMilliseconds > signedMilliseconds ||
    signedMilliseconds > nowMilliseconds ||
    nowMilliseconds - signedMilliseconds > expected.maximumHeadAgeMilliseconds
  ) {
    throw invalid("Refund ledger head signature is stale or has invalid chronology.");
  }
  const observed = expected.latestObservedHead;
  if (observed === null) return;
  const sequenceNumber = BigInt(sequence);
  const observedSequence = BigInt(observed.sequence);
  if (
    sequenceNumber < observedSequence ||
    sequenceNumber > observedSequence + 1n ||
    (sequenceNumber === observedSequence &&
      (headDigest !== observed.headDigest ||
        ledgerRecordedAt !== observed.ledgerRecordedAt)) ||
    (sequenceNumber === observedSequence + 1n &&
      (priorHeadDigest !== observed.headDigest ||
        ledgerRecordedMilliseconds <
          instantMilliseconds(observed.ledgerRecordedAt)))
  ) {
    throw invalid("Refund ledger head is a stale replay or conflicting history.");
  }
}

function assertRefundOrderCaseTransition(
  record: Omit<SignedRefundLedgerRecord, "attestation">,
  recordDigest: Hash32,
  expected: RefundLedgerExpectation,
): void {
  const observed = expected.latestObservedHead;
  const revision = BigInt(record.orderCaseRevision);
  if (observed === null) {
    if (revision !== 1n || record.state === "dispute-resolved") {
      throw invalid("A refund order case must begin at revision 1 in an open state.");
    }
    return;
  }
  const sequence = BigInt(record.ledgerSequence);
  const observedSequence = BigInt(observed.sequence);
  if (sequence === observedSequence) {
    const currentCase = observed.currentCase;
    if (
      observed.currentStatus !== "recorded" ||
      currentCase === null ||
      observed.currentRecordId !== record.refundRecordId ||
      observed.currentRecordDigest !== recordDigest ||
      currentCase.orderCaseRevision !== record.orderCaseRevision ||
      currentCase.state !== record.state ||
      currentCase.resolution !== record.resolution ||
      !sameRefundScope(currentCase.scope, record.scope)
    ) {
      throw invalid("Same-sequence refund record conflicts with the persisted snapshot.");
    }
    return;
  }
  if (sequence !== observedSequence + 1n) {
    throw invalid("Refund record does not immediately extend its persisted predecessor.");
  }
  const currentCase = observed.currentCase;
  if (currentCase === null) {
    if (revision !== 1n || record.state === "dispute-resolved") {
      throw invalid("A new refund order case must begin at revision 1 in an open state.");
    }
    return;
  }
  if (
    revision !== BigInt(currentCase.orderCaseRevision) + 1n ||
    !sameRefundScope(currentCase.scope, record.scope)
  ) {
    throw invalid("Refund order case revision or scope does not extend its predecessor.");
  }
  if (
    currentCase.state !== "dispute-open" ||
    (record.state !== "dispute-open" && record.state !== "dispute-resolved")
  ) {
    throw invalid("Refund order case transition is not legal.");
  }
}

function sameRefundScope(
  left: SignedRefundLedgerRecord["scope"],
  right: SignedRefundLedgerRecord["scope"],
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "entire-purchase" || right.kind === "entire-purchase") {
    return left.kind === right.kind;
  }
  return (
    left.items.length === right.items.length &&
    left.items.every(
      (item, index) =>
        item.tierId === right.items[index]?.tierId &&
        item.tokenId === right.items[index]?.tokenId,
    )
  );
}

function refundEligibilityEffect(
  state: unknown,
  resolution: unknown,
): "clear" | "block" {
  return state === "dispute-resolved" && resolution === "purchase-upheld"
    ? "clear"
    : "block";
}

function assertExpectationMatchesPolicy(
  expected: CanonicalPurchaseVerificationExpectation,
  policy: FinalityPolicy,
): void {
  if (expected.claim.project.chainId !== policy.chainId) {
    throw invalid("Purchase expectation does not use the selected finality policy chain.");
  }
}

function parseExpectedClaimId(
  value: unknown,
  expectedClaim: CanonicalPurchaseClaim,
): AuthorityId {
  const claimId = parseAuthorityId(value, "canonical purchase claim ID");
  if (claimId !== expectedClaim.claimId) {
    throw invalid("Canonical purchase result is for another server-issued claim.");
  }
  return claimId;
}

function parseExpectedAttestationId(
  value: unknown,
  expected: RefundAttestationVerificationExpectation,
): AuthorityId {
  const attestationId = parseAuthorityId(value, "refund attestation ID");
  if (attestationId !== expected.attestationId) {
    throw invalid("Refund verification result is for another attestation claim.");
  }
  return attestationId;
}

const INELIGIBLE_PURCHASE_REASON_CODES = new Set<unknown>([
  "receipt-failed",
  "receipt-or-log-not-found",
  "wrong-event-or-emitter",
  "beneficiary-mismatch",
  "project-or-ruleset-mismatch",
  "terminal-not-canonical",
  "tier-hook-not-canonical",
  "mint-not-payment-mint",
  "ambiguous-log-correlation",
  "canonical-evidence-orphaned",
]);

const UNAVAILABLE_PURCHASE_REASON_CODES = new Set<unknown>([
  "not-configured",
  "rpc-unavailable",
  "archive-state-unavailable",
  "deployment-allowlist-unavailable",
  "malformed-chain-response",
]);

const INVALID_REFUND_ATTESTATION_REASON_CODES = new Set<unknown>([
  "bad-signature",
  "wrong-signer",
  "wrong-domain",
  "payload-digest-mismatch",
  "authority-generation-stale",
  "device-credential-stale",
]);

const UNAVAILABLE_REFUND_ATTESTATION_REASON_CODES = new Set<unknown>([
  "not-configured",
  "signature-verifier-unavailable",
  "erc1271-rpc-unavailable",
  "erc6492-verifier-unavailable",
]);

function assertFixedSemantics(record: Record<string, unknown>): void {
  if (
    record.customerSubjectSource !== "pay-beneficiary" ||
    record.payerAttribution !== "not-evaluated" ||
    record.transactionSenderAttribution !== "never-inferred" ||
    record.callerAttribution !== "never-inferred" ||
    record.refundStatus !== "not-evaluated"
  ) {
    throw invalid("Purchase evidence weakens customer attribution or refund semantics.");
  }
}

function assertProjectAndBlock(
  evidenceProject: JuiceboxV6ProjectRef,
  project: JuiceboxV6ProjectRef,
  block: FinalizedBlockAnchor,
  receipt: CanonicalReceiptProof,
): void {
  if (
    !sameJuiceboxV6ProjectRef(evidenceProject, project) ||
    block.blockHash !== receipt.block.blockHash ||
    block.blockNumber !== receipt.block.blockNumber
  ) {
    throw invalid("Historical relationship evidence must use the exact receipt block.");
  }
}

function deepFreezeAuthorityValue<T>(
  value: T,
  seen: WeakSet<object> = new WeakSet<object>(),
): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) {
    deepFreezeAuthorityValue(child, seen);
  }
  return Object.freeze(value);
}

function invalid(message: string): AuthorityValidationError {
  return new AuthorityValidationError(message);
}
