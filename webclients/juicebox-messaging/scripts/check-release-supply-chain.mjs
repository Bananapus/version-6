import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultSbomPath = resolve(
  projectRoot,
  ".release-artifacts",
  "juicebox-messaging.cdx.json",
);
const validModes = new Set(["all", "audit", "dependencies", "launcher", "release", "sbom"]);
let npmLauncherDirectory;

function fail(message) {
  throw new Error(message);
}

async function readJson(path, label) {
  const text = await readFile(path, "utf8");

  try {
    return { text, value: JSON.parse(text) };
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function expectedNpmVersion(packageJson) {
  const match = /^npm@([^\s]+)$/.exec(packageJson.packageManager ?? "");
  if (!match) fail('package.json must pin packageManager as an exact "npm@<version>" value');
  return match[1];
}

function pinnedNpmEnvironment(npmExecPath) {
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const searchPath = npmLauncherDirectory
    ? [npmLauncherDirectory, process.env[pathKey]].filter(Boolean).join(delimiter)
    : process.env[pathKey];

  return {
    ...process.env,
    JUICEBOX_MESSAGING_PINNED_NODE: process.execPath,
    JUICEBOX_MESSAGING_PINNED_NPM_CLI: npmExecPath,
    [pathKey]: searchPath,
  };
}

async function createPinnedNpmLauncher() {
  const directory = await mkdtemp(join(tmpdir(), "juicebox-messaging-npm-"));
  const launcherPath = join(directory, "npm");
  const launcher = `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

const cli = process.env.JUICEBOX_MESSAGING_PINNED_NPM_CLI;
if (!cli) {
  console.error("Pinned npm launcher is missing JUICEBOX_MESSAGING_PINNED_NPM_CLI");
  process.exit(1);
}

const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  env: process.env,
  stdio: "inherit",
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
`;

  await Promise.all([
    writeFile(launcherPath, launcher, { encoding: "utf8", mode: 0o755 }),
    writeFile(
      join(directory, "npm.cmd"),
      '@ECHO OFF\r\n"%JUICEBOX_MESSAGING_PINNED_NODE%" "%~dp0npm" %*\r\n',
      "utf8",
    ),
  ]);
  await chmod(launcherPath, 0o755);
  return directory;
}

function runNpm(npmExecPath, args, { allowFailure = false, capture = false } = {}) {
  const result = spawnSync(process.execPath, [npmExecPath, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    env: pinnedNpmEnvironment(npmExecPath),
    maxBuffer: 32 * 1024 * 1024,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.error) fail(`could not run npm ${args.join(" ")}: ${result.error.message}`);

  if (result.status !== 0 && !allowFailure) {
    if (capture) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    fail(`npm ${args.join(" ")} exited with status ${result.status ?? "unknown"}`);
  }

  return {
    status: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

function validatePinnedNpm(packageJson) {
  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath) {
    fail("npm_execpath is missing; run this check through the package script with Corepack");
  }

  const expected = expectedNpmVersion(packageJson);
  const actual = runNpm(npmExecPath, ["--version"], { capture: true }).stdout.trim();
  if (actual !== expected) {
    fail(`expected npm ${expected} from packageManager, received npm ${actual}; use Corepack`);
  }

  return npmExecPath;
}

function validateLockfile(packageJson, packageLock) {
  if (packageLock.lockfileVersion !== 3) fail("package-lock.json must use lockfileVersion 3");

  const root = packageLock.packages?.[""];
  if (!root) fail("package-lock.json is missing its root package record");
  if (root.name !== packageJson.name || root.version !== packageJson.version) {
    fail("package-lock.json root name/version does not match package.json");
  }

  const manifestDependencies = packageJson.dependencies ?? {};
  const lockedRootDependencies = root.dependencies ?? {};
  if (JSON.stringify(lockedRootDependencies) !== JSON.stringify(manifestDependencies)) {
    fail("package-lock.json root production dependencies do not match package.json");
  }

  for (const [name, version] of Object.entries(manifestDependencies)) {
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
      fail(`production dependency ${name} must use an exact version, received ${version}`);
    }

    const locked = packageLock.packages[`node_modules/${name}`];
    if (!locked || locked.version !== version) {
      fail(`package-lock.json does not resolve direct dependency ${name} to ${version}`);
    }
  }

  return root;
}

function packageNameFromLockPath(path, entry) {
  if (typeof entry.name === "string") return entry.name;

  const marker = "node_modules/";
  const markerIndex = path.lastIndexOf(marker);
  if (markerIndex === -1) fail(`cannot derive a package name from lock path ${path}`);
  return path.slice(markerIndex + marker.length);
}

function sha512HexFromIntegrity(integrity, path) {
  if (typeof integrity !== "string") fail(`lock entry ${path} has no integrity digest`);

  const sha512 = integrity
    .split(/\s+/)
    .find((candidate) => candidate.startsWith("sha512-"))
    ?.slice("sha512-".length);
  if (!sha512) fail(`lock entry ${path} has no SHA-512 integrity digest`);

  const hex = Buffer.from(sha512, "base64").toString("hex");
  if (!/^[0-9a-f]{128}$/.test(hex)) fail(`lock entry ${path} has an invalid SHA-512 digest`);
  return hex;
}

function propertyValue(component, name) {
  return component.properties?.find((property) => property.name === name)?.value;
}

function validateComponent(component, path, lockEntry) {
  if (!component || typeof component !== "object" || Array.isArray(component)) {
    fail(`SBOM component for ${path} is not an object`);
  }

  const expectedName = packageNameFromLockPath(path, lockEntry);
  if (component.name !== expectedName || component.version !== lockEntry.version) {
    fail(`SBOM component for ${path} does not match locked ${expectedName}@${lockEntry.version}`);
  }

  if (typeof component["bom-ref"] !== "string" || component["bom-ref"].length === 0) {
    fail(`SBOM component for ${path} has no bom-ref`);
  }

  const expectedHash = sha512HexFromIntegrity(lockEntry.integrity, path);
  const hasExpectedHash = component.hashes?.some(
    (hash) => hash.alg === "SHA-512" && hash.content === expectedHash,
  );
  if (!hasExpectedHash) fail(`SBOM component for ${path} does not match its lockfile integrity`);
}

function validateNativeSbom(bom, packageJson, packageLock, npmVersion) {
  if (!bom || typeof bom !== "object" || Array.isArray(bom)) fail("npm emitted a non-object SBOM");
  if (bom.bomFormat !== "CycloneDX" || bom.specVersion !== "1.5" || bom.version !== 1) {
    fail("npm did not emit a CycloneDX 1.5 version 1 SBOM");
  }
  if (!/^urn:uuid:[0-9a-f-]{36}$/i.test(bom.serialNumber ?? "")) {
    fail("npm SBOM has no valid serial number");
  }
  if (!Number.isFinite(Date.parse(bom.metadata?.timestamp ?? ""))) {
    fail("npm SBOM has no valid generation timestamp");
  }

  const rootComponent = bom.metadata?.component;
  if (
    rootComponent?.["bom-ref"] !== `${packageJson.name}@${packageJson.version}` ||
    rootComponent?.type !== "application" ||
    rootComponent?.version !== packageJson.version
  ) {
    fail("npm SBOM root component does not match package.json");
  }

  const npmTool = bom.metadata?.tools?.find(
    (tool) => tool.vendor === "npm" && tool.name === "cli",
  );
  if (npmTool?.version !== npmVersion) fail("npm SBOM does not identify the pinned npm version");

  if (!Array.isArray(bom.components) || !Array.isArray(bom.dependencies)) {
    fail("npm SBOM is missing component or dependency arrays");
  }

  const lockedPackages = Object.entries(packageLock.packages).filter(([path]) => path !== "");
  if (bom.components.length !== lockedPackages.length) {
    fail(
      `npm SBOM contains ${bom.components.length} components for ${lockedPackages.length} lock entries`,
    );
  }

  const componentsByPath = new Map();
  for (const component of bom.components) {
    const path = propertyValue(component, "cdx:npm:package:path");
    if (typeof path !== "string" || path.length === 0) {
      fail("npm SBOM contains a dependency component without its lockfile path");
    }
    if (componentsByPath.has(path)) fail(`npm SBOM repeats lockfile path ${path}`);
    componentsByPath.set(path, component);
  }

  for (const [path, lockEntry] of lockedPackages) {
    validateComponent(componentsByPath.get(path), path, lockEntry);
  }

  const knownRefs = new Set([
    rootComponent["bom-ref"],
    ...bom.components.map((component) => component["bom-ref"]),
  ]);
  if (bom.dependencies.length !== lockedPackages.length + 1) {
    fail("npm SBOM dependency graph does not cover every lockfile record");
  }
  for (const dependency of bom.dependencies) {
    if (!knownRefs.has(dependency.ref) || !Array.isArray(dependency.dependsOn)) {
      fail("npm SBOM dependency graph contains an unknown or malformed reference");
    }
    if (dependency.dependsOn.some((reference) => !knownRefs.has(reference))) {
      fail(`npm SBOM dependency ${dependency.ref} points to an unknown component`);
    }
  }
}

function deterministicSerialNumber(lockDigest) {
  const bytes = Buffer.from(lockDigest.slice(0, 32), "hex");
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}

function sortBomArrays(bom) {
  const pathOf = (component) => propertyValue(component, "cdx:npm:package:path") ?? "";

  bom.components.sort((left, right) => pathOf(left).localeCompare(pathOf(right)));
  for (const component of bom.components) {
    component.hashes?.sort((left, right) =>
      `${left.alg}:${left.content}`.localeCompare(`${right.alg}:${right.content}`),
    );
    component.properties?.sort((left, right) =>
      `${left.name}:${left.value}`.localeCompare(`${right.name}:${right.value}`),
    );
  }

  for (const dependency of bom.dependencies) dependency.dependsOn.sort();
  bom.dependencies.sort((left, right) => {
    const refOrder = left.ref.localeCompare(right.ref);
    return refOrder || left.dependsOn.join("\0").localeCompare(right.dependsOn.join("\0"));
  });
  bom.metadata.tools?.sort((left, right) =>
    `${left.vendor}:${left.name}:${left.version}`.localeCompare(
      `${right.vendor}:${right.name}:${right.version}`,
    ),
  );
  bom.metadata.properties?.sort((left, right) => left.name.localeCompare(right.name));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function normalizeSbom(bom, lockDigest) {
  bom.serialNumber = deterministicSerialNumber(lockDigest);
  delete bom.metadata.timestamp;

  const retainedProperties = (bom.metadata.properties ?? []).filter(
    (property) => !property.name.startsWith("juicebox:release-sbom:"),
  );
  bom.metadata.properties = [
    ...retainedProperties,
    { name: "juicebox:release-sbom:dependency-scope", value: "complete-package-lock" },
    { name: "juicebox:release-sbom:package-lock-sha256", value: lockDigest },
  ];

  sortBomArrays(bom);
  return canonicalize(bom);
}

function displayPath(path) {
  const projectRelative = relative(projectRoot, path);
  if (projectRelative === "" || projectRelative === ".." || projectRelative.startsWith(`..${sep}`)) {
    return path;
  }
  return projectRelative.split(sep).join("/");
}

async function writeAtomically(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = resolve(dirname(path), `.${basename(path)}.${process.pid}.tmp`);

  try {
    await writeFile(temporaryPath, contents, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    try {
      await unlink(temporaryPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

function optionalLockfileExtraneous(problem, packageLock) {
  if (!problem.startsWith("extraneous: ")) return false;

  const absolutePathIndex = problem.indexOf(projectRoot);
  if (absolutePathIndex === -1) return false;
  const installedPath = problem.slice(absolutePathIndex);
  const lockPath = relative(projectRoot, installedPath).split(sep).join("/");
  return packageLock.packages?.[lockPath]?.optional === true;
}

function checkDependencyTree(npmExecPath, packageJson, packageLock) {
  const result = runNpm(npmExecPath, ["ls", "--json", "--all", "--omit=optional"], {
    allowFailure: true,
    capture: true,
  });

  let tree;
  try {
    tree = JSON.parse(result.stdout);
  } catch (error) {
    if (result.stderr) process.stderr.write(result.stderr);
    fail(`npm ls emitted invalid JSON: ${error.message}`);
  }

  const problems = Array.isArray(tree.problems) ? tree.problems : [];
  const blockingProblems = problems.filter(
    (problem) => !optionalLockfileExtraneous(problem, packageLock),
  );
  if (result.status !== 0 || blockingProblems.length > 0) {
    for (const problem of blockingProblems) console.error(`Dependency tree problem: ${problem}`);
    if (result.stderr) process.stderr.write(result.stderr);
    fail(`npm ls rejected the installed dependency tree with status ${result.status ?? "unknown"}`);
  }

  if (tree.name !== packageJson.name || tree.version !== packageJson.version) {
    fail("npm ls root name/version does not match package.json");
  }

  console.log("Installed dependency tree is valid against package-lock.json.");
}

function auditProductionDependencies(npmExecPath) {
  runNpm(npmExecPath, [
    "audit",
    "--package-lock-only",
    "--omit=dev",
    "--audit-level=high",
  ]);
}

function verifyPinnedNpmLauncher(npmExecPath, npmVersion) {
  const result = runNpm(
    npmExecPath,
    ["run", "--silent", "release:nested-npm-version"],
    { capture: true },
  );
  if (result.stdout.trim() !== npmVersion) {
    fail(
      `nested package script resolved npm ${JSON.stringify(result.stdout.trim())}, expected ${npmVersion}`,
    );
  }

  console.log(`Nested package scripts resolve the pinned npm ${npmVersion} CLI.`);
}

async function generateReleaseSbom(
  npmExecPath,
  packageJson,
  packageLock,
  lockText,
  npmVersion,
) {
  const raw = runNpm(
    npmExecPath,
    ["sbom", "--package-lock-only", "--sbom-format=cyclonedx", "--sbom-type=application"],
    { capture: true },
  ).stdout;

  let bom;
  try {
    bom = JSON.parse(raw);
  } catch (error) {
    fail(`npm emitted invalid SBOM JSON: ${error.message}`);
  }

  validateNativeSbom(bom, packageJson, packageLock, npmVersion);
  const lockDigest = createHash("sha256").update(lockText).digest("hex");
  const normalized = normalizeSbom(bom, lockDigest);
  const outputPath = resolve(process.env.RELEASE_SBOM_PATH ?? defaultSbomPath);
  await writeAtomically(outputPath, `${JSON.stringify(normalized, null, 2)}\n`);

  console.log(
    `Wrote ${normalized.components.length}-component CycloneDX SBOM to ${displayPath(outputPath)}`,
  );
  console.log(`Bound SBOM to package-lock.json sha256:${lockDigest}`);
}

async function main() {
  const mode = process.argv[2] ?? "all";
  if (!validModes.has(mode)) {
    fail(`unknown mode ${JSON.stringify(mode)}; expected one of ${[...validModes].join(", ")}`);
  }

  const [{ value: packageJson }, { text: lockText, value: packageLock }] = await Promise.all([
    readJson(resolve(projectRoot, "package.json"), "package.json"),
    readJson(resolve(projectRoot, "package-lock.json"), "package-lock.json"),
  ]);
  const npmVersion = expectedNpmVersion(packageJson);
  const npmExecPath = validatePinnedNpm(packageJson);
  validateLockfile(packageJson, packageLock);
  npmLauncherDirectory = await createPinnedNpmLauncher();

  try {
    verifyPinnedNpmLauncher(npmExecPath, npmVersion);
    if (mode === "launcher") return;
    if (mode === "dependencies") {
      checkDependencyTree(npmExecPath, packageJson, packageLock);
      return;
    }
    if (mode === "audit") {
      auditProductionDependencies(npmExecPath);
      return;
    }
    if (mode === "sbom") {
      await generateReleaseSbom(npmExecPath, packageJson, packageLock, lockText, npmVersion);
      return;
    }

    checkDependencyTree(npmExecPath, packageJson, packageLock);
    auditProductionDependencies(npmExecPath);
    await generateReleaseSbom(npmExecPath, packageJson, packageLock, lockText, npmVersion);

    if (mode === "release") runNpm(npmExecPath, ["run", "check:all"]);
  } finally {
    const directory = npmLauncherDirectory;
    npmLauncherDirectory = undefined;
    if (directory) await rm(directory, { force: true, recursive: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(`Release supply-chain check failed: ${error.message}`);
  process.exitCode = 1;
}
