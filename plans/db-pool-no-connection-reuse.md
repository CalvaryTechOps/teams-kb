# Plan: Stop reusing Neon WebSocket connections across serverless invocations

**Status: implemented locally on `feat/db-pool-no-connection-reuse`
(2026-09-08); awaiting Chris's local testing, then push and PR.**
Verified: lint, typecheck, tests and build pass; a direct pool check against
the `development` DB branch showed zero clients retained after single
queries, parallel queries, a committed transaction and a rolled-back one,
with both queries inside a transaction on the same backend PID. The signed-in
UI paths (guide save, admin action) need SAML SSO and were not exercised.

## Problem

On 2026-09-08 a guide edit in production failed with a generic server
error. Vercel's runtime logs for the deployment that was live at the time
show every request on one function instance failing from 16:10 to 16:24 UTC
with:

```
Error: Failed query: select … from "oauth_resource" where "identifier" = $1
  [cause]: Error: Connection terminated unexpectedly
```

The `oauth_resource` lookup is simply the first query better-auth runs on
any request, so it is the first to trip; the save itself (a POST to the
guide's `/edit` route) returned 500 for the same reason. The instance never
recovered on its own. A chore PR merged at 16:25 UTC triggered a redeploy,
which replaced the instance, and everything worked again.

This is chronic, not a one-off. The same failure appears seven more times in
the three days of logs Vercel retains, on ordinary page loads after quiet
periods, logged as `⨯ unhandledRejection: Error: Failed query …` with a
WebSocket close code 1006 (abnormal closure) as the cause. Those requests
still rendered because the query was a fire-and-forget inside better-auth;
on 2026-09-08 an awaited query hit the dead socket instead.

Neon's status page shows no incident for the region on either day.

Root cause: `src/db/index.ts` creates one `Pool` from
`@neondatabase/serverless` at module scope, over WebSocket (`ws`), and every
invocation reuses it:

```ts
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
```

Vercel freezes an idle function between invocations. While frozen, the
WebSocket behind an idle pooled client is closed by the other side, but no
`close`/`error` event is delivered until the function thaws, and the pool
hands that client to the next query. Neon's own driver README is explicit
about this: Pool and Client "must be connected, used and closed within a
single request handler. Don't create them outside a request handler; don't
create them in one handler and try to reuse them in another."

What exists and matters here:

- `db` is imported from `@/db` by 39 files: pages, server actions, `src/lib/*`
  helpers, `src/lib/auth.ts` (which hands it to better-auth's
  `drizzleAdapter(db, …)` at module load), and the daily cron
  (`src/app/api/cron/graph-sync/route.ts`, `maxDuration = 300`).
- Ten modules use `db.transaction(async (tx) => …)` (see the
  `neon-http-driver` plan for the list). A transaction checks one client
  out of the pool for the whole callback.
- `@neondatabase/serverless`'s `Pool` is node-postgres's pool, so it accepts
  `maxUses`, `idleTimeoutMillis`, `connectionTimeoutMillis` and emits
  `error` for idle clients (`node_modules/@neondatabase/serverless/index.d.ts`).
- `drizzle.config.ts` uses `DATABASE_URL_UNPOOLED` and is unaffected.
- The related `neon-http-driver` plan is the faster-per-request alternative;
  this plan is the smaller change and is meant to ship first.

## Design

Goal: no WebSocket connection outlives the invocation that opened it, without
changing the 39 import sites or the shape of `db`.

A literal "new Pool per request, `pool.end()` in `finally`" would need a
request-scoped store to hand the same pool to code deep in `src/lib/*` and to
better-auth, and Next gives no single hook that covers Server Components,
server actions, route handlers and the cron. The equivalent behaviour is
available on the existing module-scope pool:

- `maxUses: 1` — a client is destroyed when it is released, so the pool never
  holds an idle client and never reuses a socket across invocations. A
  `db.transaction` callback is one checkout, so all of its queries still
  share one connection.
- `connectionTimeoutMillis` (proposed 10 000) — a WebSocket handshake that
  hangs fails fast with a clear error instead of consuming the route's whole
  `maxDuration`.
- `pool.on("error", …)` — log rather than crash if an idle-client error is
  ever emitted (belt and braces; with `maxUses: 1` there are no idle
  clients).
- A comment in `src/db/index.ts` citing Neon's single-request rule so the
  settings are not "tidied away" later.

Cost: every query pays a WebSocket connect plus authentication instead of
reusing a warm socket. Pages that issue several queries will be somewhat
slower; this is the accepted trade-off for correctness. If it is noticeable,
the `neon-http-driver` plan removes the handshake entirely.

Rejected alternatives:

- **Retry once on "Connection terminated unexpectedly".** Masks the bug,
  still leaves zombie clients in the pool, and a retry inside a transaction
  is unsafe.
- **Short `idleTimeoutMillis`.** Timers do not run while the function is
  frozen, so the idle client is still there on thaw.
- **Bigger `maxDuration` / more memory.** Unrelated to the failure.

## Steps

1. Branch `feat/db-pool-no-connection-reuse` off `main`.
2. Edit `src/db/index.ts`: pass `maxUses: 1` and `connectionTimeoutMillis`
   to `new Pool(...)`, attach the `error` listener (log with a stable
   prefix, e.g. `db pool`), and add the explanatory comment.
3. Confirm `ws` remains the WebSocket constructor and nothing else in `src/`
   constructs its own `Pool` or `Client` (today nothing does).
4. Add a short note to `README.md`'s database section (if one exists)
   explaining why the pool never reuses connections, pointing at Neon's rule.
5. Local verification against the Neon `development` branch: `npm run lint`,
   `npx tsc --noEmit`, `npm test`, `npm run build`; then `npm run dev` and
   exercise a page load, a guide edit and save, one transactional admin
   action (e.g. create a category), sign-in, and a `POST /api/mcp` tool call.
6. Commit on the feature branch. (No push — Chris tests and asks.)

How we will know it worked, after Chris merges: `vercel logs --environment
production --level error --since 3d` should show no `Connection terminated
unexpectedly` or `unhandledRejection: Error: Failed query` entries over the
following week.

## Open questions

1. `connectionTimeoutMillis`: 10 s as proposed, or shorter? Neon compute on
   the free/launch tiers can take a few seconds to wake from suspend, so
   anything under ~5 s risks false failures on the first request after a
   quiet period.
   Answer: let's stick with the proposed 10 s
2. The daily graph-sync cron runs many queries in one 5-minute invocation.
   With `maxUses: 1` each is a fresh connection. Acceptable (it is a
   background job), or should the cron open a single dedicated `Client` for
   its run? Recommendation: accept for now; revisit only if the cron's
   duration grows noticeably.
   Answer: accept for now
3. Neon also offers `neonConfig.poolQueryViaFetch = true`, which routes
   non-transaction `pool.query` calls over HTTP and leaves only transactions
   on WebSocket. It is marked experimental in the driver's types. Prefer the
   plain `maxUses: 1` approach here and keep HTTP for the dedicated plan, or
   try the flag instead? Recommendation: `maxUses: 1`; it is documented,
   boring, and has one failure mode.
   Answer: go with the recommended maxUses: 1
