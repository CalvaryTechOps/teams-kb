import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { APP_TITLE } from "@/lib/branding";
import {
  category,
  guide,
  guideRevision,
  m365Group,
  space,
  user,
} from "@/db/schema";
import { Badge, Button, ButtonLink, MicroLabel } from "@/components/ui";
import { FolderMoveIcon, PlusIcon } from "@/components/icons";
import { TopBar } from "@/components/shell/top-bar";
import {
  getSession,
  requireAccess,
  resolveGuidePermissions,
  visibleGuidesWhere,
} from "@/lib/permissions";
import { GENERAL_CATEGORY_NAME, GENERAL_CATEGORY_SLUG } from "@/lib/categories";
import {
  isOrphaned,
  spaceHealth,
  spaceHealthDescription,
} from "@/lib/space-health";
import { timeAgo } from "@/lib/time";
import { createCategory } from "../actions";

export default async function SpacePage({
  params,
}: PageProps<"/spaces/[slug]">) {
  const { slug } = await params;
  const access = await requireAccess();
  const session = await getSession();

  const [row] = await db
    .select({
      s: space,
      groupDeletedAt: m365Group.deletedAt,
      groupIsDepartment: m365Group.isDepartment,
    })
    .from(space)
    .innerJoin(m365Group, eq(m365Group.id, space.groupId))
    .where(eq(space.slug, slug));
  if (!row) notFound();
  const s = row.s;
  // Admin-only notice: an orphaned space (Team deleted, or un-flagged) has
  // nobody who can author in it. Members just see the "New guide" button
  // vanish, which is the intended quiet degradation.
  const health = spaceHealth({
    deletedAt: row.groupDeletedAt,
    isDepartment: row.groupIsDepartment,
  });

  // Authoring rights in this space (published stand-in — unpublished guides
  // are further gated by authorship in the list query itself).
  const perms = resolveGuidePermissions(access, {
    spaceGroupId: s.groupId,
    status: "published",
    audience: "department",
  });

  const pendingCount = perms.canApprove
    ? (
        await db
          .select({ n: count() })
          .from(guideRevision)
          .innerJoin(guide, eq(guide.id, guideRevision.guideId))
          .where(
            and(eq(guide.spaceId, s.id), eq(guideRevision.status, "pending")),
          )
      )[0]!.n
    : 0;

  const [categories, guides] = await Promise.all([
    db
      .select()
      .from(category)
      .where(eq(category.spaceId, s.id))
      .orderBy(asc(category.sortOrder), asc(category.name)),
    db
      .select({
        id: guide.id,
        slug: guide.slug,
        title: guide.title,
        status: guide.status,
        categoryId: guide.categoryId,
        updatedAt: guide.updatedAt,
        authorName: user.name,
      })
      .from(guide)
      .innerJoin(user, eq(user.id, guide.createdBy))
      .where(and(eq(guide.spaceId, s.id), visibleGuidesWhere(access)))
      .orderBy(asc(guide.title)),
  ]);

  const published = guides.filter((g) => g.status === "published");
  const recent = [...guides]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 3);

  // Category cards; uncategorized guides gather under "General".
  const sections = [
    ...categories.map((c) => ({
      key: c.slug,
      name: c.name,
      guides: guides.filter((g) => g.categoryId === c.id),
    })),
    {
      key: GENERAL_CATEGORY_SLUG,
      name: GENERAL_CATEGORY_NAME,
      guides: guides.filter((g) => g.categoryId === null),
    },
  ].filter((sec) => sec.guides.length > 0 || sec.key !== GENERAL_CATEGORY_SLUG);

  return (
    <>
      <TopBar
        crumbs={[{ label: APP_TITLE, href: "/" }, { label: s.name }]}
        userName={session?.user.name ?? "Staff"}
        actions={
          perms.canEdit ? (
            <>
              {perms.canApprove && (
                <ButtonLink
                  href={`/spaces/${s.slug}/queue`}
                  variant="secondary"
                  size="sm"
                >
                  Review queue{pendingCount > 0 ? ` (${pendingCount})` : ""}
                </ButtonLink>
              )}
              <ButtonLink href={`/spaces/${s.slug}/new`} size="sm">
                <PlusIcon size={14} />
                New guide
              </ButtonLink>
            </>
          ) : undefined
        }
      />
      <main className="px-14 py-10">
        <div className="flex items-end justify-between">
          <h1 className="text-4xl font-black tracking-tight text-ink">
            {s.name}
          </h1>
          <div className="text-[13px] text-grey-500">
            {published.length} article{published.length === 1 ? "" : "s"} ·{" "}
            {categories.length} categor{categories.length === 1 ? "y" : "ies"}
          </div>
        </div>
        {s.description && (
          <p className="mt-2 max-w-[640px] text-grey-500">{s.description}</p>
        )}
        {access.isAdmin && isOrphaned(health) && (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-warning-100 bg-warning-100/50 px-4 py-3 text-sm text-grey-800">
            <span>{spaceHealthDescription(health)}</span>
            <ButtonLink href="/admin/spaces" variant="secondary" size="sm">
              Manage spaces
            </ButtonLink>
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {sections.map((sec) => (
            <div
              key={sec.key}
              id={sec.key}
              className="scroll-mt-20 rounded-xl border border-grey-200 bg-white px-6 py-5 shadow-xs"
            >
              <div className="mb-2 flex items-baseline justify-between">
                <div className="flex items-center gap-2">
                  <div className="font-bold text-ink">{sec.name}</div>
                  {access.isAdmin &&
                    (sec.key !== GENERAL_CATEGORY_SLUG ||
                      sec.guides.length > 0) && (
                      <Link
                        href={`/spaces/${s.slug}/categories/${sec.key}/move`}
                        aria-label={
                          sec.key === GENERAL_CATEGORY_SLUG
                            ? "Move all General guides"
                            : `Move ${sec.name}`
                        }
                        title={
                          sec.key === GENERAL_CATEGORY_SLUG
                            ? "Move all General guides to another department"
                            : "Move to another department"
                        }
                        className="rounded-md p-1 text-grey-400 hover:bg-grey-100 hover:text-cyan-700"
                      >
                        <FolderMoveIcon size={14} />
                      </Link>
                    )}
                </div>
                <div className="text-xs text-grey-500">
                  {sec.guides.length}
                </div>
              </div>
              <div className="flex flex-col">
                {sec.guides.map((g) => (
                  <Link
                    key={g.id}
                    href={`/spaces/${s.slug}/guides/${g.slug}`}
                    className="flex items-center justify-between gap-3 border-t border-grey-100 py-2.5 text-sm text-grey-800 hover:text-cyan-700"
                  >
                    <span className="truncate">{g.title}</span>
                    {g.status !== "published" && (
                      <Badge tone="warning">Draft</Badge>
                    )}
                  </Link>
                ))}
                {sec.guides.length === 0 && (
                  <p className="border-t border-grey-100 py-2.5 text-sm text-grey-400">
                    Nothing here yet.
                  </p>
                )}
              </div>
            </div>
          ))}

          <div className="rounded-xl border border-grey-200 bg-grey-100 px-6 py-5">
            <MicroLabel className="mb-3.5">Recently updated</MicroLabel>
            <div className="flex flex-col gap-3.5">
              {recent.map((g) => (
                <Link key={g.id} href={`/spaces/${s.slug}/guides/${g.slug}`}>
                  <div className="text-sm font-medium text-grey-800 hover:text-cyan-700">
                    {g.title}
                  </div>
                  <div className="mt-0.5 text-xs text-grey-500">
                    Updated {timeAgo(g.updatedAt)} · {g.authorName}
                  </div>
                </Link>
              ))}
              {recent.length === 0 && (
                <p className="text-sm text-grey-500">
                  {perms.canEdit
                    ? "No guides yet — write the first one."
                    : "No guides shared with you yet."}
                </p>
              )}
            </div>
          </div>
        </div>

        {perms.canApprove && (
          <form
            action={createCategory.bind(null, s.slug)}
            className="mt-8 flex max-w-md items-center gap-2"
          >
            <input
              name="name"
              placeholder="New category name"
              required
              className="h-10 w-full rounded-lg border border-grey-300 bg-white px-3 text-sm focus:border-cyan-400 focus:shadow-focus focus:outline-none"
            />
            <Button type="submit" variant="secondary">
              Add category
            </Button>
          </form>
        )}
      </main>
    </>
  );
}
