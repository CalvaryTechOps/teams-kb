# Plan: Category pages, truncated category cards, and audience icons

**Status: complete — implemented on `feat/category-pages` (2026-09-08),
tested by Chris locally and on staging, merged to `main` via PR #15 and
live in production.**
Verified before the push: lint, typecheck, tests and build pass; the category page's join
(current-revision author, creator fallback, tags) was run against the
`development` DB branch for a real category and for General. Signed-in UI
paths need SAML SSO and were not clicked through; the dev DB also holds too
few guides to see a card truncate, which the `mostRecent` unit test covers.

## Problem

A category is only a card on its department's space page
(`src/app/(kb)/spaces/[slug]/page.tsx`). The card lists every visible guide
in the category alphabetically, so a busy category makes the space page very
long, and there is nowhere to see a category on its own, scan when guides
were created or last touched, or narrow the list without leaving for the
global search. The category name is plain text, the sidebar and the guide
page's breadcrumb refer to a category but nothing is clickable, and the list
rows give no hint of who a guide is shared with.

What exists and matters here:

- **Routes under a space** (`src/app/(kb)/spaces/[slug]/`): `new`, `queue`,
  `guides/[guideSlug]` (+ `edit`, `move`), and
  `categories/[categorySlug]/move` (admin-only move page). Pages use the
  `PageProps<"/spaces/[slug]/…">` helper type, `TopBar` with a `crumbs`
  array (`src/components/shell/top-bar.tsx`), `requireAccess()`, and
  `visibleGuidesWhere(access)` to filter guides.
- **Space page** builds `sections` from `category` rows plus a synthetic
  "General" card for uncategorized guides (`GENERAL_CATEGORY_SLUG`,
  `src/lib/categories.ts`). Cards use the category slug as the anchor id
  (`id={sec.key}`); the sidebar (`sidebar-nav.tsx`) deep-links to
  `/spaces/{slug}#{catSlug}`. Card rows link to the guide and show a
  `Draft` badge for unpublished guides.
- **Guide row data**: `guide.audience` is `department | groups | all_staff`;
  `guide_audience_group` holds the extra teams when `groups`. `guide` has
  `created_by`, `created_at`, `updated_at` (`$onUpdate`, bumps on any row
  write) and `current_revision_id`; `guide_revision.author_id` records who
  wrote each revision. There is no `updated_by` column. Tags come from
  `guide_tag` → `tag(name, slug)`.
- **Filter-as-you-type** already exists client-side:
  `FilterableList` (`src/components/filterable-list.tsx`) over the pure
  `filterByLabel` helper (`src/lib/filter-list.ts`, unit-tested). The
  global search box is `type="search"` with `placeholder="Search articles"`
  (`app-sidebar.tsx`, `search/page.tsx`).
- **Icons** are hand-drawn stroke SVGs in `src/components/icons.tsx`
  (`base(size, className)`); there is no group or globe icon yet.
- **Breadcrumbs** today: guide page `[App, Space, Category (no href), Title]`;
  edit/move pages `[App, Space, Title, Edit|Move]`; category move page's
  category crumb points at the space-page anchor.
- **Related plan**: `edit-categories` (rename with optional re-slug, delete
  empty). Its "create new links" rename option and `moveCategory`'s merge
  (`moveCategoryInTx`, `src/lib/moves.ts`) both retire a slug — exactly the
  bookmark case this plan's not-found state covers.

## Design

### 1. Category page

New route (see open question 1 for the URL):
`src/app/(kb)/spaces/[slug]/categories/[categorySlug]/page.tsx`.

Server component, same access pattern as the space page:
`requireAccess()` → load space by slug (`notFound()` if missing) → load the
category by `(space_id, slug)`. `categorySlug === GENERAL_CATEGORY_SLUG`
means "guides with no category", mirroring the move page.

- **Category missing** (renamed with new slug, merged, deleted, typo):
  render the page with a `TopBar` (`[App, Space, "Category not found"]`)
  and a centered notice: heading **Category Not Found**, text
  "Please update your bookmarks.", and a `ButtonLink` "Back to {space
  name}" → `/spaces/{slug}`. Rendered inline (not `notFound()`), because a
  segment `not-found.tsx` cannot read `params` to build the back link.
  A `general` slug never hits this branch.
