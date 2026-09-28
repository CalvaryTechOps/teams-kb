import { ButtonLink } from "@/components/ui";

// Centered "nothing to show here" card with one way out: the category page's
// missing-category and empty-General states, and the favorites page's empty
// state, all read the same.
export function PageNotice({
  title,
  text,
  href,
  linkLabel,
}: {
  title: string;
  text: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <main className="px-14 py-10">
      <div className="mx-auto mt-10 max-w-md rounded-xl border border-border bg-surface-raised px-8 py-10 text-center shadow-xs">
        <h1 className="text-2xl font-black tracking-tight text-fg-strong">{title}</h1>
        <p className="mt-2 text-sm text-fg-muted">{text}</p>
        <ButtonLink href={href} variant="secondary" className="mt-6">
          {linkLabel}
        </ButtonLink>
      </div>
    </main>
  );
}
