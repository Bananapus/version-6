import { parseThemeSelection, type ThemeSelectionV1 } from "@/theme/theme";

export const EMBED_PROTOCOL = "org.juicebox.messaging.embed" as const;
export const EMBED_PROTOCOL_VERSION = 1 as const;

export const EMBED_CAPABILITIES = [
  "opaque-context-v1",
  "semantic-theme-v1",
  "coarse-unread-v1",
  "fixed-top-level-v1",
] as const;

export const EMBED_LOCALES = ["en"] as const;

export type EmbedCapability = (typeof EMBED_CAPABILITIES)[number];
export type EmbedLocale = (typeof EMBED_LOCALES)[number];
export type EmbedLayout = "compact" | "regular" | "expanded";
export type EmbedTopLevelReason =
  | "wallet-auth"
  | "storage-recovery"
  | "user-request";

export interface FrameBootstrapMessage {
  protocol: typeof EMBED_PROTOCOL;
  version: typeof EMBED_PROTOCOL_VERSION;
  type: "frame.bootstrap_ready";
  bootstrapNonce: string;
}

interface InitialBridgeEnvelope<Type extends string, Payload> {
  protocol: typeof EMBED_PROTOCOL;
  version: typeof EMBED_PROTOCOL_VERSION;
  channelId: string;
  sequence: number;
  requestId?: string;
  type: Type;
  payload: Payload;
}

interface EstablishedBridgeEnvelope<Type extends string, Payload>
  extends InitialBridgeEnvelope<Type, Payload> {
  peerNonce: string;
}

export type HostToFrameMessage =
  | InitialBridgeEnvelope<
      "host.init",
      {
        bootstrapNonce: string;
        parentNonce: string;
        /** One-use, audience-bound opaque capability. Never put it in a URL. */
        contextHandle: string;
        locale: EmbedLocale;
        theme: ThemeSelectionV1;
      }
    >
  | EstablishedBridgeEnvelope<
      "host.set_theme",
      { theme: ThemeSelectionV1 }
    >
  | EstablishedBridgeEnvelope<"host.set_locale", { locale: EmbedLocale }>
  | EstablishedBridgeEnvelope<"host.destroy", Record<string, never>>;

export type FrameToHostMessage =
  | EstablishedBridgeEnvelope<
      "frame.ready",
      {
        frameNonce: string;
        acceptedVersion: typeof EMBED_PROTOCOL_VERSION;
        capabilities: readonly EmbedCapability[];
      }
    >
  | EstablishedBridgeEnvelope<"frame.layout", { layout: EmbedLayout }>
  | EstablishedBridgeEnvelope<"frame.unread", { hasUnread: boolean }>
  | EstablishedBridgeEnvelope<
      "frame.auth_required",
      { reason: "wallet-auth" | "device-enrollment" | "storage-recovery" }
    >
  | EstablishedBridgeEnvelope<
      "frame.open_top_level",
      { reason: EmbedTopLevelReason }
    >
  | EstablishedBridgeEnvelope<"frame.closed", Record<string, never>>
  | EstablishedBridgeEnvelope<
      "frame.error",
      {
        code:
          | "context-invalid"
          | "channel-invalid"
          | "temporarily-unavailable";
        retryable: boolean;
      }
    >;

export interface EmbedEnvelopeExpectation {
  channelId: string;
  sequence: number;
  /** Null means that the one-shot initialization message must omit peerNonce. */
  peerNonce: string | null;
}

export class EmbedProtocolError extends Error {
  readonly code:
    | "invalid_shape"
    | "unknown_field"
    | "invalid_value"
    | "channel_mismatch"
    | "sequence_mismatch"
    | "nonce_mismatch";

  constructor(code: EmbedProtocolError["code"], message: string) {
    super(message);
    this.name = "EmbedProtocolError";
    this.code = code;
  }
}

