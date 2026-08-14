import { describe, expect, it } from "vitest";
import { normalizeReachableLanOrigin } from "./reachableOrigin";

describe("normalizeReachableLanOrigin", () => {
  it.each([
    "http://10.0.0.7:3004",
    "http://172.16.4.9:3004",
    "http://172.31.255.2:3004",
    "http://192.168.1.223:3004",
  ])("accepts the launcher port on private IPv4 LAN host %s", (origin) => {
    expect(normalizeReachableLanOrigin(origin, "http://localhost:3004")).toBe(origin);
  });

  it.each([
    "http://192.168.1.223:3004/shared",
    "http://192.168.1.223:3004/shared/",
  ])("accepts a pasted shared-page URL and reduces it to its origin: %s", (url) => {
    expect(normalizeReachableLanOrigin(url, "http://localhost:3004")).toBe(
      "http://192.168.1.223:3004",
    );
  });

  it.each([
    "https://example.com:3004",
    "http://8.8.8.8:3004",
    "http://127.0.0.1:3004",
    "http://169.254.1.1:3004",
    "http://192.168.1.223:4000",
    "http://192.168.1.223:3004/projects",
    "http://192.168.1.223:3004/shared?unexpected=true",
    "http://192.168.1.223:3004/shared#invite=secret",
  ])("rejects non-LAN, wrong-port, or non-origin target %s", (origin) => {
    expect(() => normalizeReachableLanOrigin(origin, "http://localhost:3004")).toThrow();
  });
});
