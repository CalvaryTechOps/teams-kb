# Plan: Move the app's default database handle to Neon's HTTP driver

**Status: complete — implemented on `feat/neon-http-driver` (2026-09-09),
tested by Chris locally and on staging; awaiting the PR to `main`.**
Executed to fix the 2026-09-09 production crashes: better-auth's init query
timed out waiting for a WebSocket connection during bursts of parallel
renders, and the unhandled rejection exited the function.

Implementation notes: eleven files (the plan's ten plus
`src/app/admin/theme/actions.ts`, added since) and 24 call sites moved to
`withTransaction`; none were converted to `db.batch`. `src/lib/moves.ts`'s
`Db` type became drizzle's driver-agnostic `PgDatabase<PgQueryResultHKT,
typeof schema>` because a union of the HTTP database and the WebSocket
transaction breaks `.returning()` overload resolution. Verified locally with
lint, typecheck, tests, build, a script running both handles against the
Neon `development` branch, and dev-server requests to `/sign-in`,
`/.well-known/oauth-protected-resource` and `/api/auth/ok`; the signed-in
flows in step 6 (guide save, admin actions, MCP `create_draft`) are left for
Chris's manual pass.

## Problem

The `db-pool-no-connection-reuse` plan fixes stale WebSocket connections by
destroying every pooled client after one use. That is correct on serverless
but means each query pays a WebSocket connect plus authentication. Neon's
HTTP driver (`neon()` from `@neondatabase/serverless`, with
`drizzle-orm/neon-http`) sends each query as one HTTPS request: no
handshake to keep alive, nothing to go stale between invocations, and it is
safe to create once at module scope — which is exactly how `db` is used
today. Neon's README recommends it for single queries and reserves
`Pool`/`Client` for "session or interactive transaction support".

The one thing the HTTP driver cannot do is an interactive transaction:
`drizzle-orm/neon-http`'s `transaction()` throws `No transactions support in
neon-http driver`. It does offer `db.batch([...])`, which runs a list of
statements in one round trip, atomically, but later statements cannot use
earlier results.

What exists and matters here:

- `src/db/index.ts` exports a single `db` built from a WebSocket `Pool`;
  39 files import it.
- `drizzle-orm/neon-http` is already installed (`node_modules/drizzle-orm/
  neon-http`); `@neondatabase/serverless` provides both `neon()` and `Pool`.
- Interactive transactions (`db.transaction(async (tx) => …)`) live in ten
  modules:
  - `src/lib/guide-writes.ts` (`createGuideWithFirstRevision`: inserts a
    guide, then a revision that needs the guide's id, then updates the guide
    — genuinely dependent writes)
  - `src/lib/moves.ts`
  - `src/lib/graph-sync.ts` (the daily cron's group/member sync)
  - `src/app/(kb)/spaces/actions.ts`
  - `src/app/admin/settings/actions.ts`
  - `src/app/admin/all-staff-requests/actions.ts`
  - `src/app/admin/spaces/actions.ts`
  - `src/app/admin/mcp/actions.ts` (four call sites)
  - `src/app/admin/deletion-requests/actions.ts` (two call sites)
  - `src/app/admin/tags/actions.ts`
- better-auth's drizzle adapter (`node_modules/better-auth/dist/adapters/
  drizzle-adapter/index.mjs`) issues no transactions, so
  `drizzleAdapter(db, …)` works unchanged on the HTTP driver.
- `drizzle.config.ts` (migrations) uses its own direct connection and is
  unaffected.

## Design

Two handles, each used where it fits:

- **`db` becomes the HTTP driver.** `src/db/index.ts` exports
  `db = drizzle(neon(process.env.DATABASE_URL), { schema })` from
  `drizzle-orm/neon-http`. Every plain query in the 39 importing files keeps
  working without edits. better-auth keeps receiving `db`.
- **`withTransaction(fn)` for interactive transactions.** A new helper in
  `src/db/transaction.ts` opens a Neon WebSocket `Client` for the duration of
  one call — connect, run `drizzle(client, { schema }).transaction(fn)`,
  `client.end()` in `finally` — which is precisely Neon's "connect, use and
  close within a single request handler" rule, applied only where a
  transaction is actually needed. The `tx` passed to `fn` is a
  `PgTransaction` over the same schema, so callback bodies do not change.
  Neon's `neonConfig.webSocketConstructor = ws` moves here.
- **Ten call sites** change from `db.transaction(async (tx) => …)` to
  `withTransaction(async (tx) => …)`. Where a transaction's statements are
  independent (no statement reads an earlier one's result) it may instead
  become `db.batch([...])` on the HTTP driver — decide per site during
  implementation, defaulting to `withTransaction` because it changes the
  least.
- The cron's `graph-sync` runs one `withTransaction` per batch of changes
  today; that stays. Its many plain reads move to HTTP, which is fine for a
  background job.

Type note: `db` changes from `NeonDatabase` to `NeonHttpDatabase`. Any helper
typed against the old class needs the new type or, better, drizzle's
driver-agnostic `PgDatabase`. Known site: `src/lib/moves.ts` exports
`type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]`,
which must become a union of the HTTP database and the transaction type that
`withTransaction` passes to its callback (grep for `typeof db` and
`NeonDatabase` for others).

Rejected alternatives:

- **HTTP for everything, batching all transactions.** `createGuideWithFirst
  Revision` and the move/deletion flows need earlier results; forcing them
  into batches means client-generated ids and a riskier rewrite for no
  latency gain on those rare writes.
- **Keep the WebSocket pool and enable `neonConfig.poolQueryViaFetch`.**
  Similar effect with less code, but the flag is marked experimental in the
  driver's types and mixes both transports behind one handle, which makes
  failures harder to reason about.

## Steps

1. Branch `feat/neon-http-driver` off `main`, with the
   `db-pool-no-connection-reuse` plan already merged (this plan supersedes
   its pool settings but keeps its `connectionTimeoutMillis` idea for the
   transaction client).
2. `src/db/index.ts`: switch `db` to `drizzle-orm/neon-http` over `neon()`.
   Keep the schema export and the comment about serverless connections.
3. Add `src/db/transaction.ts` with `withTransaction`, using a per-call
   WebSocket `Client` (`connectionTimeoutMillis` as in the earlier plan) and
   `finally { await client.end() }`.
4. Replace the ten `db.transaction` call sites with `withTransaction`
   (or `db.batch` where every statement is independent — note each decision
   in the commit message). Fix any type references to the old `db` class.
5. Tests: add a vitest for `withTransaction` that verifies the client is
   ended on success and on a thrown error (mock `@neondatabase/serverless`'s
   `Client`). Existing tests that mock `@/db` need only the same export
   names.
6. Local verification against the Neon `development` branch: `npm run lint`,
   `npx tsc --noEmit`, `npm test`, `npm run build`; then `npm run dev` and
   exercise sign-in, a page load, guide create + edit + save (covers
   `createGuideWithFirstRevision`), one admin action from each changed
   file, and a `POST /api/mcp` tool call including `create_draft`.
7. Commit on the feature branch. (No push — Chris tests and asks.)

How we will know it was worth it, after Chris merges: compare the Vercel
function duration for a guide page and for `/api/mcp` over a few days before
and after (Vercel dashboard → Observability, or `vercel logs --json` and
the `duration` field where present).

## Open questions

1. What latency difference would justify doing this at all? Suggest: only
   if typical guide-page or MCP tool-call time grows by more than roughly a
   quarter after the pool plan ships, as judged from Vercel's function
   duration charts.
   Answer: the suggested growth of roughly a quarter after the pool plan ships.
2. `withTransaction` everywhere (recommended: least change), or convert the
   independent-statement transactions to `db.batch` while we are in there?
   Answer: yes to the recommendation
3. Should the daily graph-sync cron keep one WebSocket `Client` for its
   whole run instead of one per `withTransaction` call? It is a background
   job, so the recommendation is no unless its runtime becomes a problem.
   Answer: no, we can revisit if there are issues
