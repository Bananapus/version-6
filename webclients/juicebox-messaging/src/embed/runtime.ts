import {
  isTrustedWindowEvent,
  isValidEmbedNonce,
  parseFrameBootstrapMessage,
  parseHostInitialization,
  parseFrameToHostMessage,
  parseHostToFrameMessage,
  type EmbedEnvelopeExpectation,
  type FrameBootstrapMessage,
  type FrameToHostMessage,
  type HostToFrameMessage,
} from "./protocol";

export const EMBED_MAX_MESSAGE_BYTES = 8 * 1024;
export const EMBED_MAX_OPERATIONAL_MESSAGE_BYTES = 2 * 1024;
export const EMBED_RATE_WINDOW_MS = 10_000;
export const EMBED_MAX_MESSAGES_PER_WINDOW = 20;
export const EMBED_MAX_ACCEPTED_MESSAGES = 256;

const MAX_STRUCTURED_DEPTH = 8;
const MAX_CONTAINER_ENTRIES = 64;

declare const exactOriginBrand: unique symbol;
export type ExactOrigin = string & { readonly [exactOriginBrand]: true };

export type EmbedGateRejection =
  | "closed"
  | "untrusted-peer"
  | "oversized"
  | "rate-limited"
  | "invalid-message"
  | "invalid-state"
  | "replayed-request"
  | "channel-exhausted";

export type EmbedGateResult<Message> =
  | { accepted: true; message: Message }
  | { accepted: false; reason: EmbedGateRejection };

interface SequencedMessage {
  sequence: number;
  type: string;
  requestId?: string;
}

interface EmbedInboundGateOptions<Message extends SequencedMessage> {
  expectedSource: WindowProxy;
  expectedOrigin: ExactOrigin;
  channelId: string;
  initialPeerNonce: string | null;
  initialType?: Message["type"];
  initialSequence?: number;
  initialRequestIds?: readonly string[];
  parse: (value: unknown, expected: EmbedEnvelopeExpectation) => Message;
  maxMessageBytes?: number;
  maxOperationalMessageBytes?: number;
  maxMessagesPerWindow?: number;
  rateWindowMs?: number;
  maxAcceptedMessages?: number;
}

interface BridgeEvent {
  data: unknown;
  origin: string;
  source: MessageEventSource | null;
  ports: readonly MessagePort[];
}

/**
 * Stateful validation for one direction of a single embed channel.
 *
 * Authentication order is intentional: peer Window and exact origin, bounded
 * structure, rate budget, then strict protocol/channel/sequence/nonce schema.
 * Accepted request IDs are unique in this sender's channel direction and the
 * channel has a finite lifetime.
 */
export class EmbedInboundGate<Message extends SequencedMessage> {
  readonly #expectedSource: WindowProxy;
  readonly #expectedOrigin: ExactOrigin;
  readonly #channelId: string;
  readonly #initialType: Message["type"] | undefined;
  readonly #parse: EmbedInboundGateOptions<Message>["parse"];
  readonly #maxMessageBytes: number;
  readonly #maxOperationalMessageBytes: number;
  readonly #maxMessagesPerWindow: number;
  readonly #rateWindowMs: number;
  readonly #maxAcceptedMessages: number;
  readonly #seenRequestIds = new Set<string>();
  #attemptTimes: number[] = [];
  #peerNonce: string | null;
  #nextSequence: number;
  #acceptedMessages = 0;
  #closed = false;

  constructor(options: EmbedInboundGateOptions<Message>) {
    this.#expectedSource = options.expectedSource;
    this.#expectedOrigin = options.expectedOrigin;
    this.#channelId = options.channelId;
    this.#peerNonce = options.initialPeerNonce;
    this.#initialType = options.initialType;
    this.#nextSequence = options.initialSequence ?? 0;
    for (const requestId of options.initialRequestIds ?? []) {
      this.#seenRequestIds.add(requestId);
    }
    this.#parse = options.parse;
    this.#maxMessageBytes = options.maxMessageBytes ?? EMBED_MAX_MESSAGE_BYTES;
    this.#maxOperationalMessageBytes =
      options.maxOperationalMessageBytes ?? EMBED_MAX_OPERATIONAL_MESSAGE_BYTES;
    this.#maxMessagesPerWindow =
      options.maxMessagesPerWindow ?? EMBED_MAX_MESSAGES_PER_WINDOW;
    this.#rateWindowMs = options.rateWindowMs ?? EMBED_RATE_WINDOW_MS;
    this.#maxAcceptedMessages =
      options.maxAcceptedMessages ?? EMBED_MAX_ACCEPTED_MESSAGES;
  }

