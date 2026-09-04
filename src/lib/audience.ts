import "server-only";
import { and, asc, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { m365Group } from "@/db/schema";

/**
 * Teams an approver may share a guide with: every live synced group except
 * the space's own (its members already read department guides).
 */
export async function audienceTargetGroups(excludeGroupId: string) {
  return db
    .select({ id: m365Group.id, name: m365Group.displayName })
    .from(m365Group)
    .where(
      and(isNull(m365Group.deletedAt), ne(m365Group.id, excludeGroupId)),
    )
    .orderBy(asc(m365Group.displayName));
}
