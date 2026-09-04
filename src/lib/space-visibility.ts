// Pure rule for hiding empty departments. Shared by the sidebar accordion and
// the home page grid so the two never disagree; kept free of server imports
// so vitest can exercise it.

export type SpaceVisibilityInput = {
  /** Published guides in the space the current user can read. */
  articles: number;
  /** The user is a member or owner of the department's M365 group. */
  isMine: boolean;
};

/**
 * A department is shown when the user turned on "Show empty", has something
 * to read there, or belongs to it — owners must always be able to reach the
 * space where they create guides, even before anything is published.
 */
export function isSpaceShown(s: SpaceVisibilityInput, showEmpty: boolean) {
  return showEmpty || s.articles > 0 || s.isMine;
}

/** Cookie holding the preference: "1" = show empty; absent/other = hide. */
export const SHOW_EMPTY_COOKIE = "kb-show-empty-departments";
