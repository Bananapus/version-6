import { describe, expect, it } from "vitest";
import {
  parseAccountId,
  parseDeviceCredentialId,
  parseDeviceKeyBinding,
  parseEnrollmentId,
  parseWalletChallenge,
  walletChallengeEnrollmentBinding,
} from "./challenges";
import {
  assertSuccessorAuthorityGeneration,
  assertAuthorityGenerationTransitionEvidence,
  computeAuthorityTransitionSourceSetDigest,
  parseAuthorityGeneration,
  parseAuthorityTransitionSourceSet,
  parseFinalizedAuthorityTransitionScan,
  parseFinalizedAuthorityLossEvidence,
  parseProjectStaffDelegation,
  parseRootAuthorityVerificationResult,
} from "./delegations";
import {
  computeDevicePossessionChallengeDigest,
  parseDeviceCredential,
  parseClaimEnrollmentChallengePairResult,
  parseDeviceEnrollmentResult,
  parseDeviceEnrollmentRequest,
  parseDevicePossessionChallenge,
  parseDevicePossessionVerificationResult,
  parseMlsKeyPackageSemanticVerificationResult,
} from "./devices";
import { sha256AuthorityDigest } from "./digests";
import {
  ADDRESS_A,
  ADDRESS_B,
  ADDRESS_C,
  ACCOUNT_ID,
  DEVICE_CREDENTIAL_ID,
  DEVICE_CREDENTIAL_ID_2,
  ENROLLMENT_ID,
  INSTALLATION_ID,
  INSTALLATION_ID_2,
  POSSESSION_CHALLENGE_ID,
  WALLET_CHALLENGE_ID,
  authorityGeneration,
  device,
  devicePossessionChallenge,
  finalityPolicy,
  finalizedBlock,
  hash,
  project,
  siweChallenge,
} from "./fixtures.testing";
import { parseFinalityPolicy } from "./finality";
import {
  parseAuthorityId,
  parseCanonicalInstant,
  parseEthereumAddress,
  parseHash32,
  parseJuiceboxV6ProjectRef,
  parseUint256Decimal,
} from "./valueObjects";

function enrollmentRequest() {
  return {
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
    displayLabel: "Jango's phone",
  };
}

function credential(
  account = ADDRESS_A,
  installationId = INSTALLATION_ID,
  credentialId = DEVICE_CREDENTIAL_ID,
) {
  const unsigned = {
    kind: "device-credential.v1",
    credentialId,
    enrollmentId: ENROLLMENT_ID,
    accountId: ACCOUNT_ID,
    account,
    chainId: 8453,
    device: { ...device(), installationId },
    walletVerificationEvidenceDigest: hash("d"),
    possessionEvidenceDigest: hash("e"),
    issuedAt: "2026-08-14T12:01:00.000Z",
    expiresAt: "2026-09-13T12:01:00.000Z",
    revocationVersion: "0",
    roleBinding: null,
    credentialSignerKeyId: "device-credential-signer.1",
  };
  return {
    ...unsigned,
    credentialPayloadDigest: sha256AuthorityDigest({
      kind: "device-credential-payload.v1",
      credential: unsigned,
    }),
    credentialSignature: `${"S".repeat(85)}Q`,
    signatureVerificationEvidenceId: "device-credential-signature.1",
    signatureVerificationEvidenceDigest: hash("e"),
  };
}

function credentialExpectations(value = credential()) {
  return {
    enrollmentId: parseEnrollmentId(value.enrollmentId),
    accountId: parseAccountId(value.accountId),
    deviceCredentialId: parseDeviceCredentialId(value.credentialId),
    account: parseEthereumAddress(value.account),
    chainId: 8453 as const,
    device: parseDeviceKeyBinding(value.device),
    walletVerificationEvidenceDigest: parseHash32(
      value.walletVerificationEvidenceDigest,
    ),
    possessionEvidenceDigest: parseHash32(value.possessionEvidenceDigest),
    signerKeyId: parseAuthorityId("device-credential-signer.1"),
    now: parseCanonicalInstant("2026-08-14T12:02:00.000Z"),
    signatureVerification: {
      status: "verified",
      credentialId: value.credentialId,
      signerKeyId: "device-credential-signer.1",
      payloadDigest: value.credentialPayloadDigest,
      signatureDigest: sha256AuthorityDigest({
        kind: "device-credential-signature.v1",
        signature: value.credentialSignature,
      }),
      evidenceId: value.signatureVerificationEvidenceId,
      evidenceDigest: value.signatureVerificationEvidenceDigest,
      verifiedAt: "2026-08-14T12:01:30.000Z",
    },
  };
}

function delegation() {
  const binding = device();
  const unsigned = {
    kind: "project-staff-delegation.v1",
    delegationId: "delegation.1",
    project: project(),
    staffAccount: ADDRESS_B,
    installationId: INSTALLATION_ID_2,
    deviceCredentialId: DEVICE_CREDENTIAL_ID_2,
    installationAuthJkt: binding.installationAuthKey.jwkThumbprint,
    mlsCredentialFingerprint: binding.mlsCredentialKey.credentialFingerprint,
    deviceRevocationVersion: "0",
    deviceDirectoryEntryDigest: hash("a"),
    deviceTransparencyCheckpointDigest: hash("b"),
    issuerAccount: ADDRESS_A,
    authorityGenerationId: "generation.1",
    authorityGenerationSequence: "1",
    capabilities: ["fulfillment:read-address", "support:send-messages"],
    delegationAllowed: false,
    issuedAt: "2026-08-14T12:00:00.000Z",
    notBefore: "2026-08-14T12:00:00.000Z",
    expiresAt: "2026-08-21T12:00:00.000Z",
    revision: "1",
    issuerWalletVerificationEvidenceId: "wallet-proof.1",
    delegationSignatureEvidenceId: "delegation-signature.1",
    delegationSignatureEvidenceDigest: hash("d"),
    auditRecordId: "audit.delegation.1",
    revokedAt: null,
  };
  return {
    ...unsigned,
    delegationPayloadDigest: sha256AuthorityDigest({
      kind: "project-staff-delegation-payload.v1",
      delegation: unsigned,
    }),
  };
}

