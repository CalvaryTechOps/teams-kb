import { describe, expect, it } from "vitest";
import {
  MAX_TAGS,
  addTag,
  canCreateTag,
  dedupeTags,
  exactTag,
  matchTags,
  normalizeTagName,
  serializeTags,
} from "./tag-picker";

const t = (name: string, guideCount = 1, id = name) => ({
  id,
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  guideCount,
});

const all = [
  t("two-step", 9),
  t("Two Factor", 3),
  t("printers", 5),
  t("Printer setup", 2),
  t("MFA", 7),
  t("new phone", 1),
  t("Wi-Fi", 4),
  t("email", 8),
  t("Outlook", 6),
  t("Teams", 1),
];

describe("normalizeTagName", () => {
  it("trims, collapses whitespace and strips commas", () => {
    expect(normalizeTagName("  two   step , ")).toBe("two step");
    expect(normalizeTagName(",,,")).toBe("");
  });
});

describe("matchTags", () => {
  it("suggests the most-used tags for an empty query, capped at 8", () => {
    const names = matchTags(all, "", []).map((x) => x.name);
    expect(names).toHaveLength(8);
    expect(names.slice(0, 3)).toEqual(["two-step", "email", "MFA"]);
    expect(names).not.toContain("Teams"); // the two 1-count tags fall off
  });

  it("puts prefix matches before substring matches, most-used first", () => {
    expect(matchTags(all, "print", []).map((x) => x.name)).toEqual([
      "printers",
      "Printer setup",
    ]);
    expect(matchTags(all, "step", []).map((x) => x.name)).toEqual([
      "two-step",
    ]);
    expect(matchTags(all, "T", []).map((x) => x.name)).toEqual([
      "two-step",
      "Two Factor",
      "Teams",
      // substring group, most-used first:
      "Outlook",
      "printers",
      "Printer setup",
    ]);
  });

  it("is case-insensitive and hides already-selected tags (by slug)", () => {
    expect(matchTags(all, "mfa", []).map((x) => x.name)).toEqual(["MFA"]);
    expect(matchTags(all, "mfa", ["mfa"])).toEqual([]);
    expect(matchTags(all, "two", ["Two Step"]).map((x) => x.name)).toEqual([
      "Two Factor",
    ]);
  });
});

describe("exactTag / canCreateTag", () => {
  it("resolves a query to an existing tag the way syncTags would", () => {
    expect(exactTag(all, "Two Step")?.name).toBe("two-step");
    expect(exactTag(all, " wi fi ")?.name).toBe("Wi-Fi");
    expect(exactTag(all, "wifi")).toBeUndefined();
  });

  it("offers Create only for a genuinely new, slug-worthy name", () => {
    expect(canCreateTag(all, "wifi", [])).toBe(true);
    expect(canCreateTag(all, "two step", [])).toBe(false); // exists
    expect(canCreateTag(all, "vpn", ["VPN"])).toBe(false); // already picked
    expect(canCreateTag(all, "   ", [])).toBe(false);
    expect(canCreateTag(all, "!!!", [])).toBe(false); // slugifies to "untitled"
    const full = Array.from({ length: MAX_TAGS }, (_, i) => `t${i}`);
    expect(canCreateTag(all, "vpn", full)).toBe(false);
  });
});

describe("addTag / dedupeTags / serializeTags", () => {
  it("appends normalized names, ignoring equivalents and the cap", () => {
    expect(addTag([], " new  phone ")).toEqual(["new phone"]);
    expect(addTag(["new phone"], "New-Phone")).toEqual(["new phone"]);
    const full = Array.from({ length: MAX_TAGS }, (_, i) => `t${i}`);
    expect(addTag(full, "extra")).toEqual(full);
  });

  it("dedupes initial values by slug and keeps first-seen casing", () => {
    expect(dedupeTags(["MFA", "mfa", "Wi-Fi", "wi fi", ""])).toEqual([
      "MFA",
      "Wi-Fi",
    ]);
  });

  it("serializes to the comma-separated field syncTags parses", () => {
    expect(serializeTags(["a", "b c"])).toBe("a, b c");
    expect(serializeTags([])).toBe("");
  });
});
