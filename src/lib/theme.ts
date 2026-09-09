// Admin-editable theme: the semantic color tokens every component is built
// from, one palette per mode, stored as app_setting rows (`theme.light`,
// `theme.dark`) holding only the values that differ from the defaults. Pure
// helpers only (no DB, no DOM) so they unit-test cleanly; the cached reader
// lives in theme.server.ts and the per-browser mode cookie is read there too.
//
// Tailwind utilities compile to `var(--color-<token>)`, so the root layout can
// retheme the whole app by emitting these variables in an unlayered <style>
// (see buildThemeCss). The raw palette ramp in globals.css stays internal;
// components must use these tokens (enforced by theme-classes.test.ts).

export type ThemeMode = "light" | "dark";
export const THEME_MODES: readonly ThemeMode[] = ["light", "dark"];

/** Cookie holding the browser's mode: "dark"; absent or anything else = light. */
export const THEME_COOKIE = "kb-theme";

export function parseThemeMode(value: unknown): ThemeMode {
  return value === "dark" ? "dark" : "light";
}

export const THEME_GROUPS = [
  { id: "surfaces", label: "Surfaces" },
  { id: "text", label: "Text" },
  { id: "accent", label: "Accent" },
  { id: "sidebar", label: "Sidebar" },
  { id: "status", label: "Status" },
] as const;
export type ThemeGroup = (typeof THEME_GROUPS)[number]["id"];

export const THEME_TOKENS = [
  { name: "surface", group: "surfaces", label: "Page background", help: "Behind everything." },
  { name: "surface-raised", group: "surfaces", label: "Card background", help: "Cards, the top bar, inputs." },
  { name: "surface-sunken", group: "surfaces", label: "Sunken background", help: "Inline code, hovered rows, disabled controls." },
  { name: "border", group: "surfaces", label: "Border", help: "Hairlines and dividers." },
  { name: "border-strong", group: "surfaces", label: "Strong border", help: "Input outlines and secondary buttons." },
  { name: "fg", group: "text", label: "Text", help: "Body text." },
  { name: "fg-strong", group: "text", label: "Headings", help: "Headings and emphasized labels." },
  { name: "fg-muted", group: "text", label: "Muted text", help: "Secondary text and breadcrumbs." },
  { name: "fg-subtle", group: "text", label: "Subtle text", help: "Placeholders and icons at rest." },
  { name: "accent", group: "accent", label: "Accent", help: "Primary buttons, switches, focus rings." },
  { name: "accent-strong", group: "accent", label: "Accent hover", help: "Primary buttons and links on hover." },
  { name: "accent-text", group: "accent", label: "Link", help: "Links and other accent-colored text." },
  { name: "accent-soft", group: "accent", label: "Accent tint", help: "Notes and hover washes." },
  { name: "accent-soft-strong", group: "accent", label: "Accent tint, strong", help: "Selected rows and brand badges." },
  { name: "on-accent", group: "accent", label: "Text on accent", help: "Labels on primary buttons." },
  { name: "sidebar", group: "sidebar", label: "Sidebar background", help: "Also the sign-in page hero." },
  { name: "sidebar-fg", group: "sidebar", label: "Sidebar text", help: "Department names and the wordmark." },
  { name: "sidebar-fg-muted", group: "sidebar", label: "Sidebar muted text", help: "Secondary text and icons." },
  { name: "sidebar-fg-subtle", group: "sidebar", label: "Sidebar subtle text", help: "Tertiary text and empty counts." },
  { name: "success", group: "status", label: "Success", help: "Badge and alert text." },
  { name: "success-soft", group: "status", label: "Success tint", help: "Badge and alert background." },
  { name: "warning", group: "status", label: "Warning", help: "Badge and alert text." },
  { name: "warning-soft", group: "status", label: "Warning tint", help: "Badge and alert background." },
  { name: "danger", group: "status", label: "Danger", help: "Badge and alert text, danger buttons." },
  { name: "danger-soft", group: "status", label: "Danger tint", help: "Badge and alert background." },
] as const satisfies readonly { name: string; group: ThemeGroup; label: string; help: string }[];

export type ThemeToken = (typeof THEME_TOKENS)[number]["name"];
export type ThemePalette = Record<ThemeToken, string>;

export const THEME_TOKEN_NAMES = THEME_TOKENS.map((t) => t.name) as ThemeToken[];

export function isThemeToken(name: string): name is ThemeToken {
  return THEME_TOKEN_NAMES.includes(name as ThemeToken);
}

export function themeTokenMeta(name: ThemeToken) {
  return THEME_TOKENS.find((t) => t.name === name)!;
}

