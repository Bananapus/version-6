import {
  parseFinalizedBlockAnchor,
  type FinalityPolicy,
  type FinalizedBlockAnchor,
} from "./finality";
import { sha256AuthorityDigest } from "./digests";
import type { DeviceCredential } from "./devices";
import {
  AuthorityValidationError,
  expectExactRecord,
  instantMilliseconds,
  parseAuthorityId,
  parseBase64Url,
  parseCanonicalInstant,
  parseEthereumAddress,
  parseHash32,
  parseJuiceboxV6ProjectRef,
  parseLogIndex,
  parseUint256Decimal,
  sameJuiceboxV6ProjectRef,
  type AuthorityId,
  type Base64Url,
  type CanonicalInstant,
  type EthereumAddress,
  type Hash32,
  type JuiceboxV6ProjectRef,
  type Uint256Decimal,
} from "./valueObjects";

const MAX_DELEGATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export const PROJECT_STAFF_CAPABILITIES = [
  "support:read-messages",
  "support:send-messages",
  "fulfillment:request-address",
  "fulfillment:read-address",
  "fulfillment:acknowledge-address",
  "fulfillment:update-status",
  "fulfillment:set-tracking",
] as const;

export type ProjectStaffCapability =
  (typeof PROJECT_STAFF_CAPABILITIES)[number];

export type AuthorityTransitionCause =
  | "bootstrap"
  | "ordinary-owner-transfer"
  | "project-owner-burned"
  | "revnet-operator-replacement"
  | "revnet-operator-relinquished"
  | "authority-mode-change"
  | "recovery-rotation"
  | "canonical-authority-disabled";

/**
 * Canonical ordering cursor for a finalized authority transition. `logIndex`
 * is the block-global JSON-RPC log index; it is never recomputed from a
 * filtered receipt. The cursor prevents two transitions in the same block
 * (including A -> B -> A) from being collapsed into one observation.
 */
export interface AuthorityTransitionCursor {
  kind: "authority-transition-cursor.v1";
  deploymentManifestId: AuthorityId;
  adapterRevision: AuthorityId;
  sourceId: AuthorityId;
  blockNumber: Uint256Decimal;
  blockHash: Hash32;
  transactionHash: Hash32;
  transactionIndex: number;
  logIndex: number;
  emitter: EthereumAddress;
  eventTopic0: Hash32;
}

export interface AuthorityTransitionSource {
  kind: "authority-transition-source.v1";
  sourceId: AuthorityId;
  deploymentManifestId: AuthorityId;
  adapterRevision: AuthorityId;
  authorityMode: "jbprojects-owner" | "revnet-operator-set";
  transitionCause: AuthorityTransitionCause;
  emitter: EthereumAddress;
  eventTopic0: Hash32;
}

export interface AuthorityTransitionScanCheckpoint {
  kind: "authority-transition-scan-checkpoint.v1";
  checkpointId: AuthorityId;
  project: JuiceboxV6ProjectRef;
  deploymentManifestId: AuthorityId;
  adapterRevision: AuthorityId;
  sourceSetDigest: Hash32;
  previousCheckpointId: AuthorityId | null;
  previousCheckpointDigest: Hash32 | null;
  rangeStartBlockNumber: Uint256Decimal;
  verifiedThroughBlock: FinalizedBlockAnchor;
  rangeTransitionCount: number;
  cumulativeTransitionCount: Uint256Decimal;
  lastGenerationId: AuthorityId;
  lastGenerationSequence: Uint256Decimal;
  lastTransitionCursor: AuthorityTransitionCursor;
  transitionsDigest: Hash32;
  checkpointDigest: Hash32;
}

export interface FinalizedAuthorityTransitionScan {
  kind: "finalized-authority-transition-scan.v1";
  checkpoint: AuthorityTransitionScanCheckpoint;
  generations: readonly AuthorityGeneration[];
}

export interface AuthorityGeneration {
  kind: "project-authority-generation.v1";
  generationId: AuthorityId;
  project: JuiceboxV6ProjectRef;
  sequence: Uint256Decimal;
  transitionCause: AuthorityTransitionCause;
  authorityStatus: "active" | "disabled";
  rootKind: "jbprojects-owner" | "revnet-operator-set" | "no-current-authority";
  rootPrincipal: EthereumAddress | null;
  rootEvidenceId: AuthorityId;
  rootEvidenceDigest: Hash32;
  activatedAtBlock: FinalizedBlockAnchor;
  transitionCursor: AuthorityTransitionCursor;
  predecessorGenerationId: AuthorityId | null;
}

export interface FinalizedAuthorityLossEvidence {
  kind: "finalized-project-authority-loss.v1";
  evidenceId: AuthorityId;
  evidenceDigest: Hash32;
  project: JuiceboxV6ProjectRef;
  predecessorGenerationId: AuthorityId;
  predecessorGenerationSequence: Uint256Decimal;
  predecessorPrincipal: EthereumAddress;
  predecessorRootKind: "jbprojects-owner" | "revnet-operator-set";
  transitionCause:
    | "revnet-operator-relinquished"
    | "project-owner-burned"
    | "canonical-authority-disabled";
  block: FinalizedBlockAnchor;
  transitionCursor: AuthorityTransitionCursor;
  successorTombstone: {
    generationId: AuthorityId;
    sequence: Uint256Decimal;
    transitionCause:
      | "revnet-operator-relinquished"
      | "project-owner-burned"
      | "canonical-authority-disabled";
    authorityStatus: "disabled";
    rootKind: "no-current-authority";
    rootPrincipal: null;
  };
  scannerCheckpointId: AuthorityId;
  scannerCheckpointDigest: Hash32;
  requiredAction: "revoke-leases-delegations-and-rekey";
}

interface RootVerificationCommon {
  evidenceId: AuthorityId;
  evidenceDigest: Hash32;
  project: JuiceboxV6ProjectRef;
  principal: EthereumAddress;
  deploymentManifestId: AuthorityId;
  adapterRevision: AuthorityId;
  block: FinalizedBlockAnchor;
  transitionCursor: AuthorityTransitionCursor;
}

export type RootAuthorityVerificationResult =
  | (RootVerificationCommon & {
      status: "verified";
      role: "project-owner";
      projectsContract: EthereumAddress;
      projectsCodeHash: Hash32;
      block: FinalizedBlockAnchor;
      ownerOfResult: EthereumAddress;
      canonicalRevnetClassification: {
        kind: "ordinary-project-classification.v1";
        result: "not-canonical-revnet";
        evidenceId: AuthorityId;
        evidenceDigest: Hash32;
      };
    })
  | (RootVerificationCommon & {
      status: "verified";
      role: "revnet-operator";
      revDeployer: EthereumAddress;
      revDeployerCodeHash: Hash32;
      revOwner: EthereumAddress;
      revOwnerCodeHash: Hash32;
      revnetConfigurationHash: Hash32;
      ownerOfResult: EthereumAddress;
      isOperatorResult: true;
      deploymentEvidence: {
        kind: "canonical-revnet-deployment.v1";
        deployRevnetEvidenceId: AuthorityId;
        deployRevnetLogDigest: Hash32;
        transactionHash: Hash32;
        logIndex: number;
        emitter: EthereumAddress;
        configurationHash: Hash32;
        revDeployerProjectsResult: EthereumAddress;
        revDeployerOwnerResult: EthereumAddress;
        revOwnerProjectsResult: EthereumAddress;
        revOwnerDeployerResult: EthereumAddress;
      };
    })
  | {
      status: "ineligible";
      project: JuiceboxV6ProjectRef;
      principal: EthereumAddress;
      reasonCode:
        | "not-project-owner"
        | "not-revnet-operator"
        | "not-canonical-revnet"
        | "authority-generation-stale";
    }
  | {
      status: "unavailable";
      project: JuiceboxV6ProjectRef | null;
      principal: EthereumAddress | null;
      reasonCode:
        | "root-authority-verifier-not-configured"
        | "rpc-unavailable"
        | "archive-state-unavailable"
        | "canonical-deployment-configuration-missing"
        | "malformed-chain-response";
    };

