import { createHash } from "node:crypto";
import {
  sha256AuthorityBase64Url,
  sha256AuthorityDigest,
} from "./digests";
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
  parseHttpsUrl,
  parseJuiceboxV6ChainId,
  parseSiweDomain,
  type AuthorityId,
  type Base64Url,
  type CanonicalInstant,
  type EthereumAddress,
  type Hash32,
  type HttpsOrigin,
  type HttpsUrl,
  type HexBytes,
  type JuiceboxV6ChainId,
  type JuiceboxV6ProjectRef,
  type SiweDomain,
} from "./valueObjects";

export const SIWE_VERSION = "1" as const;
export const SIWE_STATEMENT =
  "Authorize this wallet to enroll one Juicebox Messaging device.";
export const EIP712_DOMAIN_NAME = "Juicebox Messaging" as const;
export const EIP712_DOMAIN_VERSION = "1" as const;
export const EIP712_PRIMARY_TYPE =
  "JuiceboxMessagingDeviceEnrollmentV1" as const;
export const SIWE_ENROLLMENT_PROFILE = "siwe-erc4361-v1" as const;
export const EIP712_ENROLLMENT_PROFILE =
  "eip712-device-enrollment-v1" as const;
export const INSTALLATION_AUTH_PROFILE = "p256-es256-dpop.v1" as const;
export const MLS_CREDENTIAL_PROFILE =
  "mls-credential-ed25519-suite-0x0001.v1" as const;
export const MLS_CIPHERSUITE =
  "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519" as const;
export const DEVICE_ENROLLMENT_PROTOCOL_PROFILE =
  "device-enrollment.v1" as const;
export const EIP712_CHALLENGE_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "salt", type: "bytes32" },
  ],
  JuiceboxMessagingDeviceEnrollmentV1: [
    { name: "challengeId", type: "bytes16" },
    { name: "possessionChallengeId", type: "bytes16" },
    { name: "audience", type: "string" },
    { name: "clientId", type: "string" },
    { name: "origin", type: "string" },
    { name: "purpose", type: "string" },
    { name: "action", type: "string" },
    { name: "scopeDigest", type: "bytes32" },
    { name: "enrollmentId", type: "bytes16" },
    { name: "accountId", type: "bytes16" },
    { name: "chainId", type: "uint256" },
    { name: "installationId", type: "bytes16" },
    { name: "deviceCredentialId", type: "bytes16" },
    { name: "installationAuthProfile", type: "string" },
    { name: "installationAuthJkt", type: "bytes32" },
    { name: "mlsCredentialProfile", type: "string" },
    { name: "mlsCiphersuite", type: "string" },
    { name: "mlsCredentialPublicKey", type: "bytes32" },
    { name: "mlsCredentialFingerprint", type: "bytes32" },
    { name: "keyPackageKind", type: "string" },
    { name: "keyPackageRef", type: "bytes32" },
    { name: "keyPackageSha256", type: "bytes32" },
    { name: "protocolProfile", type: "string" },
    { name: "nonce", type: "string" },
    { name: "issuedAt", type: "uint64" },
    { name: "notBefore", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
  ],
} as const;

const MAX_CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;
const MAX_KEY_PACKAGE_BYTES = 64 * 1024;

declare const enrollmentUuidNamespaceBrand: unique symbol;

type EnrollmentUuidNamespace<Name extends string> = AuthorityId & {
  readonly [enrollmentUuidNamespaceBrand]: Name;
};

export type EnrollmentId = EnrollmentUuidNamespace<"enrollment-v7">;
export type WalletChallengeId = EnrollmentUuidNamespace<"wallet-challenge-v7">;
export type PossessionChallengeId =
  EnrollmentUuidNamespace<"possession-challenge-v7">;
export type AccountId = EnrollmentUuidNamespace<"account-v4">;
export type InstallationId = EnrollmentUuidNamespace<"installation-v4">;
export type DeviceCredentialId =
  EnrollmentUuidNamespace<"device-credential-v4">;

export type WalletChallengePurpose = "device-enrollment";

export interface WalletChallengeScope {
  kind: "wallet-challenge-scope.v1";
  project: JuiceboxV6ProjectRef | null;
  action: WalletChallengePurpose;
}

export interface InstallationAuthKeyBinding {
  profile: typeof INSTALLATION_AUTH_PROFILE;
  algorithm: "P-256";
  publicJwk: {
    kty: "EC";
    crv: "P-256";
    x: Base64Url;
    y: Base64Url;
    use: "sig";
    alg: "ES256";
  };
  jwkThumbprint: Base64Url;
}

export interface MlsCredentialKeyBinding {
  profile: typeof MLS_CREDENTIAL_PROFILE;
  algorithm: "Ed25519";
  ciphersuite: typeof MLS_CIPHERSUITE;
  publicKey: Base64Url;
  credentialFingerprint: Base64Url;
  initialKeyPackage: {
    kind: "ordinary-mls-key-package.v1";
    keyPackageRef: Base64Url;
    sha256: Base64Url;
    keyPackage: Base64Url;
    expiresAt: CanonicalInstant;
  };
}

export interface DeviceKeyBinding {
  installationId: InstallationId;
  installationAuthKey: InstallationAuthKeyBinding;
  mlsCredentialKey: MlsCredentialKeyBinding;
}

interface ChallengeWindow {
  issuedAt: CanonicalInstant;
  notBefore: CanonicalInstant;
  expiresAt: CanonicalInstant;
}

