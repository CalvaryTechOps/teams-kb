import Link from "next/link";
import { asc, desc, eq, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { guide, guideDeletionRequest, space, user } from "@/db/schema";
import { ButtonLink } from "@/components/ui";
import { ConfirmForm } from "@/components/confirm-form";
import { approveGuideDeletion, rejectGuideDeletion } from "./actions";

// Admin queue for owners' guide deletion requests. Titles and space names
// come from the request's snapshot: the guide is hidden while pending and gone
// once approved. While pending, admins alone may open the guide's page to
// read it (and decide from a banner there); after a rejection everyone can.

export default async function DeletionRequestsPage() {
  const decider = alias(user, "decider");

  const [pending, decided] = await Promise.all([
    db
      .select({
        req: guideDeletionRequest,
        requesterName: user.name,
        guideSlug: guide.slug,
        spaceSlug: space.slug,
      })
      .from(guideDeletionRequest)
      .innerJoin(user, eq(user.id, guideDeletionRequest.requestedBy))
      .leftJoin(guide, eq(guide.id, guideDeletionRequest.guideId))
      .leftJoin(space, eq(space.id, guideDeletionRequest.spaceId))
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
      <p className="text-sm text-fg-muted">
        Owners asking for a guide to be removed. The guide is already hidden
        from everyone; preview it to read what would go. Approving deletes it
        and its history permanently; rejecting puts it back the way it was.
      </p>

      {pending.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border border-dashed p-6 text-sm text-fg-muted">
          Nothing waiting — owner requests will appear here.
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {pending.map((r) => (
            <div key={r.req.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{r.req.guideTitle}</div>
                  <div className="text-xs text-fg-muted">
                    {r.req.spaceName} · requested by {r.requesterName} on{" "}
                    {r.req.createdAt.toLocaleDateString()}
                  </div>
                </div>
                {r.guideSlug && r.spaceSlug && (
                  <ButtonLink
                    href={`/spaces/${r.spaceSlug}/guides/${r.guideSlug}`}
                    variant="secondary"
                    size="sm"
                  >
                    Preview guide
                  </ButtonLink>
                )}
              </div>
              {r.req.reason && (
                <p className="mt-2 text-sm text-fg-muted">
                  Reason: “{r.req.reason}”
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <ConfirmForm
                  action={approveGuideDeletion.bind(null, r.req.id)}
                  message={`Delete "${r.req.guideTitle}" and all of its revisions permanently? This cannot be undone.`}
                >
                  <button
                    type="submit"
                    className="rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-surface-raised hover:bg-danger/90"
                  >
                    Approve — delete permanently
                  </button>
                </ConfirmForm>
                <form
                  action={rejectGuideDeletion.bind(null, r.req.id)}
                  className="flex flex-1 items-center gap-2"
                >
                  <input
                    name="note"
                    placeholder="Reason (kept with the request)"
                    className="w-full min-w-48 flex-1 rounded-md border border-border px-3 py-1.5 text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-border px-3 py-1.5 text-sm text-fg hover:bg-surface"
                  >
                    Reject — restore guide
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <section className="mt-10">
          <h3 className="text-sm font-semibold text-fg">
            Recently decided
          </h3>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-fg-muted">
              <tr>
                <th className="py-1 pr-4">Guide</th>
                <th className="py-1 pr-4">Space</th>
                <th className="py-1 pr-4">Decision</th>
                <th className="py-1 pr-4">By</th>
                <th className="py-1">Reason · Note</th>
              </tr>
            </thead>
            <tbody>
              {decided.map((r) => (
                <tr key={r.req.id} className="border-t border-border">
                  <td className="py-1.5 pr-4">
                    {r.guideSlug && r.spaceSlug ? (
                      <Link
                        href={`/spaces/${r.spaceSlug}/guides/${r.guideSlug}`}
                        className="text-accent-text hover:underline"
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
                      <span className="text-danger">deleted</span>
                    ) : (
                      <span className="text-success">restored</span>
                    )}{" "}
                    <span className="text-fg-muted">
                      {r.req.decidedAt?.toLocaleDateString()}
                    </span>
                  </td>
                  <td className="py-1.5 pr-4">{r.deciderName ?? "—"}</td>
                  <td className="py-1.5 text-fg-muted">
                    {r.req.reason ?? "—"} · {r.req.note ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