- **Guides**: one query on `guide` with `eq(spaceId)`, the category filter
  (`eq(categoryId)` or `isNull`), and `visibleGuidesWhere(access)`,
  selecting `id, slug, title, status, audience, createdAt, updatedAt`
  plus the last editor via `leftJoin(guideRevision,
  eq(guideRevision.id, guide.currentRevisionId))` →
  `leftJoin(user, eq(user.id, guideRevision.authorId))`. For a never-
  published draft (`currentRevisionId` null) fall back to `guide.createdBy`'s
  name via a second `leftJoin` on `user` aliased. Then one query for tags
  (`guideTag` ⨝ `tag` where `inArray(guideId, ids)`) grouped in JS. Skip
  the tag query when there are no guides.
  - *Last updated* = `guide.updatedAt` (the same field the cards sort by).
  - *Last changed by* = author of the current revision, i.e. the same name
    the guide page shows next to "Updated". Adding an `updated_by` column
    is deliberately out of scope; note it as a follow-up if this proves
    misleading (e.g. an admin category move bumps `updated_at` without a
    new revision).
- **Header**: `TopBar` crumbs `[App, Space → /spaces/{slug}, Category]`;
  actions = "New guide" for `perms.canEdit` (same gate as the space page).
  `h1` = category name; right-aligned count "N articles" like the space
  page header.
