import { ButtonLink } from "@/components/ui";
import type { PermalinkResolution } from "@/lib/permalink";

// The two ways a permalink can fail for a signed-in visitor (plans/
// guide-permalinks.md Q3). Only staff can sign in, so naming the department
// that owns a guide is safe and useful; an unpublished guide never reaches
// this component as "forbidden" (classifyPermalink folds it into not found).
export function permalinkNoticeCopy(
  resolution: Exclude<PermalinkResolution, { kind: "ok" }>,
): { title: string; text: string } {
  if (resolution.kind === "forbidden") {
    return {
      title: "You don't have access to this guide",
      text: `It belongs to ${resolution.spaceName}. Contact ${resolution.spaceName} to request access.`,
    };
  }
  return {
    title: "Guide not found",
    text: "This link doesn't match any guide. It may have been removed, or the code was mistyped. Check with whoever shared it.",
  };
}

export function PermalinkNotice({
  resolution,
}: {
  resolution: Exclude<PermalinkResolution, { kind: "ok" }>;
}) {
  const { title, text } = permalinkNoticeCopy(resolution);
  return (
    <main className="px-6 py-10 md:px-14">
      <div className="mx-auto mt-10 max-w-md rounded-xl border border-border bg-surface-raised px-8 py-10 text-center shadow-xs">
        <h1 className="text-2xl font-black tracking-tight text-fg-strong">{title}</h1>
        <p className="mt-2 text-sm text-fg-muted">{text}</p>
        <ButtonLink href="/" variant="secondary" className="mt-6">
          Go to home
        </ButtonLink>
      </div>
    </main>
  );
}
