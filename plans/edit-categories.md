# Plan: An "Edit category" page — rename, move, delete in one place

**Status: implemented on `feat/edit-categories` (2026-09-09), awaiting
Chris's local testing.** Requested 2026-08-31; rewritten 2026-09-09 after
the category pages (PR #15) and the admin move tooling (handle-orphaned-
spaces) shipped. All open questions below are answered. Lint, typecheck,
tests and build pass; the signed-in UI paths need SAML SSO and were not
clicked through here.

Implementation notes (where the design landed):

- Edit page: `src/app/(kb)/spaces/[slug]/categories/[categorySlug]/edit/page.tsx`;
  the `move/` route is gone. Actions `renameCategory` and `deleteCategory`
  in `src/app/(kb)/spaces/actions.ts`; `deleteCategoryIfEmpty` in
  `src/lib/moves.ts`; the conflict rule in `src/lib/category-rename.ts`;
  the rename form in `src/components/category-name-form.tsx`.
- The reserved "General" name is refused whether or not the address
  changes (a real category displayed as "General" beside the synthetic
  card would be ambiguous), matching `createCategory`.
- The General card keeps the folder-move icon (admin-only, only when it has
  guides) because its page only moves; every real category gets the pencil.
- `moveCategory` now redirects to the category's page in the target space,
  and a bad target bounces to the edit page.

To implement, ask Claude to "execute the edit-categories plan".

## Problem

Categories can be created (`createCategory`, `src/app/(kb)/spaces/actions.ts`)
and, by admins, moved to another department — but never renamed or deleted.
A typo'd or outdated name is permanent, and an unused category sits on the
space page forever showing "Nothing here yet." Space owners should be able
to rename a category and delete an empty one — the same people who can
create them today (`spacePermissions(...).canApprove`: owners and admins).

The first version of this plan put a pencil on each space-page card that
swapped the title for an inline form, with a modal on submit for the link
choice and a flip-to-confirm delete. Two things shipped since that make
that shape wrong:

- **Categories have real pages** (`/spaces/{space}/categories/{category}`,
  `src/app/(kb)/spaces/[slug]/categories/[categorySlug]/page.tsx`). The
  sidebar, breadcrumbs and card titles all link there; the MCP server
  accepts category slugs as input (`src/lib/mcp/tools.ts`). A slug is now
  a URL, not a card anchor. The category page already renders the
  **Category Not Found / Please update your bookmarks** notice designed for
  a retired slug.
- **Admins already have a per-category page**: the move page at
  `.../categories/{category}/move`, reached from a folder icon beside each
  card title (`FolderMoveIcon`, admin-only). Adding a second icon for a
  second inline widget gives one entity two management surfaces.

Everything else in the app manages an entity on a dedicated page with one
independent form per operation: the guide edit page and its
`GuideDangerZone`, the two move pages (`MoveForm`), and the per-row
re-home / merge / delete forms on `/admin/spaces` (`ConfirmForm`). This
plan follows that pattern.

What exists and matters here:

- `category`: `id, space_id, name, slug, sort_order, created_at`, unique on
  `(space_id, slug)` (`src/db/content-schema.ts`).
- `guide.category_id` → category with **`onDelete: "set null"`** — a raw
  delete of a non-empty category would silently re-home its guides to
  General. The action must enforce emptiness itself.
- `GENERAL_CATEGORY_SLUG` (`src/lib/categories.ts`) is reserved:
  `createCategory` refuses it; the category and move pages treat it as
  "guides with no category".
- Move primitives and `revalidateMove` live in `src/lib/moves.ts`;
  `deleteSpaceIfEmpty` there is the single-statement `not exists` pattern
  the delete action should copy. `withTransaction` (`src/db/transaction.ts`)
  is the WebSocket transaction wrapper; the default `db` handle is HTTP and
  has no transactions.
- `moveCategory` / `moveGeneralGuides` (admin-only) and the helpers
  `targetSpaceOrNull`, `categoryInSpaceOrNull` already exist in
  `actions.ts` and stay unchanged.
- `slugify` (`src/lib/slug.ts`) is how a category name becomes a slug.

## Design

### 1. One page: `/spaces/[slug]/categories/[categorySlug]/edit`

New route `src/app/(kb)/spaces/[slug]/categories/[categorySlug]/edit/page.tsx`
that **absorbs the move page**. The `move/` route is deleted; its only
entry point is the card icon, which now points here.

Access: `requireAccess()` → load space (404) → gate on
`spacePermissions(access, s.groupId).canApprove`, redirecting non-owners to
the category page. Load the category by `(space_id, slug)`; 404 if missing.
`categorySlug === GENERAL_CATEGORY_SLUG` is allowed (see §1d).

