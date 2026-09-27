# Plan: Preview a guide pending deletion, reasons for deletion, author self-delete

**Status: implemented on `feat/preview-pending-deletion` (2026-09-27);
lint, typecheck, tests and build pass; awaiting Chris's local testing. All
open questions answered; Q4–Q6 took the defaults. Migration
`0012_deletion-request-reason-prior-status` is applied to the development
DB branch.**

Three related changes, rolled into one plan because they share a migration
and the same handful of files (the danger zone, the deletion actions, the
admin queue card and the guide-page banner):

- **A.** Admins can preview a guide that is pending deletion, walk its
  revisions with the picker, and decide from a red banner on the page.
- **B.** Owners must give a reason when deleting a guide that has ever
  been published; the reason travels with the request.
- **C.** The author of a never-published guide can delete it outright,
  with no admin review.

## Problem

### A. Deciding blind

`/admin/deletion-requests` lists owners' requests to delete a guide, but the
card shows only the snapshotted title, space, requester and date. The guide
itself is hidden from everyone the moment the request is made
(`requestGuideDeletion` sets `guide.status = "deleted"`), and
`resolveGuidePermissions` in `src/lib/guide-permissions.ts` returns
`canRead: false` for a deleted guide even to admins, so the guide page
404s. An admin deciding the request cannot read what they are about to
destroy, and the page comment says as much: "there is nothing to link to
except after a rejection".

What Chris asked for:

1. A link from each pending request to a **preview of the guide**, where
   the new revision picker (`plans/completed/revision-picker.md`) works so
   every revision can be read before deciding.
2. On that preview, a **red banner** at the top saying the guide is pending
   deletion, carrying the same admin form as the queue: approve the
   deletion, or reject it with a reason.
3. **Approving** returns to `/admin/deletion-requests`. **Rejecting**
   reinstates the guide and lands on the guide's own page, so the admin can
   pick a revision to revert to or make changes right there.

### B. No reason travels with the request

The owner's "Delete guide" button in `src/components/guide-danger-zone.tsx`
(edit page, owners/admins only) posts `requestGuideDeletion(ref)` with no
form fields. The admin sees who asked and when, never why. For a guide
staff have been reading, the why is most of the decision.

### C. Authors cannot delete their own drafts

A member who starts a guide and abandons it has no way to remove it: the
danger zone renders only for `perms.canApprove`, and `deleteDraftRevision`
refuses to remove a guide's last revision ("removing the whole guide is
`requestGuideDeletion`'s job"). The draft sits in the space's unpublished
list until an owner requests deletion and an admin approves it, for
content nobody but its author has ever seen.

### What exists and matters here

- **The request row.** `guide_deletion_request` snapshots `guideTitle` and
  `spaceName`; `guideId`/`spaceId` are FKs that go null on delete. While a
  request is `pending` the guide row still exists with `status = "deleted"`
  and `searchText = null`. Any open all-staff request was withdrawn at
  request time. Nothing records what the guide's status was **before** the
  request (published or draft), and there is no reason column; `note` is
  the admin's decision note.
- **The decisions.** `approveGuideDeletion(requestId)` and
  `rejectGuideDeletion(requestId, formData)` in
  `src/app/admin/deletion-requests/actions.ts` are admin-only, keyed to the
  request id, re-check `pending` inside the write so a stale form cannot
  double-decide, and both `redirect` to the queue. Rejection sets the guide
  back to `draft` regardless of what it was. Approve has **no confirm**
  step today, though it is permanent.
- **"Ever published".** `guide.publishedAt` is set on the first publish
  (`publishRevision` keeps the existing value) and never cleared:
  `convertGuideToDraft` only changes `status` and `searchText`. So
  `publishedAt !== null` means "staff may have read this at some point",
  which is the line B and C both care about.
- **The guide page** (`src/app/(kb)/spaces/[slug]/guides/[guideSlug]/page.tsx`)
  loads the guide, resolves `perms`, 404s when `!perms.canRead`, then loads
  every revision's metadata, narrows it with `visibleRevisions` (approvers
  see all), renders the chosen one and shows the picker in the aside when
  `perms.canApprove`. Its banners' action buttons (Publish this draft,
  Revert, Delete draft, Review in queue, Edit guide) are gated on
  `perms.canApprove` / `perms.canEdit` / `canDeleteRevision`. The status
  badge shows "Draft" for anything not published, which would mislabel a
  deleted guide.
