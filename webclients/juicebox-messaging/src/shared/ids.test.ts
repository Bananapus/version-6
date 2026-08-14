import { describe, expect, it } from "vitest";
import { developmentEventId } from "./ids";

describe("developmentEventId", () => {
  it("uses randomUUID when a secure-context implementation is available", () => {
    let uuidCalls = 0;
    let randomValueCalls = 0;
    const randomUUID = () => {
      uuidCalls += 1;
      return "00000000-0000-4000-8000-000000000001";
    };
    const getRandomValues = <T extends ArrayBufferView>(value: T): T => {
      randomValueCalls += 1;
      return value;
    };

    expect(developmentEventId("text", { randomUUID, getRandomValues })).toBe(
      "text_00000000-0000-4000-8000-000000000001",
    );
    expect(uuidCalls).toBe(1);
    expect(randomValueCalls).toBe(0);
  });

  it("falls back to getRandomValues on a plain-HTTP LAN origin", () => {
    let calls = 0;
    const getRandomValues = <T extends ArrayBufferView>(value: T): T => {
      calls += 1;
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength).set(
        Array.from({ length: value.byteLength }, (_, index) => index),
      );
      return value;
    };

    expect(developmentEventId("address", { getRandomValues })).toBe(
      "address_000102030405060708090a0b0c0d0e0f",
    );
    expect(calls).toBe(1);
  });
});
