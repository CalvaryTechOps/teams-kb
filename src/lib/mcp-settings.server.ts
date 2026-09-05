import "server-only";
import { cache } from "react";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import {
  MCP_SETTING_KEYS,
  mergeMcpSettings,
  type McpSettings,
} from "@/lib/mcp-settings";

const KEYS = Object.values(MCP_SETTING_KEYS);

/**
 * Stored rows (one query, cached per request). Fails soft to the code
 * defaults: a database hiccup must not turn into a confusing auth-looking
 * error for an agent — the tool call itself will surface the outage.
 */
const loadRows = cache(async (): Promise<{ key: string; value: unknown }[]> => {
  try {
    return await db
      .select({ key: appSetting.key, value: appSetting.value })
      .from(appSetting)
      .where(inArray(appSetting.key, KEYS));
  } catch (err) {
    console.error("mcp settings unavailable, using defaults", err);
    return [];
  }
});

/** Effective MCP settings: defaults overlaid with whatever admins saved. */
export async function getMcpSettings(): Promise<McpSettings> {
  return mergeMcpSettings(await loadRows());
}