- **Guards elsewhere already handle `deleted`:** `publishRevision`,
  `deleteDraftRevision`, `approveRevision` and the move page all bounce on
  a deleted guide; the edit page redirects when `!canEdit`; list and search
  queries exclude deleted rows through `visibleGuidesWhere`; the permalink
  resolver (`src/lib/permalink.ts`) returns `not_found` for a deleted guide
  before consulting the resolver. None of those need to change for a
  read-only preview.
- **Cascades.** Deleting a `guide` row cascades to its revisions, tags,
  audience groups and all-staff requests; a deletion request's FK goes
  null. `pruneUnusedTags` drops tags the guide was the last user of
  (`approveGuideDeletion` already does both).
- **Bouncing invalid input.** Actions redirect rather than return errors;
  `renameCategory` bounces to the edit page with `?error=<code>` and the
  page shows the message. The danger zone reuses that.
- **Primitives.** `ConfirmForm` wraps a server-action form in a native
  confirm; the danger zone has its own `confirmOr` helper doing the same.
  `Badge` has `brand | neutral | muted | warning | success` tones but no
  `danger`; the guide page already uses `border-danger-100
  bg-danger-soft/50` for its red rejected banner, and the queue uses
  `bg-danger` for the approve button.

## Design

### 0. One migration for the whole plan

`guide_deletion_request` gains two nullable columns in
`src/db/content-schema.ts`:

- `prior_status guide_status` — the guide's status when the request was
  made; what a rejection restores (§4). Null on existing rows, treated as
  `draft`.
- `reason text` — the requester's reason (§6). Null on existing rows and
  when the requester left it blank.

Generated as `0012_deletion-request-reason-prior-status.sql` with
`npx drizzle-kit generate`, applied locally with `npx drizzle-kit migrate`.
No backfill: both columns are optional on read.

### 1. Admins may read a guide that is pending deletion

`resolveGuidePermissions` changes one line: a `deleted` guide returns
`{ canRead: access.isAdmin, canEdit: false, canApprove: false }`. Owners,
authors and members stay locked out. The doc comment and the "are hidden
even from admins" test in `src/lib/guide-permissions.test.ts` are updated
to "admins may read it to decide the request, nothing more".

This keeps the guide out of every list, search result, sidebar and the
MCP tools, because those go through `visibleGuidesWhere` (unchanged, still
`ne(guide.status, "deleted")` for admins) or check the status themselves.
The only way in is the direct guide URL, which the queue now links to. The
permalink stays `not_found` for a deleted guide; that is fine, the queue
links use the full path.

### 2. The queue links to the preview and shows the reason

`src/app/admin/deletion-requests/page.tsx`: the pending query gains
`leftJoin(guide)` and `leftJoin(space)` for `guideSlug`/`spaceSlug` (both
present while pending unless the space was removed underneath it). Each
pending card:

- gets a **Preview guide** button linking to
  `/spaces/{spaceSlug}/guides/{guideSlug}`, rendered only when both slugs
  came back;
- shows the requester's reason under the meta line when present:
  "Reason: “…”";
- keeps its approve/reject forms so a decision can still be made without
  previewing, with the Approve button wrapped in `ConfirmForm` (Q2).

The intro copy and the file's header comment are corrected; the Recently
decided table gains the reason in its Note column alongside the admin's
note ("Reason: … · Note: …").

### 3. The guide page in "pending deletion" mode

In the page, `const pendingDeletion = g.status === "deleted"` (only
reachable by an admin after §1). When it is set:

- **Revisions.** `visibleRevisions` is called with
  `canApprove: perms.canApprove || pendingDeletion` so the picker lists
  every revision, drafts and rejected submissions included, exactly as an
  owner would see them. The picker's render condition becomes
  `perms.canApprove || pendingDeletion`. `?rev=<n>` keeps working, so the
  admin can walk through history from the picker or the banners.
