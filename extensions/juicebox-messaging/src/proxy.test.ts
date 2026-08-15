// The Next 16 testing barrel eagerly loads runtime stores in Node. Import the
// framework-owned matcher utility narrowly so this still tests Next's parser.
import { unstable_doesMiddlewareMatch } from "next/dist/experimental/testing/server/middleware-testing-utils.js";
import { describe, expect, it } from "vitest";
import { config } from "./proxy";

describe("production Proxy matcher", () => {
  it.each([
    "/_next/static",
    "/_next/static/chunks/app.js",
    "/_next/image",
    "/_next/image?url=%2Ficon.svg&w=64&q=75",
    "/favicon.ico",
    "/icon.svg",
    "/manifest.webmanifest",
    "/sw.js",
  ])("excludes only the intended framework or public asset %s", (url) => {
    expect(doesProxyMatch(url)).toBe(false);
  });

  it.each([
    "/",
    "/shared",
    "/embed/juicebox",
    "/_next/staticity",
    "/_next/images",
    "/faviconXico",
    "/favicon.ico/child",
    "/iconXsvg",
    "/icon.svg-preview",
    "/manifestXwebmanifest",
    "/swXjs",
    "/sw.jsx",
  ])("keeps the nonce and authority boundary on lookalike path %s", (url) => {
    expect(doesProxyMatch(url)).toBe(true);
  });
});

function doesProxyMatch(url: string): boolean {
  return unstable_doesMiddlewareMatch({
    config,
    nextConfig: {},
    url: `https://messages.example.com${url}`,
  });
}
