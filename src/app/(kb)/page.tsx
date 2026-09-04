import Link from "next/link";
import { and, desc, eq, exists, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { APP_TITLE } from "@/lib/branding";
import { guide, guideAudienceGroup, space } from "@/db/schema";
import { SearchIcon } from "@/components/icons";
import { TopBar } from "@/components/shell/top-bar";
import { getSession, requireAccess } from "@/lib/permissions";
import { visibleArticleCountsBySpace } from "@/lib/space-counts";
import { isSpaceShown } from "@/lib/space-visibility";
import { getShowEmptyPreference } from "@/lib/space-visibility.server";
import { timeAgo } from "@/lib/time";

function greeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function HomePage() {
  const access = await requireAccess();
  const session = await getSession();
  const userName = session?.user.name ?? "Staff";
  const firstName = userName.split(/\s+/)[0];

  // Departments with the number of published articles this user can see
  // (shared with the sidebar pills so the two never disagree).
  const spaces = await visibleArticleCountsBySpace(access);

  // The search total counts every article (hidden departments contribute 0);
  // the grid honours the sidebar's "Show empty" switch, same rule as there.
  const totalArticles = spaces.reduce((sum, s) => sum + s.articles, 0);
  const showEmpty = await getShowEmptyPreference();
  const shownSpaces = spaces.filter((s) => isSpaceShown(s, showEmpty));

  const feedColumns = {
    slug: guide.slug,
    title: guide.title,
    spaceSlug: space.slug,
    spaceName: space.name,
    publishedAt: guide.publishedAt,
  };

  // Published all-staff guides, newest first.
  const allStaffFeed = await db
    .select(feedColumns)
    .from(guide)
    .innerJoin(space, eq(space.id, guide.spaceId))
    .where(
      and(eq(guide.status, "published"), eq(guide.audience, "all_staff")),
    )
    .orderBy(desc(guide.publishedAt))
    .limit(8);

  // Guides other departments shared with one of this user's Teams.
  const myGroupIds = [
    ...new Set([...access.memberGroupIds, ...access.ownerGroupIds]),
  ];
  const sharedWithMyTeams =
    myGroupIds.length === 0
      ? []
      : await db
          .select(feedColumns)
          .from(guide)
          .innerJoin(space, eq(space.id, guide.spaceId))
          .where(
            and(
              eq(guide.status, "published"),
              eq(guide.audience, "groups"),
              exists(
                db
                  .select({ one: sql`1` })
                  .from(guideAudienceGroup)
                  .where(
                    and(
                      eq(guideAudienceGroup.guideId, guide.id),
                      inArray(guideAudienceGroup.groupId, myGroupIds),
                    ),
                  ),
              ),
            ),
          )
          .orderBy(desc(guide.publishedAt))
          .limit(8);

  const feeds = [
    { key: "all-staff", label: "Shared with all staff", rows: allStaffFeed },
    { key: "your-teams", label: "Shared with your teams", rows: sharedWithMyTeams },
  ].filter((f) => f.rows.length > 0);

  return (
    <>
      <TopBar crumbs={[{ label: APP_TITLE }]} userName={userName} />
      <main className="px-14 py-11">
        <h1 className="text-4xl font-black tracking-tight text-ink">
          {greeting()}, {firstName}
        </h1>
        <p className="mt-2.5 text-grey-500">What do you need a hand with?</p>

        <form action="/search" className="mt-6 max-w-[620px]">
          <div className="flex items-center gap-3 rounded-xl border border-grey-300 bg-white px-4 shadow-xs focus-within:border-cyan-400 focus-within:shadow-focus">
            <SearchIcon size={18} className="shrink-0 text-grey-400" />
            <input
              type="search"
              name="q"
              placeholder={`Search ${totalArticles} article${totalArticles === 1 ? "" : "s"}`}
              className="h-[52px] w-full bg-transparent text-[15px] text-ink placeholder-grey-400 focus:outline-none"
            />
          </div>
        </form>

        {feeds.length > 0 && (
          <div className="mt-9 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {feeds.map((feed) => (
              <section
                key={feed.key}
                className="rounded-xl border border-grey-200 bg-white px-6 py-5 shadow-xs"
              >
                <div className="mb-2 text-[11px] font-medium uppercase tracking-[.09em] text-grey-500">
                  {feed.label}
                </div>
                <div className="flex flex-col">
                  {feed.rows.map((g) => (
                    <Link
                      key={`${g.spaceSlug}/${g.slug}`}
                      href={`/spaces/${g.spaceSlug}/guides/${g.slug}`}
                      className="flex items-baseline justify-between gap-3 border-t border-grey-100 py-2.5 first:border-t-0"
                    >
                      <span className="truncate text-sm text-grey-800 hover:text-cyan-700">
                        {g.title}
                      </span>
                      <span className="shrink-0 text-xs text-grey-500">
                        {g.spaceName}
                        {g.publishedAt ? ` · ${timeAgo(g.publishedAt)}` : ""}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <div className="mt-9 text-[11px] font-medium uppercase tracking-[.09em] text-grey-500">
          Browse by department
        </div>
        <div className="mt-3.5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shownSpaces.map((s) => (
            <Link
              key={s.slug}
              href={`/spaces/${s.slug}`}
              className="rounded-xl border border-grey-200 bg-white p-5 shadow-xs transition-shadow hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="text-[17px] font-bold text-ink">{s.name}</div>
              {s.description && (
                <div className="mt-1.5 line-clamp-2 text-[13px] leading-normal text-grey-500">
                  {s.description}
                </div>
              )}
              <div className="mt-3.5 text-xs font-medium text-cyan-700">
                {s.articles} article{s.articles === 1 ? "" : "s"}
              </div>
            </Link>
          ))}
          {spaces.length === 0 && (
            <div className="rounded-xl border border-dashed border-grey-300 p-6 text-sm text-grey-500 md:col-span-2 xl:col-span-3">
              No departments yet. Admins flag M365 groups as departments in
              the admin area, and each one gets a space here.
            </div>
          )}
          {spaces.length > 0 && shownSpaces.length === 0 && (
            <div className="rounded-xl border border-dashed border-grey-300 p-6 text-sm text-grey-500 md:col-span-2 xl:col-span-3">
              Nothing to read yet. Turn on <em>Show empty</em> in the sidebar
              to browse every department.
            </div>
          )}
        </div>
      </main>
    </>
  );
}
