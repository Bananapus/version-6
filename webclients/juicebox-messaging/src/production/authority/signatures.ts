import {
  parseFinalizedBlockAnchor,
  type FinalityPolicy,
  type FinalizedBlockAnchor,
} from "./finality";
import {
  AuthorityValidationError,
  expectExactRecord,
  instantMilliseconds,
  parseAuthorityId,
  parseCanonicalInstant,
  parseEthereumAddress,
  parseHash32,
  parseHexBytes,
  parseJuiceboxV6ChainId,
  type AuthorityId,
  type CanonicalInstant,
  type EthereumAddress,
  type Hash32,
  type HexBytes,
  type JuiceboxV6ChainId,
} from "./valueObjects";

export const ERC1271_MAGIC_VALUE = "0x1626ba7e" as const;
export const ERC1271_CANONICAL_ABI_RETURN =
  `0x1626ba7e${"0".repeat(56)}` as const;
export const ERC6492_DETECTION_SUFFIX =
  "0x6492649264926492649264926492649264926492649264926492649264926492" as const;

export interface WalletSignatureSubmission {
  kind: "wallet-signature-submission.v1";
  challengeId: AuthorityId;
  signature: HexBytes;
}

interface VerifiedSignatureBase {
  status: "verified";
  challengeId: AuthorityId;
  account: EthereumAddress;
  chainId: JuiceboxV6ChainId;
  digest: Hash32;
  verifiedAt: CanonicalInstant;
}

export type WalletSignatureVerificationResult =
  | (VerifiedSignatureBase & {
      method: "eoa";
      chainEvidence: null;
    })
  | (VerifiedSignatureBase & {
      method: "erc1271";
      chainEvidence: {
        standard: "erc1271";
        returnedMagicValue: typeof ERC1271_MAGIC_VALUE;
        canonicalReturnData: typeof ERC1271_CANONICAL_ABI_RETURN;
        block: FinalizedBlockAnchor;
      };
    })
  | (VerifiedSignatureBase & {
      method: "erc6492";
      chainEvidence: {
        standard: "erc6492";
        detectionSuffix: typeof ERC6492_DETECTION_SUFFIX;
        simulationBlock: FinalizedBlockAnchor;
        sideEffectsPersisted: false;
      };
    })
  | {
      status: "invalid";
      challengeId: AuthorityId;
      attemptedMethod: "eoa" | "erc1271" | "erc6492";
      reasonCode:
        | "signature-mismatch"
        | "wrong-erc1271-magic-value"
        | "erc6492-validation-returned-false"
        | "malformed-signature";
    }
  | {
      status: "unavailable";
      challengeId: AuthorityId;
      attemptedMethod: "eoa" | "erc1271" | "erc6492" | "not-dispatched";
      reasonCode:
        | "signature-verifier-not-configured"
        | "rpc-unavailable"
        | "contract-call-reverted"
        | "counterfactual-simulation-unavailable"
        | "provider-disagreement"
        | "malformed-verifier-response";
    };

export type ContractSignatureVerificationResult = Extract<
  WalletSignatureVerificationResult,
  { method: "erc1271" | "erc6492" } | { attemptedMethod: "erc1271" | "erc6492" }
>;

export interface SignatureVerificationExpectations {
  challengeId: AuthorityId;
  account: EthereumAddress;
  chainId: JuiceboxV6ChainId;
  digest: Hash32;
  now: CanonicalInstant;
}

export function parseWalletSignatureSubmission(
  value: unknown,
): WalletSignatureSubmission {
  const record = expectExactRecord(
    value,
    ["kind", "challengeId", "signature"],
    "wallet signature submission",
  );
  if (record.kind !== "wallet-signature-submission.v1") {
    throw invalid("Wallet signature submission kind is unsupported.");
  }
  return {
    kind: "wallet-signature-submission.v1",
    challengeId: parseAuthorityId(record.challengeId, "challengeId"),
    signature: parseHexBytes(record.signature, "wallet signature", {
      minBytes: 64,
      maxBytes: 16 * 1024,
    }),
  };
}

