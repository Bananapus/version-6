import {
  parseAccountId,
  parseDeviceCredentialId,
  parseDeviceKeyBinding,
  parseEnrollmentId,
  parseInstallationId,
  parsePossessionChallengeId,
  parseWalletChallengeScope,
  parseWalletChallenge,
  parseWalletChallengeId,
  walletChallengeEnrollmentBinding,
  type AccountId,
  type DeviceCredentialId,
  type DeviceKeyBinding,
  type EnrollmentId,
  type InstallationId,
  type PossessionChallengeId,
  type WalletChallenge,
  type WalletChallengeId,
  type WalletChallengeEnrollmentBinding,
  type WalletChallengeScope,
} from "./challenges";
import { sha256AuthorityDigest } from "./digests";
import {
  AuthorityValidationError,
  expectExactRecord,
  instantMilliseconds,
  parseAuthorityId,
  parseBase64Url,
  parseCanonicalInstant,
  parseEthereumAddress,
  parseHash32,
  parseHttpsOrigin,
  parseJuiceboxV6ChainId,
  parseUint256Decimal,
  type AuthorityId,
  type Base64Url,
  type CanonicalInstant,
  type EthereumAddress,
  type Hash32,
  type HttpsOrigin,
  type JuiceboxV6ChainId,
  type Uint256Decimal,
} from "./valueObjects";

const MAX_DEVICE_CREDENTIAL_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_POSSESSION_CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;
export const DEVICE_POSSESSION_DOMAIN = "jb-msg-device-possession/v1" as const;

export interface DevicePossessionChallenge {
  kind: "device-possession-challenge.v1";
  challengeId: PossessionChallengeId;
  nonce: Base64Url;
  walletChallengeId: WalletChallengeId;
  walletPayloadDigest: Hash32;
  enrollmentId: EnrollmentId;
  accountId: AccountId;
  deviceCredentialId: DeviceCredentialId;
  account: EthereumAddress;
  chainId: JuiceboxV6ChainId;
  origin: HttpsOrigin;
  audience: HttpsOrigin;
  clientId: AuthorityId;
  scope: WalletChallengeScope;
  scopeDigest: Hash32;
  purpose: "device-enrollment";
  walletProtocolProfile:
    | "siwe-erc4361-v1"
    | "eip712-device-enrollment-v1";
  device: DeviceKeyBinding;
  challengeDigest: Hash32;
  issuedAt: CanonicalInstant;
  notBefore: CanonicalInstant;
  expiresAt: CanonicalInstant;
}

export interface DevicePossessionProof {
  kind: "p256-es256-installation-possession.v1";
  enrollmentId: EnrollmentId;
  possessionChallengeId: PossessionChallengeId;
  installationId: InstallationId;
  challengeDigest: Hash32;
  signature: Base64Url;
}

export type DevicePossessionVerificationResult =
  | {
      status: "verified";
      enrollmentId: EnrollmentId;
      walletChallengeId: WalletChallengeId;
      possessionChallengeId: PossessionChallengeId;
      installationId: InstallationId;
      deviceCredentialId: DeviceCredentialId;
      challengeDigest: Hash32;
      proofDigest: Hash32;
      evidenceId: AuthorityId;
      evidenceDigest: Hash32;
      verifiedAt: CanonicalInstant;
    }
  | {
      status: "invalid";
      enrollmentId: EnrollmentId;
      possessionChallengeId: PossessionChallengeId;
      reasonCode: "signature-invalid" | "device-key-binding-mismatch" | "replay";
    }
  | {
      status: "unavailable";
      enrollmentId: EnrollmentId;
      possessionChallengeId: PossessionChallengeId | null;
      reasonCode: "not-configured" | "device-registry-unavailable";
    };

export type MlsKeyPackageSemanticVerificationResult =
  | {
      status: "verified";
      installationId: InstallationId;
      ciphersuite: DeviceKeyBinding["mlsCredentialKey"]["ciphersuite"];
      credentialFingerprint: Base64Url;
      keyPackageKind: "ordinary-mls-key-package.v1";
      keyPackageRef: Base64Url;
      keyPackageSha256: Base64Url;
      keyPackageExpiresAt: CanonicalInstant;
      signatureVerified: true;
      credentialAndInitKeyMatched: true;
      lastResort: false;
      evidenceId: AuthorityId;
      evidenceDigest: Hash32;
      verifiedAt: CanonicalInstant;
    }
  | {
      status: "invalid";
      installationId: InstallationId;
      reasonCode:
        | "malformed-key-package"
        | "suite-mismatch"
        | "credential-mismatch"
        | "init-key-invalid"
        | "signature-invalid"
        | "reference-mismatch"
        | "hash-mismatch"
        | "expired"
        | "last-resort"
        | "already-used";
    }
  | {
      status: "unavailable";
      installationId: InstallationId | null;
      reasonCode: "not-configured" | "mls-parser-unavailable";
    };

export interface DeviceDirectoryProofBundle {
  kind: "device-directory-proof-bundle.v1";
  entryId: AuthorityId;
  credentialId: DeviceCredentialId;
  credentialPayloadDigest: Hash32;
  checkpointId: AuthorityId;
  inclusionProof: Base64Url;
  consistencyProof: Base64Url;
  witnessReceipt: Base64Url;
}

export type DeviceKeyTransparencyVerificationResult =
  | {
      status: "verified";
      entryId: AuthorityId;
      credentialId: DeviceCredentialId;
      checkpointId: AuthorityId;
      inclusionProofDigest: Hash32;
      consistencyProofDigest: Hash32;
      witnessReceiptDigest: Hash32;
      evidenceId: AuthorityId;
      evidenceDigest: Hash32;
      verifiedAt: CanonicalInstant;
    }
  | {
      status: "invalid";
      credentialId: DeviceCredentialId;
      reasonCode:
        | "inclusion-proof-invalid"
        | "consistency-proof-invalid"
        | "witness-receipt-invalid"
        | "split-view";
    }
  | {
      status: "unavailable";
      credentialId: DeviceCredentialId | null;
      reasonCode: "not-configured" | "directory-unavailable" | "witness-unavailable";
    };

export interface DeviceEnrollmentRequest {
  kind: "device-enrollment-request.v1";
  enrollmentId: EnrollmentId;
  accountId: AccountId;
  deviceCredentialId: DeviceCredentialId;
  account: EthereumAddress;
  chainId: JuiceboxV6ChainId;
  walletChallengeId: WalletChallengeId;
  possessionChallengeId: PossessionChallengeId;
  device: DeviceKeyBinding;
  possessionProof: DevicePossessionProof;
  requestedAt: CanonicalInstant;
  displayLabel: string;
}