- **Red banner** above everything else in the article, using the rejected
  banner's classes (`border-danger-100 bg-danger-soft/50`), `print:hidden`:
  "This guide is pending deletion. Requested by {requester name}
  {timeAgo(createdAt)}." then, when present, "Reason: “…”", then the two
  forms from the queue bound to the request id:
  - **Approve — delete permanently** (`variant="danger"`), wrapped in
    `ConfirmForm` with "Delete "{title}" and all {n} revisions permanently?
    This cannot be undone."
  - A `note` input ("Reason (kept with the request)", optional, Q3) and
    **Reject — restore guide** (secondary).

  The page loads the pending request row (`guideDeletionRequest` joined to
  `user` for the requester's name) only when `pendingDeletion`. If the
  guide is `deleted` but no pending request exists (should not happen; a
  stale state after a failed transaction), the banner says so and offers
  no forms.
- **Everything else read-only.** `perms.canEdit`/`canApprove` are already
  false, so the top-bar Edit button, the banner Publish/Revert/Delete draft
  buttons, Edit guide links, `editHref`/`moveHref` on `GuideActions` and
  the all-staff query all switch off by themselves. The existing "You're
  viewing draft vN" / "newer draft is waiting" / "was rejected" banners
  still render, with only their navigation buttons, which is what an
  admin walking the history wants.
- **Badge.** Add a `danger` tone to `Badge` (`bg-danger-soft text-danger`;
  dark variant `bg-danger/20 text-danger`, matching the pattern of the
  other tones) and show **Pending deletion** with it instead of "Draft".
- **Aside caption.** Under the picker, when `pendingDeletion`, the caption
  reads "Hidden from everyone while the deletion request is open."

The banner lives in `src/components/deletion-request-banner.tsx` (server
component taking the request id, guide title, revision count, requester
name, date and reason) so the page stays readable.

### 4. Where the decisions land

Both actions stay in `src/app/admin/deletion-requests/actions.ts`, still
admin-only and race-safe; only their redirects and the restore status
change.

- **Approve** redirects to `/admin/deletion-requests` as today. The guide
  page the admin was on no longer exists, so there is nowhere else to go.
- **Reject** restores the guide and redirects to
  `/spaces/{spaceSlug}/guides/{guideSlug}` — from the banner **and** from
  the queue (one action, one behaviour; the reason to land there, choosing
  a version to revert to or editing, applies either way). If the guide or
  space row is gone (`guideSlug`/`spaceSlug` null), fall back to the queue.
- **Restore status** (Q1, answered: restore the prior status).
  `requestGuideDeletion` writes `g.status` into `priorStatus`.
  `rejectGuideDeletion` sets `status = priorStatus ?? "draft"`, and when
  that is `published` also rebuilds `searchText` from the current
  revision's content with `blocksToPlainText` (it was nulled at request
  time), mirroring what `publishRevision` writes. `archived` restores as
  `archived`. The queue's intro copy changes from "rejecting restores it
  as a draft in its space" to "rejecting puts it back the way it was", and
  the reject button reads **Reject — restore guide**.

### 5. Confirm before approving (Q2, answered: both places)

The queue card's Approve button is wrapped in `ConfirmForm` with the same
message as the banner's. Reject needs no confirm: it is reversible by
requesting deletion again.

### 6. A reason for deleting a guide that has ever been published

- **Rule.** When `g.publishedAt !== null` the reason is required; for a
  never-published guide it is optional (kept if given). Q5 confirms the
  "ever published" reading over "currently published".
- **Danger zone.** The Delete guide form in `guide-danger-zone.tsx` gains a
  `reason` textarea labelled "Reason for deletion" above the button, with
  a `required` attribute and the helper text "Required: this guide has
  been published, so an admin reviews the request" when the guide was
  ever published, and "Optional" otherwise. The component receives a new
  `everPublished` prop from the edit page. The confirm message is
  unchanged.
