import { describe, expect, it } from "vitest";
import {
  loadWebSecurityConfig,
  WebSecurityConfigurationError,
} from "./config";

const PRODUCTION_ENV = {
  JUICEBOX_MESSAGING_WEB_SECURITY_MODE: "production",
  JUICEBOX_MESSAGING_CANONICAL_ORIGIN: "https://messages.example.com",
  JUICEBOX_MESSAGING_EMBED_INTEGRATIONS: JSON.stringify({
    revnet: {
      frameAncestors: ["https://app.revnet.money", "https://revnet.money"],
    },
    juicebox: { frameAncestors: ["https://juicebox.money"] },
  }),
} as const;
const TEST_ENV = { NODE_ENV: "test" } as const;
const DEVELOPMENT_LAB_KEYS = [
  "JUICEBOX_MESSAGING_DEV_SERVICE",
  "JUICEBOX_MESSAGING_DEV_BOOTSTRAP_SECRET",
  "JUICEBOX_MESSAGING_DEV_DB_PATH",
  "JUICEBOX_MESSAGING_ALLOWED_DEV_ORIGINS",
  "JUICEBOX_MESSAGING_ALLOWED_NEXT_DEV_HOSTS",
  "JUICEBOX_MESSAGING_PUBLIC_ORIGIN",
] as const;