  accept(event: BridgeEvent, now = Date.now()): EmbedGateResult<Message> {
    if (this.#closed) return { accepted: false, reason: "closed" };
    if (
      !isTrustedWindowEvent(event, this.#expectedSource, this.#expectedOrigin)
    ) {
      return { accepted: false, reason: "untrusted-peer" };
    }
    if (event.ports.length !== 0) {
      return { accepted: false, reason: "invalid-message" };
    }

    const structuredBytes = structuredSizeWithin(
      event.data,
      this.#maxMessageBytes,
    );
    if (structuredBytes === null) {
      return { accepted: false, reason: "oversized" };
    }

    const earliestAllowed = now - this.#rateWindowMs;
    this.#attemptTimes = this.#attemptTimes.filter(
      (attemptTime) => attemptTime > earliestAllowed,
    );
    if (this.#attemptTimes.length >= this.#maxMessagesPerWindow) {
      return { accepted: false, reason: "rate-limited" };
    }
    this.#attemptTimes.push(now);

    let message: Message;
    try {
      message = this.#parse(event.data, {
        channelId: this.#channelId,
        sequence: this.#nextSequence,
        peerNonce: this.#peerNonce,
      });
    } catch {
      return { accepted: false, reason: "invalid-message" };
    }

    if (
      this.#acceptedMessages === 0 &&
      this.#initialType !== undefined &&
      message.type !== this.#initialType
    ) {
      return { accepted: false, reason: "invalid-state" };
    }
    if (
      this.#nextSequence > 0 &&
      structuredBytes > this.#maxOperationalMessageBytes
    ) {
      return { accepted: false, reason: "oversized" };
    }
    if (message.requestId && this.#seenRequestIds.has(message.requestId)) {
      return { accepted: false, reason: "replayed-request" };
    }
    if (this.#acceptedMessages >= this.#maxAcceptedMessages) {
      this.#closed = true;
      return { accepted: false, reason: "channel-exhausted" };
    }

    if (message.requestId) this.#seenRequestIds.add(message.requestId);
    this.#acceptedMessages += 1;
    this.#nextSequence += 1;
    return { accepted: true, message };
  }

  /** Called by the frame once, immediately after accepting host.init. */
  establishPeerNonce(peerNonce: string): void {
    if (
      this.#closed ||
      this.#peerNonce !== null ||
      this.#nextSequence !== 1 ||
      !isValidEmbedNonce(peerNonce)
    ) {
      this.destroy();
      throw new Error("Embed peer nonce cannot be established in this state.");
    }
    this.#peerNonce = peerNonce;
  }

  destroy(): void {
    this.#closed = true;
    this.#attemptTimes = [];
    this.#seenRequestIds.clear();
  }
}

/**
 * Accepts exactly one source/origin-bound host.init before the frame knows the
 * host-generated channel ID. No identifier has to be placed in the iframe URL.
 */
export class EmbedHostInitializationGate {
  readonly #expectedSource: WindowProxy;
  readonly #expectedOrigin: ExactOrigin;
  readonly #expectedBootstrapNonce: string;
  readonly #attemptTimes: number[] = [];
  #closed = false;

  constructor(options: {
    expectedParentWindow: WindowProxy;
    expectedParentOrigin: ExactOrigin;
    expectedBootstrapNonce: string;
  }) {
    this.#expectedSource = options.expectedParentWindow;
    this.#expectedOrigin = options.expectedParentOrigin;
    if (!isValidEmbedNonce(options.expectedBootstrapNonce)) {
      throw new Error("Expected a valid frame bootstrap nonce.");
    }
    this.#expectedBootstrapNonce = options.expectedBootstrapNonce;
  }