- **Action.** `requestGuideDeletion(input, formData)` reads and trims
  `reason`. If it is blank and the guide was ever published, it bounces to
  the edit page with `?error=reason` (no request is created, the guide is
  untouched); the edit page passes the code to the danger zone, which
  shows "A reason is required to delete a published guide." above the
  field. Otherwise the request row is inserted with `reason` (null when
  blank) and `priorStatus` (§4).
- **Where it shows.** The queue card, the Recently decided table and the
  preview banner (§2, §3). The MCP tools and the space pages do not show
  requests and are untouched.

### 7. Authors delete their own never-published guide without review

- **Rule.** A user may delete a guide outright when all of these hold:
  they are its creator (`g.createdBy === userId`), they may still edit it
  (`perms.canEdit`; a member who left the space cannot), it has never been
  published (`g.publishedAt === null`) and it is not already `deleted`.
  Owners and admins who created the guide qualify the same way. Owners and
  admins deleting a never-published guide **someone else** created keep
  the request flow (Q4; reason optional per §6).
- **Pure helper.** `canDeleteGuideOutright(access, g)` in
  `src/lib/guide-permissions.ts`, taking the same `GuideForPermissions`
  slice plus `publishedAt`, unit-tested: creator of a never-published draft
  yes; creator after the guide was published then converted to draft no;
  creator who is no longer a member no; owner on a colleague's draft no;
  admin who created it yes; deleted guide no.
- **Action.** `deleteUnpublishedGuide(ref)` in
  `src/app/(kb)/spaces/actions.ts`: loads the guide, re-checks the helper,
  hard-deletes the `guide` row inside `withTransaction` with the same
  `and(eq(id), isNull(publishedAt), ne(status, "deleted"))` guard so a race
  with a publish or a deletion request cannot remove a live guide, then
  `pruneUnusedTags`, revalidates `/`, the space, the space queue,
  `/admin/guides`, and redirects to the space page. A pending submission
  by the author is removed with the guide (the author withdrawing their
  own work); an owner's revisions on the author's draft go too, which is
  acceptable because the owner never published them. No deletion-request
  row is written (Q6): like `deleteDraftRevision`, an author's deletion of
  unpublished work leaves no admin-side trace.
