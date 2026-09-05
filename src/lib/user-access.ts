// Pure construction of a user's access context — no server imports so unit
// tests can exercise it. Server code gets it via "@/lib/permissions", which
// builds it from the session (browser) or from a verified token (MCP).

export type UserAccess = {
  userId: string;
  entraObjectId: string | null;
  /** Groups the user belongs to (member or owner). */
  memberGroupIds: Set<string>;
  /** Groups the user owns. Owners are treated as members too (Graph doesn't imply it). */
  ownerGroupIds: Set<string>;
  /** Admin: member of an admin-flagged group or the bootstrap admin group. */
  isAdmin: boolean;
};

/** One mirrored membership row, as getMembershipRows returns it. */
export type MembershipRow = {
  groupId: string;
  role: "member" | "owner";
  isAdminGroup: boolean;
};

/**
 * Fold membership rows into the access context. A user without an Entra
 * object id (never provisioned) has no groups and is never an admin.
 */
export function buildUserAccess(input: {
  userId: string;
  entraObjectId: string | null;
  rows: readonly MembershipRow[];
  bootstrapAdminGroupId?: string | null;
}): UserAccess {
  const access: UserAccess = {
    userId: input.userId,
    entraObjectId: input.entraObjectId,
    memberGroupIds: new Set(),
    ownerGroupIds: new Set(),
    isAdmin: false,
  };
  if (!input.entraObjectId) return access;

  for (const row of input.rows) {
    access.memberGroupIds.add(row.groupId);
    if (row.role === "owner") access.ownerGroupIds.add(row.groupId);
    if (
      row.isAdminGroup ||
      (input.bootstrapAdminGroupId && row.groupId === input.bootstrapAdminGroupId)
    ) {
      access.isAdmin = true;
    }
  }
  return access;
}