function parsedCredential() {
  const value = credential(ADDRESS_B, INSTALLATION_ID_2, DEVICE_CREDENTIAL_ID_2);
  return parseDeviceCredential(value, credentialExpectations(value));
}

function delegationExpectations(
  generation: ReturnType<typeof parseAuthorityGeneration>,
  now: ReturnType<typeof parseCanonicalInstant>,
) {
  return {
    generation,
    deviceCredential: parsedCredential(),
    delegationSignatureEvidenceId: parseAuthorityId("delegation-signature.1"),
    delegationSignatureEvidenceDigest: parseHash32(hash("d")),
    now,
  };
}

function transitionCursor(
  transactionIndex: number,
  logIndex: number,
  blockNumber = "123456",
  blockHash = hash("a"),
  sourceId = "authority-source.owner-transfer",
) {
  return {
    kind: "authority-transition-cursor.v1",
    deploymentManifestId: "deployments.base.v1",
    adapterRevision: "root-authority.base.v1",
    sourceId,
    blockNumber,
    blockHash,
    transactionHash: hash(String(transactionIndex)),
    transactionIndex,
    logIndex,
    emitter: ADDRESS_C,
    eventTopic0: hash("7"),
  };
}

function transitionSources() {
  return parseAuthorityTransitionSourceSet(
    [
      {
        kind: "authority-transition-source.v1",
        sourceId: "authority-source.bootstrap",
        deploymentManifestId: "deployments.base.v1",
        adapterRevision: "root-authority.base.v1",
        authorityMode: "jbprojects-owner",
        transitionCause: "bootstrap",
        emitter: ADDRESS_C,
        eventTopic0: hash("7"),
      },
      {
        kind: "authority-transition-source.v1",
        sourceId: "authority-source.owner-transfer",
        deploymentManifestId: "deployments.base.v1",
        adapterRevision: "root-authority.base.v1",
        authorityMode: "jbprojects-owner",
        transitionCause: "ordinary-owner-transfer",
        emitter: ADDRESS_C,
        eventTopic0: hash("7"),
      },
    ],
    {
      deploymentManifestId: parseAuthorityId("deployments.base.v1"),
      adapterRevision: parseAuthorityId("root-authority.base.v1"),
    },
  );
}

function finalizedBlockAt(blockNumber: string, blockHash: string) {
  return { ...finalizedBlock(), blockNumber, blockHash };
}

function transitionScanValue(input: {
  checkpointId: string;
  previousCheckpoint:
    | ReturnType<typeof parseFinalizedAuthorityTransitionScan>["checkpoint"]
    | null;
  rangeStartBlockNumber: string;
  verifiedThroughBlock: ReturnType<typeof finalizedBlock>;
  generations: readonly Record<string, unknown>[];
  previousCheckpointIdOverride?: string | null;
}) {
  const lastGeneration = input.generations[input.generations.length - 1];
  if (lastGeneration === undefined) throw new Error("test scan needs a transition");
  const previousCheckpointId =
    input.previousCheckpointIdOverride === undefined
      ? (input.previousCheckpoint?.checkpointId ?? null)
      : input.previousCheckpointIdOverride;
  const checkpointWithoutDigest = {
    kind: "authority-transition-scan-checkpoint.v1",
    checkpointId: input.checkpointId,
    project: project(),
    deploymentManifestId: "deployments.base.v1",
    adapterRevision: "root-authority.base.v1",
    sourceSetDigest: computeAuthorityTransitionSourceSetDigest(transitionSources()),
    previousCheckpointId,
    previousCheckpointDigest: input.previousCheckpoint?.checkpointDigest ?? null,
    rangeStartBlockNumber: input.rangeStartBlockNumber,
    verifiedThroughBlock: input.verifiedThroughBlock,
    rangeTransitionCount: input.generations.length,
    cumulativeTransitionCount: (
      BigInt(input.previousCheckpoint?.cumulativeTransitionCount ?? "0") +
      BigInt(input.generations.length)
    ).toString(),
    lastGenerationId: lastGeneration.generationId,
    lastGenerationSequence: lastGeneration.sequence,
    lastTransitionCursor: lastGeneration.transitionCursor,
    transitionsDigest: sha256AuthorityDigest({
      kind: "finalized-authority-transitions.v1",
      generations: input.generations,
    }),
  };
  return {
    kind: "finalized-authority-transition-scan.v1",
    checkpoint: {
      ...checkpointWithoutDigest,
      checkpointDigest: sha256AuthorityDigest({
        kind: "authority-transition-scan-checkpoint-digest.v1",
        checkpoint: checkpointWithoutDigest,
      }),
    },
    generations: input.generations,
  };
}

function ordinaryRootResult() {
  return {
    status: "verified",
    role: "project-owner",
    evidenceId: "root.1",
    evidenceDigest: hash("8"),
    project: project(),
    principal: ADDRESS_A,
    deploymentManifestId: "deployments.base.v1",
    adapterRevision: "root-authority.base.v1",
    projectsContract: ADDRESS_C,
    projectsCodeHash: hash("1"),
    block: finalizedBlock(),
    transitionCursor: {
      ...transitionCursor(
        1,
        4,
        "123456",
        hash("a"),
        "authority-source.bootstrap",
      ),
      transactionHash: hash("8"),
    },
    ownerOfResult: ADDRESS_A,
    canonicalRevnetClassification: {
      kind: "ordinary-project-classification.v1",
      result: "not-canonical-revnet",
      evidenceId: "revnet-classification.1",
      evidenceDigest: hash("2"),
    },
  };
}

