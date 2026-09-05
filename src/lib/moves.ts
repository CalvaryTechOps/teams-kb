import "server-only";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, notExists, sql } from "drizzle-orm";
import { db } from "@/db";
import { category, guide, space } from "@/db/schema";

// Primitives for moving content between spaces, shared by the in-KB move
// pages (src/app/(kb)/spaces/actions.ts) and the admin space tooling
// (src/app/admin/spaces/actions.ts). None of these check permissions — the
// calling action does — and all take the transaction they run in.

export type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * First free slug in a space, starting from `base` and suffixing -2, -3, …
 * `base` is an existing slug (or an already slugified title), so a
 * hand-tuned slug survives a move whenever it doesn't collide.
 */
export async function uniqueGuideSlugIn(
  tx: Db,
  spaceId: string,
  base: string,
): Promise<string> {
  let slug = base;
  for (let n = 2; ; n++) {
    const taken = await tx
      .select({ id: guide.id })
      .from(guide)
      .where(and(eq(guide.spaceId, spaceId), eq(guide.slug, slug)));
    if (taken.length === 0) return slug;
    slug = `${base}-${n}`;
  }
}

export type GuideRow = { id: string; slug: string; spaceId: string };
export type MovedGuide = { id: string; oldSlug: string; newSlug: string };

/**
 * Re-file one guide. Revisions, tags, audience rows and requests all key on
 * the guide id and come along untouched; only space, category and (on a
 * collision in the target) slug change. The caller has verified that
 * `target.categoryId` belongs to `target.spaceId`.
 */
export async function moveGuideInTx(
  tx: Db,
  g: GuideRow,
  target: { spaceId: string; categoryId: string | null },
): Promise<MovedGuide> {
  const newSlug =
    g.spaceId === target.spaceId
      ? g.slug
      : await uniqueGuideSlugIn(tx, target.spaceId, g.slug);
  await tx
    .update(guide)
    .set({
      spaceId: target.spaceId,
      categoryId: target.categoryId,
      slug: newSlug,
    })
    .where(eq(guide.id, g.id));
  return { id: g.id, oldSlug: g.slug, newSlug };
}

export type CategoryRow = { id: string; slug: string; spaceId: string };

/**
 * Move a category and every guide in it (any status) into another space.
 * A same-slug category already in the target absorbs the guides and the
 * source row is deleted — two departments' "Policies" are one after a
 * merge, by design (plan Q8).
 */
export async function moveCategoryInTx(
  tx: Db,
  cat: CategoryRow,
  targetSpaceId: string,
): Promise<{ categoryId: string; merged: boolean; guides: MovedGuide[] }> {
  if (cat.spaceId === targetSpaceId) {
    throw new Error("moveCategoryInTx: target is the category's own space");
  }
  const [existing] = await tx
    .select({ id: category.id })
    .from(category)
    .where(
      and(eq(category.spaceId, targetSpaceId), eq(category.slug, cat.slug)),
    );
  const targetCategoryId = existing?.id ?? cat.id;

  const rows = await tx
    .select({ id: guide.id, slug: guide.slug, spaceId: guide.spaceId })
    .from(guide)
    .where(eq(guide.categoryId, cat.id));
  const guides: MovedGuide[] = [];
  for (const g of rows) {
    guides.push(
      await moveGuideInTx(tx, g, {
        spaceId: targetSpaceId,
        categoryId: targetCategoryId,
      }),
    );
  }

  if (existing) {
    await tx.delete(category).where(eq(category.id, cat.id));
  } else {
    await tx
      .update(category)
      .set({ spaceId: targetSpaceId })
      .where(eq(category.id, cat.id));
  }
  return { categoryId: targetCategoryId, merged: existing !== undefined, guides };
}

/** Every uncategorized ("General") guide of a space → another space/category. */
export async function moveGeneralGuidesInTx(
  tx: Db,
  sourceSpaceId: string,
  target: { spaceId: string; categoryId: string | null },
): Promise<MovedGuide[]> {
  const rows = await tx
    .select({ id: guide.id, slug: guide.slug, spaceId: guide.spaceId })
    .from(guide)
    .where(and(eq(guide.spaceId, sourceSpaceId), isNull(guide.categoryId)));
  const moved: MovedGuide[] = [];
  for (const g of rows) moved.push(await moveGuideInTx(tx, g, target));
  return moved;
}

/**
 * Delete a space only if it holds nothing: no guide in any status (drafts,
 * archived and deletion-pending included — `guide.space_id` cascades, so a
 * raw delete would silently destroy them) and no category. One statement,
 * so a guide filed in between the UI's check and the click keeps the space.
 * Returns whether a row was deleted.
 */
export async function deleteSpaceIfEmpty(tx: Db, spaceId: string): Promise<boolean> {
  const deleted = await tx
    .delete(space)
    .where(
      and(
        eq(space.id, spaceId),
        notExists(
          tx.select({ one: sql`1` }).from(guide).where(eq(guide.spaceId, space.id)),
        ),
        notExists(
          tx
            .select({ one: sql`1` })
            .from(category)
            .where(eq(category.spaceId, space.id)),
        ),
      ),
    )
    .returning({ id: space.id });
  return deleted.length > 0;
}

export function guidePath(spaceSlug: string, guideSlug: string): string {
  return `/spaces/${spaceSlug}/guides/${guideSlug}`;
}

/**
 * Everything a move can have changed: the home feed and search, both
 * spaces (page + queue), every affected guide path old and new, and the
 * admin inventories.
 */
export function revalidateMove(input: {
  spaceSlugs: string[];
  guidePaths?: string[];
}) {
  const paths = new Set<string>(["/", "/search", "/admin/guides", "/admin/spaces"]);
  for (const slug of input.spaceSlugs) {
    paths.add(`/spaces/${slug}`);
    paths.add(`/spaces/${slug}/queue`);
  }
  for (const p of input.guidePaths ?? []) paths.add(p);
  for (const p of paths) revalidatePath(p);
}
