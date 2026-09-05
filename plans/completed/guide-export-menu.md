# Plan: "Copy link" split button with PDF / DOCX / Markdown export and Edit

**Status: complete — implemented 2026-09-04 on `feat/guide-export-menu`, merged to `main` via PR #2.** Open questions below are
answered. Notes from implementation: format labels live in
`src/lib/export-formats.ts` so the menu never imports the exporters; the
DOCX exporter is inlined in `vitest.config.ts` because its lazy `buffer`
import doesn't resolve under Node's ESM loader.

## Problem

A guide page (`src/app/(kb)/spaces/[slug]/guides/[guideSlug]/page.tsx`) has
no way to share or take the content elsewhere: readers copy the address bar
by hand, and there is no download at all. Staff want a PDF or Word copy to
print, attach to a ticket or hand to someone without KB access, and a
Markdown copy for pasting into Teams/other tools.

Target UI (from the mockup): a **split button** at the right end of the
metadata row ("Updated Sep 3, 2026 · Chris Adams, MP · 1 min read"), above
the hairline that separates the header from the body.

- Main segment: link icon + **Copy link** — copies the guide's URL.
- Chevron segment: opens a menu with **Download PDF**, **Download DOCX**,
  **Download Markdown**, and — for users who may edit — **Edit guide**.

What exists and matters here:

- **Content format.** A guide body is a BlockNote JSON document
  (`GuideBlock[]`, `src/lib/guide-content.ts`), validated on write. The
  editor schema (`src/components/editor/schema.ts`) is the BlockNote
  defaults minus `file`, headings capped at 3 levels, plus the Mermaid
  `diagram` block from `@blocknote/diagram-block`. BlockNote is pinned at
  `0.54.0` for every `@blocknote/*` package.
- **Exporters.** `@blocknote/xl-pdf-exporter@0.54.0` (react-pdf) and
  `@blocknote/xl-docx-exporter@0.54.0` (docx.js) are dual-licensed
  `GPL-3.0 OR PROPRIETARY`; this project is `GPL-3.0-only`, so the GPL
  grant applies and no commercial licence is needed. Both take
  `(schema, mappings, options)`. Neither knows our `diagram` block, but
  `@blocknote/diagram-block` ships matching mappings at
  `@blocknote/diagram-block/pdf-exporter` and `…/docx-exporter`
  (`diagramBlockMapping`) that render Mermaid to an image **in the
  browser** — so exports must run client-side (or supply a server
  `renderDiagram`; see design).
- **Markdown** comes from `editor.blocksToMarkdownLossy(blocks)` on a
  `BlockNoteEditor` — a headless (never mounted) editor created with
  `BlockNoteEditor.create({ schema: guideSchema })` is enough.
- **Default file resolver leaks URLs.** Both exporters fetch images via
  `options.resolveFileUrl`, which *defaults* to BlockNote's public CORS
  proxy (`https://corsproxy.api.blocknotejs.org/…`). Our media lives on
  Vercel Blob at public-but-unguessable URLs (README); routing those through
  a third party would hand the URLs to BlockNote's servers. Override it.
- **Bundle weight.** The PDF exporter's dist is ~7.8 MB (Inter + GeistMono
  embedded as base64 JS chunks), DOCX ~2.6 MB. Neither may be in the guide
  page's initial JS.
- **Edit permission.** The header's "Edit guide" (`TopBar actions`) renders
  only when `perms.canEdit` from `resolveGuidePermissions` — space members
  (owners included) and admins. The menu's Edit item uses the *same* flag
  and the same href (`/spaces/{slug}/guides/{guideSlug}/edit`).
- **UI kit.** `src/components/ui.tsx` has `Button`/`ButtonLink`
  (`secondary` = white, grey-300 border) and `buttonClasses()`; icons are
  hand-inlined Lucide-style SVGs in `src/components/icons.tsx` (`LinkIcon`,
  `PencilIcon`, `ChevronDownIcon`, `CheckIcon` exist; there is no download
  icon). There is no dropdown/menu primitive anywhere yet; Mantine is only a
  BlockNote peer dependency and isn't used by app UI, so don't reach for it.
- **Client components** here are small and hand-rolled (`sidebar-nav.tsx`,
  `guide-danger-zone.tsx`); tests use vitest + happy-dom
  (`guide-editor-submit.test.tsx` shows the pattern).

## Design

### 1. Where it lives and what it gets

The guide page is a server component. Add one client component,
`GuideActions` (`src/components/guide-actions.tsx`), rendered inside the
metadata row, and pass it everything it needs as props so it never fetches:

```tsx
<GuideActions
  path={`/spaces/${s.slug}/guides/${g.slug}`}   // canonical, no ?rev=
  title={revision.title}
  blocks={revision.content}                     // the revision being viewed
  editHref={perms.canEdit ? `/spaces/${s.slug}/guides/${g.slug}/edit` : undefined}
/>
```

Passing `revision.content` serialises the document JSON into the page. That
is the same content already rendered as HTML for this viewer (the page has
already passed `perms.canRead`), so nothing new is exposed; the body cap is
2 MB and real guides are a few KB. The alternative — a route handler that
re-checks permissions and returns the JSON on demand — is more moving parts
for no security gain; skip it.

Layout change in `page.tsx`: the meta `<div>` becomes
`flex flex-wrap items-center justify-between gap-y-3`, with the existing
spans grouped in a left `<div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">`
and `GuideActions` as the right item. On narrow widths it wraps under the
meta text; on desktop it sits right-aligned as in the mockup. Keep the
`border-b … pb-5` on the outer row.

### 2. The split button (`GuideActions`)

Two adjacent `<button>`s sharing one border, styled from `buttonClasses({ variant: "secondary", size: "md" })`
with the shared edge squared off (`rounded-r-none` / `rounded-l-none -ml-px`)
so the divider between them is a single grey-300 hairline (matches mockup).

- **Main segment** — `<LinkIcon size={15} /> Copy link`. On click:
  `navigator.clipboard.writeText(new URL(path, window.location.origin).href)`.
  Success flips the label to `<CheckIcon /> Copied` for ~2 s (with
  `aria-live="polite"` on the label span so screen readers hear it), then
  reverts. If the clipboard API is unavailable or rejects (non-secure
  context, permissions), show the URL in a small read-only, auto-selected
  `<input>` under the button with "Press ⌘/Ctrl+C to copy" — no `alert()`.
- **Chevron segment** — `aria-haspopup="menu"`, `aria-expanded`,
  `aria-label="More actions"`, `<ChevronDownIcon size={14} />`. Toggles the
  menu.
- **Menu** — an absolutely positioned panel (`right-0 top-full mt-1.5`,
  white, grey-200 border, `rounded-lg shadow-sm`, ~220 px wide) with
  `role="menu"`; items are `role="menuitem"` buttons/links:
  1. `<DownloadIcon /> Download PDF`
  2. `<DownloadIcon /> Download DOCX`
  3. `<DownloadIcon /> Download Markdown`
  4. *(only when `editHref`)* a hairline `border-t` then
     `<PencilIcon /> Edit guide` as a `<Link>`.

  Behaviour: Escape closes and returns focus to the chevron; click outside
  or focus leaving the component closes; ArrowDown/ArrowUp move between
  items, Home/End jump, Enter/Space activate. Opening focuses the first
  item. Implement with a `useRef` + `mousedown`/`focusout` listeners; no
  library.
- **Busy / error state.** While an export runs, the chosen item reads
  "Preparing PDF…" and all download items are disabled (`aria-disabled`);
  the menu stays open until the download starts, then closes. A failure
  closes the menu and shows a `role="alert"` line under the button in the
  editor's error style (`text-xs text-danger`), cleared on the next action.

Add `DownloadIcon` to `icons.tsx` (Lucide "download": tray + arrow).

### 3. Export module (`src/components/guide-export.ts`, client-only)

One function, loaded lazily so the heavy packages never ship with the page:

```ts
// in GuideActions
const { exportGuide } = await import("./guide-export");
await exportGuide(format, { title, blocks });
```

`exportGuide(format: "pdf" | "docx" | "md", { title, blocks })` builds the
document, converts it, and triggers the download. Inside it, import the
format's exporter with a further `await import(...)` so choosing Markdown
never loads react-pdf.

Shared pieces:

- **Title first.** The body doesn't contain the title; prepend a synthetic
  `heading` level-1 block (`id: "title"`, default props) so every export
  opens with the guide's name.
- **Types.** Stored `GuideBlock[]` is structurally a BlockNote `Block[]`
  for our schema; cast the way `blocknote-editor.tsx` already does
  (`as unknown as Block<GuideSchema["blockSchema"], …>[]`). If the exporter
  balks at a normalised shape (e.g. table cells always in `tableCell` form,
  `previewWidth` absent), fix in a small adapter here, not in the parser.
