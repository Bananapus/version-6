// Narrow import avoids the Next 16 testing barrel's runtime-store side effects.
import { unstable_getResponseFromNextConfig } from "next/dist/experimental/testing/server/config-testing-utils.js";
import { describe, expect, it } from "vitest";
import { loadWebSecurityConfig } from "./config";
import {
  buildContentSecurityPolicy,
  buildWebSecurityHeaderRules,
  frameAncestorsForPath,
} from "./headers";

const NONCE = "A".repeat(43) + "=";

const productionConfig = loadWebSecurityConfig({
  JUICEBOX_MESSAGING_WEB_SECURITY_MODE: "production",
  JUICEBOX_MESSAGING_CANONICAL_ORIGIN: "https://messages.example.com",
  JUICEBOX_MESSAGING_EMBED_INTEGRATIONS: JSON.stringify({
    juicebox: {
      frameAncestors: ["https://juicebox.money", "https://app.juicebox.money"],
    },
    revnet: { frameAncestors: ["https://revnet.money"] },
  }),
});

describe("buildWebSecurityHeaderRules", () => {
  it("denies framing by default and has no contradictory X-Frame-Options", () => {
    const rules = buildWebSecurityHeaderRules(productionConfig, "production");
    const documentHeaders = headersForSource(
      rules,
      "/((?!_next/static(?:/|$)|_next/image(?:/|$)).*)",
    );

    expect(documentHeaders.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(allHeaderNames(rules)).not.toContain("x-frame-options");
    expect(allHeaderNames(rules)).not.toContain("cross-origin-opener-policy");
    expect(allHeaderNames(rules)).not.toContain("cross-origin-embedder-policy");
  });

  it("keeps static production embed fallback headers frame-denied", () => {
    const rules = buildWebSecurityHeaderRules(productionConfig, "production");
    const embedHeaders = headersForSource(rules, "/embed/:tenantPublicId");
    const embedCsp = embedHeaders.get("Content-Security-Policy");
    expect(embedCsp).toContain("frame-ancestors 'none'");
    expect(embedCsp).toContain("form-action 'none'");
    expect(embedCsp).toContain("frame-src 'none'");
    expect(embedCsp).toContain("sandbox allow-scripts allow-same-origin");
    expect(embedCsp).toContain("trusted-types nextjs nextjs#bundler");
    expect(embedCsp).not.toContain("juicebox-messaging#service-worker");
    expect(embedHeaders.get("Cross-Origin-Resource-Policy")).toBe("cross-origin");
    expect(embedHeaders.get("Permissions-Policy")).toContain("clipboard-write=()");
    expect(embedHeaders.get("Permissions-Policy")).toContain(
      "publickey-credentials-get=()",
    );
  });

  it("keeps the exact local preview frame usable without opening production embeds", () => {
    const labConfig = loadWebSecurityConfig({ NODE_ENV: "test" });
    const rules = buildWebSecurityHeaderRules(labConfig, "development");
    const globalCsp = headersForSource(
      rules,
      "/((?!_next/static(?:/|$)|_next/image(?:/|$)).*)",
    ).get("Content-Security-Policy");
    const previewCsp = headersForSource(rules, "/embed-preview/frame").get(
      "Content-Security-Policy",
    );

    expect(globalCsp).toContain("frame-ancestors 'none'");
    expect(globalCsp).toContain("'unsafe-eval'");
    expect(previewCsp).toContain(
      "frame-ancestors http://localhost:3004 http://127.0.0.1:3004",
    );
    expect(previewCsp).toContain("form-action 'none'");
    expect(previewCsp).toContain("frame-src 'none'");
    expect(previewCsp).toContain("sandbox allow-scripts allow-same-origin");
    expect(globalCsp).toContain(
      "frame-src 'self' http://localhost:3004 http://127.0.0.1:3004",
    );
    expect(
      headersForSource(rules, "/embed-preview/frame").get(
        "Cross-Origin-Resource-Policy",
      ),
    ).toBe("cross-origin");
    expect(rules.some((rule) => rule.source.startsWith("/embed/"))).toBe(false);
    expect(allHeaderNames(rules)).not.toContain("strict-transport-security");
  });

  it("can nonce-bind the optimized local preview without widening its frame grant", () => {
    const labConfig = loadWebSecurityConfig({ NODE_ENV: "test" });
    const csp = buildContentSecurityPolicy(
      labConfig,
      frameAncestorsForPath(labConfig, "/embed-preview/frame"),
      "production",
      NONCE,
      "embed",
    );

    expect(csp).toContain(`script-src 'nonce-${NONCE}' 'strict-dynamic'`);
    expect(csp).toContain(`style-src 'self' 'nonce-${NONCE}'`);
    expect(csp).toContain(
      "frame-ancestors http://localhost:3004 http://127.0.0.1:3004",
    );
    expect(csp).toContain("style-src-attr 'none'");
    expect(csp).not.toContain("'unsafe-inline'");
  });

  it("sets transport, capability, privacy, and fail-closed static CSP policies", () => {
    const rules = buildWebSecurityHeaderRules(productionConfig, "production");
    const globalHeaders = headersForSource(rules, "/:path*");
    const csp = headersForSource(
      rules,
      "/((?!_next/static(?:/|$)|_next/image(?:/|$)).*)",
    ).get("Content-Security-Policy");

    expect(globalHeaders.get("Strict-Transport-Security")).toBe("max-age=63072000");
    expect(globalHeaders.get("Referrer-Policy")).toBe("no-referrer");
    expect(globalHeaders.get("X-Content-Type-Options")).toBe("nosniff");
    expect(globalHeaders.get("Permissions-Policy")).toContain("camera=()");
    expect(globalHeaders.get("Permissions-Policy")).toContain(
      "clipboard-write=(self)",
    );
    expect(globalHeaders.get("Permissions-Policy")).toContain(
      "cross-origin-isolated=()",
    );
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src-attr 'none'");
    expect(csp).toContain("style-src-attr 'none'");
    expect(csp).toContain(
      "trusted-types nextjs nextjs#bundler juicebox-messaging#service-worker",
    );
    expect(csp).not.toContain("allow-duplicates");
    expect(csp).not.toContain("'allow-duplicates'");
    expect(csp).not.toContain("trusted-types 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-src 'self'");
    expect(csp).not.toContain("sandbox allow-scripts");
    expect(globalHeaders.get("Permissions-Policy")).toContain(
      "clipboard-write=(self)",
    );
  });

  it("marks application responses no-store while leaving hashed assets to Next", () => {
    const rules = buildWebSecurityHeaderRules(productionConfig, "production");

    expect(
      headersForSource(rules, "/((?!_next/static(?:/|$)).*)").get(
        "Cache-Control",
      ),
    ).toBe(
      "private, no-store, max-age=0, must-revalidate",
    );
    expect(headersForSource(rules, "/:path*").has("Cache-Control")).toBe(false);
    expect(headersForSource(rules, "/:path*").has("Content-Security-Policy")).toBe(
      false,
    );
    expect(headersForSource(rules, "/sw.js").get("Cache-Control")).toBe(
      "no-cache, no-store, must-revalidate",
    );
    expect(headersForSource(rules, "/sw.js").get("Content-Security-Policy")).toBe(
      "default-src 'none'; base-uri 'none'; connect-src 'none'; object-src 'none'; script-src 'none';",
    );
    expect(headersForSource(rules, "/icon.svg").get("Cache-Control")).toBe(
      "public, max-age=3600, must-revalidate",
    );
    expect(
      rules.some((rule) => rule.source.startsWith("/_next/static")),
    ).toBe(false);
  });

  it("keeps lookalike paths inside the document and no-store policies", async () => {
    const rules = buildWebSecurityHeaderRules(productionConfig, "production");
    const nextConfig = {
      async headers() {
        return rules.map((rule) => ({
          source: rule.source,
          headers: [...rule.headers],
        }));
      },
    };

    const immutableAsset = await unstable_getResponseFromNextConfig({
      url: "https://messages.example.com/_next/static/chunks/app.js",
      nextConfig,
    });
    expect(immutableAsset.headers.get("Content-Security-Policy")).toBeNull();
    expect(immutableAsset.headers.get("Cache-Control")).toBeNull();
    expect(immutableAsset.headers.get("X-Content-Type-Options")).toBe("nosniff");

    for (const pathname of ["/_next/staticity", "/_next/images", "/swXjs"]) {
      const lookalike = await unstable_getResponseFromNextConfig({
        url: `https://messages.example.com${pathname}`,
        nextConfig,
      });
      expect(lookalike.headers.get("Content-Security-Policy")).toContain(
        "frame-ancestors 'none'",
      );
      expect(lookalike.headers.get("Cache-Control")).toContain("no-store");
    }

    const serviceWorker = await unstable_getResponseFromNextConfig({
      url: "https://messages.example.com/sw.js",
      nextConfig,
    });
    expect(serviceWorker.headers.get("Content-Security-Policy")).toBe(
      "default-src 'none'; base-uri 'none'; connect-src 'none'; object-src 'none'; script-src 'none';",
    );
  });
});

describe("production nonce CSP", () => {
  it("grants exact integration paths and rejects lookalikes", () => {
    expect(frameAncestorsForPath(productionConfig, "/embed/juicebox")).toEqual([
      "https://app.juicebox.money",
      "https://juicebox.money",
    ]);
    expect(frameAncestorsForPath(productionConfig, "/embed/revnet")).toEqual([
      "https://revnet.money",
    ]);
    expect(frameAncestorsForPath(productionConfig, "/embed/juicebox/")).toEqual([
      "'none'",
    ]);
    expect(frameAncestorsForPath(productionConfig, "/embed/juicebox/nested")).toEqual([
      "'none'",
    ]);
  });

  it("requires a fixed 32-byte base64 nonce", () => {
    expect(() =>
      buildContentSecurityPolicy(
        productionConfig,
        ["'none'"],
        "production",
        "not-a-nonce",
      ),
    ).toThrow(/32 bytes/);
  });
});

function headersForSource(
  rules: ReturnType<typeof buildWebSecurityHeaderRules>,
  source: string,
): Map<string, string> {
  const headers = new Map<string, string>();
  for (const rule of rules) {
    if (rule.source !== source) continue;
    for (const header of rule.headers) headers.set(header.key, header.value);
  }
  return headers;
}

function allHeaderNames(
  rules: ReturnType<typeof buildWebSecurityHeaderRules>,
): string[] {
  return rules.flatMap((rule) => rule.headers.map((header) => header.key.toLowerCase()));
}
