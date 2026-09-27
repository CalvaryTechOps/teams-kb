// Pure revision-selection logic for the guide page — no React, no server
// imports, so it is unit-tested directly (plans/revision-picker.md). The page
// loads every revision's metadata once, narrows it to what the viewer may
// see, picks the one to render from `?rev=<version>`, and builds the picker
// from the same list.

export type RevisionStatus =
  | "draft"
  | "pending"
  | "published"
  | "rejected"
  | "superseded";

/** Everything the picker and the banners need; never the content itself. */
export type RevisionMeta = {
  id: string;
  version: number;
  status: RevisionStatus;
  authorId: string;
  authorName: string | null;
  createdAt: Date;
};

export type RevisionViewer = {
  /** Set when the viewer may edit; their own unpublished work is visible. */
  userId?: string;
  /** Space owners and admins: may see every revision. */
  canApprove: boolean;
};

/**
 * `?rev=` as a version number, or undefined for anything that isn't a
 * positive integer (absent, repeated, "draft", "3.5", "-1", "abc").
 */
export function parseRevisionParam(
  raw: string | string[] | undefined,
): number | undefined {
  if (typeof raw !== "string" || !/^[1-9]\d{0,8}$/.test(raw)) return undefined;
  return Number(raw);
}

/**
 * The revisions this viewer may look at, newest first. Approvers see them
 * all; everyone else sees the published one and their own work — a member
 * must never read a colleague's unapproved draft or submission.
 */
export function visibleRevisions<T extends RevisionMeta>(
  all: readonly T[],
  viewer: RevisionViewer,
  currentRevisionId: string | null,
): T[] {
  const visible = viewer.canApprove
    ? [...all]
    : all.filter(
        (r) =>
          r.id === currentRevisionId ||
          (viewer.userId !== undefined && r.authorId === viewer.userId),
      );
  return visible.sort((a, b) => b.version - a.version);
}

/**
 * Which revision the page renders. A requested version wins when it is in
 * the visible list; otherwise (absent, unknown, hidden) the published one.
 * A never-published guide falls back to its newest visible revision of any
 * status, so a lone rejected submission still renders instead of 404ing.
 */
export function chooseRevision<T extends RevisionMeta>(
  visible: readonly T[],
  requested: number | undefined,
  currentRevisionId: string | null,
): T | undefined {
  if (requested !== undefined) {
    const hit = visible.find((r) => r.version === requested);
    if (hit) return hit;
  }
  const current = currentRevisionId
    ? visible.find((r) => r.id === currentRevisionId)
    : undefined;
  if (current) return current;
  return [...visible].sort((a, b) => b.version - a.version)[0];
}

/** The address of a revision: the bare guide path for the published one. */
export function revisionHref(
  basePath: string,
  rev: Pick<RevisionMeta, "id" | "version">,
  currentRevisionId: string | null,
): string {
  return rev.id === currentRevisionId ? basePath : `${basePath}?rev=${rev.version}`;
}

export type RevisionStatusLabel =
  | "Published"
  | "Draft"
  | "Pending approval"
  | "Rejected"
  | "Superseded";

export function revisionStatusLabel(
  rev: Pick<RevisionMeta, "id" | "status">,
  currentRevisionId: string | null,
): RevisionStatusLabel {
  if (rev.id === currentRevisionId) return "Published";
  switch (rev.status) {
    case "published":
      return "Published";
    case "draft":
      return "Draft";
    case "pending":
      return "Pending approval";
    case "rejected":
      return "Rejected";
    case "superseded":
      return "Superseded";
  }
}

export function formatRevisionDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** One picker option: "v7 · Published · Sep 12, 2026 · A. Author". */
export function revisionOptionLabel(
  rev: RevisionMeta,
  currentRevisionId: string | null,
): string {
  const parts = [
    `v${rev.version}`,
    revisionStatusLabel(rev, currentRevisionId),
    formatRevisionDate(rev.createdAt),
  ];
  if (rev.authorName) parts.push(rev.authorName);
  return parts.join(" · ");
}