export interface RootAuthorityVerificationExpectations {
  project: JuiceboxV6ProjectRef;
  principal: EthereumAddress;
  deploymentManifestId: AuthorityId;
  adapterRevision: AuthorityId;
  projectsCodeHash: Hash32;
  now: CanonicalInstant;
  revnet:
    | null
    | {
        revDeployer: EthereumAddress;
        revDeployerCodeHash: Hash32;
        revOwner: EthereumAddress;
        revOwnerCodeHash: Hash32;
      };
}

export interface ProjectStaffDelegation {
  kind: "project-staff-delegation.v1";
  delegationId: AuthorityId;
  project: JuiceboxV6ProjectRef;
  staffAccount: EthereumAddress;
  installationId: AuthorityId;
  deviceCredentialId: AuthorityId;
  installationAuthJkt: Base64Url;
  mlsCredentialFingerprint: Base64Url;
  deviceRevocationVersion: Uint256Decimal;
  deviceDirectoryEntryDigest: Hash32;
  deviceTransparencyCheckpointDigest: Hash32;
  issuerAccount: EthereumAddress;
  authorityGenerationId: AuthorityId;
  authorityGenerationSequence: Uint256Decimal;
  capabilities: readonly [ProjectStaffCapability, ...ProjectStaffCapability[]];
  delegationAllowed: false;
  issuedAt: CanonicalInstant;
  notBefore: CanonicalInstant;
  expiresAt: CanonicalInstant;
  revision: Uint256Decimal;
  issuerWalletVerificationEvidenceId: AuthorityId;
  delegationPayloadDigest: Hash32;
  delegationSignatureEvidenceId: AuthorityId;
  delegationSignatureEvidenceDigest: Hash32;
  auditRecordId: AuthorityId;
  revokedAt: CanonicalInstant | null;
}

export function parseAuthorityGeneration(
  value: unknown,
  policy: FinalityPolicy,
  now: CanonicalInstant,
): AuthorityGeneration {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "generationId",
      "project",
      "sequence",
      "transitionCause",
      "authorityStatus",
      "rootKind",
      "rootPrincipal",
      "rootEvidenceId",
      "rootEvidenceDigest",
      "activatedAtBlock",
      "transitionCursor",
      "predecessorGenerationId",
    ],
    "authority generation",
  );
  if (record.kind !== "project-authority-generation.v1") {
    throw invalid("Authority generation kind is unsupported.");
  }
  const transitionCause = parseAuthorityTransitionCause(record.transitionCause);
  if (record.authorityStatus !== "active" && record.authorityStatus !== "disabled") {
    throw invalid("Authority generation status is unsupported.");
  }
  if (
    record.rootKind !== "jbprojects-owner" &&
    record.rootKind !== "revnet-operator-set" &&
    record.rootKind !== "no-current-authority"
  ) {
    throw invalid("Authority generation root kind is unsupported.");
  }
  if (
    (record.authorityStatus === "disabled") !==
      (record.rootKind === "no-current-authority") ||
    (record.authorityStatus === "disabled") !== (record.rootPrincipal === null)
  ) {
    throw invalid("Disabled authority generations must be explicit tombstones.");
  }
  const project = parseJuiceboxV6ProjectRef(record.project);
  if (project.chainId !== policy.chainId) {
    throw invalid("Authority generation is on the wrong chain.");
  }
  const predecessorGenerationId =
    record.predecessorGenerationId === null
      ? null
      : parseAuthorityId(record.predecessorGenerationId, "predecessorGenerationId");
  const sequence = parseUint256Decimal(record.sequence, "authority sequence");
  if (
    sequence === "0" ||
    (sequence === "1" &&
      (predecessorGenerationId !== null || transitionCause !== "bootstrap"))
  ) {
    throw invalid("Authority generation sequence or predecessor is invalid.");
  }
  if (
    sequence !== "1" &&
    (predecessorGenerationId === null || transitionCause === "bootstrap")
  ) {
    throw invalid("Non-initial authority generation must name its predecessor.");
  }
  const activatedAtBlock = parseFinalizedBlockAnchor(
    record.activatedAtBlock,
    policy,
    now,
  );
  const transitionCursor = parseAuthorityTransitionCursor(
    record.transitionCursor,
    {
      deploymentManifestId: project.deploymentManifestId,
      block: activatedAtBlock,
    },
  );
  return {
    kind: "project-authority-generation.v1",
    generationId: parseAuthorityId(record.generationId, "generationId"),
    project,
    sequence,
    transitionCause,
    authorityStatus: record.authorityStatus,
    rootKind: record.rootKind,
    rootPrincipal:
      record.rootPrincipal === null
        ? null
        : parseEthereumAddress(record.rootPrincipal, "root principal"),
    rootEvidenceId: parseAuthorityId(record.rootEvidenceId, "rootEvidenceId"),
    rootEvidenceDigest: parseHash32(
      record.rootEvidenceDigest,
      "root evidence digest",
    ),
    activatedAtBlock,
    transitionCursor,
    predecessorGenerationId,
  };
}

export function assertSuccessorAuthorityGeneration(
  previous: AuthorityGeneration,
  next: AuthorityGeneration,
): void {
  const previousBlock = BigInt(previous.activatedAtBlock.blockNumber);
  const nextBlock = BigInt(next.activatedAtBlock.blockNumber);
  if (
    !sameJuiceboxV6ProjectRef(previous.project, next.project) ||
    next.generationId === previous.generationId ||
    next.predecessorGenerationId !== previous.generationId ||
    next.rootEvidenceId === previous.rootEvidenceId ||
    next.rootEvidenceDigest === previous.rootEvidenceDigest ||
    BigInt(next.sequence) !== BigInt(previous.sequence) + 1n ||
    nextBlock < previousBlock
  ) {
    throw invalid(
      "Authority transitions must create a monotonic generation linked to the exact predecessor.",
    );
  }
  assertTransitionCauseMatchesRoots(previous, next);
  if (
    nextBlock === previousBlock &&
    (next.activatedAtBlock.blockHash !== previous.activatedAtBlock.blockHash ||
      compareTransitionCursors(next.transitionCursor, previous.transitionCursor) <= 0)
  ) {
    throw invalid(
      "Same-block authority transitions require the same canonical block hash and a strictly increasing event cursor.",
    );
  }
}

