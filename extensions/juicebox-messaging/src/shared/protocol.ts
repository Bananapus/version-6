import type {
  RecipientRosterBinding,
  ShippingAddress,
  SupportEvent,
} from "@/domain/model";

const API_ROOT = "/api/dev/messaging";
const SIMULATED_PAYLOAD_MARKER = "JUICEBOX_HTTP_LAN_SIMULATION_NOT_E2EE_V1";

export type SharedRole = "customer" | "project-staff";

export interface SharedActor {
  participantId: string;
  role: SharedRole;
  expiresAt: number;
}

export interface SharedRosterMember {
  participantId: string;
  role: SharedRole;
  joinedAt: number;
}

export interface SharedConversation {
  conversationId: string;
  projectRef: string;
  rosterVersion: string;
  epoch: number;
  createdAt: number;
  roster: SharedRosterMember[];
}

export interface SharedInvitation {
  invitationToken: string;
  participantId: string;
  role: SharedRole;
  expiresAt: number;
}

export interface SharedEnvelope {
  cursor: number;
  conversationId: string;
  clientEnvelopeId: string;
  senderParticipantId: string;
  senderRole: SharedRole;
  rosterVersion: string;
  epoch: number;
  encoding: "base64url";
  contentType: "application/vnd.juicebox.messaging.simulated-envelope+json";
  ciphertext: string;
  createdAt: number;
}

export interface SharedSession {
  actor: SharedActor;
  csrfToken: string;
  conversations: SharedConversation[];
}

export interface SharedBootstrapResult {
  conversation: SharedConversation;
  invitations: {
    customer: SharedInvitation;
    projectStaff: SharedInvitation;
  };
}

export interface SharedExchangeResult {
  actor: SharedActor;
  csrfToken: string;
  conversation: SharedConversation;
}

export class SharedProtocolError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(message: string, code = "invalid_response", status?: number) {
    super(message);
    this.name = "SharedProtocolError";
    this.code = code;
    this.status = status;
  }
}

export async function bootstrapSharedRoom(
  bootstrapSecret: string,
): Promise<SharedBootstrapResult> {
  return requestJson(
    `${API_ROOT}/bootstrap`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-messaging-dev-secret": bootstrapSecret,
      },
      body: JSON.stringify({ projectRef: "demo:banny-studio" }),
    },
    parseBootstrap,
  );
}

export async function exchangeSharedInvitation(
  invitationToken: string,
): Promise<SharedExchangeResult> {
  return requestJson(
    `${API_ROOT}/auth/exchange`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitationToken }),
    },
    parseExchange,
  );
}

export async function getSharedSession(): Promise<SharedSession> {
  return requestJson(
    `${API_ROOT}/session`,
    { method: "GET" },
    parseSession,
  );
}

export async function getSharedConversation(
  conversationId: string,
): Promise<SharedConversation> {
  const result = await requestJson(
    `${API_ROOT}/conversations/${encodeURIComponent(conversationId)}`,
    { method: "GET" },
    (value) => {
      const object = expectRecord(value, "conversation response");
      return parseConversation(object.conversation, "conversation");
    },
  );
  return result;
}

export async function syncSharedEnvelopes(
  conversationId: string,
  after: number,
): Promise<{ envelopes: SharedEnvelope[]; nextCursor: number; hasMore: boolean }> {
  const page = await requestJson(
    `${API_ROOT}/conversations/${encodeURIComponent(conversationId)}/envelopes?after=${after}&limit=100`,
    { method: "GET" },
    parseEnvelopePage,
  );
  let previousCursor = after;
  for (const envelope of page.envelopes) {
    if (envelope.cursor <= previousCursor) {
      throw invalidResponse("envelope cursors must increase monotonically");
    }
    previousCursor = envelope.cursor;
  }
  const finalEnvelopeCursor = page.envelopes.at(-1)?.cursor;
  if (page.nextCursor !== (finalEnvelopeCursor ?? after)) {
    throw invalidResponse("nextCursor must match the last returned envelope");
  }
  if (finalEnvelopeCursor !== undefined && page.nextCursor <= after) {
    throw invalidResponse("an envelope page must advance nextCursor");
  }
  if (page.hasMore && page.envelopes.length === 0) {
    throw invalidResponse("hasMore cannot accompany an empty envelope page");
  }
  return page;
}

