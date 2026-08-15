import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { WebSecurityConfig } from "./config";
import {
  buildContentSecurityPolicy,
  frameAncestorsForPath,
  permissionsPolicyForDocument,
} from "./headers";

type NonceFactory = () => string;

const NO_STORE = "private, no-store, max-age=0, must-revalidate";
const DEV_MESSAGING_PATH = "/api/dev/messaging";

export function createWebSecurityProxy(
  config: WebSecurityConfig,
  nonceFactory: NonceFactory = createProductionNonce,
): (request: NextRequest) => NextResponse {
  return (request) => {
    if (config.mode === "local-lab") {
      if (request.nextUrl.pathname !== "/embed-preview/frame") {
        return NextResponse.next();
      }

      const nonce = nonceFactory();
      const frameAncestors =
        request.nextUrl.search === ""
          ? frameAncestorsForPath(config, request.nextUrl.pathname)
          : ["'none'"];
      const contentSecurityPolicy = buildContentSecurityPolicy(
        config,
        frameAncestors,
        process.env.NODE_ENV === "development" ? "development" : "production",
        nonce,
        "embed",
      );
      return nonceBoundResponse(
        request,
        contentSecurityPolicy,
        nonce,
        "embed",
      );
    }

    if (!hasCanonicalExternalOrigin(request, config.canonicalOrigin)) {
      return misdirectedRequest(config);
    }

    // Route Handlers synthesize OPTIONS/Allow responses before handler code can
    // fail closed. Tombstone the whole lab namespace ahead of filesystem
    // routing so production exposes no method, schema, or enablement oracle.
    if (isDevelopmentMessagingNamespace(request.nextUrl.pathname)) {
      return unavailableDevelopmentNamespace(config);
    }

    const nonce = nonceFactory();
    const frameAncestors =
      request.nextUrl.search === ""
        ? frameAncestorsForPath(config, request.nextUrl.pathname)
        : ["'none'"];
    const documentKind = request.nextUrl.pathname.startsWith("/embed/")
      ? "embed"
      : "top-level";
    const contentSecurityPolicy = buildContentSecurityPolicy(
      config,
      frameAncestors,
      "production",
      nonce,
      documentKind,
    );
    return nonceBoundResponse(
      request,
      contentSecurityPolicy,
      nonce,
      documentKind,
    );
  };
}

function nonceBoundResponse(
  request: NextRequest,
  contentSecurityPolicy: string,
  nonce: string,
  documentKind: "top-level" | "embed",
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", contentSecurityPolicy);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  response.headers.set("Cache-Control", NO_STORE);
  if (documentKind === "embed") {
    response.headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    response.headers.set(
      "Permissions-Policy",
      permissionsPolicyForDocument("embed"),
    );
  } else {
    response.headers.set("X-Frame-Options", "DENY");
  }
  return response;
}

function hasCanonicalExternalOrigin(
  request: NextRequest,
  canonicalOrigin: string,
): boolean {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto");

  if (forwardedHost !== null || forwardedProtocol !== null) {
    return (
      forwardedHost !== null &&
      forwardedProtocol !== null &&
      !forwardedHost.includes(",") &&
      !forwardedProtocol.includes(",") &&
      forwardedHost === forwardedHost.trim() &&
      forwardedProtocol === "https" &&
      `https://${forwardedHost}` === canonicalOrigin
    );
  }

  return request.nextUrl.origin === canonicalOrigin;
}

export function createProductionNonce(): string {
  return randomBytes(32).toString("base64");
}

function isDevelopmentMessagingNamespace(pathname: string): boolean {
  let normalized = pathname.replaceAll("\\", "/");
  // Next and upstream proxies can decode at different routing layers. Decode a
  // small bounded number of times and over-block lab lookalikes in production.
  for (let pass = 0; pass < 4; pass += 1) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) break;
      normalized = decoded;
    } catch {
      break;
    }
  }
  normalized = normalized.replace(/\/{2,}/g, "/").toLowerCase();
  return (
    normalized === DEV_MESSAGING_PATH ||
    normalized.startsWith(`${DEV_MESSAGING_PATH}/`)
  );
}

function unavailableDevelopmentNamespace(config: WebSecurityConfig): NextResponse {
  const response = new NextResponse(null, { status: 404 });
  response.headers.set("Cache-Control", NO_STORE);
  response.headers.set(
    "Content-Security-Policy",
    buildContentSecurityPolicy(config, ["'none'"], "production"),
  );
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

function misdirectedRequest(config: WebSecurityConfig): NextResponse {
  const response = new NextResponse(null, { status: 421 });
  response.headers.set("Cache-Control", NO_STORE);
  response.headers.set("Content-Type", "text/plain; charset=utf-8");
  response.headers.set(
    "Content-Security-Policy",
    buildContentSecurityPolicy(config, ["'none'"], "production"),
  );
  return response;
}