export function assertAuthorityGenerationTransitionEvidence(
  generation: AuthorityGeneration,
  evidence:
    | Extract<RootAuthorityVerificationResult, { status: "verified" }>
    | FinalizedAuthorityLossEvidence,
): void {
  const evidenceBlock = evidence.block;
  const evidenceCursor = evidence.transitionCursor;
  if (
    !sameJuiceboxV6ProjectRef(generation.project, evidence.project) ||
    generation.rootEvidenceId !== evidence.evidenceId ||
    generation.rootEvidenceDigest !== evidence.evidenceDigest ||
    generation.activatedAtBlock.blockNumber !== evidenceBlock.blockNumber ||
    generation.activatedAtBlock.blockHash !== evidenceBlock.blockHash ||
    sha256AuthorityDigest(generation.transitionCursor) !==
      sha256AuthorityDigest(evidenceCursor)
  ) {
    throw invalid("Authority generation is detached from its canonical transition evidence.");
  }
  if ("kind" in evidence) {
    if (
      generation.authorityStatus !== "disabled" ||
      generation.rootKind !== "no-current-authority" ||
      generation.rootPrincipal !== null ||
      generation.generationId !== evidence.successorTombstone.generationId ||
      generation.sequence !== evidence.successorTombstone.sequence ||
      generation.transitionCause !== evidence.successorTombstone.transitionCause ||
      generation.predecessorGenerationId !== evidence.predecessorGenerationId
    ) {
      throw invalid(
        "Authority loss evidence must create its exact disabled successor tombstone.",
      );
    }
    return;
  }
  const expectedRootKind =
    evidence.role === "project-owner"
      ? "jbprojects-owner"
      : "revnet-operator-set";
  if (
    generation.authorityStatus !== "active" ||
    generation.rootKind !== expectedRootKind ||
    generation.rootPrincipal !== evidence.principal
  ) {
    throw invalid("Active authority generation does not match its verified root.");
  }
}

export function parseFinalizedAuthorityLossEvidence(
  value: unknown,
  policy: FinalityPolicy,
  expected: {
    predecessor: AuthorityGeneration;
    scannerCheckpointId: AuthorityId;
    scannerCheckpointDigest: Hash32;
    now: CanonicalInstant;
  },
): FinalizedAuthorityLossEvidence {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "evidenceId",
      "evidenceDigest",
      "project",
      "predecessorGenerationId",
      "predecessorGenerationSequence",
      "predecessorPrincipal",
      "predecessorRootKind",
      "transitionCause",
      "block",
      "transitionCursor",
      "successorTombstone",
      "scannerCheckpointId",
      "scannerCheckpointDigest",
      "requiredAction",
    ],
    "finalized authority loss evidence",
  );
  if (
    record.kind !== "finalized-project-authority-loss.v1" ||
    (record.transitionCause !== "revnet-operator-relinquished" &&
      record.transitionCause !== "project-owner-burned" &&
      record.transitionCause !== "canonical-authority-disabled") ||
    record.requiredAction !== "revoke-leases-delegations-and-rekey"
  ) {
    throw invalid("Finalized authority loss evidence is invalid.");
  }
  const project = parseJuiceboxV6ProjectRef(record.project);
  const predecessorGenerationId = parseAuthorityId(
    record.predecessorGenerationId,
    "authority loss predecessor generation ID",
  );
  const predecessorGenerationSequence = parseUint256Decimal(
    record.predecessorGenerationSequence,
    "authority loss predecessor generation sequence",
  );
  const predecessorPrincipal = parseEthereumAddress(
    record.predecessorPrincipal,
    "previous authority principal",
  );
  if (
    project.chainId !== policy.chainId ||
    !sameJuiceboxV6ProjectRef(project, expected.predecessor.project) ||
    expected.predecessor.authorityStatus !== "active" ||
    expected.predecessor.rootPrincipal === null ||
    predecessorGenerationId !== expected.predecessor.generationId ||
    predecessorGenerationSequence !== expected.predecessor.sequence ||
    predecessorPrincipal !== expected.predecessor.rootPrincipal ||
    record.predecessorRootKind !== expected.predecessor.rootKind ||
    (record.predecessorRootKind !== "jbprojects-owner" &&
      record.predecessorRootKind !== "revnet-operator-set")
  ) {
    throw invalid("Authority loss evidence is detached from its exact predecessor.");
  }
  if (
    (record.transitionCause === "revnet-operator-relinquished" &&
      record.predecessorRootKind !== "revnet-operator-set") ||
    (record.transitionCause === "project-owner-burned" &&
      record.predecessorRootKind !== "jbprojects-owner")
  ) {
    throw invalid("Authority loss cause does not match the predecessor authority mode.");
  }
  const block = parseFinalizedBlockAnchor(record.block, policy, expected.now);
  const transitionCursor = parseAuthorityTransitionCursor(record.transitionCursor, {
    deploymentManifestId: project.deploymentManifestId,
    block,
  });
  const successorRecord = expectExactRecord(
    record.successorTombstone,
    [
      "generationId",
      "sequence",
      "transitionCause",
      "authorityStatus",
      "rootKind",
      "rootPrincipal",
    ],
    "authority loss successor tombstone",
  );
  if (
    successorRecord.authorityStatus !== "disabled" ||
    successorRecord.rootKind !== "no-current-authority" ||
    successorRecord.rootPrincipal !== null ||
    successorRecord.transitionCause !== record.transitionCause
  ) {
    throw invalid("Authority loss successor must be an explicit disabled tombstone.");
  }
  const successorTombstone = {
    generationId: parseAuthorityId(
      successorRecord.generationId,
      "authority loss successor generation ID",
    ),
    sequence: parseUint256Decimal(
      successorRecord.sequence,
      "authority loss successor generation sequence",
    ),
    transitionCause:
      record.transitionCause as FinalizedAuthorityLossEvidence["transitionCause"],
    authorityStatus: "disabled" as const,
    rootKind: "no-current-authority" as const,
    rootPrincipal: null,
  };
  if (
    successorTombstone.generationId === predecessorGenerationId ||
    BigInt(successorTombstone.sequence) !==
      BigInt(predecessorGenerationSequence) + 1n ||
    compareBlockAndTransitionCursor(
      block,
      transitionCursor,
      expected.predecessor.activatedAtBlock,
      expected.predecessor.transitionCursor,
    ) <= 0
  ) {
    throw invalid("Authority loss successor does not follow its exact predecessor.");
  }
  const scannerCheckpointId = parseAuthorityId(
    record.scannerCheckpointId,
    "authority scanner checkpoint ID",
  );
  const scannerCheckpointDigest = parseHash32(
    record.scannerCheckpointDigest,
    "authority scanner checkpoint digest",
  );
  if (
    scannerCheckpointId !== expected.scannerCheckpointId ||
    scannerCheckpointDigest !== expected.scannerCheckpointDigest
  ) {
    throw invalid("Authority loss evidence uses another scanner checkpoint.");
  }
  const parsedWithoutEvidenceDigest = {
    kind: "finalized-project-authority-loss.v1",
    evidenceId: parseAuthorityId(record.evidenceId, "authority loss evidence ID"),
    project,
    predecessorGenerationId,
    predecessorGenerationSequence,
    predecessorPrincipal,
    predecessorRootKind: record.predecessorRootKind,
    transitionCause:
      record.transitionCause as FinalizedAuthorityLossEvidence["transitionCause"],
    block,
    transitionCursor,
    successorTombstone,
    scannerCheckpointId,
    scannerCheckpointDigest,
    requiredAction: "revoke-leases-delegations-and-rekey" as const,
  } as const;
  const evidenceDigest = parseHash32(record.evidenceDigest, "authority loss digest");
  if (
    evidenceDigest !==
    sha256AuthorityDigest({
      kind: "finalized-project-authority-loss-evidence.v1",
      evidence: parsedWithoutEvidenceDigest,
    })
  ) {
    throw invalid("Authority loss evidence digest is not canonical.");
  }
  return { ...parsedWithoutEvidenceDigest, evidenceDigest };
}

