import { describe, expect, it } from "vitest";
import { JUICEBOX_V6_CHAINS } from "./chains";
import {
  DEFAULT_BENDYSTRAW_MAINNET_URL,
  DEFAULT_BENDYSTRAW_TESTNET_URL,
  bendystrawEndpointForChain,
  loadBendystrawPreviewConfig,
} from "./config.server";

describe("Bendystraw preview configuration", () => {
  it("uses fixed HTTPS defaults and routes every allowlisted chain by environment", () => {
    const config = loadBendystrawPreviewConfig({});

    expect(config.endpoints).toEqual({
      mainnet: DEFAULT_BENDYSTRAW_MAINNET_URL,
      testnet: DEFAULT_BENDYSTRAW_TESTNET_URL,
    });
    expect(JUICEBOX_V6_CHAINS.map((chain) => chain.id)).toEqual([
      1, 10, 8453, 42161, 11155111, 11155420, 84532, 421614,
    ]);
    for (const chain of JUICEBOX_V6_CHAINS) {
      expect(bendystrawEndpointForChain(config, chain.id)).toBe(
        config.endpoints[chain.network],
      );
    }
  });

  it("accepts bounded server-side endpoint and timeout overrides", () => {
    const config = loadBendystrawPreviewConfig({
      BENDYSTRAW_MAINNET_URL: " https://main.example/ ",
      BENDYSTRAW_TESTNET_URL: "https://test.example/custom-graphql/",
      JUICEBOX_BENDYSTRAW_TIMEOUT_MS: "750",
    });

    expect(config.endpoints).toEqual({
      mainnet: "https://main.example/graphql",
      testnet: "https://test.example/custom-graphql",
    });
    expect(config.timeoutMs).toBe(750);
  });

  it.each([
    { BENDYSTRAW_MAINNET_URL: "http://main.example/graphql" },
    { BENDYSTRAW_MAINNET_URL: "https://user:secret@main.example/graphql" },
    { BENDYSTRAW_MAINNET_URL: "https://main.example/graphql?query=unsafe" },
    { JUICEBOX_BENDYSTRAW_TIMEOUT_MS: "249" },
    { JUICEBOX_BENDYSTRAW_TIMEOUT_MS: "15001" },
    { JUICEBOX_BENDYSTRAW_TIMEOUT_MS: "not-a-number" },
  ])("rejects unsafe or unbounded configuration: %o", (environment) => {
    expect(() => loadBendystrawPreviewConfig(environment)).toThrow(
      expect.objectContaining({ code: "service_misconfigured", status: 503 }),
    );
  });
});
