// Admin-editable site copy. Pure helpers only (no DB) so they unit-test
// cleanly; the cached reader lives in site-settings.server.ts.

export const SETTING_DEFAULTS = {
  "signin.tagline":
    "How-tos, policies and setup guides from every department — written down so you don't have to ask twice.",
  "signin.help_text":
    "Use your work account — the same account used for other trusted systems.",
  "signin.button_label": "Sign In",
  "signin.redirect_note": "Redirects to your work sign-in",
  "account.label": "Work account",
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type SiteSettings = Record<SettingKey, string>;

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];

export const SETTING_META: Record<
  SettingKey,
  { label: string; help: string; multiline: boolean }
> = {
  "signin.tagline": {
    label: "Sign-in tagline",
    help: "Flavor text under the app title on the sign-in page.",
    multiline: true,
  },
  "signin.help_text": {
    label: "Sign-in help text",
    help: "Explains which account to use, shown above the button.",
    multiline: true,
  },
  "signin.button_label": {
    label: "Sign-in button",
    help: "Label of the sign-in button.",
    multiline: false,
  },
  "signin.redirect_note": {
    label: "Redirect note",
    help: "Small text under the button.",
    multiline: false,
  },
  "account.label": {
    label: "Account label",
    help: "Shown under the user's name in the sidebar.",
    multiline: false,
  },
};

export const SETTING_MAX_LENGTH = 500;

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTING_DEFAULTS, key);
}

/** Defaults overlaid with stored rows. Unknown keys, blank or non-string values ignored. */
export function mergeSettings(
  rows: Iterable<{ key: string; value: unknown }>,
): SiteSettings {
  const merged: SiteSettings = { ...SETTING_DEFAULTS };
  for (const row of rows) {
    if (!isSettingKey(row.key)) continue;
    // Stored as jsonb; anything but a string is treated as unset.
    const value = typeof row.value === "string" ? row.value.trim() : "";
    if (value) merged[row.key] = value;
  }
  return merged;
}

/**
 * Normalize an admin's input for one key. Returns the value to store, or
 * null when the row should be deleted (blank or identical to the default).
 */
export function normalizeSettingInput(
  key: SettingKey,
  raw: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value.length > SETTING_MAX_LENGTH) {
    return {
      ok: false,
      error: `${SETTING_META[key].label} is over ${SETTING_MAX_LENGTH} characters.`,
    };
  }
  if (!value || value === SETTING_DEFAULTS[key]) return { ok: true, value: null };
  return { ok: true, value };
}
