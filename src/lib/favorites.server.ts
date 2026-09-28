import "server-only";
import { cache } from "react";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  category,
  guide,
  guideFavorite,
  guideRevision,
  guideTag,
  space,
  tag,
  user,
} from "@/db/schema";
import { visibleGuidesWhere, type UserAccess } from "@/lib/permissions";

// Reads behind the star button, the sidebar pill and the /favorites page.
// Every query joins the favorite to its guide through visibleGuidesWhere, so
// a favorite whose guide the person can no longer read (audience narrowed,
// moved out of their departments, awaiting deletion) is invisible rather
// than deleted — it comes back if access does.

/** Whether this user has starred this guide. */
export async function isFavorite(userId: string, guideId: string) {
  const [row] = await db
    .select({ guideId: guideFavorite.guideId })
    .from(guideFavorite)
    .where(and(eq(guideFavorite.userId, userId), eq(guideFavorite.guideId, guideId)))
    .limit(1);
  return row !== undefined;
}

/**
 * How many of the user's favorites they can currently open — the number the
 * sidebar pill shows and the favorites page header repeats. Cached per
 * request like visibleArticleCountsBySpace, so the two share one query.
 */
export const favoriteCount = cache(async (access: UserAccess) => {
  const [row] = await db
    .select({ n: count() })
    .from(guideFavorite)
    .innerJoin(guide, eq(guide.id, guideFavorite.guideId))
    .where(and(eq(guideFavorite.userId, access.userId), visibleGuidesWhere(access)));
  return row?.n ?? 0;
});

export type FavoriteGuide = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published" | "archived" | "deleted";
  audience: "department" | "groups" | "all_staff";
  createdAt: Date;
  updatedAt: Date;
  /** Author of the current revision, or the creator for a never-published draft. */
  updatedBy: string;
  spaceSlug: string;
  spaceName: string;
  /** Null when the guide is filed under the synthetic General category. */
  categoryName: string | null;
  tags: string[];
};

/**
 * The user's readable favorites, alphabetical by title, with the same
 * creator / revision-author / tag data the category page shows plus the
 * department each guide lives in today.
 */
export async function listFavorites(access: UserAccess): Promise<FavoriteGuide[]> {
  const revisionAuthor = alias(user, "revision_author");
  const rows = await db
    .select({
      id: guide.id,
      slug: guide.slug,
      title: guide.title,
      status: guide.status,
      audience: guide.audience,
      createdAt: guide.createdAt,
      updatedAt: guide.updatedAt,
      creatorName: user.name,
      revisionAuthorName: revisionAuthor.name,
      spaceSlug: space.slug,
      spaceName: space.name,
      categoryName: category.name,
    })
    .from(guideFavorite)
    .innerJoin(guide, eq(guide.id, guideFavorite.guideId))
    .innerJoin(space, eq(space.id, guide.spaceId))
    .leftJoin(category, eq(category.id, guide.categoryId))
    .innerJoin(user, eq(user.id, guide.createdBy))
    .leftJoin(guideRevision, eq(guideRevision.id, guide.currentRevisionId))
    .leftJoin(revisionAuthor, eq(revisionAuthor.id, guideRevision.authorId))
    .where(and(eq(guideFavorite.userId, access.userId), visibleGuidesWhere(access)))
    .orderBy(asc(guide.title));

  const tagRows =
    rows.length === 0
      ? []
      : await db
          .select({ guideId: guideTag.guideId, name: tag.name })
          .from(guideTag)
          .innerJoin(tag, eq(tag.id, guideTag.tagId))
          .where(
            inArray(
              guideTag.guideId,
              rows.map((r) => r.id),
            ),
          );
  const tagsByGuide = new Map<string, string[]>();
  for (const t of tagRows) {
    const list = tagsByGuide.get(t.guideId) ?? [];
    list.push(t.name);
    tagsByGuide.set(t.guideId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    status: r.status,
    audience: r.audience,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    updatedBy: r.revisionAuthorName ?? r.creatorName,
    spaceSlug: r.spaceSlug,
    spaceName: r.spaceName,
    categoryName: r.categoryName,
    tags: tagsByGuide.get(r.id) ?? [],
  }));
}
