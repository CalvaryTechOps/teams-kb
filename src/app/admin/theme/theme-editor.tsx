"use client";

import { useState, type CSSProperties } from "react";
import {
  ADVISORY_PAIRS,
  contrastProblems,
  MIN_TEXT_CONTRAST,
  normalizeHex,
  REQUIRED_PAIRS,
  THEME_DEFAULTS,
  THEME_GROUPS,
  THEME_MODES,
  THEME_TOKENS,
  themeTokenMeta,
  type ThemeMode,
  type ThemePalette,
  type ThemeToken,
} from "@/lib/theme";
import { resetThemeMode, saveTheme } from "./actions";

// The form holds one text field per token per mode, named `<mode>.<token>`,
// which is exactly what normalizeThemeInput reads. Colors are edited as text
// (so a half-typed value is allowed) with a native color picker beside it; the
// preview and contrast checks follow the text live.

type Drafts = Record<ThemeMode, Record<ThemeToken, string>>;

const MODE_LABEL: Record<ThemeMode, string> = { light: "Light mode", dark: "Dark mode" };

const inputClass =
  "h-8 rounded-md border border-border-strong bg-surface-raised px-2 font-mono text-xs text-fg focus:border-accent focus:outline-none";

export function ThemeEditor({
  initial,
  initialDarkEnabled,
  stored,
}: {
  initial: Record<ThemeMode, ThemePalette>;
  initialDarkEnabled: boolean;
  /** Tokens with a stored override, per mode (for the "customized" chips). */
  stored: Record<ThemeMode, ThemeToken[]>;
}) {
  const [drafts, setDrafts] = useState<Drafts>(() => ({
    light: { ...initial.light },
    dark: { ...initial.dark },
  }));
  const [darkEnabled, setDarkEnabled] = useState(initialDarkEnabled);

  const set = (mode: ThemeMode, token: ThemeToken, value: string) =>
    setDrafts((d) => ({ ...d, [mode]: { ...d[mode], [token]: value } }));

  // Effective palette for preview and checks: an unparsable draft falls back
  // to the default so the preview never breaks mid-edit.
  const effective = (mode: ThemeMode): ThemePalette => {
    const out = { ...THEME_DEFAULTS[mode] };
    for (const token of THEME_TOKENS) {
      out[token.name] = normalizeHex(drafts[mode][token.name]) ?? THEME_DEFAULTS[mode][token.name];
    }
    return out;
  };

  const invalid = THEME_MODES.flatMap((mode) =>
    THEME_TOKENS.filter(
      (t) => drafts[mode][t.name].trim() && !normalizeHex(drafts[mode][t.name]),
    ).map((t) => `${MODE_LABEL[mode]}: ${t.label} is not a hex color.`),
  );
  const blocking = THEME_MODES.flatMap((mode) =>
    contrastProblems(effective(mode), REQUIRED_PAIRS).map(
      (p) =>
        `${MODE_LABEL[mode]}: ${themeTokenMeta(p.text).label} on ${themeTokenMeta(p.background).label} is ${p.ratio.toFixed(2)}:1 (needs ${MIN_TEXT_CONTRAST}:1).`,
    ),
  );
  const canSave = invalid.length === 0 && blocking.length === 0;

  return (
    <form action={saveTheme} className="mt-6 space-y-10">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="dark_enabled"
          checked={darkEnabled}
          onChange={(e) => setDarkEnabled(e.target.checked)}
          className="accent-accent"
        />
        <span className="font-medium">Dark mode available</span>
        <span className="text-fg-muted">
          — when off, the toggle is hidden and everyone sees light mode.
        </span>
      </label>

      {THEME_MODES.map((mode) => {
        const palette = effective(mode);
        const advisory = contrastProblems(palette, ADVISORY_PAIRS);
        const required = contrastProblems(palette, REQUIRED_PAIRS);
        const storedSet = new Set(stored[mode]);
        return (
          <section key={mode} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">{MODE_LABEL[mode]}</h3>
                {storedSet.size > 0 && (
                  <button
                    type="submit"
                    formAction={resetThemeMode}
                    formNoValidate
                    name="mode"
                    value={mode}
                    className="text-xs text-fg-muted hover:underline"
                  >
                    Reset {mode} mode to defaults
                  </button>
                )}
              </div>
              {THEME_GROUPS.map((group) => (
                <fieldset key={group.id} className="mt-4">
                  <legend className="text-[11px] font-medium uppercase tracking-[.09em] text-fg-muted">
                    {group.label}
                  </legend>
                  <div className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface-raised">
                    {THEME_TOKENS.filter((t) => t.group === group.id).map((token) => {
                      const id = `${mode}.${token.name}`;
                      const draft = drafts[mode][token.name];
                      const valid = normalizeHex(draft);
                      const isDefault = valid === THEME_DEFAULTS[mode][token.name];
                      return (
                        <div key={id} className="flex items-center gap-3 px-3 py-2">
                          <input
                            type="color"
                            aria-label={`${token.label} picker`}
                            value={valid ?? THEME_DEFAULTS[mode][token.name]}
                            onChange={(e) => set(mode, token.name, e.target.value)}
                            className="size-8 shrink-0 cursor-pointer rounded border border-border-strong bg-transparent p-0"
                          />
                          <div className="min-w-0 flex-1">
                            <label htmlFor={id} className="text-sm font-medium">
                              {token.label}
                            </label>
                            <p className="truncate text-xs text-fg-muted">{token.help}</p>
                          </div>
                          {storedSet.has(token.name) ? (
                            <span className="rounded bg-accent-soft-strong px-1.5 py-0.5 text-xs text-accent-text">
                              customized
                            </span>
                          ) : (
                            <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-xs text-fg-muted">
                              default
                            </span>
                          )}
                          <input
                            id={id}
                            name={id}
                            type="text"
                            value={draft}
                            onChange={(e) => set(mode, token.name, e.target.value)}
                            spellCheck={false}
                            aria-invalid={!valid}
                            className={`${inputClass} w-24 ${valid ? "" : "border-danger"}`}
                          />
                          <button
                            type="button"
                            onClick={() => set(mode, token.name, THEME_DEFAULTS[mode][token.name])}
                            disabled={isDefault}
                            className="text-xs text-fg-muted hover:underline disabled:invisible"
                          >
                            Reset
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>

            <aside className="lg:sticky lg:top-8 lg:self-start">
              <ThemePreview palette={palette} />
              <ul className="mt-3 space-y-1 text-xs">
                {required.map((p) => (
                  <li key={`${p.text}/${p.background}`} className="text-danger">
                    {themeTokenMeta(p.text).label} on {themeTokenMeta(p.background).label}:{" "}
                    {p.ratio.toFixed(2)}:1 — below {MIN_TEXT_CONTRAST}:1, cannot save.
                  </li>
                ))}
                {advisory.map((p) => (
                  <li key={`${p.text}/${p.background}`} className="text-warning">
                    {themeTokenMeta(p.text).label} on {themeTokenMeta(p.background).label}:{" "}
                    {p.ratio.toFixed(2)}:1 — below {MIN_TEXT_CONTRAST}:1, may be hard to read.
                  </li>
                ))}
                {required.length === 0 && advisory.length === 0 && (
                  <li className="text-success">Every checked pair is at least {MIN_TEXT_CONTRAST}:1.</li>
                )}
              </ul>
            </aside>
          </section>
        );
      })}

      {!canSave && (
        <ul className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {[...invalid, ...blocking].map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      <button
        type="submit"
        disabled={!canSave}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
      >
        Save
      </button>
    </form>
  );
}

// Miniature page styled by the draft palette: the wrapper sets the tokens as
// inline custom properties, and since every utility reads `var(--color-*)`
// the preview restyles itself without any extra CSS.
function ThemePreview({ palette }: { palette: ThemePalette }) {
  const vars = Object.fromEntries(
    THEME_TOKENS.map((t) => [`--color-${t.name}`, palette[t.name]]),
  ) as CSSProperties;
  return (
    <div
      style={vars}
      className="overflow-hidden rounded-lg border border-border bg-surface text-fg shadow-sm"
      aria-hidden
    >
      <div className="flex">
        <div className="w-20 shrink-0 bg-sidebar p-3">
          <div className="text-[10px] font-black text-sidebar-fg">KB</div>
          <div className="mt-3 rounded bg-accent/15 px-1.5 py-1 text-[9px] text-sidebar-fg">Tech</div>
          <div className="px-1.5 py-1 text-[9px] text-sidebar-fg/85">Finance</div>
          <div className="px-1.5 py-1 text-[9px] text-sidebar-fg-muted">Facilities</div>
          <div className="mt-2 text-[8px] text-sidebar-fg-subtle">Work account</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex h-8 items-center gap-1 border-b border-border bg-surface-raised px-3 text-[9px] text-fg-muted">
            <span className="text-accent-text">Tech</span>
            <span>/</span>
            <span className="font-medium text-fg-strong">Printers</span>
          </div>
          <div className="p-3">
            <div className="rounded-lg border border-border bg-surface-raised p-3 shadow-xs">
              <div className="text-sm font-black text-fg-strong">Set up a printer</div>
              <p className="mt-1 text-[10px] leading-relaxed">
                Body text on a card, with a <span className="text-accent-text">link</span> and{" "}
                <code className="rounded border border-border bg-surface-sunken px-1">code</code>.
              </p>
              <p className="mt-1 text-[9px] text-fg-muted">Updated last week · 3 min read</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded bg-accent px-2 py-0.5 text-[9px] font-medium text-on-accent">Save</span>
                <span className="rounded border border-border-strong bg-surface-raised px-2 py-0.5 text-[9px] font-medium">Cancel</span>
                <span className="rounded bg-danger px-2 py-0.5 text-[9px] font-medium text-surface-raised">Delete</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] font-medium">
                <span className="rounded-full bg-success-soft px-2 py-0.5 text-success">Published</span>
                <span className="rounded-full bg-warning-soft px-2 py-0.5 text-warning">In review</span>
                <span className="rounded-full bg-danger-soft px-2 py-0.5 text-danger">Rejected</span>
                <span className="rounded-full bg-accent-soft-strong px-2 py-0.5 text-accent-text">Mine</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
