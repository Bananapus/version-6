import { describe, expect, it } from "vitest";
import {
  EMBED_CAPABILITIES,
  EMBED_PROTOCOL,
  EmbedProtocolError,
  isTrustedWindowEvent,
  parseFrameBootstrapMessage,
  parseFrameToHostMessage,
  parseHostInitialization,
  parseHostToFrameMessage,
} from "./protocol";

const CHANNEL_ID = "channel_identifier_1234567890";
const PARENT_NONCE = "P".repeat(43);
const FRAME_NONCE = "F".repeat(43);
const BOOTSTRAP_NONCE = "B".repeat(43);
const REQUEST_ID = "request_id_1234567890";
const CONTEXT_HANDLE = "C".repeat(43);
const BASE = {
  protocol: EMBED_PROTOCOL,
  version: 1,
  channelId: CHANNEL_ID,
};

describe("embed bridge protocol", () => {
  it("accepts only the exact bounded pre-channel readiness shape", () => {
    expect(
      parseFrameBootstrapMessage({
        protocol: EMBED_PROTOCOL,
        version: 1,
        type: "frame.bootstrap_ready",
        bootstrapNonce: BOOTSTRAP_NONCE,
      }),
    ).toEqual({
      protocol: EMBED_PROTOCOL,
      version: 1,
      type: "frame.bootstrap_ready",
      bootstrapNonce: BOOTSTRAP_NONCE,
    });

    expect(() =>
      parseFrameBootstrapMessage({
        protocol: EMBED_PROTOCOL,
        version: 1,
        type: "frame.bootstrap_ready",
        bootstrapNonce: BOOTSTRAP_NONCE,
        channelId: CHANNEL_ID,
      }),
    ).toThrow(EmbedProtocolError);
    expect(() =>
      parseFrameBootstrapMessage({
        protocol: EMBED_PROTOCOL,
        version: 1,
        type: "frame.bootstrap_ready",
        bootstrapNonce: "short",
      }),
    ).toThrow(EmbedProtocolError);
  });

  it("accepts a one-shot opaque initialization without a peer nonce", () => {
    const message = parseHostToFrameMessage(
      {
        ...BASE,
        sequence: 0,
        requestId: REQUEST_ID,
        type: "host.init",
        payload: {
          bootstrapNonce: BOOTSTRAP_NONCE,
          parentNonce: PARENT_NONCE,
          contextHandle: CONTEXT_HANDLE,
          locale: "en",
          theme: { version: 1, preset: "revnet" },
        },
      },
      { channelId: CHANNEL_ID, sequence: 0, peerNonce: null },
    );

    expect(message.type).toBe("host.init");
    if (message.type === "host.init") {
      expect(message.payload.contextHandle).toBe(CONTEXT_HANDLE);
      expect(message.payload.parentNonce).toBe(PARENT_NONCE);
      expect(message.payload.theme.preset).toBe("revnet");
      expect(message).not.toHaveProperty("peerNonce");
    }
  });

  it("pins a valid host-generated channel during unbound initialization", () => {
    const message = parseHostInitialization(
      {
        ...BASE,
        sequence: 0,
        requestId: REQUEST_ID,
        type: "host.init",
        payload: {
          bootstrapNonce: BOOTSTRAP_NONCE,
          parentNonce: PARENT_NONCE,
          contextHandle: CONTEXT_HANDLE,
          locale: "en",
          theme: { version: 1, preset: "neutral" },
        },
      },
      BOOTSTRAP_NONCE,
    );

    expect(message.channelId).toBe(CHANNEL_ID);
    expect(message).not.toHaveProperty("peerNonce");
  });

  it("binds initialization to the readiness nonce from the same frame", () => {
    expect(() =>
      parseHostInitialization(
        {
          ...BASE,
          sequence: 0,
          type: "host.init",
          payload: {
            bootstrapNonce: "W".repeat(43),
            parentNonce: PARENT_NONCE,
            contextHandle: CONTEXT_HANDLE,
            locale: "en",
            theme: { version: 1, preset: "neutral" },
          },
        },
        BOOTSTRAP_NONCE,
      ),
    ).toThrowError(expect.objectContaining({ code: "nonce_mismatch" }));
  });

  it("rejects even an explicitly undefined peer nonce on initialization", () => {
    expect(() =>
      parseHostInitialization(
        {
          ...BASE,
          sequence: 0,
          peerNonce: undefined,
          type: "host.init",
          payload: {
            bootstrapNonce: BOOTSTRAP_NONCE,
            parentNonce: PARENT_NONCE,
            contextHandle: CONTEXT_HANDLE,
            locale: "en",
            theme: { version: 1, preset: "neutral" },
          },
        },
        BOOTSTRAP_NONCE,
      ),
    ).toThrow(EmbedProtocolError);
  });

  it("rejects an explicitly undefined optional request ID", () => {
    expect(() =>
      parseHostInitialization(
        {
          ...BASE,
          sequence: 0,
          requestId: undefined,
          type: "host.init",
          payload: {
            bootstrapNonce: BOOTSTRAP_NONCE,
            parentNonce: PARENT_NONCE,
            contextHandle: CONTEXT_HANDLE,
            locale: "en",
            theme: { version: 1, preset: "neutral" },
          },
        },
        BOOTSTRAP_NONCE,
      ),
    ).toThrow(EmbedProtocolError);
  });

  it("accepts ready only when it echoes the parent nonce", () => {
    const message = parseFrameToHostMessage(
      {
        ...BASE,
        sequence: 0,
        peerNonce: PARENT_NONCE,
        type: "frame.ready",
        payload: {
          frameNonce: FRAME_NONCE,
          acceptedVersion: 1,
          capabilities: EMBED_CAPABILITIES,
        },
      },
      { channelId: CHANNEL_ID, sequence: 0, peerNonce: PARENT_NONCE },
    );

    expect(message).toMatchObject({
      type: "frame.ready",
      peerNonce: PARENT_NONCE,
      payload: { frameNonce: FRAME_NONCE },
    });
  });

  it("rejects capabilities arrays with hidden own-property payloads", () => {
    const capabilities = [...EMBED_CAPABILITIES] as string[] & {
      padding?: string;
    };
    capabilities.padding = "not part of the array schema";

    expect(() =>
      parseFrameToHostMessage(
        {
          ...BASE,
          sequence: 0,
          peerNonce: PARENT_NONCE,
          type: "frame.ready",
          payload: {
            frameNonce: FRAME_NONCE,
            acceptedVersion: 1,
            capabilities,
          },
        },
        { channelId: CHANNEL_ID, sequence: 0, peerNonce: PARENT_NONCE },
      ),
    ).toThrow(EmbedProtocolError);
  });

  it("accepts only the exact next sequence and established frame nonce", () => {
    const message = parseHostToFrameMessage(
      {
        ...BASE,
        sequence: 1,
        peerNonce: FRAME_NONCE,
        type: "host.set_theme",
        payload: { theme: { version: 1, preset: "juicebox" } },
      },
      { channelId: CHANNEL_ID, sequence: 1, peerNonce: FRAME_NONCE },
    );
    expect(message).toMatchObject({ type: "host.set_theme", sequence: 1 });
  });

  it.each([
    {
      value: {
        ...BASE,
        channelId: "different_channel_123456789",
        sequence: 1,
        peerNonce: FRAME_NONCE,
        type: "host.destroy",
        payload: {},
      },
      error: "channel_mismatch",
    },
    {
      value: {
        ...BASE,
        sequence: 2,
        peerNonce: FRAME_NONCE,
        type: "host.destroy",
        payload: {},
      },
      error: "sequence_mismatch",
    },
    {
      value: {
        ...BASE,
        sequence: 1,
        peerNonce: "W".repeat(43),
        type: "host.destroy",
        payload: {},
      },
      error: "nonce_mismatch",
    },
  ])("rejects wrong channel, sequence, or peer nonce", ({ value, error }) => {
    expect(() =>
      parseHostToFrameMessage(value, {
        channelId: CHANNEL_ID,
        sequence: 1,
        peerNonce: FRAME_NONCE,
      }),
    ).toThrowError(expect.objectContaining({ code: error }));
  });

  it.each([
    {
      ...BASE,
      sequence: 0,
      peerNonce: FRAME_NONCE,
      type: "host.init",
      payload: {
        bootstrapNonce: BOOTSTRAP_NONCE,
        parentNonce: PARENT_NONCE,
        contextHandle: CONTEXT_HANDLE,
        locale: "en",
        theme: { version: 1, preset: "neutral" },
      },
    },
    {
      ...BASE,
      sequence: 0,
      type: "host.init",
      payload: {
        bootstrapNonce: BOOTSTRAP_NONCE,
        parentNonce: PARENT_NONCE,
        contextHandle: "short",
        locale: "en",
        theme: { version: 1, preset: "neutral" },
      },
    },
    {
      ...BASE,
      sequence: 0,
      type: "host.init",
      payload: {
        bootstrapNonce: BOOTSTRAP_NONCE,
        parentNonce: PARENT_NONCE,
        contextHandle: CONTEXT_HANDLE,
        locale: "es",
        theme: { version: 1, preset: "neutral" },
      },
    },
    {
      ...BASE,
      sequence: 0,
      type: "host.init",
      payload: {
        bootstrapNonce: BOOTSTRAP_NONCE,
        parentNonce: PARENT_NONCE,
        contextHandle: CONTEXT_HANDLE,
        locale: "en",
        theme: { version: 1, preset: "neutral", css: "@import url(x)" },
      },
    },
    {
      ...BASE,
      sequence: 0,
      type: "host.init",
      payload: {
        bootstrapNonce: BOOTSTRAP_NONCE,
        parentNonce: PARENT_NONCE,
        contextHandle: CONTEXT_HANDLE,
        locale: "en",
        theme: {
          version: 1,
          preset: "neutral",
          density: undefined,
          colors: { canvas: undefined },
        },
      },
    },
    {
      ...BASE,
      sequence: 0,
      type: "host.init",
      payload: {
        bootstrapNonce: BOOTSTRAP_NONCE,
        parentNonce: PARENT_NONCE,
        contextHandle: CONTEXT_HANDLE,
        locale: "en",
        theme: { version: 1, preset: "neutral" },
        plaintext: "hello",
      },
    },
    {
      ...BASE,
      sequence: 0,
      type: "host.unknown",
      payload: {},
    },
  ])("rejects repeated, secret-bearing, executable, or unknown init input", (value) => {
    expect(() =>
      parseHostToFrameMessage(value, {
        channelId: CHANNEL_ID,
        sequence: 0,
        peerNonce: null,
      }),
    ).toThrow(EmbedProtocolError);
  });

  it.each([
    { type: "frame.unread", payload: { hasUnread: 1 } },
    { type: "frame.unread", payload: { hasUnread: true, preview: "secret" } },
    { type: "frame.error", payload: { code: "raw-stack", retryable: true } },
    { type: "frame.closed", payload: { address: "secret" } },
    { type: "frame.open_top_level", payload: { reason: "https://evil.example" } },
  ])("rejects frame output outside the minimal metadata contract", (message) => {
    expect(() =>
      parseFrameToHostMessage(
        {
          ...BASE,
          sequence: 1,
          peerNonce: PARENT_NONCE,
          ...message,
        },
        { channelId: CHANNEL_ID, sequence: 1, peerNonce: PARENT_NONCE },
      ),
    ).toThrow(EmbedProtocolError);
  });

  it.each([
    { code: "origin-mismatch", retryable: false },
    { code: "unsupported-version", retryable: false },
    { code: "context-invalid", retryable: true },
    { code: "channel-invalid", retryable: true },
    { code: "temporarily-unavailable", retryable: false },
  ])("does not expose pre-channel or ambiguous error state: $code", (payload) => {
    expect(() =>
      parseFrameToHostMessage(
        {
          ...BASE,
          sequence: 1,
          peerNonce: PARENT_NONCE,
          type: "frame.error",
          payload,
        },
        { channelId: CHANNEL_ID, sequence: 1, peerNonce: PARENT_NONCE },
      ),
    ).toThrow(EmbedProtocolError);
  });

  it.each([
    { code: "context-invalid", retryable: false },
    { code: "channel-invalid", retryable: false },
    { code: "temporarily-unavailable", retryable: true },
  ] as const)("accepts the fixed established error outcome: $code", (payload) => {
    expect(
      parseFrameToHostMessage(
        {
          ...BASE,
          sequence: 1,
          peerNonce: PARENT_NONCE,
          type: "frame.error",
          payload,
        },
        { channelId: CHANNEL_ID, sequence: 1, peerNonce: PARENT_NONCE },
      ),
    ).toMatchObject({ type: "frame.error", payload });
  });

  it("requires both exact peer window identity and exact origin", () => {
    const expectedWindow = {} as WindowProxy;
    expect(
      isTrustedWindowEvent(
        { origin: "https://juicebox.money", source: expectedWindow },
        expectedWindow,
        "https://juicebox.money",
      ),
    ).toBe(true);
    expect(
      isTrustedWindowEvent(
        { origin: "https://evil.example", source: expectedWindow },
        expectedWindow,
        "https://juicebox.money",
      ),
    ).toBe(false);
    expect(
      isTrustedWindowEvent(
        { origin: "https://juicebox.money", source: {} as WindowProxy },
        expectedWindow,
        "https://juicebox.money",
      ),
    ).toBe(false);
  });

  it("rejects prototype-pollution fields at the envelope boundary", () => {
    const value = JSON.parse(
      `{"protocol":"${EMBED_PROTOCOL}","version":1,"channelId":"${CHANNEL_ID}","sequence":1,"peerNonce":"${FRAME_NONCE}","type":"host.destroy","payload":{},"__proto__":{}}`,
    );
    expect(() =>
      parseHostToFrameMessage(value, {
        channelId: CHANNEL_ID,
        sequence: 1,
        peerNonce: FRAME_NONCE,
      }),
    ).toThrowError(expect.objectContaining({ code: "unknown_field" }));
  });
});
