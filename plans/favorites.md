# Plan: Favorite guides and a /favorites page

**Status: implemented on `feat/favorites` (2026-09-28); awaiting Chris's
local test and staging.** Lint, typecheck, tests and build pass. All open
questions answered (each with its recommendation). Migration
`drizzle/0013_guide-favorite.sql` applied to the `development` branch.
Signed-in UI paths need SAML SSO and were not clicked through; the
`renderToStaticMarkup` tests cover the star button states, the department
cell and per-row unstar on the list, and the sidebar row's position.

Let each signed-in person star the guides they come back to, and give them
one place to find those guides again:

- A **star toggle** on a guide (outline = not a favorite, filled = a
  favorite), one click to flip either way. Favorites are per user, never
  shared.
- A **`/favorites` page** that looks and behaves like a category page
  (`/spaces/{space}/categories/{category}`), including its find-as-you-type
  search box, with an extra **department column** because favorites span
  departments.
- A **"Favorites" entry in the sidebar** that looks like a department row
  and sits at the very top of the departments list, directly under the
  "Show empty" switch.

## Problem

There is no way to mark a guide for later. Staff who use the same handful of
guides every week (a room-setup checklist, a form, a phone-tree guide) have
to remember which department and category each lives in, or search for it
by name every time. Browser bookmarks work, but they are per device, invisible
inside the app, and break when a guide is moved or renamed unless the person
happened to bookmark the `/a/{shortId}` permalink.

### What exists and matters here

- **Users.** `user.id` is a `text` primary key (`src/db/auth-schema.ts`);
  `requireAccess()` (`src/lib/permissions.ts`) returns `UserAccess` with
  `userId`, `isAdmin`, and the group id sets. Every `(kb)` page already calls
  it, and it is `cache()`d per request.
- **Guide visibility** is one composable WHERE fragment,
  `visibleGuidesWhere(access)`, applied to every list query. It is the only
  definition of "may this person see this guide", and it already excludes
  guides whose status is `deleted`.
- **Guide identity.** `guide.id` is a uuid that survives moves and re-slugs
  (the readable URL changes; `guidePath(spaceSlug, guideSlug)` in
  `src/lib/moves.ts` builds it). Guides are hard-deleted when an admin
  approves a deletion request, so every child table uses
  `onDelete: "cascade"` (`guide_tag`, `guide_audience_group`).
- **Category page** (`src/app/(kb)/spaces/[slug]/categories/[categorySlug]/page.tsx`)
  is the template for the favorites page: server component, one query on
  `guide` joined to creator and current-revision author, a second query for
  tags grouped in JS, rows mapped into `CategoryGuideRow` (pre-formatted date
  strings so hydration never disagrees on time zones), then the client
  `CategoryGuideList` renders the search box and the list. Its header shows
  the name, an article count, and a `TopBar` with breadcrumbs.
- **`CategoryGuideList`** (`src/components/category-guide-list.tsx`) is the
  find-as-you-type list: `useState` query, `filterGuides` from
  `src/lib/category-list.ts` (title or tag substring match), Escape clears,
  Enter is swallowed, "N of M" counter, "No articles match" empty state. Each
  row is a `Link` with an `AudienceIcon`, title, Draft badge, and a muted
  created / updated-by line. Placeholder and `aria-label` are
  "Search this category". Tested with `renderToStaticMarkup`
  (`category-guide-list.test.tsx`).
- **Sidebar.** `AppSidebar` (server, `src/components/shell/app-sidebar.tsx`)
  loads `visibleArticleCountsBySpace(access)` and the category rows, and
  renders a "Departments" `MicroLabel` followed by the client `SidebarNav`
  (`sidebar-nav.tsx`). `SidebarNav` renders the "Show empty" `Switch` first
  and then one row per shown space: a chevron button, a `Link` with the
  name, and a count `Badge` (`size="sm" onDark`, tone `muted` when 0,
  `brand` when active, `neutral` otherwise). The active space is detected by
  `usePathname()` matching `/^\/spaces\/([^/]+)/`.
