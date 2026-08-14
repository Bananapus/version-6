export const THEME_PROTOCOL_VERSION = 1 as const;

export const THEME_PRESET_IDS = ["neutral", "juicebox", "revnet"] as const;
export type ThemePresetId = (typeof THEME_PRESET_IDS)[number];

export const THEME_COLOR_KEYS = [
  "canvas",
  "surface",
  "surfaceSubtle",
  "surfaceAccent",
  "surfaceSuccess",
  "text",
  "textSoft",
  "textMuted",
  "border",
  "borderStrong",
  "action",
  "actionHover",
  "actionFill",
  "actionFillHover",
  "actionSoft",
  "onAction",
  "success",
  "successSoft",
  "warning",
  "warningSoft",
  "danger",
  "dangerSoft",
  "focus",
] as const;

export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];
export type ThemeColors = Readonly<Record<ThemeColorKey, string>>;
export type ThemeCornerStyle = "rounded" | "soft" | "square";
export type ThemeDensity = "comfortable" | "compact";
export type ThemeTypography = "system-sans" | "system-mono";

export interface ThemeSelectionV1 {
  version: typeof THEME_PROTOCOL_VERSION;
  preset: ThemePresetId;
  colors?: Readonly<Partial<Record<ThemeColorKey, string>>>;
  cornerStyle?: ThemeCornerStyle;
  density?: ThemeDensity;
  typography?: ThemeTypography;
}

export interface ResolvedTheme {
  version: typeof THEME_PROTOCOL_VERSION;
  preset: ThemePresetId;
  colors: ThemeColors;
  cornerStyle: ThemeCornerStyle;
  density: ThemeDensity;
  typography: ThemeTypography;
}

export class ThemeValidationError extends Error {
  readonly code:
    | "invalid_shape"
    | "unknown_field"
    | "invalid_value"
    | "insufficient_contrast";

  constructor(code: ThemeValidationError["code"], message: string) {
    super(message);
    this.name = "ThemeValidationError";
    this.code = code;
  }
}

const BASE_PRESETS: Readonly<Record<ThemePresetId, Omit<ResolvedTheme, "version" | "preset">>> = {
  juicebox: {
    colors: {
      canvas: "#fff7e8",
      surface: "#ffffff",
      surfaceSubtle: "#f8f6f0",
      surfaceAccent: "#eef1fd",
      surfaceSuccess: "#ebfaf1",
      text: "#1a1a1a",
      textSoft: "#424242",
      textMuted: "#756e59",
      border: "#e7e3dc",
      borderStrong: "#d4d1c7",
      action: "#4864c8",
      actionHover: "#3a52a6",
      actionFill: "#4864c8",
      actionFillHover: "#3a52a6",
      actionSoft: "#eef2fe",
      onAction: "#ffffff",
      success: "#3d7955",
      successSoft: "#e1f7ea",
      warning: "#9b5c00",
      warningSoft: "#fff0c9",
      danger: "#b42318",
      dangerSoft: "#fee4e2",
      focus: "#5777eb",
    },
    cornerStyle: "rounded",
    density: "comfortable",
    typography: "system-sans",
  },
  revnet: {
    colors: {
      canvas: "#f6fef9",
      surface: "#f6fef9",
      surfaceSubtle: "#ebfaf1",
      surfaceAccent: "#e1f7ea",
      surfaceSuccess: "#ebfaf1",
      text: "#000000",
      textSoft: "#1f3d2b",
      textMuted: "#3d7955",
      border: "#c6edd5",
      borderStrong: "#86d5a5",
      action: "#3d7955",
      actionHover: "#1f3d2b",
      actionFill: "#68ca8f",
      actionFillHover: "#4fa270",
      actionSoft: "#e1f7ea",
      onAction: "#000000",
      success: "#3d7955",
      successSoft: "#e1f7ea",
      warning: "#824100",
      warningSoft: "#ffeecc",
      danger: "#943810",
      dangerSoft: "#ffdac9",
      focus: "#3d7955",
    },
    cornerStyle: "square",
    density: "compact",
    typography: "system-mono",
  },
  neutral: {
    colors: {
      canvas: "#f6f7f9",
      surface: "#ffffff",
      surfaceSubtle: "#f2f4f7",
      surfaceAccent: "#eef2ff",
      surfaceSuccess: "#ecfdf3",
      text: "#171a21",
      textSoft: "#344054",
      textMuted: "#5f6878",
      border: "#e1e5eb",
      borderStrong: "#c7cdd6",
      action: "#3548a5",
      actionHover: "#26367f",
      actionFill: "#3548a5",
      actionFillHover: "#26367f",
      actionSoft: "#e4e8ff",
      onAction: "#ffffff",
      success: "#246b45",
      successSoft: "#dcfae6",
      warning: "#854a0e",
      warningSoft: "#fff1d6",
      danger: "#a3211a",
      dangerSoft: "#fee4e2",
      focus: "#455dcc",
    },
    cornerStyle: "soft",
    density: "comfortable",
    typography: "system-sans",
  },
};

