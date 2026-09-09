import "server-only";
import { cache } from "react";
import { inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import {
  mergeTheme,
  parseThemeMode,
  THEME_COOKIE,
  THEME_SETTING_KEYS,
  type ThemeMode,
  type ThemeSettings,
} from "@/lib/theme";

const KEYS = Object.values(THEME_SETTING_KEYS);

/**
 * Stored rows (one query, cached per request). Fails soft to the code
 * defaults: the sign-in page must render even if the database is down.
 */
const loadRows = cache(async (): Promise<{ key: string; value: unknown }[]> => {
  try {
    return await db
      .select({ key: appSetting.key, value: appSetting.value })
      .from(appSetting)
      .where(inArray(appSetting.key, KEYS));
  } catch (err) {
    console.error("theme settings unavailable, using defaults", err);
    return [];
  }
});

/** Effective palettes and kill switch: defaults overlaid with admin saves. */
export async function getTheme(): Promise<ThemeSettings> {
  return mergeTheme(await loadRows());
}

/**
 * This browser's mode. Absent cookie = light. When the admin has turned dark
 * mode off, every browser gets light regardless of what its cookie says.
 */
export async function getThemeMode(theme: ThemeSettings): Promise<ThemeMode> {
  if (!theme.darkEnabled) return "light";
  return parseThemeMode((await cookies()).get(THEME_COOKIE)?.value);
}
