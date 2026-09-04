"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { category, m365Group, space } from "@/db/schema";
import { graphConfigured } from "@/lib/graph";
import { syncGroupRoster } from "@/lib/graph-sync";
import {
  deleteSpaceIfEmpty,
  guidePath,
  moveCategoryInTx,
  moveGeneralGuidesInTx,
  revalidateMove,
} from "@/lib/moves";
import { requireAdmin } from "@/lib/permissions";

// Admin tooling for orphaned spaces (plans/handle-orphaned-spaces.md §3).
// Every action re-derives its preconditions from the database — the page's
// pickers are a convenience, not a guarantee.

const INVENTORY = "/admin/spaces";

async function spaceByIdOrBounce(spaceId: string) {
  const [s] = await db.select().from(space).where(eq(space.id, spaceId));
  if (!s) redirect(INVENTORY);
  return s;
}

/**
 * Point a space at a different Teams group. The target must be live, already
 * flagged as a department (plan Q2), and not backing another space (1:1).
 * The space keeps its slug so URLs survive; the name may be changed in the
 * same step because it usually no longer matches the new group.
 */
export async function rehomeSpace(spaceId: string, formData: FormData) {
  await requireAdmin();
  const s = await spaceByIdOrBounce(spaceId);
  const groupId = String(formData.get("groupId") ?? "");
  const name = String(formData.get("name") ?? "").trim() || s.name;

  const [target] = groupId
    ? await db
        .select({ id: m365Group.id })
        .from(m365Group)
        .leftJoin(space, eq(space.groupId, m365Group.id))
        .where(
          and(
            eq(m365Group.id, groupId),
            isNull(m365Group.deletedAt),
            eq(m365Group.isDepartment, true),
            isNull(space.id),
          ),
        )
    : [];
  if (!target) redirect(INVENTORY);

  await db
    .update(space)
    .set({ groupId: target.id, name })
    .where(eq(space.id, s.id));

  // The new group's members should be able to author right away, not after
  // the nightly sync. Best effort: a Graph hiccup must not undo the re-home.
  if (graphConfigured()) {
    try {
      await syncGroupRoster(target.id);
    } catch {
      // The full sync will pick the roster up; the admin page shows the
      // space as healthy either way.
    }
  }

  revalidatePath("/");
  revalidatePath(`/spaces/${s.slug}`);
  revalidatePath(INVENTORY);
  revalidatePath("/admin/groups");
  redirect(INVENTORY);
}

/**
 * Fold one space into another: every category (merging into same-slug
 * categories there) and every General guide moves, then the emptied source
 * space is deleted. One transaction, so a failure leaves both spaces as
 * they were.
 */
export async function mergeSpace(sourceId: string, formData: FormData) {
  await requireAdmin();
  const source = await spaceByIdOrBounce(sourceId);
  const targetId = String(formData.get("targetId") ?? "");
  if (!targetId || targetId === source.id) redirect(INVENTORY);
  const [target] = await db.select().from(space).where(eq(space.id, targetId));
  if (!target) redirect(INVENTORY);

  const movedPaths: string[] = [];
  await db.transaction(async (tx) => {
    const categories = await tx
      .select({ id: category.id, slug: category.slug, spaceId: category.spaceId })
      .from(category)
      .where(eq(category.spaceId, source.id))
      .orderBy(asc(category.sortOrder), asc(category.name));
    for (const cat of categories) {
      const result = await moveCategoryInTx(tx, cat, target.id);
      for (const m of result.guides) {
        movedPaths.push(guidePath(source.slug, m.oldSlug), guidePath(target.slug, m.newSlug));
      }
    }
    const general = await moveGeneralGuidesInTx(tx, source.id, {
      spaceId: target.id,
      categoryId: null,
    });
    for (const m of general) {
      movedPaths.push(guidePath(source.slug, m.oldSlug), guidePath(target.slug, m.newSlug));
    }
    // Everything has left; this can only fail if something was filed into
    // the source mid-merge, in which case the whole merge rolls back.
    const deleted = await deleteSpaceIfEmpty(tx, source.id);
    if (!deleted) throw new Error("Space was not empty after merging its content");
  });

  revalidateMove({ spaceSlugs: [source.slug, target.slug], guidePaths: movedPaths });
  revalidatePath("/admin");
  redirect(INVENTORY);
}

/** Remove a space that holds nothing (see deleteSpaceIfEmpty). */
export async function deleteSpace(spaceId: string) {
  await requireAdmin();
  const s = await spaceByIdOrBounce(spaceId);
  await deleteSpaceIfEmpty(db, s.id);
  revalidatePath("/");
  revalidatePath(`/spaces/${s.slug}`);
  revalidatePath(INVENTORY);
  revalidatePath("/admin");
  redirect(INVENTORY);
}
