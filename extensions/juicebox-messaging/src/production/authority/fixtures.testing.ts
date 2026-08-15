import {
  JUICEBOX_V6_EVENT_TOPICS,
  computeCanonicalPurchaseEvidenceId,
} from "./purchases";
import {
  parseWalletChallenge,
  walletChallengeEnrollmentBinding,
} from "./challenges";
import { computeDevicePossessionChallengeDigest } from "./devices";
import {
  sha256AuthorityBase64Url,
  sha256AuthorityDigest,
} from "./digests";

export const ADDRESS_A = "0x1111111111111111111111111111111111111111";
export const ADDRESS_B = "0x2222222222222222222222222222222222222222";
export const ADDRESS_C = "0x3333333333333333333333333333333333333333";
export const ADDRESS_D = "0x4444444444444444444444444444444444444444";
export const ADDRESS_TERMINAL = "0x5555555555555555555555555555555555555555";
export const ADDRESS_HOOK = "0x6666666666666666666666666666666666666666";
export const ENROLLMENT_ID = "0198a5d6-4c58-7e31-bbf1-0fd4c09e4acf";
export const WALLET_CHALLENGE_ID = "0198a5d7-4c58-7e31-bbf1-0fd4c09e4acf";
export const EIP712_WALLET_CHALLENGE_ID =
  "0198a5d9-4c58-7e31-bbf1-0fd4c09e4acf";
export const POSSESSION_CHALLENGE_ID =
  "0198a5d8-4c58-7e31-bbf1-0fd4c09e4acf";
export const ACCOUNT_ID = "7f94c690-2af4-4a45-a7cc-9d85ce6cbd26";
export const INSTALLATION_ID = "5ec2d18e-f082-48f0-8b01-55e43fed021c";
export const INSTALLATION_ID_2 = "6ec2d18e-f082-48f0-8b01-55e43fed021c";
export const DEVICE_CREDENTIAL_ID =
  "c3c82f16-bf3c-45e0-8518-ca1bf6ab3b66";
export const DEVICE_CREDENTIAL_ID_2 =
  "d3c82f16-bf3c-45e0-8518-ca1bf6ab3b66";

export function hash(character: string): string {
  return `0x${character.repeat(64)}`;
}

export function project() {
  return {
    protocol: "juicebox-v6",
    chainId: 8453,
    projectId: 9,
    version: 6,
    deploymentManifestId: "deployments.base.v1",
    projectsContract: ADDRESS_C,
  };
}

export function finalityPolicy() {
  return {
    kind: "juicebox-finality-policy.v1",
    policyId: "finality.base.v1",
    chainId: 8453,
    blockTag: "finalized",
    minimumProviderQuorum: 2,
    requireBlockHashAgreement: true,
    requireArchiveStateAtReceiptBlock: true,
    allowConfirmationFallback: false,
    safeHeadUse: "suspend-existing-authority-only",
    onReorg: "revoke-leases-and-rekey",
  };
}

export function finalizedBlock() {
  return {
    kind: "finalized-block.v1",
    chainId: 8453,
    blockNumber: "123456",
    blockHash: hash("a"),
    finalizedAt: "2026-08-14T12:01:00.000Z",
    providerIds: ["provider.a", "provider.b"],
  };
}

export function device(installationId = INSTALLATION_ID) {
  const publicJwk = {
    kty: "EC",
    crv: "P-256",
    x: "A".repeat(43),
    y: `${"A".repeat(42)}E`,
    use: "sig",
    alg: "ES256",
  };
  const mlsPublicKey = "A".repeat(43);
  return {
    installationId,
    installationAuthKey: {
      profile: "p256-es256-dpop.v1",
      algorithm: "P-256",
      publicJwk,
      jwkThumbprint: sha256AuthorityBase64Url({
        crv: publicJwk.crv,
        kty: publicJwk.kty,
        x: publicJwk.x,
        y: publicJwk.y,
      }),
    },
    mlsCredentialKey: {
      profile: "mls-credential-ed25519-suite-0x0001.v1",
      algorithm: "Ed25519",
      ciphersuite: "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519",
      publicKey: mlsPublicKey,
      credentialFingerprint: sha256AuthorityBase64Url({
        kind: "mls-credential-fingerprint.v1",
        profile: "mls-credential-ed25519-suite-0x0001.v1",
        algorithm: "Ed25519",
        ciphersuite: "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519",
        publicKey: mlsPublicKey,
      }),
      initialKeyPackage: {
        kind: "ordinary-mls-key-package.v1",
        keyPackageRef: "A".repeat(43),
        sha256: "A5BYxvLAy0ksUzsKTRTvd8wPeKvMztUofYShogEc-4E",
        keyPackage: "AQID",
        expiresAt: "2026-08-21T12:00:00.000Z",
      },
    },
  };
}

