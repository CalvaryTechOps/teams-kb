import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { guide, space, user } from "@/db/schema";

// Admin overview of every guide across every space (admins see everything).

const audienceLabels = {
  department: "Department",
  groups: "Specific teams",
  all_staff: "All staff",
} as const;

export default async function AdminGuidesPage() {
  const guides = await db
    .select({
      slug: guide.slug,
      title: guide.title,
      status: guide.status,
      audience: guide.audience,
      updatedAt: guide.updatedAt,
      spaceSlug: space.slug,
      spaceName: space.name,
      creatorName: user.name,
    })
    .from(guide)
    .innerJoin(space, eq(space.id, guide.spaceId))
    .innerJoin(user, eq(user.id, guide.createdBy))
    .orderBy(asc(space.name), asc(guide.title));

  return (
    <div>
      <h2 className="text-lg font-semibold">All guides</h2>
      <p className="text-sm text-gray-500">
        Every guide in every space, including unpublished ones.
      </p>

      {guides.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed p-6 text-sm text-gray-500">
          No guides yet.
        </p>
      ) : (
        <table className="mt-6 w-full text-left text-sm">
          <thead className="text-gray-500">
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
            {guides.map((g) => (
              <tr key={`${g.spaceSlug}/${g.slug}`} className="border-t">
                <td className="max-w-md py-2 pr-4">
                  {g.status === "deleted" ? (
                    // Hidden everywhere until an admin decides; no page to link to.
                    <span className="text-gray-500">{g.title}</span>
                  ) : (
                    <Link
                      href={`/spaces/${g.spaceSlug}/guides/${g.slug}`}
                      className="text-blue-600 hover:underline"
                    >
                      {g.title}
                    </Link>
                  )}
                </td>
                <td className="py-2 pr-4">{g.spaceName}</td>
                <td className="py-2 pr-4">
                  {g.status === "published" ? (
                    <span className="text-green-700">published</span>
                  ) : g.status === "deleted" ? (
                    <Link
                      href="/admin/deletion-requests"
                      className="text-red-600 hover:underline"
                    >
                      pending deletion
                    </Link>
                  ) : (
                    <span className="text-amber-600">{g.status}</span>
                  )}
                </td>
                <td className="py-2 pr-4">{audienceLabels[g.audience]}</td>
                <td className="py-2 pr-4 text-gray-500">{g.creatorName}</td>
                <td className="py-2 text-gray-500">
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