export interface DeviceCredential {
  kind: "device-credential.v1";
  credentialId: DeviceCredentialId;
  enrollmentId: EnrollmentId;
  accountId: AccountId;
  account: EthereumAddress;
  chainId: JuiceboxV6ChainId;
  device: DeviceKeyBinding;
  walletVerificationEvidenceDigest: Hash32;
  possessionEvidenceDigest: Hash32;
  issuedAt: CanonicalInstant;
  expiresAt: CanonicalInstant;
  revocationVersion: Uint256Decimal;
  roleBinding: null;
  credentialSignerKeyId: AuthorityId;
  credentialPayloadDigest: Hash32;
  credentialSignature: Base64Url;
  signatureVerificationEvidenceId: AuthorityId;
  signatureVerificationEvidenceDigest: Hash32;
}

export type DeviceCredentialSignatureVerificationResult =
  | {
      status: "verified";
      credentialId: DeviceCredentialId;
      signerKeyId: AuthorityId;
      payloadDigest: Hash32;
      signatureDigest: Hash32;
      evidenceId: AuthorityId;
      evidenceDigest: Hash32;
      verifiedAt: CanonicalInstant;
    }
  | {
      status: "invalid";
      credentialId: DeviceCredentialId;
      reasonCode: "signature-invalid" | "signer-key-mismatch";
    }
  | {
      status: "unavailable";
      credentialId: DeviceCredentialId | null;
      reasonCode: "credential-signature-verifier-not-configured" | "key-unavailable";
    };

export type DeviceEnrollmentResult =
  | {
      status: "enrolled";
      enrollmentId: EnrollmentId;
      credential: DeviceCredential;
      directoryEntry: DeviceDirectoryProofBundle;
    }
  | {
      status: "invalid";
      enrollmentId: EnrollmentId;
      reasonCode:
        | "wallet-proof-invalid"
        | "device-possession-invalid"
        | "challenge-binding-mismatch"
        | "device-revoked"
        | "device-limit-reached";
    }
  | {
      status: "unavailable";
      enrollmentId: EnrollmentId;
      reasonCode:
        | "device-enrollment-verifier-not-configured"
        | "wallet-verifier-unavailable"
        | "device-possession-verifier-unavailable"
        | "mls-key-package-verifier-unavailable"
        | "key-transparency-unavailable"
        | "device-registry-unavailable"
        | "audit-store-unavailable";
    };

export type ClaimEnrollmentChallengePairResult =
  | {
      status: "claimed";
      claimId: AuthorityId;
      walletChallenge: WalletChallenge;
      possessionChallenge: DevicePossessionChallenge;
      claimedAt: CanonicalInstant;
      bothClaimsTerminalEvenIfVerificationFails: true;
    }
  | { status: "not-found" }
  | { status: "already-claimed-or-consumed" }
  | {
      status: "unavailable";
      reasonCode:
        | "not-configured"
        | "dependency-unavailable"
        | "timeout"
        | "malformed-dependency-response";
    };

export function computeDevicePossessionChallengeDigest(
  challenge: Omit<DevicePossessionChallenge, "challengeDigest">,
): Hash32 {
  return sha256AuthorityDigest({
    domain: DEVICE_POSSESSION_DOMAIN,
    challenge,
  });
}

export function parseDevicePossessionVerificationResult(
  value: unknown,
  expected: {
    request: DeviceEnrollmentRequest;
    challenge: DevicePossessionChallenge;
    now: CanonicalInstant;
  },
): DevicePossessionVerificationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("Device possession verification result must be an object.");
  }
  const status = (value as Record<string, unknown>).status;
  if (status === "verified") {
    const record = expectExactRecord(
      value,
      [
        "status",
        "enrollmentId",
        "walletChallengeId",
        "possessionChallengeId",
        "installationId",
        "deviceCredentialId",
        "challengeDigest",
        "proofDigest",
        "evidenceId",
        "evidenceDigest",
        "verifiedAt",
      ],
      "verified device possession evidence",
    );
    const parsed = {
      status,
      enrollmentId: parseEnrollmentId(record.enrollmentId),
      walletChallengeId: parseWalletChallengeId(
        record.walletChallengeId,
        "walletChallengeId",
      ),
      possessionChallengeId: parsePossessionChallengeId(
        record.possessionChallengeId,
        "possessionChallengeId",
      ),
      installationId: parseInstallationId(record.installationId),
      deviceCredentialId: parseDeviceCredentialId(
        record.deviceCredentialId,
        "deviceCredentialId",
      ),
      challengeDigest: parseHash32(record.challengeDigest, "challenge digest"),
      proofDigest: parseHash32(record.proofDigest, "possession proof digest"),
      evidenceId: parseAuthorityId(record.evidenceId, "possession evidence ID"),
      evidenceDigest: parseHash32(
        record.evidenceDigest,
        "possession evidence digest",
      ),
      verifiedAt: parseCanonicalInstant(record.verifiedAt, "verifiedAt"),
    } as const;
    if (
      parsed.enrollmentId !== expected.request.enrollmentId ||
      parsed.walletChallengeId !== expected.request.walletChallengeId ||
      parsed.possessionChallengeId !== expected.request.possessionChallengeId ||
      parsed.installationId !== expected.request.device.installationId ||
      parsed.deviceCredentialId !== expected.request.deviceCredentialId ||
      parsed.challengeDigest !== expected.challenge.challengeDigest ||
      parsed.proofDigest !==
        sha256AuthorityDigest({
          kind: "device-possession-proof.v1",
          proof: expected.request.possessionProof,
        }) ||
      instantMilliseconds(parsed.verifiedAt) > instantMilliseconds(expected.now) ||
      instantMilliseconds(parsed.verifiedAt) <
        instantMilliseconds(expected.challenge.notBefore) ||
      instantMilliseconds(parsed.verifiedAt) >=
        instantMilliseconds(expected.challenge.expiresAt)
    ) {
      throw invalid("Verified possession evidence belongs to another proof or challenge.");
    }
    return parsed;
  }
  if (status === "invalid") {
    const record = expectExactRecord(
      value,
      ["status", "enrollmentId", "possessionChallengeId", "reasonCode"],
      "invalid device possession evidence",
    );
    if (
      record.reasonCode !== "signature-invalid" &&
      record.reasonCode !== "device-key-binding-mismatch" &&
      record.reasonCode !== "replay"
    ) {
      throw invalid("Device possession invalidity reason is unsupported.");
    }
    return {
      status,
      enrollmentId: parseEnrollmentId(record.enrollmentId),
      possessionChallengeId: parsePossessionChallengeId(
        record.possessionChallengeId,
        "possessionChallengeId",
      ),
      reasonCode: record.reasonCode,
    };
  }
  if (status === "unavailable") {
    const record = expectExactRecord(
      value,
      ["status", "enrollmentId", "possessionChallengeId", "reasonCode"],
      "unavailable device possession evidence",
    );
    if (
      record.reasonCode !== "not-configured" &&
      record.reasonCode !== "device-registry-unavailable"
    ) {
      throw invalid("Device possession unavailability reason is unsupported.");
    }
    return {
      status,
      enrollmentId: parseEnrollmentId(record.enrollmentId),
      possessionChallengeId:
        record.possessionChallengeId === null
          ? null
          : parsePossessionChallengeId(record.possessionChallengeId),
      reasonCode: record.reasonCode,
    };
  }
  throw invalid("Device possession verification status is unsupported.");
}

