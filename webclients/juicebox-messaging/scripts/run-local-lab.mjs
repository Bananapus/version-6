import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const modeKey = "JUICEBOX_MESSAGING_WEB_SECURITY_MODE";
const canonicalOriginKey = "JUICEBOX_MESSAGING_CANONICAL_ORIGIN";
const integrationsKey = "JUICEBOX_MESSAGING_EMBED_INTEGRATIONS";
const task = process.argv[2];
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const nextBin = join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const tscBin = join(projectRoot, "node_modules", "typescript", "bin", "tsc");

if (!new Set(["build", "start", "typecheck"]).has(task)) {
  throw new Error("Expected local-lab task build, start, or typecheck.");
}
if (
  (process.env[modeKey] !== undefined && process.env[modeKey] !== "local-lab") ||
  process.env[canonicalOriginKey] !== undefined ||
  process.env[integrationsKey] !== undefined
) {
  throw new Error(
    "Local-lab commands refuse production web-security environment settings.",
  );
}
process.env[modeKey] = "local-lab";

if (task === "start") {
  await import("./start-standalone.mjs");
} else if (task === "build") {
  await runNode(nextBin, ["build", "--webpack"]);
  await import("./stage-standalone.mjs");
} else {
  await runNode(nextBin, ["typegen"]);
  await runNode(tscBin, ["--noEmit", "--incremental", "false"]);
}

function runNode(entrypoint, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entrypoint, ...args], {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal !== null) {
        reject(new Error(`Local-lab task was terminated by ${signal}.`));
      } else if (code !== 0) {
        reject(new Error(`Local-lab task exited with code ${code ?? "unknown"}.`));
      } else {
        resolve();
      }
    });
  });
}
