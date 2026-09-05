import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { guide, guideRevision } from "@/db/schema";
import {
  CONTENT_VERSION,
  blocksToPlainText,
  type GuideBlock,
} from "@/lib/guide-content";
import { uniqueGuideSlugIn } from "@/lib/moves";
import { slugify } from "@/lib/slug";

// The one way a guide comes into existence. Shared by the browser's new-guide
// form (saveGuide) and the MCP create_draft tool so the two can't drift:
// same slug rule, same revision-1 row, same publish side effects.

export type CreateGuideInput = {
  spaceId: string;
  title: string;
  /** Already validated by parseGuideContent / parseGuideContentJson. */
  content: GuideBlock[];
  authorId: string;
  categoryId?: string | null;
  /**
   * `draft` and `pending` leave the guide unpublished; `published` also sets
   * the guide live with this revision (owners and admins only — the caller
   * decides, this helper only records).
   */
  revisionStatus: "draft" | "pending" | "published";
};

export async function createGuideWithFirstRevision(
  input: CreateGuideInput,
): Promise<{ id: string; slug: string; revisionId: string }> {
  const slug = await uniqueGuideSlugIn(db, input.spaceId, slugify(input.title));
  return db.transaction(async (tx) => {
    const [g] = await tx
      .insert(guide)
      .values({
        spaceId: input.spaceId,
        categoryId: input.categoryId ?? null,
        slug,
        title: input.title,
        createdBy: input.authorId,
      })
      .returning({ id: guide.id });
    const [rev] = await tx
      .insert(guideRevision)
      .values({
        guideId: g!.id,
        version: 1,
        title: input.title,
        content: input.content,
        contentVersion: CONTENT_VERSION,
        status: input.revisionStatus,
        authorId: input.authorId,
      })
      .returning({ id: guideRevision.id });
    if (input.revisionStatus === "published") {
      await tx
        .update(guide)
        .set({
          status: "published",
          currentRevisionId: rev!.id,
          searchText: blocksToPlainText(input.content),
          publishedAt: new Date(),
        })
        .where(eq(guide.id, g!.id));
    }
    return { id: g!.id, slug, revisionId: rev!.id };
  });
}
