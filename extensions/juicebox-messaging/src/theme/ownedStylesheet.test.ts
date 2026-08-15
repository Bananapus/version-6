import { describe, expect, it } from "vitest";
import { resolveTheme, themeCssVariables } from "./theme";
import {
  OWNED_THEME_SELECTOR,
  materializeOwnedTheme,
  ownedThemeStylesheet,
  parseOwnedStylesheetNonce,
} from "./ownedStylesheet";

describe("owned nonce-bearing theme stylesheet", () => {
  it("emits only the fixed selector and allowlisted resolved variables", () => {
    const selection = {
      version: 1,
      preset: "juicebox" as const,
      colors: { canvas: "#FFFFFF", actionFill: "#3548a5" },
      cornerStyle: "square" as const,
    };
    const stylesheet = ownedThemeStylesheet(selection);
    const expectedVariableCount = Object.keys(
      themeCssVariables(resolveTheme(selection)),
    ).length;

    expect(stylesheet.startsWith(OWNED_THEME_SELECTOR + " {")).toBe(true);
    expect(stylesheet).toContain("--canvas: #ffffff;");
    expect(stylesheet).toContain("--action-fill: #3548a5;");
    expect(stylesheet).toContain("--action-soft: #eef2fe;");
    expect(stylesheet).toContain("--radius-panel: 0px;");
    expect(stylesheet).toContain("--surface-accent: #eef1fd;");
    expect(stylesheet).toContain("--surface-success: #ebfaf1;");
    expect(stylesheet.match(/^\s+--[a-z0-9-]+:/gm)).toHaveLength(
      expectedVariableCount,
    );
    expect(stylesheet).not.toContain("--system-security");
    expect(stylesheet).not.toMatch(/url\s*\(|@import|javascript:|<|>/i);
  });

  it("preserves accessible Revnet action text and button fill semantics", () => {
    const stylesheet = ownedThemeStylesheet({
      version: 1,
      preset: "revnet",
    });
    expect(stylesheet).toContain("--action: #3d7955;");
    expect(stylesheet).toContain("--action-fill: #68ca8f;");
    expect(stylesheet).toContain("--on-action: #000000;");
  });

  it.each([
    { version: 1, preset: "neutral", colors: { canvas: "red" } },
    {
      version: 1,
      preset: "neutral",
      colors: { text: "#ffffff", canvas: "#ffffff", surface: "#ffffff" },
    },
    { version: 1, preset: "neutral", css: "body { display: none }" },
  ])("rejects malformed, inaccessible, or arbitrary theme material", (theme) => {
    expect(() => ownedThemeStylesheet(theme)).toThrow();
  });

  it("accepts only a bounded server nonce", () => {
    const nonce = "A".repeat(43) + "=";
    expect(parseOwnedStylesheetNonce(nonce)).toBe(nonce);
    expect(parseOwnedStylesheetNonce("short")).toBeNull();
    expect(parseOwnedStylesheetNonce("_".repeat(43) + "=")).toBeNull();
    expect(parseOwnedStylesheetNonce("A".repeat(44))).toBeNull();
    expect(parseOwnedStylesheetNonce('nonce" onload="evil')).toBeNull();
    expect(parseOwnedStylesheetNonce(null)).toBeNull();
  });

  it("couples custom materialization to the exact validated nonce", () => {
    const nonce = "B".repeat(43) + "=";
    expect(
      materializeOwnedTheme({ version: 1, preset: "neutral" }, nonce),
    ).toEqual({
      nonce,
      stylesheet: ownedThemeStylesheet({ version: 1, preset: "neutral" }),
    });
  });

  it.each([undefined, null, "", "A".repeat(43), "_".repeat(43) + "="])(
    "fails closed when a custom theme has no exact production nonce",
    (nonce) => {
      expect(() =>
        materializeOwnedTheme({ version: 1, preset: "juicebox" }, nonce),
      ).toThrow(/nonce/i);
    },
  );
});
