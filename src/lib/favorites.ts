// Pure pieces of the favorites feature (plans/favorites.md), shared by the
// star button, the sidebar row and the /favorites page. Kept free of React
// and server imports so vitest can exercise them.

export const FAVORITES_PATH = "/favorites";

/** Placeholder and accessible name of the favorites page's filter box. */
export const FAVORITES_FILTER_PLACEHOLDER = "Search your favorites";

/** Accessible name of the star button, describing what a click will do. */
export function favoriteLabel(isFavorite: boolean): string {
  return isFavorite ? "Remove from favorites" : "Add to favorites";
}
