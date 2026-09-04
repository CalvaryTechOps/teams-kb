"use client";

import { useState } from "react";
import { FilterableCheckboxList } from "@/components/filterable-list";

// Owner-only audience control on the guide form. Strictly group-based:
// sharing targets whole Teams, never individual people. The server ignores
// these fields entirely for non-approvers.

export type AudienceValue = "department" | "groups" | "all_staff";

const radioClasses = "mt-0.5 h-4 w-4 shrink-0 accent-cyan-600";

export function AudiencePicker({
  spaceName,
  groups,
  defaultAudience,
  defaultGroupIds,
  isAdmin,
  hasPendingAllStaffRequest,
}: {
  spaceName: string;
  /** Candidate target Teams (the space's own group excluded). */
  groups: { id: string; name: string }[];
  defaultAudience: AudienceValue;
  defaultGroupIds: string[];
  isAdmin: boolean;
  hasPendingAllStaffRequest?: boolean;
}) {
  const [audience, setAudience] = useState<AudienceValue>(defaultAudience);

  const options: {
    value: AudienceValue;
    label: string;
    detail: string;
  }[] = [
    {
      value: "department",
      label: `${spaceName} only`,
      detail: "Visible to members of this department.",
    },
    {
      value: "groups",
      label: "Specific teams",
      detail: "Pick the Teams whose members can also read it.",
    },
    {
      value: "all_staff",
      label: "All staff",
      detail: isAdmin
        ? "Visible to everyone in the organization."
        : "Takes effect once an admin approves the request.",
    },
  ];

  return (
    <fieldset className="rounded-lg border border-grey-300 bg-white px-3.5 py-3">
      <legend className="px-1 text-sm font-medium text-ink">
        Who can read this guide?
      </legend>
      <div className="flex flex-col gap-2.5">
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-start gap-2.5"
          >
            <input
              type="radio"
              name="audience"
              value={opt.value}
              checked={audience === opt.value}
              onChange={() => setAudience(opt.value)}
              className={radioClasses}
            />
            <span>
              <span className="block text-sm font-medium text-ink">
                {opt.label}
              </span>
              <span className="block text-xs text-grey-500">{opt.detail}</span>
            </span>
          </label>
        ))}
      </div>

      {audience === "groups" && (
        <div className="mt-3 border-t border-grey-200 pt-3">
          {groups.length === 0 ? (
            <p className="text-xs text-grey-500">
              No other Teams have been synced yet.
            </p>
          ) : (
            <FilterableCheckboxList
              items={groups}
              name="audienceGroupIds"
              defaultSelectedIds={defaultGroupIds}
              noun="teams"
              placeholder="Filter teams…"
              columns={1}
              maxHeightClass="max-h-80"
            />
          )}
        </div>
      )}

      {hasPendingAllStaffRequest && (
        <p className="mt-3 border-t border-grey-200 pt-3 text-xs text-warning">
          An all-staff request for this guide is already awaiting admin
          approval.
        </p>
      )}
    </fieldset>
  );
}
