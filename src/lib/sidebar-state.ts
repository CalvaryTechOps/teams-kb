// Pure pieces of the sidebar's show/hide behaviour, shared by the client
// shell (`components/shell/sidebar-shell.tsx`), the server layout that reads
// the cookie, and the sidebar markup that carries the search box. Kept free
// of React and DOM imports so vitest can exercise the shortcut logic.

/** Cookie holding the wide-screen preference: "1" = collapsed; absent = shown. */
export const SIDEBAR_COLLAPSED_COOKIE = "kb-sidebar-collapsed";

/**
 * The breakpoint where the sidebar stops being an overlay drawer and becomes
 * a persistent column. Must match Tailwind's `md` (48rem); the shell's
 * `md:` classes and this query decide together, so change both or neither.
 */
export const WIDE_QUERY = "(min-width: 48rem)";

/** `id` of the "Search articles" input, so `/` can focus it. */
export const SIDEBAR_SEARCH_ID = "sidebar-search";

/** `id` of the sidebar wrapper, referenced by the hamburger's `aria-controls`. */
export const SIDEBAR_ID = "app-sidebar";

export type Shortcut = "toggle" | "search" | "escape";

/** The subset of KeyboardEvent the shortcut decision needs. */
export type ShortcutEvent = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  isComposing: boolean;
  defaultPrevented: boolean;
  target: EventTarget | null;
};

function isEditable(target: EventTarget | null) {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  if (el.isContentEditable) return true;
  const tag = el.tagName?.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Which sidebar shortcut a keydown triggers, if any.
 *
 * - `Cmd+\` (mac) / `Ctrl+\` toggles the sidebar. It works while an input or
 *   the guide editor has focus (Notion behaviour) because nothing else in
 *   the app binds `\` with a modifier.
 * - `/` focuses search — but never while typing: inputs, textareas, selects
 *   and contenteditable regions (the BlockNote editor uses `/` for its own
 *   menu) keep the keystroke, as do modified keys and IME composition.
 * - `Escape` closes the narrow-screen drawer.
 *
 * Anything a component already handled (`defaultPrevented`) is left alone.
 */
export function shortcutFor(e: ShortcutEvent): Shortcut | null {
  if (e.defaultPrevented) return null;
  if (e.key === "Escape") return "escape";
  if (e.key === "\\" && (e.metaKey || e.ctrlKey) && !e.altKey) return "toggle";
  if (
    e.key === "/" &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !e.isComposing &&
    !isEditable(e.target)
  ) {
    return "search";
  }
  return null;
}

/** Human-readable toggle shortcut for tooltips. */
export function toggleShortcutLabel(isMac: boolean) {
  return isMac ? "⌘\\" : "Ctrl+\\";
}
