import { describe, expect, it, vi } from "vitest";
import {
  EMBED_MAX_MESSAGE_BYTES,
  EMBED_MAX_OPERATIONAL_MESSAGE_BYTES,
  EmbedInboundGate,
  createEstablishedHostToFrameGate,
  createFrameBootstrapGate,
  createFrameToHostGate,
  createHostInitializationGate,
  createHostToFrameGate,
  exactOrigin,
  postExactBridgeMessage,
  randomBase64Url,
} from "./runtime";
import {
  EMBED_CAPABILITIES,
  EMBED_PROTOCOL,
  type FrameToHostMessage,
  type HostToFrameMessage,
} from "./protocol";

const CHANNEL_ID = "channel_identifier_1234567890";
const PARENT_NONCE = "P".repeat(43);
const FRAME_NONCE = "F".repeat(43);
const BOOTSTRAP_NONCE = "B".repeat(43);
const ORIGIN = exactOrigin("https://juicebox.money");
const SOURCE = {} as WindowProxy;

function ready(sequence = 0, requestId?: string): FrameToHostMessage {
  return {
    protocol: EMBED_PROTOCOL,
    version: 1,
    channelId: CHANNEL_ID,
    sequence,
    peerNonce: PARENT_NONCE,
    ...(requestId ? { requestId } : {}),
    type: "frame.ready",
    payload: {
      frameNonce: FRAME_NONCE,
      acceptedVersion: 1,
      capabilities: EMBED_CAPABILITIES,
    },
  };
}

function init(): HostToFrameMessage {
  return {
    protocol: EMBED_PROTOCOL,
    version: 1,
    channelId: CHANNEL_ID,
    sequence: 0,
    requestId: "request_id_1234567890",
    type: "host.init",
    payload: {
      bootstrapNonce: BOOTSTRAP_NONCE,
      parentNonce: PARENT_NONCE,
      contextHandle: "C".repeat(43),
      locale: "en",
      theme: { version: 1, preset: "neutral" },
    },
  };
}

