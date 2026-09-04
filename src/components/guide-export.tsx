"use client";

import type { Block } from "@blocknote/core";
import type { GuideBlock } from "@/lib/guide-content";
import { slugify } from "@/lib/slug";
import { EXPORT_FORMATS, type ExportFormat } from "@/lib/export-formats";
import { guideSchema, type GuideSchema } from "@/components/editor/schema";

// Turns a stored guide into a downloadable PDF, DOCX or Markdown file, in the
// browser. Client-only by construction: the diagram mappings render Mermaid
// with the DOM, and the schema pulls the editor packages in. GuideActions
// reaches this module through a dynamic import so none of it — least of all
// the ~8 MB PDF exporter with its embedded fonts — ships with the guide page;
// each format's exporter is imported on demand below for the same reason.
//
// The @blocknote/xl-* exporters are dual-licensed GPL-3.0 OR PROPRIETARY and
// used here under GPL-3.0, matching this project's licence.

export type ExportableGuide = { title: string; blocks: GuideBlock[] };

type SchemaBlock = Block<
  GuideSchema["blockSchema"],
  GuideSchema["inlineContentSchema"],
  GuideSchema["styleSchema"]
>;

/**
 * The body never contains the guide's title, so every export opens with it
 * as a level-1 heading. Stored GuideBlocks are structurally BlockNote Blocks
 * for our schema (guide-content.ts is the source of truth for that shape),
 * hence the single cast here.
 */
function documentFor({ title, blocks }: ExportableGuide): SchemaBlock[] {
  const heading = {
    id: "guide-title",
    type: "heading",
    props: {
      textColor: "default",
      backgroundColor: "default",
      textAlignment: "left",
      level: 1,
      isToggleable: false,
    },
    content: [{ type: "text", text: title, styles: {} }],
    children: [],
  };
  return [heading, ...blocks] as unknown as SchemaBlock[];
}

/**
 * Media is fetched straight from where it lives (Vercel Blob serves guide
 * uploads CORS-open) instead of through the exporters' default — BlockNote's
 * public CORS proxy — so our media URLs never reach a third party.
 */
const resolveFileUrl = async (url: string) => url;

async function toPdf(doc: SchemaBlock[], title: string): Promise<Blob> {
  const [{ PDFExporter, pdfDefaultSchemaMappings }, { diagramBlockMapping }, reactPdf] =
    await Promise.all([
      import("@blocknote/xl-pdf-exporter"),
      import("@blocknote/diagram-block/pdf-exporter"),
      import("@react-pdf/renderer"),
    ]);
  const exporter = new PDFExporter(
    guideSchema,
    {
      ...pdfDefaultSchemaMappings,
      blockMapping: {
        ...pdfDefaultSchemaMappings.blockMapping,
        diagram: diagramBlockMapping,
      },
    },
    { resolveFileUrl },
  );
  const { Text } = reactPdf;
  const footer = (
    <Text
      style={{ fontSize: 9, color: "#6b7b81", textAlign: "center" }}
      render={({ pageNumber, totalPages }) =>
        `${title} · Page ${pageNumber} of ${totalPages}`
      }
    />
  );
  const pdfDocument = await exporter.toReactPDFDocument(doc, { footer });
  return reactPdf.pdf(pdfDocument).toBlob();
}

async function toDocx(doc: SchemaBlock[]): Promise<Blob> {
  const [{ DOCXExporter, docxDefaultSchemaMappings }, { diagramBlockMapping }] =
    await Promise.all([
      import("@blocknote/xl-docx-exporter"),
      import("@blocknote/diagram-block/docx-exporter"),
    ]);
  const exporter = new DOCXExporter(
    guideSchema,
    {
      ...docxDefaultSchemaMappings,
      blockMapping: {
        ...docxDefaultSchemaMappings.blockMapping,
        diagram: diagramBlockMapping,
      },
    },
    { resolveFileUrl },
  );
  return exporter.toBlob(doc);
}

async function toMarkdown(doc: SchemaBlock[]): Promise<Blob> {
  const { BlockNoteEditor } = await import("@blocknote/core");
  // Never mounted: a headless editor exists only to run the conversion.
  const editor = BlockNoteEditor.create({ schema: guideSchema });
  const markdown = editor.blocksToMarkdownLossy(doc);
  return new Blob([markdown], { type: "text/markdown;charset=utf-8" });
}

/** Pure conversion — no DOM side effects — so tests can inspect the output. */
export async function guideToBlob(
  format: ExportFormat,
  guide: ExportableGuide,
): Promise<Blob> {
  const doc = documentFor(guide);
  switch (format) {
    case "pdf":
      return toPdf(doc, guide.title);
    case "docx":
      return toDocx(doc);
    case "md":
      return toMarkdown(doc);
  }
}

export function exportFilename(title: string, format: ExportFormat): string {
  return `${slugify(title)}.${EXPORT_FORMATS[format].extension}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a moment to start the download before freeing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Convert and hand the file to the browser as a download. */
export async function exportGuide(
  format: ExportFormat,
  guide: ExportableGuide,
): Promise<void> {
  const blob = await guideToBlob(format, guide);
  downloadBlob(blob, exportFilename(guide.title, format));
}
