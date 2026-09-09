# Plan: Admin-managed theme with light and dark modes

**Status: complete — implemented on `feat/theme-admin-dark-mode`
(2026-09-09), tested by Chris locally and on staging; awaiting the PR to
`main`.** Verified before the push: lint, typecheck, tests and build pass,
and Chris ran the manual test plan below locally and on the staging
deployment. Open questions were answered by Chris before implementation
(see bottom).

Deviations from the design, decided during implementation:

- **Contrast enforcement is split.** The original light theme runs muted
  text (4.1:1) and the status badges (2.5–3.4:1) under AA, so refusing every
  pair below 4.5:1 would have rejected the defaults. Body-text pairs
  (`REQUIRED_PAIRS` in `src/lib/theme.ts`: text, headings, links on the
  surfaces; text on accent; sidebar text) block the save; muted text and
  badges (`ADVISORY_PAIRS`) show as warnings only.
- **`@theme` tokens point at `:root` variables** (`--color-surface:
  var(--theme-surface)`) instead of holding the hex. With a literal, Tailwind
  bakes opacity modifiers (`bg-accent/15`) into a fixed color at build time;
  with a `var()` it emits runtime `color-mix()`, so the washes follow the
  admin's palette too.
- **Danger buttons** label with `text-surface-raised` (white in light, dark
  on the lighter dark-mode red) rather than a 26th `on-danger` token.
- `useThemeMode()` falls back to light outside a provider so server-rendered
  tests of guide content (which include Mermaid blocks) keep working.
- The admin header has no toggle and the sign-in page has none (Q1).

## Problem

The KB ships one hard-coded light theme: cyan `#00bae5` + ink `#001519` on a
cool grey ramp, declared once as Tailwind `@theme` tokens in
`src/app/globals.css` ("Single light theme by design"). Nothing about the
colors can change without a deploy, and there is no dark mode.

Wanted:

- **Admin → Theme** page where admins pick the colors for **light mode** and,
  separately, for **dark mode**, with a live preview and per-color reset.
  Saved without a deploy, like the existing Settings and MCP pages.
- A **light/dark toggle** for every user. The choice sticks per browser.
- **Today's look stays the default**: the light-mode defaults are exactly the
  current values, and a user who has never touched the toggle gets light.

What exists and matters here:

- **Tokens** live in `@theme` in `globals.css`: brand (`cyan-50/100/400/600/700`,
  `ink`, `ink-700/800`), a grey ramp (`grey-0` … `grey-800`), status pairs
  (`success`/`success-100`, `warning`/`warning-100`, `danger`/`danger-100`),
  shadows, and the font. Tailwind v4 (4.3) emits these as `--color-*`
  variables on `:root` inside `@layer theme`, and every utility such as
  `bg-grey-50` compiles to `background-color: var(--color-grey-50)`. That
  indirection is what makes runtime theming possible: an **unlayered**
  `:root { --color-grey-50: … }` rule always beats a layered one, so a
  `<style>` injected by the root layout can override any token without
  touching the utilities. (This breaks if `@theme` is ever switched to
  `@theme inline`, which bakes values into the utilities. Don't.)
- **Two roles per color.** `ink` is both the sidebar background *and* the
  heading color on light surfaces; Tailwind's built-in `white` is the sidebar
  text *and* the card/TopBar background (~60 uses). In dark mode the sidebar
  must stay dark and its text light, while cards must turn dark and headings
  light. So a dark theme cannot simply swap the raw palette variables — a
  **semantic token layer** is needed (see Design §1). Component code uses
  about 340 raw token classes (`text-ink`, `bg-grey-100`, `text-cyan-700`…)
  plus the `white` uses, all in `src/app` and `src/components`.
- **Admin pages use Tailwind's default palette** (`gray-*`, `blue-*`,
  `green-*`, `red-*`: ~170 classes across `src/app/admin/**`), not the design
  tokens. Untouched, they would render white-on-white in dark mode. They need
  migrating too.
