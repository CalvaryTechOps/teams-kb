import { requireAccess } from "@/lib/permissions";

// Pages meant for paper: no sidebar, no top bar, nothing to hide with print
// CSS. The root layout still supplies the font and theme. Same sign-in gate
// as the app shell.
export default async function PrintLayout({ children }: LayoutProps<"/">) {
  await requireAccess();
  // Browsers drop background colors when printing, so paper stays white.
  return <div className="min-h-dvh bg-surface">{children}</div>;
}
