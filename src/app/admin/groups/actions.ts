"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { m365Group, space } from "@/db/schema";
import { runFullSync } from "@/lib/graph-sync";
import { requireAdmin } from "@/lib/permissions";
import { slugify } from "@/lib/slug";

export async function setDepartmentFlag(groupId: string, isDepartment: boolean) {
  await requireAdmin();

  await db
    .update(m365Group)
    .set({ isDepartment })
    .where(eq(m365Group.id, groupId));

  if (isDepartment) {
    // Auto-create the department's space on first flag. Un-flagging keeps the
    // space (it may hold guides); the flag alone gates authoring.
    const [group] = await db
      .select()
      .from(m365Group)
      .where(eq(m365Group.id, groupId));
    const existing = await db
      .select({ id: space.id })
      .from(space)
      .where(eq(space.groupId, groupId));

    if (group && existing.length === 0) {
      const base = slugify(group.displayName);
      let slug = base;
      for (let n = 2; ; n++) {
        const taken = await db
          .select({ id: space.id })
          .from(space)
          .where(eq(space.slug, slug));
        if (taken.length === 0) break;
        slug = `${base}-${n}`;
      }
      await db.insert(space).values({
        groupId,
        slug,
        name: group.displayName,
        description: group.description,
      });
    }
  }

  revalidatePath("/admin/groups");
}

export async function setAdminGroupFlag(groupId: string, isAdminGroup: boolean) {
  await requireAdmin();
  await db
    .update(m365Group)
    .set({ isAdminGroup })
    .where(eq(m365Group.id, groupId));
  revalidatePath("/admin/groups");
}

export async function syncNow() {
  await requireAdmin();
  await runFullSync();
  revalidatePath("/admin/groups");
  revalidatePath("/admin");
}
