/** Restricts bearer-invite links to the launcher computer's private LAN port. */
export function normalizeReachableLanOrigin(value: string, launcherOrigin: string): string {
  let candidate: URL;
  let launcher: URL;
  try {
    candidate = new URL(value.trim());
    launcher = new URL(launcherOrigin);
  } catch {
    throw new Error("Enter a complete HTTP or HTTPS origin for the phone.");
  }

  if (
    (candidate.protocol !== "http:" && candidate.protocol !== "https:") ||
    candidate.username ||
    candidate.password ||
    !isAcceptedLauncherPath(candidate.pathname) ||
    candidate.search ||
    candidate.hash
  ) {
    throw new Error(
      "Use the LAN server address, optionally ending in /shared, without a query or fragment.",
    );
  }

  if (!isPrivateIpv4(candidate.hostname)) {
    throw new Error("Use a private IPv4 LAN address printed by the shared-development launcher.");
  }

  if (effectivePort(candidate) !== effectivePort(launcher)) {
    throw new Error("The phone address must use the same port as this shared-development server.");
  }

  return candidate.origin;
}

function isAcceptedLauncherPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/shared" || pathname === "/shared/";
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return false;
  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

function effectivePort(url: URL): string {
  if (url.port) return url.port;
  return url.protocol === "https:" ? "443" : "80";
}
