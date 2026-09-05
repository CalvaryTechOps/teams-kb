import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { APP_TITLE } from "@/lib/branding";
import { category, guide, space } from "@/db/schema";
import { Badge } from "@/components/ui";
import { TopBar } from "@/components/shell/top-bar";
import { MoveForm } from "@/components/move-form";
import { getSession, requireAdmin } from "@/lib/permissions";
import { GENERAL_CATEGORY_NAME, GENERAL_CATEGORY_SLUG } from "@/lib/categories";
import { guidePath } from "@/lib/moves";
import { moveTargets } from "@/lib/move-targets";
import { timeAgo } from "@/lib/time";
import { moveCategory, moveGeneralGuides } from "../../../../actions";

// Admin-only: move a whole category (and every guide in it, any status) to
// another department. At `.../categories/general/move` the same page moves
// the uncategorized guides instead, and gains a category picker because
// those guides have no category to carry across.
export default async function MoveCategoryPage({
  params,
}: PageProps<"/spaces/[slug]/categories/[categorySlug]/move">) {
  const { slug, categorySlug } = await params;
  await requireAdmin();
  const session = await getSession();

  const [s] = await db.select().from(space).where(eq(space.slug, slug));
  if (!s) notFound();

  const isGeneral = categorySlug === GENERAL_CATEGORY_SLUG;
  const [cat] = isGeneral
    ? []
    : await db
        .select()
        .from(category)
        .where(and(eq(category.spaceId, s.id), eq(category.slug, categorySlug)));
  if (!isGeneral && !cat) notFound();

  const guides = await db
    .select({
      id: guide.id,
      slug: guide.slug,
      title: guide.title,
      status: guide.status,
      updatedAt: guide.updatedAt,
    })
    .from(guide)
    .where(
      and(
        eq(guide.spaceId, s.id),
        isGeneral ? isNull(guide.categoryId) : eq(guide.categoryId, cat!.id),
      ),
    )
    .orderBy(asc(guide.title));
  // Nothing uncategorized to move: the General card isn't even rendered.
  if (isGeneral && guides.length === 0) redirect(`/spaces/${s.slug}`);

  const name = isGeneral ? GENERAL_CATEGORY_NAME : cat!.name;
  const back = `/spaces/${s.slug}#${categorySlug}`;
  const targets = (await moveTargets()).filter((t) => t.id !== s.id);

  return (
    <>
      <TopBar
        crumbs={[
          { label: APP_TITLE, href: "/" },
          { label: s.name, href: `/spaces/${s.slug}` },
          { label: name, href: back },
          { label: "Move" },
        ]}
        userName={session?.user.name ?? "Staff"}
      />
      <main className="px-14 py-10">
        <h1 className="mb-1.5 text-3xl font-black tracking-tight text-ink">
          {isGeneral ? "Move all General guides" : `Move “${name}”`}
        </h1>
        <p className="mb-6 text-sm text-grey-500">
          {isGeneral
            ? "Every uncategorized guide in this department moves to the department and category you choose."
            : "The category and every guide in it move to the department you choose. If that department already has a category with the same name, the guides join it."}
        </p>
        <MoveForm
          action={
            isGeneral
              ? moveGeneralGuides.bind(null, s.slug)
              : moveCategory.bind(null, { spaceSlug: s.slug, categorySlug })
          }
          spaces={targets}
          withCategory={isGeneral}
          cancelHref={back}
          moveLabel={
            guides.length === 1 ? "Move 1 guide" : `Move ${guides.length} guides`
          }
        />
        <p className="mt-3 text-xs text-grey-500">
          Department-audience guides become readable by the new department&apos;s
          members and stop being readable by members of {s.name}.
        </p>

        <section
          aria-label="Guides that will move"
          className="mt-10 max-w-[720px] rounded-xl border border-grey-200 bg-white px-6 py-5 shadow-xs"
        >
          <div className="mb-2 flex items-baseline justify-between">
            <div className="font-bold text-ink">{name}</div>
            <div className="text-xs text-grey-500">{guides.length}</div>
          </div>
          <div className="flex flex-col">
            {guides.map((g) => (
              <Link
                key={g.id}
                href={guidePath(s.slug, g.slug)}
                className="flex items-center justify-between gap-3 border-t border-grey-100 py-2.5 text-sm text-grey-800 hover:text-cyan-700"
              >
                <span className="truncate">{g.title}</span>
                <span className="flex shrink-0 items-center gap-3 text-xs text-grey-500">
                  {g.status !== "published" && (
                    <Badge tone="warning">
                      {g.status === "deleted" ? "Pending deletion" : "Draft"}
                    </Badge>
                  )}
                  Updated {timeAgo(g.updatedAt)}
                </span>
              </Link>
            ))}
            {guides.length === 0 && (
              <p className="border-t border-grey-100 py-2.5 text-sm text-grey-400">
                Nothing here yet — only the empty category moves.
              </p>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
