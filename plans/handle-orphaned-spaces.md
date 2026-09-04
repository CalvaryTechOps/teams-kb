# Plan: Handle orphaned spaces when a backing Team is deleted

**Status: implemented locally on `feat/handle-orphaned-spaces` (2026-09-04);
awaiting Chris's local testing, then a push/PR on request.** Requested
2026-08-30; expanded 2026-09-04 with in-KB Move guide / Move category tooling
(§5). All open questions below are answered and reflected in the code.

Implementation notes (where the design landed):

- `/admin/spaces` (`src/app/admin/spaces/`) lists every space with a health
  badge (Healthy / Team deleted / Not a department) and per-row re-home,
  merge-into and delete-empty controls; read side in
  `src/lib/space-inventory.ts`, health derivation in `src/lib/space-health.ts`.
- Move primitives shared by the admin actions and the in-KB pages live in
  `src/lib/moves.ts`; the department picker component is
  `src/components/move-form.tsx`.
- Move pages: `/spaces/[slug]/guides/[guideSlug]/move` and
  `/spaces/[slug]/categories/[categorySlug]/move` (`general` = the
  uncategorized guides). Entry points: "Move guide" in the split-button menu
  (owners and admins; only admins may pick another department) and the
  folder-arrow icon beside each category title (admins only).
- The full sync now prunes audience links to deleted groups and records a
  note on the run (`sync_run.note`, migration `0007_sync-run-note.sql`),
  shown in the dashboard's sync table.
- Un-flagging a department deletes its space when empty; otherwise the space
  stays and is listed as orphaned.

## Problem

Only Teams-enabled groups sync from Graph, and Teams come and go. When a
space's backing group is deleted in M365, the daily full sync soft-deletes it
(`m365_group.deleted_at`), which silently strips everyone's membership:

- The space, its categories, and its guides become **orphans no one can
  author in** (admins still see and can edit everything).
- Nothing surfaces this — admins find out when a department asks why they
  can't edit their guides.
- Separately, `guide_audience_group` rows can point at deleted groups: the
  guide's audience **silently shrinks** with no trace in the UI.

