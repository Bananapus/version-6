import {
  resolveTheme,
  themeCssVariables,
  type ThemeSelectionV1,
} from "./theme";

export const OWNED_THEME_ATTRIBUTE = "data-embed-custom-theme" as const;
export const OWNED_THEME_ATTRIBUTE_VALUE = "v1" as const;
export const OWNED_THEME_SELECTOR =
  ':where([data-embed-custom-theme="v1"])' as const;

export interface OwnedThemeMaterialization {
  readonly nonce: string;
  readonly stylesheet: string;
}

const SAFE_CUSTOM_PROPERTY = /^--[a-z][a-z0-9-]{0,63}$/;
const FORBIDDEN_CSS_VALUE = /[{};<>]|url\s*\(|@import|expression\s*\(|javascript:/i;
const CSP_NONCE = /^[A-Za-z0-9+/]{43}=$/;
const MAX_OWNED_STYLESHEET_BYTES = 4 * 1024;

/**
 * Materializes an already-bounded semantic theme into one owned CSS rule.
 *
 * The caller supplies neither a selector, property name, nor raw declaration.
 * resolveTheme performs schema and contrast validation before any CSS is built.
 */
export function ownedThemeStylesheet(
  selection: ThemeSelectionV1 | unknown,
): string {
  const variables = themeCssVariables(resolveTheme(selection));
  const declarations = Object.entries(variables).map(([property, value]) => {
    if (
      !SAFE_CUSTOM_PROPERTY.test(property) ||
      typeof value !== "string" ||
      value.length > 512 ||
      FORBIDDEN_CSS_VALUE.test(value)
    ) {
      throw new Error("Resolved theme contains an unsafe CSS token.");
    }
    return "  " + property + ": " + value + ";";
  });
  const stylesheet =
    OWNED_THEME_SELECTOR + " {\n" + declarations.join("\n") + "\n}";

  if (new TextEncoder().encode(stylesheet).byteLength > MAX_OWNED_STYLESHEET_BYTES) {
    throw new Error("Owned theme stylesheet exceeds its fixed size budget.");
  }
  return stylesheet;
}

/** Accept only the server-generated nonce syntax used by the strict CSP proxy. */
export function parseOwnedStylesheetNonce(value: unknown): string | null {
  return typeof value === "string" && CSP_NONCE.test(value) ? value : null;
}

/** Couples custom CSS generation to the exact nonce required to authorize it. */
export function materializeOwnedTheme(
  selection: ThemeSelectionV1 | unknown,
  nonceValue: unknown,
): OwnedThemeMaterialization {
  const nonce = parseOwnedStylesheetNonce(nonceValue);
  if (!nonce) {
    throw new Error("A valid per-response CSP nonce is required for custom themes.");
  }
  return Object.freeze({
    nonce,
    stylesheet: ownedThemeStylesheet(selection),
  });
}
