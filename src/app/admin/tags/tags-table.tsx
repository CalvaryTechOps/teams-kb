"use client";

import Link from "next/link";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { FilterableList } from "@/components/filterable-list";
import { matchTags, type PickableTag } from "@/lib/tag-picker";
import { deleteTag, mergeTags, renameTag } from "./actions";

// Client half of /admin/tags. The only client state is the filter box, which
// tags are ticked, the merge target, and which row is mid-rename; every write
// posts to a server action, and the page re-renders from the redirect.

function confirmOr(message: string) {
  return (e: FormEvent<HTMLFormElement>) => {
    if (!window.confirm(message)) e.preventDefault();
  };
}

export function TagsTable({ tags }: { tags: PickableTag[] }) {
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [target, setTarget] = useState<PickableTag | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const byId = new Map(tags.map((t) => [t.id, t]));
  const sources = [...checked].map((id) => byId.get(id)).filter(Boolean) as PickableTag[];
  const validTarget = target && !checked.has(target.id) ? target : null;

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <FilterableList
        items={tags}
        getLabel={(t) => t.name}
        noun="tags"
        placeholder="Filter tags…"
        aside={`${tags.length} tag${tags.length === 1 ? "" : "s"}`}
      >
        {(visible) => (
          <table className="w-full text-left text-sm">
            <thead className="text-gray-500">
              <tr>
                <th className="w-8 py-2 pr-2">
                  <span className="sr-only">Select</span>
                </th>
                <th className="py-2 pr-4">Tag</th>
                <th className="py-2 pr-4">Slug</th>
                <th className="py-2 pr-4">Guides</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="py-2 pr-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${t.name} for merging`}
                      checked={checked.has(t.id)}
                      onChange={() => toggle(t.id)}
                      className="h-4 w-4 accent-blue-600"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    {renaming === t.id ? (
                      <form
                        action={renameTag.bind(null, t.id)}
                        className="flex items-center gap-2"
                      >
                        <input
                          name="name"
                          defaultValue={t.name}
                          autoFocus
                          required
                          maxLength={64}
                          aria-label={`New name for ${t.name}`}
                          className="h-8 rounded-md border px-2 text-sm"
                        />
                        <button
                          type="submit"
                          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenaming(null)}
                          className="text-xs text-gray-500 hover:underline"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <span className="font-medium">{t.name}</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-gray-500">
                    {t.slug}
                  </td>
                  <td className="py-2 pr-4">
                    {t.guideCount === 0 ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                        unused
                      </span>
                    ) : (
                      <Link
                        href={`/search?tag=${encodeURIComponent(t.slug)}`}
                        title={`Search guides tagged “${t.name}”`}
                        className="text-blue-600 hover:underline"
                      >
                        {t.guideCount}
                      </Link>
                    )}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-3 text-xs">
                      {renaming !== t.id && (
                        <button
                          type="button"
                          onClick={() => setRenaming(t.id)}
                          className="text-blue-600 hover:underline"
                        >
                          Rename
                        </button>
                      )}
                      {t.guideCount === 0 && (
                        <form
                          action={deleteTag.bind(null, t.id)}
                          onSubmit={confirmOr(`Delete the unused tag “${t.name}”?`)}
                        >
                          <button
                            type="submit"
                            className="text-red-600 hover:underline"
                          >
                            Delete
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </FilterableList>

      {sources.length > 0 && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-lg border bg-white px-4 py-3 shadow-md">
          <span className="text-sm">
            Merge <strong>{sources.length}</strong> tag
            {sources.length === 1 ? "" : "s"}{" "}
            <span className="text-gray-500">
              ({sources.map((t) => t.name).join(", ")})
            </span>{" "}
            into
          </span>
          <TargetPicker
            tags={tags}
            exclude={checked}
            value={validTarget}
            onChange={setTarget}
          />
          <form
            action={mergeTags.bind(
              null,
              validTarget?.id ?? "",
              sources.map((t) => t.id),
            )}
            onSubmit={confirmOr(
              `Guides tagged ${sources.map((t) => `“${t.name}”`).join(", ")} will be tagged “${validTarget?.name}” instead, and ${
                sources.length === 1 ? "that tag" : "those tags"
              } will be deleted. This cannot be undone.`,
            )}
          >
            <button
              type="submit"
              disabled={!validTarget}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              Merge
            </button>
          </form>
          <button
            type="button"
            onClick={() => {
              setChecked(new Set());
              setTarget(null);
            }}
            className="text-xs text-gray-500 hover:underline"
          >
            Clear selection
          </button>
        </div>
      )}
    </div>
  );
}

/** Find-as-you-type box for the surviving tag; ticked tags are excluded. */
function TargetPicker({
  tags,
  exclude,
  value,
  onChange,
}: {
  tags: PickableTag[];
  exclude: ReadonlySet<string>;
  value: PickableTag | null;
  onChange: (t: PickableTag | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const excludedNames = tags.filter((t) => exclude.has(t.id)).map((t) => t.name);
  const options = matchTags(tags, query, excludedNames).slice(0, 8);

  function pick(t: PickableTag) {
    onChange(t);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (open && options[0]) pick(options[0]);
    }
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <div className="relative min-w-56">
      {value && !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-9 w-full items-center justify-between rounded-md border bg-white px-3 text-sm"
        >
          <span className="font-medium">{value.name}</span>
          <span className="text-xs text-gray-500">change</span>
        </button>
      ) : (
        <input
          type="text"
          autoComplete="off"
          autoFocus={open && Boolean(value)}
          placeholder="Find the tag to keep…"
          aria-label="Tag to merge into"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="h-9 w-full rounded-md border px-3 text-sm"
        />
      )}
      {open && (
        <ul className="absolute bottom-full left-0 z-10 mb-1 w-full overflow-hidden rounded-md border bg-white py-1 text-sm shadow-lg">
          {options.length === 0 && (
            <li className="px-3 py-1.5 text-xs text-gray-500">No matching tags.</li>
          )}
          {options.map((t) => (
            <li
              key={t.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(t)}
              className="flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 hover:bg-blue-50"
            >
              <span className="truncate">{t.name}</span>
              <span className="shrink-0 text-xs text-gray-500">
                {t.guideCount} guide{t.guideCount === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
