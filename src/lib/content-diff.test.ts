import { describe, expect, it } from "vitest";
import { computeDiffRows, hasChanges, type DiffRow } from "./content-diff";

const doc = (n: number, prefix = "line") =>
  Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);

function kinds(rows: DiffRow[]): string[] {
  return rows.map((r) => r.kind);
}

describe("computeDiffRows", () => {
  it("marks added and removed lines", () => {
    const rows = computeDiffRows(["keep", "old"], ["keep", "new"]);
    expect(rows).toEqual([
      { kind: "context", text: "keep" },
      { kind: "removed", text: "old" },
      { kind: "added", text: "new" },
    ]);
    expect(hasChanges(rows)).toBe(true);
  });

  it("reports no changes for identical documents", () => {
    expect(hasChanges(computeDiffRows(["a", "b"], ["a", "b"]))).toBe(false);
    expect(hasChanges(computeDiffRows([], []))).toBe(false);
  });

  it("collapses long unchanged runs, keeping context around the change", () => {
    const before = doc(20);
    const after = before.map((l) => (l === "line 10" ? "line ten" : l));
    const rows = computeDiffRows(before, after, 3);

    // Leading run: 9 unchanged lines → skip(6) + 3 context before the change.
    // Trailing run: 10 unchanged lines → 3 context + skip(7).
    expect(kinds(rows)).toEqual([
      "skip",
      "context",
      "context",
      "context",
      "removed",
      "added",
      "context",
      "context",
      "context",
      "skip",
    ]);
    const skips = rows.filter((r) => r.kind === "skip");
    expect(skips).toEqual([
      { kind: "skip", count: 6 },
      { kind: "skip", count: 7 },
    ]);
  });

  it("keeps short unchanged runs whole rather than hiding one line", () => {
    const before = ["changed A", "mid 1", "mid 2", "mid 3", "mid 4", "changed B"];
    const after = ["CHANGED A", "mid 1", "mid 2", "mid 3", "mid 4", "CHANGED B"];
    const rows = computeDiffRows(before, after, 2);
    // 4-line middle run ≤ 2+2+1, so no skip row appears.
    expect(rows.some((r) => r.kind === "skip")).toBe(false);
  });

  it("diffs a brand-new document as all additions", () => {
    const rows = computeDiffRows([], ["## Title", "Body", "- item"]);
    expect(rows.every((r) => r.kind === "added")).toBe(true);
    expect(rows).toHaveLength(3);
  });
});
