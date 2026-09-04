import { computeDiffRows, hasChanges } from "@/lib/content-diff";
import { blocksToLines, type GuideBlock } from "@/lib/guide-content";

// Unified green/red line diff for the approval queue. Server component — both
// documents are projected to readable lines (headings, list markers, table
// rows, captions) and diffed at render time. Styles and colors are not part of
// the projection, so a formatting-only edit reads as "no content changes".

const rowClasses = {
  added: "bg-success-100/60 text-grey-800",
  removed: "bg-danger-100/60 text-grey-600 line-through decoration-danger/40",
  context: "text-grey-500",
} as const;

const prefixClasses = {
  added: "text-success",
  removed: "text-danger",
  context: "text-grey-300",
} as const;

const prefixes = { added: "+", removed: "−", context: " " } as const;

export function ContentDiff({
  before,
  after,
}: {
  before: GuideBlock[];
  after: GuideBlock[];
}) {
  const rows = computeDiffRows(blocksToLines(before), blocksToLines(after));
  if (!hasChanges(rows)) {
    return (
      <p className="rounded-lg border border-grey-200 bg-grey-50 px-4 py-3 text-sm text-grey-500">
        No content changes — the text is identical to the published version.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-grey-200 bg-white py-1.5 font-mono text-xs leading-relaxed">
      {rows.map((row, i) =>
        row.kind === "skip" ? (
          <div
            key={i}
            className="select-none border-y border-grey-100 bg-grey-50 px-4 py-1 text-center text-[11px] text-grey-400"
          >
            {row.count} unchanged line{row.count === 1 ? "" : "s"}
          </div>
        ) : (
          <div
            key={i}
            className={`flex whitespace-pre-wrap break-words px-2 ${rowClasses[row.kind]}`}
          >
            <span
              aria-hidden
              className={`w-5 shrink-0 select-none text-center font-bold ${prefixClasses[row.kind]}`}
            >
              {prefixes[row.kind]}
            </span>
            <span className="min-w-0 flex-1">{row.text || " "}</span>
          </div>
        ),
      )}
    </div>
  );
}
