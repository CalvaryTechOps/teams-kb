import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  category,
  guide,
  guideRevision,
  guideTag,
  space,
  tag,
  user,
} from "@/db/schema";
import type { GuideBlock } from "@/lib/guide-content";
import { searchGuides, stripHighlight } from "@/lib/guide-search";
import { clampLimit, type McpSettings } from "@/lib/mcp-settings";
import { visibleGuidesWhere } from "@/lib/permissions";
import type { UserAccess } from "@/lib/user-access";
import {
  isGuideId,
  toGuideMetadata,
  type GuideMetadata,
  type GuideMetadataRow,
} from "./shape";

// Read-only MCP tool queries. Every query is AND-ed with visibleGuidesWhere —
// the same fragment the browser uses — plus `status = 'published'`: an agent
// following unapproved instructions is exactly what the review queue exists
// to prevent (plans/mcp-server.md §2).

export type McpToolContext = {
  access: UserAccess;
  settings: McpSettings;
  /** NEXT_PUBLIC_APP_URL, for absolute guide links. */
  appUrl: string;
};

/** Sentinel category slug for a space's uncategorized guides (matches the space page). */
export const GENERAL_CATEGORY = "general";

function publishedVisible(access: UserAccess): SQL {
  return and(visibleGuidesWhere(access), eq(guide.status, "published"))!;
}

const metadataSelect = {
  id: guide.id,
  slug: guide.slug,
  title: guide.title,
  audience: guide.audience,
  publishedAt: guide.publishedAt,
  updatedAt: guide.updatedAt,
  spaceSlug: space.slug,
  spaceName: space.name,
  categorySlug: category.slug,
  categoryName: category.name,
};

async function tagsByGuide(ids: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ guideId: guideTag.guideId, name: tag.name })
    .from(guideTag)
    .innerJoin(tag, eq(tag.id, guideTag.tagId))
    .where(inArray(guideTag.guideId, ids))
    .orderBy(asc(tag.name));
  for (const r of rows) {
    const list = map.get(r.guideId) ?? [];
    list.push(r.name);
    map.set(r.guideId, list);
  }
  return map;
}

async function toMetadataList(
  rows: GuideMetadataRow[],
  appUrl: string,
): Promise<GuideMetadata[]> {
  const tags = await tagsByGuide(rows.map((r) => r.id));
  return rows.map((r) => toGuideMetadata(r, tags.get(r.id) ?? [], appUrl));
}

// ---------------------------------------------------------------------------

export type SpaceSummary = {
  slug: string;
  name: string;
  description: string | null;
  /** Published guides in the space the caller may read. */
  guideCount: number;
};

/** Departments with something readable, plus the caller's own (even if empty). */
export async function listSpaces(ctx: McpToolContext): Promise<SpaceSummary[]> {
  const rows = await db
    .select({
      groupId: space.groupId,
      slug: space.slug,
      name: space.name,
      description: space.description,
      guideCount: count(guide.id),
    })
    .from(space)
    .leftJoin(
      guide,
      and(eq(guide.spaceId, space.id), publishedVisible(ctx.access)),
    )
    .groupBy(space.id)
    .orderBy(asc(space.name));

  const { memberGroupIds, ownerGroupIds } = ctx.access;
  return rows
    .filter(
      (r) =>
        Number(r.guideCount) > 0 ||
        memberGroupIds.has(r.groupId) ||
        ownerGroupIds.has(r.groupId),
    )
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      description: r.description,
      guideCount: Number(r.guideCount),
    }));
}

// ---------------------------------------------------------------------------

export type ListGuidesResult =
  | { ok: true; space: { slug: string; name: string }; guides: GuideMetadata[] }
  | { ok: false; error: string };

