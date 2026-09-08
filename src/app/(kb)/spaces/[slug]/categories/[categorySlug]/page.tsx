import { notFound } from "next/navigation";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { APP_TITLE } from "@/lib/branding";
import { category, guide, guideRevision, guideTag, space, tag, user } from "@/db/schema";
import { ButtonLink } from "@/components/ui";
import { PlusIcon } from "@/components/icons";
import { TopBar } from "@/components/shell/top-bar";
import {
  CategoryGuideList,
  type CategoryGuideRow,
} from "@/components/category-guide-list";
import {
  canAuthorInSpace,
  getSession,
  requireAccess,
  visibleGuidesWhere,
} from "@/lib/permissions";
import { GENERAL_CATEGORY_NAME, GENERAL_CATEGORY_SLUG } from "@/lib/categories";
import { guidePath } from "@/lib/moves";

// One category on its own: every guide the viewer may see in it, with when it
// was created, when it last changed and who changed it, behind a filter box
// that matches titles and tags. `.../categories/general` lists the
// uncategorized guides the space page gathers under its "General" card.
export default async function CategoryPage({
  params,
}: PageProps<"/spaces/[slug]/categories/[categorySlug]">) {
  const { slug, categorySlug } = await params;
  const access = await requireAccess();
  const session = await getSession();
  const userName = session?.user.name ?? "Staff";

  const [s] = await db.select().from(space).where(eq(space.slug, slug));
  if (!s) notFound();

  const isGeneral = categorySlug === GENERAL_CATEGORY_SLUG;
  const [cat] = isGeneral
    ? []
    : await db
        .select({ id: category.id, name: category.name })
        .from(category)
        .where(and(eq(category.spaceId, s.id), eq(category.slug, categorySlug)));

  // A bookmarked slug that no longer exists (renamed with a new slug, merged
  // into another department, or deleted). Rendered in-page rather than via
  // notFound() so the way back can name the department.
  if (!isGeneral && !cat) {
    return (
      <>
        <TopBar
          crumbs={[
            { label: APP_TITLE, href: "/" },
            { label: s.name, href: `/spaces/${s.slug}` },
            { label: "Category not found" },
          ]}
          userName={userName}
        />
        <CategoryNotice
          title="Category Not Found"
          text="Please update your bookmarks."
          spaceSlug={s.slug}
          spaceName={s.name}
        />
      </>
    );
  }

  const name = isGeneral ? GENERAL_CATEGORY_NAME : cat!.name;
  const canEdit = canAuthorInSpace(access, s.groupId);

  // Who last changed a guide is the author of its current revision — the same
  // name the guide page prints beside "Updated". A never-published draft has
  // no current revision yet, so fall back to whoever created it.
  const revisionAuthor = alias(user, "revision_author");
  const rows = await db
    .select({
      id: guide.id,
      slug: guide.slug,
      title: guide.title,
      status: guide.status,
      audience: guide.audience,
      createdAt: guide.createdAt,
      updatedAt: guide.updatedAt,
      creatorName: user.name,
      revisionAuthorName: revisionAuthor.name,
    })
    .from(guide)
    .innerJoin(user, eq(user.id, guide.createdBy))
    .leftJoin(guideRevision, eq(guideRevision.id, guide.currentRevisionId))
    .leftJoin(revisionAuthor, eq(revisionAuthor.id, guideRevision.authorId))
    .where(
      and(
        eq(guide.spaceId, s.id),
        isGeneral ? isNull(guide.categoryId) : eq(guide.categoryId, cat!.id),
        visibleGuidesWhere(access),
      ),
    )
    .orderBy(asc(guide.title));

  const tagRows =
    rows.length === 0
      ? []
      : await db
          .select({ guideId: guideTag.guideId, name: tag.name })
          .from(guideTag)
          .innerJoin(tag, eq(tag.id, guideTag.tagId))
          .where(
            inArray(
              guideTag.guideId,
              rows.map((r) => r.id),
            ),
          );
  const tagsByGuide = new Map<string, string[]>();
  for (const t of tagRows) {
    const list = tagsByGuide.get(t.guideId) ?? [];
    list.push(t.name);
    tagsByGuide.set(t.guideId, list);
  }

  const guides: CategoryGuideRow[] = rows.map((r) => ({
    id: r.id,
    href: guidePath(s.slug, r.slug),
    title: r.title,
    status: r.status,
    audience: r.audience,
    tags: tagsByGuide.get(r.id) ?? [],
    createdLabel: shortDate(r.createdAt),
    createdIso: r.createdAt.toISOString(),
    updatedLabel: shortDate(r.updatedAt),
    updatedIso: r.updatedAt.toISOString(),
    updatedBy: r.revisionAuthorName ?? r.creatorName,
  }));

  const crumbs = [
    { label: APP_TITLE, href: "/" },
    { label: s.name, href: `/spaces/${s.slug}` },
    { label: name },
  ];
  const actions = canEdit ? (
    <ButtonLink href={`/spaces/${s.slug}/new`} size="sm">
      <PlusIcon size={14} />
      New guide
    </ButtonLink>
  ) : undefined;

  // General is a link in every department's sidebar, so a new department
  // lands here with nothing filed yet.
  if (isGeneral && guides.length === 0) {
    return (
      <>
        <TopBar crumbs={crumbs} userName={userName} actions={actions} />
        <CategoryNotice
          title="No General Guides"
          text="Nothing in this department is filed outside a category yet."
          spaceSlug={s.slug}
          spaceName={s.name}
        />
      </>
    );
  }

  return (
    <>
      <TopBar crumbs={crumbs} userName={userName} actions={actions} />
      <main className="px-14 py-10">
        <div className="flex items-end justify-between gap-6">
          <h1 className="text-4xl font-black tracking-tight text-ink">{name}</h1>
          <div className="text-[13px] text-grey-500">
            {guides.length} article{guides.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="mt-8 max-w-[960px]">
          {guides.length > 0 ? (
            <CategoryGuideList guides={guides} />
          ) : (
            <p className="text-sm text-grey-500">Nothing here yet.</p>
          )}
        </div>
      </main>
    </>
  );
}

function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function CategoryNotice({
  title,
  text,
  spaceSlug,
  spaceName,
}: {
  title: string;
  text: string;
  spaceSlug: string;
  spaceName: string;
}) {
  return (
    <main className="px-14 py-10">
      <div className="mx-auto mt-10 max-w-md rounded-xl border border-grey-200 bg-white px-8 py-10 text-center shadow-xs">
        <h1 className="text-2xl font-black tracking-tight text-ink">{title}</h1>
        <p className="mt-2 text-sm text-grey-500">{text}</p>
        <ButtonLink href={`/spaces/${spaceSlug}`} variant="secondary" className="mt-6">
          Back to {spaceName}
        </ButtonLink>
      </div>
    </main>
  );
}