export interface SiweChallenge extends ChallengeWindow {
  kind: typeof SIWE_ENROLLMENT_PROFILE;
  challengeId: WalletChallengeId;
  possessionChallengeId: PossessionChallengeId;
  enrollmentId: EnrollmentId;
  accountId: AccountId;
  deviceCredentialId: DeviceCredentialId;
  scheme: "https";
  domain: SiweDomain;
  uri: HttpsUrl;
  version: typeof SIWE_VERSION;
  account: EthereumAddress;
  chainId: JuiceboxV6ChainId;
  nonce: Base64Url;
  requestId: WalletChallengeId;
  statement: typeof SIWE_STATEMENT;
  purpose: WalletChallengePurpose;
  audience: HttpsOrigin;
  clientId: AuthorityId;
  scope: WalletChallengeScope;
  resources: readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  device: DeviceKeyBinding;
}

export interface Eip712Challenge {
  kind: typeof EIP712_ENROLLMENT_PROFILE;
  challengeId: WalletChallengeId;
  possessionChallengeId: PossessionChallengeId;
  enrollmentId: EnrollmentId;
  accountId: AccountId;
  deviceCredentialId: DeviceCredentialId;
  account: EthereumAddress;
  issuedAt: CanonicalInstant;
  notBefore: CanonicalInstant;
  expiresAt: CanonicalInstant;
  domain: {
    name: typeof EIP712_DOMAIN_NAME;
    version: typeof EIP712_DOMAIN_VERSION;
    chainId: JuiceboxV6ChainId;
    salt: Hash32;
  };
  primaryType: typeof EIP712_PRIMARY_TYPE;
  message: {
    challengeId: HexBytes;
    possessionChallengeId: HexBytes;
    audience: HttpsOrigin;
    clientId: AuthorityId;
    origin: HttpsOrigin;
    purpose: WalletChallengePurpose;
    action: WalletChallengePurpose;
    scopeDigest: Hash32;
    enrollmentId: HexBytes;
    accountId: HexBytes;
    chainId: JuiceboxV6ChainId;
    installationId: HexBytes;
    deviceCredentialId: HexBytes;
    installationAuthProfile: typeof INSTALLATION_AUTH_PROFILE;
    installationAuthJkt: Hash32;
    mlsCredentialProfile: typeof MLS_CREDENTIAL_PROFILE;
    mlsCiphersuite: typeof MLS_CIPHERSUITE;
    mlsCredentialPublicKey: Hash32;
    mlsCredentialFingerprint: Hash32;
    keyPackageKind: "ordinary-mls-key-package.v1";
    keyPackageRef: Hash32;
    keyPackageSha256: Hash32;
    protocolProfile: typeof DEVICE_ENROLLMENT_PROTOCOL_PROFILE;
    nonce: Base64Url;
    issuedAt: number;
    notBefore: number;
    expiresAt: number;
  };
  scope: WalletChallengeScope;
  device: DeviceKeyBinding;
}

export type WalletChallenge = SiweChallenge | Eip712Challenge;

export interface ChallengeExpectations {
  challengeId: WalletChallengeId;
  possessionChallengeId: PossessionChallengeId;
  enrollmentId: EnrollmentId;
  accountId: AccountId;
  deviceCredentialId: DeviceCredentialId;
  account: EthereumAddress;
  chainId: JuiceboxV6ChainId;
  origin: HttpsOrigin;
  audience: HttpsOrigin;
  clientId: AuthorityId;
  scope: WalletChallengeScope;
  purpose: WalletChallengePurpose;
  device: DeviceKeyBinding;
  eip712DomainSalt?: Hash32;
}

export interface WalletChallengeEnrollmentBinding {
  protocolProfile:
    | typeof SIWE_ENROLLMENT_PROFILE
    | typeof EIP712_ENROLLMENT_PROFILE;
  challengeId: WalletChallengeId;
  possessionChallengeId: PossessionChallengeId;
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
  purpose: WalletChallengePurpose;
  device: DeviceKeyBinding;
  issuedAt: CanonicalInstant;
  notBefore: CanonicalInstant;
  expiresAt: CanonicalInstant;
  walletPayloadDigest: Hash32;
}

export interface WinningChallengeClaim {
  status: "claimed";
  challengeId: WalletChallengeId;
  claimId: AuthorityId;
  claimedAt: CanonicalInstant;
  terminalEvenIfVerificationFails: true;
}

export function parseDeviceKeyBinding(value: unknown): DeviceKeyBinding {
  const record = expectExactRecord(
    value,
    ["installationId", "installationAuthKey", "mlsCredentialKey"],
    "device binding",
  );
  return {
    installationId: parseInstallationId(record.installationId, "installationId"),
    installationAuthKey: parseInstallationAuthKey(record.installationAuthKey),
    mlsCredentialKey: parseMlsCredentialKey(record.mlsCredentialKey),
  };
}

export function parseWalletChallenge(value: unknown): WalletChallenge {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("Wallet challenge must be an object.");
  }
  const kind = (value as Record<string, unknown>).kind;
  if (kind === "siwe-erc4361-v1") return parseSiweChallenge(value);
  if (kind === "eip712-device-enrollment-v1") return parseEip712Challenge(value);
  throw invalid("Wallet challenge kind is unsupported.");
}

