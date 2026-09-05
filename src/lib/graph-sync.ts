import { and, eq, inArray, isNotNull, isNull, notExists, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  guide,
  guideAudienceGroup,
  m365Group,
  m365GroupMember,
  syncRun,
  user,
} from "@/db/schema";
import {
  graphConfigured,
  graphGetAll,
  isTeamsGroup,
  type GraphDirectoryObject,
  type GraphGroup,
} from "@/lib/graph";

const GROUP_SELECT =
  "$select=id,displayName,description,mail,resourceProvisioningOptions";

// Only Teams-enabled groups reach the KB; plain M365/security groups stay out.
const TEAMS_FILTER = `$filter=${encodeURIComponent(
  "resourceProvisioningOptions/Any(x:x eq 'Team')",
)}`;

/**
 * Full directory sync (daily cron + admin "Sync now"):
 * 1. Mirror the tenant's group catalog into m365_group (soft-deleting removals).
 * 2. Replace member/owner rows for flagged and audience-referenced groups
 *    only — a church tenant has many groups nobody uses in the KB; syncing
 *    their rosters is wasted Graph calls.
 */
export async function runFullSync(): Promise<{
  groupsCount: number;
  membershipsCount: number;
}> {
  const [run] = await db.insert(syncRun).values({ kind: "full" }).returning();
  try {
    // Server-side Teams filter, plus a client-side guard in case the filter
    // ever regresses to returning everything.
    const groups = (
      await graphGetAll<GraphGroup>(
        `/groups?${TEAMS_FILTER}&${GROUP_SELECT}&$top=999`,
      )
    ).filter(isTeamsGroup);

    for (const g of groups) {
      await db
        .insert(m365Group)
        .values({
          id: g.id,
          displayName: g.displayName,
          description: g.description,
          mail: g.mail,
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: m365Group.id,
          set: {
            displayName: g.displayName,
            description: g.description,
            mail: g.mail,
            syncedAt: new Date(),
            deletedAt: null,
          },
        });
    }

    const seenIds = groups.map((g) => g.id);
    if (seenIds.length > 0) {
      await db
        .update(m365Group)
        .set({ deletedAt: new Date() })
        .where(and(isNull(m365Group.deletedAt), notInArray(m365Group.id, seenIds)));
    }

    // Rosters are synced for flagged groups plus any group a guide is shared
    // with (M6 audiences) — their members need to resolve for visibility.
    const [flagged, audienceRefs] = await Promise.all([
      db
        .select({ id: m365Group.id })
        .from(m365Group)
        .where(
          and(
            isNull(m365Group.deletedAt),
            or(
              eq(m365Group.isDepartment, true),
              eq(m365Group.isAdminGroup, true),
            ),
          ),
        ),
      db
        .selectDistinct({ id: guideAudienceGroup.groupId })
        .from(guideAudienceGroup)
        .innerJoin(m365Group, eq(m365Group.id, guideAudienceGroup.groupId))
        .where(isNull(m365Group.deletedAt)),
    ]);
    const rosterGroupIds = [
      ...new Set([...flagged, ...audienceRefs].map((g) => g.id)),
    ];

    let membershipsCount = 0;
    for (const groupId of rosterGroupIds) {
      membershipsCount += await syncGroupRoster(groupId);
    }

    // Deleted groups can't be an audience any more; drop the links now
    // rather than let a guide's readership shrink silently (plan Q3).
    const pruned = await pruneStaleAudiences();

    await db
      .update(syncRun)
      .set({
        finishedAt: new Date(),
        groupsCount: groups.length,
        membershipsCount,
        note: pruned.note,
      })
      .where(eq(syncRun.id, run.id));

    return { groupsCount: groups.length, membershipsCount };
  } catch (err) {
    await db
      .update(syncRun)
      .set({
        finishedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      })
      .where(eq(syncRun.id, run.id));
    throw err;
  }
}

/**
 * Replace one group's member/owner rows from Graph. Used by the full sync
 * for every roster group, and by admin re-homing so a newly assigned
 * department can author right away instead of after the next nightly run.
 * Returns the number of rows written.
 */
export async function syncGroupRoster(groupId: string): Promise<number> {
  const [members, owners] = await Promise.all([
    graphGetAll<GraphDirectoryObject>(
      `/groups/${groupId}/members/microsoft.graph.user?$select=id&$top=999`,
    ),
    graphGetAll<GraphDirectoryObject>(
      `/groups/${groupId}/owners/microsoft.graph.user?$select=id&$top=999`,
    ),
  ]);
  const rows = [
    ...members.map((m) => ({
      groupId,
      entraObjectId: m.id,
      role: "member" as const,
    })),
    ...owners.map((o) => ({
      groupId,
      entraObjectId: o.id,
      role: "owner" as const,
    })),
  ];
  await db.transaction(async (tx) => {
    await tx.delete(m365GroupMember).where(eq(m365GroupMember.groupId, groupId));
    if (rows.length > 0) {
      await tx.insert(m365GroupMember).values(rows).onConflictDoNothing();
    }
  });
  return rows.length;
}

