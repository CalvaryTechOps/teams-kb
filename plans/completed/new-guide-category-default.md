# Plan: Preselect the current category on New Guide

**Status: complete — implemented on `feat/new-guide-category-default`
(2026-09-15), tested by Chris locally and on staging; awaiting the PR to
`main`.** Open questions answered 2026-09-15, all
per the recommendations: Cancel returns to the category page, the category
appears as a breadcrumb, and saving still lands on the new guide. Verified
before the commit: lint, `tsc --noEmit`, tests and build.

## Problem

Every "New guide" button links to `/spaces/<space>/new`, and the form
there always opens with **General** selected in the Category dropdown
(`defaultValue` falls back to `""` when no `defaults.categoryId` is
passed; `src/components/guide-form.tsx`, the `<select name="categoryId">`).

Since the category pages landed (`plans/completed/category-pages.md`),
an author browsing `/spaces/tech-ops/categories/email` and clicking
"New guide" in that page's top bar is clearly writing an Email guide,
but they still have to find and pick Email in the dropdown. Forgetting
to do so files the guide under General, which is easy to miss and
needs a follow-up move.

Chris asked (2026-09-15) that the New Guide form preselect the category
of the page the button was clicked from, and keep defaulting to General
everywhere else.

Where the pieces live today:

- `src/app/(kb)/spaces/[slug]/categories/[categorySlug]/page.tsx`
  (around line 164) — the category page's "New guide" `ButtonLink`,
  hard-coded to `/spaces/${s.slug}/new`. The same file already knows
  `categorySlug` and whether it is the reserved `general` slug.
- `src/app/(kb)/spaces/[slug]/page.tsx` (around line 146) — the space
  page's "New guide" button; must keep defaulting to General.
- `src/app/(kb)/spaces/[slug]/new/page.tsx` — the New Guide page.
  Reads only `params` today, loads the space's categories, and renders
  `GuideForm` with no `defaults`. `cancelHref` is the space page.
- `src/components/guide-form.tsx` — already accepts
  `defaults.categoryId`; the edit page uses it. No change needed here.
- `src/app/(kb)/spaces/actions.ts` (`saveGuide`, around line 247) —
  reads `categoryId` from the form and validates it belongs to the space
  via `categoryInSpaceOrNull`. Nothing to change: the preselected value
  goes through the same field as a hand-picked one.
- `src/lib/categories.ts` — `GENERAL_CATEGORY_SLUG`, `categoryPath`,
  `categoryEditPath`. The natural home for a `newGuidePath` helper.

## Design

Carry the category in the URL as a query parameter and resolve it on the
server:

```
/spaces/tech-ops/new?category=email
```

- **Why a query param.** The New Guide route stays a single page; no new
  route segment, no duplicate page under `categories/[categorySlug]/new`.
  The link is bookmarkable and shareable ("write a new Email guide"),
  and a stale or misspelled slug degrades gracefully to General instead
  of 404ing. Slug rather than ID so the URL is readable and matches the
  category page the user came from.
- **Resolve server-side.** The New Guide page already awaits `params`;
  it also awaits `searchParams` (`PageProps<"/spaces/[slug]/new">`
  includes it in this Next version) and reads `category`. If it is a
  non-empty string that is not `GENERAL_CATEGORY_SLUG`, look it up in
  the categories already fetched for the dropdown (the query gains a
  `slug` column, no extra round trip). A match becomes
  `defaults.categoryId`; no match, `general`, an array value or a
  missing param all leave `defaults.categoryId` undefined and the form
  opens on General exactly as it does today.
- **Only the category page sets it.** The category page's "New guide"
  button links to `newGuidePath(s.slug, categorySlug)`. The General
  category page passes nothing (or `general`, which resolves to the same
  thing); the space page button is unchanged. The sidebar has no
  New Guide entry, and the MCP `create_draft` tool has its own category
  handling, so neither is touched.
- **Cancel returns to where you came from.** When the category resolved,
  `cancelHref` becomes `categoryPath(s.slug, slug)` so backing out lands
  on the category page rather than the space page. Otherwise it stays
  the space page. (See open question 1.)
- **Breadcrumb.** Optionally insert the category between the space and
  "New guide" when one resolved, mirroring the edit page's crumb trail.
  (See open question 2.)
- **Helper.** Add to `src/lib/categories.ts`:

  ```ts
  /** The New Guide form, optionally opened with a category preselected. */
  export function newGuidePath(spaceSlug: string, categorySlug?: string): string
  ```

  Returns `/spaces/<space>/new` with `?category=<slug>` appended only
  when a slug is given and it is not `GENERAL_CATEGORY_SLUG`
  (`encodeURIComponent` on the slug). Use it from both existing
  "New guide" buttons so the URL shape lives in one place.

No schema change, no migration, no change to `saveGuide` or the form
component.

## Steps

1. Branch `feat/new-guide-category-default` off `main`.
2. `src/lib/categories.ts`: add `newGuidePath` as above.
3. `src/lib/categories.test.ts` (new, alongside the other `src/lib`
   tests): cover `newGuidePath` with no slug, a real slug, `general`,
   and a slug that needs encoding.
4. `src/app/(kb)/spaces/[slug]/categories/[categorySlug]/page.tsx`:
   point the "New guide" button at `newGuidePath(s.slug, categorySlug)`.
5. `src/app/(kb)/spaces/[slug]/page.tsx`: point its button at
   `newGuidePath(s.slug)` (behaviour unchanged, one URL shape).
6. `src/app/(kb)/spaces/[slug]/new/page.tsx`:
   - destructure `searchParams` and await it alongside `params`;
   - add `slug: category.slug` to the categories select;
   - resolve the `category` param to a category row as described in
     Design; ignore arrays, empty strings, `general` and unknown slugs;
   - pass `defaults={{ categoryId }}` to `GuideForm` when resolved;
   - set `cancelHref` and the crumb trail per the answers to the open
     questions.
7. Verify locally (below), then commit on the feature branch. No push.

## Verification

- `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` all
  clean (there is no `typecheck` script). Typecheck matters here: `PageProps` is generated by `next dev`
  / `next typegen`, so confirm `searchParams` is typed on the route.
- On `localhost:3000`, as an owner or member of a department with at
  least two categories:
  - From a category page, click "New guide": the URL carries
    `?category=<slug>`, the Category dropdown shows that category, and
    Cancel returns to the category page.
  - Publish (or save a draft) without touching the dropdown: the guide
    appears on that category page, not under General.
  - Change the dropdown before saving: the chosen category wins (the
    preselect is only a default).
  - From the General category page and from the space page: the form
    opens on General as before.
  - Hand-edit the URL to an unknown slug, an empty value, a slug from a
    *different* department, and `?category=a&category=b`: every case
    opens on General with no error.
  - As a viewer without edit rights, `/new?category=email` still
    redirects to the space page.

## Open questions

1. **Cancel destination.** When a category was preselected, should
   Cancel go back to that category page (recommended: yes, that is where
   the user was) or stay on the space page as today?
2. **Breadcrumb.** Show the category as a crumb between the department
   and "New guide" when one is preselected? Recommendation: yes, it
   makes the preselect visible above the fold and mirrors the edit
   page; skip it if a shifting crumb trail feels noisy.
3. **After publishing.** `saveGuide` redirects to the new guide's page.
   Keep that (recommended) rather than returning to the category page?
