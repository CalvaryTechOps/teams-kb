import Link from "next/link";
import { asc, desc, eq, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { guide, guideDeletionRequest, space, user } from "@/db/schema";
import { approveGuideDeletion, rejectGuideDeletion } from "./actions";

// Admin queue for owners' guide deletion requests. Titles and space names
// come from the request's snapshot: the guide is hidden while pending and gone
// once approved, so there is nothing to link to except after a rejection.

export default async function DeletionRequestsPage() {
  const decider = alias(user, "decider");

  const [pending, decided] = await Promise.all([
    db
      .select({
        req: guideDeletionRequest,
        requesterName: user.name,
      })
      .from(guideDeletionRequest)
      .innerJoin(user, eq(user.id, guideDeletionRequest.requestedBy))
      .where(eq(guideDeletionRequest.status, "pending"))
      .orderBy(asc(guideDeletionRequest.createdAt)),
    db
      .select({
        req: guideDeletionRequest,
        guideSlug: guide.slug,
        spaceSlug: space.slug,
        deciderName: decider.name,
      })
      .from(guideDeletionRequest)
      .leftJoin(guide, eq(guide.id, guideDeletionRequest.guideId))
      .leftJoin(space, eq(space.id, guideDeletionRequest.spaceId))
      .leftJoin(decider, eq(decider.id, guideDeletionRequest.decidedBy))
      .where(ne(guideDeletionRequest.status, "pending"))
      .orderBy(desc(guideDeletionRequest.decidedAt))
      .limit(10),
  ]);

  return (
    <div>
      <h2 className="text-lg font-semibold">Guide deletion requests</h2>
      <p className="text-sm text-gray-500">
        Owners asking for a guide to be removed. The guide is already hidden
        from everyone. Approving deletes it and its history permanently;
        rejecting restores it as a draft in its space.
      </p>

      {pending.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed p-6 text-sm text-gray-500">
          Nothing waiting — owner requests will appear here.
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {pending.map((r) => (
            <div key={r.req.id} className="rounded-lg border p-4">
              <div className="font-medium">{r.req.guideTitle}</div>
              <div className="text-xs text-gray-500">
                {r.req.spaceName} · requested by {r.requesterName} on{" "}
                {r.req.createdAt.toLocaleDateString()}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <form action={approveGuideDeletion.bind(null, r.req.id)}>
                  <button
                    type="submit"
                    className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Approve — delete permanently
                  </button>
                </form>
                <form
                  action={rejectGuideDeletion.bind(null, r.req.id)}
                  className="flex flex-1 items-center gap-2"
                >
                  <input
                    name="note"
                    placeholder="Reason (kept with the request)"
                    className="w-full min-w-48 flex-1 rounded-md border px-3 py-1.5 text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded-md border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Reject — restore as draft
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
                <th className="py-1 pr-4">Space</th>
                <th className="py-1 pr-4">Decision</th>
                <th className="py-1 pr-4">By</th>
                <th className="py-1">Note</th>
              </tr>
            </thead>
            <tbody>
              {decided.map((r) => (
                <tr key={r.req.id} className="border-t">
                  <td className="py-1.5 pr-4">
                    {r.guideSlug && r.spaceSlug ? (
                      <Link
                        href={`/spaces/${r.spaceSlug}/guides/${r.guideSlug}`}
                        className="text-blue-600 hover:underline"
                      >
                        {r.req.guideTitle}
                      </Link>
                    ) : (
                      r.req.guideTitle
                    )}
                  </td>
                  <td className="py-1.5 pr-4">{r.req.spaceName}</td>
                  <td className="py-1.5 pr-4">
                    {r.req.status === "approved" ? (
                      <span className="text-red-600">deleted</span>
                    ) : (
                      <span className="text-green-700">restored</span>
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
