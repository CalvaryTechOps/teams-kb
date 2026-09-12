import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { guide, guideAudienceGroup, space } from "@/db/schema";
import type { UserAccess } from "@/lib/permissions";
import { classifyPermalink, type PermalinkResolution } from "@/lib/permalink";
import { normalizeShortId } from "@/lib/short-id";

/**
 * Resolve the `{shortId}` of /a/{shortId} for this viewer. Shared by the
 * redirect page and the QR label page so both answer identically. The
 * destination page re-checks permissions itself; this only decides between
 * redirect, "not found" and "ask {department}".
 */
export async function resolvePermalink(
  rawShortId: string,
  access: UserAccess,
): Promise<PermalinkResolution & { shortId: string | null }> {
  const shortId = normalizeShortId(rawShortId);
  if (!shortId) return { kind: "not_found", shortId: null };

  const [row] = await db
    .select({
      status: guide.status,
      audience: guide.audience,
      createdBy: guide.createdBy,
      guideSlug: guide.slug,
      title: guide.title,
      spaceGroupId: space.groupId,
      spaceSlug: space.slug,
      spaceName: space.name,
      guideId: guide.id,
    })
    .from(guide)
    .innerJoin(space, eq(space.id, guide.spaceId))
    .where(eq(guide.shortId, shortId))
    .limit(1);
  if (!row) return { kind: "not_found", shortId };

  const audienceGroupIds =
    row.audience === "groups"
      ? (
          await db
            .select({ groupId: guideAudienceGroup.groupId })
            .from(guideAudienceGroup)
            .where(eq(guideAudienceGroup.guideId, row.guideId))
        ).map((r) => r.groupId)
      : [];

  return { ...classifyPermalink(access, { ...row, audienceGroupIds }), shortId };
}
