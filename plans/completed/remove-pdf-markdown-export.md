# Plan: Remove the Download PDF and Download Markdown exports

**Status: complete — implemented on `feat/remove-pdf-markdown-export`
(2026-09-16), tested by Chris locally and on staging; awaiting the PR to
`main`.** Lint, typecheck,
230 tests and a fresh `next build` pass; the build emits no `.wasm` file and
no Typst chunk. Before → after: lockfile 958 → 955 packages
(`xl-pdf-exporter`, `xl-typst-compiler`, `xl-typst-exporter` gone);
`node_modules` 1.0 GB → 954 MB; `.next/static` loses the 25.9 MB
`blocknote_typst_wasm_bg.<hash>.wasm` and is now 7.7 MB in total;
`npm audit --omit=dev` 0 → 0. Also trimmed the stale PDF sentence in
`src/components/mermaid-diagram.tsx`'s label comment (the Safari/DOCX reason
still stands). Open questions answered below.

## Context

The guide page's split button (`src/components/guide-actions.tsx`) offers
Print guide, Download PDF, Download DOCX, Download Markdown, Print QR code
and, by permission, Edit/Move guide. The three downloads share one lazily
loaded module, `src/components/guide-export.tsx` (plans/completed/
guide-export-menu.md), with the format list kept apart in
`src/lib/export-formats.ts` so the menu can label its items without pulling
the exporters into the page bundle.

Since plans/completed/print-guide-chrome.md landed (PR #28), printing a guide
from the browser gives a clean paper or PDF copy with no app chrome, page
break hints and a printed permanent link. Chris finds "Print → Save as PDF"
works well, which makes the PDF download redundant. The Markdown download
has no known users. Both go; the goal is fewer dependencies, for a smaller
attack surface and install footprint, even where the saving is modest.

What each download costs today (checked against the installed tree,
2026-09-16):

| Download | Direct dependency | Pulled in only for it | On disk | Shipped to the browser |
| --- | --- | --- | --- | --- |
| PDF | `@blocknote/xl-pdf-exporter` (46 MB incl. nested) | `@blocknote/xl-typst-compiler` (25 MB, wasm Typst compiler), `@blocknote/xl-typst-exporter` (336 KB) | ~72 MB | ~26 MB wasm + ~9 MB fonts on first export per page load (emitted as `/_next/static/media/blocknote_typst_wasm_bg.<hash>.wasm`) |
| Markdown | none (uses `BlockNoteEditor.blocksToMarkdownLossy` from `@blocknote/core`, which the editor needs anyway) | nothing | 0 | a few KB of lazy chunk |
| DOCX (stays, see Q1) | `@blocknote/xl-docx-exporter` (3.4 MB), `docx` (7.2 MB) | `buffer`, `image-meta`, `@blocknote/xl-multi-column` (8.2 MB, shared with the PDF exporter) | ~19 MB | the exporter chunk on demand |

So the PDF removal is where the dependency win is: three packages, the
largest wasm asset in the build, and the `xl-typst-*` release train we would
otherwise have to keep up with. Removing Markdown removes code and a menu
item but no packages. `@blocknote/diagram-block` lists
`@blocknote/xl-typst-exporter` and `docx` only as optional peers, so nothing
else keeps the Typst packages installed once `xl-pdf-exporter` goes.

Baseline to compare against after the change: `package-lock.json` resolves
957 packages; `node_modules` is about 1.0 GB.

Not in scope: `@blocknote/server-util` and `src/lib/mcp/markdown.ts` are the
MCP `create_draft` tool's Markdown *parser* (Markdown in, blocks out). They
are unrelated to the Markdown download and stay.

## Design

Everything is deletion and trimming; no new code paths, no data changes.

### 1. Dependencies

- `package.json`: remove `@blocknote/xl-pdf-exporter`. Run `npm install` so
  the lockfile drops `xl-pdf-exporter`, `xl-typst-compiler` and
  `xl-typst-exporter`. `xl-multi-column` stays (the DOCX exporter needs it).
- `overrides` are untouched: the jsdom pin is for `server-util`, the esbuild
  pin for drizzle-kit.
- `next.config.ts` is untouched (`serverExternalPackages` is about
  `server-util`).
- `vitest.config.mts` keeps the `inline: [/@blocknote\/xl-docx-exporter/]`
  entry as long as DOCX stays.

### 2. Format list — `src/lib/export-formats.ts`

`ExportFormat` becomes `"docx"` only; `EXPORT_FORMATS` keeps the one entry;
`EXPORT_FORMAT_ORDER` becomes `["docx"]`. The module stays because the menu
still needs a label and extension without importing the exporter, and a
future format slots back in without touching the menu. Update the header
comment.

### 3. Exporter — `src/components/guide-export.tsx`

Delete `toPdf`, `typstSetup`, `guideToTypst`, `metaTypst`, `footerTypst`
and `toMarkdown`. Keep `documentFor`, `metaLine`, `META_COLOR`, `META_ID`,
`RULE_ID`, `withExportMermaidConfig` (the DOCX diagram mapping still uses
it to re-apply the export Mermaid config), `toDocx`, `guideToBlob`,
`exportFilename`, `downloadBlob`, `exportGuide`. Rewrite the header comment:
it currently explains the Typst pipeline and the 26 MB compiler; it should
describe only the DOCX export and why it stays client-side and lazy. Fix the
comments on `documentFor` and the meta paragraph that mention "PDF and
DOCX" / "Markdown has no sizes". The GPL licence note stays (it covers
`xl-docx-exporter`).

