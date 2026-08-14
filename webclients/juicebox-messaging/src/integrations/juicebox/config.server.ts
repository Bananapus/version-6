import { getJuiceboxV6Chain } from "./chains";
import { JuiceboxPreviewError } from "./errors";
import type { JuiceboxNetwork, JuiceboxV6ChainId } from "./types";

export const DEFAULT_BENDYSTRAW_MAINNET_URL =
  "https://bendystraw.up.railway.app/graphql";
export const DEFAULT_BENDYSTRAW_TESTNET_URL =
  "https://testnet.bendystraw.xyz/graphql";
export const DEFAULT_BENDYSTRAW_TIMEOUT_MS = 5_000;
export const MAX_BENDYSTRAW_RESPONSE_BYTES = 64 * 1024;

const MIN_TIMEOUT_MS = 250;
const MAX_TIMEOUT_MS = 15_000;
const MAX_ENDPOINT_LENGTH = 2_048;

type Environment = Readonly<Record<string, string | undefined>>;

export interface BendystrawPreviewConfig {
  endpoints: Readonly<Record<JuiceboxNetwork, string>>;
  timeoutMs: number;
  maxResponseBytes: number;
}

export function loadBendystrawPreviewConfig(
  environment: Environment = process.env,
): BendystrawPreviewConfig {
  return {
    endpoints: {
      mainnet: normalizeEndpoint(
        environment.BENDYSTRAW_MAINNET_URL ?? DEFAULT_BENDYSTRAW_MAINNET_URL,
        "BENDYSTRAW_MAINNET_URL",
      ),
      testnet: normalizeEndpoint(
        environment.BENDYSTRAW_TESTNET_URL ?? DEFAULT_BENDYSTRAW_TESTNET_URL,
        "BENDYSTRAW_TESTNET_URL",
      ),
    },
    timeoutMs: parseTimeout(environment.JUICEBOX_BENDYSTRAW_TIMEOUT_MS),
    maxResponseBytes: MAX_BENDYSTRAW_RESPONSE_BYTES,
  };
}

export function bendystrawEndpointForChain(
  config: BendystrawPreviewConfig,
  chainId: JuiceboxV6ChainId,
): string {
  const chain = getJuiceboxV6Chain(chainId);
  if (!chain) {
    throw new JuiceboxPreviewError(
      "unsupported_chain",
      400,
      "The requested chain is not supported for Juicebox v6 previews.",
    );
  }
  return config.endpoints[chain.network];
}

function normalizeEndpoint(value: string, variableName: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_ENDPOINT_LENGTH) {
    throw misconfigured(`${variableName} is invalid.`);
  }

  let endpoint: URL;
  try {
    endpoint = new URL(trimmed);
  } catch {
    throw misconfigured(`${variableName} is invalid.`);
  }

  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw misconfigured(`${variableName} must be an HTTPS URL without credentials or query data.`);
  }

  if (endpoint.pathname === "/" || endpoint.pathname === "") {
    endpoint.pathname = "/graphql";
  } else if (endpoint.pathname.endsWith("/")) {
    endpoint.pathname = endpoint.pathname.slice(0, -1);
  }

  return endpoint.toString();
}

function parseTimeout(value: string | undefined): number {
  if (value === undefined) return DEFAULT_BENDYSTRAW_TIMEOUT_MS;
  if (!/^\d+$/.test(value)) {
    throw misconfigured("JUICEBOX_BENDYSTRAW_TIMEOUT_MS is invalid.");
  }
  const timeoutMs = Number(value);
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < MIN_TIMEOUT_MS ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw misconfigured(
      `JUICEBOX_BENDYSTRAW_TIMEOUT_MS must be between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}.`,
    );
  }
  return timeoutMs;
}

function misconfigured(message: string): JuiceboxPreviewError {
  return new JuiceboxPreviewError("service_misconfigured", 503, message);
}
