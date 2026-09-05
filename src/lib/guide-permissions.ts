// Pure guide-permission resolution — no server imports so unit tests can
// exercise it directly. Server code should import from "@/lib/permissions",
// which re-exports everything here.

export type GroupAccess = {
  /** App user id, used for authorship checks on unpublished guides. */
  userId?: string;
  memberGroupIds: Set<string>;
  ownerGroupIds: Set<string>;
  isAdmin: boolean;
};

/** The slice of a guide (plus its space) the resolver needs. */
export type GuideForPermissions = {
  /** Entra group id of the space the guide lives in. */
  spaceGroupId: string;
  status: "draft" | "published" | "archived" | "deleted";
  audience: "department" | "groups" | "all_staff";
  /** Target group ids when audience = 'groups' (ignored otherwise). */
  audienceGroupIds?: readonly string[];
  /** App user id of the guide's creator, for unpublished visibility. */
  createdBy?: string;
};

export type GuidePermissions = {
  canRead: boolean;
  canEdit: boolean;
  canApprove: boolean;
};

/**
 * Pure function — the single answer to "what may this user do with this
 * guide". Owners aren't automatically members in Graph, so membership is the
 * union of both sets.
 *
 * Unpublished guides are visible only to space owners, the guide's author,
 * and admins — never to other space members — so unapproved content can't be
 * read and followed by staff before an owner signs off.
 *
 * A guide awaiting deletion approval is invisible to everyone, admins
 * included — the admin queue is the only window into it.
 */
export function resolveGuidePermissions(
  access: GroupAccess,
  g: GuideForPermissions,
): GuidePermissions {
  if (g.status === "deleted") {
    return { canRead: false, canEdit: false, canApprove: false };
  }
  if (access.isAdmin) {
    return { canRead: true, canEdit: true, canApprove: true };
  }

  const isOwner = access.ownerGroupIds.has(g.spaceGroupId);
  const isMember = isOwner || access.memberGroupIds.has(g.spaceGroupId);
  const isAuthor =
    g.createdBy !== undefined &&
    access.userId !== undefined &&
    g.createdBy === access.userId;
  const published = g.status === "published";

  let canRead = isOwner || (isMember && (published || isAuthor));
  if (!canRead && published) {
    canRead =
      g.audience === "all_staff" ||
      (g.audience === "groups" &&
        (g.audienceGroupIds ?? []).some(
          (id) =>
            access.memberGroupIds.has(id) || access.ownerGroupIds.has(id),
        ));
    // audience === 'department' needs space membership — already false here.
  }

  // Members may propose edits to anything they can read in their space;
  // audience-only readers may not edit.
  const canEdit = isMember && canRead;

  return { canRead, canEdit, canApprove: isOwner };
}

/**
 * "May this user author (draft, edit, propose) in this space at all" — the
 * gate for creating a new guide. A published department guide stands in for
 * the not-yet-existing row, so the answer is: space members and owners, and
 * admins. Unpublished guides are further gated by authorship once they exist
 * (resolveGuidePermissions against the real row).
 */
export function canAuthorInSpace(
  access: GroupAccess,
  spaceGroupId: string,
): boolean {
  return resolveGuidePermissions(access, {
    spaceGroupId,
    status: "published",
    audience: "department",
  }).canEdit;
}
