# Plan: Toggle the left sidebar at any screen size

**Status: complete — implemented on `feat/sidebar-toggle` (2026-09-08),
tested by Chris locally and on staging; awaiting the PR to `main`.**
Verified before the push: lint, typecheck, tests and build pass, and Chris
ran the manual test plan below locally and on the staging deployment. Open
questions were answered by Chris before implementation (cookie persistence,
default shown, collapse control in the sidebar header plus the two
shortcuts).

## Problem

The ink sidebar is always visible on `md+` screens (≥ 768px) and becomes an
off-canvas drawer below that, opened from a hamburger in the TopBar. There is
no way to hide it on a wide screen — readers on a laptop who want the full
width for a long guide, or for the editor, are stuck with it.

Wanted behaviour:

- **Narrow screens** keep today's behaviour: the hamburger in the TopBar
  opens the sidebar as an overlay drawer with a scrim; scrim click, Escape,
  the X in the sidebar header, or any navigation closes it.
- **Wide screens**: a collapse control in the sidebar header slides the
  sidebar off-screen to the left and the page content reflows to fill the
  width (the same motion the sidebar makes today when the window is resized
  across the breakpoint). While it is hidden, the hamburger appears at the
  left of the breadcrumbs; clicking it slides the sidebar back in. The
  choice sticks across navigations and reloads.
