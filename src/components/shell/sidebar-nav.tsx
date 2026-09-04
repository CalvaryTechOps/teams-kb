"use client";

import { startTransition, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/icons";
import { Badge, Switch } from "@/components/ui";
import { isSpaceShown } from "@/lib/space-visibility";
import { setShowEmptyDepartments } from "@/app/(kb)/actions";

export type SidebarSpace = {
  slug: string;
  name: string;
  /** Published guides in this space the current user can read. */
  articleCount: number;
  /** The user is a member or owner of the department's M365 group. */
  isMine: boolean;
  categories: { slug: string; name: string }[];
};

// Departments accordion: the active space starts expanded, cyan chevron marks
// open sections, active rows get the cyan-tinted wash from the mockups. Each
// row ends in a pill with the number of articles the user can open there —
// a muted 0 (not a missing pill) when there is nothing for them.
//
// Departments with nothing to read are hidden unless the "Show empty" switch
// is on (or the user belongs to them). The switch flips locally for an
// instant response and persists through a cookie-setting Server Action,
// which also re-renders the home page grid that shares the preference.
export function SidebarNav({
  spaces,
  initialShowEmpty,
}: {
  spaces: SidebarSpace[];
  initialShowEmpty: boolean;
}) {
  const pathname = usePathname();
  const activeSlug = pathname.match(/^\/spaces\/([^/]+)/)?.[1] ?? null;
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    activeSlug ? { [activeSlug]: true } : {},
  );
  const [showEmpty, setShowEmpty] = useState(initialShowEmpty);

  const shown = spaces.filter((s) =>
    isSpaceShown({ articles: s.articleCount, isMine: s.isMine }, showEmpty),
  );

  const toggleShowEmpty = (next: boolean) => {
    setShowEmpty(next);
    startTransition(() => {
      void setShowEmptyDepartments(next);
    });
  };

  return (
    <div className="flex flex-col gap-px px-2">
      <Switch
        label="Show empty"
        checked={showEmpty}
        onChange={toggleShowEmpty}
        onDark
        className="flex w-full justify-between px-3 pb-2"
      />
      {shown.map((s) => {
        const isActive = s.slug === activeSlug;
        const isOpen = open[s.slug] ?? isActive;
        return (
          <div key={s.slug}>
            <div
              className={`flex items-center gap-1 rounded-lg pr-2 text-sm font-medium ${
                isActive
                  ? "bg-cyan-400/15 text-white"
                  : "text-grey-200 hover:bg-white/5"
              }`}
            >
              <button
                type="button"
                onClick={() =>
                  setOpen((prev) => ({ ...prev, [s.slug]: !isOpen }))
                }
                aria-label={`${isOpen ? "Collapse" : "Expand"} ${s.name}`}
                className="flex h-9 w-8 shrink-0 items-center justify-center rounded-md"
              >
                {isOpen ? (
                  <ChevronDownIcon size={15} className="text-cyan-400" />
                ) : (
                  <ChevronRightIcon size={15} className="text-grey-500" />
                )}
              </button>
              <Link
                href={`/spaces/${s.slug}`}
                className="min-w-0 flex-1 truncate py-2"
              >
                {s.name}
              </Link>
              <Badge
                size="sm"
                onDark
                tone={
                  s.articleCount === 0
                    ? "muted"
                    : isActive
                      ? "brand"
                      : "neutral"
                }
                className="shrink-0"
              >
                {s.articleCount}
                <span className="sr-only">
                  {s.articleCount === 1 ? " article" : " articles"}
                </span>
              </Badge>
            </div>
            {isOpen && s.categories.length > 0 && (
              <div className="flex flex-col gap-px py-1 pl-9">
                {s.categories.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/spaces/${s.slug}#${c.slug}`}
                    className="rounded-md px-2.5 py-1.5 text-[13px] text-grey-300 hover:bg-white/5 hover:text-white"
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {spaces.length === 0 && (
        <p className="px-3 py-2 text-[13px] text-grey-500">
          No departments yet.
        </p>
      )}
      {spaces.length > 0 && shown.length === 0 && (
        <p className="px-3 py-2 text-[13px] leading-snug text-grey-500">
          Nothing to read yet — turn on Show empty to browse every department.
        </p>
      )}
    </div>
  );
}
