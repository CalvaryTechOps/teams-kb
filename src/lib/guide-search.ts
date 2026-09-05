import "server-only";
import { and, desc, eq, exists, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { guide, guideTag, space, tag } from "@/db/schema";
import { visibleGuidesWhere } from "@/lib/permissions";
import type { UserAccess } from "@/lib/user-access";

// Postgres FTS over guide.search_vector (title weighted A, published body B),
// ALWAYS AND-ed with the visibility fragment — ranking never widens access.
// Shared by the /search page and the MCP search tool so the two can't drift.

// ts_headline marks matches with these tokens; the page maps them to <mark>
// in React so user content is never injected as HTML.
export const HL_START = "[[[";
export const HL_END = "]]]";

export type GuideSearchRow = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published" | "archived" | "deleted";
  searchText: string | null;
  updatedAt: Date;
  spaceSlug: string;
  spaceName: string;
  /** Highlighted excerpt (HL_START/HL_END markers) when a query was given, else "". */
  snippet: string;
};

export async function searchGuides(params: {
  access: UserAccess;
  /** Free-text query; empty means "filter only", ordered by recency. */
  query: string;
  spaceSlug?: string;
  /** OR-ed: a guide matches when it carries any of these tag slugs. */
  tagSlugs?: readonly string[];
  /** MCP serves published guides only; the page shows what the viewer may see. */
  publishedOnly?: boolean;
  limit: number;
}): Promise<GuideSearchRow[]> {
  const { access, query, spaceSlug, tagSlugs = [], publishedOnly, limit } = params;
  const tsquery = sql`websearch_to_tsquery('english', ${query})`;
  const conditions: SQL[] = [visibleGuidesWhere(access)];
  if (query) conditions.push(sql`${guide.searchVector} @@ ${tsquery}`);
  if (publishedOnly) conditions.push(eq(guide.status, "published"));
  if (spaceSlug) conditions.push(eq(space.slug, spaceSlug));
  if (tagSlugs.length > 0) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(guideTag)
          .innerJoin(tag, eq(tag.id, guideTag.tagId))
          .where(and(eq(guideTag.guideId, guide.id), inArray(tag.slug, [...tagSlugs]))),
      ),
    );
  }

  return db
    .select({
      id: guide.id,
      slug: guide.slug,
      title: guide.title,
      status: guide.status,
      searchText: guide.searchText,
      updatedAt: guide.updatedAt,
      spaceSlug: space.slug,
      spaceName: space.name,
      snippet: query
        ? sql<string>`ts_headline('english', coalesce(${guide.searchText}, ''), ${tsquery},
            'StartSel=${sql.raw(HL_START)}, StopSel=${sql.raw(HL_END)}, MaxWords=32, MinWords=12')`
        : sql<string>`''`,
    })
    .from(guide)
    .innerJoin(space, eq(space.id, guide.spaceId))
    .where(and(...conditions))
    .orderBy(
      query
        ? desc(sql`ts_rank(${guide.searchVector}, ${tsquery})`)
        : desc(guide.updatedAt),
    )
    .limit(limit);
}

/** Plain-text excerpt for consumers that don't render highlights (MCP). */
export function stripHighlight(snippet: string): string {
  return snippet.split(HL_START).join("").split(HL_END).join("");
}
