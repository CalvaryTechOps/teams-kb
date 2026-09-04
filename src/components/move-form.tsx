"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui";

// The one-row "mover" shared by the move-guide and move-category pages:
// pick a department, then (when the caller asks for it) a category in that
// department, then Move or Cancel. The list already excludes the content's
// current department — moving within a department isn't what this is for.
// Category options for every department come along as props so switching
// departments never round-trips; the server re-validates the pairing.

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
  "disabled:cursor-not-allowed disabled:bg-grey-50 disabled:text-grey-400";

export function MoveForm({
  action,
  spaces,
  withCategory,
  cancelHref,
  moveLabel = "Move",
}: {
  action: (formData: FormData) => void | Promise<void>;
  spaces: MoveTargetSpace[];
  /** Offer a category picker for the chosen department (guides need one). */
  withCategory: boolean;
  cancelHref: string;
  moveLabel?: string;
}) {
  const [spaceId, setSpaceId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const chosen = spaces.find((s) => s.id === spaceId);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <select
        name="spaceId"
        aria-label="Department"
        value={spaceId}
        onChange={(e) => {
          setSpaceId(e.target.value);
          setCategoryId("");
        }}
        className={`${selectClasses} min-w-[220px]`}
      >
        <option value="">Choose a department…</option>
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
        <Button type="submit" size="sm" disabled={!chosen}>
          {moveLabel}
        </Button>
        <ButtonLink href={cancelHref} variant="secondary" size="sm">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
