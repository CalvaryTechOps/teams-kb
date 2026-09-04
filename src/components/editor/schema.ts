import {
  BlockNoteSchema,
  createHeadingBlockSpec,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from "@blocknote/core";
import { createReactDiagramBlockSpec } from "@blocknote/diagram-block";

// The editor's block set. Must stay in step with the allowlist in
// src/lib/guide-content.ts — a block the editor can create but the server
// rejects would bounce the save, and vice versa would never render.
//
// Defaults minus the generic `file` block (only images, audio and video are
// meaningful in a guide, and the upload route only accepts those), headings
// capped at three levels (the guide title is the page's own h1 styling-wise,
// but editor headings render 1:1 per the plan), plus the Mermaid diagram
// block. Toggle headings/lists, colors and alignment are all kept.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { file: _file, ...keptBlockSpecs } = defaultBlockSpecs;

export const guideSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...keptBlockSpecs,
    heading: createHeadingBlockSpec({ levels: [1, 2, 3] }),
    diagram: createReactDiagramBlockSpec(),
  },
  inlineContentSpecs: defaultInlineContentSpecs,
  styleSpecs: defaultStyleSpecs,
});

export type GuideSchema = typeof guideSchema;
