interface DevelopmentRandomSource {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
  randomUUID?: () => string;
}

/**
 * Generates a non-secret development id. `randomUUID()` is unavailable on
 * plain-HTTP LAN origins, while `getRandomValues()` remains browser-supported.
 */
export function developmentEventId(
  prefix: string,
  randomSource: DevelopmentRandomSource = globalThis.crypto,
): string {
  if (typeof randomSource.randomUUID === "function") {
    return `${prefix}_${randomSource.randomUUID()}`;
  }

  const bytes = randomSource.getRandomValues(new Uint8Array(16));
  const suffix = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${suffix}`;
}