export function assertChallengeUsable(
  challenge: WalletChallenge,
  expectations: ChallengeExpectations,
  now: CanonicalInstant,
  winningClaim: WinningChallengeClaim,
): void {
  winningClaim = parseWinningChallengeClaim(winningClaim, challenge);
  if (
    winningClaim.status !== "claimed" ||
    winningClaim.terminalEvenIfVerificationFails !== true ||
    winningClaim.challengeId !== challengeIdOf(challenge)
  ) {
    throw invalid("Wallet challenge was not atomically claimed by this verifier.");
  }
  const binding = challengeBinding(challenge);
  if (
    binding.challengeId !== expectations.challengeId ||
    binding.possessionChallengeId !== expectations.possessionChallengeId ||
    binding.enrollmentId !== expectations.enrollmentId ||
    binding.accountId !== expectations.accountId ||
    binding.deviceCredentialId !== expectations.deviceCredentialId ||
    binding.account !== expectations.account ||
    binding.chainId !== expectations.chainId ||
    binding.origin !== expectations.origin ||
    binding.audience !== expectations.audience ||
    binding.clientId !== expectations.clientId ||
    !scopesEqual(binding.scope, expectations.scope) ||
    binding.purpose !== expectations.purpose ||
    !deviceBindingsEqual(binding.device, expectations.device)
  ) {
    throw invalid("Wallet challenge does not match its expected binding.");
  }
  if (
    challenge.kind === "eip712-device-enrollment-v1" &&
    (!expectations.eip712DomainSalt ||
      challenge.domain.salt !== expectations.eip712DomainSalt)
  ) {
    throw invalid("EIP-712 challenge domain is not the configured deployment domain.");
  }
  const nowMs = instantMilliseconds(now);
  const claimedAtMs = instantMilliseconds(winningClaim.claimedAt);
  if (
    claimedAtMs < instantMilliseconds(challengeIssuedAt(challenge)) ||
    claimedAtMs < instantMilliseconds(binding.notBefore) ||
    claimedAtMs > nowMs ||
    claimedAtMs >= instantMilliseconds(binding.expiresAt)
  ) {
    throw invalid("Winning wallet challenge claim time is invalid.");
  }
  if (nowMs < instantMilliseconds(binding.notBefore)) {
    throw invalid("Wallet challenge is not yet valid.");
  }
  if (nowMs >= instantMilliseconds(binding.expiresAt)) {
    throw invalid("Wallet challenge has expired.");
  }
}

export function parseWinningChallengeClaim(
  value: unknown,
  challenge: WalletChallenge,
): WinningChallengeClaim {
  const record = expectExactRecord(
    value,
    [
      "status",
      "challengeId",
      "claimId",
      "claimedAt",
      "terminalEvenIfVerificationFails",
    ],
    "winning wallet challenge claim",
  );
  if (
    record.status !== "claimed" ||
    record.terminalEvenIfVerificationFails !== true
  ) {
    throw invalid("Wallet challenge claim is not a terminal winning claim.");
  }
  const challengeId = parseWalletChallengeId(
    record.challengeId,
    "claimed challengeId",
  );
  if (challengeId !== challengeIdOf(challenge)) {
    throw invalid("Wallet challenge claim belongs to another challenge.");
  }
  return {
    status: "claimed",
    challengeId,
    claimId: parseAuthorityId(record.claimId, "claimId"),
    claimedAt: parseCanonicalInstant(record.claimedAt, "claimedAt"),
    terminalEvenIfVerificationFails: true,
  };
}

export function siweResourcesFor(
  enrollmentId: EnrollmentId,
  accountId: AccountId,
  deviceCredentialId: DeviceCredentialId,
  possessionChallengeId: PossessionChallengeId,
  device: DeviceKeyBinding,
  audience: HttpsOrigin,
  clientId: AuthorityId,
  scope: WalletChallengeScope,
): SiweChallenge["resources"] {
  return [
    `urn:juicebox:messaging:enrollment:v1:${enrollmentId}`,
    `urn:juicebox:messaging:account:v1:${accountId}`,
    `urn:juicebox:messaging:installation:v1:${device.installationId}`,
    `urn:juicebox:messaging:device-credential:v1:${deviceCredentialId}`,
    `urn:juicebox:messaging:audience:v1:${encodeURIComponent(audience)}`,
    `urn:juicebox:messaging:client:v1:${clientId}`,
    `urn:juicebox:messaging:scope:v1:${sha256AuthorityDigest(scope).slice(2)}`,
    `urn:juicebox:messaging:installation-auth-jkt:v1:${device.installationAuthKey.jwkThumbprint}`,
    `urn:juicebox:messaging:mls-credential:v1:${device.mlsCredentialKey.credentialFingerprint}`,
    `urn:juicebox:messaging:mls-key-package:v1:${device.mlsCredentialKey.initialKeyPackage.keyPackageRef}`,
    `urn:juicebox:messaging:mls-key-package-sha256:v1:${device.mlsCredentialKey.initialKeyPackage.sha256}`,
    `urn:juicebox:messaging:protocol-profile:v1:${DEVICE_ENROLLMENT_PROTOCOL_PROFILE}`,
    `urn:juicebox:messaging:possession-challenge:v1:${possessionChallengeId}`,
  ];
}