- **List**: a new client component `CategoryGuideList`
  (`src/components/category-guide-list.tsx`) receives the serialized rows
  (dates as ISO strings or epoch ms — server → client props must be
  serializable) and owns the query state. Rows are a single-column list
  styled like the card rows (border-top, `py-2.5`), each row:
  `[AudienceIcon] Title [Draft badge]  ·  Created {date}  ·  Updated {date}
  by {name}`; dates as `Mon D, YYYY` (the guide page's format), with the
  full timestamp in a `title` attribute. Default order: open question 3.
  Tags are matched but not displayed (open question 4).
- **Search box** sits above the list, styled like the `/search` page box
  (rounded-xl, `SearchIcon`, `type="search"`) at the card-row scale, with
  `placeholder="Search this category"` and `aria-label` to match. Filtering
  is pure client work — the list is already fully loaded — using a new pure
  helper `filterGuides(rows, query)` in `src/lib/category-list.ts`:
  case-insensitive substring match on the title **or any tag name**, empty
  query keeps all. Enter is swallowed and Escape clears (same as
  `FilterableList`); non-matching rows unmount (they "hide"). Empty states:
  "No articles match “x”." while filtering; "Nothing here yet." when the
  category is empty. `FilterableList` itself is not reused because its
  single-label matcher and grey filter-box styling don't fit; the pure
  helper pattern (`filter-list.ts`) is.

### 2. Space page cards

- Category **name becomes a `Link`** to the category page (also for
  General). Keep the admin move icon beside it.
- Rows are sorted by `updatedAt` desc and **sliced to 5** via a pure
  `mostRecent(guides, 5)` helper in `src/lib/category-list.ts`. The header
  count stays the full count.
- When the category holds more than 5 visible guides, a right-aligned
  **"more…"** link (text-xs, cyan) at the bottom of the card goes to the
  category page (open question 2 on always-vs-overflow).
- Each row gets the **audience icon** to the left of the title (see §3);
  rows keep the `Draft` badge.
- Anchors (`id={sec.key}`) stay so existing `#slug` links still land.

### 3. Audience icon

New `AudienceIcon` component (`src/components/audience-icon.tsx`) mapping
`guide.audience` to three new icons in `icons.tsx`, all 14px in list rows,
`text-grey-400`:

| audience     | icon                                   | `title` / `aria-label`      |
| ------------ | -------------------------------------- | --------------------------- |
| `department` | `UsersIcon` (two-person group)         | "Shared with this team"     |
| `groups`     | `UsersPlusIcon` (same, `+` top-right)  | "Shared with other teams"   |
| `all_staff`  | `GlobeIcon`                            | "Shared with all staff"     |

Pure mapping `audienceLabel(audience)` lives in `src/lib/category-list.ts`
so it is unit-testable and shared by the card rows and the category page.
The icon is decorative-plus-tooltip: `aria-label` on the wrapper so screen
readers hear the audience once.

### 4. Breadcrumbs and links

- Guide page: category crumb gains `href` to the category page. Uncategorized
  guides get a "General" crumb linking to the `general` page (today they
  have no category crumb). Requires selecting `category.slug` alongside
  `categoryName` in the page's guide query.
- Guide edit and move pages: insert the same category crumb between Space
  and Title, for consistency.
- Category move page: the category crumb's `href` and the form's
  `cancelHref` (`back`) point at the category page instead of the anchor.
- Sidebar category links: open question 5.
- `revalidateMove` (`src/lib/moves.ts`) and any `revalidatePath` on guide
  writes: audit and add the category paths only if the pages turn out to be
  cached; they read the session per request so are dynamic and should need
  nothing — confirm during implementation.

### Out of scope

- Renaming, deleting, reordering categories (`edit-categories` plan).
- Server-side or full-text search inside a category; the box filters the
  loaded list only.
- An `updated_by` column on `guide`.

## Steps

1. Branch `feat/category-pages` off `main`.
2. `src/lib/category-list.ts`: `filterGuides`, `mostRecent`, `audienceLabel`
   + `category-list.test.ts` (title match, tag match, case-insensitivity,
   empty query, slice/sort, label mapping).
3. `icons.tsx`: `UsersIcon`, `UsersPlusIcon`, `GlobeIcon`;
   `audience-icon.tsx`.
4. `category-guide-list.tsx` client component + a `renderToStaticMarkup`
   test asserting the placeholder text, row count, and audience labels.
5. Category page route (§1), including the not-found notice.
6. Space page (§2): clickable name, recency sort + slice, "more…", icons.
7. Breadcrumb updates (§4) on guide, edit, move, and category-move pages.
8. Local verification against the Neon `development` branch: `npm run
   lint`, `npx tsc --noEmit`, `npm test`, `npm run build`; then `npm run
   dev`: open a category from a card title and from a breadcrumb, filter by
   a title fragment and by a tag name, confirm Escape clears, open the
   `general` page, visit a made-up category slug and take the "Back to"
   link, check a category with >5 guides shows five plus "more…" and one
   with ≤5 shows no link, and eyeball all three audience icons.
9. Commit on the feature branch. (No push — Chris tests and asks.)

## Open questions

1. **URL.** The request says `/spaces/<space slug>/<category slug>`. A
   dynamic segment directly under `[slug]` would sit beside the static
   segments `new`, `queue`, `guides`, and `categories`; Next routes those
   names to the static pages first, so a category whose slug is one of them
   could never be opened, and any future top-level page under a space
   reserves another word. The existing admin move page already lives at
   `/spaces/<space>/categories/<category>/move`. Recommendation: put the
   page at `/spaces/<space>/categories/<category>` so the move page becomes
   its child and no slugs are reserved. If the shorter URL is preferred, the
   plan adds a reserved-slug check to `createCategory` (and to the
   `edit-categories` rename) for those four words.j
   Answer: use the `/spaces/<space>/categories/<category>` methodology already in use for the admin pages.
2. **"more…" visibility.** Only when the category has more than 5 visible
   guides (recommended: a "more…" with nothing more behind it misleads), or
   always, as a second route to the page (the title is already a link)?
   Answer: only when the category has more than 5 visibible guides
3. **Default order on the category page.** Alphabetical by title
   (recommended for a browsing list whose dates are visible in each row) or
   most recently updated first, matching the cards?
   Answer: alphabetical by title
4. **Show tags on the rows?** They are matched by the search box but the
   requested columns are created / updated / by. Recommendation: don't show
   them in v1; if a filtered row's match isn't obvious, add them as small
   muted badges later.j
   Answer: don't show in v1
5. **Sidebar category links.** Today they jump to the card anchor on the
   space page. With cards truncated to five, should they open the category
   page instead? Recommendation: yes, it is what "click a category" now
   means everywhere else.
   Answer: yes, jump straight to the category page, also include a "general" link in the sidebar for each department.  The general category may be empty for new departments, which is fine, the error should be "No General Guides" and a link to return to the department.
6. **Audience icons on the space-page cards too**, or only on the category
   page? The request lists them after the card changes; recommendation:
   both, from the one `AudienceIcon` component, so the two lists read the
   same.
   Answer: both
