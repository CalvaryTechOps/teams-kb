# Plan: Dependency audit and update, September 2026

**Status: in progress on `feat/dependency-updates-2026-09` (started 2026-09-12).**
Open questions at the bottom are answered (recommendations taken).

## Audit report

Run on 2026-09-12 against `main` at `183045b` with npm 11.12.1 and
Node 24.15.0. The tree has 1 006 packages (514 prod, 349 dev, 194
optional). Baseline before any change: lint clean, `tsc --noEmit` clean,
195 unit tests in 32 files passing.

`npm audit` reports "6 vulnerabilities (4 moderate, 2 high)". That is
three distinct advisories; the esbuild one is counted four times because
npm lists every package on its dependency chain.

### Advisories

| Advisory | Severity | Vulnerable package | Pulled in by | Fix |
| --- | --- | --- | --- | --- |
| [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) | High (CVSS 8.9) | `sharp` 0.35.3, fixed in 0.35.4 | `next` (optional dependency, image optimizer) | `npm audit fix` |
| [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) | High (CVSS 7.5) | `js-yaml` 4.3.1, fixed in 4.3.2 | `eslint` → `@eslint/eslintrc` | `npm audit fix` |
| [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | Moderate (CVSS 5.3) | `esbuild` 0.18.20, fixed in 0.25.0 | `drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` | No upstream fix; `overrides` entry (step 3) |

**sharp (libheif heap overflow).** Two heap-based buffer overflows in the
bundled libheif, reachable when sharp decodes attacker-supplied AVIF/HEIF
images; remote code execution on glibc Linux is the worst case. Exposure
in this app is low: the only `next/image` use is the logo in
`src/components/brand-mark.tsx`, rendered `unoptimized`; guide images are
plain `<img>` tags to Blob URLs; `public/` is empty and no
`images.remotePatterns` are configured, so the `/_next/image` route has
nothing to decode. On Vercel that route is served by the platform's
image service rather than the sharp in `node_modules`. The fix is a
patch bump, so take it regardless.

**js-yaml (CPU exhaustion via merge keys).** A crafted YAML document
bypasses the `maxTotalMergeKeys` limit and burns CPU. js-yaml is present
only under eslint, which parses developer-written config files. No
runtime or CI exposure. Patch bump.

**esbuild (permissive CORS on its dev server).** Only affects esbuild's
`serve` mode, which nothing here runs. The vulnerable copy is a nested
`esbuild@0.18.20` under the deprecated `@esbuild-kit/core-utils`
("merged into tsx"). drizzle-kit 0.31.10 still declares
`@esbuild-kit/esm-loader` as a dependency, but its built output
(`bin.cjs`, `api.js`, `api.mjs`) never references it, so the vulnerable
copy is installed and never loaded. npm's only offered fix is to
downgrade drizzle-kit to 0.18.1, which is not an option. The stable
drizzle-kit line (0.31.x, last published as 0.31.10) will not drop the
dependency; drizzle-kit 1.0.0-rc does, but requires drizzle-orm 1.0 rc,
a separate migration. Silence it with a nested `overrides` entry that
forces that copy to `^0.25.0` (see step 3), or accept and document.

**Not a problem, for the record.** `npm ls esbuild` prints
`invalid: "^0.27.0 || ^0.28.0" from node_modules/vitest/node_modules/vite`.
That is vite 8's *optional peer* dependency on esbuild (vite 8 bundles
with rolldown); the dedupe warning is cosmetic and goes away when the
esbuild override lands or vitest moves to 5.

### Outdated packages

In-range updates (`npm update` picks them up):

