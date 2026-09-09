"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { MenuIcon, PanelLeftCloseIcon, XIcon } from "@/components/icons";
import {
  SIDEBAR_COLLAPSED_COOKIE,
  SIDEBAR_ID,
  SIDEBAR_SEARCH_ID,
  WIDE_QUERY,
  shortcutFor,
  toggleShortcutLabel,
} from "@/lib/sidebar-state";

type SidebarContextValue = {
  /** Narrow screens: the overlay drawer is open. Never persisted. */
  drawerOpen: boolean;
  /** Wide screens: the user slid the column off-screen. Persisted in a cookie. */
  collapsed: boolean;
  /** Viewport is at or above `md`; `null` until hydrated. */
  wide: boolean | null;
  isMac: boolean;
  show: () => void;
  hide: () => void;
  toggle: () => void;
  focusSearch: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("Sidebar controls must be rendered inside SidebarShell");
  }
  return ctx;
}

// `null` on the server and during hydration so SSR markup never depends on
// the viewport; the real answer arrives with the first client render.
function useMediaQuery(query: string): boolean | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => null,
  );
}

const noopSubscribe = () => () => {};
function useIsMac() {
  return useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  );
}

// Actions read the viewport at call time rather than from render state so
// the keydown listener can hold stable callbacks.
const isWide = () => window.matchMedia(WIDE_QUERY).matches;

// Static column on md+ screens that the user can slide off-screen (and the
// choice sticks); below md it becomes an off-canvas drawer opened from the
// TopBar hamburger. The server-rendered sidebar crosses the client boundary
// as the `sidebar` prop.
export function SidebarShell({
  sidebar,
  initialCollapsed = false,
  children,
}: {
  sidebar: ReactNode;
  initialCollapsed?: boolean;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  // Bumped by `/`; the focus effect below tracks which request it served.
  const [focusRequest, setFocusRequest] = useState(0);
  const servedFocusRequest = useRef(0);
  const wide = useMediaQuery(WIDE_QUERY);
  const isMac = useIsMac();
  const pathname = usePathname();

  // Any navigation (space link, search submit) closes the drawer. The
  // wide-screen collapse deliberately survives navigation.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setDrawerOpen(false);
  }

  // Persist the wide-screen preference. Written client-side rather than via
  // a Server Action: nothing server-rendered depends on it except the first
  // paint, so a round-trip would only make the toggle feel laggy.
  const writtenCollapsed = useRef(initialCollapsed);
  useEffect(() => {
    if (writtenCollapsed.current === collapsed) return;
    writtenCollapsed.current = collapsed;
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${collapsed ? "1" : "0"}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`;
  }, [collapsed]);

  const show = useCallback(() => {
    if (isWide()) setCollapsed(false);
    else setDrawerOpen(true);
  }, []);
  const hide = useCallback(() => {
    if (isWide()) setCollapsed(true);
    else setDrawerOpen(false);
  }, []);
  const toggle = useCallback(() => {
    if (isWide()) setCollapsed((c) => !c);
    else setDrawerOpen((o) => !o);
  }, []);
  const focusSearch = useCallback(() => {
    show();
    setFocusRequest((n) => n + 1);
  }, [show]);

  // Whether the sidebar is on screen at the current width. Unknown before
  // hydration, in which case nothing is made inert.
  const visible = wide === null ? null : wide ? !collapsed : drawerOpen;

  // `/` may have had to reveal the sidebar first; focus once it is no longer
  // inert (same commit that removes the attribute, so focus is allowed).
  useEffect(() => {
    if (servedFocusRequest.current === focusRequest || visible === false) return;
    servedFocusRequest.current = focusRequest;
    const el = document.getElementById(SIDEBAR_SEARCH_ID);
    if (el instanceof HTMLInputElement) {
      el.focus({ preventScroll: true });
      el.select();
    }
  }, [focusRequest, visible]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (shortcutFor(e)) {
        case "toggle":
          e.preventDefault();
          toggle();
          break;
        case "search":
          e.preventDefault();
          focusSearch();
          break;
        case "escape":
          setDrawerOpen(false);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, focusSearch]);

  return (
    <SidebarContext.Provider
      value={{
        drawerOpen,
        collapsed,
        wide,
        isMac,
        show,
        hide,
        toggle,
        focusSearch,
      }}
    >
      <div className="flex min-h-screen">
        {drawerOpen && (
          <div
            className="fixed inset-0 z-30 bg-ink/60 md:hidden"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
        )}
        {/* Outer: drawer translate below md; sticky column whose width
            animates 268px→0 on md+ so the content reflows. Inner: slides
            the column itself off to the left on md+ while the outer
            narrows, so it reads as a slide rather than a curtain. */}
        <div
          id={SIDEBAR_ID}
          inert={visible === false}
          className={`fixed inset-y-0 left-0 z-40 shrink-0 transition-[width,transform] duration-200 motion-reduce:transition-none md:sticky md:top-0 md:h-dvh md:overflow-hidden ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          } ${collapsed ? "md:w-0" : "md:w-[268px]"} md:translate-x-0`}
        >
          <div
            className={`h-full w-[268px] transition-transform duration-200 motion-reduce:transition-none ${
              collapsed ? "md:-translate-x-full" : "md:translate-x-0"
            }`}
          >
            {sidebar}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </SidebarContext.Provider>
  );
}

// Hamburger in the TopBar. Always present below md; on md+ only while the
// column is collapsed, since the collapse control lives in the sidebar
// itself. It only ever *shows* the sidebar, so no aria-expanded is needed.
export function SidebarToggle() {
  const { collapsed, wide, isMac, show } = useSidebar();
  const label = wide ? "Show sidebar" : "Open navigation";
  return (
    <button
      type="button"
      onClick={show}
      aria-label={label}
      aria-controls={SIDEBAR_ID}
      title={`${label} (${toggleShortcutLabel(isMac)})`}
      className={`-ml-1 rounded-md p-1.5 text-grey-500 hover:bg-grey-100 hover:text-ink ${
        collapsed ? "" : "md:hidden"
      }`}
    >
      <MenuIcon size={18} />
    </button>
  );
}

// In the sidebar header at every width: an X while it is an overlay (below
// md), a panel-collapse glyph once it is a persistent column.
export function SidebarClose() {
  const { wide, isMac, hide } = useSidebar();
  const label = wide ? "Collapse sidebar" : "Close navigation";
  return (
    <button
      type="button"
      onClick={hide}
      aria-label={label}
      title={`${label} (${toggleShortcutLabel(isMac)})`}
      className="rounded-md p-1.5 text-grey-400 hover:bg-white/10 hover:text-white"
    >
      <XIcon size={16} className="md:hidden" />
      <PanelLeftCloseIcon size={16} className="hidden md:block" />
    </button>
  );
}
