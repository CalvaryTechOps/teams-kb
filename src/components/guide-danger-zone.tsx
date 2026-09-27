"use client";

import type { FormEvent } from "react";
import { Button } from "@/components/ui";
import {
  convertGuideToDraft,
  deleteUnpublishedGuide,
  requestGuideDeletion,
} from "@/app/(kb)/spaces/actions";

// Destructive controls that live *outside* GuideForm's <form>, since a
// button inside it would submit the whole edit. Client component only for the
// native confirm; the server re-checks permissions regardless.
//
// Two modes (plans/preview-pending-deletion.md): "request" is the owner/admin
// path — deletion is queued for an admin, with a reason that is required
// once the guide has ever been published; "outright" is the author of a
// never-published guide removing their own work for good, no review.

function confirmOr(message: string) {
  return (e: FormEvent<HTMLFormElement>) => {
    if (!window.confirm(message)) e.preventDefault();
  };
}

const inputClasses =
  "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-fg-strong " +
  "focus:border-accent focus:shadow-focus focus:outline-none";

export function GuideDangerZone({
  spaceSlug,
  guideId,
  mode,
  isPublished,
  everPublished,
  revisionCount,
  error,
}: {
  spaceSlug: string;
  guideId: string;
  mode: "request" | "outright";
  isPublished: boolean;
  /** `publishedAt` is set: staff may have read it, so a reason is required. */
  everPublished: boolean;
  revisionCount: number;
  /** `error` query code the action bounced back with, if any. */
  error?: string;
}) {
  const ref = { spaceSlug, guideId };

  if (mode === "outright") {
    const revisions =
      revisionCount === 1 ? "its one revision" : `its ${revisionCount} revisions`;
    return (
      <section className="mt-10 max-w-[860px] rounded-lg border border-danger-100 bg-surface-raised px-5 py-4">
        <h2 className="text-sm font-semibold text-fg-strong">Delete</h2>
        <p className="mt-1 text-xs text-fg-muted">
          Deleting removes this guide and {revisions} permanently. It has
          never been published, so no review is needed.
        </p>
        <form
          action={deleteUnpublishedGuide.bind(null, ref)}
          onSubmit={confirmOr(
            "Delete this guide permanently? It has never been published and cannot be recovered.",
          )}
          className="mt-3"
        >
          <Button type="submit" variant="danger" size="sm">
            Delete guide
          </Button>
        </form>
      </section>
    );
  }

  return (
    <section className="mt-10 max-w-[860px] rounded-lg border border-danger-100 bg-surface-raised px-5 py-4">
      <h2 className="text-sm font-semibold text-fg-strong">Unpublish or delete</h2>
      <p className="mt-1 text-xs text-fg-muted">
        {isPublished
          ? "Converting to draft hides the body from search and marks the guide as a draft; publish again when it's ready. "
          : ""}
        Deleting hides the guide immediately; an admin reviews the request
        before it&apos;s removed for good, and can put it back instead.
      </p>
      <div className="mt-3 flex flex-wrap items-start gap-3">
        {isPublished && (
          <form
            action={convertGuideToDraft.bind(null, ref)}
            onSubmit={confirmOr(
              "Convert this guide to a draft? It will no longer be published, but nothing is lost — you can publish it again later.",
            )}
          >
            <Button type="submit" variant="secondary" size="sm">
              Convert to draft
            </Button>
          </form>
        )}
        <form
          action={requestGuideDeletion.bind(null, ref)}
          onSubmit={confirmOr(
            "Delete this guide? It disappears for everyone right away. An admin will review the request; once approved, the guide and its history are removed permanently.",
          )}
          className="flex min-w-72 flex-1 flex-col gap-2"
        >
          <label
            htmlFor="deletion-reason"
            className="text-xs font-medium text-fg-strong"
          >
            Reason for deletion
            <span className="ml-1.5 font-normal text-fg-muted">
              {everPublished
                ? "Required: this guide has been published, so an admin reviews the request."
                : "Optional"}
            </span>
          </label>
          {error === "reason" && (
            <p className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
              A reason is required to delete a published guide.
            </p>
          )}
          <textarea
            id="deletion-reason"
            name="reason"
            rows={2}
            required={everPublished}
            placeholder="Why should this guide be removed?"
            className={inputClasses}
          />
          <div>
            <Button type="submit" variant="danger" size="sm">
              Delete guide
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