export function parseWalletSignatureVerificationResult(
  value: unknown,
  policy: FinalityPolicy,
  expected: SignatureVerificationExpectations,
): WalletSignatureVerificationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("Wallet signature verification result must be an object.");
  }
  const status = (value as Record<string, unknown>).status;
  if (status === "verified") return parseVerified(value, policy, expected);
  if (status === "invalid") {
    const record = expectExactRecord(
      value,
      ["status", "challengeId", "attemptedMethod", "reasonCode"],
      "invalid signature result",
    );
    const attemptedMethod = parseAttemptedMethod(record.attemptedMethod, false);
    if (attemptedMethod === "not-dispatched") {
      throw invalid("An invalid signature result must name an attempted method.");
    }
    if (
      record.reasonCode !== "signature-mismatch" &&
      record.reasonCode !== "wrong-erc1271-magic-value" &&
      record.reasonCode !== "erc6492-validation-returned-false" &&
      record.reasonCode !== "malformed-signature"
    ) {
      throw invalid("Invalid signature reason is unsupported.");
    }
    const challengeId = parseAuthorityId(record.challengeId, "challengeId");
    if (challengeId !== expected.challengeId) {
      throw invalid("Invalid signature result belongs to another challenge.");
    }
    return {
      status,
      challengeId,
      attemptedMethod,
      reasonCode: record.reasonCode,
    };
  }
  if (status === "unavailable") {
    const record = expectExactRecord(
      value,
      ["status", "challengeId", "attemptedMethod", "reasonCode"],
      "unavailable signature result",
    );
    const attemptedMethod = parseAttemptedMethod(record.attemptedMethod, true);
    if (
      record.reasonCode !== "signature-verifier-not-configured" &&
      record.reasonCode !== "rpc-unavailable" &&
      record.reasonCode !== "contract-call-reverted" &&
      record.reasonCode !== "counterfactual-simulation-unavailable" &&
      record.reasonCode !== "provider-disagreement" &&
      record.reasonCode !== "malformed-verifier-response"
    ) {
      throw invalid("Unavailable signature reason is unsupported.");
    }
    const challengeId = parseAuthorityId(record.challengeId, "challengeId");
    if (challengeId !== expected.challengeId) {
      throw invalid("Unavailable signature result belongs to another challenge.");
    }
    return {
      status,
      challengeId,
      attemptedMethod,
      reasonCode: record.reasonCode,
    };
  }
  throw invalid("Wallet signature verification status is unsupported.");
}

function parseVerified(
  value: unknown,
  policy: FinalityPolicy,
  expected: SignatureVerificationExpectations,
): WalletSignatureVerificationResult {
  const record = expectExactRecord(
    value,
    [
      "status",
      "method",
      "challengeId",
      "account",
      "chainId",
      "digest",
      "verifiedAt",
      "chainEvidence",
    ],
    "verified signature result",
  );
  const base: VerifiedSignatureBase = {
    status: "verified",
    challengeId: parseAuthorityId(record.challengeId, "challengeId"),
    account: parseEthereumAddress(record.account, "verified account"),
    chainId: parseJuiceboxV6ChainId(record.chainId),
    digest: parseHash32(record.digest, "signed digest"),
    verifiedAt: parseCanonicalInstant(record.verifiedAt, "verifiedAt"),
  };
  if (base.chainId !== policy.chainId) {
    throw invalid("Signature verification used the wrong chain policy.");
  }
  if (
    base.challengeId !== expected.challengeId ||
    base.account !== expected.account ||
    base.chainId !== expected.chainId ||
    base.digest !== expected.digest ||
    instantMilliseconds(base.verifiedAt) > instantMilliseconds(expected.now)
  ) {
    throw invalid("Verified signature result does not match the expected challenge input.");
  }
  if (record.method === "eoa") {
    if (record.chainEvidence !== null) {
      throw invalid("EOA verification must not claim contract-chain evidence.");
    }
    return { ...base, method: "eoa", chainEvidence: null };
  }
  if (record.method === "erc1271") {
    const evidence = expectExactRecord(
      record.chainEvidence,
      ["standard", "returnedMagicValue", "canonicalReturnData", "block"],
      "ERC-1271 evidence",
    );
    if (
      evidence.standard !== "erc1271" ||
      evidence.returnedMagicValue !== ERC1271_MAGIC_VALUE ||
      evidence.canonicalReturnData !== ERC1271_CANONICAL_ABI_RETURN
    ) {
      throw invalid("ERC-1271 verification did not return the exact magic value.");
    }
    return {
      ...base,
      method: "erc1271",
      chainEvidence: {
        standard: "erc1271",
        returnedMagicValue: ERC1271_MAGIC_VALUE,
        canonicalReturnData: ERC1271_CANONICAL_ABI_RETURN,
        block: parseFinalizedBlockAnchor(evidence.block, policy, expected.now),
      },
    };
  }
  if (record.method === "erc6492") {
    const evidence = expectExactRecord(
      record.chainEvidence,
      ["standard", "detectionSuffix", "simulationBlock", "sideEffectsPersisted"],
      "ERC-6492 evidence",
    );
    if (
      evidence.standard !== "erc6492" ||
      evidence.detectionSuffix !== ERC6492_DETECTION_SUFFIX ||
      evidence.sideEffectsPersisted !== false
    ) {
      throw invalid("ERC-6492 verification evidence is invalid.");
    }
    return {
      ...base,
      method: "erc6492",
      chainEvidence: {
        standard: "erc6492",
        detectionSuffix: ERC6492_DETECTION_SUFFIX,
        simulationBlock: parseFinalizedBlockAnchor(
          evidence.simulationBlock,
          policy,
          expected.now,
        ),
        sideEffectsPersisted: false,
      },
    };
  }
  throw invalid("Verified signature method is unsupported.");
}

function parseAttemptedMethod(
  value: unknown,
  allowUndispatched: boolean,
): "eoa" | "erc1271" | "erc6492" | "not-dispatched" {
  if (
    value === "eoa" ||
    value === "erc1271" ||
    value === "erc6492" ||
    (allowUndispatched && value === "not-dispatched")
  ) {
    return value;
  }
  throw invalid("Attempted signature method is unsupported.");
}

function invalid(message: string): AuthorityValidationError {
  return new AuthorityValidationError(message);
}
