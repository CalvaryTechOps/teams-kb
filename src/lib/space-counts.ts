import "server-only";
import { cache } from "react";
import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { guide, space } from "@/db/schema";
import { visibleGuidesWhere, type UserAccess } from "@/lib/permissions";

/**
 * Every space with the number of *published* guides this user can read in
 * it, plus whether the user belongs to the department (member or owner of
 * its M365 group). The one definition of "articles you can read in this
 * department" — shared by the home page cards and the sidebar pills so they
 * always agree. The left join keeps zero-count spaces; the visibility rules
 * come from visibleGuidesWhere, never a second copy.
 *
 * Cached per request, keyed on the access object — which is stable within a
 * request because getUserAccess is itself cached — so home page + sidebar
 * cost one query.
 */
export const visibleArticleCountsBySpace = cache(async (access: UserAccess) => {
  const rows = await db
    .select({
      id: space.id,
      groupId: space.groupId,
      slug: space.slug,
      name: space.name,
      description: space.description,
      articles: count(guide.id),
    })
    .from(space)
    .leftJoin(
      guide,
      and(
        eq(guide.spaceId, space.id),
        eq(guide.status, "published"),
        visibleGuidesWhere(access),
      ),
    )
    .groupBy(space.id)
    .orderBy(asc(space.name));

  return rows.map((r) => ({
    ...r,
    isMine:
      access.memberGroupIds.has(r.groupId) ||
      access.ownerGroupIds.has(r.groupId),
  }));
});
