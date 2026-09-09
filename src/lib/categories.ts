// The space page gathers uncategorized guides under a synthetic "General"
// card. Its slug is reserved: a real category may not take it, and the
// category move route treats it as "every guide with no category".
export const GENERAL_CATEGORY_SLUG = "general";
export const GENERAL_CATEGORY_NAME = "General";

/** The category's own page (the General card resolves to the reserved slug). */
export function categoryPath(spaceSlug: string, categorySlug: string): string {
  return `/spaces/${spaceSlug}/categories/${categorySlug}`;
}

/** The category's edit page (rename, move, delete); General only ever moves. */
export function categoryEditPath(spaceSlug: string, categorySlug: string): string {
  return `${categoryPath(spaceSlug, categorySlug)}/edit`;
}
