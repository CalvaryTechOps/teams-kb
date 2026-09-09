"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { THEME_COOKIE, type ThemeMode } from "@/lib/theme";

type ThemeContextValue = {
  mode: ThemeMode;
  /** Whether the admin allows dark mode at all (hides the toggle when false). */
  darkEnabled: boolean;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const noop = () => {};
// Outside the provider (server-rendered tests, isolated previews) the default
// is the default theme: light, with the toggle allowed.
const FALLBACK: ThemeContextValue = {
  mode: "light",
  darkEnabled: true,
  setMode: noop,
  toggle: noop,
};

/** Current light/dark mode; for the editor and diagrams that theme themselves. */
export function useThemeMode(): ThemeContextValue {
  return useContext(ThemeContext) ?? FALLBACK;
}

function applyMode(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
}

// Owns the browser's light/dark choice. The server already rendered
// `data-theme` on <html> from the cookie (src/lib/theme.server.ts), so the
// first paint is right without an inline script; switching sets the attribute
// and the cookie directly — no round trip, nothing server-rendered depends on
// it beyond that first paint (same reasoning as the sidebar collapse cookie).
export function ThemeProvider({
  initialMode,
  darkEnabled,
  children,
}: {
  initialMode: ThemeMode;
  darkEnabled: boolean;
  children: ReactNode;
}) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);

  // React's dev Strict Mode remount resets <html> attributes it does not own
  // from JSX; re-applying before paint keeps the DOM in step with state. A
  // no-op in production.
  useLayoutEffect(() => {
    applyMode(mode);
  }, [mode]);

  const setMode = useCallback(
    (next: ThemeMode) => {
      if (!darkEnabled) next = "light";
      setModeState(next);
      applyMode(next);
      const secure = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`;
    },
    [darkEnabled],
  );
  const toggle = useCallback(
    () => setMode(mode === "dark" ? "light" : "dark"),
    [mode, setMode],
  );

  return (
    <ThemeContext.Provider value={{ mode, darkEnabled, setMode, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
