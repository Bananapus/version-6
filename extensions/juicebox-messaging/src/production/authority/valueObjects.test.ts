import { describe, expect, it } from "vitest";
import {
  expectExactRecord,
  parseAuthorityId,
  parseBase64Url,
  parseCanonicalInstant,
  parseEthereumAddress,
  parseHash32,
  parseHexBytes,
  parseHttpsOrigin,
  parseHttpsUrl,
  parseJuiceboxV6ProjectRef,
  parseLogIndex,
  parseSiweDomain,
  parseUint256Decimal,
} from "./valueObjects";
import { ADDRESS_A, hash, project } from "./fixtures.testing";

describe("production authority value objects", () => {
  it("accepts exact plain records and rejects inherited, missing, and extra keys", () => {
    expect(expectExactRecord({ a: 1 }, ["a"], "fixture")).toEqual({ a: 1 });
    expect(() => expectExactRecord(Object.create({ a: 1 }), ["a"], "fixture")).toThrow();
    expect(() => expectExactRecord({ a: 1, b: 2 }, ["a"], "fixture")).toThrow();
    expect(() => expectExactRecord({}, ["a"], "fixture")).toThrow();
    expect(() => expectExactRecord({ a: undefined }, ["a"], "fixture")).toThrow();
    expect(() => expectExactRecord([], [], "fixture")).toThrow();
  });

  it("normalizes syntactically valid addresses and rejects unsafe forms", () => {
    expect(parseEthereumAddress(ADDRESS_A.toUpperCase().replace("0X", "0x"))).toBe(
      ADDRESS_A,
    );
    for (const value of [
      null,
      ADDRESS_A.slice(0, -1),
      `${ADDRESS_A}0`,
      ADDRESS_A.replace("1", "g"),
      ` ${ADDRESS_A}`,
      `0x${"0".repeat(40)}`,
    ]) {
      expect(() => parseEthereumAddress(value)).toThrow();
    }
    expect(
      parseEthereumAddress(`0x${"0".repeat(40)}`, "address", { allowZero: true }),
    ).toBe(`0x${"0".repeat(40)}`);
  });

  it("requires exact hashes and bounded even-length hexadecimal bytes", () => {
    expect(parseHash32(hash("a").toUpperCase().replace("0X", "0x"))).toBe(hash("a"));
    expect(parseHexBytes("0x0011", "bytes", { minBytes: 2, maxBytes: 2 })).toBe(
      "0x0011",
    );
    for (const value of [hash("a").slice(0, -2), `${hash("a")}00`, "0xzz", ""])
      expect(() => parseHash32(value)).toThrow();
    for (const value of ["0x0", "0x", "0x001122"])
      expect(() =>
        parseHexBytes(value, "bytes", { minBytes: 1, maxBytes: 2 }),
      ).toThrow();
  });

  it("accepts uint256 zero and max but never coerces or accepts noncanonical numbers", () => {
    const maximum = ((1n << 256n) - 1n).toString();
    expect(parseUint256Decimal("0")).toBe("0");
    expect(parseUint256Decimal(maximum)).toBe(maximum);
    for (const value of [
      "",
      "00",
      "01",
      "+1",
      "-1",
      "1.0",
      "1e3",
      " 1",
      1,
      1n,
      (1n << 256n).toString(),
    ]) {
      expect(() => parseUint256Decimal(value)).toThrow();
    }
  });

  it("requires a non-negative safe explicit log index", () => {
    expect(parseLogIndex(0)).toBe(0);
    for (const value of [-0, -1, 1.1, Number.NaN, Infinity, 2 ** 53, "0"])
      expect(() => parseLogIndex(value)).toThrow();
  });

  it("requires canonical real UTC instants with milliseconds", () => {
    expect(parseCanonicalInstant("2024-02-29T00:00:00.000Z")).toBe(
      "2024-02-29T00:00:00.000Z",
    );
    for (const value of [
      "2023-02-29T00:00:00.000Z",
      "2026-08-14T12:00:00Z",
      "2026-08-14T12:00:00.000z",
      "2026-08-14T12:00:00.000+00:00",
      "2026-08-14T12:00:00.0000Z",
      " 2026-08-14T12:00:00.000Z",
    ]) {
      expect(() => parseCanonicalInstant(value)).toThrow();
    }
  });

  it("allows only canonical ASCII HTTPS origins, URLs, and SIWE domains", () => {
    expect(parseHttpsOrigin("https://chat.example:8443")).toBe(
      "https://chat.example:8443",
    );
    expect(parseHttpsUrl("https://chat.example/auth/wallet")).toBe(
      "https://chat.example/auth/wallet",
    );
    expect(parseSiweDomain("chat.example:8443")).toBe("chat.example:8443");
    for (const value of [
      "http://chat.example",
      "https://user@chat.example",
      "https://chat.example/",
      "https://CHAT.example",
      "https://chat.example.",
      "https://chät.example",
      "https://chat.example\n",
    ]) {
      expect(() => parseHttpsOrigin(value)).toThrow();
    }
  });

  it("strictly parses IDs and base64url without trimming or padding", () => {
    expect(parseAuthorityId("decision.1")).toBe("decision.1");
    expect(parseBase64Url("Abc_123-")).toBe("Abc_123-");
    for (const value of ["", " id", "id/part", "id\n"])
      expect(() => parseAuthorityId(value)).toThrow();
    for (const value of ["", "abc=", "abc+", "abc/"])
      expect(() => parseBase64Url(value)).toThrow();
    expect(
      parseBase64Url("A".repeat(43), "Ed25519 key", {
        minLength: 43,
        maxLength: 43,
      }),
    ).toBe("A".repeat(43));
    // B differs only in unused tail bits and decodes to the same 32 bytes.
    expect(() =>
      parseBase64Url(`${"A".repeat(42)}B`, "Ed25519 key", {
        minLength: 43,
        maxLength: 43,
      }),
    ).toThrow();
  });

  it("accepts only exact allowlisted positive Juicebox v6 project references", () => {
    expect(parseJuiceboxV6ProjectRef(project())).toEqual(project());
    for (const mutation of [
      { ...project(), protocol: "juicebox-v5" },
      { ...project(), version: 5 },
      { ...project(), chainId: 137 },
      { ...project(), projectId: 0 },
      { ...project(), projectId: 1.5 },
      { ...project(), projectId: "9" },
      { ...project(), extra: true },
    ]) {
      expect(() => parseJuiceboxV6ProjectRef(mutation)).toThrow();
    }
  });
});
