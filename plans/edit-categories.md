# Plan: Let space owners rename categories and delete empty ones

**Status: not started — requested 2026-08-31.**
To implement, ask Claude to "execute the edit-categories plan". Resolve the
open questions at the bottom first (or answer them when Claude asks).

## Problem

Categories can only ever be created (`createCategory` in
`src/app/(kb)/spaces/actions.ts`). A typo'd or outdated category name is
permanent, and an unused category sits on the space page forever showing
"Nothing here yet." Owners should be able to rename a category and delete one
that has no guides — the same people who can create them today
(`spacePermissions(...).canApprove`: space owners and admins).

What exists and matters here:

- `category`: `id, space_id, name, slug, sort_order, created_at`, with
  `category_space_slug_idx` unique on `(space_id, slug)`
  (`src/db/content-schema.ts`).
- `guide.category_id` references category with **`onDelete: "set null"`** —
  a raw DB delete of a non-empty category would silently dump its guides
  into "General". The action must enforce emptiness itself.
- The category slug doubles as the **anchor id** on the space page
  (`id={sec.key}`) and the sidebar deep-links to `/spaces/{slug}#{catSlug}`
  (`sidebar-nav.tsx`). Renames therefore interact with anchors — see design.
- The space page renders one card per category plus a synthetic "General"
  card for uncategorized guides; the guide form offers the category picker.

## Design

### 1. Server actions (in `src/app/(kb)/spaces/actions.ts`)

Both follow the house pattern: `requireAccess()` →
`spaceBySlugOr404(spaceSlug)` → gate on
`spacePermissions(access, s.groupId).canApprove` → mutate →
`revalidatePath('/spaces/{slug}')`.

- **`renameCategory(spaceSlug, formData)`** — takes `categoryId` + `name`.
  Verify the category belongs to this space (never trust the UI's ids —
  matches the file's header comment). Trim; empty name is a no-op redirect
  like `createCategory`. **Keep the slug stable** (name is display-only), so
  sidebar links, anchors, and any bookmarked `#fragment` URLs survive the
  rename, and the unique `(space_id, slug)` index can't collide. Skip the
  write if the name is unchanged.
- **`deleteCategory(spaceSlug, formData)`** — takes `categoryId`. Verify
  space ownership of the row, then delete **only when no guide references
  it** — any status, drafts and archived included, since `set null` would
  quietly re-home them. Do the emptiness check and delete atomically:
  `delete from category where id = $1 and space_id = $2 and not exists
  (select 1 from guide where category_id = $1)` (single statement, no
  transaction needed). A non-empty category is simply not deleted; the UI
  never offers the button for one (see §2), so no error UX is required
  beyond the redirect.

Also revalidate `/` if the home feed or sidebar caches category names
(the sidebar queries per-request in the dynamic layout, so likely only the
space page needs it — verify while implementing).

### 2. UI (space page, `src/app/(kb)/spaces/[slug]/page.tsx`)

For `perms.canApprove` only, on each category card header:

- A small **rename** affordance (pencil icon button in the existing
  `PencilIcon` style) that swaps the card title for an inline
  `<form action={renameCategory...}>` with a text input prefilled with the
  current name. This needs a tiny client component (like `sidebar-nav.tsx`)
  to toggle edit mode; the form itself still posts to the server action.
- A **delete** button (XIcon) rendered **only when `sec.guides.length === 0`**
  for that card — matching the action's emptiness rule. Wrap it in the
  same inline-edit client component with a one-step confirm (e.g. button
  flips to "Delete 'Name'?") rather than a browser `confirm()`.
- The synthetic "General" card gets neither control (it isn't a row).

Note the card's guide list is already filtered by what the *viewer* can see
— but owners see everything in their space (`visibleGuidesWhere`), so for
the only people who get the button, `sec.guides.length === 0` is the true
emptiness. The server-side `not exists` check still guards the race where a
guide is filed into the category between render and click.

### 3. Out of scope (deliberately)

- Reordering (`sort_order` exists but has no UI today) — separate feature.
- Merging categories / moving guides between categories in bulk — the
  handle-orphaned-spaces plan touches category moves across spaces; don't
  duplicate it here.
- Deleting non-empty categories with a "move guides to…" picker — not
  needed for v1 of this; owners can re-file guides via the guide form first.

## Test plan

- As a space **member** (non-owner): no pencil/delete controls render;
  calling the actions directly redirects without mutating.
- Rename a category: card title and sidebar update; the anchor/deep-link
  `#old-slug` still scrolls to the card; guide form picker shows the new
  name.
- Rename to the same name: no-op. Rename to another category's name: allowed
  (slugs still differ) — confirm this is acceptable (open question 2).
- Delete an empty category: card disappears from space page and sidebar.
- Race: create a guide in the category from a second session, then click
  delete — the category survives (the `not exists` guard) and the page
  re-renders showing the guide.
- Category with only a **draft** guide shows no delete button (drafts count
  as non-empty).

## Open questions for Chris

1. **Slug on rename**: the plan keeps slugs stable so links never break, at
   the cost of the slug drifting from the display name (e.g. a category
   renamed "AV Gear" might keep slug `sound-equipment`). Slugs are only
   visible in URL fragments. OK, or should renames re-slug with a
   collision suffix?
   Answer: provide the user with an option via a modal dialog on submit that provides a warning about breaking exsisting links, then provide 3 options: "keep existing links", "create new links", "cancel"
2. **Duplicate names**: with stable slugs, two categories in one space could
   share a display name after a rename. Block that in the action (cheap
   name-uniqueness check), or not worth caring about?
   Answer: block the action.  2 categories should never be so similar they have the same slug.
3. **Placement of controls**: inline on each category card (planned), or
   gather category management into one "Manage categories" panel near the
   existing "Add category" form at the bottom of the page?
   Answer: inline on each category card, simply a pencil icon to represent "edit" to the right of the category name.
