import Link from "next/link";
import { count, desc, eq, isNotNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  allStaffRequest,
  guideDeletionRequest,
  m365Group,
  space,
  syncRun,
  tag,
} from "@/db/schema";

export default async function AdminDashboard() {
  const [
    recentRuns,
    [pendingRequests],
    [pendingDeletions],
    [tagCount],
    [orphanCount],
  ] = await Promise.all([
    db.select().from(syncRun).orderBy(desc(syncRun.startedAt)).limit(10),
    db
      .select({ n: count() })
      .from(allStaffRequest)
      .where(eq(allStaffRequest.status, "pending")),
    db
      .select({ n: count() })
      .from(guideDeletionRequest)
      .where(eq(guideDeletionRequest.status, "pending")),
    db.select({ n: count() }).from(tag),
    // Spaces nobody can author in: Team deleted or group un-flagged.
    db
      .select({ n: count() })
      .from(space)
      .innerJoin(m365Group, eq(m365Group.id, space.groupId))
      .where(
        or(isNotNull(m365Group.deletedAt), eq(m365Group.isDepartment, false)),
      ),
  ]);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold">Manage</h2>
        <ul className="mt-2 list-disc pl-6 text-sm">
          <li>
            <Link href="/admin/groups" className="text-blue-600 hover:underline">
              M365 groups — flag departments &amp; admin groups, run sync
            </Link>
          </li>
          <li>
            <Link href="/admin/spaces" className="text-blue-600 hover:underline">
              Spaces — inventory, re-home or merge orphaned departments
              {(orphanCount?.n ?? 0) > 0 &&
                ` — ${orphanCount!.n} orphaned`}
            </Link>
          </li>
          <li>
            <Link
              href="/admin/all-staff-requests"
              className="text-blue-600 hover:underline"
            >
              All-staff publish requests
              {(pendingRequests?.n ?? 0) > 0 && ` — ${pendingRequests!.n} pending`}
            </Link>
          </li>
          <li>
            <Link
              href="/admin/deletion-requests"
              className="text-blue-600 hover:underline"
            >
              Guide deletion requests
              {(pendingDeletions?.n ?? 0) > 0 && ` — ${pendingDeletions!.n} pending`}
            </Link>
          </li>
          <li>
            <Link href="/admin/guides" className="text-blue-600 hover:underline">
              All guides — status &amp; audience across every space
            </Link>
          </li>
          <li>
            <Link href="/admin/tags" className="text-blue-600 hover:underline">
              Tags — merge duplicates, rename, delete strays
              {(tagCount?.n ?? 0) > 0 && ` — ${tagCount!.n} tag${tagCount!.n === 1 ? "" : "s"}`}
            </Link>
          </li>
          <li>
            <Link href="/admin/settings" className="text-blue-600 hover:underline">
              Settings — sign-in page text &amp; account label
            </Link>
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Recent directory syncs</h2>
        {recentRuns.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">
            No syncs yet. Run one from the Groups page.
          </p>
        ) : (
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-gray-500">
              <tr>
                <th className="py-1 pr-4">Started</th>
                <th className="py-1 pr-4">Kind</th>
                <th className="py-1 pr-4">Groups</th>
                <th className="py-1 pr-4">Memberships</th>
                <th className="py-1 pr-4">Result</th>
                <th className="py-1">Notes</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((run) => (
                <tr key={run.id} className="border-t">
                  <td className="py-1 pr-4">{run.startedAt.toLocaleString()}</td>
                  <td className="py-1 pr-4">{run.kind}</td>
                  <td className="py-1 pr-4">{run.groupsCount ?? "—"}</td>
                  <td className="py-1 pr-4">{run.membershipsCount ?? "—"}</td>
                  <td className="py-1 pr-4">
                    {run.error ? (
                      <span className="text-red-600">{run.error}</span>
                    ) : run.finishedAt ? (
                      <span className="text-green-700">ok</span>
                    ) : (
                      "running…"
                    )}
                  </td>
                  <td className="py-1 text-gray-500">{run.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