export function parseMlsKeyPackageSemanticVerificationResult(
  value: unknown,
  expected: { device: DeviceKeyBinding; now: CanonicalInstant },
): MlsKeyPackageSemanticVerificationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("MLS KeyPackage verification result must be an object.");
  }
  const status = (value as Record<string, unknown>).status;
  if (status === "verified") {
    const record = expectExactRecord(
      value,
      [
        "status",
        "installationId",
        "ciphersuite",
        "credentialFingerprint",
        "keyPackageKind",
        "keyPackageRef",
        "keyPackageSha256",
        "keyPackageExpiresAt",
        "signatureVerified",
        "credentialAndInitKeyMatched",
        "lastResort",
        "evidenceId",
        "evidenceDigest",
        "verifiedAt",
      ],
      "verified MLS KeyPackage evidence",
    );
    const keyPackage = expected.device.mlsCredentialKey.initialKeyPackage;
    const parsed = {
      status,
      installationId: parseInstallationId(record.installationId),
      ciphersuite: expectMlsCiphersuite(record.ciphersuite),
      credentialFingerprint: parseBase64Url(
        record.credentialFingerprint,
        "MLS credential fingerprint",
        { minLength: 43, maxLength: 43 },
      ),
      keyPackageKind: expectOrdinaryKeyPackage(record.keyPackageKind),
      keyPackageRef: parseBase64Url(record.keyPackageRef, "KeyPackage ref", {
        minLength: 43,
        maxLength: 43,
      }),
      keyPackageSha256: parseBase64Url(record.keyPackageSha256, "KeyPackage SHA-256", {
        minLength: 43,
        maxLength: 43,
      }),
      keyPackageExpiresAt: parseCanonicalInstant(
        record.keyPackageExpiresAt,
        "KeyPackage expiresAt",
      ),
      signatureVerified: expectTrue(record.signatureVerified, "KeyPackage signature"),
      credentialAndInitKeyMatched: expectTrue(
        record.credentialAndInitKeyMatched,
        "KeyPackage credential and init key",
      ),
      lastResort: expectFalse(record.lastResort, "KeyPackage last-resort flag"),
      evidenceId: parseAuthorityId(record.evidenceId, "KeyPackage evidence ID"),
      evidenceDigest: parseHash32(record.evidenceDigest, "KeyPackage evidence digest"),
      verifiedAt: parseCanonicalInstant(record.verifiedAt, "KeyPackage verifiedAt"),
    } as const;
    if (
      parsed.installationId !== expected.device.installationId ||
      parsed.ciphersuite !== expected.device.mlsCredentialKey.ciphersuite ||
      parsed.credentialFingerprint !==
        expected.device.mlsCredentialKey.credentialFingerprint ||
      parsed.keyPackageRef !== keyPackage.keyPackageRef ||
      parsed.keyPackageSha256 !== keyPackage.sha256 ||
      parsed.keyPackageExpiresAt !== keyPackage.expiresAt ||
      instantMilliseconds(parsed.verifiedAt) > instantMilliseconds(expected.now) ||
      instantMilliseconds(parsed.verifiedAt) >=
        instantMilliseconds(keyPackage.expiresAt) ||
      instantMilliseconds(expected.now) >= instantMilliseconds(keyPackage.expiresAt)
    ) {
      throw invalid("MLS KeyPackage evidence does not match the enrolled package.");
    }
    return parsed;
  }
  if (status === "invalid") {
    const record = expectExactRecord(
      value,
      ["status", "installationId", "reasonCode"],
      "invalid MLS KeyPackage evidence",
    );
    if (!isMlsKeyPackageInvalidReason(record.reasonCode)) {
      throw invalid("MLS KeyPackage invalidity reason is unsupported.");
    }
    return {
      status,
      installationId: parseInstallationId(record.installationId),
      reasonCode: record.reasonCode,
    };
  }
  if (status === "unavailable") {
    const record = expectExactRecord(
      value,
      ["status", "installationId", "reasonCode"],
      "unavailable MLS KeyPackage evidence",
    );
    if (
      record.reasonCode !== "not-configured" &&
      record.reasonCode !== "mls-parser-unavailable"
    ) {
      throw invalid("MLS KeyPackage unavailability reason is unsupported.");
    }
    return {
      status,
      installationId:
        record.installationId === null
          ? null
          : parseInstallationId(record.installationId),
      reasonCode: record.reasonCode,
    };
  }
  throw invalid("MLS KeyPackage verification status is unsupported.");
}