- **Keyboard**: `Cmd/Ctrl+\` toggles the sidebar; `/` focuses the "Search
  articles" box, revealing the sidebar first if it is hidden.

What exists and matters here:

- `src/components/shell/sidebar-shell.tsx` — client component owning a
  single `open` boolean in `SidebarContext`. The wrapper is
  `fixed … -translate-x-full` below `md`, and `md:sticky md:translate-x-0`
  above it, so the breakpoint alone decides visibility on wide screens.
  Exports `SidebarToggle` (hamburger, `md:hidden`, only ever calls
  `setOpen(true)`) and `SidebarClose` (X in the sidebar header, `md:hidden`).
  Any `pathname` change and an Escape keydown listener both force
  `open = false`.
- `src/components/shell/top-bar.tsx` — the 60px white bar; renders
  `<SidebarToggle />` before the breadcrumb `<nav>`. Used by every `(kb)`
  page; nothing needs to change per page.
- `src/components/shell/app-sidebar.tsx` — server component; the `<aside>`
  is a fixed `w-[268px]` with `py-5`, and its header row (`px-5 pb-5`) holds
  the BrandMark, the admin gear and `<SidebarClose />`. The search box is a
  plain `<form action="/search">` with `<input type="search" name="q">`.
  Passed into `SidebarShell` as the `sidebar` prop from
  `src/app/(kb)/layout.tsx`.
- The "Show empty" switch already persists a UI preference through a cookie
  (`SHOW_EMPTY_COOKIE` in `src/lib/space-visibility.ts`, read server-side in
  `space-visibility.server.ts`), so the layout can render the right state on
  first paint with no flash. Reuse that pattern.
- `src/components/icons.tsx` has `MenuIcon` and `XIcon` but no
  panel-collapse glyph; one gets added.
- Tailwind v4 (`@import "tailwindcss"` in `globals.css`, no config file):
  `md` is `48rem` = 768px. React is 19.2 (native `inert`). The admin area
  has its own layout with no sidebar and is unaffected.

## Design

### 1. Two pieces of state, not one

Today one boolean means "drawer open" and only matters below `md`. Split it:

- **`drawerOpen`** (narrow screens, ephemeral) — exactly today's `open`.
  Still reset to `false` on every `pathname` change and on Escape.
- **`collapsed`** (wide screens, persisted) — whether the user has hidden the
  sidebar. Survives navigation (the layout's client state already persists
  across route changes within `(kb)`) **and** reloads via a cookie.
  Navigation must **not** reset it — that is the whole point.

The context exposes `{ drawerOpen, collapsed, show, hide, toggle,
focusSearch }`. Every action decides which state it means by checking the
viewport at call time, never during render:

```ts
export const WIDE_QUERY = "(min-width: 48rem)"; // must match Tailwind `md`
const wide = () => window.matchMedia(WIDE_QUERY).matches;
show:   () => (wide() ? setCollapsed(false) : setDrawerOpen(true));
hide:   () => (wide() ? setCollapsed(true)  : setDrawerOpen(false));
toggle: () => (wide() ? setCollapsed(!collapsed) : setDrawerOpen(!drawerOpen));
```

Keep the breakpoint constant next to the context so the CSS classes and the
JS check can't drift apart silently (comment both sides).

Add a small `useMediaQuery(query)` hook built on `useSyncExternalStore`
(server snapshot `false`, so SSR and the first client render agree). It
feeds the `inert` attribute and the dynamic labels below; it is *not* used
for layout, which stays pure CSS.

### 2. Layout and animation

Wrapper around `{sidebar}` in `SidebarShell`:

- **Below `md`** (unchanged): `fixed inset-y-0 left-0 z-40`, translated
  `-translate-x-full` unless `drawerOpen`, plus the scrim when open.
- **`md+`**: stays `sticky top-0 h-dvh`, becomes `overflow-hidden`, and
  animates its **width** between `w-[268px]` and `w-0` while the inner
  `<aside>` keeps its intrinsic 268px and translates `-translate-x-full`
  when collapsed. Animating width (a fixed pixel value, so cheap enough) is
  what makes the content column reflow instead of leaving a hole; the
  translate gives the "slide off" feel. Use
  `transition-[width,transform] duration-200` and
  `motion-reduce:transition-none`.
- The `<aside>` in `app-sidebar.tsx` gets `shrink-0` so the shrinking
  wrapper clips it rather than squashing it during the animation.
- `min-w-0 flex-1` on the content column already lets it grow into the
  freed space.

Mixed states resolve by CSS alone, no extra JS: a `drawerOpen` sidebar that
gets resized wide is governed by the `md:` classes (collapsed or not);
a collapsed sidebar resized narrow is simply closed (drawer default).

### 3. Controls: collapse lives on the sidebar, hamburger only when hidden

This is the Notion / Linear / GitHub / claude.ai convention for a
persistent full-height panel, and it mirrors what the drawer already does
(X inside closes, hamburger in the bar opens) — one mental model at every
width.

- **Sidebar header is 60px tall** (`h-[60px] items-center px-5`, dropping
  the aside's top padding so the header still sits at the very top) so its
  icons share a baseline with the TopBar's hamburger. The two controls then
  both live in the top-left corner from the user's point of view: collapse
  the panel and the hamburger appears where the eye already is; expand and
  the collapse control slides back in under the cursor.
- **`SidebarClose`** (in the sidebar header, next to the admin gear) is
  visible at **all** widths and calls `hide()`. Glyph and label switch by
  breakpoint with CSS, no JS: below `md` the existing `XIcon` with
  `aria-label="Close navigation"` (it *is* an overlay there); on `md+` a new
  `PanelLeftCloseIcon` (panel outline with a left-pointing arrow, matching
  the house 1.5px-stroke icon style) with `aria-label="Collapse sidebar"`
  and a `title` tooltip. Render both `<span>`s and toggle with
  `md:hidden` / `hidden md:inline`; the `aria-label` comes from the media
  hook (server default: the narrow label — harmless, it's corrected on
  hydration).
- **`SidebarToggle`** (hamburger, TopBar) is visible below `md` always, and
  on `md+` **only while `collapsed`** (`className` gets `md:hidden` when
  not collapsed). It calls `show()`. Because it only ever *shows* the
  sidebar it needs no `aria-expanded`; label is "Show sidebar" on wide and
  "Open navigation" on narrow via the media hook, with `title` for the
  tooltip.
- **Don't reserve space** for the hamburger while the sidebar is expanded.
  The whole content column shifts 268px in the same 200ms transition, so
  the breadcrumbs moving 26px to make room is invisible.
- When the sidebar is off-screen at the current width its links and search
  box must leave the tab order: `inert={!visible}` on the wrapper, where
  `visible = wideNow ? !collapsed : drawerOpen` from the media hook (server
  render: `inert` off, so markup matches).
- Escape closes the drawer only; it does not re-expand a collapsed desktop
  sidebar (nothing is "on top" to dismiss).

### 4. Keyboard shortcuts

One `keydown` listener on `window` in `SidebarShell` (replace the existing
Escape-only effect). Pull the decision into a pure, unit-testable helper:

```ts
// returns "toggle" | "search" | "escape" | null
export function shortcutFor(e: {
  key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean;
  shiftKey: boolean; isComposing: boolean; defaultPrevented: boolean;
  target: EventTarget | null;
}): Shortcut | null
```

- **`Cmd+\` (mac) / `Ctrl+\`** → `toggle()`. Works even while an input or
  the BlockNote editor has focus (Notion behaviour); the only guard is
  `defaultPrevented`. `\` is unused by BlockNote and Mantine.
- **`/`** → `focusSearch()`. Ignored when any modifier is held, when
  `isComposing`, or when the target is an `input`, `textarea`, `select`,
  or anything `contenteditable` (BlockNote's editor, the search box itself)
  — so typing a `/` in text is never hijacked. `preventDefault()` when it
  fires, otherwise Firefox opens quick-find.
- **Escape** → close the drawer (existing behaviour).

`focusSearch()`:

1. Give the search `<input>` a stable `id` (`SIDEBAR_SEARCH_ID`, exported
   from `sidebar-shell.tsx` and used by `app-sidebar.tsx`).
2. Call `show()` if the sidebar is hidden at the current width, and set a
   `pendingSearchFocus` flag.
3. A `useEffect` runs when `[pendingSearchFocus, visible]` change: once
   `visible` is true (the wrapper is no longer `inert`, so focus is
   allowed) it does `input.focus({ preventScroll: true }); input.select();`
   and clears the flag. Focusing during the slide-in is fine; the input
   is already in the accessibility tree. If the sidebar was already
   visible this resolves on the next tick.
4. Submitting the search navigates to `/search`, which already closes the
   drawer via the `pathname` reset; on wide screens the sidebar stays as
   the user had it.

**Discoverability**: show a small `<kbd>/</kbd>` hint at the right end of
the search box (`hidden md:inline`, muted grey-400, hidden when the input is
focused via `group-focus-within:hidden`) — the GitHub pattern. Add
`title="Collapse sidebar (⌘\ / Ctrl+\)"`-style tooltips on both sidebar
controls; render the modifier as `⌘` on mac, detected from
`navigator.platform` inside the media/effect layer (server default:
`Ctrl`).

### 5. Persistence

Follow the "Show empty" pattern:

- `SIDEBAR_COLLAPSED_COOKIE` constant beside `SHOW_EMPTY_COOKIE` in
  `src/lib/space-visibility.ts` (or a new `src/lib/sidebar-state.ts` if
  that file's name feels wrong — implementer's call).
- The `(kb)` layout reads it server-side (`cookies()` in a small
  `getSidebarCollapsed()` helper in a `*.server.ts` file) and passes
  `initialCollapsed` into `SidebarShell`, so a reload paints the collapsed
  layout immediately — no sidebar flashing in and sliding out.
- Write it **client-side** with `document.cookie` (not `httpOnly`, one-year
  `max-age`, `path=/`, `SameSite=Lax`) whenever `collapsed` changes.
  Unlike "Show empty", nothing server-rendered depends on the value except
  the initial class, so a Server Action round-trip (which re-renders the
  page) would be wasted work and would make the toggle feel laggy.
- Only the wide-screen `collapsed` state is persisted; `drawerOpen` never is.

### 6. Out of scope (deliberately)

- A drag-to-resize sidebar or multiple widths.
- A collapsed "icon rail" mode; collapsed means fully hidden.
- Remembering the drawer state on narrow screens.
- A global command palette or further shortcuts beyond the two above.
- Changing the sidebar's contents or the admin layout.

## Steps

1. Add the cookie constant + server reader; read it in
   `src/app/(kb)/layout.tsx` and pass `initialCollapsed` to `SidebarShell`.
2. Add `PanelLeftCloseIcon` to `src/components/icons.tsx`.
3. Rework `SidebarShell` state/context per §1 (split `drawerOpen` /
   `collapsed`; `show` / `hide` / `toggle` / `focusSearch`; pathname reset
   only for the drawer; cookie write; `useMediaQuery` hook).
4. Rework the wrapper classes per §2; add `shrink-0` to the `<aside>`;
   make the sidebar header 60px per §3.
5. Update `SidebarClose` and `SidebarToggle` per §3, including `inert`.
6. Add `shortcutFor` + the single keydown effect + `focusSearch` per §4;
   give the search input its `id` and the `<kbd>/</kbd>` hint.
7. Tests (vitest; `renderToStaticMarkup` like the other component tests):
   - `SidebarToggle` has `md:hidden` when `collapsed` is false and not
     when it is true; `SidebarClose` renders both glyphs with the
     breakpoint classes and is never `md:hidden`.
   - `SidebarShell` with `initialCollapsed={true}` renders `md:w-0` +
     `md:-translate-x-full`; with `false` renders `md:w-[268px]` +
     `md:translate-x-0`. Drawer closed by default: `-translate-x-full`, no
     scrim.
   - `shortcutFor`: `Cmd+\` and `Ctrl+\` → toggle (also from an input
     target); `/` → search from a `div`/`body` target; `/` → `null` from
     `input`, `textarea`, `[contenteditable]`, with a modifier, or while
     composing; `Escape` → escape; `defaultPrevented` → `null`.
   - `useMediaQuery` server snapshot is `false`.
8. Local verification: `npm test`, `npm run lint`, `npx tsc --noEmit`,
   `npm run build`; then the manual checks below.
9. Commit on `feat/sidebar-toggle`.

## Test plan (manual, `npm run dev`)

- Wide window: no hamburger; the collapse glyph sits in the sidebar header
  level with the TopBar. Click it → sidebar slides left, content widens
  smoothly, no horizontal scrollbar during the animation, hamburger appears
  left of the breadcrumbs. Click the hamburger → slides back, hamburger
  disappears.
- Collapsed, then navigate between a space, a guide, and search: stays
  collapsed. Reload: paints collapsed with no flash. New tab: also
  collapsed (cookie).
- Collapsed, shrink the window below 768px: sidebar hidden, hamburger
  opens the overlay drawer with scrim and the X glyph; scrim / Escape / X /
  navigating closes it. Widen again: still collapsed (drawer state didn't
  leak).
- Narrow, open the drawer, then widen: sidebar shows normally (or collapsed
  if that was the saved state); no scrim left behind.
- `Cmd/Ctrl+\`: toggles at both widths, including while the cursor is in
  the guide editor. `/` on a guide page focuses the search box with any
  existing text selected; with the sidebar collapsed it expands first and
  then focuses; on narrow it opens the drawer and focuses. `/` typed inside
  the editor, the search box, or the category rename input inserts a `/`.
- Keyboard: with the sidebar hidden, Tab from the hamburger never lands on
  sidebar links or the search input.
- Reduced motion enabled in the OS: toggling snaps with no animation.
- Long guide page and the BlockNote editor: content re-lays out correctly
  when the sidebar collapses (check the editor's floating toolbars don't
  keep a stale position).

## Open questions for Chris

1. **Persist across reloads via cookie** (recommended above, matches "Show
   empty") — or is per-tab memory enough? Cookie is slightly more code (the
   layout reads it) but avoids the sidebar flashing in and then sliding out
   on every reload.
   Answer: Cookie, to avoid the sidebar flashing and sliding out.
2. **Default for new/unknown browsers**: sidebar shown (recommended, today's
   behaviour), or should some widths (e.g. between 768–1024px) default to
   collapsed?
   Answer: default to sidebar shown
3. **Accessible names**: mostly settled by the answer to 4 — the hamburger
   only ever shows the sidebar ("Show sidebar" / "Open navigation") and the
   in-sidebar control only ever hides it ("Collapse sidebar" / "Close
   navigation"), so no `aria-expanded` is needed. Shout if you'd prefer a
   single static label on each.
4. **Should the X inside the sidebar header also work on wide screens, with
   the hamburger shown only while hidden?**
   Answer (2026-09-08): yes. Put the collapse control in the sidebar header
   at all widths and show the hamburger only while the sidebar is hidden —
   the Notion / Linear / GitHub / claude.ai pattern, and the same two
   controls the drawer already uses. On wide screens use a panel-collapse
   glyph rather than an X (X means "dismiss an overlay"), make the sidebar
   header 60px so both controls share the TopBar's baseline, and don't
   reserve space for the hamburger while expanded. Also add `Cmd/Ctrl+\`
   to toggle the sidebar and `/` to focus "Search articles", revealing the
   sidebar first if it is hidden. Folded into §3 and §4.
