import { describe, expect, it } from "vitest";
import {
  EIP712_CHALLENGE_TYPES,
  assertChallengeUsable,
  canonicalEip712TypedData,
  parseAccountId,
  parseDeviceCredentialId,
  parseEnrollmentId,
  parseInstallationId,
  parsePossessionChallengeId,
  parseWalletChallenge,
  parseWalletChallengeId,
  serializeSiweMessage,
} from "./challenges";
import {
  ADDRESS_A,
  ACCOUNT_ID,
  DEVICE_CREDENTIAL_ID,
  ENROLLMENT_ID,
  INSTALLATION_ID,
  POSSESSION_CHALLENGE_ID,
  WALLET_CHALLENGE_ID,
  device,
  eip712Challenge,
  hash,
  siweChallenge,
} from "./fixtures.testing";
import {
  parseAuthorityId,
  parseCanonicalInstant,
  parseEthereumAddress,
  parseHash32,
  parseHttpsOrigin,
} from "./valueObjects";

function winningClaim(claimedAt = "2026-08-14T12:00:30.000Z") {
  return {
    status: "claimed" as const,
    challengeId: parseWalletChallengeId(WALLET_CHALLENGE_ID),
    claimId: parseAuthorityId("claim.1"),
    claimedAt: parseCanonicalInstant(claimedAt),
    terminalEvenIfVerificationFails: true as const,
  };
}