export function walletChallengeScope() {
  return {
    kind: "wallet-challenge-scope.v1",
    project: null,
    action: "device-enrollment",
  };
}

export function devicePossessionChallenge() {
  const wallet = walletChallengeEnrollmentBinding(
    parseWalletChallenge(siweChallenge()),
  );
  const challenge = {
    kind: "device-possession-challenge.v1",
    challengeId: wallet.possessionChallengeId,
    nonce: "Q".repeat(22),
    walletChallengeId: wallet.challengeId,
    walletPayloadDigest: wallet.walletPayloadDigest,
    enrollmentId: wallet.enrollmentId,
    accountId: wallet.accountId,
    deviceCredentialId: wallet.deviceCredentialId,
    account: wallet.account,
    chainId: wallet.chainId,
    origin: wallet.origin,
    audience: wallet.audience,
    clientId: wallet.clientId,
    scope: wallet.scope,
    scopeDigest: wallet.scopeDigest,
    purpose: wallet.purpose,
    walletProtocolProfile: wallet.protocolProfile,
    device: wallet.device,
    issuedAt: wallet.issuedAt,
    notBefore: wallet.notBefore,
    expiresAt: wallet.expiresAt,
  };
  return {
    ...challenge,
    challengeDigest: computeDevicePossessionChallengeDigest(challenge as never),
  };
}

export function siweChallenge() {
  const binding = device();
  const scope = walletChallengeScope();
  return {
    kind: "siwe-erc4361-v1",
    challengeId: WALLET_CHALLENGE_ID,
    possessionChallengeId: POSSESSION_CHALLENGE_ID,
    enrollmentId: ENROLLMENT_ID,
    accountId: ACCOUNT_ID,
    deviceCredentialId: DEVICE_CREDENTIAL_ID,
    scheme: "https",
    domain: "chat.example",
    uri: "https://chat.example/auth/wallet",
    version: "1",
    account: ADDRESS_A,
    chainId: 8453,
    nonce: "N".repeat(22),
    issuedAt: "2026-08-14T12:00:00.000Z",
    notBefore: "2026-08-14T12:00:00.000Z",
    expiresAt: "2026-08-14T12:05:00.000Z",
    requestId: WALLET_CHALLENGE_ID,
    statement:
      "Authorize this wallet to enroll one Juicebox Messaging device.",
    purpose: "device-enrollment",
    audience: "https://chat.example",
    clientId: "client.web.v1",
    scope,
    resources: [
      `urn:juicebox:messaging:enrollment:v1:${ENROLLMENT_ID}`,
      `urn:juicebox:messaging:account:v1:${ACCOUNT_ID}`,
      `urn:juicebox:messaging:installation:v1:${INSTALLATION_ID}`,
      `urn:juicebox:messaging:device-credential:v1:${DEVICE_CREDENTIAL_ID}`,
      "urn:juicebox:messaging:audience:v1:https%3A%2F%2Fchat.example",
      "urn:juicebox:messaging:client:v1:client.web.v1",
      `urn:juicebox:messaging:scope:v1:${sha256AuthorityDigest(scope).slice(2)}`,
      `urn:juicebox:messaging:installation-auth-jkt:v1:${binding.installationAuthKey.jwkThumbprint}`,
      `urn:juicebox:messaging:mls-credential:v1:${binding.mlsCredentialKey.credentialFingerprint}`,
      `urn:juicebox:messaging:mls-key-package:v1:${binding.mlsCredentialKey.initialKeyPackage.keyPackageRef}`,
      `urn:juicebox:messaging:mls-key-package-sha256:v1:${binding.mlsCredentialKey.initialKeyPackage.sha256}`,
      "urn:juicebox:messaging:protocol-profile:v1:device-enrollment.v1",
      `urn:juicebox:messaging:possession-challenge:v1:${POSSESSION_CHALLENGE_ID}`,
    ],
    device: binding,
  };
}

