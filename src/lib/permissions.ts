import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, exists, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { guide, guideAudienceGroup, space, user } from "@/db/schema";
import { getMembershipRows } from "@/lib/graph-sync";
import { buildUserAccess, type UserAccess } from "@/lib/user-access";

// ---------------------------------------------------------------------------
// THE authorization module. Nothing else in the app compares group ids.
// Every server action and gated page calls into here first — the proxy.ts
// cookie check is only an optimistic gate. The MCP endpoint has no cookie:
// it resolves the same access context from the user id in a verified token
// (getUserAccessById) and then uses exactly the same helpers below.
// ---------------------------------------------------------------------------

export type { UserAccess } from "@/lib/user-access";

/** Current session (user name/email for the shell). Cached per request. */
export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

async function accessFor(
  userId: string,
  entraObjectId: string | null,
): Promise<UserAccess> {
  return buildUserAccess({
    userId,
    entraObjectId,
    rows: entraObjectId ? await getMembershipRows(entraObjectId) : [],
    bootstrapAdminGroupId: process.env.KB_BOOTSTRAP_ADMIN_GROUP_ID,
  });
}

/** Current user's access context. Null when signed out. Cached per request. */
export const getUserAccess = cache(async (): Promise<UserAccess | null> => {
  const session = await getSession();
  if (!session) return null;
  return accessFor(session.user.id, session.user.entraObjectId ?? null);
});

/**
 * Access context for a user id that arrived in a verified bearer token (MCP).
 * Null when the user row no longer exists — the caller answers 401.
 */
export async function getUserAccessById(
  userId: string,
): Promise<UserAccess | null> {
  const [row] = await db
    .select({ id: user.id, entraObjectId: user.entraObjectId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row) return null;
  return accessFor(row.id, row.entraObjectId ?? null);
}

/** For pages: redirect signed-out users to sign-in. */
export async function requireAccess(): Promise<UserAccess> {
  const access = await getUserAccess();
  if (!access) redirect("/sign-in");
  return access;
}

/** For admin pages/actions: non-admins are sent home. */
export async function requireAdmin(): Promise<UserAccess> {
  const access = await requireAccess();
  if (!access.isAdmin) redirect("/");
  return access;
}

// ---------------------------------------------------------------------------
// Guide-level permissions. The pure resolver lives in guide-permissions.ts
// (importable by unit tests); this module adds the SQL mirror of it.
// ---------------------------------------------------------------------------

export {
  canAuthorInSpace,
  resolveGuidePermissions,
  type GuideForPermissions,
  type GuidePermissions,
} from "@/lib/guide-permissions";

/** Every group id the user belongs to in any capacity. */
function allGroupIds(access: UserAccess): string[] {
  return [...new Set([...access.memberGroupIds, ...access.ownerGroupIds])];
}

/**
 * Composable WHERE fragment applied to EVERY guide list/search query. Mirrors
 * resolveGuidePermissions in SQL: space owners see everything in their space;
 * members see its published guides plus their own unpublished ones; everyone
 * else sees only published guides whose audience reaches them. Guides awaiting
 * deletion approval are excluded for everyone, admins included.
 */
export function visibleGuidesWhere(access: UserAccess): SQL {
  const notDeleted = ne(guide.status, "deleted");
  if (access.isAdmin) return notDeleted;

  const groupIds = allGroupIds(access);
  const ownerIds = [...access.ownerGroupIds];

  const spaceGroupIn = (ids: string[]): SQL =>
    ids.length === 0
      ? sql`false`
      : exists(
          db
            .select({ one: sql`1` })
            .from(space)
            .where(
              and(eq(space.id, guide.spaceId), inArray(space.groupId, ids)),
            ),
        );

  const sharedWithMyGroups =
    groupIds.length === 0
      ? sql`false`
      : exists(
          db
            .select({ one: sql`1` })
            .from(guideAudienceGroup)
            .where(
              and(
                eq(guideAudienceGroup.guideId, guide.id),
                inArray(guideAudienceGroup.groupId, groupIds),
              ),
            ),
        );

  return and(
    notDeleted,
    or(
      spaceGroupIn(ownerIds),
      and(
        spaceGroupIn(groupIds),
        or(
          eq(guide.status, "published"),
          eq(guide.createdBy, access.userId),
        ),
      ),
      and(
        eq(guide.status, "published"),
        or(
          eq(guide.audience, "all_staff"),
          and(eq(guide.audience, "groups"), sharedWithMyGroups),
        ),
      ),
    ),
  )!;
}
