// A printable label: QR code, guide title, department, the short URL as a
// typed fallback, a caption admins can word for their organization, and the
// app title. Black on white whatever the theme — it's ink. Sized in inches
// so a printed label comes out the size it says; everything inside scales
// with the label's font size. plans/guide-permalinks.md §4.

export const QR_LABEL_SIZES = {
  sm: { label: "Small", width: "1.5in", fontSize: "6pt" },
  md: { label: "Medium", width: "2.5in", fontSize: "9pt" },
  lg: { label: "Large", width: "4in", fontSize: "13pt" },
} as const;

export type QrLabelSize = keyof typeof QR_LABEL_SIZES;

export const DEFAULT_QR_LABEL_SIZE: QrLabelSize = "md";

export function parseQrLabelSize(input: unknown): QrLabelSize {
  return typeof input === "string" && input in QR_LABEL_SIZES
    ? (input as QrLabelSize)
    : DEFAULT_QR_LABEL_SIZE;
}

export function QrLabel({
  svg,
  title,
  spaceName,
  url,
  caption,
  appTitle,
  size,
}: {
  /** The QR code as an <svg> string from `qrcode` (our own output, not user input). */
  svg: string;
  title: string;
  spaceName: string;
  /** What the QR encodes, shown as text under it so a failed scan can be typed. */
  url: string;
  caption: string;
  appTitle: string;
  size: QrLabelSize;
}) {
  const s = QR_LABEL_SIZES[size];
  return (
    <div
      data-testid="qr-label"
      className="flex flex-col items-center border border-black bg-white text-center text-black"
      style={{
        width: s.width,
        fontSize: s.fontSize,
        padding: "0.9em",
        gap: "0.7em",
        borderRadius: "0.6em",
        // Keep the label whole when it lands near a page break.
        breakInside: "avoid",
      }}
    >
      <div
        aria-hidden
        className="w-full [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="font-medium" style={{ fontSize: "1em", lineHeight: 1.3 }}>
        {caption}
      </div>
      <div className="w-full">
        <div
          className="font-black"
          style={{
            fontSize: "1.35em",
            lineHeight: 1.15,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 3,
            overflow: "hidden",
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: "1em", marginTop: "0.3em" }}>{spaceName}</div>
      </div>
      <div className="w-full font-mono" style={{ fontSize: "0.9em", wordBreak: "break-all" }}>
        {url.replace(/^https?:\/\//, "")}
      </div>
      <div style={{ fontSize: "0.8em", opacity: 0.7 }}>{appTitle}</div>
    </div>
  );
}
