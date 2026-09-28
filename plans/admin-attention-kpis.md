# Plan: "Needs attention" KPI row on the Admin page

**Status: implemented on `feat/admin-attention-kpis` (2026-09-28), awaiting
Chris's local testing.** Tests, lint, typecheck and build passed. All open
questions answered; Q2 added a status filter UI to `/admin/guides` beyond
the tile's own `?filter=pending` link. No migration.

Add a row of stat tiles at the top of `/admin`, above the **Manage**
section, that shows how many records are waiting on an admin and links
each count to the page where it is dealt with:

- orphaned spaces → `/admin/spaces`
- pending all-staff publish requests → `/admin/all-staff-requests`
- pending guide deletion requests → `/admin/deletion-requests`
- guides pending publishing (submissions awaiting review) → `/admin/guides`,
  filtered to those guides

## Problem

`src/app/admin/page.tsx` already computes most of these counts, but it
buries them as suffixes on the Manage links ("Spaces — inventory, re-home
or merge orphaned departments — 2 orphaned"). An admin opening the page has
to read a nine-item bullet list to find out whether anything is waiting.
The numbers that mean "you have work to do" should be the first thing on
the page, large, and clickable.

### What exists and matters here

- **Counts on the dashboard today.** `AdminDashboard` runs one
  `Promise.all` with: recent sync runs, `allStaffRequest` rows with
  `status = 'pending'`, `guideDeletionRequest` rows with
  `status = 'pending'`, total tags, orphaned spaces (`space` inner-joined to
  `m365Group` where `deletedAt` is set or `isDepartment` is false, the same
  rule as `spaceHealth()` in `src/lib/space-health.ts`), and total OAuth
  clients. Tags and MCP clients are inventory, not attention; they stay
  where they are.
- **The all-staff queue filters harder than the dashboard.**
  `/admin/all-staff-requests` lists pending requests joined to `guide` with
  `ne(guide.status, "deleted")`, whereas the dashboard counts every pending
  row. In practice they agree because `requestGuideDeletion` withdraws open
  all-staff requests, but the tile must use the queue's definition so the
  number on the tile always equals the number of cards on the page.
- **"Pending publishing" is a revision state, not a guide state.** A
  member's "publish" writes a `guide_revision` with `status = 'pending'`
  (`saveGuide` in `src/app/(kb)/spaces/actions.ts`); the guide row keeps
  its own status (`draft` for a new guide, `published` for an edit to a
  live one). One pending revision per guide is enforced by superseding on
  resubmission. Pending revisions are reviewed per space at
  `/spaces/{slug}/queue`, which admins may open because
  `resolveGuidePermissions` grants them `canApprove` everywhere. Submissions
  on a guide whose status is `deleted` wait with the guide and are excluded
  from the space queue; the tile must exclude them too.
- **There is no admin-wide view of pending submissions.** `/admin/guides`
  lists every guide with its *guide* status (draft / published / archived /
  pending deletion) and has no filter and no notion of a pending revision.
  A tile that links there today would land the admin on a table that cannot
  show what the tile counted. The space page shows "Review queue (n)" to
  owners, so the per-space link target already exists.
- **Orphaned spaces.** `spaceInventory()` in `src/lib/space-inventory.ts`
  derives each space's health for `/admin/spaces`; the dashboard's count
  query is the same predicate in SQL. Nothing is stored.
- **Primitives and styling.** `src/components/ui.tsx` has `Badge` (tones
  including `warning` and `muted`, the latter documented as "the quiet
  no-background tone for empty counts"), `ButtonLink`, `MicroLabel`. The
  home page's cards use `rounded-xl border border-border bg-surface-raised
  p-5 shadow-xs` with a hover lift; the admin pages use `h2 text-lg
  font-semibold` section headings and theme tokens (`text-fg-strong`,
  `text-fg-muted`, `text-warning`, `text-danger`). Light and dark mode both
  come from those tokens, so tiles need no mode-specific classes.
- **Tests.** Pure helpers next to their module get a Vitest file
  (`space-health.test.ts`, `guide-revisions.test.ts`); nothing in the repo
  unit-tests Drizzle queries, and pages are verified by running the app.

## Design

### 1. One module owns the counts

New `src/lib/admin-attention.ts` (`import "server-only"`):

```ts
export type AttentionCounts = {
  orphanedSpaces: number;
  allStaffRequests: number;
  deletionRequests: number;
  pendingSubmissions: number;
};
export async function attentionCounts(): Promise<AttentionCounts>;
```

Four `count()` queries in one `Promise.all`, each using the definition of
the page it links to:

- **orphanedSpaces**: `space ⋈ m365Group` where `deletedAt is not null or
  isDepartment = false` (moved verbatim from the dashboard, with its
  comment).
- **allStaffRequests**: `allStaffRequest ⋈ guide` where request status is
  `pending` and guide status is not `deleted` (the queue's predicate).
- **deletionRequests**: `guideDeletionRequest` where status is `pending`.
- **pendingSubmissions**: `count(distinct guide.id)` over `guideRevision ⋈
  guide` where revision status is `pending` and guide status is not
  `deleted`. Distinct on guide so the tile says "guides", matching what
  `/admin/guides` will list, even if a superseded-race ever leaves two
  pending rows on one guide.

The dashboard drops its own copies of the first three queries and calls
`attentionCounts()` alongside the sync-run, tag and MCP-client queries.

### 2. Pure tile builder, unit-tested

Same file exports, without server imports, a pure function the page maps
over. Because `server-only` would block a Vitest import, the pure part lives
in `src/lib/admin-attention-tiles.ts` with `admin-attention-tiles.test.ts`:

```ts
export type AttentionTile = {
  key: keyof AttentionCounts;
  label: string;      // "Orphaned spaces"
  count: number;
  href: string;       // "/admin/spaces"
  caption: string;    // what the number means / what to do
};
export function attentionTiles(c: AttentionCounts): AttentionTile[];
```

Fixed order: orphaned spaces, all-staff requests, deletion requests, guides
pending review. Captions (sentence case, verb-first when non-zero):

| Tile | Zero | Non-zero |
|---|---|---|
| Orphaned spaces | Every space has an active department | Re-home or merge |
| All-staff requests | Nothing waiting | Awaiting your decision |
| Deletion requests | Nothing waiting | Awaiting your decision |
| Guides pending review | Nothing waiting | Submitted by members, not yet published |

Tests: order and hrefs are stable; the caption flips at zero; the
pending-review href carries the filter from §4.

### 3. The tile row

In `src/app/admin/page.tsx`, a new first `<section>` headed **Needs
attention** (same `h2` style as the other sections), then a
`grid grid-cols-2 gap-4 md:grid-cols-4`. Each tile is one `<Link>` to its
`href`, styled like a home-page card (`rounded-xl border border-border
bg-surface-raised p-5 shadow-xs transition-shadow hover:-translate-y-0.5
hover:shadow-md`, plus `focus-visible:shadow-focus`), containing:

- the label in `text-sm font-medium text-fg-muted`;
- the count in `mt-1 text-3xl font-semibold` using proportional figures
  (no `tabular-nums`; it is a standalone value, not a column), coloured
  `text-fg-strong` when non-zero and `text-fg-muted` when zero;
- the caption in `mt-1 text-xs text-fg-muted`.

State is carried by the number and the caption text, with colour only
reinforcing it, so a colourblind reader or a print-out reads the same
thing. No badge, icon or red border per tile: four small red boxes would
shout at every zero-state visit. All four tiles render even at zero so the
row never reflows between visits. The tiles are laid out as a KPI row of
stat tiles, deliberately not a chart, because the data is four independent
headline counts.

The Manage list keeps its links and descriptions but loses the "— n
pending" / "— n orphaned" suffixes for the four items now shown as tiles
(Q3). The tag and MCP-client suffixes stay.

### 4. `/admin/guides` learns about pending submissions

So the fourth tile lands somewhere useful, `src/app/admin/guides/page.tsx`
gains:

- a `pendingReview: boolean` per row, from a left join to a subquery of
  `guideRevision` grouped by `guideId` where status is `pending` (or an
  `exists` subquery; one extra column, no second round-trip);
- a `?filter=pending` search param (typed via `PageProps<"/admin/guides">`)
  that restricts the table to guides with a pending submission and changes
  the intro copy to "Guides with a member submission waiting for review."
  A small "Show all guides" link clears it. Unknown values fall back to no
  filter;
- in the **Status** cell, when `pendingReview` is set, a second line
  "pending review" (`text-warning`) linking to `/spaces/{spaceSlug}/queue`,
  where the admin can approve or reject with the existing diff view. The
  guide status itself (draft / published) still shows on the first line.

The tile's href is `/admin/guides?filter=pending`.

### 5. Out of scope

- A cross-space admin approval queue with inline approve/reject. The
  per-space queue already does that; the filtered guides list is the index
  into it. Revisit if admins find themselves reviewing for many spaces.
- Counting draft guides that were never submitted (an author's work in
  progress is not waiting on an admin; see Q1).
- Sync-health tiles (last run failed, no run in N days). Reasonable
  follow-ups if wanted (Q4), but the sync table already sits on the page.
- Any change to the admin header nav, the MCP tools, or the space pages.

## Steps

1. Branch `feat/admin-attention-kpis` off `main`.
2. `src/lib/admin-attention-tiles.ts` + `admin-attention-tiles.test.ts`:
   types, `attentionTiles`, tests from §2.
3. `src/lib/admin-attention.ts`: `attentionCounts()` with the four queries
   from §1.
4. `src/app/admin/guides/page.tsx`: `pendingReview` column, `?filter=pending`,
   status-cell link to the space queue, copy (§4).
5. `src/app/admin/page.tsx`: call `attentionCounts()`, render the tile row
   above Manage, remove the four duplicated count queries and their
   suffixes on the Manage links (§3).
6. Verify locally: `npm test`, `npm run lint`, `npx tsc --noEmit`,
   `npm run build`. Then in `npm run dev` against the development branch:
   - With nothing pending, all four tiles show 0 in muted ink with their
     zero captions; each tile links to its page; the Manage list has no
     count suffixes on those four items but still shows tags and MCP
     clients.
   - As a member of a healthy space, submit a new guide and an edit to a
     published one. The pending-review tile reads 2 and links to
     `/admin/guides?filter=pending`, which lists exactly those two guides
     with "pending review" links into their space queue. Approving one from
     the queue drops the tile to 1. Requesting deletion of the other hides
     it from the tile, the filtered list and the space queue alike.
   - Un-flag a department in `/admin/groups`: the orphaned-spaces tile
     reads 1 and the caption changes. Re-flag it: back to 0.
   - Request all-staff publication and a guide deletion as an owner: the
     two request tiles read 1 each and match the card count on their queue
     pages. Decide both: back to 0.
   - Check the row in dark mode and at a narrow window (two columns).
7. Commit on the feature branch. No push.

## Open questions for Chris

1. **What does "guides pending publishing" count?** Recommended: guides
   with a member submission waiting for owner/admin review (revision status
   `pending`), because those are waiting on someone. The alternative is
   every unpublished guide (status `draft`, including work in progress
   nobody has submitted), which is not actionable by an admin. Or both, as
   two tiles?
   Answer: only one for the actionable member submission waiting for review.
2. **Where should the pending-review tile link?** Recommended:
   `/admin/guides?filter=pending` with the small additions in §4. The
   alternative is a new `/admin/queue` page that aggregates every space's
   pending submissions with approve/reject inline; more work and a second
   copy of the queue UI, but one place to clear everything.
   Answer: go with the recommendation (add a filter UI as well so landing on /admin/guides directly lets me choose between the different statuses)
3. **Drop the count suffixes from the Manage links?** Recommended: yes for
   the four items that become tiles, so the same number is not shown twice
   a few lines apart. Keep the tag and MCP-client counts.
   Answer: go with the recommendation
4. **Any other tiles?** Candidates, not included by default: "last sync
   failed" (the newest `syncRun` has `error` set), "no sync in 7 days", and
   "submissions stuck in orphaned spaces" (pending revisions where nobody
   but an admin can approve). Default: none; the sync table is already on
   the page.
   Answer: no other tiles at this time.