export function parseRootAuthorityVerificationResult(
  value: unknown,
  policy: FinalityPolicy,
  expected: RootAuthorityVerificationExpectations,
): RootAuthorityVerificationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("Root authority result must be an object.");
  }
  const status = (value as Record<string, unknown>).status;
  if (status === "verified") return parseVerifiedRoot(value, policy, expected);
  if (status === "ineligible" || status === "unavailable") {
    const record = expectExactRecord(
      value,
      ["status", "project", "principal", "reasonCode"],
      "root authority result",
    );
    if (status === "ineligible") {
      const project = parseJuiceboxV6ProjectRef(record.project);
      if (project.chainId !== policy.chainId) {
        throw invalid("Root authority result is on the wrong chain.");
      }
      const principal = parseEthereumAddress(record.principal, "authority principal");
      if (
        !sameJuiceboxV6ProjectRef(project, expected.project) ||
        principal !== expected.principal
      ) {
        throw invalid("Root authority result belongs to another request.");
      }
      if (
        record.reasonCode !== "not-project-owner" &&
        record.reasonCode !== "not-revnet-operator" &&
        record.reasonCode !== "not-canonical-revnet" &&
        record.reasonCode !== "authority-generation-stale"
      ) {
        throw invalid("Root authority ineligibility reason is unsupported.");
      }
      return { status, project, principal, reasonCode: record.reasonCode };
    }
    if (
      record.reasonCode !== "root-authority-verifier-not-configured" &&
      record.reasonCode !== "rpc-unavailable" &&
      record.reasonCode !== "archive-state-unavailable" &&
      record.reasonCode !== "canonical-deployment-configuration-missing" &&
      record.reasonCode !== "malformed-chain-response"
    ) {
      throw invalid("Root authority unavailability reason is unsupported.");
    }
    const project =
      record.project === null ? null : parseJuiceboxV6ProjectRef(record.project);
    const principal =
      record.principal === null
        ? null
        : parseEthereumAddress(record.principal, "authority principal");
    if (
      record.reasonCode !== "root-authority-verifier-not-configured" &&
      (project === null || principal === null)
    ) {
      throw invalid("Configured root verifier failures must retain request scope.");
    }
    if (project !== null && project.chainId !== policy.chainId) {
      throw invalid("Root authority result is on the wrong chain.");
    }
    return { status, project, principal, reasonCode: record.reasonCode };
  }
  throw invalid("Root authority result status is unsupported.");
}

export function parseProjectStaffDelegation(
  value: unknown,
  expected: {
    generation: AuthorityGeneration;
    deviceCredential: DeviceCredential;
    delegationSignatureEvidenceId: AuthorityId;
    delegationSignatureEvidenceDigest: Hash32;
    now: CanonicalInstant;
  },
): ProjectStaffDelegation {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "delegationId",
      "project",
      "staffAccount",
      "installationId",
      "deviceCredentialId",
      "installationAuthJkt",
      "mlsCredentialFingerprint",
      "deviceRevocationVersion",
      "deviceDirectoryEntryDigest",
      "deviceTransparencyCheckpointDigest",
      "issuerAccount",
      "authorityGenerationId",
      "authorityGenerationSequence",
      "capabilities",
      "delegationAllowed",
      "issuedAt",
      "notBefore",
      "expiresAt",
      "revision",
      "issuerWalletVerificationEvidenceId",
      "delegationPayloadDigest",
      "delegationSignatureEvidenceId",
      "delegationSignatureEvidenceDigest",
      "auditRecordId",
      "revokedAt",
    ],
    "project staff delegation",
  );
  if (
    record.kind !== "project-staff-delegation.v1" ||
    record.delegationAllowed !== false
  ) {
    throw invalid("Project staff delegation must be non-transitive.");
  }
  const project = parseJuiceboxV6ProjectRef(record.project);
  const authorityGenerationId = parseAuthorityId(
    record.authorityGenerationId,
    "authorityGenerationId",
  );
  const authorityGenerationSequence = parseUint256Decimal(
    record.authorityGenerationSequence,
    "authorityGenerationSequence",
  );
  const issuerAccount = parseEthereumAddress(record.issuerAccount, "issuer account");
  const staffAccount = parseEthereumAddress(record.staffAccount, "staff account");
  const installationId = parseAuthorityId(
    record.installationId,
    "installationId",
  );
  const deviceCredentialId = parseAuthorityId(
    record.deviceCredentialId,
    "deviceCredentialId",
  );
  const deviceRevocationVersion = parseUint256Decimal(
    record.deviceRevocationVersion,
    "deviceRevocationVersion",
  );
  const installationAuthJkt = parseBase64Url(
    record.installationAuthJkt,
    "delegated installation auth JKT",
    { minLength: 43, maxLength: 43 },
  );
  if (
    expected.generation.authorityStatus !== "active" ||
    expected.generation.rootPrincipal === null ||
    !sameJuiceboxV6ProjectRef(project, expected.generation.project) ||
    authorityGenerationId !== expected.generation.generationId ||
    authorityGenerationSequence !== expected.generation.sequence ||
    issuerAccount !== expected.generation.rootPrincipal ||
    staffAccount !== expected.deviceCredential.account ||
    installationId !== expected.deviceCredential.device.installationId ||
    deviceCredentialId !== expected.deviceCredential.credentialId ||
    installationAuthJkt !==
      expected.deviceCredential.device.installationAuthKey.jwkThumbprint ||
    record.mlsCredentialFingerprint !==
      expected.deviceCredential.device.mlsCredentialKey.credentialFingerprint ||
    deviceRevocationVersion !== expected.deviceCredential.revocationVersion
  ) {
    throw invalid("Project staff delegation is bound to a stale or different authority.");
  }
  const issuedAt = parseCanonicalInstant(record.issuedAt, "issuedAt");
  const notBefore = parseCanonicalInstant(record.notBefore, "notBefore");
  const expiresAt = parseCanonicalInstant(record.expiresAt, "expiresAt");
  const issuedMs = instantMilliseconds(issuedAt);
  const notBeforeMs = instantMilliseconds(notBefore);
  const expiresMs = instantMilliseconds(expiresAt);
  const nowMs = instantMilliseconds(expected.now);
  if (
    notBeforeMs < issuedMs ||
    expiresMs <= notBeforeMs ||
    expiresMs - issuedMs > MAX_DELEGATION_LIFETIME_MS
  ) {
    throw invalid("Project staff delegation lifetime is invalid or too long.");
  }
  const revokedAt =
    record.revokedAt === null
      ? null
      : parseCanonicalInstant(record.revokedAt, "revokedAt");
  if (revokedAt !== null && instantMilliseconds(revokedAt) < issuedMs) {
    throw invalid("Project staff delegation revocation predates issuance.");
  }
  if (revokedAt !== null || nowMs < notBeforeMs || nowMs >= expiresMs) {
    throw invalid("Project staff delegation is not currently active.");
  }
  const delegationSignatureEvidenceId = parseAuthorityId(
    record.delegationSignatureEvidenceId,
    "delegation signature evidence ID",
  );
  const delegationSignatureEvidenceDigest = parseHash32(
    record.delegationSignatureEvidenceDigest,
    "delegation signature evidence digest",
  );
  if (
    delegationSignatureEvidenceId !==
      expected.delegationSignatureEvidenceId ||
    delegationSignatureEvidenceDigest !==
      expected.delegationSignatureEvidenceDigest
  ) {
    throw invalid("Staff delegation does not use the trusted signature proof.");
  }
  const parsedWithoutPayloadDigest = {
    kind: "project-staff-delegation.v1",
    delegationId: parseAuthorityId(record.delegationId, "delegationId"),
    project,
    staffAccount,
    installationId,
    deviceCredentialId,
    installationAuthJkt,
    mlsCredentialFingerprint: parseBase64Url(
      record.mlsCredentialFingerprint,
      "delegated MLS credential fingerprint",
      { minLength: 43, maxLength: 43 },
    ),
    deviceRevocationVersion,
    deviceDirectoryEntryDigest: parseHash32(
      record.deviceDirectoryEntryDigest,
      "device directory entry digest",
    ),
    deviceTransparencyCheckpointDigest: parseHash32(
      record.deviceTransparencyCheckpointDigest,
      "device transparency checkpoint digest",
    ),
    issuerAccount,
    authorityGenerationId,
    authorityGenerationSequence,
    capabilities: parseCapabilities(record.capabilities),
    delegationAllowed: false,
    issuedAt,
    notBefore,
    expiresAt,
    revision: parseUint256Decimal(record.revision, "delegation revision"),
    issuerWalletVerificationEvidenceId: parseAuthorityId(
      record.issuerWalletVerificationEvidenceId,
      "issuer wallet verification evidence ID",
    ),
    delegationSignatureEvidenceId,
    delegationSignatureEvidenceDigest,
    auditRecordId: parseAuthorityId(record.auditRecordId, "delegation audit record ID"),
    revokedAt,
  } as const;
  const delegationPayloadDigest = parseHash32(
    record.delegationPayloadDigest,
    "delegation payload digest",
  );
  if (
    delegationPayloadDigest !==
    sha256AuthorityDigest({
      kind: "project-staff-delegation-payload.v1",
      delegation: parsedWithoutPayloadDigest,
    })
  ) {
    throw invalid("Staff delegation payload digest is not canonical.");
  }
  return { ...parsedWithoutPayloadDigest, delegationPayloadDigest };
}

