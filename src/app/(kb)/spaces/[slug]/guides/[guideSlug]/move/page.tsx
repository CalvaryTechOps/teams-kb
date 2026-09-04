import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { APP_TITLE } from "@/lib/branding";
import { category, guide, guideRevision, space } from "@/db/schema";
import { Badge } from "@/components/ui";
import { TopBar } from "@/components/shell/top-bar";
import { GuideContent } from "@/components/guide-content";
import { MoveForm } from "@/components/move-form";
import { getSession, requireAdmin } from "@/lib/permissions";
import { guidePath } from "@/lib/moves";
import { moveTargets } from "@/lib/move-targets";
import { moveGuide } from "../../../../actions";

// Admin-only: re-file one guide into another department (and a category
// there). The mover row sits above a read-only preview of the guide so the
// admin sees exactly what is about to move.
export default async function MoveGuidePage({
  params,
}: PageProps<"/spaces/[slug]/guides/[guideSlug]/move">) {
  const { slug, guideSlug } = await params;
  await requireAdmin();
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

  const targets = await moveTargets(s.id);
  const back = guidePath(s.slug, g.slug);

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
          Choose the department this guide should live in, then a category
          there. Its history, tags and audience come along unchanged.
        </p>
        <MoveForm
          action={moveGuide.bind(null, { spaceSlug: s.slug, guideId: g.id })}
          spaces={targets}
          withCategory
          cancelHref={back}
        />
        {g.audience === "department" && (
          <p className="mt-3 text-xs text-grey-500">
            This guide is visible to its department. After the move, members of
            the new department can read it and members of {s.name} no longer
            can.
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
