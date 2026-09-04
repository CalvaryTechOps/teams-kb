"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { guide, guideDeletionRequest, space } from "@/db/schema";
import { requireAdmin } from "@/lib/permissions";
import { pruneUnusedTags } from "@/lib/tags";

// Admin decisions on owners' guide deletion requests. Keyed to the request
// id and re-checked as pending inside the write, so a stale form can't
// double-decide — approving after a reject must not delete the restored guide.

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

  await db.transaction(async (tx) => {
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

/** Decline the deletion; the guide comes back as a draft for rework. */
export async function rejectGuideDeletion(
  requestId: string,
  formData: FormData,
) {
  const access = await requireAdmin();
  const row = await pendingRequestOrBounce(requestId);
  const note = String(formData.get("note") ?? "").trim() || null;

  await db.transaction(async (tx) => {
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
    if (guideId) {
      await tx
        .update(guide)
        .set({ status: "draft" })
        .where(and(eq(guide.id, guideId), eq(guide.status, "deleted")));
    }
  });

  revalidateAfterDecision(row);
  redirect(QUEUE_PATH);
}
