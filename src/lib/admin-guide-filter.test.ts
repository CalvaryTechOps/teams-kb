import { describe, expect, it } from "vitest";
import {
  countByGuideFilter,
  matchesGuideFilter,
  parseGuideFilter,
  type FilterableGuide,
} from "./admin-guide-filter";

const guides: FilterableGuide[] = [
  { status: "published", pendingReview: false },
  { status: "published", pendingReview: true },
  { status: "draft", pendingReview: true },
  { status: "draft", pendingReview: false },
  { status: "archived", pendingReview: false },
  // Submissions on a guide awaiting deletion wait with the guide.
  { status: "deleted", pendingReview: true },
];

describe("parseGuideFilter", () => {
  it("accepts known values and falls back to all", () => {
    expect(parseGuideFilter("pending")).toBe("pending");
    expect(parseGuideFilter("deleted")).toBe("deleted");
    expect(parseGuideFilter(undefined)).toBe("all");
    expect(parseGuideFilter("nope")).toBe("all");
    expect(parseGuideFilter(["pending", "draft"])).toBe("all");
  });
});

describe("matchesGuideFilter", () => {
  it("treats pending as a revision state that a deleted guide hides", () => {
    expect(
      matchesGuideFilter({ status: "draft", pendingReview: true }, "pending"),
    ).toBe(true);
    expect(
      matchesGuideFilter({ status: "deleted", pendingReview: true }, "pending"),
    ).toBe(false);
    expect(
      matchesGuideFilter({ status: "published", pendingReview: false }, "pending"),
    ).toBe(false);
  });

  it("matches guide statuses directly otherwise", () => {
    expect(
      matchesGuideFilter({ status: "archived", pendingReview: false }, "archived"),
    ).toBe(true);
    expect(
      matchesGuideFilter({ status: "archived", pendingReview: false }, "draft"),
    ).toBe(false);
    expect(
      matchesGuideFilter({ status: "deleted", pendingReview: false }, "all"),
    ).toBe(true);
  });
});

describe("countByGuideFilter", () => {
  it("counts every filter from one list", () => {
    expect(countByGuideFilter(guides)).toEqual({
      all: 6,
      pending: 2,
      draft: 2,
      published: 2,
      archived: 1,
      deleted: 1,
    });
  });
});
