import Link from "next/link";
import { ConfirmForm } from "@/components/confirm-form";
import { SPACE_HEALTH_LABELS, isOrphaned } from "@/lib/space-health";
import { eligibleRehomeGroups, spaceInventory } from "@/lib/space-inventory";
import { deleteSpace, mergeSpace, rehomeSpace } from "./actions";

// Inventory of every space with its health, plus the re-home / merge /
// delete controls (plans/handle-orphaned-spaces.md). Orphaned spaces sort
// first so the ones needing attention are at the top. Moving individual
// categories or guides happens on the space page itself (admin-only icons).

const healthClasses = {
  healthy: "bg-green-100 text-green-800",
  group_deleted: "bg-red-100 text-red-800",
  unflagged: "bg-amber-100 text-amber-800",
} as const;

const selectClasses =
  "h-8 rounded-md border border-gray-300 bg-white px-2 text-xs";
const inputClasses = selectClasses + " min-w-[180px]";
const buttonClasses =
  "h-8 rounded-md border px-3 text-xs font-medium hover:bg-gray-50 disabled:opacity-50";

export default async function AdminSpacesPage() {
  const [rows, rehomeGroups] = await Promise.all([
    spaceInventory(),
    eligibleRehomeGroups(),
  ]);
  const ordered = [...rows].sort(
    (a, b) => Number(isOrphaned(b.health)) - Number(isOrphaned(a.health)),
  );
  const orphaned = rows.filter((r) => isOrphaned(r.health)).length;

  return (
    <div>
      <h2 className="text-lg font-semibold">Spaces</h2>
      <p className="text-sm text-gray-500">
        One space per department. A space is <strong>orphaned</strong> when its
        Team was deleted in Microsoft 365 or the group was un-flagged as a
        department: nobody can author there, though published guides stay
        readable. Re-home it to another department group, merge it into an
        existing space, or delete it once it is empty. To move a single
        category or guide, use the move icons on the space page.
        {orphaned > 0 && (
          <>
            {" "}
            <strong>
              {orphaned} orphaned space{orphaned === 1 ? "" : "s"}.
            </strong>
          </>
        )}
      </p>

      {ordered.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed p-6 text-sm text-gray-500">
          No spaces yet. Flag a group as a department on the Groups page.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {ordered.map((s) => {
            const empty = s.guideCount === 0 && s.categoryCount === 0;
            const others = rows.filter((r) => r.id !== s.id);
            return (
              <li
                key={s.id}
                className={`rounded-lg border p-4 ${
                  isOrphaned(s.health) ? "border-amber-300 bg-amber-50/40" : ""
                }`}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href={`/spaces/${s.slug}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {s.name}
                  </Link>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${healthClasses[s.health]}`}
                  >
                    {SPACE_HEALTH_LABELS[s.health]}
                  </span>
                  <span className="text-xs text-gray-500">
                    {s.guideCount} guide{s.guideCount === 1 ? "" : "s"} ·{" "}
                    {s.categoryCount} categor{s.categoryCount === 1 ? "y" : "ies"}
                  </span>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Group: {s.groupName}
                  {s.groupDeletedAt &&
                    ` — deleted ${s.groupDeletedAt.toLocaleDateString()}`}
                </div>

                <div className="mt-3 flex flex-wrap items-start gap-6">
                  <ConfirmForm
                    action={rehomeSpace.bind(null, s.id)}
                    message={`Re-home “${s.name}” to the group “{choice}”?\n\nIts members will be able to author here and to read this department's guides. URLs stay the same.`}
                    choiceField="groupId"
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span className="text-xs font-medium text-gray-700">
                      Re-home to
                    </span>
                    {rehomeGroups.length === 0 ? (
                      <span className="text-xs text-gray-500">
                        no unclaimed department groups — flag one on the Groups
                        page first
                      </span>
                    ) : (
                      <>
                        <select
                          name="groupId"
                          required
                          defaultValue=""
                          aria-label="Target group"
                          className={selectClasses}
                        >
                          <option value="" disabled>
                            Choose a group…
                          </option>
                          {rehomeGroups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.displayName}
                            </option>
                          ))}
                        </select>
                        <input
                          name="name"
                          defaultValue={s.name}
                          aria-label="Space name after re-homing"
                          className={inputClasses}
                        />
                        <button type="submit" className={buttonClasses}>
                          Re-home
                        </button>
                      </>
                    )}
                  </ConfirmForm>

                  {others.length > 0 && (
                    <ConfirmForm
                      action={mergeSpace.bind(null, s.id)}
                      message={`Merge “${s.name}” into “{choice}”?\n\nEvery category and guide moves there (same-named categories are combined) and “${s.name}” is deleted. Department-audience guides become readable by the other department's members.`}
                      choiceField="targetId"
                      className="flex flex-wrap items-center gap-2"
                    >
                      <span className="text-xs font-medium text-gray-700">
                        Merge into
                      </span>
                      <select
                        name="targetId"
                        required
                        defaultValue=""
                        aria-label="Target space"
                        className={selectClasses}
                      >
                        <option value="" disabled>
                          Choose a space…
                        </option>
                        {others.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                            {isOrphaned(o.health)
                              ? ` (${SPACE_HEALTH_LABELS[o.health]})`
                              : ""}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className={buttonClasses}>
                        Merge
                      </button>
                    </ConfirmForm>
                  )}

                  {empty && (
                    <ConfirmForm
                      action={deleteSpace.bind(null, s.id)}
                      message={`Delete the empty space “${s.name}”? Its URL will stop working.`}
                    >
                      <button
                        type="submit"
                        className={`${buttonClasses} border-red-300 text-red-700 hover:bg-red-50`}
                      >
                        Delete empty space
                      </button>
                    </ConfirmForm>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