- **Settings storage pattern**: `app_setting` (`key` text PK, `value` jsonb,
  `updated_at`, `updated_by`) in `src/db/directory-schema.ts`. A missing row
  means "code default". `src/lib/mcp-settings.ts` shows the typed-jsonb
  variant (booleans/numbers, bad rows ignored) with a cached, fail-soft
  reader in `mcp-settings.server.ts` and a form Server Action in
  `src/app/admin/mcp/actions.ts`. `saveSiteSettings` already calls
  `revalidatePath("/", "layout")`. No schema change is needed for this plan.
- **Per-browser preference pattern**: the wide-screen sidebar collapse is a
  cookie (`kb-sidebar-collapsed`) written client-side in
  `components/shell/sidebar-shell.tsx` and read server-side by
  `lib/sidebar-state.server.ts` so the first paint is right. "Show empty"
  (`kb-show-empty-departments`) does the same via a Server Action.
- **Rendering is already dynamic everywhere.** `(kb)/layout.tsx` reads the
  session and cookies, `admin/layout.tsx` calls `requireAdmin()`, and
  `sign-in` and `connect/consent` are `force-dynamic`. Reading the DB and a
  cookie in the root layout therefore costs no static prerendering. Cache
  Components is not enabled (`next.config.ts`).
- **Third-party surfaces**: the BlockNote editor
  (`components/editor/blocknote-editor.tsx`) is pinned to `theme="light"`,
  with its `--bn-colors-*` variables already mapped to our tokens in
  `globals.css` (`.guide-editor .bn-root`). Mermaid
  (`components/mermaid-diagram.tsx`) initializes with `theme: "neutral"`.
  Guide text/background highlights are server-rendered as **inline hex
  styles** from `COLORS` in `src/lib/guide-content.ts` (`styleFor` in
  `components/guide-content.tsx`), which CSS cannot flip.
- Exports (`components/guide-export.tsx`, PDF/DOCX) use their own hex values
  and stay light regardless of theme — documents are printed, not themed.
- `components/ui.tsx` already models "same widget on a dark surface" with
  `onDark` variants for `Badge`, `Avatar` and `Switch`.
- Next's guide `node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`
  covers theme attributes: a server-rendered `data-theme` on `<html>` from a
  cookie is flash-free on its own; the inline-script trick is only needed
  when the layout must stay static, which is not our case. It also warns that
  React's dev Strict Mode remount resets `<html>` attributes set
  imperatively, so the client owner of the mode should re-apply it in a
  `useLayoutEffect`.

## Design

### 1. Semantic tokens are the theme; the palette becomes internal

Add a semantic layer to `@theme` and migrate components onto it. These
**25 tokens** are what admins edit, per mode. The light column is exactly
today's value (the "current theme is the default" requirement); the dark
column is a proposed starting point derived from the same hues (open
question 5).

| Token | Used for | Light (today) | Dark (proposed) |
| --- | --- | --- | --- |
| `surface` | page background | `grey-50` #f6f8f9 | #0d191d |
| `surface-raised` | cards, TopBar, inputs, sign-in card | white #ffffff | #132329 |
| `surface-sunken` | inline code, hover rows, disabled | `grey-100` #eceff1 | #1a2d34 |
| `border` | hairlines | `grey-200` #dde3e6 | #24393f |
| `border-strong` | input borders, secondary buttons | `grey-300` #c4ced2 | #345059 |
| `fg` | body text | `grey-800` #1e2c31 | #dfe7ea |
| `fg-strong` | headings, emphasized labels | `ink` #001519 | #ffffff |
| `fg-muted` | secondary text, breadcrumbs | `grey-500` #697c84 | #93a6ad |
| `fg-subtle` | placeholders, icons at rest | `grey-400` #94a3aa | #6e838b |
| `accent` | primary buttons, switches, focus | `cyan-400` #00bae5 | #00bae5 |
| `accent-strong` | primary hover | `cyan-600` #0098bd | #33cdef |
| `accent-text` | links | `cyan-700` #017a99 | #4fd3f2 |
| `accent-soft` | notes, hover tint | `cyan-50` #eefafe | #0f2f38 |
| `accent-soft-strong` | selected rows, brand badges | `cyan-100` #d6f3fb | #14404b |
| `on-accent` | text on `accent` | `ink` #001519 | #001519 |
| `sidebar` | sidebar & sign-in hero background | `ink` #001519 | #06121a |
| `sidebar-fg` | sidebar text, wordmark | white #ffffff | #ffffff |
| `sidebar-fg-muted` | sidebar secondary text, icons | `grey-400` #94a3aa | #94a3aa |
| `sidebar-fg-subtle` | sidebar tertiary text | `grey-500` #697c84 | #697c84 |
| `success` / `success-soft` | badges & alerts | #1f9d55 / #dcf3e6 | #3fc57a / #123a24 |
| `warning` / `warning-soft` | badges & alerts | #d98315 / #fbeed6 | #f0a03a / #3e2a0c |
| `danger` / `danger-soft` | badges, alerts, danger buttons | #d64545 / #f8dede | #f06a6a / #43191b |