- **Files.** `resolveFileUrl: async (url) => url` — Vercel Blob serves with
  `Access-Control-Allow-Origin: *` so the browser can fetch it directly
  (verify in step 5). This keeps media URLs off BlockNote's proxy. Should a
  Blob URL ever fail CORS, fall back to a same-origin
  `/api/media-proxy?url=` route restricted to our Blob hostname and gated on
  `getSession()` — but only build that if needed.
- **Filename.** `${slugify(title) || "guide"}.${ext}` via `src/lib/slug.ts`.
  Download by `URL.createObjectURL(blob)` → hidden `<a download>` click →
  `revokeObjectURL` on the next tick.

Per format:

- **PDF.**
  ```ts
  import { PDFExporter, pdfDefaultSchemaMappings } from "@blocknote/xl-pdf-exporter";
  import { diagramBlockMapping } from "@blocknote/diagram-block/pdf-exporter";
  import { pdf } from "@react-pdf/renderer";
  const exporter = new PDFExporter(guideSchema, {
    ...pdfDefaultSchemaMappings,
    blockMapping: { ...pdfDefaultSchemaMappings.blockMapping, diagram: diagramBlockMapping },
  }, { resolveFileUrl });
  const doc = await exporter.toReactPDFDocument(blocks, { footer: <PageNumbers/> });
  const blob = await pdf(doc).toBlob();
  ```
  `PDFExporter` in 0.54 has **no `toBlob`** (DOCX does) — go through
  `@react-pdf/renderer`'s `pdf()`; add `@react-pdf/renderer` as a direct
  dependency since we import it (it's already a dep of the exporter). Fonts:
  the exporter registers its bundled Inter/GeistMono; react-pdf can't load
  WOFF2, so Metropolis stays out and the PDF uses Inter (see Q3). Emoji use
  the default Twemoji-from-jsDelivr source, fetched only when a document
  contains emoji — acceptable. Footer: optional small "Page N of M" using
  react-pdf's `render={({pageNumber,totalPages}) => …}`; header omitted
  since the title heading already leads.
- **DOCX.**
  ```ts
  import { DOCXExporter, docxDefaultSchemaMappings } from "@blocknote/xl-docx-exporter";
  import { diagramBlockMapping } from "@blocknote/diagram-block/docx-exporter";
  const blob = await new DOCXExporter(guideSchema, {
    ...docxDefaultSchemaMappings,
    blockMapping: { ...docxDefaultSchemaMappings.blockMapping, diagram: diagramBlockMapping },
  }, { resolveFileUrl }).toBlob(blocks);
  ```
- **Markdown.**
  ```ts
  import { BlockNoteEditor } from "@blocknote/core";
  const editor = BlockNoteEditor.create({ schema: guideSchema }); // headless
  const md = editor.blocksToMarkdownLossy(blocks);
  ```
  Blob type `text/markdown;charset=utf-8`. Check what the `diagram` block
  becomes (BlockNote goes via the block's external HTML); if it comes out
  empty, post-process by rendering diagrams as ```` ```mermaid ```` fences —
  `blocksToLines` in `guide-content.ts` already does exactly that and can be
  the reference. Media blocks become links/images by URL, which is the
  expected "lossy" behaviour.

`guideSchema` pulls `@blocknote/core` + `diagram-block` (the same modules the
editor page uses), so this module is client-only by construction; it is only
ever reached through the dynamic import in `GuideActions`, never from a
server component.

### 4. Edit guide — header and menu

Both render from the same `perms.canEdit` and point at the same edit route,
so membership rules can't drift. The header button stays (Q1) — the menu
item is a convenience so the whole action set is in one place near the
title, as in the mockup.

### 5. Verify during implementation (not assumptions)

- `next build` route table: the guide page's First Load JS must not grow
  beyond a few KB from `GuideActions`; the exporter chunks appear only as
  separate lazy chunks. If Turbopack/webpack hoists them, split the format
  imports into their own files.
- Fetch a Vercel Blob image URL from the browser console on the deployed
  app and confirm `Access-Control-Allow-Origin` is present; otherwise build
  the proxy route noted in §3.
- The PDF/DOCX diagram mapping needs `mermaid` (already a dependency via
  `diagram-block`) and runs in the browser — confirm a guide with a diagram
  exports as an image, and an invalid diagram exports as the placeholder,
  not an exception.
- Type-check the cast from `GuideBlock[]` to the schema's `Block[]`; if
  TypeScript needs `as unknown as`, keep it in one place with a comment
  pointing at `guide-content.ts` as the source of truth.
- Run `npm run lint` — `@react-pdf/renderer` JSX in a `.ts` file needs the
  module to be `.tsx`.

### 6. Out of scope (deliberately)

- Server-side export (would need a headless Mermaid renderer such as
  mermaid-cli/Kroki and would put react-pdf in a serverless function).
- ODT/HTML export (diagram-block also ships an ODT mapping; add later if
  asked).
- Exporting a guide's *history* or a specific version other than the one on
  screen.
- Embedding Metropolis in the PDF (needs TTF/OTF conversion; Q3).
- Bulk export of a whole space.

## Steps

1. `npm i -E @blocknote/xl-pdf-exporter@0.54.0 @blocknote/xl-docx-exporter@0.54.0 @react-pdf/renderer` — exact-pinned like the other BlockNote packages. Note `@blocknote/xl-multi-column` arrives as a transitive dependency; it is unused.
2. Add `DownloadIcon` to `src/components/icons.tsx`.
3. Write `src/components/guide-export.tsx` (§3) with per-format lazy imports and the download helper.
4. Write `src/components/guide-actions.tsx` (§2): split button, menu, copy, busy/error states, keyboard handling.
5. Wire it into `page.tsx` (§1) and restyle the meta row.
6. Tests (vitest + happy-dom):
   - `guide-actions.test.tsx`: menu opens/closes (click, Escape, outside click); ArrowDown focuses items; "Edit guide" present only with `editHref` and links to it; Copy writes the canonical absolute URL (mock `navigator.clipboard`) and shows "Copied"; a rejected clipboard write shows the fallback input; choosing a download calls the mocked export module with the right format.
   - `guide-export.test.ts`: Markdown output for a fixture containing every `GuideBlockType` starts with `# {title}` and contains a ```` ```mermaid ```` fence; DOCX conversion of the same fixture yields a non-empty Blob (docx.js runs in Node; stub `resolveFileUrl`/mermaid image rendering). PDF conversion is browser-only in practice — cover it manually.
7. README: add exports to the feature list and a short note under License that the `@blocknote/xl-*` packages are used under their GPL-3.0 option.
8. Update this file's status line and commit on the feature branch. Chris tests locally, then decides when to push to staging and open the PR.

## Test plan

- Reader who is **not** a space member (all-staff guide): split button shows Copy link; menu has the three downloads and **no** Edit item; header has no Edit button either.
- Space member / owner / admin: Edit item present in the menu and header, both go to `/edit`.
- Copy link on a `?rev=draft` preview copies the canonical URL without the query string (per Q2).
- Download PDF / DOCX on a guide containing: headings 1–3, bullets, nested numbered list with a custom start, checklist, toggle list, quote, code block, Mermaid diagram, table with header row and coloured cells, divider, image, video, audio, and links. Every block appears; the diagram is an image; video/audio appear as links; the file opens in Preview/Word without repair prompts.
- Same guide → Markdown: opens the file, headings/lists/code fences correct, diagram as a mermaid fence, images as `![](url)`.
- Long guide (many pages): PDF paginates, footer page numbers if implemented.
- Network tab during a PDF export: no requests to `corsproxy.api.blocknotejs.org`.
- Initial load of a guide page: no exporter/react-pdf chunks in the Network tab until a download is clicked.
- Keyboard only: Tab to Copy, Tab to chevron, Enter opens, arrows move, Enter downloads, Escape closes and returns focus.
- Mobile width: button wraps under the meta line; menu stays within the viewport.

## Open questions for Chris

1. **Keep the header Edit button too?** The plan keeps both (header for
   consistency with other pages, menu item per the mockup). Or should the
   header button go now that Edit lives in the split menu?j
   Answer: Keep both for now and we'll learn from users which they prefer.
2. **Which URL does Copy link copy?** Planned: the canonical guide URL
   (`/spaces/{slug}/guides/{guideSlug}`), even while previewing a draft with
   `?rev=draft` — recipients generally can't see drafts. Alternatively copy
   exactly what's in the address bar.
   Answer: the canonoical guide URL
3. **PDF font.** react-pdf can't use the site's Metropolis WOFF2 files, so
   PDFs use the exporter's bundled Inter. Fine, or worth converting
   Metropolis to TTF (it's public domain) and registering it via the
   exporter's `fonts`/`fontFamily` options for on-brand PDFs?
   Answer: Use Inter as the font.
4. **Draft/unpublished exports.** Should exporting a draft or pending
   revision stamp "Draft" into the title (e.g. "How to correct an email
   address (draft v3)") so printed copies of unapproved content are
   recognisable? Planned: no marking in v1.
   Answer: no marking in v1
