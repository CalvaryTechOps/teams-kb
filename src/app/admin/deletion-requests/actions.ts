"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { withTransaction } from "@/db/transaction";
import { guide, guideDeletionRequest, guideRevision, space } from "@/db/schema";
import { blocksToPlainText } from "@/lib/guide-content";
import { requireAdmin } from "@/lib/permissions";
import { pruneUnusedTags } from "@/lib/tags";

// Admin decisions on owners' guide deletion requests, made from the queue or
// from the guide's own page (plans/preview-pending-deletion.md). Keyed to the
// request id and re-checked as pending inside the write, so a stale form
// can't double-decide — approving after a reject must not delete the
// restored guide.

const QUEUE_PATH = "/admin/deletion-requests";

async function pendingRequestOrBounce(requestId: string) {
  const [row] = await db
    .select({
      req: guideDeletionRequest,
      guideSlug: guide.slug,
      spaceSlug: space.slug,
    })
    .from(guideDeletionRequest)
    .leftJoin(guide, eq(guide.id, guideDeletionRequest.guideId))
    .leftJoin(space, eq(space.id, guideDeletionRequest.spaceId))
    .where(eq(guideDeletionRequest.id, requestId));
  if (!row || row.req.status !== "pending") redirect(QUEUE_PATH);
  return row;
}

function revalidateAfterDecision(row: {
  spaceSlug: string | null;
  guideSlug: string | null;
}) {
  revalidatePath("/");
  if (row.spaceSlug) {
    revalidatePath(`/spaces/${row.spaceSlug}`);
    revalidatePath(`/spaces/${row.spaceSlug}/queue`);
    if (row.guideSlug) {
      revalidatePath(`/spaces/${row.spaceSlug}/guides/${row.guideSlug}`);
    }
  }
  revalidatePath("/admin");
  revalidatePath("/admin/guides");
  revalidatePath(QUEUE_PATH);
}

/** Hard-delete the guide (revisions, tags, audience rows cascade). */
export async function approveGuideDeletion(requestId: string) {
  const access = await requireAdmin();
  const row = await pendingRequestOrBounce(requestId);

  await withTransaction(async (tx) => {
    const decided = await tx
      .update(guideDeletionRequest)
      .set({
        status: "approved",
        decidedBy: access.userId,
        decidedAt: new Date(),
      })
      .where(
        and(
          eq(guideDeletionRequest.id, requestId),
          eq(guideDeletionRequest.status, "pending"),
        ),
      )
      .returning({ guideId: guideDeletionRequest.guideId });
    // Lost a race with another decision: leave the guide alone.
    if (decided.length === 0) return;
    const guideId = decided[0]!.guideId;
    // Only remove a guide that is still marked deleted — never one that was
    // restored in the meantime. The request's FK goes null via ON DELETE.
    if (guideId) {
      await tx
        .delete(guide)
        .where(and(eq(guide.id, guideId), eq(guide.status, "deleted")));
    }
  });
  // The guide's guide_tag rows cascaded away; drop any tag it was the last user of.
  await pruneUnusedTags();

  revalidateAfterDecision(row);
  redirect(QUEUE_PATH);
}

/**
 * Decline the deletion; the guide goes back to the status it had when the
 * request was made (draft for requests older than that column). A guide
 * restored as published gets its search text back, which the request
 * cleared. Lands on the restored guide so the admin can revert to an
 * older revision or edit right away.
 */
export async function rejectGuideDeletion(
  requestId: string,
  formData: FormData,
) {
  const access = await requireAdmin();
  const row = await pendingRequestOrBounce(requestId);
  const note = String(formData.get("note") ?? "").trim() || null;
  const restoreTo = row.req.priorStatus ?? "draft";

  await withTransaction(async (tx) => {
    const decided = await tx
      .update(guideDeletionRequest)
      .set({
        status: "rejected",
        decidedBy: access.userId,
        decidedAt: new Date(),
        note,
      })
      .where(
        and(
          eq(guideDeletionRequest.id, requestId),
          eq(guideDeletionRequest.status, "pending"),
        ),
      )
      .returning({ guideId: guideDeletionRequest.guideId });
    if (decided.length === 0) return;
    const guideId = decided[0]!.guideId;
    if (!guideId) return;
    let searchText: string | null = null;
    if (restoreTo === "published") {
      const [current] = await tx
        .select({ content: guideRevision.content })
        .from(guideRevision)
        .innerJoin(guide, eq(guide.currentRevisionId, guideRevision.id))
        .where(eq(guide.id, guideId));
      if (current) searchText = blocksToPlainText(current.content);
    }
    await tx
      .update(guide)
      .set({
        // A "published" guide with no current revision can't exist; fall
        // back to draft rather than publish nothing.
        status:
          restoreTo === "published" && searchText === null ? "draft" : restoreTo,
        searchText,
      })
      .where(and(eq(guide.id, guideId), eq(guide.status, "deleted")));
  });

  revalidateAfterDecision(row);
  redirect(
    row.spaceSlug && row.guideSlug
      ? `/spaces/${row.spaceSlug}/guides/${row.guideSlug}`
      : QUEUE_PATH,
  );
}
