import {
  resolveGuidePermissions,
  type GroupAccess,
  type GuideForPermissions,
} from "@/lib/guide-permissions";

// What a permalink (/a/{shortId}) resolves to for one viewer. Pure so the
// three outcomes unit-test directly; permalink.server.ts loads the row.
// plans/guide-permalinks.md §2, open question 3: only staff can sign in, so
// a forbidden visitor is told which department to ask — but an unpublished
// guide reads as "not found" to anyone who may not see it, since confirming
// a draft exists is confirming unapproved content exists.

export type PermalinkTarget = {
  spaceSlug: string;
  spaceName: string;
  guideSlug: string;
  title: string;
};

export type PermalinkResolution =
  | { kind: "ok"; target: PermalinkTarget }
  | { kind: "not_found" }
  | { kind: "forbidden"; spaceName: string };

export function classifyPermalink(
  access: GroupAccess,
  row: (GuideForPermissions & PermalinkTarget) | undefined,
): PermalinkResolution {
  if (!row || row.status === "deleted") return { kind: "not_found" };
  const perms = resolveGuidePermissions(access, row);
  if (perms.canRead) {
    const { spaceSlug, spaceName, guideSlug, title } = row;
    return { kind: "ok", target: { spaceSlug, spaceName, guideSlug, title } };
  }
  if (row.status !== "published") return { kind: "not_found" };
  return { kind: "forbidden", spaceName: row.spaceName };
}

/** Readable guide URL a resolved permalink redirects to. */
export function guidePath(target: PermalinkTarget): string {
  return `/spaces/${encodeURIComponent(target.spaceSlug)}/guides/${encodeURIComponent(target.guideSlug)}`;
}