// The light palette is the app's original single theme, value for value. The
// dark palette keeps the cyan accent and derives its surfaces from the ink.
// Both must satisfy REQUIRED_PAIRS (theme.test.ts checks).
export const THEME_DEFAULTS: Record<ThemeMode, ThemePalette> = {
  light: {
    surface: "#f6f8f9",
    "surface-raised": "#ffffff",
    "surface-sunken": "#eceff1",
    border: "#dde3e6",
    "border-strong": "#c4ced2",
    fg: "#1e2c31",
    "fg-strong": "#001519",
    "fg-muted": "#697c84",
    "fg-subtle": "#94a3aa",
    accent: "#00bae5",
    "accent-strong": "#0098bd",
    "accent-text": "#017a99",
    "accent-soft": "#eefafe",
    "accent-soft-strong": "#d6f3fb",
    "on-accent": "#001519",
    sidebar: "#001519",
    "sidebar-fg": "#ffffff",
    "sidebar-fg-muted": "#94a3aa",
    "sidebar-fg-subtle": "#697c84",
    success: "#1f9d55",
    "success-soft": "#dcf3e6",
    warning: "#d98315",
    "warning-soft": "#fbeed6",
    danger: "#d64545",
    "danger-soft": "#f8dede",
  },
  dark: {
    surface: "#0d191d",
    "surface-raised": "#132329",
    "surface-sunken": "#1a2d34",
    border: "#24393f",
    "border-strong": "#345059",
    fg: "#dfe7ea",
    "fg-strong": "#ffffff",
    "fg-muted": "#93a6ad",
    "fg-subtle": "#6e838b",
    accent: "#00bae5",
    "accent-strong": "#33cdef",
    "accent-text": "#4fd3f2",
    "accent-soft": "#0f2f38",
    "accent-soft-strong": "#14404b",
    "on-accent": "#001519",
    sidebar: "#06121a",
    "sidebar-fg": "#ffffff",
    "sidebar-fg-muted": "#94a3aa",
    "sidebar-fg-subtle": "#697c84",
    success: "#3fc57a",
    "success-soft": "#123a24",
    warning: "#f0a03a",
    "warning-soft": "#3e2a0c",
    danger: "#f06a6a",
    "danger-soft": "#43191b",
  },
};

export const THEME_SETTING_KEYS = {
  light: "theme.light",
  dark: "theme.dark",
  darkEnabled: "theme.dark_enabled",
} as const;

export type ThemeSettings = {
  light: ThemePalette;
  dark: ThemePalette;
  /** Admin kill switch: when off the toggle is hidden and every browser gets light. */
  darkEnabled: boolean;
};

export const THEME_SETTING_DEFAULTS: ThemeSettings = {
  light: THEME_DEFAULTS.light,
  dark: THEME_DEFAULTS.dark,
  darkEnabled: true,
};

/** `#rgb` or `#rrggbb`, any case → lowercase `#rrggbb`; anything else → null. */
export function normalizeHex(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  const short = value.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return null;
}

/** Overrides from one stored jsonb object; unknown tokens and bad values dropped. */
function overridesFrom(value: unknown): Partial<ThemePalette> {
  const out: Partial<ThemePalette> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isThemeToken(key)) continue;
    const hex = normalizeHex(raw);
    if (hex) out[key] = hex;
  }
  return out;
}

/**
 * Defaults overlaid with stored rows. A row of the wrong shape, an unknown
 * token or a malformed color is ignored, so a bad write can never break the
 * app's styling.
 */
export function mergeTheme(
  rows: Iterable<{ key: string; value: unknown }>,
): ThemeSettings {
  const merged: ThemeSettings = {
    light: { ...THEME_DEFAULTS.light },
    dark: { ...THEME_DEFAULTS.dark },
    darkEnabled: THEME_SETTING_DEFAULTS.darkEnabled,
  };
  for (const row of rows) {
    switch (row.key) {
      case THEME_SETTING_KEYS.light:
        Object.assign(merged.light, overridesFrom(row.value));
        break;
      case THEME_SETTING_KEYS.dark:
        Object.assign(merged.dark, overridesFrom(row.value));
        break;
      case THEME_SETTING_KEYS.darkEnabled:
        if (typeof row.value === "boolean") merged.darkEnabled = row.value;
        break;
    }
  }
  return merged;
}

/** Tokens whose value differs from the mode's default (for "customized" chips). */
export function customizedTokens(mode: ThemeMode, palette: ThemePalette): Set<ThemeToken> {
  const out = new Set<ThemeToken>();
  for (const name of THEME_TOKEN_NAMES) {
    if (palette[name] !== THEME_DEFAULTS[mode][name]) out.add(name);
  }
  return out;
}

// ── Contrast ──

