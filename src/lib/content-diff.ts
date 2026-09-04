import { diffArrays } from "diff";

// Pure line-diff preparation for the approval queue — no React, no server
// imports, so the collapsing logic is unit-testable directly. Callers pass the
// line projections of two documents (see blocksToLines in guide-content.ts).

export type DiffRow =
  | { kind: "added" | "removed" | "context"; text: string }
  | { kind: "skip"; count: number };

/** Long unchanged runs shrink to `context` lines on each side of a change. */
function collapseContext(rows: DiffRow[], context: number): DiffRow[] {
  const out: DiffRow[] = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i]!.kind !== "context") {
      out.push(rows[i]!);
      i++;
      continue;
    }
    let j = i;
    while (j < rows.length && rows[j]!.kind === "context") j++;
    const run = rows.slice(i, j);
    // Context only matters next to a change: none kept at the diff's edges.
    const keepHead = i === 0 ? 0 : context;
    const keepTail = j === rows.length ? 0 : context;
    if (run.length > keepHead + keepTail + 1) {
      out.push(...run.slice(0, keepHead));
      out.push({ kind: "skip", count: run.length - keepHead - keepTail });
      out.push(...run.slice(run.length - keepTail));
    } else {
      out.push(...run);
    }
    i = j;
  }
  return out;
}

/**
 * Unified line diff of two documents given as lines, with unchanged runs
 * collapsed to `context` lines around each change.
 */
export function computeDiffRows(
  before: string[],
  after: string[],
  context = 3,
): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const part of diffArrays(before, after)) {
    const kind = part.added ? "added" : part.removed ? "removed" : "context";
    for (const text of part.value) rows.push({ kind, text });
  }
  return collapseContext(rows, context);
}

export function hasChanges(rows: DiffRow[]): boolean {
  return rows.some((r) => r.kind === "added" || r.kind === "removed");
}
