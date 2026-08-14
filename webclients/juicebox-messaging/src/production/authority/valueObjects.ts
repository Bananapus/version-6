declare const authorityValueBrand: unique symbol;

type Brand<Name extends string> = { readonly [authorityValueBrand]: Name };

export type EthereumAddress = string & Brand<"EthereumAddress">;
export type Hash32 = string & Brand<"Hash32">;
export type HexBytes = string & Brand<"HexBytes">;
export type Uint256Decimal = string & Brand<"Uint256Decimal">;
export type CanonicalInstant = string & Brand<"CanonicalInstant">;
export type AuthorityId = string & Brand<"AuthorityId">;
export type Base64Url = string & Brand<"Base64Url">;
export type HttpsOrigin = string & Brand<"HttpsOrigin">;
export type HttpsUrl = string & Brand<"HttpsUrl">;
export type SiweDomain = string & Brand<"SiweDomain">;

export type JuiceboxV6ChainId =
  | 1
  | 10
  | 8453
  | 42161
  | 11155111
  | 11155420
  | 84532
  | 421614;

export interface JuiceboxV6ProjectRef {
  protocol: "juicebox-v6";
  chainId: JuiceboxV6ChainId;
  projectId: number;
  version: 6;
  deploymentManifestId: AuthorityId;
  projectsContract: EthereumAddress;
}

const UINT256_MAX = (1n << 256n) - 1n;
const CANONICAL_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const AUTHORITY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const ASCII = /^[\x20-\x7E]+$/;

const CHAIN_IDS = new Set<number>([
  1, 10, 8453, 42161, 11155111, 11155420, 84532, 421614,
]);

export class AuthorityValidationError extends Error {
  readonly code = "invalid_authority_input";

  constructor(message: string) {
    super(message);
    this.name = "AuthorityValidationError";
  }
}

export function expectExactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(`${label} must be a plain object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw invalid(`${label} must be a plain object.`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record);
  if (
    actual.length !== keys.length ||
    keys.some((key) => !Object.hasOwn(record, key)) ||
    actual.some((key) => !keys.includes(key) || record[key] === undefined)
  ) {
    throw invalid(`${label} has an unexpected shape.`);
  }
  return record;
}

export function parseEthereumAddress(
  value: unknown,
  label = "address",
  options: { allowZero?: boolean } = {},
): EthereumAddress {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw invalid(`${label} must be a 20-byte hex address.`);
  }
  const normalized = value.toLowerCase();
  if (!options.allowZero && normalized === `0x${"0".repeat(40)}`) {
    throw invalid(`${label} must not be the zero address.`);
  }
  return normalized as EthereumAddress;
}

export function parseHash32(value: unknown, label = "hash"): Hash32 {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw invalid(`${label} must be a 32-byte hex value.`);
  }
  return value.toLowerCase() as Hash32;
}

export function parseHexBytes(
  value: unknown,
  label = "hex bytes",
  options: { minBytes?: number; maxBytes?: number } = {},
): HexBytes {
  const minBytes = options.minBytes ?? 1;
  const maxBytes = options.maxBytes ?? 16 * 1024;
  if (
    typeof value !== "string" ||
    !/^0x(?:[0-9a-fA-F]{2})*$/.test(value) ||
    (value.length - 2) / 2 < minBytes ||
    (value.length - 2) / 2 > maxBytes
  ) {
    throw invalid(`${label} is not bounded hexadecimal bytes.`);
  }
  return value.toLowerCase() as HexBytes;
}

export function parseUint256Decimal(
  value: unknown,
  label = "uint256",
): Uint256Decimal {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
    throw invalid(`${label} must be a canonical decimal string.`);
  }
  if (value.length > 78 || BigInt(value) > UINT256_MAX) {
    throw invalid(`${label} exceeds uint256.`);
  }
  return value as Uint256Decimal;
}

export function parseLogIndex(value: unknown, label = "logIndex"): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    Object.is(value, -0)
  ) {
    throw invalid(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

export function parseCanonicalInstant(
  value: unknown,
  label = "timestamp",
): CanonicalInstant {
  if (typeof value !== "string" || !CANONICAL_INSTANT.test(value)) {
    throw invalid(`${label} must be canonical UTC RFC 3339 with milliseconds.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw invalid(`${label} is not a real canonical instant.`);
  }
  return value as CanonicalInstant;
}

export function parseAuthorityId(value: unknown, label = "id"): AuthorityId {
  if (typeof value !== "string" || !AUTHORITY_ID.test(value)) {
    throw invalid(`${label} is invalid.`);
  }
  return value as AuthorityId;
}