- **Guide page** (`.../guides/[guideSlug]/page.tsx`) has two places an
  action can live: the `TopBar` `actions` slot (holds "Edit guide" for
  editors) and the metadata row under the title, whose right end is the
  `GuideActions` split button ("Copy link" plus a menu). `GuideActions` is a
  client component with no server-action dependency today.
- **Server actions** for the `(kb)` area live in `src/app/(kb)/actions.ts`
  (currently only `setShowEmptyDepartments`) and
  `src/app/(kb)/spaces/actions.ts` (guide and category writes). Pages read
  the session per request, so they are dynamic; writes that must show up
  elsewhere call `revalidatePath` explicitly.
- **Icons** are hand-drawn stroke SVGs in `src/components/icons.tsx` via
  `base(size, className)`. There is no star icon yet.
- **Migrations**: edit `src/db/content-schema.ts`, then
  `npx drizzle-kit generate` and `npx drizzle-kit migrate`; every Vercel
  build runs the migration itself. Migration files are named
  `NNNN_kebab-name.sql` under `drizzle/`.
- **MCP server** (`src/lib/mcp/`) exposes search and read tools; it is out
  of scope here but is noted under "Out of scope" as an obvious follow-up.

## Design

### 1. Data: one `guide_favorite` table

```ts
// src/db/content-schema.ts
export const guideFavorite = pgTable(
  "guide_favorite",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    guideId: uuid("guide_id")
      .notNull()
      .references(() => guide.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.guideId] }),
    // The favorites page reads one user's rows; the guide page checks one pair.
    index("guide_favorite_user_idx").on(t.userId),
  ],
);
```

- The composite primary key makes "star" idempotent
  (`insert … onConflictDoNothing`) and "unstar" a keyed delete.
- Cascade on both foreign keys: an approved deletion removes the guide and
  its favorite rows; a removed user takes their favorites with them.
- `created_at` is kept so a "recently favorited" order is possible later
  without a migration. Default order on the page is alphabetical by title,
  matching the category page.
- No column for the space: it is derived from `guide.space_id` at read time,
  so a moved guide stays favorited and simply shows its new department.
- Generated migration: `drizzle/0013_guide-favorite.sql`.

### 2. Pure helpers: `src/lib/favorites.ts`

Kept free of React and server imports so vitest covers them:

- `FAVORITES_PATH = "/favorites"`.
- `favoriteLabel(isFavorite: boolean)` returns "Remove from favorites" /
  "Add to favorites" for the button's `aria-label` and title.
- `favoritesFilterPlaceholder = "Search your favorites"`.

Server-side reads go in `src/lib/favorites.server.ts` (`import "server-only"`):

- `isFavorite(userId, guideId): Promise<boolean>`: one keyed select.
- `favoriteCount(userId, access): Promise<number>`: count of the user's
  favorite rows inner-joined to `guide` with `visibleGuidesWhere(access)`,
  so the sidebar pill only counts guides the person can still open. Wrapped
  in React `cache()` like `visibleArticleCountsBySpace` so the sidebar and
  any page that needs it share one query per request.
- `listFavorites(userId, access)`: the favorites page query (see §4).

### 3. Toggle: server action plus a client star button

**Server action** `toggleFavorite(guideId: string, next: boolean)` in
`src/app/(kb)/actions.ts` (the file already holds the sidebar preference
action; favorites are per-user preferences of the same kind):

1. `const access = await requireAccess()`.
2. Confirm the guide exists and the caller may read it: select `guide.id`
   where `eq(guide.id, guideId)` and `visibleGuidesWhere(access)`. If no row,
   throw a plain `Error("Guide not found")`. This stops a crafted request
   from favoriting a guide the person cannot see, and stops a favorite from
   being created for a deleted guide during the window before hard delete.
3. `next === true`: insert `{ userId, guideId }` with `onConflictDoNothing()`.
   `next === false`: delete where both keys match.
