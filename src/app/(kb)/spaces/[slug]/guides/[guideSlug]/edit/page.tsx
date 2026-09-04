import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { APP_TITLE } from "@/lib/branding";
import {
  allStaffRequest,
  category,
  guide,
  guideAudienceGroup,
  guideRevision,
  guideTag,
  space,
  tag,
} from "@/db/schema";
import { GuideDangerZone } from "@/components/guide-danger-zone";
import { GuideForm } from "@/components/guide-form";
import { TopBar } from "@/components/shell/top-bar";
import { audienceTargetGroups } from "@/lib/audience";
import { listTagsWithCounts } from "@/lib/tags";
import {
  getSession,
  requireAccess,
  resolveGuidePermissions,
} from "@/lib/permissions";

export default async function EditGuidePage({
  params,
}: PageProps<"/spaces/[slug]/guides/[guideSlug]/edit">) {
  const { slug, guideSlug } = await params;
  const access = await requireAccess();
  const session = await getSession();

  const [row] = await db
    .select({ g: guide, s: space })
    .from(guide)
    .innerJoin(space, eq(space.id, guide.spaceId))
    .where(and(eq(space.slug, slug), eq(guide.slug, guideSlug)));
  if (!row) notFound();
  const { g, s } = row;

  const perms = resolveGuidePermissions(access, {
    spaceGroupId: s.groupId,
    status: g.status,
    audience: g.audience,
    createdBy: g.createdBy,
  });
  if (!perms.canEdit) redirect(`/spaces/${s.slug}/guides/${g.slug}`);

  // Start from the newest revision this user may see: approvers see them
  // all; everyone else starts from their own work or the published version —
  // never from a colleague's unapproved draft.
  const [latest] = await db
    .select()
    .from(guideRevision)
    .where(
      and(
        eq(guideRevision.guideId, g.id),
        perms.canApprove
          ? undefined
          : or(
              eq(guideRevision.authorId, access.userId),
              g.currentRevisionId
                ? eq(guideRevision.id, g.currentRevisionId)
                : sql`false`,
            ),
      ),
    )
    .orderBy(desc(guideRevision.version))
    .limit(1);
  if (!latest) notFound();

  const [
    categories,
    tags,
    allTags,
    targetGroups,
    audienceGroupIds,
    pendingAllStaff,
  ] = await Promise.all([
      db
        .select({ id: category.id, name: category.name })
        .from(category)
        .where(eq(category.spaceId, s.id))
        .orderBy(asc(category.sortOrder), asc(category.name)),
      db
        .select({ name: tag.name })
        .from(guideTag)
        .innerJoin(tag, eq(tag.id, guideTag.tagId))
        .where(eq(guideTag.guideId, g.id)),
      listTagsWithCounts(),
      perms.canApprove ? audienceTargetGroups(s.groupId) : Promise.resolve([]),
      perms.canApprove
        ? db
            .select({ groupId: guideAudienceGroup.groupId })
            .from(guideAudienceGroup)
            .where(eq(guideAudienceGroup.guideId, g.id))
        : Promise.resolve([]),
      perms.canApprove
        ? db
            .select({ id: allStaffRequest.id })
            .from(allStaffRequest)
            .where(
              and(
                eq(allStaffRequest.guideId, g.id),
                eq(allStaffRequest.status, "pending"),
              ),
            )
        : Promise.resolve([]),
    ]);

  return (
    <>
      <TopBar
        crumbs={[
          { label: APP_TITLE, href: "/" },
          { label: s.name, href: `/spaces/${s.slug}` },
          { label: g.title, href: `/spaces/${s.slug}/guides/${g.slug}` },
          { label: "Edit" },
        ]}
        userName={session?.user.name ?? "Staff"}
      />
      <main className="px-14 py-10">
        <h1 className="mb-1.5 text-3xl font-black tracking-tight text-ink">
          Edit guide
        </h1>
        <p className="mb-7 text-sm text-grey-500">
          Editing from v{latest.version}
          {latest.status === "draft"
            ? " (unpublished draft)"
            : latest.status === "pending"
              ? " (awaiting approval — resubmitting replaces it)"
              : latest.status === "rejected"
                ? " (rejected)"
                : ""}
          . Saving creates a new revision.
        </p>
        {latest.status === "rejected" && latest.reviewNote && (
          <p className="-mt-4 mb-7 max-w-[720px] rounded-lg border border-danger-100 bg-danger-100/50 px-4 py-2.5 text-sm text-grey-800">
            Reviewer note: “{latest.reviewNote}”
          </p>
        )}
        <GuideForm
          spaceSlug={s.slug}
          guideId={g.id}
          categories={categories}
          allTags={allTags}
          canApprove={perms.canApprove}
          cancelHref={`/spaces/${s.slug}/guides/${g.slug}`}
          defaults={{
            title: latest.title,
            categoryId: g.categoryId,
            content: latest.content,
            tagNames: tags.map((t) => t.name),
          }}
          audience={
            perms.canApprove
              ? {
                  spaceName: s.name,
                  groups: targetGroups,
                  defaultAudience: g.audience,
                  defaultGroupIds: audienceGroupIds.map((r) => r.groupId),
                  isAdmin: access.isAdmin,
                  hasPendingAllStaffRequest: pendingAllStaff.length > 0,
                }
              : undefined
          }
        />
        {perms.canApprove && (
          <GuideDangerZone
            spaceSlug={s.slug}
            guideId={g.id}
            isPublished={g.status === "published"}
          />
        )}
      </main>
    </>
  );
}
