import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { category, m365Group, space } from "@/db/schema";
import type { MoveTargetSpace } from "@/components/move-form";
import { SPACE_HEALTH_LABELS, isOrphaned, spaceHealth } from "@/lib/space-health";

/**
 * Every space other than the current one, with its categories, for the
 * department picker on the move pages. Orphaned spaces are kept (an admin may
 * want to move content *out* of one, or park it there) but labelled.
 */
export async function moveTargets(currentSpaceId: string): Promise<MoveTargetSpace[]> {
  const [spaces, categories] = await Promise.all([
    db
      .select({
        id: space.id,
        name: space.name,
        deletedAt: m365Group.deletedAt,
        isDepartment: m365Group.isDepartment,
      })
      .from(space)
      .innerJoin(m365Group, eq(m365Group.id, space.groupId))
      .orderBy(asc(space.name)),
    db
      .select({ id: category.id, spaceId: category.spaceId, name: category.name })
      .from(category)
      .orderBy(asc(category.sortOrder), asc(category.name)),
  ]);
  return spaces
    .filter((sp) => sp.id !== currentSpaceId)
    .map((sp) => {
      const health = spaceHealth(sp);
      return {
        id: sp.id,
        name: sp.name,
        note: isOrphaned(health) ? SPACE_HEALTH_LABELS[health] : undefined,
        categories: categories
          .filter((c) => c.spaceId === sp.id)
          .map((c) => ({ id: c.id, name: c.name })),
      };
    });
}
