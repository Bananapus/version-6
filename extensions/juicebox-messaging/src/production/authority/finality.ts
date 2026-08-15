import {
  AuthorityValidationError,
  expectExactRecord,
  instantMilliseconds,
  parseAuthorityId,
  parseCanonicalInstant,
  parseHash32,
  parseJuiceboxV6ChainId,
  parseUint256Decimal,
  type AuthorityId,
  type CanonicalInstant,
  type Hash32,
  type JuiceboxV6ChainId,
  type Uint256Decimal,
} from "./valueObjects";

export interface FinalityPolicy {
  kind: "juicebox-finality-policy.v1";
  policyId: AuthorityId;
  chainId: JuiceboxV6ChainId;
  blockTag: "finalized";
  minimumProviderQuorum: number;
  requireBlockHashAgreement: true;
  requireArchiveStateAtReceiptBlock: true;
  allowConfirmationFallback: false;
  safeHeadUse: "suspend-existing-authority-only";
  onReorg: "revoke-leases-and-rekey";
}

export interface FinalizedBlockAnchor {
  kind: "finalized-block.v1";
  chainId: JuiceboxV6ChainId;
  blockNumber: Uint256Decimal;
  blockHash: Hash32;
  finalizedAt: CanonicalInstant;
  providerIds: readonly [AuthorityId, ...AuthorityId[]];
}

export type CanonicalityResult =
  | {
      status: "verified-finalized";
      transactionHash: Hash32;
      anchor: FinalizedBlockAnchor;
    }
  | {
      status: "pending-finality";
      transactionHash: Hash32;
      chainId: JuiceboxV6ChainId;
      candidateBlockNumber: Uint256Decimal;
      candidateBlockHash: Hash32;
      reasonCode: "receipt-above-finalized-head";
    }
  | {
      status: "orphaned";
      transactionHash: Hash32;
      chainId: JuiceboxV6ChainId;
      formerBlockNumber: Uint256Decimal;
      formerBlockHash: Hash32;
      reasonCode: "block-hash-mismatch" | "receipt-disappeared";
      requiredAction: "revoke-leases-and-rekey";
    }
  | {
      status: "unavailable";
      transactionHash: Hash32;
      chainId: JuiceboxV6ChainId;
      reasonCode:
        | "finality-verifier-not-configured"
        | "rpc-unavailable"
        | "provider-disagreement"
        | "archive-state-unavailable";
    };

export function parseFinalityPolicy(value: unknown): FinalityPolicy {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "policyId",
      "chainId",
      "blockTag",
      "minimumProviderQuorum",
      "requireBlockHashAgreement",
      "requireArchiveStateAtReceiptBlock",
      "allowConfirmationFallback",
      "safeHeadUse",
      "onReorg",
    ],
    "finality policy",
  );
  if (
    record.kind !== "juicebox-finality-policy.v1" ||
    record.blockTag !== "finalized" ||
    record.requireBlockHashAgreement !== true ||
    record.requireArchiveStateAtReceiptBlock !== true ||
    record.allowConfirmationFallback !== false ||
    record.safeHeadUse !== "suspend-existing-authority-only" ||
    record.onReorg !== "revoke-leases-and-rekey"
  ) {
    throw invalid("Finality policy weakens a required production invariant.");
  }
  if (
    typeof record.minimumProviderQuorum !== "number" ||
    !Number.isSafeInteger(record.minimumProviderQuorum) ||
    record.minimumProviderQuorum < 1 ||
    record.minimumProviderQuorum > 5
  ) {
    throw invalid("Finality provider quorum is invalid.");
  }
  return {
    kind: "juicebox-finality-policy.v1",
    policyId: parseAuthorityId(record.policyId, "finality policy ID"),
    chainId: parseJuiceboxV6ChainId(record.chainId),
    blockTag: "finalized",
    minimumProviderQuorum: record.minimumProviderQuorum,
    requireBlockHashAgreement: true,
    requireArchiveStateAtReceiptBlock: true,
    allowConfirmationFallback: false,
    safeHeadUse: "suspend-existing-authority-only",
    onReorg: "revoke-leases-and-rekey",
  };
}

export function parseFinalizedBlockAnchor(
  value: unknown,
  policy: FinalityPolicy,
  now: CanonicalInstant,
): FinalizedBlockAnchor {
  const record = expectExactRecord(
    value,
    ["kind", "chainId", "blockNumber", "blockHash", "finalizedAt", "providerIds"],
    "finalized block anchor",
  );
  if (record.kind !== "finalized-block.v1") {
    throw invalid("Finalized block anchor kind is unsupported.");
  }
  const chainId = parseJuiceboxV6ChainId(record.chainId);
  if (chainId !== policy.chainId) {
    throw invalid("Finalized block anchor is on the wrong chain.");
  }
  const providerIds = parseProviderIds(record.providerIds);
  if (providerIds.length < policy.minimumProviderQuorum) {
    throw invalid("Finalized block anchor does not meet provider quorum.");
  }
  const finalizedAt = parseCanonicalInstant(record.finalizedAt, "finalizedAt");
  if (instantMilliseconds(finalizedAt) > instantMilliseconds(now)) {
    throw invalid("Finalized block anchor cannot be observed in the future.");
  }
  return {
    kind: "finalized-block.v1",
    chainId,
    blockNumber: parseUint256Decimal(record.blockNumber, "blockNumber"),
    blockHash: parseHash32(record.blockHash, "blockHash"),
    finalizedAt,
    providerIds,
  };
}

