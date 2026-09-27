# Plan: Always show the current revision, pick others from the sidebar

**Status: implemented 2026-09-27 on `feat/revision-picker` (revision
picker, then draft deletion in a second commit), awaiting local testing by
Chris. Open questions below are answered.** Notes from
implementation: the never-published-draft case renders no banner at all (the
Draft badge covers it), and the red "was rejected" banner gained a "View
submission" button so the rejected content is one click away even without
the picker.

## Problem

Opening a guide (`src/app/(kb)/spaces/[slug]/guides/[guideSlug]/page.tsx`)
does not reliably land an owner or admin on the version everyone else
reads. Today's rules, all in the page component:

- The bare URL renders the published revision (`guide.currentRevisionId`).
- `?rev=draft` renders the newest `draft`/`pending` revision instead. The
  approval queue's title and "Preview" links and the guide page's own
  "Preview draft" button all use it, and once there the URL sticks through
  reloads and bookmarks, so a reviewer keeps seeing the draft.
- A never-published guide always renders its newest draft/pending revision
  because there is nothing else to show.
- A never-published guide whose **only** revision was rejected renders
  nothing at all: the page finds neither a draft/pending nor a published
  revision and calls `notFound()`. That is a bug in its own right.
- A rejected revision is never rendered as the body; it only appears as the
  red "Submission vN was rejected" banner.

There is no way to look at any other revision: the picker in this plan is
the first history UI the schema comment in `src/db/content-schema.ts`
("version-history-ready even though v1 ships no history UI") was waiting
for.

What the user asked for:

1. The guide URL always shows the **current** version: the published
   revision when there is one.
2. Owners and admins get a **drop-down of every revision**, drafts and
   rejected submissions included, in the right column under the
   "Print QR code" section, newest on top, oldest at the bottom.
   Choosing one shows that revision.

What exists and matters here:

- **Revisions.** `guide_revision` rows are monotonic per guide (`version`),
  each with `status` in `draft | pending | published | rejected |
  superseded`, `authorId`, `createdAt`, `reviewedAt`, `reviewNote`. Exactly
  one row is `published` at a time (the one `guide.currentRevisionId`
  points at); publishing supersedes the previous one. A resubmission
  supersedes the previous `pending` row, so `superseded` covers both
  "formerly published" and "replaced submission".
- **Permissions.** `resolveGuidePermissions` gives `canApprove` to space
  owners and admins. The page today lets `canEdit` users (members) see an
  unpublished revision only if they authored it (`canSeeRevision`), so a
  member never reads a colleague's unapproved work. That rule must survive.
- **Sidebar.** The right column (`<aside>`) is `hidden lg:block
  print:hidden` and stacks Tags, About this guide, and Permanent link (with
  the "Print QR code" link) as bordered sections under `MicroLabel`s.
- **Selects.** No select primitive in `src/components/ui.tsx`;
  `src/components/move-form.tsx` carries the house `<select>` classes.
  Client components use `useRouter` from `next/navigation`
  (`sign-out-button.tsx`).
- **Actions.** `publishLatestDraft(guideId)` in
  `src/app/(kb)/spaces/actions.ts` publishes the newest draft, whichever
  one is on screen. `approveRevision`/`rejectRevision` already work on a
  specific revision id, with the comment "never 'the latest'".
- **Other readers of revisions** are unaffected: the MCP `get_guide` tool
  joins on `currentRevisionId`; the space and category pages count pending
  rows; the edit page starts from the newest revision the editor may see.

## Design

### 1. Which revision the page renders

Replace the `rev=draft` switch with a numeric one: `?rev=<version>`.

- **No `rev`** → the published revision. For a never-published guide, the
  newest revision the viewer may see, whatever its status (draft, pending
  **or rejected**), which also fixes the rejected-only 404.
- **`rev=<n>`** → revision `n` if it exists and the viewer may see it
  (approvers: any; others: the published one or their own). Otherwise the
  parameter is ignored and the default renders; no error, no hint that a
  hidden revision exists. Anything that doesn't parse as a positive integer
  is ignored the same way.
- `rev=draft` is dropped, not aliased. The two queue links become
  `?rev=${rev.version}` (the queue already has the row), and the guide
  page's own "Preview draft"/"Preview submission" buttons link to the
  latest unpublished revision's version number.