Notes:

- Sidebar translucent effects (`bg-white/10`, `border-white/15`, hover
  `bg-white/5`) become `bg-sidebar-fg/10` etc. Tailwind v4 implements opacity
  modifiers on variable-backed colors with `color-mix()`, so they follow
  runtime overrides.
- The raw ramp (`grey-*`, `cyan-*`, `ink*`) stays declared in `@theme` so
  the light defaults read as today, but a test forbids using it in
  components (§6) — otherwise dark mode silently regresses.
- Shadows keep their ink-tinted rgba values; they are nearly invisible on
  dark surfaces, which is fine. Not admin-editable.
- Add `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *))`
  for the rare one-off (e.g. dimming raster images), but the rule is: fix it
  with a token first.
- `:root[data-theme="light"] { color-scheme: light }` /
  `:root[data-theme="dark"] { color-scheme: dark }` so native scrollbars,
  `<input type="date">`, etc. match.

### 2. Storage: two `app_setting` rows of overrides

- `theme.light` and `theme.dark`, each `{ [token]: "#rrggbb" }` holding
  **only the values that differ from the defaults**. A mode with no
  overrides has no row. Reset-per-token = drop the key; reset-per-mode =
  delete the row.
- `src/lib/theme.ts` (pure, unit-tested): `THEME_TOKENS` (name, label, help,
  group), `THEME_DEFAULTS: { light, dark }`, `normalizeHex()` (accepts
  `#rgb`/`#rrggbb` any case, stores lowercase 6-digit, rejects everything
  else including alpha), `mergeTheme(rows)` (unknown tokens and non-hex
  values ignored, like `mergeMcpSettings`), `normalizeThemeInput(formData)`
  → writes or a field-level error, `buildThemeCss(light, dark)` → the two
  CSS blocks, and `contrastRatio(a, b)` for the preview warnings.
- `src/lib/theme.server.ts`: `getTheme()` — one `inArray` query cached with
  React `cache`, fail-soft to defaults (the sign-in page must render with the
  DB down, same as site settings); `getThemeMode()` — reads the cookie.

### 3. Applying the theme: root layout emits a `<style>` and `data-theme`

`src/app/layout.tsx` becomes async:

```tsx
const [theme, mode] = await Promise.all([getTheme(), getThemeMode()]);
<html lang="en" data-theme={mode} className=…>
  <head><style id="kb-theme" dangerouslySetInnerHTML={{ __html: buildThemeCss(theme.light, theme.dark) }} /></head>
  <body className="min-h-full bg-surface font-sans text-fg">
    <ThemeProvider initialMode={mode}>{children}</ThemeProvider>
  </body>
</html>
```

`buildThemeCss` always emits both blocks (defaults overlaid with overrides):

```css
:root { --color-surface: #f6f8f9; … ; color-scheme: light }
:root[data-theme="dark"] { --color-surface: #0d191d; … ; color-scheme: dark }
```

