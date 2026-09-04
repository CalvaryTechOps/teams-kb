import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { APP_TITLE } from "@/lib/branding";
import { category, space } from "@/db/schema";
import { GuideForm } from "@/components/guide-form";
import { TopBar } from "@/components/shell/top-bar";
import { audienceTargetGroups } from "@/lib/audience";
import { listTagsWithCounts } from "@/lib/tags";
import {
  getSession,
  requireAccess,
  resolveGuidePermissions,
} from "@/lib/permissions";

export default async function NewGuidePage({
  params,
}: PageProps<"/spaces/[slug]/new">) {
  const { slug } = await params;
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
      .select({ id: category.id, name: category.name })
      .from(category)
      .where(eq(category.spaceId, s.id))
      .orderBy(asc(category.sortOrder), asc(category.name)),
    listTagsWithCounts(),
    perms.canApprove ? audienceTargetGroups(s.groupId) : Promise.resolve([]),
  ]);

  return (
    <>
      <TopBar
        crumbs={[
          { label: APP_TITLE, href: "/" },
          { label: s.name, href: `/spaces/${s.slug}` },
          { label: "New guide" },
        ]}
        userName={session?.user.name ?? "Staff"}
      />
      <main className="px-14 py-10">
        <h1 className="mb-7 text-3xl font-black tracking-tight text-ink">
          New guide
        </h1>
        <GuideForm
          spaceSlug={s.slug}
          categories={categories}
          allTags={allTags}
          canApprove={perms.canApprove}
          cancelHref={`/spaces/${s.slug}`}
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
