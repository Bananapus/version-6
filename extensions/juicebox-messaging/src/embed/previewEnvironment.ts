/**
 * Returns the fixed peer used by the local cross-origin embed lab.
 *
 * This is intentionally limited to the two browser-trusted loopback names. It
 * is not a production tenant-origin resolver and must never be generalized to
 * accept a caller-provided host.
 */
export function pairedLoopbackOrigin(currentOrigin: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(currentOrigin);
  } catch {
    return null;
  }

  if (
    parsed.origin !== currentOrigin ||
    parsed.protocol !== "http:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    return null;
  }

  const peerHostname =
    parsed.hostname === "localhost"
      ? "127.0.0.1"
      : parsed.hostname === "127.0.0.1"
        ? "localhost"
        : null;
  if (!peerHostname) return null;

  return `http://${peerHostname}${parsed.port ? `:${parsed.port}` : ""}`;
}
