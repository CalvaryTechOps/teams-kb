import "server-only";
import { and, count, countDistinct, eq, isNotNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import {
  allStaffRequest,
  guide,
  guideDeletionRequest,
  guideRevision,
  m365Group,
  space,
} from "@/db/schema";
import type { AttentionCounts } from "@/lib/admin-attention-tiles";

/**
 * What is waiting on an admin, for the dashboard's "Needs attention" row.
 * Each count uses the same predicate as the page its tile links to, so the
 * number on the tile always equals the number of rows on that page.
 */
export async function attentionCounts(): Promise<AttentionCounts> {
  const [[orphaned], [allStaff], [deletions], [submissions]] =
    await Promise.all([
      // Spaces nobody can author in: Team deleted or group un-flagged
      // (spaceHealth() in space-health.ts, as SQL).
      db
        .select({ n: count() })
        .from(space)
        .innerJoin(m365Group, eq(m365Group.id, space.groupId))
        .where(
          or(
            isNotNull(m365Group.deletedAt),
            eq(m365Group.isDepartment, false),
          ),
        ),
      // /admin/all-staff-requests lists pending requests whose guide is not
      // awaiting deletion.
      db
        .select({ n: count() })
        .from(allStaffRequest)
        .innerJoin(guide, eq(guide.id, allStaffRequest.guideId))
        .where(
          and(
            eq(allStaffRequest.status, "pending"),
            ne(guide.status, "deleted"),
          ),
        ),
      db
        .select({ n: count() })
        .from(guideDeletionRequest)
        .where(eq(guideDeletionRequest.status, "pending")),
      // Guides with a member submission in a space queue. Distinct on the
      // guide so this matches /admin/guides?filter=pending; submissions on a
      // guide awaiting deletion wait with the guide, as in the space queue.
      db
        .select({ n: countDistinct(guide.id) })
        .from(guideRevision)
        .innerJoin(guide, eq(guide.id, guideRevision.guideId))
        .where(
          and(
            eq(guideRevision.status, "pending"),
            ne(guide.status, "deleted"),
          ),
        ),
    ]);

  return {
    orphanedSpaces: orphaned?.n ?? 0,
    allStaffRequests: allStaff?.n ?? 0,
    deletionRequests: deletions?.n ?? 0,
    pendingSubmissions: submissions?.n ?? 0,
  };
}