- **Danger zone.** The edit page renders `GuideDangerZone` when
  `perms.canApprove || canDeleteOutright`. The component gets a `mode`:
  - `"request"` (today's behaviour plus §6's reason field), for owners and
    admins on any guide they cannot delete outright;
  - `"outright"`, for the creator of a never-published guide: copy
    "Deleting removes this guide and its {n} revisions permanently. It has
    never been published, so no review is needed." and a **Delete guide**
    button with a native confirm ("Delete this guide permanently? It has
    never been published and cannot be recovered."). No reason field, no
    Convert to draft.

  An owner or admin who is also the creator of a never-published guide
  sees the outright mode: nothing was ever live, so review adds nothing.
- **`deleteDraftRevision`** keeps refusing to remove the last revision;
  its comment now points at both `requestGuideDeletion` and
  `deleteUnpublishedGuide`.

### 8. Out of scope

- The permalink (`/a/{shortId}`) and QR page for a deleted guide keep
  returning not found.
- Letting the requesting owner see or withdraw their own pending request.
- Deleting a never-published guide from the guide page itself; the danger
  zone stays on the edit page where the other destructive controls are.
- Any change to the space queue, the all-staff request queue or the MCP
  tools.

## Steps

1. Branch `feat/preview-pending-deletion` off `main`.
2. Schema: add `priorStatus` and `reason` to `guideDeletionRequest` in
   `src/db/content-schema.ts`; `npx drizzle-kit generate` (name it
   `deletion-request-reason-prior-status`) and `npx drizzle-kit migrate`
   against the development branch.
3. `src/lib/guide-permissions.ts`: admins get `canRead` on a deleted guide;
   add `canDeleteGuideOutright`; update the comment and the tests in
   `guide-permissions.test.ts` (admin reads a deleted guide but cannot
   edit or approve; everyone else still sees nothing; the outright cases
   listed in §7).
4. `src/components/ui.tsx`: add the `danger` badge tone.
5. `src/app/(kb)/spaces/actions.ts`: `requestGuideDeletion` takes
   `formData`, validates and stores `reason`, stores `priorStatus`, bounces
   with `?error=reason`; add `deleteUnpublishedGuide`; update the
   `deleteDraftRevision` comment.
6. `src/components/guide-danger-zone.tsx`: `mode`, `everPublished`,
   `revisionCount` and `error` props; the reason field; the outright
   variant. Edit page: compute the mode, pass the props, read
   `searchParams.error`.
7. `src/app/admin/deletion-requests/actions.ts`: reject restores
   `priorStatus ?? "draft"`, rebuilds `searchText` for a published guide,
   redirects to the restored guide (queue as fallback). Approve unchanged.
8. `src/app/admin/deletion-requests/page.tsx`: join guide/space for pending
   rows, Preview guide link, reason on cards and in Recently decided,
   `ConfirmForm` on Approve, updated copy and header comment.
9. Guide page: `pendingDeletion` flag, request-row query, the new
   `deletion-request-banner.tsx` with both forms, picker visibility,
   Pending deletion badge, aside caption.
10. Verify locally: `npm test`, `npm run lint`, `npx tsc --noEmit`,
    `npm run build`. Then in `npm run dev` against the development branch:
    - **A/B, owner side.** On a published guide with several revisions,
      the danger zone requires a reason; submitting blank shows the error
      and creates no request; with a reason the guide vanishes from the
      space, sidebar and search and the queue card shows the reason.
    - **A, admin side.** Preview guide from the queue: red banner with the
      reason, Pending deletion badge, picker lists every revision,
      `?rev=n` and the View published / Preview draft buttons work, no
      Edit/Publish/Revert/Delete draft/Move controls anywhere. An owner or
      member opening the same URL gets a 404.
    - **A, decisions.** Reject from the banner with a note: land on the
      guide page, guide is published again, readable by staff and
      searchable, queue shows "restored" with reason and note. Request
      deletion of a draft guide (reason optional) and reject: it comes back
      as a draft. Approve from the banner and from the queue: confirm
      dialog each time, back on the queue afterwards, the guide URL 404s
      for everyone, "deleted" appears in Recently decided. Reject from the
      queue card also lands on the guide page.
    - **C.** As a member, create a guide and save it as a draft: the edit
      page shows the outright danger zone; deleting it confirms, removes
      the guide (space list, admin guides list, tags pruned) and lands on
      the space page. Convert a published guide to draft as an owner who
      created it: the danger zone is in request mode with the reason
      required. As an owner, open a member's never-published draft: request
      mode, reason optional.
11. Commit on the feature branch. No push.

## Open questions for Chris

1. **What status does a rejected request restore?** Today: always `draft`.
   Recommended: the status the guide had when deletion was requested
   (published guides go live again, drafts stay drafts), which needs the
   `prior_status` column and migration in §4. You wrote "denying the
   deletion and re-publishing it", which reads as the recommended option;
   confirming avoids a schema change you did not want.
   Answer: please change it to the status the guide had when deletion was requested.
2. **Confirm before approving?** The banner's Approve button gets a native
   confirm (it is permanent and the admin has the guide open). Should the
   queue card's existing Approve button get the same confirm, or stay
   one-click as today? Default: add it in both places.
   Answer: add it in both places.
3. **Is the rejection reason required?** The queue's note is optional
   today. Keep it optional in the banner too, or require a reason when
   rejecting? Default: optional, matching the queue.
   Answer: optional.
4. **Owners and admins on someone else's never-published guide.** Keep the
   request flow (as asked: only the author skips review), or let owners
   and admins also delete a never-published guide outright, since nobody
   outside the space has read it? Default: keep the request flow; the
   author skips review only for their own work.
   Answer: default (author only).
5. **What counts as "previously published" for the required reason?**
   Ever published (`publishedAt` set, so a guide converted back to draft
   still needs a reason and cannot be self-deleted), or only currently
   published? Default: ever published, since staff may have read or
   printed it.
   Answer: default (ever published).
6. **Audit trail for an author's outright deletion.** Leave no record
   (like deleting a draft revision today), or write an already-approved
   deletion-request row so it shows in the queue's Recently decided list?
   Default: no record.
   Answer: default (no record).
