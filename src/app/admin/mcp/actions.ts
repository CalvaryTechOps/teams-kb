"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  appSetting,
  oauthAccessToken,
  oauthClient,
  oauthRefreshToken,
} from "@/db/schema";
import { MCP_SETTING_KEYS, normalizeMcpSettingsInput } from "@/lib/mcp-settings";
import { requireAdmin } from "@/lib/permissions";

// Admin → MCP: runtime settings (app_setting rows; blank or default-equal
// input deletes the row) and the emergency levers — disable a client, revoke
// grants. Access JWTs aren't checked against the database, so a revoked grant
// stops working at the token's expiry (≤ 1 hour); refreshing fails at once.

const PATH = "/admin/mcp";

function bounce(params: Record<string, string>): never {
  redirect(`${PATH}?${new URLSearchParams(params)}`);
}

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function saveMcpSettings(formData: FormData) {
  const access = await requireAdmin();
  const result = normalizeMcpSettingsInput({
    enabled: formData.get("enabled"),
    instructions: formData.get("instructions"),
    maxResults: formData.get("maxResults"),
    draftsEnabled: formData.get("draftsEnabled"),
  });
  if (!result.ok) bounce({ error: result.error });

  await db.transaction(async (tx) => {
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
  revalidatePath(PATH);
  bounce({ ok: "saved" });
}

export async function resetMcpSettings() {
  await requireAdmin();
  await db.transaction(async (tx) => {
    for (const key of Object.values(MCP_SETTING_KEYS)) {
      await tx.delete(appSetting).where(eq(appSetting.key, key));
    }
  });
  revalidatePath(PATH);
  bounce({ ok: "reset" });
}

/** Disable (or re-enable) a client: no new authorizations or tokens. */
export async function setClientDisabled(formData: FormData) {
  await requireAdmin();
  const clientId = str(formData.get("clientId"));
  const disabled = str(formData.get("disabled")) === "true";
  if (!clientId) bounce({ error: "Unknown client." });
  await db
    .update(oauthClient)
    .set({ disabled, updatedAt: new Date() })
    .where(eq(oauthClient.clientId, clientId));
  revalidatePath(PATH);
  bounce({ ok: disabled ? "disabled" : "enabled" });
}

/** Revoke every grant a client holds, for every staff member. */
export async function revokeClientGrants(formData: FormData) {
  await requireAdmin();
  const clientId = str(formData.get("clientId"));
  if (!clientId) bounce({ error: "Unknown client." });
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(oauthRefreshToken)
      .set({ revoked: now })
      .where(and(eq(oauthRefreshToken.clientId, clientId), isNull(oauthRefreshToken.revoked)));
    await tx
      .update(oauthAccessToken)
      .set({ revoked: now })
      .where(and(eq(oauthAccessToken.clientId, clientId), isNull(oauthAccessToken.revoked)));
  });
  revalidatePath(PATH);
  bounce({ ok: "revoked" });
}

/** Revoke one staff member's grant to one client. */
export async function revokeGrant(formData: FormData) {
  await requireAdmin();
  const id = str(formData.get("grantId"));
  if (!id) bounce({ error: "Unknown grant." });
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(oauthRefreshToken)
      .set({ revoked: now })
      .where(and(eq(oauthRefreshToken.id, id), isNull(oauthRefreshToken.revoked)));
    await tx
      .update(oauthAccessToken)
      .set({ revoked: now })
      .where(and(eq(oauthAccessToken.refreshId, id), isNull(oauthAccessToken.revoked)));
  });
  revalidatePath(PATH);
  bounce({ ok: "revoked" });
}