export async function postSharedEnvelope(
  conversation: SharedConversation,
  csrfToken: string,
  input: {
    clientEnvelopeId: string;
    ciphertext: string;
  },
): Promise<{ envelope: SharedEnvelope; duplicate: boolean }> {
  return requestJson(
    `${API_ROOT}/conversations/${encodeURIComponent(conversation.conversationId)}/envelopes`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-messaging-csrf": csrfToken,
      },
      body: JSON.stringify({
        clientEnvelopeId: input.clientEnvelopeId,
        rosterVersion: conversation.rosterVersion,
        epoch: conversation.epoch,
        encoding: "base64url",
        contentType: "application/vnd.juicebox.messaging.simulated-envelope+json",
        ciphertext: input.ciphertext,
      }),
    },
    (value) => {
      const object = expectRecord(value, "submit response");
      return {
        envelope: parseEnvelope(object.envelope, "envelope"),
        duplicate: expectBoolean(object.duplicate, "duplicate"),
      };
    },
  );
}

export async function logoutSharedSession(csrfToken: string): Promise<void> {
  await requestJson(
    `${API_ROOT}/auth/logout`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-messaging-csrf": csrfToken,
      },
      body: "{}",
    },
    (value) => {
      const object = expectRecord(value, "logout response");
      if (object.ok !== true) throw invalidResponse("logout response is invalid");
    },
  );
}

export function encodeSimulatedSupportEvent(event: SupportEvent): string {
  const validatedEvent = parseSupportEvent(event);
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      simulationWarning: SIMULATED_PAYLOAD_MARKER,
      event: validatedEvent,
    }),
  );
  return bytesToBase64Url(bytes);
}

export function decodeSimulatedSupportEvent(ciphertext: string): SupportEvent {
  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(base64UrlToBytes(ciphertext)));
  } catch {
    throw invalidResponse("simulated envelope payload could not be decoded");
  }

  const wrapper = expectRecord(decoded, "simulated envelope payload");
  if (wrapper.simulationWarning !== SIMULATED_PAYLOAD_MARKER) {
    throw invalidResponse("envelope is not a supported simulated payload");
  }
  return parseSupportEvent(wrapper.event);
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
  parse: (value: unknown) => T,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch {
    throw new SharedProtocolError(
      "The shared development service could not be reached.",
      "network_error",
    );
  }

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new SharedProtocolError(
      "The shared development service returned an unreadable response.",
      "invalid_response",
      response.status,
    );
  }

  if (!response.ok) {
    const error = isRecord(value) && isRecord(value.error) ? value.error : undefined;
    const code = error && typeof error.code === "string" ? error.code : "request_failed";
    const message =
      error && typeof error.message === "string"
        ? error.message
        : "The shared development request failed.";
    throw new SharedProtocolError(message, code, response.status);
  }

  return parse(value);
}

function parseBootstrap(value: unknown): SharedBootstrapResult {
  const object = expectRecord(value, "bootstrap response");
  const invitations = expectRecord(object.invitations, "invitations");
  return {
    conversation: parseConversation(object.conversation, "conversation"),
    invitations: {
      customer: parseInvitation(invitations.customer, "customer invitation"),
      projectStaff: parseInvitation(invitations.projectStaff, "project staff invitation"),
    },
  };
}

function parseExchange(value: unknown): SharedExchangeResult {
  const object = expectRecord(value, "exchange response");
  return {
    actor: parseActor(object.actor),
    csrfToken: expectBoundedString(object.csrfToken, "csrfToken", 1, 256),
    conversation: parseConversation(object.conversation, "conversation"),
  };
}

function parseSession(value: unknown): SharedSession {
  const object = expectRecord(value, "session response");
  if (!Array.isArray(object.conversations)) {
    throw invalidResponse("session conversations must be an array");
  }
  return {
    actor: parseActor(object.actor),
    csrfToken: expectBoundedString(object.csrfToken, "csrfToken", 1, 256),
    conversations: object.conversations.map((entry, index) =>
      parseConversation(entry, `conversations[${index}]`),
    ),
  };
}

function parseEnvelopePage(
  value: unknown,
): { envelopes: SharedEnvelope[]; nextCursor: number; hasMore: boolean } {
  const object = expectRecord(value, "envelope page");
  if (!Array.isArray(object.envelopes)) {
    throw invalidResponse("envelopes must be an array");
  }
  return {
    envelopes: object.envelopes.map((entry, index) =>
      parseEnvelope(entry, `envelopes[${index}]`),
    ),
    nextCursor: expectInteger(object.nextCursor, "nextCursor", 0),
    hasMore: expectBoolean(object.hasMore, "hasMore"),
  };
}

