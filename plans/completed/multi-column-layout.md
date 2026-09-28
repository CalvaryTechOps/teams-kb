# Plan: Multi-column layout in the guide editor

**Status: complete — implemented on `feat/multi-column` (2026-09-27),
tested by Chris locally and on staging; awaiting the PR to `main`.** Open
questions answered with the defaults; tests, lint, typecheck and build
passed before the push. Notes from implementation: no
DOCX changes were needed (the default mapping covers the blocks); the
editor's base dictionary comes from `@blocknote/core/locales`, and the
column-boundary shadow is re-coloured with the theme's border tokens.

## Problem

Authors want to place blocks side by side (two or three columns) the way
the upstream BlockNote editor allows, for things like a screenshot next to
the steps it illustrates, or two short lists that belong together. The
guide editor has no way to do that today: every block stacks vertically.

What exists and matters here:

- **The editor** (`src/components/editor/blocknote-editor.tsx`) is BlockNote
  0.54.2 with the Mantine UI. Its schema (`src/components/editor/schema.ts`)
  is the defaults minus the generic `file` block, headings capped at three
  levels, plus the Mermaid `diagram` block. The slash menu is the default
  item list combined with the diagram items via `combineByGroup`.
- **The column blocks already sit in `node_modules`.** BlockNote ships
  multi-column as a separate package, `@blocknote/xl-multi-column`, and the
  DOCX exporter we use depends on it, so 0.54.2 is installed transitively
  (noted as unused in `plans/completed/guide-export-menu.md`). It is
  dual-licensed GPL-3.0 OR PROPRIETARY like the exporter, which the project
  already uses under GPL-3.0. What it provides:
  - `withMultiColumn(schema)` extends a schema with two block types:
    `columnList` (no props, no inline content, children are columns) and
    `column` (one prop, `width`, a flex-grow ratio defaulting to `1`; no
    inline content; children are ordinary blocks). The ProseMirror nodes
    require a `columnList` to hold at least two columns and a column to
    hold at least one block.
  - `getMultiColumnSlashMenuItems(editor)` gives "Two Columns" and "Three
    Columns" items (group "Basic blocks", aliases `columns`, `row`,
    `split`). They read their labels from `editor.dictionary.multi_column`,
    so the editor needs the package's English locale merged into its
    dictionary or the items throw.
  - `multiColumnDropCursor` supplies the `dropCursor.hooks` that turn a
    drag to the left or right edge of a block into a vertical drop cursor;
    the matching drop handler that creates or extends a column list is
    bundled into the column block spec, as is the column-resize extension
    (drag the boundary between two columns). Nothing beyond the schema and
    the drop-cursor option needs wiring.
  - BlockNote's core stylesheet already styles `.bn-block-column-list` and
    `.bn-block-column` inside the editor (flex row, a 4px shadow between
    columns, resize cursor). The shadow colours are hard-coded greys.
- **The stored format is ours, not BlockNote's.** `src/lib/guide-content.ts`
  hand-writes the accepted block types (`GuideBlock`, `BLOCK_TYPES`) and
  validates every save with `parseGuideContent`; an unknown block type
  bounces the save. The same file owns the text projections: the approval
  queue diff lines (`blocksToLines`), search text and reading time
  (`blocksToPlainText`), and the empty-document check.
- **Everything downstream reads `GuideBlock`:**
  - `src/components/guide-content.tsx` server-renders the page body
    (guide page, move page, pending-deletion preview, print) and is styled
    by the `.prose-guide` rules in `src/app/globals.css`.
  - `src/components/guide-export.tsx` feeds the stored blocks straight
    into the DOCX exporter with `guideSchema`. `docxDefaultSchemaMappings`
    already contains `columnList` and `column` mappings (that is why the
    exporter depends on the package).
  - `src/components/content-diff.tsx` diffs `blocksToLines` output.
  - `src/lib/external-media.ts` walks `children` generically, so images
    inside columns are already found.
  - The MCP `get_guide` tool returns the raw block array; `create_draft`
    converts Markdown, which cannot express columns, so it never produces
    them.
- **Layout.** The guide page renders the article in a column that shares
  the row with a sidebar from `lg` up, so the body is roughly 640–720px
  wide on desktop and full-width on phones.

## Design

### 1. Package

