"use client";

import { startTransition, useState } from "react";
import {
  CategoryGuideList,
  type CategoryGuideRow,
} from "@/components/category-guide-list";
import { FAVORITES_FILTER_PLACEHOLDER } from "@/lib/favorites";
import { toggleFavorite } from "@/app/(kb)/actions";

// The /favorites page body: the article count and the filterable list, with
// each row's star unstarring it in place. Rows are owned here so a removed
// favorite leaves the list and the count at once; if the server refuses,
// the row comes back with a note.
export function FavoritesList({ guides }: { guides: CategoryGuideRow[] }) {
  const [rows, setRows] = useState(guides);
  const [error, setError] = useState<string | null>(null);

  const unfavorite = (guideId: string) => {
    const removed = rows.find((r) => r.id === guideId);
    if (!removed) return;
    setRows((prev) => prev.filter((r) => r.id !== guideId));
    setError(null);
    startTransition(async () => {
      try {
        await toggleFavorite(guideId, false);
      } catch {
        setRows((prev) =>
          [...prev, removed].sort((a, b) => a.title.localeCompare(b.title)),
        );
        setError(`Couldn't remove “${removed.title}” from your favorites.`);
      }
    });
  };

  return (
    <>
      <div className="flex items-end justify-between gap-6">
        <h1 className="text-4xl font-black tracking-tight text-fg-strong">Favorites</h1>
        <div className="text-[13px] text-fg-muted">
          {rows.length} article{rows.length === 1 ? "" : "s"}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-8 max-w-[960px]">
        {rows.length > 0 ? (
          <CategoryGuideList
            guides={rows}
            placeholder={FAVORITES_FILTER_PLACEHOLDER}
            showDepartment
            onUnfavorite={unfavorite}
          />
        ) : (
          <p className="text-sm text-fg-muted">
            No favorites left. Open any guide and click the star to keep it here.
          </p>
        )}
      </div>
    </>
  );
}
