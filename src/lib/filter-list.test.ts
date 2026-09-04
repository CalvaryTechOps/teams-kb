import { describe, expect, it } from "vitest";
import { filterByLabel, normalizeQuery, selectedFirst } from "./filter-list";

const groups = [
  { id: "a", name: "AV Team" },
  { id: "b", name: "Worship" },
  { id: "c", name: "Worship Kids" },
  { id: "d", name: "Facilities" },
];

describe("filterByLabel", () => {
  it("matches case-insensitive substrings", () => {
    expect(filterByLabel(groups, "WORSHIP", (g) => g.name).map((g) => g.id)).toEqual([
      "b",
      "c",
    ]);
    expect(filterByLabel(groups, "av", (g) => g.name).map((g) => g.id)).toEqual(["a"]);
  });

  it("ignores surrounding whitespace and keeps everything for an empty query", () => {
    expect(filterByLabel(groups, "  kids ", (g) => g.name).map((g) => g.id)).toEqual(["c"]);
    expect(filterByLabel(groups, "   ", (g) => g.name)).toEqual(groups);
    expect(normalizeQuery("  Foo ")).toBe("foo");
  });

  it("returns nothing when no label matches", () => {
    expect(filterByLabel(groups, "zzz", (g) => g.name)).toEqual([]);
  });
});

describe("selectedFirst", () => {
  it("moves selected items to the top without reordering within each partition", () => {
    const out = selectedFirst(groups, new Set(["d", "b"]));
    expect(out.map((g) => g.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("is a no-op when nothing is selected", () => {
    expect(selectedFirst(groups, new Set())).toEqual(groups);
  });
});
