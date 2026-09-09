import type { Metadata } from "next";
import localFont from "next/font/local";
import { APP_TITLE } from "@/lib/branding";
import { buildThemeCss } from "@/lib/theme";
import { getTheme, getThemeMode } from "@/lib/theme.server";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

// Metropolis (public domain, https://github.com/dw5/Metropolis) — the app
// typeface. Regular/Medium/Bold/Black plus real italics for guide bodies.
const metropolis = localFont({
  variable: "--font-metropolis",
  src: [
    { path: "../fonts/Metropolis-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/Metropolis-RegularItalic.woff2", weight: "400", style: "italic" },
    { path: "../fonts/Metropolis-Medium.woff2", weight: "500", style: "normal" },
    { path: "../fonts/Metropolis-Bold.woff2", weight: "700", style: "normal" },
    { path: "../fonts/Metropolis-BoldItalic.woff2", weight: "700", style: "italic" },
    { path: "../fonts/Metropolis-Black.woff2", weight: "900", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: {
    default: APP_TITLE,
    template: `%s — ${APP_TITLE}`,
  },
  description: "How-tos, policies and setup guides from every department.",
};

// Theme: the admin palettes become an unlayered <style> that overrides the
// @theme defaults in globals.css, and this browser's light/dark cookie picks
// the block via `data-theme`. Both are read here, in the root layout, so the
// first paint is already right (no inline script, no flash). Every route under
// this layout is dynamic anyway (session, cookies, force-dynamic), so reading
// the DB and cookies here costs no static prerendering.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = await getTheme();
  const mode = await getThemeMode(theme);
  return (
    <html
      lang="en"
      data-theme={mode}
      className={`${metropolis.variable} h-full antialiased`}
    >
      <head>
        <style
          id="kb-theme"
          dangerouslySetInnerHTML={{ __html: buildThemeCss(theme.light, theme.dark) }}
        />
      </head>
      <body className="min-h-full font-sans">
        <ThemeProvider initialMode={mode} darkEnabled={theme.darkEnabled}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
