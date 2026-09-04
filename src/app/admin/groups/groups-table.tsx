"use client";

import { FilterableList } from "@/components/filterable-list";
import { setAdminGroupFlag, setDepartmentFlag } from "./actions";

// Client half of /admin/groups: the flag toggles still post straight to the
// server actions; the only client state is the filter box, which survives
// the revalidation each toggle triggers.

export type AdminGroupRow = {
  id: string;
  displayName: string;
  description: string | null;
  mail: string | null;
  isDepartment: boolean;
  isAdminGroup: boolean;
};

export function GroupsTable({ groups }: { groups: AdminGroupRow[] }) {
  return (
    <FilterableList
      items={groups}
      getLabel={(g) => g.displayName}
      noun="groups"
      placeholder="Filter groups…"
      aside={`${groups.length} synced`}
    >
      {(visible) => (
        <table className="w-full text-left text-sm">
          <thead className="text-gray-500">
            <tr>
              <th className="py-2 pr-4">Group</th>
              <th className="py-2 pr-4">Mail</th>
              <th className="py-2 pr-4">Department</th>
              <th className="py-2">Admin group</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((g) => (
              <tr key={g.id} className="border-t">
                <td className="py-2 pr-4">
                  <div className="font-medium">{g.displayName}</div>
                  {g.description && (
                    <div className="text-xs text-gray-500">{g.description}</div>
                  )}
                </td>
                <td className="py-2 pr-4 text-gray-500">{g.mail ?? "—"}</td>
                <td className="py-2 pr-4">
                  <form
                    action={setDepartmentFlag.bind(null, g.id, !g.isDepartment)}
                  >
                    <button
                      type="submit"
                      className={
                        g.isDepartment
                          ? "rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800"
                          : "rounded-full border px-3 py-1 text-xs text-gray-500 hover:bg-gray-50"
                      }
                    >
                      {g.isDepartment ? "Department ✓" : "Make department"}
                    </button>
                  </form>
                </td>
                <td className="py-2">
                  <form
                    action={setAdminGroupFlag.bind(null, g.id, !g.isAdminGroup)}
                  >
                    <button
                      type="submit"
                      className={
                        g.isAdminGroup
                          ? "rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-800"
                          : "rounded-full border px-3 py-1 text-xs text-gray-500 hover:bg-gray-50"
                      }
                    >
                      {g.isAdminGroup ? "Admin ✓" : "Make admin"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </FilterableList>
  );
}
