import { asc, count, eq, notExists, sql } from "drizzle-orm";
import { db } from "@/db";
import { guideTag, tag } from "@/db/schema";

// Server-side tag queries shared by the guide form pages and /admin/tags.

export type TagWithCount = {
  id: string;
  name: string;
  slug: string;
  /** Guides referencing the tag in any status (draft, pending, published…). */
  guideCount: number;
};

export async function listTagsWithCounts(): Promise<TagWithCount[]> {
  const rows = await db
    .select({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      guideCount: count(guideTag.guideId),
    })
    .from(tag)
    .leftJoin(guideTag, eq(guideTag.tagId, tag.id))
    .groupBy(tag.id)
    .orderBy(asc(sql`lower(${tag.name})`));
  return rows.map((r) => ({ ...r, guideCount: Number(r.guideCount) }));
}

type Executor = Pick<typeof db, "delete" | "select">;

/**
 * Delete tags no guide references any more. Tags only exist to be picked, so
 * one that nothing uses is noise in the picker; call this after anything
 * that removes guide_tag rows (re-tagging a guide, deleting a guide).
 */
export async function pruneUnusedTags(dbx: Executor = db): Promise<void> {
  await dbx.delete(tag).where(
    notExists(
      dbx
        .select({ one: sql`1` })
        .from(guideTag)
        .where(eq(guideTag.tagId, tag.id)),
    ),
  );
}