const BASE_ENVELOPE_FIELDS = [
  "protocol",
  "version",
  "channelId",
  "sequence",
  "type",
  "payload",
] as const;
const OPTIONAL_ENVELOPE_FIELDS = ["peerNonce", "requestId"] as const;
const CHANNEL_ID = /^[A-Za-z0-9_-]{22,86}$/;
const NONCE = /^[A-Za-z0-9_-]{43,86}$/;
const REQUEST_ID = /^[A-Za-z0-9_-]{16,86}$/;
const CONTEXT_HANDLE = /^[A-Za-z0-9_-]{43,1024}$/;
const MAX_SEQUENCE = Number.MAX_SAFE_INTEGER - 1;

export function parseHostInitialization(
  value: unknown,
  expectedBootstrapNonce: string,
): Extract<HostToFrameMessage, { type: "host.init" }> {
  const envelope = recordWithOptionalFields(
    value,
    BASE_ENVELOPE_FIELDS,
    OPTIONAL_ENVELOPE_FIELDS,
    "bridge envelope",
  );
  if (!isValidEmbedChannelId(envelope.channelId)) {
    throw new EmbedProtocolError("invalid_value", "Embed channel ID is malformed.");
  }
  if (
    envelope.type !== "host.init" ||
    envelope.sequence !== 0 ||
    Object.hasOwn(envelope, "peerNonce")
  ) {
    throw new EmbedProtocolError(
      "invalid_value",
      "The first host message must be one-shot initialization.",
    );
  }
  const message = parseHostToFrameMessage(value, {
    channelId: envelope.channelId,
    sequence: 0,
    peerNonce: null,
  });
  if (message.type !== "host.init") {
    throw new EmbedProtocolError("invalid_value", "Initialization message is invalid.");
  }
  if (
    !isValidEmbedNonce(expectedBootstrapNonce) ||
    message.payload.bootstrapNonce !== expectedBootstrapNonce
  ) {
    throw new EmbedProtocolError(
      "nonce_mismatch",
      "The frame bootstrap nonce does not match.",
    );
  }
  return message;
}

export function parseFrameBootstrapMessage(
  value: unknown,
): FrameBootstrapMessage {
  const message = exactRecord(
    value,
    ["protocol", "version", "type", "bootstrapNonce"],
    "frame bootstrap message",
  );
  if (
    message.protocol !== EMBED_PROTOCOL ||
    message.version !== EMBED_PROTOCOL_VERSION ||
    message.type !== "frame.bootstrap_ready"
  ) {
    throw new EmbedProtocolError("invalid_value", "Frame bootstrap is invalid.");
  }
  return {
    protocol: EMBED_PROTOCOL,
    version: EMBED_PROTOCOL_VERSION,
    type: "frame.bootstrap_ready",
    bootstrapNonce: parseNonce(message.bootstrapNonce, "bootstrap nonce"),
  };
}

export function parseHostToFrameMessage(
  value: unknown,
  expected: EmbedEnvelopeExpectation,
): HostToFrameMessage {
  const envelope = parseEnvelope(value, expected);

  switch (envelope.type) {
    case "host.init": {
      if (expected.sequence !== 0 || expected.peerNonce !== null) {
        throw new EmbedProtocolError(
          "invalid_value",
          "Initialization is only valid as the first channel message.",
        );
      }
      const payload = exactRecord(
        envelope.payload,
        ["bootstrapNonce", "parentNonce", "contextHandle", "locale", "theme"],
        "initialization payload",
      );
      return {
        ...withoutPeerNonce(envelope),
        type: "host.init",
        payload: {
          bootstrapNonce: parseNonce(payload.bootstrapNonce, "bootstrap nonce"),
          parentNonce: parseNonce(payload.parentNonce, "parent nonce"),
          contextHandle: parseContextHandle(payload.contextHandle),
          locale: parseLocale(payload.locale),
          theme: parseTheme(payload.theme),
        },
      };
    }
    case "host.set_theme": {
      requireEstablished(expected);
      const payload = exactRecord(envelope.payload, ["theme"], "theme payload");
      return {
        ...withPeerNonce(envelope),
        type: "host.set_theme",
        payload: { theme: parseTheme(payload.theme) },
      };
    }
    case "host.set_locale": {
      requireEstablished(expected);
      const payload = exactRecord(envelope.payload, ["locale"], "locale payload");
      return {
        ...withPeerNonce(envelope),
        type: "host.set_locale",
        payload: { locale: parseLocale(payload.locale) },
      };
    }
    case "host.destroy":
      requireEstablished(expected);
      exactRecord(envelope.payload, [], "destroy payload");
      return { ...withPeerNonce(envelope), type: "host.destroy", payload: {} };
    default:
      throw new EmbedProtocolError("invalid_value", "Unknown host message type.");
  }
}