Add `@blocknote/xl-multi-column@0.54.2` as a direct dependency, exact-pinned
like the other BlockNote packages (`npm i -E`). It is the version already
resolved in the lockfile, so nothing else moves. Its icons come from
`react-icons`, which the package bundles, so no new dependency appears.

### 2. Editor

`src/components/editor/schema.ts`:

```ts
export const guideSchema = withMultiColumn(
  BlockNoteSchema.create({ blockSpecs: { ...keptBlockSpecs, heading, diagram }, ... }),
);
```

`src/components/editor/blocknote-editor.tsx`:

- `useCreateBlockNote` gains `dropCursor: multiColumnDropCursor` (its shape
  is `{ hooks }`, which is exactly `DropCursorOptions`) and
  `dictionary: { ...locales.en, multi_column: multiColumnLocales.en }`
  (`locales` from `@blocknote/core/locales`, `locales` from the column
  package aliased). The editor currently uses the default dictionary; the
  merge keeps every existing string.
- The slash menu combines three item lists:
  `combineByGroup(getDefaultReactSlashMenuItems(editor),
  getMultiColumnSlashMenuItems(editor), getDiagramSlashMenuItems(editor))`.
  The two column items land in "Basic blocks" under their own names;
  typing `/columns`, `/row` or `/split` finds them. See Q1 for whether to
  give them their own group.
- Creating columns by dragging a block to another block's edge, adding a
  column by dropping at the outer edge of a column list, resizing columns,
  and Backspace/Delete merging are all package behaviour and need no code.

Editor CSS in `globals.css` (`.guide-editor …`): override the hard-coded
column-boundary shadow with `var(--color-border)` so it follows the theme,
for both the default and `.bn-column-resize-border` states. BlockNote marks
dark mode on the container with `data-color-scheme="dark"`, so a single
token-based rule covers both themes.

### 3. Stored format and validation (`src/lib/guide-content.ts`)

Two new members of `GuideBlock` and `BLOCK_TYPES`:

```ts
| { type: "columnList"; props: Record<string, never>; content: undefined }
| { type: "column"; props: { width: number }; content: undefined }
```

`parseBlock` gains structural rules, since these are the first blocks whose
meaning depends on their parent:

- A `columnList` must have at least two children and every child must be a
  `column`; anything else fails validation with a path in the message, like
  the other structural errors.
- A `column` is accepted only as a direct child of a `columnList`; a column
  anywhere else fails. It must have at least one child block.
- A `columnList` inside a column (at any depth) is rejected (Q2). The
  editor's own slash item and drop handler both avoid creating one, so this
  only guards against hand-made JSON.
- `width`: a finite number in `(0, 100]`, else `1`. Stored as the editor
  gives it (a flex-grow ratio, not a percentage).

`parseBlock` needs to know its parent's type for the "column only under
columnList" rule; pass the parent type down alongside `depth`. `MAX_DEPTH`
(10) is untouched: a column list uses two levels.

`CONTENT_VERSION` stays `1` (Q6): the change is additive, every existing
document still validates unchanged, and the only renderer is this app.

Projections:

- `blocksToLines` (approval diff): a `columnList` emits one line per
  column, `[column 1 of 2]`, at the current depth, with that column's
  blocks indented one level beneath it (Q4). Column markers make a
  formatting-only "moved into columns" edit visible in the queue, and a
  text edit inside a column still diffs line by line.
- `blocksToPlainText` (search, reading time): both new types contribute no
  words of their own; the existing `walk(block.children)` picks up the
  column contents.
- `isEmptyDocument`: unchanged; a column list counts as content.

### 4. Reading page (`src/components/guide-content.tsx`, `globals.css`)

- `columnList` renders `<div class="columns">`; each `column` renders
  `<div class="column" style="flex-grow: <width>">` containing
  `renderBlocks(column.children, ctx)`. Reusing `renderBlocks` keeps list
  grouping and heading-anchor deduplication (shared `ctx`) working inside
  columns.
- CSS: `.prose-guide .columns { display: flex; gap: 24px; margin: 0 0 20px }`
  and `.prose-guide .column { flex: 1 1 0; min-width: 0 }` (the inline
  `flex-grow` then reproduces the editor's proportions; `min-width: 0`
  lets long words, code blocks and tables shrink instead of overflowing).
  Media inside a column already scales with `max-width: 100%`.
- Narrow screens: below Tailwind's `sm` breakpoint (640px) the container
  switches to `flex-direction: column` so phones read top to bottom in
  document order (Q3).
