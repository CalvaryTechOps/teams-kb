# Plan: Copy externally hosted guide images to Vercel Blob

**Status: implemented on `feat/import-external-images` (2026-09-16),
awaiting Chris's local test.** Open questions answered 2026-09-16: old KB
images are public; images only; external SVGs are neither offered nor
copied; notice bar under the editor; 10 MB cap. Verified before the commit:
tests, lint, typecheck, build.

## Context

Images that an author pastes or drops into the BlockNote editor as *files*
go through `uploadFile` (`src/components/editor/upload.ts`): the browser
uploads them straight to our public Vercel Blob store and the image block
stores the Blob URL. Images that arrive as part of pasted *HTML* from
another website take a different path. BlockNote parses the `<img>` into
an image block (`node_modules/@blocknote/core/src/blocks/Image/parseImageElement.ts`)
and keeps the source site's URL as the block's `url` prop; `uploadFile` is
never involved. `parseGuideContent` (`src/lib/guide-content.ts`) accepts
any http(s) media URL, so the guide saves fine and renders fine — until the
other site removes the file.

Chris is migrating guides from an old knowledge base into this one by
pasting. Every pasted image still points at the old system. When the old
system is shut down, its images go with it and the migrated guides break.

The ask, verbatim in spirit: do **not** force a copy, because some guides
may deliberately embed external images; but when a guide being edited
contains externally hosted images, show a single button that copies each
one to our Blob store and rewrites the block to the new URL, keeping the
same size and alignment the author already has.

What already exists and is reused:

- `src/lib/uploads.ts` — the image content-type allowlist (PNG, JPEG, GIF,
  WebP; no SVG), the 10 MB cap, and the `guides/<uuid>.<ext>` pathname
  convention. The copied file must satisfy exactly these rules so the Blob
  store holds one kind of object regardless of how it got there.
- `src/app/api/upload/route.ts` — the session-gated token route. It shows
  the JSON error shape (`{ error }`) and the readiness probe pattern.
- `@vercel/blob` 2.8 — already a dependency. Its server-side `put()` accepts
  a `ReadableStream`/`Blob` body. (`putImage()` can fetch from a URL itself,
  but it *requires* re-encoding through Image Optimization with a forced
  width and OIDC auth, so it is the wrong tool for a faithful copy.)
- The image block's layout props. BlockNote stores the author's resize as
  `previewWidth` (px) and the position as `textAlignment`; caption, `name`,
  `showPreview` and `backgroundColor` sit alongside. Replacing **only**
  `url` via `editor.updateBlock(id, { props: { url } })` therefore preserves
  scaling and positioning by construction; the reader page (`renderMedia` in
  `src/components/guide-content.tsx`) already renders from those props.

Why the copy must run on the server: the browser cannot read a cross-origin
image's bytes unless the other site sends CORS headers, and old intranet
systems generally do not. A route handler fetches the image, checks it, and
streams it into Blob. The browser never touches the bytes.

Not in scope: video and audio blocks with external URLs (see Q2), images
referenced inside diagram source or as link targets, and any change to how
the published guide is rendered.

## Design

### 1. Pure helpers — `src/lib/external-media.ts`

No React, no BlockNote import, unit-tested like `guide-content.ts`.

- `isOwnBlobUrl(url: string): boolean` — true when the URL parses and its
  hostname ends with `.public.blob.vercel-storage.com` (the SDK itself
  recognises the store by the `.blob.vercel-storage.com` suffix, see
  `node_modules/@vercel/blob/dist/index.js`). Anything else that passes
  `isSafeMediaUrl` is "external". If a custom Blob domain is ever
  configured, this gains an env override; not needed now.
- `externalImageBlocks(blocks: GuideBlock[]): { id: string; url: string }[]`
  — depth-first over `children`, returning every `image` block whose `url`
  is non-empty and not ours. Order is document order so progress reads
  naturally.
