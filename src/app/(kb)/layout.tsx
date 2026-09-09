import { AppSidebar } from "@/components/shell/app-sidebar";
import { SidebarShell } from "@/components/shell/sidebar-shell";
import { getSession, requireAccess } from "@/lib/permissions";
import { getSidebarCollapsed } from "@/lib/sidebar-state.server";

export default async function KbLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await requireAccess();
  const session = await getSession();
  const collapsed = await getSidebarCollapsed();

  return (
    <SidebarShell
      initialCollapsed={collapsed}
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