const SELECTION_KEYS = new Set([
  "version",
  "preset",
  "colors",
  "cornerStyle",
  "density",
  "typography",
]);
const COLOR_KEYS = new Set<string>(THEME_COLOR_KEYS);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function parseThemeSelection(value: unknown): ThemeSelectionV1 {
  const input = requirePlainRecord(value, "theme");
  rejectUnknownFields(input, SELECTION_KEYS, "theme");

  if (input.version !== THEME_PROTOCOL_VERSION) {
    throw new ThemeValidationError("invalid_value", "Unsupported theme protocol version.");
  }
  if (!isOneOf(input.preset, THEME_PRESET_IDS)) {
    throw new ThemeValidationError("invalid_value", "Unknown theme preset.");
  }

  const selection: ThemeSelectionV1 = {
    version: THEME_PROTOCOL_VERSION,
    preset: input.preset,
  };

  for (const optionalField of [
    "colors",
    "cornerStyle",
    "density",
    "typography",
  ]) {
    if (Object.hasOwn(input, optionalField) && input[optionalField] === undefined) {
      throw new ThemeValidationError(
        "invalid_value",
        "Optional theme fields must be omitted when unused.",
      );
    }
  }

  if (input.colors !== undefined) {
    const colors = requirePlainRecord(input.colors, "theme colors");
    rejectUnknownFields(colors, COLOR_KEYS, "theme colors");
    const parsedColors: Partial<Record<ThemeColorKey, string>> = {};
    for (const key of THEME_COLOR_KEYS) {
      const color = colors[key];
      if (color === undefined) {
        if (Object.hasOwn(colors, key)) {
          throw new ThemeValidationError(
            "invalid_value",
            `Theme color ${key} must be omitted when unused.`,
          );
        }
        continue;
      }
      if (typeof color !== "string" || !HEX_COLOR.test(color)) {
        throw new ThemeValidationError(
          "invalid_value",
          `Theme color ${key} must be a six-digit hexadecimal color.`,
        );
      }
      parsedColors[key] = color.toLowerCase();
    }
    selection.colors = Object.freeze(parsedColors);
  }

  if (input.cornerStyle !== undefined) {
    if (!isOneOf(input.cornerStyle, ["rounded", "soft", "square"] as const)) {
      throw new ThemeValidationError("invalid_value", "Unknown theme corner style.");
    }
    selection.cornerStyle = input.cornerStyle;
  }
  if (input.density !== undefined) {
    if (!isOneOf(input.density, ["comfortable", "compact"] as const)) {
      throw new ThemeValidationError("invalid_value", "Unknown theme density.");
    }
    selection.density = input.density;
  }
  if (input.typography !== undefined) {
    if (!isOneOf(input.typography, ["system-sans", "system-mono"] as const)) {
      throw new ThemeValidationError("invalid_value", "Unknown theme typography.");
    }
    selection.typography = input.typography;
  }

  return Object.freeze(selection);
}

export function resolveTheme(value: ThemeSelectionV1 | unknown): ResolvedTheme {
  const selection = parseThemeSelection(value);
  const base = BASE_PRESETS[selection.preset];
  const colors = Object.freeze({ ...base.colors, ...selection.colors });
  assertAccessibleTheme(colors);

  return Object.freeze({
    version: THEME_PROTOCOL_VERSION,
    preset: selection.preset,
    colors,
    cornerStyle: selection.cornerStyle ?? base.cornerStyle,
    density: selection.density ?? base.density,
    typography: selection.typography ?? base.typography,
  });
}

export function presetTheme(preset: ThemePresetId): ResolvedTheme {
  return resolveTheme({ version: THEME_PROTOCOL_VERSION, preset });
}

