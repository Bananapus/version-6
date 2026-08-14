import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { loadWebSecurityConfig } from "./config";
import { createProductionNonce, createWebSecurityProxy } from "./proxy";

const NONCE = "A".repeat(43) + "=";
const productionConfig = loadWebSecurityConfig({
  JUICEBOX_MESSAGING_WEB_SECURITY_MODE: "production",
  JUICEBOX_MESSAGING_CANONICAL_ORIGIN: "https://messages.example.com",
  JUICEBOX_MESSAGING_EMBED_INTEGRATIONS: JSON.stringify({
    juicebox: { frameAncestors: ["https://juicebox.money"] },
  }),
});

describe("createWebSecurityProxy", () => {
  it("adds a strict nonce CSP to both the render request and response", () => {
    const proxy = createWebSecurityProxy(productionConfig, () => NONCE);
    const response = proxy(
      new NextRequest("https://messages.example.com/embed/juicebox", {
        headers: {
          "content-security-policy": "default-src * 'unsafe-inline'",
          "x-nonce": "attacker-controlled",
        },
      }),
    );
    const csp = response.headers.get("Content-Security-Policy");

    expect(response.status).toBe(200);
    expect(csp).toContain(`script-src 'nonce-${NONCE}' 'strict-dynamic'`);
    expect(csp).not.toContain("script-src 'self'");
    expect(csp).toContain(`style-src 'self' 'nonce-${NONCE}'`);
    expect(csp).toContain("frame-ancestors https://juicebox.money");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("sandbox allow-scripts allow-same-origin");
    expect(csp).toContain("trusted-types nextjs nextjs#bundler");
    expect(csp).not.toContain("juicebox-messaging#service-worker");
    expect(csp).not.toContain("'unsafe-inline'");
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe(
      "cross-origin",
    );
    expect(response.headers.get("Permissions-Policy")).toContain(
      "clipboard-write=()",
    );
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(NONCE);
    expect(
      response.headers.get("x-middleware-request-content-security-policy"),
    ).toBe(csp);
    expect(response.headers.get("x-nonce")).toBeNull();
  });

  it("does not grant an unknown or nested embed path a frame ancestor", () => {
    const proxy = createWebSecurityProxy(productionConfig, () => NONCE);

    for (const pathname of [
      "/embed/unknown",
      "/embed/juicebox/nested",
      "/embed/juicebox?context=must-not-be-in-a-url",
      "/shared",
    ]) {
      const response = proxy(
        new NextRequest(`https://messages.example.com${pathname}`),
      );
      expect(response.headers.get("Content-Security-Policy")).toContain(
        "frame-ancestors 'none'",
      );
      if (pathname.startsWith("/embed/")) {
        expect(response.headers.get("Content-Security-Policy")).toContain(
          "form-action 'none'",
        );
        expect(response.headers.get("Permissions-Policy")).toContain(
          "storage-access=()",
        );
      }
    }
  });

  it("uses legacy frame denial only on non-embed documents", () => {
    const proxy = createWebSecurityProxy(productionConfig, () => NONCE);
    const topLevel = proxy(new NextRequest("https://messages.example.com/shared"));
    const embed = proxy(
      new NextRequest("https://messages.example.com/embed/juicebox"),
    );

    expect(topLevel.headers.get("X-Frame-Options")).toBe("DENY");
    expect(embed.headers.get("X-Frame-Options")).toBeNull();
    expect(topLevel.headers.get("Content-Security-Policy")).toContain(
      "trusted-types nextjs nextjs#bundler juicebox-messaging#service-worker",
    );
    expect(embed.headers.get("Content-Security-Policy")).not.toContain(
      "juicebox-messaging#service-worker",
    );
  });

  it("rejects a non-canonical request authority before rendering", () => {
    const proxy = createWebSecurityProxy(productionConfig, () => NONCE);
    const response = proxy(new NextRequest("https://alias.example.com/"));
    const csp = response.headers.get("Content-Security-Policy");

    expect(response.status).toBe(421);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("nonce-");
    expect(csp).not.toContain("'unsafe-inline'");
  });

  it("accepts only an exact trusted-proxy HTTPS authority pair", () => {
    const proxy = createWebSecurityProxy(productionConfig, () => NONCE);
    const accepted = proxy(
      new NextRequest("http://127.0.0.1:3019/shared", {
        headers: {
          "x-forwarded-host": "messages.example.com",
          "x-forwarded-proto": "https",
        },
      }),
    );
    expect(accepted.status).toBe(200);

    const headersToReject = [
      new Headers({ "x-forwarded-host": "messages.example.com" }),
      new Headers({ "x-forwarded-proto": "https" }),
      new Headers({
        "x-forwarded-host": "messages.example.com, attacker.example",
        "x-forwarded-proto": "https",
      }),
      new Headers({
        "x-forwarded-host": "messages.example.com",
        "x-forwarded-proto": "http",
      }),
      new Headers({
        "x-forwarded-host": "MESSAGES.example.com",
        "x-forwarded-proto": "https",
      }),
    ];
    for (const headers of headersToReject) {
      expect(
        proxy(
          new NextRequest("http://127.0.0.1:3019/shared", { headers }),
        ).status,
      ).toBe(421);
    }
  });

  it("tombstones every production development-messaging path without enumerating methods", async () => {
    const proxy = createWebSecurityProxy(productionConfig, () => {
      throw new Error("A tombstoned API response must not allocate a document nonce.");
    });
    const requests = [
      ["GET", "/api/dev/messaging"],
      ["HEAD", "/api/dev/messaging/status"],
      ["POST", "/api/dev/messaging/bootstrap?secret=must-not-matter"],
      ["OPTIONS", "/api/dev/messaging/conversations/unknown"],
      ["DELETE", "/API/DEV/MESSAGING/status"],
      ["PATCH", "/%61pi/%64ev/%6dessaging/status"],
      ["PUT", "/api/dev/messaging%252fstatus"],
    ] as const;
    const observedHeaders: Array<Array<[string, string]>> = [];

    for (const [method, pathname] of requests) {
      const response = proxy(
        new NextRequest(`https://messages.example.com${pathname}`, { method }),
      );
      const csp = response.headers.get("Content-Security-Policy");

      expect(response.status).toBe(404);
      expect(await response.text()).toBe("");
      expect(response.headers.get("Allow")).toBeNull();
      expect(response.headers.get("Content-Type")).toBeNull();
      expect(response.headers.get("Location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBeNull();
      expect(response.headers.get("Cache-Control")).toContain("no-store");
      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
      expect(csp).toContain("script-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toContain("nonce-");
      expect(csp).not.toContain("'unsafe-inline'");
      observedHeaders.push([...response.headers.entries()]);
    }

    expect(observedHeaders.every((headers) =>
      JSON.stringify(headers) === JSON.stringify(observedHeaders[0]),
    )).toBe(true);
  });

  it("leaves ordinary local-lab routes on their static development policy", () => {
    const proxy = createWebSecurityProxy(
      loadWebSecurityConfig({ NODE_ENV: "test" }),
      () => NONCE,
    );
    const response = proxy(new NextRequest("http://192.168.1.20:3004/shared"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");

    const developmentApi = proxy(
      new NextRequest("http://localhost:3004/api/dev/messaging/status"),
    );
    expect(developmentApi.status).toBe(200);
    expect(developmentApi.headers.get("x-middleware-next")).toBe("1");
  });

  it("nonce-binds the exact local cross-origin preview frame", () => {
    const proxy = createWebSecurityProxy(
      loadWebSecurityConfig({ NODE_ENV: "test" }),
      () => NONCE,
    );
    const response = proxy(
      new NextRequest("http://localhost:3004/embed-preview/frame", {
        headers: {
          "content-security-policy": "default-src * 'unsafe-inline'",
          "x-nonce": "attacker-controlled",
        },
      }),
    );
    const csp = response.headers.get("Content-Security-Policy");

    expect(csp).toContain(`script-src 'nonce-${NONCE}' 'strict-dynamic'`);
    expect(csp).toContain(`style-src 'self' 'nonce-${NONCE}'`);
    expect(csp).toContain(
      "frame-ancestors http://localhost:3004 http://127.0.0.1:3004",
    );
    expect(csp).toContain("style-src-attr 'none'");
    expect(csp).not.toContain("'unsafe-inline'");
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(NONCE);
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe(
      "cross-origin",
    );
    expect(response.headers.get("Permissions-Policy")).toContain(
      "storage-access=()",
    );

    const queried = proxy(
      new NextRequest("http://localhost:3004/embed-preview/frame?theme=secret"),
    );
    expect(queried.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
  });
});

describe("createProductionNonce", () => {
  it("creates independent 32-byte base64 nonces", () => {
    const first = createProductionNonce();
    const second = createProductionNonce();

    expect(first).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(second).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(second).not.toBe(first);
  });
});