describe("server-owned wallet challenges", () => {
  it("strictly parses and deterministically serializes the SIWE record", () => {
    const challenge = parseWalletChallenge(siweChallenge());
    expect(challenge.kind).toBe("siwe-erc4361-v1");
    if (challenge.kind !== "siwe-erc4361-v1") throw new Error("wrong fixture");

    expect(serializeSiweMessage(challenge)).toBe(
      [
        "https://chat.example wants you to sign in with your Ethereum account:",
        ADDRESS_A,
        "",
        "Authorize this wallet to enroll one Juicebox Messaging device.",
        "",
        "URI: https://chat.example/auth/wallet",
        "Version: 1",
        "Chain ID: 8453",
        `Nonce: ${"N".repeat(22)}`,
        "Issued At: 2026-08-14T12:00:00.000Z",
        "Expiration Time: 2026-08-14T12:05:00.000Z",
        "Not Before: 2026-08-14T12:00:00.000Z",
        `Request ID: ${WALLET_CHALLENGE_ID}`,
        "Resources:",
        ...siweChallenge().resources.map((resource) => `- ${resource}`),
      ].join("\n"),
    );
  });

  it("uses a fixed EIP-712 domain, primary type, member order, and message", () => {
    const challenge = parseWalletChallenge(eip712Challenge());
    expect(challenge.kind).toBe("eip712-device-enrollment-v1");
    if (challenge.kind !== "eip712-device-enrollment-v1") throw new Error("wrong fixture");
    const typedData = canonicalEip712TypedData(challenge);
    expect(typedData.types).toBe(EIP712_CHALLENGE_TYPES);
    expect(typedData.primaryType).toBe(
      "JuiceboxMessagingDeviceEnrollmentV1",
    );
    expect(typedData.domain).toEqual({
      name: "Juicebox Messaging",
      version: "1",
      chainId: 8453,
      salt: hash("c"),
    });
    expect(
      typedData.types.JuiceboxMessagingDeviceEnrollmentV1.map(
        ({ name }) => name,
      ),
    ).toEqual([
      "challengeId",
      "possessionChallengeId",
      "audience",
      "clientId",
      "origin",
      "purpose",
      "action",
      "scopeDigest",
      "enrollmentId",
      "accountId",
      "chainId",
      "installationId",
      "deviceCredentialId",
      "installationAuthProfile",
      "installationAuthJkt",
      "mlsCredentialProfile",
      "mlsCiphersuite",
      "mlsCredentialPublicKey",
      "mlsCredentialFingerprint",
      "keyPackageKind",
      "keyPackageRef",
      "keyPackageSha256",
      "protocolProfile",
      "nonce",
      "issuedAt",
      "notBefore",
      "expiresAt",
    ]);
    expect(
      typedData.types.JuiceboxMessagingDeviceEnrollmentV1.map(
        ({ type }) => type,
      ),
    ).toEqual([
      "bytes16",
      "bytes16",
      "string",
      "string",
      "string",
      "string",
      "string",
      "bytes32",
      "bytes16",
      "bytes16",
      "uint256",
      "bytes16",
      "bytes16",
      "string",
      "bytes32",
      "string",
      "string",
      "bytes32",
      "bytes32",
      "string",
      "bytes32",
      "bytes32",
      "string",
      "string",
      "uint64",
      "uint64",
      "uint64",
    ]);
  });

  it("accepts a challenge only for its exact account, chain, origin, purpose, and device", () => {
    const challenge = parseWalletChallenge(siweChallenge());
    if (challenge.kind !== "siwe-erc4361-v1") throw new Error("wrong fixture");
    const expectations = {
      challengeId: challenge.challengeId,
      possessionChallengeId: challenge.possessionChallengeId,
      enrollmentId: challenge.enrollmentId,
      accountId: challenge.accountId,
      deviceCredentialId: challenge.deviceCredentialId,
      account: parseEthereumAddress(ADDRESS_A),
      chainId: 8453 as const,
      origin: parseHttpsOrigin("https://chat.example"),
      audience: parseHttpsOrigin("https://chat.example"),
      clientId: parseAuthorityId("client.web.v1"),
      scope: challenge.scope,
      purpose: "device-enrollment" as const,
      device: challenge.device,
    };
    expect(() =>
      assertChallengeUsable(
        challenge,
        expectations,
        parseCanonicalInstant("2026-08-14T12:01:00.000Z"),
        winningClaim(),
      ),
    ).not.toThrow();

    for (const mutation of [
      { ...expectations, account: parseEthereumAddress("0x2222222222222222222222222222222222222222") },
      { ...expectations, chainId: 10 as const },
      { ...expectations, origin: parseHttpsOrigin("https://other.example") },
      { ...expectations, purpose: "session" as const },
      {
        ...expectations,
        device: {
          ...expectations.device,
          installationId: parseAuthorityId("installation.2"),
        },
      },
    ]) {
      expect(() =>
        assertChallengeUsable(
          challenge,
          mutation as never,
          parseCanonicalInstant("2026-08-14T12:01:00.000Z"),
          winningClaim(),
        ),
      ).toThrow();
    }
  });

  it("rejects consumed, not-yet-valid, expired, and overlong challenge windows", () => {
    const challenge = parseWalletChallenge(siweChallenge());
    if (challenge.kind !== "siwe-erc4361-v1") throw new Error("wrong fixture");
    const expectations = {
      challengeId: challenge.challengeId,
      possessionChallengeId: challenge.possessionChallengeId,
      enrollmentId: challenge.enrollmentId,
      accountId: challenge.accountId,
      deviceCredentialId: challenge.deviceCredentialId,
      account: parseEthereumAddress(ADDRESS_A),
      chainId: 8453 as const,
      origin: parseHttpsOrigin("https://chat.example"),
      audience: parseHttpsOrigin("https://chat.example"),
      clientId: parseAuthorityId("client.web.v1"),
      scope: challenge.scope,
      purpose: "device-enrollment" as const,
      device: challenge.device,
    };
    expect(() =>
      assertChallengeUsable(
        challenge,
        expectations,
        parseCanonicalInstant("2026-08-14T11:59:59.999Z"),
        winningClaim(),
      ),
    ).toThrow();
    expect(() =>
      assertChallengeUsable(
        challenge,
        expectations,
        parseCanonicalInstant("2026-08-14T12:05:00.000Z"),
        winningClaim(),
      ),
    ).toThrow();
    expect(() =>
      assertChallengeUsable(
        challenge,
        expectations,
        parseCanonicalInstant("2026-08-14T12:01:00.000Z"),
        winningClaim("2026-08-14T12:01:00.001Z"),
      ),
    ).toThrow();
    expect(() =>
      assertChallengeUsable(
        challenge,
        expectations,
        parseCanonicalInstant("2026-08-14T12:01:00.000Z"),
        { ...winningClaim(), claimedAt: "garbage" } as never,
      ),
    ).toThrow();
    const delayed = parseWalletChallenge({
      ...siweChallenge(),
      notBefore: "2026-08-14T12:00:45.000Z",
    });
    expect(() =>
      assertChallengeUsable(
        delayed,
        expectations,
        parseCanonicalInstant("2026-08-14T12:01:00.000Z"),
        winningClaim("2026-08-14T12:00:30.000Z"),
      ),
    ).toThrow();
    expect(() =>
      parseWalletChallenge({
        ...siweChallenge(),
        expiresAt: "2026-08-14T12:05:00.001Z",
      }),
    ).toThrow();
  });

  it("rejects hybrids, unknown fields, weak nonces, resource mutation, and domain mismatch", () => {
    const base = siweChallenge();
    for (const mutation of [
      { ...base, kind: "siwe-eip4361" },
      { ...base, message: eip712Challenge().message },
      { ...base, nonce: "short" },
      { ...base, nonce: `${"N".repeat(21)}-` },
      { ...base, nonce: `${"N".repeat(21)}_` },
      { ...base, domain: "other.example" },
      { ...base, uri: "https://chat.example/other" },
      { ...base, resources: [...base.resources.slice(0, 3), "urn:wrong"] },
      { ...base, requestId: "challenge.other" },
      { ...base, statement: "Please sign" },
      { ...base, account: `${ADDRESS_A}\n` },
    ]) {
      expect(() => parseWalletChallenge(mutation)).toThrow();
    }
    expect(() =>
      parseWalletChallenge({ ...eip712Challenge(), kind: "eip712-v4" }),
    ).toThrow();
  });

  it("requires the configured EIP-712 deployment salt", () => {
    const challenge = parseWalletChallenge(eip712Challenge());
    if (challenge.kind !== "eip712-device-enrollment-v1") throw new Error("wrong fixture");
    const expectations = {
      challengeId: challenge.challengeId,
      possessionChallengeId: challenge.possessionChallengeId,
      enrollmentId: challenge.enrollmentId,
      accountId: challenge.accountId,
      deviceCredentialId: challenge.deviceCredentialId,
      account: parseEthereumAddress(ADDRESS_A),
      chainId: 8453 as const,
      origin: parseHttpsOrigin("https://chat.example"),
      audience: parseHttpsOrigin("https://chat.example"),
      clientId: parseAuthorityId("client.web.v1"),
      scope: challenge.scope,
      purpose: "device-enrollment" as const,
      device: challenge.device,
      eip712DomainSalt: parseHash32(hash("c")),
    };
    expect(() =>
      assertChallengeUsable(
        challenge,
        expectations,
        parseCanonicalInstant("2026-08-14T12:01:00.000Z"),
        { ...winningClaim(), challengeId: challenge.challengeId },
      ),
    ).not.toThrow();
    expect(() =>
      assertChallengeUsable(
        challenge,
        { ...expectations, eip712DomainSalt: parseHash32(hash("d")) },
        parseCanonicalInstant("2026-08-14T12:01:00.000Z"),
        { ...winningClaim(), challengeId: challenge.challengeId },
      ),
    ).toThrow();
  });

  it("enforces v7 operational IDs and v4 account/device namespaces", () => {
    expect(parseEnrollmentId(ENROLLMENT_ID)).toBe(ENROLLMENT_ID);
    expect(parseWalletChallengeId(WALLET_CHALLENGE_ID)).toBe(
      WALLET_CHALLENGE_ID,
    );
    expect(parsePossessionChallengeId(POSSESSION_CHALLENGE_ID)).toBe(
      POSSESSION_CHALLENGE_ID,
    );
    expect(parseAccountId(ACCOUNT_ID)).toBe(ACCOUNT_ID);
    expect(parseInstallationId(INSTALLATION_ID)).toBe(INSTALLATION_ID);
    expect(parseDeviceCredentialId(DEVICE_CREDENTIAL_ID)).toBe(
      DEVICE_CREDENTIAL_ID,
    );
    for (const parse of [
      () => parseEnrollmentId(ACCOUNT_ID),
      () => parseWalletChallengeId(ACCOUNT_ID),
      () => parsePossessionChallengeId(ACCOUNT_ID),
      () => parseAccountId(ENROLLMENT_ID),
      () => parseInstallationId(ENROLLMENT_ID),
      () => parseDeviceCredentialId(ENROLLMENT_ID),
    ]) {
      expect(parse).toThrow();
    }

    const siwe = siweChallenge();
    for (const mutation of [
      { challengeId: ACCOUNT_ID, requestId: ACCOUNT_ID },
      { possessionChallengeId: ACCOUNT_ID },
      { enrollmentId: ACCOUNT_ID },
      { accountId: ENROLLMENT_ID },
      { deviceCredentialId: ENROLLMENT_ID },
      {
        device: {
          ...siwe.device,
          installationId: ENROLLMENT_ID,
        },
      },
    ]) {
      expect(() => parseWalletChallenge({ ...siwe, ...mutation })).toThrow();
    }

    const eip712 = eip712Challenge();
    for (const mutation of [
      { challengeId: ACCOUNT_ID },
      { possessionChallengeId: ACCOUNT_ID },
      { enrollmentId: ACCOUNT_ID },
      { accountId: ENROLLMENT_ID },
      { deviceCredentialId: ENROLLMENT_ID },
      {
        device: {
          ...eip712.device,
          installationId: ENROLLMENT_ID,
        },
      },
    ]) {
      expect(() => parseWalletChallenge({ ...eip712, ...mutation })).toThrow();
    }

    // Same-version UUIDs are still role-bound by the trusted allocation.
    const parsed = parseWalletChallenge(siwe);
    if (parsed.kind !== "siwe-erc4361-v1") throw new Error("wrong fixture");
    expect(() =>
      assertChallengeUsable(
        parsed,
        {
          challengeId: parsed.challengeId,
          possessionChallengeId: parsed.possessionChallengeId,
          enrollmentId: parsed.enrollmentId,
          accountId: parseAccountId(DEVICE_CREDENTIAL_ID),
          deviceCredentialId: parsed.deviceCredentialId,
          account: parsed.account,
          chainId: parsed.chainId,
          origin: parseHttpsOrigin("https://chat.example"),
          audience: parsed.audience,
          clientId: parsed.clientId,
          scope: parsed.scope,
          purpose: parsed.purpose,
          device: parsed.device,
        },
        parseCanonicalInstant("2026-08-14T12:01:00.000Z"),
        winningClaim(),
      ),
    ).toThrow();
  });

  it("never accepts a client-replayed challenge object as a signature submission", async () => {
    const { parseWalletSignatureSubmission } = await import("./signatures");
    expect(
      parseWalletSignatureSubmission({
        kind: "wallet-signature-submission.v1",
        challengeId: "challenge.1",
        signature: `0x${"11".repeat(65)}`,
      }),
    ).toMatchObject({ challengeId: "challenge.1" });
    expect(() =>
      parseWalletSignatureSubmission({
        kind: "wallet-signature-submission.v1",
        challengeId: "challenge.1",
        signature: `0x${"11".repeat(65)}`,
        challenge: siweChallenge(),
      }),
    ).toThrow();
  });

  it("strictly binds the exact device public key and MLS credential", () => {
    expect(() => parseWalletChallenge(siweChallenge())).not.toThrow();
    expect(() =>
      parseWalletChallenge({
        ...siweChallenge(),
        device: {
          ...device(),
          installationAuthKey: {
            ...device().installationAuthKey,
            publicJwk: {
              ...device().installationAuthKey.publicJwk,
              x: `${"A".repeat(42)}E`,
            },
          },
        },
      }),
    ).toThrow();
  });

  it("rejects KeyPackage substitution, expiry, last-resort use, and project-scoped enrollment", () => {
    const base = siweChallenge();
    expect(() =>
      parseWalletChallenge({
        ...base,
        device: {
          ...base.device,
          mlsCredentialKey: {
            ...base.device.mlsCredentialKey,
            initialKeyPackage: {
              ...base.device.mlsCredentialKey.initialKeyPackage,
              keyPackage: "BAUG",
            },
          },
        },
      }),
    ).toThrow();
    expect(() =>
      parseWalletChallenge({
        ...base,
        device: {
          ...base.device,
          mlsCredentialKey: {
            ...base.device.mlsCredentialKey,
            initialKeyPackage: {
              ...base.device.mlsCredentialKey.initialKeyPackage,
              expiresAt: base.expiresAt,
            },
          },
        },
      }),
    ).toThrow();
    expect(() =>
      parseWalletChallenge({
        ...base,
        device: {
          ...base.device,
          mlsCredentialKey: {
            ...base.device.mlsCredentialKey,
            initialKeyPackage: {
              ...base.device.mlsCredentialKey.initialKeyPackage,
              kind: "last-resort-mls-key-package.v1",
            },
          },
        },
      }),
    ).toThrow();
    expect(() =>
      parseWalletChallenge({
        ...base,
        scope: {
          ...base.scope,
          project: {
            protocol: "juicebox-v6",
            chainId: 8453,
            projectId: 9,
            version: 6,
            deploymentManifestId: "deployments.base.v1",
            projectsContract: "0x3333333333333333333333333333333333333333",
          },
        },
      }),
    ).toThrow();
  });

  it("rejects mutation of every typed ID, package commitment, action, and time binding", () => {
    const base = eip712Challenge();
    const messageMutations = [
      { challengeId: `0x${"1".repeat(32)}` },
      { possessionChallengeId: `0x${"2".repeat(32)}` },
      { action: "other" },
      { scopeDigest: hash("1") },
      { enrollmentId: `0x${"3".repeat(32)}` },
      { accountId: `0x${"4".repeat(32)}` },
      { chainId: 10 },
      { installationId: `0x${"5".repeat(32)}` },
      { deviceCredentialId: `0x${"6".repeat(32)}` },
      { installationAuthJkt: hash("7") },
      { mlsCredentialPublicKey: hash("8") },
      { mlsCredentialFingerprint: hash("9") },
      { keyPackageKind: "last-resort-mls-key-package.v1" },
      { keyPackageRef: hash("a") },
      { keyPackageSha256: hash("b") },
      { protocolProfile: "other.v1" },
      { issuedAt: base.message.issuedAt + 1 },
      { notBefore: base.message.notBefore + 1 },
      { expiresAt: base.message.expiresAt + 1 },
    ];
    for (const mutation of messageMutations) {
      expect(() =>
        parseWalletChallenge({
          ...base,
          message: { ...base.message, ...mutation },
        }),
      ).toThrow();
    }
  });
});
