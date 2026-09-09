import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarToggle } from "./sidebar-shell";

export type Crumb = { label: string; href?: string };

// 60px raised bar from the mockups: breadcrumb trail left, contextual
// actions, the light/dark toggle and the user's avatar right.
export function TopBar({
  crumbs,
  actions,
  userName,
}: {
  crumbs: Crumb[];
  actions?: ReactNode;
  userName: string;
}) {
  return (
    <div className="sticky top-0 z-10 flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-border bg-surface-raised px-4 md:px-8">
      <SidebarToggle />
      <nav className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-fg-muted">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={i} className="flex min-w-0 items-center gap-2">
              {i > 0 && <span aria-hidden>/</span>}
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="truncate text-accent-text hover:text-accent-strong"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className={`truncate ${isLast ? "font-medium text-fg-strong" : ""}`}
                >
                  {crumb.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>
      <div className="flex shrink-0 items-center gap-3 pl-4">
        {actions}
        <ThemeToggle />
        <Avatar name={userName} />
      </div>
    </div>
  );
}