What already works and must not change: published guides in an orphaned space
stay readable per their audience (`visibleGuidesWhere` checks the *reader's*
memberships, not the space group's liveness), and deleted `m365_group` rows
are never hard-deleted while spaces/audiences reference them.

## Design (agreed 2026-08-30)

### 1. Detect + surface (no schema change)

Orphanhood is derivable: `space` joined to `m365_group` where
`deleted_at is not null`. Same for audience rows. Build:

- An **orphaned spaces** section on the admin dashboard (`/admin`), or a
  dedicated `/admin/spaces` page (see questions): space name, guide count,
  when the group was deleted (`m365_group.synced_at` of the soft delete —
  consider recording `deleted_at` timestamp display), re-home controls.
- A **stale audiences** list: guides whose `guide_audience_group` references
  a deleted group, so an admin can fix the audience deliberately.
- Optional: a small warning badge on the orphaned space's own page, visible
  to admins only.

### 2. Orphan behavior (mostly already true — verify, don't build)

- Published guides stay readable per their audience.
- Authoring/approval naturally freezes (no members resolve). Verify the UI
  degrades sanely: no "New guide" button for non-admins, queue unreachable.
- admins retain full read/edit/approve everywhere.

### 3. Re-home tooling (admin-only server actions)

- **Reassign the whole space** to a different Teams group:
  `space.group_id` update. Constraints: target group must exist, not be
  soft-deleted, and **must not already back another space** (space:group is
  1:1). After re-homing, flag the target group `is_department` if it isn't,
  so rosters sync (or require picking an already-flagged group — see
  questions). Revalidate the space and home pages.
- **Move a category (with its guides) to another space** and **move a
  single guide** to another department/category: these are the same server
  actions the in-KB move pages use — see §5 for the actions, slugging rules,
  and revalidation. `/admin/spaces` links to the same pages rather than
  hosting a second copy of the UI.
- **Merge space into space** (answer to Q1): move every category and every
  General guide of the source space into the target in one transaction
  (reusing the §5 primitives per category / per guide), then delete the
  emptied source space. Blocked when the target is the source.
- **Delete an empty space** (answer to Q1/Q5): allowed only when the space
  has no guides in any status (drafts, archived, and deleted-pending
  included — `guide_deletion_request.space_id` sets null on delete, so the
  audit trail survives) and no categories. Un-flagging a department whose
  space is empty runs this delete; un-flagging one with content leaves the
  space and lists it as orphaned on `/admin/spaces`.

### 4. Watch-outs

- `guide_audience_group` rows pointing at deleted groups: surface (per §1);
  decide prune vs. keep (see questions).
- Re-homing changes who can author AND who can read department-audience
  guides — the new group's members inherit everything. Make the confirm UI
  say this plainly.
- A re-homed space keeps its slug (URLs stay stable) but its `name` may no
  longer match the new group's `displayName` — offer a rename in the same
  action, defaulting to the space's current name.
- The full sync only pulls rosters for flagged + audience-referenced groups;
  a re-home target that was never flagged has no membership rows until the
  next sync or its members' next sign-in. Trigger a roster sync for the
  target group as part of the re-home action.

### 5. Move tooling in the KB UI (admin-only)

Admins fix mis-filed content where they see it, not only from `/admin`.
Both entry points lead to a dedicated page whose top row is the mover and
whose body previews what will move. Both pages and their actions are
**admin-only** (`access.isAdmin`); space owners never see the controls —
re-filing inside a space is the guide form's category picker.

#### 5a. Move guide

- **Entry**: a new "Move guide" item in the guide page's split-button menu
  (`GuideActions`, `src/components/guide-actions.tsx`), below the download
  items in the same separator-delimited group as "Edit guide". Add an
  optional `moveHref` prop next to `editHref`; the page passes it only when
  `access.isAdmin`. Icon: add a `MoveIcon` (folder-with-arrow or
  arrow-right-into-box) to `src/components/icons.tsx` in the existing
  stroke style. Extend `guide-actions.test.tsx` for the new item
  (rendered for admins, absent otherwise, keyboard-navigable).
- **Page**: `src/app/(kb)/spaces/[slug]/guides/[guideSlug]/move/page.tsx`.
  `requireAdmin()` first (non-admins are sent home like `/admin`). Loads
  the guide + its space, every space ordered by name with its categories,
  and the guide's current published (or, for never-published guides, latest
  unpublished) revision for the preview — same revision choice as the guide
  page so the admin sees what readers see. TopBar crumbs:
  App › Space › Guide title › Move.
