// Pure helpers behind <FilterableList>/<FilterableCheckboxList>. Kept free of
// React so they can be unit-tested and reused by any list that filters
// client-side.

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

/** Case-insensitive substring match on each item's label. Empty query keeps all. */
export function filterByLabel<T>(
  items: readonly T[],
  query: string,
  getLabel: (item: T) => string,
): T[] {
  const q = normalizeQuery(query);
  if (!q) return [...items];
  return items.filter((item) => getLabel(item).toLowerCase().includes(q));
}

/**
 * Stable partition: selected items first (in their original order), then the
 * rest. Lets already-shared groups sit at the top of a long list where they
 * are easy to review and uncheck.
 */
export function selectedFirst<T extends { id: string }>(
  items: readonly T[],
  selected: ReadonlySet<string>,
): T[] {
  const picked: T[] = [];
  const rest: T[] = [];
  for (const item of items) (selected.has(item.id) ? picked : rest).push(item);
  return picked.concat(rest);
}