export function eip712Challenge() {
  const challengeId = EIP712_WALLET_CHALLENGE_ID;
  const possessionChallengeId = POSSESSION_CHALLENGE_ID;
  const enrollmentId = ENROLLMENT_ID;
  const accountId = ACCOUNT_ID;
  const installationId = INSTALLATION_ID;
  const deviceCredentialId = DEVICE_CREDENTIAL_ID;
  const binding = device(installationId);
  const scope = walletChallengeScope();
  return {
    kind: "eip712-device-enrollment-v1",
    challengeId,
    possessionChallengeId,
    enrollmentId,
    accountId,
    deviceCredentialId,
    account: ADDRESS_A,
    issuedAt: "2026-08-14T12:00:00.000Z",
    notBefore: "2026-08-14T12:00:00.000Z",
    expiresAt: "2026-08-14T12:05:00.000Z",
    domain: {
      name: "Juicebox Messaging",
      version: "1",
      chainId: 8453,
      salt: hash("c"),
    },
    primaryType: "JuiceboxMessagingDeviceEnrollmentV1",
    message: {
      challengeId: uuidBytes16(challengeId),
      possessionChallengeId: uuidBytes16(possessionChallengeId),
      audience: "https://chat.example",
      clientId: "client.web.v1",
      origin: "https://chat.example",
      purpose: "device-enrollment",
      action: "device-enrollment",
      scopeDigest: sha256AuthorityDigest(scope),
      enrollmentId: uuidBytes16(enrollmentId),
      accountId: uuidBytes16(accountId),
      chainId: 8453,
      installationId: uuidBytes16(installationId),
      deviceCredentialId: uuidBytes16(deviceCredentialId),
      installationAuthProfile: binding.installationAuthKey.profile,
      installationAuthJkt: base64UrlBytes32(binding.installationAuthKey.jwkThumbprint),
      mlsCredentialProfile: binding.mlsCredentialKey.profile,
      mlsCiphersuite: binding.mlsCredentialKey.ciphersuite,
      mlsCredentialPublicKey: base64UrlBytes32(binding.mlsCredentialKey.publicKey),
      mlsCredentialFingerprint: base64UrlBytes32(
        binding.mlsCredentialKey.credentialFingerprint,
      ),
      keyPackageKind: binding.mlsCredentialKey.initialKeyPackage.kind,
      keyPackageRef: base64UrlBytes32(
        binding.mlsCredentialKey.initialKeyPackage.keyPackageRef,
      ),
      keyPackageSha256: base64UrlBytes32(
        binding.mlsCredentialKey.initialKeyPackage.sha256,
      ),
      protocolProfile: "device-enrollment.v1",
      nonce: "P".repeat(22),
      issuedAt: 1_786_708_800,
      notBefore: 1_786_708_800,
      expiresAt: 1_786_709_100,
    },
    scope,
    device: binding,
  };
}

function uuidBytes16(value: string): string {
  return `0x${value.replaceAll("-", "")}`;
}

function base64UrlBytes32(value: string): string {
  return `0x${Buffer.from(value, "base64url").toString("hex")}`;
}

export function receipt() {
  return {
    kind: "canonical-finalized-receipt.v1",
    receiptEvidenceId: "receipt.1",
    chainId: 8453,
    transactionHash: hash("d"),
    transactionIndex: 2,
    block: finalizedBlock(),
    status: 1,
    receiptDigest: hash("e"),
    finalityPolicyId: "finality.base.v1",
    deploymentManifestId: "deployments.base.v1",
    adapterRevision: "juicebox-v6-receipt.v1",
    canonicalityCheckedAt: "2026-08-14T12:02:00.000Z",
  };
}