/** SHA-256 audit/possession commitment to the exact stored wallet payload. */
export function computeWalletChallengePayloadDigest(
  challenge: WalletChallenge,
): Hash32 {
  return sha256AuthorityDigest(
    challenge.kind === SIWE_ENROLLMENT_PROFILE
      ? {
          kind: "siwe-enrollment-wallet-payload.v1",
          profile: SIWE_ENROLLMENT_PROFILE,
          utf8Message: serializeSiweMessage(challenge),
        }
      : {
          kind: "eip712-enrollment-wallet-payload.v1",
          profile: EIP712_ENROLLMENT_PROFILE,
          typedData: canonicalEip712TypedData(challenge),
        },
  );
}

export function walletChallengeEnrollmentBinding(
  challenge: WalletChallenge,
): WalletChallengeEnrollmentBinding {
  const binding = challengeBinding(challenge);
  return {
    protocolProfile: challenge.kind,
    ...binding,
    scopeDigest: sha256AuthorityDigest(binding.scope),
    walletPayloadDigest: computeWalletChallengePayloadDigest(challenge),
  };
}

/** Serialize once on the server and store these exact UTF-8 bytes with the challenge. */
export function serializeSiweMessage(challenge: SiweChallenge): string {
  const lines = [
    `${challenge.scheme}://${challenge.domain} wants you to sign in with your Ethereum account:`,
    challenge.account,
    "",
    challenge.statement,
    "",
    `URI: ${challenge.uri}`,
    `Version: ${challenge.version}`,
    `Chain ID: ${challenge.chainId}`,
    `Nonce: ${challenge.nonce}`,
    `Issued At: ${challenge.issuedAt}`,
    `Expiration Time: ${challenge.expiresAt}`,
    `Not Before: ${challenge.notBefore}`,
    `Request ID: ${challenge.requestId}`,
    "Resources:",
    ...challenge.resources.map((resource) => `- ${resource}`),
  ];
  const message = lines.join("\n");
  if (new TextEncoder().encode(message).byteLength > 8 * 1024) {
    throw invalid("Canonical SIWE message exceeds the production size bound.");
  }
  return message;
}

/** Return the fixed type graph; callers must never accept a client-provided graph. */
export function canonicalEip712TypedData(challenge: Eip712Challenge) {
  return {
    domain: challenge.domain,
    types: EIP712_CHALLENGE_TYPES,
    primaryType: EIP712_PRIMARY_TYPE,
    message: challenge.message,
  } as const;
}

function parseSiweChallenge(value: unknown): SiweChallenge {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "challengeId",
      "possessionChallengeId",
      "enrollmentId",
      "accountId",
      "deviceCredentialId",
      "scheme",
      "domain",
      "uri",
      "version",
      "account",
      "chainId",
      "nonce",
      "issuedAt",
      "notBefore",
      "expiresAt",
      "requestId",
      "statement",
      "purpose",
      "audience",
      "clientId",
      "scope",
      "resources",
      "device",
    ],
    "SIWE challenge",
  );
  if (
    record.kind !== "siwe-erc4361-v1" ||
    record.scheme !== "https" ||
    record.version !== SIWE_VERSION ||
    record.statement !== SIWE_STATEMENT
  ) {
    throw invalid("SIWE challenge contains unsupported fixed fields.");
  }
  const challengeId = parseWalletChallengeId(record.challengeId, "challengeId");
  const possessionChallengeId = parsePossessionChallengeId(
    record.possessionChallengeId,
    "possessionChallengeId",
  );
  const enrollmentId = parseEnrollmentId(record.enrollmentId, "enrollmentId");
  const accountId = parseAccountId(record.accountId, "accountId");
  const deviceCredentialId = parseDeviceCredentialId(
    record.deviceCredentialId,
    "deviceCredentialId",
  );
  const requestId = parseWalletChallengeId(record.requestId, "requestId");
  if (requestId !== challengeId) throw invalid("SIWE requestId must equal challengeId.");
  const purpose = parsePurpose(record.purpose);
  const audience = parseHttpsOrigin(record.audience, "SIWE audience");
  const clientId = parseAuthorityId(record.clientId, "SIWE client ID");
  const scope = parseWalletChallengeScope(record.scope, purpose);
  const origin = originFromUri(record.uri);
  const domain = parseSiweDomain(record.domain);
  if (domain !== new URL(origin).host) {
    throw invalid("SIWE domain must match the dedicated request origin.");
  }
  const device = parseDeviceKeyBinding(record.device);
  const resources = parseExactResources(record.resources);
  const expectedResources = siweResourcesFor(
    enrollmentId,
    accountId,
    deviceCredentialId,
    possessionChallengeId,
    device,
    audience,
    clientId,
    scope,
  );
  if (resources.some((resource, index) => resource !== expectedResources[index])) {
    throw invalid("SIWE resources do not bind the exact challenge and device.");
  }
  const window = parseWindow(record);
  assertKeyPackageCoversChallenge(device, window.expiresAt);
  return {
    kind: "siwe-erc4361-v1",
    challengeId,
    possessionChallengeId,
    enrollmentId,
    accountId,
    deviceCredentialId,
    scheme: "https",
    domain,
    uri: parseHttpsUrl(record.uri, "SIWE URI"),
    version: SIWE_VERSION,
    account: parseEthereumAddress(record.account, "SIWE account"),
    chainId: parseJuiceboxV6ChainId(record.chainId),
    nonce: parseNonce(record.nonce),
    ...window,
    requestId,
    statement: SIWE_STATEMENT,
    purpose,
    audience,
    clientId,
    scope,
    resources,
    device,
  };
}