- `sniffImageType(head: Uint8Array): string | undefined` — magic-byte
  detection for PNG, JPEG, GIF and WebP (RIFF….WEBP). Old servers commonly
  label images `application/octet-stream` or `text/plain`; the sniff is the
  fallback that lets those still be accepted, and it also guards against a
  server claiming `image/png` for a file that is not one.

### 2. Server copy — `src/lib/image-import.ts` + `src/app/api/upload/import/route.ts`

Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
before writing the route (per AGENTS.md).

`importImage(sourceUrl, deps)` in `src/lib/image-import.ts` holds the
logic with `fetch` and `put` injected, so it is testable without network
or Blob:

1. **Validate the URL.** Must be http(s), no embedded credentials, host not
   `localhost`, not a `.local`/`.internal` name, not an IP literal in a
   loopback, link-local or private range. Reject with a plain message. This
   is basic SSRF hygiene for a route only signed-in authors can call; DNS
   rebinding is out of scope and noted in the code comment.
2. **Fetch** with `redirect: "follow"`, `AbortSignal.timeout(20_000)`, a
   plain `Accept: image/*` header and a UA identifying the app. Re-run the
   host check on the final `response.url` after redirects. Non-2xx →
   "The other site returned <status>."
3. **Decide the type.** Use the `Content-Type` header if
   `uploadKindForType()` says `image`; otherwise read the first 16 bytes and
   `sniffImageType()`. Neither → "Only PNG, JPEG, GIF or WebP images can be
   copied" (SVG deliberately excluded, see Q3).
4. **Enforce the cap.** If `Content-Length` is present and over
   `UPLOAD_KINDS.image.maxBytes`, refuse before reading. Otherwise read the
   body into memory with a running count and abort past the cap (10 MB in
   memory in a function is fine; streaming into `put()` would lose the ability
   to enforce the cap mid-stream and to sniff).
5. **Store** with `put("guides/<uuid>.<ext>", bytes, { access: "public",
   contentType, addRandomSuffix: false })` — the same pathname shape and
   extension mapping as browser uploads, so `uploadKindForPathname()` stays
   the single description of what lives in the store.
6. Return `{ url }`.

The route handler (`POST /api/upload/import`, body `{ url: string }`):
`getSession()` or 401; `BLOB_READ_WRITE_TOKEN` missing → 503 with the same
message the upload route uses; bad body → 400; then `importImage` and
either `{ url }` or `{ error }` with 4xx/502. `export const maxDuration =
60` so a slow origin does not hit the default function timeout. The
`proxy.ts` matcher already excludes `/api`, matching the upload route.

### 3. Editor UI — `src/components/editor/blocknote-editor.tsx`

- Keep an `externalImages` state, recomputed in the existing `onChange`
  handler (and once on mount) via `externalImageBlocks(editor.document)`.
  The document is already serialised on every change, so this adds one
  cheap walk.
- When the list is non-empty, render a notice bar under the editor in the
  same slot and style family as the `uploadError` bar, but informational:
  "*N* image(s) on this page are hosted on other websites and will
  disappear if those sites remove them." with a small secondary
  `Button`: **Copy images to this site**. Nothing is shown when every image
  is already ours, so guides that intentionally embed external images just
  see the notice and ignore it — the copy is never automatic.
- On click: disable the button, dedupe by URL (the same external image
  used twice is fetched once), then `POST /api/upload/import` for each
  distinct URL **sequentially** with progress text "Copying 2 of 5…". For
  each success call `editor.updateBlock(id, { props: { url } })` on every
  block that used that URL. Only `url` changes; `previewWidth`,
  `textAlignment`, `caption`, `name`, `showPreview`, `backgroundColor` are
  untouched, which is what keeps the scaling and positioning identical.
  BlockNote records the updates in its undo stack, so ⌘Z reverts a copy.
- Failures are per image: the loop continues, and the bar ends with
  "Copied 4 of 5. 1 couldn't be copied: <reason>." The block that failed
  keeps its external URL and stays counted, so the button remains available
  to retry.