function channel(hex: string, offset: number) {
  const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** WCAG 2 contrast ratio between two `#rrggbb` colors, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA for normal text; the Theme page refuses to save below this. */
export const MIN_TEXT_CONTRAST = 4.5;

export type ContrastPair = { text: ThemeToken; background: ThemeToken };

/**
 * Body-text pairs that must reach MIN_TEXT_CONTRAST or the save is refused.
 * Muted text, badges and placeholders are not here: the original light theme
 * runs them a little under AA on purpose (they are small labels, not prose),
 * so they are advisory instead — see ADVISORY_PAIRS.
 */
export const REQUIRED_PAIRS: readonly ContrastPair[] = [
  { text: "fg", background: "surface" },
  { text: "fg", background: "surface-raised" },
  { text: "fg", background: "surface-sunken" },
  { text: "fg-strong", background: "surface" },
  { text: "fg-strong", background: "surface-raised" },
  { text: "accent-text", background: "surface" },
  { text: "accent-text", background: "surface-raised" },
  { text: "on-accent", background: "accent" },
  { text: "sidebar-fg", background: "sidebar" },
];

/** Shown as warnings on the Theme page when below MIN_TEXT_CONTRAST; never block. */
export const ADVISORY_PAIRS: readonly ContrastPair[] = [
  { text: "fg-muted", background: "surface" },
  { text: "fg-muted", background: "surface-raised" },
  { text: "sidebar-fg-muted", background: "sidebar" },
  { text: "success", background: "success-soft" },
  { text: "warning", background: "warning-soft" },
  { text: "danger", background: "danger-soft" },
];

export type ContrastProblem = ContrastPair & { ratio: number };

/** Every pair in `pairs` below MIN_TEXT_CONTRAST for this palette. */
export function contrastProblems(
  palette: ThemePalette,
  pairs: readonly ContrastPair[] = REQUIRED_PAIRS,
): ContrastProblem[] {
  const problems: ContrastProblem[] = [];
  for (const pair of pairs) {
    const ratio = contrastRatio(palette[pair.text], palette[pair.background]);
    if (ratio < MIN_TEXT_CONTRAST) problems.push({ ...pair, ratio });
  }
  return problems;
}

// ── Admin form ──

const MODE_LABEL: Record<ThemeMode, string> = { light: "Light mode", dark: "Dark mode" };

export type ThemeWrite = {
  key: string;
  value: Partial<ThemePalette> | boolean | null;
};

/**
 * Normalize the Theme page form. Fields are named `<mode>.<token>` (blank =
 * use the default) plus the `dark_enabled` checkbox. Returns the rows to
 * write — `null` value means delete the row so the defaults apply — or the
 * first problem found: a malformed color, or a text/background pair below
 * MIN_TEXT_CONTRAST.
 */
export function normalizeThemeInput(form: {
  get(name: string): unknown;
}): { ok: true; writes: ThemeWrite[]; settings: ThemeSettings } | { ok: false; error: string } {
  const settings: ThemeSettings = {
    light: { ...THEME_DEFAULTS.light },
    dark: { ...THEME_DEFAULTS.dark },
    darkEnabled: false,
  };
  const overrides: Record<ThemeMode, Partial<ThemePalette>> = { light: {}, dark: {} };

  for (const mode of THEME_MODES) {
    for (const token of THEME_TOKENS) {
      const raw = form.get(`${mode}.${token.name}`);
      const text = typeof raw === "string" ? raw.trim() : "";
      if (!text) continue;
      const hex = normalizeHex(text);
      if (!hex) {
        return {
          ok: false,
          error: `${MODE_LABEL[mode]} ${token.label} must be a hex color like #0098bd.`,
        };
      }
      settings[mode][token.name] = hex;
      if (hex !== THEME_DEFAULTS[mode][token.name]) overrides[mode][token.name] = hex;
    }
  }

  for (const mode of THEME_MODES) {
    const [problem] = contrastProblems(settings[mode]);
    if (problem) {
      return {
        ok: false,
        error:
          `${MODE_LABEL[mode]}: ${themeTokenMeta(problem.text).label} on ` +
          `${themeTokenMeta(problem.background).label} has ${problem.ratio.toFixed(2)}:1 ` +
          `contrast; at least ${MIN_TEXT_CONTRAST}:1 is required for readable text.`,
      };
    }
  }

  const darkRaw = form.get("dark_enabled");
  settings.darkEnabled = darkRaw === true || darkRaw === "on" || darkRaw === "true";

  const writes: ThemeWrite[] = [
    {
      key: THEME_SETTING_KEYS.light,
      value: Object.keys(overrides.light).length ? overrides.light : null,
    },
    {
      key: THEME_SETTING_KEYS.dark,
      value: Object.keys(overrides.dark).length ? overrides.dark : null,
    },
    {
      key: THEME_SETTING_KEYS.darkEnabled,
      value:
        settings.darkEnabled === THEME_SETTING_DEFAULTS.darkEnabled
          ? null
          : settings.darkEnabled,
    },
  ];
  return { ok: true, writes, settings };
}

// ── CSS ──

function declarations(palette: ThemePalette): string {
  return THEME_TOKEN_NAMES.map((name) => {
    // Values were validated on the way in; the fallback guards against a
    // hand-edited row so a broken color can never break out of the block.
    const hex = normalizeHex(palette[name]) ?? THEME_DEFAULTS.light[name];
    return `--color-${name}:${hex}`;
  }).join(";");
}

/**
 * The stylesheet the root layout injects. Unlayered `:root` declarations win
 * over Tailwind's `@layer theme` defaults, so every utility that reads
 * `var(--color-*)` follows the admin's palette; `color-scheme` makes native
 * controls and scrollbars match.
 */
export function buildThemeCss(light: ThemePalette, dark: ThemePalette): string {
  return (
    `:root{${declarations(light)};color-scheme:light}` +
    `:root[data-theme="dark"]{${declarations(dark)};color-scheme:dark}`
  );
}
