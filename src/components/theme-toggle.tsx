"use client";

import { MoonIcon, SunIcon } from "@/components/icons";
import { useThemeMode } from "@/components/theme-provider";

// Sun/moon button in the TopBar. Shows the mode you would switch *to*; hidden
// entirely when the admin has turned dark mode off.
export function ThemeToggle() {
  const { mode, darkEnabled, toggle } = useThemeMode();
  if (!darkEnabled) return null;
  const dark = mode === "dark";
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={dark}
      title={label}
      className="rounded-md p-1.5 text-fg-muted hover:bg-surface-sunken hover:text-fg-strong"
    >
      {dark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
    </button>
  );
}
