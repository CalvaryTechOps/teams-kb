# Plan: Remove the CSS border around images in guides

**Status: complete — implemented on `feat/article-image-border`
(2026-09-15), tested by Chris locally (staging skipped for a CSS-only
change); awaiting the PR to `main`.** Open questions answered
2026-09-15, all per the recommendations: video loses the border too, the
8px radius goes as well, nothing replaces the border in dark mode.
Verified before the commit: lint, typecheck, tests and build.

## Problem

Every image in a published guide is drawn with a 1px `--color-border`
outline and 8px rounded corners. That comes from the reader stylesheet,
not from the image itself. It was added with the admin theme
(commit `ff8c173`) so screenshots would sit visibly on the page in both
light and dark mode.

In practice it fights the images authors actually upload. Screenshots
that already carry a white margin, a window drop shadow, a macOS-style
rounded frame, or a transparent background end up with a second, visibly
different edge drawn around them: a grey line hugging a white margin, or
a hard rectangle cutting across a soft shadow. The image looks framed
twice. Chris flagged this on 2026-09-15 and asked for the CSS border to
go so images render as authored.

Where the rules live (`src/app/globals.css`):

- `.prose-guide img` (around line 257) — `max-width`, **`border`**,
  `border-radius`, `margin`. A safety net for any bare `<img>` inside
  guide prose.
- `.prose-guide figure img, .prose-guide figure video` (around line 340)
  — `max-width`, `margin: 0`, **`border`**, `border-radius`. This is the
  rule that actually applies: `renderMedia` in
  `src/components/guide-content.tsx` always wraps image, video and audio
  blocks in a `<figure class="media-<type>">`, so every guide image hits
  it.

Neither rule is exercised by tests: `guide-content.test.tsx` pins the
HTML markup contract, not the CSS. The print block at the bottom of
`globals.css` only sets `break-inside: avoid` on images and is unaffected.

The Typst PDF export (`src/components/guide-export.tsx`) does not draw a
border around images, and the BlockNote editor (`.guide-editor`) uses
BlockNote's own media styling rather than `.prose-guide`, so the reader
page is currently the odd one out: authors do not see the border while
editing, and it does not appear in the PDF.

## Design

Delete the `border` declaration from both rules and leave everything
else in place: `max-width: 100%` still keeps images inside the column,
the figure keeps its `gap` and margins, the caption styling is untouched.
Nothing changes in the renderer or the tests — this is a two-line CSS
change.

Two related decisions are left as open questions rather than assumed:
whether `<video>` (which shares the figure rule) loses the border too,
and whether the 8px `border-radius` goes with it. The recommendation for
both is yes, for the same reason as the border: the reader should show
the image exactly as the author supplied it, and a rounded clip on a
screenshot with its own square corners or shadow is the same kind of
double framing.

Dark mode: without the border, a light screenshot on the dark page has a
hard edge where the image ends. That is the honest rendering of the
image and matches what the editor already shows in dark mode, so no
substitute (background tint, shadow) is proposed. If that reads badly in
practice it can be revisited as its own item.

## Steps

1. Branch `feat/article-image-border` off `main`.
2. In `src/app/globals.css`, remove `border: 1px solid var(--color-border);`
   from `.prose-guide img` and from
   `.prose-guide figure img, .prose-guide figure video`. Apply the
   answers to the open questions (radius, video) in the same two rules.
3. Fold in the pending status-line notes for `plans/completed/print-guide-chrome.md`
   (PR #28) and `plans/completed/pdf-export-typst.md` (PR #27): both are
   merged and live in production.
4. Verify locally, then commit on the feature branch. No push.

## Verification

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all
  clean (the change is CSS-only; these guard against a stray edit).
- On `localhost:3000`, open a guide that has at least one image with its
  own white margin or drop shadow and one plain screenshot. Confirm no
  grey outline in light mode and dark mode, that captions and alignment
  (left / center / right) are unchanged, and that a `previewWidth`-sized
  image still respects its width.
- Check a guide with a video block for the same.
- Print preview of the same guide: images still avoid page breaks and
  render without an outline.
- The move page (`.../guides/[guideSlug]/move`) also uses `.prose-guide`;
  glance at it once.

## Open questions

1. **Video too?** The figure rule borders `<video>` as well as `<img>`.
   Recommendation: drop it there too. A video player already has its own
   controls chrome, and keeping the border on one media type but not the
   other would look inconsistent.
2. **Keep the 8px `border-radius`?** Without the border the radius still
   clips the image's corners. Recommendation: remove it as well, so
   screenshots with square corners, frames or shadows are not clipped.
   Keep it only if the softened corners are wanted as a house style.
3. **Anything for dark mode?** Recommendation: nothing — render the image
   as-is, same as the editor and the PDF. Revisit only if real guides
   look wrong.
