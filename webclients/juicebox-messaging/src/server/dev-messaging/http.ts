import { createHash, timingSafeEqual } from "node:crypto";

import {
  isLoopbackOrigin,
  loadDevMessagingConfig,
  type DevMessagingConfig,
} from "./config";
import { DevMessagingStore } from "./store";
import {
  BOOTSTRAP_SECRET_HEADER_NAME,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  DEV_MESSAGING_API_PREFIX,
  DevMessagingError,
  isDevMessagingError,
  SESSION_COOKIE_NAME,
  type SessionActor,
} from "./types";
import { invalidRequest } from "./validation";

const MAX_JSON_BYTES = 160 * 1024;

interface AuthenticatedRequest {
  actor: SessionActor;
  csrfToken?: string;
  sessionToken: string;
}

interface SingletonState {
  path: string;
  store: DevMessagingStore;
}

const globalStores = globalThis as typeof globalThis & {
  __juiceboxDevMessagingStore?: SingletonState;
};

export function getStore(config: DevMessagingConfig): DevMessagingStore {
  const existing = globalStores.__juiceboxDevMessagingStore;
  if (existing?.path === config.databasePath) return existing.store;
  existing?.store.close();
  const store = new DevMessagingStore(config.databasePath);
  globalStores.__juiceboxDevMessagingStore = { path: config.databasePath, store };
  return store;
}

export async function withApiErrors(
  request: Request,
  handler: (context: {
    config: DevMessagingConfig;
    store: DevMessagingStore;
  }) => Promise<Response> | Response,
): Promise<Response> {
  try {
    const config = loadDevMessagingConfig();
    assertSafeTransport(request, config);
    return addNoStoreHeaders(await handler({ config, store: getStore(config) }));
  } catch (error) {
    // Next dev can evaluate server modules in separate bundles. Use the explicit
    // brand instead of `instanceof`, which is not stable across those realms.
    if (isDevMessagingError(error)) {
      return jsonResponse(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return jsonResponse(
      { error: { code: "internal_error", message: "The request could not be completed." } },
      { status: 500 },
    );
  }
}

export function jsonResponse(
  body: unknown,
  init: ResponseInit & { cookies?: string[] } = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  for (const cookie of init.cookies ?? []) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(body), { ...init, headers });
}

export async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/json") {
    throw new DevMessagingError(
      "unsupported_media_type",
      415,
      "Content-Type must be application/json.",
    );
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_JSON_BYTES) {
    throw new DevMessagingError("request_too_large", 413, "Request body is too large.");
  }
  if (!request.body) throw invalidRequest("A JSON request body is required.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new DevMessagingError("request_too_large", 413, "Request body is too large.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw invalidRequest("Request body is not valid JSON.");
  }
}

export function assertMutationRequest(request: Request, config: DevMessagingConfig): void {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
    throw new DevMessagingError("method_not_allowed", 405, "A mutation method is required.");
  }

  const externalHost = getExternalHost(request);
  const requestOrigin = normalizeRequestOrigin(request.headers.get("origin"));
  if (
    !requestOrigin ||
    new URL(requestOrigin).host.toLowerCase() !== externalHost ||
    !isAllowedOrigin(requestOrigin, config)
  ) {
    throw new DevMessagingError("invalid_origin", 403, "Same-origin request required.");
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    throw new DevMessagingError("invalid_origin", 403, "Same-origin request required.");
  }
}

export function assertBootstrapSecret(request: Request, config: DevMessagingConfig): void {
  if (new URL(request.url).search) {
    throw invalidRequest("Bootstrap credentials must not appear in the URL.");
  }
  const received = request.headers.get(BOOTSTRAP_SECRET_HEADER_NAME) ?? "";
  const expectedHash = createHash("sha256").update(config.bootstrapSecret).digest();
  const receivedHash = createHash("sha256").update(received).digest();
  if (!timingSafeEqual(expectedHash, receivedHash)) {
    throw new DevMessagingError("invalid_bootstrap_secret", 403, "Bootstrap denied.");
  }
}

export function authenticateRequest(
  request: Request,
  store: DevMessagingStore,
  csrfRequirement: "none" | "cookie" | "header",
): AuthenticatedRequest {
  const cookies = parseCookies(request.headers.get("cookie"));
  const sessionToken = getUniqueCookie(cookies, SESSION_COOKIE_NAME);
  const csrfToken = getUniqueCookie(cookies, CSRF_COOKIE_NAME);
  if (!sessionToken) {
    throw new DevMessagingError("unauthenticated", 401, "A valid session is required.");
  }
  const session = store.authenticate(sessionToken);
  if (csrfRequirement !== "none") {
    if (!csrfToken) {
      throw new DevMessagingError("invalid_csrf", 403, "CSRF verification failed.");
    }
    store.verifyCsrf(session, csrfToken);
    if (csrfRequirement === "header") {
      const csrfHeader = request.headers.get(CSRF_HEADER_NAME);
      if (!csrfHeader || csrfHeader !== csrfToken) {
        throw new DevMessagingError("invalid_csrf", 403, "CSRF verification failed.");
      }
    }
  }
  return { actor: session, csrfToken, sessionToken };
}

