# Plan: Move PDF export to BlockNote's Typst exporter

**Status: not started (planned 2026-09-12, deferred from the
dependency-audit-2026-09 plan).** Decide Q1 before starting the spike.

## Context

Guide export (`src/components/guide-export.tsx`) produces PDF, DOCX and
Markdown in the browser. PDF goes through `@blocknote/xl-pdf-exporter`'s
react-pdf `PDFExporter`, which BlockNote 0.54.1 moved to the
`@blocknote/xl-pdf-exporter/react-pdf` subpath and marked `@deprecated`:
"superseded by the Typst-based exporter … removed after a deprecation
window of a few releases". The `@blocknote/diagram-block/pdf-exporter`
mapping it relied on is already gone; the dependency-audit plan reproduced
it inline (Mermaid → PNG → react-pdf `Image`). That code has a shelf life.

The replacement at the package root is a Typst-based `PDFExporter`:
BlockNote blocks → Typst markup (`@blocknote/xl-typst-exporter`, pure) →
tagged PDF compiled client-side by the official Typst crates built to wasm
(`@blocknote/xl-typst-compiler`) → PDF/UA-1 declaration when the document
conforms. What it buys: real text with a logical structure tree (screen
readers, search, copy), vector diagrams, native code highlighting, and an
accessibility standard the react-pdf output cannot meet. What it costs:

| | react-pdf (today) | Typst |
| --- | --- | --- |
| Download on first export | ~8 MB (exporter + embedded fonts) | ~26 MB wasm + fonts: Inter body set, NewCM Math 1.7 MB, Noto Color Emoji 6.6 MB |
| Rendering | react-pdf layout | Typst compiler in a page-level singleton; later exports reuse the loaded module |
| Failures | exceptions | `toPDF` returns a result value with compiler diagnostics; user-input errors (bad Mermaid) render a placeholder, environment errors reject |
| Accessibility | untagged | tagged; PDF/UA-1 claimed only when the document conforms, otherwise "tagged but unclaimed" with the violations reported |

Everything is loaded on demand today (GuideActions → dynamic import of
guide-export → dynamic import of the exporter), so the guide page itself is
unaffected either way. Licence is unchanged: all three `xl-*` packages are
`GPL-3.0 OR PROPRIETARY`, used under GPL-3.0 like the existing exporters.

Facts checked against 0.54.2:

- `new PDFExporter(schema, mappings, options?)`; `toPDF(blocks, {title,
  lang, author, paper, margin, header, footer, tryDeclarePdfUA, assets})`
  → `{ bytes, blob, pdfUA }` or `{ error, diagnostics }`. `toTypst(blocks)`
  is the pure half and unit-testable without wasm.
- `PdfExporterOptions`: `fontFamily` (default "Inter 18pt"), `monoFontFamily`,
  `fontSize`, `emojiFontFamily`, `fonts` (default bundled), `emojiFont`
  (default bundled Noto Color Emoji), `wasm` (default: the compiler glue's
  own `new URL('blocknote_typst_wasm_bg.wasm', import.meta.url)`, which
  bundlers turn into an emitted asset).
- `@blocknote/diagram-block/typst-exporter` exports `diagramBlockMapping`
  (embeds the diagram as SVG in a tagged figure with the source as alt text).
- PDF/UA conformance needs a document title, `lang`, first heading level 1
  and consecutive levels. Our export already opens with the title as H1;
  body headings are limited to 1–3 by the schema, so an H1 followed by H3
  would be non-conforming (still exports, just unclaimed).
