import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { APP_TITLE } from "@/lib/branding";
import { category, space } from "@/db/schema";
import { GuideForm } from "@/components/guide-form";
import { TopBar } from "@/components/shell/top-bar";
import { audienceTargetGroups } from "@/lib/audience";
import { categoryPath, GENERAL_CATEGORY_SLUG } from "@/lib/categories";
import { listTagsWithCounts } from "@/lib/tags";
import {
  getSession,
  requireAccess,
  resolveGuidePermissions,
} from "@/lib/permissions";

// `?category=<slug>` (set by a category page's "New guide" button) opens the
// form with that category preselected and points Cancel back at the category.
// Anything else — no param, the reserved General slug, an unknown or
// foreign slug, a repeated param — falls back to General, the form's default.
export default async function NewGuidePage({
  params,
  searchParams,
}: PageProps<"/spaces/[slug]/new">) {
  const [{ slug }, { category: categoryParam }] = await Promise.all([
    params,
    searchParams,
  ]);
  const access = await requireAccess();
  const session = await getSession();

  const [s] = await db.select().from(space).where(eq(space.slug, slug));
  if (!s) notFound();

  const perms = resolveGuidePermissions(access, {
    spaceGroupId: s.groupId,
    status: "published",
    audience: "department",
  });
  if (!perms.canEdit) redirect(`/spaces/${s.slug}`);

  const [categories, allTags, targetGroups] = await Promise.all([
    db
      .select({ id: category.id, name: category.name, slug: category.slug })
      .from(category)
      .where(eq(category.spaceId, s.id))
      .orderBy(asc(category.sortOrder), asc(category.name)),
    listTagsWithCounts(),
    perms.canApprove ? audienceTargetGroups(s.groupId) : Promise.resolve([]),
  ]);

  const preselected =
    typeof categoryParam === "string" &&
    categoryParam !== "" &&
    categoryParam !== GENERAL_CATEGORY_SLUG
      ? categories.find((c) => c.slug === categoryParam)
      : undefined;

  const cancelHref = preselected
    ? categoryPath(s.slug, preselected.slug)
    : `/spaces/${s.slug}`;

  return (
    <>
      <TopBar
        crumbs={[
          { label: APP_TITLE, href: "/" },
          { label: s.name, href: `/spaces/${s.slug}` },
          ...(preselected
            ? [{ label: preselected.name, href: cancelHref }]
            : []),
          { label: "New guide" },
        ]}
        userName={session?.user.name ?? "Staff"}
      />
      <main className="px-14 py-10">
        <h1 className="mb-7 text-3xl font-black tracking-tight text-fg-strong">
          New guide
        </h1>
        <GuideForm
          spaceSlug={s.slug}
          categories={categories}
          allTags={allTags}
          canApprove={perms.canApprove}
          cancelHref={cancelHref}
          defaults={preselected ? { categoryId: preselected.id } : undefined}
          audience={
            perms.canApprove
              ? {
                  spaceName: s.name,
                  groups: targetGroups,
                  defaultAudience: "department",
                  defaultGroupIds: [],
                  isAdmin: access.isAdmin,
                }
              : undefined
          }
        />
      </main>
    </>
  );
}