4. `revalidatePath(FAVORITES_PATH)` and `revalidatePath("/", "layout")` so
   the sidebar's count pill and the favorites page re-render on the next
   navigation. The guide page itself does not need revalidating: the
   button's state is optimistic and the page is dynamic anyway.
5. Return `{ isFavorite: next }` so the client can reconcile.

**Client component** `FavoriteButton` in `src/components/favorite-button.tsx`:

- Props: `guideId`, `initialIsFavorite`, optional `size` (`"sm"` for the
  metadata row).
- `useOptimistic`-style local state: flip immediately on click, call the
  action inside `startTransition`, and on failure revert and show a small
  inline error the way `GuideActions` shows its export error.
- Renders a `<button type="button" aria-pressed={isFavorite}
  aria-label={favoriteLabel(isFavorite)} title=…>` containing `StarIcon`.
  The button's `aria-pressed` is the accessible state; the visual state is
  the icon fill.
- Class names follow `buttonClasses({ variant: "secondary", size: "sm" })`
  so it sits level with "Copy link"; when favorited, the icon gets
  `fill-current text-accent` (filled), otherwise `fill-none` (outline).
- `print:hidden`, like every other control on the guide page.

**Icon**: `StarIcon` in `icons.tsx`, a five-point star drawn with the same
stroke conventions as the others. It takes an extra `filled?: boolean` prop
that switches `fill` between `currentColor` and `none`, so one glyph serves
both states and the outline never shifts on toggle.

**Placement on the guide page**: at the left end of the metadata row's
right-hand cluster, immediately before the `GuideActions` split button, so
the three quick actions (star, copy link, more) read as one group. It is
rendered for everyone who can read the guide, including admins previewing a
guide pending deletion (they can read it, and `toggleFavorite` re-checks
visibility server-side, so a star there is harmless; it disappears with the
guide). See open question 1 for the alternative placement in the `TopBar`.

**Star on list rows** (category page, space cards, favorites page): open
question 2. The plan's default is *no* star on rows in v1. A star inside a
row that is itself a `Link` needs a nested interactive element, which the
current row markup does not support without restructuring; the favorites
page gets a per-row "remove" star instead (see §4), where it is the whole
point of the page.

### 4. The `/favorites` page

New route `src/app/(kb)/favorites/page.tsx`, a sibling of `search`.

- `requireAccess()` and `getSession()` as on every `(kb)` page.
- **Query** (`listFavorites` in `favorites.server.ts`): start from
  `guideFavorite` where `eq(userId)`, inner join `guide` on id with
  `visibleGuidesWhere(access)`, inner join `space` for `slug` and `name`,
  left join `category` for `name` and `slug` (null means General), and the
  same creator / revision-author joins the category page uses. Order by
  `asc(guide.title)`. Then the tag query grouped in JS, exactly as the
  category page does. A favorite whose guide the person can no longer read
  (audience narrowed, moved to a department they are not in, archived, or
  awaiting deletion) is simply absent from the list; the row is left in the
  table so the favorite comes back if the guide becomes visible again.
- **Rows** extend `CategoryGuideRow` with `spaceName`, `spaceSlug`, and
  `categoryName`. `href` is `guidePath(spaceSlug, guideSlug)`.
- **Header**: `TopBar` crumbs `[App, "Favorites"]`; `h1` "Favorites"; the
  same "N articles" counter on the right. No `actions` (nothing to create
  here).
- **Empty state** when the person has no visible favorites: reuse the
  centered notice pattern from the category page (`CategoryNotice` is local
  to that file today; lift it into `src/components/page-notice.tsx` and use
  it from both). Title **No Favorites Yet**, text "Open any guide and click
  the star to keep it here.", button "Browse departments" → `/`.
