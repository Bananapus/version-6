import { getJuiceboxV6Chain, isJuiceboxV6ChainId } from "./chains";
import {
  bendystrawEndpointForChain,
  type BendystrawPreviewConfig,
} from "./config.server";
import { JuiceboxPreviewError } from "./errors";
import {
  JUICEBOX_V6_PROTOCOL,
  JUICEBOX_V6_VERSION,
  type CandidateProjectPreview,
  type JuiceboxProjectPreviewPort,
  type JuiceboxV6ProjectRef,
} from "./types";

export const PROJECT_PREVIEW_QUERY = `query JuiceboxProjectPreview($chainId: Float!, $projectId: Float!) {
  project(chainId: $chainId, projectId: $projectId, version: 6) {
    projectId
    chainId
    version
    name
    logoUri
    projectTagline
    suckerGroupId
    token
    tokenSymbol
    decimals
    currency
    isRevnet
    metadataUri
  }
}`;

const PROJECT_FIELDS = [
  "projectId",
  "chainId",
  "version",
  "name",
  "logoUri",
  "projectTagline",
  "suckerGroupId",
  "token",
  "tokenSymbol",
  "decimals",
  "currency",
  "isRevnet",
  "metadataUri",
] as const;
const MAX_UINT32 = (1n << 32n) - 1n;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface BendystrawProjectPreviewAdapterOptions {
  config: BendystrawPreviewConfig;
  fetchImpl?: FetchLike;
}

export class BendystrawProjectPreviewAdapter implements JuiceboxProjectPreviewPort {
  readonly #config: BendystrawPreviewConfig;
  readonly #fetch: FetchLike;

  constructor(options: BendystrawProjectPreviewAdapterOptions) {
    this.#config = options.config;
    this.#fetch = options.fetchImpl ?? globalThis.fetch;
  }

  async resolveProjectPreview(
    ref: JuiceboxV6ProjectRef,
  ): Promise<CandidateProjectPreview | null> {
    assertProjectRef(ref);
    const endpoint = bendystrawEndpointForChain(this.#config, ref.chainId);
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.#config.timeoutMs);

    try {
      const response = await this.#fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          operationName: "JuiceboxProjectPreview",
          query: PROJECT_PREVIEW_QUERY,
          variables: { chainId: ref.chainId, projectId: ref.projectId },
        }),
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new JuiceboxPreviewError(
          "upstream_unavailable",
          response.status === 429 || response.status >= 500 ? 503 : 502,
          "The project indexer could not complete the lookup.",
        );
      }

      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.startsWith("application/json")) {
        throw invalidUpstream(
          "The project indexer returned an unexpected content type.",
        );
      }

      const payload = await readBoundedJson(response, this.#config.maxResponseBytes);
      return parseProjectResponse(payload, ref);
    } catch (cause) {
      if (cause instanceof JuiceboxPreviewError) throw cause;
      if (timedOut) {
        throw new JuiceboxPreviewError(
          "upstream_timeout",
          504,
          "The project indexer did not respond in time.",
          { cause },
        );
      }
      throw new JuiceboxPreviewError(
        "upstream_unavailable",
        503,
        "The project indexer is unavailable.",
        { cause },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

function assertProjectRef(ref: JuiceboxV6ProjectRef): void {
  if (
    ref.protocol !== JUICEBOX_V6_PROTOCOL ||
    ref.version !== JUICEBOX_V6_VERSION ||
    !Number.isSafeInteger(ref.projectId) ||
    ref.projectId < 1
  ) {
    throw new JuiceboxPreviewError(
      "invalid_request",
      400,
      "A valid Juicebox v6 project reference is required.",
    );
  }
  if (!Number.isSafeInteger(ref.chainId) || !isJuiceboxV6ChainId(ref.chainId)) {
    throw new JuiceboxPreviewError(
      "unsupported_chain",
      400,
      "The requested chain is not supported for Juicebox v6 previews.",
    );
  }
}

async function readBoundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBytes) {
      throw invalidUpstream("The project indexer response exceeded its size limit.");
    }
  }

  if (!response.body) {
    throw invalidUpstream("The project indexer returned an empty response.");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw invalidUpstream("The project indexer response exceeded its size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (cause) {
    throw invalidUpstream("The project indexer returned invalid UTF-8.", cause);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw invalidUpstream("The project indexer returned invalid JSON.", cause);
  }
}