export function sessionCookies(
  request: Request,
  values: { sessionToken: string; csrfToken: string; maxAgeSeconds: number },
): string[] {
  const secure = shouldUseSecureCookies(request);
  return [
    serializeCookie(SESSION_COOKIE_NAME, values.sessionToken, {
      httpOnly: true,
      maxAgeSeconds: values.maxAgeSeconds,
      path: DEV_MESSAGING_API_PREFIX,
      secure,
    }),
    serializeCookie(CSRF_COOKIE_NAME, values.csrfToken, {
      httpOnly: false,
      maxAgeSeconds: values.maxAgeSeconds,
      path: "/",
      secure,
    }),
  ];
}

export function clearSessionCookies(request: Request): string[] {
  const secure = shouldUseSecureCookies(request);
  return [
    serializeCookie(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      maxAgeSeconds: 0,
      path: DEV_MESSAGING_API_PREFIX,
      secure,
    }),
    serializeCookie(CSRF_COOKIE_NAME, "", {
      httpOnly: false,
      maxAgeSeconds: 0,
      path: "/",
      secure,
    }),
  ];
}

function addNoStoreHeaders(response: Response): Response {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function assertSafeTransport(request: Request, config: DevMessagingConfig): void {
  const requestUrl = new URL(request.url);
  const externalHost = getExternalHost(request);
  if (requestUrl.protocol !== "http:" && requestUrl.protocol !== "https:") {
    throw new DevMessagingError("insecure_transport", 503, "HTTP(S) transport is required.");
  }
  const hostIsAllowed =
    config.allowedOrigins.length > 0
      ? config.allowedOrigins.some(
          (origin) => new URL(origin).host.toLowerCase() === externalHost,
        )
      : isLoopbackOrigin(`${requestUrl.protocol}//${externalHost}`);
  if (!hostIsAllowed) {
    throw new DevMessagingError("origin_not_allowed", 403, "Request origin is not allowed.");
  }
}

function getExternalHost(request: Request): string {
  const value = request.headers.get("host") ?? new URL(request.url).host;
  if (
    !value ||
    value !== value.trim() ||
    /[\s,/@\\]/.test(value)
  ) {
    throw new DevMessagingError("invalid_host", 400, "Request host is invalid.");
  }

  try {
    const parsed = new URL(`http://${value}`);
    if (
      parsed.host.toLowerCase() !== value.toLowerCase() ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error("invalid host");
    }
    return parsed.host.toLowerCase();
  } catch {
    throw new DevMessagingError("invalid_host", 400, "Request host is invalid.");
  }
}

function normalizeRequestOrigin(value: string | null): string | undefined {
  if (!value || value !== value.trim() || value.includes(",")) return undefined;
  try {
    const parsed = new URL(value);
    if (
      parsed.origin !== value ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    ) {
      return undefined;
    }
    return parsed.origin;
  } catch {
    return undefined;
  }
}

function isAllowedOrigin(origin: string, config: DevMessagingConfig): boolean {
  return config.allowedOrigins.length > 0
    ? config.allowedOrigins.includes(origin)
    : isLoopbackOrigin(origin);
}

function shouldUseSecureCookies(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}

function parseCookies(header: string | null): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const part of header?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key && value) result.set(key, [...(result.get(key) ?? []), value]);
  }
  return result;
}

function getUniqueCookie(cookies: Map<string, string[]>, name: string): string | undefined {
  const values = cookies.get(name);
  if (!values) return undefined;
  if (values.length !== 1) {
    throw new DevMessagingError("ambiguous_cookie", 400, "Duplicate security cookie.");
  }
  return values[0];
}

function serializeCookie(
  name: string,
  value: string,
  options: { httpOnly: boolean; maxAgeSeconds: number; path: string; secure: boolean },
): string {
  const attributes = [
    `${name}=${value}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAgeSeconds}`,
    "SameSite=Strict",
    "Priority=High",
  ];
  if (options.httpOnly) attributes.push("HttpOnly");
  if (options.secure) attributes.push("Secure");
  return attributes.join("; ");
}
