import { describe, expect, it } from "vitest";
import { isOrphaned, spaceHealth } from "./space-health";

describe("spaceHealth", () => {
  it("is healthy for a live, flagged group", () => {
    expect(spaceHealth({ deletedAt: null, isDepartment: true })).toBe("healthy");
  });

  it("reports a soft-deleted group even when still flagged", () => {
    expect(
      spaceHealth({ deletedAt: new Date("2026-09-01"), isDepartment: true }),
    ).toBe("group_deleted");
  });

  it("reports an un-flagged live group", () => {
    expect(spaceHealth({ deletedAt: null, isDepartment: false })).toBe(
      "unflagged",
    );
  });

  it("treats both non-healthy states as orphaned", () => {
    expect(isOrphaned("healthy")).toBe(false);
    expect(isOrphaned("group_deleted")).toBe(true);
    expect(isOrphaned("unflagged")).toBe(true);
  });
});
