import { isJuiceboxV6ChainId } from "./chains";
import { JuiceboxPreviewError, invalidPreviewRequest } from "./errors";
import {
  JUICEBOX_V6_PROTOCOL,
  JUICEBOX_V6_VERSION,
  type JuiceboxProjectPreviewPort,
  type JuiceboxV6ProjectRef,
} from "./types";

const MAX_JSON_REQUEST_BYTES = 1_024;
const MAX_QUERY_LENGTH = 256;
const REQUIRED_FIELDS = ["chainId", "projectId", "version"] as const;

export interface ProjectResolveHandlerDependencies {
  getAdapter: () => JuiceboxProjectPreviewPort;
}

export function createProjectResolveHandler(
  dependencies: ProjectResolveHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async function projectResolveHandler(request: Request): Promise<Response> {
    try {
      const ref =
        request.method === "GET"
          ? parseGetRef(request)
          : request.method === "POST"
            ? await parsePostRef(request)
            : (() => {
                throw new JuiceboxPreviewError(
                  "invalid_request",
                  405,
                  "Only GET and POST are supported.",
                );
              })();
      const project = await dependencies.getAdapter().resolveProjectPreview(ref);
      if (!project) {
        throw new JuiceboxPreviewError(
          "project_not_found",
          404,
          "No indexed Juicebox v6 project was found for that exact reference.",
        );
      }
      return jsonResponse({ data: project });
    } catch (error) {
      if (error instanceof JuiceboxPreviewError) {
        return jsonResponse(
          { error: { code: error.code, message: clientMessage(error) } },
          { status: error.status },
        );
      }
      return jsonResponse(
        {
          error: {
            code: "upstream_unavailable",
            message: "The project preview lookup could not be completed.",
          },
        },
        { status: 503 },
      );
    }
  };
}

function parseGetRef(request: Request): JuiceboxV6ProjectRef {
  const url = new URL(request.url);
  if (url.search.length > MAX_QUERY_LENGTH) {
    throw invalidPreviewRequest("The project reference query is too long.");
  }
  for (const key of url.searchParams.keys()) {
    if (!REQUIRED_FIELDS.includes(key as (typeof REQUIRED_FIELDS)[number])) {
      throw invalidPreviewRequest(`Unexpected query parameter: ${key}.`);
    }
    if (url.searchParams.getAll(key).length !== 1) {
      throw invalidPreviewRequest(`Query parameter ${key} must appear exactly once.`);
    }
  }
  for (const field of REQUIRED_FIELDS) {
    if (!url.searchParams.has(field)) {
      throw invalidPreviewRequest(`Query parameter ${field} is required.`);
    }
  }
  return projectRefFromValues({
    chainId: url.searchParams.get("chainId"),
    projectId: url.searchParams.get("projectId"),
    version: url.searchParams.get("version"),
  }, true);
}

async function parsePostRef(request: Request): Promise<JuiceboxV6ProjectRef> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (mediaType?.toLowerCase() !== "application/json") {
    throw new JuiceboxPreviewError(
      "unsupported_media_type",
      415,
      "Content-Type must be application/json.",
    );
  }
  const value = await readBoundedJsonRequest(request);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidPreviewRequest("The request body must be a JSON object.");
  }
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).length !== REQUIRED_FIELDS.length ||
    REQUIRED_FIELDS.some((field) => !Object.hasOwn(body, field))
  ) {
    throw invalidPreviewRequest("The request must contain only chainId, projectId, and version.");
  }
  return projectRefFromValues(body, false);
}

function projectRefFromValues(
  values: Record<string, unknown>,
  allowStrings: boolean,
): JuiceboxV6ProjectRef {
  const chainId = expectDecimalInteger(values.chainId, "chainId", allowStrings);
  if (!isJuiceboxV6ChainId(chainId)) {
    throw new JuiceboxPreviewError(
      "unsupported_chain",
      400,
      "The requested chain is not supported for Juicebox v6 previews.",
    );
  }
  const projectId = expectDecimalInteger(values.projectId, "projectId", allowStrings);
  if (projectId < 1) {
    throw invalidPreviewRequest("projectId must be greater than zero.");
  }
  const version = expectDecimalInteger(values.version, "version", allowStrings);
  if (version !== JUICEBOX_V6_VERSION) {
    throw invalidPreviewRequest("Only Juicebox version 6 projects are supported.");
  }
  return {
    protocol: JUICEBOX_V6_PROTOCOL,
    chainId,
    projectId,
    version: JUICEBOX_V6_VERSION,
  };
}

function expectDecimalInteger(
  value: unknown,
  field: string,
  allowString: boolean,
): number {
  const normalized =
    typeof value === "number"
      ? value
      : allowString && typeof value === "string" && /^(0|[1-9]\d*)$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw invalidPreviewRequest(`${field} must be a bounded decimal integer.`);
  }
  return normalized;
}

async function readBoundedJsonRequest(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      throw invalidPreviewRequest("Content-Length is invalid.");
    }
    if (Number(contentLength) > MAX_JSON_REQUEST_BYTES) {
      throw new JuiceboxPreviewError(
        "request_too_large",
        413,
        "The request body is too large.",
      );
    }
  }
  if (!request.body) throw invalidPreviewRequest("A JSON request body is required.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_JSON_REQUEST_BYTES) {
        await reader.cancel();
        throw new JuiceboxPreviewError(
          "request_too_large",
          413,
          "The request body is too large.",
        );
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

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    throw invalidPreviewRequest("The request body is not valid JSON.");
  }
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function clientMessage(error: JuiceboxPreviewError): string {
  if (
    error.code === "service_misconfigured" ||
    error.code === "upstream_unavailable" ||
    error.code === "upstream_timeout" ||
    error.code === "upstream_invalid_response"
  ) {
    return error.code === "upstream_timeout"
      ? "The project preview lookup timed out."
      : "The project preview lookup is currently unavailable.";
  }
  return error.message;
}
