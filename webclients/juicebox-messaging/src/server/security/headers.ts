import type { WebSecurityConfig } from "./config";

export interface SecurityHeader {
  readonly key: string;
  readonly value: string;
}

export interface SecurityHeaderRule {
  readonly source: string;
  readonly headers: readonly SecurityHeader[];
}

type RuntimeEnvironment = "development" | "production" | "test";
type DocumentKind = "top-level" | "embed";

const PRODUCTION_NONCE = /^[A-Za-z0-9+/]{43}=$/;

const NO_STORE = "private, no-store, max-age=0, must-revalidate";
const REVALIDATE_PUBLIC_ASSET = "public, max-age=3600, must-revalidate";
const DOCUMENT_POLICY_SOURCE =
  "/((?!_next/static(?:/|$)|_next/image(?:/|$)).*)";
const NON_IMMUTABLE_RESPONSE_SOURCE = "/((?!_next/static(?:/|$)).*)";
const SERVICE_WORKER_POLICY =
  "default-src 'none'; base-uri 'none'; connect-src 'none'; object-src 'none'; script-src 'none';";

const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "ambient-light-sensor=()",
  "autoplay=()",
  "attribution-reporting=()",
  "bluetooth=()",
  "browsing-topics=()",
  "camera=()",
  "clipboard-read=()",
  "clipboard-write=(self)",
  "cross-origin-isolated=()",
  "display-capture=()",
  "encrypted-media=()",
  "fullscreen=()",
  "geolocation=()",
  "gyroscope=()",
  "gamepad=()",
  "hid=()",
  "identity-credentials-get=()",
  "idle-detection=()",
  "local-fonts=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "otp-credentials=()",
  "payment=()",
  "picture-in-picture=()",
  "publickey-credentials-create=(self)",
  "publickey-credentials-get=(self)",
  "screen-wake-lock=()",
  "serial=()",
  "speaker-selection=()",
  "storage-access=(self)",
  "sync-xhr=()",
  "usb=()",
  "web-share=(self)",
  "window-management=()",
  "xr-spatial-tracking=()",
].join(", ");

const EMBED_PERMISSIONS_POLICY = [
  "accelerometer=()",
  "ambient-light-sensor=()",
  "autoplay=()",
  "attribution-reporting=()",
  "bluetooth=()",
  "browsing-topics=()",
  "camera=()",
  "clipboard-read=()",
  "clipboard-write=()",
  "cross-origin-isolated=()",
  "display-capture=()",
  "encrypted-media=()",
  "fullscreen=()",
  "geolocation=()",
  "gyroscope=()",
  "gamepad=()",
  "hid=()",
  "identity-credentials-get=()",
  "idle-detection=()",
  "local-fonts=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "otp-credentials=()",
  "payment=()",
  "picture-in-picture=()",
  "publickey-credentials-create=()",
  "publickey-credentials-get=()",
  "screen-wake-lock=()",
  "serial=()",
  "speaker-selection=()",
  "storage-access=()",
  "sync-xhr=()",
  "usb=()",
  "web-share=()",
  "window-management=()",
  "xr-spatial-tracking=()",
].join(", ");

/**
 * Build static response-header rules. In production this is a fail-closed
 * fallback without inline execution. `src/proxy.ts` replaces it with a strict
 * per-request nonce policy before dynamic rendering.
 */
