"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui";
import { slugify } from "@/lib/slug";

// The rename form on the category edit page. The name is display text; the
// slug is the category's web address. When the typed name would slugify to
// something other than the current slug, a "Web address" choice appears:
// keep the address (existing links keep working — the default) or change it
// (old links land on "Category not found"). When the slug wouldn't change
// the choice stays hidden and the form submits `keep`. This is the plan's
// keep / create-new-links / cancel decision as plain form controls rather
// than a modal; Cancel is the page's Cancel. The server re-checks
// everything, including name collisions.

const inputClasses =
  "h-10 rounded-lg border border-border-strong bg-surface-raised px-3 text-sm text-fg-strong " +
  "focus:border-accent focus:shadow-focus focus:outline-none";

export function CategoryNameForm({
  action,
  name,
  slug,
  spaceSlug,
  cancelHref,
}: {
  action: (formData: FormData) => void | Promise<void>;
  /** Current display name. */
  name: string;
  /** Current slug (the address the category answers at today). */
  slug: string;
  spaceSlug: string;
  cancelHref: string;
}) {
  const [value, setValue] = useState(name);
  const [address, setAddress] = useState<"keep" | "change">("keep");

  const trimmed = value.trim();
  const candidate = slugify(trimmed);
  const slugChanges = trimmed !== "" && candidate !== slug;
  const unchanged =
    trimmed === name && !(slugChanges && address === "change");
  const base = `/spaces/${spaceSlug}/categories/`;

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-fg">Name</span>
        <input
          name="name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          maxLength={80}
          autoComplete="off"
          className={`${inputClasses} max-w-md`}
        />
      </label>

      {slugChanges ? (
        <fieldset className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-3">
          <legend className="px-1 text-xs font-medium text-fg">Web address</legend>
          <label className="flex items-start gap-2.5 text-sm text-fg">
            <input
              type="radio"
              name="address"
              value="keep"
              checked={address === "keep"}
              onChange={() => setAddress("keep")}
              className="mt-1 accent-accent"
            />
            <span>
              Keep the current address{" "}
              <code className="rounded bg-surface-sunken px-1 py-0.5 text-xs">
                {base}
                {slug}
              </code>
              <span className="block text-xs text-fg-muted">
                Existing links and bookmarks keep working.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-sm text-fg">
            <input
              type="radio"
              name="address"
              value="change"
              checked={address === "change"}
              onChange={() => setAddress("change")}
              className="mt-1 accent-accent"
            />
            <span>
              Change it to{" "}
              <code className="rounded bg-surface-sunken px-1 py-0.5 text-xs">
                {base}
                {candidate}
              </code>
              <span className="block text-xs text-warning">
                Old links will show “Category not found”.
              </span>
            </span>
          </label>
        </fieldset>
      ) : (
        <input type="hidden" name="address" value="keep" />
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={trimmed === "" || unchanged}>
          Save
        </Button>
        <ButtonLink href={cancelHref} variant="secondary" size="sm">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
