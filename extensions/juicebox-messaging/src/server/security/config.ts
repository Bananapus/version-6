import { isIP } from "node:net";

const SECURITY_MODE_ENV = "JUICEBOX_MESSAGING_WEB_SECURITY_MODE";
const CANONICAL_ORIGIN_ENV = "JUICEBOX_MESSAGING_CANONICAL_ORIGIN";
const EMBED_INTEGRATIONS_ENV = "JUICEBOX_MESSAGING_EMBED_INTEGRATIONS";
const DEFAULT_LOCAL_LAB_PORT = 3004;

const DEVELOPMENT_LAB_ENV_NAMESPACES = Object.freeze([
  "JUICEBOX_MESSAGING_DEV_SERVICE",
  "JUICEBOX_MESSAGING_DEV_BOOTSTRAP",
  "JUICEBOX_MESSAGING_DEV_DB",
  "JUICEBOX_MESSAGING_ALLOWED_DEV_ORIGINS",
  "JUICEBOX_MESSAGING_ALLOWED_NEXT_DEV_HOSTS",
  // Legacy input used only by the development messaging service's removed
  // production branch. Production has one canonical-origin setting instead.
  "JUICEBOX_MESSAGING_PUBLIC_ORIGIN",
]);

const MAX_INTEGRATIONS_JSON_BYTES = 32_768;
const MAX_INTEGRATIONS = 64;
const MAX_FRAME_ANCESTORS = 16;
const MAX_ORIGIN_LENGTH = 512;
const TENANT_PUBLIC_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const RESERVED_OBJECT_KEYS = new Set([
  ...Object.getOwnPropertyNames(Object.prototype),
  "__proto__",
  "prototype",
]);

export type WebSecurityMode = "local-lab" | "production";

export interface EmbedIntegrationSecurityConfig {
  readonly tenantPublicId: string;
  readonly frameAncestors: readonly string[];
}

export interface LocalLabWebSecurityConfig {
  readonly mode: "local-lab";
  readonly canonicalOrigin: null;
  readonly embedIntegrations: readonly EmbedIntegrationSecurityConfig[];
  readonly localLabOrigins: readonly string[];
}

export interface ProductionWebSecurityConfig {
  readonly mode: "production";
  readonly canonicalOrigin: string;
  readonly embedIntegrations: readonly EmbedIntegrationSecurityConfig[];
  readonly localLabOrigins: readonly string[];
}

export type WebSecurityConfig =
  | LocalLabWebSecurityConfig
  | ProductionWebSecurityConfig;

type Environment = Readonly<Record<string, string | undefined>>;

/**
 * Parse the browser-facing deployment boundary. Development and test may infer
 * the closed local lab. Optimized builds and runtime must name a mode so an
 * incomplete production deployment cannot silently inherit lab policy.
 */
export function loadWebSecurityConfig(environment: Environment): WebSecurityConfig {
  const rawMode = environment[SECURITY_MODE_ENV];
  const mode = inferSecurityMode(rawMode, environment.NODE_ENV);

  if (mode === "local-lab") {
    rejectIgnoredProductionSetting(environment, CANONICAL_ORIGIN_ENV);
    rejectIgnoredProductionSetting(environment, EMBED_INTEGRATIONS_ENV);

    const localLabPort = parseLocalLabPort(environment.PORT);
    return Object.freeze({
      mode: "local-lab",
      canonicalOrigin: null,
      embedIntegrations: Object.freeze([]),
      localLabOrigins: Object.freeze([
        `http://localhost:${localLabPort}`,
        `http://127.0.0.1:${localLabPort}`,
      ]),
    });
  }

  if (mode !== "production") {
    throw new WebSecurityConfigurationError(
      `${SECURITY_MODE_ENV} must be either local-lab or production.`,
    );
  }

  rejectDevelopmentLabSettings(environment);

  const canonicalOrigin = parseProductionHttpsOrigin(
    requireSetting(environment, CANONICAL_ORIGIN_ENV),
    CANONICAL_ORIGIN_ENV,
  );
  const embedIntegrations = parseEmbedIntegrations(
    requireSetting(environment, EMBED_INTEGRATIONS_ENV),
    canonicalOrigin,
  );

  return Object.freeze({
    mode: "production",
    canonicalOrigin,
    embedIntegrations: Object.freeze(embedIntegrations),
    localLabOrigins: Object.freeze([]),
  });
}