describe("loadWebSecurityConfig", () => {
  it("defaults to a closed local lab", () => {
    expect(loadWebSecurityConfig(TEST_ENV)).toEqual({
      mode: "local-lab",
      canonicalOrigin: null,
      embedIntegrations: [],
      localLabOrigins: ["http://localhost:3004", "http://127.0.0.1:3004"],
    });
  });

  it("requires an explicit mode for optimized builds and runtime", () => {
    for (const environment of [{}, { NODE_ENV: "production" }]) {
      expect(() => loadWebSecurityConfig(environment)).toThrow(
        /JUICEBOX_MESSAGING_WEB_SECURITY_MODE is required/,
      );
    }
    expect(
      loadWebSecurityConfig({
        NODE_ENV: "production",
        JUICEBOX_MESSAGING_WEB_SECURITY_MODE: "local-lab",
      }).mode,
    ).toBe("local-lab");
  });

  it("loads normalized production origins and deterministically sorts integrations", () => {
    expect(loadWebSecurityConfig(PRODUCTION_ENV)).toEqual({
      mode: "production",
      canonicalOrigin: "https://messages.example.com",
      localLabOrigins: [],
      embedIntegrations: [
        {
          tenantPublicId: "juicebox",
          frameAncestors: ["https://juicebox.money"],
        },
        {
          tenantPublicId: "revnet",
          frameAncestors: ["https://app.revnet.money", "https://revnet.money"],
        },
      ],
    });
  });

  it.each(DEVELOPMENT_LAB_KEYS)(
    "rejects the development-lab key namespace %s in production even when empty",
    (key) => {
      expect(() =>
        loadWebSecurityConfig({
          ...PRODUCTION_ENV,
          [key]: "",
        }),
      ).toThrowError(
        expect.objectContaining({
          name: "WebSecurityConfigurationError",
          message: expect.stringContaining(key),
        }),
      );
      expect(() =>
        loadWebSecurityConfig({
          ...PRODUCTION_ENV,
          [`${key}_FILE`]: "/run/secrets/lab-setting",
        }),
      ).toThrow(/development-lab environment keys/);
    },
  );

  it("keeps development-lab namespaces available to an explicit optimized local lab", () => {
    expect(
      loadWebSecurityConfig({
        NODE_ENV: "production",
        JUICEBOX_MESSAGING_WEB_SECURITY_MODE: "local-lab",
        JUICEBOX_MESSAGING_DEV_SERVICE: "enabled",
        JUICEBOX_MESSAGING_DEV_BOOTSTRAP_SECRET: "local-only-secret",
        JUICEBOX_MESSAGING_DEV_DB_PATH: ".data/local.sqlite",
        JUICEBOX_MESSAGING_ALLOWED_DEV_ORIGINS: "http://localhost:3004",
        JUICEBOX_MESSAGING_ALLOWED_NEXT_DEV_HOSTS: "192.168.1.10",
      }).mode,
    ).toBe("local-lab");
  });

  it("binds the cross-origin preview to the exact local lab port", () => {
    expect(
      loadWebSecurityConfig({ ...TEST_ENV, PORT: "4100" }).localLabOrigins,
    ).toEqual([
      "http://localhost:4100",
      "http://127.0.0.1:4100",
    ]);
    for (const port of ["0", "01", "65536", "3004 ", "not-a-port"]) {
      expect(() =>
        loadWebSecurityConfig({ ...TEST_ENV, PORT: port }),
      ).toThrow(/PORT/);
    }
  });

  it.each([
    "staging",
    "PRODUCTION",
    " production",
  ])("rejects unknown or non-normalized mode %s", (mode) => {
    expect(() =>
      loadWebSecurityConfig({ JUICEBOX_MESSAGING_WEB_SECURITY_MODE: mode }),
    ).toThrow(WebSecurityConfigurationError);
  });

  it("rejects production values that local-lab mode would otherwise ignore", () => {
    expect(() =>
      loadWebSecurityConfig({
        ...TEST_ENV,
        JUICEBOX_MESSAGING_CANONICAL_ORIGIN: "https://messages.example.com",
      }),
    ).toThrow(/production-only/);
  });

  it("requires both production settings even when no embed tenants are enabled", () => {
    expect(() =>
      loadWebSecurityConfig({
        JUICEBOX_MESSAGING_WEB_SECURITY_MODE: "production",
        JUICEBOX_MESSAGING_CANONICAL_ORIGIN: "https://messages.example.com",
      }),
    ).toThrow(/JUICEBOX_MESSAGING_EMBED_INTEGRATIONS is required/);

    expect(
      loadWebSecurityConfig({
        ...PRODUCTION_ENV,
        JUICEBOX_MESSAGING_EMBED_INTEGRATIONS: "{}",
      }).embedIntegrations,
    ).toEqual([]);
  });

  it.each([
    "http://messages.example.com",
    "https://messages.example.com/",
    "https://messages.example.com/path",
    "https://messages.example.com?query=1",
    "https://messages.example.com#fragment",
    "https://user@messages.example.com",
    "https://messages.example.com:444",
    "https://localhost",
    "https://127.0.0.1",
    "https://*.example.com",
    "https://MESSAGES.example.com",
    " https://messages.example.com",
  ])("rejects non-production origin %s", (origin) => {
    expect(() =>
      loadWebSecurityConfig({
        ...PRODUCTION_ENV,
        JUICEBOX_MESSAGING_CANONICAL_ORIGIN: origin,
      }),
    ).toThrow(WebSecurityConfigurationError);
  });

  it.each([
    "[]",
    "null",
    "not-json",
    '{"__proto__":{"frameAncestors":["https://juicebox.money"]}}',
    JSON.stringify({ toString: { frameAncestors: ["https://juicebox.money"] } }),
    JSON.stringify({ Juicebox: { frameAncestors: ["https://juicebox.money"] } }),
    JSON.stringify({ "../juicebox": { frameAncestors: ["https://juicebox.money"] } }),
    JSON.stringify({ juicebox: { frameAncestors: [] } }),
    JSON.stringify({ juicebox: { frameAncestors: ["https://*.juicebox.money"] } }),
    JSON.stringify({ juicebox: { frameAncestors: ["https://juicebox.money/path"] } }),
    JSON.stringify({ juicebox: { frameAncestors: ["http://juicebox.money"] } }),
    JSON.stringify({
      juicebox: { frameAncestors: ["https://messages.example.com"] },
    }),
    JSON.stringify({
      juicebox: {
        frameAncestors: ["https://juicebox.money", "https://juicebox.money"],
      },
    }),
    JSON.stringify({
      juicebox: {
        frameAncestors: ["https://juicebox.money"],
        css: "* { display: none }",
      },
    }),
  ])("rejects malformed embed configuration %s", (integrations) => {
    expect(() =>
      loadWebSecurityConfig({
        ...PRODUCTION_ENV,
        JUICEBOX_MESSAGING_EMBED_INTEGRATIONS: integrations,
      }),
    ).toThrow(WebSecurityConfigurationError);
  });
});
