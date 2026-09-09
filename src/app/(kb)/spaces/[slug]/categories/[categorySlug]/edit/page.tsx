import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { APP_TITLE } from "@/lib/branding";
import { category, guide, space } from "@/db/schema";
import { Badge, Button } from "@/components/ui";
import { TopBar } from "@/components/shell/top-bar";
import { MoveForm } from "@/components/move-form";
import { ConfirmForm } from "@/components/confirm-form";
import { CategoryNameForm } from "@/components/category-name-form";
import {
  getSession,
  requireAccess,
  resolveGuidePermissions,
} from "@/lib/permissions";
import {
  categoryPath,
  GENERAL_CATEGORY_NAME,
  GENERAL_CATEGORY_SLUG,
} from "@/lib/categories";
import { renameConflictMessage } from "@/lib/category-rename";
import { guidePath } from "@/lib/moves";
import { moveTargets } from "@/lib/move-targets";
import { timeAgo } from "@/lib/time";
import {
  deleteCategory,
  moveCategory,
  moveGeneralGuides,
  renameCategory,
} from "../../../../actions";

// One place to manage a category: rename it (keeping or changing its web
// address), move it to another department (admins), and delete it once it is
// empty — each its own form, so no submit touches another section. Every
// guide in the category, any status, is listed underneath so the reason a
// Delete button is missing is visible. At `.../categories/general/edit` the
// same page offers only "Move all General guides" (admins), since General
// is the synthetic card for uncategorized guides and has nothing to rename.
export default async function EditCategoryPage({
  params,
  searchParams,
}: PageProps<"/spaces/[slug]/categories/[categorySlug]/edit">) {
  const { slug, categorySlug } = await params;
  const query = await searchParams;
  const access = await requireAccess();
  const session = await getSession();

  const [s] = await db.select().from(space).where(eq(space.slug, slug));
  if (!s) notFound();

  const back = categoryPath(s.slug, categorySlug);
  const perms = resolveGuidePermissions(access, {
    spaceGroupId: s.groupId,
    status: "published",
    audience: "department",
  });
  const isGeneral = categorySlug === GENERAL_CATEGORY_SLUG;
  if (!perms.canApprove || (isGeneral && !access.isAdmin)) redirect(back);

  const [cat] = isGeneral
    ? []
    : await db
        .select()
        .from(category)
        .where(and(eq(category.spaceId, s.id), eq(category.slug, categorySlug)));
  if (!isGeneral && !cat) notFound();

  // Owners and admins see every guide in their space, so this is the true
  // contents — including drafts and guides awaiting deletion.
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
  const ref = { spaceSlug: s.slug, categorySlug };
  const targets = access.isAdmin
    ? (await moveTargets()).filter((t) => t.id !== s.id)
    : [];
  const error = renameConflictMessage(first(query.error));

  return (
    <>
      <TopBar
        crumbs={[
          { label: APP_TITLE, href: "/" },
          { label: s.name, href: `/spaces/${s.slug}` },
          { label: name, href: back },
          { label: isGeneral ? "Move" : "Edit" },
        ]}
        userName={session?.user.name ?? "Staff"}
      />
      <main className="px-14 py-10">
        <h1 className="mb-1.5 text-3xl font-black tracking-tight text-fg-strong">
          {isGeneral ? "Move all General guides" : `Edit “${name}”`}
        </h1>
        <p className="mb-8 text-sm text-fg-muted">
          {isGeneral
            ? "Every uncategorized guide in this department moves to the department and category you choose."
            : "Rename the category, move it to another department, or delete it once nothing is filed in it."}
        </p>

        <div className="flex max-w-[720px] flex-col gap-5">
          {!isGeneral && (
            <section
              aria-labelledby="category-name-heading"
              className="rounded-xl border border-border bg-surface-raised px-6 py-5 shadow-xs"
            >
              <h2 id="category-name-heading" className="text-sm font-semibold text-fg-strong">
                Name
              </h2>
              <p className="mb-4 mt-1 text-xs text-fg-muted">
                Shown on the department page, in the sidebar and in every
                guide&apos;s breadcrumb.
              </p>
              {error && (
                <p className="mb-4 rounded-lg border border-danger bg-danger-soft px-4 py-2.5 text-sm text-danger">
                  {error}
                </p>
              )}
              <CategoryNameForm
                action={renameCategory.bind(null, ref)}
                name={cat!.name}
                slug={cat!.slug}
                spaceSlug={s.slug}
                cancelHref={back}
              />
            </section>
          )}

          {access.isAdmin && (
            <section
              aria-labelledby="category-move-heading"
              className="rounded-xl border border-border bg-surface-raised px-6 py-5 shadow-xs"
            >
              <h2 id="category-move-heading" className="text-sm font-semibold text-fg-strong">
                {isGeneral ? "Move to" : "Move to another department"}
              </h2>
              <p className="mb-4 mt-1 text-xs text-fg-muted">
                {isGeneral
                  ? "Pick the department and category the uncategorized guides should live in."
                  : "The category and every guide in it move to the department you choose. If that department already has a category with the same name, the guides join it."}
              </p>
              <MoveForm
                action={
                  isGeneral
                    ? moveGeneralGuides.bind(null, s.slug)
                    : moveCategory.bind(null, ref)
                }
                spaces={targets}
                withCategory={isGeneral}
                cancelHref={back}
                moveLabel={
                  guides.length === 1 ? "Move 1 guide" : `Move ${guides.length} guides`
                }
              />
              <p className="mt-3 text-xs text-fg-muted">
                Department-audience guides become readable by the new
                department&apos;s members and stop being readable by members of{" "}
                {s.name}.
              </p>
            </section>
          )}

          {!isGeneral && (
            <section
              aria-labelledby="category-delete-heading"
              className="rounded-xl border border-danger-100 bg-surface-raised px-6 py-5 shadow-xs"
            >
              <h2 id="category-delete-heading" className="text-sm font-semibold text-fg-strong">
                Delete
              </h2>
              {guides.length === 0 ? (
                <>
                  <p className="mb-4 mt-1 text-xs text-fg-muted">
                    Nothing is filed here. Deleting removes the category from
                    the department page and the sidebar; its address stops
                    working.
                  </p>
                  <ConfirmForm
                    action={deleteCategory.bind(null, ref)}
                    message={`Delete the empty category “${name}”? Its address will stop working.`}
                  >
                    <Button type="submit" variant="danger" size="sm">
                      Delete category
                    </Button>
                  </ConfirmForm>
                </>
              ) : (
                <p className="mt-1 text-xs text-fg-muted">
                  Move or re-file the guides below before deleting this
                  category. Drafts and guides awaiting deletion count too.
                </p>
              )}
            </section>
          )}

          <section
            aria-label="Guides in this category"
            className="rounded-xl border border-border bg-surface-raised px-6 py-5 shadow-xs"
          >
            <div className="mb-2 flex items-baseline justify-between">
              <div className="font-bold text-fg-strong">{name}</div>
              <div className="text-xs text-fg-muted">{guides.length}</div>
            </div>
            <div className="flex flex-col">
              {guides.map((g) => (
                <Link
                  key={g.id}
                  href={guidePath(s.slug, g.slug)}
                  className="flex items-center justify-between gap-3 border-t border-border py-2.5 text-sm text-fg hover:text-accent-text"
                >
                  <span className="truncate">{g.title}</span>
                  <span className="flex shrink-0 items-center gap-3 text-xs text-fg-muted">
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
                <p className="border-t border-border py-2.5 text-sm text-fg-subtle">
                  Nothing here yet.
                </p>
              )}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}