- **List**: `CategoryGuideList` gains two optional props so the favorites
  page can reuse it rather than fork it:
  - `placeholder?: string` (defaults to "Search this category"; the
    favorites page passes "Search your favorites"). The `aria-label` follows
    the placeholder.
  - `showDepartment?: boolean`. When set, each row renders a department
    cell between the title and the dates: the space name as a `Badge
    tone="brand"` (the same badge the guide page shows above its title), with
    the category name after it in muted text. On narrow screens it wraps to
    the second line with the dates, on `sm+` it sits inline. Because rows
    are a flex layout rather than a `<table>`, "column" means a consistent
    fixed-width slot (`sm:w-[180px] truncate`) so department names line up
    down the list.
  - The search box also matches the department name when `showDepartment`
    is on, so typing "Facilities" narrows to that department's favorites.
    `filterGuides` takes an optional `extraFields: (g) => string[]` argument
    (or the favorites page passes rows whose `tags` already include the
    space name; recommendation: the explicit argument, so the tag list
    stays honest). Unit test the new branch in `category-list.test.ts`.
  - `onUnfavorite?: (guideId: string) => void` renders a filled star at the
    far right of each row (outside the `Link`, so the row markup changes
    from a single `Link` to a `div` holding the `Link` plus the button).
    Clicking it calls `toggleFavorite(id, false)` and removes the row
    optimistically; the "N articles" count in the header updates with it
    (lift the count into the client component, or pass `guides.length` and
    let the client component own the visible count). If the action fails,
    the row returns and an inline error is shown.

### 5. Sidebar entry

In `SidebarNav`, directly after the "Show empty" `Switch` and before the
`shown.map(...)` rows, render a **Favorites row** built from the same
classes as a department row so it looks identical at a glance:

- Left slot: instead of the chevron button, a `StarIcon` (filled, `text-accent`)
  of the same width (`h-9 w-8`) so the name column lines up with the
  department names below.
- Middle: `Link` to `/favorites` with the label "Favorites".
- Right: the count `Badge`, same tones as department rows (`muted` at 0,
  `brand` when the favorites page is active, `neutral` otherwise).
- Active state: `pathname === FAVORITES_PATH`, using the same
  `bg-accent/15` wash as an active department.
- It has no categories, so no expand/collapse; the accordion state map is
  untouched.
- It is always shown, regardless of the "Show empty" switch and even when
  the count is 0, because it is the discoverable entry point for the
  feature (a hidden row at 0 would mean nobody ever finds it).
- `AppSidebar` loads the count via `favoriteCount(access.userId, access)`
  in its existing `Promise.all` and passes `favoriteCount` to `SidebarNav`
  as a new prop. `SidebarSpace` is unchanged.
- The "Departments" `MicroLabel` stays where it is (above the switch), so the
  Favorites row reads as the first item under that heading, which is what
  "looks like a department" asks for. Open question 3 covers an alternative.
- Update `sidebar-shell.test.tsx` or add `sidebar-nav.test.tsx` with a
  `renderToStaticMarkup` check that the Favorites link appears before the
  first department, carries the count, and is present when the count is 0.

### 6. Behaviour on guide lifecycle events

- **Move / re-slug**: nothing to do. Favorites key on `guide.id`; the
  favorites page derives the URL and department at read time.
- **Category rename or delete**: nothing to do; category is read live.
- **Archive**: `visibleGuidesWhere` still shows archived guides to those
  who could see them (only `deleted` is excluded), so an archived favorite
  keeps showing. Its status badge on the row already says so.
- **Deletion request** (status `deleted`): hidden from the favorites list
  by `visibleGuidesWhere`; if the request is rejected the guide and the
  favorite reappear; if approved the cascade removes the row.
- **User leaves a department**: guides they can no longer read drop out of
  the list and the count; rows remain in case access returns.

### Out of scope

- Favorites in the MCP server (a `list_favorites` tool or a
  `favorites: true` filter on search). Easy follow-up once the table exists.
- Favorite categories or departments. Only guides.
- Ordering options on the favorites page (recent first, manual drag order).
  `created_at` is stored so "recent first" can be added without a migration.
- A star on category-page and space-card rows (open question 2 decides
  whether this stays out).
- Showing who favorited a guide, or favorite counts to owners/admins.

## Steps

