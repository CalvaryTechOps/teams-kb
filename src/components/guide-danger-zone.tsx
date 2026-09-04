"use client";

import type { FormEvent } from "react";
import { Button } from "@/components/ui";
import {
  convertGuideToDraft,
  requestGuideDeletion,
} from "@/app/(kb)/spaces/actions";

// Owner/admin-only controls that live *outside* GuideForm's <form>, since a
// button inside it would submit the whole edit. Client component only for the
// native confirm; the server re-checks permissions regardless.

function confirmOr(message: string) {
  return (e: FormEvent<HTMLFormElement>) => {
    if (!window.confirm(message)) e.preventDefault();
  };
}

export function GuideDangerZone({
  spaceSlug,
  guideId,
  isPublished,
}: {
  spaceSlug: string;
  guideId: string;
  isPublished: boolean;
}) {
  const ref = { spaceSlug, guideId };

  return (
    <section className="mt-10 max-w-[860px] rounded-lg border border-danger-100 bg-white px-5 py-4">
      <h2 className="text-sm font-semibold text-ink">Unpublish or delete</h2>
      <p className="mt-1 text-xs text-grey-500">
        {isPublished
          ? "Converting to draft hides the body from search and marks the guide as a draft; publish again when it's ready. "
          : ""}
        Deleting hides the guide immediately; an admin reviews the request
        before it&apos;s removed for good, and can restore it as a draft instead.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
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
        >
          <Button type="submit" variant="danger" size="sm">
            Delete guide
          </Button>
        </form>
      </div>
    </section>
  );
}
