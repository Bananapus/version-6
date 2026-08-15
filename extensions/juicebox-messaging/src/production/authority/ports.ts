import type {
  ChallengeExpectations,
  WalletChallenge,
  WinningChallengeClaim,
} from "./challenges";
import type {
  AuthorityAuditRecord,
  AuthorityDecision,
  AuthorityGateRequest,
} from "./decisions";
import type {
  AuthorityGeneration,
  AuthorityTransitionScanCheckpoint,
  AuthorityTransitionSource,
  FinalizedAuthorityTransitionScan,
  FinalizedAuthorityLossEvidence,
  ProjectStaffCapability,
  ProjectStaffDelegation,
  RootAuthorityVerificationResult,
} from "./delegations";
import type {
  DeviceEnrollmentRequest,
  DeviceCredentialSignatureVerificationResult,
  ClaimEnrollmentChallengePairResult,
  DeviceDirectoryProofBundle,
  DevicePossessionChallenge,
  DevicePossessionProof,
} from "./devices";
import type {
  CanonicalityResult,
  FinalityPolicy,
  FinalizedBlockAnchor,
} from "./finality";
import type {
  CanonicalPurchaseVerificationExpectation,
  RefundAttestationVerificationRequest,
  RefundLedgerExpectation,
} from "./purchases";
import type {
  WalletSignatureSubmission,
  WalletSignatureVerificationResult,
} from "./signatures";
import type {
  AuthorityId,
  CanonicalInstant,
  EthereumAddress,
  Hash32,
  JuiceboxV6ProjectRef,
} from "./valueObjects";

export type PortUnavailableReason =
  | "not-configured"
  | "dependency-unavailable"
  | "timeout"
  | "malformed-dependency-response";

export type IssuedWalletChallengeResult =
  | { status: "issued"; challenge: WalletChallenge }
  | { status: "unavailable"; reasonCode: PortUnavailableReason };

export type ClaimWalletChallengeResult =
  | {
      status: "claimed";
      challenge: WalletChallenge;
      challengeId: AuthorityId;
      claimId: AuthorityId;
      claimedAt: CanonicalInstant;
      terminalEvenIfVerificationFails: true;
    }
  | { status: "not-found" }
  | { status: "already-claimed-or-consumed" }
  | { status: "unavailable"; reasonCode: PortUnavailableReason };

export type RecordWalletChallengeOutcomeResult =
  | { status: "recorded" }
  | { status: "already-recorded" }
  | { status: "unavailable"; reasonCode: PortUnavailableReason };

export interface WalletChallengeIssuerPort {
  issue(input: {
    kind: WalletChallenge["kind"];
    expectations: ChallengeExpectations;
    now: CanonicalInstant;
  }): Promise<IssuedWalletChallengeResult>;
}

export interface WalletChallengeStorePort {
  /**
   * Atomically and terminally claims the server record before any signature RPC
   * or recovery. Exactly one claimant can win; a crash, timeout, or invalid
   * signature never makes the challenge claimable again.
   */
  claimForVerification(input: {
    challengeId: AuthorityId;
    claimId: AuthorityId;
    claimedAt: CanonicalInstant;
  }): Promise<ClaimWalletChallengeResult>;
  /** Records the terminal outcome for audit only; it cannot reopen the claim. */
  recordClaimOutcome(input: {
    challengeId: AuthorityId;
    claimId: AuthorityId;
    outcome: "verified" | "invalid" | "unavailable";
    outcomeDigest: Hash32;
    recordedAt: CanonicalInstant;
  }): Promise<RecordWalletChallengeOutcomeResult>;
}

export interface WalletSignatureVerifierPort {
  verify(input: {
    challenge: WalletChallenge;
    winningClaim: WinningChallengeClaim;
    submission: WalletSignatureSubmission;
    finalityPolicy: FinalityPolicy;
    now: CanonicalInstant;
  }): Promise<WalletSignatureVerificationResult>;
}

