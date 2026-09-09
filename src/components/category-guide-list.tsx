"use client";

import { useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { AudienceIcon } from "@/components/audience-icon";
import { SearchIcon } from "@/components/icons";
import { Badge } from "@/components/ui";
import { filterGuides, type GuideAudience } from "@/lib/category-list";

// Everything the category page's list needs is loaded server-side and handed
// over as plain strings (dates pre-formatted there, so server and browser
// time zones can never disagree during hydration). Filtering is pure client
// work over the loaded rows — a category holds tens of guides, not thousands.
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
};

export function CategoryGuideList({ guides }: { guides: CategoryGuideRow[] }) {
  const [query, setQuery] = useState("");
  const visible = filterGuides(guides, query);
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
            aria-label="Search this category"
            placeholder="Search this category"
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
          <Link
            key={g.id}
            href={g.href}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border py-3 text-sm text-fg first:border-t-0 hover:text-accent-text"
          >
            <AudienceIcon audience={g.audience} />
            <span className="min-w-0 flex-1 truncate font-medium">{g.title}</span>
            {g.status !== "published" && <Badge tone="warning">Draft</Badge>}
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
