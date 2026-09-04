"use server";

import { cookies } from "next/headers";
import { SHOW_EMPTY_COOKIE } from "@/lib/space-visibility";

// Persists the sidebar's "Show empty" switch. Setting a cookie inside a
// Server Action makes Next re-render the current page and its layouts, so
// the sidebar and the home grid pick up the new value in the same roundtrip.
export async function setShowEmptyDepartments(show: boolean) {
  const store = await cookies();
  store.set(SHOW_EMPTY_COOKIE, show ? "1" : "0", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}