export function parseClaimEnrollmentChallengePairResult(
  value: unknown,
  expected: {
    walletChallengeId: WalletChallengeId;
    possessionChallengeId: PossessionChallengeId;
    enrollmentId: EnrollmentId;
    accountId: AccountId;
    deviceCredentialId: DeviceCredentialId;
    account: EthereumAddress;
    chainId: JuiceboxV6ChainId;
    origin: HttpsOrigin;
    audience: HttpsOrigin;
    clientId: AuthorityId;
    purpose: "device-enrollment";
    scope: WalletChallengeScope;
    walletProtocolProfile:
      | "siwe-erc4361-v1"
      | "eip712-device-enrollment-v1";
    device: DeviceKeyBinding;
    walletPayloadDigest: Hash32;
    issuedAt: CanonicalInstant;
    notBefore: CanonicalInstant;
    expiresAt: CanonicalInstant;
    claimId: AuthorityId;
    now: CanonicalInstant;
  },
): ClaimEnrollmentChallengePairResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("Enrollment challenge pair result must be an object.");
  }
  const status = (value as Record<string, unknown>).status;
  if (status === "claimed") {
    const record = expectExactRecord(
      value,
      [
        "status",
        "claimId",
        "walletChallenge",
        "possessionChallenge",
        "claimedAt",
        "bothClaimsTerminalEvenIfVerificationFails",
      ],
      "claimed enrollment challenge pair",
    );
    if (record.bothClaimsTerminalEvenIfVerificationFails !== true) {
      throw invalid("Enrollment challenge pair claim must be terminal.");
    }
    const claimId = parseAuthorityId(record.claimId, "enrollment claimId");
    const walletChallenge = parseWalletChallenge(record.walletChallenge);
    const possessionChallenge = parseDevicePossessionChallenge(
      record.possessionChallenge,
    );
    const walletBinding = walletChallengeEnrollmentBinding(walletChallenge);
    const claimedAt = parseCanonicalInstant(record.claimedAt, "claimedAt");
    const claimedAtMs = instantMilliseconds(claimedAt);
    const nowMs = instantMilliseconds(expected.now);
    const walletNotBeforeMs = instantMilliseconds(walletBinding.notBefore);
    const possessionNotBeforeMs = instantMilliseconds(
      possessionChallenge.notBefore,
    );
    const walletExpiresMs = instantMilliseconds(walletBinding.expiresAt);
    const possessionExpiresMs = instantMilliseconds(
      possessionChallenge.expiresAt,
    );
    if (
      claimId !== expected.claimId ||
      walletBinding.challengeId !== expected.walletChallengeId ||
      walletBinding.possessionChallengeId !== expected.possessionChallengeId ||
      walletBinding.enrollmentId !== expected.enrollmentId ||
      walletBinding.accountId !== expected.accountId ||
      walletBinding.deviceCredentialId !== expected.deviceCredentialId ||
      walletBinding.account !== expected.account ||
      walletBinding.chainId !== expected.chainId ||
      walletBinding.origin !== expected.origin ||
      walletBinding.audience !== expected.audience ||
      walletBinding.clientId !== expected.clientId ||
      walletBinding.purpose !== expected.purpose ||
      sha256AuthorityDigest(walletBinding.scope) !==
        sha256AuthorityDigest(expected.scope) ||
      walletBinding.protocolProfile !== expected.walletProtocolProfile ||
      !deviceBindingsEqual(walletBinding.device, expected.device) ||
      walletBinding.walletPayloadDigest !== expected.walletPayloadDigest ||
      walletBinding.issuedAt !== expected.issuedAt ||
      walletBinding.notBefore !== expected.notBefore ||
      walletBinding.expiresAt !== expected.expiresAt ||
      possessionChallenge.challengeId !== expected.possessionChallengeId ||
      possessionChallenge.enrollmentId !== expected.enrollmentId ||
      possessionChallenge.accountId !== expected.accountId ||
      possessionChallenge.deviceCredentialId !== expected.deviceCredentialId ||
      possessionChallenge.account !== expected.account ||
      possessionChallenge.chainId !== expected.chainId ||
      possessionChallenge.origin !== expected.origin ||
      possessionChallenge.audience !== expected.audience ||
      possessionChallenge.clientId !== expected.clientId ||
      possessionChallenge.purpose !== expected.purpose ||
      sha256AuthorityDigest(possessionChallenge.scope) !==
        sha256AuthorityDigest(expected.scope) ||
      possessionChallenge.walletProtocolProfile !==
        expected.walletProtocolProfile ||
      !deviceBindingsEqual(possessionChallenge.device, expected.device) ||
      !possessionChallengeMatchesWallet(possessionChallenge, walletBinding) ||
      claimedAtMs < instantMilliseconds(walletBinding.issuedAt) ||
      claimedAtMs < instantMilliseconds(possessionChallenge.issuedAt) ||
      claimedAtMs < walletNotBeforeMs ||
      claimedAtMs < possessionNotBeforeMs ||
      claimedAtMs >= walletExpiresMs ||
      claimedAtMs >= possessionExpiresMs ||
      claimedAtMs > nowMs ||
      nowMs < walletNotBeforeMs ||
      nowMs < possessionNotBeforeMs ||
      nowMs >= walletExpiresMs ||
      nowMs >= possessionExpiresMs
    ) {
      throw invalid("Claimed enrollment challenge pair does not match its atomic claim.");
    }
    return {
      status,
      claimId,
      walletChallenge,
      possessionChallenge,
      claimedAt,
      bothClaimsTerminalEvenIfVerificationFails: true,
    };
  }
  if (status === "not-found" || status === "already-claimed-or-consumed") {
    expectExactRecord(value, ["status"], "enrollment challenge pair result");
    return { status };
  }
  if (status === "unavailable") {
    const record = expectExactRecord(
      value,
      ["status", "reasonCode"],
      "unavailable enrollment challenge pair",
    );
    if (
      record.reasonCode !== "not-configured" &&
      record.reasonCode !== "dependency-unavailable" &&
      record.reasonCode !== "timeout" &&
      record.reasonCode !== "malformed-dependency-response"
    ) {
      throw invalid("Enrollment challenge pair unavailability reason is unsupported.");
    }
    return { status, reasonCode: record.reasonCode };
  }
  throw invalid("Enrollment challenge pair result status is unsupported.");
}

export function parseDeviceEnrollmentRequest(
  value: unknown,
  expected: {
    challenge: WalletChallenge;
    possessionChallenge: DevicePossessionChallenge;
  },
): DeviceEnrollmentRequest {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "enrollmentId",
      "accountId",
      "deviceCredentialId",
      "account",
      "chainId",
      "walletChallengeId",
      "possessionChallengeId",
      "device",
      "possessionProof",
      "requestedAt",
      "displayLabel",
    ],
    "device enrollment request",
  );
  if (record.kind !== "device-enrollment-request.v1") {
    throw invalid("Device enrollment request kind is unsupported.");
  }
  const enrollmentId = parseEnrollmentId(record.enrollmentId);
  const accountId = parseAccountId(record.accountId);
  const deviceCredentialId = parseDeviceCredentialId(
    record.deviceCredentialId,
    "deviceCredentialId",
  );
  const account = parseEthereumAddress(record.account, "enrollment account");
  const chainId = parseJuiceboxV6ChainId(record.chainId);
  const walletChallengeId = parseWalletChallengeId(
    record.walletChallengeId,
    "walletChallengeId",
  );
  const possessionChallengeId = parsePossessionChallengeId(
    record.possessionChallengeId,
    "possessionChallengeId",
  );
  const device = parseDeviceKeyBinding(record.device);
  const challengeBinding = walletChallengeEnrollmentBinding(expected.challenge);
  if (
    challengeBinding.challengeId !== walletChallengeId ||
    challengeBinding.possessionChallengeId !== possessionChallengeId ||
    challengeBinding.enrollmentId !== enrollmentId ||
    challengeBinding.accountId !== accountId ||
    challengeBinding.deviceCredentialId !== deviceCredentialId ||
    challengeBinding.account !== account ||
    challengeBinding.chainId !== chainId ||
    !deviceBindingsEqual(challengeBinding.device, device)
  ) {
    throw invalid("Device enrollment does not match its server-issued wallet challenge.");
  }
  const possessionProof = parsePossessionProof(record.possessionProof);
  if (
    !possessionChallengeMatchesWallet(
      expected.possessionChallenge,
      challengeBinding,
    ) ||
    expected.possessionChallenge.challengeId !== possessionChallengeId ||
    possessionProof.enrollmentId !== enrollmentId ||
    possessionProof.possessionChallengeId !== possessionChallengeId ||
    possessionProof.installationId !== device.installationId ||
    possessionProof.challengeDigest !== expected.possessionChallenge.challengeDigest
  ) {
    throw invalid("Device possession proof does not match the enrollment challenge.");
  }
  return {
    kind: "device-enrollment-request.v1",
    enrollmentId,
    accountId,
    deviceCredentialId,
    account,
    chainId,
    walletChallengeId,
    possessionChallengeId,
    device,
    possessionProof,
    requestedAt: parseCanonicalInstant(record.requestedAt, "requestedAt"),
    displayLabel: parseDisplayLabel(record.displayLabel),
  };
}

