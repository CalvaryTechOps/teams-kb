# Plan: Print a guide without the app chrome

**Status: implemented 2026-09-13 on `feat/print-guide-chrome`, awaiting
Chris's local print-preview check (step 7). Open questions answered
2026-09-13, all per the recommendations: the Draft/Pending badge still
prints, a print-only permanent-link line sits under the byline, page-break
hints are in `globals.css`, dark-mode printing stays out of scope.**

## Problem

Printing a guide page (`src/app/(kb)/spaces/[slug]/guides/[guideSlug]/page.tsx`)
with the browser's print dialog puts screen-only chrome on paper. In the
print preview (screenshot from Chris, 2026-09-13) these come out with the
content and should not:

- **The top bar** (`src/components/shell/top-bar.tsx`): hamburger
  sidebar toggle, breadcrumb trail (Teams KB / MP / General / title), the
  "Edit guide" action, the light/dark toggle and the user's avatar.
- **The badge row above the title** — the "MP" department badge (plus the
  category badge, "All staff" and the Draft/Pending badge when present).
  This is what the request calls "the link above the header that states
  the department".
- **The "Copy link" split button** (`src/components/guide-actions.tsx`) at
  the right end of the metadata row, chevron included.

The sidebar and the right-hand "Tags / About this guide / Permanent link"
column already don't print, but only by accident: US Letter minus the
`@page` half-inch margins is about 720 CSS px, which is below Tailwind's
`md` (768px) and `lg` (1024px) breakpoints, so the sidebar collapses to its
closed off-canvas drawer and the `hidden lg:block` aside stays hidden.
A4, landscape or smaller margins could change that, so both should be
hidden explicitly rather than relying on paper width.

What exists and matters here:

- **Tailwind v4** is in use; the `print:` variant (`@media print`) works
  out of the box and is already used on the QR label page
  (`src/app/(print)/a/[shortId]/qr/page.tsx`: `print:hidden`,
  `print:block print:p-0`). That is the convention to follow — no new CSS
  file, no `@media print` blocks in `globals.css` unless a rule can't be
  expressed as a utility.
- **`@page { margin: 0.5in }`** at the bottom of `src/app/globals.css` is
  commented as being for QR labels but is global, so it already applies to
  guide printing. Leave it; fix the comment.
- **`TopBar` is shared** by all eleven pages under `src/app/(kb)/` and the
  admin pages. Hiding it in print hides it everywhere, which is what we
  want: no page benefits from printing its breadcrumbs and avatar.
- **The `(print)` route group** (`src/app/(print)/layout.tsx`) exists for
  pages that are *only* for paper and renders no shell at all. A separate
  print route for guides is not needed: the guide page is the same content,
  so print CSS on the existing page is the smaller change and keeps one URL
  per guide.
- **Existing tests** for shell pieces assert on classes with vitest +
  happy-dom (`src/components/shell/sidebar-shell.test.tsx`,
  `src/components/guide-actions.test.tsx`), so a `print:hidden` assertion
  fits the current style. Real print output can only be checked by eye in
  the browser's preview.

## Design

All changes are `print:` utility classes on elements that already exist.
No new components, no data changes.

### 1. Hide the shell in print

- `top-bar.tsx`: add `print:hidden` to the root `div`. Covers the
  `SidebarToggle`, breadcrumbs, `actions`, `ThemeToggle` and `Avatar` in
  one place, on every page that uses it.
- `sidebar-shell.tsx`: add `print:hidden` to the sidebar column (the
  `div` with `id={SIDEBAR_ID}`) and to the drawer scrim, so the sidebar is
  gone on paper regardless of paper size or drawer state.

### 2. Strip the guide page down to the article

In `guides/[guideSlug]/page.tsx`:

- `<main>`: add `print:block print:p-0` so the article spans the printable
  area instead of sitting in a 720px grid column with 48px side padding on
  top of the page margins.
- `<aside>` (tags / about / permanent link): add `print:hidden`.
- The badge row (`div.mb-3.5.flex.flex-wrap.gap-2`): hide the department,
  category and "All staff" badges in print. Whether the Draft / Pending
  badge stays visible is open question 1; the department already appears
  in the byline ("Chris Adams, MP"), so nothing is lost by hiding it.
