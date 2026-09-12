import Link from "next/link";
import QRCode from "qrcode";
import { APP_TITLE, APP_URL } from "@/lib/branding";
import { ButtonLink } from "@/components/ui";
import { PermalinkNotice } from "@/components/permalink-notice";
import { PrintButton } from "@/components/print-button";
import {
  parseQrLabelSize,
  QR_LABEL_SIZES,
  QrLabel,
  type QrLabelSize,
} from "@/components/qr-label";
import { guidePath } from "@/lib/permalink";
import { resolvePermalink } from "@/lib/permalink.server";
import { requireAccess } from "@/lib/permissions";
import { permalinkUrl, qrLabelPath } from "@/lib/short-id";
import { getSiteSettings } from "@/lib/site-settings.server";
import { slugify } from "@/lib/slug";

// Printable QR label for one guide, keyed by the same permanent id as the
// link it encodes, so this page's own URL is stable too. Anyone who can read
// the guide can print its label. The code is rendered on the server as SVG
// at error-correction level Q (25 % recovery) because these end up taped to
// equipment and get scuffed. plans/guide-permalinks.md §4.

export default async function QrLabelPage({
  params,
  searchParams,
}: PageProps<"/a/[shortId]/qr">) {
  const [{ shortId: rawShortId }, { size: rawSize }, access] = await Promise.all([
    params,
    searchParams,
    requireAccess(),
  ]);
  const resolution = await resolvePermalink(rawShortId, access);
  if (resolution.kind !== "ok") return <PermalinkNotice resolution={resolution} />;

  const { target } = resolution;
  const shortId = resolution.shortId!;
  const size = parseQrLabelSize(rawSize);
  const url = permalinkUrl(APP_URL, shortId);
  const [svg, settings] = await Promise.all([
    QRCode.toString(url, { type: "svg", errorCorrectionLevel: "Q", margin: 0 }),
    getSiteSettings(),
  ]);
  const downloadName = `${slugify(target.title)}-qr.svg`;
  const downloadHref = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center gap-8 px-6 py-10 print:block print:p-0">
      <div className="w-full print:hidden">
        <p className="text-[13px] text-fg-muted">
          <Link href={guidePath(target)} className="text-accent-text hover:text-accent-strong">
            ← Back to guide
          </Link>
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-fg-strong">
          QR label for “{target.title}”
        </h1>
        <p className="mt-1.5 text-sm text-fg-muted">
          Scanning it opens{" "}
          <span className="font-mono text-fg">{url}</span>, which keeps working
          if the guide is moved or renamed. Print it, or download the code to
          place in your own label or document.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label="Label size"
            className="inline-flex overflow-hidden rounded-lg border border-border-strong text-xs"
          >
            {(Object.keys(QR_LABEL_SIZES) as QrLabelSize[]).map((key) => {
              const active = key === size;
              return (
                <Link
                  key={key}
                  href={`${qrLabelPath(shortId)}?size=${key}`}
                  aria-current={active ? "true" : undefined}
                  className={`h-8 px-3 leading-8 ${
                    active
                      ? "bg-accent text-on-accent"
                      : "bg-surface-raised text-fg hover:bg-surface"
                  }`}
                >
                  {QR_LABEL_SIZES[key].label} · {QR_LABEL_SIZES[key].width}
                </Link>
              );
            })}
          </div>
          <PrintButton size="sm">Print</PrintButton>
          <ButtonLink
            href={downloadHref}
            download={downloadName}
            variant="secondary"
            size="sm"
          >
            Download QR (SVG)
          </ButtonLink>
        </div>
      </div>

      <div className="flex justify-center print:mt-0">
        <QrLabel
          svg={svg}
          title={target.title}
          spaceName={target.spaceName}
          url={url}
          caption={settings["qr.caption"]}
          appTitle={APP_TITLE}
          size={size}
        />
      </div>
    </main>
  );
}
