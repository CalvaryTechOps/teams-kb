import "server-only";
import { cache } from "react";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import {
  mergeSettings,
  SETTING_DEFAULTS,
  type SettingKey,
  type SiteSettings,
} from "@/lib/site-settings";

/**
 * Stored rows (one query, cached per request). Fails soft: the sign-in page
 * must render even if the database is down, so any error yields no rows.
 */
const loadRows = cache(async (): Promise<{ key: string; value: unknown }[]> => {
  try {
    return await db
      .select({ key: appSetting.key, value: appSetting.value })
      .from(appSetting);
  } catch (err) {
    console.error("site settings unavailable, using defaults", err);
    return [];
  }
});

/** Effective copy: defaults overlaid with whatever admins saved. */
export async function getSiteSettings(): Promise<SiteSettings> {
  return mergeSettings(await loadRows());
}

/** For the admin form: effective values plus which keys are customized. */
export async function getSiteSettingsDetailed(): Promise<{
  values: SiteSettings;
  customized: Set<SettingKey>;
}> {
  const rows = await loadRows();
  const values = mergeSettings(rows);
  const customized = new Set<SettingKey>();
  for (const key of Object.keys(SETTING_DEFAULTS) as SettingKey[]) {
    if (values[key] !== SETTING_DEFAULTS[key]) customized.add(key);
  }
  return { values, customized };
}