export function logRef(
  logIndex: number,
  emitter: string,
  topic0: string,
) {
  return {
    receiptEvidenceId: "receipt.1",
    transactionHash: hash("d"),
    blockHash: hash("a"),
    logIndex,
    emitter,
    topic0,
    abiDigest: hash("0"),
    adapterRevision: "juicebox-v6-receipt.v1",
    topicsDigest: hash("1"),
    dataDigest: hash("2"),
    removed: false,
  };
}

export function payLog() {
  return {
    kind: "juicebox-v6-pay-log.v1",
    log: logRef(7, ADDRESS_TERMINAL, JUICEBOX_V6_EVENT_TOPICS.pay),
    project: project(),
    rulesetId: "88",
    rulesetCycleNumber: "3",
    payer: ADDRESS_A,
    beneficiary: ADDRESS_B,
    amount: "0",
    newlyIssuedTokenCount: "10",
    memoDigest: hash("3"),
    metadataDigest: hash("4"),
    caller: ADDRESS_C,
    accountingContext: "not-contained-in-pay-event",
  };
}

export function terminalEvidence() {
  return {
    kind: "canonical-v6-terminal-at-block.v1",
    evidenceId: "terminal.1",
    project: project(),
    terminal: ADDRESS_TERMINAL,
    implementationCodeHash: hash("5"),
    deploymentManifestId: "deployments.base.v1",
    isTerminalOfProject: true,
    block: finalizedBlock(),
  };
}

export function hookAfterPayLog() {
  return {
    kind: "juicebox-v6-hook-after-record-pay-log.v1",
    log: logRef(
      10,
      ADDRESS_TERMINAL,
      JUICEBOX_V6_EVENT_TOPICS.hookAfterRecordPay,
    ),
    hook: ADDRESS_HOOK,
    project: project(),
    rulesetId: "88",
    payer: ADDRESS_A,
    beneficiary: ADDRESS_B,
    amount: {
      token: ADDRESS_D,
      decimals: 18,
      currency: "1",
      value: "0",
    },
    newlyIssuedTokenCount: "10",
    contextDigest: hash("6"),
    specificationAmount: "0",
    caller: ADDRESS_C,
  };
}

export function tierMintLog() {
  return {
    kind: "juicebox-v6-721-tier-mint-log.v1",
    log: logRef(9, ADDRESS_HOOK, JUICEBOX_V6_EVENT_TOPICS.tierMint),
    tokenId: "1000000001",
    tierId: "1",
    beneficiary: ADDRESS_B,
    totalAmountPaid: "999",
    caller: ADDRESS_TERMINAL,
    comparisonToPayAmount: "not-used-for-correlation",
  };
}

export function tierHookEvidence() {
  return {
    kind: "canonical-v6-721-hook-at-block.v1",
    evidenceId: "tier-hook.1",
    project: project(),
    hook: ADDRESS_HOOK,
    implementationCodeHash: hash("7"),
    deploymentManifestId: "deployments.base.v1",
    projectIdResult: 9,
    block: finalizedBlock(),
  };
}

export function paymentEvidence() {
  const pay = payLog();
  pay.amount = "100";
  return {
    kind: "juicebox-v6-payment-beneficiary-evidence.v1",
    evidenceId: computeCanonicalPurchaseEvidenceId(paymentPurchaseClaim()),
    receipt: receipt(),
    pay,
    terminal: terminalEvidence(),
    project: project(),
    customerAccount: ADDRESS_B,
    customerSubjectSource: "pay-beneficiary",
    payerAttribution: "not-evaluated",
    transactionSenderAttribution: "never-inferred",
    callerAttribution: "never-inferred",
    refundStatus: "not-evaluated",
  };
}

export function paymentPurchaseClaim() {
  return {
    kind: "juicebox-v6-payment-beneficiary-claim.v1",
    claimId: "claim.payment.1",
    project: project(),
    transactionHash: hash("d"),
    payLogIndex: 7,
    expectedBeneficiary: ADDRESS_B,
    customerSubjectSource: "pay-beneficiary",
  };
}

export function tierPurchaseClaim() {
  return {
    kind: "juicebox-v6-tier-purchase-claim.v1",
    claimId: "claim.tier.1",
    project: project(),
    transactionHash: hash("d"),
    payLogIndex: 7,
    afterPayHookLogIndex: 10,
    mintLogIndices: [9],
    expectedBeneficiary: ADDRESS_B,
    customerSubjectSource: "pay-beneficiary",
  };
}