export function themeCssVariables(theme: ResolvedTheme): Readonly<Record<string, string>> {
  const cornerRadii: Record<ThemeCornerStyle, readonly [string, string]> = {
    rounded: ["10px", "16px"],
    soft: ["6px", "10px"],
    square: ["0px", "0px"],
  };
  const densityValues: Record<
    ThemeDensity,
    Readonly<{
      cardPadding: string;
      dialogPadding: string;
      headerHeight: string;
      messageGap: string;
      panelPadding: string;
      rowPaddingBlock: string;
      shellGap: string;
    }>
  > = {
    comfortable: {
      cardPadding: "13px",
      dialogPadding: "18px",
      headerHeight: "72px",
      messageGap: "13px",
      panelPadding: "13px",
      rowPaddingBlock: "11px",
      shellGap: "14px",
    },
    compact: {
      cardPadding: "10px",
      dialogPadding: "14px",
      headerHeight: "64px",
      messageGap: "9px",
      panelPadding: "10px",
      rowPaddingBlock: "8px",
      shellGap: "10px",
    },
  };
  const [controlRadius, panelRadius] = cornerRadii[theme.cornerStyle];
  const density = densityValues[theme.density];
  const fontFamily =
    theme.typography === "system-mono"
      ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
      : 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  return Object.freeze({
    "--canvas": theme.colors.canvas,
    "--surface": theme.colors.surface,
    "--surface-subtle": theme.colors.surfaceSubtle,
    "--surface-blue": theme.colors.surfaceAccent,
    "--surface-green": theme.colors.surfaceSuccess,
    "--surface-accent": theme.colors.surfaceAccent,
    "--surface-success": theme.colors.surfaceSuccess,
    "--text": theme.colors.text,
    "--text-soft": theme.colors.textSoft,
    "--text-muted": theme.colors.textMuted,
    "--border": theme.colors.border,
    "--border-strong": theme.colors.borderStrong,
    "--action": theme.colors.action,
    "--action-hover": theme.colors.actionHover,
    "--action-fill": theme.colors.actionFill,
    "--action-fill-hover": theme.colors.actionFillHover,
    "--action-soft": theme.colors.actionSoft,
    "--on-action": theme.colors.onAction,
    "--success": theme.colors.success,
    "--success-soft": theme.colors.successSoft,
    "--warning": theme.colors.warning,
    "--warning-soft": theme.colors.warningSoft,
    "--danger": theme.colors.danger,
    "--danger-soft": theme.colors.dangerSoft,
    "--focus": theme.colors.focus,
    "--radius-control": controlRadius,
    "--radius-panel": panelRadius,
    "--theme-font-family": fontFamily,
    "--theme-density": theme.density === "compact" ? "0.875" : "1",
    "--density-card-padding": density.cardPadding,
    "--density-dialog-padding": density.dialogPadding,
    "--density-header-height": density.headerHeight,
    "--density-message-gap": density.messageGap,
    "--density-panel-padding": density.panelPadding,
    "--density-row-padding-block": density.rowPaddingBlock,
    "--density-shell-gap": density.shellGap,
  });
}

function assertAccessibleTheme(colors: ThemeColors): void {
  type ContrastCheck = readonly [ThemeColorKey, ThemeColorKey, number];
  const readableForegrounds = [
    "text",
    "textSoft",
    "textMuted",
    "action",
    "actionHover",
  ] as const satisfies readonly ThemeColorKey[];
  const themeableSurfaces = [
    "canvas",
    "surface",
    "surfaceSubtle",
    "surfaceAccent",
    "surfaceSuccess",
    "actionSoft",
  ] as const satisfies readonly ThemeColorKey[];
  const readableSurfaceChecks: readonly ContrastCheck[] =
    readableForegrounds.flatMap((foreground) =>
      themeableSurfaces.map(
        (background) => [foreground, background, 4.5] as const,
      ),
    );
  const checks: readonly ContrastCheck[] = [
    ...readableSurfaceChecks,
    ["actionFill", "surface", 1.5],
    ["onAction", "actionFill", 4.5],
    ["onAction", "actionFillHover", 4.5],
    ["success", "successSoft", 4.5],
    ["success", "surfaceSuccess", 4.5],
    ["warning", "warningSoft", 4.5],
    ["danger", "dangerSoft", 4.5],
    ["focus", "surface", 3],
    ["focus", "canvas", 3],
    ["focus", "surfaceSubtle", 3],
    ["focus", "surfaceAccent", 3],
    ["focus", "surfaceSuccess", 3],
    ["focus", "actionSoft", 3],
  ];

  for (const [foreground, background, minimum] of checks) {
    if (contrastRatio(colors[foreground], colors[background]) < minimum) {
      throw new ThemeValidationError(
        "insufficient_contrast",
        `Theme colors ${foreground} and ${background} do not meet the required contrast.`,
      );
    }
  }
}

function contrastRatio(first: string, second: string): number {
  const high = Math.max(relativeLuminance(first), relativeLuminance(second));
  const low = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (high + 0.05) / (low + 0.05);
}

function relativeLuminance(color: string): number {
  const channels = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function requirePlainRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ThemeValidationError("invalid_shape", `${label} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ThemeValidationError("invalid_shape", `${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  accepted: ReadonlySet<string>,
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (!accepted.has(key)) {
      throw new ThemeValidationError("unknown_field", `${label} contains an unknown field.`);
    }
  }
}

function isOneOf<const T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && (options as readonly string[]).includes(value);
}