export interface DevicePossessionVerifierPort {
  verify(input: {
    request: DeviceEnrollmentRequest;
    proof: DevicePossessionProof;
  }): Promise<unknown>;
}

export interface MlsKeyPackageSemanticVerifierPort {
  /** Returns untrusted evidence parsed by parseMlsKeyPackageSemanticVerificationResult. */
  verify(input: {
    device: DeviceEnrollmentRequest["device"];
    now: CanonicalInstant;
  }): Promise<unknown>;
}

export interface DeviceKeyTransparencyVerifierPort {
  /** Returns untrusted evidence parsed by parseDeviceKeyTransparencyVerificationResult. */
  verify(input: {
    directoryEntry: DeviceDirectoryProofBundle;
    now: CanonicalInstant;
  }): Promise<unknown>;
}

export type IssueDevicePossessionChallengeResult =
  | { status: "issued-and-persisted"; challenge: DevicePossessionChallenge }
  | { status: "unavailable"; reasonCode: PortUnavailableReason };

export interface DevicePossessionChallengeIssuerPort {
  issueAndPersist(input: {
    walletChallenge: WalletChallenge;
    possessionNonce: string;
    now: CanonicalInstant;
  }): Promise<IssueDevicePossessionChallengeResult>;
}

export interface DeviceEnrollmentChallengeStorePort {
  /** Atomically claims both server records before either proof is verified. */
  claimPairForVerification(input: {
    walletChallengeId: AuthorityId;
    possessionChallengeId: AuthorityId;
    enrollmentId: AuthorityId;
    claimId: AuthorityId;
    claimedAt: CanonicalInstant;
  }): Promise<ClaimEnrollmentChallengePairResult>;
}

export interface DeviceEnrollmentPort {
  /**
   * Returns an untrusted result parsed by parseDeviceEnrollmentResult, which
   * rejects success unless possession and MLS semantic evidence are verified.
   */
  enrollAtomically(request: DeviceEnrollmentRequest): Promise<unknown>;
}

export interface DeviceCredentialSignatureVerifierPort {
  verify(input: {
    credential: unknown;
    expectedSignerKeyId: AuthorityId;
    now: CanonicalInstant;
  }): Promise<DeviceCredentialSignatureVerificationResult>;
}

export interface ProjectRootAuthorityVerifierPort {
  verify(input: {
    project: JuiceboxV6ProjectRef;
    principal: EthereumAddress;
    policy: FinalityPolicy;
  }): Promise<RootAuthorityVerificationResult>;
}

export interface AuthorityTransitionScannerPort {
  /**
   * Returns one untrusted, complete finalized-range scan. Callers must parse it
   * with parseFinalizedAuthorityTransitionScan before persisting anything.
   */
  scanFinalizedRange(input: {
    project: JuiceboxV6ProjectRef;
    adapterRevision: AuthorityId;
    sources: readonly [AuthorityTransitionSource, ...AuthorityTransitionSource[]];
    previousCheckpoint: AuthorityTransitionScanCheckpoint | null;
    previousGeneration: AuthorityGeneration | null;
    verifiedThroughBlock: FinalizedBlockAnchor;
    policy: FinalityPolicy;
    now: CanonicalInstant;
  }): Promise<unknown>;
}

export type AuthorityGenerationScanCommitResult =
  | {
      status: "applied";
      generation: AuthorityGeneration;
      checkpoint: AuthorityTransitionScanCheckpoint;
    }
  | {
      status: "unchanged";
      generation: AuthorityGeneration;
      checkpoint: AuthorityTransitionScanCheckpoint;
    }
  | { status: "version-conflict" }
  | { status: "unavailable"; reasonCode: PortUnavailableReason };

