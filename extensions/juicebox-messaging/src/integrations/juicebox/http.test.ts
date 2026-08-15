import { describe, expect, it, vi } from "vitest";
import { JuiceboxPreviewError } from "./errors";
import { createProjectResolveHandler } from "./http";
import type {
  CandidateProjectPreview,
  JuiceboxProjectPreviewPort,
  JuiceboxV6ProjectRef,
} from "./types";

const PREVIEW: CandidateProjectPreview = {
  kind: "candidate-display-only",
  source: "bendystraw-v6-indexer",
  sourceNetwork: "testnet",
  ref: {
    protocol: "juicebox-v6",
    chainId: 84532,
    projectId: 11,
    version: 6,
  },
  name: "Kenny's Bounty Engine Network",
  untrustedLogoUri: null,
  projectTagline: null,
  suckerGroupId: "group-11",
  accountingContext: {
    kind: "latest-indexed-terminal-accounting-context",
    tokenAddress: "0x000000000000000000000000000000000000eeee",
    tokenSymbol: "ETH",
    decimals: 18,
    currency: "61166",
    projectTokenIdentity: "not-evaluated",
  },
  isRevnet: true,
  untrustedMetadataUri: null,
  claims: {
    authorization: "not-evaluated",
    eligibility: "not-evaluated",
    purchase: "not-evaluated",
    finality: "not-evaluated",
  },
};

function handlerWith(
  resolveProjectPreview: JuiceboxProjectPreviewPort["resolveProjectPreview"],
) {
  return createProjectResolveHandler({
    getAdapter: () => ({ resolveProjectPreview }),
  });
}

async function expectNoStore(response: Response): Promise<void> {
  expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(response.headers.get("expires")).toBe("0");
}

describe("project preview resolve handler", () => {
  it("resolves an exact GET reference", async () => {
    const resolveProjectPreview = vi.fn(async () => PREVIEW);
    const handler = handlerWith(resolveProjectPreview);
    const response = await handler(
      new Request(
        "https://messaging.example/api/juicebox/projects/resolve?chainId=84532&projectId=11&version=6",
      ),
    );

    expect(response.status).toBe(200);
    await expectNoStore(response);
    expect(await response.json()).toEqual({ data: PREVIEW });
    expect(resolveProjectPreview).toHaveBeenCalledWith(PREVIEW.ref);
  });

  it("resolves an exact JSON POST reference", async () => {
    let received: JuiceboxV6ProjectRef | undefined;
    const handler = handlerWith(async (ref) => {
      received = ref;
      return PREVIEW;
    });
    const response = await handler(
      new Request("https://messaging.example/api/juicebox/projects/resolve", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ chainId: 84532, projectId: 11, version: 6 }),
      }),
    );

    expect(response.status).toBe(200);
    await expectNoStore(response);
    expect(received).toEqual(PREVIEW.ref);
  });

  it.each([
    "?chainId=84532&projectId=11",
    "?chainId=84532&projectId=11&version=5",
    "?chainId=137&projectId=11&version=6",
    "?chainId=84532&projectId=11&version=6&extra=true",
    "?chainId=84532&chainId=84532&projectId=11&version=6",
    "?chainId=84532&projectId=01&version=6",
  ])("rejects a malformed GET reference: %s", async (query) => {
    const handler = handlerWith(async () => PREVIEW);
    const response = await handler(
      new Request(`https://messaging.example/api/juicebox/projects/resolve${query}`),
    );

    expect(response.status).toBe(400);
    await expectNoStore(response);
  });

  it.each([
    {
      headers: new Headers(),
      body: JSON.stringify({ chainId: 84532, projectId: 11, version: 6 }),
      status: 415,
    },
    {
      headers: new Headers({ "content-type": "application/json" }),
      body: JSON.stringify({ chainId: "84532", projectId: 11, version: 6 }),
      status: 400,
    },
    {
      headers: new Headers({ "content-type": "application/json" }),
      body: JSON.stringify({ chainId: 84532, projectId: 11, version: 6, extra: true }),
      status: 400,
    },
    {
      headers: new Headers({ "content-type": "application/json" }),
      body: "{not-json",
      status: 400,
    },
  ])("rejects malformed POST input", async ({ headers, body, status }) => {
    const handler = handlerWith(async () => PREVIEW);
    const response = await handler(
      new Request("https://messaging.example/api/juicebox/projects/resolve", {
        method: "POST",
        headers,
        body,
      }),
    );

    expect(response.status).toBe(status);
    await expectNoStore(response);
  });

  it("bounds a streamed POST body even without Content-Length", async () => {
    const handler = handlerWith(async () => PREVIEW);
    const response = await handler(
      new Request("https://messaging.example/api/juicebox/projects/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chainId: 84532,
          projectId: 11,
          version: 6,
          padding: "x".repeat(2_000),
        }),
      }),
    );

    expect(response.status).toBe(413);
    await expectNoStore(response);
  });

  it("returns a no-store 404 for an exact indexer miss", async () => {
    const handler = handlerWith(async () => null);
    const response = await handler(
      new Request(
        "https://messaging.example/api/juicebox/projects/resolve?chainId=84532&projectId=11&version=6",
      ),
    );

    expect(response.status).toBe(404);
    await expectNoStore(response);
    expect(await response.json()).toMatchObject({
      error: { code: "project_not_found" },
    });
  });

  it("redacts upstream and configuration details from no-store errors", async () => {
    const handler = handlerWith(async () => {
      throw new JuiceboxPreviewError(
        "upstream_invalid_response",
        502,
        "secret upstream schema details",
      );
    });
    const response = await handler(
      new Request(
        "https://messaging.example/api/juicebox/projects/resolve?chainId=84532&projectId=11&version=6",
      ),
    );
    const body = await response.text();

    expect(response.status).toBe(502);
    await expectNoStore(response);
    expect(body).not.toContain("secret upstream schema details");
    expect(body).toContain("upstream_invalid_response");
  });
});