function parseVerifiedRoot(
  value: unknown,
  policy: FinalityPolicy,
  expected: RootAuthorityVerificationExpectations,
): RootAuthorityVerificationResult {
  const role = (value as Record<string, unknown>).role;
  if (role === "project-owner") {
    const record = expectExactRecord(
      value,
      [
        "status",
        "role",
        "evidenceId",
        "evidenceDigest",
        "project",
        "principal",
        "deploymentManifestId",
        "adapterRevision",
        "projectsContract",
        "projectsCodeHash",
        "block",
        "transitionCursor",
        "ownerOfResult",
        "canonicalRevnetClassification",
      ],
      "verified project owner",
    );
    const common = parseVerifiedRootCommon(record, policy, expected);
    const ownerOfResult = parseEthereumAddress(record.ownerOfResult, "ownerOf result");
    const projectsContract = parseEthereumAddress(
      record.projectsContract,
      "JBProjects contract",
    );
    if (ownerOfResult !== common.principal) {
      throw invalid("Verified project owner does not match ownerOf.");
    }
    if (projectsContract !== common.project.projectsContract) {
      throw invalid("ownerOf was read from another JBProjects deployment.");
    }
    if (
      expected.revnet !== null ||
      parseHash32(record.projectsCodeHash, "JBProjects code hash") !==
        expected.projectsCodeHash
    ) {
      throw invalid("Ordinary owner evidence does not match the approved deployment.");
    }
    const classificationRecord = expectExactRecord(
      record.canonicalRevnetClassification,
      ["kind", "result", "evidenceId", "evidenceDigest"],
      "ordinary project classification",
    );
    if (
      classificationRecord.kind !== "ordinary-project-classification.v1" ||
      classificationRecord.result !== "not-canonical-revnet"
    ) {
      throw invalid("Ordinary owner authority requires canonical Revnet exclusion.");
    }
    return {
      status: "verified",
      role,
      ...common,
      projectsContract,
      projectsCodeHash: parseHash32(record.projectsCodeHash, "JBProjects code hash"),
      ownerOfResult,
      canonicalRevnetClassification: {
        kind: "ordinary-project-classification.v1",
        result: "not-canonical-revnet",
        evidenceId: parseAuthorityId(
          classificationRecord.evidenceId,
          "Revnet classification evidence ID",
        ),
        evidenceDigest: parseHash32(
          classificationRecord.evidenceDigest,
          "Revnet classification evidence digest",
        ),
      },
    };
  }
  if (role === "revnet-operator") {
    const record = expectExactRecord(
      value,
      [
        "status",
        "role",
        "evidenceId",
        "evidenceDigest",
        "project",
        "principal",
        "deploymentManifestId",
        "adapterRevision",
        "revDeployer",
        "revDeployerCodeHash",
        "revOwner",
        "revOwnerCodeHash",
        "revnetConfigurationHash",
        "block",
        "transitionCursor",
        "ownerOfResult",
        "isOperatorResult",
        "deploymentEvidence",
      ],
      "verified revnet operator",
    );
    if (record.isOperatorResult !== true) {
      throw invalid("Verified revnet operator must have a true operator result.");
    }
    const common = parseVerifiedRootCommon(record, policy, expected);
    const revOwner = parseEthereumAddress(record.revOwner, "canonical REVOwner");
    const revDeployer = parseEthereumAddress(
      record.revDeployer,
      "canonical REVDeployer",
    );
    const ownerOfResult = parseEthereumAddress(record.ownerOfResult, "ownerOf result");
    if (ownerOfResult !== revOwner) {
      throw invalid("Revnet project owner must be the canonical REVOwner contract.");
    }
    const configurationHash = parseHash32(
      record.revnetConfigurationHash,
      "revnet configuration hash",
    );
    const deployment = parseRevnetDeploymentEvidence(record.deploymentEvidence);
    if (
      expected.revnet === null ||
      revDeployer !== expected.revnet.revDeployer ||
      parseHash32(record.revDeployerCodeHash, "REVDeployer code hash") !==
        expected.revnet.revDeployerCodeHash ||
      revOwner !== expected.revnet.revOwner ||
      parseHash32(record.revOwnerCodeHash, "REVOwner code hash") !==
        expected.revnet.revOwnerCodeHash ||
      deployment.emitter !== revDeployer ||
      deployment.configurationHash !== configurationHash ||
      deployment.revDeployerProjectsResult !== common.project.projectsContract ||
      deployment.revDeployerOwnerResult !== revOwner ||
      deployment.revOwnerProjectsResult !== common.project.projectsContract ||
      deployment.revOwnerDeployerResult !== revDeployer
    ) {
      throw invalid("Revnet deployment relationships do not match the canonical manifest.");
    }
    return {
      status: "verified",
      role,
      ...common,
      revDeployer,
      revDeployerCodeHash: parseHash32(
        record.revDeployerCodeHash,
        "REVDeployer code hash",
      ),
      revOwner,
      revOwnerCodeHash: parseHash32(record.revOwnerCodeHash, "REVOwner code hash"),
      revnetConfigurationHash: configurationHash,
      ownerOfResult,
      isOperatorResult: true,
      deploymentEvidence: deployment,
    };
  }
  throw invalid("Verified root authority role is unsupported.");
}

