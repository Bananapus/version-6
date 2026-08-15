import { describe, expect, it, vi } from "vitest";
import {
  BendystrawProjectPreviewAdapter,
  PROJECT_PREVIEW_QUERY,
} from "./bendystraw.server";
import type { BendystrawPreviewConfig } from "./config.server";
import { JUICEBOX_V6_PROTOCOL, type JuiceboxV6ProjectRef } from "./types";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const CONFIG: BendystrawPreviewConfig = {
  endpoints: {
    mainnet: "https://main.example/graphql",
    testnet: "https://test.example/graphql",
  },
  timeoutMs: 250,
  maxResponseBytes: 64 * 1024,
};

const BASE_REF: JuiceboxV6ProjectRef = {
  protocol: JUICEBOX_V6_PROTOCOL,
  chainId: 8453,
  projectId: 9,
  version: 6,
};

function project(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    projectId: 9,
    chainId: 8453,
    version: 6,
    name: "Farcaster Fantasy Football",
    logoUri: "ipfs://example-logo",
    projectTagline: "A public indexer preview",
    suckerGroupId: "group-9",
    token: "0x0000000000000000000000000000000000000001",
    tokenSymbol: "USDC",
    decimals: 6,
    currency: "3181390099",
    isRevnet: false,
    metadataUri: "ipfs://example-metadata",
    ...overrides,
  };
}

function graphqlResponse(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(value), { ...init, headers });
}

