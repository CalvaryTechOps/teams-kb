"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { guide, guideFavorite } from "@/db/schema";
import { FAVORITES_PATH } from "@/lib/favorites";
import { requireAccess, visibleGuidesWhere } from "@/lib/permissions";
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

// Stars or unstars a guide for the signed-in user (plans/favorites.md). The
// guide must exist and be readable by the caller — a crafted POST can't
// favorite a guide it can't see, nor one hidden by a deletion request.
// Idempotent both ways so a double click or a stale button can't error.
export async function toggleFavorite(guideId: string, next: boolean) {
  const access = await requireAccess();
  const [target] = await db
    .select({ id: guide.id })
    .from(guide)
    .where(and(eq(guide.id, guideId), visibleGuidesWhere(access)))
    .limit(1);
  if (!target) throw new Error("Guide not found");

  if (next) {
    await db
      .insert(guideFavorite)
      .values({ userId: access.userId, guideId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(guideFavorite)
      .where(
        and(eq(guideFavorite.userId, access.userId), eq(guideFavorite.guideId, guideId)),
      );
  }

  // The sidebar pill lives in the (kb) layout; the favorites page lists rows.
  // The guide page itself is dynamic and the button is optimistic.
  revalidatePath(FAVORITES_PATH);
  revalidatePath("/", "layout");
  return { isFavorite: next };
}
