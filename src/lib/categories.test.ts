import { describe, expect, it } from "vitest";
import { GENERAL_CATEGORY_SLUG, newGuidePath } from "./categories";

describe("newGuidePath", () => {
  it("is the bare form when no category is given", () => {
    expect(newGuidePath("tech-ops")).toBe("/spaces/tech-ops/new");
    expect(newGuidePath("tech-ops", "")).toBe("/spaces/tech-ops/new");
  });

  it("carries a real category slug as a query parameter", () => {
    expect(newGuidePath("tech-ops", "email")).toBe(
      "/spaces/tech-ops/new?category=email",
    );
  });

  it("treats General as no category, since the form defaults to it", () => {
    expect(newGuidePath("tech-ops", GENERAL_CATEGORY_SLUG)).toBe(
      "/spaces/tech-ops/new",
    );
  });

  it("encodes slugs that are not URL-safe", () => {
    expect(newGuidePath("tech-ops", "a&b c")).toBe(
      "/spaces/tech-ops/new?category=a%26b%20c",
    );
  });
});
