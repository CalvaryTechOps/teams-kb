// A space is "orphaned" when nobody can author in it any more: its backing
// M365 group was deleted in Entra (soft-deleted by the full sync), or an
// admin un-flagged the group as a department. Both states are derived, never
// stored — see plans/handle-orphaned-spaces.md.

export type SpaceHealth = "healthy" | "group_deleted" | "unflagged";

export function spaceHealth(group: {
  deletedAt: Date | null;
  isDepartment: boolean;
}): SpaceHealth {
  if (group.deletedAt) return "group_deleted";
  if (!group.isDepartment) return "unflagged";
  return "healthy";
}

export function isOrphaned(health: SpaceHealth): boolean {
  return health !== "healthy";
}

export const SPACE_HEALTH_LABELS: Record<SpaceHealth, string> = {
  healthy: "Healthy",
  group_deleted: "Team deleted",
  unflagged: "Not a department",
};

/** One-sentence explanation for admins of what the state means. */
export function spaceHealthDescription(health: SpaceHealth): string {
  switch (health) {
    case "group_deleted":
      return "The Team backing this department no longer exists in Microsoft 365, so nobody can author here. Published guides stay readable.";
    case "unflagged":
      return "This group is no longer flagged as a department, so nobody can author here. Published guides stay readable.";
    case "healthy":
      return "Members of the backing Team can author here.";
  }
}