export function purchaseDeploymentExpectation(includeTierHook: boolean) {
  return {
    deploymentManifestId: "deployments.base.v1",
    projectsContract: ADDRESS_C,
    adapterRevision: "juicebox-v6-receipt.v1",
    abiDigests: {
      pay: hash("0"),
      hookAfterRecordPay: hash("0"),
      tierMint: hash("0"),
    },
    terminal: {
      address: ADDRESS_TERMINAL,
      implementationCodeHash: hash("5"),
    },
    tierHook: includeTierHook
      ? {
          address: ADDRESS_HOOK,
          implementationCodeHash: hash("7"),
        }
      : null,
  };
}

export function paymentPurchaseExpectation() {
  return {
    claim: paymentPurchaseClaim(),
    deployment: purchaseDeploymentExpectation(false),
    now: "2026-08-14T12:03:00.000Z",
  };
}

export function tierPurchaseExpectation() {
  return {
    claim: tierPurchaseClaim(),
    deployment: purchaseDeploymentExpectation(true),
    now: "2026-08-14T12:03:00.000Z",
  };
}

export function tierPurchaseEvidence() {
  return {
    kind: "juicebox-v6-tier-purchase-evidence.v1",
    evidenceId: computeCanonicalPurchaseEvidenceId(tierPurchaseClaim()),
    receipt: receipt(),
    pay: payLog(),
    afterPayHook: hookAfterPayLog(),
    mints: [tierMintLog()],
    terminal: terminalEvidence(),
    tierHook: tierHookEvidence(),
    project: project(),
    customerAccount: ADDRESS_B,
    customerSubjectSource: "pay-beneficiary",
    correlationEvidence: {
      kind: "canonical-exclusive-receipt-call-trace-correlation.v1",
      evidenceId: "correlation.1",
      receiptEvidenceId: "receipt.1",
      transactionHash: hash("d"),
      blockHash: hash("a"),
      adapterRevision: "juicebox-v6-receipt.v1",
      traceDigest: hash("8"),
      relevantLogInventoryDigest: hash("9"),
      receiptLogCount: 4,
      traceFrameCount: 3,
      inventoryScope: "entire-receipt-expected-emitters",
      traceComplete: true,
      traceTruncated: false,
      allRelevantPayLogIndices: [7],
      allRelevantHookAfterRecordPayLogIndices: [10],
      allRelevantTierMintLogIndices: [9],
      terminalFrame: {
        traceAddress: [0],
        parentTraceAddress: [],
        depth: 1,
        from: ADDRESS_C,
        to: ADDRESS_TERMINAL,
        callType: "call",
        success: true,
        relevantEmittedLogIndices: [7, 10],
      },
      tierHookFrame: {
        traceAddress: [0, 0],
        parentTraceAddress: [0],
        depth: 2,
        from: ADDRESS_TERMINAL,
        to: ADDRESS_HOOK,
        callType: "call",
        success: true,
        relevantEmittedLogIndices: [9],
      },
    },
    payerAttribution: "not-evaluated",
    transactionSenderAttribution: "never-inferred",
    callerAttribution: "never-inferred",
    refundStatus: "not-evaluated",
  };
}

export function authorityGeneration() {
  return {
    kind: "project-authority-generation.v1",
    generationId: "generation.1",
    project: project(),
    sequence: "1",
    transitionCause: "bootstrap",
    authorityStatus: "active",
    rootKind: "jbprojects-owner",
    rootPrincipal: ADDRESS_A,
    rootEvidenceId: "root.1",
    rootEvidenceDigest: hash("8"),
    activatedAtBlock: finalizedBlock(),
    transitionCursor: {
      kind: "authority-transition-cursor.v1",
      deploymentManifestId: "deployments.base.v1",
      adapterRevision: "root-authority.base.v1",
      sourceId: "authority-source.bootstrap",
      blockNumber: "123456",
      blockHash: hash("a"),
      transactionHash: hash("8"),
      transactionIndex: 1,
      logIndex: 4,
      emitter: ADDRESS_C,
      eventTopic0: hash("7"),
    },
    predecessorGenerationId: null,
  };
}