describe("BendystrawProjectPreviewAdapter", () => {
  it("uses the static operation, exact variables, and no-store fetch semantics", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      graphqlResponse({ data: { project: project() } }),
    );
    const adapter = new BendystrawProjectPreviewAdapter({
      config: CONFIG,
      fetchImpl,
    });

    const preview = await adapter.resolveProjectPreview(BASE_REF);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [input, init] = fetchImpl.mock.calls[0];
    expect(input).toBe(CONFIG.endpoints.mainnet);
    expect(init).toMatchObject({
      method: "POST",
      cache: "no-store",
      redirect: "error",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      operationName: "JuiceboxProjectPreview",
      query: PROJECT_PREVIEW_QUERY,
      variables: { chainId: 8453, projectId: 9 },
    });
    expect(preview).toMatchObject({
      kind: "candidate-display-only",
      source: "bendystraw-v6-indexer",
      sourceNetwork: "mainnet",
      ref: BASE_REF,
      name: "Farcaster Fantasy Football",
      untrustedLogoUri: "ipfs://example-logo",
      accountingContext: {
        kind: "latest-indexed-terminal-accounting-context",
        tokenAddress: "0x0000000000000000000000000000000000000001",
        tokenSymbol: "USDC",
        decimals: 6,
        currency: "3181390099",
        projectTokenIdentity: "not-evaluated",
      },
      claims: {
        authorization: "not-evaluated",
        eligibility: "not-evaluated",
        purchase: "not-evaluated",
        finality: "not-evaluated",
      },
    });
    expect(preview).not.toHaveProperty("owner");
    expect(preview).not.toHaveProperty("logoUri");
    expect(preview).not.toHaveProperty("token");
    expect(preview).not.toHaveProperty("tokenSymbol");
  });

  it("routes all four testnets only to the configured testnet endpoint", async () => {
    for (const chainId of [11155111, 11155420, 84532, 421614] as const) {
      const fetchImpl = vi.fn<FetchLike>(async () =>
        graphqlResponse({
          data: {
            project: project({
              chainId,
              projectId: 11,
              isRevnet: true,
              token: "0x000000000000000000000000000000000000eeee",
              tokenSymbol: "ETH",
              decimals: 18,
              currency: "61166",
            }),
          },
        }),
      );
      const adapter = new BendystrawProjectPreviewAdapter({
        config: CONFIG,
        fetchImpl,
      });
      await adapter.resolveProjectPreview({
        ...BASE_REF,
        chainId,
        projectId: 11,
      });

      expect(fetchImpl.mock.calls[0]?.[0]).toBe(CONFIG.endpoints.testnet);
    }
  });

  it("returns null for an exact project miss", async () => {
    const adapter = new BendystrawProjectPreviewAdapter({
      config: CONFIG,
      fetchImpl: async () => graphqlResponse({ data: { project: null } }),
    });

    await expect(adapter.resolveProjectPreview(BASE_REF)).resolves.toBeNull();
  });

  it("uses null when no terminal accounting context has been indexed", async () => {
    const adapter = new BendystrawProjectPreviewAdapter({
      config: CONFIG,
      fetchImpl: async () =>
        graphqlResponse({
          data: {
            project: project({
              token: null,
              tokenSymbol: null,
              decimals: null,
              currency: null,
            }),
          },
        }),
    });

    await expect(adapter.resolveProjectPreview(BASE_REF)).resolves.toMatchObject({
      accountingContext: null,
    });
  });

  it("rejects unsupported chains before making a request", async () => {
    const fetchImpl = vi.fn();
    const adapter = new BendystrawProjectPreviewAdapter({
      config: CONFIG,
      fetchImpl,
    });

    await expect(
      adapter.resolveProjectPreview({ ...BASE_REF, chainId: 137 as 8453 }),
    ).rejects.toMatchObject({ code: "unsupported_chain", status: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    { data: { project: project({ chainId: 10 }) } },
    { data: { project: project({ version: 5 }) } },
    { data: { project: project({ token: "not-an-address" }) } },
    { data: { project: project({ decimals: "6" }) } },
    { data: { project: project({ currency: 3181390099 }) } },
    { data: { project: project({ currency: "01" }) } },
    { data: { project: project({ currency: "4294967296" }) } },
    {
      data: {
        project: project({
          token: null,
          tokenSymbol: null,
          decimals: 6,
          currency: null,
        }),
      },
    },
    {
      data: {
        project: project({
          token: null,
          tokenSymbol: "ETH",
          decimals: null,
          currency: null,
        }),
      },
    },
    { data: { project: project({ isRevnet: "false" }) } },
    { data: { project: project({ unexpected: "field" }) } },
    { data: { project: { projectId: 9 } } },
    { data: { project: project() }, extensions: {} },
    { errors: [{ message: "schema changed" }] },
  ])("rejects malformed, mismatched, or GraphQL-error responses", async (payload) => {
    const adapter = new BendystrawProjectPreviewAdapter({
      config: CONFIG,
      fetchImpl: async () => graphqlResponse(payload),
    });

    await expect(adapter.resolveProjectPreview(BASE_REF)).rejects.toMatchObject({
      code: "upstream_invalid_response",
      status: 502,
    });
  });

  it("bounds the decoded upstream response size", async () => {
    const adapter = new BendystrawProjectPreviewAdapter({
      config: { ...CONFIG, maxResponseBytes: 32 },
      fetchImpl: async () =>
        new Response(JSON.stringify({ data: { project: project() } }), {
          headers: { "content-type": "application/json" },
        }),
    });

    await expect(adapter.resolveProjectPreview(BASE_REF)).rejects.toMatchObject({
      code: "upstream_invalid_response",
      status: 502,
    });
  });

  it("aborts a stalled upstream lookup", async () => {
    const adapter = new BendystrawProjectPreviewAdapter({
      config: { ...CONFIG, timeoutMs: 5 },
      fetchImpl: async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        }),
    });

    await expect(adapter.resolveProjectPreview(BASE_REF)).rejects.toMatchObject({
      code: "upstream_timeout",
      status: 504,
    });
  });

  it("keeps the timeout active while reading the upstream body", async () => {
    const adapter = new BendystrawProjectPreviewAdapter({
      config: { ...CONFIG, timeoutMs: 5 },
      fetchImpl: async (...request) => {
        const init = request[1];
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              init?.signal?.addEventListener(
                "abort",
                () => controller.error(new DOMException("aborted", "AbortError")),
                { once: true },
              );
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });

    await expect(adapter.resolveProjectPreview(BASE_REF)).rejects.toMatchObject({
      code: "upstream_timeout",
      status: 504,
    });
  });
});
