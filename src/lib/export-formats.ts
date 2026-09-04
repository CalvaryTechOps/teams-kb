// The download formats a guide offers. Kept apart from the export code so the
// menu can label its items without pulling the exporters into the page bundle.

export type ExportFormat = "pdf" | "docx" | "md";

export const EXPORT_FORMATS: Record<
  ExportFormat,
  { label: string; extension: string }
> = {
  pdf: { label: "PDF", extension: "pdf" },
  docx: { label: "DOCX", extension: "docx" },
  md: { label: "Markdown", extension: "md" },
};

export const EXPORT_FORMAT_ORDER: ExportFormat[] = ["pdf", "docx", "md"];
