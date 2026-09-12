# Plan: Drizzle ORM and drizzle-kit 1.0

**Status: blocked (planned 2026-09-12, deferred from the
dependency-audit-2026-09 plan). Waits for a stable 1.0.0 — see "Entry
condition".**

## Context

`drizzle-orm` 0.45.2 and `drizzle-kit` 0.31.10 are the last stable line.
1.0 has been in pre-release since early 2025: `1.0.0-rc.4` on 2026-06-27,
`rc.5` pre-builds through 2026-09-09, roadmap at "98%". Nothing in 0.45 /
0.31 is broken for us, so there is no reason to adopt a release candidate.

Why do it eventually:

- drizzle-kit 1.0 drops the retired `@esbuild-kit/esm-loader` (its rc
  depends on `jiti` and `esbuild ^0.25` instead), so the
  `@esbuild-kit/core-utils` override added in the dependency-audit plan
  can go.
- The 0.x line will stop receiving fixes once 1.0 lands.

Known breaking changes from the rc notes and docs (verify against the
final upgrade guide at <https://orm.drizzle.team/docs/upgrade-v1>,
<https://orm.drizzle.team/docs/v0-v1-changes> and
<https://orm.drizzle.team/docs/relations-v1-v2>):

| Change | Effect here |
| --- | --- |
| Casing control moves from the `db` instance to table/schema level | we do not set `casing`; every column has an explicit name ✓ |
| Relational query builder v1 (`db.query.*`) removed | not used (0 hits) ✓ |
| `relations()` → relations v2 (`defineRelations`) | 4 `relations()` definitions in `src/db/auth-schema.ts`; better-auth's drizzle adapter (1.7.4) validates against relations v2, so migrating them is required, not optional |
| New codec layer for type mapping | watch `timestamp`/`jsonb` round-trips in tests |
| drizzle-kit snapshot / journal format | may need `drizzle-kit up` on `drizzle/meta`; the Vercel build runs `migrate`, so the journal must stay readable by the new kit **and** produce no spurious diff |
| Driver packages / `neon-http` + `neon-serverless` | `src/db/index.ts` (HTTP) and `src/db/transaction.ts` (WebSocket, per call) both need re-checking; see `plans/completed/neon-http-driver.md` and `db-pool-no-connection-reuse.md` for why they are shaped this way |
| ESM/CJS packaging | Vercel's runtime rejects `require(esm)` chains (the reason for the jsdom override in `package.json`); confirm 1.0's CJS build or that Next bundles it |

## Entry condition

```sh
npm view drizzle-orm dist-tags.latest   # 1.0.x, not 0.45.x
npm view drizzle-kit dist-tags.latest
```

plus a published upgrade guide covering kit's migration-folder changes.

## Steps

1. Branch `feat/drizzle-1`. Read the final upgrade guide; update the
   table above with anything new before touching code.
2. `npm install drizzle-orm@^1 && npm install -D drizzle-kit@^1`. Remove
   the `@esbuild-kit/core-utils` override; `npm audit` must stay at 0 and
   `npm ls esbuild` must show no 0.18.
3. Migrate `relations()` to v2 in `src/db/auth-schema.ts` and anywhere
   drizzle-kit's guide says; keep table definitions untouched.
4. `npx drizzle-kit up` if the guide calls for it, then
   `npx drizzle-kit generate`: expected result is **no schema changes**.
   Any generated diff means a definition changed meaning and must be
   understood, not applied.
5. `npx drizzle-kit migrate` against the `development` branch (no-op
   expected). `npm test` with attention to `src/db/transaction.test.ts`.
6. `npm run build`, then `npm start` and exercise sign-in (better-auth
   through the adapter), a guide save (transaction path) and the MCP
   discovery endpoints.
7. Vercel-runtime check: `node --no-experimental-require-module -e
   "import('drizzle-orm/neon-http').then(() => console.log('ok'))"`.
8. Commit. No push.

## Open questions

1. Relations v2 and better-auth: does the adapter need the relations at all
   for this schema, or can they be deleted instead of migrated? Decide
   from the 1.7.x adapter docs when the plan starts.