export interface AuthorityGenerationStorePort {
  current(
    project: JuiceboxV6ProjectRef,
  ): Promise<
    | {
        status: "found";
        generation: AuthorityGeneration;
        checkpoint: AuthorityTransitionScanCheckpoint;
      }
    | { status: "not-found" }
    | { status: "unavailable"; reasonCode: PortUnavailableReason }
  >;
  /** Atomically appends every generation and advances the exact scan checkpoint. */
  applyFinalizedScanAtomically(input: {
    project: JuiceboxV6ProjectRef;
    expectedGenerationId: AuthorityId | null;
    expectedCheckpointId: AuthorityId | null;
    expectedCheckpointDigest: Hash32 | null;
    scan: FinalizedAuthorityTransitionScan;
  }): Promise<AuthorityGenerationScanCommitResult>;
}

export type ProjectStaffVerificationResult =
  | {
      status: "verified";
      delegation: ProjectStaffDelegation;
      evidenceId: AuthorityId;
      evidenceDigest: Hash32;
    }
  | {
      status: "ineligible";
      reasonCode:
        | "delegation-not-found"
        | "delegation-revoked"
        | "delegation-expired"
        | "authority-generation-stale"
        | "capability-not-delegated";
    }
  | {
      status: "unavailable";
      reasonCode: "not-configured" | "delegation-store-unavailable";
    };

export interface ProjectStaffVerifierPort {
  verify(input: {
    project: JuiceboxV6ProjectRef;
    staffAccount: EthereumAddress;
    installationId: AuthorityId;
    capability: ProjectStaffCapability;
    generation: AuthorityGeneration;
    now: CanonicalInstant;
  }): Promise<ProjectStaffVerificationResult>;
}

export interface ChainFinalityVerifierPort {
  verifyReceiptCanonicality(input: {
    chainId: JuiceboxV6ProjectRef["chainId"];
    transactionHash: Hash32;
    policy: FinalityPolicy;
    now: CanonicalInstant;
  }): Promise<CanonicalityResult>;
}

export interface CanonicalPurchaseVerifierPort {
  /** Returns untrusted adapter output for parseCanonicalPurchaseVerificationResult. */
  verify(input: {
    expectation: CanonicalPurchaseVerificationExpectation;
    policy: FinalityPolicy;
  }): Promise<unknown>;
}

export interface RefundLedgerPort {
  /**
   * Returns an untrusted transport payload. Callers pass it through
   * prepareRefundLedgerResult, verify only the emitted requests, and then call
   * finalizeRefundLedgerResult with the untrusted verifier responses.
   */
  lookup(input: { expectation: RefundLedgerExpectation }): Promise<unknown>;
}

export interface RefundAttestationVerifierPort {
  /**
   * Cryptographically verifies one canonical refund record or fresh head
   * envelope. The ledger lookup cannot self-assert this result.
   */
  verify(
    input: RefundAttestationVerificationRequest,
  ): Promise<unknown>;
}

export type AppendAuditResult =
  | {
      status: "persisted";
      auditRecordId: AuthorityId;
      auditRecordDigest: Hash32;
    }
  | {
      status: "already-persisted";
      auditRecordId: AuthorityId;
      auditRecordDigest: Hash32;
    }
  | { status: "unavailable"; reasonCode: "audit-store-unavailable" };

export interface AuthorityAuditSinkPort {
  appendBeforeRelease(record: AuthorityAuditRecord): Promise<AppendAuditResult>;
}

export interface AuthorityRevocationRequest {
  requestId: AuthorityId;
  project: JuiceboxV6ProjectRef;
  affectedAuthorityGeneration: AuthorityGeneration;
  requiredGenerationAction: "retire-exact-generation-and-freeze";
  cause:
    | Extract<CanonicalityResult, { status: "orphaned" }>
    | FinalizedAuthorityLossEvidence;
  derivedEvidenceIds: readonly [AuthorityId, ...AuthorityId[]];
  observedAt: CanonicalInstant;
}

