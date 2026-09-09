import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildThemeCss,
  contrastProblems,
  contrastRatio,
  customizedTokens,
  mergeTheme,
  normalizeHex,
  normalizeThemeInput,
  parseThemeMode,
  THEME_DEFAULTS,
  THEME_MODES,
  THEME_SETTING_KEYS,
  THEME_TOKEN_NAMES,
} from "./theme";

const form = (fields: Record<string, unknown>) => ({
  get: (name: string) => fields[name] ?? null,
});

describe("defaults", () => {
  it("match the :root defaults in globals.css, so the fallback equals the light theme", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    for (const name of THEME_TOKEN_NAMES) {
      const value = css.match(new RegExp(`--theme-${name}:\\s*(#[0-9a-f]{6});`))?.[1];
      expect(value, `--theme-${name} in globals.css`).toBe(THEME_DEFAULTS.light[name]);
      // And every semantic token is exposed to Tailwind through that default.
      expect(css).toContain(`--color-${name}: var(--theme-${name});`);
    }
  });

  it("are readable in both modes", () => {
    for (const mode of THEME_MODES) {
      expect(contrastProblems(THEME_DEFAULTS[mode]), mode).toEqual([]);
    }
  });
});

describe("parseThemeMode", () => {
  it("is light unless the cookie says dark", () => {
    expect(parseThemeMode(undefined)).toBe("light");
    expect(parseThemeMode("light")).toBe("light");
    expect(parseThemeMode("system")).toBe("light");
    expect(parseThemeMode("dark")).toBe("dark");
  });
});

describe("normalizeHex", () => {
  it("accepts 3- and 6-digit hex in any case and lowercases", () => {
    expect(normalizeHex("#0098BD")).toBe("#0098bd");
    expect(normalizeHex(" #ABC ")).toBe("#aabbcc");
  });
  it("rejects everything else", () => {
    for (const bad of ["0098bd", "#0098bd80", "#ggg", "red", "", null, 5]) {
      expect(normalizeHex(bad)).toBeNull();
    }
  });
});

describe("contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });
});

describe("mergeTheme", () => {
  it("returns the defaults when nothing is stored", () => {
    expect(mergeTheme([])).toEqual({
      light: THEME_DEFAULTS.light,
      dark: THEME_DEFAULTS.dark,
      darkEnabled: true,
    });
  });

  it("overlays stored overrides per mode and reads the kill switch", () => {
    const merged = mergeTheme([
      { key: THEME_SETTING_KEYS.light, value: { accent: "#FF0000" } },
      { key: THEME_SETTING_KEYS.dark, value: { surface: "#000" } },
      { key: THEME_SETTING_KEYS.darkEnabled, value: false },
    ]);
    expect(merged.light.accent).toBe("#ff0000");
    expect(merged.light.surface).toBe(THEME_DEFAULTS.light.surface);
    expect(merged.dark.surface).toBe("#000000");
    expect(merged.dark.accent).toBe(THEME_DEFAULTS.dark.accent);
    expect(merged.darkEnabled).toBe(false);
  });

  it("ignores unknown keys, unknown tokens, bad colors and wrong shapes", () => {
    const merged = mergeTheme([
      { key: "theme.evil", value: { accent: "#ff0000" } },
      { key: THEME_SETTING_KEYS.light, value: { "grey-500": "#ff0000", accent: "red" } },
      { key: THEME_SETTING_KEYS.dark, value: ["#ff0000"] },
      { key: THEME_SETTING_KEYS.darkEnabled, value: "false" },
    ]);
    expect(merged).toEqual(mergeTheme([]));
  });
});

describe("customizedTokens", () => {
  it("lists only the tokens that differ from the mode's defaults", () => {
    expect(customizedTokens("light", THEME_DEFAULTS.light).size).toBe(0);
    const set = customizedTokens("light", { ...THEME_DEFAULTS.light, accent: "#ff0000" });
    expect([...set]).toEqual(["accent"]);
  });
});

describe("normalizeThemeInput", () => {
  it("writes nothing when every field is blank or the default", () => {
    const result = normalizeThemeInput(
      form({ "light.accent": THEME_DEFAULTS.light.accent, dark_enabled: "on" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.writes).toEqual([
      { key: THEME_SETTING_KEYS.light, value: null },
      { key: THEME_SETTING_KEYS.dark, value: null },
      { key: THEME_SETTING_KEYS.darkEnabled, value: null },
    ]);
    expect(result.settings.light).toEqual(THEME_DEFAULTS.light);
  });

  it("stores only the overrides, normalized, and the kill switch when off", () => {
    const result = normalizeThemeInput(
      form({ "light.accent": "#FF8800", "dark.surface": "#111", "light.fg": THEME_DEFAULTS.light.fg }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.writes).toEqual([
      { key: THEME_SETTING_KEYS.light, value: { accent: "#ff8800" } },
      { key: THEME_SETTING_KEYS.dark, value: { surface: "#111111" } },
      { key: THEME_SETTING_KEYS.darkEnabled, value: false },
    ]);
    expect(result.settings.darkEnabled).toBe(false);
  });

  it("rejects a malformed color, naming the field", () => {
    const result = normalizeThemeInput(form({ "dark.fg-muted": "grey" }));
    expect(result).toEqual({
      ok: false,
      error: "Dark mode Muted text must be a hex color like #0098bd.",
    });
  });

  it("refuses text that would be unreadable on its background", () => {
    const result = normalizeThemeInput(form({ "light.fg": "#eeeeee" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/^Light mode: Text on Page background has 1\.\d\d:1 contrast/);
  });
});

describe("buildThemeCss", () => {
  it("emits one unlayered block per mode with every token and color-scheme", () => {
    const css = buildThemeCss(THEME_DEFAULTS.light, THEME_DEFAULTS.dark);
    expect(css.startsWith(":root{--color-surface:#f6f8f9;")).toBe(true);
    expect(css).toContain(";color-scheme:light}");
    expect(css).toContain(':root[data-theme="dark"]{--color-surface:#0d191d;');
    expect(css).toContain(";color-scheme:dark}");
    for (const name of THEME_TOKEN_NAMES) {
      expect(css.split(`--color-${name}:`).length).toBe(3);
    }
  });

  it("never emits an invalid value even from a hand-edited row", () => {
    const css = buildThemeCss({ ...THEME_DEFAULTS.light, accent: "red}body{display:none" }, THEME_DEFAULTS.dark);
    expect(css).not.toContain("display:none");
    expect(css).toContain(`--color-accent:${THEME_DEFAULTS.light.accent}`);
  });
});