export function parseFrameToHostMessage(
  value: unknown,
  expected: EmbedEnvelopeExpectation,
): FrameToHostMessage {
  requirePeerNonce(expected);
  const envelope = parseEnvelope(value, expected);

  switch (envelope.type) {
    case "frame.ready": {
      if (expected.sequence !== 0) {
        throw new EmbedProtocolError(
          "invalid_value",
          "Ready is only valid as the first frame message.",
        );
      }
      const payload = exactRecord(
        envelope.payload,
        ["frameNonce", "acceptedVersion", "capabilities"],
        "ready payload",
      );
      if (
        payload.acceptedVersion !== EMBED_PROTOCOL_VERSION ||
        !isExactCapabilities(payload.capabilities)
      ) {
        throw new EmbedProtocolError("invalid_value", "Frame capabilities are malformed.");
      }
      return {
        ...withPeerNonce(envelope),
        type: "frame.ready",
        payload: {
          frameNonce: parseNonce(payload.frameNonce, "frame nonce"),
          acceptedVersion: EMBED_PROTOCOL_VERSION,
          capabilities: EMBED_CAPABILITIES,
        },
      };
    }
    case "frame.layout": {
      requireOperationalSequence(expected);
      const payload = exactRecord(envelope.payload, ["layout"], "layout payload");
      if (!isOneOf(payload.layout, ["compact", "regular", "expanded"] as const)) {
        throw new EmbedProtocolError("invalid_value", "Frame layout is invalid.");
      }
      return {
        ...withPeerNonce(envelope),
        type: "frame.layout",
        payload: { layout: payload.layout },
      };
    }
    case "frame.unread": {
      requireOperationalSequence(expected);
      const payload = exactRecord(envelope.payload, ["hasUnread"], "unread payload");
      if (typeof payload.hasUnread !== "boolean") {
        throw new EmbedProtocolError("invalid_value", "Unread state is invalid.");
      }
      return {
        ...withPeerNonce(envelope),
        type: "frame.unread",
        payload: { hasUnread: payload.hasUnread },
      };
    }
    case "frame.auth_required": {
      requireOperationalSequence(expected);
      const payload = exactRecord(envelope.payload, ["reason"], "auth payload");
      if (
        !isOneOf(payload.reason, [
          "wallet-auth",
          "device-enrollment",
          "storage-recovery",
        ] as const)
      ) {
        throw new EmbedProtocolError("invalid_value", "Authentication reason is invalid.");
      }
      return {
        ...withPeerNonce(envelope),
        type: "frame.auth_required",
        payload: { reason: payload.reason },
      };
    }
    case "frame.open_top_level": {
      requireOperationalSequence(expected);
      const payload = exactRecord(envelope.payload, ["reason"], "open payload");
      if (
        !isOneOf(payload.reason, [
          "wallet-auth",
          "storage-recovery",
          "user-request",
        ] as const)
      ) {
        throw new EmbedProtocolError("invalid_value", "Top-level reason is invalid.");
      }
      return {
        ...withPeerNonce(envelope),
        type: "frame.open_top_level",
        payload: { reason: payload.reason },
      };
    }
    case "frame.closed":
      requireOperationalSequence(expected);
      exactRecord(envelope.payload, [], "closed payload");
      return { ...withPeerNonce(envelope), type: "frame.closed", payload: {} };
    case "frame.error": {
      requireOperationalSequence(expected);
      const payload = exactRecord(
        envelope.payload,
        ["code", "retryable"],
        "error payload",
      );
      if (
        !isOneOf(payload.code, [
          "context-invalid",
          "channel-invalid",
          "temporarily-unavailable",
        ] as const) ||
        typeof payload.retryable !== "boolean"
      ) {
        throw new EmbedProtocolError("invalid_value", "Frame error is invalid.");
      }
      if (
        (payload.code === "temporarily-unavailable") !== payload.retryable
      ) {
        throw new EmbedProtocolError(
          "invalid_value",
          "Frame error retryability is invalid.",
        );
      }
      return {
        ...withPeerNonce(envelope),
        type: "frame.error",
        payload: { code: payload.code, retryable: payload.retryable },
      };
    }
    default:
      throw new EmbedProtocolError("invalid_value", "Unknown frame message type.");
  }
}

