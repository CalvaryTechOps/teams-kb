import { describe, expect, it } from "vitest";
import { guideUrl, isGuideId, toGuideMetadata, type GuideMetadataRow } from "./shape";

const row: GuideMetadataRow = {
  id: "0f6b1e3e-9c1b-4a3a-8f1a-2d3c4b5a6f70",
  slug: "reset-a-badge",
  title: "Reset a badge",
  audience: "all_staff",
  publishedAt: new Date("2026-08-01T12:00:00Z"),
  updatedAt: new Date("2026-08-02T08:30:00Z"),
  spaceSlug: "facilities",
  spaceName: "Facilities",
  categorySlug: "access",
  categoryName: "Building access",
};

describe("toGuideMetadata", () => {
  it("shapes a row with tags and an absolute url", () => {
    const meta = toGuideMetadata(row, ["badges", "doors"], "https://kb.example.com/");
    expect(meta).toEqual({
      id: row.id,
      title: "Reset a badge",
      slug: "reset-a-badge",
      url: "https://kb.example.com/spaces/facilities/guides/reset-a-badge",
      space: { slug: "facilities", name: "Facilities" },
      category: { slug: "access", name: "Building access" },
      tags: ["badges", "doors"],
      audience: "all_staff",
      publishedAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-02T08:30:00.000Z",
    });
  });

  it("uses null for an uncategorized guide and a missing publish date", () => {
    const meta = toGuideMetadata(
      { ...row, categorySlug: null, categoryName: null, publishedAt: null },
      [],
      "http://localhost:3000",
    );
    expect(meta.category).toBeNull();
    expect(meta.publishedAt).toBeNull();
    expect(meta.tags).toEqual([]);
  });
});

describe("guideUrl", () => {
  it("encodes path segments", () => {
    expect(guideUrl("http://localhost:3000", "a b", "c/d")).toBe(
      "http://localhost:3000/spaces/a%20b/guides/c%2Fd",
    );
  });
});

describe("isGuideId", () => {
  it("accepts uuids and rejects anything else", () => {
    expect(isGuideId(row.id)).toBe(true);
    expect(isGuideId("reset-a-badge")).toBe(false);
    expect(isGuideId("")).toBe(false);
  });
});
