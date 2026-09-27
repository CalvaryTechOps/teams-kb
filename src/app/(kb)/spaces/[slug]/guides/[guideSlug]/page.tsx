import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { APP_TITLE, APP_URL } from "@/lib/branding";
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
import { PencilIcon, QrCodeIcon } from "@/components/icons";
import { TopBar } from "@/components/shell/top-bar";
import { GuideContent } from "@/components/guide-content";
import { GuideActions } from "@/components/guide-actions";
import { RevisionPicker } from "@/components/revision-picker";
import { ConfirmForm } from "@/components/confirm-form";
import { readingMinutes } from "@/lib/guide-content";
import {
  canDeleteRevision,
  chooseRevision,
  parseRevisionParam,
  revisionHref,
  visibleRevisions,
  type RevisionMeta,
} from "@/lib/guide-revisions";
import {
  getSession,
  requireAccess,
  resolveGuidePermissions,
} from "@/lib/permissions";
import { permalinkPath, permalinkUrl, qrLabelPath } from "@/lib/short-id";
import { timeAgo } from "@/lib/time";
import {
  categoryPath,
  GENERAL_CATEGORY_NAME,
  GENERAL_CATEGORY_SLUG,
} from "@/lib/categories";
import { deleteDraftRevision, publishDraftRevision } from "../../../actions";

// How the banner names a revision that isn't the one readers see.
const REVISION_NOUN: Record<RevisionMeta["status"], string> = {
  draft: "draft",
  pending: "pending submission",
  rejected: "rejected submission",
  superseded: "superseded revision",
  published: "published revision",
};