export function parseDevicePossessionChallenge(
  value: unknown,
): DevicePossessionChallenge {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "challengeId",
      "nonce",
      "walletChallengeId",
      "walletPayloadDigest",
      "enrollmentId",
      "accountId",
      "deviceCredentialId",
      "account",
      "chainId",
      "origin",
      "audience",
      "clientId",
      "scope",
      "scopeDigest",
      "purpose",
      "walletProtocolProfile",
      "device",
      "challengeDigest",
      "issuedAt",
      "notBefore",
      "expiresAt",
    ],
    "device possession challenge",
  );
  if (record.kind !== "device-possession-challenge.v1") {
    throw invalid("Device possession challenge kind is unsupported.");
  }
  const issuedAt = parseCanonicalInstant(record.issuedAt, "issuedAt");
  const notBefore = parseCanonicalInstant(record.notBefore, "notBefore");
  const expiresAt = parseCanonicalInstant(record.expiresAt, "expiresAt");
  if (
    instantMilliseconds(notBefore) < instantMilliseconds(issuedAt) ||
    instantMilliseconds(expiresAt) <= instantMilliseconds(notBefore) ||
    instantMilliseconds(expiresAt) - instantMilliseconds(issuedAt) >
      MAX_POSSESSION_CHALLENGE_LIFETIME_MS
  ) {
    throw invalid("Device possession challenge lifetime is invalid or too long.");
  }
  const scope = parseWalletChallengeScope(record.scope, "device-enrollment");
  const parsedWithoutDigest = {
    kind: "device-possession-challenge.v1",
    challengeId: parsePossessionChallengeId(
      record.challengeId,
      "device challengeId",
    ),
    nonce: parseBase64Url(record.nonce, "possession challenge nonce", {
      minLength: 22,
      maxLength: 64,
    }),
    walletChallengeId: parseWalletChallengeId(
      record.walletChallengeId,
      "walletChallengeId",
    ),
    walletPayloadDigest: parseHash32(
      record.walletPayloadDigest,
      "wallet payload digest",
    ),
    enrollmentId: parseEnrollmentId(record.enrollmentId),
    accountId: parseAccountId(record.accountId),
    deviceCredentialId: parseDeviceCredentialId(
      record.deviceCredentialId,
      "deviceCredentialId",
    ),
    account: parseEthereumAddress(record.account, "possession account"),
    chainId: parseJuiceboxV6ChainId(record.chainId),
    origin: parseHttpsOrigin(record.origin, "possession origin"),
    audience: parseHttpsOrigin(record.audience, "possession audience"),
    clientId: parseAuthorityId(record.clientId, "possession clientId"),
    scope,
    scopeDigest: parseHash32(record.scopeDigest, "possession scope digest"),
    purpose: expectDeviceEnrollment(record.purpose),
    walletProtocolProfile: parseWalletProtocolProfile(
      record.walletProtocolProfile,
    ),
    device: parseDeviceKeyBinding(record.device),
    issuedAt,
    notBefore,
    expiresAt,
  } as const;
  if (parsedWithoutDigest.scopeDigest !== sha256AuthorityDigest(scope)) {
    throw invalid("Possession challenge scope digest is not canonical.");
  }
  const challengeDigest = parseHash32(
    record.challengeDigest,
    "possession challenge digest",
  );
  if (
    challengeDigest !==
    computeDevicePossessionChallengeDigest(parsedWithoutDigest)
  ) {
    throw invalid("Device possession challenge digest is not canonical.");
  }
  return { ...parsedWithoutDigest, challengeDigest };
}