- **Mover row** (client component `GuideMover`, one row, the whole thing
  a `<form action={moveGuide.bind(null, {spaceSlug, guideId})}>`):
  1. **Department** `<select name="spaceId">`, prefilled with the guide's
     current space, listing every space (name; orphaned ones suffixed
     "(orphaned)" so an admin can also move content *out* of one).
  2. **Category** `<select name="categoryId">`, enabled once a department
     is chosen; options are that space's categories plus "General" (empty
     value). Prefilled with the guide's current category when the current
     space is selected, "General" otherwise. Category lists for all spaces
     are passed as a prop and switched client-side — no round trip.
  3. **Move** primary button (disabled while the selection equals the
     guide's current department + category) and **Cancel** as a
     `ButtonLink` back to the guide.
  Styling follows the guide form's `<select>` (`inputClasses`) and the
  `sm` button size used by the split button.
- **Preview**: below the row, a read-only render of the guide: the
  metadata badges (department, category, status) and title as on the guide
  page, then `GuideContent` in `prose-guide`. Nothing else from the guide
  page (no draft banners, no aside).
- **Action** `moveGuide(ref, formData)` in `src/app/(kb)/spaces/actions.ts`:
  `requireAdmin()`; load guide by id **and** source space slug (404
  otherwise); verify the target space exists and, when a category id is
  given, that the category belongs to the *target* space (never trust the
  UI's pairing). Same space + same category is a no-op redirect. Otherwise,
  in one transaction: if the space changes, re-slug via `uniqueGuideSlug`
  against the target and set `guide.space_id` (a slug that doesn't collide
  keeps its slug); set `guide.category_id`. The guide's revisions, tags,
  audience rows, all-staff and deletion requests all key on `guide.id` and
  need no change — but a pending `guide_deletion_request` snapshots
  `space_name`, which then goes stale; leave it (it's history). Revalidate
  `/`, both space pages, both guide paths (old path now 404s), both queues,
  `/search`, `/admin/guides`; redirect to the guide's new URL.
- **Audience note**: department-audience guides become readable by the
  *target* department's members and stop being readable by the source's.
  Say this in a one-line note under the mover row; the audience itself is
  not changed by the move.

#### 5b. Move category

- **Entry**: on the space page (`src/app/(kb)/spaces/[slug]/page.tsx`), a
  `MoveIcon` link button directly right of each category card's title,
  admin-only, `aria-label="Move {name}"`, linking to the move page. Not on
  the synthetic "General" card — General guides move through the "Move all
  General guides" option below. Coexists with the edit-categories plan's
  pencil (also right of the title): order **name · pencil · move**, pencil
  gated on `canApprove`, move on `isAdmin`. If edit-categories lands first,
  slot the move icon into its inline-title client component instead of
  adding a second wrapper.
- **Page**: `src/app/(kb)/spaces/[slug]/categories/[categorySlug]/move/page.tsx`,
  `requireAdmin()`. Crumbs: App › Space › Category name › Move. Mover row
  as in 5a but with only a **Department** select (target space; the
  current space excluded — moving a category within its own space is
  meaningless), then **Move** / **Cancel** (back to `/spaces/{slug}#{catSlug}`).
  Below: a plain list of every guide in the category (title, status badge,
  updated) — admins see all statuses, so this is the true contents.
- **"Move all General guides"** (answer to Q6): the same page at
  `.../categories/general/move` (`general` is reserved: `createCategory`
  must refuse that slug — add the guard there). The list shows the
  uncategorized guides; the mover gains a **Category** select for the
  target space (its categories + General) because General guides have no
  category to carry across. Reached from a move icon on the General card,
  admin-only, shown only when the card has guides.
- **Action** `moveCategory(ref, formData)`: `requireAdmin()`; verify the
  category belongs to the source space; verify the target space exists and
  differs. In one transaction: if the target already has a category with
  the same slug, **merge** into it (re-point guides, delete the now-empty
  source category) rather than creating `name-2` — a same-named category
  in the destination is almost certainly the intended home (confirm in
  Q8). Otherwise update `category.space_id`. Then for every guide in the
  category set `space_id` and re-slug on collision (per guide, same
  `uniqueGuideSlug`). Revalidate `/`, both spaces, every moved guide's old
  and new path, both queues, `/search`, `/admin/guides`; redirect to the
  target space page anchored at the category.
- **Action** `moveGeneralGuides(ref, formData)`: same shape with a target
  `categoryId` (validated against the target space) applied to every
  uncategorized guide of the source space.

#### 5c. Shared bits

- Extract the slug-collision loop into `uniqueGuideSlugIn(tx, spaceId,
  base)` that takes the transaction and an existing slug (not a title) so
  moves reuse it without re-slugifying a title that may have been
  hand-tuned.
- Revalidation helper `revalidateMove(paths: string[])` to keep the action
  bodies readable — the set of paths is large.
- No new tables and no schema change; `category.slug` uniqueness
  per space and `guide.slug` uniqueness per space already enforce what the
  actions guard against, so a race that slips past the pre-check surfaces
  as a unique-violation and the transaction rolls back cleanly.

### 6. Test plan

- Soft-delete a test Team's group row by hand (or delete a throwaway Team in
  M365 and run sync): admin dashboard lists the orphan; members lose
  authoring but published guides stay readable per audience.
- Re-home the space to another Teams group: its members can author
  immediately after the action's roster sync; old URLs still resolve.
- Move a category with a slug-colliding guide into another space: guide gets
  a `-2` suffix, both spaces render, article pages revalidate.
- Stale audience: share a guide with a group, soft-delete the group, confirm
  it's listed and fixable.

- Move guide: as an admin, the split-button menu shows "Move guide"; as a
  space owner it doesn't, and `/…/move` redirects home. Move a guide to
  another department + category: it lands under that category, its old URL
  404s, the new one renders, search finds it under the new department, and
  the source department's members can no longer read it while the target's
  can. Moving a guide whose slug exists in the target yields `-2`. Picking
  the current department + category leaves Move disabled.
- Move guide with a pending deletion request or pending all-staff request:
  the requests still resolve correctly from `/admin/*` after the move.
- Move category: icon shows only for admins; page lists drafts too. Move
  into a space that lacks the category: card appears there with all its
  guides, both space pages and the sidebar update, anchor links work. Move
  into a space that already has a same-slug category: guides merge into
  the existing card and the source category row is gone.
- Move all General guides into a target category: the source General card
  disappears (no guides left), the target category shows them.
- `createCategory` with the name "General" is refused (reserved slug).
- Merge space into space; delete empty space; un-flag an empty department
  deletes its space, un-flag a non-empty one lists it as orphaned.

## Open questions for Chris

1. **Merge vs. reassign**: if the natural new home already has its own space
   (e.g. a re-org folds a deleted Team into an existing department), the
   space-level re-home is blocked by the 1:1 rule. Is "move categories one at
   a time into the existing space" (then delete the empty orphan?) enough, or
   do we need a one-shot "merge space into space" action? Does deleting an
   emptied space need to exist at all in v1 of this feature?
   Answer: Let's add a Merge Space into Space action. We should make it possible to delete an empty space, and deselecing "Make Department" on a group that is an empty space should also trigger the delete empty space action (as also referenced in question 5 on this list)
2. **Re-home targets**: any live Teams group, or only ones already flagged as
   departments? (Any-group + auto-flag is more flexible; flagged-only is more
   deliberate.)
   Answer: only ones already flagged as departments
3. **Stale audience rows**: auto-prune references to deleted groups during
   the full sync (with a `sync_runs` note), or only surface them for manual
   cleanup? Auto-prune is tidy but destroys the record of who it *was*
   shared with.
   Answer: auto-prune
4. **Placement**: a section on `/admin` vs. a new `/admin/spaces` page that
   also lists healthy spaces (name, group, guide count) with re-home controls
   on every row? The latter doubles as a useful inventory.j
   Answer: a new `/admin/spaces`
5. **Un-flagged departments**: un-flagging a group (without deleting it)
   leaves a space whose group is alive but no longer a department — members
   keep authoring today. Should that state be surfaced/treated like an
   orphan too, or left as-is?
   Answer: unflagging a department should be treated like an orphan as well
6. **Uncategorized guides**: move-single-guide action, or a bulk "move all
   General guides" as part of the category mover?
   Answer: there should be a bulk "Move all general guides" as part of the category mover.
7. **Move icon**: no move glyph exists in `icons.tsx`. Folder-with-arrow
   ("move to folder") or a plain arrow-right-into-bracket ("export/move")?
   Either is drawn in the existing 2px-stroke style; folder reads better
   next to a category title, arrow better in the guide menu. One icon for
   both, or two?
   Answer: folder with arrow next to category title, arrow in the guide menu
8. **Same-slug category in the target**: merge the moving category into the
   existing one (planned) or keep it separate as `name-2`? Merge loses the
   distinction between two departments' "Policies" categories; suffixing
   leaves the admin a manual cleanup and two near-identical cards.
   Answer: merge the moving category into the existing one
9. **Move guide's category select when the target is the current space**:
   should the page double as a quick "re-file within this department" for
   admins (planned — the mover simply allows the same department with a
   different category), or force a department change and leave in-space
   re-filing to the guide form?
   answer: no, force department change (future features will enable editing categories within a department that is accessible to owners & admins)
   **Revised after testing (2026-09-04):** allow same-department moves after
   all, and show "Move guide" to space owners too. Admins may pick any
   department including the current one; owners see only their own
   department (locked) and change just the category — the guide form's
   picker, one step faster. Category moves stay admin-only.
10. **Space owners**: the request says admin-only, so owners never see
    either control. Confirm that owners should not be able to move
    content out of their *own* space (e.g. handing a guide to another
    department) — that would need the target owner's consent, which is
    why the plan keeps it admin-only.
    answer: keep this admin-only, we will add owner-specific tools in a different feature.