function parseEip712Challenge(value: unknown): Eip712Challenge {
  const record = expectExactRecord(
    value,
    [
      "kind",
      "challengeId",
      "possessionChallengeId",
      "enrollmentId",
      "accountId",
      "deviceCredentialId",
      "account",
      "issuedAt",
      "notBefore",
      "expiresAt",
      "domain",
      "primaryType",
      "message",
      "scope",
      "device",
    ],
    "EIP-712 challenge",
  );
  if (
    record.kind !== "eip712-device-enrollment-v1" ||
    record.primaryType !== EIP712_PRIMARY_TYPE
  ) {
    throw invalid("EIP-712 challenge contains unsupported fixed fields.");
  }
  const domain = expectExactRecord(
    record.domain,
    ["name", "version", "chainId", "salt"],
    "EIP-712 domain",
  );
  if (
    domain.name !== EIP712_DOMAIN_NAME ||
    domain.version !== EIP712_DOMAIN_VERSION
  ) {
    throw invalid("EIP-712 domain name or version is unsupported.");
  }
  const message = expectExactRecord(
    record.message,
    [
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
    ],
    "EIP-712 message",
  );
  const challengeId = parseWalletChallengeId(record.challengeId, "challengeId");
  const possessionChallengeId = parsePossessionChallengeId(
    record.possessionChallengeId,
    "possessionChallengeId",
  );
  const enrollmentId = parseEnrollmentId(record.enrollmentId, "enrollmentId");
  const accountId = parseAccountId(record.accountId, "accountId");
  const deviceCredentialId = parseDeviceCredentialId(
    record.deviceCredentialId,
    "deviceCredentialId",
  );
  const account = parseEthereumAddress(record.account, "EIP-712 account");
  const purpose = parsePurpose(message.purpose);
  if (message.action !== purpose) {
    throw invalid("EIP-712 action must byte-equal its purpose.");
  }
  const protocolProfile = expectLiteral(
    message.protocolProfile,
    DEVICE_ENROLLMENT_PROTOCOL_PROFILE,
    "EIP-712 enrollment profile",
  );
  const scope = parseWalletChallengeScope(record.scope, purpose);
  const device = parseDeviceKeyBinding(record.device);
  const window = parseWindow(record);
  assertKeyPackageCoversChallenge(device, window.expiresAt);
  const scopeDigest = parseHash32(message.scopeDigest, "challenge scope digest");
  if (scopeDigest !== sha256AuthorityDigest(scope)) {
    throw invalid("EIP-712 scope digest does not match the requested scope.");
  }
  const domainChainId = parseJuiceboxV6ChainId(domain.chainId);
  const messageChainId = parseJuiceboxV6ChainId(message.chainId);
  const installationId = parseInstallationId(
    device.installationId,
    "installationId",
  );
  const installationAuthJkt = parseHash32(
    message.installationAuthJkt,
    "installation auth JKT",
  );
  const mlsCredentialPublicKey = parseHash32(
    message.mlsCredentialPublicKey,
    "MLS credential public key",
  );
  const mlsCredentialFingerprint = parseHash32(
    message.mlsCredentialFingerprint,
    "MLS credential fingerprint",
  );
  const keyPackageRef = parseHash32(
    message.keyPackageRef,
    "initial KeyPackage ref",
  );
  const keyPackageSha256 = parseHash32(
    message.keyPackageSha256,
    "initial KeyPackage SHA-256",
  );
  if (
    domainChainId !== messageChainId ||
    parseBytes16(message.challengeId, "challengeId") !== uuidToBytes16(challengeId) ||
    parseBytes16(message.possessionChallengeId, "possessionChallengeId") !==
      uuidToBytes16(possessionChallengeId) ||
    parseBytes16(message.enrollmentId, "enrollmentId") !== uuidToBytes16(enrollmentId) ||
    parseBytes16(message.accountId, "accountId") !== uuidToBytes16(accountId) ||
    parseBytes16(message.installationId, "installationId") !==
      uuidToBytes16(installationId) ||
    parseBytes16(message.deviceCredentialId, "deviceCredentialId") !==
      uuidToBytes16(deviceCredentialId) ||
    installationAuthJkt !==
      base64Url32ToHash32(device.installationAuthKey.jwkThumbprint) ||
    mlsCredentialPublicKey !==
      base64Url32ToHash32(device.mlsCredentialKey.publicKey) ||
    mlsCredentialFingerprint !==
      base64Url32ToHash32(device.mlsCredentialKey.credentialFingerprint) ||
    message.keyPackageKind !== "ordinary-mls-key-package.v1" ||
    keyPackageRef !==
      base64Url32ToHash32(device.mlsCredentialKey.initialKeyPackage.keyPackageRef) ||
    keyPackageSha256 !==
      base64Url32ToHash32(device.mlsCredentialKey.initialKeyPackage.sha256) ||
    parseUint64Seconds(message.issuedAt, "issuedAt") !==
      instantSeconds(window.issuedAt) ||
    parseUint64Seconds(message.notBefore, "notBefore") !==
      instantSeconds(window.notBefore) ||
    parseUint64Seconds(message.expiresAt, "expiresAt") !==
      instantSeconds(window.expiresAt)
  ) {
    throw invalid("EIP-712 key commitments do not match the installation binding.");
  }
  return {
    kind: "eip712-device-enrollment-v1",
    challengeId,
    possessionChallengeId,
    enrollmentId,
    accountId,
    deviceCredentialId,
    account,
    ...window,
    domain: {
      name: EIP712_DOMAIN_NAME,
      version: EIP712_DOMAIN_VERSION,
      chainId: domainChainId,
      salt: parseHash32(domain.salt, "EIP-712 domain salt"),
    },
    primaryType: EIP712_PRIMARY_TYPE,
    message: {
      challengeId: parseBytes16(message.challengeId, "challengeId"),
      possessionChallengeId: parseBytes16(
        message.possessionChallengeId,
        "possessionChallengeId",
      ),
      audience: parseHttpsOrigin(message.audience, "EIP-712 audience"),
      clientId: parseAuthorityId(message.clientId, "EIP-712 client ID"),
      origin: parseHttpsOrigin(message.origin),
      purpose,
      action: purpose,
      scopeDigest,
      enrollmentId: parseBytes16(message.enrollmentId, "enrollmentId"),
      accountId: parseBytes16(message.accountId, "accountId"),
      chainId: messageChainId,
      installationId: parseBytes16(message.installationId, "installationId"),
      deviceCredentialId: parseBytes16(
        message.deviceCredentialId,
        "deviceCredentialId",
      ),
      installationAuthProfile: expectLiteral(
        message.installationAuthProfile,
        INSTALLATION_AUTH_PROFILE,
        "installation auth profile",
      ),
      installationAuthJkt,
      mlsCredentialProfile: expectLiteral(
        message.mlsCredentialProfile,
        MLS_CREDENTIAL_PROFILE,
        "MLS credential profile",
      ),
      mlsCiphersuite: expectLiteral(
        message.mlsCiphersuite,
        MLS_CIPHERSUITE,
        "MLS ciphersuite",
      ),
      mlsCredentialPublicKey,
      mlsCredentialFingerprint,
      keyPackageKind: "ordinary-mls-key-package.v1",
      keyPackageRef,
      keyPackageSha256,
      protocolProfile,
      nonce: parseNonce(message.nonce),
      issuedAt: instantSeconds(window.issuedAt),
      notBefore: instantSeconds(window.notBefore),
      expiresAt: instantSeconds(window.expiresAt),
    },
    scope,
    device,
  };
}

