// Pure filter logic for /admin/guides. The page loads every guide once and
// narrows it here, so the filter pills can show counts from the same list.
// Kept free of React and server imports for unit tests.

export const GUIDE_FILTERS = [
  "all",
  "pending",
  "draft",
  "published",
  "archived",
  "deleted",
] as const;

export type GuideFilter = (typeof GUIDE_FILTERS)[number];

export const GUIDE_FILTER_LABELS: Record<GuideFilter, string> = {
  all: "All",
  pending: "Pending review",
  draft: "Draft",
  published: "Published",
  archived: "Archived",
  deleted: "Pending deletion",
};

export type FilterableGuide = {
  status: "draft" | "published" | "archived" | "deleted";
  /** A member submission is waiting in the space's approval queue. */
  pendingReview: boolean;
};

/** `?filter=` as a known value; anything else (absent, repeated, junk) is "all". */
export function parseGuideFilter(
  raw: string | string[] | undefined,
): GuideFilter {
  if (typeof raw !== "string") return "all";
  return (GUIDE_FILTERS as readonly string[]).includes(raw)
    ? (raw as GuideFilter)
    : "all";
}

/**
 * Whether a guide belongs under a filter. "pending" is a revision state, not
 * a guide state: a guide awaiting deletion also hides its submissions (they
 * wait with the guide, as in the space queue), so it never counts as pending.
 */
export function matchesGuideFilter(
  g: FilterableGuide,
  filter: GuideFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "pending":
      return g.pendingReview && g.status !== "deleted";
    default:
      return g.status === filter;
  }
}

export function countByGuideFilter<T extends FilterableGuide>(
  guides: readonly T[],
): Record<GuideFilter, number> {
  const counts = Object.fromEntries(
    GUIDE_FILTERS.map((f) => [f, 0]),
  ) as Record<GuideFilter, number>;
  for (const g of guides) {
    for (const f of GUIDE_FILTERS) {
      if (matchesGuideFilter(g, f)) counts[f] += 1;
    }
  }
  return counts;
}