function inferSecurityMode(
  rawMode: string | undefined,
  nodeEnvironment: string | undefined,
): string {
  if (rawMode !== undefined && rawMode !== "") return rawMode;
  if (nodeEnvironment === "development" || nodeEnvironment === "test") {
    return "local-lab";
  }
  throw new WebSecurityConfigurationError(
    `${SECURITY_MODE_ENV} is required outside development and test.`,
  );
}

export class WebSecurityConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebSecurityConfigurationError";
  }
}

function rejectIgnoredProductionSetting(environment: Environment, key: string): void {
  if (environment[key] !== undefined) {
    throw new WebSecurityConfigurationError(
      `${key} is production-only; set ${SECURITY_MODE_ENV}=production or remove it.`,
    );
  }
}

function rejectDevelopmentLabSettings(environment: Environment): void {
  const forbiddenKeys = Object.keys(environment)
    .filter((key) =>
      DEVELOPMENT_LAB_ENV_NAMESPACES.some(
        (namespace) => key === namespace || key.startsWith(`${namespace}_`),
      ),
    )
    .sort();
  if (forbiddenKeys.length === 0) return;

  throw new WebSecurityConfigurationError(
    `Production mode forbids development-lab environment keys: ${forbiddenKeys.join(
      ", ",
    )}.`,
  );
}

function requireSetting(environment: Environment, key: string): string {
  const value = environment[key];
  if (value === undefined || value.length === 0) {
    throw new WebSecurityConfigurationError(`${key} is required in production mode.`);
  }
  if (value !== value.trim()) {
    throw new WebSecurityConfigurationError(`${key} must not contain surrounding whitespace.`);
  }
  return value;
}

function parseLocalLabPort(value: string | undefined): number {
  if (value === undefined || value === "") return DEFAULT_LOCAL_LAB_PORT;
  if (!/^[1-9]\d{0,4}$/.test(value)) {
    throw new WebSecurityConfigurationError("PORT must be a canonical TCP port number.");
  }
  const port = Number(value);
  if (port > 65_535) {
    throw new WebSecurityConfigurationError("PORT must be a canonical TCP port number.");
  }
  return port;
}