- Print: columns stay side by side (Q5). No `break-inside: avoid` on the
  container: a long column list must be allowed to continue on the next
  page. Verified manually in step 9.

### 5. DOCX export

No code change expected: `guideSchema` now includes the two blocks, so the
default mapping's `columnList`/`column` entries apply and the stored blocks
pass through `documentFor` as before. Step 9 checks that an exported
two-column guide opens in Word with the columns intact.

### 6. MCP

`get_guide` already returns raw BlockNote JSON and says so; agents will
simply see `columnList`/`column` blocks. Extend the tool description in
`src/lib/mcp/server.ts` with one sentence naming the two layout blocks so
an agent rendering the content knows `column.children` holds the text.
`create_draft` is untouched.

### 7. Out of scope

- Column layout controls beyond what the package offers (no "4 columns"
  item, no per-column background or alignment).
- A mobile editing experience for columns; BlockNote's editor behaviour
  on narrow screens is taken as is.
- Markdown import of columns via MCP.

## Steps

1. Branch `feat/multi-column` off `main`.
2. `npm i -E @blocknote/xl-multi-column@0.54.2`. Confirm the lockfile only
   promotes the existing entry.
3. Extend `guideSchema` with `withMultiColumn`; wire `dropCursor`,
   `dictionary` and the slash items in `blocknote-editor.tsx`; add the
   column-boundary colour override under `.guide-editor` in `globals.css`.
4. `src/lib/guide-content.ts`: add the two block types, the structural
   validation (parent type threaded through `parseBlock`), width
   sanitising, the `blocksToLines` column markers, and the no-op cases in
   `blocksToPlainText`. Update the header comment in
   `src/components/editor/schema.ts` that ties the two allowlists together.
5. `src/lib/guide-content.test.ts`: a valid two-column document round-trips
   with width kept; a one-column list fails; a non-column child of a list
   fails; a column outside a list fails; an empty column fails; a nested
   column list fails; a bad width becomes 1; `blocksToLines` shows the
   `[column n of m]` markers with indented content; `blocksToPlainText`
   includes column text once; a column list is not an empty document.
6. `src/components/guide-content.tsx` + `.prose-guide` CSS: render the two
   blocks per §4. `src/components/guide-content.test.tsx`: the markup
   contract (container class, per-column `flex-grow` style, blocks inside
   columns rendered, headings inside columns get deduped ids, consecutive
   list items inside a column form one list).
7. Add the sentence about layout blocks to the `get_guide` description.
8. Verify locally: `npm test`, `npm run lint`, `npx tsc --noEmit`,
   `npm run build`.
9. In `npm run dev`: insert two and three columns from the slash menu; drag
   a block to the edge of another to create columns and to a column list's
   outer edge to add one; resize a column boundary; put a heading, list,
   image, table and diagram inside columns; save and reopen (the editor
   restores the widths); read the page in light and dark themes, at phone
   width (stacked) and in print preview (side by side, and a long column
   list continues across pages); check the approval-queue diff for a
   column edit; export the guide to DOCX and open it; call `get_guide`
   over MCP and confirm the blocks come through.
10. Commit on the feature branch. No push.

## Open questions

1. **Slash-menu grouping.** Leave the package's "Two Columns" and "Three
   Columns" in "Basic blocks" (default), or move them into their own
   "Layout" group by overriding `group` on the items?
   Answer: default, "Basic blocks".
2. **Nested column lists.** Reject a `columnList` inside a column at
   validation time (default; the editor avoids creating them, so nothing
   an author does gets bounced), or accept and render them recursively?
   Answer: default, rejected.
3. **Stacking breakpoint on the reading page.** Stack below 640px
   (default), or keep columns side by side at every width?
   Answer: default, stack below 640px.
4. **Diff line format.** `[column 1 of 2]` marker lines with the column's
   content indented beneath (default), or flatten columns into the
   surrounding text with no markers, so moving text into columns reads as
   "no content changes"?
   Answer: default, marker lines.
5. **Print.** Keep columns side by side on paper (default), or stack them
   like the phone layout?
   Answer: default, side by side.
6. **`CONTENT_VERSION`.** Keep it at 1 since the change is additive
   (default), or bump to 2 so MCP consumers can tell documents that may
   contain layout blocks from older ones?
   Answer: default, stays at 1.