function parseActor(value: unknown): SharedActor {
  const object = expectRecord(value, "actor");
  return {
    participantId: expectIdentifier(object.participantId, "actor.participantId"),
    role: expectRole(object.role, "actor.role"),
    expiresAt: expectInteger(object.expiresAt, "actor.expiresAt", 1),
  };
}

function parseInvitation(value: unknown, field: string): SharedInvitation {
  const object = expectRecord(value, field);
  return {
    invitationToken: expectBoundedString(
      object.invitationToken,
      `${field}.invitationToken`,
      43,
      43,
    ),
    participantId: expectIdentifier(object.participantId, `${field}.participantId`),
    role: expectRole(object.role, `${field}.role`),
    expiresAt: expectInteger(object.expiresAt, `${field}.expiresAt`, 1),
  };
}

function parseConversation(value: unknown, field: string): SharedConversation {
  const object = expectRecord(value, field);
  if (!Array.isArray(object.roster)) {
    throw invalidResponse(`${field}.roster must be an array`);
  }
  return {
    conversationId: expectIdentifier(object.conversationId, `${field}.conversationId`),
    projectRef: expectBoundedString(object.projectRef, `${field}.projectRef`, 1, 160),
    rosterVersion: expectDecimalString(object.rosterVersion, `${field}.rosterVersion`),
    epoch: expectInteger(object.epoch, `${field}.epoch`, 0),
    createdAt: expectInteger(object.createdAt, `${field}.createdAt`, 1),
    roster: object.roster.map((entry, index) => {
      const member = expectRecord(entry, `${field}.roster[${index}]`);
      return {
        participantId: expectIdentifier(
          member.participantId,
          `${field}.roster[${index}].participantId`,
        ),
        role: expectRole(member.role, `${field}.roster[${index}].role`),
        joinedAt: expectInteger(member.joinedAt, `${field}.roster[${index}].joinedAt`, 1),
      };
    }),
  };
}

function parseEnvelope(value: unknown, field: string): SharedEnvelope {
  const object = expectRecord(value, field);
  if (object.encoding !== "base64url") {
    throw invalidResponse(`${field}.encoding is invalid`);
  }
  if (object.contentType !== "application/vnd.juicebox.messaging.simulated-envelope+json") {
    throw invalidResponse(`${field}.contentType is invalid`);
  }
  const ciphertext = expectBoundedString(object.ciphertext, `${field}.ciphertext`, 16, 131_072);
  if (!/^[A-Za-z0-9_-]+$/.test(ciphertext)) {
    throw invalidResponse(`${field}.ciphertext is not base64url`);
  }
  return {
    cursor: expectInteger(object.cursor, `${field}.cursor`, 1),
    conversationId: expectIdentifier(object.conversationId, `${field}.conversationId`),
    clientEnvelopeId: expectIdentifier(object.clientEnvelopeId, `${field}.clientEnvelopeId`),
    senderParticipantId: expectIdentifier(
      object.senderParticipantId,
      `${field}.senderParticipantId`,
    ),
    senderRole: expectRole(object.senderRole, `${field}.senderRole`),
    rosterVersion: expectDecimalString(object.rosterVersion, `${field}.rosterVersion`),
    epoch: expectInteger(object.epoch, `${field}.epoch`, 0),
    encoding: "base64url",
    contentType: "application/vnd.juicebox.messaging.simulated-envelope+json",
    ciphertext,
    createdAt: expectInteger(object.createdAt, `${field}.createdAt`, 1),
  };
}

