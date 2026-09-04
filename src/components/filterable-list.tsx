"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { SearchIcon, XIcon } from "@/components/icons";
import { filterByLabel, selectedFirst } from "@/lib/filter-list";

// Filter-as-you-type over a client-side list that is already fully loaded
// (synced M365 groups run to the hundreds, never the millions). Pure client
// work: no server round-trips, no debounce needed at this scale.

export type FilterableItem = { id: string; name: string };

/**
 * Filter box + render-prop for whatever the visible rows look like. The box is
 * a plain `type="text"` input with Enter swallowed so it can sit inside any
 * form (e.g. the guide form) without ever submitting it or contributing a
 * field of its own.
 */
export function FilterableList<T>({
  items,
  getLabel,
  noun,
  placeholder,
  aside,
  children,
}: {
  items: readonly T[];
  getLabel: (item: T) => string;
  /** Plural noun for the empty state, e.g. "teams" → “No teams match ‘x’.” */
  noun: string;
  placeholder?: string;
  /** Optional status text rendered to the right of the filter box. */
  aside?: ReactNode;
  children: (visible: T[]) => ReactNode;
}) {
  const [query, setQuery] = useState("");
  const visible = filterByLabel(items, query, getLabel);
  const trimmed = query.trim();

  function guardEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.preventDefault();
    if (e.key === "Escape" && query) {
      e.preventDefault();
      setQuery("");
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-grey-300 bg-grey-50 px-2.5 focus-within:border-cyan-400 focus-within:shadow-focus">
          <SearchIcon size={14} className="shrink-0 text-grey-400" />
          <input
            type="text"
            autoComplete="off"
            aria-label={placeholder ?? `Filter ${noun}`}
            placeholder={placeholder ?? `Filter ${noun}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={guardEnter}
            className="h-9 w-full min-w-0 bg-transparent text-sm text-ink placeholder-grey-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear filter"
              className="shrink-0 rounded p-0.5 text-grey-400 hover:bg-grey-200 hover:text-grey-700"
            >
              <XIcon size={14} />
            </button>
          )}
        </div>
        {aside && <div className="shrink-0 text-xs text-grey-500">{aside}</div>}
      </div>

      {visible.length === 0 ? (
        <p className="text-xs text-grey-500">
          No {noun} match “{trimmed}”.
        </p>
      ) : (
        children(visible)
      )}
    </div>
  );
}

/**
 * Filterable checkbox group that posts as `name` (one value per checked id).
 *
 * Selection is controlled state, and the form contribution is a set of hidden
 * inputs that stay mounted no matter what the filter hides — so filtering a
 * checked row out of view can never drop it from the submission. Checked
 * items sort to the top so they are easy to review and uncheck.
 */
export function FilterableCheckboxList({
  items,
  name,
  defaultSelectedIds,
  noun,
  placeholder,
  maxHeightClass = "max-h-64",
  columns = 2,
}: {
  items: readonly FilterableItem[];
  /** Form field name; the server reads `formData.getAll(name)`. */
  name: string;
  defaultSelectedIds: readonly string[];
  noun: string;
  placeholder?: string;
  maxHeightClass?: string;
  /** Row columns at sm+; use 1 when the list lives in a narrow side panel. */
  columns?: 1 | 2;
}) {
  const [selected, setSelected] = useState(() => new Set(defaultSelectedIds));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Only ids that still exist in `items` are posted; a stale default (group
  // deleted since the guide was shared) is dropped rather than resubmitted.
  const known = new Set(items.map((g) => g.id));
  const postedIds = [...selected].filter((id) => known.has(id));

  return (
    <>
      {postedIds.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      <FilterableList
        items={items}
        getLabel={(g) => g.name}
        noun={noun}
        placeholder={placeholder}
        aside={
          postedIds.length > 0 ? `${postedIds.length} selected` : undefined
        }
      >
        {(visible) => (
          <div
            className={`grid grid-cols-1 gap-x-5 gap-y-1.5 overflow-y-auto ${
              columns === 2 ? "sm:grid-cols-2" : ""
            } ${maxHeightClass}`}
          >
            {selectedFirst(visible, selected).map((g) => (
              <label
                key={g.id}
                className="flex cursor-pointer items-center gap-2 text-sm text-grey-800"
              >
                <input
                  type="checkbox"
                  checked={selected.has(g.id)}
                  onChange={() => toggle(g.id)}
                  className="h-4 w-4 shrink-0 accent-cyan-600"
                />
                <span className="truncate">{g.name}</span>
              </label>
            ))}
          </div>
        )}
      </FilterableList>
    </>
  );
}