function parseInstallationAuthKey(value: unknown): InstallationAuthKeyBinding {
  const record = expectExactRecord(
    value,
    ["profile", "algorithm", "publicJwk", "jwkThumbprint"],
    "installation auth key",
  );
  if (
    record.profile !== INSTALLATION_AUTH_PROFILE ||
    record.algorithm !== "P-256"
  ) {
    throw invalid("Installation auth key must use the P-256 ES256 DPoP profile.");
  }
  const jwkRecord = expectExactRecord(
    record.publicJwk,
    ["kty", "crv", "x", "y", "use", "alg"],
    "installation auth public JWK",
  );
  if (
    jwkRecord.kty !== "EC" ||
    jwkRecord.crv !== "P-256" ||
    jwkRecord.use !== "sig" ||
    jwkRecord.alg !== "ES256"
  ) {
    throw invalid("Installation auth public JWK has an unsupported profile.");
  }
  const publicJwk = {
    kty: "EC" as const,
    crv: "P-256" as const,
    x: parseBase64Url(jwkRecord.x, "P-256 JWK x", {
      minLength: 43,
      maxLength: 43,
    }),
    y: parseBase64Url(jwkRecord.y, "P-256 JWK y", {
      minLength: 43,
      maxLength: 43,
    }),
    use: "sig" as const,
    alg: "ES256" as const,
  };
  const jwkThumbprint = parseBase64Url(
    record.jwkThumbprint,
    "installation auth JKT",
    { minLength: 43, maxLength: 43 },
  );
  const canonicalJkt = sha256AuthorityBase64Url({
    crv: publicJwk.crv,
    kty: publicJwk.kty,
    x: publicJwk.x,
    y: publicJwk.y,
  });
  if (jwkThumbprint !== canonicalJkt) {
    throw invalid("Installation auth JKT does not match the canonical public JWK.");
  }
  return {
    profile: INSTALLATION_AUTH_PROFILE,
    algorithm: "P-256",
    publicJwk,
    jwkThumbprint,
  };
}