function parseVerifiedRootCommon(
  record: Record<string, unknown>,
  policy: FinalityPolicy,
  expected: RootAuthorityVerificationExpectations,
): {
  evidenceId: AuthorityId;
  evidenceDigest: Hash32;
  project: JuiceboxV6ProjectRef;
  principal: EthereumAddress;
  deploymentManifestId: AuthorityId;
  adapterRevision: AuthorityId;
  block: FinalizedBlockAnchor;
  transitionCursor: AuthorityTransitionCursor;
} {
  const project = parseJuiceboxV6ProjectRef(record.project);
  if (project.chainId !== policy.chainId) {
    throw invalid("Root authority evidence is on the wrong chain.");
  }
  const deploymentManifestId = parseAuthorityId(
    record.deploymentManifestId,
    "root deployment manifest ID",
  );
  if (deploymentManifestId !== project.deploymentManifestId) {
    throw invalid("Root authority evidence used another deployment manifest.");
  }
  const principal = parseEthereumAddress(record.principal, "authority principal");
  const adapterRevision = parseAuthorityId(
    record.adapterRevision,
    "root adapter revision",
  );
  if (
    !sameJuiceboxV6ProjectRef(project, expected.project) ||
    principal !== expected.principal ||
    deploymentManifestId !== expected.deploymentManifestId ||
    adapterRevision !== expected.adapterRevision
  ) {
    throw invalid("Root authority evidence does not match trusted server expectations.");
  }
  const block = parseFinalizedBlockAnchor(record.block, policy, expected.now);
  return {
    evidenceId: parseAuthorityId(record.evidenceId, "root evidence ID"),
    evidenceDigest: parseHash32(record.evidenceDigest, "root evidence digest"),
    project,
    principal,
    deploymentManifestId,
    adapterRevision,
    block,
    transitionCursor: parseAuthorityTransitionCursor(record.transitionCursor, {
      deploymentManifestId,
      adapterRevision,
      block,
    }),
  };
}

export function parseAuthorityTransitionSourceSet(
  value: unknown,
  expected: {
    deploymentManifestId: AuthorityId;
    adapterRevision: AuthorityId;
  },
): readonly [AuthorityTransitionSource, ...AuthorityTransitionSource[]] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) {
    throw invalid("Authority transition source set is outside its safe bound.");
  }
  const sources = value.map((item) => {
    const record = expectExactRecord(
      item,
      [
        "kind",
        "sourceId",
        "deploymentManifestId",
        "adapterRevision",
        "authorityMode",
        "transitionCause",
        "emitter",
        "eventTopic0",
      ],
      "authority transition source",
    );
    if (
      record.kind !== "authority-transition-source.v1" ||
      (record.authorityMode !== "jbprojects-owner" &&
        record.authorityMode !== "revnet-operator-set")
    ) {
      throw invalid("Authority transition source is unsupported.");
    }
    const deploymentManifestId = parseAuthorityId(
      record.deploymentManifestId,
      "transition source deployment manifest ID",
    );
    const adapterRevision = parseAuthorityId(
      record.adapterRevision,
      "transition source adapter revision",
    );
    if (
      deploymentManifestId !== expected.deploymentManifestId ||
      adapterRevision !== expected.adapterRevision
    ) {
      throw invalid("Authority transition source is not manifest-pinned.");
    }
    return {
      kind: "authority-transition-source.v1" as const,
      sourceId: parseAuthorityId(record.sourceId, "authority transition source ID"),
      deploymentManifestId,
      adapterRevision,
      authorityMode: record.authorityMode,
      transitionCause: parseAuthorityTransitionCause(record.transitionCause),
      emitter: parseEthereumAddress(record.emitter, "authority transition emitter"),
      eventTopic0: parseHash32(record.eventTopic0, "authority transition topic0"),
    };
  });
  if (
    new Set(sources.map(({ sourceId }) => sourceId)).size !== sources.length ||
    [...sources]
      .sort((left, right) => left.sourceId.localeCompare(right.sourceId))
      .some(({ sourceId }, index) => sourceId !== sources[index]?.sourceId)
  ) {
    throw invalid("Authority transition sources must be unique and sorted by ID.");
  }
  return sources as [AuthorityTransitionSource, ...AuthorityTransitionSource[]];
}

export function computeAuthorityTransitionSourceSetDigest(
  sources: readonly AuthorityTransitionSource[],
): Hash32 {
  return sha256AuthorityDigest({
    kind: "authority-transition-source-set.v1",
    sources,
  });
}