export type AuthorityRevocationCommitResult =
  | {
      status: "committed";
      requestId: AuthorityId;
      causeDigest: Hash32;
      derivedEvidenceSetDigest: Hash32;
      revocationCommitId: AuthorityId;
      retiredAuthorityGenerationId: AuthorityId;
      retiredAuthorityGenerationSequence: AuthorityGeneration["sequence"];
      retiredAuthorityGenerationDigest: Hash32;
      generationRetirementId: AuthorityId;
      generationRetirementDigest: Hash32;
      authorityGenerationState: "retired";
      affectedLeaseCount: number;
      revokedLeaseIdsDigest: Hash32;
      revokedDelegationIdsDigest: Hash32;
      policyHeadDigest: Hash32;
      auditRecordId: AuthorityId;
      outboxRecordId: AuthorityId;
      freezeRecordId: AuthorityId;
      freezeRecordDigest: Hash32;
      admissionState: "frozen";
      sendState: "frozen-pending-rekey";
      mlsRekeyRequestDigest: Hash32;
      mlsAction: "remove-and-rekey-enqueued";
      sendsPausedUntilRekey: true;
      committedAt: CanonicalInstant;
      atomicCommitDigest: Hash32;
    }
  | {
      status: "unavailable";
      requestId: AuthorityId | null;
      causeDigest: Hash32 | null;
      affectedAuthorityGenerationId: AuthorityId | null;
      generationRetirementCommitted: false;
      reasonCode:
        | "revocation-coordinator-not-configured"
        | "lease-index-unavailable"
        | "audit-store-unavailable"
        | "outbox-unavailable";
      authorityRemainsSuspended: true;
      sendsRemainFrozen: true;
    };

export interface AuthorityRevocationCoordinatorPort {
  /** Atomically revokes derived authority, pauses sends, audits, and enqueues MLS rekey. */
  revokeAndEnqueueRekey(
    request: AuthorityRevocationRequest,
  ): Promise<AuthorityRevocationCommitResult>;
}

export type AuthorityGateResult =
  | { status: "decided"; decision: AuthorityDecision }
  | {
      status: "unavailable";
      requestId: AuthorityId;
      reasonCode: "authority-service-not-configured";
      decision: null;
      lease: null;
    };

export interface AuthorityDecisionEnginePort {
  evaluate(request: AuthorityGateRequest): Promise<AuthorityGateResult>;
}

export interface ProductionAuthorityPorts {
  challengeIssuer: WalletChallengeIssuerPort;
  challengeStore: WalletChallengeStorePort;
  walletSignatureVerifier: WalletSignatureVerifierPort;
  devicePossessionChallengeIssuer: DevicePossessionChallengeIssuerPort;
  deviceEnrollmentChallengeStore: DeviceEnrollmentChallengeStorePort;
  devicePossessionVerifier: DevicePossessionVerifierPort;
  mlsKeyPackageSemanticVerifier: MlsKeyPackageSemanticVerifierPort;
  deviceEnrollment: DeviceEnrollmentPort;
  deviceCredentialSignatureVerifier: DeviceCredentialSignatureVerifierPort;
  deviceKeyTransparencyVerifier: DeviceKeyTransparencyVerifierPort;
  projectRootAuthorityVerifier: ProjectRootAuthorityVerifierPort;
  authorityTransitionScanner: AuthorityTransitionScannerPort;
  authorityGenerationStore: AuthorityGenerationStorePort;
  projectStaffVerifier: ProjectStaffVerifierPort;
  chainFinalityVerifier: ChainFinalityVerifierPort;
  canonicalPurchaseVerifier: CanonicalPurchaseVerifierPort;
  refundLedger: RefundLedgerPort;
  refundAttestationVerifier: RefundAttestationVerifierPort;
  auditSink: AuthorityAuditSinkPort;
  revocationCoordinator: AuthorityRevocationCoordinatorPort;
  decisionEngine: AuthorityDecisionEnginePort;
}