| Package | Installed | Wanted | Notes |
| --- | --- | --- | --- |
| `better-auth`, `@better-auth/sso`, `@better-auth/mcp`, `@better-auth/oauth-provider`, `@better-auth/cimd` | 1.7.1 / 1.7.2 | 1.7.4 | **Schema change.** 1.7.3 reverted the 1.7.0 account schema (details below). 1.7.3 also fixed CIMD discovery failing with `ERR_INVALID_IP_ADDRESS` and loopback-port handling for native OAuth clients; 1.7.4 adds Vitest 5 compatibility and disables per-instance OpenTelemetry spans by default. |
| `@blocknote/server-util` | 0.54.0 | 0.54.2 | Caret range, unlike the other BlockNote packages; must move together with them (step 6). |
| `@mantine/core`, `@mantine/hooks` | 9.6.0 | 9.6.1 | Patch. |
| `zod` | 4.5.4 | 4.6.2 | Minor. |
| `happy-dom` | 20.12.0 | 20.14.5 | Dev only. |
| `@types/react`, `@types/react-dom` | 19.2.x | 19.3.0 | Types for React 19.3 while `react` stays pinned at 19.2.8; typecheck decides whether to keep or pin `~19.2`. |

Pinned exactly in `package.json`, so a deliberate bump:

| Package | Installed | Latest | Notes |
| --- | --- | --- | --- |
| `next`, `eslint-config-next` | 16.3.3 | 16.3.5 | 16.3.4 re-enabled AVIF image optimization (it had been disabled in 16.3.3) and fixed a Turbopack `crossOrigin` manifest bug. 16.3.5 (2026-09-11) adds the CSP nonce to `loading`/`template` script tags, rejects empty images in the disk cache, and fixes a `use cache` prerender signal. No breaking changes. |
| `@blocknote/*` (core, react, mantine, diagram-block, xl-docx-exporter, xl-pdf-exporter) | 0.54.0 | 0.54.2 | 0.54.1 (2026-09-09): Typst-based accessible PDF export in a new `xl-typst-compiler` package (not used here), DOCX exporter now uses distinct bullet symbols per nesting level, list numbering fixes, "resolve block changes from changed range only", schema mutation guards. 0.54.2: packaging fix for the wasm package. The DOCX bullet change may move expectations in `guide-export.test.ts`. |

Majors, **deferred** to a later plan (not security related and each has
its own compatibility work): `eslint` 9 → 10, `vitest` 4 → 5 (requires
`@types/node` ≥ 22 and Node ≥ 22.12), `typescript` 5.9 → 7, `react` /
`react-dom` 19.2.8 → 19.3.0 (stay lock-stepped with the React version
Next 16.3.x ships against), `@types/node` 20 → 22, drizzle-kit /
drizzle-orm 1.0 (still release candidates).

### The better-auth 1.7.3 account schema reversal

This is the one update with a real regression risk, and it is easy to
miss because it is a patch release.

better-auth 1.7.0 changed the `account` table to identify rows by
`(issuer, accountId)` and made `issuer` required. This project adopted
that on 2026-09-04: `src/db/auth-schema.ts` has `issuer text NOT NULL`
plus `uniqueIndex account_issuer_accountId_idx (issuer, account_id)`,
applied by `drizzle/0000_init.sql` and `drizzle/0001_account-issuer.sql`.

