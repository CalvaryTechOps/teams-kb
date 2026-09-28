"use client";

import { useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { AudienceIcon } from "@/components/audience-icon";
import { SearchIcon, StarIcon } from "@/components/icons";
import { Badge } from "@/components/ui";
import { filterGuides, type GuideAudience } from "@/lib/category-list";
import { favoriteLabel } from "@/lib/favorites";
import { GENERAL_CATEGORY_NAME } from "@/lib/categories";

// Everything the category page's list needs is loaded server-side and handed
// over as plain strings (dates pre-formatted there, so server and browser
// time zones can never disagree during hydration). Filtering is pure client
// work over the loaded rows — a category holds tens of guides, not thousands.
//
// The favorites page reuses this list (plans/favorites.md): its rows carry
// the department they live in today, the search box also matches that name,
// and each row ends in a filled star that unstars it.
export type CategoryGuideRow = {
  id: string;
  href: string;
  title: string;
  status: "draft" | "published" | "archived" | "deleted";
  audience: GuideAudience;
  tags: string[];
  createdLabel: string;
  createdIso: string;
  updatedLabel: string;
  updatedIso: string;
  updatedBy: string;
  /** Set on lists that span departments; renders the department cell. */
  spaceName?: string;
  /** Null means the guide is filed under General. Only read with spaceName. */
  categoryName?: string | null;
};

const DEFAULT_PLACEHOLDER = "Search this category";

const departmentOf = (g: CategoryGuideRow) => (g.spaceName ? [g.spaceName] : []);

export function CategoryGuideList({
  guides,
  placeholder = DEFAULT_PLACEHOLDER,
  showDepartment = false,
  onUnfavorite,
}: {
  guides: CategoryGuideRow[];
  /** Placeholder and accessible name of the filter box. */
  placeholder?: string;
  /** Show each row's department (and category) in a fixed-width slot. */
  showDepartment?: boolean;
  /** When given, every row ends in a filled star that calls this on click. */
  onUnfavorite?: (guideId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = filterGuides(guides, query, showDepartment ? departmentOf : undefined);
  const trimmed = query.trim();

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.preventDefault();
    if (e.key === "Escape" && query) {
      e.preventDefault();
      setQuery("");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-border-strong bg-surface-raised px-4 shadow-xs focus-within:border-accent focus-within:shadow-focus sm:max-w-[560px]">
          <SearchIcon size={16} className="shrink-0 text-fg-subtle" />
          <input
            type="search"
            autoComplete="off"
            aria-label={placeholder}
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className="h-11 w-full min-w-0 bg-transparent text-sm text-fg-strong placeholder-fg-subtle focus:outline-none"
          />
        </div>
        {trimmed && (
          <div className="text-xs text-fg-muted">
            {visible.length} of {guides.length}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface-raised px-6 py-2 shadow-xs">
        {visible.map((g) => (
          <div
            key={g.id}
            className="flex items-center gap-3 border-t border-border first:border-t-0"
          >
            <Link
              href={g.href}
              className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm text-fg hover:text-accent-text"
            >
              <AudienceIcon audience={g.audience} />
              <span className="min-w-0 flex-1 truncate font-medium">{g.title}</span>
              {g.status !== "published" && <Badge tone="warning">Draft</Badge>}
              {showDepartment && g.spaceName && (
                <span className="flex basis-full items-center gap-2 pl-[26px] sm:basis-auto sm:w-[200px] sm:pl-0">
                  <Badge tone="brand" size="sm" className="shrink-0">
                    {g.spaceName}
                  </Badge>
                  <span className="truncate text-xs text-fg-muted">
                    {g.categoryName ?? GENERAL_CATEGORY_NAME}
                  </span>
                </span>
              )}
              <span className="flex basis-full flex-wrap gap-x-3.5 pl-[26px] text-xs text-fg-muted sm:basis-auto sm:pl-0">
                <span>
                  Created <time dateTime={g.createdIso}>{g.createdLabel}</time>
                </span>
                <span>
                  Updated <time dateTime={g.updatedIso}>{g.updatedLabel}</time> by{" "}
                  {g.updatedBy}
                </span>
              </span>
            </Link>
            {onUnfavorite && (
              <button
                type="button"
                onClick={() => onUnfavorite(g.id)}
                aria-label={`${favoriteLabel(true)}: ${g.title}`}
                title={favoriteLabel(true)}
                className="shrink-0 rounded-md p-1.5 text-accent hover:bg-surface focus-visible:outline-none focus-visible:shadow-focus"
              >
                <StarIcon size={15} filled />
              </button>
            )}
          </div>
        ))}
        {visible.length === 0 && (
          <p className="py-3 text-sm text-fg-muted">
            No articles match “{trimmed}”.
          </p>
        )}
      </div>
    </div>
  );
}
