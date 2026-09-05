import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { APP_TITLE } from "@/lib/branding";
import { category, guide, guideRevision, space } from "@/db/schema";
import { Badge } from "@/components/ui";
import { TopBar } from "@/components/shell/top-bar";
import { GuideContent } from "@/components/guide-content";
import { MoveForm } from "@/components/move-form";
import {
  getSession,
  requireAccess,
  resolveGuidePermissions,
} from "@/lib/permissions";
import { guidePath } from "@/lib/moves";
import { moveTargets } from "@/lib/move-targets";
import { moveGuide } from "../../../../actions";

// Re-file one guide. Space owners pick another category within their own
// department (what the guide form's picker does, without the scrolling);
// admins may also choose a different department. The mover row sits above
// a read-only preview so the person sees exactly what is about to move.
export default async function MoveGuidePage({
  params,
}: PageProps<"/spaces/[slug]/guides/[guideSlug]/move">) {
  const { slug, guideSlug } = await params;
  const access = await requireAccess();
  const session = await getSession();

  const [row] = await db
    .select({ g: guide, s: space, categoryName: category.name })
    .from(guide)
    .innerJoin(space, eq(space.id, guide.spaceId))
    .leftJoin(category, eq(category.id, guide.categoryId))
    .where(and(eq(space.slug, slug), eq(guide.slug, guideSlug)));
  // A guide awaiting deletion has no page; it can't be moved either.
  if (!row || row.g.status === "deleted") notFound();
  const { g, s } = row;
  const back = guidePath(s.slug, g.slug);

  const perms = resolveGuidePermissions(access, {
    spaceGroupId: s.groupId,
    status: g.status,
    audience: g.audience,
    createdBy: g.createdBy,
  });
  if (!perms.canApprove) redirect(back);

  // Preview what readers see: the published revision, else (never-published
  // guides) the newest revision of any status. Admins may see everything.
  const [revision] = g.currentRevisionId
    ? await db
        .select()
        .from(guideRevision)
        .where(eq(guideRevision.id, g.currentRevisionId))
    : await db
        .select()
        .from(guideRevision)
        .where(eq(guideRevision.guideId, g.id))
        .orderBy(desc(guideRevision.version))
        .limit(1);
  if (!revision) notFound();

  // Owners see only their own department; admins see every space.
  const targets = (await moveTargets()).filter(
    (t) => access.isAdmin || t.id === s.id,
  );

  return (
    <>
      <TopBar
        crumbs={[
          { label: APP_TITLE, href: "/" },
          { label: s.name, href: `/spaces/${s.slug}` },
          { label: g.title, href: back },
          { label: "Move" },
        ]}
        userName={session?.user.name ?? "Staff"}
      />
      <main className="px-14 py-10">
        <h1 className="mb-1.5 text-3xl font-black tracking-tight text-ink">
          Move guide
        </h1>
        <p className="mb-6 text-sm text-grey-500">
          {access.isAdmin
            ? "Choose the department this guide should live in, then a category there. Its history, tags and audience come along unchanged."
            : "Choose the category this guide should live in. Its history, tags and audience come along unchanged."}
        </p>
        <MoveForm
          action={moveGuide.bind(null, { spaceSlug: s.slug, guideId: g.id })}
          spaces={targets}
          withCategory
          current={{ spaceId: s.id, categoryId: g.categoryId }}
          lockSpace={!access.isAdmin}
          cancelHref={back}
        />
        {access.isAdmin && g.audience === "department" && (
          <p className="mt-3 text-xs text-grey-500">
            This guide is visible to its department. Moving it to another
            department means that department&apos;s members can read it and
            members of {s.name} no longer can.
          </p>
        )}

        <section
          aria-label="Preview"
          className="mt-10 max-w-[720px] border-t border-grey-200 pt-8"
        >
          <div className="mb-3.5 flex flex-wrap gap-2">
            <Badge tone="brand">{s.name}</Badge>
            {row.categoryName && <Badge>{row.categoryName}</Badge>}
            {g.audience === "all_staff" && <Badge>All staff</Badge>}
            {g.status !== "published" && <Badge tone="warning">Draft</Badge>}
          </div>
          <h2 className="text-4xl font-black leading-[1.15] tracking-tight text-ink">
            {revision.title}
          </h2>
          <div className="prose-guide pt-6">
            <GuideContent blocks={revision.content} />
          </div>
        </section>
      </main>
    </>
  );
}