export default async function GuidePage({
  params,
  searchParams,
}: PageProps<"/spaces/[slug]/guides/[guideSlug]">) {
  const { slug, guideSlug } = await params;
  const { rev } = await searchParams;
  const access = await requireAccess();
  const session = await getSession();

  const [row] = await db
    .select({
      g: guide,
      s: space,
      categoryName: category.name,
      categorySlug: category.slug,
    })
    .from(guide)
    .innerJoin(space, eq(space.id, guide.spaceId))
    .leftJoin(category, eq(category.id, guide.categoryId))
    .where(and(eq(space.slug, slug), eq(guide.slug, guideSlug)));
  if (!row) notFound();
  const { g, s } = row;
  const basePath = `/spaces/${s.slug}/guides/${g.slug}`;

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

  // Every revision's metadata (never the content), newest first. The
  // picker, the banners and the choice of what to render all read this one
  // list, narrowed to what the viewer may see: approvers (owners/admins)
  // everything, editors their own work plus the published revision, readers
  // the published revision only (plans/revision-picker.md).
  const allRevisions = await db
    .select({
      id: guideRevision.id,
      version: guideRevision.version,
      status: guideRevision.status,
      authorId: guideRevision.authorId,
      authorName: user.name,
      createdAt: guideRevision.createdAt,
      reviewedAt: guideRevision.reviewedAt,
      reviewNote: guideRevision.reviewNote,
    })
    .from(guideRevision)
    .leftJoin(user, eq(user.id, guideRevision.authorId))
    .where(eq(guideRevision.guideId, g.id))
    .orderBy(desc(guideRevision.version));
  const visible = visibleRevisions(
    allRevisions,
    {
      userId: perms.canEdit ? access.userId : undefined,
      canApprove: perms.canApprove,
    },
    g.currentRevisionId,
  );

  // The bare URL renders the published revision (or, for a never-published
  // guide, the newest revision the viewer may see); ?rev=<version> renders
  // that revision when it's visible and is otherwise ignored.
  const defaultRevision = chooseRevision(visible, undefined, g.currentRevisionId);
  const chosen = chooseRevision(visible, parseRevisionParam(rev), g.currentRevisionId);
  if (!chosen || !defaultRevision) notFound();
  const [revision] = await db
    .select()
    .from(guideRevision)
    .where(eq(guideRevision.id, chosen.id));
  if (!revision) notFound();

  const published = g.currentRevisionId
    ? visible.find((r) => r.id === g.currentRevisionId)
    : undefined;
  const viewingOther = chosen.id !== defaultRevision.id;
  const canDeleteChosen = canDeleteRevision(
    chosen,
    { userId: perms.canEdit ? access.userId : undefined, canApprove: perms.canApprove },
    allRevisions.length,
  );
  // Newest draft or pending submission, when it's newer than what's live.
  const newest = visible.find((r) => r.status === "draft" || r.status === "pending");
  const newerUnpublished =
    newest !== undefined && (published === undefined || newest.version > published.version)
      ? newest
      : undefined;
  const isPending = newerUnpublished?.status === "pending";
  // A rejection is the guide's latest word only if nothing newer exists;
  // it's surfaced on the default view (when viewing it, the banner above
  // says so instead).
  const latestRejected = visible.find((r) => r.status === "rejected");
  const showRejected =
    !viewingOther &&
    latestRejected !== undefined &&
    (published === undefined || latestRejected.version > published.version) &&
    (newest === undefined || latestRejected.version > newest.version);

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

  const tags = await db
    .select({ name: tag.name, slug: tag.slug })
    .from(guideTag)
    .innerJoin(tag, eq(tag.id, guideTag.tagId))
    .where(eq(guideTag.guideId, g.id));

  const authorName = chosen.authorName ?? "Unknown";
  const pickerRevisions: RevisionMeta[] = visible.map(
    ({ id, version, status, authorId, authorName, createdAt }) => ({
      id,
      version,
      status,
      authorId,
      authorName,
      createdAt,
    }),
  );

  return (
    <>
      <TopBar
        crumbs={[
          { label: APP_TITLE, href: "/" },
          { label: s.name, href: `/spaces/${s.slug}` },
          {
            label: row.categoryName ?? GENERAL_CATEGORY_NAME,
            href: categoryPath(s.slug, row.categorySlug ?? GENERAL_CATEGORY_SLUG),
          },
          { label: revision.title },
        ]}
        userName={session?.user.name ?? "Staff"}
        actions={
          perms.canEdit ? (
            <ButtonLink href={`${basePath}/edit`} variant="secondary" size="sm">
              <PencilIcon size={13} />
              Edit guide
            </ButtonLink>
          ) : undefined
        }
      />
      <main className="grid grid-cols-1 gap-10 px-12 py-10 lg:grid-cols-[minmax(0,720px)_232px] print:block print:p-0">
        <article>
          {viewingOther && (
            <div className="mb-5 rounded-lg border border-warning-100 bg-warning-soft/50 px-4 py-3 text-sm text-fg print:hidden">
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  You&apos;re viewing {REVISION_NOUN[chosen.status]} v
                  {chosen.version}
                  {chosen.status === "rejected" && chosen.reviewedAt
                    ? ` (rejected ${timeAgo(chosen.reviewedAt)})`
                    : ""}
                  .{" "}
                  {published
                    ? `The published version is v${published.version}.`
                    : `The newest revision is v${defaultRevision.version}.`}
                </span>
                <ButtonLink
                  href={revisionHref(basePath, defaultRevision, g.currentRevisionId)}
                  variant="secondary"
                  size="sm"
                >
                  {published ? "View published" : "View newest"}
                </ButtonLink>
                {chosen.status === "rejected" && perms.canEdit && (
                  <ButtonLink href={`${basePath}/edit`} variant="secondary" size="sm">
                    Edit guide
                  </ButtonLink>
                )}
                {perms.canApprove && chosen.status === "draft" && (
                  <form action={publishDraftRevision.bind(null, chosen.id)}>
                    <Button type="submit" size="sm">
                      Publish this draft
                    </Button>
                  </form>
                )}
                {perms.canApprove && chosen.status === "pending" && (
                  <ButtonLink href={`/spaces/${s.slug}/queue`} size="sm">
                    Review in queue
                  </ButtonLink>
                )}
                {canDeleteChosen && (
                  <ConfirmForm
                    action={deleteDraftRevision.bind(null, chosen.id)}
                    message={`Delete draft v${chosen.version}? This removes it permanently. ${
                      published
                        ? `The published version (v${published.version}) is not affected.`
                        : "Other revisions of this guide are not affected."
                    }`}
                  >
                    <Button type="submit" variant="danger" size="sm">
                      Delete draft
                    </Button>
                  </ConfirmForm>
                )}
              </div>
              {chosen.status === "rejected" && chosen.reviewNote && (
                <p className="mt-1.5 text-[13px] text-fg-muted">
                  Reviewer note: “{chosen.reviewNote}”
                </p>
              )}
            </div>
          )}

          {!viewingOther && newerUnpublished && (published || isPending) && (
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-warning-100 bg-warning-soft/50 px-4 py-3 text-sm text-fg print:hidden">
              {published ? (
                <>
                  <span>
                    {isPending
                      ? `v${newerUnpublished.version} is awaiting approval.`
                      : `A newer draft (v${newerUnpublished.version}) is waiting.`}
                  </span>
                  <ButtonLink
                    href={revisionHref(basePath, newerUnpublished, g.currentRevisionId)}
                    variant="secondary"
                    size="sm"
                  >
                    {isPending ? "Preview submission" : "Preview draft"}
                  </ButtonLink>
                </>
              ) : (
                // Never published, so the pending revision is on screen
                // already (a never-published draft needs no banner: the
                // Draft badge covers it).
                <span>
                  v{newerUnpublished.version} is awaiting owner approval
                  before this guide goes live.
                </span>
              )}
              {perms.canApprove &&
                (isPending ? (
                  <ButtonLink href={`/spaces/${s.slug}/queue`} size="sm">
                    Review in queue
                  </ButtonLink>
                ) : (
                  published && (
                    <form action={publishDraftRevision.bind(null, newerUnpublished.id)}>
                      <Button type="submit" size="sm">
                        Publish draft
                      </Button>
                    </form>
                  )
                ))}
            </div>
          )}

          {showRejected && latestRejected && (
            <div className="mb-5 rounded-lg border border-danger-100 bg-danger-soft/50 px-4 py-3 text-sm text-fg print:hidden">
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  Submission v{latestRejected.version} was rejected
                  {latestRejected.reviewedAt
                    ? ` ${timeAgo(latestRejected.reviewedAt)}`
                    : ""}
                  . Edit the guide to revise and resubmit.
                </span>
                {chosen.id !== latestRejected.id && (
                  <ButtonLink
                    href={revisionHref(basePath, latestRejected, g.currentRevisionId)}
                    variant="secondary"
                    size="sm"
                  >
                    View submission
                  </ButtonLink>
                )}
                {perms.canEdit && (
                  <ButtonLink href={`${basePath}/edit`} variant="secondary" size="sm">
                    Edit guide
                  </ButtonLink>
                )}
              </div>
              {latestRejected.reviewNote && (
                <p className="mt-1.5 text-[13px] text-fg-muted">
                  Reviewer note: “{latestRejected.reviewNote}”
                </p>
              )}
            </div>
          )}

          {pendingAllStaff.length > 0 && (
            <div className="mb-5 rounded-lg border border-border bg-surface-sunken px-4 py-3 text-sm text-fg print:hidden">
              An all-staff publish request for this guide is awaiting admin
              approval. Until then it keeps its current audience.
            </div>
          )}

          <div className="mb-3.5 flex flex-wrap gap-2">
            <Badge tone="brand" className="print:hidden">{s.name}</Badge>
            {row.categoryName && (
              <Badge className="print:hidden">{row.categoryName}</Badge>
            )}
            {g.audience === "all_staff" && (
              <Badge className="print:hidden">All staff</Badge>
            )}
            {g.status !== "published" && (
              <Badge tone="warning">
                {isPending ? "Pending approval" : "Draft"}
              </Badge>
            )}
          </div>
          <h1 className="text-4xl font-black leading-[1.15] tracking-tight text-fg-strong">
            {revision.title}
          </h1>
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border pb-5">
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-fg-muted">
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
                {authorName}, {s.name}
              </span>
              <span aria-hidden>·</span>
              <span>{readingMinutes(revision.content)} min read</span>
              <span className="hidden basis-full print:block">
                Permanent link: {permalinkUrl(APP_URL, g.shortId)}
              </span>
            </div>
            <GuideActions
              permalinkPath={permalinkPath(g.shortId)}
              qrHref={qrLabelPath(g.shortId)}
              title={revision.title}
              blocks={revision.content}
              updatedAt={revision.createdAt}
              author={authorName}
              editHref={perms.canEdit ? `${basePath}/edit` : undefined}
              moveHref={perms.canApprove ? `${basePath}/move` : undefined}
            />
          </div>

          <div className="prose-guide pt-6">
            <GuideContent blocks={revision.content} />
          </div>
        </article>

        <aside className="hidden lg:block print:hidden">
          <div className="sticky top-[76px] flex flex-col gap-6">
            {tags.length > 0 && (
              <div>
                <MicroLabel className="mb-3">Tags</MicroLabel>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <Link
                      key={t.slug}
                      href={`/search?tag=${encodeURIComponent(t.slug)}`}
                      className="inline-flex h-[26px] items-center rounded-full border border-border bg-surface-raised px-2.5 text-xs text-fg-muted hover:border-accent hover:text-accent-text"
                    >
                      {t.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            <div className={tags.length > 0 ? "border-t border-border pt-5" : ""}>
              <MicroLabel className="mb-2.5">About this guide</MicroLabel>
              <p className="text-[13px] leading-relaxed text-fg-muted">
                Maintained by {s.name}.{" "}
                {g.audience === "all_staff"
                  ? "Visible to all staff."
                  : g.audience === "groups"
                    ? `Shared with ${audienceGroups.map((r) => r.name).join(", ") || "specific teams"}.`
                    : "Visible to the department."}
              </p>
            </div>
            <div className="border-t border-border pt-5">
              <MicroLabel className="mb-2.5">Permanent link</MicroLabel>
              <p className="break-all font-mono text-[12px] leading-relaxed text-fg">
                {permalinkUrl(APP_URL, g.shortId)}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">
                Keeps working if this guide is moved or renamed.
              </p>
              <Link
                href={qrLabelPath(g.shortId)}
                className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] text-accent-text hover:text-accent-strong"
              >
                <QrCodeIcon size={14} />
                Print QR code
              </Link>
            </div>
            {perms.canApprove && (
              <div className="border-t border-border pt-5">
                <MicroLabel className="mb-2.5">Revisions</MicroLabel>
                <RevisionPicker
                  basePath={basePath}
                  revisions={pickerRevisions}
                  currentRevisionId={g.currentRevisionId}
                  selectedId={chosen.id}
                />
                <p className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">
                  Only the published revision is visible to readers.
                </p>
              </div>
            )}
          </div>
        </aside>
      </main>
    </>
  );
}