`guideToBlob`'s `switch` is left in place with the single `docx` case so the
signature the tests and `exportGuide` use does not change.

### 4. Menu — `src/components/guide-actions.tsx`

No structural change: the `EXPORT_FORMAT_ORDER.map` renders one item now.
Update the header comment (menu order becomes Print guide, Download DOCX,
Print QR code, Edit guide, Move guide) and the "so this beats a PDF export"
aside, which becomes the plain reason Print is first.

The guide page (`src/app/(kb)/spaces/[slug]/guides/[guideSlug]/page.tsx`)
keeps passing `blocks`, `updatedAt` and `author`; DOCX still needs them.

### 5. Tests

- `src/components/guide-export.test.ts`: remove the Markdown test and the
  Typst test; keep the filename, byline and DOCX tests. The filename test
  currently uses `"pdf"` and `"md"`; switch both to `"docx"`. Drop the
  `guideToTypst` import and the header comment's reference to the 26 MB
  compiler and to plans/pdf-export-typst.md.
- `src/components/guide-actions.test.tsx`: the four item-list expectations
  lose "Download PDF" and "Download Markdown"; the arrow-key test expects
  "Download DOCX" after the first ArrowDown; the failure test clicks
  "Download DOCX" and expects "Couldn't prepare the DOCX: …"; update the
  "three downloads" wording in the test name and header comment.
- `src/lib/theme-classes.test.ts`: `guide-export.tsx` stays in the allowlist
  (it still holds the byline's literal grey); reword the comment from
  "PDF/DOCX exports" to "DOCX exports".

### 6. Docs

- `README.md`: line 9 ("downloaded as PDF, DOCX or Markdown" → "downloaded
  as DOCX"); the **Exports** bullet (drop the `xl-pdf-exporter`, Typst,
  wasm and Markdown sentences); the theming bullet's "PDF/DOCX exports stay
  light" → "DOCX exports stay light". The licence paragraph is still true
  as written.
- `CHANGELOG.md`, under **Unreleased**: a **Removed** entry for the PDF and
  Markdown downloads, pointing readers at Print guide (and the browser's
  Save as PDF) for a PDF copy, and noting the 26 MB compiler asset no
  longer ships. No upgrade notes: no env vars, no migrations.
- `plans/completed/pdf-export-typst.md`: add one line to its status
  paragraph, "Superseded 2026-09 by plans/remove-pdf-markdown-export.md",
  so nobody resumes it from history. Its content stays as design rationale.

## Steps

1. Branch `feat/remove-pdf-markdown-export` off `main`.
2. Record the baseline: `npm ls --all 2>/dev/null | wc -l`, lockfile
   package count, `du -sh node_modules`, `npm audit --omit=dev` summary,
   and the size of `.next/static/media/*.wasm` from a fresh `next build`.
3. Dependencies (Design §1): edit `package.json`, `npm install`, confirm
   with `npm ls @blocknote/xl-typst-compiler @blocknote/xl-typst-exporter
   @blocknote/xl-pdf-exporter` that all three report "empty" and that
   `node_modules/@blocknote/` no longer contains them.
4. Trim `export-formats.ts`, `guide-export.tsx`, `guide-actions.tsx`
   (Design §2–4). `npx tsc --noEmit` will point at every stale reference.
5. Update the tests (Design §5) and run `npm test`.
6. Docs (Design §6).
7. Verify: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.
   After the build, `find .next -name '*.wasm'` must return nothing and
   `.next/static/chunks` must contain no `typst` chunk. In the browser at
   `localhost:3000`: open a guide, confirm the menu reads Print guide /
   Download DOCX / Print QR code (+ Edit/Move by permission), DOCX still
   downloads and opens (one guide with a diagram and an image), Print guide
   still opens the print dialog, keyboard navigation still wraps.
8. Re-measure what step 2 recorded and put the before/after numbers in this
   plan's status line.
9. Commit on the branch. No push.

## Open questions

1. **Does Download DOCX stay?** The request names PDF and Markdown only, and
   DOCX is the one format printing cannot replace (an editable Word copy for
   people without KB access). Recommended: keep it, as asked. For the
   record, removing it too would delete `guide-export.tsx`,
   `export-formats.ts`, `guide-export.test.ts`, the `xl-docx-exporter`,
   `docx`, `buffer`, `image-meta` and `xl-multi-column` packages (about
   19 MB on disk), the vitest `inline` entry, the `blocks`/`updatedAt`/
   `author` props on `GuideActions`, the `guide-export.tsx` allowlist entry
   in the theme test, and the `xl-*` licence paragraph in the README.
   Answer: Keep Download DOCX
2. **Bump the version?** Removing a user-visible feature is a minor bump
   while the major is 0 (0.3.0 → 0.4.0 per the CHANGELOG's own convention).
   Recommended: leave the entry under **Unreleased** and bump in a
   separate release commit as was done for 0.3.0, so this branch stays a
   pure removal.
   Answer: do not change version number yet
3. **Keep the "Print guide leads the menu" note?** The menu comment and the
   print plan both justify Print's position against the PDF download.
   Recommended: keep Print first and shorten the justification; no UI
   change.
   Answer: Yes, please keep Print Guide first; no UI change