TopBar crumbs: App › Space › Category (href: category page) › Edit.
Heading `Edit “{name}”`. Below it, independent sections, **each its own
`<form>`** so no submit touches another section's fields:

#### 1a. Name (owners and admins)

- Text input prefilled with the current name, **Save** and **Cancel**
  (`ButtonLink` back to the category page).
- A small client component (`CategoryNameForm`, `src/components/`) watches
  the input. When `slugify(value)` differs from the current slug it reveals
  a radio group **Web address**:
  - **Keep the current address** `/categories/{current-slug}` — existing
    links and bookmarks keep working (default).
  - **Change it to** `/categories/{new-slug}` — old links will show
    "Category not found".
  When the slug would not change, the radios stay hidden and the form
  submits `keep`. This replaces the first version's three-button modal:
  same warning, same choice, no dialog; Cancel is the page's Cancel.
- Server action **`renameCategory(ref: CategoryRef, formData)`**: fields
  `name`, `address` (`keep` | `change`). Trim; empty or unchanged name is a
  no-op redirect. Verify the category belongs to the space (never trust the
  UI's ids). Then:
  - Compute `candidate = slugify(name)`. **Block** the rename when any
    *other* category in the space has `slug === candidate` or
    `slugify(other.name) === candidate` — this is the duplicate-name rule
    from question 2 and it also protects the unique index when re-slugging.
    Refuse `candidate === GENERAL_CATEGORY_SLUG` when changing the address
    (mirrors `createCategory`). Blocked renames redirect back to the edit
    page with `?error=duplicate` (or `reserved`), which the page renders as
    a one-line notice above the form — the house style has no toast.
  - `address === change` → update `name` and `slug`; `keep` → update `name`
    only.
  - Revalidate via `revalidateMove({ spaceSlugs: [s.slug] })` plus the
    category page(s) — old and new slug. Every guide page in the category
    shows the name in its breadcrumb, but those pages read the session per
    request and are dynamic; confirm during implementation and add
    `guidePaths` only if a stale crumb is actually observed.
  - Redirect to the category page at its (possibly new) slug.

#### 1b. Move to another department (admins only)

The existing move-page UI, moved here as a section: `MoveForm` with the
department picker (current space excluded), the audience note, and
`moveCategory.bind(null, ref)`. Rendered only when `access.isAdmin`; owners
see nothing here (plan handle-orphaned-spaces Q10: handing content to
another department needs the other department's consent, so it stays an
admin decision). `moveCategory` is unchanged except its post-move redirect,
which should go to the category's page in the target space rather than a
card anchor (`categoryPath(target.slug, cat.slug)`).

#### 1c. Delete (owners and admins)

Rendered **only when the category has no guides in any status** — drafts,
archived and deletion-pending included, since `set null` would quietly
re-home them. A `ConfirmForm` with message
`Delete the empty category “{name}”? Its address will stop working.` and a
`Button variant="danger"` "Delete category". When guides exist the section
instead says "Move or re-file the guides below before deleting this
category" — the list in §1e makes the reason visible.

Server action **`deleteCategory(ref, formData)`**: permission check as
above, then `deleteCategoryIfEmpty(db, categoryId, spaceId)` — a new
primitive next to `deleteSpaceIfEmpty` in `src/lib/moves.ts`:
`delete from category where id = $1 and space_id = $2 and not exists
(select 1 from guide where category_id = category.id) returning id`. One
statement, so a guide filed between render and click keeps the category.
Revalidate the space and the category page; redirect to the space page.
A non-empty category is simply not deleted and the redirect lands on the
edit page again, now showing the guide.

#### 1d. The General card

General cannot be renamed or deleted (it isn't a row). Its edit page shows
only §1b, as "Move all General guides" with the category picker
(`withCategory`) and `moveGeneralGuides`, exactly as the move page does
today, and redirects to the space page when there is nothing uncategorized.
Owners never get an icon on the General card; the page redirects them too.

#### 1e. Guides in this category

The read-only list the move page shows today (title, Draft / Pending
deletion badge, updated ago), for every status — owners and admins see
everything in their space. It sits under the forms.

### 2. Entry points

- **Space page card header** (`src/app/(kb)/spaces/[slug]/page.tsx`):
  replace the admin `FolderMoveIcon` link with one **`PencilIcon` link**
  right of the title, `aria-label="Edit {name}"`, gated on
  `perms.canApprove`. On the General card the icon stays admin-only and
  only when the card has guides (it leads to "Move all General guides").
- **Category page TopBar** (`categories/[categorySlug]/page.tsx`): an
  "Edit category" secondary `ButtonLink` beside "New guide" for
  `canApprove` users (`canEdit` there is broader — use the approve check).
  Not on the General page for non-admins.
- **Move page route** removed. Nothing else links to it
  (`/admin/spaces` links to the space page, not to move pages).

### 3. Out of scope (deliberately)

- Reordering (`sort_order` exists but has no UI). This page is its natural
  future home; not built now.
- Deleting a non-empty category with a "move guides to…" picker. Owners
  re-file via the guide form or "Move guide"; admins can move the category.
- Merging two categories in the same space.
- Any change to the MCP surface. A re-slugged category makes an MCP
  client's saved slug stale; `create_draft` and `list_guides` already
  return a clear "no category with slug" error, which is enough.

## Steps

1. Branch `feat/edit-categories` off `main`.
2. `src/lib/moves.ts`: `deleteCategoryIfEmpty`; `src/lib/categories.ts`:
   `categoryEditPath(spaceSlug, categorySlug)`.
3. `src/lib/category-rename.ts`: pure `renameConflict(candidateSlug,
   others: {slug, name}[]) → "duplicate" | "reserved" | null` +
   `category-rename.test.ts` (same slug, same slugified name, case and
   punctuation variants, reserved `general`, no conflict, self excluded).
4. `actions.ts`: `renameCategory`, `deleteCategory`; redirect change in
   `moveCategory`.
5. `src/components/category-name-form.tsx` (client) + a
   `renderToStaticMarkup` test asserting the radios are absent when the
   name's slug matches and present, defaulting to keep, when it differs.
6. Edit page route (§1), including the General branch and the `?error`
   notice. Delete the `move/` route.
7. Entry points (§2): card pencil, category page button.
8. Local verification against the Neon `development` branch: `npm run
   lint`, `npx tsc --noEmit`, `npm test`, `npm run build`; then `npm run
   dev` and walk the test plan below.
9. Commit on the feature branch. (No push — Chris tests and asks.)

## Test plan

- **Member** (non-owner): no pencil on cards, no "Edit category" button;
  `/edit` redirects to the category page; calling the actions directly
  redirects without mutating.
- **Owner**: pencil on every real card, not on General; edit page shows
  Name and Delete-or-explanation, **no** Move section.
- **Admin**: also sees Move; General's pencil (when it has guides) opens the
  "Move all General guides" page.
- **Rename, keep address**: card, sidebar, category page heading, guide
  breadcrumbs and the guide form's picker show the new name; the old URL
  still opens the category.
- **Rename, change address**: new URL works; old URL shows "Category Not
  Found" with the back link; sidebar links point at the new slug.
- **Rename to same name**: no-op. **Rename to another category's name**,
  or to a name whose slug matches another category's slug: blocked with
  the notice. **Rename to "General"** with change-address: blocked.
- **Delete** an empty category: gone from space page, sidebar and category
  page (which now shows not-found).
- **Race**: file a guide into the category from a second session, then
  click Delete — the category survives and the edit page lists the guide.
- **Draft-only category**: Delete is not offered; the explanation shows.
- **Move** a category and Move all General guides still work end to end,
  and the post-move redirect lands on the category page in the target.

## Open questions

Answers from the first version (2026-08-31) are carried forward; only
question 3 is re-opened because the design around it changed.

1. **Slug on rename.** Keep slugs stable so links never break, or re-slug?
   Answer (carried forward): give the user the choice with a warning about
   breaking existing links — keep existing links / create new links /
   cancel. **Applied as** the "Web address" radio group in §1a, shown only
   when the slug would actually change; Cancel is the page's Cancel.
2. **Duplicate names.** Block two categories in one space sharing a display
   name?
   Answer (carried forward): block the action; two categories should never
   be so similar they have the same slug. **Applied as** the
   `renameConflict` rule in §1a (candidate slug vs. other slugs and other
   slugified names).
3. **Placement of controls.** First-version answer: inline on each card,
   a pencil to the right of the category name that edits in place.
   **Revised proposal:** the pencil stays right of the name (and replaces
   the admin folder icon), but opens the Edit category page instead of an
   inline form, so rename, move and delete share one surface and the link
   choice needs no modal. Trade-off: a pure rename is one click further
   away. **Needs Chris's confirmation before implementing.**
   Answer: Confirmed - replace the admin folder icon with an edit icon
4. **Move page URL.** Removing `.../categories/{category}/move` outright
   (proposed; nothing links to it and it has only been live since PR #15),
   or keep a redirect from `/move` to `/edit`?
   Answer: remove it outright.
