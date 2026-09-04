import Link from "next/link";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { allStaffRequest, guide, space, user } from "@/db/schema";
import { approveAllStaffRequest, rejectAllStaffRequest } from "./actions";

// Admin queue for owners' "publish to all staff" requests.

export default async function AllStaffRequestsPage() {
  const decider = alias(user, "decider");

  const [pending, decided] = await Promise.all([
    db
      .select({
        req: allStaffRequest,
        guideTitle: guide.title,
        guideSlug: guide.slug,
        guideStatus: guide.status,
        spaceSlug: space.slug,
        spaceName: space.name,
        requesterName: user.name,
      })
      .from(allStaffRequest)
      .innerJoin(guide, eq(guide.id, allStaffRequest.guideId))
      .innerJoin(space, eq(space.id, guide.spaceId))
      .innerJoin(user, eq(user.id, allStaffRequest.requestedBy))
      .where(
        and(
          eq(allStaffRequest.status, "pending"),
          ne(guide.status, "deleted"),
        ),
      )
      .orderBy(asc(allStaffRequest.createdAt)),
    db
      .select({
        req: allStaffRequest,
        guideTitle: guide.title,
        guideSlug: guide.slug,
        spaceSlug: space.slug,
        deciderName: decider.name,
      })
      .from(allStaffRequest)
      .innerJoin(guide, eq(guide.id, allStaffRequest.guideId))
      .innerJoin(space, eq(space.id, guide.spaceId))
      .leftJoin(decider, eq(decider.id, allStaffRequest.decidedBy))
      .where(ne(allStaffRequest.status, "pending"))
      .orderBy(desc(allStaffRequest.decidedAt))
      .limit(10),
  ]);

  return (
    <div>
      <h2 className="text-lg font-semibold">All-staff publish requests</h2>
      <p className="text-sm text-gray-500">
        Owners asking for a guide to be visible to everyone. Approving flips
        the guide&apos;s audience to all staff immediately.
      </p>

      {pending.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed p-6 text-sm text-gray-500">
          Nothing waiting — owner requests will appear here.
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {pending.map((r) => (
            <div key={r.req.id} className="rounded-lg border p-4">
              <Link
                href={`/spaces/${r.spaceSlug}/guides/${r.guideSlug}`}
                className="font-medium text-blue-600 hover:underline"
              >
                {r.guideTitle}
              </Link>
              <div className="text-xs text-gray-500">
                {r.spaceName} · requested by {r.requesterName} on{" "}
                {r.req.createdAt.toLocaleDateString()}
                {r.guideStatus !== "published" && " · guide not yet published"}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <form action={approveAllStaffRequest.bind(null, r.req.id)}>
                  <button
                    type="submit"
                    className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                  >
                    Approve — publish to all staff
                  </button>
                </form>
                <form
                  action={rejectAllStaffRequest.bind(null, r.req.id)}
                  className="flex flex-1 items-center gap-2"
                >
                  <input
                    name="note"
                    placeholder="Reason (shown to the owner)"
                    className="w-full min-w-48 flex-1 rounded-md border px-3 py-1.5 text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded-md border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Reject
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <section className="mt-10">
          <h3 className="text-sm font-semibold text-gray-700">
            Recently decided
          </h3>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-gray-500">
              <tr>
                <th className="py-1 pr-4">Guide</th>
                <th className="py-1 pr-4">Decision</th>
                <th className="py-1 pr-4">By</th>
                <th className="py-1">Note</th>
              </tr>
            </thead>
            <tbody>
              {decided.map((r) => (
                <tr key={r.req.id} className="border-t">
                  <td className="py-1.5 pr-4">
                    <Link
                      href={`/spaces/${r.spaceSlug}/guides/${r.guideSlug}`}
                      className="text-blue-600 hover:underline"
                    >
                      {r.guideTitle}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-4">
                    {r.req.status === "approved" ? (
                      <span className="text-green-700">approved</span>
                    ) : (
                      <span className="text-red-600">rejected</span>
                    )}{" "}
                    <span className="text-gray-500">
                      {r.req.decidedAt?.toLocaleDateString()}
                    </span>
                  </td>
                  <td className="py-1.5 pr-4">{r.deciderName ?? "—"}</td>
                  <td className="py-1.5 text-gray-500">{r.req.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
