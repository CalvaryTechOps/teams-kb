import { describe, expect, it } from "vitest";
import { attentionTiles, type AttentionCounts } from "./admin-attention-tiles";

const none: AttentionCounts = {
  orphanedSpaces: 0,
  allStaffRequests: 0,
  deletionRequests: 0,
  pendingSubmissions: 0,
};

describe("attentionTiles", () => {
  it("renders all four tiles in a fixed order with their admin links", () => {
    const tiles = attentionTiles(none);
    expect(tiles.map((t) => t.key)).toEqual([
      "orphanedSpaces",
      "allStaffRequests",
      "deletionRequests",
      "pendingSubmissions",
    ]);
    expect(tiles.map((t) => t.href)).toEqual([
      "/admin/spaces",
      "/admin/all-staff-requests",
      "/admin/deletion-requests",
      "/admin/guides?filter=pending",
    ]);
  });

  it("keeps every tile at zero rather than hiding it", () => {
    const tiles = attentionTiles(none);
    expect(tiles).toHaveLength(4);
    expect(tiles.every((t) => t.count === 0)).toBe(true);
    expect(tiles[0]!.caption).toBe("Every space has an active department");
    expect(tiles[1]!.caption).toBe("Nothing waiting");
  });

  it("switches the caption to an instruction when something is waiting", () => {
    const tiles = attentionTiles({
      ...none,
      orphanedSpaces: 2,
      pendingSubmissions: 1,
    });
    const byKey = Object.fromEntries(tiles.map((t) => [t.key, t]));
    expect(byKey.orphanedSpaces!.count).toBe(2);
    expect(byKey.orphanedSpaces!.caption).toBe("Re-home or merge");
    expect(byKey.pendingSubmissions!.caption).toBe(
      "Submitted by members, not yet published",
    );
    expect(byKey.allStaffRequests!.caption).toBe("Nothing waiting");
  });
});
