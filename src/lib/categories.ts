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

/**
 * The New Guide form. Given a category slug (other than General) the form
 * opens with that category preselected; the page resolves the slug itself
 * and falls back to General for anything it does not recognise.
 */
export function newGuidePath(spaceSlug: string, categorySlug?: string): string {
  const base = `/spaces/${spaceSlug}/new`;
  if (!categorySlug || categorySlug === GENERAL_CATEGORY_SLUG) return base;
  return `${base}?category=${encodeURIComponent(categorySlug)}`;
}
