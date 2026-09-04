import { listTagsWithCounts } from "@/lib/tags";
import { TagsTable } from "./tags-table";

// Tag hygiene for admins: every tag with its guide count, plus merge /
// rename / delete. Outcomes come back as query params from the actions so a
// plain redirect can show a one-line notice.

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function AdminTagsPage({
  searchParams,
}: PageProps<"/admin/tags">) {
  const params = await searchParams;
  const tags = await listTagsWithCounts();

  const error = first(params.error);
  const notice = first(params.merged)
    ? `Merged ${first(params.merged)} tag${first(params.merged) === "1" ? "" : "s"} into “${first(params.into)}” (${first(params.guides)} guide${first(params.guides) === "1" ? "" : "s"} updated).`
    : first(params.renamed)
      ? `Renamed “${first(params.renamed)}” to “${first(params.to)}”.`
      : first(params.deleted)
        ? `Deleted “${first(params.deleted)}”.`
        : "";

  return (
    <div>
      <h2 className="text-lg font-semibold">Tags</h2>
      <p className="text-sm text-gray-500">
        Tags are global across every space. Tick the duplicates and merge them
        into the tag that should survive — every guide carrying a merged tag is
        re-pointed at the survivor. Tags no guide uses are removed automatically.
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
          {notice}
        </p>
      )}

      {tags.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed p-6 text-sm text-gray-500">
          No tags yet. Tags appear here once a guide is saved with one.
        </p>
      ) : (
        <div className="mt-6">
          <TagsTable tags={tags} />
        </div>
      )}
    </div>
  );
}
