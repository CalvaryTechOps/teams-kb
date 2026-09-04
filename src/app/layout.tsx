import type { Metadata } from "next";
import localFont from "next/font/local";
import { APP_TITLE } from "@/lib/branding";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${metropolis.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
