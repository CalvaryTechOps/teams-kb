import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { APP_TITLE } from "@/lib/branding";
import { guide, guideRevision, space, user } from "@/db/schema";
import { Badge, Button, ButtonLink } from "@/components/ui";
import { CheckIcon, XIcon } from "@/components/icons";
import { ContentDiff } from "@/components/content-diff";
import { TopBar } from "@/components/shell/top-bar";
import {
  getSession,
  requireAccess,
  resolveGuidePermissions,
} from "@/lib/permissions";
import { timeAgo } from "@/lib/time";
import { approveRevision, rejectRevision } from "../../actions";

// Owner approval queue: every pending submission in the space, shown as a
// line diff against the currently published revision, with approve/reject.

export default async function QueuePage({
  params,
}: PageProps<"/spaces/[slug]/queue">) {
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
  if (!perms.canApprove) redirect(`/spaces/${s.slug}`);

  const pending = await db
    .select({
      rev: guideRevision,
      guideSlug: guide.slug,
      currentRevisionId: guide.currentRevisionId,
      authorName: user.name,
    })
    .from(guideRevision)
    .innerJoin(guide, eq(guide.id, guideRevision.guideId))
    .innerJoin(user, eq(user.id, guideRevision.authorId))
    .where(
      and(
        eq(guide.spaceId, s.id),
        eq(guideRevision.status, "pending"),
        // Submissions on a guide awaiting deletion wait with the guide.
        ne(guide.status, "deleted"),
      ),
    )
    .orderBy(asc(guideRevision.createdAt));

  // Published content each submission diffs against, fetched in one query.
  const currentIds = pending
    .map((p) => p.currentRevisionId)
    .filter((id): id is string => id !== null);
  const currentRevisions =
    currentIds.length > 0
      ? await db
          .select({
            id: guideRevision.id,
            title: guideRevision.title,
            content: guideRevision.content,
          })
          .from(guideRevision)
          .where(inArray(guideRevision.id, currentIds))
      : [];
  const currentById = new Map(currentRevisions.map((r) => [r.id, r]));

  return (
    <>
      <TopBar
        crumbs={[
          { label: APP_TITLE, href: "/" },
          { label: s.name, href: `/spaces/${s.slug}` },
          { label: "Approval queue" },
        ]}
        userName={session?.user.name ?? "Staff"}
      />
      <main className="px-14 py-10">
        <h1 className="text-3xl font-black tracking-tight text-ink">
          Approval queue
        </h1>
        <p className="mt-1.5 text-sm text-grey-500">
          Submissions from {s.name} members. Approving publishes the revision;
          rejecting returns it to the author with your note.
        </p>

        <div className="mt-8 flex max-w-[880px] flex-col gap-6">
          {pending.map(({ rev, guideSlug, currentRevisionId, authorName }) => {
            const current = currentRevisionId
              ? currentById.get(currentRevisionId)
              : undefined;
            return (
              <section
                key={rev.id}
                className="rounded-xl border border-grey-200 bg-white shadow-xs"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-grey-200 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/spaces/${s.slug}/guides/${guideSlug}?rev=draft`}
                      className="font-bold text-ink hover:text-cyan-700"
                    >
                      {rev.title}
                    </Link>
                    {current && rev.title !== current.title && (
                      <div className="mt-0.5 text-xs text-grey-500">
                        Renamed from “{current.title}”
                      </div>
                    )}
                    <div className="mt-0.5 text-xs text-grey-500">
                      v{rev.version} · {authorName} · submitted{" "}
                      {timeAgo(rev.createdAt)}
                    </div>
                  </div>
                  {!current && <Badge tone="brand">New guide</Badge>}
                  <ButtonLink
                    href={`/spaces/${s.slug}/guides/${guideSlug}?rev=draft`}
                    variant="ghost"
                    size="sm"
                  >
                    Preview
                  </ButtonLink>
                </div>

                <div className="px-6 py-4">
                  <ContentDiff
                    before={current?.content ?? []}
                    after={rev.content}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3 border-t border-grey-200 bg-grey-50 px-6 py-3.5">
                  <form action={approveRevision.bind(null, rev.id)}>
                    <Button type="submit" size="sm">
                      <CheckIcon size={14} />
                      Approve and publish
                    </Button>
                  </form>
                  <form
                    action={rejectRevision.bind(null, rev.id)}
                    className="flex flex-1 flex-wrap items-center gap-2"
                  >
                    <input
                      name="note"
                      placeholder="Why it's not ready (sent to the author)"
                      className="h-8 min-w-64 flex-1 rounded-lg border border-grey-300 bg-white px-3 text-xs focus:border-cyan-400 focus:shadow-focus focus:outline-none"
                    />
                    <Button type="submit" variant="secondary" size="sm">
                      <XIcon size={14} />
                      Reject
                    </Button>
                  </form>
                </div>
              </section>
            );
          })}

          {pending.length === 0 && (
            <div className="rounded-xl border border-grey-200 bg-white px-6 py-10 text-center shadow-xs">
              <p className="font-medium text-ink">Nothing waiting for review</p>
              <p className="mt-1 text-sm text-grey-500">
                Member submissions will appear here for approval.
              </p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
