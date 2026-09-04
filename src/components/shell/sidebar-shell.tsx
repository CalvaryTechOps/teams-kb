"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { MenuIcon, XIcon } from "@/components/icons";

const SidebarContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("Sidebar controls must be rendered inside SidebarShell");
  }
  return ctx;
}

// Static sidebar on md+ screens; below that it becomes an off-canvas drawer
// opened from the TopBar hamburger. The server-rendered sidebar crosses the
// client boundary as the `sidebar` prop.
export function SidebarShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Any navigation (space link, search submit) closes the drawer.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      <div className="flex min-h-screen">
        {open && (
          <div
            className="fixed inset-0 z-30 bg-ink/60 md:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
        )}
        <div
          className={`fixed inset-y-0 left-0 z-40 shrink-0 transition-transform duration-200 md:sticky md:top-0 md:h-dvh md:translate-x-0 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {sidebar}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </SidebarContext.Provider>
  );
}

export function SidebarToggle() {
  const { setOpen } = useSidebar();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open navigation"
      className="-ml-1 rounded-md p-1.5 text-grey-500 hover:bg-grey-100 hover:text-ink md:hidden"
    >
      <MenuIcon size={18} />
    </button>
  );
}

export function SidebarClose() {
  const { setOpen } = useSidebar();
  return (
    <button
      type="button"
      onClick={() => setOpen(false)}
      aria-label="Close navigation"
      className="rounded-md p-1.5 text-grey-400 hover:bg-white/10 hover:text-white md:hidden"
    >
      <XIcon size={16} />
    </button>
  );
}