describe("embed runtime gate", () => {
  it("accepts one bounded frame readiness signal from the exact peer", () => {
    const gate = createFrameBootstrapGate({
      expectedFrameWindow: SOURCE,
      expectedFrameOrigin: ORIGIN,
    });
    const bootstrap = {
      protocol: EMBED_PROTOCOL,
      version: 1,
      type: "frame.bootstrap_ready",
      bootstrapNonce: BOOTSTRAP_NONCE,
    } as const;

    expect(
      gate.accept({ source: SOURCE, origin: ORIGIN, data: bootstrap, ports: [] }),
    ).toMatchObject({
      accepted: true,
      message: { bootstrapNonce: BOOTSTRAP_NONCE },
    });
    expect(
      gate.accept({ source: SOURCE, origin: ORIGIN, data: bootstrap, ports: [] }),
    ).toEqual({ accepted: false, reason: "closed" });
  });

  it("rejects readiness from another source, origin, or transferred port", () => {
    const bootstrap = {
      protocol: EMBED_PROTOCOL,
      version: 1,
      type: "frame.bootstrap_ready",
      bootstrapNonce: BOOTSTRAP_NONCE,
    } as const;
    const createGate = () =>
      createFrameBootstrapGate({
        expectedFrameWindow: SOURCE,
        expectedFrameOrigin: ORIGIN,
      });

    expect(
      createGate().accept({
        source: {} as WindowProxy,
        origin: ORIGIN,
        data: bootstrap,
        ports: [],
      }),
    ).toEqual({ accepted: false, reason: "untrusted-peer" });
    expect(
      createGate().accept({
        source: SOURCE,
        origin: "https://evil.example",
        data: bootstrap,
        ports: [],
      }),
    ).toEqual({ accepted: false, reason: "untrusted-peer" });
    expect(
      createGate().accept({
        source: SOURCE,
        origin: ORIGIN,
        data: bootstrap,
        ports: [{} as MessagePort],
      }),
    ).toEqual({ accepted: false, reason: "invalid-message" });
  });

  it("bounds and rate-limits trusted pre-channel readiness attempts", () => {
    const bootstrap = {
      protocol: EMBED_PROTOCOL,
      version: 1,
      type: "frame.bootstrap_ready",
      bootstrapNonce: BOOTSTRAP_NONCE,
    } as const;
    const oversizedGate = createFrameBootstrapGate({
      expectedFrameWindow: SOURCE,
      expectedFrameOrigin: ORIGIN,
    });
    expect(
      oversizedGate.accept({
        source: SOURCE,
        origin: ORIGIN,
        data: {
          ...bootstrap,
          padding: "x".repeat(EMBED_MAX_OPERATIONAL_MESSAGE_BYTES),
        },
        ports: [],
      }),
    ).toEqual({ accepted: false, reason: "oversized" });

    const rateGate = createFrameBootstrapGate({
      expectedFrameWindow: SOURCE,
      expectedFrameOrigin: ORIGIN,
    });
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(
        rateGate.accept(
          {
            source: SOURCE,
            origin: ORIGIN,
            data: { ...bootstrap, unexpected: attempt },
            ports: [],
          },
          1_000,
        ),
      ).toEqual({ accepted: false, reason: "invalid-message" });
    }
    expect(
      rateGate.accept(
        { source: SOURCE, origin: ORIGIN, data: bootstrap, ports: [] },
        1_000,
      ),
    ).toEqual({ accepted: false, reason: "rate-limited" });
  });

  it("binds an accepted message to exact source, origin, channel, sequence, and nonce", () => {
    const gate = createFrameToHostGate({
      expectedFrameWindow: SOURCE,
      expectedFrameOrigin: ORIGIN,
      channelId: CHANNEL_ID,
      parentNonce: PARENT_NONCE,
    });

    expect(
      gate.accept({ source: SOURCE, origin: ORIGIN, data: ready(), ports: [] }),
    ).toMatchObject({ accepted: true });
    expect(
      gate.accept({
        source: {} as WindowProxy,
        origin: ORIGIN,
        data: ready(1),
        ports: [],
      }),
    ).toEqual({ accepted: false, reason: "untrusted-peer" });
    expect(
      gate.accept({
        source: SOURCE,
        origin: "https://evil.example",
        data: ready(1),
        ports: [],
      }),
    ).toEqual({ accepted: false, reason: "untrusted-peer" });
    expect(
      gate.accept({
        source: SOURCE,
        origin: ORIGIN,
        data: { ...ready(1), peerNonce: "W".repeat(43) },
        ports: [],
      }),
    ).toEqual({ accepted: false, reason: "invalid-message" });
  });

  it("rejects replayed and skipped sequences", () => {
    const gate = createFrameToHostGate({
      expectedFrameWindow: SOURCE,
      expectedFrameOrigin: ORIGIN,
      channelId: CHANNEL_ID,
      parentNonce: PARENT_NONCE,
    });
    expect(
      gate.accept({ source: SOURCE, origin: ORIGIN, data: ready(), ports: [] }),
    ).toMatchObject({ accepted: true });
    expect(
      gate.accept({ source: SOURCE, origin: ORIGIN, data: ready(), ports: [] }),
    ).toEqual({ accepted: false, reason: "invalid-message" });
    expect(
      gate.accept({
        source: SOURCE,
        origin: ORIGIN,
        data: {
          ...ready(2),
          type: "frame.layout",
          payload: { layout: "regular" },
        },
        ports: [],
      }),
    ).toEqual({ accepted: false, reason: "invalid-message" });
  });

  it("allows host initialization once, then requires the fresh frame nonce", () => {
    const gate = createHostToFrameGate({
      expectedParentWindow: SOURCE,
      expectedParentOrigin: ORIGIN,
      channelId: CHANNEL_ID,
      expectedBootstrapNonce: BOOTSTRAP_NONCE,
    });
    expect(
      gate.accept({ source: SOURCE, origin: ORIGIN, data: init(), ports: [] }),
    ).toMatchObject({ accepted: true });
    gate.establishPeerNonce(FRAME_NONCE);

    expect(
      gate.accept({
        source: SOURCE,
        origin: ORIGIN,
        ports: [],
        data: {
          protocol: EMBED_PROTOCOL,
          version: 1,
          channelId: CHANNEL_ID,
          sequence: 1,
          peerNonce: FRAME_NONCE,
          type: "host.set_theme",
          payload: { theme: { version: 1, preset: "juicebox" } },
        },
      }),
    ).toMatchObject({ accepted: true });
    expect(() => gate.establishPeerNonce(FRAME_NONCE)).toThrow();
  });

  it("accepts an unbound initialization once, then pins its channel for operations", () => {
    const initializationGate = createHostInitializationGate({
      expectedParentWindow: SOURCE,
      expectedParentOrigin: ORIGIN,
      expectedBootstrapNonce: BOOTSTRAP_NONCE,
    });
    const initialization = initializationGate.accept({
      source: SOURCE,
      origin: ORIGIN,
      data: init(),
      ports: [],
    });
    expect(initialization).toMatchObject({
      accepted: true,
      message: { channelId: CHANNEL_ID, type: "host.init" },
    });
    expect(
      initializationGate.accept({
        source: SOURCE,
        origin: ORIGIN,
        data: init(),
        ports: [],
      }),
    ).toEqual({ accepted: false, reason: "closed" });

    const gate = createEstablishedHostToFrameGate({
      expectedParentWindow: SOURCE,
      expectedParentOrigin: ORIGIN,
      channelId: CHANNEL_ID,
      frameNonce: FRAME_NONCE,
      initializationRequestId: "request_id_1234567890",
    });
    expect(
      gate.accept({
        source: SOURCE,
        origin: ORIGIN,
        ports: [],
        data: {
          protocol: EMBED_PROTOCOL,
          version: 1,
          channelId: CHANNEL_ID,
          sequence: 1,
          peerNonce: FRAME_NONCE,
          type: "host.set_theme",
          payload: { theme: { version: 1, preset: "revnet" } },
        },
      }),
    ).toMatchObject({ accepted: true });
    expect(
      gate.accept({
        source: SOURCE,
        origin: ORIGIN,
        ports: [],
        data: {
          protocol: EMBED_PROTOCOL,
          version: 1,
          channelId: CHANNEL_ID,
          sequence: 2,
          peerNonce: FRAME_NONCE,
          requestId: "request_id_1234567890",
          type: "host.destroy",
          payload: {},
        },
      }),
    ).toEqual({ accepted: false, reason: "replayed-request" });
  });

  it("requires host initialization to echo this frame's readiness nonce", () => {
    const initializationGate = createHostInitializationGate({
      expectedParentWindow: SOURCE,
      expectedParentOrigin: ORIGIN,
      expectedBootstrapNonce: BOOTSTRAP_NONCE,
    });

    expect(
      initializationGate.accept({
        source: SOURCE,
        origin: ORIGIN,
        data: {
          ...init(),
          payload: {
            ...init().payload,
            bootstrapNonce: "W".repeat(43),
          },
        },
        ports: [],
      }),
    ).toEqual({ accepted: false, reason: "invalid-message" });
    expect(
      initializationGate.accept({
        source: SOURCE,
        origin: ORIGIN,
        data: init(),
        ports: [],
      }),
    ).toMatchObject({ accepted: true });
  });

  it("rejects MessagePort transfer on version one", () => {
    const gate = createFrameToHostGate({
      expectedFrameWindow: SOURCE,
      expectedFrameOrigin: ORIGIN,
      channelId: CHANNEL_ID,
      parentNonce: PARENT_NONCE,
    });
    expect(
      gate.accept({
        source: SOURCE,
        origin: ORIGIN,
        data: ready(),
        ports: [{} as MessagePort],
      }),
    ).toEqual({ accepted: false, reason: "invalid-message" });
  });

  it("rejects duplicate request IDs even at a new sequence", () => {
    const requestId = "request_id_1234567890";
    const gate = createFrameToHostGate({
      expectedFrameWindow: SOURCE,
      expectedFrameOrigin: ORIGIN,
      channelId: CHANNEL_ID,
      parentNonce: PARENT_NONCE,
    });
    expect(
      gate.accept({
        source: SOURCE,
        origin: ORIGIN,
        data: ready(0, requestId),
        ports: [],
      }),
    ).toMatchObject({ accepted: true });
    expect(
      gate.accept({
        source: SOURCE,
        origin: ORIGIN,
        ports: [],
        data: {
          protocol: EMBED_PROTOCOL,
          version: 1,
          channelId: CHANNEL_ID,
          sequence: 1,
          peerNonce: PARENT_NONCE,
          requestId,
          type: "frame.layout",
          payload: { layout: "regular" },
        },
      }),
    ).toEqual({ accepted: false, reason: "replayed-request" });
  });

  it("bounds payload size before schema parsing", () => {
    const parse = vi.fn(() => ready());
    const gate = new EmbedInboundGate({
      expectedSource: SOURCE,
      expectedOrigin: ORIGIN,
      channelId: CHANNEL_ID,
      initialPeerNonce: PARENT_NONCE,
      initialType: "frame.ready",
      parse,
    });

    expect(
      gate.accept({
        source: SOURCE,
        origin: ORIGIN,
        data: { value: "x".repeat(EMBED_MAX_MESSAGE_BYTES) },
        ports: [],
      }),
    ).toEqual({ accepted: false, reason: "oversized" });
    expect(parse).not.toHaveBeenCalled();
  });

  it("rejects non-canonical array properties before schema parsing", () => {
    const parse = vi.fn(() => ready());
    const gate = new EmbedInboundGate({
      expectedSource: SOURCE,
      expectedOrigin: ORIGIN,
      channelId: CHANNEL_ID,
      initialPeerNonce: PARENT_NONCE,
      initialType: "frame.ready",
      parse,
    });
    const decoratedArray = [] as unknown[] & { padding?: string };
    decoratedArray.padding = "x".repeat(EMBED_MAX_MESSAGE_BYTES);

    expect(
      gate.accept({
        source: SOURCE,
        origin: ORIGIN,
        data: decoratedArray,
        ports: [],
      }),
    ).toEqual({ accepted: false, reason: "oversized" });
    expect(parse).not.toHaveBeenCalled();
  });

  it("rate-limits trusted attempts and gives every channel a finite lifetime", () => {
    const gate = new EmbedInboundGate({
      expectedSource: SOURCE,
      expectedOrigin: ORIGIN,
      channelId: CHANNEL_ID,
      initialPeerNonce: PARENT_NONCE,
      initialType: "frame.ready",
      parse: (value) => value as FrameToHostMessage,
      maxMessagesPerWindow: 2,
      maxAcceptedMessages: 2,
    });

    expect(
      gate.accept(
        { source: SOURCE, origin: ORIGIN, data: ready(0), ports: [] },
        1_000,
      ),
    ).toMatchObject({ accepted: true });
    const layout = (sequence: number): FrameToHostMessage => ({
      protocol: EMBED_PROTOCOL,
      version: 1,
      channelId: CHANNEL_ID,
      sequence,
      peerNonce: PARENT_NONCE,
      type: "frame.layout",
      payload: { layout: "regular" },
    });
    expect(
      gate.accept(
        { source: SOURCE, origin: ORIGIN, data: layout(1), ports: [] },
        1_001,
      ),
    ).toMatchObject({ accepted: true });
    expect(
      gate.accept(
        { source: SOURCE, origin: ORIGIN, data: layout(2), ports: [] },
        1_002,
      ),
    ).toEqual({ accepted: false, reason: "rate-limited" });
    expect(
      gate.accept(
        { source: SOURCE, origin: ORIGIN, data: layout(2), ports: [] },
        20_000,
      ),
    ).toEqual({ accepted: false, reason: "channel-exhausted" });
    expect(
      gate.accept(
        { source: SOURCE, origin: ORIGIN, data: layout(2), ports: [] },
        30_000,
      ),
    ).toEqual({ accepted: false, reason: "closed" });
  });

  it("accepts only canonical HTTPS origins, with an explicit loopback-test escape", () => {
    expect(exactOrigin("https://juicebox.money")).toBe("https://juicebox.money");
    expect(
      exactOrigin("http://127.0.0.1:3004", { allowLoopbackHttp: true }),
    ).toBe("http://127.0.0.1:3004");
    expect(() => exactOrigin("http://juicebox.money")).toThrow();
    expect(() => exactOrigin("https://juicebox.money/path")).toThrow();
    expect(() => exactOrigin("https://JUICEBOX.money")).toThrow();
    expect(() => exactOrigin("*")).toThrow();
  });

  it("posts only to the already-canonical exact origin", () => {
    const postMessage = vi.fn();
    const target = { postMessage } as unknown as WindowProxy;
    const message = ready();
    postExactBridgeMessage(target, ORIGIN, message);
    expect(postMessage).toHaveBeenCalledWith(message, "https://juicebox.money");
    expect(postMessage).not.toHaveBeenCalledWith(message, "*");
  });

  it("creates bounded cryptographically random base64url identifiers", () => {
    const first = randomBase64Url(32);
    const second = randomBase64Url(32);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
  });
});
