import type { ProductionAuthorityPorts } from "./ports";
import type {
  AuthorityId,
  Hash32,
  JuiceboxV6ChainId,
} from "./valueObjects";

const UNAVAILABLE_ID = "unavailable.not-configured" as AuthorityId;
const UNAVAILABLE_CHAIN_ID = 1 as JuiceboxV6ChainId;
const UNAVAILABLE_HASH = `0x${"0".repeat(64)}` as Hash32;

/**
 * Safe production default. These adapters do not verify, persist, issue, enroll,
 * delegate, or authorize anything. Every operation returns a typed unavailable
 * outcome and no authority decision or lease is created.
 */
export function createUnavailableProductionAuthorityPorts(): ProductionAuthorityPorts {
  return {
    challengeIssuer: {
      issue: () =>
        Promise.resolve({ status: "unavailable", reasonCode: "not-configured" }),
    },
    challengeStore: {
      claimForVerification: () =>
        Promise.resolve({ status: "unavailable", reasonCode: "not-configured" }),
      recordClaimOutcome: () =>
        Promise.resolve({ status: "unavailable", reasonCode: "not-configured" }),
    },
    walletSignatureVerifier: {
      verify: () =>
        Promise.resolve({
          status: "unavailable",
          challengeId: UNAVAILABLE_ID,
          attemptedMethod: "not-dispatched",
          reasonCode: "signature-verifier-not-configured",
        }),
    },
    devicePossessionChallengeIssuer: {
      issueAndPersist: () =>
        Promise.resolve({ status: "unavailable", reasonCode: "not-configured" }),
    },
    deviceEnrollmentChallengeStore: {
      claimPairForVerification: () =>
        Promise.resolve({ status: "unavailable", reasonCode: "not-configured" }),
    },
    devicePossessionVerifier: {
      verify: () =>
        Promise.resolve({
          status: "unavailable",
          enrollmentId: UNAVAILABLE_ID,
          possessionChallengeId: null,
          reasonCode: "not-configured",
        }),
    },
    mlsKeyPackageSemanticVerifier: {
      verify: () =>
        Promise.resolve({
          status: "unavailable",
          installationId: null,
          reasonCode: "not-configured",
        }),
    },
    deviceEnrollment: {
      enrollAtomically: () =>
        Promise.resolve({
          status: "unavailable",
          enrollmentId: UNAVAILABLE_ID,
          reasonCode: "device-enrollment-verifier-not-configured",
        }),
    },
    deviceCredentialSignatureVerifier: {
      verify: () =>
        Promise.resolve({
          status: "unavailable",
          credentialId: null,
          reasonCode: "credential-signature-verifier-not-configured",
        }),
    },
    deviceKeyTransparencyVerifier: {
      verify: () =>
        Promise.resolve({
          status: "unavailable",
          credentialId: null,
          reasonCode: "not-configured",
        }),
    },
    projectRootAuthorityVerifier: {
      verify: () =>
        Promise.resolve({
          status: "unavailable",
          project: null,
          principal: null,
          reasonCode: "root-authority-verifier-not-configured",
        }),
    },
    authorityTransitionScanner: {
      scanFinalizedRange: () =>
        Promise.resolve({ status: "unavailable", reasonCode: "not-configured" }),
    },
    authorityGenerationStore: {
      current: () =>
        Promise.resolve({ status: "unavailable", reasonCode: "not-configured" }),
      applyFinalizedScanAtomically: () =>
        Promise.resolve({ status: "unavailable", reasonCode: "not-configured" }),
    },
    projectStaffVerifier: {
      verify: () =>
        Promise.resolve({ status: "unavailable", reasonCode: "not-configured" }),
    },
    chainFinalityVerifier: {
      verifyReceiptCanonicality: () =>
        Promise.resolve({
          status: "unavailable",
          transactionHash: UNAVAILABLE_HASH,
          chainId: UNAVAILABLE_CHAIN_ID,
          reasonCode: "finality-verifier-not-configured",
        }),
    },
    canonicalPurchaseVerifier: {
      verify: () =>
        Promise.resolve({
          status: "unavailable",
          claimId: UNAVAILABLE_ID,
          reasonCode: "not-configured",
        }),
    },
    refundLedger: {
      lookup: () =>
        Promise.resolve({
          status: "unavailable",
          eligibilityEffect: "block",
          reasonCode: "refund-ledger-not-configured",
        }),
    },
    refundAttestationVerifier: {
      verify: () =>
        Promise.resolve({
          status: "unavailable",
          attestationId: UNAVAILABLE_ID,
          reasonCode: "not-configured",
        }),
    },
    auditSink: {
      appendBeforeRelease: () =>
        Promise.resolve({
          status: "unavailable",
          reasonCode: "audit-store-unavailable",
        }),
    },
    revocationCoordinator: {
      revokeAndEnqueueRekey: () =>
        Promise.resolve({
          status: "unavailable",
          requestId: null,
          causeDigest: null,
          affectedAuthorityGenerationId: null,
          generationRetirementCommitted: false,
          reasonCode: "revocation-coordinator-not-configured",
          authorityRemainsSuspended: true,
          sendsRemainFrozen: true,
        }),
    },
    decisionEngine: {
      evaluate: () =>
        Promise.resolve({
          status: "unavailable",
          requestId: UNAVAILABLE_ID,
          reasonCode: "authority-service-not-configured",
          decision: null,
          lease: null,
        }),
    },
  };
}