export function parseDeviceCredential(
  value: unknown,
  expected: {
    enrollmentId: EnrollmentId;
    accountId: AccountId;
    deviceCredentialId: DeviceCredentialId;
    account: EthereumAddress;
    chainId: JuiceboxV6ChainId;
    device: DeviceKeyBinding;
    walletVerificationEvidenceDigest: Hash32;
    possessionEvidenceDigest: Hash32;
    signerKeyId: AuthorityId;
    now: CanonicalInstant;
    signatureVerification: unknown;
  },
): DeviceCredential {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "credentialId",
      "enrollmentId",
      "accountId",
      "account",
      "chainId",
      "device",
      "walletVerificationEvidenceDigest",
      "possessionEvidenceDigest",
      "issuedAt",
      "expiresAt",
      "revocationVersion",
      "roleBinding",
      "credentialSignerKeyId",
      "credentialPayloadDigest",
      "credentialSignature",
      "signatureVerificationEvidenceId",
      "signatureVerificationEvidenceDigest",
    ],
    "device credential",
  );
  if (record.kind !== "device-credential.v1" || record.roleBinding !== null) {
    throw invalid("Device credential cannot contain an application role.");
  }
  const issuedAt = parseCanonicalInstant(record.issuedAt, "issuedAt");
  const expiresAt = parseCanonicalInstant(record.expiresAt, "expiresAt");
  const lifetime = instantMilliseconds(expiresAt) - instantMilliseconds(issuedAt);
  if (lifetime <= 0 || lifetime > MAX_DEVICE_CREDENTIAL_LIFETIME_MS) {
    throw invalid("Device credential lifetime is invalid or too long.");
  }
  const credentialSignerKeyId = parseAuthorityId(
    record.credentialSignerKeyId,
    "device credential signer key ID",
  );
  if (credentialSignerKeyId !== expected.signerKeyId) {
    throw invalid("Device credential was signed by an untrusted key.");
  }
  if (
    instantMilliseconds(expected.now) < instantMilliseconds(issuedAt) ||
    instantMilliseconds(expected.now) >= instantMilliseconds(expiresAt)
  ) {
    throw invalid("Device credential is not currently active.");
  }
  const parsedWithoutCommitment = {
    kind: "device-credential.v1",
    credentialId: parseDeviceCredentialId(record.credentialId, "credentialId"),
    enrollmentId: parseEnrollmentId(record.enrollmentId),
    accountId: parseAccountId(record.accountId),
    account: parseEthereumAddress(record.account, "credential account"),
    chainId: parseJuiceboxV6ChainId(record.chainId),
    device: parseDeviceKeyBinding(record.device),
    walletVerificationEvidenceDigest: parseHash32(
      record.walletVerificationEvidenceDigest,
      "wallet verification evidence digest",
    ),
    possessionEvidenceDigest: parseHash32(
      record.possessionEvidenceDigest,
      "possession evidence digest",
    ),
    issuedAt,
    expiresAt,
    revocationVersion: parseUint256Decimal(
      record.revocationVersion,
      "revocationVersion",
    ),
    roleBinding: null,
    credentialSignerKeyId,
  } as const;
  if (
    parsedWithoutCommitment.credentialId !== expected.deviceCredentialId ||
    parsedWithoutCommitment.enrollmentId !== expected.enrollmentId ||
    parsedWithoutCommitment.accountId !== expected.accountId ||
    parsedWithoutCommitment.account !== expected.account ||
    parsedWithoutCommitment.chainId !== expected.chainId ||
    !deviceBindingsEqual(parsedWithoutCommitment.device, expected.device) ||
    parsedWithoutCommitment.walletVerificationEvidenceDigest !==
      expected.walletVerificationEvidenceDigest ||
    parsedWithoutCommitment.possessionEvidenceDigest !==
      expected.possessionEvidenceDigest
  ) {
    throw invalid("Device credential belongs to another enrollment attempt.");
  }
  const credentialPayloadDigest = parseHash32(
    record.credentialPayloadDigest,
    "device credential payload digest",
  );
  if (
    credentialPayloadDigest !==
    sha256AuthorityDigest({
      kind: "device-credential-payload.v1",
      credential: parsedWithoutCommitment,
    })
  ) {
    throw invalid("Device credential payload digest is not canonical.");
  }
  const credentialSignature = parseBase64Url(
    record.credentialSignature,
    "device credential signature",
    { minLength: 86, maxLength: 86 },
  );
  const signatureVerification = parseDeviceCredentialSignatureVerificationResult(
    expected.signatureVerification,
  );
  if (
    signatureVerification.status !== "verified" ||
    signatureVerification.credentialId !== parsedWithoutCommitment.credentialId ||
    signatureVerification.signerKeyId !== credentialSignerKeyId ||
    signatureVerification.payloadDigest !== credentialPayloadDigest ||
    signatureVerification.signatureDigest !==
      sha256AuthorityDigest({
        kind: "device-credential-signature.v1",
        signature: credentialSignature,
      }) ||
    instantMilliseconds(signatureVerification.verifiedAt) >
      instantMilliseconds(expected.now)
  ) {
    throw invalid("Device credential signature was not verified for this payload.");
  }
  const signatureVerificationEvidenceId = parseAuthorityId(
    record.signatureVerificationEvidenceId,
    "credential signature verification evidence ID",
  );
  const signatureVerificationEvidenceDigest = parseHash32(
    record.signatureVerificationEvidenceDigest,
    "credential signature verification evidence digest",
  );
  if (
    signatureVerificationEvidenceId !== signatureVerification.evidenceId ||
    signatureVerificationEvidenceDigest !== signatureVerification.evidenceDigest
  ) {
    throw invalid("Device credential does not bind its trusted signature evidence.");
  }
  return {
    ...parsedWithoutCommitment,
    credentialPayloadDigest,
    credentialSignature,
    signatureVerificationEvidenceId,
    signatureVerificationEvidenceDigest,
  };
}

export function parseDeviceCredentialSignatureVerificationResult(
  value: unknown,
): DeviceCredentialSignatureVerificationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("Device credential signature result must be an object.");
  }
  const status = (value as Record<string, unknown>).status;
  if (status === "verified") {
    const record = expectExactRecord(
      value,
      [
        "status",
        "credentialId",
        "signerKeyId",
        "payloadDigest",
        "signatureDigest",
        "evidenceId",
        "evidenceDigest",
        "verifiedAt",
      ],
      "verified device credential signature",
    );
    return {
      status,
      credentialId: parseDeviceCredentialId(record.credentialId, "credentialId"),
      signerKeyId: parseAuthorityId(record.signerKeyId, "credential signer key ID"),
      payloadDigest: parseHash32(record.payloadDigest, "credential payload digest"),
      signatureDigest: parseHash32(record.signatureDigest, "credential signature digest"),
      evidenceId: parseAuthorityId(record.evidenceId, "signature evidence ID"),
      evidenceDigest: parseHash32(record.evidenceDigest, "signature evidence digest"),
      verifiedAt: parseCanonicalInstant(record.verifiedAt, "signature verifiedAt"),
    };
  }
  if (status === "invalid") {
    const record = expectExactRecord(
      value,
      ["status", "credentialId", "reasonCode"],
      "invalid device credential signature",
    );
    if (
      record.reasonCode !== "signature-invalid" &&
      record.reasonCode !== "signer-key-mismatch"
    ) {
      throw invalid("Device credential signature invalidity reason is unsupported.");
    }
    return {
      status,
      credentialId: parseDeviceCredentialId(record.credentialId, "credentialId"),
      reasonCode: record.reasonCode,
    };
  }
  if (status === "unavailable") {
    const record = expectExactRecord(
      value,
      ["status", "credentialId", "reasonCode"],
      "unavailable device credential signature",
    );
    if (
      record.reasonCode !== "credential-signature-verifier-not-configured" &&
      record.reasonCode !== "key-unavailable"
    ) {
      throw invalid("Device credential signature unavailability reason is unsupported.");
    }
    return {
      status,
      credentialId:
        record.credentialId === null
          ? null
          : parseDeviceCredentialId(record.credentialId, "credentialId"),
      reasonCode: record.reasonCode,
    };
  }
  throw invalid("Device credential signature result status is unsupported.");
}

export function parseDeviceDirectoryProofBundle(
  value: unknown,
  expected: {
    credentialId: DeviceCredentialId;
    credentialPayloadDigest: Hash32;
  },
): DeviceDirectoryProofBundle {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "entryId",
      "credentialId",
      "credentialPayloadDigest",
      "checkpointId",
      "inclusionProof",
      "consistencyProof",
      "witnessReceipt",
    ],
    "device directory proof bundle",
  );
  if (record.kind !== "device-directory-proof-bundle.v1") {
    throw invalid("Device directory proof bundle kind is unsupported.");
  }
  const parsed = {
    kind: "device-directory-proof-bundle.v1",
    entryId: parseAuthorityId(record.entryId, "directory entry ID"),
    credentialId: parseDeviceCredentialId(record.credentialId, "credentialId"),
    credentialPayloadDigest: parseHash32(
      record.credentialPayloadDigest,
      "credential payload digest",
    ),
    checkpointId: parseAuthorityId(record.checkpointId, "directory checkpoint ID"),
    inclusionProof: parseBase64Url(record.inclusionProof, "directory inclusion proof", {
      minLength: 2,
      maxLength: 64 * 1024,
    }),
    consistencyProof: parseBase64Url(
      record.consistencyProof,
      "directory consistency proof",
      { minLength: 2, maxLength: 64 * 1024 },
    ),
    witnessReceipt: parseBase64Url(record.witnessReceipt, "directory witness receipt", {
      minLength: 2,
      maxLength: 64 * 1024,
    }),
  } as const;
  if (
    parsed.credentialId !== expected.credentialId ||
    parsed.credentialPayloadDigest !== expected.credentialPayloadDigest
  ) {
    throw invalid("Device directory proof bundle belongs to another credential.");
  }
  return parsed;
}

