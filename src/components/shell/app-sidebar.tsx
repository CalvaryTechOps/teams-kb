import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { category } from "@/db/schema";
import { Avatar, MicroLabel } from "@/components/ui";
import { BrandMark } from "@/components/brand-mark";
import { requireAccess } from "@/lib/permissions";
import { visibleArticleCountsBySpace } from "@/lib/space-counts";
import { getShowEmptyPreference } from "@/lib/space-visibility.server";
import { getSiteSettings } from "@/lib/site-settings.server";
import { SearchIcon, SettingsIcon } from "@/components/icons";
import { SignOutButton } from "@/components/sign-out-button";
import { SidebarClose } from "./sidebar-shell";
import { SIDEBAR_SEARCH_ID } from "@/lib/sidebar-state";
import { SidebarNav, type SidebarSpace } from "./sidebar-nav";
import { GENERAL_CATEGORY_NAME, GENERAL_CATEGORY_SLUG } from "@/lib/categories";

// Ink sidebar from the mockups: logo, search, departments accordion, user
// footer. Space names are not secret — the guides inside are what's filtered;
// each department pill counts only the published guides this user can read.
export async function AppSidebar({
  userName,
  isAdmin,
}: {
  userName: string;
  isAdmin: boolean;
}) {
  // Cached per request (the layout already resolved it), so this is free.
  const access = await requireAccess();
  const [spaces, showEmpty, settings, categories] = await Promise.all([
    visibleArticleCountsBySpace(access),
    getShowEmptyPreference(),
    getSiteSettings(),
    db
      .select({
        spaceId: category.spaceId,
        slug: category.slug,
        name: category.name,
      })
      .from(category)
      .orderBy(asc(category.sortOrder), asc(category.name)),
  ]);

  const navSpaces: SidebarSpace[] = spaces.map((s) => ({
    slug: s.slug,
    name: s.name,
    articleCount: s.articles,
    isMine: s.isMine,
    // Every department ends with General (its uncategorized guides), even
    // when nothing is filed there yet — the page says so.
    categories: [
      ...categories
        .filter((c) => c.spaceId === s.id)
        .map((c) => ({ slug: c.slug, name: c.name })),
      { slug: GENERAL_CATEGORY_SLUG, name: GENERAL_CATEGORY_NAME },
    ],
  }));

  return (
    <aside className="flex h-full w-[268px] shrink-0 flex-col overflow-y-auto bg-ink pb-5">
      {/* 60px header, level with the TopBar so the collapse control here and
          the hamburger there share a baseline. */}
      <div className="flex h-[60px] shrink-0 items-center justify-between px-5">
        <Link href="/">
          <BrandMark />
        </Link>
        <div className="flex items-center gap-1">
          {isAdmin && (
            <Link
              href="/admin"
              title="Admin"
              className="rounded-md p-1.5 text-grey-400 hover:bg-white/10 hover:text-white"
            >
              <SettingsIcon size={15} />
            </Link>
          )}
          <SidebarClose />
        </div>
      </div>

      <form action="/search" className="px-4 pb-4 pt-1">
        <div className="group flex items-center gap-2 rounded-lg bg-white/10 px-2.5 focus-within:shadow-focus">
          <SearchIcon size={14} className="shrink-0 text-grey-400" />
          <input
            id={SIDEBAR_SEARCH_ID}
            type="search"
            name="q"
            placeholder="Search articles"
            className="h-9 w-full bg-transparent text-[13px] text-white placeholder-grey-400 focus:outline-none"
          />
          {/* Shortcut hint; hides while typing. Keyboard-only, so md+ only. */}
          <kbd
            aria-hidden
            className="hidden rounded border border-white/15 px-1.5 text-[11px] leading-5 text-grey-400 md:inline md:group-focus-within:hidden"
          >
            /
          </kbd>
        </div>
      </form>

      <MicroLabel className="px-5 pb-1.5 pt-2 !text-grey-600">
        Departments
      </MicroLabel>
      <SidebarNav spaces={navSpaces} initialShowEmpty={showEmpty} />

      <div className="mt-auto flex items-center gap-2.5 border-t border-white/10 px-5 pt-4">
        <Avatar name={userName} onDark />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13px] font-medium text-white">
            {userName}
          </div>
          <div className="text-[11px] text-grey-500">
            {settings["account.label"]}
          </div>
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}
