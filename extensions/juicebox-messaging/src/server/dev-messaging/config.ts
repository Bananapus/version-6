import { resolve } from "node:path";

import { DevMessagingError } from "./types";

export interface DevMessagingConfig {
  allowedOrigins: readonly string[];
  bootstrapSecret: string;
  databasePath: string;
}

type Environment = Readonly<Record<string, string | undefined>>;

export function loadDevMessagingConfig(
  environment: Environment = process.env,
): DevMessagingConfig {
  // An optimized local-lab artifact is explicit. Every other production-shaped
  // process keeps this namespace unavailable even if lab secrets and an HTTPS
  // origin are injected after startup.
  if (
    environment.JUICEBOX_MESSAGING_WEB_SECURITY_MODE === "production" ||
    (environment.NODE_ENV === "production" &&
      environment.JUICEBOX_MESSAGING_WEB_SECURITY_MODE !== "local-lab")
  ) {
    throw new DevMessagingError("not_found", 404, "Not found.");
  }

  if (environment.JUICEBOX_MESSAGING_DEV_SERVICE !== "enabled") {
    throw new DevMessagingError("not_found", 404, "Not found.");
  }

  const bootstrapSecret =
    environment.JUICEBOX_MESSAGING_DEV_BOOTSTRAP_SECRET ?? "";
  if (bootstrapSecret.length < 16) {
    throw new DevMessagingError(
      "service_misconfigured",
      503,
      "The development messaging service is not configured.",
    );
  }

  const configuredOriginsValue =
    environment.JUICEBOX_MESSAGING_ALLOWED_DEV_ORIGINS;
  const configuredDevOrigins = configuredOriginsValue
    ? configuredOriginsValue
        .split(",")
        .map((origin) => normalizeOrigin(origin.trim()))
    : [];
  if (configuredDevOrigins.some((origin) => !origin)) {
    throw new DevMessagingError(
      "service_misconfigured",
      503,
      "The development origin allowlist is invalid.",
    );
  }

  return {
    allowedOrigins: configuredDevOrigins as string[],
    bootstrapSecret,
    databasePath: resolve(
      environment.JUICEBOX_MESSAGING_DEV_DB_PATH ??
        ".next/dev-messaging/juicebox-messaging.sqlite",
    ),
  };
}

export function isLoopbackOrigin(origin: string): boolean {
  const url = new URL(origin);
  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]"
  );
}

function normalizeOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.origin !== value
    ) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}
