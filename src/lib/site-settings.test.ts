import { describe, expect, it } from "vitest";
import {
  mergeSettings,
  normalizeSettingInput,
  SETTING_DEFAULTS,
  SETTING_MAX_LENGTH,
} from "./site-settings";

describe("mergeSettings", () => {
  it("returns every default when nothing is stored", () => {
    expect(mergeSettings([])).toEqual(SETTING_DEFAULTS);
  });

  it("overlays stored values on the defaults", () => {
    const merged = mergeSettings([
      { key: "signin.button_label", value: "Sign in with Contoso" },
    ]);
    expect(merged["signin.button_label"]).toBe("Sign in with Contoso");
    expect(merged["signin.help_text"]).toBe(SETTING_DEFAULTS["signin.help_text"]);
  });

  it("ignores unknown keys, blank values and non-string jsonb", () => {
    const merged = mergeSettings([
      { key: "signin.evil", value: "x" },
      { key: "account.label", value: "   " },
      { key: "signin.button_label", value: { nested: true } },
    ]);
    expect(merged).toEqual(SETTING_DEFAULTS);
    expect("signin.evil" in merged).toBe(false);
  });
});

describe("normalizeSettingInput", () => {
  it("trims and keeps a custom value", () => {
    expect(normalizeSettingInput("account.label", "  Contoso account ")).toEqual({
      ok: true,
      value: "Contoso account",
    });
  });

  it("maps blank and default-equal input to a delete", () => {
    expect(normalizeSettingInput("account.label", "")).toEqual({ ok: true, value: null });
    expect(normalizeSettingInput("account.label", undefined)).toEqual({ ok: true, value: null });
    expect(
      normalizeSettingInput("account.label", SETTING_DEFAULTS["account.label"]),
    ).toEqual({ ok: true, value: null });
  });

  it("rejects over-long input", () => {
    const result = normalizeSettingInput("signin.tagline", "x".repeat(SETTING_MAX_LENGTH + 1));
    expect(result.ok).toBe(false);
  });
});