Pure decision logic moves into a new `src/lib/guide-revisions.ts` (no
server imports, unit-tested):

```ts
type RevisionMeta = { id; version; status; authorId; createdAt };
parseRevisionParam(raw: string | string[] | undefined): number | undefined
visibleRevisions(all: RevisionMeta[], viewer: { userId; canApprove }, currentRevisionId): RevisionMeta[]
chooseRevision(visible: RevisionMeta[], requested: number | undefined, currentRevisionId): RevisionMeta | undefined
revisionHref(basePath: string, rev: RevisionMeta, currentRevisionId): string   // bare path for the current one
revisionStatusLabel(rev, currentRevisionId): "Published" | "Draft" | "Pending approval" | "Rejected" | "Superseded"
```

The page loads **one list** of the guide's revisions (every column except
`content`, joined to `user.name`, ordered by `version desc`), filters it
with `visibleRevisions`, picks with `chooseRevision`, then fetches that one
row's `content`. This replaces today's three separate queries
(`unpublishedRows`, `rejectedRows`, `publishedRevision`); the existing
banners (newer draft waiting, pending, rejected, "You're previewing")
derive from the same list.

### 2. The picker

New client component `src/components/revision-picker.tsx`:

- A native `<select aria-label="Revision">` with the move form's select
  classes, full width of the column. One `<option>` per visible revision,
  newest first, value = version number, label like
  `v7 · Published · Sep 12, 2026 · A. Author` (see Q3 for the author
  part). The option for the rendered revision is selected.
- `onChange` calls `router.push(revisionHref(...))`. The published
  revision's href is the bare guide path, so picking it clears `?rev`.
- Rendered only when `perms.canApprove` (owners and admins; Q2 covers
  members). Placed in the aside as a new bordered section **below** the
  Permanent link / Print QR code block, under `MicroLabel` "Revisions",
  with a one-line muted caption: "Only the published revision is visible
  to readers."
- The aside is already `print:hidden`; the picker inherits that. It is
  also hidden below the `lg` breakpoint like the rest of the aside; the
  in-article banners remain the route to a draft on narrow screens.

### 3. Banners when the rendered revision is not the current one

Keep the existing warning-toned banner above the badges, generalised from
"draft or pending" to any non-current revision:

- Draft: "You're viewing draft v3. The published version is v5."
  Buttons: **View published**, and for approvers **Publish this draft**.
- Pending: same wording with "pending submission"; approvers get
  **Review in queue**.
- Rejected: "You're viewing rejected submission v3 (rejected 3 days
  ago)…" plus the reviewer note, **View published**, **Edit guide**.
- Superseded: "You're viewing v3, which was superseded. The published
  version is v5." with **View published**.
- Never-published guide: no "View published" button; the existing
  "awaiting owner approval before this guide goes live" wording stays.

The "A newer draft (vN) is waiting" banner still shows on the current
revision when a newer draft/pending exists, linking to `?rev=N`. The red
"Submission vN was rejected" banner still shows on the current revision
when the rejection is the guide's latest word, and now links to `?rev=N`
as well as to Edit.

### 4. Publishing the revision on screen

`publishLatestDraft(guideId)` becomes `publishDraftRevision(revisionId)`:
same permission gate, but it verifies the row is a `draft` of a
non-deleted guide and publishes exactly that row (superseding the current
published one), mirroring `approveRevision`. The banner's Publish button
binds the id of the draft being viewed; the "newer draft is waiting"
banner binds the newest draft's id. Publishing an older draft while a
newer one exists is allowed and leaves the newer draft untouched (Q4).

Restoring a superseded revision (re-publishing old content) is **not** in
scope; it needs a copy-as-new-revision step and belongs in a later plan.

### 5. Deleting a draft (added 2026-09-27 after the first round)

Looking at a draft from the picker is often how one finds out it is
worthless. The "You're viewing draft vN" banner gets a **Delete draft**
button (danger style, native confirm via `ConfirmForm`) that calls a new
`deleteDraftRevision(revisionId)` action:

- Only `draft` rows qualify. Pending submissions are rejected from the
  queue, not deleted; published, superseded and rejected rows are history.
