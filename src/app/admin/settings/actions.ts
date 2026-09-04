"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { requireAdmin } from "@/lib/permissions";
import {
  isSettingKey,
  normalizeSettingInput,
  SETTING_KEYS,
} from "@/lib/site-settings";

// Admin-editable site copy. Blank or default-equal input deletes the row so
// the code default applies again; anything else is upserted.

const PATH = "/admin/settings";

function bounce(params: Record<string, string>): never {
  redirect(`${PATH}?${new URLSearchParams(params)}`);
}

function revalidateSettingSurfaces() {
  revalidatePath("/sign-in");
  revalidatePath("/", "layout"); // sidebar account label
  revalidatePath(PATH);
}

export async function saveSiteSettings(formData: FormData) {
  const access = await requireAdmin();

  const writes: { key: string; value: string | null }[] = [];
  for (const key of SETTING_KEYS) {
    const result = normalizeSettingInput(key, formData.get(key));
    if (!result.ok) bounce({ error: result.error });
    writes.push({ key, value: result.value });
  }

  await db.transaction(async (tx) => {
    for (const w of writes) {
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

  revalidateSettingSurfaces();
  bounce({ ok: "saved" });
}

export async function resetSiteSetting(formData: FormData) {
  await requireAdmin();
  const key = formData.get("key");
  if (typeof key !== "string" || !isSettingKey(key)) {
    bounce({ error: "Unknown setting." });
  }
  await db.delete(appSetting).where(eq(appSetting.key, key));
  revalidateSettingSurfaces();
  bounce({ ok: "reset" });
}