- Nothing is persisted by the button itself. The rewritten document reaches
  the server only when the author clicks Publish / Save draft, through the
  existing hidden-input sync and `parseGuideContent`. Blobs uploaded and
  then abandoned (author cancels) are orphaned exactly like an uploaded
  image the author deletes today — same accepted tradeoff, no new cleanup.

### 4. Docs

- README "Media: Vercel Blob" bullet and the Known tradeoffs entry gain a
  sentence: externally hosted images pasted from other sites stay external
  unless the author copies them; the copy route fetches server-side.
- `src/lib/uploads.ts` header comment: note the import route as a second
  writer that follows the same rules.
- CHANGELOG entry under Unreleased.

### 5. Tests

- `src/lib/external-media.test.ts`: `isOwnBlobUrl` for a store URL, a
  look-alike (`evil.com/x.public.blob.vercel-storage.com`), http vs https,
  an unparsable string; `externalImageBlocks` on a fixture with nested
  children, an unfilled block (empty url), a video block (ignored), and a
  mix of own and external; `sniffImageType` on the four magic prefixes and
  on junk.
- `src/lib/image-import.test.ts` with injected `fetch`/`put`: private-host
  refusal, redirect to a private host refusal, content-type accepted,
  octet-stream sniffed to PNG, wrong type refused, `Content-Length` over
  cap refused, body over cap aborted, success returns `put`'s URL and passes
  a `guides/<uuid>.png` pathname with the right `contentType`.
- Route handler and editor button are exercised manually (BlockNote needs a
  real browser, as `guide-editor-submit.test.tsx` notes). Manual check
  list: paste HTML with an image from a public site → notice appears with
  the count; resize and right-align it; click copy → URL changes to the
  Blob store, width and alignment unchanged in the editor and on the
  published page; paste an SVG → clear per-image failure, other images
  still copied; sign out in another tab → 401 message surfaces.

## Steps

1. Branch `feat/import-external-images` off `main`.
2. Add `src/lib/external-media.ts` with tests.
3. Add `src/lib/image-import.ts` with tests; read the route-handler doc;
   add `src/app/api/upload/import/route.ts`.
4. Add the notice bar and copy flow to `blocknote-editor.tsx`.
5. README, `uploads.ts` comment, CHANGELOG.
6. Local verification: `npm test`, `npm run lint`, `npx tsc --noEmit`,
   `npm run build`, then the manual check list above against
   `localhost:3000`.
7. Commit on the feature branch. (No push; Chris tests and asks.)

## Open questions

1. **Are the old KB's images fetchable without a login?** The server copy
   works only for URLs a plain anonymous request can read. If the old
   system serves images behind its own session, the route will get a 401
   or a login page (which the type check will reject with "not an image").
   *Check:* open one pasted image URL in a private browser window. If it
   needs a login, the options are to make the old system's media public
   for the duration of the migration, or to save-and-drop those images by
   hand; a browser-side fallback would not help because the old site
   would also need CORS headers. Recommendation: verify before building;
   the design does not change either way, but the expectation does.
   Answer: Yes, old KB's images are fetchable without a login
2. **Images only, or video/audio too?** The request names images. The
   helpers generalise trivially (kind from `uploadKindForType`), but video
   is capped at 250 MB and would not fit an in-memory function copy.
   Recommendation: images only now; leave a note.
   Answer: go with recommendation
3. **External SVGs.** The upload allowlist excludes SVG on purpose (script
   risk). Copying one would need the same exception on the reader side.
   Recommendation: refuse them, per image, with a clear reason; the block
   keeps working from the external URL.
   Answer: Accept Recommendation, do not show button to import SVGs
4. **Placement.** Notice bar under the editor with the button in it
   (recommended, appears only when relevant) versus a permanent toolbar or
   slash-menu item. The bar also doubles as the "you have fragile images"
   warning Chris will want during the migration.
   Answer: go with recommendation
5. **Size cap.** Same 10 MB as browser uploads (recommended) or higher for
   the migration? A higher cap is one constant, but the reader page serves
   whatever is stored.
   Answer: Keep the same 10 MB as browser uploads