function parseEmbedIntegrations(
  value: string,
  canonicalOrigin: string,
): EmbedIntegrationSecurityConfig[] {
  if (Buffer.byteLength(value, "utf8") > MAX_INTEGRATIONS_JSON_BYTES) {
    throw new WebSecurityConfigurationError(
      `${EMBED_INTEGRATIONS_ENV} exceeds ${MAX_INTEGRATIONS_JSON_BYTES} bytes.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new WebSecurityConfigurationError(
      `${EMBED_INTEGRATIONS_ENV} must be valid JSON.`,
    );
  }

  if (!isPlainRecord(parsed)) {
    throw new WebSecurityConfigurationError(
      `${EMBED_INTEGRATIONS_ENV} must be a JSON object keyed by tenantPublicId.`,
    );
  }

  const entries = Object.entries(parsed);
  if (entries.length > MAX_INTEGRATIONS) {
    throw new WebSecurityConfigurationError(
      `${EMBED_INTEGRATIONS_ENV} supports at most ${MAX_INTEGRATIONS} integrations.`,
    );
  }

  return entries
    .map(([tenantPublicId, rawIntegration]) =>
      parseEmbedIntegration(tenantPublicId, rawIntegration, canonicalOrigin),
    )
    .sort((left, right) => left.tenantPublicId.localeCompare(right.tenantPublicId));
}

function parseEmbedIntegration(
  tenantPublicId: string,
  value: unknown,
  canonicalOrigin: string,
): EmbedIntegrationSecurityConfig {
  if (
    !TENANT_PUBLIC_ID.test(tenantPublicId) ||
    RESERVED_OBJECT_KEYS.has(tenantPublicId)
  ) {
    throw new WebSecurityConfigurationError(
      `Invalid tenantPublicId ${JSON.stringify(tenantPublicId)} in ${EMBED_INTEGRATIONS_ENV}.`,
    );
  }
  if (!isPlainRecord(value)) {
    throw new WebSecurityConfigurationError(
      `${EMBED_INTEGRATIONS_ENV}.${tenantPublicId} must be an object.`,
    );
  }

  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "frameAncestors") {
    throw new WebSecurityConfigurationError(
      `${EMBED_INTEGRATIONS_ENV}.${tenantPublicId} accepts only frameAncestors.`,
    );
  }

  const rawAncestors = value.frameAncestors;
  if (!Array.isArray(rawAncestors) || rawAncestors.length === 0) {
    throw new WebSecurityConfigurationError(
      `${EMBED_INTEGRATIONS_ENV}.${tenantPublicId}.frameAncestors must be a non-empty array.`,
    );
  }
  if (rawAncestors.length > MAX_FRAME_ANCESTORS) {
    throw new WebSecurityConfigurationError(
      `${EMBED_INTEGRATIONS_ENV}.${tenantPublicId}.frameAncestors supports at most ${MAX_FRAME_ANCESTORS} origins.`,
    );
  }

  const ancestors = rawAncestors.map((origin, index) => {
    if (typeof origin !== "string") {
      throw new WebSecurityConfigurationError(
        `${EMBED_INTEGRATIONS_ENV}.${tenantPublicId}.frameAncestors[${index}] must be a string.`,
      );
    }
    return parseProductionHttpsOrigin(
      origin,
      `${EMBED_INTEGRATIONS_ENV}.${tenantPublicId}.frameAncestors[${index}]`,
    );
  });

  if (new Set(ancestors).size !== ancestors.length) {
    throw new WebSecurityConfigurationError(
      `${EMBED_INTEGRATIONS_ENV}.${tenantPublicId}.frameAncestors contains a duplicate origin.`,
    );
  }
  if (ancestors.includes(canonicalOrigin)) {
    throw new WebSecurityConfigurationError(
      `${EMBED_INTEGRATIONS_ENV}.${tenantPublicId}.frameAncestors must remain cross-origin from ${CANONICAL_ORIGIN_ENV}.`,
    );
  }

  return Object.freeze({
    tenantPublicId,
    frameAncestors: Object.freeze([...ancestors].sort()),
  });
}

function parseProductionHttpsOrigin(value: string, settingName: string): string {
  if (value.length > MAX_ORIGIN_LENGTH || value !== value.trim()) {
    throw new WebSecurityConfigurationError(
      `${settingName} must be a normalized HTTPS origin without whitespace.`,
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new WebSecurityConfigurationError(`${settingName} must be a valid HTTPS origin.`);
  }

  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.origin !== value ||
    !isProductionHostname(url.hostname)
  ) {
    throw new WebSecurityConfigurationError(
      `${settingName} must be an exact normalized HTTPS origin with a DNS-shaped hostname and no port, path, query, fragment, credentials, or wildcard.`,
    );
  }

  return url.origin;
}

function isProductionHostname(hostname: string): boolean {
  if (
    hostname.length > 253 ||
    hostname.split(".").length < 2 ||
    isIP(hostname) !== 0
  ) {
    return false;
  }
  const labels = hostname.split(".");
  return (
    /[a-z]/.test(labels.at(-1) ?? "") &&
    labels.every(
      (label) =>
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