Unlayered, so it wins over Tailwind's `@layer theme` values, which remain as
the no-JS/no-DB fallback. The `@theme` light values and
`THEME_DEFAULTS.light` are the same numbers in two places; a unit test parses
`globals.css` and asserts they agree so they cannot drift.

Admin saves call `revalidatePath("/", "layout")` (the existing helper in
`admin/settings/actions.ts` does this already); the next request renders the
new `<style>`.

### 4. The user toggle

- **Cookie** `kb-theme` = `light` | `dark`; absent or anything else = light.
  Per browser, like the sidebar and "Show empty" preferences, and it works on
  the signed-out sign-in page. Written client-side (no round trip), one-year
  `Max-Age`, `SameSite=Lax`, `Secure` on https — copy the cookie line from
  `sidebar-shell.tsx`.
- **`ThemeProvider`** (`components/theme-provider.tsx`, client): context
  `{ mode, setMode, toggle }` seeded from `initialMode`. `setMode` updates
  state, sets `document.documentElement.dataset.theme`, writes the cookie. A
  `useLayoutEffect` re-applies the attribute from state on mount (the Strict
  Mode remount case from the Next guide; a no-op in production). Exposes
  `useThemeMode()` for the editor and Mermaid.
- **`ThemeToggle`** (`components/theme-toggle.tsx`): an icon button, sun in
  dark mode / moon in light mode (add `SunIcon` and `MoonIcon` to
  `components/icons.tsx`), `aria-label="Switch to dark mode"` /
  `"Switch to light mode"`, `aria-pressed` reflecting dark. Placement, per
  open question 1: right side of the `TopBar` before the avatar (every `(kb)`
  page), and in the admin header nav. The sign-in page gets one only if Q1
  says so.
- **Editor**: `BlockNoteView theme={mode}` from `useThemeMode()`. The
  `.guide-editor .bn-root` overrides already point BlockNote at our tokens,
  which now flip; the `theme` prop covers BlockNote's own dark-only rules.
  Editor wrapper classes (`bg-white`, `border-grey-300`) migrate like
  everything else.
- **Mermaid**: `theme: mode === "dark" ? "dark" : "neutral"`, and `mode` joins
  the effect's dependency list so open diagrams re-render on toggle.