/** Schema validation is not peer authentication; call this before parsing. */
export function isTrustedWindowEvent(
  event: Pick<MessageEvent, "origin" | "source">,
  expectedWindow: WindowProxy,
  expectedOrigin: string,
): boolean {
  return event.source === expectedWindow && event.origin === expectedOrigin;
}

export function isValidEmbedChannelId(value: unknown): value is string {
  return typeof value === "string" && CHANNEL_ID.test(value);
}

export function isValidEmbedNonce(value: unknown): value is string {
  return typeof value === "string" && NONCE.test(value);
}

interface ParsedEnvelope {
  protocol: typeof EMBED_PROTOCOL;
  version: typeof EMBED_PROTOCOL_VERSION;
  channelId: string;
  sequence: number;
  peerNonce?: string;
  requestId?: string;
  type: unknown;
  payload: unknown;
}

function parseEnvelope(
  value: unknown,
  expected: EmbedEnvelopeExpectation,
): ParsedEnvelope {
  if (
    !isValidEmbedChannelId(expected.channelId) ||
    !Number.isSafeInteger(expected.sequence) ||
    expected.sequence < 0 ||
    expected.sequence > MAX_SEQUENCE ||
    (expected.peerNonce !== null && !isValidEmbedNonce(expected.peerNonce))
  ) {
    throw new EmbedProtocolError("invalid_value", "Channel expectation is malformed.");
  }

  const envelope = recordWithOptionalFields(
    value,
    BASE_ENVELOPE_FIELDS,
    OPTIONAL_ENVELOPE_FIELDS,
    "bridge envelope",
  );
  if (
    envelope.protocol !== EMBED_PROTOCOL ||
    envelope.version !== EMBED_PROTOCOL_VERSION
  ) {
    throw new EmbedProtocolError("invalid_value", "Unsupported embed protocol.");
  }
  if (envelope.channelId !== expected.channelId) {
    throw new EmbedProtocolError("channel_mismatch", "Embed channel does not match.");
  }
  if (envelope.sequence !== expected.sequence) {
    throw new EmbedProtocolError("sequence_mismatch", "Embed sequence does not match.");
  }
  if (
    (expected.peerNonce === null && Object.hasOwn(envelope, "peerNonce")) ||
    (expected.peerNonce !== null &&
      (!Object.hasOwn(envelope, "peerNonce") ||
        envelope.peerNonce !== expected.peerNonce))
  ) {
    throw new EmbedProtocolError("nonce_mismatch", "Embed peer nonce does not match.");
  }

  const requestId = Object.hasOwn(envelope, "requestId")
    ? parseRequestId(envelope.requestId)
    : undefined;
  return {
    protocol: EMBED_PROTOCOL,
    version: EMBED_PROTOCOL_VERSION,
    channelId: expected.channelId,
    sequence: expected.sequence,
    ...(expected.peerNonce === null ? {} : { peerNonce: expected.peerNonce }),
    ...(requestId ? { requestId } : {}),
    type: envelope.type,
    payload: envelope.payload,
  };
}

function withoutPeerNonce(envelope: ParsedEnvelope) {
  return {
    protocol: envelope.protocol,
    version: envelope.version,
    channelId: envelope.channelId,
    sequence: envelope.sequence,
    ...(envelope.requestId ? { requestId: envelope.requestId } : {}),
  };
}

function withPeerNonce(envelope: ParsedEnvelope) {
  if (!envelope.peerNonce) {
    throw new EmbedProtocolError("nonce_mismatch", "A peer nonce is required.");
  }
  return {
    protocol: envelope.protocol,
    version: envelope.version,
    channelId: envelope.channelId,
    sequence: envelope.sequence,
    peerNonce: envelope.peerNonce,
    ...(envelope.requestId ? { requestId: envelope.requestId } : {}),
  };
}