function parseMlsCredentialKey(value: unknown): MlsCredentialKeyBinding {
  const record = expectExactRecord(
    value,
    [
      "profile",
      "algorithm",
      "ciphersuite",
      "publicKey",
      "credentialFingerprint",
      "initialKeyPackage",
    ],
    "MLS credential key",
  );
  if (
    record.profile !== MLS_CREDENTIAL_PROFILE ||
    record.algorithm !== "Ed25519" ||
    record.ciphersuite !== MLS_CIPHERSUITE
  ) {
    throw invalid("MLS credential key does not use suite 0x0001 Ed25519.");
  }
  const publicKey = parseBase64Url(record.publicKey, "MLS credential public key", {
    minLength: 43,
    maxLength: 43,
  });
  const credentialFingerprint = parseBase64Url(
    record.credentialFingerprint,
    "MLS credential fingerprint",
    { minLength: 43, maxLength: 43 },
  );
  const expectedFingerprint = sha256AuthorityBase64Url({
    kind: "mls-credential-fingerprint.v1",
    profile: MLS_CREDENTIAL_PROFILE,
    algorithm: "Ed25519",
    ciphersuite: MLS_CIPHERSUITE,
    publicKey,
  });
  if (credentialFingerprint !== expectedFingerprint) {
    throw invalid("MLS credential fingerprint is not canonical.");
  }
  const keyPackage = expectExactRecord(
    record.initialKeyPackage,
    ["kind", "keyPackageRef", "sha256", "keyPackage", "expiresAt"],
    "initial MLS KeyPackage",
  );
  if (keyPackage.kind !== "ordinary-mls-key-package.v1") {
    throw invalid("Initial MLS KeyPackage must be an ordinary KeyPackage.");
  }
  const keyPackageRef = parseBase64Url(
    keyPackage.keyPackageRef,
    "initial KeyPackage ref",
    { minLength: 43, maxLength: 43 },
  );
  const sha256 = parseBase64Url(
    keyPackage.sha256,
    "initial KeyPackage SHA-256",
    { minLength: 43, maxLength: 43 },
  );
  const keyPackageBytes = parseBase64Url(
    keyPackage.keyPackage,
    "initial KeyPackage bytes",
    { minLength: 2, maxLength: maximumBase64UrlLength(MAX_KEY_PACKAGE_BYTES) },
  );
  if (sha256RawBase64Url(keyPackageBytes) !== sha256) {
    throw invalid("Initial KeyPackage SHA-256 does not match its complete bytes.");
  }
  return {
    profile: MLS_CREDENTIAL_PROFILE,
    algorithm: "Ed25519",
    ciphersuite: MLS_CIPHERSUITE,
    publicKey,
    credentialFingerprint,
    initialKeyPackage: {
      kind: "ordinary-mls-key-package.v1",
      keyPackageRef,
      sha256,
      keyPackage: keyPackageBytes,
      expiresAt: parseCanonicalInstant(
        keyPackage.expiresAt,
        "initial KeyPackage expiresAt",
      ),
    },
  };
}

export function parseWalletChallengeScope(
  value: unknown,
  purpose: WalletChallengePurpose,
): WalletChallengeScope {
  const record = expectExactRecord(
    value,
    ["kind", "project", "action"],
    "wallet challenge scope",
  );
  if (record.kind !== "wallet-challenge-scope.v1" || record.action !== purpose) {
    throw invalid("Wallet challenge scope does not match its signed purpose.");
  }
  if (purpose === "device-enrollment" && record.project !== null) {
    throw invalid("Initial device enrollment scope must not name a project.");
  }
  return {
    kind: "wallet-challenge-scope.v1",
    project: null,
    action: purpose,
  };
}

function scopesEqual(
  left: WalletChallengeScope,
  right: WalletChallengeScope,
): boolean {
  return sha256AuthorityDigest(left) === sha256AuthorityDigest(right);
}

function expectLiteral<const T extends string>(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (value !== expected) throw invalid(`${label} is unsupported.`);
  return expected;
}

function parseWindow(record: Record<string, unknown>): ChallengeWindow {
  const issuedAt = parseCanonicalInstant(record.issuedAt, "issuedAt");
  const notBefore = parseCanonicalInstant(record.notBefore, "notBefore");
  const expiresAt = parseCanonicalInstant(record.expiresAt, "expiresAt");
  const issuedMs = instantMilliseconds(issuedAt);
  const notBeforeMs = instantMilliseconds(notBefore);
  const expiresMs = instantMilliseconds(expiresAt);
  if (
    notBeforeMs < issuedMs ||
    expiresMs <= notBeforeMs ||
    expiresMs - issuedMs > MAX_CHALLENGE_LIFETIME_MS
  ) {
    throw invalid("Wallet challenge time window is invalid or too long.");
  }
  return { issuedAt, notBefore, expiresAt };
}

function parsePurpose(value: unknown): WalletChallengePurpose {
  if (value !== "device-enrollment") {
    throw invalid("Wallet challenge purpose is unsupported.");
  }
  return "device-enrollment";
}

function parseNonce(value: unknown): Base64Url {
  if (typeof value !== "string" || !/^[A-Za-z0-9]{22,64}$/.test(value)) {
    throw invalid("SIWE nonce must be bounded alphanumeric entropy.");
  }
  return value as Base64Url;
}

function originFromUri(value: unknown): HttpsOrigin {
  const uri = parseHttpsUrl(value, "SIWE URI");
  const url = new URL(uri);
  if (url.pathname !== "/auth/wallet" || url.search) {
    throw invalid("SIWE URI must be the dedicated wallet authentication resource.");
  }
  return parseHttpsOrigin(url.origin);
}

function parseExactResources(
  value: unknown,
): SiweChallenge["resources"] {
  if (!Array.isArray(value) || value.length !== 13) {
    throw invalid("SIWE challenge must contain exactly thirteen bound resources.");
  }
  for (const resource of value) {
    if (
      typeof resource !== "string" ||
      resource.length < 1 ||
      resource.length > 512 ||
      /[\u0000-\u001F\u007F]/.test(resource)
    ) {
      throw invalid("SIWE resource is invalid.");
    }
  }
  return value as unknown as SiweChallenge["resources"];
}

function parseNamespacedUuid<Namespace extends string>(
  value: unknown,
  version: 4 | 7,
  label: string,
): EnrollmentUuidNamespace<Namespace> {
  const expression =
    version === 4
      ? /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      : /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  if (
    typeof value !== "string" ||
    !expression.test(value)
  ) {
    throw invalid(`${label} must be a lowercase canonical UUIDv${version}.`);
  }
  return parseAuthorityId(value, label) as EnrollmentUuidNamespace<Namespace>;
}

export function parseEnrollmentId(value: unknown, label = "enrollmentId"): EnrollmentId {
  return parseNamespacedUuid(value, 7, label);
}

