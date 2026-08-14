import { describe, expect, it } from "vitest";
import { pairedLoopbackOrigin } from "./previewEnvironment";

describe("local embed preview environment", () => {
  it("maps the two fixed loopback origins without carrying a path", () => {
    expect(pairedLoopbackOrigin("http://localhost:3004")).toBe(
      "http://127.0.0.1:3004",
    );
    expect(pairedLoopbackOrigin("http://127.0.0.1:3004")).toBe(
      "http://localhost:3004",
    );
  });

  it.each([
    "https://localhost:3004",
    "http://192.168.1.10:3004",
    "http://localhost:3004/path",
    "http://localhost:3004?parent=https://example.com",
    "http://user:password@localhost:3004",
    "not an origin",
  ])("fails closed for non-lab origins: %s", (origin) => {
    expect(pairedLoopbackOrigin(origin)).toBeNull();
  });
});