- **Guide highlights**: `styleFor` stops emitting hex and emits
  `color: var(--guide-text-red)` / `background-color: var(--guide-bg-red)`;
  `globals.css` defines the nine pairs for light (today's `COLORS` values)
  and dark (BlockNote's dark-theme palette) under `[data-theme="dark"]`.
  `COLORS` itself stays for the exporters. Not admin-editable.

### 5. Admin → Theme page (`/admin/theme`)

Server page + one client component (`theme-editor.tsx`) + `actions.ts`.

- **Two panels, Light and Dark**, each a grouped list (Surfaces, Text,
  Accent, Sidebar, Status) of token rows: label, one-line help, a swatch,
  `<input type="color">` and a hex text field kept in sync, a
  `default`/`customized` chip, and a per-token "Reset". A per-panel
  "Reset light/dark to defaults". One Save button writes both modes.
- **Live preview** beside each panel: a miniature page (sidebar strip,
  TopBar, a card with heading/body/muted text/link, primary + secondary
  buttons, one badge of each status tone) whose wrapper sets the panel's
  current values as inline `--color-*` variables. Because utilities read
  `var(--color-*)`, the preview restyles itself while the rest of the admin
  page keeps the real theme. No extra CSS.
- **Contrast hints** under the preview: `fg`/`surface`, `fg-muted`/`surface`,
  `on-accent`/`accent`, `sidebar-fg`/`sidebar`, `accent-text`/`surface-raised`
  with the WCAG ratio, flagged below 4.5:1. Warn only, never block (Q7).
- **Saving** (`saveTheme` Server Action): `requireAdmin()`,
  `normalizeThemeInput` on both modes, transaction upserting/deleting the two
  rows with `updatedBy`, revalidate layout, redirect with `?ok=saved` /
  `?error=` like the Settings page. `resetTheme(mode)` deletes one row.
- Admin nav gets a "Theme" link; the dashboard "Manage" list gets a "Theme —
  light & dark mode colors" bullet.
- Optional (Q6): a `theme.dark_enabled` boolean row with a checkbox on this
  page; when off the toggle is hidden and the cookie is ignored (mode forced
  to light).

### 6. Migration of component classes

Mechanical but the largest step. Mapping:

| From | To |
| --- | --- |
| `bg-grey-50` (page), `bg-grey-0`/`bg-white` (cards, bars, inputs) | `bg-surface`, `bg-surface-raised` |
| `bg-grey-100` (code, hover, disabled) | `bg-surface-sunken` |
| `border-grey-200` / `border-grey-300` | `border-border` / `border-border-strong` |
| `text-grey-800` / `text-ink` / `text-grey-500` / `text-grey-400` | `text-fg` / `text-fg-strong` / `text-fg-muted` / `text-fg-subtle` |
| `text-cyan-700` + `hover:text-cyan-600` (links) | `text-accent-text hover:text-accent-strong` |
| `bg-cyan-400 text-ink` (primary) | `bg-accent text-on-accent` |
| `bg-cyan-50` / `bg-cyan-100` | `bg-accent-soft` / `bg-accent-soft-strong` |
| sidebar `bg-ink`, `text-white`, `text-grey-400`, `bg-white/10` | `bg-sidebar`, `text-sidebar-fg`, `text-sidebar-fg-muted`, `bg-sidebar-fg/10` |
| `bg-success-100` etc. | `bg-success-soft` etc. |
| admin `gray-*`/`blue-*`/`green-*`/`red-*` | nearest semantic token; `blue-600` buttons/links become `accent`/`accent-text` |

`ui.tsx`'s `onDark` variants map to the `sidebar-*` tokens. `.prose-guide`
and `.guide-editor` rules in `globals.css` switch to the semantic variables.
`BrandMark`'s `text-white` → `text-sidebar-fg`.

Guard: `src/lib/theme-classes.test.ts` walks `src/**/*.tsx` and
`globals.css` (outside `@theme`) and fails on any raw palette class or
variable (`-grey-`, `-ink`, `-cyan-`, `-gray-`, `-blue-`, `-white`,
`-success-100`…), with an allowlist for `guide-export.tsx`. This is what
keeps dark mode from rotting one PR at a time.

## Steps

1. **Tokens.** Add the semantic tokens, `color-scheme` rules, the `dark`
   custom variant, and the `--guide-*` highlight variables (light + dark) to
   `globals.css`. Write `src/lib/theme.ts` with defaults, validation, merge,
   `buildThemeCss`, `contrastRatio`, plus `theme.test.ts` (including the
   globals.css ↔ `THEME_DEFAULTS.light` agreement test).
2. **Server plumbing.** `src/lib/theme.server.ts`; make `app/layout.tsx`
   async, emit `data-theme` and the `<style>`, move page bg/text onto
   `body`, wrap children in `ThemeProvider`.
3. **Toggle.** `ThemeProvider`, `ThemeToggle`, `SunIcon`/`MoonIcon`; mount in
   `TopBar` and `admin/layout.tsx` (and sign-in if Q1 says so). Test the
   provider with happy-dom like `sidebar-shell.test.tsx` (cookie written,
   attribute set, default light when the cookie is absent or garbage).
4. **Third-party surfaces.** `BlockNoteView theme={mode}`, Mermaid theme
   switch, `styleFor` → CSS variables (update `guide-content.test.tsx`
   expectations).
5. **Class migration.** `(kb)` pages and `components/**` first, then
   `admin/**`, then `sign-in` and `connect/consent`. Add the
   `theme-classes.test.ts` guard and make it pass.
6. **Admin page.** `admin/theme/{page,theme-editor,actions}.tsx`, nav link,
   dashboard bullet, `theme.test.ts` cases for `normalizeThemeInput`.
7. **Docs.** README: "Admin → Theme (stored in the database)" table, a
   sentence under Architecture notes about semantic tokens and the
   no-raw-palette test; update the `globals.css` header comment (no longer
   "single light theme by design").
8. **Verify locally**: `npm run lint`, `npx tsc --noEmit`, `npm test`,
   `npm run build`, then the manual checks below. Commit on
   `feat/theme-admin-dark-mode`.

### Manual test plan

- Fresh browser (no cookie): every page renders exactly as today.
- Toggle in the TopBar: whole app flips instantly with no flash; reload keeps
  it; sidebar stays dark with light text in both modes; admin pages, sign-in
  page (open in a second tab after toggling) and the consent page follow.
- Editor in dark mode: editable area, menus, toolbar and slash menu are
  legible; a diagram block re-renders with Mermaid's dark theme after
  toggling.
- A published guide with colored/highlighted text reads well in both modes.
- Admin → Theme: change `accent` in light only → light pages change, dark
  pages don't; reset the token → row key removed; "Reset dark" → row
  deleted (check `app_setting`). Bad hex → field error, nothing saved. Low
  contrast → warning shown, save still allowed.
- PDF and DOCX export of a guide unchanged in either mode.

## Files

Create: `src/lib/theme.ts`, `src/lib/theme.test.ts`,
`src/lib/theme.server.ts`, `src/lib/theme-classes.test.ts`,
`src/components/theme-provider.tsx`, `src/components/theme-toggle.tsx`,
`src/app/admin/theme/page.tsx`, `src/app/admin/theme/theme-editor.tsx`,
`src/app/admin/theme/actions.ts`.

Modify: `src/app/globals.css`, `src/app/layout.tsx`,
`src/components/icons.tsx`, `src/components/ui.tsx`,
`src/components/shell/top-bar.tsx`, `src/app/admin/layout.tsx`,
`src/app/admin/page.tsx`, `src/components/editor/blocknote-editor.tsx`,
`src/components/mermaid-diagram.tsx`, `src/components/guide-content.tsx`,
`README.md`, and every `.tsx` under `src/app` and `src/components` that
carries palette classes (see the counts in Problem).

No database migration.

## Open questions

1. **Where does the toggle live?** Recommended: TopBar right side (next to
   the avatar) plus the admin header. Should the signed-out sign-in page get
   one too?
   Answer: TopBar right side (next to the avatar). The admin header doesn't need one, the choice should only be in the main itnerface.  The signed-out/sign-in page does not need one either.
2. **Two-way or three-way?** The request is light ↔ dark with light as the
   default, so the plan is a two-state toggle. Add a "follow system" option
   (cookie value `system`, resolved with `prefers-color-scheme` via a tiny
   inline script since the server can't see it)? Recommended: not now; the
   cookie format leaves room for it.
   Answer: not now, possibly in the future.
3. **What is editable?** Recommended: the 25 semantic tokens above with
   human labels. Alternative: also expose the raw grey/cyan ramp (another
   ~20 inputs per mode) for admins who want to retune every shade.
   Answer: the 25 semantic tokens above with human labels.
4. **Per browser or per account?** Recommended: cookie, matching the sidebar
   and "Show empty" preferences and working signed-out. Per account would
   need a `user` column and a Server Action on toggle.
   Answer: light mode/dark mode preference should be a cookie
5. **Dark defaults.** Accept the proposed dark column as the starting point
   (tuned during implementation for contrast), or will Chris supply a
   palette?
   Answer: Accept the proposed dark column as the starting point.
6. **Kill switch.** Add a "Dark mode available" checkbox on the Theme page
   that hides the toggle and forces light? Cheap to add now.
   Answer: yes
7. **Contrast warnings**: warn only (recommended) or refuse to save below
   4.5:1 for body text?
   Answer: refuse to save below 4.5:1