- Owners and admins may delete any draft; an editor only a draft they
  wrote. `canDeleteRevision` in `src/lib/guide-revisions.ts` decides for
  the button, the action re-checks.
- A guide's last remaining revision is never deleted: removing the guide is
  `requestGuideDeletion`'s admin-reviewed job. The button stays hidden in
  that case (a never-published guide's newest draft is its default view
  and shows no banner anyway).
- The row is hard-deleted; version numbers keep their gap. When a
  never-published guide loses its newest draft, `guide.title` is reset to
  the newest remaining revision's title so lists stay truthful.
- Afterwards the page redirects to the bare guide URL.

### 6. Out of scope

- Diffing two arbitrary revisions (the queue's `ContentDiff` stays as is).
- Starting the editor from a chosen revision (`/edit?rev=n`).
- Any change to the MCP tools, search, or the print/QR pages.

## Steps

1. Branch `feat/revision-picker` off `main`.
2. Add `src/lib/guide-revisions.ts` with the helpers in §1 and
   `src/lib/guide-revisions.test.ts` covering: bad/absent `rev`; approver
   sees all; member sees only own + published; default is published;
   default for never-published falls back to newest visible including a
   lone rejected revision; hidden revision requested by a member is
   ignored; href of the current revision is the bare path; status labels.
3. Add `src/components/revision-picker.tsx` and
   `revision-picker.test.tsx` (happy-dom, mock `next/navigation`'s
   `useRouter`): options newest first, current one selected, change pushes
   the expected href, published option pushes the bare path.
4. Rewrite the revision selection in the guide page around the single list
   query + content fetch; wire `searchParams.rev` through
   `parseRevisionParam`; render the picker in the aside for approvers;
   generalise the banners per §3.
5. Rename `publishLatestDraft` → `publishDraftRevision(revisionId)` in
   `src/app/(kb)/spaces/actions.ts` and update its callers.
6. Update the queue page's two `?rev=draft` links to `?rev=${rev.version}`.
   `grep -rn 'rev=draft' src` must come back empty.
7. Update the comment in `src/db/content-schema.ts` that says no history UI
   ships.
8. Verify locally: `npm test`, `npm run lint`, `npx tsc --noEmit`,
   `npm run build`. Then in `npm run dev` against the development branch:
   open a guide with a newer draft (lands on published, picker lists
   both, choosing the draft shows it with the banner, Publish this draft
   works); a guide with a rejected submission (picker shows it, banner
   shows the note); a never-published guide with only a rejected revision
   (renders instead of 404); a member account sees no picker and gets the
   published revision for a colleague's `?rev=n`.
9. Commit on the feature branch. No push.
10. (Second round) Add `deleteDraftRevision` and `canDeleteRevision` with
    tests, the Delete draft button on the viewing banner, and re-run the
    checks in step 8 plus: delete a draft from the banner, confirm the
    published version is untouched and the picker no longer lists it; a
    guide whose only revision is a draft offers no delete.

## Open questions

1. **Where does the draft show up today without `?rev=draft`?** The code
   only renders a draft by default for never-published guides; otherwise
   it needs the `rev=draft` link the queue and the "Preview draft" button
   produce. Is the sticky `?rev=draft` URL the case you hit, or is there
   another path (a specific guide, a rejected v1 that 404s)? The design
   covers all of these, but knowing confirms nothing is missed.
   Answer: I was wrong, I was looking at a never published draft.  Viewing articles with changes shows the most recent.
2. **Members who authored drafts.** Show them the picker too, limited to
   their own revisions plus the published one, or keep it owner/admin only
   as asked and leave members with the banners? Default: owner/admin only.
   Answer: owner/admin only.
3. **Option label.** `v7 · Published · Sep 12, 2026` with or without the
   author's name at the end? Default: include it; the list query joins
   `user` anyway.
   Answer: include it
4. **Publishing an older draft.** When viewing draft v3 while draft v4
   also exists, offer "Publish this draft" (publishes v3, v4 stays a
   draft) or only offer publishing on the newest draft? Default: allow it.
   Answer: allow it
5. **Superseded label.** One word "Superseded" for both formerly-published
   revisions and replaced submissions, or split them (would need the
   `reviewedBy`/`reviewedAt` heuristic: a superseded row with a reviewer
   was once published)? Default: one word.
   Answer: one word.
