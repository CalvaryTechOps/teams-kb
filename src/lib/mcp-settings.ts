// Admin-editable MCP settings, stored as app_setting rows under `mcp.*` keys.
// Pure helpers only (no DB) so they unit-test cleanly; the cached reader
// lives in mcp-settings.server.ts. Anything security-bearing is an env var
// instead — see src/lib/mcp/config.ts.

export type McpSettings = {
  /** Kill switch: tools answer 503 when off; auth endpoints stay up. */
  enabled: boolean;
  /** Server `instructions` sent to agents on initialize. */
  instructions: string;
  /** Cap for list_guides / search_guides results. */
  maxResults: number;
  /** Whether create_draft may write; read tools are unaffected. */
  draftsEnabled: boolean;
};

export const MCP_SETTING_KEYS = {
  enabled: "mcp.enabled",
  instructions: "mcp.instructions",
  maxResults: "mcp.max_results",
  draftsEnabled: "mcp.drafts_enabled",
} as const;

export const MCP_SETTING_DEFAULTS: McpSettings = {
  enabled: true,
  instructions:
    "This server searches an internal staff knowledge base. Results are " +
    "limited to guides the signed-in person may read. Cite the guide `url` " +
    "when you use its content. Guide `content` is BlockNote JSON. " +
    "`create_draft` makes an unpublished draft in a department the person " +
    "belongs to; it never publishes.",
  maxResults: 25,
  // Off until an admin turns it on (plans/mcp-create-drafts.md, question 4).
  draftsEnabled: false,
};

export const MCP_INSTRUCTIONS_MAX_LENGTH = 2000;
export const MCP_MAX_RESULTS_MIN = 1;
export const MCP_MAX_RESULTS_MAX = 100;

/**
 * Defaults overlaid with stored rows. A row of the wrong JSON type (or out of
 * range) is treated as unset so a bad write can never break the server.
 */
export function mergeMcpSettings(
  rows: Iterable<{ key: string; value: unknown }>,
): McpSettings {
  const merged: McpSettings = { ...MCP_SETTING_DEFAULTS };
  for (const row of rows) {
    switch (row.key) {
      case MCP_SETTING_KEYS.enabled:
        if (typeof row.value === "boolean") merged.enabled = row.value;
        break;
      case MCP_SETTING_KEYS.instructions:
        if (typeof row.value === "string" && row.value.trim()) {
          merged.instructions = row.value.trim().slice(0, MCP_INSTRUCTIONS_MAX_LENGTH);
        }
        break;
      case MCP_SETTING_KEYS.maxResults:
        if (
          typeof row.value === "number" &&
          Number.isInteger(row.value) &&
          row.value >= MCP_MAX_RESULTS_MIN &&
          row.value <= MCP_MAX_RESULTS_MAX
        ) {
          merged.maxResults = row.value;
        }
        break;
      case MCP_SETTING_KEYS.draftsEnabled:
        if (typeof row.value === "boolean") merged.draftsEnabled = row.value;
        break;
    }
  }
  return merged;
}

/**
 * Normalize the admin form. Returns the rows to write: `null` means "delete
 * the row so the default applies" (blank or default-equal input).
 */
export function normalizeMcpSettingsInput(input: {
  enabled: unknown;
  instructions: unknown;
  maxResults: unknown;
  draftsEnabled: unknown;
}):
  | { ok: true; writes: { key: string; value: boolean | string | number | null }[] }
  | { ok: false; error: string } {
  // Checkboxes: present ("on"/"true") = on, absent = off.
  const checked = (v: unknown) => v === true || v === "on" || v === "true";
  const enabled = checked(input.enabled);
  const draftsEnabled = checked(input.draftsEnabled);

  const instructions =
    typeof input.instructions === "string" ? input.instructions.trim() : "";
  if (instructions.length > MCP_INSTRUCTIONS_MAX_LENGTH) {
    return {
      ok: false,
      error: `Instructions are over ${MCP_INSTRUCTIONS_MAX_LENGTH} characters.`,
    };
  }

  const rawMax =
    typeof input.maxResults === "string" ? input.maxResults.trim() : "";
  let maxResults: number | null = null;
  if (rawMax) {
    const n = Number(rawMax);
    if (
      !Number.isInteger(n) ||
      n < MCP_MAX_RESULTS_MIN ||
      n > MCP_MAX_RESULTS_MAX
    ) {
      return {
        ok: false,
        error: `Max results must be a whole number from ${MCP_MAX_RESULTS_MIN} to ${MCP_MAX_RESULTS_MAX}.`,
      };
    }
    maxResults = n;
  }

  return {
    ok: true,
    writes: [
      {
        key: MCP_SETTING_KEYS.enabled,
        value: enabled === MCP_SETTING_DEFAULTS.enabled ? null : enabled,
      },
      {
        key: MCP_SETTING_KEYS.instructions,
        value:
          !instructions || instructions === MCP_SETTING_DEFAULTS.instructions
            ? null
            : instructions,
      },
      {
        key: MCP_SETTING_KEYS.maxResults,
        value:
          maxResults === null || maxResults === MCP_SETTING_DEFAULTS.maxResults
            ? null
            : maxResults,
      },
      {
        key: MCP_SETTING_KEYS.draftsEnabled,
        value:
          draftsEnabled === MCP_SETTING_DEFAULTS.draftsEnabled ? null : draftsEnabled,
      },
    ],
  };
}

/** Clamp an agent's requested page size to what the admin allows. */
export function clampLimit(requested: unknown, max: number): number {
  if (typeof requested !== "number" || !Number.isFinite(requested)) return max;
  return Math.min(max, Math.max(1, Math.floor(requested)));
}