- Image alt text falls back to caption/name (BlockNote #2853).

## Design

- Keep the file layout: `toPdf` in `guide-export.tsx` swaps implementation;
  `guideToBlob` and the download path do not change. Delete the inline
  react-pdf diagram mapping and drop `@react-pdf/renderer` from
  `package.json` (it is only a peer of the deprecated subpath).
- Mappings: `typstDefaultSchemaMappings` plus `diagram: diagramBlockMapping`
  from `@blocknote/diagram-block/typst-exporter`. The byline override moves
  from a react-pdf `<Text>` to a Typst paragraph mapping returning
  `#text(size: 10pt, fill: rgb("#6b7b81"))[…]` built with the exporter's
  `strLit` helper for the metaLine string. The footer becomes
  `TypstDocumentOptions.footer` with a page counter
  (`title · Page N of M` via `#context` and `counter(page)`).
- `resolveFileUrl` stays the identity function (Blob URLs are CORS-open);
  confirm the option name on `ExporterOptions` and that images are fetched
  into the compiler's virtual filesystem, not through BlockNote's proxy.
- `title` = guide title, `lang` = "en", `author` = last editor. Keep
  `tryDeclarePdfUA` at its default (true); when the result says
  `nonconforming`, still download the tagged PDF and `console.info` the
  violations — no UI for it yet (Q2).
- A compile `error` (result value) surfaces through GuideActions' existing
  error path with the first diagnostic message; it is an environment
  failure, not user input, so it should be loud.
- wasm delivery (Q3): default first. Verify in `next build` output that
  Turbopack emits the 26 MB wasm as a static asset with a hashed URL and
  that the client fetches it once. If Turbopack cannot resolve the glue's
  `import.meta.url` pattern, fall back to copying
  `node_modules/@blocknote/xl-typst-compiler/pkg/blocknote_typst_wasm_bg.wasm`
  into `public/typst/` in a `prebuild` script and passing
  `wasm: "/typst/blocknote_typst_wasm_bg.wasm"`; check Vercel's static
  file size limits before choosing that route.
- Progress: the split button already shows "Preparing PDF…"; the first
  export per page load will take noticeably longer. Acceptable per Q1.

## Steps

1. Branch `feat/pdf-export-typst`. Spike first: wire `toPdf` to the Typst
   exporter with default mappings + diagram mapping, no styling overrides,
   and export one real guide locally. Record download size (DevTools
   network), time to first PDF, and whether the wasm was emitted by
   Turbopack or needs the `public/` fallback. Stop and report if the spike
   fails on wasm loading.
2. Port the byline paragraph mapping, footer, title/lang/author. Remove
   the react-pdf import, the inline diagram mapping, the PIXELS_PER_POINT
   constants and `@react-pdf/renderer`; rewrite the header comment.
3. Tests. `guide-export.test.ts` covers Markdown and DOCX headless; add a
   PDF test at the Typst layer: `TypstExporter.toTypst(documentFor(guide))`
   contains the title heading, the byline text with the 10pt/grey styling,
   a `raw(lang: "sql")` block for the code block, and a table. No wasm in
   vitest. Keep the existing tests green.
4. Error handling: an `error` result surfaces in GuideActions; a
   `nonconforming` result still downloads.
5. Verification: lint, typecheck, tests, `next build`; confirm the guide
   page's client bundle did not grow (dynamic imports intact). Manual, in
   a browser: export a guide containing every block type in
   `guide-export.test.ts`'s TEXT_BLOCKS plus an image, a diagram and an
   emoji; open in Preview and Acrobat; check text is selectable, the
   diagram is vector, the footer counts pages. Optional: `brew install
   verapdf` and run `verapdf --flavour ua1` on a conforming export.
6. Commit on the branch. No push.

## Open questions

1. **Accept the download?** ~35 MB on the first PDF export per page load
   (then cached by the browser), versus ~8 MB today. Staff export
   occasionally, mostly on office networks. Recommended: yes — the
   alternative is keeping deprecated code until BlockNote deletes it.
2. **Surface PDF/UA violations to the author?** Recommended: not now; log
   them, revisit if anyone asks for conformant PDFs.
3. **wasm hosting.** Recommended: Turbopack-emitted asset if it works in
   the spike; `public/` copy only as fallback.
4. **Timing.** BlockNote says "a few releases". Recommended: start when the
   dependency-audit PR has merged, before the next BlockNote bump.
