import { createHash } from "node:crypto";
import {
  AuthorityValidationError,
  type Base64Url,
  type Hash32,
} from "./valueObjects";

/**
 * Server-side deterministic JSON used only for authority/audit commitments.
 * Objects are key-sorted, arrays retain order, and values outside the bounded
 * JSON data model are rejected rather than coerced.
 */
export function canonicalAuthorityJson(value: unknown): string {
  return serialize(value, new Set<object>());
}

export function sha256AuthorityDigest(value: unknown): Hash32 {
  return `0x${createHash("sha256")
    .update(canonicalAuthorityJson(value), "utf8")
    .digest("hex")}` as Hash32;
}

export function sha256AuthorityBase64Url(value: unknown): Base64Url {
  return createHash("sha256")
    .update(canonicalAuthorityJson(value), "utf8")
    .digest("base64url") as Base64Url;
}

function serialize(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw invalid("Authority digest numbers must be safe integers.");
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw invalid("Authority digest input contains a non-JSON value.");
  }
  if (ancestors.has(value)) {
    throw invalid("Authority digest input must not be cyclic.");
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => serialize(item, ancestors)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw invalid("Authority digest objects must be plain records.");
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${serialize(record[key], ancestors)}`,
      )
      .join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function invalid(message: string): AuthorityValidationError {
  return new AuthorityValidationError(message);
}
