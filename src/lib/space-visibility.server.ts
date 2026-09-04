import "server-only";
import { cookies } from "next/headers";
import { SHOW_EMPTY_COOKIE } from "@/lib/space-visibility";

/** Whether this browser asked to see empty departments. Absent = hide. */
export async function getShowEmptyPreference() {
  return (await cookies()).get(SHOW_EMPTY_COOKIE)?.value === "1";
}