/**
 * Remove guide_audience_group rows whose group is soft-deleted. A guide left
 * with audience 'groups' but no groups falls back to 'department' — the same
 * reading the audience picker applies to "specific teams, none chosen". The
 * note goes on the sync run so the cleanup is visible on the dashboard.
 */
export async function pruneStaleAudiences(): Promise<{
  prunedLinks: number;
  narrowedGuides: number;
  note: string | null;
}> {
  const pruned = await db
    .delete(guideAudienceGroup)
    .where(
      inArray(
        guideAudienceGroup.groupId,
        db
          .select({ id: m365Group.id })
          .from(m365Group)
          .where(isNotNull(m365Group.deletedAt)),
      ),
    )
    .returning({ guideId: guideAudienceGroup.guideId });
  if (pruned.length === 0) {
    return { prunedLinks: 0, narrowedGuides: 0, note: null };
  }

  const affected = [...new Set(pruned.map((r) => r.guideId))];
  const narrowed = await db
    .update(guide)
    .set({ audience: "department" })
    .where(
      and(
        inArray(guide.id, affected),
        eq(guide.audience, "groups"),
        notExists(
          db
            .select({ one: sql`1` })
            .from(guideAudienceGroup)
            .where(eq(guideAudienceGroup.guideId, guide.id)),
        ),
      ),
    )
    .returning({ id: guide.id });

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const note =
    `Pruned ${plural(pruned.length, "audience link")} to deleted groups` +
    (narrowed.length > 0
      ? `; ${plural(narrowed.length, "guide")} fell back to the department audience.`
      : ".");
  return { prunedLinks: pruned.length, narrowedGuides: narrowed.length, note };
}

/**
 * Per-user membership refresh, awaited during sign-in (provisionUser hook).
 * Upserts group stubs before membership rows so a brand-new user is correct
 * even if the full sync has never run.
 */
export async function refreshUserGroups(
  userId: string,
  entraObjectId: string,
): Promise<void> {
  if (!graphConfigured()) return;

  // These membership casts don't support the resourceProvisioningOptions
  // $filter, so select the property and filter client-side instead.
  const [allMemberOf, allOwned] = await Promise.all([
    graphGetAll<GraphGroup>(
      `/users/${entraObjectId}/transitiveMemberOf/microsoft.graph.group?${GROUP_SELECT}&$top=999`,
    ),
    graphGetAll<GraphGroup>(
      `/users/${entraObjectId}/ownedObjects/microsoft.graph.group?${GROUP_SELECT}&$top=999`,
    ),
  ]);
  const memberOf = allMemberOf.filter(isTeamsGroup);
  const owned = allOwned.filter(isTeamsGroup);

  const allGroups = new Map<string, GraphGroup>();
  for (const g of [...memberOf, ...owned]) allGroups.set(g.id, g);

  for (const g of allGroups.values()) {
    await db
      .insert(m365Group)
      .values({
        id: g.id,
        displayName: g.displayName,
        description: g.description,
        mail: g.mail,
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: m365Group.id,
        set: { displayName: g.displayName, syncedAt: new Date(), deletedAt: null },
      });
  }

  const rows = [
    ...memberOf.map((g) => ({
      groupId: g.id,
      entraObjectId,
      role: "member" as const,
    })),
    ...owned.map((g) => ({
      groupId: g.id,
      entraObjectId,
      role: "owner" as const,
    })),
  ];

  await db.transaction(async (tx) => {
    await tx
      .delete(m365GroupMember)
      .where(eq(m365GroupMember.entraObjectId, entraObjectId));
    if (rows.length > 0) {
      await tx.insert(m365GroupMember).values(rows).onConflictDoNothing();
    }
    await tx
      .update(user)
      .set({ groupsSyncedAt: new Date() })
      .where(eq(user.id, userId));
  });
}

/** True if this user's memberships are stale enough to re-fetch on login. */
export function shouldRefreshGroups(
  groupsSyncedAt: Date | null | undefined,
  maxAgeMs = 60 * 60 * 1000,
): boolean {
  if (!groupsSyncedAt) return true;
  return Date.now() - groupsSyncedAt.getTime() > maxAgeMs;
}

/** Groups a set of users belong to — used by permission resolution. */
export async function getMembershipRows(entraObjectId: string) {
  return db
    .select({
      groupId: m365GroupMember.groupId,
      role: m365GroupMember.role,
      isAdminGroup: m365Group.isAdminGroup,
    })
    .from(m365GroupMember)
    .innerJoin(m365Group, eq(m365GroupMember.groupId, m365Group.id))
    .where(
      and(
        eq(m365GroupMember.entraObjectId, entraObjectId),
        isNull(m365Group.deletedAt),
      ),
    );
}