export function parseCanonicalityResult(
  value: unknown,
  policy: FinalityPolicy,
  expectedTransactionHash: Hash32,
  now: CanonicalInstant,
): CanonicalityResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("Canonicality result must be an object.");
  }
  const status = (value as Record<string, unknown>).status;
  if (status === "verified-finalized") {
    const record = expectExactRecord(
      value,
      ["status", "transactionHash", "anchor"],
      "canonicality result",
    );
    return {
      status,
      transactionHash: expectTransactionHash(
        record.transactionHash,
        expectedTransactionHash,
      ),
      anchor: parseFinalizedBlockAnchor(record.anchor, policy, now),
    };
  }
  if (status === "pending-finality") {
    const record = expectExactRecord(
      value,
      [
        "status",
        "transactionHash",
        "chainId",
        "candidateBlockNumber",
        "candidateBlockHash",
        "reasonCode",
      ],
      "canonicality result",
    );
    if (record.reasonCode !== "receipt-above-finalized-head") {
      throw invalid("Pending finality reason is unsupported.");
    }
    return {
      status,
      transactionHash: expectTransactionHash(
        record.transactionHash,
        expectedTransactionHash,
      ),
      chainId: expectPolicyChain(record.chainId, policy),
      candidateBlockNumber: parseUint256Decimal(
        record.candidateBlockNumber,
        "candidateBlockNumber",
      ),
      candidateBlockHash: parseHash32(
        record.candidateBlockHash,
        "candidateBlockHash",
      ),
      reasonCode: "receipt-above-finalized-head",
    };
  }
  if (status === "orphaned") {
    const record = expectExactRecord(
      value,
      [
        "status",
        "transactionHash",
        "chainId",
        "formerBlockNumber",
        "formerBlockHash",
        "reasonCode",
        "requiredAction",
      ],
      "canonicality result",
    );
    if (
      (record.reasonCode !== "block-hash-mismatch" &&
        record.reasonCode !== "receipt-disappeared") ||
      record.requiredAction !== "revoke-leases-and-rekey"
    ) {
      throw invalid("Orphaned canonicality result is invalid.");
    }
    return {
      status,
      transactionHash: expectTransactionHash(
        record.transactionHash,
        expectedTransactionHash,
      ),
      chainId: expectPolicyChain(record.chainId, policy),
      formerBlockNumber: parseUint256Decimal(
        record.formerBlockNumber,
        "formerBlockNumber",
      ),
      formerBlockHash: parseHash32(record.formerBlockHash, "formerBlockHash"),
      reasonCode: record.reasonCode,
      requiredAction: "revoke-leases-and-rekey",
    };
  }
  if (status === "unavailable") {
    const record = expectExactRecord(
      value,
      ["status", "transactionHash", "chainId", "reasonCode"],
      "canonicality result",
    );
    if (
      record.reasonCode !== "finality-verifier-not-configured" &&
      record.reasonCode !== "rpc-unavailable" &&
      record.reasonCode !== "provider-disagreement" &&
      record.reasonCode !== "archive-state-unavailable"
    ) {
      throw invalid("Unavailable canonicality reason is unsupported.");
    }
    return {
      status,
      transactionHash: expectTransactionHash(
        record.transactionHash,
        expectedTransactionHash,
      ),
      chainId: expectPolicyChain(record.chainId, policy),
      reasonCode: record.reasonCode,
    };
  }
  throw invalid("Canonicality result status is unsupported.");
}

function expectTransactionHash(value: unknown, expected: Hash32): Hash32 {
  const transactionHash = parseHash32(value, "transactionHash");
  if (transactionHash !== expected) {
    throw invalid("Canonicality result belongs to another transaction.");
  }
  return transactionHash;
}

function parseProviderIds(
  value: unknown,
): readonly [AuthorityId, ...AuthorityId[]] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) {
    throw invalid("Finality provider IDs are invalid.");
  }
  const providerIds = value.map((item) => parseAuthorityId(item, "provider ID"));
  if (new Set(providerIds).size !== providerIds.length) {
    throw invalid("Finality provider IDs must be unique.");
  }
  if ([...providerIds].sort().some((item, index) => item !== providerIds[index])) {
    throw invalid("Finality provider IDs must be canonically sorted.");
  }
  return providerIds as [AuthorityId, ...AuthorityId[]];
}

function expectPolicyChain(
  value: unknown,
  policy: FinalityPolicy,
): JuiceboxV6ChainId {
  const chainId = parseJuiceboxV6ChainId(value);
  if (chainId !== policy.chainId) throw invalid("Canonicality result is on the wrong chain.");
  return chainId;
}

function invalid(message: string): AuthorityValidationError {
  return new AuthorityValidationError(message);
}
