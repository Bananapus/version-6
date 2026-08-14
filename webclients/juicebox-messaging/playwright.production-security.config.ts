import { defineConfig, devices } from "@playwright/test";

const port = 3020;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "production-security.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 90_000,
  use: {
    ...devices["Desktop Chrome"],
    serviceWorkers: "allow",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npm start",
    port,
    reuseExistingServer: false,
    timeout: 180_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      JUICEBOX_MESSAGING_WEB_SECURITY_MODE: "production",
      JUICEBOX_MESSAGING_CANONICAL_ORIGIN: "https://messages.example.com",
      JUICEBOX_MESSAGING_EMBED_INTEGRATIONS: JSON.stringify({
        juicebox: { frameAncestors: ["https://juicebox.money"] },
        revnet: { frameAncestors: ["https://revnet.money"] },
      }),
    },
  },
  projects: [{ name: "production-chromium", use: { browserName: "chromium" } }],
});