function requireEstablished(expected: EmbedEnvelopeExpectation): void {
  if (expected.peerNonce === null || expected.sequence < 1) {
    throw new EmbedProtocolError("invalid_value", "The channel is not established.");
  }
}

function requirePeerNonce(expected: EmbedEnvelopeExpectation): void {
  if (expected.peerNonce === null) {
    throw new EmbedProtocolError("invalid_value", "The peer nonce is not established.");
  }
}

function requireOperationalSequence(expected: EmbedEnvelopeExpectation): void {
  if (expected.sequence < 1) {
    throw new EmbedProtocolError("invalid_value", "Operational message arrived before ready.");
  }
}

function parseContextHandle(value: unknown): string {
  if (typeof value !== "string" || !CONTEXT_HANDLE.test(value)) {
    throw new EmbedProtocolError("invalid_value", "The context capability is malformed.");
  }
  return value;
}

function parseNonce(value: unknown, label: string): string {
  if (!isValidEmbedNonce(value)) {
    throw new EmbedProtocolError("invalid_value", `${label} is malformed.`);
  }
  return value;
}

function parseRequestId(value: unknown): string {
  if (typeof value !== "string" || !REQUEST_ID.test(value)) {
    throw new EmbedProtocolError("invalid_value", "Request ID is malformed.");
  }
  return value;
}

function parseLocale(value: unknown): EmbedLocale {
  if (!isOneOf(value, EMBED_LOCALES)) {
    throw new EmbedProtocolError("invalid_value", "Locale is unsupported.");
  }
  return value;
}

function parseTheme(value: unknown): ThemeSelectionV1 {
  try {
    const theme = plainRecord(value, "theme");
    for (const optionalField of [
      "colors",
      "cornerStyle",
      "density",
      "typography",
    ]) {
      if (Object.hasOwn(theme, optionalField) && theme[optionalField] === undefined) {
        throw new EmbedProtocolError(
          "invalid_value",
          "Optional theme fields must be omitted when unused.",
        );
      }
    }
    if (Object.hasOwn(theme, "colors")) {
      const colors = plainRecord(theme.colors, "theme colors");
      if (Object.keys(colors).some((key) => colors[key] === undefined)) {
        throw new EmbedProtocolError(
          "invalid_value",
          "Optional theme colors must be omitted when unused.",
        );
      }
    }
    return parseThemeSelection(value);
  } catch {
    throw new EmbedProtocolError("invalid_value", "Theme selection is invalid.");
  }
}

function isExactCapabilities(value: unknown): value is readonly EmbedCapability[] {
  return (
    hasCanonicalArrayShape(value) &&
    value.length === EMBED_CAPABILITIES.length &&
    value.every((capability, index) => capability === EMBED_CAPABILITIES[index])
  );
}

function hasCanonicalArrayShape(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return false;
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) return false;
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== value.length + 1 || !names.includes("length")) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, String(index))) return false;
  }
  return true;
}

function exactRecord(
  value: unknown,
  acceptedFields: readonly string[],
  label: string,
): Record<string, unknown> {
  const record = plainRecord(value, label);
  const accepted = new Set(acceptedFields);
  const keys = Object.keys(record);
  if (keys.length !== accepted.size || keys.some((key) => !accepted.has(key))) {
    throw new EmbedProtocolError("unknown_field", `${label} has missing or unknown fields.`);
  }
  return record;
}

function recordWithOptionalFields(
  value: unknown,
  requiredFields: readonly string[],
  optionalFields: readonly string[],
  label: string,
): Record<string, unknown> {
  const record = plainRecord(value, label);
  const accepted = new Set([...requiredFields, ...optionalFields]);
  const keys = Object.keys(record);
  if (
    requiredFields.some((field) => !Object.hasOwn(record, field)) ||
    keys.some((key) => !accepted.has(key))
  ) {
    throw new EmbedProtocolError("unknown_field", `${label} has missing or unknown fields.`);
  }
  return record;
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new EmbedProtocolError("invalid_shape", `${label} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new EmbedProtocolError("invalid_shape", `${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function isOneOf<const T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && (options as readonly string[]).includes(value);
}
