import { describe, expect, it } from "vitest";

import { loadDevMessagingConfig } from "./config";

const ENABLED_LAB_ENV = {
  JUICEBOX_MESSAGING_DEV_SERVICE: "enabled",
  JUICEBOX_MESSAGING_DEV_BOOTSTRAP_SECRET:
    "test-bootstrap-secret-with-32-bytes",
  JUICEBOX_MESSAGING_DEV_DB_PATH: ".data/dev-messaging-test.sqlite",
  JUICEBOX_MESSAGING_ALLOWED_DEV_ORIGINS: "http://localhost:3004",
} as const;

describe("loadDevMessagingConfig", () => {
  it.each([
    {
      NODE_ENV: "production",
      JUICEBOX_MESSAGING_PUBLIC_ORIGIN: "https://messages.example.com",
    },
    {
      NODE_ENV: "test",
      JUICEBOX_MESSAGING_WEB_SECURITY_MODE: "production",
      JUICEBOX_MESSAGING_PUBLIC_ORIGIN: "https://messages.example.com",
    },
  ])("keeps the development service nonexistent in a production realm", (production) => {
    expect(() =>
      loadDevMessagingConfig({ ...ENABLED_LAB_ENV, ...production }),
    ).toThrowError(
      expect.objectContaining({
        code: "not_found",
        message: "Not found.",
        status: 404,
      }),
    );
  });

  it("does not disclose whether production received complete lab configuration", () => {
    const absent = () =>
      loadDevMessagingConfig({
        NODE_ENV: "production",
        JUICEBOX_MESSAGING_WEB_SECURITY_MODE: "production",
      });
    const fullyInjected = () =>
      loadDevMessagingConfig({
        ...ENABLED_LAB_ENV,
        NODE_ENV: "production",
        JUICEBOX_MESSAGING_WEB_SECURITY_MODE: "production",
        JUICEBOX_MESSAGING_PUBLIC_ORIGIN: "https://messages.example.com",
      });

    for (const load of [absent, fullyInjected]) {
      expect(load).toThrowError(
        expect.objectContaining({
          code: "not_found",
          message: "Not found.",
          status: 404,
        }),
      );
    }
  });

  it("preserves the explicitly selected optimized local-lab service", () => {
    expect(
      loadDevMessagingConfig({
        ...ENABLED_LAB_ENV,
        NODE_ENV: "production",
        JUICEBOX_MESSAGING_WEB_SECURITY_MODE: "local-lab",
      }),
    ).toMatchObject({
      allowedOrigins: ["http://localhost:3004"],
      bootstrapSecret: ENABLED_LAB_ENV.JUICEBOX_MESSAGING_DEV_BOOTSTRAP_SECRET,
    });
  });
});