  accept(
    event: BridgeEvent,
    now = Date.now(),
  ): EmbedGateResult<Extract<HostToFrameMessage, { type: "host.init" }>> {
    if (this.#closed) return { accepted: false, reason: "closed" };
    if (!isTrustedWindowEvent(event, this.#expectedSource, this.#expectedOrigin)) {
      return { accepted: false, reason: "untrusted-peer" };
    }
    if (event.ports.length !== 0) {
      return { accepted: false, reason: "invalid-message" };
    }
    if (structuredSizeWithin(event.data, EMBED_MAX_MESSAGE_BYTES) === null) {
      return { accepted: false, reason: "oversized" };
    }

    const earliestAllowed = now - EMBED_RATE_WINDOW_MS;
    while (
      this.#attemptTimes.length > 0 &&
      this.#attemptTimes[0] <= earliestAllowed
    ) {
      this.#attemptTimes.shift();
    }
    if (this.#attemptTimes.length >= EMBED_MAX_MESSAGES_PER_WINDOW) {
      return { accepted: false, reason: "rate-limited" };
    }
    this.#attemptTimes.push(now);

    try {
      const message = parseHostInitialization(
        event.data,
        this.#expectedBootstrapNonce,
      );
      this.#closed = true;
      this.#attemptTimes.length = 0;
      return { accepted: true, message };
    } catch {
      return { accepted: false, reason: "invalid-message" };
    }
  }

  destroy(): void {
    this.#closed = true;
    this.#attemptTimes.length = 0;
  }
}

/** One-shot, pre-channel readiness gate bound to the exact frame Window/origin. */
export class EmbedFrameBootstrapGate {
  readonly #expectedSource: WindowProxy;
  readonly #expectedOrigin: ExactOrigin;
  readonly #attemptTimes: number[] = [];
  #closed = false;

  constructor(options: {
    expectedFrameWindow: WindowProxy;
    expectedFrameOrigin: ExactOrigin;
  }) {
    this.#expectedSource = options.expectedFrameWindow;
    this.#expectedOrigin = options.expectedFrameOrigin;
  }

  accept(
    event: BridgeEvent,
    now = Date.now(),
  ): EmbedGateResult<FrameBootstrapMessage> {
    if (this.#closed) return { accepted: false, reason: "closed" };
    if (!isTrustedWindowEvent(event, this.#expectedSource, this.#expectedOrigin)) {
      return { accepted: false, reason: "untrusted-peer" };
    }
    if (event.ports.length !== 0) {
      return { accepted: false, reason: "invalid-message" };
    }
    if (
      structuredSizeWithin(event.data, EMBED_MAX_OPERATIONAL_MESSAGE_BYTES) ===
      null
    ) {
      return { accepted: false, reason: "oversized" };
    }

    const earliestAllowed = now - EMBED_RATE_WINDOW_MS;
    while (
      this.#attemptTimes.length > 0 &&
      this.#attemptTimes[0] <= earliestAllowed
    ) {
      this.#attemptTimes.shift();
    }
    if (this.#attemptTimes.length >= EMBED_MAX_MESSAGES_PER_WINDOW) {
      return { accepted: false, reason: "rate-limited" };
    }
    this.#attemptTimes.push(now);

    try {
      const message = parseFrameBootstrapMessage(event.data);
      this.#closed = true;
      this.#attemptTimes.length = 0;
      return { accepted: true, message };
    } catch {
      return { accepted: false, reason: "invalid-message" };
    }
  }

  destroy(): void {
    this.#closed = true;
    this.#attemptTimes.length = 0;
  }
}

export function createHostToFrameGate(options: {
  expectedParentWindow: WindowProxy;
  expectedParentOrigin: ExactOrigin;
  channelId: string;
  expectedBootstrapNonce: string;
}): EmbedInboundGate<HostToFrameMessage> {
  if (!isValidEmbedNonce(options.expectedBootstrapNonce)) {
    throw new Error("Expected a valid frame bootstrap nonce.");
  }
  return new EmbedInboundGate({
    expectedSource: options.expectedParentWindow,
    expectedOrigin: options.expectedParentOrigin,
    channelId: options.channelId,
    initialPeerNonce: null,
    initialType: "host.init",
    parse: (value, expected) => {
      const message = parseHostToFrameMessage(value, expected);
      if (
        message.type === "host.init" &&
        message.payload.bootstrapNonce !== options.expectedBootstrapNonce
      ) {
        throw new Error("The frame bootstrap nonce does not match.");
      }
      return message;
    },
  });
}

export function createEstablishedHostToFrameGate(options: {
  expectedParentWindow: WindowProxy;
  expectedParentOrigin: ExactOrigin;
  channelId: string;
  frameNonce: string;
  initializationRequestId?: string;
}): EmbedInboundGate<HostToFrameMessage> {
  return new EmbedInboundGate({
    expectedSource: options.expectedParentWindow,
    expectedOrigin: options.expectedParentOrigin,
    channelId: options.channelId,
    initialPeerNonce: options.frameNonce,
    initialSequence: 1,
    initialRequestIds: options.initializationRequestId
      ? [options.initializationRequestId]
      : undefined,
    parse: parseHostToFrameMessage,
  });
}

export function createHostInitializationGate(options: {
  expectedParentWindow: WindowProxy;
  expectedParentOrigin: ExactOrigin;
  expectedBootstrapNonce: string;
}): EmbedHostInitializationGate {
  return new EmbedHostInitializationGate(options);
}

export function createFrameBootstrapGate(options: {
  expectedFrameWindow: WindowProxy;
  expectedFrameOrigin: ExactOrigin;
}): EmbedFrameBootstrapGate {
  return new EmbedFrameBootstrapGate(options);
}

export function createFrameToHostGate(options: {
  expectedFrameWindow: WindowProxy;
  expectedFrameOrigin: ExactOrigin;
  channelId: string;
  parentNonce: string;
}): EmbedInboundGate<FrameToHostMessage> {
  return new EmbedInboundGate({
    expectedSource: options.expectedFrameWindow,
    expectedOrigin: options.expectedFrameOrigin,
    channelId: options.channelId,
    initialPeerNonce: options.parentNonce,
    initialType: "frame.ready",
    parse: parseFrameToHostMessage,
  });
}

export function exactOrigin(
  value: string,
  options: { allowLoopbackHttp?: boolean } = {},
): ExactOrigin {
  if (!value || value === "*" || value === "null" || value.length > 2_048) {
    throw new Error("Expected an exact canonical origin.");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Expected an exact canonical origin.");
  }

  const isLoopback =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "[::1]";
  const protocolAllowed =
    parsed.protocol === "https:" ||
    (options.allowLoopbackHttp === true && parsed.protocol === "http:" && isLoopback);

  if (
    !protocolAllowed ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.origin !== value
  ) {
    throw new Error("Expected an exact canonical origin.");
  }

  return parsed.origin as ExactOrigin;
}

export function postExactBridgeMessage(
  target: WindowProxy,
  targetOrigin: ExactOrigin,
  message: FrameBootstrapMessage | HostToFrameMessage | FrameToHostMessage,
): void {
  target.postMessage(message, targetOrigin);
}

export function randomBase64Url(byteLength: number): string {
  if (!Number.isSafeInteger(byteLength) || byteLength < 16 || byteLength > 64) {
    throw new Error("Random identifier length is outside the supported range.");
  }
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let output = "";
  let accumulator = 0;
  let bits = 0;

  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      output += alphabet[(accumulator >> bits) & 63];
    }
  }
  if (bits > 0) output += alphabet[(accumulator << (6 - bits)) & 63];
  return output;
}

function structuredSizeWithin(value: unknown, maximumBytes: number): number | null {
  const seen = new Set<object>();
  try {
    const size = structuredSize(value, maximumBytes, 0, seen);
    return size <= maximumBytes ? size : null;
  } catch {
    return null;
  }
}

function structuredSize(
  value: unknown,
  remaining: number,
  depth: number,
  seen: Set<object>,
): number {
  if (remaining < 0 || depth > MAX_STRUCTURED_DEPTH) return remaining + 1;
  if (value === null) return 4;
  if (typeof value === "boolean") return value ? 4 : 5;
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value).length : remaining + 1;
  }
  if (typeof value === "string") {
    if (value.length > remaining) return remaining + 1;
    return jsonStringBytes(value);
  }
  if (typeof value !== "object") return remaining + 1;

  if (seen.has(value)) return remaining + 1;
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (
        value.length > MAX_CONTAINER_ENTRIES ||
        Object.getPrototypeOf(value) !== Array.prototype ||
        Object.getOwnPropertySymbols(value).length !== 0
      ) {
        return remaining + 1;
      }
      const names = Object.getOwnPropertyNames(value);
      if (names.length !== value.length + 1 || !names.includes("length")) {
        return remaining + 1;
      }
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, String(index))) return remaining + 1;
      }
      let size = 2;
      for (const entry of value) {
        size += structuredSize(entry, remaining - size, depth + 1, seen) + 1;
        if (size > remaining) return size;
      }
      return size;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return remaining + 1;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length > MAX_CONTAINER_ENTRIES) return remaining + 1;
    let size = 2;
    for (const key of keys) {
      size += jsonStringBytes(key) + 1;
      size += structuredSize(record[key], remaining - size, depth + 1, seen) + 1;
      if (size > remaining) return size;
    }
    return size;
  } finally {
    seen.delete(value);
  }
}

function jsonStringBytes(value: string): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