function revnetRootResult() {
  return {
    status: "verified",
    role: "revnet-operator",
    evidenceId: "root.2",
    evidenceDigest: hash("9"),
    project: project(),
    principal: ADDRESS_A,
    deploymentManifestId: "deployments.base.v1",
    adapterRevision: "root-authority.base.v1",
    revDeployer: ADDRESS_B,
    revDeployerCodeHash: hash("2"),
    revOwner: ADDRESS_C,
    revOwnerCodeHash: hash("3"),
    revnetConfigurationHash: hash("4"),
    block: finalizedBlock(),
    transitionCursor: transitionCursor(1, 4),
    ownerOfResult: ADDRESS_C,
    isOperatorResult: true,
    deploymentEvidence: {
      kind: "canonical-revnet-deployment.v1",
      deployRevnetEvidenceId: "deploy-revnet.1",
      deployRevnetLogDigest: hash("5"),
      transactionHash: hash("6"),
      logIndex: 12,
      emitter: ADDRESS_B,
      configurationHash: hash("4"),
      revDeployerProjectsResult: ADDRESS_C,
      revDeployerOwnerResult: ADDRESS_C,
      revOwnerProjectsResult: ADDRESS_C,
      revOwnerDeployerResult: ADDRESS_B,
    },
  };
}

function rootExpectations(kind: "ordinary" | "revnet") {
  return {
    project: parseJuiceboxV6ProjectRef(project()),
    principal: parseEthereumAddress(ADDRESS_A),
    deploymentManifestId: parseAuthorityId("deployments.base.v1"),
    adapterRevision: parseAuthorityId("root-authority.base.v1"),
    projectsCodeHash: parseHash32(hash("1")),
    now: parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
    revnet:
      kind === "ordinary"
        ? null
        : {
            revDeployer: parseEthereumAddress(ADDRESS_B),
            revDeployerCodeHash: parseHash32(hash("2")),
            revOwner: parseEthereumAddress(ADDRESS_C),
            revOwnerCodeHash: parseHash32(hash("3")),
          },
  };
}

