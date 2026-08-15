import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";

const port = process.env.PORT ?? "3004";
const bootstrapSecret =
  process.env.JUICEBOX_MESSAGING_DEV_BOOTSTRAP_SECRET ?? randomBytes(24).toString("base64url");
const databasePath =
  process.env.JUICEBOX_MESSAGING_DEV_DB_PATH ?? resolve(".data/dev-messaging.sqlite");

const networkHosts = Object.values(networkInterfaces())
  .flatMap((entries) => entries ?? [])
  .filter(
    (entry) =>
      entry.family === "IPv4" &&
      !entry.internal &&
      (entry.address.startsWith("10.") ||
        entry.address.startsWith("192.168.") ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(entry.address)),
  )
  .map((entry) => entry.address);
const networkOrigins = networkHosts.map((host) => `http://${host}:${port}`);
const allowedOrigins =
  process.env.JUICEBOX_MESSAGING_ALLOWED_DEV_ORIGINS ??
  [`http://localhost:${port}`, `http://127.0.0.1:${port}`, ...networkOrigins].join(",");

process.stdout.write(
  [
    "\nJuicebox Messaging shared-device lab",
    `Computer: http://localhost:${port}/shared`,
    ...networkOrigins.map((origin) => `Phone:    ${origin}/shared`),
    `Bootstrap secret: ${bootstrapSecret}`,
    "Use fictional information only. LAN HTTP is not end-to-end encrypted.\n",
  ].join("\n"),
);

const nextBin = resolve("node_modules/next/dist/bin/next");
const child = spawn(
  process.execPath,
  [nextBin, "dev", "--webpack", "-p", port, "--hostname", "0.0.0.0"],
  {
    env: {
      ...process.env,
      JUICEBOX_MESSAGING_DEV_SERVICE: "enabled",
      JUICEBOX_MESSAGING_DEV_BOOTSTRAP_SECRET: bootstrapSecret,
      JUICEBOX_MESSAGING_DEV_DB_PATH: databasePath,
      JUICEBOX_MESSAGING_ALLOWED_DEV_ORIGINS: allowedOrigins,
      JUICEBOX_MESSAGING_ALLOWED_NEXT_DEV_HOSTS:
        process.env.JUICEBOX_MESSAGING_ALLOWED_NEXT_DEV_HOSTS ?? networkHosts.join(","),
    },
    stdio: "inherit",
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
