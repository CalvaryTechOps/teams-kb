"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { allStaffRequest, guide, guideAudienceGroup, space } from "@/db/schema";
import { requireAdmin } from "@/lib/permissions";

// Admin decisions on owners' all-staff publish requests (M6). Keyed to the
// request id and re-checked as pending, so a stale form can't double-decide.

const QUEUE_PATH = "/admin/all-staff-requests";

async function pendingRequestOrBounce(requestId: string) {
  const [row] = await db
    .select({
      req: allStaffRequest,
      guideId: guide.id,
      guideSlug: guide.slug,
      spaceSlug: space.slug,
    })
    .from(allStaffRequest)
    .innerJoin(guide, eq(guide.id, allStaffRequest.guideId))
    .innerJoin(space, eq(space.id, guide.spaceId))
    .where(eq(allStaffRequest.id, requestId));
  if (!row || row.req.status !== "pending") redirect(QUEUE_PATH);
  return row;
}

export async function approveAllStaffRequest(requestId: string) {
  const access = await requireAdmin();
  const row = await pendingRequestOrBounce(requestId);

  await db.transaction(async (tx) => {
    await tx
      .update(allStaffRequest)
      .set({
        status: "approved",
        decidedBy: access.userId,
        decidedAt: new Date(),
      })
      .where(eq(allStaffRequest.id, requestId));
    await tx
      .update(guide)
      .set({ audience: "all_staff" })
      .where(eq(guide.id, row.guideId));
    // All-staff supersedes any narrower group shares.
    await tx
      .delete(guideAudienceGroup)
      .where(eq(guideAudienceGroup.guideId, row.guideId));
  });

  revalidatePath("/");
  revalidatePath(`/spaces/${row.spaceSlug}/guides/${row.guideSlug}`);
  revalidatePath(QUEUE_PATH);
  redirect(QUEUE_PATH);
}

export async function rejectAllStaffRequest(
  requestId: string,
  formData: FormData,
) {
  const access = await requireAdmin();
  const row = await pendingRequestOrBounce(requestId);
  const note = String(formData.get("note") ?? "").trim() || null;

  await db
    .update(allStaffRequest)
    .set({
      status: "rejected",
      decidedBy: access.userId,
      decidedAt: new Date(),
      note,
    })
    .where(
      and(
        eq(allStaffRequest.id, requestId),
        eq(allStaffRequest.status, "pending"),
      ),
    );

  revalidatePath(`/spaces/${row.spaceSlug}/guides/${row.guideSlug}`);
  revalidatePath(QUEUE_PATH);
  redirect(QUEUE_PATH);
}
