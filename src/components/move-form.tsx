"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui";

// The one-row "mover" shared by the move-guide and move-category pages:
// pick a department, then (when the caller asks for it) a category in that
// department, then Move or Cancel. Category options for every department
// come along as props so switching departments never round-trips; the
// server re-validates the pairing and the caller's permission to cross
// departments at all.
//
// With `current` set, the row starts on the content's present home and Move
// stays disabled until something actually changes. `lockSpace` (space owners
// re-filing within their own department) shows the department but only lets
// the category change.

export type MoveTargetSpace = {
  id: string;
  name: string;
  /** Appended to the name in the picker, e.g. "Team deleted". */
  note?: string;
  categories: { id: string; name: string }[];
};

const selectClasses =
  "h-9 rounded-lg border border-grey-300 bg-white px-3 text-sm text-ink " +
  "focus:border-cyan-400 focus:shadow-focus focus:outline-none " +
  "disabled:cursor-not-allowed disabled:bg-grey-50 disabled:text-grey-500";

export function MoveForm({
  action,
  spaces,
  withCategory,
  current,
  lockSpace = false,
  cancelHref,
  moveLabel = "Move",
}: {
  action: (formData: FormData) => void | Promise<void>;
  spaces: MoveTargetSpace[];
  /** Offer a category picker for the chosen department (guides need one). */
  withCategory: boolean;
  /** Where the content lives now; preselected, and "no change" disables Move. */
  current?: { spaceId: string; categoryId: string | null };
  /** Department can't be changed (only the category can). */
  lockSpace?: boolean;
  cancelHref: string;
  moveLabel?: string;
}) {
  const [spaceId, setSpaceId] = useState(current?.spaceId ?? "");
  const [categoryId, setCategoryId] = useState(current?.categoryId ?? "");
  const chosen = spaces.find((s) => s.id === spaceId);
  const unchanged =
    current !== undefined &&
    spaceId === current.spaceId &&
    (!withCategory || categoryId === (current.categoryId ?? ""));

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      {/* A disabled control doesn't submit; carry the locked value along. */}
      {lockSpace && <input type="hidden" name="spaceId" value={spaceId} />}
      <select
        name={lockSpace ? undefined : "spaceId"}
        aria-label="Department"
        value={spaceId}
        disabled={lockSpace}
        onChange={(e) => {
          setSpaceId(e.target.value);
          // Categories belong to a department: keep the current one only
          // while still at home, otherwise start from General.
          setCategoryId(
            current && e.target.value === current.spaceId
              ? (current.categoryId ?? "")
              : "",
          );
        }}
        className={`${selectClasses} min-w-[220px]`}
      >
        {!current && <option value="">Choose a department…</option>}
        {spaces.map((s) => (
          <option key={s.id} value={s.id}>
            {s.note ? `${s.name} (${s.note})` : s.name}
          </option>
        ))}
      </select>

      {withCategory && (
        <select
          name="categoryId"
          aria-label="Category"
          value={categoryId}
          disabled={!chosen}
          onChange={(e) => setCategoryId(e.target.value)}
          className={`${selectClasses} min-w-[200px]`}
        >
          <option value="">General</option>
          {chosen?.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={!chosen || unchanged}>
          {moveLabel}
        </Button>
        <ButtonLink href={cancelHref} variant="secondary" size="sm">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
