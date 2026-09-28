import { APP_TITLE } from "@/lib/branding";
import { TopBar } from "@/components/shell/top-bar";
import { PageNotice } from "@/components/page-notice";
import { FavoritesList } from "@/components/favorites-list";
import type { CategoryGuideRow } from "@/components/category-guide-list";
import { getSession, requireAccess } from "@/lib/permissions";
import { listFavorites } from "@/lib/favorites.server";
import { guidePath } from "@/lib/moves";
import { shortDate } from "@/lib/time";

// The viewer's starred guides across every department (plans/favorites.md):
// the category page's list with a department column and a filter box that
// also matches department names. Only favorites the viewer can read today
// are listed; the rest wait in the table in case access returns.
export default async function FavoritesPage() {
  const access = await requireAccess();
  const session = await getSession();
  const userName = session?.user.name ?? "Staff";

  const favorites = await listFavorites(access);
  const guides: CategoryGuideRow[] = favorites.map((f) => ({
    id: f.id,
    href: guidePath(f.spaceSlug, f.slug),
    title: f.title,
    status: f.status,
    audience: f.audience,
    tags: f.tags,
    createdLabel: shortDate(f.createdAt),
    createdIso: f.createdAt.toISOString(),
    updatedLabel: shortDate(f.updatedAt),
    updatedIso: f.updatedAt.toISOString(),
    updatedBy: f.updatedBy,
    spaceName: f.spaceName,
    categoryName: f.categoryName,
  }));

  const crumbs = [{ label: APP_TITLE, href: "/" }, { label: "Favorites" }];

  if (guides.length === 0) {
    return (
      <>
        <TopBar crumbs={crumbs} userName={userName} />
        <PageNotice
          title="No Favorites Yet"
          text="Open any guide and click the star to keep it here."
          href="/"
          linkLabel="Browse departments"
        />
      </>
    );
  }

  return (
    <>
      <TopBar crumbs={crumbs} userName={userName} />
      <main className="px-14 py-10">
        <FavoritesList guides={guides} />
      </main>
    </>
  );
}
