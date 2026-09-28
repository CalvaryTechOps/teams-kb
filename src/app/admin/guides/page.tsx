import Link from "next/link";
import { and, asc, eq, exists, sql } from "drizzle-orm";
import { db } from "@/db";
import { guide, guideRevision, space, user } from "@/db/schema";
import {
  GUIDE_FILTERS,
  GUIDE_FILTER_LABELS,
  countByGuideFilter,
  matchesGuideFilter,
  parseGuideFilter,
} from "@/lib/admin-guide-filter";

// Admin overview of every guide across every space (admins see everything),
// narrowed by `?filter=` to one guide status or to guides with a member
// submission waiting for review. The dashboard's "Guides pending review"
// tile lands on the latter.

const audienceLabels = {
  department: "Department",
  groups: "Specific teams",
  all_staff: "All staff",
} as const;

const filterIntro = {
  all: "Every guide in every space, including unpublished ones.",
  pending: "Guides with a member submission waiting for review.",
  draft: "Guides not yet published, or converted back to draft.",
  published: "Guides staff can read today.",
  archived: "Guides taken out of circulation but kept.",
  deleted: "Guides hidden while a deletion request awaits a decision.",
} as const;

export default async function AdminGuidesPage({
  searchParams,
}: PageProps<"/admin/guides">) {
  const [params, guides] = await Promise.all([
    searchParams,
    db
      .select({
        slug: guide.slug,
        title: guide.title,
        status: guide.status,
        audience: guide.audience,
        updatedAt: guide.updatedAt,
        spaceSlug: space.slug,
        spaceName: space.name,
        creatorName: user.name,
        pendingReview: exists(
          db
            .select({ one: sql`1` })
            .from(guideRevision)
            .where(
              and(
                eq(guideRevision.guideId, guide.id),
                eq(guideRevision.status, "pending"),
              ),
            ),
        ).mapWith(Boolean),
      })
      .from(guide)
      .innerJoin(space, eq(space.id, guide.spaceId))
      .innerJoin(user, eq(user.id, guide.createdBy))
      .orderBy(asc(space.name), asc(guide.title)),
  ]);

  const filter = parseGuideFilter(params.filter);
  const counts = countByGuideFilter(guides);
  const shown = guides.filter((g) => matchesGuideFilter(g, filter));

  return (
    <div>
      <h2 className="text-lg font-semibold">All guides</h2>
      <p className="text-sm text-fg-muted">{filterIntro[filter]}</p>

      <nav
        aria-label="Filter guides"
        className="mt-4 flex flex-wrap gap-1.5 text-xs"
      >
        {GUIDE_FILTERS.map((f) => {
          const active = f === filter;
          return (
            <Link
              key={f}
              href={f === "all" ? "/admin/guides" : `/admin/guides?filter=${f}`}
              aria-current={active ? "page" : undefined}
              className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 font-medium transition-colors ${
                active
                  ? "bg-accent-soft-strong text-accent-text"
                  : "text-fg-muted hover:bg-surface-sunken hover:text-fg"
              }`}
            >
              {GUIDE_FILTER_LABELS[f]}
              <span className="tabular-nums opacity-70">{counts[f]}</span>
            </Link>
          );
        })}
      </nav>

      {shown.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border border-dashed p-6 text-sm text-fg-muted">
          {guides.length === 0
            ? "No guides yet."
            : `No guides match “${GUIDE_FILTER_LABELS[filter]}”.`}
        </p>
      ) : (
        <table className="mt-6 w-full text-left text-sm">
          <thead className="text-fg-muted">
            <tr>
              <th className="py-2 pr-4">Guide</th>
              <th className="py-2 pr-4">Space</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Audience</th>
              <th className="py-2 pr-4">Created by</th>
              <th className="py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((g) => (
              <tr key={`${g.spaceSlug}/${g.slug}`} className="border-t border-border">
                <td className="max-w-md py-2 pr-4">
                  {g.status === "deleted" ? (
                    // Hidden everywhere until an admin decides; no page to link to.
                    <span className="text-fg-muted">{g.title}</span>
                  ) : (
                    <Link
                      href={`/spaces/${g.spaceSlug}/guides/${g.slug}`}
                      className="text-accent-text hover:underline"
                    >
                      {g.title}
                    </Link>
                  )}
                </td>
                <td className="py-2 pr-4">{g.spaceName}</td>
                <td className="py-2 pr-4">
                  {g.status === "published" ? (
                    <span className="text-success">published</span>
                  ) : g.status === "deleted" ? (
                    <Link
                      href="/admin/deletion-requests"
                      className="text-danger hover:underline"
                    >
                      pending deletion
                    </Link>
                  ) : (
                    <span className="text-warning">{g.status}</span>
                  )}
                  {g.pendingReview && g.status !== "deleted" && (
                    // Reviewed in the space's queue, where admins may approve.
                    <div>
                      <Link
                        href={`/spaces/${g.spaceSlug}/queue`}
                        className="text-warning hover:underline"
                      >
                        pending review
                      </Link>
                    </div>
                  )}
                </td>
                <td className="py-2 pr-4">{audienceLabels[g.audience]}</td>
                <td className="py-2 pr-4 text-fg-muted">{g.creatorName}</td>
                <td className="py-2 text-fg-muted">
                  {g.updatedAt.toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