export function buildWebSecurityHeaderRules(
  config: WebSecurityConfig,
  runtimeEnvironment: RuntimeEnvironment,
): SecurityHeaderRule[] {
  const production = config.mode === "production";
  const commonHeaders: SecurityHeader[] = [
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "Origin-Agent-Cluster", value: "?1" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ];

  if (production) {
    commonHeaders.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000",
    });
  }

  const rules: SecurityHeaderRule[] = [
    {
      source: "/:path*",
      headers: commonHeaders,
    },
    {
      // Hashed framework assets do not need a document CSP, and a response CSP
      // would become the worker policy if a content-addressed chunk were ever
      // loaded as a Worker. Proxy uses the same asset exclusion.
      source: DOCUMENT_POLICY_SOURCE,
      headers: [
        {
          key: "Content-Security-Policy",
          value: buildContentSecurityPolicy(
            config,
            ["'none'"],
            runtimeEnvironment,
          ),
        },
      ],
    },
    {
      // Do not override Next's one-year immutable policy for content-addressed
      // build assets. This uses the documented negative-matcher form rather
      // than trying to restate a framework-owned cache policy.
      source: NON_IMMUTABLE_RESPONSE_SOURCE,
      headers: [{ key: "Cache-Control", value: NO_STORE }],
    },
    {
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" },
        ...(production
          ? [
              {
                key: "Content-Security-Policy",
                // This worker has no imports, eval, or network access. Any
                // future dependency requires an explicit policy review.
                value: SERVICE_WORKER_POLICY,
              },
            ]
          : []),
      ],
    },
    {
      source: "/icon.svg",
      headers: [{ key: "Cache-Control", value: REVALIDATE_PUBLIC_ASSET }],
    },
    {
      source: "/manifest.webmanifest",
      headers: [{ key: "Cache-Control", value: REVALIDATE_PUBLIC_ASSET }],
    },
  ];

  if (config.mode === "local-lab") {
    rules.push({
      source: "/embed-preview/frame",
      headers: [
        {
          key: "Content-Security-Policy",
          value: buildContentSecurityPolicy(
            config,
            config.localLabOrigins,
            runtimeEnvironment,
            undefined,
            "embed",
          ),
        },
        { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        { key: "Permissions-Policy", value: EMBED_PERMISSIONS_POLICY },
      ],
    });
  } else {
    rules.push({
      source: "/embed/:tenantPublicId",
      headers: [
        {
          key: "Content-Security-Policy",
          value: buildContentSecurityPolicy(
            config,
            ["'none'"],
            runtimeEnvironment,
            undefined,
            "embed",
          ),
        },
        { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        { key: "Permissions-Policy", value: EMBED_PERMISSIONS_POLICY },
      ],
    });
  }

  return rules;
}

export function buildContentSecurityPolicy(
  config: WebSecurityConfig,
  frameAncestors: readonly string[],
  runtimeEnvironment: RuntimeEnvironment,
  nonce?: string,
  documentKind: DocumentKind = "top-level",
): string {
  const development = runtimeEnvironment === "development";
  const connectSources = development ? "'self' ws: wss:" : "'self'";
  const scriptSources = buildScriptSources(config, development, nonce);
  const styleSources = buildStyleSources(config, development, nonce);
  const frameSources =
    documentKind === "embed"
      ? "'none'"
      : config.mode === "local-lab"
      ? ["'self'", ...config.localLabOrigins].join(" ")
      : "'self'";
  const formAction = documentKind === "embed" ? "'none'" : "'self'";

  const directives = [
    "default-src 'none'",
    "base-uri 'none'",
    `connect-src ${connectSources}`,
    "font-src 'self'",
    `form-action ${formAction}`,
    `frame-ancestors ${frameAncestors.join(" ")}`,
    `frame-src ${frameSources}`,
    "img-src 'self' data: blob:",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    `script-src ${scriptSources}`,
    "script-src-attr 'none'",
    `style-src ${styleSources}`,
    "style-src-attr 'none'",
    "worker-src 'self'",
  ];

  if (config.mode === "production") {
    directives.push(
      "require-trusted-types-for 'script'",
      documentKind === "embed"
        ? "trusted-types nextjs nextjs#bundler"
        : "trusted-types nextjs nextjs#bundler juicebox-messaging#service-worker",
      "upgrade-insecure-requests",
    );
  }
  if (documentKind === "embed") {
    directives.push("sandbox allow-scripts allow-same-origin");
  }
  return `${directives.join("; ")};`;
}

export function frameAncestorsForPath(
  config: WebSecurityConfig,
  pathname: string,
): readonly string[] {
  if (config.mode === "local-lab") {
    return pathname === "/embed-preview/frame"
      ? config.localLabOrigins
      : ["'none'"];
  }

  const integration = config.embedIntegrations.find(
    ({ tenantPublicId }) => pathname === `/embed/${tenantPublicId}`,
  );
  return integration?.frameAncestors ?? ["'none'"];
}

export function permissionsPolicyForDocument(documentKind: DocumentKind): string {
  return documentKind === "embed" ? EMBED_PERMISSIONS_POLICY : PERMISSIONS_POLICY;
}

function buildScriptSources(
  config: WebSecurityConfig,
  development: boolean,
  nonce: string | undefined,
): string {
  if (config.mode === "local-lab" && development) {
    return "'self' 'unsafe-inline' 'unsafe-eval'";
  }
  if (config.mode === "local-lab" && nonce === undefined) {
    return "'self' 'unsafe-inline'";
  }
  if (nonce === undefined) return "'none'";
  assertProductionNonce(nonce);
  return `'nonce-${nonce}' 'strict-dynamic'`;
}

function buildStyleSources(
  config: WebSecurityConfig,
  development: boolean,
  nonce: string | undefined,
): string {
  if (
    config.mode === "local-lab" &&
    (development || nonce === undefined)
  ) {
    return "'self' 'unsafe-inline'";
  }
  if (nonce === undefined) return "'self'";
  assertProductionNonce(nonce);
  return `'self' 'nonce-${nonce}'`;
}

function assertProductionNonce(nonce: string): void {
  if (!PRODUCTION_NONCE.test(nonce)) {
    throw new Error("Production CSP nonce must be exactly 32 bytes encoded as base64.");
  }
}