export function parseDeviceKeyTransparencyVerificationResult(
  value: unknown,
  expected: {
    directoryEntry: DeviceDirectoryProofBundle;
    now: CanonicalInstant;
  },
): DeviceKeyTransparencyVerificationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("Device key-transparency verification result must be an object.");
  }
  const status = (value as Record<string, unknown>).status;
  if (status === "verified") {
    const record = expectExactRecord(
      value,
      [
        "status",
        "entryId",
        "credentialId",
        "checkpointId",
        "inclusionProofDigest",
        "consistencyProofDigest",
        "witnessReceiptDigest",
        "evidenceId",
        "evidenceDigest",
        "verifiedAt",
      ],
      "verified device key-transparency evidence",
    );
    const parsed = {
      status,
      entryId: parseAuthorityId(record.entryId, "directory entry ID"),
      credentialId: parseDeviceCredentialId(record.credentialId, "credentialId"),
      checkpointId: parseAuthorityId(record.checkpointId, "directory checkpoint ID"),
      inclusionProofDigest: parseHash32(
        record.inclusionProofDigest,
        "inclusion proof digest",
      ),
      consistencyProofDigest: parseHash32(
        record.consistencyProofDigest,
        "consistency proof digest",
      ),
      witnessReceiptDigest: parseHash32(
        record.witnessReceiptDigest,
        "witness receipt digest",
      ),
      evidenceId: parseAuthorityId(record.evidenceId, "transparency evidence ID"),
      evidenceDigest: parseHash32(
        record.evidenceDigest,
        "transparency evidence digest",
      ),
      verifiedAt: parseCanonicalInstant(record.verifiedAt, "transparency verifiedAt"),
    } as const;
    if (
      parsed.entryId !== expected.directoryEntry.entryId ||
      parsed.credentialId !== expected.directoryEntry.credentialId ||
      parsed.checkpointId !== expected.directoryEntry.checkpointId ||
      parsed.inclusionProofDigest !==
        proofDigest("device-directory-inclusion-proof.v1", expected.directoryEntry.inclusionProof) ||
      parsed.consistencyProofDigest !==
        proofDigest(
          "device-directory-consistency-proof.v1",
          expected.directoryEntry.consistencyProof,
        ) ||
      parsed.witnessReceiptDigest !==
        proofDigest("device-directory-witness-receipt.v1", expected.directoryEntry.witnessReceipt) ||
      instantMilliseconds(parsed.verifiedAt) > instantMilliseconds(expected.now)
    ) {
      throw invalid("Key-transparency evidence does not verify this directory bundle.");
    }
    return parsed;
  }
  if (status === "invalid") {
    const record = expectExactRecord(
      value,
      ["status", "credentialId", "reasonCode"],
      "invalid device key-transparency evidence",
    );
    if (
      record.reasonCode !== "inclusion-proof-invalid" &&
      record.reasonCode !== "consistency-proof-invalid" &&
      record.reasonCode !== "witness-receipt-invalid" &&
      record.reasonCode !== "split-view"
    ) {
      throw invalid("Key-transparency invalidity reason is unsupported.");
    }
    return {
      status,
      credentialId: parseDeviceCredentialId(record.credentialId, "credentialId"),
      reasonCode: record.reasonCode,
    };
  }
  if (status === "unavailable") {
    const record = expectExactRecord(
      value,
      ["status", "credentialId", "reasonCode"],
      "unavailable device key-transparency evidence",
    );
    if (
      record.reasonCode !== "not-configured" &&
      record.reasonCode !== "directory-unavailable" &&
      record.reasonCode !== "witness-unavailable"
    ) {
      throw invalid("Key-transparency unavailability reason is unsupported.");
    }
    return {
      status,
      credentialId:
        record.credentialId === null
          ? null
          : parseDeviceCredentialId(record.credentialId, "credentialId"),
      reasonCode: record.reasonCode,
    };
  }
  throw invalid("Device key-transparency verification status is unsupported.");
}

export function parseDeviceEnrollmentResult(
  value: unknown,
  expected: {
    request: DeviceEnrollmentRequest;
    possessionChallenge: DevicePossessionChallenge;
    walletVerificationEvidenceDigest: Hash32;
    possessionVerification: unknown;
    mlsKeyPackageVerification: unknown;
    keyTransparencyVerification: unknown;
    credentialSignerKeyId: AuthorityId;
    now: CanonicalInstant;
    credentialSignatureVerification: unknown;
  },
): DeviceEnrollmentResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("Device enrollment result must be an object.");
  }
  const status = (value as Record<string, unknown>).status;
  if (status === "enrolled") {
    const record = expectExactRecord(
      value,
      ["status", "enrollmentId", "credential", "directoryEntry"],
      "enrolled device result",
    );
    const enrollmentId = parseEnrollmentId(record.enrollmentId);
    if (enrollmentId !== expected.request.enrollmentId) {
      throw invalid("Device enrollment result belongs to another attempt.");
    }
    const possessionVerification = parseDevicePossessionVerificationResult(
      expected.possessionVerification,
      {
        request: expected.request,
        challenge: expected.possessionChallenge,
        now: expected.now,
      },
    );
    const mlsKeyPackageVerification =
      parseMlsKeyPackageSemanticVerificationResult(
        expected.mlsKeyPackageVerification,
        { device: expected.request.device, now: expected.now },
      );
    if (
      possessionVerification.status !== "verified" ||
      mlsKeyPackageVerification.status !== "verified"
    ) {
      throw invalid("Enrollment success requires verified possession and MLS evidence.");
    }
    const credential = parseDeviceCredential(record.credential, {
        enrollmentId,
        accountId: expected.request.accountId,
        deviceCredentialId: expected.request.deviceCredentialId,
        account: expected.request.account,
        chainId: expected.request.chainId,
        device: expected.request.device,
        walletVerificationEvidenceDigest:
          expected.walletVerificationEvidenceDigest,
        possessionEvidenceDigest: possessionVerification.evidenceDigest,
        signerKeyId: expected.credentialSignerKeyId,
        now: expected.now,
        signatureVerification: expected.credentialSignatureVerification,
      });
    const directoryEntry = parseDeviceDirectoryProofBundle(record.directoryEntry, {
      credentialId: credential.credentialId,
      credentialPayloadDigest: credential.credentialPayloadDigest,
    });
    const keyTransparencyVerification =
      parseDeviceKeyTransparencyVerificationResult(
        expected.keyTransparencyVerification,
        { directoryEntry, now: expected.now },
      );
    if (keyTransparencyVerification.status !== "verified") {
      throw invalid("Enrollment success requires verified key-transparency evidence.");
    }
    return {
      status,
      enrollmentId,
      credential,
      directoryEntry,
    };
  }
  if (status === "invalid" || status === "unavailable") {
    const record = expectExactRecord(
      value,
      ["status", "enrollmentId", "reasonCode"],
      "non-enrolled device result",
    );
    const enrollmentId = parseEnrollmentId(record.enrollmentId);
    if (enrollmentId !== expected.request.enrollmentId) {
      throw invalid("Device enrollment result belongs to another attempt.");
    }
    if (status === "invalid") {
      if (
        record.reasonCode !== "wallet-proof-invalid" &&
        record.reasonCode !== "device-possession-invalid" &&
        record.reasonCode !== "challenge-binding-mismatch" &&
        record.reasonCode !== "device-revoked" &&
        record.reasonCode !== "device-limit-reached"
      ) {
        throw invalid("Device enrollment invalidity reason is unsupported.");
      }
      return { status, enrollmentId, reasonCode: record.reasonCode };
    }
    if (
      record.reasonCode !== "device-enrollment-verifier-not-configured" &&
      record.reasonCode !== "wallet-verifier-unavailable" &&
      record.reasonCode !== "device-possession-verifier-unavailable" &&
      record.reasonCode !== "mls-key-package-verifier-unavailable" &&
      record.reasonCode !== "key-transparency-unavailable" &&
      record.reasonCode !== "device-registry-unavailable" &&
      record.reasonCode !== "audit-store-unavailable"
    ) {
      throw invalid("Device enrollment unavailability reason is unsupported.");
    }
    return { status, enrollmentId, reasonCode: record.reasonCode };
  }
  throw invalid("Device enrollment result status is unsupported.");
}

