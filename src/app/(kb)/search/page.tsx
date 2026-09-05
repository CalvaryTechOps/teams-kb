import Link from "next/link";
import { Fragment } from "react";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { APP_TITLE } from "@/lib/branding";
import { space } from "@/db/schema";
import { Badge } from "@/components/ui";
import { SearchIcon } from "@/components/icons";
import { TopBar } from "@/components/shell/top-bar";
import { TagPicker } from "@/components/tag-picker";
import { listTagsWithCounts } from "@/lib/tags";
import { HL_END, HL_START, searchGuides } from "@/lib/guide-search";
import { getSession, requireAccess } from "@/lib/permissions";

// The FTS query itself lives in src/lib/guide-search.ts (shared with the MCP
// search tool); this page adds the form, the tag/space filters and the
// highlighted rendering. Match markers map to <mark> in React so user content
// is never injected as HTML.

function Snippet({ text }: { text: string }) {
  const parts = text.split(HL_START);
  return (
    <>
      {parts.map((part, i) => {
        if (i === 0) return <Fragment key={i}>{part}</Fragment>;
        const end = part.indexOf(HL_END);
        if (end === -1) return <Fragment key={i}>{part}</Fragment>;
        return (
          <Fragment key={i}>
            <mark className="rounded-sm bg-cyan-100 px-0.5 text-inherit">
              {part.slice(0, end)}
            </mark>
            {part.slice(end + HL_END.length)}
          </Fragment>
        );
      })}
    </>
  );
}

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

/** Every value of a repeatable param (`?tag=a&tag=b`), trimmed and deduped. */
function all(v: string | string[] | undefined): string[] {
  const list = Array.isArray(v) ? v : v ? [v] : [];
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))].slice(0, 12);
}

export default async function SearchPage({
  searchParams,
}: PageProps<"/search">) {
  const params = await searchParams;
  const query = first(params.q);
  const spaceParam = first(params.space);
  const tagSlugs = all(params.tag);
  const access = await requireAccess();
  const session = await getSession();

  const [spaces, allTags] = await Promise.all([
    db
      .select({ slug: space.slug, name: space.name })
      .from(space)
      .orderBy(asc(space.name)),
    listTagsWithCounts(),
  ]);

  // Tags are OR-ed: a guide matches when it carries *any* selected tag.
  const activeTags = tagSlugs
    .map((slug) => allTags.find((t) => t.slug === slug))
    .filter((t): t is NonNullable<typeof t> => t !== undefined);
  // Slugs that no longer exist (merged or removed): keep searching on the
  // rest and say so, rather than silently dropping them.
  const missingTagSlugs = tagSlugs.filter(
    (slug) => !activeTags.some((t) => t.slug === slug),
  );

  const searching = Boolean(
    query || activeTags.length || spaceParam || missingTagSlugs.length,
  );
  const results = searching
    ? await searchGuides({
        access,
        query,
        spaceSlug: spaceParam || undefined,
        tagSlugs: activeTags.map((t) => t.slug),
        limit: 50,
      })
    : [];

  const summaryFor = [
    query && `“${query}”`,
    activeTags.length > 0 &&
      `tag${activeTags.length === 1 ? "" : "s"} ${activeTags
        .map((t) => `“${t.name}”`)
        .join(" or ")}`,
    spaceParam && spaces.find((s) => s.slug === spaceParam)?.name,
  ]
    .filter(Boolean)
    .join(" · ") || "all guides";

  return (
    <>
      <TopBar
        crumbs={[{ label: APP_TITLE, href: "/" }, { label: "Search" }]}
        userName={session?.user.name ?? "Staff"}
      />
      <main className="px-14 py-10">
        <h1 className="text-3xl font-black tracking-tight text-ink">Search</h1>

        <form action="/search" className="mt-5 flex max-w-[720px] flex-wrap items-center gap-3">
          <div className="flex flex-1 items-center gap-3 rounded-xl border border-grey-300 bg-white px-4 shadow-xs focus-within:border-cyan-400 focus-within:shadow-focus">
            <SearchIcon size={18} className="shrink-0 text-grey-400" />
            <input
              type="search"
              name="q"
              defaultValue={query}
              autoFocus
              placeholder="Search articles"
              className="h-[52px] w-full bg-transparent text-[15px] text-ink placeholder-grey-400 focus:outline-none"
            />
          </div>
          <select
            name="space"
            defaultValue={spaceParam}
            className="h-[52px] rounded-xl border border-grey-300 bg-white px-3 text-sm text-ink shadow-xs focus:border-cyan-400 focus:shadow-focus focus:outline-none"
          >
            <option value="">All departments</option>
            {spaces.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
          {/* Tag filter: OR-ed, posts one `tag` param per slug and re-runs the
              search on every change. Sits inside the form so q/space persist. */}
          <div className="basis-full max-w-[480px]">
            <label
              htmlFor="tag-filter"
              className="mb-1.5 block text-xs font-medium text-grey-500"
            >
              Filter by tag
            </label>
            <TagPicker
              key={activeTags.map((t) => t.slug).join(",")}
              allTags={allTags}
              defaultSelected={activeTags.map((t) => t.name)}
              name="tag"
              inputId="tag-filter"
              allowCreate={false}
              repeatedField
              fieldValue="slug"
              submitFormOnChange
              placeholder={
                activeTags.length > 0
                  ? "Add another tag…"
                  : "Any tag — guides matching any of them are shown"
              }
              hint={null}
            />
          </div>
        </form>

        {missingTagSlugs.length > 0 && (
          <p className="mt-3 max-w-[720px] rounded-lg border border-warning-100 bg-warning-100/50 px-4 py-2.5 text-sm text-grey-800">
            Tag{missingTagSlugs.length === 1 ? "" : "s"}{" "}
            {missingTagSlugs.map((s) => `“${s}”`).join(", ")}{" "}
            {missingTagSlugs.length === 1 ? "wasn’t" : "weren’t"} found —{" "}
            {missingTagSlugs.length === 1 ? "it" : "they"} may have been merged
            into another tag or removed.{" "}
            {activeTags.length > 0
              ? "Showing results for the remaining tags."
              : "Showing results without a tag filter."}
          </p>
        )}

        {searching && (
          <p className="mt-6 text-sm text-grey-500">
            {results.length === 0
              ? `Nothing found for ${summaryFor}.`
              : `${results.length} result${results.length === 1 ? "" : "s"} for ${summaryFor}`}
          </p>
        )}

        <div className="mt-4 flex max-w-[720px] flex-col gap-3">
          {results.map((r) => (
            <Link
              key={`${r.spaceSlug}/${r.slug}`}
              href={`/spaces/${r.spaceSlug}/guides/${r.slug}`}
              className="rounded-xl border border-grey-200 bg-white px-5 py-4 shadow-xs transition-shadow hover:shadow-md"
            >
              <div className="flex items-center gap-2.5">
                <span className="font-bold text-ink">{r.title}</span>
                {r.status !== "published" && <Badge tone="warning">Draft</Badge>}
              </div>
              {(r.snippet || r.searchText) && (
                <p className="mt-1 line-clamp-2 text-[13px] leading-normal text-grey-500">
                  {r.snippet ? (
                    <Snippet text={r.snippet} />
                  ) : (
                    r.searchText?.slice(0, 220)
                  )}
                </p>
              )}
              <div className="mt-2 text-xs font-medium text-cyan-700">
                {r.spaceName}
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
