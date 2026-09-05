// The JSON an agent receives for a guide. Pure so it can be unit-tested and
// so tools.ts (queries) stays free of formatting. v1 returns metadata plus
// the raw BlockNote document; readable projections are a future version.

export type GuideMetadataRow = {
  id: string;
  slug: string;
  title: string;
  audience: "department" | "groups" | "all_staff";
  publishedAt: Date | null;
  updatedAt: Date;
  spaceSlug: string;
  spaceName: string;
  categorySlug: string | null;
  categoryName: string | null;
};

export type GuideMetadata = {
  id: string;
  title: string;
  slug: string;
  /** Absolute guide page URL, for citations. */
  url: string;
  space: { slug: string; name: string };
  category: { slug: string; name: string } | null;
  tags: string[];
  audience: GuideMetadataRow["audience"];
  publishedAt: string | null;
  updatedAt: string;
};

export function guideUrl(appUrl: string, spaceSlug: string, guideSlug: string): string {
  const base = appUrl.replace(/\/+$/, "");
  return `${base}/spaces/${encodeURIComponent(spaceSlug)}/guides/${encodeURIComponent(guideSlug)}`;
}

export function toGuideMetadata(
  row: GuideMetadataRow,
  tags: readonly string[],
  appUrl: string,
): GuideMetadata {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    url: guideUrl(appUrl, row.spaceSlug, row.slug),
    space: { slug: row.spaceSlug, name: row.spaceName },
    category:
      row.categorySlug && row.categoryName
        ? { slug: row.categorySlug, name: row.categoryName }
        : null,
    tags: [...tags],
    audience: row.audience,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Guide ids are uuids; anything else can't match and must not reach Postgres as one. */
export function isGuideId(value: string): boolean {
  return UUID_RE.test(value);
}
