// Pure helpers behind the category page and the space page's category cards.
// Kept free of React and server imports so they can be unit-tested directly.

export type GuideAudience = "department" | "groups" | "all_staff";

/** How many guides a category card on the space page shows before "more…". */
export const CATEGORY_CARD_LIMIT = 5;

/**
 * Case-insensitive substring match on the title or any tag name. Only those
 * two fields: the box on the category page deliberately never searches body
 * text (that is what /search is for). Empty query keeps everything.
 */
export function filterGuides<T extends { title: string; tags: readonly string[] }>(
  guides: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...guides];
  return guides.filter(
    (g) =>
      g.title.toLowerCase().includes(q) ||
      g.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

/** The `limit` most recently updated guides, newest first. Never mutates. */
export function mostRecent<T extends { updatedAt: Date }>(
  guides: readonly T[],
  limit: number,
): T[] {
  return [...guides]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, limit);
}

/** Tooltip / screen-reader text for the audience icon beside a guide title. */
export function audienceLabel(audience: GuideAudience): string {
  switch (audience) {
    case "all_staff":
      return "Shared with all staff";
    case "groups":
      return "Shared with other teams";
    default:
      return "Shared with this team";
  }
}
