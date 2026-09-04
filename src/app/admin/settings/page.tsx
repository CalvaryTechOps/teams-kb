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
      <p className="mt-1 text-sm text-gray-500">
        Sign-in page copy and the account label shown in the sidebar. Leave a
        field blank to use the default. The app title, credit line and logo are
        set per deployment with environment variables.
      </p>

      {params.ok === "saved" && (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Saved.
        </p>
      )}
      {params.ok === "reset" && (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Reset to default.
        </p>
      )}
      {params.error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {params.error}
        </p>
      )}

      <form action={saveSiteSettings} className="mt-6 space-y-6">
        {SETTING_KEYS.map((key) => {
          const meta = SETTING_META[key];
          const isCustom = customized.has(key);
          const inputClass =
            "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";
          return (
            <div key={key}>
              <div className="flex items-center justify-between">
                <label htmlFor={key} className="text-sm font-medium">
                  {meta.label}
                  {isCustom ? (
                    <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-normal text-blue-700">
                      customized
                    </span>
                  ) : (
                    <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600">
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
                    className="text-xs text-gray-500 hover:underline"
                  >
                    Reset to default
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500">{meta.help}</p>
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
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Save
        </button>
      </form>
    </div>
  );
}
