import { describe, expect, it } from "vitest";
import {
  THEME_COLOR_KEYS,
  THEME_PRESET_IDS,
  ThemeValidationError,
  parseThemeSelection,
  presetTheme,
  resolveTheme,
  themeCssVariables,
} from "./theme";

describe("production theme contract", () => {
  it.each(THEME_PRESET_IDS)("resolves the accessible %s preset", (preset) => {
    const theme = presetTheme(preset);
    expect(theme.preset).toBe(preset);
    expect(Object.keys(theme.colors).sort()).toEqual([...THEME_COLOR_KEYS].sort());
    expect(themeCssVariables(theme)["--canvas"]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("accepts bounded semantic overrides and emits only known CSS variables", () => {
    const theme = resolveTheme({
      version: 1,
      preset: "juicebox",
      colors: { canvas: "#ffffff" },
      cornerStyle: "square",
      density: "compact",
      typography: "system-mono",
    });
    const variables = themeCssVariables(theme);

    expect(theme.colors.canvas).toBe("#ffffff");
    expect(variables["--radius-panel"]).toBe("0px");
    expect(variables["--theme-density"]).toBe("0.875");
    expect(variables["--density-header-height"]).toBe("64px");
    expect(variables["--density-panel-padding"]).toBe("10px");
    expect(variables["--density-row-padding-block"]).toBe("8px");
    expect(Object.keys(variables)).toHaveLength(36);
    expect(Object.values(variables).join(" ")).not.toMatch(/url\s*\(|javascript:|@import/i);
  });

  it("keeps the compiled first-party presets visually distinct", () => {
    const juicebox = themeCssVariables(presetTheme("juicebox"));
    const neutral = themeCssVariables(presetTheme("neutral"));
    const revnet = themeCssVariables(presetTheme("revnet"));

    expect(juicebox["--radius-panel"]).toBe("16px");
    expect(neutral["--radius-panel"]).toBe("10px");
    expect(revnet["--radius-panel"]).toBe("0px");
    expect(revnet["--action-fill"]).toBe("#68ca8f");
    expect(revnet["--on-action"]).toBe("#000000");
    expect(revnet["--theme-font-family"]).toContain("ui-monospace");
    expect(revnet["--density-message-gap"]).toBe("9px");
    expect(juicebox["--density-message-gap"]).toBe("13px");
  });

  it.each([
    { version: 2, preset: "juicebox" },
    { version: 1, preset: "unknown" },
    { version: 1, preset: "juicebox", arbitraryCss: "body{}" },
    { version: 1, preset: "juicebox", colors: { canvas: "red" } },
    { version: 1, preset: "juicebox", colors: { canvas: "url(https://tracker.invalid)" } },
    { version: 1, preset: "juicebox", colors: { unknown: "#ffffff" } },
    { version: 1, preset: "juicebox", typography: "https://font.invalid/font.woff2" },
  ])("rejects executable, unknown, or malformed input", (value) => {
    expect(() => parseThemeSelection(value)).toThrow(ThemeValidationError);
  });

  it.each([
    { version: 1, preset: "neutral", density: undefined },
    { version: 1, preset: "neutral", colors: { canvas: undefined } },
  ])("requires unused optional theme fields to be omitted", (value) => {
    expect(() => parseThemeSelection(value)).toThrowError(
      expect.objectContaining({ code: "invalid_value" }),
    );
  });

  it("rejects prototype-pollution keys", () => {
    const value = JSON.parse(
      '{"version":1,"preset":"juicebox","colors":{"__proto__":"#ffffff"}}',
    );
    expect(() => parseThemeSelection(value)).toThrowError(
      expect.objectContaining({ code: "unknown_field" }),
    );
  });

  it("rejects overrides that make core text unreadable", () => {
    expect(() =>
      resolveTheme({
        version: 1,
        preset: "neutral",
        colors: { text: "#ffffff", canvas: "#ffffff", surface: "#ffffff" },
      }),
    ).toThrowError(expect.objectContaining({ code: "insufficient_contrast" }));
  });

  it.each([
    "canvas",
    "surface",
    "surfaceSubtle",
    "surfaceAccent",
    "surfaceSuccess",
    "actionSoft",
  ] as const)("rejects an individually unreadable %s override", (surface) => {
    expect(() =>
      resolveTheme({
        version: 1,
        preset: "neutral",
        colors: { [surface]: "#5f6878" },
      }),
    ).toThrowError(expect.objectContaining({ code: "insufficient_contrast" }));
  });

  it("rejects overrides that break interactive-state contrast", () => {
    expect(() =>
      resolveTheme({
        version: 1,
        preset: "neutral",
        colors: { actionFillHover: "#ffffff" },
      }),
    ).toThrowError(expect.objectContaining({ code: "insufficient_contrast" }));
  });

  it("rejects action-hover over matching action-soft despite a contrasting focus token", () => {
    expect(() =>
      resolveTheme({
        version: 1,
        preset: "neutral",
        colors: { actionSoft: "#26367f", focus: "#888888" },
      }),
    ).toThrowError(expect.objectContaining({ code: "insufficient_contrast" }));
  });

  it("returns frozen normalized values rather than the caller's object", () => {
    const source: { version: number; preset: string; colors: { canvas: string } } = {
      version: 1,
      preset: "neutral",
      colors: { canvas: "#FFFFFF" },
    };
    const parsed = parseThemeSelection(source);
    source.colors.canvas = "#000000";

    expect(parsed).not.toBe(source);
    expect(parsed.colors).not.toBe(source.colors);
    expect(parsed.colors?.canvas).toBe("#ffffff");
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.colors)).toBe(true);
  });
});