1. Branch `feat/favorites` off `main`.
2. Schema: add `guideFavorite` to `src/db/content-schema.ts`;
   `npx drizzle-kit generate` (name the migration `guide-favorite`) and
   `npx drizzle-kit migrate` against the `development` branch.
3. `src/lib/favorites.ts` (constants, `favoriteLabel`) with
   `favorites.test.ts`; `src/lib/favorites.server.ts` (`isFavorite`,
   `favoriteCount`, `listFavorites`).
4. `icons.tsx`: `StarIcon` with `filled` prop.
5. `toggleFavorite` server action in `src/app/(kb)/actions.ts`, including
   the visibility check.
6. `favorite-button.tsx` client component with optimistic toggle and error
   state; `favorite-button.test.tsx` asserting `aria-pressed`, the two
   labels, and the filled/outline class per state.
7. Guide page: load `isFavorite` alongside the other per-guide reads and
   render `FavoriteButton` before `GuideActions`.
8. `category-list.ts`: extend `filterGuides` with the extra-fields hook and
   test it. `category-guide-list.tsx`: add `placeholder`, `showDepartment`,
   and `onUnfavorite` props; restructure the row to allow the trailing
   button; extend `category-guide-list.test.tsx` for the department cell
   and the placeholder override; confirm the category page renders
   unchanged (existing test still passes).
9. Lift `CategoryNotice` to `src/components/page-notice.tsx`; update the
   category page to import it.
10. `src/app/(kb)/favorites/page.tsx` (§4), including the empty state.
11. Sidebar (§5): `AppSidebar` loads the count; `SidebarNav` renders the
    Favorites row; add the sidebar-nav test.
12. Local verification against the Neon `development` branch: `npm run
    lint`, `npx tsc --noEmit`, `npm test`, `npm run build`; then
    `npm run dev`: star a guide and confirm the icon fills without a reload,
    confirm the sidebar pill increments after navigating, open `/favorites`
    and check the department column, filter by a title fragment, by a tag,
    and by a department name, unstar from the row and confirm it leaves the
    list and the count drops, unstar from the guide page and confirm the
    outline returns, check the empty state with no favorites, and confirm a
    guide that is moved to another department shows its new department on
    the favorites page.
13. Commit on the feature branch. (No push. Chris tests and asks.)

## Open questions

1. **Where does the star live on the guide page?** Recommendation: in the
   metadata row beside "Copy link", so every reader sees it at the same
   spot regardless of whether they can edit (the `TopBar` actions slot is
   empty for readers, so a lone star there would float). Alternative: the
   `TopBar` actions slot, always present, before "Edit guide".
   Answer: to the left of the "Copy Link" split button.
2. **Stars on list rows?** The category page, space-page cards, search
   results and the home feed all list guides. Recommendation for v1: no
   star on those rows; star from the guide page only, and unstar from either
   the guide page or the favorites page row. Adding a star to every row means
   restructuring each list's row markup (the rows are single `Link`s) and
   loading favorite state into each list query. If wanted, it is a natural
   second plan.
   Answer: no stars on those rows
3. **Sidebar heading.** The request puts Favorites under the "Show empty"
   switch, inside the Departments section, styled like a department.
   Recommendation: do exactly that (§5). Alternative: give it its own
   one-line section above "Departments" with no heading, which separates it
   from the switch but stops it looking like a department.
   Answer: go with recommendation
4. **Count pill on the Favorites row: which guides count?** Recommendation:
   favorites the person can currently read (same rule as department pills,
   which count published readable guides). Alternative: every stored favorite,
   which can exceed the number of rows on the page. Note that department
   pills count *published* guides only, whereas the favorites page lists
   drafts the person can see too; recommendation is to count what the page
   shows, so the pill and the page header always match.
   Answer: go with recommendation.
5. **Should unstarring from the favorites page ask for confirmation?**
   Recommendation: no. It is one click to undo from the guide page, and the
   row disappears with the count updating, which is feedback enough.
   Answer: no.
