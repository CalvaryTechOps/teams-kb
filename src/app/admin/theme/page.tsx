import { customizedTokens } from "@/lib/theme";
import { getTheme } from "@/lib/theme.server";
import { ThemeEditor } from "./theme-editor";

// Light and dark palettes for the whole KB, edited as the semantic tokens
// every component is built from (src/lib/theme.ts). Users pick which palette
// they see with the toggle in the top bar; admins can switch dark mode off.

const MESSAGES: Record<string, string> = {
  saved: "Saved. Everyone sees the new colors on their next page load.",
  "reset-light": "Light mode reset to the defaults.",
  "reset-dark": "Dark mode reset to the defaults.",
};

export default async function ThemePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const [theme, params] = await Promise.all([getTheme(), searchParams]);

  return (
    <div className="max-w-6xl">
      <h2 className="text-lg font-semibold">Theme</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Colors for light mode and dark mode. Every color is one of the tokens
        the app is built from, so a change here reaches every page. Body text
        must stay readable (at least 4.5:1 contrast on its background) or the
        save is refused; other pairs only warn.
      </p>

      {params.ok && MESSAGES[params.ok] && (
        <p className="mt-4 rounded-md bg-success-soft px-3 py-2 text-sm text-success">
          {MESSAGES[params.ok]}
        </p>
      )}
      {params.error && (
        <p className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {params.error}
        </p>
      )}

      <ThemeEditor
        initial={{ light: theme.light, dark: theme.dark }}
        initialDarkEnabled={theme.darkEnabled}
        stored={{
          light: [...customizedTokens("light", theme.light)],
          dark: [...customizedTokens("dark", theme.dark)],
        }}
      />
    </div>
  );
}
