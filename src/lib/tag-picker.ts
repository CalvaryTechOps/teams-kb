import { slugify } from "@/lib/slug";

// Pure rules behind <TagPicker> and the admin merge target box. Free of React
// so the "does this tag already exist?" logic is unit-tested and agrees with
// the server: syncTags dedupes by slugify(name), so we do too.

export const MAX_TAGS = 12; // matches syncTags' slice(0, 12)
export const SUGGESTION_COUNT = 8;

export type PickableTag = {
  id: string;
  name: string;
  slug: string;
  guideCount: number;
};

/** Trim, collapse inner whitespace, and drop commas (the wire separator). */
export function normalizeTagName(input: string): string {
  return input.replace(/,/g, " ").replace(/\s+/g, " ").trim();
}

/** Two names are the same tag when they slugify alike ("Two Step" ≡ "two-step"). */
export function sameTag(a: string, b: string): boolean {
  return slugify(a) === slugify(b);
}

function byPopularity(a: PickableTag, b: PickableTag): number {
  return (
    b.guideCount - a.guideCount ||
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

/**
 * Existing tags to offer for `query`, minus ones already selected. An empty
 * query yields the most-used tags as suggestions; otherwise prefix matches
 * come before substring matches, each group most-used first.
 */
export function matchTags(
  all: readonly PickableTag[],
  query: string,
  selectedNames: readonly string[],
): PickableTag[] {
  const q = normalizeTagName(query).toLowerCase();
  const taken = new Set(selectedNames.map(slugify));
  const pool = all.filter((t) => !taken.has(t.slug));
  if (!q) return pool.sort(byPopularity).slice(0, SUGGESTION_COUNT);

  const prefix: PickableTag[] = [];
  const rest: PickableTag[] = [];
  for (const t of pool) {
    const name = t.name.toLowerCase();
    if (name.startsWith(q)) prefix.push(t);
    else if (name.includes(q)) rest.push(t);
  }
  return prefix.sort(byPopularity).concat(rest.sort(byPopularity));
}

/** The existing tag that `query` would resolve to on the server, if any. */
export function exactTag(
  all: readonly PickableTag[],
  query: string,
): PickableTag | undefined {
  const name = normalizeTagName(query);
  if (!name) return undefined;
  const slug = slugify(name);
  if (slug === "untitled") return undefined;
  return all.find((t) => t.slug === slug);
}

/**
 * Whether typing `query` should offer "Create new tag". Never when an existing
 * tag (or an already-selected name) would absorb it, when it has no
 * alphanumerics, or when the guide is at the tag cap.
 */
export function canCreateTag(
  all: readonly PickableTag[],
  query: string,
  selectedNames: readonly string[],
): boolean {
  const name = normalizeTagName(query);
  if (!name) return false;
  if (slugify(name) === "untitled") return false;
  if (selectedNames.length >= MAX_TAGS) return false;
  if (selectedNames.some((n) => sameTag(n, name))) return false;
  return exactTag(all, name) === undefined;
}

/** Append a name unless an equivalent is already selected or the cap is hit. */
export function addTag(selected: readonly string[], name: string): string[] {
  const clean = normalizeTagName(name);
  if (!clean || selected.length >= MAX_TAGS) return [...selected];
  if (selected.some((n) => sameTag(n, clean))) return [...selected];
  return [...selected, clean];
}

/** Drop duplicates (by slug) and enforce the cap; used for initial values. */
export function dedupeTags(names: readonly string[]): string[] {
  return names.reduce<string[]>((acc, n) => addTag(acc, n), []);
}

/** The comma-separated form syncTags expects in the `tags` field. */
export function serializeTags(names: readonly string[]): string {
  return names.join(", ");
}
