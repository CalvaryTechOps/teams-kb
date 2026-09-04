import { asc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { m365Group } from "@/db/schema";
import { syncNow } from "./actions";
import { GroupsTable } from "./groups-table";

export default async function AdminGroupsPage() {
  const groups = await db
    .select({
      id: m365Group.id,
      displayName: m365Group.displayName,
      description: m365Group.description,
      mail: m365Group.mail,
      isDepartment: m365Group.isDepartment,
      isAdminGroup: m365Group.isAdminGroup,
    })
    .from(m365Group)
    .where(isNull(m365Group.deletedAt))
    .orderBy(asc(m365Group.displayName));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">M365 groups</h2>
          <p className="text-sm text-gray-500">
            Flag a group as a <strong>Department</strong> to give it a space in
            the knowledgebase. Members of <strong>Admin</strong> groups are KB
            admins.
          </p>
        </div>
        <form action={syncNow}>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Sync from Entra now
          </button>
        </form>
      </div>

      {groups.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed p-6 text-sm text-gray-500">
          No groups synced yet. Click “Sync from Entra now” (requires the Graph
          env vars to be configured).
        </p>
      ) : (
        <div className="mt-6">
          <GroupsTable groups={groups} />
        </div>
      )}
    </div>
  );
}