export function parseWalletChallengeId(
  value: unknown,
  label = "walletChallengeId",
): WalletChallengeId {
  return parseNamespacedUuid(value, 7, label);
}

export function parsePossessionChallengeId(
  value: unknown,
  label = "possessionChallengeId",
): PossessionChallengeId {
  return parseNamespacedUuid(value, 7, label);
}

export function parseAccountId(value: unknown, label = "accountId"): AccountId {
  return parseNamespacedUuid(value, 4, label);
}

export function parseInstallationId(
  value: unknown,
  label = "installationId",
): InstallationId {
  return parseNamespacedUuid(value, 4, label);
}

export function parseDeviceCredentialId(
  value: unknown,
  label = "deviceCredentialId",
): DeviceCredentialId {
  return parseNamespacedUuid(value, 4, label);
}

function uuidToBytes16(value: AuthorityId): HexBytes {
  return `0x${value.replaceAll("-", "")}` as HexBytes;
}

function parseBytes16(value: unknown, label: string): HexBytes {
  if (typeof value !== "string" || !/^0x[0-9a-f]{32}$/.test(value)) {
    throw invalid(`${label} must be canonical 16-byte hexadecimal data.`);
  }
  return value as HexBytes;
}

function base64Url32ToHash32(value: Base64Url): Hash32 {
  return `0x${Buffer.from(value, "base64url").toString("hex")}` as Hash32;
}

function sha256RawBase64Url(value: Base64Url): Base64Url {
  return createHash("sha256")
    .update(Buffer.from(value, "base64url"))
    .digest("base64url") as Base64Url;
}

function maximumBase64UrlLength(bytes: number): number {
  return Math.ceil((bytes * 4) / 3);
}

function parseUint64Seconds(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    Object.is(value, -0)
  ) {
    throw invalid(`${label} must be canonical uint64 Unix seconds.`);
  }
  return value;
}

function instantSeconds(value: CanonicalInstant): number {
  const milliseconds = instantMilliseconds(value);
  if (milliseconds % 1000 !== 0) {
    throw invalid("EIP-712 challenge times must resolve to whole Unix seconds.");
  }
  return milliseconds / 1000;
}

function assertKeyPackageCoversChallenge(
  device: DeviceKeyBinding,
  challengeExpiresAt: CanonicalInstant,
): void {
  if (
    instantMilliseconds(device.mlsCredentialKey.initialKeyPackage.expiresAt) <=
    instantMilliseconds(challengeExpiresAt)
  ) {
    throw invalid("Initial KeyPackage must remain valid beyond the challenge window.");
  }
}

function challengeIssuedAt(challenge: WalletChallenge): CanonicalInstant {
  return challenge.kind === "siwe-erc4361-v1"
    ? challenge.issuedAt
    : challenge.issuedAt;
}

function challengeIdOf(challenge: WalletChallenge): WalletChallengeId {
  return challenge.kind === "siwe-erc4361-v1"
    ? challenge.challengeId
    : challenge.challengeId;
}

function challengeBinding(challenge: WalletChallenge): {
  challengeId: WalletChallengeId;
  possessionChallengeId: PossessionChallengeId;
  enrollmentId: EnrollmentId;
  accountId: AccountId;
  deviceCredentialId: DeviceCredentialId;
  account: EthereumAddress;
  chainId: JuiceboxV6ChainId;
  origin: HttpsOrigin;
  audience: HttpsOrigin;
  clientId: AuthorityId;
  scope: WalletChallengeScope;
  purpose: WalletChallengePurpose;
  device: DeviceKeyBinding;
  issuedAt: CanonicalInstant;
  notBefore: CanonicalInstant;
  expiresAt: CanonicalInstant;
} {
  if (challenge.kind === "siwe-erc4361-v1") {
    return {
      challengeId: challenge.challengeId,
      possessionChallengeId: challenge.possessionChallengeId,
      enrollmentId: challenge.enrollmentId,
      accountId: challenge.accountId,
      deviceCredentialId: challenge.deviceCredentialId,
      account: challenge.account,
      chainId: challenge.chainId,
      origin: parseHttpsOrigin(new URL(challenge.uri).origin),
      audience: challenge.audience,
      clientId: challenge.clientId,
      scope: challenge.scope,
      purpose: challenge.purpose,
      device: challenge.device,
      issuedAt: challenge.issuedAt,
      notBefore: challenge.notBefore,
      expiresAt: challenge.expiresAt,
    };
  }
  return {
    challengeId: challenge.challengeId,
    possessionChallengeId: challenge.possessionChallengeId,
    enrollmentId: challenge.enrollmentId,
    accountId: challenge.accountId,
    deviceCredentialId: challenge.deviceCredentialId,
    account: challenge.account,
    chainId: challenge.domain.chainId,
    origin: challenge.message.origin,
    audience: challenge.message.audience,
    clientId: challenge.message.clientId,
    scope: challenge.scope,
    purpose: challenge.message.purpose,
    device: challenge.device,
    issuedAt: challenge.issuedAt,
    notBefore: challenge.notBefore,
    expiresAt: challenge.expiresAt,
  };
}

function deviceBindingsEqual(
  left: DeviceKeyBinding,
  right: DeviceKeyBinding,
): boolean {
  return (
    sha256AuthorityDigest(left) === sha256AuthorityDigest(right)
  );
}

function invalid(message: string): AuthorityValidationError {
  return new AuthorityValidationError(message);
}
