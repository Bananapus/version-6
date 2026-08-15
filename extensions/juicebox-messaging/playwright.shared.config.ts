import { defineConfig } from "@playwright/test";
import { networkInterfaces } from "node:os";

const port = 3005;
const loopbackOrigin = `http://localhost:${port}`;
const numericLoopbackOrigin = `http://127.0.0.1:${port}`;
const lanAddress = Object.values(networkInterfaces())
  .flatMap((entries) => entries ?? [])
  .find(
    (entry) =>
      entry.family === "IPv4" && !entry.internal && isPrivateIpv4(entry.address),
  )?.address;
const reachableOrigin = `http://${lanAddress ?? "0.0.0.0"}:${port}`;
const databasePath = `/private/tmp/juicebox-messaging-shared-e2e-${process.pid}.sqlite`;
const bootstrapSecret = "playwright-shared-bootstrap-secret";

process.env.SHARED_E2E_REACHABLE_ORIGIN = reachableOrigin;
process.env.SHARED_E2E_SERVICE_ORIGIN = loopbackOrigin;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "shared-device.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 90_000,
  expect: {
    timeout: 12_000,
  },
  use: {
    baseURL: loopbackOrigin,
    trace: "retain-on-failure",
  },
  webServer: {
    command: [
      `PORT=${port}`,
      `JUICEBOX_MESSAGING_DEV_BOOTSTRAP_SECRET=${bootstrapSecret}`,
      `JUICEBOX_MESSAGING_DEV_DB_PATH=${databasePath}`,
      `JUICEBOX_MESSAGING_ALLOWED_DEV_ORIGINS=${loopbackOrigin},${numericLoopbackOrigin},${reachableOrigin}`,
      "npm run dev:shared",
    ].join(" "),
    url: `${loopbackOrigin}/shared`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "two-browser-chromium",
      use: { browserName: "chromium" },
    },
  ],
});

function isPrivateIpv4(address: string): boolean {
  return (
    address.startsWith("10.") ||
    address.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  );
}
