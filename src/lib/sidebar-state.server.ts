import "server-only";
import { cookies } from "next/headers";
import { SIDEBAR_COLLAPSED_COOKIE } from "@/lib/sidebar-state";

/**
 * Whether this browser collapsed the wide-screen sidebar. Absent = shown.
 * Read in the (kb) layout so the first paint already has the sidebar off
 * screen instead of sliding it away after hydration.
 */
export async function getSidebarCollapsed() {
  return (await cookies()).get(SIDEBAR_COLLAPSED_COOKIE)?.value === "1";
}
