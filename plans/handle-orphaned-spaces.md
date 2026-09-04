# Plan: Handle orphaned spaces when a backing Team is deleted

**Status: not started — deferred from v1 (requested 2026-08-30).**
To implement, ask Claude to "execute the handle-orphaned-spaces plan". Resolve
the open questions at the bottom first (or answer them when Claude asks).

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
- **Move a category (with its guides) to another space**:
  update `category.space_id` and its guides' `guide.space_id`. Re-slug on
  collision in the target (both `category_space_slug_idx` and
  `guide_space_slug_idx` are unique per space — reuse the `uniqueGuideSlug`
  suffix approach). Uncategorized ("General") guides need either a
  move-single-guide action or a "move all uncategorized" option (see
  questions). Revalidate both spaces and every moved guide path.

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

### 5. Test plan

- Soft-delete a test Team's group row by hand (or delete a throwaway Team in
  M365 and run sync): admin dashboard lists the orphan; members lose
  authoring but published guides stay readable per audience.
- Re-home the space to another Teams group: its members can author
  immediately after the action's roster sync; old URLs still resolve.
- Move a category with a slug-colliding guide into another space: guide gets
  a `-2` suffix, both spaces render, article pages revalidate.
- Stale audience: share a guide with a group, soft-delete the group, confirm
  it's listed and fixable.

## Open questions for Chris

1. **Merge vs. reassign**: if the natural new home already has its own space
   (e.g. a re-org folds a deleted Team into an existing department), the
   space-level re-home is blocked by the 1:1 rule. Is "move categories one at
   a time into the existing space" (then delete the empty orphan?) enough, or
   do we need a one-shot "merge space into space" action? Does deleting an
   emptied space need to exist at all in v1 of this feature?
2. **Re-home targets**: any live Teams group, or only ones already flagged as
   departments? (Any-group + auto-flag is more flexible; flagged-only is more
   deliberate.)
3. **Stale audience rows**: auto-prune references to deleted groups during
   the full sync (with a `sync_runs` note), or only surface them for manual
   cleanup? Auto-prune is tidy but destroys the record of who it *was*
   shared with.
4. **Placement**: a section on `/admin` vs. a new `/admin/spaces` page that
   also lists healthy spaces (name, group, guide count) with re-home controls
   on every row? The latter doubles as a useful inventory.
5. **Un-flagged departments**: un-flagging a group (without deleting it)
   leaves a space whose group is alive but no longer a department — members
   keep authoring today. Should that state be surfaced/treated like an
   orphan too, or left as-is?
6. **Uncategorized guides**: move-single-guide action, or a bulk "move all
   General guides" as part of the category mover?
