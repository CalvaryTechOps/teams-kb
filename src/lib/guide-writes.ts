import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { withTransaction } from "@/db/transaction";
import { guide, guideRevision } from "@/db/schema";
import {
  CONTENT_VERSION,
  blocksToPlainText,
  type GuideBlock,
} from "@/lib/guide-content";
import { uniqueGuideSlugIn } from "@/lib/moves";
import { generateShortId } from "@/lib/short-id";
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
): Promise<{ id: string; slug: string; shortId: string; revisionId: string }> {
  const slug = await uniqueGuideSlugIn(db, input.spaceId, slugify(input.title));
  const shortId = await unusedShortId(db);
  return withTransaction(async (tx) => {
    const [g] = await tx
      .insert(guide)
      .values({
        spaceId: input.spaceId,
        categoryId: input.categoryId ?? null,
        slug,
        shortId,
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
    return { id: g!.id, slug, shortId, revisionId: rev!.id };
  });
}

const SHORT_ID_ATTEMPTS = 5;

/**
 * A random short id no guide holds yet, checked the same way the slug is
 * (before the transaction). At ~14 million ids a hit is rare and a second
 * draw resolves it; a concurrent insert of the same id in the gap before
 * commit fails on guide_short_id_idx and the user simply retries.
 */
async function unusedShortId(handle: typeof db): Promise<string> {
  for (let i = 0; i < SHORT_ID_ATTEMPTS; i++) {
    const candidate = generateShortId();
    const taken = await handle
      .select({ id: guide.id })
      .from(guide)
      .where(eq(guide.shortId, candidate))
      .limit(1);
    if (taken.length === 0) return candidate;
  }
  throw new Error("Could not find an unused short id");
}
