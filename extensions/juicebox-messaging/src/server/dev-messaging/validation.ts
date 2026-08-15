import { DevMessagingError, type MessagingRole } from "./types";
import { MAX_ENCODED_ENVELOPE_CHARS } from "./limits";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PROJECT_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export function expectObject(
  value: unknown,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidRequest("Expected a JSON object.");
  }
  const object = value as Record<string, unknown>;
  const extra = Object.keys(object).find((key) => !allowedKeys.includes(key));
  if (extra) {
    throw invalidRequest(`Unexpected field: ${extra}.`);
  }
  return object;
}

export function expectIdentifier(value: unknown, field: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw invalidRequest(`${field} is invalid.`);
  }
  return value;
}

export function expectProjectRef(value: unknown): string {
  if (typeof value !== "string" || !PROJECT_REFERENCE.test(value)) {
    throw invalidRequest("projectRef is invalid.");
  }
  return value;
}

export function expectRole(value: unknown): MessagingRole {
  if (value !== "customer" && value !== "project-staff") {
    throw invalidRequest("role must be customer or project-staff.");
  }
  return value;
}

export function expectInvitationToken(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw invalidRequest("invitationToken is invalid.");
  }
  return value;
}

export function expectInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw invalidRequest(`${field} is invalid.`);
  }
  return value;
}

export function expectRosterVersion(value: unknown): string {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,14})$/.test(value)) {
    throw invalidRequest("rosterVersion is invalid.");
  }
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric)) throw invalidRequest("rosterVersion is invalid.");
  return value;
}

export function expectCiphertext(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 16 ||
    value.length > MAX_ENCODED_ENVELOPE_CHARS ||
    !BASE64URL.test(value)
  ) {
    throw invalidRequest("ciphertext must be a bounded base64url string.");
  }
  // Deliberately do not decode or inspect the opaque ciphertext.
  return value;
}

export function invalidRequest(message: string): DevMessagingError {
  return new DevMessagingError("invalid_request", 400, message);
}
