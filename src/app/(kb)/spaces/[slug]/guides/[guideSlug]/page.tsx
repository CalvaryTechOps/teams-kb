import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { APP_TITLE } from "@/lib/branding";
import {
  allStaffRequest,
  category,
  guide,
  guideAudienceGroup,
  guideRevision,
  guideTag,
  m365Group,
  space,
  tag,
  user,
} from "@/db/schema";
import { Badge, Button, ButtonLink, MicroLabel } from "@/components/ui";
import { PencilIcon } from "@/components/icons";
import { TopBar } from "@/components/shell/top-bar";
import { GuideContent } from "@/components/guide-content";
import { GuideActions } from "@/components/guide-actions";
import { readingMinutes } from "@/lib/guide-content";
import {
  getSession,
  requireAccess,
  resolveGuidePermissions,
} from "@/lib/permissions";
import { timeAgo } from "@/lib/time";
import { publishLatestDraft } from "../../../actions";

export default async function GuidePage({
  params,
  searchParams,
}: PageProps<"/spaces/[slug]/guides/[guideSlug]">) {
  const { slug, guideSlug } = await params;
  const { rev } = await searchParams;
  const access = await requireAccess();
  const session = await getSession();

  const [row] = await db
    .select({ g: guide, s: space, categoryName: category.name })
    .from(guide)
    .innerJoin(space, eq(space.id, guide.spaceId))
    .leftJoin(category, eq(category.id, guide.categoryId))
    .where(and(eq(space.slug, slug), eq(guide.slug, guideSlug)));
  if (!row) notFound();
  const { g, s } = row;

  const audienceGroups =
    g.audience === "groups"
      ? await db
          .select({ groupId: guideAudienceGroup.groupId, name: m365Group.displayName })
          .from(guideAudienceGroup)
          .innerJoin(m365Group, eq(m365Group.id, guideAudienceGroup.groupId))
          .where(eq(guideAudienceGroup.guideId, g.id))
      : [];
  const audienceGroupIds = audienceGroups.map((r) => r.groupId);

  const perms = resolveGuidePermissions(access, {
    spaceGroupId: s.groupId,
    status: g.status,
    audience: g.audience,
    audienceGroupIds,
    createdBy: g.createdBy,
  });
  if (!perms.canRead) notFound();

  // Unpublished work is visible only to approvers (owners/admins) and the
  // revision's own author — fellow members must not read unapproved content.
  const canSeeRevision = (r: { authorId: string }) =>
    perms.canApprove || r.authorId === access.userId;

  // Which revision to show: the published one, or — for those allowed — the
  // newest unpublished one (draft or pending submission; always for
  // never-published guides, on request via ?rev=draft for published ones).
  const unpublishedRows = perms.canEdit
    ? await db
        .select()
        .from(guideRevision)
        .where(
          and(
            eq(guideRevision.guideId, g.id),
            inArray(guideRevision.status, ["draft", "pending"]),
          ),
        )
        .orderBy(desc(guideRevision.version))
        .limit(1)
    : [];
  let latestUnpublished = unpublishedRows.at(0);
  if (latestUnpublished && !canSeeRevision(latestUnpublished)) {
    latestUnpublished = undefined;
  }

  // A rejection is worth surfacing until someone revises past it — but only
  // to the rejected author and to approvers.
  const rejectedRows = perms.canEdit
    ? await db
        .select()
        .from(guideRevision)
        .where(
          and(
            eq(guideRevision.guideId, g.id),
            eq(guideRevision.status, "rejected"),
          ),
        )
        .orderBy(desc(guideRevision.version))
        .limit(1)
    : [];
  let latestRejected = rejectedRows.at(0);
  if (latestRejected && !canSeeRevision(latestRejected)) {
    latestRejected = undefined;
  }

  // Owners see when their all-staff publish request is still awaiting an admin.
  const pendingAllStaff = perms.canApprove
    ? await db
        .select({ id: allStaffRequest.id })
        .from(allStaffRequest)
        .where(
          and(
            eq(allStaffRequest.guideId, g.id),
            eq(allStaffRequest.status, "pending"),
          ),
        )
    : [];

  const [publishedRevision] = g.currentRevisionId
    ? await db
        .select()
        .from(guideRevision)
        .where(eq(guideRevision.id, g.currentRevisionId))
    : [];

  const viewingUnpublished =
    latestUnpublished !== undefined &&
    (publishedRevision === undefined ||
      (rev === "draft" &&
        latestUnpublished.version > publishedRevision.version));
  const revision = viewingUnpublished ? latestUnpublished : publishedRevision;
  if (!revision) notFound();

  const [author] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, revision.authorId));

  const tags = await db
    .select({ name: tag.name, slug: tag.slug })
    .from(guideTag)
    .innerJoin(tag, eq(tag.id, guideTag.tagId))
    .where(eq(guideTag.guideId, g.id));

  const hasNewerUnpublished =
    latestUnpublished !== undefined &&
    publishedRevision !== undefined &&
    latestUnpublished.version > publishedRevision.version;
  // Pending v1 of a never-published guide has no version comparison to win,
  // but editors still need to see that it's waiting on approval.
  const pendingBeforeFirstPublish =
    latestUnpublished?.status === "pending" && publishedRevision === undefined;
  const isPending = latestUnpublished?.status === "pending";
  // A rejection is the guide's latest word only if nothing newer exists.
  const showRejected =
    latestRejected !== undefined &&
    (publishedRevision === undefined ||
      latestRejected.version > publishedRevision.version) &&
    (latestUnpublished === undefined ||
      latestRejected.version > latestUnpublished.version);

  return (
    <>
      <TopBar
        crumbs={[
          { label: APP_TITLE, href: "/" },
          { label: s.name, href: `/spaces/${s.slug}` },
          ...(row.categoryName ? [{ label: row.categoryName }] : []),
          { label: revision.title },
        ]}
        userName={session?.user.name ?? "Staff"}
        actions={
          perms.canEdit ? (
            <ButtonLink
              href={`/spaces/${s.slug}/guides/${g.slug}/edit`}
              variant="secondary"
              size="sm"
            >
              <PencilIcon size={13} />
              Edit guide
            </ButtonLink>
          ) : undefined
        }
      />
      <main className="grid grid-cols-1 gap-10 px-12 py-10 lg:grid-cols-[minmax(0,720px)_232px]">
        <article>
          {latestUnpublished &&
            (hasNewerUnpublished || pendingBeforeFirstPublish) && (
              <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-warning-100 bg-warning-100/50 px-4 py-3 text-sm text-grey-800">
                {pendingBeforeFirstPublish ? (
                  <span>
                    v{latestUnpublished.version} is awaiting owner approval
                    before this guide goes live.
                  </span>
                ) : viewingUnpublished && publishedRevision ? (
                  <>
                    <span>
                      You&apos;re previewing{" "}
                      {isPending ? "pending submission" : "draft"} v
                      {latestUnpublished.version}. The published version is v
                      {publishedRevision.version}.
                    </span>
                    <ButtonLink
                      href={`/spaces/${s.slug}/guides/${g.slug}`}
                      variant="secondary"
                      size="sm"
                    >
                      View published
                    </ButtonLink>
                  </>
                ) : (
                  <>
                    <span>
                      {isPending
                        ? `v${latestUnpublished.version} is awaiting approval.`
                        : `A newer draft (v${latestUnpublished.version}) is waiting.`}
                    </span>
                    <ButtonLink
                      href={`/spaces/${s.slug}/guides/${g.slug}?rev=draft`}
                      variant="secondary"
                      size="sm"
                    >
                      {isPending ? "Preview submission" : "Preview draft"}
                    </ButtonLink>
                  </>
                )}
                {perms.canApprove &&
                  (isPending ? (
                    <ButtonLink href={`/spaces/${s.slug}/queue`} size="sm">
                      Review in queue
                    </ButtonLink>
                  ) : (
                    <form action={publishLatestDraft.bind(null, g.id)}>
                      <Button type="submit" size="sm">
                        Publish draft
                      </Button>
                    </form>
                  ))}
              </div>
            )}

          {showRejected && latestRejected && (
            <div className="mb-5 rounded-lg border border-danger-100 bg-danger-100/50 px-4 py-3 text-sm text-grey-800">
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  Submission v{latestRejected.version} was rejected
                  {latestRejected.reviewedAt
                    ? ` ${timeAgo(latestRejected.reviewedAt)}`
                    : ""}
                  . Edit the guide to revise and resubmit.
                </span>
                <ButtonLink
                  href={`/spaces/${s.slug}/guides/${g.slug}/edit`}
                  variant="secondary"
                  size="sm"
                >
                  Edit guide
                </ButtonLink>
              </div>
              {latestRejected.reviewNote && (
                <p className="mt-1.5 text-[13px] text-grey-600">
                  Reviewer note: “{latestRejected.reviewNote}”
                </p>
              )}
            </div>
          )}

          {pendingAllStaff.length > 0 && (
            <div className="mb-5 rounded-lg border border-grey-200 bg-grey-100 px-4 py-3 text-sm text-grey-800">
              An all-staff publish request for this guide is awaiting admin
              approval. Until then it keeps its current audience.
            </div>
          )}

          <div className="mb-3.5 flex flex-wrap gap-2">
            <Badge tone="brand">{s.name}</Badge>
            {row.categoryName && <Badge>{row.categoryName}</Badge>}
            {g.audience === "all_staff" && <Badge>All staff</Badge>}
            {g.status !== "published" && (
              <Badge tone="warning">
                {isPending ? "Pending approval" : "Draft"}
              </Badge>
            )}
          </div>
          <h1 className="text-4xl font-black leading-[1.15] tracking-tight text-ink">
            {revision.title}
          </h1>
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-grey-200 pb-5">
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-grey-500">
              <span>
                Updated{" "}
                {revision.createdAt.toLocaleDateString("en-US", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              <span aria-hidden>·</span>
              <span>
                {author?.name ?? "Unknown"}, {s.name}
              </span>
              <span aria-hidden>·</span>
              <span>{readingMinutes(revision.content)} min read</span>
            </div>
            <GuideActions
              path={`/spaces/${s.slug}/guides/${g.slug}`}
              title={revision.title}
              blocks={revision.content}
              updatedAt={revision.createdAt}
              author={author?.name ?? "Unknown"}
              editHref={
                perms.canEdit
                  ? `/spaces/${s.slug}/guides/${g.slug}/edit`
                  : undefined
              }
            />
          </div>

          <div className="prose-guide pt-6">
            <GuideContent blocks={revision.content} />
          </div>
        </article>

        <aside className="hidden lg:block">
          <div className="sticky top-[76px] flex flex-col gap-6">
            {tags.length > 0 && (
              <div>
                <MicroLabel className="mb-3">Tags</MicroLabel>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <Link
                      key={t.slug}
                      href={`/search?tag=${encodeURIComponent(t.slug)}`}
                      className="inline-flex h-[26px] items-center rounded-full border border-grey-200 bg-white px-2.5 text-xs text-grey-600 hover:border-cyan-400 hover:text-cyan-700"
                    >
                      {t.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            <div className={tags.length > 0 ? "border-t border-grey-200 pt-5" : ""}>
              <MicroLabel className="mb-2.5">About this guide</MicroLabel>
              <p className="text-[13px] leading-relaxed text-grey-500">
                Maintained by {s.name}.{" "}
                {g.audience === "all_staff"
                  ? "Visible to all staff."
                  : g.audience === "groups"
                    ? `Shared with ${audienceGroups.map((r) => r.name).join(", ") || "specific teams"}.`
                    : "Visible to the department."}
              </p>
            </div>
          </div>
        </aside>
      </main>
    </>
  );
}
