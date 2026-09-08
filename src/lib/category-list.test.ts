import { describe, expect, it } from "vitest";
import { audienceLabel, filterGuides, mostRecent } from "./category-list";

const guides = [
  { id: "a", title: "Projector setup", tags: ["av", "sunday"] },
  { id: "b", title: "Sound check", tags: ["AV"] },
  { id: "c", title: "Kids check-in", tags: ["checkin"] },
];

describe("filterGuides", () => {
  it("matches titles case-insensitively", () => {
    expect(filterGuides(guides, "CHECK").map((g) => g.id)).toEqual(["b", "c"]);
  });

  it("matches tag names, ignoring case and surrounding whitespace", () => {
    expect(filterGuides(guides, "  av ").map((g) => g.id)).toEqual(["a", "b"]);
    expect(filterGuides(guides, "sunday").map((g) => g.id)).toEqual(["a"]);
  });

  it("keeps everything for an empty query and nothing for a miss", () => {
    expect(filterGuides(guides, "")).toEqual(guides);
    expect(filterGuides(guides, "   ")).toEqual(guides);
    expect(filterGuides(guides, "zzz")).toEqual([]);
  });
});

describe("mostRecent", () => {
  const dated = [
    { id: "old", updatedAt: new Date("2026-01-01") },
    { id: "new", updatedAt: new Date("2026-03-01") },
    { id: "mid", updatedAt: new Date("2026-02-01") },
  ];

  it("sorts newest first and slices to the limit without mutating", () => {
    const copy = [...dated];
    expect(mostRecent(dated, 2).map((g) => g.id)).toEqual(["new", "mid"]);
    expect(dated).toEqual(copy);
  });

  it("returns everything when the list is within the limit", () => {
    expect(mostRecent(dated, 5).map((g) => g.id)).toEqual(["new", "mid", "old"]);
  });
});

describe("audienceLabel", () => {
  it("names each audience", () => {
    expect(audienceLabel("department")).toBe("Shared with this team");
    expect(audienceLabel("groups")).toBe("Shared with other teams");
    expect(audienceLabel("all_staff")).toBe("Shared with all staff");
  });
});