describe("device enrollment and project delegation", () => {
  it("requires wallet binding plus exact device proof-of-possession", () => {
    const challenge = parseWalletChallenge(siweChallenge());
    const expected = {
      challenge,
      possessionChallenge: parseDevicePossessionChallenge(
        devicePossessionChallenge(),
      ),
    };
    expect(parseDeviceEnrollmentRequest(enrollmentRequest(), expected)).toMatchObject({
      enrollmentId: ENROLLMENT_ID,
      account: ADDRESS_A,
      displayLabel: "Jango's phone",
    });
    for (const mutation of [
      { ...enrollmentRequest(), account: ADDRESS_B },
      {
        ...enrollmentRequest(),
        walletChallengeId: "0298a5d7-4c58-7e31-bbf1-0fd4c09e4acf",
      },
      {
        ...enrollmentRequest(),
        device: { ...device(), installationId: INSTALLATION_ID_2 },
      },
      {
        ...enrollmentRequest(),
        possessionProof: {
          ...enrollmentRequest().possessionProof,
          challengeDigest: hash("e"),
        },
      },
      { ...enrollmentRequest(), displayLabel: " phone " },
    ]) {
      expect(() => parseDeviceEnrollmentRequest(mutation, expected)).toThrow();
    }
  });

  it("strictly binds and terminally claims both enrollment challenges before verification", () => {
    const wallet = walletChallengeEnrollmentBinding(
      parseWalletChallenge(siweChallenge()),
    );
    const expected = {
      walletChallengeId: wallet.challengeId,
      possessionChallengeId: wallet.possessionChallengeId,
      enrollmentId: wallet.enrollmentId,
      accountId: wallet.accountId,
      deviceCredentialId: wallet.deviceCredentialId,
      account: wallet.account,
      chainId: wallet.chainId,
      origin: wallet.origin,
      audience: wallet.audience,
      clientId: wallet.clientId,
      purpose: wallet.purpose,
      scope: wallet.scope,
      walletProtocolProfile: wallet.protocolProfile,
      device: wallet.device,
      walletPayloadDigest: wallet.walletPayloadDigest,
      issuedAt: wallet.issuedAt,
      notBefore: wallet.notBefore,
      expiresAt: wallet.expiresAt,
      claimId: parseAuthorityId("enrollment-claim.1"),
      now: parseCanonicalInstant("2026-08-14T12:01:00.000Z"),
    };
    const result = {
      status: "claimed",
      claimId: "enrollment-claim.1",
      walletChallenge: siweChallenge(),
      possessionChallenge: devicePossessionChallenge(),
      claimedAt: "2026-08-14T12:00:30.000Z",
      bothClaimsTerminalEvenIfVerificationFails: true,
    };
    expect(
      parseClaimEnrollmentChallengePairResult(result, expected),
    ).toMatchObject({ status: "claimed" });
    for (const mutation of [
      { ...result, claimId: "enrollment-claim.other" },
      { ...result, claimedAt: "garbage" },
      {
        ...result,
        possessionChallenge: {
          ...devicePossessionChallenge(),
          enrollmentId: "0298a5d6-4c58-7e31-bbf1-0fd4c09e4acf",
        },
      },
      { ...result, bothClaimsTerminalEvenIfVerificationFails: false },
    ]) {
      expect(() =>
        parseClaimEnrollmentChallengePairResult(mutation, expected),
      ).toThrow();
    }
    expect(() =>
      parseClaimEnrollmentChallengePairResult(result, {
        ...expected,
        now: parseCanonicalInstant("2026-08-14T12:05:00.000Z"),
      }),
    ).toThrow();
    expect(() =>
      parseClaimEnrollmentChallengePairResult(
        {
          ...result,
          walletChallenge: {
            ...siweChallenge(),
            notBefore: "2026-08-14T12:00:45.000Z",
          },
        },
        expected,
      ),
    ).toThrow();
    for (const mutation of [
      { account: parseEthereumAddress(ADDRESS_B) },
      { chainId: 10 as const },
      { origin: "https://other.example" as typeof expected.origin },
      { audience: "https://other.example" as typeof expected.audience },
      { clientId: parseAuthorityId("client.other.v1") },
      {
        scope: {
          ...expected.scope,
          action: "other-action",
        } as never,
      },
      {
        device: {
          ...expected.device,
          mlsCredentialKey: {
            ...expected.device.mlsCredentialKey,
            initialKeyPackage: {
              ...expected.device.mlsCredentialKey.initialKeyPackage,
              keyPackageRef: "E".repeat(43),
            },
          },
        } as never,
      },
      { walletPayloadDigest: parseHash32(hash("f")) },
    ]) {
      expect(() =>
        parseClaimEnrollmentChallengePairResult(result, {
          ...expected,
          ...mutation,
        }),
      ).toThrow();
    }
  });

  it("strictly binds possession-verifier evidence to the claimed proof", () => {
    const challenge = parseDevicePossessionChallenge(devicePossessionChallenge());
    const request = parseDeviceEnrollmentRequest(enrollmentRequest(), {
      challenge: parseWalletChallenge(siweChallenge()),
      possessionChallenge: challenge,
    });
    const evidence = {
      status: "verified",
      enrollmentId: request.enrollmentId,
      walletChallengeId: request.walletChallengeId,
      possessionChallengeId: request.possessionChallengeId,
      installationId: request.device.installationId,
      deviceCredentialId: request.deviceCredentialId,
      challengeDigest: challenge.challengeDigest,
      proofDigest: sha256AuthorityDigest({
        kind: "device-possession-proof.v1",
        proof: request.possessionProof,
      }),
      evidenceId: "device-possession-evidence.1",
      evidenceDigest: hash("d"),
      verifiedAt: "2026-08-14T12:01:30.000Z",
    };
    const expected = {
      request,
      challenge,
      now: parseCanonicalInstant("2026-08-14T12:02:00.000Z"),
    };
    expect(parseDevicePossessionVerificationResult(evidence, expected)).toMatchObject({
      status: "verified",
    });
    for (const mutation of [
      { enrollmentId: "0298a5d6-4c58-7e31-bbf1-0fd4c09e4acf" },
      { walletChallengeId: "0298a5d7-4c58-7e31-bbf1-0fd4c09e4acf" },
      {
        possessionChallengeId: "0298a5d8-4c58-7e31-bbf1-0fd4c09e4acf",
      },
      { installationId: INSTALLATION_ID_2 },
      { deviceCredentialId: DEVICE_CREDENTIAL_ID_2 },
      { challengeDigest: hash("a") },
      { proofDigest: hash("b") },
    ]) {
      expect(() =>
        parseDevicePossessionVerificationResult(
          { ...evidence, ...mutation },
          expected,
        ),
      ).toThrow();
    }
  });

  it("rejects self-consistent possession records with wrong UUID versions", () => {
    const base = devicePossessionChallenge();
    const mutations = [
      { challengeId: ACCOUNT_ID },
      { walletChallengeId: ACCOUNT_ID },
      { enrollmentId: ACCOUNT_ID },
      { accountId: ENROLLMENT_ID },
      { deviceCredentialId: ENROLLMENT_ID },
      {
        device: {
          ...base.device,
          installationId: ENROLLMENT_ID,
        },
      },
    ];
    for (const mutation of mutations) {
      const { challengeDigest, ...withoutDigest } = {
        ...base,
        ...mutation,
      };
      expect(challengeDigest).toBe(base.challengeDigest);
      const selfConsistent = {
        ...withoutDigest,
        challengeDigest: computeDevicePossessionChallengeDigest(
          withoutDigest as never,
        ),
      };
      expect(() => parseDevicePossessionChallenge(selfConsistent)).toThrow();
    }

    const challenge = parseDevicePossessionChallenge(base);
    const expected = {
      challenge: parseWalletChallenge(siweChallenge()),
      possessionChallenge: challenge,
    };
    for (const mutation of [
      { enrollmentId: ACCOUNT_ID },
      { accountId: ENROLLMENT_ID },
      { deviceCredentialId: ENROLLMENT_ID },
      { walletChallengeId: ACCOUNT_ID },
      { possessionChallengeId: ACCOUNT_ID },
      {
        possessionProof: {
          ...enrollmentRequest().possessionProof,
          installationId: ENROLLMENT_ID,
        },
      },
    ]) {
      expect(() =>
        parseDeviceEnrollmentRequest(
          { ...enrollmentRequest(), ...mutation },
          expected,
        ),
      ).toThrow();
    }
  });

  it("requires exact ordinary, unexpired MLS semantic-verifier evidence", () => {
    const parsedDevice = parseDeviceKeyBinding(device());
    const keyPackage = parsedDevice.mlsCredentialKey.initialKeyPackage;
    const evidence = {
      status: "verified",
      installationId: parsedDevice.installationId,
      ciphersuite: parsedDevice.mlsCredentialKey.ciphersuite,
      credentialFingerprint: parsedDevice.mlsCredentialKey.credentialFingerprint,
      keyPackageKind: keyPackage.kind,
      keyPackageRef: keyPackage.keyPackageRef,
      keyPackageSha256: keyPackage.sha256,
      keyPackageExpiresAt: keyPackage.expiresAt,
      signatureVerified: true,
      credentialAndInitKeyMatched: true,
      lastResort: false,
      evidenceId: "key-package-evidence.1",
      evidenceDigest: hash("e"),
      verifiedAt: "2026-08-14T12:01:30.000Z",
    };
    const expected = {
      device: parsedDevice,
      now: parseCanonicalInstant("2026-08-14T12:02:00.000Z"),
    };
    expect(
      parseMlsKeyPackageSemanticVerificationResult(evidence, expected),
    ).toMatchObject({ status: "verified", lastResort: false });
    for (const mutation of [
      { keyPackageRef: "E".repeat(43) },
      { keyPackageSha256: "E".repeat(43) },
      { keyPackageExpiresAt: "2026-08-20T12:00:00.000Z" },
      { keyPackageKind: "last-resort-mls-key-package.v1" },
      { lastResort: true },
      { signatureVerified: false },
      { credentialAndInitKeyMatched: false },
    ]) {
      expect(() =>
        parseMlsKeyPackageSemanticVerificationResult(
          { ...evidence, ...mutation },
          expected,
        ),
      ).toThrow();
    }
    expect(() =>
      parseMlsKeyPackageSemanticVerificationResult(evidence, {
        ...expected,
        now: parseCanonicalInstant(keyPackage.expiresAt),
      }),
    ).toThrow();
  });

  it("rejects an enrollment success that omits directory transparency proofs", () => {
    expect(() =>
      parseDeviceEnrollmentResult(
        {
          status: "enrolled",
          enrollmentId: ENROLLMENT_ID,
          credential: credential(),
        },
        {} as never,
      ),
    ).toThrow();
  });

  it("accepts success only with evidence digests and verified directory proofs", () => {
    const challenge = parseDevicePossessionChallenge(devicePossessionChallenge());
    const request = parseDeviceEnrollmentRequest(enrollmentRequest(), {
      challenge: parseWalletChallenge(siweChallenge()),
      possessionChallenge: challenge,
    });
    const value = credential();
    const directoryEntry = {
      kind: "device-directory-proof-bundle.v1",
      entryId: "directory-entry.1",
      credentialId: value.credentialId,
      credentialPayloadDigest: value.credentialPayloadDigest,
      checkpointId: "directory-checkpoint.1",
      inclusionProof: "AQID",
      consistencyProof: "BAUG",
      witnessReceipt: "BwgJ",
    };
    const possessionVerification = {
      status: "verified",
      enrollmentId: request.enrollmentId,
      walletChallengeId: request.walletChallengeId,
      possessionChallengeId: request.possessionChallengeId,
      installationId: request.device.installationId,
      deviceCredentialId: request.deviceCredentialId,
      challengeDigest: challenge.challengeDigest,
      proofDigest: sha256AuthorityDigest({
        kind: "device-possession-proof.v1",
        proof: request.possessionProof,
      }),
      evidenceId: "device-possession-evidence.1",
      evidenceDigest: value.possessionEvidenceDigest,
      verifiedAt: "2026-08-14T12:01:30.000Z",
    };
    const keyPackage = request.device.mlsCredentialKey.initialKeyPackage;
    const mlsKeyPackageVerification = {
      status: "verified",
      installationId: request.device.installationId,
      ciphersuite: request.device.mlsCredentialKey.ciphersuite,
      credentialFingerprint: request.device.mlsCredentialKey.credentialFingerprint,
      keyPackageKind: keyPackage.kind,
      keyPackageRef: keyPackage.keyPackageRef,
      keyPackageSha256: keyPackage.sha256,
      keyPackageExpiresAt: keyPackage.expiresAt,
      signatureVerified: true,
      credentialAndInitKeyMatched: true,
      lastResort: false,
      evidenceId: "key-package-evidence.1",
      evidenceDigest: hash("f"),
      verifiedAt: "2026-08-14T12:01:30.000Z",
    };
    const keyTransparencyVerification = {
      status: "verified",
      entryId: directoryEntry.entryId,
      credentialId: directoryEntry.credentialId,
      checkpointId: directoryEntry.checkpointId,
      inclusionProofDigest: sha256AuthorityDigest({
        kind: "device-directory-inclusion-proof.v1",
        proof: directoryEntry.inclusionProof,
      }),
      consistencyProofDigest: sha256AuthorityDigest({
        kind: "device-directory-consistency-proof.v1",
        proof: directoryEntry.consistencyProof,
      }),
      witnessReceiptDigest: sha256AuthorityDigest({
        kind: "device-directory-witness-receipt.v1",
        proof: directoryEntry.witnessReceipt,
      }),
      evidenceId: "key-transparency-evidence.1",
      evidenceDigest: hash("a"),
      verifiedAt: "2026-08-14T12:01:45.000Z",
    };
    const expected = {
      request,
      possessionChallenge: challenge,
      walletVerificationEvidenceDigest: parseHash32(
        value.walletVerificationEvidenceDigest,
      ),
      possessionVerification,
      mlsKeyPackageVerification,
      keyTransparencyVerification,
      credentialSignerKeyId: parseAuthorityId("device-credential-signer.1"),
      now: parseCanonicalInstant("2026-08-14T12:02:00.000Z"),
      credentialSignatureVerification:
        credentialExpectations(value).signatureVerification,
    };
    const result = {
      status: "enrolled",
      enrollmentId: request.enrollmentId,
      credential: value,
      directoryEntry,
    };
    expect(parseDeviceEnrollmentResult(result, expected)).toMatchObject({
      status: "enrolled",
      directoryEntry: { checkpointId: "directory-checkpoint.1" },
    });
    expect(() =>
      parseDeviceEnrollmentResult(result, {
        ...expected,
        keyTransparencyVerification: {
          status: "unavailable",
          credentialId: value.credentialId,
          reasonCode: "witness-unavailable",
        },
      }),
    ).toThrow();
  });

  it("issues a device-only credential that cannot smuggle an application role", () => {
    const expected = credentialExpectations();
    expect(parseDeviceCredential(credential(), expected)).toMatchObject({
      roleBinding: null,
    });
    expect(() =>
      parseDeviceCredential(
        { ...credential(), roleBinding: "project-owner" },
        expected,
      ),
    ).toThrow();
    expect(() =>
      parseDeviceCredential({
        ...credential(),
        expiresAt: "2026-09-13T12:01:00.001Z",
      }, expected),
    ).toThrow();
    expect(() =>
      parseDeviceCredential(
        { ...credential(), credentialPayloadDigest: hash("f") },
        expected,
      ),
    ).toThrow();
    expect(() =>
      parseDeviceCredential(credential(), {
        ...expected,
        signatureVerification: {
          status: "unavailable",
          credentialId: DEVICE_CREDENTIAL_ID,
          reasonCode: "credential-signature-verifier-not-configured",
        },
      }),
    ).toThrow();
  });

  it("requires every authority transition to increment and link the generation", () => {
    const policy = parseFinalityPolicy(finalityPolicy());
    const first = parseAuthorityGeneration(
      authorityGeneration(),
      policy,
      parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
    );
    const second = parseAuthorityGeneration(
      {
        ...authorityGeneration(),
        generationId: "generation.2",
        sequence: "2",
        transitionCause: "ordinary-owner-transfer",
        rootPrincipal: ADDRESS_B,
        rootEvidenceId: "root.2",
        rootEvidenceDigest: hash("9"),
        predecessorGenerationId: "generation.1",
        activatedAtBlock: {
          ...finalizedBlock(),
          blockNumber: "123457",
          blockHash: hash("9"),
        },
        transitionCursor: transitionCursor(2, 8, "123457", hash("9")),
      },
      policy,
      parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
    );
    expect(() => assertSuccessorAuthorityGeneration(first, second)).not.toThrow();
    expect(() =>
      assertSuccessorAuthorityGeneration(first, {
        ...second,
        sequence: parseUint256Decimal("3"),
      }),
    ).toThrow();
    expect(() =>
      assertSuccessorAuthorityGeneration(first, {
        ...second,
        predecessorGenerationId: parseAuthorityId("generation.other"),
      }),
    ).toThrow();
  });

  it("keeps an old delegation invalid after owner A to B to A", () => {
    const policy = parseFinalityPolicy(finalityPolicy());
    const first = parseAuthorityGeneration(
      authorityGeneration(),
      policy,
      parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
    );
    const now = parseCanonicalInstant("2026-08-14T12:01:00.000Z");
    expect(() =>
      parseProjectStaffDelegation(
        delegation(),
        delegationExpectations(first, now),
      ),
    ).not.toThrow();
    const third = parseAuthorityGeneration(
      {
        ...authorityGeneration(),
        generationId: "generation.3",
        sequence: "3",
        transitionCause: "ordinary-owner-transfer",
        predecessorGenerationId: "generation.2",
        activatedAtBlock: {
          ...finalizedBlock(),
          blockNumber: "123458",
          blockHash: hash("f"),
        },
        transitionCursor: transitionCursor(3, 12, "123458", hash("f")),
      },
      policy,
      parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
    );
    expect(() =>
      parseProjectStaffDelegation(
        delegation(),
        delegationExpectations(third, now),
      ),
    ).toThrow();
  });

  it("allows multiple append-only authority transitions in one finalized block", () => {
    const policy = parseFinalityPolicy(finalityPolicy());
    const first = parseAuthorityGeneration(
      authorityGeneration(),
      policy,
      parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
    );
    const second = parseAuthorityGeneration(
      {
        ...authorityGeneration(),
        generationId: "generation.2",
        sequence: "2",
        transitionCause: "ordinary-owner-transfer",
        rootPrincipal: ADDRESS_B,
        rootEvidenceId: "root.2",
        rootEvidenceDigest: hash("9"),
        predecessorGenerationId: "generation.1",
        transitionCursor: transitionCursor(1, 5),
      },
      policy,
      parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
    );
    const third = parseAuthorityGeneration(
      {
        ...authorityGeneration(),
        generationId: "generation.3",
        sequence: "3",
        transitionCause: "ordinary-owner-transfer",
        rootEvidenceId: "root.3",
        rootEvidenceDigest: hash("f"),
        predecessorGenerationId: "generation.2",
        transitionCursor: transitionCursor(1, 6),
      },
      policy,
      parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
    );
    expect(() => assertSuccessorAuthorityGeneration(first, second)).not.toThrow();
    expect(() => assertSuccessorAuthorityGeneration(second, third)).not.toThrow();
    expect(() =>
      assertSuccessorAuthorityGeneration(second, {
        ...third,
        transitionCursor: second.transitionCursor,
      }),
    ).toThrow();
    expect(() =>
      assertSuccessorAuthorityGeneration(second, {
        ...third,
        activatedAtBlock: {
          ...third.activatedAtBlock,
          blockHash: parseHash32(hash("0")),
        },
      }),
    ).toThrow();
  });

  it("requires a manifest-pinned gap-free checkpoint for owner A to B to A", () => {
    const policy = parseFinalityPolicy(finalityPolicy());
    const now = parseCanonicalInstant("2026-08-14T12:03:00.000Z");
    const parsedProject = parseJuiceboxV6ProjectRef(project());
    const sources = transitionSources();
    const firstGeneration = parseAuthorityGeneration(
      authorityGeneration(),
      policy,
      now,
    );
    const firstValue = transitionScanValue({
      checkpointId: "authority-checkpoint.1",
      previousCheckpoint: null,
      rangeStartBlockNumber: "123456",
      verifiedThroughBlock: finalizedBlock(),
      generations: [authorityGeneration()],
    });
    const firstScan = parseFinalizedAuthorityTransitionScan(firstValue, policy, {
      project: parsedProject,
      adapterRevision: parseAuthorityId("root-authority.base.v1"),
      sources,
      previousCheckpoint: null,
      previousGeneration: null,
      initialRangeStartBlockNumber: parseUint256Decimal("123456"),
      verifiedThroughBlock: firstGeneration.activatedAtBlock,
      now,
    });
    const secondGeneration = {
      ...authorityGeneration(),
      generationId: "generation.2",
      sequence: "2",
      transitionCause: "ordinary-owner-transfer",
      rootPrincipal: ADDRESS_B,
      rootEvidenceId: "root.2",
      rootEvidenceDigest: hash("9"),
      predecessorGenerationId: "generation.1",
      activatedAtBlock: finalizedBlockAt("123457", hash("b")),
      transitionCursor: transitionCursor(2, 8, "123457", hash("b")),
    };
    const thirdGeneration = {
      ...authorityGeneration(),
      generationId: "generation.3",
      sequence: "3",
      transitionCause: "ordinary-owner-transfer",
      rootEvidenceId: "root.3",
      rootEvidenceDigest: hash("f"),
      predecessorGenerationId: "generation.2",
      activatedAtBlock: finalizedBlockAt("123458", hash("c")),
      transitionCursor: transitionCursor(3, 12, "123458", hash("c")),
    };
    const parsedThird = parseAuthorityGeneration(thirdGeneration, policy, now);
    const secondValue = transitionScanValue({
      checkpointId: "authority-checkpoint.2",
      previousCheckpoint: firstScan.checkpoint,
      rangeStartBlockNumber: "123457",
      verifiedThroughBlock: finalizedBlockAt("123458", hash("c")),
      generations: [secondGeneration, thirdGeneration],
    });
    const expectations = {
      project: parsedProject,
      adapterRevision: parseAuthorityId("root-authority.base.v1"),
      sources,
      previousCheckpoint: firstScan.checkpoint,
      previousGeneration: firstGeneration,
      initialRangeStartBlockNumber: parseUint256Decimal("123456"),
      verifiedThroughBlock: parsedThird.activatedAtBlock,
      now,
    };
    expect(
      parseFinalizedAuthorityTransitionScan(secondValue, policy, expectations),
    ).toMatchObject({
      checkpoint: {
        cumulativeTransitionCount: "3",
        lastGenerationId: "generation.3",
      },
      generations: [{ rootPrincipal: ADDRESS_B }, { rootPrincipal: ADDRESS_A }],
    });

    for (const previousGeneration of [
      {
        ...firstGeneration,
        generationId: parseAuthorityId("generation.stale-branch"),
      },
      {
        ...firstGeneration,
        sequence: parseUint256Decimal("2"),
      },
      {
        ...firstGeneration,
        transitionCursor: {
          ...firstGeneration.transitionCursor,
          transactionHash: parseHash32(hash("e")),
        },
      },
    ]) {
      expect(() =>
        parseFinalizedAuthorityTransitionScan(secondValue, policy, {
          ...expectations,
          previousGeneration,
        }),
      ).toThrow(/checkpoint is detached from its exact predecessor generation/i);
    }
    expect(() =>
      parseFinalizedAuthorityTransitionScan(secondValue, policy, {
        ...expectations,
        previousCheckpoint: {
          ...firstScan.checkpoint,
          lastGenerationId: parseAuthorityId("generation.stale-checkpoint"),
        },
      }),
    ).toThrow(/checkpoint is detached from its exact predecessor generation/i);
    expect(() =>
      parseFinalizedAuthorityTransitionScan(secondValue, policy, {
        ...expectations,
        previousGeneration: null,
      }),
    ).toThrow(/checkpoint and predecessor generation must advance together/i);

    const skippedMiddle = transitionScanValue({
      checkpointId: "authority-checkpoint.skipped",
      previousCheckpoint: firstScan.checkpoint,
      rangeStartBlockNumber: "123457",
      verifiedThroughBlock: finalizedBlockAt("123458", hash("c")),
      generations: [thirdGeneration],
    });
    expect(() =>
      parseFinalizedAuthorityTransitionScan(skippedMiddle, policy, expectations),
    ).toThrow();

    const replayedPredecessor = transitionScanValue({
      checkpointId: "authority-checkpoint.replay",
      previousCheckpoint: firstScan.checkpoint,
      previousCheckpointIdOverride: "authority-checkpoint.other",
      rangeStartBlockNumber: "123457",
      verifiedThroughBlock: finalizedBlockAt("123458", hash("c")),
      generations: [secondGeneration, thirdGeneration],
    });
    expect(() =>
      parseFinalizedAuthorityTransitionScan(
        replayedPredecessor,
        policy,
        expectations,
      ),
    ).toThrow();
  });

  it("creates a disabled tombstone generation when project authority is burned", () => {
    const policy = parseFinalityPolicy(finalityPolicy());
    const first = parseAuthorityGeneration(
      authorityGeneration(),
      policy,
      parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
    );
    const lossWithoutDigest = {
      kind: "finalized-project-authority-loss.v1",
      evidenceId: "root-loss.1",
      project: project(),
      predecessorGenerationId: "generation.1",
      predecessorGenerationSequence: "1",
      predecessorPrincipal: ADDRESS_A,
      predecessorRootKind: "jbprojects-owner",
      transitionCause: "project-owner-burned",
      block: finalizedBlock(),
      transitionCursor: transitionCursor(1, 5),
      successorTombstone: {
        generationId: "generation.2",
        sequence: "2",
        transitionCause: "project-owner-burned",
        authorityStatus: "disabled",
        rootKind: "no-current-authority",
        rootPrincipal: null,
      },
      scannerCheckpointId: "authority-checkpoint.2",
      scannerCheckpointDigest: hash("c"),
      requiredAction: "revoke-leases-delegations-and-rekey",
    };
    const loss = parseFinalizedAuthorityLossEvidence(
      {
        ...lossWithoutDigest,
        evidenceDigest: sha256AuthorityDigest({
          kind: "finalized-project-authority-loss-evidence.v1",
          evidence: lossWithoutDigest,
        }),
      },
      policy,
      {
        predecessor: first,
        scannerCheckpointId: parseAuthorityId("authority-checkpoint.2"),
        scannerCheckpointDigest: parseHash32(hash("c")),
        now: parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
      },
    );
    const substitutedPredecessor = {
      ...lossWithoutDigest,
      predecessorGenerationId: "generation.other",
      predecessorPrincipal: ADDRESS_B,
    };
    expect(() =>
      parseFinalizedAuthorityLossEvidence(
        {
          ...substitutedPredecessor,
          evidenceDigest: sha256AuthorityDigest({
            kind: "finalized-project-authority-loss-evidence.v1",
            evidence: substitutedPredecessor,
          }),
        },
        policy,
        {
          predecessor: first,
          scannerCheckpointId: parseAuthorityId("authority-checkpoint.2"),
          scannerCheckpointDigest: parseHash32(hash("c")),
          now: parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
        },
      ),
    ).toThrow();
    const disabled = parseAuthorityGeneration(
      {
        ...authorityGeneration(),
        generationId: "generation.2",
        sequence: "2",
        transitionCause: "project-owner-burned",
        authorityStatus: "disabled",
        rootKind: "no-current-authority",
        rootPrincipal: null,
        rootEvidenceId: loss.evidenceId,
        rootEvidenceDigest: loss.evidenceDigest,
        predecessorGenerationId: "generation.1",
        transitionCursor: transitionCursor(1, 5),
      },
      policy,
      parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
    );
    expect(() => assertSuccessorAuthorityGeneration(first, disabled)).not.toThrow();
    expect(() =>
      assertAuthorityGenerationTransitionEvidence(disabled, loss),
    ).not.toThrow();
    expect(() =>
      parseProjectStaffDelegation(
        delegation(),
        delegationExpectations(
          disabled,
          parseCanonicalInstant("2026-08-14T12:01:00.000Z"),
        ),
      ),
    ).toThrow();
  });

  it("allows only explicit sorted app capabilities and never an onchain ROOT wildcard", () => {
    const policy = parseFinalityPolicy(finalityPolicy());
    const generation = parseAuthorityGeneration(
      authorityGeneration(),
      policy,
      parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
    );
    const now = parseCanonicalInstant("2026-08-14T12:01:00.000Z");
    expect(
      parseProjectStaffDelegation(
        delegation(),
        delegationExpectations(generation, now),
      ),
    ).toMatchObject({ delegationAllowed: false });
    for (const capabilities of [
      [],
      ["ROOT"],
      ["permission:1"],
      ["support:*"],
      ["support:send-messages", "support:send-messages"],
      ["support:send-messages", "fulfillment:read-address"],
    ]) {
      expect(() =>
        parseProjectStaffDelegation(
          { ...delegation(), capabilities },
          delegationExpectations(generation, now),
        ),
      ).toThrow();
    }
  });

  it("rejects revoked, expired, transitive, and overlong delegations", () => {
    const policy = parseFinalityPolicy(finalityPolicy());
    const generation = parseAuthorityGeneration(
      authorityGeneration(),
      policy,
      parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
    );
    const now = parseCanonicalInstant("2026-08-14T12:01:00.000Z");
    for (const mutation of [
      { ...delegation(), delegationAllowed: true },
      { ...delegation(), revokedAt: "2026-08-14T12:00:30.000Z" },
      { ...delegation(), expiresAt: "2026-08-14T12:01:00.000Z" },
      { ...delegation(), expiresAt: "2026-08-21T12:00:00.001Z" },
    ]) {
      expect(() =>
        parseProjectStaffDelegation(
          mutation,
          delegationExpectations(generation, now),
        ),
      ).toThrow();
    }
  });

  it("distinguishes ordinary ownerOf authority from canonical Revnet operator authority", () => {
    const policy = parseFinalityPolicy(finalityPolicy());
    const generation = parseAuthorityGeneration(
      authorityGeneration(),
      policy,
      parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
    );
    const ordinary = parseRootAuthorityVerificationResult(
      ordinaryRootResult(),
      policy,
      rootExpectations("ordinary"),
    );
    expect(
      ordinary,
    ).toMatchObject({ role: "project-owner" });
    if (ordinary.status !== "verified") throw new Error("wrong fixture");
    expect(() =>
      assertAuthorityGenerationTransitionEvidence(generation, ordinary),
    ).not.toThrow();
    expect(() =>
      parseRootAuthorityVerificationResult(
        {
          ...ordinaryRootResult(),
          projectsContract: ADDRESS_B,
        },
        policy,
        rootExpectations("ordinary"),
      ),
    ).toThrow();
    expect(
      parseRootAuthorityVerificationResult(
        revnetRootResult(),
        policy,
        rootExpectations("revnet"),
      ),
    ).toMatchObject({ role: "revnet-operator", ownerOfResult: ADDRESS_C });
    expect(() =>
      parseRootAuthorityVerificationResult(
        {
          ...revnetRootResult(),
          ownerOfResult: ADDRESS_B,
        },
        policy,
        rootExpectations("revnet"),
      ),
    ).toThrow();
    expect(() =>
      parseRootAuthorityVerificationResult(
        {
          ...revnetRootResult(),
          deploymentEvidence: {
            ...revnetRootResult().deploymentEvidence,
            revOwnerDeployerResult: ADDRESS_A,
          },
        },
        policy,
        rootExpectations("revnet"),
      ),
    ).toThrow();
    expect(() =>
      parseRootAuthorityVerificationResult(
        {
          ...ordinaryRootResult(),
          canonicalRevnetClassification: {
            ...ordinaryRootResult().canonicalRevnetClassification,
            result: "canonical-revnet",
          },
        },
        policy,
        rootExpectations("ordinary"),
      ),
    ).toThrow();
  });
});
