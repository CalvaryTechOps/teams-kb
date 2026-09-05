import { describe, expect, it } from "vitest";
import {
  MCP_SETTING_DEFAULTS,
  MCP_SETTING_KEYS,
  clampLimit,
  mergeMcpSettings,
  normalizeMcpSettingsInput,
} from "./mcp-settings";

describe("mergeMcpSettings", () => {
  it("returns defaults with no rows", () => {
    expect(mergeMcpSettings([])).toEqual(MCP_SETTING_DEFAULTS);
  });

  it("applies stored values of the right type", () => {
    const s = mergeMcpSettings([
      { key: MCP_SETTING_KEYS.enabled, value: false },
      { key: MCP_SETTING_KEYS.instructions, value: "  Be brief.  " },
      { key: MCP_SETTING_KEYS.maxResults, value: 10 },
    ]);
    expect(s).toEqual({ enabled: false, instructions: "Be brief.", maxResults: 10 });
  });

  it("ignores wrong types, blanks, out-of-range and unknown keys", () => {
    const s = mergeMcpSettings([
      { key: MCP_SETTING_KEYS.enabled, value: "false" },
      { key: MCP_SETTING_KEYS.instructions, value: "   " },
      { key: MCP_SETTING_KEYS.maxResults, value: 1000 },
      { key: "signin.tagline", value: "x" },
    ]);
    expect(s).toEqual(MCP_SETTING_DEFAULTS);
  });
});

describe("normalizeMcpSettingsInput", () => {
  it("deletes rows that equal the defaults", () => {
    const r = normalizeMcpSettingsInput({
      enabled: "on",
      instructions: MCP_SETTING_DEFAULTS.instructions,
      maxResults: "25",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.writes.every((w) => w.value === null)).toBe(true);
  });

  it("stores customized values and treats an absent checkbox as off", () => {
    const r = normalizeMcpSettingsInput({
      enabled: null,
      instructions: "Custom",
      maxResults: "5",
    });
    expect(r).toEqual({
      ok: true,
      writes: [
        { key: MCP_SETTING_KEYS.enabled, value: false },
        { key: MCP_SETTING_KEYS.instructions, value: "Custom" },
        { key: MCP_SETTING_KEYS.maxResults, value: 5 },
      ],
    });
  });

  it("rejects a bad max results value", () => {
    expect(
      normalizeMcpSettingsInput({ enabled: "on", instructions: "", maxResults: "0" }).ok,
    ).toBe(false);
    expect(
      normalizeMcpSettingsInput({ enabled: "on", instructions: "", maxResults: "2.5" }).ok,
    ).toBe(false);
  });

  it("rejects over-long instructions", () => {
    const r = normalizeMcpSettingsInput({
      enabled: "on",
      instructions: "x".repeat(2001),
      maxResults: "",
    });
    expect(r.ok).toBe(false);
  });
});

describe("clampLimit", () => {
  it("defaults to the max when unset or invalid", () => {
    expect(clampLimit(undefined, 25)).toBe(25);
    expect(clampLimit(NaN, 25)).toBe(25);
  });
  it("clamps into [1, max] and floors", () => {
    expect(clampLimit(1000, 25)).toBe(25);
    expect(clampLimit(0, 25)).toBe(1);
    expect(clampLimit(-3, 25)).toBe(1);
    expect(clampLimit(7.9, 25)).toBe(7);
  });
});
