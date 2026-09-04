import { AppSidebar } from "@/components/shell/app-sidebar";
import { SidebarShell } from "@/components/shell/sidebar-shell";
import { getSession, requireAccess } from "@/lib/permissions";

export default async function KbLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await requireAccess();
  const session = await getSession();

  return (
    <SidebarShell
      sidebar={
        <AppSidebar
          userName={session?.user.name ?? "Staff"}
          isAdmin={access.isAdmin}
        />
      }
    >
      {children}
    </SidebarShell>
  );
}
