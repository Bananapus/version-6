import { cp } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const standaloneRoot = join(projectRoot, ".next", "standalone");

await cp(join(projectRoot, "public"), join(standaloneRoot, "public"), {
  recursive: true,
});
await cp(join(projectRoot, ".next", "static"), join(standaloneRoot, ".next", "static"), {
  recursive: true,
});
