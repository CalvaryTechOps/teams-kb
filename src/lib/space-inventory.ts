import "server-only";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { category, guide, m365Group, space } from "@/db/schema";
import { spaceHealth, type SpaceHealth } from "@/lib/space-health";

// Read side of /admin/spaces: every space with its backing group's state and
// what it holds. Counts include every guide status — an admin deciding
// whether a space is "empty" needs drafts and deletion-pending guides too.

export type SpaceInventoryRow = {
  id: string;
  slug: string;
  name: string;
  groupId: string;
  groupName: string;
  groupDeletedAt: Date | null;
  health: SpaceHealth;
  guideCount: number;
  categoryCount: number;
};

export async function spaceInventory(): Promise<SpaceInventoryRow[]> {
  const [spaces, guideCounts, categoryCounts] = await Promise.all([
    db
      .select({
        id: space.id,
        slug: space.slug,
        name: space.name,
        groupId: space.groupId,
        groupName: m365Group.displayName,
        groupDeletedAt: m365Group.deletedAt,
        groupIsDepartment: m365Group.isDepartment,
      })
      .from(space)
      .innerJoin(m365Group, eq(m365Group.id, space.groupId))
      .orderBy(asc(space.name)),
    db
      .select({ spaceId: guide.spaceId, n: count() })
      .from(guide)
      .groupBy(guide.spaceId),
    db
      .select({ spaceId: category.spaceId, n: count() })
      .from(category)
      .groupBy(category.spaceId),
  ]);
  const guidesBy = new Map(guideCounts.map((r) => [r.spaceId, r.n]));
  const categoriesBy = new Map(categoryCounts.map((r) => [r.spaceId, r.n]));
  return spaces.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    groupId: s.groupId,
    groupName: s.groupName,
    groupDeletedAt: s.groupDeletedAt,
    health: spaceHealth({
      deletedAt: s.groupDeletedAt,
      isDepartment: s.groupIsDepartment,
    }),
    guideCount: guidesBy.get(s.id) ?? 0,
    categoryCount: categoriesBy.get(s.id) ?? 0,
  }));
}

/** Groups a space may be re-homed to: live, flagged as a department, unclaimed. */
export async function eligibleRehomeGroups() {
  return db
    .select({ id: m365Group.id, displayName: m365Group.displayName })
    .from(m365Group)
    .leftJoin(space, eq(space.groupId, m365Group.id))
    .where(
      and(
        isNull(m365Group.deletedAt),
        eq(m365Group.isDepartment, true),
        isNull(space.id),
      ),
    )
    .orderBy(asc(m365Group.displayName));
}
