"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { withTransaction } from "@/db/transaction";
import { appSetting } from "@/db/schema";
import { requireAdmin } from "@/lib/permissions";
import { normalizeThemeInput, THEME_SETTING_KEYS } from "@/lib/theme";

// Admin-editable theme palettes. Each mode is one app_setting row holding
// only the overrides; a mode with none has no row, so the code defaults apply.

const PATH = "/admin/theme";

function bounce(params: Record<string, string>): never {
  redirect(`${PATH}?${new URLSearchParams(params)}`);
}

function revalidateThemeSurfaces() {
  // The root layout renders the theme <style>, so everything re-renders.
  revalidatePath("/", "layout");
  revalidatePath(PATH);
}

export async function saveTheme(formData: FormData) {
  const access = await requireAdmin();

  const result = normalizeThemeInput(formData);
  if (!result.ok) bounce({ error: result.error });

  await withTransaction(async (tx) => {
    for (const w of result.writes) {
      if (w.value === null) {
        await tx.delete(appSetting).where(eq(appSetting.key, w.key));
      } else {
        await tx
          .insert(appSetting)
          .values({ key: w.key, value: w.value, updatedBy: access.userId })
          .onConflictDoUpdate({
            target: appSetting.key,
            set: { value: w.value, updatedAt: new Date(), updatedBy: access.userId },
          });
      }
    }
  });

  revalidateThemeSurfaces();
  bounce({ ok: "saved" });
}

/** Drop every override for one mode so its defaults apply again. */
export async function resetThemeMode(formData: FormData) {
  await requireAdmin();
  const mode = formData.get("mode");
  if (mode !== "light" && mode !== "dark") bounce({ error: "Unknown mode." });
  await db.delete(appSetting).where(eq(appSetting.key, THEME_SETTING_KEYS[mode]));
  revalidateThemeSurfaces();
  bounce({ ok: mode === "light" ? "reset-light" : "reset-dark" });
}
