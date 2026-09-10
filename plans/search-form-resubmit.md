# Plan: Submit the search form explicitly (Enter or a Search button)

**Status: implemented on `feat/search-form-resubmit` (2026-09-10), awaiting
Chris's local testing and a PR to `main`.**
Lint, typecheck, tests and build pass. The open questions from the first
draft were answered by Chris on 2026-09-10 (see "Decisions" below). One
deviation from the design: the Search button uses the `lg` size (48px) with
no height override — a Tailwind height override would lose to the size class
in stylesheet order — so it sits 4px taller than the 44px tag input.

## Problem

On `/search?q=…`, editing the query in the main search box and pressing
Enter does nothing, and picking a different department in the "All
departments" dropdown does nothing either. Only the tag filter re-runs the
search — and when it does, it carries along whatever was typed in the box
and whatever department was picked, so the *form* is wired correctly; it is
just never submitted by those two controls. The sidebar search box works
from every page, including `/search`.

### Why Enter does nothing

The form in `src/app/(kb)/search/page.tsx` is a plain
`<form action="/search">` with **no submit button**. HTML's implicit
submission rule (the thing that makes Enter submit a form) says: if a form
has no submit button and **more than one** field that "blocks implicit
submission" (text-like inputs: `text`, `search`, `email`, `number`, …),
pressing Enter must do nothing. This form has two such fields — the
`type="search"` query box and the `TagPicker`'s `type="text"` combobox — so
browsers refuse to submit it.

The sidebar form has exactly one text field (`q`) and no other inputs, so
implicit submission works there. That is the whole difference.

The `TagPicker` also calls `e.preventDefault()` on Enter inside its own
combobox (`onKeyDown` in `src/components/tag-picker.tsx`) so picking a tag
never submits the guide form. That is correct and must stay; it only affects
Enter *inside the tag box*, not Enter in the query box.

### Why the department dropdown does nothing

A native `<select>` never submits its form on change. The tag filter
re-runs the search because `TagPicker` (a client component) calls
`form.requestSubmit()` after each change when given `submitFormOnChange`.
The `<select>` has no equivalent.

### Why not make everything auto-submit

Every re-search is a full server render of the page and the `(kb)` layout:
session and access checks, the spaces list, tag counts, the search itself,
plus the sidebar's per-department counts, categories and site settings —
roughly eight queries against Neon per submission. Auto-submitting on each
tag or department change spends one of those renders per click while the
user is still setting up their filters. It also gives the form three
controls with two different behaviours, and a `<select>` that submits on
`change` fires once per arrow-key press in Chrome and Firefox.

## Decisions (answered 2026-09-10)

- **Explicit submission only.** The search re-runs when the user presses
  Enter in the query box or clicks a Search button. Changing the department
  or adding/removing tags updates the form but does **not** submit it.
- **Button label:** "Search" (sentence case, matching the app's CTAs).
- **Button placement:** to the right of the tag field, below the department
  dropdown — i.e. the second row of the form holds the "Filter by tag"
  picker and the Search button beside it.
- `next/form` is not adopted here; it stays a possible follow-up (client-side
  navigation instead of a full reload) and is unrelated to this fix.

## Design

One rule for the whole form: change anything, then press Enter or click
Search. No client-side submission logic remains on this page.

### 1. Add the Search button

Use the existing `Button` primitive from `src/components/ui.tsx`
(`variant="primary"`, `type="submit"`). Form layout becomes:

```
[ 🔍 Search articles                          ] [ All departments ▾ ]
Filter by tag
[ Any tag — guides matching any of them …     ]  [ Search ]
```

Concretely, in the form's second row wrap the tag block and the button in a
flex container aligned to the bottom (`flex items-end gap-3 basis-full`) so
the button lines up with the tag input rather than its label. The tag
picker keeps its `max-w-[480px]`; the button sits immediately to its right.
`size="lg"` (48px) is closest to the tag input's 44px; if the 4px mismatch
looks off in the browser, set the button's height to match the input.

With a submit button present, the implicit-submission rule no longer
applies, so Enter in the query box submits. The tag combobox still swallows
its own Enter via `preventDefault`, exactly as today — half-typed tag text
never submits or posts.

### 2. Remove auto-submit from the tag filter

Drop `submitFormOnChange` from the `TagPicker` usage in the search page.
Since that page is the prop's only consumer, also delete the prop from
`TagPicker` itself: the `submitFormOnChange` parameter and type, the
`submitPending` ref, the `useEffect` that calls `requestSubmit()`, and the
`if (submitFormOnChange)` line in `updateSelected` (which then just calls
`setSelected`). Update the header comment's filter-mode paragraph to drop
the "re-runs the enclosing GET form on every change" clause. `useEffect`
may become an unused import — remove it if so.

`TagPicker`'s `key` remount on the search page (keyed by the active slugs)
stays: it is what resets the picker's internal state after a submission.

### 3. Department dropdown

Unchanged markup, unchanged behaviour: it is a plain `<select name="space">`
whose value is posted when the form submits. Nothing to add.

### Non-goals / not changing

- **Search logic** (`src/lib/guide-search.ts`) and the URL shape
  (`?q=&space=&tag=&tag=`) — untouched.
- **Sidebar search** — already works; leave it alone.
- **A "filters changed, press Search" hint** — would need client state to
  know the form is dirty; skipped. Stale results below un-submitted filters
  is the ordinary "apply filters" pattern.

## Steps

1. Create `feat/search-form-resubmit` off `main`.
2. `src/components/tag-picker.tsx`: remove the `submitFormOnChange` prop,
   the `submitPending` ref and its effect, and the corresponding comment
   text, as described in Design §2.
3. `src/app/(kb)/search/page.tsx`:
   - remove `submitFormOnChange` from the `<TagPicker …>` props;
   - restructure the second row of the form as a `flex items-end` container
     holding the existing tag block and a new
     `<Button type="submit" variant="primary" size="lg">Search</Button>`
     (import `Button` from `@/components/ui`);
   - rewrite the code comment above the tag filter: the tag picker and the
     department select only *hold* filter values; the form submits on Enter
     in the query box or via the Search button.
4. Tests (vitest, `src/components/tag-picker.test.tsx`):
   - remove `submitFormOnChange` from the filter-mode test's props (it
     would otherwise be a type error);
   - the existing assertions still hold — hidden slug inputs, no "Create"
     row. No new test is needed for the removed behaviour.
   - Add one `renderToStaticMarkup` assertion, alongside the filter-mode
     test, that a `<form>` containing the filter-mode picker plus
     `<Button type="submit">Search</Button>` renders exactly one
     `type="submit"` element and that the combobox input has no `name` —
     documenting the implicit-submission fix and that only picked tags post.
5. Manual test plan (local, `npm run dev`):
   - Sidebar search from `/` → lands on `/search?q=…` (unchanged).
   - On `/search`, change the query text, press Enter → URL and results
     update; the chosen department and tags are preserved.
   - Change the department → nothing happens until Enter/Search; then the
     results reflect it.
   - Add and remove tags → nothing happens until Enter/Search; then the
     results reflect the tags, query and department together.
   - Click Search with focus nowhere in particular → submits.
   - Enter inside the tag combobox still only picks the highlighted tag
     and never submits the form or posts half-typed text.
   - Clear the query and remove all filters, submit → "all guides" summary
     as today.
6. Run `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.
7. Commit on the feature branch and update this file's status line. No
   push.

## Open questions

None outstanding. Earlier questions (button placement, arrow-key churn on
the dropdown, adopting `next/form`) were settled by the decisions above.
