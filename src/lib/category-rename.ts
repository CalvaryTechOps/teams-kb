import { GENERAL_CATEGORY_SLUG } from "@/lib/categories";
import { slugify } from "@/lib/slug";

export type RenameConflict = "duplicate" | "reserved";

/**
 * Why a category may not take the name whose slug is `candidateSlug`.
 * `others` are the space's *other* categories (the caller excludes the one
 * being renamed). Two categories in a space may never be so similar that
 * they slugify the same, whether the address is being changed or kept — so
 * both the stored slug and the slugified display name of each other
 * category count as taken. "General" is the synthetic uncategorized card
 * and is refused outright, as `createCategory` does.
 */
export function renameConflict(
  candidateSlug: string,
  others: readonly { slug: string; name: string }[],
): RenameConflict | null {
  if (candidateSlug === GENERAL_CATEGORY_SLUG) return "reserved";
  for (const o of others) {
    if (o.slug === candidateSlug || slugify(o.name) === candidateSlug) {
      return "duplicate";
    }
  }
  return null;
}

/** The one-line notice the edit page shows for a refused rename. */
export function renameConflictMessage(code: string): string | null {
  switch (code) {
    case "duplicate":
      return "Another category in this department already has that name.";
    case "reserved":
      return "“General” is reserved for guides without a category.";
    default:
      return null;
  }
}