function parseSupportEvent(value: unknown): SupportEvent {
  const object = expectRecord(value, "support event");
  const base = {
    id: expectBoundedString(object.id, "support event id", 1, 128),
    createdAt: expectTimestamp(object.createdAt, "support event createdAt"),
  };

  switch (object.kind) {
    case "text.v1":
      return {
        ...base,
        kind: "text.v1",
        body: expectBoundedString(object.body, "text body", 1, 4_000),
      };
    case "address_request.v1":
      return {
        ...base,
        kind: "address_request.v1",
        reason: expectBoundedString(object.reason, "address request reason", 1, 1_000),
      };
    case "shipping_address.v1":
      return {
        ...base,
        kind: "shipping_address.v1",
        addressId: expectIdentifier(object.addressId, "addressId"),
        version: expectInteger(object.version, "address version", 1),
        address: parseShippingAddress(object.address),
        approvedRoster: parseRosterBinding(object.approvedRoster),
      };
    case "shipping_address_correction.v1":
      return {
        ...base,
        kind: "shipping_address_correction.v1",
        correctionId: expectIdentifier(object.correctionId, "correctionId"),
        correctionVersion: expectInteger(object.correctionVersion, "correction version", 1),
        shippedAddressId: expectIdentifier(object.shippedAddressId, "shippedAddressId"),
        shippedAddressVersion: expectInteger(
          object.shippedAddressVersion,
          "shipped address version",
          1,
        ),
        address: parseShippingAddress(object.address),
        approvedRoster: parseRosterBinding(object.approvedRoster),
      };
    case "address_ack.v1":
      return {
        ...base,
        kind: "address_ack.v1",
        addressId: expectIdentifier(object.addressId, "addressId"),
        addressVersion: expectInteger(object.addressVersion, "address version", 1),
      };
    case "fulfillment_status.v1": {
      if (object.status !== "preparing" && object.status !== "shipped") {
        throw invalidResponse("fulfillment status is invalid");
      }
      return {
        ...base,
        kind: "fulfillment_status.v1",
        status: object.status,
        addressId: expectIdentifier(object.addressId, "addressId"),
        addressVersion: expectInteger(object.addressVersion, "address version", 1),
      };
    }
    case "tracking.v1":
      return {
        ...base,
        kind: "tracking.v1",
        carrier: expectBoundedString(object.carrier, "carrier", 1, 200),
        trackingCode: expectBoundedString(object.trackingCode, "tracking code", 1, 300),
        addressId: expectIdentifier(object.addressId, "addressId"),
        addressVersion: expectInteger(object.addressVersion, "address version", 1),
      };
    default:
      throw invalidResponse("support event kind is unsupported");
  }
}

function parseShippingAddress(value: unknown): ShippingAddress {
  const object = expectRecord(value, "shipping address");
  return {
    recipientName: expectBoundedString(object.recipientName, "recipientName", 0, 512),
    line1: expectBoundedString(object.line1, "line1", 0, 512),
    line2: expectBoundedString(object.line2, "line2", 0, 512),
    city: expectBoundedString(object.city, "city", 0, 512),
    region: expectBoundedString(object.region, "region", 0, 512),
    postalCode: expectBoundedString(object.postalCode, "postalCode", 0, 128),
    country: expectBoundedString(object.country, "country", 0, 256),
    deliveryNote: expectBoundedString(object.deliveryNote, "deliveryNote", 0, 240),
  };
}

function parseRosterBinding(value: unknown): RecipientRosterBinding {
  const object = expectRecord(value, "approved roster");
  if (!Array.isArray(object.recipientDeviceFingerprints)) {
    throw invalidResponse("approved roster fingerprints must be an array");
  }
  const fingerprints = object.recipientDeviceFingerprints.map((entry, index) =>
    expectBoundedString(entry, `approved roster fingerprint ${index}`, 1, 256),
  );
  if (fingerprints.length === 0 || new Set(fingerprints).size !== fingerprints.length) {
    throw invalidResponse("approved roster fingerprints are invalid");
  }
  return {
    rosterVersion: expectBoundedString(object.rosterVersion, "approved roster version", 1, 128),
    mlsEpoch: expectInteger(object.mlsEpoch, "approved roster epoch", 0),
    recipientDeviceFingerprints: fingerprints,
  };
}

function expectRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw invalidResponse(`${field} must be an object`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function expectIdentifier(value: unknown, field: string): string {
  const result = expectBoundedString(value, field, 1, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(result)) {
    throw invalidResponse(`${field} is invalid`);
  }
  return result;
}

function expectRole(value: unknown, field: string): SharedRole {
  if (value !== "customer" && value !== "project-staff") {
    throw invalidResponse(`${field} is invalid`);
  }
  return value;
}

function expectInteger(value: unknown, field: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw invalidResponse(`${field} is invalid`);
  }
  return value;
}

function expectDecimalString(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
    throw invalidResponse(`${field} is invalid`);
  }
  return value;
}

function expectBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw invalidResponse(`${field} is invalid`);
  return value;
}

function expectBoundedString(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) {
    throw invalidResponse(`${field} is invalid`);
  }
  return value;
}

function expectTimestamp(value: unknown, field: string): string {
  const result = expectBoundedString(value, field, 1, 64);
  if (!Number.isFinite(Date.parse(result))) throw invalidResponse(`${field} is invalid`);
  return result;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 16_384) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 16_384));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw invalidResponse("ciphertext is not base64url");
  }
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function invalidResponse(message: string): SharedProtocolError {
  return new SharedProtocolError(`Invalid development-service response: ${message}.`);
}
