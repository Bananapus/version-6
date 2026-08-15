import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWebSecurityConfig } from "./src/server/security/config";
import { buildWebSecurityHeaderRules } from "./src/server/security/headers";

const appRoot = dirname(fileURLToPath(import.meta.url));
const webSecurityConfig = loadWebSecurityConfig(process.env);
const allowedDevOrigins = [
  ...(webSecurityConfig.mode === "local-lab"
    ? ["localhost", "127.0.0.1"]
    : []),
  ...parseAllowedPrivateDevHosts(
    process.env.JUICEBOX_MESSAGING_ALLOWED_NEXT_DEV_HOSTS,
  ),
];
const webSecurityHeaderRules = buildWebSecurityHeaderRules(
  webSecurityConfig,
  process.env.NODE_ENV === "development" ? "development" : "production",
);

const nextConfig: NextConfig = {
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  output: "standalone",
  outputFileTracingRoot: appRoot,
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return webSecurityHeaderRules.map((rule) => ({
      source: rule.source,
      headers: [...rule.headers],
    }));
  },
};

function parseAllowedPrivateDevHosts(value: string | undefined): string[] {
  if (!value) return [];
  const hosts = value.split(",").map((host) => host.trim());
  if (hosts.some((host) => !isPrivateIpv4(host))) {
    throw new Error(
      "JUICEBOX_MESSAGING_ALLOWED_NEXT_DEV_HOSTS must contain only private IPv4 hosts.",
    );
  }
  return [...new Set(hosts)];
}

function isPrivateIpv4(value: string): boolean {
  const octets = value.split(".");
  if (
    octets.length !== 4 ||
    octets.some(
      (octet) =>
        !/^(0|[1-9]\d{0,2})$/.test(octet) || Number(octet) > 255,
    )
  ) {
    return false;
  }
  const [first, second] = octets.map(Number);
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

export default nextConfig;