better-auth 1.7.3 "restored the 1.6 account core schema": accounts are
again identified by `(providerId, accountId)` and **new account rows no
longer write `issuer`**. Their upgrade guide
(<https://better-auth.com/docs/guides/1-7-upgrade-guide#account-identity-keeps-the-provider-key>)
is explicit: "a `NOT NULL` column rejects every sign-up and account link
until you relax it." Bumping better-auth without a schema migration
would therefore break the **first sign-in of any new staff member**
(the insert into `account`) while every existing user keeps working,
which is exactly the case a quick local smoke test would not catch.

Required cleanup per the guide: drop the `(issuer, accountId)` unique
index first, then make `issuer` nullable (keep the column; dropping is
optional and the nullable step is reversible). No backfill. Existing
rows keep their `issuer` values, which is harmless.

## Design

- One feature branch, `feat/dependency-updates-2026-09`, off `main`.
- One commit per step below, in the order given, so a regression can be
  bisected to a single package group. Security fixes first, then the
  better-auth bump with its migration, then the remaining in-range
  updates, then the exact-pinned bumps.
- The full local check after every step is the same and is written once
  in "Verification". A step is not done until it passes.
- The `jsdom ~26.1.0` override on `@blocknote/server-util` stays; the
  reason (Vercel's runtime rejects `require(esm)` chains) is unchanged.
- No push, staging or PR step. Chris tests locally and asks for staging
  separately.

## Steps

### 1. Branch and baseline

- `git switch -c feat/dependency-updates-2026-09 main`.
- Run the verification checklist once unchanged and note the numbers
  (expect lint clean, tsc clean, 195 tests, `npm audit` = 6).

### 2. Apply the two non-breaking audit fixes

- `npm audit fix` (no `--force`). Expected diff: `package-lock.json` only,
  `sharp` 0.35.3 → 0.35.4 and `js-yaml` 4.3.1 → 4.3.2.
- Confirm with `npm audit`: only the esbuild chain remains (4 moderate).
- Confirm `npm ls sharp js-yaml` shows the new versions and no
  duplicates.
- Commit: "Patch sharp and js-yaml advisories".

### 3. Override the orphaned esbuild under drizzle-kit (see Q1)

- In `package.json` `overrides`, add a nested entry so only that copy
  moves:

  ```json
  "overrides": {
    "@blocknote/server-util": { "jsdom": "~26.1.0" },
    "@esbuild-kit/core-utils": { "esbuild": "^0.25.0" }
  }
  ```

- `npm install`, then `npm audit` should report 0 vulnerabilities and
  `npm ls esbuild` should show no 0.18.x copy.
- drizzle-kit is the only consumer, so prove it still works end to end:
  `npx drizzle-kit generate` (expect "No schema changes, nothing to
  migrate"), `npx drizzle-kit migrate` against the `development` branch
  (expect no pending migrations), and `npm run build` (which runs
  migrate first).
- If either command breaks, revert the override, leave a comment in
  this plan's status line saying the moderate esbuild finding is
  accepted with the reasoning from the report, and move on.
- Commit: "Force the unused esbuild copy under drizzle-kit to a patched
  release".

### 4. better-auth 1.7.4 with the account schema cleanup (see Q2)

Do the schema change and the package bump in the same commit; the
Vercel build runs `drizzle-kit migrate` before `next build`, so the
migration and the new code always deploy together.

- `npm update better-auth @better-auth/sso @better-auth/mcp
  @better-auth/oauth-provider @better-auth/cimd`; confirm all five are
  1.7.4 and that `@better-auth/sso`'s range in `package.json` still
  resolves (it is `^1.7.1`).
- In `src/db/auth-schema.ts`: make `issuer` nullable (drop `.notNull()`),
  update the comment to say why it is kept but no longer written, and
  remove `account_issuer_accountId_idx`. Per Q2, add a plain
  `index("account_providerId_accountId_idx").on(table.providerId,
  table.accountId)` for the lookup better-auth now performs on every
  sign-in.
- `npx drizzle-kit generate`, name the migration `account-issuer-optional`.
  Check the generated SQL drops the index **before** altering the column
  and contains nothing else. `npx drizzle-kit migrate` against the
  `development` branch.
- Optional cross-check: `npx @better-auth/cli generate` against a
  scratch path and diff its `account` definition against ours; it should
  no longer want `issuer` required.
- Sign-in tests, all against `localhost:3000` with the SAML env set:
  1. Existing user signs in (update path).
  2. **New-account path**: in the `development` Neon branch delete the
     `account` row for your own user (or a test user), sign in again, and
     confirm a fresh row is created with `issuer` NULL and
     `provider_id = 'entra'`. This is the path the NOT NULL column would
     have broken.
  3. MCP OAuth: `curl` `/.well-known/oauth-authorization-server` and
     `/.well-known/oauth-protected-resource`, then complete one
     authorize + token exchange with a local MCP client (or the Admin →
     MCP page's connection test if that is quicker) to cover the
     oauth-provider and cimd plugins.
- Commit: "Update better-auth to 1.7.4 and relax the account issuer
  column".

### 5. Remaining in-range updates

- `npm update @mantine/core @mantine/hooks zod happy-dom @types/react
  @types/react-dom`. Do **not** include `@blocknote/server-util` here;
  it moves in step 6 with its siblings.
- If `@types/react` 19.3.0 produces type errors against React 19.2.8,
  pin `@types/react` and `@types/react-dom` to `~19.2.0` in
  `package.json` instead of fixing code.
- Commit: "Update Mantine, zod, happy-dom and React types".

### 6. BlockNote 0.54.0 → 0.54.2

- Edit the seven `@blocknote/*` entries in `package.json` to `0.54.2`
  (exact, matching the existing convention; `server-util` keeps its
  caret), `npm install`.
- `npm ls jsdom` must still resolve to 26.1.x under `server-util`
  (the override). Then the Vercel-runtime check from memory:

  ```sh
  node --no-experimental-require-module -e "import('@blocknote/server-util').then(() => console.log('ok'))"
  ```

- Content and export tests are the gate (`guide-content.test.ts`,
  `guide-export.test.ts`, `content-diff.test.ts`, `mcp/shape.test.ts`).
  A DOCX bullet-symbol expectation may change; update the expectation
  only after eyeballing the exported file.
- `CONTENT_VERSION` in `src/lib/guide-content.ts` stays at 1 unless the
  accepted block shape changed (nothing in 0.54.1/0.54.2 suggests it
  did).
- Manual: open a guide in the editor, type, add a table and a Mermaid
  diagram, save; export DOCX and PDF; create a draft through the MCP
  `create_draft` tool (Markdown → blocks) and open it.
- Commit: "Update BlockNote to 0.54.2".

### 7. Next.js 16.3.3 → 16.3.5

- Set `next` and `eslint-config-next` to `16.3.5`, `npm install`.
  `react`/`react-dom` stay at 19.2.8 (Q4).
- Read `node_modules/next/dist/docs/` for any deprecation notice that
  applies to `src/proxy.ts`, `next.config.ts` or the route handlers, per
  AGENTS.md.
- `npm run build` and `npm start`; click through sign-in, a space, a
  guide, the `/a/{shortId}` redirect and its `/qr` page, and one API
  route. `next dev` may rewrite the AGENTS.md block; commit that with
  the bump if it changes.
- Commit: "Update Next.js to 16.3.5".

### 8. Wrap up

- Full verification checklist once more on the final tree.
- Update this file's status line with the date, the final
  `npm audit` result and anything that deviated from the steps.
- Commit: "Record the September 2026 dependency audit results". No push.

## Verification (after every step)

```sh
npm run lint
npx tsc --noEmit
npm test
npm audit
npm ls 2>&1 | grep -i "invalid\|missing\|ERR" || echo "tree ok"
npm run build
```

Plus the step-specific manual checks listed inline. Expected end state:
lint and tsc clean, 195 tests passing (plus or minus any export-test
expectation updated in step 6), `npm audit` at 0 (or at 4 moderate with
the esbuild acceptance note if Q1 chooses to skip the override), and
`npm ls` with no invalid entries.

## Open questions

1. **esbuild override (step 3).** Recommended: add the nested override.
   It carries no runtime risk because nothing loads that copy, and it
   keeps `npm audit` at zero so future real findings are not lost in
   noise. Alternative: skip it and document the acceptance.
   Answer: take the recommendation
2. **Account lookup index (step 4).** After dropping the
   `(issuer, account_id)` unique index, add a plain (non-unique) index on
   `(provider_id, account_id)`? Recommended yes; it is what better-auth
   queries on each sign-in. The upgrade guide does not ask for it and
   1.6 did not have one, so "no index" is also defensible for a table
   this small.
   Answer: take the recommendation
3. **Deferred majors.** Confirm eslint 10, vitest 5, TypeScript 7,
   React 19.3, `@types/node` 22 and drizzle 1.0 are out of scope here and
   get their own plan.
   Answer: confirmed
4. **React 19.3.0 alongside Next 16.3.5?** Recommended no: keep
   `react`/`react-dom` at 19.2.8, the line Next 16.3.x was released
   against, and move React in the deferred-majors plan.
   Answer: take the recommendation
