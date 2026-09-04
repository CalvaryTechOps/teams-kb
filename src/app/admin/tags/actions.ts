"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { guide, guideTag, space, tag } from "@/db/schema";
import { requireAdmin } from "@/lib/permissions";
import { slugify } from "@/lib/slug";
import { normalizeTagName } from "@/lib/tag-picker";

// Admin tag hygiene: merge duplicates, rename, delete strays. Every write
// re-checks the tags inside its transaction so a stale page can't merge into
// a tag that was deleted moments ago.

const PATH = "/admin/tags";

function bounce(params: Record<string, string>): never {
  redirect(`${PATH}?${new URLSearchParams(params)}`);
}

/** Guide pages that render any of these tags, for revalidation. */
async function guidePagesForTags(tagIds: string[]) {
  if (tagIds.length === 0) return [];
  return db
    .selectDistinct({ spaceSlug: space.slug, guideSlug: guide.slug })
    .from(guideTag)
    .innerJoin(guide, eq(guide.id, guideTag.guideId))
    .innerJoin(space, eq(space.id, guide.spaceId))
    .where(inArray(guideTag.tagId, tagIds));
}

function revalidateTagSurfaces(
  pages: { spaceSlug: string; guideSlug: string }[],
) {
  for (const p of pages) {
    revalidatePath(`/spaces/${p.spaceSlug}/guides/${p.guideSlug}`);
    revalidatePath(`/spaces/${p.spaceSlug}/guides/${p.guideSlug}/edit`);
  }
  revalidatePath("/search");
  revalidatePath("/admin");
  revalidatePath(PATH);
}

/**
 * Point every guide tagged with any of `sourceIds` at `targetId` (once — the
 * composite PK on guide_tag dedupes a guide that carried both), then delete
 * the sources; their remaining guide_tag rows cascade.
 */
export async function mergeTags(targetId: string, sourceIds: string[]) {
  const access = await requireAdmin();
  const sources = [...new Set(sourceIds)].filter((id) => id !== targetId);
  if (!targetId || sources.length === 0) {
    bounce({
      error: "Pick at least one tag to merge, and a different tag to merge into.",
    });
  }

  const pages = await guidePagesForTags([...sources, targetId]);

  const result = await db.transaction(async (tx) => {
    const [target] = await tx.select().from(tag).where(eq(tag.id, targetId));
    const sourceRows = await tx
      .select()
      .from(tag)
      .where(inArray(tag.id, sources));
    if (!target || sourceRows.length !== sources.length) return null;

    const guides = await tx
      .selectDistinct({ guideId: guideTag.guideId })
      .from(guideTag)
      .where(inArray(guideTag.tagId, sources));
    if (guides.length > 0) {
      await tx
        .insert(guideTag)
        .values(guides.map((g) => ({ guideId: g.guideId, tagId: targetId })))
        .onConflictDoNothing();
    }
    await tx.delete(tag).where(inArray(tag.id, sources));
    return { target, sourceRows, guides: guides.length };
  });

  if (!result) {
    bounce({ error: "One of those tags no longer exists — refresh and try again." });
  }

  console.info(
    `[tags] ${access.userId} merged ${result.sourceRows.map((t) => t.name).join(", ")} → ${result.target.name} (${result.guides} guides)`,
  );
  revalidateTagSurfaces(pages);
  bounce({
    merged: String(result.sourceRows.length),
    into: result.target.name,
    guides: String(result.guides),
  });
}

/** Change the display name (and slug). Refuses names another tag already owns. */
export async function renameTag(tagId: string, formData: FormData) {
  await requireAdmin();
  const name = normalizeTagName(String(formData.get("name") ?? ""));
  const slug = slugify(name);
  if (!name || slug === "untitled") {
    bounce({ error: "A tag name needs at least one letter or number." });
  }

  const pages = await guidePagesForTags([tagId]);

  const outcome = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(tag).where(eq(tag.id, tagId));
    if (!existing) return { kind: "missing" as const };
    const [clash] = await tx
      .select({ name: tag.name })
      .from(tag)
      .where(and(ne(tag.id, tagId), or(eq(tag.slug, slug), eq(tag.name, name))));
    if (clash) return { kind: "clash" as const, clash: clash.name };
    await tx.update(tag).set({ name, slug }).where(eq(tag.id, tagId));
    return { kind: "renamed" as const, from: existing.name };
  });

  if (outcome.kind === "missing") {
    bounce({ error: "That tag no longer exists — refresh and try again." });
  }
  if (outcome.kind === "clash") {
    bounce({
      error: `A tag “${outcome.clash}” already exists — merge into it instead of renaming.`,
    });
  }
  revalidateTagSurfaces(pages);
  bounce({ renamed: outcome.from, to: name });
}

/** Remove a tag nothing references. Used tags must be merged instead. */
export async function deleteTag(tagId: string) {
  await requireAdmin();

  const outcome = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(tag).where(eq(tag.id, tagId));
    if (!existing) return { kind: "missing" as const };
    const [used] = await tx
      .select({ guideId: guideTag.guideId })
      .from(guideTag)
      .where(eq(guideTag.tagId, tagId))
      .limit(1);
    if (used) return { kind: "used" as const, name: existing.name };
    await tx.delete(tag).where(eq(tag.id, tagId));
    return { kind: "deleted" as const, name: existing.name };
  });

  if (outcome.kind === "missing") {
    bounce({ error: "That tag no longer exists — refresh and try again." });
  }
  if (outcome.kind === "used") {
    bounce({
      error: `“${outcome.name}” is still on at least one guide — merge it into another tag instead.`,
    });
  }
  revalidatePath("/admin");
  revalidatePath(PATH);
  bounce({ deleted: outcome.name });
}
