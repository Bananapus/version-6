import { describe, expect, it } from "vitest";
import {
  parseCanonicalityResult,
  parseFinalityPolicy,
  parseFinalizedBlockAnchor,
} from "./finality";
import {
  ERC1271_CANONICAL_ABI_RETURN,
  ERC1271_MAGIC_VALUE,
  ERC6492_DETECTION_SUFFIX,
  parseWalletSignatureVerificationResult,
} from "./signatures";
import {
  ADDRESS_A,
  finalityPolicy,
  finalizedBlock,
  hash,
} from "./fixtures.testing";
import {
  parseAuthorityId,
  parseCanonicalInstant,
  parseEthereumAddress,
  parseHash32,
} from "./valueObjects";

function signatureExpectations() {
  return {
    challengeId: parseAuthorityId("challenge.1"),
    account: parseEthereumAddress(ADDRESS_A),
    chainId: 8453 as const,
    digest: parseHash32(hash("1")),
    now: parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
  };
}

describe("signature evidence and chain finality", () => {
  it("accepts exact EOA, ERC-1271, and ERC-6492 verified result variants", () => {
    const policy = parseFinalityPolicy(finalityPolicy());
    const base = {
      status: "verified",
      challengeId: "challenge.1",
      account: ADDRESS_A,
      chainId: 8453,
      digest: hash("1"),
      verifiedAt: "2026-08-14T12:02:00.000Z",
    };
    expect(
      parseWalletSignatureVerificationResult(
        { ...base, method: "eoa", chainEvidence: null },
        policy,
        signatureExpectations(),
      ),
    ).toMatchObject({ status: "verified", method: "eoa" });
    expect(
      parseWalletSignatureVerificationResult(
        {
          ...base,
          method: "erc1271",
          chainEvidence: {
            standard: "erc1271",
            returnedMagicValue: ERC1271_MAGIC_VALUE,
            canonicalReturnData: ERC1271_CANONICAL_ABI_RETURN,
            block: finalizedBlock(),
          },
        },
        policy,
        signatureExpectations(),
      ),
    ).toMatchObject({ status: "verified", method: "erc1271" });
    expect(
      parseWalletSignatureVerificationResult(
        {
          ...base,
          method: "erc6492",
          chainEvidence: {
            standard: "erc6492",
            detectionSuffix: ERC6492_DETECTION_SUFFIX,
            simulationBlock: finalizedBlock(),
            sideEffectsPersisted: false,
          },
        },
        policy,
        signatureExpectations(),
      ),
    ).toMatchObject({ status: "verified", method: "erc6492" });
  });

  it("rejects booleans, hybrid results, wrong magic, wrong suffix, and simulated side effects", () => {
    const policy = parseFinalityPolicy(finalityPolicy());
    const base = {
      status: "verified",
      challengeId: "challenge.1",
      account: ADDRESS_A,
      chainId: 8453,
      digest: hash("1"),
      verifiedAt: "2026-08-14T12:02:00.000Z",
    };
    for (const result of [
      { valid: true },
      { ...base, method: "eoa", chainEvidence: null, reasonCode: "anything" },
      {
        ...base,
        method: "erc1271",
        chainEvidence: {
          standard: "erc1271",
          returnedMagicValue: "0xffffffff",
          canonicalReturnData: ERC1271_CANONICAL_ABI_RETURN,
          block: finalizedBlock(),
        },
      },
      {
        ...base,
        method: "erc1271",
        chainEvidence: {
          standard: "erc1271",
          returnedMagicValue: ERC1271_MAGIC_VALUE,
          canonicalReturnData: ERC1271_MAGIC_VALUE,
          block: finalizedBlock(),
        },
      },
      {
        ...base,
        method: "erc6492",
        chainEvidence: {
          standard: "erc6492",
          detectionSuffix: hash("0"),
          simulationBlock: finalizedBlock(),
          sideEffectsPersisted: false,
        },
      },
      {
        ...base,
        method: "erc6492",
        chainEvidence: {
          standard: "erc6492",
          detectionSuffix: ERC6492_DETECTION_SUFFIX,
          simulationBlock: finalizedBlock(),
          sideEffectsPersisted: true,
        },
      },
    ]) {
      expect(() =>
        parseWalletSignatureVerificationResult(
          result,
          policy,
          signatureExpectations(),
        ),
      ).toThrow();
    }
  });

  it("keeps cryptographic invalidity distinct from verifier unavailability", () => {
    const policy = parseFinalityPolicy(finalityPolicy());
    expect(
      parseWalletSignatureVerificationResult(
        {
          status: "invalid",
          challengeId: "challenge.1",
          attemptedMethod: "erc1271",
          reasonCode: "wrong-erc1271-magic-value",
        },
        policy,
        signatureExpectations(),
      ),
    ).toEqual({
      status: "invalid",
      challengeId: "challenge.1",
      attemptedMethod: "erc1271",
      reasonCode: "wrong-erc1271-magic-value",
    });
    expect(
      parseWalletSignatureVerificationResult(
        {
          status: "unavailable",
          challengeId: "challenge.1",
          attemptedMethod: "erc1271",
          reasonCode: "rpc-unavailable",
        },
        policy,
        signatureExpectations(),
      ),
    ).toMatchObject({ status: "unavailable", reasonCode: "rpc-unavailable" });
    expect(() =>
      parseWalletSignatureVerificationResult(
        {
          status: "invalid",
          challengeId: "challenge.1",
          attemptedMethod: "not-dispatched",
          reasonCode: "signature-mismatch",
        },
        policy,
        signatureExpectations(),
      ),
    ).toThrow();
  });

  it("rejects every finality policy that silently falls back to confirmations or safe/latest", () => {
    expect(parseFinalityPolicy(finalityPolicy())).toMatchObject({
      blockTag: "finalized",
      allowConfirmationFallback: false,
      onReorg: "revoke-leases-and-rekey",
    });
    for (const mutation of [
      { ...finalityPolicy(), blockTag: "safe" },
      { ...finalityPolicy(), blockTag: "latest" },
      { ...finalityPolicy(), allowConfirmationFallback: true },
      { ...finalityPolicy(), requireBlockHashAgreement: false },
      { ...finalityPolicy(), requireArchiveStateAtReceiptBlock: false },
      { ...finalityPolicy(), onReorg: "keep-existing-leases" },
      { ...finalityPolicy(), minimumProviderQuorum: 0 },
    ]) {
      expect(() => parseFinalityPolicy(mutation)).toThrow();
    }
  });

  it("requires sorted unique provider quorum on a finalized block anchor", () => {
    const policy = parseFinalityPolicy(finalityPolicy());
    expect(
      parseFinalizedBlockAnchor(
        finalizedBlock(),
        policy,
        parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
      ),
    ).toMatchObject({
      blockHash: hash("a"),
    });
    expect(() =>
      parseFinalizedBlockAnchor(
        { ...finalizedBlock(), providerIds: ["provider.b", "provider.a"] },
        policy,
        parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
      ),
    ).toThrow();
    expect(() =>
      parseFinalizedBlockAnchor(
        { ...finalizedBlock(), providerIds: ["provider.a", "provider.a"] },
        policy,
        parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
      ),
    ).toThrow();
    expect(() =>
      parseFinalizedBlockAnchor(
        {
          ...finalizedBlock(),
          finalizedAt: "2026-08-14T12:03:00.001Z",
        },
        policy,
        parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
      ),
    ).toThrow();
  });

  it("models finalized, pending, orphaned, and unavailable without collapsing states", () => {
    const policy = parseFinalityPolicy(finalityPolicy());
    const transactionHash = parseHash32(hash("d"));
    expect(
      parseCanonicalityResult(
        {
          status: "verified-finalized",
          transactionHash,
          anchor: finalizedBlock(),
        },
        policy,
        transactionHash,
        parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
      ),
    ).toMatchObject({ status: "verified-finalized" });
    expect(
      parseCanonicalityResult(
        {
          status: "pending-finality",
          transactionHash,
          chainId: 8453,
          candidateBlockNumber: "123457",
          candidateBlockHash: hash("b"),
          reasonCode: "receipt-above-finalized-head",
        },
        policy,
        transactionHash,
        parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
      ),
    ).toMatchObject({ status: "pending-finality" });
    expect(
      parseCanonicalityResult(
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
      ),
    ).toMatchObject({ status: "orphaned" });
    expect(
      parseCanonicalityResult(
        {
          status: "unavailable",
          transactionHash,
          chainId: 8453,
          reasonCode: "provider-disagreement",
        },
        policy,
        transactionHash,
        parseCanonicalInstant("2026-08-14T12:03:00.000Z"),
      ),
    ).toMatchObject({ status: "unavailable" });
  });
});