export function parseBase64Url(
  value: unknown,
  label = "base64url",
  options: { minLength?: number; maxLength?: number } = {},
): Base64Url {
  const minLength = options.minLength ?? 1;
  const maxLength = options.maxLength ?? 4096;
  if (
    typeof value !== "string" ||
    value.length < minLength ||
    value.length > maxLength ||
    !BASE64URL.test(value)
  ) {
    throw invalid(`${label} must be unpadded bounded base64url.`);
  }
  const remainder = value.length % 4;
  const lastValue = BASE64URL_ALPHABET.indexOf(value.at(-1) ?? "");
  if (
    remainder === 1 ||
    (remainder === 2 && (lastValue & 0b1111) !== 0) ||
    (remainder === 3 && (lastValue & 0b11) !== 0)
  ) {
    throw invalid(`${label} has non-canonical base64url tail bits.`);
  }
  return value as Base64Url;
}

export function parseHttpsOrigin(value: unknown, label = "origin"): HttpsOrigin {
  if (
    typeof value !== "string" ||
    value.length > 255 ||
    !ASCII.test(value) ||
    value.endsWith(".")
  ) {
    throw invalid(`${label} must be a canonical ASCII HTTPS origin.`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid(`${label} must be a canonical ASCII HTTPS origin.`);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.origin !== value ||
    url.hostname.endsWith(".")
  ) {
    throw invalid(`${label} must be a canonical ASCII HTTPS origin.`);
  }
  return value as HttpsOrigin;
}

export function parseHttpsUrl(value: unknown, label = "url"): HttpsUrl {
  if (typeof value !== "string" || value.length > 2048 || !ASCII.test(value)) {
    throw invalid(`${label} must be a canonical ASCII HTTPS URL.`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid(`${label} must be a canonical ASCII HTTPS URL.`);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.toString() !== value
  ) {
    throw invalid(`${label} must be a canonical ASCII HTTPS URL.`);
  }
  return value as HttpsUrl;
}

export function parseSiweDomain(value: unknown, label = "domain"): SiweDomain {
  if (
    typeof value !== "string" ||
    value.length > 253 ||
    !ASCII.test(value) ||
    value.includes("@")
  ) {
    throw invalid(`${label} must be a canonical SIWE authority.`);
  }
  let url: URL;
  try {
    url = new URL(`https://${value}`);
  } catch {
    throw invalid(`${label} must be a canonical SIWE authority.`);
  }
  if (
    url.host !== value ||
    url.hostname.endsWith(".") ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw invalid(`${label} must be a canonical SIWE authority.`);
  }
  return value as SiweDomain;
}

export function parseJuiceboxV6ChainId(
  value: unknown,
  label = "chainId",
): JuiceboxV6ChainId {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    !CHAIN_IDS.has(value)
  ) {
    throw invalid(`${label} is not an allowlisted Juicebox v6 chain.`);
  }
  return value as JuiceboxV6ChainId;
}

export function parseJuiceboxV6ProjectRef(
  value: unknown,
  label = "project",
): JuiceboxV6ProjectRef {
  const record = expectExactRecord(
    value,
    [
      "protocol",
      "chainId",
      "projectId",
      "version",
      "deploymentManifestId",
      "projectsContract",
    ],
    label,
  );
  if (record.protocol !== "juicebox-v6" || record.version !== 6) {
    throw invalid(`${label} must identify Juicebox v6 exactly.`);
  }
  if (
    typeof record.projectId !== "number" ||
    !Number.isSafeInteger(record.projectId) ||
    record.projectId < 1 ||
    Object.is(record.projectId, -0)
  ) {
    throw invalid(`${label}.projectId must be a positive safe integer.`);
  }
  return {
    protocol: "juicebox-v6",
    chainId: parseJuiceboxV6ChainId(record.chainId, `${label}.chainId`),
    projectId: record.projectId,
    version: 6,
    deploymentManifestId: parseAuthorityId(
      record.deploymentManifestId,
      `${label}.deploymentManifestId`,
    ),
    projectsContract: parseEthereumAddress(
      record.projectsContract,
      `${label}.projectsContract`,
    ),
  };
}

export function instantMilliseconds(value: CanonicalInstant): number {
  const milliseconds = new Date(value).getTime();
  if (!Number.isFinite(milliseconds)) {
    throw invalid("Canonical instant is invalid at runtime.");
  }
  return milliseconds;
}

export function sameJuiceboxV6ProjectRef(
  left: JuiceboxV6ProjectRef,
  right: JuiceboxV6ProjectRef,
): boolean {
  return (
    left.protocol === right.protocol &&
    left.version === right.version &&
    left.chainId === right.chainId &&
    left.projectId === right.projectId &&
    left.deploymentManifestId === right.deploymentManifestId &&
    left.projectsContract === right.projectsContract
  );
}

function invalid(message: string): AuthorityValidationError {
  return new AuthorityValidationError(message);
}