export function parseFinalizedAuthorityTransitionScan(
  value: unknown,
  policy: FinalityPolicy,
  expected: {
    project: JuiceboxV6ProjectRef;
    adapterRevision: AuthorityId;
    sources: readonly [AuthorityTransitionSource, ...AuthorityTransitionSource[]];
    previousCheckpoint: AuthorityTransitionScanCheckpoint | null;
    previousGeneration: AuthorityGeneration | null;
    initialRangeStartBlockNumber: Uint256Decimal;
    verifiedThroughBlock: FinalizedBlockAnchor;
    now: CanonicalInstant;
  },
): FinalizedAuthorityTransitionScan {
  const scanRecord = expectExactRecord(
    value,
    ["kind", "checkpoint", "generations"],
    "finalized authority transition scan",
  );
  if (scanRecord.kind !== "finalized-authority-transition-scan.v1") {
    throw invalid("Finalized authority transition scan kind is unsupported.");
  }
  if (
    !Array.isArray(scanRecord.generations) ||
    scanRecord.generations.length > 10_000
  ) {
    throw invalid("Authority transition scan result is outside its safe bound.");
  }
  const checkpointRecord = expectExactRecord(
    scanRecord.checkpoint,
    [
      "kind",
      "checkpointId",
      "project",
      "deploymentManifestId",
      "adapterRevision",
      "sourceSetDigest",
      "previousCheckpointId",
      "previousCheckpointDigest",
      "rangeStartBlockNumber",
      "verifiedThroughBlock",
      "rangeTransitionCount",
      "cumulativeTransitionCount",
      "lastGenerationId",
      "lastGenerationSequence",
      "lastTransitionCursor",
      "transitionsDigest",
      "checkpointDigest",
    ],
    "authority transition scan checkpoint",
  );
  if (checkpointRecord.kind !== "authority-transition-scan-checkpoint.v1") {
    throw invalid("Authority transition checkpoint kind is unsupported.");
  }
  const project = parseJuiceboxV6ProjectRef(checkpointRecord.project);
  const deploymentManifestId = parseAuthorityId(
    checkpointRecord.deploymentManifestId,
    "transition checkpoint deployment manifest ID",
  );
  const adapterRevision = parseAuthorityId(
    checkpointRecord.adapterRevision,
    "transition checkpoint adapter revision",
  );
  const sourceSetDigest = parseHash32(
    checkpointRecord.sourceSetDigest,
    "transition source-set digest",
  );
  if (
    !sameJuiceboxV6ProjectRef(project, expected.project) ||
    project.chainId !== policy.chainId ||
    deploymentManifestId !== project.deploymentManifestId ||
    deploymentManifestId !== expected.project.deploymentManifestId ||
    adapterRevision !== expected.adapterRevision ||
    sourceSetDigest !== computeAuthorityTransitionSourceSetDigest(expected.sources)
  ) {
    throw invalid("Authority transition checkpoint is not manifest-pinned.");
  }
  const previousCheckpointId =
    checkpointRecord.previousCheckpointId === null
      ? null
      : parseAuthorityId(
          checkpointRecord.previousCheckpointId,
          "previous transition checkpoint ID",
        );
  const previousCheckpointDigest =
    checkpointRecord.previousCheckpointDigest === null
      ? null
      : parseHash32(
          checkpointRecord.previousCheckpointDigest,
          "previous transition checkpoint digest",
        );
  const expectedRangeStart =
    expected.previousCheckpoint === null
      ? expected.initialRangeStartBlockNumber
      : (BigInt(expected.previousCheckpoint.verifiedThroughBlock.blockNumber) + 1n).toString();
  const rangeStartBlockNumber = parseUint256Decimal(
    checkpointRecord.rangeStartBlockNumber,
    "transition scan range start",
  );
  if (
    (expected.previousCheckpoint === null &&
      (previousCheckpointId !== null || previousCheckpointDigest !== null)) ||
    (expected.previousCheckpoint !== null &&
      (previousCheckpointId !== expected.previousCheckpoint.checkpointId ||
        previousCheckpointDigest !== expected.previousCheckpoint.checkpointDigest ||
        expected.previousCheckpoint.sourceSetDigest !== sourceSetDigest ||
        !sameJuiceboxV6ProjectRef(expected.previousCheckpoint.project, project))) ||
    rangeStartBlockNumber !== expectedRangeStart
  ) {
    throw invalid("Authority transition scan has a checkpoint gap or replay.");
  }
  const verifiedThroughBlock = parseFinalizedBlockAnchor(
    checkpointRecord.verifiedThroughBlock,
    policy,
    expected.now,
  );
  if (
    sha256AuthorityDigest(verifiedThroughBlock) !==
      sha256AuthorityDigest(expected.verifiedThroughBlock) ||
    BigInt(verifiedThroughBlock.blockNumber) < BigInt(rangeStartBlockNumber)
  ) {
    throw invalid("Authority transition scan ended at another finalized head.");
  }
  if (
    (expected.previousCheckpoint === null) !==
    (expected.previousGeneration === null)
  ) {
    throw invalid(
      "Authority transition checkpoint and predecessor generation must advance together.",
    );
  }
  if (
    expected.previousCheckpoint !== null &&
    expected.previousGeneration !== null &&
    (!sameJuiceboxV6ProjectRef(
      expected.previousCheckpoint.project,
      expected.previousGeneration.project,
    ) ||
      expected.previousCheckpoint.deploymentManifestId !==
        expected.previousGeneration.project.deploymentManifestId ||
      expected.previousCheckpoint.lastGenerationId !==
        expected.previousGeneration.generationId ||
      expected.previousCheckpoint.lastGenerationSequence !==
        expected.previousGeneration.sequence ||
      sha256AuthorityDigest(expected.previousCheckpoint.lastTransitionCursor) !==
        sha256AuthorityDigest(expected.previousGeneration.transitionCursor))
  ) {
    throw invalid(
      "Authority transition checkpoint is detached from its exact predecessor generation.",
    );
  }
  let priorGeneration = expected.previousGeneration;
  const generations = scanRecord.generations.map((item) => {
    const generation = parseAuthorityGeneration(item, policy, expected.now);
    const blockNumber = BigInt(generation.activatedAtBlock.blockNumber);
    if (
      blockNumber < BigInt(rangeStartBlockNumber) ||
      blockNumber > BigInt(verifiedThroughBlock.blockNumber)
    ) {
      throw invalid("Authority transition falls outside the gap-free scan range.");
    }
    if (priorGeneration === null) {
      if (generation.sequence !== "1" || generation.predecessorGenerationId !== null) {
        throw invalid("Initial authority scan must begin with generation one.");
      }
    } else {
      assertSuccessorAuthorityGeneration(priorGeneration, generation);
    }
    const source = expected.sources.find(
      ({ sourceId }) => sourceId === generation.transitionCursor.sourceId,
    );
    const expectedMode =
      generation.authorityStatus === "active"
        ? generation.rootKind
        : priorGeneration?.rootKind;
    if (
      source === undefined ||
      source.deploymentManifestId !== generation.transitionCursor.deploymentManifestId ||
      source.adapterRevision !== generation.transitionCursor.adapterRevision ||
      source.emitter !== generation.transitionCursor.emitter ||
      source.eventTopic0 !== generation.transitionCursor.eventTopic0 ||
      source.transitionCause !== generation.transitionCause ||
      source.authorityMode !== expectedMode
    ) {
      throw invalid("Authority transition does not match a pinned manifest source.");
    }
    priorGeneration = generation;
    return generation;
  });
  if (priorGeneration === null) {
    throw invalid("Initial authority transition scan cannot omit the root generation.");
  }
  const rangeTransitionCount = parseSafeCount(
    checkpointRecord.rangeTransitionCount,
    "range transition count",
    10_000,
  );
  const cumulativeTransitionCount = parseUint256Decimal(
    checkpointRecord.cumulativeTransitionCount,
    "cumulative transition count",
  );
  const expectedCumulativeCount =
    BigInt(expected.previousCheckpoint?.cumulativeTransitionCount ?? "0") +
    BigInt(generations.length);
  const transitionsDigest = parseHash32(
    checkpointRecord.transitionsDigest,
    "authority transitions digest",
  );
  if (
    rangeTransitionCount !== generations.length ||
    BigInt(cumulativeTransitionCount) !== expectedCumulativeCount ||
    checkpointRecord.lastGenerationId !== priorGeneration.generationId ||
    checkpointRecord.lastGenerationSequence !== priorGeneration.sequence ||
    transitionsDigest !==
      sha256AuthorityDigest({
        kind: "finalized-authority-transitions.v1",
        generations,
      })
  ) {
    throw invalid("Authority transition checkpoint omits or rewrites transition history.");
  }
  const lastTransitionCursor = parseAuthorityTransitionCursor(
    checkpointRecord.lastTransitionCursor,
    {
      deploymentManifestId,
      block: priorGeneration.activatedAtBlock,
    },
  );
  if (
    sha256AuthorityDigest(lastTransitionCursor) !==
    sha256AuthorityDigest(priorGeneration.transitionCursor)
  ) {
    throw invalid("Authority transition checkpoint names another final cursor.");
  }
  const parsedWithoutDigest = {
    kind: "authority-transition-scan-checkpoint.v1" as const,
    checkpointId: parseAuthorityId(
      checkpointRecord.checkpointId,
      "authority transition checkpoint ID",
    ),
    project,
    deploymentManifestId,
    adapterRevision,
    sourceSetDigest,
    previousCheckpointId,
    previousCheckpointDigest,
    rangeStartBlockNumber,
    verifiedThroughBlock,
    rangeTransitionCount,
    cumulativeTransitionCount,
    lastGenerationId: priorGeneration.generationId,
    lastGenerationSequence: priorGeneration.sequence,
    lastTransitionCursor,
    transitionsDigest,
  };
  if (
    expected.previousCheckpoint?.checkpointId === parsedWithoutDigest.checkpointId
  ) {
    throw invalid("Authority transition checkpoint ID cannot be replayed.");
  }
  const checkpointDigest = parseHash32(
    checkpointRecord.checkpointDigest,
    "authority transition checkpoint digest",
  );
  if (
    checkpointDigest !==
    sha256AuthorityDigest({
      kind: "authority-transition-scan-checkpoint-digest.v1",
      checkpoint: parsedWithoutDigest,
    })
  ) {
    throw invalid("Authority transition checkpoint digest is not canonical.");
  }
  return {
    kind: "finalized-authority-transition-scan.v1",
    checkpoint: { ...parsedWithoutDigest, checkpointDigest },
    generations,
  };
}