- The workflow notices above the title (draft-preview banner, rejection
  notice, all-staff-request notice): `print:hidden`. They carry buttons and
  forms that mean nothing on paper (open question 1 covers how a printed
  draft is still marked as such).
- `GuideActions`: add `print:hidden` to the root `div` inside
  `guide-actions.tsx` rather than wrapping it on the page, so the hiding
  travels with the component. The copied-URL fallback and error popovers
  are children of that root and disappear with it.

The metadata row (Updated · author, department · read time) stays: the
`justify-between` flex row simply loses its right-hand item and the
hairline border below it remains as the separator before the body.

### 3. Housekeeping

- Re-word the `@page` comment in `globals.css` to say it applies to every
  printed page (guides included), not just QR labels.
- If open question 3 is answered yes, add a short `@media print` block
  under `.prose-guide` in `globals.css` for page-break hints; that is the
  one thing utilities can't express per BlockNote block.

## Steps

1. Branch `feat/print-guide-chrome` off `main`.
2. `top-bar.tsx`: `print:hidden` on the root. Extend
   `sidebar-shell.test.tsx` or add a small `top-bar.test.tsx` asserting the
   class is on the root element.
3. `sidebar-shell.tsx`: `print:hidden` on the sidebar column and the scrim;
   assert in `sidebar-shell.test.tsx`.
4. `guide-actions.tsx`: `print:hidden` on the root; one assertion in
   `guide-actions.test.tsx`.
5. Guide page: `print:block print:p-0` on `main`, `print:hidden` on the
   aside, the notices and the badges per the answer to open question 1.
6. `globals.css`: fix the `@page` comment; add the page-break rules if
   open question 3 is yes.
7. Manual check on `localhost:3000`: open a published guide and a
   never-published draft, print preview in Chrome and Safari (Firefox if
   handy) at US Letter and A4, portrait, light mode. Confirm: nothing from
   the red-lined screenshot remains, the title starts the page, the
   metadata row prints without the split button, body content uses the
   full width, and the QR label page still prints as before.
8. `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`; commit
   on the feature branch. No push.

## Open questions

1. **Should the Draft / Pending badge still print?** Hiding the whole badge
   row is simplest, but then a printed draft is indistinguishable from the
   published guide. Recommendation: hide the department, category and
   "All staff" badges only, and let the warning-toned status badge print so
   a draft on paper still says "Draft".
   Answer: follow the recommendation
2. **Print the permanent link?** The aside's "Permanent link" block is
   being hidden with the rest of the column, yet a URL on paper is one of
   the few things that makes a printout more useful than a screenshot.
   Option: a small `hidden print:block` line under the metadata row,
   "Permanent link: https://…/a/{shortId}", using `permalinkUrl(APP_URL,
   g.shortId)` already computed on the page. Recommendation: yes, it is a
   one-line addition on the same page.
   Answer: follow the recommendation
3. **Page-break hints for the body?** Headings can land at the bottom of a
   page with their section on the next; images, code blocks and Mermaid
   diagrams can be split across pages. A handful of rules
   (`break-after: avoid` on `h1–h3`, `break-inside: avoid` on `img`,
   `pre`, tables and the diagram wrapper) would help. Recommendation: yes,
   small and low risk, but it is beyond the literal request so confirm.
   Answer: follow the recommendation
4. **Printing from dark mode.** The theme is `data-theme` on `<html>`,
   and browsers drop background colours when printing but keep text
   colours, so a dark-mode print puts light text on white paper. Fixing it
   means forcing the light token set under `@media print` (or flipping
   `data-theme` on `beforeprint`, which also affects Mermaid). Out of scope
   here unless Chris prints from dark mode; if so, it deserves its own item
   in `plans/housekeeping.md` or a follow-up plan.
   Answer: let's skip this for now, we will create a new plan only if this becomes an issue.

## Follow-on (2026-09-13)

After checking the printout Chris asked for a **"Print guide"** item at the
top of the split-button menu, above Download PDF, to steer people towards
printing the page (now clean on paper) rather than exporting a PDF. Done in
`guide-actions.tsx`: a `menuitem` button that closes the menu and calls
`window.print()`, with a new `PrinterIcon` in `icons.tsx`. Covered in
`guide-actions.test.tsx`.
