import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const nextPackagePath = require.resolve("next/package.json");
const nextPackage = JSON.parse(readFileSync(nextPackagePath, "utf8")) as {
  version?: unknown;
};
const announcerSource = readFileSync(
  join(
    dirname(nextPackagePath),
    "dist",
    "client",
    "components",
    "app-router-announcer.js",
  ),
  "utf8",
);

describe("pinned Next browser runtime", () => {
  it("keeps the reviewed route-announcer CSSOM vector exact", () => {
    expect(nextPackage.version).toBe("16.3.1");
    expect(announcerSource).toContain(
      "const ANNOUNCER_TYPE = 'next-route-announcer';",
    );
    expect(announcerSource).toContain(
      "const container = document.createElement(ANNOUNCER_TYPE);",
    );
    expect(announcerSource).toContain(
      "const announcer = document.createElement('div');",
    );
    expect(
      [...announcerSource.matchAll(/\.style\.cssText = '([^']+)'/g)].map(
        ([, cssText]) => cssText,
      ),
    ).toEqual([
      "position:absolute",
      "position:absolute;border:0;height:1px;margin:-1px;padding:0;width:1px;clip:rect(0 0 0 0);overflow:hidden;white-space:nowrap;word-wrap:normal",
    ]);
  });
});