function parseAuthorityTransitionCursor(
  value: unknown,
  expected?: {
    deploymentManifestId: AuthorityId;
    adapterRevision?: AuthorityId;
    block: FinalizedBlockAnchor;
  },
): AuthorityTransitionCursor {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "deploymentManifestId",
      "adapterRevision",
      "sourceId",
      "blockNumber",
      "blockHash",
      "transactionHash",
      "transactionIndex",
      "logIndex",
      "emitter",
      "eventTopic0",
    ],
    "authority transition cursor",
  );
  if (record.kind !== "authority-transition-cursor.v1") {
    throw invalid("Authority transition cursor kind is unsupported.");
  }
  const parsed = {
    kind: "authority-transition-cursor.v1" as const,
    deploymentManifestId: parseAuthorityId(
      record.deploymentManifestId,
      "transition deployment manifest ID",
    ),
    adapterRevision: parseAuthorityId(
      record.adapterRevision,
      "transition adapter revision",
    ),
    sourceId: parseAuthorityId(record.sourceId, "transition source ID"),
    blockNumber: parseUint256Decimal(record.blockNumber, "transition block number"),
    blockHash: parseHash32(record.blockHash, "transition block hash"),
    transactionHash: parseHash32(record.transactionHash, "transition transaction hash"),
    transactionIndex: parseLogIndex(record.transactionIndex, "transactionIndex"),
    logIndex: parseLogIndex(record.logIndex, "block-global logIndex"),
    emitter: parseEthereumAddress(record.emitter, "transition emitter"),
    eventTopic0: parseHash32(record.eventTopic0, "transition topic0"),
  };
  if (
    expected !== undefined &&
    (parsed.deploymentManifestId !== expected.deploymentManifestId ||
      (expected.adapterRevision !== undefined &&
        parsed.adapterRevision !== expected.adapterRevision) ||
      parsed.blockNumber !== expected.block.blockNumber ||
      parsed.blockHash !== expected.block.blockHash)
  ) {
    throw invalid("Authority transition cursor is detached from its manifest or block.");
  }
  return parsed;
}

function compareTransitionCursors(
  left: AuthorityTransitionCursor,
  right: AuthorityTransitionCursor,
): number {
  if (
    left.logIndex === right.logIndex ||
    (left.logIndex > right.logIndex &&
      left.transactionIndex < right.transactionIndex) ||
    (left.logIndex < right.logIndex &&
      left.transactionIndex > right.transactionIndex)
  ) {
    return 0;
  }
  return left.logIndex - right.logIndex;
}

function compareBlockAndTransitionCursor(
  leftBlock: FinalizedBlockAnchor,
  leftCursor: AuthorityTransitionCursor,
  rightBlock: FinalizedBlockAnchor,
  rightCursor: AuthorityTransitionCursor,
): number {
  const blockDifference =
    BigInt(leftBlock.blockNumber) - BigInt(rightBlock.blockNumber);
  if (blockDifference !== 0n) return blockDifference > 0n ? 1 : -1;
  if (leftBlock.blockHash !== rightBlock.blockHash) {
    throw invalid("Authority transitions in one block disagree on its canonical hash.");
  }
  return compareTransitionCursors(leftCursor, rightCursor);
}

function assertTransitionCauseMatchesRoots(
  previous: AuthorityGeneration,
  next: AuthorityGeneration,
): void {
  let expectedCause: AuthorityTransitionCause;
  if (next.authorityStatus === "disabled") {
    expectedCause =
      previous.rootKind === "jbprojects-owner"
        ? "project-owner-burned"
        : previous.rootKind === "revnet-operator-set"
          ? "revnet-operator-relinquished"
          : "canonical-authority-disabled";
    if (
      next.transitionCause !== expectedCause &&
      next.transitionCause !== "canonical-authority-disabled"
    ) {
      throw invalid("Disabled authority transition cause does not match its predecessor.");
    }
    return;
  }
  if (previous.authorityStatus === "disabled" || previous.rootKind !== next.rootKind) {
    expectedCause = "authority-mode-change";
  } else if (previous.rootPrincipal === next.rootPrincipal) {
    expectedCause = "recovery-rotation";
  } else {
    expectedCause =
      next.rootKind === "jbprojects-owner"
        ? "ordinary-owner-transfer"
        : "revnet-operator-replacement";
  }
  if (next.transitionCause !== expectedCause) {
    throw invalid("Authority transition cause does not match its root-state change.");
  }
}

function parseAuthorityTransitionCause(value: unknown): AuthorityTransitionCause {
  if (
    value !== "bootstrap" &&
    value !== "ordinary-owner-transfer" &&
    value !== "project-owner-burned" &&
    value !== "revnet-operator-replacement" &&
    value !== "revnet-operator-relinquished" &&
    value !== "authority-mode-change" &&
    value !== "recovery-rotation" &&
    value !== "canonical-authority-disabled"
  ) {
    throw invalid("Authority transition cause is unsupported.");
  }
  return value;
}

function parseSafeCount(value: unknown, label: string, maximum: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > maximum
  ) {
    throw invalid(`${label} is outside its safe bound.`);
  }
  return value;
}

function parseRevnetDeploymentEvidence(
  value: unknown,
): Extract<RootAuthorityVerificationResult, { role: "revnet-operator" }>["deploymentEvidence"] {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "deployRevnetEvidenceId",
      "deployRevnetLogDigest",
      "transactionHash",
      "logIndex",
      "emitter",
      "configurationHash",
      "revDeployerProjectsResult",
      "revDeployerOwnerResult",
      "revOwnerProjectsResult",
      "revOwnerDeployerResult",
    ],
    "canonical Revnet deployment evidence",
  );
  if (record.kind !== "canonical-revnet-deployment.v1") {
    throw invalid("Revnet deployment evidence kind is unsupported.");
  }
  return {
    kind: "canonical-revnet-deployment.v1",
    deployRevnetEvidenceId: parseAuthorityId(
      record.deployRevnetEvidenceId,
      "DeployRevnet evidence ID",
    ),
    deployRevnetLogDigest: parseHash32(
      record.deployRevnetLogDigest,
      "DeployRevnet log digest",
    ),
    transactionHash: parseHash32(record.transactionHash, "DeployRevnet transaction hash"),
    logIndex: parseLogIndex(record.logIndex, "DeployRevnet block-global logIndex"),
    emitter: parseEthereumAddress(record.emitter, "DeployRevnet emitter"),
    configurationHash: parseHash32(record.configurationHash, "configuration hash"),
    revDeployerProjectsResult: parseEthereumAddress(
      record.revDeployerProjectsResult,
      "REVDeployer PROJECTS result",
    ),
    revDeployerOwnerResult: parseEthereumAddress(
      record.revDeployerOwnerResult,
      "REVDeployer OWNER result",
    ),
    revOwnerProjectsResult: parseEthereumAddress(
      record.revOwnerProjectsResult,
      "REVOwner PROJECTS result",
    ),
    revOwnerDeployerResult: parseEthereumAddress(
      record.revOwnerDeployerResult,
      "REVOwner deployer result",
    ),
  };
}

function parseCapabilities(
  value: unknown,
): readonly [ProjectStaffCapability, ...ProjectStaffCapability[]] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 7) {
    throw invalid("Staff capabilities must be a non-empty bounded list.");
  }
  const allowed = new Set<string>(PROJECT_STAFF_CAPABILITIES);
  if (value.some((item) => typeof item !== "string" || !allowed.has(item))) {
    throw invalid("Staff capability is unsupported; onchain permissions do not imply chat roles.");
  }
  const capabilities = value as ProjectStaffCapability[];
  if (
    new Set(capabilities).size !== capabilities.length ||
    [...capabilities].sort().some((item, index) => item !== capabilities[index])
  ) {
    throw invalid("Staff capabilities must be unique and canonically sorted.");
  }
  return capabilities as [ProjectStaffCapability, ...ProjectStaffCapability[]];
}

function invalid(message: string): AuthorityValidationError {
  return new AuthorityValidationError(message);
}