export async function listGuides(
  ctx: McpToolContext,
  input: { space: string; category?: string; limit?: number },
): Promise<ListGuidesResult> {
  const [s] = await db
    .select({ id: space.id, slug: space.slug, name: space.name })
    .from(space)
    .where(eq(space.slug, input.space))
    .limit(1);
  // Unknown and not-visible look the same: an empty department, not a hint
  // that something exists behind the curtain.
  if (!s) return { ok: false, error: `No department with slug "${input.space}".` };

  const conditions: SQL[] = [publishedVisible(ctx.access), eq(guide.spaceId, s.id)];
  if (input.category === GENERAL_CATEGORY) {
    conditions.push(isNull(guide.categoryId));
  } else if (input.category) {
    conditions.push(eq(category.slug, input.category));
  }

  const rows = await db
    .select(metadataSelect)
    .from(guide)
    .innerJoin(space, eq(space.id, guide.spaceId))
    .leftJoin(category, eq(category.id, guide.categoryId))
    .where(and(...conditions))
    .orderBy(desc(guide.updatedAt))
    .limit(clampLimit(input.limit, ctx.settings.maxResults));

  return {
    ok: true,
    space: { slug: s.slug, name: s.name },
    guides: await toMetadataList(rows, ctx.appUrl),
  };
}

// ---------------------------------------------------------------------------

export type SearchHit = GuideMetadata & { snippet: string };

export async function searchGuidesTool(
  ctx: McpToolContext,
  input: { query: string; space?: string; tags?: string[]; limit?: number },
): Promise<SearchHit[]> {
  const hits = await searchGuides({
    access: ctx.access,
    query: input.query,
    spaceSlug: input.space || undefined,
    tagSlugs: input.tags ?? [],
    publishedOnly: true,
    limit: clampLimit(input.limit, ctx.settings.maxResults),
  });
  if (hits.length === 0) return [];

  const ids = hits.map((h) => h.id);
  const rows = await db
    .select(metadataSelect)
    .from(guide)
    .innerJoin(space, eq(space.id, guide.spaceId))
    .leftJoin(category, eq(category.id, guide.categoryId))
    .where(and(publishedVisible(ctx.access), inArray(guide.id, ids)));
  const metadata = new Map(
    (await toMetadataList(rows, ctx.appUrl)).map((m) => [m.id, m]),
  );

  // Keep the ranking order from the search.
  return hits.flatMap((h) => {
    const m = metadata.get(h.id);
    return m ? [{ ...m, snippet: stripHighlight(h.snippet) }] : [];
  });
}

// ---------------------------------------------------------------------------

export type GuideDocument = GuideMetadata & {
  /** Raw BlockNote document — an array of blocks, untransformed. */
  content: GuideBlock[];
  /** Schema generation of `content` (src/lib/guide-content.ts). */
  contentVersion: number;
  revision: { version: number; authorName: string | null; publishedAt: string | null };
};

export async function getGuide(
  ctx: McpToolContext,
  input: { id?: string; space?: string; slug?: string },
): Promise<GuideDocument | null> {
  let selector: SQL;
  if (input.id) {
    if (!isGuideId(input.id)) return null;
    selector = eq(guide.id, input.id);
  } else if (input.space && input.slug) {
    selector = and(eq(space.slug, input.space), eq(guide.slug, input.slug))!;
  } else {
    return null;
  }

  const [row] = await db
    .select({
      ...metadataSelect,
      content: guideRevision.content,
      contentVersion: guideRevision.contentVersion,
      version: guideRevision.version,
      authorName: user.name,
    })
    .from(guide)
    .innerJoin(space, eq(space.id, guide.spaceId))
    .leftJoin(category, eq(category.id, guide.categoryId))
    // Published revision only: current_revision_id is set at publish time.
    .innerJoin(guideRevision, eq(guideRevision.id, guide.currentRevisionId))
    .leftJoin(user, eq(user.id, guideRevision.authorId))
    .where(and(publishedVisible(ctx.access), selector))
    .limit(1);
  if (!row) return null;

  const { content, contentVersion, version, authorName, ...meta } = row;
  const [metadata] = await toMetadataList([meta], ctx.appUrl);
  return {
    ...metadata,
    content,
    contentVersion,
    revision: {
      version,
      authorName,
      publishedAt: metadata.publishedAt,
    },
  };
}
