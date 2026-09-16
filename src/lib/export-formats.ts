// The download formats a guide offers. Kept apart from the export code so the
// menu can label its items without pulling the exporter into the page bundle.
// DOCX is the only format today (PDF and Markdown downloads were removed in
// favour of Print guide; see plans/remove-pdf-markdown-export.md); a future
// format slots back in here without touching the menu.

export type ExportFormat = "docx";

export const EXPORT_FORMATS: Record<
  ExportFormat,
  { label: string; extension: string }
> = {
  docx: { label: "DOCX", extension: "docx" },
};

export const EXPORT_FORMAT_ORDER: ExportFormat[] = ["docx"];
