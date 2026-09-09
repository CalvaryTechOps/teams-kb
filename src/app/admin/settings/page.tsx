import {
  SETTING_DEFAULTS,
  SETTING_KEYS,
  SETTING_MAX_LENGTH,
  SETTING_META,
} from "@/lib/site-settings";
import { getSiteSettingsDetailed } from "@/lib/site-settings.server";
import { resetSiteSetting, saveSiteSettings } from "./actions";

// Site copy that differs per organization: sign-in page text and the account
// label. Deployment-wide names (app title, credit line, logo) are env vars —
// see README "Configuration".

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const [{ values, customized }, params] = await Promise.all([
    getSiteSettingsDetailed(),
    searchParams,
  ]);

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold">Site text</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Sign-in page copy and the account label shown in the sidebar. Leave a
        field blank to use the default. The app title, credit line and logo are
        set per deployment with environment variables.
      </p>

      {params.ok === "saved" && (
        <p className="mt-4 rounded-md bg-success-soft px-3 py-2 text-sm text-success">
          Saved.
        </p>
      )}
      {params.ok === "reset" && (
        <p className="mt-4 rounded-md bg-success-soft px-3 py-2 text-sm text-success">
          Reset to default.
        </p>
      )}
      {params.error && (
        <p className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {params.error}
        </p>
      )}

      <form action={saveSiteSettings} className="mt-6 space-y-6">
        {SETTING_KEYS.map((key) => {
          const meta = SETTING_META[key];
          const isCustom = customized.has(key);
          const inputClass =
            "mt-1 w-full rounded-md border border-border-strong px-3 py-2 text-sm focus:border-accent focus:outline-none";
          return (
            <div key={key}>
              <div className="flex items-center justify-between">
                <label htmlFor={key} className="text-sm font-medium">
                  {meta.label}
                  {isCustom ? (
                    <span className="ml-2 rounded bg-accent-soft-strong px-1.5 py-0.5 text-xs font-normal text-accent-text">
                      customized
                    </span>
                  ) : (
                    <span className="ml-2 rounded bg-surface-sunken px-1.5 py-0.5 text-xs font-normal text-fg-muted">
                      default
                    </span>
                  )}
                </label>
                {isCustom && (
                  <button
                    type="submit"
                    formAction={resetSiteSetting}
                    name="key"
                    value={key}
                    className="text-xs text-fg-muted hover:underline"
                  >
                    Reset to default
                  </button>
                )}
              </div>
              <p className="text-xs text-fg-muted">{meta.help}</p>
              {meta.multiline ? (
                <textarea
                  id={key}
                  name={key}
                  rows={3}
                  maxLength={SETTING_MAX_LENGTH}
                  defaultValue={isCustom ? values[key] : ""}
                  placeholder={SETTING_DEFAULTS[key]}
                  className={inputClass}
                />
              ) : (
                <input
                  id={key}
                  name={key}
                  type="text"
                  maxLength={SETTING_MAX_LENGTH}
                  defaultValue={isCustom ? values[key] : ""}
                  placeholder={SETTING_DEFAULTS[key]}
                  className={inputClass}
                />
              )}
            </div>
          );
        })}
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-strong"
        >
          Save
        </button>
      </form>
    </div>
  );
}