function parseProjectResponse(
  value: unknown,
  requestedRef: JuiceboxV6ProjectRef,
): CandidateProjectPreview | null {
  const envelope = expectExactObject(value, ["data"], ["errors"]);
  if ("errors" in envelope && envelope.errors !== undefined) {
    if (!Array.isArray(envelope.errors) || envelope.errors.length === 0) {
      throw invalidUpstream("The project indexer returned malformed GraphQL errors.");
    }
    throw invalidUpstream("The project indexer rejected the project lookup.");
  }

  const data = expectExactObject(envelope.data, ["project"]);
  if (data.project === null) return null;
  const project = expectExactObject(data.project, [...PROJECT_FIELDS]);

  const projectId = expectSafeInteger(project.projectId, "projectId", 1);
  const chainId = expectSafeInteger(project.chainId, "chainId", 1);
  const version = expectSafeInteger(project.version, "version", 1);
  if (
    projectId !== requestedRef.projectId ||
    chainId !== requestedRef.chainId ||
    version !== JUICEBOX_V6_VERSION
  ) {
    throw invalidUpstream("The project indexer returned a different project reference.");
  }

  const chain = getJuiceboxV6Chain(chainId);
  if (!chain) {
    throw invalidUpstream("The project indexer returned an unsupported chain.");
  }

  return {
    kind: "candidate-display-only",
    source: "bendystraw-v6-indexer",
    sourceNetwork: chain.network,
    ref: requestedRef,
    name: expectNullableString(project.name, "name", 256),
    untrustedLogoUri: expectNullableString(project.logoUri, "logoUri", 4_096),
    projectTagline: expectNullableString(
      project.projectTagline,
      "projectTagline",
      1_024,
    ),
    suckerGroupId: expectNullableString(
      project.suckerGroupId,
      "suckerGroupId",
      256,
    ),
    accountingContext: parseAccountingContext(project),
    isRevnet: expectNullableBoolean(project.isRevnet, "isRevnet"),
    untrustedMetadataUri: expectNullableString(
      project.metadataUri,
      "metadataUri",
      4_096,
    ),
    claims: {
      authorization: "not-evaluated",
      eligibility: "not-evaluated",
      purchase: "not-evaluated",
      finality: "not-evaluated",
    },
  };
}

function parseAccountingContext(
  project: Record<string, unknown>,
): CandidateProjectPreview["accountingContext"] {
  const tokenAddress = expectNullableAddress(project.token, "token");
  const tokenSymbol = expectNullableString(project.tokenSymbol, "tokenSymbol", 64);
  const decimals = expectNullableInteger(project.decimals, "decimals", 0, 255);
  const currency = expectNullableCurrency(project.currency);
  const core = [tokenAddress, decimals, currency];
  if (core.every((value) => value === null)) {
    if (tokenSymbol !== null) {
      throw invalidUpstream(
        "The project indexer returned an incomplete accounting context.",
      );
    }
    return null;
  }
  if (tokenAddress === null || decimals === null || currency === null) {
    throw invalidUpstream(
      "The project indexer returned an incomplete accounting context.",
    );
  }
  return {
    kind: "latest-indexed-terminal-accounting-context",
    tokenAddress,
    tokenSymbol,
    decimals,
    currency,
    projectTokenIdentity: "not-evaluated",
  };
}

function expectExactObject(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidUpstream("The project indexer returned an invalid object.");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  if (requiredKeys.some((key) => !Object.hasOwn(record, key))) {
    throw invalidUpstream("The project indexer response omitted a required field.");
  }
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw invalidUpstream("The project indexer response contained an unexpected field.");
  }
  return record;
}

function expectSafeInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw invalidUpstream(`The project indexer returned an invalid ${field}.`);
  }
  return value;
}

function expectNullableInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null) return null;
  return expectSafeInteger(value, field, minimum, maximum);
}

function expectNullableString(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.length > maxLength ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)
  ) {
    throw invalidUpstream(`The project indexer returned an invalid ${field}.`);
  }
  return value;
}

function expectNullableCurrency(value: unknown): string | null {
  const candidate = expectNullableString(value, "currency", 10);
  if (candidate === null) return null;
  if (!/^(0|[1-9]\d*)$/.test(candidate) || BigInt(candidate) > MAX_UINT32) {
    throw invalidUpstream("The project indexer returned an invalid currency.");
  }
  return candidate;
}

function expectNullableAddress(value: unknown, field: string): string | null {
  const candidate = expectNullableString(value, field, 42);
  if (candidate === null) return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(candidate)) {
    throw invalidUpstream(`The project indexer returned an invalid ${field}.`);
  }
  return candidate;
}

function expectNullableBoolean(value: unknown, field: string): boolean | null {
  if (value === null || typeof value === "boolean") return value;
  throw invalidUpstream(`The project indexer returned an invalid ${field}.`);
}

function invalidUpstream(message: string, cause?: unknown): JuiceboxPreviewError {
  return new JuiceboxPreviewError("upstream_invalid_response", 502, message, {
    cause,
  });
}