function parsePossessionProof(value: unknown): DevicePossessionProof {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "enrollmentId",
      "possessionChallengeId",
      "installationId",
      "challengeDigest",
      "signature",
    ],
    "device possession proof",
  );
  if (record.kind !== "p256-es256-installation-possession.v1") {
    throw invalid("Installation possession proof kind is unsupported.");
  }
  return {
    kind: "p256-es256-installation-possession.v1",
    enrollmentId: parseEnrollmentId(record.enrollmentId),
    possessionChallengeId: parsePossessionChallengeId(
      record.possessionChallengeId,
      "possessionChallengeId",
    ),
    installationId: parseInstallationId(record.installationId),
    challengeDigest: parseHash32(record.challengeDigest, "possession challenge digest"),
    signature: parseBase64Url(record.signature, "device possession signature", {
      minLength: 86,
      maxLength: 86,
    }),
  };
}

function possessionChallengeMatchesWallet(
  possession: DevicePossessionChallenge,
  wallet: WalletChallengeEnrollmentBinding,
): boolean {
  return (
    possession.challengeId === wallet.possessionChallengeId &&
    possession.walletChallengeId === wallet.challengeId &&
    possession.walletPayloadDigest === wallet.walletPayloadDigest &&
    possession.enrollmentId === wallet.enrollmentId &&
    possession.accountId === wallet.accountId &&
    possession.deviceCredentialId === wallet.deviceCredentialId &&
    possession.account === wallet.account &&
    possession.chainId === wallet.chainId &&
    possession.origin === wallet.origin &&
    possession.audience === wallet.audience &&
    possession.clientId === wallet.clientId &&
    possession.scopeDigest === wallet.scopeDigest &&
    sha256AuthorityDigest(possession.scope) ===
      sha256AuthorityDigest(wallet.scope) &&
    possession.purpose === wallet.purpose &&
    possession.walletProtocolProfile === wallet.protocolProfile &&
    deviceBindingsEqual(possession.device, wallet.device) &&
    possession.issuedAt === wallet.issuedAt &&
    possession.notBefore === wallet.notBefore &&
    possession.expiresAt === wallet.expiresAt
  );
}

function expectDeviceEnrollment(value: unknown): "device-enrollment" {
  if (value !== "device-enrollment") {
    throw invalid("Device possession purpose must be device enrollment.");
  }
  return "device-enrollment";
}

function parseWalletProtocolProfile(
  value: unknown,
): "siwe-erc4361-v1" | "eip712-device-enrollment-v1" {
  if (
    value !== "siwe-erc4361-v1" &&
    value !== "eip712-device-enrollment-v1"
  ) {
    throw invalid("Wallet enrollment profile is unsupported.");
  }
  return value;
}

function deviceBindingsEqual(left: DeviceKeyBinding, right: DeviceKeyBinding): boolean {
  return (
    sha256AuthorityDigest(left) === sha256AuthorityDigest(right)
  );
}

function parseDisplayLabel(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 64 ||
    value !== value.trim() ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    throw invalid("Device display label is invalid.");
  }
  return value;
}

function expectMlsCiphersuite(
  value: unknown,
): DeviceKeyBinding["mlsCredentialKey"]["ciphersuite"] {
  if (value !== "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519") {
    throw invalid("MLS KeyPackage ciphersuite is unsupported.");
  }
  return value;
}

function expectOrdinaryKeyPackage(
  value: unknown,
): "ordinary-mls-key-package.v1" {
  if (value !== "ordinary-mls-key-package.v1") {
    throw invalid("MLS KeyPackage is not an ordinary package.");
  }
  return value;
}

function expectTrue(value: unknown, label: string): true {
  if (value !== true) throw invalid(`${label} was not verified.`);
  return true;
}

function expectFalse(value: unknown, label: string): false {
  if (value !== false) throw invalid(`${label} is forbidden.`);
  return false;
}

function isMlsKeyPackageInvalidReason(
  value: unknown,
): value is Extract<
  MlsKeyPackageSemanticVerificationResult,
  { status: "invalid" }
>["reasonCode"] {
  return (
    value === "malformed-key-package" ||
    value === "suite-mismatch" ||
    value === "credential-mismatch" ||
    value === "init-key-invalid" ||
    value === "signature-invalid" ||
    value === "reference-mismatch" ||
    value === "hash-mismatch" ||
    value === "expired" ||
    value === "last-resort" ||
    value === "already-used"
  );
}

function proofDigest(kind: string, proof: Base64Url): Hash32 {
  return sha256AuthorityDigest({ kind, proof });
}

function invalid(message: string): AuthorityValidationError {
  return new AuthorityValidationError(message);
}
