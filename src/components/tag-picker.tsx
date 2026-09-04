"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { PlusIcon, XIcon } from "@/components/icons";
import {
  MAX_TAGS,
  addTag,
  canCreateTag,
  dedupeTags,
  matchTags,
  normalizeTagName,
  sameTag,
  serializeTags,
  type PickableTag,
} from "@/lib/tag-picker";
import { slugify } from "@/lib/slug";

// Find-as-you-type tag combobox for the guide form. The whole tag table is
// small and already loaded, so matching is pure client work. Existing tags are
// always offered first; "Create new tag" is a deliberate last row that only
// appears when nothing existing would absorb the typed name. The picker posts
// through one hidden `tags` field in the comma-separated form the server has
// always parsed, so saveGuide/syncTags are untouched. Text left in the box is
// never saved — only a picked row becomes a tag.
//
// The same component doubles as a *filter* (search page): `allowCreate=false`
// limits it to existing tags, `repeatedField` posts one hidden input per tag
// (`?tag=a&tag=b`), `fieldValue="slug"` posts slugs, and
// `submitFormOnChange` re-runs the enclosing GET form on every change.

type Option =
  | { kind: "existing"; tag: PickableTag }
  | { kind: "create"; name: string };

export function TagPicker({
  allTags,
  defaultSelected = [],
  name = "tags",
  inputId = "tags",
  allowCreate = true,
  repeatedField = false,
  fieldValue = "name",
  submitFormOnChange = false,
  placeholder,
  hint,
}: {
  allTags: readonly PickableTag[];
  /** Tag names already on the guide. */
  defaultSelected?: readonly string[];
  /** Hidden field name the form posts. */
  name?: string;
  inputId?: string;
  /** Offer "Create new tag" for names no existing tag matches. */
  allowCreate?: boolean;
  /** One hidden input per tag instead of a single comma-joined value. */
  repeatedField?: boolean;
  /** Post the tag's display name or its slug. */
  fieldValue?: "name" | "slug";
  /** Call the enclosing form's requestSubmit() whenever the selection changes. */
  submitFormOnChange?: boolean;
  placeholder?: string;
  /** Helper text under the box; `null` hides it. Defaults to authoring guidance. */
  hint?: string | null;
}) {
  const [selected, setSelected] = useState(() => dedupeTags(defaultSelected));
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const full = selected.length >= MAX_TAGS;
  const pending = normalizeTagName(query).length > 0;
  const options: Option[] = matchTags(allTags, query, selected).map((tag) => ({
    kind: "existing",
    tag,
  }));
  if (allowCreate && canCreateTag(allTags, query, selected)) {
    options.push({ kind: "create", name: normalizeTagName(query) });
  }
  const activeIndex = Math.min(active, Math.max(options.length - 1, 0));
  const showList = open && !full;

  // Filter mode: re-run the search after a *user* change. The flag is set only
  // by the handlers below and consumed once the hidden inputs have rendered,
  // so mounting (including Strict Mode's double effect) never submits.
  const submitPending = useRef(false);
  useEffect(() => {
    if (!submitPending.current) return;
    submitPending.current = false;
    inputRef.current?.form?.requestSubmit();
  }, [selected]);

  function updateSelected(next: (s: string[]) => string[]) {
    if (submitFormOnChange) submitPending.current = true;
    setSelected(next);
  }

  function fieldValueFor(tagName: string): string {
    if (fieldValue === "name") return tagName;
    return (
      allTags.find((t) => sameTag(t.name, tagName))?.slug ?? slugify(tagName)
    );
  }

  function pick(opt: Option) {
    updateSelected((s) =>
      addTag(s, opt.kind === "existing" ? opt.tag.name : opt.name),
    );
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  }

  function remove(tagName: string) {
    updateSelected((s) => s.filter((n) => n !== tagName));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "Enter":
      case ",":
        // Never submit the guide form from here.
        e.preventDefault();
        if (showList && options[activeIndex]) pick(options[activeIndex]);
        else setOpen(true);
        break;
      case "ArrowDown":
        e.preventDefault();
        setOpen(true);
        setActive((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        break;
      case "Escape":
        if (query) {
          e.preventDefault();
          setQuery("");
        } else {
          setOpen(false);
        }
        break;
      case "Backspace":
        if (!query && selected.length > 0) {
          updateSelected((s) => s.slice(0, -1));
        }
        break;
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {repeatedField ? (
        selected.map((tagName) => (
          <input
            key={tagName}
            type="hidden"
            name={name}
            value={fieldValueFor(tagName)}
          />
        ))
      ) : (
        <input
          type="hidden"
          name={name}
          value={serializeTags(selected.map(fieldValueFor))}
        />
      )}

      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected tags">
          {selected.map((tagName) => (
            <li
              key={tagName}
              className="inline-flex h-[26px] items-center gap-1 rounded-full border border-grey-200 bg-white pl-2.5 pr-1 text-xs text-grey-700"
            >
              {tagName}
              <button
                type="button"
                onClick={() => remove(tagName)}
                aria-label={`Remove tag ${tagName}`}
                className="rounded-full p-0.5 text-grey-400 hover:bg-grey-100 hover:text-grey-700"
              >
                <XIcon size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            showList && options[activeIndex]
              ? `${listId}-${activeIndex}`
              : undefined
          }
          autoComplete="off"
          disabled={full}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder={
            full
              ? `Up to ${MAX_TAGS} tags`
              : (placeholder ??
                (selected.length > 0 ? "Add another tag…" : "Add a tag…"))
          }
          className={`h-11 w-full rounded-lg border bg-white px-3 text-sm text-ink placeholder-grey-400 focus:shadow-focus focus:outline-none disabled:bg-grey-50 disabled:text-grey-400 ${
            pending
              ? "border-warning focus:border-warning"
              : "border-grey-300 focus:border-cyan-400"
          }`}
        />

        {showList && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Matching tags"
            className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-lg border border-grey-200 bg-white py-1 shadow-md"
          >
            {options.length === 0 && (
              <li className="px-3 py-2 text-xs text-grey-500">
                {pending || !allowCreate
                  ? "No matching tags."
                  : "No tags yet — type to create one."}
              </li>
            )}
            {options.map((opt, i) => {
              const isActive = i === activeIndex;
              const base =
                "flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm";
              return opt.kind === "existing" ? (
                <li
                  key={opt.tag.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(opt)}
                  className={`${base} ${isActive ? "bg-cyan-50 text-ink" : "text-grey-800"}`}
                >
                  <span className="truncate">{opt.tag.name}</span>
                  <span className="shrink-0 text-xs text-grey-500">
                    {opt.tag.guideCount} guide{opt.tag.guideCount === 1 ? "" : "s"}
                  </span>
                </li>
              ) : (
                <li
                  key="__create"
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(opt)}
                  className={`${base} ${i > 0 ? "mt-1 border-t border-dashed border-grey-200 pt-2.5" : ""} ${
                    isActive ? "bg-cyan-50" : ""
                  } text-cyan-700`}
                >
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <PlusIcon size={14} className="shrink-0" />
                    <span className="truncate">
                      Create new tag “{opt.name}”
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {(hint !== null || pending || full) && (
        <p className={`text-xs ${pending ? "text-warning" : "text-grey-500"}`}>
          {full
            ? `Up to ${MAX_TAGS} tags.`
            : pending
              ? allowCreate
                ? "Press Enter to add — text left here isn’t saved."
                : "Press Enter to pick the highlighted tag."
              : (hint ??
                "Pick an existing tag when one fits; create a new one only if nothing matches.")}
        </p>
      )}
    </div>
  );
}
