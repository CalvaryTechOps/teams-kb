"use client";

import { useRouter } from "next/navigation";
import {
  revisionHref,
  revisionOptionLabel,
  type RevisionMeta,
} from "@/lib/guide-revisions";

// The guide page's revision drop-down (plans/revision-picker.md): every
// revision the viewer may see, newest on top, the rendered one selected.
// Choosing one navigates to `?rev=<version>`; choosing the published one
// goes back to the bare guide URL, so the address people copy stays clean.
// A native <select> — the same control the move form uses — keeps the
// keyboard and screen-reader behaviour for free.

const selectClasses =
  "h-9 w-full rounded-lg border border-border-strong bg-surface-raised px-3 text-[13px] text-fg-strong " +
  "focus:border-accent focus:shadow-focus focus:outline-none";

export function RevisionPicker({
  basePath,
  revisions,
  currentRevisionId,
  selectedId,
}: {
  /** The guide's readable path, without a query string. */
  basePath: string;
  /** What the viewer may see, in the order to list them (newest first). */
  revisions: RevisionMeta[];
  /** The published revision, if any — its option links to `basePath`. */
  currentRevisionId: string | null;
  /** The revision the page is rendering. */
  selectedId: string;
}) {
  const router = useRouter();
  return (
    <select
      aria-label="Revision"
      value={selectedId}
      onChange={(e) => {
        const rev = revisions.find((r) => r.id === e.target.value);
        if (rev && rev.id !== selectedId) {
          router.push(revisionHref(basePath, rev, currentRevisionId));
        }
      }}
      className={selectClasses}
    >
      {revisions.map((r) => (
        <option key={r.id} value={r.id}>
          {revisionOptionLabel(r, currentRevisionId)}
        </option>
      ))}
    </select>
  );
}
